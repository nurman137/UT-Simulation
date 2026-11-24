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
    table: [
      { tMin: 8, tMax: 20, cls: { 70: [5, 6, 7] } },
      { tMin: 20, tMax: 38, cls: { 70: [2, 3, 4] } },
      { tMin: 38, tMax: 65, cls: { 70: [-2, 0, 2], 60: [1, 3, 5], 45: [3, 5, 7] } },
    ],
    lenB: 19, // 3/4 in
    lenC: 50, // 2 in (setengah tebal bagian tengah)
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
    const row = A.table.find((r) => inp.t >= r.tMin && inp.t <= r.tMax) || null;
    const th = row && row.cls[Math.round(inp.angle)];
    const c = UT.awsAttenuation(inp.sp);
    const d = Math.round(inp.a - inp.b - c);
    const base = { d, c };
    if (!row) return Object.assign(base, { verdict: 'nodac', text: `Tebal ${inp.t} mm di luar rentang tabel simulator (8–65 mm).` });
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
})(typeof window !== 'undefined' ? window : globalThis);
