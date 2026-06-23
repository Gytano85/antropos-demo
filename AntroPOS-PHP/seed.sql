-- AntroPOS — datos de demostración (idénticos en espíritu a apps/web/src/lib/db/seed.ts)
-- Ejecutar UNA SOLA VEZ, justo después de importar schema.sql en una base de datos recién creada.
SET NAMES utf8mb4;

-- ── Métodos de pago ─────────────────────────────────────────────────────
INSERT INTO payment_methods (name) VALUES
  ('Tarjeta de crédito'),
  ('Tarjeta de débito'),
  ('Efectivo')
ON DUPLICATE KEY UPDATE name = name;

-- ── Usuario demo ────────────────────────────────────────────────────────
-- email: test@example.com  /  contraseña: test1234
INSERT INTO users (id, name, email, password_hash) VALUES
  ('33f6daa9-fd16-4f8e-a07a-0e97ec3db4cb', 'Test User', 'test@example.com', '$2b$10$S6MLusPWIZZkRihgutgqYe1EEmIeVdQpZsj/q4zDRlFNp.CUqfveK')
ON DUPLICATE KEY UPDATE id = id;
SET @uid = (SELECT id FROM users WHERE email = 'test@example.com');

-- ── Clientes ────────────────────────────────────────────────────────────
INSERT INTO customers (name, email, phone, user_uid, status) VALUES
  ('Sofía Hernández', 'sofia.hernandez@example.com', '55 1010 2020', @uid, 'inactive'),
  ('Diego Ramírez', 'diego.ramirez@example.com', '55 1111 3030', @uid, 'active'),
  ('Valeria Torres', 'valeria.torres@example.com', '55 1212 4040', @uid, 'active'),
  ('Mateo García', 'mateo.garcia@example.com', '55 1313 5050', @uid, 'active'),
  ('Camila Flores', 'camila.flores@example.com', '55 1414 6060', @uid, 'active'),
  ('Sebastián Cruz', 'sebastian.cruz@example.com', '55 1515 7070', @uid, 'active'),
  ('Renata Morales', 'renata.morales@example.com', '55 1616 8080', @uid, 'inactive'),
  ('Emiliano Reyes', 'emiliano.reyes@example.com', '55 1717 9090', @uid, 'active'),
  ('Regina Vargas', 'regina.vargas@example.com', '55 1818 1010', @uid, 'active'),
  ('Santiago Mendoza', 'santiago.mendoza@example.com', '55 1919 2020', @uid, 'active'),
  ('Daniela Castillo', 'daniela.castillo@example.com', '55 2020 3030', @uid, 'active'),
  ('Leonardo Rojas', 'leonardo.rojas@example.com', '55 2121 4040', @uid, 'active'),
  ('Mariana Navarro', 'mariana.navarro@example.com', '55 2222 5050', @uid, 'inactive'),
  ('Alejandro Silva', 'alejandro.silva@example.com', '55 2323 6060', @uid, 'active'),
  ('Natalia Romero', 'natalia.romero@example.com', '55 2424 7070', @uid, 'active'),
  ('Rodrigo Aguilar', 'rodrigo.aguilar@example.com', '55 2525 8080', @uid, 'active'),
  ('Ximena Medina', 'ximena.medina@example.com', '55 2626 9090', @uid, 'active'),
  ('Fernando Luna', 'fernando.luna@example.com', '55 2727 1010', @uid, 'active'),
  ('Paola Campos', 'paola.campos@example.com', '55 2828 2020', @uid, 'inactive'),
  ('Javier Ortega', 'javier.ortega@example.com', '55 2929 3030', @uid, 'active');

