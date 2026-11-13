/* La pantalla «Tienda web ▸ Pedidos»: cabecera, camino, lista, cerrados y vacíos. Las hojas viven en hojas.js. */
(function () {
  const FABRICA = "¡Hola {nombre}! 👋 Te escribimos de {tienda} por tu pedido {codigo} 🛍️\n¡Gracias por elegirnos! 💛";
  const AHORA_MIN = 12 * 60 + 55; // «Ahora» de la maqueta: 12:55

  const S = (P.S = {
    escenario: "pedidos", sede: "tru", filtro: null, como: false, busca: "", motivo: null, masCerrados: false,
    mensaje: FABRICA, caja: true, corte: false, recien: null, pila: [], resp: "r1", d: null,
  });
  P.FABRICA = FABRICA;
  P.acc = {};
  P.inp = {};

  /* ───────── Ayudas ───────── */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const soles = (n) => "S/ " + Number(n).toFixed(2);
  const ic = (n, c = "") => `<svg class="i ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const ini = (nombre) => nombre.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  const avatar = (nombre, t = 32) => `<span class="av" style="--t:${t}px" aria-hidden="true">${esc(ini(nombre))}</span>`;
  const thumb = (l, t = 36) => `<span class="thumb" style="--t:${t}px;--h:${l.hex}" aria-hidden="true"><svg class="i" style="stroke-width:1.6"><use href="#c-${l.cat}"/></svg></span>`;
  const pila = (lineas) => {
    const v = lineas.filter((l) => l.estado !== "quitada");
    return `<span class="pila" aria-hidden="true">${v.slice(0, 3).map((l) => thumb(l, 30)).join("")}${v.length > 3 ? `<span class="mas">+${v.length - 3}</span>` : ""}</span>`;
  };
  const chip = (t, tono = "neutro", o = {}) => `<span class="chip ${tono} ${o.nv ? "nv" : ""} ${o.sp ? "sp" : ""} ${o.vivo ? "vivo" : ""}">${esc(t)}</span>`;
  const T = () => (S.sede === "lim" ? "Tienda LIM" : "Tienda TRU");
  const corto = (min) => (min >= 60 ? `${Math.floor(min / 60)} h` : `${Math.max(1, Math.ceil(min))} min`);
  const hora = (min) => { const m = ((min % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
  const MOTIVO_TXT = {
    entregado: "Entregado", sin_confirmar: "Nadie lo confirmó a tiempo", sin_stock: "No hay stock", cliente_desistio: "El cliente desistió",
    cliente_no_respondio: "El cliente no respondió", cliente_no_pago: "El cliente no pagó", error_en_pedido: "Error en el pedido", no_se_puede_entregar: "No se puede entregar",
  };
  const MOTIVO_COLOR = { entregado: "var(--verde)", sin_confirmar: "var(--rojo)", sin_stock: "var(--ambar)", cliente_desistio: "var(--taupe)", cliente_no_respondio: "var(--pizarra)" };
  Object.assign(P, { esc, soles, ic, avatar, thumb, pila, chip, T, corto, hora, plural, MOTIVO_TXT, AHORA_MIN });

  /* ───────── Lo que dicen las reglas (pedidos-web-reglas.ts) ───────── */
  const vivas = (o) => o.lineas.filter((l) => l.estado !== "quitada");
  const total = (o) => Math.max(0, vivas(o).reduce((a, l) => a + l.precio, 0) - (o.cupon && o.cupon.estado !== "liberado" ? o.cupon.descuento : 0));
  const pagado = (o) => o.pagos.filter((g) => g.estado === "aprobado").reduce((a, g) => a + g.monto, 0);
  const falta = (o) => Math.max(0, Math.round((total(o) - pagado(o)) * 100) / 100);
  const pestana = (o) => ({ por_confirmar: "confirmar", confirmado: "cobrar", pagado: "entregar" }[o.estado] || "cerrados");
  const porDevolver = (o) => (o.estado === "anulado" ? pagado(o) : 0);
  const pideAlgo = (o) => pestana(o) !== "cerrados" || porDevolver(o) > 0;
  const motivoDe = (o) => (o.estado === "entregado" ? "entregado" : o.estado === "vencido" ? "sin_confirmar" : o.cierre || "otro");
  const unRojo = (o) => (o.estado === "por_confirmar" ? o.venceMin < 180 : o.estado === "confirmado" && pagado(o) === 0 ? o.anulaMin < 180 : false);
  Object.assign(P, { vivas, total, pagado, falta, pestana, porDevolver, motivoDe });

  function reloj(o) {
    if (o.estado === "por_confirmar") {
      const m = o.venceMin, u = m < 180, pct = Math.min(100, (1 - m / (P.PLAZOS.confirmar * 60)) * 100);
      const tono = u ? "rojo" : pct >= 50 ? "ambar" : "tinta";
      const cuando = AHORA_MIN + m >= 1440 ? "mañana" : "hoy";
      return { texto: `Se cierra en ${corto(m)}`, detalle: u ? "Si nadie lo confirma, se pierde" : `Hasta ${cuando} ${hora(AHORA_MIN + m)}`, tono, pct, barra: tono };
    }
    if (o.estado === "confirmado") {
      if (pagado(o) === 0) {
        const m = o.anulaMin, u = m < 180, pct = Math.min(100, (1 - m / (P.PLAZOS.sinPagar * 60)) * 100);
        const tono = u ? "rojo" : pct >= 50 ? "ambar" : "tinta";
        return { texto: `Sin pago, se anula en ${corto(m)}`, detalle: u ? "Si no paga, se pierde" : "Si no paga nada, se anula", tono, pct, barra: tono };
      }
      if (o.sinPagar) return { texto: `Falta ${soles(falta(o))} · ${o.confirmadoHace}`, detalle: `Pasó el aviso de ${P.PLAZOS.sinPagar} h`, tono: "rojo", pct: null };
      return { texto: `Pagó ${soles(pagado(o))} de ${soles(total(o))}`, detalle: "No se anula solo", tono: "tinta", pct: null };
    }
    if (o.estado === "pagado") {
      if (o.sinRecoger) return { texto: `Sin recoger · pagó ${o.pagadoHace}`, detalle: `Pasó el aviso de ${P.PLAZOS.recoger} días`, tono: "rojo", pct: 100, barra: "rojo" };
      if (!o.listo) {
        const n = o.lineas.filter((l) => l.estado === "por_conseguir").length || 1;
        return { texto: n > 1 ? `Espera ${n} prendas` : "Espera una prenda", detalle: "Avísale cuando llegue", tono: "pizarra", pct: null };
      }
      return { texto: "Listo para recoger", detalle: "Pide su código", tono: "verde", pct: 6, barra: "verde" };
    }
    if (porDevolver(o) > 0) return { texto: `Por devolver ${soles(porDevolver(o))}`, detalle: `Anulado: ${(MOTIVO_TXT[o.cierre] || "se cerró").toLowerCase()}`, tono: "rojo", pct: null };
    return { texto: MOTIVO_TXT[motivoDe(o)] || "Cerrado", detalle: "", tono: "tinta", pct: null };
  }
  function verbo(o) {
    if (o.estado === "por_confirmar") return "Confirmar";
    if (o.estado === "confirmado") return o.sinPagar && pagado(o) > 0 ? "Escribirle" : "Registrar pago";
    if (o.estado === "pagado") return o.sinRecoger ? "Escribirle" : o.listo ? "Entregar" : "Ver pedido";
    if (porDevolver(o) > 0) return "Devolver";
    return null;
  }
  function grupoDe(o) {
    if (o.estado === "por_confirmar") return o.venceMin < 180 ? 0 : 2;
    if (o.estado === "confirmado" && pagado(o) === 0) return o.anulaMin < 180 ? 0 : 2;
    if (o.estado === "anulado" || o.sinPagar || o.sinRecoger) return 1;
    if (o.estado === "pagado" && !o.listo) return 4;
    return 3;
  }
  const limite = (o) => (o.estado === "por_confirmar" ? o.venceMin : o.estado === "confirmado" && pagado(o) === 0 ? o.anulaMin : 1e9);
  const queToca = () => S.d.pedidos.filter(pideAlgo).sort((a, b) => grupoDe(a) - grupoDe(b) || limite(a) - limite(b) || a.id.localeCompare(b.id));
  const cerrados = () => S.d.pedidos.filter((o) => pestana(o) === "cerrados");
  const cobradoHoy = () => S.d.pedidos.flatMap((o) => o.pagos).filter((g) => g.hoy && g.estado === "aprobado").reduce((a, g) => a + g.monto, 0);
  Object.assign(P, { reloj, verbo, queToca, cerrados });
  P.buscar = (id) => S.d.pedidos.find((o) => o.id === id);

  /* ───────── Camino ───────── */
  function estaciones() {
    const ps = S.d.pedidos;
    const porC = ps.filter((o) => o.estado === "por_confirmar");
    const cob = ps.filter((o) => o.estado === "confirmado");
    const ent = ps.filter((o) => o.estado === "pagado");
    const cer = cerrados();
    const minVence = porC.length ? Math.min(...porC.map((o) => o.venceMin)) : null;
    const sinPago = cob.filter((o) => pagado(o) === 0);
    const minAnula = sinPago.length ? Math.min(...sinPago.map((o) => o.anulaMin)) : null;
    const nSinPagar = cob.filter((o) => o.sinPagar).length;
    const nSinRec = ent.filter((o) => o.sinRecoger).length;
    const listos = ent.filter((o) => o.listo).length, esperan = ent.length - listos;
    const dev = ps.reduce((a, o) => a + porDevolver(o), 0);
    return [
      { k: "confirmar", t: "Por confirmar", n: porC.length, pie: minVence !== null ? `El primero se cierra en ${corto(minVence)}` : "Nada esperando", pt: porC.length ? (minVence < 180 ? "var(--rojo)" : "var(--ambar)") : "var(--sand)", vivo: minVence !== null && minVence < 180 },
      { k: "cobrar", t: "Por cobrar", n: cob.length, pie: cob.length === 0 ? "Nada por cobrar" : [`Faltan ${soles(cob.reduce((a, o) => a + falta(o), 0))}`, minAnula !== null && minAnula < 180 ? `uno se anula en ${corto(minAnula)}` : nSinPagar ? `${nSinPagar} sin pagar` : null].filter(Boolean).join(" · "), pt: minAnula !== null && minAnula < 180 || nSinPagar ? "var(--rojo)" : cob.length ? "var(--ambar)" : "var(--sand)", vivo: minAnula !== null && minAnula < 180 },
      { k: "entregar", t: "Por entregar", n: ent.length, pie: ent.length === 0 ? "Nada por entregar" : nSinRec ? `${plural(nSinRec, "sin recoger", "sin recoger")} hace más de ${P.PLAZOS.recoger} días` : [listos ? plural(listos, "listo", "listos") : null, esperan ? `${esperan} espera${esperan > 1 ? "n" : ""} una prenda` : null].filter(Boolean).join(" · "), pt: nSinRec ? "var(--rojo)" : ent.length ? "var(--verde)" : "var(--sand)" },
      { k: "cerrados", t: "Cerrados", n: cer.length, pie: dev > 0 ? `${soles(dev)} por devolver` : "Últimos 30 días", pt: dev > 0 ? "var(--rojo)" : "var(--sand)" },
    ];
  }
  const TRAMOS = () => [["Confirmas", `${P.PLAZOS.confirmar} h`, true, "Si nadie confirma, se cierra solo"], ["Te paga", `${P.PLAZOS.sinPagar} h`, true, "Sin ningún pago, se anula solo"], ["Lo recoge", `${P.PLAZOS.recoger} días`, false, "Solo avisa"]];
  const REGLAS = () => ({
    confirmar: `Separar no toca el stock. Al confirmar, reservas las prendas. Sin confirmar en ${P.PLAZOS.confirmar} h, se cierra solo.`,
    cobrar: `Registra cada pago en el pedido. El que lo completa emite la boleta. Sin pagar nada en ${P.PLAZOS.sinPagar} h, se anula.`,
    entregar: "Se entrega con el código de 4 cifras del cliente. Recién ahí la prenda sale del stock.",
    cerrados: "Quedan 30 días: entregados, anulados y los que nadie confirmó.",
  });
  function camino() {
    const e = estaciones(), tr = TRAMOS();
    const tarjeta = (x, i) => `<button type="button" class="est ${x.n === 0 ? "cero" : ""}" style="--pt:${x.pt};--i:${i}" data-a="filtrar" data-p="${x.k}" aria-pressed="${S.filtro === x.k}">
        <span class="est-top"><i class="${x.vivo ? "vivo" : ""}"></i>${x.t}</span>
        <span class="quita" title="Quitar el filtro" aria-hidden="true">${ic("x", "p")}</span>
        <span class="est-n">${x.n}</span><span class="est-pie">${esc(x.pie)}</span></button>`;
    const tramo = (t) => `<span class="tramo"><b>${t[0]}</b><span class="lin" title="${esc(t[3])}">${ic("arrow-r")}</span><span class="${t[2] ? "cierra" : ""}">${t[1]}</span></span>`;
    return `<section data-nuevo="Siempre a la vista" aria-label="El camino de los pedidos web">
      <div class="camino">${tarjeta(e[0], 0)}${tramo(tr[0])}${tarjeta(e[1], 1)}${tramo(tr[1])}${tarjeta(e[2], 2)}${tramo(tr[2])}${tarjeta(e[3], 3)}</div>
      ${S.como ? `<div class="reglas">${["confirmar", "cobrar", "entregar", "cerrados"].map((k) => `<div class="regla"><b>${e.find((x) => x.k === k).t}</b>${esc(REGLAS()[k])}</div>`).join("")}</div>` : ""}
    </section>`;
  }

  /* ───────── Cabecera ───────── */
  function cabecera() {
    const c = cobradoHoy();
    return `<header class="cab">
      <div><div class="cab-sede">${esc(T())} · Tienda web</div><h1>Pedidos</h1><p class="frase">Lo que separaron en la web.</p></div>
      <div class="cab-der">
        ${c > 0 ? `<div class="cifra-cab" title="Lo que entró hoy por pagos de pedidos web"><span class="ico">${ic("banknote", "g")}</span><span><small>Cobrado hoy</small><b>${soles(c)}</b></span></div>` : ""}
        <button class="btn btn-secundario btn-cab" data-a="avisos" aria-label="Avisos de pedidos">${ic("bell")}<span class="t">Avisos</span></button>
        <button class="btn btn-secundario btn-cab" data-a="mensaje" aria-label="Mensaje predeterminado">${ic("msg-text")}<span class="t">Mensaje</span></button>
        <button class="btn btn-secundario btn-cab" style="width:40px;padding:0" data-a="como" aria-pressed="${S.como}" aria-label="¿Cómo funciona?" title="¿Cómo funciona?">${ic("help")}</button>
      </div></header>`;
  }

  /* ───────── Lista ───────── */
  function filaPedido(o, i) {
    const r = reloj(o), v = verbo(o), n = vivas(o).length;
    const abierto = S.pila.some((m) => m.tipo === "pedido" && m.id === o.id);
    const f = falta(o);
    return `<div class="fila r-${r.tono}" role="row" tabindex="0" data-a="abrir" data-p="${o.id}" ${S.recien === o.id ? "data-recien" : ""} aria-current="${abierto}" style="--i:${i}">
      <span class="c-cod"><span class="cod">${o.id}</span><span class="sub">${o.hace}</span></span>
      <span class="cli">${avatar(o.cliente.nombre, 32)}<span class="nom"><b>${esc(o.cliente.nombre)}</b><span class="sub">${plural(n, "prenda", "prendas")}</span></span>${pila(o.lineas)}</span>
      <span class="tot">${soles(total(o))}${o.estado === "confirmado" && pagado(o) > 0 ? `<span class="sub" style="font-weight:400">falta ${soles(f)}</span>` : ""}</span>
      <span class="rel t-${r.tono}"><b>${esc(r.texto)}</b>${r.detalle ? `<small>${esc(r.detalle)}</small>` : ""}${r.pct != null ? `<div class="barra ${r.barra || ""}" role="img" aria-label="Lleva ${Math.round(r.pct)} % del plazo"><i style="width:${Math.max(3, r.pct)}%"></i></div>` : ""}</span>
      <span class="acc">${v ? `<button type="button" class="btn btn-secundario btn-chico" data-a="abrir" data-p="${o.id}">${v}${ic("arrow-r", "fl")}</button>` : ""}</span>
    </div>`;
  }
  const GRUPOS = { 0: ["Urgente", "Se pierde en menos de 3 h", "rojo"], 1: ["Pide tu atención", "Ya pasó el aviso", "rojo"], 2: ["En plazo", "", ""], 3: ["En plazo", "", ""], 4: ["Esperan una prenda", "No depende de ti", ""] };
  function lista() {
    const todos = queToca();
    const f = S.filtro && S.filtro !== "cerrados" ? S.filtro : null;
    const ps = f ? todos.filter((o) => pestana(o) === f) : todos;
    const titulo = f ? estaciones().find((x) => x.k === f).t : "Lo que te toca";
    let cuerpo = "", i = 0;
    if (!ps.length) {
      const V = { confirmar: ["No hay pedidos por confirmar", "Cuando un cliente separe en la web, aparece aquí."], cobrar: ["Nada por cobrar", "Los pedidos confirmados esperan aquí su pago."], entregar: ["Nada por entregar", "Lo pagado que falta recoger aparece aquí."] };
      cuerpo = f ? vacio("phone", V[f][0], V[f][1], `<button class="pildora-f" data-a="filtrar" data-p="${f}">${esc(titulo)}<i>${ic("x", "p")}</i></button>`) : vacio("inbox", "", "Ningún cliente de esta tienda espera nada.", "", true);
    } else {
      let ult = null;
      cuerpo = `<div class="lista" role="table" data-nuevo="Por grupos">` + ps.map((o) => {
        const g = f ? null : GRUPOS[grupoDe(o)];
        const cab = g && g[0] !== ult ? (ult = g[0], `<div class="grupo-t ${g[2]}" style="padding-left:6px;padding-right:6px">${g[0]}${g[1] ? `<em>${g[1]}</em>` : ""}</div>`) : "";
        return cab + filaPedido(o, i++);
      }).join("") + `</div>`;
    }
    return `<section class="card" aria-label="${titulo}">
      <div class="card-cab"><h2 class="tit">${titulo}<span class="globito">${ps.length}</span></h2>
        ${f ? `<button class="pildora-f" data-a="filtrar" data-p="${f}" aria-label="Quitar el filtro">${esc(titulo)}<i>${ic("x", "p")}</i></button>` : `<span class="dato-cab">Primero lo que se pierde si no actúas</span>`}</div>${cuerpo}</section>`;
  }
  function vacio(icono, titulo, texto, extra = "", chico = false) {
    return `<div class="vacio ${chico ? "chico" : ""}"><span class="ic">${ic(icono)}</span>${titulo ? `<h3>${esc(titulo)}</h3>` : ""}<p>${esc(texto)}</p>${extra}</div>`;
  }
  function todoAlDia() {
    const ultimo = cerrados()[0];
    const t = !ultimo ? "Todavía no llegó ningún pedido." : `Nada por hacer. El último, ${ultimo.id}, ${ultimo.estado === "entregado" ? "ya se entregó" : "se cerró"}.`;
    return `<section class="card">${vacio("check-circle", S.d.pedidos.length ? "Todo al día" : "Aún no hay pedidos", t + " Cuando llegue uno, lo verás aquí.")}</section>`;
  }

  /* ───────── Cerrados ───────── */
  function cerradosSeccion(filtrado, aLaVista) {
    const todos = cerrados();
    const q = S.busca.trim().toLowerCase();
    let ps = todos.filter((o) => (!S.motivo || motivoDe(o) === S.motivo) && (!q || (o.id + " " + o.cliente.nombre).toLowerCase().includes(q)));
    const cuentas = {};
    todos.forEach((o) => { const k = motivoDe(o); cuentas[k] = (cuentas[k] || 0) + 1; });
    const orden = ["entregado", "sin_confirmar", "sin_stock"];
    const claves = Object.keys(cuentas).sort((a, b) => (orden.includes(a) ? orden.indexOf(a) : 9) - (orden.includes(b) ? orden.indexOf(b) : 9) || cuentas[b] - cuentas[a]);
    const resumen = todos.length ? `<div class="resumen-cierre">
        <div class="apilada" aria-hidden="true">${claves.map((k) => `<i style="flex:${cuentas[k]};background:${MOTIVO_COLOR[k] || "var(--taupe)"}"></i>`).join("")}</div>
        <div class="motivos" role="group" aria-label="Filtrar por motivo" data-nuevo="Filtra al tocar">${claves.map((k) => `<button type="button" class="mot" style="--mc:${MOTIVO_COLOR[k] || "var(--taupe)"}" data-a="filtroMotivo" data-p="${k}" aria-pressed="${S.motivo === k}"><i></i>${MOTIVO_TXT[k] || "Otro"} <b>${cuentas[k]}</b></button>`).join("")}</div>
        ${cuentas.sin_stock ? `<p class="pie-c">Si «no hay stock» crece, la web muestra prendas que esta tienda no tiene.</p>` : ""}</div>` : "";
    const visibles = filtrado || S.masCerrados || S.motivo || q ? ps : ps.slice(0, aLaVista);
    const guardados = ps.length - visibles.length;
    const filaC = (o, i) => {
      const dev = porDevolver(o) > 0;
      return `<div class="fila cerr" role="row" tabindex="0" data-a="abrir" data-p="${o.id}" style="--i:${i};box-shadow:none" aria-current="${S.pila.some((m) => m.tipo === "pedido" && m.id === o.id)}">
        <span class="c-cod"><span class="cod">${o.id}</span><span class="sub">${o.hace}</span></span>
        <span class="cli">${avatar(o.cliente.nombre, 32)}<span class="nom"><b>${esc(o.cliente.nombre)}</b><span class="sub">${plural(o.lineas.length, "prenda", "prendas")}</span></span>${pila(o.lineas)}</span>
        <span class="tot">${soles(total(o))}</span>
        <span class="rel">${dev ? chip(`Por devolver ${soles(porDevolver(o))}`, "rojo") : chip(MOTIVO_TXT[motivoDe(o)] || "Cerrado", motivoDe(o) === "entregado" ? "verde" : "neutro", { nv: true })}</span>
        <span class="acc">${dev ? `<button class="btn btn-secundario btn-chico" data-a="abrir" data-p="${o.id}">Devolver${ic("arrow-r", "fl")}</button>` : `<span class="taupe">${ic("chev-r")}</span>`}</span></div>`;
    };
    const filas = visibles.length ? `<div class="lista" role="table">${visibles.map(filaC).join("")}</div>` : ps.length === 0 && (S.motivo || q) ? vacio("search", "No encontré ese pedido", "Prueba con otro nombre o número.", `<button class="pildora-f" data-a="limpiar">Borrar la búsqueda<i>${ic("x", "p")}</i></button>`, true) : "";
    const mas = !filtrado && guardados > 0 ? `<button class="ver-mas" data-a="masCerrados" aria-expanded="false">Ver ${aLaVista > 0 ? `${guardados} más` : `los ${guardados}`}${ic("chev-d")}</button>` : (!filtrado && S.masCerrados && ps.length > aLaVista ? `<button class="ver-mas" data-a="masCerrados" aria-expanded="true">Ver menos${ic("chev-d")}</button>` : "");
    const vacioTodo = todos.length === 0 ? vacio("inbox", "Todavía no hay cerrados", "Aquí quedan, por 30 días, los entregados y los anulados.") : "";
    return `<section class="card" aria-label="Cerrados">
      <div class="card-cab"><h2 class="tit">${filtrado ? "Cerrados" : "Cerrados en 30 días"}<span class="globito">${todos.length}</span></h2>
        ${todos.length ? `<label class="busca" data-nuevo="Buscador">${ic("search")}<input data-i="busca" data-f="busca" value="${esc(S.busca)}" placeholder="Buscar por nombre o número" aria-label="Buscar entre los cerrados" autocomplete="off"></label>` : ""}</div>
      ${resumen}${filas}${vacioTodo}${mas}</section>`;
  }

  /* ───────── Para enviar a otra tienda ───────── */
  function paraEnviar() {
    if (!S.d.enviar.length) return "";
    return `<section class="card" aria-label="Para enviar a otra tienda">
      ${S.d.enviar.map((e) => `<div class="envio"><span class="ic">${ic("truck")}</span>
        <div class="txt"><span class="etq-envio">Otra sede te pidió esto</span><div><b>${e.id}</b> <span class="taupe">· para ${esc(e.tiendaPedido)}</span></div>
          <small>${pila(e.lineas)}<span class="una-linea">${plural(e.lineas.length, "prenda", "prendas")}: ${esc(e.lineas.map((l) => l.ref).join(", "))}</span></small></div>
        <button class="btn btn-primario" data-a="enviar" data-p="${e.id}">Enviar a ${esc(e.tiendaPedido)}${ic("arrow-r", "fl")}</button></div>`).join("")}</section>`;
  }

  /* ───────── Pantalla completa según la escena ───────── */
  function esqueleto() {
    return `<div class="cab"><div><div class="sk" style="width:200px;height:12px"></div><div class="sk" style="width:220px;height:46px;margin-top:10px"></div></div></div>
      <div class="camino" style="grid-template-columns:repeat(4,1fr);gap:12px">${[0, 1, 2, 3].map(() => `<div class="sk" style="height:128px;border-radius:18px"></div>`).join("")}</div>
      <section class="card"><div class="card-cab"><div class="sk" style="width:180px;height:24px"></div></div><div class="lista">${[0, 1, 2].map(() => `<div class="sk" style="height:78px;border-radius:14px"></div>`).join("")}</div></section>`;
  }
  function pantalla() {
    const e = S.escenario;
    const encab = `<header class="cab"><div><div class="cab-sede">${esc(T())} · Tienda web</div><h1>Pedidos</h1><p class="frase">Lo que separaron en la web.</p></div></header>`;
    if (e === "cargando") return esqueleto();
    if (e === "sedesintienda") return `${encab.replace(esc(T()), "Almacén central")}<div class="aviso info">${ic("info")}<div><b class="t">Los pedidos se atienden en una tienda</b>Cambia a una tienda con el selector de sede.</div></div>`;
    if (e === "error") return `${encab}<div class="aviso error">${ic("alert")}<div><b class="t">No se pudieron leer los pedidos</b>Recarga la página. Si sigue, avisa al líder.</div><span class="acc"><button class="btn btn-secundario btn-chico" data-a="reiniciar">Reintentar</button></span></div>`;
    const calmo = queToca().length === 0 && S.d.enviar.length === 0;
    const aviso = e === "nocarga" ? `<div class="aviso">${ic("alert")}<div><b class="t">No se pudo abrir ese pedido</b>Puede ser de otra tienda o ya no existir. Elige uno de la lista.</div></div>` : "";
    const cer = S.filtro === "cerrados";
    const centro = cer ? cerradosSeccion(true, 0) : calmo && !S.filtro ? todoAlDia() : lista();
    const pie = !cer && !S.filtro ? cerradosSeccion(false, calmo ? 3 : 0) : "";
    return `${cabecera()}${aviso}${camino()}${paraEnviar()}${centro}${pie}`;
  }

  /* ───────── Lateral y barra ───────── */
  function lateral() {
    const n = S.d.pedidos.filter((o) => o.estado === "por_confirmar").length;
    const it = (t, cur, extra = "") => `<button class="lat-it ${cur ? "" : "sin"}" ${cur ? 'aria-current="page"' : 'tabindex="-1" title="No es parte de esta maqueta"'}><span>${t}</span>${extra}</button>`;
    return `<div class="marca"><i></i>CAYLA</div>
      <div class="lat-grupo">Ventas</div>${it("Vender")}${it("Caja")}
      <div class="lat-grupo">Inventario</div>${it("Existencias")}${it("Traslados")}
      <div class="lat-grupo">Tienda web</div>${it("Resumen")}${it("Pedidos", true, n ? `<span class="globito pide">${n}</span>` : "")}${it("Vitrina")}${it("Campañas")}${it("Conf. tienda")}`;
  }
  function barra() {
    return `<span class="menu-movil"><i></i>CAYLA</span><span style="display:flex;gap:10px;align-items:center"><span class="pill-sede" style="--sede:${S.sede === "lim" ? "var(--sede-lim)" : "var(--sede-tru)"}"><i></i>${esc(T())}</span><button class="ic-btn" data-a="tema" aria-label="Cambiar entre claro y oscuro">${ic(document.documentElement.dataset.tema === "oscuro" ? "sun" : "moon")}</button></span>`;
  }

  /* ───────── Dibujar ───────── */
  P.render = function (anima) {
    const v = document.getElementById("vista");
    v.innerHTML = pantalla();
    document.getElementById("lateral").innerHTML = lateral();
    document.getElementById("barra-sup").innerHTML = barra();
    if (anima) { v.classList.add("anima"); clearTimeout(P._t); P._t = setTimeout(() => v.classList.remove("anima"), 1000); }
    if (P.refrescarCapas) P.refrescarCapas();
  };

  /* ───────── Avisos emergentes ───────── */
  P.avisar = function (tipo, titulo, detalle) {
    const c = document.getElementById("avisos");
    const el = document.createElement("div");
    el.className = `toast ${tipo}`;
    el.setAttribute("role", tipo === "error" ? "alert" : "status");
    el.innerHTML = `${ic(tipo === "exito" ? "check-circle" : tipo === "error" ? "alert" : "info", "g")}<div><b>${esc(titulo)}</b>${detalle ? `<span>${esc(detalle)}</span>` : ""}</div>`;
    c.appendChild(el);
    setTimeout(() => { el.classList.add("sale"); setTimeout(() => el.remove(), 220); }, 6500);
  };

  /* ───────── Escenas y reinicio ───────── */
  function cargarEscena() {
    S.d = P.crear();
    S.filtro = null; S.motivo = null; S.busca = ""; S.masCerrados = false; S.recien = null;
    if (S.escenario === "tranquilo") { S.d.pedidos = S.d.pedidos.filter((o) => pestana(o) === "cerrados" && porDevolver(o) === 0); S.d.enviar = []; }
    if (S.escenario === "nada") { S.d.pedidos = []; S.d.enviar = []; }
        if (S.escenario === "sedesintienda") S.d.enviar = [];
    if (S.sede === "lim") S.d.pedidos.forEach((o) => o.lineas.forEach((l, i) => (l.empresa = i % 2 ? "CLAURE" : "CAYLA")));
  }
  P.reiniciar = function () { S.pila = []; cargarEscena(); P.render(true); if (P.refrescarCapas) P.refrescarCapas(); };

  /* ───────── Acciones de la pantalla ───────── */
  Object.assign(P.acc, {
    filtrar: (el) => { const k = el.dataset.p; S.filtro = S.filtro === k ? null : k; S.motivo = null; S.busca = ""; P.render(true); },
    como: () => { S.como = !S.como; P.render(false); },
    filtroMotivo: (el) => { S.motivo = S.motivo === el.dataset.p ? null : el.dataset.p; P.render(false); },
    limpiar: () => { S.busca = ""; S.motivo = null; P.render(false); },
    masCerrados: () => { S.masCerrados = !S.masCerrados; P.render(false); },
    tema: () => P.tema(document.documentElement.dataset.tema === "oscuro" ? "claro" : "oscuro"),
    reiniciar: () => P.reiniciar(),
  });
  P.inp.busca = (el) => {
    S.busca = el.value;
    const pos = el.selectionStart;
    P.render(false);
    const nuevo = document.querySelector('[data-f="busca"]');
    if (nuevo) { nuevo.focus(); nuevo.setSelectionRange(pos, pos); }
  };
  P.tema = (t) => {
    document.documentElement.dataset.tema = t;
    document.getElementById("m-claro").setAttribute("aria-pressed", t === "claro");
    document.getElementById("m-oscuro").setAttribute("aria-pressed", t === "oscuro");
    document.getElementById("barra-sup").innerHTML = barra();
  };

  /* ───────── Arranque: marco y eventos ───────── */
  P.arrancar = function () {
    if (/[?&]quieto/.test(location.search)) document.documentElement.classList.add("quieto");
    cargarEscena();
    const marco = document.querySelector(".marco");
    const medir = () => document.documentElement.style.setProperty("--marco-h", marco.offsetHeight + "px");
    medir();
    new ResizeObserver(medir).observe(marco);
    const $ = (id) => document.getElementById(id);
    $("m-escenario").onchange = (e) => { S.escenario = e.target.value; S.pila = []; cargarEscena(); P.render(true); P.refrescarCapas && P.refrescarCapas(); };
    $("m-sede").onchange = (e) => { S.sede = e.target.value; S.pila = []; cargarEscena(); P.render(true); P.refrescarCapas && P.refrescarCapas(); };
    $("m-esc").onclick = () => vista(false);
    $("m-cel").onclick = () => vista(true);
    function vista(movil) { $("aparato").classList.toggle("movil", movil); $("m-esc").setAttribute("aria-pressed", !movil); $("m-cel").setAttribute("aria-pressed", movil); }
    $("m-claro").onclick = () => P.tema("claro");
    $("m-oscuro").onclick = () => P.tema("oscuro");
    $("m-caja").onclick = (e) => { S.caja = !S.caja; e.currentTarget.setAttribute("aria-pressed", S.caja); e.currentTarget.textContent = S.caja ? "Caja abierta" : "Caja cerrada"; P.refrescarCapas && P.refrescarCapas(); };
    $("m-red").onclick = (e) => { S.corte = !S.corte; e.currentTarget.setAttribute("aria-pressed", S.corte); };
    $("m-resaltar").onclick = (e) => { const on = e.currentTarget.getAttribute("aria-pressed") !== "true"; e.currentTarget.setAttribute("aria-pressed", on); document.body.classList.toggle("resaltar", on); };
    $("m-cambia").onclick = () => P.abrir({ tipo: "cambia" });
    $("m-reiniciar").onclick = () => P.reiniciar();

    document.addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-a]");
      if (!el) { P.cerrarMenus && P.cerrarMenus(); return; }
      const f = P.acc[el.dataset.a];
      if (f) { ev.stopPropagation(); f(el, ev); }
    });
    document.addEventListener("input", (ev) => { const el = ev.target.closest("[data-i]"); if (el && P.inp[el.dataset.i]) P.inp[el.dataset.i](el, ev); });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && S.pila.length) { if (P.menuAbierto && P.menuAbierto()) { P.cerrarMenus(); return; } P.cerrar(); }
      if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches && ev.target.matches(".fila[tabindex]")) { ev.preventDefault(); P.acc.abrir(ev.target); }
      if (ev.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { const b = document.querySelector('[data-f="busca"]'); if (b) { ev.preventDefault(); b.focus(); } }
    });
    P.render(true);
  };
})();
