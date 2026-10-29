"""Enforce a single recorded-browser operation's CPU/RSS/wall/output/cleanup bounds."""
from pathlib import Path
from datetime import datetime,timezone
import subprocess,os,sys,json,time,signal,resource,hashlib

project=Path(__file__).resolve().parent.parent
fixture,output,cache=map(lambda x:Path(x).resolve(),sys.argv[1:])
assert len(sys.argv)==4 and not output.exists() and not cache.exists()
output.parent.mkdir(parents=True,exist_ok=True)
receipt=output.parent/'OPERATION-START.json'
cpus=sorted(os.sched_getaffinity(0))[:2];assert len(cpus)==2,'Two allowed CPUs required'
argv=['node',str(project/'scripts/replay-recorded-slam-browser.mjs'),str(fixture),str(output),str(cache)]
pin=json.loads((project/'recorded-slam-parity.json').read_text())
sources=['scripts/run-recorded-slam-browser.py','scripts/replay-recorded-slam-browser.mjs','scripts/recorded-slam-contract.mjs','scripts/browser-launch.mjs','recorded-slam-parity.json']
sourceHashes={name:hashlib.sha256((project/name).read_bytes()).hexdigest() for name in sources}
with receipt.open('x') as f:json.dump({'at':datetime.now(timezone.utc).isoformat(),'argv':argv,'cpus':cpus,'rssMiB':5632,'wallSeconds':1200,'outputMiB':64,'fileMiB':64,'pin':pin,'sourceHashes':sourceHashes,'sandbox':True,'attempts':1},f,indent=2)
def setup():os.sched_setaffinity(0,set(cpus));resource.setrlimit(resource.RLIMIT_FSIZE,(64*1024**2,)*2)
def processes():
 rows={}
 for d in Path('/proc').iterdir():
  if not d.name.isdigit():continue
  try:
   fields=(d/'stat').read_text().rsplit(')',1)[1].split()
   if fields[0]!='Z':rows[int(d.name)]=(int(fields[1]),fields[19],int(fields[21])*os.sysconf('SC_PAGE_SIZE'))
  except (OSError,ValueError,IndexError):pass
 return rows
seen={}
def members():
 table=processes();selected={child.pid};changed=True
 while changed:
  changed=False
  for pid,(parent,start,rss) in table.items():
   if parent in selected and pid not in selected:selected.add(pid);changed=True
 for pid in selected:
  if pid in table:seen[pid]=table[pid][1]
 return [(pid,start,rss) for pid,(_,start,rss) in table.items() if seen.get(pid)==start]
started=time.monotonic();peak=0;stop=None
stdout=output.parent/'OPERATION.stdout';stderr=output.parent/'OPERATION.stderr'
with stdout.open('xb') as out,stderr.open('xb') as err:
 child=subprocess.Popen(argv,cwd=project,stdout=out,stderr=err,start_new_session=True,preexec_fn=setup)
 while child.poll() is None:
  peak=max(peak,sum(rss for _,_,rss in members()))
  written=sum(p.stat().st_size for p in output.rglob('*') if p.is_file()) if output.exists() else 0
  written+=stdout.stat().st_size+stderr.stat().st_size
  if time.monotonic()-started>=1200:stop='wall'
  elif peak>5632*1024**2:stop='rss'
  elif written>64*1024**2:stop='output'
  if stop:break
  time.sleep(.1)
 before=members()
 for pid,start,_ in reversed(before):
  if processes().get(pid,(None,None,None))[1]==start:
   try:os.kill(pid,signal.SIGKILL)
   except ProcessLookupError:pass
 code=child.wait();time.sleep(.1);after=members()
 terminal={'at':datetime.now(timezone.utc).isoformat(),'exitCode':code,'stop':stop,'wallSeconds':time.monotonic()-started,'peakTreeRssBytes':peak,'survivorsBeforeCleanup':before,'survivorsAfterCleanup':after}
 (output.parent/'OPERATION-TERMINAL.json').write_text(json.dumps(terminal,indent=2)+'\n');print(json.dumps(terminal))
 if code or stop or after:raise SystemExit(1)
 result=json.loads((output/'RESULT.json').read_text())
 assert result['status']=='PASS' and result['completed']==2501 and result['lastTime']==500
