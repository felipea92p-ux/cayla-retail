/* Spikes «Plan de campaña · la visión» — datos de ejemplo, la cuenta real y la cabecera compartida.
   La cuenta (cuantilCritico, cuantilTriangular, calcular) es la de apps/web/lib/plan-compra-reglas.ts; la única novedad es `lambda`,
   el «precio de la plata»: sube o baja la seguridad de cobertura de TODAS las categorías a la vez para que la compra quepa en un tope. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento: la maqueta sigue */ } };
  const leer = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };

  // ---------- formato ----------
  const nES = (n) => Math.round(n).toLocaleString("es-PE");
  const sES = (n) => "S/ " + Math.round(n).toLocaleString("es-PE");
  const s2 = (n) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
  const MESL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
  const fCorta = (md) => { const [m, d] = md.split("-").map(Number); return d + " " + MES[m - 1]; };
  const fIso = (iso) => { const [y, m, d] = iso.split("-").map(Number); return d + " " + MES[m - 1] + " " + y; };

  // ---------- la cuenta del Plan (apps/web/lib/plan-compra-reglas.ts) ----------
  const precioEn = (p, d = 0) => Math.round(p * (1 - Math.min(Math.max(d, 0), 100) / 100) * 100) / 100;
  const cuantilCritico = (p, c, rec, d = 0) => { const cu = Math.max(precioEn(p, d) - c, 0), co = Math.max(c - (p * rec) / 100, 0); return cu + co === 0 ? 0.5 : cu / (cu + co); };
  const tri = (a, c, b, p) => { if (b <= a) return a; const q = Math.min(Math.max(p, 0), 1), fc = (c - a) / (b - a); return q < fc ? a + Math.sqrt(q * (b - a) * (c - a)) : b - Math.sqrt((1 - q) * (b - a) * (b - c)); };
  /** `lambda` = el precio de la plata. 0 = el plan de hoy. >0 = la compra se aprieta; <0 = se afloja (hasta cubrir el bueno). */
  function calcular(l, stock, lambda = 0) {
    const cu = Math.max(precioEn(l.precio, l.desc || 0) - l.costo, 0), co = Math.max(l.costo - (l.precio * l.rec) / 100, 0);
    const base = cu + co === 0 ? 0.5 : (cu - lambda * l.costo) / (cu + co);
    const q = Math.min(Math.max(base, 0), 1);
    const objetivo = Math.ceil(tri(l.flojo, l.normal, l.bueno, q) - 1e-9);
    const comprar = Math.max(0, objetivo - stock);
    return { cuantil: q, objetivo, stock, comprar, inversion: Math.round(comprar * l.costo * 100) / 100 };
  }

  // ---------- la campaña de los spikes ----------
  const DIAS_ERP = 26;          // el ERP vende desde el 30 de setiembre
  const CAMP = { nombre: "Navidad 2026", desde: "2026-12-01", hasta: "2026-12-31", dias: 31, hoy: "2026-10-26", mult: 2.0, diasParaLlegar: 14 };
  const CATS = [
    { id: "polos", n: "Polos", v: 366, hay: 458, viene: 0, precio: 39.9, costo: 19.0, rec: 50 },
    { id: "camisas", n: "Camisas y Blusas", v: 304, hay: 471, viene: 60, precio: 69.9, costo: 32.0, rec: 45 },
    { id: "tops", n: "Tops", v: 190, hay: 264, viene: 0, precio: 47.47, costo: 24.46, rec: 40 },
    { id: "pantalones", n: "Pantalones", v: 136, hay: 107, viene: 0, precio: 89.9, costo: 42.0, rec: 55 },
    { id: "faldas", n: "Faldas", v: 91, hay: 88, viene: 0, precio: 69.9, costo: 31.0, rec: 50 },
    { id: "conjuntos", n: "Conjuntos", v: 85, hay: 103, viene: 0, precio: 119.9, costo: 58.0, rec: 35 },
    { id: "accesorios", n: "Accesorios de moda", v: 81, hay: 266, viene: 0, precio: 29.9, costo: 11.0, rec: 60 },
    { id: "chalecos", n: "Chalecos", v: 74, hay: 105, viene: 0, precio: 79.9, costo: 36.0, rec: 40 },
    { id: "vestidos", n: "Vestidos", v: 71, hay: 194, viene: 0, precio: 109.9, costo: 50.0, rec: 30 },
    { id: "bodys", n: "Bodys", v: 58, hay: 164, viene: 0, precio: 49.9, costo: 22.0, rec: 35 },
    { id: "shorts", n: "Shorts", v: 52, hay: 70, viene: 0, precio: 59.9, costo: 26.0, rec: 50 },
  ].map((c, i) => {
    const normal = Math.max(1, Math.round((c.v / DIAS_ERP) * CAMP.dias));
    return { ...c, orden: i + 1, normal, flojo: Math.round(normal * 0.8), bueno: Math.round(normal * CAMP.mult) };
  });
  const TOPE_INICIAL = 28000;

  /** Lo que se espera sacar de tener `Q` prendas (sin descontar lo que costó), con la misma triangular del plan: vende min(demanda, Q) a precio
   *  de campaña y lo que sobra se recupera al % de lo que sobra. 200 cuantiles de la demanda bastan para una maqueta. */
  function valorDeTener(l, Q) {
    const N = 200, pc = precioEn(l.precio, l.desc || 0), s = (l.precio * l.rec) / 100;
    let t = 0;
    for (let k = 0; k < N; k++) { const D = tri(l.flojo, l.normal, l.bueno, (k + 0.5) / N); t += pc * Math.min(D, Q) + s * Math.max(Q - D, 0); }
    return t / N;
  }
  /** Lo que gana la compra por cada sol que cuesta: (valor de tener lo que hay + lo comprado − valor de tener lo que hay − lo que costó) ÷ lo que costó. */
  function retornoDeComprar(l, stock, comprar) {
    if (comprar <= 0) return { utilidad: 0, retorno: null };
    const gana = valorDeTener(l, stock + comprar) - valorDeTener(l, stock) - comprar * l.costo;
    return { utilidad: Math.round(gana), retorno: gana / (comprar * l.costo) };
  }

  /** El plan completo con un lambda. `edit` = ajustes manuales por categoría (id → comprar). */
  function plan(lambda = 0, ediciones = {}) {
    const filas = CATS.map((c) => {
      const k = calcular(c, c.hay + c.viene, lambda);
      const comprar = ediciones[c.id] !== undefined ? ediciones[c.id] : k.comprar;
      const inversion = Math.round(comprar * c.costo * 100) / 100;
      const cubre = c.hay + c.viene + comprar;
      const { utilidad, retorno } = retornoDeComprar(c, c.hay + c.viene, comprar);
      return { ...c, ...k, comprar, inversion, cubre, utilidad, retorno };
    });
    const total = filas.reduce((a, f) => a + f.inversion, 0);
    const prendas = filas.reduce((a, f) => a + f.comprar, 0);
    return { filas, total: Math.round(total * 100) / 100, prendas };
  }
  /** El lambda que hace que el plan cueste lo más cerca posible del tope sin pasarse (o sin quedarse corto si sobra plata). */
  function lambdaPara(tope) {
    const costoCon = (l) => plan(l).total;
    let lo = -0.6, hi = 3, mejor = 0;
    if (costoCon(0) === tope) return 0;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (costoCon(mid) > tope) lo = mid; else hi = mid; mejor = hi; }
    return Math.round(mejor * 1000) / 1000;
  }

  // ---------- calendario (campañas del sistema + una propia) ----------
  // ev = [mediana, mínimo, máximo, años] del índice «un día de la campaña vs un día normal del mismo año», tienda de Trujillo, Sinatra 2018-2025
  // (SQL de solo lectura sobre retail.ventas_historicas, 2026-10-26). Redondeado a 1 decimal. Es el total de la tienda, no una categoría.
  const CAL0 = [
    { id: "sanval", n: "San Valentín", d: ["01-31", "02-14"], ev: [0.9, 0.8, 1.3, 8], plan: true, uso: "pausada", pausaHasta: "2027-02-01", repite: "anual" },
    { id: "mujer", n: "Día de la Mujer", d: ["02-22", "03-08"], ev: [1.0, 0.7, 1.2, 8], uso: "no" },
    { id: "madre", n: "Día de la Madre", d: ["04-26", "05-10"], ev: [1.1, 0.9, 1.3, 7], uso: "activa", repite: "anual", movil: true },
    { id: "padre", n: "Día del Padre", d: ["06-07", "06-21"], ev: [1.0, 0.8, 1.1, 7], uso: "no", propia: true },
    { id: "fpatrias", n: "Fiestas Patrias", d: ["07-14", "07-29"], ev: [1.2, 0.3, 1.4, 8], nota: "El 0,3 es julio de 2020, con las tiendas cerradas.", uso: "activa", repite: "anual" },
    { id: "halloween", n: "Halloween", d: ["09-15", "10-31"], ev: [0.9, 0.7, 1.2, 8], plan: true, uso: "activa", repite: "anual", largo: true },
    { id: "aniv", n: "Aniversario CAYLA", d: ["10-01", "10-25"], ev: null, plan: true, uso: "activa", repite: "anual" },
    { id: "gato", n: "Día Internacional del Gato", d: ["10-24", "10-30"], ev: null, uso: "no", marketing: true },
    { id: "bf", n: "Black Friday", d: ["11-09", "11-30"], ev: [0.9, 0.7, 1.1, 8], uso: "activa", repite: "anual" },
    { id: "cyber", n: "CyberWow", d: null, ev: null, uso: "no" },
    { id: "navidad", n: "Navidad", d: ["12-11", "12-25"], ev: [2.0, 1.9, 2.7, 8], plan: true, uso: "activa", repite: "anual", ancla: true },
    { id: "findeanio", n: "Fin de año", d: ["12-26", "12-31"], ev: null, uso: "no" },
    { id: "perro", n: "Día Internacional del Perro", d: ["08-12", "08-26"], ev: null, uso: "no", marketing: true },
    { id: "tierra", n: "Día de la Tierra", d: ["04-08", "04-22"], ev: null, uso: "no", marketing: true },
  ];
  const veredicto = (ev) => (!ev ? { t: "Sin historia propia", c: "taupe" } : ev[0] >= 1.5 ? { t: "Pico claro", c: "verde" } : ev[0] >= 1.1 ? { t: "Sube un poco", c: "verde" } : ev[0] >= 0.95 ? { t: "No se nota", c: "taupe" } : { t: "No sube", c: "ambar" });

  // ---------- los avisos del Plan (cada uno dice qué es y cuánto pesa) ----------
  const ESC = { hoy: "Hoy (faltan 36 días para pedir)", justo: "Plazo justo (faltan 5 días)", tarde: "Plazo vencido", orden: "Todo en orden" };
  function avisosDe(esc) {
    const p = planActual();
    const topeV = tope();
    const pasa = p.total - topeV;
    const sinPlan = 4;
    const fechaLim = { hoy: "17/11", justo: "17/11", tarde: "17/11", orden: "17/11" }[esc];
    const L = [];
    if (esc === "tarde") L.push({ id: "plazo", nivel: "urgente", corto: "Ya no llega a tiempo", titulo: "Ya no llega a tiempo", texto: "Un pedido de hoy llega el 12/12: la campaña empezó el 1/12. Pide solo lo que cubra la segunda mitad, o salta a la próxima campaña.", acciones: [{ t: "Cambiar los días" }] });
    else if (esc === "justo") L.push({ id: "plazo", nivel: "urgente", corto: "Pide antes del " + fechaLim + " · 5 días", titulo: "Pide antes del " + fechaLim, texto: "Faltan 5 días para la fecha límite: 7 categorías tienen compra pendiente. Cuenta con 14 días para llegar a las tiendas (un supuesto, todavía sin historia de recepciones).", acciones: [{ t: "Cambiar los días" }] });
    else L.push({ id: "plazo", nivel: esc === "orden" ? "ok" : "info", corto: "Pide antes del " + fechaLim, titulo: "Pide antes del " + fechaLim + " · faltan " + (esc === "orden" ? 36 : 36) + " días", texto: "Cuenta con 14 días para llegar a las tiendas (un supuesto, todavía sin historia de recepciones).", acciones: [{ t: "Cambiar los días" }] });
    if (esc !== "orden") {
      L.push({ id: "stock", nivel: "pendiente", titulo: "Tienda AQP, LIM y TRU no tienen el stock al día", texto: "«Hay hoy» puede no ser exacto: el plan te pediría comprar de más. Cuéntalo antes de decidir.", acciones: [{ t: "Ver qué falta" }, { t: "Ir a Conteo" }] });
      L.push({ id: "sinplan", nivel: "pendiente", titulo: sinPlan + " de las 10 que más venden no tienen plan", texto: "Empieza por Faldas, Conjuntos, Chalecos y Shorts.", acciones: [{ t: "Seguir con Faldas" }] });
      L.push({ id: "deriva", nivel: "pendiente", titulo: "La campaña ahora dice −25 %, tu plan de Casacas dice −20 %", texto: "Nadie volvió a abrir la categoría después de que cambió el descuento.", acciones: [{ t: "Revisar Casacas" }] });
    }
    if (pasa > 0 && esc !== "orden") L.push({ id: "tope", nivel: "pendiente", titulo: "Te pasas " + sES(pasa) + " de tu tope", texto: "El plan cuesta " + sES(p.total) + " y tu tope es " + sES(topeV) + ". Mira el plan con tope en Presupuesto.", acciones: [{ t: "Ver Presupuesto", href: "4-presupuesto.html" }] });
    L.push({ id: "datos", nivel: "info", titulo: "Los datos todavía no son exactos", texto: "El ERP lleva " + DIAS_ERP + " de 90 días de ventas y ninguna campaña completa. Los números orientan; mejoran solos con cada semana (la primera campaña completa será Navidad 2026).", acciones: [] });
    return L;
  }
  const lambdaFija = () => leer("pc.lambda", 0);
  const tope = () => leer("pc.tope", TOPE_INICIAL);


  // ---------- versiones del plan (las comparten el Paso 2 y el Presupuesto) ----------
  const VERS0 = [
    { v: 1, quien: "Felipe", cuando: "12 oct · 10:14", nota: "Primer plan con lo que propone el sistema", lambda: 0, ed: {}, tope: 28000 },
    { v: 2, quien: "Felipe", cuando: "14 oct · 16:02", nota: "Subí Tops a 120 por el pedido de Lima", lambda: 0, ed: { tops: 120 }, tope: 28000 },
    { v: 3, quien: "Encargada de TRU", cuando: "19 oct · 09:40", nota: "Bajé Pantalones a 150: ya hay 107 en tienda", lambda: 0, ed: { tops: 120, pantalones: 150 }, tope: 28000 },
    { v: 4, quien: "Felipe", cuando: "22 oct · 18:20", nota: "Volví a lo que propone el sistema", lambda: 0, ed: {}, tope: 28000 },
  ];
  const vers = () => leer("pc.versiones", null) || VERS0.map((x) => ({ ...x, ed: { ...x.ed } }));
  const guardaVers = (v) => guardar("pc.versiones", v);
  const actualV = () => { const v = vers(); return v[v.length - 1]; };
  /** El plan de hoy (la versión actual) con, si se pide, cambios que todavía no son versión. */
  const planActual = (extra = {}) => { const a = actualV(); return plan(a.lambda, { ...a.ed, ...extra }); };
  const nuevaVersion = (x) => { const v = vers(); v.push({ v: v.length + 1, quien: "Felipe", cuando: "26 oct · 10:41", ...x }); guardaVers(v); const a = v[v.length - 1]; guardar("pc.lambda", a.lambda); guardar("pc.tope", a.tope); return a; };

  // ---------- íconos ----------
  const I = {
    campana: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    cerrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>',
    alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>',
    flecha: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  };

  // ---------- cabecera compartida ----------
  const LINKS = [["index.html", "Inicio"], ["1-calendario.html", "① Calendario"], ["2-avisos.html", "② Avisos"], ["3-paso-2.html", "③ Paso 2"], ["4-presupuesto.html", "④ Presupuesto"], ["5-finanzas.html", "⑤ Finanzas"], ["6-modelos.html", "⑥ Modelos"], ["7-enviar-a-compras.html", "⑦ A Compras"]];
  const cfg = () => ({ av: leer("pc.av", "flotar"), asoma: leer("pc.asoma", true), rot: leer("pc.rot", false), esc: leer("pc.esc", "hoy"), cal: leer("pc.cal", "tab") });
  const est = { abierta: false, vistos: new Set(leer("pc.vistos", [])) };

  function chrome(o) {
    const c = cfg();
    const archivo = location.pathname.split("/").pop() || "index.html";
    $("#chrome").innerHTML =
      `<div class="mq"><b>Spikes</b>${LINKS.map(([h, t]) => `<a href="${h}" class="${h === archivo ? "on" : ""}">${t}</a>`).join("")}<span class="sp"></span><span class="etq">datos de ejemplo</span><button id="tema" type="button">Oscuro</button></div>` +
      `<div class="sede">Compras · lunes, 26 de octubre · 08:44</div>` +
      `<div class="cab"><div><h1>Plan de campaña</h1><p class="frase">${o.frase || "Navidad 2026: cuánto comprar de cada categoría, de qué colores y cuánto cuesta."}</p></div>` +
      `<div><button class="pil" id="selCamp" type="button" style="height:40px;display:inline-flex;gap:8px;align-items:center;letter-spacing:.12em;text-transform:uppercase;font-size:11.5px;font-weight:600">NAVIDAD 2026 · 1 DIC – 31 DIC ${I.flecha}</button></div></div>` +
      `<div class="fila-tabs"><div class="tabs" role="tablist" aria-label="Vistas del Plan de campaña">` +
      [["plan", "Plan", "3-paso-2.html"], ["presupuesto", "Presupuesto", "4-presupuesto.html", true], ...(c.cal === "tab" ? [["calendario", "Calendario", "1-calendario.html", true]] : []), ["resultados", "Resultados", null], ["historial", "Historial", null]]
        .map(([k, t, h, nuevo]) => (h ? `<a class="tab ${o.activa === k ? "on" : ""}" href="${h}">${t}${nuevo ? '<span class="nuevo">nuevo</span>' : ""}</a>` : `<span class="tab off" title="Queda como hoy">${t}</span>`)).join("") +
      `</div><span class="sp-tabs"></span><span id="asoma"></span><div class="cent" id="centro"></div></div><div id="panelAv"></div>`;
    $("#tema").onclick = () => { const o2 = document.documentElement.dataset.tema === "oscuro" ? "" : "oscuro"; if (o2) document.documentElement.dataset.tema = o2; else delete document.documentElement.dataset.tema; guardar("pc.tema", o2); $("#tema").textContent = o2 ? "Claro" : "Oscuro"; };
    if (leer("pc.tema", "") === "oscuro") { document.documentElement.dataset.tema = "oscuro"; $("#tema").textContent = "Claro"; }
    $("#selCamp").onclick = () => { if (window.PC.alElegirCampana) window.PC.alElegirCampana(); };
    montarAvisos();
  }

  // ---------- el centro de avisos ----------
  function montarAvisos() {
    const c = cfg();
    const lista = avisosDe(c.esc);
    const cuentan = lista.filter((a) => (a.nivel === "urgente" || a.nivel === "pendiente") && !est.vistos.has(a.id));
    const urg = lista.find((a) => a.nivel === "urgente");
    const n = cuentan.length;
    const abierta = est.abierta;
    $("#centro").innerHTML =
      `<button type="button" class="camp ${n ? "" : "vacio"} ${urg ? "urg" : ""} ${abierta ? "abierta" : ""} ${c.rot ? "rot" : ""}" id="btnAv" aria-expanded="${abierta}" aria-label="${abierta ? "Ocultar los avisos" : "Avisos: " + n + " por atender"}" title="${abierta ? "Ocultar los avisos" : "Avisos"}">${abierta ? I.cerrar : I.campana}<span class="n">${n}</span><span class="txt">${abierta ? "Ocultar" : "Avisos"}</span></button>` +
      (abierta && c.av === "flotar" ? `<div class="flota" role="region" aria-label="Avisos"><h4>Avisos · ${n ? n + " por atender" : "nada por atender"}</h4><div class="flota-lista" tabindex="0">${cuerpoAvisos(lista)}</div></div>` : "");
    $("#asoma").innerHTML = c.asoma && !abierta && urg ? `<span class="asoma" role="status">${urg.corto}</span>` : "";
    $("#panelAv").innerHTML = abierta && c.av !== "flotar" ? `<div class="panel-av" role="region" aria-label="Avisos">${cuerpoAvisos(lista)}</div>` : "";
    $("#btnAv").onclick = () => { est.abierta = !est.abierta; montarAvisos(); };
    $$("[data-visto]").forEach((b) => (b.onclick = () => { est.vistos.add(b.dataset.visto); guardar("pc.vistos", [...est.vistos]); montarAvisos(); }));
    $$("[data-acc]").forEach((b) => (b.onclick = () => { const h = b.dataset.href; if (h) location.href = h; else b.textContent = "Listo (en la maqueta no abre nada)"; }));
    posicionarFlota();
    if (window.PC.alAvisos) window.PC.alAvisos(lista, n);
  }
  /** El panel flotante se ancla bajo el botón y nunca pasa del borde de la ventana: si hay más avisos de los que caben, su lista tiene barra propia. */
  function posicionarFlota() {
    const f = $(".flota"), b = $("#btnAv");
    if (!f || !b) return;
    const r = b.getBoundingClientRect();
    f.style.position = "fixed"; f.style.left = "auto"; f.style.top = r.bottom + 8 + "px"; f.style.right = Math.max(12, innerWidth - r.right) + "px";
    f.style.maxHeight = Math.max(180, innerHeight - r.bottom - 24) + "px";
  }
  window.addEventListener("scroll", () => posicionarFlota(), { passive: true });
  window.addEventListener("resize", () => posicionarFlota());
  document.addEventListener("click", (e) => { if (est.abierta && cfg().av === "flotar" && !e.target.closest(".flota") && !e.target.closest("#btnAv")) { est.abierta = false; montarAvisos(); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && est.abierta && cfg().av === "flotar") { est.abierta = false; montarAvisos(); const b = $("#btnAv"); if (b) b.focus(); } });
  function cuerpoAvisos(lista) {
    const vis = lista.filter((a) => !est.vistos.has(a.id) || a.nivel === "urgente");
    if (!vis.length) return `<div class="nota-vacia">Nada pendiente. Lo que ya viste vuelve a salir si cambia.</div>`;
    const tag = { urgente: "Urgente", pendiente: "Por atender", info: "Para saber", ok: "En orden" };
    const ico = { urgente: I.alerta, pendiente: I.alerta, info: I.info, ok: I.ok };
    return vis.map((a) => `<div class="aviso ${a.nivel}"><span class="ic">${ico[a.nivel]}</span><div><b><span class="tag">${tag[a.nivel]}</span>${a.titulo}</b><span class="d">${a.texto}</span></div><div class="acc">${(a.acciones || []).map((x) => `<button class="btn ch" data-acc="1" ${x.href ? `data-href="${x.href}"` : ""}>${x.t}</button>`).join("")}${a.nivel === "info" || a.nivel === "ok" ? `<button class="btn ch sut" data-visto="${a.id}">Entendido</button>` : a.nivel === "pendiente" ? `<button class="btn ch sut" data-visto="${a.id}" title="Deja de contarlo hasta que cambie">Ya lo vi</button>` : ""}</div></div>`).join("");
  }

  window.PC = { vers, guardaVers, actualV, planActual, nuevaVersion, $, $$, guardar, leer, nES, sES, s2, MES, MESL, fCorta, fIso, cuantilCritico, tri, calcular, CAMP, CATS, DIAS_ERP, plan, lambdaPara, CAL0, veredicto, ESC, avisosDe, I, chrome, montarAvisos, cfg, tope, TOPE_INICIAL, est };
})();
