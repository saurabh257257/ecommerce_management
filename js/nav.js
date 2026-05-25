/* Shared mobile nav — include at end of body on every page */
(function () {
  const topbar = document.querySelector('.topbar');
  const sidebar = document.querySelector('.sidebar');
  if (!topbar || !sidebar) return;

  // Inject hamburger button before the page title
  const ham = document.createElement('button');
  ham.className = 'hamburger';
  ham.setAttribute('aria-label', 'Toggle menu');
  ham.innerHTML = '<span></span><span></span><span></span>';
  topbar.insertBefore(ham, topbar.firstChild);

  // Inject overlay behind the open sidebar
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('show');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  }

  ham.addEventListener('click', () =>
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar()
  );
  overlay.addEventListener('click', closeSidebar);

  // Close on nav link tap on mobile
  sidebar.querySelectorAll('.nav-link').forEach(a =>
    a.addEventListener('click', () => { if (window.innerWidth <= 768) closeSidebar(); })
  );

  // Wrap every table inside a .card in a scroll container
  document.querySelectorAll('.card table').forEach(t => {
    if (t.closest('.tbl-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'tbl-wrap';
    t.parentNode.insertBefore(wrap, t);
    wrap.appendChild(t);
  });

  // ── Dynamic team member sidebar injection ──────────────────
  fetch('/api/team-members')
    .then(r => r.json())
    .then(({ data: members }) => {
      if (!members || !members.length) return;
      const nav = document.querySelector('.sidebar-nav');
      if (!nav) return;

      const currentPage = location.pathname.split('/').pop() || 'index.html';
      const currentName = new URLSearchParams(location.search).get('name') || '';

      // Find Team section header
      const teamSec = [...nav.querySelectorAll('.nav-sec, div[style*="padding"]')].find(el => el.textContent.trim() === 'Team');
      if (teamSec) {
        // Collect and remove existing team nav-links right after Team header
        const toRemove = [];
        let el = teamSec.nextElementSibling;
        while (el && el.tagName === 'A' && el.classList.contains('nav-link')) {
          toRemove.push(el);
          el = el.nextElementSibling;
        }
        const insertBefore = el; // first non-link after Team section
        toRemove.forEach(e => e.remove());

        // Insert dynamic member links
        members.forEach(member => {
          const isActive = (currentPage === 'team.html' && currentName === member.name) ||
                           (currentPage === member.name.toLowerCase() + '.html');
          const a = document.createElement('a');
          a.href = 'team.html?name=' + encodeURIComponent(member.name);
          a.className = 'nav-link' + (isActive ? ' active' : '');
          a.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>${member.name}`;
          nav.insertBefore(a, insertBefore || null);
        });
      }

      // Add Admin section + link if not already present
      if (!nav.querySelector('a[href="admin.html"]')) {
        const adminSec = document.createElement('div');
        adminSec.style.cssText = 'padding:10px 12px 4px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px';
        adminSec.textContent = 'Admin';
        nav.appendChild(adminSec);
        const adminLink = document.createElement('a');
        adminLink.href = 'admin.html';
        adminLink.className = 'nav-link' + (currentPage === 'admin.html' ? ' active' : '');
        adminLink.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>Admin`;
        nav.appendChild(adminLink);
      }
    })
    .catch(() => {});
})();
