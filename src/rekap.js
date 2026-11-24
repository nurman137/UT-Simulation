/*
 * Rekap nilai kelas: file hasil ujian, penilaian ulang, statistik, dan ekspor CSV.
 *
 * Siswa mengunduh file hasil (.json, juga tertanam di laporan .html). Instruktur mengimpor
 * banyak file sekaligus. Nilai selalu DIHITUNG ULANG dari kode soal + laporan indikasi siswa,
 * sehingga perubahan angka nilai di dalam file akan terdeteksi ("berbeda").
 * Catatan: ini bukan sistem anti-curang; isi laporan indikasi tetap bisa diubah.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});

  UT.RESULT_TYPE = 'ut-simulator/hasil-ujian';

  const num = (v) => (v == null || v === '' || !isFinite(+v) ? null : Math.round(+v * 100) / 100);
  const ROW_TYPES = ['retak', 'lof', 'ip', 'slag', 'porositas', 'undercut', 'lain'];

  /** Bersihkan baris laporan agar hanya berisi field yang dikenal. */
  function cleanRows(rows) {
    return (Array.isArray(rows) ? rows : []).slice(0, 50).map((r) => ({
      y1: num(r.y1), y2: num(r.y2), depth: num(r.depth), x: num(r.x), pctDAC: num(r.pctDAC),
      type: ROW_TYPES.includes(r.type) ? r.type : 'lain',
      verdict: r.verdict === 'tolak' ? 'tolak' : 'terima',
      note: String(r.note == null ? '' : r.note).slice(0, 120),
    }));
  }

  /** Data proses ujian praktik (kalibrasi, DAC, gain) yang sudah dibersihkan, atau null. */
  function cleanProcess(p) {
    if (!p || typeof p !== 'object' || !p.H || !p.user) return null;
    const n = (v, d) => (isFinite(+v) ? +v : d);
    return {
      H: { front: n(p.H.front, 10), angle: n(p.H.angle, 60), zero: n(p.H.zero, 0) },
      user: { xValue: n(p.user.xValue, 10), angle: n(p.user.angle, 60), zero: n(p.user.zero, 0), velocity: n(p.user.velocity, 3240) },
      vTrue: n(p.vTrue, 3240),
      dacPoints: (Array.isArray(p.dacPoints) ? p.dacPoints : []).slice(0, 30).filter((q) => isFinite(+q.sp) && isFinite(+q.db)).map((q) => ({ sp: +q.sp, db: +q.db })),
      gain: n(p.gain, null), freq: n(p.freq, 4), crystal: n(p.crystal, 10),
    };
  }

  /** Buat catatan hasil ujian untuk diunduh siswa. */
  UT.buildResultRecord = function (o) {
    return {
      app: 'ut-simulator',
      type: UT.RESULT_TYPE,
      version: UT.CONFIG.version,
      student: String(o.student || '').slice(0, 60),
      code: o.code,
      level: o.levelId,
      gen: o.gen || 2,
      T: o.T,
      date: o.date,
      elapsedMs: Math.round(o.elapsedMs || 0),
      score: Math.round(o.result.score * 10) / 10,
      rows: cleanRows(o.rows),
      process: cleanProcess(o.process),
    };
  };

  /** JSON aman untuk disisipkan di dalam <script> pada laporan HTML. */
  UT.recordForHTML = (rec) => JSON.stringify(rec).replace(/</g, '\\u003c');

  /** Baca file hasil: JSON langsung, atau laporan HTML yang memuat <script id="ut-result">. */
  UT.parseResultFile = function (text) {
    let obj;
    const t = String(text).trim();
    if (t.startsWith('{')) obj = JSON.parse(t);
    else {
      const m = t.match(/<script[^>]*id=["']ut-result["'][^>]*>([\s\S]*?)<\/script>/i);
      if (!m) throw new Error('bukan file hasil ujian simulator');
      obj = JSON.parse(m[1]);
    }
    if (!obj || obj.type !== UT.RESULT_TYPE) throw new Error('format file tidak dikenali');
    const code = Math.round(+obj.code);
    if (!(code >= 1)) throw new Error('kode soal tidak valid');
    if (!UT.EXAM_LEVELS.some((l) => l.id === obj.level)) throw new Error('tingkat ujian tidak valid');
    return {
      app: 'ut-simulator', type: UT.RESULT_TYPE, version: String(obj.version || ''),
      student: String(obj.student || '').slice(0, 60), code, level: obj.level,
      gen: obj.gen === 2 ? 2 : 1, // file tanpa 'gen' berasal dari v0.3–v0.5
      T: num(obj.T), date: String(obj.date || '').slice(0, 40), elapsedMs: Math.max(0, +obj.elapsedMs || 0),
      score: num(obj.score), rows: cleanRows(obj.rows), process: cleanProcess(obj.process),
    };
  };

  /** Cacat sebenarnya untuk satu kode soal + tingkat (sama persis dengan soal yang dikerjakan). */
  UT.examTruth = function (code, levelId, gen) {
    const ex = UT.makeExam(code, levelId);
    const S = Object.assign({}, UT.CONFIG.defaults, {
      specimen: 'las', T: ex.T, scenario: 'acak', randSeed: code, randCount: ex.count,
      bevelType: 'V', geom: 'pelat', bevelHalf: 30, rootGap: 2, cap: true, rootBead: true, randGen: gen || 2,
    });
    return { ex, truth: UT.buildSpecimen(S).scene.truth };
  };

  /** Nilai ulang sebuah catatan hasil dari laporan indikasinya. */
  UT.regradeRecord = function (rec) {
    const { ex, truth } = UT.examTruth(rec.code, rec.level, rec.gen || 1);
    const res = UT.gradeExam(truth, rec.rows, { t: ex.T });
    if (ex.level.process) {
      const proc = rec.process ? UT.gradeProcess(Object.assign({ T: ex.T }, rec.process)) : { score: 0, parts: { kalibrasi: 0, dac: 0, gain: 0 }, notes: ['data proses tidak ada'] };
      res.reportScore = res.score;
      res.process = proc;
      res.score = UT.combineScore({ score: res.reportScore }, proc);
    }
    const claimed = rec.score;
    const status = claimed == null ? 'tanpa nilai' : Math.abs(claimed - res.score) <= 0.6 ? 'cocok' : 'berbeda';
    return { result: res, status, T: ex.T, level: ex.level };
  };

  const median = (a) => {
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x - y), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  /** Statistik kelas dari daftar entri { rec, regrade }. */
  UT.summarizeClass = function (entries) {
    const scores = entries.map((e) => e.regrade.result.score);
    const byType = {};
    let found = 0, total = 0, falseCalls = 0;
    entries.forEach((e) => {
      e.regrade.result.perDefect.forEach((p) => {
        const t = p.truth.type;
        byType[t] = byType[t] || { found: 0, total: 0 };
        byType[t].total++;
        total++;
        if (p.report) { byType[t].found++; found++; }
      });
      falseCalls += e.regrade.result.falseCalls.length;
    });
    return {
      n: entries.length,
      mean: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      median: median(scores),
      min: scores.length ? Math.min(...scores) : null,
      max: scores.length ? Math.max(...scores) : null,
      found, total, falseCalls, byType,
      changed: entries.filter((e) => e.regrade.status === 'berbeda').length,
    };
  };

  const fmtTime = (ms) => {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  UT.fmtElapsed = fmtTime;

  /** CSV (pemisah ';' agar langsung terbuka benar di Excel berbahasa Indonesia), dengan BOM UTF-8. */
  UT.classCSV = function (entries) {
    const q = (v) => {
      const s = String(v == null ? '' : v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ['Nama', 'Kode soal', 'Tingkat', 'Nilai (dihitung ulang)', 'Nilai di file', 'Status', 'Cacat ditemukan', 'Jumlah cacat', 'Indikasi palsu', 'Waktu', 'Tanggal'];
    const lines = [head.join(';')];
    entries.forEach((e) => {
      const r = e.regrade.result;
      lines.push([
        e.rec.student, e.rec.code, e.regrade.level.name, Math.round(r.score), e.rec.score == null ? '' : Math.round(e.rec.score),
        e.regrade.status, r.perDefect.filter((p) => p.report).length, r.perDefect.length, r.falseCalls.length,
        fmtTime(e.rec.elapsedMs), e.rec.date,
      ].map(q).join(';'));
    });
    return '﻿' + lines.join('\r\n') + '\r\n';
  };

  /** Kunci unik untuk menghindari impor ganda. */
  UT.recordKey = (rec) => [rec.student, rec.code, rec.level, rec.gen, rec.date, rec.elapsedMs].join('|');
})(typeof window !== 'undefined' ? window : globalThis);
