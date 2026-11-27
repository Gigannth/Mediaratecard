#!/usr/bin/env node
/*
 * Media Rate Card Directory: static site generator (no dependencies).
 *
 *   node build.js            → builds PUBLISHED media from data/media/ into docs/ (GitHub Pages)
 *   node build.js --drafts   → private preview of ALL media incl. _private/data/ into
 *                              _private/preview/ (noindex, DRAFT banner, review flags)
 *
 * Draft data never leaves _private/, which is excluded from git.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DRAFTS = process.argv.includes('--drafts');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const SITE = CONFIG.name;
const SITE_URL = DRAFTS ? '' : (CONFIG.siteUrl || '').replace(/\/?$/, CONFIG.siteUrl ? '/' : '');
const BASE = SITE_URL ? new URL(SITE_URL).pathname : '/';
const OUT = DRAFTS ? path.join(ROOT, '_private', 'preview') : path.join(ROOT, 'docs');
const DATA_DIRS = [path.join(ROOT, 'data', 'media')];
const NOTES_DIR = path.join(ROOT, '_private', 'notes'); // internal review notes, drafts only

// Signature color per media: [background, text on that background]
const PALETTE = {
  unexplnd: ['#111111', '#ffffff'],      // hitam
  folkshitkuy: ['#ff4f8b', '#120f2a'],   // pink
  wahgenz: ['#2563ff', '#ffffff'],       // biru
  'demen-film': ['#86e06f', '#120f2a'],  // hijau muda
  ssmedia: ['#e5262e', '#ffffff'],       // merah
  jonbray: ['#6cccf5', '#120f2a'],       // biru muda langit
  zenwill: ['#2563ff', '#ffffff'],
  pubivox: ['#b14bff', '#ffffff'],
  gensmart: ['#14c8e6', '#120f2a'],
};
const colors = (slug) => PALETTE[slug] || ['#4f2cf5', '#ffffff'];
const isLight = (slug) => colors(slug)[1] === '#120f2a';
const isDark = (slug) => colors(slug)[0] === '#111111'; // near-black: ink-colored UI needs contrast

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = (n) => 'Rp ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const label = (m) => m.displayName || m.name;
const url = (p = '') => BASE + p;
// Cache busting: asset URLs carry a short content hash, so browsers fetch new CSS/JS after every update.
const VER = (() => {
  const h = require('crypto').createHash('sha1');
  for (const f of ['src/css/site.css', 'src/js/main.js']) h.update(fs.readFileSync(path.join(ROOT, f)));
  return h.digest('hex').slice(0, 8);
})();
const asset = (p) => `${url(p)}?v=${VER}`;
const abs = (p = '') => (SITE_URL ? SITE_URL + p : '');

const ownSections = (m) => m.sections.filter((s) => !s.collab && !s.addon);
const itemPrice = (i) => (i.tiers ? i.tiers[0].price : i.price);
// Starting price: the media's own placements only, no collabs, add-ons or "minimum budget" items.
const minPrice = (m) => Math.min(...ownSections(m).flatMap((s) => s.items).filter((i) => !i.priceFrom).map(itemPrice));
const serviceCount = (m) => m.sections.filter((s) => !s.collab).reduce((n, s) => n + s.items.length, 0);
const flagCount = (m) =>
  (m.review || []).length +
  m.sections.reduce((n, s) => n + (s.review ? 1 : 0) + s.items.reduce((k, i) => k + (i.review ? 1 : 0) + (i.tiers || []).filter((t) => t.review).length, 0), 0);
const platformNames = (m) => [...new Set(m.platforms.map((p) => p.name.replace(/\s*\(.*\)/, '')).filter((n) => n !== 'Website'))];

// Platform = where the content appears. Only real platforms; never "Lainnya".
const PLATFORMS = ['Instagram', 'TikTok', 'Threads', 'X', 'Facebook', 'YouTube'];
const PLATFORM_RULES = [
  ['TikTok', /tiktok/i], ['Threads', /threads/i], ['Facebook', /facebook/i], ['YouTube', /youtube/i], ['X', /\bX\b|twitter/],
  ['Instagram', /instagram|\big\b|instastory/i],
];
// generic format words mean Instagram only when no other platform is named
const IG_GENERIC = /story|reels|carousel|carrousel|feed|photo|foto|single/i;
function itemPlatforms(item, section, m) {
  if (item.platform && PLATFORMS.includes(item.platform)) return [item.platform];
  const match = (text) => {
    const found = [...new Set(PLATFORM_RULES.filter(([, re]) => re.test(text)).map(([p]) => p))];
    return found.length ? found : IG_GENERIC.test(text) ? ['Instagram'] : [];
  };
  // most specific first: the item itself, then the section's declared platform, then section wording
  const own = match(`${item.service} ${item.detail || ''}`);
  if (own.length) return own;
  if (section.platform && PLATFORMS.includes(section.platform)) return [section.platform];
  const fromSection = match(`${section.title} ${section.note || ''}`);
  if (fromSection.length) return fromSection;
  // single-platform media: everything it sells runs on that platform
  const mediaPlats = m ? platformNames(m).filter((p) => PLATFORMS.includes(p)) : [];
  return mediaPlats.length === 1 ? mediaPlats : [];
}
// Jenis layanan = what is being bought. An item can have several.
const FORMAT_RULES = [
  ['Story', /story|instastory/i],
  ['Feed & foto', /feed|photo|foto|single|words/i],
  ['Carousel', /carousel|carrousel/i],
  ['Reels & video', /reels|video|^tiktok$|^youtube$/i],
  ['Buat konten', /create content|storytelling|buat konten/i],
  ['Kunjungan & event', /visit|event|kunjungan/i],
  ['Paket & kontrak', /\d+\s*x\b|bulan|tahun|months?|year|featured|paket|bundling|placement/i],
];
const FORMATS = FORMAT_RULES.map(([f]) => f);
const itemFormats = (item) => {
  // what is sold is in the service name; the detail is only a fallback (it often lists free bonuses)
  const match = (text) => FORMAT_RULES.filter(([, re]) => re.test(text)).map(([x]) => x);
  let f = match(item.service);
  if (!f.length) f = match(item.detail || '');
  if (item.tiers && !f.includes('Paket & kontrak')) f.push('Paket & kontrak');
  return f;
};

function waLink(number, text) {
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}
function askBtn(m, item, price, cls = 'btn btn--sm ask') {
  const qty = item.detail && /^\d+x posting/i.test(item.detail) ? ` (${item.detail.split(' · ')[0]})` : '';
  const href = waLink(m.contact && m.contact.whatsapp, `Halo, saya ingin bertanya tentang ${item.service}${qty} di ${label(m)}${price ? ` (${rp(price)})` : ''}.`);
  return href
    ? `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener">Tanya</a>`
    : `<span class="${cls}" aria-disabled="true" title="Kontak belum tersedia">Tanya</span>`;
}
const flag = (text) => (text && DRAFTS ? `<div class="flag">${esc(text)}</div>` : '');
// Instagram metrics only display when they carry an "as of" date.
const hasMetrics = (m) => !!(m.metrics && m.metrics.asOf);
const engagement = (m) => (hasMetrics(m) && typeof m.metrics.engagementRate === 'number'
  ? [{ rate: m.metrics.engagementRate, platform: 'Instagram', period: m.metrics.asOf, method: m.metrics.method || '' }] : []);
const compact = (n) => {
  const f = (v, u) => `${String(Math.round(v * 10) / 10).replace('.', ',')} ${u}`;
  return n >= 1e6 ? f(n / 1e6, 'jt') : n >= 1e3 ? f(n / 1e3, 'rb') : String(n);
};
function metricChips(m) {
  const x = m.metrics || {};
  const ok = hasMetrics(m);
  const list = [
    ['Followers', x.followers, (v) => compact(v)],
    ['Engagement rate', x.engagementRate, (v) => `${String(v).replace('.', ',')}%`],
    ['Avg likes / post', x.avgLikes, (v) => compact(v)],
    ['Avg komentar / post', x.avgComments, (v) => compact(v)],
  ];
  return list.map(([lab, v, fmt]) => (ok && typeof v === 'number'
    ? `<li><small>${lab}</small><strong class="num">${fmt(v)}</strong></li>`
    : DRAFTS ? `<li class="stat-missing"><small>${lab}</small><strong>⚑ belum ada</strong></li>` : '')).join('');
}
const IG_ICON = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" stroke="none"/></svg>';

// ---------- layout ----------
function page({ title, description, body, current, sticky = '', canonical = '', jsonld = [] }) {
  const can = abs(canonical);
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${DRAFTS ? '<meta name="robots" content="noindex, nofollow">' : ''}
${can ? `<link rel="canonical" href="${esc(can)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:locale" content="id_ID">
<meta property="og:site_name" content="${esc(SITE)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${can ? `<meta property="og:url" content="${esc(can)}">` : ''}
<meta name="theme-color" content="#4f2cf5">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${asset('assets/site.css')}">
${SITE_URL ? jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n') : ''}
</head>
<body${sticky ? ' class="has-sticky"' : ''}>
<a class="skip" href="#isi">Lewati ke konten</a>
${DRAFTS ? '<div class="draft-bar">DRAF PRIVAT: belum untuk publikasi. Media FLUX menunggu izin. Label ⚑ = perlu konfirmasi.</div>' : ''}
<div class="nav-wrap">
  <nav class="pill-nav" aria-label="Navigasi utama">
    <a class="logo" href="${url()}"><span class="logo-mark" aria-hidden="true">Rp</span><span>Media Rate Card<small>DIRECTORY</small></span></a>
    <ul class="links" id="menu">
      <li><a href="${url()}"${current === 'home' ? ' aria-current="page"' : ''}>Beranda</a></li>
      <li><a href="${url('media/')}"${current === 'media' ? ' aria-current="page"' : ''}>Semua Media</a></li>
      <li><a href="${url('tentang/')}"${current === 'tentang' ? ' aria-current="page"' : ''}>Tentang</a></li>
      <li><a href="${url('kontak/')}"${current === 'kontak' ? ' aria-current="page"' : ''}>Kontak</a></li>
    </ul>
    <a class="btn btn--sm nav-cta" href="${url('kontak/')}">Tanya kami</a>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu">Menu</button>
  </nav>
</div>
<div id="isi">
${body}
</div>
<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <a class="logo" href="${url()}"><span class="logo-mark" aria-hidden="true">Rp</span><span>${SITE}</span></a>
        <p>Direktori rate card media online, dikelola oleh tim sales &amp; client relations. Semua harga ditampilkan terbuka, tanpa perlu daftar atau minta lewat DM.</p>
      </div>
      <nav aria-label="Navigasi footer"><h2>Navigasi</h2><ul><li><a href="${url()}">Beranda</a></li><li><a href="${url('media/')}">Semua Media</a></li><li><a href="${url('tentang/')}">Tentang</a></li><li><a href="${url('kontak/')}">Kontak</a></li></ul></nav>
      <nav aria-label="Daftar media"><h2>Media</h2><ul>${ALL.map((m) => `<li><a href="${url(`media/${m.slug}/`)}">${esc(label(m))}</a></li>`).join('')}</ul></nav>
    </div>
    <p class="fine">Harga dapat berubah sewaktu-waktu. Harga dan ketentuan yang berlaku adalah yang dikonfirmasi tertulis saat pemesanan. Nama dan merek media adalah milik masing-masing pemiliknya. © 2026 ${SITE}.</p>
  </div>
</footer>
${sticky}
<script src="${asset('assets/main.js')}" defer></script>
</body>
</html>
`;
}

// ---------- shared blocks ----------
function band({ m, crumbs, chips = '', title, tagline, stats = '', note = '', actions = '', side = '' }) {
  const [bg, fg] = m ? colors(m.slug) : ['#4f2cf5', '#ffffff'];
  const light = m ? isLight(m.slug) : false;
  return `
<header class="band${light ? ' on-light' : ''}${m && isDark(m.slug) ? ' is-dark' : ''}${m ? '' : ' home-band'}" style="--media:${bg};--media-ink:${fg}">
  <div class="wrap">
    ${crumbs ? `<nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>` : ''}
    <div class="band-grid">
      <div>
        ${chips ? `<div class="chip-row">${chips}</div>` : ''}
        <h1>${title}</h1>
        ${tagline ? `<p class="tagline">${tagline}</p>` : ''}
        ${stats.trim() ? `<ul class="stats">${stats}</ul>` : ''}
        ${note ? `<p class="stats-note">${note}</p>` : ''}
        ${actions ? `<div class="hero-cta">${actions}</div>` : ''}
      </div>
      ${side}
    </div>
  </div>
</header>`;
}
const crumbTrail = (parts) => parts.map(([text, href]) => (href ? `<a href="${href}">${esc(text)}</a>` : esc(text))).join('<span aria-hidden="true">/</span>');
const breadcrumbLd = (parts) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: parts.map(([name, , p], i) => ({ '@type': 'ListItem', position: i + 1, name, ...(p !== undefined ? { item: abs(p) } : {}) })),
});

function contactBand(text = 'Ceritakan brand, target audiens, dan anggaran Anda. Kami bantu cek ketersediaan dan pilihan media yang cocok.') {
  const href = waLink(CONFIG.whatsapp, `Halo, saya ingin bertanya tentang pemasangan konten di ${SITE}.`);
  return `
<section class="contact-band" aria-labelledby="cb">
  <div class="wrap">
    <div><h2 id="cb">Butuh bantuan memilih media?</h2><p>${text}</p></div>
    <a class="btn" href="${esc(href)}" target="_blank" rel="noopener">Chat via WhatsApp</a>
  </div>
</section>`;
}

// ---------- media page ----------
function renderItem(m, item, section) {
  const plats = itemPlatforms(item, section, m).join(' ');
  if (item.tiers) {
    const tiers = item.tiers.map((t) => `
        <li class="num${t.review && DRAFTS ? ' has-flag' : ''}"><small>${esc(t.label)}</small>${t.originalPrice ? `<s>${rp(t.originalPrice)}</s>` : ''}<strong>${rp(t.price)}</strong>${flag(t.review)}</li>`).join('');
    return `
      <li class="rate rate--tiers" data-platform="${esc(plats)}">
        <div><h3 class="svc">${esc(item.service)}</h3>${item.detail ? `<div class="svc-detail">${esc(item.detail)}</div>` : ''}${flag(item.review)}</div>
        ${askBtn(m, item)}
        <ul class="tiers" aria-label="Harga per jumlah posting">${tiers}
        </ul>
      </li>`;
  }
  const saving = item.originalPrice && item.originalPrice > item.price ? item.originalPrice - item.price : 0;
  return `
      <li class="rate" data-platform="${esc(plats)}">
        <div>
          <h3 class="svc">${esc(item.service)}</h3>
          ${item.detail ? `<div class="svc-detail">${esc(item.detail)}</div>` : ''}
          ${item.duration ? `<span class="dur">${esc(item.duration)}</span>` : ''}
          ${flag(item.review)}
        </div>
        <div class="price num">
          ${item.originalPrice ? `<s><span class="sr">Harga normal </span>${rp(item.originalPrice)}</s>` : ''}
          <strong>${item.priceFrom ? 'Mulai ' : ''}${rp(item.price)}</strong>
          ${item.unit ? `<span class="unit">${esc(item.unit)}</span>` : ''}
          ${saving ? `<span class="save">Hemat ${rp(saving)}</span>` : ''}
        </div>
        ${askBtn(m, item, item.price)}
      </li>`;
}

function renderMedia(m) {
  const from = minPrice(m);
  const plats = platformNames(m);
  const er = engagement(m);
  const cheapest = ownSections(m).flatMap((s) => s.items).map((i) => ({ i, p: itemPrice(i) })).filter((x) => !x.i.priceFrom).sort((a, b) => a.p - b.p);
  const picks = [...new Set([cheapest[0], cheapest[Math.floor(cheapest.length / 2)], cheapest[cheapest.length - 1]])].filter(Boolean);
  const general = waLink(m.contact && m.contact.whatsapp, `Halo, saya ingin bertanya tentang pemasangan konten di ${label(m)}.`);
  const groupChip = m.group === 'flux' ? 'Grup FLUX' : 'Media independen';

  const sections = m.sections.map((s) => {
    const id = slugify(s.title);
    return `
    <section class="rate-panel${s.collab ? ' is-collab' : ''}" id="${id}" aria-labelledby="h-${id}">
      <div class="panel-head"><h2 id="h-${id}">${esc(s.title)}</h2><span class="count">${s.items.length} layanan</span></div>
      ${s.note || (s.review && DRAFTS) ? `<p class="panel-note">${esc(s.note || '')}${flag(s.review)}</p>` : ''}
      <ul class="rate-list">${s.items.map((i) => renderItem(m, i, s)).join('')}
      </ul>
    </section>`;
  }).join('');

  const erBlock = er.length ? `<section class="info info--er"><h2>Engagement rate</h2><ul class="er-list">${er.map((e) => `<li><strong class="num">${String(e.rate).replace('.', ',')}%</strong><span>${esc(e.platform)} · data per ${esc(e.period)}</span>${e.method ? `<small>${esc(e.method)}</small>` : ''}</li>`).join('')}</ul></section>` : '';
  const infoBlocks = [
    m.notice && `<section class="info info--soft"><h2>Sebelum memesan</h2><p>${esc(m.notice)}</p></section>`,
    m.highlights && `<section class="info info--soft"><h2>Yang Anda dapatkan</h2><ul>${m.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></section>`,
    m.revisions && `<section class="info"><h2>Kebijakan revisi</h2><ul>${m.revisions.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></section>`,
    m.terms && `<section class="info"><h2>Syarat &amp; ketentuan</h2><ol>${m.terms.map((h) => `<li>${esc(h)}</li>`).join('')}</ol></section>`,
    m.taxNote && `<section class="info info--soft"><h2>Pajak</h2><p>${esc(m.taxNote)}</p></section>`,
    erBlock,
    `<section class="info">${m.characters && m.characters.feature ? `<img class="char-feature" src="${url(`assets/${m.characters.feature.src}`)}" alt="${esc(m.characters.feature.alt)}" width="${m.characters.feature.w}" height="${m.characters.feature.h}" loading="lazy" decoding="async">` : ''}<h2>Tentang ${esc(label(m))}</h2><p>${esc(m.description)}</p>
      ${m.topics ? `<ul class="plat-list topic-list" aria-label="Topik">${m.topics.map((t) => `<li><a href="${url(`media/?q=${encodeURIComponent(t)}`)}">${esc(t)}</a></li>`).join('')}</ul>` : ''}
      <ul class="plat-list" aria-label="Platform">${m.platforms.map((p) => `<li>${esc(p.name)}${p.handle ? `<span>${esc(p.handle)}</span>` : ''}</li>`).join('')}</ul></section>`,
  ].filter(Boolean).join('\n');

  const review = DRAFTS && m.review && m.review.length
    ? `<aside class="review-panel"><h2>⚑ Perlu konfirmasi sebelum terbit</h2><ul>${m.review.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></aside>` : '';

  const others = ALL.filter((o) => o.slug !== m.slug && o.group === m.group).slice(0, 3);
  const crumbs = [['Beranda', url(), ''], ['Semua Media', url('media/'), 'media/'], [label(m), null, `media/${m.slug}/`]];

  const body = `
<main style="--media:${colors(m.slug)[0]};--media-ink:${colors(m.slug)[1]}">
  ${band({
    m,
    crumbs: crumbTrail(crumbs),
    chips: `<span class="chip chip--solid">${groupChip}</span>${m.validity ? `<span class="chip">${esc(m.validity)}</span>` : ''}`,
    title: `<span class="sr">Rate card </span>${esc(label(m))}`,
    tagline: esc(m.tagline),
    stats: metricChips(m),
    note: hasMetrics(m) && m.instagram ? `Instagram @${esc(m.instagram)} · data per ${esc(m.metrics.asOf)}` : '',
    actions: [
      m.instagram && `<a class="btn btn--ig" href="https://www.instagram.com/${encodeURIComponent(m.instagram)}/" target="_blank" rel="noopener" aria-label="Lihat Instagram @${esc(m.instagram)}">${IG_ICON}<span>Lihat Instagram<span class="lbl-long"> @${esc(m.instagram)}</span></span></a>`,
      general && `<a class="btn btn--dark" href="${esc(general)}" target="_blank" rel="noopener"><span class="lbl-long">Tanya via </span>WhatsApp</a>`,
    ].filter(Boolean).join(''),
    side: m.characters && m.characters.hero
      ? `<div class="char-stage">${m.characters.hero.map((c, n) => `<img class="char char--${n}" src="${url(`assets/${c.src}`)}" alt="${esc(c.alt)}" width="${c.w}" height="${c.h}"${n ? '' : ' fetchpriority="high"'} decoding="async">`).join('')}<div class="float-card char-price"><small>Mulai dari</small><strong class="num">${rp(from)}</strong></div></div>`
      : `<div class="float-stack" aria-hidden="true">${picks.map((x) => `<div class="float-card"><small>${esc(x.i.service)}</small><strong class="num">${rp(x.p)}</strong></div>`).join('')}</div>`,
  })}
  <div class="wrap">
    <nav class="tabs" aria-label="Bagian rate card"><ul>${m.sections.map((s) => `<li><a href="#${slugify(s.title)}">${esc(s.title)}</a></li>`).join('')}<li><a href="#tentang">Tentang</a></li></ul></nav>
    <div class="layout">
      <div>
        ${review}
        <h2 class="sr">Daftar harga ${esc(label(m))}</h2>
        ${sections}
        <div id="tentang">${infoBlocks}</div>
      </div>
      <aside aria-label="Kontak">
        <div class="ticket">
          <h2>Tanya ketersediaan</h2>
          <p>Cek jadwal tayang, kebutuhan materi, dan cara pembayaran di ${esc(label(m))}.</p>
          ${general ? `<a class="btn" href="${esc(general)}" target="_blank" rel="noopener">Chat via WhatsApp</a>` : `<span class="btn" aria-disabled="true">Kontak belum tersedia</span>`}
          <dl>
            <dt>Mulai dari</dt><dd class="num">${rp(from)}</dd>
            <dt>Platform</dt><dd>${esc(plats.join(', '))}</dd>
            ${er.length ? `<dt>Engagement</dt><dd class="num">${String(er[0].rate).replace('.', ',')}%</dd>` : ''}
            <dt>Diperbarui</dt><dd>${esc(m.updated)}</dd>
          </dl>
        </div>
      </aside>
    </div>
    ${others.length ? `<section class="related" aria-labelledby="rel"><h2 id="rel">Media lain yang bisa dibandingkan</h2><div class="bento bento--mini">${others.map(tile).join('')}</div></section>` : ''}
  </div>
</main>`;

  const sticky = `<div class="sticky-cta"><div><small>${esc(label(m))} · mulai dari</small><strong class="num">${rp(from)}</strong></div>${general ? `<a class="btn btn--sm" href="${esc(general)}" target="_blank" rel="noopener">Tanya via WhatsApp</a>` : `<span class="btn btn--sm" aria-disabled="true">Kontak belum ada</span>`}</div>`;
  const svcNames = [...new Set(ownSections(m).flatMap((s) => s.items.map((i) => i.service)))].slice(0, 3).join(', ');
  return page({
    title: `Rate Card ${label(m)} 2026: Harga ${plats.join(', ')} | ${SITE}`,
    description: `Rate card ${label(m)} mulai dari ${rp(from)}. Lihat harga ${svcNames} dan layanan lainnya, lalu tanyakan jadwal tayang via WhatsApp.`,
    body, current: 'media', sticky, canonical: `media/${m.slug}/`,
    jsonld: [breadcrumbLd(crumbs)],
  });
}

// ---------- tiles ----------
function tile(m) {
  const [bg, fg] = colors(m.slug);
  const n = flagCount(m);
  const er = engagement(m);
  return `
    <a class="tile${isLight(m.slug) ? ' on-light' : ''}${isDark(m.slug) ? ' is-dark' : ''}" href="${url(`media/${m.slug}/`)}" style="--media:${bg};--media-ink:${fg}">
      ${DRAFTS && n ? `<span class="flags chip chip--lime">⚑ ${n} perlu konfirmasi</span>` : ''}
      <div>
        <div class="chip-row"><span class="chip">${m.group === 'flux' ? 'Grup FLUX' : 'Media independen'}</span>${hasMetrics(m) && m.metrics.followers ? `<span class="chip">${compact(m.metrics.followers)} followers</span>` : ''}${er.length ? `<span class="chip">ER ${String(er[0].rate).replace('.', ',')}%</span>` : ''}</div>
        <h3>${esc(label(m))}</h3>
        <p>${esc(m.tagline)}</p>
      </div>
      <div class="foot">
        <div class="from"><small>Mulai dari · ${serviceCount(m)} layanan</small><strong class="num">${rp(minPrice(m))}</strong></div>
        <span class="arrow" aria-hidden="true">→</span>
      </div>
    </a>`;
}

// ---------- home ----------
const FAQ = [
  ['Apa itu paid media placement?', 'Pemasangan konten berbayar di akun media, misalnya postingan Instagram, Reels, Story, atau TikTok yang dipublikasikan oleh media tersebut untuk brand Anda.'],
  ['Bagaimana memilih media yang sesuai?', 'Mulai dari topik media dan platform yang dipakai audiens Anda, lalu sesuaikan dengan anggaran. Kalau ragu, tanyakan kepada kami. Kami bantu mencocokkan kebutuhan Anda dengan media yang tersedia.'],
  ['Apakah harga yang tercantum sudah final?', 'Harga diambil dari rate card resmi masing-masing media pada tanggal pembaruan yang tertera. Pajak, jadwal tayang, dan ketentuan akhir dikonfirmasi saat Anda menghubungi kami.'],
  ['Apa arti “RTP” atau “ready to post”?', 'Artinya materi konten (gambar, video, caption) disiapkan oleh brand, lalu media memublikasikannya. Jika Anda ingin media yang membuat kontennya, pilih layanan “create content” bila tersedia.'],
  ['Berapa lama sampai konten tayang?', 'Tergantung media dan ketersediaan slot. Kami mengonfirmasi jadwal yang tersedia saat Anda bertanya, sebelum pembayaran.'],
  ['Bagaimana cara memesan?', 'Klik tombol “Tanya” pada layanan yang Anda pilih. Pesan WhatsApp sudah terisi nama media dan layanannya. Kami membalas dengan ketersediaan jadwal, kebutuhan materi, dan cara pembayaran.'],
  ['Apakah ada syarat atau biaya tambahan?', 'Beberapa media punya ketentuan sendiri, misalnya jenis produk yang tidak diterima, jumlah revisi, atau pajak. Semuanya tercantum di halaman media masing-masing bila tersedia.'],
];

function topicCloud() {
  const counts = new Map();
  const add = (k, kind) => { const key = `${kind}|${k}`; counts.set(key, (counts.get(key) || 0) + 1); };
  for (const m of ALL) {
    (m.topics || []).forEach((t) => add(t, 'Topik'));
    new Set(ownSections(m).flatMap((s) => s.items.flatMap(itemFormats))).forEach((f) => add(f, 'Format'));
    platformNames(m).forEach((p) => add(p, 'Platform'));
  }
  const pills = [...counts].map(([key, n]) => { const [kind, name] = key.split('|'); return { kind, name, n }; });
  // interleave kinds so colors and sizes mix
  pills.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  return `
<section class="niche" aria-labelledby="niche-h">
  <div class="wrap">
    <h2 id="niche-h">Jelajahi media dari <em>topik</em> &amp; <em>format</em></h2>
    <p class="section-lead">Pilih topik, platform, atau format yang Anda cari. Kami tampilkan media dan harganya.</p>
    <ul class="cloud">${pills.map((p, i) => `<li><a class="pill pill--${i % 8}" href="${url(`media/?q=${encodeURIComponent(p.name)}`)}" title="${esc(p.kind)}: ${p.n} media">${esc(p.name)}</a></li>`).join('')}</ul>
  </div>
</section>`;
}

function testimonials() {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'testimonials.json'), 'utf8')); } catch { /* none */ }
  list = list.filter((t) => t && t.permission === true && t.quote && t.name);
  if (!list.length) return DRAFTS ? `<section class="section"><div class="wrap"><aside class="review-panel"><h2>⚑ Section testimoni disembunyikan</h2><ul><li>Belum ada testimoni asli di data/testimonials.json. Section ini otomatis tampil setelah diisi testimoni klien yang sudah memberi izin.</li></ul></aside></div></section>` : '';
  return `
<section class="section testi" aria-labelledby="testi-h">
  <div class="wrap">
    <h2 id="testi-h" class="section-title">Kata mereka</h2>
    <div class="testi-grid">${list.map((t, i) => `
      <figure class="quote quote--${i % 4}">
        <blockquote>“${esc(t.quote)}”</blockquote>
        <figcaption><strong>${esc(t.name)}</strong>${t.role || t.company ? `<span>${esc([t.role, t.company].filter(Boolean).join(', '))}</span>` : ''}</figcaption>
      </figure>`).join('')}
    </div>
  </div>
</section>`;
}

