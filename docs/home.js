(() => {
  'use strict';

  const menuButton = document.querySelector('.nav-toggle');
  const navigation = document.querySelector('#site-nav');
  const header = document.querySelector('.site-header');

  function setMenuOpen(open) {
    if (!menuButton || !navigation) return;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? '關閉導覽選單' : '開啟導覽選單');
    menuButton.classList.toggle('is-open', open);
    navigation.classList.toggle('is-open', open);
  }

  menuButton?.addEventListener('click', () => {
    setMenuOpen(menuButton.getAttribute('aria-expanded') !== 'true');
  });
  navigation?.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenuOpen(false);
  });
  document.addEventListener('click', (event) => {
    if (header && !header.contains(event.target)) setMenuOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') {
      setMenuOpen(false);
      menuButton.focus();
    }
  });

  const previewTabs = Array.from(document.querySelectorAll('[data-preview]'));
  function activatePreview(selectedTab) {
    previewTabs.forEach((tab) => {
      const active = tab === selectedTab;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (panel) panel.hidden = !active;
    });
  }
  previewTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activatePreview(tab));
    tab.addEventListener('keydown', (event) => {
      let nextIndex;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % previewTabs.length;
      if (event.key === 'ArrowLeft') nextIndex = (index + previewTabs.length - 1) % previewTabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = previewTabs.length - 1;
      if (nextIndex === undefined) return;
      event.preventDefault();
      activatePreview(previewTabs[nextIndex]);
      previewTabs[nextIndex].focus();
    });
  });

  const year = document.getElementById('copyright-year');
  if (year) {
    year.textContent = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Hong_Kong' }).format(new Date());
  }
})();
