/* =====================================================================
   Run Log v2 — runs-first tracker.
   Runs are the core collection; goals (training programs) layer on top.
   Schema v2, localStorage only, single file, GitHub Pages friendly.
===================================================================== */
const SCHEMA_VERSION=2;
const K={runs:"tracker.runs",goals:"tracker.goals",weights:"tracker.weights",settings:"tracker.settings",version:"tracker.version"};
const OLD_KEY="r2k_db_v1", BACKUP_KEY="tracker_backup_v1";
const RUN_TYPES=["easy","long","tempo","interval","treadmill","race","other"];
const DAY_OFF={Thu:0,Fri:1,Sat:2,Sun:3,Mon:4,Tue:5,Wed:6}; // old plan weeks ran Thu→Wed

/* The original 26-week half-marathon plan, imported VERBATIM as Goal #1.
   Never regenerated — Mickel's progress lives here. */
const LEGACY_BASE="2026-06-04";
const LEGACY_PLAN=[
  {w:1,km:4,tag:null,ph:"Phase 1 · Base"},
  {w:2,km:5,tag:null},{w:3,km:6,tag:null},{w:4,km:4,tag:"cut"},
  {w:5,km:6,tag:null,ph:"Phase 2 · Build"},
  {w:6,km:7,tag:null},{w:7,km:8,tag:null},{w:8,km:6,tag:"cut"},
  {w:9,km:8,tag:null,ph:"Phase 3 · Into double digits"},
  {w:10,km:9,tag:null},{w:11,km:10,tag:null},{w:12,km:8,tag:"cut"},
  {w:13,km:10,tag:null,ph:"Phase 4 · Steady climb"},
  {w:14,km:11,tag:null},{w:15,km:12,tag:null},{w:16,km:10,tag:"cut"},
  {w:17,km:13,tag:null,ph:"Phase 5 · Long & strong"},
  {w:18,km:14,tag:null},{w:19,km:16,tag:"peak"},{w:20,km:12,tag:"cut"},
  {w:21,km:17,tag:null,ph:"Phase 6 · Peak, taper & race"},
  {w:22,km:18,tag:"peak"},{w:23,km:19,tag:"peak"},{w:24,km:14,tag:"cut"},
  {w:25,km:12,tag:"taper"},{w:26,km:21,tag:"race"}
];
const NOTES={
  cut:"Cutback week — shorter on purpose so your body absorbs the load. Don't add distance even if you feel great.",
  peak:"Big one. Go slow, fuel up, bring water + a gel. If you can hit this, race day is in the bag.",
  taper:"Taper — legs stay fresh. Easy effort, resist the urge to do more. The work's already banked.",
  race:"RACE DAY. Start slower than feels right — you'll thank yourself later. You've done the work.",
  def:"Easy, conversational pace. It should feel comfortable, not a grind."
};

/* ---------------- tiny utils ---------------- */
const $=s=>document.querySelector(s);
let _uidN=0;
function uid(){return "id"+Date.now().toString(36)+(_uidN++).toString(36)+Math.random().toString(36).slice(2,7);}
function parseISO(s){return new Date(s+"T12:00:00");}
function fmtISO(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function addDays(iso,n){const d=parseISO(iso);d.setDate(d.getDate()+n);return fmtISO(d);}
function todayISO(){return fmtISO(new Date());}
function dayNum(iso){return Math.round(parseISO(iso).getTime()/864e5);}
function fmtDate(iso){const d=parseISO(iso);if(isNaN(d))return iso;return d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'});}
function fmtShort(iso){const d=parseISO(iso);if(isNaN(d))return iso;return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});}
function fmtRange(a,b){const da=parseISO(a),db=parseISO(b);
  const f=(d,m)=>d.toLocaleDateString('en-GB',m?{weekday:'short',day:'2-digit',month:'short'}:{weekday:'short',day:'2-digit'});
  const sameMonth=da.getMonth()===db.getMonth();
  return f(da,!sameMonth)+" – "+f(db,true);}
function parseTime(s){if(!s)return null;const parts=String(s).trim().split(":").map(Number);if(!parts.length||parts.some(isNaN))return null;
  let sec=0;if(parts.length===3)sec=parts[0]*3600+parts[1]*60+parts[2];else if(parts.length===2)sec=parts[0]*60+parts[1];else if(parts.length===1)sec=parts[0]*60;else return null;
  return sec>0?sec:null;}
