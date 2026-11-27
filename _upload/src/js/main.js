// Media Rate Card Directory: small progressive enhancements. The site works without JS.
(function () {
  // Mobile menu
  var nav = document.querySelector('.pill-nav');
  var btn = nav && nav.querySelector('.menu-btn');
  if (btn) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Tutup' : 'Menu';
    });
  }

  // Topic cloud: pills fall in when scrolled into view, then can be dragged and thrown.
  // Progressive: links stay real <a> tags; without JS / with reduced motion the static cloud remains.
  initCloud();

  // Directory: search, platform, budget, sort
  var list = document.getElementById('dir');
  if (!list) return;
  var rows = Array.prototype.slice.call(list.children);
  var q = document.getElementById('q');
  var budget = document.getElementById('budget');
  var sort = document.getElementById('sort');
  var count = document.getElementById('count');
  var empty = document.getElementById('empty');

  var params = new URLSearchParams(location.search);
  if (params.get('q')) q.value = params.get('q');

  function apply() {
    var term = q.value.trim().toLowerCase();
    var plat = (document.querySelector('input[name="plat"]:checked') || {}).value || '';
    var range = (budget.value || '').split('-');
    var lo = Number(range[0] || 0), hi = range[1] ? Number(range[1]) : Infinity;
    var shown = 0;
    rows.forEach(function (r) {
      var price = Number(r.dataset.price);
      var ok = (!term || term.split(/\s+/).every(function (w) { return r.dataset.q.indexOf(w) !== -1; })) &&
        (!plat || r.dataset.plat.split('|').indexOf(plat) !== -1) &&
        (!budget.value || (price >= lo && price < hi));
      r.hidden = !ok;
      if (ok) shown++;
    });
    var ordered = rows.slice().sort(function (a, b) {
      if (sort.value === 'asc') return a.dataset.price - b.dataset.price;
      if (sort.value === 'desc') return b.dataset.price - a.dataset.price;
      return a.dataset.i - b.dataset.i;
    });
    ordered.forEach(function (r) { list.appendChild(r); });
    count.textContent = shown;
    empty.hidden = shown !== 0;
    var url = new URL(location.href);
    if (term) url.searchParams.set('q', q.value.trim()); else url.searchParams.delete('q');
    history.replaceState(null, '', url);
  }

  q.addEventListener('input', apply);
  budget.addEventListener('change', apply);
  sort.addEventListener('change', apply);
  document.querySelectorAll('input[name="plat"]').forEach(function (i) { i.addEventListener('change', apply); });
  apply();
})();

function initCloud() {
  var cloud = document.querySelector('.cloud');
  if (!cloud || !('IntersectionObserver' in window)) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var MATTER = 'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js';
  var loading = null;
  function loadMatter() {
    if (window.Matter) return Promise.resolve();
    if (!loading) loading = new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = MATTER; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = ok; s.onerror = fail;
      document.head.appendChild(s);
    });
    return loading;
  }

  // 1) start downloading shortly before the section appears
  var pre = new IntersectionObserver(function (es) {
    if (!es.some(function (e) { return e.isIntersecting; })) return;
    pre.disconnect();
    loadMatter().then(function () {
      // 2) drop when a good part of the cloud is actually visible
      var go = new IntersectionObserver(function (es2) {
        if (!es2.some(function (e) { return e.isIntersecting; })) return;
        go.disconnect();
        startPhysics(cloud);
      }, { threshold: 0.35 });
      go.observe(cloud);
    }).catch(function () { /* keep the static cloud */ });
  }, { rootMargin: '400px 0px' });
  pre.observe(cloud);
}

