const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const mobileMenuBackdrop = document.getElementById('mobile-menu-backdrop');
const mobileNavigation = document.getElementById('mobile-navigation');

function closeMobileMenu() {
  document.body.classList.remove('mobile-menu-open');
  mobileMenuToggle?.setAttribute('aria-expanded', 'false');
}

function toggleMobileMenu() {
  const open = !document.body.classList.contains('mobile-menu-open');
  document.body.classList.toggle('mobile-menu-open', open);
  mobileMenuToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
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