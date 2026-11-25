/* Exercise demonstrations — original animated figures made for Physio Point (no third-party GIFs).
   A small jointed figure (flat style: hair, skin, shirt, shorts, shoes) moves between key poses with smooth
   easing, like a short looping video. Every exercise maps to a motion template (by name, then by body area).
   PP.exerciseAnim(exercise, { size }) → SVG markup; one shared requestAnimationFrame loop animates the
   figures that are on screen. Uploaded images (exercise.imageData) still win (PP.exerciseMedia). */
(function () {
  'use strict';
  const PP = (window.PP = window.PP || {});

  /* ------------------------------------------------------------------ look */
  const C = {
    skin: '#f1c19d', skinB: '#d9a57f', hair: '#2f2420', shirt: '#0f9488', shirtB: '#0a7268', shorts: '#083e44', shortsB: '#052c31',
    shoe: '#2b3640', bg: '#f4f8f9', floor: '#e2eaed', mat: '#d6e6ea', prop: '#c4d2d8', propD: '#a9bbc3', band: '#8b5cf6', db: '#475569', eye: '#1f2a2e',
  };
  const L = { torso: 30, neck: 4.5, head: 7.6, ua: 15, la: 14, th: 19, sh: 18, ft: 7 };
  const rad = (a) => (a * Math.PI) / 180;
  const D = (a) => [Math.sin(rad(a)), Math.cos(rad(a))]; // 0 = down, 90 = right (front), 180 = up
  const add = (p, v, s) => [p[0] + v[0] * (s == null ? 1 : s), p[1] + v[1] * (s == null ? 1 : s)];
  const f1 = (n) => Math.round(n * 10) / 10;
  const line = (a, b, col, w) => `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
  const dot = (p, r, col) => `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${r}" fill="${col}"/>`;

  /* ------------------------------------------------------- forward kinematics */
  function fk(p, view) {
    const front = view === 'front';
    const tw = p.tw == null ? 1 : p.tw;
    const hip = [p.x, p.y];
    const td = D(p.t);
    const sho = add(hip, td, L.torso); if (p.sh) sho[1] -= p.sh;
    const tLat = [-td[1], td[0]];
    const ha = p.t + (p.h || 0); const hd = D(ha);
    const lat = [-hd[1], hd[0]]; const face = p.face || 1;
    const fwd = [lat[0] * face, lat[1] * face];
    const neck = add(add(sho, hd, L.neck), fwd, p.hx || 0);
    const headC = add(neck, hd, L.head);
    const limb = (base, angs, lens, mirror) => {
      const s = mirror ? -1 : 1; const pts = [base];
      angs.forEach((a, i) => { if (lens[i] != null) pts.push(add(pts[i], D(s * a), lens[i])); });
      return pts;
    };
    const so = front ? 7.5 * tw : 0; const ho = front ? 4.6 : 0;
    const armF = limb(add(sho, tLat, so), p.aF, [L.ua, L.la], false);
    const armB = limb(add(sho, tLat, -so), p.aB, [L.ua, L.la], front);
    const ftL = front ? L.ft * 0.55 : L.ft;
    const legF = limb(add(hip, tLat, ho), p.lF, [L.th, L.sh, ftL], false);
    const legB = limb(add(hip, tLat, -ho), p.lB, [L.th, L.sh, ftL], front);
    return { hip, sho, neck, headC, hd, fwd, lat, td, tLat, tw, armF, armB, legF, legB, front };
  }
  const joint = (k, name) => ({ hip: k.hip, sho: k.sho, head: k.headC, handF: k.armF[2], kneeF: k.legF[1], ankleF: k.legF[2], toeF: k.legF[3], ankleB: k.legB[2], toeB: k.legB[3] }[name]);

  /* ---------------------------------------------------------------- drawing */
  function drawLeg(pts, back) {
    return line(pts[0], pts[1], back ? C.shortsB : C.shorts, 9) + line(pts[1], pts[2], back ? C.skinB : C.skin, 6.4) + line(pts[2], pts[3], C.shoe, 5);
  }
  function drawArm(pts, back) {
    const sleeve = add(pts[0], [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]], 0.42);
    return line(pts[0], pts[1], back ? C.skinB : C.skin, 5.4) + line(pts[1], pts[2], back ? C.skinB : C.skin, 4.8) + dot(pts[2], 2.8, back ? C.skinB : C.skin) + line(pts[0], sleeve, back ? C.shirtB : C.shirt, 7.4);
  }
  function drawTorso(k, p) {
    const w = (k.front ? 15 : 12.5) * k.tw; const bend = p.bend || 0;
    const mid = add([(k.hip[0] + k.sho[0]) / 2, (k.hip[1] + k.sho[1]) / 2], k.fwd, bend);
    const shorts = add(k.hip, k.td, 4.5);
    return `<path d="M${f1(k.hip[0])} ${f1(k.hip[1])} Q${f1(mid[0])} ${f1(mid[1])} ${f1(k.sho[0])} ${f1(k.sho[1])}" stroke="${C.shirt}" stroke-width="${f1(w)}" stroke-linecap="round" fill="none"/>`
      + line(k.hip, shorts, C.shorts, f1(w + 0.5));
  }
  function drawHead(k, p) {
    let s = k.front ? '' : line(k.sho, k.neck, C.skin, 4.2);
    if (k.front) {
      const t = p.turn || 0;
      // Drawn upright around the head centre, then rotated with the head tilt; eyes and mouth shift when it turns.
      const x = f1(k.headC[0]); const y = f1(k.headC[1]); const sh = t * 2.4;
      const rot = f1(180 - ((p.t || 180) + (p.h || 0)));
      s += `<g transform="rotate(${rot} ${x} ${y})"><circle cx="${x}" cy="${f1(y - 0.8)}" r="7.9" fill="${C.hair}"/>`
        + `<ellipse cx="${f1(x + sh * 0.25)}" cy="${f1(y + 0.7)}" rx="6.6" ry="7" fill="${C.skin}"/>`
        + `<path d="M${f1(x - 7.9)} ${f1(y - 0.6)} A7.9 7.9 0 0 1 ${f1(x + 7.9)} ${f1(y - 0.6)} L${f1(x + 7.5)} ${f1(y - 0.2)} Q${f1(x + 3.5 + sh)} ${f1(y - 4.6)} ${f1(x + sh)} ${f1(y - 4)} Q${f1(x - 3.5 + sh)} ${f1(y - 4.6)} ${f1(x - 7.5)} ${f1(y - 0.2)}Z" fill="${C.hair}"/>`
        + `<circle cx="${f1(x - 2.5 + sh)}" cy="${f1(y + 0.8)}" r="0.95" fill="${C.eye}"/><circle cx="${f1(x + 2.5 + sh)}" cy="${f1(y + 0.8)}" r="0.95" fill="${C.eye}"/>`
        + `<line x1="${f1(x - 1.4 + sh)}" y1="${f1(y + 4.3)}" x2="${f1(x + 1.4 + sh)}" y2="${f1(y + 4.3)}" stroke="${C.skinB}" stroke-width="0.9" stroke-linecap="round"/></g>`;
    } else {
      s += dot(add(add(k.headC, k.fwd, -1.6), k.hd, 0.8), 8, C.hair) + dot(add(k.headC, k.fwd, 0.9), 7, C.skin);
      s += dot(add(add(k.headC, k.fwd, 4.3), k.hd, 1.2), 0.95, C.eye) + dot(add(k.headC, k.fwd, -0.6), 1.6, C.skinB);
    }
    return s;
  }
  function drawPerson(k, p) {
    if (k.front) return drawLeg(k.legB, true) + drawLeg(k.legF, false) + drawTorso(k, p) + drawArm(k.armB, true) + drawArm(k.armF, false) + drawHead(k, p);
    return drawLeg(k.legB, true) + drawArm(k.armB, true) + drawTorso(k, p) + drawHead(k, p) + drawLeg(k.legF, false) + drawArm(k.armF, false);
  }

  /* ------------------------------------------------------------------ props */
  const BACK_PROPS = ['floor', 'mat', 'chair', 'wall', 'step', 'table', 'roll', 'roller', 'chairF', 'ball'];
  function prop(pr, k) {
    const [name, a, b] = Array.isArray(pr) ? pr : [pr];
    switch (name) {
      case 'floor': return `<ellipse cx="${f1(k ? k.hip[0] : 80)}" cy="105" rx="30" ry="2.6" fill="${C.floor}"/>`;
      case 'mat': return `<rect x="12" y="99.5" width="136" height="5" rx="2.5" fill="${C.mat}"/>`;
      case 'chair': return `<rect x="${a}" y="86" width="30" height="4" rx="1.5" fill="${C.propD}"/><rect x="${a}" y="54" width="4" height="36" rx="1.5" fill="${C.propD}"/>${line([a + 3, 90], [a + 3, 104], C.propD, 3)}${line([a + 27, 90], [a + 27, 104], C.propD, 3)}`;
      case 'chairF': return `<rect x="${a}" y="70" width="4" height="34" rx="1.5" fill="${C.propD}"/><rect x="${a - 2}" y="68" width="8" height="4" rx="2" fill="${C.propD}"/>`;
      case 'wall': return `<rect x="${a}" y="4" width="6" height="101" fill="${C.prop}"/>`;
      case 'step': return `<rect x="${a}" y="94" width="48" height="10" rx="1.5" fill="${C.prop}"/>`;
      case 'table': return `<rect x="${a}" y="${b}" width="40" height="5" rx="1.5" fill="${C.propD}"/>${line([a + 34, b + 5], [a + 34, 104], C.propD, 3)}`;
      case 'roll': return dot([a, b], 4.5, '#e9c99a');
      case 'roller': return dot([a, b], 6, '#9fc5d0');
      case 'db': { const h = k.armF[2]; return line([h[0] - 5, h[1]], [h[0] + 5, h[1]], C.db, 2.4) + dot([h[0] - 5, h[1]], 3, C.db) + dot([h[0] + 5, h[1]], 3, C.db); }
      case 'band': return `<line x1="${f1(k.armF[2][0])}" y1="${f1(k.armF[2][1])}" x2="${a}" y2="${b}" stroke="${C.band}" stroke-width="2" stroke-linecap="round"/>${dot([a, b], 2.4, C.propD)}`;
      case 'bandFoot': return `<line x1="${f1(k.armF[2][0])}" y1="${f1(k.armF[2][1])}" x2="${f1(k.legF[3][0])}" y2="${f1(k.legF[3][1])}" stroke="${C.band}" stroke-width="2"/>`;
      case 'bandKnee': return `<line x1="${f1(k.legF[1][0])}" y1="${f1(k.legF[1][1])}" x2="${a}" y2="${b}" stroke="${C.band}" stroke-width="2.4"/>${dot([a, b], 2.4, C.propD)}`;
      case 'bandKnees': return line(k.legB[1], k.legF[1], C.band, 2.4);
      case 'bandHands': return line(k.armB[2], k.armF[2], C.band, 2.2);
      case 'ball': return dot([a, b], 11, '#f5b971');
      default: return '';
    }
  }

  /* --------------------------------------------------------------- poses */
  const P = (base, o) => { const r = JSON.parse(JSON.stringify(base)); Object.keys(o || {}).forEach((k) => { r[k] = Array.isArray(o[k]) ? o[k].slice() : o[k]; }); return r; };
  const STAND = { x: 80, y: 64, t: 180, h: 0, aF: [6, 3], aB: [-6, -3], lF: [3, 0, 90], lB: [-3, 0, 90] };
  const FRONT = { x: 80, y: 64, t: 180, h: 0, aF: [12, 6], aB: [12, 6], lF: [4, 0, 70], lB: [4, 0, 70] };
  const LIE = { x: 88, y: 92, t: -90, h: 0, aF: [84, 86], aB: [84, 86], lF: [90, 90, 180], lB: [90, 90, 180] };
  const LIEK = P(LIE, { lF: [135, 22, 110], lB: [135, 22, 110] });
  const TABLE = P(LIE, { lF: [180, 90, 180], lB: [180, 90, 180], aF: [180, 180], aB: [180, 180] });
  const PRONE = { x: 88, y: 94, t: -90, face: -1, h: 0, aF: [-70, -90], aB: [-70, -90], lF: [90, 90, 0], lB: [90, 90, 0] };
  const QUAD = { x: 102, y: 82, t: -108, face: -1, h: -10, aF: [0, 0], aB: [0, 0], lF: [0, 90, 90], lB: [0, 90, 90] };
  const PLANK = { x: 96, y: 92, t: -102, face: -1, h: -6, aF: [0, -90], aB: [0, -90], lF: [100, 100, 10], lB: [100, 100, 10] };
  const SEAT = { x: 66, y: 83, t: 180, h: 0, aF: [40, 90], aB: [40, 90], lF: [90, 0, 90], lB: [90, 0, 90] };
  const HK = { x: 80, y: 80, t: 180, h: 0, aF: [30, 60], aB: [30, 60], lF: [82, 0, 90], lB: [-28, -92, 0] };
  const PEND = P(STAND, { x: 60, t: 100, h: -10, aF: [0, 0], aB: [60, 100], lF: [12, 0, 90], lB: [-16, 0, 90] });
  const BUTTER = { x: 80, y: 92, t: 180, h: 0, aF: [24, 70], aB: [24, 70], lF: [110, -50, -90], lB: [110, -50, -90] };
  const CHAIR_ARMS = { aF: [60, 80], aB: [60, 80] };

  /* --------------------------------------------------------------- templates */
  const T = {
    stand: { frames: [STAND, P(STAND, { t: 178, aF: [10, 6] })], props: ['floor'], dur: 2 },
    arm_raise_front: { frames: [STAND, P(STAND, { aF: [172, 176], aB: [166, 172] })], props: ['floor'] },
    arm_raise_side: { view: 'front', frames: [FRONT, P(FRONT, { aF: [160, 168], aB: [160, 168] })], props: ['floor'] },
    supine_arm_raise: { frames: [LIE, P(LIE, { aF: [180, 180], aB: [180, 180] }), P(LIE, { aF: [262, 266], aB: [258, 262] }), P(LIE, { aF: [180, 180], aB: [180, 180] })], props: ['mat'], dur: 1.1 },
    squat: { anchor: ['ankleF', 86, 101], frames: [P(STAND, { lF: [0, 0, 90], lB: [-1, 0, 90] }), P(STAND, { t: 150, lF: [70, -12, 90], lB: [68, -12, 90], aF: [88, 90], aB: [84, 88] })], props: ['floor'] },
    sit_to_stand: { anchor: ['ankleF', 86, 101], frames: [P(STAND, { t: 150, lF: [85, -6, 90], lB: [83, -8, 90], aF: [80, 85], aB: [76, 82] }), P(STAND, { lF: [1, 0, 90], lB: [-1, 0, 90] })], props: ['floor', ['chair', 44]], dur: 1.7 },
    wall_squat: { anchor: ['ankleF', 100, 101], frames: [P(STAND, { lF: [28, -6, 90], lB: [26, -8, 90] }), P(STAND, { lF: [62, -22, 90], lB: [60, -24, 90] })], props: ['floor', ['wall', 77]], dur: 1.8 },
    lunge: { anchor: ['ankleF', 104, 101], frames: [P(STAND, { lF: [24, -8, 90], lB: [-36, -36, 60] }), P(STAND, { lF: [78, -4, 90], lB: [-12, -98, 8] })], props: ['floor'], dur: 1.6 },
    side_lunge: { view: 'front', anchor: ['ankleB', 66, 101], frames: [P(FRONT, { lF: [28, 28, 70], lB: [-20, -20, 50] }), P(FRONT, { t: 172, lF: [62, -8, 80], lB: [-28, -28, 50] })], props: ['floor'] },
    step_up: { frames: [P(STAND, { x: 66 }), P(STAND, { x: 80, y: 62, lF: [42, -28, 90], lB: [-14, -6, 90] }), P(STAND, { x: 100, y: 57 }), P(STAND, { x: 80, y: 62, lF: [42, -28, 90], lB: [-14, -6, 90] })], props: ['floor', ['step', 78]], dur: 1.1 },
    calf_raise: { anchor: ['toeF', 93, 102], frames: [P(STAND, { lF: [0, 0, 90], lB: [-1, 0, 90] }), P(STAND, { lF: [0, 0, 48], lB: [-1, 0, 48] })], props: ['floor'], dur: 1.2 },
    march: { anchor: ['ankleB', 78, 101], frames: [P(STAND, { lF: [0, 0, 90], lB: [0, 0, 90] }), P(STAND, { lF: [92, 0, 90], lB: [0, 0, 90], aF: [-28, -18], aB: [30, 40] })], props: ['floor'], dur: 1.1 },
    ham_curl: { anchor: ['ankleB', 80, 101], frames: [P(STAND, Object.assign({ lF: [0, 0, 90], lB: [0, 0, 90] }, CHAIR_ARMS)), P(STAND, Object.assign({ lF: [-4, -105, -15], lB: [0, 0, 90] }, CHAIR_ARMS))], props: ['floor', ['chairF', 104]] },
    hip_ext: { anchor: ['ankleB', 80, 101], frames: [P(STAND, Object.assign({ t: 176, lF: [0, 0, 90], lB: [0, 0, 90] }, CHAIR_ARMS)), P(STAND, Object.assign({ t: 172, lF: [-32, -32, 58], lB: [0, 0, 90] }, CHAIR_ARMS))], props: ['floor', ['chairF', 104]] },
    hip_abd_front: { view: 'front', anchor: ['ankleB', 75, 101], frames: [FRONT, P(FRONT, { t: 177, lF: [32, 32, 98] })], props: ['floor'] },
    side_step: { view: 'front', frames: [P(FRONT, { lF: [16, 16, 86], lB: [16, 16, 86], y: 65 }), P(FRONT, { lF: [3, 3, 70], lB: [3, 3, 70] })], props: ['floor', 'bandKnees'], dur: 0.9 },
    slr: { frames: [LIE, P(LIE, { lF: [128, 128, 218] })], props: ['mat'] },
    heel_slide: { frames: [LIE, P(LIE, { lF: [135, 30, 120] })], props: ['mat'] },
    quad_set: { frames: [P(LIE, { lF: [90, 92, 176] }), P(LIE, { lF: [90, 88, 186] })], props: ['mat', ['roll', 107, 96.5]], dur: 1, hold: 0.4 },
    short_arc: { frames: [P(LIE, { lF: [100, 70, 160] }), P(LIE, { lF: [100, 100, 190] })], props: ['mat', ['roll', 106, 95]] },
    ankle_pump: { frames: [P(LIE, { lF: [90, 90, 148] }), P(LIE, { lF: [90, 90, 214] })], props: ['mat'], dur: 0.8, hold: 0.15 },
    ankle_circle: { frames: [P(LIE, { lF: [90, 90, 150] }), P(LIE, { lF: [90, 92, 182] }), P(LIE, { lF: [90, 90, 214] }), P(LIE, { lF: [90, 88, 182] })], props: ['mat'], dur: 0.6, hold: 0 },
    leg_press_band: { frames: [P(LIE, { lF: [165, 60, 150], aF: [130, 120] }), P(LIE, { lF: [130, 130, 220], aF: [130, 120] })], props: ['mat', 'bandFoot'] },
    bridge: { anchor: ['sho', 58, 92], frames: [LIEK, P(LIEK, { t: -112, lF: [118, 8, 98], lB: [118, 8, 98] })], props: ['mat'], dur: 1.6 },
    bridge_single: { anchor: ['sho', 58, 92], frames: [P(LIEK, { lF: [135, 135, 225] }), P(LIEK, { t: -112, lF: [118, 118, 208], lB: [118, 8, 98] })], props: ['mat'], dur: 1.6 },
    knee_chest: { frames: [LIEK, P(LIEK, { lF: [168, 62, 150], lB: [168, 62, 150], aF: [120, 100], aB: [120, 100] })], props: ['mat'], dur: 1.8 },
    knee_drop: { frames: [LIEK, P(LIEK, { lF: [116, 42, 128], lB: [110, 46, 132] }), LIEK, P(LIEK, { lF: [150, 8, 98], lB: [154, 4, 94] })], props: ['mat'], dur: 1.3 },
    hook_pulse: { frames: [LIEK, P(LIEK, { t: -92, bend: -2.5, y: 91.5 })], props: ['mat'], dur: 1.2, hold: 0.35 },
    hook_march: { frames: [LIEK, P(LIEK, { lF: [172, 82, 172] })], props: ['mat'], dur: 1.1 },
    curl_up: { frames: [LIEK, P(LIEK, { t: -112, h: -15, aF: [100, 100], aB: [100, 100] })], props: ['mat'], dur: 1.3 },
    reverse_crunch: { frames: [TABLE, P(TABLE, { t: -82, y: 90, lF: [205, 115, 205], lB: [205, 115, 205] })], props: ['mat'], dur: 1.3 },
    dead_bug: { frames: [TABLE, P(TABLE, { lF: [100, 100, 190], aB: [262, 262] }), TABLE, P(TABLE, { lB: [100, 100, 190], aF: [262, 262] })], props: ['mat'], dur: 1.2 },
    heel_tap: { frames: [TABLE, P(TABLE, { lF: [150, 40, 130] }), TABLE, P(TABLE, { lB: [150, 40, 130] })], props: ['mat'], dur: 0.9 },
    clamshell: { frames: [P(LIE, { lF: [140, 42, 132], lB: [140, 42, 132], aF: [95, 100] }), P(LIE, { lF: [166, 62, 150], lB: [140, 42, 132], aF: [95, 100] })], props: ['mat'], dur: 1.2 },
    side_abd: { frames: [P(LIE, { lB: [105, 60, 150], aF: [100, 95] }), P(LIE, { lF: [122, 122, 212], lB: [105, 60, 150], aF: [100, 95] })], props: ['mat'] },
    open_book: { frames: [P(LIEK, { aF: [100, 100] }), P(LIEK, { aF: [180, 180], h: -20 }), P(LIEK, { aF: [262, 262], h: -40 }), P(LIEK, { aF: [180, 180], h: -20 })], props: ['mat'], dur: 1.3 },
    foam_roller: { frames: [P(LIEK, { aF: [150, 150], aB: [150, 150] }), P(LIEK, { aF: [215, 225], aB: [210, 220], t: -95, h: 10 })], props: ['mat', ['roller', 66, 98]], dur: 1.8 },
    prone_rest: { frames: [PRONE, P(PRONE, { y: 93.4, t: -91 })], props: ['mat'], dur: 2, hold: 0.3 },
    prone_press: { frames: [PRONE, P(PRONE, { t: -115, h: -20, aF: [-40, 40], aB: [-40, 40] })], props: ['mat'], dur: 1.6 },
    prone_elbows: { frames: [P(PRONE, { t: -102, aF: [0, -90], aB: [0, -90] }), P(PRONE, { t: -104, h: -15, aF: [0, -90], aB: [0, -90] })], props: ['mat'], dur: 2 },
    prone_knee: { frames: [PRONE, P(PRONE, { lF: [90, 180, 90] })], props: ['mat'] },
    prone_leg_lift: { frames: [PRONE, P(PRONE, { lF: [102, 102, 12] })], props: ['mat'] },
    superman: { frames: [P(PRONE, { aF: [-90, -90], aB: [-90, -90] }), P(PRONE, { t: -100, h: -8, aF: [-112, -112], aB: [-112, -112], lF: [100, 100, 10], lB: [100, 100, 10] })], props: ['mat'] },
    prone_y: { frames: [P(PRONE, { aF: [-90, -90], aB: [-90, -90] }), P(PRONE, { t: -96, aF: [-114, -114], aB: [-112, -112] })], props: ['mat'] },
    quad: { frames: [QUAD, P(QUAD, { y: 81, t: -107 })], props: ['floor'], dur: 2 },
    bird_dog: { frames: [QUAD, P(QUAD, { aF: [-102, -102], lB: [96, 96, 96] })], props: ['floor'], dur: 1.6 },
    cat_camel: { frames: [P(QUAD, { bend: -8, h: -30 }), P(QUAD, { bend: 7, h: 12 })], props: ['floor'], dur: 1.8 },
    donkey: { frames: [QUAD, P(QUAD, { lF: [92, 180, 270] })], props: ['floor'] },
    fire_hydrant: { frames: [QUAD, P(QUAD, { lF: [48, 96, 96] })], props: ['floor'] },
    thread: { frames: [QUAD, P(QUAD, { t: -103, h: 15, aF: [28, 62] })], props: ['floor'], dur: 1.6 },
    bear: { anchor: ['sho', 73.5, 72.7], frames: [QUAD, P(QUAD, { lF: [28, 100, 100], lB: [28, 100, 100] })], props: ['floor'], dur: 1.4, hold: 0.4 },
    child_pose: { frames: [QUAD, P(QUAD, { x: 116, y: 92, t: -80, h: -5, aF: [-85, -90], aB: [-85, -90], lF: [-62, 90, 90], lB: [-62, 90, 90] })], props: ['mat'], dur: 2 },
    plank: { frames: [PLANK, P(PLANK, { y: 93.5 })], props: ['mat'], dur: 1.6, hold: 0.4 },
    seated_knee_ext: { frames: [SEAT, P(SEAT, { lF: [90, 88, 178] })], props: ['floor', ['chair', 44]] },
    seated_knee_flex: { frames: [SEAT, P(SEAT, { lF: [90, -32, 58] })], props: ['floor', ['chair', 44]] },
    seated_march: { frames: [P(SEAT, { lF: [122, 10, 100] }), P(SEAT, { lB: [122, 10, 100] })], props: ['floor', ['chair', 44]], dur: 0.8 },
    seated_lean: { frames: [P(SEAT, { lF: [90, 84, 174] }), P(SEAT, { t: 148, h: -10, lF: [90, 84, 174], aF: [100, 104], aB: [96, 100] })], props: ['floor', ['chair', 44]], dur: 1.8 },
    seated_toe: { frames: [SEAT, P(SEAT, { lF: [90, 2, 122] })], props: ['floor', ['chair', 44]], dur: 1 },
    seated_back_ext: { frames: [P(SEAT, { aF: [160, -40], aB: [160, -40] }), P(SEAT, { t: 198, h: 14, aF: [170, -30], aB: [170, -30] })], props: ['floor', ['chair', 44]], dur: 1.6 },
    table_slide: { frames: [P(SEAT, { aF: [70, 92] }), P(SEAT, { t: 154, aF: [102, 96] })], props: ['floor', ['chair', 44], ['table', 84, 72]], dur: 1.6 },
    curl: { frames: [P(STAND, { aF: [2, 2] }), P(STAND, { aF: [8, 165] })], props: ['floor', 'db'], dur: 1.3 },
    triceps: { frames: [P(STAND, { aF: [172, 20] }), P(STAND, { aF: [172, 176] })], props: ['floor', 'db'], dur: 1.3 },
    row: { frames: [P(STAND, { aF: [80, 88], aB: [78, 86] }), P(STAND, { aF: [-30, 86], aB: [-34, 84] })], props: ['floor', ['band', 146, 52]], dur: 1.3 },
    pallof: { frames: [P(STAND, { aF: [30, 150], aB: [28, 148] }), P(STAND, { aF: [88, 90], aB: [86, 88] })], props: ['floor', ['band', 146, 50]], dur: 1.4, hold: 0.35 },
    shoulder_ext: { frames: [P(STAND, { aF: [40, 40], aB: [38, 38] }), P(STAND, { aF: [-38, -38], aB: [-40, -40] })], props: ['floor', ['band', 146, 40]], dur: 1.3 },
    pull_apart: { view: 'front', frames: [P(FRONT, { aF: [70, 100], aB: [70, 100] }), P(FRONT, { aF: [92, 92], aB: [92, 92] })], props: ['floor', 'bandHands'], dur: 1.2 },
    er_front: { view: 'front', frames: [P(FRONT, { aF: [4, -88] }), P(FRONT, { aF: [4, 58] })], props: ['floor'], dur: 1.3 },
    cross_body: { view: 'front', frames: [FRONT, P(FRONT, { aF: [-82, -86], aB: [40, -62] })], props: ['floor'], dur: 1.8 },
    chest_stretch: { frames: [STAND, P(STAND, { t: 184, aF: [-62, -20], aB: [-58, -16] })], props: ['floor'], dur: 1.8 },
    towel_back: { frames: [P(STAND, { aF: [-22, 40], aB: [170, -20] }), P(STAND, { aF: [-30, 110], aB: [176, 10] })], props: ['floor'], dur: 1.6 },
    scap_squeeze: { frames: [P(STAND, { aF: [0, 0], aB: [0, 0] }), P(STAND, { t: 182, aF: [-28, -6], aB: [-30, -8] })], props: ['floor'], dur: 1.3, hold: 0.35 },
    shrug: { frames: [STAND, P(STAND, { sh: 5 })], props: ['floor'], dur: 1, hold: 0.3 },
    iso_wall: { frames: [P(STAND, { aF: [95, 95] }), P(STAND, { t: 177, aF: [95, 95] })], props: ['floor', ['wall', 110]], dur: 1.2, hold: 0.4 },
    wall_pushup: { frames: [P(STAND, { x: 70, t: 160, aF: [100, 100], aB: [100, 100], lF: [-12, -12, 78], lB: [-12, -12, 78] }), P(STAND, { x: 70, t: 150, aF: [50, 150], aB: [50, 150], lF: [-12, -12, 78], lB: [-12, -12, 78] })], props: ['floor', ['wall', 109]], dur: 1.3 },
    wall_walk: { frames: [P(STAND, { x: 84, aF: [110, 120] }), P(STAND, { x: 84, aF: [160, 170] })], props: ['floor', ['wall', 114]], dur: 1.6 },
    wall_slide: { frames: [P(STAND, { x: 88, aF: [120, 172], aB: [116, 168] }), P(STAND, { x: 88, aF: [170, 180], aB: [166, 178] })], props: ['floor', ['wall', 76]], dur: 1.6 },
    pendulum: { frames: [P(PEND, { aF: [-22, -22] }), P(PEND, { aF: [22, 22] })], props: ['floor', ['table', 104, 79]], dur: 1.2, hold: 0 },
    hip_hinge: { anchor: ['ankleF', 82, 101], frames: [STAND, P(STAND, { t: 112, lF: [12, -8, 90], lB: [10, -8, 90], aF: [30, 30] })], props: ['floor'], dur: 1.6 },
    hip_flexor_stretch: { frames: [HK, P(HK, { x: 85, lF: [70, 0, 90], lB: [-38, -92, 0] })], props: ['mat'], dur: 1.8 },
    quad_stretch: { anchor: ['ankleB', 80, 101], frames: [P(STAND, { lF: [0, -168, -80], aF: [-6, -8], lB: [0, 0, 90] }), P(STAND, { t: 178, lF: [-8, -168, -80], aF: [-12, -14], lB: [0, 0, 90] })], props: ['floor'], dur: 2 },
    calf_stretch: { anchor: ['ankleB', 62, 101], frames: [P(STAND, { t: 160, lF: [26, -10, 90], lB: [-26, -26, 90], aF: [100, 100], aB: [98, 98] }), P(STAND, { t: 154, lF: [30, -14, 90], lB: [-28, -28, 90], aF: [96, 96], aB: [94, 94] })], props: ['floor', ['wall', 118]], dur: 1.8 },
    back_ext_stand: { anchor: ['ankleF', 80, 101], frames: [P(STAND, { aF: [-25, 25], aB: [-25, 25] }), P(STAND, { t: 198, h: 10, aF: [-35, 20], aB: [-35, 20] })], props: ['floor'], dur: 1.6 },
    wall_tilt: { frames: [P(STAND, { x: 86 }), P(STAND, { x: 86, bend: -3, t: 182 })], props: ['floor', ['wall', 74]], dur: 1.3, hold: 0.35 },
    side_bend: { view: 'front', anchor: ['ankleF', 84.6, 101], frames: [FRONT, P(FRONT, { t: 160, h: -8, aB: [176, 170] })], props: ['floor'], dur: 1.6 },
    rotation: { view: 'front', frames: [P(FRONT, { tw: 0.6, turn: -0.85 }), P(FRONT, { tw: 1 }), P(FRONT, { tw: 0.6, turn: 0.85 }), P(FRONT, { tw: 1 })], props: ['floor'], dur: 1 },
    neck_rot: { view: 'front', frames: [P(FRONT, { turn: -0.9 }), P(FRONT, { turn: 0.9 })], props: ['floor'], dur: 1.6 },
    neck_side: { view: 'front', frames: [P(FRONT, { h: -22 }), P(FRONT, { h: 22 })], props: ['floor'], dur: 1.6 },
    neck_flex: { frames: [STAND, P(STAND, { h: -38 })], props: ['floor'], dur: 1.6 },
    neck_ext: { frames: [STAND, P(STAND, { h: 28 })], props: ['floor'], dur: 1.6 },
    neck_iso: { view: 'front', frames: [P(FRONT, { aF: [150, -132] }), P(FRONT, { aF: [150, -132], h: 3 })], props: ['floor'], dur: 1.2, hold: 0.4 },
    chin_tuck: { frames: [STAND, P(STAND, { hx: -3.5 })], props: ['floor'], dur: 1.2, hold: 0.35 },
    chin_tuck_lying: { frames: [LIE, P(LIE, { hx: -3, h: -8 })], props: ['mat'], dur: 1.2, hold: 0.35 },
    breathing: { view: 'front', frames: [P(FRONT, { tw: 0.96 }), P(FRONT, { tw: 1.16, sh: 1.6 })], props: ['floor'], dur: 2.2, hold: 0.2 },
    walk: { frames: [P(STAND, { y: 65, lF: [24, -6, 90], lB: [-22, -22, 70], aF: [-22, -10], aB: [22, 30] }), P(STAND, { y: 63.5, lF: [0, 0, 90], lB: [14, -34, 56] }),
      P(STAND, { y: 65, lB: [24, -6, 90], lF: [-22, -22, 70], aB: [-22, -10], aF: [22, 30] }), P(STAND, { y: 63.5, lB: [0, 0, 90], lF: [14, -34, 56] })], props: ['floor'], dur: 0.42, hold: 0 },
    balance_single: { anchor: ['ankleB', 80, 101], frames: [P(STAND, { t: 178, lF: [70, -40, 50], lB: [0, 0, 90], aF: [60, 70], aB: [60, 70] }), P(STAND, { t: 182, lF: [70, -40, 50], lB: [0, 0, 90], aF: [64, 74], aB: [56, 66] })], props: ['floor'], dur: 1.8, hold: 0.2 },
    sway: { anchor: ['ankleF', 82, 101], frames: [P(STAND, { t: 176 }), P(STAND, { t: 184 })], props: ['floor'], dur: 1.8 },
    butterfly: { view: 'front', frames: [BUTTER, P(BUTTER, { lF: [96, -36, -90], lB: [96, -36, -90] })], props: ['mat'], dur: 1 },
    tke: { anchor: ['ankleB', 78, 101], frames: [P(STAND, { lF: [14, -16, 90] }), P(STAND, { lF: [2, 0, 90] })], props: ['floor', ['bandKnee', 140, 84]], dur: 1.2, hold: 0.3 },
  };

  /* custom close-ups (hand and wrist) */
  const sleeve = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${C.shirt}"/>`;
  const CUSTOM = {
    wrist(k) {
      const a = -38 + 76 * k;
      return `<rect x="14" y="78" width="96" height="6" rx="2" fill="${C.propD}"/>${line([100, 84], [100, 104], C.propD, 3)}${sleeve(14, 64, 22, 14)}
        <rect x="30" y="65" width="70" height="12" rx="6" fill="${C.skin}"/><g transform="rotate(${f1(a)} 98 71)"><rect x="94" y="64" width="28" height="13" rx="6.5" fill="${C.skin}"/><rect x="108" y="61.5" width="12" height="5.5" rx="2.75" fill="${C.skinB}"/></g>`;
    },
    fingers(k) {
      const len = 24 - 15 * k; const thumb = -50 + 45 * k;
      let s = `${sleeve(66, 96, 26, 22)}<rect x="69" y="78" width="20" height="22" rx="4" fill="${C.skin}"/><rect x="62" y="50" width="34" height="32" rx="9" fill="${C.skin}"/>`;
      [66, 74, 82, 90].forEach((x, i) => { const l = len - (i === 0 || i === 3 ? 3 : 0); s += line([x, 54], [x + (k * (i - 1.5)), 54 - l], C.skin, 6.2) + line([x, 54 - l + 1], [x, 54 - l + 0.5], C.skinB, 6.2); });
      s += `<g transform="rotate(${f1(thumb)} 64 70)">${line([64, 70], [50, 70], C.skin, 7)}</g>`;
      return s;
    },
    forearm_rot(k) {
      const c = Math.cos(Math.PI * k); const w = 4 + 26 * Math.abs(c);
      return `<rect x="14" y="84" width="132" height="6" rx="2" fill="${C.propD}"/>${sleeve(18, 66, 24, 16)}<rect x="38" y="67" width="64" height="14" rx="7" fill="${C.skin}"/>
        <rect x="${f1(116 - w / 2)}" y="58" width="${f1(w)}" height="32" rx="${f1(Math.min(w / 2, 8))}" fill="${c > 0 ? C.skin : C.skinB}"/>${dot([116, 74], 3, c > 0 ? C.skinB : C.skin)}`;
    },
  };
  Object.keys(CUSTOM).forEach((key) => { T[key] = { custom: CUSTOM[key], dur: key === 'forearm_rot' ? 1.4 : 1.2 }; });

  /* ------------------------------------------------------------ animation */
  function lerpPose(a, b, k) {
    const r = {};
    new Set(Object.keys(a).concat(Object.keys(b))).forEach((key) => {
      const va = a[key] != null ? a[key] : b[key]; const vb = b[key] != null ? b[key] : a[key];
      if (Array.isArray(va)) r[key] = va.map((v, i) => v + ((vb[i] == null ? v : vb[i]) - v) * k);
      else if (typeof va === 'number') r[key] = va + ((typeof vb === 'number' ? vb : va) - va) * k;
      else r[key] = va;
    });
    return r;
  }
  function phase(tpl, time) {
    const n = tpl.custom ? 2 : tpl.frames.length; const dur = tpl.dur || 1.5; const hold = tpl.hold == null ? 0.25 : tpl.hold;
    const u = ((time % (n * dur)) + n * dur) % (n * dur); const i = Math.floor(u / dur); const loc = (u - i * dur) / dur;
    let k = loc < hold ? 0 : (loc - hold) / (1 - hold); k = k * k * (3 - 2 * k);
    return { i, k, n };
  }
  function frameSvg(tpl, time) {
    const ph = phase(tpl, time);
    if (tpl.custom) return tpl.custom(ph.i === 0 ? ph.k : 1 - ph.k);
    let pose = lerpPose(tpl.frames[ph.i], tpl.frames[(ph.i + 1) % ph.n], ph.k);
    let k = fk(pose, tpl.view);
    if (tpl.anchor) {
      const j = joint(k, tpl.anchor[0]);
      if (j) { pose = Object.assign({}, pose, { x: pose.x + tpl.anchor[1] - j[0], y: pose.y + tpl.anchor[2] - j[1] }); k = fk(pose, tpl.view); }
    }
    const props = tpl.props || [];
    const isBack = (p) => BACK_PROPS.includes(Array.isArray(p) ? p[0] : p);
    return props.filter(isBack).map((p) => prop(p, k)).join('') + drawPerson(k, pose) + props.filter((p) => !isBack(p)).map((p) => prop(p, k)).join('');
  }

  /* ------------------------------------------------------- exercise → motion */
  const MAP = [
    [/extension hang/, 'prone_rest'], [/abduction lying/, 'slr'], [/stair/, 'step_up'], [/elevation lying|lying with stick/, 'supine_arm_raise'], [/push-up on knees/, 'plank'],
    [/rolling to side|windscreen/, 'knee_drop'], [/supine to sit|brandt/, 'curl_up'], [/reaching in sitting|weight shift in sitting/, 'seated_lean'], [/nordic/, 'hip_hinge'], [/band walk/, 'side_step'],
    [/thoracic rotation/, 'open_book'], [/standing extension/, 'back_ext_stand'], [/ball squeeze|transversus/, 'hook_pulse'], [/seated thoracic/, 'seated_back_ext'], [/scalene/, 'neck_side'],
    [/gaze stabil|jaw side/, 'neck_rot'], [/standing with eyes closed/, 'sway'], [/turning practice/, 'walk'], [/pelvic tilt standing/, 'wall_tilt'], [/ankle stretch kneeling/, 'child_pose'],
    [/forearm rotation/, 'forearm_rot'], [/squat to chair/, 'sit_to_stand'], [/jaw opening/, 'neck_flex'],
    [/hamstring curl/, 'ham_curl'], [/reverse crunch/, 'reverse_crunch'], [/curl-up|deep neck flexor/, 'curl_up'], [/triceps/, 'triceps'],
    [/biceps|elbow flexion and extension|elbow extension stretch/, 'curl'], [/pronation|supination|towel wringing/, 'forearm_rot'],
    [/tendon|finger|thumb|grip|fist|coin|median nerve|putty|hand opening/, 'fingers'], [/wrist|prayer/, 'wrist'],
    [/single-leg bridge/, 'bridge_single'], [/bridge/, 'bridge'], [/clamshell/, 'clamshell'],
    [/side-lying|sleeper/, 'side_abd'], [/open book/, 'open_book'],
    [/cat stretch seated|lumbar flexion seated|figure-4|hamstring stretch seated|towel calf stretch|seated forward/, 'seated_lean'],
    [/cat|camel/, 'cat_camel'], [/bird dog/, 'bird_dog'], [/donkey/, 'donkey'], [/fire hydrant/, 'fire_hydrant'], [/child/, 'child_pose'],
    [/thread the needle/, 'thread'], [/bear hold|quadruped|rocking on hands/, 'bear'],
    [/wall plank|wall push-up/, 'wall_pushup'], [/plank/, 'plank'],
    [/prone press-up|back extension on ball|cobra/, 'prone_press'], [/prone on elbows/, 'prone_elbows'], [/prone lying/, 'prone_rest'], [/prone knee/, 'prone_knee'],
    [/prone hip extension|prone leg/, 'prone_leg_lift'], [/prone y|prone t|prone row/, 'prone_y'], [/superman|prone opposite/, 'superman'],
    [/dead bug/, 'dead_bug'], [/heel taps/, 'heel_tap'], [/knee to chest|knee hug|piriformis/, 'knee_chest'], [/lumbar rotation|hip rotation \(supine\)|windscreen/, 'knee_drop'],
    [/hook-lying march/, 'hook_march'], [/wall pelvic tilt/, 'wall_tilt'], [/pelvic tilt|pelvic clock|bracing|adductor squeeze|pelvic floor/, 'hook_pulse'],
    [/straight leg raise|hamstring stretch supine|hip abduction slide|hamstring stretch with towel/, 'slr'], [/short arc/, 'short_arc'], [/heel slide|heel drag/, 'heel_slide'],
    [/quadriceps sets|patellar|isometric knee|knee extension stretch|gluteal sets/, 'quad_set'],
    [/ankle pumps|dorsiflexion|plantarflexion|inversion|eversion/, 'ankle_pump'], [/ankle circles|ankle alphabet/, 'ankle_circle'], [/leg press/, 'leg_press_band'],
    [/sit to stand/, 'sit_to_stand'], [/wall squat|wall sit/, 'wall_squat'], [/split squat|forward lunge|reverse lunge|^lunge/, 'lunge'], [/lateral lunge/, 'side_lunge'], [/squat/, 'squat'],
    [/step-up|step-down|lateral step/, 'step_up'], [/calf raise|heel drop|toe raises|heel raise/, 'calf_raise'], [/calf stretch|soleus/, 'calf_stretch'],
    [/quadriceps stretch/, 'quad_stretch'], [/hip flexor stretch|half kneeling/, 'hip_flexor_stretch'], [/butterfly/, 'butterfly'],
    [/side step|monster walk/, 'side_step'], [/standing hip abduction/, 'hip_abd_front'], [/standing hip extension/, 'hip_ext'],
    [/stationary cycling|seated march|seated ball|pedal/, 'seated_march'], [/march|hip circles|toe taps standing|step over/, 'march'], [/hip hinge|deadlift|good morning/, 'hip_hinge'],
    [/seated knee flexion|seated hip internal|knee rocking/, 'seated_knee_flex'], [/long arc|sciatic nerve|seated knee extension/, 'seated_knee_ext'],
    [/towel scrunches|marble|foot rolling|short foot|plantar fascia|toe spread|toe curl/, 'seated_toe'],
    [/walk|side stepping|figure-of-eight|stairs/, 'walk'], [/tandem stance|heel-to-toe|weight shift/, 'sway'], [/single-leg balance|clock reach|eyes closed|single leg stance/, 'balance_single'],
    [/terminal knee/, 'tke'], [/pallof|trunk rotation with band|wood chop/, 'pallof'],
    [/shoulder flexion \(wand\)|overhead reach lying/, 'supine_arm_raise'], [/shoulder abduction|lateral raise|jumping jack/, 'arm_raise_side'],
    [/isometric neck/, 'neck_iso'], [/isometric/, 'iso_wall'], [/towel internal|behind the back/, 'towel_back'], [/external rotation|internal rotation/, 'er_front'],
    [/table slide/, 'table_slide'], [/wall walk|serratus|finger ladder/, 'wall_walk'], [/cross-body/, 'cross_body'],
    [/thoracic extension on foam|pectoral stretch lying|foam roller/, 'foam_roller'], [/doorway|chest opener|pectoral|chest stretch/, 'chest_stretch'], [/towel internal|behind the back/, 'towel_back'],
    [/scapular squeeze|shoulder blade setting|retraction/, 'scap_squeeze'], [/shrug|shoulder rolls/, 'shrug'], [/band row|^row/, 'row'], [/pull-apart/, 'pull_apart'], [/shoulder extension/, 'shoulder_ext'],
    [/scaption|front raise|shoulder flexion|overhead press/, 'arm_raise_front'], [/wall angel|wall slide/, 'wall_slide'], [/pendulum/, 'pendulum'],
    [/thoracic extension over chair/, 'seated_back_ext'], [/neck rotation|chin tuck with rotation/, 'neck_rot'], [/chin tuck lying/, 'chin_tuck_lying'], [/chin tuck/, 'chin_tuck'],
    [/neck side|upper trapezius|semicircles/, 'neck_side'], [/neck flexion|levator/, 'neck_flex'], [/neck extension/, 'neck_ext'],
    [/standing back extension/, 'back_ext_stand'], [/side bend/, 'side_bend'], [/trunk rotation|seated rotation/, 'rotation'],
    [/breath|huff|expansion|seated posture/, 'breathing'],
  ];
  const BY_AREA = { Knee: 'slr', Hip: 'bridge', Spine: 'cat_camel', Core: 'plank', Shoulder: 'arm_raise_front', Neck: 'chin_tuck', Elbow: 'curl', 'Wrist & Hand': 'wrist', Ankle: 'ankle_pump', Balance: 'balance_single', Posture: 'wall_slide', Breathing: 'breathing' };
  PP.exerciseTemplate = function (ex) {
    const name = String((ex && ex.name) || ex || '').toLowerCase().trim();
    const hit = MAP.find(([re]) => re.test(name));
    return (hit && hit[1]) || BY_AREA[ex && ex.area] || 'stand';
  };

  /* ------------------------------------------------------------ public API */
  let seq = 0;
  PP.exerciseAnim = function (ex, opts) {
    const o = opts || {}; const key = PP.exerciseTemplate(ex); const tpl = T[key] || T.stand;
    const ph = ((seq++ * 0.37) % 1) * (tpl.dur || 1.5);
    const size = o.size ? `width="${o.size}" height="${Math.round(o.size * 0.75)}"` : 'width="100%"';
    const label = String((ex && ex.name) || 'Exercise').replace(/"/g, '&quot;');
    startLoop();
    return `<svg class="ex-anim" data-tpl="${key}" data-ph="${f1(ph)}" viewBox="0 0 160 120" ${size} role="img" aria-label="${label} demonstration" style="background:${C.bg};border-radius:8px"><g class="ex-fig">${frameSvg(tpl, ph)}</g></svg>`;
  };
  PP.exerciseMedia = function (ex, opts) {
    if (ex && ex.imageData) return `<img src="${String(ex.imageData).replace(/"/g, '&quot;')}" alt="" style="width:100%;border-radius:8px">`;
    return PP.exerciseAnim(ex, opts);
  };
  PP.exerciseTemplates = Object.keys(T);

  // One shared loop; only figures on screen are redrawn (~30 fps). Respects reduced-motion settings.
  let running = false; let last = 0;
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function startLoop() {
    if (running || typeof requestAnimationFrame !== 'function') return; running = true;
    const tick = (ts) => {
      requestAnimationFrame(tick);
      if (document.hidden || reduced() || ts - last < 33) return; last = ts;
      const vh = window.innerHeight || 800;
      document.querySelectorAll('svg.ex-anim[data-tpl]').forEach((svg) => {
        const r = svg.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > vh) return;
        const tpl = T[svg.dataset.tpl]; if (!tpl) return;
        const g = svg.firstElementChild; if (g) g.innerHTML = frameSvg(tpl, ts / 1000 + Number(svg.dataset.ph || 0));
      });
    };
    requestAnimationFrame(tick);
  }
})();
