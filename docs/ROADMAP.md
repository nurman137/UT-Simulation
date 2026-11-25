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

## v0.2 – Kalibrasi & evaluasi ✅
- [x] Mode blok IIW/V1: cari probe index (R100), kalibrasi zero/range (echo 100 & 200 mm), cek sudut (Ø50 + skala)
- [x] Probe latihan dengan galat tersembunyi (exit point, sudut, zero)
- [x] Blok kalibrasi dasar ASME (SDH ¼T, ½T, ¾T, diameter sesuai tebal) dan perekaman titik DAC
- [x] Kurva DAC 100/50/20%, reference level (80% FSH), gain scanning (+6 dB)
- [x] Pembacaan %DAC dan evaluasi ASME Sec. VIII Div. 1 App. 12
- [x] Tampak atas + panjang cacat sepanjang las; sizing panjang dan tinggi 6 dB drop
- [x] Blok V2 (ISO 7963): R25/R50 sepusat, lubang Ø5, echo 25/100/175 dan 50/125/200 mm
- [x] Blok V1 mengikuti tata letak ISO 2400: Ø50 dekat ujung, sisi B dengan Ø1,5 (70°–80°)
- [ ] Koreksi transfer — ditunda

## v0.3 – Mode edukasi ✅
- [x] Pemilih aktivitas Bebas / Tutorial / Ujian
- [x] Tutorial langkah demi langkah (4 pelajaran) dengan cek otomatis dan kuis
- [x] Generator cacat acak dengan kode soal (bisa diulang/dibagikan)
- [x] Mode ujian: 3 tingkat, timer, mode guru terkunci, DAC otomatis untuk tingkat mudah
- [x] Laporan indikasi yang bisa diedit + penilaian otomatis (deteksi, lokasi, panjang, jenis, keputusan, indikasi palsu)
- [x] Ekspor laporan inspeksi (cetak/PDF, unduh .html)
- [ ] Penyimpanan hasil ujian lintas siswa (rekap kelas) — perlu server/penyimpanan bersama

## v0.4 – Teknik lanjutan ✅
- [x] B-scan UT konvensional (sepanjang las dan melintang)
- [x] Phased Array S-scan 40–70° (16 elemen, 5 MHz) + A-scan per sudut
- [x] TOFD: gelombang lateral, back wall, difraksi ujung dengan fase benar, D-scan, sizing tinggi
- [x] Bevel X (V ganda) dan U
- [x] Fokus elektronik & delay law Phased Array, scan linear (E-scan) — selesai di v0.8

## v0.5 – Pipa, austenitik, rekap kelas ✅
- [x] Pipa las girth: OD, keliling & posisi jam, wrap-around, inset penampang pipa
- [x] Wedge datar vs dikontur (rugi kopling, penyebaran berkas searah keliling)
- [x] Blok kalibrasi ASME lengkung + peringatan validitas DAC (0,9–1,5 × D, D ≤ 508 mm)
- [x] Material baja tahan karat austenitik (noise & atenuasi logam las, atenuasi lintasan dalam las)
- [x] Mode gelombang probe sudut SW/LW
- [x] Rekap kelas: file hasil .json / laporan .html, penilaian ulang, statistik, deteksi per jenis, CSV
- [x] Las memanjang (seam) pada pipa — selesai di v0.8
- [x] Pembelokan berkas (beam skewing) di las austenitik anisotropik — selesai di v0.8 (model sederhana)
- [x] Acuan AWS D1.1 — v0.8 (tabel edukasi); ISO 11666 belum
- [ ] Rekap kelas daring (penyimpanan bersama antar perangkat) — perlu server/hosting

## v0.6 – Cacat melintang, scan sejajar, TCG ✅
- [x] Retak melintang, undercut, retak kaki las (skenario tetap & soal acak generasi 2)
- [x] Arah scan sejajar las: penampang memanjang, posisi lateral, syarat cap digerinda
- [x] TCG dari DAC
- [x] Tutorial 5–9 (V2, TOFD, Phased Array, pipa & austenitik, scan sejajar)
- [x] Panel Tentang (model & batasan), siap rilis di GitHub Pages

## v0.7 – Probe lurus, laminasi, rencana scan, offline ✅
- [x] Probe lurus 0° (LW): back wall berulang, ukur tebal, kalibrasi zero/velocity
- [x] Laminasi di logam induk + bayangan berkas probe sudut
- [x] Rencana scan & peta cakupan zona las + HAZ (sudut, sisi, leg, jarak gerak probe)
- [x] Mode offline / dapat dipasang (PWA)
- [x] Tutorial 10–11
- [x] Probe dual-element (TR) 0° — selesai di v0.8

## v0.8 – Ujian praktik, AWS, PAUT lanjutan, korosi, pipa seam, anisotropi, bahasa Inggris ✅
- [x] Ujian praktik lengkap (proses kalibrasi, DAC, gain scanning ikut dinilai; rekap kelas)
- [x] Evaluasi AWS D1.1 (rating d = a − b − c, kelas A–D) – tabel perlu dicocokkan dengan dokumen resmi
- [x] Phased Array: fokus elektronik, delay law, E-scan
- [x] Probe dual (TR) 0°, pelat korosi, C-scan peta tebal
- [x] Las memanjang (seam) pada pipa: lintasan berkas di anulus
- [x] Pembelokan berkas di las austenitik anisotropik (model sederhana)
- [x] Tampilan bahasa Inggris
- [x] Tutorial 12–15

## v0.9 – Sambungan tubular T, Y, K, X ✅
- [x] Geometri 3D perpotongan brace–chord, sudut dihedral lokal Ψ, zona heel/sisi/toe
- [x] Penampang lokal per posisi keliling φ + penelusur sinar dengan pantulan di semua permukaan bebas
- [x] T, Y, K (gap, brace kedua di daerah heel), X (brace di sisi bawah chord)
- [x] Tampilan 3D (pilih φ dengan klik), B-scan keliling brace, skenario cacat tubular
- [x] Tutorial 16–17
- [ ] Kriteria penerimaan tubular AWS D1.1 Class R / Class X — perlu tabel dari dokumen resmi
- [ ] Skew berkas 3D & kelengkungan chord di penampang lokal — ditunda

## v1.0 – Alat instruktur & rilis ✅
- [x] Ujian di pelat, pipa girth, pipa seam, tubular; jumlah cacat, batas waktu, kode paket ujian
- [x] Editor skenario instruktur (file & kode bagikan), dipakai sebagai soal ujian
- [x] Laporan inspeksi format standar dengan sketsa lokasi
- [x] Simpan & buka sesi
- [x] Panduan pengguna ID/EN (HTML + PDF), aksesibilitas, performa HP lama

## v1.1 (menunggu masukan)
- [ ] Kriteria standar dari dokumen resmi: cek ulang tabel AWS D1.1 non-tubular, tubular Class R/X, opsi ISO 11666/5817
- [ ] Validasi amplitudo terhadap data alat nyata dan review praktisi NDT Level II/III
- [ ] Tag rilis v1.0 & GitHub Pages
