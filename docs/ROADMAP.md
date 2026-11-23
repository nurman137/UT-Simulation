# Roadmap Simulator UT Las

Acuan: ASME Sec. V Art. 4 · Bahasa: Indonesia · Platform: web (HTML + JavaScript + Canvas)

## v0.1 – MVP ✅
- [x] Kerangka aplikasi, layout penampang + A-scan berdampingan (bertumpuk di HP)
- [x] Geometri pelat dan las bevel V (T, bevel, root gap, root face, cap, root bead)
- [x] Probe sudut 45/60/70°, frekuensi, ukuran kristal, sisi kiri/kanan, geser dengan mouse/keyboard
- [x] Ray tracing: sumbu berkas, lebar berkas −6 dB, leg 1/2/3, penanda skip
- [x] Model cacat: LOF kiri/kanan, IP, porositas, slag, retak tengah, retak akar, campuran
- [x] Echo geometri: akar, kaki cap, ujung pelat
- [x] A-scan: gain, range, delay, velocity, full wave/RF, noise butir dan elektronik
- [x] Gate A + pembacaan SP, kedalaman, jarak permukaan, posisi terhadap sumbu las, leg
- [x] Kursor A-scan tertaut ke penampang
- [x] Unit test geometri dan fisika

## v0.2 – Kalibrasi & evaluasi
- [ ] Mode blok IIW/V1: cari probe index (R100) dan cek sudut probe
- [ ] Mode blok V2: kalibrasi range (R25/R50)
- [ ] Blok kalibrasi dasar ASME (SDH) dan perekaman titik DAC
- [ ] Kurva DAC, reference level, dan gain scanning (+6 dB)
- [ ] Evaluasi indikasi terhadap 20% / 50% / 100% DAC
- [ ] Sizing panjang 6 dB drop (tampak atas sederhana) dan sizing tinggi

## v0.3 – Mode edukasi
- [ ] Mode tutorial langkah demi langkah
- [ ] Mode ujian: cacat acak tersembunyi, laporan siswa, penilaian otomatis
- [ ] Ekspor laporan inspeksi

## v0.4+ – Lanjutan
- [ ] B-scan dan S-scan (Phased Array)
- [ ] TOFD
- [ ] Bevel X/U, geometri pipa (las girth)
- [ ] Material austenitik (noise tinggi, pembelokan berkas)

## v1.0
- [ ] Validasi kualitatif terhadap data alat nyata dan review praktisi NDT Level II/III
- [ ] Rilis di GitHub Pages
