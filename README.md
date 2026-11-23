# UT-Simulation – Simulator UT Las

Simulator **Ultrasonic Testing (UT) probe sudut** untuk inspeksi las, dibuat sebagai media edukasi NDT.
Berjalan langsung di browser tanpa instalasi. Acuan: **ASME Sec. V Art. 4**. Bahasa tampilan: Indonesia.

## Cara menjalankan

Buka `index.html` di browser (Chrome, Edge, Firefox). Tidak perlu server maupun instalasi.

Bisa juga di-hosting lewat GitHub Pages: Settings → Pages → Deploy from branch, lalu pilih folder root.

## Fitur

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
| Waktu alat | t = 2·SP/v + zero (wedge). Pembacaan alat memakai velocity dan zero yang dimasukkan pengguna |

Model ini disederhanakan untuk edukasi (2D, tanpa konversi mode penuh, tanpa anisotropi). Nilai amplitudonya bersifat kualitatif dan tidak menggantikan latihan dengan alat dan spesimen nyata.

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
src/render-section.js   gambar penampang, berkas, probe
src/render-topview.js   tampak atas las (posisi probe sepanjang las, sizing)
src/render-ascan.js     gambar layar A-scan
src/main.js             state, kontrol UI, interaksi, loop render
tests/run.js            unit test geometri & fisika
docs/ROADMAP.md         rencana pengembangan
```

## Test

```bash
node tests/run.js
```

## Rencana berikutnya

Lihat [docs/ROADMAP.md](docs/ROADMAP.md). Rencana terdekat (v0.3): mode tutorial dan mode ujian dengan cacat acak serta laporan inspeksi.
