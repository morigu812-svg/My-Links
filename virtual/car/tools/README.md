# 地図データの再生成

Python 3 と lxml が必要です。以下をこの順に実行してください。

```
python virtual/car/tools/list-umeda.py
python virtual/car/tools/download-umeda.py
python virtual/car/tools/convert-umeda.py
python virtual/car/tools/download-osm.py
python virtual/car/tools/convert-osm.py
```

出典・利用条件と再現範囲は `../UMEDA-DATA.md` を参照。ダウンロードするCityGMLは対象範囲に交わる9メッシュで、周囲の余分な建物は変換時に除外します。キャッシュの生データにはOSM編集者情報等が含まれるため、生成した地物データのみ配布し、生のOSM XMLはコミットしないでください。
