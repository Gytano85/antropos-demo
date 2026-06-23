<?php
require_once __DIR__ . '/../helpers.php';

$pageTitle = 'Caja';
$activeNav = 'cashier';
$__userPre = require_login();
$userId = $__userPre['id'];
$pdo = db();

// Port 1:1 de apps/web/src/app/admin/cashier/page.tsx: tabla de transacciones
// (DataTable) + fila inline "Nuevo" al final para alta rápida, dropdown de
// acciones (editar/eliminar) por fila.
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_post();
    $action = $_POST['action'] ?? '';

    if ($action === 'save') {
        $id = (int) ($_POST['id'] ?? 0);
        $description = trim($_POST['description'] ?? '');
        $category = trim($_POST['category'] ?? '') ?: null;
        $type = ($_POST['type'] ?? '') === 'expense' ? 'expense' : 'income';
        $amount = to_cents($_POST['amount'] ?? 0);
        $status = ($_POST['status'] ?? '') === 'pending' ? 'pending' : 'completed';

        if ($description === '' || $amount <= 0) {
            flash_set('error', 'Descripción y monto (mayor a cero) son obligatorios.');
        } elseif ($id > 0) {
            $stmt = $pdo->prepare('UPDATE transactions SET description=?, category=?, type=?, amount=?, status=? WHERE id=? AND user_uid=?');
            $stmt->execute([$description, $category, $type, $amount, $status, $id, $userId]);
            flash_set('success', 'Transacción actualizada.');
        } else {
            $stmt = $pdo->prepare('INSERT INTO transactions (description, category, type, amount, status, user_uid) VALUES (?, ?, ?, ?, ?, ?)');
            $stmt->execute([$description, $category, $type, $amount, $status, $userId]);
            flash_set('success', 'Transacción creada.');
        }
    } elseif ($action === 'delete') {
        $id = (int) ($_POST['id'] ?? 0);
        $stmt = $pdo->prepare('DELETE FROM transactions WHERE id=? AND user_uid=?');
        $stmt->execute([$id, $userId]);
        flash_set('success', 'Transacción eliminada.');
    }

    redirect('/admin/cashier.php');
}

$stmt = $pdo->prepare('SELECT * FROM transactions WHERE user_uid = ? ORDER BY created_at DESC');
$stmt->execute([$userId]);
$transactions = $stmt->fetchAll();

require_once __DIR__ . '/../partials/admin_header.php';
?>

<div class="card">
  <div class="card-body">
    <h5 class="card-title mb-1">Caja</h5>
    <p class="text-muted small mb-3">Registro de ingresos y gastos.</p>

    <div class="table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th>ID</th>
            <th>Descripción</th>
            <th class="d-none d-md-table-cell">Categoría</th>
            <th>Tipo</th>
            <th class="d-none d-md-table-cell">Fecha</th>
            <th>Monto</th>
            <th>Estado</th>
            <th class="text-end" style="width:2.5rem;"></th>
          </tr>
        </thead>
        <tbody>
          <?php foreach ($transactions as $t): ?>
            <tr>
              <td class="text-muted"><?= (int) $t['id'] ?></td>
              <td class="fw-medium"><?= e($t['description']) ?></td>
              <td class="d-none d-md-table-cell text-muted"><?= e($t['category'] ?? '—') ?></td>
              <td><span class="badge <?= $t['type'] === 'income' ? 'badge-income' : 'badge-expense' ?>"><?= $t['type'] === 'income' ? 'Ingreso' : 'Gasto' ?></span></td>
              <td class="d-none d-md-table-cell text-muted small"><?= format_datetime($t['created_at']) ?></td>
              <td class="fw-medium">$<?= money((int) $t['amount']) ?></td>
              <td><span class="badge <?= $t['status'] === 'completed' ? 'bg-primary' : 'bg-secondary' ?>"><?= $t['status'] === 'completed' ? 'Completado' : 'Pendiente' ?></span></td>
              <td class="text-end">
                <div class="dropdown">
                  <button class="btn btn-ghost btn-icon" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                    <i class="bi bi-three-dots-vertical"></i>
                  </button>
                  <ul class="dropdown-menu dropdown-menu-end">
                    <li><a class="dropdown-item" href="#" onclick='openTxModal(<?= json_encode($t) ?>); return false;'>Editar</a></li>
                    <li>
                      <form method="post" onsubmit="return confirm('¿Eliminar esta transacción?');">
                        <?= csrf_field() ?>
                        <input type="hidden" name="action" value="delete">
                        <input type="hidden" name="id" value="<?= (int) $t['id'] ?>">
                        <button type="submit" class="dropdown-item text-danger">Eliminar</button>
                      </form>
                    </li>
                  </ul>
                </div>
              </td>
            </tr>
          <?php endforeach; ?>
          <?php if (empty($transactions)): ?>
            <tr><td colspan="8" class="text-center text-muted py-4">Sin transacciones todavía.</td></tr>
          <?php endif; ?>

          <tr class="table-light">
            <td class="text-muted small">Nuevo</td>
            <td><input type="text" id="newDesc" class="form-control form-control-sm" placeholder="Descripción"></td>
            <td class="d-none d-md-table-cell"><input type="text" id="newCategory" class="form-control form-control-sm" placeholder="Categoría"></td>
            <td>
              <select id="newType" class="form-select form-select-sm">
                <option value="income">Ingreso</option>
                <option value="expense">Gasto</option>
              </select>
            </td>
            <td class="d-none d-md-table-cell text-muted small"><?= format_datetime(date('Y-m-d H:i:s')) ?></td>
            <td>
              <div class="position-relative">
                <span class="position-absolute" style="left:.5rem; top:50%; transform:translateY(-50%); font-size:.8rem; color:hsl(var(--muted-foreground));">$</span>
                <input type="number" id="newAmount" min="0.01" step="0.01" class="form-control form-control-sm" style="padding-left:1.25rem;" placeholder="0.00">
              </div>
            </td>
            <td>
              <select id="newStatus" class="form-select form-select-sm">
                <option value="completed">Completado</option>
                <option value="pending">Pendiente</option>
              </select>
            </td>
            <td class="text-end">
              <button type="button" class="btn btn-primary btn-sm" onclick="addTransaction()">Agregar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<form method="post" id="txForm" class="d-none">
  <?= csrf_field() ?>
  <input type="hidden" name="action" value="save">
  <input type="hidden" name="id" id="tx_id">
  <input type="hidden" name="description" id="tx_description">
  <input type="hidden" name="category" id="tx_category">
  <input type="hidden" name="type" id="tx_type">
  <input type="hidden" name="amount" id="tx_amount">
  <input type="hidden" name="status" id="tx_status">
