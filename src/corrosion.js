/*
 * Pengukuran tebal & korosi: pelat dengan dinding menipis (korosi umum) dan pitting,
 * simulasi A-scan probe lurus (tunggal atau dual/TR) dengan permukaan bawah tidak rata,
 * dan peta tebal C-scan. Fungsi murni (tanpa DOM) sehingga bisa diuji di Node.
 *
 * Koordinat pelat: x = 0…length (melintang, penampang), y = 0…width (tegak lurus penampang),
 * z = 0 (permukaan scan) … T (permukaan bawah nominal, sisi yang terkorosi).
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});

  UT.KOROSI = { length: 200, width: 200 };

  // Probe dual (TR): dua kristal bersebelahan dengan delay line, sumbu berkas bersilang (roof angle).
  UT.DUAL = {
    s: 2.2, // setengah jarak efektif kedua kristal (mm baja) → galat V-path
    zf: 8, // kedalaman titik silang berkas (sensitivitas tertinggi)
    wz: 12, // lebar zona sensitif (mm)
    delayPath: 9, // panjang delay line (mm perspex) → zero lebih besar
    crosstalk: 0.8, // sisa pulsa awal yang bocor ke penerima (kecil)
  };

  /** Faktor sensitivitas probe dual terhadap kedalaman. */
  UT.dualGain = (r) => 0.3 + 0.7 * Math.exp(-((r - UT.DUAL.zf) ** 2) / (UT.DUAL.wz ** 2));
  /** SP yang terukur probe dual untuk tebal sebenarnya r (lintasan V). */
  UT.dualPath = (r) => Math.sqrt(r * r + UT.DUAL.s * UT.DUAL.s);

  /**
   * Bangun pelat korosi. features: korosi umum (cekungan lebar) dan pit (cekungan sempit dalam).
   * thick(x, y) = tebal sisa di titik (x, y).
   */
  UT.buildKorosi = function (T, seed) {
    const K = UT.KOROSI;
    const rnd = UT.rng(seed || 2468);
    const feats = [];
    // dua daerah korosi umum (wall loss) dengan tepi landai
    feats.push({ kind: 'umum', x: 70 + rnd() * 20, y: 60 + rnd() * 30, rx: 28, ry: 22, d: T * (0.25 + 0.1 * rnd()) });
    feats.push({ kind: 'umum', x: 140 + rnd() * 15, y: 140 + rnd() * 20, rx: 18, ry: 26, d: T * (0.15 + 0.1 * rnd()) });
    // pit: sebagian di dalam daerah korosi umum, sebagian terisolasi
    const pits = [
      [feats[0].x + 6, feats[0].y - 4, 0.3], [feats[0].x - 10, feats[0].y + 8, 0.2],
      [120 + rnd() * 10, 50 + rnd() * 10, 0.45], [40 + rnd() * 10, 150 + rnd() * 10, 0.35], [feats[1].x, feats[1].y + 10, 0.25],
    ];
    pits.forEach(([x, y, f]) => feats.push({ kind: 'pit', x, y, rx: 2.5 + rnd() * 1.5, ry: 2.5 + rnd() * 1.5, d: T * f }));
    const loss = (x, y) => {
      let lu = 0, lp = 0;
      for (let i = 0; i < feats.length; i++) {
        const f = feats[i];
        const u = ((x - f.x) / f.rx) ** 2 + ((y - f.y) / f.ry) ** 2;
        if (u > 9) continue;
        // korosi umum: dasar rata dengan tepi landai; pit: lubang kecil berdasar agak rata, dinding curam
        if (f.kind === 'umum') lu = Math.max(lu, f.d / (1 + Math.pow(u, 5)));
        else lp = Math.max(lp, f.d / (1 + Math.pow(u, 4)));
      }
      return Math.min(0.8 * T, lu + lp); // pit di dalam daerah korosi umum menambah kedalaman
    };
    const thick = (x, y) => T - loss(x, y);
    // tebal minimum sebenarnya (grid halus)
    let minT = T, minAt = null;
    for (let x = 0; x <= K.length; x += 0.5) for (let y = 0; y <= K.width; y += 0.5) {
      const t = thick(x, y);
      if (t < minT) { minT = t; minAt = { x, y }; }
    }
    const outline = [[0, 0], [K.length, 0], [K.length, T], [0, T]];
    const spec = {
      type: 'korosi', name: 'Pelat korosi (pengukuran tebal)', T, xMin: 0, xMax: K.length, yLen: K.width,
      scene: { points: [], corners: [], shapes: { polys: [], circles: [], gaps: [] }, ipRanges: [], truth: [], rootBead: false },
      outline, holes: [], marks: {}, thick, features: feats, minT, minAt,
    };
    return spec;
  };

  /**
   * A-scan probe lurus pada pelat dengan permukaan bawah tidak rata.
   * o: { probe:{x, y, freq, crystal, dual}, spec, mat, spStart, spEnd, n, mainBangSP }
   * Telapak berkas disampling; setiap titik permukaan bawah memantul dengan bobot profil
   * Gaussian × faktor kemiringan, dijumlahkan koheren (dasar pit memberi echo lebih awal dan lemah).
   */
  UT.simulateStraight = function (o) {
    const pr = o.probe, spec = o.spec, T = spec.T;
    const lambda = o.mat.vL / (pr.freq * 1000);
    const halfLambda = lambda / 2, kw = (2 * Math.PI) / halfLambda;
    const tau = 0.6 * lambda, invTau2 = 1 / (tau * tau), win = 3 * tau;
    const n = o.n, re = new Float32Array(n);
    const dsp = (o.spEnd - o.spStart) / (n - 1);
    const dual = !!pr.dual;
    const D = dual ? pr.crystal * 0.7 : pr.crystal; // dual: tiap kristal setengah lingkaran
    const N0 = Math.max(1, (D * D) / (4 * lambda));
    const gam = Math.asin(Math.min(0.99, (0.51 * lambda) / D));
    const alpha = UT.attenDbPerMm(pr.freq) * (o.mat.att ? o.mat.att.L : 1);
    const attK = (-alpha * 2 * Math.LN10) / 20;
    function add(r, a) {
      if (dual) { a *= UT.dualGain(r); r = UT.dualPath(r); }
      if (r + win < o.spStart || r - win > o.spEnd) return;
      let j0 = Math.ceil((r - win - o.spStart) / dsp), j1 = Math.floor((r + win - o.spStart) / dsp);
      if (j0 < 0) j0 = 0;
      if (j1 > n - 1) j1 = n - 1;
      for (let j = j0; j <= j1; j++) {
        const u = o.spStart + j * dsp - r;
        re[j] += a * Math.exp(-u * u * invTau2) * Math.cos(kw * u);
      }
    }
    // Telapak berkas pada kedalaman nominal
    const w6 = Math.sqrt((0.25 * D) ** 2 + (T * Math.tan(gam)) ** 2) * (dual ? 0.8 : 1);
    const h = Math.max(0.35, w6 / (o.fast ? 3.5 : 6)), R = 2 * w6;
    let wsum = 0;
    const samples = [], bins = new Map();
    for (let dx = -R; dx <= R + 1e-9; dx += h) {
      for (let dy = -R; dy <= R + 1e-9; dy += h) {
        const q = (dx * dx + dy * dy) / (w6 * w6);
        if (q > 4) continue;
        const wgt = Math.pow(0.5, q);
        wsum += wgt;
        const x = pr.x + dx, y = pr.y + dy;
        if (x < spec.xMin || x > spec.xMax || y < 0 || y > spec.yLen) continue;
        const t = spec.thick(x, y);
        // kemiringan permukaan bawah: pantulan menjauh dari probe bila miring
        const gx = (spec.thick(x + 0.3, y) - t) / 0.3;
        const gy = (spec.thick(x, y + 0.3) - t) / 0.3;
        const slope = Math.sqrt(gx * gx + gy * gy);
        // kelompokkan per tebal (resolusi 0,02 mm) agar sintesis sinyal cepat
        const key = Math.round(t * 50);
        bins.set(key, (bins.get(key) || 0) + wgt * Math.exp(-((slope / 0.25) ** 2)));
      }
    }
    bins.forEach((w, key) => samples.push({ t: key / 50, w }));
    for (let k = 1; k <= 4; k++) {
      samples.forEach((sm) => {
        const r = k * sm.t;
        if (r > o.spEnd + win) return;
        const a = 3.2 * (sm.w / wsum) * Math.pow(N0 / Math.sqrt(N0 * N0 + r * r), 0.5) * Math.exp(attK * r) * Math.pow(0.8, k - 1);
        add(r, -a);
      });
    }
    // Pulsa awal: probe tunggal → besar (dead zone); dual → hanya crosstalk kecil
    if (o.mainBangSP != null) {
      const mb = o.mainBangSP, ring = (dual ? 0.8 : 2.4) * halfLambda, A0 = dual ? UT.DUAL.crosstalk : 20;
      const j0 = Math.max(0, Math.ceil((mb - win - o.spStart) / dsp));
      const j1 = Math.min(n - 1, Math.floor((mb + ring * 8 - o.spStart) / dsp));
      for (let j = j0; j <= j1; j++) {
        const u = o.spStart + j * dsp - mb;
        const env = u < 0 ? Math.exp(-u * u * invTau2) : Math.exp(-u / ring);
        re[j] += A0 * env * Math.cos(kw * u);
      }
    }
    return { re, spStart: o.spStart, spEnd: o.spEnd, n };
  };

  /**
   * Tebal terukur dari sinyal: posisi puncak echo pertama yang melewati level (amplitudo tampilan)
   * di dalam jendela [gStart, gEnd] (SP alat). spOf(i) = SP alat sampel i. null bila tak ada echo.
   */
  UT.firstEchoSP = function (re, gl, spOf, gStart, gEnd, levelPct) {
    const n = re.length;
    for (let i = 0; i < n; i++) {
      const s = spOf(i);
      if (s < gStart) continue;
      if (s > gEnd) break;
      if (Math.abs(re[i]) * gl >= levelPct) {
        // puncak lobus pertama: cari maksimum dalam ±0,6 mm setelah melewati level
        let best = Math.abs(re[i]), bi = i;
        for (let j = i + 1; j < n && spOf(j) - s < 0.6; j++) if (Math.abs(re[j]) > best) { best = Math.abs(re[j]); bi = j; }
        return spOf(bi);
      }
    }
    return null;
  };
})(typeof window !== 'undefined' ? window : globalThis);
