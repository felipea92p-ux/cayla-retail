// /textos · medir en el navegador — se pega ENTERO en `javascript_tool` con la pantalla (o la hoja) ya abierta y a la vista.
// Lee el texto que la persona VE (innerText, después de CSS) y el que está escrito (textContent). Devuelve lo que FALLA
// (etiqueta: Medido). No toca la página. Las reglas y su porqué: SKILL.md, «Las reglas al milímetro».
// Correlo a 1440 × 900 y a 375 × 812 (`resize_window`): lo que se corta o salta de renglón cambia con el ancho.
(() => {
  if (!innerWidth || !innerHeight) return { error: 'El panel está oculto: la página mide 0×0. Ábrelo y repite.' };
  const vis = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  };
  const limpio = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const pista = (el) => `${el.tagName.toLowerCase()} «${limpio(el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder).slice(0, 50)}»`;
  const papel = (el) => !!el.closest('.papel-fijo,[data-papel],[data-color-dato]'); // boleta, ticket, etiqueta: tienen su norma
  // `sr-only` recorta a 1×1 px A PROPÓSITO (es para el lector de pantalla): no es un texto «cortado» que alguien vea.
  const soloLector = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width <= 1 && r.height <= 1 && /hidden|clip/.test(s.overflow + s.overflowX); };
  const todos = [...document.body.querySelectorAll('*')].filter((e) => vis(e) && !soloLector(e));
  const hojas = todos.filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  const textoVisto = limpio(document.body.innerText);

  // ── R01–R02 · vocabulario a la vista
  const prohibidas = /(?<!\bla\s)\bbienvenid[oa]s?\b|\b(clientas?|socias?|emplead[oa]s?|jef[ea]s?|sucursal(es)?)\b/gi;
  const vocabulario = [...new Set(textoVisto.match(prohibidas) || [])];

  // ── R05–R08 · botones
  const botones = todos.filter((e) => e.matches('button,[role=button],a.btn-cayla,a[class*="btn-"]'));
  const textoBoton = (b) => limpio(b.innerText) || limpio(b.getAttribute('aria-label'));
  const genericos = botones.filter((b) => /^(ok|aceptar|enviar|submit|sí|si|continuar|click aquí|aquí)$/i.test(textoBoton(b))).map(pista);
  const exportar = botones.filter((b) => /\bexportar\b/i.test(textoBoton(b))).map(pista);
  // Mayúsculas escritas a mano: el texto ESCRITO ya viene en mayúsculas (no las pone `text-transform`).
  const siglas = /^(SUNAT|IGV|RUC|DNI|PDF|CSV|SKU|CAYLA|AQP|TRU|LIM|USD|PEN|POS|QR|OK)$/;
  const mayusculasAMano = hojas.filter((e) => !papel(e)).map((e) => [e, limpio([...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '))])
    .filter(([, t]) => t.length >= 4 && /\p{Lu}{2}/u.test(t) && t === t.toUpperCase() && !siglas.test(t) && /\p{L}{4}/u.test(t))
    .slice(0, 15).map(([e, t]) => `${e.tagName.toLowerCase()} «${t.slice(0, 40)}»`);
  const tituloDeTitulo = [...botones, ...todos.filter((e) => /^H[1-4]$/.test(e.tagName))]
    .map((e) => [e, textoBoton(e)])
    .filter(([, t]) => /^(\p{Lu}\p{Ll}+)( (de|del|la|el|y|en|por|a)? ?\p{Lu}\p{Ll}+){2,}$/u.test(t))
    .slice(0, 10).map(([e, t]) => `${e.tagName.toLowerCase()} «${t}» — ¿nombre propio o Mayúscula De Título?`);

  // ── R10–R12 · errores a la vista (role=alert + los pies de error de los campos)
  const errores = todos.filter((e) => e.matches('[role=alert],.pie-error,[aria-invalid=true] ~ *'));
  const textoError = errores.map((e) => limpio(e.innerText)).filter(Boolean);
  const erroresMalos = textoError.filter((t) => /inv[aá]lid|incorrect|err[oó]ne|^error\b|ocurrió un error|algo salió mal|[!¡]|por favor/i.test(t));
  const erroresCortos = textoError.filter((t) => t.split(' ').length < 4); // «Requerido», «Campo obligatorio»: no dice cómo arreglarlo
  // Un campo marcado con error debe decir CUÁL en texto (WCAG 3.3.1) y estar enlazado (aria-describedby o pie del Campo).
  const invalidosMudos = todos.filter((e) => e.matches('[aria-invalid=true]')).filter((e) => {
    const ids = (e.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    return !ids.some((id) => limpio(document.getElementById(id)?.innerText));
  }).map(pista);

  // ── Etiquetas: un campo sin etiqueta visible ni nombre accesible, que solo tiene placeholder (NN/g; WCAG 3.3.2)
  const campos = todos.filter((e) => e.matches('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea,[role=combobox]'));
  const nombre = (e) => limpio(e.getAttribute('aria-label')) || (e.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => limpio(document.getElementById(id)?.innerText)).join(' ').trim() || (e.id && limpio(document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.innerText)) || limpio(e.closest('label')?.innerText);
  const soloPlaceholder = campos.filter((e) => !nombre(e) && e.placeholder).map(pista);
  const placeholderPuntos = campos.filter((e) => /\.\.\.$/.test(e.placeholder || '')).map(pista);

  // ── R15–R18 · formatos en lo que se ve
  const sinPuntosSuspensivos = [...new Set(textoVisto.match(/\p{L}\.\.\.(?!\.)/gu) || [])];
  const montoPartible = [];
  for (const e of hojas) for (const n of e.childNodes) if (n.nodeType === 3 && /S\/ \d/.test(n.textContent)) montoPartible.push(`${e.tagName.toLowerCase()} «${limpio(n.textContent).slice(0, 40)}» (espacio normal tras S/)`);
  const montoMal = [...new Set(textoVisto.match(/S\/\.?\d[\d,.]*|S\/\.\s?\d[\d,.]*|\d[\d,.]* soles\b|PEN ?\d[\d,.]*/g) || [])];
  const decimalComa = [...new Set(textoVisto.match(/S\/\s?\d{1,3}(\.\d{3})+,\d{2}\b/g) || [])]; // «S/ 1.234,50»: no es el formato del ERP
  const fechaIso = [...new Set(textoVisto.match(/\b20\d{2}-\d{2}-\d{2}\b/g) || [])]; // una fecha cruda de la base a la vista
  const fechaUs = [...new Set(textoVisto.match(/\b(1[0-2]|0?[1-9])\/(1[3-9]|2\d|3[01])\/\d{2,4}\b/g) || [])]; // mes/día: «11/25/2026»
  const horaMal = [...new Set(textoVisto.match(/\b\d{1,2}:\d{2} ?(AM|PM|am|pm|a\.m\.|p\.m\.)(?!\s?m)/g) || [])]; // es «4:30 p. m.» o «16:30»

  // ── Largo: texto que se corta (ellipsis o recorte) o un botón que salta a dos renglones
  const cortados = hojas.filter((e) => e.scrollWidth > e.clientWidth + 1 && /hidden|clip/.test(getComputedStyle(e).overflowX)).slice(0, 12).map(pista);
  // Un botón «en dos» es UN texto que salta de renglón. Se cuentan los renglones de cada nodo de texto (Range), no el alto de su caja:
  // un botón con nombre y cargo en dos líneas a propósito (el de la persona en el lateral) tiene dos textos de un renglón cada uno.
  const renglones = (n) => { const rg = document.createRange(); rg.selectNodeContents(n); const tops = [...rg.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round(q.top)); return new Set(tops).size; };
  const botonEnDos = botones.filter((b) => {
    const paseo = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.textContent.trim() ? 1 : 2) });
    for (let t = paseo.nextNode(); t; t = paseo.nextNode()) if (vis(t.parentElement) && !soloLector(t.parentElement) && renglones(t) > 1) return true;
    return false;
  }).slice(0, 10).map(pista);

  // ── Accesibilidad de los avisos (WCAG 4.1.3): un aviso a la vista tiene role=status o role=alert
  const avisosSinRol = todos.filter((e) => e.matches('[data-aviso],.aviso-cayla,[class*="toast"]') && !e.closest('[role=status],[role=alert],[aria-live]')).map(pista);

  const r = {
    ancho: innerWidth,
    vocabulario, genericos, exportar, mayusculasAMano, tituloDeTitulo,
    erroresMalos, erroresCortos, invalidosMudos, soloPlaceholder, placeholderPuntos,
    sinPuntosSuspensivos, montoPartible: montoPartible.slice(0, 10), montoMal, decimalComa, fechaIso, fechaUs, horaMal,
    cortados, botonEnDos, avisosSinRol,
  };
  const fallas = Object.entries(r).filter(([k, v]) => k !== 'ancho' && v.length).map(([k]) => k);
  return { ...Object.fromEntries(Object.entries(r).filter(([k, v]) => k === 'ancho' || v.length)), resumen: fallas.length ? `Fallan: ${fallas.join(', ')}` : 'Sin fallas de texto medibles en esta vista' };
})();
