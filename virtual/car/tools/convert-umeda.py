from lxml import etree
from pathlib import Path
import math,json
root=Path(__file__).resolve().parent/'umeda-data';origin=[34.702,135.4965];sx=111320*math.cos(math.radians(origin[0]));sz=110940
ns={'g':'http://www.opengis.net/gml','b':'http://www.opengis.net/citygml/building/2.0','t':'http://www.opengis.net/citygml/transportation/2.0','a':'http://www.opengis.net/citygml/appearance/2.0'}
def ring(e):
 v=list(map(float,e.text.split()));return [[round((v[i+1]-origin[1])*sx,2),round(v[i+2],2),round((origin[0]-v[i])*sz,2)] for i in range(0,len(v),3)]
def polygons(e):
 out=[]
 for p in e:
  rings=[ring(r) for r in p.findall('.//g:exterior/g:LinearRing/g:posList',ns)+p.findall('.//g:interior/g:LinearRing/g:posList',ns)]
  if rings and len(rings[0])>=4:out.append(rings)
 return out
def inside(points):return any(abs(p[0])<=1000 and abs(p[2])<=1000 for p in points)
buildings=[];roads=[];seen=set();usedTextures={}
for file in sorted(root.glob('*_bldg_*.gml')):
 textures={}
 for _,tex in etree.iterparse(str(file),tag='{'+ns['a']+'}ParameterizedTexture'):
  image=tex.findtext('a:imageURI',namespaces=ns)
  if not image:continue
  key=file.stem+'/'+image
  for uv in tex.findall('.//a:textureCoordinates',ns):
   v=list(map(float,uv.text.split()));textures[uv.get('ring').lstrip('#')]={'image':key,'uv':[[v[i],v[i+1]]for i in range(0,len(v),2)]}
 for _,e in etree.iterparse(str(file),tag='{'+ns['b']+'}Building'):
  id=e.get('{'+ns['g']+'}id')
  foot=polygons(e.findall('./b:lod0FootPrint//g:Polygon',ns)or e.findall('./b:lod0RoofEdge//g:Polygon',ns))
  if not foot or not inside([p for rings in foot for r in rings for p in r]):e.clear();continue
  lod=2;elements=e.findall('.//b:lod2MultiSurface//g:Polygon',ns);polys=polygons(elements)
  if not polys:lod=1;elements=e.findall('./b:lod1Solid//g:Polygon',ns);polys=polygons(elements)
  if not polys or id in seen:e.clear();continue
  seen.add(id);pts=[p for rings in polys for r in rings for p in r];base=min(p[1] for p in pts);height=max(p[1] for p in pts)-base
  for rings in polys:
   for r in rings:
    for p in r:p[1]=round(p[1]-base,2)
  appearance=[]
  for poly in elements:
   rings=poly.findall('.//g:exterior/g:LinearRing',ns)+poly.findall('.//g:interior/g:LinearRing',ns)
   mapping=[textures.get(r.get('{'+ns['g']+'}id'))for r in rings]
   if mapping and all(mapping) and len({m['image']for m in mapping})==1:
    image=mapping[0]['image'];appearance.append({'image':image,'uv':[m['uv']for m in mapping]});usedTextures[image]=file.name
   else:appearance.append(None)
  buildings.append({'appearance':appearance if any(appearance)else None,'id':id,'name':e.findtext('./g:name',default='',namespaces=ns),'lod':lod,'h':round(height,2),'foot':[[[p[0],p[2]]for p in rings[0]] for rings in foot],'polys':polys})
  e.clear()
 print(file.name,len(buildings),flush=True)
for file in sorted(root.glob('*_tran_*.gml')):
 for _,e in etree.iterparse(str(file),tag='{'+ns['t']+'}Road'):
  for rings in polygons(e.findall('./t:lod1MultiSurface//g:Polygon',ns)):
   if inside([p for r in rings for p in r]):roads.append([[[p[0],p[2]] for p in r] for r in rings])
  e.clear()
data={'version':1,'origin':origin,'bounds':[-1000,1000,-1000,1000],'source':'大阪市3D都市モデル（Project PLATEAU）2025年度','buildings':buildings,'roads':roads,'textures':usedTextures}
p=root/'umeda.json';p.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')));print('TOTAL',len(buildings),len(roads),'bytes',p.stat().st_size,flush=True)
