/* ============================================================
   PEDAL, CURTIS, PEDAL! — the Tipsy Bee, playable.
   320×240 canvas · fixed-timestep physics · oscillator-only audio.
   A love letter to a real machine on a real hangar floor, 94-8-27.
   ============================================================ */
'use strict';
(() => {

/* ---------- 0 · boot ---------- */
const W = 320, H = 240, GROUND = 216, DT = 1 / 120, TAU = Math.PI * 2;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const params = new URLSearchParams(location.search);
const QA_AUTOPLAY = params.has('autoplay');
const QA_SPRITE  = params.has('sprite');
const reduceMotion = params.has('rm') ||
  (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

const cv = $('#game'), cx = cv.getContext('2d');
cv.width = W; cv.height = H;
cx.imageSmoothingEnabled = false;

const screenEl = $('.screen');
function fit(){
  const r = screenEl.getBoundingClientRect();
  const k = Math.max(1, Math.min(4, Math.floor(Math.min(r.width / W, r.height / H))));
  cv.style.width  = (W * k) + 'px';
  cv.style.height = (H * k) + 'px';
}
addEventListener('resize', fit);

/* ---------- 1 · tuning (the feel lives here) ---------- */
const TUNE = {
  gravity: 140,          // px/s² down
  pressImpulse: 22,      // cadence added per pedal stroke
  cadenceDecay: 1.9,     // exponential decay /s — stop pedaling, rotor dies
  cadenceMax: 110,
  liftPerCadence: 2.6,   // px/s² lift per cadence unit (before legs & ground effect)
  geHeight: 30,          // ground-effect cushion height, px
  geBonus: 0.35,         // +35% lift on the floor cushion — real HPH physics
  fatigueRate: 0.05,     // legs burn ∝ (cadence/100)^1.5
  fatigueExp: 1.5,
  fatigueRecover: 0.035, // legs recover only when soft-pedaling
  fatigueHit: 0.5,       // legPower = 1 − 0.5·fatigue
  vyMax: 150,
  ceiling: 34,           // hangar rafters
  scroll: 34,            // world scroll px/s
  rival: 19.46,          // Yuri I — Nihon University, 1994. Real number.
  pollenEvery: [1.35, 2.3],
  pollenLegs: 0.07,      // pollen restores legs
  pollenPts: 250,
  timePts: 100,          // per airborne second
};

const PAL = {
  K:'#1A1206', H:'#F5B426', A:'#B8730E', W:'#FBE7A1', C:'#FBF3DE',
  S:'#EDB98A', N:'#33427A', R:'#E0574C', G:'#9BA0B5', V:'#7A5CC4',
  sky0:'#7A5CC4', dust:'#D8C48E',
};

/* ---------- 2 · pixel helpers ---------- */
function sheet(w, h, draw){
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  draw(g);
  return c;
}
function px(g, x, y, w, h, col){ g.fillStyle = col; g.fillRect(x|0, y|0, w, h); }
function line(g, x0, y0, x1, y1, col){
  // 1px bresenham
  x0|=0; y0|=0; x1|=0; y1|=0;
  const dx = Math.abs(x1-x0), sx = x0<x1?1:-1;
  const dy = -Math.abs(y1-y0), sy = y0<y1?1:-1;
  let err = dx + dy;
  g.fillStyle = col;
  for(;;){
    g.fillRect(x0, y0, 1, 1);
    if (x0===x1 && y0===y1) break;
    const e2 = 2*err;
    if (e2 >= dy){ err += dy; x0 += sx; }
    if (e2 <= dx){ err += dx; y0 += sy; }
  }
}

/* ---------- 3 · world art (all prerendered pixels) ---------- */
const SKY = sheet(W, H, g => {
  const bands = [
    ['#7A5CC4',   0], ['#96579F',  46], ['#C4566B',  80],
    ['#E0574C', 106], ['#EE8038', 132], ['#F5A82B', 154], ['#F8C04C', 168],
  ];
  for (let i=0;i<bands.length;i++){
    const y0 = bands[i][1], y1 = i+1<bands.length ? bands[i+1][1] : 200;
    px(g, 0, y0, W, y1-y0, bands[i][0]);
  }
  // checker dither at each seam
  for (let i=1;i<bands.length;i++){
    const y0 = bands[i][1];
    g.fillStyle = bands[i-1][0];
    for (let x=0;x<W;x+=2){
      g.fillRect(x + (y0 % 2), y0, 1, 1);
      g.fillRect(x + ((y0+1) % 2), y0+1, 1, 1);
    }
  }
  // sun — the big honey half-disc from the hero print, riding above the ridges
  const sx0 = 206, sy0 = 172, r = 46;
  for (let y = sy0 - r; y < 176; y++){
    const dy = y - sy0, hw = Math.floor(Math.sqrt(r*r - dy*dy));
    px(g, sx0-hw, y, hw*2, 1, '#F8C04C');
    const hw2 = Math.floor(hw * 0.82);
    px(g, sx0-hw2, y, hw2*2, 1, '#FBE7A1');
    const hw3 = Math.floor(hw * 0.58);
    px(g, sx0-hw3, y, hw3*2, 1, '#FFF6D8');
  }
  // horizontal light streaks, like the hero print
  const streaks = [[18,58,90],[140,64,120],[236,70,70],[30,96,130],[180,112,104],[70,148,150],[210,158,80]];
  g.globalAlpha = 0.35;
  for (const [x,y,len] of streaks) px(g, x, y, len, 1, '#FBE7A1');
  g.globalAlpha = 1;
  px(g, 0, 200, W, 40, '#4E6B34'); // base under layers
});

const RIDGE_W = 480;
const RIDGE_FAR = sheet(RIDGE_W, 60, g => {
  for (let x=0;x<RIDGE_W;x++){
    const h = 20 + 8*Math.sin(x*0.017+2) + 5*Math.sin(x*0.041) + 3*Math.sin(x*0.083+5);
    const top = Math.round(60 - h - 8);
    px(g, x, top, 1, 60-top, '#5A4A8E');
    px(g, x, top, 1, 1, '#6E5AA6');
  }
});
const nearCrest = x =>
  18 + 9*Math.sin(x*0.013+1) + 5*Math.sin(x*0.037+4)
     + 12 * Math.exp(-(((x - 330) / 46) ** 2));            // the bald hill
const RIDGE_NEAR = sheet(RIDGE_W, 70, g => {
  for (let x=0;x<RIDGE_W;x++){
    const top = Math.round(70 - nearCrest(x) - 4);
    px(g, x, top, 1, 70-top, '#46396F');
    px(g, x, top, 1, 1, '#57487F');
  }
  // the last pear tree, alone on the bald hill (see: the orchard)
  const tx = 330, ty = Math.round(70 - nearCrest(330) - 4);
  px(g, tx, ty-4, 1, 4, '#2A2148');
  px(g, tx-2, ty-7, 5, 4, '#33295A');
  px(g, tx-1, ty-8, 3, 1, '#33295A');
});

const ORCH_W = 480;
const ORCHARD = sheet(ORCH_W, 40, g => {
  px(g, 0, 0, ORCH_W, 40, '#3A5527');
  px(g, 0, 0, ORCH_W, 6, '#314A21');
  // comice rows — proper canopies, visible fruit
  for (let i=0;i<Math.floor(ORCH_W/32);i++){
    if (i === 12 || i === 13) continue;          // the barn stands here
    const x = i*32 + 6, tall = i%2 ? 0 : 2;
    px(g, x+7, 19-tall, 3, 6+tall, PAL.A);       // trunk
    px(g, x+1, 10-tall, 15, 10, '#2E4A22');      // canopy shade
    px(g, x+3, 9-tall, 11, 2, '#567A3A');        // lit crown
    px(g, x, 12-tall, 2, 5, '#2E4A22');
    px(g, x+16, 12-tall, 1, 5, '#2E4A22');
    px(g, x+2, 11-tall, 5, 3, '#567A3A');        // dappled light
    px(g, x+3, 13-tall, 2, 2, PAL.H);            // pears you can see
    px(g, x+11, 15-tall, 2, 2, PAL.H);
    if (i%3===0) px(g, x+8, 11-tall, 2, 2, PAL.H);
  }
  // the barn (a nod to the hero print) — stepped gable this time
  px(g, 386, 12, 34, 14, '#8A5A14');
  px(g, 387, 13, 32, 13, PAL.A);
  for (let r=0;r<5;r++) px(g, 384 + r*2, 11 - r, 38 - r*4, 1, '#3A2A18');
  px(g, 384, 12, 38, 1, '#2B1F12');
  px(g, 398, 17, 9, 9, '#4A3208');
  px(g, 400, 13, 5, 3, PAL.H);
});

const GTILE_W = 96;
const GTILE = sheet(GTILE_W, 24, g => {
  px(g, 0, 0, GTILE_W, 1, '#7A9A4C');
  px(g, 0, 1, GTILE_W, 3, '#5D7C3C');
  px(g, 0, 4, GTILE_W, 20, '#4E6B34');
  for (let i=0;i<GTILE_W;i+=24) px(g, i, 4, 11, 20, '#446030'); // mow rows
  px(g, 8, 7, 1, 1, '#7A9A4C'); px(g, 41, 12, 1, 1, '#3A5227');
  px(g, 66, 9, 1, 1, '#7A9A4C'); px(g, 87, 15, 1, 1, '#3A5227');
});

const CLOUDS = [
  sheet(26, 8, g => { px(g,4,2,18,4,'#EFDDF2'); px(g,0,4,26,3,'#EFDDF2'); px(g,6,0,10,3,'#F8EFF8'); px(g,2,6,20,1,'#E3C8E8'); }),
  sheet(18, 6, g => { px(g,2,1,13,3,'#EFDDF2'); px(g,0,3,18,2,'#E3C8E8'); }),
  sheet(34, 9, g => { px(g,5,2,24,4,'#EFDDF2'); px(g,0,5,34,3,'#EFDDF2'); px(g,9,0,12,3,'#F8EFF8'); }),
];

const POLLEN = [0,1].map(f => sheet(9, 9, g => {
  px(g,2,2,5,5,PAL.H); px(g,3,1,3,1,PAL.H); px(g,3,7,3,1,PAL.H);
  px(g,1,3,1,3,PAL.H); px(g,7,3,1,3,PAL.H);
  px(g,3,3,2,2,PAL.W);
  if (f){ px(g,0,0,1,1,PAL.W); px(g,8,8,1,1,PAL.W); }
  else  { px(g,8,0,1,1,PAL.W); px(g,0,8,1,1,PAL.W); }
}));

/* the Tipsy Bee — pilot, pod, bicycle wheels, faith */
function craftSheet(legFrame, gold){
  const HN = gold ? '#FFD75E' : PAL.H;   // pod
  const AC = gold ? PAL.H     : PAL.A;   // stripes
  return sheet(36, 26, g => {
    // mast + braces
    px(g, 16, 0, 2, 10, PAL.G);
    line(g, 16, 3, 11, 9, PAL.K);
    line(g, 17, 3, 22, 9, PAL.K);
    // tail boom + pennant (attached, as pennants should be)
    line(g, 6, 13, 2, 10, PAL.G);
    px(g, 1, 9, 3, 2, PAL.R);
    // pod — bee body
    const rows = [[10,5],[11,8],[12,10],[13,10],[14,9],[15,7],[16,4]];
    for (const [y, hw] of rows){
      px(g, 17-hw, y, hw*2, 1, HN);
      px(g, 17-hw, y, 1, 1, PAL.K);
      px(g, 16+hw, y, 1, 1, PAL.K);
    }
    px(g, 10, 11, 2, 5, AC);  // stripes (inside the outline, thank you)
    px(g, 14, 10, 2, 6, AC);
    px(g, 20, 10, 2, 6, AC);
    px(g, 5, 13, 2, 1, PAL.K); // stinger
    px(g, 17, 10, 2, 1, PAL.W); // canopy glint
    // pilot — white Navy cap, cream jersey, navy legs
    px(g, 19, 1, 6, 2, PAL.C);      // cap
    px(g, 23, 3, 3, 1, PAL.K);      // brim
    px(g, 19, 3, 4, 1, PAL.N);      // band
    px(g, 20, 4, 4, 3, PAL.S);      // head
    px(g, 24, 5, 1, 1, PAL.K);      // eye on the record
    line(g, 19, 10, 21, 7, PAL.C);  // torso
    line(g, 20, 10, 22, 7, PAL.C);
    line(g, 21, 7, 26, 9, PAL.C);   // arm
    px(g, 26, 9, 1, 1, PAL.S);      // hand
    line(g, 26, 8, 27, 12, PAL.K);  // handlebar post
    // legs (2 frames) to crank at (17,17)
    const ped = legFrame ? [[19,15],[15,18]] : [[15,15],[19,18]];
    line(g, 18, 10, 20, 13, PAL.N); line(g, 20, 13, ped[0][0], ped[0][1], PAL.N);
    line(g, 18, 11, 16, 14, PAL.N); line(g, 16, 14, ped[1][0], ped[1][1], PAL.N);
    px(g, ped[0][0]-1, ped[0][1], 3, 1, PAL.K);
    px(g, ped[1][0]-1, ped[1][1], 3, 1, PAL.K);
    px(g, 17, 17, 1, 1, PAL.K);     // crank
    // frame struts
    line(g, 12, 16, 10, 19, PAL.R);
    line(g, 21, 16, 24, 19, PAL.R);
    // wheels — bicycle, of course
    for (const cxw of [10, 24]){
      const ring = [[0,4],[1,4],[2,3],[3,3],[3,2],[4,1],[4,0]];
      g.fillStyle = PAL.K;
      for (const [ox,oy] of ring){
        g.fillRect(cxw+ox, 21+oy, 1, 1); g.fillRect(cxw-ox, 21+oy, 1, 1);
        g.fillRect(cxw+ox, 21-oy, 1, 1); g.fillRect(cxw-ox, 21-oy, 1, 1);
      }
      if (legFrame){ line(g, cxw-3, 21, cxw+3, 21, PAL.G); line(g, cxw, 18, cxw, 24, PAL.G); }
      else { line(g, cxw-2, 19, cxw+2, 23, PAL.G); line(g, cxw-2, 23, cxw+2, 19, PAL.G); }
      px(g, cxw, 21, 1, 1, PAL.K);
    }
  });
}
const CRAFT = [craftSheet(0, false), craftSheet(1, false)];

/* ---------- 4 · audio — oscillators only, after a gesture ---------- */
const store = {
  get(k){ try { return localStorage.getItem('tb-arcade-' + k); } catch(e){ return null; } },
  set(k, v){ try { localStorage.setItem('tb-arcade-' + k, v); } catch(e){} },
};

const Sound = (() => {
  let ctx = null, master = null, rotor = null;
  let muted = store.get('mute') === '1';
  const now = () => ctx.currentTime;

  function ensure(){
    if (ctx){ ctx.resume().catch(()=>{}); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch(e){ return false; }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    // the rotor: two detuned saws → lowpass, thumped by a blade-pass LFO
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'sawtooth';
    o1.frequency.value = 30; o2.frequency.value = 30.6;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 170; lp.Q.value = 0.8;
    const rg = ctx.createGain(); rg.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 2;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0;
    o1.connect(lp); o2.connect(lp); lp.connect(rg); rg.connect(master);
    lfo.connect(lfoG); lfoG.connect(rg.gain);
    o1.start(); o2.start(); lfo.start();
    rotor = { o1, o2, lp, rg, lfo, lfoG };
    return true;
  }
  function rotorUpdate(cad){
    if (!ctx || !rotor) return;
    const T = now(), f = 30 + cad * 1.15;
    rotor.o1.frequency.setTargetAtTime(f, T, .08);
    rotor.o2.frequency.setTargetAtTime(f * 1.012 + .6, T, .08);
    rotor.lp.frequency.setTargetAtTime(160 + cad * 9, T, .08);
    const base = Math.min(.34, cad / 260);
    rotor.rg.gain.setTargetAtTime(base, T, .1);
    rotor.lfo.frequency.setTargetAtTime(1.2 + cad * .055, T, .1);
    rotor.lfoG.gain.setTargetAtTime(base * .55, T, .1);
  }
  function blip(type, f0, f1, dur, vol, when = 0){
    if (!ctx) return;
    const T = now() + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, T);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, T + dur);
    g.gain.setValueAtTime(vol, T);
    g.gain.exponentialRampToValueAtTime(.0008, T + dur);
    o.connect(g); g.connect(master);
    o.start(T); o.stop(T + dur + .05);
  }
  const PENTA = [0, 2, 4, 7, 9];
  return {
    ensure,
    rotorUpdate,
    pedal(){ blip('square', 880, 140, .07, .09); },
    chime(step){
      const oct = Math.pow(2, Math.floor(step / 5) % 2);
      const f = 523.25 * Math.pow(2, PENTA[step % 5] / 12) * oct;
      blip('sine', f, 0, .3, .16);
      blip('triangle', f * 2, 0, .18, .05);
    },
    fanfare(){
      const seq = [659.25, 830.61, 987.77, 1318.5];
      seq.forEach((f, i) => blip('square', f, 0, i === 3 ? .5 : .16, .09, i * .09));
      blip('triangle', 164.8, 220, .6, .08, 0);
    },
    over(){ blip('triangle', 392, 196, .7, .14); blip('square', 98, 49, .5, .07, .05); },
    thud(){ blip('triangle', 130, 55, .18, .16); },
    toggleMute(){
      muted = !muted;
      store.set('mute', muted ? '1' : '0');
      if (ctx) master.gain.setTargetAtTime(muted ? 0 : .8, now(), .02);
      return muted;
    },
    isMuted(){ return muted; },
    suspend(){ if (ctx) ctx.suspend().catch(()=>{}); },
    resume(){ if (ctx) ctx.resume().catch(()=>{}); },
  };
})();

/* ---------- 5 · high scores ---------- */
function loadScores(){
  try {
    const raw = store.get('scores');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? arr.slice(0, 5).sort((a, b) => b.score - a.score)
      : [];
  } catch(e){ return []; }
}
function saveScores(list){ store.set('scores', JSON.stringify(list.slice(0, 5))); }
let scores = loadScores();
const qualifies = sc => sc > 0 && (scores.length < 5 || sc > scores[scores.length - 1].score);

/* ---------- 6 · DOM ---------- */
const ovAttract = $('#ovAttract'), ovPause = $('#ovPause'),
      ovOver = $('#ovOver'), ovEntry = $('#ovEntry');
const btnStart = $('#btnStart'), btnPedal = $('#btnPedal'),
      btnMute = $('#btnMute'), btnPause = $('#btnPause'),
      btnRetry = $('#btnRetry'), btnOk = $('#btnOk'), btnResume = $('#btnResume');
const srStatus = $('#srStatus');
const slots = [...document.querySelectorAll('.slots input')];

function say(msg){ if (srStatus) srStatus.textContent = msg; }

function renderMuteUI(){
  const m = Sound.isMuted();
  btnMute.setAttribute('aria-pressed', String(!m));
  btnMute.textContent = m ? 'SOUND OFF' : 'SOUND ON';
}

function renderScoresUI(){
  const rows = $('#hiRows');
  rows.innerHTML = '';
  const list = scores.length ? scores : [{ini:'YRI', score:1946, time:19.46, rival:true}];
  list.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (r.you) tr.className = 'you';
    tr.innerHTML = `<td>${i + 1} ${r.ini}</td><td>${String(r.score).padStart(6,'0')}</td><td>${r.time.toFixed(2)}s</td>`;
    rows.appendChild(tr);
  });
  const best = scores[0];
  $('#attractBest').textContent = best
    ? `HOUSE BEST ${String(best.score).padStart(6,'0')} ${best.ini}`
    : 'HOUSE BEST — STILL OPEN';
  $('#plaqueBest').innerHTML = best
    ? `<span>${best.ini}</span> · ${String(best.score).padStart(6,'0')} PTS · ${best.time.toFixed(2)}s`
    : 'NOBODY YET. THE SEAT IS YOURS.';
}

