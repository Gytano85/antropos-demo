<?php
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../lib/tables.php';
require_once __DIR__ . '/../lib/pricing.php';

$pageTitle = 'Mesas';
$activeNav = 'tables';
$__userPre = require_login();
$userId = $__userPre['id'];
$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_post();
    $action = $_POST['action'] ?? '';

    try {
        if ($action === 'open') {
            $tableName = trim($_POST['table_name'] ?? '');
            $partySize = max(1, (int) ($_POST['party_size'] ?? 1));
            if ($tableName === '') {
                throw new TablesException('El nombre de la mesa es obligatorio.');
            }
            $orderId = open_table($userId, $tableName, $partySize);
            redirect('/admin/tables.php?order_id=' . $orderId);
        } elseif ($action === 'set_party_size') {
            $orderId = (int) ($_POST['order_id'] ?? 0);
            $partySize = max(1, (int) ($_POST['party_size'] ?? 1));
            set_table_party_size($userId, $orderId, $partySize);
            flash_set('success', 'Número de personas actualizado.');
            redirect('/admin/tables.php?order_id=' . $orderId);
        } elseif ($action === 'add_item') {
            $orderId = (int) ($_POST['order_id'] ?? 0);
            $productId = (int) ($_POST['product_id'] ?? 0);
            $quantity = max(1, (int) ($_POST['quantity'] ?? 1));
            add_item_to_table($userId, $orderId, $productId, $quantity);
            redirect('/admin/tables.php?order_id=' . $orderId);
        } elseif ($action === 'remove_item') {
            $orderId = (int) ($_POST['order_id'] ?? 0);
            $itemId = (int) ($_POST['item_id'] ?? 0);
            remove_item_from_table($userId, $orderId, $itemId);
            redirect('/admin/tables.php?order_id=' . $orderId);
        } elseif ($action === 'close') {
            $orderId = (int) ($_POST['order_id'] ?? 0);
            $paymentMethodId = (int) ($_POST['payment_method_id'] ?? 0);
            close_table($userId, $orderId, $paymentMethodId);
            flash_set('success', 'Mesa cerrada y cobrada correctamente.');
            redirect('/admin/tables.php');
        }
    } catch (TablesException $e) {
        flash_set('error', $e->getMessage());
        $back = isset($orderId) && $orderId ? ('?order_id=' . $orderId) : '';
        redirect('/admin/tables.php' . $back);
    }
}

$selectedOrderId = isset($_GET['order_id']) ? (int) $_GET['order_id'] : null;
$openTables = list_open_tables($userId);

$selectedOrder = null;
if ($selectedOrderId) {
    try {
        $selectedOrder = get_open_table($userId, $selectedOrderId);
    } catch (TablesException $e) {
        flash_set('error', $e->getMessage());
        redirect('/admin/tables.php');
    }
}

$stmt = $pdo->prepare('SELECT * FROM products WHERE user_uid = ? ORDER BY category, name');
$stmt->execute([$userId]);
$allProducts = $stmt->fetchAll();

$stmt = $pdo->prepare('SELECT * FROM payment_methods ORDER BY name');
$stmt->execute();
$paymentMethods = $stmt->fetchAll();

$settingsRow = get_or_create_pricing_settings($userId);
$settings = to_settings_values($settingsRow);
$openTablesCount = count_open_tables($userId);
$occupancyRatio = pricing_occupancy_ratio($openTablesCount, $settings['capacity']);
$occupancyPct = pricing_occupancy_adjustment_pct($occupancyRatio, $settings);

require_once __DIR__ . '/../partials/admin_header.php';
?>

<?php if (!$selectedOrder): ?>

  <div class="alert alert-info d-flex justify-content-between align-items-center">
    <div>
      <strong><?= $openTablesCount ?></strong> mesa(s) abierta(s) ·
      Ajuste de ocupación actual sobre bebidas alcohólicas:
      <strong><?= ($occupancyPct >= 0 ? '+' : '') . round($occupancyPct) ?>%</strong>
    </div>
    <button class="btn btn-primary btn-sm" data-bs-toggle="modal" data-bs-target="#openTableModal">
      <i class="bi bi-plus-lg"></i> Abrir mesa
    </button>
  </div>

  <div class="row g-3">
    <?php foreach ($openTables as $t): ?>
      <div class="col-md-3">
        <a href="/admin/tables.php?order_id=<?= (int) $t['id'] ?>" class="text-decoration-none">
          <div class="card p-3 h-100">
            <div class="fw-bold mb-1"><i class="bi bi-grid-3x3-gap"></i> <?= e($t['table_name']) ?></div>
            <div class="text-muted small mb-2"><?= count($t['orderItems']) ?> producto(s) · <?= (int) $t['party_size'] ?> persona(s)</div>
            <div class="fs-5 fw-bold">$<?= money((int) $t['total_amount']) ?></div>
          </div>
        </a>
      </div>
    <?php endforeach; ?>
    <?php if (empty($openTables)): ?>
      <div class="col-12">
        <div class="card p-4 text-center text-muted">No hay mesas abiertas. Abre una para empezar a tomar pedidos.</div>
      </div>
    <?php endif; ?>
  </div>

  <div class="modal fade" id="openTableModal" tabindex="-1">
    <div class="modal-dialog">
      <form method="post" class="modal-content">
        <?= csrf_field() ?>
        <input type="hidden" name="action" value="open">
        <div class="modal-header">
          <h5 class="modal-title">Abrir mesa</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="mb-2">
            <label class="form-label">Nombre / número de mesa</label>
            <input type="text" name="table_name" class="form-control" required maxlength="50">
          </div>
          <div class="mb-2">
            <label class="form-label">Número de personas</label>
            <input type="number" name="party_size" class="form-control" value="1" min="1" max="999" required>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button type="submit" class="btn btn-primary">Abrir mesa</button>
        </div>
      </form>
    </div>
  </div>

