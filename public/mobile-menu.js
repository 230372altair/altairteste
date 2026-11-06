const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const mobileMenuBackdrop = document.getElementById('mobile-menu-backdrop');
const mobileNavigation = document.getElementById('mobile-navigation');

function closeMobileMenu() {
  const wasOpen = document.body.classList.contains('mobile-menu-open');
  document.body.classList.remove('mobile-menu-open');
  mobileMenuToggle?.setAttribute('aria-expanded', 'false');
  mobileMenuToggle?.setAttribute('aria-label', 'Abrir menu');
  if (wasOpen) mobileMenuToggle?.focus();
}

function toggleMobileMenu() {
  const open = !document.body.classList.contains('mobile-menu-open');
  document.body.classList.toggle('mobile-menu-open', open);
  mobileMenuToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  mobileMenuToggle?.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  if (open) mobileNavigation?.querySelector('button')?.focus();
}

mobileMenuToggle?.addEventListener('click', toggleMobileMenu);
mobileMenuBackdrop?.addEventListener('click', closeMobileMenu);

mobileNavigation?.querySelectorAll('[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      closeMobileMenu();
    }
  });
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMobileMenu();
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 900) closeMobileMenu();
});

// Permite rolar tabelas largas também pelo teclado.
document.querySelectorAll('.table-wrap').forEach(wrap => {
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', 'Tabela do relatório. Role para ver todas as colunas.');
});

// A barra superior fica oculta no celular; mantenha a saída acessível no menu.
const logout = document.createElement('button');
logout.type = 'button';
logout.className = 'button secondary mobile-logout';
logout.textContent = 'Sair da conta';
logout.addEventListener('click', () => document.getElementById('logout-button')?.click());
mobileNavigation?.append(logout);
