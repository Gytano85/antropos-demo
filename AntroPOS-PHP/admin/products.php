<?php
require_once __DIR__ . '/../helpers.php';

$pageTitle = 'Productos';
$activeNav = 'products';
$__userPre = require_login();
$userId = $__userPre['id'];
$pdo = db();

// --- Acciones ---
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_post();
    $action = $_POST['action'] ?? '';

    if ($action === 'save') {
        $id = (int) ($_POST['id'] ?? 0);
        $name = trim($_POST['name'] ?? '');
        $description = trim($_POST['description'] ?? '');
        $price = to_cents($_POST['price'] ?? '0');
        $inStock = (int) ($_POST['in_stock'] ?? 0);
        $category = trim($_POST['category'] ?? '') ?: null;
        $unit = trim($_POST['unit_of_measure'] ?? '') ?: 'UN';
        $ncm = trim($_POST['ncm'] ?? '') ?: null;
        $cfop = trim($_POST['cfop'] ?? '') ?: null;
        $icmsCst = trim($_POST['icms_cst'] ?? '') ?: null;
        $pisCst = trim($_POST['pis_cst'] ?? '') ?: null;
        $cofinsCst = trim($_POST['cofins_cst'] ?? '') ?: null;

        if ($name === '') {
            flash_set('error', 'El nombre es obligatorio.');
        } elseif ($id > 0) {
            $stmt = $pdo->prepare(
                'UPDATE products SET name=?, description=?, price=?, in_stock=?, category=?, unit_of_measure=?,
                 ncm=?, cfop=?, icms_cst=?, pis_cst=?, cofins_cst=? WHERE id=? AND user_uid=?'
            );
            $stmt->execute([$name, $description, $price, $inStock, $category, $unit, $ncm, $cfop, $icmsCst, $pisCst, $cofinsCst, $id, $userId]);
            flash_set('success', 'Producto actualizado.');
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO products (name, description, price, in_stock, user_uid, category, unit_of_measure, ncm, cfop, icms_cst, pis_cst, cofins_cst)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([$name, $description, $price, $inStock, $userId, $category, $unit, $ncm, $cfop, $icmsCst, $pisCst, $cofinsCst]);
            flash_set('success', 'Producto creado.');
        }
    } elseif ($action === 'delete') {
        $id = (int) ($_POST['id'] ?? 0);
        $stmt = $pdo->prepare('DELETE FROM products WHERE id=? AND user_uid=?');
        $stmt->execute([$id, $userId]);
        flash_set('success', 'Producto eliminado.');
    }

    redirect('/admin/products.php');
}

$stmt = $pdo->prepare('SELECT * FROM products WHERE user_uid = ? ORDER BY name ASC');
$stmt->execute([$userId]);
$products = $stmt->fetchAll();

require_once __DIR__ . '/../partials/admin_header.php';
?>

<div class="d-flex justify-content-end mb-3">
  <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#productModal" onclick="openProductModal()">
    <i class="bi bi-plus-lg"></i> Nuevo producto
  </button>
</div>

<div class="card p-3">
  <div class="table-responsive">
    <table class="table table-sm align-middle mb-0">
      <thead><tr><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Stock</th><th></th></tr></thead>
      <tbody>
        <?php foreach ($products as $p): ?>
          <tr>
            <td><?= e($p['name']) ?></td>
            <td><?= e($p['category'] ?? '—') ?></td>
            <td>$<?= money((int) $p['price']) ?></td>
            <td><?= (int) $p['in_stock'] ?></td>
            <td class="text-end">
              <button class="btn btn-sm btn-outline-secondary" onclick='openProductModal(<?= json_encode($p) ?>)'>
                <i class="bi bi-pencil"></i>
              </button>
              <form method="post" class="d-inline" onsubmit="return confirm('¿Eliminar este producto?');">
                <?= csrf_field() ?>
                <input type="hidden" name="action" value="delete">
                <input type="hidden" name="id" value="<?= (int) $p['id'] ?>">
                <button type="submit" class="btn btn-sm btn-outline-danger"><i class="bi bi-trash"></i></button>
              </form>
            </td>
          </tr>
        <?php endforeach; ?>
        <?php if (empty($products)): ?>
          <tr><td colspan="5" class="text-center text-muted py-3">Sin productos todavía.</td></tr>
        <?php endif; ?>
      </tbody>
    </table>
  </div>
</div>