/* ---------- 7 · game state ---------- */
let state = 'attract';   // attract | playing | paused | over | entry
let s = null;
let idleT = 0, msgT = 0, msgTxt = '';
let time = 0;            // global clock for twinkle/blink
let shake = 0;

function freshFlight(){
  return {
    y: GROUND, vy: 0, cadence: 0, fatigue: 0,
    airborne: false, air: 0, peak: 0,
    pollen: 0, combo: 0, score: 0,
    recordBeaten: false,
    pollenTimer: rand(TUNE.pollenEvery[0], TUNE.pollenEvery[1]),
    legFrame: 0, pedalPhase: 0, rotorPhase: 0,
    ai: false, aiT: rand(0, 9), aiNext: 0, aiRest: 0,
  };
}
let world = { scrollX: 0, pollen: [], particles: [], floaters: [],
  clouds: [ {x: 40, y: 26, v: 3.2, i: 0}, {x: 170, y: 52, v: 2.1, i: 1}, {x: 260, y: 14, v: 4.4, i: 2} ] };

const rand = (a, b) => a + Math.random() * (b - a);

/* ---------- 8 · state transitions ---------- */
function show(el, on){ if (on) el.removeAttribute('hidden'); else el.setAttribute('hidden', ''); }

function setState(next){
  state = next;
  show(ovAttract, next === 'attract');
  show(ovPause,   next === 'paused');
  show(ovOver,    next === 'over');
  show(ovEntry,   next === 'entry');
  if (next === 'over')  btnRetry.focus();
  if (next === 'entry'){ slots.forEach(i => i.value = ''); slots[0].focus(); }
  if (next === 'paused') btnResume.focus();
}

