"""Integration with the backend's existing placeholder fixtures; no new document corpus."""
import copy
import pytest
from pipeline import extract
from bridge.facts_to_review_packet import build_packet
from bridge.workspace_to_inputs import build_inputs
from tests.test_extract import FakeClient, message, tool_call, GOOD_FACTS


def record(household_dir, tmp_path):
    return extract.extract_document(household_dir/'docs/will.txt', client_factory=lambda:FakeClient(message([tool_call(GOOD_FACTS)])),
        model=extract.DEFAULT_MODEL,effort='high',mode='text',source='digital',use_cache=False,cache_dir=tmp_path/'cache')


def test_native_verification_preserved(household_dir,tmp_path):
    r=record(household_dir,tmp_path)
    packet=build_packet([r],{'questionnaire':{'assets':[]}})
    assert packet['schemaVersion']==2
    assert [f['verification'] for f in packet['facts']]==['verified','verified','unverified']
    assert packet['facts'][0]['backendVerification']==r['facts'][0]['verification']
    assert len(packet['documents'][0]['pages'])==2
    assert packet['documents'][0]['sha256']==r['document']['sha256']


def test_changed_document_refused(household_dir,tmp_path):
    r=record(household_dir,tmp_path)
    (household_dir/'docs/will.txt').write_text('Changed source')
    with pytest.raises(ValueError,match='changed'): build_packet([r],{'questionnaire':{'assets':[]}})


def test_successor_is_distinct_from_initial_trustee_and_assets_link(household_dir,tmp_path):
    facts=[{'field':'successor_trustee','value':'Person Gamma','detail':'','quote':'Successor Trustee: Person Gamma.','page':1},
           {'field':'beneficiary','value':'Person Beta','detail':'','quote':'Trust beneficiary: Person Beta.','page':1}]
    r=extract.extract_document(household_dir/'docs/trust.txt',client_factory=lambda:FakeClient(message([tool_call(facts,'revocable_trust')])),model=extract.DEFAULT_MODEL,effort='high',mode='text',source='digital',use_cache=False,cache_dir=tmp_path/'cache')
    p=build_packet([r],{'questionnaire':{'assets':[{'id':'asset-ui','governing_document':'trust'}]}})
    assert p['facts'][0]['field']=='successor_trustee'
    assert p['facts'][0]['subjectId']=='household'
    assert p['facts'][1]['subjectId']=='asset-ui'
    assert p['facts'][1]['field']=='beneficiary'


def test_duplicate_and_public_source_refused(household_dir,tmp_path):
    r=record(household_dir,tmp_path); w={'questionnaire':{'assets':[]}}
    with pytest.raises(ValueError,match='Duplicate'): build_packet([r,r],w)
    public=copy.deepcopy(r); public['data_label']={'kind':'public'}
    with pytest.raises(ValueError,match='public source URL'): build_packet([public],w)


def test_questionnaire_export_matches_backend_vocabulary():
    q={'clientName':'A','asOf':'2026-10-25','maritalStatus':'Single','people':[], 'marriages':[], 'assets':[
        {'id':'asset','name':'Label','type':'Retirement account','retirementKind':'ira','value':100,'character':'community','governing_document':'d'}]}
    questionnaire,assets=build_inputs({'questionnaire':q})
    assert questionnaire['client']=={'name':'A','state':'TX'}
    assert assets['assets'][0]=={'id':'asset','description':'Label','type':'ira','value_usd':100,'character':'community','governing_document':'d'}
    q['people']=[{'status':'unknown'}]
    with pytest.raises(ValueError,match='Confirm'): build_inputs({'questionnaire':q})


def test_beneficiary_notes_stay_out_of_backend_inputs():
    q={'clientName':'A','asOf':'2026-10-25','maritalStatus':'Single','people':[],'marriages':[],'assets':[],
       'intended_beneficiaries':[{'name':'B','share':'50%','note':'Advisor-only context'}]}
    questionnaire,_=build_inputs({'questionnaire':q})
    assert questionnaire['intended_beneficiaries']==[{'name':'B','share':'50%'}]
