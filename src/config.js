/*
 * Konfigurasi & konstanta Simulator UT Las.
 * Satuan: jarak dalam mm, kecepatan dalam m/s, frekuensi dalam MHz, sudut dalam derajat.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});

  UT.CONFIG = {
    version: '0.5.0',

    // Material aktif (objek ini diperbarui oleh UT.setMaterial; referensinya tetap sama)
    material: {},
    // Pustaka material. Faktor per mode gelombang (T = geser, L = longitudinal):
    //   att       : pengali atenuasi umum
    //   grainBase : pengali noise butir logam induk
    //   grainWeld : pengali noise butir logam las (las austenitik: butir kolumnar kasar)
    //   weldAtt   : atenuasi tambahan di dalam logam las (dB/mm, satu arah)
    materials: {
      cs: {
        id: 'cs', name: 'Baja karbon', vT: 3240, vL: 5920,
        att: { T: 1, L: 0.6 }, grainBase: { T: 1, L: 0.5 }, grainWeld: { T: 1, L: 0.5 }, weldAtt: { T: 0, L: 0 },
      },
      ss: {
        id: 'ss', name: 'Baja tahan karat austenitik', vT: 3130, vL: 5740,
        att: { T: 1.6, L: 0.9 }, grainBase: { T: 2.5, L: 1.2 }, grainWeld: { T: 14, L: 4 }, weldAtt: { T: 0.22, L: 0.05 },
      },
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
      // Diameter luar pipa (mm): NPS 4, 6, 8, 12, 20, 30
      ods: [114.3, 168.3, 219.1, 323.9, 508, 762],
      bevels: [30, 37.5],
    },

    // Skala penguatan: %FSH = amplitudo_mentah * GAIN_K * 10^(gain/20)
    GAIN_K: 0.4,
    // Noise elektronik (satuan amplitudo mentah, ikut dikuatkan oleh gain)
    ELECTRONIC_NOISE: 0.004,
    // Kerapatan & kekuatan hamburan butir (grain noise)
    GRAIN_DENSITY: 0.6, // titik per mm^2
    GRAIN_STRENGTH: 0.03,

    defaults: {
      specimen: 'las',
      material: 'cs',
      wave: 'T',
      geom: 'pelat',
      OD: 323.9,
      contour: false,
      asmeCurved: false,
      technique: 'ut',
      pautAngle: 60,
      tofdS: null,
      bevelType: 'V',
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
      randSeed: 1234,
      randCount: 2,
      showDefects: true,
      showBeam: true,
      grain: true,
    },
  };

  /** Ganti material aktif (objek UT.CONFIG.material diperbarui di tempat). */
  UT.setMaterial = function (id) {
    const m = UT.CONFIG.materials[id] || UT.CONFIG.materials.cs;
    const tgt = UT.CONFIG.material;
    Object.keys(tgt).forEach((k) => delete tgt[k]);
    Object.assign(tgt, m);
    return tgt;
  };
  UT.setMaterial('cs');

  /** Kecepatan gelombang (m/s) untuk mode 'T' (geser) atau 'L' (longitudinal). */
  UT.waveV = (mat, wave) => (wave === 'L' ? mat.vL : mat.vT);
})(typeof window !== 'undefined' ? window : globalThis);
