# UT-Simulation – Simulator UT Las

Simulator **Ultrasonic Testing (UT) probe sudut** untuk inspeksi las, dibuat sebagai media edukasi NDT.
Berjalan langsung di browser tanpa instalasi. Acuan: **ASME Sec. V Art. 4**. Bahasa tampilan: Indonesia.

## Cara menjalankan

Buka `index.html` di browser (Chrome, Edge, Firefox). Tidak perlu server maupun instalasi.

Bisa juga di-hosting lewat GitHub Pages: Settings → Pages → Deploy from branch, lalu pilih folder root.

## Fitur

### v0.5 – Pipa, material austenitik & rekap kelas
- **Pipa – las girth (keliling)**:
  - OD 114,3–762 mm. Panjang las = keliling π·OD, dengan posisi jam (jam 12 di y = 0).
  - Probe bisa digeser melingkar, dan tampak atas memuat inset penampang pipa.
  - Bidang berkas adalah penampang aksial dinding (datar); kelengkungan bekerja searah keliling.
- **Wedge datar vs dikontur**:
  - Wedge datar pada permukaan cembung menyisakan celah tepi h = W²/(8R), sehingga berkas melebar searah keliling. Rugi kopling diperkirakan dari celah ini (model kualitatif).
  - Contoh: OD 114 mm → celah 0,87 mm, rugi ≈ 9 dB.
- **Blok kalibrasi ASME lengkung**: DAC diberi peringatan bila dibuat pada blok datar untuk diameter ≤ 508 mm, bila diameter blok di luar 0,9–1,5×, atau bila kondisi wedge/material/mode berbeda.
- **Material baja tahan karat austenitik**:
  - Noise butir sangat tinggi di logam las (butir kolumnar).
  - Atenuasi tinggi, plus atenuasi tambahan sepanjang lintasan di dalam logam las.
- **Mode gelombang probe sudut**: geser (SW) atau longitudinal (LW). Velocity alat ikut menyesuaikan.
  - Pada las austenitik, LOF di sisi jauh las tenggelam dalam noise dengan SW (SNR ≈ −3 dB) tetapi masih terdeteksi dengan LW (SNR ≈ +8 dB).
- **Rekap kelas** (tab baru):
  - Siswa mengunduh **file hasil (.json)**; data yang sama juga tertanam di laporan .html.
  - Instruktur mengimpor banyak file sekaligus (tombol atau seret-lepas).
  - Nilai **dihitung ulang** dari kode soal dan laporan indikasi, sehingga angka nilai yang diubah di file ditandai "berbeda".
  - Tersedia statistik kelas (rata-rata, median, min–maks), persentase deteksi per jenis cacat, dan ekspor CSV (pemisah `;` untuk Excel).
  - Data rekap tersimpan di browser instruktur.

### v0.4 – B-scan, Phased Array, TOFD & bevel X/U
- **Pemilih teknik**: UT konvensional, Phased Array (S-scan), dan TOFD.
- **B-scan** (UT konvensional): rekam sepanjang las (y) atau melintang (x). Gambar amplitudo terhadap SP, ikut berubah saat gain diubah. Klik gambar untuk memindahkan probe.
- **Phased Array S-scan**: array 16 elemen, 5 MHz, sektor 40–70° dalam koordinat sebenarnya, dengan garis T/2T/3T. Klik sektor atau geser slider untuk memilih sudut A-scan. Gate, DAC, dan pembacaan berlaku untuk sudut terpilih.
- **TOFD**: pemancar dan penerima gelombang longitudinal 60°, 5 MHz, dengan PCS otomatis (perpotongan berkas di ⅔T) atau manual.
  - Sinyal yang disimulasikan: gelombang lateral, back wall, dan difraksi ujung cacat dengan fase yang benar (ujung atas terbalik, ujung bawah sefase dengan lateral).
  - D-scan grayscale sepanjang las dan A-scan RF.
  - Kedalaman dihitung dari d = √((v·t/2)² − S²). Penanda A/B untuk mengukur tinggi cacat.
- **Bevel X (V ganda)** dengan root face di tengah tebal, cap di kedua sisi, dan IP tertanam tanpa corner trap.
- **Bevel U** dengan jari-jari akar 5 mm dan dinding 10°.
- Posisi cacat menyesuaikan jenis bevel. Tutorial dan ujian tetap memakai UT konvensional dan bevel V.

### v0.3 – Tutorial, ujian & laporan
- **Pemilih aktivitas**: Bebas, Tutorial, dan Ujian.
- **Tutorial terpandu** dengan 4 pelajaran. Setiap langkah dicek otomatis dari state simulator, ditambah kuis isian:
  1. Dasar A-scan: menemukan echo, amplitudo maksimum, kedalaman, leg, scan dari dua sisi.
  2. Kalibrasi probe di blok IIW: X-value, zero, echo kedua 200 mm, sudut dari Ø50.
  3. Membuat DAC ASME: SDH ¼T, ½T, ¾T, 5/4T, reference level dan gain scanning.
  4. Sizing 6 dB drop dan evaluasi ASME, lalu mencatat indikasi ke laporan.
