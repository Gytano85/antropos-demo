<?php
require_once __DIR__ . '/../helpers.php';

$pageTitle = 'Ingredientes';
$activeNav = 'ingredients';
$__userPre = require_login();
$userId = $__userPre['id'];
$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_post();
    $action = $_POST['action'] ?? '';

    if ($action === 'save') {
        $id = (int) ($_POST['id'] ?? 0);
        $name = trim($_POST['name'] ?? '');
        $unit = trim($_POST['unit'] ?? '');
        $stockQuantity = (float) ($_POST['stock_quantity'] ?? 0);
        $packageSize = (float) ($_POST['package_size'] ?? 1);
        $lowStockThreshold = (float) ($_POST['low_stock_threshold'] ?? 0);

        if ($name === '' || $unit === '') {
            flash_set('error', 'Nombre y unidad son obligatorios.');
        } elseif ($id > 0) {
            $stmt = $pdo->prepare(
                'UPDATE ingredients SET name=?, unit=?, stock_quantity=?, package_size=?, low_stock_threshold=? WHERE id=? AND user_uid=?'
            );
            $stmt->execute([$name, $unit, $stockQuantity, $packageSize, $lowStockThreshold, $id, $userId]);
            flash_set('success', 'Ingrediente actualizado.');
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO ingredients (name, unit, stock_quantity, package_size, low_stock_threshold, user_uid) VALUES (?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([$name, $unit, $stockQuantity, $packageSize, $lowStockThreshold, $userId]);
            flash_set('success', 'Ingrediente creado.');
        }
    } elseif ($action === 'delete') {
        $id = (int) ($_POST['id'] ?? 0);
        $stmt = $pdo->prepare('DELETE FROM ingredients WHERE id=? AND user_uid=?');
        $stmt->execute([$id, $userId]);
        flash_set('success', 'Ingrediente eliminado.');
    }

    redirect('/admin/ingredients.php');
}

$stmt = $pdo->prepare('SELECT * FROM ingredients WHERE user_uid = ? ORDER BY name');
$stmt->execute([$userId]);
$ingredients = $stmt->fetchAll();

require_once __DIR__ . '/../partials/admin_header.php';
?>

<div class="d-flex justify-content-end mb-3">
  <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#ingModal" onclick="openIngModal()">
    <i class="bi bi-plus-lg"></i> Nuevo ingrediente
  </button>
</div>

<div class="card p-3">
  <table class="table table-sm align-middle mb-0">
    <thead><tr><th>Nombre</th><th>Unidad</th><th>Stock</th><th>Tamaño de paquete</th><th>Umbral mínimo</th><th></th></tr></thead>
    <tbody>
      <?php foreach ($ingredients as $i): ?>
        <?php $low = (float) $i['stock_quantity'] <= (float) $i['low_stock_threshold']; ?>
        <tr class="<?= $low ? 'table-danger' : '' ?>">
          <td><?= e($i['name']) ?></td>
          <td><?= e($i['unit']) ?></td>
          <td><?= rtrim(rtrim(number_format((float) $i['stock_quantity'], 3), '0'), '.') ?></td>
          <td><?= rtrim(rtrim(number_format((float) $i['package_size'], 3), '0'), '.') ?></td>
          <td><?= rtrim(rtrim(number_format((float) $i['low_stock_threshold'], 3), '0'), '.') ?></td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-secondary" onclick='openIngModal(<?= json_encode($i) ?>)'><i class="bi bi-pencil"></i></button>
            <form method="post" class="d-inline" onsubmit="return confirm('¿Eliminar este ingrediente?');">
              <?= csrf_field() ?>
              <input type="hidden" name="action" value="delete">
              <input type="hidden" name="id" value="<?= (int) $i['id'] ?>">
              <button type="submit" class="btn btn-sm btn-outline-danger"><i class="bi bi-trash"></i></button>
            </form>
          </td>
        </tr>
      <?php endforeach; ?>
      <?php if (empty($ingredients)): ?>
        <tr><td colspan="6" class="text-center text-muted py-3">Sin ingredientes todavía.</td></tr>
      <?php endif; ?>
    </tbody>
  </table>
</div>

<div class="modal fade" id="ingModal" tabindex="-1">
  <div class="modal-dialog">
    <form method="post" class="modal-content">
      <?= csrf_field() ?>
      <input type="hidden" name="action" value="save">
      <input type="hidden" name="id" id="i_id">
      <div class="modal-header">
        <h5 class="modal-title" id="ingModalTitle">Nuevo ingrediente</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="mb-2">
          <label class="form-label">Nombre</label>
          <input type="text" name="name" id="i_name" class="form-control" required>
        </div>
        <div class="mb-2">
          <label class="form-label">Unidad (ml, g, unit...)</label>
          <input type="text" name="unit" id="i_unit" class="form-control" required maxlength="20">
        </div>
        <div class="row">
          <div class="col-4 mb-2">
            <label class="form-label small">Stock actual</label>
            <input type="number" step="0.001" name="stock_quantity" id="i_stock_quantity" class="form-control" required>
          </div>
          <div class="col-4 mb-2">
            <label class="form-label small">Tamaño de paquete</label>
            <input type="number" step="0.001" name="package_size" id="i_package_size" class="form-control" value="1" required>
          </div>
          <div class="col-4 mb-2">
            <label class="form-label small">Umbral mínimo</label>
            <input type="number" step="0.001" name="low_stock_threshold" id="i_low_stock_threshold" class="form-control" value="0" required>
          </div>
        </div>
        <div class="form-text">El inventario se guarda en la unidad más pequeña práctica: ml para líquidos, g para alimentos, unit para insumos contables.</div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>
  </div>
</div>

<script>
function openIngModal(i) {
  document.getElementById('ingModalTitle').textContent = i ? 'Editar ingrediente' : 'Nuevo ingrediente';
  document.getElementById('i_id').value = i ? i.id : '';
  document.getElementById('i_name').value = i ? i.name : '';
  document.getElementById('i_unit').value = i ? i.unit : '';
  document.getElementById('i_stock_quantity').value = i ? i.stock_quantity : 0;
  document.getElementById('i_package_size').value = i ? i.package_size : 1;
  document.getElementById('i_low_stock_threshold').value = i ? i.low_stock_threshold : 0;
  new bootstrap.Modal(document.getElementById('ingModal')).show();
}
</script>

<?php require_once __DIR__ . '/../partials/admin_footer.php'; ?>
