<?php
require_once __DIR__ . '/config.php';
// Port 1:1 de apps/web/src/app/menu/page.tsx ("Carta Nocturna"): página pública,
// sin login, tema oscuro/dorado, datos de demostración fijos (igual al original).
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Carta Nocturna · <?= htmlspecialchars(APP_NAME) ?></title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --gold: #caa45e;
  --gold-dim: rgba(202,164,94,.5);
  --cream: #f4ecd8;
  --bg: #0b0a08;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--cream);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.display { font-family: "Playfair Display", serif; }
.wrap { max-width: 42rem; margin: 0 auto; padding: 0 1rem; }

.menu-hero {
  position: relative;
  border-bottom: 1px solid rgba(202,164,94,.2);
  padding: 3.5rem 1rem;
  text-align: center;
}
.menu-hero::before {
  content: "";
  position: absolute; inset: 0;
  background: radial-gradient(circle at 50% 0%, rgba(202,164,94,.12), transparent 55%);
}
.menu-hero-inner { position: relative; max-width: 32rem; margin: 0 auto; }
.menu-kicker { font-size: .68rem; color: var(--gold); text-transform: uppercase; letter-spacing: .35em; margin: 0; }
.menu-title { font-size: 3rem; margin: 1rem 0 0; }
.menu-divider { display: flex; align-items: center; justify-content: center; gap: .75rem; margin-top: 1.5rem; color: var(--gold-dim); }
.menu-divider .line { width: 3rem; height: 1px; background: rgba(202,164,94,.4); }
.menu-sub { margin-top: 1.5rem; font-size: .875rem; color: rgba(244,236,216,.55); line-height: 1.6; }

