// /color · medir el contraste REAL de la pantalla que tienes abierta. Se pega ENTERO en `javascript_tool`, con la pantalla (o la hoja,
// el combo abierto, el error a la vista) ya en el estado que quieres medir. Mide SOLO lo que está en la ventana: haz scroll y repite.
// Etiqueta de todo lo que devuelve: Medido. Umbrales y fuentes: SKILL.md («Las reglas al milímetro») y referencia/fuentes.md.
//
// Qué mide (y qué NO, para no duplicar a `pnpm --filter web tema:auditar`):
//   1. Texto contra su fondo EFECTIVO (orden real de pintura con elementsFromPoint, alfa compuesto): 4.5:1, 3:1 si es grande (WCAG 1.4.3);
//      un símbolo oculto al lector y sin letras («›», «×») es gráfico: 3:1. Suma APCA Lc como SEGUNDA mirada (informa, no reprueba).
//   2. El borde (o el relleno) de lo que se toca o se escribe contra lo que lo rodea: 3:1 (WCAG 1.4.11). tema:auditar no lo mide.
//   3. El foco del elemento enfocado ahora: color 3:1 contra lo de afuera, ≥ 2 px (2.4.13) y que no quede tapado entero (2.4.11).
//   4. El presupuesto de rojo: cuántas piezas pintan `--color-rojo` en la ventana (máx. 2, `MAX_ROJO_POR_PANTALLA`).
//   5. Enlaces dentro de una frase que se distinguen solo por el color (WCAG 1.4.1, técnica G183: 3:1 contra el texto de al lado).
// NO mide degradados ni el vidrio (lo hace `lib/vidrio-contraste.test.ts`): lo que está sobre un degradado sale en `noConcluyente`.
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
    // Fondo efectivo en (x, y) bajo `desde` (incluido o no): capas en orden de pintura, de arriba hacia abajo, hasta la primera opaca.
    const fondoEn = (x, y, filtro) => {
      const pila = document.elementsFromPoint(x, y).filter(filtro);
      const capas = []; let degradado = false;
      for (const n of pila) {
        const s = getComputedStyle(n);
        if (s.backgroundImage !== 'none') degradado = true;
        const c = conAlfa(rgba(s.backgroundColor), opacidad(n));
        if (c.a > 0) capas.push(c);
        if (c.a >= 0.999) break;
      }
      let acc = raiz; for (let i = capas.length - 1; i >= 0; i--) acc = sobre(capas[i], acc);
      return { acc, degradado };
    };
    const enVista = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    const deshabilitado = (el) => !!el.closest(':disabled,[aria-disabled="true"],[inert]');

    // ── 1 · texto
    const texto = [], apcaBajo = [], noConcluyente = []; let medidos = 0, tapados = 0, fuera = 0;
    const paseo = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.textContent.trim() ? 1 : 2) });
    const vistos = new Set();
    for (let t = paseo.nextNode(); t; t = paseo.nextNode()) {
      const el = t.parentElement; if (!el || vistos.has(el)) continue; vistos.add(el);
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION)$/.test(el.tagName) || deshabilitado(el)) continue;
      const rg = document.createRange(); rg.selectNodeContents(t); const rc = [...rg.getClientRects()].find((q) => q.width > 1 && q.height > 1);
      if (!rc) continue; if (!enVista(rc)) { fuera++; continue; }
      const x = Math.min(innerWidth - 1, Math.max(0, rc.left + rc.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, rc.top + rc.height / 2));
      const arriba = document.elementFromPoint(x, y);
      if (arriba && arriba !== el && !el.contains(arriba) && !arriba.contains(el)) { tapados++; continue; }
      const k = opacidad(el); if (k < 0.05) continue;
      const { acc, degradado } = fondoEn(x, y, (n) => n === el || n.contains(el));
      const fg = sobre(conAlfa(rgba(s.color), k), acc);
      const ratio = wcag(fg, acc), lc = apca(fg, acc), px = parseFloat(s.fontSize), peso = parseInt(s.fontWeight, 10) || 400;
      const grande = px >= 24 || (px >= 18.66 && peso >= 700);
      const simbolo = !!el.closest('[aria-hidden="true"]') && !/[\p{L}\p{N}]/u.test(t.textContent) && !el.closest('kbd,[data-aria-hidden]');
      const minimo = simbolo || grande ? 3 : 4.5;
      medidos++;
      const fila = { donde: pista(el), ratio: r2(ratio), minimo, lc: Math.round(lc), px, peso, tipo: simbolo ? 'gráfico' : grande ? 'texto grande' : 'texto' };
      if (degradado) { if (ratio < minimo) noConcluyente.push(fila); continue; }
      if (ratio < minimo) texto.push(fila);
      else if (!simbolo && px < 24 && Math.abs(lc) < (peso >= 700 ? 45 : 60)) apcaBajo.push(fila); // segunda mirada: pasa WCAG pero APCA lo ve débil
    }
    texto.sort((a, b) => a.ratio - b.ratio); apcaBajo.sort((a, b) => Math.abs(a.lc) - Math.abs(b.lc));

    // ── 2 · bordes de control (lo que se toca o se escribe: 3:1 contra lo que lo rodea, por su borde O por su relleno)
    // El campo dentro de una caja del sistema (`<Buscador>`, `caja-campo`, `caja-cayla`) no tiene borde propio: lo lleva la CAJA, que es
    // la que se mide. Antes el `<input>` del Buscador salía con «borde 0» y fallaba 1.4.11.
    const CAJA = '.caja-cayla,.caja-campo,.buscador';
    const SEL = `input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea,select,[role=combobox],[role=checkbox],[role=switch],[role=radio],[role=slider],${CAJA},.btn-secundario,.interruptor`;
    const controles = { medidos: 0, fallan: [], vidrio: [] };
    for (const el of document.querySelectorAll(SEL)) {
      if (deshabilitado(el) || (el.matches('input,textarea,[role=combobox]') && el.closest(CAJA))) continue;
      const r = el.getBoundingClientRect(), s = getComputedStyle(el); if (!enVista(r) || s.visibility === 'hidden') continue;
      const x = Math.min(innerWidth - 1, r.left + r.width / 2), y = Math.min(innerHeight - 1, r.top + r.height / 2);
      const afuera = fondoEn(x, y, (n) => n !== el && !el.contains(n)).acc;
      if (s.backgroundImage !== 'none') { controles.vidrio.push(pista(el)); continue; }
      const relleno = sobre(conAlfa(rgba(s.backgroundColor), opacidad(el)), afuera);
      const lados = ['Top', 'Right', 'Bottom', 'Left'].filter((l) => parseFloat(s[`border${l}Width`]) >= 1).map((l) => sobre(rgba(s[`border${l}Color`]), relleno));
      const porBorde = lados.length ? Math.max(...lados.map((c) => wcag(c, afuera))) : 0, porRelleno = wcag(relleno, afuera);
      controles.medidos++;
      if (Math.max(porBorde, porRelleno) < 3) controles.fallan.push({ donde: pista(el), borde: r2(porBorde), relleno: r2(porRelleno), color: s.borderTopColor });
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
        controlesMedidos: controles.medidos, controlFalla: controles.fallan.length, controlesDeVidrio: controles.vidrio.length,
        rojosEnVista: rojos.length, rojoPasaPresupuesto: rojos.length > 2, enlacesSoloColor: enlacesSoloColor.length,
      },
      texto: texto.slice(0, 25), apcaSegundaMirada: apcaBajo.slice(0, 12), noConcluyente: noConcluyente.slice(0, 12),
      controles: { fallan: controles.fallan.slice(0, 20), vidrio: controles.vidrio.slice(0, 10) },
      foco, rojos, rojoProfundo: profundos, rojosDelMarco, enlacesSoloColor,
      siguiente: 'Corre también en el otro tema (botón de la cabecera) y a 375 px. Lo de vidrio: pnpm --filter web test -- vidrio-contraste.',
    };
  } finally {
    abrir.remove();
  }
})();
