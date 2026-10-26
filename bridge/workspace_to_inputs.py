#!/usr/bin/env python3
"""Export user-entered frontend answers to backend questionnaire.yaml/assets.yaml.

No document text, gold facts, household.yaml, or answer keys are generated.
"""
import argparse
import json
from datetime import date
from pathlib import Path
import yaml

TYPES = {'Investment account':'brokerage','Bank account':'bank','Real estate':'real_estate',
         'Life insurance':'life_insurance','Business interest':'business','Other':'other'}


def build_inputs(workspace):
    q = workspace['questionnaire']
    if not q.get('clientName', '').strip():
        raise ValueError('Client name is required for backend export')
    date.fromisoformat(q.get('asOf', ''))
    if any(p['status'] not in ('living', 'deceased') for p in q['people']):
        raise ValueError('Confirm living/deceased status for every person before backend export')
    marriages = []
    for m in q.get('marriages', []):
        married = date.fromisoformat(m['married'])
        ended = date.fromisoformat(m['ended']) if m['ended'] else None
        if not m['spouse'].strip() or (ended and (ended < married or m['how_ended'] not in ('divorce','death'))) or (not ended and m['how_ended']):
            raise ValueError('Complete spouse, marriage dates, and marriage ending consistently')
        marriages.append({**m, 'ended': m['ended'] or None, 'how_ended': m['how_ended'] or None})
    if sum(m['ended'] is None for m in marriages) > 1:
        raise ValueError('Only one current marriage can be exported')
    if q['maritalStatus'] == 'Married' and not any(m['ended'] is None for m in marriages):
        raise ValueError('Record the current marriage in marriage history')
    questionnaire = {'synthetic':True,'as_of':q['asOf'],'client':{'name':q['clientName'],'state':'TX'},
                     'marriages':marriages,'people':[{k:p[k] for k in ('name','relationship','status')} for p in q['people']],
                     'intended_beneficiaries':[{'name':b['name'],'share':b['share']} for b in q.get('intended_beneficiaries',[])],'documents_available':q.get('documents_available',[])}
    assets = {'synthetic':True,'values_are_hypothetical':True,'assets':[
        {'id':a['id'],'description':a['name'],'type':a.get('retirementKind','retirement_401k') if a['type']=='Retirement account' else TYPES[a['type']],
         'value_usd':a['value'],'character':a.get('character','unknown'),'governing_document':a.get('governing_document') or None} for a in q['assets']]}
    return questionnaire, assets


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--workspace',required=True,type=Path)
    ap.add_argument('--out',required=True,type=Path,help='New output directory (must not exist)')
    args=ap.parse_args()
    try:
        questionnaire,assets=build_inputs(json.loads(args.workspace.read_text()))
        args.out.mkdir(parents=True,exist_ok=False)
        for name,data in [('questionnaire',questionnaire),('assets',assets)]:
            (args.out/f'{name}.yaml').write_text(yaml.safe_dump(data,sort_keys=False,allow_unicode=True),encoding='utf-8')
        print(f'Wrote questionnaire.yaml and assets.yaml to {args.out}')
    except (OSError,ValueError,KeyError,TypeError) as exc:
        ap.exit(1,f'Export failed: {exc}\n')


if __name__=='__main__':
    main()
