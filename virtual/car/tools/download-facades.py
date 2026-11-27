import json,pathlib,urllib.request,urllib.parse,concurrent.futures,hashlib,io,gzip
from PIL import Image
root=pathlib.Path(__file__).resolve().parent/'umeda-data';d=json.load(open(root/'umeda.json'));files={f['url'].split('/')[-1]:f['url']for c in json.load(open(root/'files.json'))['cities']for f in c['files']['bldg']};out=pathlib.Path(__file__).resolve().parent.parent/'facades';out.mkdir(exist_ok=True)
def run(item):
 key,gml=item;image=key.split('/',1)[1];url=urllib.parse.urljoin(files[gml],image);name=hashlib.sha1(key.encode()).hexdigest()[:12]+'.webp';p=out/name
 if not p.exists():
  raw=urllib.request.urlopen(url,timeout=50).read();im=Image.open(io.BytesIO(raw)).convert('RGB');im.thumbnail((2048,2048));im.save(p,'WEBP',quality=88,method=6)
 return key,{'src':'facades/'+name,'source':url,'bytes':p.stat().st_size}
result={}
with concurrent.futures.ThreadPoolExecutor(max_workers=4)as pool:
 for k,v in pool.map(run,d['textures'].items()):result[k]=v;print(v['src'],v['bytes'],flush=True)
d['textures']=result;d['version']=2;raw=json.dumps(d,ensure_ascii=False,separators=(',',':')).encode();(root/'umeda.json').write_bytes(raw);p=pathlib.Path(__file__).resolve().parent.parent/'umeda.json.gz';p.write_bytes(gzip.compress(raw,compresslevel=9,mtime=0));print('buildings',len(d['buildings']),'photo buildings',sum(bool(b.get('appearance'))for b in d['buildings']),'textures',len(result),'gzip bytes',p.stat().st_size,flush=True)