- **Mode ujian**: cacat acak tersembunyi yang bisa diulang dengan **kode soal** (satu kode untuk seluruh kelas), tiga tingkat kesulitan, timer, dan mode guru terkunci.
  - Mudah: 1 cacat, probe ideal, DAC disediakan.
  - Sedang: 2 cacat, buat DAC sendiri.
  - Sulit: 3 cacat, probe harus dikalibrasi dulu di blok IIW.
- **Penilaian otomatis** per cacat: deteksi 40, lokasi 15, panjang 15, jenis 15, keputusan 15. Setiap indikasi palsu −10 poin. Catatan kesalahan ditampilkan, lalu cacat dibuka setelah jawaban dikirim.
- **Laporan indikasi** yang bisa diedit (isi otomatis dari pembacaan alat dan hasil sizing), **cetak / simpan PDF**, dan **unduh .html** berisi data probe, kalibrasi, titik DAC, indikasi, dan hasil penilaian.
- **Skenario acak** juga tersedia di mode Bebas (kode soal + jumlah cacat).
- Penampang menampilkan cacat pada posisi probe sepanjang las. Root bead hilang di daerah incomplete penetration.

### v0.2 – Kalibrasi, DAC & evaluasi ASME
- **Tiga benda uji**: las, **blok IIW (V1)**, dan **blok kalibrasi dasar ASME** (SDH ¼T, ½T, ¾T dengan diameter sesuai tebal).
- **Probe latihan** (tombol “Probe baru”): probe punya galat tersembunyi pada exit point, sudut, dan zero. Ketiganya harus ditemukan lewat kalibrasi:
  - **Probe index / X-value** dari echo maksimum R100,
  - **Zero (probe delay) & velocity**: echo R100 harus tepat di 100 mm, echo kedua di 200 mm,
  - **Sudut** dari echo maksimum lubang Ø50 dan skala sudut pada blok.
  Semua pembacaan alat memakai nilai yang dimasukkan pengguna, jadi kalibrasi yang salah langsung terlihat sebagai posisi cacat yang meleset. Mode guru menampilkan nilai sebenarnya.
- **DAC**: rekam titik dari puncak gate (termasuk lewat leg 2), kurva 100% / 50% / 20% DAC di A-scan, *primary reference level* (titik tertinggi = 80% FSH), dan tombol gain scanning +6 dB.
- **Pembacaan %DAC** dan dB terhadap DAC. DAC tidak diekstrapolasi di luar titik yang direkam.
- **Tampak atas** las: probe bisa digeser sepanjang las (↑ ↓), dan cacat punya panjang nyata.
- **Sizing 6 dB drop** untuk panjang (sepanjang las) dan tinggi (kedalaman), plus tombol “puncak gate = 80%”.
- **Evaluasi ASME Sec. VIII Div. 1 App. 12**: < 20% DAC diabaikan; retak, LOF, dan IP ditolak; indikasi lain ditolak bila > reference level dan lebih panjang dari batas (6 mm / t/3 / 19 mm).
- Pulsa awal (*main bang*) dan gema wedge tampil saat zero belum diatur.

### v0.1 – Dasar
- Penampang las bevel V: tebal 10–40 mm, sudut bevel, root gap, serta cap dan root bead yang bisa dihilangkan.
- Probe sudut 45° / 60° / 70°, 2,25 / 4 / 5 MHz, kristal 6–20 mm, dari dua arah.
- Ray tracing: berkas −6 dB (termasuk near field), leg 1/2/3, dan penanda skip.
- A-scan real-time di samping penampang: gain, range, delay, full wave/RF, noise elektronik dan noise butir, plus Gate A.
- Pembacaan SP, kedalaman, jarak permukaan, posisi terhadap sumbu las, dan leg. Kursor A-scan tertaut ke penampang.
- Skenario cacat: LOF kiri/kanan, IP, porositas, slag, retak tengah, retak akar, campuran, dan las tanpa cacat (echo geometri).

## Alur latihan yang disarankan