.menu-search-bar { position: sticky; top: 0; z-index: 20; border-bottom: 1px solid rgba(202,164,94,.15); background: rgba(11,10,8,.95); backdrop-filter: blur(16px); }
.menu-search-inner { max-width: 42rem; margin: 0 auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
.menu-search-wrap { position: relative; }
.menu-search-wrap i { position: absolute; left: .25rem; top: 50%; transform: translateY(-50%); color: rgba(244,236,216,.35); font-size: .9rem; }
.menu-search { width: 100%; background: transparent; border: none; border-bottom: 1px solid rgba(202,164,94,.25); color: var(--cream); padding: .4rem .25rem .4rem 1.75rem; font-size: .95rem; outline: none; }
.menu-search::placeholder { color: rgba(244,236,216,.35); }
.menu-cats { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: .3rem .9rem; font-size: .7rem; text-transform: uppercase; letter-spacing: .2em; }
.menu-cats a { color: rgba(244,236,216,.55); text-decoration: none; transition: color .15s; }
.menu-cats a:hover { color: var(--gold); }
.menu-cats .dot { color: rgba(202,164,94,.3); margin-right: .9rem; }

main.menu-main { max-width: 42rem; margin: 0 auto; padding: 2.5rem 1rem; }
.menu-section { margin-bottom: 3.25rem; scroll-margin-top: 8rem; }
.menu-section-head { display: flex; align-items: center; gap: .65rem; margin-bottom: 1.5rem; }
.menu-section-head i { color: var(--gold); font-size: 1.1rem; }
.menu-section-head h2 { font-size: 1.4rem; margin: 0; }
.menu-section-note { color: rgba(244,236,216,.4); font-size: .72rem; font-style: italic; }
.menu-section-head .fill { flex: 1; height: 1px; background: rgba(202,164,94,.15); }

.menu-item { margin-bottom: 1.6rem; }
.menu-item-top { display: flex; align-items: baseline; gap: .65rem; }
.menu-item-name { font-size: 1.05rem; margin: 0; }
.menu-item-fav { margin-left: .4rem; font-size: .62rem; color: rgba(202,164,94,.8); text-transform: uppercase; letter-spacing: .2em; }
.menu-item-dots { flex: 1; transform: translateY(-3px); border-bottom: 1px dotted rgba(202,164,94,.2); }
.menu-item-price { font-family: "Playfair Display", serif; font-size: 1.05rem; color: var(--gold); white-space: nowrap; }
.menu-item-bottom { margin-top: .35rem; display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; }
.menu-item-desc { color: rgba(244,236,216,.45); font-size: .85rem; font-style: italic; margin: 0; }
.menu-add-btn { background: none; border: none; color: var(--gold); font-size: .68rem; text-transform: uppercase; letter-spacing: .2em; cursor: pointer; flex-shrink: 0; }
.menu-add-btn:hover { color: #dcb978; }
.menu-stepper { display: flex; align-items: center; gap: .65rem; font-size: .9rem; flex-shrink: 0; }
.menu-stepper button { width: 1.75rem; height: 1.75rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; border: none; }
.menu-stepper .dec { background: transparent; border: 1px solid rgba(202,164,94,.3); color: var(--gold); }
.menu-stepper .dec:hover { background: rgba(202,164,94,.1); }
.menu-stepper .inc { background: var(--gold); color: var(--bg); }
.menu-stepper .inc:hover { background: #dcb978; }
.menu-stepper span { width: 1rem; text-align: center; }

.menu-empty { padding: 4rem 0; text-align: center; color: rgba(244,236,216,.4); font-style: italic; }
.menu-footer { border-top: 1px solid rgba(202,164,94,.15); padding: 1.75rem 1rem; text-align: center; color: rgba(244,236,216,.35); font-size: .72rem; }

.menu-cart-fab {
  position: fixed; right: 1rem; bottom: 1rem; left: 1rem; z-index: 30;
  display: flex; align-items: center; justify-content: space-between;
  border-radius: 999px; border: 1px solid rgba(202,164,94,.4);
  background: var(--bg); color: var(--cream);
  padding: .85rem 1.25rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,.6);
  cursor: pointer; font-size: .9rem;
}
@media (min-width: 576px) { .menu-cart-fab { left: auto; min-width: 18rem; } }
.menu-cart-fab .label { text-transform: uppercase; letter-spacing: .15em; }
.menu-cart-fab .price { font-family: "Playfair Display", serif; color: var(--gold); }

.menu-drawer-overlay { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.7); backdrop-filter: blur(2px); border: none; }
.menu-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: 100%; max-width: 28rem; background: var(--bg); border-left: 1px solid rgba(202,164,94,.2); box-shadow: -25px 0 50px -12px rgba(0,0,0,.6); display: flex; flex-direction: column; z-index: 51; }
.menu-drawer-head { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(202,164,94,.15); padding: 1.25rem; }
.menu-drawer-head h2 { margin: 0; font-size: 1.25rem; }
.menu-drawer-head p { margin: .15rem 0 0; color: rgba(244,236,216,.4); font-size: .72rem; font-style: italic; }
.menu-drawer-close { background: none; border: none; color: var(--cream); cursor: pointer; font-size: 1.2rem; padding: .4rem; border-radius: 999px; }
.menu-drawer-close:hover { background: rgba(202,164,94,.1); }
.menu-drawer-body { flex: 1; overflow-y: auto; padding: 1.25rem; }
.menu-drawer-empty { padding: 4rem 0; text-align: center; color: rgba(244,236,216,.35); font-style: italic; }
.menu-drawer-row { margin-bottom: 1.25rem; }
.menu-drawer-row-top { display: flex; align-items: baseline; gap: .65rem; }
.menu-drawer-row-top p { margin: 0; }
.menu-drawer-row-top .price { color: var(--gold); }
.menu-drawer-row-bottom { margin-top: .35rem; display: flex; justify-content: flex-end; gap: .65rem; }
.menu-drawer-footer { border-top: 1px solid rgba(202,164,94,.15); padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
.menu-drawer-field label { display: block; font-size: .68rem; text-transform: uppercase; letter-spacing: .2em; color: rgba(244,236,216,.55); margin-bottom: .3rem; }
.menu-drawer-field input { width: 100%; background: transparent; border: none; border-bottom: 1px solid rgba(202,164,94,.25); color: var(--cream); padding: .4rem .1rem; outline: none; font-size: .95rem; }
.menu-drawer-total { display: flex; align-items: baseline; justify-content: space-between; }
.menu-drawer-total span { color: rgba(244,236,216,.55); font-size: .9rem; }
.menu-drawer-total strong { font-family: "Playfair Display", serif; color: var(--gold); font-size: 1.25rem; }
.menu-send-btn { width: 100%; border-radius: 999px; background: var(--gold); color: var(--bg); border: none; padding: .75rem; font-weight: 600; font-size: .95rem; cursor: pointer; }
.menu-send-btn:hover:not(:disabled) { background: #dcb978; }
.menu-send-btn:disabled { opacity: .5; cursor: not-allowed; }

.menu-toast { position: fixed; top: 1rem; left: 50%; transform: translateX(-50%); z-index: 60; background: var(--gold); color: var(--bg); padding: .6rem 1.25rem; border-radius: 999px; font-size: .85rem; font-weight: 600; box-shadow: 0 10px 25px -5px rgba(0,0,0,.5); opacity: 0; transition: opacity .25s, top .25s; pointer-events: none; }
.menu-toast.show { opacity: 1; top: 1.5rem; }
</style>
</head>
<body>

<header class="menu-hero">
  <div class="menu-hero-inner">
    <p class="menu-kicker">Antro POS</p>
    <h1 class="menu-title display">Carta Nocturna</h1>
    <div class="menu-divider"><span class="line"></span><i class="bi bi-cup-straw"></i><span class="line"></span></div>
    <p class="menu-sub">Coctelería de autor, botellas y algo para picar. Precios expresados en pesos mexicanos.</p>
  </div>
</header>

<div class="menu-search-bar">
  <div class="menu-search-inner">
    <div class="menu-search-wrap">
      <i class="bi bi-search"></i>
      <input type="text" id="menuSearch" class="menu-search" placeholder="Buscar en la carta...">
    </div>
    <nav class="menu-cats">
      <a href="#cocteles">Coctelería</a>
      <a href="#cervezas"><span class="dot">·</span>Cervezas</a>
      <a href="#botellas"><span class="dot">·</span>Botellas</a>
      <a href="#snacks"><span class="dot">·</span>Para picar</a>
      <a href="#sin-alcohol"><span class="dot">·</span>Sin alcohol</a>
    </nav>
  </div>
</div>

<main class="menu-main" id="menuMain"></main>

<footer class="menu-footer">
  Menú de demostración · El consumo de alcohol es responsabilidad de cada persona.
</footer>

<button type="button" class="menu-cart-fab" id="cartFab" style="display:none;" onclick="openDrawer()">
  <span class="label">Tu pedido · <span id="fabCount">0</span></span>
  <span class="price" id="fabTotal">$0</span>
</button>

<button type="button" class="menu-drawer-overlay" id="drawerOverlay" style="display:none;" onclick="closeDrawer()" aria-label="Cerrar pedido"></button>
<aside class="menu-drawer" id="drawer" style="display:none;">
  <div class="menu-drawer-head">
    <div>
      <h2 class="display">Tu pedido</h2>
      <p>Demostración sin cobro real</p>
    </div>
    <button type="button" class="menu-drawer-close" onclick="closeDrawer()"><i class="bi bi-x-lg"></i></button>
  </div>
  <div class="menu-drawer-body" id="drawerBody"></div>
  <div class="menu-drawer-footer">
    <div class="menu-drawer-field">
      <label for="tableInput">Tu mesa</label>
      <input type="text" id="tableInput" placeholder="Ej. Mesa 4">
    </div>
    <div class="menu-drawer-total">
      <span>Total</span>
      <strong id="drawerTotal">$0</strong>
    </div>
    <button type="button" class="menu-send-btn" id="sendBtn" onclick="sendDemoOrder()" disabled>Enviar pedido demo</button>
  </div>
</aside>

<div class="menu-toast" id="toast"></div>

<script>
const SECTIONS = [
  { id: 'cocteles', label: 'Coctelería', note: 'De autor y clásicos', icon: 'bi-cup-straw' },
  { id: 'cervezas', label: 'Cervezas', icon: 'bi-cup' },
  { id: 'botellas', label: 'Botellas', note: 'Servicio con mezcladores', icon: 'bi-droplet' },
  { id: 'snacks', label: 'Para picar', icon: 'bi-egg-fried' },
  { id: 'sin-alcohol', label: 'Sin alcohol', icon: 'bi-cup-hot' },
];

const ITEMS = [
  { id: 1, name: 'Mojito', description: 'Ron blanco, hierbabuena, limón fresco y agua mineral.', price: 160, category: 'cocteles', popular: true },
  { id: 2, name: 'Margarita', description: 'Tequila, licor de naranja, limón y escarchado de sal.', price: 170, category: 'cocteles', popular: true },
  { id: 3, name: 'Carajillo', description: 'Licor 43 y espresso recién preparado.', price: 190, category: 'cocteles' },
  { id: 4, name: 'Gin Tonic', description: 'Ginebra premium, agua tónica y cítricos.', price: 190, category: 'cocteles' },
  { id: 5, name: 'Corona Extra', description: 'Botella de 355 ml, servida bien fría.', price: 85, category: 'cervezas', popular: true },
  { id: 6, name: 'Modelo Especial', description: 'Cerveza tipo pilsner, botella de 355 ml.', price: 90, category: 'cervezas' },
  { id: 7, name: 'Heineken', description: 'Cerveza lager, botella de 355 ml.', price: 100, category: 'cervezas' },
  { id: 8, name: "Don Julio 70", description: 'Botella de 700 ml con hielo, cítricos y seis mezcladores.', price: 3200, category: 'botellas', popular: true },
  { id: 9, name: "Buchanan's 12", description: 'Botella de 750 ml con hielo, agua mineral y refrescos.', price: 2800, category: 'botellas' },
  { id: 10, name: 'Grey Goose', description: 'Vodka de 750 ml con servicio completo de mezcladores.', price: 2700, category: 'botellas' },
  { id: 11, name: 'Alitas BBQ', description: 'Diez alitas con salsa BBQ, apio y aderezo ranch.', price: 190, category: 'snacks', popular: true },
  { id: 12, name: 'Nachos con Queso', description: 'Totopos, queso, jalapeños y pico de gallo.', price: 140, category: 'snacks' },
  { id: 13, name: 'Mini Hamburguesas', description: 'Tres mini hamburguesas acompañadas con papas.', price: 210, category: 'snacks' },
  { id: 14, name: 'Agua Mineral', description: 'Botella de 355 ml.', price: 60, category: 'sin-alcohol' },
  { id: 15, name: 'Red Bull', description: 'Bebida energética de 250 ml.', price: 90, category: 'sin-alcohol' },
  { id: 16, name: 'Limonada Mineral', description: 'Limón natural, jarabe de la casa y agua mineral.', price: 85, category: 'sin-alcohol' },
];

let cart = {}; // id -> qty

function money(n) {
  return '$' + Math.round(n).toLocaleString('es-MX');
}

function render() {
  const q = document.getElementById('menuSearch').value.trim().toLowerCase();
  const main = document.getElementById('menuMain');
  let html = '';
  let anySection = false;

  SECTIONS.forEach((section) => {
    const items = ITEMS.filter((it) => it.category === section.id && (!q || it.name.toLowerCase().includes(q) || it.description.toLowerCase().includes(q)));
    if (items.length === 0) return;
    anySection = true;
    html += '<section class="menu-section" id="' + section.id + '">';
    html += '<div class="menu-section-head"><i class="bi ' + section.icon + '"></i><h2 class="display">' + section.label + '</h2>';
    if (section.note) html += '<span class="menu-section-note">' + section.note + '</span>';
    html += '<span class="fill"></span></div>';
    html += '<div>';
    items.forEach((it) => {
      const qty = cart[it.id] || 0;
      html += '<div class="menu-item">';
      html += '<div class="menu-item-top"><h3 class="menu-item-name">' + it.name + (it.popular ? '<span class="menu-item-fav">Favorito</span>' : '') + '</h3><span class="menu-item-dots"></span><span class="menu-item-price display">' + money(it.price) + '</span></div>';
      html += '<div class="menu-item-bottom"><p class="menu-item-desc">' + it.description + '</p>';
      if (qty > 0) {
        html += '<div class="menu-stepper"><button class="dec" onclick="changeQty(' + it.id + ',-1)"><i class="bi bi-dash"></i></button><span>' + qty + '</span><button class="inc" onclick="changeQty(' + it.id + ',1)"><i class="bi bi-plus"></i></button></div>';
      } else {
        html += '<button type="button" class="menu-add-btn" onclick="changeQty(' + it.id + ',1)">+ Agregar</button>';
      }
      html += '</div></div>';
    });
    html += '</div></section>';
  });

  if (!anySection) {
    html = '<p class="menu-empty">No encontramos nada con esa búsqueda.</p>';
  }
  main.innerHTML = html;
  renderCart();
}

function changeQty(id, delta) {
  const next = Math.max(0, (cart[id] || 0) + delta);
  if (next === 0) { delete cart[id]; } else { cart[id] = next; }
  render();
}

function cartItems() {
  return ITEMS.filter((it) => cart[it.id]).map((it) => ({ ...it, quantity: cart[it.id] }));
}

function renderCart() {
  const items = cartItems();
  const count = items.reduce((s, it) => s + it.quantity, 0);
  const total = items.reduce((s, it) => s + it.price * it.quantity, 0);

  const fab = document.getElementById('cartFab');
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('drawerOverlay');
  fab.style.display = (count > 0 && drawer.style.display === 'none') ? 'flex' : 'none';
  document.getElementById('fabCount').textContent = count;
  document.getElementById('fabTotal').textContent = money(total);

  let bodyHtml = '';
  if (items.length === 0) {
    bodyHtml = '<p class="menu-drawer-empty">Tu pedido está vacío.</p>';
  } else {
    items.forEach((it) => {
      bodyHtml += '<div class="menu-drawer-row">';
      bodyHtml += '<div class="menu-drawer-row-top"><p>' + it.name + '</p><span class="menu-item-dots" style="flex:1;"></span><span class="price">' + money(it.price * it.quantity) + '</span></div>';
      bodyHtml += '<div class="menu-drawer-row-bottom"><div class="menu-stepper"><button class="dec" onclick="changeQty(' + it.id + ',-1)"><i class="bi bi-dash"></i></button><span>' + it.quantity + '</span><button class="inc" onclick="changeQty(' + it.id + ',1)"><i class="bi bi-plus"></i></button></div></div>';
      bodyHtml += '</div>';
    });
  }
  document.getElementById('drawerBody').innerHTML = bodyHtml;
  document.getElementById('drawerTotal').textContent = money(total);
  document.getElementById('sendBtn').disabled = count === 0;
}

function openDrawer() {
  document.getElementById('drawer').style.display = 'flex';
  document.getElementById('drawerOverlay').style.display = 'block';
  document.getElementById('cartFab').style.display = 'none';
}
function closeDrawer() {
  document.getElementById('drawer').style.display = 'none';
  document.getElementById('drawerOverlay').style.display = 'none';
  renderCart();
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

function sendDemoOrder() {
  const table = document.getElementById('tableInput').value.trim();
  if (!table) { showToast('Escribe el número de tu mesa.'); return; }
  if (Object.keys(cart).length === 0) return;
  showToast('Pedido demo enviado desde ' + table);
  cart = {};
  document.getElementById('tableInput').value = '';
  closeDrawer();
  render();
}

document.getElementById('menuSearch').addEventListener('input', render);
render();
</script>

</body>
</html>
