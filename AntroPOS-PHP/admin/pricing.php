<?php
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../lib/pricing.php';

$pageTitle = 'Precios dinámicos';
$activeNav = 'pricing';
$__userPre = require_login();
$userId = $__userPre['id'];
$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_post();

    $enabled = isset($_POST['enabled']) ? 1 : 0;
    $capacity = max(1, (int) ($_POST['capacity'] ?? 15));
    $minPct = (int) ($_POST['min_adjustment_pct'] ?? -15);
    $maxPct = (int) ($_POST['max_adjustment_pct'] ?? 25);
    $drunkThreshold = (float) ($_POST['drunk_threshold'] ?? 3);
    $drunkSurgePct = (int) ($_POST['drunk_surge_pct'] ?? 20);

    get_or_create_pricing_settings($userId); // garantiza que exista la fila

    $stmt = $pdo->prepare(
        'UPDATE pricing_settings SET enabled=?, capacity=?, min_adjustment_pct=?, max_adjustment_pct=?, drunk_threshold=?, drunk_surge_pct=?
         WHERE user_uid = ?'
    );
    $stmt->execute([$enabled, $capacity, $minPct, $maxPct, $drunkThreshold, $drunkSurgePct, $userId]);

    flash_set('success', 'Configuración de precios actualizada.');
    redirect('/admin/pricing.php');
}

$settingsRow = get_or_create_pricing_settings($userId);
$settings = to_settings_values($settingsRow);
$openTablesCount = count_open_tables($userId);
$ratio = pricing_occupancy_ratio($openTablesCount, $settings['capacity']);
$currentPct = pricing_occupancy_adjustment_pct($ratio, $settings);

require_once __DIR__ . '/../partials/admin_header.php';
?>

<div class="row g-3">
  <div class="col-md-7">
    <div class="card p-3">
      <h6 class="mb-3">Configuración</h6>
      <form method="post">
        <?= csrf_field() ?>
        <div class="form-check form-switch mb-3">
          <input class="form-check-input" type="checkbox" name="enabled" id="enabled" <?= $settings['enabled'] ? 'checked' : '' ?>>
          <label class="form-check-label" for="enabled">Activar precios dinámicos de alcohol</label>
        </div>

        <div class="mb-3">
          <label class="form-label">Capacidad (mesas abiertas = 100% de ocupación)</label>
          <input type="number" name="capacity" class="form-control" min="1" value="<?= (int) $settings['capacity'] ?>">
          <div class="form-text">Cuántas mesas abiertas se consideran "lleno".</div>
        </div>

        <div class="row">
          <div class="col-6 mb-3">
            <label class="form-label">Ajuste con 0 mesas abiertas (%)</label>
            <input type="number" name="min_adjustment_pct" class="form-control" value="<?= (int) $settings['min_adjustment_pct'] ?>">
            <div class="form-text">Negativo = descuento.</div>
          </div>
          <div class="col-6 mb-3">
            <label class="form-label">Ajuste al 100% de ocupación (%)</label>
            <input type="number" name="max_adjustment_pct" class="form-control" value="<?= (int) $settings['max_adjustment_pct'] ?>">
            <div class="form-text">Positivo = recargo.</div>
          </div>
        </div>

        <div class="row">
          <div class="col-6 mb-3">
            <label class="form-label">Umbral de bebidas por persona</label>
            <input type="number" step="0.1" name="drunk_threshold" class="form-control" value="<?= e((string) $settings['drunk_threshold']) ?>">
            <div class="form-text">A partir de aquí se considera posible exceso.</div>
          </div>
          <div class="col-6 mb-3">
            <label class="form-label">Recargo extra por exceso (%)</label>
            <input type="number" name="drunk_surge_pct" class="form-control" value="<?= (int) $settings['drunk_surge_pct'] ?>">
          </div>
        </div>

        <button type="submit" class="btn btn-primary">Guardar configuración</button>
      </form>
    </div>
  </div>

  <div class="col-md-5">
    <div class="card p-3">
      <h6 class="mb-3">Estado actual</h6>
      <p class="mb-1">Mesas abiertas: <strong><?= $openTablesCount ?></strong> / <?= (int) $settings['capacity'] ?></p>
      <p class="mb-1">Ocupación: <strong><?= round($ratio * 100) ?>%</strong></p>
      <p class="mb-1">Ajuste de precio por ocupación: <strong><?= ($currentPct >= 0 ? '+' : '') . round($currentPct) ?>%</strong></p>
      <hr>
      <p class="text-muted small mb-0">
        El precio final de cada bebida alcohólica = precio base × (1 + ajuste de ocupación%) × (1 + recargo por exceso% si aplica).
        El recargo por exceso se calcula por mesa, comparando las bebidas alcohólicas servidas contra el número de personas.
      </p>
    </div>
  </div>
</div>

<?php require_once __DIR__ . '/../partials/admin_footer.php'; ?>
