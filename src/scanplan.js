/*
 * Rencana scan & cakupan (seperti alat scan plan): bagian mana dari zona pemeriksaan
 * (logam las + HAZ) yang dilalui berkas −6 dB untuk kombinasi sudut, sisi probe,
 * rentang posisi probe, dan jumlah leg yang dipilih.
 * Fungsi murni (tanpa DOM) sehingga bisa diuji di Node.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});
  const DEG = Math.PI / 180;

  /** Jarak terdekat exit point ke sumbu las (wedge tidak boleh menabrak cap). */
  UT.minProbeDistance = function (w) {
    const front = UT.CONFIG.wedge.front;
    return (w.capH > 0 ? w.capHalf : 0) + front + 0.5;
  };

  /**
   * Hitung peta cakupan.
   * o: { angles:[°], sides:['kiri','kanan'], near, far (jarak exit point ke sumbu las, mm),
   *      legs (1 atau 2), haz (mm di luar garis fusi), crystal, freq, mat, wave }
   * Hasil: { nx, nz, x0, dx, dz, roi:Uint8Array, count:Uint8Array, pct, perAngle:{θ:pct}, uncovered }
   */
  UT.coverage = function (w, o) {
    const T = w.T, haz = o.haz == null ? 6 : o.haz;
    const dx = 0.5, dz = 0.5;
    const xMax = Math.max(w.topHalf, w.botHalf) + haz + 1;
    const nx = Math.ceil((2 * xMax) / dx), nz = Math.ceil(T / dz);
    const x0 = -xMax;
    const roi = new Uint8Array(nx * nz), count = new Uint8Array(nx * nz);
    const lambda = UT.waveV(o.mat, o.wave) / (o.freq * 1000);
    const gam = Math.asin(Math.min(0.99, (0.51 * lambda) / o.crystal));
    const w0 = 0.25 * o.crystal;
    const setups = [];
    o.angles.forEach((a) => o.sides.forEach((side) => setups.push({ a, dir: side === 'kiri' ? 1 : -1 })));
    const perHit = {};
    o.angles.forEach((a) => { perHit[a] = 0; });
    let nRoi = 0, nCov = 0;
    for (let iz = 0; iz < nz; iz++) {
      const z = (iz + 0.5) * dz;
      const lim = UT.fusionX(w, z, 1) + haz;
      for (let ix = 0; ix < nx; ix++) {
        const x = x0 + (ix + 0.5) * dx;
        const k = iz * nx + ix;
        if (Math.abs(x) > lim) continue;
        roi[k] = 1;
        nRoi++;
        const hitAngle = {};
        setups.forEach(({ a, dir }) => {
          const th = a * DEG, tn = Math.tan(th), cs = Math.cos(th);
          // probe di sisi kiri (dir +1) berada di x = −d, d ∈ [near, far]
          const pmin = dir > 0 ? -o.far : o.near, pmax = dir > 0 ? -o.near : o.far;
          for (let leg = 1; leg <= o.legs; leg++) {
            const zu = UT.imageDepth(z, leg, T);
            const r = zu / cs;
            const tol = Math.sqrt(w0 * w0 + (r * Math.tan(gam)) ** 2) / cs; // setengah lebar berkas −6 dB, mendatar
            const xp = x - dir * zu * tn;
            if (xp >= pmin - tol && xp <= pmax + tol) {
              count[k] = Math.min(255, count[k] + 1);
              hitAngle[a] = true;
              break;
            }
          }
        });
        if (count[k] > 0) nCov++;
        Object.keys(hitAngle).forEach((a) => { perHit[a]++; });
      }
    }
    const perAngle = {};
    Object.keys(perHit).forEach((a) => { perAngle[a] = nRoi ? (perHit[a] / nRoi) * 100 : 0; });
    return { nx, nz, x0, dx, dz, roi, count, pct: nRoi ? (nCov / nRoi) * 100 : 0, perAngle, uncovered: nRoi - nCov };
  };

  /**
   * Jarak maksimum exit point dari sumbu las agar berkas (leg 2) mencapai kaki las di sisi seberang
   * permukaan atas, dan jarak untuk mencapai akar lewat leg 1.
   */
  UT.planDistances = function (w, angle, haz) {
    const tn = Math.tan(angle * DEG), T = w.T, edge = w.topHalf + (haz == null ? 6 : haz);
    return {
      halfSkip: T * tn,
      fullSkip: 2 * T * tn,
      rootLeg1: T * tn, // exit point → akar (sumbu las) lewat leg 1
      farTopLeg2: 2 * T * tn + edge, // exit point → tepi zona seberang di permukaan atas lewat leg 2
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
