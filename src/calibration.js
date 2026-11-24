/*
 * Kalibrasi probe & alat.
 *
 * Probe sungguhan tidak pernah persis sama dengan nilai nominalnya. Simulator menyimpan
 * "kebenaran tersembunyi" (truth) untuk setiap probe:
 *   - front : jarak exit point (probe index sebenarnya) ke muka depan wedge (mm)
 *   - angle : sudut berkas sebenarnya di baja (°)
 *   - zero  : waktu tempuh di dalam wedge, pulang-pergi (µs) – "probe delay"
 * Teknisi menentukannya lewat blok kalibrasi lalu memasukkan nilai terukur ke alat:
 *   X-value (mm), sudut terukur (°), zero (µs), velocity (m/s).
 * Semua pembacaan alat (SP, kedalaman, posisi) dihitung dari nilai yang dimasukkan teknisi,
 * sedangkan fisika memakai nilai sebenarnya.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});

  UT.PROBE_BODY = 32; // panjang wedge (mm) dari muka depan ke belakang
  UT.V_WEDGE = 2730; // kecepatan longitudinal perspex (m/s)
  const WEDGE_PATH = { 0: 1, 45: 12, 60: 15, 70: 18 }; // panjang lintasan di wedge (mm); 0° = pelat aus tipis

  /** Zero nominal (µs, pulang-pergi di wedge) untuk sudut probe. */
  UT.nominalZero = function (angle) {
    const L = WEDGE_PATH[angle] || 15;
    return (2 * L) / (UT.V_WEDGE / 1000);
  };

  /** Buat kebenaran probe. random = fungsi acak [0,1) atau null untuk probe ideal. */
  UT.makeProbeTruth = function (angle, random, opt) {
    // Probe lurus 0°: exit point di tengah badan probe
    const front = angle === 0 ? UT.PROBE_BODY / 2 : UT.CONFIG.wedge.front;
    // probe dual (TR): delay line perspex → zero jauh lebih besar
    const dual = angle === 0 && opt && opt.dual;
    const zero = dual ? (2 * (UT.DUAL ? UT.DUAL.delayPath : 9)) / (UT.V_WEDGE / 1000) : UT.nominalZero(angle);
    if (!random) return { front, angle, zero };
    const sym = () => random() * 2 - 1;
    if (angle === 0) {
      // probe lurus: sudut & exit point tetap, hanya zero (pelat aus/delay) yang tidak diketahui
      return { front, angle: 0, zero: Math.round((zero + random() * 0.8) * 100) / 100 };
    }
    return {
      front: Math.round((front + sym() * 2.5) * 10) / 10,
      angle: Math.round((angle + sym() * 2.2) * 10) / 10,
      zero: Math.round((zero + sym() * 1.6) * 100) / 100,
    };
  };

  /** Jarak exit point ke depan/belakang wedge untuk probe dengan kebenaran H. */
  UT.probeBody = (H) => ({ front: H.front, back: UT.PROBE_BODY - H.front });

  /**
   * Parameter pemetaan waktu: cal = { vTrue, vUser, zeroTrue, zeroUser } (m/s, µs).
   * Alat mengukur waktu t sejak pulsa; SP tampilan = (t − zeroUser)·vUser/2.
   */
  UT.spTrueFromUser = function (spU, cal) {
    const t = (2 * spU) / (cal.vUser / 1000) + cal.zeroUser;
    return ((t - cal.zeroTrue) * (cal.vTrue / 1000)) / 2;
  };
  UT.spUserFromTrue = function (spT, cal) {
    const t = (2 * spT) / (cal.vTrue / 1000) + cal.zeroTrue;
    return ((t - cal.zeroUser) * (cal.vUser / 1000)) / 2;
  };
  /** Posisi pulsa awal (t = 0) dalam SP baja sebenarnya (negatif = di dalam wedge). */
  UT.mainBangSP = (cal) => (-cal.zeroTrue * (cal.vTrue / 1000)) / 2;

  /** Posisi muka depan wedge dan tanda index menurut teknisi (X-value). */
  UT.probeFrontX = (probeX, dir, H) => probeX + dir * H.front;
  UT.userIndexX = (probeX, dir, H, xValue) => UT.probeFrontX(probeX, dir, H) - dir * xValue;

  /** Apakah nilai alat sudah cocok dengan kebenaran probe (dalam toleransi praktis). */
  UT.calibrationStatus = function (H, user, vTrue) {
    if (H.angle === 0) {
      // probe lurus: hanya zero & velocity yang perlu dikalibrasi (dari echo back wall)
      const items0 = [
        { key: 'zero', ok: Math.abs(user.zero - H.zero) * (vTrue / 2000) <= 0.6 },
        { key: 'velocity', ok: Math.abs(user.velocity - vTrue) / vTrue <= 0.01 },
      ];
      return { ok: items0.every((i) => i.ok), items: items0 };
    }
    const items = [
      { key: 'X-value', ok: Math.abs(user.xValue - H.front) <= 1.0 },
      { key: 'sudut', ok: Math.abs(user.angle - H.angle) <= 1.5 }, // pembacaan skala blok ±1,5° (toleransi cek sudut umumnya ±2°)
      { key: 'zero', ok: Math.abs(user.zero - H.zero) * (vTrue / 2000) <= 0.6 },
      { key: 'velocity', ok: Math.abs(user.velocity - vTrue) / vTrue <= 0.01 },
    ];
    return { ok: items.every((i) => i.ok), items };
  };
})(typeof window !== 'undefined' ? window : globalThis);