function startAttract(){
  s = freshFlight();
  s.ai = true;
  world.pollen.length = 0;
  setState('attract');
  if (reduceMotion) renderOnce();
}

function startGame(){
  s = freshFlight();
  world.pollen.length = 0;
  world.floaters.length = 0;
  idleT = 0; msgT = 0;
  Sound.ensure();
  Sound.resume();
  setState('playing');
  ensureLoop();
  say('Flight attempt started. Mash your pedal key to spin the rotor.');
}

function liftoff(){
  s.airborne = true;
}
function touchdown(){
  spawnBurst(84, GROUND, 14, PAL.dust);
  if (!reduceMotion) shake = 3;
  if (s.ai){ // attract: dust yourself off, try again
    s.aiRest = 1.6;
    s.air = 0; s.peak = 0; s.airborne = false; s.combo = 0; s.fatigue = Math.max(0, s.fatigue - .5);
    return;
  }
  Sound.thud();
  endFlight();
}

function endFlight(){
  s.score = Math.round(s.air * TUNE.timePts + s.pollen * TUNE.pollenPts);
  $('#stTime').textContent   = s.air.toFixed(2) + 's';
  $('#stPeak').textContent   = Math.round(s.peak) + ' in';
  $('#stPollen').textContent = String(s.pollen);
  $('#stScore').textContent  = String(s.score).padStart(6, '0');
  $('#beatLine').textContent = s.recordBeaten
    ? '★ YOU OUTLASTED THE YURI I ★'
    : `THE YURI I MARK STANDS: ${TUNE.rival.toFixed(2)}s`;
  Sound.rotorUpdate(0);
  Sound.over();
  say(`Flight over. ${s.air.toFixed(2)} seconds aloft, ${s.pollen} pollen, score ${s.score}.`);
  if (qualifies(s.score)) setState('entry');
  else { renderScoresUI(); setState('over'); }
  idleT = 0;
}

