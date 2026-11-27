# Media Rate Card Directory

Direktori rate card media online dengan harga terbuka.
Situs: **https://gigannth.github.io/Mediaratecard/**

Situs ini statis dan gratis: HTML, CSS, dan sedikit JavaScript, dibangun dari file data oleh `build.js` tanpa library tambahan. Hosting memakai GitHub Pages dari folder `docs/`.

## Struktur

| Folder / file | Isi |
|---|---|
| `data/media/*.json` | Data tiap media: harga, layanan, kontak, metrik Instagram |
| `data/testimonials.json` | Testimoni klien (tampil hanya jika diisi dan ada izin) |
| `data/README.md` | Panduan mengisi data |
| `src/css`, `src/js`, `src/img` | Desain, interaksi, dan gambar |
| `build.js` | Membuat situs di `docs/` dari data |
| `docs/` | **Situs jadi** yang ditayangkan GitHub Pages. Jangan diedit manual. |
| `site.config.json` | Nama situs, alamat situs, nomor WhatsApp umum |

## Mengubah harga atau info media

1. Buka `data/media/<nama-media>.json`.
2. Ubah angkanya. Harga ditulis tanpa titik dan tanpa "Rp", misalnya `3500000`.
3. Ubah `"updated"` ke bulan sekarang, misalnya `"Desember 2026"`.
4. Jalankan di terminal, dari folder proyek:
   ```
   node build.js
   ```
5. Upload ulang ke GitHub (lihat di bawah).

Field yang sering dipakai:

- `"status"`: `"published"` (tampil) atau `"hidden"` (disembunyikan).
- `"hold": true` pada sebuah layanan: layanan itu disembunyikan sampai dikonfirmasi.
- `"originalPrice"`: harga coret, isi hanya jika rate card resminya mencantumkan.
- `"metrics"`: followers, ER, avg likes, avg komentar. Hanya tampil jika `"asOf"` (bulan data) diisi.

## Upload ke GitHub (tanpa Git)

1. Jalankan:
   ```
   node build.js
   node tools/prepare-upload.js
   ```
   Folder `_upload/` akan berisi **hanya** file yang aman untuk publik. Script ini berhenti kalau menemukan data internal.
2. Buka repo di GitHub, lalu **Add file → Upload files**.
3. Buka folder `_upload/`, pilih **semua isinya** (bukan foldernya), lalu drag ke halaman GitHub.
4. Tulis keterangan, misalnya "Update harga Desember", lalu klik **Commit changes**.

> ⚠️ Jangan pernah drag folder proyek utama. Folder itu berisi `_private/` (deck asli dan catatan internal) dan PDF rate card.

## Mengaktifkan GitHub Pages (sekali saja)

1. Repo → **Settings → Pages**.
2. **Source:** Deploy from a branch.
3. **Branch:** `main`, folder **`/docs`**, lalu **Save**.
4. Tunggu 1–3 menit, lalu buka https://gigannth.github.io/Mediaratecard/

## Google Search Console (sekali saja)

1. Buka https://search.google.com/search-console, lalu **Add property → URL prefix** dan isi `https://gigannth.github.io/Mediaratecard/`.
2. Verifikasi dengan metode **HTML tag**. Kirim tag `<meta name="google-site-verification" ...>`-nya untuk dipasang di situs, lalu build dan upload ulang.
3. **Sitemaps:** isi `sitemap.xml`, lalu **Submit**.

Google tidak menjamin waktu indexing; biasanya beberapa hari sampai beberapa minggu.

## Pratinjau di komputer sendiri

```
node build.js
node tools/serve.js docs 4175 /Mediaratecard/
```
Lalu buka http://localhost:4175/Mediaratecard/
