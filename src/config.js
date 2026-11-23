/*
 * Konfigurasi & konstanta Simulator UT Las.
 * Satuan: jarak dalam mm, kecepatan dalam m/s, frekuensi dalam MHz, sudut dalam derajat.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});

  UT.CONFIG = {
    version: '0.2.0',

    // Material benda uji (v0.1: baja karbon saja)
    material: {
      name: 'Baja karbon',
      vT: 3240, // kecepatan gelombang geser (shear), m/s
      vL: 5920, // kecepatan gelombang longitudinal, m/s
    },

    // Setengah panjang pelat yang dimodelkan (pelat dari -P sampai +P terhadap sumbu las)
    plateHalfLength: 200,
    // Panjang las yang dimodelkan searah sumbu las (y)
    weldLength: 300,

    // Dimensi wedge probe (mm) relatif terhadap titik keluar berkas (exit point / probe index)
    wedge: { front: 10, back: 22, height: 16 },

    options: {
      angles: [45, 60, 70],
      freqs: [2.25, 4, 5],
      crystals: [6, 10, 13, 20],
      thicknesses: [10, 12, 16, 20, 25, 32, 40],
      bevels: [30, 37.5],
    },

    // Skala penguatan: %FSH = amplitudo_mentah * GAIN_K * 10^(gain/20)
    GAIN_K: 0.4,
    // Noise elektronik (satuan amplitudo mentah, ikut dikuatkan oleh gain)
    ELECTRONIC_NOISE: 0.004,
    // Kerapatan & kekuatan hamburan butir (grain noise)
    GRAIN_DENSITY: 0.6, // titik per mm^2
    GRAIN_STRENGTH: 0.07,

    defaults: {
      specimen: 'las',
      probeY: 150,
      // Benda uji
      T: 20,
      bevelHalf: 30,
      rootGap: 2,
      rootFace: 1.5,
      cap: true,
      rootBead: true,
      // Probe
      angle: 60,
      freq: 4,
      crystal: 10,
      side: 'kiri',
      // Flaw detector
      gain: 46,
      range: 125,
      delay: 0,
      velocity: 3240,
      rect: 'full',
      // Gate A
      gateStart: 40,
      gateWidth: 50,
      gateLevel: 20,
      // Cacat & tampilan
      scenario: 'lof-kiri',
      showDefects: true,
      showBeam: true,
      grain: true,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