function startPhysics(cloud) {
  var M = window.Matter;
  var Engine = M.Engine, Bodies = M.Bodies, Body = M.Body, Composite = M.Composite, Constraint = M.Constraint, Vector = M.Vector;
  var rand = function (a, b) { return a + Math.random() * (b - a); };

  // measure pills in their static layout first
  var items = Array.prototype.map.call(cloud.children, function (li) {
    var a = li.querySelector('a');
    a.setAttribute('draggable', 'false');
    return { li: li, a: a, w: a.offsetWidth, h: a.offsetHeight };
  });
  var W = cloud.clientWidth;
  var area = items.reduce(function (s, it) { return s + it.w * it.h; }, 0);
  var H = Math.round(Math.max(300, Math.min(620, (area / W) * 2.1)));

  cloud.classList.add('is-physics');
  cloud.style.height = H + 'px';

  var engine = Engine.create();
  engine.gravity.y = 1;
  var T = 400; // thick walls so fast throws can't tunnel through
  var floor = Bodies.rectangle(W / 2, H + T / 2, W * 3, T, { isStatic: true });
  var left = Bodies.rectangle(-T / 2, H / 2 - H, T, H * 4, { isStatic: true });
  var right = Bodies.rectangle(W + T / 2, H / 2 - H, T, H * 4, { isStatic: true });

  var bodies = items.map(function (it, i) {
    return Bodies.rectangle(
      rand(it.w / 2 + 4, Math.max(it.w / 2 + 5, W - it.w / 2 - 4)),
      -it.h - i * (H / items.length) * 0.9 - rand(0, 80),
      it.w, it.h,
      { chamfer: { radius: it.h / 2 - 1 }, angle: rand(-0.5, 0.5), restitution: 0.25, friction: 0.4, frictionAir: 0.012, density: 0.0016 }
    );
  });
  Composite.add(engine.world, [floor, left, right].concat(bodies));

  // render loop (pauses when the section is off-screen)
  var running = true, raf = 0, last = performance.now();
  function tick(t) {
    Engine.update(engine, Math.min(t - last, 32));
    last = t;
    var w = cloud.clientWidth;
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i], it = items[i];
      // cap speed, and drop escaped pills back in from the top
      var v = b.velocity, sp = Math.sqrt(v.x * v.x + v.y * v.y);
      if (sp > 28) Body.setVelocity(b, { x: v.x * 28 / sp, y: v.y * 28 / sp });
      if (b.position.x < -it.w || b.position.x > w + it.w || b.position.y > H + 200 || b.position.y < -H * 2) {
        Body.setPosition(b, { x: rand(it.w / 2 + 4, Math.max(it.w / 2 + 5, w - it.w / 2 - 4)), y: -it.h });
        Body.setVelocity(b, { x: 0, y: 0 });
      }
      it.li.style.transform = 'translate(' + (b.position.x - it.w / 2) + 'px,' + (b.position.y - it.h / 2) + 'px) rotate(' + b.angle + 'rad)';
    }
    if (running) raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  new IntersectionObserver(function (es) {
    var vis = es.some(function (e) { return e.isIntersecting; });
    if (vis && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(tick); }
    if (!vis) { running = false; cancelAnimationFrame(raf); }
  }).observe(cloud);

  // drag & drop with pointer events (mouse + touch); a drag never triggers the link
  var drag = null, start = null, moved = false, suppressClick = false;
  function local(e) { var r = cloud.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  cloud.addEventListener('pointerdown', function (e) {
    var li = e.target.closest('li');
    if (!li || e.button > 0) return;
    var b = bodies[items.findIndex(function (it) { return it.li === li; })];
    var p = local(e);
    drag = Constraint.create({
      pointA: p, bodyB: b,
      pointB: Vector.rotate(Vector.sub(p, b.position), -b.angle),
      stiffness: 0.18, damping: 0.08, length: 0,
    });
    Composite.add(engine.world, drag);
    start = { x: e.clientX, y: e.clientY }; moved = false;
    li.setPointerCapture(e.pointerId);
    cloud.classList.add('is-dragging');
  });
  cloud.addEventListener('pointermove', function (e) {
    if (!drag) return;
    drag.pointA = local(e);
    if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 6) moved = true;
  });
  function release() {
    if (!drag) return;
    Composite.remove(engine.world, drag);
    drag = null;
    suppressClick = moved;
    cloud.classList.remove('is-dragging');
  }
  cloud.addEventListener('pointerup', release);
  cloud.addEventListener('pointercancel', release);
  cloud.addEventListener('click', function (e) {
    if (suppressClick) { e.preventDefault(); suppressClick = false; }
  }, true);

  // keep walls in place when the width changes
  var lastW = W;
  window.addEventListener('resize', function () {
    var w = cloud.clientWidth;
    if (Math.abs(w - lastW) < 2) return;
    lastW = w;
    Body.setPosition(right, { x: w + T / 2, y: right.position.y });
    Body.setPosition(floor, { x: w / 2, y: floor.position.y });
    bodies.forEach(function (b) {
      if (b.position.x > w - 10) Body.setPosition(b, { x: w - 40, y: b.position.y - 40 });
    });
  });
}
