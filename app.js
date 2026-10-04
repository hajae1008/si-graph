/* ══════════════════════════════════════════════════════════════
   두 페이지가 같이 쓰는 엔진.
     index.html     → 인생 그래프 (window.PAGE = "graph")
     interview.html → 지인 인터뷰 (window.PAGE = "talk")
   내용은 data.js 에, 생김새는 style.css 에 있다.
   ══════════════════════════════════════════════════════════════ */

/* 마크업은 두 페이지가 똑같다. 한 군데서만 쓰고 양쪽에 꽂는다. */
document.body.insertAdjacentHTML("afterbegin", `
<div id="scroller">
  <div id="stage">
    <div id="kicker"></div>

    <div id="lines"></div>

    <aside id="panel">
      <div id="p-view">
        <div id="p-meta"></div>
        <p id="p-body"></p>
      </div>

      <div id="p-edit-talk">
        <div class="fld"><span class="lbl">WHO</span><input id="t-who" type="text" placeholder="이름"></div>
        <div class="fld"><span class="lbl">REL</span><input id="t-rel" type="text" placeholder="엄마 · 대학 동기 · 전 직장 동료"></div>
        <textarea id="t-body" placeholder="그 사람이 한 말을 그대로 옮겨 적으세요."></textarea>
        <div class="acts">
          <button class="mono-btn" data-act="add">+ 아래에 추가</button>
          <button class="mono-btn danger" data-act="del">삭제</button>
        </div>
      </div>

      <div id="p-edit">
        <div class="fld">
          <span class="lbl">YEAR</span>
          <input id="e-year" type="number" inputmode="numeric">
          <span id="e-age"></span>
        </div>
        <div class="fld">
          <span class="lbl">HIGH</span>
          <input id="e-score" type="range" min="-5" max="5" step="1">
          <span id="e-sv"></span>
        </div>
        <textarea id="e-body" placeholder="그때의 이야기를 두세 문장으로."></textarea>
        <div class="acts">
          <button class="mono-btn" data-act="add">+ 아래에 추가</button>
          <button class="mono-btn" data-act="sort">연도순</button>
          <button class="mono-btn danger" data-act="del">삭제</button>
          <button class="mono-btn danger" data-act="reset">초안 버리기</button>
        </div>
      </div>
    </aside>

    <div class="card" id="hero">
      <h1></h1>
    </div>

    <button class="mono-btn" id="modebtn"></button>
    <button class="mono-btn" id="editbtn">수정하기 →</button>
    <button class="mono-btn" id="done">← 편집 완료</button>
  </div>
</div>

<div id="bar">
  <label class="barfld"><span>BORN</span><input id="e-birth" type="date"></label>
  <span id="status"></span>
  <button id="dl">JSON 내려받기</button>
</div>
`);

let D = window.LIFE;

/* ══════════════════════════════════════════════════════════════
   ▼ 이 사이트의 내용은 전부 여기 있다. 여기를 고치면 사이트가 바뀐다.

   label : 큰 글자로 나갈 말. 짧을수록 세다 (2~5자가 가장 예쁨)
   score : -5(바닥) ~ +5(최고). 이 값이 글자를 좌우로 민다
   body  : 왼쪽에 뜨는 이야기. 두세 문장

   손으로 고쳐도 되고, 로컬에서 ?edit 을 붙여 화면에서 고친 뒤
   「JSON 내려받기」로 받은 값을 여기에 붙여넣어도 된다.

   ══════════════════════════════════════════════════════════════ */


/* ═════════════════════════════════════════════════════════════ */

const $ = s => document.querySelector(s);
const scroller=$("#scroller"), linesEl=$("#lines"), panelEl=$("#panel");
const heroEl=$("#hero");
const pMeta=$("#p-meta"), pBody=$("#p-body");
const editBtn=$("#editbtn"), statusEl=$("#status"), modeBtn=$("#modebtn");

/* 데이터가 코드 안에 있으므로 배포본에서 고쳐봐야 갈 곳이 없다.
   편집은 내 컴퓨터에서만 연다. */
const LOCAL = ["localhost","127.0.0.1","[::1]",""].includes(location.hostname);
const EDIT  = LOCAL && new URLSearchParams(location.search).has("edit");
const DRAFT = "lg.draft";

/* 화면은 둘이다. 내가 쓴 내 이야기(graph), 남이 말한 나(talk).
   타이포 방식은 같지만 talk 에는 점수가 없어 좌우로 밀지 않는다. */
const mode = (window.PAGE === "talk") ? "talk" : "graph";
const isTalk = () => mode === "talk";
const list   = () => isTalk() ? (D.interviews ||= []) : D.events;
const labelOf = e => (isTalk() ? e.keyword : e.label) || "";

