<?php
// Venta rápida de mostrador (POS) — no usa mesa, cobra y cierra en un solo paso.
// Reutiliza el mismo motor de precio dinámico de alcohol e inventario que tables.php.

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/pricing.php';
require_once __DIR__ . '/inventory.php';
require_once __DIR__ . '/tables.php'; // TablesException

/**
 * @param string $userId
 * @param int|null $customerId
 * @param array $items lista de ['product_id'=>int, 'quantity'=>int]
 * @param int $paymentMethodId
 * @return array ['order_id'=>int, 'total_amount'=>int]
 * @throws TablesException
 */
function create_pos_sale(string $userId, ?int $customerId, array $items, int $paymentMethodId): array {
    if (empty($items)) {
        throw new TablesException('Agrega al menos un producto a la venta.');
    }

    $pdo = db();

    $stmt = $pdo->prepare('SELECT * FROM payment_methods WHERE id = ?');
    $stmt->execute([$paymentMethodId]);
    if (!$stmt->fetch()) {
        throw new TablesException('Selecciona un método de pago válido.');
    }

    $settingsRow = get_or_create_pricing_settings($userId);
    $settings = to_settings_values($settingsRow);
    $openTablesCount = count_open_tables($userId);

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            "INSERT INTO orders (customer_id, table_name, total_amount, user_uid, status, party_size)
             VALUES (?, NULL, 0, ?, 'pending', 1)"
        );
        $stmt->execute([$customerId, $userId]);
        $orderId = (int) $pdo->lastInsertId();

        $totalAmount = 0;
        $alcoholUnitsSoFar = 0;

        foreach ($items as $line) {
            $productId = (int) $line['product_id'];
            $quantity = max(1, (int) $line['quantity']);

            $stmt = $pdo->prepare('SELECT * FROM products WHERE id = ? AND user_uid = ?');
            $stmt->execute([$productId, $userId]);
            $product = $stmt->fetch();

            if (!$product) {
                throw new TablesException('El producto no existe.');
            }

            $unitPrice = (int) $product['price'];

            if (is_alcohol_category($product['category'])) {
                $alcoholUnitsSoFar += $quantity;
                $result = compute_alcohol_price((int) $product['price'], [
                    'openTables' => $openTablesCount,
                    'alcoholUnitsForParty' => $alcoholUnitsSoFar,
                    'partySize' => 1,
                    'settings' => $settings,
                ]);
                $unitPrice = $result['price'];
            }

            $stmt = $pdo->prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
            $stmt->execute([$orderId, $productId, $quantity, $unitPrice]);
            $orderItemId = (int) $pdo->lastInsertId();

            $recipeManagedProductIds = consume_recipe_ingredients($userId, $orderId, [[
                'orderItemId' => $orderItemId,
                'productId' => $productId,
                'quantity' => $quantity,
            ]]);

            if (!in_array($productId, $recipeManagedProductIds, true)) {
                if ((int) $product['in_stock'] < $quantity) {
                    throw new TablesException(sprintf('No hay inventario suficiente de "%s".', $product['name']));
                }
                $stmt = $pdo->prepare('UPDATE products SET in_stock = in_stock - ? WHERE id = ?');
                $stmt->execute([$quantity, $productId]);
            }

            $totalAmount += $unitPrice * $quantity;
        }

        $stmt = $pdo->prepare(
            "UPDATE orders SET total_amount = ?, status = 'completed', closed_at = NOW() WHERE id = ?"
        );
        $stmt->execute([$totalAmount, $orderId]);

        $stmt = $pdo->prepare(
            "INSERT INTO transactions (order_id, payment_method_id, amount, user_uid, status, category, type, description)
             VALUES (?, ?, ?, ?, 'completed', 'selling', 'income', ?)"
        );
        $stmt->execute([$orderId, $paymentMethodId, $totalAmount, $userId, 'Venta de mostrador #' . $orderId]);

        $pdo->commit();

        return ['order_id' => $orderId, 'total_amount' => $totalAmount];
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}
