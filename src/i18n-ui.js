/* Runs in the editor closure. Language changes retain scene, history and clipboard. */
function changeLanguage(locale) {
  if (busy || gesture || $('modal').open) return false;
  const previous = FI18N.setLanguage(locale);
  if (!previous) return false;
  for (const labels of [SHAPES, PARAM_LABELS, RESIZE_NAMES, FORMA_DEMO,
    FSketch.PLANES, FExtended.specs, FThread.specs,
    FText.fonts.sans, FText.fonts.serif, FText.fonts.mono]) FI18N.relocalize(labels, previous);
  Object.assign(toolText, toolLocales[locale]);
  materialPresets[4].name = tx('aluminum'); materialPresets[5].name = tx('steel');
  filletCache = null;
  renderLibrary(); renderCharacterModels(); update(); renderer.request();
  $('languageSelect').value = locale;
  return true;
}
const languageUpdate = update;
update = function () {
  languageUpdate();
  const select = $('languageSelect');
  if (select) select.disabled = busy || !!gesture;
};
queueMicrotask(() => {
  // Capture only persistent application chrome; user names and model content
  // are deliberately outside these roots.
  for (const selector of ['.studio-switch', '.studio-rail', '.studio-quick', '.character-bases', '.character-model-library']) {
    const root = document.querySelector(selector);
    if (root) FI18N.bindStatic(root);
  }
  const select = $('languageSelect');
  select.value = FORMA_LANG;
  select.onchange = () => { if (!changeLanguage(select.value)) select.value = FORMA_LANG; };
  if (window.FORMA) window.FORMA.changeLanguage = changeLanguage;
});
