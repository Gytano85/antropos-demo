<?php
require_once __DIR__ . '/../helpers.php';

$pageTitle = 'Comprobantes fiscales';
$activeNav = 'fiscal';
$__userPre = require_login();
$userId = $__userPre['id'];
$pdo = db();

function fake_access_key(): string {
    // Clave de acceso simulada (44 dígitos) — NO es una clave real emitida por el SAT/SEFAZ.
    $digits = '';
    for ($i = 0; $i < 44; $i++) {
        $digits .= random_int(0, 9);
    }
    return $digits;
}

$detailId = isset($_GET['id']) ? (int) $_GET['id'] : null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_post();
    $action = $_POST['action'] ?? '';

    if ($action === 'create') {
        $orderId = (int) ($_POST['order_id'] ?? 0);
        $model = (int) ($_POST['model'] ?? 65);

        $stmt = $pdo->prepare('SELECT * FROM fiscal_settings WHERE user_uid = ?');
        $stmt->execute([$userId]);
        $settings = $stmt->fetch();

        if (!$settings) {
            flash_set('error', 'Configura primero los datos fiscales de tu negocio.');
            redirect('/admin/fiscal.php');
        }

        $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? AND user_uid = ? AND status = 'completed'");
        $stmt->execute([$orderId, $userId]);
        $order = $stmt->fetch();

        if (!$order) {
            flash_set('error', 'Selecciona un pedido cerrado válido.');
            redirect('/admin/fiscal.php');
        }

        $stmt = $pdo->prepare(
            'SELECT oi.*, p.name AS product_name, p.ncm, p.cfop, p.icms_cst, p.pis_cst, p.cofins_cst, p.unit_of_measure
             FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?'
        );
        $stmt->execute([$orderId]);
        $items = $stmt->fetchAll();

        if (empty($items)) {
            flash_set('error', 'Este pedido no tiene productos.');
            redirect('/admin/fiscal.php');
        }

        $isNfce = $model === 65;
        $series = $isNfce ? (int) $settings['nfce_series'] : (int) $settings['nfe_series'];
        $number = $isNfce ? (int) $settings['next_nfce_number'] : (int) $settings['next_nfe_number'];

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                "INSERT INTO invoices (user_uid, order_id, model, series, number, access_key, operation_nature, operation_type,
                   status, environment, issued_at, total_amount)
                 VALUES (?, ?, ?, ?, ?, ?, 'VENDA', 1, 'pending', ?, NOW(), ?)"
            );
            $stmt->execute([
                $userId, $orderId, $model, $series, $number, fake_access_key(),
                (int) $settings['environment'], (int) $order['total_amount'],
            ]);
            $invoiceId = (int) $pdo->lastInsertId();

            $itemNumber = 1;
            $insertItem = $pdo->prepare(
                'INSERT INTO invoice_items (invoice_id, product_id, item_number, product_code, description, ncm, cfop,
                   unit_of_measure, quantity, unit_price, total_price, icms_cst, pis_cst, cofins_cst)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($items as $item) {
                $insertItem->execute([
                    $invoiceId,
                    $item['product_id'],
                    $itemNumber++,
                    'P' . $item['product_id'],
                    $item['product_name'] ?? 'Producto',
                    $item['ncm'] ?: $settings['default_ncm'],
                    $item['cfop'] ?: $settings['default_cfop'],
                    $item['unit_of_measure'] ?: 'UN',
                    (int) $item['quantity'] * 1000,
                    (int) $item['price'],
                    (int) $item['price'] * (int) $item['quantity'],
                    $item['icms_cst'] ?: $settings['default_icms_cst'],
                    $item['pis_cst'] ?: $settings['default_pis_cst'],
                    $item['cofins_cst'] ?: $settings['default_cofins_cst'],
                ]);
            }

            $stmt = $pdo->prepare(
                "INSERT INTO invoice_events (invoice_id, event_type, sequence, reason) VALUES (?, 'created', 1, 'Comprobante registrado (sin timbrado real)')"
            );
            $stmt->execute([$invoiceId]);

            $updateCol = $isNfce ? 'next_nfce_number' : 'next_nfe_number';
            $stmt = $pdo->prepare("UPDATE fiscal_settings SET $updateCol = $updateCol + 1 WHERE user_uid = ?");
            $stmt->execute([$userId]);

            $pdo->commit();
            flash_set('success', 'Comprobante #' . $number . ' registrado.');
        } catch (Throwable $e) {
            $pdo->rollBack();
            flash_set('error', 'No se pudo registrar el comprobante.');
        }

        redirect('/admin/fiscal.php');
    } elseif ($action === 'mark_authorized') {
        $invoiceId = (int) ($_POST['invoice_id'] ?? 0);
        $stmt = $pdo->prepare(
            "UPDATE invoices SET status = 'authorized', authorized_at = NOW(), protocol_number = ?, status_code = 100, status_message = 'Autorizado (simulado)'
             WHERE id = ? AND user_uid = ?"
        );
        $stmt->execute([(string) random_int(100000000000, 999999999999), $invoiceId, $userId]);

        $stmt = $pdo->prepare(
            "INSERT INTO invoice_events (invoice_id, event_type, sequence, reason) VALUES (?, 'authorized', 2, 'Marcado manualmente como autorizado (no hay timbrado real con el SAT/SEFAZ)')"
        );
        $stmt->execute([$invoiceId]);

        flash_set('success', 'Comprobante marcado como autorizado.');
        redirect('/admin/fiscal.php?id=' . $invoiceId);
    } elseif ($action === 'cancel') {
        $invoiceId = (int) ($_POST['invoice_id'] ?? 0);
        $stmt = $pdo->prepare("UPDATE invoices SET status = 'cancelled' WHERE id = ? AND user_uid = ?");
        $stmt->execute([$invoiceId, $userId]);
        flash_set('success', 'Comprobante cancelado.');
        redirect('/admin/fiscal.php');
    }
}

