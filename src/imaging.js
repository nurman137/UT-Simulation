/*
 * Teknik pencitraan: B-scan (UT konvensional), S-scan Phased Array, dan TOFD.
 * Fungsi murni (tanpa DOM) sehingga bisa diuji di Node.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});
  const DEG = Math.PI / 180;

  // ------------------------------------------------------------------ Phased Array
  UT.PAUT = {
    freq: 5,
    elements: 16,
    pitch: 0.6,
    get aperture() { return this.elements * this.pitch; }, // 9,6 mm
    minA: 40,
    maxA: 70,
    step: 1,
  };
  UT.PAUT.total = 64; // jumlah elemen probe untuk E-scan (aperture aktif 16 elemen digeser)
  UT.PAUT.eBeams = UT.PAUT.total - UT.PAUT.elements + 1;
  /** Pergeseran exit point berkas E-scan ke-i terhadap pusat probe (mm). */
  UT.escanOffset = (i) => (i - (UT.PAUT.eBeams - 1) / 2) * UT.PAUT.pitch;

  /**
   * Delay law (ns) untuk aperture aktif: berkas dibelokkan ke sudut θ dan (opsional) difokuskan
   * pada jarak F sepanjang berkas. Disederhanakan: elemen dianggap langsung di permukaan baja (v).
   */
  UT.delayLaw = function (angle, F, v) {
    const n = UT.PAUT.elements, p = UT.PAUT.pitch, th = angle * DEG, vv = v / 1e6; // mm/ns
    const xs = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * p);
    let L;
    if (F) {
      const xf = F * Math.sin(th), zf = F * Math.cos(th);
      L = xs.map((x) => Math.hypot(xf - x, zf));
    } else {
      L = xs.map((x) => -x * Math.sin(th)); // muka gelombang datar
    }
    const mx = Math.max(...L);
    return L.map((l) => (mx - l) / vv);
  };

  UT.pautAngles = () => {
    const a = [];
    for (let x = UT.PAUT.minA; x <= UT.PAUT.maxA + 1e-9; x += UT.PAUT.step) a.push(x);
    return a;
  };

  /** Ringkas sinyal RF menjadi 'rows' bin: nilai |amplitudo| maksimum per bin (mentah, sebelum gain). */
  UT.envelopeBins = function (re, rows) {
    const out = new Float32Array(rows);
    const n = re.length;
    for (let r = 0; r < rows; r++) {
      const i0 = Math.floor((r * n) / rows), i1 = Math.max(i0 + 1, Math.floor(((r + 1) * n) / rows));
      let m = 0;
      for (let i = i0; i < i1 && i < n; i++) { const v = Math.abs(re[i]); if (v > m) m = v; }
      out[r] = m;
    }
    return out;
  };

  /** Seperti envelopeBins tetapi mempertahankan tanda sampel terbesar (untuk tampilan RF TOFD). */
  UT.signedBins = function (re, rows) {
    const out = new Float32Array(rows);
    const n = re.length;
    for (let r = 0; r < rows; r++) {
      const i0 = Math.floor((r * n) / rows), i1 = Math.max(i0 + 1, Math.floor(((r + 1) * n) / rows));
      let m = 0;
      for (let i = i0; i < i1 && i < n; i++) if (Math.abs(re[i]) > Math.abs(m)) m = re[i];
      out[r] = m;
    }
    return out;
  };

  /**
   * Akuisisi progresif: menghitung kolom gambar sedikit demi sedikit per frame
   * agar antarmuka tetap responsif. compute(i) → Float32Array(rows).
   */
  UT.ProgressiveScan = function (count, rows, compute, meta) {
    this.count = count;
    this.rows = rows;
    this.compute = compute;
    this.meta = meta || {};
    this.data = new Float32Array(count * rows);
    this.done = 0;
  };
  UT.ProgressiveScan.prototype.step = function (budgetMs) {
    const t0 = Date.now();
    while (this.done < this.count && Date.now() - t0 < budgetMs) {
      this.data.set(this.compute(this.done), this.done * this.rows);
      this.done++;
    }
    return this.done >= this.count;
  };
  UT.ProgressiveScan.prototype.runAll = function () {
    while (this.done < this.count) this.step(1e9);
    return this;
  };
  Object.defineProperty(UT.ProgressiveScan.prototype, 'progress', { get() { return this.done / this.count; } });

  // ------------------------------------------------------------------ TOFD
  UT.TOFD = {
    freq: 5,
    crystal: 6,
    angle: 60,
    // Skala amplitudo: semua hamburan (cacat, back wall) memakai mekanisme yang sama;
    // gelombang lateral sebagai fraksi dari puncak back wall.
    LW: 0.35, DIFF: 1.0, GRAIN: 0.5,
  };

  /** PCS bawaan: perpotongan sumbu berkas pada 2/3 T. Mengembalikan setengah PCS (S). */
  UT.tofdDefaultS = (T, angle) => (2 / 3) * T * Math.tan(angle * DEG);

  /** Waktu tempuh (µs) dari kedalaman d untuk reflektor di tengah kedua probe. */
  UT.tofdTime = (d, S, vL) => (2 * Math.sqrt(S * S + d * d)) / (vL / 1000);
  /** Kedalaman dari waktu tempuh (µs); null bila sebelum gelombang lateral. */
  UT.tofdDepth = function (t, S, vL) {
    const h = (t * (vL / 1000)) / 2;
    return h < S ? null : Math.sqrt(h * h - S * S);
  };

  /**
   * Simulasi A-scan TOFD (pitch-catch gelombang longitudinal, sinyal RF).
   * o: { S (setengah PCS), angle, freq, crystal, y, T, scene, grain, tStart, tEnd, n, mat }
   * Pemancar di x = −S, penerima di x = +S, keduanya menghadap sumbu las.
   * Fase: gelombang lateral (+), back wall (−), ujung atas cacat (−), ujung bawah (+).
   */
  UT.simulateTOFD = function (o) {
    const K = UT.TOFD;
    const v = o.mat.vL / 1000; // mm/µs
    const lambda = o.mat.vL / (o.freq * 1000);
    const f = o.freq;
    const tau = 0.55 / f, invTau2 = 1 / (tau * tau), win = 3 * tau, kw = 2 * Math.PI * f;
    const gam = Math.asin(Math.min(0.95, (1.2 * lambda) / o.crystal));
    const th = o.angle * DEG;
    const S = o.S, T = o.T, yP = o.y == null ? 0 : o.y;
    const n = o.n, re = new Float32Array(n);
    const dt = (o.tEnd - o.tStart) / (n - 1);
    const Lref = 60;

    function add(t, a, useSin, arr) {
      arr = arr || re;
      if (t + win < o.tStart || t - win > o.tEnd) return;
      let j0 = Math.ceil((t - win - o.tStart) / dt), j1 = Math.floor((t + win - o.tStart) / dt);
      if (j0 < 0) j0 = 0;
      if (j1 > n - 1) j1 = n - 1;
      for (let j = j0; j <= j1; j++) {
        const u = o.tStart + j * dt - t;
        const e = Math.exp(-u * u * invTau2);
        arr[j] += a * e * (useSin ? Math.sin(kw * u) : Math.cos(kw * u));
      }
    }
    // Directivity satu arah: sudut terhadap vertikal dibanding sudut berkas
    const dir1 = (dx, z) => {
      const off = (Math.atan2(dx, Math.max(z, 1e-6)) - th) / gam;
      return Math.exp(-Math.LN2 * off * off);
    };

    // Hamburan satu titik (Huygens): pembawa sinus agar integral garis memberi fase tepi yang benar
    const point = (x, z, wgt, arr) => {
      const dx1 = x + S, dx2 = S - x;
      if (dx1 <= 0 || dx2 <= 0) return 0;
      const L1 = Math.hypot(dx1, z), L2 = Math.hypot(dx2, z);
      const a = wgt * dir1(dx1, z) * dir1(dx2, z) * (Lref / Math.sqrt(L1 * L2));
      if (Math.abs(a) < 1e-7) return 0;
      add((L1 + L2) / v, a, true, arr);
      return { L1, L2, a };
    };

    // Back wall: deretan titik di dasar pelat (pantulan bebas → fase terbalik)
    const bw = new Float32Array(n);
    const span = S + 25;
    for (let x = -span; x <= span; x += 0.1) point(x, T, -K.DIFF * 0.1, bw);
    let bwPeak = 0;
    for (let j = 0; j < n; j++) { re[j] += bw[j]; if (Math.abs(bw[j]) > bwPeak) bwPeak = Math.abs(bw[j]); }
    if (!(bwPeak > 0)) {
      // back wall di luar jendela waktu: hitung puncaknya dengan jendela sementara
      bwPeak = UT.tofdBwPeak ? UT.tofdBwPeak(o) : 1;
    }
    // Gelombang lateral (menjalar tepat di bawah permukaan)
    add((2 * S) / v, K.LW * bwPeak, false);

    // Difraksi / hamburan dari titik-titik cacat (hanya lintasan langsung, leg 1)
    const pts = o.scene.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.z < 0 || p.z >= T) continue;
      let wgt = K.DIFF * 0.1 * (p.tr == null ? 1 : p.tr); // tr: koefisien pantul untuk TOFD (slag < pori gas)
      if (p.y1 != null) {
        const zz = Math.max(p.z, 1);
        const Lm = Math.hypot(S, zz);
        const w6 = 0.25 * o.crystal + Lm * Math.tan(gam) * 0.5;
        wgt *= UT.yFactor(p.y1, p.y2, yP, w6);
      }
      if (wgt > 1e-6) point(p.x, p.z, wgt);
    }
    // Hamburan butir
    if (o.grain) {
      const { xs, zs, ws, inWeld } = o.grain;
      const m = o.mat;
      const gB = m.grainBase ? m.grainBase.L : 1, gW = m.grainWeld ? m.grainWeld.L : 1;
      for (let i = 0; i < o.grain.n; i++) point(xs[i], zs[i], K.GRAIN * ws[i] * (inWeld && inWeld[i] ? gW : gB));
    }
    return { re, tStart: o.tStart, tEnd: o.tEnd, n, bwPeak };
  };

  /** Puncak back wall (untuk skala gelombang lateral bila back wall di luar jendela tampilan). */
  UT.tofdBwPeak = function (o) {
    const W = UT.tofdWindow(o.S, o.T, o.mat.vL);
    const r = UT.simulateTOFD(Object.assign({}, o, {
      scene: { points: [] }, grain: null, tStart: W.tBw - 1, tEnd: W.tBw + 1, n: 400,
    }));
    return r.bwPeak || 1;
  };

  /** Jendela waktu TOFD yang wajar: sedikit sebelum gelombang lateral sampai setelah back wall. */
  UT.tofdWindow = function (S, T, vL) {
    const tl = UT.tofdTime(0, S, vL), tb = UT.tofdTime(T, S, vL);
    const m = Math.max(1.5, 0.25 * (tb - tl));
    return { tStart: Math.max(0, tl - m), tEnd: tb + m * 1.6, tLat: tl, tBw: tb };
  };
})(typeof window !== 'undefined' ? window : globalThis);
