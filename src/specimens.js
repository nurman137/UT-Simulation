/*
 * Benda uji (spesimen): las, blok IIW (V1), dan blok kalibrasi dasar ASME.
 *
 * Setiap spesimen: {
 *   type, name, T, xMin, xMax,      // penampang: permukaan scanning dari xMin sampai xMax, tebal T
 *   yLen,                            // panjang searah sumbu las (hanya las; null untuk blok)
 *   weld,                            // model las (hanya tipe 'las')
 *   scene: {points, corners, shapes, rootBead},
 *   grain,                           // titik hambur butir
 *   outline,                         // poligon tepi blok (untuk blok)
 *   holes, marks                     // info gambar tambahan
 * }
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});

  UT.SPECIMENS = [
    { id: 'las', name: 'Las (benda uji)' },
    { id: 'iiw', name: 'Blok IIW (V1)' },
    { id: 'asme', name: 'Blok kalibrasi dasar ASME' },
  ];

  // Dimensi blok IIW (V1) yang disederhanakan untuk simulasi 2D
  UT.IIW = {
    length: 300,
    T: 100,
    r100: { cx: 200, R: 100 }, // titik pusat R100 di permukaan atas
    hole50: { x: 80, z: 70, r: 25 }, // lubang Ø50 untuk cek sudut
    angleScale: [40, 45, 50, 55, 60, 65, 70, 75],
  };

  /** Diameter SDH blok kalibrasi dasar ASME berdasarkan tebal las (ASME Sec. V Art. 4, Fig. T-434.2.1). */
  UT.asmeSdhDiameter = function (t) {
    if (t <= 25) return 2.5; // 3/32 in
    if (t <= 50) return 3; // 1/8 in
    return 5; // 3/16 in
  };

  UT.ASME_BLOCK = { length: 300, holesX: [110, 140, 170], labels: ['¼T', '½T', '¾T'], fractions: [0.25, 0.5, 0.75] };

  /** Batas posisi exit point probe. body = {front, back} jarak exit point ke depan/belakang wedge. */
  UT.specimenProbeLimits = function (spec, dir, body) {
    let lo = spec.xMin + (dir > 0 ? body.back : body.front);
    let hi = spec.xMax - (dir > 0 ? body.front : body.back);
    if (spec.type === 'las' && spec.weld.capH > 0) {
      const edge = spec.weld.capHalf + 0.5;
      if (dir > 0) hi = Math.min(hi, -edge - body.front);
      else lo = Math.max(lo, edge + body.front);
    }
    return { min: lo, max: hi };
  };

  function plateEnds(corners, xMin, xMax, T, kind) {
    [0, T].forEach((z) => {
      corners.push({ x: xMax, z, s: T, face: -1, kind });
      corners.push({ x: xMin, z, s: T, face: 1, kind });
    });
  }

  function buildWeldSpecimen(S) {
    const weld = UT.buildWeld(S);
    const scene = UT.buildScene(weld, S.scenario);
    const spec = {
      type: 'las', name: 'Las', T: weld.T, xMin: -weld.P, xMax: weld.P,
      yLen: UT.CONFIG.weldLength, weld, scene,
    };
    spec.grain = UT.buildGrain(spec, 20240611);
    return spec;
  }

  function buildIIW() {
    const B = UT.IIW;
    const points = [];
    const { cx, R } = B.r100;
    // Permukaan lengkung R100 (normal mengarah ke titik pusat). Pantulan berulang 100, 200 mm
    // terjadi karena gelombang kembali ke titik pusat lalu dipantulkan celah di sisi blok.
    const arc = [];
    const nArc = 200;
    for (let k = 0; k <= nArc; k++) {
      const a = (Math.PI / 2) * (k / nArc);
      arc.push([cx + R * Math.cos(a), R * Math.sin(a)]);
    }
    const before = points.length;
    UT.samplePolyline(points, arc, { two: false, refl: 1, rep: { n: 2, step: R, decay: 0.35 } });
    for (let i = before; i < points.length; i++) {
      const p = points[i];
      const dx = cx - p.x, dz = 0 - p.z, L = Math.hypot(dx, dz);
      p.nx = dx / L; p.nz = dz / L;
    }
    // Lubang Ø50
    const h = B.hole50;
    UT.sampleCircle(points, h.x, h.z, h.r, { refl: 1 });

    const corners = [];
    [0, B.T].forEach((z) => corners.push({ x: 0, z, s: B.T, face: 1, kind: 'ujung' }));

    const outline = [[0, 0], [B.length, 0]];
    for (let k = 1; k <= 40; k++) {
      const a = (Math.PI / 2) * (k / 40);
      outline.push([cx + R * Math.cos(a), R * Math.sin(a)]);
    }
    outline.push([0, B.T]);

    const spec = {
      type: 'iiw', name: 'Blok IIW (V1)', T: B.T, xMin: 0, xMax: B.length, yLen: null,
      scene: { points, corners, shapes: { polys: [], circles: [], gap: null }, rootBead: false },
      outline,
      holes: [{ x: h.x, z: h.z, r: h.r, label: 'Ø50' }],
      marks: { r100Center: cx, angleScale: B.angleScale.map((a) => ({ a, x: h.x + h.z * Math.tan((a * Math.PI) / 180) })) },
    };
    spec.grain = UT.buildGrain(spec, 99);
    return spec;
  }

  function buildASME(T) {
    const B = UT.ASME_BLOCK;
    const d = UT.asmeSdhDiameter(T);
    const points = [];
    const holes = B.holesX.map((x, i) => {
      const z = T * B.fractions[i];
      UT.sampleCircle(points, x, z, d / 2, { refl: 1 });
      return { x, z, r: d / 2, label: `SDH ${B.labels[i]}` };
    });
    const corners = [];
    plateEnds(corners, 0, B.length, T, 'ujung');
    const outline = [[0, 0], [B.length, 0], [B.length, T], [0, T]];
    const spec = {
      type: 'asme', name: 'Blok kalibrasi dasar ASME', T, xMin: 0, xMax: B.length, yLen: null,
      scene: { points, corners, shapes: { polys: [], circles: [], gap: null }, rootBead: false },
      outline, holes, sdhDiameter: d, marks: {},
    };
    spec.grain = UT.buildGrain(spec, 4242);
    return spec;
  }

  UT.buildSpecimen = function (S) {
    if (S.specimen === 'iiw') return buildIIW();
    if (S.specimen === 'asme') return buildASME(S.T);
    return buildWeldSpecimen(S);
  };
})(typeof window !== 'undefined' ? window : globalThis);
