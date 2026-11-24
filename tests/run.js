/*
 * Unit test fisika & geometri (tanpa dependensi). Jalankan: node tests/run.js
 */
'use strict';
const assert = require('assert');
const path = require('path');
['config', 'geometry', 'defects', 'physics', 'specimens', 'calibration', 'dac', 'exam', 'report', 'imaging', 'rekap', 'scanplan', 'corrosion', 'raypath', 'tutorial', 'i18n-lessons-en'].forEach((f) => require(path.join(__dirname, '..', 'src', f + '.js')));
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
    const s = UT.simulate({ probe: { x, dir: -1, angle: ang, freq: 4, crystal: 10 }, mat: C.material, T: 100, scene, grain: null, spStart: 5, spEnd: 120, n: 4000 });
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

console.log('Ujian & laporan (v0.3)');
const weldFor = (o) => UT.buildSpecimen(Object.assign({}, C.defaults, o));
test('cacat acak: kode sama → soal sama, kode beda → soal beda', () => {
  const a = weldFor({ scenario: 'acak', randSeed: 99, randCount: 3 }).scene.truth;
  const b = weldFor({ scenario: 'acak', randSeed: 99, randCount: 3 }).scene.truth;
  const c = weldFor({ scenario: 'acak', randSeed: 100, randCount: 3 }).scene.truth;
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a, c);
  assert.strictEqual(a.length, 3);
});
test('cacat acak: di dalam pelat, tidak saling tumpang tindih sepanjang las', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const T of [12, 20, 25]) {
      const tr = weldFor({ T, scenario: 'acak', randSeed: seed, randCount: 3 }).scene.truth.slice().sort((p, q) => p.y1 - q.y1);
      tr.forEach((d, i) => {
        assert.ok(d.z1 >= 0 && d.z2 <= T + 1e-9, `kedalaman di luar pelat (seed ${seed}, T ${T})`);
        assert.ok(d.y1 >= 0 && d.y2 <= C.weldLength && d.y2 > d.y1, `y tidak valid (seed ${seed})`);
        if (i) assert.ok(d.y1 >= tr[i - 1].y2, `tumpang tindih (seed ${seed})`);
      });
    }
  }
});
test('root bead tidak ada di daerah IP, ada di luar daerah IP', () => {
  const sc = weldFor({ scenario: 'ip' }).scene;
  const rootCorners = sc.corners.filter((c) => c.kind === 'geo' && c.z === sc.corners.find((k) => k.kind === 'cacat').z);
  assert.ok(rootCorners.length >= 2);
  rootCorners.forEach((c) => assert.ok(c.y2 <= 115 || c.y1 >= 185, 'root bead tumpang tindih dengan IP'));
});
test('penilaian: laporan sempurna = 100, kosong = 0', () => {
  const tr = weldFor({ T: 20, scenario: 'acak', randSeed: 5, randCount: 3 }).scene.truth;
  const perfect = tr.map((d) => ({ y1: d.y1, y2: d.y2, depth: (d.z1 + d.z2) / 2, x: (d.x1 + d.x2) / 2, pctDAC: 120, type: d.type, verdict: UT.expectedVerdict(d, 120, 20) }));
  near(UT.gradeExam(tr, perfect, { t: 20 }).score, 100, 1e-9);
  const empty = UT.gradeExam(tr, [], { t: 20 });
  assert.strictEqual(empty.score, 0);
  assert.ok(empty.perDefect.every((p) => p.notes[0].includes('terlewat')));
});
test('penilaian: indikasi palsu −10, jenis salah kehilangan poin jenis', () => {
  const tr = [{ type: 'slag', y1: 100, y2: 110, z1: 9, z2: 11, x1: 0, x2: 4 }];
  const good = { y1: 100, y2: 110, depth: 10, x: 2, pctDAC: 50, type: 'slag', verdict: 'terima' };
  const fc = { y1: 200, y2: 210, depth: 5, x: 0, pctDAC: 40, type: 'porositas', verdict: 'terima' };
  const r = UT.gradeExam(tr, [good, fc], { t: 20 });
  near(r.score, 90, 1e-9);
  assert.strictEqual(r.falseCalls.length, 1);
  const wrongType = UT.gradeExam(tr, [Object.assign({}, good, { type: 'porositas' })], { t: 20 });
  near(wrongType.score, 91, 1e-9); // kelas sama (non-planar) → 6 dari 15
  const planarWrong = UT.gradeExam([Object.assign({}, tr[0], { type: 'lof' })], [Object.assign({}, good, { type: 'lof', verdict: 'terima' })], { t: 20 });
  near(planarWrong.score, 85, 1e-9); // LOF harus ditolak
});
test('DAC otomatis: ≥ 6 titik (leg 1–3) menurun terhadap SP', () => {
  const H = UT.makeProbeTruth(60, null);
  const d = UT.autoDac({ T: 20, H, freq: 4, crystal: 10, cal: { vTrue: 3240, vUser: 3240, zeroTrue: H.zero, zeroUser: H.zero } });
  assert.ok(d.points.length >= 6, `jumlah titik ${d.points.length}`);
  for (let i = 1; i < d.points.length; i++) assert.ok(d.points[i].db < d.points[i - 1].db, 'DAC harus menurun');
  near(d.points[0].sp, 5 / Math.cos(Math.PI / 3) - UT.asmeSdhDiameter(20) / 2, 0.6, 'SP titik ¼T = permukaan depan SDH');
});
test('laporan HTML: escape input pengguna dan memuat nilai', () => {
  const tr = [{ type: 'slag', y1: 100, y2: 110, z1: 9, z2: 11, x1: 0, x2: 4 }];
  const ind = [{ y1: 100, y2: 110, depth: 10, x: 2, pctDAC: 50, type: 'slag', verdict: 'terima', note: '<script>x</script>' }];
  const html = UT.buildReportHTML({
    student: 'Budi & <Ani>', date: 'd', mode: 'Ujian', code: 77, level: 'Mudah',
    specimen: { T: 20, bevel: 30, material: 'Baja karbon' }, probe: { angle: 60, freq: 4, crystal: 10 },
    cal: { xValue: 10, angleUser: 60, zero: 11, velocity: 3240 }, dac: { refGain: 50, scanGain: 56, points: [] },
    indications: ind, result: UT.gradeExam(tr, ind, { t: 20 }),
  });
  assert.ok(html.includes('Budi &amp; &lt;Ani&gt;'));
  assert.ok(!html.includes('<script>x</script>'));
  assert.ok(html.includes('Nilai: <b>100</b>'));
});

