<?php
// Port 1:1 de apps/web/src/lib/trpc/routers/tables.ts

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/pricing.php';
require_once __DIR__ . '/inventory.php';

class TablesException extends RuntimeException {}

function fetch_order_with_items(int $orderId): ?array {
    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();
    if (!$order) {
        return null;
    }

    $stmt = $pdo->prepare(
        'SELECT oi.id, oi.product_id, oi.quantity, oi.price, p.name AS product_name, p.category AS product_category
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ?
         ORDER BY oi.id ASC'
    );
    $stmt->execute([$orderId]);
    $order['orderItems'] = $stmt->fetchAll();

    return $order;
}

/**
 * Equivalente a getOpenTable(userId, orderId) de tables.ts.
 * @throws TablesException si la comanda no existe o ya fue cerrada
 */
function get_open_table(string $userId, int $orderId): array {
    $pdo = db();
    $stmt = $pdo->prepare(
        "SELECT * FROM orders WHERE id = ? AND user_uid = ? AND status = 'pending' AND table_name IS NOT NULL"
    );
    $stmt->execute([$orderId, $userId]);
    $order = $stmt->fetch();

    if (!$order) {
        throw new TablesException('La comanda no existe o ya fue cerrada.');
    }

    $stmt = $pdo->prepare(
        'SELECT oi.id, oi.product_id, oi.quantity, oi.price, p.name AS product_name, p.category AS product_category
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ?
         ORDER BY oi.id ASC'
    );
    $stmt->execute([$orderId]);
    $order['orderItems'] = $stmt->fetchAll();

    return $order;
}

/** Lista todas las mesas abiertas (orders pendientes con table_name) de un usuario. */
function list_open_tables(string $userId): array {
    $pdo = db();
    $stmt = $pdo->prepare(
        "SELECT * FROM orders WHERE user_uid = ? AND status = 'pending' AND table_name IS NOT NULL ORDER BY created_at ASC"
    );
    $stmt->execute([$userId]);
    $orders = $stmt->fetchAll();

    foreach ($orders as &$order) {
        $stmt2 = $pdo->prepare(
            'SELECT oi.id, oi.product_id, oi.quantity, oi.price, p.name AS product_name, p.category AS product_category
             FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = ? ORDER BY oi.id ASC'
        );
        $stmt2->execute([$order['id']]);
        $order['orderItems'] = $stmt2->fetchAll();
    }

    return $orders;
}

/** @throws TablesException si la mesa ya tiene una comanda abierta */
function open_table(string $userId, string $tableName, int $partySize = 1): int {
    $pdo = db();
    $stmt = $pdo->prepare(
        "SELECT id FROM orders WHERE user_uid = ? AND status = 'pending' AND table_name = ?"
    );
    $stmt->execute([$userId, $tableName]);
    if ($stmt->fetch()) {
        throw new TablesException('Esta mesa ya tiene una comanda abierta.');
    }

    $stmt = $pdo->prepare(
        "INSERT INTO orders (table_name, total_amount, user_uid, status, party_size) VALUES (?, 0, ?, 'pending', ?)"
    );
    $stmt->execute([$tableName, $userId, $partySize]);

    return (int) $pdo->lastInsertId();
}

function set_table_party_size(string $userId, int $orderId, int $partySize): void {
    get_open_table($userId, $orderId); // valida que exista y esté abierta
    $stmt = db()->prepare('UPDATE orders SET party_size = ? WHERE id = ?');
    $stmt->execute([$partySize, $orderId]);
}

/**
 * Equivalente a addItem de tables.ts. Devuelve la orden actualizada con items.
 * @throws TablesException en cualquier validación fallida
 */