let EV = D.events;
let nodes = [], L = {}, idx = -1, dirty = false;

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const ease=t=>1-Math.pow(1-t,2.4);

/* 생년월일. 옛 데이터(birthYear만 있는 것)도 받아준다. */
function birthDate(){
  const raw = D.birth || (D.birthYear ? D.birthYear+"-01-01" : "");
  const d = raw ? new Date(raw+"T00:00:00") : null;
  return d && !isNaN(d) ? d : null;
}

/* 그 해의 만 나이.
   사건에는 연도만 있으므로 '그 해 말일'과 '오늘' 중 이른 쪽을 기준으로 센다.
   지난 해는 생일이 지난 나이가, 올해는 오늘 기준 실제 나이가 나온다. */
function ageAt(year){
  const b = birthDate(); if(!b) return null;
  const now = new Date(), end = new Date(year,11,31);
  const at = end < now ? end : now;
  if (at < b) return null;                     // 태어나기 전
  let a = at.getFullYear() - b.getFullYear();
  const m = at.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < b.getDate())) a--;
  return a;
}
const ageLabel = y => { const a = ageAt(y); return a===null ? "" : `  ·  ${a}세`; };

/* ── 렌더 ─────────────────────────────────────────────────── */
function build(){
  EV = list();
  heroEl.querySelector("h1").textContent =
    isTalk() ? (D.talkTitle || "사람들이 본 나") : (D.name || "");
  linesEl.innerHTML = "";
  nodes = EV.map((e,i)=>{
    const el = document.createElement("div");
    el.className = "ev";
    el.textContent = labelOf(e);
    // 맨 위에서는 초점이 이미 0번에 있어 첫 글자를 눌러도 안 움직였다.
    // 보기 모드에서는 항상 이동한다. 편집 중일 때만, 지금 고치는 글자를
    // 누른 경우를 빼고 이동한다(커서를 놓으려는 클릭이므로).
    el.addEventListener("click", ()=>{ if(!EDIT || i!==idx) jumpTo(i); });
    if (EDIT){
      el.addEventListener("input", ()=>{
        const v = el.textContent.replace(/\n/g," ").trim();
        if(isTalk()) EV[i].keyword = v; else EV[i].label = v;
        markDirty(); fit(el);
      });
      el.addEventListener("keydown", ev=>{
        if(ev.key==="Enter"){ ev.preventDefault(); el.blur(); }
      });
    }
    linesEl.appendChild(el);
    return el;
  });
  idx = -1;
  document.body.classList.toggle("talk", isTalk());
  modeBtn.textContent = isTalk() ? "← 인생 그래프" : "지인 인터뷰 →";
  // 늘 보인다. 조건을 걸면 정작 찾아야 할 때 안 보인다.
  modeBtn.classList.add("show");
  if(!EV.length){
    pMeta.textContent = "";
    pBody.textContent = isTalk()
      ? "아직 인터뷰가 없습니다."
      : "아직 사건이 없습니다.";
    if(EDIT) say("아직 비어 있습니다 · 「+ 아래에 추가」로 시작하세요");
  }
  if(EDIT){
    // toISOString()을 거치면 UTC로 넘어가며 하루가 밀린다. 문자열을 그대로 쓴다.
    $("#e-birth").value = /^\d{4}-\d{2}-\d{2}$/.test(D.birth||"") ? D.birth
      : (D.birthYear ? D.birthYear+"-01-01" : "");
  }
  layout();
}

function fit(el){
  el.style.fontSize = L.fs + "px";
  const nat = el.offsetWidth;
  if (nat > L.avail) el.style.fontSize = (L.fs * L.avail / nat) + "px";
}

function layout(){
  const w=innerWidth, h=innerHeight, narrow = w<720;
  L.step = narrow?250:330;
  L.fs   = clamp(w*(narrow?.105:.076),30,96);
  L.gap  = L.fs*1.12;
  L.pad  = parseFloat(getComputedStyle(document.documentElement)
             .getPropertyValue("--pad"))||32;
  L.maxOff = Math.min(w*(narrow?.22:.19),250);
  L.axis = narrow ? h*0.38 : h*0.50;
  const panelBlock = narrow ? 0 : Math.min(330,w*.32)+L.pad+40;
  L.avail = w - L.pad - L.maxOff - panelBlock - 12;

  nodes.forEach(fit);
  scroller.style.height = ((EV.length + 0.75)*L.step + h) + "px";
  update();
}

