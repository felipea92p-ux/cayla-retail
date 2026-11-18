// Maqueta · Recibir mercadería, ordenada (2026-11-11). Corre sobre el marco real del ERP (lateral y cabecera capturados, abierto o plegado) y el CSS
// compilado real. No guarda nada: los datos son inventados (datos.js). Las piezas del ERP (Dial, Trayecto, categorías, chips, barras, botones) se
// dibujan con sus clases reales; lo nuevo lleva `rm-*` (maqueta.css). «Hoy» muestra la captura quieta del DOM real de producción (hoy-<vista>.html).
// Tres direcciones de Contar (Felipe 2026-11-11, «3 maquetas super elaboradas con un orden distinto»): A · Mesa de tres, B · Tablero, C · Mostrador.
(() => {
  const D = window.DATOS;
  const I = window.ICONOS;
  Object.assign(I, {
    info: '<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>',
    ellipsis: '<circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle>',
    printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"></path><rect x="6" y="14" width="12" height="8" rx="1"></rect>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path><path d="m15 5 4 4"></path>',
    grid: '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M3 12h18"></path><path d="M12 3v18"></path>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path><path d="m9 12 2 2 4-4"></path>',
    banknote: '<rect width="20" height="12" x="2" y="6" rx="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 12h.01M18 12h.01"></path>',
    "chevron-up": '<path d="m18 15-6-6-6 6"></path>',
    "chevron-left": '<path d="m15 18-6-6 6-6"></path>',
    "chevron-right": '<path d="m9 18 6-6-6-6"></path>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
    repeat: '<path d="m17 2 4 4-4 4"></path><path d="M3 11v-1a4 4 0 0 1 4-4h14"></path><path d="m7 22-4-4 4-4"></path><path d="M21 13v1a4 4 0 0 1-4 4H3"></path>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
    "list-checks": '<path d="m3 17 2 2 4-4"></path><path d="m3 7 2 2 4-4"></path><path d="M13 6h8"></path><path d="M13 12h8"></path><path d="M13 18h8"></path>',
    "square-check": '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="m9 12 2 2 4-4"></path>',
    "corner-down-left": '<path d="M20 4v7a4 4 0 0 1-4 4H4"></path><path d="m9 10-5 5 5 5"></path>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"></path><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path><path d="M12 17.5v-11"></path>',
    "layout-grid": '<rect width="7" height="7" x="3" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="14" rx="1"></rect><rect width="7" height="7" x="3" y="14" rx="1"></rect>',
    tops: '<path d="M8.6 3 8 8.2l-2.5 2.4V16h13v-5.4L16 8.2 15.4 3"></path><path d="M8.6 3c.2 3.2 1.6 5 3.4 5s3.2-1.8 3.4-5"></path>',
    pantalones: '<path d="M7 3h10l1.4 18h-5.2L12 10l-1.2 11H5.6z"></path><path d="M7 7.5h10"></path>',
  });
  const lucide = (n, cls = "h-4 w-4") => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide ${cls}" aria-hidden="true">${I[n] || ""}</svg>`;
  const catIc = (cat, cls = "h-[18px] w-[18px]") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${I[cat === "Pantalones" ? "pantalones" : "tops"]}</svg>`;
  const $ = (s, r = document) => r.querySelector(s);
  const miles = (n) => Number(n).toLocaleString("es-PE");
  const signo = (n) => (n > 0 ? `+${miles(n)}` : miles(n));
  const prendas = (n) => `${miles(n)} ${n === 1 ? "prenda" : "prendas"}`;
  const modelosTxt = (n) => `${miles(n)} ${n === 1 ? "modelo" : "modelos"}`;
  /** El color de cada categoría (regla que la maqueta se salta a propósito: hoy todas son pizarra). */
  const CAT_COLOR = { Tops: "var(--color-pizarra)", Pantalones: "var(--color-naranja)", "Camisas y Blusas": "var(--color-sede-tal)" };
  const catColor = (cat) => CAT_COLOR[cat] || "var(--color-pizarra)";

  // ── Las reglas del ERP, en chico (avance-color.ts, recepcion-dial-reglas.ts, recepcion-modelos-reglas.ts) ──
  const colorDeAvance = (pct) => {
    const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
    if (p >= 100) return "var(--color-verde)";
    return p <= 50 ? `color-mix(in oklab, var(--color-avance-medio) ${Math.round(p * 2)}%, var(--color-rojo))` : `color-mix(in oklab, var(--color-verde) ${Math.round((p - 50) * 2)}%, var(--color-avance-medio))`;
  };
  const atajos = (dijeron, contadas) => { const e = dijeron ?? contadas; return e >= 5000 ? [100, 500] : e >= 1000 ? [50, 100] : e >= 200 ? [10, 50] : [5, 10]; };
  const repartidas = (m) => Object.values(m.rep).reduce((a, n) => a + n, 0);
  const contado = (m) => m.contadas != null;
  const faltanTallas = (m) => contado(m) && m.contadas > 0 && m.modo === "ahora" && m.tipo === "restock" && repartidas(m) !== m.contadas;
  const porCrear = (m) => contado(m) && m.contadas > 0 && m.modo === "ahora" && m.tipo === "nuevo" && !m.creada;
  const entraAlStock = (m) => contado(m) && m.contadas > 0 && m.modo === "ahora" && (m.tipo === "restock" ? repartidas(m) === m.contadas : !!m.creada);
  /** El estado que dice su chip en la lista (recepcion-modelos-reglas.ts). */
  function estado(m) {
    if (!contado(m)) return { clave: "por-contar", texto: "Por contar", tono: "neutro" };
    if (m.dijeron != null && m.contadas === 0) return { clave: "diferencia", texto: "No llegó", tono: "ambar" };
    if (m.dijeron != null && m.contadas !== m.dijeron) return { clave: "diferencia", texto: m.contadas < m.dijeron ? `Faltan ${miles(m.dijeron - m.contadas)}` : `Sobran ${miles(m.contadas - m.dijeron)}`, tono: "ambar" };
    if (faltanTallas(m)) return { clave: "tallas", texto: "Faltan tallas", tono: "ambar" };
    if (porCrear(m)) return { clave: "tallas", texto: "Por crear", tono: "pizarra" };
    return { clave: "listo", texto: m.dijeron == null ? "Contado" : "Cuadra", tono: "verde" };
  }
  const modoPorDefecto = (m) => (m.tipo === "restock" ? "ahora" : "despues");
  /** Los tres pasos de una prenda: qué está hecho, qué sigue y qué todavía no toca (ADR-0284). */
  function pasosDe(m) {
    const hay = contado(m), contadas = m.contadas || 0;
    const s1 = hay ? "hecho" : "ahora";
    const s2 = !hay || contadas === 0 ? "espera" : "hecho";
    const hayPaso3 = s2 === "hecho" && m.modo === "ahora";
    const s3 = !hayPaso3 ? null : m.tipo === "nuevo" ? (m.creada ? "hecho" : "ahora") : repartidas(m) === contadas ? "hecho" : "ahora";
    return { hay, contadas, s1, s2, s3, hayPaso3 };
  }

  // ── Estado de la maqueta ──
  const q = new URLSearchParams(location.search);
  const INICIAL = () => ({
    vista: "contar", cara: "propuesta", direccion: E?.direccion || (["A", "B", "C"].includes(q.get("dir")) ? q.get("dir") : "A"),
    actual: "lunares", filtro: "todos", tipo: "todos", buscar: "", orden: null,
    globo: null, menu: false, editando: false, hoja: false, cambios: false, recien: null, abiertaB: null,
    motivo: null, dueno: "CAYLA", tablaAbierta: false, guia: D.guia, nota: "",
    modelos: JSON.parse(JSON.stringify(D.modelos)),
    sinAviso: false,
  });
  let E = null;
  E = INICIAL();
  const SIN_AVISO = () => ({
    ...INICIAL(), vista: "sin-aviso", sinAviso: true, actual: "blusa1",
    modelos: [
      { id: "blusa1", cat: "Camisas y Blusas", nombre: "Blusa 1", provisional: true, tipo: "nuevo", dijeron: null, contadas: 12, modo: "despues", costo: null, tallas: ["S", "M", "L"], colores: [["Crudo", "#F3ECE0"]], rep: {}, hex: "#e5dbd2", agregado: true },
      { id: "carla2", cat: "Pantalones", nombre: "Pantalón Carla", tipo: "restock", dijeron: null, contadas: null, modo: null, costo: "45.00", tallas: ["28", "30", "32"], colores: [["Beige", "#D5BA98"], ["Negro", "#2D2C2F"]], rep: {}, hex: "#e5dbd2", agregado: true },
    ],
  });
  /** El envío ya contado de punta a punta (para abrir Cerrar y Cerrado directo). */
  function contarTodo() {
    if (E.sinAviso) { E.modelos.forEach((m) => { if (!contado(m)) { m.contadas = 4; m.modo = "ahora"; m.rep = { [`${m.colores[1]?.[0] || m.colores[0][0]}|${m.tallas[0]}`]: 4 }; } }); return; }
    const por = { quoy: { contadas: 4, modo: "despues", rep: {} }, asora: { contadas: 7, modo: "despues", rep: {} }, lunares: { contadas: 10, modo: "ahora", rep: { "Blanco|S": 7, "Negro|M": 3 } }, carla: { contadas: 4, modo: "ahora", rep: { "Negro|28": 4 } } };
    E.modelos.forEach((m) => { if (!contado(m) || faltanTallas(m)) Object.assign(m, por[m.id] || {}); });
  }
  const nadaContado = () => E.modelos.every((m) => { const d = D.modelos.find((x) => x.id === m.id); return !d || (m.contadas === d.contadas && JSON.stringify(m.rep) === JSON.stringify(d.rep)); });
  const actual = () => E.modelos.find((m) => m.id === E.actual) || E.modelos[0];
  const porId = (id) => E.modelos.find((m) => m.id === id);
  const cats = () => [...new Set(E.modelos.map((m) => m.cat))];
  const cifras = () => {
    const dijeron = E.sinAviso ? null : E.modelos.reduce((a, m) => a + m.dijeron, 0);
    const contadas = E.modelos.reduce((a, m) => a + (m.contadas || 0), 0);
    const porContar = E.modelos.filter((m) => !contado(m)).length;
    const conDiferencia = E.modelos.filter((m) => estado(m).clave === "diferencia").length;
    const sinTallas = E.modelos.filter((m) => faltanTallas(m) || porCrear(m)).length;
    const listas = E.modelos.filter((m) => estado(m).clave === "listo").length;
    const entran = E.modelos.filter(entraAlStock).reduce((a, m) => a + m.contadas, 0);
    const pct = dijeron ? Math.min(100, (contadas / dijeron) * 100) : E.modelos.length ? ((E.modelos.length - porContar) / E.modelos.length) * 100 : 0;
    return { dijeron, contadas, porContar, conDiferencia, sinTallas, listas, entran, despues: contadas - entran, pct, diferencia: dijeron == null ? null : contadas - dijeron };
  };
  const pasaFiltro = (m) => {
    const e = estado(m).clave;
    if (E.filtro === "por-contar" && e !== "por-contar") return false;
    if (E.filtro === "diferencia" && e !== "diferencia") return false;
    if (E.filtro === "tallas" && !(faltanTallas(m) || porCrear(m))) return false;
    if (E.filtro === "listo" && e !== "listo") return false;
    if (E.tipo !== "todos" && m.tipo !== E.tipo) return false;
    if (E.buscar && !m.nombre.toLowerCase().includes(E.buscar.toLowerCase())) return false;
    return true;
  };
  const visibles = () => E.modelos.filter(pasaFiltro);
  const cuenta = (f) => E.modelos.filter((m) => (f === "tallas" ? faltanTallas(m) || porCrear(m) : estado(m).clave === f)).length;

  // ── Las piezas del ERP, con sus clases reales ──
  const CHIP = { neutro: "bg-sand text-taupe", verde: "bg-verde/15 text-verde", ambar: "bg-ambar/15 text-ambar", pizarra: "bg-pizarra/15 text-pizarra" };
  const chip = (texto, tono = "neutro", { punto = true, icono = null, title = "" } = {}) =>
    `<span data-tono="${tono}" ${title ? `title="${title}"` : ""} class="chip-cayla inline-flex items-center ${punto ? "gap-1.5" : "gap-1 font-medium"} px-2.5 py-0.5 text-xs leading-5 ${punto ? "before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-['']" : ""} whitespace-nowrap rounded-full ${CHIP[tono]}">${icono ? lucide(icono, "h-3 w-3") : ""}${texto}</span>`;
  const chipEstado = (m) => { const e = estado(m); return chip(e.texto, e.tono); };
  const barra = (pct, alto = "fina") => `<span data-alto="${alto}" data-tono="tinta" data-color-propio="" class="barra-avance" aria-hidden="true" style="--p: ${Math.min(100, Math.max(0, pct))}%; --barra-color: ${colorDeAvance(pct)};"><span class="barra-avance-lleno"></span></span>`;
  const odo = (n) => {
    const s = String(Math.max(0, Math.round(n)));
    return `<span class="rc-odo"><span class="sr-only">${miles(n)}</span><span aria-hidden="true" class="rc-odo-cifras">${[...s].map((d) => `<span class="rc-odo-cifra"><span class="rc-odo-tira" style="transform: translateY(-${d * 10}%);">${"0123456789".split("").map((x) => `<span>${x}</span>`).join("")}</span></span>`).join("")}</span></span>`;
  };
  const btn = (texto, peso = "secundario", attrs = "", { antes = "", despues = "" } = {}) =>
    `<button type="button" class="btn-cayla btn-${peso}" ${attrs}><span class="relative"><span class="inline-flex items-center gap-2">${antes}${texto}${despues}</span></span></button>`;
  const globito = (n, pide = false) => `<span class="globito" ${pide ? 'data-pide=""' : ""} aria-hidden="true">${miles(n)}</span>`;
  const mini = (m, tam = "h-11 w-11") =>
    `<div aria-hidden="true" data-color-dato="true" class="pointer-events-none relative flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg @container gap-1 p-1 ${tam}" style="background-color: ${m.lunares ? "#1d1b1a" : "rgb(229, 219, 210)"}; color: rgb(128, 92, 76); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-tinta-fija) 10%, transparent);${m.lunares ? " background-image: radial-gradient(circle, #fff 1.5px, transparent 2px); background-size: 9px 9px; color: #fff;" : ""}">${m.lunares ? "" : catIc(m.cat, "aspect-square h-auto w-1/2 min-w-5 max-w-14 shrink-0")}</div>`;
  const pildora = (texto, puesta, attrs = "", n = null) => `<button type="button" class="pildora-cayla" aria-pressed="${puesta}" ${attrs}>${texto}${n != null ? globito(n) : ""}</button>`;
  const punto = (tono) => `<span class="rc-estado-punto" data-tono="${tono}">${lucide(tono === "verde" ? "check" : tono === "ambar" ? "triangle-alert" : tono === "pizarra" ? "grid" : "circle-dashed", "h-3 w-3")}</span>`;

  /** El Dial real (ADR-0575): el aro que dice cuánto se contó de lo que dijeron, la perilla que gira, el número que rueda o se escribe. */
  function dial(m) {
    const hay = contado(m);
    const contadas = m.contadas || 0;
    const dijeron = m.dijeron;
    const pct = dijeron ? Math.min(100, (contadas / dijeron) * 100) : hay && contadas > 0 ? 100 : 0;
    const exceso = dijeron && contadas > dijeron ? Math.min(100, ((contadas - dijeron) / dijeron) * 100) : 0;
    const clase = !hay ? "" : dijeron == null ? (contadas > 0 ? "rc-dial--cuadra" : "") : contadas === dijeron ? "rc-dial--cuadra" : contadas > dijeron ? "rc-dial--sobra" : "";
    const cortes = Array.from({ length: 10 }, (_, k) => { const a = (k * 36 * Math.PI) / 180; const c = Math.cos(a), s = Math.sin(a); return `<line class="rc-dial-corte" x1="${145 + 94 * c}" y1="${145 + 94 * s}" x2="${145 + 116 * c}" y2="${145 + 116 * s}" style="--i: ${k};"></line>`; }).join("");
    const small = !hay ? (dijeron == null ? "cuenta y escribe" : `de ${miles(dijeron)}`) : dijeron == null ? "contadas" : contadas === dijeron ? `cuadra · ${miles(dijeron)}` : contadas > dijeron ? `sobran ${miles(contadas - dijeron)} · de ${miles(dijeron)}` : `faltan ${miles(dijeron - contadas)} de ${miles(dijeron)}`;
    const centro = E.editando
      ? `<input data-k="dial" class="rc-dial-caja" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" aria-label="Cuántas llegaron de ${m.nombre}" value="${hay ? contadas : ""}" placeholder="0">`
      : `<button type="button" class="rc-dial-numero" data-editar aria-label="Escribir cuántas ${m.nombre} llegaron (ahora ${contadas})">${odo(contadas)}</button>`;
    return `<div class="rc-dial ${clase}" data-cifras="${String(contadas).length}">
      <svg viewBox="0 0 290 290" aria-hidden="true" class="rc-dial-aro"><circle class="rc-dial-pista" cx="145" cy="145" r="105"></circle><circle class="rc-dial-arco" cx="145" cy="145" r="105" pathLength="100" style="stroke-dashoffset: ${100 - pct};"></circle><circle class="rc-dial-luz" cx="145" cy="145" r="101" pathLength="100" style="stroke-dashoffset: ${Math.max(4, 104 - pct)};"></circle>${cortes}<circle class="rc-dial-brillo" cx="145" cy="145" r="105" pathLength="100"></circle><circle class="rc-dial-exceso" cx="145" cy="145" r="128" pathLength="100" style="stroke-dashoffset: ${100 - exceso};"></circle><g class="rc-dial-perilla" style="transform: rotate(${pct * 3.6}deg);"><circle class="rc-dial-chispa" cx="250" cy="145" r="15"></circle><circle class="rc-dial-perilla-borde" cx="250" cy="145" r="15"></circle><circle class="rc-dial-perilla-punto" cx="250" cy="145" r="5"></circle></g></svg>
      <span aria-hidden="true" class="rc-dial-halo"></span>
      <div class="rc-dial-centro">${centro}<small aria-live="polite">${small}</small></div>
      <span aria-hidden="true" class="rc-dial-visto">${lucide("check", "h-5 w-5")}</span>
      <button type="button" aria-label="Una menos" class="rc-dial-boton rc-dial-boton--menos" data-suma="-1" ${contadas <= 0 ? "disabled" : ""}>${lucide("minus", "h-5 w-5")}</button>
      <button type="button" aria-label="Una más" class="rc-dial-boton rc-dial-boton--mas" data-suma="1">${lucide("plus", "h-5 w-5")}</button>
    </div>`;
  }

  /** El Trayecto real: cinco paradas y la bola en la actual. */
  function trayecto(parada, pct, texto) {
    const tono = pct >= 100 ? "listo" : "trabaja";
    const nombres = ["Salió", "En camino", "Contando", "Por terminar", "Recibido"];
    const paradas = nombres.map((n, j) => (j === parada ? "" : `<span class="rc-tray-parada" ${j < parada ? 'data-hecha=""' : ""} ${j === 0 || j === 4 ? 'data-extremo=""' : ""} style="left: ${j * 25}%; --j: ${j};">${j < parada ? lucide("check", "") : ""}<em>${n}</em></span>`)).join("");
    const ic = parada === 4 ? "check" : parada === 3 ? "clock" : "package-open";
    return `<div class="rc-tray-cabecera"><div class="rc-tray" data-forma="completa" data-tono="${tono}" role="img" aria-label="${nombres[parada]}${texto ? `: ${texto}` : ""}" style="--tc: ${colorDeAvance(pct)};"><div class="rc-tray-camino"><div class="rc-tray-via"><span class="rc-tray-lleno" style="width: ${parada * 25}%;"></span></div>${paradas}<span class="rc-tray-marca" style="left: ${parada * 25}%;"><span class="rc-tray-halo"></span><span class="rc-tray-bola" style="--pp: ${Math.round(pct)};">${lucide(ic, "")}</span><span class="rc-tray-texto"><b>${nombres[parada]}</b>${texto ? `<small>${texto}</small>` : ""}</span></span></div></div></div>`;
  }

  /** La cabecera real de la pantalla (EncabezadoPagina): sede · fecha · envío, el título, la vuelta y, a la derecha, el Trayecto. */
  function cabecera({ parada, pct, texto, detalle = "" }) {
    return `<header data-voz="cabecera" class="flex flex-wrap items-center justify-between gap-x-10 gap-y-5">
      <div class="anim-sube min-w-0"><div class="flex items-center gap-3"><a aria-label="Volver a Recibir mercadería" title="Volver a Recibir mercadería" data-pieza="volver" data-aviso="Vuelve a la lista de envíos de Recibir" class="group relative grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-sand bg-papel text-tinta transition-colors hover:border-tinta/40 after:absolute after:inset-0 after:rounded-full after:content-['']" href="#">${lucide("arrow-left", "h-4 w-4 transition-transform duration-200 ease-cayla group-hover:-translate-x-0.5")}</a><p class="flex min-w-0 items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-taupe-profundo"><span aria-hidden="true" class="hilo-dibuja block h-px w-8 shrink-0 bg-taupe"></span><span class="min-w-0">${D.sede} · <time>${D.fecha} · 10:45</time> · ${E.sinAviso ? "Sin aviso" : D.envio}${detalle ? ` · ${detalle}` : ""}</span></p></div><h1 class="font-display mt-3 text-4xl leading-none tracking-tight text-tinta sm:text-[46px]">Recibir mercadería<button type="button" class="ayuda-cab-q" aria-label="Qué es Recibir mercadería" data-aviso="Aquí se abre la ayuda de la pantalla"><span aria-hidden="true">?</span></button></h1></div>
      <div class="anim-sube flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-3 sm:justify-end grow basis-[20rem] sm:max-w-[28rem]" style="--i:1"><div class="w-full">${trayecto(parada, pct, texto)}</div></div>
    </header>`;
  }

  // ── Piezas compartidas de Contar ──
  const quienBoton = () => `<button type="button" class="rm-quien" data-globo="quien" aria-expanded="${E.globo === "quien"}"><span class="rm-avatar" aria-hidden="true">${D.quien.iniciales}</span>Cuenta ${D.quien.nombre}${lucide("chevron-down", "h-4 w-4")}</button>`;
  const infoBoton = () => `<button type="button" class="rm-redondo" data-globo="admin" aria-expanded="${E.globo === "admin"}" aria-label="Sobre este envío">${lucide("info", "h-[18px] w-[18px]")}</button>`;
  const globos = () => `${E.globo === "quien" ? `<div class="rm-globo rm-menu" role="menu"><p style="padding:6px 10px 8px">Cada categoría guarda quién la contó. Varias personas pueden contar a la vez; firma quien cierra.</p>${[["FA", "Felipe Alvarez", "Admin · queda a tu nombre"], ["LP", "Lucía Prueba", "Tienda Lima"]].map(([i, n, s], k) => `<button type="button" role="menuitem" style="--i:${k}" data-aviso="En el ERP aquí se elige quién cuenta (el combo Responsable)"><span class="rm-avatar">${i}</span><span><b style="display:block;font-weight:600">${n}</b><small style="color:var(--color-taupe)">${s}</small></span>${D.quien.iniciales === i ? lucide("check", "h-4 w-4 ml-auto") : ""}</button>`).join("")}</div>` : ""}
    ${E.globo === "admin" ? `<div class="rm-globo"><b>${E.sinAviso ? "Llegó sin aviso" : "Compraste esto tú: lo puedes recibir porque eres Admin"}</b><p>${E.sinAviso ? "No hay nada anotado por Compras: cuentas lo que llegó, sin «dijeron» con qué comparar. Al cerrar eliges el proveedor de cada marca." : "Al cerrar el conteo queda anotado que lo recibió quien hizo la compra, y quien revise las compras lo verá."}</p><p>Lo que cuentas se guarda solo, línea por línea. ${E.sinAviso ? "" : `Guía ${D.guia} · despachó ${D.despachadoPor}.`}</p></div>` : ""}`;
  const cerrarBoton = (c, chico = false) => btn("Revisar y cerrar", c.porContar === 0 ? "primario" : "secundario", `data-ir="cerrar" ${chico ? 'class="btn-cayla btn-chico ' + (c.porContar === 0 ? "btn-primario" : "btn-secundario") + '"' : ""} title="${c.porContar === 0 ? "Todo contado: revisa y cierra el envío" : `Faltan ${modelosTxt(c.porContar)} por contar: al cerrar te los va a pedir`}"`, { despues: lucide("arrow-right", "h-4 w-4 shrink-0") });
  const masMenu = (m) => {
    const esNueva = m.tipo === "nuevo";
    const menu = [["message-square-plus", "Anotar una observación", ""], ["triangle-alert", "Llegó algo dañado", ""], ["repeat", "Es otra prenda", ""], ["package-open", "Llevar al stock ahora", (m.contadas || 0) > 0 && !esNueva ? "" : "disabled"], ...(esNueva || m.provisional ? [["pencil", m.provisional ? "Ponerle su nombre" : "Cambiar el nombre", ""]] : []), ...(m.agregado ? [["trash-2", "Quitar este modelo", 'data-peligro=""']] : [])];
    return `<button type="button" class="rm-mas" data-menu="" aria-expanded="${E.menu}" aria-haspopup="menu">${lucide("ellipsis", "h-4 w-4")}Más</button>${E.menu ? `<div class="rm-globo rm-menu" role="menu">${menu.map(([ic, t, extra], k) => `<button type="button" role="menuitem" style="--i:${k}" ${extra} data-aviso="Aquí se abre «${t}»">${lucide(ic, "h-4 w-4")}${t}</button>`).join("")}</div>` : ""}`;
  };
  const guardadoTxt = (m) => `<span class="rm-guardado" aria-live="polite" data-estado="${E.guardando ? "guardando" : contado(m) ? "guardado" : ""}">${E.guardando ? `${lucide("rotate-ccw", "h-3.5 w-3.5")}Guardando…` : contado(m) ? `${lucide("check", "h-3.5 w-3.5")}Guardado` : ""}</span>`;
  const chipsPrenda = (m) => `${m.tipo === "nuevo" ? chip(m.provisional ? "Nuevo · sin nombre" : m.creada ? "Nuevo · ya creado" : "Nuevo · por crear", m.provisional ? "ambar" : "pizarra", { punto: false, icono: "sparkles" }) : chip("Re stock", "neutro", { punto: false, icono: "package" })}${chip(D.marca, "neutro", { punto: false, icono: "tag" })}${m.dijeron != null ? chip(`Dijeron ${miles(m.dijeron)}`, "neutro", { punto: false, icono: "file-text" }) : ""}`;
  const metaPrenda = (m) => `${m.cat} · ${E.sinAviso ? "Proveedor al cerrar" : D.proveedor}${m.costo ? ` · Costo <b>S/&nbsp;${m.costo}</b>` : ""}`;

  /** Paso 1: el Dial con sus atajos. `grande`: el aro de 264 (Mostrador). */
  function paso1Cuerpo(m, { grande = false } = {}) {
    const { hay, contadas } = pasosDe(m);
    const e = estado(m);
    const [chico, grandeN] = atajos(m.dijeron, contadas);
    const yaLlegaron = hay && m.dijeron != null && m.dijeron === contadas;
    const noLlego = hay && contadas === 0;
    return `<div class="rm-cuenta ${grande ? "rm-cuenta--grande" : ""}">${dial(m)}
      <div class="rm-cuenta-lado">
        <div class="rc-atajos">
          ${m.dijeron != null ? `<button type="button" class="rc-atajo rc-atajo-llegaron ${grande ? "rm-tile-llegaron" : ""}" data-poner="${m.dijeron}" ${yaLlegaron ? 'data-hecho="" disabled' : ""}>${lucide("check", "h-4 w-4")}Llegaron las ${miles(m.dijeron)}</button>` : ""}
          <div class="rc-suma" role="group" aria-label="Sumar de a varias"><button type="button" data-suma="${chico}">+${chico}</button><button type="button" data-suma="${grandeN}">+${grandeN}</button></div>
          ${contadas > 0 ? `<button type="button" class="rc-atajo rc-atajo-cero" data-poner="0">${lucide("rotate-ccw", "h-4 w-4")}Poner en cero</button>` : m.dijeron != null ? `<button type="button" class="rc-atajo rc-atajo-cero" data-poner="0" ${noLlego ? 'data-hecho="" disabled' : ""}>${lucide("ban", "h-4 w-4")}No llegó nada</button>` : ""}
        </div>
        <p class="rm-pista">${!hay ? "Toca el número para escribirlo, o súmalas con los botones." : noLlego ? "Anotado: no llegó nada de este modelo." : e.clave === "diferencia" && !E.sinAviso ? "No coincide con lo que dijeron: al cerrar dices qué pasó." : "Se guardó solo. Si te equivocaste, corrígelo aquí mismo."}</p>
      </div>
    </div>`;
  }
  const chipPaso1 = (m) => { const e = estado(m); const c = m.contadas || 0; return chip(E.sinAviso ? `${miles(c)} contadas` : e.clave === "diferencia" ? e.texto : c === m.dijeron ? "Cuadra" : e.texto, E.sinAviso ? "verde" : e.clave === "diferencia" ? "ambar" : "verde"); };
  /** Paso 2: dos opciones cortas y una línea de ayuda. */
  function paso2Cuerpo(m, s2, { grande = false } = {}) {
    const esNueva = m.tipo === "nuevo";
    const noLlego = contado(m) && m.contadas === 0;
    const ayuda = s2 === "espera" ? (noLlego ? "No llegó: no hay nada más que hacer con este modelo." : "Primero cuenta cuántas llegaron.")
      : m.modo === "ahora" ? (esNueva ? "Se crea la prenda y repartes lo contado: entra al stock al cerrar." : "Entra al stock al cerrar el envío, o antes si tú la llevas.")
      : "Queda guardada en el almacén. Se vende cuando le pongas tallas y colores.";
    return `<div class="rm-opciones ${grande ? "rm-opciones--grande" : ""}" role="radiogroup" aria-label="${esNueva ? "¿La creas ahora?" : "¿Le pones tallas y colores ahora?"}">
        <button type="button" role="radio" class="rc-opcion" data-modo="ahora" data-modelo="${m.id}" aria-checked="${s2 !== "espera" && m.modo === "ahora"}" ${s2 === "espera" ? "disabled" : ""}><span class="rc-radio" aria-hidden="true"></span><span>${lucide(esNueva ? "sparkles" : "grid", "h-[18px] w-[18px]")}<b>${esNueva ? "Sí, crearla ahora" : "Sí, ahora"}</b>${grande ? `<small>${esNueva ? "Se crea y entra al stock al cerrar" : "Entra al stock al cerrar"}</small>` : ""}</span></button>
        <button type="button" role="radio" class="rc-opcion" data-modo="despues" data-modelo="${m.id}" aria-checked="${s2 !== "espera" && m.modo === "despues"}" ${s2 === "espera" ? "disabled" : ""}><span class="rc-radio" aria-hidden="true"></span><span>${lucide("clock", "h-[18px] w-[18px]")}<b>Después, solo la cantidad</b>${grande ? `<small>Queda guardada; no se vende aún</small>` : ""}</span></button>
      </div>
      <p class="rm-paso-ayuda">${ayuda}</p>`;
  }
  const chipPaso2 = (m) => chip(m.modo === "ahora" ? (m.tipo === "nuevo" ? "Crearla ahora" : "Ahora") : "Después", m.modo === "ahora" ? "verde" : "pizarra", { punto: false, icono: m.modo === "ahora" ? "grid" : "clock" });
  /** Paso 3: la tabla de tallas y colores con su barra, o crear la prenda nueva. */
  function matriz(m) {
    const contadas = m.contadas || 0, rep = repartidas(m), falta = contadas - rep;
    const filas = m.colores.map(([n, hex], j) => {
      const tot = m.tallas.reduce((a, t) => a + (m.rep[`${n}|${t}`] || 0), 0);
      return `<tr style="--j:${j}"><td><span class="rc-color"><i class="inline-block h-3 w-3 rounded-full" style="background:${hex}; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-tinta-fija) 25%, transparent)"></i>${n}</span></td>${m.tallas.map((t) => `<td><input class="rc-celda" data-k="rep:${n}|${t}" data-modelo="${m.id}" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" placeholder="0" aria-label="Cuántas llegaron de ${n} en ${t}" value="${m.rep[`${n}|${t}`] || ""}" ${E.recienCelda === `${m.id}:${n}|${t}` ? 'data-recien=""' : ""}></td>`).join("")}<td class="rc-fila-total">${tot}</td><td><button type="button" class="icono-fila grid h-8 w-8 place-items-center" aria-label="Quitar ${n}" title="Quitar ${n}" data-quitar-color="${n}" data-modelo="${m.id}">${lucide("x", "h-4 w-4")}</button></td></tr>`;
    }).join("");
    const pctRep = contadas ? (rep / contadas) * 100 : 0;
    return `<div class="rc-matriz-caja scroll-cayla"><table class="rc-tabla-tallas"><thead><tr><th scope="col">Color</th>${m.tallas.map((t) => `<th scope="col"><span class="rc-talla"><span>${t}</span><button type="button" class="rc-talla-quitar" aria-label="Quitar la talla ${t}" title="Quitar la talla ${t}" data-quitar-talla="${t}" data-modelo="${m.id}">${lucide("x", "h-3 w-3")}</button></span></th>`).join("")}<th scope="col">Total</th><th scope="col"><span class="sr-only">Quitar</span></th></tr></thead><tbody>${filas}</tbody></table></div>
      <div class="rm-reparto">
        <div class="rm-reparto-botones">${btn("Color", "secundario", `class="btn-cayla btn-secundario btn-chico" data-agregar-color="" data-modelo="${m.id}"`, { antes: lucide("plus", "h-4 w-4") })}${btn("Talla", "secundario", `class="btn-cayla btn-secundario btn-chico" data-agregar-talla="" data-modelo="${m.id}"`, { antes: lucide("plus", "h-4 w-4") })}</div>
        <div class="rm-reparto-avance" aria-live="polite"><p><b>Repartiste ${miles(rep)} de ${miles(contadas)}</b><span data-tono="${falta > 0 ? "" : falta < 0 ? "ambar" : "verde"}">${falta > 0 ? `faltan ${miles(falta)}` : falta < 0 ? `te pasaste por ${miles(-falta)}` : "completo"}</span></p>${barra(Math.min(100, pctRep), "fina")}</div>
      </div>
      ${falta > 0 && rep > 0 ? `<p class="rm-paso-ayuda">¿En total solo llegaron ${miles(rep)}? <button type="button" class="btn-cayla btn-enlace" data-poner="${rep}" data-modelo="${m.id}">Corregir lo contado a ${miles(rep)}</button></p>` : falta === 0 && rep > 0 ? `<p class="rm-paso-ayuda">Listo: <b>${m.nombre}</b> entra al stock al cerrar el envío.</p>` : ""}`;
  }
  function crearCuerpo(m) {
    return `<p class="rm-paso-ayuda" style="margin-top:0">Si ya existe en el catálogo, la eliges; si no, se crea con su foto, precio y tallas. Después repartes las ${miles(m.contadas || 0)}.</p>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">${btn(m.creada ? `Ver ${m.nombre}` : "Crear la prenda", m.creada ? "secundario" : "primario", 'data-aviso="Aquí se abre «Nueva prenda» con el nombre y la categoría ya puestos"', { antes: lucide("sparkles", "h-4 w-4") })}${btn("Ya existe: elegirla", "secundario", 'data-aviso="Aquí se busca en el catálogo"', { antes: lucide("search", "h-4 w-4") })}</div>`;
  }
  const num = (n, s) => `<span class="rm-paso-num" aria-hidden="true">${s === "hecho" ? lucide("check", "") : n}</span>`;
  const sigueAqui = `<span class="hilo-etiqueta">Sigue aquí</span>`;
  /** Los tres pasos apilados (la placa de A). `sinPaso3`: el reparto vive en otra columna. */
  function pasos(m, { sinPaso3 = false } = {}) {
    const p = pasosDe(m);
    const esNueva = m.tipo === "nuevo";
    const paso1 = `<div class="rm-paso" data-key="paso-1" data-estado="${p.s1}" style="--i:0">${num(1, p.s1)}<div class="rm-paso-titulo"><h3>¿Cuántas llegaron?</h3>${p.s1 === "ahora" ? sigueAqui : chipPaso1(m)}</div><div class="rm-paso-cuerpo">${paso1Cuerpo(m)}</div></div>`;
    const paso2 = `<div class="rm-paso" data-key="paso-2" data-estado="${p.s2}" style="--i:1">${num(2, p.s2)}<div class="rm-paso-titulo"><h3>${esNueva ? "¿La creas ahora?" : "¿Le pones tallas y colores ahora?"}</h3>${p.s2 === "hecho" ? chipPaso2(m) : ""}</div><div class="rm-paso-cuerpo">${paso2Cuerpo(m, p.s2)}</div></div>`;
    let paso3 = "";
    if (p.hayPaso3 && !sinPaso3) {
      paso3 = esNueva
        ? `<div class="rm-paso" data-key="paso-3n" data-estado="${p.s3}" style="--i:2">${num(3, p.s3)}<div class="rm-paso-titulo"><h3>Crea ${m.nombre}</h3>${p.s3 === "ahora" ? sigueAqui : chip("Creada", "verde")}</div><div class="rm-paso-cuerpo">${crearCuerpo(m)}</div></div>`
        : `<div class="rm-paso" data-key="paso-3" data-estado="${p.s3}" style="--i:2">${num(3, p.s3)}<div class="rm-paso-titulo"><h3>Reparte las ${miles(p.contadas)} por talla y color</h3>${p.s3 === "ahora" ? sigueAqui : chip("Repartidas", "verde")}</div><div class="rm-paso-cuerpo">${matriz(m)}</div></div>`;
    } else if (p.hayPaso3 && sinPaso3) {
      paso3 = `<div class="rm-paso" data-key="paso-3l" data-estado="${p.s3}" style="--i:2">${num(3, p.s3)}<div class="rm-paso-titulo"><h3>${esNueva ? `Crea ${m.nombre}` : `Reparte las ${miles(p.contadas)}`}</h3>${p.s3 === "ahora" ? `<span class="rm-flecha-lado">${sigueAqui}${lucide("arrow-right", "h-4 w-4")}</span>` : chip(esNueva ? "Creada" : "Repartidas", "verde")}</div><div class="rm-paso-cuerpo"><p class="rm-paso-ayuda" style="margin-top:0">${esNueva ? "A la derecha: crea la prenda o elígela del catálogo." : `A la derecha: la tabla de tallas y colores. Repartiste ${miles(repartidas(m))} de ${miles(p.contadas)}.`}</p></div></div>`;
    }
    return `<div class="rm-pasos">${paso1}${paso2}${paso3}</div>`;
  }
  const pieNav = (m, { grande = false } = {}) => {
    const i = E.modelos.indexOf(m), ant = E.modelos[i - 1] || null, sig = E.modelos[i + 1] || null, hay = contado(m);
    return `<div class="rm-pie ${grande ? "rm-pie--grande" : ""}">
      ${btn("Anterior", "secundario", `data-mover="-1" ${ant ? `title="Antes: ${ant.nombre}"` : "disabled"}`, { antes: lucide("arrow-left", "h-4 w-4 shrink-0") })}
      <span class="rm-pie-sigue">${sig ? `Sigue: <b>${sig.nombre}</b>` : "Es el último modelo"}${grande ? ` <kbd class="rm-kbd">Enter</kbd>` : ""}</span>
      ${sig ? btn(hay ? "Listo, siguiente" : "Siguiente", hay ? "primario" : "secundario", `data-mover="1" title="Sigue ${sig.nombre}"`, { despues: lucide("arrow-right", "h-4 w-4 shrink-0") }) : btn("Revisar y cerrar", "primario", 'data-ir="cerrar"', { despues: lucide("arrow-right", "h-4 w-4 shrink-0") })}
    </div>`;
  };
  /** La lista de categorías con sus modelos (la de A y la hoja del celular). */
  function lista({ conFiltros = true } = {}) {
    const vis = visibles();
    const tipoTxt = { todos: "Tipo", restock: "Solo re stock", nuevo: "Solo nuevos" }[E.tipo];
    const secciones = cats().map((cat, i) => {
      const todos = E.modelos.filter((m) => m.cat === cat);
      const suyos = vis.filter((m) => m.cat === cat);
      if (!suyos.length) return "";
      const d = todos.reduce((a, m) => a + (m.dijeron || 0), 0), k = todos.reduce((a, m) => a + (m.contadas || 0), 0);
      const porContar = todos.filter((m) => !contado(m)).length;
      const pct = E.sinAviso ? (porContar ? 0 : 100) : d ? (k / d) * 100 : 0;
      const resumen = E.sinAviso ? `${prendas(k)} contadas${porContar ? ` · ${porContar} por contar` : ""}` : `Contaste <b>${miles(k)}</b> de ${miles(d)}${porContar ? ` · ${porContar} por contar` : k === d ? " · cuadra" : k < d ? ` · faltan ${miles(d - k)}` : ` · sobran ${miles(k - d)}`}`;
      const abierta = suyos.some((m) => m.id === E.actual) || E.filtro !== "todos" || !!E.buscar;
      return `<div class="rc-cat" data-key="cat-${cat}" ${abierta ? 'data-abierta=""' : ""} style="--i: ${i}; --cat: ${catColor(cat)};">
        <div class="rc-cat-tira"><button type="button" class="rc-cat-cabeza" data-cat="${cat}" aria-expanded="${abierta}"><span class="rc-cat-ic" data-tamano="chico" aria-hidden="true">${catIc(cat)}</span><span class="rc-cat-textos"><b>${cat}</b><span class="rc-cat-resumen">${resumen}</span><span class="rc-cat-barra">${barra(pct, "fina")}</span></span><span aria-hidden="true" class="rc-cat-hueco-mas"></span>${lucide("chevron-down", "rc-cat-flecha h-4 w-4")}</button><button type="button" class="rc-cat-mas mov-boton" aria-label="Agregar otro modelo de ${cat}" title="Agregar otro modelo" data-aviso="Aquí se abre «Agregar un modelo a ${cat}»">${lucide("plus", "h-4 w-4")}</button></div>
        <div class="rc-cat-cuerpo"><div class="rc-cat-dentro"><ul class="rc-modelos">${suyos.map((m) => `<li class="rc-modelo-fila" data-key="mod-${m.id}"><button type="button" class="rc-modelo" data-modelo="${m.id}" ${m.id === E.actual ? 'data-activa="" aria-current="true"' : ""} ${E.recien === m.id ? 'data-recien=""' : ""}>${mini(m)}<span class="rc-modelo-textos"><span class="rc-modelo-nombre"><b title="${m.nombre}">${m.nombre}</b>${m.tipo === "nuevo" ? chip("Nuevo", "pizarra", { punto: false, icono: "sparkles" }) : ""}</span><span class="rc-modelo-cifras"><b>${miles(m.contadas || 0)}</b>${m.dijeron != null ? ` de ${miles(m.dijeron)}` : " contadas"}${m.costo ? ` · S/ ${m.costo}` : ""}</span></span>${chipEstado(m)}</button></li>`).join("")}</ul></div></div>
      </div>`;
    }).join("");
    return `<section class="rc-panel rc-lista" aria-label="${E.sinAviso ? "Lo que llegó" : "Categorías del envío"}" style="--i: 0;">
      <div class="rc-lista-cabeza">
        <div class="titulo-seccion"><h2 class="titulo-seccion-texto">${E.sinAviso ? "Lo que llegó" : "Categorías del envío"}</h2><span class="titulo-seccion-lado"><span class="titulo-seccion-dato">${modelosTxt(E.modelos.length)}</span></span></div>
        <div class="buscador">${lucide("search", "buscador-icono")}<input data-k="buscar" autocomplete="off" spellcheck="false" placeholder="Buscar un modelo…" aria-label="Buscar modelo" type="search" value="${E.buscar}"><span class="buscador-senal" aria-hidden="true">Buscando…</span><kbd class="buscador-atajo" aria-hidden="true">/</kbd><span class="buscador-hilo" aria-hidden="true"></span></div>
        ${conFiltros ? `<div class="rm-filtros" role="group" aria-label="Filtrar la lista">${pildora("Todos", E.filtro === "todos", 'data-filtro="todos"', E.modelos.length)}${pildora("Por contar", E.filtro === "por-contar", 'data-filtro="por-contar"', cuenta("por-contar"))}${E.sinAviso ? "" : pildora("Con diferencia", E.filtro === "diferencia", 'data-filtro="diferencia"', cuenta("diferencia"))}${pildora("Faltan tallas", E.filtro === "tallas", 'data-filtro="tallas"', cuenta("tallas"))}${pildora(tipoTxt, E.tipo !== "todos", 'data-tipo=""', null)}</div>` : ""}
      </div>
      <div class="rc-scroll scroll-cayla"><nav aria-label="Categorías del envío">${secciones || `<p class="px-5 py-6 text-sm text-taupe">Nada con ese filtro. <button type="button" class="btn-cayla btn-enlace" data-filtro="todos">Ver todos</button></p>`}</nav>
        <div class="rc-lista-agregar">${btn("Agregar categoría", "secundario", 'data-aviso="Aquí se abre «Agregar categoría»" class="btn-cayla btn-secundario rc-acord-agregar"', { antes: lucide("plus", "h-4 w-4") })}</div>
      </div>
    </section>`;
  }
  const isla = (c) => { const m = actual(); const i = E.modelos.indexOf(m); return `<div class="rm-isla" role="region" aria-label="La lista"><div><b>${c.porContar ? `${modelosTxt(c.porContar)} por contar` : "Todos contados"}</b><small>${miles(i + 1)} de ${modelosTxt(E.modelos.length)} · ${miles(c.contadas)}${c.dijeron != null ? ` de ${miles(c.dijeron)}` : ""} prendas</small></div><button type="button" data-hoja="">${lucide("list-checks", "h-4 w-4")} Lista</button></div>`; };
  const hojaLista = () => (E.hoja ? `<div class="rm-hoja" data-cerrar-hoja="">${lista().replace('class="rc-panel rc-lista"', 'class="rc-panel rc-lista" data-hoja-panel=""')}<span class="rm-hoja-asa" aria-hidden="true"></span></div>` : "");
  const cabeceraContar = (c) => cabecera({ parada: 2, pct: c.pct, texto: c.dijeron != null ? `${miles(c.contadas)} de ${miles(c.dijeron)}` : `${miles(c.contadas)} contadas` });

  // ── A · Mesa de tres: la lista, la prenda y, a la derecha, el reparto (o lo que sigue). Arriba, el mando con los cuatro estados como fichas. ──
  function contarA() {
    const c = cifras();
    const m = actual();
    const p = pasosDe(m);
    const todo = c.porContar === 0;
    const ficha = (f, texto, n, tono) => `<button type="button" class="rm-a-ficha" data-filtro="${f}" data-tono="${tono}" aria-pressed="${E.filtro === f}"><b>${miles(n)}</b><span>${texto}</span></button>`;
    const mando = `<div class="rm-mando rm-a-mando">
      <div class="rm-mando-avance" aria-live="polite"><p><b>${odo(c.contadas)}${c.dijeron != null ? ` de ${miles(c.dijeron)}` : ""} prendas contadas${c.diferencia != null && c.diferencia !== 0 && todo ? ` <span class="rm-mando-estado" data-tono="ambar">(${signo(c.diferencia)})</span>` : ""}</b><span class="rm-mando-estado" data-tono="${todo ? "verde" : ""}">${todo ? "Todo contado" : `faltan ${modelosTxt(c.porContar)}`}</span></p>${barra(c.pct, "normal")}</div>
      <div class="rm-a-fichas" role="group" aria-label="Cómo va cada modelo">${ficha("por-contar", "por contar", c.porContar, "neutro")}${E.sinAviso ? "" : ficha("diferencia", "con diferencia", c.conDiferencia, "ambar")}${ficha("tallas", "faltan tallas", c.sinTallas, "pizarra")}${ficha("listo", "listas", c.listas, "verde")}</div>
      <div class="rm-mando-acciones">${quienBoton()}${infoBoton()}${cerrarBoton(c)}${globos()}</div>
    </div>`;
    let lado;
    if (p.hayPaso3 && m.tipo === "restock") lado = `<section class="rc-panel rm-a-lado" data-key="lado-rep-${m.id}" style="--i:2;--cat:${catColor(m.cat)}" aria-label="Reparte por talla y color"><div class="rc-scroll scroll-cayla"><div class="rm-a-lado-cuerpo"><div class="rm-paso-titulo"><span class="rm-paso-num" data-estado="${p.s3}" aria-hidden="true">${p.s3 === "hecho" ? lucide("check", "") : "3"}</span><h3>Reparte las ${miles(p.contadas)}</h3>${p.s3 === "ahora" ? sigueAqui : chip("Repartidas", "verde")}</div><p class="rm-placa-meta" style="margin:2px 0 12px">Por talla y color: lo que escribas aquí entra al stock al cerrar.</p>${matriz(m)}</div></div></section>`;
    else if (p.hayPaso3) lado = `<section class="rc-panel rm-a-lado" data-key="lado-crear-${m.id}" style="--i:2;--cat:${catColor(m.cat)}" aria-label="Crea la prenda"><div class="rc-scroll scroll-cayla"><div class="rm-a-lado-cuerpo"><div class="rm-paso-titulo"><span class="rm-paso-num" data-estado="${p.s3}" aria-hidden="true">${p.s3 === "hecho" ? lucide("check", "") : "3"}</span><h3>Crea ${m.nombre}</h3>${p.s3 === "ahora" ? sigueAqui : chip("Creada", "verde")}</div><div style="margin-top:10px">${crearCuerpo(m)}</div></div></div></section>`;
    else {
      const sig = E.modelos.filter((x) => x.id !== m.id && !contado(x)).slice(0, 4);
      lado = `<section class="rc-panel rm-a-lado" data-key="lado-sigue" style="--i:2" aria-label="Lo que sigue"><div class="rc-scroll scroll-cayla"><div class="rm-a-lado-cuerpo">
        <div class="titulo-seccion"><h2 class="titulo-seccion-texto">${sig.length ? "Lo que sigue" : "Todo contado"}</h2><span class="titulo-seccion-lado"><span class="titulo-seccion-dato">${sig.length ? modelosTxt(c.porContar) + " por contar" : ""}</span></span></div>
        ${sig.length ? `<div class="rm-a-cola">${sig.map((x, i) => `<button type="button" class="rm-a-cola-fila" data-modelo="${x.id}" style="--i:${i}">${mini(x)}<span><b>${x.nombre}</b><small>${x.cat}${x.dijeron != null ? ` · dijeron ${miles(x.dijeron)}` : ""}</small></span>${lucide("arrow-right", "h-4 w-4")}</button>`).join("")}</div>` : `<p class="rm-paso-ayuda">No queda nada por contar. Revisa lo que no cuadró y cierra el envío.</p>`}
        <div class="rm-a-cierre"><p class="rm-etiqueta-chica">Al cerrar</p><div class="rm-a-cierre-filas"><p>${punto("verde")}<span>Entran al stock</span><b>${miles(c.entran)}</b></p><p>${punto("pizarra")}<span>Quedan para después</span><b>${miles(c.despues)}</b></p>${c.diferencia != null ? `<p>${punto(c.diferencia ? "ambar" : "verde")}<span>Diferencia</span><b>${signo(c.diferencia)}</b></p>` : ""}</div>${btn("Revisar y cerrar", todo ? "primario" : "secundario", 'data-ir="cerrar" style="width:100%"', { despues: lucide("arrow-right", "h-4 w-4 shrink-0") })}</div>
      </div></div></section>`;
    }
    const placa = `<section class="rc-panel rc-placa" aria-label="Lo que estás contando" style="--i: 1; --cat: ${catColor(m.cat)}">
      <div class="rc-scroll scroll-cayla" data-key="placa-${m.id}">
        <div class="rc-placa-cabeza rm-a-cabeza">${mini(m, "h-[84px] w-[84px]")}<div class="rc-placa-textos"><div class="titulo-seccion"><h2 class="titulo-seccion-texto">${m.nombre}</h2></div><p class="rm-placa-meta">${metaPrenda(m)}</p><div class="rc-chips">${chipsPrenda(m)}</div></div><div class="rm-placa-derecha">${guardadoTxt(m)}${masMenu(m)}</div></div>
        ${pasos(m, { sinPaso3: true })}
      </div>${pieNav(m)}</section>`;
    return `<div class="space-y-6">${cabeceraContar(c)}</div><div class="rm-conteo">${mando}<div class="rm-mesa rm-mesa--tres">${lista()}${placa}${lado}</div></div>${isla(c)}${hojaLista()}`;
  }

  // ── B · Tablero: todos los modelos a la vista, se cuenta en cada tarjeta; a la derecha, el cierre vivo. ──
  function contarB() {
    const c = cifras();
    const vis = visibles();
    const seg = (f, t, n) => `<button type="button" class="rm-b-seg" data-filtro="${f}" aria-pressed="${E.filtro === f}">${t}${globito(n)}</button>`;
    const barraArriba = `<div class="rm-b-barra">
      <div class="rm-b-avance"><b>${odo(c.contadas)}${c.dijeron != null ? `<span> de ${miles(c.dijeron)}</span>` : ""}</b><div><span>prendas contadas${c.porContar ? ` · faltan ${modelosTxt(c.porContar)}` : " · todo contado"}</span>${barra(c.pct, "normal")}</div></div>
      <div class="rm-b-segs" role="group" aria-label="Filtrar">${seg("todos", "Todos", E.modelos.length)}${seg("por-contar", "Por contar", c.porContar)}${E.sinAviso ? "" : seg("diferencia", "Con diferencia", c.conDiferencia)}${seg("tallas", "Faltan tallas", c.sinTallas)}${seg("listo", "Listas", c.listas)}</div>
      <div class="rm-mando-acciones">${quienBoton()}${infoBoton()}${globos()}</div>
    </div>`;
    const tarjeta = (m, i) => {
      const p = pasosDe(m);
      const e = estado(m);
      const abierta = E.abiertaB === m.id;
      const [chico] = atajos(m.dijeron, p.contadas);
      const yaLlegaron = p.hay && m.dijeron != null && m.dijeron === p.contadas;
      const esNueva = m.tipo === "nuevo";
      return `<article class="rm-b-card" data-key="card-${m.id}" data-estado="${e.clave}" data-modelo-card="${m.id}" ${abierta ? 'data-abierta=""' : ""} ${E.recien === m.id ? 'data-recien=""' : ""} style="--i:${i}; --cat:${catColor(m.cat)}">
        <div class="rm-b-card-cab">${mini(m, "h-14 w-14")}<div class="rm-b-card-textos"><b>${m.nombre}</b><span>${m.tipo === "nuevo" ? chip("Nuevo", "pizarra", { punto: false, icono: "sparkles" }) : chip("Re stock", "neutro", { punto: false, icono: "package" })}${m.dijeron != null ? ` dijeron <b>${miles(m.dijeron)}</b>` : ""}${m.costo ? ` · S/ ${m.costo}` : ""}</span></div>${chipEstado(m)}</div>
        <div class="rm-b-contar">
          <button type="button" class="rm-b-paso" data-suma="-1" data-modelo="${m.id}" aria-label="Una menos" ${p.contadas <= 0 ? "disabled" : ""}>${lucide("minus", "h-5 w-5")}</button>
          <label class="rm-b-numero"><input data-k="num" data-modelo="${m.id}" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" placeholder="0" aria-label="Cuántas llegaron de ${m.nombre}" value="${p.hay ? p.contadas : ""}"><small>${m.dijeron != null ? (p.hay ? (p.contadas === m.dijeron ? "cuadra" : p.contadas < m.dijeron ? `faltan ${miles(m.dijeron - p.contadas)}` : `sobran ${miles(p.contadas - m.dijeron)}`) : `de ${miles(m.dijeron)}`) : "contadas"}</small></label>
          <button type="button" class="rm-b-paso rm-b-paso--mas" data-suma="1" data-modelo="${m.id}" aria-label="Una más">${lucide("plus", "h-5 w-5")}</button>
        </div>
        <div class="rm-b-atajos">${m.dijeron != null ? `<button type="button" class="rc-atajo rc-atajo-llegaron" data-poner="${m.dijeron}" data-modelo="${m.id}" ${yaLlegaron ? 'data-hecho="" disabled' : ""}>${lucide("check", "h-4 w-4")}Llegaron las ${miles(m.dijeron)}</button>` : ""}<button type="button" class="rm-b-mas5" data-suma="${chico}" data-modelo="${m.id}">+${chico}</button>${p.contadas > 0 ? `<button type="button" class="rm-b-cero" data-poner="0" data-modelo="${m.id}" title="Poner en cero">${lucide("rotate-ccw", "h-4 w-4")}</button>` : m.dijeron != null ? `<button type="button" class="rm-b-cero" data-poner="0" data-modelo="${m.id}" title="No llegó nada">${lucide("ban", "h-4 w-4")}</button>` : ""}</div>
        <div class="rm-b-card-pie">
          <div class="rm-b-modo" role="radiogroup" aria-label="${esNueva ? "¿La creas ahora?" : "Tallas y colores"}"><button type="button" role="radio" data-modo="ahora" data-modelo="${m.id}" aria-checked="${p.s2 !== "espera" && m.modo === "ahora"}" ${p.s2 === "espera" ? "disabled" : ""}>${lucide(esNueva ? "sparkles" : "grid", "h-3.5 w-3.5")}${esNueva ? "Crear ahora" : "Tallas ahora"}</button><button type="button" role="radio" data-modo="despues" data-modelo="${m.id}" aria-checked="${p.s2 !== "espera" && m.modo === "despues"}" ${p.s2 === "espera" ? "disabled" : ""}>${lucide("clock", "h-3.5 w-3.5")}Después</button></div>
          ${p.hayPaso3 ? `<button type="button" class="rm-b-abrir" data-abrir="${m.id}" aria-expanded="${abierta}">${esNueva ? (m.creada ? "Creada" : "Crear la prenda") : p.s3 === "hecho" ? "Repartidas" : `Repartir ${miles(repartidas(m))} de ${miles(p.contadas)}`}${lucide("chevron-down", "h-4 w-4")}</button>` : `<button type="button" class="rm-b-abrir" data-menu-card="${m.id}" data-aviso="Aquí se abre «Más»: observación, dañado, es otra prenda">${lucide("ellipsis", "h-4 w-4")}</button>`}
        </div>
        ${abierta && p.hayPaso3 ? `<div class="rm-b-matriz">${esNueva ? crearCuerpo(m) : matriz(m)}</div>` : ""}
      </article>`;
    };
    const grupos = cats().map((cat) => {
      const todos = E.modelos.filter((m) => m.cat === cat), suyos = vis.filter((m) => m.cat === cat);
      if (!suyos.length) return "";
      const d = todos.reduce((a, m) => a + (m.dijeron || 0), 0), k = todos.reduce((a, m) => a + (m.contadas || 0), 0);
      const porContar = todos.filter((m) => !contado(m)).length;
      const pct = E.sinAviso ? (porContar ? 0 : 100) : d ? (k / d) * 100 : 0;
      return `<section class="rm-b-grupo" data-key="grupo-${cat}" style="--cat:${catColor(cat)}"><div class="rm-b-grupo-cab"><span class="rc-cat-ic" data-tamano="chico" aria-hidden="true">${catIc(cat)}</span><h2>${cat}</h2><span class="rm-b-grupo-cifra">${E.sinAviso ? `${prendas(k)} contadas` : `Contaste <b>${miles(k)}</b> de ${miles(d)}`}${porContar ? ` · ${porContar} por contar` : ""}</span><span class="rm-b-grupo-barra">${barra(pct, "fina")}</span>${btn("Modelo", "secundario", `class="btn-cayla btn-secundario btn-chico" data-aviso="Aquí se abre «Agregar un modelo a ${cat}»"`, { antes: lucide("plus", "h-4 w-4") })}</div><div class="rm-b-cards">${suyos.map(tarjeta).join("")}</div></section>`;
    }).join("");
    const R = 44, L = 2 * Math.PI * R;
    const rail = `<aside class="rm-b-rail" aria-label="El cierre">
      <div class="rm-b-rail-anillo"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="pista" cx="50" cy="50" r="${R}"></circle><circle class="arco" cx="50" cy="50" r="${R}" stroke-dasharray="${L}" stroke-dashoffset="${L * (1 - c.pct / 100)}" style="stroke:${colorDeAvance(c.pct)}"></circle></svg><div><b>${Math.round(c.pct)}%</b><span>${miles(c.contadas)}${c.dijeron != null ? ` de ${miles(c.dijeron)}` : ""}</span></div></div>
      <div class="rm-b-rail-estados">${[["por-contar", "Por contar", c.porContar, "neutro"], ...(E.sinAviso ? [] : [["diferencia", "Con diferencia", c.conDiferencia, "ambar"]]), ["tallas", "Faltan tallas", c.sinTallas, "pizarra"], ["listo", "Listas", c.listas, "verde"]].map(([f, t, n, tono]) => `<button type="button" class="rc-estado" data-filtro="${f}" aria-pressed="${E.filtro === f}">${punto(tono)}<span class="rc-estado-nombre">${t}</span><b>${miles(n)}</b></button>`).join("")}</div>
      <div class="rm-b-rail-cierre"><p class="rm-etiqueta-chica">Al cerrar</p><p><span>Entran al stock</span><b>${miles(c.entran)}</b></p><p><span>Para después</span><b>${miles(c.despues)}</b></p>${c.diferencia != null ? `<p><span>Diferencia</span><b data-tono="${c.diferencia ? "ambar" : ""}">${signo(c.diferencia)}</b></p>` : ""}</div>
      ${btn("Revisar y cerrar", c.porContar === 0 ? "primario" : "secundario", 'data-ir="cerrar" style="width:100%"', { despues: lucide("arrow-right", "h-4 w-4 shrink-0") })}
      <p class="rm-b-rail-nota">${c.porContar ? `Faltan ${modelosTxt(c.porContar)} por contar: al cerrar te los va a pedir.` : "Todo contado. Lo que no cuadró lo dices al cerrar."}</p>
    </aside>`;
    return `<div class="space-y-6">${cabeceraContar(c)}</div><div class="rm-conteo rm-b">${barraArriba}<div class="rm-b-cuerpo"><div class="rm-b-tablero">${grupos || `<p class="rm-paso-ayuda">Nada con ese filtro.</p>`}</div>${rail}</div></div>`;
  }

  // ── C · Mostrador: una prenda a la vez, grande; arriba la tira de modelos; a la derecha el talón de lo contado. ──
  function contarC() {
    const c = cifras();
    const m = actual();
    const p = pasosDe(m);
    const i = E.modelos.indexOf(m);
    const esNueva = m.tipo === "nuevo";
    const tira = `<div class="rm-c-tira">
      <button type="button" class="rm-c-flecha" data-mover="-1" aria-label="Anterior" ${i === 0 ? "disabled" : ""}>${lucide("chevron-left", "h-5 w-5")}</button>
      <div class="rm-c-pelicula" role="tablist" aria-label="Los modelos del envío">${E.modelos.map((x, k) => { const e = estado(x); return `<button type="button" role="tab" class="rm-c-foto" data-modelo="${x.id}" data-estado="${e.clave}" aria-selected="${x.id === m.id}" title="${x.nombre} · ${e.texto}" style="--i:${k}; --cat:${catColor(x.cat)}">${mini(x, "h-10 w-10")}<span><b>${x.nombre}</b><small>${x.cat}${x.dijeron != null ? ` · ${miles(x.contadas || 0)} de ${miles(x.dijeron)}` : contado(x) ? ` · ${miles(x.contadas)}` : ""}</small></span><i class="rm-c-punto" data-tono="${e.tono}" aria-hidden="true">${e.clave === "listo" ? lucide("check", "h-3 w-3") : e.clave === "diferencia" ? "!" : ""}</i></button>`; }).join("")}</div>
      <button type="button" class="rm-c-flecha" data-mover="1" aria-label="Siguiente" ${i === E.modelos.length - 1 ? "disabled" : ""}>${lucide("chevron-right", "h-5 w-5")}</button>
      <span class="rm-c-posicion"><b>${i + 1}</b> de ${E.modelos.length}</span>
    </div>`;
    const escenario = `<section class="rm-c-escenario" data-key="escenario-${m.id}" style="--cat:${catColor(m.cat)}" aria-label="Lo que estás contando">
      <div class="rm-c-cabeza">${mini(m, "h-[120px] w-[120px]")}<div class="rm-c-cabeza-textos"><p class="rm-etiqueta-chica" style="color:var(--cat)">${m.cat}${esNueva ? " · nuevo" : " · re stock"}</p><h2>${m.nombre}</h2><p class="rm-placa-meta">${E.sinAviso ? "Proveedor al cerrar" : D.proveedor}${m.costo ? ` · Costo <b>S/&nbsp;${m.costo}</b>` : ""}${m.dijeron != null ? ` · Dijeron <b>${miles(m.dijeron)}</b>` : ""}</p></div><div class="rm-placa-derecha">${guardadoTxt(m)}${masMenu(m)}</div></div>
      <div class="rm-c-bloque" data-estado="${p.s1}"><div class="rm-c-bloque-tit">${num(1, p.s1)}<h3>¿Cuántas llegaron?</h3>${p.s1 === "ahora" ? sigueAqui : chipPaso1(m)}</div>${paso1Cuerpo(m, { grande: true })}</div>
      <div class="rm-c-bloque" data-estado="${p.s2}"><div class="rm-c-bloque-tit">${num(2, p.s2)}<h3>${esNueva ? "¿La creas ahora?" : "¿Tallas y colores ahora?"}</h3>${p.s2 === "hecho" ? chipPaso2(m) : ""}</div>${paso2Cuerpo(m, p.s2, { grande: true })}</div>
      ${p.hayPaso3 ? `<div class="rm-c-bloque" data-estado="${p.s3}" data-key="bloque3-${m.id}"><div class="rm-c-bloque-tit">${num(3, p.s3)}<h3>${esNueva ? `Crea ${m.nombre}` : `Reparte las ${miles(p.contadas)} por talla y color`}</h3>${p.s3 === "ahora" ? sigueAqui : chip(esNueva ? "Creada" : "Repartidas", "verde")}</div>${esNueva ? crearCuerpo(m) : matriz(m)}</div>` : ""}
      ${pieNav(m, { grande: true })}
    </section>`;
    const talon = `<aside class="rm-c-talon" aria-label="Lo contado hasta ahora">
      <div class="rm-c-talon-cab"><span class="rm-c-talon-ic">${lucide("receipt", "h-[18px] w-[18px]")}</span><div><b>${E.sinAviso ? "Sin aviso" : D.envio}</b><small>${D.sede} · ${E.sinAviso ? "sin guía" : D.guia}</small></div></div>
      <ol class="rm-c-talon-lineas">${E.modelos.map((x, k) => { const e = estado(x); return `<li data-key="talon-${x.id}" style="--i:${k}"><button type="button" data-modelo="${x.id}" aria-current="${x.id === m.id}"><i class="rm-c-punto" data-tono="${e.tono}" aria-hidden="true">${e.clave === "listo" ? lucide("check", "h-3 w-3") : e.clave === "diferencia" ? "!" : ""}</i><span><b>${x.nombre}</b><small>${e.texto}${entraAlStock(x) ? " · entra al stock" : contado(x) && x.contadas > 0 && !entraAlStock(x) ? " · para después" : ""}</small></span><b class="rm-c-talon-n">${contado(x) ? miles(x.contadas) : "—"}${x.dijeron != null ? `<small>/${miles(x.dijeron)}</small>` : ""}</b></button></li>`; }).join("")}</ol>
      <div class="rm-c-talon-total"><p><span>Contadas</span><b>${odo(c.contadas)}${c.dijeron != null ? `<small> de ${miles(c.dijeron)}</small>` : ""}</b></p>${barra(c.pct, "fina")}<p><span>Entran al stock</span><b>${miles(c.entran)}</b></p><p><span>Para después</span><b>${miles(c.despues)}</b></p>${c.diferencia != null ? `<p><span>Diferencia</span><b data-tono="${c.diferencia ? "ambar" : ""}">${signo(c.diferencia)}</b></p>` : ""}</div>
      <div class="rm-c-talon-pie"><div class="rm-mando-acciones" style="justify-content:space-between;width:100%">${quienBoton()}${infoBoton()}${globos()}</div>${btn("Revisar y cerrar", c.porContar === 0 ? "primario" : "secundario", 'data-ir="cerrar" style="width:100%"', { despues: lucide("arrow-right", "h-4 w-4 shrink-0") })}</div>
    </aside>`;
    return `<div class="space-y-6">${cabeceraContar(c)}</div><div class="rm-conteo rm-c">${tira}<div class="rm-c-cuerpo">${escenario}${talon}</div></div>`;
  }

  function vistaContar() { return E.direccion === "B" ? contarB() : E.direccion === "C" ? contarC() : contarA(); }

  // ── Revisa y cierra ──
  function vistaCerrar() {
    const c = cifras();
    const entran = c.entran, despues = c.despues;
    const faltaron = E.modelos.filter((m) => contado(m) && m.dijeron != null && m.contadas < m.dijeron);
    const sobraron = E.modelos.filter((m) => contado(m) && m.dijeron != null && m.contadas > m.dijeron);
    const porContar = E.modelos.filter((m) => !contado(m));
    const faltanN = faltaron.reduce((a, m) => a + (m.dijeron - m.contadas), 0);
    const motivos = ["No vino", "Se perdió en el camino", "Llegó a otra sede"];
    const pend = [];
    if (porContar.length) pend.push({ est: "ahora", titulo: `${modelosTxt(porContar.length)} sin contar`, detalle: porContar.map((m) => m.nombre).join(", "), cuerpo: `<p class="rm-paso-ayuda" style="margin:0">Cuéntalos o dilo: lo que no cuentes queda como «no llegó».</p>`, fin: btn("Ir a contar", "secundario", 'class="btn-cayla btn-secundario btn-chico" data-ir="contar"', { antes: lucide("arrow-left", "h-4 w-4") }) });
    faltaron.forEach((m) => pend.push({ est: E.motivo ? "hecho" : "ahora", titulo: `Faltan ${miles(m.dijeron - m.contadas)} de ${m.nombre}`, detalle: "¿Qué pasó?", cuerpo: motivos.map((t) => pildora(t, E.motivo === t, `data-motivo="${t}"`)).join(""), fin: E.motivo ? chip(E.motivo, "ambar") : sigueAqui }));
    sobraron.forEach((m) => pend.push({ est: "hecho", titulo: `Sobran ${miles(m.contadas - m.dijeron)} de ${m.nombre}`, detalle: "Entran igual; Compras lo ve", cuerpo: "" }));
    const listo = pend.every((p) => p.est === "hecho");
    const n = pend.length;
    const fijo = (k, titulo, detalle, fin) => `<div class="rm-item" data-key="fijo-${k}" data-estado="hecho" style="--i:${n + k}"><span class="rm-paso-num" aria-hidden="true">${lucide("check", "")}</span><div class="rm-item-titulo"><b>${titulo}</b><span>${detalle}</span>${fin}</div></div>`;
    const papeles = `<div class="rm-item" data-key="papeles" data-estado="espera" style="--i:${n + 3}"><span class="rm-paso-num" aria-hidden="true">${n + 4}</span><div class="rm-item-titulo"><b>Guía y nota</b><span>Opcional</span></div><div class="rm-item-cuerpo"><input class="caja-cayla caja-campo" data-k="guia" type="text" placeholder="Ej. T001-000342" aria-label="Número de guía" value="${E.guia}"><input class="caja-cayla caja-campo" data-k="nota" type="text" placeholder="Nota. Ej. Llegó en dos bolsas" aria-label="Nota" value="${E.nota}" style="width:300px">${btn("Fotos de la factura", "secundario", 'class="btn-cayla btn-secundario btn-chico" data-aviso="Aquí se suben las fotos de los papeles"', { antes: lucide("camera", "h-4 w-4") })}</div></div>`;
    const item = (p, i) => `<div class="rm-item" data-key="item-${p.titulo}" data-estado="${p.est}" style="--i:${i}"><span class="rm-paso-num" aria-hidden="true">${p.est === "hecho" ? lucide("check", "") : i + 1}</span><div class="rm-item-titulo"><b>${p.titulo}</b><span>${p.detalle}</span>${p.fin || ""}</div>${p.cuerpo ? `<div class="rm-item-cuerpo">${p.cuerpo}</div>` : ""}</div>`;
    const tramos = [["verde", entran, "entran al stock hoy"], ["pizarra", despues, "quedan para después"], ["ambar", faltanN, "faltaron"]].filter(([, v]) => v > 0);
    const total = tramos.reduce((a, [, v]) => a + v, 0) || 1;
    const apilada = `<span class="barra-apilada" data-alto="12" role="img" aria-label="${tramos.map(([, v, t]) => `${v} ${t}`).join(", ")}">${tramos.map(([tono, v], i) => `<span class="barra-tramo anim-crece-x" style="flex-grow: ${v / total}; --i: ${i};"><i aria-hidden="true" class="barra-tramo-color" style="background: var(--color-${tono});"></i></span>`).join("")}</span>`;
    const destinos = [["verde", "package", `${miles(entran)} entran al stock hoy`, E.modelos.filter(entraAlStock).map((m) => m.nombre).join(" y ") || "Ninguna todavía"], ["pizarra", "clock", `${miles(despues)} quedan para después`, E.modelos.filter((m) => contado(m) && m.contadas > 0 && !entraAlStock(m)).map((m) => m.nombre).join(" y ") + ": sin tallas y colores todavía"], ...(faltanN ? [["ambar", "triangle-alert", `${miles(faltanN)} faltaron`, faltaron.map((m) => `de ${m.nombre} dijeron ${m.dijeron} y llegaron ${m.contadas}`).join("; ")]] : [])];
    const tabla = `<div class="rm-plegable" ${E.tablaAbierta ? 'data-abierta=""' : ""}><button type="button" class="rm-plegable-boton" data-tabla="" aria-expanded="${E.tablaAbierta}">${lucide("chevron-down", "h-4 w-4")}${E.tablaAbierta ? "Ocultar los modelos" : `Ver los ${modelosTxt(E.modelos.length)}, con su costo`}</button><div class="rm-plegable-cuerpo"><div class="rm-plegable-dentro"><table class="rm-tabla"><thead><tr><th>Modelo</th><th class="num">Dijeron</th><th class="num">Llegaron</th><th class="num">Costo</th><th>Al cerrar</th></tr></thead><tbody>${E.modelos.map((m) => { const e = estado(m); return `<tr><td><span class="rm-prenda">${mini(m, "h-9 w-9")}<span><b>${m.nombre}</b><small>${m.cat} · ${m.tipo === "nuevo" ? "Nuevo" : "Re stock"}</small></span></span></td><td class="num">${m.dijeron ?? "—"}</td><td class="num">${contado(m) ? miles(m.contadas) : "—"} ${e.clave === "diferencia" ? chip(e.texto, "ambar") : ""}</td><td class="num">${m.costo ? `S/ ${m.costo}` : "—"}</td><td>${!contado(m) ? chip("Sin contar", "neutro") : m.contadas === 0 ? chip("No llegó", "ambar") : entraAlStock(m) ? chip("Entra al stock", "verde") : chip("Para después", "pizarra")}</td></tr>`; }).join("")}</tbody></table></div></div></div>`;
    return `<div class="space-y-6">${cabecera({ parada: 2, pct: c.pct, texto: `${miles(c.contadas)}${c.dijeron != null ? ` de ${miles(c.dijeron)}` : ""}`, detalle: "Revisa y cierra" })}</div>
      <div class="rm-cierre" style="margin-top:14px">
        <aside class="rm-tarjeta" style="--i:0" aria-label="Resumen del envío"><div class="titulo-seccion"><h2 class="titulo-seccion-texto">Resumen del envío</h2></div>
          <div class="rm-gran"><b>${odo(c.contadas)}</b><span>${c.dijeron != null ? `de ${miles(c.dijeron)} prendas llegaron` : "prendas llegaron"}</span></div>${apilada}
          <div class="rm-destinos">${destinos.map(([tono, ic, t, s], i) => `<div class="rm-destino" style="--c: var(--color-${tono}); --i:${i}"><span class="rm-lente">${lucide(ic, "h-[18px] w-[18px]")}</span><span><b>${t}</b><small>${s}</small></span></div>`).join("")}</div>
          ${c.dijeron != null ? `<div class="rm-leyenda"><p>Dijeron <b>${miles(c.dijeron)}</b></p><p>Contaste <b>${miles(c.contadas)}</b></p><p>Diferencia <b data-tono="${c.diferencia ? "ambar" : ""}">${signo(c.diferencia)}</b></p></div>` : ""}
        </aside>
        <section aria-label="Antes de cerrar">
          <div class="rm-tarjeta" style="--i:1"><div class="titulo-seccion"><h2 class="titulo-seccion-texto">Antes de cerrar</h2><span class="titulo-seccion-lado">${listo ? chip("Todo listo", "verde") : globito(pend.filter((p) => p.est !== "hecho").length, true)}</span></div>
            <div class="rm-pend" style="margin-top:12px">${pend.map(item).join("")}${fijo(0, "De quién es la mercadería", `Entra como de ${E.dueno}`, btn("Cambiar", "enlace", 'data-dueno=""'))}${fijo(1, "Costos", `Los ${modelosTxt(E.modelos.length)} entran con el costo de la compra`, btn("Revisar", "enlace", 'data-tabla=""'))}${fijo(2, `Cierra ${D.quien.nombre}`, "Admin · queda a tu nombre", btn("Cambiar", "enlace", 'data-aviso="Aquí se elige quién cierra (el combo Responsable)"'))}${papeles}</div>${tabla}</div>
          <div class="rm-tarjeta rm-cierre-pie" style="--i:2"><p>${listo ? `<b>Todo listo.</b> Entran ${prendas(entran)} al stock de ${D.sede}${despues ? ` y ${miles(despues)} quedan guardadas para terminar después` : ""}.` : `<b>Falta ${pend.filter((p) => p.est !== "hecho").length === 1 ? "una cosa" : `${pend.filter((p) => p.est !== "hecho").length} cosas`}:</b> ${pend.filter((p) => p.est !== "hecho").map((p) => p.titulo.toLowerCase()).join(" y ")}.`}</p>${btn("Volver a contar", "secundario", 'data-ir="contar"', { antes: lucide("arrow-left", "h-4 w-4") })}${btn("Confirmar y cerrar", "primario", `data-ir="cerrado" ${listo ? "" : "disabled"}`, { despues: lucide("check", "h-4 w-4") })}</div>
        </section>
      </div>`;
  }

  // ── Cerrado ──
  function vistaCerrado() {
    const c = cifras();
    const entraron = E.modelos.filter(entraAlStock);
    const despues = E.modelos.filter((m) => contado(m) && m.contadas > 0 && !entraron.includes(m));
    const noCuadro = E.modelos.filter((m) => contado(m) && m.dijeron != null && m.contadas !== m.dijeron);
    const nEntraron = entraron.reduce((a, m) => a + m.contadas, 0), nDespues = despues.reduce((a, m) => a + m.contadas, 0);
    const lacre = `<svg class="rc-lacre-sello rm-sello" viewBox="0 0 100 100" aria-hidden="true" style="position:static"><path class="rc-lacre-cera" d="M96.0 50.0 L90.6 60.9 L89.8 73.0 L79.7 79.7 L73.0 89.8 L60.9 90.6 L50.0 96.0 L39.1 90.6 L27.0 89.8 L20.3 79.7 L10.2 73.0 L9.4 60.9 L4.0 50.0 L9.4 39.1 L10.2 27.0 L20.3 20.3 L27.0 10.2 L39.1 9.4 L50.0 4.0 L60.9 9.4 L73.0 10.2 L79.7 20.3 L89.8 27.0 L90.6 39.1Z"></path><circle class="rc-lacre-aro" cx="50" cy="50" r="31"></circle><text class="rc-lacre-letra" x="50" y="62" text-anchor="middle">C</text></svg>`;
    const fila = (m, detalle, boton, i) => `<div class="rm-fila" data-key="fila-${m.id}" style="--i:${i}">${mini(m)}<div class="rm-fila-textos"><b>${m.nombre}</b><span>${detalle}</span></div>${boton}</div>`;
    const tallasTxt = (m) => { const cols = [...new Set(Object.keys(m.rep).filter((k) => m.rep[k] > 0).map((k) => k.split("|")[0]))]; const tls = [...new Set(Object.keys(m.rep).filter((k) => m.rep[k] > 0).map((k) => k.split("|")[1]))]; return `${cols.length} ${cols.length === 1 ? "color" : "colores"}, ${tls.length === 1 ? `talla ${tls[0]}` : `tallas ${tls.join(" y ")}`}`; };
    return `<div class="space-y-6">${cabecera({ parada: 4, pct: 100, texto: `${miles(c.contadas)} recibidas`, detalle: "Cerrado" })}</div>
      <div class="rm-cerrado-cab" style="margin-top:14px">${lacre}<div><div class="titulo-seccion"><h2 class="titulo-seccion-texto" style="font-size:28px">Envío cerrado</h2></div><p class="rm-placa-meta">Lo cerró ${D.quien.nombre} · hoy, 4:12 p. m.${E.guia ? ` · Guía ${E.guia}` : ""}${E.nota ? ` · «${E.nota}»` : ""}</p></div>${btn("Imprimir el acta", "secundario", 'data-aviso="Aquí se imprime el acta de recepción" style="margin-left:auto"', { antes: lucide("printer", "h-4 w-4") })}</div>
      <div class="rm-cifras">
        <div class="rm-cifra" style="--i:0"><p data-tono="verde">${lucide("package", "h-3.5 w-3.5")} Ya se venden</p><b>${odo(nEntraron)}</b><span>prendas entraron al stock</span></div>
        <div class="rm-cifra" style="--i:1"><p data-tono="pizarra">${lucide("clock", "h-3.5 w-3.5")} Para después</p><b>${odo(nDespues)}</b><span>prendas de ${modelosTxt(despues.length)}, sin tallas todavía</span></div>
        <div class="rm-cifra" style="--i:2"><p data-tono="ambar">${lucide("triangle-alert", "h-3.5 w-3.5")} ${c.diferencia ? "No cuadró" : "Cuadró"}</p><b>${c.diferencia != null ? signo(c.diferencia) : miles(c.contadas)}</b><span>${c.dijeron != null ? `de ${miles(c.dijeron)} que dijeron, llegaron ${miles(c.contadas)}` : `${prendas(c.contadas)} sin aviso`}</span></div>
      </div>
      <div class="rm-dos">
        <section class="rm-tarjeta" style="--i:3"><div class="titulo-seccion"><h2 class="titulo-seccion-texto">Lo que entró al stock</h2><span class="titulo-seccion-lado">${globito(entraron.length)}</span></div><div style="margin-top:8px">${entraron.length ? entraron.map((m, i) => fila(m, `${prendas(m.contadas)} · ${tallasTxt(m)}`, btn(`Imprimir ${m.contadas} etiquetas`, "secundario", 'class="btn-cayla btn-secundario btn-chico" data-aviso="Aquí se imprimen las etiquetas"', { antes: lucide("printer", "h-4 w-4") }), i)).join("") : `<p class="rm-paso-ayuda">Nada entró todavía: todo quedó para después.</p>`}</div>${entraron.length ? `<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">${btn(`Imprimir ${nEntraron} etiquetas`, "secundario", 'data-aviso="Aquí se imprimen todas las etiquetas"', { antes: lucide("printer", "h-4 w-4") })}${btn("Bajar al piso", "secundario", 'data-aviso="Aquí se baja al piso lo que entró"', { antes: lucide("arrow-down", "h-4 w-4") })}</div>` : ""}</section>
        <div>
          <section class="rm-tarjeta" style="--i:4"><div class="titulo-seccion"><h2 class="titulo-seccion-texto">Para después</h2><span class="titulo-seccion-lado">${globito(despues.length, despues.length > 0)}</span></div><div style="margin-top:8px">${despues.length ? despues.map((m, i) => fila(m, `${prendas(m.contadas)} · en el almacén, aún no se venden`, btn(m.tipo === "nuevo" && !m.creada ? "Crear la prenda" : "Poner tallas", "secundario", 'class="btn-cayla btn-secundario btn-chico" data-aviso="Aquí se termina el modelo (Hacer ahora)"', { despues: lucide("arrow-right", "h-4 w-4") }), i)).join("") : `<p class="rm-paso-ayuda">Nada quedó para después.</p>`}</div></section>
          ${noCuadro.length ? `<section class="rm-tarjeta" style="--i:5"><div class="titulo-seccion"><h2 class="titulo-seccion-texto">Lo que no cuadró</h2><span class="titulo-seccion-lado">${globito(noCuadro.length)}</span></div><div style="margin-top:8px">${noCuadro.map((m, i) => fila(m, `${m.contadas < m.dijeron ? `Faltaron ${miles(m.dijeron - m.contadas)}` : `Sobraron ${miles(m.contadas - m.dijeron)}`} · ${E.motivo || "sin decir qué pasó"}`, chip("Lo ve Compras", "ambar", { punto: false, icono: "eye" }), i)).join("")}</div></section>` : ""}
        </div>
      </div>
      <p class="rm-reabrir">¿Encontraste algo más? <button type="button" class="btn-cayla btn-enlace" data-aviso="Aquí se reabre el envío: corriges y lo cierras de nuevo; lo que ya entró al stock no se toca">Reabrir el envío</button></p>`;
  }

  // ── Qué cambió ──
  const DIRECCIONES = [
    ["A · Mesa de tres", "La lista a la izquierda, la prenda al centro y, a la derecha, el reparto de tallas (o lo que sigue y el cierre). Arriba, cuatro fichas con cuántos modelos hay en cada estado, que filtran. Cada categoría tiene su color.", "Para quien cuenta mirando la lista: la tabla de tallas deja de estar bajo el pliegue y aparece sola cuando toca."],
    ["B · Tablero", "Todos los modelos a la vista como tarjetas, agrupados por categoría; se cuenta en cada tarjeta (− 6 +, «Llegaron las 6») sin elegir nada antes; la tarjeta se abre para repartir tallas. A la derecha, el cierre vivo: el anillo de avance, los estados y «Revisar y cerrar».", "Para envíos de pocos modelos: se ve de un vistazo qué falta, y no hay «anterior / siguiente»."],
    ["C · Mostrador", "Una prenda a la vez, grande como en Vender: la tira de modelos arriba, el Dial de 264 px con «Llegaron las 6» enorme, las dos opciones como baldosas, y a la derecha el talón con lo contado. Enter pasa al siguiente.", "Para contar rápido con una mano o con el teclado: una pregunta, una respuesta."],
  ];
  const CAMBIOS = [
    ["El resumen deja de estar mientras se cuenta", "Una columna con diez cifras, cuatro estados, quién cuenta, dos notas y el botón de cerrar. Nadie la miraba: se guiaban por las barras de la lista.", "Una sola línea arriba (A), la barra grande del tablero (B) o el talón (C). El resumen completo aparece en «Revisa y cierra» y se queda en «Cerrado».", "Lo que se mira mientras se cuenta es la prenda; el balance importa al cerrar."],
    ["El espacio libre con el menú plegado se usa", "Dos columnas y el contador se quedaba con todo el ancho.", "A: una tercera columna con el reparto o lo que sigue. B: tres o cuatro tarjetas por fila. C: el escenario grande y el talón.", "Felipe 2026-11-11: «mucho espacio libre a la derecha»."],
    ["Las tarjetas «Re stock» y «Producto nuevo» se achican", "Dos tarjetas grandes arriba, con explicación, cifras y barra.", "Un filtro «Tipo» (A) y la marca «Nuevo» en cada modelo o tarjeta (A, B, C).", "Parecían una pregunta que había que contestar antes de empezar."],
    ["El aviso de Admin se guarda en una «i»", "Dos líneas arriba de todo, para todos, cada vez.", "Una «i» junto a quién cuenta: se abre al tocarla y dice lo mismo.", ""],
    ["La prenda se cuenta en tres pasos", "Contador, atajos, «¿Qué deseas hacer?», tabla y textos, todos con el mismo peso.", "1 ¿Cuántas llegaron? · 2 ¿Tallas y colores ahora? · 3 Reparte. Uno solo dice «Sigue aquí»; lo hecho lleva ✓. En B los tres pasos caben en una tarjeta.", "ADR-0284: la pantalla dice qué está hecho, qué sigue y qué falta."],
    ["El paso 2 viene contestado", "Nadie avanzaba sin tocar una de las dos opciones.", "Re stock arranca en «Sí, ahora»; nuevo en «Después». Se cambia con un toque.", "Regla de negocio nueva, aprobada el 2026-11-11."],
    ["Una línea de ayuda por paso", "Dos párrafos y tres textos distintos bajo la tabla.", "Una línea que cambia con lo elegido, y una barra «Repartiste 7 de 10 · faltan 3».", ""],
    ["Lo que se usa poco va en «Más»", "«¿Llegó algo dañado?», «Cambiar de prenda», observación y «Llevar al stock», repartidos por la placa.", "Un botón «Más» en la prenda (A, C) o «⋯» en la tarjeta (B).", ""],
    ["Cada categoría tiene su color", "Todas en pizarra.", "Tops en pizarra, Pantalones en ocre, Blusas en lila: la banda de la lista, la raya de la prenda, el grupo del tablero y la tira.", "Regla que se salta a propósito: se reconoce la categoría sin leer."],
    ["Revisa y cierra pide solo lo que falta", "Una tarjeta por categoría con costo, detalle y qué pasó; a la derecha «Al cerrar».", "«Antes de cerrar» con lo que hay que decidir encendido; el resumen con la barra de destinos; la tabla por modelo plegada. «Hoy» muestra la de producción.", ""],
    ["Cerrado dice qué pasa con cada cosa", "Lacre, cifras, para después y reabrir.", "Tres cifras y tres listas con su acción: imprimir etiquetas, bajar al piso, poner tallas, lo que ve Compras.", ""],
  ];
  const cajonCambios = () => `<div class="rm-velo" data-cerrar-cambios=""></div><aside class="rm-cajon" aria-label="Qué cambió"><button type="button" class="rm-redondo rm-cajon-cerrar" data-cerrar-cambios="" aria-label="Cerrar">${lucide("x", "h-4 w-4")}</button><h2>Las tres direcciones</h2><p>Un orden distinto cada una; lo mismo se guarda en las tres.</p>${DIRECCIONES.map(([t, a, p], i) => `<div class="rm-cambio" style="--i:${i}"><b>${t}</b><p><span>Qué</span>${a}</p><em>${p}</em></div>`).join("")}<h2 style="margin-top:22px">Qué cambió y por qué</h2><p>Hoy (producción) contra la maqueta. Nada de esto cambia qué se guarda en la base.</p>${CAMBIOS.map(([t, h, a, p], i) => `<div class="rm-cambio" style="--i:${i + 3}"><b>${t}</b><p><span>Hoy</span>${h}</p><p><span>Aquí</span>${a}</p>${p ? `<em>${p}</em>` : ""}</div>`).join("")}</aside>`;

  // ── Pintar: el DOM vivo se PARCHEA (como React): una animación de entrada corre una sola vez y lo que cambia transiciona. ──
  function morph(vivo, nuevo) {
    if (vivo.nodeType !== nuevo.nodeType || (vivo.nodeType === 1 && (vivo.tagName !== nuevo.tagName || (vivo.dataset.key || "") !== (nuevo.dataset.key || "")))) { vivo.replaceWith(nuevo.cloneNode(true)); return; }
    if (vivo.nodeType === 3) { if (vivo.nodeValue !== nuevo.nodeValue) vivo.nodeValue = nuevo.nodeValue; return; }
    if (vivo.nodeType !== 1) return;
    for (const a of [...vivo.attributes]) if (!nuevo.hasAttribute(a.name)) vivo.removeAttribute(a.name);
    for (const a of [...nuevo.attributes]) if (vivo.getAttribute(a.name) !== a.value) vivo.setAttribute(a.name, a.value);
    if (vivo.tagName === "INPUT" && document.activeElement !== vivo && vivo.value !== (nuevo.getAttribute("value") ?? "")) vivo.value = nuevo.getAttribute("value") ?? "";
    if (vivo.tagName === "INPUT" || vivo.tagName === "BUTTON") vivo.disabled = nuevo.hasAttribute("disabled");
    const vc = [...vivo.childNodes], nc = [...nuevo.childNodes];
    const porClave = new Map(vc.filter((n) => n.nodeType === 1 && n.dataset.key).map((n) => [n.dataset.key, n]));
    nc.forEach((n, i) => {
      let v = vivo.childNodes[i];
      if (n.nodeType === 1 && n.dataset.key && porClave.get(n.dataset.key) && porClave.get(n.dataset.key) !== v) { vivo.insertBefore(porClave.get(n.dataset.key), v || null); v = vivo.childNodes[i]; }
      if (!v) { vivo.appendChild(n.cloneNode(true)); return; }
      morph(v, n);
    });
    while (vivo.childNodes.length > nc.length) vivo.lastChild.remove();
  }
  function parchear(el, html) { const t = document.createElement(el.tagName); for (const a of [...el.attributes]) t.setAttribute(a.name, a.value); t.innerHTML = html; morph(el, t); }

  // El marco real, abierto o plegado (Felipe 2026-11-11: con el menú plegado sobra espacio; arranca plegado).
  const menu = q.get("menu") === "abierto" ? "abierto" : "plegado";
  document.body.insertAdjacentHTML("afterbegin", window.MARCOS[menu] + window.MARCOS.main + window.MARCOS.despues);
  const main = $("#maqueta");

  function chapa() {
    let el = $("#rm-chapa");
    if (!el) { el = document.createElement("div"); el.id = "rm-chapa"; el.className = "rm-chapa"; document.body.append(el); }
    const v = (id, t) => `<button type="button" data-vista="${id}" aria-pressed="${E.vista === id}">${t}</button>`;
    const dir = (id, t) => `<button type="button" data-direccion="${id}" aria-pressed="${E.direccion === id}" ${E.vista === "cerrar" || E.vista === "cerrado" ? "disabled" : ""}>${t}</button>`;
    el.toggleAttribute("data-plegada", !E.chapaAbierta);
    const nombreVista = { contar: "Contar", cerrar: "Revisa y cierra", cerrado: "Cerrado", "sin-aviso": "Sin aviso" }[E.vista];
    const nombreDir = { A: "A · Mesa de tres", B: "B · Tablero", C: "C · Mostrador" }[E.direccion];
    parchear(el, `<button type="button" class="rm-chapa-pill" data-chapa="" aria-expanded="${!!E.chapaAbierta}"><span>Maqueta</span><b>${nombreVista}${E.vista === "contar" || E.vista === "sin-aviso" ? ` · ${nombreDir}` : ""}${E.cara === "hoy" ? " · HOY" : ""}</b>${lucide(E.chapaAbierta ? "chevron-down" : "chevron-up", "h-4 w-4")}</button><b>Vista</b>${v("contar", "1 · Contar")}${v("cerrar", "2 · Revisa y cierra")}${v("cerrado", "3 · Cerrado")}${v("sin-aviso", "Sin aviso")}<span class="rm-chapa-sep"></span><b>Dirección de Contar</b>${dir("A", "A · Mesa de tres")}${dir("B", "B · Tablero")}${dir("C", "C · Mostrador")}<span class="rm-chapa-sep"></span><button type="button" data-cara="propuesta" aria-pressed="${E.cara === "propuesta"}">Propuesta</button><button type="button" data-cara="hoy" aria-pressed="${E.cara === "hoy"}">Hoy</button><button type="button" data-menu-lateral="" data-sutil title="Plegar o abrir el menú lateral">${menu === "plegado" ? "Menú: plegado" : "Menú: abierto"}</button><span class="rm-chapa-sep"></span><button type="button" data-cambios="">Qué cambió</button><button type="button" data-reiniciar="" data-sutil>Reiniciar</button>`);
  }
  const HOY = {};
  async function pintarHoy() {
    const id = E.vista === "sin-aviso" ? "sin-aviso" : E.vista;
    main.innerHTML = `<div class="rm-hoy"><div class="rm-hoy-marca">${lucide("eye", "h-4 w-4")}Así está hoy en producción · captura quieta, no responde</div><div id="rm-hoy-cuerpo"></div></div>`;
    if (!HOY[id]) { try { const r = await fetch(`hoy-${id}.html`); HOY[id] = r.ok ? await r.text() : null; } catch { HOY[id] = null; } }
    const c = $("#rm-hoy-cuerpo");
    if (!c) return;
    c.innerHTML = HOY[id] || `<p class="rm-paso-ayuda">No hay captura de «${id}» (hoy-${id}.html). Abre la maqueta desde un servidor local (no con doble clic).</p>`;
    c.querySelectorAll("a[href]").forEach((a) => a.setAttribute("href", "#"));
  }
  function pintar() {
    const foco = document.activeElement?.dataset?.k, focoModelo = document.activeElement?.dataset?.modelo, pos = document.activeElement?.selectionStart;
    chapa();
    document.documentElement.dataset.direccion = E.direccion;
    if (E.cara === "hoy") { pintarHoy(); parchear($("#capas"), E.cambios ? cajonCambios() : ""); return; }
    parchear(main, `<div data-key="vista-${E.vista}-${E.vista === "cerrar" || E.vista === "cerrado" ? "" : E.direccion}" class="contents">${E.vista === "cerrar" ? vistaCerrar() : E.vista === "cerrado" ? vistaCerrado() : vistaContar()}</div>`);
    parchear($("#capas"), E.cambios ? cajonCambios() : "");
    const mesa = $(".rm-mesa, .rm-b-cuerpo, .rm-c-cuerpo");
    if (mesa) mesa.style.setProperty("--rm-arriba", `${Math.round(mesa.getBoundingClientRect().top + window.scrollY)}px`);
    if (foco) { const el = document.querySelector(`[data-k="${foco}"]${focoModelo ? `[data-modelo="${focoModelo}"]` : ""}`); if (el && document.activeElement !== el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} } }
    if (E.editando) { const caja = $('[data-k="dial"]'); if (caja && document.activeElement !== caja) { caja.focus(); caja.select(); } }
    const activa = $(".rm-c-foto[aria-selected='true']"), pelicula = $(".rm-c-pelicula");
    if (activa && pelicula) pelicula.scrollTo({ left: activa.offsetLeft - (pelicula.clientWidth - activa.offsetWidth) / 2, behavior: document.documentElement.dataset.movimiento === "quieto" ? "auto" : "smooth" });
  }

  let reloj;
  function avisar(texto) {
    const pila = $("[data-avisos]") || document.body;
    pila.querySelectorAll(".rm-aviso").forEach((a) => a.remove());
    clearTimeout(reloj);
    const a = document.createElement("div"); a.className = "rm-aviso"; a.setAttribute("role", "status"); a.textContent = texto;
    pila.append(a);
    reloj = setTimeout(() => { a.setAttribute("data-sale", ""); setTimeout(() => a.remove(), 240); }, 3200);
  }
  function poner(m, n) {
    const antes = m.contadas;
    m.contadas = Math.max(0, Math.round(n));
    if (m.contadas > 0 && !m.modo) m.modo = modoPorDefecto(m);
    if (antes !== m.contadas) { E.guardando = true; setTimeout(() => { E.guardando = false; pintar(); }, 700); }
    if (estado(m).clave === "listo" && antes !== m.contadas) { E.recien = m.id; setTimeout(() => { E.recien = null; pintar(); }, 1700); }
  }

  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("button, a, [data-cerrar-cambios], [data-cerrar-hoja]");
    const habiaGlobo = E.globo, habiaMenu = E.menu;
    if (!b) { if (habiaGlobo || habiaMenu) { E.globo = null; E.menu = false; pintar(); } return; }
    const d = b.dataset;
    if (b.tagName === "A" && b.closest("#lateral, header") && !b.closest("#maqueta")) { ev.preventDefault(); avisar("La maqueta no navega a otra pantalla."); return; }
    if (b.tagName === "A") ev.preventDefault();
    const al = b.getAttribute("aria-label") || "";
    if (!b.closest("#maqueta, #rm-chapa, #capas")) {
      if (al === "Modo oscuro") { const o = document.documentElement.dataset.tema === "oscuro"; document.documentElement.dataset.tema = o ? "claro" : "oscuro"; return; }
      if (al === "Animaciones" || b.closest('[aria-label="Animaciones"]')) { const qu = document.documentElement.dataset.movimiento === "quieto"; document.documentElement.dataset.movimiento = qu ? "vivo" : "quieto"; avisar(qu ? "Animaciones encendidas" : "Animaciones apagadas"); return; }
      if (/menú lateral/.test(al)) { const u = new URL(location.href); u.searchParams.set("menu", menu === "plegado" ? "abierto" : "plegado"); u.searchParams.set("vista", E.vista); u.searchParams.set("dir", E.direccion); location.href = u.toString(); return; }
      avisar("Eso es parte del marco real del ERP: en la maqueta no hace nada.");
      return;
    }
    E.globo = null; E.menu = false;
    // Lo que trae su modelo (una tarjeta del tablero, la tira, una celda) actúa sobre ese modelo.
    const esAccion = "suma" in d || "poner" in d || d.modo || "abrir" in d || "quitarColor" in d || "quitarTalla" in d || "agregarColor" in d || "agregarTalla" in d;
    if (d.modelo && esAccion) E.actual = d.modelo;
    const m = actual();
    if (d.vista) { if (d.vista === "sin-aviso" && !E.sinAviso) E = SIN_AVISO(); else if (d.vista !== "sin-aviso" && E.sinAviso) E = INICIAL(); E.vista = d.vista; E.editando = false; if (d.vista === "cerrado" || (d.vista === "cerrar" && nadaContado())) { contarTodo(); if (d.vista === "cerrado") E.motivo = E.motivo || "No vino"; } }
    else if (d.direccion) { E.direccion = d.direccion; E.editando = false; E.abiertaB = null; }
    else if (d.cara) E.cara = d.cara;
    else if ("menuLateral" in d) { const u = new URL(location.href); u.searchParams.set("menu", menu === "plegado" ? "abierto" : "plegado"); u.searchParams.set("vista", E.vista); u.searchParams.set("dir", E.direccion); location.href = u.toString(); return; }
    else if ("reiniciar" in d) { const dir = E.direccion; E = E.sinAviso ? SIN_AVISO() : INICIAL(); E.direccion = dir; avisar("La maqueta volvió a como empezó."); }
    else if ("chapa" in d) E.chapaAbierta = !E.chapaAbierta;
    else if ("cambios" in d) E.cambios = true;
    else if ("cerrarCambios" in d) E.cambios = false;
    else if (d.ir) { if (d.ir === "cerrado" && b.disabled) return; E.vista = d.ir === "contar" && E.sinAviso ? "sin-aviso" : d.ir; E.editando = false; if (d.ir === "cerrado") avisar("En el ERP aquí se cierra de verdad: entra al stock y queda el acta."); }
    else if (d.globo) E.globo = habiaGlobo === d.globo ? null : d.globo;
    else if ("menu" in d) E.menu = !habiaMenu;
    else if ("hoja" in d) E.hoja = true;
    else if ("cerrarHoja" in d && ev.target === b) E.hoja = false;
    else if (d.modelo && !esAccion) { E.actual = d.modelo; E.editando = false; E.hoja = false; }
    else if (d.cat) { const x = E.modelos.find((y) => y.cat === d.cat); if (x && actual().cat !== d.cat) E.actual = x.id; }
    else if (d.filtro) E.filtro = E.filtro === d.filtro && d.filtro !== "todos" ? "todos" : d.filtro;
    else if ("tipo" in d) E.tipo = { todos: "restock", restock: "nuevo", nuevo: "todos" }[E.tipo];
    else if ("editar" in d) E.editando = true;
    else if (d.suma) { E.editando = false; poner(m, (m.contadas || 0) + Number(d.suma)); }
    else if (d.poner) { E.editando = false; poner(m, Number(d.poner)); if (Number(d.poner) === 0) avisar("Anotado: no llegó nada de este modelo."); }
    else if (d.modo) { m.modo = d.modo; if (E.direccion === "B" && d.modo === "ahora") E.abiertaB = m.id; }
    else if ("abrir" in d) E.abiertaB = E.abiertaB === d.abrir ? null : d.abrir;
    else if (d.quitarColor) { m.colores = m.colores.filter(([n]) => n !== d.quitarColor); Object.keys(m.rep).forEach((k) => { if (k.startsWith(`${d.quitarColor}|`)) delete m.rep[k]; }); avisar(`Se quitó ${d.quitarColor} de este modelo.`); }
    else if (d.quitarTalla) { m.tallas = m.tallas.filter((t) => t !== d.quitarTalla); Object.keys(m.rep).forEach((k) => { if (k.endsWith(`|${d.quitarTalla}`)) delete m.rep[k]; }); avisar(`Se quitó la talla ${d.quitarTalla}.`); }
    else if ("agregarColor" in d) { const nuevo = D.coloresDeMas.find(([n]) => !m.colores.some(([x]) => x === n)); if (nuevo) { m.colores.push(nuevo); avisar(`Se agregó ${nuevo[0]} (en el ERP eliges de la carta).`); } }
    else if ("agregarTalla" in d) { const nueva = (D.tallasDeMas[m.cat] || []).find((t) => !m.tallas.includes(t)); if (nueva) { m.tallas.push(nueva); m.tallas.sort((a, c) => { const o = ["XS", "S", "M", "L", "XL", "26", "28", "30", "32", "34"]; return o.indexOf(a) - o.indexOf(c); }); avisar(`Se agregó la talla ${nueva}.`); } }
    else if (d.mover) { const i = E.modelos.indexOf(m) + Number(d.mover); E.editando = false; if (E.modelos[i]) E.actual = E.modelos[i].id; else if (i >= E.modelos.length) E.vista = "cerrar"; }
    else if (d.motivo) E.motivo = d.motivo;
    else if ("dueno" in d) { E.dueno = E.dueno === "CAYLA" ? "CLAURE" : "CAYLA"; avisar(`La mercadería entra como de ${E.dueno}.`); }
    else if ("tabla" in d) E.tablaAbierta = !E.tablaAbierta;
    else if (d.aviso) avisar(d.aviso + " (la maqueta no lo abre).");
    pintar();
  });
  document.addEventListener("input", (ev) => {
    const k = ev.target.dataset.k; if (!k) return;
    const n = parseInt(String(ev.target.value).replace(/\D/g, ""), 10);
    const m = ev.target.dataset.modelo ? porId(ev.target.dataset.modelo) : actual();
    if (k === "buscar") E.buscar = ev.target.value;
    else if (k === "guia") { E.guia = ev.target.value; return; }
    else if (k === "nota") { E.nota = ev.target.value; return; }
    else if (k === "dial") { if (Number.isNaN(n)) m.contadas = null; else { m.contadas = Math.max(0, n); if (m.contadas > 0 && !m.modo) m.modo = modoPorDefecto(m); } return; }
    else if (k === "num") { if (Number.isNaN(n)) m.contadas = null; else { m.contadas = Math.max(0, n); if (m.contadas > 0 && !m.modo) m.modo = modoPorDefecto(m); } }
    else if (k.startsWith("rep:")) { const c = k.slice(4); if (Number.isNaN(n) || n === 0) delete m.rep[c]; else m.rep[c] = n; E.recienCelda = `${m.id}:${c}`; }
    pintar();
  });
  document.addEventListener("focusout", (ev) => {
    const k = ev.target.dataset?.k;
    if (k === "dial" || k === "num") { E.editando = false; const m = ev.target.dataset.modelo ? porId(ev.target.dataset.modelo) : actual(); if (contado(m)) { E.guardando = true; setTimeout(() => { E.guardando = false; pintar(); }, 700); if (estado(m).clave === "listo") { E.recien = m.id; setTimeout(() => { E.recien = null; pintar(); }, 1700); } } pintar(); }
    if (k?.startsWith("rep:")) E.recienCelda = null;
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { if (E.cambios || E.globo || E.menu || E.hoja || E.editando) { E.cambios = false; E.globo = null; E.menu = false; E.hoja = false; E.editando = false; pintar(); } return; }
    if (ev.key === "Enter" && ev.target.dataset?.k === "dial") { ev.preventDefault(); E.editando = false; const m = actual(); if (!contado(m)) m.contadas = 0; pintar(); if (E.direccion === "C") { const i = E.modelos.indexOf(m) + 1; if (E.modelos[i]) { E.actual = E.modelos[i].id; pintar(); } } else $('[data-mover="1"]')?.focus(); return; }
    if (ev.key === "Enter" && ev.target.dataset?.k === "num") { ev.preventDefault(); ev.target.blur(); const todos = [...document.querySelectorAll('[data-k="num"]')]; const sig = todos[todos.indexOf(ev.target) + 1]; sig?.focus(); sig?.select(); return; }
    if (ev.key === "Enter" && E.direccion === "C" && E.vista !== "cerrar" && E.vista !== "cerrado" && !/INPUT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { const m = actual(); if (contado(m)) { const i = E.modelos.indexOf(m) + 1; if (E.modelos[i]) E.actual = E.modelos[i].id; else E.vista = "cerrar"; pintar(); } return; }
    if (ev.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { ev.preventDefault(); $('[data-k="buscar"]')?.focus(); }
  });
  window.addEventListener("resize", () => { const mesa = $(".rm-mesa, .rm-b-cuerpo, .rm-c-cuerpo"); if (mesa) mesa.style.setProperty("--rm-arriba", `${Math.round(mesa.getBoundingClientRect().top + window.scrollY)}px`); });

  if (q.get("vista")) { if (q.get("vista") === "sin-aviso") E = SIN_AVISO(); else E.vista = q.get("vista"); if (E.vista === "cerrar" || E.vista === "cerrado") { contarTodo(); if (E.vista === "cerrado") E.motivo = "No vino"; } }
  if (q.get("cara") === "hoy") E.cara = "hoy";
  if (q.get("tema") === "oscuro") document.documentElement.dataset.tema = "oscuro";
  if (q.get("movimiento") === "quieto") document.documentElement.dataset.movimiento = "quieto";
  pintar();
})();
