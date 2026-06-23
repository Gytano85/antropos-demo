<?php
require_once __DIR__ . '/../helpers.php';

$pageTitle = 'Configuración fiscal';
$activeNav = 'fiscal-settings';
$__userPre = require_login();
$userId = $__userPre['id'];
$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_post();

    $fields = [
        'company_name' => trim($_POST['company_name'] ?? ''),
        'trade_name' => trim($_POST['trade_name'] ?? '') ?: null,
        'tax_id' => trim($_POST['tax_id'] ?? ''),
        'state_tax_id' => trim($_POST['state_tax_id'] ?? ''),
        'tax_regime' => (int) ($_POST['tax_regime'] ?? 1),
        'state_code' => trim($_POST['state_code'] ?? ''),
        'city_code' => trim($_POST['city_code'] ?? ''),
        'city_name' => trim($_POST['city_name'] ?? ''),
        'street' => trim($_POST['street'] ?? ''),
        'street_number' => trim($_POST['street_number'] ?? ''),
        'district' => trim($_POST['district'] ?? ''),
        'zip_code' => trim($_POST['zip_code'] ?? ''),
        'address_complement' => trim($_POST['address_complement'] ?? '') ?: null,
        'environment' => (int) ($_POST['environment'] ?? 2),
        'nfe_series' => (int) ($_POST['nfe_series'] ?? 1),
        'nfce_series' => (int) ($_POST['nfce_series'] ?? 1),
        'next_nfe_number' => (int) ($_POST['next_nfe_number'] ?? 1),
        'next_nfce_number' => (int) ($_POST['next_nfce_number'] ?? 1),
        'csc_id' => trim($_POST['csc_id'] ?? '') ?: null,
        'csc_token' => trim($_POST['csc_token'] ?? '') ?: null,
        'default_ncm' => trim($_POST['default_ncm'] ?? '') ?: '00000000',
        'default_cfop' => trim($_POST['default_cfop'] ?? '') ?: '5102',
        'default_icms_cst' => trim($_POST['default_icms_cst'] ?? '') ?: '00',
        'default_pis_cst' => trim($_POST['default_pis_cst'] ?? '') ?: '99',
        'default_cofins_cst' => trim($_POST['default_cofins_cst'] ?? '') ?: '99',
    ];

    if ($fields['company_name'] === '' || $fields['tax_id'] === '') {
        flash_set('error', 'Razón social y RFC/CNPJ son obligatorios.');
    } else {
        $stmt = $pdo->prepare('SELECT id FROM fiscal_settings WHERE user_uid = ?');
        $stmt->execute([$userId]);
        $exists = $stmt->fetch();

        $columns = array_keys($fields);
        $values = array_values($fields);

        if ($exists) {
            $setSql = implode(', ', array_map(fn($c) => "$c = ?", $columns));
            $stmt = $pdo->prepare("UPDATE fiscal_settings SET $setSql WHERE user_uid = ?");
            $stmt->execute([...$values, $userId]);
        } else {
            $colsSql = implode(', ', $columns) . ', user_uid';
            $placeholders = implode(', ', array_fill(0, count($columns) + 1, '?'));
            $stmt = $pdo->prepare("INSERT INTO fiscal_settings ($colsSql) VALUES ($placeholders)");
            $stmt->execute([...$values, $userId]);
        }

        flash_set('success', 'Configuración fiscal guardada.');
    }

    redirect('/admin/fiscal-settings.php');
}

$stmt = $pdo->prepare('SELECT * FROM fiscal_settings WHERE user_uid = ?');
$stmt->execute([$userId]);
$f = $stmt->fetch() ?: [];

function fv($f, $key, $default = '') {
    return e((string) ($f[$key] ?? $default));
}

require_once __DIR__ . '/../partials/admin_header.php';
?>

<div class="alert alert-warning">
  <strong>Nota:</strong> este módulo guarda los datos fiscales y arma el registro de comprobantes,
  pero <strong>no firma ni transmite documentos al SAT/SEFAZ</strong> — eso requiere un certificado
  digital y una librería de timbrado especializada que está fuera del alcance de esta copia.
</div>

