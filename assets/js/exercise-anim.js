/* Animated exercise demonstrations (original illustrations made for Physio Point — no third-party GIFs).
   Each exercise gets a small looping SVG animation (SMIL), so it plays like a GIF in any modern browser.
   PP.exerciseAnim(exerciseOrName, { size }) → SVG markup. Uploaded images/videos (exercise.imageData) take priority. */
(function () {
  'use strict';
  const PP = (window.PP = window.PP || {});
  const C = { body: '#0f6b5c', move: '#f28c28', ground: '#c9d6dc', head: '#0f6b5c', band: '#7c5cd6' };
  const L = (x1, y1, x2, y2, c) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c || C.body}" stroke-width="6" stroke-linecap="round"/>`;
  const head = (x, y) => `<circle cx="${x}" cy="${y}" r="8" fill="${C.head}"/>`;
  const rot = (vals, cx, cy, dur) => `<animateTransform attributeName="transform" type="rotate" values="${vals.map((v) => `${v} ${cx} ${cy}`).join(';')}" dur="${dur || 2.6}s" repeatCount="indefinite" calcMode="spline" keySplines="${vals.slice(1).map(() => '.45 0 .55 1').join(';')}"/>`;
  const move = (vals, dur) => `<animateTransform attributeName="transform" type="translate" values="${vals.join(';')}" dur="${dur || 2.6}s" repeatCount="indefinite" calcMode="spline" keySplines="${vals.slice(1).map(() => '.45 0 .55 1').join(';')}"/>`;
  const ground = (y) => L(8, y, 152, y, C.ground).replace('stroke-width="6"', 'stroke-width="3"');
  const mat = (y) => `<rect x="10" y="${y}" width="140" height="6" rx="3" fill="#e4eef2"/>`;

  // Supine body facing up, head on the left.
  const supineTop = () => `${mat(97)}${head(22, 86)}${L(30, 90, 78, 92)}${L(44, 91, 62, 97)}`;
  const legStraight = (c) => `${L(78, 92, 110, 92, c)}${L(110, 92, 140, 92, c)}${L(140, 92, 143, 80, c)}`;

  const FIG = {
    // Quadriceps sets: leg presses into the mat; the thigh tightens (pulse).
    'quadriceps sets': () => `${supineTop()}<g>${legStraight(C.move)}${rot([0, 2, 0], 78, 92, 1.6)}</g>
      <path d="M100 76 v8 m-4 -4 l4 4 l4 -4" stroke="${C.move}" stroke-width="2.5" fill="none"><animate attributeName="opacity" values="0;1;0" dur="1.6s" repeatCount="indefinite"/></path>`,
    // Straight leg raise: the straight leg lifts to about 30°.
    'straight leg raise': () => `${supineTop()}${L(78, 92, 106, 80)}${L(106, 80, 136, 92)}<g>${legStraight(C.move)}${rot([0, -28, 0], 78, 92)}</g>`,
    // Heel slides: the knee bends as the heel slides towards the buttock.
    'heel slides': () => `${supineTop()}<g>${L(78, 92, 110, 92, C.move)}<g>${L(110, 92, 140, 92, C.move)}${L(140, 92, 143, 80, C.move)}${rot([0, 84, 0], 110, 92)}</g>${rot([0, -42, 0], 78, 92)}</g>`,
    // Ankle pumps: the foot moves up and down.
    'ankle pumps': () => `${supineTop()}${L(78, 92, 110, 92)}${L(110, 92, 140, 92)}<g>${L(140, 92, 143, 78, C.move)}${rot([-25, 20, -25], 140, 92, 1.4)}</g>`,
    // Pelvic tilt: knees bent, the pelvis rocks to flatten the lower back.
    'pelvic tilt': () => `${mat(97)}${head(22, 86)}<g>${L(30, 90, 78, 92, C.move)}${rot([0, -4, 0], 30, 90, 2)}</g>${L(44, 91, 62, 97)}${L(78, 92, 104, 70)}${L(104, 70, 124, 95)}`,
    // Cat–camel: on hands and knees, the back arches up and sags down.
    'cat–camel': () => `${ground(100)}${head(34, 64)}<path d="M48 70 Q80 70 112 70" stroke="${C.move}" stroke-width="6" fill="none" stroke-linecap="round"><animate attributeName="d" values="M48 70 Q80 50 112 70;M48 70 Q80 88 112 70;M48 70 Q80 50 112 70" dur="3s" repeatCount="indefinite"/></path>${L(50, 70, 50, 100)}${L(112, 70, 112, 100)}${L(112, 100, 138, 100)}`,
    // Bird dog: on hands and knees, the opposite arm and leg extend.
    'bird dog': () => `${ground(100)}${head(34, 64)}${L(48, 70, 112, 70)}${L(56, 70, 56, 100)}${L(112, 70, 112, 100)}${L(112, 100, 136, 100)}
      <g>${L(48, 70, 48, 100, C.move)}${rot([0, 90, 0], 48, 70)}</g><g>${L(112, 70, 112, 98, C.move)}${L(112, 98, 112, 99, C.move)}${rot([0, -88, 0], 112, 70)}</g>`,
    // Pendulum swing: leaning on a table, the free arm swings.
    'pendulum swing': () => `${ground(108)}<rect x="104" y="58" width="44" height="6" rx="2" fill="#b9c8cf"/>${L(140, 64, 140, 108, '#b9c8cf')}${head(52, 30)}${L(60, 36, 100, 56)}${L(100, 56, 92, 108)}${L(100, 56, 110, 108)}${L(92, 50, 112, 60)}
      <g>${L(72, 44, 72, 84, C.move)}${rot([-22, 22, -22], 72, 44, 2)}</g>`,
    // Wall slide: back to the wall, arms slide up and down.
    'wall slide': () => `${ground(108)}${L(108, 10, 108, 108, '#b9c8cf')}${head(96, 22)}${L(96, 30, 96, 66)}${L(96, 66, 88, 108)}${L(96, 66, 102, 108)}
      <g>${L(96, 38, 74, 38, C.move)}${rot([30, 75, 30], 96, 38)}</g><g>${L(96, 38, 118, 38, C.move)}${rot([-30, -75, -30], 96, 38)}</g>`,
    // External rotation with band: elbow at the side, the forearm turns out against the band.
    'external rotation with band': () => `${ground(108)}${head(70, 22)}${L(70, 30, 70, 66)}${L(70, 66, 62, 108)}${L(70, 66, 78, 108)}${L(70, 38, 72, 58)}
      <path d="M96 58 L140 58" stroke="${C.band}" stroke-width="3" stroke-dasharray="4 3"/><g>${L(72, 58, 96, 58, C.move)}${rot([0, -55, 0], 72, 58)}</g>`,
    // Chin tuck: the head glides straight back.
    'chin tuck': () => `${ground(108)}<g>${head(66, 24)}${move(['0 0', '7 0', '0 0'], 2.2)}</g>${L(74, 34, 76, 70)}${L(76, 70, 70, 108)}${L(76, 70, 84, 108)}${L(76, 42, 66, 66)}
      <path d="M50 24 h-10" stroke="${C.move}" stroke-width="2.5"><animate attributeName="opacity" values="1;0;1" dur="2.2s" repeatCount="indefinite"/></path>`,
    // Single-leg balance: standing on one leg, gentle sway.
    'single-leg balance': () => `${ground(108)}<g>${head(80, 22)}${L(80, 30, 80, 66)}${L(80, 66, 80, 108)}${L(80, 40, 60, 56)}${L(80, 40, 100, 56)}<g>${L(80, 66, 98, 80, C.move)}${L(98, 80, 92, 96, C.move)}</g>${rot([-3, 3, -3], 80, 108, 3)}</g>`,
  };
  // Extra figures for the extended library.
  FIG['glute bridge'] = () => `${mat(97)}${head(22, 86)}<g>${L(30, 90, 78, 92)}${L(78, 92, 104, 72)}${rot([0, -14, 0], 30, 90)}</g>${L(104, 72, 124, 96)}${L(44, 91, 62, 97)}`;
  FIG['sit to stand'] = () => `${ground(108)}<rect x="40" y="70" width="34" height="6" rx="2" fill="#b9c8cf"/>${L(44, 76, 44, 108, '#b9c8cf')}<g>${head(76, 30)}${L(76, 38, 76, 70)}${L(76, 46, 92, 60)}${move(['0 18', '0 0', '0 18'], 3)}</g><g>${L(76, 88, 90, 108, C.move)}${L(76, 88, 76, 70, C.move)}</g>`;
  FIG['arm curl'] = () => `${ground(108)}${head(80, 22)}${L(80, 30, 80, 66)}${L(80, 66, 72, 108)}${L(80, 66, 88, 108)}${L(80, 38, 84, 60)}<g>${L(84, 60, 108, 60, C.move)}<circle cx="110" cy="60" r="4" fill="${C.move}"/>${rot([0, -80, 0], 84, 60, 2.2)}</g>`;
  FIG['wrist'] = () => `<rect x="20" y="70" width="90" height="10" rx="3" fill="#b9c8cf"/>${L(30, 64, 96, 64)}<g>${L(96, 64, 120, 64, C.move)}${L(120, 64, 128, 58, C.move)}${rot([-30, 30, -30], 96, 64, 2)}</g>`;
  FIG['breathing'] = () => `${ground(108)}${head(80, 22)}<ellipse cx="80" cy="52" rx="14" ry="18" fill="none" stroke="${C.move}" stroke-width="5"><animate attributeName="rx" values="12;18;12" dur="4s" repeatCount="indefinite"/></ellipse>${L(80, 70, 72, 108)}${L(80, 70, 88, 108)}`;
  FIG['plank'] = () => `${ground(100)}${head(30, 72)}<g>${L(40, 78, 130, 92, C.move)}${rot([0, -3, 0], 130, 92, 2.4)}</g>${L(44, 80, 44, 100)}${L(44, 100, 60, 100)}`;
  FIG['calf raise'] = () => `${ground(108)}<g>${head(80, 20)}${L(80, 28, 80, 64)}${L(80, 64, 78, 100)}${L(80, 64, 86, 100)}${L(80, 38, 100, 56)}${move(['0 0', '0 -8', '0 0'], 2)}</g><g>${L(76, 104, 92, 106, C.move)}</g>`;
  FIG['lunge'] = () => `${ground(108)}<g>${head(80, 22)}${L(80, 30, 80, 64)}${L(80, 64, 104, 84, C.move)}${L(104, 84, 104, 108, C.move)}${L(80, 64, 64, 90)}${L(64, 90, 50, 106)}${move(['0 -6', '0 8', '0 -6'], 2.6)}</g>`;
  FIG['stretch'] = () => `${ground(108)}${head(80, 22)}${L(80, 30, 80, 66)}${L(80, 66, 70, 108)}${L(80, 66, 90, 108)}<g>${L(80, 38, 80, 8, C.move)}${rot([-25, 25, -25], 80, 38, 4)}</g>`;
  const KEYWORDS = [[/bridge/, 'glute bridge'], [/sit to stand|squat/, 'sit to stand'], [/curl|triceps|biceps|elbow/, 'arm curl'], [/wrist|finger|thumb|grip|tendon|coin|towel wringing|prayer|nerve glide/, 'wrist'],
    [/breath|huff|expansion/, 'breathing'], [/plank|bear hold|push-up/, 'plank'], [/calf|heel raise|toe raise|heel drop|heel walk|toe walk/, 'calf raise'], [/lunge|step|split/, 'lunge'],
    [/clamshell|abduction|hydrant|donkey|hip extension|side-lying/, 'straight leg raise'], [/rotation|turn|circle/, 'external rotation with band'], [/stretch|angel|opener/, 'stretch'], [/tandem|balance|walk|march|reach|weight shift/, 'single-leg balance']];
  const BY_AREA = { Knee: 'straight leg raise', Spine: 'cat–camel', Shoulder: 'wall slide', Neck: 'chin tuck', Ankle: 'ankle pumps', Balance: 'single-leg balance', Hip: 'glute bridge', Core: 'plank', Elbow: 'arm curl', 'Wrist & Hand': 'wrist', Posture: 'wall slide', Breathing: 'breathing' };
  const generic = () => `${ground(108)}${head(80, 22)}${L(80, 30, 80, 66)}${L(80, 66, 70, 108)}${L(80, 66, 90, 108)}<g>${L(80, 40, 104, 40, C.move)}${rot([60, -40, 60], 80, 40)}</g><g>${L(80, 40, 56, 40, C.move)}${rot([-60, 40, -60], 80, 40)}</g>`;

  PP.exerciseAnim = function (ex, opts) {
    const o = opts || {}; const name = String((ex && ex.name) || ex || '').toLowerCase().trim();
    const area = ex && ex.area;
    const kw = KEYWORDS.find(([re]) => re.test(name));
    const key = FIG[name] ? name : (Object.keys(FIG).find((k) => name.includes(k)) || (kw && kw[1]) || BY_AREA[area]);
    const body = (key ? FIG[key] : generic)();
    const size = o.size ? `width="${o.size}" height="${Math.round(o.size * 0.75)}"` : 'width="100%"';
    return `<svg class="ex-anim" viewBox="0 0 160 120" ${size} role="img" aria-label="${(ex && ex.name) || 'Exercise'} demonstration" style="background:#f3f8f7;border-radius:8px">${body}</svg>`;
  };
  /** Media for an exercise: uploaded image wins; otherwise the animated demonstration. */
  PP.exerciseMedia = function (ex, opts) {
    if (ex && ex.imageData) return `<img src="${String(ex.imageData).replace(/"/g, '&quot;')}" alt="" style="width:100%;border-radius:8px">`;
    return PP.exerciseAnim(ex, opts);
  };
})();
