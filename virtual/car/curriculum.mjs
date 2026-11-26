const c=(x,z,extra={})=>({x:1200+x,z,...extra});
export const lessons=[
 {id:'lesson-0',phase:'第1段階',name:'乗車・安全確認・発進停止',campus:true,spawn:c(-3.5,145),goal:'シートベルト → 左右確認 → ブレーキを踏んでD → サイド解除。指定枠で停車。',limit:20,time:120,route:[c(-3.5,125),c(-3.5,95,{stop:2})],checks:['belt','safety','gear','handbrake']},
 {id:'lesson-1',phase:'第1段階',name:'速度調節・目標停止',campus:true,spawn:c(-3.5,140),goal:'25〜35km/hを3秒維持してから、青枠で静かに2秒停止。',limit:35,time:150,route:[c(-3.5,80),c(-3.5,20,{stop:2})],speedTask:true},
 {id:'lesson-2',phase:'第1段階',name:'左折・右折・合図と確認',campus:true,spawn:c(-3.5,140),goal:'曲がる前に合図と左右確認。青い進路を30km/h以下でたどる。',limit:30,time:240,route:[c(-3.5,80),c(-35,45,{turn:1}),c(-75,45),c(-110,10,{turn:-1}),c(-110,-45),c(-110,-80,{stop:2})]},
 {id:'lesson-3',phase:'第1段階',name:'S字・車幅感覚',campus:true,spawn:c(-3.5,140),goal:'狭いS字で車体をコース内に保つ。15km/h以下。',limit:15,time:240,corridor:4,route:[c(-3.5,140),c(-3.5,115),c(7,95),c(20,75),c(20,55),c(7,35),c(-8,15),c(-20,-5),c(-20,-25),c(-8,-45),c(0,-70,{stop:2})]},
 {id:'lesson-4',phase:'第1段階',name:'クランク・低速切り返し',campus:true,spawn:c(-80,140),goal:'12km/h以下でクランクを通過。接触は検定中止。',limit:12,time:300,corridor:4.8,route:[c(-80,140),c(-80,70),c(-55,70),c(-55,15),c(-25,15),c(-25,-45,{stop:2})]},
 {id:'lesson-5',phase:'第1段階',name:'坂道停止・坂道発進',campus:true,spawn:c(186.5,35),goal:'坂の途中で2秒停止し、1m以上後退せず再発進。',limit:20,time:180,slope:true,route:[c(186.5,-15,{stop:2}),c(186.5,-65),c(186.5,-120,{stop:2})]},
 {id:'lesson-6',phase:'第1段階',name:'後退・車庫入れ',campus:true,spawn:c(75,45),goal:'ブレーキを踏んでR。後退で駐車枠に入り、Pとサイドで3秒停止。',limit:12,time:240,route:[c(75,65,{reverse:true}),c(75,95,{reverse:true,park:true,stop:3})]},
 {id:'lesson-7',phase:'修了検定',name:'場内総合検定',campus:true,spawn:c(-3.5,145),goal:'発進、左折、速度管理、停止を総合採点。重大ミスは即中止。',limit:30,time:300,exam:true,route:[c(-3.5,90),c(-35,45,{turn:1}),c(-90,45),c(-130,5,{turn:-1}),c(-130,-80),c(-130,-120,{stop:2})]},
 {id:'lesson-8',phase:'第2段階',name:'路上走行・左側通行',spawn:{x:-3.5,z:550},goal:'制限速度と左側通行を守り、青い経路を走る。信号を優先。',limit:40,time:360,route:[{x:-3.5,z:440},{x:-3.5,z:340},{x:-3.5,z:240},{x:-3.5,z:160,stop:2}]},
 {id:'lesson-9',phase:'第2段階',name:'一時停止・踏切・危険予測',spawn:{x:-603.5,z:310},goal:'信号、歩行者、踏切を確認。遮断中は停止線で待つ。',limit:30,time:420,route:[{x:-603.5,z:245},{x:-603.5,z:145},{x:-603.5,z:60},{x:-603.5,z:-40,stop:2}]},
 {id:'lesson-10',phase:'第2段階',name:'車間距離・交差点の通行',spawn:{x:3.5,z:-720,heading:Math.PI},goal:'交通の流れに合わせ、車間を確保し、交差点を安全に通過。',limit:40,time:420,route:[{x:3.5,z:-640},{x:40,z:-603.5,turn:1},{x:140,z:-603.5},{x:240,z:-603.5},{x:320,z:-603.5,stop:2}]},
 {id:'lesson-11',phase:'卒業検定',name:'路上総合・最終技能検定',spawn:{x:-3.5,z:740},goal:'約1.3kmを安全に走行。重大ミスなし・85点以上で技能合格。',limit:40,time:700,exam:true,route:[{x:-3.5,z:650},{x:-3.5,z:550},{x:-3.5,z:450},{x:-3.5,z:350},{x:-3.5,z:250},{x:-3.5,z:150},{x:-3.5,z:50},{x:-3.5,z:-50},{x:-3.5,z:-150},{x:-3.5,z:-250},{x:-3.5,z:-350},{x:-3.5,z:-450},{x:-3.5,z:-550,stop:3,park:true}]}
];
export const quiz=[
 ['赤信号では、停止位置を越えて進んではいけない。',true,'停止線があれば、その直前で停止します。'],
 ['黄色信号になったら、いつでも加速して交差点を抜ける。',false,'安全に停止できないほど近い場合を除き停止します。'],
 ['一時停止の標識がある場所では、見通しがよければ徐行だけでよい。',false,'停止線の直前で一時停止し、安全を確認します。'],
 ['横断しようとしている歩行者がいる横断歩道では、一時停止して通行を妨げない。',true,'歩行者優先です。'],
 ['自動車は原則として道路の左側を通行する。',true,'中央から左側を通行します。'],
 ['遮断機が下り始めた踏切には、車が通れる隙間があれば入れる。',false,'遮断中や下り始めの踏切に進入してはいけません。'],
 ['踏切では原則として直前で停止し、目と耳で安全を確認する。',true,'信号に従う場合などの例外があります。'],
 ['濡れた路面では、同じ速度でも停止までの距離が延びやすい。',true,'速度を落として車間を十分に確保します。'],
 ['AT車のDとRは、車が完全に停止してから切り替える。',true,'ブレーキを踏み、進行方向を確認します。'],
 ['シートベルトは高速道路でだけ着用すればよい。',false,'一般道路でも着用が必要です。'],
 ['交差点内で動けなくなりそうなら、青信号でも交差点に入らない。',true,'前方の空きスペースを確認します。'],
 ['右左折の合図を出したら、周囲の安全確認は省略できる。',false,'合図と安全確認はどちらも必要です。'],
 ['制限速度は、周囲の車も超過していれば超えてよい。',false,'周囲の流れを理由に速度超過は認められません。'],
 ['緊急自動車が近づいたときは、その進路を妨げないようにする。',true,'交差点付近では交差点を避けて対応します。'],
 ['事故を起こしたら、まず車を停止し、負傷者救護や危険防止、警察への報告を行う。',true,'その場を立ち去らず必要な措置をとります。'],
 ['路上に停車するとき、交通の妨げになる場所でもPレンジなら問題ない。',false,'駐停車禁止や周囲の安全を確認します。'],
 ['車間距離は、前車が急停止しても追突を避けられるようにとる。',true,'速度と路面に合わせた距離が必要です。'],
 ['見通しの悪い交差点では、必要に応じ徐行し安全を確認する。',true,'優先関係や標識に従います。'],
 ['違反点数は持ち点から減る仕組みである。',false,'日本の点数制度は累積加点方式です。'],
 ['免許停止中でも、短距離なら運転できる。',false,'停止中は運転できません。']
];
export function lessonAvailable(profile,index){return index===0||profile.courses[lessons[index-1].id]>=85;}
export function newAssessment(lesson){return {lessonId:lesson.id,index:0,scores:{safety:20,control:20,position:20,speed:20,observation:20},events:[],fatal:false,elapsed:0,dwell:0,speedHeld:0,rollback:0,lastZ:null,everMoved:false,checksDone:false};}
export function assessEvent(a,event){const key=event.code==='speed'?'speed':['wrongWay','offRoad'].includes(event.code)?'position':['signal','observation'].includes(event.code)?'observation':event.code==='rough'?'control':'safety';a.scores[key]=Math.max(0,a.scores[key]-(event.loss||5));a.events.push({name:event.name,loss:event.loss||5});if(event.critical)a.fatal=true;}
export const assessmentScore=a=>Object.values(a.scores).reduce((sum,v)=>sum+v,0);
export function evaluateLesson(a,lesson,car,dt,time){a.elapsed+=dt;const speed=Math.abs(car.speed)*3.6;
 if(speed>1)a.everMoved=true;
 if(!a.checksDone&&speed>2){a.checksDone=true;if(!car.belt)assessEvent(a,{code:'belt',name:'シートベルト未着用で発進',loss:10,critical:true});if(time-car.lastSafety>10)assessEvent(a,{code:'observation',name:'発進前の左右確認なし',loss:10});}
 if(lesson.speedTask&&speed>=25&&speed<=35)a.speedHeld+=dt;
 if(lesson.slope&&a.index===1&&car.speed<-.1)a.rollback+=Math.abs(car.speed)*dt;
 if(a.rollback>1&&!a.events.some(e=>e.name==='坂道で1m以上後退'))assessEvent(a,{code:'safety',name:'坂道で1m以上後退',loss:30,critical:true});
 const p=lesson.route[a.index];if(!p)return {done:true,passed:!a.fatal&&assessmentScore(a)>=85};
 const distance=Math.hypot(car.x-p.x,car.z-p.z);let valid=distance<(p.stop?2.5:lesson.corridor?4:7);
 if(p.reverse&&!p.park)valid=valid&&car.gear==='R';
 if(p.park)valid=distance<1.25&&Math.abs(car.speed)<.1&&car.gear==='P'&&car.handbrake&&Math.abs(Math.atan2(Math.sin(car.heading-(lesson.spawn.heading||0)),Math.cos(car.heading-(lesson.spawn.heading||0))))<.17;
 if(p.stop){valid=valid&&speed<.5;if(lesson.speedTask&&a.speedHeld<3)valid=false;a.dwell=valid?a.dwell+dt:0;valid=a.dwell>=p.stop;}
 if(valid){if(p.turn&&!(a.events.some(e=>e.name==='曲がる前の確認・合図不足 '+a.index))&&(((car.lastIndicator||car.indicator)!==p.turn||time-(car.lastIndicatorTime||-999)>15)||time-car.lastSafety>10))assessEvent(a,{code:'observation',name:'曲がる前の確認・合図不足 '+a.index,loss:10});a.index++;a.dwell=0;}
 if(a.elapsed>lesson.time){a.fatal=true;if(!a.events.some(e=>e.name==='制限時間超過'))a.events.push({name:'制限時間超過',loss:0});}
 return {done:a.fatal||a.index>=lesson.route.length,passed:!a.fatal&&a.index>=lesson.route.length&&assessmentScore(a)>=85};}

