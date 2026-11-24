/*
 * Mesin lintasan berkas umum: sumbu berkas sebagai polyline (pantulan & pembelokan sebenarnya),
 * bukan metode bayangan pelat datar. Dipakai untuk:
 *   1) las memanjang (seam) pada pipa – berkas di bidang keliling, memantul di dinding dalam/luar
 *      yang lengkung (anulus);
 *   2) pembelokan berkas (beam skewing) di logam las austenitik yang anisotropik.
 * Fungsi murni (tanpa DOM) sehingga bisa diuji di Node.
 *
 * Koordinat bidang (u, v): u mendatar, v ke bawah (kedalaman). Untuk pelat datar (u, v) = (x, z).
 * Untuk pipa: puncak dinding luar di (0, 0), pusat pipa di (0, Ro).
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});
  const DEG = Math.PI / 180;

  // ------------------------------------------------------------------ pemetaan pipa (seam)
  /** Titik datar (x = busur di permukaan luar, z = kedalaman) → bidang anulus (u, v). */
  UT.seamToUV = function (Ro, x, z) {
    const ph = x / Ro, rho = Ro - z;
    return { u: rho * Math.sin(ph), v: Ro - rho * Math.cos(ph), ph };
  };
  /** Kebalikan seamToUV. */
  UT.seamFromUV = function (Ro, u, v) {
    const ph = Math.atan2(u, Ro - v), rho = Math.hypot(u, Ro - v);
    return { x: Ro * ph, z: Ro - rho };
  };
  /** Putar vektor (a = komponen searah keliling, b = komponen ke dalam) pada sudut φ ke bidang (u, v). */
  const rot = (ph, a, b) => ({ u: a * Math.cos(ph) - b * Math.sin(ph), v: a * Math.sin(ph) + b * Math.cos(ph) });

  /** Pemandangan (titik cacat, reflektor sudut, butir) yang dipetakan ke bidang anulus. Disimpan di spec. */
  UT.seamScene = function (spec) {
    if (spec._seamScene) return spec._seamScene;
    const Ro = spec.R;
    const points = spec.scene.points.map((p) => {
      const q = UT.seamToUV(Ro, p.x, p.z);
      const n = rot(q.ph, p.nx, p.nz);
      return Object.assign({}, p, { x: q.u, z: q.v, nx: n.u, nz: n.v });
    });
    const corners = spec.scene.corners.map((c) => {
      const q = UT.seamToUV(Ro, c.x, c.z);
      const t = rot(q.ph, 1, 0), nrm = rot(q.ph, 0, 1);
      return Object.assign({}, c, { x: q.u, z: q.v, tx: t.u, tz: t.v, nrmx: nrm.u, nrmz: nrm.v });
    });
    const gr = spec.grain;
    const xs = new Float32Array(gr.n), zs = new Float32Array(gr.n);
    for (let i = 0; i < gr.n; i++) { const q = UT.seamToUV(Ro, gr.xs[i], gr.zs[i]); xs[i] = q.u; zs[i] = q.v; }
    spec._seamScene = { points, corners, grain: { n: gr.n, xs, zs, ws: gr.ws, inWeld: gr.inWeld } };
    return spec._seamScene;
  };

  // ------------------------------------------------------------------ penelusur sinar
  /**
   * Sinar di dinding pipa (bidang keliling). o: { Ro, T, x0 (busur exit point), dir, angle, spMax }
   * Hasil: { pts:[{x,z,s}], hitsID } – x,z = (u,v).
   */
  UT.tracePipe = function (o) {
    const Ro = o.Ro, Ri = Ro - o.T, C = { u: 0, v: Ro };
    const P0 = UT.seamToUV(Ro, o.x0, 0);
    let p = { u: P0.u, v: P0.v };
    const nin = { u: (C.u - p.u) / Ro, v: (C.v - p.v) / Ro };
    const tg = rot(P0.ph, 1, 0);
    const th = o.angle * DEG;
    let d = { u: Math.cos(th) * nin.u + Math.sin(th) * o.dir * tg.u, v: Math.cos(th) * nin.v + Math.sin(th) * o.dir * tg.v };
    const pts = [{ x: p.u, z: p.v, s: 0 }];
    let s = 0, hitsID = false;
    for (let k = 0; k < 40 && s < o.spMax; k++) {
      const ox = p.u - C.u, oz = p.v - C.v;
      const b = ox * d.u + oz * d.v, c0 = ox * ox + oz * oz;
      let t = null, R = Ro;
      const discI = b * b - (c0 - Ri * Ri);
      if (discI > 0) {
        const t1 = -b - Math.sqrt(discI);
        if (t1 > 1e-6) { t = t1; R = Ri; }
      }
      if (t == null) {
        const discO = b * b - (c0 - Ro * Ro);
        t = -b + Math.sqrt(Math.max(0, discO));
        R = Ro;
      }
      if (s + t > o.spMax) t = o.spMax - s;
      p = { u: p.u + t * d.u, v: p.v + t * d.v };
      s += t;
      pts.push({ x: p.u, z: p.v, s });
      if (s >= o.spMax - 1e-9) break;
      if (R === Ri) hitsID = true;
      const nx = (p.u - C.u) / R, nz = (p.v - C.v) / R;
      const dn = d.u * nx + d.v * nz;
      d = { u: d.u - 2 * dn * nx, v: d.v - 2 * dn * nz };
    }
    return { pts, hitsID };
  };

  /**
   * Sudut sumbu butir kolumnar (rad, dari vertikal, positif condong ke +x) di logam las austenitik:
   * tegak di tengah las, makin condong (tegak lurus garis fusi) mendekati dinding bevel.
   */
  UT.grainAngle = function (w, x, z) {
    const fx = Math.max(0.5, UT.fusionX(w, z, 1));
    const f = Math.max(-1, Math.min(1, x / fx));
    return -f * Math.min(1.2, w.beta * 1.1); // butir tumbuh dari dinding bevel ke arah tengah dan ke atas
  };

  /**
   * Sinar di pelat datar dengan pembelokan di logam las anisotropik.
   * o: { x0, dir, angle, T, spMax, weld, skew (amplitudo pembelokan, derajat) }
   * Arah fase tetap = sudut probe; di dalam las arah energi berbelok
   *   Δ = skew · sin(2(φ − γ)), φ = arah sinar dari vertikal, γ = sumbu butir.
   */
  UT.tracePlate = function (o) {
    const T = o.T, w = o.weld, A = (o.skew || 0) * DEG, step = 0.25;
    const th = o.angle * DEG;
    let x = o.x0, z = 0, s = 0, vz = 1; // vz: +1 turun, −1 naik
    const pts = [{ x, z, s }];
    let lastAng = null;
    while (s < o.spMax) {
      // arah fase (dari vertikal, bertanda menurut arah horizontal & vertikal)
      let phi = th;
      let ang = phi; // arah energi
      if (A && w && Math.abs(x) < UT.fusionX(w, Math.min(T, Math.max(0, z)), 1)) {
        // sudut sinar terhadap vertikal dalam kerangka fisik (positif = ke +x saat turun)
        const phys = o.dir * phi * vz;
        const gam = UT.grainAngle(w, x, z);
        const dl = A * Math.sin(2 * (phys - gam));
        ang = phi + o.dir * vz * dl;
      }
      const dx = o.dir * Math.sin(ang) * step, dz = vz * Math.cos(ang) * step;
      let nx = x + dx, nz = z + dz, ds = step;
      if (nz > T || nz < 0) {
        const zt = nz > T ? T : 0;
        const f = (zt - z) / dz;
        nx = x + dx * f; nz = zt; ds = step * f;
        x = nx; z = nz; s += ds;
        pts.push({ x, z, s });
        vz = -vz;
        lastAng = null;
        continue;
      }
      x = nx; z = nz; s += ds;
      if (lastAng == null || Math.abs(ang - lastAng) > 0.002) { pts.push({ x, z, s }); lastAng = ang; }
      else pts[pts.length - 1] = { x, z, s }; // segmen lurus: perpanjang titik terakhir
    }
    // pastikan titik terakhir tidak lewat spMax
    return { pts };
  };

  /** Lokasi reflektor menurut alat dengan koreksi lengkung (las memanjang pipa). */
  UT.locatePipe = function (sp, angle, Ro, T, xE, dir) {
    const path = UT.tracePipe({ Ro, T, x0: xE, dir, angle, spMax: Math.max(0.01, sp) + 0.01 });
    const q = UT.pathPoint(path, sp);
    const f = UT.seamFromUV(Ro, q.x, q.z);
    return { depth: f.z, x: f.x, sd: Math.abs(f.x - xE), leg: q.seg + 1, path };
  };

  /** Titik pada lintasan untuk SP tertentu. */
  UT.pathPoint = function (path, sp) {
    const P = path.pts;
    for (let i = 1; i < P.length; i++) {
      if (sp <= P[i].s || i === P.length - 1) {
        const a = P[i - 1], b = P[i], t = b.s > a.s ? Math.min(1, Math.max(0, (sp - a.s) / (b.s - a.s))) : 0;
        return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, seg: i - 1 };
      }
    }
    return { x: P[0].x, z: P[0].z, seg: 0 };
  };

  /**
   * Simulasi A-scan sepanjang lintasan umum.
   * opts: { probe:{freq, crystal, wave, y}, mat, path, scene:{points, corners}, grain, spStart, spEnd, n,
   *         mainBangSP, coupling, weldAtt: fungsi(x,z)→bool di dalam las (opsional) }
   */
  UT.simulatePath = function (opts) {
    const { probe, mat, path, scene, spStart, spEnd, n } = opts;
    const d = UT.probeDerived(Object.assign({ angle: 0 }, probe), mat);
    const tg = Math.tan(d.gamma6), w0 = 0.25 * probe.crystal, N0 = Math.max(d.N, 1);
    const wave = probe.wave === 'L' ? 'L' : 'T';
    const alpha = UT.attenDbPerMm(probe.freq) * (mat.att ? mat.att[wave] : 1);
    const attK = (-alpha * 2 * Math.LN10) / 20;
    const wAtt = opts.inWeld && mat.weldAtt ? mat.weldAtt[wave] : 0;
    const wK = (-wAtt * 2 * Math.LN10) / 20;
    const coup = opts.coupling || { gain: 1, yScale: 1 };
    const yP = probe.y == null ? 0 : probe.y;
    const halfLambda = d.lambda / 2, kw = (2 * Math.PI) / halfLambda;
    const tau = 0.6 * d.lambda, invTau2 = 1 / (tau * tau), win = 3 * tau;
    const re = new Float32Array(n);
    const dsp = (spEnd - spStart) / (n - 1);
    function add(r, a) {
      if (r + win < spStart || r - win > spEnd) return;
      let j0 = Math.ceil((r - win - spStart) / dsp), j1 = Math.floor((r + win - spStart) / dsp);
      if (j0 < 0) j0 = 0;
      if (j1 > n - 1) j1 = n - 1;
      for (let j = j0; j <= j1; j++) {
        const u = spStart + j * dsp - r;
        re[j] += a * Math.exp(-u * u * invTau2) * Math.cos(kw * u);
      }
    }
    // Segmen lintasan + panjang kumulatif di dalam logam las
    const P = path.pts, segs = [];
    let wl = 0;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], len = b.s - a.s;
      if (len <= 1e-9) continue;
      const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
      let inside = 0;
      if (wAtt > 0) { const N = Math.max(2, Math.ceil(len / 1)); for (let k = 0; k < N; k++) { const t = (k + 0.5) / N; if (opts.inWeld(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) inside++; } }
      segs.push({ ax: a.x, az: a.z, s0: a.s, len, ux, uz, wl0: wl, wfrac: wAtt > 0 ? inside / Math.max(2, Math.ceil(len / 1)) : 0 });
      wl += wAtt > 0 ? (inside / Math.max(2, Math.ceil(len / 1))) * len : 0;
    }
    const rMax = spEnd + win, rMin = spStart - win;
    // Untuk satu titik: semua segmen yang "melihat" titik itu → (r, amplitudo berkas, arah sinar)
    function each(x, z, fn) {
      for (let i = 0; i < segs.length; i++) {
        const sg = segs[i];
        if (sg.s0 > rMax) break;
        const px = x - sg.ax, pz = z - sg.az;
        const t = px * sg.ux + pz * sg.uz;
        if (t < 0 || t >= sg.len) continue;
        const perp = px * sg.uz - pz * sg.ux;
        const al = sg.s0 + t;
        const r = Math.sqrt(al * al + perp * perp); // jarak dari sumber (bayangan) sepanjang lintasan
        if (r < rMin || r > rMax) continue;
        // arah datang gelombang di titik: sumbu berkas dimiringkan oleh offset tegak lurus
        const dx = (al * sg.ux + perp * sg.uz) / r, dz = (al * sg.uz - perp * sg.ux) / r;
        const w6sq = w0 * w0 + (al * tg) ** 2;
        const q2 = (perp * perp) / w6sq;
        if (q2 > 14) continue;
        const spread = Math.pow(N0 / Math.sqrt(N0 * N0 + r * r), 1.5);
        let a = Math.pow(0.5, q2) * spread * Math.exp(attK * r);
        if (wAtt > 0) a *= Math.exp(wK * (sg.wl0 + sg.wfrac * t));
        fn(r, a, dx, dz, Math.sqrt(w6sq) * (coup.yScale || 1));
      }
    }
    // 1) titik permukaan cacat
    scene.points.forEach((p) => {
      each(p.x, p.z, (r, b, ux, uz, bw6) => {
        let c = -(p.nx * ux + p.nz * uz);
        c = p.two ? Math.abs(c) : c;
        if (c <= 0) return;
        let a = p.w * c * b;
        if (p.y1 != null) a *= UT.yFactor(p.y1, p.y2, yP, bw6);
        add(r, a);
      });
    });
    // 2) reflektor sudut (akar, kaki cap, IP, ujung pelat)
    scene.corners.forEach((c) => {
      const tx = c.tx == null ? 1 : c.tx, tz = c.tz == null ? 0 : c.tz;
      const nx = c.nrmx == null ? 0 : c.nrmx, nz = c.nrmz == null ? 1 : c.nrmz;
      each(c.x, c.z, (r, b, ux, uz, bw6) => {
        const along = ux * tx + uz * tz;
        if (c.face && Math.sign(along) !== -c.face) return;
        const phi = Math.acos(Math.min(1, Math.abs(ux * nx + uz * nz))) / DEG;
        let a = Math.min(c.s, 2 * bw6) * UT.cornerFactor(phi) * b;
        if (c.y1 != null) a *= UT.yFactor(c.y1, c.y2, yP, bw6);
        add(r, a);
      });
    });
    // 3) butir
    const gr = opts.grain;
    if (gr) {
      const gB = mat.grainBase ? mat.grainBase[wave] : 1, gW = mat.grainWeld ? mat.grainWeld[wave] : 1;
      for (let i = 0; i < gr.n; i++) {
        const wgt = gr.ws[i] * (gr.inWeld && gr.inWeld[i] ? gW : gB);
        each(gr.xs[i], gr.zs[i], (r, b) => add(r, wgt * b));
      }
    }
    if (coup.gain !== 1) for (let j = 0; j < n; j++) re[j] *= coup.gain;
    // 4) pulsa awal
    if (opts.mainBangSP != null) {
      const mb = opts.mainBangSP, ring = 2.4 * halfLambda;
      const j0 = Math.max(0, Math.ceil((mb - win - spStart) / dsp));
      const j1 = Math.min(n - 1, Math.floor((mb + ring * 8 - spStart) / dsp));
      for (let j = j0; j <= j1; j++) {
        const u = spStart + j * dsp - mb;
        const env = u < 0 ? Math.exp(-u * u * invTau2) : Math.exp(-u / ring);
        re[j] += 20 * env * Math.cos(kw * u);
      }
    }
    return { re, spStart, spEnd, n };
  };
})(typeof window !== 'undefined' ? window : globalThis);