if ($detailId) {
    $stmt = $pdo->prepare('SELECT * FROM invoices WHERE id = ? AND user_uid = ?');
    $stmt->execute([$detailId, $userId]);
    $invoice = $stmt->fetch();

    if ($invoice) {
        $stmt = $pdo->prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY item_number');
        $stmt->execute([$detailId]);
        $invoiceItems = $stmt->fetchAll();

        $stmt = $pdo->prepare('SELECT * FROM invoice_events WHERE invoice_id = ? ORDER BY sequence');
        $stmt->execute([$detailId]);
        $invoiceEvents = $stmt->fetchAll();
    }
}

$stmt = $pdo->prepare(
    'SELECT i.*, o.table_name FROM invoices i LEFT JOIN orders o ON o.id = i.order_id
     WHERE i.user_uid = ? ORDER BY i.created_at DESC LIMIT 100'
);
$stmt->execute([$userId]);
$invoices = $stmt->fetchAll();

$stmt = $pdo->prepare(
    "SELECT o.id, o.table_name, o.total_amount, o.created_at FROM orders o
     WHERE o.user_uid = ? AND o.status = 'completed'
     AND o.id NOT IN (SELECT order_id FROM invoices WHERE order_id IS NOT NULL)
     ORDER BY o.created_at DESC LIMIT 50"
);
$stmt->execute([$userId]);
$invoiceableOrders = $stmt->fetchAll();

require_once __DIR__ . '/../partials/admin_header.php';
?>

<div class="alert alert-warning">
  Este registro de comprobantes es solo para control interno: <strong>no transmite ni timbra documentos reales ante el SAT/SEFAZ</strong>.
</div>