console.log('Bevel X/U, B-scan, S-scan, TOFD (v0.4)');
test('profil fusi V/X/U kontinu dan monoton menurut kedalaman', () => {
  ['V', 'X', 'U'].forEach((bt) => {
    const w = UT.buildWeld(Object.assign({}, C.defaults, { bevelType: bt, T: 25 }));
    let prev = UT.fusionX(w, 0, 1);
    for (let z = 0.05; z <= 25; z += 0.05) {
      const x = UT.fusionX(w, z, 1);
      assert.ok(Math.abs(x - prev) < 1, `${bt}: loncatan di z=${z.toFixed(2)} (${prev.toFixed(2)} → ${x.toFixed(2)})`);
      assert.ok(x >= w.g - 1e-9, `${bt}: x < setengah gap`);
      prev = x;
    }
  });
  const X = UT.buildWeld(Object.assign({}, C.defaults, { bevelType: 'X', T: 20 }));
  near(X.topHalf, X.botHalf, 1e-9, 'X simetris');
  near(UT.fusionX(X, 10, 1), X.g, 1e-9, 'root face X di tengah');
});
test('IP pada bevel X tertanam di tengah tebal (tanpa corner trap)', () => {
  const sc = weldFor({ bevelType: 'X', T: 20, scenario: 'ip' }).scene;
  const t = sc.truth[0];
  assert.ok(t.z1 > 5 && t.z2 < 15, `kedalaman IP ${t.z1}–${t.z2}`);
  assert.strictEqual(sc.corners.filter((c) => c.kind === 'cacat').length, 0);
});
const tofdRun = (scenario, T, y) => {
  const spec = weldFor({ T, scenario });
  const S = UT.tofdDefaultS(T, 60), W = UT.tofdWindow(S, T, C.material.vL);
  const s = UT.simulateTOFD({ S, angle: 60, freq: 5, crystal: 6, y: y == null ? 150 : y, T, scene: spec.scene, grain: null, tStart: W.tStart, tEnd: W.tEnd, n: 4000, mat: C.material });
  return { s, S, W, spec };
};
const tofdPeaks = (s, thr) => {
  const out = [], dt = (s.tEnd - s.tStart) / (s.n - 1);
  for (let i = 12; i < s.n - 12; i++) {
    const v = Math.abs(s.re[i]);
    if (v < thr) continue;
    let ok = true;
    for (let k = -12; k <= 12 && ok; k++) if (Math.abs(s.re[i + k]) > v) ok = false;
    if (ok) out.push({ t: s.tStart + i * dt, v: s.re[i] });
  }
  return out;
};
test('TOFD: waktu gelombang lateral & back wall, kedalaman ↔ waktu saling invers', () => {
  const { s, S, W } = tofdRun('none', 20);
  near(W.tLat, (2 * S) / 5.92, 1e-9);
  near(UT.tofdDepth(UT.tofdTime(13.3, S, 5920), S, 5920), 13.3, 1e-9);
  assert.strictEqual(UT.tofdDepth(W.tLat - 0.5, S, 5920), null);
  const pk = tofdPeaks(s, 0.05 * s.bwPeak);
  assert.ok(pk.some((p) => Math.abs(p.t - W.tLat) < 0.05), 'puncak lateral');
  assert.ok(pk.some((p) => Math.abs(p.t - W.tBw) < 0.05), 'puncak back wall');
});
test('TOFD: ujung retak terukur pada kedalaman sebenarnya dengan fase berlawanan', () => {
  const { s, S, spec } = tofdRun('crack', 20);
  const t = spec.scene.truth[0];
  const pk = tofdPeaks(s, 0.04 * s.bwPeak).map((p) => ({ d: UT.tofdDepth(p.t, S, 5920), v: p.v })).filter((p) => p.d != null && p.d > 2 && p.d < 19);
  const top = pk.reduce((a, p) => (Math.abs(p.d - t.z1) < Math.abs(a.d - t.z1) ? p : a));
  const bot = pk.reduce((a, p) => (Math.abs(p.d - t.z2) < Math.abs(a.d - t.z2) ? p : a));
  near(top.d, t.z1, 0.6, 'ujung atas');
  near(bot.d, t.z2, 0.6, 'ujung bawah');
  assert.ok(top.v < 0 && bot.v > 0, `fase atas ${top.v.toFixed(3)} / bawah ${bot.v.toFixed(3)}`);
});
test('TOFD: di luar panjang cacat sinyal ujung hilang', () => {
  // dibandingkan terhadap pelat tanpa cacat agar gelombang lateral & back wall tidak ikut terhitung
  const base = tofdRun('none', 20, 152).s.re;
  const diff = (r) => { let m = 0; for (let i = 0; i < r.s.n; i++) m = Math.max(m, Math.abs(r.s.re[i] - base[i])); return m; };
  const on = diff(tofdRun('crack', 20, 152)), off = diff(tofdRun('crack', 20, 260));
  assert.ok(on > 0.1 && off < 1e-6, `${on} vs ${off}`);
});
test('S-scan: echo SDH terkuat pada sudut yang melewati lubang', () => {
  const spec = UT.buildSpecimen({ specimen: 'asme', T: 20 });
  const h = spec.holes[1]; // ½T
  const x = h.x - h.z * Math.tan((55 * Math.PI) / 180); // probe diletakkan untuk sudut 55°
  let best = { a: 0, amp: 0 };
  UT.pautAngles().forEach((a) => {
    const s = UT.simulate({ probe: { x, dir: 1, angle: a, freq: UT.PAUT.freq, crystal: UT.PAUT.aperture }, mat: C.material, T: 20, scene: { points: spec.scene.points, corners: [] }, grain: null, spStart: 5, spEnd: 30, n: 1500 });
    const m = Math.max(...UT.envelopeBins(s.re, 100));
    if (m > best.amp) best = { a, amp: m };
  });
  near(best.a, 55, 2, 'sudut terbaik');
});
test('akuisisi progresif mengisi semua kolom', () => {
  const sc = new UT.ProgressiveScan(7, 5, (i) => Float32Array.from([i, i, i, i, i]));
  sc.runAll();
  assert.strictEqual(sc.progress, 1);
  assert.strictEqual(sc.data[6 * 5 + 2], 6);
  const env = UT.envelopeBins(Float32Array.from([0, -3, 1, 2, 0, 0]), 2);
  assert.deepStrictEqual(Array.from(env), [3, 2]);
  assert.deepStrictEqual(Array.from(UT.signedBins(Float32Array.from([0, -3, 1, 2, 0, 0]), 2)), [-3, 2]);
});

