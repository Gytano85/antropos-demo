<?php
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../lib/pos.php';

$pageTitle = 'Punto de venta';
$activeNav = 'pos';
$__userPre = require_login();
$userId = $__userPre['id'];
$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_post();
    $itemsJson = $_POST['items_json'] ?? '[]';
    $items = json_decode($itemsJson, true);
    $customerId = (int) ($_POST['customer_id'] ?? 0) ?: null;
    $paymentMethodId = (int) ($_POST['payment_method_id'] ?? 0);

    try {
        if (!is_array($items) || empty($items)) {
            throw new TablesException('Agrega al menos un producto a la venta.');
        }
        $result = create_pos_sale($userId, $customerId, $items, $paymentMethodId);
        flash_set('success', 'Pedido #' . $result['order_id'] . ' creado: $' . money($result['total_amount']));
        redirect('/admin/pos.php');
    } catch (TablesException $e) {
        flash_set('error', $e->getMessage());
        redirect('/admin/pos.php');
    }
}

$stmt = $pdo->prepare('SELECT * FROM products WHERE user_uid = ? ORDER BY category, name');
$stmt->execute([$userId]);
$products = $stmt->fetchAll();

$stmt = $pdo->prepare('SELECT * FROM customers WHERE user_uid = ? ORDER BY name');
$stmt->execute([$userId]);
$customers = $stmt->fetchAll();

$stmt = $pdo->prepare('SELECT * FROM payment_methods ORDER BY name');
$stmt->execute();
$paymentMethods = $stmt->fetchAll();

require_once __DIR__ . '/../partials/admin_header.php';

// Port visual 1:1 de apps/web/src/app/admin/pos/page.tsx: Card "Detalles de
// venta" (cliente + método de pago) + Card "Productos" (buscador + tabla de
// líneas con stepper de cantidad), igual estructura y comportamiento que el
// original (botón "Crear pedido" solo se habilita con productos + cliente +
// método de pago seleccionados).
$productsForJs = array_map(function ($p) {
    return [
        'id' => (int) $p['id'],
        'name' => $p['name'],
        'price' => (int) $p['price'],
        'in_stock' => (int) $p['in_stock'],
        'category' => $p['category'] ?? '',
    ];
}, $products);
?>

