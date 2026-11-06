const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const mobileMenuBackdrop = document.getElementById('mobile-menu-backdrop');
const mobileNavigation = document.getElementById('mobile-navigation');
const mobileLayout = window.matchMedia('(max-width: 900px)');

function syncMenuAccess() {
  const hidden = mobileLayout.matches && !document.body.classList.contains('mobile-menu-open');
  if (mobileNavigation) mobileNavigation.inert = hidden;
  mobileNavigation?.setAttribute('aria-hidden', String(hidden));
}

function closeMobileMenu() {
  const wasOpen = document.body.classList.contains('mobile-menu-open');
  document.body.classList.remove('mobile-menu-open');
  mobileMenuToggle?.setAttribute('aria-expanded', 'false');
  mobileMenuToggle?.setAttribute('aria-label', 'Abrir menu');
  syncMenuAccess();
  if (wasOpen) mobileMenuToggle?.focus();
}

function toggleMobileMenu() {
  const open = !document.body.classList.contains('mobile-menu-open');
  document.body.classList.toggle('mobile-menu-open', open);
  mobileMenuToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  mobileMenuToggle?.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  syncMenuAccess();
  if (open) mobileNavigation?.querySelector('button')?.focus();
}

mobileMenuToggle?.addEventListener('click', toggleMobileMenu);
mobileMenuBackdrop?.addEventListener('click', closeMobileMenu);

mobileNavigation?.querySelectorAll('[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (mobileLayout.matches && !btn.classList.contains('portal-nav-parent')) {
      closeMobileMenu();
    }
  });
});

// No toque, os grupos expandem no fluxo do menu, sem abrir sobre os vizinhos.
mobileNavigation?.querySelectorAll('.portal-nav-group').forEach((group, index) => {
  const parent = group.querySelector('.portal-nav-parent');
  const submenu = group.querySelector('.portal-submenu');
  if (!parent || !submenu) return;
  submenu.id ||= `mobile-submenu-${index}`;
  parent.setAttribute('aria-controls', submenu.id);
  parent.setAttribute('aria-expanded', 'false');
  parent.addEventListener('click', event => {
    if (!mobileLayout.matches) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const open = group.dataset.mobileExpanded !== 'true';
    mobileNavigation.querySelectorAll('.portal-nav-group').forEach(other => {
      other.dataset.mobileExpanded = String(other === group && open);
      other.querySelector('.portal-nav-parent')?.setAttribute('aria-expanded', String(other === group && open));
    });
  }, true);
});

const closeMenuButton = document.createElement('button');
closeMenuButton.type = 'button';
closeMenuButton.className = 'mobile-menu-close';
closeMenuButton.textContent = 'Fechar menu ×';
closeMenuButton.addEventListener('click', closeMobileMenu);
mobileNavigation?.prepend(closeMenuButton);
syncMenuAccess();

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMobileMenu();
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 900) closeMobileMenu();
  syncMenuAccess();
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
