<?php
// Espera (opcionales): $pageTitle, $activeNav
require_once __DIR__ . '/../helpers.php';
$__user = require_login();
$pageTitle = $pageTitle ?? 'Panel';
$activeNav = $activeNav ?? '';
$flash = flash_get();

// Estructura del shell replicada del original (admin-layout.tsx):
// header superior fijo + barra lateral angosta solo-iconos (expandible) + dropdown de avatar.
// Orden, labels e iconos replicados 1:1 de apps/web/src/components/admin-layout.tsx
// (array navItems) + apps/web/src/messages/es.ts (claves nav.*). El original NO
// tiene un item de sidebar separado para "ingredientes": esa gestión vive dentro
// de la página de Recetas.
$navItems = [
    ['key' => 'dashboard',        'href' => '/admin/dashboard.php',        'icon' => 'bi-grid-1x2',          'label' => 'Panel'],
    ['key' => 'tables',           'href' => '/admin/tables.php',           'icon' => 'bi-grid-3x3-gap',      'label' => 'Mesas'],
    ['key' => 'digital-menu',     'href' => '/menu.php',                   'icon' => 'bi-book',              'label' => 'Menú digital'],
    ['key' => 'cashier',          'href' => '/admin/cashier.php',          'icon' => 'bi-currency-dollar',   'label' => 'Caja'],
    ['key' => 'products',         'href' => '/admin/products.php',         'icon' => 'bi-box-seam',          'label' => 'Inventario'],
    ['key' => 'restocking',       'href' => '/admin/restocking.php',       'icon' => 'bi-truck',             'label' => 'Reabastecimiento'],
    ['key' => 'recipes',          'href' => '/admin/recipes.php',          'icon' => 'bi-flask',             'label' => 'Recetas'],
    ['key' => 'inventory-audit',  'href' => '/admin/inventory-audit.php',  'icon' => 'bi-shield-exclamation','label' => 'Auditoría de inventario'],
    ['key' => 'customers',        'href' => '/admin/customers.php',        'icon' => 'bi-people',            'label' => 'Clientes'],
    ['key' => 'orders',           'href' => '/admin/orders.php',           'icon' => 'bi-bag',               'label' => 'Pedidos'],
    ['key' => 'payment-methods',  'href' => '/admin/payment-methods.php',  'icon' => 'bi-credit-card',       'label' => 'Métodos de Pago'],
    ['key' => 'pos',              'href' => '/admin/pos.php',              'icon' => 'bi-cart3',             'label' => 'Punto de Venta'],
    ['key' => 'pricing',          'href' => '/admin/pricing.php',          'icon' => 'bi-graph-up-arrow',    'label' => 'Precios Dinámicos'],
    ['key' => 'fiscal',           'href' => '/admin/fiscal.php',           'icon' => 'bi-receipt',           'label' => 'Facturas'],
    ['key' => 'fiscal-settings',  'href' => '/admin/fiscal-settings.php',  'icon' => 'bi-gear',              'label' => 'Configuración Fiscal'],
];

function rail_link(array $item, string $active, bool $withLabel = false): string {
    $isActive = $active === $item['key'];
    $cls = 'nav-rail-link' . ($isActive ? ' active' : '');
    $tooltip = $withLabel ? '' : sprintf(' data-bs-toggle="tooltip" data-bs-placement="right" title="%s"', e($item['label']));
    return sprintf(
        '<a class="%s" href="%s"%s><i class="bi %s"></i><span>%s</span></a>',
        $cls,
        e($item['href']),
        $tooltip,
        e($item['icon']),
        e($item['label'])
    );
}

$__initial = mb_strtoupper(mb_substr($__user['name'] ?? 'U', 0, 1));
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= e($pageTitle) ?> · <?= e(APP_NAME) ?></title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet">
<link href="/assets/admin-theme.css" rel="stylesheet">
</head>
<body>

<header class="app-header">
  <button class="icon-btn d-md-none" type="button" data-bs-toggle="offcanvas" data-bs-target="#mobileDrawer" aria-label="Abrir menú">
    <i class="bi bi-list" style="font-size:1.2rem;"></i>
  </button>
  <button class="icon-btn d-none d-md-inline-flex" type="button" id="sidebarToggle" aria-label="Expandir/colapsar menú">
    <i class="bi bi-list" style="font-size:1.2rem;"></i>
  </button>
  <a href="/admin/dashboard.php" class="brand">
    <i class="bi bi-shop" style="font-size:1.3rem;"></i>
    <span class="brand-text"><?= e(APP_NAME) ?></span>
  </a>
  <h1 class="page-title"><?= e($pageTitle) ?></h1>
  <div class="header-right">
    <div class="dropdown">
      <button class="avatar-btn" type="button" data-bs-toggle="dropdown" aria-expanded="false">
        <?= e($__initial) ?>
      </button>
      <ul class="dropdown-menu dropdown-menu-end">
        <li><h6 class="dropdown-header"><?= e($__user['name']) ?></h6></li>
        <li><hr class="dropdown-divider"></li>
        <li><a class="dropdown-item" href="#"><i class="bi bi-person me-2"></i>Mi cuenta</a></li>
        <li><a class="dropdown-item" href="#"><i class="bi bi-gear me-2"></i>Configuración</a></li>
        <li><a class="dropdown-item" href="#"><i class="bi bi-life-preserver me-2"></i>Soporte</a></li>
        <li><hr class="dropdown-divider"></li>
        <li><a class="dropdown-item" href="/logout.php"><i class="bi bi-box-arrow-right me-2"></i>Cerrar sesión</a></li>
      </ul>
    </div>
  </div>
</header>

<nav class="app-sidebar" id="appSidebar">
  <?php foreach ($navItems as $item): ?>
    <?= rail_link($item, $activeNav) ?>
  <?php endforeach; ?>
</nav>

<div class="offcanvas offcanvas-start mobile-drawer" tabindex="-1" id="mobileDrawer">
  <div class="offcanvas-header">
    <span class="d-flex align-items-center gap-2 fw-semibold"><i class="bi bi-shop"></i> <?= e(APP_NAME) ?></span>
    <button type="button" class="btn-close" data-bs-dismiss="offcanvas"></button>
  </div>
  <div class="offcanvas-body d-flex flex-column gap-1">
    <?php foreach ($navItems as $item): ?>
      <?= rail_link($item, $activeNav, true) ?>
    <?php endforeach; ?>
    <hr>
    <a class="nav-rail-link" href="/logout.php"><i class="bi bi-box-arrow-right"></i><span>Cerrar sesión</span></a>
  </div>
</div>

<main class="app-main">
  <?php if ($flash): ?>
    <div class="alert alert-<?= $flash['type'] === 'error' ? 'danger' : 'success' ?>"><?= e($flash['message']) ?></div>
  <?php endif; ?>