-- ── Productos ───────────────────────────────────────────────────────────
INSERT INTO products (name, description, price, in_stock, user_uid, category) VALUES
  ('Corona Extra', 'Cerveza clara, botella de 355 ml', 8500, 144, @uid, 'cervezas'),
  ('Modelo Especial', 'Cerveza tipo pilsner, botella de 355 ml', 9000, 120, @uid, 'cervezas'),
  ('Victoria', 'Cerveza ámbar, botella de 355 ml', 8500, 96, @uid, 'cervezas'),
  ('Michelob Ultra', 'Cerveza ligera, botella de 355 ml', 9500, 72, @uid, 'cervezas'),
  ('Heineken', 'Cerveza lager, botella de 355 ml', 10000, 84, @uid, 'cervezas'),
  ('XX Lager', 'Cerveza lager, botella de 355 ml', 9000, 78, @uid, 'cervezas'),
  ('Mojito', 'Ron blanco, hierbabuena, limón y agua mineral', 16000, 60, @uid, 'cocteles'),
  ('Margarita', 'Tequila, licor de naranja y limón', 17000, 60, @uid, 'cocteles'),
  ('Paloma', 'Tequila, toronja, limón y agua mineral', 16000, 70, @uid, 'cocteles'),
  ('Carajillo', 'Licor 43 y espresso', 19000, 45, @uid, 'cocteles'),
  ('Gin Tonic', 'Ginebra, agua tónica y cítricos', 19000, 50, @uid, 'cocteles'),
  ('Azulito', 'Vodka, bebida energética y mezcla cítrica', 18000, 55, @uid, 'cocteles'),
  ('Tequila Don Julio 70', 'Botella de 700 ml con servicio de mezcladores', 320000, 18, @uid, 'botellas'),
  ('Tequila Maestro Dobel Diamante', 'Botella de 750 ml con servicio de mezcladores', 290000, 14, @uid, 'botellas'),
  ('Whisky Buchanan\'s 12', 'Botella de 750 ml con servicio de mezcladores', 280000, 16, @uid, 'botellas'),
  ('Whisky Johnnie Walker Black', 'Botella de 750 ml con servicio de mezcladores', 260000, 12, @uid, 'botellas'),
  ('Vodka Grey Goose', 'Botella de 750 ml con servicio de mezcladores', 270000, 10, @uid, 'botellas'),
  ('Ron Zacapa 23', 'Botella de 750 ml con servicio de mezcladores', 300000, 8, @uid, 'botellas'),
  ('Agua Natural', 'Botella de agua de 600 ml', 5000, 120, @uid, 'sin_alcohol'),
  ('Agua Mineral', 'Botella de agua mineral de 355 ml', 6000, 96, @uid, 'sin_alcohol'),
  ('Refresco', 'Coca-Cola, Sprite o agua tónica', 6000, 150, @uid, 'sin_alcohol'),
  ('Red Bull', 'Bebida energética de 250 ml', 9000, 72, @uid, 'sin_alcohol'),
  ('Limonada Mineral', 'Limón natural, jarabe y agua mineral', 8500, 50, @uid, 'sin_alcohol'),
  ('Papas a la Francesa', 'Orden de papas con aderezo de la casa', 11000, 40, @uid, 'snacks'),
  ('Nachos con Queso', 'Totopos, queso, jalapeños y pico de gallo', 14000, 35, @uid, 'snacks'),
  ('Alitas BBQ', 'Orden de 10 alitas con vegetales', 19000, 30, @uid, 'snacks'),
  ('Mini Hamburguesas', 'Tres mini hamburguesas con papas', 21000, 25, @uid, 'snacks'),
  ('Tabla de Carnes Frías', 'Selección de carnes frías, quesos y aceitunas', 28000, 18, @uid, 'snacks'),
  ('Cover General', 'Acceso general al evento', 20000, 300, @uid, 'servicios'),
  ('Cover Evento Especial', 'Acceso para noche temática o artista invitado', 35000, 180, @uid, 'servicios'),
  ('Reservación Mesa VIP', 'Reserva de mesa en zona VIP', 150000, 12, @uid, 'servicios'),
  ('Servicio de Mezcladores', 'Hielo, refrescos, agua mineral y cítricos', 50000, 50, @uid, 'servicios');