<div class="card p-3">
  <form method="post">
    <?= csrf_field() ?>
    <h6 class="mb-3">Datos de la empresa</h6>
    <div class="row">
      <div class="col-md-6 mb-2">
        <label class="form-label">Razón social</label>
        <input type="text" name="company_name" class="form-control" required value="<?= fv($f, 'company_name') ?>">
      </div>
      <div class="col-md-6 mb-2">
        <label class="form-label">Nombre comercial</label>
        <input type="text" name="trade_name" class="form-control" value="<?= fv($f, 'trade_name') ?>">
      </div>
      <div class="col-md-6 mb-2">
        <label class="form-label">RFC / CNPJ</label>
        <input type="text" name="tax_id" class="form-control" required maxlength="14" value="<?= fv($f, 'tax_id') ?>">
      </div>
      <div class="col-md-6 mb-2">
        <label class="form-label">Registro estatal (IE)</label>
        <input type="text" name="state_tax_id" class="form-control" maxlength="20" value="<?= fv($f, 'state_tax_id') ?>">
      </div>
      <div class="col-md-6 mb-2">
        <label class="form-label">Régimen fiscal</label>
        <select name="tax_regime" class="form-select">
          <option value="1" <?= ($f['tax_regime'] ?? 1) == 1 ? 'selected' : '' ?>>1 — Simples Nacional</option>
          <option value="2" <?= ($f['tax_regime'] ?? 1) == 2 ? 'selected' : '' ?>>2 — Simples Nacional (excedente)</option>
          <option value="3" <?= ($f['tax_regime'] ?? 1) == 3 ? 'selected' : '' ?>>3 — Régimen normal</option>
        </select>
      </div>
      <div class="col-md-6 mb-2">
        <label class="form-label">Ambiente</label>
        <select name="environment" class="form-select">
          <option value="2" <?= ($f['environment'] ?? 2) == 2 ? 'selected' : '' ?>>Homologación / pruebas</option>
          <option value="1" <?= ($f['environment'] ?? 2) == 1 ? 'selected' : '' ?>>Producción</option>
        </select>
      </div>
    </div>

    <h6 class="mb-3 mt-3">Domicilio fiscal</h6>
    <div class="row">
      <div class="col-md-3 mb-2">
        <label class="form-label">Estado (UF)</label>
        <input type="text" name="state_code" class="form-control" maxlength="2" value="<?= fv($f, 'state_code') ?>">
      </div>
      <div class="col-md-4 mb-2">
        <label class="form-label">Código de ciudad (IBGE)</label>
        <input type="text" name="city_code" class="form-control" maxlength="7" value="<?= fv($f, 'city_code') ?>">
      </div>
      <div class="col-md-5 mb-2">
        <label class="form-label">Ciudad</label>
        <input type="text" name="city_name" class="form-control" value="<?= fv($f, 'city_name') ?>">
      </div>
      <div class="col-md-6 mb-2">
        <label class="form-label">Calle</label>
        <input type="text" name="street" class="form-control" value="<?= fv($f, 'street') ?>">
      </div>
      <div class="col-md-2 mb-2">
        <label class="form-label">Número</label>
        <input type="text" name="street_number" class="form-control" value="<?= fv($f, 'street_number') ?>">
      </div>
      <div class="col-md-4 mb-2">
        <label class="form-label">Colonia</label>
        <input type="text" name="district" class="form-control" value="<?= fv($f, 'district') ?>">
      </div>
      <div class="col-md-3 mb-2">
        <label class="form-label">Código postal</label>
        <input type="text" name="zip_code" class="form-control" maxlength="8" value="<?= fv($f, 'zip_code') ?>">
      </div>
      <div class="col-md-9 mb-2">
        <label class="form-label">Complemento</label>
        <input type="text" name="address_complement" class="form-control" value="<?= fv($f, 'address_complement') ?>">
      </div>
    </div>

    <h6 class="mb-3 mt-3">Numeración de comprobantes</h6>
    <div class="row">
      <div class="col-md-3 mb-2">
        <label class="form-label small">Serie NF-e</label>
        <input type="number" name="nfe_series" class="form-control" value="<?= fv($f, 'nfe_series', 1) ?>">
      </div>
      <div class="col-md-3 mb-2">
        <label class="form-label small">Próximo folio NF-e</label>
        <input type="number" name="next_nfe_number" class="form-control" value="<?= fv($f, 'next_nfe_number', 1) ?>">
      </div>
      <div class="col-md-3 mb-2">
        <label class="form-label small">Serie NFC-e</label>
        <input type="number" name="nfce_series" class="form-control" value="<?= fv($f, 'nfce_series', 1) ?>">
      </div>
      <div class="col-md-3 mb-2">
        <label class="form-label small">Próximo folio NFC-e</label>
        <input type="number" name="next_nfce_number" class="form-control" value="<?= fv($f, 'next_nfce_number', 1) ?>">
      </div>
      <div class="col-md-6 mb-2">
        <label class="form-label small">CSC ID</label>
        <input type="text" name="csc_id" class="form-control" maxlength="10" value="<?= fv($f, 'csc_id') ?>">
      </div>
      <div class="col-md-6 mb-2">
        <label class="form-label small">CSC Token</label>
        <input type="text" name="csc_token" class="form-control" maxlength="50" value="<?= fv($f, 'csc_token') ?>">
      </div>
    </div>

    <h6 class="mb-3 mt-3">Valores fiscales por defecto</h6>
    <div class="row">
      <div class="col-md-3 mb-2">
        <label class="form-label small">NCM</label>
        <input type="text" name="default_ncm" class="form-control" maxlength="8" value="<?= fv($f, 'default_ncm', '00000000') ?>">
      </div>
      <div class="col-md-3 mb-2">
        <label class="form-label small">CFOP</label>
        <input type="text" name="default_cfop" class="form-control" maxlength="4" value="<?= fv($f, 'default_cfop', '5102') ?>">
      </div>
      <div class="col-md-2 mb-2">
        <label class="form-label small">ICMS CST</label>
        <input type="text" name="default_icms_cst" class="form-control" maxlength="3" value="<?= fv($f, 'default_icms_cst', '00') ?>">
      </div>
      <div class="col-md-2 mb-2">
        <label class="form-label small">PIS CST</label>
        <input type="text" name="default_pis_cst" class="form-control" maxlength="2" value="<?= fv($f, 'default_pis_cst', '99') ?>">
      </div>
      <div class="col-md-2 mb-2">
        <label class="form-label small">COFINS CST</label>
        <input type="text" name="default_cofins_cst" class="form-control" maxlength="2" value="<?= fv($f, 'default_cofins_cst', '99') ?>">
      </div>
    </div>

    <button type="submit" class="btn btn-primary mt-2">Guardar configuración fiscal</button>
  </form>
</div>

<?php require_once __DIR__ . '/../partials/admin_footer.php'; ?>
