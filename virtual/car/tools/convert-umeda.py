from lxml import etree
from pathlib import Path
import math,json
root=Path(__file__).resolve().parent/'umeda-data';origin=[34.702,135.4965];sx=111320*math.cos(math.radians(origin[0]));sz=110940
ns={'g':'http://www.opengis.net/gml','b':'http://www.opengis.net/citygml/building/2.0','t':'http://www.opengis.net/citygml/transportation/2.0'}
def ring(e):
 v=list(map(float,e.text.split()));return [[round((v[i+1]-origin[1])*sx,2),round(v[i+2],2),round((origin[0]-v[i])*sz,2)] for i in range(0,len(v),3)]
def polygons(e):
 out=[]
 for p in e:
  rings=[ring(r) for r in p.findall('.//g:exterior/g:LinearRing/g:posList',ns)+p.findall('.//g:interior/g:LinearRing/g:posList',ns)]
  if rings and len(rings[0])>=4:out.append(rings)
 return out
def inside(points):return any(abs(p[0])<=1000 and abs(p[2])<=1000 for p in points)
buildings=[];roads=[];seen=set()
for file in sorted(root.glob('*_bldg_*.gml')):
 for _,e in etree.iterparse(str(file),tag='{'+ns['b']+'}Building'):
  id=e.get('{'+ns['g']+'}id')
  foot=polygons(e.findall('./b:lod0FootPrint//g:Polygon',ns))
  if not foot or not inside([p for rings in foot for r in rings for p in r]):e.clear();continue
  lod=2;polys=polygons(e.findall('.//b:lod2MultiSurface//g:Polygon',ns))
  if not polys:lod=1;polys=polygons(e.findall('./b:lod1Solid//g:Polygon',ns))
  if not polys or id in seen:e.clear();continue
  seen.add(id);pts=[p for rings in polys for r in rings for p in r];base=min(p[1] for p in pts);height=max(p[1] for p in pts)-base
  for rings in polys:
   for r in rings:
    for p in r:p[1]=round(p[1]-base,2)
  buildings.append({'id':id,'name':e.findtext('./g:name',default='',namespaces=ns),'lod':lod,'h':round(height,2),'foot':[[[p[0],p[2]]for p in rings[0]] for rings in foot],'polys':polys})
  e.clear()
 print(file.name,len(buildings),flush=True)
for file in sorted(root.glob('*_tran_*.gml')):
 for _,e in etree.iterparse(str(file),tag='{'+ns['t']+'}Road'):
  for rings in polygons(e.findall('./t:lod1MultiSurface//g:Polygon',ns)):
   if inside([p for r in rings for p in r]):roads.append([[[p[0],p[2]] for p in r] for r in rings])
  e.clear()
data={'version':1,'origin':origin,'bounds':[-1000,1000,-1000,1000],'source':'大阪市3D都市モデル（Project PLATEAU）2025年度','buildings':buildings,'roads':roads}
p=root/'umeda.json';p.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')));print('TOTAL',len(buildings),len(roads),'bytes',p.stat().st_size,flush=True)