<div class="modal fade" id="productModal" tabindex="-1">
  <div class="modal-dialog">
    <form method="post" class="modal-content">
      <?= csrf_field() ?>
      <input type="hidden" name="action" value="save">
      <input type="hidden" name="id" id="f_id">
      <div class="modal-header">
        <h5 class="modal-title" id="productModalTitle">Nuevo producto</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="mb-2">
          <label class="form-label">Nombre</label>
          <input type="text" name="name" id="f_name" class="form-control" required>
        </div>
        <div class="mb-2">
          <label class="form-label">Descripción</label>
          <textarea name="description" id="f_description" class="form-control" rows="2"></textarea>
        </div>
        <div class="row">
          <div class="col-6 mb-2">
            <label class="form-label">Precio (MXN)</label>
            <input type="number" step="0.01" min="0" name="price" id="f_price" class="form-control" required>
          </div>
          <div class="col-6 mb-2">
            <label class="form-label">Stock</label>
            <input type="number" step="1" min="0" name="in_stock" id="f_in_stock" class="form-control" required>
          </div>
        </div>
        <div class="mb-2">
          <label class="form-label">Categoría</label>
          <input type="text" name="category" id="f_category" class="form-control" list="categoryOptions" placeholder="cervezas, cocteles, botellas, sin_alcohol, snacks, servicios...">
          <datalist id="categoryOptions">
            <option value="cervezas">
            <option value="cocteles">
            <option value="botellas">
            <option value="sin_alcohol">
            <option value="snacks">
            <option value="servicios">
          </datalist>
          <div class="form-text">Las categorías <code>cervezas</code>, <code>cocteles</code> y <code>botellas</code> activan el precio dinámico de alcohol.</div>
        </div>
        <details class="mb-2">
          <summary class="mb-2">Datos fiscales (opcional)</summary>
          <div class="row mt-2">
            <div class="col-6 mb-2">
              <label class="form-label small">NCM</label>
              <input type="text" name="ncm" id="f_ncm" class="form-control form-control-sm" maxlength="8">
            </div>
            <div class="col-6 mb-2">
              <label class="form-label small">CFOP</label>
              <input type="text" name="cfop" id="f_cfop" class="form-control form-control-sm" maxlength="4">
            </div>
            <div class="col-4 mb-2">
              <label class="form-label small">ICMS CST</label>
              <input type="text" name="icms_cst" id="f_icms_cst" class="form-control form-control-sm" maxlength="3">
            </div>
            <div class="col-4 mb-2">
              <label class="form-label small">PIS CST</label>
              <input type="text" name="pis_cst" id="f_pis_cst" class="form-control form-control-sm" maxlength="2">
            </div>
            <div class="col-4 mb-2">
              <label class="form-label small">COFINS CST</label>
              <input type="text" name="cofins_cst" id="f_cofins_cst" class="form-control form-control-sm" maxlength="2">
            </div>
          </div>
        </details>
        <div class="mb-2">
          <label class="form-label">Unidad de medida</label>
          <input type="text" name="unit_of_measure" id="f_unit_of_measure" class="form-control" maxlength="6" value="UN">
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>
  </div>
</div>

<script>
function openProductModal(p) {
  document.getElementById('productModalTitle').textContent = p ? 'Editar producto' : 'Nuevo producto';
  document.getElementById('f_id').value = p ? p.id : '';
  document.getElementById('f_name').value = p ? p.name : '';
  document.getElementById('f_description').value = p ? (p.description || '') : '';
  document.getElementById('f_price').value = p ? (p.price / 100).toFixed(2) : '';
  document.getElementById('f_in_stock').value = p ? p.in_stock : 0;
  document.getElementById('f_category').value = p ? (p.category || '') : '';
  document.getElementById('f_ncm').value = p ? (p.ncm || '') : '';
  document.getElementById('f_cfop').value = p ? (p.cfop || '') : '';
  document.getElementById('f_icms_cst').value = p ? (p.icms_cst || '') : '';
  document.getElementById('f_pis_cst').value = p ? (p.pis_cst || '') : '';
  document.getElementById('f_cofins_cst').value = p ? (p.cofins_cst || '') : '';
  document.getElementById('f_unit_of_measure').value = p ? (p.unit_of_measure || 'UN') : 'UN';
  new bootstrap.Modal(document.getElementById('productModal')).show();
}
</script>

<?php require_once __DIR__ . '/../partials/admin_footer.php'; ?>