function fmtTime(sec){if(!sec)return "";sec=Math.round(sec);const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;
  return h>0?h+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0"):m+":"+String(s).padStart(2,"0");}
function fmtPace(sec){const m=Math.floor(sec/60),s=Math.round(sec%60);return m+":"+String(s).padStart(2,"0");}
function parseKm(v){const n=parseFloat(String(v).replace(",","."));return isNaN(n)?null:n;}
function rnd1(n){return Math.round(n*10)/10;}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

/* ---------------- state + persistence ---------------- */
let runs=[],goals=[],weights=[],settings={accent:"#d4ff3d",units:"km",activeGoalId:null};
function readJSON(k,fb){try{const r=localStorage.getItem(k);return r?JSON.parse(r):fb;}catch(e){return fb;}}
function persistAll(){
  try{
    localStorage.setItem(K.runs,JSON.stringify(runs));
    localStorage.setItem(K.goals,JSON.stringify(goals));
    localStorage.setItem(K.weights,JSON.stringify(weights));
    localStorage.setItem(K.settings,JSON.stringify(settings));
    localStorage.setItem(K.version,String(SCHEMA_VERSION));
  }catch(e){}
}
function loadAll(){
  migrate();
  runs=readJSON(K.runs,[]);
  goals=readJSON(K.goals,[]);
  weights=readJSON(K.weights,[]);
  settings=Object.assign({accent:"#d4ff3d",units:"km",activeGoalId:null},readJSON(K.settings,{}));
}

/* ---------------- legacy goal (verbatim import) ---------------- */
function buildLegacyGoal(){
  const plan=LEGACY_PLAN.map(p=>{
    const ws=addDays(LEGACY_BASE,(p.w-1)*7);
    return {
      week:p.w,windowStart:ws,windowEnd:addDays(ws,6),
      isCutback:p.tag==="cut",tag:p.tag,phase:p.ph||null,
      workouts:[{id:uid(),type:p.tag==="race"?"race":"long",
        label:p.tag==="race"?"Race day":"Long run",
        targetDistanceKm:p.km,customEventId:null,completedByRunId:null,actualDistanceKm:null}]
    };
  });
  return {id:"goal-21k",name:"Half Marathon",raceDistanceKm:21.1,raceDate:"2026-11-29",
    startDate:LEGACY_BASE,runsPerWeek:1,status:"active",
    paceHint:"~8:15–8:45/km",plan,customEvents:[]};
}

/* ---------------- migration v1 -> v2 ---------------- */
function migrate(){
  const v=parseInt(localStorage.getItem(K.version)||"0",10);
  if(v>=SCHEMA_VERSION)return;
  runs=[];goals=[];weights=[];
  settings={accent:"#d4ff3d",units:"km",activeGoalId:null};
  const goal=buildLegacyGoal();
  const now=new Date().toISOString();
  let old=null;
  const oldRaw=localStorage.getItem(OLD_KEY);
  if(oldRaw){
    try{
      if(!localStorage.getItem(BACKUP_KEY))localStorage.setItem(BACKUP_KEY,oldRaw); // safety net, never deleted
      old=JSON.parse(oldRaw);
    }catch(e){old=null;}
  }
  if(old){
    // 1) per-week long-run logs -> Run objects, filling the week's slot
    Object.keys(old.weeks||{}).forEach(wStr=>{
      const r=old.weeks[wStr],w=parseInt(wStr,10);
      const pw=goal.plan.find(p=>p.week===w);
      if(!r||!pw)return;
      const dist=parseKm(r.dist),sec=parseTime(r.time)||0;
      const date=(r.day&&DAY_OFF[r.day]!=null)?addDays(pw.windowStart,DAY_OFF[r.day]):pw.windowStart;
      if(r.done||(dist&&dist>0)||sec>0){
        const run={id:uid(),date,distanceKm:dist&&dist>0?dist:0,timeSec:sec,
          type:pw.tag==="race"?"race":"long",notes:r.notes||"",
          goalId:goal.id,fulfilledWeek:w,createdAt:now,updatedAt:now};
        const slot=pw.workouts.find(s=>s.completedByRunId===null);
        if(slot){slot.completedByRunId=run.id;slot.actualDistanceKm=run.distanceKm;}
        else{run.goalId=null;run.fulfilledWeek=null;}
        runs.push(run);
      }
      const kg=parseKm(r.weight);
      if(kg&&kg>0)weights.push({id:uid(),date,kg});
    });
    // 2) events -> custom events (replace that week's long run) + race Runs if logged
    (old.events||[]).forEach(ev=>{
      if(!ev||!ev.date)return;
      const km=parseKm(ev.km);
      const week=goal.plan.find(p=>ev.date>=p.windowStart&&ev.date<=p.windowEnd);
      const ce={id:uid(),name:ev.title||"Event",date:ev.date,distanceKm:km&&km>0?km:0,replacesWeek:week?week.week:null};
      goal.customEvents.push(ce);
      if(week&&!week.workouts[0].customEventId)week.workouts[0].customEventId=ce.id;
      const dist=parseKm(ev.dist),sec=parseTime(ev.time)||0;
      if(ev.done||(dist&&dist>0)||sec>0){
        const run={id:uid(),date:ev.date,distanceKm:dist&&dist>0?dist:(ev.done&&km>0?km:0),timeSec:sec,
          type:"race",notes:ev.notes2||"",goalId:null,fulfilledWeek:null,createdAt:now,updatedAt:now};
        if(week){
          const slot=week.workouts.find(s=>s.completedByRunId===null);
          if(slot){slot.completedByRunId=run.id;slot.actualDistanceKm=run.distanceKm;run.goalId=goal.id;run.fulfilledWeek=week.week;}
        }
        runs.push(run);
      }
    });
    // 3) extra runs -> bonus Runs (never filled a slot in the old app either)
    (old.extras||[]).forEach(rn=>{
      if(!rn||!rn.date)return;
      const dist=parseKm(rn.dist),sec=parseTime(rn.time)||0;
      runs.push({id:uid(),date:rn.date,distanceKm:dist&&dist>0?dist:0,timeSec:sec,
        type:"other",notes:rn.note||"",goalId:null,fulfilledWeek:null,createdAt:now,updatedAt:now});
    });
    if(old.accent)settings.accent=old.accent;
  }else{
    // fresh install: same 21k goal, with the July 5 10K pre-seeded like the old app
    const ce={id:uid(),name:"10K Race",date:"2026-07-05",distanceKm:10,replacesWeek:5};
    goal.customEvents.push(ce);
    const wk5=goal.plan.find(p=>p.week===5);
    if(wk5)wk5.workouts[0].customEventId=ce.id;
  }
  runs.sort((a,b)=>a.date<b.date?-1:1);
  goals.push(goal);
  settings.activeGoalId=goal.id;
  persistAll();
}

/* ---------------- run <-> goal matching ---------------- */
function getActiveGoal(){return goals.find(g=>g.id===settings.activeGoalId&&g.status==="active")||null;}
function weekOf(goal,date){return goal.plan.find(w=>date>=w.windowStart&&date<=w.windowEnd)||null;}
function effTarget(goal,slot){ // event replaces the slot's planned distance
  if(slot.customEventId){const ce=goal.customEvents.find(e=>e.id===slot.customEventId);if(ce)return ce.distanceKm;}
  return slot.targetDistanceKm;
}
function slotLabel(goal,slot){
  if(slot.customEventId){const ce=goal.customEvents.find(e=>e.id===slot.customEventId);if(ce)return ce.name;}
  return slot.label;
}
function unlinkRun(run){
  if(!run.goalId)return;
  const g=goals.find(x=>x.id===run.goalId);
  if(g)g.plan.forEach(wk=>wk.workouts.forEach(s=>{
    if(s.completedByRunId===run.id){s.completedByRunId=null;s.actualDistanceKm=null;}
  }));
  run.goalId=null;run.fulfilledWeek=null;
}
/* Fill a week's open slots, in order, from unassigned runs inside the window
   (earliest run first). Distance is NOT checked — a run is a run. */
function fillWeek(goal,week){
  const cands=runs.filter(r=>!r.goalId&&r.date>=week.windowStart&&r.date<=week.windowEnd)
    .sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.createdAt<b.createdAt?-1:1));
  week.workouts.forEach(slot=>{
    if(slot.completedByRunId)return;
    const r=cands.shift();
    if(!r)return;
    slot.completedByRunId=r.id;slot.actualDistanceKm=r.distanceKm;
    r.goalId=goal.id;r.fulfilledWeek=week.week;
  });
}
function matchRun(run){ // against the ACTIVE goal only
  if(run.goalId)return;
  const goal=getActiveGoal();
  if(!goal)return;
  const week=weekOf(goal,run.date);
  if(week)fillWeek(goal,week);
}
function addRun(fields){
  const now=new Date().toISOString();
  const run=Object.assign({id:uid(),date:todayISO(),distanceKm:0,timeSec:0,type:"easy",
    notes:"",goalId:null,fulfilledWeek:null,createdAt:now,updatedAt:now},fields);
  runs.push(run);            // a run ALWAYS counts, goal or not
  matchRun(run);             // ...and may also tick off a goal slot
  runs.sort((a,b)=>a.date<b.date?-1:1);
  persistAll();
  return run;
}
function updateRun(run,fields){
  const ref=run.goalId?{goal:goals.find(g=>g.id===run.goalId),week:run.fulfilledWeek}:null;
  Object.assign(run,fields,{updatedAt:new Date().toISOString()});
  unlinkRun(run);
  if(ref&&ref.goal){const wk=ref.goal.plan.find(w=>w.week===ref.week);if(wk)fillWeek(ref.goal,wk);}
  matchRun(run);
  runs.sort((a,b)=>a.date<b.date?-1:1);
  persistAll();
}
function deleteRun(id){
  const run=runs.find(r=>r.id===id);
  if(!run)return;
  const ref=run.goalId?{goal:goals.find(g=>g.id===run.goalId),week:run.fulfilledWeek}:null;
  unlinkRun(run);
  runs=runs.filter(r=>r.id!==id);
  if(ref&&ref.goal){const wk=ref.goal.plan.find(w=>w.week===ref.week);if(wk)fillWeek(ref.goal,wk);}
  persistAll();
}

