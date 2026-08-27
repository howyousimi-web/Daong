/**
 * app.js
 * ---------------------------------------------------------------
 * Global, every-page behavior: drawer nav, notification bell, auth
 * state (including which demo role is signed in), the login modal,
 * and the light/dark theme toggle (ported from TANAW). Page-specific
 * rendering (drives grid, citizen lookup, admin ops) lives in
 * pages.js, which runs after this file on every page.
 * --------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', async () => {
  new ThemeController();
  new ScrollRevealController();
  new HeaderScrollController();
  const drawer = new NavDrawerController();
  const notifications = new NotificationEngine();
  const auth = new AuthStateManager({ onExpired: () => notifications.close() });
  window.__daongAuthModal = new AuthModal();

  document.querySelectorAll('[data-action="login"]').forEach((btn) => {
    btn.addEventListener('click', () => auth.login('donor'));
  });
  document.querySelectorAll('[data-action="login-admin"]').forEach((btn) => {
    btn.addEventListener('click', () => auth.login('admin'));
  });
  document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
    btn.addEventListener('click', () => auth.logout());
  });

  window.__daong = { drawer, notifications, auth };
  document.dispatchEvent(new CustomEvent('daong:app-ready'));
});

// Turns text into safe HTML so donor-entered names can never break the page
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* =========================================================
   0. THEME TOGGLE — light / dark, persisted across reloads
   (ported from TANAW; applied on every page, not just one)
   ========================================================= */
class ThemeController {
  constructor() {
    this.root = document.documentElement;
    this.btn = document.getElementById('theme-toggle');
    const saved = localStorage.getItem('daong-theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.root.setAttribute('data-theme', saved || (prefersDark ? 'dark' : 'light'));
    this.btn?.addEventListener('click', () => this.toggle());
  }
  toggle() {
    const next = this.root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    this.root.setAttribute('data-theme', next);
    localStorage.setItem('daong-theme', next);
  }
}

/* =========================================================
   0c. STICKY HEADER SHADOW — a light shadow once the page has
   scrolled, so the fixed header reads as "above" the content.
   ========================================================= */
class HeaderScrollController {
  constructor() {
    this.header = document.getElementById('topbar');
    if (!this.header) return;
    const update = () => this.header.classList.toggle('scrolled', window.scrollY > 8);
    update();
    window.addEventListener('scroll', update, { passive: true });
  }
}

/* =========================================================
   0b. SCROLL-REVEAL — fades static sections in as they enter
   view (ported from TANAW). Applies to markup present at load;
   dynamically-injected cards (drives, admin lists) intentionally
   skip this so newly-rendered data never sits invisible.
   ========================================================= */
class ScrollRevealController {
  constructor() {
    const els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-visible')); return; }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    els.forEach((el) => observer.observe(el));
  }
}

/* =========================================================
   1. HAMBURGER DRAWER
   ========================================================= */
class NavDrawerController {
  constructor() {
    this.toggleBtn = document.getElementById('hamburger-toggle');
    this.drawer = document.getElementById('main-drawer');
    this.scrim = document.getElementById('app-scrim');
    this.closeBtn = document.getElementById('drawer-close');
    if (!this.toggleBtn || !this.drawer) return;

    this.focusableSelector = 'a[href], button:not([disabled])';
    this.lastFocused = null;

    this.toggleBtn.addEventListener('click', () => this.toggle());
    this.closeBtn?.addEventListener('click', () => this.close());
    this.scrim.addEventListener('click', () => this.closeAll());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) this.close();
      if (e.key === 'Tab' && this.isOpen()) this.trapFocus(e);
    });
  }

  isOpen() { return this.drawer.classList.contains('is-open'); }
  toggle() { this.isOpen() ? this.close() : this.open(); }

  open() {
    this.lastFocused = document.activeElement;
    this.drawer.classList.add('is-open');
    this.scrim.classList.add('is-visible');
    this.toggleBtn.setAttribute('aria-expanded', 'true');
    this.drawer.removeAttribute('hidden');
    this.drawer.querySelector(this.focusableSelector)?.focus();
  }

  close() {
    this.drawer.classList.remove('is-open');
    if (!document.getElementById('notif-panel')?.classList.contains('is-open')) {
      this.scrim.classList.remove('is-visible');
    }
    this.toggleBtn.setAttribute('aria-expanded', 'false');
    this.lastFocused?.focus();
  }

  closeAll() {
    this.close();
    document.getElementById('notif-panel')?.classList.remove('is-open');
    document.getElementById('bell-toggle')?.setAttribute('aria-expanded', 'false');
    this.scrim.classList.remove('is-visible');
  }

  // Keeps Tab-key focus looping inside the open drawer instead of escaping to the page behind it
  trapFocus(e) {
    const focusables = Array.from(this.drawer.querySelectorAll(this.focusableSelector));
    if (!focusables.length) return;
    const [first, last] = [focusables[0], focusables[focusables.length - 1]];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

/* =========================================================
   2. NOTIFICATION BELL
   ========================================================= */
class NotificationEngine {
  constructor() {
    this.bellBtn = document.getElementById('bell-toggle');
    this.panel = document.getElementById('notif-panel');
    this.badge = document.getElementById('bell-badge');
    this.list = document.getElementById('notif-list');
    this.scrim = document.getElementById('app-scrim');
    if (!this.bellBtn || !this.panel) return;

    this.items = [];
    this.bellBtn.addEventListener('click', () => this.toggle());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen()) this.close(); });
    document.addEventListener('click', (e) => {
      if (this.isOpen() && !this.panel.contains(e.target) && e.target !== this.bellBtn) this.close();
    });

    this.load();
  }

  isOpen() { return this.panel.classList.contains('is-open'); }

  async load() {
    const result = await window.apiService.getNotifications();
    this.items = result.ok ? result.data.notifications : [];
    this.render();
  }

  render() {
    if (!this.list) return;
    this.list.innerHTML = '';
    if (!this.items.length) {
      this.list.innerHTML = '<li class="notif-empty">You\'re all caught up — no notifications yet.</li>';
    } else {
      this.items.forEach((item) => {
        const li = document.createElement('li');
        li.className = `notif-item${item.read ? ' is-read' : ''}`;
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0');
        const time = new Date(item.timestamp);
        li.innerHTML = `
          <span class="dot" aria-hidden="true"></span>
          <div>
            <p>${escapeHtml(item.message)}</p>
            <time datetime="${item.timestamp}">${time.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>
          </div>`;
        const markRead = () => { item.read = true; this.render(); this.updateBadge(); };
        li.addEventListener('click', markRead);
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); markRead(); } });
        this.list.appendChild(li);
      });
    }
    this.updateBadge();
  }

  updateBadge() {
    const unread = this.items.filter((i) => !i.read).length;
    if (!this.badge) return;
    this.badge.hidden = unread === 0;
    this.badge.textContent = unread > 9 ? '9+' : String(unread);
  }

  toggle() { this.isOpen() ? this.close() : this.open(); }
  open() { this.panel.classList.add('is-open'); this.bellBtn.setAttribute('aria-expanded', 'true'); this.scrim.classList.add('is-visible'); }
  close() {
    this.panel.classList.remove('is-open');
    this.bellBtn.setAttribute('aria-expanded', 'false');
    if (!document.getElementById('main-drawer')?.classList.contains('is-open')) this.scrim.classList.remove('is-visible');
  }
}

