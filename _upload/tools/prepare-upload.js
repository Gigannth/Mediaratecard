#!/usr/bin/env node
/*
 * Siapkan folder _upload/ berisi HANYA file yang aman untuk repo GitHub publik.
 * Upload lewat web GitHub tidak membaca .gitignore, jadi jangan drag folder proyek
 * utama. Drag ISI folder _upload/ saja.
 *
 *   node build.js && node tools/prepare-upload.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_upload');

// Whitelist: hanya ini yang ikut ke GitHub
const INCLUDE = ['docs', 'data', 'src', 'tools', 'build.js', 'site.config.json', '.gitignore', 'README.md'];
// Pengaman tambahan: jangan pernah ikut walau ada di dalam folder di atas
const NEVER = [/\.pdf$/i, /\.jfif$/i, /(^|[\\/])_private([\\/]|$)/, /(^|[\\/])\.claude([\\/]|$)/, /lihat-hp\.webp$/];

fs.rmSync(OUT, { recursive: true, force: true });
let count = 0;
function copy(rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return;
  if (NEVER.some((re) => re.test(rel))) return;
  const st = fs.statSync(src);
  if (st.isDirectory()) { for (const f of fs.readdirSync(src)) copy(path.join(rel, f)); return; }
  const dst = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  count++;
}
INCLUDE.forEach(copy);

// cek akhir: tidak boleh ada catatan internal atau data rahasia.
// Daftar kata rahasia disimpan di _private/leak-patterns.txt (tidak ikut upload).
const secretFile = path.join(ROOT, '_private', 'leak-patterns.txt');
const secrets = fs.existsSync(secretFile)
  ? fs.readFileSync(secretFile, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  : [];
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const leakRe = new RegExp(['"review"\\s*:', ...secrets.map(escRe)].join('|'));
const leaks = [];
(function scan(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { scan(p); continue; }
    if (!/\.(html|json|js|css|md|txt|xml)$/.test(f)) continue;
    const t = fs.readFileSync(p, 'utf8');
    if (leakRe.test(t)) leaks.push(path.relative(OUT, p));
  }
})(OUT);

console.log(`${count} file disalin ke _upload/`);
if (leaks.length) { console.error('STOP: ditemukan data internal di:', leaks); process.exit(1); }
console.log('Cek data internal: bersih.');
