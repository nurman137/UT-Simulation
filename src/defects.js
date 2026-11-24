/*
 * Model cacat las dan reflektor geometri.
 *
 * Setiap cacat direpresentasikan sebagai kumpulan titik permukaan (jarak ~0,1 mm)
 * yang masing-masing memancarkan kembali gelombang (prinsip Huygens/Kirchhoff).
 * Penjumlahan koheren titik-titik ini menghasilkan secara alami:
 *   - pantulan spekular kuat bila permukaan cacat tegak lurus berkas,
 *   - echo lemah dari ujung (difraksi) bila permukaan miring,
 *   - echo panjang/bergerigi dari cacat tak beraturan.
 *
 * Titik: { x, z, nx, nz, w, two }
 *   (nx, nz) = normal permukaan (mengarah ke baja), w = bobot (panjang x reflektivitas),
 *   two = true bila memantul dari dua sisi (retak, LOF).
 * Sudut (corner): reflektor sudut 90° (mis. akar las, IP, ujung pelat) dimodelkan
 *   sebagai satu titik dengan faktor pantul sudut (corner trap).
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});
  const DS = 0.1; // jarak sampling titik (mm), << lambda/2

  function samplePolyline(out, pts, opt) {
    const ds = opt.ds || DS;
    const refl = opt.refl == null ? 1 : opt.refl;
    const closed = !!opt.closed;
    const two = opt.two == null ? !closed : opt.two;
    let cx = 0, cz = 0;
    pts.forEach((p) => { cx += p[0]; cz += p[1]; });
    cx /= pts.length; cz /= pts.length;
    const nseg = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < nseg; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 1e-9) continue;
      let nx = -dz / len, nz = dx / len;
      if (opt.normal) { nx = opt.normal[0]; nz = opt.normal[1]; }
      const n = Math.max(1, Math.ceil(len / ds));
      const step = len / n;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = a[0] + dx * t, z = a[1] + dz * t;
        let mx = nx, mz = nz;
        if (closed && (x - cx) * mx + (z - cz) * mz < 0) { mx = -mx; mz = -mz; }
        out.push({ x, z, nx: mx, nz: mz, w: refl * step, two, y1: opt.y1, y2: opt.y2, rep: opt.rep, tr: closed ? 0.35 : 1 });
      }
    }
  }

  function sampleCircle(out, cx, cz, r, opt) {
    const ds = (opt && opt.ds) || DS;
    const refl = opt && opt.refl != null ? opt.refl : 1;
    const n = Math.max(12, Math.ceil((2 * Math.PI * r) / ds));
    const step = (2 * Math.PI * r) / n;
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k) / n;
      const nx = Math.cos(a), nz = Math.sin(a);
      out.push({ x: cx + r * nx, z: cz + r * nz, nx, nz, w: refl * step, two: false, y1: opt && opt.y1, y2: opt && opt.y2 });
    }
  }

  UT.samplePolyline = samplePolyline;
  UT.sampleCircle = sampleCircle;

  // ---------------------------------------------------------------------------
  // Pembangun cacat berparameter. Setiap fungsi mengembalikan "part":
  //   { polys:[{pts, closed, refl, two, normal, y1, y2}], circles:[{x,z,r,refl,y,y1,y2}],
  //     corners:[{x,z,s,face,y1,y2}], gap:{pts,y1,y2}, ip:{y1,y2}, meta }
  // y = posisi searah sumbu las (mm, 0 … panjang las). Pori dianggap bola (y ± r).
  // meta = kebenaran untuk penilaian: { type, y1, y2, z1, z2, x1, x2 }.
  // ---------------------------------------------------------------------------

  function metaFrom(type, y1, y2, xs, zs) {
    return { type, y1, y2, z1: Math.min(...zs), z2: Math.max(...zs), x1: Math.min(...xs), x2: Math.max(...xs) };
  }

  const D = {
    lof(w, side, z1, z2, y1, y2) {
      const pts = [[UT.fusionX(w, z1, side), z1], [UT.fusionX(w, z2, side), z2]];
      return {
        polys: [{ pts, two: true, refl: 1, y1, y2 }],
        meta: metaFrom('lof', y1, y2, pts.map((p) => p[0]), [z1, z2]),
      };
    },
    ip(w, y1, y2, h) {
      if (w.type === 'X') {
        // Bevel X: root face berada di tengah tebal → IP tertanam (lack of root fusion), tanpa corner trap.
        // Echo berasal dari difraksi ujung dan pantulan lemah dari muka root face.
        const za = w.zL1 - 0.2, zb = w.zL2 + 0.2;
        return {
          polys: [
            { pts: [[-w.g, zb], [-w.g, za]], two: false, normal: [-1, 0], refl: 1, y1, y2 },
            { pts: [[w.g, zb], [w.g, za]], two: false, normal: [1, 0], refl: 1, y1, y2 },
          ],
          gap: { pts: [[-w.g, zb], [-w.g, za], [w.g, za], [w.g, zb]], y1, y2 },
          meta: metaFrom('ip', y1, y2, [-w.g, w.g], [za, zb]),
        };
      }
      h = h == null ? Math.min(w.rf + 0.8, w.T * 0.3) : h;
      const z0 = w.T - h;
      return {
        polys: [
          // Facet root face kecil (< lambda) hanya memberi sedikit difraksi; echo utama dari corner trap.
          { pts: [[-w.g, w.T], [-w.g, z0]], two: false, normal: [-1, 0], refl: 0.2, y1, y2 },
          { pts: [[w.g, w.T], [w.g, z0]], two: false, normal: [1, 0], refl: 0.2, y1, y2 },
        ],
        corners: [
          { x: -w.g, z: w.T, s: h, face: -1, y1, y2 },
          { x: w.g, z: w.T, s: h, face: 1, y1, y2 },
        ],
        gap: { pts: [[-w.g, w.T], [-w.g, z0], [w.g, z0], [w.g, w.T]], y1, y2 },
        ip: { y1, y2 },
        meta: metaFrom('ip', y1, y2, [-w.g, w.g], [z0, w.T]),
      };
    },
    porositas(w, cx, cz, scale, yc) {
      const base = [
        [0, 0, 0.6, 0], [1.8, 0.8, 0.4, 2.5], [-1.5, 1.1, 0.5, -3], [0.8, -1.3, 0.35, 4.5],
        [-0.6, 2.0, 0.45, -5.5], [2.3, -0.6, 0.3, -1.5], [-2.2, -0.5, 0.3, 6],
      ];
      const circles = base.map(([dx, dz, r, dy]) => {
        const y = yc + dy * scale;
        return { x: cx + dx * scale, z: cz + dz * scale, r, refl: 8, y, y1: y - r, y2: y + r };
      });
      return {
        circles,
        meta: metaFrom('porositas', Math.min(...circles.map((c) => c.y1)), Math.max(...circles.map((c) => c.y2)),
          circles.map((c) => c.x), circles.map((c) => c.z)),
      };
    },
    slag(w, cx, cz, y1, y2) {
      const base = [
        [-2.8, 0.1], [-2.0, -0.6], [-0.9, -0.8], [0.0, -1.0], [1.2, -0.7], [2.0, -0.8],
        [2.9, 0.0], [2.1, 0.6], [1.0, 0.9], [0.1, 0.7], [-1.1, 0.9], [-2.1, 0.7],
      ];
      const pts = base.map(([dx, dz]) => [cx + dx, cz + dz]);
      return {
        polys: [{ pts, closed: true, refl: 1.5, y1, y2 }],
        meta: metaFrom('slag', y1, y2, pts.map((p) => p[0]), pts.map((p) => p[1])),
      };
    },
    crack(w, z1, z2, y1, y2, x0) {
      x0 = x0 || 0;
      const n = 7, pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push([x0 + (i % 2 ? 0.35 : -0.3) + 0.6 * t, z1 + (z2 - z1) * t]);
      }
      return {
        polys: [{ pts, two: true, refl: 1, y1, y2 }],
        meta: metaFrom('retak', y1, y2, pts.map((p) => p[0]), [z1, z2]),
      };
    },
    rootCrack(w, h, y1, y2, x0) {
      x0 = x0 == null ? 0.4 : x0;
      const pts = [[x0, w.T], [x0 - 0.3, w.T - h * 0.35], [x0 + 0.1, w.T - h * 0.7], [x0 - 0.2, w.T - h]];
      return {
        polys: [{ pts, two: true, refl: 1, y1, y2 }],
        corners: [{ x: x0, z: w.T, s: h, face: 0, y1, y2 }],
        meta: metaFrom('retak', y1, y2, pts.map((p) => p[0]), [w.T - h, w.T]),
      };
    },
    /**
     * Retak melintang (tegak lurus sumbu las) di y0, melintang selebar 2·xHalf, kedalaman z1–z2.
     * Dari scan tegak lurus (berkas di bidang x–z) bidang retak sejajar berkas → echo sangat lemah.
     * Dari scan sejajar las (berkas searah y) bidang retak menghadap berkas → terdeteksi.
     */
    transverse(w, y0, z1, z2, xHalf) {
      const xs = [], n = 9;
      // tampak penampang x–z: hanya tepi atas & bawah (difraksi lemah, bidang di luar bidang berkas)
      const edge = (z) => ({ pts: [[-xHalf, z], [xHalf, z]], two: true, refl: 0.15, y1: y0 - 0.5, y2: y0 + 0.5 });
      // tampak memanjang y–z: garis zigzag tegak di y0
      const pp = [];
      for (let i = 0; i <= n; i++) pp.push([y0 + (i % 2 ? 0.12 : -0.1), z1 + ((z2 - z1) * i) / n]);
      const par = { polys: [{ pts: pp, two: true, refl: 1, l1: -xHalf, l2: xHalf }], circles: [], corners: [] };
      if (z1 <= 0.3) par.corners.push({ x: y0, z: 0, s: z2 - z1, face: 0, l1: -xHalf, l2: xHalf });
      if (z2 >= w.T - 0.3) par.corners.push({ x: y0, z: w.T, s: z2 - z1, face: 0, l1: -xHalf, l2: xHalf });
      xs.push(-xHalf, xHalf);
      return {
        polys: [edge(z1), edge(z2)],
        par,
        meta: Object.assign(metaFrom('retak', y0 - 2, y0 + 2, xs, [z1, z2]), { orient: 'melintang' }),
      };
    },
    /** Undercut: alur dangkal di kaki las (permukaan atas), dalam d mm, sepanjang y1–y2. */
    undercut(w, side, y1, y2, d) {
      const xt = side * (w.capH > 0 ? w.capHalf : w.topHalf);
      const pts = [[xt, 0], [xt + side * 0.3, d * 0.6], [xt + side * 0.9, d], [xt + side * 1.6, 0]];
      return {
        polys: [{ pts, two: true, refl: 1, y1, y2 }],
        corners: [{ x: xt, z: 0, s: d, face: 0, y1, y2 }],
        meta: metaFrom('undercut', y1, y2, pts.map((p) => p[0]), [0, d]),
      };
    },
    /** Retak kaki las: berawal dari kaki cap di permukaan, menjalar ke dalam HAZ sedalam h. */
    toeCrack(w, side, y1, y2, h) {
      const xt = side * (w.capH > 0 ? w.capHalf : w.topHalf);
      const pts = [[xt, 0], [xt + side * 0.4, h * 0.35], [xt + side * 0.2, h * 0.7], [xt + side * 0.7, h]];
      return {
        polys: [{ pts, two: true, refl: 1, y1, y2 }],
        corners: [{ x: xt, z: 0, s: h, face: 0, y1, y2 }],
        meta: metaFrom('retak', y1, y2, pts.map((p) => p[0]), [0, h]),
      };
    },
  };
  UT.DEFECT_BUILDERS = D;

  /**
   * Representasi penampang memanjang (bidang y–z, untuk scan sejajar las) bila builder tidak
   * menyediakannya. Koordinat: x = posisi sepanjang las, l1–l2 = rentang melintang las.
   */
  function derivePar(p, T) {
    if (p.par) return p.par;
    const m = p.meta;
    const par = { polys: [], circles: [], corners: [] };
    if (!m) return par;
    if (m.type === 'porositas') {
      p.circles.forEach((c) => par.circles.push({ x: c.y, z: c.z, r: c.r, refl: c.refl, l1: c.x - c.r, l2: c.x + c.r }));
    } else if (m.type === 'slag') {
      const zc = (m.z1 + m.z2) / 2, hz = (m.z2 - m.z1) / 2, r = Math.min(hz, (m.y2 - m.y1) / 2);
      const pts = [];
      for (let k = 0; k <= 8; k++) { const a = Math.PI / 2 + (Math.PI * k) / 8; pts.push([m.y1 + r + r * Math.cos(a), zc - hz * Math.sin(a)]); }
      for (let k = 0; k <= 8; k++) { const a = -Math.PI / 2 + (Math.PI * k) / 8; pts.push([m.y2 - r + r * Math.cos(a), zc - hz * Math.sin(a)]); }
      par.polys.push({ pts, closed: true, refl: 1.5, l1: m.x1, l2: m.x2 });
    } else {
      // Cacat memanjang (LOF, retak memanjang, IP, undercut): dari arah sejajar hanya ujung-ujungnya
      // yang memberi difraksi lemah.
      [m.y1, m.y2].forEach((y) => par.polys.push({ pts: [[y, m.z1], [y, m.z2]], two: true, refl: 0.3, l1: m.x1, l2: m.x2 }));
      if (m.z1 <= 0.3 || m.z2 >= T - 0.3) {
        const z = m.z1 <= 0.3 ? 0 : T, s = 0.5 * (m.z2 - m.z1);
        par.corners.push({ x: m.y1, z, s, face: -1, l1: m.x1, l2: m.x2 });
        par.corners.push({ x: m.y2, z, s, face: 1, l1: m.x1, l2: m.x2 });
      }
    }
    return par;
  }

  /** Gabungkan beberapa part cacat menjadi satu hasil skenario. */
  function merge(parts, T) {
    const res = { polys: [], circles: [], corners: [], gaps: [], ipRanges: [], metas: [], par: { polys: [], circles: [], corners: [] } };
    parts.forEach((p) => {
      const pr = derivePar(p, T);
      res.par.polys.push(...pr.polys);
      res.par.circles.push(...pr.circles);
      res.par.corners.push(...pr.corners);
      if (p.polys) res.polys.push(...p.polys);
      if (p.circles) res.circles.push(...p.circles);
      if (p.corners) res.corners.push(...p.corners);
      if (p.gap) res.gaps.push(p.gap);
      if (p.ip) res.ipRanges.push(p.ip);
      if (p.meta) res.metas.push(p.meta);
    });
    return res;
  }

  /**
   * Cacat acak yang dapat diulang dari kode (seed). Las dibagi menjadi beberapa zona
   * sepanjang sumbu las; setiap zona berisi satu cacat dengan jenis, posisi, dan ukuran acak.
   */
  UT.randomDefects = function (w, seed, count, yLen, gen) {
    const rnd = UT.rng(seed);
    const R = (a, b) => a + rnd() * (b - a);
    // gen 1 = generator v0.3–v0.5 (kode soal lama tetap menghasilkan soal yang sama);
    // gen 2 (v0.6) menambah retak melintang, undercut, dan retak kaki las.
    const base = ['lof', 'ip', 'porositas', 'slag', 'crack', 'root-crack'];
    const pool = (gen >= 2 ? base.concat(['transverse', 'undercut', 'toe']) : base)
      .filter((t) => !(w.type === 'X' && t === 'root-crack'));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const n = Math.max(1, Math.min(4, count || 1));
    const types = pool.slice(0, n);
    const y0 = 30, y1z = (yLen || UT.CONFIG.weldLength) - 30;
    const zw = (y1z - y0) / n;
    const T = w.T, rfTop = T - w.rf;
    const parts = types.map((t, i) => {
      const a = y0 + i * zw, b = a + zw;
      const span = (lo, hi) => {
        const L = Math.min(R(lo, hi), zw - 12);
        const ys = R(a + 6, b - 6 - L);
        return [ys, ys + L];
      };
      if (t === 'lof') {
        const side = rnd() < 0.5 ? -1 : 1;
        let z1 = T * R(0.15, 0.4);
        let z2 = Math.min(z1 + T * R(0.2, 0.38), rfTop - 0.5);
        if (w.type === 'X') {
          // hindari root face di tengah: pilih separuh atas atau bawah
          if (rnd() < 0.5) { z1 = T * R(0.08, 0.2); z2 = Math.max(z1 + 1, w.zL1 - 0.5); }
          else { z1 = w.zL2 + 0.5; z2 = Math.max(z1 + 1, T * R(0.8, 0.92)); }
        }
        const [ya, yb] = span(15, 40);
        return D.lof(w, side, z1, z2, ya, yb);
      }
      if (t === 'ip') {
        const [ya, yb] = span(20, 50);
        return D.ip(w, ya, yb, Math.min(w.rf + R(0.5, 1.5), T * 0.3));
      }
      if (t === 'porositas') {
        const scale = Math.min(1, T / 20) * R(0.75, 1);
        const cz = T * R(0.35, 0.65);
        const lim = Math.max(0, UT.fusionX(w, cz, 1) - 3);
        const yc = R(a + 8, b - 8);
        return D.porositas(w, R(-lim, lim) * 0.6, cz, scale, yc);
      }
      if (t === 'slag') {
        const cz = T * R(0.35, 0.7);
        const lim = Math.max(0, UT.fusionX(w, cz, 1) - 3.5);
        const [ya, yb] = span(6, 18);
        return D.slag(w, R(-lim, lim), cz, ya, yb);
      }
      if (t === 'crack') {
        const z1 = T * R(0.2, 0.38);
        const z2 = Math.min(z1 + T * R(0.25, 0.4), rfTop - 1);
        const [ya, yb] = span(12, 35);
        return D.crack(w, z1, z2, ya, yb, R(-0.8, 0.8));
      }
      if (t === 'transverse') {
        const yc = R(a + 10, b - 10);
        const top = rnd() < 0.3; // sebagian retak melintang terbuka di permukaan cap
        const z1 = top ? 0 : T * R(0.15, 0.35);
        const z2 = Math.min(z1 + T * R(0.25, 0.45), T - 1.5);
        const xh = Math.max(2, UT.fusionX(w, (z1 + z2) / 2, 1) * R(0.6, 0.95));
        return D.transverse(w, yc, z1, z2, xh);
      }
      if (t === 'undercut') {
        const [ya, yb] = span(15, 40);
        return D.undercut(w, rnd() < 0.5 ? -1 : 1, ya, yb, R(0.5, 1.0));
      }
      if (t === 'toe') {
        const [ya, yb] = span(10, 30);
        return D.toeCrack(w, rnd() < 0.5 ? -1 : 1, ya, yb, Math.min(4, T * 0.25) * R(0.6, 1));
      }
      const h = Math.min(4, T * 0.25) * R(0.7, 1);
      const [ya, yb] = span(10, 25);
      return D.rootCrack(w, h, ya, yb, R(-0.5, 0.8));
    });
    return merge(parts, w.T);
  };

  // Kedalaman LOF untuk skenario tetap: pada bevel X dibatasi ke separuh atas (hindari root face).
  const lofZ = (w, f1, f2) => (w.type === 'X' ? [w.T * 0.1, w.zL1 - 0.5] : [w.T * f1, w.T * f2]);
  // Kedalaman di dalam logam las yang cukup lebar (bevel X sempit di tengah tebal)
  const weldZ = (w, f) => (w.type === 'X' ? w.T * Math.min(f, 0.3) : w.T * f);
  // Posisi x di dalam las pada kedalaman z (frac = bagian dari setengah lebar las yang aman)
  const inWeldX = (w, z, frac) => frac * Math.max(0, UT.fusionX(w, z, 1) - 2.5);

  UT.SCENARIOS = [
    {
      id: 'none',
      name: 'Tanpa cacat (hanya geometri las)',
      desc: 'Las sehat. Echo yang muncul berasal dari geometri: akar (root) dan kaki cap. Pelajari posisinya agar tidak salah dianggap cacat.',
      build: () => merge([]),
    },
    {
      id: 'lof-kiri',
      name: 'Lack of sidewall fusion – sisi kiri',
      desc: 'Tidak menyatu pada dinding bevel kiri. Paling jelas bila berkas tegak lurus bevel: dari probe di kiri lewat leg 2, atau dari probe di kanan lewat leg 1 (jika terjangkau).',
      build: (w) => merge([D.lof(w, -1, ...lofZ(w, 0.28, 0.62), 130, 168)], w.T),
    },
    {
      id: 'lof-kanan',
      name: 'Lack of sidewall fusion – sisi kanan',
      desc: 'Tidak menyatu pada dinding bevel kanan. Coba scan dari kedua sisi las dan bandingkan amplitudonya.',
      build: (w) => merge([D.lof(w, +1, ...lofZ(w, 0.28, 0.62), 125, 160)], w.T),
    },
    {
      id: 'ip',
      name: 'Incomplete penetration (IP / LOP)',
      desc: 'Akar las tidak tertembus. Kedua root face membentuk reflektor sudut (corner trap) di dasar pelat → echo kuat, terutama dengan probe 45°. Di luar daerah IP, echo akar las normal tetap ada.',
      build: (w) => merge([D.ip(w, 115, 185)], w.T),
    },
    {
      id: 'porositas',
      name: 'Porositas (kluster)',
      desc: 'Sekumpulan pori gas kecil. Echo lemah, lebar dan berpuncak banyak; amplitudo berubah cepat saat probe digeser.',
      build: (w) => merge([D.porositas(w, -inWeldX(w, weldZ(w, 0.45), 0.25), weldZ(w, 0.45), Math.min(1, w.T / 20), 150)], w.T),
    },
    {
      id: 'slag',
      name: 'Slag inclusion',
      desc: 'Terak terperangkap di dalam las. Echo sedang dan bergerigi, bentuknya berubah saat probe digeser atau diputar.',
      build: (w) => merge([D.slag(w, inWeldX(w, weldZ(w, 0.5), 0.5), weldZ(w, 0.5), 144, 158)], w.T),
    },
    {
      id: 'crack',
      name: 'Retak memanjang di tengah las',
      desc: 'Retak hampir vertikal. Permukaannya sejajar arah berkas sehingga pantulan spekular lemah; yang terlihat terutama echo difraksi dari ujung-ujung retak.',
      build: (w) => merge([D.crack(w, w.T * 0.3, w.T * 0.68, 135, 170, 0)], w.T),
    },
    {
      id: 'root-crack',
      name: 'Retak akar (root crack)',
      desc: 'Retak yang berawal dari akar las. Bersama dasar pelat membentuk corner trap → echo kuat di kedalaman ≈ T, mudah tertukar dengan echo geometri akar.',
      build: (w) => merge([D.rootCrack(w, Math.min(4, w.T * 0.25), 140, 162, 0.4)], w.T),
    },
    {
      id: 'melintang',
      name: 'Retak melintang (tegak lurus sumbu las)',
      desc: 'Retak melintang las. Dari scan tegak lurus las hampir tidak terlihat karena bidang retak sejajar berkas. Gunakan “Arah scan: sejajar las” (cap harus digerinda rata) untuk mendeteksinya.',
      build: (w) => merge([D.transverse(w, 150, w.T * 0.2, w.T * 0.65, Math.max(2, UT.fusionX(w, w.T * 0.42, 1) * 0.85))], w.T),
    },
    {
      id: 'undercut',
      name: 'Undercut di kaki las (kiri)',
      desc: 'Alur dangkal di kaki las pada permukaan. Echo muncul lewat leg 2 di kedalaman ≈ 0 pada posisi kaki las, mudah tertukar dengan echo geometri kaki cap.',
      build: (w) => merge([D.undercut(w, -1, 120, 160, 0.8)], w.T),
    },
    {
      id: 'toe-crack',
      name: 'Retak kaki las (toe crack, kiri)',
      desc: 'Retak yang berawal dari kaki las dan menjalar ke HAZ. Bersama permukaan atas membentuk corner trap → echo kuat lewat leg 2 di kedalaman ≈ 0.',
      build: (w) => merge([D.toeCrack(w, -1, 130, 160, Math.min(4, w.T * 0.25))], w.T),
    },
    {
      id: 'campuran',
      name: 'Campuran (LOF kanan + porositas + slag)',
      desc: 'Beberapa cacat sekaligus. Latih membedakan jenis cacat dari posisi, bentuk echo, dan perilakunya saat probe digeser dari kedua sisi.',
      build: (w) => merge([
        D.lof(w, +1, ...lofZ(w, 0.2, 0.42), 95, 122),
        D.slag(w, -inWeldX(w, w.type === 'X' ? w.T * 0.72 : w.T * 0.62, 0.4), w.type === 'X' ? w.T * 0.72 : w.T * 0.62, 160, 171),
        D.porositas(w, inWeldX(w, w.type === 'X' ? w.T * 0.25 : w.T * 0.8, 0.2), w.type === 'X' ? w.T * 0.25 : w.T * 0.8, 0.7, 215),
      ], w.T),
    },
    {
      id: 'acak',
      name: 'Acak (latihan, bisa diulang dengan kode)',
      desc: 'Cacat acak sepanjang las. Jenis, posisi, dan ukurannya ditentukan oleh kode soal sehingga bisa diulang atau dibagikan.',
      build: (w, opt) => UT.randomDefects(w, (opt && opt.seed) || 1, (opt && opt.count) || 2, opt && opt.yLen, (opt && opt.gen) || 2),
    },
  ];

  UT.findScenario = function (id) {
    return UT.SCENARIOS.find((s) => s.id === id) || UT.SCENARIOS[0];
  };

  /** Pecah [0, L] menjadi segmen di luar rentang-rentang yang diberikan. */
  function complementRanges(L, ranges) {
    const rs = ranges.slice().sort((a, b) => a.y1 - b.y1);
    const out = [];
    let cur = 0;
    rs.forEach((r) => {
      if (r.y1 > cur) out.push({ y1: cur, y2: r.y1 });
      cur = Math.max(cur, r.y2);
    });
    if (cur < L) out.push({ y1: cur, y2: L });
    return out;
  }

  /**
   * Bangun scene lengkap: titik-titik cacat, reflektor sudut (termasuk geometri las), dan bentuk untuk digambar.
   * opt = { seed, count } untuk skenario acak.
   */
  UT.buildScene = function (w, scenarioId, opt) {
    const sc = UT.findScenario(scenarioId);
    const res = sc.build(w, opt) || merge([], w.T);
    const points = [];
    res.polys.forEach((p) => samplePolyline(points, p.pts, p));
    res.circles.forEach((c) => sampleCircle(points, c.x, c.z, c.r, c));

    const corners = res.corners.map((c) => Object.assign({ kind: 'cacat' }, c));
    // Reflektor geometri las
    if (w.capH > 0) {
      const s = 0.4 * w.capH;
      corners.push({ x: w.capHalf, z: 0, s, face: -1, kind: 'geo' });
      corners.push({ x: -w.capHalf, z: 0, s, face: 1, kind: 'geo' });
    }
    // Root bead ada di sepanjang las kecuali di daerah incomplete penetration
    const rootBead = w.rootH > 0;
    if (rootBead) {
      const s = 0.7 * w.rootH;
      const segs = res.ipRanges.length ? complementRanges((opt && opt.yLen) || UT.CONFIG.weldLength, res.ipRanges) : [{ y1: null, y2: null }];
      segs.forEach((g) => {
        const yr = g.y1 == null ? {} : { y1: g.y1, y2: g.y2 };
        corners.push(Object.assign({ x: w.rootHalf, z: w.T, s, face: -1, kind: 'geo' }, yr));
        corners.push(Object.assign({ x: -w.rootHalf, z: w.T, s, face: 1, kind: 'geo' }, yr));
      });
    }
    // Ujung pelat
    [0, w.T].forEach((z) => {
      corners.push({ x: w.P, z, s: w.T, face: -1, kind: 'ujung' });
      corners.push({ x: -w.P, z, s: w.T, face: 1, kind: 'ujung' });
    });

    // Penampang memanjang (scan sejajar las): koordinat x = posisi sepanjang las, y1–y2 = rentang melintang
    const yLen = (opt && opt.yLen) || UT.CONFIG.weldLength;
    const parPoints = [];
    const mapL = (o) => Object.assign({}, o, { y1: o.l1, y2: o.l2 });
    res.par.polys.forEach((q) => samplePolyline(parPoints, q.pts, mapL(q)));
    res.par.circles.forEach((c) => sampleCircle(parPoints, c.x, c.z, c.r, mapL(c)));
    const parCorners = res.par.corners.map((c) => Object.assign({ kind: 'cacat' }, mapL(c)));
    if (!(opt && opt.pipe)) {
      [0, w.T].forEach((z) => {
        parCorners.push({ x: yLen, z, s: w.T, face: -1, kind: 'ujung' });
        parCorners.push({ x: 0, z, s: w.T, face: 1, kind: 'ujung' });
      });
    }

    return {
      scenario: sc,
      points,
      corners,
      shapes: { polys: res.polys, circles: res.circles, gaps: res.gaps },
      ipRanges: res.ipRanges,
      truth: res.metas,
      rootBead,
      par: { points: parPoints, corners: parCorners, shapes: { polys: res.par.polys.map(mapL), circles: res.par.circles.map(mapL), gaps: [] } },
    };
  };

  /** Generator acak deterministik (mulberry32). */
  UT.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** Hamburan butir material (grain noise): titik-titik acak tetap di dalam benda uji. */
  UT.buildGrain = function (b, seed) {
    const rnd = UT.rng(seed || 12345);
    const C = UT.CONFIG;
    const width = b.xMax - b.xMin;
    const n = Math.round(width * b.T * C.GRAIN_DENSITY);
    const xs = new Float32Array(n), zs = new Float32Array(n), ws = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = b.xMin + rnd() * width;
      zs[i] = 0.2 + rnd() * (b.T - 0.4);
      ws[i] = (rnd() * 2 - 1) * C.GRAIN_STRENGTH;
    }
    return { n, xs, zs, ws };
  };
})(typeof window !== 'undefined' ? window : globalThis);
