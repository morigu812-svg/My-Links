import urllib.request,pathlib,concurrent.futures
root=pathlib.Path(__file__).resolve().parent/'umeda-data';bounds=[(135.485,34.693,135.4965,34.702),(135.4965,34.693,135.508,34.702),(135.485,34.702,135.4965,34.711),(135.4965,34.702,135.508,34.711)]
def get(item):
 i,b=item;p=root/f'osm-{i}.xml'
 if not p.exists():p.write_bytes(urllib.request.urlopen('https://api.openstreetmap.org/api/0.6/map?bbox='+','.join(map(str,b)),timeout=60).read())
 return p.name,p.stat().st_size
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for r in pool.map(get,enumerate(bounds)):print(r,flush=True)
