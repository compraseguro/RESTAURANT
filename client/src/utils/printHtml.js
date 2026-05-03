/**
 * Imprime HTML desde un iframe oculto (misma pestaña). Suele evitar el bloqueo
 * de ventanas emergentes que ocurre con window.open + print.
 *
 * @param {string} html - Documento HTML completo (recomendado: incluir charset utf-8 en <head>)
 * @param {string} [title] - Título accesible del iframe
 * @returns {boolean} false si no se pudo preparar el documento
 */
export function printHtmlDocument(html, title = 'Imprimir') {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', title);
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;visibility:hidden;';
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    return false;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const remove = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch (_) {
      remove();
      return;
    }
    setTimeout(remove, 1200);
  }, 120);
  return true;
}