<?php if ($detailId && !empty($invoice)): ?>
  <a href="/admin/fiscal.php" class="btn btn-sm btn-outline-secondary mb-3"><i class="bi bi-arrow-left"></i> Volver</a>
  <div class="row g-3">
    <div class="col-md-7">
      <div class="card p-3">
        <h6>Comprobante <?= $invoice['model'] == 65 ? 'NFC-e' : 'NF-e' ?> #<?= (int) $invoice['number'] ?> (serie <?= (int) $invoice['series'] ?>)</h6>
        <table class="table table-sm">
          <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead>
          <tbody>
            <?php foreach ($invoiceItems as $it): ?>
              <tr>
                <td><?= e($it['description']) ?></td>
                <td><?= number_format($it['quantity'] / 1000, 3) ?></td>
                <td>$<?= money((int) $it['unit_price']) ?></td>
                <td>$<?= money((int) $it['total_price']) ?></td>
              </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
        <div class="d-flex justify-content-between border-top pt-2">
          <strong>Total</strong>
          <strong>$<?= money((int) $invoice['total_amount']) ?></strong>
        </div>
      </div>

      <div class="card p-3 mt-3">
        <h6>Historial de eventos</h6>
        <?php foreach ($invoiceEvents as $ev): ?>
          <p class="mb-1 small"><strong><?= e($ev['event_type']) ?></strong> — <?= e($ev['reason'] ?? '') ?> · <?= format_datetime($ev['created_at']) ?></p>
        <?php endforeach; ?>
      </div>
    </div>
    <div class="col-md-5">
      <div class="card p-3">
        <h6>Estado</h6>
        <p class="mb-1"><strong>Status:</strong> <?= e($invoice['status']) ?></p>
        <p class="mb-1"><strong>Ambiente:</strong> <?= $invoice['environment'] == 1 ? 'Producción' : 'Homologación' ?></p>
        <p class="mb-1 small text-break"><strong>Clave de acceso (simulada):</strong> <?= e($invoice['access_key']) ?></p>
        <p class="mb-1"><strong>Emitido:</strong> <?= format_datetime($invoice['issued_at']) ?></p>
        <p class="mb-1"><strong>Autorizado:</strong> <?= format_datetime($invoice['authorized_at']) ?></p>
        <?php if ($invoice['status'] === 'pending'): ?>
          <form method="post" class="mt-2">
            <?= csrf_field() ?>
            <input type="hidden" name="action" value="mark_authorized">
            <input type="hidden" name="invoice_id" value="<?= (int) $invoice['id'] ?>">
            <button type="submit" class="btn btn-success btn-sm w-100">Marcar como autorizado (simulado)</button>
          </form>
        <?php endif; ?>
        <?php if (!in_array($invoice['status'], ['cancelled', 'voided'], true)): ?>
          <form method="post" class="mt-2" onsubmit="return confirm('¿Cancelar este comprobante?');">
            <?= csrf_field() ?>
            <input type="hidden" name="action" value="cancel">
            <input type="hidden" name="invoice_id" value="<?= (int) $invoice['id'] ?>">
            <button type="submit" class="btn btn-outline-danger btn-sm w-100">Cancelar comprobante</button>
          </form>
        <?php endif; ?>
      </div>
    </div>
  </div>

<?php else: ?>

  <div class="card p-3 mb-3">
    <h6 class="mb-3">Emitir comprobante para un pedido cerrado</h6>
    <form method="post" class="row g-2 align-items-end">
      <?= csrf_field() ?>
      <input type="hidden" name="action" value="create">
      <div class="col-md-6">
        <select name="order_id" class="form-select" required>
          <option value="">Selecciona un pedido...</option>
          <?php foreach ($invoiceableOrders as $o): ?>
            <option value="<?= (int) $o['id'] ?>">
              #<?= (int) $o['id'] ?> <?= $o['table_name'] ? '· Mesa ' . e($o['table_name']) : '' ?> — $<?= money((int) $o['total_amount']) ?>
            </option>
          <?php endforeach; ?>
        </select>
      </div>
      <div class="col-md-3">
        <select name="model" class="form-select">
          <option value="65">NFC-e (consumidor final)</option>
          <option value="55">NF-e (factura)</option>
        </select>
      </div>
      <div class="col-md-3">
        <button type="submit" class="btn btn-primary w-100">Generar comprobante</button>
      </div>
    </form>
    <?php if (empty($invoiceableOrders)): ?>
      <div class="form-text mt-2">No hay pedidos cerrados pendientes de facturar.</div>
    <?php endif; ?>
  </div>

  <div class="card p-3">
    <table class="table table-sm align-middle mb-0">
      <thead><tr><th>#</th><th>Modelo</th><th>Pedido</th><th>Total</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
      <tbody>
        <?php foreach ($invoices as $inv): ?>
          <tr>
            <td><?= (int) $inv['number'] ?></td>
            <td><?= $inv['model'] == 65 ? 'NFC-e' : 'NF-e' ?></td>
            <td><?= $inv['table_name'] ? 'Mesa ' . e($inv['table_name']) : ('#' . (int) $inv['order_id']) ?></td>
            <td>$<?= money((int) $inv['total_amount']) ?></td>
            <td><span class="badge bg-<?= $inv['status'] === 'authorized' ? 'success' : ($inv['status'] === 'cancelled' ? 'secondary' : 'warning') ?>"><?= e($inv['status']) ?></span></td>
            <td><?= format_datetime($inv['created_at']) ?></td>
            <td><a href="/admin/fiscal.php?id=<?= (int) $inv['id'] ?>" class="btn btn-sm btn-outline-secondary"><i class="bi bi-eye"></i></a></td>
          </tr>
        <?php endforeach; ?>
        <?php if (empty($invoices)): ?>
          <tr><td colspan="7" class="text-center text-muted py-3">Sin comprobantes registrados.</td></tr>
        <?php endif; ?>
      </tbody>
    </table>
  </div>

<?php endif; ?>

<?php require_once __DIR__ . '/../partials/admin_footer.php'; ?>