function commitInitials(){
  let ini = slots.map(i => (i.value || '').toUpperCase().replace(/[^A-Z]/g, '')).join('');
  if (!ini) ini = 'BEE';
  ini = (ini + '···').slice(0, 3);
  scores = scores.filter(r => !r.you).map(r => r); // clear "you" flag history
  scores.forEach(r => delete r.you);
  scores.push({ ini, score: s.score, time: +s.air.toFixed(2), you: true });
  scores.sort((a, b) => b.score - a.score);
  scores = scores.slice(0, 5);
  saveScores(scores);
  renderScoresUI();
  setState('over');
  say(`Saved. ${ini} on the board with ${s.score} points.`);
}

function togglePause(){
  if (state === 'playing'){ setState('paused'); Sound.suspend(); }
  else if (state === 'paused'){ setState('playing'); Sound.resume(); }
}

/* ---------- 9 · input ---------- */
const PEDAL_KEYS = ['Space', 'ArrowUp', 'KeyZ', 'KeyX'];

function pedalStroke(){
  if (state === 'attract' || state === 'over'){ startGame(); return; }
  if (state !== 'playing' || s.ai) return;
  s.cadence = Math.min(TUNE.cadenceMax, s.cadence + TUNE.pressImpulse);
  s.legFrame ^= 1;
  Sound.pedal();
}
function aiStroke(){
  s.cadence = Math.min(TUNE.cadenceMax, s.cadence + TUNE.pressImpulse);
  s.legFrame ^= 1;
}
function onStart(){
  if (state === 'attract' || state === 'over') startGame();
  else if (state === 'paused') togglePause();
}

