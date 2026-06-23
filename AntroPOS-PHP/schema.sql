-- AntroPOS (PHP + MySQL port of FinOpenPOS)
-- Full schema, 1:1 functional parity with packages/db/src/schema.ts
-- Money columns are INTEGER cents, matching the original Postgres schema.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- Auth (replaces Better Auth's account/session/user/verification tables)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(255) NOT NULL,
  description      TEXT NULL,
  price            INT NOT NULL DEFAULT 0,        -- cents
  in_stock         INT NOT NULL DEFAULT 0,
  user_uid         VARCHAR(36) NOT NULL,
  category         VARCHAR(50) NULL,
  ncm              VARCHAR(8)  NULL,
  cfop             VARCHAR(4)  NULL,
  icms_cst         VARCHAR(3)  NULL,
  pis_cst          VARCHAR(2)  NULL,
  cofins_cst       VARCHAR(2)  NULL,
  unit_of_measure  VARCHAR(6)  NOT NULL DEFAULT 'UN',
  created_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_products_user (user_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customers (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255) NOT NULL,
  phone      VARCHAR(20)  NULL,
  user_uid   VARCHAR(36)  NOT NULL,
  status     VARCHAR(20)  NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_customer_email (email),
  INDEX idx_customers_user (user_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Orders / tables (mesas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  customer_id  INT NULL,
  table_name   VARCHAR(50) NULL,
  total_amount INT NOT NULL DEFAULT 0,  -- cents
  user_uid     VARCHAR(36) NOT NULL,
  status       VARCHAR(20) NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at    TIMESTAMP NULL,
  party_size   INT NOT NULL DEFAULT 1,
  INDEX idx_orders_user (user_uid),
  INDEX idx_orders_status (status),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_items (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  order_id   INT NOT NULL,
  product_id INT NULL,
  quantity   INT NOT NULL,
  price      INT NOT NULL, -- unit price, cents
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_items_order (order_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Inventory: ingredients & recipes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingredients (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(255) NOT NULL,
  unit                VARCHAR(20)  NOT NULL,
  stock_quantity      DECIMAL(14,3) NOT NULL DEFAULT 0,
  package_size        DECIMAL(14,3) NOT NULL DEFAULT 1,
  low_stock_threshold DECIMAL(14,3) NOT NULL DEFAULT 0,
  user_uid            VARCHAR(36) NOT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ingredients_user (user_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recipes (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  user_uid   VARCHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_recipes_user (user_uid),
  CONSTRAINT fk_recipes_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recipe_items (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  recipe_id     INT NOT NULL,
  ingredient_id INT NOT NULL,
  quantity      DECIMAL(14,3) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_recipe_items_recipe (recipe_id),
  CONSTRAINT fk_recipe_items_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  CONSTRAINT fk_recipe_items_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ingredient_movements (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  ingredient_id      INT NOT NULL,
  order_id           INT NULL,
  order_item_id      INT NULL,
  movement_type      VARCHAR(30) NOT NULL, -- 'consumption' | 'restoration' | 'restock' | 'adjustment'
  quantity           DECIMAL(14,3) NOT NULL,
  expected_quantity  DECIMAL(14,3) NULL,
  notes              TEXT NULL,
  user_uid           VARCHAR(36) NOT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ing_mov_ingredient (ingredient_id),
  INDEX idx_ing_mov_order (order_id),
  INDEX idx_ing_mov_order_item (order_item_id),
  CONSTRAINT fk_ing_mov_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ingredient_counts (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  ingredient_id      INT NOT NULL,
  expected_quantity  DECIMAL(14,3) NOT NULL,
  counted_quantity   DECIMAL(14,3) NOT NULL,
  variance_quantity  DECIMAL(14,3) NOT NULL,
  variance_percent   DECIMAL(8,2) NOT NULL,
  exceeds_tolerance  TINYINT(1) NOT NULL DEFAULT 0,
  notes              TEXT NULL,
  user_uid           VARCHAR(36) NOT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ing_counts_ingredient (ingredient_id),
  CONSTRAINT fk_ing_counts_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_methods (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS transactions (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  description       TEXT NULL,
  order_id          INT NULL,
  payment_method_id INT NULL,
  amount            INT NOT NULL, -- cents
  user_uid          VARCHAR(36) NOT NULL,
  type              VARCHAR(20) NULL,
  category          VARCHAR(100) NULL,
  status            VARCHAR(20) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tx_user (user_uid),
  CONSTRAINT fk_tx_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT fk_tx_payment_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Dynamic alcohol pricing settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pricing_settings (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  user_uid            VARCHAR(36) NOT NULL UNIQUE,
  enabled             TINYINT(1) NOT NULL DEFAULT 1,
  capacity            INT NOT NULL DEFAULT 15,
  min_adjustment_pct  INT NOT NULL DEFAULT -15,
  max_adjustment_pct  INT NOT NULL DEFAULT 25,
  drunk_threshold     DECIMAL(6,2) NOT NULL DEFAULT 3,
  drunk_surge_pct     INT NOT NULL DEFAULT 20,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Fiscal (NF-e/NFC-e) — data record-keeping only, no real SEFAZ signing
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cities (
  id         INT NOT NULL PRIMARY KEY, -- IBGE 7-digit code
  name       VARCHAR(120) NOT NULL,
  state_code VARCHAR(2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fiscal_settings (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  user_uid                 VARCHAR(36) NOT NULL UNIQUE,
  company_name             VARCHAR(255) NOT NULL,
  trade_name               VARCHAR(255) NULL,
  tax_id                   VARCHAR(14)  NOT NULL,
  state_tax_id             VARCHAR(20)  NOT NULL,
  tax_regime               INT NOT NULL DEFAULT 1,
  state_code               VARCHAR(2)  NOT NULL,
  city_code                VARCHAR(7)  NOT NULL,
  city_name                VARCHAR(100) NOT NULL,
  street                   VARCHAR(255) NOT NULL,
  street_number            VARCHAR(10) NOT NULL,
  district                 VARCHAR(100) NOT NULL,
  zip_code                 VARCHAR(8)  NOT NULL,
  address_complement       VARCHAR(100) NULL,
  environment              INT NOT NULL DEFAULT 2,
  nfe_series               INT NULL DEFAULT 1,
  nfce_series              INT NULL DEFAULT 1,
  next_nfe_number          INT NULL DEFAULT 1,
  next_nfce_number         INT NULL DEFAULT 1,
  csc_id                   VARCHAR(10) NULL,
  csc_token                VARCHAR(50) NULL,
  certificate_pfx          LONGBLOB NULL,
  certificate_password     TEXT NULL,
  certificate_valid_until  TIMESTAMP NULL,
  default_ncm              VARCHAR(8) NOT NULL DEFAULT '00000000',
  default_cfop             VARCHAR(4) NOT NULL DEFAULT '5102',
  default_icms_cst         VARCHAR(3) NOT NULL DEFAULT '00',
  default_pis_cst          VARCHAR(2) NOT NULL DEFAULT '99',
  default_cofins_cst       VARCHAR(2) NOT NULL DEFAULT '99',
  created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoices (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  user_uid          VARCHAR(36) NOT NULL,
  order_id          INT NULL,
  model             INT NOT NULL,           -- 55 = NF-e, 65 = NFC-e
  series            INT NOT NULL,
  number            INT NOT NULL,
  access_key        VARCHAR(44) NULL,
  operation_nature  VARCHAR(60) NOT NULL DEFAULT 'VENDA',
  operation_type    INT NOT NULL DEFAULT 1,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',
  environment       INT NOT NULL,
  request_xml       LONGTEXT NULL,
  response_xml      LONGTEXT NULL,
  protocol_xml      LONGTEXT NULL,
  protocol_number   VARCHAR(20) NULL,
  status_code       INT NULL,
  status_message    TEXT NULL,
  issued_at         TIMESTAMP NOT NULL,
  authorized_at     TIMESTAMP NULL,
  total_amount      INT NOT NULL,
  is_contingency    TINYINT(1) NOT NULL DEFAULT 0,
  contingency_type  VARCHAR(20) NULL,
  contingency_at    TIMESTAMP NULL,
  contingency_reason TEXT NULL,
  recipient_tax_id  VARCHAR(14) NULL,
  recipient_name    VARCHAR(255) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_invoices_user (user_uid),
  CONSTRAINT fk_invoices_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoice_items (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id      INT NOT NULL,
  product_id      INT NULL,
  item_number     INT NOT NULL,
  product_code    VARCHAR(60) NOT NULL,
  description     VARCHAR(120) NOT NULL,
  ncm             VARCHAR(8) NOT NULL,
  cfop            VARCHAR(4) NOT NULL,
  unit_of_measure VARCHAR(6) NOT NULL DEFAULT 'UN',
  quantity        INT NOT NULL, -- x1000
  unit_price      INT NOT NULL, -- cents
  total_price     INT NOT NULL, -- cents
  icms_cst        VARCHAR(3) NULL,
  icms_rate       INT NOT NULL DEFAULT 0, -- x100
  icms_amount     INT NOT NULL DEFAULT 0,
  pis_cst         VARCHAR(2) NULL,
  cofins_cst      VARCHAR(2) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_invoice_items_invoice (invoice_id),
  CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_invoice_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoice_events (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id      INT NOT NULL,
  event_type      VARCHAR(30) NOT NULL,
  sequence        INT NOT NULL DEFAULT 1,
  protocol_number VARCHAR(20) NULL,
  status_code     INT NULL,
  reason          TEXT NULL,
  request_xml     LONGTEXT NULL,
  response_xml    LONGTEXT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_invoice_events_invoice (invoice_id),
  CONSTRAINT fk_invoice_events_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------
INSERT INTO payment_methods (name) VALUES ('Tarjeta de crédito'), ('Tarjeta de débito'), ('Efectivo')
  ON DUPLICATE KEY UPDATE name = name;
