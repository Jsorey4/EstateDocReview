"""Browser integration helper using the backend's existing unit-test fixture only."""
import json
import sys
import tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from conftest import FIXTURE_DOCS, write
from test_extract import FakeClient, message, tool_call, GOOD_FACTS
import extract
from export_review import build_packet

with tempfile.TemporaryDirectory() as directory:
    root=Path(directory)
    path=write(root/'will.txt',FIXTURE_DOCS['docs/will.txt'])
    record=extract.extract_document(path,client_factory=lambda:FakeClient(message([tool_call(GOOD_FACTS)])),model=extract.DEFAULT_MODEL,effort='high',mode='text',source='digital',use_cache=False,cache_dir=root/'cache')
    print(json.dumps(build_packet([record],{'questionnaire':{'assets':[]}})))
