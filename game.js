// Wizard Party - a hot-seat recreation of "Wizards" (Steam) for one shared screen.
// Destructible terrain, wind, water at the bottom, and the spell book in spells.js. Each turn: walk, aim, cast.
(() => {
  "use strict";
  const W = 1600, H = 900, SEA = H - 34;
  const COLORS = ["#ff5d5d", "#5db7ff", "#7dff6a", "#ffcf4a", "#d07bff", "#ff9a3d", "#4fffe0", "#ff6fd0"];
  const cv = document.getElementById("game"), ctx = cv.getContext("2d");
  const terr = document.createElement("canvas"); terr.width = W; terr.height = H;
  const tctx = terr.getContext("2d");
  const solid = new Uint8Array(W * H);
  let dirty = null;                                  // {x0,y0,x1,y1} region of terrain to repaint this frame

  // ---------- spell book (with the Spell Forge's saved renames) ----------
  let forge = {}; try { forge = JSON.parse(localStorage.getItem("wp_forge") || "{}"); } catch (e) {}
  const BOOK = SPELLS.map(s => Object.assign({}, s, forge[s.id] || {}));
  const SCHOOL_LIST = Object.keys(SCHOOLS).filter(k => BOOK.some(s => s.school === k));
  // party wizards: atlases of the original rig (make_sprites.py), 8 jointed groups x 256px = the 1024 rig at 1/4
  const LOOKS = (typeof ROSTER !== "undefined" ? ROSTER : []);
  const atlas = {}; for (const p of LOOKS) { const im = new Image(); im.src = "sprites/" + p.id + ".png"; atlas[p.id] = im; }
  const icon = id => "sprites/" + id + "_icon.png";
  // group index, pivot in rig px (WizardRenderer.java origins)
  const RIG = { hairback: [0, 356, 478], staff: [1, 464, 490], backarm: [2, 354, 500], legl: [3, 349, 623], legr: [4, 452, 623], torso: [5, 400, 523], frontarm: [6, 464, 490], head: [7, 356, 478] };
  const RK = 0.1, FEET_X = 409, FEET_Y = 795;   // rig px -> world px; a wizard stands ~68px tall

  // ---------- state ----------
  let wizards = [], turn = 0, wind = 0, phase = "setup", castsLeft = 1, settle = 0, skipNext = false, turnTimer = 0;
  let school = SCHOOL_LIST[0], spell = BOOK.find(s => s.school === school), power = 0, charging = false;
  let shots = [], napalms = [], booms = [], sparks = [], bombs = [], seeds = [], beams = [], texts = [], timers = [];
  let mouse = { x: W / 2, y: H / 2, inside: false };
  const keys = {};
  const cur = () => wizards[turn];
  // multiplayer: "local" = one screen; "host" runs the game and streams it; "guest" is a phone that draws the stream and steers its own wizard
  let mode = "local", ops = [], quiet = false, touchWalk = 0, tgt = null;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const r1 = v => Math.round(v * 10) / 10;

  // ---------- sound (synthesised, no files) ----------
  let actx = null;
  let sndOut = [];
  function sfx(kind, size) {
    if (mode === "host") sndOut.push([kind, size || 0]);
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime, g = actx.createGain(); g.connect(actx.destination);
      if (kind === "boom") {
        const len = 0.25 + Math.min(1, size / 60) * 0.5, buf = actx.createBuffer(1, actx.sampleRate * len, actx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
        const src = actx.createBufferSource(), f = actx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 500 + size * 8;
        src.buffer = buf; src.connect(f); f.connect(g); g.gain.value = 0.35; src.start(t);
      } else {
        const o = actx.createOscillator(); o.type = kind === "zap" ? "sawtooth" : "sine";
        o.frequency.setValueAtTime(kind === "heal" ? 520 : 300, t); o.frequency.exponentialRampToValueAtTime(kind === "heal" ? 1040 : 900, t + 0.18);
        g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); o.connect(g); o.start(t); o.stop(t + 0.26);
      }
    } catch (e) {}
  }

  // ---------- terrain ----------
  function makeTerrain(style, P) {
    P = P || { a: [0, 1, 2, 3].map(() => Math.random() * 6.3), isl: Array.from({ length: style === "islands" ? 6 : 3 }, () => [160 + Math.random() * (W - 320), 190 + Math.random() * 200, 70 + Math.random() * 100, 18 + Math.random() * 18].map(r1)) };
    ops = [["mk", style, P]]; quiet = true;
    solid.fill(0);
    const base = H * 0.6, a = P.a;
    for (let x = 0; x < W; x++) {
      let h = base + Math.sin(x / 230 + a[0]) * 95 + Math.sin(x / 91 + a[1]) * 42 + Math.sin(x / 33 + a[2]) * 10;
      if (style === "islands") h += Math.max(0, Math.sin(x / 260 + a[3])) * 160;
      for (let y = Math.max(0, h | 0); y < H; y++) solid[y * W + x] = 1;
    }
    for (const e of P.isl) ellipse(e[0], e[1], e[2], e[3], 1);
    quiet = false; dirty = { x0: 0, y0: 0, x1: W, y1: H };
  }
  function ellipse(cx, cy, rx, ry, v) {
    if (!quiet) ops.push(["e", r1(cx), r1(cy), r1(rx), r1(ry), v]);
    for (let y = Math.max(0, cy - ry | 0); y < Math.min(H, cy + ry); y++)
      for (let x = Math.max(0, cx - rx | 0); x < Math.min(W, cx + rx); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) solid[y * W + x] = v;
    markDirty(cx - rx, cy - ry, cx + rx, cy + ry);
  }
  const carve = (cx, cy, r) => ellipse(cx, cy, r, r, 0);
  const fill = (cx, cy, r) => ellipse(cx, cy, r, r, 1);
  function rect(x0, y0, x1, y1, v) {
    if (!quiet) ops.push(["r", r1(x0), r1(y0), r1(x1), r1(y1), v]);
    for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1); x++) solid[y * W + x] = v;
    markDirty(x0, y0, x1, y1);
  }
  function markDirty(x0, y0, x1, y1) {
    x0 = Math.max(0, (x0 | 0) - 4); y0 = Math.max(0, (y0 | 0) - 4); x1 = Math.min(W, (x1 | 0) + 5); y1 = Math.min(H, (y1 | 0) + 5);
    if (!dirty) dirty = { x0, y0, x1, y1 }; else { dirty.x0 = Math.min(dirty.x0, x0); dirty.y0 = Math.min(dirty.y0, y0); dirty.x1 = Math.max(dirty.x1, x1); dirty.y1 = Math.max(dirty.y1, y1); }
  }
  function repaint() {
    if (!dirty) return;
    const { x0, y0, x1, y1 } = dirty; dirty = null;
    const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return;
    const img = tctx.createImageData(w, h), d = img.data;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x, k = ((y - y0) * w + (x - x0)) * 4;
      if (!solid[i]) { d[k + 3] = 0; continue; }
      let depth = 0; while (depth < 7 && y - depth - 1 >= 0 && solid[i - (depth + 1) * W]) depth++;
      const n = ((x * 73856093) ^ (y * 19349663)) & 15;
      if (depth < 4) { d[k] = 96 + n; d[k + 1] = 214 + n; d[k + 2] = 104; }
      else if (depth < 7) { d[k] = 70 + n; d[k + 1] = 150 + n; d[k + 2] = 84; }
      else { const b = ((x >> 3) + (y >> 3)) & 1 ? 8 : 0; d[k] = 98 + n + b; d[k + 1] = 66 + n + b; d[k + 2] = 120 + n + b; }
      d[k + 3] = 255;
    }
    tctx.putImageData(img, x0, y0);
  }
  const isSolid = (x, y) => x >= 0 && x < W && y >= 0 && y < H && solid[(y | 0) * W + (x | 0)] === 1;
  function groundBelow(x, y) { while (y < H - 1 && !isSolid(x, y + 1)) y++; return y; }

  // ---------- wizards ----------
  function spawnWizards(names) {
    const order = names.map((n, i) => i).sort(() => Math.random() - 0.5);
    wizards = names.map((entry, i) => { const name = entry.name; const look = entry.look, cid = entry.cid || "";
      const slot = order[i], x = 110 + (W - 220) * (names.length === 1 ? 0.5 : slot / (names.length - 1));
      return { name, look, cid, walking: 0, color: COLORS[i % COLORS.length], x, y: groundBelow(x, 0), vx: 0, vy: 0, hp: 100, alive: true, face: x < W / 2 ? 1 : -1, angle: x < W / 2 ? -0.7 : Math.PI + 0.7, shield: 0, frozen: 0, burn: 0 };
    });
    turn = Math.floor(Math.random() * wizards.length); startTurn();
  }
  function hurt(w, amount, src) {
    if (!w.alive || amount <= 0) return 0;
    if (w.shield > 0) { w.shield--; floatText(w.x, w.y - 40, "blocked!", "#fff3b0"); return 0; }
    amount = Math.round(amount); w.hp -= amount; floatText(w.x, w.y - 40, "-" + amount, "#ff6b6b"); return amount;
  }
  function healW(w, amount) { if (!w.alive) return; const a = Math.min(100 - w.hp, Math.round(amount)); w.hp += a; if (a > 0) floatText(w.x, w.y - 40, "+" + a, "#6bff9a"); }
  function push(w, ax, ay) { w.vx += ax; w.vy += ay; w.air = true; }
  function floatText(x, y, t, c) { texts.push({ x, y, t, c, life: 60 }); }

  // ---------- explosions ----------
  function boom(x, y, r, dmg, opts = {}) {
    if (!opts.keepTerrain) carve(x, y, r);
    booms.push({ x, y, r: r * 1.35, t: 0, color: opts.color || "#ffb14a" });
    for (let i = 0; i < Math.min(30, r); i++) sparks.push({ x, y, vx: (Math.random() - 0.5) * r * 0.35, vy: (Math.random() - 0.8) * r * 0.3, life: 30 + Math.random() * 20, c: opts.color || "#ffcf6a" });
    sfx("boom", r);
    let total = 0;
    for (const w of wizards) {
      if (!w.alive) continue;
      const d = Math.hypot(w.x - x, w.y - 14 - y), reach = r * 1.6 + 10;
      if (d > reach) continue;
      const f = Math.max(0, 1 - d / reach);
      if (opts.heal) { healW(w, opts.heal * Math.max(0.5, f)); continue; }
      total += hurt(w, dmg * (0.35 + 0.65 * f), opts.src);
      if (opts.freeze) { w.frozen = Math.max(w.frozen, opts.freeze); floatText(w.x, w.y - 56, "frozen", "#8fe3ff"); }
      const kb = (opts.knockback || 5) * f * 1.4, ang = Math.atan2(w.y - 14 - y, w.x - x);
      push(w, Math.cos(ang) * kb, Math.sin(ang) * kb - 2.2 * f);
    }
    for (const b of bombs) if (Math.hypot(b.x - x, b.y - y) < r) b.turns = 0;
    for (const s of seeds) if (Math.hypot(s.x - x, s.y - y) < r + 10) s.armed = -1;
    return total;
  }
  function napalmAt(x, y, n, dmg) {
    for (let i = 0; i < n; i++) napalms.push({ x, y: y - 4, vx: (Math.random() - 0.5) * 7, vy: -2 - Math.random() * 4, dmg: dmg || 5, life: 360 + Math.random() * 120, stuck: false, hit: new Set() });
  }

  // ---------- projectiles ----------
  // a shot: {x,y,vx,vy,r,grav,s,onHit(shot,hitWizard)->bool(keep flying), onStep(shot), owner, t, color}
  function shoot(x, y, vx, vy, s, extra = {}) {
    const sh = Object.assign({ x, y, vx, vy, r: 6, grav: s.gravity ?? 1, s, owner: cur(), t: 0, color: SCHOOLS[s.school] || "#fff", wind: true }, extra);
    shots.push(sh); return sh;
  }
  const fireMult = (s) => (s.school === "FIRE" && cur() && cur().burn > 0 ? 1.5 : 1);

  const FX = {
    explode(s, o) { shoot(o.x, o.y, o.vx, o.vy, s, { onHit(sh) { boom(sh.x, sh.y, s.radius, s.damage * fireMult(s), { keepTerrain: s.keepTerrain, color: sh.color, knockback: s.knockback }); if (s.napalm) napalmAt(sh.x, sh.y, s.napalm, 5); } }); },
    cluster(s, o) {
      const burst = (sh) => {
        boom(sh.x, sh.y, s.radius, s.damage * fireMult(s), { color: sh.color });
        for (let i = 0; i < s.bomblets; i++) shoot(sh.x, sh.y - 6, (Math.random() - 0.5) * 9, -4 - Math.random() * 5, s, { r: 4, onHit(b) { boom(b.x, b.y, s.radius * 0.7, s.bombletDamage * fireMult(s), { color: b.color }); } });
      };
      shoot(o.x, o.y, o.vx, o.vy, s, s.fuse ? { bounce: 0.5, fuse: s.fuse * 60, onFuse: burst, onHit: () => true } : { onHit: burst });
    },
    spray(s, o) {
      for (let i = 0; i < s.count; i++) {
        const a = o.angle + (Math.random() - 0.5) * s.spread * 2, sp = (s.speed || 12) * (0.75 + Math.random() * 0.4);
        timers.push({ t: i * 2, run: () => shoot(o.x, o.y, Math.cos(a) * sp, Math.sin(a) * sp, s, { r: 3, onHit(sh) {
          if (s.sticky === "napalm") { napalmAt(sh.x, sh.y, 1, s.damage); return; }
          boom(sh.x, sh.y, s.radius, s.damage * fireMult(s), { color: sh.color, freeze: s.freeze, knockback: s.knockback || 2 });
        } }) });
      }
    },
    rain(s, o) {
      for (let i = 0; i < s.count; i++) {
        const x = o.tx + (i % 5 - 2) * 26 + (Math.random() - 0.5) * 10;
        timers.push({ t: i * 6, run: () => shoot(x, -20 - (i / 5 | 0) * 50, 0, 3, s, { wind: false, onHit(sh) { boom(sh.x, sh.y, s.radius, s.damage * fireMult(s), { color: sh.color }); if (s.school === "FIRE") napalmAt(sh.x, sh.y, 1, 4); } }) });
      }
    },
    meteor(s, o) {
      let left = s.pierce || 0;
      shoot(o.tx - 200, -60, 4.5, 7, s, { r: 16, grav: 0.3, wind: false, onHit(sh) {
        if (left-- > 0 && sh.y < SEA) { carve(sh.x, sh.y, s.radius * 0.6); return true; }
        boom(sh.x, sh.y, s.radius, s.damage * fireMult(s), { color: sh.color, knockback: 9 });
        for (let i = 0; i < 6; i++) shoot(sh.x, sh.y - 10, (Math.random() - 0.5) * 10, -5 - Math.random() * 5, s, { r: 4, onHit(b) { boom(b.x, b.y, 12, 6, { color: "#c9a26b" }); } });
      } });
    },
    arrow(s, o) { shoot(o.x, o.y, o.vx * 1.6, o.vy * 1.6, s, { r: 4, grav: 0.35, onHit(sh) { boom(sh.x, sh.y, s.radius, Math.min(s.damage, 15 + sh.t * 0.8) * fireMult(s), { color: sh.color, knockback: 6 }); } }); },
    bomb(s, o) { bombs.push({ x: o.tx, y: groundBelow(o.tx, Math.max(0, o.ty)), turns: s.turns, s, owner: cur() }); sfx("cast"); setTimeout(done, 500); },
    burn(s) { const w = cur(); w.burn = s.turns; floatText(w.x, w.y - 50, "on fire!", "#ff7a1a"); setTimeout(done, 600); },
    rocketjump(s, o) { castsLeft++; shoot(o.x, o.y, o.vx, o.vy, s, { onHit(sh) { const w = cur(), d = Math.hypot(w.x - sh.x, w.y - sh.y); boom(sh.x, sh.y, s.radius, 0, { color: sh.color }); if (d < 90) push(w, (w.x - sh.x) * 0.12, -14 * (1 - d / 120)); hurt(w, s.damage); } }); },
    peakburst(s, o) { shoot(o.x, o.y, o.vx, o.vy, s, { onStep(sh) { if (sh.vy > 0 && !sh.popped) { sh.popped = true; sh.dead = true; for (let i = 0; i < s.count; i++) shoot(sh.x, sh.y, (Math.random() - 0.5) * 8, (Math.random() - 0.7) * 5, s, { r: 4, onHit(b) { boom(b.x, b.y, s.radius, s.damage * fireMult(s), { color: b.color }); } }); napalmAt(sh.x, sh.y, s.napalm, 5); } }, onHit() {} }); },
    multiboom(s, o) { shoot(o.x, o.y, o.vx, o.vy, s, { onHit(sh) { for (let i = 0; i < s.times; i++) timers.push({ t: i * 22, run: () => boom(sh.x, sh.y + i * 6, s.radius, s.damage * fireMult(s), { color: sh.color }) }); } }); },
    teleport(s, o) { const w = cur(); w.x = o.tx; w.y = o.ty; w.vx = w.vy = 0; while (isSolid(w.x, w.y) && w.y > 0) w.y--; sfx("zap"); sparks.push(...Array.from({ length: 20 }, () => ({ x: w.x, y: w.y - 14, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, life: 30, c: "#c06bff" }))); setTimeout(done, 500); },
    blast(s, o) {
      for (let i = 0; i < s.length; i += 8) carve(o.x + Math.cos(o.angle) * i, o.y + Math.sin(o.angle) * i, s.radius * (0.6 + i / s.length * 0.5));
      for (const w of wizards) if (w.alive && w !== cur()) { const dx = w.x - o.x, dy = w.y - 14 - o.y, along = dx * Math.cos(o.angle) + dy * Math.sin(o.angle), off = Math.abs(-dx * Math.sin(o.angle) + dy * Math.cos(o.angle));
        if (along > 0 && along < s.length + 30 && off < s.radius * 1.5) { hurt(w, s.damage); push(w, Math.cos(o.angle) * s.knockback, Math.sin(o.angle) * s.knockback - 4); } }
      booms.push({ x: o.x + Math.cos(o.angle) * s.length / 2, y: o.y + Math.sin(o.angle) * s.length / 2, r: s.length / 2, t: 0, color: "#c06bff" }); sfx("zap"); setTimeout(done, 700);
    },
    volley(s, o) { for (let i = 0; i < s.count; i++) timers.push({ t: i * 7, run: () => shoot(o.x, o.y, o.vx * (0.9 + i * 0.05), o.vy * (0.9 + i * 0.05), s, { r: 4, grav: 0.6, onHit(sh) { boom(sh.x, sh.y, s.radius, s.damage, { color: sh.color }); } }) }); },
    bounce(s, o) { let left = s.bounces; shoot(o.x, o.y, o.vx || Math.cos(o.angle) * 12, o.vy || Math.sin(o.angle) * 12, s, { grav: s.school === "STORM" ? 0.25 : 1, onHit(sh) { boom(sh.x, sh.y, s.radius, s.damage, { color: sh.color, keepTerrain: s.school === "STORM" }); if (left-- > 0) { sh.vx = -sh.vx * 0.9 + (Math.random() - 0.5) * 4; sh.vy = -Math.abs(sh.vy) * 0.85 - 3; sh.x += sh.vx; sh.y += sh.vy * 2; return true; } } }); },
    shield(s) { const w = cur(); w.shield = Math.min(5, w.shield + (s.stacks || 1)); floatText(w.x, w.y - 50, "shield x" + w.shield, "#fff3b0"); sfx("heal"); setTimeout(done, 600); },
    quake(s) {
      for (let i = 0; i < 18; i++) carve(Math.random() * W, groundBelow(Math.random() * W, 0) + 4, 6 + Math.random() * 12);
      for (const w of wizards) if (w.alive) { hurt(w, s.damage); push(w, (Math.random() - 0.5) * s.knockback * 2, -s.knockback); }
      shake = 30; sfx("boom", 60); setTimeout(done, 1200);
    },
    terrain(s, o) { shoot(o.x, o.y, o.vx, o.vy, s, { r: 9, onHit(sh) { fill(sh.x, sh.y, s.radius); boom(sh.x, sh.y, s.radius * 0.5, s.damage, { keepTerrain: true, color: "#c9a26b", knockback: 3 }); } }); },
    boulder(s, o) { let left = s.bounces, r = s.radius; shoot(o.x, o.y, o.vx, o.vy, s, { r: 10, onHit(sh) { boom(sh.x, sh.y, r, s.damage, { color: "#c9a26b", knockback: 6 }); r += 8; sh.r += 3; if (left-- > 0) { sh.vy = -Math.abs(sh.vy) * 0.6 - 2; sh.vx *= 0.9; sh.y -= 6; return true; } } }); },
    fortress() { const w = cur(); rect(w.x - 50, w.y - 70, w.x - 36, w.y + 4, 1); rect(w.x + 36, w.y - 70, w.x + 50, w.y + 4, 1); rect(w.x - 50, w.y - 80, w.x - 20, w.y - 70, 1); rect(w.x + 20, w.y - 80, w.x + 50, w.y - 70, 1); sfx("boom", 20); setTimeout(done, 600); },
    slab(s, o) { rect(o.tx - 70, o.ty - 10, o.tx + 70, o.ty + 10, 1); for (const w of wizards) while (w.alive && isSolid(w.x, w.y)) w.y--; sfx("boom", 15); setTimeout(done, 500); },
    grow(s, o) { shoot(o.x, o.y, o.vx, o.vy, s, { r: 5, onStep(sh) { sh.r = Math.min(18, 5 + sh.t * 0.2); if (sh.t > 70 && !sh.dead) { sh.dead = true; this.onHit(sh); } }, onHit(sh) { const f = Math.min(1, sh.t / 70); boom(sh.x, sh.y, s.radius * (0.6 + f * 0.6), s.damage * (0.4 + f * 0.6), { color: "#dff6ff" }); for (let i = 0; i < 5; i++) shoot(sh.x, sh.y - 6, (Math.random() - 0.5) * 8, -3 - Math.random() * 4, s, { r: 3, onHit(b) { boom(b.x, b.y, 10, 4, { color: "#dff6ff" }); } }); } }); },
    freezebomb(s, o) { shoot(o.x, o.y, o.vx, o.vy, s, { onHit(sh) { boom(sh.x, sh.y, s.radius, s.damage, { color: "#8fe3ff", freeze: s.freeze }); for (let i = 0; i < 10; i++) shoot(sh.x, sh.y - 5, (Math.random() - 0.5) * 9, -3 - Math.random() * 5, s, { r: 2, onHit(b) { boom(b.x, b.y, 6, 1, { color: "#8fe3ff", keepTerrain: true }); } }); } }); },
    icering() { const w = cur(); for (let a = 0; a < Math.PI * 2; a += 0.05) fill(w.x + Math.cos(a) * 46, w.y - 16 + Math.sin(a) * 46, 7); carve(w.x, w.y - 16, 38); rect(w.x - 12, w.y + 1, w.x + 12, w.y + 6, 1); sfx("heal"); setTimeout(done, 600); },
    splash(s, o) { shoot(o.x, o.y, o.vx, o.vy, s, { onHit(sh) { boom(sh.x, sh.y, 12, 3, { color: "#3d9bff", keepTerrain: true }); for (let i = 0; i < s.count; i++) shoot(sh.x, sh.y - 6, (Math.random() - 0.5) * 10, -3 - Math.random() * 7, s, { r: 3, onHit(b) { boom(b.x, b.y, s.radius, s.damage, { color: "#3d9bff", keepTerrain: true, knockback: 2 }); } }); } }); },
    heal(s) { const w = cur(); healW(w, s.amount); if (s.cleanse) { w.burn = 0; w.frozen = 0; } sfx("heal"); setTimeout(done, 600); },
    clam(s, o) { let stage = 0; shoot(o.x, o.y, o.vx, o.vy, s, { r: 8, onHit(sh) { if (stage === 0) { stage = 1; sh.vy = -Math.abs(sh.vy) * 0.6 - 3; sh.vx *= 0.7; sh.y -= 4; return true; } for (let i = 0; i < 70; i += 6) carve(sh.x, sh.y + i, 12); boom(sh.x, sh.y + 70, s.radius, s.damage, { color: "#3d9bff", knockback: 8 }); } }); },
    bolt(s, o) { for (let i = 0; i < s.count; i++) timers.push({ t: i * 3, run: () => { const a = o.angle + (Math.random() - 0.5) * 0.25; shoot(o.x, o.y, Math.cos(a) * 22, Math.sin(a) * 22, s, { r: 3, grav: 0, wind: false, color: "#ffe14a", onHit(sh) { boom(sh.x, sh.y, s.radius, s.damage, { color: "#ffe14a", knockback: 2 }); } }); } }); sfx("zap"); },
    strike(s, o) { const gy = groundBelow(o.tx, 0); beams.push({ x: o.tx, y1: gy, life: 20, c: "#ffe14a", w: 6 }); sfx("zap"); setTimeout(() => { boom(o.tx, gy, s.radius, s.damage, { color: "#ffe14a" }); done(); }, 250); },
    haste(s) { castsLeft += s.casts; floatText(cur().x, cur().y - 50, "+" + s.casts + " casts", "#ffe14a"); sfx("zap"); setTimeout(done, 500); },
    blink(s, o) { const w = cur(); let nx = w.x + Math.cos(o.angle) * s.distance, ny = w.y + Math.sin(o.angle) * s.distance; nx = Math.max(6, Math.min(W - 6, nx)); while (isSolid(nx, ny) && ny > 0) ny--; w.x = nx; w.y = ny; w.vx = w.vy = 0; sfx("zap"); setTimeout(done, 400); },
    drain(s, o) { shoot(o.x, o.y, o.vx, o.vy, s, { onHit(sh) { const got = boom(sh.x, sh.y, s.radius, s.damage, { color: "#8a5cff" }); healW(sh.owner, got); } }); },
    seeds(s, o) { shoot(o.x, o.y, o.vx, o.vy, s, { onHit(sh) { boom(sh.x, sh.y, s.radius, s.damage, { color: "#6fe36a" }); for (let i = 0; i < s.count; i++) { const x = sh.x + (Math.random() - 0.5) * 140; seeds.push({ x, y: groundBelow(x, Math.max(0, sh.y - 80)), armed: 1 }); } } }); },
    vine(s, o) { let inside = false, i = 0; for (; i < s.length; i += 4) { const x = o.x + Math.cos(o.angle) * i, y = o.y + Math.sin(o.angle) * i; if (isSolid(x, y)) inside = true; else if (inside) break; } const ex = o.x + Math.cos(o.angle) * i, ey = o.y + Math.sin(o.angle) * i; beams.push({ x: ex, y1: ey, x0: o.x, y0: o.y, life: 25, c: "#6fe36a", w: 5 }); setTimeout(() => { boom(ex, ey, s.radius, s.damage, { color: "#6fe36a", knockback: 7 }); done(); }, 300); },
    bridge(s, o) { for (let i = 20; i < s.length; i += 4) fill(o.x + Math.cos(o.angle) * i, o.y + 10 + Math.sin(o.angle) * i, 6); sfx("heal"); setTimeout(done, 500); },
    healball(s, o) { shoot(o.x, o.y, o.vx, o.vy, s, { onHit(sh) { boom(sh.x, sh.y, s.radius, 0, { heal: s.amount, keepTerrain: true, color: "#9dffb0" }); sfx("heal"); } }); },
    ray(s, o) { beams.push({ x: o.tx, y1: H, life: 30, c: "#fff3b0", w: s.radius * 2 }); sfx("zap"); for (const w of wizards) if (w.alive && Math.abs(w.x - o.tx) < s.radius + 8) hurt(w, s.damage); setTimeout(done, 700); },
    piety() { const live = wizards.filter(w => w.alive), avg = Math.round(live.reduce((a, w) => a + w.hp, 0) / live.length); for (const w of live) { floatText(w.x, w.y - 40, "= " + avg, "#fff3b0"); w.hp = avg; } sfx("heal"); setTimeout(done, 700); },
    freezeone(s, o) { const t = wizards.filter(w => w.alive).sort((a, b) => Math.hypot(a.x - o.tx, a.y - o.ty) - Math.hypot(b.x - o.tx, b.y - o.ty))[0]; if (t) { t.frozen = s.freeze; floatText(t.x, t.y - 56, "chained!", "#ff4fa8"); } sfx("zap"); setTimeout(done, 700); },
    healall(s) { for (const w of wizards) healW(w, s.amount); sfx("heal"); setTimeout(done, 700); },
    skip() { skipNext = true; floatText(cur().x, cur().y - 50, "curse!", "#ff4fa8"); setTimeout(done, 600); },
  };

  // ---------- turn flow ----------
  let shake = 0, finishing = false;
  function startTurn() {
    const w = cur();
    wind = (Math.random() - 0.5) * 0.11; castsLeft = 1; power = 0; charging = false; finishing = false; turnTimer = 45 * 60;
    for (const b of bombs) if (b.owner === w) b.turns--;
    if (w.burn > 0) { w.burn--; hurt(w, 5); }
    if (w.frozen > 0) { w.frozen--; banner(w.name + " is frozen and loses this turn"); phase = "wait"; setTimeout(() => nextTurn(), 1500); return; }
    phase = "aim"; banner((w.look ? '<img src="' + icon(w.look) + '" style="height:110px;display:block;margin:0 auto 4px">' : "") + '<span style="color:' + w.color + '">' + w.name + "</span>'s turn"); renderHud();
  }
  function done() { finishing = true; }                   // a spell has resolved; the world settles, then the turn moves on
  function afterSettle() {
    finishing = false;
    for (const w of wizards) if (w.alive && (w.hp <= 0 || w.y > SEA)) { w.alive = false; w.hp = 0; banner(w.name + (w.y > SEA ? " went for a swim" : " has been banished!")); booms.push({ x: w.x, y: Math.min(w.y, SEA), r: 30, t: 0, color: w.color }); }
    const alive = wizards.filter(w => w.alive);
    if (alive.length <= 1) return gameOver(alive[0]);
    if (castsLeft > 0 && cur().alive) { phase = "aim"; renderHud(); return; }
    nextTurn();
  }
  function nextTurn() {
    phase = "wait";
    setTimeout(() => {
      let n = 0; do { turn = (turn + 1) % wizards.length; } while (!wizards[turn].alive && ++n < 20);
      if (skipNext) { skipNext = false; banner(cur().name + " has a hangover and skips"); do { turn = (turn + 1) % wizards.length; } while (!wizards[turn].alive); }
      startTurn();
    }, 700);
  }
  function gameOver(win) { phase = "over"; if (mode === "host") NET.pub("h", { k: "over", w: wizards.indexOf(win) }, { qos: 1 }); document.getElementById("wtext").innerHTML = (win && win.look ? '<img src="' + icon(win.look) + '" style="height:240px;display:block;margin:0 auto 10px">' : "") + (win ? win.name + " wins!" : "Nobody survived. Classic."); document.getElementById("winner").style.display = "flex"; }

  function cast(target) {
    const w = cur(); if (phase !== "aim" || !w.alive) return;
    const s = spell;
    castsLeft--; phase = "cast"; w.casting = 45; lastCast = w.name + ": " + s.name;
    const o = { x: w.x + Math.cos(w.angle) * 22, y: w.y - 30 + Math.sin(w.angle) * 22, angle: w.angle, tx: target ? target.x : mouse.x, ty: target ? target.y : mouse.y };
    const sp = s.aim === "charge" ? 5 + power * 17 : (s.speed || 13);
    o.vx = Math.cos(w.angle) * sp; o.vy = Math.sin(w.angle) * sp;
    sfx("cast");
    banner(w.name + " casts <b>" + s.name + "</b>" + (s.joke ? "<br><small>" + s.joke + "</small>" : ""));
    (FX[s.fx] || FX.explode)(s, o);
    power = 0; charging = false; renderHud();
  }

  // ---------- simulation ----------
  function step() {
    const w = cur();
    if (phase === "aim" && w) {
      const c = w.cid && ctlBy[w.cid] && performance.now() - ctlBy[w.cid].t < 800 ? ctlBy[w.cid] : null;
      if (c) { w.angle = c.angle; w.face = Math.cos(c.angle) >= 0 ? 1 : -1; if (c.sp && spell.id !== c.sp) { const s2 = BOOK.find(x => x.id === c.sp); if (s2) { spell = s2; school = s2.school; renderHud(); } } if (c.walk) walk(w, c.walk); }
      if (keys.ArrowLeft || keys.a || touchWalk < 0) walk(w, -1);
      if (keys.ArrowRight || keys.d || touchWalk > 0) walk(w, 1);
      if (keys.ArrowUp || keys.w) w.angle -= 0.03 * w.face;
      if (keys.ArrowDown || keys.s) w.angle += 0.03 * w.face;
      if (charging) power = Math.min(1, power + 0.014);
      if (--turnTimer <= 0) { banner(w.name + " ran out of time"); castsLeft = 0; phase = "cast"; done(); }
    }
    for (const t of timers) if (--t.t < 0 && !t.ran) { t.ran = true; t.run(); }
    timers = timers.filter(t => !t.ran);
    for (const z of wizards) if (z.alive) physicsW(z);
    for (const sh of shots) stepShot(sh);
    shots = shots.filter(s => !s.dead);
    for (const n of napalms) {
      if (!n.stuck) { n.vy += 0.25; n.x += n.vx; n.y += n.vy; if (isSolid(n.x, n.y + 2)) { n.stuck = true; while (isSolid(n.x, n.y) && n.y > 0) n.y--; } if (n.y > SEA) n.life = 0; }
      else if (!isSolid(n.x, n.y + 3)) n.stuck = false, n.vx = 0, n.vy = 0;
      n.life--;
      for (const z of wizards) if (z.alive && !n.hit.has(z) && Math.abs(z.x - n.x) < 9 && Math.abs(z.y - 8 - n.y) < 14) { n.hit.add(z); hurt(z, n.dmg); push(z, (z.x - n.x) * 0.1, -2.5); }
    }
    napalms = napalms.filter(n => n.life > 0);
    for (const s of seeds) {
      if (s.armed === -1) { s.gone = true; boom(s.x, s.y - 3, 16, 10, { color: "#6fe36a" }); continue; }
      for (const z of wizards) if (z.alive && Math.hypot(z.x - s.x, z.y - s.y) < 14) s.armed = -1;
    }
    seeds = seeds.filter(s => !s.gone);
    for (const b of bombs) if (b.turns <= 0 && !b.gone) { b.gone = true; boom(b.x, b.y - 8, b.s.radius, b.s.damage, { color: "#ff7a1a", knockback: 8 }); }
    bombs = bombs.filter(b => !b.gone);
    for (const sp of sparks) { sp.vy += 0.2; sp.x += sp.vx; sp.y += sp.vy; sp.life--; }
    sparks = sparks.filter(s => s.life > 0);
    booms = booms.filter(b => ++b.t < 26);
    beams = beams.filter(b => --b.life > 0);
    texts = texts.filter(t => (t.y -= 0.6, --t.life > 0));
    if (shake > 0) shake--;
    // the spell is over when nothing is flying, nothing is scheduled and every wizard has landed
    const busy = shots.length || timers.length || napalms.some(n => !n.stuck) || wizards.some(z => z.alive && z.air);
    if ((phase === "cast") && !busy) { if (++settle > 40) { settle = 0; if (!finishing) done(); afterSettle(); } } else settle = 0;
  }
  function stepShot(sh) {
    sh.t++;
    sh.vy += 0.25 * sh.grav; if (sh.wind) sh.vx += wind;
    const steps = Math.ceil(Math.hypot(sh.vx, sh.vy) / 4);
    for (let i = 0; i < steps && !sh.dead; i++) {
      sh.x += sh.vx / steps; sh.y += sh.vy / steps;
      if (sh.fuse && --sh.fuse <= 0) { sh.dead = true; sh.onFuse(sh); return; }
      const hitW = sh.t > 4 && wizards.find(z => z.alive && (z !== sh.owner || sh.t > 25) && Math.abs(z.x - sh.x) < 10 + sh.r / 2 && sh.y > z.y - 50 && sh.y < z.y + 2);
      if (isSolid(sh.x, sh.y) || hitW || sh.y > SEA) {
        if (sh.bounce !== undefined && !hitW && sh.y <= SEA) { sh.x -= sh.vx / steps; sh.y -= sh.vy / steps; sh.vy = -sh.vy * sh.bounce; sh.vx *= 0.7; break; }
        if (sh.y > SEA) { sh.dead = true; sparks.push({ x: sh.x, y: SEA, vx: 0, vy: -3, life: 20, c: "#9fd3ff" }); return; }
        const keep = sh.onHit && sh.onHit(sh, hitW);
        if (!keep) { sh.dead = true; return; }
        break;
      }
    }
    if (sh.onStep && !sh.dead) sh.onStep(sh);
    if (sh.x < -200 || sh.x > W + 200 || sh.y > H + 100) sh.dead = true;
  }
  function walk(w, dir) {
    if (w.air) return;
    if (w.face !== dir) { w.face = dir; w.angle = Math.PI - w.angle; }
    const nx = w.x + dir * 1.5; w.walking = 8;
    for (let up = 0; up <= 6; up++) if (!isSolid(nx, w.y - up - 1) && !isSolid(nx, w.y - up - 24)) { w.x = Math.max(4, Math.min(W - 4, nx)); w.y -= up; return; }
  }
  function physicsW(w) {
    if (!isSolid(w.x, w.y + 1) || w.vy < 0 || Math.abs(w.vx) > 0.5) {
      w.air = true; w.vy = Math.min(14, w.vy + 0.32); w.vx *= 0.99;
      const nx = w.x + w.vx; if (!isSolid(nx, w.y - 12)) w.x = nx; else w.vx = -w.vx * 0.3;
      w.y += w.vy;
      if (w.vy < 0 && isSolid(w.x, w.y - 30)) w.vy = 0;
      if (isSolid(w.x, w.y)) { while (isSolid(w.x, w.y) && w.y > 0) w.y--; if (w.vy > 10) hurt(w, (w.vy - 10) * 4); w.vy = 0; w.vx *= 0.4; if (Math.abs(w.vx) < 0.6) w.vx = 0; }
      if (w.y > SEA) { w.air = false; w.vx = w.vy = 0; }
    } else { w.air = false; w.vx = 0; w.vy = 0; }
    w.x = Math.max(4, Math.min(W - 4, w.x));
  }

  // ---------- drawing ----------
  let scale = 1, offX = 0, offY = 0, tick = 0;
  // follow camera: on small screens the map is zoomed in on the action (the zoom button cycles it)
  const ZOOMS = [1, 1.7, 2.5]; let zoomI = Math.min(innerWidth, innerHeight * 1.8) < 1000 ? 1 : 0, camX = W / 2, camY = H / 2;
  function camTarget() {
    if (shots.length) return { x: shots[0].x, y: shots[0].y };
    const w = cur(); if (!w || phase === "setup") return { x: W / 2, y: H / 2 };
    if (phase === "aim" && myTurn() && (spell.aim === "target" || spell.aim === "aerial") && tgt) return { x: (w.x + tgt.x) / 2, y: (w.y + tgt.y) / 2 };
    return { x: w.x, y: w.y - 40 };
  }
  function draw() {
    tick++;
    repaint();
    const vw = innerWidth, vh = innerHeight - hudH(), z = ZOOMS[zoomI];
    scale = Math.min(vw / W, vh / H) * z;
    const t = camTarget(); camX += (t.x - camX) * 0.08; camY += (t.y - camY) * 0.08;
    if (z === 1) { camX = W / 2; camY = H / 2; }
    offX = vw / 2 - camX * scale; offY = vh / 2 - camY * scale;
    if (W * scale > vw) offX = Math.min(0, Math.max(vw - W * scale, offX)); else offX = (vw - W * scale) / 2;
    if (H * scale > vh) offY = Math.min(0, Math.max(vh - H * scale, offY)); else offY = (vh - H * scale) / 2;
    if (cv.width !== innerWidth || cv.height !== innerHeight) { cv.width = innerWidth; cv.height = innerHeight; }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#0b0816"; ctx.fillRect(0, 0, cv.width, cv.height);
    const sx = shake ? (Math.random() - 0.5) * shake * 0.6 : 0;
    ctx.setTransform(scale, 0, 0, scale, offX + sx, offY);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#160f38"); g.addColorStop(0.6, "#3b2366"); g.addColorStop(1, "#6a3a6e");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff30"; for (let i = 0; i < 90; i++) { const x = (i * 197) % W, y = (i * 89) % (H * 0.55); ctx.fillRect(x, y, (i % 3) + 1, (i % 3) + 1); }
    ctx.fillStyle = "#2a1c4a"; ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 40) ctx.lineTo(x, H * 0.5 + Math.sin(x / 140) * 50 + Math.sin(x / 55) * 15); ctx.lineTo(W, H); ctx.fill();
    ctx.drawImage(terr, 0, 0);
    for (const b of bombs) { ctx.fillStyle = "#333"; ctx.beginPath(); ctx.arc(b.x, b.y - 9, 9, 0, 7); ctx.fill(); ctx.fillStyle = "#ff7a1a"; ctx.font = "bold 12px system-ui"; ctx.textAlign = "center"; ctx.fillText(Math.max(0, b.turns), b.x, b.y - 22); ctx.textAlign = "start"; }
    for (const s of seeds) { ctx.fillStyle = "#8b5a2b"; ctx.beginPath(); ctx.ellipse(s.x, s.y - 3, 4, 3, 0, 0, 7); ctx.fill(); }
    for (const n of napalms) { ctx.fillStyle = (tick + n.x) % 6 < 3 ? "#ff8a1a" : "#ffd04a"; ctx.beginPath(); ctx.arc(n.x, n.y - 2, 3 + Math.random() * 2, 0, 7); ctx.fill(); }
    for (const w of wizards) if (w.alive) drawWizard(w, w === cur() && phase === "aim");
    for (const s of shots) { ctx.fillStyle = s.color; ctx.shadowColor = s.color; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
    for (const b of beams) { ctx.globalAlpha = Math.min(1, b.life / 15); ctx.strokeStyle = b.c; ctx.lineWidth = b.w; ctx.beginPath(); if (b.x0 !== undefined) { ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x, b.y1); } else { ctx.moveTo(b.x + (Math.random() - 0.5) * 6, 0); ctx.lineTo(b.x, b.y1); } ctx.stroke(); ctx.globalAlpha = 1; }
    for (const b of booms) { ctx.globalAlpha = 1 - b.t / 26; ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.45 + b.t / 34), 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    for (const s of sparks) { ctx.fillStyle = s.c; ctx.fillRect(s.x, s.y, 3, 3); }
    // sea
    ctx.fillStyle = "#1d5fbf"; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 20) ctx.lineTo(x, SEA + Math.sin(x / 40 + tick / 20) * 3); ctx.lineTo(W, H); ctx.fill(); ctx.globalAlpha = 1;
    for (const t of texts) { ctx.globalAlpha = Math.min(1, t.life / 20); ctx.fillStyle = t.c; ctx.font = "bold 18px system-ui"; ctx.textAlign = "center"; ctx.fillText(t.t, t.x, t.y); ctx.textAlign = "start"; ctx.globalAlpha = 1; }
    if (phase === "aim" && cur() && (spell.aim === "target" || spell.aim === "aerial")) { const m = (coarse && tgt) ? tgt : mouse; if (!coarse || tgt) { ctx.strokeStyle = "#ffcf4a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(m.x, m.y, 16, 0, 7); ctx.moveTo(m.x - 24, m.y); ctx.lineTo(m.x + 24, m.y); ctx.moveTo(m.x, m.y - 24); ctx.lineTo(m.x, m.y + 24); ctx.stroke(); } }
    // wind and timer stay fixed on screen whatever the zoom
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cx = innerWidth / 2;
    ctx.fillStyle = "#fff"; ctx.font = "14px system-ui"; ctx.textAlign = "center"; ctx.fillText("wind", cx, 20);
    ctx.fillStyle = wind > 0 ? "#7fd4ff" : "#ffb47f"; ctx.fillRect(cx, 27, wind * 1400, 6); ctx.textAlign = "start";
    if (phase === "aim" && cur()) { ctx.fillStyle = "#ffffffcc"; ctx.font = "14px system-ui"; ctx.fillText("time " + Math.ceil(turnTimer / 60) + "s" + (castsLeft > 1 ? "   casts left: " + castsLeft : ""), 12, 20); }
  }
  function drawRig(w, active) {
    const im = atlas[w.look]; if (!im || !im.complete || !im.naturalWidth) return false;
    const t = tick / 60 * 2.2, flip = w.face === 1 ? -1 : 1;   // the art faces left
    const rot = { backarm: Math.sin(t) * 0.05, frontarm: Math.sin(-t) * 0.05, head: Math.sin(t) * 0.025, legl: 0, legr: 0 };
    if (w.air) { const s = Math.sin(tick / 60 * 15) * 0.5; rot.backarm = Math.PI + s; rot.frontarm = Math.PI + s; rot.legl = s; rot.legr = -s; }
    else if (w.walking > 0) { const k = tick / 60 * 5.5, a = (Math.exp(Math.sin(k)) - 0.4) * 0.85; rot.backarm = Math.sin(k) * 0.5; rot.frontarm = Math.sin(-k) * 0.5; rot.legl = -a * 0.3; rot.legr = a * 0.3; rot.head = 0; }
    if (active || w.casting > 0) { const la = flip === -1 ? w.angle : Math.PI - w.angle; rot.frontarm = la - Math.PI / 2 + Math.sin(t * 1.8) * 0.04; }
    rot.staff = rot.frontarm;
    ctx.save(); ctx.translate(w.x, w.y); ctx.scale(flip * RK, RK); ctx.translate(-FEET_X, -FEET_Y);
    for (const k of ["hairback", "staff", "backarm", "legl", "legr", "torso", "frontarm", "head"]) {
      const [i, px, py] = RIG[k]; ctx.save(); ctx.translate(px, py); if (rot[k]) ctx.rotate(rot[k]);
      ctx.drawImage(im, 256 * i, 0, 256, 256, -px, -py, 1024, 1024); ctx.restore();
    }
    ctx.restore(); return true;
  }
  function drawWizard(w, active) {
    if (w.walking > 0) w.walking--; if (w.casting > 0) w.casting--;
    ctx.save(); ctx.translate(w.x, w.y);
    if (w.frozen) { ctx.fillStyle = "#8fe3ff55"; ctx.fillRect(-18, -66, 36, 66); }
    if (w.shield) { ctx.strokeStyle = "#fff3b0aa"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -30, 36, 0, 7); ctx.stroke(); }
    ctx.restore();
    if (!drawRig(w, active)) {   // fallback: plain robe-and-hat wizard
      ctx.save(); ctx.translate(w.x, w.y);
      ctx.fillStyle = w.color; ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.lineTo(6, -22); ctx.lineTo(-6, -22); ctx.fill();
      ctx.fillStyle = "#f2d3b1"; ctx.beginPath(); ctx.arc(0, -27, 6, 0, 7); ctx.fill();
      ctx.fillStyle = w.color; ctx.beginPath(); ctx.moveTo(-10, -31); ctx.lineTo(10, -31); ctx.lineTo(w.face * 6, -52); ctx.fill();
      ctx.restore();
    }
    ctx.save(); ctx.translate(w.x, w.y);
    if (w.burn) { ctx.fillStyle = "#ff7a1a"; ctx.beginPath(); ctx.arc((Math.random() - 0.5) * 14, -50 - Math.random() * 10, 5, 0, 7); ctx.fill(); }
    if (active) {
      const len = 40 + (spell.aim === "charge" ? power * 70 : 30);
      ctx.strokeStyle = "#ffcf4a"; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(Math.cos(w.angle) * len, -30 + Math.sin(w.angle) * len); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#ffcf4a"; ctx.beginPath(); ctx.moveTo(0, -78); ctx.lineTo(-7, -88); ctx.lineTo(7, -88); ctx.fill();
    }
    ctx.restore();
    // name and hit points under the feet, like the original
    ctx.textAlign = "center"; ctx.lineJoin = "round";
    ctx.font = (active ? "bold " : "") + "14px system-ui"; ctx.lineWidth = 3; ctx.strokeStyle = "#000c"; ctx.strokeText(w.name, w.x, w.y + 17); ctx.fillStyle = active ? "#ffcf4a" : "#fff"; ctx.fillText(w.name, w.x, w.y + 17);
    ctx.font = "bold 17px system-ui"; ctx.strokeStyle = "#fffc"; ctx.strokeText(Math.max(0, w.hp), w.x, w.y + 35); ctx.fillStyle = w.hp > 40 ? "#9b0d0d" : "#e01010"; ctx.fillText(Math.max(0, w.hp), w.x, w.y + 35);
    ctx.textAlign = "start";
  }
  function loop() {
    if (mode === "guest") guestStep(); else step();
    if (mode === "host" && phase !== "setup") sendSnap();
    draw(); requestAnimationFrame(loop);
  }

  // ---------- HUD ----------
  const hud = document.getElementById("hud");
  const hudH = () => (hud.offsetHeight || 0);
  function renderHud() {
    const w = cur(); if (!w) return;
    document.body.classList.toggle("myturn", myTurn());
    document.body.classList.toggle("guest", mode === "guest");
    requestAnimationFrame(() => { document.getElementById("touch").style.bottom = (hudH() + 10) + "px"; });
    document.getElementById("turn").innerHTML = (w.look ? '<img src="' + icon(w.look) + '" style="height:46px;vertical-align:middle;margin-right:6px">' : "") + '<span style="color:' + w.color + '">' + w.name + "</span>";
    document.getElementById("schools").innerHTML = SCHOOL_LIST.map(k => '<div class="tab' + (k === school ? " on" : "") + '" data-k="' + k + '" style="--c:' + SCHOOLS[k] + '">' + k.toLowerCase() + "</div>").join("");
    const list = BOOK.filter(s => s.school === school);
    document.getElementById("spells").innerHTML = list.map((s, i) => '<div class="spell' + (s === spell ? " on" : "") + '" data-id="' + s.id + '" title="' + (s.desc || "").replace(/"/g, "&quot;") + '"><b>' + (i + 1) + "</b> " + s.name + '<span class="aim">' + aimLabel(s.aim) + "</span></div>").join("");
    document.getElementById("desc").textContent = spell.desc || "";
    document.querySelectorAll(".tab").forEach(e => e.onclick = () => pickSchool(e.dataset.k));
    document.querySelectorAll(".spell").forEach(e => e.onclick = () => { spell = BOOK.find(s => s.id === +e.dataset.id); renderHud(); if (spell.aim === "self" && phase === "aim") doCast(); });
  }
  const aimLabel = a => ({ charge: "aim + charge", angle: "aim", target: "click a spot", aerial: "from the sky", self: "instant" })[a] || a;
  function pickSchool(k) { school = k; spell = BOOK.find(s => s.school === k); renderHud(); }
  let bannerT; function banner(html) { if (mode === "host") NET.pub("h", { k: "ban", h: html }, { qos: 1 }); const t = document.getElementById("toast"); t.innerHTML = html; t.classList.add("show"); clearTimeout(bannerT); bannerT = setTimeout(() => t.classList.remove("show"), 2600); }

  // ---------- input ----------
  // every control goes through these, so a phone guest sends its move to the host instead of acting on its own copy
  const myTurn = () => { const w = cur(); return !!w && phase === "aim" && (mode !== "guest" || w.cid === NET.cid); };
  let mySeq = 0;
  function act(a, extra) { NET.pub("g", Object.assign({ k: "act", cid: NET.cid, seq: ++mySeq, a, angle: cur().angle, sp: spell.id }, extra || {}), { qos: 1 }); }
  function doCast(target) {
    if (!myTurn()) return;
    if (mode === "guest") { act("cast", { tx: target ? target.x : mouse.x, ty: target ? target.y : mouse.y, power }); power = 0; charging = false; phase = "cast"; renderHud(); return; }
    cast(target);
  }
  function doJump() { if (!myTurn()) return; if (mode === "guest") return act("jump"); const w = cur(); if (!w.air) { w.vy = -6.5; w.vx = 2.8 * w.face; w.air = true; } }
  function doEnd() { if (!myTurn()) return; if (mode === "guest") return act("end"); castsLeft = 0; phase = "cast"; done(); }
  function startCharge() { if (myTurn() && !charging) { charging = true; power = 0; } }
  function toWorld(e) { return { x: (e.clientX - offX) / scale, y: (e.clientY - offY) / scale }; }
  function aimAt(p) { const w = cur(); if (!myTurn()) return; w.angle = Math.atan2(p.y - (w.y - 30), p.x - w.x); w.face = Math.cos(w.angle) >= 0 ? 1 : -1; if (mode === "guest") myAngle = w.angle; }
  const needsSpot = () => spell.aim === "target" || spell.aim === "aerial";
  cv.addEventListener("pointermove", e => { const p = toWorld(e); mouse.x = p.x; mouse.y = p.y; if (!needsSpot() && (e.pointerType !== "touch" || e.buttons)) aimAt(p); });
  cv.addEventListener("pointerdown", e => {
    if (!myTurn()) return; const p = toWorld(e); mouse.x = p.x; mouse.y = p.y;
    if (e.pointerType === "touch") { if (needsSpot()) tgt = p; else aimAt(p); return; }   // phones: drag to aim or tap a spot, then press Cast
    if (needsSpot()) return doCast(p);
    aimAt(p);
    if (spell.aim === "charge") startCharge(); else doCast(p);
  });
  addEventListener("pointerup", e => { if (e.pointerType !== "touch" && charging && phase === "aim") doCast(); });
  addEventListener("keydown", e => {
    if (document.activeElement && document.activeElement.tagName === "INPUT") return;
    keys[e.key] = true;
    if (phase !== "aim") return;
    if (e.key === " ") { e.preventDefault(); if (spell.aim === "charge") startCharge(); else if (!e.repeat) doCast(needsSpot() ? (tgt || mouse) : null); }
    if (e.key === "Enter" || e.key === "j") doJump();
    if (e.key === "q" || e.key === "e") { const i = SCHOOL_LIST.indexOf(school); pickSchool(SCHOOL_LIST[(i + (e.key === "e" ? 1 : SCHOOL_LIST.length - 1)) % SCHOOL_LIST.length]); }
    if (/^[1-9]$/.test(e.key)) { const list = BOOK.filter(s => s.school === school); if (list[+e.key - 1]) { spell = list[+e.key - 1]; renderHud(); } }
    if (e.key === "Tab") { e.preventDefault(); doEnd(); }
  });
  addEventListener("keyup", e => { keys[e.key] = false; if (e.key === " " && charging && phase === "aim") doCast(); });
  // on-screen buttons for phones (they work with a mouse too)
  const hold = (id, down, up) => { const el = document.getElementById(id); el.addEventListener("pointerdown", e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (x) {} down(); }); for (const ev of ["pointerup", "pointercancel"]) el.addEventListener(ev, e => { e.preventDefault(); if (up) up(); }); };
  hold("tLeft", () => touchWalk = -1, () => touchWalk = 0);
  hold("tRight", () => touchWalk = 1, () => touchWalk = 0);
  hold("tJump", doJump);
  hold("tEnd", doEnd);
  hold("tCast", () => { if (spell.aim === "charge") startCharge(); else doCast(needsSpot() ? (tgt || mouse) : null); }, () => { if (charging && phase === "aim") doCast(); });

  // ---------- setup screen + spell forge ----------
  const names = document.getElementById("names");
  function addName(v, look) {
    if (names.children.length >= 10) return;
    const r = document.createElement("div"); r.className = "row";
    const used = [...names.querySelectorAll(".pic")].map(x => x.value);
    const guess = look !== undefined ? look : ((LOOKS.find(p => v && p.name.toLowerCase() === String(v).toLowerCase()) || LOOKS.find(p => !used.includes(p.id)) || {}).id || "");
    r.innerHTML = '<img class="pv" src="' + (guess ? icon(guess) : "") + '"><input placeholder="Wizard name" maxlength="16" value="' + (v || "") + '"><select class="pic">' + LOOKS.map(p => '<option value="' + p.id + '"' + (p.id === guess ? " selected" : "") + ">" + p.name + "</option>").join("") + '<option value="">plain wizard</option></select><button class="ghost x">×</button>';
    const sel = r.querySelector(".pic"), pv = r.querySelector(".pv"); pv.style.visibility = guess ? "visible" : "hidden";
    sel.onchange = () => { pv.src = sel.value ? icon(sel.value) : ""; pv.style.visibility = sel.value ? "visible" : "hidden"; };
    r.querySelector(".x").onclick = () => r.remove(); names.appendChild(r);
  }
  let saved = []; try { saved = JSON.parse(localStorage.getItem("wp_names2") || "[]"); } catch (e) {}
  (saved.length ? saved : LOOKS.slice(0, 8).map(p => ({ name: p.name, look: p.id }))).forEach(e => addName(e.name, e.look));
  document.getElementById("add").onclick = () => addName("");
  document.getElementById("start").onclick = () => {
    const ns = [...names.querySelectorAll(".row")].map((r, i) => ({ name: r.querySelector("input").value.trim(), look: r.querySelector(".pic").value, cid: claims[i] || "" })).filter(e => e.name);
    if (ns.length < 2) return banner("Need at least two wizards");
    try { localStorage.setItem("wp_names2", JSON.stringify(ns)); } catch (e) {}
    document.getElementById("setup").style.display = "none";
    shots = []; napalms = []; bombs = []; seeds = []; timers = []; booms = []; sparks = []; beams = []; texts = [];
    makeTerrain(document.getElementById("map").value); spawnWizards(ns);
    if (mode === "host") { sendFull(); sendLobby(true); }
  };
  document.getElementById("again").onclick = () => { document.getElementById("winner").style.display = "none"; phase = "setup"; if (mode === "guest") document.getElementById("join").style.display = "flex"; else document.getElementById("setup").style.display = "flex"; if (mode === "host") { claims = {}; wizards.forEach((w, i) => { if (w.cid) claims[i] = w.cid; }); sendLobby(false); } };
  document.getElementById("forgeBtn").onclick = () => {
    const box = document.getElementById("forgeList");
    box.innerHTML = BOOK.map(s => '<div class="frow" data-id="' + s.id + '"><span class="dot" style="background:' + SCHOOLS[s.school] + '"></span><input class="fn" value="' + s.name.replace(/"/g, "&quot;") + '"><input class="fj" placeholder="joke line shown when cast" value="' + (s.joke || "").replace(/"/g, "&quot;") + '"></div>').join("");
    document.getElementById("forge").style.display = "flex";
  };
  document.getElementById("forgeSave").onclick = () => {
    document.querySelectorAll(".frow").forEach(r => { const id = +r.dataset.id, s = BOOK.find(x => x.id === id), base = SPELLS.find(x => x.id === id); s.name = r.querySelector(".fn").value || base.name; s.joke = r.querySelector(".fj").value; if (s.name !== base.name || (s.joke || "") !== (base.joke || "")) forge[id] = { name: s.name, joke: s.joke }; else delete forge[id]; });
    try { localStorage.setItem("wp_forge", JSON.stringify(forge)); } catch (e) {}
    document.getElementById("forge").style.display = "none"; banner("Spell book saved");
  };
  document.getElementById("forgeClose").onclick = () => document.getElementById("forge").style.display = "none";
  // ---------- playing together on phones ----------
  let claims = {}, ctlBy = {}, lastSeq = {}, opsSent = 0, snapN = 0, opsHave = 0, lastCtl = 0, myAngle = 0;
  const setupRows = () => [...names.querySelectorAll(".row")].map(r => ({ name: r.querySelector("input").value.trim(), look: r.querySelector(".pic").value }));
  function netStatus(state, text) { for (const id of ["roomInfo", "joinBox"]) { const el = document.getElementById(id), st = el && el.querySelector(".st"); if (st) { st.textContent = text; st.dataset.state = state; } } }
  // host side
  function sendLobby(started) {
    const inSetup = phase === "setup";
    const rows = inSetup ? setupRows() : wizards.map(w => ({ name: w.name, look: w.look }));
    const cl = inSetup ? claims : Object.fromEntries(wizards.map((w, i) => [i, w.cid]).filter(e => e[1]));
    NET.pub("l", { k: "lobby", rows, claims: cl, started: !!started || !inSetup }, { qos: 1, retain: true });
    document.querySelectorAll("#names .row").forEach((r, i) => r.classList.toggle("claimed", !!claims[i]));
  }
  function snapState() {
    return { k: "s", n: ++snapN, ph: phase, tu: turn, wi: Math.round(wind * 1e4) / 1e4, cl: castsLeft, tt: turnTimer, sp: spell.id, pw: r1(power), ch: charging, sh: shake,
      w: wizards.map(w => [r1(w.x), r1(w.y), r1(w.vx), r1(w.vy), w.hp, w.face, Math.round(w.angle * 100) / 100, w.alive ? 1 : 0, w.air ? 1 : 0, w.walking | 0, w.casting | 0, w.frozen | 0, w.shield | 0, w.burn | 0]),
      s: shots.map(o => [r1(o.x), r1(o.y), r1(o.vx), r1(o.vy), o.r, o.color, o.grav]),
      na: napalms.map(n => [r1(n.x), r1(n.y)]), bo: bombs.map(b => [r1(b.x), r1(b.y), b.turns]), se: seeds.map(o => [r1(o.x), r1(o.y)]) };
  }
  function sendSnap() {
    if (tick % 2) return;
    const m = snapState();
    const fresh = a => a.filter(o => !o._s).map(o => (o._s = 1, o));
    m.fb = fresh(booms).map(b => [r1(b.x), r1(b.y), r1(b.r), b.color]);
    m.fx = fresh(beams).map(b => [r1(b.x), r1(b.y1), b.x0 === undefined ? null : r1(b.x0), b.y0 === undefined ? null : r1(b.y0), b.life, b.c, b.w]);
    m.ft = fresh(texts).map(t => [r1(t.x), r1(t.y), t.t, t.c, t.life]);
    m.snd = sndOut; sndOut = [];
    m.o0 = opsSent; m.o = ops.slice(opsSent); opsSent = ops.length;
    NET.pub("h", m);
  }
  function sendFull() {
    NET.pub("h", { k: "full", wz: wizards.map(w => ({ name: w.name, look: w.look, cid: w.cid, color: w.color })), forge, ops, snap: snapState() }, { qos: 1 });
    opsSent = ops.length;
  }
  function hostRoom(room) {
    mode = "host";
    NET.on("connect", () => { sendLobby(false); if (phase !== "setup") sendFull(); });
    NET.on("g", m => {
      if (!m || typeof m.cid !== "string") return;
      if (m.k === "hello") { sendLobby(false); if (phase !== "setup") sendFull(); return; }
      if (m.k === "claim") {
        const i = m.i | 0;
        if (phase === "setup") { if (claims[i] && claims[i] !== m.cid) return sendLobby(false); for (const k in claims) if (claims[k] === m.cid) delete claims[k]; claims[i] = m.cid; }
        else if (wizards[i] && (!wizards[i].cid || wizards[i].cid === m.cid)) { for (const w of wizards) if (w.cid === m.cid) w.cid = ""; wizards[i].cid = m.cid; sendFull(); }
        return sendLobby(false);
      }
      if (m.k === "ctl") { ctlBy[m.cid] = { walk: Math.sign(m.walk | 0), angle: +m.angle || 0, sp: m.sp | 0, t: performance.now() }; return; }
      if (m.k === "act") {
        if ((lastSeq[m.cid] || 0) >= m.seq) return; lastSeq[m.cid] = m.seq;
        const w = cur(); if (!w || w.cid !== m.cid || phase !== "aim") return;
        if (typeof m.angle === "number") { w.angle = m.angle; w.face = Math.cos(m.angle) >= 0 ? 1 : -1; }
        const s2 = BOOK.find(x => x.id === m.sp); if (s2) { spell = s2; school = s2.school; }
        if (m.a === "cast") { power = Math.max(0, Math.min(1, +m.power || 0)); cast({ x: +m.tx || 0, y: +m.ty || 0 }); }
        if (m.a === "jump") doJump();
        if (m.a === "end") doEnd();
      }
    });
    NET.connect(room, ["g"], netStatus);
    const link = location.origin + location.pathname + "?room=" + room;
    const box = document.getElementById("roomInfo"); box.hidden = false;
    box.querySelector(".code").textContent = room; box.querySelector(".link").textContent = link;
    const qr = document.getElementById("qr"); qr.innerHTML = "";
    try { if (typeof QRCode !== "undefined") new QRCode(qr, { text: link, width: 140, height: 140, correctLevel: QRCode.CorrectLevel.M }); } catch (e) {}
    names.addEventListener("input", () => sendLobby(false)); names.addEventListener("change", () => sendLobby(false));
    document.getElementById("hostBtn").textContent = "Room " + room;
  }
  document.getElementById("zoomBtn").onclick = () => { zoomI = (zoomI + 1) % ZOOMS.length; };
  document.getElementById("hostBtn").onclick = () => { if (mode !== "host") hostRoom(NET.code()); };
  // phone (guest) side
  function joinRoom(room) {
    mode = "guest"; phase = "setup";
    document.getElementById("setup").style.display = "none"; document.getElementById("join").style.display = "flex";
    document.getElementById("joinRoom").textContent = room.toUpperCase();
    NET.on("connect", () => NET.pub("g", { k: "hello", cid: NET.cid }, { qos: 1 }));
    NET.on("l", m => { renderJoin(m); });
    NET.on("h", m => {
      if (!m) return;
      if (m.k === "full") applyFull(m);
      else if (m.k === "s") applySnap(m);
      else if (m.k === "ban") { const t = document.getElementById("toast"); t.innerHTML = m.h; t.classList.add("show"); clearTimeout(bannerT); bannerT = setTimeout(() => t.classList.remove("show"), 2600); }
      else if (m.k === "over") gameOver(wizards[m.w]);
    });
    NET.connect(room, ["l", "h"], netStatus);
  }
  function renderJoin(m) {
    const list = document.getElementById("joinList"), cl = m.claims || {};
    list.innerHTML = "";
    (m.rows || []).forEach((r, i) => {
      if (!r.name) return;
      const mine = cl[i] === NET.cid, taken = !!cl[i] && !mine;
      const b = document.createElement("button"); b.className = "jrow" + (mine ? " mine" : "") + (taken ? " taken" : "");
      b.innerHTML = (r.look ? '<img src="' + icon(r.look) + '" alt="">' : "") + "<span></span><em>" + (mine ? "you" : taken ? "taken" : "tap to play") + "</em>";
      b.querySelector("span").textContent = r.name; b.disabled = taken;
      b.onclick = () => NET.pub("g", { k: "claim", cid: NET.cid, i }, { qos: 1 });
      list.appendChild(b);
    });
    const mineIdx = Object.keys(cl).find(k => cl[k] === NET.cid);
    document.getElementById("joinHint").textContent = m.started ? (mineIdx !== undefined ? "Game on. Loading the battlefield..." : "Game in progress. Pick a free wizard to take over.") : mineIdx !== undefined ? "You're in. Waiting for the host to start." : "Pick your wizard.";
    if (m.started && mineIdx !== undefined && phase === "setup") NET.pub("g", { k: "hello", cid: NET.cid }, { qos: 1 });
  }
  function applyFull(m) {
    for (const k in m.forge || {}) { const s2 = BOOK.find(x => x.id === +k); if (s2) Object.assign(s2, m.forge[k]); }
    wizards = (m.wz || []).map(e => ({ name: e.name, look: e.look, cid: e.cid, color: e.color, x: 0, y: 0, vx: 0, vy: 0, hp: 100, alive: true, face: 1, angle: 0, walking: 0, casting: 0 }));
    for (const o of m.ops || []) applyOp(o); opsHave = (m.ops || []).length;
    shots = []; napalms = []; bombs = []; seeds = []; booms = []; sparks = []; beams = []; texts = [];
    document.getElementById("join").style.display = "none"; document.getElementById("winner").style.display = "none";
    phase = "?"; applySnap(m.snap, true); if (myTurn()) myAngle = cur().angle; renderHud();
  }
  function applyOp(o) { quiet = true; if (o[0] === "mk") makeTerrain(o[1], o[2]); else if (o[0] === "e") ellipse(o[1], o[2], o[3], o[4], o[5]); else if (o[0] === "r") rect(o[1], o[2], o[3], o[4], o[5]); quiet = false; }
  function applySnap(m, initial) {
    if (!wizards.length || !m) return;
    if (!initial) {
      if (m.o0 > opsHave) { NET.pub("g", { k: "hello", cid: NET.cid }, { qos: 1 }); return; }   // missed terrain changes: ask for the whole state again
      for (let i = opsHave - m.o0; i < (m.o || []).length; i++) applyOp(m.o[i]);
      opsHave = Math.max(opsHave, m.o0 + (m.o || []).length);
    }
    const was = turn + phase + castsLeft;
    phase = m.ph; turn = m.tu; wind = m.wi; castsLeft = m.cl; turnTimer = m.tt; shake = m.sh || 0;
    const mine = myTurn();
    m.w.forEach((a, i) => { const w = wizards[i]; if (!w) return; [w.x, w.y, w.vx, w.vy, w.hp] = a; if (!(mine && i === turn)) { w.face = a[5]; w.angle = a[6]; } w.alive = !!a[7]; w.air = !!a[8]; w.walking = a[9]; w.casting = a[10]; w.frozen = a[11]; w.shield = a[12]; w.burn = a[13]; });
    shots = m.s.map(a => ({ x: a[0], y: a[1], vx: a[2], vy: a[3], r: a[4], color: a[5], grav: a[6] }));
    napalms = m.na.map(a => ({ x: a[0], y: a[1], stuck: true })); bombs = m.bo.map(a => ({ x: a[0], y: a[1], turns: a[2] })); seeds = m.se.map(a => ({ x: a[0], y: a[1] }));
    for (const b of m.fb || []) { booms.push({ x: b[0], y: b[1], r: b[2], t: 0, color: b[3] }); for (let i = 0; i < Math.min(20, b[2]); i++) sparks.push({ x: b[0], y: b[1], vx: (Math.random() - 0.5) * b[2] * 0.3, vy: (Math.random() - 0.8) * b[2] * 0.25, life: 30 + Math.random() * 20, c: b[3] }); }
    for (const b of m.fx || []) beams.push(b[2] === null ? { x: b[0], y1: b[1], life: b[4], c: b[5], w: b[6] } : { x: b[0], y1: b[1], x0: b[2], y0: b[3], life: b[4], c: b[5], w: b[6] });
    for (const t of m.ft || []) texts.push({ x: t[0], y: t[1], t: t[2], c: t[3], life: t[4] });
    for (const z of m.snd || []) sfx(z[0], z[1]);
    if (!mine) { const s2 = BOOK.find(x => x.id === m.sp); if (s2) { spell = s2; school = s2.school; } power = m.pw; charging = m.ch; }
    if (was !== turn + phase + castsLeft) { if (mine) { myAngle = wizards[turn].angle; tgt = null; } renderHud(); }
  }
  function guestStep() {
    const w = cur();
    if (myTurn()) {
      if (keys.ArrowUp || keys.w) myAngle -= 0.03 * w.face;
      if (keys.ArrowDown || keys.s) myAngle += 0.03 * w.face;
      const walkDir = (keys.ArrowLeft || keys.a || touchWalk < 0) ? -1 : (keys.ArrowRight || keys.d || touchWalk > 0) ? 1 : 0;
      if (walkDir && walkDir !== (Math.cos(myAngle) >= 0 ? 1 : -1)) myAngle = Math.PI - myAngle;
      w.angle = myAngle; w.face = Math.cos(myAngle) >= 0 ? 1 : -1;
      if (charging) power = Math.min(1, power + 0.014);
      const now = performance.now();
      if (now - lastCtl > 66) { lastCtl = now; NET.pub("g", { k: "ctl", cid: NET.cid, walk: walkDir, angle: Math.round(myAngle * 1000) / 1000, sp: spell.id }); }
    }
    for (const z of wizards) if (z.alive && z.air) { z.vy = Math.min(14, z.vy + 0.32); z.x += z.vx; z.y += z.vy; }
    for (const o of shots) { o.vy += 0.25 * (o.grav ?? 1); o.x += o.vx; o.y += o.vy; }
    for (const sp of sparks) { sp.vy += 0.2; sp.x += sp.vx; sp.y += sp.vy; sp.life--; }
    sparks = sparks.filter(s => s.life > 0);
    booms = booms.filter(b => ++b.t < 26);
    beams = beams.filter(b => --b.life > 0);
    texts = texts.filter(t => (t.y -= 0.6, --t.life > 0));
    if (shake > 0) shake--;
    if (turnTimer > 0 && phase === "aim") turnTimer--;
  }
  document.getElementById("joinBtn").onclick = () => { const c = document.getElementById("joinCode").value.trim().toUpperCase(); if (/^[A-Z]{4}$/.test(c)) joinRoom(c); else banner("Room codes are 4 letters"); };
  const qRoom = (new URLSearchParams(location.search).get("room") || "").toUpperCase();
  if (/^[A-Z]{4}$/.test(qRoom)) joinRoom(qRoom);
  let lastCast = "";
  window.__wp = { get lastCast() { return lastCast; }, get phase() { return phase; }, get spell() { return spell.name; }, get alive() { return wizards.filter(w => w.alive).length; }, pick(id) { spell = BOOK.find(s => s.id === id); school = spell.school; renderHud(); }, ids: BOOK.map(s => s.id) };   // test hook
  makeTerrain("hills"); loop();
})();
