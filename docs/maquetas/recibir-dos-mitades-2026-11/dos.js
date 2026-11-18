// Maqueta · Recibir mercadería en DOS MITADES (Felipe 2026-11-11): solo las categorías y el contador, del mismo tamaño; las tallas y los colores
// se reparten en una hoja con espacio. Pensada caso por caso: cada cosa que una colaboradora puede hacer (o hacer mal) tiene su respuesta en pantalla.
// Corre sobre el marco real del ERP y su CSS compilado (los de ../recibir-ordenada-2026-11/). No guarda nada: los datos son inventados (datos.js).
(() => {
  const D = window.DATOS2;
  const I = window.ICONOS;
  Object.assign(I, {
    info: '<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>',
    ellipsis: '<circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle>',
    printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"></path><rect x="6" y="14" width="12" height="8" rx="1"></rect>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path><path d="m15 5 4 4"></path>',
    grid: '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M3 12h18"></path><path d="M12 3v18"></path>',
    "chevron-up": '<path d="m18 15-6-6-6 6"></path>',
    "chevron-right": '<path d="m9 18 6-6-6-6"></path>',
    repeat: '<path d="m17 2 4 4-4 4"></path><path d="M3 11v-1a4 4 0 0 1 4-4h14"></path><path d="m7 22-4-4 4-4"></path><path d="M21 13v1a4 4 0 0 1-4 4H3"></path>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle>',
    "list-checks": '<path d="m3 17 2 2 4-4"></path><path d="m3 7 2 2 4-4"></path><path d="M13 6h8"></path><path d="M13 12h8"></path><path d="M13 18h8"></path>',
    "wifi-off": '<path d="M12 20h.01"></path><path d="M8.5 16.429a5 5 0 0 1 7 0"></path><path d="M5 12.859a10 10 0 0 1 5.17-2.69"></path><path d="M19 12.859a10 10 0 0 0-2.007-1.523"></path><path d="M2 8.82a15 15 0 0 1 4.177-2.643"></path><path d="M22 8.82a15 15 0 0 0-11.288-3.764"></path><path d="m2 2 20 20"></path>',
    sliders: '<line x1="21" x2="14" y1="4" y2="4"></line><line x1="10" x2="3" y1="4" y2="4"></line><line x1="21" x2="12" y1="12" y2="12"></line><line x1="8" x2="3" y1="12" y2="12"></line><line x1="21" x2="16" y1="20" y2="20"></line><line x1="12" x2="3" y1="20" y2="20"></line><line x1="14" x2="14" y1="2" y2="6"></line><line x1="8" x2="8" y1="10" y2="14"></line><line x1="16" x2="16" y1="18" y2="22"></line>',
    "package-check": '<path d="m16 16 2 2 4-4"></path><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"></path><path d="m7.5 4.27 9 5.15"></path><polyline points="3.29 7 12 12 20.71 7"></polyline><line x1="12" x2="12" y1="22" y2="12"></line>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><path d="M16 3.128a4 4 0 0 1 0 7.744"></path><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><circle cx="9" cy="7" r="4"></circle>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
    wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"></path><path d="m14 7 3 3"></path><path d="M5 6v4"></path><path d="M19 14v4"></path><path d="M10 2v2"></path><path d="M7 8H3"></path><path d="M21 16h-4"></path><path d="M11 3H9"></path>',
    eraser: '<path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"></path><path d="m5.082 11.09 8.828 8.828"></path>',
    tops: '<path d="M8.6 3 8 8.2l-2.5 2.4V16h13v-5.4L16 8.2 15.4 3"></path><path d="M8.6 3c.2 3.2 1.6 5 3.4 5s3.2-1.8 3.4-5"></path>',
    pantalones: '<path d="M7 3h10l1.4 18h-5.2L12 10l-1.2 11H5.6z"></path><path d="M7 7.5h10"></path>',
    vestidos: '<path d="M9 2.6 8.6 7.6l-1.2 3-1.6 10.9h12.4L16.6 10.6l-1.2-3L15 2.6"></path><path d="M9 2.6c.2 2.4 1.4 3.6 3 3.6s2.8-1.2 3-3.6"></path>',
    casacas: '<path d="M8.6 3.5 3 6.6l2 4.4 2.5-1.2V20.5h9V9.8L19 11l2-4.4-5.6-3.1"></path><path d="M12 6.5v14"></path><path d="M8.6 3.5 12 6.5l3.4-3"></path>',
    faldas: '<path d="M8 4h8l3.5 15.5h-15z"></path><path d="M8 4v2.5h8V4"></path>',
  });
  const lucide = (n, cls = "h-4 w-4") => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide ${cls}" aria-hidden="true">${I[n] || ""}</svg>`;
  const IC_CAT = { Tops: "tops", Pantalones: "pantalones", Vestidos: "vestidos", Blusas: "tops", "Camisas y Blusas": "tops", Casacas: "casacas", Faldas: "faldas" };
  const catIc = (cat, cls = "h-[18px] w-[18px]") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${I[IC_CAT[cat] || "tops"]}</svg>`;
  const $ = (s, r = document) => r.querySelector(s);
  const miles = (n) => Number(n).toLocaleString("es-PE");
  const signo = (n) => (n > 0 ? `+${miles(n)}` : miles(n));
  const prendas = (n) => `${miles(n)} ${n === 1 ? "prenda" : "prendas"}`;
  const modelosTxt = (n) => `${miles(n)} ${n === 1 ? "modelo" : "modelos"}`;
  const copia = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // ── Las reglas, en chico (avance-color.ts, recepcion-dial-reglas.ts, recepcion-modelos-reglas.ts) ──
  const colorDeAvance = (pct) => {
    const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
    if (p >= 100) return "var(--color-verde)";
    return p <= 50 ? `color-mix(in oklab, var(--color-avance-medio) ${Math.round(p * 2)}%, var(--color-rojo))` : `color-mix(in oklab, var(--color-verde) ${Math.round((p - 50) * 2)}%, var(--color-avance-medio))`;
  };
  const atajos = (dijeron, contadas) => { const e = dijeron ?? contadas; return e >= 5000 ? [100, 500] : e >= 1000 ? [50, 100] : e >= 200 ? [10, 50] : [5, 10]; };
  const suma = (rep) => Object.values(rep).reduce((a, n) => a + n, 0);
  const repartidas = (m) => suma(m.rep);
  const contado = (m) => m.contadas != null;
  const faltanTallas = (m) => contado(m) && m.contadas > 0 && m.modo === "ahora" && (m.tipo === "restock" || m.creada) && repartidas(m) !== m.contadas;
  const porCrear = (m) => contado(m) && m.contadas > 0 && m.modo === "ahora" && m.tipo === "nuevo" && !m.creada;
  const entraAlStock = (m) => contado(m) && m.contadas > 0 && m.modo === "ahora" && (m.tipo === "restock" || m.creada) && repartidas(m) === m.contadas;
  /** Lo repartido que todavía no se llevó al stock (Felipe 2026-11-11: casi siempre lo llevan desde el conteo, para venderlo ya). */
  const porLlevar = (m) => (contado(m) && !m.raro && m.modo === "ahora" && repartidas(m) <= m.contadas ? Math.max(0, repartidas(m) - (m.enStock || 0)) : 0);
  const todoEnStock = (m) => (m.enStock || 0) > 0 && m.enStock === m.contadas;
  /** Un número que no parece cierto: mucho más de lo que dijeron (el típico «100» por «10»). Se pregunta antes de darlo por bueno. */
  const esRaro = (m, n) => m.dijeron != null && n > Math.max(m.dijeron * 2, m.dijeron + 10);
  /** El estado que dice su chip en la lista. Un solo estado por modelo, el que más importa primero. */
  function estado(m) {
    if (!contado(m)) return { clave: "por-contar", texto: "Por contar", tono: "neutro" };
    if (m.raro) return { clave: "confirmar", texto: "Por confirmar", tono: "ambar" };
    if (m.dijeron != null && m.contadas === 0) return { clave: "diferencia", texto: "No llegó", tono: "ambar" };
    if (m.dijeron != null && m.contadas !== m.dijeron) return { clave: "diferencia", texto: m.contadas < m.dijeron ? `Faltan ${miles(m.dijeron - m.contadas)}` : `Sobran ${miles(m.contadas - m.dijeron)}`, tono: "ambar" };
    if (m.provisional) return { clave: "nombre", texto: "Ponle nombre", tono: "ambar" };
    if (todoEnStock(m)) return { clave: "listo", texto: "En el stock", tono: "verde" };
    if (faltanTallas(m)) return { clave: "tallas", texto: "Faltan tallas", tono: "ambar" };
    if (porCrear(m)) return { clave: "tallas", texto: "Por crear", tono: "pizarra" };
    return { clave: "listo", texto: m.dijeron == null ? "Contado" : "Cuadra", tono: "verde" };
  }
  const modoPorDefecto = (m) => (m.tipo === "restock" ? "ahora" : "despues");

  // ── Estado de la maqueta ──
  const q = new URLSearchParams(location.search);
  const INICIAL = () => ({
    vista: "contar", cara: "propuesta", caso: "medias", actual: "lunares", filtro: "todos", buscar: "", cerradas: {},
    globo: null, menu: false, editando: false, hojaLista: false, filtrosAbiertos: false, porQue: false, recien: null, chapaAbierta: false,
    hoja: null, offline: false, porEnviar: 0, sinAviso: false, undo: null,
    motivo: null, dueno: "CAYLA", tablaAbierta: false, guia: D.guia, nota: "",
    modelos: copia(D.modelos).map((m) => ({ danadas: [], obs: [], ...m })),
  });
  let E = INICIAL();
  const actual = () => E.modelos.find((m) => m.id === E.actual) || E.modelos[0];
  const porId = (id) => E.modelos.find((m) => m.id === id);
  const cats = () => [...new Set(E.modelos.map((m) => m.cat))];
  const cifras = () => {
    const dijeron = E.sinAviso ? null : E.modelos.reduce((a, m) => a + (m.dijeron || 0), 0);
    const contadas = E.modelos.reduce((a, m) => a + (m.contadas || 0), 0);
    const porContar = E.modelos.filter((m) => !contado(m)).length;
    const porConfirmar = E.modelos.filter((m) => m.raro).length;
    const sinNombre = E.modelos.filter((m) => m.provisional && contado(m)).length;
    const conDiferencia = E.modelos.filter((m) => estado(m).clave === "diferencia").length;
    const sinTallas = E.modelos.filter((m) => faltanTallas(m) || porCrear(m)).length;
    const entran = E.modelos.filter(entraAlStock).reduce((a, m) => a + m.contadas, 0);
    const pctCrudo = dijeron ? Math.min(100, (contadas / dijeron) * 100) : E.modelos.length ? ((E.modelos.length - porContar) / E.modelos.length) * 100 : 0;
    // Mientras quede algo por contar o por confirmar, la barra no llega al verde (aunque un número raro infle la suma).
    const pct = porContar + porConfirmar > 0 ? Math.min(pctCrudo, 96) : pctCrudo;
    return { dijeron, contadas, porContar, porConfirmar, sinNombre, conDiferencia, sinTallas, entran, despues: contadas - entran, pct, diferencia: dijeron == null ? null : contadas - dijeron, listoParaCerrar: porContar === 0 && porConfirmar === 0 && sinNombre === 0 };
  };
  const pasaFiltro = (m) => {
    const e = estado(m).clave;
    if (E.filtro === "por-contar" && e !== "por-contar") return false;
    if (E.filtro === "diferencia" && !(e === "diferencia" || e === "confirmar")) return false;
    if (E.filtro === "tallas" && !(faltanTallas(m) || porCrear(m))) return false;
    if (E.filtro === "llevar" && !porLlevar(m)) return false;
    if (E.buscar && !`${m.nombre} ${m.cat}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(E.buscar.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""))) return false;
    return true;
  };
  const cuenta = (f) => E.modelos.filter((m) => (f === "llevar" ? porLlevar(m) > 0 : f === "tallas" ? faltanTallas(m) || porCrear(m) : f === "diferencia" ? ["diferencia", "confirmar"].includes(estado(m).clave) : estado(m).clave === f)).length;
  /** El que sigue: el primero sin contar (después del actual, o desde el principio). */
  const elQueSigue = () => { const i = E.modelos.indexOf(actual()); return E.modelos.slice(i + 1).find((m) => !contado(m)) || E.modelos.find((m) => !contado(m) && m.id !== E.actual) || null; };

  // ── Los casos (lo que una colaboradora puede causar) ──
  const CASOS = [
    ["medias", "A medias", "Un modelo contado y repartido a medias; tres por contar."],
    ["llevar", "Listo para el stock", "Repartió las 10: el botón principal es llevarlas al stock ya, para venderlas hoy."],
    ["abierto", "Recién abierto", "Nadie contó nada todavía: la pantalla dice por dónde empezar."],
    ["faltan", "Llegaron menos", "Dijeron 7 y contó 5: se anota y se explica al cerrar."],
    ["sobran", "Llegaron más", "Dijeron 6 y contó 8: entran igual y Compras lo ve."],
    ["nollego", "No llegó nada", "Un modelo en cero, con su «Deshacer»."],
    ["raro", "Número raro", "Escribió 40 donde dijeron 4: se pregunta antes de darlo por bueno."],
    ["demas", "Repartió de más", "En la hoja de tallas suman 12 y contó 10."],
    ["danado", "Algo dañado", "Dos prendas dañadas, anotadas con qué se hace con ellas."],
    ["stock", "Ya entró una parte", "4 ya están en el stock y faltan repartir 6: lo contado no baja de 4."],
    ["offline", "Sin conexión", "Se cayó el internet a medio conteo: nada se pierde."],
    ["otra", "Otra persona contó", "Lucía contó el mismo modelo hace 2 minutos."],
    ["agregado", "Algo que no estaba", "Llegó un top que no está en la lista, todavía sin nombre."],
    ["todo", "Todo contado", "Queda revisar y cerrar."],
    ["grande", "Envío grande", "36 modelos en 6 categorías: buscar, filtrar y plegar."],
    ["sinaviso", "Sin aviso", "Nadie lo despachó desde el sistema: no hay «dijeron»."],
  ];
  function contarTodo() {
    const por = { quoy: { contadas: 4, modo: "despues", rep: {} }, asora: { contadas: 7, modo: "despues", rep: {} }, lunares: { contadas: 10, modo: "ahora", rep: { "Blanco|S": 7, "Negro|M": 3 } }, carla: { contadas: 4, modo: "ahora", rep: { "Negro|28": 4 } } };
    E.modelos.forEach((m) => { if (por[m.id]) Object.assign(m, por[m.id], { raro: false }); else if (!contado(m)) { m.contadas = m.dijeron ?? 3; m.modo = "despues"; } m.provisional = false; });
  }
  function envioGrande() {
    const base = { Tops: ["Top Quoy", "Top Asora", "Top Estampado con Lunares", "Top Halter Marfil", "Top Canalé Básico", "Top Asimétrico Noche", "Top Cruzado Arena", "Top Bandeau Lino"], Pantalones: ["Pantalón Carla", "Pantalón Mía", "Pantalón Palazzo Brisa", "Pantalón Cargo Olivo", "Pantalón Sastre Gris", "Pantalón Culotte Crudo"], Vestidos: ["Vestido Antonella", "Vestido Sofía", "Vestido Midi Sol", "Vestido Camisero Azul", "Vestido Lencero Negro", "Vestido Túnica Arena", "Vestido Cruzado Verde"], Blusas: ["Blusa Emma", "Blusa Valentina", "Blusa Aurora", "Blusa Cantuta", "Blusa Amancae", "Blusa Lino Brisa"], Casacas: ["Casaca Luciana", "Casaca Ximena", "Casaca Corta Drill", "Casaca Biker Camel", "Casaca Oversize Beige"], Faldas: ["Falda Ariana", "Falda Renata", "Falda Plisada Luna", "Falda Midi Satín"] };
    const tallasDe = { Pantalones: ["28", "30", "32"] };
    let k = 0;
    return Object.entries(base).flatMap(([cat, nombres]) => nombres.map((nombre) => {
      const dijeron = [6, 7, 10, 12, 4, 8, 15, 5, 9][k % 9];
      const hecho = k % 5 === 0 || k % 7 === 0, tipo = k % 3 === 1 ? "nuevo" : "restock";
      const m = { id: `g${k}`, cat, nombre, tipo, dijeron, contadas: hecho ? (k % 10 === 0 ? dijeron - 2 : dijeron) : null, modo: hecho ? (tipo === "nuevo" ? "despues" : "ahora") : null, costo: `${20 + (k % 6) * 5}.00`, tallas: tallasDe[cat] || ["S", "M", "L"], colores: [["Negro", "#2D2C2F"], ["Beige", "#D5BA98"], ["Blanco", "#F4F9FF"]], rep: {}, danadas: [], obs: [], lunares: nombre === "Top Estampado con Lunares" };
      if (hecho && tipo === "restock" && k % 10 !== 0 && k % 7 !== 0) m.rep = { [`Negro|${m.tallas[0]}`]: m.contadas };
      k++;
      return m;
    }));
  }
  function caso(id) {
    const chapa = E.chapaAbierta;
    E = INICIAL(); E.caso = id; E.chapaAbierta = chapa;
    const M = porId;
    if (id === "abierto") { Object.assign(M("lunares"), { contadas: null, modo: null, rep: {} }); E.actual = "quoy"; }
    if (id === "llevar") { M("lunares").rep = { "Blanco|S": 7, "Negro|M": 3 }; }
    if (id === "faltan") { Object.assign(M("asora"), { contadas: 5, modo: "despues" }); E.actual = "asora"; }
    if (id === "sobran") { Object.assign(M("quoy"), { contadas: 8, modo: "despues" }); E.actual = "quoy"; }
    if (id === "nollego") { Object.assign(M("quoy"), { contadas: 0 }); E.actual = "quoy"; }
    if (id === "raro") { Object.assign(M("carla"), { contadas: 40, modo: "ahora", raro: true }); E.actual = "carla"; }
    if (id === "demas") { M("lunares").rep = { "Blanco|S": 7, "Negro|M": 5 }; abrirTallas(M("lunares")); }
    if (id === "danado") { Object.assign(M("lunares"), { rep: { "Blanco|S": 7, "Negro|M": 3 }, danadas: [{ v: "Blanco · S", n: 2, que: "Se devuelve al proveedor" }] }); }
    if (id === "stock") { Object.assign(M("lunares"), { enStock: 4, rep: { "Blanco|S": 4 } }); }
    if (id === "offline") { Object.assign(M("asora"), { contadas: 7, modo: "despues" }); E.offline = true; E.porEnviar = 2; E.actual = "asora"; }
    if (id === "otra") { Object.assign(M("asora"), { contadas: 7, modo: "despues", conflicto: { quien: "Lucía", valor: 5, hace: "hace 2 min" } }); E.actual = "asora"; }
    if (id === "agregado") { E.modelos.splice(2, 0, { id: "top1", cat: "Tops", nombre: "Top 1", provisional: true, agregado: true, tipo: "nuevo", dijeron: null, contadas: 3, modo: "despues", costo: null, tallas: ["S", "M"], colores: [["Crudo", "#F3ECE0"]], rep: {}, danadas: [], obs: [] }); E.actual = "top1"; }
    if (id === "todo") { contarTodo(); E.actual = "carla"; }
    if (id === "grande") { E.modelos = envioGrande(); E.actual = E.modelos.find((m) => !contado(m)).id; }
    if (id === "sinaviso") { E.sinAviso = true; E.modelos = [
      { id: "blusa1", cat: "Blusas", nombre: "Blusa 1", provisional: true, agregado: true, tipo: "nuevo", dijeron: null, contadas: 12, modo: "despues", costo: null, tallas: ["S", "M", "L"], colores: [["Crudo", "#F3ECE0"]], rep: {}, danadas: [], obs: [] },
      { id: "carla2", cat: "Pantalones", nombre: "Pantalón Carla", agregado: true, tipo: "restock", dijeron: null, contadas: null, modo: null, costo: "45.00", tallas: ["28", "30", "32"], colores: [["Beige", "#D5BA98"], ["Negro", "#2D2C2F"]], rep: {}, danadas: [], obs: [] },
    ]; E.actual = "carla2"; }
  }

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
  const btn = (texto, peso = "secundario", attrs = "", { antes = "", despues = "", chico = false, clase = "" } = {}) =>
    `<button type="button" class="btn-cayla btn-${peso}${chico ? " btn-chico" : ""}${clase ? ` ${clase}` : ""}" ${attrs}><span class="relative"><span class="inline-flex items-center gap-2">${antes}${texto}${despues}</span></span></button>`;
  const globito = (n, pide = false) => `<span class="globito" ${pide ? 'data-pide=""' : ""} aria-hidden="true">${miles(n)}</span>`;
  const mini = (m, tam = "h-12 w-12") =>
    `<div aria-hidden="true" data-color-dato="true" class="pointer-events-none relative flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg @container gap-1 p-1 ${tam}" style="background-color: ${m.lunares ? "#1d1b1a" : "rgb(229, 219, 210)"}; color: rgb(128, 92, 76); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-tinta-fija) 10%, transparent);${m.lunares ? " background-image: radial-gradient(circle, #fff 1.5px, transparent 2px); background-size: 9px 9px; color: #fff;" : ""}">${m.lunares ? "" : catIc(m.cat, "aspect-square h-auto w-1/2 min-w-5 max-w-14 shrink-0")}</div>`;
  const pildora = (texto, puesta, attrs = "", n = null) => `<button type="button" class="pildora-cayla" aria-pressed="${puesta}" ${attrs}>${texto}${n != null ? globito(n) : ""}</button>`;
  const lente = (n, s) => `<span class="rm-paso-num rd-lente" data-estado="${s}" aria-hidden="true">${s === "hecho" ? lucide("check", "") : n}</span>`;
  const sigueAqui = `<span class="hilo-etiqueta rd-sigue">Sigue aquí</span>`;
  const avisoLinea = (tono, titulo, detalle, acciones = "") => `<div data-tono="${tono}" role="${tono === "error" ? "alert" : "status"}" class="aviso-linea chico rd-aviso"><span class="aviso-linea-ic trazo-dibuja">${lucide(tono === "info" ? "info" : "triangle-alert", "")}</span><div><p class="aviso-linea-tit">${titulo}</p>${detalle ? `<div class="aviso-linea-det">${detalle}</div>` : ""}</div>${acciones ? `<span class="aviso-linea-acc rd-aviso-acc">${acciones}</span>` : ""}</div>`;

  /** El Dial real (ADR-0575). */
  function dial(m) {
    const hay = contado(m);
    const contadas = m.contadas || 0;
    const dijeron = m.dijeron;
    const pct = dijeron ? Math.min(100, (contadas / dijeron) * 100) : hay && contadas > 0 ? 100 : 0;
    const exceso = dijeron && contadas > dijeron ? Math.min(100, ((contadas - dijeron) / dijeron) * 100) : 0;
    const clase = !hay ? "" : dijeron == null ? (contadas > 0 ? "rc-dial--cuadra" : "") : contadas === dijeron ? "rc-dial--cuadra" : contadas > dijeron ? "rc-dial--sobra" : "";
    const cortes = Array.from({ length: 10 }, (_, k) => { const a = (k * 36 * Math.PI) / 180; const c = Math.cos(a), s = Math.sin(a); return `<line class="rc-dial-corte" x1="${145 + 94 * c}" y1="${145 + 94 * s}" x2="${145 + 116 * c}" y2="${145 + 116 * s}" style="--i: ${k};"></line>`; }).join("");
    const small = !hay ? (dijeron == null ? "escribe cuántas" : `de ${miles(dijeron)}`) : dijeron == null ? "contadas" : contadas === dijeron ? `cuadra · ${miles(dijeron)}` : contadas > dijeron ? `sobran ${miles(contadas - dijeron)}` : contadas === 0 ? "no llegó" : `faltan ${miles(dijeron - contadas)} de ${miles(dijeron)}`;
    const minimo = m.enStock || 0;
    const centro = E.editando
      ? `<input data-k="dial" class="rc-dial-caja" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" aria-label="Cuántas llegaron de ${esc(m.nombre)}" value="${hay ? contadas : ""}" placeholder="0">`
      : `<button type="button" class="rc-dial-numero" data-editar aria-label="Escribir cuántas llegaron de ${esc(m.nombre)} (ahora ${contadas})" title="Toca para escribir el número">${odo(contadas)}</button>`;
    return `<div class="rc-dial ${clase}" data-cifras="${String(contadas).length}">
      <svg viewBox="0 0 290 290" aria-hidden="true" class="rc-dial-aro"><circle class="rc-dial-pista" cx="145" cy="145" r="105"></circle><circle class="rc-dial-arco" cx="145" cy="145" r="105" pathLength="100" style="stroke-dashoffset: ${100 - pct};"></circle><circle class="rc-dial-luz" cx="145" cy="145" r="101" pathLength="100" style="stroke-dashoffset: ${Math.max(4, 104 - pct)};"></circle>${cortes}<circle class="rc-dial-brillo" cx="145" cy="145" r="105" pathLength="100"></circle><circle class="rc-dial-exceso" cx="145" cy="145" r="128" pathLength="100" style="stroke-dashoffset: ${100 - exceso};"></circle><g class="rc-dial-perilla" style="transform: rotate(${pct * 3.6}deg);"><circle class="rc-dial-chispa" cx="250" cy="145" r="15"></circle><circle class="rc-dial-perilla-borde" cx="250" cy="145" r="15"></circle><circle class="rc-dial-perilla-punto" cx="250" cy="145" r="5"></circle></g></svg>
      <span aria-hidden="true" class="rc-dial-halo"></span>
      <div class="rc-dial-centro">${centro}<small aria-live="polite">${small}</small></div>
      <span aria-hidden="true" class="rc-dial-visto">${lucide("check", "h-5 w-5")}</span>
      <button type="button" aria-label="Una menos" class="rc-dial-boton rc-dial-boton--menos" data-suma="-1" ${contadas <= minimo ? "disabled" : ""}>${lucide("minus", "h-5 w-5")}</button>
      <button type="button" aria-label="Una más" class="rc-dial-boton rc-dial-boton--mas" data-suma="1">${lucide("plus", "h-5 w-5")}</button>
    </div>`;
  }
  function trayecto(parada, pct, texto) {
    const tono = pct >= 100 ? "listo" : "trabaja";
    const nombres = ["Salió", "En camino", "Contando", "Por terminar", "Recibido"];
    const paradas = nombres.map((n, j) => (j === parada ? "" : `<span class="rc-tray-parada" ${j < parada ? 'data-hecha=""' : ""} ${j === 0 || j === 4 ? 'data-extremo=""' : ""} style="left: ${j * 25}%; --j: ${j};">${j < parada ? lucide("check", "") : ""}<em>${n}</em></span>`)).join("");
    const ic = parada === 4 ? "check" : "package-open";
    return `<div class="rc-tray-cabecera"><div class="rc-tray" data-forma="completa" data-tono="${tono}" role="img" aria-label="${nombres[parada]}${texto ? `: ${texto}` : ""}" style="--tc: ${colorDeAvance(pct)};"><div class="rc-tray-camino"><div class="rc-tray-via"><span class="rc-tray-lleno" style="width: ${parada * 25}%;"></span></div>${paradas}<span class="rc-tray-marca" style="left: ${parada * 25}%;"><span class="rc-tray-halo"></span><span class="rc-tray-bola" style="--pp: ${Math.round(pct)};">${lucide(ic, "")}</span><span class="rc-tray-texto"><b>${nombres[parada]}</b>${texto ? `<small>${texto}</small>` : ""}</span></span></div></div></div>`;
  }
  function cabecera({ parada, pct, texto, detalle = "" }) {
    return `<header data-voz="cabecera" class="flex flex-wrap items-center justify-between gap-x-10 gap-y-5">
      <div class="anim-sube min-w-0"><div class="flex items-center gap-3"><a aria-label="Volver a Recibir mercadería" title="Volver a Recibir mercadería" data-pieza="volver" data-nota="Vuelve a la lista de envíos. Lo contado ya está guardado: puedes seguir después." class="group relative grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-sand bg-papel text-tinta transition-colors hover:border-tinta/40 after:absolute after:inset-0 after:rounded-full after:content-['']" href="#">${lucide("arrow-left", "h-4 w-4 transition-transform duration-200 ease-cayla group-hover:-translate-x-0.5")}</a><p class="flex min-w-0 items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-taupe-profundo"><span aria-hidden="true" class="hilo-dibuja block h-px w-8 shrink-0 bg-taupe"></span><span class="min-w-0">${D.sede} · <time>${D.fecha} · 10:45</time> · ${E.sinAviso ? "Sin aviso" : D.envio}${detalle ? ` · ${detalle}` : ""}</span></p></div><h1 class="font-display mt-3 text-4xl leading-none tracking-tight text-tinta sm:text-[46px]">Recibir mercadería<button type="button" class="ayuda-cab-q" aria-label="Qué es Recibir mercadería" data-nota="Aquí se abre la ayuda de la pantalla."><span aria-hidden="true">?</span></button></h1></div>
      <div class="anim-sube flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-3 sm:justify-end grow basis-[20rem] sm:max-w-[28rem]" style="--i:1"><div class="w-full">${trayecto(parada, pct, texto)}</div></div>
    </header>`;
  }

  // ═════════ CONTAR: dos mitades ═════════
  /** La mitad izquierda: las categorías con sus modelos. Arriba, cómo va todo; abajo, cerrar. */
  function mitadLista() {
    const c = cifras();
    const m0 = actual();
    const vis = E.modelos.filter(pasaFiltro);
    const sigue = elQueSigue();
    const grande = E.modelos.length > 12;
    const secciones = cats().map((cat, i) => {
      const todos = E.modelos.filter((m) => m.cat === cat), suyos = vis.filter((m) => m.cat === cat);
      if (!suyos.length) return "";
      const d = todos.reduce((a, m) => a + (m.dijeron || 0), 0), k = todos.reduce((a, m) => a + (m.contadas || 0), 0);
      const porContar = todos.filter((m) => !contado(m)).length;
      const pct = E.sinAviso || !d ? (porContar ? ((todos.length - porContar) / todos.length) * 100 : 100) : (k / d) * 100;
      const filtrando = E.filtro !== "todos" || !!E.buscar;
      const abierta = filtrando || (E.cerradas[cat] === undefined ? !grande || todos.includes(m0) : !E.cerradas[cat]);
      const resumen = E.sinAviso || !d ? `${prendas(k)} contadas` : `Contaste <b>${miles(k)}</b> de ${miles(d)}`;
      return `<div class="rc-cat rd-cat" data-key="cat-${cat}" ${abierta ? 'data-abierta=""' : ""} style="--i: ${Math.min(i, 6)};">
        <div class="rc-cat-tira"><button type="button" class="rc-cat-cabeza" data-cat="${cat}" aria-expanded="${abierta}"><span class="rc-cat-ic" data-tamano="chico" aria-hidden="true">${catIc(cat)}</span><span class="rc-cat-textos"><b>${cat}</b><span class="rc-cat-resumen">${resumen}${porContar ? ` · <span class="rd-cat-falta">${porContar} por contar</span>` : ` · <span class="rd-cat-ok">${lucide("check", "h-3.5 w-3.5")} todo contado</span>`}</span><span class="rc-cat-barra">${barra(pct, "fina")}</span></span>${lucide("chevron-down", "rc-cat-flecha h-4 w-4")}</button></div>
        <div class="rc-cat-cuerpo"><div class="rc-cat-dentro"><ul class="rc-modelos">${suyos.map((m) => `<li class="rc-modelo-fila" data-key="mod-${m.id}"><button type="button" class="rc-modelo rd-fila" data-modelo="${m.id}" ${m.id === E.actual ? 'data-activa="" aria-current="true"' : ""} ${E.recien === m.id ? 'data-recien=""' : ""}>${mini(m)}<span class="rc-modelo-textos"><span class="rc-modelo-nombre"><b title="${esc(m.nombre)}">${esc(m.nombre)}</b>${m.tipo === "nuevo" ? chip("Nuevo", "pizarra", { punto: false, icono: "sparkles" }) : ""}</span><span class="rc-modelo-cifras"><b>${miles(m.contadas || 0)}</b>${m.dijeron != null ? ` de ${miles(m.dijeron)}` : " contadas"}${m.danadas?.length ? ` · ${m.danadas.reduce((a, x) => a + x.n, 0)} dañadas` : ""}${m.modo === "despues" && contado(m) && m.contadas > 0 ? " · tallas después" : ""}${(m.enStock || 0) > 0 && !todoEnStock(m) ? ` · ${miles(m.enStock)} en el stock` : porLlevar(m) > 0 && repartidas(m) === m.contadas ? " · listas para el stock" : ""}</span></span>${sigue && sigue.id === m.id && m.id !== E.actual ? `<span class="rd-sigue-fila">Sigue</span>` : ""}${chipEstado(m)}${lucide("chevron-right", "rd-fila-flecha h-4 w-4")}</button></li>`).join("")}
          <li data-key="mas-${cat}"><button type="button" class="rd-otro" data-agregar="${cat}">${lucide("plus", "h-4 w-4")}Agregar otro modelo de ${cat}</button></li></ul></div></div>
      </div>`;
    }).join("");
    const vacio = `<div class="vacio rd-vacio" role="status"><span class="vacio-ic trazo-dibuja" aria-hidden="true">${lucide("search", "")}</span><h2 class="vacio-tit">${E.buscar ? `Nada con «${esc(E.buscar)}»` : "Ningún modelo así"}</h2><p class="vacio-frase">${E.buscar ? "Revisa cómo está escrito, o búscalo por su categoría." : E.filtro === "por-contar" ? "Ya contaste todos los modelos." : E.filtro === "diferencia" ? "Todo lo contado coincide con lo que dijeron." : "A ningún modelo le faltan tallas."}</p><div class="vacio-acciones">${btn("Ver todos los modelos", "primario", 'data-ver-todos=""')}</div></div>`;
    const todo = c.listoParaCerrar;
    const faltaTxt = c.porContar ? `Faltan ${modelosTxt(c.porContar)} por contar` : c.porConfirmar ? `${modelosTxt(c.porConfirmar)} por confirmar` : c.sinNombre ? `${modelosTxt(c.sinNombre)} sin nombre` : "Todo contado";
    return `<section class="rc-panel rd-panel rd-lista" aria-label="${E.sinAviso ? "Lo que llegó" : "Categorías del envío"}" style="--i: 0;">
      <div class="rd-cab">
        <div class="titulo-seccion"><h2 class="titulo-seccion-texto">${E.sinAviso ? "Lo que llegó" : "Categorías del envío"}</h2><span class="titulo-seccion-lado"><span class="titulo-seccion-dato">${modelosTxt(E.modelos.length)}</span></span></div>
        <div class="rd-avance" aria-live="polite">${barra(c.pct, "normal")}<p><b>${odo(c.contadas)}${c.dijeron != null ? ` de ${miles(c.dijeron)}` : ""} prendas contadas</b><span data-tono="${todo ? "verde" : ""}">${todo ? (c.diferencia ? `Todo contado · diferencia ${signo(c.diferencia)}` : "Todo contado") : faltaTxt}</span></p></div>
        <div class="rd-buscar">
          <div class="buscador">${lucide("search", "buscador-icono")}<input data-k="buscar" autocomplete="off" spellcheck="false" placeholder="Buscar un modelo…" aria-label="Buscar un modelo o una categoría" type="search" value="${esc(E.buscar)}"><span class="buscador-senal" aria-hidden="true">Buscando…</span><kbd class="buscador-atajo" aria-hidden="true">/</kbd><span class="buscador-hilo" aria-hidden="true"></span></div>
          <div class="pildora-filtro shrink-0 rd-boton-filtros" ${E.filtrosAbiertos ? 'data-abierta=""' : ""}><button type="button" class="pildora-filtro-boton" data-filtros="" aria-expanded="${E.filtrosAbiertos}" aria-controls="rd-filtros-panel" aria-label="${E.filtro !== "todos" ? "Filtros · 1 puesto" : "Filtros"}">${lucide("sliders", "pildora-filtro-icono")}<span class="pildora-filtro-nombre">Filtros</span>${E.filtro !== "todos" ? `<span aria-hidden="true" class="titulo-cuenta pildora-filtro-cuenta">1</span>` : ""}${lucide("chevron-down", "pildora-filtro-flecha")}</button></div>
        </div>
        <div class="rd-filtros-panel" id="rd-filtros-panel" ${E.filtrosAbiertos ? 'data-abierto=""' : ""}><div><div class="rd-filtros" role="group" aria-label="Filtrar la lista">${[["todos", "Todos", E.modelos.length], ["por-contar", "Por contar", cuenta("por-contar")], ...(E.sinAviso ? [] : [["diferencia", "Con diferencia", cuenta("diferencia")]]), ["tallas", "Faltan tallas", cuenta("tallas")], ["llevar", "Por llevar al stock", cuenta("llevar")]].map(([f, t, n], k) => `<button type="button" class="pildora-cayla" style="--i:${k}" aria-pressed="${E.filtro === f}" data-filtro="${f}" ${E.filtrosAbiertos ? "" : 'tabindex="-1"'}>${t}${globito(n)}</button>`).join("")}</div></div></div>
        ${E.filtro !== "todos" && !E.filtrosAbiertos ? `<div class="rd-puestos" data-key="puestos"><span>Viendo solo:</span><button type="button" class="vacio-filtro anim-entrada" data-quitar-filtro="" aria-label="Quitar el filtro">${{ "por-contar": "Por contar", diferencia: "Con diferencia", tallas: "Faltan tallas", llevar: "Por llevar al stock" }[E.filtro]}${lucide("x", "h-3.5 w-3.5")}</button><span class="rd-puestos-n">${vis.length} de ${modelosTxt(E.modelos.length)}</span></div>` : ""}
      </div>
      <div class="rc-scroll scroll-cayla rd-cuerpo"><nav aria-label="Categorías del envío">${secciones || vacio}</nav>
        ${secciones ? `<button type="button" class="rd-llego" data-agregar="">${lucide("plus", "h-4 w-4")}<span><b>Llegó algo que no está en la lista</b><small>Agrégalo y cuéntalo igual</small></span></button>` : ""}
      </div>
      <div class="rd-pie">
        <div class="rd-pie-izq"><button type="button" class="rm-quien" data-globo="quien" aria-expanded="${E.globo === "quien"}"><span class="rm-avatar" aria-hidden="true">${D.quien.iniciales}</span><span class="rd-quien-txt">Cuenta ${D.quien.nombre}</span>${lucide("chevron-down", "h-4 w-4")}</button><button type="button" class="rm-redondo" data-globo="admin" aria-expanded="${E.globo === "admin"}" aria-label="Sobre este envío" title="Sobre este envío">${lucide("info", "h-[18px] w-[18px]")}</button>
          ${E.globo === "quien" ? `<div class="rm-globo rm-menu rd-globo-arriba" role="menu"><p style="padding:6px 10px 8px">Cada categoría guarda quién la contó. Varias personas pueden contar a la vez; firma quien cierra.</p>${[["FA", "Felipe Alvarez", "Admin · queda a tu nombre"], ["LP", "Lucía Prueba", "Tienda Lima · marcó su entrada"]].map(([i, n, s], k) => `<button type="button" role="menuitem" style="--i:${k}" data-nota="En el ERP aquí se elige quién cuenta (el combo Responsable)."><span class="rm-avatar">${i}</span><span><b style="display:block;font-weight:600">${n}</b><small style="color:var(--color-taupe)">${s}</small></span>${D.quien.iniciales === i ? lucide("check", "h-4 w-4 ml-auto") : ""}</button>`).join("")}</div>` : ""}
          ${E.globo === "admin" ? `<div class="rm-globo rd-globo-arriba"><b>${E.sinAviso ? "Llegó sin aviso" : `${D.envio} · ${D.proveedor}`}</b><p>${E.sinAviso ? "Nadie lo despachó desde el sistema: cuentas lo que llegó, sin «dijeron» con qué comparar. Al cerrar eliges el proveedor." : `Guía ${D.guia} · lo despachó ${D.despachadoPor}. Lo compraste tú: lo puedes recibir porque eres Admin, y al cerrar queda anotado.`}</p><p>Lo que cuentas <b style="display:inline">se guarda solo</b>. Puedes salir y seguir después.</p><div class="rd-globo-acciones">${btn("Fotos de la guía", "secundario", 'data-nota="Aquí se ven y se suben las fotos de la guía y de la factura."', { antes: lucide("camera", "h-4 w-4"), chico: true })}${btn("No llegó nada: cancelar", "enlace", 'data-hoja-abrir="cancelar"')}</div></div>` : ""}
        </div>
        <div class="rd-pie-der"><span class="rd-pie-falta" data-tono="${todo ? "verde" : ""}">${todo ? `${lucide("check", "h-4 w-4")} Todo contado` : faltaTxt}</span>${btn("Revisar y cerrar", todo ? "primario" : "secundario", `data-cerrar-conteo="" aria-expanded="${E.globo === "faltan"}"`, { despues: lucide("arrow-right", "h-4 w-4 shrink-0") })}
          ${E.globo === "faltan" ? globoFaltan(c) : ""}</div>
      </div>
    </section>`;
  }
  /** Lo que falta antes de cerrar, tocable: cada línea lleva a su modelo. */
  function globoFaltan(c) {
    const filas = E.modelos.filter((m) => !contado(m) || m.raro || m.provisional).slice(0, 6).map((m, k) => `<button type="button" role="menuitem" style="--i:${k}" data-modelo="${m.id}">${mini(m, "h-9 w-9")}<span><b style="display:block;font-weight:600">${esc(m.nombre)}</b><small style="color:var(--color-taupe)">${!contado(m) ? "Falta contarlo" : m.raro ? `¿Seguro que llegaron ${miles(m.contadas)}?` : "Ponle su nombre"}</small></span>${lucide("chevron-right", "h-4 w-4 ml-auto")}</button>`).join("");
    const mas = c.porContar + c.porConfirmar + c.sinNombre - 6;
    return `<div class="rm-globo rm-menu rd-globo-arriba rd-globo-faltan" role="menu"><p style="padding:6px 10px 8px"><b style="display:block;color:var(--color-tinta)">Antes de cerrar falta esto</b>Toca uno y te llevo.</p>${filas}${mas > 0 ? `<p style="padding:6px 10px">y ${mas} más: usa el filtro «Por contar».</p>` : ""}<div class="rd-globo-acciones" style="padding:8px 10px 4px">${btn("Revisar igual", "enlace", 'data-ir="cerrar"')}<small style="color:var(--color-taupe)">Lo que no cuentes queda como «no llegó».</small></div></div>`;
  }

  /** La tarjeta de tallas y colores: dice cómo va y tiene UN botón, que abre la hoja. */
  function tarjetaTallas(m) {
    const hay = contado(m), n = m.contadas || 0, rep = repartidas(m), falta = n - rep;
    const resumen = Object.entries(m.rep).filter(([, v]) => v > 0).map(([k, v]) => { const [c, t] = k.split("|"); const hex = (m.colores.find(([x]) => x === c) || [])[1] || "#ccc"; return `<span class="rd-rep"><i style="background:${hex}"></i>${esc(c)} ${esc(t)} <b>×${miles(v)}</b></span>`; }).join("");
    const caja = (tono, ic, titulo, texto, acciones, extra = "") => `<div class="rd-tallas" data-tono="${tono}"><span class="rd-tallas-ic">${lucide(ic, "h-5 w-5")}</span><div class="rd-tallas-txt"><b>${titulo}</b><p>${texto}</p>${extra}</div><div class="rd-tallas-acc">${acciones}</div></div>`;
    if (!hay) return caja("espera", "grid", "Todavía no", "Primero cuenta cuántas llegaron.", "");
    if (n === 0) return caja("espera", "ban", "No llegó", "No hay nada que repartir.", "");
    if (m.raro) return caja("espera", "grid", "Todavía no", "Confirma primero cuántas llegaron.", "");
    if (m.tipo === "nuevo" && !m.creada) {
      return m.modo === "ahora"
        ? caja("ahora", "sparkles", "Es una prenda nueva", "Todavía no está en el catálogo. Créala para ponerle tallas y colores.", btn("Crear la prenda", "primario", 'data-hoja-abrir="crear"', { antes: lucide("sparkles", "h-4 w-4") }) + btn("Dejar para después", "enlace", 'data-modo="despues"'))
        : caja("despues", "clock", "Queda para después", `Es una prenda nueva: las ${miles(n)} quedan guardadas en el almacén y se venden cuando la crees.`, btn("Crearla ahora", "secundario", 'data-hoja-abrir="crear"', { antes: lucide("sparkles", "h-4 w-4") }));
    }
    if (m.modo === "despues") return caja("despues", "clock", "Queda para después", `Las ${miles(n)} quedan guardadas en el almacén. Se venden cuando les pongas tallas y colores.`, btn("Repartir ahora", "secundario", 'data-hoja-abrir="tallas"', { antes: lucide("grid", "h-4 w-4") }));
    const st = m.enStock || 0, llevar = porLlevar(m);
    const llevarBtn = (texto, peso) => btn(texto, peso, 'data-hoja-abrir="llevar"', { antes: lucide("package-check", "h-[18px] w-[18px]"), clase: "rd-llevar" });
    // Todo repartido y ya en el almacén: lo que sigue es etiquetar y bajar al piso.
    if (falta === 0 && rep > 0 && st === rep) return caja("stock", "package-check", `Las ${miles(n)} ya están en el stock`, "Están en el almacén: se venden cuando las bajes al piso.", btn(`Imprimir ${miles(n)} etiquetas`, "secundario", 'data-nota="Aquí se imprimen las etiquetas de precio de estas prendas."', { antes: lucide("printer", "h-4 w-4") }) + btn("Bajar al piso", "enlace", 'data-nota="Aquí se bajan al piso para venderlas."'), `<div class="rd-reps">${resumen}</div>`);
    // Todo repartido: el botón principal es llevarlo al stock YA (es lo que casi siempre hacen, para venderlo hoy).
    if (falta === 0 && rep > 0) return caja("llevar", "check", `Repartidas las ${miles(n)}`, st ? `${miles(st)} ya están en el stock. Lleva las otras ${miles(llevar)} para venderlas hoy.` : "Llévalas al stock ya para venderlas hoy. Si no, entran solas al cerrar el envío.", llevarBtn(st ? `Llevar ${miles(llevar)} al stock` : "Llevar al stock ahora", "primario") + btn("Editar tallas", "enlace", 'data-hoja-abrir="tallas"'), `<div class="rd-reps">${resumen}</div>`);
    if (rep > 0) return caja("ahora", "grid", `Repartiste ${miles(rep)} de ${miles(n)}`, falta > 0 ? `Faltan ${miles(falta)} por repartir.${st ? ` ${miles(st)} ya están en el stock.` : ""}` : `Te pasaste por ${miles(-falta)}: revísalo.`, btn("Seguir repartiendo", "primario", 'data-hoja-abrir="tallas"', { antes: lucide("grid", "h-4 w-4") }) + (llevar > 0 ? llevarBtn(`Llevar ${miles(llevar)} al stock ya`, "secundario") : btn("Dejar para después", "enlace", 'data-modo="despues"')), `<div class="rd-reps">${resumen}</div>${barra((rep / n) * 100, "fina")}`);
    return caja("ahora", "grid", `Reparte las ${miles(n)} por talla y color`, "Así entran al stock al cerrar y se pueden vender.", btn("Repartir ahora", "primario", 'data-hoja-abrir="tallas"', { antes: lucide("grid", "h-4 w-4") }) + btn("Dejar para después", "enlace", 'data-modo="despues"'));
  }

  /** La mitad derecha: el contador de UNA prenda. Mismo esqueleto que la lista: cabeza, cuerpo que corre, pie con lo que sigue. */
  function mitadContador() {
    const m = actual();
    const i = E.modelos.indexOf(m), ant = E.modelos[i - 1] || null, sig = E.modelos[i + 1] || null;
    // «Revisar y cerrar» vive en UN solo lugar (el pie de la lista). Al final de la lista, el contador lleva al modelo que quedó pendiente.
    const pend = sig ? null : E.modelos.find((x) => x.id !== m.id && (!contado(x) || x.raro || x.provisional)) || null;
    const hay = contado(m), n = m.contadas || 0;
    const e = estado(m);
    const [chico, grandeN] = atajos(m.dijeron, n);
    const yaLlegaron = hay && m.dijeron != null && m.dijeron === n && !m.raro;
    const s1 = !hay || m.raro ? "ahora" : "hecho";
    const tallasPend = hay && n > 0 && !m.raro && (faltanTallas(m) || porCrear(m));
    const s2 = !hay || n === 0 || m.raro ? "espera" : tallasPend ? "ahora" : "hecho";
    const esNueva = m.tipo === "nuevo";
    const minimo = m.enStock || 0;
    const avisos = [
      m.raro ? avisoLinea("atencion", `¿Seguro que llegaron ${miles(n)}?`, `Dijeron ${miles(m.dijeron)}. Si te equivocaste al escribir, corrígelo.`, btn(`Sí, son ${miles(n)}`, "secundario", 'data-confirmar-raro=""', { chico: true }) + btn("Corregir", "primario", 'data-editar=""', { chico: true })) : "",
      m.conflicto ? avisoLinea("atencion", `${m.conflicto.quien} también contó este modelo`, `${m.conflicto.hace} puso ${miles(m.conflicto.valor)}. Ahora quedó lo tuyo: ${miles(n)}.`, btn(`Dejar ${miles(n)}`, "secundario", 'data-conflicto="mio"', { chico: true }) + btn(`Poner ${miles(m.conflicto.valor)}`, "secundario", 'data-conflicto="suyo"', { chico: true })) : "",
      minimo > 0 ? avisoLinea("info", `${miles(minimo)} ya entraron al stock`, "Lo contado no puede bajar de ahí. Si hay que corregirlo, se ajusta en Existencias.") : "",
    ].join("");
    const pista = !hay ? (m.dijeron != null ? "Cuenta las prendas y toca el botón verde si llegaron todas, o escribe el número." : "Cuenta las prendas y escribe cuántas llegaron.")
      : m.raro ? "Revisa el número antes de seguir."
      : n === 0 ? "Anotado: no llegó ninguna."
      : m.dijeron != null && n < m.dijeron ? `Faltan ${miles(m.dijeron - n)}: al cerrar dices qué pasó.`
      : m.dijeron != null && n > m.dijeron ? `Llegaron ${miles(n - m.dijeron)} de más: entran igual y Compras lo ve.`
      : "Se guardó solo. Si te equivocaste, corrígelo aquí mismo.";
    const bloque1 = `<div class="rd-bloque" data-key="b1" data-estado="${s1}" style="--i:0">
      <div class="rd-bloque-tit">${lente(1, s1)}<h3>¿Cuántas llegaron?</h3>${s1 === "ahora" && !m.raro ? sigueAqui : chip(E.sinAviso || m.dijeron == null ? `${miles(n)} contadas` : e.clave === "diferencia" || e.clave === "confirmar" ? e.texto : "Cuadra", e.clave === "diferencia" || e.clave === "confirmar" ? "ambar" : "verde")}</div>
      ${avisos}
      <div class="rd-cuenta">${dial(m)}
        <div class="rd-cuenta-lado">
          ${m.dijeron != null ? `<button type="button" class="rc-atajo rc-atajo-llegaron rd-llegaron" data-poner="${m.dijeron}" ${yaLlegaron ? 'data-hecho="" disabled' : ""}>${lucide("check", "h-5 w-5")}<span>${yaLlegaron ? `Llegaron las ${miles(m.dijeron)}` : `Llegaron las ${miles(m.dijeron)}`}</span></button>` : ""}
          <div class="rd-sumas"><div class="rc-suma" role="group" aria-label="Sumar de a varias"><button type="button" data-suma="${chico}">+${chico}</button><button type="button" data-suma="${grandeN}">+${grandeN}</button></div>${n > minimo ? `<button type="button" class="rc-atajo rc-atajo-cero" data-poner="${minimo}">${lucide("rotate-ccw", "h-4 w-4")}${minimo ? `Volver a ${miles(minimo)}` : "Poner en cero"}</button>` : m.dijeron != null && minimo === 0 ? `<button type="button" class="rc-atajo rc-atajo-cero" data-poner="0" ${hay && n === 0 ? 'data-hecho="" disabled' : ""}>${lucide("ban", "h-4 w-4")}No llegó nada</button>` : ""}</div>
          <p class="rd-pista">${pista}</p>
        </div>
      </div>
    </div>`;
    const bloque2 = `<div class="rd-bloque" data-key="b2" data-estado="${s2}" style="--i:1">
      <div class="rd-bloque-tit">${lente(2, s2)}<h3>Tallas y colores</h3>${s2 === "ahora" ? sigueAqui : s2 === "hecho" ? chip(todoEnStock(m) ? "En el stock" : m.modo === "despues" || (esNueva && !m.creada) ? "Para después" : "Repartidas", m.modo === "despues" || (esNueva && !m.creada) ? "pizarra" : "verde") : ""}</div>
      ${tarjetaTallas(m)}
    </div>`;
    const anotado = [...(m.danadas || []).map((d, k) => `<li data-key="dan-${k}">${lucide("triangle-alert", "h-4 w-4")}<span><b>${miles(d.n)} ${d.n === 1 ? "dañada" : "dañadas"}</b>${d.v ? ` · ${esc(d.v)}` : ""} · ${esc(d.que)}</span><button type="button" class="icono-fila grid h-8 w-8 place-items-center" data-quitar-danada="${k}" aria-label="Quitar">${lucide("x", "h-4 w-4")}</button></li>`), ...(m.obs || []).map((o, k) => `<li data-key="obs-${k}">${lucide("message-square-plus", "h-4 w-4")}<span>«${esc(o)}»</span><button type="button" class="icono-fila grid h-8 w-8 place-items-center" data-quitar-obs="${k}" aria-label="Quitar">${lucide("x", "h-4 w-4")}</button></li>`), ...(m.cambiada ? [`<li data-key="cambiada">${lucide("repeat", "h-4 w-4")}<span>Dijeron <b>${esc(m.cambiada)}</b> y llegó esta.</span></li>`] : [])].join("");
    const bloque3 = `<div class="rd-bloque rd-bloque-algo" data-key="b3" style="--i:2">
      <div class="rd-bloque-tit"><h3 class="rd-tit-chico">¿Pasó algo con esta prenda?</h3></div>
      <div class="rd-algo"><button type="button" data-hoja-abrir="danado" ${n > 0 ? "" : "disabled"}>${lucide("triangle-alert", "h-[18px] w-[18px]")}<span>Llegó dañada</span></button><button type="button" data-hoja-abrir="otra">${lucide("repeat", "h-[18px] w-[18px]")}<span>Es otra prenda</span></button><button type="button" data-hoja-abrir="obs">${lucide("message-square-plus", "h-[18px] w-[18px]")}<span>Anotar algo</span></button></div>
      ${anotado ? `<ul class="rd-anotado">${anotado}</ul>` : ""}
    </div>`;
    const menu = [...(m.provisional || esNueva ? [["pencil", m.provisional ? "Ponerle su nombre" : "Cambiar el nombre", 'data-hoja-abrir="nombre"']] : []), ["rotate-ccw", "Corregir lo que entró al stock", (m.enStock || 0) > 0 ? 'data-nota="Aquí salen del almacén y vuelven a lo contado para repartirlas de nuevo (pide el porqué)."' : "disabled"], ["printer", "Imprimir sus etiquetas", (m.enStock || 0) > 0 ? 'data-nota="Aquí se imprimen las etiquetas de precio de esta prenda."' : "disabled"], ...(m.agregado ? [["trash-2", "Quitar este modelo", 'data-quitar-modelo="" data-peligro=""']] : [])];
    const guardado = E.offline && hay ? `<span class="rm-guardado rd-guardado" data-estado="pendiente">${lucide("wifi-off", "h-3.5 w-3.5")}Por enviar</span>` : `<span class="rm-guardado rd-guardado" aria-live="polite" data-estado="${E.guardando ? "guardando" : hay ? "guardado" : ""}">${E.guardando ? `${lucide("rotate-ccw", "h-3.5 w-3.5")}Guardando…` : hay ? `${lucide("check", "h-3.5 w-3.5")}Guardado` : ""}</span>`;
    // Con todo repartido y sin llevar, el botón principal de la mitad es «Llevar al stock ahora» (en la tarjeta); «Listo, siguiente» espera.
    const listoParaStock = porLlevar(m) > 0 && repartidas(m) === n;
    const listoCerrar = cifras().listoParaCerrar;
    const primarioAbajo = hay && !m.raro && !tallasPend && !listoParaStock && !listoCerrar;
    return `<section class="rc-panel rd-panel rd-contador" aria-label="El contador" style="--i: 1;">
      <div class="rd-cab rd-prenda" data-key="prenda-${m.id}">${mini(m, "h-[72px] w-[72px]")}
        <div class="rd-prenda-txt"><p class="rd-prenda-sobre">${m.cat} · ${i + 1} de ${E.modelos.length}</p><h2 class="rd-prenda-nombre">${esc(m.nombre)}${m.provisional ? ` <button type="button" class="rd-nombrar" data-hoja-abrir="nombre">${lucide("pencil", "h-3.5 w-3.5")}Ponle nombre</button>` : ""}</h2><div class="rc-chips">${esNueva ? chip(m.creada ? "Nueva · ya creada" : "Prenda nueva", "pizarra", { punto: false, icono: "sparkles" }) : chip("Ya está en tu catálogo", "neutro", { punto: false, icono: "package" })}${m.dijeron != null ? chip(`Dijeron ${miles(m.dijeron)}`, "neutro", { punto: false, icono: "file-text" }) : chip("No estaba en la lista", "ambar", { punto: false, icono: "plus" })}${m.costo ? chip(`Costo S/ ${m.costo}`, "neutro", { punto: false }) : ""}</div></div>
        <div class="rm-placa-derecha">${guardado}<button type="button" class="rm-mas" data-menu="" aria-expanded="${E.menu}" aria-haspopup="menu">${lucide("ellipsis", "h-4 w-4")}Más</button>${E.menu ? `<div class="rm-globo rm-menu" role="menu">${menu.map(([ic, t, extra], k) => `<button type="button" role="menuitem" style="--i:${k}" ${extra}>${lucide(ic, "h-4 w-4")}${t}</button>`).join("")}</div>` : ""}</div>
      </div>
      <div class="rc-scroll scroll-cayla rd-cuerpo" data-key="cuerpo-${m.id}"><div class="rd-bloques">${bloque1}${bloque2}${bloque3}</div></div>
      <div class="rd-pie${sig || pend ? "" : " rd-pie-solo"}">
        ${btn("Anterior", "secundario", `data-mover="-1" ${ant ? `title="Antes: ${esc(ant.nombre)}"` : "disabled"}`, { antes: lucide("arrow-left", "h-4 w-4 shrink-0") })}
        <span class="rd-pie-sigue">${sig ? `Después: <b>${esc(sig.nombre)}</b>` : pend ? `${!contado(pend) ? "Falta contar" : pend.raro ? "Falta confirmar" : "Falta el nombre"}: <b>${esc(pend.nombre)}</b>` : listoCerrar ? "Es el último modelo" : "Solo falta este modelo"}</span>
        ${sig ? btn(hay ? "Listo, siguiente" : "Saltar por ahora", primarioAbajo ? "primario" : "secundario", `data-mover="1" title="Sigue ${esc(sig.nombre)}"`, { despues: lucide("arrow-right", "h-4 w-4 shrink-0") }) : pend ? btn(hay ? "Listo, ir al que falta" : "Ir al que falta", primarioAbajo ? "primario" : "secundario", `data-ir-pendiente="${pend.id}" title="Sigue ${esc(pend.nombre)}"`, { despues: lucide("arrow-right", "h-4 w-4 shrink-0") }) : ""}
      </div>
    </section>`;
  }
  function vistaContar() {
    const c = cifras();
    const m = actual(), i = E.modelos.indexOf(m);
    const sinRed = E.offline ? `<div class="rd-sinred" role="status" data-key="sinred">${lucide("wifi-off", "h-[18px] w-[18px]")}<p><b>Sin conexión.</b> Sigue contando: lo que cuentes queda en este equipo y se envía solo cuando vuelva el internet${E.porEnviar ? ` (${E.porEnviar} por enviar)` : ""}.</p>${btn("Probar que vuelve", "secundario", 'data-volver-red=""', { chico: true })}</div>` : "";
    const isla = `<div class="rm-isla rd-isla" role="region" aria-label="La lista"><div><b>${c.listoParaCerrar ? "Todo contado" : c.porContar ? `${modelosTxt(c.porContar)} por contar` : "Todos contados"}</b><small>${c.listoParaCerrar ? "" : `${miles(i + 1)} de ${modelosTxt(E.modelos.length)} · `}${miles(c.contadas)}${c.dijeron != null ? ` de ${miles(c.dijeron)}` : ""} prendas</small></div>${c.listoParaCerrar ? `<button type="button" class="rd-isla-lista" data-ver-lista="" aria-label="Ver la lista" title="Ver la lista">${lucide("list-checks", "h-4 w-4")}</button><button type="button" data-cerrar-conteo="">Revisar y cerrar</button>` : `<button type="button" data-ver-lista="">${lucide("list-checks", "h-4 w-4")} Lista</button>`}</div>`;
    return `<div class="space-y-6">${cabecera({ parada: 2, pct: c.pct, texto: c.dijeron != null ? `${miles(c.contadas)} de ${miles(c.dijeron)}` : `${miles(c.contadas)} contadas` })}</div>
      <div class="rd-conteo">${sinRed}<div class="rd-mesa">${mitadLista()}${mitadContador()}</div></div>${isla}
      ${E.hojaLista ? `<div class="rm-hoja rd-hoja-lista" data-cerrar-lista="">${mitadLista()}<span class="rm-hoja-asa" aria-hidden="true"></span></div>` : ""}`;
  }

  // ═════════ LAS HOJAS (el Modal real del ERP: velo, hoja que sube, contenido en cascada) ═════════
  const marcoHoja = (clave, ancho, titulo, sub, cuerpo, pie, { cab = "" } = {}) => `<div class="fixed inset-0 z-50 bg-sombra/35 dark:bg-sombra/60 backdrop-blur-[2px] anim-velo" data-hoja-fuera="" data-key="velo-${clave}"></div>
    <div class="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:p-6 sm:pt-[8vh]" data-key="cont-${clave}">
      <div role="dialog" aria-modal="true" aria-label="${esc(titulo)}" data-key="hoja-${clave}" data-variante="normal" class="pointer-events-auto relative w-full outline-none scroll-cayla overflow-y-auto max-h-[min(90dvh,90%)] rounded-t-2xl hoja-serena p-6 sm:rounded-2xl anim-modal-entra cascada-modal rd-hoja" style="max-width:${ancho}px">
        <button type="button" class="cerrar-hoja absolute right-4 top-4 z-10 rounded-full p-1.5 text-tinta/55 transition-colors hover:bg-tinta/[0.04] hover:text-rojo" data-hoja-cancelar="" aria-label="Cerrar" data-sin-cascada="">${lucide("x", "h-4 w-4")}</button>
        ${cab || `<div><h2 class="font-display text-tinta text-2xl leading-tight pr-8">${titulo}</h2><p class="mb-[18px] mt-1 text-[13.5px] leading-normal text-taupe">${sub}</p></div>`}
        ${cuerpo}
        <div class="pie-hoja-fijo pie-acciones rd-hoja-pie">${pie}</div>
      </div>
    </div>`;
  const cancelarBtn = (texto = "Cancelar") => btn(texto, "secundario", 'data-hoja-cancelar=""');

  function abrirTallas(m) {
    const primera = `${m.colores[0][0]}|${m.tallas[0]}`;
    E.hoja = { tipo: "tallas", id: m.id, rep: copia(m.rep), colores: copia(m.colores), tallas: [...m.tallas], danadas: copia(m.danadas || []), contadas: m.contadas, foco: primera, sucio: false, salir: false, picker: null, dan: null };
  }
  /** La hoja de tallas y colores: la tabla con espacio, cuánto falta siempre a la vista, y ayudas para no teclear de más. */
  function hojaTallas() {
    const h = E.hoja, m = porId(h.id);
    const rep = suma(h.rep), n = h.contadas, falta = n - rep;
    const [fc, ft] = h.foco.split("|");
    const focoVale = h.colores.some(([c]) => c === fc) && h.tallas.includes(ft);
    const pct = n ? Math.min(100, (rep / n) * 100) : 0;
    const estadoTxt = falta > 0 ? `Faltan ${miles(falta)} por repartir` : falta < 0 ? `Te pasaste por ${miles(-falta)}` : "Completo";
    const tono = falta === 0 ? "verde" : falta < 0 ? "ambar" : "";
    const cab = `<div class="rd-hoja-cab">${mini(m, "h-16 w-16")}<div class="rd-hoja-cab-txt"><h2 class="font-display text-tinta text-2xl leading-tight">Tallas y colores</h2><p class="mt-1 text-[13.5px] leading-normal text-taupe">${esc(m.nombre)} · reparte las <b style="color:var(--color-tinta)">${miles(n)}</b> que contaste. Escribe en cada casilla cuántas llegaron.</p></div>
      <div class="rd-hoja-cuenta" data-tono="${tono}" aria-live="polite"><p><b>${odo(rep)}</b><span>de ${miles(n)}</span></p>${barra(pct, "normal")}<small>${falta === 0 ? `${lucide("check", "h-3.5 w-3.5")} ` : ""}${estadoTxt}</small></div></div>`;
    const sobra = falta < 0 ? avisoLinea("atencion", `Repartiste ${miles(rep)} y contaste ${miles(n)}`, "Baja alguna cantidad, o di que en verdad llegaron más.", btn(`Sí, llegaron ${miles(rep)}`, "secundario", 'data-subir-contadas=""', { chico: true })) : "";
    const totalTalla = (t) => h.colores.reduce((a, [c]) => a + (h.rep[`${c}|${t}`] || 0), 0);
    const filas = h.colores.map(([c, hex], j) => {
      const tot = h.tallas.reduce((a, t) => a + (h.rep[`${c}|${t}`] || 0), 0);
      return `<tr data-key="fila-${c}" style="--j:${j}"><th scope="row"><span class="rc-color"><i class="rd-punto" style="background:${hex}"></i>${esc(c)}</span></th>${h.tallas.map((t) => `<td data-key="celda-${t}"><input class="rc-celda rd-celda" data-k="celda:${c}|${t}" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="0" aria-label="${esc(c)}, talla ${esc(t)}" value="${h.rep[`${c}|${t}`] || ""}" ${h.foco === `${c}|${t}` ? 'data-foco=""' : ""}></td>`).join("")}<td class="rc-fila-total rd-total" data-key="tot">${tot ? miles(tot) : "—"}</td><td data-key="x"><button type="button" class="icono-fila grid h-8 w-8 place-items-center" aria-label="Quitar ${esc(c)}" title="Quitar ${esc(c)}" data-quitar-color="${esc(c)}">${lucide("x", "h-4 w-4")}</button></td></tr>`;
    }).join("");
    const tabla = `<div class="rc-matriz-caja scroll-cayla rd-matriz"><table class="rc-tabla-tallas rd-tabla"><thead><tr><th scope="col">Color</th>${h.tallas.map((t) => `<th scope="col" data-key="th-${t}"><span class="rc-talla"><span>${esc(t)}</span><button type="button" class="rc-talla-quitar" aria-label="Quitar la talla ${esc(t)}" title="Quitar la talla ${esc(t)}" data-quitar-talla="${esc(t)}">${lucide("x", "h-3 w-3")}</button></span></th>`).join("")}<th scope="col" data-key="th-tot">Total</th><th scope="col" data-key="th-x"><span class="sr-only">Quitar</span></th></tr></thead><tbody>${filas}</tbody>
      <tfoot><tr><th scope="row">Total por talla</th>${h.tallas.map((t) => `<td data-key="pie-${t}">${totalTalla(t) ? miles(totalTalla(t)) : "—"}</td>`).join("")}<td class="rd-total" data-key="pie-tot" data-tono="${tono}">${miles(rep)}</td><td data-key="pie-x"></td></tr></tfoot></table></div>`;
    const coloresLibres = D.coloresDeMas.filter(([c]) => !h.colores.some(([x]) => x === c));
    const tallasLibres = (D.tallasDeMas[m.cat] || []).filter((t) => !h.tallas.includes(t));
    const picker = h.picker === "color" ? `<div class="rd-picker" data-key="pick-color"><p>Elige el color que llegó:</p><div>${coloresLibres.map(([c, hex]) => `<button type="button" class="rd-opcion-color" data-agregar-color="${esc(c)}"><i class="rd-punto" style="background:${hex}"></i>${esc(c)}</button>`).join("")}<button type="button" class="btn-cayla btn-enlace" data-nota="Aquí se busca en toda la carta de colores, y un líder puede crear uno nuevo.">Buscar otro…</button></div></div>`
      : h.picker === "talla" ? `<div class="rd-picker" data-key="pick-talla"><p>Elige la talla que llegó:</p><div>${tallasLibres.map((t) => `<button type="button" class="rd-opcion-color" data-agregar-talla="${esc(t)}">${esc(t)}</button>`).join("") || "<span>Esta categoría no ofrece más tallas.</span>"}<button type="button" class="btn-cayla btn-enlace" data-nota="Una talla que la categoría no ofrece la habilita un líder en Catálogo ▸ Categorías.">¿No está?</button></div></div>` : "";
    const ayudas = `<div class="rd-ayudas">
      <div class="rd-ayudas-izq">${btn("Color", "secundario", `data-picker="color" aria-expanded="${h.picker === "color"}"`, { antes: lucide("plus", "h-4 w-4"), chico: true })}${btn("Talla", "secundario", `data-picker="talla" aria-expanded="${h.picker === "talla"}"`, { antes: lucide("plus", "h-4 w-4"), chico: true })}</div>
      <div class="rd-ayudas-der">${falta > 0 && focoVale ? `<button type="button" class="rd-rellenar" data-rellenar="">${lucide("wand", "h-4 w-4")}<span>Poner las <b>${miles(falta)}</b> que faltan en <b>${esc(fc)} · ${esc(ft)}</b></span></button>` : ""}${rep > 0 ? btn("Vaciar todo", "enlace", 'data-vaciar=""') : ""}</div>
    </div>${picker}`;
    const llenas = Object.entries(h.rep).filter(([, v]) => v > 0).map(([k]) => k.replace("|", " · "));
    const d = h.dan;
    const danadas = `<div class="rd-dan" ${d ? 'data-abierta=""' : ""}>
      <button type="button" class="rd-dan-tit" data-dan-abrir="" aria-expanded="${!!d}">${lucide("triangle-alert", "h-4 w-4")}<span>¿Alguna llegó dañada?</span>${h.danadas.length ? globito(h.danadas.reduce((a, x) => a + x.n, 0), true) : `<small>Opcional</small>`}${lucide("chevron-down", "rd-dan-flecha h-4 w-4")}</button>
      ${h.danadas.length ? `<ul class="rd-anotado">${h.danadas.map((x, k) => `<li data-key="hd-${k}">${lucide("triangle-alert", "h-4 w-4")}<span><b>${miles(x.n)} ${x.n === 1 ? "dañada" : "dañadas"}</b>${x.v ? ` · ${esc(x.v)}` : ""} · ${esc(x.que)}</span><button type="button" class="icono-fila grid h-8 w-8 place-items-center" data-dan-quitar="${k}" aria-label="Quitar">${lucide("x", "h-4 w-4")}</button></li>`).join("")}</ul>` : ""}
      ${d ? `<div class="rd-dan-form" data-key="dan-form"><div><p class="rd-etq">¿Cuál?</p><div class="rd-chips">${(llenas.length ? llenas : ["Sin decir cuál"]).map((v) => `<button type="button" class="pildora-cayla" aria-pressed="${d.v === v}" data-dan-v="${esc(v)}">${esc(v)}</button>`).join("")}</div></div><div><p class="rd-etq">¿Cuántas?</p><div class="rd-paso"><button type="button" data-dan-n="-1" aria-label="Una menos" ${d.n <= 1 ? "disabled" : ""}>${lucide("minus", "h-4 w-4")}</button><b>${miles(d.n)}</b><button type="button" data-dan-n="1" aria-label="Una más" ${d.n >= Math.max(1, rep) ? "disabled" : ""}>${lucide("plus", "h-4 w-4")}</button></div></div><div><p class="rd-etq">¿Qué se hace con ${d.n === 1 ? "ella" : "ellas"}?</p><div class="rd-chips">${["Se devuelve al proveedor", "Se arregla en el taller", "Se da de baja"].map((t) => `<button type="button" class="pildora-cayla" aria-pressed="${d.que === t}" data-dan-que="${t}">${t}</button>`).join("")}</div></div><div class="rd-dan-acc">${btn("Anotar", "secundario", `data-dan-anotar="" ${d.que ? "" : "disabled"}`, { chico: true })}${d.que ? "" : `<small>Elige qué se hace con ${d.n === 1 ? "ella" : "ellas"}.</small>`}</div></div>` : ""}
    </div>`;
    const salir = h.salir ? `<div class="rd-salir" role="alertdialog" data-key="salir"><p><b>¿Salir sin guardar?</b> Se pierde lo que repartiste en esta hoja.</p>${btn("Seguir repartiendo", "secundario", 'data-salir="no"', { chico: true })}${btn("Salir sin guardar", "peligro", 'data-salir="si"', { chico: true })}</div>` : "";
    const mal = falta < 0 || rep === 0;
    const llevar = Math.max(0, rep - (m.enStock || 0));
    const pie = `<span class="rd-pie-nota">${falta < 0 ? "Corrige las cantidades para poder guardar." : rep === 0 ? "Escribe al menos una cantidad." : falta > 0 ? `Faltan ${miles(falta)}: puedes llevar estas al stock y seguir después.` : "Llévalas al stock para venderlas hoy."}</span>${cancelarBtn()}${btn("Solo guardar", "secundario", `data-guardar-tallas="" ${mal ? "disabled" : ""}`)}${btn(falta === 0 && !(m.enStock || 0) ? "Guardar y llevar al stock" : `Guardar y llevar ${miles(llevar)} al stock`, "primario", `data-guardar-llevar="" ${mal || llevar <= 0 ? "disabled" : ""}`, { antes: lucide("package-check", "h-4 w-4") })}`;
    return marcoHoja(`tallas-${m.id}`, 880, "Tallas y colores", "", `${sobra}${tabla}${ayudas}${danadas}${salir}`, pie, { cab });
  }
  function hojaAgregar() {
    const h = E.hoja;
    const todas = [...new Set([...cats(), "Vestidos", "Blusas", "Casacas", "Faldas"])].slice(0, 7);
    const parecidas = h.nombre.trim().length >= 2 ? D.catalogo.filter((p) => p.nombre.toLowerCase().includes(h.nombre.trim().toLowerCase()) || (h.cat && p.cat === h.cat && h.nombre.trim().length >= 3 && p.nombre.toLowerCase().startsWith(h.nombre.trim().toLowerCase().slice(0, 3)))).slice(0, 3) : [];
    const sinNombre = !h.nombre.trim();
    const provisional = h.cat ? `${h.cat.replace(/es$|s$/, "")} ${E.modelos.filter((m) => m.cat === h.cat && m.provisional).length + 1}` : "";
    const cuerpo = `<div class="rd-form">
      <div class="rd-campo" data-estado="${h.cat ? "hecho" : "ahora"}"><p class="rd-etq">¿De qué categoría es? ${h.cat ? "" : sigueAqui}</p><div class="rd-chips">${todas.map((c) => `<button type="button" class="pildora-cayla" aria-pressed="${h.cat === c}" data-ag-cat="${c}">${c}</button>`).join("")}</div></div>
      <div class="rd-campo" data-estado="${!h.cat ? "espera" : sinNombre ? "ahora" : "hecho"}"><label class="rd-etq" for="rd-ag-nombre">¿Cómo se llama? <small>· opcional</small></label><input id="rd-ag-nombre" class="caja-cayla caja-campo" data-k="ag-nombre" type="text" autocomplete="off" placeholder="${D.ejemploDeNombre[h.cat] || "Elige primero la categoría"}" value="${esc(h.nombre)}" ${h.cat ? "" : "disabled"}>
        ${h.existe ? `<p class="rd-ayuda-campo" data-tono="verde">${lucide("check", "h-3.5 w-3.5")} Ya está en tu catálogo: entra con sus tallas y colores.</p>` : parecidas.length ? `<div class="rd-parecidas"><p>¿Es una de estas? Ya están en tu catálogo:</p>${parecidas.map((p) => `<button type="button" data-ag-existe="${esc(p.nombre)}">${lucide("package", "h-4 w-4")}${esc(p.nombre)}<small>${p.cat}</small></button>`).join("")}</div>` : h.cat && sinNombre ? `<p class="rd-ayuda-campo">Si no sabes el nombre, se llamará <b>«${provisional}»</b> hasta que se lo pongas (antes de cerrar).</p>` : ""}</div>
      <div class="rd-campo" data-estado="${h.cat ? "hecho" : "espera"}"><p class="rd-etq">¿Cuántas llegaron? <small>· lo puedes contar después</small></p><div class="rd-paso rd-paso--grande"><button type="button" data-ag-n="-1" aria-label="Una menos" ${h.n <= 0 ? "disabled" : ""}>${lucide("minus", "h-4 w-4")}</button><input data-k="ag-n" inputmode="numeric" maxlength="4" value="${h.n || ""}" placeholder="0" aria-label="Cuántas llegaron"><button type="button" data-ag-n="1" aria-label="Una más">${lucide("plus", "h-4 w-4")}</button></div></div>
    </div>`;
    const pie = `<span class="rd-pie-nota">${h.cat ? "" : "Falta: la categoría."}</span>${cancelarBtn()}${btn("Agregar y contar", "primario", `data-ag-guardar="" ${h.cat ? "" : "disabled"}`, { antes: lucide("plus", "h-4 w-4") })}`;
    return marcoHoja("agregar", 520, "Llegó algo que no está en la lista", "Agrégalo aquí y cuéntalo igual que lo demás. Compras lo verá al cerrar.", cuerpo, pie);
  }
  function hojaDanado() {
    const h = E.hoja, m = porId(h.id);
    const cuerpo = `<div class="rd-form">
      <div class="rd-campo"><p class="rd-etq">¿Cuántas llegaron dañadas?</p><div class="rd-paso rd-paso--grande"><button type="button" data-dn="-1" aria-label="Una menos" ${h.n <= 1 ? "disabled" : ""}>${lucide("minus", "h-4 w-4")}</button><b>${miles(h.n)}</b><button type="button" data-dn="1" aria-label="Una más" ${h.n >= m.contadas ? "disabled" : ""}>${lucide("plus", "h-4 w-4")}</button></div><p class="rd-ayuda-campo">De las ${miles(m.contadas)} que contaste. Las dañadas siguen contando como llegadas.</p></div>
      <div class="rd-campo" data-estado="${h.que ? "hecho" : "ahora"}"><p class="rd-etq">¿Qué se hace con ${h.n === 1 ? "ella" : "ellas"}? ${h.que ? "" : sigueAqui}</p><div class="rd-opciones-v">${[["Se devuelve al proveedor", "No entra al stock; Compras reclama."], ["Se arregla en el taller", "Entra cuando vuelva arreglada."], ["Se da de baja", "No se vende. Queda anotada como pérdida."]].map(([t, s]) => `<button type="button" role="radio" class="rc-opcion" aria-checked="${h.que === t}" data-dq="${t}"><span class="rc-radio" aria-hidden="true"></span><span><b>${t}</b><small>${s}</small></span></button>`).join("")}</div></div>
    </div>`;
    const pie = `<span class="rd-pie-nota">${h.que ? "" : "Falta: qué se hace con ellas."}</span>${cancelarBtn()}${btn("Anotar", "primario", `data-dn-guardar="" ${h.que ? "" : "disabled"}`, { antes: lucide("check", "h-4 w-4") })}`;
    return marcoHoja(`danado-${m.id}`, 480, "Llegó dañada", `${esc(m.nombre)} · manchada, rota, descosida o con falla.`, cuerpo, pie);
  }
  function hojaObs() {
    const h = E.hoja, m = porId(h.id);
    const cuerpo = `<div class="rd-form"><div class="rd-campo"><p class="rd-etq">Lo más común</p><div class="rd-chips">${D.notasFrecuentes.map((t) => `<button type="button" class="pildora-cayla" aria-pressed="${h.texto === t}" data-obs-chip="${t}">${t}</button>`).join("")}</div></div>
      <div class="rd-campo"><label class="rd-etq" for="rd-obs">O escríbelo con tus palabras</label><textarea id="rd-obs" class="caja-cayla caja-campo rd-area" data-k="obs" rows="3" placeholder="Ej. Dos venían sin etiqueta de talla">${esc(h.texto)}</textarea></div></div>`;
    const pie = `<span class="rd-pie-nota">Lo verá quien revise la compra.</span>${cancelarBtn()}${btn("Guardar", "primario", `data-obs-guardar="" ${h.texto.trim() ? "" : "disabled"}`, { antes: lucide("check", "h-4 w-4") })}`;
    return marcoHoja(`obs-${m.id}`, 480, "Anotar algo", `${esc(m.nombre)} · algo que Compras deba saber.`, cuerpo, pie);
  }
  function hojaOtra() {
    const h = E.hoja, m = porId(h.id);
    const lista = D.catalogo.filter((p) => !h.buscar || p.nombre.toLowerCase().includes(h.buscar.toLowerCase())).slice(0, 5);
    const cuerpo = `<div class="rd-form"><div class="rd-campo"><div class="buscador">${lucide("search", "buscador-icono")}<input data-k="otra-buscar" type="search" autocomplete="off" placeholder="Busca la prenda que llegó…" aria-label="Buscar la prenda que llegó" value="${esc(h.buscar)}"><span class="buscador-hilo" aria-hidden="true"></span></div>
      <div class="rd-opciones-v">${lista.map((p) => `<button type="button" role="radio" class="rc-opcion" aria-checked="${h.elegida === p.nombre}" data-otra="${esc(p.nombre)}"><span class="rc-radio" aria-hidden="true"></span><span><b>${esc(p.nombre)}</b><small>${p.cat} · ya está en tu catálogo</small></span></button>`).join("") || `<p class="rd-ayuda-campo">Nada con ese nombre en el catálogo.</p>`}
      <button type="button" role="radio" class="rc-opcion" aria-checked="${h.elegida === "__nueva"}" data-otra="__nueva"><span class="rc-radio" aria-hidden="true"></span><span><b>Es una prenda nueva</b><small>No está en el catálogo: se cuenta ahora y se crea después.</small></span></button></div></div></div>`;
    const pie = `<span class="rd-pie-nota">Lo contado no se pierde.</span>${cancelarBtn()}${btn("Cambiar la prenda", "primario", `data-otra-guardar="" ${h.elegida ? "" : "disabled"}`, { antes: lucide("repeat", "h-4 w-4") })}`;
    return marcoHoja(`otra-${m.id}`, 520, "Es otra prenda", `Dijeron «${esc(m.nombre)}», pero llegó otra. Elige cuál.`, cuerpo, pie);
  }
  function hojaNombre() {
    const h = E.hoja, m = porId(h.id);
    const cuerpo = `<div class="rd-form"><div class="rd-campo"><label class="rd-etq" for="rd-nombre">Nombre de la prenda</label><input id="rd-nombre" class="caja-cayla caja-campo" data-k="nombre" type="text" autocomplete="off" placeholder="${D.ejemploDeNombre[m.cat] || "Ej. Nombre de la prenda"}" value="${esc(h.nombre)}"><p class="rd-ayuda-campo">Como la conocen en la tienda. Después se puede cambiar en Catálogo.</p></div></div>`;
    const pie = `<span class="rd-pie-nota"></span>${cancelarBtn()}${btn("Guardar el nombre", "primario", `data-nombre-guardar="" ${h.nombre.trim().length >= 3 ? "" : "disabled"}`, { antes: lucide("check", "h-4 w-4") })}`;
    return marcoHoja(`nombre-${m.id}`, 480, m.provisional ? "Ponle su nombre" : "Cambiar el nombre", `Hoy se llama «${esc(m.nombre)}».`, cuerpo, pie);
  }
  function hojaCrear() {
    const h = E.hoja, m = porId(h.id);
    const tallasCat = [...new Set([...(m.tallas || []), ...(D.tallasDeMas[m.cat] || [])])].sort((a, b) => D.ordenTallas.indexOf(a) - D.ordenTallas.indexOf(b));
    const coloresTodos = [...m.colores, ...D.coloresDeMas.filter(([c]) => !m.colores.some(([x]) => x === c))].slice(0, 8);
    const falta = !h.nombre.trim() ? "el nombre" : !h.precio ? "el precio de venta" : !h.tallas.length ? "al menos una talla" : !h.colores.length ? "al menos un color" : "";
    const cuerpo = `<div class="rd-form">
      <div class="rd-dos"><div class="rd-campo"><label class="rd-etq" for="rd-cr-nombre">Nombre</label><input id="rd-cr-nombre" class="caja-cayla caja-campo" data-k="cr-nombre" type="text" autocomplete="off" placeholder="${D.ejemploDeNombre[m.cat] || ""}" value="${esc(h.nombre)}"></div>
      <div class="rd-campo"><label class="rd-etq" for="rd-cr-precio">Precio de venta</label><div class="rd-precio"><span>S/</span><input id="rd-cr-precio" class="caja-cayla caja-campo" data-k="cr-precio" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(h.precio)}"></div><p class="rd-ayuda-campo">Costó S/ ${m.costo || "—"} cada una.</p></div></div>
      <div class="rd-campo"><p class="rd-etq">Tallas que llegaron</p><div class="rd-chips">${tallasCat.map((t) => `<button type="button" class="pildora-cayla" aria-pressed="${h.tallas.includes(t)}" data-cr-talla="${esc(t)}">${esc(t)}</button>`).join("")}</div></div>
      <div class="rd-campo"><p class="rd-etq">Colores que llegaron</p><div class="rd-chips">${coloresTodos.map(([c, hex]) => `<button type="button" class="pildora-cayla rd-pildora-color" aria-pressed="${h.colores.includes(c)}" data-cr-color="${esc(c)}"><i class="rd-punto" style="background:${hex}"></i>${esc(c)}</button>`).join("")}</div></div>
    </div>`;
    const pie = `<span class="rd-pie-nota">${falta ? `Falta: ${falta}.` : "La foto y lo demás se completan en Catálogo."}</span>${cancelarBtn()}${btn("Crear y repartir", "primario", `data-cr-guardar="" ${falta ? "disabled" : ""}`, { antes: lucide("sparkles", "h-4 w-4") })}`;
    return marcoHoja(`crear-${m.id}`, 640, "Crear la prenda", `${esc(m.cat)} · ${D.proveedor} · llegaron ${miles(m.contadas)}. Con esto ya se puede vender.`, cuerpo, pie);
  }
  /** «Llevar al stock ahora» es stock y dinero: una hoja confirma lo justo (costo, de quién es, quién lo lleva), pero viene contestada: un clic. */
  function hojaLlevar() {
    const h = E.hoja, m = porId(h.id);
    const n = Math.max(0, repartidas(m) - (m.enStock || 0));
    const resumen = Object.entries(m.rep).filter(([, v]) => v > 0).map(([k, v]) => { const [c, t] = k.split("|"); const hex = (m.colores.find(([x]) => x === c) || [])[1] || "#ccc"; return `<span class="rd-rep"><i style="background:${hex}"></i>${esc(c)} ${esc(t)} <b>×${miles(v)}</b></span>`; }).join("");
    const cuerpo = `<div class="rd-form">
      <div class="rd-llevar-que">${mini(m, "h-14 w-14")}<div><b>${esc(m.nombre)}</b><div class="rd-reps">${resumen}</div></div></div>
      <div class="rd-dos"><div class="rd-campo"><label class="rd-etq" for="rd-ll-costo">Costo por prenda</label><div class="rd-precio"><span>S/</span><input id="rd-ll-costo" class="caja-cayla caja-campo" data-k="ll-costo" inputmode="decimal" autocomplete="off" placeholder="Llega con la factura" value="${esc(h.costo)}"></div><p class="rd-ayuda-campo">${h.costo ? "El de la orden. Corrígelo si la factura dice otro." : "Si no lo sabes, déjalo vacío: llega con la factura."}</p></div>
      <div class="rd-campo"><p class="rd-etq">¿De quién es?</p><div class="rd-chips">${["CAYLA", "CLAURE"].map((x) => `<button type="button" class="pildora-cayla" aria-pressed="${h.dueno === x}" data-ll-dueno="${x}">${x}</button>`).join("")}</div></div></div>
      <div class="rd-campo"><p class="rd-etq">Quién lo lleva</p><div class="rd-quien-fijo"><span class="rm-avatar" aria-hidden="true">${D.quien.iniciales}</span><span><b>${D.despachadoPor}</b><small>Admin · queda a tu nombre</small></span>${btn("Cambiar", "enlace", 'data-nota="Aquí se elige quién lo lleva (el combo Responsable)."')}</div></div>
    </div>`;
    const pie = `<span class="rd-pie-nota">Ya viene todo puesto: revisa y confirma.</span>${cancelarBtn()}${btn(`Llevar ${miles(n)} al stock`, "primario", 'data-llevar-guardar=""', { antes: lucide("package-check", "h-4 w-4") })}`;
    return marcoHoja(`llevar-${m.id}`, 580, `Llevar ${miles(n)} al stock`, `Entran al almacén de ${D.sede} ahora y se venden al bajarlas al piso. El envío sigue abierto: lo demás se sigue contando.`, cuerpo, pie);
  }
  function hojaCancelar() {
    const hayAlgo = E.modelos.some(contado);
    const cuerpo = `<div class="rd-form">${avisoLinea("atencion", hayAlgo ? "Ya contaste algo de este envío" : "Esto no se puede deshacer", hayAlgo ? "Cancelar borra lo contado. Si solo faltó una parte, mejor cuenta lo que llegó y cierra con la diferencia." : "El envío vuelve a «En camino» y Compras recibe el aviso de que no llegó.")}</div>`;
    const pie = `<span class="rd-pie-nota"></span>${btn("No, seguir contando", "secundario", 'data-hoja-cancelar=""')}${btn("Sí, cancelar la recepción", "peligro", 'data-cancelar-recepcion=""')}`;
    return marcoHoja("cancelar", 480, "¿No llegó nada de este envío?", "Cancela la recepción solo si el paquete no llegó a la tienda.", cuerpo, pie);
  }
  const hojas = () => !E.hoja ? "" : ({ tallas: hojaTallas, agregar: hojaAgregar, danado: hojaDanado, obs: hojaObs, otra: hojaOtra, nombre: hojaNombre, crear: hojaCrear, llevar: hojaLlevar, cancelar: hojaCancelar })[E.hoja.tipo]();

  // ═════════ Revisa y cierra · Cerrado (las mismas de la maqueta anterior) ═════════
  function vistaCerrar() {
    const c = cifras();
    const faltaron = E.modelos.filter((m) => contado(m) && m.dijeron != null && m.contadas < m.dijeron);
    const sobraron = E.modelos.filter((m) => contado(m) && m.dijeron != null && m.contadas > m.dijeron);
    const porContar = E.modelos.filter((m) => !contado(m));
    const faltanN = faltaron.reduce((a, m) => a + (m.dijeron - m.contadas), 0);
    const nDan = E.modelos.reduce((a, m) => a + (m.danadas || []).reduce((b, x) => b + x.n, 0), 0);
    const motivos = ["No vino", "Se perdió en el camino", "Llegó a otra sede"];
    const pend = [];
    if (porContar.length) pend.push({ est: "ahora", titulo: `${modelosTxt(porContar.length)} sin contar`, detalle: porContar.slice(0, 4).map((m) => m.nombre).join(", ") + (porContar.length > 4 ? "…" : ""), cuerpo: `<p class="rm-paso-ayuda" style="margin:0">Cuéntalos o dilo: lo que no cuentes queda como «no llegó».</p>`, fin: btn("Ir a contar", "secundario", 'data-ir="contar"', { antes: lucide("arrow-left", "h-4 w-4"), chico: true }) });
    if (faltaron.length) pend.push({ est: E.motivo ? "hecho" : "ahora", titulo: faltaron.length === 1 ? `Faltan ${miles(faltanN)} de ${faltaron[0].nombre}` : `Faltan ${miles(faltanN)} prendas de ${modelosTxt(faltaron.length)}`, detalle: "¿Qué pasó?", cuerpo: motivos.map((t) => pildora(t, E.motivo === t, `data-motivo="${t}"`)).join(""), fin: E.motivo ? chip(E.motivo, "ambar") : sigueAqui });
    sobraron.forEach((m) => pend.push({ est: "hecho", titulo: `Sobran ${miles(m.contadas - m.dijeron)} de ${m.nombre}`, detalle: "Entran igual; Compras lo ve", cuerpo: "" }));
    if (nDan) pend.push({ est: "hecho", titulo: `${miles(nDan)} ${nDan === 1 ? "dañada" : "dañadas"}`, detalle: "Ya dijiste qué se hace con ellas", cuerpo: "" });
    const listo = pend.every((p) => p.est === "hecho");
    const n = pend.length;
    const fijo = (k, titulo, detalle, fin) => `<div class="rm-item" data-key="fijo-${k}" data-estado="hecho" style="--i:${n + k}"><span class="rm-paso-num" aria-hidden="true">${lucide("check", "")}</span><div class="rm-item-titulo"><b>${titulo}</b><span>${detalle}</span>${fin}</div></div>`;
    const papeles = `<div class="rm-item" data-key="papeles" data-estado="espera" style="--i:${n + 3}"><span class="rm-paso-num" aria-hidden="true">${n + 4}</span><div class="rm-item-titulo"><b>Guía y nota</b><span>Opcional</span></div><div class="rm-item-cuerpo"><input class="caja-cayla caja-campo" data-k="guia" type="text" placeholder="Ej. T001-000342" aria-label="Número de guía" value="${esc(E.guia)}"><input class="caja-cayla caja-campo" data-k="nota" type="text" placeholder="Nota. Ej. Llegó en dos bolsas" aria-label="Nota" value="${esc(E.nota)}" style="width:300px"></div></div>`;
    const item = (p, i) => `<div class="rm-item" data-key="item-${i}" data-estado="${p.est}" style="--i:${i}"><span class="rm-paso-num" aria-hidden="true">${p.est === "hecho" ? lucide("check", "") : i + 1}</span><div class="rm-item-titulo"><b>${esc(p.titulo)}</b><span>${esc(p.detalle)}</span>${p.fin || ""}</div>${p.cuerpo ? `<div class="rm-item-cuerpo">${p.cuerpo}</div>` : ""}</div>`;
    const tramos = [["verde", c.entran], ["pizarra", c.despues], ["ambar", faltanN]].filter(([, v]) => v > 0);
    const total = tramos.reduce((a, [, v]) => a + v, 0) || 1;
    const apilada = `<span class="barra-apilada" data-alto="12" role="img" aria-label="Destino de las prendas">${tramos.map(([tono, v], i) => `<span class="barra-tramo anim-crece-x" style="flex-grow: ${v / total}; --i: ${i};"><i aria-hidden="true" class="barra-tramo-color" style="background: var(--color-${tono});"></i></span>`).join("")}</span>`;
    const nombres = (xs) => xs.length > 3 ? `${xs.slice(0, 3).map((m) => m.nombre).join(", ")} y ${xs.length - 3} más` : xs.map((m) => m.nombre).join(" y ");
    const destinos = [["verde", "package", `${miles(c.entran)} entran al stock hoy`, nombres(E.modelos.filter(entraAlStock)) || "Ninguna todavía"], ["pizarra", "clock", `${miles(c.despues)} quedan para después`, (nombres(E.modelos.filter((m) => contado(m) && m.contadas > 0 && !entraAlStock(m))) || "Ninguna") + ": sin tallas y colores todavía"], ...(faltanN ? [["ambar", "triangle-alert", `${miles(faltanN)} faltaron`, nombres(faltaron)]] : [])];
    return `<div class="space-y-6">${cabecera({ parada: 2, pct: c.pct, texto: `${miles(c.contadas)}${c.dijeron != null ? ` de ${miles(c.dijeron)}` : ""}`, detalle: "Revisa y cierra" })}</div>
      <div class="rm-cierre" style="margin-top:14px">
        <aside class="rm-tarjeta" style="--i:0" aria-label="Resumen del envío"><div class="titulo-seccion"><h2 class="titulo-seccion-texto">Resumen del envío</h2></div>
          <div class="rm-gran"><b>${odo(c.contadas)}</b><span>${c.dijeron != null ? `de ${miles(c.dijeron)} prendas llegaron` : "prendas llegaron"}</span></div>${apilada}
          <div class="rm-destinos">${destinos.map(([tono, ic, t, s], i) => `<div class="rm-destino" style="--c: var(--color-${tono}); --i:${i}"><span class="rm-lente">${lucide(ic, "h-[18px] w-[18px]")}</span><span><b>${t}</b><small>${esc(s)}</small></span></div>`).join("")}</div>
          ${c.dijeron != null ? `<div class="rm-leyenda"><p>Dijeron <b>${miles(c.dijeron)}</b></p><p>Contaste <b>${miles(c.contadas)}</b></p><p>Diferencia <b data-tono="${c.diferencia ? "ambar" : ""}">${signo(c.diferencia)}</b></p></div>` : ""}
        </aside>
        <section aria-label="Antes de cerrar">
          <div class="rm-tarjeta" style="--i:1"><div class="titulo-seccion"><h2 class="titulo-seccion-texto">Antes de cerrar</h2><span class="titulo-seccion-lado">${listo ? chip("Todo listo", "verde") : globito(pend.filter((p) => p.est !== "hecho").length, true)}</span></div>
            <div class="rm-pend" style="margin-top:12px">${pend.map(item).join("")}${fijo(0, "De quién es la mercadería", `Entra como de ${E.dueno}`, btn("Cambiar", "enlace", 'data-dueno=""'))}${fijo(1, "Costos", `Los ${modelosTxt(E.modelos.length)} entran con el costo de la compra`, btn("Revisar", "enlace", 'data-nota="Aquí se ve y se corrige el costo de cada modelo."'))}${fijo(2, `Cierra ${D.quien.nombre}`, "Admin · queda a tu nombre", btn("Cambiar", "enlace", 'data-nota="Aquí se elige quién cierra (el combo Responsable)."'))}${papeles}</div></div>
          <div class="rm-tarjeta rm-cierre-pie" style="--i:2"><p>${listo ? `<b>Todo listo.</b> Entran ${prendas(c.entran)} al stock de ${D.sede}${c.despues ? ` y ${miles(c.despues)} quedan guardadas para terminar después` : ""}.` : `<b>Falta:</b> ${pend.filter((p) => p.est !== "hecho").map((p) => p.titulo.toLowerCase()).join(" y ")}.`}</p>${btn("Volver a contar", "secundario", 'data-ir="contar"', { antes: lucide("arrow-left", "h-4 w-4") })}${btn("Confirmar y cerrar", "primario", `data-ir="cerrado" ${listo ? "" : "disabled"}`, { despues: lucide("check", "h-4 w-4") })}</div>
        </section>
      </div>`;
  }
  function vistaCerrado() {
    const c = cifras();
    const entraron = E.modelos.filter(entraAlStock);
    const despues = E.modelos.filter((m) => contado(m) && m.contadas > 0 && !entraron.includes(m));
    const noCuadro = E.modelos.filter((m) => contado(m) && m.dijeron != null && m.contadas !== m.dijeron);
    const nEntraron = entraron.reduce((a, m) => a + m.contadas, 0), nDespues = despues.reduce((a, m) => a + m.contadas, 0);
    const lacre = `<svg class="rc-lacre-sello rm-sello" viewBox="0 0 100 100" aria-hidden="true" style="position:static"><path class="rc-lacre-cera" d="M96.0 50.0 L90.6 60.9 L89.8 73.0 L79.7 79.7 L73.0 89.8 L60.9 90.6 L50.0 96.0 L39.1 90.6 L27.0 89.8 L20.3 79.7 L10.2 73.0 L9.4 60.9 L4.0 50.0 L9.4 39.1 L10.2 27.0 L20.3 20.3 L27.0 10.2 L39.1 9.4 L50.0 4.0 L60.9 9.4 L73.0 10.2 L79.7 20.3 L89.8 27.0 L90.6 39.1Z"></path><circle class="rc-lacre-aro" cx="50" cy="50" r="31"></circle><text class="rc-lacre-letra" x="50" y="62" text-anchor="middle">C</text></svg>`;
    const fila = (m, detalle, boton, i) => `<div class="rm-fila" data-key="fila-${m.id}" style="--i:${Math.min(i, 8)}">${mini(m, "h-11 w-11")}<div class="rm-fila-textos"><b>${esc(m.nombre)}</b><span>${detalle}</span></div>${boton}</div>`;
    return `<div class="space-y-6">${cabecera({ parada: 4, pct: 100, texto: `${miles(c.contadas)} recibidas`, detalle: "Cerrado" })}</div>
      <div class="rm-cerrado-cab" style="margin-top:14px">${lacre}<div><div class="titulo-seccion"><h2 class="titulo-seccion-texto" style="font-size:28px">Envío cerrado</h2></div><p class="rm-placa-meta">Lo cerró ${D.quien.nombre} · hoy, 4:12 p. m.${E.guia ? ` · Guía ${esc(E.guia)}` : ""}</p></div>${btn("Imprimir el acta", "secundario", 'data-nota="Aquí se imprime el acta de recepción." style="margin-left:auto"', { antes: lucide("printer", "h-4 w-4") })}</div>
      <div class="rm-cifras">
        <div class="rm-cifra" style="--i:0"><p data-tono="verde">${lucide("package", "h-3.5 w-3.5")} Ya se venden</p><b>${odo(nEntraron)}</b><span>prendas entraron al stock</span></div>
        <div class="rm-cifra" style="--i:1"><p data-tono="pizarra">${lucide("clock", "h-3.5 w-3.5")} Para después</p><b>${odo(nDespues)}</b><span>prendas de ${modelosTxt(despues.length)}, sin tallas todavía</span></div>
        <div class="rm-cifra" style="--i:2"><p data-tono="ambar">${lucide("triangle-alert", "h-3.5 w-3.5")} ${c.diferencia ? "No cuadró" : "Cuadró"}</p><b>${c.diferencia != null ? signo(c.diferencia) : miles(c.contadas)}</b><span>${c.dijeron != null ? `de ${miles(c.dijeron)} que dijeron, llegaron ${miles(c.contadas)}` : `${prendas(c.contadas)} sin aviso`}</span></div>
      </div>
      <div class="rm-dos">
        <section class="rm-tarjeta" style="--i:3"><div class="titulo-seccion"><h2 class="titulo-seccion-texto">Lo que entró al stock</h2><span class="titulo-seccion-lado">${globito(entraron.length)}</span></div><div style="margin-top:8px">${entraron.length ? entraron.slice(0, 8).map((m, i) => fila(m, `${prendas(m.contadas)} · con tallas y colores`, btn(`Imprimir ${m.contadas} etiquetas`, "secundario", 'data-nota="Aquí se imprimen las etiquetas."', { antes: lucide("printer", "h-4 w-4"), chico: true }), i)).join("") : `<p class="rm-paso-ayuda">Nada entró todavía: todo quedó para después.</p>`}</div></section>
        <div>
          <section class="rm-tarjeta" style="--i:4"><div class="titulo-seccion"><h2 class="titulo-seccion-texto">Para después</h2><span class="titulo-seccion-lado">${globito(despues.length, despues.length > 0)}</span></div><div style="margin-top:8px">${despues.length ? despues.slice(0, 8).map((m, i) => fila(m, `${prendas(m.contadas)} · en el almacén, aún no se venden`, btn(m.tipo === "nuevo" && !m.creada ? "Crear la prenda" : "Poner tallas", "secundario", 'data-nota="Aquí se termina el modelo."', { despues: lucide("arrow-right", "h-4 w-4"), chico: true }), i)).join("") : `<p class="rm-paso-ayuda">Nada quedó para después.</p>`}</div></section>
          ${noCuadro.length ? `<section class="rm-tarjeta" style="--i:5"><div class="titulo-seccion"><h2 class="titulo-seccion-texto">Lo que no cuadró</h2><span class="titulo-seccion-lado">${globito(noCuadro.length)}</span></div><div style="margin-top:8px">${noCuadro.slice(0, 8).map((m, i) => fila(m, `${m.contadas < m.dijeron ? `Faltaron ${miles(m.dijeron - m.contadas)}` : `Sobraron ${miles(m.contadas - m.dijeron)}`}${m.contadas < m.dijeron ? ` · ${E.motivo || "sin decir qué pasó"}` : ""}`, chip("Lo ve Compras", "ambar", { punto: false, icono: "eye" }), i)).join("")}</div></section>` : ""}
        </div>
      </div>
      <p class="rm-reabrir">¿Encontraste algo más? <button type="button" class="btn-cayla btn-enlace" data-nota="Aquí se reabre el envío: corriges y lo cierras de nuevo; lo que ya entró al stock no se toca.">Reabrir el envío</button></p>`;
  }

  // ═════════ «Por qué así»: las técnicas y los casos ═════════
  const TECNICAS = [
    ["Dos mitades con el mismo esqueleto", "Lista y contador miden lo mismo y se leen igual: cabeza (qué es), cuerpo (lo que haces) y pie (lo que sigue). Aprendes una y ya sabes la otra."],
    ["Una sola acción principal por mitad", "En cada momento hay UN botón oscuro: «Repartir ahora», «Llevar al stock ahora», «Listo, siguiente» o «Revisar y cerrar». Lo demás es claro o es un enlace. No se elige entre cinco iguales (ley de Hick)."],
    ["Cada acción vive en un solo lugar", "«Revisar y cerrar» está solo en el pie de la lista, que es la mitad del envío: siempre en el mismo sitio, abras el modelo que abras. El pie del contador solo habla de la prenda (anterior, siguiente) y, en el último modelo, lleva al que quedó pendiente. Dos botones iguales hacen dudar cuál toca."],
    ["Lo que más se toca es lo más grande y está más cerca", "«Llegaron las N» mide 56 px y está al lado del número; el + y el − son de 48 px (ley de Fitts)."],
    ["Revelar de a poco", "Las tallas y los colores viven en una hoja con espacio, y los filtros en un botón al lado del buscador: aparecen solo cuando se piden. Lo raro (corregir lo que entró, quitar un modelo) vive en «Más»."],
    ["Lo que más se hace, a un toque", "Casi siempre llevan la prenda al stock desde el conteo para venderla ya: con todo repartido, «Llevar al stock ahora» es el botón principal del contador, y en la hoja de tallas se guarda y se lleva en un paso. La hoja que confirma viene contestada."],
    ["El estado siempre a la vista", "Arriba de la lista: cuántas van y qué falta. En cada fila: un solo chip. En la hoja: «7 de 10 · faltan 3» pegado arriba mientras escribes."],
    ["El color solo dice el estado", "Verde: listo. Ámbar: mira esto. Gris azulado: queda para después. Negro: lo que toca hacer. Nada es de color por adorno."],
    ["Botones con palabras", "«Agregar otro modelo de Tops», «Llegó dañada», «Es otra prenda»: se reconocen, no hay que acordarse de qué hacía un ícono."],
    ["Perdonar antes que preguntar", "Todo lo que borra o pisa trae «Deshacer» durante 7 segundos. Solo se pregunta lo que no tiene vuelta: cancelar la recepción y salir de la hoja sin guardar."],
    ["Prevenir el error típico", "Un número muy por encima de lo que dijeron (40 donde dijeron 4) no se da por bueno: se pregunta. Si repartes más de lo que contaste, la hoja lo dice y ofrece la salida."],
    ["Valores de fábrica que acompañan", "Una prenda del catálogo arranca en «repartir ahora»; una nueva, en «para después». El nombre de ejemplo cambia con la categoría elegida."],
    ["Los vacíos dicen qué hacer", "Un filtro sin resultados explica por qué y trae su botón «Ver todos los modelos»."],
    ["«Sigue aquí»", "Un solo lugar encendido a la vez (la guía de foco del ERP): en la lista, el modelo que sigue; en el contador, el paso que toca; en una hoja, el campo que falta."],
  ];
  const cajonPorQue = () => `<div class="rm-velo" data-cerrar-porque=""></div><aside class="rm-cajon" aria-label="Por qué así"><button type="button" class="rm-redondo rm-cajon-cerrar" data-cerrar-porque="" aria-label="Cerrar">${lucide("x", "h-4 w-4")}</button><h2>Por qué está así</h2><p>Las técnicas que ordenan la pantalla, y los casos que ya tienen respuesta.</p>${TECNICAS.map(([t, d], i) => `<div class="rm-cambio" style="--i:${i}"><b>${t}</b><p style="display:block;color:var(--color-taupe)">${d}</p></div>`).join("")}<h2 style="margin-top:22px">Los casos</h2><p>Toca uno para verlo en la pantalla.</p><div class="rd-casos-lista">${CASOS.map(([id, t, d]) => `<button type="button" data-caso="${id}" data-cerrar-porque=""><b>${t}</b><span>${d}</span></button>`).join("")}</div></aside>`;

  // ═════════ Pintar: el DOM vivo se parchea (como React), así cada entrada corre una vez ═════════
  function morph(vivo, nuevo) {
    if (vivo.nodeType !== nuevo.nodeType || (vivo.nodeType === 1 && (vivo.tagName !== nuevo.tagName || (vivo.dataset.key || "") !== (nuevo.dataset.key || "")))) { vivo.replaceWith(nuevo.cloneNode(true)); return; }
    if (vivo.nodeType === 3) { if (vivo.nodeValue !== nuevo.nodeValue) vivo.nodeValue = nuevo.nodeValue; return; }
    if (vivo.nodeType !== 1) return;
    for (const a of [...vivo.attributes]) if (!nuevo.hasAttribute(a.name)) vivo.removeAttribute(a.name);
    for (const a of [...nuevo.attributes]) if (vivo.getAttribute(a.name) !== a.value) vivo.setAttribute(a.name, a.value);
    if ((vivo.tagName === "INPUT" || vivo.tagName === "TEXTAREA") && document.activeElement !== vivo) { const v = vivo.tagName === "INPUT" ? nuevo.getAttribute("value") ?? "" : nuevo.textContent; if (vivo.value !== v) vivo.value = v; }
    if (vivo.tagName === "INPUT" || vivo.tagName === "BUTTON" || vivo.tagName === "TEXTAREA") vivo.disabled = nuevo.hasAttribute("disabled");
    if (vivo.tagName === "TEXTAREA") return;
    const nc = [...nuevo.childNodes];
    const porClave = new Map([...vivo.childNodes].filter((n) => n.nodeType === 1 && n.dataset.key).map((n) => [n.dataset.key, n]));
    nc.forEach((n, i) => {
      let v = vivo.childNodes[i];
      if (n.nodeType === 1 && n.dataset.key && porClave.get(n.dataset.key) && porClave.get(n.dataset.key) !== v) { vivo.insertBefore(porClave.get(n.dataset.key), v || null); v = vivo.childNodes[i]; }
      if (!v) { vivo.appendChild(n.cloneNode(true)); return; }
      morph(v, n);
    });
    while (vivo.childNodes.length > nc.length) vivo.lastChild.remove();
  }
  function parchear(el, html) { const t = document.createElement(el.tagName); for (const a of [...el.attributes]) t.setAttribute(a.name, a.value); t.innerHTML = html; morph(el, t); }

  const menuLateral = q.get("menu") === "abierto" ? "abierto" : "plegado";
  document.body.insertAdjacentHTML("afterbegin", window.MARCOS[menuLateral] + window.MARCOS.main + window.MARCOS.despues);
  const main = $("#maqueta");

  function chapa() {
    let el = $("#rm-chapa");
    if (!el) { el = document.createElement("div"); el.id = "rm-chapa"; el.className = "rm-chapa rd-chapa"; document.body.append(el); }
    el.toggleAttribute("data-plegada", !E.chapaAbierta);
    const v = (id, t) => `<button type="button" data-vista="${id}" aria-pressed="${E.vista === id}">${t}</button>`;
    const nombreVista = { contar: "Contar", cerrar: "Revisa y cierra", cerrado: "Cerrado" }[E.vista];
    const nombreCaso = (CASOS.find(([id]) => id === E.caso) || [])[1] || "";
    parchear(el, `<button type="button" class="rm-chapa-pill" data-chapa="" aria-expanded="${!!E.chapaAbierta}"><span>Maqueta</span><b>${nombreVista}${E.vista === "contar" && nombreCaso ? ` · ${nombreCaso}` : ""}${E.cara === "hoy" ? " · HOY" : ""}</b>${lucide(E.chapaAbierta ? "chevron-down" : "chevron-up", "h-4 w-4")}</button><b>Vista</b>${v("contar", "1 · Contar")}${v("cerrar", "2 · Revisa y cierra")}${v("cerrado", "3 · Cerrado")}<span class="rm-chapa-sep"></span><b>Casos para probar</b>${CASOS.map(([id, t, d]) => `<button type="button" data-caso="${id}" aria-pressed="${E.caso === id}" title="${esc(d)}">${t}</button>`).join("")}<span class="rm-chapa-sep"></span><button type="button" data-cara="propuesta" aria-pressed="${E.cara === "propuesta"}">Propuesta</button><button type="button" data-cara="hoy" aria-pressed="${E.cara === "hoy"}">Hoy</button><button type="button" data-menu-lateral="" data-sutil>${menuLateral === "plegado" ? "Menú: plegado" : "Menú: abierto"}</button><span class="rm-chapa-sep"></span><button type="button" data-porque="">Por qué así</button>`);
  }
  const HOY = {};
  async function pintarHoy() {
    const id = E.vista;
    main.innerHTML = `<div class="rm-hoy"><div class="rm-hoy-marca">${lucide("eye", "h-4 w-4")}Así está hoy en producción · captura quieta, no responde</div><div id="rm-hoy-cuerpo"></div></div>`;
    if (!HOY[id]) { try { const r = await fetch(`../recibir-ordenada-2026-11/hoy-${id}.html`); HOY[id] = r.ok ? await r.text() : null; } catch { HOY[id] = null; } }
    const c = $("#rm-hoy-cuerpo");
    if (!c) return;
    c.innerHTML = HOY[id] || `<p class="rm-paso-ayuda">No hay captura. Abre la maqueta desde un servidor local (no con doble clic).</p>`;
    c.querySelectorAll("a[href]").forEach((a) => a.setAttribute("href", "#"));
  }
  function medir() { const mesa = $(".rd-mesa"); if (mesa) mesa.style.setProperty("--rd-arriba", `${Math.round(mesa.getBoundingClientRect().top + window.scrollY)}px`); }
  function pintar() {
    const act = document.activeElement, foco = act?.dataset?.k, pos = act?.selectionStart;
    chapa();
    parchear($("#capas"), (E.porQue ? cajonPorQue() : "") + (E.cara === "hoy" ? "" : hojas()));
    if (E.cara === "hoy") { pintarHoy(); return; }
    parchear(main, `<div data-key="vista-${E.vista}" class="contents">${E.vista === "cerrar" ? vistaCerrar() : E.vista === "cerrado" ? vistaCerrado() : vistaContar()}</div>`);
    medir();
    if (foco) { const el = document.querySelector(`[data-k="${CSS.escape(foco)}"]`); if (el && document.activeElement !== el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} } }
    if (E.editando) { const caja = $('[data-k="dial"]'); if (caja && document.activeElement !== caja) { caja.focus(); caja.select(); } }
    if (E.enfocar) { const el = document.querySelector(E.enfocar); E.enfocar = null; if (el) { el.focus(); el.select?.(); } }
    const fila = $(".rd-lista .rd-fila[data-activa]"); if (fila && E.llevarFila) { E.llevarFila = false; fila.scrollIntoView({ block: "nearest", behavior: document.documentElement.dataset.movimiento === "quieto" ? "auto" : "smooth" }); }
  }

  // ── Avisos: el aviso real del ERP (arriba a la derecha), con su «Deshacer» ──
  let relojAviso;
  function avisar(texto, { tono = "exito", detalle = "", deshacer = false } = {}) {
    const pila = $("[data-avisos]");
    pila.querySelectorAll(".aviso-tarjeta").forEach((a) => a.remove());
    clearTimeout(relojAviso);
    const ms = deshacer ? 7000 : 4200;
    const glifo = tono === "exito" ? '<path class="aviso-trazo" pathLength="1" d="M3.5 8.5l3 3 6-7"></path>' : '<path class="aviso-trazo" pathLength="1" d="M8 2.6l5.8 10.2H2.2z"></path><path class="aviso-trazo aviso-trazo-2" pathLength="1" d="M8 6.6v2.6"></path><circle class="aviso-punto" cx="8" cy="11.1" r=".95"></circle>';
    const a = document.createElement("div");
    a.className = "aviso-tarjeta"; a.dataset.tono = tono; a.setAttribute("role", "status"); a.style.setProperty("--ms", `${ms}ms`); a.style.pointerEvents = "auto";
    a.innerHTML = `<div class="contents"><span aria-hidden="true" class="aviso-ico"><svg viewBox="0 0 36 36" class="aviso-anillo"><circle class="aviso-disco" cx="18" cy="18" r="16"></circle><circle class="aviso-pista" cx="18" cy="18" r="17"></circle><circle class="aviso-onda" cx="18" cy="18" r="17"></circle><circle class="aviso-reloj" cx="18" cy="18" r="17"></circle></svg><svg aria-hidden="true" viewBox="0 0 16 16" class="aviso-glifo">${glifo}</svg></span><div class="min-w-0 flex-1"><p class="aviso-tit">${texto}</p>${detalle ? `<p class="aviso-det">${detalle}</p>` : ""}${deshacer ? `<button type="button" class="aviso-acc label-cayla text-[11px]" data-deshacer="">Deshacer</button>` : ""}</div><button type="button" aria-label="Cerrar aviso" class="aviso-x" data-aviso-x=""><svg aria-hidden="true" viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"></path></svg></button></div>`;
    pila.append(a);
    relojAviso = setTimeout(() => { a.setAttribute("data-saliendo", ""); setTimeout(() => a.remove(), 320); if (deshacer) E.undo = null; }, ms);
  }
  /** Guarda cómo estaba todo antes de algo que pisa o borra, para poder deshacerlo. */
  function recordar() { E.undo = { modelos: copia(E.modelos), actual: E.actual }; }
  function deshacer() { if (!E.undo) return; E.modelos = E.undo.modelos; E.actual = E.undo.actual; E.undo = null; $("[data-avisos]").querySelectorAll(".aviso-tarjeta").forEach((a) => a.remove()); pintar(); }
  function guardando() { if (E.offline) { E.porEnviar++; return; } E.guardando = true; setTimeout(() => { E.guardando = false; pintar(); }, 700); }
  function celebrar(m) { if (estado(m).clave === "listo") { E.recien = m.id; setTimeout(() => { E.recien = null; pintar(); }, 1700); } }
  function poner(m, n, { tecleado = false } = {}) {
    const antes = m.contadas;
    const min = m.enStock || 0;
    m.contadas = Math.max(min, Math.round(n));
    m.conflicto = null;
    m.raro = esRaro(m, m.contadas) && (tecleado || m.raro);
    if (m.contadas > 0 && !m.modo) m.modo = modoPorDefecto(m);
    if (antes !== m.contadas) { guardando(); celebrar(m); }
  }

  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("button, a, [data-hoja-fuera], [data-cerrar-porque], [data-cerrar-lista]");
    const habiaGlobo = E.globo, habiaMenu = E.menu;
    if (!b) { if (habiaGlobo || habiaMenu) { E.globo = null; E.menu = false; pintar(); } return; }
    const d = b.dataset;
    if (b.tagName === "A") ev.preventDefault();
    if ("deshacer" in d) { deshacer(); return; }
    if ("avisoX" in d) { b.closest(".aviso-tarjeta")?.remove(); return; }
    const al = b.getAttribute("aria-label") || "";
    if (!b.closest("#maqueta, #rm-chapa, #capas")) {
      if (al === "Modo oscuro") { const o = document.documentElement.dataset.tema === "oscuro"; document.documentElement.dataset.tema = o ? "claro" : "oscuro"; return; }
      if (al === "Animaciones" || b.closest('[aria-label="Animaciones"]')) { const qu = document.documentElement.dataset.movimiento === "quieto"; document.documentElement.dataset.movimiento = qu ? "vivo" : "quieto"; avisar(qu ? "Animaciones encendidas" : "Animaciones apagadas"); return; }
      if (/menú lateral/.test(al)) { const u = new URL(location.href); u.searchParams.set("menu", menuLateral === "plegado" ? "abierto" : "plegado"); u.searchParams.set("caso", E.caso); location.href = u.toString(); return; }
      avisar("Eso es del marco del ERP", { tono: "aviso", detalle: "En la maqueta no hace nada." });
      return;
    }
    E.globo = null; E.menu = false;
    const m = actual();
    const h = E.hoja;

    // ── La chapa ──
    if ("chapa" in d) E.chapaAbierta = !E.chapaAbierta;
    else if (d.vista) { E.vista = d.vista; E.hoja = null; E.editando = false; if (d.vista !== "contar" && !cifras().listoParaCerrar && E.caso !== "grande") { contarTodo(); } if (d.vista === "cerrado") E.motivo = E.motivo || "No vino"; }
    else if (d.caso) { caso(d.caso); E.vista = "contar"; E.cara = "propuesta"; if ("cerrarPorque" in d) E.porQue = false; E.llevarFila = true; }
    else if (d.cara) E.cara = d.cara;
    else if ("menuLateral" in d) { const u = new URL(location.href); u.searchParams.set("menu", menuLateral === "plegado" ? "abierto" : "plegado"); u.searchParams.set("caso", E.caso); location.href = u.toString(); return; }
    else if ("porque" in d) E.porQue = true;
    else if ("cerrarPorque" in d) E.porQue = false;

    // ── La lista ──
    else if (d.globo) E.globo = habiaGlobo === d.globo ? null : d.globo;
    else if ("verLista" in d) E.hojaLista = true;
    else if ("cerrarLista" in d) { if (ev.target === b) E.hojaLista = false; else return; }
    else if (d.modelo) { E.actual = d.modelo; E.editando = false; E.hojaLista = false; E.llevarFila = true; }
    else if (d.cat) { const grande = E.modelos.length > 12; const abierta = E.cerradas[d.cat] === undefined ? !grande || E.modelos.some((x) => x.cat === d.cat && x.id === E.actual) : !E.cerradas[d.cat]; E.cerradas[d.cat] = abierta; }
    else if ("filtros" in d) E.filtrosAbiertos = !E.filtrosAbiertos;
    else if ("quitarFiltro" in d) E.filtro = "todos";
    else if (d.filtro) { E.filtro = E.filtro === d.filtro && d.filtro !== "todos" ? "todos" : d.filtro; E.filtrosAbiertos = false; }
    else if ("verTodos" in d) { E.filtro = "todos"; E.buscar = ""; }
    else if ("agregar" in d) { E.hoja = { tipo: "agregar", cat: d.agregar || "", nombre: "", n: 0, existe: null }; E.hojaLista = false; }
    else if ("cerrarConteo" in d) { if (cifras().listoParaCerrar) { E.vista = "cerrar"; } else E.globo = habiaGlobo === "faltan" ? null : "faltan"; }
    else if (d.ir) { if (b.disabled) return; E.vista = d.ir; E.editando = false; if (d.ir === "cerrado") avisar("Envío cerrado", { detalle: "En el ERP aquí entra al stock de verdad y queda el acta." }); }

    // ── El contador ──
    else if ("menu" in d) E.menu = !habiaMenu;
    else if ("editar" in d) E.editando = true;
    else if (d.suma) { E.editando = false; poner(m, (m.contadas || 0) + Number(d.suma)); }
    else if (d.poner) { E.editando = false; const antes = m.contadas; if (antes != null && antes !== Number(d.poner)) recordar(); poner(m, Number(d.poner)); if (antes != null && antes !== m.contadas) avisar(Number(d.poner) === 0 ? "Quedó en cero" : `Quedó en ${miles(m.contadas)}`, { detalle: `${esc(m.nombre)} tenía ${miles(antes)}.`, deshacer: true }); else if (Number(d.poner) === 0) avisar("Anotado: no llegó ninguna", { detalle: esc(m.nombre) }); }
    else if ("confirmarRaro" in d) { m.raro = false; guardando(); avisar(`Anotadas las ${miles(m.contadas)}`, { detalle: "Como es mucho más de lo que dijeron, Compras lo verá al cerrar." }); }
    else if (d.conflicto) { if (d.conflicto === "suyo") { recordar(); m.contadas = m.conflicto.valor; } m.conflicto = null; guardando(); }
    else if (d.modo) { m.modo = d.modo; guardando(); if (d.modo === "despues") avisar("Queda para después", { detalle: "Se vende cuando le pongas tallas y colores." }); }
    else if (d.mover) { const i = E.modelos.indexOf(m) + Number(d.mover); E.editando = false; E.llevarFila = true; if (E.modelos[i]) E.actual = E.modelos[i].id; }
    else if (d.irPendiente) { E.editando = false; E.llevarFila = true; E.actual = d.irPendiente; }
    else if ("quitarDanada" in d) { recordar(); m.danadas.splice(Number(d.quitarDanada), 1); avisar("Se quitó la anotación", { deshacer: true }); }
    else if ("quitarObs" in d) { recordar(); m.obs.splice(Number(d.quitarObs), 1); avisar("Se quitó la nota", { deshacer: true }); }
    else if ("quitarModelo" in d) { recordar(); const i = E.modelos.indexOf(m); E.modelos.splice(i, 1); E.actual = (E.modelos[i] || E.modelos[i - 1]).id; avisar(`Se quitó ${esc(m.nombre)}`, { detalle: m.contadas ? `Tenía ${miles(m.contadas)} contadas.` : "", deshacer: true }); }
    else if ("volverRed" in d) { const n = E.porEnviar; E.offline = false; E.porEnviar = 0; avisar("Volvió la conexión", { detalle: n ? `Se enviaron los ${n} conteos que estaban esperando.` : "Todo estaba al día." }); }

    // ── Abrir y cerrar hojas ──
    else if (d.hojaAbrir) {
      const t = d.hojaAbrir;
      if (t === "tallas") abrirTallas(m);
      else if (t === "danado") E.hoja = { tipo: "danado", id: m.id, n: 1, que: "" };
      else if (t === "obs") E.hoja = { tipo: "obs", id: m.id, texto: "" };
      else if (t === "otra") E.hoja = { tipo: "otra", id: m.id, buscar: "", elegida: "" };
      else if (t === "nombre") E.hoja = { tipo: "nombre", id: m.id, nombre: m.provisional ? "" : m.nombre };
      else if (t === "crear") E.hoja = { tipo: "crear", id: m.id, nombre: m.provisional ? "" : m.nombre, precio: "", tallas: [...m.tallas], colores: m.colores.map(([c]) => c) };
      else if (t === "cancelar") E.hoja = { tipo: "cancelar" };
      else if (t === "llevar") E.hoja = { tipo: "llevar", id: m.id, costo: m.costo || "", dueno: E.dueno };
      if (t === "tallas") E.enfocar = `[data-k="celda:${CSS.escape(E.hoja.foco)}"]`;
    }
    else if ("hojaCancelar" in d || "hojaFuera" in d) { if (h?.tipo === "tallas" && h.sucio && !h.salir) h.salir = true; else E.hoja = null; }
    else if (d.salir) { if (d.salir === "si") E.hoja = null; else h.salir = false; }

    // ── La hoja de tallas y colores ──
    else if (d.picker) h.picker = h.picker === d.picker ? null : d.picker;
    else if (d.agregarColor) { h.colores.push(D.coloresDeMas.find(([c]) => c === d.agregarColor)); h.picker = null; h.sucio = true; h.foco = `${d.agregarColor}|${h.tallas[0]}`; E.enfocar = `[data-k="celda:${CSS.escape(h.foco)}"]`; }
    else if (d.agregarTalla) { h.tallas.push(d.agregarTalla); h.tallas.sort((a, c) => D.ordenTallas.indexOf(a) - D.ordenTallas.indexOf(c)); h.picker = null; h.sucio = true; h.foco = `${h.colores[0][0]}|${d.agregarTalla}`; E.enfocar = `[data-k="celda:${CSS.escape(h.foco)}"]`; }
    else if (d.quitarColor) { if (h.colores.length <= 1) { avisar("Tiene que quedar al menos un color", { tono: "aviso" }); return; } const tenia = h.tallas.reduce((a, t) => a + (h.rep[`${d.quitarColor}|${t}`] || 0), 0); h.undoHoja = copia({ rep: h.rep, colores: h.colores, tallas: h.tallas }); h.colores = h.colores.filter(([c]) => c !== d.quitarColor); Object.keys(h.rep).forEach((k) => { if (k.startsWith(`${d.quitarColor}|`)) delete h.rep[k]; }); h.sucio = true; avisarHoja(`Se quitó ${d.quitarColor}${tenia ? ` (tenía ${tenia})` : ""}`); }
    else if (d.quitarTalla) { if (h.tallas.length <= 1) { avisar("Tiene que quedar al menos una talla", { tono: "aviso" }); return; } const tenia = h.colores.reduce((a, [c]) => a + (h.rep[`${c}|${d.quitarTalla}`] || 0), 0); h.undoHoja = copia({ rep: h.rep, colores: h.colores, tallas: h.tallas }); h.tallas = h.tallas.filter((t) => t !== d.quitarTalla); Object.keys(h.rep).forEach((k) => { if (k.endsWith(`|${d.quitarTalla}`)) delete h.rep[k]; }); h.sucio = true; avisarHoja(`Se quitó la talla ${d.quitarTalla}${tenia ? ` (tenía ${tenia})` : ""}`); }
    else if ("rellenar" in d) { const falta = h.contadas - suma(h.rep); h.rep[h.foco] = (h.rep[h.foco] || 0) + falta; h.sucio = true; h.recienCelda = h.foco; }
    else if ("vaciar" in d) { h.undoHoja = copia({ rep: h.rep, colores: h.colores, tallas: h.tallas }); h.rep = {}; h.sucio = true; avisarHoja("Se vació la tabla"); }
    else if ("subirContadas" in d) { h.contadas = suma(h.rep); h.sucio = true; }
    else if ("danAbrir" in d) h.dan = h.dan ? null : { v: "", n: 1, que: "" };
    else if (d.danV) h.dan.v = h.dan.v === d.danV ? "" : d.danV;
    else if (d.danN) h.dan.n = Math.max(1, h.dan.n + Number(d.danN));
    else if (d.danQue) h.dan.que = d.danQue;
    else if ("danAnotar" in d) { h.danadas.push({ v: h.dan.v === "Sin decir cuál" ? "" : h.dan.v, n: h.dan.n, que: h.dan.que }); h.dan = null; h.sucio = true; }
    else if ("danQuitar" in d) { h.danadas.splice(Number(d.danQuitar), 1); h.sucio = true; }
    else if ("guardarTallas" in d || "guardarLlevar" in d) {
      const x = porId(h.id); recordar();
      const completo = suma(h.rep) === h.contadas;
      Object.assign(x, { rep: h.rep, colores: h.colores, tallas: h.tallas, danadas: h.danadas, contadas: h.contadas, modo: "ahora", raro: false });
      guardando();
      if ("guardarLlevar" in d) { E.hoja = { tipo: "llevar", id: x.id, costo: x.costo || "", dueno: E.dueno }; }
      else { E.hoja = null; celebrar(x); avisar(completo ? `Repartidas las ${miles(x.contadas)}` : `Guardado: repartiste ${miles(suma(x.rep))} de ${miles(x.contadas)}`, { detalle: completo ? `${esc(x.nombre)} entra al stock al cerrar, o antes si la llevas tú.` : "Puedes seguir después: queda como «Faltan tallas».", deshacer: true }); }
    }
    else if (d.llDueno) h.dueno = d.llDueno;
    else if ("llevarGuardar" in d) {
      const x = porId(h.id); const cuantas = Math.max(0, repartidas(x) - (x.enStock || 0));
      x.enStock = repartidas(x); if (h.costo) x.costo = h.costo; E.dueno = h.dueno; E.hoja = null; E.undo = null;
      guardando(); celebrar(x);
      avisar(`${miles(cuantas)} ya están en el stock`, { detalle: `${esc(x.nombre)} · se venden cuando las bajes al piso. El envío sigue abierto.` });
    }

    // ── Las otras hojas ──
    else if (d.agCat) { h.cat = d.agCat; h.existe = null; E.enfocar = "#rd-ag-nombre"; }
    else if (d.agExiste) { h.nombre = d.agExiste; h.existe = d.agExiste; }
    else if (d.agN) h.n = Math.max(0, h.n + Number(d.agN));
    else if ("agGuardar" in d) {
      recordar();
      const prov = !h.nombre.trim();
      const nombre = prov ? `${h.cat.replace(/es$|s$/, "")} ${E.modelos.filter((x) => x.cat === h.cat && x.provisional).length + 1}` : h.nombre.trim();
      const nuevo = { id: `ag${Date.now()}`, cat: h.cat, nombre, provisional: prov, agregado: true, tipo: h.existe ? "restock" : "nuevo", dijeron: null, contadas: h.n > 0 ? h.n : null, modo: h.n > 0 ? (h.existe ? "ahora" : "despues") : null, costo: null, tallas: h.cat === "Pantalones" ? ["28", "30", "32"] : ["S", "M"], colores: [["Negro", "#2D2C2F"], ["Beige", "#D5BA98"]], rep: {}, danadas: [], obs: [] };
      const ultimo = E.modelos.map((x) => x.cat).lastIndexOf(h.cat);
      E.modelos.splice(ultimo >= 0 ? ultimo + 1 : E.modelos.length, 0, nuevo);
      E.actual = nuevo.id; E.hoja = null; E.filtro = "todos"; E.buscar = ""; E.llevarFila = true; E.cerradas[h.cat] = false;
      avisar(`Se agregó ${esc(nombre)}`, { detalle: prov ? "Ponle su nombre antes de cerrar." : "Cuéntalo como los demás.", deshacer: true });
    }
    else if (d.dn) h.n = Math.max(1, Math.min(porId(h.id).contadas, h.n + Number(d.dn)));
    else if (d.dq) h.que = d.dq;
    else if ("dnGuardar" in d) { const x = porId(h.id); recordar(); x.danadas.push({ v: "", n: h.n, que: h.que }); E.hoja = null; guardando(); avisar(`Anotadas ${miles(h.n)} ${h.n === 1 ? "dañada" : "dañadas"}`, { detalle: h.que, deshacer: true }); }
    else if (d.obsChip) h.texto = h.texto === d.obsChip ? "" : d.obsChip;
    else if ("obsGuardar" in d) { const x = porId(h.id); recordar(); x.obs.push(h.texto.trim()); E.hoja = null; guardando(); avisar("Nota guardada", { deshacer: true }); }
    else if (d.otra) h.elegida = d.otra;
    else if ("otraGuardar" in d) { const x = porId(h.id); recordar(); const era = x.nombre; if (h.elegida === "__nueva") Object.assign(x, { cambiada: era, nombre: `${x.cat.replace(/es$|s$/, "")} 1`, provisional: true, tipo: "nuevo", rep: {}, modo: x.contadas ? "despues" : null }); else Object.assign(x, { cambiada: era, nombre: h.elegida, tipo: "restock", provisional: false, rep: {}, modo: x.contadas ? "ahora" : null, lunares: false }); E.hoja = null; guardando(); avisar("Se cambió la prenda", { detalle: `Era «${esc(era)}». Lo contado se mantiene.`, deshacer: true }); }
    else if ("nombreGuardar" in d) { const x = porId(h.id); recordar(); x.nombre = h.nombre.trim(); x.provisional = false; E.hoja = null; guardando(); avisar("Nombre guardado", { deshacer: true }); }
    else if (d.crTalla) h.tallas = h.tallas.includes(d.crTalla) ? h.tallas.filter((t) => t !== d.crTalla) : [...h.tallas, d.crTalla].sort((a, c) => D.ordenTallas.indexOf(a) - D.ordenTallas.indexOf(c));
    else if (d.crColor) h.colores = h.colores.includes(d.crColor) ? h.colores.filter((c) => c !== d.crColor) : [...h.colores, d.crColor];
    else if ("crGuardar" in d) { const x = porId(h.id); const todos = [...x.colores, ...D.coloresDeMas]; Object.assign(x, { nombre: h.nombre.trim(), provisional: false, creada: true, modo: "ahora", tallas: h.tallas, colores: h.colores.map((c) => todos.find(([n]) => n === c)), rep: {} }); avisar(`Se creó ${esc(x.nombre)}`, { detalle: "Ahora reparte lo contado por talla y color." }); abrirTallas(x); E.enfocar = `[data-k="celda:${CSS.escape(E.hoja.foco)}"]`; }
    else if ("cancelarRecepcion" in d) { E.hoja = null; avisar("En el ERP, aquí se cancela la recepción", { tono: "aviso", detalle: "El envío vuelve a «En camino». La maqueta no lo hace." }); }
    else if ("dueno" in d) { E.dueno = E.dueno === "CAYLA" ? "CLAURE" : "CAYLA"; }
    else if (d.motivo) E.motivo = d.motivo;
    else if (d.nota) avisar("La maqueta no lo abre", { tono: "aviso", detalle: d.nota });
    pintar();
  });
  /** Dentro de la hoja no hay aviso flotante de «Deshacer» (taparía la tabla): se deshace desde un enlace en el propio aviso. */
  function avisarHoja(texto) { avisar(texto, { deshacer: false, detalle: "" }); const a = $("[data-avisos] .aviso-tarjeta .min-w-0"); if (a) a.insertAdjacentHTML("beforeend", `<button type="button" class="aviso-acc label-cayla text-[11px]" data-deshacer-hoja="">Deshacer</button>`); }
  document.addEventListener("click", (ev) => { const b = ev.target.closest("[data-deshacer-hoja]"); if (!b || !E.hoja?.undoHoja) return; Object.assign(E.hoja, E.hoja.undoHoja); E.hoja.undoHoja = null; b.closest(".aviso-tarjeta")?.remove(); pintar(); }, true);

  document.addEventListener("input", (ev) => {
    const k = ev.target.dataset.k; if (!k) return;
    const txt = ev.target.value;
    const n = parseInt(String(txt).replace(/\D/g, ""), 10);
    const h = E.hoja;
    if (k === "buscar") E.buscar = txt;
    else if (k === "guia") { E.guia = txt; return; }
    else if (k === "nota") { E.nota = txt; return; }
    else if (k === "dial") { const m = actual(); if (Number.isNaN(n)) m.contadas = null; else { m.contadas = Math.max(m.enStock || 0, n); if (m.contadas > 0 && !m.modo) m.modo = modoPorDefecto(m); } m.tecleado = true; return; }
    else if (k.startsWith("celda:")) { const c = k.slice(6); if (Number.isNaN(n) || n === 0) delete h.rep[c]; else h.rep[c] = n; h.sucio = true; h.foco = c; }
    else if (k === "ag-nombre") { h.nombre = txt; h.existe = null; }
    else if (k === "ag-n") h.n = Number.isNaN(n) ? 0 : n;
    else if (k === "obs") h.texto = txt;
    else if (k === "otra-buscar") h.buscar = txt;
    else if (k === "nombre") h.nombre = txt;
    else if (k === "cr-nombre") h.nombre = txt;
    else if (k === "cr-precio") h.precio = txt.replace(/[^\d.,]/g, "");
    else if (k === "ll-costo") h.costo = txt.replace(/[^\d.,]/g, "");
    pintar();
  });
  // La casilla donde está la persona: ahí cae «Poner las que faltan». Se anota al entrar con Tab, con el mouse o con el dedo.
  const anotarFoco = (ev) => { const k = ev.target.dataset?.k; if (k?.startsWith("celda:") && E.hoja && E.hoja.foco !== k.slice(6)) { E.hoja.foco = k.slice(6); pintar(); } };
  document.addEventListener("focusin", anotarFoco);
  document.addEventListener("pointerdown", anotarFoco);
  document.addEventListener("focusout", (ev) => {
    if (ev.target.dataset?.k !== "dial") return;
    E.editando = false; const m = actual();
    if (contado(m) && m.tecleado) { m.tecleado = false; m.raro = esRaro(m, m.contadas); guardando(); celebrar(m); }
    pintar();
  });
  document.addEventListener("keydown", (ev) => {
    const k = ev.target.dataset?.k;
    if (ev.key === "Escape") {
      if (E.hoja) { if (E.hoja.tipo === "tallas" && E.hoja.picker) E.hoja.picker = null; else if (E.hoja.tipo === "tallas" && E.hoja.sucio && !E.hoja.salir) E.hoja.salir = true; else E.hoja = null; pintar(); return; }
      if (E.porQue || E.globo || E.menu || E.hojaLista || E.editando) { E.porQue = false; E.globo = null; E.menu = false; E.hojaLista = false; E.editando = false; pintar(); }
      return;
    }
    if (ev.key === "Enter" && k === "dial") { ev.preventDefault(); ev.target.blur(); $('[data-mover="1"], [data-ir-pendiente], [data-hoja-abrir="tallas"]')?.focus(); return; }
    // En la tabla de tallas: Enter baja, las flechas mueven de casilla.
    if (k?.startsWith("celda:") && ["Enter", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(ev.key)) {
      const h = E.hoja, [c, t] = k.slice(6).split("|");
      let ci = h.colores.findIndex(([x]) => x === c), ti = h.tallas.indexOf(t);
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") { const inp = ev.target; if ((ev.key === "ArrowLeft" && inp.selectionStart > 0) || (ev.key === "ArrowRight" && inp.selectionEnd < inp.value.length)) return; ti += ev.key === "ArrowLeft" ? -1 : 1; }
      else ci += ev.key === "ArrowUp" ? -1 : 1;
      if (ev.key === "Enter" && ci >= h.colores.length) { ci = 0; ti += 1; }
      if (ci < 0 || ti < 0 || ci >= h.colores.length || ti >= h.tallas.length) { if (ev.key === "Enter") { ev.preventDefault(); $("[data-guardar-tallas]")?.focus(); } return; }
      ev.preventDefault();
      const el = document.querySelector(`[data-k="celda:${CSS.escape(`${h.colores[ci][0]}|${h.tallas[ti]}`)}"]`); el?.focus(); el?.select();
      return;
    }
    if (ev.key === "/" && !E.hoja && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { ev.preventDefault(); $('[data-k="buscar"]')?.focus(); }
  });
  window.addEventListener("resize", medir);

  if (q.get("caso") && CASOS.some(([id]) => id === q.get("caso"))) caso(q.get("caso"));
  if (q.get("vista")) { E.vista = q.get("vista"); if (E.vista !== "contar") { contarTodo(); if (E.vista === "cerrado") E.motivo = "No vino"; } }
  if (q.get("hoja") === "tallas") abrirTallas(actual());
  if (q.get("cara") === "hoy") E.cara = "hoy";
  if (q.get("tema") === "oscuro") document.documentElement.dataset.tema = "oscuro";
  if (q.get("movimiento") === "quieto") document.documentElement.dataset.movimiento = "quieto";
  pintar();
})();
