/* ====================================================================
   app.js · Existencias en tarjetas (maqueta, 2026-09-29)

   Todo vive en memoria: recargar la página restablece los datos de ejemplo. Nada llama a la base.
   Piezas: columna de módulos · barra superior · cabecera · cifras · filtros · tarjetas / tabla («Ver detalle») ·
   cajón de la prenda · ventanas «Reponer piso» y «Ajustar inventario» · espera global y avisos (ADR-0149) ·
   Escape cierra siempre lo de más arriba (ADR-0136).
   ==================================================================== */
(function () {
  "use strict";
  const D = window.DATOS;
  const T0 = Date.now();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  /* ── íconos (los mismos trazos del lateral del ERP: AppShell `IC`) ── */
  const P = (d) => `<path d="${d}"/>`;
  const ICONOS = {
    inicio: P("M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5"),
    vender: P("M6 6h15l-1.5 9h-12L6 6zm0 0L5 3H2m7 18a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z"),
    apartados: P("M6 3h12v18l-6-4-6 4V3zm3.5 6.5L11 11l3.5-3.5"),
    caja: P("M12 3v18m4-15H10a2.5 2.5 0 000 5h4a2.5 2.5 0 010 5H8"),
    historial: P("M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2"),
    productos: P("M20.38 3.46 16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 00.99.84H6v10a2 2 0 002 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.47a2 2 0 00-1.34-2.23z"),
    inventario: P("M4 7l8-4 8 4v10l-8 4-8-4V7zm8 4L4 7m8 4l8-4m-8 4v10"),
    existencias: P("M11.3 3a1.3 1.3 0 102 1c0 .5-.3.9-.7 1.1v1.3L4 13.5a1.5 1.5 0 00-.7 1.3V16h17.4v-1.2a1.5 1.5 0 00-.7-1.3l-7.7-6.1V5.4"),
    movimientos: P("M3 7h13m0 0l-4-4m4 4l-4 4M21 17H8m0 0l4 4m-4-4l4-4"),
    traslados: P("M4 12h13M13 5l7 7-7 7"),
    conteo: P("M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"),
    resumen: P("M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"),
    compras: P("M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 016 0v2M12 12v4m-2-2h4"),
    cambios: P("M7 3v14m0 0l-4-4m4 4l4-4M17 21V7m0 0l4 4m-4-4l-4 4"),
    devoluciones: P("M9 14l-4-4 4-4M5 10h11a4 4 0 010 8h-4"),
    venta: P("M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 016 0v2"),
    catalogo: P("M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"),
    categorias: P("M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3zM6 6h.008v.008H6V6z"),
    marcas: P("M3 7h18v10H3z M6 10v4 M18 10v4 M9.5 12h5"),
    atributos: P("M4 4h6v6H4zM14 4h6v6h-6zM9 14h6v6H9z"),
    proveedores: P("M1 3h15v13H1zM16 8h4l3 3v5h-7V8z M5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"),
    facturas: P("M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8"),
    recibir: P("M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"),
    porPagar: P("M12 22a10 10 0 100-20 10 10 0 000 20z M12 6v6l4 2"),
    gastos: P("M3 7a2 2 0 012-2h13a1 1 0 011 1v2 M3 7v11a2 2 0 002 2h14a1 1 0 001-1v-3 M3 7h16a1 1 0 011 1v3 M20 11h-4a2 2 0 000 4h4v-4z"),
    finanzas: P("M4 4h9v7H4zM15 4h5v4h-5zM15 10h5v10h-5zM4 13h9v7H4z"),
    dinero: P("M3 6h18v12H3z M7 12h.01 M17 12h.01 M12 9.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z"),
    reportes: P("M4 20V10 M10 20V4 M16 20v-7 M3 20h18"),
    impuestos: P("M7 3h7l5 5v13H7z M14 3v5h5 M10 17l5-6 M10.5 11.5h.01 M14.5 16.5h.01"),
    cierre: P("M6 11h12v10H6z M9 11V7a3 3 0 016 0v4"),
    analisis: P("M3 17l6-6 4 4 8-8M15 6h6v6"),
    frescura: P("M12 20v-8M12 12c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5zM12 14c0-3-2.3-5-5.5-5 0 3 2.3 5 5.5 5z"),
    clientes: P("M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0016.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 002 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"),
    rendimiento: P("M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z"),
    chev: P("M9 6l6 6-6 6"),
    chevd: P("M6 9l6 6 6-6"),
    x: P("M18 6L6 18M6 6l12 12"),
    check: P("M20 6L9 17l-5-5"),
    mas: P("M12 5v14M5 12h14"),
    menos: P("M5 12h14"),
    buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    alerta: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    editar: P("M12 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.4 2.6a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.4-9.4z"),
    tabla: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M10 4v16"/>',
    bajada: P("M12 3v14m0 0l-5-5m5 5l5-5M5 21h14"),
    descarga: P("M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"),
    etiqueta: P("M4 4h6v6H4z M14 4h2M14 8h4M4 14h16M4 18h10"),
    papelera: P("M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"),
    red: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  };
  ICONOS.camion = ICONOS.proveedores;
  const ic = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONOS[n] || ""}</svg>`;
  const SIN_FOTO = `<img class="sin" src="cayla-isotipo.png" alt="">`;

  /* ── estado de la pantalla ── */
  const RESPONSABLES = ["Felipe Alvarez", "Lucía Paredes", "Marco Ríos", "Andrea Salas"];
  const PAGINA_TABLA = 15, PAGINA_TARJETAS = 12;
  const E = {
    sede: "TRU", vista: "tarjetas", q: "", marca: "", categoria: "", talla: "", color: "", estado: "", quick: null, orden: "relevantes",
    mostrar: PAGINA_TARJETAS, pagina: 1, sel: new Set(), abierto: null, tallaSel: null,
    abiertos: { inventario: true },
    act: [
      { t: "Bajada al piso · Top Luna M", d: "3 uds · Lucía Paredes", cuando: "hace 25 min" },
      { t: "Ingreso por traslado · Chompa Raya", d: "8 uds desde Tienda LIM · Marco Ríos", cuando: "hace 1 h" },
      { t: "Ajuste (merma) · Culotte Petit Yani S", d: "−1 ud · Andrea Salas", cuando: "hace 2 h" },
      { t: "Bajada al piso · Adelle Wide Leg S", d: "2 uds · Lucía Paredes", cuando: "hace 3 h" },
      { t: "Conteo cerrado · Almacén", d: "Sin diferencias · Felipe Alvarez", cuando: "ayer" },
    ],
  };
  const SEDES = Object.fromEntries(D.SEDES.map((s) => [s.id, D.crearSede(s)]));
  const datosSede = (id = E.sede) => SEDES[id];
  const cards = () => datosSede().cards;
  const porId = (id, sede = E.sede) => SEDES[sede].cards.find((c) => c.id === id);
  const nombreSede = () => D.SEDES.find((s) => s.id === E.sede).nombre;

  const horaTxt = () => {
    const m = 15 * 60 + 4 + Math.floor((Date.now() - T0) / 60000);
    return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };

  /* ── capas: Escape cierra SIEMPRE lo de más arriba, una a la vez ── */
  const capas = [];
  const meter = (c) => { capas.push(c); return c; };
  const sacar = (c) => { const i = capas.indexOf(c); if (i >= 0) capas.splice(i, 1); };
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !capas.length) return;
    const top = capas[capas.length - 1];
    if (top.bloqueado && top.bloqueado()) return;
    e.preventDefault(); e.stopPropagation();
    top.cerrar();
  }, true);

  /* ── espera global y avisos (ADR-0149): el aviso de éxito sale DESPUÉS del loader ── */
  let esperas = 0; const cola = [];
  function esperar(msg) {
    esperas++;
    $("#espera-t").textContent = msg || "Cargando";
    $("#espera").hidden = false;
    return () => { esperas = Math.max(0, esperas - 1); if (!esperas) { $("#espera").hidden = true; cola.splice(0).forEach((a) => pintarAviso(a)); } };
  }
  function guardar(msg, trabajo, ms = 650) {
    const fin = esperar(msg);
    return new Promise((res) => setTimeout(() => { try { trabajo(); } finally { fin(); res(); } }, ms));
  }
  function avisar(tipo, titulo, detalle) { const a = { tipo, titulo, detalle }; esperas ? cola.push(a) : pintarAviso(a); }
  function pintarAviso(a) {
    const el = document.createElement("div");
    el.className = `aviso ${a.tipo}`; el.setAttribute("role", "status");
    el.innerHTML = `<span class="ic-a">${ic(a.tipo === "exito" ? "check" : "info")}</span><div><b>${esc(a.titulo)}</b>${a.detalle ? `<span class="d">${esc(a.detalle)}</span>` : ""}</div><button class="x" type="button" aria-label="Cerrar aviso">${ic("x")}</button>`;
    const quitar = () => { el.classList.add("sale"); setTimeout(() => el.remove(), 210); };
    $(".x", el).addEventListener("click", quitar);
    $("#avisos").appendChild(el);
    setTimeout(quitar, a.tipo === "info" ? 4600 : 5200);
  }
  const irA = (nombre, ruta) => (nombre === "Salir"
    ? avisar("info", "Aquí se cerraría la sesión", "La maqueta no tiene sesión: todo lo que ves son datos inventados.")
    : avisar("info", `Aquí abre «${nombre}»`, `${ruta ? ruta + " · " : ""}La maqueta solo dibuja Existencias: esa pantalla no está.`));

  /* ── menú flotante (un combo, sin <select> del navegador) ── */
  let menuAbierto = null;
  function cerrarMenu() { if (menuAbierto) menuAbierto.cerrar(); }
  function abrirMenu(ancla, { opciones, valor, onElegir, buscar, alinear = "izq", minAncho, titulo }) {
    cerrarMenu();
    const usaBusqueda = buscar ?? opciones.length > 8;
    const m = document.createElement("div");
    m.className = "menu"; m.setAttribute("role", "listbox");
    let foco = -1, visibles = opciones;
    const pintar = (q = "") => {
      const nq = D.norm(q);
      visibles = opciones.filter((o) => o.grupo || !nq || D.norm(o.t).includes(nq));
      $(".lista", m).innerHTML = visibles.length
        ? visibles.map((o, i) => o.grupo
            ? `<div class="grp">${esc(o.grupo)}</div>`
            : `<button class="it" type="button" role="option" data-i="${i}" aria-selected="${o.v === valor}">${o.punto ? `<span class="pt" style="background:${o.punto}"></span>` : ""}<span>${esc(o.t)}</span>${o.v === valor ? ic("check") : ""}</button>`).join("")
        : `<div class="nada">Nada coincide con «${esc(q)}».</div>`;
      foco = -1;
    };
    m.innerHTML = `${usaBusqueda ? `<label class="bus">${ic("buscar")}<input type="text" placeholder="Buscar…" aria-label="Buscar en la lista" autocomplete="off"></label>` : ""}<div class="lista"></div>`;
    pintar();
    $("#flot").appendChild(m);
    const r = ancla.getBoundingClientRect();
    m.style.minWidth = Math.max(minAncho || 0, r.width, 170) + "px";
    const alto = m.offsetHeight, ancho = m.offsetWidth;
    let left = alinear === "der" ? r.right - ancho : r.left;
    left = Math.max(10, Math.min(left, innerWidth - ancho - 10));
    let top = r.bottom + 6;
    if (top + alto > innerHeight - 10 && r.top - alto - 6 > 10) { top = r.top - alto - 6; m.style.transformOrigin = "bottom left"; }
    m.style.left = left + "px"; m.style.top = top + "px";
    ancla.setAttribute("aria-expanded", "true");
    const mover = (d) => {
      const its = $$(".it", m); if (!its.length) return;
      foco = (foco + d + its.length) % its.length;
      its.forEach((el, i) => el.classList.toggle("foco", i === foco));
      its[foco].scrollIntoView({ block: "nearest" });
    };
    const elegir = (i) => { const o = visibles[i]; if (!o || o.grupo) return; cerrar(); onElegir(o.v); };
    m.addEventListener("click", (e) => { const b = e.target.closest(".it"); if (b) elegir(+b.dataset.i); });
    m.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); mover(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); mover(-1); }
      else if (e.key === "Enter") { e.preventDefault(); if (foco >= 0) { const b = $$(".it", m)[foco]; if (b) elegir(+b.dataset.i); } else if (visibles.filter((o) => !o.grupo).length === 1) elegir(visibles.findIndex((o) => !o.grupo)); }
    });
    const inp = $("input", m);
    if (inp) inp.addEventListener("input", () => pintar(inp.value));
    const fuera = (e) => { if (!m.contains(e.target) && !ancla.contains(e.target)) cerrar(); };
    setTimeout(() => document.addEventListener("pointerdown", fuera, true), 0);
    const capa = meter({ cerrar });
    function cerrar() {
      document.removeEventListener("pointerdown", fuera, true);
      sacar(capa); m.remove(); ancla.setAttribute("aria-expanded", "false");
      if (menuAbierto && menuAbierto.m === m) menuAbierto = null;
      if (document.contains(ancla)) ancla.focus({ preventScroll: true });
    }
    menuAbierto = { m, cerrar };
    (inp || m).focus?.({ preventScroll: true });
    if (!inp) { m.tabIndex = -1; m.focus({ preventScroll: true }); }
  }

  /* ── modal: la hoja de ADR-0136 ── */
  function modal({ titulo, sub, html, ancho, foco }) {
    const capaEl = document.createElement("div");
    capaEl.className = "capa-m";
    capaEl.innerHTML = `<div class="velo"></div><div class="hoja${ancho ? " ancha" : ""}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <button class="cerrar" type="button" aria-label="Cerrar">${ic("x")}</button>
      <h2 class="casc" style="--i:0">${esc(titulo)}</h2>${sub ? `<p class="baj casc" style="--i:1">${esc(sub)}</p>` : ""}
      <div class="cuerpo-m">${html}</div></div>`;
    $$(".cuerpo-m > *", capaEl).forEach((el, i) => { el.classList.add("casc"); el.style.setProperty("--i", i + 2); });
    const previo = document.activeElement;
    $("#capas").appendChild(capaEl);
    let bloq = false, cerrado = false;
    const capa = meter({ cerrar, bloqueado: () => bloq });
    function cerrar() {
      if (cerrado) return; cerrado = true; sacar(capa);
      capaEl.classList.add("sale");
      setTimeout(() => { capaEl.remove(); if (previo && document.contains(previo)) previo.focus({ preventScroll: true }); }, 170);
    }
    $(".velo", capaEl).addEventListener("click", () => { if (!bloq) cerrar(); });
    $(".cerrar", capaEl).addEventListener("click", () => { if (!bloq) cerrar(); });
    capaEl.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const f = $$("button:not(:disabled),input:not(:disabled),textarea", $(".hoja", capaEl)).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });
    setTimeout(() => ($(foco || "[data-foco]", capaEl) || $(".cerrar", capaEl)).focus({ preventScroll: true }), 60);
    return { el: capaEl, hoja: $(".hoja", capaEl), cerrar, bloquear: (b) => { bloq = b; } };
  }

  /* ── datos derivados ── */
  const tallasConStock = (c) => D.TALLAS.filter((t) => c.stock[t][0] + c.stock[t][1] > 0).length;
  const miniFoto = (c) => (c.foto ? `<img src="${c.foto}" alt="">` : SIN_FOTO);
  function kpis() {
    let piso = 0, alm = 0, cp = 0, ca = 0, al = 0;
    cards().forEach((c) => {
      const t = D.totalesDe(c); piso += t.piso; alm += t.alm;
      if (t.piso > 0) cp++; if (t.alm > 0) ca++;
      if (D.ESTADOS[D.estadoDe(c)].alerta) al++;
    });
    return { piso, alm, cp, ca, al };
  }
  function pasa(c) {
    if (E.q) { const hay = D.norm([c.nombre, c.marca, c.categoria, c.color, c.codigo].join(" ")); if (!D.norm(E.q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false; }
    if (E.marca && c.marca !== E.marca) return false;
    if (E.categoria && c.categoria !== E.categoria) return false;
    if (E.color && c.color !== E.color) return false;
    if (E.talla) { const [p, a] = c.stock[E.talla]; if (p + a === 0) return false; }
    const est = D.estadoDe(c);
    if (E.estado === "alerta" ? !D.ESTADOS[est].alerta : E.estado && est !== E.estado) return false;
    const t = D.totalesDe(c);
    if (E.quick === "piso" && t.piso === 0) return false;
    if (E.quick === "almacen" && t.alm === 0) return false;
    return true;
  }
  const ORDENES = [
    { v: "relevantes", t: "Más relevantes" }, { v: "nombre", t: "Nombre (A–Z)" }, { v: "alertas", t: "Alertas primero" },
    { v: "mas-piso", t: "Más en el piso" }, { v: "menos-piso", t: "Menos en el piso" }, { v: "mas-alm", t: "Más en el almacén" },
  ];
  function ordenar(lista) {
    const base = cards();
    const idx = new Map(base.map((c, i) => [c.id, i]));
    const cmp = {
      relevantes: (a, b) => idx.get(a.id) - idx.get(b.id),
      nombre: (a, b) => a.nombre.localeCompare(b.nombre, "es") || a.color.localeCompare(b.color, "es"),
      alertas: (a, b) => (D.ESTADOS[D.estadoDe(b)].alerta - D.ESTADOS[D.estadoDe(a)].alerta) || (idx.get(a.id) - idx.get(b.id)),
      "mas-piso": (a, b) => D.totalesDe(b).piso - D.totalesDe(a).piso,
      "menos-piso": (a, b) => D.totalesDe(a).piso - D.totalesDe(b).piso,
      "mas-alm": (a, b) => D.totalesDe(b).alm - D.totalesDe(a).alm,
    }[E.orden];
    return lista.slice().sort(cmp);
  }
  const visibles = () => ordenar(cards().filter(pasa));

  /* ── columna de módulos ── */
  const MENU = [
    { t: "Inicio", ic: "inicio" },
    { id: "ventas", t: "Ventas", ic: "venta", hijos: [["Punto de Venta", "vender", "/vender"], ["Apartados", "apartados", "/vender/apartados"], ["Caja", "caja", "/caja"], ["Historial", "historial", "/vender/historial"], ["Cambios", "cambios", "/cambios"], ["Devoluciones", "devoluciones", "/devoluciones"]] },
    { id: "inventario", t: "Inventario", ic: "inventario", hijos: [["Existencias", "existencias", "/inventario", true], ["Movimientos", "movimientos", "/inventario/movimientos"], ["Traslados", "traslados", "/inventario/traslados"], ["Conteo", "conteo", "/inventario/conteo"], ["Análisis", "analisis", "/inventario/resumen"], ["Frescura del piso", "frescura", "/inventario/frescura"]] },
    { id: "catalogo", t: "Catálogo", ic: "catalogo", hijos: [["Productos", "productos", "/productos"], ["Categorías", "categorias", "/productos/categorias"], ["Marcas", "marcas", "/productos/marcas"], ["Atributos", "atributos", "/productos/atributos"]] },
    { id: "compras", t: "Compras", ic: "compras", hijos: [["Proveedores", "proveedores", "/compras/proveedores"], ["Facturas de proveedor", "facturas", "/compras"], ["Recibir mercadería", "recibir", "/recibir"], ["Por pagar", "porPagar", "/compras/por-pagar"]] },
    { id: "finanzas", t: "Finanzas", ic: "finanzas", hijos: [["Resumen", "resumen", "/finanzas"], ["Gastos", "gastos", "/finanzas/gastos"], ["Cuentas y dinero", "dinero", "/finanzas/cuentas"], ["Reportes", "reportes", "/finanzas/reportes"], ["Impuestos", "impuestos", "/finanzas/impuestos"], ["Cierre", "cierre", "/finanzas/cierre"]] },
    { t: "Clientes", ic: "clientes" },
    { t: "Rendimiento", ic: "rendimiento" },
  ];
  function pintarNav() {
    $("#nav").innerHTML = MENU.map((m) => {
      if (!m.hijos) return `<button class="nv" type="button" data-ir="${esc(m.t)}">${ic(m.ic)}<span>${m.t}</span></button>`;
      const ab = !!E.abiertos[m.id];
      return `<button class="nv" type="button" aria-expanded="${ab}" data-g="${m.id}">${ic(m.ic)}<span>${m.t}</span>${ic("chev", "chev")}</button>
        <div class="sub${ab ? " abierto" : ""}" id="sub-${m.id}"><div>${m.hijos.map(([t, i, ruta, on]) => `<button class="nv hijo${on ? " on" : ""}" type="button" ${on ? 'aria-current="page"' : `data-ir="${esc(t)}" data-ruta="${ruta}"`}>${ic(i)}<span>${t}</span></button>`).join("")}</div></div>`;
    }).join("");
  }

  /* ── cabecera, cifras, filtros, línea ── */
  function pintarHilo() {
    $("#hilo").textContent = `${nombreSede()} · Martes, 29 de setiembre · Vista de las ${horaTxt()}`;
    $("#sede-nombre").textContent = nombreSede().toUpperCase();
    $("#rol-sede").textContent = `Líder · ${nombreSede()}`;
    document.title = `Existencias · ${nombreSede()} · maqueta`;
  }
  function pintarAtajos() {
    $("#atajos").innerHTML = [["Recibir mercadería", "recibir", "/recibir"], ["Contar", "conteo", "/inventario/conteo"], ["Apartados", "apartados", "/vender/apartados"]]
      .map(([t, i, r]) => `<button class="btn btn-sut" type="button" data-ir="${t}" data-ruta="${r}">${ic(i)}${t}</button>`).join("");
  }
  let kPrev = null;
  function pintarCifras() {
    const k = kpis();
    const defs = [
      { id: "piso", cls: "k-piso", ico: "camion", lab: "Total en piso", n: k.piso, u: "uds", pie: `en ${plural(k.cp, "producto", "productos")}`, pres: E.quick === "piso", tit: "Ver solo las prendas con stock en el piso" },
      { id: "almacen", cls: "k-alm", ico: "inventario", lab: "Total en almacén", n: k.alm, u: "uds", pie: `en ${plural(k.ca, "producto", "productos")}`, pres: E.quick === "almacen", tit: "Ver solo las prendas con stock en el almacén" },
      { id: "alerta", cls: "k-ale", ico: "alerta", lab: "Productos con alerta", n: k.al, u: k.al === 1 ? "producto" : "productos", pie: "con sugerencias de acción", pres: E.estado === "alerta", tit: "Ver solo las prendas con alerta" },
    ];
    $("#cifras").innerHTML = defs.map((d) => `<button class="cifra-k ${d.cls}${kPrev && kPrev[d.id] !== d.n ? " pulso" : ""}" type="button" data-k="${d.id}" aria-pressed="${d.pres}" title="${d.tit}">
      <span class="ico">${ic(d.ico)}</span>
      <span><span class="lab">${d.lab}</span><span class="val"><b class="num">${d.n}</b><span>${d.u}</span></span><span class="pie">${d.pie}</span></span>
      ${ic("chev", "flecha")}</button>`).join("");
    kPrev = { piso: k.piso, almacen: k.alm, alerta: k.al };
  }
  const COMBOS = {
    marca: { rot: "Marca", todo: "todas", ops: () => uniq(cards().map((c) => c.marca)) },
    categoria: { rot: "Categoría", todo: "todas", ops: () => uniq(cards().map((c) => c.categoria)) },
    talla: { rot: "Talla", todo: "todas", ops: () => D.TALLAS.map((t) => ({ v: t, t })) },
    color: { rot: "Color", todo: "todos", ops: () => uniq(cards().map((c) => c.color)).map((o) => ({ ...o, punto: D.COLORES[o.v] })) },
    estado: { rot: "Estado", todo: "todos", ops: () => [{ v: "alerta", t: "Con alerta" }, { v: "reponer", t: "Hay stock para reponer" }, { v: "sobrestock", t: "Revisar sobrestock en piso" }, { v: "balanceado", t: "Stock balanceado" }] },
  };
  function uniq(a) { return [...new Set(a)].sort((x, y) => x.localeCompare(y, "es")).map((v) => ({ v, t: v })); }
  function montarFiltros() {
    $("#filtros").innerHTML = `<label class="campo-b">${ic("buscar")}<input id="q" type="search" placeholder="Buscar producto, marca, código o color…" aria-label="Buscar producto, marca, código o color" autocomplete="off"><button class="limpiar" id="q-x" type="button" aria-label="Borrar la búsqueda" hidden>${ic("x")}</button></label>`
      + Object.keys(COMBOS).map((k) => `<button class="combo" type="button" data-cb="${k}" aria-haspopup="listbox" aria-expanded="false"><span></span>${ic("chevd")}</button>`).join("");
    $("#q").addEventListener("input", (e) => { E.q = e.target.value; $("#q-x").hidden = !E.q; cambioDeFiltro(); });
    $("#q").addEventListener("keydown", (e) => { if (e.key === "Escape" && E.q) { e.stopPropagation(); E.q = ""; e.target.value = ""; $("#q-x").hidden = true; cambioDeFiltro(); } });
    $("#q-x").addEventListener("click", () => { E.q = ""; $("#q").value = ""; $("#q-x").hidden = true; cambioDeFiltro(); $("#q").focus(); });
    $$("[data-cb]", $("#filtros")).forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.cb, cfg = COMBOS[k];
      abrirMenu(b, { opciones: [{ v: "", t: `${cfg.rot}: ${cfg.todo}` }, ...cfg.ops()], valor: E[k], onElegir: (v) => { E[k] = v; cambioDeFiltro(); } });
    }));
    pintarCombos();
  }
  function pintarCombos() {
    $$("[data-cb]").forEach((b) => {
      const k = b.dataset.cb, cfg = COMBOS[k], v = E[k];
      const t = v ? (cfg.ops().find((o) => o.v === v) || {}).t || v : cfg.todo;
      $("span", b).textContent = `${cfg.rot}: ${t}`;
      b.classList.toggle("activo", !!v);
    });
    $("#cb-orden").innerHTML = `<span>${ORDENES.find((o) => o.v === E.orden).t}</span>${ic("chevd")}`;
  }
  function hayFiltros() { return !!(E.q || E.marca || E.categoria || E.talla || E.color || E.estado || E.quick); }
  function limpiarFiltros() { Object.assign(E, { q: "", marca: "", categoria: "", talla: "", color: "", estado: "", quick: null }); const q = $("#q"); if (q) { q.value = ""; $("#q-x").hidden = true; } }
  function cambioDeFiltro() { E.mostrar = PAGINA_TARJETAS; E.pagina = 1; pintarCombos(); pintarCifras(); pintarLinea(); pintarResultados(); }
  function pintarLinea() {
    const total = cards().length, n = cards().filter(pasa).length;
    const chips = [];
    if (E.quick) chips.push(`<span class="chip-f">${E.quick === "piso" ? "Con stock en el piso" : "Con stock en el almacén"}<button type="button" data-quitar="quick" aria-label="Quitar este filtro">${ic("x")}</button></span>`);
    $("#cuenta").innerHTML = `<span>${n === total ? plural(n, "producto", "productos") : `${n} de ${total} productos`} · Vista de piso y almacén</span>${chips.join("")}${hayFiltros() ? `<button class="chip-f" type="button" data-quitar="todo" style="padding-right:10px">Limpiar filtros</button>` : ""}`;
    const t = E.vista === "tabla";
    const b = $("#btn-vista");
    b.setAttribute("aria-pressed", String(t));
    b.title = t ? "Volver a las tarjetas" : "Ver el detalle en una tabla";
    b.innerHTML = t ? `${ic("resumen")}Ver tarjetas` : `${ic("tabla")}Ver detalle`;
  }

  /* ── tarjetas ── */
  function pastilla(est, extra = "") { const s = D.ESTADOS[est]; return `<span class="pill ${s.tono} ${extra}"><i></i>${s.texto}</span>`; }
  function tarjetaHTML(c) {
    const t = D.totalesDe(c), est = D.estadoDe(c);
    const fam = cards().filter((x) => x.famId === c.famId);
    return `<article class="prenda" data-id="${c.id}" data-estado="${est}" aria-label="${esc(c.nombre)}, ${esc(c.color)}">
      <div class="p-foto" data-acc="detalle" role="button" tabindex="0" aria-label="Ver el detalle de ${esc(c.nombre)}">${miniFoto(c)}</div>
      <div class="p-info">
        <h3 class="p-nombre" title="${esc(c.nombre)}">${esc(c.nombre)}</h3>
        <p class="p-sub">${esc(c.marca)} · <b>${esc(c.color)}</b></p>
        <div class="dots" role="group" aria-label="Colores de ${esc(c.nombre)}">${fam.map((f) => `<button class="dot${f.id === c.id ? " sel" : ""}" type="button" style="background:${f.hex}" data-ir-prenda="${f.id}" title="${esc(f.color)}${f.id === c.id ? " (esta)" : " · ver esa prenda"}" aria-label="${esc(f.color)}" aria-pressed="${f.id === c.id}"></button>`).join("")}</div>
      </div>
      <div class="p-cifras"><div class="cifra-b cp"><span>Piso</span><b class="num">${t.piso}</b><span>uds</span></div><div class="cifra-b ca"><span>Almacén</span><b class="num">${t.alm}</b><span>uds</span></div></div>
      <div class="p-tallas">${D.TALLAS.map((tl) => `<div class="tl" data-t="${tl}"><i>${tl}</i><div><div class="r p">${ic("venta")}<em>Piso</em><b class="num">${c.stock[tl][0]}</b></div><div class="r a">${ic("inventario")}<em>Almacén</em><b class="num">${c.stock[tl][1]}</b></div></div></div>`).join("")}</div>
      <div class="p-estado">${pastilla(est)}</div>
      <div class="p-acc">
        <button class="btn btn-d" type="button" data-acc="reponer" ${t.alm === 0 ? 'disabled title="No hay nada en el almacén para bajar al piso"' : 'title="Bajar prendas del almacén al piso"'}>${ic("existencias")}Reponer</button>
        <button class="btn btn-o" type="button" data-acc="ajustar" title="Corregir el stock: merma, conteo físico…">${ic("editar")}Ajustar</button>
        <button class="btn btn-o" type="button" data-acc="detalle" title="Abrir el detalle de la prenda">${ic("inventario")}Ver detalle</button>
      </div></article>`;
  }

  /* ── tabla (la de siempre: casilla · prenda · disponibilidad por talla · piso · almacén · qué hacer) ── */
  function filaHTML(c) {
    const t = D.totalesDe(c), est = D.estadoDe(c), sel = E.sel.has(c.id);
    return `<tr data-id="${c.id}" class="${sel ? "sel" : ""}${E.abierto === c.id ? " abierta" : ""}">
      <td style="width:44px;padding-right:0"><input class="chk" type="checkbox" data-sel="${c.id}" ${sel ? "checked" : ""} aria-label="Elegir ${esc(c.nombre)} ${esc(c.color)}"></td>
      <td><div class="pr"><span class="mini">${miniFoto(c)}<i class="pt" style="background:${c.hex}"></i></span><div><b>${esc(c.nombre)}</b><small><i style="background:${c.hex}"></i>${esc(c.color)} · ${plural(tallasConStock(c), "talla", "tallas")}</small></div></div></td>
      <td><div class="chips">${D.TALLAS.map((tl) => { const [p, a] = c.stock[tl]; return `<span class="ch${p + a === 0 ? " vacia" : p === 0 ? " sin-piso" : ""}" title="${tl}: ${p} en el piso · ${a} en el almacén"><i>${tl}</i><b class="num">${p}<s>·</s>${a}</b></span>`; }).join("")}</div></td>
      <td class="c cifra-t">${t.piso}</td><td class="c cifra-t">${t.alm}</td>
      <td><div class="qh">${pastilla(est)}${ic("chev")}</div></td></tr>`;
  }
  function tablaHTML(lista) {
    const paginas = Math.max(1, Math.ceil(lista.length / PAGINA_TABLA));
    E.pagina = Math.min(E.pagina, paginas);
    const ini = (E.pagina - 1) * PAGINA_TABLA, trozo = lista.slice(ini, ini + PAGINA_TABLA);
    const todos = trozo.length && trozo.every((c) => E.sel.has(c.id));
    const alguno = trozo.some((c) => E.sel.has(c.id));
    const tallas = trozo.reduce((n, c) => n + tallasConStock(c), 0);
    const nums = []; for (let p = 1; p <= paginas; p++) nums.push(p);
    return `<div class="tabla-c"><div class="tabla-sc"><table class="t">
      <thead><tr><th style="width:44px;padding-right:0"><input class="chk" id="sel-todo" type="checkbox" ${todos ? "checked" : ""} aria-label="Elegir todas las prendas de esta página"></th>
      <th>Prenda</th><th>Disponibilidad por talla (piso · almacén)</th><th class="c">Piso</th><th class="c">Almacén</th><th>Qué hacer</th></tr></thead>
      <tbody>${trozo.map(filaHTML).join("")}</tbody></table></div>
      <div class="pie-t"><div class="izq"><span>Mostrando ${plural(trozo.length, "prenda", "prendas")} · ${tallas} tallas</span><button class="btn" type="button" data-csv>${ic("descarga")}Exportar CSV</button></div>
      <div class="leyenda"><span><i></i>Piso · almacén de cada talla</span><span><i class="v"></i>Sin stock aquí</span></div></div>
      ${paginas > 1 ? `<div class="pie-t" style="justify-content:center"><nav class="pagin" aria-label="Páginas de la tabla"><button type="button" data-pag="${E.pagina - 1}" ${E.pagina === 1 ? "disabled" : ""}>Anterior</button>${nums.map((p) => `<button type="button" data-pag="${p}" ${p === E.pagina ? 'aria-current="page"' : ""}>${p}</button>`).join("")}<button type="button" data-pag="${E.pagina + 1}" ${E.pagina === paginas ? "disabled" : ""}>Siguiente</button></nav></div>` : ""}</div>`
      .replace('id="sel-todo" type="checkbox"', `id="sel-todo" type="checkbox"${alguno && !todos ? ' data-parcial="1"' : ""}`);
  }

  function pintarResultados() {
    const lista = visibles(), cont = $("#resultados");
    if (!lista.length) {
      cont.innerHTML = `<div class="vacio"><h3>Ninguna prenda coincide</h3><p>Prueba con otra palabra o quita algún filtro.</p><button class="btn btn-pri" type="button" data-quitar="todo">Limpiar filtros</button></div>`;
    } else if (E.vista === "tarjetas") {
      const n = Math.min(E.mostrar, lista.length), resto = lista.length - n;
      cont.innerHTML = `<div class="rejilla">${lista.slice(0, n).map(tarjetaHTML).join("")}</div>${resto > 0 ? `<div class="mas"><button class="btn btn-sec" type="button" data-mas>Mostrar más prendas (${resto} restantes)</button></div>` : ""}`;
    } else {
      cont.innerHTML = tablaHTML(lista);
      const p = $("#sel-todo"); if (p && p.dataset.parcial) p.indeterminate = true;
    }
    pintarBarraSel();
  }
  function pintarBarraSel() {
    const b = $("#barra-sel"), n = E.sel.size, on = n > 0 && E.vista === "tabla";
    b.classList.toggle("on", on);
    b.innerHTML = `<span><b>${n}</b> ${n === 1 ? "prenda elegida" : "prendas elegidas"}</span><button class="btn btn-c" type="button" data-lote="reponer">${ic("existencias")}Reponer las tallas sin stock</button><button class="btn btn-t" type="button" data-lote="limpiar">Quitar la elección</button>`;
  }

  /* ── cambios de stock (todo pasa por aquí) ── */
  function aplicarReposicion(c, q, quien = RESPONSABLES[0]) {
    let n = 0; const tocadas = [];
    D.TALLAS.forEach((t) => { const k = Math.min(q[t] || 0, c.stock[t][1]); if (k > 0) { c.stock[t][1] -= k; c.stock[t][0] += k; n += k; tocadas.push(t); } });
    if (n) { c.estadoFijo = null; E.act.unshift({ t: `Bajada al piso · ${c.nombre} ${c.color}`, d: `${plural(n, "ud", "uds")} · ${quien}`, cuando: "hace un momento", nuevo: true }); }
    return { n, tocadas };
  }
  function tras(c, tocadas) {
    pintarHilo(); pintarCifras(); pintarLinea(); pintarResultados();
    if (E.abierto) pintarCajon();
    requestAnimationFrame(() => {
      const el = $(`[data-id="${c.id}"]`); if (!el) return;
      tocadas.forEach((t) => $(`.tl[data-t="${t}"]`, el)?.classList.add("flash"));
      $$(".cifra-b", el).forEach((b) => b.classList.add("cambio"));
      el.classList.add("destello");
    });
  }

  /* ── responsable (combo) ── */
  function comboResponsable(m) {
    const b = $("[data-resp]", m.el); m.resp = RESPONSABLES[0];
    b.addEventListener("click", () => abrirMenu(b, { opciones: RESPONSABLES.map((r) => ({ v: r, t: r + (r === RESPONSABLES[0] ? " (tú)" : "") })), valor: m.resp, buscar: false, onElegir: (v) => { m.resp = v; $("span", b).textContent = v; } }));
  }
  const campoResponsable = () => `<div><span class="lbl">Responsable</span><button class="combo caja" type="button" data-resp aria-haspopup="listbox" aria-expanded="false"><span>${RESPONSABLES[0]}</span>${ic("chevd")}</button></div>`;
  const cabPrenda = (c) => `<div class="prenda-l"><span class="mini">${miniFoto(c)}</span><div><b>${esc(c.nombre)}</b> <span style="color:var(--t60)">${esc(c.color)}</span><small>${esc(c.codigo)}</small></div></div>`;

  /* ── ventana «Reponer piso» (ReponerPisoModal, SENTIDO_PISO.bajar) ── */
  function abrirReponer(id, { talla } = {}) {
    const c = porId(id); if (!c) return;
    const sug = D.sugerirReposicion(c);
    const q = Object.fromEntries(D.TALLAS.map((t) => [t, talla ? (t === talla ? Math.min(c.stock[t][1], Math.max(sug[t], 1)) : 0) : sug[t]]));
    const filas = () => D.TALLAS.map((t) => {
      const [p, a] = c.stock[t], sinAlm = a === 0;
      return `<tr data-t="${t}" class="${sinAlm ? "dis" : t === talla ? "foco" : ""}"><td><span class="talla">${t}</span></td><td class="c num">${p}</td><td class="c num">${a}</td>
        <td class="c">${sinAlm ? "—" : `<span class="step"><button type="button" data-d="-1" aria-label="Menos ${t}">${ic("menos")}</button><input type="number" min="0" max="${a}" value="${q[t]}" inputmode="numeric" aria-label="Cantidad a reponer en ${t}"><button type="button" data-d="1" aria-label="Más ${t}">${ic("mas")}</button></span>`}</td></tr>`;
    }).join("");
    const m = modal({
      titulo: "Reponer piso", sub: "Almacén de tienda → Piso de venta", ancho: true,
      html: `${cabPrenda(c)}
        <div class="tarj-m"><table><thead><tr><th>Talla</th><th class="c">Piso</th><th class="c">Almacén</th><th class="c">Cantidad a reponer</th></tr></thead><tbody>${filas()}</tbody></table></div>
        <div class="res-t"><span data-nota></span><span>Bajarás al piso <b data-tot>0 uds</b></span></div>
        ${campoResponsable()}
        <div class="pie-m"><button class="btn btn-cancel" type="button" data-cancel>Cancelar</button><button class="btn btn-pri" type="button" data-ok>Confirmar</button></div>`,
      foco: "[data-ok]",
    });
    comboResponsable(m);
    const total = () => D.TALLAS.reduce((n, t) => n + (q[t] || 0), 0);
    const refrescar = () => {
      const n = total();
      $("[data-tot]", m.el).textContent = plural(n, "ud", "uds");
      $("[data-ok]", m.el).disabled = n === 0;
      $("[data-nota]", m.el).textContent = n === 0 ? "Elige cuántas prendas bajar." : "";
      D.TALLAS.forEach((t) => { const inp = $(`tr[data-t="${t}"] input`, m.el); if (inp && +inp.value !== q[t]) inp.value = q[t]; });
    };
    $("tbody", m.el).addEventListener("click", (e) => {
      const b = e.target.closest("[data-d]"); if (!b) return;
      const t = b.closest("tr").dataset.t; q[t] = Math.max(0, Math.min(c.stock[t][1], q[t] + +b.dataset.d)); refrescar();
    });
    $("tbody", m.el).addEventListener("input", (e) => {
      if (e.target.tagName !== "INPUT") return;
      const t = e.target.closest("tr").dataset.t; const v = parseInt(e.target.value, 10);
      q[t] = Number.isFinite(v) ? Math.max(0, Math.min(c.stock[t][1], v)) : 0; refrescar();
    });
    $("tbody", m.el).addEventListener("change", (e) => { if (e.target.tagName === "INPUT") refrescar(); });
    $("[data-cancel]", m.el).addEventListener("click", m.cerrar);
    $("[data-ok]", m.el).addEventListener("click", async () => {
      m.bloquear(true);
      await guardar("Guardando", () => {
        const { n, tocadas } = aplicarReposicion(c, q, m.resp);
        m.bloquear(false); m.cerrar();
        tras(c, tocadas);
        avisar("exito", `${plural(n, "unidad bajada", "unidades bajadas")} al piso`, `${c.nombre} · ${c.color}. Quedó en Movimientos, a nombre de ${m.resp}.`);
      });
    });
    refrescar();
  }

  /* ── ventana «Ajustar inventario» (AjustarInventarioModal) ── */
  const MOTIVOS = [{ v: "reposicion", t: "Reposición" }, { v: "merma", t: "Merma" }, { v: "conteo_fisico", t: "Conteo físico" }, { v: "otro", t: "Otro" }];
  const NOTA_PISO = "Subir al piso: «Bajar al piso» o «Reponer». Guardar en el almacén: «⋯» ▸ «Retirar del piso». Prendas de más al contar: «Conteo físico».";
  const signo = (n) => (n > 0 ? `+${n}` : `−${-n}`);
  function abrirAjustar(id, { talla } = {}) {
    const c = porId(id); if (!c) return;
    const S = { lugar: "almacen", motivo: "", v: Object.fromEntries(D.TALLAS.map((t) => [t, ""])), obs: "" };
    const idx = () => (S.lugar === "piso" ? 0 : 1);
    const modo = () => (S.motivo === "conteo_fisico" ? "contado" : "diferencia");
    const motivos = () => MOTIVOS.filter((x) => !(S.lugar === "piso" && x.v === "reposicion"));
    const etiqueta = () => (modo() === "diferencia" ? "Suma o resta" : S.lugar === "piso" ? "Contaste en el piso" : "Contaste en el almacén");
    const calc = (t) => {
      const actual = c.stock[t][idx()], raw = S.v[t];
      if (raw === "" || raw === "-") return { actual, delta: 0, res: actual, tocada: false };
      const n = parseInt(raw, 10); if (!Number.isFinite(n)) return { actual, delta: 0, res: actual, tocada: false };
      const delta = modo() === "contado" ? n - actual : n;
      return { actual, delta, res: actual + delta, tocada: delta !== 0 };
    };
    const m = modal({
      titulo: "Ajustar inventario", sub: `${c.nombre} · ${c.color}`, ancho: true,
      html: `${cabPrenda(c)}
        <div><span class="lbl">Dónde</span><div class="seg" role="group" aria-label="Dónde se ajusta"><button type="button" data-lugar="almacen" aria-pressed="true">Almacén de tienda</button><button type="button" data-lugar="piso" aria-pressed="false">Piso de venta</button></div></div>
        <div><span class="lbl">Motivo</span><button class="combo caja" type="button" data-motivo aria-haspopup="listbox" aria-expanded="false"><span style="color:var(--t50)">Elegir motivo</span>${ic("chevd")}</button><div class="nota-c" data-nota-piso style="margin-top:8px" hidden>${NOTA_PISO}</div></div>
        <div class="tarj-m"><table><thead><tr><th>Talla</th><th class="c">Hay ahora</th><th class="c" data-th-cant>Suma o resta</th><th class="c">Queda</th></tr></thead><tbody></tbody></table></div>
        <div data-aviso></div>
        <div><span class="lbl">Observación (opcional)</span><input class="caja-t" type="text" data-obs placeholder="Detalle libre del ajuste" maxlength="200"></div>
        ${campoResponsable()}
        <div class="pie-m"><button class="btn btn-cancel" type="button" data-cancel>Cancelar</button><button class="btn btn-pri" type="button" data-ok disabled>Confirmar</button></div>`,
      foco: "[data-motivo]",
    });
    comboResponsable(m);
    const filas = () => {
      $("tbody", m.el).innerHTML = D.TALLAS.map((t) => {
        const { actual } = calc(t);
        return `<tr data-t="${t}" class="${t === talla ? "foco" : ""}"><td><span class="talla">${t}</span></td><td class="c num">${actual}</td>
          <td class="c"><span class="step"><button type="button" data-d="-1" aria-label="Menos ${t}">${ic("menos")}</button><input type="text" inputmode="numeric" value="${esc(S.v[t])}" placeholder="${modo() === "contado" ? "—" : "0"}" aria-label="${etiqueta()} · ${t}"><button type="button" data-d="1" aria-label="Más ${t}">${ic("mas")}</button></span></td>
          <td class="c"><span class="res-a" data-res></span></td></tr>`;
      }).join("");
      $("[data-th-cant]", m.el).textContent = etiqueta();
      refrescar();
    };
    const refrescar = () => {
      let hay = 0, neg = [];
      D.TALLAS.forEach((t) => {
        const r = calc(t), cel = $(`tr[data-t="${t}"] [data-res]`, m.el);
        if (r.tocada) hay++;
        if (r.res < 0) neg.push(t);
        cel.className = "res-a" + (r.res < 0 ? " neg" : "");
        cel.innerHTML = r.tocada ? `→ ${r.res}${modo() === "contado" ? ` <small>(${signo(r.delta)})</small>` : ""}` : "—";
      });
      const av = $("[data-aviso]", m.el);
      const motivoFalta = hay > 0 && !S.motivo;
      av.innerHTML = neg.length ? `<div class="nota-c err">En ${neg.join(", ")} quedarían menos de 0 prendas. Revisa la cantidad.</div>` : motivoFalta ? `<div class="nota-c amb">Elige un motivo para el ajuste.</div>` : "";
      $("[data-ok]", m.el).disabled = !(hay > 0 && S.motivo && !neg.length);
      $("[data-nota-piso]", m.el).hidden = S.lugar !== "piso";
    };
    const cambiarModo = (viejo) => {
      // Cambiar de «suma o resta» a «contaste» conserva el resultado, no el número escrito (pasarCantidades).
      const nuevo = modo(); if (viejo === nuevo) return;
      D.TALLAS.forEach((t) => {
        const raw = S.v[t]; if (raw === "" || raw === "-") return;
        const n = parseInt(raw, 10); if (!Number.isFinite(n)) return;
        const actual = c.stock[t][idx()];
        S.v[t] = String(nuevo === "contado" ? actual + n : n - actual);
      });
    };
    $$("[data-lugar]", m.el).forEach((b) => b.addEventListener("click", () => {
      const viejo = modo(); S.lugar = b.dataset.lugar;
      $$("[data-lugar]", m.el).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      if (S.lugar === "piso" && S.motivo === "reposicion") { S.motivo = ""; $("[data-motivo] span", m.el).textContent = "Elegir motivo"; $("[data-motivo] span", m.el).style.color = "var(--t50)"; }
      S.v = Object.fromEntries(D.TALLAS.map((t) => [t, ""])); void viejo; filas();
    }));
    $("[data-motivo]", m.el).addEventListener("click", (e) => {
      const b = e.currentTarget;
      abrirMenu(b, { opciones: motivos(), valor: S.motivo, buscar: false, onElegir: (v) => {
        const viejo = modo(); S.motivo = v;
        $("span", b).textContent = MOTIVOS.find((x) => x.v === v).t; $("span", b).style.color = "";
        cambiarModo(viejo); filas();
      } });
    });
    $("tbody", m.el).addEventListener("click", (e) => {
      const b = e.target.closest("[data-d]"); if (!b) return;
      const t = b.closest("tr").dataset.t, inp = $("input", b.closest("tr"));
      const base = S.v[t] === "" || S.v[t] === "-" ? (modo() === "contado" ? c.stock[t][idx()] : 0) : parseInt(S.v[t], 10);
      let n = (Number.isFinite(base) ? base : 0) + +b.dataset.d;
      if (modo() === "contado") n = Math.max(0, n);
      S.v[t] = String(n); inp.value = S.v[t]; refrescar();
    });
    $("tbody", m.el).addEventListener("input", (e) => {
      if (e.target.tagName !== "INPUT") return;
      const t = e.target.closest("tr").dataset.t; let v = e.target.value.replace(/[^\d-]/g, "");
      if (modo() === "contado") v = v.replace(/-/g, "");
      S.v[t] = v; refrescar();
    });
    $("[data-obs]", m.el).addEventListener("input", (e) => { S.obs = e.target.value; });
    $("[data-cancel]", m.el).addEventListener("click", m.cerrar);
    $("[data-ok]", m.el).addEventListener("click", async () => {
      m.bloquear(true);
      await guardar("Guardando", () => {
        const tocadas = [];
        D.TALLAS.forEach((t) => { const r = calc(t); if (r.tocada) { c.stock[t][idx()] = r.res; tocadas.push(t); } });
        c.estadoFijo = null;
        const mot = MOTIVOS.find((x) => x.v === S.motivo).t;
        E.act.unshift({ t: `Ajuste (${mot.toLowerCase()}) · ${c.nombre} ${c.color}`, d: `${tocadas.map((t) => `${t} ${signo(calc(t).delta)}`).join(", ")} · ${m.resp}`, cuando: "hace un momento", nuevo: true });
        m.bloquear(false); m.cerrar();
        tras(c, tocadas);
        avisar("exito", "Ajuste guardado", `${plural(tocadas.length, "talla ajustada", "tallas ajustadas")} en ${S.lugar === "piso" ? "el piso" : "el almacén"} de ${c.nombre} · ${c.color}.`);
      });
    });
    filas();
  }

  /* ── cajón de la prenda (CajonPrendaExistencias): sin velo, sale por la derecha ── */
  let capaCajon = null;
  function abrirCajon(id, talla) {
    if (!porId(id)) return;
    E.abierto = id; E.tallaSel = talla || null;
    pintarCajon();
    const cj = $("#cajon"); cj.classList.add("abierto"); cj.setAttribute("aria-hidden", "false");
    if (!capaCajon) capaCajon = meter({ cerrar: cerrarCajon });
    $$("tr[data-id]").forEach((tr) => tr.classList.toggle("abierta", tr.dataset.id === id));
  }
  function cerrarCajon() {
    const cj = $("#cajon"); cj.classList.remove("abierto"); cj.setAttribute("aria-hidden", "true");
    if (capaCajon) { sacar(capaCajon); capaCajon = null; }
    E.abierto = null; E.tallaSel = null;
    $$("tr.abierta").forEach((tr) => tr.classList.remove("abierta"));
  }
  function pintarCajon() {
    const c = porId(E.abierto); if (!c) return;
    const t = D.totalesDe(c), est = D.estadoDe(c), s = E.tallaSel;
    const otras = D.SEDES.filter((x) => x.id !== E.sede).map((x) => { const o = porId(c.id, x.id); const tt = D.totalesDe(o); return { nombre: x.nombre, piso: tt.piso, alm: tt.alm }; });
    let frase = "Toca una talla para ver qué pasa con ella.";
    if (s) {
      const [p, a] = c.stock[s];
      frase = p === 0 && a > 0 ? `En la ${s} no hay nada en el piso: las ${a} están en el almacén, la clienta no las ve.` : p === 0 && a === 0 ? `La ${s} está agotada en esta sede.` : `En la ${s} hay ${p} en el piso y ${a} en el almacén.`;
    }
    $("#cajon").innerHTML = `<div class="cajon-h"><button class="cerrar" type="button" data-cj="cerrar" aria-label="Cerrar el detalle">${ic("x")}</button>
      <div class="foto">${miniFoto(c)}</div><div style="min-width:0"><h2>${esc(c.nombre)}</h2><p>${esc(c.marca)} · ${esc(c.color)} · ${esc(c.categoria)}</p><p class="cod">${esc(c.codigo)}</p>${pastilla(est)}</div></div>
      <div class="cajon-b">
        <div class="tres"><div><small>En el piso</small><b class="num">${t.piso}</b></div><div><small>En el almacén</small><b class="num">${t.alm}</b></div><div><small>En camino</small><b class="num">${c.enCamino}</b></div></div>
        <div class="grupo"><h3>Disponibilidad por talla</h3><p>Unidades en el piso · unidades en el almacén.</p>
          <div class="tallas-c">${D.TALLAS.map((tl) => { const [p, a] = c.stock[tl]; return `<button class="tc${p + a === 0 ? " vac" : p === 0 ? " sinp" : ""}" type="button" data-talla="${tl}" aria-pressed="${s === tl}"><i>${tl}</i><b class="num">${p}<s>·</s>${a}</b><small>${p + a === 0 ? "agotada" : p === 0 ? "sin piso" : "piso · alm."}</small></button>`; }).join("")}</div>
          <p class="tc-pie" aria-live="polite">${esc(frase)}</p></div>
        <div class="grupo"><h3>Operar esta prenda</h3><p>Acciones rápidas de reposición y movimiento.</p><div class="acc-l">
          <button class="ac pri" type="button" data-cj="reponer" ${t.alm === 0 ? 'disabled title="No hay nada en el almacén para bajar al piso"' : ""}>${ic("existencias")}<span>Reponer a piso</span>${ic("chev", "ch-r")}</button>
          <button class="ac" type="button" data-ir="Trasladar" data-ruta="/inventario/mover?variante=${c.id}">${ic("movimientos")}<span>Trasladar</span>${ic("chev", "ch-r")}</button></div></div>
        <div class="grupo"><h3>Gestión</h3><p>Acciones de administración de stock.</p><div class="acc-l">
          <button class="ac" type="button" data-cj="ajustar">${ic("inventario")}<span>Ajustar stock</span>${ic("chev", "ch-r")}</button>
          <button class="ac" type="button" data-ir="Imprimir etiquetas" data-ruta="/inventario/etiquetas">${ic("etiqueta")}<span>Imprimir etiquetas</span>${ic("chev", "ch-r")}</button>
          <button class="ac pel" type="button" data-ir="Eliminar el producto (solo Admin)">${ic("papelera")}<span>Eliminar el producto</span>${ic("chev", "ch-r")}</button></div></div>
        <div class="grupo"><h3>En la red</h3><p>Lo que hay de esta prenda en las otras sedes.</p>
          <div class="red-l">${otras.map((o) => `<div><span>${esc(o.nombre)}</span><span class="num">${o.piso} en piso · ${o.alm} en almacén</span></div>`).join("")}</div>
          <div class="acc-l" style="margin-top:8px"><button class="ac" type="button" data-ir="Pedir a otra sede">${ic("red")}<span>Pedir a otra sede</span>${ic("chev", "ch-r")}</button></div></div>
        <div class="grupo"><h3>Consultar</h3><p>Información y trazabilidad de esta prenda.</p><div class="acc-l">
          <button class="ac" type="button" data-ir="Ver historial" data-ruta="/inventario/movimientos?variante=${c.id}">${ic("facturas")}<span>Ver historial</span>${ic("chev", "ch-r")}</button></div></div>
      </div>`;
  }

  /* ── actividad, sede y buscador ── */
  let popAbierto = null;
  function cerrarPop() { if (popAbierto) popAbierto.cerrar(); }
  function abrirActividad(ancla) {
    if (popAbierto) { cerrarPop(); return; }
    cerrarMenu();
    const p = document.createElement("div");
    p.className = "pop"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Actividad reciente");
    const lista = () => E.act.slice(0, 8).map((a) => `<li><i class="${a.nuevo ? "nuevo" : ""}"></i><div><b style="font-weight:600">${esc(a.t)}</b><small>${esc(a.d)} · ${esc(a.cuando)}</small></div></li>`).join("");
    p.innerHTML = `<h4>Actividad</h4><p class="b">Lo último que pasó en ${esc(nombreSede())}, y lo que hagas aquí.</p><ul>${lista()}</ul><div class="pie"><span>${E.act.filter((a) => a.nuevo).length} de esta sesión</span><button type="button" data-reset>Restablecer la maqueta</button></div>`;
    $("#flot").appendChild(p);
    const r = ancla.getBoundingClientRect(); p.style.top = r.bottom + 10 + "px"; p.style.right = Math.max(12, innerWidth - r.right - 10) + "px";
    $("[data-reset]", p).addEventListener("click", () => location.reload());
    const fuera = (e) => { if (!p.contains(e.target) && !ancla.contains(e.target)) cerrar(); };
    setTimeout(() => document.addEventListener("pointerdown", fuera, true), 0);
    const capa = meter({ cerrar });
    function cerrar() { document.removeEventListener("pointerdown", fuera, true); sacar(capa); p.remove(); popAbierto = null; }
    popAbierto = { cerrar };
  }
  function abrirSede(ancla) {
    abrirMenu(ancla, { opciones: D.SEDES.map((s) => ({ v: s.id, t: s.nombre })), valor: E.sede, buscar: false, alinear: "der", minAncho: 190, onElegir: async (v) => {
      if (v === E.sede) return;
      await guardar("Cambiando de sede", () => { cerrarCajon(); E.sede = v; E.sel.clear(); E.mostrar = PAGINA_TARJETAS; E.pagina = 1; kPrev = null; pintarTodo(); }, 550);
    } });
  }

  let paleta = null;
  function abrirPaleta() {
    if (paleta) return; cerrarMenu(); cerrarPop();
    const v = document.createElement("div"); v.className = "paleta-v";
    v.innerHTML = `<div class="paleta" role="dialog" aria-label="Buscar en el ERP"><label class="bus">${ic("buscar")}<input type="text" placeholder="Busca una prenda o una pantalla…" aria-label="Buscar" autocomplete="off"></label><div class="res"></div><div class="pie"><span>↑ ↓ para moverte</span><span>Enter para abrir</span><span>Esc para cerrar</span></div></div>`;
    $("#capas").appendChild(v);
    const inp = $("input", v), res = $(".res", v);
    let items = [], foco = 0;
    const pantallas = [["Inicio"], ...MENU.filter((m) => m.hijos).flatMap((m) => m.hijos.map((h) => [h[0], h[2]])), ["Clientes"], ["Rendimiento"]];
    const pintar = () => {
      const nq = D.norm(inp.value.trim());
      const pr = cards().filter((c) => !nq || D.norm(`${c.nombre} ${c.color} ${c.marca} ${c.codigo}`).includes(nq)).slice(0, nq ? 8 : 4);
      const pa = pantallas.filter(([t]) => !nq || D.norm(t).includes(nq)).slice(0, nq ? 6 : 5);
      items = [...pr.map((c) => ({ tipo: "prenda", c })), ...pa.map(([t, r]) => ({ tipo: "pantalla", t, r }))];
      foco = Math.min(foco, Math.max(items.length - 1, 0));
      let html = "", i = 0;
      if (pr.length) { html += `<div class="grp">Prendas de ${esc(nombreSede())}</div>` + pr.map((c) => `<button class="it${i++ === foco ? " foco" : ""}" type="button" data-n="${i - 1}"><span class="mini" style="width:26px;height:32px;border-radius:5px;background:${c.hex};box-shadow:inset 0 0 0 1px rgba(26,26,24,.15);flex:none"></span><span>${esc(c.nombre)} <span style="color:var(--t60)">${esc(c.color)}</span></span><small>${esc(c.codigo)}</small></button>`).join(""); }
      if (pa.length) { html += `<div class="grp">Pantallas</div>` + pa.map(([t, r]) => `<button class="it${i++ === foco ? " foco" : ""}" type="button" data-n="${i - 1}">${ic("chev")}<span>${esc(t)}</span><small>${esc(r || "")}</small></button>`).join(""); }
      res.innerHTML = html || `<div class="nada" style="padding:18px;color:var(--t60)">Nada coincide con «${esc(inp.value)}».</div>`;
    };
    const elegir = (n) => {
      const it = items[n]; if (!it) return; cerrar();
      if (it.tipo === "prenda") irAPrenda(it.c.id); else if (it.t === "Existencias") avisar("info", "Ya estás en Existencias"); else irA(it.t, it.r);
    };
    inp.addEventListener("input", () => { foco = 0; pintar(); });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); foco = (foco + 1) % Math.max(items.length, 1); pintar(); $(".foco", res)?.scrollIntoView({ block: "nearest" }); }
      else if (e.key === "ArrowUp") { e.preventDefault(); foco = (foco - 1 + items.length) % Math.max(items.length, 1); pintar(); $(".foco", res)?.scrollIntoView({ block: "nearest" }); }
      else if (e.key === "Enter") { e.preventDefault(); elegir(foco); }
    });
    res.addEventListener("click", (e) => { const b = e.target.closest("[data-n]"); if (b) elegir(+b.dataset.n); });
    v.addEventListener("pointerdown", (e) => { if (e.target === v) cerrar(); });
    const capa = meter({ cerrar });
    function cerrar() { sacar(capa); v.remove(); paleta = null; }
    paleta = { cerrar };
    pintar(); inp.focus();
  }

  /* ── ir a una prenda de la lista (puntos de color, buscador) ── */
  function irAPrenda(id) {
    const c = porId(id); if (!c) return;
    if (!pasa(c)) limpiarFiltros();
    const lista = visibles(), i = lista.findIndex((x) => x.id === id);
    if (E.vista === "tarjetas") E.mostrar = Math.max(E.mostrar, i + 1); else E.pagina = Math.floor(i / PAGINA_TABLA) + 1;
    pintarCombos(); pintarLinea(); pintarResultados();
    requestAnimationFrame(() => {
      const el = $(`[data-id="${id}"]`); if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("destello"); setTimeout(() => el.classList.remove("destello"), 1300);
    });
  }

  /* ── exportar ── */
  function exportarCSV() {
    const filas = [["Código", "Prenda", "Marca", "Categoría", "Color", "Talla", "Piso", "Almacén", "Estado"]];
    visibles().forEach((c) => D.TALLAS.forEach((t) => filas.push([c.codigo + "-" + t, c.nombre, c.marca, c.categoria, c.color, t, c.stock[t][0], c.stock[t][1], D.ESTADOS[D.estadoDe(c)].texto])));
    const csv = "﻿" + filas.map((f) => f.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `existencias-${E.sede}-2026-09-29.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    avisar("exito", "CSV exportado", `${a.download} · ${plural(visibles().length, "prenda", "prendas")} con sus 4 tallas.`);
  }

  /* ── lote: reponer las tallas sin stock de varias prendas ── */
  async function lote(accion) {
    if (accion === "limpiar") { E.sel.clear(); pintarResultados(); return; }
    const elegidas = cards().filter((c) => E.sel.has(c.id));
    const plan = elegidas.map((c) => [c, D.sugerirReposicion(c)]).filter(([, q]) => D.TALLAS.some((t) => q[t] > 0));
    if (!plan.length) { avisar("info", "No hay nada que bajar", "Las prendas elegidas no tienen tallas por reponer con stock en el almacén."); return; }
    await guardar("Guardando", () => {
      let n = 0; plan.forEach(([c, q]) => { n += aplicarReposicion(c, q).n; });
      E.sel.clear(); pintarHilo(); pintarCifras(); pintarLinea(); pintarResultados(); if (E.abierto) pintarCajon();
      avisar("exito", `${plural(n, "unidad bajada", "unidades bajadas")} al piso`, `${plural(plan.length, "prenda", "prendas")}. Cada talla quedó en Movimientos.`);
    });
  }

  /* ── pintar todo y enganchar eventos ── */
  function pintarTodo() { pintarHilo(); pintarCifras(); pintarCombos(); pintarLinea(); pintarResultados(); }

  function iniciar() {
    let lat = "abierto";
    try { lat = localStorage.getItem("cayla-maqueta-lat") || (innerWidth <= 900 ? "cerrado" : "abierto"); } catch (_) { if (innerWidth <= 900) lat = "cerrado"; }
    if (innerWidth <= 900) lat = "cerrado";
    $("#app").dataset.lat = lat;
    pintarNav(); pintarAtajos(); montarFiltros(); pintarTodo();

    $("#alt-lat").addEventListener("click", () => {
      const a = $("#app"); a.dataset.lat = a.dataset.lat === "abierto" ? "cerrado" : "abierto";
      try { if (innerWidth > 900) localStorage.setItem("cayla-maqueta-lat", a.dataset.lat); } catch (_) {}
    });
    $("#abrir-paleta").addEventListener("click", abrirPaleta);
    $("#abrir-act").addEventListener("click", (e) => abrirActividad(e.currentTarget));
    $("#abrir-sede").addEventListener("click", (e) => abrirSede(e.currentTarget));
    $("#cb-orden").addEventListener("click", (e) => abrirMenu(e.currentTarget, { opciones: ORDENES, valor: E.orden, buscar: false, alinear: "der", onElegir: (v) => { E.orden = v; E.mostrar = PAGINA_TARJETAS; E.pagina = 1; pintarCombos(); pintarResultados(); } }));
    $("#btn-vista").addEventListener("click", () => { E.vista = E.vista === "tarjetas" ? "tabla" : "tarjetas"; E.pagina = 1; pintarLinea(); pintarResultados(); });

    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); paleta ? paleta.cerrar() : abrirPaleta(); }
    });

    // Un solo oyente de clics para lo que se repinta: menú lateral, cifras, resultados, cajón, barra de elegidas.
    document.addEventListener("click", (e) => {
      const g = e.target.closest("[data-g]");
      if (g) { const ab = g.getAttribute("aria-expanded") !== "true"; g.setAttribute("aria-expanded", String(ab)); $("#sub-" + g.dataset.g).classList.toggle("abierto", ab); E.abiertos[g.dataset.g] = ab; return; }
      const ir = e.target.closest("[data-ir]");
      if (ir) { e.preventDefault(); irA(ir.dataset.ir, ir.dataset.ruta); return; }
      const k = e.target.closest("[data-k]");
      if (k) {
        const id = k.dataset.k;
        if (id === "alerta") E.estado = E.estado === "alerta" ? "" : "alerta"; else E.quick = E.quick === id ? null : id;
        cambioDeFiltro();
        $(".linea").scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const q = e.target.closest("[data-quitar]");
      if (q) { if (q.dataset.quitar === "todo") { limpiarFiltros(); } else E[q.dataset.quitar] = null; cambioDeFiltro(); return; }
      if (e.target.closest("[data-mas]")) { E.mostrar += PAGINA_TARJETAS; pintarResultados(); return; }
      if (e.target.closest("[data-csv]")) { exportarCSV(); return; }
      const pg = e.target.closest("[data-pag]");
      if (pg && !pg.disabled) { E.pagina = +pg.dataset.pag; pintarResultados(); $("#resultados").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      const lt = e.target.closest("[data-lote]");
      if (lt) { lote(lt.dataset.lote); return; }
      const dp = e.target.closest("[data-ir-prenda]");
      if (dp) { if (dp.getAttribute("aria-pressed") !== "true") irAPrenda(dp.dataset.irPrenda); return; }
      const cj = e.target.closest("[data-cj]");
      if (cj) {
        const a = cj.dataset.cj;
        if (a === "cerrar") cerrarCajon();
        else if (a === "reponer") abrirReponer(E.abierto, { talla: E.tallaSel });
        else if (a === "ajustar") abrirAjustar(E.abierto, { talla: E.tallaSel });
        return;
      }
      const tc = e.target.closest("[data-talla]");
      if (tc) { E.tallaSel = E.tallaSel === tc.dataset.talla ? null : tc.dataset.talla; pintarCajon(); return; }
      // casillas de la tabla
      if (e.target.matches("[data-sel]")) { const id = e.target.dataset.sel; e.target.checked ? E.sel.add(id) : E.sel.delete(id); e.target.closest("tr").classList.toggle("sel", e.target.checked); pintarBarraSel(); const trozo = visiblesPagina(); const todos = trozo.every((c) => E.sel.has(c.id)); const p = $("#sel-todo"); if (p) { p.checked = todos; p.indeterminate = !todos && trozo.some((c) => E.sel.has(c.id)); } return; }
      if (e.target.matches("#sel-todo")) { const trozo = visiblesPagina(); trozo.forEach((c) => (e.target.checked ? E.sel.add(c.id) : E.sel.delete(c.id))); pintarResultados(); return; }
      // acciones de tarjeta y fila
      const ac = e.target.closest("[data-acc]");
      const cont = e.target.closest("[data-id]");
      if (ac && cont && cont.closest("#resultados")) {
        if (ac.disabled) return;
        const id = cont.dataset.id;
        if (ac.dataset.acc === "reponer") abrirReponer(id);
        else if (ac.dataset.acc === "ajustar") abrirAjustar(id);
        else abrirCajon(id);
        return;
      }
      const tr = e.target.closest("#resultados tr[data-id]");
      if (tr && !e.target.closest("input,label")) { abrirCajon(tr.dataset.id); return; }
    });
    document.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".p-foto")) { e.preventDefault(); abrirCajon(e.target.closest("[data-id]").dataset.id); }
    });

    // Estado por la URL, como en las otras maquetas: ?vista=tabla&sede=AQP&abrir=<id>&modal=reponer|ajustar&q=top
    const u = new URLSearchParams(location.search);
    if (u.get("sede") && SEDES[u.get("sede")]) { E.sede = u.get("sede"); kPrev = null; }
    if (u.get("q")) { E.q = u.get("q"); $("#q").value = E.q; $("#q-x").hidden = false; }
    if (u.get("vista") === "tabla") E.vista = "tabla";
    if (u.get("estado")) E.estado = u.get("estado");
    pintarTodo();
    if (u.get("abrir")) abrirCajon(u.get("abrir"), u.get("talla"));
    if (u.get("modal") === "reponer") abrirReponer(u.get("abrir") || cards()[0].id, { talla: u.get("talla") });
    if (u.get("modal") === "ajustar") abrirAjustar(u.get("abrir") || cards()[0].id, { talla: u.get("talla") });
    if (u.get("limpio")) $("#marca-m").hidden = true;
    setInterval(pintarHilo, 30000);
  }
  function visiblesPagina() { const l = visibles(); const i = (E.pagina - 1) * PAGINA_TABLA; return l.slice(i, i + PAGINA_TABLA); }

  window.MAQUETA = { E, D, SEDES, kpis };
  iniciar();
})();
