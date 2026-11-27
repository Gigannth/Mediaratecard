# Data situs

Semua isi situs dibangun dari file di folder ini. Setelah mengedit, jalankan:

```
node build.js
```

## `media/*.json`: satu file per media

Hanya media dengan `"status": "published"` yang ikut terbit. Isi `"status": "hidden"` untuk menyembunyikan media tanpa menghapus datanya.

Field yang paling sering diubah:

| Field | Contoh | Catatan |
|---|---|---|
| `updated` | `"November 2026"` | Tanggal terakhir harga dicek |
| `sections[].items[].price` | `2000000` | Angka saja, tanpa titik atau "Rp" |
| `originalPrice` | `5000000` | Harga coret, isi hanya jika sumbernya mencantumkan |
| `contact.whatsapp` | `"62882005498357"` | Format internasional, tanpa + dan spasi |

## `performance/*.json`: performa media & estimasi CPM

Satu file per media, terpisah dari harga. Data ini mengisi:
- angka di hero halaman media (followers, engagement rate, rata-rata likes & komentar),
- section **Performa media & efisiensi harga**,
- baris "CPM ±…" di halaman Semua Media.

**Aturan tampil:**
- Angka hanya tampil kalau berupa angka lebih dari 0 **dan** entrinya punya `data_source`. Kolom `null` tidak tampil sama sekali.
- `"status": "hidden"` menyembunyikan seluruh data performa media itu dari situs.
- Satu entri = satu sumber dan satu periode. Kalau angkanya dari laporan yang berbeda, buat entri terpisah.

### Entri per platform & jenis konten

```json
{
  "platform": "Instagram",
  "content_type": "Reels",
  "median_views": 120000,
  "average_views": 185000,
  "median_reach": null,
  "average_reach": null,
  "posts_analyzed": 30,
  "period_start": "2026-08-01",
  "period_end": "2026-10-31",
  "data_source": "Instagram Insights",
  "last_updated": "2026-11-20"
}
```

- `content_type`: `Akun` (followers, `engagement_rate`, `engagement_rate_method`, `average_likes`, `average_comments`), `Reels`, `Story`, `Feed`, atau `Video` (TikTok/YouTube).
- Tanggal ditulis `YYYY-MM-DD`.
- `engagement_rate` ditampilkan apa adanya. Isi `engagement_rate_method` dengan rumus dari sumber kalau ada. Kalau tidak diisi, situs menulis "metode tidak dicantumkan sumber".

### Bagaimana CPM dihitung

**CPM = harga layanan ÷ performa × 1.000.** Harga diambil langsung dari rate card (`media/*.json`); tidak ada harga yang ditulis ulang di sini.

| Layanan | Dicocokkan dengan | Metrik |
|---|---|---|
| Story | `Story` platform yang sama | reach, lalu views |
| Reels / video TikTok / YouTube | `Reels` atau `Video` | views, lalu reach |
| Feed foto / carousel | `Feed` | reach, lalu views |
| Artikel website | `website_performance` | article views |

- Median dipakai lebih dulu. Rata-rata hanya dipakai kalau median kosong, dan diberi label "rata-rata".
- Tidak dihitung untuk: paket multi-posting/bulanan/tahunan, kunjungan & event, pembuatan konten, layanan lintas beberapa platform, dan harga "mulai dari".
- Harga paket bertingkat (1x/3x/…) memakai harga 1x.

## `testimonials.json`: testimoni klien

Section testimoni di beranda **hanya tampil jika file ini berisi testimoni asli**, dan hanya entri dengan `"permission": true` (klien sudah setuju dikutip).

```json
[
  {
    "quote": "Kalimat testimoni persis seperti yang disampaikan klien.",
    "name": "Nama Klien",
    "role": "Brand Manager",
    "company": "Nama Perusahaan",
    "media": "zenwill",
    "permission": true
  }
]
```

Jangan pernah menulis testimoni karangan.
