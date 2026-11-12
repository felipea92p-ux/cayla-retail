// medir.js — lista lo que se mueve en la página (skill /movimiento). Se pega entero con `javascript_tool`, solo contra localhost.
//
// Uso:
//   1. Encender las animaciones (ADR-0625 arranca quieto):
//        localStorage.setItem("cayla-movimiento","vivo"); document.documentElement.setAttribute("data-movimiento","vivo")
//   2. Pegar este archivo: devuelve una FOTO de lo que se anima ahora mismo (sirve para bucles y para lo que dura).
//   3. Para lo que dura poco: `__mov.grabar(4000)`, disparar la acción (abrir la hoja, guardar) y leer `__mov.informe()`.
//      `grabar` también devuelve una promesa con el informe, por si la herramienta la espera.
//
// Qué marca (cada marca dice por qué):
//   · propiedad que no es transform/opacity/color: «layout» (mueve la página: lo peor) o «pinta» (repinta en cada cuadro);
//   · duración de más de 500 ms (dentro de una excepción de ADR-0136 el tope es 1 200 ms por pieza);
//   · bucle (`infinite`) que no es una señal de espera (`data-senal` o la lista de app/estilos/movimiento.css);
//   · curva que no es --ease-cayla, --ease-salida ni linear (en un bucle o un barrido, linear está bien).
// GSAP y lo que anima con requestAnimationFrame NO aparecen en document.getAnimations(): `grabar` los cuenta aparte, mirando
// qué elementos cambiaron su `style` muchas veces.
(() => {
  const CURVAS = {
    "cubic-bezier(0.32, 0.72, 0.24, 1)": "--ease-cayla",
    "cubic-bezier(0.4, 0, 1, 1)": "--ease-salida",
    linear: "linear",
  };
  const TOPE_MS = 500;
  const TOPE_EXCEPCION_MS = 1200;
  const COLOR = /^(color|background-color|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?-color|outline-color|fill|stroke|text-decoration-color|caret-color|column-rule-color|accent-color)$/;
  const BUENAS = /^(transform|translate|scale|rotate|opacity)$/;
  const LAYOUT = /^(width|height|min-|max-|top|right|bottom|left|inset|margin|padding|gap|row-gap|column-gap|font-size|line-height|letter-spacing|flex|grid|border-width|border-(top|right|bottom|left)-width)/;
  const NO_PROPS = new Set(["offset", "computedOffset", "easing", "composite"]);

  const kebab = (p) => p.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()).replace(/^webkit-/, "-webkit-");
  const norm = (c) => String(c || "").replace(/\s+/g, " ").replace(/\( /g, "(").trim();

  function nombrePieza(el, pseudo) {
    if (!el || !el.tagName) return "(sin elemento)";
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    const clases = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3) : [];
    if (clases.length) s += "." + clases.join(".");
    const guia = el.closest && el.closest("[data-guia]");
    if (guia) s += ` [en ${guia.getAttribute("data-guia")}]`;
    return s + (pseudo || "");
  }

  // Bucles que ADR-0136 (o su actualización) aprueba por su nombre y que se reconocen por su clase. No es la lista completa: lo que no
  // está aquí sale marcado y se confirma contra CLAUDE.md «Movimiento y modales» antes de darlo por hallazgo.
  const EXCEPCIONES = [
    [".cmp-punto-vivo", "el punto que late en el chip «Vencida» (ADR-0136)"],
  ];
  function excepcion(el) {
    if (!el || !el.closest) return null;
    const e = EXCEPCIONES.find(([sel]) => el.closest(sel));
    return e ? e[1] : null;
  }
  // Un bucle sobre algo que no se ve (opacidad 0 en él o en un padre) gasta cuadros sin mostrar nada: no es «no es señal», es otra falla.
  function invisible(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (parseFloat(getComputedStyle(n).opacity) === 0) return true;
    return false;
  }
  function esMarco(el) {
    const main = document.querySelector("main");
    return !!(main && el && el.nodeType === 1 && !main.contains(el));
  }

  function esSenal(el) {
    if (!el || !el.closest) return false;
    if (el.closest("[data-senal]")) return true;
    // La lista de señales hechas en CSS (app/estilos/movimiento.css).
    return !!el.closest(".buscador[data-buscando] .buscador-hilo, .caja-campo[data-trabajando], .hilo-l--trabaja");
  }

  function leer(anim, t0) {
    const ef = anim.effect;
    if (!ef || typeof ef.getComputedTiming !== "function") return null;
    const tiempo = ef.getComputedTiming();
    const timing = ef.getTiming ? ef.getTiming() : {};
    const cuadros = typeof ef.getKeyframes === "function" ? ef.getKeyframes() : [];
    const props = new Set();
    const curvasCuadro = new Set();
    for (const k of cuadros) {
      for (const p of Object.keys(k)) if (!NO_PROPS.has(p)) props.add(kebab(p));
      if (k.easing && k.easing !== "linear") curvasCuadro.add(norm(k.easing));
    }
    if (anim.transitionProperty) props.add(anim.transitionProperty);
    // En CSS la curva viaja en los cuadros (animation-timing-function / transition-timing-function); en WAAPI, en el timing.
    const curvas = curvasCuadro.size ? [...curvasCuadro] : [norm(timing.easing || "linear")];
    const duracion = Number(tiempo.duration) || 0;
    const demora = Number(tiempo.delay) || 0;
    const vueltas = tiempo.iterations;
    const enBucle = vueltas === Infinity;
    const inicio = anim.startTime == null ? null : Number(anim.startTime);
    const finAbs = inicio == null || enBucle ? null : inicio + demora + duracion * (vueltas || 1);
    const el = ef.target;
    const senal = esSenal(el);

    const marcas = [];
    for (const p of props) {
      if (BUENAS.test(p) || COLOR.test(p)) continue;
      marcas.push(LAYOUT.test(p) ? `layout: anima «${p}» (usa transform o FLIP)` : `pinta: anima «${p}» (cuesta en cada cuadro)`);
    }
    if (duracion > TOPE_MS && !enBucle) {
      marcas.push(duracion > TOPE_EXCEPCION_MS
        ? `dura ${Math.round(duracion)} ms: pasa incluso el tope de una excepción (1 200)`
        : `dura ${Math.round(duracion)} ms: más de 500 (¿está en la lista de ADR-0136?)`);
    }
    const aprobado = excepcion(el);
    if (enBucle && !senal && invisible(el)) marcas.push("bucle invisible: corre con opacidad 0 y gasta cuadros sin verse (que se encienda solo cuando se muestra)");
    else if (enBucle && !senal && !aprobado) marcas.push("bucle: no es señal de espera (¿tiene su fila en ADR-0136?)");
    for (const c of curvas) {
      if (CURVAS[c]) continue;
      if (enBucle && /^steps\(/.test(c)) continue; // el cursor que parpadea
      marcas.push(`curva fuera del sistema: ${c}`);
    }

    return {
      pieza: nombrePieza(el, ef.pseudoElement),
      tipo: anim.constructor ? anim.constructor.name : "Animation",
      nombre: anim.animationName || anim.transitionProperty || anim.id || "",
      propiedades: [...props],
      duracionMs: Math.round(duracion),
      demoraMs: Math.round(demora),
      vueltas: enBucle ? "infinita" : vueltas,
      curva: curvas.map((c) => CURVAS[c] || c).join(" · "),
      estado: anim.playState,
      senal,
      decididoAPropósito: aprobado || undefined,
      lado: esMarco(el) ? "marco" : "pantalla",
      terminaALosMs: finAbs == null || t0 == null ? null : Math.round(finAbs - t0),
      marcas,
      _inicio: inicio,
      _fin: finAbs,
    };
  }

  function estado() {
    const html = document.documentElement;
    return {
      url: location.pathname + location.search,
      movimiento: html.getAttribute("data-movimiento") || "(sin atributo)",
      sistemaPideMenos: !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches),
      ancho: innerWidth,
      alto: innerHeight,
    };
  }

  function armarInforme(animaciones, mutaciones) {
    const inicios = animaciones.map((a) => a.startTime).filter((x) => x != null).map(Number);
    const t0 = inicios.length ? Math.min(...inicios) : null;
    // En modo quieto (ADR-0625) las transiciones duran ~0 ms: no se mueve nada, pero getAnimations() las lista un instante (al cambiar de
    // tema salían 676, todas «curva fuera del sistema»). Lo que dura menos de 1 ms no es movimiento: se cuenta aparte, sin marcas.
    const todas = animaciones.map((a) => leer(a, t0)).filter(Boolean);
    const filas = todas.filter((f) => f.vueltas === "infinita" || f.duracionMs >= 1);
    const instantaneas = todas.length - filas.length;
    const fines = filas.map((f) => f._fin).filter((x) => x != null);
    const presupuesto = t0 == null || !fines.length ? null : Math.round(Math.max(...fines) - t0);
    for (const f of filas) { delete f._inicio; delete f._fin; }
    filas.sort((a, b) => b.marcas.length - a.marcas.length || (a.terminaALosMs ?? 0) - (b.terminaALosMs ?? 0));
    const marcadas = filas.filter((f) => f.marcas.length);
    const bucles = filas.filter((f) => f.vueltas === "infinita");
    const informe = {
      estado: estado(),
      total: filas.length,
      marcadas: marcadas.length,
      buclesAlaVez: bucles.length,
      buclesQueNoSonSenal: bucles.filter((f) => !f.senal && !f["decididoAPropósito"]).length,
      presupuestoMs: presupuesto, // del primer cuadro de la primera animación al último de la última (sin bucles)
      instantaneas, // duran < 1 ms (lo que deja el modo quieto): no se mueven
      resumen: "",
      filas,
    };
    if (mutaciones) informe.porJavaScript = mutaciones;
    informe.resumen =
      `${filas.length} animaciones (${marcadas.length} marcadas, ${bucles.length} bucles` +
      `${informe.buclesQueNoSonSenal ? `, ${informe.buclesQueNoSonSenal} que no son señal` : ""})` +
      (presupuesto != null ? ` · todo quieto a los ${presupuesto} ms` : "") +
      (mutaciones && mutaciones.length ? ` · ${mutaciones.length} piezas animadas por JavaScript (GSAP/rAF)` : "") +
      ` · movimiento=${informe.estado.movimiento}${informe.estado.sistemaPideMenos ? " (el sistema pide menos)" : ""}`;
    return informe;
  }

  function foto() {
    return armarInforme(document.getAnimations ? document.getAnimations() : [], null);
  }

  let grabacion = null;
  function grabar(ms = 4000) {
    if (grabacion) grabacion.parar();
    const vistas = new Set();
    const cambios = new Map(); // elemento -> { veces, props }
    const obs = new MutationObserver((lista) => {
      for (const m of lista) {
        if (m.type !== "attributes" || m.attributeName !== "style") continue;
        const el = m.target;
        const antes = m.oldValue || "";
        const ahora = el.getAttribute("style") || "";
        const props = new Set();
        for (const p of ["transform", "translate", "scale", "rotate", "opacity", "width", "height", "top", "left", "filter", "clip-path", "stroke-dashoffset"]) {
          const re = new RegExp(`(^|;)\\s*${p}\\s*:([^;]*)`);
          const a = (antes.match(re) || [])[2];
          const b = (ahora.match(re) || [])[2];
          if (a !== b) props.add(p);
        }
        if (!props.size) continue;
        const c = cambios.get(el) || { veces: 0, props: new Set() };
        c.veces += 1;
        props.forEach((p) => c.props.add(p));
        cambios.set(el, c);
      }
    });
    obs.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["style"], attributeOldValue: true });
    let vivo = true;
    const tic = () => {
      if (!vivo) return;
      if (document.getAnimations) for (const a of document.getAnimations()) vistas.add(a);
      requestAnimationFrame(tic);
    };
    requestAnimationFrame(tic);
    let resolver;
    const promesa = new Promise((r) => (resolver = r));
    const parar = () => {
      if (!vivo) return;
      vivo = false;
      obs.disconnect();
      const porJs = [...cambios.entries()]
        .filter(([, c]) => c.veces >= 3)
        .map(([el, c]) => {
          const props = [...c.props];
          const malas = props.filter((p) => !/^(transform|translate|scale|rotate|opacity)$/.test(p));
          return { pieza: nombrePieza(el), cambiosDeEstilo: c.veces, propiedades: props, marcas: malas.length ? [`anima por JS «${malas.join(", ")}»`] : [] };
        });
      api.ultimo = armarInforme([...vistas], porJs);
      grabacion = null;
      resolver(api.ultimo);
    };
    const reloj = setTimeout(parar, ms);
    grabacion = { parar: () => { clearTimeout(reloj); parar(); } };
    return promesa;
  }

  const api = {
    foto,
    grabar,
    parar: () => grabacion && grabacion.parar(),
    informe: () => api.ultimo || "Todavía no hay grabación: llama a __mov.grabar(4000), dispara la acción y vuelve a pedir __mov.informe().",
    ultimo: null,
  };
  window.__mov = api;
  return foto();
})();
