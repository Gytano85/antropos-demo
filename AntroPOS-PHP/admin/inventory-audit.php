<?php
require_once __DIR__ . '/../helpers.php';

$pageTitle = 'Auditoría de inventario';
$activeNav = 'inventory-audit';
$__userPre = require_login();
$userId = $__userPre['id'];
$pdo = db();

const TOLERANCE_PERCENT = 5.0; // % de variación tolerada antes de marcar exceeds_tolerance

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_post();
    $ingredientId = (int) ($_POST['ingredient_id'] ?? 0);
    $countedQuantity = (float) ($_POST['counted_quantity'] ?? 0);
    $notes = trim($_POST['notes'] ?? '') ?: null;

    $stmt = $pdo->prepare('SELECT * FROM ingredients WHERE id = ? AND user_uid = ?');
    $stmt->execute([$ingredientId, $userId]);
    $ingredient = $stmt->fetch();

    if (!$ingredient) {
        flash_set('error', 'Ingrediente no encontrado.');
        redirect('/admin/inventory-audit.php');
    }

    $expectedQuantity = (float) $ingredient['stock_quantity'];
    $varianceQuantity = $countedQuantity - $expectedQuantity;
    $variancePercent = $expectedQuantity != 0.0
        ? ($varianceQuantity / $expectedQuantity) * 100
        : ($countedQuantity != 0.0 ? 100.0 : 0.0);
    $exceedsTolerance = abs($variancePercent) > TOLERANCE_PERCENT;

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO ingredient_counts (ingredient_id, expected_quantity, counted_quantity, variance_quantity, variance_percent, exceeds_tolerance, notes, user_uid)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $ingredientId, $expectedQuantity, $countedQuantity, $varianceQuantity, $variancePercent,
            $exceedsTolerance ? 1 : 0, $notes, $userId,
        ]);

        // Reconcilia el stock al conteo físico real.
        $stmt = $pdo->prepare('UPDATE ingredients SET stock_quantity = ?, updated_at = NOW() WHERE id = ?');
        $stmt->execute([$countedQuantity, $ingredientId]);

        if ($varianceQuantity != 0.0) {
            $stmt = $pdo->prepare(
                "INSERT INTO ingredient_movements (ingredient_id, movement_type, quantity, expected_quantity, notes, user_uid)
                 VALUES (?, 'adjustment', ?, ?, ?, ?)"
            );
            $stmt->execute([$ingredientId, $varianceQuantity, $expectedQuantity, 'Ajuste por conteo de auditoría', $userId]);
        }

        $pdo->commit();
        flash_set('success', 'Conteo registrado. Varianza: ' . number_format($variancePercent, 1) . '%.');
    } catch (Throwable $e) {
        $pdo->rollBack();
        flash_set('error', 'No se pudo registrar el conteo.');
    }

    redirect('/admin/inventory-audit.php');
}

$stmt = $pdo->prepare('SELECT * FROM ingredients WHERE user_uid = ? ORDER BY name');
$stmt->execute([$userId]);
$ingredients = $stmt->fetchAll();

$stmt = $pdo->prepare(
    'SELECT ic.*, i.name AS ingredient_name, i.unit FROM ingredient_counts ic
     INNER JOIN ingredients i ON i.id = ic.ingredient_id
     WHERE ic.user_uid = ? ORDER BY ic.created_at DESC LIMIT 30'
);
$stmt->execute([$userId]);
$counts = $stmt->fetchAll();

require_once __DIR__ . '/../partials/admin_header.php';
?>

<div class="row g-3">
  <div class="col-md-5">
    <div class="card p-3">
      <h6 class="mb-3">Registrar conteo físico</h6>
      <form method="post">
        <?= csrf_field() ?>
        <div class="mb-2">
          <label class="form-label">Ingrediente</label>
          <select name="ingredient_id" id="audit_ingredient" class="form-select" required onchange="showExpected()">
            <option value="">Selecciona...</option>
            <?php foreach ($ingredients as $i): ?>
              <option value="<?= (int) $i['id'] ?>" data-stock="<?= (float) $i['stock_quantity'] ?>" data-unit="<?= e($i['unit']) ?>">
                <?= e($i['name']) ?>
              </option>
            <?php endforeach; ?>
          </select>
          <div class="form-text" id="expectedHint"></div>
        </div>
        <div class="mb-2">
          <label class="form-label">Cantidad contada</label>
          <input type="number" step="0.001" name="counted_quantity" class="form-control" required>
        </div>
        <div class="mb-2">
          <label class="form-label">Notas (opcional)</label>
          <textarea name="notes" class="form-control" rows="2"></textarea>
        </div>
        <button type="submit" class="btn btn-primary">Registrar conteo</button>
      </form>
    </div>
  </div>

  <div class="col-md-7">
    <div class="card p-3">
      <h6 class="mb-3">Últimos conteos</h6>
      <table class="table table-sm">
        <thead><tr><th>Ingrediente</th><th>Esperado</th><th>Contado</th><th>Varianza</th><th>Fecha</th></tr></thead>
        <tbody>
          <?php foreach ($counts as $c): ?>
            <tr class="<?= $c['exceeds_tolerance'] ? 'table-warning' : '' ?>">
              <td><?= e($c['ingredient_name']) ?></td>
              <td><?= number_format((float) $c['expected_quantity'], 2) ?> <?= e($c['unit']) ?></td>
              <td><?= number_format((float) $c['counted_quantity'], 2) ?> <?= e($c['unit']) ?></td>
              <td><?= number_format((float) $c['variance_percent'], 1) ?>%</td>
              <td><?= format_datetime($c['created_at']) ?></td>
            </tr>
          <?php endforeach; ?>
          <?php if (empty($counts)): ?>
            <tr><td colspan="5" class="text-center text-muted py-3">Sin conteos registrados.</td></tr>
          <?php endif; ?>
        </tbody>
      </table>
    </div>
  </div>
</div>

<script>
function showExpected() {
  const sel = document.getElementById('audit_ingredient');
  const opt = sel.options[sel.selectedIndex];
  const hint = document.getElementById('expectedHint');
  if (opt && opt.value) {
    hint.textContent = 'Stock esperado en sistema: ' + parseFloat(opt.dataset.stock).toFixed(3) + ' ' + opt.dataset.unit;
  } else {
    hint.textContent = '';
  }
}
</script>

<?php require_once __DIR__ . '/../partials/admin_footer.php'; ?>