console.log('Material, pipa, rekap (v0.5)');
const peakDefect = (o) => {
  // amplitudo cacat = selisih terhadap benda uji tanpa cacat (noise butir sama)
  const spec = weldFor(Object.assign({ T: 20 }, o.spec));
  let best = 0;
  for (let x = o.x0; x <= o.x1; x += 1) {
    const base = { probe: { x, y: 150, dir: 1, angle: 60, freq: 4, crystal: 10, wave: o.wave }, mat: C.material, T: 20, grain: spec.grain, spStart: 0, spEnd: 150, n: 2000, weld: spec.weld, coupling: o.coupling };
    const a = UT.simulate(Object.assign({}, base, { scene: { points: spec.scene.points, corners: [] } }));
    const b = UT.simulate(Object.assign({}, base, { scene: { points: [], corners: [] } }));
    for (let i = 0; i < a.n; i++) best = Math.max(best, Math.abs(a.re[i] - b.re[i]));
  }
  return best;
};
test('austenitik: gelombang geser melewati las teredam jauh lebih kuat daripada LW', () => {
  UT.setMaterial('ss');
  try {
    const sw = peakDefect({ spec: { scenario: 'lof-kanan' }, wave: 'T', x0: -100, x1: -27 });
    const lw = peakDefect({ spec: { scenario: 'lof-kanan' }, wave: 'L', x0: -100, x1: -27 });
    UT.setMaterial('cs');
    const swCs = peakDefect({ spec: { scenario: 'lof-kanan' }, wave: 'T', x0: -100, x1: -27 });
    assert.ok(20 * Math.log10(swCs / sw) > 6, `SW cs vs ss: ${swCs} / ${sw}`);
    assert.ok(lw > sw, `LW ${lw} harus > SW ${sw} pada austenitik`);
  } finally { UT.setMaterial('cs'); }
});
test('material aktif & kecepatan per mode gelombang', () => {
  UT.setMaterial('ss');
  assert.strictEqual(UT.waveV(C.material, 'L'), 5740);
  assert.strictEqual(UT.waveV(C.material, 'T'), 3130);
  UT.setMaterial('cs');
  assert.strictEqual(C.material.vT, 3240);
  assert.strictEqual(C.material.name, 'Baja karbon');
});
test('pipa: keliling = π·OD, cacat acak di dalam keliling, kopling lebih buruk untuk wedge datar', () => {
  const spec = weldFor({ geom: 'pipa', OD: 114.3, scenario: 'acak', randSeed: 3, randCount: 4 });
  near(spec.yLen, Math.PI * 114.3, 1e-9);
  spec.scene.truth.forEach((t) => assert.ok(t.y2 <= spec.yLen - 20, `cacat melewati keliling ${t.y2}`));
  const flat = UT.coupling(spec, false), cont = UT.coupling(spec, true);
  assert.ok(flat.lossDb > cont.lossDb + 5, `${flat.lossDb} vs ${cont.lossDb}`);
  assert.strictEqual(UT.coupling(weldFor({}), false).lossDb, 0, 'pelat datar tanpa rugi');
  const aFlat = peakDefect({ spec: { geom: 'pipa', OD: 114.3, scenario: 'lof-kiri' }, wave: 'T', x0: -70, x1: -50, coupling: flat });
  const aCont = peakDefect({ spec: { geom: 'pipa', OD: 114.3, scenario: 'lof-kiri' }, wave: 'T', x0: -70, x1: -50, coupling: cont });
  assert.ok(aCont > 2 * aFlat, `kontur ${aCont} vs datar ${aFlat}`);
});
test('blok lengkung ASME berlaku untuk 0,9–1,5 × diameter blok', () => {
  assert.ok(UT.curvedBlockOk(168.3, 168.3));
  assert.ok(UT.curvedBlockOk(219.1, 168.3));
  assert.ok(!UT.curvedBlockOk(323.9, 168.3));
  assert.ok(!UT.curvedBlockOk(114.3, 168.3));
  assert.ok(!UT.curvedBlockOk(114.3, null));
});
test('rekap: file hasil (JSON & HTML) terbaca, nilai dihitung ulang, perubahan nilai terdeteksi', () => {
  const { ex, truth } = UT.examTruth(4321, 'sedang');
  const rows = truth.map((d) => ({ y1: d.y1, y2: d.y2, depth: (d.z1 + d.z2) / 2, x: (d.x1 + d.x2) / 2, pctDAC: 150, type: d.type, verdict: UT.expectedVerdict(d, 150, ex.T), note: '' }));
  const result = UT.gradeExam(truth, rows, { t: ex.T });
  const rec = UT.buildResultRecord({ student: 'Ani', code: 4321, levelId: 'sedang', T: ex.T, date: 'd', elapsedMs: 61000, rows, result });
  const back = UT.parseResultFile(JSON.stringify(rec));
  const rg = UT.regradeRecord(back);
  near(rg.result.score, 100, 1e-9);
  assert.strictEqual(rg.status, 'cocok');
  const html = '<html><body><script type="application/json" id="ut-result">' + UT.recordForHTML(rec) + '</script></body></html>';
  assert.strictEqual(UT.parseResultFile(html).student, 'Ani');
  const tampered = Object.assign({}, rec, { score: 100, rows: rows.slice(1) });
  const rg2 = UT.regradeRecord(UT.parseResultFile(JSON.stringify(tampered)));
  assert.strictEqual(rg2.status, 'berbeda');
  assert.ok(rg2.result.score < 100);
  assert.throws(() => UT.parseResultFile('{"type":"lain"}'));
  assert.throws(() => UT.parseResultFile('<html>bukan hasil</html>'));
});
test('rekap: statistik kelas dan CSV', () => {
  const mk = (name, drop) => {
    const { ex, truth } = UT.examTruth(77, 'mudah');
    const rows = drop ? [] : truth.map((d) => ({ y1: d.y1, y2: d.y2, depth: (d.z1 + d.z2) / 2, x: (d.x1 + d.x2) / 2, pctDAC: 150, type: d.type, verdict: UT.expectedVerdict(d, 150, ex.T) }));
    const rec = UT.parseResultFile(JSON.stringify(UT.buildResultRecord({ student: name, code: 77, levelId: 'mudah', T: ex.T, date: 'd', elapsedMs: 90000, rows, result: UT.gradeExam(truth, rows, { t: ex.T }) })));
    return { rec, regrade: UT.regradeRecord(rec) };
  };
  const ents = [mk('A; "x"', false), mk('B', true)];
  const st = UT.summarizeClass(ents);
  assert.strictEqual(st.n, 2);
  near(st.mean, 50, 1e-9);
  assert.strictEqual(st.found, 1);
  assert.strictEqual(st.total, 2);
  const csv = UT.classCSV(ents);
  assert.ok(csv.startsWith('﻿Nama;Kode soal'));
  assert.ok(csv.includes('"A; ""x"""'), 'nama dengan ; dan " di-escape');
  assert.ok(csv.includes('1:30'));
});

