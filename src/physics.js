/*
 * Mesin simulasi sinyal A-scan (pulse-echo, gelombang geser, probe sudut).
 *
 * Model (disederhanakan untuk edukasi):
 *   - Lintasan: sinar lurus dengan pantulan di permukaan atas/bawah (metode bayangan / unfolding).
 *   - Waktu echo: dinyatakan langsung dalam sound path (SP) baja, t = 2·SP / vT.
 *   - Amplitudo setiap titik reflektor:
 *         A = w · cos(insiden) · D(lateral) · S(r) · e^(−α·2r)
 *     D  = profil berkas Gaussian (−6 dB pada setengah lebar berkas, termasuk near field)
 *     S  = penyebaran berkas (≈ r^-1.5 setelah near field)
 *     α  = atenuasi (naik terhadap frekuensi)
 *   - Pulsa: sinus termodulasi Gaussian pada frekuensi probe. Semua kontribusi dijumlahkan
 *     secara koheren sehingga interferensi (spekular vs difraksi ujung) muncul dengan sendirinya.
 *   - Reflektor sudut (corner trap) memakai faktor pantul fungsi sudut berkas.
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});
  const RAD2DEG = 180 / Math.PI;

  // Faktor pantul reflektor sudut 90° untuk gelombang geser di baja (pendekatan kualitatif):
  // tinggi di sekitar 35°–55°, turun di sekitar 30° dan di atas 60° (konversi mode).
  const CORNER_TABLE = [
    [0, 0.1], [25, 0.15], [30, 0.35], [35, 0.8], [40, 1], [50, 1],
    [55, 0.85], [60, 0.6], [65, 0.4], [70, 0.28], [80, 0.2], [90, 0.1],
  ];

  function interp(tab, x) {
    if (x <= tab[0][0]) return tab[0][1];
    for (let i = 1; i < tab.length; i++) {
      if (x <= tab[i][0]) {
        const [x0, y0] = tab[i - 1], [x1, y1] = tab[i];
        return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      }
    }
    return tab[tab.length - 1][1];
  }

  UT.cornerFactor = (deg) => interp(CORNER_TABLE, deg);

  /** Fungsi error (Abramowitz & Stegun 7.1.26, galat < 1.5e-7). */
  UT.erf = function (x) {
    const s = x < 0 ? -1 : 1;
    const a = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * a);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
    return s * y;
  };

  /**
   * Faktor panjang reflektor searah sumbu las (y): bagian berkas (profil Gaussian, lebar −6 dB = w6)
   * yang mengenai reflektor dari y1 sampai y2 bila sumbu berkas di yp.
   * Reflektor panjang → 1; tepat di ujung reflektor panjang → 0,5 (−6 dB, dasar metode 6 dB drop).
   */
  UT.yFactor = function (y1, y2, yp, w6) {
    const k = Math.sqrt(Math.LN2) / w6;
    return 0.5 * (UT.erf(k * (y2 - yp)) - UT.erf(k * (y1 - yp)));
  };

  /** Atenuasi satu arah (dB/mm) gelombang geser di baja karbon, naik terhadap frekuensi. */
  UT.attenDbPerMm = (fMHz) => 0.0045 * Math.pow(fMHz, 1.4);

  /**
   * Simulasikan sinyal RF mentah.
   * opts: { probe:{x,y,dir,angle,freq,crystal}, mat, T, scene, grain, spStart, spEnd, n, mainBangSP }
   * spStart/spEnd dalam SP baja yang sebenarnya (mm). mainBangSP (opsional, negatif) = posisi
   * pulsa awal (saat kristal ditembakkan) dalam SP baja ekuivalen; bagian negatif berada di dalam wedge.
   * Titik/sudut dengan y1,y2 punya panjang terbatas searah sumbu las; tanpa y1 dianggap menerus.
   * Titik dengan rep {n, step, decay} memberi echo berulang (mis. R100 blok IIW).
   * Mengembalikan { re: Float32Array, spStart, spEnd, n }.
   */
  UT.simulate = function (opts) {
    const { probe, mat, T, scene, grain, spStart, spEnd } = opts;
    const n = opts.n;
    const d = UT.probeDerived(probe, mat);
    const th = d.theta;
    const sn = Math.sin(th), cs = Math.cos(th), tg = Math.tan(d.gamma6);
    const w0 = 0.25 * probe.crystal;
    const N0 = Math.max(d.N, 1);
    const alpha = UT.attenDbPerMm(probe.freq);
    const attK = (-alpha * 2 * Math.LN10) / 20; // e^(attK·r)
    const xE = probe.x, dir = probe.dir;
    const yP = probe.y == null ? 0 : probe.y;

    const halfLambda = d.lambda / 2; // periode pulsa dalam domain SP (pulse-echo)
    const kw = (2 * Math.PI) / halfLambda;
    const tau = 0.6 * d.lambda;
    const invTau2 = 1 / (tau * tau);
    const win = 3 * tau;

    const re = new Float32Array(n);
    const dsp = (spEnd - spStart) / (n - 1);
    const maxLeg = Math.min(12, Math.ceil(((spEnd + win) * Math.cos(Math.max(0, th - 4 * d.gamma6))) / T) + 1);

    function add(r, a) {
      if (r + win < spStart || r - win > spEnd) return;
      let j0 = Math.ceil((r - win - spStart) / dsp);
      let j1 = Math.floor((r + win - spStart) / dsp);
      if (j0 < 0) j0 = 0;
      if (j1 > n - 1) j1 = n - 1;
      for (let j = j0; j <= j1; j++) {
        const u = spStart + j * dsp - r;
        re[j] += a * Math.exp(-u * u * invTau2) * Math.cos(kw * u);
      }
    }

    // Hasil sementara dari beam()
    let bR = 0, bDx = 0, bW6 = 0;
    function beam(x, zu) {
      const dxh = dir * (x - xE);
      const along = dxh * sn + zu * cs;
      if (along <= 0) return 0;
      const perp = dxh * cs - zu * sn;
      const wr = along * tg;
      const w6sq = w0 * w0 + wr * wr;
      const q2 = (perp * perp) / w6sq;
      if (q2 > 14) return 0;
      const r = Math.sqrt(dxh * dxh + zu * zu);
      bR = r; bDx = dxh; bW6 = Math.sqrt(w6sq);
      const spread = Math.pow(N0 / Math.sqrt(N0 * N0 + r * r), 1.5);
      return Math.pow(0.5, q2) * spread * Math.exp(attK * r);
    }

    const rMin = spStart - win, rMax = spEnd + win;

    // 1) Titik-titik permukaan cacat
    const pts = scene.points;
    for (let leg = 1; leg <= maxLeg; leg++) {
      const odd = leg % 2 === 1;
      const base = odd ? (leg - 1) * T : leg * T;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const zu = odd ? base + p.z : base - p.z;
        const b = beam(p.x, zu);
        if (b === 0 || bR > rMax) continue;
        if (bR < rMin && !(p.rep && bR + p.rep.n * p.rep.step >= rMin)) continue;
        const ux = (xE - p.x) / bR, uz = -zu / bR;
        const nzi = odd ? p.nz : -p.nz;
        let c = p.nx * ux + nzi * uz;
        c = p.two ? Math.abs(c) : c;
        if (c <= 0) continue;
        let a = p.w * c * b;
        if (p.y1 != null) a *= UT.yFactor(p.y1, p.y2, yP, bW6);
        add(bR, a);
        if (p.rep) {
          let ar = a;
          for (let k = 1; k <= p.rep.n; k++) { ar *= p.rep.decay; add(bR + k * p.rep.step, ar); }
        }
      }
    }

    // 2) Reflektor sudut (geometri las, IP, retak akar, ujung pelat)
    const corners = scene.corners;
    for (let i = 0; i < corners.length; i++) {
      const c = corners[i];
      if (c.face && c.face !== -dir) continue;
      const seen = {};
      for (let leg = 1; leg <= maxLeg; leg++) {
        const zu = UT.imageDepth(c.z, leg, T);
        if (zu < 1e-6) continue;
        const key = Math.round(zu * 1000);
        if (seen[key]) continue;
        seen[key] = true;
        const b = beam(c.x, zu);
        if (b === 0 || bR < rMin || bR > rMax) continue;
        const phi = Math.atan2(Math.abs(bDx), zu) * RAD2DEG;
        const sEff = Math.min(c.s, 2 * bW6);
        let a = sEff * UT.cornerFactor(phi) * b;
        if (c.y1 != null) a *= UT.yFactor(c.y1, c.y2, yP, bW6);
        add(bR, a);
      }
    }

    // 3) Hamburan butir (grain noise)
    if (grain) {
      const { xs, zs, ws } = grain;
      for (let leg = 1; leg <= maxLeg; leg++) {
        const odd = leg % 2 === 1;
        const base = odd ? (leg - 1) * T : leg * T;
        for (let i = 0; i < grain.n; i++) {
          const zu = odd ? base + zs[i] : base - zs[i];
          const b = beam(xs[i], zu);
          if (b === 0 || bR < rMin || bR > rMax) continue;
          add(bR, ws[i] * b);
        }
      }
    }

    // 4) Pulsa awal (main bang) + gema internal wedge
    if (opts.mainBangSP != null) {
      const mb = opts.mainBangSP;
      if (mb - win < spEnd) {
        const j0 = Math.max(0, Math.ceil((mb - win - spStart) / dsp));
        const ring = 1.2 * halfLambda * 6; // panjang ringing
        const j1 = Math.min(n - 1, Math.floor((mb + ring * 4 - spStart) / dsp));
        for (let j = j0; j <= j1; j++) {
          const u = spStart + j * dsp - mb;
          const env = u < 0 ? Math.exp(-u * u * invTau2) : Math.exp(-u / ring);
          re[j] += 60 * env * Math.cos(kw * u);
        }
      }
      // gema wedge (lemah, acak tetap) antara pulsa awal dan permukaan
      const rnd = UT.rng(777);
      for (let s = mb + 2; s < -0.5; s += 0.7) add(s, 0.02 + 0.05 * rnd());
    }

    return { re, spStart, spEnd, n };
  };

  /**
   * Cari puncak di dalam gate. values = amplitudo tampilan (%FSH, sudah direktifikasi),
   * sp(i) = SP tampilan untuk indeks i. Mengembalikan { amp, sp, idx, triggered }.
   */
  UT.gatePeak = function (values, spOf, gStart, gEnd, level) {
    let best = -1, bi = -1;
    for (let i = 0; i < values.length; i++) {
      const s = spOf(i);
      if (s < gStart || s > gEnd) continue;
      const v = Math.abs(values[i]);
      if (v > best) { best = v; bi = i; }
    }
    if (bi < 0) return { amp: 0, sp: null, idx: -1, triggered: false };
    return { amp: best, sp: spOf(bi), idx: bi, triggered: best >= level };
  };
})(typeof window !== 'undefined' ? window : globalThis);
