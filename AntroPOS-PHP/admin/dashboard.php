<?php
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../lib/pricing.php';

$pageTitle = 'Dashboard';
$activeNav = 'dashboard';
require_once __DIR__ . '/../partials/admin_header.php';

$userId = $__user['id'];
$pdo = db();

// Port 1:1 de apps/web/src/lib/trpc/routers/dashboard.ts (dashboardRouter.stats)
$stmt = $pdo->prepare(
    "SELECT amount, type, category, created_at FROM transactions
     WHERE status = 'completed' AND user_uid = ? ORDER BY created_at ASC"
);
$stmt->execute([$userId]);
$allCompleted = $stmt->fetchAll();

$totalRevenue = 0;
$totalExpenses = 0;
$totalSelling = 0;
$revenueByCategory = [];
$expensesByCategory = [];
$cashFlowByDate = [];
$dailyData = []; // date => ['selling'=>, 'expense'=>]

foreach ($allCompleted as $t) {
    $amount = (int) $t['amount'];
    $type = $t['type'];
    $category = $t['category'];
    $date = $t['created_at'] ? substr($t['created_at'], 0, 10) : 'unknown';

    if ($type === 'income') {
        $totalRevenue += $amount;
        if ($category) {
            $revenueByCategory[$category] = ($revenueByCategory[$category] ?? 0) + $amount;
        }
    }
    if ($type === 'expense') {
        $totalExpenses += $amount;
        if ($category) {
            $expensesByCategory[$category] = ($expensesByCategory[$category] ?? 0) + $amount;
        }
    }
    if ($category === 'selling') {
        $totalSelling += $amount;
    }

    $cashFlowByDate[$date] = ($cashFlowByDate[$date] ?? 0) + $amount;

    if (!isset($dailyData[$date])) {
        $dailyData[$date] = ['selling' => 0, 'expense' => 0];
    }
    if ($category === 'selling') {
        $dailyData[$date]['selling'] += $amount;
    } elseif ($type === 'expense') {
        $dailyData[$date]['expense'] += $amount;
    }
}

$totalProfit = $totalSelling - $totalExpenses;
$profitIsPositive = $totalProfit >= 0;

$cashFlow = [];
foreach ($cashFlowByDate as $date => $amount) {
    $cashFlow[] = ['date' => $date, 'amount' => $amount];
}

$profitMargin = [];
foreach ($dailyData as $date => $d) {
    $margin = $d['selling'] > 0 ? round(($d['selling'] - $d['expense']) / $d['selling'] * 100, 2) : 0.0;
    $profitMargin[] = ['date' => $date, 'margin' => $margin];
}

$CHART_COLORS = [
    'hsl(12, 76%, 61%)',
    'hsl(173, 58%, 39%)',
    'hsl(197, 37%, 24%)',
    'hsl(43, 74%, 66%)',
    'hsl(27, 87%, 67%)',
];

function money_str(int $cents): string {
    return '$' . money($cents);
}

function short_date(string $isoDate): string {
    $ts = strtotime($isoDate);
    return $ts ? date('d/m', $ts) : $isoDate;
}
?>

<div class="row g-4 mb-4">
  <div class="col-sm-6 col-xl-4">
    <div class="card kpi-card h-100">
      <div class="card-body">
        <div class="kpi-head">
          <span class="kpi-label">Ingresos totales</span>
          <i class="bi bi-currency-dollar kpi-icon"></i>
        </div>
        <div class="kpi-value"><?= money_str($totalRevenue) ?></div>
        <p class="kpi-sub">Ingresos completados</p>
      </div>
    </div>
  </div>
  <div class="col-sm-6 col-xl-4">
    <div class="card kpi-card h-100">
      <div class="card-body">
        <div class="kpi-head">
          <span class="kpi-label">Gastos totales</span>
          <i class="bi bi-wallet2 kpi-icon"></i>
        </div>
        <div class="kpi-value"><?= money_str($totalExpenses) ?></div>
        <p class="kpi-sub">Gastos completados</p>
      </div>
    </div>
  </div>
  <div class="col-sm-6 col-xl-4">
    <div class="card kpi-card h-100">
      <div class="card-body">
        <div class="kpi-head">
          <span class="kpi-label">Utilidad neta</span>
          <i class="bi <?= $profitIsPositive ? 'bi-graph-up-arrow text-emerald' : 'bi-graph-down-arrow text-rose' ?> kpi-icon"></i>
        </div>
        <div class="kpi-value <?= $profitIsPositive ? 'text-emerald' : 'text-rose' ?>"><?= money_str($totalProfit) ?></div>
        <p class="kpi-sub">Ventas menos gastos</p>
      </div>
    </div>
  </div>
</div>

