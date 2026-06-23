<?php
// Port 1:1 de apps/web/src/lib/pricing/dynamic-pricing.ts y settings.ts

require_once __DIR__ . '/../db.php';

const ALCOHOL_CATEGORIES = ['cervezas', 'cocteles', 'botellas'];

function is_alcohol_category(?string $category): bool {
    if (!$category) {
        return false;
    }
    return in_array($category, ALCOHOL_CATEGORIES, true);
}

function default_pricing_settings(): array {
    return [
        'enabled' => true,
        'capacity' => 15,
        'min_adjustment_pct' => -15,
        'max_adjustment_pct' => 25,
        'drunk_threshold' => 3.0,
        'drunk_surge_pct' => 20,
    ];
}

function pricing_clamp(float $value, float $min, float $max): float {
    return min($max, max($min, $value));
}

/** Ratio de ocupación entre 0 (vacío) y 1 (lleno o más) */
function pricing_occupancy_ratio(int $openTables, int $capacity): float {
    if ($capacity <= 0) {
        return $openTables > 0 ? 1.0 : 0.0;
    }
    return pricing_clamp($openTables / $capacity, 0.0, 1.0);
}

/** Interpolación lineal entre min% (vacío) y max% (lleno) */
function pricing_occupancy_adjustment_pct(float $ratio, array $settings): float {
    return $settings['min_adjustment_pct']
        + ($settings['max_adjustment_pct'] - $settings['min_adjustment_pct']) * $ratio;
}

/** ¿El consumo de alcohol por persona en esta mesa sugiere posible exceso? */
function pricing_is_likely_intoxicated(float $alcoholUnits, int $partySize, array $settings): bool {
    if ($partySize <= 0) {
        return false;
    }
    return ($alcoholUnits / $partySize) > $settings['drunk_threshold'];
}

/**
 * @param int $basePrice precio base en centavos
 * @param array $params { openTables:int, alcoholUnitsForParty:float, partySize:int, settings:array }
 * @return array { price:int, occupancy_adjustment_pct:int, intoxication_flag:bool, total_adjustment_pct:int }
 */
function compute_alcohol_price(int $basePrice, array $params): array {
    $settings = $params['settings'];

    if (!$settings['enabled']) {
        return [
            'price' => $basePrice,
            'occupancy_adjustment_pct' => 0,
            'intoxication_flag' => false,
            'total_adjustment_pct' => 0,
        ];
    }

    $ratio = pricing_occupancy_ratio((int) $params['openTables'], (int) $settings['capacity']);
    $occupancyAdjustmentPct = pricing_occupancy_adjustment_pct($ratio, $settings);
    $intoxicationFlag = pricing_is_likely_intoxicated(
        (float) $params['alcoholUnitsForParty'],
        (int) $params['partySize'],
        $settings
    );

    $occupancyMultiplier = 1 + $occupancyAdjustmentPct / 100;
    $drunkMultiplier = $intoxicationFlag ? 1 + $settings['drunk_surge_pct'] / 100 : 1;
    $totalMultiplier = $occupancyMultiplier * $drunkMultiplier;

    $price = max(0, (int) round($basePrice * $totalMultiplier));
    $totalAdjustmentPct = (int) round(($totalMultiplier - 1) * 100);

    return [
        'price' => $price,
        'occupancy_adjustment_pct' => (int) round($occupancyAdjustmentPct),
        'intoxication_flag' => $intoxicationFlag,
        'total_adjustment_pct' => $totalAdjustmentPct,
    ];
}

/** Obtiene (o crea con valores por defecto) la fila de pricing_settings de un usuario. */
function get_or_create_pricing_settings(string $userId): array {
    $stmt = db()->prepare('SELECT * FROM pricing_settings WHERE user_uid = ?');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();

    if ($row) {
        return $row;
    }

    $defaults = default_pricing_settings();
    $stmt = db()->prepare(
        'INSERT INTO pricing_settings (user_uid, enabled, capacity, min_adjustment_pct, max_adjustment_pct, drunk_threshold, drunk_surge_pct)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $userId,
        $defaults['enabled'] ? 1 : 0,
        $defaults['capacity'],
        $defaults['min_adjustment_pct'],
        $defaults['max_adjustment_pct'],
        $defaults['drunk_threshold'],
        $defaults['drunk_surge_pct'],
    ]);

    $stmt = db()->prepare('SELECT * FROM pricing_settings WHERE user_uid = ?');
    $stmt->execute([$userId]);
    return $stmt->fetch();
}

/** Normaliza una fila de la tabla pricing_settings a los tipos usados por compute_alcohol_price(). */
function to_settings_values(array $row): array {
    return [
        'enabled' => (bool) $row['enabled'],
        'capacity' => (int) $row['capacity'],
        'min_adjustment_pct' => (int) $row['min_adjustment_pct'],
        'max_adjustment_pct' => (int) $row['max_adjustment_pct'],
        'drunk_threshold' => (float) $row['drunk_threshold'],
        'drunk_surge_pct' => (int) $row['drunk_surge_pct'],
    ];
}

/** Cuenta cuántas mesas (orders pendientes con table_name) tiene abiertas un usuario. */
function count_open_tables(string $userId): int {
    $stmt = db()->prepare(
        "SELECT COUNT(*) AS c FROM orders WHERE user_uid = ? AND status = 'pending' AND table_name IS NOT NULL"
    );
    $stmt->execute([$userId]);
    return (int) $stmt->fetch()['c'];
}
