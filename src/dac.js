/*
 * DAC (Distance Amplitude Correction) dan evaluasi indikasi menurut ASME.
 *
 * Titik DAC disimpan sebagai amplitudo ternormalisasi gain:  dB = 20·log10(amp%) − gain,
 * sehingga kurva bisa digambar ulang pada gain berapa pun:  amp% = 10^((dB + gain)/20).
 * Primary reference level = gain yang membuat titik DAC tertinggi berada di 80% FSH.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});

  UT.dacCreate = () => ({ points: [] });

  /** Rekam titik DAC dari puncak echo (SP tampilan, amplitudo %FSH, gain dB). */
  UT.dacAdd = function (dac, sp, ampPct, gain) {
    if (!(ampPct > 0) || !isFinite(sp)) return false;
    if (ampPct >= 100) return false; // titik jenuh tidak valid
    // titik pada SP yang hampir sama → ganti
    dac.points = dac.points.filter((p) => Math.abs(p.sp - sp) > 1.5);
    dac.points.push({ sp, db: 20 * Math.log10(ampPct) - gain });
    dac.points.sort((a, b) => a.sp - b.sp);
    return true;
  };

  /** Gain primary reference level (titik tertinggi = 80% FSH). */
  UT.dacRefGain = function (dac) {
    if (!dac.points.length) return null;
    const maxDb = Math.max(...dac.points.map((p) => p.db));
    return 20 * Math.log10(80) - maxDb;
  };

  /**
   * Amplitudo kurva DAC (100%) pada SP tertentu dan gain tertentu (%FSH).
   * Interpolasi linear antar titik; di luar rentang titik terekam → null (tidak diekstrapolasi).
   */
  UT.dacAt = function (dac, sp, gain) {
    const P = dac.points;
    if (P.length === 0) return null;
    const amp = (p) => Math.pow(10, (p.db + gain) / 20);
    if (P.length === 1) return Math.abs(sp - P[0].sp) < 1e-6 ? amp(P[0]) : null;
    if (sp < P[0].sp || sp > P[P.length - 1].sp) return null;
    for (let i = 1; i < P.length; i++) {
      if (sp <= P[i].sp) {
        const a = P[i - 1], b = P[i];
        const t = (sp - a.sp) / (b.sp - a.sp);
        return amp(a) + t * (amp(b) - amp(a));
      }
    }
    return null;
  };

  /**
   * Faktor TCG (Time Corrected Gain) untuk SP tertentu: penguatan tambahan agar reflektor
   * referensi (SDH) tampil 80% FSH pada reference level di jarak mana pun.
   * Di luar rentang titik DAC, faktor ujung terdekat dipakai.
   */
  UT.tcgFactor = function (dac, sp) {
    const P = dac.points;
    if (!P.length) return 1;
    const ref = UT.dacRefGain(dac);
    const s = Math.min(P[P.length - 1].sp, Math.max(P[0].sp, sp));
    const a = P.length === 1 ? Math.pow(10, (P[0].db + ref) / 20) : UT.dacAt(dac, s, ref);
    return a > 0 ? 80 / a : 1;
  };

  /** Tinggi garis referensi TCG (%FSH) pada gain tertentu (datar = 80% pada reference level). */
  UT.tcgLevel = (dac, gain) => 80 * Math.pow(10, (gain - UT.dacRefGain(dac)) / 20);

  /** Batas panjang indikasi non-planar yang melebihi reference level (ASME Sec. VIII Div. 1 App. 12). */
  UT.asmeLengthLimit = function (t) {
    if (t <= 19) return 6;
    if (t <= 57) return t / 3;
    return 19;
  };

  UT.INDICATION_TYPES = [
    { id: 'retak', name: 'Retak (crack)', planar: true },
    { id: 'lof', name: 'Lack of fusion', planar: true },
    { id: 'ip', name: 'Incomplete penetration', planar: true },
    { id: 'slag', name: 'Slag inclusion', planar: false },
    { id: 'porositas', name: 'Porositas', planar: false },
    { id: 'undercut', name: 'Undercut', planar: false },
    { id: 'lain', name: 'Lainnya / belum diketahui', planar: false },
  ];

  /**
   * Evaluasi indikasi (ASME Sec. VIII Div. 1 Mandatory App. 12).
   * in: { pctDAC, type, length (mm atau null), t (tebal, mm) }
   * out: { verdict: 'abaikan'|'terima'|'tolak'|'ukur'|'nodac', text }
   */
  UT.evaluateASME = function (inp) {
    const { pctDAC, type, length, t } = inp;
    if (pctDAC == null && inp.dacExists) {
      return { verdict: 'nodac', text: 'SP echo di luar rentang DAC. Rekam titik DAC sampai SP ini (mis. SDH lewat leg 2: 5/4T, 7/4T). DAC tidak boleh diekstrapolasi.' };
    }
    if (pctDAC == null) return { verdict: 'nodac', text: 'Belum ada DAC – buat DAC di blok kalibrasi dasar ASME.' };
    if (pctDAC < 20) return { verdict: 'abaikan', text: 'Di bawah 20% DAC: tidak perlu diselidiki.' };
    const ty = UT.INDICATION_TYPES.find((x) => x.id === type) || UT.INDICATION_TYPES.find((x) => x.id === 'lain');
    if (ty.planar) {
      return { verdict: 'tolak', text: `${ty.name}: tidak dapat diterima berapa pun panjangnya.` };
    }
    if (pctDAC <= 100) {
      return { verdict: 'terima', text: '≥ 20% DAC tetapi tidak melebihi reference level: selidiki jenisnya, dapat diterima.' };
    }
    const lim = UT.asmeLengthLimit(t);
    if (length == null) {
      return { verdict: 'ukur', text: `Melebihi reference level: ukur panjang (6 dB drop). Batas panjang untuk t = ${t} mm adalah ${lim.toFixed(1)} mm.` };
    }
    if (length > lim) {
      return { verdict: 'tolak', text: `Panjang ${length.toFixed(1)} mm > batas ${lim.toFixed(1)} mm (t = ${t} mm): tidak dapat diterima.` };
    }
    return { verdict: 'terima', text: `Panjang ${length.toFixed(1)} mm ≤ batas ${lim.toFixed(1)} mm (t = ${t} mm): dapat diterima.` };
  };

  // ------------------------------------------------------------------ AWS D1.1 (struktur baja, beban statis)
  /**
   * Rating indikasi AWS D1.1: d = a − b − c (dB)
   *   a = gain saat puncak indikasi tepat di garis referensi
   *   b = gain saat puncak lubang Ø1,5 mm (0,06 in) blok IIW tepat di garis referensi
   *   c = faktor atenuasi = 2 dB per inci SP setelah inci pertama (dibulatkan ke dB terdekat)
   * Batas kelas (tabel kriteria UT, bangunan beban statis) per rentang tebal & sudut probe:
   *   [batas atas kelas A, batas atas kelas B, batas atas kelas C]; di atasnya kelas D.
   * PENTING: tabel ini disusun untuk edukasi – cocokkan dengan edisi AWS D1.1 yang berlaku sebelum dipakai.
   */
  UT.AWS = {
    refLine: 50, // tinggi garis referensi (%FSH)
    // Tabel 8.2 (statis) – disusun dari ingatan, BELUM diverifikasi terhadap dokumen
    table: [
      { tMin: 8, tMax: 20, cls: { 70: [5, 6, 7] } },
      { tMin: 20, tMax: 38, cls: { 70: [2, 3, 4] } },
      { tMin: 38, tMax: 65, cls: { 70: [-2, 0, 2], 60: [1, 3, 5], 45: [3, 5, 7] } },
    ],
    // Tabel 8.3 AWS D1.1/D1.1M:2025 – sambungan nontubular beban siklik (tarik). [batas A, batas B, batas C]
    tableCyclic: [
      { tMin: 8, tMax: 20, cls: { 70: [10, 11, 12] } },
      { tMin: 20, tMax: 38, cls: { 70: [8, 9, 10] } },
      { tMin: 38, tMax: 65, cls: { 70: [4, 6, 8], 60: [7, 9, 11], 45: [9, 11, 13] } },
      { tMin: 65, tMax: 100, cls: { 70: [1, 3, 5], 60: [4, 6, 8], 45: [6, 8, 10] } },
      { tMin: 100, tMax: 200, cls: { 70: [-2, 0, 2], 60: [1, 3, 5], 45: [3, 5, 7] } },
    ],
    lenB: 20, // 3/4 in [20 mm]
    lenC: 50, // 2 in [50 mm] (setengah tebal bagian tengah)
    // Scanning level (dB di atas zero reference) menurut sound path – Tabel 8.3
    scanLevels: [[65, 20], [125, 25], [250, 35], [380, 45]],
  };

  /** Scanning level AWS (dB di atas zero reference b) untuk SP (mm). */
  UT.awsScanLevel = function (sp) {
    const r = UT.AWS.scanLevels.find((x) => sp <= x[0]);
    return r ? r[1] : null;
  };

  /** Faktor atenuasi c (dB) dari SP (mm). */
  UT.awsAttenuation = (spMm) => Math.max(0, Math.round(2 * (spMm / 25.4 - 1)));

  /** Gain ternormalisasi: gain yang membuat amplitudo amp% tepat di garis referensi. */
  UT.awsGainAtRef = (gain, ampPct) => gain - 20 * Math.log10(ampPct / UT.AWS.refLine);

  /**
   * Evaluasi AWS D1.1. in: { a, b, sp, t, angle, length (mm|null), depth (mm|null) }
   * out: { verdict, d, c, cls, text }
   */
  UT.evaluateAWS = function (inp) {
    const A = UT.AWS;
    if (inp.b == null) return { verdict: 'nodac', text: 'Belum ada reference level b. Rekam echo lubang Ø1,5 mm pada blok IIW V1 (sisi B) di kartu DAC.' };
    const tab = inp.cyclic ? A.tableCyclic : A.table;
    const row = tab.find((r) => inp.t >= r.tMin && inp.t <= r.tMax) || null;
    const th = row && row.cls[Math.round(inp.angle)];
    const c = UT.awsAttenuation(inp.sp);
    const d = Math.round(inp.a - inp.b - c);
    const base = { d, c };
    if (!row) return Object.assign(base, { verdict: 'nodac', text: `Tebal ${inp.t} mm di luar rentang tabel (${tab[0].tMin}–${tab[tab.length - 1].tMax} mm).` });
    if (!th) {
      const ok = Object.keys(row.cls).map((x) => x + '°').join('/');
      return Object.assign(base, { verdict: 'nodac', text: `Untuk tebal ${inp.t} mm tabel AWS memakai probe ${ok}. Ganti sudut probe.` });
    }
    const cls = d <= th[0] ? 'A' : d <= th[1] ? 'B' : d <= th[2] ? 'C' : 'D';
    const desc = { A: 'diskontinuitas besar', B: 'diskontinuitas sedang', C: 'diskontinuitas kecil', D: 'diskontinuitas minor' }[cls];
    const pre = `d = a − b − c = ${inp.a.toFixed(1)} − ${inp.b.toFixed(1)} − ${c} ≈ ${d >= 0 ? '+' : ''}${d} dB → Kelas ${cls} (${desc}). `;
    Object.assign(base, { cls });
    if (cls === 'A') return Object.assign(base, { verdict: 'tolak', text: pre + 'Ditolak berapa pun panjangnya.' });
    if (cls === 'D') return Object.assign(base, { verdict: 'terima', text: pre + 'Dapat diterima berapa pun panjang dan lokasinya.' });
    let lim = A.lenB, where = '';
    if (cls === 'C') {
      const z = inp.depth;
      const mid = z != null && z >= inp.t / 4 && z <= (3 * inp.t) / 4;
      lim = mid ? A.lenC : A.lenB;
      where = z == null ? '' : mid ? ' (setengah tebal bagian tengah)' : ' (seperempat tebal atas/bawah)';
    }
    if (inp.length == null) return Object.assign(base, { verdict: 'ukur', text: pre + `Ukur panjang (6 dB drop): ditolak bila > ${lim} mm${where}.` });
    if (inp.length > lim) return Object.assign(base, { verdict: 'tolak', text: pre + `Panjang ${inp.length.toFixed(1)} mm > ${lim} mm${where}: ditolak.` });
    return Object.assign(base, { verdict: 'terima', text: pre + `Panjang ${inp.length.toFixed(1)} mm ≤ ${lim} mm${where}: dapat diterima (periksa juga jarak antar-indikasi).` });
  };

  /** Nama singkat acuan evaluasi. */
  UT.codeLabel = (c) => ({ asme: 'ASME', aws: 'AWS D1.1 (Tabel 8.2)', 'aws-cyc': 'AWS D1.1 (Tabel 8.3)', 'awsN-s': 'AWS D1.1 Annex N statis', 'awsN-c': 'AWS D1.1 Annex N siklik', awsR: 'AWS D1.1 Class R' }[c] || 'ASME');
  /** Nama lengkap acuan untuk laporan. */
  UT.codeFull = (c) => ({
    asme: 'ASME Sec. V Art. 4 / Sec. VIII Div. 1 App. 12',
    aws: 'AWS D1.1 Tabel 8.2 (nontubular, beban statis)',
    'aws-cyc': 'AWS D1.1:2025 Tabel 8.3 (nontubular, beban siklik, tarik)',
    'awsN-s': 'AWS D1.1:2025 Annex N, Tabel N.1 (beban statis)',
    'awsN-c': 'AWS D1.1:2025 Annex N, Tabel N.1 (beban siklik)',
    awsR: 'AWS D1.1:2025 10.26.1.1 tubular Class R (Gambar 10.23)',
  }[c] || 'ASME Sec. V Art. 4 / Sec. VIII Div. 1 App. 12');

  // ------------------------------------------------------------------ AWS D1.1 Annex N (SSL/DRL)
  /**
   * Annex N Tabel N.1: SSL = kurva referensi (simulator: DAC 100%), DRL = SSL − 6 dB.
   * in: { pctDAC, length, depth, t, cyclic } → { verdict, level, text }
   */
  UT.evaluateAWSN = function (inp) {
    const { pctDAC, length, depth, t } = inp;
    if (pctDAC == null) return { verdict: 'nodac', text: 'Belum ada kurva referensi (SSL). Buat DAC di blok kalibrasi; SSL = DAC 100%, DRL = SSL − 6 dB.' };
    const dB = 20 * Math.log10(pctDAC / 100);
    const dBt = `${dB >= 0 ? '+' : ''}${dB.toFixed(1)} dB terhadap SSL`;
    if (pctDAC <= 50) return { verdict: 'abaikan', level: 3, text: `Level 3 (≤ DRL, ${dBt}): abaikan.` };
    let lim, where = '';
    if (pctDAC >= 100) {
      if (dB > 5) return { verdict: 'tolak', level: 1, text: `Level 1, > 5 dB di atas SSL (${dBt}): tidak diizinkan.` };
      lim = inp.cyclic ? 12 : 20;
    } else if (inp.cyclic) {
      const mid = depth != null && depth >= t / 4 && depth <= (3 * t) / 4;
      lim = mid ? 50 : 20;
      where = depth == null ? '' : mid ? ' (setengah tebal bagian tengah)' : ' (seperempat tebal atas/bawah)';
    } else lim = 50;
    const lv = pctDAC >= 100 ? 1 : 2;
    const pre = `Level ${lv} (${dBt}): panjang maks. ${lim} mm${where}. `;
    if (length == null) return { verdict: 'ukur', level: lv, text: pre + 'Ukur panjang (6 dB drop).' };
    if (length > lim) return { verdict: 'tolak', level: lv, text: pre + `Panjang ${length.toFixed(1)} mm: ditolak.` };
    return { verdict: 'terima', level: lv, text: pre + `Panjang ${length.toFixed(1)} mm: dapat diterima.` };
  };

  // ------------------------------------------------------------------ AWS D1.1 tubular Class R (Gambar 10.23)
  const lerpT = (tw, t0, v0, t1, v1) => (tw <= t0 ? v0 : tw >= t1 ? v1 : v0 + ((v1 - v0) * (tw - t0)) / (t1 - t0));
  /**
   * Batas Class R menurut tebal las tw (mm), dibaca dari Gambar 10.23 AWS D1.1:2025:
   *   indivSSL   – panjang reflektor linear/planar internal di atas SSL (6 → 20 mm untuk tw 12 → 38)
   *   indivMinor – reflektor minor di atas DRL s.d. SSL (20 → 50 mm untuk tw 12 → 38)
   *   accumSSL / accumAll – panjang akumulasi pada panjang las yang dievaluasi (evalLen, ≤ D/2)
   */
  UT.classRLimits = function (tw, D) {
    const evalLen = Math.min(lerpT(tw, 12, 75, 50, 300), D ? D / 2 : Infinity);
    return {
      indivSSL: lerpT(tw, 12, 6, 38, 20),
      indivMinor: lerpT(tw, 12, 20, 38, 50),
      accumSSL: lerpT(tw, 12, 12, 50, 50),
      accumAll: lerpT(tw, 12, 22, 50, 100),
      evalLen,
    };
  };

  /** Evaluasi Class R. in: { pctDAC, length, type, t (tw), D } → { verdict, text } */
  UT.evaluateClassR = function (inp) {
    const { pctDAC, length, t } = inp;
    if (pctDAC == null) return { verdict: 'nodac', text: 'Belum ada standard sensitivity level (SSL). Buat DAC di blok kalibrasi; SSL = DAC 100%, DRL = SSL − 6 dB.' };
    if (pctDAC <= 50) return { verdict: 'abaikan', text: '≤ DRL (6 dB di bawah SSL): abaikan.' };
    const L = UT.classRLimits(t, inp.D);
    const acc = ` Akumulasi maks. ${L.accumSSL.toFixed(0)} mm (di atas SSL) / ${L.accumAll.toFixed(0)} mm (semua di atas DRL) per ${L.evalLen.toFixed(0)} mm las.`;
    if (inp.type === 'porositas' && pctDAC <= 100) {
      return { verdict: 'terima', text: 'Reflektor bulat terpisah s.d. SSL: dapat diterima bila jaraknya ≥ 25 mm dari reflektor lain; kluster > 1 per 645 mm² ditolak.' };
    }
    const above = pctDAC > 100;
    const lim = above ? L.indivSSL : L.indivMinor;
    const pre = `${above ? 'Di atas SSL' : 'Di antara DRL dan SSL'}: panjang maks. ${lim.toFixed(0)} mm (tw = ${t} mm).`;
    if (length == null) return { verdict: 'ukur', text: `${pre} Ukur panjang (6 dB drop).${acc}` };
    if (length > lim) return { verdict: 'tolak', text: `${pre} Panjang ${length.toFixed(1)} mm: ditolak.` };
    return { verdict: 'terima', text: `${pre} Panjang ${length.toFixed(1)} mm: dapat diterima.${acc}` };
  };
})(typeof window !== 'undefined' ? window : globalThis);
