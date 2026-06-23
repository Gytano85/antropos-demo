</main>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script>
  // Expandir/colapsar la barra lateral angosta (rail), igual que el original.
  (function () {
    var sidebar = document.getElementById('appSidebar');
    var toggle = document.getElementById('sidebarToggle');
    if (!sidebar || !toggle) return;
    var KEY = 'antropos_sidebar_expanded';
    if (localStorage.getItem(KEY) === '1') sidebar.classList.add('expanded');
    toggle.addEventListener('click', function () {
      sidebar.classList.toggle('expanded');
      localStorage.setItem(KEY, sidebar.classList.contains('expanded') ? '1' : '0');
    });
  })();

  // Tooltips de Bootstrap para los íconos del rail colapsado.
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (el) {
    new bootstrap.Tooltip(el);
  });

  // Combobox genérico (réplica de packages/ui/src/components/combobox.tsx):
  // botón outline + popover con buscador y lista. Reusable en cualquier página.
  document.querySelectorAll('[data-combobox]').forEach(function (root) {
    var trigger = root.querySelector('.combobox-trigger');
    var valueEl = root.querySelector('.combobox-value');
    var hiddenInput = root.querySelector('[data-combobox-input]');
    var search = root.querySelector('.combobox-search');
    var items = Array.prototype.slice.call(root.querySelectorAll('.combobox-item'));
    var empty = root.querySelector('.combobox-empty');
    var placeholder = valueEl ? valueEl.textContent : '';
    if (!trigger || !hiddenInput) return;

    function selectItem(item) {
      var val = item.getAttribute('data-value');
      var label = item.getAttribute('data-label') || item.textContent.trim();
      hiddenInput.value = val;
      if (valueEl) {
        valueEl.textContent = label;
        valueEl.classList.remove('placeholder');
      }
      items.forEach(function (i) { i.classList.toggle('is-active', i === item); });
      var dd = bootstrap.Dropdown.getOrCreateInstance(trigger);
      dd.hide();
      hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      if (root.dataset.noSelect === 'true') {
        // No mantiene el valor visible en el botón (ej. "Agregar producto...")
        setTimeout(function () {
          if (valueEl) { valueEl.textContent = placeholder; valueEl.classList.add('placeholder'); }
          hiddenInput.value = '';
        }, 0);
      }
    }

    items.forEach(function (item) {
      item.addEventListener('click', function () { selectItem(item); });
    });

    if (search) {
      search.addEventListener('input', function () {
        var q = search.value.trim().toLowerCase();
        var anyVisible = false;
        items.forEach(function (item) {
          var label = (item.getAttribute('data-label') || item.textContent).toLowerCase();
          var match = !q || label.indexOf(q) !== -1;
          item.style.display = match ? '' : 'none';
          if (match) anyVisible = true;
        });
        if (empty) empty.style.display = anyVisible ? 'none' : 'block';
      });
      root.addEventListener('shown.bs.dropdown', function () {
        search.value = '';
        items.forEach(function (item) { item.style.display = ''; });
        if (empty) empty.style.display = 'none';
        setTimeout(function () { search.focus(); }, 0);
      });
    }
  });
</script>
</body>
</html>
