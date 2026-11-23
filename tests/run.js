/*
 * Unit test fisika & geometri (tanpa dependensi). Jalankan: node tests/run.js
 */
'use strict';
const assert = require('assert');
const path = require('path');
['config', 'geometry', 'defects', 'physics'].forEach((f) => require(path.join(__dirname, '..', 'src', f + '.js')));
const UT = globalThis.UT;
const C = UT.CONFIG;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + e.message); }
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≉ ${b} (±${tol})`);

function peakOf(sim) {
  let m = 0, mi = 0;
  for (let i = 0; i < sim.n; i++) { const v = Math.abs(sim.re[i]); if (v > m) { m = v; mi = i; } }
  return { amp: m, sp: sim.spStart + (mi * (sim.spEnd - sim.spStart)) / (sim.n - 1) };
}

function bestOverScan(scenario, angle, dir, T = 20) {
  const p = Object.assign({}, C.defaults, { T, angle });
  const w = UT.buildWeld(p);
  const full = UT.buildScene(w, scenario);
  const scene = { points: full.points, corners: full.corners.filter((c) => c.kind === 'cacat') };
  const lim = UT.probeLimits(w, dir);
  let best = { amp: 0 };
  for (let x = Math.ceil(lim.min * 2) / 2; x <= lim.max; x += 0.5) {
    if (Math.abs(x) > 150) continue;
    const s = UT.simulate({ probe: { x, dir, angle, freq: 4, crystal: 10 }, mat: C.material, T, scene, grain: null, spStart: 0, spEnd: 250, n: 5000 });
    const pk = peakOf(s);
    if (pk.amp > best.amp) best = Object.assign(pk, { x });
  }
  return best;
}

console.log('Geometri');
test('foldDepth: leg 1, 2, 3', () => {
  assert.deepStrictEqual(UT.foldDepth(5, 20), { z: 5, leg: 1 });
  assert.deepStrictEqual(UT.foldDepth(20, 20), { z: 20, leg: 1 });
  assert.deepStrictEqual(UT.foldDepth(25, 20), { z: 15, leg: 2 });
  assert.deepStrictEqual(UT.foldDepth(45, 20), { z: 5, leg: 3 });
});
test('imageDepth kebalikan dari foldDepth', () => {
  for (let leg = 1; leg <= 4; leg++) {
    const zu = UT.imageDepth(7, leg, 20);
    const f = UT.foldDepth(zu, 20);
    near(f.z, 7, 1e-9); assert.strictEqual(f.leg, leg);
  }
});
test('skip distance = 2·T·tanθ (60°, T=20 → 69,28 mm)', () => {
  const l = UT.locate(2 * 20 / Math.cos(Math.PI / 3), 60, 20, 0, 1);
  near(l.sd, 2 * 20 * Math.tan(Math.PI / 3), 1e-9);
  near(l.depth, 0, 1e-9);
});
test('locate leg 2: kedalaman = 2T − SP·cosθ', () => {
  const l = UT.locate(62.4, 60, 20, -60.6, 1);
  near(l.depth, 2 * 20 - 62.4 * 0.5, 1e-9); assert.strictEqual(l.leg, 2);
  near(l.x, -60.6 + 62.4 * Math.sin(Math.PI / 3), 1e-9);
});
test('posisi fusi pada permukaan = setengah bukaan bevel', () => {
  const w = UT.buildWeld(C.defaults);
  near(UT.fusionX(w, 0, -1), -w.topHalf, 1e-9);
  near(UT.fusionX(w, w.T, 1), w.g, 1e-9);
});
test('batas probe: wedge tidak menabrak cap', () => {
  const w = UT.buildWeld(C.defaults);
  const lim = UT.probeLimits(w, 1);
  assert.ok(lim.max + C.wedge.front <= -w.capHalf);
  const limR = UT.probeLimits(w, -1);
  near(limR.min, -lim.max, 1e-9);
});

console.log('Fisika');
test('waktu echo reflektor titik = jarak exit point → reflektor', () => {
  const T = 20, angle = 60, xE = -30;
  const sp0 = 40; // titik pada sumbu berkas, leg 1 (kedalaman 20 → leg 1 di dasar? pakai 15 mm)
  const zu = 15, x = xE + zu * Math.tan(Math.PI / 3);
  const scene = { points: [{ x, z: zu, nx: 0, nz: 0, w: 1, two: true }], corners: [] };
  // normal 0 → two-sided |0| = 0; pakai normal mengarah ke probe
  const r = Math.hypot(x - xE, zu);
  scene.points[0].nx = -(x - xE) / r; scene.points[0].nz = -zu / r;
  const s = UT.simulate({ probe: { x: xE, dir: 1, angle, freq: 4, crystal: 10 }, mat: C.material, T, scene, grain: null, spStart: 0, spEnd: sp0 + 20, n: 6000 });
  near(peakOf(s).sp, r, 0.15, 'SP puncak');
});
test('reflektor di luar berkas tidak menghasilkan echo', () => {
  const scene = { points: [{ x: 50, z: 5, nx: 0, nz: -1, w: 1, two: true }], corners: [] };
  const s = UT.simulate({ probe: { x: -60, dir: 1, angle: 45, freq: 4, crystal: 10 }, mat: C.material, T: 20, scene, grain: null, spStart: 0, spEnd: 30, n: 2000 });
  assert.ok(peakOf(s).amp < 1e-6);
});
test('LOF sisi dekat: 60° (tegak lurus bevel di leg 2) > 45° dan 70° minimal 10 dB', () => {
  const a60 = bestOverScan('lof-kiri', 60, 1).amp;
  const a45 = bestOverScan('lof-kiri', 45, 1).amp;
  const a70 = bestOverScan('lof-kiri', 70, 1).amp;
  assert.ok(20 * Math.log10(a60 / a45) > 10, `60° vs 45°: ${a60} / ${a45}`);
  assert.ok(20 * Math.log10(a60 / a70) > 10, `60° vs 70°: ${a60} / ${a70}`);
});
test('simetri: LOF kiri dari kiri = LOF kanan dari kanan', () => {
  const a = bestOverScan('lof-kiri', 60, 1), b = bestOverScan('lof-kanan', 60, -1);
  near(20 * Math.log10(a.amp / b.amp), 0, 0.5, 'selisih dB');
  near(a.x, -b.x, 0.6, 'posisi probe');
});
test('IP: echo corner trap di kedalaman ≈ T dekat sumbu las', () => {
  const b = bestOverScan('ip', 60, 1);
  const l = UT.locate(b.sp, 60, 20, b.x, 1);
  near(l.depth, 20, 1.2, 'kedalaman');
  near(l.x, -1, 1.5, 'posisi x');
});
test('porositas jauh lebih lemah dari LOF yang tegak lurus (> 6 dB)', () => {
  const lof = bestOverScan('lof-kiri', 60, 1).amp;
  const por = bestOverScan('porositas', 60, 1).amp;
  assert.ok(20 * Math.log10(lof / por) > 6, `${lof} vs ${por}`);
});
test('gatePeak: hanya memicu bila melewati level', () => {
  const v = Float32Array.from([0, 5, 30, 10, 0]);
  const sp = (i) => i * 10;
  const g1 = UT.gatePeak(v, sp, 0, 40, 20);
  assert.ok(g1.triggered); assert.strictEqual(g1.sp, 20);
  const g2 = UT.gatePeak(v, sp, 25, 40, 20);
  assert.ok(!g2.triggered); assert.strictEqual(g2.amp, 10);
});

console.log(`\n${passed} lulus, ${failed} gagal`);
process.exit(failed ? 1 : 0);
