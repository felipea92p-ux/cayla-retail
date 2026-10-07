// El censo DENTRO de la página (ADR-0358). La CLI lo inyecta con `addScriptTag` y llama a `window.__unificarCensar()`.
//
// Recorre lo que se ve y reconoce cada familia (`unificar/familias.mjs`): botones, insignias, pestañas, tablas, cifras, iconos,
// gráficos, hojas… A cada elemento le saca su HUELLA: las medidas que una persona VE (alto, radio, fondo, letra, icono), con los
// colores traducidos al token del sistema («tinta», «rojo/35», «≈taupe» si se parece, el hex si no es ninguno). Dos elementos de
// la misma familia con la misma huella son la misma variante; con huellas distintas, dos variantes que alguien dibujó distinto.
//
// Solo MIRA: no cambia nada de la página salvo un atributo `data-unificar-id` en cada elemento contado (para que la CLI lo
// capture). Deja fuera el marco (lateral y cabecera: es uno solo para todo el ERP), el papel físico (`.papel-fijo`, `[data-papel]`:
// boletas, tickets y etiquetas se diseñan para imprimirse) y lo que está escondido.

(() => {
  // ---------- colores: todo color se lee pintándolo en un píxel, así sale en sRGB venga como venga (hex, oklch, color-mix) ----------
  const lienzo = document.createElement("canvas");
  lienzo.width = lienzo.height = 1;
  const pincel = lienzo.getContext("2d", { willReadFrequently: true });
  const memo = new Map();
  function rgba(css) {
    if (!css) return null;
    if (memo.has(css)) return memo.get(css);
    let c = null;
    try {
      pincel.clearRect(0, 0, 1, 1);
      pincel.fillStyle = "#000";
      pincel.fillStyle = css;
      pincel.fillRect(0, 0, 1, 1);
      const d = pincel.getImageData(0, 0, 1, 1).data;
      c = [d[0], d[1], d[2], d[3] / 255];
    } catch {
      c = null;
    }
    memo.set(css, c);
    return c;
  }

  function leerTokens() {
    const nombres = new Set();
    const recorrer = (reglas) => {
      for (const r of reglas) {
        if (r.cssRules) {
          try {
            recorrer(r.cssRules);
          } catch {
            /* hoja de otro origen */
          }
        }
        if (r.style && r.selectorText && /:root|:host/.test(r.selectorText)) for (const p of r.style) if (p.startsWith("--color-")) nombres.add(p);
      }
    };
    for (const h of document.styleSheets) {
      try {
        recorrer(h.cssRules);
      } catch {
        /* hoja de otro origen */
      }
    }
    const cs = getComputedStyle(document.documentElement);
    const tokens = [];
    for (const n of nombres) {
      const v = cs.getPropertyValue(n).trim();
      const c = v && rgba(v);
      if (c && c[3] > 0.99) tokens.push({ nombre: n.slice("--color-".length), rgb: c.slice(0, 3) });
    }
    // El nombre corto gana cuando dos tokens valen lo mismo («tinta» antes que «tinta-fija»).
    return tokens.sort((a, b) => a.nombre.length - b.nombre.length);
  }
  let TOKENS = [];

  const hex = (c) => "#" + c.slice(0, 3).map((x) => x.toString(16).padStart(2, "0")).join("");
  /** El nombre de un color en el idioma del sistema. */
  function nombrar(css) {
    const c = rgba(css);
    if (!c || c[3] < 0.03) return "ninguno";
    let mejor = null;
    let dist = Infinity;
    for (const t of TOKENS) {
      const d = Math.hypot(t.rgb[0] - c[0], t.rgb[1] - c[1], t.rgb[2] - c[2]);
      if (d < dist) {
        dist = d;
        mejor = t;
      }
    }
    const alfa = c[3] < 0.97 ? "/" + Math.max(5, Math.round((c[3] * 100) / 5) * 5) : "";
    // Con poca opacidad el píxel pierde precisión: la tolerancia crece.
    const tol = 8 + (1 - c[3]) * 24;
    if (mejor && dist <= tol) return mejor.nombre + alfa;
    if (mejor && dist <= tol + 22) return "≈" + mejor.nombre + alfa;
    return hex(c) + alfa;
  }
  const alfaDe = (css) => (rgba(css) || [0, 0, 0, 0])[3];

  // ---------- medidas ----------
  const px = (v) => parseFloat(v) || 0;
  const par = (n) => Math.round(n / 2) * 2;
  const estilo = (el) => getComputedStyle(el);
  function vis(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (el.checkVisibility) return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    const s = estilo(el);
    return s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.05;
  }
  const escondido = (el) => !!el.closest(".sr-only,[aria-hidden='true'],[inert]");
  function radio(s, alto) {
    const crudo = s.borderTopLeftRadius;
    if (crudo.endsWith("%")) return px(crudo) >= 40 ? "pleno" : px(crudo) + "%";
    const r = px(crudo);
    if (r <= 0.5) return 0;
    if (r >= alto / 2 - 1) return "pleno";
    const pasos = [2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32];
    return pasos.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a));
  }
  const LADO = { Top: "arriba", Right: "der", Bottom: "abajo", Left: "izq" };
  function borde(s, sinColor) {
    const lados = Object.keys(LADO).filter((l) => px(s[`border${l}Width`]) > 0 && s[`border${l}Style`] !== "none" && alfaDe(s[`border${l}Color`]) > 0.05);
    if (!lados.length) return "no";
    const l = lados[0];
    const tipo = s[`border${l}Style`] !== "solid" ? ` ${s[`border${l}Style`]}` : "";
    const cuales = lados.length === 4 ? "" : ` (${lados.map((x) => LADO[x]).join("+")})`;
    return `${Math.round(px(s[`border${l}Width`]))}px${sinColor ? "" : " " + nombrar(s[`border${l}Color`])}${tipo}${cuales}`;
  }
  /** ¿Se ve como una caja? Fondo (color, degradado o vidrio), borde o sombra. */
  const tieneCaja = (s) => borde(s, true) !== "no" || alfaDe(s.backgroundColor) > 0.03 || (s.backgroundImage && s.backgroundImage !== "none") || (s.backdropFilter && s.backdropFilter !== "none") || (s.boxShadow && s.boxShadow !== "none");
  function fondoDe(s, sinColor) {
    const conColor = alfaDe(s.backgroundColor) > 0.03;
    const degradado = /gradient/.test(s.backgroundImage || "");
    const vidrio = s.backdropFilter && s.backdropFilter !== "none";
    if (sinColor) return conColor || degradado ? "con fondo" : "sin fondo";
    const base = conColor ? nombrar(s.backgroundColor) : degradado ? "degradado" : "ninguno";
    return vidrio ? `${base} + vidrio` : base;
  }
  function caja(el, { sinColor = false, sinAlto = false } = {}) {
    const s = estilo(el);
    const r = el.getBoundingClientRect();
    const o = {};
    if (!sinAlto) o.alto = par(r.height);
    o.radio = radio(s, r.height);
    o.fondo = fondoDe(s, sinColor);
    o.borde = borde(s, sinColor);
    o.relleno = `${par(px(s.paddingTop))}·${par(px(s.paddingRight))}`;
    o.sombra = s.boxShadow && s.boxShadow !== "none" ? "sí" : "no";
    return o;
  }
  /** El elemento que pinta el texto principal (el primero visible). */
  function portador(el) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.textContent.trim() && n.parentElement && vis(n.parentElement) && !n.parentElement.closest("svg") && !escondido(n.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    const n = w.nextNode();
    return n ? n.parentElement : null;
  }
  function fuente(ff) {
    const primera = (ff || "").split(",")[0].toLowerCase();
    if (/garamond|serif/.test(primera) && !/sans/.test(primera)) return "serif";
    if (/mono/.test(primera)) return "mono";
    return "sans";
  }
  function letra(el, { sinColor = false } = {}) {
    const t = portador(el) || el;
    const s = estilo(t);
    const o = {
      tam: Math.round(px(s.fontSize) * 2) / 2,
      peso: Math.round(+s.fontWeight / 100) * 100,
      fuente: fuente(s.fontFamily),
      mayus: s.textTransform === "uppercase" || /small-caps/.test(s.fontVariantCaps || "") ? "sí" : "no",
      espaciado: s.letterSpacing === "normal" ? "0" : `${Math.round(px(s.letterSpacing) * 10) / 10}px`,
    };
    if (!sinColor) o.color = nombrar(s.color);
    return o;
  }
  const GLIFOS = /^[←→‹›«»×✕✖⋯…+−✓✔︎↗↘↓↑]$/;
  function nombreIcono(svg) {
    const c = [...(svg.classList || [])].find((x) => x.startsWith("lucide-"));
    return c ? c.slice("lucide-".length) : "propio";
  }
  function trazo(svg) {
    const t = svg.getAttribute("stroke-width") || (svg.querySelector("[stroke-width]") || svg).getAttribute("stroke-width") || estilo(svg).strokeWidth;
    return Math.round(px(t) * 4) / 4;
  }
  /** El icono de un control: qué es, de qué tamaño y a qué lado del texto. */
  function iconoDe(el) {
    const svg = [...el.querySelectorAll("svg")].find((s) => vis(s) && s.getBoundingClientRect().width <= 40);
    const texto = (el.innerText || "").trim();
    if (!svg) {
      const glifo = [...el.querySelectorAll("span,i")].find((s) => GLIFOS.test((s.textContent || "").trim()));
      if (glifo) return { icono: `glifo ${glifo.textContent.trim()}`, lado: texto.length > 2 ? (texto.startsWith(glifo.textContent.trim()) ? "izq" : "der") : "solo" };
      return { icono: "no" };
    }
    const r = svg.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const lado = texto ? (r.left + r.width / 2 < b.left + b.width / 2 ? "izq" : "der") : "solo";
    return { icono: `${nombreIcono(svg) === "propio" ? "propio" : "lucide"} ${Math.round(r.width)}px trazo ${trazo(svg)}`, lado };
  }
  const textoCorto = (el) => (el.innerText || el.getAttribute?.("aria-label") || el.value || "").trim().replace(/\s+/g, " ").slice(0, 48);
  const sinTildes = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const nombreDe = (el) => sinTildes(((el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.value || "").trim().split("\n")[0] || "").toLowerCase()).replace(/\s+/g, " ").trim();
  const clasesDe = (el) => (el ? (typeof el.className === "string" ? el.className : el.getAttribute("class") || "") : "").trim().replace(/\s+/g, " ");

  function zona(el) {
    if (el.closest('[role="dialog"]')) return "hoja";
    return "pagina";
  }
  /** Una muestra de color de una prenda (un círculo pintado con el color del dato, sin texto) no es una pieza de diseño. */
  const esMuestraDeColor = (el) => {
    if (el.closest("[data-color-dato]")) return true;
    const r = el.getBoundingClientRect();
    if (r.width > 34 || r.height > 34 || (el.innerText || "").trim()) return false;
    const n = nombrar(estilo(el).backgroundColor);
    return n.startsWith("#") || n.startsWith("≈");
  };
  const fueraDelCenso = (el) => !!el.closest("aside, .papel-fijo, [data-papel], nextjs-portal") || (!!el.closest("header") && !el.closest("main") && !el.closest('[role="dialog"]'));

  // ---------- el movimiento (Felipe 2026-10-07: «que el censo diga si un componente tiene animaciones o cosas especiales») ----------
  // Lo que hace una pieza cuando la persona la usa: al pasar el mouse, al presionarla, al recibir el foco del teclado, cómo transiciona,
  // si entra con una animación y si algo late en bucle. Se lee de las REGLAS de CSS que le tocan (incluidas las de un hijo, como el
  // barrido de luz de `Boton`, que vive en un <span> adentro con `group-hover:`), de su transición calculada y de sus animaciones vivas.
  // Va dentro de la huella: dos botones idénticos en reposo, uno con barrido y otro sin él, son dos variantes distintas para la persona.
  const ESTADOS_CSS = [
    ["presionar", /:active\b/],
    ["foco", /:focus-visible\b|:focus\b(?!-)/],
    ["encima", /:hover\b/],
  ];
  let reglasMov = null;
  function juntarReglas(lista, padre, sal) {
    for (const r of lista) {
      try {
        if (r.selectorText !== undefined) {
          const sel = padre && r.selectorText.includes("&") ? r.selectorText.replace(/&/g, padre) : padre ? `${padre} ${r.selectorText}` : r.selectorText;
          if (r.style && r.style.length) {
            const estado = ESTADOS_CSS.find(([, re]) => re.test(sel));
            if (estado) {
              for (const parte of sel.split(/,(?![^(]*\))/)) {
                if (!estado[1].test(parte)) continue;
                const base = parte.replace(/:(hover|active|focus-visible|focus-within|focus)\b/g, "").replace(/:not\(\s*:disabled\s*\)/g, "").replace(/:where\(\s*\)/g, "").trim();
                // `:focus-visible` a secas es el anillo único del ERP (ADR-0351): vale para todo lo que se enfoca.
                sal.push({ estado: estado[0], base: base || "*", global: !base || base === "*", props: [...r.style].map((p) => [p, r.style.getPropertyValue(p)]) });
              }
            }
          }
          if (r.cssRules && r.cssRules.length) juntarReglas(r.cssRules, sel, sal);
        } else if (r.cssRules) {
          // @media (prefers-reduced-motion) no describe el movimiento: describe cómo se apaga.
          if (r.conditionText && /reduced-motion/.test(r.conditionText)) continue;
          juntarReglas(r.cssRules, padre, sal);
        }
      } catch {
        /* una regla que el navegador no expone */
      }
    }
  }
  function reglasDeMovimiento() {
    if (reglasMov) return reglasMov;
    const sal = [];
    for (const hoja of document.styleSheets) {
      try {
        juntarReglas(hoja.cssRules, "", sal);
      } catch {
        /* hoja de otro origen */
      }
    }
    reglasMov = sal;
    return sal;
  }
  const nombreAnimacion = (v) =>
    (v || "")
      .split(/\s+/)
      .find((t) => t && !/^-?[\d.]+m?s$/.test(t) && !/^(ease|ease-in|ease-out|ease-in-out|linear|infinite|forwards|backwards|both|none|normal|alternate|running|paused|\d+)$/.test(t) && !/^(cubic-bezier|steps|var)\(/.test(t)) || "";
  /** Una propiedad de CSS dicha como la ve la persona. */
  function efectoDe(p, v) {
    if (/^animation(-name)?$/.test(p)) {
      const n = nombreAnimacion(v);
      return n && n !== "none" ? `animación ${n}` : null;
    }
    if (/^(transform|translate|rotate)$/.test(p)) return "se mueve";
    if (p === "scale" || (p === "transform" && /scale/.test(v))) return "cambia de tamaño";
    if (/^--tw-scale/.test(p)) return "cambia de tamaño";
    if (/^--tw-(translate|rotate)/.test(p)) return "se mueve";
    if (/^background/.test(p)) return "fondo";
    if (p === "color" || p === "fill" || p === "stroke") return "color";
    if (/^border.*color$/.test(p)) return "borde";
    if (/box-shadow|--tw-shadow|--tw-ring/.test(p)) return "sombra o anillo";
    if (/^outline/.test(p)) return "anillo";
    if (p === "opacity") return "opacidad";
    if (/^text-decoration/.test(p)) return "subrayado";
    if (/^(width|height|max-width|max-height|padding|margin|gap|inset)/.test(p)) return "cambia de medida";
    return null;
  }
  const memoMov = new Map();
  /** El movimiento de una pieza: un objeto chico y estable (va en la clave de la variante). `null` si no hace nada. */
  function movimientoDe(el) {
    const nodos = [el, ...[...el.querySelectorAll("*")].slice(0, 40)];
    const clave = nodos.map((n) => `${n.tagName}.${clasesDe(n)}`).join("|");
    if (memoMov.has(clave)) return memoMov.get(clave);
    const por = { encima: new Set(), presionar: new Set(), foco: new Set() };
    for (const r of reglasDeMovimiento()) {
      let toca;
      try {
        toca = nodos.some((n) => n.matches(r.base));
      } catch {
        continue;
      }
      if (!toca) continue;
      for (const [p, v] of r.props) {
        const e = efectoDe(p, v);
        if (e) por[r.estado].add(r.global ? `${e} del sistema (ADR-0351)` : e);
      }
    }
    // La transición en reposo: cuánto tarda en cambiar lo que cambia (el valor más largo, redondeado a 50 ms).
    const s = estilo(el);
    const durs = (s.transitionDuration || "0s").split(",").map((d) => (d.trim().endsWith("ms") ? parseFloat(d) : parseFloat(d) * 1000));
    const max = Math.max(0, ...durs);
    const props = (s.transitionProperty || "").split(",").map((p) => p.trim()).filter((p) => p && p !== "none");
    let transicion = "sin transición";
    if (max > 0 && props.length) {
      const que = props.includes("all") ? "todo" : [...new Set(props.map((p) => efectoDe(p, "") || p))].slice(0, 4).join(", ");
      transicion = `${Math.round(max / 50) * 50} ms (${que})`;
    }
    // Lo que late solo, sin que nadie lo toque (el punto vivo de «Vencida»), y lo que entra con animación al aparecer.
    const vivas = (el.getAnimations ? el.getAnimations({ subtree: true }) : []).filter((a) => a.effect?.getTiming?.().iterations === Infinity);
    const bucle = [...new Set(vivas.map((a) => a.animationName || "transición en bucle"))].join(", ");
    const entra = nodos
      .flatMap((n) => [...(n.classList || [])])
      .filter((c) => /^(anim-|animate-|cascada)/.test(c) || /^\[animation:/.test(c))
      .filter((c, i, a) => a.indexOf(c) === i)
      .slice(0, 3)
      .join(", ");
    const lista = (set) => (set.size ? [...set].sort().join(", ") : "nada");
    const m = { encima: lista(por.encima), presionar: lista(por.presionar), foco: lista(por.foco), transicion };
    if (bucle) m.bucle = bucle;
    if (entra) m.entrada = entra;
    const vacio = m.encima === "nada" && m.presionar === "nada" && m.foco === "nada" && transicion === "sin transición" && !bucle && !entra;
    const res = vacio ? "sin movimiento" : m;
    memoMov.set(clave, res);
    return res;
  }
  // Las familias que la persona toca o que se mueven solas. Los iconos, títulos y tablas no: se mueven con lo que los contiene.
  const CON_MOVIMIENTO = new Set(["boton", "enlace", "pestanas", "casilla", "combo", "campo", "buscador", "cifra", "estado", "contador", "modal", "aviso", "paginacion", "grafico", "avatar"]);

  // ---------- el registro ----------
  let siguienteId = 1;
  const usados = new Set();
  const instancias = [];
  const cortadas = {};
  const TOPE = 120; // por familia y por página: el conteo sigue siendo exacto, el detalle no
  const porFamilia = {};
  function idDe(el) {
    if (!el.dataset.unificarId) el.dataset.unificarId = String(siguienteId++);
    return el.dataset.unificarId;
  }
  function anotar(familia, el, huella, extra = {}) {
    porFamilia[familia] = (porFamilia[familia] || 0) + 1;
    if (porFamilia[familia] > TOPE) {
      cortadas[familia] = (cortadas[familia] || 0) + 1;
      return;
    }
    const r = el.getBoundingClientRect();
    if (CON_MOVIMIENTO.has(familia) && huella && typeof huella === "object") huella = { ...huella, movimiento: movimientoDe(el) };
    instancias.push({
      uid: idDe(el),
      familia,
      huella,
      texto: textoCorto(el),
      clases: clasesDe(el),
      clasesPadre: clasesDe(el.parentElement),
      zona: zona(el),
      ancho: Math.round(r.width),
      alto: Math.round(r.height),
      ...extra,
    });
  }
  const marcar = (el) => {
    usados.add(el);
    for (const d of el.querySelectorAll("*")) usados.add(d);
  };

  // ---------- familias ----------
  const esActivo = (h) =>
    h.getAttribute("aria-selected") === "true" ||
    (h.getAttribute("aria-current") && h.getAttribute("aria-current") !== "false") ||
    h.getAttribute("data-state") === "active" ||
    h.getAttribute("aria-pressed") === "true" ||
    h.getAttribute("aria-checked") === "true" ||
    h.hasAttribute("data-activo") ||
    h.getAttribute("data-activa") === "true";
  const CLICABLE = 'button, a[href], [role="button"], [role="tab"], [role="radio"]';

  function censarHojas() {
    for (const d of document.querySelectorAll('[role="dialog"]')) {
      if (!vis(d)) continue;
      const r = d.getBoundingClientRect();
      const W = innerWidth;
      const posicion = r.left > W * 0.35 && r.right >= W - 4 ? "derecha" : r.left <= 4 && r.right < W * 0.65 ? "izquierda" : r.bottom >= innerHeight - 4 && r.top > innerHeight * 0.25 ? "abajo" : "centro";
      const titulo = d.querySelector("h1,h2,h3,[data-titulo]");
      const cerrar = [...d.querySelectorAll("button")].find((b) => vis(b) && /^(cerrar|×|✕)$/.test(nombreDe(b)));
      const botones = [...d.querySelectorAll("button")].filter(vis);
      const ultimo = botones[botones.length - 1];
      let pie = "sin botones";
      if (ultimo) {
        const fila = ultimo.parentElement;
        const s = estilo(fila);
        const fr = fila.getBoundingClientRect();
        const anchoBotones = [...fila.children].filter(vis).reduce((a, c) => a + c.getBoundingClientRect().width, 0);
        pie = anchoBotones > fr.width * 0.92 ? "a lo ancho" : s.justifyContent.includes("between") ? "repartidos" : s.justifyContent.includes("end") || s.justifyContent === "right" ? "a la derecha" : s.justifyContent.includes("center") ? "al centro" : "a la izquierda";
      }
      const ic = cerrar ? iconoDe(cerrar) : null;
      anotar("modal", d, {
        posicion,
        ancho: Math.round(r.width / 40) * 40,
        ...caja(d, { sinAlto: true }),
        titulo: titulo ? letra(titulo) : "sin título",
        cerrar: cerrar ? (ic.icono !== "no" ? ic.icono : "con texto") : "sin botón cerrar",
        pie,
      });
    }
  }

  function censarGraficos() {
    for (const el of document.querySelectorAll("svg, canvas, .recharts-wrapper")) {
      if (usados.has(el) || !vis(el) || fueraDelCenso(el) || escondido(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 56) continue;
      let tipo = "canvas";
      const colores = new Map();
      let textos = null;
      if (el.tagName.toLowerCase() === "svg" || el.querySelector("svg")) {
        const svg = el.tagName.toLowerCase() === "svg" ? el : el.querySelector("svg");
        const rects = [...svg.querySelectorAll("rect")].filter((x) => px(x.getAttribute("width")) > 1.5 && px(x.getAttribute("height")) > 1.5);
        const circulos = [...svg.querySelectorAll("circle")];
        const caminos = [...svg.querySelectorAll("path, polyline, line")];
        if (rects.length + circulos.length + caminos.length < 4) continue;
        const dona = circulos.some((c) => c.getAttribute("stroke-dasharray") || estilo(c).strokeDasharray !== "none") || caminos.filter((p) => /A/.test(p.getAttribute("d") || "")).length >= 2;
        const linea = [...svg.querySelectorAll("polyline")].length > 0 || caminos.some((p) => (p.getAttribute("d") || "").length > 60 && estilo(p).fill === "none");
        tipo = dona ? "dona" : rects.length >= 3 && rects.length >= caminos.length / 2 ? "barras" : linea ? "línea" : "otro";
        for (const f of [...rects, ...circulos, ...caminos].slice(0, 200)) {
          const s = estilo(f);
          for (const c of [s.fill, s.stroke]) {
            if (!c || c === "none" || alfaDe(c) < 0.05) continue;
            const n = nombrar(c).replace(/\/\d+$/, "");
            colores.set(n, (colores.get(n) || 0) + 1);
          }
        }
        const t = svg.querySelector("text");
        textos = t ? `con textos ${Math.round(px(estilo(t).fontSize))}px` : "sin textos";
      }
      const paleta = [...colores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => n).sort().join(" + ") || "—";
      anotar("grafico", el, { tipo, colores: paleta, ...(textos ? { textos } : {}) });
      marcar(el);
    }
  }

  function censarPestanas() {
    const grupos = new Set([...document.querySelectorAll('[role="tablist"]')].filter((g) => vis(g) && !fueraDelCenso(g)));
    for (const c of document.querySelectorAll("div, nav, ul, fieldset")) {
      if (grupos.has(c) || !vis(c) || fueraDelCenso(c)) continue;
      const hijos = [...c.children].map((h) => (h.matches("li") ? h.firstElementChild : h)).filter((h) => h && vis(h) && h.matches(CLICABLE));
      const visibles = [...c.children].filter(vis).length;
      if (hijos.length < 2 || hijos.length > 9 || hijos.length < visibles - 1) continue;
      if (hijos.filter(esActivo).length !== 1) continue;
      if (hijos.some((h) => esMuestraDeColor(h) || !(h.innerText || "").trim() || h.getBoundingClientRect().height < 24)) continue;
      const rs = hijos.map((h) => h.getBoundingClientRect());
      if (Math.max(...rs.map((r) => r.height)) - Math.min(...rs.map((r) => r.height)) > 4) continue;
      if (Math.max(...rs.map((r) => r.top)) - Math.min(...rs.map((r) => r.top)) > 6) continue;
      grupos.add(c);
    }
    const lista = [...grupos].filter((g) => ![...grupos].some((o) => o !== g && g.contains(o)));
    for (const g of lista) {
      const items = [...g.querySelectorAll('[role="tab"], button, a[href]')].filter(vis);
      if (items.length < 2) continue;
      const act = items.find(esActivo) || items[0];
      const ina = items.find((i) => i !== act) || items[1];
      const sa = estilo(act);
      const si = estilo(ina);
      const despues = getComputedStyle(act, "::after");
      const deslizante = [...g.querySelectorAll("*")].find((x) => !items.includes(x) && !items.some((i) => i.contains(x)) && estilo(x).position === "absolute" && vis(x) && alfaDe(estilo(x).backgroundColor) > 0.2);
      let indicador = "solo color";
      if (px(sa.borderBottomWidth) >= 1.5 && alfaDe(sa.borderBottomColor) > 0.3 && sa.borderBottomColor !== si.borderBottomColor) indicador = `subrayado ${nombrar(sa.borderBottomColor)}`;
      else if (/inset/.test(sa.boxShadow)) indicador = "subrayado (sombra)";
      else if (despues.content !== "none" && px(despues.height) > 0 && px(despues.height) <= 4) indicador = `subrayado ${nombrar(despues.backgroundColor)}`;
      else if (deslizante) indicador = deslizante.getBoundingClientRect().height <= 4 ? `subrayado deslizante ${nombrar(estilo(deslizante).backgroundColor)}` : `fondo deslizante ${nombrar(estilo(deslizante).backgroundColor)}`;
      else if (nombrar(sa.backgroundColor) !== nombrar(si.backgroundColor)) indicador = `fondo ${nombrar(sa.backgroundColor)}`;
      const cg = caja(g);
      anotar("pestanas", g, {
        contenedor: `${cg.fondo} · radio ${cg.radio} · borde ${cg.borde}`,
        alto: par(act.getBoundingClientRect().height),
        radioPestana: radio(sa, act.getBoundingClientRect().height),
        indicador,
        activa: `texto ${nombrar(sa.color)} · peso ${Math.round(+sa.fontWeight / 100) * 100}`,
        inactiva: `texto ${nombrar(si.color)}`,
        letra: letra(ina, { sinColor: true }),
      }, { piezas: items.length });
      marcar(g);
    }
  }

  function censarPaginacion() {
    const botones = [...document.querySelectorAll(CLICABLE)].filter((b) => !usados.has(b) && vis(b) && !fueraDelCenso(b) && /^(anterior|siguiente|‹|›|«|»)$/.test(nombreDe(b)));
    const hechos = new Set();
    for (const b of botones) {
      let c = b.parentElement;
      for (let i = 0; i < 3 && c && !/de \d+|pagina|\d+\s*[–-]\s*\d+/i.test(c.innerText || ""); i++) c = c.parentElement;
      if (!c || hechos.has(c) || (c.innerText || "").length > 160) continue;
      hechos.add(c);
      const otro = [...c.querySelectorAll(CLICABLE)].filter(vis);
      anotar("paginacion", c, { boton: { ...caja(b), ...iconoDe(b) }, texto: letra(c), botones: otro.length > 2 ? "con números" : "anterior y siguiente" });
      marcar(c);
    }
  }

  function envolturaDe(input) {
    // Una caja de texto sin borde ni fondo propio vive dentro de otra que los pone (con la lupa al lado): esa es la que se ve.
    const si = estilo(input);
    const propia = borde(si, true) !== "no" || alfaDe(si.backgroundColor) > 0.03;
    if (propia) return input;
    let p = input.parentElement;
    for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
      const s = estilo(p);
      if ((borde(s, true) !== "no" || alfaDe(s.backgroundColor) > 0.03) && Math.abs(p.getBoundingClientRect().height - input.getBoundingClientRect().height) < 24) return p;
    }
    return input;
  }

  function censarCampos() {
    for (const el of document.querySelectorAll("input, textarea")) {
      if (usados.has(el) || fueraDelCenso(el) || el.disabled && !vis(el)) continue;
      const tipo = (el.getAttribute("type") || "text").toLowerCase();
      if (["hidden", "submit", "button", "file", "range", "radio", "color"].includes(tipo)) continue;
      if (tipo === "checkbox") continue; // lo cuenta censarCasillas
      if (!vis(el)) continue;
      const pista = sinTildes(`${el.getAttribute("placeholder") || ""} ${el.getAttribute("aria-label") || ""}`.toLowerCase());
      const esBuscador = tipo === "search" || /\bbusc/.test(pista);
      const vista = envolturaDe(el);
      const h = { ...caja(vista), letra: letra(el) };
      if (esBuscador) {
        const lupa = [...vista.querySelectorAll("svg")].find(vis);
        h.lupa = lupa ? `${nombreIcono(lupa) === "propio" ? "propia" : "lucide"} ${Math.round(lupa.getBoundingClientRect().width)}px` : "sin lupa";
      }
      anotar(esBuscador ? "buscador" : "campo", vista, h, { texto: el.getAttribute("placeholder") || el.getAttribute("aria-label") || tipo });
      marcar(vista);
      usados.add(el);
    }
    for (const lab of document.querySelectorAll("label")) {
      if (usados.has(lab) || !vis(lab) || fueraDelCenso(lab) || escondido(lab)) continue;
      if (lab.querySelector('input[type="checkbox"], input[type="radio"], [role="switch"], [role="checkbox"]')) continue;
      const t = (lab.innerText || "").trim();
      if (!t || t.length > 60) continue;
      anotar("etiqueta-campo", lab, letra(lab));
    }
  }

  function censarCombos() {
    for (const el of document.querySelectorAll('button[aria-haspopup="listbox"], [role="combobox"]')) {
      if (usados.has(el) || !vis(el) || fueraDelCenso(el)) continue;
      const chevron = [...el.querySelectorAll("svg")].find(vis);
      anotar("combo", el, { ...caja(el), letra: letra(el, { sinColor: true }), flecha: chevron ? `${nombreIcono(chevron)} ${Math.round(chevron.getBoundingClientRect().width)}px` : "sin flecha" });
      marcar(el);
    }
  }

  function censarCasillas() {
    for (const el of document.querySelectorAll('input[type="checkbox"], [role="checkbox"], [role="switch"]')) {
      if (usados.has(el) || fueraDelCenso(el)) continue;
      const interruptor = el.getAttribute("role") === "switch";
      // Una casilla de verdad suele ser un input invisible con una caja dibujada al lado: se mide la que se ve.
      let vista = el;
      if (!vis(el) || el.getBoundingClientRect().width < 6) {
        const cerca = [el.nextElementSibling, el.previousElementSibling, ...(el.parentElement ? el.parentElement.children : [])].filter(Boolean);
        vista = cerca.find((x) => x !== el && vis(x) && x.getBoundingClientRect().width <= 44 && x.getBoundingClientRect().height <= 32) || null;
        if (!vista) continue;
      }
      const r = vista.getBoundingClientRect();
      const s = estilo(vista);
      anotar("casilla", vista, { tipo: interruptor ? "interruptor" : "casilla", lado: `${par(r.width)}×${par(r.height)}`, radio: radio(s, r.height), borde: borde(s), fondo: nombrar(s.backgroundColor) }, { marcada: el.checked || el.getAttribute("aria-checked") === "true" });
      marcar(vista);
      usados.add(el);
    }
  }

  function censarTablas() {
    const tablas = new Set([...document.querySelectorAll('table, [role="table"], [role="grid"]')]);
    // `Tabla` (components/ui/Tabla.tsx) es una rejilla de `div`: la fila de títulos lleva role="row" con celdas role="columnheader".
    for (const th of document.querySelectorAll('[role="columnheader"]')) {
      const fila = th.closest('[role="row"]');
      if (fila && fila.parentElement && !fila.closest("table, [role='table'], [role='grid']")) tablas.add(fila.parentElement);
    }
    for (const t of tablas) {
      if (usados.has(t) || !vis(t) || fueraDelCenso(t)) continue;
      const th = [...t.querySelectorAll('th, [role="columnheader"]')].find(vis);
      const filaTitulos = th ? th.closest('tr, [role="row"]') : null;
      const filas = (t.tagName === "TABLE" ? [...t.querySelectorAll("tbody tr")] : [...t.children].filter((x) => x !== filaTitulos)).filter((x) => vis(x) && !x.querySelector("th"));
      const celda = filas[0] ? [...filas[0].querySelectorAll('td, [role="cell"], [role="gridcell"]')].find(vis) || filas[0].firstElementChild : null;
      const altos = filas.slice(0, 9).map((f) => f.getBoundingClientRect().height).sort((a, b) => a - b);
      const separador = filas[0] ? (borde(estilo(filas[0])) !== "no" ? borde(estilo(filas[0])) : celda ? borde(estilo(celda)) : "no") : "—";
      let cont = t;
      for (let i = 0; i < 4 && cont.parentElement; i++) {
        const s = estilo(cont);
        if (tieneCaja(s) || px(s.borderTopLeftRadius) > 0) break;
        cont = cont.parentElement;
      }
      const cc = caja(cont, { sinAlto: true });
      const fondoTitulos = filaTitulos ? nombrar(estilo(filaTitulos).backgroundColor) : "—";
      anotar(
        "tabla",
        t,
        {
          titulos: th ? { ...letra(th), fondo: fondoTitulos !== "ninguno" ? fondoTitulos : nombrar(estilo(th).backgroundColor) } : "sin fila de títulos",
          fila: filas[0] ? { alto: par(altos[Math.floor(altos.length / 2)] || 0), separador, cebra: filas[1] && nombrar(estilo(filas[0]).backgroundColor) !== nombrar(estilo(filas[1]).backgroundColor) ? "sí" : "no" } : "sin filas",
          celda: celda ? { relleno: `${par(px(estilo(celda).paddingTop))}·${par(px(estilo(celda).paddingLeft))}`, ...letra(celda, { sinColor: true }) } : "—",
          contenedor: `${cc.fondo} · radio ${cc.radio} · borde ${cc.borde} · sombra ${cc.sombra}`,
        },
        { filas: filas.length, nativa: t.tagName === "TABLE" },
      );
      marcar(t);
    }
  }

  const NUMERO = /^(s\/\s?)?[-+−]?\d[\d.,\s]*(\s?(%|u|und|uds|prendas|piezas|d|dias|días|h|min))?$/i;
  function censarCifras() {
    for (const el of document.querySelectorAll("main *, [role='dialog'] *")) {
      if (usados.has(el) || fueraDelCenso(el) || el.closest("table, [role='row'], h1, button[aria-haspopup]")) continue;
      if (el.children.length > 2) continue;
      const t = (el.innerText || "").trim();
      if (!t || t.length > 16 || !NUMERO.test(t)) continue;
      if (!vis(el) || escondido(el) || px(estilo(el).fontSize) < 21) continue;
      const tam = px(estilo(el).fontSize);
      const textoPropio = (x) => [...x.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").trim();
      const esNombre = (x) => x !== el && !el.contains(x) && !x.contains(el) && textoPropio(x) && !NUMERO.test(textoPropio(x)) && vis(x) && !escondido(x) && px(estilo(x).fontSize) < tam;
      let tarjeta = null;
      let conNombre = null;
      let a = el.parentElement;
      for (let i = 0; i < 5 && a && a.getBoundingClientRect().width <= 560; i++, a = a.parentElement) {
        if (!conNombre && [...a.querySelectorAll("*")].some(esNombre)) conNombre = a;
        if (tieneCaja(estilo(a))) {
          tarjeta = a;
          break;
        }
      }
      tarjeta = tarjeta || conNombre || el.parentElement;
      if (!tarjeta || usados.has(tarjeta)) continue;
      const rn = el.getBoundingClientRect();
      const nombre = [...tarjeta.querySelectorAll("*")].find(esNombre);
      anotar("cifra", tarjeta, {
        tarjeta: caja(tarjeta, { sinAlto: true }),
        numero: letra(el, { sinColor: true }),
        nombre: nombre ? { ...letra(nombre), lugar: nombre.getBoundingClientRect().top < rn.top ? "arriba" : "abajo" } : "sin nombre",
      });
      marcar(tarjeta);
    }
  }

  function censarTitulos() {
    const h1 = [...document.querySelectorAll("h1")].find((h) => vis(h) && !fueraDelCenso(h) && !h.closest('[role="dialog"]'));
    if (h1) {
      const r = h1.getBoundingClientRect();
      const antes = [...document.querySelectorAll("main *")].find((x) => vis(x) && !x.children.length && (x.innerText || "").trim() && x.getBoundingClientRect().bottom <= r.top + 2 && x.getBoundingClientRect().bottom > r.top - 90 && px(estilo(x).fontSize) <= 13);
      const despues = h1.nextElementSibling && vis(h1.nextElementSibling) && h1.nextElementSibling.getBoundingClientRect().top - r.bottom < 60 ? h1.nextElementSibling : null;
      anotar("titulo-pagina", h1, { ...letra(h1), antetitulo: antes ? `${letra(antes).tam}px ${letra(antes).mayus === "sí" ? "versalitas" : "normal"}` : "sin antetítulo", bajada: despues ? `${letra(despues).tam}px ${letra(despues).color}` : "sin bajada" });
      usados.add(h1);
    }
    for (const h of document.querySelectorAll("h2, h3, h4, [role='heading']")) {
      if (usados.has(h) || !vis(h) || fueraDelCenso(h) || escondido(h)) continue;
      if (!(h.innerText || "").trim()) continue;
      anotar("titulo-seccion", h, { nivel: h.tagName.toLowerCase(), ...letra(h) });
      usados.add(h);
    }
  }

  const VACIO = /^(no hay|aun no|todavia no|sin (resultados|datos|movimientos|ventas|prendas|registros|pendientes|avisos|coincidencias|nada)|nada (que|por|para)|no se encontr|no encontramos|no tienes|ningun[ao]? )/;
  function censarVacios() {
    for (const el of document.querySelectorAll("main p, main div, main span, [role='dialog'] p, [role='dialog'] div")) {
      if (usados.has(el) || !vis(el) || fueraDelCenso(el) || escondido(el)) continue;
      const directo = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").trim();
      if (!directo || !VACIO.test(sinTildes(directo.toLowerCase()))) continue;
      let cont = el;
      const largo = (el.innerText || "").length;
      for (let i = 0; i < 3 && cont.parentElement && (cont.parentElement.innerText || "").length < largo * 2.5 + 60; i++) cont = cont.parentElement;
      if (usados.has(cont)) continue;
      const s = estilo(cont);
      const img = [...cont.querySelectorAll("svg, img")].find(vis);
      anotar("vacio", cont, {
        alineado: s.textAlign === "center" || s.alignItems === "center" ? "al centro" : "a la izquierda",
        dibujo: img ? `${img.tagName.toLowerCase() === "img" ? "imagen" : nombreIcono(img) === "propio" ? "dibujo propio" : "lucide"} ${Math.round(img.getBoundingClientRect().width)}px` : "sin dibujo",
        accion: cont.querySelector("button, a[href]") ? "con acción" : "sin acción",
        caja: caja(cont, { sinAlto: true }),
        letra: letra(el),
      });
      marcar(cont);
    }
  }

  function censarAvisos() {
    const candidatos = new Set([...document.querySelectorAll('[role="alert"], [role="status"], .nota-cayla, [data-aviso]')]);
    for (const el of document.querySelectorAll("main div, main p, main section, [role='dialog'] div")) {
      const s = estilo(el);
      if (px(s.borderLeftWidth) >= 2 && px(s.borderRightWidth) < 1 && alfaDe(s.backgroundColor) > 0.03 && (el.innerText || "").trim().length >= 15) candidatos.add(el);
    }
    for (const el of candidatos) {
      if (usados.has(el) || !vis(el) || fueraDelCenso(el) || escondido(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 180 || !(el.innerText || "").trim()) continue;
      const s = estilo(el);
      const ic = [...el.querySelectorAll("svg")].find(vis);
      anotar("aviso", el, { ...caja(el, { sinAlto: true }), bordeIzq: px(s.borderLeftWidth) >= 2 ? `${Math.round(px(s.borderLeftWidth))}px ${nombrar(s.borderLeftColor)}` : "no", icono: ic ? `${nombreIcono(ic)} ${Math.round(ic.getBoundingClientRect().width)}px` : "sin icono", letra: letra(el) });
      marcar(el);
    }
  }

  function censarAvatares() {
    for (const el of document.querySelectorAll("main span, main div, main img, [role='dialog'] span, [role='dialog'] div, [role='dialog'] img")) {
      if (usados.has(el) || !vis(el) || fueraDelCenso(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 18 || r.width > 64 || Math.abs(r.width - r.height) > 2) continue;
      const s = estilo(el);
      if (radio(s, r.height) !== "pleno") continue;
      const t = (el.innerText || "").trim();
      const conFoto = el.tagName === "IMG" || !!el.querySelector("img");
      if (!conFoto && !/^[A-ZÁÉÍÓÚÑ]{1,3}$/.test(t)) continue;
      anotar("avatar", el, { lado: par(r.width), fondo: nombrar(s.backgroundColor), borde: borde(s), contenido: conFoto ? "foto" : "iniciales", letra: conFoto ? "—" : letra(el, { sinColor: true }) });
      marcar(el);
    }
  }

  const pareceBoton = (a) => {
    const s = estilo(a);
    const r = a.getBoundingClientRect();
    const conBorde = borde(s, true) !== "no" && px(s.borderBottomWidth) > 0;
    // Un botón de solo icono (la flecha redonda de Volver) no tiene relleno: lo que lo hace botón es su caja y su dibujo.
    const soloIcono = !(a.innerText || "").trim() && !!a.querySelector("svg");
    return r.height >= 22 && r.height <= 64 && r.width <= 480 && (alfaDe(s.backgroundColor) > 0.05 || conBorde) && (px(s.paddingLeft) >= 6 || soloIcono);
  };

  function censarEtiquetas() {
    // Insignias de estado y contadores: chicos, con fondo o borde, que no se presionan (o que viven dentro de una fila clicable).
    const cand = [...document.querySelectorAll("main span, main div, main p, main strong, main small, [role='dialog'] span, [role='dialog'] div, [role='dialog'] p, [role='dialog'] small")];
    for (const el of cand) {
      if (usados.has(el) || !vis(el) || fueraDelCenso(el) || escondido(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 12 || r.height > 30 || r.width > 240 || r.width < 8) continue;
      const t = (el.innerText || "").trim().replace(/\s+/g, " ");
      if (!t || t.length > 28) continue;
      const s = estilo(el);
      if (!(alfaDe(s.backgroundColor) > 0.06 || borde(s, true) !== "no")) continue;
      if (radio(s, r.height) === 0) continue;
      if ([...el.children].some((c) => ["DIV", "P", "UL", "TABLE", "INPUT", "BUTTON"].includes(c.tagName))) continue;
      const boton = el.closest(CLICABLE);
      if (boton && boton.getBoundingClientRect().height <= 44) continue; // es el botón mismo (o parte de él), no una insignia
      const contador = /^\d{1,3}\+?$/.test(t) && r.width <= 34;
      const punto = [...el.querySelectorAll("span")].some((p) => {
        const pr = p.getBoundingClientRect();
        return pr.width > 0 && pr.width <= 9 && Math.abs(pr.width - pr.height) < 1.5 && alfaDe(estilo(p).backgroundColor) > 0.3;
      });
      const h = { ...caja(el, { sinColor: !contador }), letra: letra(el, { sinColor: !contador }) };
      if (!contador) h.punto = punto ? "con punto" : "sin punto";
      anotar(contador ? "contador" : "estado", el, h, { tono: `${nombrar(s.backgroundColor)} / ${nombrar(s.color)}` });
      marcar(el);
    }
  }

  function censarBotonesYEnlaces() {
    const todos = [...document.querySelectorAll('button, [role="button"], a[href], input[type="submit"], input[type="button"]')];
    for (const el of todos) {
      if (usados.has(el) || !vis(el) || fueraDelCenso(el) || escondido(el)) continue;
      if (el.matches('[role="tab"], [role="option"], [role="menuitem"], [aria-haspopup="listbox"]')) continue;
      const r = el.getBoundingClientRect();
      const esLink = el.matches("a[href]") && !el.matches(".btn-cayla, [role='button']");
      if (esLink && !pareceBoton(el)) {
        // Un enlace de texto: chico, sin bloques adentro (una fila o una tarjeta enlazada no es un «enlace»).
        if (r.height > 40 || el.querySelector("div, p, img, h2, h3, table")) continue;
        if (!(el.innerText || "").trim()) continue;
        const s = estilo(el);
        anotar("enlace", el, { ...letra(el), subrayado: /underline/.test(s.textDecorationLine) ? "sí" : "no", ...iconoDe(el) }, { nombre: nombreDe(el) });
        usados.add(el);
        continue;
      }
      if (r.height < 16 || r.height > 64 || r.width > 480) continue;
      if (esMuestraDeColor(el)) continue;
      const ic = iconoDe(el);
      const sistema = (clasesDe(el).match(/\bbtn-(primario|secundario|peligro|sutil|enlace)\b/) || [])[1];
      const svg = [...el.querySelectorAll("svg")].find(vis);
      anotar("boton", el, { ...caja(el), letra: letra(el), ...ic }, { nombre: nombreDe(el), sistema: sistema ? `btn-${sistema}` : null, soloIcono: ic.lado === "solo", iconoNombre: svg ? nombreIcono(svg) : null });
      marcar(el);
    }
  }

  function censarIconos() {
    // Cada icono suelto, también los de dentro de un botón (el botón ya contó su estilo; aquí se compara el dibujo).
    for (const svg of document.querySelectorAll("svg")) {
      if (!vis(svg) || fueraDelCenso(svg) || svg.closest(".recharts-wrapper")) continue;
      if (usados.has(svg) && !svg.closest("button, a[href], [role='button']")) continue;
      const r = svg.getBoundingClientRect();
      if (r.width < 8 || r.width > 40) continue;
      if (svg.parentElement && svg.parentElement.closest("svg")) continue;
      const nombre = nombreIcono(svg);
      anotar("icono", svg, { origen: nombre === "propio" ? "propio" : "lucide", tam: Math.round(r.width), trazo: trazo(svg) }, { icono: nombre === "propio" ? "propio" : nombre, enBoton: !!svg.closest("button, a[href], [role='button']") });
    }
    // Los glifos de texto que hacen de icono (←, ×, ›, ⋯): compiten con el dibujo de lucide para lo mismo.
    for (const el of document.querySelectorAll("main span, main i, main button, main a, [role='dialog'] span, [role='dialog'] button")) {
      if (!vis(el) || fueraDelCenso(el) || el.children.length) continue;
      const t = (el.textContent || "").trim();
      if (!GLIFOS.test(t)) continue;
      const s = estilo(el);
      anotar("icono", el, { origen: "glifo de texto", tam: Math.round(px(s.fontSize)), trazo: "—" }, { icono: `glifo ${t}`, enBoton: !!el.closest("button, a[href], [role='button']") });
    }
  }

  window.__unificarCensar = () => {
    TOKENS = leerTokens();
    // El orden importa: una pieza que ya contó una familia estructural (las pestañas, la paginación, un combo) no se vuelve a
    // contar como botón suelto.
    censarHojas();
    censarGraficos();
    censarPestanas();
    censarPaginacion();
    censarCombos();
    censarCasillas();
    censarCampos();
    censarTablas();
    censarCifras();
    censarTitulos();
    censarVacios();
    censarAvisos();
    censarAvatares();
    censarEtiquetas();
    censarBotonesYEnlaces();
    censarIconos();
    return { tokens: TOKENS.map((t) => t.nombre), instancias, cortadas, porFamilia };
  };

  /** Deja a la vista un elemento contado y devuelve su caja, para capturarlo. */
  window.__unificarEnfocar = (uid) => {
    const el = document.querySelector(`[data-unificar-id="${uid}"]`);
    if (!el || !vis(el)) return null;
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };

  /** Una foto del estado visible de una pieza (y de sus hijos): para comparar antes y después de pasarle el mouse. */
  window.__unificarEstado = (uid) => {
    const el = document.querySelector(`[data-unificar-id="${uid}"]`);
    if (!el) return null;
    const PROPS = [["backgroundColor", "fondo"], ["color", "color"], ["borderTopColor", "borde"], ["boxShadow", "sombra o anillo"], ["transform", "se mueve"], ["opacity", "opacidad"], ["textDecorationLine", "subrayado"]];
    const nodos = [el, ...[...el.querySelectorAll("*")].slice(0, 20)];
    const valores = nodos.map((n) => {
      const s = getComputedStyle(n);
      return PROPS.map(([p]) => s[p]);
    });
    const animaciones = (el.getAnimations ? el.getAnimations({ subtree: true }) : []).map((a) => {
      const t = a.effect?.getTiming?.() || {};
      const nombre = a.animationName || (a.transitionProperty ? `transición de ${efectoDe(a.transitionProperty, "") || a.transitionProperty}` : "animación");
      return `${nombre} ${Math.round((+t.duration || 0) / 10) * 10} ms${t.iterations === Infinity ? " en bucle" : ""}`;
    });
    return { valores, nombres: PROPS.map(([, n]) => n), animaciones: [...new Set(animaciones)] };
  };

  /** Lo que la lámina necesita para dibujar la propuesta con el CSS real: las hojas de estilo y las clases del <html> y el <body>. */
  window.__unificarEstilos = () => ({
    hojas: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href).filter(Boolean),
    enLinea: [...document.querySelectorAll("style")].map((s) => s.textContent || "").filter((t) => t.length > 0),
    claseHtml: document.documentElement.className,
    claseBody: document.body.className,
  });
})();