function add_item_to_table(string $userId, int $orderId, int $productId, int $quantity = 1): array {
    $openTable = get_open_table($userId, $orderId);

    // Se calcula fuera de la transacción (igual que en el original).
    $settingsRow = get_or_create_pricing_settings($userId);
    $settings = to_settings_values($settingsRow);
    $openTablesCount = count_open_tables($userId);

    $pdo = db();
    $pdo->beginTransaction();

    try {
        $stmt = $pdo->prepare('SELECT * FROM products WHERE id = ? AND user_uid = ?');
        $stmt->execute([$productId, $userId]);
        $product = $stmt->fetch();

        if (!$product) {
            throw new TablesException('El producto no existe.');
        }

        $unitPrice = (int) $product['price'];

        if (is_alcohol_category($product['category'])) {
            $existingAlcoholUnits = 0;
            foreach ($openTable['orderItems'] as $item) {
                if (is_alcohol_category($item['product_category'])) {
                    $existingAlcoholUnits += (int) $item['quantity'];
                }
            }

            $result = compute_alcohol_price((int) $product['price'], [
                'openTables' => $openTablesCount,
                'alcoholUnitsForParty' => $existingAlcoholUnits + $quantity,
                'partySize' => (int) $openTable['party_size'],
                'settings' => $settings,
            ]);

            $unitPrice = $result['price'];
        }

        $stmt = $pdo->prepare('SELECT * FROM order_items WHERE order_id = ? AND product_id = ?');
        $stmt->execute([$orderId, $productId]);
        $existing = $stmt->fetch();

        if ($existing) {
            $previousLineTotal = (int) $existing['price'] * (int) $existing['quantity'];
            $newQuantity = (int) $existing['quantity'] + $quantity;
            $newLineTotal = $unitPrice * $newQuantity;
            $amountDelta = $newLineTotal - $previousLineTotal;

            $stmt = $pdo->prepare('UPDATE order_items SET quantity = ?, price = ? WHERE id = ?');
            $stmt->execute([$newQuantity, $unitPrice, $existing['id']]);
            $orderItemId = (int) $existing['id'];
        } else {
            $amountDelta = $unitPrice * $quantity;
            $stmt = $pdo->prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
            $stmt->execute([$orderId, $productId, $quantity, $unitPrice]);
            $orderItemId = (int) $pdo->lastInsertId();
        }

        $recipeManagedProductIds = consume_recipe_ingredients($userId, $orderId, [[
            'orderItemId' => $orderItemId,
            'productId' => $productId,
            'quantity' => $quantity,
        ]]);

        if (!in_array($productId, $recipeManagedProductIds, true)) {
            if ((int) $product['in_stock'] < $quantity) {
                throw new TablesException('No hay inventario suficiente para este producto.');
            }
            $stmt = $pdo->prepare('UPDATE products SET in_stock = in_stock - ? WHERE id = ?');
            $stmt->execute([$quantity, $productId]);
        }

        $stmt = $pdo->prepare('UPDATE orders SET total_amount = total_amount + ? WHERE id = ?');
        $stmt->execute([$amountDelta, $orderId]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    return get_open_table($userId, $orderId);
}

/** @throws TablesException */
function remove_item_from_table(string $userId, int $orderId, int $itemId): array {
    get_open_table($userId, $orderId);

    $pdo = db();
    $pdo->beginTransaction();

    try {
        $stmt = $pdo->prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?');
        $stmt->execute([$itemId, $orderId]);
        $item = $stmt->fetch();

        if (!$item) {
            throw new TablesException('Producto no encontrado.');
        }

        $recipeManaged = restore_order_item_ingredients($userId, $orderId, (int) $item['id'], 'Producto retirado de la comanda');

        $stmt = $pdo->prepare('DELETE FROM order_items WHERE id = ?');
        $stmt->execute([$item['id']]);

        if ($item['product_id'] && !$recipeManaged) {
            $stmt = $pdo->prepare('UPDATE products SET in_stock = in_stock + ? WHERE id = ?');
            $stmt->execute([$item['quantity'], $item['product_id']]);
        }

        $stmt = $pdo->prepare('UPDATE orders SET total_amount = total_amount - ? WHERE id = ?');
        $stmt->execute([(int) $item['price'] * (int) $item['quantity'], $orderId]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    return get_open_table($userId, $orderId);
}

/** @throws TablesException */
function close_table(string $userId, int $orderId, int $paymentMethodId): void {
    $order = get_open_table($userId, $orderId);

    if (empty($order['orderItems'])) {
        throw new TablesException('Agrega al menos un producto antes de cerrar la mesa.');
    }

    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM payment_methods WHERE id = ?');
    $stmt->execute([$paymentMethodId]);
    $method = $stmt->fetch();
    if (!$method) {
        throw new TablesException('Selecciona un método de pago válido.');
    }

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            "UPDATE orders SET status = 'completed', closed_at = NOW() WHERE id = ? AND user_uid = ?"
        );
        $stmt->execute([$orderId, $userId]);

        $description = 'Cierre de ' . ($order['table_name'] ?: ('comanda #' . $order['id']));
        $stmt = $pdo->prepare(
            "INSERT INTO transactions (order_id, payment_method_id, amount, user_uid, status, category, type, description)
             VALUES (?, ?, ?, ?, 'completed', 'selling', 'income', ?)"
        );
        $stmt->execute([$orderId, $paymentMethodId, $order['total_amount'], $userId, $description]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}
