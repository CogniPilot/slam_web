"""Bind anchoredAdmissionProof's graph fields to decoded raw declared state (coordinator-only).
Decoding follows the reviewed read-candidate-snapshot.py exactly (little-endian named runs from the step layout), with the
epoch list taken from the sealed snapshot plan instead of Phase A's fixed list. ENABLED edges only (Vale r3 note): an edge
slot counts only when graph.edges.enabled is 1, never because a removed slot happened to be cleared.
Usage: python3 -I phase_b_state_binding.py PREVIOUS_DECODED.json NEXT_DECODED.json NEW_KEYFRAME_ID  ->  graph JSON on stdout
(each input is the reader's output for the same epoch, sides previous and next)."""
import json, sys
E='estimator.localization.graph.edges.'
def ints(d,name):
    v=d['values'][name]; assert v['lane'] in ('i64','u8'), name
    return [int(x) for x in v['decimalStrings']] if v['lane']=='i64' else list(v['values'])
def graph(previous,nxt):
    assert previous['epoch']==nxt['epoch'] and previous['side']=='previous' and nxt['side']=='next'
    enabled,kind,ref,cur=(ints(nxt,E+n) for n in ('enabled','kind','referenceId','currentId'))
    assert len({len(enabled),len(kind),len(ref),len(cur)})==1
    edges=[dict(kind=k,referenceId=r,currentId=c) for e,k,r,c in zip(enabled,kind,ref,cur) if e==1]
    return dict(lastCaptureId=ints(nxt,'estimator.localization.graph.lastCaptureId')[0],
        # Source condition for the sequential/anchored branch is `not reset and previousCatalog.nextId > 1`.
        reset=ints(nxt,'estimator.localization.graph.generation')[0]!=ints(previous,'estimator.localization.graph.generation')[0],
        firstCapture=ints(previous,'estimator.localization.catalog.nextId')[0]<=1,
        edges=edges,epoch=nxt['epoch'],scope='Decoded saved state; enabled edges only; coordinator-only until labels are sealed.')
NEEDED=[E+n for n in ('enabled','kind','referenceId','currentId')]+['estimator.localization.graph.lastCaptureId',
        'estimator.localization.graph.generation','estimator.localization.catalog.nextId']
if __name__=='__main__':
    if len(sys.argv)!=4: raise SystemExit(__doc__)
    p,n=(json.load(open(a)) for a in sys.argv[1:3])
    out=graph(p,n); out['newKeyframeId']=int(sys.argv[3]); print(json.dumps(out,indent=1))
