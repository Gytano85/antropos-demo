<?php
require_once __DIR__ . '/db.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function current_user(): ?array {
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    static $cached = null;
    if ($cached !== null && $cached['id'] === $_SESSION['user_id']) {
        return $cached;
    }
    $stmt = db()->prepare('SELECT id, name, email, created_at FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user) {
        unset($_SESSION['user_id']);
        return null;
    }
    $cached = $user;
    return $user;
}

function current_user_id(): ?string {
    $user = current_user();
    return $user ? $user['id'] : null;
}

/** Llamar al inicio de cualquier página que requiera sesión iniciada. */
function require_login(): array {
    $user = current_user();
    if (!$user) {
        redirect('/login.php');
    }
    return $user;
}

function attempt_login(string $email, string $password): bool {
    $stmt = db()->prepare('SELECT id, password_hash FROM users WHERE email = ?');
    $stmt->execute([trim($email)]);
    $row = $stmt->fetch();
    if (!$row || !password_verify($password, $row['password_hash'])) {
        return false;
    }
    session_regenerate_id(true);
    $_SESSION['user_id'] = $row['id'];
    return true;
}

/** @return string|null id del nuevo usuario, o null si el email ya existe */
function create_user(string $name, string $email, string $password): ?string {
    $email = trim($email);
    $stmt = db()->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        return null;
    }

    $id = generate_uuid();
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = db()->prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)');
    $stmt->execute([$id, $name, $email, $hash]);

    return $id;
}

function logout(): void {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
    }
    session_destroy();
}
