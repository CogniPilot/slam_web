"""Download and safely unpack the pinned synthetic recording; no estimator execution."""
from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,urllib.request,tarfile,shutil,time,re,sys,contextlib

project=Path(__file__).resolve().parent.parent
pin=json.loads((project/'recorded-slam-parity.json').read_text())
root=Path(sys.argv[1]).resolve();root.mkdir(parents=True,exist_ok=False)
assert len(sys.argv)==2 or (len(sys.argv)==4 and sys.argv[2]=='--archive')
download=len(sys.argv)==2
started=time.monotonic()
with (root/'SETUP-START.json').open('x') as f:json.dump({'at':datetime.now(timezone.utc).isoformat(),'pin':pin,'preparerSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'scope':'Pinned fixture download/extraction only; no model/browser execution.'},f,indent=2)
assert pin['fixtureBytes']<=2*1024**3
assert pin['fixtureUrl']=='https://github.com/CogniPilot/slam_web/releases/download/native-slam-office-loop-repair-20261029/office-recorded-browser-parity.tar.gz'
assert shutil.disk_usage(root).free>=pin['fixtureBytes']+3200000000+512*1024**2,'Insufficient task disk space'
archive=root/'fixture.tar.gz' if download else Path(sys.argv[3]).resolve()
digest=hashlib.sha256();count=0
request=urllib.request.Request(pin['fixtureUrl'],headers={'User-Agent':'recorded-slam-parity'})
reader=urllib.request.urlopen(request,timeout=30) if download else archive.open('rb')
with reader as response,(archive.open('xb') if download else contextlib.nullcontext(None)) as out:
 while chunk:=response.read(1024**2):
  assert time.monotonic()-started<300,'Download wall limit reached'
  count+=len(chunk);assert count<=pin['fixtureBytes'],'Fixture exceeds pinned size'
  digest.update(chunk)
  if out is not None:out.write(chunk)
assert count==pin['fixtureBytes'] and digest.hexdigest()==pin['fixtureSha256'],'Fixture identity mismatch'
destination=root/'fixture';destination.mkdir();seen=set();total=0
metadata={'sensors.json','golden-node.json','golden-final-graph.json','FIXTURE.json'}
with archive.open('rb') as source,tarfile.open(fileobj=source,mode='r|gz') as tar:
 for item in tar:
  assert time.monotonic()-started<600,'Preparation wall limit reached'
  assert item.isfile() and item.name not in seen,'Unexpected archive member type/duplicate'
  match=re.fullmatch(r'office-loop/frames/(\d{4})-(rgb|depth)\.bin',item.name)
  assert item.name in metadata or (match and 0<=int(match[1])<2501),'Unexpected archive path'
  assert 0<=item.size<=16*1024**2,'Member exceeds input bound'
  total+=item.size;assert total<=3200000000,'Expanded fixture exceeds input bound'
  target=destination/item.name;target.parent.mkdir(parents=True,exist_ok=True)
  with target.open('xb') as out,tar.extractfile(item) as entry:shutil.copyfileobj(entry,out,1024**2)
  assert target.stat().st_size==item.size;seen.add(item.name)
assert len(seen)==5006
if download:archive.unlink() # Never delete a caller's offline input archive.
receipt={'at':datetime.now(timezone.utc).isoformat(),'status':'PASS','archiveSha256':digest.hexdigest(),'bytes':count,'members':len(seen),'expandedBytes':total,'wallSeconds':time.monotonic()-started,'fixture':str(destination),'scope':'Verified pinned archive before extraction; regular whitelist members only. Per-image hashes are checked again before serving them to the browser.'}
(root/'SETUP-RESULT.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
