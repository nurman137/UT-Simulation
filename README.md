# UT-Simulation – Simulator UT Las

Simulator **Ultrasonic Testing (UT) probe sudut** untuk inspeksi las, dibuat sebagai media edukasi NDT.
Berjalan langsung di browser tanpa instalasi. Acuan: **ASME Sec. V Art. 4**. Bahasa tampilan: Indonesia.

## Cara menjalankan

Buka `index.html` di browser (Chrome, Edge, Firefox). Tidak perlu server maupun instalasi.

Bisa juga di-hosting lewat GitHub Pages: Settings → Pages → Deploy from branch, lalu pilih folder root.

**Tanpa internet (offline):** bila dibuka lewat `http(s)` (mis. GitHub Pages atau `python3 -m http.server`), aplikasi
menyimpan semua berkasnya di perangkat. Setelah sekali dibuka, simulator tetap berjalan tanpa internet dan bisa
dipasang sebagai aplikasi ("Install app" / "Tambahkan ke layar utama"). Saat membuka `index.html` langsung dari
berkas (`file://`) aplikasi juga jalan, tetapi tanpa fitur pasang/offline otomatis.

## Panduan pengguna

- Bahasa Indonesia: [docs/panduan.html](docs/panduan.html) · [PDF](docs/Panduan-Simulator-UT-Las.pdf)
- English: [docs/guide-en.html](docs/guide-en.html) · [PDF](docs/Weld-UT-Simulator-Guide.pdf)

## Fitur

### v1.1 – Kriteria AWS D1.1:2025
- **Tabel 8.3** (nontubular, beban siklik, tarik): rating d = a − b − c, kelas A–D untuk tebal 8–200 mm dan probe
  70/60/45°, batas panjang kelas B/C (20/50 mm), **scanning level** menurut sound path (tombol *Gain scanning AWS*).
- **Annex N, Tabel N.1** (statis & siklik): SSL/DRL; level 1 (> 5 dB di atas SSL ditolak), level 2, level 3 diabaikan.
- **Tubular Class R** (10.26.1.1, Gambar 10.23): DRL = SSL − 6 dB; batas panjang reflektor individual dan akumulasi
  menurut tebal las (dibaca dari grafik); reflektor bulat terpisah s.d. SSL diterima.
- Pilihan acuan di kartu Sizing & evaluasi; laporan mencantumkan acuan yang dipakai.
- Belum: verifikasi Tabel 8.2 (statis), Class X (Gambar 10.24), definisi SSL 10.29.6 (simulator memakai DAC 100%).

### v1.0 – Alat instruktur, laporan standar, sesi, rilis
- **Ujian di berbagai benda uji**: pelat, pipa girth, pipa memanjang (seam), sambungan tubular T/Y/K/X; jumlah cacat,
  **batas waktu** (jawaban terkirim otomatis), sumber soal acak atau **skenario instruktur**, dan **kode paket ujian**
  (`UTX1:…`) untuk dibagikan ke siswa. Rekap kelas menilai ulang semua jenis soal.
- **Editor skenario instruktur**: susun cacat sendiri (9 jenis), unduh/impor file, bagikan lewat kode `UTS1:…`.
- **Laporan inspeksi format standar**: informasi umum, benda uji, prosedur & acuan, peralatan, kalibrasi, indikasi,
  **sketsa lokasi**, kesimpulan otomatis, tanda tangan; bahasa Indonesia/Inggris.
- **Simpan & buka sesi** (.json): pengaturan, probe, kalibrasi, DAC, sizing, data laporan, dan tabel indikasi.
- **Panduan pengguna** ID/EN (HTML + PDF), aksesibilitas (axe-core tanpa pelanggaran), simulasi sinyal ±3× lebih cepat
  (tabel pulsa) untuk HP lama.

### v0.9 – Sambungan tubular T, Y, K, X
- Benda uji baru **Sambungan tubular**: chord & brace (OD, tebal), sudut brace θ, gap K, brace di sisi bawah untuk X.
- **Geometri 3D**: perpotongan brace–chord dihitung tepat; **sudut dihedral lokal Ψ** berubah di sekeliling brace
  (heel 180° − θ, toe θ, saddle 180° − acos β pada T). Tampilan 3D: klik garis las untuk memilih posisi keliling φ.
- **Penampang lokal** di setiap φ: brace, alur las (bevel menyesuaikan Ψ), dan chord; berkas ditelusuri dengan pantulan
  di semua permukaan bebas; brace kedua K muncul di daerah gap. Sudut probe ideal untuk muka bevel brace dan muka chord.
- Skenario cacat tubular: LOF sisi brace (heel), LOF sisi chord (sisi), akar tidak tertembus (toe), retak kaki las sisi
  brace, porositas, campuran. **B-scan keliling brace** (φ 0–360°).
