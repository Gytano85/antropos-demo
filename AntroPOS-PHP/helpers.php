<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';

/** Cents -> "12.34" */
function money(int $cents): string {
    return number_format($cents / 100, 2, '.', ',');
}

/** "12.34" / 12.34 -> 1234 (cents), redondeado */
function to_cents($amount): int {
    return (int) round(((float) $amount) * 100);
}

function redirect(string $path): void {
    header('Location: ' . $path);
    exit;
}

function e(?string $value): string {
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function csrf_token(): string {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrf_field(): string {
    return '<input type="hidden" name="csrf_token" value="' . e(csrf_token()) . '">';
}

function csrf_check(): void {
    $token = $_POST['csrf_token'] ?? '';
    if (!is_string($token) || !hash_equals($_SESSION['csrf_token'] ?? '', $token)) {
        http_response_code(400);
        die('Token CSRF inválido. Recarga la página e inténtalo de nuevo.');
    }
}

function flash_set(string $type, string $message): void {
    $_SESSION['flash'] = ['type' => $type, 'message' => $message];
}

function flash_get(): ?array {
    if (empty($_SESSION['flash'])) {
        return null;
    }
    $flash = $_SESSION['flash'];
    unset($_SESSION['flash']);
    return $flash;
}

/** Sólo acepta POST; si no, 405. Usar al inicio de handlers de escritura. */
function require_post(): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        die('Método no permitido.');
    }
    csrf_check();
}

function format_datetime(?string $value): string {
    if (!$value) {
        return '—';
    }
    try {
        $dt = new DateTime($value);
        return $dt->format('d/m/Y H:i');
    } catch (Exception $e) {
        return $value;
    }
}
