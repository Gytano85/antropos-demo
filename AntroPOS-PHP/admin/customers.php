<?php
require_once __DIR__ . '/../helpers.php';

$pageTitle = 'Clientes';
$activeNav = 'customers';
$__userPre = require_login();
$userId = $__userPre['id'];
$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_post();
    $action = $_POST['action'] ?? '';

    if ($action === 'save') {
        $id = (int) ($_POST['id'] ?? 0);
        $name = trim($_POST['name'] ?? '');
        $email = trim($_POST['email'] ?? '');
        $phone = trim($_POST['phone'] ?? '') ?: null;
        $status = trim($_POST['status'] ?? '') ?: 'active';

        if ($name === '' || $email === '') {
            flash_set('error', 'Nombre y email son obligatorios.');
        } else {
            try {
                if ($id > 0) {
                    $stmt = $pdo->prepare('UPDATE customers SET name=?, email=?, phone=?, status=? WHERE id=? AND user_uid=?');
                    $stmt->execute([$name, $email, $phone, $status, $id, $userId]);
                    flash_set('success', 'Cliente actualizado.');
                } else {
                    $stmt = $pdo->prepare('INSERT INTO customers (name, email, phone, user_uid, status) VALUES (?, ?, ?, ?, ?)');
                    $stmt->execute([$name, $email, $phone, $userId, $status]);
                    flash_set('success', 'Cliente creado.');
                }
            } catch (PDOException $e) {
                flash_set('error', 'Ya existe un cliente con ese email.');
            }
        }
    } elseif ($action === 'delete') {
        $id = (int) ($_POST['id'] ?? 0);
        $stmt = $pdo->prepare('DELETE FROM customers WHERE id=? AND user_uid=?');
        $stmt->execute([$id, $userId]);
        flash_set('success', 'Cliente eliminado.');
    }

    redirect('/admin/customers.php');
}

$stmt = $pdo->prepare('SELECT * FROM customers WHERE user_uid = ? ORDER BY name ASC');
$stmt->execute([$userId]);
$customers = $stmt->fetchAll();

require_once __DIR__ . '/../partials/admin_header.php';
?>

<div class="d-flex justify-content-end mb-3">
  <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#customerModal" onclick="openCustomerModal()">
    <i class="bi bi-plus-lg"></i> Nuevo cliente
  </button>
</div>

<div class="card p-3">
  <div class="table-responsive">
    <table class="table table-sm align-middle mb-0">
      <thead><tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Estado</th><th></th></tr></thead>
      <tbody>
        <?php foreach ($customers as $c): ?>
          <tr>
            <td><?= e($c['name']) ?></td>
            <td><?= e($c['email']) ?></td>
            <td><?= e($c['phone'] ?? '—') ?></td>
            <td><?= e($c['status'] ?? '—') ?></td>
            <td class="text-end">
              <button class="btn btn-sm btn-outline-secondary" onclick='openCustomerModal(<?= json_encode($c) ?>)'>
                <i class="bi bi-pencil"></i>
              </button>
              <form method="post" class="d-inline" onsubmit="return confirm('¿Eliminar este cliente?');">
                <?= csrf_field() ?>
                <input type="hidden" name="action" value="delete">
                <input type="hidden" name="id" value="<?= (int) $c['id'] ?>">
                <button type="submit" class="btn btn-sm btn-outline-danger"><i class="bi bi-trash"></i></button>
              </form>
            </td>
          </tr>
        <?php endforeach; ?>
        <?php if (empty($customers)): ?>
          <tr><td colspan="5" class="text-center text-muted py-3">Sin clientes todavía.</td></tr>
        <?php endif; ?>
      </tbody>
    </table>
  </div>
</div>

<div class="modal fade" id="customerModal" tabindex="-1">
  <div class="modal-dialog">
    <form method="post" class="modal-content">
      <?= csrf_field() ?>
      <input type="hidden" name="action" value="save">
      <input type="hidden" name="id" id="c_id">
      <div class="modal-header">
        <h5 class="modal-title" id="customerModalTitle">Nuevo cliente</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="mb-2">
          <label class="form-label">Nombre</label>
          <input type="text" name="name" id="c_name" class="form-control" required>
        </div>
        <div class="mb-2">
          <label class="form-label">Email</label>
          <input type="email" name="email" id="c_email" class="form-control" required>
        </div>
        <div class="mb-2">
          <label class="form-label">Teléfono</label>
          <input type="text" name="phone" id="c_phone" class="form-control">
        </div>
        <div class="mb-2">
          <label class="form-label">Estado</label>
          <select name="status" id="c_status" class="form-select">
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
          </select>
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
function openCustomerModal(c) {
  document.getElementById('customerModalTitle').textContent = c ? 'Editar cliente' : 'Nuevo cliente';
  document.getElementById('c_id').value = c ? c.id : '';
  document.getElementById('c_name').value = c ? c.name : '';
  document.getElementById('c_email').value = c ? c.email : '';
  document.getElementById('c_phone').value = c ? (c.phone || '') : '';
  document.getElementById('c_status').value = c ? (c.status || 'active') : 'active';
  new bootstrap.Modal(document.getElementById('customerModal')).show();
}
</script>

<?php require_once __DIR__ . '/../partials/admin_footer.php'; ?>