/* ---------------- plan generator (NEW goals only) ---------------- */
function generatePlan(startDate,raceDate,raceKm,runsPerWeek){
  const days=Math.round((parseISO(raceDate)-parseISO(startDate))/864e5);
  const totalWeeks=Math.max(3,Math.floor(days/7));
  const peak=Math.round(raceKm*0.9*2)/2;                 // peak ≈ 90% of race distance
  const peakWeek=Math.max(1,totalWeeks-2);               // hit it ~2 weeks out
  let base=Math.min(peak,Math.max(3,Math.round(raceKm*0.2*2)/2));
  const steps=Math.max(1,peakWeek-1);
  if((peak-base)/steps>1.5)base=Math.max(3,peak-1.5*steps); // keep ramp ≤ ~1.5 km/week
  const plan=[];
  for(let w=1;w<=totalWeeks;w++){
    const ws=addDays(startDate,(w-1)*7);
    let tag=null,isCut=false,long;
    if(w===totalWeeks){long=raceKm;tag="race";}
    else if(w>peakWeek){long=Math.max(3,Math.round(peak*0.6*2)/2);tag="taper";} // 2-week taper: this + race week
    else{
      const t=peakWeek===1?1:(w-1)/(peakWeek-1);
      long=base+(peak-base)*t;
      if(w===peakWeek)tag="peak";
      else if(w%4===0&&w>1){long*=0.72;tag="cut";isCut=true;}  // cutback every 4th week
      long=Math.max(3,Math.round(long*2)/2);
    }
    const workouts=[{id:uid(),type:w===totalWeeks?"race":"long",
      label:w===totalWeeks?"Race day":"Long run",targetDistanceKm:long,
      customEventId:null,completedByRunId:null,actualDistanceKm:null}];
    if(w!==totalWeeks){ // easy runs at conversational pace fill the other slots; race week = rest
      for(let i=1;i<runsPerWeek;i++){
        const ez=Math.min(8,Math.max(3,Math.round(long*0.4*2)/2));
        workouts.push({id:uid(),type:"easy",label:"Easy run",targetDistanceKm:ez,
          customEventId:null,completedByRunId:null,actualDistanceKm:null});
      }
    }
    plan.push({week:w,windowStart:ws,windowEnd:addDays(ws,6),isCutback:isCut,tag,phase:null,workouts});
  }
  return plan;
}
function createGoal(o){
  const goal={id:uid(),name:o.name||"New goal",raceDistanceKm:o.raceDistanceKm,
    raceDate:o.raceDate,startDate:o.startDate,runsPerWeek:o.runsPerWeek||2,
    status:"active",paceHint:null,
    plan:generatePlan(o.startDate,o.raceDate,o.raceDistanceKm,o.runsPerWeek||2),customEvents:[]};
  const cur=getActiveGoal();
  if(cur){goal.status="archived";} // current active goal keeps priority; switch manually
  else settings.activeGoalId=goal.id;
  goals.push(goal);
  persistAll();
  return goal;
}
function setActiveGoal(id){
  goals.forEach(g=>{if(g.status==="active"&&g.id!==id)g.status="archived";});
  const g=goals.find(x=>x.id===id);
  if(g){g.status="active";settings.activeGoalId=g.id;
    // pick up any bonus runs that belong in this goal's windows
    g.plan.forEach(wk=>fillWeek(g,wk));
  }
  persistAll();
}
function setGoalStatus(id,status){
  const g=goals.find(x=>x.id===id);if(!g)return;
  g.status=status;
  if(status!=="active"&&settings.activeGoalId===id)settings.activeGoalId=null;
  persistAll();
}
function deleteGoal(id){
  const g=goals.find(x=>x.id===id);if(!g)return;
  runs.forEach(r=>{if(r.goalId===id){r.goalId=null;r.fulfilledWeek=null;}});
  goals=goals.filter(x=>x.id!==id);
  if(settings.activeGoalId===id)settings.activeGoalId=null;
  persistAll();
}
/* custom events: replace (default) a week's long-run slot, or add an extra slot */
function addCustomEvent(goal,o){
  const week=goal.plan.find(p=>o.date>=p.windowStart&&o.date<=p.windowEnd)||null;
  const ce={id:uid(),name:o.name||"Event",date:o.date,distanceKm:o.distanceKm||0,
    replacesWeek:o.mode==="add"?null:(week?week.week:null)};
  goal.customEvents.push(ce);
  if(week){
    if(o.mode==="add"){
      week.workouts.push({id:uid(),type:"race",label:ce.name,targetDistanceKm:ce.distanceKm,
        customEventId:ce.id,completedByRunId:null,actualDistanceKm:null});
      fillWeek(goal,week); // a bonus run already in that window may fill the new slot
    }else{
      week.workouts[0].customEventId=ce.id;
    }
  }
  persistAll();
  return ce;
}
function deleteCustomEvent(goal,ceId){
  goal.customEvents=goal.customEvents.filter(e=>e.id!==ceId);
  goal.plan.forEach(wk=>{
    wk.workouts=wk.workouts.filter(s=>{
      if(s.customEventId===ceId&&s.type==="race"&&wk.tag!=="race"&&s!==wk.workouts[0]){
        if(s.completedByRunId){const r=runs.find(x=>x.id===s.completedByRunId);if(r){r.goalId=null;r.fulfilledWeek=null;}}
        return false; // remove added slots
      }
      return true;
    });
    wk.workouts.forEach(s=>{if(s.customEventId===ceId)s.customEventId=null;}); // un-replace
  });
  persistAll();
}

/* ---------------- derived stats ---------------- */
function timedRuns(){return runs.filter(r=>r.distanceKm>0&&r.timeSec>0);}
function recentPace(n){
  const t=timedRuns().slice(-n);
  if(!t.length)return null;
  const km=t.reduce((s,r)=>s+r.distanceKm,0),sec=t.reduce((s,r)=>s+r.timeSec,0);
  return km>0?sec/km:null;
}
function totalKm(){return runs.reduce((s,r)=>s+(r.distanceKm||0),0);}
function last7Km(){const cut=addDays(todayISO(),-6);return runs.filter(r=>r.date>=cut).reduce((s,r)=>s+(r.distanceKm||0),0);}
function weekDone(wk){return wk.workouts.length>0&&wk.workouts.every(s=>s.completedByRunId);}
function goalWeeksDone(g){return g.plan.filter(weekDone).length;}