addEventListener('keydown', e => {
  const tgt = e.target;
  const onInput = tgt && tgt.closest && tgt.closest('input');
  if (state === 'entry' && onInput) return;            // dialog owns typing
  const onButton = tgt && tgt.closest && tgt.closest('button, a');
  if (PEDAL_KEYS.includes(e.code)){
    if (e.repeat){ e.preventDefault(); return; }
    e.preventDefault();                                 // space never scrolls, never clicks
    pedalStroke();
  } else if (e.code === 'Enter'){
    if (onButton || onInput) return;                    // let buttons be buttons
    onStart();
  } else if (e.code === 'KeyP'){
    togglePause();
  } else if (e.code === 'KeyM'){
    Sound.toggleMute(); renderMuteUI();
  }
});

btnStart.addEventListener('click', onStart);
btnRetry.addEventListener('click', startGame);
btnResume.addEventListener('click', togglePause);
btnPause.addEventListener('click', togglePause);
btnMute.addEventListener('click', () => { Sound.ensure(); Sound.toggleMute(); renderMuteUI(); });

btnPedal.addEventListener('pointerdown', e => { e.preventDefault(); Sound.ensure(); pedalStroke(); btnPedal.classList.add('pressed'); });
btnPedal.addEventListener('pointerup',   () => btnPedal.classList.remove('pressed'));
btnPedal.addEventListener('pointerleave',() => btnPedal.classList.remove('pressed'));
btnPedal.addEventListener('keydown', e => {
  if (e.code === 'Enter' && !e.repeat){ e.preventDefault(); pedalStroke(); }
});
btnPedal.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', () => { Sound.ensure(); pedalStroke(); });

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause();
});

