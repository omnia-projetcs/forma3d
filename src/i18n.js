/* Shared by the UI, Web Workers and Node tests. No network or storage dependency. */
'use strict';
var FI = (() => {
  const supported = ['en', 'fr'];
  const storageKey = 'forma3d-language';
  const normalize = value => String(value || '').toLowerCase().split(/[-_]/)[0];
  let language = 'en';
  let preferred;
  try { preferred = globalThis.localStorage?.getItem(storageKey); } catch {}
  if (supported.includes(preferred)) language = preferred;
  else if (typeof document !== 'undefined') {
    language = (navigator.languages || [navigator.language]).map(normalize).find(l => supported.includes(l)) || 'en';
  }
  function t(source) {
    if (language === 'fr') return source;
    const key = source.trim();
    return Object.hasOwn(FORMA_EN, key) ? source.replace(key, () => FORMA_EN[key]) : source;
  }
  const bindings = [];
  function mount(root = document) {
    // Capture only the static shell, before the app inserts any user content.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest('script,style,noscript')) continue;
      if (Object.hasOwn(FORMA_EN, node.data.trim())) bindings.push({node, source: node.data});
    }
    root.querySelectorAll('[title],[aria-label],[placeholder],meta[name=description]').forEach(node => {
      for (const attr of ['title', 'aria-label', 'placeholder', 'content']) {
        const source = node.getAttribute(attr);
        if (source && Object.hasOwn(FORMA_EN, source.trim())) bindings.push({node, attr, source});
      }
    });
    render();
  }
  function render() {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = language;
    for (const {node, attr, source} of bindings) {
      if (!node.isConnected) continue;
      if (attr) node.setAttribute(attr, t(source));
      else node.data = t(source);
    }
    const select = document.getElementById('languageSelect');
    if (select) select.value = language;
  }
  function setLanguage(value, persist = true) {
    if (!supported.includes(value)) return false;
    language = value;
    if (persist) { try { globalThis.localStorage?.setItem(storageKey, value); } catch {} }
    render();
    if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('forma-languagechange'));
    return true;
  }
  function relocalize(text) {
    const source = Object.keys(FORMA_EN).find(key => FORMA_EN[key] === text) || text;
    for (const prefix of ['Ajouter ', 'Importer ', 'Extrusion de face ', 'Paramètre : ']) {
      const translated = prefix.replace(prefix.trim(), FORMA_EN[prefix.trim()] || prefix.trim());
      for (const candidate of [prefix, translated]) {
        if (source.startsWith(candidate)) return t(prefix) + relocalize(source.slice(candidate.length));
      }
    }
    return t(source);
  }
  return {t, mount, setLanguage, relocalize, get language() {return language;}, get locale() {return language === 'fr' ? 'fr-FR' : 'en-GB';}};
})();
