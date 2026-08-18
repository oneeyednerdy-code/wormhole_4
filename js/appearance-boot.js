// Apply saved appearance before the stylesheet renders to avoid a theme flash.
try {
  if (localStorage.getItem('wormhole_light_mode') === 'true') {
    document.documentElement.setAttribute('data-light-theme', '');
  }
  if (localStorage.getItem('wormhole_high_contrast') === 'true') {
    document.documentElement.setAttribute('data-high-contrast', '');
  }
  const textSize = localStorage.getItem('wormhole_text_size');
  if (['100', '125', '150', '200'].includes(textSize)) {
    document.documentElement.setAttribute('data-text-scale', textSize);
  }
  if (localStorage.getItem('wormhole_relaxed_spacing') === 'true') {
    document.documentElement.setAttribute('data-relaxed-spacing', '');
  }
  if (localStorage.getItem('wormhole_reduce_motion') === 'true') {
    document.documentElement.setAttribute('data-reduce-motion', '');
  }
  if (localStorage.getItem('wormhole_underline_links') === 'true') {
    document.documentElement.setAttribute('data-underlined-links', '');
  }
  if (localStorage.getItem('wormhole_simple_results') === 'true') {
    document.documentElement.setAttribute('data-simple-results', '');
  }
} catch {
  // Storage can be unavailable in privacy modes; dark mode remains the default.
}
