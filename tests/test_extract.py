"""extract.py against a fake Anthropic client: no network, no API key, no cost."""
from types import SimpleNamespace

import pytest

import extract
from edr.schema import TOOL_NAME, tool_definition, validate_tool_input

UNSUPPORTED_STRICT_KEYWORDS = {"minimum", "maximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems"}


class FakeStream:
    def __init__(self, message):
        self.message = message
        self.request_id = "req_fake"

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self):
        return self.message


class FakeClient:
    def __init__(self, *messages):
        self.queue = list(messages)
        self.calls = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(stream=self._stream))

    def _stream(self, **kwargs):
        self.calls.append({**kwargs, "messages": list(kwargs["messages"])})
        return FakeStream(self.queue.pop(0))


def message(content, stop_reason="tool_use"):
    return SimpleNamespace(content=content, stop_reason=stop_reason, model="claude-opus-5-5",
                           stop_details=None, usage=SimpleNamespace(input_tokens=100, output_tokens=50, iterations=None))


def tool_call(facts, document_type="will"):
    return SimpleNamespace(type="tool_use", name=TOOL_NAME, id="toolu_fake",
                           input={"document_type": document_type, "facts": facts, "unreadable_pages": []})


GOOD_FACTS = [
    {"field": "executor", "value": "Person Gamma", "detail": "",
     "quote": "I appoint Person Gamma as Independent Executor.", "page": 1},
    {"field": "document_date", "value": "2019-03-14", "detail": "",
     "quote": "Signed this 14th day of March, 2019.", "page": 2},
    {"field": "executor", "value": "Person Omega", "detail": "",
     "quote": "I appoint Person Omega as Independent Executor.", "page": 1},
]


@pytest.fixture
def will(tmp_path):
    doc = tmp_path / "will.txt"
    doc.write_text("SYNTHETIC UNIT-TEST FIXTURE.\nI appoint Person Gamma as Independent Executor.\n"
                   "--- page break ---\nSigned this 14th day of March, 2019.\n", encoding="utf-8")
    return doc


def run(doc, client, tmp_path, **kwargs):
    options = dict(client_factory=lambda: client, model=extract.DEFAULT_MODEL, effort="high",
                   mode="text", source="auto", cache_dir=tmp_path / "cache")
    options.update(kwargs)
    return extract.extract_document(doc, **options)


def _walk(schema):
    yield schema
    for value in schema.values():
        if isinstance(value, dict):
            yield from _walk(value)


def test_tool_schema_is_strict_compatible():
    tool = tool_definition()
    assert tool["strict"] is True
    for node in _walk(tool["input_schema"]):
        assert not UNSUPPORTED_STRICT_KEYWORDS & set(node)
        if node.get("type") == "object":
            assert node["additionalProperties"] is False
            assert set(node["required"]) == set(node["properties"])


def test_validate_tool_input_catches_bad_pages():
    data = {"document_type": "will", "unreadable_pages": [], "facts": [dict(GOOD_FACTS[0], page=0)]}
    assert validate_tool_input(data) == ["facts[0].page must be a positive integer"]


def test_extraction_record_is_verified(will, tmp_path):
    client = FakeClient(message([tool_call(GOOD_FACTS)]))
    record = run(will, client, tmp_path)
    statuses = [f["verification"]["status"] for f in record["facts"]]
    assert statuses == ["verified", "verified", "unverified"]
    assert record["data_label"] == {"kind": "synthetic", "label_found": True}
    assert record["extraction"]["model_served"] == "claude-opus-5-5"
    assert record["extraction"]["request_id"] == "req_fake"


def test_request_shape_follows_the_api_constraints(will, tmp_path):
    client = FakeClient(message([tool_call(GOOD_FACTS)]))
    run(will, client, tmp_path)
    [call] = client.calls
    assert call["model"] == "claude-opus-5-5"
    assert call["tool_choice"] == {"type": "auto", "disable_parallel_tool_use": True}
    assert call["tools"][0]["strict"] is True and "eager_input_streaming" not in call["tools"][0]
    assert call["fallbacks"] == "default" and call["betas"] == [extract.FALLBACK_BETA]
    assert call["output_config"] == {"effort": "high"}
    assert "temperature" not in call
    text = call["messages"][0]["content"][0]["text"]
    assert '<page number="2">' in text and TOOL_NAME in text


def test_retries_once_when_the_model_skips_the_tool(will, tmp_path):
    prose = SimpleNamespace(type="text", text="Here are the facts...")
    client = FakeClient(message([prose], stop_reason="end_turn"), message([tool_call(GOOD_FACTS)]))
    record = run(will, client, tmp_path)
    assert record["extraction"]["attempts"] == 2
    second = client.calls[1]["messages"]
    assert [m["role"] for m in second] == ["user", "assistant", "user"]
    assert second[2]["content"] == extract.NUDGE


def test_no_tool_call_after_retries_is_an_error(will, tmp_path):
    prose = SimpleNamespace(type="text", text="No.")
    client = FakeClient(message([prose], "end_turn"), message([prose], "end_turn"))
    record = run(will, client, tmp_path)
    assert record["error"]["type"] == "extraction" and "facts" not in record


@pytest.mark.parametrize("stop_reason", ["refusal", "max_tokens"])
def test_refusal_and_truncation_are_errors(will, tmp_path, stop_reason):
    client = FakeClient(message([], stop_reason))
    assert "error" in run(will, client, tmp_path)


def test_unlabeled_document_is_extracted_and_recorded_as_user_supplied(tmp_path):
    doc = tmp_path / "plain.txt"
    doc.write_text("I appoint Person Gamma as Independent Executor.", encoding="utf-8")
    client = FakeClient(message([tool_call([])]))
    record = run(doc, client, tmp_path)
    assert record["data_label"] == {"kind": "user_supplied", "label_found": False} and len(client.calls) == 1
    labeled = run(doc, FakeClient(message([tool_call([])])), tmp_path, public_dataset="CUAD")
    assert labeled["data_label"] == {"kind": "public", "dataset": "CUAD"}


def test_cache_skips_the_api_for_an_unchanged_document(will, tmp_path):
    run(will, FakeClient(message([tool_call(GOOD_FACTS)])), tmp_path)
    client = FakeClient()
    record = run(will, client, tmp_path)
    assert client.calls == [] and record["extraction"]["cached"] is True
    assert len(record["facts"]) == 3


def test_cli_writes_records_and_logs(will, tmp_path, monkeypatch, isolated_ai_log):
    client = FakeClient(message([tool_call(GOOD_FACTS)]))
    monkeypatch.setattr(extract, "_client_factory", lambda: (lambda: client))
    monkeypatch.setattr(extract, "CACHE_DIR", tmp_path / "cache")
    out = tmp_path / "facts"
    assert extract.main([str(will), "--out", str(out)]) == 0
    assert (out / "will.json").exists() and (out / "_run.json").exists()
    assert "quote_verifier" in (isolated_ai_log / "checks.jsonl").read_text()


def test_fallback_can_be_switched_off(will, tmp_path):
    client = FakeClient(message([tool_call(GOOD_FACTS)]))
    run(will, client, tmp_path, fallback=False)
    assert "fallbacks" not in client.calls[0] and "betas" not in client.calls[0]
