/*
 * Unit test fisika & geometri (tanpa dependensi). Jalankan: node tests/run.js
 */
'use strict';
const assert = require('assert');
const path = require('path');
['config', 'geometry', 'defects', 'physics', 'specimens', 'calibration', 'dac'].forEach((f) => require(path.join(__dirname, '..', 'src', f + '.js')));
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

const BODY = UT.probeBody(UT.makeProbeTruth(60, null));

function bestOverScan(scenario, angle, dir, T = 20) {
  const p = Object.assign({}, C.defaults, { T, angle, scenario });
  const spec = UT.buildSpecimen(p);
  const full = spec.scene;
  const scene = { points: full.points, corners: full.corners.filter((c) => c.kind === 'cacat') };
  const lim = UT.specimenProbeLimits(spec, dir, BODY);
  let best = { amp: 0 };
  for (let x = Math.ceil(lim.min * 2) / 2; x <= lim.max; x += 0.5) {
    if (Math.abs(x) > 150) continue;
    const s = UT.simulate({ probe: { x, y: 150, dir, angle, freq: 4, crystal: 10 }, mat: C.material, T, scene, grain: null, spStart: 0, spEnd: 250, n: 5000 });
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
  const spec = UT.buildSpecimen(C.defaults);
  const lim = UT.specimenProbeLimits(spec, 1, BODY);
  assert.ok(lim.max + BODY.front <= -spec.weld.capHalf);
  const limR = UT.specimenProbeLimits(spec, -1, BODY);
  near(limR.min, -lim.max, 1e-9);
});
test('batas probe pada blok: wedge tetap di atas blok', () => {
  const spec = UT.buildSpecimen({ specimen: 'iiw' });
  const l1 = UT.specimenProbeLimits(spec, 1, BODY), l2 = UT.specimenProbeLimits(spec, -1, BODY);
  near(l1.min, BODY.back, 1e-9); near(l1.max, 300 - BODY.front, 1e-9);
  near(l2.min, BODY.front, 1e-9); near(l2.max, 300 - BODY.back, 1e-9);
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
  near(a.x, -b.x, 2, 'posisi probe (puncak berupa dataran)');
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

console.log('Spesimen, kalibrasi, DAC');
test('IIW: echo R100 maksimum saat exit point di pusat R100, SP = 100 dan 200 mm', () => {
  const spec = UT.buildSpecimen({ specimen: 'iiw' });
  const scene = { points: spec.scene.points, corners: [] };
  let best = { amp: 0 };
  for (let x = 185; x <= 215; x += 0.5) {
    const s = UT.simulate({ probe: { x, dir: 1, angle: 60, freq: 4, crystal: 10 }, mat: C.material, T: 100, scene, grain: null, spStart: 60, spEnd: 140, n: 4000 });
    const pk = peakOf(s);
    if (pk.amp > best.amp) best = Object.assign(pk, { x });
  }
  near(best.x, 200, 0.5, 'posisi');
  const s1 = UT.simulate({ probe: { x: 200, dir: 1, angle: 60, freq: 4, crystal: 10 }, mat: C.material, T: 100, scene, grain: null, spStart: 60, spEnd: 140, n: 4000 });
  near(peakOf(s1).sp, 100, 0.2, 'SP');
  const s2 = UT.simulate({ probe: { x: 200, dir: 1, angle: 60, freq: 4, crystal: 10 }, mat: C.material, T: 100, scene, grain: null, spStart: 180, spEnd: 220, n: 3000 });
  near(peakOf(s2).sp, 200, 0.2, 'echo ke-2');
});
test('IIW: cek sudut – echo Ø50 maksimum bila sumbu berkas melewati pusat lubang', () => {
  const spec = UT.buildSpecimen({ specimen: 'iiw' });
  const scene = { points: spec.scene.points.filter((p) => !p.rep), corners: [] };
  const h = UT.IIW.hole50, ang = 58.3;
  const xExp = h.x + h.z * Math.tan(ang * Math.PI / 180);
  let best = { amp: 0 };
  for (let x = xExp - 15; x <= xExp + 15; x += 0.25) {
    const s = UT.simulate({ probe: { x, dir: -1, angle: ang, freq: 4, crystal: 10 }, mat: C.material, T: 100, scene, grain: null, spStart: 60, spEnd: 200, n: 4000 });
    const pk = peakOf(s);
    if (pk.amp > best.amp) best = Object.assign(pk, { x });
  }
  near(best.x, xExp, 2.5, 'posisi exit point (≈ ±0,6°)');
});
test('6 dB drop: di ujung reflektor panjang amplitudo turun 6 dB', () => {
  near(20 * Math.log10(UT.yFactor(0, 1000, 0, 3)), -6.02, 0.05);
  near(UT.yFactor(-1000, 1000, 0, 3), 1, 1e-6);
});
test('diameter SDH blok ASME mengikuti tebal', () => {
  assert.strictEqual(UT.asmeSdhDiameter(20), 2.5);
  assert.strictEqual(UT.asmeSdhDiameter(40), 3);
  assert.strictEqual(UT.asmeSdhDiameter(60), 5);
});
test('pemetaan SP alat ↔ SP sebenarnya (zero & velocity) saling invers', () => {
  const cal = { vTrue: 3240, vUser: 3100, zeroTrue: 11.2, zeroUser: 9.5 };
  near(UT.spUserFromTrue(UT.spTrueFromUser(73.4, cal), cal), 73.4, 1e-9);
  const ok = { vTrue: 3240, vUser: 3240, zeroTrue: 11.2, zeroUser: 11.2 };
  near(UT.spTrueFromUser(100, ok), 100, 1e-9);
  // zero kurang 1 µs → echo tampil lebih jauh 1,62 mm
  near(UT.spUserFromTrue(100, Object.assign({}, ok, { zeroUser: 10.2 })), 101.62, 1e-9);
});
test('X-value: tanda index = exit point sebenarnya bila X-value benar', () => {
  const H = { front: 11.3, angle: 60, zero: 11 };
  near(UT.userIndexX(50, 1, H, 11.3), 50, 1e-9);
  near(UT.userIndexX(50, -1, H, 10.3), 49, 1e-9);
});
test('DAC: reference level 80%, interpolasi, tanpa ekstrapolasi', () => {
  const dac = UT.dacCreate();
  UT.dacAdd(dac, 10, 80, 40);
  UT.dacAdd(dac, 30, 40, 40);
  near(UT.dacRefGain(dac), 40, 1e-9);
  near(UT.dacAt(dac, 20, 40), 60, 1e-9);
  near(UT.dacAt(dac, 10, 46), 80 * Math.pow(10, 6 / 20), 1e-9);
  assert.strictEqual(UT.dacAt(dac, 35, 40), null);
  assert.strictEqual(UT.dacAdd(dac, 50, 100, 40), false, 'titik jenuh ditolak');
});
test('evaluasi ASME App. 12', () => {
  const ev = (o) => UT.evaluateASME(Object.assign({ dacExists: true, t: 20, length: null }, o)).verdict;
  assert.strictEqual(ev({ pctDAC: 15, type: 'retak' }), 'abaikan');
  assert.strictEqual(ev({ pctDAC: 30, type: 'lof' }), 'tolak');
  assert.strictEqual(ev({ pctDAC: 80, type: 'slag' }), 'terima');
  assert.strictEqual(ev({ pctDAC: 150, type: 'slag' }), 'ukur');
  assert.strictEqual(ev({ pctDAC: 150, type: 'slag', length: 6 }), 'terima'); // batas t/3 = 6,67
  assert.strictEqual(ev({ pctDAC: 150, type: 'slag', length: 7 }), 'tolak');
  assert.strictEqual(ev({ pctDAC: 150, type: 'slag', length: 7, t: 16 }), 'tolak'); // batas 6 mm
  assert.strictEqual(ev({ pctDAC: null, type: 'slag' }), 'nodac');
  near(UT.asmeLengthLimit(30), 10, 1e-9);
  assert.strictEqual(UT.asmeLengthLimit(60), 19);
});

console.log(`\n${passed} lulus, ${failed} gagal`);
process.exit(failed ? 1 : 0);
