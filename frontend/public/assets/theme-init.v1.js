// Pre-paint theme (classic script, runs before the app bundle). An external file because the CSP is
// script-src 'self' with no inline scripts. Served from /assets with a one-year immutable cache:
// bump the file name (v2, v3...) whenever this changes, and update index.html.
try {
  var t = localStorage.getItem('our-story-theme');
  if (t === 'rose' || t === 'cinema') document.documentElement.dataset.theme = t;
  if (localStorage.getItem('our-story-midnight') === 'true') document.documentElement.dataset.midnight = 'true';
} catch (e) {}
