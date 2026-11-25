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
    if (app.setOrient) app.setOrient('tegak');
    Object.assign(S, { bevelType: 'V', geom: 'pelat', contour: false, asmeCurved: false, tcg: false, iiwFace: 'A', v2Face: 'A', code: 'asme', awsB: null });
    app.locks.truth = app.locks.scenario = app.locks.autoCal = false;
    Object.assign(S, {
      T: 20, bevelHalf: 30, rootGap: 2, rootFace: 1.5, cap: true, rootBead: true,
      angle: 60, freq: 4, crystal: 10, side: 'kiri', velocity: UT.CONFIG.materials.cs.vT,
      gain: 46, rect: 'full', gateLevel: 20, grain: true, showBeam: true, probeY: 150,
    }, o || {});
    S.probeX = null;
    S._prevAngle = S.angle;
    S._angleBefore = null;
    S.dual = false;
    Object.assign(S, { seam: false, aniso: true, pautMode: 'S', pautFocus: 0, pautBeam: 24, pautEAngle: 60 });
    Object.assign(S, { tubType: 'Y', tubD: 323.9, tubTc: 16, tubd: 168.3, tubTb: 10, tubTheta: 45, tubGap: 25, tubScenario: 'lof-brace' });
    S.plan = Object.assign({}, UT.CONFIG.defaults.plan, { on: false });
  }

  // Titik puncak gate menurut SP yang diharapkan (untuk DAC)
  const hasDacPoint = (app, zu) => {
    const sp = zu / Math.cos(app.H.angle * DEG);
    return app.dac.points.some((p) => Math.abs(p.sp - sp) <= 2.5);
  };
  const lofTruth = (app) => (app.spec.scene.truth || [])[0];
  const lamTruth = (app) => { const sh = (app.spec.scene.shadows || [])[0]; return sh ? sh.z : null; };

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
          check: (app) => Math.abs(app.S.angleUser - app.H.angle) <= 1.5,
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
    {
      id: 'v2',
      title: '5. Kalibrasi dengan blok V2',
      desc: 'Probe index & range dengan R25/R50 (echo 25-100-175 dan 50-125-200 mm), cek sudut dengan lubang Ø5.',
      setup(app) {
        baseSetup(app, { showDefects: false, v2Face: 'A' });
        app.training = true;
        app.newProbe(true);
        app.S.specimen = 'x';
        app.setSpecimen('v2');
      },
      steps: [
        {
          title: 'Blok V2',
          text: 'Blok V2 (ISO 7963) punya dua busur, R25 dan R50, yang berpusat di tanda 0 pada sisi atas. Probe yang belum dikalibrasi sudah diletakkan di dekat tanda 0 dengan berkas menghadap R50 (→).',
        },
        {
          title: 'Echo R50 maksimum',
          text: 'Geser probe (← →) sampai echo R50 (sekitar 50 mm) maksimum. Saat itu exit point tepat di atas tanda 0.',
          hint: 'Gate sudah dipasang di sekitar 35–65 mm.',
          check: (app, pk) => app.S.side === 'kiri' && pk && pk.triggered && Math.abs(app.S.probeX) <= 1,
        },
        {
          title: 'X-value',
          text: 'Baca “Muka depan probe → tanda pusat (0)” pada kartu Kalibrasi lalu isi X-value.',
          check: (app) => Math.abs(app.S.xValue - app.H.front) <= 1,
        },
        {
          title: 'Zero & range',
          text: 'Atur zero sampai echo R50 tepat 50 mm. Echo berikutnya harus di 125 mm dan 200 mm (selisih 75 mm = 25 + 50, karena gelombang bolak-balik lewat R25).',
          check: (app) => Math.abs(app.S.zero - app.H.zero) * 1.62 <= 0.6,
        },
        {
          title: 'Menghadap R25',
          text: 'Klik “← kiri” (berkas menghadap R25), kembalikan probe ke tanda 0, dan pasang gate sekitar 15–35 mm. Echo R25 muncul di 25 mm, lalu 100 dan 175 mm.',
          check: (app, pk) => app.S.side === 'kanan' && pk && pk.triggered && Math.abs(pk.sp - 25) <= 1.5,
        },
        {
          title: 'Cek sudut dengan Ø5',
          text: 'Tetap dengan berkas ←, geser probe ke kanan sampai echo lubang Ø5 maksimum (gate sekitar 20–45 mm). Pakai skala 35°–65° di sisi atas.',
          hint: 'Untuk probe 60° posisinya sekitar 35 mm di kanan tanda 0. Probe 70°–75° dicek dari sisi miring.',
          check: (app, pk) => app.S.side === 'kanan' && pk && pk.amp >= 10
            && Math.abs(app.S.probeX - UT.V2.hole.z * Math.tan(app.H.angle * DEG)) <= 2.5,
        },
        {
          title: 'Sudut terukur',
          text: 'Baca “Skala sudut pada tanda index” lalu isi Sudut terukur.',
          check: (app) => Math.abs(app.S.angleUser - app.H.angle) <= 1.5,
        },
        {
          title: 'Selesai',
          text: 'Probe terkalibrasi dengan blok V2. Untuk probe 70°–75°, pilih “Sisi miring” pada kartu Benda uji: lubang Ø5 dekat permukaan dengan skala 65°–75°.',
        },
      ],
    },
    {
      id: 'tofd',
      title: '6. TOFD: membaca D-scan & mengukur tinggi',
      desc: 'Gelombang lateral, back wall, difraksi ujung atas/bawah, dan sizing tinggi cacat.',
      setup(app) {
        baseSetup(app, { scenario: 'crack', showDefects: true });
        app.training = false;
        app.newProbe(false);
        app.S.specimen = 'x';
        app.setSpecimen('las');
        app.setTechnique('tofd');
      },
      steps: [
        {
          title: 'Susunan TOFD',
          text: 'Dua probe longitudinal (Tx dan Rx) berhadapan di kedua sisi las. Pada D-scan, garis paling atas adalah gelombang lateral (menjalar di bawah permukaan) dan garis paling bawah adalah back wall. Retak di antaranya memberi dua sinyal difraksi: ujung atas (fase terbalik) dan ujung bawah.',
        },
        {
          title: 'Penanda ujung atas',
          text: 'Tunggu D-scan selesai direkam. Klik tepat pada sinyal difraksi ujung atas retak (sekitar posisi y 150) untuk memasang penanda A.',
          hint: 'Arahkan kursor ke D-scan: kedalaman di bawah kursor tampil di kotak pembacaan.',
          check: (app) => { const t = (app.spec.scene.truth || [])[0], m = app.tofdMarks; return t && m.a != null && Math.abs(m.a - t.z1) <= 1.2; },
        },
        {
          title: 'Penanda ujung bawah',
          text: 'Klik sinyal difraksi ujung bawah untuk memasang penanda B.',
          check: (app) => { const t = (app.spec.scene.truth || [])[0], m = app.tofdMarks; return t && m.b != null && Math.abs(m.b - t.z2) <= 1.2; },
        },
        {
          title: 'Tinggi cacat',
          text: 'Tinggi cacat = selisih kedalaman B dan A (lihat “Tinggi |B − A|”).',
          quiz: {
            label: 'Berapa tinggi retak?', unit: 'mm',
            check: (v, app) => { const t = (app.spec.scene.truth || [])[0]; return t && Math.abs(v - (t.z2 - t.z1)) <= 1.5; },
          },
        },
        {
          title: 'Selesai',
          text: 'TOFD mengukur tinggi dari waktu tempuh sinyal difraksi, bukan dari amplitudo, sehingga sizing tinggi lebih akurat daripada metode 6 dB drop.',
        },
      ],
    },
    {
      id: 'paut',
      title: '7. Phased Array: membaca S-scan',
      desc: 'Memilih sudut terbaik dari sektor, membaca lokasi indikasi.',
      setup(app) {
        baseSetup(app, { scenario: 'lof-kiri', showDefects: true });
        app.training = false;
        app.newProbe(false);
        app.S.specimen = 'x';
        app.setSpecimen('las');
        app.setTechnique('paut');
        Object.assign(app.S, { pautAngle: 45, gateStart: 30, gateWidth: 70 });
        app.syncControls();
      },
      steps: [
        {
          title: 'S-scan',
          text: 'Array 16 elemen menyapu berkas 40°–70° tanpa menggeser probe. S-scan menampilkan semua sudut sekaligus dalam koordinat sebenarnya; garis T dan 2T menandai dasar dan permukaan atas (leg 1 dan leg 2).',
        },
        {
          title: 'Pilih sudut terbaik',
          text: 'Klik titik terkuat pada S-scan (atau geser slider sudut) sampai A-scan sudut terpilih menunjukkan echo LOF ≥ 60%.',
          hint: 'LOF di dinding bevel paling kuat bila berkas tegak lurus bevel: sekitar 60° lewat leg 2.',
          check: (app, pk) => pk && pk.triggered && pk.amp >= 60,
        },
        {
          title: 'Kedalaman',
          text: 'Pembacaan kedalaman berlaku untuk sudut yang dipilih.',
          quiz: {
            label: 'Berapa kedalaman indikasi?', unit: 'mm',
            check: (v, app) => { const t = (app.spec.scene.truth || [])[0]; return t && v >= t.z1 - 1.5 && v <= t.z2 + 1.5; },
          },
        },
        {
          title: 'Selesai',
          text: 'Dengan Phased Array, banyak sudut diperiksa sekaligus sehingga cacat dengan orientasi berbeda lebih mudah ditemukan.',
        },
      ],
    },
    {
      id: 'pipa',
      title: '8. Pipa & material austenitik',
      desc: 'Rugi kopling wedge pada pipa kecil, serta gelombang geser vs longitudinal pada las austenitik.',
      setup(app) {
        baseSetup(app, { scenario: 'lof-kiri', showDefects: true, geom: 'pipa', OD: 114.3, contour: false, gateLevel: 10 });
        app.training = false;
        app.newProbe(false);
        app.S.specimen = 'x';
        app.setSpecimen('las');
        Object.assign(app.S, { gateLevel: 10 });
        app.syncControls();
      },
      steps: [
        {
          title: 'Pipa OD 114 mm',
          text: 'Benda uji sekarang pipa kecil dengan las keliling. Wedge datar pada permukaan cembung menyisakan celah di tepi, sehingga energi yang masuk berkurang.',
        },
        {
          title: 'Echo dengan wedge datar',
          text: 'Cari echo LOF (seperti pelajaran 1). Perhatikan amplitudonya yang rendah.',
          check: (app, pk) => pk && pk.triggered,
        },
        {
          title: 'Wedge dikontur',
          text: 'Centang “Wedge dikontur sesuai diameter” pada kartu Probe, lalu maksimalkan echo lagi (≥ 50%).',
          check: (app, pk) => app.S.contour && pk && pk.triggered && pk.amp >= 50,
        },
        {
          title: 'Material austenitik',
          text: 'Ganti material menjadi “Baja tahan karat austenitik”. Perhatikan noise butir yang tinggi, terutama dari logam las.',
          check: (app) => app.S.material === 'ss',
        },
        {
          title: 'Gelombang longitudinal',
          text: 'Ganti mode gelombang menjadi “Longitudinal (LW)”. Gelombang longitudinal kurang terhambur di butir kasar sehingga rasio sinyal/noise lebih baik bila berkas harus melewati logam las.',
          check: (app) => app.S.wave === 'L',
        },
        {
          title: 'Selesai',
          text: 'Untuk pipa berdiameter ≤ 508 mm gunakan wedge dikontur dan blok kalibrasi lengkung. Untuk las austenitik, probe gelombang longitudinal umumnya lebih sesuai.',
        },
      ],
    },
    {
      id: 'sejajar',
      title: '9. Cacat melintang: scan sejajar las',
      desc: 'Mengapa retak melintang tidak terlihat dari scan tegak lurus, dan cara menemukannya.',
      setup(app) {
        baseSetup(app, { scenario: 'melintang', showDefects: true, angle: 70, gateStart: 5, gateWidth: 100 });
        app.training = false;
        app.newProbe(false);
        app.S.specimen = 'x';
        app.setSpecimen('las');
        Object.assign(app.S, { gateStart: 5, gateWidth: 100 });
        app.syncControls();
      },
      steps: [
        {
          title: 'Retak melintang',
          text: 'Las ini berisi retak melintang (tegak lurus sumbu las, merah di tampak atas). Coba scan tegak lurus seperti biasa: berkas sejajar dengan bidang retak sehingga echo hampir tidak ada.',
        },
        {
          title: 'Arah scan sejajar',
          text: 'Pilih “Arah scan: Sejajar las” pada kartu Probe.',
          check: (app) => app.S.orient === 'sejajar',
        },
        {
          title: 'Gerinda cap',
          text: 'Cap las menghalangi probe duduk di atas las. Hilangkan centang “Cap (reinforcement) ada” (cap digerinda rata), lalu letakkan probe di atas sumbu las (↑ ↓ atau tampak atas).',
          check: (app) => !app.S.cap && Math.abs(app.S.probeY) < app.spec.weld.topHalf,
        },
        {
          title: 'Temukan retak',
          text: 'Geser probe sepanjang las (← →) sampai echo retak melintang ≥ 30%.',
          hint: 'Probe 70°: bidang retak yang tegak paling “menghadap” berkas yang landai.',
          check: (app, pk) => app.isPar() && pk && pk.triggered && pk.amp >= 30,
        },
        {
          title: 'Selesai',
          text: 'Reflektor melintang dicari dengan berkas sejajar sumbu las: di atas las bila cap digerinda, atau di samping las dengan berkas miring ke arah las. Retak melintang tidak dapat diterima berapa pun panjangnya.',
        },
      ],
    },
    {
      id: 'lurus',
      title: '10. Probe lurus 0°: back wall & laminasi',
      desc: 'Memeriksa logam induk dengan probe lurus: back wall, echo laminasi, dan efek bayangan pada probe sudut.',
      setup(app) {
        baseSetup(app, { scenario: 'laminasi', showDefects: true, angle: 0, wave: 'L', gain: 38, velocity: UT.CONFIG.materials.cs.vL });
        app.training = false;
        app.newProbe(false);
        app.S.specimen = 'x';
        app.setSpecimen('las');
        Object.assign(app.S, { gateStart: 14, gateWidth: 12, probeX: -130, probeY: 150 });
        app.syncControls();
      },
      steps: [
        {
          title: 'Probe lurus',
          text: 'Probe 0° memancarkan gelombang longitudinal tegak lurus permukaan. Pada pelat sehat A-scan menampilkan pulsa awal (main bang) di kiri, lalu echo back wall (dinding belakang) pada SP = T, 2T, 3T, … yang makin kecil. Sebelum memeriksa las dengan probe sudut, ASME Sec. V Art. 4 meminta logam induk yang akan dilalui berkas sudut diperiksa dulu dengan probe lurus untuk mencari reflektor seperti laminasi.',
        },
        {
          title: 'Back wall',
          text: 'Probe berada di logam induk yang sehat. Pastikan echo back wall pertama berada di dalam Gate A (start 14 mm, lebar 12 mm) dengan tinggi ≥ 50% FSH; atur gain bila perlu.',
          check: (app, pk) => pk && pk.triggered && pk.amp >= 50 && Math.abs(pk.sp - app.spec.T) <= 1.5,
        },
        {
          title: 'Ukur tebal',
          text: 'Probe lurus juga dipakai sebagai pengukur tebal. Baca SP echo back wall pertama.',
          quiz: { label: 'Tebal pelat', unit: 'mm', check: (v, app) => Math.abs(v - app.spec.T) <= 0.6 },
        },
        {
          title: 'Cari laminasi',
          text: 'Ubah Gate A menjadi start 3 mm, lebar 12 mm. Lalu geser probe ke arah las (→) sampai muncul echo di dalam gate, jauh sebelum back wall, ≥ 40% FSH.',
          hint: 'Laminasi digambar sebagai garis mendatar merah di logam induk sisi kiri.',
          check: (app, pk) => pk && pk.triggered && pk.amp >= 40 && pk.sp > 3 && pk.sp < app.spec.T * 0.8,
        },
        {
          title: 'Kedalaman laminasi',
          text: 'Perhatikan A-scan: echo laminasi berulang (d, 2d, 3d, …) dan back wall menghilang karena energi dipantulkan seluruhnya oleh laminasi. Berapa kedalamannya?',
          quiz: { label: 'Kedalaman laminasi', unit: 'mm', check: (v, app) => { const t = lamTruth(app); return t && Math.abs(v - t) <= 0.8; } },
        },
        {
          title: 'Bayangan bagi probe sudut',
          text: 'Pilih skenario “Laminasi + LOF” (kartu Cacat & tampilan) dan sudut probe 60°. Laminasi berada di antara probe kiri dan las.',
          check: (app) => app.S.scenario === 'laminasi-lof' && app.S.angle === 60,
        },
        {
          title: 'LOF terhalang',
          text: 'Cari LOF dari sisi kiri: berkas yang melewati laminasi terpantul sehingga LOF tampak lemah atau hilang. Sekarang pindah ke sisi kanan (tombol Kanan), atur Gate A (mis. start 10 mm, lebar 60 mm), dan temukan echo LOF ≥ 50% FSH.',
          hint: 'Dari kanan, LOF di bevel kiri terkena leg 1 atau leg 2 tanpa melewati laminasi.',
          check: (app, pk) => app.S.side === 'kanan' && pk && pk.triggered && pk.amp >= 50,
        },
        {
          title: 'Selesai',
          text: 'Laminasi dicari dengan probe lurus: echo sebelum back wall, berulang, dan back wall hilang. Laminasi membuat daerah bayangan bagi probe sudut, jadi area itu harus diperiksa dari sisi lain atau dengan teknik lain, dan dicatat di laporan.',
        },
      ],
    },
    {
      id: 'cakupan',
      title: '11. Rencana scan & cakupan',
      desc: 'Menentukan sudut, sisi, leg, dan jarak probe supaya seluruh las + HAZ terlewati berkas.',
      setup(app) {
        baseSetup(app, { scenario: 'none', showDefects: true, angle: 60 });
        app.training = false;
        app.newProbe(false);
        app.S.specimen = 'x';
        app.setSpecimen('las');
        Object.assign(app.S.plan, { on: false, angles: [60], sides: 'kiri', legs: 1, near: null, far: null, haz: 6 });
        app.syncControls();
      },
      steps: [
        {
          title: 'Mengapa rencana scan',
          text: 'Sebelum inspeksi, teknisi membuat rencana scan: sudut probe, sisi, leg, dan jarak gerak probe dari sumbu las, sehingga seluruh zona pemeriksaan (logam las + HAZ) dilalui berkas. Kartu “Rencana scan & cakupan” menghitungnya untuk benda uji saat ini.',
        },
        {
          title: 'Tampilkan cakupan',
          text: 'Centang “Tampilkan cakupan di penampang”. Mulai dengan 60°, sisi kiri saja, leg 1 saja.',
          check: (app) => app.S.plan.on,
        },
        {
          title: 'Baca cakupan',
          text: 'Daerah merah tidak dilalui berkas: probe tidak bisa mendekat karena cap las, sehingga leg 1 tidak mencapai bagian atas las. Berapa persen cakupan yang tertulis?',
          quiz: { label: 'Cakupan', unit: '%', check: (v, app) => { const c = app.coverage(); return c && Math.abs(v - c.pct) <= 1.5; } },
        },
        {
          title: 'Tambahkan leg 2',
          text: 'Ubah Leg menjadi “Leg 1–2”. Berkas yang memantul di dasar pelat menyapu bagian atas las.',
          check: (app) => { const c = app.coverage(); return app.S.plan.legs === 2 && c && c.pct >= 99.5; },
        },
        {
          title: 'Jarak gerak probe',
          text: 'Cakupan bergantung pada seberapa jauh probe digeser. Isi “Jarak maks” 50 mm dan lihat daerah merah kembali muncul.',
          check: (app) => { const c = app.coverage(); return app.S.plan.far != null && app.S.plan.far <= 55 && c && c.pct < 99; },
        },
        {
          title: 'Rencana lengkap',
          text: 'Tanpa mengubah jarak maks, tambahkan sudut kedua dan pilih “Kedua sisi” sampai cakupan 100%. Biru = daerah yang dilalui ≥ 2 setup (lebih andal untuk cacat planar berbagai orientasi).',
          hint: 'Coba 70° lalu 45°. Sudut kecil punya skip pendek, sehingga leg 2 sudah mencapai bagian atas las walau probe hanya bergerak sampai 50 mm.',
          check: (app) => { const c = app.coverage(); return app.S.plan.angles.length >= 2 && app.S.plan.sides === 'keduanya' && c && c.pct >= 99.9; },
        },
        {
          title: 'Selesai',
          text: 'Rencana scan yang baik memakai lebih dari satu sudut, dari dua sisi bila bisa, dengan jarak gerak probe minimal sampai leg 2 mencapai tepi zona seberang (≈ 1 skip + lebar las/2 + HAZ). Cakupan geometris adalah syarat perlu, bukan jaminan deteksi.',
        },
      ],
    },
    {
      id: 'korosi',
      title: '12. Pengukuran tebal & peta korosi (probe dual, C-scan)',
      desc: 'Mengukur sisa tebal, membuat peta tebal C-scan, dan membandingkan probe tunggal dengan probe dual (TR).',
      setup(app) {
        baseSetup(app, { scenario: 'none', showDefects: false, angle: 0, wave: 'L', T: 16, gain: 32, velocity: UT.CONFIG.materials.cs.vL });
        app.training = false;
        app.newProbe(false);
        app.S.specimen = 'x';
        app.setSpecimen('korosi');
        app.syncControls();
      },
      steps: [
        {
          title: 'Pelat terkorosi',
          text: 'Pelat 16 mm ini terkorosi dari sisi bawah (sisi yang tidak bisa dijangkau): ada daerah dinding menipis dan beberapa pit kecil. Probe lurus mengukur sisa tebal dari SP echo back wall. Profil dasar disembunyikan; tugas Anda menemukannya.',
        },
        {
          title: 'Peta tebal (C-scan)',
          text: 'Klik “Rekam peta tebal (seluruh pelat)” di atas A-scan dan tunggu sampai selesai. Setiap titik peta = SP echo pertama di dalam Gate A.',
          check: (app) => app.imgKind === 'cscan' && app.imgDone,
        },
        {
          title: 'Periksa daerah tipis',
          text: 'Klik daerah kuning/oranye/merah pada peta untuk memindahkan probe ke sana. Pastikan echo pertama masuk Gate A.',
          hint: 'Warna biru = tebal nominal, merah = paling tipis. Abu-abu = tidak ada echo yang melewati level gate (permukaan miring atau pit kecil).',
          check: (app, pk) => app.spec.thick(app.S.probeX, app.S.probeY) < 0.9 * app.spec.T && pk && pk.triggered,
        },
        {
          title: 'Baca sisa tebal',
          text: 'Berapa sisa tebal di posisi probe sekarang (SP echo pertama)?',
          quiz: { label: 'Sisa tebal', unit: 'mm', check: (v, app) => Math.abs(v - app.spec.thick(app.S.probeX, app.S.probeY)) <= 0.7 },
        },
        {
          title: 'Probe dual (TR)',
          text: 'Probe tunggal punya dead zone panjang dan berkas lebar, sehingga pit kecil mudah terlewat. Ganti “Jenis probe 0°” menjadi Dual (TR), lalu ubah Gate A: awal 1,5 mm.',
          check: (app) => app.S.dual && app.S.gateStart <= 3,
        },
        {
          title: 'Bandingkan peta',
          text: 'Rekam ulang peta tebal dengan probe dual. Pit yang tadinya abu-abu kini lebih mungkin terukur; tebal minimum biasanya lebih kecil. Ingat galat lintasan-V probe dual: pada dinding tipis tebal terbaca sedikit lebih besar.',
          check: (app) => app.S.dual && app.imgKind === 'cscan' && app.imgDone,
        },
        {
          title: 'Selesai',
          text: 'Pengukuran korosi: petakan dulu seluruh area (C-scan atau grid), lalu periksa detail daerah tipis. Probe dual dipilih untuk dinding tipis dan pit karena dead zone pendek dan sensitif di dekat permukaan. Kalibrasi zero/velocity dilakukan pada step block yang tebalnya mendekati tebal yang diukur.',
        },
      ],
    },
    {
      id: 'pautlanjut',
      title: '13. Phased Array: fokus, delay law & E-scan',
      desc: 'Pengaruh fokus elektronik pada lebar berkas dan amplitudo, serta scan linear (E-scan).',
      setup(app) {
        baseSetup(app, { scenario: 'porositas', showDefects: true, angle: 60 });
        app.training = false;
        app.newProbe(false);
        app.S.specimen = 'x';
        app.setSpecimen('las');
        app.setTechnique('paut');
        app.syncControls();
      },
      steps: [
        {
          title: 'Delay law',
          text: 'Phased Array membelokkan berkas dengan menunda tembakan tiap elemen. Grafik batang ungu di atas S-scan adalah delay law aperture aktif: tanpa fokus waktunya naik lurus (muka gelombang datar dan miring).',
        },
        {
          title: 'Fokus',
          text: 'Pilih Fokus (kedalaman) 10 mm. Delay law menjadi melengkung, berkas di penampang menyempit di sekitar kedalaman fokus dan echo di dekatnya lebih tinggi.',
          check: (app) => app.S.pautFocus === 10,
        },
        {
          title: 'Batas near field',
          text: 'Pilih fokus 40 mm. Fokus hanya bisa dibuat di dalam near field aperture; di luar itu berkas berperilaku seperti tanpa fokus (lihat keterangan di samping pilihan fokus).',
          check: (app) => app.S.pautFocus === 40,
        },
        {
          title: 'E-scan',
          text: 'Tekan tombol E-scan. Sekarang 16 dari 64 elemen aktif digeser satu per satu pada sudut tetap, sehingga probe “memindai” tanpa digerakkan. Gambar E-scan = deretan A-scan dari 49 posisi berkas.',
          check: (app) => app.S.pautMode === 'E',
        },
        {
          title: 'Pilih berkas',
          text: 'Klik gambar E-scan (atau geser slider Berkas) untuk memilih berkas yang memberi echo porositas ≥ 30% FSH.',
          hint: 'Atur gain dan Gate A bila perlu; geser probe bila porositas berada di luar jangkauan E-scan.',
          check: (app, pk) => app.S.pautMode === 'E' && pk && pk.triggered && pk.amp >= 30,
        },
        {
          title: 'Selesai',
          text: 'S-scan menyapu sudut dari satu posisi; E-scan menggeser aperture pada satu sudut. Fokus mempersempit berkas dan menaikkan amplitudo di sekitar kedalaman fokus, tetapi hanya di dalam near field.',
        },
      ],
    },
    {
      id: 'seam',
      title: '14. Las memanjang pipa & las austenitik anisotropik',
      desc: 'Berkas di dinding pipa yang lengkung, sudut maksimum, dan pembelokan berkas di logam las austenitik.',
      setup(app) {
        baseSetup(app, { scenario: 'root-crack', showDefects: true, angle: 60 });
        Object.assign(app.S, { geom: 'pipa', OD: 219.1, seam: true });
        app.training = false;
        app.newProbe(false);
        app.S.specimen = 'x';
        app.setSpecimen('las');
        Object.assign(app.S, { gateStart: 15, gateWidth: 60 });
        app.syncControls();
      },
      steps: [
        {
          title: 'Penampang keliling',
          text: 'Las memanjang (seam) sejajar sumbu pipa, jadi berkas berjalan di bidang keliling: dinding luar dan dalam berupa busur. Lihat berkas 60°: berkas tidak mengenai dinding dalam dan memantul kembali ke permukaan luar.',
        },
        {
          title: 'Sudut maksimum',
          text: 'Berkas hanya mengenai dinding dalam bila sin θ ≤ Ri/Ro (lihat keterangan di atas penampang). Ganti sudut probe menjadi 45°.',
          check: (app) => app.S.angle === 45,
        },
        {
          title: 'Retak akar',
          text: 'Wedge datar yang digeser searah keliling kehilangan banyak energi; centang “Wedge dikontur sesuai diameter”. Lalu temukan echo retak akar ≥ 50% FSH. Perhatikan bahwa jarak skip pada pipa lebih panjang daripada pelat datar; alat dengan koreksi lengkung tetap menunjukkan kedalaman yang benar.',
          check: (app, pk) => pk && pk.triggered && pk.amp >= 50,
        },
        {
          title: 'Las austenitik',
          text: 'Kembali ke pelat: pilih Geometri “Pelat”, Material “Baja tahan karat austenitik”, dan pastikan “Anisotropi logam las” dicentang.',
          check: (app) => app.S.geom === 'pelat' && app.S.material === 'ss' && app.S.aniso,
        },
        {
          title: 'Pembelokan berkas',
          text: 'Geser probe sampai berkas melewati logam las. Garis biru = lintasan sebenarnya yang berbelok mengikuti butir kolumnar; garis putus-putus = lintasan yang diasumsikan alat. Akibatnya posisi indikasi menurut alat bisa meleset dan sebagian volume tidak terjangkau.',
        },
        {
          title: 'Selesai',
          text: 'Pada las memanjang pipa pilih sudut sesuai t/D dan gunakan koreksi lengkung. Pada las austenitik, berkas longitudinal (LW) lebih sedikit berbelok dan teredam dibanding gelombang geser; prosedur khusus dan blok referensi dari bahan yang sama diperlukan.',
        },
      ],
    },
    {
      id: 'aws',
      title: '15. Evaluasi AWS D1.1 (rating indikasi)',
      desc: 'Reference level dari lubang Ø1,5 mm blok IIW, faktor atenuasi, rating d = a − b − c, dan kelas A–D.',
      setup(app) {
        baseSetup(app, { scenario: 'lof-kiri', showDefects: true, angle: 70, T: 20 });
        app.training = false;
        app.newProbe(false);
        app.S.specimen = 'x';
        app.setSpecimen('las');
        app.syncControls();
      },
      steps: [
        {
          title: 'Rating indikasi',
          text: 'AWS D1.1 tidak memakai DAC. Setiap indikasi diberi rating d = a − b − c: a = gain saat echo indikasi tepat di garis referensi, b = gain saat echo lubang Ø1,5 mm blok IIW tepat di garis yang sama, c = 2 dB per inci SP setelah inci pertama. Kelas A–D ditentukan dari tabel menurut tebal dan sudut probe.',
        },
        {
          title: 'Pilih acuan',
          text: 'Pada kartu Sizing & evaluasi, pilih Acuan evaluasi “AWS D1.1”.',
          check: (app) => app.S.code === 'aws',
        },
        {
          title: 'Reference level b',
          text: 'Buka Blok IIW V1, pilih sisi B dan Arah berkas “← kiri”, lalu cari echo maksimum lubang Ø1,5 mm. Atur Gate A agar mencakup echo itu, lalu tekan “Rekam b”.',
          hint: 'Untuk 70° lubang Ø1,5 (15 mm dari sisi B) berada di SP ≈ 44 mm.',
          check: (app) => app.S.awsB != null,
        },
        {
          title: 'Indikasi di las',
          text: 'Kembali ke Las (benda uji), cari echo LOF ≥ 50% FSH dengan Gate A melingkupinya.',
          check: (app, pk) => app.spec.type === 'las' && pk && pk.triggered && pk.amp >= 50,
        },
        {
          title: 'Rating',
          text: 'Baca rating d pada pembacaan “Rating AWS (d)”.',
          quiz: { label: 'Rating d', unit: 'dB', check: (v, app) => app.aws && app.aws.d != null && Math.abs(v - app.aws.d) <= 1 },
        },
        {
          title: 'Selesai',
          text: 'Kelas A ditolak; kelas B dan C ditolak bila panjangnya melebihi batas; kelas D diterima. Tabel di simulator disusun untuk edukasi – selalu gunakan tabel dari edisi AWS D1.1 yang berlaku.',
        },
      ],
    },
    {
      id: 'tubular',
      title: '16. Sambungan tubular: sudut dihedral & zona',
      desc: 'Sudut dihedral lokal Ψ yang berubah di sekeliling brace, zona heel/sisi/toe, dan pemilihan sudut probe.',
      setup(app) {
        baseSetup(app, { scenario: 'none', showDefects: true, angle: 60, T: 10 });
        app.training = false;
        app.newProbe(false);
        app.S.specimen = 'x';
        app.setSpecimen('tubular');
        app.syncControls();
      },
      steps: [
        {
          title: 'Sambungan Y',
          text: 'Brace Ø168 × 10 dilas pada chord Ø324 × 16 dengan sudut θ = 45°. Di bawah penampang: tampilan 3D; titik merah = posisi keliling φ yang sedang diperiksa. Penampang di atas adalah penampang lokal di φ itu: probe di permukaan brace, berkas menuju las dan chord.',
        },
        {
          title: 'Ke daerah toe',
          text: 'Pindahkan posisi keliling ke toe (φ = 180°) dengan tombol 180°, slider φ, atau klik garis las pada tampilan 3D. Perhatikan bentuk las dan chord berubah.',
          check: (app) => app.tub && Math.abs(app.tub.phi - 180) < 10,
        },
        {
          title: 'Sudut dihedral di toe',
          text: 'Sudut dihedral lokal Ψ adalah sudut antara permukaan luar brace dan chord. Di toe sudutnya lancip sehingga alur las sempit dan sulit diperiksa. Berapa Ψ di posisi ini?',
          quiz: { label: 'Ψ', unit: '°', check: (v, app) => app.tub && Math.abs(v - app.tub.psi) <= 2 },
        },
        {
          title: 'Ke daerah heel',
          text: 'Kembali ke heel (φ = 0°). Di sini Ψ tumpul (180° − θ). Lihat baris info di atas penampang: sudut ideal untuk muka bevel brace dan muka chord.',
          check: (app) => app.tub && (app.tub.phi < 10 || app.tub.phi > 350),
        },
        {
          title: 'Pilih sudut probe',
          text: 'Muka bevel brace di heel paling baik diperiksa dengan berkas yang tegak lurus padanya. Ganti sudut probe ke 45° (sudut ideal untuk muka bevel lewat leg 2).',
          check: (app) => app.S.angle === 45,
        },
        {
          title: 'Temukan LOF',
          text: 'Pilih skenario cacat “LOF sisi brace (daerah heel)” pada kartu Sambungan tubular, lalu geser probe (← →) sampai echo LOF ≥ 60% FSH.',
          hint: 'Berkas harus memantul sekali di permukaan dalam brace (leg 2) sebelum mengenai muka bevel. Atur gain bila perlu.',
          check: (app, pk) => app.S.tubScenario === 'lof-brace' && pk && pk.triggered && pk.amp >= 60,
        },
        {
          title: 'Selesai',
          text: 'Pada sambungan tubular, Ψ berubah terus di sekeliling brace sehingga bentuk alur, sudut probe terbaik, dan jarak probe juga berubah. Prosedur UT tubular membagi keliling menjadi zona (heel, sisi, toe) dan memakai sudut probe yang berbeda untuk tiap zona.',
        },
      ],
    },
    {
      id: 'tubk',
      title: '17. Sambungan K & X: scan keliling brace',
      desc: 'B-scan keliling brace untuk menemukan posisi indikasi, daerah gap pada K, dan sambungan X.',
      setup(app) {
        baseSetup(app, { scenario: 'none', showDefects: true, angle: 45, T: 10 });
        Object.assign(app.S, { tubType: 'K', tubScenario: 'campuran' });
        app.training = false;
        app.newProbe(false);
        app.S.specimen = 'x';
        app.setSpecimen('tubular');
        app.syncControls();
      },
      steps: [
        {
          title: 'Sambungan K',
          text: 'Dua brace bertemu di chord dengan gap di antaranya (lihat tampilan 3D). Las berisi beberapa cacat di posisi keliling yang berbeda. Di penampang dekat heel (φ ≈ 0°) brace kedua terlihat di seberang gap.',
        },
        {
          title: 'B-scan keliling',
          text: 'Tekan “Rekam keliling brace (φ)” di atas A-scan. Probe tetap pada jarak yang sama dari las sementara posisi keliling disapu 0–360°. Tunggu sampai selesai.',
          check: (app) => app.imgKind === 'bscan' && app.imgDone,
        },
        {
          title: 'Retak kaki las',
          text: 'Pindah ke daerah sisi (sekitar φ = 90°) dan cari echo retak kaki las sisi brace ≥ 40% FSH (atur jarak probe dan gain).',
          hint: 'Retak berawal di kaki las pada permukaan brace; bersama permukaan itu membentuk corner trap yang terlihat lewat leg 2 (probe 45° paling kuat).',
          check: (app, pk) => app.tub && Math.abs(app.tub.phi - 90) < 25 && pk && pk.triggered && pk.amp >= 40,
        },
        {
          title: 'Posisi keliling',
          text: 'Catat posisi keliling indikasi: dalam laporan tubular, lokasi dinyatakan dengan φ (atau posisi jam) di sekeliling brace.',
          quiz: { label: 'φ', unit: '°', check: (v, app) => app.tub && Math.abs(v - app.tub.phi) <= 10 },
        },
        {
          title: 'Sambungan X',
          text: 'Ganti jenis sambungan menjadi X. Brace kedua kini berada di sisi bawah chord dan diperiksa terpisah dengan cara yang sama; penampang lokal brace atas tidak berubah.',
          check: (app) => app.S.tubType === 'X',
        },
        {
          title: 'Selesai',
          text: 'Pada sambungan tubular, scan dilakukan di seluruh keliling setiap brace dengan sudut probe sesuai zona. Lokasi indikasi dicatat sebagai posisi keliling φ, jarak dari kaki las, dan kedalaman.',
        },
      ],
    },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