- **Tutorial 16–17**: sudut dihedral & zona; sambungan K & X dengan scan keliling.
- Batasan: chord dianggap lurus secara lokal, tanpa skew berkas 3D; kriteria tubular AWS Class R/X belum dimasukkan
  (evaluasi memakai %DAC ASME atau rating AWS).

### v0.8 – Ujian praktik, AWS D1.1, PAUT lanjutan, korosi, pipa seam, anisotropi, bahasa Inggris
- **Ujian praktik lengkap**: probe dengan galat tersembunyi (ditentukan kode soal), kalibrasi, DAC, gain scanning,
  scan, dan laporan. Nilai akhir = 70% laporan + 30% proses (kalibrasi 40, DAC 40, gain scanning 20); proses ikut
  dinilai ulang di Rekap kelas.
- **Evaluasi AWS D1.1** (struktur, beban statis) sebagai alternatif ASME: reference level b dari lubang Ø1,5 mm blok
  IIW sisi B, faktor atenuasi c, rating d = a − b − c, kelas A–D dan batas panjang. *Tabel disusun untuk edukasi;
  cocokkan dengan edisi AWS D1.1 yang berlaku.*
- **Phased Array**: fokus elektronik (efektif hanya di dalam near field), grafik delay law, dan **E-scan** (64 elemen,
  aperture 16 elemen digeser).
- **Probe dual (TR) 0°** dan **pelat korosi**: korosi umum + pit, dead zone pendek, galat lintasan-V, dan
  **C-scan peta tebal**.
- **Las memanjang (seam) pada pipa**: berkas di penampang keliling (anulus) dengan pantulan di dinding lengkung,
  batas sudut sin θ ≤ Ri/Ro, koreksi lengkung pada pembacaan alat.
- **Anisotropi las austenitik**: berkas berbelok mengikuti butir kolumnar; lintasan sebenarnya vs asumsi alat.
- **Bahasa Inggris** (tombol EN/ID di kanan atas), termasuk tutorial, kanvas, dialog, dan laporan.
- **Tutorial 12–15**: korosi & probe dual, PAUT fokus & E-scan, pipa seam & anisotropi, AWS D1.1.

### v0.7 – Probe lurus 0°, laminasi, rencana scan, mode offline
- **Probe lurus 0°** (gelombang longitudinal): echo back wall T, 2T, 3T…, pengukuran tebal, kalibrasi cukup zero & velocity.
- **Laminasi di logam induk**: echo berulang sebelum back wall dan back wall hilang. Laminasi juga **membayangi berkas
  probe sudut** (skenario “Laminasi + LOF”: LOF hampir hilang dari sisi kiri, jelas dari sisi kanan).
- **Rencana scan & cakupan**: pilih sudut (45/60/70°), sisi, leg, jarak gerak probe, dan lebar HAZ; penampang menampilkan
  daerah yang dilalui berkas −6 dB (hijau = 1 setup, biru = ≥ 2 setup, merah = tidak tercakup) beserta persentase cakupan.
- **Mode offline (PWA)**: service worker + manifest, bisa dipasang di HP/laptop.
- **Tutorial 10–11**: probe lurus & laminasi; rencana scan & cakupan.

### v0.6 – Cacat melintang, scan sejajar las, TCG, tutorial lanjutan
- **Cacat baru**: retak melintang (tegak lurus sumbu las), undercut, dan retak kaki las (toe crack). Ketiganya juga muncul di soal ujian acak.
- **Arah scan tegak lurus / sejajar las**.
  - Retak melintang hampir tak terlihat dari scan tegak lurus (bidang retak sejajar berkas), tetapi terdeteksi dari scan sejajar.
  - Penampang memanjang las, posisi lateral probe, dan syarat cap digerinda agar probe bisa duduk di atas las.
- **TCG (Time Corrected Gain)** dari DAC: reflektor referensi di kedalaman mana pun tampil 80% pada reference level, garis DAC menjadi datar, %DAC tetap benar.
- **Tutorial 5–9**: kalibrasi blok V2, TOFD (sizing tinggi), Phased Array S-scan, pipa & material austenitik, scan sejajar untuk cacat melintang.
- **Panel “Tentang”**: ringkasan model dan batasan untuk instruktur.
- Kode soal ujian lama (v0.3–v0.5) tetap menghasilkan soal yang sama saat dinilai ulang di Rekap kelas (generator acak berversi).
- Toleransi status kalibrasi sudut menjadi ±1,5° (cek sudut probe umumnya ±2°).