<?php else: ?>

  <div class="d-flex justify-content-between align-items-center mb-3">
    <a href="/admin/tables.php" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-left"></i> Volver a mesas</a>
    <form method="post" class="d-flex align-items-center gap-2">
      <?= csrf_field() ?>
      <input type="hidden" name="action" value="set_party_size">
      <input type="hidden" name="order_id" value="<?= (int) $selectedOrder['id'] ?>">
      <label class="small text-muted mb-0">Personas:</label>
      <input type="number" name="party_size" value="<?= (int) $selectedOrder['party_size'] ?>" min="1" max="999" class="form-control form-control-sm" style="width:70px;">
      <button type="submit" class="btn btn-sm btn-outline-primary">Actualizar</button>
    </form>
  </div>

  <div class="row g-3">
    <div class="col-md-7">
      <div class="card p-3">
        <h6><?= e($selectedOrder['table_name']) ?></h6>
        <table class="table table-sm align-middle">
          <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th><th></th></tr></thead>
          <tbody>
            <?php foreach ($selectedOrder['orderItems'] as $item): ?>
              <tr>
                <td>
                  <?= e($item['product_name'] ?? '—') ?>
                  <?php if (is_alcohol_category($item['product_category'])): ?>
                    <span class="badge bg-secondary ms-1">alcohol</span>
                  <?php endif; ?>
                </td>
                <td><?= (int) $item['quantity'] ?></td>
                <td>$<?= money((int) $item['price']) ?></td>
                <td>$<?= money((int) $item['price'] * (int) $item['quantity']) ?></td>
                <td class="text-end">
                  <form method="post" onsubmit="return confirm('¿Quitar este producto de la comanda?');">
                    <?= csrf_field() ?>
                    <input type="hidden" name="action" value="remove_item">
                    <input type="hidden" name="order_id" value="<?= (int) $selectedOrder['id'] ?>">
                    <input type="hidden" name="item_id" value="<?= (int) $item['id'] ?>">
                    <button type="submit" class="btn btn-sm btn-outline-danger"><i class="bi bi-x"></i></button>
                  </form>
                </td>
              </tr>
            <?php endforeach; ?>
            <?php if (empty($selectedOrder['orderItems'])): ?>
              <tr><td colspan="5" class="text-center text-muted py-3">Sin productos agregados.</td></tr>
            <?php endif; ?>
          </tbody>
        </table>
        <div class="d-flex justify-content-between align-items-center border-top pt-2">
          <span class="fw-bold">Total</span>
          <span class="fs-5 fw-bold">$<?= money((int) $selectedOrder['total_amount']) ?></span>
        </div>
      </div>

      <div class="card p-3 mt-3">
        <h6>Cerrar mesa</h6>
        <form method="post" class="row g-2 align-items-end">
          <?= csrf_field() ?>
          <input type="hidden" name="action" value="close">
          <input type="hidden" name="order_id" value="<?= (int) $selectedOrder['id'] ?>">
          <div class="col-8">
            <label class="form-label small">Método de pago</label>
            <select name="payment_method_id" class="form-select" required>
              <option value="">Selecciona...</option>
              <?php foreach ($paymentMethods as $pm): ?>
                <option value="<?= (int) $pm['id'] ?>"><?= e($pm['name']) ?></option>
              <?php endforeach; ?>
            </select>
          </div>
          <div class="col-4">
            <button type="submit" class="btn btn-success w-100" onclick="return confirm('¿Cerrar y cobrar esta mesa?');">
              <i class="bi bi-check-lg"></i> Cobrar y cerrar
            </button>
          </div>
        </form>
      </div>
    </div>

    <div class="col-md-5">
      <div class="card p-3">
        <h6>Agregar producto</h6>
        <form method="post" class="row g-2">
          <?= csrf_field() ?>
          <input type="hidden" name="action" value="add_item">
          <input type="hidden" name="order_id" value="<?= (int) $selectedOrder['id'] ?>">
          <div class="col-8">
            <select name="product_id" class="form-select" required>
              <option value="">Producto...</option>
              <?php foreach ($allProducts as $p): ?>
                <option value="<?= (int) $p['id'] ?>">
                  <?= e($p['name']) ?> — $<?= money((int) $p['price']) ?>
                  <?= is_alcohol_category($p['category']) ? ' 🍺' : '' ?>
                </option>
              <?php endforeach; ?>
            </select>
          </div>
          <div class="col-2">
            <input type="number" name="quantity" class="form-control" value="1" min="1">
          </div>
          <div class="col-2">
            <button type="submit" class="btn btn-primary w-100"><i class="bi bi-plus-lg"></i></button>
          </div>
        </form>
        <div class="form-text mt-2">
          Los productos de categoría <code>cervezas</code>, <code>cocteles</code> o <code>botellas</code>
          ajustan su precio automáticamente según la ocupación del local y el consumo por persona en esta mesa.
        </div>
      </div>
    </div>
  </div>

<?php endif; ?>

<?php require_once __DIR__ . '/../partials/admin_footer.php'; ?>
