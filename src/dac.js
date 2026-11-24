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
})(typeof window !== 'undefined' ? window : globalThis);
