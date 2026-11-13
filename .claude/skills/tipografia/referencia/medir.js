// Tipografía al milímetro — se pega ENTERO en `javascript_tool` con la pantalla ya cargada y el panel visible (oculto mide 0).
// Devuelve lo que FALLA, con etiqueta «Medido». No cambia la página: los modos que tocan estilos los quitan antes de terminar.
// Umbrales y su porqué: ../SKILL.md («Las reglas al milímetro»). Mide a 1440 × 900 primero y luego 1024 × 768: cuando la TABLA es angosta
// (no la ventana: `tabla-corte.css` mira el contenedor) pasa a su forma de celular y alinea todo a la izquierda a propósito; esas filas no se juzgan.
//
// MODO (cámbialo en la línea de abajo antes de pegar):
//   'medir'                → tamaños de lectura, interlineado, medida, pesos, cifras (tabulares, columnas, decimales, «S/» partible)
//   'espaciado'            → WCAG 1.4.12: fuerza interlineado 1.5, letras 0.12 em, palabras 0.16 em, párrafos 2 em y busca lo que se recorta
//   'letra-del-navegador'  → sube la letra raíz de 16 a 20 px (como quien agranda la letra en su navegador) y cuenta lo que no la sigue
(() => {
  const MODO = 'medir';

  const PISO_LECTURA = 14;        // CLAUDE.md «La letra de lectura y su «?»» (ADR-0358, ronda 19)
  const PISO_ETIQUETA = 11;       // las versalitas de 11 px son decididas; debajo de eso, nada
  const INTERLINEA_MIN = 1.4;     // párrafo de 2+ líneas (consenso 14/20 de los sistemas; 1.5 es el AAA de 1.4.8)
  const MEDIDA_MAX = 80;          // WCAG 1.4.8 (AAA); lo cómodo es 45–75 (Bringhurst)
  const MEDIDA_AVISO = 75;
  const TOPE = 12;                // cuántos ejemplos por lista

  if (!innerWidth || !innerHeight) return { error: 'El panel está oculto: la página mide 0×0 y toda medición sería falsa. Ábrelo y repite.' };

  const r1 = (v) => Math.round(v * 10) / 10;
  const vis = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
  };
  const textoPropio = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim();
  // Fuera de la medición: gráficos (svg), papel impreso, lo que el lector de pantalla no lee y el código.
  const FUERA = 'svg, [data-papel], .papel-fijo, [aria-hidden="true"], script, style, noscript, code, pre';
  const marca = (el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 48);
  const pista = (el) => {
    const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter((x) => !x.includes(':')).slice(0, 3).join('.') : '';
    return `${el.tagName.toLowerCase()}${c ? '.' + c : ''} «${marca(el)}»`;
  };
  const familia = (s) => s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
  const esVersalita = (s) => s.textTransform === 'uppercase' || /small-caps/.test(s.fontVariantCaps) || (parseFloat(s.letterSpacing) || 0) / parseFloat(s.fontSize) >= 0.05;
  const esMono = (s) => /mono|consolas|menlo/i.test(s.fontFamily);
  const enControl = (el) => !!el.closest('button, [role=button], [role=tab], [role=option], [role=menuitem], label, th, [role=columnheader], .btn-cayla, input, textarea');

  // `sr-only` (1×1 px recortado) es texto para el lector de pantalla, no letra que alguien lea: antes salía como «etiqueta de 10,5 px».
  const soloLector = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width <= 1 && r.height <= 1 && /hidden|clip/.test(s.overflow + s.overflowX); };
  // Lo de afuera de <main> (lateral, cabecera, buscador global) es el MARCO: se marca «[marco]» para no cargárselo a la pantalla.
  const main = document.querySelector('main');
  const conTexto = [...document.body.querySelectorAll('*')].filter((el) => !el.closest(FUERA) && textoPropio(el).length > 0 && vis(el) && !soloLector(el));
  const lado = (el) => (main && !main.contains(el) ? ' [marco]' : '');

  // ───────────────────────── MODO letra-del-navegador ─────────────────────────
  if (MODO === 'letra-del-navegador') {
    const antes = new Map(conTexto.map((el) => [el, parseFloat(getComputedStyle(el).fontSize)]));
    const raiz = document.documentElement, previo = raiz.style.fontSize;
    raiz.style.fontSize = '20px';
    const noSigue = [], porTamano = {};
    for (const [el, t0] of antes) {
      const t1 = parseFloat(getComputedStyle(el).fontSize);
      if (t1 / t0 < 1.2) { noSigue.push(el); porTamano[t0] = (porTamano[t0] || 0) + 1; }
    }
    raiz.style.fontSize = previo;
    return {
      modo: MODO, etiqueta: 'Medido',
      textos: antes.size, noSiguenLaLetraDelNavegador: noSigue.length,
      porTamanoOriginal: porTamano,
      ejemplos: noSigue.slice(0, TOPE).map((el) => `${pista(el)} ${antes.get(el)}px`),
      lectura: 'Lo que no sigue está escrito en px (text-[13px], font-size: 15px): el zoom del navegador sí lo agranda, la letra del navegador no. Ver propuesta 4.',
    };
  }

  // ───────────────────────── MODO espaciado (WCAG 1.4.12) ─────────────────────────
  if (MODO === 'espaciado') {
    const recortado = (el) => {
      const s = getComputedStyle(el);
      const corta = /hidden|clip/.test(s.overflow + s.overflowX + s.overflowY) || s.textOverflow === 'ellipsis' || /-webkit-box/.test(s.display);
      return corta && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    };
    const cajas = [...document.body.querySelectorAll('*')].filter((el) => !el.closest(FUERA) && vis(el) && el.textContent.trim());
    const antes = new Set(cajas.filter(recortado));
    const estilo = document.createElement('style');
    estilo.textContent = '*{line-height:1.5!important;letter-spacing:0.12em!important;word-spacing:0.16em!important}p{margin-bottom:2em!important}';
    document.head.appendChild(estilo);
    void document.body.offsetHeight; // fuerza el reflujo antes de medir
    const nuevos = cajas.filter((el) => !antes.has(el) && recortado(el));
    // Dos cajas de texto que se pisan (F104): una muestra barata, solo hermanos con texto.
    const pisadas = [];
    for (const el of cajas.slice(0, 1500)) {
      const sig = el.nextElementSibling;
      if (!sig || !vis(sig) || !sig.textContent.trim()) continue;
      const a = el.getBoundingClientRect(), b = sig.getBoundingClientRect();
      const solape = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
      if (solape && getComputedStyle(el).position === 'static' && getComputedStyle(sig).position === 'static') pisadas.push(`${pista(el)} ⟂ ${pista(sig)}`);
    }
    estilo.remove();
    return {
      modo: MODO, etiqueta: 'Medido', norma: 'WCAG 2.2 · 1.4.12 Text Spacing (AA)',
      recortadosNuevos: nuevos.length,
      ejemplos: nuevos.slice(0, TOPE).map((el) => `${pista(el)}${el.title || el.closest('[title]') ? ' (tiene title: el texto completo se puede ver)' : ' (SIN forma de ver el texto completo: falla)'}`),
      pisadas: pisadas.slice(0, TOPE),
      lectura: 'Un recorte nuevo suele ser un alto fijo (h-10, height: 40px) en una caja con texto: va min-height + padding. Una elipsis pasa solo si hay title, tooltip o expansión.',
    };
  }

  // ───────────────────────── MODO medir ─────────────────────────
  const lienzo = document.createElement('canvas').getContext('2d');
  const anchoTexto = (s, t) => { lienzo.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`; return lienzo.measureText(t).width; };

  // Líneas reales de un bloque: los rectángulos del texto agrupados por su altura en la página.
  const lineasDe = (el, lh) => {
    const rango = document.createRange();
    rango.selectNodeContents(el);
    const tops = [...rango.getClientRects()].filter((r) => r.width > 1).map((r) => r.top).sort((a, b) => a - b);
    let n = 0, ultimo = -Infinity;
    for (const t of tops) if (t - ultimo > lh * 0.5) { n++; ultimo = t; }
    return n;
  };

  const lecturaChica = [], interlineadoCorto = [], lineasLargas = [], medidaAviso = [], etiquetaBajoPiso = [];
  const tamanos = {}, pesos = {};
  for (const el of conTexto) {
    const s = getComputedStyle(el), t = textoPropio(el), fs = parseFloat(s.fontSize);
    tamanos[r1(fs)] = (tamanos[r1(fs)] || 0) + 1;
    (pesos[familia(s)] ||= new Set()).add(s.fontWeight);
    const versalita = esVersalita(s), mono = esMono(s);
    const palabras = t.split(' ').filter((p) => /\p{L}/u.test(p)).length;
    const lectura = !versalita && !mono && !enControl(el) && palabras >= 4;
    if (lectura && fs < PISO_LECTURA) lecturaChica.push(`${pista(el)} ${r1(fs)}px${lado(el)}`);
    if (!lectura && fs < PISO_ETIQUETA) etiquetaBajoPiso.push(`${pista(el)} ${r1(fs)}px${versalita ? ' (versalita)' : ''}${lado(el)}`);
    if (!lectura) continue;
    // 'normal' en DM Sans rinde ~1.30 (métricas typo 992/−310, sin lineGap): se cuenta como corto.
    const lh = s.lineHeight === 'normal' ? fs * 1.3 : parseFloat(s.lineHeight);
    const lineas = lineasDe(el, lh);
    if (lineas >= 2 && lh / fs < INTERLINEA_MIN) interlineadoCorto.push(`${pista(el)} ${r1(fs)}/${r1(lh)} = ${(lh / fs).toFixed(2)}${s.lineHeight === 'normal' ? ' (normal)' : ''}`);
    if (lineas >= 2) {
      const caja = el.getBoundingClientRect().width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
      const muestra = el.textContent.replace(/\s+/g, ' ').trim();
      const porCaracter = anchoTexto(s, muestra) / muestra.length;
      const cpl = Math.round(caja / porCaracter);
      if (cpl > MEDIDA_MAX) lineasLargas.push(`${pista(el)} ≈${cpl} caracteres por línea`);
      else if (cpl > MEDIDA_AVISO) medidaAviso.push(`${pista(el)} ≈${cpl}`);
    }
  }
  const pesosPorFamilia = Object.fromEntries(Object.entries(pesos).map(([f, set]) => [f, [...set].sort()]));
  const demasiadosPesos = Object.entries(pesosPorFamilia).filter(([, ws]) => ws.length > 4).map(([f, ws]) => `${f}: ${ws.join(', ')}`);

  // ── Cifras ──
  // ¿La letra tiene cifras del mismo ancho? Se escribe «1111» y «0000» con la letra, el peso y las funciones EXACTAS del elemento.
  // Si miden distinto, las cifras son proporcionales y `tabular-nums` no hizo nada (DM Sans de Google Fonts: no tiene `tnum`).
  const NUM = /^[−\-+]?\s?(S\/)?[\s ]?[−\-]?\d[\d.,  ]*\s?%?$/;
  const cache = new Map();
  const tabularDe = (s) => {
    const clave = [s.fontFamily, s.fontWeight, s.fontStyle, s.fontVariantNumeric, s.fontFeatureSettings].join('|');
    if (cache.has(clave)) return cache.get(clave);
    const span = document.createElement('span');
    Object.assign(span.style, { position: 'absolute', left: '-9999px', top: '0', visibility: 'hidden', whiteSpace: 'pre', fontSize: '40px',
      fontFamily: s.fontFamily, fontWeight: s.fontWeight, fontStyle: s.fontStyle, fontVariantNumeric: s.fontVariantNumeric, fontFeatureSettings: s.fontFeatureSettings });
    document.body.appendChild(span);
    span.textContent = '1111'; const uno = span.getBoundingClientRect().width;
    span.textContent = '0000'; const cero = span.getBoundingClientRect().width;
    span.remove();
    const r = { tiene: Math.abs(uno - cero) < 0.5, diferencia: r1(Math.abs(uno - cero)) };
    cache.set(clave, r);
    return r;
  };
  const familias = new Map();
  let pideYNoTiene = 0, cifrasProporcionales = 0;
  const ejemplosPideYNoTiene = [];
  for (const el of conTexto) {
    const t = textoPropio(el);
    if (!NUM.test(t)) continue;
    const s = getComputedStyle(el);
    const pide = /tabular-nums/.test(s.fontVariantNumeric) || /"tnum"/.test(s.fontFeatureSettings);
    const { tiene, diferencia } = tabularDe(s);
    const k = `${familia(s)} ${s.fontWeight}`;
    const f = familias.get(k) || { familia: familia(s), peso: s.fontWeight, cifras: 0, pidenTabulares: 0, tieneTabulares: tiene, diferencia1111vs0000: diferencia };
    f.cifras++; if (pide) f.pidenTabulares++;
    familias.set(k, f);
    if (pide && !tiene) { pideYNoTiene++; if (ejemplosPideYNoTiene.length < TOPE) ejemplosPideYNoTiene.push(pista(el)); }
    if (!tiene) cifrasProporcionales++;
  }

  // Columnas numéricas: filas de una tabla (tr, role=row, .fila-cayla); una celda es numérica si TODO su texto es una cifra.
  // Alineada = los bordes derechos del texto coinciden (±1,5 px). Decimales = los mismos en toda la columna.
  const columnas = new Map();
  // Una fila en su forma de celular (una sola columna: `tabla-corte-*`, que mira el ancho de la TABLA y no el de la ventana, ADR-0610 act.)
  // alinea todo a la izquierda a propósito: no tiene columnas que juzgar. Antes eso solo pasaba bajo 640 px; desde el corte por contenedor
  // pasa también a 1024 con el lateral abierto, y salía «columna sin alinear».
  const apilada = (f) => { const s = getComputedStyle(f); return s.display.includes('grid') && !/\s/.test(s.gridTemplateColumns.trim()); };
  const filas = [...document.querySelectorAll('tr, [role=row], .fila-cayla')].filter((f) => vis(f) && !f.closest(FUERA) && !f.matches('.encabezado-tabla-cayla, thead tr') && !apilada(f));
  for (const fila of filas) {
    [...fila.children].forEach((celda, i) => {
      const t = celda.textContent.replace(/\s+/g, ' ').trim();
      if (!t || !NUM.test(t) || !vis(celda)) return;
      const rango = document.createRange(); rango.selectNodeContents(celda);
      const derecha = Math.max(...[...rango.getClientRects()].filter((r) => r.width > 0).map((r) => r.right));
      const dec = (t.match(/\.(\d+)\s?%?$/) || [, ''])[1].length;
      const clave = fila.parentElement;
      if (!columnas.has(clave)) columnas.set(clave, new Map());
      const col = columnas.get(clave);
      if (!col.has(i)) col.set(i, { derechas: [], decimales: new Set(), muestra: t, alinea: getComputedStyle(celda).textAlign });
      const c = col.get(i); c.derechas.push(derecha); c.decimales.add(dec);
    });
  }
  const columnasSinAlinear = [], decimalesMezclados = [];
  for (const [tabla, col] of columnas) for (const [i, c] of col) {
    if (c.derechas.length < 3) continue;
    const dispersion = Math.max(...c.derechas) - Math.min(...c.derechas);
    const donde = `${pista(tabla).slice(0, 60)} · columna ${i + 1} («${c.muestra}»)`;
    if (dispersion > 1.5) columnasSinAlinear.push(`${donde}: los bordes derechos varían ${r1(dispersion)} px (text-align: ${c.alinea})`);
    if (c.decimales.size > 1) decimalesMezclados.push(`${donde}: decimales ${[...c.decimales].join(' y ')}`);
  }

  // «S/» seguido de un espacio normal: el renglón puede partirlo (ADR-0413). El código lo vigila `lib/montos-sin-corte.test.ts`;
  // esto atrapa lo que llega de la base o de un texto armado en el navegador.
  const montoPartible = [];
  const caminante = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = caminante.nextNode(); n; n = caminante.nextNode()) {
    if (/S\/ \d|S\/ [−\-]/.test(n.textContent) && n.parentElement && !n.parentElement.closest(FUERA) && vis(n.parentElement)) montoPartible.push(pista(n.parentElement));
  }

  return {
    modo: MODO, etiqueta: 'Medido', ancho: `${innerWidth}×${innerHeight}`, lang: document.documentElement.lang,
    letrasCargadas: document.fonts.status,
    resumen: {
      lecturaBajo14: lecturaChica.length, etiquetasBajo11: etiquetaBajoPiso.length, interlineadoCorto: interlineadoCorto.length,
      lineasDeMasDe80: lineasLargas.length, cifrasQuePidenTabularesYNoLosTienen: pideYNoTiene, cifrasProporcionales,
      columnasSinAlinear: columnasSinAlinear.length, columnasConDecimalesMezclados: decimalesMezclados.length,
      montosPartibles: montoPartible.length, tamanosDistintos: Object.keys(tamanos).length,
    },
    lecturaChica: lecturaChica.slice(0, TOPE),
    etiquetaBajoPiso: etiquetaBajoPiso.slice(0, TOPE),
    interlineadoCorto: interlineadoCorto.slice(0, TOPE),
    lineasLargas: lineasLargas.slice(0, TOPE), medidaEntre75y80: medidaAviso.slice(0, TOPE),
    cifras: { familias: [...familias.values()], ejemplosPideYNoTiene, columnasSinAlinear: columnasSinAlinear.slice(0, TOPE), decimalesMezclados: decimalesMezclados.slice(0, TOPE) },
    montoPartible: montoPartible.slice(0, TOPE),
    tamanos, pesosPorFamilia, demasiadosPesos,
    lectura: 'tieneTabulares:false en una familia con pidenTabulares > 0 es el hallazgo de DM Sans (propuesta 1). Si letrasCargadas no es «loaded», espera y repite: midió la letra de respaldo.',
  };
})();