<div class="row g-4">
  <div class="col-lg-6">
    <div class="card chart-card h-100">
      <div class="card-body">
        <h6 class="chart-title">Ingresos por categoría</h6>
        <p class="chart-desc">Desglose de ingresos completados</p>
        <?php if (empty($revenueByCategory)): ?>
          <div class="chart-empty">Sin datos todavía.</div>
        <?php else: ?>
          <div class="chart-wrap">
            <canvas id="revenueDonut"></canvas>
            <div class="donut-center">
              <div class="donut-total"><?= money_str($totalRevenue) ?></div>
              <div class="donut-label">Total</div>
            </div>
          </div>
        <?php endif; ?>
      </div>
    </div>
  </div>

  <div class="col-lg-6">
    <div class="card chart-card h-100">
      <div class="card-body">
        <h6 class="chart-title">Gastos por categoría</h6>
        <p class="chart-desc">Desglose de gastos completados</p>
        <?php if (empty($expensesByCategory)): ?>
          <div class="chart-empty">Sin datos todavía.</div>
        <?php else: ?>
          <div class="chart-wrap">
            <canvas id="expensesDonut"></canvas>
            <div class="donut-center">
              <div class="donut-total"><?= money_str($totalExpenses) ?></div>
              <div class="donut-label">Total</div>
            </div>
          </div>
        <?php endif; ?>
      </div>
    </div>
  </div>

  <div class="col-lg-6">
    <div class="card chart-card h-100">
      <div class="card-body">
        <h6 class="chart-title">Margen de utilidad</h6>
        <p class="chart-desc">Margen de utilidad diario</p>
        <?php if (empty($profitMargin)): ?>
          <div class="chart-empty">Sin datos todavía.</div>
        <?php else: ?>
          <div class="chart-wrap"><canvas id="marginBar"></canvas></div>
        <?php endif; ?>
      </div>
    </div>
  </div>

  <div class="col-lg-6">
    <div class="card chart-card h-100">
      <div class="card-body">
        <h6 class="chart-title">Flujo de caja</h6>
        <p class="chart-desc">Volumen diario de transacciones</p>
        <?php if (empty($cashFlow)): ?>
          <div class="chart-empty">Sin datos todavía.</div>
        <?php else: ?>
          <div class="chart-wrap"><canvas id="cashFlowArea"></canvas></div>
        <?php endif; ?>
      </div>
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<script>
(function () {
  var COLORS = <?= json_encode($CHART_COLORS) ?>;
  var revenueByCategory = <?= json_encode($revenueByCategory) ?>;
  var expensesByCategory = <?= json_encode($expensesByCategory) ?>;
  var profitMargin = <?= json_encode($profitMargin) ?>;
  var cashFlow = <?= json_encode($cashFlow) ?>;

  function money(cents) {
    return '$' + (cents / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function shortDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function donut(canvasId, dataObj) {
    var el = document.getElementById(canvasId);
    if (!el) return;
    var labels = Object.keys(dataObj).map(cap);
    var values = Object.values(dataObj);
    new Chart(el, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: labels.map(function (_, i) { return COLORS[i % COLORS.length]; }),
          borderColor: '#fff',
          borderWidth: 2,
        }],
      },
      options: {
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: function (ctx) { return ctx.label + ': ' + money(ctx.raw); } } },
        },
      },
    });
  }

  donut('revenueDonut', revenueByCategory);
  donut('expensesDonut', expensesByCategory);

  var marginEl = document.getElementById('marginBar');
  if (marginEl) {
    new Chart(marginEl, {
      type: 'bar',
      data: {
        labels: profitMargin.map(function (d) { return shortDate(d.date); }),
        datasets: [{
          data: profitMargin.map(function (d) { return d.margin; }),
          backgroundColor: profitMargin.map(function (d) { return d.margin >= 0 ? COLORS[1] : COLORS[4]; }),
          borderRadius: 4,
          maxBarThickness: 36,
        }],
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (ctx) { return ctx.raw + '%'; } } },
        },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: '#eef0f3' }, ticks: { callback: function (v) { return v + '%'; } } },
        },
      },
    });
  }

  var cashEl = document.getElementById('cashFlowArea');
  if (cashEl) {
    var ctx = cashEl.getContext('2d');
    var gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, 'hsla(197, 37%, 24%, 0.35)');
    gradient.addColorStop(1, 'hsla(197, 37%, 24%, 0.02)');

    new Chart(cashEl, {
      type: 'line',
      data: {
        labels: cashFlow.map(function (d) { return shortDate(d.date); }),
        datasets: [{
          data: cashFlow.map(function (d) { return d.amount; }),
          borderColor: COLORS[2],
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
        }],
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (ctx) { return money(ctx.raw); } } },
        },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: '#eef0f3' }, ticks: { callback: function (v) { return money(v); } } },
        },
      },
    });
  }
})();
</script>

<?php require_once __DIR__ . '/../partials/admin_footer.php'; ?>
