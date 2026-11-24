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

  /** Panjang las searah sumbu las: keliling pipa (las girth) atau panjang pelat. */
  UT.weldYLen = (S) => (S.geom === 'pipa' ? Math.PI * S.OD : UT.CONFIG.weldLength);

  function buildWeldSpecimen(S) {
    const weld = UT.buildWeld(S);
    const yLen = UT.weldYLen(S);
    const scene = UT.buildScene(weld, S.scenario, { seed: S.randSeed, count: S.randCount, yLen });
    const spec = {
      type: 'las', name: 'Las', T: weld.T, xMin: -weld.P, xMax: weld.P,
      yLen, weld, scene,
    };
    if (S.geom === 'pipa') {
      // Las girth: bidang berkas = penampang aksial dinding pipa (datar); kelengkungan ada searah keliling (y)
      spec.isPipe = true;
      spec.OD = S.OD;
      spec.R = S.OD / 2;
      spec.name = `Pipa OD ${S.OD} mm – las girth`;
    }
    spec.grain = UT.buildGrain(spec, 20240611);
    // Tandai titik butir yang berada di logam las (noise berbeda untuk las austenitik)
    const g = spec.grain;
    g.inWeld = new Uint8Array(g.n);
    for (let i = 0; i < g.n; i++) g.inWeld[i] = Math.abs(g.xs[i]) < UT.fusionX(weld, g.zs[i], 1) + 0.5 ? 1 : 0;
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
      scene: { points, corners, shapes: { polys: [], circles: [], gaps: [] }, ipRanges: [], truth: [], rootBead: false },
      outline,
      holes: [{ x: h.x, z: h.z, r: h.r, label: 'Ø50' }],
      marks: { r100Center: cx, angleScale: B.angleScale.map((a) => ({ a, x: h.x + h.z * Math.tan((a * Math.PI) / 180) })) },
    };
    spec.grain = UT.buildGrain(spec, 99);
    return spec;
  }

  function buildASME(T, OD) {
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
      scene: { points, corners, shapes: { polys: [], circles: [], gaps: [] }, ipRanges: [], truth: [], rootBead: false },
      outline, holes, sdhDiameter: d, marks: {},
    };
    if (OD) { spec.R = OD / 2; spec.OD = OD; spec.name += ` (lengkung, D = ${OD} mm)`; }
    spec.grain = UT.buildGrain(spec, 4242);
    return spec;
  }

  /**
   * Kopling wedge pada permukaan lengkung (kelengkungan searah keliling / sumbu y).
   * Wedge datar pada permukaan cembung menyisakan celah di tepi: h = W²/(8R) (W = lebar wedge).
   * Model kualitatif: rugi transfer ≈ 10 dB per mm celah (maks. 18 dB) dan berkas melebar searah y.
   * Wedge yang dikontur sesuai diameter menghilangkan sebagian besar rugi tersebut.
   */
  UT.coupling = function (spec, contoured) {
    if (!spec || !spec.R) return { gain: 1, yScale: 1, lossDb: 0, gap: 0 };
    const W = UT.PROBE_WIDTH || 20;
    const h = (W * W) / (8 * spec.R);
    const lossDb = contoured ? 0.5 : Math.min(18, 10 * h);
    const yScale = contoured ? 1 + 0.5 * h : 1 + 4 * h;
    return { gain: Math.pow(10, -lossDb / 20), yScale, lossDb, gap: h };
  };

  /** Validitas blok kalibrasi lengkung ASME: blok diameter Db berlaku untuk permukaan 0,9–1,5 × Db. */
  UT.curvedBlockOk = (odSurface, odBlock) => odBlock != null && odSurface >= 0.9 * odBlock && odSurface <= 1.5 * odBlock;

  UT.buildSpecimen = function (S) {
    if (S.specimen === 'iiw') return buildIIW();
    if (S.specimen === 'asme') return buildASME(S.T, S.asmeCurved ? S.OD : null);
    return buildWeldSpecimen(S);
  };
})(typeof window !== 'undefined' ? window : globalThis);