/* =========================================================
   3. LOGIN STATE (guest / donor / admin) + LOGIN MODAL
   ========================================================= */
class AuthStateManager {
  constructor({ onExpired } = {}) {
    this.onExpired = onExpired;
    this.banner = document.getElementById('state-banner');
    this.state = 'unauthenticated';

    document.addEventListener('daong:auth-expired', () => this.setState('expired'));
    document.addEventListener('daong:network-error', () => this.setState('error'));
    document.addEventListener('daong:logged-out', () => this.setState('unauthenticated'));

    this.restore();
  }

  restore() {
    const token = window.apiService.TokenStore.get();
    const user = window.apiService.TokenStore.getUser();
    if (token && user) this.setState('authenticated', user);
    else this.setState('unauthenticated');
  }

  // role: 'donor' (default) or 'admin' — this is a labeled demo login,
  // not a real credential check, so both are one click away for review.
  async login(role) {
    const result = await window.apiService.login({ email: 'guest@example.com', password: 'demo', role: role || 'donor' });
    if (result.ok) this.setState('authenticated', result.data.user);
    else this.setState('error');
  }

  logout() { window.apiService.logout(); }

  setState(state, user) {
    this.state = state;
    document.body.setAttribute('data-auth-state', state === 'authenticated' ? 'authenticated' : 'unauthenticated');
    const resolvedUser = user || window.apiService.TokenStore.getUser();
    if (state === 'authenticated' && resolvedUser) {
      document.body.setAttribute('data-role', resolvedUser.role || 'donor');
    } else {
      document.body.removeAttribute('data-role');
    }
    this.renderUserChip(resolvedUser);
    this.renderBanner();
    if (state === 'expired' && this.onExpired) this.onExpired();
  }

  renderUserChip(user) {
    const nameEl = document.getElementById('drawer-user-name');
    const roleEl = document.getElementById('drawer-user-role');
    const avatarEl = document.getElementById('drawer-user-avatar');
    const topbarAvatarEl = document.getElementById('topbar-user-avatar');
    if (!user || !nameEl) return;
    nameEl.textContent = user.name;
    if (roleEl) {
      roleEl.textContent = user.role;
      roleEl.classList.toggle('is-admin', user.role === 'admin');
    }
    const initial = user.name.trim().charAt(0).toUpperCase();
    if (avatarEl) avatarEl.textContent = initial;
    if (topbarAvatarEl) topbarAvatarEl.textContent = initial;
  }

  renderBanner() {
    if (!this.banner) return;
    if (this.state === 'expired') {
      this.banner.hidden = false;
      this.banner.className = 'state-banner warn';
      this.banner.textContent = 'Session expired. Re-authenticating…';
      setTimeout(() => this.setState('unauthenticated'), 2500);
    } else if (this.state === 'error') {
      this.banner.hidden = false;
      this.banner.className = 'state-banner error';
      this.banner.textContent = 'Connection issue reaching DAONG servers. Showing the latest saved data.';
    } else {
      this.banner.hidden = true;
    }
  }
}

class AuthModal {
  constructor() {
    this.overlay = document.getElementById('auth-modal');
    this.closeBtn = document.getElementById('auth-modal-close');
    if (!this.overlay) return;
    this.closeBtn?.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    this.overlay.querySelector('[data-action="login"]')?.addEventListener('click', () => this.close());
  }
  open() { if (this.overlay) { this.overlay.hidden = false; this.overlay.querySelector('button')?.focus(); } }
  close() { if (this.overlay) this.overlay.hidden = true; }
}