-- ── Ingredientes ────────────────────────────────────────────────────────
INSERT INTO ingredients (name, unit, stock_quantity, package_size, low_stock_threshold, user_uid) VALUES
  ('Ron blanco', 'ml', 9000, 750, 1500, @uid),
  ('Tequila blanco', 'ml', 12000, 750, 2250, @uid),
  ('Licor de naranja', 'ml', 4500, 750, 750, @uid),
  ('Licor 43', 'ml', 4200, 700, 700, @uid),
  ('Ginebra', 'ml', 6000, 750, 1500, @uid),
  ('Vodka', 'ml', 6000, 750, 1500, @uid),
  ('Jugo de limón', 'ml', 6000, 1000, 1000, @uid),
  ('Jarabe simple', 'ml', 4000, 1000, 1000, @uid),
  ('Agua mineral para barra', 'ml', 18000, 355, 3550, @uid),
  ('Refresco de toronja', 'ml', 12000, 355, 3550, @uid),
  ('Agua tónica', 'ml', 12000, 355, 3550, @uid),
  ('Bebida energética', 'ml', 6000, 250, 1250, @uid),
  ('Espresso', 'ml', 4000, 1000, 500, @uid),
  ('Hierbabuena', 'g', 1200, 100, 200, @uid),
  ('Mezcla cítrica', 'ml', 5000, 1000, 1000, @uid);

-- ── Recetas de cocteles ─────────────────────────────────────────────────
-- Mojito
INSERT INTO recipes (product_id, user_uid) SELECT id, @uid FROM products WHERE name = 'Mojito' AND user_uid = @uid;
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 45 FROM ingredients WHERE name = 'Ron blanco' AND user_uid = @uid;
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 25 FROM ingredients WHERE name = 'Jugo de limón' AND user_uid = @uid;
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 15 FROM ingredients WHERE name = 'Jarabe simple' AND user_uid = @uid;
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 90 FROM ingredients WHERE name = 'Agua mineral para barra' AND user_uid = @uid;
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 8 FROM ingredients WHERE name = 'Hierbabuena' AND user_uid = @uid;

-- Margarita
INSERT INTO recipes (product_id, user_uid) SELECT id, @uid FROM products WHERE name = 'Margarita' AND user_uid = @uid;
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 45 FROM ingredients WHERE name = 'Tequila blanco' AND user_uid = @uid;
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 20 FROM ingredients WHERE name = 'Licor de naranja' AND user_uid = @uid;
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 25 FROM ingredients WHERE name = 'Jugo de limón' AND user_uid = @uid;

-- Paloma
INSERT INTO recipes (product_id, user_uid) SELECT id, @uid FROM products WHERE name = 'Paloma' AND user_uid = @uid;
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 45 FROM ingredients WHERE name = 'Tequila blanco' AND user_uid = @uid;
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 120 FROM ingredients WHERE name = 'Refresco de toronja' AND user_uid = @uid;
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 15 FROM ingredients WHERE name = 'Jugo de limón' AND user_uid = @uid;

-- Carajillo
INSERT INTO recipes (product_id, user_uid) SELECT id, @uid FROM products WHERE name = 'Carajillo' AND user_uid = @uid;
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 45 FROM ingredients WHERE name = 'Licor 43' AND user_uid = @uid;
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 45 FROM ingredients WHERE name = 'Espresso' AND user_uid = @uid;

-- Gin Tonic
INSERT INTO recipes (product_id, user_uid) SELECT id, @uid FROM products WHERE name = 'Gin Tonic' AND user_uid = @uid;
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 50 FROM ingredients WHERE name = 'Ginebra' AND user_uid = @uid;
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 150 FROM ingredients WHERE name = 'Agua tónica' AND user_uid = @uid;

-- Azulito
INSERT INTO recipes (product_id, user_uid) SELECT id, @uid FROM products WHERE name = 'Azulito' AND user_uid = @uid;
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 45 FROM ingredients WHERE name = 'Vodka' AND user_uid = @uid;
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 125 FROM ingredients WHERE name = 'Bebida energética' AND user_uid = @uid;
INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) SELECT @recipe_id, id, 30 FROM ingredients WHERE name = 'Mezcla cítrica' AND user_uid = @uid;

-- ── Pedidos demo (mesas ya cerradas) + transacciones de venta ──────────────
-- pedido demo #1
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 75000, @uid, 'completed', '2026-06-04 20:30:00', '2026-06-04 21:00:00' FROM customers WHERE email = 'javier.ortega@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 11000 FROM products WHERE name = 'Papas a la Francesa' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 14000 FROM products WHERE name = 'Nachos con Queso' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #1', @order_id, (SELECT id FROM payment_methods WHERE name = 'Tarjeta de débito'), 75000, @uid, 'income', 'selling', 'completed', '2026-06-04 21:05:00';