function renderHome() {
  const total = ALL.reduce((n, m) => n + serviceCount(m), 0);
  const body = `
<main>
  ${band({
    chips: `<span class="chip chip--lime">${DRAFTS ? 'Pratinjau draf' : 'Direktori rate card media online'}</span>`,
    title: 'Harga media, <em>terbuka</em> sejak awal.',
    tagline: 'Lihat rate card, bandingkan layanan dan harganya, lalu tanyakan jadwal tayang langsung lewat WhatsApp. Tanpa daftar, tanpa minta harga lewat DM.',
    stats: `<li><small>Media</small><strong>${ALL.length}</strong></li><li><small>Layanan</small><strong>${total}</strong></li><li><small>Diperbarui</small><strong>${esc(CONFIG.updated)}</strong></li>`,
    side: `<div class="hero-actions"><a class="btn btn--big" href="${url('media/')}">Lihat semua harga →</a><a class="btn btn--dark btn--big" href="#cara-kerja">Cara kerjanya</a></div>`,
  })}
  <section class="section" aria-labelledby="media-h">
    <div class="wrap">
      <div class="section-head"><h2 id="media-h" class="section-title">Media di direktori</h2><a class="link-arrow" href="${url('media/')}">Bandingkan semua harga →</a></div>
      <div class="bento">${ALL.map(tile).join('')}</div>
    </div>
  </section>
  ${topicCloud()}
  <section class="section" id="cara-kerja" aria-labelledby="how-h">
    <div class="wrap">
      <h2 id="how-h" class="section-title">Tiga langkah, tanpa akun</h2>
      <ol class="steps">
        <li><span class="step-n">01</span><h3>Pilih media</h3><p>Telusuri media berdasarkan topik, platform, dan anggaran Anda.</p></li>
        <li><span class="step-n">02</span><h3>Bandingkan harga</h3><p>Setiap rate card menampilkan harga, format, durasi tayang, dan apa saja yang termasuk.</p></li>
        <li><span class="step-n">03</span><h3>Tanya via WhatsApp</h3><p>Klik “Tanya” di layanan yang Anda minati. Pesannya sudah terisi nama media dan layanan.</p></li>
      </ol>
    </div>
  </section>
  ${testimonials()}
  <section class="section" id="faq" aria-labelledby="faq-h">
    <div class="wrap faq-wrap">
      <div><h2 id="faq-h" class="section-title">Pertanyaan yang sering diajukan</h2><p class="section-lead">Tidak menemukan jawabannya? Tanyakan langsung lewat WhatsApp.</p></div>
      <div class="faq">${FAQ.map(([q, a], i) => `
        <details${i === 0 ? ' open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}
      </div>
    </div>
  </section>
  ${contactBand()}
</main>`;
  return page({
    title: `${SITE}: Rate Card & Harga Media Online Indonesia`,
    description: 'Lihat rate card media online Indonesia secara terbuka: harga Instagram Story, Feed, Reels, TikTok, Threads, hingga media visit. Bandingkan, lalu tanyakan jadwal lewat WhatsApp.',
    body, current: 'home', canonical: '',
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE, url: abs(''), inLanguage: 'id' },
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    ],
  });
}

// ---------- all media / compare ----------
function renderDirectory() {
  const rows = [];
  for (const m of ALL) for (const s of m.sections) {
    if (s.collab && !DRAFTS) continue;
    for (const i of s.items) {
      const p = itemPrice(i);
      rows.push({ m, s, i, p, plats: itemPlatforms(i, s, m), fmts: itemFormats(i) });
    }
  }
  const count = (key, v) => rows.filter((r) => r[key].includes(v)).length;
  const platforms = PLATFORMS.filter((p) => count('plats', p));
  const formats = FORMATS.filter((f) => count('fmts', f));
  const BUDGETS = [['0-1000000', '< Rp 1 jt'], ['1000000-5000000', 'Rp 1–5 jt'], ['5000000-10000000', 'Rp 5–10 jt'], ['10000000-', '> Rp 10 jt']];
  const inBudget = (p, v) => { const [lo, hi] = v.split('-'); return p >= Number(lo) && (hi === '' || p < Number(hi)); };
  const chip = (name, value, text, n, checked) =>
    `<label class="fchip"><input type="radio" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}><span>${esc(text)}${n !== null ? `<em>${n}</em>` : ''}</span></label>`;
  const group = (name, legend, opts) => `
          <fieldset class="f-group">
            <legend>${legend}</legend>
            <div class="f-chips" role="presentation">${chip(name, '', 'Semua', null, true)}${opts.join('')}</div>
          </fieldset>`;
  const body = `
<main>
  ${band({
    crumbs: crumbTrail([['Beranda', url()], ['Semua Media']]),
    chips: '<span class="chip chip--lime">Bandingkan harga</span>',
    title: 'Semua media &amp; harga',
    tagline: `${ALL.length} media, ${rows.length} layanan. Cari, saring berdasarkan platform dan anggaran, lalu urutkan dari yang termurah.`,
  })}
  <div class="wrap">
    <section class="section" aria-labelledby="dir-media"><h2 id="dir-media" class="section-title">Media</h2><div class="bento">${ALL.map(tile).join('')}</div></section>
    <section class="section dir" id="bandingkan" aria-labelledby="dir-h">
      <h2 id="dir-h" class="section-title">Bandingkan semua layanan</h2>
      <form class="filters" role="search" onsubmit="return false" aria-label="Saring layanan">
        <div class="f-top">
          <label class="f-search"><span class="sr">Cari</span><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" id="q" placeholder="Cari media, layanan, atau topik" autocomplete="off" enterkeyhint="search"></label>
          <button type="button" class="f-toggle" id="f-toggle" aria-expanded="false" aria-controls="f-panel" aria-label="Filter">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>
            <span class="f-toggle-label">Filter</span><span class="f-badge" id="f-badge" hidden>0</span>
          </button>
        </div>
        <div class="f-panel" id="f-panel" hidden>
        ${group('plat', 'Platform', platforms.map((p) => chip('plat', p, p, count('plats', p), false)))}
        ${group('fmt', 'Jenis layanan', formats.map((f) => chip('fmt', f, f, count('fmts', f), false)))}
        ${group('budget', 'Anggaran', BUDGETS.map(([v, t]) => chip('budget', v, t, rows.filter((r) => inBudget(r.p, v)).length, false)))}
          <div class="f-actions">
            <button type="button" class="f-clear" id="f-clear">Hapus filter</button>
            <button type="button" class="btn f-apply" id="f-apply">Lihat <span id="f-apply-n">${rows.length}</span> layanan</button>
          </div>
        </div>
      </form>
      <div class="results-bar">
        <p class="dir-count" aria-live="polite"><strong id="count">${rows.length}</strong> layanan</p>
        <button type="button" class="reset" id="reset" hidden>Hapus filter</button>
        <label class="sort"><span>Urutkan</span><select id="sort"><option value="">Relevan</option><option value="asc">Harga termurah</option><option value="desc">Harga termahal</option></select></label>
      </div>
      <ul class="dir-list" id="dir">${rows.map((r, idx) => {
        const [bg, fg] = colors(r.m.slug);
        const search = [label(r.m), r.i.service, ...(r.m.topics || []), ...r.plats, ...r.fmts].join(' ').toLowerCase();
        const sub = [r.i.detail, r.i.tiers ? `${r.i.tiers.length} pilihan jumlah posting` : ''].filter(Boolean).join(' · ');
        return `
        <li class="dir-row" data-q="${esc(search)}" data-plat="${esc(r.plats.join('|'))}" data-fmt="${esc(r.fmts.join('|'))}" data-price="${r.p}" data-i="${idx}">
          <a class="dir-media" href="${url(`media/${r.m.slug}/`)}" style="--media:${bg};--media-ink:${fg}">${esc(label(r.m))}</a>
          <div class="dir-svc"><strong>${esc(r.i.service)}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}</div>
          <div class="dir-plat">${r.plats.map((p) => `<span class="tag">${esc(p)}</span>`).join('')}</div>
          <div class="dir-price num">${r.i.originalPrice ? `<s>${rp(r.i.originalPrice)}</s>` : ''}<strong>${r.i.tiers || r.i.priceFrom ? 'Mulai ' : ''}${rp(r.p)}</strong></div>
          ${askBtn(r.m, r.i, r.i.tiers ? null : r.p)}
        </li>`;
      }).join('')}
      </ul>
      <p class="dir-empty" id="empty" hidden>Tidak ada layanan yang cocok. Coba kata kunci atau filter lain.</p>
    </section>
  </div>
  ${contactBand()}
</main>`;
  return page({
    title: `Semua Media & Perbandingan Harga Rate Card | ${SITE}`,
    description: `Bandingkan ${rows.length} layanan dari ${ALL.length} media online: harga Instagram Story, Reels, Feed, TikTok, Threads, dan media visit dalam Rupiah.`,
    body, current: 'media', canonical: 'media/',
    jsonld: [breadcrumbLd([['Beranda', null, ''], ['Semua Media', null, 'media/']])],
  });
}

// ---------- static pages ----------
function renderAbout() {
  const body = `
<main>
  ${band({ crumbs: crumbTrail([['Beranda', url()], ['Tentang']]), title: 'Tentang direktori ini', tagline: 'Harga media seharusnya bisa dilihat sebelum Anda bertanya.' })}
  <div class="wrap prose">
    <section class="info"><h2>Siapa kami</h2><p>${SITE} dikelola oleh tim sales &amp; client relations. Kami membantu brand, agensi, dan tim PR menemukan media online yang tepat, lalu menghubungkan mereka dengan media tersebut untuk pemasangan konten.</p></section>
    <section class="info"><h2>Kenapa harganya terbuka</h2><p>Di banyak tempat, harga media baru diberikan setelah Anda mengirim DM atau mendaftar. Di sini setiap harga yang sudah disetujui media tampil terbuka, jadi Anda bisa membandingkan dan menyusun anggaran lebih dulu.</p></section>
    <section class="info"><h2>Dari mana datanya</h2><p>Semua harga diambil dari rate card resmi masing-masing media dan ditulis apa adanya: nama layanan, mata uang, dan ketentuannya. Setiap halaman media mencantumkan tanggal pembaruan. Kami tidak menampilkan angka audiens yang belum terverifikasi.</p></section>
    <section class="info"><h2>Kepemilikan media</h2><p>Setiap media dikelola oleh pemiliknya masing-masing. Label di setiap halaman menunjukkan apakah media tersebut independen atau bagian dari sebuah grup. Nama dan merek media adalah milik masing-masing pemiliknya.</p></section>
    <section class="info info--soft"><h2>Penting diketahui</h2><ul><li>Harga dapat berubah sewaktu-waktu.</li><li>Harga dan ketentuan yang berlaku adalah yang dikonfirmasi tertulis saat pemesanan.</li><li>Direktori ini tidak memproses pembayaran. Semua pemesanan dikonfirmasi lewat percakapan langsung.</li></ul></section>
  </div>
  ${contactBand()}
</main>`;
  return page({ title: `Tentang | ${SITE}`, description: `Tentang ${SITE}: direktori rate card media online dengan harga terbuka, dikelola oleh tim sales & client relations.`, body, current: 'tentang', canonical: 'tentang/' });
}

function renderContact() {
  const href = waLink(CONFIG.whatsapp, `Halo, saya ingin bertanya tentang pemasangan konten di ${SITE}.`);
  const body = `
<main>
  ${band({ crumbs: crumbTrail([['Beranda', url()], ['Kontak']]), title: 'Hubungi kami', tagline: 'Tanya ketersediaan jadwal, kebutuhan materi, atau minta rekomendasi media sesuai anggaran.' })}
  <div class="wrap prose">
    <section class="ticket ticket--static">
      <h2>WhatsApp</h2>
      <p>Cara tercepat untuk bertanya. Sertakan nama brand, media atau layanan yang diminati, dan perkiraan jadwal tayang.</p>
      <a class="btn" href="${esc(href)}" target="_blank" rel="noopener">Chat via WhatsApp</a>
    </section>
    <section class="info"><h2>Bertanya tentang media tertentu?</h2><p>Gunakan tombol “Tanya” di halaman media. Pesan otomatis berisi nama media dan layanannya, dan dikirim ke kontak yang menangani media tersebut.</p>
      <ul class="plat-list">${ALL.map((m) => `<li><a href="${url(`media/${m.slug}/`)}">${esc(label(m))}</a></li>`).join('')}</ul></section>
  </div>
</main>`;
  return page({ title: `Kontak | ${SITE}`, description: `Hubungi ${SITE} via WhatsApp untuk menanyakan ketersediaan dan pemasangan konten di media online.`, body, current: 'kontak', canonical: 'kontak/' });
}

function render404() {
  const body = `<main>${band({ title: 'Halaman tidak ditemukan', tagline: 'Mungkin tautannya sudah berubah. Coba lihat semua media.', side: `<div class="hero-actions"><a class="btn btn--big" href="${url('media/')}">Lihat semua media →</a></div>` })}</main>`;
  return page({ title: `Halaman tidak ditemukan | ${SITE}`, description: 'Halaman tidak ditemukan.', body });
}

// ---------- run ----------
function load() {
  const media = [];
  for (const dir of DATA_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (!DRAFTS && m.status !== 'published') continue;
      if (DRAFTS) {
        // Merge private review notes and show held items with a flag
        const nf = path.join(NOTES_DIR, `${m.slug}.json`);
        const n = fs.existsSync(nf) ? JSON.parse(fs.readFileSync(nf, 'utf8')) : {};
        m.review = [...(n.review || [])];
        for (const s of m.sections) {
          if (n.sections && n.sections[s.title]) s.review = n.sections[s.title];
          if (s.collab) s.review = [s.review, 'Tidak tampil di situs publik (paket lintas media).'].filter(Boolean).join(' ');
          for (const i of s.items) {
            const k = [s.title, i.service, i.detail || ''].join('::');
            const held = i.hold ? 'DITAHAN: tidak tampil di situs publik sampai dikonfirmasi.' : '';
            i.review = [n.items && n.items[k], held].filter(Boolean).join(' ') || undefined;
            for (const t of i.tiers || []) t.review = [n.tiers && n.tiers[`${k}::${t.label}`], t.hold ? 'DITAHAN' : ''].filter(Boolean).join(' · ') || undefined;
          }
        }
      } else {
        // Public: no cross-media collabs, no held items or tiers
        m.sections = m.sections.filter((s) => !s.collab).map((s) => ({
          ...s,
          items: s.items.filter((i) => !i.hold).map((i) => (i.tiers ? { ...i, tiers: i.tiers.filter((t) => !t.hold) } : i)).filter((i) => !i.tiers || i.tiers.length),
        })).filter((s) => s.items.length);
      }
      media.push(m);
    }
  }
  // FLUX media first, then independent media
  const first = 'flux';
  return media.sort((a, b) => (a.group === b.group ? label(a).localeCompare(label(b)) : a.group === first ? -1 : 1));
}

const write = (rel, content) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

const ALL = load();
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'src', 'css', 'site.css'), path.join(OUT, 'assets', 'site.css'));
fs.copyFileSync(path.join(ROOT, 'src', 'js', 'main.js'), path.join(OUT, 'assets', 'main.js'));
if (fs.existsSync(path.join(ROOT, 'src', 'img'))) fs.cpSync(path.join(ROOT, 'src', 'img'), path.join(OUT, 'assets', 'img'), { recursive: true });

write('index.html', renderHome());
write('media/index.html', renderDirectory());
write('tentang/index.html', renderAbout());
write('kontak/index.html', renderContact());
write('404.html', render404());
for (const m of ALL) write(path.join('media', m.slug, 'index.html'), renderMedia(m));

const pages = ['', 'media/', 'tentang/', 'kontak/', ...ALL.map((m) => `media/${m.slug}/`)];
if (DRAFTS) {
  write('robots.txt', 'User-agent: *\nDisallow: /\n');
} else {
  write('.nojekyll', '');
  // Custom domain: GitHub Pages reads docs/CNAME. Written automatically when siteUrl is not *.github.io.
  if (SITE_URL && !/\.github\.io$/i.test(new URL(SITE_URL).hostname)) write('CNAME', new URL(SITE_URL).hostname + '\n');
  if (SITE_URL) {
    const today = new Date().toISOString().slice(0, 10);
    write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${abs(p)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
    write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${abs('sitemap.xml')}\n`);
  } else {
    write('robots.txt', 'User-agent: *\nAllow: /\n');
    console.warn('! site.config.json "siteUrl" is empty: canonical URLs, sitemap.xml and structured data were skipped.');
  }
}

console.log(`${DRAFTS ? 'DRAFT preview' : 'Site'}: ${ALL.length} media, ${pages.length} pages → ${path.relative(ROOT, OUT)}`);
for (const m of ALL) console.log(`  ${m.slug.padEnd(12)} ${m.status.padEnd(9)} from ${rp(minPrice(m)).padEnd(14)} ${serviceCount(m)} services${DRAFTS ? `, ${flagCount(m)} flags` : ''}`);
