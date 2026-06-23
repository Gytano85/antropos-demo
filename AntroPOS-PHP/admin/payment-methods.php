<?php
require_once __DIR__ . '/../helpers.php';

$pageTitle = 'Métodos de pago';
$activeNav = 'payment-methods';
$__userPre = require_login();
$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_post();
    $action = $_POST['action'] ?? '';

    if ($action === 'save') {
        $id = (int) ($_POST['id'] ?? 0);
        $name = trim($_POST['name'] ?? '');
        if ($name === '') {
            flash_set('error', 'El nombre es obligatorio.');
        } else {
            try {
                if ($id > 0) {
                    $stmt = $pdo->prepare('UPDATE payment_methods SET name=? WHERE id=?');
                    $stmt->execute([$name, $id]);
                } else {
                    $stmt = $pdo->prepare('INSERT INTO payment_methods (name) VALUES (?)');
                    $stmt->execute([$name]);
                }
                flash_set('success', 'Método de pago guardado.');
            } catch (PDOException $e) {
                flash_set('error', 'Ya existe un método de pago con ese nombre.');
            }
        }
    } elseif ($action === 'delete') {
        $id = (int) ($_POST['id'] ?? 0);
        $stmt = $pdo->prepare('DELETE FROM payment_methods WHERE id=?');
        $stmt->execute([$id]);
        flash_set('success', 'Método de pago eliminado.');
    }

    redirect('/admin/payment-methods.php');
}

$stmt = $pdo->query('SELECT * FROM payment_methods ORDER BY name');
$methods = $stmt->fetchAll();

require_once __DIR__ . '/../partials/admin_header.php';
?>

<div class="d-flex justify-content-end mb-3">
  <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#pmModal" onclick="openPmModal()">
    <i class="bi bi-plus-lg"></i> Nuevo método
  </button>
</div>

<div class="card p-3">
  <table class="table table-sm align-middle mb-0">
    <thead><tr><th>Nombre</th><th></th></tr></thead>
    <tbody>
      <?php foreach ($methods as $m): ?>
        <tr>
          <td><?= e($m['name']) ?></td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-secondary" onclick='openPmModal(<?= json_encode($m) ?>)'><i class="bi bi-pencil"></i></button>
            <form method="post" class="d-inline" onsubmit="return confirm('¿Eliminar este método de pago?');">
              <?= csrf_field() ?>
              <input type="hidden" name="action" value="delete">
              <input type="hidden" name="id" value="<?= (int) $m['id'] ?>">
              <button type="submit" class="btn btn-sm btn-outline-danger"><i class="bi bi-trash"></i></button>
            </form>
          </td>
        </tr>
      <?php endforeach; ?>
      <?php if (empty($methods)): ?>
        <tr><td colspan="2" class="text-center text-muted py-3">Sin métodos de pago.</td></tr>
      <?php endif; ?>
    </tbody>
  </table>
</div>

<div class="modal fade" id="pmModal" tabindex="-1">
  <div class="modal-dialog">
    <form method="post" class="modal-content">
      <?= csrf_field() ?>
      <input type="hidden" name="action" value="save">
      <input type="hidden" name="id" id="pm_id">
      <div class="modal-header">
        <h5 class="modal-title" id="pmModalTitle">Nuevo método de pago</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <label class="form-label">Nombre</label>
        <input type="text" name="name" id="pm_name" class="form-control" required maxlength="50">
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>
  </div>
</div>

<script>
function openPmModal(m) {
  document.getElementById('pmModalTitle').textContent = m ? 'Editar método de pago' : 'Nuevo método de pago';
  document.getElementById('pm_id').value = m ? m.id : '';
  document.getElementById('pm_name').value = m ? m.name : '';
  new bootstrap.Modal(document.getElementById('pmModal')).show();
}
</script>

<?php require_once __DIR__ . '/../partials/admin_footer.php'; ?>