console.log('Blok V1 (sisi A/B) & V2');
const blkPeaks = (spec, x, dir, ang, s0, s1) => {
  const s = UT.simulate({ probe: { x, dir, angle: ang, freq: 4, crystal: 10 }, mat: C.material, T: spec.T, scene: { points: spec.scene.points, corners: [] }, grain: null, spStart: s0, spEnd: s1, n: 6000 });
  const out = [];
  for (let i = 8; i < s.n - 8; i++) {
    const v = Math.abs(s.re[i]);
    let ok = v > 0.02;
    for (let k = -8; k <= 8 && ok; k++) if (Math.abs(s.re[i + k]) > v) ok = false;
    if (ok) out.push({ sp: s.spStart + (i * (s.spEnd - s.spStart)) / (s.n - 1), v });
  }
  const m = Math.max(...out.map((o) => o.v));
  return out.filter((o) => o.v > 0.1 * m).map((o) => Math.round(o.sp));
};
const bestX = (spec, x0, x1, dir, ang, s0, s1) => {
  let b = { a: 0 };
  for (let x = x0; x <= x1; x += 0.25) {
    const s = UT.simulate({ probe: { x, dir, angle: ang, freq: 4, crystal: 10 }, mat: C.material, T: spec.T, scene: { points: spec.scene.points, corners: [] }, grain: null, spStart: s0, spEnd: s1, n: 1500 });
    let m = 0;
    for (let i = 0; i < s.n; i++) m = Math.max(m, Math.abs(s.re[i]));
    if (m > b.a) b = { a: m, x };
  }
  return b.x;
};
test('V2: menghadap R25 → 25/100/175 mm, menghadap R50 → 50/125/200 mm', () => {
  const v2 = UT.buildSpecimen({ specimen: 'v2' });
  [45, 60, 70].forEach((ang) => {
    assert.deepStrictEqual(blkPeaks(v2, 0, -1, ang, 5, 230), [25, 100, 175], `R25 ${ang}°`);
    assert.deepStrictEqual(blkPeaks(v2, 0, 1, ang, 5, 230), [50, 125, 200], `R50 ${ang}°`);
  });
});
test('V2: cek sudut dengan lubang Ø5 sesuai skala (45°–65°)', () => {
  const v2 = UT.buildSpecimen({ specimen: 'v2' });
  const h = UT.V2.hole;
  [45, 55, 65].forEach((ang) => {
    const t = Math.tan((ang * Math.PI) / 180), sp = h.z / Math.cos((ang * Math.PI) / 180) - h.r;
    near(bestX(v2, 2, 49, -1, ang, sp - 3, sp + 3), h.x + h.z * t, 1.5, `${ang}°`);
  });
});
test('V1 sisi B: cek sudut 70° dengan lubang Ø1,5 (15 mm dari permukaan)', () => {
  const b = UT.buildSpecimen({ specimen: 'iiw', iiwFace: 'B' });
  const h = UT.IIW.hole15, ang = 70, t = Math.tan((ang * Math.PI) / 180);
  const sp = h.zB / Math.cos((ang * Math.PI) / 180);
  near(bestX(b, h.x + h.zB * t - 12, h.x + h.zB * t + 12, -1, ang, sp - 4, sp + 4), h.x + h.zB * t, 2.5);
  // pada sisi B, lubang Ø1,5 berada 15 mm di bawah permukaan pindai
  assert.ok(b.holes.some((hh) => hh.label === 'Ø1,5' && Math.abs(hh.z - 15) < 1e-9));
});
test('V1 sisi A: skala sudut terukir sesuai posisi Ø50 (60° ≈ 82 mm, 70° ≈ 109 mm dari ujung)', () => {
  const a = UT.buildSpecimen({ specimen: 'iiw', iiwFace: 'A' });
  const sc = a.marks.scale;
  near(sc.hx + sc.hz * Math.tan(Math.PI / 3), 81.8, 0.5);
  near(sc.hx + sc.hz * Math.tan((70 * Math.PI) / 180), 109.2, 0.5);
  assert.strictEqual(a.marks.centerX, 200);
});

