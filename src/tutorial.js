/*
 * Definisi pelajaran tutorial. Setiap pelajaran: { id, title, desc, setup(app), steps }.
 * Langkah: { title, text, hint?, check?(app, peak) → bool, quiz?: { label, unit, check(value, app) → bool } }
 * Langkah tanpa check/quiz bersifat informasi (langsung bisa dilanjutkan).
 */
(function (g) {
  'use strict';
  const UT = (g.UT = g.UT || {});
  const DEG = Math.PI / 180;

  function baseSetup(app, o) {
    const S = app.S;
    if (app.setTechnique) app.setTechnique('ut');
    if (app.setMaterial) { app.setMaterial('cs'); app.setWave('T'); }
    Object.assign(S, { bevelType: 'V', geom: 'pelat', contour: false, asmeCurved: false });
    app.locks.truth = app.locks.scenario = app.locks.autoCal = false;
    Object.assign(S, {
      T: 20, bevelHalf: 30, rootGap: 2, rootFace: 1.5, cap: true, rootBead: true,
      angle: 60, freq: 4, crystal: 10, side: 'kiri', velocity: UT.CONFIG.materials.cs.vT,
      gain: 46, rect: 'full', gateLevel: 20, grain: true, showBeam: true, probeY: 150,
    }, o || {});
    S.probeX = null;
  }

  // Titik puncak gate menurut SP yang diharapkan (untuk DAC)
  const hasDacPoint = (app, zu) => {
    const sp = zu / Math.cos(app.H.angle * DEG);
    return app.dac.points.some((p) => Math.abs(p.sp - sp) <= 2.5);
  };
  const lofTruth = (app) => (app.spec.scene.truth || [])[0];

  UT.LESSONS = [
    {
      id: 'dasar',
      title: '1. Dasar: menemukan cacat dengan A-scan',
      desc: 'Membaca A-scan, mencari amplitudo maksimum, membaca kedalaman dan leg.',
      setup(app) {
        baseSetup(app, { scenario: 'lof-kiri', showDefects: true, specimen: 'las' });
        app.training = false;
        app.newProbe(false);
        app.S.specimen = 'x';
        app.setSpecimen('las');
        Object.assign(app.S, { gateStart: 40, gateWidth: 75 });
        app.syncControls();
      },
      steps: [
        {
          title: 'Kenali tampilan',
          text: 'Kiri: penampang las dengan probe 60°. Garis biru adalah sumbu berkas dan pita biru adalah lebar berkas −6 dB. Berkas memantul di dasar pelat (½ skip) lalu naik lagi (leg 2). Kanan: layar A-scan. Sumbu mendatar = sound path (SP), sumbu tegak = amplitudo (% FSH). Garis oranye adalah Gate A.',
        },
        {
          title: 'Temukan echo',
          text: 'Seret probe pada penampang (atau klik penampang lalu tekan ← →) sampai muncul echo di dalam Gate A yang melewati 50% FSH.',
          hint: 'Cacat merah ada di dinding bevel kiri. Berkas harus mengenainya; coba geser probe menjauh dari las.',
          check: (app, pk) => pk && pk.triggered && pk.amp >= 50,
        },
        {
          title: 'Cari amplitudo maksimum',
          text: 'Geser probe perlahan maju dan mundur. Amplitudo naik lalu turun lagi. Berhentilah di posisi dengan echo tertinggi (≥ 72%).',
          hint: 'Gunakan langkah 0,5 mm (← →) di sekitar puncak.',
          check: (app, pk) => pk && pk.triggered && pk.amp >= 72,
        },
        {
          title: 'Baca kedalaman',
          text: 'Lihat kotak pembacaan di bawah A-scan. Penanda oranye ◇ di penampang menunjukkan posisi echo menurut alat.',
          quiz: {
            label: 'Berapa kedalaman indikasi menurut alat?', unit: 'mm',
            check: (v, app) => { const t = lofTruth(app); return t && v >= t.z1 - 1.5 && v <= t.z2 + 1.5; },
          },
        },
        {
          title: 'Leg',
          text: 'Leg 1 = berkas langsung turun dari probe. Leg 2 = berkas setelah memantul di dasar pelat. Kedalaman pada leg 2 dihitung 2T − SP·cos θ.',
          quiz: { label: 'Indikasi ini ditemukan lewat leg berapa?', unit: '', check: (v) => Math.round(v) === 2 },
        },
        {
          title: 'Scan dari sisi lain',
          text: 'Klik “← kiri” pada kartu Probe untuk memindahkan probe ke sisi kanan las, lalu cari lagi indikasi yang sama (dari sisi ini baru terjangkau lewat leg 3, SP ≈ 100 mm, jadi probe harus cukup jauh dari las). Bandingkan amplitudonya: LOF memantul paling kuat bila berkas tegak lurus dinding bevel.',
          hint: 'Gate A sudah diperlebar sampai 115 mm. Geser probe menjauh dari las sampai echo muncul di dalam gate.',
          check: (app, pk) => app.S.side === 'kanan' && pk && pk.triggered,
        },
        {
          title: 'Selesai',
          text: 'Bagus! Anda sudah bisa menemukan echo, memaksimalkannya, dan membaca lokasinya. Coba skenario lain di mode Bebas, atau lanjut ke pelajaran kalibrasi.',
        },
      ],
    },
    {
      id: 'iiw',
      title: '2. Kalibrasi probe di blok IIW',
      desc: 'Menemukan probe index, mengatur zero, dan mengecek sudut probe.',
      setup(app) {
        baseSetup(app, { showDefects: false, iiwFace: 'A' });
        app.training = true;
        app.newProbe(true);
        app.S.specimen = 'x';
        app.setSpecimen('iiw');
      },
      steps: [
        {
          title: 'Probe baru',
          text: 'Probe ini belum dikalibrasi: exit point, sudut, dan probe delay-nya sedikit berbeda dari nominal. Kita akan menemukannya di blok IIW (V1). Probe sudah diletakkan di atas blok dengan berkas mengarah ke permukaan R100.',
        },
        {
          title: 'Echo R100 maksimum',
          text: 'Geser probe (← →) sampai echo dari permukaan lengkung R100 maksimum. Saat maksimum, exit point probe tepat berada di atas tanda pusat R100.',
          hint: 'Echo R100 muncul sekitar 100 mm. Gerakkan probe dengan langkah kecil di sekitar tanda pusat.',
          check: (app, pk) => pk && pk.triggered && Math.abs(app.S.probeX - UT.IIW.r100.cx) <= 1,
        },
        {
          title: 'X-value',
          text: 'Baca “Muka depan probe → tanda pusat R100” pada kartu Kalibrasi, lalu masukkan nilainya ke kolom X-value. Jangan geser probe dulu.',
          check: (app) => Math.abs(app.S.xValue - app.H.front) <= 1,
        },
        {
          title: 'Zero (probe delay)',
          text: 'Echo R100 harus tampil tepat di SP 100 mm. Ubah nilai Zero (µs) sampai pembacaan SP = 100,0 mm. Zero lebih besar menggeser echo ke kiri.',
          hint: 'Setiap 1 µs ≈ 1,6 mm SP pada baja (gelombang geser).',
          check: (app) => Math.abs(app.S.zero - app.H.zero) * 1.62 <= 0.6,
        },
        {
          title: 'Cek echo kedua',
          text: 'Pindahkan Gate A (awal ±185 mm) ke echo kedua. SP-nya harus 200 mm. Kalau tidak tepat, velocity perlu dikoreksi.',
          check: (app, pk) => pk && pk.triggered && Math.abs(pk.sp - 200) <= 1.5,
        },
        {
          title: 'Arahkan ke lubang Ø50',
          text: 'Klik “← kiri” agar berkas mengarah ke lubang Ø50 (dekat ujung kiri blok). Atur gate sekitar 10–60 mm. Echo dari lubang besar ini lemah: naikkan gain (mis. +12 dB) sampai terlihat jelas, lalu cari posisi probe dengan echo lubang yang maksimum.',
          hint: 'Untuk probe 60° posisinya sekitar skala 60° pada blok. Yang dicari adalah posisi puncak, bukan tinggi absolutnya.',
          check: (app, pk) => {
            const h = UT.IIW.hole50;
            return app.S.side === 'kanan' && pk && pk.amp >= 10
              && Math.abs(app.S.probeX - (h.x + h.z * Math.tan(app.H.angle * DEG))) <= 2.5;
          },
        },
        {
          title: 'Sudut terukur',
          text: 'Baca “Skala sudut pada tanda index” lalu masukkan ke kolom Sudut terukur.',
          check: (app) => Math.abs(app.S.angleUser - app.H.angle) <= 1,
        },
        {
          title: 'Selesai',
          text: 'Probe sudah terkalibrasi. Semua pembacaan kedalaman dan posisi kini akurat. Lanjutkan ke pelajaran DAC.',
        },
      ],
    },
    {
      id: 'dac',
      title: '3. Membuat DAC (ASME)',
      desc: 'Merekam titik DAC dari SDH, menentukan reference level dan gain scanning.',
      setup(app) {
        const keepTraining = app.training;
        baseSetup(app, { showDefects: true });
        if (!app.calOk()) app.applyUserFromTruth();
        app.training = keepTraining;
        app.dac = UT.dacCreate();
        app.S.specimen = 'x';
        app.setSpecimen('asme');
      },
      steps: [
        {
          title: 'Blok kalibrasi dasar',
          text: 'Blok ini setebal benda uji (T = 20 mm) dengan lubang SDH di ¼T, ½T, dan ¾T. DAC menghubungkan amplitudo SDH yang sama pada jarak berbeda.',
        },
        {
          title: 'Titik 1: SDH ¼T',
          text: 'Maksimalkan echo SDH ¼T (leg 1, SP ≈ 10 mm). Tekan “puncak gate = 80%”, lalu “Rekam titik”. Setelah ini JANGAN ubah gain.',
          hint: 'Persempit gate di sekitar echo target agar echo lain tidak ikut terbaca.',
          check: (app) => hasDacPoint(app, app.spec.T * 0.25),
        },
        {
          title: 'Titik 2: SDH ½T',
          text: 'Pindahkan probe ke SDH ½T (SP ≈ 20 mm), maksimalkan, lalu rekam.',
          check: (app) => hasDacPoint(app, app.spec.T * 0.5),
        },
        {
          title: 'Titik 3: SDH ¾T',
          text: 'SDH ¾T (SP ≈ 30 mm): maksimalkan dan rekam.',
          check: (app) => hasDacPoint(app, app.spec.T * 0.75),
        },
        {
          title: 'Titik 4: 5/4T (leg 2)',
          text: 'Mundurkan probe sehingga SDH ¾T terkena lewat leg 2 (SP ≈ 50 mm). Echo lebih lemah: turunkan level gate bila perlu, lalu rekam.',
          check: (app) => hasDacPoint(app, app.spec.T * 1.25),
        },
        {
          title: 'Titik 5: 6/4T (leg 2)',
          text: 'SDH ½T lewat leg 2 (SP ≈ 60 mm): mundurkan probe lagi, maksimalkan, rekam.',
          check: (app) => hasDacPoint(app, app.spec.T * 1.5),
        },
        {
          title: 'Titik 6: 7/4T (leg 2)',
          text: 'SDH ¼T lewat leg 2 (SP ≈ 70 mm). Dengan titik ini DAC mencakup satu skip penuh.',
          check: (app) => hasDacPoint(app, app.spec.T * 1.75),
        },
        {
          title: 'Reference level & gain scanning',
          text: 'Tekan “Gain = reference” (titik tertinggi = 80% FSH), lalu “Gain scanning (+6 dB)”.',
          check: (app) => {
            const r = UT.dacRefGain(app.dac);
            return r != null && Math.abs(app.S.gain - (r + 6)) <= 0.5;
          },
        },
        {
          title: 'Selesai',
          text: 'DAC siap dan tampil sebagai garis merah muda di A-scan (100%, 50%, 20%) untuk satu skip penuh. Indikasi di luar rentang DAC tidak bisa dievaluasi; DAC tidak boleh diekstrapolasi. Lanjut ke pelajaran sizing.',
        },
      ],
    },
    {
      id: 'sizing',
      title: '4. Sizing 6 dB drop & evaluasi ASME',
      desc: 'Mengukur panjang indikasi, menentukan jenis, dan memutuskan diterima/ditolak.',
      setup(app) {
        const keepTraining = app.training;
        baseSetup(app, { scenario: 'lof-kiri', showDefects: true });
        if (!app.calOk()) app.applyUserFromTruth();
        app.training = keepTraining;
        const P = app.dac.points;
        if (!P.length || P[P.length - 1].sp < 70) {
          app.dac = UT.autoDac({ T: 20, H: app.H, freq: app.S.freq, crystal: app.S.crystal, cal: app.cal() });
        }
        app.S.gain = Math.round((UT.dacRefGain(app.dac) + 6) * 2) / 2;
        app.resetSizing();
        app.S.specimen = 'x';
        app.setSpecimen('las');
        app.S.gain = Math.round((UT.dacRefGain(app.dac) + 6) * 2) / 2;
      },
      steps: [
        {
          title: 'Gain scanning',
          text: 'Gain sudah diatur ke reference level + 6 dB dan DAC tersedia. Bila DAC dari pelajaran 3 belum mencakup satu skip penuh, DAC disiapkan otomatis.',
        },
        {
          title: 'Temukan indikasi',
          text: 'Cari echo dari cacat di dinding bevel kiri. Perhatikan “Terhadap DAC”: indikasi ini melebihi 100% DAC.',
          check: (app, pk) => { const r = app.reading(); return r && r.pct != null && r.pct >= 100; },
        },
        {
          title: 'Atur puncak ke 80%',
          text: 'Maksimalkan echo, lalu tekan “Atur gain: puncak gate = 80%”. Ini titik awal metode 6 dB drop.',
          check: (app, pk) => pk && pk.triggered && pk.amp >= 74 && pk.amp <= 86,
        },
        {
          title: 'Ukur panjang (6 dB drop)',
          text: 'Klik penampang lalu tekan ↑ untuk menggeser probe sepanjang las sampai echo turun ke 40% (−6 dB), tekan “Tandai ujung 1”. Lalu tekan ↓ melewati posisi awal sampai echo turun ke 40% lagi, tekan “Tandai ujung 2”.',
          hint: 'Tampak atas menunjukkan posisi y probe dan garis ungu tanda ujung.',
          check: (app) => {
            const z = app.sizing;
            if (z.y1 == null || z.y2 == null) return false;
            const t = lofTruth(app);
            return Math.abs(Math.abs(z.y2 - z.y1) - (t.y2 - t.y1)) <= 6;
          },
        },
        {
          title: 'Interpretasi',
          text: 'Indikasi berada tepat di garis fusi, amplitudonya tinggi dari satu sisi dan rendah dari sisi lain. Pilih interpretasi yang paling sesuai pada kartu Sizing & evaluasi.',
          check: (app) => app.S.indType === 'lof',
        },
        {
          title: 'Catat di laporan',
          text: 'Pastikan echo masih di dalam gate, lalu tekan “+ Tambah dari pembacaan saat ini” pada kartu Laporan indikasi.',
          check: () => (UT.edu ? UT.edu.reportRows().length >= 1 : false),
        },
        {
          title: 'Selesai',
          text: 'Lack of fusion tidak diterima berapa pun panjangnya (ASME Sec. VIII Div. 1 App. 12). Anda siap mencoba mode Ujian.',
        },
      ],
    },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
