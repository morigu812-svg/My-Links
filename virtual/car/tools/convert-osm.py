from lxml import etree
import json,math,pathlib
root=pathlib.Path(__file__).resolve().parent/'umeda-data';data=json.loads((root/'umeda.json').read_text());lat,lon=data['origin'];sx=111320*math.cos(math.radians(lat));sz=110940
nodes={};ways={}
for file in sorted(root.glob('osm-[0-3].xml')):
 tree=etree.parse(str(file))
 for e in tree.findall('node'):nodes[e.get('id')]=[float(e.get('lat')),float(e.get('lon')),{t.get('k'):t.get('v')for t in e.findall('tag')}]
 for e in tree.findall('way'):ways[e.get('id')]=([n.get('ref')for n in e.findall('nd')],{t.get('k'):t.get('v')for t in e.findall('tag')})
def xy(n):return [round((n[1]-lon)*sx,2),round((lat-n[0])*sz,2)]
roads=[];rails=[];parks=[];water=[]
for id,(refs,t)in ways.items():
 pts=[xy(nodes[n])for n in refs if n in nodes]
 if len(pts)<2 or not any(abs(p[0])<1000 and abs(p[1])<1000 for p in pts):continue
 if 'highway' in t and t['highway'] not in ['construction','proposed','steps','platform','elevator']:
  allowed=t['highway'] in ['motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','residential','living_street','service'] and t.get('access')not in ['private','no'] and t.get('motor_vehicle') not in ['no','private'] and t.get('tunnel')!='yes' and int(t.get('layer','0').replace(';','').replace(' ','')or'0')>=0
  try:limit=int(t.get('maxspeed',''))
  except:limit=None
  try:width=float(t.get('width',''))
  except:width=None
  roads.append({'id':id,'nodes':[int(n)for n in refs if n in nodes],'p':pts,'name':t.get('name',''),'type':t['highway'],'oneway':t.get('oneway','no'),'limit':limit,'width':width,'lanes':t.get('lanes',''),'drive':allowed,'bridge':t.get('bridge')=='yes','layer':t.get('layer','0')})
 if t.get('railway')in ['rail','light_rail'] and t.get('tunnel')!='yes':rails.append({'p':pts,'name':t.get('name','')})
 if t.get('leisure')=='park' and pts[0]==pts[-1]:parks.append(pts)
 if t.get('natural')=='water' and pts[0]==pts[-1]:water.append(pts)
data.update({'ways':roads,'railways':rails,'parks':parks,'water':water,'signals':[xy(n) for n in nodes.values() if n[2].get('highway')=='traffic_signals' and abs(xy(n)[0])<1000 and abs(xy(n)[1])<1000]})
(root/'umeda.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
print('ways',len(roads),'drive',sum(w['drive'] for w in roads),'railways',len(rails),'signals',len(data['signals']))

import gzip
(root.parent.parent/'umeda.json.gz').write_bytes(gzip.compress((root/'umeda.json').read_bytes(),compresslevel=9,mtime=0))