### Blok kalibrasi V1 & V2 (pembaruan)
- **Blok IIW V1 (ISO 2400 / EN 12223)**, 300 × 100 mm, dengan dua sisi pemindaian:
  - **Sisi A**: R100 dengan tanda pusat (echo 100 dan 200 mm), lubang Ø50 dekat ujung blok, skala sudut 35°–76°.
  - **Sisi B**: lubang Ø1,5 berjarak 15 mm dari permukaan untuk cek sudut 70°–80°, dan penggaris 0–20 cm.
  - Posisi lubang diturunkan dari skala sudut yang terukir pada blok (tanda θ di x = x_lubang + d·tan θ).
- **Blok V2 (ISO 7963)** dengan dua permukaan pindai:
  - **Sisi atas**: R25 dan R50 sepusat, panjang 75 mm, lubang Ø5 sedalam 20 mm di bawah titik pusat.
  - **Sisi miring** (31°, menyinggung R25): lubang Ø5 berjarak ≈ 7,9 mm dari permukaan, skala 65°–75°. Tampilannya adalah blok yang diputar, sehingga skala berada di kiri tanda 0.
  - Menghadap R25 → echo 25, 100, 175 mm. Menghadap R50 → echo 50, 125, 200 mm.
  - Skala sudut 35°–65° (sisi atas) untuk lubang Ø5, dan tanda sudut pada busur R50.
  - Blok kecil ini ditujukan untuk probe miniatur, jadi wedge boleh menggantung di tepi blok.

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
2. **Blok IIW V1 sisi A** (atau **V2**): cari echo R100 (V2: R25/R50) maksimum, baca jarak muka depan probe ke tanda pusat, lalu isi **X-value**.
3. Atur **zero** sampai echo R100 tepat di 100 mm (cek echo kedua di 200 mm). Pada V2: 25/100/175 atau 50/125/200 mm.
4. Balik arah berkas ke lubang **Ø50** (probe 70°–80°: lubang **Ø1,5** di sisi B; V2: lubang **Ø5**), cari echo maksimum, baca skala sudut pada tanda index, lalu isi **sudut terukur**.
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
| Probe lurus & laminasi | Back wall sebagai pemantul datar di T, 2T, …; laminasi = reflektor datar dua sisi dengan echo ulang, dan daerah bayangan yang melemahkan berkas yang melewatinya |
| Lintasan umum | Sumbu berkas sebagai polyline (pantulan di dinding lengkung pipa, pembelokan di las austenitik); amplitudo dihitung per segmen dengan model berkas yang sama |
| Fokus PAUT | Lebar berkas di bidang aktif menyempit menuju batas difraksi di jarak fokus (bila < near field); energi terkonsentrasi menaikkan amplitudo |
| Korosi & probe dual | Telapak berkas pada permukaan bawah disampling; tiap titik memantul sesuai tebal dan kemiringan. Probe dual: sensitivitas menurut kedalaman, crosstalk kecil, galat lintasan-V |
| Cakupan scan | Geometris: titik zona tercakup bila berada dalam lebar berkas −6 dB untuk salah satu posisi probe di rentang jarak yang dipilih (leg 1/2) |
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
src/specimens.js        benda uji: las/pipa, blok IIW V1 (sisi A/B), blok V2, blok kalibrasi dasar ASME
src/calibration.js      kebenaran probe tersembunyi, pemetaan zero/velocity, X-value
src/dac.js              DAC, reference level, evaluasi ASME App. 12
src/exam.js             soal acak, DAC otomatis, penilaian ujian
src/scanplan.js         rencana scan: peta cakupan zona las + HAZ, jarak skip
src/raypath.js          lintasan berkas umum: pipa seam (anulus), pembelokan berkas las austenitik
src/corrosion.js        pelat korosi, probe dual (TR), A-scan permukaan bawah tidak rata, tebal echo pertama
src/tubular.js          sambungan tubular T/Y/K/X: geometri 3D, Ψ lokal, penampang lokal, penelusur sinar, cacat
src/render-tubular.js   tampilan 3D sambungan dan penampang lokal
src/editor.js           editor skenario instruktur (UI)
src/i18n.js             pilihan bahasa (kamus, pola, frasa; DOM, kanvas, dialog, laporan)
src/i18n-lessons-en.js  terjemahan Inggris pelajaran tutorial
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
docs/panduan.html       panduan pengguna (ID) · docs/guide-en.html (EN) · PDF
manifest.webmanifest    data aplikasi terpasang (PWA)
sw.js                   service worker: cache berkas untuk mode offline (ganti nama cache tiap rilis)
icons/                  ikon aplikasi
```

## Test

```bash
node tests/run.js
```

## Rencana berikutnya

Lihat [docs/ROADMAP.md](docs/ROADMAP.md).
