/* The Orchard — Tipsy Bee Farms
   A Comice pear tree, grown live by a seeded stochastic L-system.
   Axiom A(l,w). Eight rewriting passes. Angles jittered per instance.
   Wood grows stem-by-stem with scroll; blossom falls into fruit; gold hour lands. */
'use strict';
(() => {
  const canvas = document.getElementById('tree');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const track = document.getElementById('grove');
  const stage = document.querySelector('.stage');
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const TAU = Math.PI * 2, UP = -Math.PI / 2;
  const INK = '#3C2915', INK_CORE = '#241708';

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ---------------- seed ----------------
  function seedFromHash() {
    const m = location.hash.match(/graft=([0-9A-Fa-f]{1,6})/);
    if (m) return parseInt(m[1], 16) >>> 0;
    return (Math.random() * 0xFFFF) | 0;
  }
  let SEED = seedFromHash();

  // ---------------- L-system ----------------
  // Symbols: A apex/leader bud · B lateral bud · F wood segment · S fruiting spur · +/- turns · [ ] push/pop
  function rewrite(rng) {
    const R = (a, b) => a + rng() * (b - a);
    // two clean trunk segments before the first scaffold — a pear has a bole
    let toks = [{ s: 'F', l: 66, w: 23 }, { s: 'F', l: 58, w: 21.5 }, { s: 'A', l: 56, w: 20 }];
    const ITER = 8;
    for (let i = 0; i < ITER; i++) {
      const out = [];
      const last = i === ITER - 1;
      for (const t of toks) {
        if (t.s === 'A') {
          if (last) { out.push({ s: 'F', l: t.l * 0.7, w: t.w }, { s: 'S' }); continue; }
          const r = rng();
          const a1 = { s: '+', a: R(0.30, 0.68) }, a2 = { s: '-', a: R(0.30, 0.68) };
          if (r < 0.5) out.push(
            { s: 'F', l: t.l, w: t.w }, { s: '[' }, a1, { s: 'B', l: t.l * R(0.72, 0.95), w: t.w * 0.52 }, { s: ']' },
            { s: 'F', l: t.l * 0.92, w: t.w * 0.9 }, { s: '[' }, a2, { s: 'B', l: t.l * R(0.68, 0.9), w: t.w * 0.48 }, { s: ']' },
            { s: 'F', l: t.l * 0.88, w: t.w * 0.84 }, { s: 'A', l: t.l * 0.8, w: t.w * 0.78 });
          else if (r < 0.85) out.push(
            { s: 'F', l: t.l, w: t.w }, { s: '[' }, a2, { s: 'B', l: t.l * R(0.72, 0.95), w: t.w * 0.52 }, { s: ']' },
            { s: 'F', l: t.l * 0.9, w: t.w * 0.88 }, { s: '[' }, a1, { s: 'B', l: t.l * R(0.68, 0.9), w: t.w * 0.48 }, { s: ']' },
            { s: 'A', l: t.l * 0.82, w: t.w * 0.8 });
          else out.push(
            { s: 'F', l: t.l, w: t.w }, { s: '[' }, a1, { s: 'B', l: t.l * R(0.7, 0.9), w: t.w * 0.5 }, { s: ']' },
            { s: '[' }, a2, { s: 'B', l: t.l * R(0.66, 0.86), w: t.w * 0.48 }, { s: ']' },
            { s: 'A', l: t.l * 0.84, w: t.w * 0.8 });
        } else if (t.s === 'B') {
          if (last) { out.push({ s: 'S' }); continue; }
          const r = rng();
          const a1 = { s: '+', a: R(0.34, 0.72) }, a2 = { s: '-', a: R(0.34, 0.72) };
          if (r < 0.5) out.push(
            { s: 'F', l: t.l, w: t.w }, { s: '[' }, a1, { s: 'B', l: t.l * 0.8, w: t.w * 0.6 }, { s: ']' },
            { s: 'F', l: t.l * 0.85, w: t.w * 0.82 }, { s: 'B', l: t.l * 0.78, w: t.w * 0.72 });
          else if (r < 0.8) out.push(
            { s: 'F', l: t.l, w: t.w }, { s: '[' }, a2, { s: 'B', l: t.l * 0.78, w: t.w * 0.6 }, { s: ']' },
            { s: 'B', l: t.l * 0.8, w: t.w * 0.74 });
          else out.push({ s: 'F', l: t.l, w: t.w }, { s: 'S' });
        } else out.push(t);
      }
      toks = out;
    }
    return toks;
  }

  // ---------------- turtle → skeleton ----------------
  function interpret(toks, rng) {
    const R = (a, b) => a + rng() * (b - a);
    const nodes = [], spurs = [];
    let st = { parent: -1, head: UP + R(-0.06, 0.06), dist: 0, depth: 0 };
    const stack = [];
    for (const t of toks) {
      if (t.s === '[') { stack.push({ parent: st.parent, head: st.head, dist: st.dist, depth: st.depth }); st.depth++; }
      else if (t.s === ']') { st = stack.pop(); }
      else if (t.s === '+') st.head += t.a;
      else if (t.s === '-') st.head -= t.a;
      else if (t.s === 'F') {
        let h = st.head;
        if (t.w > 9) { h += (UP - h) * 0.10 + R(-0.055, 0.055); }   // thick wood reaches, but meanders
        else {
          h += R(-0.10, 0.10);                                      // thin wood wanders
          h += (h > UP ? 1 : -1) * 0.075 * (1 - t.w / 9);           // …and arcs outward
        }
        const len = t.l * R(0.84, 1.18);
        const i = nodes.length;
        const parentAbs = st.parent >= 0 ? nodes[st.parent].abs : UP;
        nodes.push({
          p: st.parent, rel: h - parentAbs, abs: h, len,
          w0: t.w, w1: Math.max(1.1, t.w * 0.74),
          d0: st.dist, d1: st.dist + len,
          wob1: R(-1, 1) * len * 0.055, wob2: R(-1, 1) * len * 0.055,
          phase: R(0, TAU), depth: st.depth,
          subFruit: 0, b0: 0, b1: 0, droopMax: 0, droopSign: h > UP ? 1 : -1
        });
        st.parent = i; st.dist += len; st.head = h;
      } else if (t.s === 'S' && st.parent >= 0) {
        const n = nodes[st.parent];
        const cl = 3 + (rng() * 4 | 0);
        const blossoms = [];
        for (let k = 0; k < cl; k++) blossoms.push({ dx: R(-11, 11), dy: R(-10, 6), s: R(4.5, 7), rot: R(0, TAU), jf: R(0, 0.06) });
        const hasFruit = rng() < 0.42;
        const fruit = [];
        if (hasFruit) {
          const cnt = rng() < 0.2 ? 2 : 1;
          for (let k = 0; k < cnt; k++) fruit.push({
            sz: R(15, 21), tilt: R(-0.16, 0.16), stem: R(6, 11), dx: R(-7, 7),
            dropped: false, hue: R(0, 1)
          });
        }
        spurs.push({ n: st.parent, ang: n.abs + R(-0.5, 0.5), blossoms, fruit, bBirth: R(0.46, 0.56), fall: R(0.60, 0.70) });
      }
    }
    return { nodes, spurs };
  }

  function buildTree(seed) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const rng = mulberry32(seed + attempt * 7919);
      const { nodes, spurs } = interpret(rewrite(rng), rng);
      if (nodes.length < 150 || nodes.length > 1500) continue;

      // birth windows: wood grows 0.045 → 0.46 of scroll, outward along the wood
      let maxD = 0;
      for (const n of nodes) if (n.d1 > maxD) maxD = n.d1;
      const fb = d => 0.045 + 0.415 * (d / maxD);
      for (const n of nodes) { n.b0 = fb(n.d0); n.b1 = fb(n.d1); }

      // fruit weight → droop
      for (const sp of spurs) {
        if (!sp.fruit.length) continue;
        let i = sp.n;
        while (i >= 0) { nodes[i].subFruit += sp.fruit.length; i = nodes[i].p; }
      }
      for (const n of nodes) n.droopMax = Math.min(0.055, 0.011 * n.subFruit) * (n.w0 < 12 ? 1 : 0.25);

      // leaves on young wood
      const R = (a, b) => a + rng() * (b - a);
      const leaves = [];
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.w0 > 6.5 || n.len < 10) continue;
        const cnt = n.len > 34 ? 3 : n.len > 18 ? 2 : 1;
        for (let k = 0; k < cnt; k++) {
          leaves.push({
            n: i, t: R(0.25, 0.95), side: ((k + i) % 2) ? 1 : -1,
            size: R(9, 15), rot: R(-0.35, 0.35),
            birth: Math.max(n.b1 + 0.015, 0.28 + R(0, 0.20)),
            bucket: (rng() * 5) | 0
          });
        }
      }

      // full-grown bounds (for fit)
      const X = new Float64Array(nodes.length), Y = new Float64Array(nodes.length), A = new Float64Array(nodes.length);
      let minX = 0, maxX = 0, minY = 0;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const a = (n.p < 0 ? UP : A[n.p]) + n.rel + n.droopMax * n.droopSign;
        A[i] = a;
        X[i] = (n.p < 0 ? 0 : X[n.p]) + Math.cos(a) * n.len;
        Y[i] = (n.p < 0 ? 0 : Y[n.p]) + Math.sin(a) * n.len;
        if (X[i] < minX) minX = X[i]; if (X[i] > maxX) maxX = X[i];
        if (Y[i] < minY) minY = Y[i];
      }
      const bw = 2 * Math.max(Math.abs(minX), Math.abs(maxX)) + 90;
      const bh = -minY + 70;

      // canvas marginalia — anchors chosen from the skeleton.
      // Chapter cards alternate left/right, so each label is pinned to the OPPOSITE side:
      // I left card → label right (+1) · II right card → label left (−1) · III left → right · V left → right
      let scafL = -1, bestL = 0, scafAny = -1, bestAny = 0;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.depth !== 1 || n.w0 < 6) continue;
        if (n.len > bestAny) { bestAny = n.len; scafAny = i; }
        if (X[i] < -20 && n.len > bestL) { bestL = n.len; scafL = i; }
      }
      const scaffold = scafL >= 0 ? scafL : scafAny;
      let spurBare = -1, spurHigh = -1, spurFruit = -1, hy = 1e9;
      for (let k = 0; k < spurs.length; k++) {
        const sp = spurs[k];
        if (!sp.fruit.length && spurBare < 0 && k > spurs.length * 0.3 && X[sp.n] > 20) spurBare = k;
        if (X[sp.n] > 10 && Y[sp.n] < hy) { hy = Y[sp.n]; spurHigh = k; }
        if (sp.fruit.length && X[sp.n] > 20) spurFruit = k;
      }
      if (spurFruit < 0) for (let k = 0; k < spurs.length; k++) if (spurs[k].fruit.length) spurFruit = k;
      const labels = [];
      if (nodes.length > 1) labels.push({ node: 1, text: 'the whip — one stem, all ambition', a: 0.085, b: 0.185, side: 1 });
      if (scaffold >= 0) labels.push({ node: scaffold, text: 'scaffold limb — wide angle, holds a ladder', a: 0.28, b: 0.42, side: -1 });
      if (spurBare >= 0) labels.push({ node: spurs[spurBare].n, text: 'fruiting spur — slow wood, sweet intentions', a: 0.44, b: 0.535, side: 1 });
      if (spurHigh >= 0) labels.push({ node: spurs[spurHigh].n, text: 'corymb — five to seven, first bloom in the valley', a: 0.55, b: 0.645, side: 1 });
      if (spurFruit >= 0) labels.push({ node: spurs[spurFruit].n, text: '‘Doyenné du Comice’, 1849 — the buttery one', a: 0.75, b: 0.93, side: 1 });

      // ground furniture — normalized x in [−1,1], scaled to the viewport at draw time
      const grass = [];
      for (let k = 0; k < 34; k++) grass.push({ x: R(-1, 1), h: R(6, 16), lean: R(-0.5, 0.5) });
      const stones = [];
      for (let k = 0; k < 6; k++) stones.push({ x: R(-1, 1), rx: R(3, 7), ry: R(1.5, 3) });

      return { nodes, spurs, leaves, labels, grass, stones, bw, bh, maxD, seedUsed: seed };
    }
    // pathological seed: fall back to a known-good one
    return buildTree(0x51ab);
  }

  // ---------------- state ----------------
  let T = buildTree(SEED);
  let NX = new Float64Array(T.nodes.length), NY = new Float64Array(T.nodes.length), NA = new Float64Array(T.nodes.length), NG = new Float64Array(T.nodes.length);
  const view = { w: 0, h: 0, dpr: 1, s: 1, cx: 0, gy: 0 };
  let fontsOk = false, shakePulse = 0, lastT = 0;
  const petals = [], windfalls = [];
  const fruitScreen = [];
  let windfallCount = 0;

  function allocFK() {
    NX = new Float64Array(T.nodes.length); NY = new Float64Array(T.nodes.length);
    NA = new Float64Array(T.nodes.length); NG = new Float64Array(T.nodes.length);
  }

  function graftLabel() { return SEED.toString(16).toUpperCase().padStart(4, '0'); }
  function showGraft() {
    document.querySelectorAll('.graft').forEach(el => { el.textContent = graftLabel(); });
  }

  // ---------------- layout ----------------
  function resize() {
    const r = stage.getBoundingClientRect();
    view.w = r.width; view.h = r.height;
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    fit();
    if (REDUCED) drawFrame(1, 0);
  }
  function fit() {
    const mobile = view.w < 640;
    view.s = Math.min((view.w * 0.92) / T.bw, (view.h * (mobile ? 0.72 : 0.78)) / T.bh);
    view.cx = view.w * 0.5;
    view.gy = view.h * (mobile ? 0.905 : 0.855);
  }

  function progress() {
    if (REDUCED) return 1;
    const r = track.getBoundingClientRect();
    const total = r.height - view.h;
    if (total <= 0) return 1;
    return clamp(-r.top / total, 0, 1);
  }

  // ---------------- drawing helpers ----------------
  function pAt(P, u) {
    const s = Math.min(2, Math.floor(u * 3));
    const t = u * 3 - s;
    return [lerp(P[s][0], P[s + 1][0], t), lerp(P[s][1], P[s + 1][1], t)];
  }

  function pearPath(x, y, s, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(0, 0.08 * s);
    ctx.bezierCurveTo(0.15 * s, 0.10 * s, 0.20 * s, 0.40 * s, 0.30 * s, 0.56 * s);
    ctx.bezierCurveTo(0.46 * s, 0.80 * s, 0.30 * s, 1.02 * s, 0, 1.02 * s);
    ctx.bezierCurveTo(-0.30 * s, 1.02 * s, -0.46 * s, 0.80 * s, -0.30 * s, 0.56 * s);
    ctx.bezierCurveTo(-0.20 * s, 0.40 * s, -0.15 * s, 0.10 * s, 0, 0.08 * s);
    ctx.closePath();
    ctx.restore(); // path keeps its baked-in transform; the state stack stays clean
  }

  function drawPear(x, y, s, rot, ripe, gold, hue) {
    // ripe 0..1 (green→ready), gold 0..1 (dusk blush)
    const g = [107 + hue * 10, 122, 58];
    const y2 = [201, 154, 63];
    const r0 = Math.round(lerp(g[0], y2[0], ripe * 0.75));
    const r1 = Math.round(lerp(g[1], y2[1], ripe * 0.7));
    const r2 = Math.round(lerp(g[2], y2[2], ripe * 0.6));
    pearPath(x, y, s, rot);
    ctx.fillStyle = `rgb(${r0},${r1},${r2})`;
    ctx.fill();
    // blush
    if (gold > 0.05) {
      pearPath(x, y, s, rot);
      ctx.save(); ctx.clip();
      ctx.fillStyle = `rgba(196,104,60,${0.28 * gold})`;
      ctx.beginPath(); ctx.ellipse(x + s * 0.22, y + s * 0.62, s * 0.42, s * 0.5, rot, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // outline + calyx + highlight
    pearPath(x, y, s, rot);
    ctx.strokeStyle = 'rgba(70,49,28,0.55)'; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.fillStyle = 'rgba(44,29,13,0.8)';
    ctx.beginPath(); ctx.arc(x - Math.sin(rot) * s * 1.02, y + Math.cos(rot) * s * 1.02, s * 0.045, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,249,234,0.35)';
    ctx.beginPath(); ctx.ellipse(x - s * 0.16, y + s * 0.5, s * 0.09, s * 0.2, rot - 0.3, 0, TAU); ctx.fill();
  }

  function drawLeafShape(s) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(s * 0.36, -s * 0.30, s * 0.95, -s * 0.05);
    ctx.quadraticCurveTo(s * 0.40, s * 0.26, 0, 0);
    ctx.closePath();
  }

  function drawBlossom(x, y, s, rot, alpha) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = alpha;
    ctx.fillStyle = '#FDF6EC';
    for (let q = 0; q < 5; q++) {
      const a = q * TAU / 5;
      ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.52, Math.sin(a) * s * 0.52, s * 0.36, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(107,82,51,0.35)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.78, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#E4B33C';
    ctx.beginPath(); ctx.arc(0, 0, s * 0.16, 0, TAU); ctx.fill();
    ctx.fillStyle = '#C4685F';
    for (let q = 0; q < 3; q++) {
      const a = q * TAU / 3 + 0.5;
      ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.24, Math.sin(a) * s * 0.24, s * 0.05, 0, TAU); ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // ---------------- the frame ----------------
  function drawFrame(p, tNow) {
    const W = view.w, H = view.h, s = view.s;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const gold = REDUCED ? 1 : smooth(0.80, 0.97, p);
    const droopF = REDUCED ? 1 : smooth(0.64, 0.90, p);

    // dusk light (screen space)
    if (gold > 0.01) {
      ctx.fillStyle = `rgba(217,154,43,${0.10 * gold})`;
      ctx.fillRect(0, 0, W, H);
      const sun = ctx.createRadialGradient(W * 0.82, view.gy - H * 0.16, 10, W * 0.82, view.gy - H * 0.16, H * 0.55);
      sun.addColorStop(0, `rgba(245,180,38,${0.4 * gold})`);
      sun.addColorStop(0.4, `rgba(224,120,60,${0.14 * gold})`);
      sun.addColorStop(1, 'rgba(224,120,60,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, W, H);
    }

    // world space
    ctx.save();
    ctx.translate(view.cx, view.gy);
    ctx.scale(s, s);
    const half = (W / 2) / s + 30;

    // distant bald hill — low, wide, barely there
    ctx.beginPath();
    ctx.moveTo(half * 0.18, 0);
    ctx.quadraticCurveTo(half * 0.72, -T.bh * 0.17, half + 30, -T.bh * 0.02);
    ctx.lineTo(half + 30, 0); ctx.closePath();
    ctx.fillStyle = `rgba(70,49,28,${0.045 + 0.04 * gold})`;
    ctx.fill();

    // gold shadow (sun on the right → shadow reaches left)
    if (gold > 0.02) {
      ctx.fillStyle = `rgba(70,49,28,${0.10 * gold})`;
      ctx.beginPath();
      ctx.ellipse(-T.bh * 0.22, 2, T.bh * 0.3, 7, 0, 0, TAU);
      ctx.fill();
    }

    // ground line, hand-wavy
    ctx.strokeStyle = 'rgba(70,49,28,0.55)'; ctx.lineWidth = 2.4 / s * Math.min(s, 1.4); ctx.lineCap = 'round';
    ctx.beginPath();
    for (let x = -half; x <= half; x += 24) {
      const y = 1.8 * Math.sin(x * 0.021 + 2.7) + 1.2 * Math.sin(x * 0.047);
      if (x === -half) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // grass + stones, spread across the whole visible ground
    ctx.strokeStyle = 'rgba(78,107,52,0.5)'; ctx.lineWidth = 1.1;
    for (const g of T.grass) {
      const gx = g.x * half * 0.97;
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.quadraticCurveTo(gx + g.lean * 3, -g.h * 0.6, gx + g.lean * 6, -g.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx + 3, 0); ctx.quadraticCurveTo(gx + 3 - g.lean * 2, -g.h * 0.5, gx + 3 - g.lean * 4, -g.h * 0.72); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(70,49,28,0.28)';
    for (const st of T.stones) { ctx.beginPath(); ctx.ellipse(st.x * half * 0.9, -st.ry * 0.4, st.rx, st.ry, 0, 0, TAU); ctx.fill(); }

    // the seed, before germination
    const seedFade = 1 - smooth(0.05, 0.10, p);
    if (seedFade > 0.01) {
      ctx.globalAlpha = seedFade;
      ctx.fillStyle = 'rgba(70,49,28,0.2)';
      ctx.beginPath(); ctx.ellipse(0, -1, 14, 4, 0, 0, TAU); ctx.fill(); // mound
      ctx.fillStyle = '#4A331D';
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.quadraticCurveTo(4.6, -6.5, 3.4, -1.5);
      ctx.quadraticCurveTo(1.8, 1.2, 0, 1.2);
      ctx.quadraticCurveTo(-1.8, 1.2, -3.4, -1.5);
      ctx.quadraticCurveTo(-4.6, -6.5, 0, -9);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ---- forward kinematics ----
    const nodes = T.nodes;
    const breezeBase = REDUCED ? 0 : 0.008 * (1 - gold * 0.35) + shakePulse * 0.045;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const g = clamp((p - n.b0) / (n.b1 - n.b0), 0, 1);
      NG[i] = g;
      let a = (n.p < 0 ? UP : NA[n.p]) + n.rel;
      if (breezeBase > 0) a += breezeBase * (1 - n.w0 / 26) * Math.sin(tNow * 0.0011 + n.phase + n.depth * 0.6);
      a += droopF * n.droopMax * n.droopSign;
      NA[i] = a;
      NX[i] = (n.p < 0 ? 0 : NX[n.p]) + Math.cos(a) * n.len;
      NY[i] = (n.p < 0 ? 0 : NY[n.p]) + Math.sin(a) * n.len;
    }

    // root flare — two shy buttress roots, hugging the soil
    if (NG[0] > 0.25) {
      const w0 = nodes[0].w0;
      const fl = smooth(0.25, 1, NG[0]);
      ctx.strokeStyle = INK; ctx.lineCap = 'round';
      ctx.lineWidth = w0 * 0.20 * fl;
      ctx.beginPath(); ctx.moveTo(-w0 * 0.18, -w0 * 0.5); ctx.quadraticCurveTo(-w0 * 0.72, -w0 * 0.12, -w0 * 1.15 * fl, 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w0 * 0.18, -w0 * 0.5); ctx.quadraticCurveTo(w0 * 0.7, -w0 * 0.1, w0 * 1.05 * fl, 0.5); ctx.stroke();
    }

    // ---- wood ----
    ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < nodes.length; i++) {
      const g = NG[i];
      if (g <= 0) continue;
      const n = nodes[i];
      const px = n.p < 0 ? 0 : NX[n.p], py = n.p < 0 ? 0 : NY[n.p];
      const a = NA[i], ca = Math.cos(a), sa = Math.sin(a), L = n.len;
      const nx = -sa, ny = ca;
      const P = [
        [px, py],
        [px + ca * L / 3 + nx * n.wob1, py + sa * L / 3 + ny * n.wob1],
        [px + ca * 2 * L / 3 + nx * n.wob2, py + sa * 2 * L / 3 + ny * n.wob2],
        [px + ca * L, py + sa * L]
      ];
      const segs = Math.min(3, Math.ceil(g * 3 - 1e-6));
      for (let k = 0; k < segs; k++) {
        const u0 = k / 3, u1 = Math.min(g, (k + 1) / 3);
        const A0 = pAt(P, u0), B0 = pAt(P, u1);
        ctx.lineWidth = Math.max(0.7, lerp(n.w0, n.w1, (u0 + u1) / 2));
        ctx.beginPath(); ctx.moveTo(A0[0], A0[1]); ctx.lineTo(B0[0], B0[1]); ctx.stroke();
      }
    }
    // ink core on heavy wood
    ctx.strokeStyle = INK_CORE; ctx.globalAlpha = 0.45;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.w0 < 5.5 || NG[i] <= 0) continue;
      const px = n.p < 0 ? 0 : NX[n.p], py = n.p < 0 ? 0 : NY[n.p];
      const g = NG[i];
      ctx.lineWidth = n.w0 * 0.4;
      ctx.beginPath(); ctx.moveTo(px, py);
      ctx.lineTo(lerp(px, NX[i], g), lerp(py, NY[i], g));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ---- leaves ----
    const leafStyles = [];
    for (let b = 0; b < 5; b++) {
      const v = (b - 2) * 7;
      const r0 = Math.round(lerp(78 + v, 138, gold * 0.5));
      const g0 = Math.round(lerp(107 + v, 116, gold * 0.5));
      const b0 = Math.round(lerp(52 + v * 0.5, 44, gold * 0.5));
      leafStyles.push(`rgb(${r0},${g0},${b0})`);
    }
    for (const lf of T.leaves) {
      if (p < lf.birth || NG[lf.n] < lf.t) continue;
      const ot = REDUCED ? 1 : clamp((p - lf.birth) / 0.05, 0, 1);
      const sz = lf.size * (REDUCED ? 1 : easeOutBack(ot));
      const n = T.nodes[lf.n];
      const px = n.p < 0 ? 0 : NX[n.p], py = n.p < 0 ? 0 : NY[n.p];
      const x = lerp(px, NX[lf.n], lf.t), y = lerp(py, NY[lf.n], lf.t);
      const ang = NA[lf.n] + lf.side * (1.0 + lf.rot);
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.strokeStyle = 'rgba(70,49,28,0.6)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sz * 0.22, 0); ctx.stroke();
      ctx.translate(sz * 0.22, 0);
      ctx.fillStyle = leafStyles[lf.bucket];
      drawLeafShape(sz); ctx.fill();
      ctx.strokeStyle = 'rgba(46,31,14,0.35)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sz * 0.45, -sz * 0.06, sz * 0.85, -sz * 0.05); ctx.stroke();
      ctx.restore();
    }

    // ---- spurs: blossom → fruit ----
    fruitScreen.length = 0;
    for (const sp of T.spurs) {
      if (NG[sp.n] < 1) continue;
      const bx = NX[sp.n], by = NY[sp.n];
      // spur stub
      ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx, by);
      const sx = bx + Math.cos(sp.ang) * 7, sy = by + Math.sin(sp.ang) * 7;
      ctx.lineTo(sx, sy); ctx.stroke();

      // blossoms
      for (const bl of sp.blossoms) {
        const open = REDUCED ? 0 : clamp((p - (sp.bBirth + bl.jf)) / 0.05, 0, 1);
        const fade = REDUCED ? 1 : clamp((p - (sp.fall + bl.jf)) / 0.05, 0, 1);
        const alpha = open * (1 - fade);
        if (alpha <= 0.01) continue;
        drawBlossom(sx + bl.dx, sy + bl.dy, bl.s * easeOutBack(open), bl.rot, alpha);
      }

      // fruit
      for (const fr of sp.fruit) {
        if (fr.dropped) continue;
        const ft = REDUCED ? 1 : clamp((p - sp.fall) / 0.16, 0, 1);
        if (ft <= 0) continue;
        const sz = fr.sz * (0.22 + 0.78 * easeInOut(ft));
        const sway = REDUCED ? 0 : breezeBase * 6 * Math.sin(tNow * 0.0013 + sp.n);
        const fx = sx + fr.dx, fy = sy;
        // stem
        ctx.strokeStyle = 'rgba(70,49,28,0.8)'; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo(fx + 1, fy + fr.stem * 0.5, fx + sway * 2, fy + fr.stem); ctx.stroke();
        const py2 = fy + fr.stem;
        drawPear(fx + sway * 2, py2, sz, fr.tilt + sway * 0.05, ft, gold, fr.hue);
        fruitScreen.push({
          x: view.cx + (fx + sway * 2) * s, y: view.gy + (py2 + sz * 0.55) * s,
          r: Math.max(10, sz * 0.6 * s), sp, fr, wx: fx + sway * 2, wy: py2
        });
      }
    }

    // ---- windfalls (fallen pears resting / falling) ----
    for (const wf of windfalls) {
      drawPear(wf.x, wf.y, wf.sz, wf.rot, 1, gold, wf.hue);
    }

    // ---- petals adrift ----
    if (!REDUCED) {
      ctx.fillStyle = 'rgba(253,246,236,0.85)';
      for (const pt of petals) {
        const a = clamp(1 - pt.age / pt.life, 0, 1) * 0.85;
        ctx.globalAlpha = a;
        ctx.save(); ctx.translate(pt.x, pt.y); ctx.rotate(pt.rot);
        ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 2.1, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // ---- the tipsy bee, working the bloom ----
    if (!REDUCED) {
      const beeIn = smooth(0.47, 0.505, p) * (1 - smooth(0.645, 0.67, p));
      if (beeIn > 0.01) {
        const bx2 = Math.sin(tNow * 0.00023 + 1.3) * T.bw * 0.26;
        const by2 = -T.bh * 0.55 + Math.sin(tNow * 0.00031 + 0.4) * T.bh * 0.17;
        const tilt = Math.cos(tNow * 0.00023 + 1.3) * 0.3;
        ctx.save(); ctx.translate(bx2, by2); ctx.rotate(tilt); ctx.globalAlpha = beeIn;
        const flap = Math.sin(tNow * 0.05) * 0.5 + 0.6;
        ctx.fillStyle = 'rgba(253,246,236,0.6)';
        ctx.beginPath(); ctx.ellipse(-1, -4.5, 3.4, 5 * flap, -0.4, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(2.5, -4, 3, 4.4 * flap, 0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#E9A82C';
        ctx.beginPath(); ctx.ellipse(0, 0, 6.2, 4, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#2C1D0D'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-1.5, -3.6); ctx.lineTo(-1.5, 3.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(1.8, -3.3); ctx.lineTo(1.8, 3.3); ctx.stroke();
        ctx.fillStyle = '#2C1D0D';
        ctx.beginPath(); ctx.arc(6.4, -0.6, 2.1, 0, TAU); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
      }
    }

    ctx.restore(); // end world space

    // ---- botanical marginalia (screen space) ----
    if (fontsOk) {
      for (const lb of T.labels) {
        const al = REDUCED
          ? (lb.b > 0.9 ? 1 : 0)
          : smooth(lb.a, lb.a + 0.03, p) * (1 - smooth(lb.b - 0.03, lb.b, p));
        if (al <= 0.01) continue;
        const wx = NX[lb.node], wy = NY[lb.node];
        let sx2 = view.cx + wx * view.s, sy2 = view.gy + wy * view.s;
        const side = lb.side;
        const ex = sx2 + side * 42, ey = sy2 - 30;
        let tx = ex + side * 12;
        ctx.globalAlpha = al;
        ctx.fillStyle = '#584428'; ctx.strokeStyle = 'rgba(88,68,40,0.65)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sx2, sy2, 2.6, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(sx2, sy2); ctx.lineTo(ex, ey); ctx.lineTo(ex + side * 10, ey); ctx.stroke();
        ctx.font = `italic 500 ${view.w < 640 ? 13 : 15.5}px "EB Garamond", Georgia, serif`;
        ctx.textAlign = side > 0 ? 'left' : 'right';
        ctx.textBaseline = 'middle';
        const met = ctx.measureText(lb.text);
        if (side > 0 && tx + met.width > view.w - 12) { ctx.textAlign = 'right'; tx = ex - 12 - 84 * 0; }
        if (side < 0 && tx - met.width < 12) { ctx.textAlign = 'left'; }
        ctx.fillText(lb.text, tx, ey);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ---------------- simulation ----------------
  function stepSim(dt, p) {
    // petals
    if (!REDUCED && p > 0.60 && p < 0.78 && petals.length < 24 && Math.random() < 0.35) {
      const sp = T.spurs[(Math.random() * T.spurs.length) | 0];
      if (sp && NG[sp.n] >= 1) {
        petals.push({
          x: NX[sp.n], y: NY[sp.n], vx: (Math.random() - 0.5) * 14, vy: 8 + Math.random() * 10,
          rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 2,
          age: 0, life: 3.5 + Math.random() * 2.5, ph: Math.random() * TAU
        });
      }
    }
    for (let i = petals.length - 1; i >= 0; i--) {
      const pt = petals[i];
      pt.age += dt;
      pt.x += (pt.vx + Math.sin(pt.age * 2 + pt.ph) * 12) * dt;
      pt.y += pt.vy * dt;
      pt.rot += pt.vr * dt;
      if (pt.age > pt.life || pt.y > 2) petals.splice(i, 1);
    }
    // windfalls
    for (const wf of windfalls) {
      if (wf.settled) continue;
      wf.vy += 900 * dt;
      wf.y += wf.vy * dt;
      wf.x += wf.vx * dt;
      wf.rot += wf.vr * dt;
      const rest = -wf.sz * 1.02 + 1.5;
      if (wf.y >= rest) {
        wf.y = rest;
        if (Math.abs(wf.vy) > 60) { wf.vy *= -0.26; wf.vx *= 0.65; wf.vr *= 0.5; }
        else { wf.settled = true; wf.vy = 0; }
      }
    }
    shakePulse *= Math.exp(-dt * 2.4);
    if (shakePulse < 0.001) shakePulse = 0;
  }

  function dropFruit(hit) {
    if (hit.fr.dropped) return;
    hit.fr.dropped = true;
    windfallCount++;
    const el = document.getElementById('windfall-count');
    if (el) el.textContent = String(windfallCount);
    const wf = {
      x: hit.wx, y: hit.wy, sz: hit.fr.sz, rot: hit.fr.tilt, hue: hit.fr.hue,
      vx: (Math.random() - 0.5) * 26, vy: 20, vr: (Math.random() - 0.5) * 3, settled: false
    };
    if (REDUCED) { wf.y = -wf.sz * 1.02 + 1.5; wf.settled = true; wf.rot = (Math.random() - 0.5); }
    windfalls.push(wf);
    if (REDUCED) drawFrame(1, 0);
  }

  function shakeTree() {
    shakePulse = 1;
    const hanging = fruitScreen.filter(f => !f.fr.dropped);
    if (!hanging.length && REDUCED) {
      // reduced-motion path: fruitScreen only fills during draw — force one
      drawFrame(1, 0);
    }
    const pool = fruitScreen.filter(f => !f.fr.dropped);
    const n = Math.min(pool.length, 1 + ((Math.random() * 3) | 0));
    for (let i = 0; i < n; i++) {
      const k = (Math.random() * pool.length) | 0;
      dropFruit(pool[k]);
      pool.splice(k, 1);
    }
  }

  // ---------------- interactions ----------------
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 1e9;
    for (const f of fruitScreen) {
      if (f.fr.dropped) continue;
      const d = Math.hypot(f.x - mx, f.y - my);
      if (d < f.r * 1.5 && d < bd) { bd = d; best = f; }
    }
    if (best) dropFruit(best);
  });
  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let hit = false;
    for (const f of fruitScreen) {
      if (!f.fr.dropped && Math.hypot(f.x - mx, f.y - my) < f.r * 1.5) { hit = true; break; }
    }
    canvas.style.cursor = hit ? 'pointer' : '';
  }, { passive: true });

  const shakeBtn = document.getElementById('shake');
  if (shakeBtn) shakeBtn.addEventListener('click', shakeTree);

  const regrowBtn = document.getElementById('regrow');
  if (regrowBtn) regrowBtn.addEventListener('click', () => {
    SEED = (Math.random() * 0xFFFF) | 0;
    T = buildTree(SEED);
    SEED = T.seedUsed;
    allocFK(); fit(); showGraft();
    petals.length = 0; windfalls.length = 0; windfallCount = 0;
    const el = document.getElementById('windfall-count');
    if (el) el.textContent = '0';
    history.replaceState(null, '', '#graft=' + graftLabel());
    if (REDUCED) drawFrame(1, 0);
  });

  // growth rail
  const rail = document.getElementById('rail');
  const railFill = document.getElementById('rail-fill');
  const railBtns = rail ? Array.from(rail.querySelectorAll('button')) : [];
  railBtns.forEach(btn => {
    const stage2 = btn.querySelector('.lbl');
    btn.setAttribute('aria-label', 'Scroll to the ' + (stage2 ? stage2.textContent.toLowerCase() : '') + ' stage');
    btn.addEventListener('click', () => {
      const target = parseFloat(btn.dataset.p);
      const rect = track.getBoundingClientRect();
      const top = window.scrollY + rect.top;
      const total = rect.height - view.h;
      window.scrollTo({ top: top + target * total, behavior: REDUCED ? 'auto' : 'smooth' });
    });
  });
  const railStops = railBtns.map(b => parseFloat(b.dataset.p));
  function updateRail(p) {
    if (!rail) return;
    let active = 0;
    for (let i = 0; i < railStops.length; i++) if (p >= railStops[i] - 0.055) active = i;
    railBtns.forEach((b, i) => b.classList.toggle('on', i === active));
    if (railFill) {
      const lineH = rail.offsetHeight - 20;
      railFill.style.height = (clamp(p, 0, 1) * lineH) + 'px';
    }
    rail.classList.toggle('gone', p >= 0.999);
  }

  // ---------------- boot ----------------
  showGraft();
  history.replaceState(null, '', '#graft=' + graftLabel());
  window.addEventListener('resize', resize);
  document.fonts.ready.then(() => { fontsOk = true; if (REDUCED) drawFrame(1, 0); });

  resize();

  if (REDUCED) {
    // fully grown, still, gold hour — drawn once
    // FK needs one pass at p=1: drawFrame handles it
    drawFrame(1, 0);
    updateRail(1);
    window.addEventListener('scroll', () => updateRail(1), { passive: true });
  } else {
    let lastRail = -1;
    const loop = (t) => {
      const dt = Math.min(0.033, (t - lastT) / 1000 || 0.016);
      lastT = t;
      const p = progress();
      stepSim(dt, p);
      drawFrame(p, t);
      if (Math.abs(p - lastRail) > 0.004) { updateRail(p); lastRail = p; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
})();