const offsetOf = s => (1 - (clamp(s,-5,5)+5)/10) * L.maxOff;
const offsetAt = i => isTalk() ? 0 : offsetOf(EV[i].score);

function update(){
  const p = scrollY/L.step - 1.75;

  for(let i=0;i<nodes.length;i++){
    const d=Math.abs(i-p), y=L.axis+(i-p)*L.gap, el=nodes[i];
    if(y < -L.gap*2 || y > innerHeight+L.gap*2 || d>8){
      el.style.visibility="hidden"; continue;
    }
    el.style.visibility="visible";
    el.style.transform=`translate3d(${-offsetAt(i)}px,${y-L.fs*0.62}px,0)`;
    const near=ease(clamp(1-d,0,1)), far=clamp(1-d/4.6,0,1);
    el.style.color=`rgba(var(--ink),${(0.10+0.90*near)*far})`;
  }

  const ni = clamp(Math.round(p),0,EV.length-1);
  if(ni!==idx) focus(ni);

  const near = 1 - clamp(Math.abs(p-Math.round(p))*2.3,0,1);
  panelEl.style.opacity = (EDIT || !EV.length) ? 1
    : ((p>-0.5 && p<EV.length-0.5) ? near : 0);

  const heroA = clamp(-(p+0.55)/0.7,0,1);
  heroEl.style.opacity = heroA;
  // 투명한 카드가 화면 전체를 덮고 클릭을 삼키지 않도록
  heroEl.style.pointerEvents = (EDIT && heroA > 0.5) ? "auto" : "none";
}

/* 초점이 바뀔 때만 패널·편집 대상을 갈아끼운다 */
function focus(i){
  if(idx>=0 && nodes[idx]) nodes[idx].removeAttribute("contenteditable");
  idx = i;
  const e = EV[i]; if(!e) return;
  pMeta.textContent = isTalk()
    ? [e.who, e.relation].filter(Boolean).join("  ·  ")
    : e.year + ageLabel(e.year);
  pBody.textContent = e.body || "";
  if(EDIT){
    nodes[i].setAttribute("contenteditable","plaintext-only");
    if(isTalk()){
      $("#t-who").value  = e.who || "";
      $("#t-rel").value  = e.relation || "";
      $("#t-body").value = e.body || "";
    }else{
      $("#e-year").value = e.year;
      $("#e-age").textContent = ageLabel(e.year).replace(/^\s*·\s*/,"");
      $("#e-score").value = e.score;
      $("#e-sv").textContent = (e.score>0?"+":"") + e.score;
      $("#e-body").value = e.body || "";
    }
  }
}

/* 부드러운 스크롤을 조용히 무시하는 환경이 있다.
   잠시 뒤에도 제자리면 그냥 옮긴다. 클릭이 먹통이 되는 것보다 낫다. */
function jumpTo(i){
  const top = (i+1.75)*L.step, from = scrollY;
  scrollTo({top, behavior:"smooth"});
  setTimeout(()=>{
    if(scrollY === from && Math.abs(top-from) > 2) scrollTo({top, behavior:"instant"});
  }, 150);
}

/* 다른 페이지로 건너간다. 편집 중이었다면 저쪽도 편집 상태로 연다. */
modeBtn.addEventListener("click", ()=>{
  const to = isTalk() ? "index.html" : "interview.html";
  location.href = to + (EDIT ? "?edit" : "");
});

/* ── 편집 ─────────────────────────────────────────────────── */
function refreshAges(){
  const e = EV[idx]; if(!e) return;
  pMeta.textContent = e.year + ageLabel(e.year);
  const f = $("#e-age"); if(f) f.textContent = ageLabel(e.year).replace(/^\s*·\s*/,"");
}

/* 고친 내용은 이 브라우저에 임시로 담아둔다.
   공개되는 건 아니고, 창을 닫아도 작업이 날아가지 않게 하는 용도다. */
function markDirty(){
  dirty = true;
  $("#dl").classList.add("dirty");
  try{ localStorage.setItem(DRAFT, JSON.stringify(D)); }catch(e){}
  say("이 브라우저에 임시 저장됨 · 내려받아야 반영됩니다");
}
function say(m){ statusEl.textContent = m; }

