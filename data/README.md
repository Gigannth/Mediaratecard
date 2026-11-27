# Data situs

Semua isi situs dibangun dari file di folder ini. Setelah mengedit, jalankan:

```
node build.js
```

## `media/*.json`: satu file per media

Hanya media dengan `"status": "published"` yang ikut terbit. Draf media FLUX disimpan di `_private/data/`, bukan di sini.

Field yang paling sering diubah:

| Field | Contoh | Catatan |
|---|---|---|
| `updated` | `"November 2026"` | Tanggal terakhir harga dicek |
| `sections[].items[].price` | `2000000` | Angka saja, tanpa titik atau "Rp" |
| `originalPrice` | `5000000` | Harga coret, isi hanya jika sumbernya mencantumkan |
| `contact.whatsapp` | `"62882005498357"` | Format internasional, tanpa + dan spasi |

### Engagement rate (opsional)

ER hanya tampil jika semua bagian ini diisi. Angka tanpa periode dan cara hitung tidak akan ditampilkan.

```json
"engagement": [
  {
    "platform": "Instagram",
    "rate": 4.2,
    "period": "Oktober 2026",
    "method": "Rata-rata (like + komentar + share + save) ÷ followers, 12 posting terakhir"
  }
]
```

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
