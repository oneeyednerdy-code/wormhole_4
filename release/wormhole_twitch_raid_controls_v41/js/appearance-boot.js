// Apply saved appearance before the stylesheet renders to avoid a theme flash.
try {
  if (localStorage.getItem('wormhole_light_mode') === 'true') {
    document.documentElement.setAttribute('data-light-theme', '');
  }
  if (localStorage.getItem('wormhole_high_contrast') === 'true') {
    document.documentElement.setAttribute('data-high-contrast', '');
  }
} catch {
  // Storage can be unavailable in privacy modes; dark mode remains the default.
}