// initials entry behaviour
slots.forEach((inp, idx) => {
  inp.addEventListener('input', () => {
    inp.value = inp.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
    if (inp.value && idx < 2) slots[idx + 1].focus();
  });
  inp.addEventListener('keydown', e => {
    if (e.code === 'Backspace' && !inp.value && idx > 0){ slots[idx - 1].focus(); }
    else if (e.code === 'ArrowUp' || e.code === 'ArrowDown'){
      e.preventDefault();
      const A = 65, cur = inp.value ? inp.value.charCodeAt(0) : A - 1;
      const nxt = e.code === 'ArrowUp'
        ? (cur >= 90 ? A : cur + 1)
        : (cur <= A ? 90 : cur - 1);
      inp.value = String.fromCharCode(nxt);
    }
    else if (e.code === 'ArrowRight' && idx < 2) slots[idx + 1].focus();
    else if (e.code === 'ArrowLeft'  && idx > 0) slots[idx - 1].focus();
    else if (e.code === 'Enter'){ e.preventDefault(); commitInitials(); }
  });
});
btnOk.addEventListener('click', commitInitials);

/* ---------- 10 · simulation ---------- */
function spawnBurst(x, y, n, col){
  for (let i = 0; i < n; i++){
    world.particles.push({
      x: x + rand(-8, 8), y: y + rand(-2, 0),
      vx: rand(-26, 26), vy: rand(-30, -4),
      life: rand(.3, .7), col,
    });
  }
}

function stepPhysics(dt){
  // cadence decays — stop pedaling and the rotor sighs
  s.cadence *= Math.exp(-TUNE.cadenceDecay * dt);
  const legPower = 1 - TUNE.fatigueHit * s.fatigue;
  const alt = GROUND - s.y;
  const ge = 1 + TUNE.geBonus * Math.max(0, 1 - alt / TUNE.geHeight);
  const lift = s.cadence * TUNE.liftPerCadence * legPower * ge;
  s.vy += (TUNE.gravity - lift) * dt;
  s.vy = clamp(s.vy, -TUNE.vyMax, TUNE.vyMax);
  s.y += s.vy * dt;

  const effort = Math.pow(s.cadence / 100, TUNE.fatigueExp);
  s.fatigue = clamp(
    s.fatigue + TUNE.fatigueRate * effort * dt - (s.cadence < 25 ? TUNE.fatigueRecover * dt : 0),
    0, 1);

  if (s.y < TUNE.ceiling){ s.y = TUNE.ceiling; s.vy = Math.max(s.vy, 0); }
  if (s.y >= GROUND){
    s.y = GROUND;
    const wasAirborne = s.airborne;
    s.vy = 0;
    if (wasAirborne){ s.airborne = false; touchdown(); }
  } else if (!s.airborne && GROUND - s.y > 1.5){
    liftoff();
  }

  if (s.airborne){
    s.air += dt;
    s.peak = Math.max(s.peak, GROUND - s.y);
    if (!s.recordBeaten && !s.ai && s.air > TUNE.rival){
      s.recordBeaten = true;
      msgTxt = 'RIVAL BEATEN!'; msgT = 2.4;
      Sound.fanfare();
      say('Record! You have outlasted the Yuri I at 19.46 seconds.');
    }
  }

  s.rotorPhase += s.cadence * 0.16 * dt * TAU / 6;
  s.pedalPhase += s.cadence * dt;

  // ground-effect dust
  if (alt < 20 && s.cadence > 35 && Math.random() < 26 * dt){
    world.particles.push({
      x: 84 + rand(-12, 12), y: GROUND + rand(0, 2),
      vx: rand(-30, 30) * (alt < 8 ? 1 : .5), vy: rand(-14, -2),
      life: rand(.25, .55), col: PAL.dust,
    });
  }
}

