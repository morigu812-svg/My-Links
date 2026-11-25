// Model names identify the selection; all dynamics below are game presets, not manufacturer specifications.
const groups=[
 ['トヨタ',[['ヤリス','hatch'],['カローラ','sedan'],['プリウス','sedan'],['カムリ','sedan'],['クラウン','sedan'],['GR86','sport'],['RAV4','suv'],['ハリアー','suv'],['ランドクルーザー','suv'],['アルファード','van']]],
 ['ホンダ',[['フィット','hatch'],['シビック','sedan'],['アコード','sedan'],['ヴェゼル','suv'],['CR-V','suv'],['ZR-V','suv'],['N-BOX','keiVan'],['S660','keiSport'],['NSX','super'],['フリード','van']]],
 ['日産',[['ノート','hatch'],['リーフ','ev'],['スカイライン','sedan'],['フェアレディZ','sport'],['GT-R','super'],['エクストレイル','suv'],['セレナ','van'],['サクラ','kei']]],
 ['マツダ',[['MAZDA2','hatch'],['MAZDA3','sedan'],['MAZDA6','sedan'],['ロードスター','sport'],['CX-5','suv'],['CX-30','suv']]],
 ['スバル',[['インプレッサ','hatch'],['レヴォーグ','wagon'],['WRX','sport'],['BRZ','sport'],['フォレスター','suv']]],
 ['スズキ',[['スイフト','hatch'],['ジムニー','keiSuv'],['ハスラー','keiSuv']]],
 ['三菱',[['ランサーエボリューション','sport'],['アウトランダー','suv'],['デリカD:5','van']]],
 ['ダイハツ',[['コペン','keiSport'],['タント','keiVan']]],
 ['BMW',[['3シリーズ','sedan']]],['メルセデス・ベンツ',[['Cクラス','sedan']]],['フォルクスワーゲン',[['ゴルフ','hatch']]]
];
const presets={
 kei:{mass:820,torque:80,power:47,drag:.34,area:1.9,wheelbase:2.45,length:3.4,width:1.48,height:1.5,grip:.86},
 keiVan:{mass:980,torque:100,power:47,drag:.37,area:2.2,wheelbase:2.5,length:3.4,width:1.48,height:1.8,grip:.82},
 keiSuv:{mass:1040,torque:105,power:47,drag:.4,area:2.1,wheelbase:2.3,length:3.4,width:1.48,height:1.72,grip:.81},
 keiSport:{mass:860,torque:105,power:47,drag:.32,area:1.7,wheelbase:2.25,length:3.4,width:1.48,height:1.18,grip:.97},
 hatch:{mass:1180,torque:155,power:92,drag:.3,area:2.15,wheelbase:2.55,length:4.05,width:1.72,height:1.5,grip:.95},
 sedan:{mass:1510,torque:230,power:140,drag:.28,area:2.2,wheelbase:2.75,length:4.7,width:1.8,height:1.44,grip:.98},
 wagon:{mass:1570,torque:260,power:155,drag:.3,area:2.3,wheelbase:2.7,length:4.7,width:1.8,height:1.5,grip:.96},
 suv:{mass:1860,torque:290,power:165,drag:.36,area:2.75,wheelbase:2.75,length:4.7,width:1.88,height:1.75,grip:.89},
 van:{mass:1960,torque:260,power:130,drag:.37,area:2.9,wheelbase:2.9,length:4.85,width:1.85,height:1.9,grip:.84},
 sport:{mass:1310,torque:280,power:185,drag:.3,area:1.95,wheelbase:2.55,length:4.35,width:1.8,height:1.28,grip:1.1},
 super:{mass:1680,torque:500,power:350,drag:.3,area:2.05,wheelbase:2.7,length:4.65,width:1.92,height:1.22,grip:1.16},
 ev:{mass:1610,torque:300,power:135,drag:.28,area:2.25,wheelbase:2.7,length:4.45,width:1.8,height:1.5,grip:.97,ev:true}
};
export const vehicles=groups.flatMap(([make,models],g)=>models.map(([name,type],i)=>({id:`car-${g}-${i}`,make,name,type,...presets[type],torque:Math.round(presets[type].torque*(.96+i*.012)),mass:presets[type].mass+i*7})));
export const trainingCar={id:'training',make:'教習所',name:'普通AT教習車',type:'sedan',...presets.sedan,torque:175,power:100,mass:1420};
export const colors=['#51c9bc','#ecece4','#202a38','#c63045','#3369ab','#b0b4bb','#f0bd50'];
export function vehicleById(id){return vehicles.find(v=>v.id===id)||vehicles[0];}
export const classNames={kei:'軽自動車',keiVan:'軽ハイトワゴン',keiSuv:'軽SUV',keiSport:'軽スポーツ',hatch:'コンパクト',sedan:'セダン',wagon:'ワゴン',suv:'SUV',van:'ミニバン',sport:'スポーツ',super:'高性能スポーツ',ev:'EV'};
