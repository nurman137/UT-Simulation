/*
 * Geometri pelat, las (bevel V) dan probe.
 *
 * Sistem koordinat penampang:
 *   x = arah melintang las (mm), x = 0 di sumbu las, positif ke kanan
 *   z = kedalaman (mm), z = 0 di permukaan atas (permukaan scanning), z = T di permukaan bawah
 *
 * Pantulan di permukaan atas/bawah ditangani dengan "unfolding": berkas dianggap
 * lurus di ruang terbuka (zu), lalu dilipat kembali ke dalam pelat.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});
  const DEG = Math.PI / 180;

  /** Bangun model las bevel V tunggal dari parameter. */
  UT.buildWeld = function (p) {
    const T = p.T;
    const beta = p.bevelHalf * DEG; // setengah sudut bevel (dari vertikal)
    const g = p.rootGap / 2; // setengah root gap
    const rf = Math.min(p.rootFace, T * 0.4); // root face (land)
    const topHalf = g + (T - rf) * Math.tan(beta); // setengah lebar bukaan di permukaan
    const capHalf = topHalf + 2; // cap melebar ~2 mm di tiap sisi
    const rootHalf = g + 1.5;
    const capH = p.cap ? Math.min(3, 1.2 + T * 0.05) : 0;
    const rootH = p.rootBead ? 1.5 : 0;
    return {
      T, beta, g, rf, topHalf, capHalf, rootHalf, capH, rootH,
      P: UT.CONFIG.plateHalfLength,
    };
  };

  /** Posisi x garis fusi pada kedalaman z. side = -1 (kiri) atau +1 (kanan). */
  UT.fusionX = function (w, z, side) {
    const x = z >= w.T - w.rf ? w.g : w.g + (w.T - w.rf - z) * Math.tan(w.beta);
    return side * x;
  };

  /**
   * Lipat kedalaman "unfolded" zu menjadi kedalaman nyata z dan nomor leg.
   * Leg 1: turun dari permukaan atas ke bawah, leg 2: naik setelah memantul di dasar, dst.
   */
  UT.foldDepth = function (zu, T) {
    if (zu <= 0) return { z: 0, leg: 1 };
    let leg = Math.ceil(zu / T - 1e-9);
    if (leg < 1) leg = 1;
    const local = zu - (leg - 1) * T;
    const z = leg % 2 === 1 ? local : T - local;
    return { z, leg };
  };

  /** Kedalaman bayangan (unfolded) dari titik pada kedalaman z untuk leg tertentu. */
  UT.imageDepth = function (z, leg, T) {
    return leg % 2 === 1 ? (leg - 1) * T + z : leg * T - z;
  };

  /** Besaran turunan probe: panjang gelombang, near field, sudut sebar berkas. */
  UT.probeDerived = function (probe, mat) {
    const lambda = mat.vT / (probe.freq * 1000); // mm
    const D = probe.crystal;
    const N = (D * D) / (4 * lambda); // panjang near field (pendekatan, di baja)
    const gamma6 = Math.asin(Math.min(0.99, (0.51 * lambda) / D)); // setengah sudut -6 dB
    const theta = probe.angle * DEG;
    return { lambda, N, gamma6, theta };
  };

  /** Setengah lebar berkas -6 dB pada jarak r sepanjang sumbu berkas. */
  UT.beamHalfWidth = function (r, crystal, gamma6) {
    const w0 = 0.25 * crystal;
    const wr = r * Math.tan(gamma6);
    return Math.sqrt(w0 * w0 + wr * wr);
  };

  /**
   * Hitung lokasi reflektor dari sound path (SP), seperti yang dilakukan flaw detector.
   * xE = posisi exit point probe, dir = arah berkas (+1 ke kanan, -1 ke kiri).
   */
  UT.locate = function (sp, angleDeg, T, xE, dir) {
    const th = angleDeg * DEG;
    const zu = sp * Math.cos(th);
    const f = UT.foldDepth(zu, T);
    const sd = sp * Math.sin(th);
    return { depth: f.z, leg: f.leg, sd, x: xE + dir * sd, zu };
  };

  /** Titik nyata (x, z) pada sumbu berkas untuk sound path sp. */
  UT.rayPoint = function (sp, angleDeg, T, xE, dir) {
    const l = UT.locate(sp, angleDeg, T, xE, dir);
    return { x: l.x, z: l.depth, leg: l.leg };
  };

  /** Batas posisi exit point probe agar wedge tidak menabrak cap las atau keluar pelat. */
  UT.probeLimits = function (w, dir) {
    const wd = UT.CONFIG.wedge;
    // dir = +1: probe di sisi kiri menghadap kanan
    const xmin = -w.P + wd.back;
    const xmax = w.capH > 0 ? -w.capHalf - wd.front - 0.5 : w.P - wd.front;
    if (dir > 0) return { min: xmin, max: xmax };
    return { min: -xmax, max: -xmin };
  };
})(typeof window !== 'undefined' ? window : globalThis);
