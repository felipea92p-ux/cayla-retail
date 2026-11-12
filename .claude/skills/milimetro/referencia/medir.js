// Al milímetro · estados — se pega ENTERO en `javascript_tool` con la pantalla ya cargada y el panel visible (oculto, todo mide 0).
// Devuelve lo que FALLA o hay que REVISAR en el modelo de estados (etiqueta: Medido). No pulsa nada, no guarda nada, no escribe en la base.
// Opciones (opcional), ANTES de pegarlo:  window.__milimetro = { raiz: "<selector>", foco: true }
//   raiz → mide solo dentro de ese elemento (auditar una pieza).
//   foco → además ENFOCA cada control (sin clic) para medir el anillo y si lo tapa algo fijo. Mueve el scroll: al final devuelve el foco y el
//          scroll como estaban. Córrelo en una segunda pasada, no en la primera, y nunca con una hoja que se cierra al perder el foco.
// Umbrales y fuentes: referencia/estados.md. Lo que dice «revisar» se confirma con grep antes de darlo por hallazgo.
(() => {
  if (!innerWidth || !innerHeight) return { error: 'El panel está oculto: la página mide 0×0 y toda medición sería falsa. Ábrelo y repite.' };
  const op = window.__milimetro || {};
  const raiz = op.raiz ? document.querySelector(op.raiz) : document.body;
  if (!raiz) return { error: `No hay ningún elemento con «${op.raiz}».` };
  const html = document.documentElement;

  const vis = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  };
  const marca = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
  const pista = (el) => `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} «${marca(el)}»`;
  const corta = (lista, n = 12) => ({ total: lista.length, ejemplos: lista.slice(0, n) });

  // Colores: Chrome devuelve oklab(), color-mix()… que un regex no lee; un canvas de 1×1 los traduce a sRGB (mismo truco que /formidable).
  const cx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  const memo = new Map();
  const rgba = (c) => {
    if (!memo.has(c)) { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; memo.set(c, { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }); }
    return memo.get(c);
  };
  const sobre = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; };
  // Fondo real aproximado: compone los background-color hacia arriba. Si hay un degradado (el vidrio) lo avisa: ahí manda lib/vidrio-contraste.test.ts.
  const fondo = (el) => {
    const pila = []; let n = el, degradado = false;
    while (n && n.nodeType === 1) { const s = getComputedStyle(n); if (s.backgroundImage !== 'none') degradado = true; pila.push(rgba(s.backgroundColor)); n = n.parentElement; }
    let acc = rgba(getComputedStyle(html).backgroundColor); if (acc.a === 0) acc = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = pila.length - 1; i >= 0; i--) acc = sobre(pila[i], acc);
    return { color: acc, degradado };
  };
  const opacidad = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  const contrasteTexto = (el) => {
    const { color: f, degradado } = fondo(el.parentElement || el), c = rgba(getComputedStyle(el).color), o = opacidad(el);
    const caja = rgba(getComputedStyle(el).backgroundColor);
    const detras = sobre({ ...caja, a: caja.a * o }, f);
    return { ratio: ratio(sobre({ ...c, a: c.a * o }, detras), detras), aprox: degradado };
  };

  // ── 1 · hover fuera de @media (hover: hover) — en un teléfono el :hover queda pegado tras un toque (lib/hover-con-mouse.test.ts)
  const hoverSueltos = [];
  const recorrer = (reglas, enHover) => {
    for (const r of reglas) {
      if (r.media && r.cssRules) { recorrer(r.cssRules, enHover || /(^|\W)(any-)?hover:\s*hover/.test(r.media.mediaText)); continue; }
      if (r.selectorText !== undefined) {
        if (/:hover/.test(r.selectorText) && !enHover && r.style && r.style.length) hoverSueltos.push(r.selectorText.slice(0, 110));
        if (r.cssRules && r.cssRules.length) recorrer(r.cssRules, enHover); // CSS anidado (el hover: de Tailwind v4 mete el @media adentro)
        continue;
      }
      if (r.cssRules) recorrer(r.cssRules, enHover); // @layer, @supports, @container
    }
  };
  for (const hoja of document.styleSheets) { try { recorrer(hoja.cssRules, false); } catch { /* hoja de otro origen: no se lee */ } }

  // ── 2 · apagados: el botón que confirma no se apaga por lo que falta (ADR-0611 mejora 4; CLAUDE.md «Guía de foco» punto 6)
  const botones = [...raiz.querySelectorAll('button, [role="button"], input[type="submit"]')].filter(vis);
  const motivoDe = (b) => {
    const ids = (b.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    const texto = ids.map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
    return texto || b.getAttribute('title') || null;
  };
  const apagados = botones.filter((b) => b.disabled && b.getAttribute('aria-busy') !== 'true').map((b) => {
    const confirma = b.type === 'submit' || !!b.closest('.pie-acciones, .pie-hoja-fijo, form');
    const motivo = motivoDe(b), c = contrasteTexto(b);
    return { pieza: pista(b), confirma, motivo, contraste: c.ratio, aprox: c.aprox,
      revisar: confirma && !motivo ? '¿apagado por lo que falta? Debe ser <Boton confirma={guia}>' : !motivo ? 'apagado sin motivo a la vista' : null };
  });
  const apagadosSuaves = botones.filter((b) => b.getAttribute('aria-disabled') === 'true').length;

  // ── 3 · cargando: aria-busy + no se pulsa dos veces; un «Guardando…» escrito a mano no lleva aria-busy
  const cargando = botones.filter((b) => b.getAttribute('aria-busy') === 'true');
  const ocupadoQueSePulsa = cargando.filter((b) => !b.disabled).map(pista);
  const esperaAMano = botones.filter((b) => b.getAttribute('aria-busy') !== 'true' && /\b\w+ndo(…|\.\.\.)\s*$/i.test((b.textContent || '').trim())).map(pista);

  // ── 4 · selected: se anuncia Y se ve. Compara la marcada con una hermana igual sin marcar.
  const SEL = '[aria-pressed="true"],[aria-selected="true"],[aria-checked="true"],[aria-current]:not([aria-current="false"]),[data-state="active"],[data-state="on"],[data-state="checked"]';
  const rasgos = (el) => { const s = getComputedStyle(el); return { fondo: s.backgroundColor + s.backgroundImage, letra: s.color, borde: s.borderColor, peso: s.fontWeight, sombra: s.boxShadow, deco: s.textDecorationLine, iconos: el.querySelectorAll('svg').length }; };
  const seleccion = [];
  for (const el of [...raiz.querySelectorAll(SEL)].filter(vis)) {
    const hermana = [...(el.parentElement?.children || [])].find((h) => h !== el && h.tagName === el.tagName && !h.matches(SEL) && vis(h));
    if (!hermana) continue;
    const a = rasgos(el), b = rasgos(hermana);
    const cambia = Object.keys(a).filter((k) => a[k] !== b[k]);
    if (!cambia.length) seleccion.push({ pieza: pista(el), falla: 'solo lo dice ARIA: no se ve distinta de su hermana (WCAG 1.4.1)' });
    else if (cambia.every((k) => ['fondo', 'letra', 'borde'].includes(k))) seleccion.push({ pieza: pista(el), revisar: `solo cambia el color (${cambia.join(', ')}): ¿hay ✓, peso o forma?` });
  }

  // ── 5 · error: ligado al control y no solo en rojo
  const errores = [...raiz.querySelectorAll('[aria-invalid="true"]')].filter(vis).map((el) => {
    const ids = [el.getAttribute('aria-describedby'), el.getAttribute('aria-errormessage')].join(' ').split(/\s+/).filter(Boolean);
    const msj = ids.map((id) => document.getElementById(id)).filter((m) => m && vis(m) && m.textContent.trim());
    return msj.length ? null : { pieza: pista(el), falla: 'aria-invalid sin mensaje visible ligado (aria-describedby / aria-errormessage)' };
  }).filter(Boolean);

  // ── 6 · vacío: la etiqueta no vive en el placeholder
  const campos = [...raiz.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea')].filter(vis);
  const sinEtiqueta = campos.filter((c) => !(c.labels && c.labels.length) && !c.getAttribute('aria-label') && !c.getAttribute('aria-labelledby'))
    .map((c) => ({ pieza: pista(c), placeholder: c.getAttribute('placeholder') || null }));

  // ── 7 · solo lectura: se alcanza con Tab y se lee entero
  const soloLectura = [...raiz.querySelectorAll('input[readonly], textarea[readonly], [aria-readonly="true"]')].filter(vis).map((el) => {
    const c = contrasteTexto(el), o = opacidad(el);
    const fallas = [];
    if (el.tabIndex < 0) fallas.push('no se alcanza con Tab');
    if (o < 0.99) fallas.push(`opacidad ${Math.round(o * 100)} %: cara de apagado`);
    if (c.ratio < 4.5) fallas.push(`letra ${c.ratio}:1 < 4.5:1${c.aprox ? ' (aprox., hay vidrio)' : ''}`);
    return fallas.length ? { pieza: pista(el), fallas } : null;
  }).filter(Boolean);

  // ── 8 · quieto: con las animaciones apagadas solo siguen las señales (data-senal, ADR-0625). El detalle lo mide /movimiento.
  const modo = html.dataset.movimiento || '(sin atributo)';
  const sistemaQuieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const enBucle = (document.getAnimations ? document.getAnimations() : [])
    .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming?.().iterations === Infinity)
    .map((a) => a.effect?.target).filter((t) => t && t.nodeType === 1 && raiz.contains(t));
  const bucleSinSenal = (modo === 'quieto' || sistemaQuieto) ? enBucle.filter((t) => !t.closest('[data-senal]')).map(pista) : [];

  // ── 9 · foco (opcional): anillo de ≥ 2 px con ≥ 3:1 contra lo de alrededor (2.4.13) y no tapado por lo que flota (2.4.11)
  let foco = 'no medido: corre otra vez con window.__milimetro = { foco: true }';
  if (op.foco) {
    const previo = document.activeElement, sx = scrollX, sy = scrollY;
    const enfocables = [...raiz.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(vis).slice(0, 80);
    const sinAnillo = [], anilloFlojo = [], tapado = [], halo = []; let sinMedir = 0;
    for (const el of enfocables) {
      el.focus({ preventScroll: false });
      if (document.activeElement !== el || !el.matches(':focus-visible')) { sinMedir++; continue; }
      const s = getComputedStyle(el), ancho = parseFloat(s.outlineWidth) || 0;
      if (s.outlineStyle !== 'none' && ancho >= 2) {
        const r = ratio(rgba(s.outlineColor), fondo(el.parentElement || el).color);
        if (r < 3) anilloFlojo.push(`${pista(el)} ${r}:1`);
      } else if (s.boxShadow !== 'none' || el.closest('.caja-campo, .caja-cayla')) halo.push(pista(el)); // los campos usan halo (ADR-0351 act. 2026-11-05): míralo a ojo
      else sinAnillo.push(`${pista(el)} outline ${s.outlineStyle} ${ancho}px`);
      const r = el.getBoundingClientRect(), arriba = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 6));
      if (arriba && !el.contains(arriba) && !arriba.contains(el)) {
        for (let n = arriba; n && n.nodeType === 1; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') { tapado.push(`${pista(el)} bajo ${pista(n)}`); break; } }
      }
    }
    previo?.focus?.({ preventScroll: true }); scrollTo(sx, sy);
    foco = { medidos: enfocables.length - sinMedir, sinMedir, sinAnillo: corta(sinAnillo), anilloFlojo: corta(anilloFlojo), focoTapado: corta(tapado), haloRevisarAOjo: halo.length };
  }

  return {
    pantalla: location.pathname, ancho: innerWidth, alto: innerHeight, tema: html.dataset.tema || 'claro', movimiento: modo, sistemaPideQuieto: sistemaQuieto,
    raiz: op.raiz || 'body',
    hover: { ...corta(hoverSueltos), nota: 'revisar: si la línea lleva /* hover-tactil: … */ es a propósito (grep en app/estilos)' },
    apagados: { ...corta(apagados.filter((a) => a.revisar)), conAriaDisabled: apagadosSuaves, todos: apagados.length },
    cargando: { ocupados: cargando.length, ocupadoQueSePulsa: corta(ocupadoQueSePulsa), esperaEscritaAMano: corta(esperaAMano) },
    seleccion: corta(seleccion),
    errores: corta(errores),
    etiquetas: corta(sinEtiqueta),
    soloLectura: corta(soloLectura),
    quieto: { enBucle: enBucle.length, bucleSinSenal: corta(bucleSinSenal) },
    foco,
  };
})();
