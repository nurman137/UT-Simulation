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

  UT.BEVEL_TYPES = [
    { id: 'V', name: 'V tunggal' },
    { id: 'X', name: 'X (V ganda)' },
    { id: 'U', name: 'U' },
  ];

  /**
   * Bangun model las dari parameter.
   *  V : bevel tunggal, root face di dasar.
   *  X : bevel ganda simetris, root face di tengah tebal, las dari dua sisi
   *      (root bead = cap sisi kedua).
   *  U : alur U, jari-jari akar R, dinding 10° dari vertikal.
   */
  UT.buildWeld = function (p) {
    const T = p.T;
    const type = p.bevelType || 'V';
    const g = p.rootGap / 2; // setengah root gap
    const w = { T, type, g, P: UT.CONFIG.plateHalfLength };
    if (type === 'X') {
      w.rf = Math.min(p.rootFace, T * 0.3);
      w.beta = p.bevelHalf * DEG;
      w.zL1 = T / 2 - w.rf / 2;
      w.zL2 = T / 2 + w.rf / 2;
    } else if (type === 'U') {
      w.rf = Math.min(p.rootFace, T * 0.3);
      w.beta = 10 * DEG;
      w.R = Math.min(5, (T - w.rf) * 0.4);
      w.z0 = T - w.rf;
      w.zEnd = w.z0 - w.R + w.R * Math.sin(w.beta);
      w.xEnd = g + w.R * Math.cos(w.beta);
    } else {
      w.rf = Math.min(p.rootFace, T * 0.4);
      w.beta = p.bevelHalf * DEG;
    }
    w.topHalf = UT.fusionX(w, 0, 1); // setengah lebar bukaan di permukaan atas
    w.botHalf = UT.fusionX(w, T, 1); // setengah lebar bukaan di permukaan bawah
    w.capHalf = w.topHalf + 2; // cap melebar ~2 mm di tiap sisi
    w.capH = p.cap ? Math.min(3, 1.2 + T * 0.05) : 0;
    if (type === 'X') {
      w.rootHalf = w.botHalf + 2;
      w.rootH = p.rootBead ? w.capH || Math.min(3, 1.2 + T * 0.05) : 0;
    } else {
      w.rootHalf = w.botHalf + 1.5;
      w.rootH = p.rootBead ? 1.5 : 0;
    }
    return w;
  };

  /** Posisi x garis fusi pada kedalaman z. side = -1 (kiri) atau +1 (kanan). */
  UT.fusionX = function (w, z, side) {
    let x;
    if (w.type === 'X') {
      if (z < w.zL1) x = w.g + (w.zL1 - z) * Math.tan(w.beta);
      else if (z > w.zL2) x = w.g + (z - w.zL2) * Math.tan(w.beta);
      else x = w.g;
    } else if (w.type === 'U') {
      if (z >= w.z0) x = w.g;
      else if (z >= w.zEnd) {
        const dz = z - (w.z0 - w.R);
        x = w.g + Math.sqrt(Math.max(0, w.R * w.R - dz * dz));
      } else x = w.xEnd + (w.zEnd - z) * Math.tan(w.beta);
    } else {
      x = z >= w.T - w.rf ? w.g : w.g + (w.T - w.rf - z) * Math.tan(w.beta);
    }
    return side * x;
  };

  /** Profil garis fusi dari permukaan atas ke bawah sebagai [[x, z], ...], digeser 'off' mm ke luar. */
  UT.fusionProfile = function (w, side, off) {
    off = off || 0;
    const zs = [0, w.T];
    for (let i = 1; i < 48; i++) zs.push((w.T * i) / 48);
    if (w.type === 'X') zs.push(w.zL1, w.zL2);
    else if (w.type === 'U') zs.push(w.z0, w.zEnd);
    else zs.push(w.T - w.rf);
    zs.sort((a, b) => a - b);
    return zs.map((z) => [UT.fusionX(w, z, side) + side * off, z]);
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

})(typeof window !== 'undefined' ? window : globalThis);
