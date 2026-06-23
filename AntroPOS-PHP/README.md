# AntroPOS — versión PHP + MySQL

Puerto completo del sistema (paridad funcional) desde Next.js/TypeScript a PHP plano + MySQL, para correr en WAMP o en cualquier hosting compartido con PHP/MySQL (Hostinger incluido).

## 1. Instalación

1. Crea una base de datos MySQL (por ejemplo `antropos`).
2. Importa el esquema:
   ```
   mysql -u root antropos < schema.sql
   ```
3. Importa los datos de demostración (clientes, productos, recetas, pedidos y gastos de ejemplo) — **una sola vez, sobre base de datos recién creada**:
   ```
   mysql -u root antropos < seed.sql
   ```
4. Edita `config.php` con tus credenciales reales de MySQL (`DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`).
5. Apunta el document root al folder `AntroPOS-PHP` (o copia su contenido a `htdocs`/`public_html`).

## 2. Acceso de prueba

Después de correr `seed.sql` ya existe una cuenta de demostración, igual que en la app original:

- **Email:** `test@example.com`
- **Contraseña:** `test1234`

En `login.php` hay un botón **"Usar credenciales de prueba"** que llena estos datos automáticamente, igual que el botón "Fill Demo" del original.

También puedes crear tu propia cuenta desde `signup.php`.

## 3. Qué incluye el seed de demostración

- 3 métodos de pago: Tarjeta de crédito, Tarjeta de débito, Efectivo.
- 20 clientes.
- 31 productos en las 6 categorías reales del sistema: `cervezas`, `cocteles`, `botellas` (con precio dinámico de alcohol), `sin_alcohol`, `snacks`, `servicios`.
- 15 ingredientes y 6 recetas de coctelería (Mojito, Margarita, Paloma, Carajillo, Gin Tonic, Azulito) con su consumo de inventario por receta.
- 30 pedidos demo (mesas/ventas cerradas, pendientes y canceladas) con sus transacciones de venta.
- 20 transacciones de gasto en las categorías renta, servicios, inventario, personal, entretenimiento y mantenimiento.

(El sembrado de ciudades vía API de IBGE del original no se replicó: depende de un servicio externo y no es necesario para operar el sistema.)

## 4. Diseño visual

- `login.php` y `signup.php` replican el tema claro (shadcn/Tailwind) del original: mismos colores, tipografía, copy en español y el botón de credenciales de demo.
- El panel de administración (`admin/*.php`) usa Bootstrap 5 solo como motor de JS (modales, dropdowns, offcanvas), pero su apariencia está sobreescrita por `assets/admin-theme.css` con los mismos tokens de color/radio/sombra de shadcn. La estructura del shell (`partials/admin_header.php`) replica el original: header superior fijo y claro con botón de menú, título dinámico de página y dropdown de avatar (Mi cuenta / Configuración / Soporte / Cerrar sesión), más una barra lateral angosta solo-iconos (colapsable/expandible) en vez del menú oscuro con secciones de antes.

## 5. Funcionalidad portada

Toda la lógica de negocio del original está portada 1:1: precios dinámicos por categoría de alcohol, manejo de mesas/comandas, venta rápida de mostrador (POS), control de inventario y recetas, reportes fiscales, reabastecimiento, auditoría de inventario y facturación.