</form>

<div class="modal fade" id="txModal" tabindex="-1">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Editar transacción</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="mb-2">
          <label class="form-label">Descripción</label>
          <input type="text" id="m_description" class="form-control">
        </div>
        <div class="mb-2">
          <label class="form-label">Categoría</label>
          <input type="text" id="m_category" class="form-control">
        </div>
        <div class="mb-2">
          <label class="form-label">Tipo</label>
          <select id="m_type" class="form-select">
            <option value="income">Ingreso</option>
            <option value="expense">Gasto</option>
          </select>
        </div>
        <div class="mb-2">
          <label class="form-label">Monto</label>
          <input type="number" id="m_amount" min="0.01" step="0.01" class="form-control">
        </div>
        <div class="mb-2">
          <label class="form-label">Estado</label>
          <select id="m_status" class="form-select">
            <option value="completed">Completado</option>
            <option value="pending">Pendiente</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
        <button type="button" class="btn btn-primary" onclick="submitTxModal()">Guardar</button>
      </div>
    </div>
  </div>
</div>

<script>
function addTransaction() {
  const description = document.getElementById('newDesc').value.trim();
  const amount = parseFloat(document.getElementById('newAmount').value);
  if (!description || !(amount > 0)) { return; }
  document.getElementById('tx_id').value = '';
  document.getElementById('tx_description').value = description;
  document.getElementById('tx_category').value = document.getElementById('newCategory').value.trim();
  document.getElementById('tx_type').value = document.getElementById('newType').value;
  document.getElementById('tx_amount').value = amount;
  document.getElementById('tx_status').value = document.getElementById('newStatus').value;
  document.getElementById('txForm').submit();
}

let editingTxId = null;
function openTxModal(t) {
  editingTxId = t.id;
  document.getElementById('m_description').value = t.description || '';
  document.getElementById('m_category').value = t.category || '';
  document.getElementById('m_type').value = t.type || 'income';
  document.getElementById('m_amount').value = (t.amount / 100).toFixed(2);
  document.getElementById('m_status').value = t.status || 'completed';
  new bootstrap.Modal(document.getElementById('txModal')).show();
}

function submitTxModal() {
  const description = document.getElementById('m_description').value.trim();
  const amount = parseFloat(document.getElementById('m_amount').value);
  if (!description || !(amount > 0)) { return; }
  document.getElementById('tx_id').value = editingTxId;
  document.getElementById('tx_description').value = description;
  document.getElementById('tx_category').value = document.getElementById('m_category').value.trim();
  document.getElementById('tx_type').value = document.getElementById('m_type').value;
  document.getElementById('tx_amount').value = amount;
  document.getElementById('tx_status').value = document.getElementById('m_status').value;
  document.getElementById('txForm').submit();
}
</script>

<?php require_once __DIR__ . '/../partials/admin_footer.php'; ?>
