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
        out.push({ x, z, nx: mx, nz: mz, w: refl * step, two, y1: opt.y1, y2: opt.y2, rep: opt.rep });
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
  // Skenario cacat. Setiap build(w) mengembalikan:
  //   { polys:[{pts, closed, refl, two, normal, y1, y2}], circles:[{x,z,r,refl,y}],
  //     corners:[{x,z,s,face,y1,y2}], gap: [pts] (rongga untuk digambar), noRootBead }
  // y = posisi searah sumbu las (mm, 0 … panjang las). Pori dianggap bola (y ± r).
  // Posisi cacat dihitung relatif terhadap geometri las sehingga ikut berubah
  // ketika tebal pelat / bevel diubah.
  // ---------------------------------------------------------------------------

  function lofOnSide(w, side, z1, z2, y1, y2) {
    return { pts: [[UT.fusionX(w, z1, side), z1], [UT.fusionX(w, z2, side), z2]], two: true, refl: 1, y1, y2 };
  }

  function porosityCluster(cx, cz, scale, yc) {
    const base = [
      [0, 0, 0.6, 0], [1.8, 0.8, 0.4, 2.5], [-1.5, 1.1, 0.5, -3], [0.8, -1.3, 0.35, 4.5],
      [-0.6, 2.0, 0.45, -5.5], [2.3, -0.6, 0.3, -1.5], [-2.2, -0.5, 0.3, 6],
    ];
    return base.map(([dx, dz, r, dy]) => {
      const y = yc + dy * scale;
      return { x: cx + dx * scale, z: cz + dz * scale, r, refl: 8, y, y1: y - r, y2: y + r };
    });
  }

  function slagPoly(cx, cz, y1, y2) {
    const base = [
      [-2.8, 0.1], [-2.0, -0.6], [-0.9, -0.8], [0.0, -1.0], [1.2, -0.7], [2.0, -0.8],
      [2.9, 0.0], [2.1, 0.6], [1.0, 0.9], [0.1, 0.7], [-1.1, 0.9], [-2.1, 0.7],
    ];
    return { pts: base.map(([dx, dz]) => [cx + dx, cz + dz]), closed: true, refl: 1.5, y1, y2 };
  }

  UT.SCENARIOS = [
    {
      id: 'none',
      name: 'Tanpa cacat (hanya geometri las)',
      desc: 'Las sehat. Echo yang muncul berasal dari geometri: akar (root) dan kaki cap. Pelajari posisinya agar tidak salah dianggap cacat.',
      build: () => ({}),
    },
    {
      id: 'lof-kiri',
      name: 'Lack of sidewall fusion – sisi kiri',
      desc: 'Tidak menyatu pada dinding bevel kiri. Paling jelas bila berkas tegak lurus bevel: dari probe di kiri lewat leg 2, atau dari probe di kanan lewat leg 1 (jika terjangkau).',
      build: (w) => ({ polys: [lofOnSide(w, -1, w.T * 0.28, w.T * 0.62, 130, 168)] }),
    },
    {
      id: 'lof-kanan',
      name: 'Lack of sidewall fusion – sisi kanan',
      desc: 'Tidak menyatu pada dinding bevel kanan. Coba scan dari kedua sisi las dan bandingkan amplitudonya.',
      build: (w) => ({ polys: [lofOnSide(w, +1, w.T * 0.28, w.T * 0.62, 125, 160)] }),
    },
    {
      id: 'ip',
      name: 'Incomplete penetration (IP / LOP)',
      desc: 'Akar las tidak tertembus. Kedua root face membentuk reflektor sudut (corner trap) di dasar pelat → echo kuat, terutama dengan probe 45°.',
      build: (w) => {
        const h = Math.min(w.rf + 0.8, w.T * 0.3);
        const z0 = w.T - h;
        return {
          polys: [
            // Facet root face kecil (< lambda) hanya memberi sedikit difraksi; echo utama dari corner trap.
            { pts: [[-w.g, w.T], [-w.g, z0]], two: false, normal: [-1, 0], refl: 0.2, y1: 115, y2: 185 },
            { pts: [[w.g, w.T], [w.g, z0]], two: false, normal: [1, 0], refl: 0.2, y1: 115, y2: 185 },
          ],
          corners: [
            { x: -w.g, z: w.T, s: h, face: -1, y1: 115, y2: 185 },
            { x: w.g, z: w.T, s: h, face: 1, y1: 115, y2: 185 },
          ],
          gap: [[-w.g, w.T], [-w.g, z0], [w.g, z0], [w.g, w.T]],
          noRootBead: true,
        };
      },
    },
    {
      id: 'porositas',
      name: 'Porositas (kluster)',
      desc: 'Sekumpulan pori gas kecil. Echo lemah, lebar dan berpuncak banyak; amplitudo berubah cepat saat probe digeser.',
      build: (w) => ({ circles: porosityCluster(-w.topHalf * 0.15, w.T * 0.45, Math.min(1, w.T / 20), 150) }),
    },
    {
      id: 'slag',
      name: 'Slag inclusion',
      desc: 'Terak terperangkap di dalam las. Echo sedang dan bergerigi, bentuknya berubah saat probe digeser atau diputar.',
      build: (w) => ({ polys: [slagPoly(w.topHalf * 0.25, w.T * 0.5, 144, 158)] }),
    },
    {
      id: 'crack',
      name: 'Retak memanjang di tengah las',
      desc: 'Retak hampir vertikal. Permukaannya sejajar arah berkas sehingga pantulan spekular lemah; yang terlihat terutama echo difraksi dari ujung-ujung retak.',
      build: (w) => {
        const z1 = w.T * 0.3, z2 = w.T * 0.68, n = 7;
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          pts.push([(i % 2 ? 0.35 : -0.3) + 0.6 * t, z1 + (z2 - z1) * t]);
        }
        return { polys: [{ pts, two: true, refl: 1, y1: 135, y2: 170 }] };
      },
    },
    {
      id: 'root-crack',
      name: 'Retak akar (root crack)',
      desc: 'Retak yang berawal dari akar las. Bersama dasar pelat membentuk corner trap → echo kuat di kedalaman ≈ T, mudah tertukar dengan echo geometri akar.',
      build: (w) => {
        const h = Math.min(4, w.T * 0.25);
        const pts = [[0.4, w.T], [0.1, w.T - h * 0.35], [0.5, w.T - h * 0.7], [0.2, w.T - h]];
        return {
          polys: [{ pts, two: true, refl: 1, y1: 140, y2: 162 }],
          corners: [{ x: 0.4, z: w.T, s: h, face: 0, y1: 140, y2: 162 }],
        };
      },
    },
    {
      id: 'campuran',
      name: 'Campuran (LOF kanan + porositas + slag)',
      desc: 'Beberapa cacat sekaligus. Latih membedakan jenis cacat dari posisi, bentuk echo, dan perilakunya saat probe digeser dari kedua sisi.',
      build: (w) => ({
        polys: [lofOnSide(w, +1, w.T * 0.2, w.T * 0.42, 95, 122), slagPoly(-w.topHalf * 0.2, w.T * 0.62, 160, 171)],
        circles: porosityCluster(w.topHalf * 0.1, w.T * 0.8, 0.7, 215),
      }),
    },
  ];

  UT.findScenario = function (id) {
    return UT.SCENARIOS.find((s) => s.id === id) || UT.SCENARIOS[0];
  };

  /** Bangun scene lengkap: titik-titik cacat, reflektor sudut (termasuk geometri las), dan bentuk untuk digambar. */
  UT.buildScene = function (w, scenarioId) {
    const sc = UT.findScenario(scenarioId);
    const res = sc.build(w) || {};
    const points = [];
    const polys = res.polys || [];
    const circles = res.circles || [];
    polys.forEach((p) => samplePolyline(points, p.pts, p));
    circles.forEach((c) => sampleCircle(points, c.x, c.z, c.r, c));

    const corners = (res.corners || []).map((c) => Object.assign({ kind: 'cacat' }, c));
    // Reflektor geometri las
    if (w.capH > 0) {
      const s = 0.4 * w.capH;
      corners.push({ x: w.capHalf, z: 0, s, face: -1, kind: 'geo' });
      corners.push({ x: -w.capHalf, z: 0, s, face: 1, kind: 'geo' });
    }
    const rootBead = w.rootH > 0 && !res.noRootBead;
    if (rootBead) {
      const s = 0.7 * w.rootH;
      corners.push({ x: w.rootHalf, z: w.T, s, face: -1, kind: 'geo' });
      corners.push({ x: -w.rootHalf, z: w.T, s, face: 1, kind: 'geo' });
    }
    // Ujung pelat
    [0, w.T].forEach((z) => {
      corners.push({ x: w.P, z, s: w.T, face: -1, kind: 'ujung' });
      corners.push({ x: -w.P, z, s: w.T, face: 1, kind: 'ujung' });
    });

    return {
      scenario: sc,
      points,
      corners,
      shapes: { polys, circles, gap: res.gap || null },
      rootBead,
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
