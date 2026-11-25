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
    { id: 'praktik', name: 'Praktik lengkap', count: 2, training: true, autoDac: false, process: true,
      desc: '2 cacat · alur lengkap seperti ujian praktik: kalibrasi probe, DAC, gain scanning, scan, laporan. Proses ikut dinilai (30%).' },
  ];

  /** Probe ujian praktik: galat tersembunyi ditentukan oleh kode soal (bisa dinilai ulang). */
  UT.examProbeTruth = (code, angle) => UT.makeProbeTruth(angle || 60, UT.rng((code * 104729) ^ 0x3c3c));

  /**
   * Nilai proses ujian praktik (0–100):
   *   kalibrasi 40 (X-value, sudut, zero, velocity @10), DAC 40 (jumlah titik 10, ketepatan 30),
   *   gain scanning 20 (reference level DAC sebenarnya + 6 dB).
   * o: { H, user:{xValue, angle, zero, velocity}, vTrue, dacPoints, gain, T, freq, crystal, trueDac? }
   */
  UT.gradeProcess = function (o) {
    const H = o.H, u = o.user, notes = [];
    const parts = { kalibrasi: 0, dac: 0, gain: 0 };
    const ex = Math.abs(u.xValue - H.front), ea = Math.abs(u.angle - H.angle);
    const ez = Math.abs(u.zero - H.zero) * (o.vTrue / 2000), ev = Math.abs(u.velocity - o.vTrue) / o.vTrue;
    const k = [lin(ex, 1, 4), lin(ea, 1.5, 5), lin(ez, 0.6, 3), lin(ev, 0.01, 0.05)];
    if (H.angle === 0) { k[0] = 1; k[1] = 1; }
    parts.kalibrasi = 10 * (k[0] + k[1] + k[2] + k[3]);
    if (k[0] < 1) notes.push(`X-value ${u.xValue} (sebenarnya ${H.front})`);
    if (k[1] < 1) notes.push(`sudut ${u.angle}° (sebenarnya ${H.angle}°)`);
    if (k[2] < 1) notes.push(`zero meleset ≈ ${ez.toFixed(1)} mm SP`);
    if (k[3] < 1) notes.push(`velocity ${u.velocity} m/s (sebenarnya ${o.vTrue})`);
    const cal = { vTrue: o.vTrue, vUser: u.velocity, zeroTrue: H.zero, zeroUser: u.zero };
    const trueDac = o.trueDac || UT.autoDac({ T: o.T, H, freq: o.freq, crystal: o.crystal, cal });
    const user = { points: (o.dacPoints || []).slice().sort((a, b) => a.sp - b.sp) };
    const n = user.points.length;
    let acc = 0;
    if (n >= 2 && trueDac.points.length) {
      let sum = 0, cnt = 0;
      trueDac.points.forEach((p) => {
        const a = UT.dacAt(user, p.sp, 0);
        if (a == null) return; // hanya dinilai di rentang DAC siswa
        sum += Math.abs(20 * Math.log10(a) - p.db);
        cnt++;
      });
      const covered = cnt / trueDac.points.length;
      const err = cnt ? sum / cnt : 99;
      acc = lin(err, 1.5, 6) * Math.min(1, covered / 0.6);
      if (err > 1.5) notes.push(`kurva DAC meleset rata-rata ${err.toFixed(1)} dB`);
      if (covered < 0.6) notes.push('DAC tidak mencakup rentang leg 1–2');
    } else notes.push('DAC tidak dibuat (minimal 2 titik)');
    parts.dac = 10 * Math.min(1, n / 3) + 30 * acc;
    const ref = UT.dacRefGain(trueDac);
    if (ref != null && o.gain != null) {
      const eg = Math.abs(o.gain - (ref + 6));
      parts.gain = 20 * lin(eg, 1.5, 6);
      if (eg > 1.5) notes.push(`gain scanning ${o.gain} dB (seharusnya ≈ ${(ref + 6).toFixed(1)} dB)`);
    }
    const score = parts.kalibrasi + parts.dac + parts.gain;
    return { score, parts, notes };
  };

  /** Nilai akhir ujian praktik: 70% laporan + 30% proses. */
  UT.combineScore = (report, proc) => (proc ? 0.7 * report.score + 0.3 * proc.score : report.score);

  /** Parameter soal dari kode (seed) dan tingkat kesulitan. */
  UT.EXAM_SPECIMENS = [
    { id: 'pelat', name: 'Pelat las' },
    { id: 'girth', name: 'Pipa – las girth' },
    { id: 'seam', name: 'Pipa – las memanjang (seam)' },
    { id: 'tubular', name: 'Sambungan tubular T/Y/K/X' },
  ];

  /**
   * Parameter soal dari kode (seed), tingkat, dan pengaturan instruktur.
   * opts: { specimen: 'pelat'|'girth'|'seam'|'tubular', count, minutes, custom: [defs] | null }
   * Kode lama (tanpa opts) menghasilkan soal pelat yang sama seperti sebelumnya.
   */
  UT.makeExam = function (seed, levelId, opts) {
    const o = opts || {};
    const level = UT.EXAM_LEVELS.find((l) => l.id === levelId) || UT.EXAM_LEVELS[0];
    const rnd = UT.rng((seed * 7919) ^ 0xa5a5);
    const thicknesses = [12, 16, 20, 25];
    const T = thicknesses[Math.floor(rnd() * thicknesses.length)];
    const specimen = UT.EXAM_SPECIMENS.some((s) => s.id === o.specimen) ? o.specimen : 'pelat';
    const custom = specimen === 'pelat' && o.custom && o.custom.length ? UT.cleanCustom(o.custom) : null;
    const count = custom ? custom.length : Math.max(1, Math.min(4, o.count || level.count));
    const ex = { seed, level, T, count, specimen, minutes: Math.max(0, Math.min(240, +o.minutes || 0)), custom };
    if (specimen === 'girth' || specimen === 'seam') {
      ex.OD = [168.3, 219.1, 323.9][Math.floor(rnd() * 3)];
      ex.T = ex.OD < 200 ? Math.min(T, 12) : Math.min(T, 20);
    }
    if (specimen === 'tubular') {
      ex.tubType = ['T', 'Y', 'K', 'X'][Math.floor(rnd() * 4)];
      ex.tubTheta = ex.tubType === 'T' ? 90 : [45, 60][Math.floor(rnd() * 2)];
      ex.tubTb = [10, 12][Math.floor(rnd() * 2)];
      ex.T = ex.tubTb;
    }
    return ex;
  };

  /** Pengaturan state benda uji untuk soal (dipakai saat ujian dimulai dan saat dinilai ulang). */
  UT.examState = function (ex) {
    const base = { bevelType: 'V', bevelHalf: 30, rootGap: 2, rootFace: 1.5, cap: true, rootBead: true, randGen: 2, seam: false, geom: 'pelat' };
    if (ex.specimen === 'tubular') {
      return Object.assign(base, { specimen: 'tubular', tubType: ex.tubType, tubTheta: ex.tubTheta, tubD: 323.9, tubTc: 16, tubd: 168.3,
        tubTb: ex.tubTb, tubGap: 25, tubScenario: 'acak', tubSeed: ex.seed, tubCount: ex.count, T: ex.tubTb });
    }
    return Object.assign(base, {
      specimen: 'las', T: ex.T, scenario: ex.custom ? 'kustom' : 'acak', custom: ex.custom || [], randSeed: ex.seed, randCount: ex.count,
      geom: ex.specimen === 'pelat' ? 'pelat' : 'pipa', OD: ex.OD || 168.3, seam: ex.specimen === 'seam',
    });
  };

  /** Kode paket ujian (UTX1:…) berisi kode soal + pengaturan instruktur, untuk dibagikan ke siswa. */
  UT.examPackCode = function (p) {
    const o = { c: p.code, l: p.level, s: p.specimen || 'pelat', n: p.count || 0, m: p.minutes || 0 };
    if (p.custom && p.custom.length) o.k = UT.customToCode(p.custom);
    const json = JSON.stringify(o);
    return 'UTX1:' + (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, 'utf8').toString('base64'));
  };
  UT.examPackFrom = function (code) {
    const m = String(code || '').trim().match(/^UTX1:([A-Za-z0-9+/=]+)$/);
    if (!m) throw new Error('kode paket ujian tidak dikenali');
    const o = JSON.parse(typeof atob === 'function' ? decodeURIComponent(escape(atob(m[1]))) : Buffer.from(m[1], 'base64').toString('utf8'));
    return {
      code: Math.max(1, Math.round(+o.c) || 1), level: UT.EXAM_LEVELS.some((l) => l.id === o.l) ? o.l : 'mudah',
      specimen: UT.EXAM_SPECIMENS.some((s) => s.id === o.s) ? o.s : 'pelat', count: +o.n || 0, minutes: +o.m || 0,
      custom: o.k ? UT.customFromCode(o.k) : null,
    };
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

  UT.TYPE_NAMES = { lof: 'Lack of fusion', ip: 'Incomplete penetration', retak: 'Retak', slag: 'Slag inclusion', porositas: 'Porositas', undercut: 'Undercut', lain: 'Lainnya' };

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
