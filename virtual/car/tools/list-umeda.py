import urllib.request,json,pathlib,concurrent.futures,urllib.parse
root=pathlib.Path(__file__).resolve().parent/'umeda-data';root.mkdir(exist_ok=True)
def get(url,name):
 p=root/name
 if not p.exists():p.write_bytes(urllib.request.urlopen(url,timeout=60).read())
 return json.loads(p.read_text())
d=get('https://api.plateauview.mlit.go.jp/datacatalog/citygml/r:135.485,34.693,135.508,34.711?types=bldg,tran','files.json')
print('梅田周辺のファイル一覧を保存しました。')
