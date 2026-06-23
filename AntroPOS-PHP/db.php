<?php
require_once __DIR__ . '/config.php';

/**
 * Conexión PDO compartida (singleton). MySQL equivalente al `db` de Drizzle.
 */
function db(): PDO {
    static $pdo = null;

    if ($pdo === null) {
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=%s',
            DB_HOST,
            DB_NAME,
            DB_CHARSET
        );

        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            if (APP_DEBUG) {
                die('Error de conexión a la base de datos: ' . htmlspecialchars($e->getMessage()));
            }
            die('Error de conexión a la base de datos.');
        }
    }

    return $pdo;
}

/**
 * Genera un UUID v4 (usado como id de usuario, similar al uid de Better Auth).
 */
function generate_uuid(): string {
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}
