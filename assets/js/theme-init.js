/* Aplica o tema antes da pintura para evitar "flash" de cor */
(function(){try{var p=JSON.parse(localStorage.getItem('mybank.prefs')||'{}');document.documentElement.setAttribute('data-theme',p.theme==='light'?'light':'dark');}catch(e){}})();
