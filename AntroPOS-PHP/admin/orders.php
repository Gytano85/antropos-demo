<?php
require_once __DIR__ . '/../helpers.php';

$pageTitle = 'Pedidos';
$activeNav = 'orders';
$__userPre = require_login();
$userId = $__userPre['id'];
$pdo = db();

$detailId = isset($_GET['id']) ? (int) $_GET['id'] : null;

if ($detailId) {
    $stmt = $pdo->prepare(
        'SELECT o.*, c.name AS customer_name, c.email AS customer_email
         FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
         WHERE o.id = ? AND o.user_uid = ?'
    );
    $stmt->execute([$detailId, $userId]);
    $order = $stmt->fetch();

    if (!$order) {
        flash_set('error', 'Pedido no encontrado.');
        redirect('/admin/orders.php');
    }

    $stmt = $pdo->prepare(
        'SELECT oi.*, p.name AS product_name FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.id'
    );
    $stmt->execute([$detailId]);
    $items = $stmt->fetchAll();

    $stmt = $pdo->prepare(
        'SELECT t.*, pm.name AS payment_method_name FROM transactions t
         LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id WHERE t.order_id = ?'
    );
    $stmt->execute([$detailId]);
    $transactions = $stmt->fetchAll();
}

$statusFilter = $_GET['status'] ?? '';
$sql = 'SELECT o.*, c.name AS customer_name FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.user_uid = ?';
$params = [$userId];
if ($statusFilter !== '') {
    $sql .= ' AND o.status = ?';
    $params[] = $statusFilter;
}
$sql .= ' ORDER BY o.created_at DESC LIMIT 200';
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$orders = $stmt->fetchAll();

require_once __DIR__ . '/../partials/admin_header.php';
?>

<?php if ($detailId && $order): ?>
  <a href="/admin/orders.php" class="btn btn-sm btn-outline-secondary mb-3"><i class="bi bi-arrow-left"></i> Volver</a>

  <div class="row g-3">
    <div class="col-md-7">
      <div class="card p-3">
        <h6>Pedido #<?= (int) $order['id'] ?> <?= $order['table_name'] ? '· Mesa ' . e($order['table_name']) : '' ?></h6>
        <table class="table table-sm">
          <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
          <tbody>
            <?php foreach ($items as $item): ?>
              <tr>
                <td><?= e($item['product_name'] ?? '—') ?></td>
                <td><?= (int) $item['quantity'] ?></td>
                <td>$<?= money((int) $item['price']) ?></td>
                <td>$<?= money((int) $item['price'] * (int) $item['quantity']) ?></td>
              </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
        <div class="d-flex justify-content-between border-top pt-2">
          <strong>Total</strong>
          <strong>$<?= money((int) $order['total_amount']) ?></strong>
        </div>
      </div>
    </div>
    <div class="col-md-5">
      <div class="card p-3">
        <h6>Detalles</h6>
        <p class="mb-1"><strong>Estado:</strong> <?= e($order['status']) ?></p>
        <p class="mb-1"><strong>Cliente:</strong> <?= e($order['customer_name'] ?? '—') ?></p>
        <p class="mb-1"><strong>Personas:</strong> <?= (int) $order['party_size'] ?></p>
        <p class="mb-1"><strong>Creado:</strong> <?= format_datetime($order['created_at']) ?></p>
        <p class="mb-1"><strong>Cerrado:</strong> <?= format_datetime($order['closed_at']) ?></p>
        <hr>
        <h6>Pagos</h6>
        <?php foreach ($transactions as $t): ?>
          <p class="mb-1 small"><?= e($t['payment_method_name'] ?? '—') ?> — $<?= money((int) $t['amount']) ?> (<?= e($t['status']) ?>)</p>
        <?php endforeach; ?>
        <?php if (empty($transactions)): ?>
          <p class="text-muted small mb-0">Sin pagos registrados.</p>
        <?php endif; ?>
      </div>
    </div>
  </div>

<?php else: ?>

  <div class="d-flex gap-2 mb-3">
    <a href="/admin/orders.php" class="btn btn-sm btn-outline-secondary <?= $statusFilter === '' ? 'active' : '' ?>">Todos</a>
    <a href="/admin/orders.php?status=pending" class="btn btn-sm btn-outline-secondary <?= $statusFilter === 'pending' ? 'active' : '' ?>">Pendientes</a>
    <a href="/admin/orders.php?status=completed" class="btn btn-sm btn-outline-secondary <?= $statusFilter === 'completed' ? 'active' : '' ?>">Completados</a>
  </div>

  <div class="card p-3">
    <table class="table table-sm align-middle mb-0">
      <thead><tr><th>#</th><th>Mesa</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
      <tbody>
        <?php foreach ($orders as $o): ?>
          <tr>
            <td><?= (int) $o['id'] ?></td>
            <td><?= e($o['table_name'] ?? '—') ?></td>
            <td><?= e($o['customer_name'] ?? '—') ?></td>
            <td>$<?= money((int) $o['total_amount']) ?></td>
            <td><span class="badge bg-<?= $o['status'] === 'completed' ? 'success' : 'warning' ?>"><?= e($o['status']) ?></span></td>
            <td><?= format_datetime($o['created_at']) ?></td>
            <td><a href="/admin/orders.php?id=<?= (int) $o['id'] ?>" class="btn btn-sm btn-outline-secondary"><i class="bi bi-eye"></i></a></td>
          </tr>
        <?php endforeach; ?>
        <?php if (empty($orders)): ?>
          <tr><td colspan="7" class="text-center text-muted py-3">Sin pedidos.</td></tr>
        <?php endif; ?>
      </tbody>
    </table>
  </div>

<?php endif; ?>

<?php require_once __DIR__ . '/../partials/admin_footer.php'; ?>