1. Tekan **Probe baru (belum dikalibrasi)**.
2. **Blok IIW**: cari echo R100 maksimum, baca jarak muka depan probe ke tanda pusat R100, lalu isi **X-value**.
3. Atur **zero** sampai echo R100 tepat di 100 mm (cek echo kedua di 200 mm).
4. Balik arah berkas ke lubang **Ø50**, cari echo maksimum, baca skala sudut pada tanda index, lalu isi **sudut terukur**.
5. **Blok ASME**: rekam DAC dari SDH ¼T, ½T, ¾T dan lanjut lewat leg 2 (5/4T, 6/4T, 7/4T). Turunkan level gate bila echo lemah.
6. Tekan **Gain = reference**, lalu **Gain scanning (+6 dB)**.
7. **Las**: scan dari kedua sisi, evaluasi %DAC, ukur panjang dengan 6 dB drop, pilih interpretasi, dan baca hasil evaluasi.

## Model fisika (ringkas)

| Aspek | Pendekatan |
|---|---|
| Lintasan | Sinar lurus + pantulan di permukaan atas/bawah (metode bayangan/unfolding) |
| Waktu echo | t = 2·SP / v<sub>T</sub> (gelombang geser, baja karbon 3240 m/s) |
| Profil berkas | Gaussian, setengah lebar −6 dB = √((D/4)² + (r·tan γ)²), sin γ = 0,51·λ/D |
| Amplitudo | Penyebaran berkas (≈ r<sup>−1,5</sup> setelah near field) × atenuasi × faktor sudut datang |
| Cacat | Permukaan cacat disampling tiap 0,1 mm lalu dijumlahkan koheren (Huygens/Kirchhoff). Pantulan spekular dan difraksi ujung muncul dengan sendirinya |
| Corner trap | Faktor pantul reflektor sudut 90° sebagai fungsi sudut berkas (untuk IP, retak akar, akar las, ujung pelat) |
| Noise | Titik hambur butir yang tetap posisinya (speckle konsisten saat probe digeser) + noise elektronik |
| Panjang cacat | Profil berkas Gaussian searah sumbu las. Di ujung reflektor panjang amplitudo turun tepat 6 dB |
| Material | Atenuasi, noise butir logam induk/las, dan atenuasi lintasan di dalam las bergantung pada material dan mode gelombang (SW/LW) |
| Permukaan lengkung | Rugi kopling ≈ 10 dB per mm celah tepi wedge datar (maks. 18 dB); berkas melebar searah keliling |
| Waktu alat | t = 2·SP/v + zero (wedge). Pembacaan alat memakai velocity dan zero yang dimasukkan pengguna |
| Phased Array | Setiap sudut sektor disimulasikan sebagai berkas dengan aperture array (9,6 mm) dari exit point yang sama. Fokus elektronik belum dimodelkan |
| TOFD | Pitch-catch gelombang longitudinal (5920 m/s). Back wall dan cacat dijumlahkan sebagai titik hambur Huygens, sehingga difraksi ujung dan fasenya muncul dari interferensi. Lateral wave = fraksi tetap dari back wall |

Model ini disederhanakan untuk edukasi (2D, tanpa konversi mode penuh, tanpa pembelokan berkas akibat anisotropi las austenitik, tanpa fokus elektronik pada Phased Array). Faktor material dan rugi kopling bersifat kualitatif. Nilai amplitudonya bersifat kualitatif dan tidak menggantikan latihan dengan alat dan spesimen nyata.

## Struktur proyek

```
index.html              halaman aplikasi
css/style.css           tampilan
src/config.js           konstanta material, probe, default
src/geometry.js         geometri pelat/las/probe, unfolding, lokasi reflektor
src/defects.js          skenario cacat & reflektor geometri, noise butir
src/physics.js          mesin simulasi sinyal A-scan
src/specimens.js        benda uji: las, blok IIW (V1), blok kalibrasi dasar ASME
src/calibration.js      kebenaran probe tersembunyi, pemetaan zero/velocity, X-value
src/dac.js              DAC, reference level, evaluasi ASME App. 12
src/exam.js             soal acak, DAC otomatis, penilaian ujian
src/imaging.js          B-scan, S-scan Phased Array, simulasi TOFD, akuisisi progresif
src/render-images.js    gambar B-scan/D-scan dan sektor S-scan
src/report.js           laporan inspeksi HTML (cetak/PDF/unduh)
src/rekap.js            file hasil ujian, penilaian ulang, statistik kelas, CSV
src/tutorial.js         definisi pelajaran tutorial
src/edu.js              UI aktivitas: tutorial, ujian, tabel laporan
src/render-section.js   gambar penampang, berkas, probe
src/render-topview.js   tampak atas las (posisi probe sepanjang las, sizing)
src/render-ascan.js     gambar layar A-scan
src/main.js             state, kontrol UI, interaksi, loop render
tests/run.js            unit test geometri, fisika, kalibrasi, DAC, ujian, laporan
docs/ROADMAP.md         rencana pengembangan
```

## Test

```bash
node tests/run.js
```

## Rencana berikutnya

Lihat [docs/ROADMAP.md](docs/ROADMAP.md).
