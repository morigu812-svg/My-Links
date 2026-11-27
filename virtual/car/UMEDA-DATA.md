# 梅田・大阪駅周辺の市街地データ

中心: 北緯34.702度・東経135.4965度。ローカル座標は東が+x、南が+z。各辺約2km。

- 建物: 6,818棟。大阪市3D都市モデル（Project PLATEAU）2025年度。公開CityGMLのLOD2面を優先し、存在しない建物はLOD1面を使用。LOD2は1,351棟。
- 道路面: 同データの交通モデル3,168面。
- 道路経路: OpenStreetMapの取得データ4,632 ways。車道候補は1,498 ways。一方通行・車両通行可否・道路名・制限速度など利用可能なタグを参照。
- 地上道路が対象。地形の標高は平坦化し、建物の底面を地面に合わせている。建物内装、写真未提供の外壁、地下街、立体道路の高さ、全標識、現地の信号制御は未再現。「完全再現済み」ではない。
- 建物高さはCityGMLの形状から取得。低速時のハンドル最大角を拡大し、速度に応じて抑制。タイヤの横加速度制限は維持。公式CityGMLの写真付き21棟は外壁画像とUVを使用し、その他の色はゲーム用。信号などの道路規則は実際の完全な道路規制データを表すものではない。一般道の速度制限はゲーム設定として100km/hに統一（フリーの超過許容+15km/hは継続）。教習所の場内制限は各課題の設定を維持。
- JSONはgzip圧縮して同一オリジンから読み込む。実行時にPLATEAU/OSM APIへ問い合わせない。

## 出典・ライセンス

大阪市3D都市モデル（Project PLATEAU）2025年度、国土交通省・大阪市。CC BY 4.0。CityGMLを範囲切り出し、座標変換、形状の面配列へ加工。
https://www.mlit.go.jp/plateau/
https://api.plateauview.mlit.go.jp/datacatalog/citygml/r:135.485,34.693,135.508,34.711?types=bldg,tran
https://creativecommons.org/licenses/by/4.0/

道路経路・鉄道・公園・水域・信号位置: © OpenStreetMap contributors、ODbL 1.0。2026-11-27取得。`umeda.json.gz`中のways/railways/parks/water/signalsはOSM由来の抽出データベースとしてODbLで配布。PLATEAU由来のbuildings/roadsと区別して格納。
https://www.openstreetmap.org/copyright
https://opendatacommons.org/licenses/odbl/1-0/

## 検証

`node --test virtual/car/umeda-map.test.mjs` と既存の教習・運転テストを実行。マップテストは実データの件数、開始地点の車道/建物との重なり、普通30台の近接配置と移動、交通量設定を確認する。

写真付きモデルは `lod0RoofEdge` の外形を使う21棟。従来のインポートが `lod0FootPrint` のみを見て除外していたため、屋根外形にも対応して再生成した。画像は公式データの参照URIから取得し、最大2048pxのWebPへ変換。テクスチャごとの元URLは `umeda.json.gz` のtexturesフィールドに記録する。
