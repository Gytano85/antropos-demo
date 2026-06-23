<?php
require_once __DIR__ . '/../helpers.php';

$pageTitle = 'Reabasto';
$activeNav = 'restocking';
$__userPre = require_login();
$userId = $__userPre['id'];
$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_post();
    $ingredientId = (int) ($_POST['ingredient_id'] ?? 0);
    $packages = (float) ($_POST['packages'] ?? 0);
    $notes = trim($_POST['notes'] ?? '') ?: 'Reabasto';

    $stmt = $pdo->prepare('SELECT * FROM ingredients WHERE id = ? AND user_uid = ?');
    $stmt->execute([$ingredientId, $userId]);
    $ingredient = $stmt->fetch();

    if (!$ingredient || $packages <= 0) {
        flash_set('error', 'Selecciona un ingrediente y una cantidad válida.');
        redirect('/admin/restocking.php');
    }

    $addedQuantity = $packages * (float) $ingredient['package_size'];

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('UPDATE ingredients SET stock_quantity = stock_quantity + ?, updated_at = NOW() WHERE id = ?');
        $stmt->execute([$addedQuantity, $ingredientId]);

        $stmt = $pdo->prepare(
            "INSERT INTO ingredient_movements (ingredient_id, movement_type, quantity, notes, user_uid)
             VALUES (?, 'restock', ?, ?, ?)"
        );
        $stmt->execute([$ingredientId, $addedQuantity, $notes, $userId]);

        $pdo->commit();
        flash_set('success', 'Reabasto registrado: +' . number_format($addedQuantity, 2) . ' ' . $ingredient['unit'] . '.');
    } catch (Throwable $e) {
        $pdo->rollBack();
        flash_set('error', 'No se pudo registrar el reabasto.');
    }

    redirect('/admin/restocking.php');
}

$stmt = $pdo->prepare('SELECT * FROM ingredients WHERE user_uid = ? ORDER BY name');
$stmt->execute([$userId]);
$ingredients = $stmt->fetchAll();

$stmt = $pdo->prepare(
    "SELECT im.*, i.name AS ingredient_name, i.unit FROM ingredient_movements im
     INNER JOIN ingredients i ON i.id = im.ingredient_id
     WHERE im.user_uid = ? AND im.movement_type = 'restock'
     ORDER BY im.created_at DESC LIMIT 30"
);
$stmt->execute([$userId]);
$movements = $stmt->fetchAll();

require_once __DIR__ . '/../partials/admin_header.php';
?>

<div class="row g-3">
  <div class="col-md-5">
    <div class="card p-3">
      <h6 class="mb-3">Registrar reabasto</h6>
      <form method="post">
        <?= csrf_field() ?>
        <div class="mb-2">
          <label class="form-label">Ingrediente</label>
          <select name="ingredient_id" id="restock_ingredient" class="form-select" required onchange="showPkgInfo()">
            <option value="">Selecciona...</option>
            <?php foreach ($ingredients as $i): ?>
              <option value="<?= (int) $i['id'] ?>" data-pkg="<?= (float) $i['package_size'] ?>" data-unit="<?= e($i['unit']) ?>">
                <?= e($i['name']) ?>
              </option>
            <?php endforeach; ?>
          </select>
          <div class="form-text" id="pkgHint"></div>
        </div>
        <div class="mb-2">
          <label class="form-label">Paquetes recibidos</label>
          <input type="number" step="0.01" name="packages" class="form-control" required>
        </div>
        <div class="mb-2">
          <label class="form-label">Notas</label>
          <input type="text" name="notes" class="form-control" placeholder="Proveedor, factura, etc.">
        </div>
        <button type="submit" class="btn btn-primary">Registrar reabasto</button>
      </form>
    </div>
  </div>

  <div class="col-md-7">
    <div class="card p-3">
      <h6 class="mb-3">Historial de reabastos</h6>
      <table class="table table-sm">
        <thead><tr><th>Ingrediente</th><th>Cantidad agregada</th><th>Notas</th><th>Fecha</th></tr></thead>
        <tbody>
          <?php foreach ($movements as $m): ?>
            <tr>
              <td><?= e($m['ingredient_name']) ?></td>
              <td>+<?= number_format((float) $m['quantity'], 2) ?> <?= e($m['unit']) ?></td>
              <td><?= e($m['notes'] ?? '—') ?></td>
              <td><?= format_datetime($m['created_at']) ?></td>
            </tr>
          <?php endforeach; ?>
          <?php if (empty($movements)): ?>
            <tr><td colspan="4" class="text-center text-muted py-3">Sin reabastos registrados.</td></tr>
          <?php endif; ?>
        </tbody>
      </table>
    </div>
  </div>
</div>

<script>
function showPkgInfo() {
  const sel = document.getElementById('restock_ingredient');
  const opt = sel.options[sel.selectedIndex];
  const hint = document.getElementById('pkgHint');
  if (opt && opt.value) {
    hint.textContent = '1 paquete = ' + parseFloat(opt.dataset.pkg).toFixed(3) + ' ' + opt.dataset.unit;
  } else {
    hint.textContent = '';
  }
}
</script>

<?php require_once __DIR__ . '/../partials/admin_footer.php'; ?>