test('V2 sisi miring: sisi miring menyinggung R25, cek sudut 65°–75° dengan lubang Ø5', () => {
  const G = UT.v2Geometry();
  near(Math.hypot(G.Tp[0], G.Tp[1]), 25, 1e-9, 'titik singgung R25');
  near(Math.hypot(G.E[0], G.E[1]), 50, 1e-9, 'ujung di R50');
  const b = UT.buildSpecimen({ specimen: 'v2', v2Face: 'B' });
  [65, 70, 75].forEach((ang) => {
    const r = (ang * Math.PI) / 180, xe = -G.d * Math.tan(r), sp = G.d / Math.cos(r) - UT.V2.hole.r;
    assert.ok(xe > b.xMin, `tanda ${ang}° di dalam sisi miring`);
    // blok diputar: skala di kiri tanda 0, probe menghadap kanan (→) ke lubang Ø5
    const read = (Math.atan(-bestX(b, b.xMin + 1, -1, 1, ang, sp - 4, sp + 4) / G.d) * 180) / Math.PI;
    near(read, ang, 2, `${ang}° terbaca`);
  });
  // sisi atas tetap memberi urutan echo R25/R50 yang benar
  const a = UT.buildSpecimen({ specimen: 'v2', v2Face: 'A' });
  assert.deepStrictEqual(blkPeaks(a, 0, -1, 45, 5, 230), [25, 100, 175]);
  assert.deepStrictEqual(blkPeaks(a, 0, 1, 70, 5, 230), [50, 125, 200]);
});

test('TCG: reflektor referensi tampil 80% di semua jarak pada reference level', () => {
  const dac = UT.dacCreate();
  UT.dacAdd(dac, 10, 80, 40); UT.dacAdd(dac, 30, 40, 40); UT.dacAdd(dac, 60, 20, 40);
  const ref = UT.dacRefGain(dac);
  [10, 20, 30, 45, 60].forEach((sp) => near(UT.dacAt(dac, sp, ref) * UT.tcgFactor(dac, sp), 80, 1e-9, `SP ${sp}`));
  near(UT.tcgFactor(dac, 5), UT.tcgFactor(dac, 10), 1e-12, 'di bawah rentang: faktor titik pertama');
  near(UT.tcgFactor(dac, 90), UT.tcgFactor(dac, 60), 1e-12, 'di atas rentang: faktor titik terakhir');
  near(UT.tcgLevel(dac, ref + 6), 80 * Math.pow(10, 6 / 20), 1e-9, 'garis referensi naik 6 dB');
});

console.log('v0.6: cacat melintang, scan sejajar, kompatibilitas soal');
test('retak melintang: tak terlihat dari scan tegak lurus, terdeteksi dari scan sejajar (70°)', () => {
  const sp = weldFor({ T: 20, scenario: 'melintang', angle: 70 });
  const amp = (scene, xs, lat) => {
    let m = 0;
    xs.forEach((x) => {
      const s = UT.simulate({ probe: { x, y: lat, dir: 1, angle: 70, freq: 4, crystal: 10 }, mat: C.material, T: 20, scene: { points: scene.points, corners: scene.corners.filter((c) => c.kind === 'cacat') }, grain: null, spStart: 0, spEnd: 150, n: 2000 });
      for (let i = 0; i < s.n; i++) m = Math.max(m, Math.abs(s.re[i]));
    });
    return m;
  };
  const xsPerp = [], xsPar = [];
  for (let x = -110; x <= -26; x += 1) xsPerp.push(x);
  for (let x = 100; x <= 148; x += 0.5) xsPar.push(x);
  const perp = amp(sp.scene, xsPerp, 150), par = amp(sp.scene.par, xsPar, 0);
  assert.ok(20 * Math.log10(par / perp) > 30, `sejajar ${par} vs tegak ${perp}`);
});
test('LOF memanjang: kuat dari scan tegak lurus, lemah dari scan sejajar', () => {
  const sp = weldFor({ T: 20, scenario: 'lof-kiri' });
  const s1 = bestOverScan('lof-kiri', 60, 1);
  let m = 0;
  for (let x = 40; x <= 160; x += 1) {
    const s = UT.simulate({ probe: { x, y: -8, dir: 1, angle: 60, freq: 4, crystal: 10 }, mat: C.material, T: 20, scene: sp.scene.par, grain: null, spStart: 0, spEnd: 150, n: 2000 });
    for (let i = 0; i < s.n; i++) m = Math.max(m, Math.abs(s.re[i]));
  }
  assert.ok(20 * Math.log10(s1.amp / m) > 20, `${s1.amp} vs ${m}`);
});
test('generator acak: generasi 1 tetap sama (kode soal lama), generasi 2 memuat jenis baru', () => {
  const g1 = UT.examTruth(555, 'mudah', 1).truth.map((t) => t.type);
  assert.deepStrictEqual(g1, ['slag']);
  const seen = new Set();
  for (let c = 1; c <= 120; c++) UT.examTruth(c, 'sulit', 2).truth.forEach((t) => seen.add(t.orient ? 'melintang' : t.type));
  ['melintang', 'undercut', 'lof', 'ip'].forEach((k) => assert.ok(seen.has(k), `jenis ${k} muncul`));
  const old = UT.parseResultFile(JSON.stringify({ type: UT.RESULT_TYPE, code: 555, level: 'mudah', rows: [] }));
  assert.strictEqual(old.gen, 1, 'file tanpa gen dianggap generasi 1');
});
test('scan sejajar: probe tidak bisa di atas las bila cap masih ada', () => {
  const sp = weldFor({ T: 20, cap: true });
  assert.ok(Math.abs(UT.lateralLimit(sp, 0)) >= sp.weld.capHalf + 10);
  assert.strictEqual(UT.lateralLimit(weldFor({ T: 20, cap: false }), 0), 0);
});

