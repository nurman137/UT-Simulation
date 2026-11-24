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
    { id: 'iiw', name: 'Blok IIW V1' },
    { id: 'v2', name: 'Blok V2' },
    { id: 'asme', name: 'Blok kalibrasi dasar ASME' },
    { id: 'korosi', name: 'Pelat korosi' },
  ];

  // Blok IIW V1 (ISO 2400 / EN 12223), 300 × 100 mm. Posisi lubang diturunkan dari skala sudut
  // yang terukir: tanda sudut θ berada di x = x_lubang + d·tan θ (d = kedalaman pusat lubang).
  UT.IIW = {
    length: 300,
    T: 100,
    r100: { cx: 200, R: 100 }, // titik pusat R100 di sisi A (permukaan atas)
    hole50: { x: 35, z: 27, r: 25 }, // Ø50 diukur dari sisi A
    hole15: { x: 30, zB: 15, r: 0.75 }, // Ø1,5 berjarak 15 mm dari sisi B
    scaleA: { from: 35, to: 76, labels: [50, 60, 70, 76] }, // terhadap Ø50, dipakai dari sisi A
    scaleB: { from: 70, to: 80, labels: [74, 80] }, // terhadap Ø1,5, dipakai dari sisi B
  };

  // Blok V2 (ISO 7963): R25 dan R50 berpusat di satu titik pada permukaan pindai, lubang Ø5.
  // Sisi miring (kiri bawah) menyinggung busur R25 dan berakhir di busur R50; kemiringan dari foto blok.
  // Dari sisi miring, lubang Ø5 dipakai untuk cek sudut 65°–75°.
  UT.V2 = {
    R1: 25, R2: 50,
    hole: { x: 0, z: 20, r: 2.5 },
    scale: { from: 35, to: 68, labels: [35, 40, 50, 60, 65] }, // terhadap Ø5, dari sisi atas
    arcTicks: { from: 40, to: 70, labels: [50, 60, 70] }, // tanda sudut pada busur R50
    slantDeg: 31, // kemiringan sisi miring terhadap sisi atas
    scaleB: { from: 60, to: 76, labels: [65, 70, 75] }, // terhadap Ø5, dari sisi miring
  };

  /** Geometri pokok blok V2 pada koordinat sisi atas (titik pusat di x = 0, z = 0). */
  UT.v2Geometry = function () {
    const B = UT.V2, f = (B.slantDeg * Math.PI) / 180;
    const n = [-Math.sin(f), Math.cos(f)]; // normal sisi miring, mengarah ke luar blok
    const u = [Math.cos(f), Math.sin(f)]; // arah sepanjang sisi miring (menuruni lereng)
    const Tp = [B.R1 * n[0], B.R1 * n[1]]; // titik singgung dengan R25
    const sEnd = Math.sqrt(B.R2 * B.R2 - B.R1 * B.R1);
    const E = [Tp[0] + sEnd * u[0], Tp[1] + sEnd * u[1]]; // ujung sisi miring di busur R50
    const h = B.hole;
    const d = B.R1 - (h.x * n[0] + h.z * n[1]); // jarak lubang Ø5 ke sisi miring
    const F = [h.x + d * n[0], h.z + d * n[1]]; // tanda "0" pada sisi miring
    return { n, u, Tp, E, d, F, aT: Math.atan2(Tp[0], Tp[1]) * (180 / Math.PI), aE: Math.atan2(E[0], E[1]) * (180 / Math.PI) };
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
    // Blok kecil (V2) dirancang untuk probe miniatur: wedge boleh menggantung, exit point tetap di permukaan
    if (spec.overhang) return { min: spec.xMin + 1, max: spec.xMax - 1 };
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
  UT.weldYLen = (S) => (S.geom === 'pipa' && !S.seam ? Math.PI * S.OD : UT.CONFIG.weldLength);

  function buildWeldSpecimen(S) {
    const weld = UT.buildWeld(S);
    const yLen = UT.weldYLen(S);
    const scene = UT.buildScene(weld, S.scenario, { seed: S.randSeed, count: S.randCount, yLen, gen: S.randGen || 2, pipe: S.geom === 'pipa' && !S.seam });
    const spec = {
      type: 'las', name: 'Las', T: weld.T, xMin: -weld.P, xMax: weld.P,
      yLen, weld, scene,
    };
    if (S.geom === 'pipa' && S.seam) {
      // Las memanjang (seam): bidang berkas = penampang keliling (anulus); las sejajar sumbu pipa (y)
      spec.seam = true;
      spec.OD = S.OD;
      spec.R = S.OD / 2;
      spec.name = `Pipa OD ${S.OD} mm – las memanjang (seam)`;
    } else if (S.geom === 'pipa') {
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

  /** Balik geometri blok (sisi B menjadi permukaan pindai): z → T − z. */
  function flipZ(spec) {
    const T = spec.T;
    spec.scene.points.forEach((p) => { p.z = T - p.z; p.nz = -p.nz; });
    spec.scene.corners.forEach((c) => { c.z = T - c.z; });
    spec.outline = spec.outline.map(([x, z]) => [x, T - z]);
    spec.holes.forEach((h) => { h.z = T - h.z; });
  }

  // Permukaan busur berpusat (cx, 0) jari-jari R, dari sudut a0 ke a1 (diukur dari vertikal, arah +x positif).
  // Normal mengarah ke titik pusat. rep: echo berulang lewat titik pusat.
  function arcPoints(points, cx, R, a0, a1, rep) {
    const pts = [];
    const n = Math.max(40, Math.round((Math.abs(a1 - a0) * R) / 0.5));
    for (let k = 0; k <= n; k++) {
      const a = (a0 + ((a1 - a0) * k) / n) * (Math.PI / 180);
      pts.push([cx + R * Math.sin(a), R * Math.cos(a)]);
    }
    const before = points.length;
    UT.samplePolyline(points, pts, { two: false, refl: 1, rep });
    for (let i = before; i < points.length; i++) {
      const p = points[i];
      const dx = cx - p.x, dz = -p.z, L = Math.hypot(dx, dz);
      p.nx = dx / L; p.nz = dz / L;
    }
    return pts;
  }

  function buildIIW(face) {
    const B = UT.IIW;
    const points = [];
    const { cx, R } = B.r100;
    // Permukaan lengkung R100. Echo berulang 100, 200 mm: gelombang kembali ke titik pusat
    // lalu dipantulkan oleh celah di kedua sisi blok tepat di titik pusat.
    arcPoints(points, cx, R, 0, 90, { n: 2, step: R, decay: 0.35 });
    const h = B.hole50, h2 = B.hole15;
    UT.sampleCircle(points, h.x, h.z, h.r, { refl: 1 });
    UT.sampleCircle(points, h2.x, B.T - h2.zB, Math.max(h2.r, 0.75), { refl: 1 });

    const corners = [];
    [0, B.T].forEach((z) => corners.push({ x: 0, z, s: B.T, face: 1, kind: 'ujung' }));

    const outline = [[0, 0], [B.length, 0]];
    for (let k = 1; k <= 40; k++) {
      const a = (Math.PI / 2) * (k / 40);
      outline.push([cx + R * Math.cos(a), R * Math.sin(a)]);
    }
    outline.push([0, B.T]);

    const spec = {
      type: 'iiw', face: face === 'B' ? 'B' : 'A',
      name: `Blok IIW V1 – sisi ${face === 'B' ? 'B' : 'A'}`, T: B.T, xMin: 0, xMax: B.length, yLen: null,
      scene: { points, corners, shapes: { polys: [], circles: [], gaps: [] }, ipRanges: [], truth: [], rootBead: false },
      outline,
      holes: [{ x: h.x, z: h.z, r: h.r, label: 'Ø50' }, { x: h2.x, z: B.T - h2.zB, r: h2.r, label: 'Ø1,5' }],
    };
    if (spec.face === 'B') {
      flipZ(spec);
      spec.marks = {
        scale: { hx: h2.x, hz: h2.zB, from: B.scaleB.from, to: B.scaleB.to, labels: B.scaleB.labels, minorStep: 1 },
        ruler: { x0: 0, x1: 200 },
        arcLabel: { text: 'R100', x: cx + 72, z: 30 },
      };
    } else {
      spec.marks = {
        centerX: cx, centerLabel: 'pusat R100',
        scale: { hx: h.x, hz: h.z, from: B.scaleA.from, to: B.scaleA.to, labels: B.scaleA.labels, minorStep: 1 },
        arcLabel: { text: 'R100', x: cx + 72, z: 70 },
      };
    }
    spec.grain = UT.buildGrain(spec, 99);
    return spec;
  }

  function buildV2(face) {
    const B = UT.V2, G = UT.v2Geometry();
    const sideB = face === 'B';
    const points = [];
    // Dari sisi atas: menghadap R25 → 25, 100, 175 mm; menghadap R50 → 50, 125, 200 mm (selisih 75 = 25 + 50).
    // Echo berulang hanya terjadi bila probe berada di titik pusat (sisi atas).
    const rep = sideB ? null : { n: 2, step: B.R1 + B.R2, decay: 0.35 };
    const a25 = arcPoints(points, 0, B.R1, G.aT, -90, rep); // dari titik singgung ke (−25, 0)
    const a50 = arcPoints(points, 0, B.R2, G.aE, 90, rep); // dari ujung sisi miring ke (50, 0)
    UT.sampleCircle(points, B.hole.x, B.hole.z, B.hole.r, { refl: 1 });
    const outline = [[-B.R1, 0], [B.R2, 0]];
    a50.slice().reverse().forEach((p) => outline.push(p)); // (50,0) → E
    outline.push(G.Tp.slice()); // sisi miring E → titik singgung
    a25.forEach((p) => outline.push(p)); // titik singgung → (−25, 0)
    const spec = {
      type: 'v2', face: sideB ? 'B' : 'A', name: `Blok V2 – ${sideB ? 'sisi miring' : 'sisi atas'}`,
      T: B.R2, xMin: -B.R1, xMax: B.R2, yLen: null, overhang: true,
      scene: { points, corners: [], shapes: { polys: [], circles: [], gaps: [] }, ipRanges: [], truth: [], rootBead: false },
      outline,
      holes: [{ x: B.hole.x, z: B.hole.z, r: B.hole.r, label: 'Ø5' }],
      marks: {
        centerX: 0, centerLabel: '0', indexRef: true,
        scale: { hx: B.hole.x, hz: B.hole.z, from: B.scale.from, to: B.scale.to, labels: B.scale.labels, minorStep: 1 },
        arcTicks: { cx: 0, R: B.R2, from: B.arcTicks.from, to: B.arcTicks.to, labels: B.arcTicks.labels },
        arcLabel: { text: 'R50', x: 30, z: 33 },
        arcLabel2: { text: 'R25', x: -16, z: 9 },
      },
    };
    if (sideB) {
      // Putar blok (rotasi murni, bukan cermin) sehingga sisi miring menjadi permukaan atas:
      // sumbu x' = −u (tanda 65°–75° berada di kiri tanda "0", seperti blok yang diputar), z' = kedalaman dari sisi miring
      const { u, n, F } = G;
      const tx = (x, z) => -((x - F[0]) * u[0] + (z - F[1]) * u[1]);
      const tz = (x, z) => B.R1 - (x * n[0] + z * n[1]);
      points.forEach((p) => {
        const x = tx(p.x, p.z), z = tz(p.x, p.z);
        const nx = -(p.nx * u[0] + p.nz * u[1]), nz = -(p.nx * n[0] + p.nz * n[1]);
        p.x = x; p.z = z; p.nx = nx; p.nz = nz;
      });
      spec.outline = outline.map(([x, z]) => [tx(x, z), tz(x, z)]);
      spec.holes = [{ x: 0, z: G.d, r: B.hole.r, label: 'Ø5' }];
      spec.xMin = tx(G.E[0], G.E[1]);
      spec.xMax = tx(G.Tp[0], G.Tp[1]);
      spec.T = Math.max(...spec.outline.map((q) => q[1]));
      const lab = (x, z) => ({ x: tx(x, z), z: tz(x, z) });
      spec.marks = {
        centerX: 0, centerLabel: '0', indexRef: false,
        scale: { hx: 0, hz: G.d, from: B.scaleB.from, to: B.scaleB.to, labels: B.scaleB.labels, minorStep: 1, sign: -1 },
        arcLabel: Object.assign({ text: 'R50' }, lab(30, 33)),
        arcLabel2: Object.assign({ text: 'R25' }, lab(-16, 9)),
      };
    }
    spec.grain = UT.buildGrain(spec, 77);
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
    // girth: kelengkungan melintang lebar wedge; seam: kelengkungan searah panjang wedge
    const W = spec.seam ? UT.PROBE_BODY : UT.PROBE_WIDTH || 20;
    const h = (W * W) / (8 * spec.R);
    const lossDb = contoured ? 0.5 : Math.min(18, 10 * h);
    const yScale = contoured ? 1 + 0.5 * h : 1 + 4 * h;
    return { gain: Math.pow(10, -lossDb / 20), yScale, lossDb, gap: h };
  };

  /** Validitas blok kalibrasi lengkung ASME: blok diameter Db berlaku untuk permukaan 0,9–1,5 × Db. */
  UT.curvedBlockOk = (odSurface, odBlock) => odBlock != null && odSurface >= 0.9 * odBlock && odSurface <= 1.5 * odBlock;

  /**
   * Spesimen penampang memanjang untuk scan sejajar las (bidang y–z). Koordinat x = posisi sepanjang
   * las; posisi lateral probe (melintang las) dipakai sebagai "y" untuk faktor lebar berkas.
   */
  UT.parallelSpec = function (spec) {
    if (spec.parSpec) return spec.parSpec;
    const L = spec.yLen, T = spec.T;
    const ps = {
      type: 'par', name: 'Penampang memanjang las', T, xMin: 0, xMax: L, yLen: null, base: spec, weld: spec.weld,
      scene: { points: spec.scene.par.points, corners: spec.scene.par.corners, shapes: spec.scene.par.shapes, ipRanges: [], truth: spec.scene.truth, rootBead: false },
      outline: [[0, 0], [L, 0], [L, T], [0, T]], holes: [], marks: {},
    };
    ps.grain = UT.buildGrain(ps, 31337);
    ps.grain.inWeld = new Uint8Array(ps.grain.n);
    spec.parSpec = ps;
    return ps;
  };

  /** Posisi lateral yang diizinkan untuk scan sejajar: bila cap ada, probe tidak bisa duduk di atas las. */
  UT.lateralLimit = function (spec, lat) {
    const w = spec.weld, hw = (UT.PROBE_WIDTH || 20) / 2;
    let v = Math.max(-60, Math.min(60, lat));
    if (w.capH > 0) {
      const edge = w.capHalf + hw + 0.5;
      if (Math.abs(v) < edge) v = (v < 0 ? -1 : 1) * edge;
    }
    return v;
  };

  /** Apakah dasar benda uji di bawah posisi x rata (untuk echo back wall probe 0°). */
  UT.flatBottomFn = function (spec) {
    if (spec.type === 'par' || spec.type === 'asme' || spec.type === 'korosi') return () => true;
    if (spec.type === 'v2') return () => false;
    if (spec.type === 'iiw') return spec.face === 'B' ? () => true : (x) => x <= UT.IIW.r100.cx;
    const w = spec.weld;
    // di bawah las: root bead / cap sisi kedua tidak rata
    return (x) => Math.abs(x) > (w.rootH > 0 ? w.rootHalf : w.botHalf) + 1;
  };

  UT.buildSpecimen = function (S) {
    if (S.specimen === 'iiw') return buildIIW(S.iiwFace);
    if (S.specimen === 'v2') return buildV2(S.v2Face);
    if (S.specimen === 'asme') return buildASME(S.T, S.asmeCurved ? S.OD : null);
    if (S.specimen === 'korosi') return UT.buildKorosi(S.T, S.korosiSeed || 2468);
    return buildWeldSpecimen(S);
  };
})(typeof window !== 'undefined' ? window : globalThis);
