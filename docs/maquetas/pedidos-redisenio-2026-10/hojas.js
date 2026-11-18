/* Las hojas (modales) de Pedidos: el pedido, registrar pago, anular pago, anular pedido pagado, enviar, mensaje, avisos y ticket. */
(function () {
  const { S, esc, soles, ic, avatar, thumb, chip, T, plural, vivas, total, pagado, falta, porDevolver, reloj, MOTIVO_TXT } = P;
  let UID = 0;

  /* ───────── Textos que vienen de las reglas ───────── */
  const NOMBRE_MEDIO = { yape: "Yape", plin: "Plin", transferencia: "Transferencia", efectivo: "Efectivo" };
  const COLOR_MEDIO = { yape: "var(--m-yape)", plin: "var(--m-plin)", transferencia: "var(--m-transf)", efectivo: "var(--m-efectivo)" };
  const MOTIVOS = {
    noConfirmar: [["sin_stock", "No hay stock"], ["cliente_no_respondio", "El cliente no respondió"], ["cliente_desistio", "El cliente desistió"]],
    anular: [["cliente_no_pago", "El cliente no pagó"], ["cliente_desistio", "El cliente desistió"], ["error_en_pedido", "Error en el pedido"]],
    anularPagado: [["cliente_desistio", "El cliente desistió"], ["error_en_pedido", "Error en el pedido"], ["no_se_puede_entregar", "No se puede entregar"]],
    anularPago: [["devuelto_al_cliente", "Se le devolvió"], ["error_al_anotar", "Se anotó por error"]],
  };
  const nombreLinea = (l) => [l.ref, l.color, l.talla].filter(Boolean).join(" · ");
  const libresAqui = (l) => l.disp.alm + l.disp.piso;
  const donde = (lugar) => (lugar === "almacen" ? "Sácala del almacén." : lugar === "piso" ? "Está en el piso: retírala del colgador." : "Sepárala para el pedido.");
  function disponible(l) {
    const aqui = libresAqui(l);
    if (aqui > 0) {
      const partes = [l.disp.alm ? `${l.disp.alm} en almacén` : null, l.disp.piso ? `${l.disp.piso} en piso` : null].filter(Boolean);
      return `Hay ${aqui} en ${T()}${partes.length ? ` (${partes.join(", ")})` : ""}`;
    }
    const o = [...l.disp.otras].sort((a, b) => b.n - a.n)[0];
    return o ? `No hay en ${T()}. Hay ${o.n} en ${o.t}.` : `No hay en ${T()} ni en otra sede.`;
  }
  function estadoLinea(l) {
    if (l.estado === "reservada") return l.otra ? ["Por traer", "ambar", `Reservada en ${l.otra}: falta que la envíen`] : ["Reservada", "verde", l.lugar === "almacen" ? "En el almacén" : l.lugar === "piso" ? "En el piso" : ""];
    if (l.estado === "por_conseguir") {
      if (l.traslado) return ["En camino", "pizarra", `Desde ${l.traslado.desde} · traslado N.º ${l.traslado.numero} · llega el ${l.traslado.llega}`];
      return [l.via === "taller" ? "En taller" : "Por comprar", "pizarra", `Prometida para el ${l.fecha}`];
    }
    if (l.estado === "quitada") return ["Quitada", "apagado", "Se quitó al confirmar"];
    if (l.estado === "liberada") return ["Liberada", "apagado", "Volvió a estar disponible"];
    if (l.estado === "entregada") return ["Entregada", "neutro", ""];
    return ["Por confirmar", "ambar", ""];
  }
  const sePuedeReservarYa = (l) => l.estado === "por_conseguir" && !l.traslado && libresAqui(l) > 0;
  const sePuedeAnular = (g, o) => g.estado === "aprobado" && (o.estado === "confirmado" || o.estado === "anulado");
  const textoPago = (g) => `<b class="tn">${soles(g.monto)}</b> <span class="met" style="--mc:${COLOR_MEDIO[g.medio]}"><i></i>${NOMBRE_MEDIO[g.medio]}</span>${g.op ? ` <span class="taupe tn">· op. ${g.op}</span>` : ""}`;
  function detallePago(g) {
    if (g.estado === "anulado") return `Anulado ${g.devuelto ? "· se le devolvió" : "· se anotó por error"}${g.medio === "efectivo" ? ` · salió de la caja de ${T()}` : ""}`;
    return `${g.cuando} · por ${g.por}${g.medio === "efectivo" && g.enCaja ? ` · entró a la caja de ${T()}` : ""}`;
  }
  const prim = (n) => n.split(/\s+/)[0];
  function wa(o, pl) {
    const n = prim(o.cliente.nombre), tienda = `CAYLA ${T().replace("Tienda ", "")}`;
    const M = {
      confirmado: `¡Hola ${n}! 🎉 Confirmamos tu pedido ${o.id} en ${tienda} (${soles(total(o))}).\n¿Cómo prefieres pagar? Yape, Plin, transferencia o en tienda 💳`,
      cobro: `¡Hola ${n}! 😊 Te escribimos por tu pedido ${o.id}. Falta pagar ${soles(falta(o))}.\n¿Te pasamos los datos para el Yape? 💜`,
      devolucion: `Hola ${n} 🙏 Tu pedido ${o.id} quedó anulado y te devolvemos ${soles(porDevolver(o))}.\n¿Cómo prefieres recibirlo?`,
      sinstock: `Hola ${n} 😊 Revisamos tu pedido ${o.id} y una prenda ya no está en ${tienda}.\n¿Te ofrecemos otra talla, otro color o pedirla a otra sede? 👗`,
      listo: `¡Hola ${n}! 🛍️ Tu pedido ${o.id} ya está listo para recoger en ${tienda}.\nTu código está en «Mis pedidos», en tu cuenta de la web 🔑 Muéstralo en caja.`,
      norecoge: `Hola ${n} 😊 Tu pedido ${o.id} te espera en ${tienda}.\n¿Cuándo pasas a recogerlo? Tu código está en «Mis pedidos» 🔑`,
      libre: `¡Hola ${n}! 👋 Te escribimos de ${tienda} por tu pedido ${o.id}.`,
    };
    return M[pl] || M.libre;
  }
  const waBtn = (p, texto = "WhatsApp", extra = "btn-secundario") => `<button class="btn ${extra} btn-wa" data-a="wa" data-p="${p}">${ic("wa")}${texto}</button>`;
  const waBtnChico = (p, texto = "WhatsApp") => `<button class="btn btn-secundario btn-chico btn-wa" data-a="wa" data-p="${p}">${ic("wa")}${texto}</button>`;

  /* ───────── Piezas comunes ───────── */
  const mod = (el) => S.pila.find((m) => m.uid === +el.closest(".velo").dataset.uid);
  const pedidoDe = (m) => P.buscar(m.id);
  const tonoAviso = (t) => ({ atencion: "", error: "error", exito: "exito", info: "info" }[t]);
  const aviso = (tono, titulo, texto, acc = "", chico = false) =>
    `<div class="aviso ${tonoAviso(tono)} ${chico ? "chico" : ""}">${ic({ atencion: "alert", error: "alert", exito: "check-circle", info: "info" }[tono])}<div>${titulo ? `<b class="t">${titulo}</b>` : ""}${texto}</div>${acc ? `<span class="acc">${acc}</span>` : ""}</div>`;
  const titSec = (t, n) => `<h3 class="sec-t">${t}${n != null ? `<span class="globito">${n}</span>` : ""}</h3>`;
  const seg = (opts, val, a, extra = "") => `<div class="seg ${extra}" role="group">${opts.map(([k, t]) => `<button type="button" aria-pressed="${val === k}" data-a="${a}" data-p="${k}">${t}</button>`).join("")}</div>`;
  const boton = (t, a, p, peso, o = {}) => `<button type="button" class="btn ${peso} ${o.chico ? "btn-chico" : ""} ${o.cargando ? "cargando" : ""} ${o.cls || ""}" data-a="${a}" ${p != null ? `data-p="${p}"` : ""} ${o.dis ? "disabled" : ""} ${o.tit ? `title="${esc(o.tit)}"` : ""}>${o.cargando && o.txtCarga ? o.txtCarga : t}${o.flecha ? ic("arrow-r", "fl") : ""}</button>`;
  function respCombo(m) {
    const r = P.RESPONSABLES.find((x) => x.id === S.resp);
    return `<span class="resp"><button type="button" class="resp-b" data-a="respAbrir" aria-haspopup="listbox" aria-expanded="${!!m.respAbierto}" ${m.guardando ? "disabled" : ""}><small>Responsable</small>${avatar(r.nombre, 24)}${esc(r.nombre.split(" ")[0])}${ic("chev-d", "p")}</button>${
      m.respAbierto ? `<div class="resp-l" role="listbox">${P.RESPONSABLES.map((x) => `<button type="button" role="option" aria-selected="${x.id === S.resp}" data-a="respElegir" data-p="${x.id}">${avatar(x.nombre, 28)}<span>${esc(x.nombre)}<small>${esc(x.rol)}</small></span></button>`).join("")}</div>` : ""}</span>`;
  }
  function pie(m, { guia, ok, acciones, izq = "" }) {
    const fila = guia || ok ? `<div class="guia ${ok ? "ok" : ""}" role="status">${ok ? ic("check-circle") : ""}<span>${guia}</span><span style="margin-left:auto">${respCombo(m)}</span></div>` : "";
    return `<div class="hoja-pie">${fila}<div class="pie-acc">${izq ? `<span class="izq">${izq}</span>` : ""}${acciones}</div></div>`;
  }
  const faltan = (t, campo) => `Falta: <button type="button" data-a="irA" data-p="${campo}">${t}</button>`;
  const aviso_incierto = (m) =>
    aviso("atencion", "No sabemos si se guardó", "Se cortó la respuesta. No lo repitas: revisa primero.", `<button class="btn btn-secundario btn-chico ${m.revisando ? "cargando" : ""}" data-a="revisar">Revisar si se guardó</button>`);

  /* ───────── Abrir y cerrar ───────── */
  P.abrir = function (m) {
    m.uid = ++UID;
    if (m.tipo === "pedido") {
      const o = pedidoDe(m);
      m.modo = "revisar";
      m.dec = {};
      o.lineas.forEach((l) => { m.dec[l.id] = o.estado === "por_confirmar" ? decisionDeFabrica(l) : null; });
      m.codigo = ["", "", "", ""];
    }
    if (m.tipo === "pago") { m.monto = ""; m.medio = null; m.op = ""; m.err = null; }
    if (m.tipo === "mensaje") m.texto = S.mensaje;
    if (m.tipo === "avisos") m.fase = "apagado";
    if (m.tipo === "enviar") m.llega = "";
    S.pila.push(m);
    P.refrescarCapas();
    P.render(false);
  };
  P.cerrar = function () {
    const m = S.pila[S.pila.length - 1];
    if (!m || m.guardando || m.saliendo) return;
    m.saliendo = true;
    P.refrescarCapas();
    setTimeout(() => { S.pila = S.pila.filter((x) => x !== m); P.refrescarCapas(); P.render(false); }, 190);
  };
  P.cerrarMenus = function () { let c = false; S.pila.forEach((m) => { if (m.respAbierto) { m.respAbierto = false; c = true; } }); if (c) P.refrescarCapas(); };
  P.menuAbierto = () => S.pila.some((m) => m.respAbierto);

  function decisionDeFabrica(l) {
    if (libresAqui(l) > 0) return { tipo: "reservar", donde: "aqui", lugar: l.disp.alm > 0 ? "almacen" : "piso" };
    return null;
  }

  /* ───────── La hoja del pedido ───────── */
  function chipEstado(o) {
    if (o.estado === "por_confirmar") { const u = o.venceMin < 180; return chip("Por confirmar", u ? "rojo" : "ambar", { vivo: u }); }
    if (o.estado === "confirmado") return o.sinPagar ? chip("Sin pagar", "rojo") : chip("Por cobrar", "pizarra");
    if (o.estado === "pagado") return o.sinRecoger ? chip("Sin recoger", "rojo") : !o.listo ? chip("Espera una prenda", "pizarra") : chip("Por entregar", "verde");
    if (o.estado === "entregado") return chip("Entregado", "neutro");
    if (o.estado === "vencido") return chip("Cerrado sin confirmar", "apagado");
    return porDevolver(o) > 0 ? chip(`Por devolver ${soles(porDevolver(o))}`, "rojo") : chip("Anulado", "apagado");
  }
  function ruta(o) {
    const idx = { por_confirmar: 0, confirmado: 1, pagado: 2 }[o.estado];
    if (idx === undefined) {
      const mot = o.estado === "entregado" ? `Entregado ${o.hace}${o.entregadoPor ? ` por ${o.entregadoPor}` : ""}` : o.estado === "vencido" ? `Se cerró solo: nadie lo confirmó en ${P.PLAZOS.confirmar} h` : `Anulado · ${MOTIVO_TXT[o.cierre] || "se cerró"}`;
      return `<div class="cierre-franja" data-nuevo="Ruta del pedido">${ic(o.estado === "entregado" ? "check-circle" : "info", "g")}<span>${esc(mot)}</span></div>`;
    }
    const r = reloj(o);
    const t = (o.estado === "por_confirmar" || (o.estado === "confirmado" && pagado(o) === 0) || o.sinRecoger) && (r.tono === "rojo" || r.tono === "ambar") ? `<span class="tiempo ${r.tono}">${ic("clock")}${esc(r.texto)}</span>` : "";
    return `<div class="ruta" data-nuevo="Ruta del pedido">${["Confirmar", "Cobrar", "Entregar"].map((p, i) => `<span class="paso ${i < idx ? "hecho" : i === idx ? "ahora" : ""}"><i>${i < idx ? ic("check", "p") : i + 1}</i><span>${p}</span></span>${i < 2 ? `<span class="paso-lin ${i < idx ? "hecho" : ""}"></span>` : ""}`).join("")}${t}</div>`;
  }
  /** El único WhatsApp de la hoja: dice para qué es (la plantilla cambia con el estado del pedido). */
  function waDe(o, m) {
    if (o.estado === "por_confirmar") return ["libre", "Escribirle por WhatsApp"];
    if (o.estado === "confirmado") return m && m.recien === "confirmado" ? ["confirmado", "Avisarle que se confirmó"] : ["cobro", "Pedirle el pago por WhatsApp"];
    if (o.estado === "pagado") return o.sinRecoger ? ["norecoge", "Recordarle que lo recoja"] : o.listo ? ["listo", "Avisarle que ya puede recoger"] : ["libre", "Avisarle cuando llegue"];
    return porDevolver(o) > 0 ? ["devolucion", "Coordinar la devolución"] : ["libre", "Escribirle por WhatsApp"];
  }
  const clienteCard = (o, m) => { const [pl, t] = waDe(o, m); return `<div class="caja-c cliente"><div class="fila-c">${avatar(o.cliente.nombre, 40)}<div class="t"><b>${esc(o.cliente.nombre)}</b><small>${o.cliente.cel} · ${esc(o.cliente.correo)}</small></div></div>${waBtn(pl, t)}</div>`; };
  function dineroCard(o, conAnular) {
    const an = o.estado === "anulado", dev = porDevolver(o);
    const devuelto = an && dev === 0 ? o.pagos.filter((g) => g.estado === "anulado" && g.devuelto).reduce((a, g) => a + g.monto, 0) : 0;
    const f = falta(o);
    const c3 = an ? [devuelto > 0 ? "Devuelto" : "Por devolver", soles(devuelto > 0 ? devuelto : dev), dev > 0 ? "rojo" : "ok"] : ["Falta", soles(f), f > 0 ? "mal" : "ok"];
    const cup = o.cupon ? `<div class="cupon"><b class="tn">Cupón ${esc(o.cupon.codigo)} · − ${soles(o.cupon.descuento)}</b>${chip(o.cupon.estado === "liberado" ? "Liberado" : o.cupon.estado === "usado" ? "Usado" : "Reservado", o.cupon.estado === "liberado" ? "pizarra" : "verde")}<small>${o.cupon.estado === "reservado" ? "Reservado para este pedido. Se gasta al cobrar todo." : o.cupon.estado === "usado" ? "Ya se gastó: va en la boleta." : "Volvió al cliente."}</small></div>` : "";
    const pagos = o.pagos.length
      ? o.pagos.map((g) => {
          const tachado = g.estado === "anulado";
          const ch = tachado ? chip("Anulado", "apagado") : an && g.estado === "aprobado" ? chip("Por devolver", "rojo") : "";
          return `<div class="pago ${tachado ? "tachado" : ""}"><span class="t"><span class="tx">${textoPago(g)}</span> ${ch}<small>${esc(detallePago(g))}</small></span>${conAnular && sePuedeAnular(g, o) ? `<button class="btn btn-peligro btn-chico" data-a="anularPago" data-p="${g.id}">${an ? "Devolver" : "Anular pago"}</button>` : ""}</div>`;
        }).join("")
      : `<div class="pago" style="color:var(--taupe)">Todavía no registra pagos.</div>`;
    return `<div class="caja-c dinero" data-campo="dinero"><div class="cifras3"><div><small>Total</small><b>${soles(total(o))}</b></div><div><small>Pagado</small><b>${soles(pagado(o))}</b></div><div><small>${c3[0]}</small><b class="${c3[2]}">${c3[1]}</b></div></div>${cup}<div>${pagos}</div></div>`;
  }
  function boletaCard(o, acciones) {
    if (!o.boleta) return "";
    const E = { aceptado: ["Aceptada", "verde"], enviado: ["Enviando a SUNAT", "pizarra"], anulado: ["Anulada", "apagado"], no_emitido: ["Sin emitir", "apagado"] }[o.boleta.estado] || ["Enviada", "pizarra"];
    const nota = o.nota ? `<div class="l">Nota de crédito <b class="tn">${o.nota.texto}</b>${chip(o.nota.estado === "aceptado" ? "Aceptada" : "Enviando a SUNAT", o.nota.estado === "aceptado" ? "verde" : "pizarra")}<small class="taupe">Por ${soles(o.nota.total)}</small></div>` : "";
    return `<div class="caja-c boleta"><div class="l">${ic("receipt")}Boleta <b class="tn">${o.boleta.texto}</b>${chip(E[0], E[1])}</div><small class="taupe">${o.estado === "anulado" ? (o.nota ? "La anula su nota de crédito." : "") : "Salió al quedar pagado todo."}</small>${nota}${acciones || ""}</div>`;
  }
  const empresaChip = (l) => (S.sede === "lim" ? `<span style="display:block;margin-bottom:4px">${chip(l.empresa, l.empresa === "CLAURE" ? "pizarra" : "neutro", { nv: true, sp: true })}</span>` : "");

  function prendaPorConfirmar(m, o, l) {
    const d = m.dec[l.id], aqui = libresAqui(l) > 0, q = d && d.tipo === "quitar";
    const opts = [...l.disp.otras.map((x) => [`sede:${x.t}`, `Pedirla a ${x.t} (${x.n})`]), ["compra", "Comprarla"], ["taller", "Pedirla al taller"]];
    const sel = d && d.tipo === "reservar" && d.donde !== "aqui" ? `sede:${d.donde}` : d && d.tipo === "por_conseguir" ? d.via : "";
    const avisos = [];
    if (d && d.tipo === "reservar") {
      const libres = d.donde === "aqui" ? libresAqui(l) : (l.disp.otras.find((x) => x.t === d.donde) || { n: 0 }).n;
      if (libres === 1) avisos.push(d.donde === "aqui" ? `Es la última en ${T()}. Al confirmar, deja de venderse en tienda.` : `Es la última en ${d.donde}.`);
      if (l.compiten.length) avisos.push(`También la pidió ${l.compiten.map((c) => c.c + (c.antes ? " (la separó antes)" : "")).join(", ")}. Tú decides a quién.`);
    }
    const puedeQuitar = o.lineas.some((x) => x.id !== l.id && !(m.dec[x.id] && m.dec[x.id].tipo === "quitar"));
    const fechas = [["En 3 días", "5 nov"], ["En 1 semana", "8 nov"], ["En 2 semanas", "15 nov"]];
    let cuerpo = "";
    if (q) cuerpo = `<p style="font-size:13px;color:var(--taupe)">Se quita al confirmar y sale del total. Avísale por WhatsApp. <button class="enlace" data-a="deshacerQuitar" data-p="${l.id}">${ic("undo", "p")} Deshacer</button></p>`;
    else if (aqui) cuerpo = `<div class="donde"><span>${donde(d && d.lugar)}</span>${l.disp.alm > 0 && l.disp.piso > 0 && d && d.tipo === "reservar" ? `<button class="enlace" data-a="cambiarLugar" data-p="${l.id}">${d.lugar === "almacen" ? "Mejor la del piso" : "Mejor la del almacén"}</button>` : ""}</div>`;
    else cuerpo = `${seg(opts, sel, "decidir:" + l.id)}${d && d.tipo === "reservar" ? `<p class="pie-c">Se reserva allá y esa sede la envía en un traslado. Al llegar, queda reservada aquí.</p>` : ""}${d && d.tipo === "por_conseguir" ? `<p class="pie-c">${d.via === "taller" ? "Se avisa al taller para que la haga." : "Se compra a un proveedor."} La fecha la coordinas con el cliente.</p><div class="seg">${fechas.map(([t, f]) => `<button type="button" aria-pressed="${d.fecha === f}" data-a="fecha" data-p="${l.id}|${f}">${t}</button>`).join("")}</div>` : ""}`;
    return `<article class="prenda ${q ? "quitada" : aqui ? "" : "falta"}" data-campo="l-${l.id}"><div class="cab">${thumb(l, 48)}<div class="t">${empresaChip(l)}<span class="nom">${esc(nombreLinea(l))}</span><span class="det">${esc(disponible(l))}</span></div><b class="pr tn">${soles(l.precio)}</b></div>${cuerpo}${!q && avisos.length ? aviso("atencion", "", esc(avisos.join(" ")), "", true) : ""}${!q && puedeQuitar ? `<div style="display:flex;justify-content:flex-end"><button class="btn btn-peligro btn-chico" data-a="quitar" data-p="${l.id}">Quitar del pedido</button></div>` : ""}</article>`;
  }
  const prendasLista = (o, m) => {
    const hayOtra = [...new Set(o.lineas.filter((l) => l.estado === "reservada" && l.otra).map((l) => l.otra))];
    return `<div class="prendas">${titSec("Sus prendas", vivas(o).length)}<div class="prendas">${o.lineas.map((l) => {
      const e = estadoLinea(l);
      return `<article class="prenda ${l.estado === "quitada" ? "quitada" : ""}"><div class="cab">${thumb(l, 48)}<div class="t">${empresaChip(l)}<span class="nom">${esc(nombreLinea(l))}</span><span class="estado-l">${chip(e[0], e[1])}${e[2] ? `<span>${esc(e[2])}</span>` : ""}</span>${m && o.estado !== "entregado" && sePuedeReservarYa(l) ? `<span class="estado-l" style="margin-top:8px"><span style="color:var(--verde)">Ya hay ${libresAqui(l)} en ${T()}.</span><button class="btn btn-secundario btn-chico" data-a="reservar" data-p="${l.id}">Reservarla</button></span>` : ""}</div><b class="pr tn">${soles(l.precio)}</b></article>`;
    }).join("")}</div>${hayOtra.map((t) => `<p class="pie-c">${ic("truck", "p")} ${t} la tiene reservada y la envía en un traslado.</p>`).join("")}</div>`;
  };

  function vistaPedido(m) {
    const o = pedidoDe(m);
    const cab = (t, s) => ({ cab: { t, s } });
    /* — modos secundarios dentro de la hoja — */
    if (m.modo === "no_confirmar") return noConfirmar(m, o);
    if (m.modo === "anular") return anularConfirmado(m, o);
    if (m.modo === "reservar") return reservarLinea(m, o);

    const titulo = `Pedido ${o.id} ${chipEstado(o)}`;
    const sub = `${o.creado} · lo recoge en ${T()}`;
    let izq = "", der = "", piePie = "";

    if (o.estado === "por_confirmar") {
      const pend = o.lineas.filter((l) => !m.dec[l.id] || (m.dec[l.id].tipo === "por_conseguir" && !m.dec[l.id].fecha));
      const p0 = pend[0];
      const ok = pend.length === 0;
      izq = `${titSec("Lo que pidió", o.lineas.length)}<div class="prendas">${o.lineas.map((l) => prendaPorConfirmar(m, o, l)).join("")}</div>`;
      der = `${clienteCard(o, m)}<div class="nota">${ic("wa")}<span>El cliente te escribirá por WhatsApp con el número <b>${o.id}</b>.</span></div><p class="pie-c">Al confirmar, las prendas quedan reservadas y dejan de venderse en tienda. Salen del stock al entregarlas.</p>`;
      piePie = pie(m, {
        ok, guia: ok ? "Todo listo." : faltan(m.dec[p0.id] ? `elegir la fecha de ${esc(p0.ref)}` : `elegir qué hacer con ${esc(p0.ref)}`, "l-" + p0.id),
        izq: boton("No se puede confirmar", "modo", "no_confirmar", "btn-secundario", { dis: m.guardando }),
        acciones: boton("Confirmar y reservar", "confirmar", null, "btn-primario", { dis: !ok || m.guardando, cargando: m.guardando, txtCarga: "Confirmando…", tit: ok ? "" : "Falta decidir qué hacer con una prenda" }),
      });
    } else if (o.estado === "confirmado") {
      const a = [];
      if (o.sinPagar) a.push(aviso("error", `Lo confirmaron ${o.confirmadoHace} y no termina de pagar`, "Sus prendas siguen reservadas. Pídele el pago o decide si lo anulas."));
      if (m.recien === "confirmado") a.push(aviso("exito", "Confirmado", "Sus prendas quedaron reservadas. Avísale por WhatsApp para coordinar el pago."));
      const porConseguir = o.lineas.find((l) => l.estado === "por_conseguir" && !l.traslado);
      const adel = porConseguir && !o.lineas.some((l) => sePuedeReservarYa(l)) && o.pagos.length === 0 ? false : false;
      izq = `${a.join("")}${prendasLista(o, true)}${porConseguir && !sePuedeReservarYa(porConseguir) ? aviso("info", "Espera una prenda por conseguir", `Llega el ${porConseguir.fecha}. Cobra un adelanto ahora y el resto al recoger.`) : ""}`;
      der = `${clienteCard(o, m)}${dineroCard(o, true)}<p class="pie-c">La boleta sale cuando queda todo pagado.</p>`;
      piePie = pie(m, {
        ok: false, guia: "",
        izq: boton("Anular", "modo", "anular", "btn-peligro"),
        acciones: `${boton(`Registrar pago<span class="solo-ancho"> · falta ${soles(falta(o))}</span>`, "pagar", null, "btn-primario")}`,
      });
    } else if (o.estado === "pagado") {
      const a = [];
      if (o.sinRecoger) a.push(aviso("error", `Pagó ${o.pagadoHace} y no lo recoge`, "Ya pagó: no se libera solo. Recuérdale que lo recoja. Si no lo hará, decídelo con tu líder."));
      const falt = o.lineas.filter((l) => l.estado !== "reservada" && l.estado !== "quitada").map((l) => l.ref + " " + l.talla);
      const llena = m.codigo.every((c) => c !== "");
      const bien = llena; // con las 4 cifras se puede intentar: la base decide si es el código
      let entrega;
      if (falt.length) entrega = aviso("info", "Todavía no se puede entregar", `Falta que llegue a ${T()}: ${esc(falt.join(", "))}. Avísale al cliente cuando esté.`);
      else entrega = `<div class="caja-c" data-nuevo="Pasos de la entrega"><span class="sec-t" style="margin-bottom:8px">Para entregarlo</span><ol class="pasos"><li>${o.sinRecoger ? "Recuérdale que lo recoja" : "Avísale que ya puede recoger"} con el botón de WhatsApp.</li><li><b>Dile que su código está en «Mis pedidos»</b>, en su cuenta de la tienda web.</li><li>Cuando venga, escribe aquí el código que te muestre.</li></ol></div>
        <div class="campo" data-campo="codigo" data-nuevo="Código en 4 casillas"><span class="lbl">Código para recoger</span><div class="codigo ${m.rechazo ? "error" : ""}" role="group" aria-label="Código de 4 cifras">${[0, 1, 2, 3].map((i) => `<input inputmode="numeric" maxlength="1" autocomplete="off" data-i="cod" data-n="${i}" data-f="cod${i}" value="${m.codigo[i]}" aria-label="Cifra ${i + 1}" ${m.entregando || m.incierto ? "disabled" : ""}>`).join("")}</div><span class="pie-c ${m.rechazo ? "error" : ""}">${m.rechazo || "Lo ve en «Mis pedidos» de su cuenta en la web."}</span></div>
        <div class="solo-maqueta"><b>Solo maqueta</b> El código de prueba es ${P.CODIGO_ENTREGA}. <button type="button" data-a="rellenarCodigo">Rellenar</button></div>`;
      izq = `${a.join("")}${prendasLista(o, true)}${entrega}${m.incierto ? aviso_incierto(m) : ""}`;
      der = `${clienteCard(o, m)}${dineroCard(o, false)}${boletaCard(o, o.boleta && o.boleta.estado !== "anulado" ? `<div><button class="btn btn-secundario btn-chico" data-a="ticket">${ic("printer")}Imprimir ticket</button></div>` : "")}`;
      piePie = pie(m, {
        ok: !falt.length && bien && !m.rechazo, guia: falt.length ? "Se entrega cuando todo esté aquí." : bien && !m.rechazo ? "Todo listo." : faltan(m.rechazo ? "corregir el código" : "escribir el código de 4 cifras", "codigo"),
        izq: boton("Anular pedido", "anularPagado", null, "btn-peligro", { dis: m.entregando }),
        acciones: falt.length ? "" : `${boton(m.incierto ? "Volver a intentar" : "Entregar", "entregar", null, "btn-primario", { dis: !bien || m.entregando, cargando: m.entregando, txtCarga: "Entregando…" })}`,
      });
    } else {
      /* Cerrados: solo se leen (con «Devolver» si queda plata). */
      const dev = porDevolver(o);
      const a = dev > 0 ? aviso("atencion", `Falta devolverle ${soles(dev)}`, "El pedido está anulado y ya había pagado. Coordina cómo se lo devuelves y regístralo con «Devolver».") : "";
      const boleta = boletaCard(o, o.estado === "entregado" && o.boleta ? `<div><button class="btn btn-secundario btn-chico" data-a="ticket">${ic("printer")}Imprimir ticket</button></div>` : "");
      izq = `${a}${prendasLista(o, false)}`;
      der = `${clienteCard(o, m)}${o.estado !== "vencido" && (o.pagos.length || o.estado === "anulado") ? dineroCard(o, true) : ""}${boleta}<p class="pie-c">${o.estado === "entregado" ? "Sus prendas salieron del stock." : o.estado === "vencido" ? "Nada se había reservado." : "Sus prendas volvieron a estar libres."}</p>`;
    }
    return { tam: "ancha", titulo, sub, pre: ruta(o), cuerpo: `<div class="dos"><div class="col">${izq}</div><div class="col lado">${der}</div></div>`, pie: piePie };
  }

  /* — No se puede confirmar — */
  function noConfirmar(m, o) {
    const ok = !!m.motivo;
    return {
      tam: "mediana", titulo: `Cerrar el pedido ${o.id}`, sub: "Nada se había reservado: el stock no cambia.", volver: "revisar",
      cuerpo: `${aviso("atencion", "Antes de cerrarlo, escríbele", "A veces se resuelve con otra talla, otro color o pidiéndola a otra sede.", waBtnChico("sinstock", "Escribirle"))}
        <div class="campo" data-campo="motivo"><span class="lbl">¿Por qué no se confirma?</span>${seg(MOTIVOS.noConfirmar, m.motivo, "motivo", "grande")}</div>
        <p class="pie-c">El cliente verá su pedido «Anulado» con este motivo.</p>`,
      pie: pie(m, { ok, guia: ok ? "Todo listo." : faltan("elegir el motivo", "motivo"), acciones: `${boton("Cancelar", "modo", "revisar", "btn-secundario", { dis: m.guardando })}${boton("Cerrar el pedido", "cerrarPedido", null, "btn-peligro", { dis: !ok || m.guardando, cargando: m.guardando, txtCarga: "Cerrando…" })}` }),
    };
  }
  /* — Anular (confirmado) — */
  function anularConfirmado(m, o) {
    const ok = !!m.motivo, pg = pagado(o);
    const llegan = o.lineas.some((l) => l.estado === "por_conseguir" && l.traslado);
    return {
      tam: "mediana", titulo: `Anular el pedido ${o.id}`, sub: `${o.cliente.nombre}`, volver: "revisar",
      cuerpo: `${aviso("error", "Las prendas vuelven a estar libres", `${o.lineas.some((l) => l.otra) ? "También en la otra sede. " : ""}${llegan ? `Lo que viene en camino entra libre a ${T()}. ` : ""}${pg > 0 ? `Ya pagó ${soles(pg)}: después coordinas la devolución.` : ""}`)}
        <div class="campo" data-campo="motivo"><span class="lbl">¿Por qué se anula?</span>${seg(MOTIVOS.anular, m.motivo, "motivo", "grande")}</div>`,
      pie: pie(m, { ok, guia: ok ? "Todo listo." : faltan("elegir el motivo", "motivo"), acciones: `${boton("Cancelar", "modo", "revisar", "btn-secundario", { dis: m.guardando })}${boton("Anular el pedido", "anular", null, "btn-peligro", { dis: !ok || m.guardando, cargando: m.guardando, txtCarga: "Anulando…" })}` }),
    };
  }
  /* — Reservar una prenda que ya llegó — */
  function reservarLinea(m, o) {
    const l = o.lineas.find((x) => x.id === m.reservando.id), lugar = m.reservando.lugar;
    return {
      tam: "angosta", titulo: "Reservar la prenda", sub: `Pedido ${o.id} · ${o.cliente.nombre}`, volver: "revisar",
      cuerpo: `<article class="prenda"><div class="cab">${thumb(l, 56)}<div class="t"><span class="nom">${esc(nombreLinea(l))}</span><span class="det">${esc(disponible(l))}</span><span class="donde" style="margin-top:6px"><span>${donde(lugar)}</span>${l.disp.alm > 0 && l.disp.piso > 0 ? `<button class="enlace" data-a="lugarReserva">${lugar === "almacen" ? "Mejor la del piso" : "Mejor la del almacén"}</button>` : ""}</span></div></div></article>
        <p class="pie-c">Llegó lo que faltaba: queda separada para el cliente y deja de venderse en tienda. Sale del stock al entregarla.</p>`,
      pie: pie(m, { ok: true, guia: "Todo listo.", acciones: `${boton("Cancelar", "modo", "revisar", "btn-secundario", { dis: m.guardando })}${boton("Reservar ahora", "reservarAhora", null, "btn-primario", { dis: m.guardando, cargando: m.guardando, txtCarga: "Reservando…" })}` }),
    };
  }

  /* ───────── Registrar pago ───────── */
  const parseMonto = (t) => { const n = Number(String(t).replace(/[^\d.,]/g, "").replace(",", ".")); return Number.isFinite(n) && n > 0 && /^\d+([.,]\d{1,2})?$/.test(String(t).trim().replace(/^S\/\s?/, "")) ? n : null; };
  function vistaPago(m) {
    const o = pedidoDe(m), f = falta(o);
    const monto = m.monto.trim() === "" ? null : parseMonto(m.monto);
    const probMonto = m.monto.trim() === "" ? null : monto === null ? "Escribe un monto válido: más de S/ 0 y hasta dos decimales." : monto > f + 0.001 ? `Es más de lo que falta (${soles(f)}).` : null;
    const digital = m.medio && m.medio !== "efectivo";
    const probOp = digital && m.op !== "" && !/^\d{6,12}$/.test(m.op) ? "Son de 6 a 12 dígitos." : null;
    const completa = monto !== null && !probMonto && Math.abs(monto - f) < 0.005;
    const probCaja = (m.medio === "efectivo" || (completa && m.medio)) && !S.caja ? (m.medio === "efectivo" ? `No hay una caja abierta en ${T()}: ábrela o elige otro medio.` : "Este pago completa el pedido y su boleta va en la caja del día. Abre la caja.") : null;
    const faltaX = monto === null || probMonto ? ["escribir el monto", "monto"] : !m.medio ? ["elegir cómo pagó", "medio"] : digital && !/^\d{6,12}$/.test(m.op) ? ["escribir el n.º de operación", "op"] : probCaja ? ["abrir la caja", "medio"] : null;
    const ok = !faltaX;
    const despues = ok ? (completa ? "Con este pago queda pagado y sale la boleta." : `Quedarán ${soles(Math.round((f - monto) * 100) / 100)} por cobrar.`) : "";
    return {
      tam: "angosta", titulo: "Registrar un pago", sub: `Pedido ${o.id} · ${o.cliente.nombre}`,
      cuerpo: `<div class="caja-c"><div class="cifras3"><div><small>Total</small><b>${soles(total(o))}</b></div><div><small>Pagado</small><b>${soles(pagado(o))}</b></div><div><small>Falta</small><b class="mal">${soles(f)}</b></div></div></div>
        <div class="campo" data-campo="monto"><label for="f-monto">Monto</label><div class="caja grande ${probMonto ? "error" : ""}"><span class="pre">S/</span><input id="f-monto" data-i="monto" data-f="monto" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(m.monto)}" ${m.guardando || m.incierto ? "disabled" : ""}></div>${probMonto ? `<span class="pie-c error">${probMonto}</span>` : ""}${m.monto.trim() !== f.toFixed(2) ? `<div><button type="button" class="pildora" data-a="todoFalta">Todo lo que falta · ${soles(f)}</button></div>` : ""}</div>
        <div class="campo" data-campo="medio"><span class="lbl">¿Cómo pagó?</span><div class="medios" role="group">${Object.keys(NOMBRE_MEDIO).map((k) => `<button type="button" class="medio" style="--mc:${COLOR_MEDIO[k]}" aria-pressed="${m.medio === k}" data-a="medio" data-p="${k}" ${m.guardando || m.incierto ? "disabled" : ""}><i></i>${NOMBRE_MEDIO[k]}</button>`).join("")}</div>
          ${probCaja ? aviso("atencion", "", probCaja, `<button class="btn btn-secundario btn-chico" data-a="irCaja">Ir a Caja</button>`, true) : m.medio === "efectivo" ? `<span class="pie-c">Entra a la caja abierta de ${T()}.</span>` : ""}</div>
        ${digital ? `<div class="campo" data-campo="op"><label for="f-op">N.º de operación</label><div class="caja ${probOp ? "error" : ""}"><input id="f-op" data-i="op" data-f="op" inputmode="numeric" autocomplete="off" placeholder="De 6 a 12 dígitos" value="${esc(m.op)}" ${m.guardando || m.incierto ? "disabled" : ""}></div><span class="pie-c ${probOp ? "error" : ""}">${probOp || "Cópialo de tu app o del banco. Una foto se puede editar."}</span></div>` : ""}
        ${m.incierto ? aviso_incierto(m) : ""}`,
      pie: pie(m, { ok, guia: ok ? despues : faltan(faltaX[0], faltaX[1]), acciones: `${boton("Cancelar", "cerrar", null, "btn-secundario", { dis: m.guardando || m.incierto })}${boton(m.incierto ? "Volver a intentar" : monto && ok ? `Registrar ${soles(monto)}` : "Registrar el pago", "registrarPago", null, "btn-primario", { dis: !ok || m.guardando, cargando: m.guardando, txtCarga: "Registrando…" })}` }),
    };
  }

  /* ───────── Anular o devolver un pago ───────── */
  function vistaAnularPago(m) {
    const o = pedidoDe(m), g = o.pagos.find((x) => x.id === m.pagoId), dev = o.estado === "anulado", ef = g.medio === "efectivo";
    const sinCaja = ef && !S.caja;
    const ok = !!m.motivo && !sinCaja;
    const efecto = ef ? `Salen ${soles(g.monto)} de la caja abierta de ${T()}, la de hoy. Si no hay ese efectivo, no se puede.` : m.motivo === "error_al_anotar" ? "No mueve la caja: solo deja de contar como pagado." : `No mueve la caja: devuélveselo por ${g.medio === "transferencia" ? "transferencia" : NOMBRE_MEDIO[g.medio] + " o transferencia"} y avísale por WhatsApp.`;
    return {
      tam: "angosta", titulo: dev ? "Devolver un pago" : "Anular un pago", sub: `Pedido ${o.id} · ${o.cliente.nombre}`,
      cuerpo: `<div class="caja-c"><div class="pago" style="border:0;padding:0"><span class="t"><span class="tx">${textoPago(g)}</span><small>${esc(detallePago(g))}</small></span></div></div>
        ${sinCaja ? aviso("atencion", "", `No hay una caja abierta en ${T()}: ábrela para sacar el efectivo.`, `<button class="btn btn-secundario btn-chico" data-a="irCaja">Ir a Caja</button>`) : aviso(ef ? "atencion" : "info", "", efecto)}
        <div class="campo" data-campo="motivo"><span class="lbl">¿Por qué se anula?</span>${seg(MOTIVOS.anularPago, m.motivo, "motivo", "grande")}</div>`,
      pie: pie(m, { ok, guia: ok ? "Todo listo." : faltan(sinCaja ? "abrir la caja" : "elegir el motivo", sinCaja ? "motivo" : "motivo"), acciones: `${boton("Cancelar", "cerrar", null, "btn-secundario", { dis: m.guardando })}${boton(dev ? `Devolver ${soles(g.monto)}` : "Anular el pago", "confirmarAnularPago", null, "btn-peligro", { dis: !ok || m.guardando, cargando: m.guardando, txtCarga: "Anulando…" })}` }),
    };
  }

  /* ───────── Anular un pedido pagado ───────── */
  function vistaAnularPagado(m) {
    const o = pedidoDe(m), pagos = o.pagos.filter((g) => g.estado === "aprobado"), tot = pagos.reduce((a, g) => a + g.monto, 0);
    const ef = pagos.filter((g) => g.medio === "efectivo").reduce((a, g) => a + g.monto, 0);
    const espera = o.boleta && o.boleta.estado === "enviado";
    const sinCaja = ef > 0 && !S.caja;
    const ok = !!m.motivo && !espera && !sinCaja;
    const queDeLaPrenda = (l) => (l.estado === "reservada" ? (l.otra ? `Vuelve a estar libre en ${l.otra}.` : `Vuelve a estar libre en el ${l.lugar === "piso" ? "piso" : "almacén"}.`) : l.estado === "por_conseguir" ? (l.traslado ? `Viene en camino: al llegar, entra libre a ${T()}.` : "Ya no se consigue para este pedido.") : null);
    const prendas = o.lineas.filter((l) => queDeLaPrenda(l));
    const dev = (g) => (g.medio === "efectivo" ? `Sale de la caja abierta de hoy: entrégaselo en la mano.` : `Devuélveselo por ${g.medio === "transferencia" ? "transferencia" : NOMBRE_MEDIO[g.medio]}.`);
    const camino = espera ? ["Se está enviando", "Todavía no sabemos si SUNAT la acepta. Espera unos minutos."] : o.boleta ? ["Sale su nota de crédito", "SUNAT ya la aceptó: se emite una nota de crédito por " + soles(tot) + "."] : ["Sin boleta", "Se anula por el camino de siempre."];
    return {
      tam: "mediana", titulo: "Anular el pedido", sub: `Pedido ${o.id} · ${o.cliente.nombre}`,
      cuerpo: `${aviso("atencion", "Se deshace todo de una vez", "Las prendas quedan libres, se devuelve lo que pagó y la boleta se anula. Avísale antes.")}
        <div>${titSec("Sus prendas", prendas.length)}<div class="prendas" style="margin-top:10px">${prendas.map((l) => `<article class="prenda"><div class="cab">${thumb(l, 40)}<div class="t"><span class="nom">${esc(nombreLinea(l))}</span><span class="det">${queDeLaPrenda(l)}</span></div></div></article>`).join("")}</div></div>
        <div data-campo="plata">${titSec("Su plata")}<div class="caja-c" style="margin-top:10px">${pagos.map((g) => `<div class="pago" style="padding-top:0"><span class="t"><span class="tx">${textoPago(g)}</span><small>${dev(g)}</small></span></div>`).join("")}<div style="display:flex;justify-content:space-between;border-top:1px solid var(--sand);padding-top:10px;font-weight:600"><span>Se le devuelven</span><span class="tn">${soles(tot)}</span></div></div>
          ${sinCaja ? `<div style="margin-top:8px">${aviso("atencion", "", `Hay que devolver ${soles(ef)} en efectivo y no hay una caja abierta en ${T()}.`, `<button class="btn btn-secundario btn-chico" data-a="irCaja">Ir a Caja</button>`, true)}</div>` : ef > 0 ? `<p class="pie-c" style="margin-top:8px">${soles(ef)} salen de la caja abierta de hoy. Si no hay ese efectivo, no se anula nada.</p>` : ""}</div>
        <div data-campo="boleta">${titSec("Su boleta")}<div class="caja-c boleta" style="margin-top:10px">${o.boleta ? `<div class="l">${ic("receipt")}Boleta <b class="tn">${o.boleta.texto}</b>${chip(espera ? "Enviando a SUNAT" : "Aceptada", espera ? "pizarra" : "verde")}</div>` : ""}${espera ? aviso("atencion", camino[0], camino[1], `<button class="btn btn-secundario btn-chico" data-a="revisarBoleta">Revisar de nuevo</button>`, true) : `<p class="pie-c"><b style="color:var(--tinta)">${camino[0]}.</b> ${camino[1]}</p>`}</div></div>
        <div class="campo" data-campo="motivo"><span class="lbl">¿Por qué se anula?</span>${seg(MOTIVOS.anularPagado, m.motivo, "motivo", "grande")}</div>
        ${m.incierto ? aviso_incierto(m) : ""}`,
      pie: pie(m, { ok, guia: ok ? `Todo listo: se le devuelven ${soles(tot)} y se anula su boleta.` : faltan(espera ? "esperar la boleta" : sinCaja ? "abrir la caja" : "elegir el motivo", espera ? "boleta" : sinCaja ? "plata" : "motivo"), acciones: `${boton("Cancelar", "cerrar", null, "btn-secundario", { dis: m.guardando || m.incierto })}${boton(m.incierto ? "Volver a intentar" : `Anular y devolver<span class="solo-ancho"> ${soles(tot)}</span>`, "confirmarAnularPagado", null, "btn-peligro", { dis: !ok || m.guardando, cargando: m.guardando, txtCarga: "Anulando…" })}` }),
    };
  }

  /* ───────── Enviar a otra sede ───────── */
  function vistaEnviar(m) {
    const e = S.d.enviar.find((x) => x.id === m.id);
    if (!e) return { tam: "angosta", titulo: "Enviar", cuerpo: "", pie: "" };
    const hoy = "2026-10-31";
    const ok = m.llega && m.llega >= hoy;
    const colg = e.lineas.filter((l) => l.lugar === "piso").length;
    return {
      tam: "angosta", titulo: `Enviar a ${e.tiendaPedido}`, sub: `Pedido web ${e.id} · sale de ${T()}`,
      cuerpo: `<div class="prendas">${e.lineas.map((l) => `<article class="prenda"><div class="cab">${thumb(l, 44)}<div class="t"><span class="nom">${esc(nombreLinea(l))}</span><span class="det">${l.lugar === "piso" ? "Está en el piso: descuélgala para empacarla" : "Está en el almacén"}</span></div></div></article>`).join("")}</div>
        <div class="campo" data-campo="llega"><label for="f-llega">¿Cuándo llega?</label><div class="caja"><input id="f-llega" type="date" min="${hoy}" data-i="llega" data-f="llega" value="${m.llega}"></div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="pildora" data-a="llegada" data-p="2026-11-01" aria-pressed="${m.llega === "2026-11-01"}">Mañana</button><button class="pildora" data-a="llegada" data-p="2026-11-03" aria-pressed="${m.llega === "2026-11-03"}">En 3 días</button></div></div>
        <div class="nota">${ic("truck")}<span>Sale como un traslado más${colg ? " (lo colgado pasa antes al almacén)" : ""}. Al llegar, queda reservado para el pedido.</span></div>`,
      pie: pie(m, { ok, guia: ok ? "Todo listo." : faltan("elegir cuándo llega", "llega"), acciones: `${boton("Cancelar", "cerrar", null, "btn-secundario", { dis: m.guardando })}${boton("Enviar por traslado", "confirmarEnviar", null, "btn-primario", { dis: !ok || m.guardando, cargando: m.guardando, txtCarga: "Enviando…" })}` }),
    };
  }

  /* ───────── Mensaje predeterminado ───────── */
  const MAX_MSG = 600;
  function vistaMensaje(m) {
    const n = m.texto.trim().length, demasiado = n > MAX_MSG;
    const vista = m.texto.trim().replace(/\{nombre\}/g, "Valeria").replace(/\{tienda\}/g, `CAYLA ${T().replace("Tienda ", "")}`).replace(/\{codigo\}/g, "W-0031");
    const hora = "12:55";
    return {
      tam: "mediana", titulo: "Mensaje predeterminado", sub: `Tuyo · ${T()}`, conCerrar: false,
      cuerpo: `<p style="font-size:13.5px;color:var(--taupe)">Es el texto que se abre en WhatsApp con «Mensaje» en cada pedido.</p>
        <div class="campo"><label for="f-msg">Mensaje</label><div class="caja ${demasiado ? "error" : ""}" style="align-items:stretch"><textarea id="f-msg" rows="4" lang="es" spellcheck="true" data-i="msg" data-f="msg">${esc(m.texto)}</textarea></div>
          <div class="insertar" data-nuevo="Botones para insertar"><small>Tocar para insertar:</small>${[["{nombre}", "Nombre"], ["{tienda}", "Tienda"], ["{codigo}", "Código"]].map(([k, t]) => `<button type="button" class="pildora" data-a="insertar" data-p="${k}">${ic("plus", "p")}&nbsp;${t}</button>`).join("")}</div>
          <div class="insertar" data-nuevo="Emojis"><small>Emojis:</small>${["👋", "😊", "🛍️", "💛", "🎉", "🙏", "✨", "👗"].map((e) => `<button type="button" class="pildora emoji" data-a="insertar" data-p="${e}" aria-label="Insertar ${e}">${e}</button>`).join("")}</div>
          <span class="pie-c ${demasiado ? "error" : ""}">${demasiado ? `Pasaste ${n - MAX_MSG} letras: el máximo es ${MAX_MSG}.` : `${n} de ${MAX_MSG} letras. Vacío = el de fábrica.`}</span></div>
        <div><span class="pie-c" style="display:block;margin-bottom:8px">Así lo verá el cliente en WhatsApp</span><div class="wa"><div class="wa-cab">${avatar("Valeria Quispe", 30)}<span>Valeria Quispe Mendoza</span></div><div class="wa-fondo"><div class="wa-burbuja"><p>${esc((vista || P.FABRICA).replace(/\{nombre\}/g, "Valeria").replace(/\{tienda\}/g, "CAYLA " + T().replace("Tienda ", "")).replace(/\{codigo\}/g, "W-0031")).replace(/W-/g, "W\u2011")}</p><small><span class="tn">${hora}</span>${ic("check", "p")}${ic("check", "p")}</small></div></div></div></div>`,
      pie: `<div class="hoja-pie"><div class="pie-acc"><span class="izq">${boton("Usar el de fábrica", "fabrica", null, "btn-sutil")}</span>${boton("Cancelar", "cerrar", null, "btn-secundario")}${boton("Guardar", "guardarMensaje", null, "btn-primario", { dis: demasiado })}</div></div>`,
    };
  }

  /* ───────── Avisos en el celular ───────── */
  function vistaAvisos(m) {
    const f = m.fase, activo = f === "activo" || f === "android";
    const FASES = [["apagado", "Apagado"], ["activo", "Activo"], ["otra", "Activo en otra tienda"], ["iphone", "iPhone sin instalar"], ["bloqueado", "Bloqueado"], ["android", "Android"], ["sinsoporte", "Sin soporte"]];
    const guarda = f === "apagado" || f === "otra";
    let estado = "";
    if (activo) estado = `<p style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${chip("Activo", "verde")}<span style="font-size:13.5px">Este celular suena con cada pedido de ${T()}.</span></p>`;
    if (f === "otra") estado = aviso("info", "Este celular suena para Tienda AQP", `Si lo cambias, sonará con los pedidos de ${T()}.`);
    if (f === "apagado") estado = `<p style="font-size:13.5px">Este celular todavía no suena. Actívalo y elige «Permitir» cuando el teléfono pregunte.</p>`;
    if (f === "iphone") estado = aviso("atencion", "Primero agrega el ERP a la pantalla de inicio", `<ol class="pasos"><li>Abre el ERP en Safari.</li><li>Toca Compartir (el cuadrado con la flecha).</li><li>Elige «Agregar a pantalla de inicio».</li><li>Abre «CAYLA ERP» desde su ícono y vuelve aquí.</li></ol>`);
    if (f === "sinsoporte") estado = aviso("atencion", "Este navegador no recibe avisos", "En Android, abre el ERP en Chrome. En iPhone, agrégalo a la pantalla de inicio desde Safari.");
    if (f === "bloqueado") estado = aviso("atencion", "Las notificaciones están bloqueadas", "Ve a Ajustes ▸ Notificaciones ▸ CAYLA ERP y permítelas. Después vuelve aquí.");
    const sonido = f === "android" ? `<div style="border-top:1px solid var(--sand);padding-top:14px;display:grid;gap:8px"><b style="font-size:13.5px">El sonido «Campanita»</b><ol class="pasos"><li>Descarga el sonido.</li><li>Ve a Ajustes ▸ Apps ▸ CAYLA ERP ▸ Notificaciones.</li><li>Toca «Sonido» y elige «campanita-cayla».</li></ol><div><button class="btn btn-secundario btn-chico" data-a="falso">Descargar el sonido</button></div></div>` : "";
    const acciones = guarda ? `<div class="pie-acc">${f === "otra" ? `<span class="izq">${boton("Apagar", "apagarAvisos", null, "btn-peligro")}</span>` : ""}${boton("Cancelar", "cerrar", null, "btn-secundario")}${boton(f === "otra" ? `Cambiar a ${T()}` : "Activar en este celular", "activarAvisos", null, "btn-primario")}</div>` : activo ? `<div class="pie-acc"><span class="izq">${boton("Apagar", "apagarAvisos", null, "btn-peligro")}</span>${boton("Probar el aviso", "probarAviso", null, "btn-secundario")}</div>` : "";
    return {
      tam: "angosta", titulo: "Avisos de pedidos", sub: `En este celular · ${T()}`, conCerrar: !guarda,
      cuerpo: `<p style="font-size:13.5px;color:var(--taupe)">Cuando un cliente separa en la web, este celular suena y muestra el pedido.</p>
        <div class="notif ${m.suena ? "suena" : ""}" aria-hidden="true"><span class="ic">${ic("bell", "g")}</span><span><b>Pedido W-0032 · ${esc(T())}</b><span>1 prenda · S/ 109.00</span></span></div>
        ${estado}${sonido}
        <div class="solo-maqueta"><b>Solo maqueta</b>${FASES.map(([k, t]) => `<button type="button" aria-pressed="${f === k}" data-a="faseAvisos" data-p="${k}">${t}</button>`).join("")}</div>`,
      pie: acciones ? `<div class="hoja-pie">${acciones}</div>` : "",
    };
  }

  /* ───────── Ticket ───────── */
  function vistaTicket(m) {
    const o = pedidoDe(m);
    const lineas = vivas(o);
    const bruto = lineas.reduce((a, l) => a + l.precio, 0);
    return {
      tam: "angosta", titulo: `Boleta ${o.boleta.texto}`, sub: `Pedido ${o.id} · ${o.cliente.nombre}`, conCerrar: true,
      cuerpo: `<div class="papel-fijo"><div class="ticket"><h4>CAYLA ${esc(T().replace("Tienda ", ""))}</h4><div class="c">Boleta de venta electrónica<br>${o.boleta.texto}</div><hr>${lineas.map((l) => `<div class="l"><span>1 × ${esc(l.ref)} ${esc(l.talla)}</span><span>${l.precio.toFixed(2)}</span></div>`).join("")}${o.cupon ? `<div class="l"><span>Cupón</span><span>−${o.cupon.descuento.toFixed(2)}</span></div>` : ""}<hr><div class="l"><b>TOTAL</b><b>${soles(total(o))}</b></div><div class="c">Pagado: ${o.pagos.map((g) => NOMBRE_MEDIO[g.medio]).filter((x, i, a) => a.indexOf(x) === i).join(" + ")}</div><hr><div class="c">Gracias por tu compra</div></div></div>
        <p class="pie-c">Sirve para imprimir en ticket o A4, y para guardar como PDF.</p>`,
      pie: `<div class="hoja-pie"><div class="pie-acc">${boton("Imprimir A4", "falso", null, "btn-secundario")}${boton(`${ic("printer")}Imprimir ticket`, "falso", null, "btn-primario")}</div></div>`,
    };
  }

  /* ───────── Qué cambia ───────── */
  function vistaCambia() {
    const li = (t, ico = "check") => `<li>${ic(ico)}<span>${t}</span></li>`;
    return {
      tam: "mediana", titulo: "Qué cambia", sub: "Rediseño visual de Tienda web ▸ Pedidos", conCerrar: true,
      cuerpo: `${titSec("Lo nuevo")}<ul class="cambia">${[
        "El camino siempre está a la vista, con los plazos entre pasos.",
        "La lista va en grupos: Urgente, Pide tu atención, En plazo y Esperan una prenda.",
        "Cada fila lleva una franja de color y su plazo con barra. Sin encabezados de columnas.",
        "Cerrados: resumen por motivo que filtra, y buscador.",
        "El pedido se abre en dos columnas, con su ruta: Confirmar, Cobrar, Entregar.",
        "Cada hoja dice qué falta y lo lleva al campo («Falta: …»).",
        "El código de entrega va en 4 casillas.",
        "El mensaje predeterminado se arma con botones: Nombre, Tienda, Código.",
        "Textos más cortos en toda la pantalla.",
      ].map((t) => li(t)).join("")}</ul>${titSec("Sigue igual")}<ul class="cambia igual">${[
        "Reglas de negocio, plazos y estados.",
        "Permisos, responsable y caja.",
        "Boleta, SUNAT y notas de crédito.",
        "Colores, letras y movimiento del ERP (solo tokens).",
      ].map((t) => li(t, "check-circle")).join("")}</ul>`,
      pie: "",
    };
  }

  /* ───────── Dibujar capas ───────── */
  function vista(m) {
    return { pedido: vistaPedido, pago: vistaPago, anularPago: vistaAnularPago, anularPagado: vistaAnularPagado, enviar: vistaEnviar, mensaje: vistaMensaje, avisos: vistaAvisos, ticket: vistaTicket, cambia: vistaCambia }[m.tipo](m);
  }
  function interior(m) {
    const v = vista(m);
    const cerrar = v.conCerrar !== false && (v.conCerrar === true || ["pedido"].includes(m.tipo) && m.modo === "revisar");
    return { tam: v.tam, html: `<div class="asa"></div><div class="hoja-cab"><div>${v.volver ? `<div style="margin-bottom:10px"><button class="volver" data-a="modo" data-p="${v.volver}" aria-label="Volver">${ic("arrow-l")}</button></div>` : ""}<h2>${v.titulo}</h2>${v.sub ? `<p>${esc(v.sub)}</p>` : ""}</div>${cerrar ? `<button class="x" data-a="cerrar" aria-label="Cerrar">${ic("x", "g")}</button>` : ""}</div>${v.pre || ""}<div class="hoja-cuerpo">${v.cuerpo}</div>${v.pie || ""}` };
  }
  P.refrescarCapas = function () {
    const cont = document.getElementById("capas");
    const vigentes = S.pila.map((m) => String(m.uid));
    [...cont.children].forEach((el) => { if (!vigentes.includes(el.dataset.uid)) el.remove(); });
    const activo = document.activeElement, claveFoco = activo && activo.dataset ? activo.dataset.f : null;
    const pos = claveFoco && activo.selectionStart != null ? [activo.selectionStart, activo.selectionEnd] : null;
    S.pila.forEach((m, idx) => {
      let el = cont.querySelector(`[data-uid="${m.uid}"]`);
      if (m.saliendo && el) { el.classList.add("sale"); return; } // saliendo: se queda como estaba hasta que termine su salida
      const { tam, html } = interior(m);
      if (!el) {
        el = document.createElement("div");
        el.className = "velo";
        el.dataset.uid = m.uid;
        el.dataset.a = "velo";
        el.innerHTML = `<div class="hoja ${tam}" role="dialog" aria-modal="true" tabindex="-1" aria-label="${esc(m.tipo)}">${html}</div>`;
        cont.appendChild(el);
        el.querySelector(".hoja").focus({ preventScroll: true });
        setTimeout(() => el.classList.add("sin-casc"), 800);
      } else {
        const hoja = el.querySelector(".hoja");
        const st = hoja.scrollTop;
        hoja.className = `hoja ${tam}`;
        hoja.innerHTML = html;
        hoja.scrollTop = st;
      }
      el.classList.toggle("sale", !!m.saliendo);
      el.classList.toggle("encima", idx < S.pila.length - 1);
    });
    if (claveFoco) {
      const n = cont.querySelector(`[data-f="${claveFoco}"]`);
      if (n) { n.focus({ preventScroll: true }); if (pos && n.setSelectionRange) try { n.setSelectionRange(pos[0], pos[1]); } catch (e) {} }
    }
  };

  /* ───────── Acciones ───────── */
  const A = P.acc, I = P.inp;
  const pedirEspera = (m, ms, fin) => { m.guardando = true; P.refrescarCapas(); setTimeout(() => { m.guardando = false; fin(); }, ms); };
  const seguir = (o, k) => { if (S.filtro !== null) S.filtro = k; }; // con un filtro puesto, el filtro sigue al pedido
  const guarda = (m, fin) => {
    if (S.corte) { m.guardando = true; P.refrescarCapas(); setTimeout(() => { m.guardando = false; m.incierto = true; P.refrescarCapas(); }, 900); return; }
    pedirEspera(m, 800, fin);
  };

  A.abrir = (el) => P.abrir({ tipo: "pedido", id: el.dataset.p });
  A.cerrar = () => P.cerrar();
  A.velo = (el, ev) => { if (ev.target === el) P.cerrar(); else P.cerrarMenus(); };
  A.respAbrir = (el) => { const m = mod(el); const abrir = !m.respAbierto; P.cerrarMenus(); m.respAbierto = abrir; P.refrescarCapas(); };
  A.respElegir = (el) => { S.resp = el.dataset.p; P.cerrarMenus(); };
  A.falso = () => P.avisar("aviso", "Solo en el ERP real", "Esta acción no hace nada en la maqueta.");
  A.irCaja = () => P.avisar("aviso", "Abre Caja", "En el ERP real te lleva a la pantalla de Caja.");
  A.wa = (el) => { const m = mod(el); const o = pedidoDe(m); P.avisar("exito", "Se abre WhatsApp", wa(o, el.dataset.p)); };
  A.ticket = (el) => P.abrir({ tipo: "ticket", id: mod(el).id });
  A.irA = (el) => {
    const hoja = el.closest(".hoja"), n = hoja.querySelector(`[data-campo="${el.dataset.p}"]`);
    if (!n) return;
    n.scrollIntoView({ behavior: "smooth", block: "center" });
    n.classList.remove("destello"); void n.offsetWidth; n.classList.add("destello");
    const campo = n.querySelector("input,textarea"); if (campo) setTimeout(() => campo.focus({ preventScroll: true }), 350);
    setTimeout(() => n.classList.remove("destello"), 1200);
  };
  A.modo = (el) => { const m = mod(el); m.modo = el.dataset.p; m.motivo = null; P.refrescarCapas(); };
  A.motivo = (el) => { const m = mod(el); m.motivo = el.dataset.p; P.refrescarCapas(); };

  /* — Confirmar — */
  const prefijoDecidir = (n) => n.startsWith("decidir:");
  const click = P.acc;
  const decidirHandler = (el, ev) => {};
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest('[data-a^="decidir:"]'); if (!el) return;
    ev.stopPropagation();
    const m = mod(el), id = el.dataset.a.split(":")[1], k = el.dataset.p;
    m.dec[id] = k === "compra" || k === "taller" ? { tipo: "por_conseguir", via: k, fecha: m.dec[id] && m.dec[id].fecha || "" } : { tipo: "reservar", donde: k.slice(5), lugar: null };
    P.refrescarCapas();
  }, true);
  A.fecha = (el) => { const m = mod(el), [id, f] = el.dataset.p.split("|"); m.dec[id] = { ...m.dec[id], tipo: "por_conseguir", fecha: f }; P.refrescarCapas(); };
  A.cambiarLugar = (el) => { const m = mod(el), d = m.dec[el.dataset.p]; d.lugar = d.lugar === "almacen" ? "piso" : "almacen"; P.refrescarCapas(); };
  A.quitar = (el) => { const m = mod(el); m.dec[el.dataset.p] = { tipo: "quitar" }; P.refrescarCapas(); };
  A.deshacerQuitar = (el) => { const m = mod(el), o = pedidoDe(m), l = o.lineas.find((x) => x.id === el.dataset.p); m.dec[l.id] = decisionDeFabrica(l); P.refrescarCapas(); };
  A.confirmar = (el) => {
    const m = mod(el), o = pedidoDe(m);
    pedirEspera(m, 800, () => {
      o.lineas.forEach((l) => {
        const d = m.dec[l.id];
        if (d.tipo === "quitar") l.estado = "quitada";
        else if (d.tipo === "por_conseguir") { l.estado = "por_conseguir"; l.fecha = d.fecha; l.via = d.via; }
        else if (d.donde !== "aqui") { l.estado = "reservada"; l.otra = d.donde; }
        else { l.estado = "reservada"; l.lugar = d.lugar || (l.disp.alm > 0 ? "almacen" : "piso"); }
      });
      o.estado = "confirmado"; o.confirmadoHace = "hace un momento"; o.anulaMin = P.PLAZOS.sinPagar * 60; o.hace = "hace un momento";
      m.recien = "confirmado"; S.recien = o.id; seguir(o, "cobrar");
      P.avisar("exito", `Pedido ${o.id} confirmado`, o.lineas.some((l) => l.estado === "por_conseguir") ? "Se reservó lo que había. Lo demás queda por conseguir." : "Sus prendas quedaron reservadas.");
      P.render(false); P.refrescarCapas();
    });
  };
  A.cerrarPedido = (el) => {
    const m = mod(el), o = pedidoDe(m);
    pedirEspera(m, 700, () => {
      o.estado = "anulado"; o.cierre = m.motivo; o.lineas.forEach((l) => (l.estado = "liberada")); o.hace = "hace un momento";
      S.recien = o.id; seguir(o, "cerrados");
      P.avisar("exito", `Pedido ${o.id} cerrado`, "Nada se había reservado: el stock no cambió.");
      P.cerrar();
    });
  };
  A.anular = (el) => {
    const m = mod(el), o = pedidoDe(m), pg = pagado(o);
    pedirEspera(m, 700, () => {
      o.estado = "anulado"; o.cierre = m.motivo; o.lineas.forEach((l) => { if (l.estado !== "quitada") l.estado = "liberada"; }); o.hace = "hace un momento";
      S.recien = o.id; seguir(o, "cerrados");
      if (pg > 0) { m.modo = "revisar"; m.motivo = null; P.avisar("exito", `Pedido ${o.id} anulado`, `Lo reservado volvió a estar libre. Falta devolverle ${soles(pg)}.`); P.render(false); P.refrescarCapas(); }
      else { P.avisar("exito", `Pedido ${o.id} anulado`, "Lo reservado volvió a estar libre."); P.cerrar(); }
    });
  };
  A.reservar = (el) => { const m = mod(el), o = pedidoDe(m), l = o.lineas.find((x) => x.id === el.dataset.p); m.modo = "reservar"; m.reservando = { id: l.id, lugar: l.disp.alm > 0 ? "almacen" : "piso" }; P.refrescarCapas(); };
  A.lugarReserva = (el) => { const m = mod(el); m.reservando.lugar = m.reservando.lugar === "almacen" ? "piso" : "almacen"; P.refrescarCapas(); };
  A.reservarAhora = (el) => {
    const m = mod(el), o = pedidoDe(m), l = o.lineas.find((x) => x.id === m.reservando.id);
    pedirEspera(m, 600, () => {
      l.estado = "reservada"; l.lugar = m.reservando.lugar; l.fecha = null; m.modo = "revisar"; m.reservando = null; S.recien = o.id;
      P.avisar("exito", "Prenda reservada", `${l.ref} · ${l.talla} quedó separada para el pedido ${o.id}.`);
      P.render(false); P.refrescarCapas();
    });
  };

  /* — Cobrar — */
  A.pagar = (el) => P.abrir({ tipo: "pago", id: mod(el).id });
  A.todoFalta = (el) => { const m = mod(el); m.monto = falta(pedidoDe(m)).toFixed(2); P.refrescarCapas(); };
  A.medio = (el) => { const m = mod(el); m.medio = el.dataset.p; if (m.medio === "efectivo") m.op = ""; P.refrescarCapas(); };
  I.monto = (el) => { const m = mod(el); m.monto = el.value.replace(/[^\d.,]/g, ""); P.refrescarCapas(); };
  I.op = (el) => { const m = mod(el); m.op = el.value.replace(/\D/g, "").slice(0, 12); P.refrescarCapas(); };
  A.registrarPago = (el) => {
    const m = mod(el), o = pedidoDe(m), monto = parseMonto(m.monto), f = falta(o);
    guarda(m, () => {
      const r = P.RESPONSABLES.find((x) => x.id === S.resp);
      o.pagos.push({ id: "p" + (o.pagos.length + 1), monto, medio: m.medio, op: m.medio === "efectivo" ? null : m.op, cuando: "hace un momento", por: r.nombre, enCaja: m.medio === "efectivo", estado: "aprobado", hoy: true });
      S.recien = o.id;
      if (Math.abs(monto - f) < 0.005) {
        o.estado = "pagado"; o.pagadoHace = "hace un momento"; o.listo = o.lineas.every((l) => l.estado === "reservada" && !l.otra || l.estado === "quitada");
        const n = 86 + S.d.pedidos.filter((x) => x.boleta && x.boleta.texto.startsWith("B001-000") && Number(x.boleta.texto.slice(-2)) >= 86).length;
        o.boleta = { texto: "B001-000" + n, estado: "enviado" };
        seguir(o, "entregar");
        P.avisar("exito", `Pedido ${o.id} pagado`, `Boleta ${o.boleta.texto} en camino a SUNAT. Avísale que su código está en «Mis pedidos».`);
        setTimeout(() => { if (o.boleta) { o.boleta.estado = "aceptado"; P.render(false); P.refrescarCapas(); } }, 2400);
      } else P.avisar("exito", `Pago de ${soles(monto)} registrado`, `Quedan ${soles(Math.round((f - monto) * 100) / 100)} por cobrar.`);
      P.cerrar();
      setTimeout(() => { P.render(false); P.refrescarCapas(); }, 200);
    });
  };
  A.anularPago = (el) => P.abrir({ tipo: "anularPago", id: mod(el).id, pagoId: el.dataset.p, motivo: null });
  A.confirmarAnularPago = (el) => {
    const m = mod(el), o = pedidoDe(m), g = o.pagos.find((x) => x.id === m.pagoId), dev = o.estado === "anulado";
    pedirEspera(m, 700, () => {
      g.estado = "anulado"; g.devuelto = m.motivo === "devuelto_al_cliente"; S.recien = o.id;
      if (o.estado === "confirmado" && pagado(o) === 0) o.anulaMin = 30 * 60;
      P.avisar("exito", dev ? `Devolución de ${soles(g.monto)} registrada` : `Pago de ${soles(g.monto)} anulado`, g.medio === "efectivo" ? `Salió de la caja de ${T()}.` : dev ? "La caja no cambia." : `Vuelve a faltar ${soles(g.monto)} en el pedido.`);
      P.cerrar(); setTimeout(() => { P.render(false); P.refrescarCapas(); }, 200);
    });
  };

  /* — Entregar — */
  I.cod = (el) => {
    const m = mod(el), n = +el.dataset.n, d = el.value.replace(/\D/g, "");
    if (d.length > 1) { d.slice(0, 4 - n).split("").forEach((c, i) => (m.codigo[n + i] = c)); } else m.codigo[n] = d;
    m.rechazo = null;
    P.refrescarCapas();
    const sig = document.querySelector(`[data-f="cod${Math.min(3, d ? n + (d.length > 1 ? d.length : 1) : n)}"]`);
    if (sig) { sig.focus(); sig.select && sig.select(); }
  };
  document.addEventListener("keydown", (ev) => {
    const el = ev.target.closest && ev.target.closest('[data-i="cod"]'); if (!el) return;
    const n = +el.dataset.n, m = mod(el);
    if (ev.key === "Backspace" && !el.value && n > 0) { m.codigo[n - 1] = ""; P.refrescarCapas(); const p = document.querySelector(`[data-f="cod${n - 1}"]`); p && p.focus(); }
    if (ev.key === "Enter") { const b = el.closest(".hoja").querySelector('[data-a="entregar"]:not([disabled])'); if (b) b.click(); }
  });
  A.rellenarCodigo = (el) => { const m = mod(el); m.codigo = P.CODIGO_ENTREGA.split(""); m.rechazo = null; P.refrescarCapas(); };
  A.entregar = (el) => {
    const m = mod(el), o = pedidoDe(m);
    const finalizar = () => {
      if (m.codigo.join("") !== P.CODIGO_ENTREGA) { m.rechazo = "Ese código no es de este pedido."; m.entregando = false; P.refrescarCapas(); return; }
      const r = P.RESPONSABLES.find((x) => x.id === S.resp);
      o.estado = "entregado"; o.entregadoPor = r.nombre; o.hace = "hace un momento"; o.lineas.forEach((l) => (l.estado = "entregada")); S.recien = o.id; seguir(o, "cerrados");
      P.avisar("exito", `Pedido ${o.id} entregado`, `Sus prendas salieron del stock.${o.boleta ? ` La boleta ${o.boleta.texto} ya había salido.` : ""}`);
      m.entregando = false; P.cerrar();
    };
    m.entregando = true; P.refrescarCapas();
    if (S.corte) { setTimeout(() => { m.entregando = false; m.incierto = true; P.refrescarCapas(); }, 900); return; }
    setTimeout(finalizar, 800);
  };
  A.anularPagado = (el) => P.abrir({ tipo: "anularPagado", id: mod(el).id, motivo: null });
  A.revisarBoleta = (el) => { const o = pedidoDe(mod(el)); o.boleta.estado = "aceptado"; P.avisar("exito", "La boleta ya está aceptada", "Ya puedes anular el pedido."); P.render(false); P.refrescarCapas(); };
  A.confirmarAnularPagado = (el) => {
    const m = mod(el), o = pedidoDe(m), tot = pagado(o);
    guarda(m, () => {
      o.estado = "anulado"; o.cierre = m.motivo; o.lineas.forEach((l) => { if (l.estado !== "quitada") l.estado = "liberada"; });
      o.pagos.forEach((g) => { if (g.estado === "aprobado") { g.estado = "anulado"; g.devuelto = true; } });
      if (o.boleta) { o.nota = { texto: "BC01-00005", estado: "enviado", total: tot }; o.boleta.estado = "anulado"; setTimeout(() => { o.nota.estado = "aceptado"; P.render(false); P.refrescarCapas(); }, 2400); }
      o.hace = "hace un momento"; S.recien = o.id; seguir(o, "cerrados");
      P.avisar("exito", `Pedido ${o.id} anulado`, `Se le devolvieron ${soles(tot)} y su boleta se anula.`);
      P.cerrar(); setTimeout(() => { P.render(false); P.refrescarCapas(); }, 200);
    });
  };
  A.revisar = (el) => {
    const m = mod(el); m.revisando = true; P.refrescarCapas();
    setTimeout(() => {
      m.revisando = false; m.incierto = false; S.corte = false;
      document.getElementById("m-red").setAttribute("aria-pressed", "false");
      P.avisar("aviso", "No se guardó nada", "Revisa los datos y vuelve a intentarlo.");
      P.refrescarCapas();
    }, 900);
  };

  /* — Enviar a otra sede — */
  A.enviar = (el) => P.abrir({ tipo: "enviar", id: el.dataset.p });
  I.llega = (el) => { const m = mod(el); m.llega = el.value; P.refrescarCapas(); };
  A.llegada = (el) => { const m = mod(el); m.llega = el.dataset.p; P.refrescarCapas(); };
  A.confirmarEnviar = (el) => {
    const m = mod(el), e = S.d.enviar.find((x) => x.id === m.id);
    pedirEspera(m, 800, () => {
      S.d.enviar = S.d.enviar.filter((x) => x !== e);
      P.avisar("exito", `Enviado a ${e.tiendaPedido}`, `Salió en el traslado N.º 415. Empácalo con el número ${e.id}.`);
      P.cerrar(); P.render(false);
    });
  };

  /* — Mensaje — */
  A.mensaje = () => P.abrir({ tipo: "mensaje" });
  I.msg = (el) => { const m = mod(el); m.texto = el.value; P.refrescarCapas(); };
  A.insertar = (el) => {
    const m = mod(el), ta = document.querySelector('[data-f="msg"]');
    const enfocado = ta && document.activeElement === ta;
    const a = enfocado ? ta.selectionStart : m.texto.length, b = enfocado ? ta.selectionEnd : m.texto.length;
    m.texto = m.texto.slice(0, a) + el.dataset.p + m.texto.slice(b);
    P.refrescarCapas();
    const n = document.querySelector('[data-f="msg"]'); if (n) { n.focus(); n.setSelectionRange(a + el.dataset.p.length, a + el.dataset.p.length); }
  };
  A.fabrica = (el) => { mod(el).texto = P.FABRICA; P.refrescarCapas(); };
  A.guardarMensaje = (el) => {
    const m = mod(el);
    S.mensaje = m.texto.trim() || P.FABRICA;
    P.avisar("exito", "Mensaje guardado", "Tus próximos pedidos lo usan.");
    P.cerrar();
  };

  /* — Avisos del celular — */
  A.avisos = () => P.abrir({ tipo: "avisos" });
  A.faseAvisos = (el) => { mod(el).fase = el.dataset.p; P.refrescarCapas(); };
  A.activarAvisos = (el) => { const m = mod(el); m.fase = "activo"; P.avisar("exito", "Avisos activados", `Este celular suena con cada pedido de ${T()}.`); P.refrescarCapas(); };
  A.apagarAvisos = (el) => { const m = mod(el); m.fase = "apagado"; P.avisar("exito", "Avisos apagados", "Este celular ya no suena con los pedidos."); P.refrescarCapas(); };
  A.probarAviso = (el) => { const m = mod(el); m.suena = false; P.refrescarCapas(); m.suena = true; P.refrescarCapas(); setTimeout(() => { m.suena = false; }, 900); };
})();