function stepPollen(dt){
  s.pollenTimer -= dt;
  if (s.pollenTimer <= 0){
    s.pollenTimer = rand(TUNE.pollenEvery[0], TUNE.pollenEvery[1]);
    world.pollen.push({
      x: W + 10, y: rand(GROUND - 150, GROUND - 18),
      bob: rand(0, TAU), bobAmp: rand(3, 9),
    });
  }
  for (let i = world.pollen.length - 1; i >= 0; i--){
    const p = world.pollen[i];
    p.x -= (TUNE.scroll + 6) * dt;
    p.bob += dt * 2.2;
    if (p.x < -12){ world.pollen.splice(i, 1); continue; }
    // collect
    const py = p.y + Math.sin(p.bob) * p.bobAmp;
    if (state === 'playing' || state === 'attract'){
      const dx = p.x - 84, dy = py - (s.y - 12);
      if (dx * dx + dy * dy < 132 && (s.airborne || s.y < GROUND - 2)){
        world.pollen.splice(i, 1);
        s.pollen++; s.combo++;
        s.fatigue = clamp(s.fatigue - TUNE.pollenLegs, 0, 1);
        if (!s.ai){
          Sound.chime(s.combo - 1);
          world.floaters.push({ x: p.x, y: py - 6, t: .9, txt: '+' + TUNE.pollenPts });
        }
        spawnBurst(p.x, py, 7, PAL.H);
      }
    }
  }
}

function stepAttractAI(dt){
  if (s.aiRest > 0){ s.aiRest -= dt; return; }
  s.aiT += dt;
  let target = 55 + 22 * Math.sin(s.aiT * 0.55);
  if ((s.aiT % 9) < 1.15) target = 0;             // the demo pilot cramps up
  if (target > 6){
    s.aiNext -= dt;
    if (s.aiNext <= 0 && s.cadence < target + 8){
      aiStroke();
      s.aiNext = (11 / Math.max(14, target)) * rand(.75, 1.35);
    }
  }
}