// ---- v0.7: probe lurus, laminasi, bayangan, rencana scan
const sim0 = (sp, x, o = {}) => UT.simulate(Object.assign({
  probe: { x, y: 150, dir: 1, angle: 0, freq: 4, crystal: 10, wave: 'L' }, mat: C.material, T: sp.T,
  scene: sp.scene, grain: null, weld: sp.weld, shadows: sp.scene.shadows || [], backwall: { flat: UT.flatBottomFn(sp) },
  spStart: 0, spEnd: 70, n: 7000,
}, o));
const ampAt = (sim, sp0, w = 1.5) => {
  let m = 0;
  for (let i = 0; i < sim.n; i++) { const sp = sim.spStart + (i * (sim.spEnd - sim.spStart)) / (sim.n - 1); if (Math.abs(sp - sp0) <= w) m = Math.max(m, Math.abs(sim.re[i])); }
  return m;
};
test('probe lurus 0°: echo back wall di T, 2T, 3T dengan amplitudo menurun', () => {
  const sp = weldFor({ T: 20, scenario: 'none', angle: 0 });
  const s = sim0(sp, -120);
  const a1 = ampAt(s, 20), a2 = ampAt(s, 40), a3 = ampAt(s, 60);
  assert.ok(a1 > a2 && a2 > a3 && a3 > 0, `${a1} ${a2} ${a3}`);
  near(peakOf(Object.assign({}, s, { re: s.re.map((v, i) => (i < s.n * 10 / 70 ? 0 : v)) })).sp, 20, 0.3, 'BW pertama');
});
test('laminasi: echo berulang di d, 2d dan back wall hilang', () => {
  const sp = weldFor({ T: 20, scenario: 'laminasi', angle: 0 });
  const z = sp.scene.shadows[0].z;
  const off = sim0(sp, -120), on = sim0(sp, -65);
  assert.ok(ampAt(on, z, 0.8) > 0.5 * ampAt(off, 20), 'echo laminasi kuat');
  assert.ok(ampAt(on, 2 * z, 0.8) > 0, 'echo ulang 2d');
  assert.ok(ampAt(on, 20, 0.5) < 0.1 * ampAt(off, 20, 0.5), 'back wall hilang di atas laminasi');
});
test('bayangan laminasi melemahkan LOF bagi probe sudut yang berkasnya melewati laminasi', () => {
  const sp = weldFor({ T: 20, scenario: 'laminasi-lof' });
  const scene = { points: sp.scene.points.filter((p) => !p.rep), corners: [] };
  const run = (sh) => {
    let m = 0;
    for (let x = -80; x <= -20; x += 1) {
      const s = UT.simulate({ probe: { x, y: 150, dir: 1, angle: 60, freq: 4, crystal: 10 }, mat: C.material, T: 20, scene, grain: null, shadows: sh, spStart: 0, spEnd: 100, n: 4000 });
      m = Math.max(m, peakOf(s).amp);
    }
    return m;
  };
  const free = run([]), shaded = run(sp.scene.shadows);
  assert.ok(20 * Math.log10(free / shaded) > 6, `turun ${(20 * Math.log10(free / shaded)).toFixed(1)} dB`);
});
test('kalibrasi probe 0°: hanya zero & velocity yang dinilai', () => {
  const H = UT.makeProbeTruth(0, () => 0.5);
  assert.strictEqual(H.angle, 0);
  const st = UT.calibrationStatus(H, { xValue: 0, angle: 45, zero: H.zero, velocity: C.materials.cs.vL }, C.materials.cs.vL);
  assert.ok(st.ok && st.items.length === 2);
});
test('rencana scan: leg 2 dan dua sisi menaikkan cakupan; jarak terlalu pendek menurunkannya', () => {
  const w = weldFor({ T: 20, scenario: 'none' }).weld;
  const base = { crystal: 10, freq: 4, mat: C.material, wave: 'T', haz: 6, near: UT.minProbeDistance(w) };
  const c1 = UT.coverage(w, Object.assign({}, base, { angles: [60], sides: ['kiri'], legs: 1, far: 100 }));
  const c2 = UT.coverage(w, Object.assign({}, base, { angles: [60], sides: ['kiri'], legs: 2, far: 100 }));
  const c3 = UT.coverage(w, Object.assign({}, base, { angles: [60], sides: ['kiri'], legs: 2, far: 50 }));
  const c4 = UT.coverage(w, Object.assign({}, base, { angles: [45, 60], sides: ['kiri', 'kanan'], legs: 2, far: 50 }));
  assert.ok(c1.pct < 60 && c1.uncovered > 0, `leg1 ${c1.pct}`);
  near(c2.pct, 100, 0.01, 'leg 1–2');
  assert.ok(c3.pct < c2.pct, `far 50: ${c3.pct}`);
  near(c4.pct, 100, 0.01, '45+60 dua sisi');
  let both = 0;
  for (let k = 0; k < c4.count.length; k++) if (c4.roi[k] && c4.count[k] >= 2) both++;
  assert.ok(both > 0, 'ada daerah ≥ 2 setup');
});
test('rencana scan: jarak skip sesuai T·tanθ', () => {
  const w = weldFor({ T: 20, scenario: 'none' }).weld;
  const d = UT.planDistances(w, 60, 6);
  near(d.halfSkip, 20 * Math.tan(Math.PI / 3), 1e-9);
  near(d.fullSkip, 2 * d.halfSkip, 1e-9);
});
test('service worker memuat semua skrip yang dipakai index.html', () => {
  const fs = require('fs');
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(srcs.length > 10);
  srcs.concat(['css/style.css', 'manifest.webmanifest']).forEach((f) => assert.ok(sw.includes(`'./${f}'`) || sw.includes(`"./${f}"`), `${f} ada di cache`));
  assert.ok(sw.includes(`ut-sim-v${C.version}`), 'nama cache mengikuti versi');
});

