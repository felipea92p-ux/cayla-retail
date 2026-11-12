// Medir los gráficos de la pantalla abierta (skill /graficos, modo auditar).
// Pégalo entero en `javascript_tool`. No cambia nada de la página: solo lee el DOM y devuelve un objeto.
//
// Qué mide, por cada pieza de gráfico del sistema (`grafico.*` de CLAUDE.md, ADR-0358):
//   · tipo y alto en px (regla: ≥ 80 px si se lee magnitud; Heer & Bostock 2010)
//   · lo que dice al lector: role, aria-label, aria-hidden
//   · la rejilla: cuántas rayas, la menor separación (≥ 8 px) y su contraste efectivo contra el fondo
//   · cada marca de dato: su color ya mezclado con su opacidad, el color de lo que tiene al lado y el contraste (WCAG 1.4.11: ≥ 3:1,
//     salvo que el valor esté escrito a la vista o haya una tabla equivalente)
//   · cuántas cifras escritas lleva adentro (si las lleva todas, 1.4.11 queda cubierto por la excepción de las etiquetas)
//   · la duración de su entrada y de su transición (ADR-0136 / ADR-0357) y si el aparato está quieto (ADR-0625)
// Y fuera de las piezas: SVG o barras con pinta de gráfico dibujado a mano (pista para /unificar, que es quien decide).
//
// Límites honestos: el vidrio (backdrop-filter) y los degradados no se pueden mezclar desde el DOM: esas filas salen con
// `fondoIncierto: true` y se miden con una captura y un cuentagotas. Corre una vez en claro y otra con `data-tema="oscuro"`.
(() => {
  const lienzo = document.createElement("canvas");
  lienzo.width = lienzo.height = 1;
  const cx = lienzo.getContext("2d", { willReadFrequently: true });

  // Cualquier color CSS (rgb, color(srgb …), oklch, color-mix ya resuelto) → [r, g, b, a] con a de 0 a 1.
  const aRgba = (css) => {
    if (!css || css === "none" || css === "transparent" || css.startsWith("url")) return null;
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#010203";
    cx.fillStyle = css;
    if (cx.fillStyle === "#010203" && !/^#010203$/i.test(css)) return null; // el lienzo no lo entendió
    cx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data;
    return a === 0 ? null : [r, g, b, a / 255];
  };
  const sobre = (arriba, abajo) => {
    const a = arriba[3];
    return [0, 1, 2].map((i) => arriba[i] * a + abajo[i] * (1 - a)).concat(1);
  };
  const lum = ([r, g, b]) => {
    const c = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contraste = (x, y) => {
    const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p);
    return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
  };
  const hex = (c) => (c ? "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("") : null);

  // Opacidad acumulada del elemento y sus padres (una barra apagada a .4 pierde contraste de verdad).
  const opacidad = (el) => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity || "1");
    return o;
  };
  // El fondo pintado detrás de un elemento: se apilan los fondos de los padres hasta uno opaco.
  const fondoDe = (el) => {
    const capas = [];
    let incierto = false;
    for (let n = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backdropFilter && cs.backdropFilter !== "none") incierto = true;
      if (cs.backgroundImage && cs.backgroundImage !== "none") incierto = true;
      const c = aRgba(cs.backgroundColor);
      if (c) {
        capas.push(c);
        if (c[3] >= 1) break;
      }
    }
    let base = [255, 255, 255, 1];
    for (let i = capas.length - 1; i >= 0; i--) base = sobre(capas[i], base);
    return { color: base, incierto };
  };
  // El color con que se pinta una marca: el trazo si no tiene relleno (línea), si no el relleno, y en HTML el fondo.
  const colorDe = (el) => {
    const cs = getComputedStyle(el);
    let c = null;
    if (el instanceof SVGElement) {
      const relleno = aRgba(cs.fill);
      const trazo = cs.stroke !== "none" && parseFloat(cs.strokeWidth) > 0 ? aRgba(cs.stroke) : null;
      c = relleno && !(el.tagName === "path" && cs.fill === "none") ? relleno : trazo;
      if (el.tagName === "line" || (el.tagName === "path" && (!relleno || cs.fill === "none"))) c = trazo;
      if (c) c = [...c.slice(0, 3), c[3] * parseFloat(cs.strokeOpacity || cs.fillOpacity || "1")];
    } else {
      c = aRgba(cs.backgroundColor) || aRgba(cs.borderTopColor);
    }
    if (!c) return null;
    return [...c.slice(0, 3), c[3] * opacidad(el)];
  };
  const medirMarca = (el, papel) => {
    const c = colorDe(el);
    if (!c) return null;
    const { color: fondo, incierto } = fondoDe(el);
    const mezclado = sobre(c, fondo);
    const r = contraste(mezclado, fondo);
    return { clase: el.getAttribute("class"), color: hex(mezclado), fondo: hex(fondo), contraste: r, pasa3a1: r >= 3, fondoIncierto: incierto || undefined, papel };
  };
  const duraciones = (el) => {
    const cs = getComputedStyle(el);
    return { entrada: cs.animationName !== "none" ? `${cs.animationName} ${cs.animationDuration} +${cs.animationDelay}` : "—", transicion: cs.transitionDuration !== "0s" ? `${cs.transitionProperty} ${cs.transitionDuration}` : "—" };
  };
  const separacionMinima = (els, eje = "top") => {
    const ys = els.map((e) => e.getBoundingClientRect()[eje]).sort((a, b) => a - b);
    let min = Infinity;
    for (let i = 1; i < ys.length; i++) min = Math.min(min, ys[i] - ys[i - 1]);
    return Number.isFinite(min) ? Math.round(min) : null;
  };
  const cifrasEscritas = (raiz) =>
    [...raiz.querySelectorAll("text, span, b, strong")].filter((t) => !t.children.length && /\d/.test(t.textContent || "") && t.getClientRects().length && getComputedStyle(t).visibility !== "hidden" && opacidad(t) > 0.05).length;

  const PIEZAS = [
    { tipo: "grafico.linea · Linea", raiz: ".linea-cayla", marcas: ".linea-trazo, .linea-referencia, .linea-proyeccion, .linea-punto-fin", rejilla: ".linea-rejilla" },
    { tipo: "grafico.barras · BarrasTiempo", raiz: ".barras-tiempo", marcas: ".barra-t-relleno", rejilla: ".barras-tiempo-eje-y:not([data-cero])" },
    { tipo: "grafico.barra · BarraApilada", raiz: ".barra-apilada", marcas: ".barra-tramo-color", rejilla: null, pista: ":scope" },
    { tipo: "grafico.avance/escala · BarraAvance", raiz: ".barra-avance", marcas: ".barra-avance-lleno, .barra-avance-marca", rejilla: null, pista: ":scope" },
    { tipo: "grafico.anillo · Anillo", raiz: ".anillo", marcas: ".anillo-arco", rejilla: null, pista: ".anillo-pista" },
    { tipo: "grafico.linea · Sparkline", raiz: "svg:has(> .trazo-linea)", marcas: ".trazo-linea", rejilla: null },
  ];

  const piezas = [];
  for (const p of PIEZAS) {
    for (const raiz of document.querySelectorAll(p.raiz)) {
      if (!raiz.getClientRects().length) continue;
      const caja = raiz.getBoundingClientRect();
      const lector = raiz.closest("[aria-hidden='true']") ? "oculto (aria-hidden)" : raiz.getAttribute("role") || raiz.querySelector("svg[aria-label]") ? "img/grupo" : "sin rol";
      const etiqueta = raiz.getAttribute("aria-label") || raiz.querySelector("[aria-label]")?.getAttribute("aria-label") || null;
      const marcas = [...raiz.querySelectorAll(p.marcas)].slice(0, 40).map((m) => medirMarca(m)).filter(Boolean);
      // Una sola fila por color distinto: 30 barras en arena no son 30 hallazgos.
      const porColor = new Map();
      for (const m of marcas) if (!porColor.has(m.color + m.fondo)) porColor.set(m.color + m.fondo, m);
      const rayas = p.rejilla ? [...raiz.querySelectorAll(p.rejilla)] : [];
      const rejilla = rayas.length
        ? { rayas: rayas.length, separacionMinPx: separacionMinima(rayas), contraste: medirMarca(rayas[0])?.contraste ?? null }
        : null;
      // La pista (lo que falta para el total): si de ella depende leer «cuánto de cuánto», también pide 3:1 contra su fondo.
      const pistaEl = p.pista ? (p.pista === ":scope" ? raiz : raiz.querySelector(p.pista)) : null;
      const pista = pistaEl ? medirMarca(pistaEl) : null;
      const primera = raiz.querySelector(p.marcas);
      piezas.push({
        tipo: p.tipo,
        altoPx: Math.round(caja.height),
        anchoPx: Math.round(caja.width),
        lector,
        etiqueta,
        cifrasEscritas: cifrasEscritas(raiz),
        rejilla,
        marcas: [...porColor.values()],
        pista,
        movimiento: primera ? duraciones(primera) : null,
        donde: raiz.closest("[data-guia]")?.getAttribute("data-guia") || raiz.closest("section, article, [class*='card']")?.querySelector("h2, h3")?.textContent?.trim().slice(0, 60) || null,
      });
    }
  }

  // Lo que parece un gráfico y no es una pieza del sistema (pista, no veredicto: /unificar decide).
  const dentroDePieza = (el) => PIEZAS.some((p) => el.closest(p.raiz));
  // Un ícono (lucide, el logo, cualquier svg de 40 px o menos) tiene trazos largos y NO es un gráfico: antes cada ícono del lateral salía
  // como «gráfico dibujado a mano». Un gráfico de verdad mide más que un ícono.
  const esIcono = (e) => {
    const svg = e.closest("svg");
    if (!svg) return false;
    const r = svg.getBoundingClientRect();
    return svg.classList.contains("lucide") || (r.width <= 40 && r.height <= 40) || !!e.closest("aside, nav, header, nextjs-portal");
  };
  const sospechosos = [
    ...[...document.querySelectorAll("svg polyline, svg path")].filter((e) => !dentroDePieza(e) && !esIcono(e) && (e.getAttribute("points") || e.getAttribute("d") || "").split(/[ ,LlMm]/).length > 12),
    ...[...document.querySelectorAll("svg circle[stroke-dasharray], svg circle[style*='dash']")].filter((e) => !dentroDePieza(e)),
    ...[...document.querySelectorAll("[role='progressbar']")].filter((e) => !e.classList.contains("barra-avance")),
  ]
    .slice(0, 20)
    .map((e) => ({ tag: e.tagName.toLowerCase(), clase: e.getAttribute("class"), dentroDe: e.closest("[class]")?.getAttribute("class")?.slice(0, 80) }));

  const html = document.documentElement;
  return {
    ruta: location.pathname + location.search,
    ancho: innerWidth,
    tema: html.getAttribute("data-tema") || "claro",
    animaciones: html.getAttribute("data-movimiento") || "(sin atributo: quieto, ADR-0625)",
    reduceMovimiento: matchMedia("(prefers-reduced-motion: reduce)").matches,
    piezas,
    fallan3a1: piezas.flatMap((p) => p.marcas.filter((m) => !m.pasa3a1).map((m) => ({ tipo: p.tipo, ...m, cifrasEscritas: p.cifrasEscritas }))),
    bajo80px: piezas.filter((p) => p.altoPx < 80 && !/Sparkline|BarraApilada|BarraAvance|Anillo/.test(p.tipo)).map((p) => `${p.tipo}: ${p.altoPx} px`),
    rejillaJunta: piezas.filter((p) => p.rejilla && p.rejilla.separacionMinPx !== null && p.rejilla.separacionMinPx < 8).map((p) => `${p.tipo}: ${p.rejilla.separacionMinPx} px`),
    sinEtiqueta: piezas.filter((p) => p.lector === "sin rol" || (p.lector !== "oculto (aria-hidden)" && !p.etiqueta)).map((p) => p.tipo),
    sospechososAMano: sospechosos,
  };
})();
