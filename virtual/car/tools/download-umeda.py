import json,pathlib,urllib.request,concurrent.futures
root=pathlib.Path(__file__).resolve().parent/'umeda-data';d=json.loads((root/'files.json').read_text())
files=[f for c in d['cities'] for t in ('bldg','tran') for f in c['files'][t]]
def run(f):
 p=root/f['url'].split('/')[-1]
 if not p.exists():
  with urllib.request.urlopen(f['url'],timeout=90) as r,p.with_suffix('.tmp').open('wb') as out:
   while chunk:=r.read(1024*1024):out.write(chunk)
  p.with_suffix('.tmp').rename(p)
 return p.name,p.stat().st_size
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for r in pool.map(run,files):print(*r,flush=True)
