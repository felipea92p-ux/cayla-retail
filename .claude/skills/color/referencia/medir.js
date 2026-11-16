// /color · medir el contraste REAL de la pantalla que tienes abierta. Se pega ENTERO en `javascript_tool`, con la pantalla (o la hoja,
// el combo abierto, el error a la vista) ya en el estado que quieres medir. Mide SOLO lo que está en la ventana: haz scroll y repite.
// Etiqueta de todo lo que devuelve: Medido. Umbrales y fuentes: SKILL.md («Las reglas al milímetro») y referencia/fuentes.md.
//
// Qué mide (y qué NO, para no duplicar a `pnpm --filter web tema:auditar`):
//   1. Texto contra su fondo EFECTIVO (orden real de pintura con elementsFromPoint, alfa compuesto): 4.5:1, 3:1 si es grande (WCAG 1.4.3);
//      un símbolo oculto al lector y sin letras («›», «×») es gráfico: 3:1. Suma APCA Lc como SEGUNDA mirada (informa, no reprueba).
//      No mide el texto escondido a la vista para el lector (sr-only, clip-path inset(50%)): lo cuenta en `escondidosParaElLector`.
//   2. El borde (o el relleno) de lo que se toca o se escribe contra lo que lo rodea: 3:1 (WCAG 1.4.11). tema:auditar no lo mide.
//      La opción que se nombra con su propio texto (radio, pestaña) no necesita borde (`opcionesPorSuTexto`), pero su ESTADO sí: la elegida
//      cuya gota no llega a 3:1 contra el pozo sale en `controles.estados` (informa, no reprueba). El deslizador nativo se mide por su pulgar.
//   3. El foco del elemento enfocado ahora: color 3:1 contra lo de afuera, ≥ 2 px (2.4.13) y que no quede tapado entero (2.4.11).
//   4. El presupuesto de rojo: cuántas piezas pintan `--color-rojo` en la ventana (máx. 2, `MAX_ROJO_POR_PANTALLA`).
//   5. Enlaces dentro de una frase que se distinguen solo por el color (WCAG 1.4.1, técnica G183: 3:1 contra el texto de al lado).
// NO mide el vidrio ni el desenfoque (lo hace `lib/vidrio-contraste.test.ts`). Un degradado que cubre la caja se lee por sus paradas (peor y
// mejor caso: reprueba si ni el mejor llega); una imagen o un degradado parcial deja el texto en `noConcluyente`.
// No cambia la página: abre los punteros un instante para ver las capas decorativas y lo deja como estaba.
(() => {
  if (!innerWidth || !innerHeight) return { error: 'El panel está oculto: la página mide 0×0. Ábrelo y repite.' };
  const abrir = document.createElement('style');
  abrir.textContent = '*,*::before,*::after{pointer-events:auto!important}';
  document.head.appendChild(abrir);
  try {
    const r2 = (v) => Math.round(v * 100) / 100;
    const cx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
    const memo = new Map();
    // Todo color pasa por un canvas: Chrome devuelve oklab(), color-mix() y otros formatos que un regex no lee.
    const rgba = (c) => {
      if (!c) return { r: 0, g: 0, b: 0, a: 0 };
      if (!memo.has(c)) {
        cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
        const d = cx.getImageData(0, 0, 1, 1).data; memo.set(c, { r: d[0], g: d[1], b: d[2], a: d[3] / 255 });
      }
      return memo.get(c);
    };
    const sobre = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
    const conAlfa = (c, k) => ({ ...c, a: c.a * k });
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const wcag = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const apca = (t, f) => { // APCA 0.0.98G-4g
      const Y = ({ r, g, b }) => 0.2126729 * (r / 255) ** 2.4 + 0.7151522 * (g / 255) ** 2.4 + 0.072175 * (b / 255) ** 2.4;
      let yt = Y(t), yb = Y(f); yt = yt > 0.022 ? yt : yt + (0.022 - yt) ** 1.414; yb = yb > 0.022 ? yb : yb + (0.022 - yb) ** 1.414;
      if (Math.abs(yb - yt) < 0.0005) return 0;
      if (yb > yt) { const s = (yb ** 0.56 - yt ** 0.57) * 1.14; return s < 0.1 ? 0 : (s - 0.027) * 100; }
      const s = (yb ** 0.65 - yt ** 0.62) * 1.14; return s > -0.1 ? 0 : (s + 0.027) * 100;
    };
    const opacidad = (n) => { let k = 1; for (; n && n.nodeType === 1; n = n.parentElement) k *= parseFloat(getComputedStyle(n).opacity); return k; };
    const marca = (el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
    const pista = (el) => {
      const dg = el.closest('[data-guia]')?.getAttribute('data-guia');
      const cl = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '';
      return `${el.tagName.toLowerCase()}${cl} «${marca(el)}»${dg ? ` [${dg}]` : ''}`;
    };
    const raiz = rgba(getComputedStyle(document.body).backgroundColor).a > 0 ? rgba(getComputedStyle(document.body).backgroundColor)
      : rgba(getComputedStyle(document.documentElement).backgroundColor).a > 0 ? rgba(getComputedStyle(document.documentElement).backgroundColor) : { r: 255, g: 255, b: 255, a: 1 };
    // Un degradado que CUBRE la caja (la gota de vidrio, la píldora que viaja) se lee por sus paradas: da el fondo más claro y el más oscuro que
    // puede haber detrás. Una imagen de verdad (`url()`) o un degradado que no cubre la caja (un hilo, una raya de 1 px) no se lee: deja la
    // medida en `noConcluyente`, como antes. (2026-11-16: la gota es hermana de la pestaña elegida y antes ni se veía; ver «texto» abajo.)
    const COLOR_RE = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[0-9a-f]{3,8}\b|\btransparent\b/gi;
    const trozos = (v) => { const out = []; let d = 0, ini = 0; for (let i = 0; i < v.length; i++) { if (v[i] === '(') d++; else if (v[i] === ')') d--; else if (v[i] === ',' && !d) { out.push(v.slice(ini, i).trim()); ini = i + 1; } } out.push(v.slice(ini).trim()); return out; };
    const paradasDe = (s) => {
      if (s.backgroundImage === 'none') return [];
      // `background-clip: text` (la letra pintada con un degradado, el lema del login): el degradado ES la letra, no su fondo. No se lee;
      // leído como fondo, la letra transparente daba 1:1 y reprobaba en falso.
      if (/text/.test(`${s.backgroundClip} ${s.webkitBackgroundClip || ''}`)) return trozos(s.backgroundImage).map(() => null);
      const tams = trozos(s.backgroundSize);
      return trozos(s.backgroundImage).map((img, i) => {
        if (img === 'none') return [];
        const cubre = /^(auto|auto auto|100%|100% 100%|cover)$/.test((tams[i % tams.length] || 'auto').trim());
        const colores = /gradient\(/.test(img) && !/url\(/.test(img) && cubre ? img.match(COLOR_RE) : null;
        return colores ? colores.map(rgba) : null; // null = no se puede leer
      });
    };
    // Fondo efectivo de una pila (en orden de pintura, de arriba hacia abajo) hasta la primera capa opaca.
    // `acc` compone solo los background-color (lo que usan los controles); `claro`/`oscuro` suman las paradas de los degradados que cubren.
    const fondoDe = (pila) => {
      const capas = []; let degradado = false;
      for (const n of pila) {
        const s = getComputedStyle(n), k = opacidad(n), imgs = paradasDe(s);
        if (imgs.some((p) => p === null)) degradado = true;
        const c = conAlfa(rgba(s.backgroundColor), k), paradas = imgs.filter((p) => p && p.length).map((p) => p.map((q) => conAlfa(q, k)));
        if (c.a > 0 || paradas.length) capas.push({ c, paradas });
        if (c.a >= 0.999 || paradas.some((p) => p.every((q) => q.a >= 0.999))) break;
      }
      let acc = raiz, claro = raiz, oscuro = raiz;
      for (let i = capas.length - 1; i >= 0; i--) {
        const { c, paradas } = capas[i];
        acc = sobre(c, acc); claro = sobre(c, claro); oscuro = sobre(c, oscuro);
        for (let j = paradas.length - 1; j >= 0; j--) {
          claro = paradas[j].map((p) => sobre(p, claro)).reduce((a, b) => (lum(b) > lum(a) ? b : a));
          oscuro = paradas[j].map((p) => sobre(p, oscuro)).reduce((a, b) => (lum(b) < lum(a) ? b : a));
        }
      }
      return { acc, claro, oscuro, degradado };
    };
    const fondoEn = (x, y, filtro) => fondoDe(document.elementsFromPoint(x, y).filter(filtro));
    // Lo que se pinta DEBAJO de `el` en (x, y): todo lo que la pila tiene de él hacia abajo, no solo sus antepasados (la gota que viaja bajo la
    // pestaña o el segmento elegido es una hermana, `.cmp-ind`). Un antepasado puede salir ENCIMA de `el` en la pila porque su `::after` cubre
    // la caja (el filo de la foto en Vender, `pv-prenda-foto`: 5 textos por pantalla), pero su fondo se pinta debajo de todo lo suyo: va justo
    // después de su último descendiente. Sin esto, un filo encima de una placa con fondo propio hacía medir el texto contra lo de atrás de la
    // placa. Si `el` no sale en la pila (display: contents), se cae a los antepasados.
    const bajoDe = (el, todo) => {
      const yo = todo.indexOf(el);
      if (yo < 0) return todo.filter((n) => n.contains(el));
      const bajo = todo.slice(yo);
      for (const a of todo.slice(0, yo)) {
        if (!a.contains(el)) continue;
        let k = 0; bajo.forEach((n, i) => { if (a.contains(n)) k = i; });
        bajo.splice(k + 1, 0, a);
      }
      return bajo;
    };
    const enVista = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    const deshabilitado = (el) => !!el.closest(':disabled,[aria-disabled="true"],[inert]');
    // Escondido a la vista a propósito, para el lector de pantalla: `sr-only` (1×1 px, overflow hidden, clip-path inset(50%)), el viejo
    // `clip: rect(0 0 0 0)` y el texto de un botón que pasa a «solo ícono» (`.mesa-telar-registrar-texto`, telar.css). No se ve, así que
    // 1.4.3 no aplica (WCAG 1.4.3 mide el texto que se presenta a la vista); antes salía con 1,0–1,1:1 y ensuciaba la cuenta (2026-11-16).
    // Es el `soloLector` de /espacio, /tipografia y /textos, más el recorte por clip-path y mirar los antepasados (un <b> dentro de un sr-only).
    // El recorte `clip-path: inset(t r b l)` esconde solo si deja el área en cero (t + b ≥ alto, o i + d ≥ ancho). Uno parcial deja ver el
    // resto, y ese resto SÍ se mide: la fila que se recorta al desplazar la tabla (`tv-recorte-fila`, `inset(60% -24px -32px -24px)`).
    const recorteTotal = (cp, r) => {
      const m = /^inset\(\s*([^()]*?)(?:\s+round\b[^()]*)?\)$/.exec(cp); if (!m) return false;
      const [t, d = t, b = t, i = d] = m[1].trim().split(/\s+/);
      const px = (v, base) => (/%$/.test(v) ? (parseFloat(v) / 100) * base : parseFloat(v)) || 0;
      return px(t, r.height) + px(b, r.height) >= r.height || px(i, r.width) + px(d, r.width) >= r.width;
    };
    const soloLector = (el) => {
      for (let n = el; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (recorteTotal(s.clipPath, n.getBoundingClientRect()) || /^rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)$/.test(s.clip)) return true;
        if ((s.overflowX !== 'visible' || s.overflowY !== 'visible')) { const r = n.getBoundingClientRect(); if (r.width <= 1 && r.height <= 1) return true; }
      }
      return false;
    };

    // ── 1 · texto
    const texto = [], apcaBajo = [], noConcluyente = []; let medidos = 0, tapados = 0, fuera = 0, escondidos = 0;
    const paseo = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.textContent.trim() ? 1 : 2) });
    const vistos = new Set();
    for (let t = paseo.nextNode(); t; t = paseo.nextNode()) {
      const el = t.parentElement; if (!el || vistos.has(el)) continue; vistos.add(el);
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION)$/.test(el.tagName) || deshabilitado(el)) continue;
      const rg = document.createRange(); rg.selectNodeContents(t); const rc = [...rg.getClientRects()].find((q) => q.width > 1 && q.height > 1);
      if (!rc) continue; if (!enVista(rc)) { fuera++; continue; }
      if (soloLector(el)) { escondidos++; continue; }
      const x = Math.min(innerWidth - 1, Math.max(0, rc.left + rc.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, rc.top + rc.height / 2));
      const arriba = document.elementFromPoint(x, y);
      if (arriba && arriba !== el && !el.contains(arriba) && !arriba.contains(el)) { tapados++; continue; }
      const k = opacidad(el); if (k < 0.05) continue;
      // Detrás del texto está todo lo que se pinta DEBAJO de él (`bajoDe`), no solo sus ancestros.
      const { claro, oscuro, degradado } = fondoDe(bajoDe(el, document.elementsFromPoint(x, y)));
      const fgA = conAlfa(rgba(s.color), k), fc = sobre(fgA, claro), fo = sobre(fgA, oscuro);
      const rc2 = wcag(fc, claro), ro = wcag(fo, oscuro);
      // Sobre un degradado: el peor y el mejor caso. Si el texto queda entre el fondo más claro y el más oscuro, en algún punto se iguala.
      const cruza = Math.sign(lum(fc) - lum(claro)) !== Math.sign(lum(fo) - lum(oscuro));
      const ratio = cruza ? 1 : Math.min(rc2, ro), mejor = Math.max(rc2, ro), lc = rc2 <= ro ? apca(fc, claro) : apca(fo, oscuro);
      const px = parseFloat(s.fontSize), peso = parseInt(s.fontWeight, 10) || 400;
      const grande = px >= 24 || (px >= 18.66 && peso >= 700);
      const simbolo = !!el.closest('[aria-hidden="true"]') && !/[\p{L}\p{N}]/u.test(t.textContent) && !el.closest('kbd,[data-aria-hidden]');
      const minimo = simbolo || grande ? 3 : 4.5;
      medidos++;
      const fila = { donde: pista(el), ratio: r2(ratio), minimo, lc: Math.round(lc), px, peso, tipo: simbolo ? 'gráfico' : grande ? 'texto grande' : 'texto' };
      if (r2(mejor) !== r2(ratio)) fila.hasta = r2(mejor); // sobre un degradado: hasta dónde llega en su mejor punto
      if (degradado) { if (ratio < minimo) noConcluyente.push(fila); continue; }
      if (mejor < minimo) texto.push(fila); // ni en el mejor punto del degradado llega: reprueba
      else if (ratio < minimo) noConcluyente.push(fila); // llega en una parte del degradado y en otra no
      else if (!simbolo && px < 24 && Math.abs(lc) < (peso >= 700 ? 45 : 60)) apcaBajo.push(fila); // segunda mirada: pasa WCAG pero APCA lo ve débil
    }
    texto.sort((a, b) => a.ratio - b.ratio); apcaBajo.sort((a, b) => Math.abs(a.lc) - Math.abs(b.lc));

    // ── 2 · bordes de control (lo que se toca o se escribe: 3:1 contra lo que lo rodea, por su borde O por su relleno)
    // El campo dentro de una caja del sistema (`<Buscador>`, `caja-campo`, `caja-cayla`) no tiene borde propio: lo lleva la CAJA, que es
    // la que se mide. Antes el `<input>` del Buscador salía con «borde 0» y fallaba 1.4.11.
    const CAJA = '.caja-cayla,.caja-campo,.buscador';
    const SEL = `input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea,select,[role=combobox],[role=checkbox],[role=switch],[role=radio],[role=slider],${CAJA},.btn-secundario,.interruptor`;
    // 1.4.11 no le pide borde a lo que se reconoce por su PROPIO texto a la vista (Understanding 1.4.11, «User Interface Components»: el texto
    // de un botón ya lo identifica, y ese texto lo mide 1.4.3). Se exime la opción con texto de un grupo (radio, pestaña, opción: la del
    // segmento «Grilla / Tabla», `segmento-campo__op`), que antes salía «borde 0, relleno 1» en 96 casos. Se siguen midiendo el campo, el
    // combo, la casilla, el interruptor, el deslizador, la opción sin texto (solo ícono, una muestra) y `btn-secundario`, que lleva
    // `borde-control` por regla del repo (ADR-0516), no por 1.4.11.
    const OPCION = '[role=radio],[role=tab],[role=option],[role=menuitemradio]';
    // El texto propio a la vista de una opción (null si no tiene): su elemento y su caja.
    const textoPropio = (el) => {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        const p = t.parentElement;
        if (/[\p{L}\p{N}]/u.test(t.textContent) && p && !p.closest('[aria-hidden="true"]') && !soloLector(p) && getComputedStyle(p).visibility !== 'hidden') {
          const rg = document.createRange(); rg.selectNodeContents(t); const q = [...rg.getClientRects()].find((c) => c.width > 1 && c.height > 1);
          if (q) return { p, q };
        }
      }
      return null;
    };
    // Lo que SÍ le queda a esa opción es su ESTADO: 1.4.11 también pide 3:1 a lo que dice «esta es la elegida». Se mide el fondo bajo el texto
    // de la elegida (la gota, aunque sea una hermana que viaja debajo) contra el de una del grupo sin elegir (el pozo), en su mejor caso. No
    // reprueba, porque la marca puede ser otra (el peso de la letra, un filo): sale en `controles.estados` para mirarlo con su `otraMarca`.
    // Antes se veía solo de rebote, como «borde 0» de todas las opciones; sin esto, eximir el borde lo escondía (2026-11-16).
    const elegida = (o) => o.getAttribute('aria-checked') === 'true' || o.getAttribute('aria-selected') === 'true' || o.getAttribute('aria-current') === 'page';
    const bajoTexto = ({ p, q }) => fondoDe(bajoDe(p, document.elementsFromPoint(Math.min(innerWidth - 1, Math.max(0, q.left + q.width / 2)), Math.min(innerHeight - 1, Math.max(0, q.top + q.height / 2)))));
    const estadoDe = (el, propio) => {
      const grupo = el.closest('[role=radiogroup],[role=tablist],[role=listbox],[role=menu],[role=group],.pestanas-cayla') || el.parentElement;
      for (const o of grupo ? grupo.querySelectorAll(`${OPCION},.pestana-cayla`) : []) {
        const suyo = o !== el && !elegida(o) && !deshabilitado(o) && enVista(o.getBoundingClientRect()) && textoPropio(o); if (!suyo) continue;
        const a = bajoTexto(propio), b = bajoTexto(suyo);
        const gota = Math.max(...[a.claro, a.oscuro].flatMap((f) => [b.claro, b.oscuro].map((g) => wcag(f, g))));
        if (gota >= 3) return null;
        const sa = getComputedStyle(propio.p), sb = getComputedStyle(suyo.p), marcas = [];
        if (sa.fontWeight !== sb.fontWeight) marcas.push(`peso ${sa.fontWeight} contra ${sb.fontWeight}`);
        if (sa.textDecorationLine !== sb.textDecorationLine) marcas.push(`subrayado: ${sa.textDecorationLine}`);
        return { donde: pista(el), gotaContraPozo: r2(gota), otraMarca: marcas.join(', ') || 'ninguna: solo cambia el color', ...(a.degradado || b.degradado ? { aOjo: 'hay una imagen detrás' } : {}) };
      }
      return null;
    };
    const controles = { medidos: 0, fallan: [], vidrio: [], porTexto: 0, nativos: [], estados: [] };
    for (const el of document.querySelectorAll(SEL)) {
      if (deshabilitado(el) || (el.matches('input,textarea,[role=combobox]') && el.closest(CAJA))) continue;
      const r = el.getBoundingClientRect(), s = getComputedStyle(el); if (!enVista(r) || s.visibility === 'hidden') continue;
      const propio = el.matches(OPCION) && !el.matches('.btn-secundario,.interruptor,input') ? textoPropio(el) : null;
      if (propio) {
        controles.porTexto++;
        const estado = elegida(el) ? estadoDe(el, propio) : null; if (estado) controles.estados.push(estado);
        continue;
      }
      const x = Math.min(innerWidth - 1, r.left + r.width / 2), y = Math.min(innerHeight - 1, r.top + r.height / 2);
      const afuera = fondoEn(x, y, (n) => n !== el && !el.contains(n)).acc;
      // El deslizador nativo (`<input type="range">` sin `appearance: none`) lo dibuja el navegador: lo que lo identifica es el pulgar, pintado
      // con `accent-color`, no su borde ni su fondo (que no tiene). Antes salía «borde 0» (Beneficios del club, «¿Y si…?» de Finanzas ▸ Flujo);
      // medido en píxeles, el pulgar `accent-tinta` da 16,4:1 en claro y 13,7:1 en oscuro. Sin `accent-color`, el color es del navegador: a ojo.
      if (el.matches('input[type=range]') && s.appearance !== 'none') {
        const pulgar = rgba(s.accentColor === 'auto' ? '' : s.accentColor);
        if (!pulgar.a) { controles.nativos.push(`${pista(el)}: accent-color auto, el pulgar lo pinta el navegador (mirar a ojo)`); continue; }
        const porPulgar = wcag(sobre(conAlfa(pulgar, opacidad(el)), afuera), afuera);
        controles.medidos++;
        if (porPulgar < 3) controles.fallan.push({ donde: pista(el), pulgar: r2(porPulgar), color: s.accentColor });
        continue;
      }
      if (s.backgroundImage !== 'none') { controles.vidrio.push(pista(el)); continue; }
      const relleno = sobre(conAlfa(rgba(s.backgroundColor), opacidad(el)), afuera);
      const lados = ['Top', 'Right', 'Bottom', 'Left'].filter((l) => parseFloat(s[`border${l}Width`]) >= 1).map((l) => sobre(rgba(s[`border${l}Color`]), relleno));
      const porBorde = lados.length ? Math.max(...lados.map((c) => wcag(c, afuera))) : 0, porRelleno = wcag(relleno, afuera);
      controles.medidos++;
      if (Math.max(porBorde, porRelleno) < 3) controles.fallan.push({ donde: pista(el), borde: r2(porBorde), relleno: r2(porRelleno), color: s.borderTopColor });
    }
    // La pestaña elegida (`<Pestanas>`: tablist o enlaces con aria-current) es la misma gota contra el mismo pozo: su estado se mide igual. No se
    // abre a toda `[role=option]`: en la lista de un combo la marca de la elegida es el ✓, y saldría en falso.
    for (const el of document.querySelectorAll('[role=tablist] [role=tab][aria-selected="true"],.pestanas-cayla [aria-current="page"]')) {
      if (deshabilitado(el) || !enVista(el.getBoundingClientRect())) continue;
      const propio = textoPropio(el), estado = propio && estadoDe(el, propio); if (estado) controles.estados.push(estado);
    }

    // ── 3 · el foco de ahora (pon el foco con Tab y vuelve a correr)
    let foco = 'Nada enfocado: pulsa Tab hasta el control y vuelve a correr.';
    const ae = document.activeElement;
    if (ae && ae !== document.body && ae !== document.documentElement) {
      const s = getComputedStyle(ae), r = ae.getBoundingClientRect(), ancho = s.outlineStyle !== 'none' ? parseFloat(s.outlineWidth) : 0;
      const sep = parseFloat(s.outlineOffset) || 0, px = Math.max(0, r.left - sep - ancho - 2), py = Math.min(innerHeight - 1, r.top + r.height / 2);
      const afuera = fondoEn(px, py, (n) => n !== ae && !ae.contains(n)).acc;
      const anillo = ancho ? sobre(rgba(s.outlineColor), afuera) : null;
      const puntos = [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]].map(([a, b]) => [r.left + r.width * a, r.top + r.height * b]);
      const tapado = puntos.every(([x, y]) => {
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return true;
        const n = document.elementFromPoint(x, y); if (!n || n === ae || ae.contains(n) || n.contains(ae)) return false;
        const c = getComputedStyle(n); return rgba(c.backgroundColor).a >= 0.9 || c.backgroundImage !== 'none';
      });
      const rojo = rgba(getComputedStyle(document.documentElement).getPropertyValue('--color-rojo').trim());
      const esRojo = anillo && ['r', 'g', 'b'].every((k) => Math.abs(rgba(s.outlineColor)[k] - rojo[k]) <= 8);
      foco = {
        donde: pista(ae), anillo: ancho ? `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}` : `sin outline (box-shadow: ${s.boxShadow})`,
        contraste: anillo ? r2(wcag(anillo, afuera)) : null, pasa1411: anillo ? wcag(anillo, afuera) >= 3 : 'medir a ojo: no usa outline',
        pasa2413: ancho >= 2, tapadoEntero2411: tapado, rojo: esRojo ? 'FALLA la regla del repo: el foco nunca es rojo (ADR-0351)' : false,
      };
    }

    // ── 4 · presupuesto de rojo (piezas que pintan --color-rojo; una pieza dentro de otra roja cuenta una vez)
    const raizCss = getComputedStyle(document.documentElement);
    const ROJO = rgba(raizCss.getPropertyValue('--color-rojo').trim()), PROF = rgba(raizCss.getPropertyValue('--color-rojo-profundo').trim());
    const igual = (c, m) => c.a >= 0.6 && ['r', 'g', 'b'].every((k) => Math.abs(c[k] - m[k]) <= 6);
    const pinta = (el, m) => {
      const s = getComputedStyle(el), props = [];
      if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && igual(rgba(s.color), m)) props.push('texto');
      if (igual(rgba(s.backgroundColor), m)) props.push('fondo');
      if (['Top', 'Right', 'Bottom', 'Left'].some((l) => parseFloat(s[`border${l}Width`]) >= 1 && igual(rgba(s[`border${l}Color`]), m))) props.push('borde');
      if (el instanceof SVGElement && (igual(rgba(s.fill), m) || igual(rgba(s.stroke), m))) props.push('trazo');
      return props;
    };
    // El presupuesto es de la PANTALLA (<main>): el colibrí del logo y lo que vive en el lateral o la cabecera es el marco, se lista aparte.
    const mainEl = document.querySelector('main') || document.body;
    const cuenta = (m, raizCuenta = mainEl) => {
      const piezas = [];
      for (const el of raizCuenta.querySelectorAll('*')) {
        if (raizCuenta === document.body && (mainEl.contains(el) || el.closest('nextjs-portal'))) continue;
        const r = el.getBoundingClientRect(); if (!enVista(r) || getComputedStyle(el).visibility === 'hidden' || opacidad(el) < 0.3) continue;
        if (piezas.some((p) => p.el.contains(el))) continue;
        const props = pinta(el, m); if (props.length) piezas.push({ el, donde: `${pista(el)} (${props.join('+')})` });
      }
      return piezas.map((p) => p.donde);
    };
    const rojos = cuenta(ROJO), profundos = cuenta(PROF), rojosDelMarco = mainEl === document.body ? [] : cuenta(ROJO, document.body);

    // ── 5 · enlaces dentro de una frase que solo se distinguen por el color (1.4.1, G183)
    const enlacesSoloColor = [];
    for (const a of document.querySelectorAll('a[href],.btn-enlace')) {
      const r = a.getBoundingClientRect(), s = getComputedStyle(a), p = a.parentElement; if (!enVista(r) || !p) continue;
      const enFrase = /^inline/.test(s.display) && [...p.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 3);
      // `btn-enlace` dibuja su subrayado con un degradado (background-image): eso también es una marca que no es color.
      if (!enFrase || s.textDecorationLine.includes('underline') || parseFloat(s.borderBottomWidth) >= 1 || s.backgroundImage !== 'none') continue;
      const k = wcag(sobre(rgba(s.color), raiz), sobre(rgba(getComputedStyle(p).color), raiz));
      if (k < 3) enlacesSoloColor.push({ donde: pista(a), contraVecino: r2(k) });
    }

    return {
      tema: document.documentElement.dataset.tema || 'claro', ventana: `${innerWidth}×${innerHeight}`,
      resumen: {
        textosMedidos: medidos, textoFalla: texto.length, apcaDebil: apcaBajo.length, noConcluyente: noConcluyente.length, tapados, fueraDeVista: fuera,
        escondidosParaElLector: escondidos,
        controlesMedidos: controles.medidos, controlFalla: controles.fallan.length, controlesDeVidrio: controles.vidrio.length,
        opcionesPorSuTexto: controles.porTexto, estadosAMirar: controles.estados.length, deslizadoresAOjo: controles.nativos.length,
        rojosEnVista: rojos.length, rojoPasaPresupuesto: rojos.length > 2, enlacesSoloColor: enlacesSoloColor.length,
      },
      texto: texto.slice(0, 25), apcaSegundaMirada: apcaBajo.slice(0, 12), noConcluyente: noConcluyente.slice(0, 12),
      controles: { fallan: controles.fallan.slice(0, 20), estados: controles.estados.slice(0, 12), vidrio: controles.vidrio.slice(0, 10), aOjo: controles.nativos.slice(0, 10) },
      foco, rojos, rojoProfundo: profundos, rojosDelMarco, enlacesSoloColor,
      siguiente: 'Corre también en el otro tema (botón de la cabecera) y a 375 px. Lo de vidrio: pnpm --filter web test -- vidrio-contraste.',
    };
  } finally {
    abrir.remove();
  }
})();