/* ---------------- colour ---------------- */
function hexToRgb(h){h=h.replace('#','');return[parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)];}
function darken(h,f){const[r,g,b]=hexToRgb(h);return`rgb(${Math.round(r*f)},${Math.round(g*f)},${Math.round(b*f)})`;}
function applyAccent(h){const rs=document.documentElement.style;rs.setProperty('--volt',h);rs.setProperty('--volt-dim',darken(h,.78));rs.setProperty('--glow',hexToRgb(h).join(','));const a=$("#accent");if(a)a.value=h;}

/* ---------------- charts ---------------- */
function chartSVG(main,ref,yfmt,xlabs){
  const W=300,H=122,L=34,R=8,T=10,B=18;
  const all=main.concat(ref||[]);
  let minX=Math.min(...all.map(p=>p.x)),maxX=Math.max(...all.map(p=>p.x));
  let minY=Math.min(...all.map(p=>p.y)),maxY=Math.max(...all.map(p=>p.y));
  if(minX===maxX){minX-=1;maxX+=1;}
  const padY=(maxY-minY)*0.18||1;minY-=padY;maxY+=padY;
  const X=x=>L+(x-minX)/(maxX-minX)*(W-L-R);
  const Y=y=>T+(maxY-y)/(maxY-minY)*(H-T-B);
  const path=s=>s.map((p,i)=>(i?"L":"M")+X(p.x).toFixed(1)+" "+Y(p.y).toFixed(1)).join(" ");
  let grid="",yl="";
  for(let i=0;i<=2;i++){const yy=minY+(maxY-minY)*i/2,py=Y(yy);
    grid+=`<line x1="${L}" y1="${py.toFixed(1)}" x2="${W-R}" y2="${py.toFixed(1)}" stroke="var(--line)"/>`;
    yl+=`<text class="ylab" x="${L-4}" y="${(py+3).toFixed(1)}" text-anchor="end">${yfmt(yy)}</text>`;}
  const refPath=(ref&&ref.length>1)?`<path d="${path(ref)}" fill="none" stroke="var(--mut)" stroke-width="1.4" stroke-dasharray="3 3" opacity=".55"/>`:"";
  const line=main.length>1?`<path d="${path(main)}" fill="none" stroke="var(--volt)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`:"";
  const dots=main.map(p=>`<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${p.ev?3.6:2.7}" fill="${p.ev?'var(--bg)':'var(--volt)'}" stroke="var(--volt)" stroke-width="${p.ev?2:0}"/>`).join("");
  const xl=xlabs?`<text class="ylab" x="${L}" y="${H-4}" text-anchor="start">${xlabs[0]}</text><text class="ylab" x="${W-R}" y="${H-4}" text-anchor="end">${xlabs[1]}</text>`:"";
  return `<svg viewBox="0 0 ${W} ${H}">${grid}${yl}${refPath}${line}${dots}${xl}</svg>`;
}
function card(title,meta,body,foot){return `<div class="chart"><div class="chead"><span class="ct">${title}</span><span class="cmeta">${meta}</span></div>${body}${foot?`<div class="cfoot">${foot}</div>`:""}</div>`;}
function renderCharts(){
  const box=$("#charts");if(!box)return;
  const sorted=runs.slice().sort((a,b)=>a.date<b.date?-1:1);
  let html="";
  // 1) Pace trend — ALL timed runs over time
  const pace=sorted.filter(r=>r.distanceKm>0&&r.timeSec>0).map(r=>({x:dayNum(r.date),y:r.timeSec/r.distanceKm,ev:r.type==="race",d:r.date}));
  if(pace.length>=1){
    const latest=pace[pace.length-1].y;
    let foot="lower = faster · white dots are races";
    if(pace.length>1){const d=latest-pace[0].y;foot=`${d<=0?"▼ "+fmtPace(Math.abs(d)):"▲ "+fmtPace(d)} /km vs first timed run · lower = faster`;}
    html+=card("Pace trend",`${fmtPace(latest)}<small> /km</small>`,
      pace.length>1?chartSVG(pace,null,fmtPace,[fmtShort(pace[0].d),fmtShort(pace[pace.length-1].d)]):`<div class="cempty">One run timed at ${fmtPace(latest)}/km. Log another timed run to see the trend.</div>`,
      pace.length>1?foot:null);
  }else html+=card("Pace trend","—",`<div class="cempty">Log <b>distance + time</b> on a run and your pace trend appears here.</div>`,null);
  // 2) Endurance vs planned — active-goal long runs against the plan
  const g=getActiveGoal();
  if(g){
    const planned=g.plan.map(w=>({x:w.week,y:effTarget(g,w.workouts[0])}));
    const actual=g.plan.filter(w=>w.workouts[0].completedByRunId).map(w=>({x:w.week,y:w.workouts[0].actualDistanceKm||0,ev:!!w.workouts[0].customEventId}));
    const longest=actual.length?Math.max(...actual.map(p=>p.y)):0;
    html+=card("Endurance vs plan",actual.length?`${rnd1(longest)}<small> km longest</small>`:"—",
      actual.length>1?chartSVG(actual,planned,v=>v.toFixed(0),["wk 1","wk "+g.plan.length]):
      actual.length===1?`<div class="cempty">Longest so far: ${rnd1(actual[0].y)} km. Keep logging to watch the climb to ${g.raceDistanceKm}.</div>`:
      `<div class="cempty">Your long runs will chart here against the plan (dashed line to ${g.raceDistanceKm} km).</div>`,
      actual.length>1?"solid = your runs · dashed = the plan":null);
  }
  // 3) Cumulative volume — every run ever, added up
  let cum=0;
  const vol=sorted.filter(r=>r.distanceKm>0).map(r=>({x:dayNum(r.date),y:(cum+=r.distanceKm),d:r.date}));
  if(vol.length>=1){
    html+=card("Total distance",`${rnd1(cum)}<small> km banked</small>`,
      vol.length>1?chartSVG(vol,null,v=>v.toFixed(0),[fmtShort(vol[0].d),fmtShort(vol[vol.length-1].d)]):`<div class="cempty">${rnd1(cum)} km in the bank. Keep logging to build the curve.</div>`,
      vol.length>1?"every kilometre you've logged, added up":null);
  }else html+=card("Total distance","—",`<div class="cempty">Every run you log adds to the curve — goal or no goal.</div>`,null);
  box.innerHTML=html;
}

