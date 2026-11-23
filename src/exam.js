/*
 * Ujian: pembuatan soal acak, DAC otomatis, dan penilaian laporan siswa.
 * Semua fungsi murni (tanpa DOM) sehingga bisa diuji di Node.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});
  const DEG = Math.PI / 180;

  UT.EXAM_LEVELS = [
    { id: 'mudah', name: 'Mudah', count: 1, training: false, autoDac: true,
      desc: '1 cacat · probe ideal (terkalibrasi) · DAC sudah disediakan.' },
    { id: 'sedang', name: 'Sedang', count: 2, training: false, autoDac: false,
      desc: '2 cacat · probe ideal · buat DAC sendiri di blok kalibrasi ASME.' },
    { id: 'sulit', name: 'Sulit', count: 3, training: true, autoDac: false,
      desc: '3 cacat · probe harus dikalibrasi di blok IIW · buat DAC sendiri.' },
  ];

  /** Parameter soal dari kode (seed) dan tingkat kesulitan. */
  UT.makeExam = function (seed, levelId) {
    const level = UT.EXAM_LEVELS.find((l) => l.id === levelId) || UT.EXAM_LEVELS[0];
    const rnd = UT.rng((seed * 7919) ^ 0xa5a5);
    const thicknesses = [12, 16, 20, 25];
    const T = thicknesses[Math.floor(rnd() * thicknesses.length)];
    return { seed, level, T, count: level.count };
  };

  /** Kode soal acak 4–5 digit. */
  UT.randomExamCode = (rnd) => 1000 + Math.floor((rnd ? rnd() : Math.random()) * 89000);

  /**
   * DAC otomatis: simulasikan pencarian echo maksimum setiap SDH pada blok kalibrasi ASME
   * (¼T, ½T, ¾T lewat leg 1, lalu ¾T, ½T, ¼T lewat leg 2) seperti yang dilakukan teknisi.
   * p = { T, H (kebenaran probe), freq, crystal, cal } → array titik { sp (SP alat), db }.
   */
  UT.autoDac = function (p) {
    const C = UT.CONFIG;
    const spec = UT.buildSpecimen({ specimen: 'asme', T: p.T });
    const scene = { points: spec.scene.points, corners: [] };
    const th = p.H.angle * DEG;
    const body = UT.probeBody(p.H);
    const lim = UT.specimenProbeLimits(spec, 1, body);
    const holes = spec.holes;
    // leg 1: ¼T, ½T, ¾T · leg 2: 5/4T, 6/4T, 7/4T · leg 3: lubang yang masih terjangkau di blok
    const targets = [];
    holes.forEach((h) => targets.push({ h, zu: h.z }));
    holes.slice().reverse().forEach((h) => targets.push({ h, zu: 2 * p.T - h.z }));
    holes.forEach((h) => targets.push({ h, zu: 2 * p.T + h.z }));
    const pts = [];
    targets.forEach(({ h, zu }) => {
      const r0 = zu / Math.cos(th);
      const x0 = h.x - zu * Math.tan(th);
      if (x0 - 2 < lim.min || x0 + 2 > lim.max) return; // posisi probe di luar blok
      let best = { amp: 0 };
      for (let x = x0 - 6; x <= x0 + 6; x += 0.25) {
        if (x < lim.min || x > lim.max) continue;
        const s = UT.simulate({
          probe: { x, dir: 1, angle: p.H.angle, freq: p.freq, crystal: p.crystal },
          mat: C.material, T: p.T, scene, grain: null, spStart: r0 - 4, spEnd: r0 + 4, n: 700,
        });
        for (let i = 0; i < s.n; i++) {
          const v = Math.abs(s.re[i]);
          if (v > best.amp) best = { amp: v, sp: s.spStart + (i * (s.spEnd - s.spStart)) / (s.n - 1) };
        }
      }
      if (best.amp > 0) {
        pts.push({ sp: UT.spUserFromTrue(best.sp, p.cal), db: 20 * Math.log10(best.amp * C.GAIN_K) });
      }
    });
    pts.sort((a, b) => a.sp - b.sp);
    return { points: pts };
  };

  // ------------------------------------------------------------------ penilaian
  const lin = (err, full, zero) => (err <= full ? 1 : err >= zero ? 0 : 1 - (err - full) / (zero - full));
  const distTo = (v, a, b) => (v == null || !isFinite(v) ? Infinity : v < a ? a - v : v > b ? v - b : 0);
  const PLANAR = { lof: true, ip: true, retak: true };

  UT.TYPE_NAMES = { lof: 'Lack of fusion', ip: 'Incomplete penetration', retak: 'Retak', slag: 'Slag inclusion', porositas: 'Porositas', lain: 'Lainnya' };

  /** Keputusan yang benar untuk satu cacat sebenarnya (ASME App. 12). */
  UT.expectedVerdict = function (truth, pctDAC, t) {
    if (PLANAR[truth.type]) return 'tolak';
    const ev = UT.evaluateASME({ pctDAC: pctDAC == null ? 101 : pctDAC, dacExists: true, type: truth.type, length: truth.y2 - truth.y1, t });
    return ev.verdict === 'tolak' ? 'tolak' : 'terima';
  };

  /**
   * Nilai laporan siswa terhadap cacat sebenarnya.
   * truth: [{type, y1, y2, z1, z2, x1, x2}]
   * reports: [{y1, y2, depth, x, pctDAC, type, verdict}]
   * Bobot per cacat: deteksi 40, lokasi 15, panjang 15, jenis 15, keputusan 15.
   * Setiap indikasi palsu (false call) mengurangi 10 poin dari nilai akhir.
   */
  UT.gradeExam = function (truth, reports, opt) {
    const t = opt.t;
    const ry = (r) => {
      const a = r.y1 != null ? r.y1 : r.y2, b = r.y2 != null ? r.y2 : r.y1;
      return a == null ? null : [Math.min(a, b), Math.max(a, b)];
    };
    // Pasangan kandidat berdasarkan tumpang-tindih rentang y (toleransi 5 mm)
    const pairs = [];
    truth.forEach((d, i) => reports.forEach((r, j) => {
      const yr = ry(r);
      if (!yr) return;
      const ov = Math.min(d.y2 + 5, yr[1] + 5) - Math.max(d.y1 - 5, yr[0] - 5);
      if (ov > 0) pairs.push({ i, j, ov });
    }));
    pairs.sort((a, b) => b.ov - a.ov);
    const tUsed = new Set(), rUsed = new Set(), match = {};
    pairs.forEach((p) => {
      if (tUsed.has(p.i) || rUsed.has(p.j)) return;
      tUsed.add(p.i); rUsed.add(p.j); match[p.i] = p.j;
    });

    const perDefect = truth.map((d, i) => {
      const r = match[i] != null ? reports[match[i]] : null;
      const parts = { deteksi: 0, lokasi: 0, panjang: 0, jenis: 0, keputusan: 0 };
      const notes = [];
      if (r) {
        parts.deteksi = 40;
        const dErr = distTo(r.depth, d.z1, d.z2);
        const xErr = distTo(r.x, d.x1, d.x2);
        parts.lokasi = 15 * (0.5 * lin(dErr, 1.5, 6) + 0.5 * lin(xErr, 2, 8));
        if (dErr > 1.5) notes.push(`kedalaman meleset ${isFinite(dErr) ? dErr.toFixed(1) + ' mm' : '(kosong)'}`);
        if (xErr > 2) notes.push(`posisi melintang meleset ${isFinite(xErr) ? xErr.toFixed(1) + ' mm' : '(kosong)'}`);
        const yr = ry(r);
        const endErr = (Math.abs(yr[0] - d.y1) + Math.abs(yr[1] - d.y2)) / 2;
        parts.panjang = 15 * lin(endErr, 4, 20);
        if (endErr > 4) notes.push(`ujung-ujung meleset rata-rata ${endErr.toFixed(1)} mm`);
        if (r.type === d.type) parts.jenis = 15;
        else {
          if (!!PLANAR[r.type] === !!PLANAR[d.type] && r.type !== 'lain') parts.jenis = 6;
          notes.push(`jenis sebenarnya: ${UT.TYPE_NAMES[d.type]}`);
        }
        const exp = UT.expectedVerdict(d, r.pctDAC, t);
        if (r.verdict === exp) parts.keputusan = 15;
        else notes.push(`keputusan seharusnya: ${exp === 'tolak' ? 'ditolak' : 'diterima'}`);
      } else {
        notes.push('tidak dilaporkan (terlewat)');
      }
      const total = Object.values(parts).reduce((a, b) => a + b, 0);
      return { truth: d, report: r, reportIndex: match[i] != null ? match[i] : null, parts, total, notes };
    });
    const falseCalls = reports.map((r, j) => ({ r, j })).filter((o) => !rUsed.has(o.j));
    const base = truth.length ? perDefect.reduce((a, p) => a + p.total, 0) / truth.length : 100;
    const penalty = 10 * falseCalls.length;
    const score = Math.max(0, Math.min(100, base - penalty));
    return { score, base, penalty, perDefect, falseCalls };
  };
})(typeof window !== 'undefined' ? window : globalThis);
