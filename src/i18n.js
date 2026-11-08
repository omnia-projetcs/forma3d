/* Local language preferences and translations. No reload or project mutation. */
var FORMA_LANG = (() => {
  const valid = value => /^(fr|en)$/i.test(value || '') ? value.toLowerCase() : null;
  const requested = valid(new URLSearchParams(location.search).get('lang'));
  let saved;
  try { saved = valid(localStorage.getItem('forma3d.language')); } catch (_) {}
  return requested || saved || (/^fr\b/i.test(navigator.language) ? 'fr' : 'en');
})();
var FI18N = (() => {
  const translations = {en: new Map(), fr: new Map()}, bindings = [];
  const attributes = ['title', 'aria-label', 'placeholder', 'alt', 'content'];
  function text(en, fr) {
    if (en !== fr) {
      const pair = {en, fr};
      translations.en.set(en, pair); translations.fr.set(fr, pair);
    }
    return FORMA_LANG === 'fr' ? fr : en;
  }
  function pairFor(value) { return translations.en.get(value) || translations.fr.get(value); }
  function bindStatic(root) {
    if (root.nodeType === Node.ELEMENT_NODE) for (const attribute of attributes) {
      const pair = pairFor(root.getAttribute(attribute));
      if (pair) { bindings.push({node: root, attribute, pair}); root.setAttribute(attribute, pair[FORMA_LANG]); }
    }
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walk.nextNode())) {
      const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (!element || element.closest('script,style,noscript,[data-i18n-ignore]')) continue;
      if (node.nodeType === Node.TEXT_NODE) {
        const pair = pairFor(node.nodeValue);
        if (pair) { bindings.push({node, pair}); node.nodeValue = pair[FORMA_LANG]; }
      } else for (const attribute of attributes) {
        const pair = pairFor(node.getAttribute(attribute));
        if (pair) { bindings.push({node, attribute, pair}); node.setAttribute(attribute, pair[FORMA_LANG]); }
      }
    }
  }
  function setLanguage(locale) {
    if (!['fr', 'en'].includes(locale) || locale === FORMA_LANG) return false;
    const previous = FORMA_LANG;
    FORMA_LANG = locale; document.documentElement.lang = locale;
    for (const {node, attribute, pair} of bindings) {
      if (!node.isConnected) continue;
      // A dynamic status or user edit takes ownership of its content.
      const current = attribute ? node.getAttribute(attribute) : node.nodeValue;
      if (current !== pair[previous]) continue;
      if (attribute) node.setAttribute(attribute, pair[locale]); else node.nodeValue = pair[locale];
    }
    try { localStorage.setItem('forma3d.language', locale); } catch (_) {}
    try {
      const url = new URL(location.href);
      url.searchParams.set('lang', locale); history.replaceState(null, '', url);
    } catch (_) {}
    return previous;
  }
  function relocalize(value, previous) {
    for (const key of Object.keys(value)) {
      const item = value[key];
      if (typeof item === 'string') value[key] = translations[previous].get(item)?.[FORMA_LANG] ?? item;
      else if (item && typeof item === 'object') relocalize(item, previous);
    }
  }
  document.documentElement.lang = FORMA_LANG;
  return {text, bindStatic, setLanguage, relocalize,
    workerLocale: () => 'var FORMA_LANG=' + JSON.stringify(FORMA_LANG) + ';\n'};
})();