/* ---------------- dashboard ---------------- */
function renderStats(){
  const box=$("#statGrid");if(!box)return;
  const rp=recentPace(5);
  box.innerHTML=
    `<div class="stat"><div class="n">${rp?fmtPace(rp):"—"}<small>${rp?" /km":""}</small></div><div class="t">Avg pace · last 5</div></div>`+
    `<div class="stat"><div class="n">${rnd1(last7Km())}<small> km</small></div><div class="t">Last 7 days</div></div>`+
    `<div class="stat"><div class="n">${rnd1(totalKm())}<small> km</small></div><div class="t">Total volume</div></div>`+
    `<div class="stat"><div class="n">${runs.length}</div><div class="t">Runs logged</div></div>`;
}
function renderGoalSummary(){
  const box=$("#goalSummary");if(!box)return;
  const g=getActiveGoal();
  if(!g){box.innerHTML=`<div class="empty" style="margin-top:12px">No active goal — every run still counts.<br>Create one in the <b>Goals</b> tab to train toward a race.</div>`;return;}
  const days=Math.max(0,Math.ceil((parseISO(g.raceDate)-new Date())/864e5));
  const today=todayISO();
  const wk=weekOf(g,today);
  const done=goalWeeksDone(g);
  let weekHtml="";
  if(wk){
    const rows=wk.workouts.map(s=>{
      const tgt=effTarget(g,s);
      if(s.completedByRunId){
        const r=runs.find(x=>x.id===s.completedByRunId);
        return `<div class="slotrow"><div class="sl"><b>${esc(slotLabel(g,s))}</b> · planned ${tgt} km</div><div class="st ok">✓ ${rnd1(s.actualDistanceKm||0)} km${r?" · "+fmtShort(r.date):""}</div></div>`;
      }
      return `<div class="slotrow"><div class="sl"><b>${esc(slotLabel(g,s))}</b> · ${tgt} km</div><div class="st">open</div></div>`;
    }).join("");
    const open=wk.workouts.find(s=>!s.completedByRunId);
    let nextLine;
    if(open)nextLine=`Next up: <b>${esc(slotLabel(g,open))} · ${effTarget(g,open)} km</b> — any day this window.`;
    else{
      const nw=g.plan.find(w=>w.week===wk.week+1);
      nextLine=nw?`Week complete ✓ — next: <b>WK${nw.week} · ${esc(slotLabel(g,nw.workouts[0]))} ${effTarget(g,nw.workouts[0])} km</b> from ${fmtShort(nw.windowStart)}.`:`Week complete ✓ — that was the last one. Race time.`;
    }
    weekHtml=`<div class="note" style="margin:10px 0 4px"><b>This week (WK${wk.week} · ${fmtRange(wk.windowStart,wk.windowEnd)})</b></div>${rows}<div class="note" style="margin:10px 0 0">${nextLine}${g.paceHint?` Keep it conversational (${g.paceHint}).`:""}</div>`;
  }else{
    weekHtml=`<div class="note" style="margin:10px 0 0">${today<g.startDate?`Plan starts ${fmtDate(g.startDate)}.`:`Plan window is over — race day ${fmtDate(g.raceDate)}.`}</div>`;
  }
  box.innerHTML=`
    <div class="count">
      <div><div class="big">${days}</div><div class="lab">Days to go</div></div>
      <div class="date">${esc(g.name)}<small>Race day · ${fmtDate(g.raceDate)}</small></div>
    </div>
    <div class="gcard on" style="margin-top:10px">
      <div class="gname">${esc(g.name)} <span class="badge wk">${done}/${g.plan.length} weeks</span></div>
      ${weekHtml}
      <div class="bar"><i style="width:${(done/g.plan.length*100)}%"></i></div>
    </div>`;
}
/* weight sparkline card (dashboard) */
function renderWcard(){
  const c=$("#wcard");if(!c)return;
  const pts=weights.slice().sort((a,b)=>a.date<b.date?-1:1);
  if(pts.length===0){c.innerHTML=`<div class="wl"><div class="t">Weight</div></div><div class="hint">Log your weight in the Weight tab — it'll chart here.</div>`;return;}
  const last=pts[pts.length-1].kg,first=pts[0].kg,diff=last-first;
  const chg=pts.length>1?`${diff>0?'+':''}${rnd1(diff)} kg since ${fmtShort(pts[0].date)}`:'first entry';
  let svg="";
  if(pts.length>1){
    const W=260,H=42,pad=4;
    const xs=pts.map(p=>dayNum(p.date)),vs=pts.map(p=>p.kg);
    const minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...vs),maxy=Math.max(...vs);
    const rx=maxx-minx||1,ry=(maxy-miny)||1;
    const X=w=>pad+(w-minx)/rx*(W-2*pad),Y=v=>H-pad-(v-miny)/ry*(H-2*pad);
    const d=pts.map((p,i)=>(i?'L':'M')+X(dayNum(p.date)).toFixed(1)+' '+Y(p.kg).toFixed(1)).join(' ');
    const dots=pts.map(p=>`<circle cx="${X(dayNum(p.date)).toFixed(1)}" cy="${Y(p.kg).toFixed(1)}" r="2.4" fill="var(--volt)"/>`).join('');
    svg=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="var(--volt)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}</svg>`;
  }
  c.innerHTML=`<div class="wl"><div class="t">Weight</div><div class="v">${last}<small> kg</small></div><div class="chg">${chg}</div></div>${svg}`;
}

