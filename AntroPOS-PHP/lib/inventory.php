<?php
// Port 1:1 de apps/web/src/lib/inventory/ingredients.ts
// Asume que el caller ya abrió una transacción PDO (db()->beginTransaction()).

require_once __DIR__ . '/../db.php';

/**
 * Consume los ingredientes de receta para los productos vendidos en $soldItems.
 * Lanza RuntimeException si no hay inventario suficiente de algún ingrediente.
 *
 * @param string $userId
 * @param int $orderId
 * @param array $soldItems lista de ['orderItemId'=>int,'productId'=>int,'quantity'=>int]
 * @return int[] ids de producto que SÍ tienen receta (recipe-managed)
 */
function consume_recipe_ingredients(string $userId, int $orderId, array $soldItems): array {
    $pdo = db();

    $productIds = array_values(array_unique(array_map(
        fn($item) => (int) $item['productId'],
        $soldItems
    )));

    if (empty($productIds)) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($productIds), '?'));
    $stmt = $pdo->prepare(
        "SELECT r.product_id AS product_id, i.id AS ingredient_id, i.name AS ingredient_name,
                i.stock_quantity AS stock_quantity, ri.quantity AS recipe_quantity
         FROM recipe_items ri
         INNER JOIN recipes r ON r.id = ri.recipe_id
         INNER JOIN ingredients i ON i.id = ri.ingredient_id
         WHERE r.user_uid = ? AND i.user_uid = ? AND r.product_id IN ($placeholders)"
    );
    $stmt->execute(array_merge([$userId, $userId], $productIds));
    $components = $stmt->fetchAll();

    $recipeManagedProductIds = [];
    foreach ($components as $component) {
        $recipeManagedProductIds[(int) $component['product_id']] = true;
    }

    if (empty($components)) {
        return [];
    }

    // requiredByIngredient[ingredientId] = ['name'=>, 'stock'=>, 'required'=>]
    $requiredByIngredient = [];
    $movements = [];

    foreach ($soldItems as $item) {
        $productId = (int) $item['productId'];
        $quantity = (float) $item['quantity'];

        foreach ($components as $component) {
            if ((int) $component['product_id'] !== $productId) {
                continue;
            }

            $ingredientId = (int) $component['ingredient_id'];
            $required = (float) $component['recipe_quantity'] * $quantity;

            if (!isset($requiredByIngredient[$ingredientId])) {
                $requiredByIngredient[$ingredientId] = [
                    'name' => $component['ingredient_name'],
                    'stock' => (float) $component['stock_quantity'],
                    'required' => 0.0,
                ];
            }
            $requiredByIngredient[$ingredientId]['required'] += $required;

            $movements[] = [
                'ingredient_id' => $ingredientId,
                'order_id' => $orderId,
                'order_item_id' => (int) $item['orderItemId'],
                'movement_type' => 'consumption',
                'quantity' => -$required,
                'expected_quantity' => $required,
                'user_uid' => $userId,
            ];
        }
    }

    // Validar inventario suficiente antes de aplicar nada.
    foreach ($requiredByIngredient as $ingredientId => $info) {
        if ($info['stock'] + 0.0001 < $info['required']) {
            throw new RuntimeException(sprintf(
                'Inventario insuficiente de %s. Se requieren %s y hay %s.',
                $info['name'],
                number_format($info['required'], 2),
                number_format($info['stock'], 2)
            ));
        }
    }

    // Aplicar descuentos de stock.
    $updateStmt = $pdo->prepare(
        'UPDATE ingredients SET stock_quantity = stock_quantity - ?, updated_at = NOW() WHERE id = ? AND user_uid = ?'
    );
    foreach ($requiredByIngredient as $ingredientId => $info) {
        $updateStmt->execute([$info['required'], $ingredientId, $userId]);
    }

    // Insertar movimientos de consumo.
    $insertMovement = $pdo->prepare(
        'INSERT INTO ingredient_movements (ingredient_id, order_id, order_item_id, movement_type, quantity, expected_quantity, user_uid)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    foreach ($movements as $movement) {
        $insertMovement->execute([
            $movement['ingredient_id'],
            $movement['order_id'],
            $movement['order_item_id'],
            $movement['movement_type'],
            $movement['quantity'],
            $movement['expected_quantity'],
            $movement['user_uid'],
        ]);
    }

    return array_keys($recipeManagedProductIds);
}

/**
 * Restaura los ingredientes consumidos por un order_item retirado de la comanda.
 * @return bool true si el item SÍ era recipe-managed (consumió ingredientes)
 */
function restore_order_item_ingredients(string $userId, int $orderId, int $orderItemId, string $note): bool {
    $pdo = db();

    $stmt = $pdo->prepare(
        'SELECT ingredient_id, quantity FROM ingredient_movements
         WHERE user_uid = ? AND order_id = ? AND order_item_id = ?'
    );
    $stmt->execute([$userId, $orderId, $orderItemId]);
    $movements = $stmt->fetchAll();

    if (empty($movements)) {
        return false;
    }

    $netByIngredient = [];
    foreach ($movements as $movement) {
        $ingredientId = (int) $movement['ingredient_id'];
        $netByIngredient[$ingredientId] = ($netByIngredient[$ingredientId] ?? 0.0) + (float) $movement['quantity'];
    }

    $anyRestored = false;
    $updateStmt = $pdo->prepare(
        'UPDATE ingredients SET stock_quantity = stock_quantity + ?, updated_at = NOW() WHERE id = ? AND user_uid = ?'
    );
    $insertMovement = $pdo->prepare(
        'INSERT INTO ingredient_movements (ingredient_id, order_id, order_item_id, movement_type, quantity, expected_quantity, notes, user_uid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );

    foreach ($netByIngredient as $ingredientId => $netQuantity) {
        if ($netQuantity >= 0) {
            continue; // sólo restauramos ingredientes que tuvieron consumo neto
        }
        $restoreQuantity = max(0.0, -$netQuantity);
        if ($restoreQuantity <= 0) {
            continue;
        }

        $anyRestored = true;
        $updateStmt->execute([$restoreQuantity, $ingredientId, $userId]);
        $insertMovement->execute([
            $ingredientId,
            $orderId,
            $orderItemId,
            'restoration',
            $restoreQuantity,
            $restoreQuantity,
            $note,
            $userId,
        ]);
    }

    return $anyRestored;
}
