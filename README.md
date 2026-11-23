# UT-Simulation – Simulator UT Las

Simulator **Ultrasonic Testing (UT) probe sudut** untuk inspeksi las, dibuat sebagai media edukasi NDT.
Berjalan langsung di browser tanpa instalasi. Acuan: **ASME Sec. V Art. 4**. Bahasa tampilan: Indonesia.

## Cara menjalankan

Buka `index.html` di browser (Chrome, Edge, Firefox). Tidak perlu server maupun instalasi.

Bisa juga di-hosting lewat GitHub Pages: Settings → Pages → Deploy from branch, lalu pilih folder root.

## Fitur v0.1

- **Penampang las bevel V**: tebal pelat 10–40 mm, sudut bevel, root gap, serta cap dan root bead yang bisa dihilangkan (digerinda rata).
- **Probe sudut 45° / 60° / 70°**, frekuensi 2,25 / 4 / 5 MHz, ukuran kristal 6–20 mm, dan bisa dipasang di sisi kiri atau kanan las.
- **Geser probe** dengan mouse/jari atau tombol ← → (Shift = 5 mm). Wedge tidak bisa melewati cap las.
- **Ray tracing**: sumbu berkas dan lebar berkas −6 dB (termasuk near field), pantulan leg 1/2/3, serta penanda ½ skip dan 1 skip.
- **A-scan real-time** di samping penampang: gain (dB), range, delay, velocity, tampilan full wave atau RF, noise elektronik, dan noise butir.
- **Gate A** dengan pembacaan amplitudo, sound path, kedalaman, jarak permukaan, posisi terhadap sumbu las, dan nomor leg.
- **Kursor tertaut**: arahkan kursor ke A-scan untuk melihat titik yang sesuai di sepanjang berkas.
- **Skenario cacat**: lack of sidewall fusion kiri/kanan, incomplete penetration, porositas, slag, retak tengah, retak akar, dan campuran. Ada juga skenario tanpa cacat untuk mempelajari echo geometri (akar dan kaki cap).
- **Mode guru**: cacat bisa disembunyikan untuk latihan mencari.
- **Demonstrasi salah kalibrasi**: kalau velocity diubah, posisi yang dihitung alat bergeser dari posisi cacat sebenarnya.

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

Model ini disederhanakan untuk edukasi (2D, tanpa konversi mode penuh, tanpa anisotropi). Nilai amplitudonya bersifat kualitatif dan tidak menggantikan latihan dengan alat dan spesimen nyata.

## Struktur proyek

```
index.html              halaman aplikasi
css/style.css           tampilan
src/config.js           konstanta material, probe, default
src/geometry.js         geometri pelat/las/probe, unfolding, lokasi reflektor
src/defects.js          skenario cacat & reflektor geometri, noise butir
src/physics.js          mesin simulasi sinyal A-scan
src/render-section.js   gambar penampang, berkas, probe
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

Lihat [docs/ROADMAP.md](docs/ROADMAP.md). Rencana terdekat (v0.2): kalibrasi dengan blok IIW/V1 dan V2, blok kalibrasi dasar ASME (SDH), kurva DAC/reference level, dan kalkulator lokasi.
