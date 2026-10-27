"""Package the user's PDF cases and explicitly curated name facts; no model extraction.
Run from repository root. Originals and template folders are never modified.
"""
import copy
import hashlib
import json
import re
import shutil
from pathlib import Path
from pypdf import PdfReader
from legacy.verify_review_packet_v1 import verify

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/examples'
AS_OF = '2026-10-26'

KINDS = {'spouse', 'child'}

def person(name, relationship):
    kind = relationship if relationship in KINDS else 'other'
    return dict(id=name.lower().replace(' ', '-'), name=name, relationship=relationship, relationshipKind=kind, status='living', note='Named in the supplied PDFs.')

def asset(case, i, name, kind, document, value=0, owner='', beneficiary='', route='Unknown', character='unknown'):
    return dict(id=f'case{case}-asset-{i}', name=name, type=kind, governing_document=document, value=value, owner=owner, beneficiary=beneficiary, route=route, character=character, retirementKind='ira' if 'IRA' in name else 'retirement_401k', note='Document-based prefill. '+('Value not supplied; 0 is a placeholder, not a valuation.' if not value else 'Value transcribed from the PDF inventory; not independently valued.'))

def main():
    OUT.mkdir(exist_ok=True, parents=True)
    for case in (1, 2, 3):
        originals=sorted((ROOT/f'Estate_Test_Cases/Case{case}').glob('*.pdf'))
        assert len(originals)==(6 if case==3 else 5)
        docs=[]
        for original in originals:
            # Demo copies the user authorized; the originals stay unchanged.
            source=OUT/'pdfs/Case2_Certificate_Demo_Discrepancy.pdf' if case==2 and '_05_' in original.name else OUT/'pdfs/Case2_Trust_Demo_Former_Spouse.pdf' if case==2 and '_01_' in original.name else original
            destination=OUT/'pdfs'/source.name
            if source!=destination: shutil.copyfile(source,destination)
            pages=[dict(page=i+1,text=p.extract_text()) for i,p in enumerate(PdfReader(source).pages)]
            kind='Will' if 'Will' in original.name and 'Healthcare' not in original.name else 'Revocable trust' if 'Revocable_Living' in original.name else 'Beneficiary designation' if 'Beneficiary_Designation' in original.name else 'Titling record' if 'Deed' in original.name else 'Other'
            docs.append(dict(id=original.stem,title=original.stem.split('_',2)[2].replace('_',' ')+(' (demo discrepancy)' if source!=original else ''),kind=kind,date=('2026-11-12' if case==2 else '2026-11-15' if case==3 else ''),source='user_supplied',sha256=hashlib.sha256(source.read_bytes()).hexdigest(),pages=pages,pdfPath='examples/pdfs/'+source.name))
        # Example client answers, prepared from the PDFs. Demo discrepancies the user authorized:
        # Case 1 executor, Case 2 executor, Case 3 trustee (see docs/demo-scenarios.md).
        q=dict(clientName='',asOf=AS_OF,marriages=[],intended_beneficiaries=[],documents_available=[],household='',respondent='',maritalStatus='Married',spouse='',state='Texas',events=[],people=[],assets=[],executor='',trustee='',agent='',intentions='',concerns='Example household for demonstration. Answers were prepared from the supplied PDFs; marriage history is the client’s answer and is not stated in the documents.',reviewed=True)
        q['respondent']=f"{'Arthur Pendelton' if case==1 else 'Richard Sterling Montgomery' if case==2 else 'Victoria H. Thorne'} (example client)"
        if case==1:
            q.update(clientName='Arthur Pendelton',household='Pendelton household',spouse='Eleanor Vance Pendelton',executor='Graham M. Pendelton',agent='Eleanor Vance Pendelton',intentions='Provide for Eleanor first, with Chloe and Liam as contingent beneficiaries; confirm against the client’s current wishes.')
            q['people']=[person(n,r) for n,r in [('Eleanor Vance Pendelton','spouse'),('Chloe Pendelton','child'),('Liam Pendelton','child'),('Graham M. Pendelton','brother'),('Clara Vance','sister-in-law')]]
            specs=[('742 Evergreen Terrace','Real estate',1),('Lone Star State Bank checking/savings x4091','Bank account',2),('Austin Capital brokerage x8832','Investment account',2),('Apex Global 401(k) x3104','Retirement account',2),('Vanguard Traditional IRA x9012','Retirement account',2),('Texas Mutual term life x7755','Life insurance',2)]
            q['assets']=[asset(case,i,n,t,docs[d]['id'],owner=q['clientName'],beneficiary=q['spouse'],route='Beneficiary designation') for i,(n,t,d) in enumerate(specs)]
            q['intended_beneficiaries']=[dict(name=q['spouse'],share='100%',note='Primary beneficiary; contingent children are recorded in the documents.')]
            q['documents_available']=['will','beneficiary_designation','titling_record','other']
        elif case==2:
            q.update(clientName='Richard Sterling Montgomery',household='Montgomery household',spouse='Eleanor Vance Montgomery',executor='Julian M. Montgomery',trustee='Julian M. Montgomery',agent='Eleanor Vance Montgomery',events=['Health or care needs'],intentions='Provide for the surviving spouse and the blended family, with staggered distributions and a special-needs trust for Ethan.')
            q['people']=[person(n,r) for n,r in [('Eleanor Vance Montgomery','spouse'),('Harrison Montgomery','child'),('Beatrice Vance','stepchild'),('Ethan Montgomery','child'),('Julian M. Montgomery','brother'),('Clara Vance','sister-in-law')]]
            specs=[('1042 River Oaks Blvd, Houston','Real estate',2450000,'community'),('405 Ski Run Rd, Taos','Real estate',850000,'community'),('Austin Capital joint brokerage x8841','Investment account',1200000,'community'),('Richard Vanguard brokerage x3302','Investment account',650000,'separate'),('Eleanor Fidelity investments x9104','Investment account',500000,'separate')]
            q['assets']=[asset(case,i,n,t,docs[0]['id'],v,route='Revocable trust',character=c) for i,(n,t,v,c) in enumerate(specs)]
            q['documents_available']=['revocable_trust','will','other']
        else:
            q.update(clientName='Victoria H. Thorne',household='Thorne household',spouse='Alistair C. Thorne',trustee='Alistair C. Thorne',intentions='Coordinate family business succession, multigenerational trusts, estate liquidity, and charitable giving. Confirm each trust’s distinct roles and terms.')
            q['people']=[person(n,r) for n,r in [('Alistair C. Thorne','spouse'),('Julian Thorne','child'),('Clara Thorne','child'),('Samuel T. Sterling','independent trustee')]]
            flp=asset(case,0,'Thorne Holdings, L.P. 39% Class B LP units','Business interest',docs[0]['id'],5850000,owner='Victoria H. Thorne Revocable Trust',route='Revocable trust')
            flp['note']='Document-based prefill. Value is the contributed asset value on FLP Schedule A, not a current valuation.'
            q['assets']=[flp,asset(case,1,'Thorne Enterprises, Inc. shares (500 Class A, 4,500 Class B)','Business interest',docs[4]['id'],owner='Victoria H. Thorne')]
            q['documents_available']=['other']
            q['concerns']+=' Automatic comparison covers executor, trustee, beneficiary, and owner names; partnership, tax, insurance, and charitable terms in these agreements are not compared.'
        # Marriage history is questionnaire-only (user-requested former spouses, 2026-10-26).
        q['marriages']={
            1:[dict(spouse='Rebecca Lane',married='2001-05-19',ended='2004-08-30',how_ended='divorce'),dict(spouse=q['spouse'],married='2006-09-16',ended='',how_ended='')],
            2:[dict(spouse='Diane Whitaker Montgomery',married='2002-04-20',ended='2010-11-05',how_ended='divorce'),dict(spouse=q['spouse'],married='2013-06-08',ended='',how_ended='')],
            3:[dict(spouse=q['spouse'],married='',ended='',how_ended='')],
        }[case]
        if case<3:
            q['people'].append(person(q['marriages'][0]['spouse'],'former spouse'))
            q['events'].append('Divorce')
        facts=[]
        def capture(doc_index, page, pattern, field, subject='household'):
            d=docs[doc_index];text=d['pages'][page-1]['text'];m=re.search(pattern,text,re.S);assert m,(d['id'],pattern)
            value=' '.join(m.group(1).split())
            facts.append(dict(id=f'case{case}-fact-{len(facts)}',documentId=d['id'],subjectId=subject,field=field,value=value.title() if value.isupper() else value,quote=m.group(0),page=page,verification='unverified'))
        if case==1:
            # The quote runs through the alternate so the reviewer sees both named roles.
            capture(0,2,r'Section 5.01 Nomination of Executor\. I nominate and appoint (.*?), of\s+Austin, Texas, as Independent Executor of this my Last Will and Testament\. If .*? as Alternate Independent Executor\.','executor')
            capture(1,1,r'I designate the following person as Primary Beneficiary to receive all of my right, title, and\s+interest in the described real property upon my death:\s+• Full Legal Name: (Eleanor Vance Pendelton)','beneficiary','case1-asset-0')
            for i,row in enumerate([r'Lone Star State\s+Bank\s+Checking/Saving\s*s\s+x\[4091\] POD \(Payable\s+on Death\)',r'Austin Capital\s+Brokerage\s+Individual\s+x\[8832\] TOD \(Transfer\s+on Death\)',r'Apex Global\s+Employer 401\(k\)\s+x\[3104\] Plan Beneficiary',r'Vanguard\s+Traditional IRA\s+x\[9012\] Plan Beneficiary',r'Texas Mutual\s+Term Life Policy\s+x\[7755\] Policy\s+Beneficiary'],1):
                capture(2,1,row+r'\s+(Eleanor Vance\s+Pendelton)\s+\(100%\)','beneficiary',f'case1-asset-{i}')
        if case==2:
            capture(1,2,r'Section 5.01 Executor Designation\. I nominate and appoint (.*?) as\s+Independent Executor of this Pour-Over Will, and .*? as Successor\s+Independent Executor','executor')
            capture(0,3,r'1\. First Successor Trustee: (.*?), Austin, TX','trustee')
            capture(4,2,r'4\. Successor Trustee\(s\): (.*?); Clara Vance\.','trustee')
            capture(0,2,r'Section 4\.02 Specific Gift\. Grantor 1’s Vanguard account x3302 shall pass to (Diane\s+Whitaker Montgomery), spouse of Grantor 1\.','beneficiary','case2-asset-3')
        if case==3:
            capture(1,1,r'(SAMUEL T\. STERLING) \(the "Independent Trustee"\)','trustee')
            capture(2,1,r'(SAMUEL T\. STERLING) as Distribution Trustee','trustee')
            capture(3,1,r'(SAMUEL T\.\s+STERLING) \(the "Trustee"\)','trustee')
            capture(5,1,r'(SAMUEL T\. STERLING) \(Trustee\)','trustee')
        packet=verify(dict(schemaVersion=1,documents=docs,facts=facts))
        assert all(f['verification']=='verified' for f in packet['facts'])
        w=dict(version=1,questionnaire=q,packet=packet,dispositions={},backend=None)
        if case==1:
            baseline=copy.deepcopy(w);baseline['questionnaire']['executor']='Eleanor Vance Pendelton'
            (OUT/'case1-clean.json').write_text(json.dumps(baseline,indent=2))
        (OUT/f'case{case}.json').write_text(json.dumps(w,indent=2))
        print(f'Case {case}: {len(docs)} PDFs, {len(facts)} curated quote-checked facts')

if __name__=='__main__': main()
