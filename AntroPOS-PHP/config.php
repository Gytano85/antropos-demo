<?php
// AntroPOS — configuración de base de datos y app.
// Reemplaza estos valores por los de tu hosting (Hostinger: hPanel > Bases de datos MySQL).

define('DB_HOST', 'localhost');
define('DB_NAME', 'u886410070_Gytano');
define('DB_USER', 'u886410070_Gytano');
define('DB_PASS', 'Gytano061405#');
define('DB_CHARSET', 'utf8mb4');

// Nombre de la app, usado en títulos de página y comprobantes.
define('APP_NAME', 'AntroPOS');

// Zona horaria para timestamps mostrados en la UI.
date_default_timezone_set('America/Mexico_City');

// Activar para ver errores PHP durante desarrollo local. Desactivar en producción.
define('APP_DEBUG', true);

if (APP_DEBUG) {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(0);
    ini_set('display_errors', '0');
}
