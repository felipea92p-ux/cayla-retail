// /espacio · al milímetro — se pega ENTERO en `javascript_tool` con la pantalla ya cargada y el panel visible (oculto = todo mide 0).
// Mide lo que /formidable (`.claude/skills/formidable/referencia/medir-oficio.js`) NO mide así:
//   1. Blancos de puntero con la regla COMPLETA de WCAG 2.5.8: el área real (el `::after` de tacto.css, la <label> o la caja que lo envuelve)
//      y la excepción de separación (un círculo de 24 px centrado en el blanco chico no toca otro blanco). Con `pointer: coarse`, 44 px.
//   2. Relleno, margen y hueco DECLARADOS que se salen de la escala de 4 px (los medios pasos 2 · 6 · 10 solo valen dentro de un control).
//   3. Grupos sin caja cuyo aire de ADENTRO es mayor que el de AFUERA (la proximidad se rompe: el grupo se lee como dos).
//   4. Densidad: altos de controles y de filas de tabla; radios de adentro más redondos que los de afuera; ancho útil de la pantalla.
// Lo de adentro de <main> es la pantalla; lo de afuera (lateral, cabecera, buscador) es el marco y va APARTE (no le baja la nota a la pantalla).
// No toca la página. Etiqueta de todo: Medido. Umbrales y fuentes: ../SKILL.md y fuentes.md.
(() => {
  if (!innerWidth || !innerHeight) return { error: 'El panel está oculto: la página mide 0×0 y toda medición sería falsa. Ábrelo y repite.' };
  const TOPE = 15; // ejemplos por lista
  const px = (v) => Math.round(v * 10) / 10;
  const cs = (e, p) => getComputedStyle(e, p);
  const vis = (e) => {
    const r = e.getBoundingClientRect(), s = cs(e);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  };
  const marca = (e) => (e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 36);
  const pista = (e) => {
    const c = typeof e.className === 'string' ? e.className.trim().split(/\s+/).filter((k) => !k.includes(':'))[0] : '';
    return `${e.tagName.toLowerCase()}${c ? '.' + c : ''} «${marca(e)}»`;
  };
  const main = document.querySelector('main') || document.body;
  const lado = (e) => (main.contains(e) ? 'pantalla' : 'marco');
  const todos = [...document.body.querySelectorAll('*')].filter((e) => !e.closest('svg,nextjs-portal,[aria-hidden="true"],[hidden]') && vis(e));

  // ───────────────────────── 1 · blancos de puntero (WCAG 2.5.8 AA: 24 · repo: 32 objetivo con mouse · 44 con el dedo, ADR-0611 mejora 5)
  const dedo = matchMedia('(pointer: coarse)').matches;
  const MIN = dedo ? 44 : 24;
  const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=radio],[role=switch],[role=combobox],[tabindex]:not([tabindex="-1"])';
  // En línea dentro de una frase: exento (excepción «Inline» de 2.5.8).
  const enLinea = (e) => /^inline(?!-(flex|grid|block))/.test(cs(e).display) && [...(e.parentElement?.childNodes || [])].some((n) => n.nodeType === 3 && n.textContent.trim().length > 3);
  const areaReal = (e) => {
    const r = e.getBoundingClientRect();
    let L = r.left, T = r.top, R = r.right, B = r.bottom;
    const cx = (L + R) / 2, cy = (T + B) / 2;
    for (const p of ['::before', '::after']) {
      const s = cs(e, p);
      if (s.content === 'none' || s.position !== 'absolute' || s.pointerEvents === 'none') continue;
      const w = parseFloat(s.width) || 0, h = parseFloat(s.height) || 0; // tacto.css la centra: translate(-50%, -50%)
      if (w > R - L) { L = cx - w / 2; R = cx + w / 2; }
      if (h > B - T) { T = cy - h / 2; B = cy + h / 2; }
    }
    const caja = e.closest('label, .caja-campo, .buscador, .paso-cantidad, .segmento-cayla'); // tocar la caja o la etiqueta enfoca el control (igual que tacto/medir.mjs)
    if (caja && caja !== e) { const q = caja.getBoundingClientRect(); L = Math.min(L, q.left); T = Math.min(T, q.top); R = Math.max(R, q.right); B = Math.max(B, q.bottom); }
    return { L, T, R, B, w: R - L, h: B - T, cx: (L + R) / 2, cy: (T + B) / 2 };
  };
  const blancos = todos
    .filter((e) => e.matches(SEL) && !e.disabled && e.getAttribute('aria-disabled') !== 'true' && cs(e).pointerEvents !== 'none' && !enLinea(e))
    .map((e) => ({ e, a: areaReal(e) }));
  const chico = (b, m) => b.a.w < m || b.a.h < m;
  const distARect = (x, y, a) => Math.hypot(Math.max(a.L - x, 0, x - a.R), Math.max(a.T - y, 0, y - a.B));
  // Excepción de separación (2.5.8): el círculo de 24 px (radio 12) del blanco chico no corta otro blanco ni el círculo de otro blanco chico.
  // Un blanco DENTRO de otro (el botón en una fila clicable) nunca pasa por separación: el círculo cae sobre el blanco que lo contiene.
  const dentroDeOtro = (b) => blancos.some((o) => o !== b && o.e.contains(b.e));
  const separado = (b) => !dentroDeOtro(b) && blancos.every((o) => {
    if (o === b || b.e.contains(o.e)) return true; // lo que vive dentro del propio blanco es parte de él
    return chico(o, 24) ? Math.hypot(b.a.cx - o.a.cx, b.a.cy - o.a.cy) >= 24 : distARect(b.a.cx, b.a.cy, o.a) >= 12;
  });
  const fila = (b) => ({ lado: lado(b.e), texto: `${pista(b.e)} ${px(b.a.w)}×${px(b.a.h)} [${lado(b.e)}]${dentroDeOtro(b) ? ' · dentro de otro blanco' : ''}` });
  const bajo24 = [], bajo24Separado = [];
  for (const b of blancos.filter((b) => chico(b, 24))) (separado(b) ? bajo24Separado : bajo24).push(fila(b));
  const bajo44 = dedo ? blancos.filter((b) => chico(b, 44)).map(fila) : null;
  const bajo32Alto = dedo ? 0 : blancos.filter((b) => lado(b.e) === 'pantalla' && b.a.h >= 24 && b.a.h < 32 && !b.e.matches('input[type=checkbox],input[type=radio],[role=checkbox],[role=radio],[role=switch]')).length;

  // ───────────────────────── 2 · relleno, margen y hueco declarados fuera de la escala de 4 px
  // ok: múltiplo de 4 · medio paso: 2, 6 o 10 DENTRO de un control o pieza chica (alto ≤ 48 px) · fuera: todo lo demás (impares, fracciones, 14, 18, 22…)
  const fuera = {}, medioFuera = {}, ejemplosFuera = {};
  const anota = (mapa, v, e, prop) => { const k = px(v); mapa[k] = (mapa[k] || 0) + 1; if (mapa === fuera && !(ejemplosFuera[k]?.length >= 2)) (ejemplosFuera[k] ||= []).push(`${prop} en ${pista(e)}`); };
  for (const e of todos) {
    if (!main.contains(e) || e === main) continue;
    const s = cs(e), r = e.getBoundingClientRect();
    const props = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom'];
    // Margen lateral: «auto» se lee como px; si los dos lados son iguales y > 24 es un centrado, no un paso de la escala.
    if (!(s.marginLeft === s.marginRight && parseFloat(s.marginLeft) > 24)) props.push('marginLeft', 'marginRight');
    if (/flex|grid/.test(s.display)) props.push('rowGap', 'columnGap');
    // El subrayado de `.btn-enlace` usa 0,25 em de relleno y −0,25 em de margen que se anulan (globals.css): no es espacio.
    const enlace = e.classList.contains('btn-enlace');
    for (const p of props) {
      if (enlace && (p === 'paddingBottom' || p === 'marginBottom')) continue;
      const v = Math.abs(parseFloat(s[p]));
      if (!v || Number.isNaN(v)) continue;
      if (Math.abs(v / 4 - Math.round(v / 4)) < 0.03) continue;
      const medio = [2, 6, 10].some((m) => Math.abs(v - m) < 0.12);
      if (medio && r.height <= 48) continue;
      anota(medio ? medioFuera : fuera, v, e, p);
    }
  }

  // ───────────────────────── 3 · proximidad: en un grupo SIN caja, el aire de adentro no supera al de afuera
  const tieneCaja = (s) => parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderLeftWidth) > 0 || s.boxShadow !== 'none' || s.backgroundImage !== 'none' ||
    (s.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor));
  const enFlujo = (c) => vis(c) && !/absolute|fixed/.test(cs(c).position) && !/^inline$/.test(cs(c).display) && c.getBoundingClientRect().height >= 8;
  const huecos = (hijos) => {
    const rs = hijos.map((c) => c.getBoundingClientRect());
    const enFila = rs.every((r) => Math.min(r.bottom, rs[0].bottom) - Math.max(r.top, rs[0].top) > 0.5 * Math.min(r.height, rs[0].height));
    const orden = rs.slice().sort((a, b) => (enFila ? a.left - b.left : a.top - b.top));
    const g = [];
    for (let i = 1; i < orden.length; i++) g.push(enFila ? orden[i].left - orden[i - 1].right : orden[i].top - orden[i - 1].bottom);
    return { g: g.filter((x) => x > -0.5), enFila };
  };
  const proximidad = [];
  for (const p of todos) {
    if (!main.contains(p) || p === main || tieneCaja(cs(p))) continue;
    const hijos = [...p.children].filter(enFlujo);
    if (hijos.length < 2) continue;
    const adentro = huecos(hijos);
    if (!adentro.g.length) continue;
    const maxAdentro = Math.max(...adentro.g);
    if (maxAdentro < 8) continue;
    const hermanos = [...(p.parentElement?.children || [])].filter(enFlujo);
    if (hermanos.length < 2) continue;
    const afuera = huecos(hermanos);
    // El aire de afuera es el hueco de `p` con su vecino más cercano en el eje de su padre.
    const rp = p.getBoundingClientRect();
    const vecinos = hermanos.filter((h) => h !== p).map((h) => {
      const r = h.getBoundingClientRect();
      return afuera.enFila ? Math.max(r.left - rp.right, rp.left - r.right) : Math.max(r.top - rp.bottom, rp.top - r.bottom);
    }).filter((x) => x > -0.5);
    if (!vecinos.length) continue;
    const minAfuera = Math.min(...vecinos);
    if (maxAdentro > minAfuera + 1) proximidad.push(`${pista(p)}: adentro ${px(maxAdentro)} px > afuera ${px(minAfuera)} px`);
  }

  // ───────────────────────── 4 · densidad, radios y ancho
  const histo = (els) => els.reduce((m, e) => { const h = Math.round(e.getBoundingClientRect().height); m[h] = (m[h] || 0) + 1; return m; }, {});
  const enPantalla = (q) => [...main.querySelectorAll(q)].filter(vis);
  const altosControles = histo(enPantalla('.btn-cayla:not(.btn-enlace), .caja-campo, .caja-cayla, .pildora-cayla, [role=tab], select, input:not([type=checkbox]):not([type=radio]):not([type=hidden])'));
  const altosFilas = histo(enPantalla('.fila-cayla, tbody tr, [role=row]:not(.encabezado-tabla-cayla)'));
  const altosEncabezados = histo(enPantalla('.encabezado-tabla-cayla, thead tr'));
  // Radio invertido: un hijo pegado al borde de su padre (a menos de su radio) con esquinas MÁS redondas que el padre se ve deformado.
  // Lo concéntrico es radio de adentro ≈ radio de afuera − separación (propuesta 6).
  const radiosInvertidos = [];
  for (const e of todos) {
    if (!main.contains(e)) continue;
    const re = parseFloat(cs(e).borderTopLeftRadius), padre = e.parentElement;
    if (!re || !padre || re >= 500) continue; // 999 px = píldora: forma, no esquina
    const rp = parseFloat(cs(padre).borderTopLeftRadius);
    if (!rp || rp >= 500) continue;
    const a = e.getBoundingClientRect(), b = padre.getBoundingClientRect(), sep = Math.min(a.left - b.left, a.top - b.top);
    if (sep >= 0 && sep < rp && re > rp) radiosInvertidos.push(`${pista(e)} radio ${re} dentro de ${pista(padre)} radio ${rp} (a ${px(sep)} px)`);
  }
  const rm = main.getBoundingClientRect();
  const masAncho = Math.max(0, ...[...main.children].filter(vis).map((c) => c.getBoundingClientRect().width));
  const anchoUtil = rm.width - parseFloat(cs(main).paddingLeft) - parseFloat(cs(main).paddingRight);

  const resumen = {
    blancosBajo24QueFallanAA: bajo24.filter((x) => x.lado === 'pantalla').length,
    blancosBajo24DelMarco: bajo24.filter((x) => x.lado === 'marco').length, // se reporta aparte: es del lateral o la cabecera
    blancosBajo44ConDedo: dedo ? bajo44.filter((x) => x.lado === 'pantalla').length : 'no aplica (puntero fino)',
    valoresFueraDeEscala: Object.values(fuera).reduce((a, b) => a + b, 0),
    mediosPasosFueraDeUnControl: Object.values(medioFuera).reduce((a, b) => a + b, 0),
    gruposConProximidadRota: proximidad.length,
    radiosInvertidos: radiosInvertidos.length,
  };
  return {
    viewport: { ancho: innerWidth, alto: innerHeight, puntero: dedo ? 'grueso: mínimo 44 px' : 'fino: mínimo 24 px (AA), objetivo 32 px' },
    resumen,
    detalle: {
      blancosBajo24: bajo24.slice(0, TOPE).map((x) => x.texto),
      blancosBajo24PeroSeparados: bajo24Separado.slice(0, TOPE).map((x) => x.texto), // pasan 2.5.8 por la excepción de separación; anótalos, no son falla
      blancosBajo44: bajo44 ? bajo44.slice(0, TOPE).map((x) => x.texto) : 'Con mouse no se mide el 44: el área de tacto.css solo existe con pointer: coarse. Emula un celular táctil en DevTools o corre `pnpm --filter web tacto:medir`.',
      blancosDePantallaBajo32DeAlto: bajo32Alto,
      fueraDeEscala: { valores: fuera, ejemplos: ejemplosFuera },
      mediosPasosFueraDeUnControl: medioFuera,
      proximidadRota: proximidad.slice(0, TOPE),
      altosDeControles: altosControles,
      altosDeFilas: altosFilas,
      altosDeEncabezados: altosEncabezados,
      radiosInvertidos: radiosInvertidos.slice(0, TOPE),
      ancho: { util: px(anchoUtil), bloqueMasAncho: px(masAncho), proporcion: px(masAncho / anchoUtil) }, // < 0,8 a 1440 px: ¿una columna angosta? (ADR-0462)
    },
    nota: 'Medido. Lo que ya mide /formidable (huecos renderizados entre hermanos, alturas desiguales en una fila, cantidad de radios y de sombras) se corre con su medir-oficio.js, no aquí.',
  };
})()