/* ---------------- runs tab ---------------- */
let runFilterType="all",runFilterGoal="all";
const TYPE_LABEL={easy:"Easy",long:"Long",tempo:"Tempo",interval:"Interval",treadmill:"Treadmill",race:"Race",other:"Other"};
function renderRunFilters(){
  const tf=$("#runTypeFilter"),gf=$("#runGoalFilter");if(!tf)return;
  const typesPresent=[...new Set(runs.map(r=>r.type))];
  tf.innerHTML=`<div class="chip${runFilterType==='all'?' sel':''}" data-v="all">All types</div>`+
    typesPresent.map(t=>`<div class="chip${runFilterType===t?' sel':''}" data-v="${t}">${TYPE_LABEL[t]||t}</div>`).join("");
  tf.querySelectorAll(".chip").forEach(c=>c.addEventListener("click",()=>{runFilterType=c.dataset.v;renderRunFilters();renderRunList();}));
  const opts=[`<div class="chip${runFilterGoal==='all'?' sel':''}" data-v="all">All runs</div>`]
    .concat(goals.filter(g=>runs.some(r=>r.goalId===g.id)).map(g=>`<div class="chip${runFilterGoal===g.id?' sel':''}" data-v="${g.id}">${esc(g.name)}</div>`))
    .concat([`<div class="chip${runFilterGoal==='bonus'?' sel':''}" data-v="bonus">Bonus only</div>`]);
  gf.innerHTML=opts.join("");
  gf.querySelectorAll(".chip").forEach(c=>c.addEventListener("click",()=>{runFilterGoal=c.dataset.v;renderRunFilters();renderRunList();}));
}
function typeChips(boxId,sel){
  return RUN_TYPES.map(t=>`<div class="chip${sel===t?' sel':''}" data-v="${t}">${TYPE_LABEL[t]}</div>`).join("");
}
function renderRunList(){
  const box=$("#runList");if(!box)return;
  box.innerHTML="";
  let list=runs.slice().sort((a,b)=>a.date<b.date?1:-1); // newest first
  if(runFilterType!=="all")list=list.filter(r=>r.type===runFilterType);
  if(runFilterGoal==="bonus")list=list.filter(r=>!r.goalId);
  else if(runFilterGoal!=="all")list=list.filter(r=>r.goalId===runFilterGoal);
  if(!list.length){box.innerHTML=`<div class="empty">No runs here yet. Hit <b>+ Log a run</b> on the dashboard.</div>`;return;}
  list.forEach(r=>{
    const pace=(r.distanceKm>0&&r.timeSec>0)?fmtPace(r.timeSec/r.distanceKm)+"/km":null;
    const g=r.goalId?goals.find(x=>x.id===r.goalId):null;
    const el=document.createElement("div");
    el.className="week"+(r.type==="race"?" evt":"");
    el.innerHTML=`
      <div class="whead">
        <div class="wdist">
          <div class="km">${rnd1(r.distanceKm)}<small> km</small></div>
          <div class="dt">${fmtDate(r.date)}${r.timeSec?" · "+fmtTime(r.timeSec):""}${pace?" · "+pace:""}${r.notes?" · "+esc(r.notes):""}</div>
        </div>
        <span class="badge ${r.type==='race'?'race':'extra'}">${TYPE_LABEL[r.type]||r.type}</span>
        ${g?`<span class="badge wk">WK${r.fulfilledWeek}</span>`:""}
      </div>
      <div class="body"><div class="binner">
        ${g?`<div class="note">Counts toward <b>${esc(g.name)}</b> — filled week ${r.fulfilledWeek}'s slot.</div>`:`<div class="note">Bonus volume — counts in all stats, no goal slot attached.</div>`}
        <div class="grid2">
          <label class="f"><span class="lt">Date</span><input type="date" class="e-date" value="${r.date}"></label>
          <label class="f"><span class="lt">Distance (km)</span><input inputmode="decimal" class="e-km" value="${r.distanceKm||''}"></label>
        </div>
        <label class="f"><span class="lt">Time</span><input class="e-time" placeholder="mm:ss or h:mm:ss" value="${fmtTime(r.timeSec)}"></label>
        <span class="lt" style="font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--mut);display:block;margin:10px 0 6px">Type</span>
        <div class="chips e-type">${typeChips(null,r.type)}</div>
        <label class="f"><span class="lt">Notes</span><textarea class="e-notes" rows="2">${esc(r.notes)}</textarea></label>
        <div class="delrow">
          <button class="del e-del">Delete</button>
          <button class="btn2 e-save">Save changes</button>
        </div>
      </div></div>`;
    el.querySelector(".whead").addEventListener("click",()=>el.classList.toggle("open"));
    let selType=r.type;
    el.querySelectorAll(".e-type .chip").forEach(c=>c.addEventListener("click",()=>{
      selType=c.dataset.v;
      el.querySelectorAll(".e-type .chip").forEach(x=>x.classList.toggle("sel",x.dataset.v===selType));
    }));
    el.querySelector(".e-save").addEventListener("click",()=>{
      const date=el.querySelector(".e-date").value||r.date;
      const km=parseKm(el.querySelector(".e-km").value);
      const sec=parseTime(el.querySelector(".e-time").value)||0;
      updateRun(r,{date,distanceKm:km&&km>0?km:0,timeSec:sec,type:selType,notes:el.querySelector(".e-notes").value.trim()});
      toast(r.goalId?`Saved · fills WK${r.fulfilledWeek}`:"Saved · bonus volume");
      renderAll();
    });
    el.querySelector(".e-del").addEventListener("click",()=>{
      if(!confirm("Delete this run?"))return;
      deleteRun(r.id);toast("Run deleted");renderAll();
    });
    box.appendChild(el);
  });
}

/* ---------------- goals tab ---------------- */
function statusBadge(g){
  if(g.id===settings.activeGoalId&&g.status==="active")return `<span class="badge event">Active</span>`;
  if(g.status==="completed")return `<span class="badge wk">Completed</span>`;
  return `<span class="badge">Archived</span>`;
}
function renderGoalList(){
  const box=$("#goalList");if(!box)return;
  if(!goals.length){box.innerHTML=`<div class="empty">No goals yet. Hit <b>+ New goal</b> to generate a training plan.</div>`;return;}
  box.innerHTML="";
  goals.forEach(g=>{
    const el=document.createElement("div");
    el.className="gcard"+(g.id===settings.activeGoalId?" on":"");
    const isActive=g.id===settings.activeGoalId&&g.status==="active";
    el.innerHTML=`
      <div class="gname">${esc(g.name)} ${statusBadge(g)}</div>
      <div class="gmeta">${g.raceDistanceKm} km · race ${fmtDate(g.raceDate)} · ${g.plan.length} weeks · ${goalWeeksDone(g)}/${g.plan.length} done</div>
      <div class="gactions">
        ${!isActive?`<button class="btn2 a-act">Make active</button>`:""}
        ${g.status!=="completed"?`<button class="btn2 a-done">Mark completed</button>`:""}
        ${isActive?`<button class="btn2 a-arch">Archive</button>`:""}
        ${!isActive?`<button class="btn2 warn a-del">Delete</button>`:""}
      </div>`;
    const q=s=>el.querySelector(s);
    if(q(".a-act"))q(".a-act").addEventListener("click",()=>{setActiveGoal(g.id);renderAll();toast(`${g.name} is now active`);});
    if(q(".a-done"))q(".a-done").addEventListener("click",()=>{setGoalStatus(g.id,"completed");renderAll();toast(`${g.name} marked completed 🎉`);});
    if(q(".a-arch"))q(".a-arch").addEventListener("click",()=>{setGoalStatus(g.id,"archived");renderAll();});
    if(q(".a-del"))q(".a-del").addEventListener("click",()=>{
      if(!confirm(`Delete "${g.name}" and its plan? Runs stay in the log.`))return;
      deleteGoal(g.id);renderAll();toast("Goal deleted — runs kept");
    });
    box.appendChild(el);
  });
}
function renderActivePlan(){
  const box=$("#activePlan");if(!box)return;
  const g=getActiveGoal()||goals.find(x=>x.id===settings.activeGoalId);
  box.innerHTML="";
  if(!g)return;
  // --- custom events manager ---
  const evSec=document.createElement("div");
  evSec.innerHTML=`<div class="sec">Races &amp; events · ${esc(g.name)} <span class="add" id="ceAddBtn">+ Add</span></div>
    <div class="addform" id="ceForm">
      <div class="row">
        <label class="f"><span class="lt">Title</span><input id="ce-name" placeholder="10K Race"></label>
        <label class="f"><span class="lt">Date</span><input type="date" id="ce-date"></label>
      </div>
      <div class="row">
        <label class="f"><span class="lt">Distance (km)</span><input id="ce-km" inputmode="decimal" placeholder="10"></label>
        <div><span class="lt" style="font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--mut);display:block;margin-bottom:5px">That week, it…</span>
          <div class="chips" id="ce-mode">
            <div class="chip sel" data-v="replace">Replaces the run</div>
            <div class="chip" data-v="add">Adds to it</div>
          </div></div>
      </div>
      <button class="btn" id="ce-save">Add event</button>
    </div>
    <div id="ceList"></div>`;
  box.appendChild(evSec);
  $("#ceAddBtn").addEventListener("click",()=>$("#ceForm").classList.toggle("open"));
  let ceMode="replace";
  evSec.querySelectorAll("#ce-mode .chip").forEach(c=>c.addEventListener("click",()=>{
    ceMode=c.dataset.v;
    evSec.querySelectorAll("#ce-mode .chip").forEach(x=>x.classList.toggle("sel",x.dataset.v===ceMode));
  }));
  $("#ce-save").addEventListener("click",()=>{
    const name=$("#ce-name").value.trim(),date=$("#ce-date").value,km=parseKm($("#ce-km").value);
    if(!date){$("#ce-date").focus();return;}
    addCustomEvent(g,{name:name||"Event",date,distanceKm:km&&km>0?km:0,mode:ceMode});
    renderAll();toast("Event added");
  });
  const ceList=$("#ceList");
  if(g.customEvents.length){
    g.customEvents.slice().sort((a,b)=>a.date<b.date?-1:1).forEach(ce=>{
      const el=document.createElement("div");el.className="week evt";
      el.innerHTML=`<div class="whead" style="cursor:default">
        <div class="wnum e">EVENT</div>
        <div class="wdist"><div class="ttl">${esc(ce.name)}</div>
          <div class="dt">${fmtDate(ce.date)} · ${ce.distanceKm} km${ce.replacesWeek?` · replaces WK${ce.replacesWeek}'s run`:" · extra slot that week"}</div></div>
        <span class="badge event">Race</span>
        <button class="del" style="align-self:center">✕</button>
      </div>`;
      el.querySelector(".del").addEventListener("click",()=>{
        if(!confirm(`Remove "${ce.name}"?`))return;
        deleteCustomEvent(g,ce.id);renderAll();
      });
      ceList.appendChild(el);
    });
  }else ceList.innerHTML=`<div class="empty">No events on this goal. A race <b>replaces</b> that week's long run by default.</div>`;
  // --- week-by-week plan ---
  const planHead=document.createElement("div");
  planHead.innerHTML=`<div class="sec">The plan · week by week</div>
    <div class="secsub">Runs tick weeks off automatically. Planned vs. actual is shown — a different distance still counts.</div>`;
  box.appendChild(planHead);
  g.plan.forEach(wk=>{
    if(wk.phase){const h=document.createElement("div");h.className="phase";h.textContent=wk.phase;box.appendChild(h);}
    const main=wk.workouts[0];
    const tgt=effTarget(g,main);
    const isDone=weekDone(wk);
    const evHere=main.customEventId?g.customEvents.find(e=>e.id===main.customEventId):null;
    const bcls=wk.tag==='race'?'race':wk.tag==='peak'?'peak':wk.tag==='taper'?'taper':wk.tag==='cut'?'cut':null;
    const blab=wk.tag==='race'?'Race':wk.tag==='peak'?'Peak':wk.tag==='taper'?'Taper':wk.tag==='cut'?'Cutback':null;
    const badge=(bcls?`<span class="badge ${bcls}">${blab}</span>`:"")+(evHere?`<span class="badge event">Event</span>`:"");
    const el=document.createElement("div");
    el.className="week"+(isDone?" done":"");
    const slotRows=wk.workouts.map(s=>{
      const t=effTarget(g,s);
      if(s.completedByRunId){
        const r=runs.find(x=>x.id===s.completedByRunId);
        const paceTxt=(r&&r.distanceKm>0&&r.timeSec>0)?` · ${fmtPace(r.timeSec/r.distanceKm)}/km`:"";
        return `<div class="slotrow"><div class="sl"><b>${esc(slotLabel(g,s))}</b><br><span style="color:var(--mut);font-size:12px">planned ${t} km · actual ${rnd1(s.actualDistanceKm||0)} km${paceTxt}</span></div><div class="st ok">✓ ${r?fmtShort(r.date):""}</div></div>`;
      }
      return `<div class="slotrow"><div class="sl"><b>${esc(slotLabel(g,s))}</b> · ${t} km</div><div class="st">open</div></div>`;
    }).join("");
    const note=evHere&&!isDone?`Your ${esc(evHere.name)} (${fmtDate(evHere.date)}) replaces this week's planned run — don't do both. `:"";
    const tagNote=NOTES[wk.tag]||NOTES.def;
    el.innerHTML=`
      <div class="whead">
        <div class="wnum">WK<b>${wk.week}</b></div>
        <div class="wdist"><div class="km">${tgt}<small> km</small></div><div class="dt">${fmtRange(wk.windowStart,wk.windowEnd)}</div></div>
        ${badge}
        <div class="check"><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#10120e" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      </div>
      <div class="body"><div class="binner">
        <div class="note"><b>${evHere?esc(evHere.name)+":":(wk.tag==="race"?"Race:":"This week:")}</b> ${note}${tagNote}${g.paceHint&&!wk.tag?` Aim for ${g.paceHint}.`:""}</div>
        ${slotRows}
      </div></div>`;
    el.querySelector(".whead").addEventListener("click",()=>el.classList.toggle("open"));
    box.appendChild(el);
  });
}
/* goal creation form */
const DIST_PRESETS=[{l:"5 km",v:5},{l:"10 km",v:10},{l:"21.1 km",v:21.1},{l:"42.2 km",v:42.2},{l:"Custom",v:"custom"}];
let gDist=10,gRpw=2;
function initGoalForm(){
  $("#newGoalBtn").addEventListener("click",()=>$("#goalForm").classList.toggle("open"));
  const db=$("#g-dist");
  db.innerHTML=DIST_PRESETS.map(p=>`<div class="chip${gDist===p.v?' sel':''}" data-v="${p.v}">${p.l}</div>`).join("");
  db.querySelectorAll(".chip").forEach(c=>c.addEventListener("click",()=>{
    gDist=c.dataset.v==="custom"?"custom":parseFloat(c.dataset.v);
    db.querySelectorAll(".chip").forEach(x=>x.classList.toggle("sel",x.dataset.v===String(gDist)));
    $("#g-customWrap").style.display=gDist==="custom"?"block":"none";
  }));
  const rb=$("#g-rpw");
  rb.innerHTML=[1,2,3].map(n=>`<div class="chip${gRpw===n?' sel':''}" data-v="${n}">${n}×/week</div>`).join("");
  rb.querySelectorAll(".chip").forEach(c=>c.addEventListener("click",()=>{
    gRpw=parseInt(c.dataset.v,10);
    rb.querySelectorAll(".chip").forEach(x=>x.classList.toggle("sel",x.dataset.v===String(gRpw)));
  }));
  $("#g-start").value=todayISO();
  $("#g-save").addEventListener("click",()=>{
    const name=$("#g-name").value.trim();
    const race=$("#g-race").value,start=$("#g-start").value||todayISO();
    let km=gDist==="custom"?parseKm($("#g-customKm").value):gDist;
    if(!race){$("#g-race").focus();return;}
    if(!km||km<=0){$("#g-customKm").focus();return;}
    if(race<=start){toast("Race date must be after the start date");return;}
    const g=createGoal({name:name||km+" km race",raceDistanceKm:km,raceDate:race,startDate:start,runsPerWeek:gRpw});
    $("#goalForm").classList.remove("open");
    $("#g-name").value="";$("#g-race").value="";
    renderAll();
    toast(g.status==="active"?`Goal created — ${g.plan.length}-week plan generated`:`Goal created (inactive) — switch with "Make active"`);
  });
}

/* ---------------- weight tab ---------------- */
function renderWeightTab(){
  const chart=$("#weightChart"),list=$("#weightList");if(!chart)return;
  const pts=weights.slice().sort((a,b)=>a.date<b.date?-1:1);
  if(pts.length>1){
    const main=pts.map(p=>({x:dayNum(p.date),y:p.kg}));
    const last=pts[pts.length-1].kg,diff=last-pts[0].kg;
    chart.innerHTML=card("Weight trend",`${last}<small> kg</small>`,
      chartSVG(main,null,v=>rnd1(v),[fmtShort(pts[0].date),fmtShort(pts[pts.length-1].date)]),
      `${diff>0?"+":""}${rnd1(diff)} kg since ${fmtShort(pts[0].date)}`);
  }else if(pts.length===1){
    chart.innerHTML=card("Weight trend",`${pts[0].kg}<small> kg</small>`,`<div class="cempty">First entry logged. Add more to see the trend.</div>`,null);
  }else chart.innerHTML=card("Weight trend","—",`<div class="cempty">Log a weight to start the trend line.</div>`,null);
  list.innerHTML="";
  pts.slice().reverse().forEach(p=>{
    const el=document.createElement("div");el.className="week";
    el.innerHTML=`<div class="whead" style="cursor:default">
      <div class="wdist"><div class="km">${p.kg}<small> kg</small></div><div class="dt">${fmtDate(p.date)}</div></div>
      <button class="del">✕</button></div>`;
    el.querySelector(".del").addEventListener("click",()=>{
      weights=weights.filter(x=>x.id!==p.id);persistAll();renderAll();
    });
    list.appendChild(el);
  });
}

/* ---------------- shell: nav, toast, forms, init ---------------- */
let toastT;
function toast(msg){
  const t=$("#toast");if(!t)return;
  t.textContent=msg;t.classList.add("show");
  clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),2600);
}
function bindNav(){
  document.querySelectorAll("#bnav button").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll("#bnav button").forEach(x=>x.classList.toggle("on",x===b));
    document.querySelectorAll(".tab").forEach(s=>s.classList.toggle("active",s.id===b.dataset.tab));
    window.scrollTo({top:0});
  }));
}
let lrType="easy";
function initLogForm(){
  $("#logRunBtn").addEventListener("click",()=>{
    $("#logRunForm").classList.toggle("open");
    if(!$("#lr-date").value)$("#lr-date").value=todayISO();
  });
  const tb=$("#lr-type");
  tb.innerHTML=typeChips(null,lrType);
  tb.querySelectorAll(".chip").forEach(c=>c.addEventListener("click",()=>{
    lrType=c.dataset.v;
    tb.querySelectorAll(".chip").forEach(x=>x.classList.toggle("sel",x.dataset.v===lrType));
  }));
  $("#lr-save").addEventListener("click",()=>{
    const date=$("#lr-date").value||todayISO();
    const km=parseKm($("#lr-km").value);
    if(!km||km<=0){$("#lr-km").focus();return;}
    const sec=parseTime($("#lr-time").value)||0;
    const run=addRun({date,distanceKm:km,timeSec:sec,type:lrType,notes:$("#lr-notes").value.trim()});
    if(run.goalId){
      const g=goals.find(x=>x.id===run.goalId);
      const wk=g.plan.find(w=>w.week===run.fulfilledWeek);
      const slot=wk.workouts.find(s=>s.completedByRunId===run.id);
      toast(slot?`Run logged ✓ WK${run.fulfilledWeek} ${slotLabel(g,slot)} — planned ${effTarget(g,slot)} / actual ${rnd1(run.distanceKm)} km`:`Run logged ✓ WK${run.fulfilledWeek}`);
    }else toast(getActiveGoal()?"Run logged — bonus volume this week":"Run logged");
    $("#lr-km").value="";$("#lr-time").value="";$("#lr-notes").value="";
    $("#logRunForm").classList.remove("open");
    renderAll();
  });
}
function initWeightForm(){
  $("#addWeightBtn").addEventListener("click",()=>{
    $("#weightForm").classList.toggle("open");
    if(!$("#wt-date").value)$("#wt-date").value=todayISO();
  });
  $("#wt-save").addEventListener("click",()=>{
    const kg=parseKm($("#wt-kg").value),date=$("#wt-date").value||todayISO();
    if(!kg||kg<=0){$("#wt-kg").focus();return;}
    weights.push({id:uid(),date,kg});
    persistAll();
    $("#wt-kg").value="";$("#weightForm").classList.remove("open");
    renderAll();toast("Weight logged");
  });
}
function initSettings(){
  $("#accent").addEventListener("input",e=>{settings.accent=e.target.value;applyAccent(settings.accent);persistAll();});
  $("#exportBtn").addEventListener("click",()=>{
    const data={version:SCHEMA_VERSION,exportedAt:new Date().toISOString(),runs,goals,weights,settings};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);a.download="run-log-export-"+todayISO()+".json";
    a.click();URL.revokeObjectURL(a.href);
  });
}
function renderAll(){
  renderGoalSummary();renderStats();renderWcard();renderCharts();
  renderRunFilters();renderRunList();
  renderGoalList();renderActivePlan();
  renderWeightTab();
}
function init(){
  loadAll();
  applyAccent(settings.accent||"#d4ff3d");
  bindNav();initLogForm();initGoalForm();initWeightForm();initSettings();
  renderAll();
  setInterval(renderGoalSummary,60000); // keep the countdown live
}

/* exposed for debugging + automated tests (harmless in production) */
const __api={get runs(){return runs;},get goals(){return goals;},get weights(){return weights;},get settings(){return settings;},
  loadAll,migrate,persistAll,addRun,updateRun,deleteRun,createGoal,generatePlan,setActiveGoal,setGoalStatus,deleteGoal,
  addCustomEvent,deleteCustomEvent,parseTime,fmtTime,fmtPace,buildLegacyGoal,getActiveGoal,K,SCHEMA_VERSION};
if(typeof globalThis!=="undefined")globalThis.__tracker=__api;

if(typeof document!=="undefined"&&typeof document.getElementById==="function"&&document.getElementById("tab-dash"))init();
