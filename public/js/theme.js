// public/js/theme.js
(function() {
  let theme = localStorage.getItem('theme');
  if (!theme) {
    theme = 'light';
    localStorage.setItem('theme', 'light');
  }
  
  if (theme === 'dark') {
    document.documentElement.classList.add('dark-theme');
  } else {
    document.documentElement.classList.remove('dark-theme');
  }

  const perfMode = localStorage.getItem('performance_mode');
  if (perfMode === 'true') {
    document.documentElement.classList.add('performance-mode');
  }
})();