<div class="w-100 mx-auto" style="max-width: 56rem;">
  <div class="card mb-4">
    <div class="card-body">
      <h5 class="card-title mb-4">Detalles de venta</h5>
      <div class="d-flex flex-column flex-sm-row gap-3">
        <div class="flex-fill combobox" data-combobox>
          <button type="button" class="combobox-trigger" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false">
            <span class="combobox-value placeholder">Selecciona un cliente...</span>
            <i class="bi bi-chevron-expand combobox-chevron"></i>
          </button>
          <div class="dropdown-menu combobox-menu w-100">
            <div class="combobox-search-wrap">
              <i class="bi bi-search"></i>
              <input type="text" class="combobox-search" placeholder="Buscar cliente...">
            </div>
            <div class="combobox-list">
              <?php foreach ($customers as $c): ?>
                <button type="button" class="combobox-item" data-value="<?= (int) $c['id'] ?>" data-label="<?= e($c['name']) ?>"><?= e($c['name']) ?></button>
              <?php endforeach; ?>
              <div class="combobox-empty" style="display:none;">No se encontró ningún cliente.</div>
            </div>
          </div>
          <input type="hidden" id="customerIdInput" name="customer_id" form="checkoutForm" data-combobox-input>
        </div>
        <div class="flex-fill combobox" data-combobox>
          <button type="button" class="combobox-trigger" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false">
            <span class="combobox-value placeholder">Selecciona método de pago...</span>
            <i class="bi bi-chevron-expand combobox-chevron"></i>
          </button>
          <div class="dropdown-menu combobox-menu w-100">
            <div class="combobox-search-wrap">
              <i class="bi bi-search"></i>
              <input type="text" class="combobox-search" placeholder="Buscar método de pago...">
            </div>
            <div class="combobox-list">
              <?php foreach ($paymentMethods as $pm): ?>
                <button type="button" class="combobox-item" data-value="<?= (int) $pm['id'] ?>" data-label="<?= e($pm['name']) ?>"><?= e($pm['name']) ?></button>
              <?php endforeach; ?>
              <div class="combobox-empty" style="display:none;">No se encontró ningún método de pago.</div>
            </div>
          </div>
          <input type="hidden" id="paymentMethodIdInput" name="payment_method_id" form="checkoutForm" data-combobox-input>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-body">
      <h5 class="card-title mb-1">Productos</h5>
      <div class="d-flex flex-column flex-sm-row gap-3 mt-3 mb-3">
        <div class="position-relative flex-fill">
          <i class="bi bi-search position-absolute" style="left:.65rem; top:50%; transform:translateY(-50%); color:hsl(var(--muted-foreground)); font-size:.85rem; z-index:5;"></i>
          <input type="text" id="productSearch" class="form-control" style="padding-left:2rem;" placeholder="Buscar producto...">
        </div>
        <div class="flex-fill combobox" data-combobox data-no-select="true">
          <button type="button" class="combobox-trigger" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false">
            <span class="combobox-value placeholder">Agregar producto...</span>
            <i class="bi bi-chevron-expand combobox-chevron"></i>
          </button>
          <div class="dropdown-menu combobox-menu w-100">
            <div class="combobox-list">
              <?php foreach ($products as $p): ?>
                <button type="button" class="combobox-item" data-value="<?= (int) $p['id'] ?>"
                  data-name="<?= e(mb_strtolower($p['name'])) ?>" data-category="<?= e(mb_strtolower($p['category'] ?? '')) ?>"
                  data-label="<?= e($p['name']) ?> — $<?= money((int) $p['price']) ?> (<?= (int) $p['in_stock'] ?> en stock)">
                  <?= e($p['name']) ?> — $<?= money((int) $p['price']) ?> (<?= (int) $p['in_stock'] ?> en stock)<?= is_alcohol_category($p['category']) ? ' 🍺' : '' ?>
                </button>
              <?php endforeach; ?>
              <div class="combobox-empty" style="display:none;">No se encontró ningún producto.</div>
            </div>
          </div>
          <input type="hidden" id="addProductInput" data-combobox-input>
        </div>
      </div>

      <div id="emptyCartMsg" class="d-flex align-items-center justify-content-center text-muted small" style="height:8rem;">
        Selecciona productos para agregar a la venta.
      </div>

      <div class="table-responsive" id="cartTableWrap" style="display:none;">
        <table class="table table-hover align-middle">
          <thead>
            <tr>
              <th>Nombre</th>
              <th class="d-none d-sm-table-cell">Precio</th>
              <th class="d-none d-md-table-cell">Stock</th>
              <th>Cant.</th>
              <th>Total</th>
              <th class="text-end" style="width:2.5rem;"></th>
            </tr>
          </thead>
          <tbody id="cartTableBody"></tbody>
        </table>
      </div>

      <div class="d-flex flex-column flex-sm-row align-items-center justify-content-between gap-3 border-top pt-3 mt-3">
        <strong class="fs-5">Total: <span id="cartTotal">$0.00</span></strong>
        <div class="d-flex align-items-center gap-3 w-100 w-sm-auto">
          <label class="d-flex align-items-center gap-2 small mb-0" style="cursor:pointer;">
            <input type="checkbox" id="emitNfce" class="form-check-input mt-0">
            <i class="bi bi-receipt text-muted"></i> NFC-e
          </label>
          <form method="post" id="checkoutForm" class="flex-fill flex-sm-grow-0">
            <?= csrf_field() ?>
            <input type="hidden" name="items_json" id="itemsJson" value="[]">
            <button type="submit" class="btn btn-primary btn-lg w-100" id="checkoutBtn" disabled>Crear pedido</button>
          </form>
        </div>
      </div>
      <div class="form-text mt-2">El total final puede variar respecto al estimado si hay productos con precio dinámico de alcohol.</div>
    </div>
  </div>
</div>

<script>
const PRODUCTS = <?= json_encode($productsForJs) ?>;
const cart = {}; // id -> {id, name, price, in_stock, qty}

const productSearch = document.getElementById('productSearch');
const addProductInput = document.getElementById('addProductInput');
const addProductCombobox = addProductInput.closest('[data-combobox]');
const customerIdInput = document.getElementById('customerIdInput');
const paymentMethodIdInput = document.getElementById('paymentMethodIdInput');

