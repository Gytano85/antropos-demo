<?php
require_once __DIR__ . '/../helpers.php';

$pageTitle = 'Recetas';
$activeNav = 'recipes';
$__userPre = require_login();
$userId = $__userPre['id'];
$pdo = db();

function get_or_create_recipe(PDO $pdo, string $userId, int $productId): int {
    $stmt = $pdo->prepare('SELECT id FROM recipes WHERE product_id = ? AND user_uid = ?');
    $stmt->execute([$productId, $userId]);
    $row = $stmt->fetch();
    if ($row) {
        return (int) $row['id'];
    }
    $stmt = $pdo->prepare('INSERT INTO recipes (product_id, user_uid) VALUES (?, ?)');
    $stmt->execute([$productId, $userId]);
    return (int) $pdo->lastInsertId();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_post();
    $action = $_POST['action'] ?? '';
    $productId = (int) ($_POST['product_id'] ?? 0);

    if ($action === 'add_item') {
        $ingredientId = (int) ($_POST['ingredient_id'] ?? 0);
        $quantity = (float) ($_POST['quantity'] ?? 0);
        if ($ingredientId > 0 && $quantity > 0 && $productId > 0) {
            $recipeId = get_or_create_recipe($pdo, $userId, $productId);
            $stmt = $pdo->prepare('SELECT id FROM recipe_items WHERE recipe_id = ? AND ingredient_id = ?');
            $stmt->execute([$recipeId, $ingredientId]);
            $existing = $stmt->fetch();
            if ($existing) {
                $stmt = $pdo->prepare('UPDATE recipe_items SET quantity = ? WHERE id = ?');
                $stmt->execute([$quantity, $existing['id']]);
            } else {
                $stmt = $pdo->prepare('INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) VALUES (?, ?, ?)');
                $stmt->execute([$recipeId, $ingredientId, $quantity]);
            }
            $stmt = $pdo->prepare('UPDATE recipes SET updated_at = NOW() WHERE id = ?');
            $stmt->execute([$recipeId]);
            flash_set('success', 'Ingrediente agregado a la receta.');
        }
    } elseif ($action === 'remove_item') {
        $itemId = (int) ($_POST['item_id'] ?? 0);
        $stmt = $pdo->prepare(
            'DELETE ri FROM recipe_items ri INNER JOIN recipes r ON r.id = ri.recipe_id
             WHERE ri.id = ? AND r.user_uid = ?'
        );
        $stmt->execute([$itemId, $userId]);
        flash_set('success', 'Ingrediente quitado de la receta.');
    }

    redirect('/admin/recipes.php?product_id=' . $productId);
}

$selectedProductId = isset($_GET['product_id']) ? (int) $_GET['product_id'] : null;

$stmt = $pdo->prepare('SELECT * FROM products WHERE user_uid = ? ORDER BY name');
$stmt->execute([$userId]);
$products = $stmt->fetchAll();

$stmt = $pdo->prepare('SELECT * FROM ingredients WHERE user_uid = ? ORDER BY name');
$stmt->execute([$userId]);
$ingredients = $stmt->fetchAll();

$recipeItems = [];
if ($selectedProductId) {
    $stmt = $pdo->prepare(
        'SELECT ri.id, ri.quantity, i.name AS ingredient_name, i.unit
         FROM recipe_items ri
         INNER JOIN recipes r ON r.id = ri.recipe_id
         INNER JOIN ingredients i ON i.id = ri.ingredient_id
         WHERE r.product_id = ? AND r.user_uid = ?
         ORDER BY i.name'
    );
    $stmt->execute([$selectedProductId, $userId]);
    $recipeItems = $stmt->fetchAll();
}

require_once __DIR__ . '/../partials/admin_header.php';
?>

<div class="d-flex justify-content-end mb-3">
  <a href="/admin/ingredients.php" class="btn btn-outline-secondary btn-sm">
    <i class="bi bi-egg-fried"></i> Gestionar ingredientes
  </a>
</div>

<div class="row g-3">
  <div class="col-md-4">
    <div class="card p-3">
      <h6 class="mb-2">Productos</h6>
      <div class="list-group">
        <?php foreach ($products as $p): ?>
          <a href="/admin/recipes.php?product_id=<?= (int) $p['id'] ?>"
             class="list-group-item list-group-item-action <?= $selectedProductId === (int) $p['id'] ? 'active' : '' ?>">
            <?= e($p['name']) ?>
          </a>
        <?php endforeach; ?>
        <?php if (empty($products)): ?>
          <div class="text-muted small p-2">Crea productos primero.</div>
        <?php endif; ?>
      </div>
    </div>
  </div>

  <div class="col-md-8">
    <?php if ($selectedProductId): ?>
      <?php
        $selectedProduct = null;
        foreach ($products as $p) {
            if ((int) $p['id'] === $selectedProductId) {
                $selectedProduct = $p;
                break;
            }
        }
      ?>
      <div class="card p-3">
        <h6 class="mb-3">Receta de "<?= e($selectedProduct['name'] ?? '') ?>"</h6>
        <table class="table table-sm">
          <thead><tr><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th><th></th></tr></thead>
          <tbody>
            <?php foreach ($recipeItems as $ri): ?>
              <tr>
                <td><?= e($ri['ingredient_name']) ?></td>
                <td><?= rtrim(rtrim(number_format((float) $ri['quantity'], 3), '0'), '.') ?></td>
                <td><?= e($ri['unit']) ?></td>
                <td class="text-end">
                  <form method="post" onsubmit="return confirm('¿Quitar este ingrediente de la receta?');">
                    <?= csrf_field() ?>
                    <input type="hidden" name="action" value="remove_item">
                    <input type="hidden" name="product_id" value="<?= $selectedProductId ?>">
                    <input type="hidden" name="item_id" value="<?= (int) $ri['id'] ?>">
                    <button type="submit" class="btn btn-sm btn-outline-danger"><i class="bi bi-trash"></i></button>
                  </form>
                </td>
              </tr>
            <?php endforeach; ?>
            <?php if (empty($recipeItems)): ?>
              <tr><td colspan="4" class="text-center text-muted py-3">Este producto aún no tiene receta (se vende usando su stock directo).</td></tr>
            <?php endif; ?>
          </tbody>
        </table>

        <form method="post" class="row g-2 align-items-end mt-2">
          <?= csrf_field() ?>
          <input type="hidden" name="action" value="add_item">
          <input type="hidden" name="product_id" value="<?= $selectedProductId ?>">
          <div class="col-6">
            <select name="ingredient_id" class="form-select form-select-sm" required>
              <option value="">Ingrediente...</option>
              <?php foreach ($ingredients as $ing): ?>
                <option value="<?= (int) $ing['id'] ?>"><?= e($ing['name']) ?> (<?= e($ing['unit']) ?>)</option>
              <?php endforeach; ?>
            </select>
          </div>
          <div class="col-3">
            <input type="number" step="0.001" name="quantity" class="form-control form-control-sm" placeholder="Cantidad" required>
          </div>
          <div class="col-3">
            <button type="submit" class="btn btn-primary btn-sm w-100"><i class="bi bi-plus-lg"></i> Agregar</button>
          </div>
        </form>
      </div>
    <?php else: ?>
      <div class="card p-4 text-center text-muted">Selecciona un producto para ver o editar su receta.</div>
    <?php endif; ?>
  </div>
</div>

<?php require_once __DIR__ . '/../partials/admin_footer.php'; ?>
