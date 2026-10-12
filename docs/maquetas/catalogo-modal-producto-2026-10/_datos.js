/* ====================================================================
   DATOS Y ANDAMIO COMPARTIDOS de las 3 maquetas de «Vista rápida de producto».
   Todo es INVENTADO (Pantalón Nuki, PAN-0014 es el de la captura de Felipe; las cifras de stock no).
   Nada de aquí es lógica de negocio: son datos de ejemplo + el cascarón (barra de la maqueta, fondo del catálogo,
   abrir/cerrar con el movimiento de ADR-0136) para que cada maqueta solo dibuje lo suyo.
   ==================================================================== */
(function () {
  "use strict";

  /* ---------- íconos (lucide, igual que el ERP) ---------- */
  const ICO = {
    imprimir: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    lapiz: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    caja: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    papelera: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    ok: '<path d="M20 6 9 17l-5-5"/>',
    flecha: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    historial: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    percha: '<path d="M12 7a2 2 0 1 0-2-2"/><path d="M12 7v2l8.2 5.6a1 1 0 0 1-.6 1.8H4.4a1 1 0 0 1-.6-1.8L12 9"/>',
    mas: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    cuadricula: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  };
  // El ícono real de «Pantalones» (lib/icono-categoria-reglas.ts, prefijo PAN).
  const PANTALON = '<path d="M7 3h10l3 18h-6.6L12 9.6 10.6 21H4z"/><path d="M7.2 6.2h9.6"/><path d="M12 6.2v3.4"/>';
  const svg = (n, cls = "", sw = 1.7) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${ICO[n] || n}</svg>`;

  /* ---------- colores (hex = dato de la prenda, no de la interfaz) ---------- */
  const PALETA = {
    Beige: "#d8bd9a", Blanco: "#f4f1ea", Camel: "#b98a58", Chocolate: "#4a3029", Gris: "#8b8d90", Negro: "#27272a",
    Vino: "#6b2a36", Oliva: "#6d6b3b", Azul: "#2f4a6e", Crudo: "#e9dfc9",
  };
  // Fotos de MUESTRA (Unsplash): pantalones cualquiera, solo para ver cómo se comporta cada diseño con foto real.
  // Solo algunos colores tienen foto: el resto cae al mosaico, como pasa en el ERP («Muestra — color»).
  const U = (id) => `https://images.unsplash.com/${id}?w=900&q=70`;
  const FOTO_DE = {
    Beige: U("photo-1473966968600-fa801b869a1a"),
    Camel: U("photo-1473966968600-fa801b869a1a"),
    Negro: U("photo-1624378439575-d8705ad7ae80"),
    Azul: U("photo-1541099649105-f69ad21f3246"),
  };

  /* ---------- datos por escenario ---------- */
  const sinAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const cod = (color, talla) => `PAN-0014-${sinAcento(color).slice(0, 3).toUpperCase()}-${talla}`;

  function armar(colores, tallas, stockDe, { precioDe = () => 79.9, inactivas = [] } = {}) {
    const variantes = [];
    colores.forEach((c, i) =>
      tallas.forEach((t, j) => {
        const activo = !inactivas.includes(`${c}|${t}`);
        variantes.push({ id: `v-${i}-${j}`, color: c, talla: t, precio: precioDe(c, t), stock: activo ? stockDe(c, t, i, j) : 0, activo, codigo: cod(c, t) });
      })
    );
    return variantes;
  }
  // PRNG con semilla: «Muchas variantes» es siempre el mismo.
  // mulberry32: con semillas pequeñas y seguidas un LCG simple da casi el mismo número; este las reparte bien.
  const prng = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const ESCENARIOS = {
    captura: {
      rotulo: "Como tu captura",
      nota: "6 colores × 3 tallas = 18 variantes, 0 unidades en AQP.",
      colores: ["Beige", "Blanco", "Camel", "Chocolate", "Gris", "Negro"], tallas: ["S", "M", "L"],
      stock: () => 0, otras: [{ sede: "LIM", n: 24 }, { sede: "TRU", n: 11 }],
    },
    stock: {
      rotulo: "Con stock variado",
      nota: "Mismas 18 variantes, con ceros, pocas unidades y una talla retirada.",
      colores: ["Beige", "Blanco", "Camel", "Chocolate", "Gris", "Negro"], tallas: ["S", "M", "L"],
      stock: (c, t) => ({ Beige: { S: 3, M: 5, L: 2 }, Blanco: { S: 0, M: 1, L: 4 }, Camel: { S: 6, M: 8, L: 3 }, Chocolate: { S: 2, M: 0, L: 0 }, Gris: { S: 1, M: 2, L: 1 }, Negro: { S: 9, M: 12, L: 7 } }[c][t]),
      inactivas: ["Camel|L"], otras: [{ sede: "LIM", n: 24 }, { sede: "TRU", n: 11 }],
    },
    pocas: {
      rotulo: "Pocas variantes",
      nota: "2 colores × 2 tallas, y un precio distinto (Negro S/84.90).",
      colores: ["Beige", "Negro"], tallas: ["M", "L"],
      stock: (c, t) => ({ Beige: { M: 4, L: 0 }, Negro: { M: 2, L: 6 } }[c][t]),
      precioDe: (c) => (c === "Negro" ? 84.9 : 79.9), otras: [{ sede: "LIM", n: 5 }],
    },
    muchas: {
      rotulo: "Muchas variantes",
      nota: "9 colores × 5 tallas = 45 variantes: el peor caso.",
      colores: ["Beige", "Blanco", "Camel", "Chocolate", "Gris", "Negro", "Vino", "Oliva", "Azul"], tallas: ["XS", "S", "M", "L", "XL"],
      stock: (c, t, i, j) => { const r = prng(i * 17 + j * 5 + 3)(); return r < 0.28 ? 0 : Math.round(r * 14); },
      inactivas: ["Vino|XS", "Oliva|XL"], otras: [{ sede: "LIM", n: 58 }, { sede: "TRU", n: 31 }, { sede: "Taller", n: 40 }],
    },
  };

  function producto(clave) {
    const e = ESCENARIOS[clave] || ESCENARIOS.captura;
    const variantes = armar(e.colores, e.tallas, e.stock, { precioDe: e.precioDe, inactivas: e.inactivas });
    const colores = e.colores.map((nombre) => {
      const vs = variantes.filter((v) => v.color === nombre);
      return { nombre, hex: PALETA[nombre], variantes: vs, total: vs.reduce((t, v) => t + v.stock, 0), tallasConStock: vs.filter((v) => v.stock > 0).length };
    });
    const tallas = e.tallas.map((nombre) => {
      const vs = variantes.filter((v) => v.talla === nombre);
      return { nombre, variantes: vs, total: vs.reduce((t, v) => t + v.stock, 0) };
    });
    const precios = variantes.filter((v) => v.activo).map((v) => v.precio);
    const total = variantes.reduce((t, v) => t + v.stock, 0);
    const maximo = Math.max(1, ...variantes.map((v) => v.stock));
    return {
      clave, nombre: "Pantalón Nuki", codigo: "PAN-0014", categoria: "Pantalones", estado: "activo", marca: "CAYLA",
      sede: "Tienda AQP", sedeCorta: "AQP", variantes, colores, tallas, total, maximo, otras: e.otras,
      otrasTotal: e.otras.reduce((t, o) => t + o.n, 0),
      precioMin: Math.min(...precios), precioMax: Math.max(...precios), precioUnico: Math.min(...precios) === Math.max(...precios),
      celda: (c, t) => variantes.find((v) => v.color === c && v.talla === t) || null,
      puedeEliminar: true, veExistencias: true, puedeEditar: true,
    };
  }

  /* ---------- helpers de texto y color ---------- */
  const sol = (n) => `S/${n.toFixed(2)}`;
  const unidades = (n) => (n === 1 ? "1 unidad" : `${n} unidades`);
  function luminancia(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  }
  // Mismo criterio que lib/color-prenda-reglas.ts: trazo tinta o crema según el fondo; filo si el color es claro.
  const trazo = (hex) => (luminancia(hex) > 0.32 ? "var(--tinta)" : "var(--crema)");
  const claro = (hex) => luminancia(hex) > 0.4;

  /* ---------- estado de la maqueta (vive en el hash para viajar entre A / B / C) ---------- */
  const est = { e: "captura", a: "escritorio", f: "0", m: "max" };
  function leerHash() {
    new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (k in est) est[k] = v; });
    if (!ESCENARIOS[est.e]) est.e = "captura";
  }
  function escribirHash() {
    try { history.replaceState(null, "", "#" + new URLSearchParams(est).toString()); } catch (_) { /* file:// restringido: no pasa nada */ }
  }

  /* ---------- lo visual de una prenda: foto o mosaico ---------- */
  function fotoDe(color) { return est.f === "1" ? FOTO_DE[color] || null : null; }
  // `relleno`: llena la caja de quien lo pone. Con foto, <img>; sin foto, el mosaico (ícono de la categoría sobre el color).
  function mosaico(color, { rotulo = true, muestra = true, cls = "" } = {}) {
    const hex = PALETA[color] || "#e8e0d0";
    return `<div class="mosaico vis ${cls} ${claro(hex) ? "filo" : ""}" style="background:${hex};color:${trazo(hex)};width:100%;height:100%">${svg(PANTALON, "", 1.5)}${rotulo ? '<span class="rot">Pantalones</span>' : ""}${muestra ? `<span class="muestra">Muestra — ${color}</span>` : ""}</div>`;
  }
  function visual(color, opts = {}) {
    const { fit = "cover", pos = "center", cls = "" } = opts;
    const url = fotoDe(color);
    if (!url) return mosaico(color, opts);
    // Si la foto no carga (sin red), cae al mosaico: igual que el ERP cuando un color no tiene foto.
    return `<img class="vis ${cls}" src="${url}" alt="Pantalón Nuki — ${color}" style="width:100%;height:100%;object-fit:${fit};object-position:${pos};display:block" referrerpolicy="no-referrer" onerror="CAYLA.caeAMosaico(this,'${color}')">`;
  }
  function caeAMosaico(img, color) { const t = document.createElement("div"); t.innerHTML = mosaico(color); img.replaceWith(t.firstElementChild); }

  /* ---------- barra de la maqueta ---------- */
  const PAGINAS = [["a-matriz.html", "A · Matriz"], ["b-color-primero.html", "B · Color primero"], ["c-cristal.html", "C · Cristal"]];
  function barra({ pagina, movimiento = false }) {
    const el = document.getElementById("spike");
    const embebida = window.self !== window.top; // dentro de index.html las pestañas de arriba ya navegan
    const h = "#" + new URLSearchParams(est).toString();
    const op = (g, v, t) => `<button type="button" class="op" data-g="${g}" data-v="${v}" aria-pressed="${est[g] === v}">${t}</button>`;
    el.innerHTML = `
      <span class="tit">Vista rápida · Catálogo ▸ Productos</span>
      ${embebida ? "" : `<span class="grupo">${PAGINAS.map(([f, t]) => `<a class="nav" href="${f}${h}" ${f === pagina ? 'aria-current="page"' : ""}>${t}</a>`).join("")}<a class="nav" href="index.html${h}">Las 3 juntas</a></span><span class="sep"></span>`}
      <span class="grupo"><span>Datos</span>${Object.entries(ESCENARIOS).map(([k, e]) => op("e", k, e.rotulo)).join("")}</span>
      <span class="grupo"><span>Foto</span>${op("f", "0", "Sin foto")}${op("f", "1", "Con foto de muestra")}</span>
      <span class="grupo"><span>Ancho</span>${op("a", "escritorio", "Escritorio")}${op("a", "celular", "Celular 390")}</span>
      ${movimiento ? `<span class="grupo"><span>Movimiento</span>${op("m", "max", "Completo")}${op("m", "sobrio", "Sobrio (ADR-0136)")}</span>` : ""}
      <span class="sep"></span>
      <button type="button" class="op rojo" id="reabrir">↻ Reabrir</button>
      <span id="notaEsc" style="flex-basis:100%;font-size:11.5px;color:var(--t55)"></span>`;
    el.querySelectorAll("button.op[data-g]").forEach((b) => b.addEventListener("click", () => cambiar(b.dataset.g, b.dataset.v)));
    document.getElementById("reabrir").addEventListener("click", () => abrir(true));
    document.getElementById("notaEsc").textContent = ESCENARIOS[est.e].nota;
    const ro = () => document.documentElement.style.setProperty("--alto-spike", el.offsetHeight + "px");
    ro(); new ResizeObserver(ro).observe(el);
  }

  /* ---------- fondo: el catálogo de atrás, solo de contexto ---------- */
  function fondo() {
    const tarjetas = [["Falda Jean", "FAL-0021", "#8da0b8"], ["Blusa Camisera Crop", "BLU-0009", "#e6d9c4"], ["Pantalón Jean Palazzo", "JEA-0006", "#46556b"], ["Jean Mom", "JEA-0011", "#2d3a52"],
      ["Casaca Aurora", "CAS-0004", "#b5503c"], ["Blusa Alba", "BLU-0013", "#efe7d6"], ["Vestido Lino", "VES-0002", "#9aa37e"], ["Short Denim", "SHO-0007", "#5d6f8a"], ["Top Satinado", "TOP-0018", "#c7a79a"], ["Chaleco Nube", "CHA-0003", "#d6cbb6"]];
    document.getElementById("fondo").innerHTML = `<div class="fcab"><h2>Productos</h2><span>Catálogo · Grilla · 128 prendas</span></div>
      <div class="fgrid">${tarjetas.map(([n, c, h]) => `<div class="fcard"><div class="fm" style="background:${h};color:${trazo(h)}">${svg("percha", "", 1.4).replace("<svg", '<svg width="44" height="44"')}</div><div class="ft"><b>${n}</b><i>${c}</i></div></div>`).join("")}</div>`;
  }

  /* ---------- ciclo: abrir / cerrar / re-dibujar ---------- */
  let cfg = null;
  function dibujar() {
    const hoja = document.getElementById("hoja");
    const p = producto(est.e);
    document.body.dataset.movimiento = est.m;
    hoja.innerHTML = cfg.render(p, est);
    cfg.listo && cfg.listo(hoja, p, est);
  }
  function abrir(reiniciar) {
    const esc = document.getElementById("escena");
    esc.classList.remove("abierta", "cerrando");
    document.getElementById("reabrir-flotante").hidden = true;
    dibujar();
    void esc.offsetWidth;
    esc.classList.add("abierta");
    const hoja = document.getElementById("hoja");
    hoja.focus({ preventScroll: true });
  }
  function cerrar() {
    const esc = document.getElementById("escena");
    if (!esc.classList.contains("abierta")) return;
    esc.classList.add("cerrando");
    const ms = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220;
    setTimeout(() => { esc.classList.remove("abierta", "cerrando"); document.getElementById("reabrir-flotante").hidden = false; }, ms);
  }
  function cambiar(g, v) {
    est[g] = v; escribirHash();
    if (g === "a") document.body.classList.toggle("celular", v === "celular");
    document.querySelectorAll(`button.op[data-g="${g}"]`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
    document.querySelectorAll("a.nav").forEach((a) => { const [f] = a.getAttribute("href").split("#"); a.setAttribute("href", f + "#" + new URLSearchParams(est).toString()); });
    document.getElementById("notaEsc").textContent = ESCENARIOS[est.e].nota;
    if (document.getElementById("escena").classList.contains("abierta")) dibujar();
  }
  // Una cifra que cuenta hasta su valor: respuesta a una acción (ADR-0136), no adorno. Sin movimiento, el valor de una.
  function contar(el, hasta, ms = 450, desde = 0) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = hasta; return; }
    const t0 = performance.now();
    const paso = (t) => { const k = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(desde + (hasta - desde) * e); if (k < 1) requestAnimationFrame(paso); };
    requestAnimationFrame(paso);
  }

  function arrancar(c) {
    cfg = c; leerHash();
    document.body.classList.toggle("celular", est.a === "celular");
    barra({ pagina: c.pagina, movimiento: !!c.movimiento });
    fondo();
    const esc = document.getElementById("escena");
    esc.insertAdjacentHTML("beforeend", `<button type="button" id="reabrir-flotante" hidden class="btn pri" style="position:absolute;left:50%;top:40%;transform:translateX(-50%);z-index:5">Abrir la vista rápida</button>`);
    document.getElementById("reabrir-flotante").addEventListener("click", () => abrir(true));
    document.getElementById("velo").addEventListener("click", cerrar);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") cerrar();
      // dentro de index.html el foco vive en este marco: 1 · 2 · 3 le piden al índice que cambie de maqueta
      if (window.self !== window.top && "123".includes(e.key) && !e.target.closest("input,textarea")) window.parent.postMessage({ maqueta: +e.key - 1 }, "*");
    });
    document.getElementById("hoja").addEventListener("click", (e) => { if (e.target.closest("[data-cerrar]")) cerrar(); });
    abrir();
  }

  window.CAYLA = { svg, ICO, PANTALON, PALETA, ESCENARIOS, producto, est, sol, unidades, trazo, claro, luminancia, visual, mosaico, caeAMosaico, fotoDe, arrancar, cerrar, abrir, dibujar, contar };
})();