function money(cents) {
  return '$' + (cents / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// El buscador externo filtra los <button class="combobox-item"> dentro del
// combobox "Agregar producto...", igual que el original (Input externo
// filtra el array `items` que recibe el Combobox).
productSearch.addEventListener('input', () => {
  const q = productSearch.value.trim().toLowerCase();
  const items = addProductCombobox.querySelectorAll('.combobox-item');
  let anyVisible = false;
  items.forEach((item) => {
    const name = item.getAttribute('data-name') || '';
    const category = item.getAttribute('data-category') || '';
    const match = !q || name.includes(q) || category.includes(q);
    item.style.display = match ? '' : 'none';
    if (match) anyVisible = true;
  });
  const empty = addProductCombobox.querySelector('.combobox-empty');
  if (empty) empty.style.display = anyVisible ? 'none' : 'block';
});

addProductInput.addEventListener('change', () => {
  const id = addProductInput.value;
  if (!id) return;
  const product = PRODUCTS.find((p) => String(p.id) === id);
  if (!product) return;
  if (product.in_stock <= 0) {
    alert('"' + product.name + '" no tiene stock disponible.');
    return;
  }
  const existing = cart[id];
  if (existing && existing.qty >= product.in_stock) {
    alert('Solo hay ' + product.in_stock + ' unidades disponibles de "' + product.name + '".');
    return;
  }
  if (existing) {
    existing.qty += 1;
  } else {
    cart[id] = { id: product.id, name: product.name, price: product.price, in_stock: product.in_stock, qty: 1 };
  }
  renderCart();
});

function changeQty(id, delta) {
  const item = cart[id];
  if (!item) return;
  const newQty = item.qty + delta;
  if (newQty <= 0) return;
  if (newQty > item.in_stock) {
    alert('Solo hay ' + item.in_stock + ' unidades disponibles.');
    return;
  }
  item.qty = newQty;
  renderCart();
}

function removeItem(id) {
  delete cart[id];
  renderCart();
}

function renderCart() {
  const ids = Object.keys(cart);
  const emptyMsg = document.getElementById('emptyCartMsg');
  const tableWrap = document.getElementById('cartTableWrap');
  const tbody = document.getElementById('cartTableBody');

  if (ids.length === 0) {
    emptyMsg.style.display = 'flex';
    tableWrap.style.display = 'none';
    tbody.innerHTML = '';
  } else {
    emptyMsg.style.display = 'none';
    tableWrap.style.display = '';
    tbody.innerHTML = ids.map((id) => {
      const item = cart[id];
      const stockBadgeClass = item.in_stock > 5 ? 'bg-primary' : 'bg-danger';
      return `
        <tr>
          <td class="fw-medium">${item.name}</td>
          <td class="d-none d-sm-table-cell">${money(item.price)}</td>
          <td class="d-none d-md-table-cell"><span class="badge ${stockBadgeClass}">${item.in_stock}</span></td>
          <td>
            <div class="d-flex align-items-center gap-1">
              <button type="button" class="btn btn-outline-secondary qty-btn" onclick="changeQty('${id}', -1)" ${item.qty <= 1 ? 'disabled' : ''}><i class="bi bi-dash"></i></button>
              <span style="width:2rem; text-align:center; display:inline-block;">${item.qty}</span>
              <button type="button" class="btn btn-outline-secondary qty-btn" onclick="changeQty('${id}', 1)" ${item.qty >= item.in_stock ? 'disabled' : ''}><i class="bi bi-plus"></i></button>
            </div>
          </td>
          <td class="fw-medium">${money(item.price * item.qty)}</td>
          <td class="text-end">
            <button type="button" class="btn btn-ghost btn-icon" onclick="removeItem('${id}')"><i class="bi bi-trash"></i></button>
          </td>
        </tr>`;
    }).join('');
  }

  const total = ids.reduce((sum, id) => sum + cart[id].price * cart[id].qty, 0);
  document.getElementById('cartTotal').textContent = money(total);
  document.getElementById('itemsJson').value = JSON.stringify(
    ids.map((id) => ({ product_id: cart[id].id, quantity: cart[id].qty }))
  );
  updateCheckoutState();
}

function updateCheckoutState() {
  const hasItems = Object.keys(cart).length > 0;
  const hasCustomer = !!customerIdInput.value;
  const hasPayment = !!paymentMethodIdInput.value;
  document.getElementById('checkoutBtn').disabled = !(hasItems && hasCustomer && hasPayment);
}

customerIdInput.addEventListener('change', updateCheckoutState);
paymentMethodIdInput.addEventListener('change', updateCheckoutState);

renderCart();
</script>

<?php require_once __DIR__ . '/../partials/admin_footer.php'; ?>