function initEdit(){
  document.body.classList.add("edit");
  $("#kicker").textContent = "편집 중";

  // 지난번에 고치다 만 게 있으면 이어서 한다
  try{
    const d = JSON.parse(localStorage.getItem(DRAFT) || "null");
    if(d && Array.isArray(d.events) && d.events.length){
      D = d; D.interviews ||= []; dirty = true;
      say("지난 초안을 불러왔습니다");
    }
  }catch(e){}

  const h1 = heroEl.querySelector("h1");
  h1.setAttribute("contenteditable","plaintext-only");
  h1.addEventListener("input",()=>{
    const v = h1.textContent.trim();
    if(isTalk()) D.talkTitle = v; else D.name = v;
    markDirty();
  });

  $("#e-birth").addEventListener("input",e=>{
    D.birth = e.target.value;
    delete D.birthYear;
    refreshAges(); markDirty();
  });
  $("#t-who").addEventListener("input",e=>{ EV[idx].who = e.target.value;
    pMeta.textContent = [EV[idx].who, EV[idx].relation].filter(Boolean).join("  ·  ");
    markDirty(); });
  $("#t-rel").addEventListener("input",e=>{ EV[idx].relation = e.target.value;
    pMeta.textContent = [EV[idx].who, EV[idx].relation].filter(Boolean).join("  ·  ");
    markDirty(); });
  $("#t-body").addEventListener("input",e=>{ EV[idx].body = e.target.value; markDirty(); });

  $("#e-year").addEventListener("input",e=>{
    const v = parseInt(e.target.value,10);
    if(!isNaN(v)){ EV[idx].year=v;
      $("#e-age").textContent=ageLabel(v).replace(/^\s*·\s*/,""); markDirty(); }
  });
  $("#e-score").addEventListener("input",e=>{
    EV[idx].score = parseInt(e.target.value,10);
    $("#e-sv").textContent=(EV[idx].score>0?"+":"")+EV[idx].score;
    markDirty(); update();
  });
  $("#e-body").addEventListener("input",e=>{
    EV[idx].body = e.target.value; markDirty();
  });

  document.querySelectorAll("[data-act]").forEach(b=>{
    b.addEventListener("click",()=>act(b.dataset.act));
  });
  $("#dl").addEventListener("click",download);
  $("#done").addEventListener("click",()=>{ location.href = location.pathname; });

  if(!dirty) say("고친 내용은 「JSON 내려받기」로 꺼내 코드에 넣습니다");
}

/* 화면에서 고친 결과를 파일로 꺼낸다. 이 파일이 코드로 들어가야 공개된다. */
function download(){
  const blob = new Blob([JSON.stringify(D,null,2)],{type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "life.json";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  say("life.json 내려받음 · 이 파일을 코드에 반영하세요");
}

function act(a){
  if(a==="add"){
    const cur = EV[idx];
    const item = isTalk()
      ? {who:"", relation:"", keyword:"새 인터뷰", body:""}
      : {year:(cur?.year||2000)+1, label:"새 사건", score:0, body:""};
    const to = Math.max(idx,-1) + 1;      // 비어 있으면 0번에 넣는다
    EV.splice(to,0,item);
    markDirty(); build(); requestAnimationFrame(()=>jumpTo(to));
  }
  if(a==="del"){
    if(EV.length<1 || idx<0) return;
    if(!confirm(`"${labelOf(EV[idx])}" 을 지울까요?`)) return;
    EV.splice(idx,1);
    const to = clamp(idx,0,EV.length-1); markDirty(); build();
    requestAnimationFrame(()=>jumpTo(to));
  }
  if(a==="sort"){
    const keep = EV[idx];
    EV.sort((a,b)=>a.year-b.year);
    const to = EV.indexOf(keep); markDirty(); build();
    requestAnimationFrame(()=>jumpTo(to));
  }
  if(a==="reset"){
    if(!confirm("이 브라우저의 초안을 버리고 코드에 있는 내용으로 되돌릴까요?")) return;
    try{ localStorage.removeItem(DRAFT); }catch(e){}
    location.reload();
  }
}

/* ── 스크롤 추적 ──────────────────────────────────────────────
   이벤트 하나만 믿으면 프로그램적 스크롤을 놓치는 환경이 있고,
   프레임 루프 하나만 믿으면 문서가 숨겨진 동안 멈춘다. */
let lastY = -1;
function sync(){ if(scrollY!==lastY){ lastY=scrollY; update(); } }
(function tick(){ sync(); requestAnimationFrame(tick); })();
addEventListener("scroll", sync, {passive:true});
addEventListener("visibilitychange", sync);
addEventListener("resize", layout);

(function init(){
  if(EDIT) initEdit();
  if(!EDIT && LOCAL){
    // 편집은 내 컴퓨터에서만. 배포된 사이트에는 이 버튼이 없다.
    editBtn.classList.add("show");
    editBtn.addEventListener("click",()=>{ location.href = location.pathname + "?edit"; });
  }
  build();
  if(document.fonts?.ready) document.fonts.ready.then(layout);
})();