-- pedido demo #2
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 363000, @uid, 'completed', '2026-06-14 20:30:00', '2026-06-14 21:00:00' FROM customers WHERE email = 'sofia.hernandez@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 6000 FROM products WHERE name = 'Refresco' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 300000 FROM products WHERE name = 'Ron Zacapa 23' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 19000 FROM products WHERE name = 'Carajillo' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #2', @order_id, (SELECT id FROM payment_methods WHERE name = 'Efectivo'), 363000, @uid, 'income', 'selling', 'completed', '2026-06-14 21:05:00';

-- pedido demo #3
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 83000, @uid, 'completed', '2026-06-01 20:30:00', '2026-06-01 21:00:00' FROM customers WHERE email = 'alejandro.silva@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 28000 FROM products WHERE name = 'Tabla de Carnes Frías' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 9000 FROM products WHERE name = 'Modelo Especial' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #3', @order_id, (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 83000, @uid, 'income', 'selling', 'completed', '2026-06-01 21:05:00';

-- pedido demo #4
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 1220000, @uid, 'completed', '2026-05-15 20:30:00', '2026-05-15 21:00:00' FROM customers WHERE email = 'diego.ramirez@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 21000 FROM products WHERE name = 'Mini Hamburguesas' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 320000 FROM products WHERE name = 'Tequila Don Julio 70' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 290000 FROM products WHERE name = 'Tequila Maestro Dobel Diamante' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 9000 FROM products WHERE name = 'Red Bull' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #4', @order_id, (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 1220000, @uid, 'income', 'selling', 'completed', '2026-05-15 21:05:00';

-- pedido demo #5
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 6000, @uid, 'pending', '2026-06-08 20:30:00', NULL FROM customers WHERE email = 'sofia.hernandez@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 6000 FROM products WHERE name = 'Agua Mineral' AND user_uid = @uid;

-- pedido demo #6
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 827000, @uid, 'completed', '2026-05-11 20:30:00', '2026-05-11 21:00:00' FROM customers WHERE email = 'rodrigo.aguilar@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 8500 FROM products WHERE name = 'Victoria' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 270000 FROM products WHERE name = 'Vodka Grey Goose' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 8500 FROM products WHERE name = 'Corona Extra' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #6', @order_id, (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 827000, @uid, 'income', 'selling', 'completed', '2026-05-11 21:05:00';

-- pedido demo #7
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 34000, @uid, 'completed', '2026-05-14 20:30:00', '2026-05-14 21:00:00' FROM customers WHERE email = 'emiliano.reyes@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 17000 FROM products WHERE name = 'Margarita' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #7', @order_id, (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 34000, @uid, 'income', 'selling', 'completed', '2026-05-14 21:05:00';

-- pedido demo #8
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 38000, @uid, 'pending', '2026-05-27 20:30:00', NULL FROM customers WHERE email = 'camila.flores@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 8500 FROM products WHERE name = 'Limonada Mineral' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 21000 FROM products WHERE name = 'Mini Hamburguesas' AND user_uid = @uid;

-- pedido demo #9
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 1507000, @uid, 'completed', '2026-06-09 20:30:00', '2026-06-09 21:00:00' FROM customers WHERE email = 'renata.morales@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 9000 FROM products WHERE name = 'Modelo Especial' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 300000 FROM products WHERE name = 'Ron Zacapa 23' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 290000 FROM products WHERE name = 'Tequila Maestro Dobel Diamante' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #9', @order_id, (SELECT id FROM payment_methods WHERE name = 'Tarjeta de débito'), 1507000, @uid, 'income', 'selling', 'completed', '2026-06-09 21:05:00';

-- pedido demo #10
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 12000, @uid, 'completed', '2026-06-17 20:30:00', '2026-06-17 21:00:00' FROM customers WHERE email = 'alejandro.silva@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 6000 FROM products WHERE name = 'Agua Mineral' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #10', @order_id, (SELECT id FROM payment_methods WHERE name = 'Efectivo'), 12000, @uid, 'income', 'selling', 'completed', '2026-06-17 21:05:00';

-- pedido demo #11
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 20000, @uid, 'completed', '2026-05-29 20:30:00', '2026-05-29 21:00:00' FROM customers WHERE email = 'santiago.mendoza@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 10000 FROM products WHERE name = 'Heineken' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #11', @order_id, (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 20000, @uid, 'income', 'selling', 'completed', '2026-05-29 21:05:00';

-- pedido demo #12
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 40000, @uid, 'completed', '2026-06-11 20:30:00', '2026-06-11 21:00:00' FROM customers WHERE email = 'natalia.romero@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 20000 FROM products WHERE name = 'Cover General' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #12', @order_id, (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 40000, @uid, 'income', 'selling', 'completed', '2026-06-11 21:05:00';

-- pedido demo #13
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 379000, @uid, 'pending', '2026-06-13 20:30:00', NULL FROM customers WHERE email = 'camila.flores@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 19000 FROM products WHERE name = 'Gin Tonic' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 14000 FROM products WHERE name = 'Nachos con Queso' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 280000 FROM products WHERE name = 'Whisky Buchanan\'s 12' AND user_uid = @uid;

-- pedido demo #14
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 329500, @uid, 'pending', '2026-06-12 20:30:00', NULL FROM customers WHERE email = 'renata.morales@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 17000 FROM products WHERE name = 'Margarita' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 8500 FROM products WHERE name = 'Victoria' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 270000 FROM products WHERE name = 'Vodka Grey Goose' AND user_uid = @uid;

-- pedido demo #15
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 602000, @uid, 'completed', '2026-06-11 20:30:00', '2026-06-11 21:00:00' FROM customers WHERE email = 'javier.ortega@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 6000 FROM products WHERE name = 'Refresco' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 260000 FROM products WHERE name = 'Whisky Johnnie Walker Black' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 35000 FROM products WHERE name = 'Cover Evento Especial' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #15', @order_id, (SELECT id FROM payment_methods WHERE name = 'Efectivo'), 602000, @uid, 'income', 'selling', 'completed', '2026-06-11 21:05:00';

-- pedido demo #16
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 855000, @uid, 'completed', '2026-06-10 20:30:00', '2026-06-10 21:00:00' FROM customers WHERE email = 'leonardo.rojas@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 280000 FROM products WHERE name = 'Whisky Buchanan\'s 12' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 5000 FROM products WHERE name = 'Agua Natural' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #16', @order_id, (SELECT id FROM payment_methods WHERE name = 'Tarjeta de débito'), 855000, @uid, 'income', 'selling', 'completed', '2026-06-10 21:05:00';

-- pedido demo #17
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 100000, @uid, 'completed', '2026-06-21 20:30:00', '2026-06-21 21:00:00' FROM customers WHERE email = 'mariana.navarro@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 9000 FROM products WHERE name = 'Red Bull' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 50000 FROM products WHERE name = 'Servicio de Mezcladores' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 16000 FROM products WHERE name = 'Mojito' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #17', @order_id, (SELECT id FROM payment_methods WHERE name = 'Tarjeta de débito'), 100000, @uid, 'income', 'selling', 'completed', '2026-06-21 21:05:00';

-- pedido demo #18
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 908000, @uid, 'completed', '2026-05-23 20:30:00', '2026-05-23 21:00:00' FROM customers WHERE email = 'sofia.hernandez@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 10000 FROM products WHERE name = 'Heineken' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 14000 FROM products WHERE name = 'Nachos con Queso' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 6000 FROM products WHERE name = 'Agua Mineral' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 280000 FROM products WHERE name = 'Whisky Buchanan\'s 12' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #18', @order_id, (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 908000, @uid, 'income', 'selling', 'completed', '2026-05-23 21:05:00';

-- pedido demo #19
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 56000, @uid, 'pending', '2026-05-16 20:30:00', NULL FROM customers WHERE email = 'camila.flores@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 6000 FROM products WHERE name = 'Refresco' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 11000 FROM products WHERE name = 'Papas a la Francesa' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 8500 FROM products WHERE name = 'Corona Extra' AND user_uid = @uid;

-- pedido demo #20
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 673000, @uid, 'completed', '2026-05-20 20:30:00', '2026-05-20 21:00:00' FROM customers WHERE email = 'mateo.garcia@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 35000 FROM products WHERE name = 'Cover Evento Especial' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 270000 FROM products WHERE name = 'Vodka Grey Goose' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 28000 FROM products WHERE name = 'Tabla de Carnes Frías' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #20', @order_id, (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 673000, @uid, 'income', 'selling', 'completed', '2026-05-20 21:05:00';

-- pedido demo #21
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 59500, @uid, 'pending', '2026-06-16 20:30:00', NULL FROM customers WHERE email = 'mateo.garcia@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 8500 FROM products WHERE name = 'Victoria' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 17000 FROM products WHERE name = 'Margarita' AND user_uid = @uid;

-- pedido demo #22
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 84000, @uid, 'completed', '2026-06-22 20:30:00', '2026-06-22 21:00:00' FROM customers WHERE email = 'diego.ramirez@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 28000 FROM products WHERE name = 'Tabla de Carnes Frías' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #22', @order_id, (SELECT id FROM payment_methods WHERE name = 'Tarjeta de débito'), 84000, @uid, 'income', 'selling', 'completed', '2026-06-22 21:05:00';

-- pedido demo #23
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 646500, @uid, 'pending', '2026-06-15 20:30:00', NULL FROM customers WHERE email = 'paola.campos@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 19000 FROM products WHERE name = 'Gin Tonic' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 300000 FROM products WHERE name = 'Ron Zacapa 23' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 8500 FROM products WHERE name = 'Limonada Mineral' AND user_uid = @uid;

-- pedido demo #24
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 84000, @uid, 'completed', '2026-05-26 20:30:00', '2026-05-26 21:00:00' FROM customers WHERE email = 'fernando.luna@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 28000 FROM products WHERE name = 'Tabla de Carnes Frías' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #24', @order_id, (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 84000, @uid, 'income', 'selling', 'completed', '2026-05-26 21:05:00';

-- pedido demo #25
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 75000, @uid, 'completed', '2026-06-15 20:30:00', '2026-06-15 21:00:00' FROM customers WHERE email = 'diego.ramirez@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 28000 FROM products WHERE name = 'Tabla de Carnes Frías' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 19000 FROM products WHERE name = 'Carajillo' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #25', @order_id, (SELECT id FROM payment_methods WHERE name = 'Tarjeta de débito'), 75000, @uid, 'income', 'selling', 'completed', '2026-06-15 21:05:00';

-- pedido demo #26
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 9000, @uid, 'completed', '2026-05-17 20:30:00', '2026-05-17 21:00:00' FROM customers WHERE email = 'diego.ramirez@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 9000 FROM products WHERE name = 'Red Bull' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #26', @order_id, (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 9000, @uid, 'income', 'selling', 'completed', '2026-05-17 21:05:00';

-- pedido demo #27
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 20000, @uid, 'pending', '2026-05-04 20:30:00', NULL FROM customers WHERE email = 'paola.campos@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 10000 FROM products WHERE name = 'Heineken' AND user_uid = @uid;

-- pedido demo #28
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 780000, @uid, 'completed', '2026-05-22 20:30:00', '2026-05-22 21:00:00' FROM customers WHERE email = 'daniela.castillo@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 3, 260000 FROM products WHERE name = 'Whisky Johnnie Walker Black' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #28', @order_id, (SELECT id FROM payment_methods WHERE name = 'Efectivo'), 780000, @uid, 'income', 'selling', 'completed', '2026-05-22 21:05:00';

-- pedido demo #29
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 856000, @uid, 'pending', '2026-05-14 20:30:00', NULL FROM customers WHERE email = 'sofia.hernandez@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 18000 FROM products WHERE name = 'Azulito' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 280000 FROM products WHERE name = 'Whisky Buchanan\'s 12' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 270000 FROM products WHERE name = 'Vodka Grey Goose' AND user_uid = @uid;

-- pedido demo #30
INSERT INTO orders (customer_id, total_amount, user_uid, status, created_at, closed_at) SELECT id, 900000, @uid, 'completed', '2026-05-04 20:30:00', '2026-05-04 21:00:00' FROM customers WHERE email = 'mateo.garcia@example.com' AND user_uid = @uid;
SET @order_id = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 2, 290000 FROM products WHERE name = 'Tequila Maestro Dobel Diamante' AND user_uid = @uid;
INSERT INTO order_items (order_id, product_id, quantity, price) SELECT @order_id, id, 1, 320000 FROM products WHERE name = 'Tequila Don Julio 70' AND user_uid = @uid;
INSERT INTO transactions (description, order_id, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Consumo de mesa #30', @order_id, (SELECT id FROM payment_methods WHERE name = 'Tarjeta de débito'), 900000, @uid, 'income', 'selling', 'completed', '2026-05-04 21:05:00';

-- ── Gastos demo ─────────────────────────────────────────────────────────
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Honorarios de limpieza', (SELECT id FROM payment_methods WHERE name = 'Efectivo'), 1162123, @uid, 'expense', 'personal', 'completed', '2026-05-23 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Nómina de meseros y bartenders', (SELECT id FROM payment_methods WHERE name = 'Efectivo'), 1586034, @uid, 'expense', 'personal', 'completed', '2026-05-15 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Recibo de electricidad', (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 1117071, @uid, 'expense', 'servicios', 'completed', '2026-06-20 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Compra de mezcladores y hielo', (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 1452888, @uid, 'expense', 'inventario', 'completed', '2026-05-30 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Reposición de cerveza', (SELECT id FROM payment_methods WHERE name = 'Efectivo'), 1041198, @uid, 'expense', 'inventario', 'completed', '2026-05-13 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Honorarios de DJ', (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 510529, @uid, 'expense', 'entretenimiento', 'completed', '2026-05-12 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Limpieza profunda del local', (SELECT id FROM payment_methods WHERE name = 'Tarjeta de débito'), 1029461, @uid, 'expense', 'mantenimiento', 'completed', '2026-06-15 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Reparación de barra', (SELECT id FROM payment_methods WHERE name = 'Efectivo'), 1257384, @uid, 'expense', 'mantenimiento', 'completed', '2026-05-27 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Pago de personal de seguridad', (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 505042, @uid, 'expense', 'personal', 'completed', '2026-05-05 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Compra de licores y destilados', (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 102945, @uid, 'expense', 'inventario', 'completed', '2026-05-28 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Mantenimiento de audio e iluminación', (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 1180986, @uid, 'expense', 'mantenimiento', 'completed', '2026-06-18 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Nómina de meseros y bartenders', (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 899593, @uid, 'expense', 'personal', 'completed', '2026-05-26 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Recibo de electricidad', (SELECT id FROM payment_methods WHERE name = 'Tarjeta de débito'), 1246908, @uid, 'expense', 'servicios', 'completed', '2026-06-19 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Renta mensual del local — Enero', (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 1451097, @uid, 'expense', 'renta', 'completed', '2026-05-13 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Internet y terminales', (SELECT id FROM payment_methods WHERE name = 'Efectivo'), 1130949, @uid, 'expense', 'servicios', 'completed', '2026-05-02 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Nómina de meseros y bartenders', (SELECT id FROM payment_methods WHERE name = 'Tarjeta de crédito'), 1303001, @uid, 'expense', 'personal', 'pending', '2026-05-22 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Renta mensual del local — Marzo', (SELECT id FROM payment_methods WHERE name = 'Tarjeta de débito'), 513521, @uid, 'expense', 'renta', 'completed', '2026-06-05 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Renta mensual del local — Marzo', (SELECT id FROM payment_methods WHERE name = 'Efectivo'), 275290, @uid, 'expense', 'renta', 'completed', '2026-05-10 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Renta mensual del local — Enero', (SELECT id FROM payment_methods WHERE name = 'Efectivo'), 1092773, @uid, 'expense', 'renta', 'completed', '2026-05-20 12:00:00';
INSERT INTO transactions (description, payment_method_id, amount, user_uid, type, category, status, created_at) SELECT 'Recibo de electricidad', (SELECT id FROM payment_methods WHERE name = 'Efectivo'), 73801, @uid, 'expense', 'servicios', 'completed', '2026-04-29 12:00:00';