// ---- v0.8
test('ujian praktik: proses sempurna = 100, proses buruk jauh lebih rendah; dinilai ulang dari file', () => {
  const H = UT.examProbeTruth(4321, 60);
  const cal = { vTrue: 3240, vUser: 3240, zeroTrue: H.zero, zeroUser: H.zero };
  const td = UT.autoDac({ T: 20, H, freq: 4, crystal: 10, cal });
  const good = { H, user: { xValue: H.front, angle: H.angle, zero: H.zero, velocity: 3240 }, vTrue: 3240, dacPoints: td.points, gain: UT.dacRefGain(td) + 6, T: 20, freq: 4, crystal: 10, trueDac: td };
  near(UT.gradeProcess(good).score, 100, 0.01);
  const bad = Object.assign({}, good, { user: { xValue: 10, angle: 60, zero: UT.nominalZero(60), velocity: 3240 }, dacPoints: [], gain: 40 });
  assert.ok(UT.gradeProcess(bad).score < 45);
  const rec = UT.buildResultRecord({ student: 'x', code: 4321, levelId: 'praktik', T: 20, gen: 2, rows: [], result: { score: 30 }, process: good });
  const rg = UT.regradeRecord(UT.parseResultFile(JSON.stringify(rec)));
  near(rg.result.process.score, 100, 0.01);
  near(rg.result.score, 30, 0.01, '70% laporan (0) + 30% proses');
});
test('AWS D1.1: rating d = a − b − c dan kelas', () => {
  assert.strictEqual(UT.awsAttenuation(25.4), 0);
  assert.strictEqual(UT.awsAttenuation(76.2), 4);
  const r = UT.evaluateAWS({ a: 50, b: 50, sp: 50.8, t: 20, angle: 70, length: null, depth: 10 });
  assert.strictEqual(r.d, -2);
  assert.strictEqual(r.cls, 'A');
  assert.strictEqual(r.verdict, 'tolak');
  const d = UT.evaluateAWS({ a: 62, b: 50, sp: 25, t: 20, angle: 70, length: 100, depth: 10 });
  assert.strictEqual(d.cls, 'D');
  assert.strictEqual(d.verdict, 'terima');
  const c = UT.evaluateAWS({ a: 57, b: 50, sp: 25, t: 16, angle: 70, length: 30, depth: 8 });
  assert.strictEqual(c.cls, 'C');
  assert.strictEqual(c.verdict, 'terima', 'C di setengah tengah: batas 50 mm');
  assert.strictEqual(UT.evaluateAWS({ a: 57, b: 50, sp: 25, t: 16, angle: 60, length: 30, depth: 8 }).verdict, 'nodac', '60° tidak ada di tabel untuk 16 mm');
});
test('PAUT: fokus di dalam near field menaikkan amplitudo & mempersempit berkas; di luar tidak berpengaruh', () => {
  const sp = UT.buildSpecimen(Object.assign({}, C.defaults, { specimen: 'asme', T: 40 }));
  const h = sp.holes[0], th = Math.PI / 3, sc = { points: sp.scene.points, corners: [] };
  const run = (F) => {
    let best = 0, n6 = 0;
    const prof = [];
    for (let x = h.x - h.z * Math.tan(th) - 10; x <= h.x - h.z * Math.tan(th) + 10; x += 0.25) {
      const s = UT.simulate({ probe: { x, dir: 1, angle: 60, freq: 5, crystal: 9.6, focus: F ? F / Math.cos(th) : null }, mat: C.material, T: 40, scene: sc, grain: null, spStart: h.z / Math.cos(th) - 4, spEnd: h.z / Math.cos(th) + 4, n: 500 });
      let m = 0; for (const v of s.re) m = Math.max(m, Math.abs(v));
      prof.push(m); best = Math.max(best, m);
    }
    prof.forEach((v) => { if (v >= best / 2) n6++; });
    return { best, n6 };
  };
  const u = run(null), f = run(10), far = run(40);
  assert.ok(20 * Math.log10(f.best / u.best) > 4, 'naik > 4 dB');
  assert.ok(f.n6 < u.n6, 'lebih sempit');
  near(far.best, u.best, 1e-6, 'fokus di luar near field');
  const dl = UT.delayLaw(60, null, 3240), dlf = UT.delayLaw(60, 20, 3240);
  assert.strictEqual(dl.length, 16);
  assert.ok(dl[15] > dl[0] && Math.abs(dl[1] - dl[0] - (dl[2] - dl[1])) < 1e-6, 'tanpa fokus: linear');
  assert.ok(Math.abs(dlf[1] - dlf[0] - (dlf[15] - dlf[14])) > 1, 'fokus: melengkung');
});
test('korosi: probe tunggal mengukur tebal sisa; probe dual punya galat lintasan-V dan dead zone pendek', () => {
  const sp = UT.buildKorosi(12, 2468);
  const f = sp.features[0];
  const gl = C.GAIN_K * Math.pow(10, 32 / 20);
  const meas = (x, y, dual) => {
    const s = UT.simulateStraight({ probe: { x, y, freq: 5, crystal: 10, dual }, spec: sp, mat: C.material, spStart: 0, spEnd: 30, n: 3000 });
    return UT.firstEchoSP(s.re, gl, (i) => (i * 30) / 2999, 1.5, 14, 20);
  };
  near(meas(20, 20, false), 12, 0.15, 'tebal nominal');
  near(meas(f.x - 12, f.y, false), sp.thick(f.x - 12, f.y), 0.25, 'tebal sisa');
  assert.ok(meas(20, 20, true) > 12.05, 'galat lintasan-V');
  near(UT.dualPath(2) - 2, Math.sqrt(4 + UT.DUAL.s ** 2) - 2, 1e-9);
  // main bang probe dual jauh lebih kecil
  const mb = (dual) => { const s = UT.simulateStraight({ probe: { x: 20, y: 20, freq: 5, crystal: 10, dual }, spec: sp, mat: C.material, spStart: 0, spEnd: 6, n: 600, mainBangSP: -2 }); let m = 0; for (let i = 100; i < 300; i++) m = Math.max(m, Math.abs(s.re[i])); return m; };
  assert.ok(mb(true) < 0.1 * mb(false));
});
test('lintasan umum: tanpa pembelokan sama dengan mesin pelat; anisotropi membelokkan berkas di las', () => {
  const sp = weldFor({ scenario: 'lof-kiri', T: 20 });
  const sc = { points: sp.scene.points, corners: sp.scene.corners };
  const a = UT.simulate({ probe: { x: -60, y: 150, dir: 1, angle: 60, freq: 4, crystal: 10 }, mat: C.material, T: 20, scene: sc, grain: null, spStart: 20, spEnd: 100, n: 2000 });
  const b = UT.simulatePath({ probe: { freq: 4, crystal: 10, y: 150 }, mat: C.material, path: UT.tracePlate({ x0: -60, dir: 1, angle: 60, T: 20, spMax: 110 }), scene: sc, grain: null, spStart: 20, spEnd: 100, n: 2000 });
  near(peakOf(b).amp, peakOf(a).amp, 1e-4 * peakOf(a).amp + 1e-9);
  const p0 = UT.tracePlate({ x0: -18, dir: 1, angle: 60, T: 20, spMax: 60, weld: sp.weld, skew: 0 });
  const p1 = UT.tracePlate({ x0: -18, dir: 1, angle: 60, T: 20, spMax: 60, weld: sp.weld, skew: 18 });
  const e0 = UT.pathPoint(p0, 50), e1 = UT.pathPoint(p1, 50);
  assert.ok(Math.hypot(e0.x - e1.x, e0.z - e1.z) > 2, 'berkas bergeser');
});
test('pipa seam: batas sudut sin θ ≤ Ri/Ro, pemetaan anulus bolak-balik, lokasi dengan koreksi lengkung', () => {
  const Ro = 219.1 / 2, T = 20, aMax = Math.asin((Ro - T) / Ro) * 180 / Math.PI;
  assert.ok(UT.tracePipe({ Ro, T, x0: 0, dir: 1, angle: aMax - 2, spMax: 300 }).hitsID);
  assert.ok(!UT.tracePipe({ Ro, T, x0: 0, dir: 1, angle: aMax + 2, spMax: 300 }).hitsID);
  const q = UT.seamToUV(Ro, -25, 7), f = UT.seamFromUV(Ro, q.u, q.v);
  near(f.x, -25, 1e-9); near(f.z, 7, 1e-9);
  const p = UT.tracePipe({ Ro, T, x0: -40, dir: 1, angle: 45, spMax: 200 });
  const s1 = p.pts[1].s;
  const L = UT.locatePipe(s1, 45, Ro, T, -40, 1);
  near(L.depth, T, 1e-6, 'titik pantul pertama di dinding dalam');
  assert.ok(s1 > T / Math.cos(Math.PI / 4), 'SP ke dinding dalam lebih panjang dari pelat datar');
});
test('bahasa Inggris: setiap pelajaran punya terjemahan dengan jumlah langkah yang sama', () => {
  UT.LESSONS.forEach((l) => {
    const e = UT.LESSONS_EN[l.id];
    assert.ok(e, `terjemahan ${l.id}`);
    assert.strictEqual(e[2].length, l.steps.length, `jumlah langkah ${l.id}`);
    l.steps.forEach((s, i) => {
      if (s.hint) assert.ok(e[2][i][2], `petunjuk ${l.id}#${i}`);
      if (s.quiz) assert.ok(e[2][i][3], `kuis ${l.id}#${i}`);
    });
  });
});

console.log(`\n${passed} lulus, ${failed} gagal`);
process.exit(failed ? 1 : 0);
