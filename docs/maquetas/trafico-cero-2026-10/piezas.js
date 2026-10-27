/* =====================================================================
   piezas.js — lo común a las tres direcciones: el marco del ERP, la barra de maqueta, la cabecera (EncabezadoPagina), la fila de
   controles (período, filtros puestos, GRÁFICO / TABLA), la vista de tabla gemela, el cajón de la prenda (Cajon), el globito,
   la prenda sin foto (MosaicoPrenda) y el movimiento (Web Animations, una vez, sin rebote).

   Cada dirección se registra en `TRAFICO_UI.direcciones[clave]` con `render(cuerpo, r, { modo, prev, antes })`. `modo` es
   «entrada» (la primera vez o «Ver la entrada otra vez»: la coreografía completa) o «cambio» (un filtro o un período: una sola
   transición, sin repetir la entrada).
   ===================================================================== */
(function () {
  "use strict";
  const T = window.TRAFICO;
  const P = (window.TRAFICO_UI = { direcciones: {} });

  /* ---------- Estado (vive en la URL: dos personas con el mismo enlace ven lo mismo) ---------- */
  const q = new URLSearchParams(location.search);
  const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  P.QUIETO = q.has("quieto") || reducido;
  P.estado = {
    // C · La vitrina es la elegida (Felipe, 2026-10-23): abre por defecto; A y B quedan para comparar.
    dir: ["a", "b", "c"].includes(q.get("d")) ? q.get("d") : "c",
    tema: q.get("tema") === "oscuro" ? "oscuro" : "claro",
    ancho: [1024, 1440, 1920].includes(+q.get("ancho")) ? +q.get("ancho") : 1440,
    periodo: T.PERIODOS[q.get("p")] ? q.get("p") : "7d",
    filtro: { camino: q.get("camino") || null, ciudad: q.get("ciudad") || null },
    vista: q.get("vista") === "tabla" ? "tabla" : "grafico",
  };
  const ALTO = { 1024: 768, 1440: 900, 1920: 1080 };
  function guardarUrl() {
    const e = P.estado;
    const u = new URLSearchParams();
    u.set("d", e.dir);
    if (e.tema !== "claro") u.set("tema", e.tema);
    if (e.ancho !== 1440) u.set("ancho", e.ancho);
    if (e.periodo !== "7d") u.set("p", e.periodo);
    if (e.filtro.camino) u.set("camino", e.filtro.camino);
    if (e.filtro.ciudad) u.set("ciudad", e.filtro.ciudad);
    if (e.vista !== "grafico") u.set("vista", e.vista);
    if (q.has("quieto")) u.set("quieto", "");
    if (q.has("real")) u.set("real", "");
    history.replaceState(null, "", "?" + u.toString().replace(/(quieto|real)=(&|$)/g, "$1$2"));
  }

  /* ---------- Movimiento ---------- */
  P.EASE = "cubic-bezier(0.32, 0.72, 0.24, 1)";
  P.EASE_SALIDA = "cubic-bezier(0.4, 0, 1, 1)";
  const sinMovimiento = () => P.QUIETO || document.visibilityState !== "visible";
  /** Una animación de entrada: corre una vez y, al terminar, el elemento queda como dice su CSS (`fill: backwards`). */
  P.anim = function (el, frames, opts) {
    if (!el || sinMovimiento()) return null;
    return el.animate(frames, { easing: P.EASE, fill: "backwards", ...opts });
  };
  // Si la pestaña se oculta a mitad de una entrada, todo queda puesto (un navegador oculto frena los relojes).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") return;
    for (const a of document.getAnimations()) {
      try {
        if (a.effect && isFinite(a.effect.getComputedTiming().endTime)) a.finish();
      } catch (_) {
        /* una animación sin fin (el punto vivo) no se termina */
      }
    }
  });
  /** Una cifra que cuenta: el número lo mueve una animación «muda» (opacidad 1→1), así se pausa y se adelanta como las demás. */
  const contadores = new Set();
  let rafId = 0;
  function tic() {
    rafId = 0;
    for (const c of contadores) {
      const p = c.anim.effect.getComputedTiming().progress;
      c.el.textContent = c.formato(c.de + (c.a - c.de) * (p == null ? 1 : p));
      if (c.anim.playState === "finished") contadores.delete(c);
    }
    if (contadores.size) rafId = requestAnimationFrame(tic);
  }
  P.contar = function (el, de, a, opts) {
    if (!el) return;
    const o = { ms: 900, retraso: 0, formato: T.fmt, ...opts };
    el.textContent = o.formato(a);
    if (sinMovimiento() || de === a) return;
    el.textContent = o.formato(de);
    const anim = el.animate([{ opacity: 1 }, { opacity: 1 }], { duration: o.ms, delay: o.retraso, easing: P.EASE, fill: "both" });
    const c = { el, de, a, anim, formato: o.formato };
    contadores.add(c);
    anim.finished.then(
      () => (el.textContent = o.formato(a)),
      () => (el.textContent = o.formato(a)),
    );
    if (!rafId) rafId = requestAnimationFrame(tic);
  };
  /** Una tween de números (geometrías del hilo): llama a `alCuadro(p)` con el avance ya suavizado, de 0 a 1. */
  P.tween = function (ms, alCuadro, retraso) {
    if (sinMovimiento()) {
      alCuadro(1);
      return null;
    }
    const nodo = document.createElement("i");
    nodo.hidden = true;
    document.body.appendChild(nodo);
    const anim = nodo.animate([{ opacity: 1 }, { opacity: 1 }], { duration: ms, delay: retraso || 0, easing: P.EASE, fill: "both" });
    let id = 0;
    const cuadro = () => {
      const p = anim.effect.getComputedTiming().progress;
      alCuadro(p == null ? 1 : p);
      if (anim.playState !== "finished") id = requestAnimationFrame(cuadro);
    };
    id = requestAnimationFrame(cuadro);
    anim.finished.then(
      () => {
        cancelAnimationFrame(id);
        alCuadro(1);
        nodo.remove();
      },
      () => {
        cancelAnimationFrame(id);
        alCuadro(1);
        nodo.remove();
      },
    );
    return anim;
  };

  /* ---------- Íconos (trazo de lucide, 1.5 en el marco, 2 en el contenido) ---------- */
  const I = {
    casa: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    brujula: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    bolsa: '<path d="M5.5 7.5h13l1 13h-15z"/><path d="M9 7.5a3 3 0 0 1 6 0"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    cajas: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
    etiqueta: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    carrito: '<circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2 3h3l2.6 12.4a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21 7H6"/>',
    billetera: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
    gente: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    resumen: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    pedidos: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 7l2-4h14l2 4M10 11h4"/>',
    vitrina: '<path d="M3 9l1.5-5h15L21 9M4 9v11h16V9M9 20v-6h6v6"/>',
    campana: '<path d="M3 11l15-6v14L3 13z"/><path d="M7 13.5V18a2 2 0 0 0 4 0v-3"/>',
    chispas: '<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    trafico: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    ajustes: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    plegar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15.5 9.5 13 12l2.5 2.5"/>',
    buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    luna: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    abajo: '<path d="m6 9 6 6 6-6"/>',
    arriba: '<path d="m18 15-6-6-6 6"/>',
    derecha: '<path d="m9 18 6-6-6-6"/>',
    flecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    sube: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    baja: '<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
    igual: '<path d="M5 12h14"/>',
    embudoX: '<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/><path d="m16 15 5 5M21 15l-5 5"/>',
    tabla: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 10v10"/>',
    grafico: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    ubicacion: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    camino: '<path d="M4 19c4 0 4-14 8-14s4 14 8 14"/>',
  };
  P.icono = function (nombre, clase, trazo) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${trazo || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${clase ? ` class="${clase}"` : ""}>${I[nombre] || ""}</svg>`;
  };

  /* ---------- La prenda sin foto: el ícono de su categoría sobre su color (lib/icono-categoria-reglas.ts) ---------- */
  const ICONO_CATEGORIA = {
    POL: ["M8.6 3.5 3 6.6l2 4.4 2.5-1.2V20.5h9V9.8L19 11l2-4.4-5.6-3.1a3.6 3.6 0 0 1-6.8 0z"],
    CMP: ["M9 3.7 4.4 6 3 17.6l3.4.6 1.1-6.4v8.7h9v-8.7l1.1 6.4 3.4-.6L19.6 6 15 3.7c-.4 1.8-1.6 2.8-3 2.8s-2.6-1-3-2.8z", "M7.5 18h9", "M10.4 9.6v5M12 9.6v5M13.6 9.6v5"],
    CMS: ["M9 3.5 3.5 6.7 5 11l2.5-1.2v10.7h9V9.8L19 11l1.5-4.3L15 3.5", "m9 3.5 3 4.2 3-4.2", "M12 7.7v12.8", "M12 11h.01M12 14.5h.01M12 18h.01"],
    TOP: ["M8.6 3 8 8.2l-2.5 2.4V16h13v-5.4L16 8.2 15.4 3", "M8.6 3c.2 3.2 1.6 5 3.4 5s3.2-1.8 3.4-5"],
    VES: ["M9 3 8.6 8.8l-1.4 2.8-2.6 8.9h14.8l-2.6-8.9-1.4-2.8L15 3", "M9 3c.2 2.6 1.4 4 3 4s2.8-1.4 3-4", "M7.2 11.6h9.6"],
    FAL: ["M7.6 4h8.8l3.9 16H3.7z", "M7.3 7.6h9.4", "M10.5 7.6 9 20M13.5 7.6 15 20"],
    PAN: ["M7 3h10l3 18h-6.6L12 9.6 10.6 21H4z", "M7.2 6.2h9.6", "M12 6.2v3.4"],
    JEA: ["M7 3h10l1.6 18h-5.2L12 9.6 10.6 21H5.4z", "M7.2 6.2h9.6", "M7.4 6.2c0 2.4 1.4 3.6 3 3.6M16.6 6.2c0 2.4-1.4 3.6-3 3.6", "M12 6.2v3.4"],
    SHO: ["M6.6 4.5h10.8L19 16h-5.6L12 10.4 10.6 16H5z", "M6.8 7.6h10.4"],
    BLZ: ["M9 3.6 4.6 6 3.4 18.6l3.2.6.9-8.4v9.7h9v-9.7l.9 8.4 3.2-.6L19.4 6 15 3.6", "M9 3.6 12 13.6l3-10", "M9 3.6 10.5 7.4 8.6 9M15 3.6l-1.5 3.8L15.4 9", "M12.6 16.6h.01"],
    CAS: ["M8.6 3.8 4.4 6 3 17.6l3.6.6L7.5 11v9.5h9V11l.9 7.2 3.6-.6L19.6 6l-4.2-2.2", "M8.6 3.8v2.4L12 8l3.4-1.8V3.8", "M8.6 3.8c1-.9 2.2-1.3 3.4-1.3s2.4.4 3.4 1.3", "M12 8v12.5", "M7.5 17.6h9"],
    CHA: ["M8.6 3 6.6 8.4V18l5.4 3 5.4-3V8.4L15.4 3", "M8.6 3 12 11l3.4-8", "M12 14h.01M12 17h.01"],
    ENT: ["M9 2.6 8.6 7.6l-1.2 3-1.6 10.9H11l1-6.9 1 6.9h5.2l-1.6-10.9-1.2-3L15 2.6", "M9 2.6c.2 2.4 1.4 3.6 3 3.6s2.8-1.2 3-3.6", "M7.4 10.6h9.2"],
  };
  P.iconoCategoria = function (prefijo) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${(ICONO_CATEGORIA[prefijo] || []).map((d) => `<path d="${d}"/>`).join("")}</svg>`;
  };
  /** Luminancia relativa de un color de dato (para decidir si el trazo encima es tinta fija o crema fija, como MosaicoPrenda). */
  P.luminancia = function (hex) {
    const n = parseInt(hex.slice(1), 16);
    const lin = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  P.trazoSobre = (hex) => (P.luminancia(hex) > 0.32 ? "var(--color-tinta-fija)" : "var(--color-crema-fija)");
  /** El color que más se eligió de una prenda (a igual cantidad, el primero del catálogo): siempre un color del catálogo. */
  P.colorPrincipal = (p) => [...p.colores].sort((a, b) => b.n - a.n)[0].hex;
  P.mosaico = function (p, tam, hex) {
    const color = hex || P.colorPrincipal(p);
    const filo = P.luminancia(color) > 0.4;
    return `<span class="tr-mosaico${filo ? " tr-mosaico--filo" : ""}" data-color-dato aria-hidden="true" style="width:${tam}px;height:${tam}px;background-color:${color};color:${P.trazoSobre(color)}">${P.iconoCategoria(p.prefijo)}</span>`;
  };

  /* ---------- Palabras ---------- */
  P.fmt = T.fmt;
  P.personas = T.personasTxt;
  P.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  /** La frase del «aquí se atora», igual en las tres direcciones (una sola respuesta para una sola pregunta). */
  P.fraseAtora = function (r) {
    const a = r.atora;
    if (!a) return "Todavía hay muy poca gente para saber dónde se atora.";
    return `de cada 100 que ${a.anteriorNombre}, <b>${a.seFueronDe100} se fueron ${a.seFueronTexto}</b>.`;
  };
  /** El titular: «Se atora al separar». */
  P.titularAtora = (r) => (r.atora ? `Se atora ${r.atora.donde}` : "Todavía no se sabe dónde se atora");
  P.explicaAtora = function (r) {
    const a = r.atora;
    if (!a) return "";
    const base = `Es el paso que deja pasar a menos gente de la que llega a él: de ${P.personas(a.llegaron)} que ${a.anteriorNombre}, ${a.n === 1 ? "1 siguió" : `${P.fmt(a.n)} siguieron`}. Los demás pasos pierden menos gente de la que les llega.`;
    const ciudad = r.filtro.ciudad && T.CIUDADES.find((c) => c.clave === r.filtro.ciudad);
    if (ciudad && !ciudad.tienda && a.clave === "separaron")
      return `${base} En ${ciudad.nombre} no hay tienda CAYLA: para recoger lo separado hay que ir a Trujillo, Arequipa o Lima.`;
    return base;
  };
  P.nombreFiltro = function (r) {
    const c = r.filtro.camino && T.CAMINOS.find((x) => x.clave === r.filtro.camino);
    const u = r.filtro.ciudad && T.CIUDADES.find((x) => x.clave === r.filtro.ciudad);
    if (c && u) return `por ${c.nombre}, desde ${u.nombre}`;
    if (c) return `por ${c.nombre}`;
    if (u) return `desde ${u.nombre}`;
    return "";
  };

  /* =====================================================================
     El marco del ERP
     ===================================================================== */
  function filaLateral(nombre, icono, extra) {
    return `<span class="erp-fila${extra || ""}">${P.icono(icono, "", 1.5)}<span>${nombre}</span></span>`;
  }
  function marcoHtml() {
    const hijas = [
      ["Resumen", "resumen"],
      ["Pedidos", "pedidos"],
      ["Vitrina", "vitrina"],
      ["Campañas", "campana"],
      ["Recomendaciones", "chispas"],
    ]
      .map(([n, i]) => filaLateral(n, i, " erp-fila--hija"))
      .join("");
    return `
      <aside class="erp-lateral" aria-label="Menú del ERP">
        <div class="erp-logo"><div class="erp-logo__marca">CAYLA</div><div class="erp-logo__sub label-cayla">Retail · Sistema</div></div>
        <nav class="erp-nav" aria-label="Menú principal">
          ${filaLateral("Inicio", "casa")}
          ${filaLateral("Gestión", "brujula")}
          ${filaLateral("Ventas", "bolsa")}
          <span class="erp-fila erp-fila--abierta">${P.icono("monitor", "", 1.5)}<span>Tienda web</span>${P.icono("derecha", "erp-fila__flecha", 1.5)}</span>
          <div class="erp-hijas">
            ${hijas}
            <a class="erp-fila erp-fila--hija" href="#pantalla" aria-current="page">${P.icono("trafico", "", 1.5)}<span>Tráfico</span><span class="erp-nuevo">Nuevo</span></a>
            ${filaLateral("Conf. Tienda", "ajustes", " erp-fila--hija")}
          </div>
          ${filaLateral("Inventario", "cajas")}
          ${filaLateral("Catálogo", "etiqueta")}
          ${filaLateral("Compras", "carrito")}
          ${filaLateral("Finanzas", "billetera")}
          ${filaLateral("Clientes", "gente")}
        </nav>
        <div class="erp-persona"><span class="erp-avatar" aria-hidden="true">FA</span><div><p class="erp-persona__nombre" style="margin:0">Felipe Alvarez</p><p class="erp-persona__rol label-cayla" style="margin:2px 0 0">Líder · CAYLA Global</p></div></div>
      </aside>
      <header class="erp-cabecera" aria-label="Cabecera">
        <span class="erp-icono-btn" aria-hidden="true">${P.icono("plegar", "", 1.5)}</span>
        <span class="erp-buscar" aria-hidden="true">${P.icono("buscar", "", 1.5)}Buscar prendas, ventas, clientes…<kbd>/</kbd></span>
        <div class="erp-cabecera__der">
          <span class="erp-icono-btn" aria-hidden="true">${P.icono("reloj", "", 1.5)}</span>
          <button type="button" class="erp-icono-btn" data-tema-erp aria-label="Cambiar a modo oscuro">${P.icono("luna", "", 1.5)}</button>
          <span class="erp-sede label-cayla">CAYLA Global ${P.icono("abajo", "", 1.5)}</span>
        </div>
      </header>
      <main class="erp-main" id="pantalla" tabindex="-1" aria-label="Tráfico"></main>
      <div class="tr-capa" id="capa"></div>
      <div class="tr-globito" id="globito" role="tooltip"></div>
      <p class="sr-only" id="anuncio" aria-live="polite"></p>`;
  }

  /* =====================================================================
     La cabecera de la pantalla y la fila de controles
     ===================================================================== */
  function cifraHtml(r, dir) {
    const sube = r.cambio > 0;
    const tono = r.cambio == null || r.cambio === 0 ? "neutro" : sube ? "verde" : "ambar";
    const icono = r.cambio == null || r.cambio === 0 ? "igual" : sube ? "sube" : "baja";
    const quien = P.nombreFiltro(r);
    return `
      <div class="tr-cifra" data-pieza="cifra">
        <p class="tr-cifra__titulo"><span class="label-cayla">Entraron a la tienda${quien ? ` ${P.esc(quien)}` : ""}</span><span class="tr-vivo"><span class="tr-punto-vivo" aria-hidden="true"></span>Ahora, ${r.ahora === 1 ? "1 persona mirando" : `${r.ahora} mirando`}</span></p>
        <p class="tr-cifra__valor"><span class="tr-cifra__n" data-cuenta="total">${P.fmt(r.total)}</span><span class="tr-cifra__u">${r.total === 1 ? "persona" : "personas"}</span></p>
        <p class="tr-cifra__pie"><span class="tr-chip tr-chip--${tono}">${P.icono(icono)}${r.cambio == null ? "Sin comparación" : r.cambio === 0 ? "Igual" : `${Math.abs(r.cambio)} % ${sube ? "más" : "menos"}`}</span><span>que ${P.esc(r.periodo.contra)} (${P.fmt(r.anterior)})</span>${dir.extraCifra ? dir.extraCifra(r) : ""}</p>
      </div>`;
  }
  function cabeceraHtml(r, dir) {
    return `
      <header class="tr-cabecera" data-pieza="cabecera">
        <div>
          <p class="tr-cabecera__linea"><span class="tr-hilo-taupe" aria-hidden="true"></span><span>CAYLA Global · ${T.HOY.texto}, ${T.HOY.hora} · Tienda web</span></p>
          <h1>Tráfico</h1>
          <p class="tr-cabecera__frase">${dir.frase}</p>
        </div>
        ${cifraHtml(r, dir)}
      </header>`;
  }
  function controlesHtml(r) {
    const e = P.estado;
    const per = Object.values(T.PERIODOS)
      .map((p) => `<button type="button" class="pildora-cayla" data-periodo="${p.clave}" data-foco="periodo-${p.clave}" aria-pressed="${p.clave === e.periodo}">${p.nombre}</button>`)
      .join("");
    const puestos = [];
    const c = e.filtro.camino && T.CAMINOS.find((x) => x.clave === e.filtro.camino);
    const u = e.filtro.ciudad && T.CIUDADES.find((x) => x.clave === e.filtro.ciudad);
    if (c) puestos.push(`<span class="tr-filtro-puesto">${P.icono("camino")}${P.esc(c.nombre)}<button type="button" class="tr-filtro-puesto__x" data-quitar="camino" data-foco="quitar-camino" aria-label="Quitar el filtro ${P.esc(c.nombre)}">${P.icono("x")}</button></span>`);
    if (u) puestos.push(`<span class="tr-filtro-puesto">${P.icono("ubicacion")}${P.esc(u.nombre)}<button type="button" class="tr-filtro-puesto__x" data-quitar="ciudad" data-foco="quitar-ciudad" aria-label="Quitar el filtro ${P.esc(u.nombre)}">${P.icono("x")}</button></span>`);
    if (c && u) puestos.push(`<button type="button" class="tr-limpiar" data-limpiar data-foco="limpiar">${P.icono("embudoX")}Limpiar filtros</button>`);
    return `
      <div class="tr-controles" data-pieza="controles">
        <div class="tr-grupo" role="group" aria-label="Período">${per}</div>
        <span class="tr-rango" data-globito="Se compara con ${P.esc(r.periodo.rangoAnterior)}">${r.periodo.rangoCorto}</span>
        ${puestos.length ? `<div class="tr-grupo" aria-label="Filtros puestos" role="group">${puestos.join("")}</div>` : `<span class="tr-pista-filtro">Toca un camino o una ciudad para filtrar.</span>`}
        <div class="tr-segmento" role="group" aria-label="Cómo verlo">
          <button type="button" data-vista="grafico" data-foco="vista-grafico" aria-pressed="${e.vista === "grafico"}">${P.icono("grafico")}Gráfico</button>
          <button type="button" data-vista="tabla" data-foco="vista-tabla" aria-pressed="${e.vista === "tabla"}">${P.icono("tabla")}Tabla</button>
        </div>
      </div>`;
  }

  /* =====================================================================
     La vista de tabla gemela: los mismos números, en filas (Tabla + Encabezado)
     ===================================================================== */
  function tablaHtml(r, dir) {
    const fila = (celdas, attrs) => `<tr${attrs || ""}>${celdas.join("")}</tr>`;
    const recorrido = r.pasos
      .map((s) =>
        fila(
          [
            `<td>${s.nombre}${r.atora && r.atora.i === s.i ? ` <span class="tr-atora">· aquí se atora</span>` : ""}</td>`,
            `<td class="der">${P.fmt(s.n)}</td>`,
            `<td class="der">${s.de100}</td>`,
            `<td class="der">${s.i === 0 ? "—" : P.fmt(s.seFueron)}</td>`,
          ],
        ),
      )
      .join("");
    const filaFiltro = (x, tipo) =>
      fila(
        [
          `<td><button type="button" class="tr-tabla-btn btn-enlace" data-filtro-${tipo}="${x.clave}" data-foco="t-${tipo}-${x.clave}" ${x.n ? "" : "disabled"} aria-pressed="${x.elegido}">${P.esc(x.nombre)}</button></td>`,
          tipo === "ciudad" ? `<td>${x.tienda ? "Sí" : "No"}</td>` : "",
          `<td class="der">${P.fmt(x.n)}</td>`,
          `<td class="der">${x.de100}</td>`,
        ],
        x.elegido ? " data-elegida" : "",
      );
    const caminos = r.caminos.map((x) => filaFiltro(x, "camino")).join("");
    const ciudades = r.ciudades.map((x) => filaFiltro(x, "ciudad")).join("");
    const horas = r.tramos
      .map((t) => fila([`<td>${T.tramoTxt(t.desde, t.hasta)}</td>`, `<td class="der">${P.fmt(t.n)}</td>`, `<td class="der">${t.de100}</td>`], t.desde === r.pico.desde ? " data-elegida" : ""))
      .join("");
    const prendas = r.prendas
      .map((p) =>
        fila([
          `<td class="der">${p.puesto}</td>`,
          `<td><button type="button" class="tr-tabla-btn" data-prenda="${p.codigo}" data-foco="t-prenda-${p.codigo}">${P.mosaico(p, 24)}<span class="btn-enlace">${P.esc(p.nombre)}</span></button></td>`,
          `<td>${P.esc(p.categoria)}</td>`,
          ...p.recorrido.map((n) => `<td class="der">${P.fmt(n)}</td>`),
        ]),
      )
      .join("");
    const th = (t, der) => `<th scope="col"${der ? ' class="der"' : ""}>${t}</th>`;
    const caja = (titulo, dato, cabeza, cuerpo, ancha) => `
      <section class="tr-tarjeta tr-tabla-caja${ancha ? " tr-tablas__ancha" : ""}" aria-label="${titulo}">
        <h2 class="tr-titulo">${titulo}<span class="tr-titulo__dato">${dato}</span></h2>
        <table class="tr-tabla"><thead><tr>${cabeza}</tr></thead><tbody>${cuerpo}</tbody></table>
      </section>`;
    const bloques = {
      recorrido: caja("El recorrido", `de ${P.personas(r.total)}`, th("Paso") + th("Personas", 1) + th("De cada 100", 1) + th("Se fueron aquí", 1), recorrido),
      caminos: caja("Por dónde llegan", "toca uno para filtrar", th("Camino") + th("Personas", 1) + th("De cada 100", 1), caminos),
      ciudades: caja("Desde qué ciudad miran", "toca una para filtrar", th("Ciudad") + th("Tienda CAYLA") + th("Personas", 1) + th("De cada 100", 1), ciudades),
      horas: caja("A qué hora entran", `más gente ${T.tramoTxt(r.pico.desde, r.pico.hasta)}`, th("Tramo") + th("Personas", 1) + th("De cada 100", 1), horas),
      prendas: caja(
        "Las prendas más miradas",
        "toca una para ver su detalle",
        th("#", 1) + th("Prenda") + th("Categoría") + th("La miraron", 1) + th("Eligieron talla", 1) + th("A la bolsa", 1) + th("Separaron", 1) + th("Recogieron", 1),
        prendas,
        true,
      ),
    };
    return `<div class="tr-tablas" data-pieza="tabla">${(dir.ordenTabla || ["recorrido", "caminos", "ciudades", "horas", "prendas"]).map((k) => bloques[k]).join("")}</div>`;
  }

  /* =====================================================================
     El cajón de la prenda (Cajon: la banda, el cuerpo y el pie con «3 de 21»)
     ===================================================================== */
  let cajon = null;
  P.abrirPrenda = function (codigo, desde) {
    const r = P.ultimo;
    const lista = r.prendas;
    const i = lista.findIndex((p) => p.codigo === codigo);
    if (i < 0) return;
    const capa = document.getElementById("capa");
    const yaAbierto = !!cajon;
    if (!yaAbierto) cajon = { volverA: desde || document.activeElement };
    cajon.i = i;
    const p = lista[i];
    const sube = p.anterior ? Math.round(((p.miraron - p.anterior) / p.anterior) * 100) : null;
    const tono = sube == null || sube === 0 ? "neutro" : sube > 0 ? "verde" : "ambar";
    const rec = p.recorrido;
    const nombres = ["La miraron", "Eligieron talla", "La pusieron en la bolsa", "Separaron", "Recogieron"];
    let atora = -1;
    let peor = 2;
    for (let k = 1; k < 5; k++) {
      if (rec[k - 1] < 5) continue;
      const pasa = rec[k] / rec[k - 1];
      if (pasa < peor) {
        peor = pasa;
        atora = k;
      }
    }
    const pasos = rec
      .map(
        (n, k) => `
        <li class="tr-paso"${k === atora ? " data-atora" : ""}>
          <span class="tr-paso__nombre">${nombres[k]}</span><span class="num">${P.fmt(n)} <span style="color:color-mix(in srgb,var(--color-tinta) 66%,transparent)">· ${T.de100(n, rec[0])} de cada 100</span></span>
          <span class="tr-paso__barra"><i style="width:${rec[0] ? (n / rec[0]) * 100 : 0}%"></i></span>
        </li>`,
      )
      .join("");
    const totalTallas = p.tallas.reduce((a, t) => a + t.n, 0);
    const masTalla = p.tallas.reduce((m, t) => (t.n > m.n ? t : m), p.tallas[0]);
    const tallas = p.tallas
      .map((t) => `<span class="tr-talla"${t === masTalla && t.n ? " data-mas" : ""}><b>${t.talla}</b>${T.de100(t.n, totalTallas)} de cada 100</span>`)
      .join("");
    const totalColores = p.colores.reduce((a, c) => a + c.n, 0);
    const colores = p.colores
      .map((c) => `<span class="tr-color"><i data-color-dato style="background-color:${c.hex}"></i>${P.esc(c.nombre)} · ${T.de100(c.n, totalColores)} de cada 100</span>`)
      .join("");
    const maxCam = Math.max(1, ...p.caminos.map((c) => c.n));
    const caminos = p.caminos
      .slice(0, 4)
      .map((c) => `<li><span>${P.esc(c.nombre)}</span><span class="tr-mini-lista__pista"><i style="width:${(c.n / maxCam) * 100}%"></i></span><span class="num" style="text-align:right">${P.fmt(c.n)}</span></li>`)
      .join("");
    const html = `
      <div class="tr-velo" data-cerrar></div>
      <section class="tr-cajon" role="dialog" aria-modal="true" aria-labelledby="cajon-titulo" aria-describedby="cajon-frase">
        <div class="tr-cajon__banda">
          ${P.mosaico(p, 40)}
          <div style="min-width:0">
            <p class="tr-cajon__sobre label-cayla">${P.esc(p.categoria)}</p>
            <h2 class="tr-cajon__titulo" id="cajon-titulo">${P.esc(p.nombre)}</h2>
            <p class="tr-cajon__frase" id="cajon-frase">S/ ${p.precio.toFixed(2)} · ${p.codigo} · ${P.esc(r.periodo.nombre.toLowerCase() === "aniversario" ? "Aniversario" : `últimos ${r.periodo.nombre}`)}${P.nombreFiltro(r) ? `, ${P.esc(P.nombreFiltro(r))}` : ""}</p>
            <div class="tr-cajon__chips">
              ${p.puesto === 1 ? `<span class="tr-chip tr-chip--tinta">La más mirada</span>` : `<span class="tr-chip tr-chip--neutro">${p.puesto}.ª más mirada de 21</span>`}
              <span class="tr-chip tr-chip--${tono}">${P.icono(sube > 0 ? "sube" : sube < 0 ? "baja" : "igual")}${sube == null ? "Sin comparación" : sube === 0 ? "Igual que antes" : `${Math.abs(sube)} % ${sube > 0 ? "más" : "menos"} que antes`}</span>
            </div>
          </div>
          <button type="button" class="tr-cerrar" data-cerrar aria-label="Cerrar">${P.icono("x")}</button>
        </div>
        <div class="tr-cajon__cuerpo" data-cascada>
          <div>
            <p class="tr-dato-grande"><b data-cuenta-cajon>${P.fmt(p.miraron)}</b><span>${p.miraron === 1 ? "persona la miró" : "personas la miraron"}</span></p>
            <p class="tr-veredicto">De cada 100 que vieron una prenda, <b>${p.de100Vieron} miraron esta</b>. ${r.periodo.contra.charAt(0).toUpperCase() + r.periodo.contra.slice(1)}: ${P.personas(p.anterior)}.</p>
          </div>
          <div>
            <h3 class="tr-titulo">Su recorrido</h3>
            <ol class="tr-pasos">${pasos}</ol>
          </div>
          <div>
            <h3 class="tr-titulo">Tallas que eligieron</h3>
            ${totalTallas ? `<div class="tr-tallas">${tallas}</div>` : `<p class="tr-veredicto">Nadie eligió talla todavía.</p>`}
          </div>
          <div>
            <h3 class="tr-titulo">Colores que eligieron</h3>
            <div class="tr-colores">${colores}</div>
          </div>
          <div>
            <h3 class="tr-titulo">Por dónde llegaron</h3>
            <ul class="tr-mini-lista">${caminos}</ul>
          </div>
          <p class="tr-nota-ejemplo">${p.miraron < 30 ? "Con tan poca gente, tómalo como una pista, no como una regla. " : ""}Cifras de ejemplo: hoy la tienda no cuenta visitas.</p>
        </div>
        <div class="tr-cajon__pie">
          <button type="button" class="btn-cayla btn-secundario" data-globito="En la maqueta no navega: abriría la prenda en Tienda web ▸ Vitrina.">Ver en la vitrina ${P.icono("flecha", "tr-flecha")}</button>
          <div class="tr-cajon__nav">
            <button type="button" data-nav="-1" aria-label="Prenda anterior" ${i === 0 ? "disabled" : ""}>${P.icono("arriba")}</button>
            <span aria-live="polite">${i + 1} de ${lista.length}</span>
            <button type="button" data-nav="1" aria-label="Prenda siguiente" ${i === lista.length - 1 ? "disabled" : ""}>${P.icono("abajo")}</button>
          </div>
        </div>
      </section>`;
    capa.innerHTML = html;
    capa.setAttribute("data-abierta", "");
    const hoja = capa.querySelector(".tr-cajon");
    if (!yaAbierto) {
      P.anim(capa.querySelector(".tr-velo"), [{ opacity: 0 }, { opacity: 1 }], { duration: 240 });
      P.anim(hoja, [{ opacity: 0, transform: "translateX(28px)" }, { opacity: 1, transform: "none" }], { duration: 380 });
      capa.querySelector(".tr-cerrar").focus({ preventScroll: true });
    } else {
      // De un registro a otro: el contenido se reacomoda sin cerrar el cajón.
      P.anim(hoja.querySelector(".tr-cajon__banda"), [{ opacity: 0.4, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 260 });
      const foco = capa.querySelector(`[data-nav="${cajon.ultimoNav || 1}"]`);
      (foco && !foco.disabled ? foco : capa.querySelector(".tr-cerrar")).focus({ preventScroll: true });
    }
    [...hoja.querySelector("[data-cascada]").children].forEach((el, k) =>
      P.anim(el, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: 80 + k * 55 }),
    );
    hoja.querySelectorAll(".tr-paso__barra i, .tr-mini-lista__pista i").forEach((el, k) => P.anim(el, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 520, delay: 200 + k * 40 }));
    P.contar(hoja.querySelector("[data-cuenta-cajon]"), 0, p.miraron, { ms: 700, retraso: 120 });
  };
  P.cerrarPrenda = function () {
    if (!cajon) return;
    const capa = document.getElementById("capa");
    const volverA = cajon.volverA;
    cajon = null;
    const fin = () => {
      if (cajon) return; // se volvió a abrir mientras salía
      capa.innerHTML = "";
      capa.removeAttribute("data-abierta");
    };
    setTimeout(fin, 320); // por si el navegador frena las animaciones (pestaña de fondo)
    const a = P.anim(capa.querySelector(".tr-cajon"), [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(28px)" }], { duration: 240, easing: P.EASE_SALIDA, fill: "forwards" });
    P.anim(capa.querySelector(".tr-velo"), [{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: P.EASE_SALIDA, fill: "forwards" });
    capa.removeAttribute("data-abierta");
    if (a) a.finished.then(fin, fin);
    else fin();
    // La vuelta: al control que lo abrió, o al mismo control redibujado (por su `data-foco`).
    const clave = volverA && volverA.getAttribute && volverA.getAttribute("data-foco");
    const destino = (volverA && document.contains(volverA) && volverA) || (clave && document.querySelector(`[data-foco="${clave}"]`));
    if (destino) destino.focus({ preventScroll: true });
  };

  /* =====================================================================
     Pintar la pantalla
     ===================================================================== */
  P.ultimo = null;
  P.render = function (modo) {
    const e = P.estado;
    const main = document.getElementById("pantalla");
    const dir = P.direcciones[e.dir];
    const r = T.resumen(e.periodo, e.filtro);
    const prev = modo === "cambio" ? P.ultimo : null;
    const focoClave = document.activeElement && document.activeElement.closest && document.activeElement.closest("[data-foco]");
    const foco = focoClave && main.contains(focoClave) ? focoClave.getAttribute("data-foco") : null;
    const scroll = main.scrollTop;
    const antes = prev && dir.antes && e.vista === "grafico" ? dir.antes(main) : null;
    P.ultimo = r;
    main.innerHTML = `<div class="tr-pantalla ${dir.prefijo}">${cabeceraHtml(r, dir)}${controlesHtml(r)}<div class="tr-cuerpo" data-cuerpo></div></div>`;
    const cuerpo = main.querySelector("[data-cuerpo]");
    if (e.vista === "tabla") {
      cuerpo.innerHTML = tablaHtml(r, dir);
      if (modo !== "quieto") cuerpo.querySelectorAll(".tr-tabla-caja").forEach((el, k) => P.anim(el, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: k * 60 }));
    } else {
      dir.render(cuerpo, r, { modo, prev, antes });
    }
    // La cabecera: en la entrada, el hilo taupe se dibuja, el título sube y la cifra cuenta desde 0; en un cambio, solo cuenta.
    const cifra = main.querySelector('[data-cuenta="total"]');
    if (modo === "entrada") {
      P.anim(main.querySelector(".tr-hilo-taupe"), [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 700 });
      main.querySelectorAll(".tr-cabecera > div > *, .tr-cifra > *").forEach((el, k) => P.anim(el, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 480, delay: 60 + k * 55 }));
      P.anim(main.querySelector(".tr-controles"), [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 260 });
      P.contar(cifra, 0, r.total, { ms: 1100, retraso: 200 });
    } else if (prev) {
      P.contar(cifra, prev.total, r.total, { ms: 600 });
    }
    // Quien usa lector de pantalla oye el resultado de un filtro o un período (la pantalla se redibuja, el anuncio no).
    if (modo === "cambio") {
      const quien = P.nombreFiltro(r);
      document.getElementById("anuncio").textContent = `${r.periodo.nombre}${quien ? `, ${quien}` : ""}: entraron ${P.personas(r.total)}. ${P.titularAtora(r)}.`;
    }
    main.scrollTop = scroll;
    if (foco) {
      const el = main.querySelector(`[data-foco="${foco}"]`);
      if (el) el.focus({ preventScroll: true });
    }
    actualizarBarra();
    guardarUrl();
  };

  /* ---------- Lo que se toca en la pantalla (delegado: cada dirección solo pone los `data-*`) ---------- */
  function cambiar(fn) {
    fn(P.estado);
    P.render("cambio");
  }
  P.alternarFiltro = function (tipo, clave) {
    cambiar((e) => (e.filtro[tipo] = e.filtro[tipo] === clave ? null : clave));
  };
  function alClic(ev) {
    const t = ev.target.closest("button, [data-prenda], [data-filtro-camino], [data-filtro-ciudad]");
    if (!t || t.disabled || t.getAttribute("aria-disabled") === "true") return;
    const d = t.dataset;
    if (d.periodo) return cambiar((e) => (e.periodo = d.periodo));
    if (d.vista) return cambiar((e) => (e.vista = d.vista));
    if (d.quitar) return cambiar((e) => (e.filtro[d.quitar] = null));
    if ("limpiar" in d) return cambiar((e) => (e.filtro = { camino: null, ciudad: null }));
    if (d.filtroCamino) return P.alternarFiltro("camino", d.filtroCamino);
    if (d.filtroCiudad) return P.alternarFiltro("ciudad", d.filtroCiudad);
    if (d.prenda) return P.abrirPrenda(d.prenda, t);
    if ("porque" in d) {
      // «¿Por qué?»: lo difícil, a un toque (ley 6 de Formidable).
      const caja = document.getElementById(t.getAttribute("aria-controls"));
      const abrir = t.getAttribute("aria-expanded") !== "true";
      t.setAttribute("aria-expanded", abrir);
      if (caja) {
        caja.hidden = !abrir;
        if (abrir) P.anim(caja, [{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }], { duration: 260 });
      }
    }
  }
  function alClicCapa(ev) {
    const t = ev.target.closest("[data-cerrar], [data-nav]");
    if (!t) return;
    if ("cerrar" in t.dataset) return P.cerrarPrenda();
    if (t.dataset.nav && cajon) {
      cajon.ultimoNav = t.dataset.nav;
      const lista = P.ultimo.prendas;
      const j = Math.min(lista.length - 1, Math.max(0, cajon.i + +t.dataset.nav));
      P.abrirPrenda(lista[j].codigo);
    }
  }
  function alTeclaCapa(ev) {
    if (!cajon) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      return P.cerrarPrenda();
    }
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      const b = document.querySelector(`#capa [data-nav="${ev.key === "ArrowDown" ? 1 : -1}"]`);
      if (b && !b.disabled) b.click();
      return;
    }
    if (ev.key === "Tab") {
      // El foco no sale del cajón mientras está abierto.
      const f = [...document.querySelectorAll("#capa .tr-cajon button:not([disabled])")];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (ev.shiftKey && (i <= 0)) {
        ev.preventDefault();
        f[f.length - 1].focus();
      } else if (!ev.shiftKey && i === f.length - 1) {
        ev.preventDefault();
        f[0].focus();
      }
    }
  }

  /* ---------- El globito (al pasar el mouse o con el foco) ---------- */
  function globito() {
    const erp = document.querySelector(".erp");
    const g = document.getElementById("globito");
    let actual = null;
    const mostrar = (el) => {
      const texto = el.getAttribute("data-globito");
      if (!texto) return;
      actual = el;
      g.textContent = texto;
      const er = erp.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const s = P.escala || 1;
      const ancho = Math.min(260, g.offsetWidth || 200);
      let x = (r.left + r.width / 2 - er.left) / s - ancho / 2;
      x = Math.max(8, Math.min(x, erp.clientWidth - ancho - 8));
      let y = (r.top - er.top) / s - g.offsetHeight - 8;
      if (y < 64) y = (r.bottom - er.top) / s + 8;
      g.style.left = x + "px";
      g.style.top = y + "px";
      g.setAttribute("data-visible", "");
    };
    const esconder = (el) => {
      if (el && el !== actual) return;
      actual = null;
      g.removeAttribute("data-visible");
    };
    erp.addEventListener("mouseover", (e) => {
      const el = e.target.closest("[data-globito]");
      if (el) mostrar(el);
    });
    erp.addEventListener("mouseout", (e) => {
      const el = e.target.closest("[data-globito]");
      if (el && !el.contains(e.relatedTarget)) esconder(el);
    });
    erp.addEventListener("focusin", (e) => {
      const el = e.target.closest("[data-globito]");
      if (el && el.matches(":focus-visible")) mostrar(el);
      else esconder();
    });
    erp.addEventListener("focusout", () => esconder());
    erp.addEventListener("scroll", () => esconder(), true);
  }

  /* =====================================================================
     La barra de maqueta y el escenario
     ===================================================================== */
  function ajustarEscala() {
    const e = P.estado;
    const marco = document.getElementById("marco");
    const escenario = document.getElementById("escenario");
    escenario.style.top = document.querySelector(".mq-barra").offsetHeight + "px";
    const W = e.ancho;
    const H = ALTO[W];
    const libreW = escenario.clientWidth - 32;
    const libreH = escenario.clientHeight - 32;
    // `?real`: el marco a tamaño real (sin escalar) y el escenario se desplaza; sirve para revisar de cerca.
    const real = q.has("real");
    escenario.style.overflow = real ? "auto" : "hidden";
    const s = real ? 1 : Math.min(1, libreW / W, libreH / H);
    P.escala = s;
    marco.style.width = W + "px";
    marco.style.height = H + "px";
    marco.style.transformOrigin = "top left";
    marco.style.transform = `scale(${s})`;
    marco.style.left = Math.max(16, (escenario.clientWidth - W * s) / 2) + "px";
    marco.style.top = "16px";
    marco.style.position = "absolute";
  }
  function actualizarBarra() {
    const e = P.estado;
    document.querySelectorAll("[data-mq-dir]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mqDir === e.dir));
    document.querySelectorAll("[data-mq-tema]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mqTema === e.tema));
    document.querySelectorAll("[data-mq-ancho]").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.mqAncho === e.ancho));
    const t = document.querySelector("[data-tema-erp]");
    if (t) {
      t.innerHTML = P.icono(e.tema === "oscuro" ? "sol" : "luna", "", 1.5);
      t.setAttribute("aria-label", e.tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
    }
    document.title = `Tráfico · ${P.direcciones[e.dir].nombre} — maqueta`;
  }
  function ponerTema() {
    const erp = document.querySelector(".erp");
    erp.setAttribute("data-tema", P.estado.tema);
  }
  P.arrancar = function () {
    const erp = document.querySelector(".erp");
    erp.innerHTML = marcoHtml();
    if (P.QUIETO) erp.setAttribute("data-quieto", "");
    ponerTema();
    ajustarEscala();
    window.addEventListener("resize", () => {
      ajustarEscala();
    });
    const main = document.getElementById("pantalla");
    main.addEventListener("click", alClic);
    document.getElementById("capa").addEventListener("click", alClicCapa);
    document.addEventListener("keydown", alTeclaCapa);
    globito();
    // Las direcciones que reaccionan al mouse o al foco (resaltar un camino, una persona) lo hacen por su cuenta.
    for (const d of Object.values(P.direcciones)) if (d.montar) d.montar(main);
    document.querySelector(".mq-barra").addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      const e = P.estado;
      if (b.dataset.mqDir) {
        if (cajon) P.cerrarPrenda();
        e.dir = b.dataset.mqDir;
        P.ultimo = null;
        return P.render("entrada");
      }
      if (b.dataset.mqTema) {
        e.tema = b.dataset.mqTema;
        ponerTema();
        return actualizarBarra(), guardarUrl();
      }
      if (b.dataset.mqAncho) {
        e.ancho = +b.dataset.mqAncho;
        ajustarEscala();
        return P.render("quieto");
      }
      if ("mqEntrada" in b.dataset) {
        if (cajon) P.cerrarPrenda();
        document.getAnimations().forEach((a) => {
          try {
            if (isFinite(a.effect.getComputedTiming().endTime)) a.cancel();
          } catch (_) {
            /* nada */
          }
        });
        return P.render("entrada");
      }
    });
    erp.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-tema-erp]")) {
        P.estado.tema = P.estado.tema === "oscuro" ? "claro" : "oscuro";
        ponerTema();
        actualizarBarra();
        guardarUrl();
      }
    });
    P.render("entrada");
  };
})();
