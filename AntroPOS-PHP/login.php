<?php
require_once __DIR__ . '/helpers.php';

if (current_user()) {
    redirect('/admin/dashboard.php');
}

$error = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $email = trim($_POST['email'] ?? '');
    $password = (string) ($_POST['password'] ?? '');

    if ($email === '' || $password === '') {
        $error = 'Ingresa tu email y contraseña.';
    } elseif (attempt_login($email, $password)) {
        redirect('/admin/dashboard.php');
    } else {
        $error = 'Email o contraseña incorrectos.';
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Iniciar sesión · <?= e(APP_NAME) ?></title>
<style>
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --radius: 0.5rem;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .auth-wrap { width: 100%; max-width: 28rem; padding: 1.5rem; }
  .auth-head { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem; }
  .auth-head svg { width: 2.5rem; height: 2.5rem; }
  .auth-head h2 { font-size: 1.5rem; font-weight: 700; margin: 0; }
  .auth-head p { font-size: 0.875rem; color: hsl(var(--muted-foreground)); margin: 0; }
  .auth-card {
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    padding: 1.5rem;
    box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.08);
  }
  .form-group { margin-bottom: 1rem; }
  .form-group label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.4rem; }
  .form-group input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    font-size: 0.9rem;
  }
  .form-group input:focus { outline: 2px solid hsl(var(--primary) / 0.3); border-color: hsl(var(--primary)); }
  .btn {
    width: 100%;
    padding: 0.55rem 0.75rem;
    border-radius: var(--radius);
    font-size: 0.9rem;
    font-weight: 500;
    border: 1px solid transparent;
    cursor: pointer;
    display: block;
    text-align: center;
    text-decoration: none;
  }
  .btn-primary { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); margin-bottom: 0.75rem; }
  .btn-outline { background: transparent; color: hsl(var(--foreground)); border-color: hsl(var(--border)); margin-bottom: 1rem; }
  .auth-foot { text-align: center; font-size: 0.875rem; color: hsl(var(--muted-foreground)); }
  .auth-foot a { color: hsl(var(--primary)); text-decoration: none; }
  .auth-foot a:hover { text-decoration: underline; }
  .alert-error {
    background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
    border-radius: var(--radius); padding: 0.6rem 0.8rem; font-size: 0.875rem; margin-bottom: 1rem;
  }
</style>
</head>
<body>
<div class="auth-wrap">
  <div class="auth-head">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>
    <h2>Bienvenido de vuelta</h2>
    <p>Ingresa tus credenciales para acceder a tu cuenta.</p>
  </div>
  <div class="auth-card">
    <?php if ($error): ?>
      <div class="alert-error"><?= e($error) ?></div>
    <?php endif; ?>
    <form method="post" id="loginForm">
      <?= csrf_field() ?>
      <div class="form-group">
        <label for="email">Correo</label>
        <input type="email" id="email" name="email" placeholder="nombre@ejemplo.com" required autocomplete="email" value="<?= e($_POST['email'] ?? '') ?>">
      </div>
      <div class="form-group">
        <label for="password">Contraseña</label>
        <input type="password" id="password" name="password" required autocomplete="current-password">
      </div>
      <button type="submit" class="btn btn-primary">Iniciar sesión</button>
      <button type="button" class="btn btn-outline" onclick="fillDemo()">Usar credenciales de prueba</button>
      <p class="auth-foot">¿No tienes una cuenta? <a href="/signup.php">Regístrate</a></p>
    </form>
  </div>
</div>
<script>
function fillDemo() {
  document.getElementById('email').value = 'test@example.com';
  document.getElementById('password').value = 'test1234';
}
</script>
</body>
</html>
