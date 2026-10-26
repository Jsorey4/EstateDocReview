#!/usr/bin/env python3
"""Package freshly verified extraction records for the static advisor frontend.

Never reads household.yaml/answer keys or generates documents. Source paths and hashes
come from extract.py. The supplied workspace links assets via governing_document.
"""
import argparse
import copy
import json
from pathlib import Path

import verify_quotes as vq
from edr.pages import load_pages, file_sha256
from edr.schema import DOCUMENT_TYPES, FIELDS

KINDS = dict(zip(DOCUMENT_TYPES, ['Will', 'Revocable trust', 'Amendment', 'Beneficiary designation', 'Titling record', 'Other']))
# View aliases only; original vocabulary and verification remain attached to every fact.



def build_packet(records, workspace, public_sources=None):
    documents, facts, seen = [], [], set()
    assets = workspace['questionnaire']['assets']
    public_sources = public_sources or {}
    for original in records:
        record = copy.deepcopy(original)
        if record.get('error'):
            raise ValueError('An extraction record contains an error; resolve it before exporting')
        doc = record['document']
        doc_id = doc['id']
        if doc_id in seen:
            raise ValueError(f'Duplicate document ID: {doc_id}')
        seen.add(doc_id)
        if record.get('document_type') not in KINDS:
            raise ValueError(f'Unsupported document_type for {doc_id}')
        path = vq.resolve_path(doc['path'])
        if not path.is_file() or file_sha256(path) != doc['sha256']:
            raise ValueError(f'Source missing or changed: {doc_id}; re-extract before exporting')
        source = record.get('data_label', {}).get('kind')
        if source not in ('synthetic', 'public', 'user_supplied'):
            raise ValueError(f'Missing data label: {doc_id}')
        url = public_sources.get(doc_id)
        if source == 'public' and (not isinstance(url, str) or not url.startswith(('https://', 'http://'))):
            raise ValueError(f'Provide an original public source URL for {doc_id}')
        vq.verify_record(record)
        verified = vq.verified_facts(record)
        title = next((f['value'] for f in verified if f['field'] == 'document_title' and f['value']), doc_id)
        date = next((f['value'] for f in verified if f['field'] == 'document_date'), '')
        pages = load_pages(path)
        documents.append({'id': doc_id, 'title': title, 'kind': KINDS[record['document_type']], 'date': date,
                          'backendVerifier': record.get('verifier', {}), 'extraction': record.get('extraction', {}), 'unreadablePages': record.get('unreadable_pages', []),
                          'source': source, 'extractionSource': doc.get('source', 'digital'), 'sha256': doc['sha256'],
                          'pages': [{'page': i, 'text': text} for i, text in enumerate(pages, 1)],
                          **({'sourceUrl': url} if url else {})})
        linked = [a['id'] for a in assets if a.get('governing_document') == doc_id]
        for i, fact in enumerate(record['facts']):
            field = fact['field']
            if field not in FIELDS:
                raise ValueError(f'Unknown extraction field: {field}')
            # Never interpret an initial trustee as the intended successor trustee.
            subjects = (linked or [f'document:{doc_id}']) if field in ('primary_beneficiary', 'beneficiary', 'titled_owner') else ['household']
            for subject in subjects:
                facts.append({'id': f'{doc_id}:{i}:{subject}', 'documentId': doc_id, 'subjectId': subject,
                              'field': field, 'backendField': field, 'value': fact['value'], 'detail': fact.get('detail', ''),
                              'quote': fact['quote'], 'page': fact['page'], 'verification': fact['verification']['status'],
                              'backendVerification': fact['verification']})
    return {'schemaVersion': 2, 'verifiedBy': 'verify_quotes.py', 'documents': documents, 'facts': facts}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--workspace', required=True, type=Path, help='Frontend workspace backup JSON')
    ap.add_argument('--facts', required=True, type=Path, help='Directory of extract.py records')
    ap.add_argument('--out', required=True, type=Path)
    ap.add_argument('--public-sources', type=Path, help='JSON object mapping document IDs to public source URLs')
    args = ap.parse_args()
    try:
        files = sorted(p for p in args.facts.glob('*.json') if not p.name.startswith('_'))
        if not files:
            raise ValueError('No extraction records found')
        packet = build_packet([json.loads(p.read_text()) for p in files], json.loads(args.workspace.read_text()),
                              json.loads(args.public_sources.read_text()) if args.public_sources else None)
        encoded = json.dumps(packet, ensure_ascii=False, indent=2) + '\n'
        if len(encoded.encode()) > 8_000_000:
            raise ValueError('Review packet exceeds the 8 MB browser limit')
        with args.out.open('x', encoding='utf-8') as out:
            out.write(encoded)
        print(f'Exported {len(packet["documents"])} documents and {len(packet["facts"])} facts to {args.out}')
    except (OSError, ValueError, KeyError, TypeError) as exc:
        ap.exit(1, f'Export failed: {exc}\n')


if __name__ == '__main__':
    main()