function stepWorld(dt){
  world.scrollX += TUNE.scroll * dt;
  for (const c of world.clouds){
    c.x -= c.v * dt;
    if (c.x < -40) c.x = W + rand(0, 60);
  }
  for (let i = world.particles.length - 1; i >= 0; i--){
    const p = world.particles[i];
    p.life -= dt;
    if (p.life <= 0){ world.particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt;
    if (p.y > GROUND + 4) p.y = GROUND + 4;
  }
  for (let i = world.floaters.length - 1; i >= 0; i--){
    const f = world.floaters[i];
    f.t -= dt; f.y -= 14 * dt;
    if (f.t <= 0) world.floaters.splice(i, 1);
  }
  if (shake > 0) shake = Math.max(0, shake - 12 * dt);
  if (msgT > 0) msgT -= dt;
}

function step(dt){
  time += dt;
  if (state === 'paused') return;
  stepWorld(dt);
  if (state === 'attract'){ stepAttractAI(dt); stepPhysics(dt); stepPollen(dt); }
  else if (state === 'playing'){ if (s.ai) stepAttractAI(dt); stepPhysics(dt); stepPollen(dt); }
  else if (state === 'over' || state === 'entry'){
    // rotor spins down while the dust settles
    s.cadence *= Math.exp(-TUNE.cadenceDecay * dt);
    s.rotorPhase += s.cadence * 0.16 * dt * TAU / 6;
    idleT += dt;
    if (state === 'over' && idleT > 14) startAttract();
  }
  Sound.rotorUpdate(state === 'playing' && !s.ai ? s.cadence : 0);
}

/* ---------- 11 · render ---------- */
function txt(t, x, y, col, align){
  cx.font = '8px "Press Start 2P", monospace';
  cx.textBaseline = 'top';
  cx.textAlign = align || 'left';
  cx.fillStyle = PAL.K;
  cx.fillText(t, x + 1, y + 1);
  cx.fillStyle = col;
  cx.fillText(t, x, y);
  cx.textAlign = 'left';
}

function drawLayer(img, speed, y){
  const w = img.width;
  const off = -Math.floor((world.scrollX * speed) % w);
  cx.drawImage(img, off, y);
  cx.drawImage(img, off + w, y);
}

function render(){
  cx.save();
  if (shake > 0 && !reduceMotion){
    cx.translate(Math.round(rand(-shake, shake)), Math.round(rand(-shake, shake)));
  }
  cx.drawImage(SKY, 0, 0);
  for (const c of world.clouds) cx.drawImage(CLOUDS[c.i], Math.round(c.x), c.y);
  drawLayer(RIDGE_FAR,  0.18, 116);
  drawLayer(RIDGE_NEAR, 0.34, 106);
  drawLayer(ORCHARD,    0.62, 176);
  drawLayer(GTILE,      1.0,  GROUND);

  // pollen
  for (const p of world.pollen){
    const py = p.y + Math.sin(p.bob) * p.bobAmp;
    cx.drawImage(POLLEN[(time * 6 | 0) % 2], Math.round(p.x) - 4, Math.round(py) - 4);
  }

  if (s){
    const alt = GROUND - s.y;
    // shadow
    const shW = Math.max(6, Math.round(26 * (1 - alt / 280)));
    cx.globalAlpha = Math.max(.08, .35 * (1 - alt / 240));
    px(cx, 84 - (shW >> 1), GROUND + 3, shW, 2, PAL.K);
    cx.globalAlpha = 1;
    // craft — wheels bottom sits at s.y
    const sprY = Math.round(s.y) - 25;
    cx.drawImage(CRAFT[s.legFrame], 84 - 17, sprY);
    // rotor
    const hubY = sprY - 1, hubX = 84;
    const L = Math.round(26 * Math.abs(Math.cos(s.rotorPhase)));
    if (s.cadence > 64){
      cx.globalAlpha = .30;
      px(cx, hubX - 27, hubY, 54, 1, PAL.W);
      cx.globalAlpha = 1;
    }
    px(cx, hubX - L, hubY, Math.max(2, L * 2), 1, PAL.K);
    px(cx, hubX - L, hubY, 2, 1, PAL.W);
    px(cx, hubX + L - 2, hubY, 2, 1, PAL.W);
  }

  // particles & floaters
  for (const p of world.particles){
    cx.globalAlpha = clamp(p.life * 2.2, 0, 1);
    px(cx, p.x, p.y, 1, 1, p.col);
  }
  cx.globalAlpha = 1;
  for (const f of world.floaters){
    cx.globalAlpha = clamp(f.t * 1.6, 0, 1);
    txt(f.txt, Math.round(f.x) - 8, Math.round(f.y), PAL.H);
  }
  cx.globalAlpha = 1;

  drawHUD();
  cx.restore();
}

function drawHUD(){
  if (!s) return;
  if (state === 'attract'){
    if ((time * 1.4 | 0) % 2) txt('DEMO', W - 8, 6, PAL.W, 'right');
    return;
  }
  // left: clock vs the rival
  txt('TIME ' + s.air.toFixed(2), 8, 6, '#FFFFFF');
  if (s.recordBeaten){
    if ((time * 3 | 0) % 2) txt('REC! BEAT 19.46', 8, 17, PAL.H);
  } else {
    txt('RIVAL 19.46', 8, 17, '#FFD1C4');
  }
  // right: altitude + pollen
  txt('ALT ' + String(Math.round(GROUND - s.y)).padStart(3, ' ') + '"', W - 8, 6, '#FFFFFF', 'right');
  txt('POLLEN ' + String(s.pollen).padStart(2, '0'), W - 8, 17, PAL.W, 'right');
  // legs meter
  const fx = 8, fy = H - 16;
  txt('LEGS', fx, fy, PAL.W);
  const bw = 64, fill = Math.round(bw * (1 - s.fatigue));
  px(cx, fx + 42, fy - 1, bw + 2, 9, PAL.K);
  px(cx, fx + 43, fy, bw, 7, '#2A1B10');
  const col = s.fatigue < .45 ? PAL.H : s.fatigue < .75 ? PAL.R : PAL.V;
  if (fill > 0 && (s.fatigue < .82 || (time * 4 | 0) % 2)) px(cx, fx + 43, fy, fill, 7, col);
  // center message
  if (msgT > 0 && (time * 3 | 0) % 2) txt(msgTxt, W / 2, 84, PAL.H, 'center');
  if (state === 'paused') txt('PAUSED', W / 2, 110, '#FFFFFF', 'center');
}

function renderOnce(){
  // reduced-motion attract: a single still title-card frame
  render();
}

/* ---------- 12 · sprite QA view (?sprite) ---------- */
function spriteView(){
  cx.fillStyle = '#241733'; cx.fillRect(0, 0, W, H);
  cx.imageSmoothingEnabled = false;
  cx.drawImage(CRAFT[0], 0, 0, 36, 26, 10, 20, 144, 104);
  cx.drawImage(CRAFT[1], 0, 0, 36, 26, 166, 20, 144, 104);
  cx.drawImage(POLLEN[0], 0, 0, 9, 9, 10, 140, 45, 45);
  cx.drawImage(POLLEN[1], 0, 0, 9, 9, 70, 140, 45, 45);
  cx.drawImage(GTILE, 0, 140, 96, 24, 130, 140, 96, 24);
  cx.drawImage(ORCHARD, 0, 0, 120, 40, 130, 170, 120, 40);
  txt('SPRITE QA', 10, 6, PAL.H);
}

/* ---------- 13 · main loop ---------- */
let last = 0, acc = 0, rafId = 0;
function frame(t){
  if (reduceMotion && state === 'attract'){
    // reduced motion: attract is a still title card, not a movie
    render();
    rafId = 0;
    return;
  }
  rafId = requestAnimationFrame(frame);
  if (!last) last = t;
  const dt = Math.min(.1, (t - last) / 1000);
  last = t;
  acc += dt;
  while (acc >= DT){ step(DT); acc -= DT; }
  render();
}
function ensureLoop(){
  if (!rafId){ last = 0; rafId = requestAnimationFrame(frame); }
}

function boot(){
  fit();
  renderMuteUI();
  renderScoresUI();
  if (QA_SPRITE){ spriteView(); return; }
  s = freshFlight();
  s.ai = true;
  if (QA_AUTOPLAY){
    // QA harness: run a real (silent, AI-driven) game so gameplay
    // code paths execute under the console-error check.
    startGame();
    s.ai = true;
    requestAnimationFrame(frame);
    return;
  }
  setState('attract');
  if (reduceMotion){
    renderOnce();          // still title card; no animation loop
    return;
  }
  ensureLoop();
}

// start the loop once the pixel font is ready (falls back gracefully)
if (document.fonts && document.fonts.load){
  document.fonts.load('8px "Press Start 2P"').catch(() => {}).finally(boot);
} else {
  boot();
}

})();
