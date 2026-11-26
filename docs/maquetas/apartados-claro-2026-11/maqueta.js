/* Maqueta navegable · Apartados más claro (2026-11-26). NO es producción.
 * Cada página es la pantalla REAL congelada (su HTML y su CSS ya compilado, con datos inventados). Este guion hace dos cosas:
 *   1. la vuelve navegable (pestañas y botones llevan a la pantalla que sigue), y
 *   2. con «Propuesta» encendida, le aplica el nuevo diseño encima; con «Hoy», la deja tal cual está en el ERP.
 * Así cada cambio se compara en el mismo lugar, y lo que no se tocó es idéntico a lo de hoy. */
(() => {
  const P = new URLSearchParams(location.search);
  const NUEVO = P.get("v") !== "hoy";
  const ESTADO = location.pathname.split("/").pop().replace(".html", "") || "index";
  const DE = P.get("de");
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const txt = (e) => (e.textContent || "").replace(/\s+/g, " ").trim();
  const nombre = (e) => ((e.getAttribute("aria-label") || "") + " " + txt(e)).trim();
  const boton = (re, r = document, sel = "button") => $$(sel, r).find((e) => re.test(nombre(e)));
  const botones = (re, r = document, sel = "button") => $$(sel, r).filter((e) => re.test(nombre(e)));
  /** El elemento más profundo cuyo texto calza. */
  const conTexto = (re, r = document, sel = "*") => $$(sel, r).filter((e) => re.test(txt(e))).pop();
  /** Cambia un texto dentro de los nodos de texto (no toca la estructura). */
  const cambia = (re, nuevo, r = document.body) => {
    const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
    let n, hubo = false;
    while ((n = w.nextNode())) if (re.test(n.textContent)) { n.textContent = n.textContent.replace(re, nuevo); hubo = true; }
    return hubo;
  };
  const url = (archivo, extra = {}) => {
    const q = new URLSearchParams(extra);
    if (!NUEVO) q.set("v", "hoy");
    const s = q.toString();
    return archivo + ".html" + (s ? "?" + s : "");
  };
  const ir = (archivo, extra) => { location.href = url(archivo, extra); };
  const alTocar = (el, archivo, extra) => { if (!el) return; el.style.cursor = "pointer"; el.removeAttribute("disabled"); el.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); ir(archivo, extra); }, true); };

  // Sin animaciones de entrada: al cambiar de pantalla o de versión, nada parpadea.
  const estilo = document.createElement("style");
  estilo.textContent = `*,*::before,*::after{animation:none!important;transition:none!important}
    .mq-barra{position:fixed;left:292px;bottom:14px;z-index:99999;display:flex;align-items:center;gap:10px;padding:8px 10px 8px 16px;border-radius:999px;background:#1a1a18;color:#f5f0e8;font:500 13px/1.2 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35)}
    .mq-barra b{font-weight:600;letter-spacing:.08em;font-size:11px;opacity:.7}
    .mq-seg{display:flex;background:#3a3733;border-radius:999px;padding:3px}
    .mq-seg a{padding:6px 14px;border-radius:999px;color:#f5f0e8;text-decoration:none;font-weight:600}
    .mq-seg a[aria-current=true]{background:#f5f0e8;color:#1a1a18}
    .mq-btn{padding:7px 14px;border-radius:999px;border:1px solid #6b665f;background:transparent;color:#f5f0e8;font:inherit;cursor:pointer}
    .mq-notas{position:fixed;right:16px;bottom:70px;z-index:99999;width:400px;max-height:70vh;overflow:auto;padding:18px 20px;border-radius:18px;background:#1a1a18;color:#f5f0e8;font:400 14px/1.45 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35)}
    .mq-notas h4{font:600 12px/1 system-ui;letter-spacing:.1em;text-transform:uppercase;opacity:.65;margin:0 0 10px}
    .mq-notas li{margin:0 0 10px 16px;list-style:disc}
    .mq-notas em{font-style:normal;opacity:.65}
    .mq-nuevo #hoja-apartados aside.ap-ticket{position:sticky;align-self:start}
    .mq-condiciones{margin:0 0 10px;padding:10px 12px;border-radius:12px;border:1px solid var(--color-sand);font-size:14px;line-height:1.4}
    .mq-cab-tabla{display:grid;gap:0 20px;padding:0 20px 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--color-tenue,#6b665f)}`;
  document.head.appendChild(estilo);
  if (NUEVO) document.documentElement.classList.add("mq-nuevo");

  // ───────────────────────────── La propuesta, pantalla por pantalla ─────────────────────────────
  const notas = [];
  /** Lo que mide la pantalla se vuelve a medir cuando terminan de llegar las letras. */
  const alListo = [];
  const nota = (antes, ahora, porque) => notas.push({ antes, ahora, porque });
  const hoja = $("#hoja-apartados");
  const dialogo = $("[role=dialog]");
  const NOMBRES = { Chompa: "Chompa Alma", Falda: "Falda Sol", Polo: "Polo Río", Casaca: "Casaca Nube", Vestido: "Vestido Aurora", Blusa: "Blusa Emma", "Pantalón": "Pantalón Lía" };

  function pestanas() {
    const lista = $("[role=tablist]");
    if (!lista) return;
    const [tA, tE, tH] = $$("[role=tab]", lista);
    let tP = null;
    if (NUEVO) {
      tP = tH.cloneNode(true);
      $(".pestana-cayla__texto", tP).textContent = "Pendientes";
      lista.insertBefore(tP, tH);
      $(".pestana-cayla__cuenta", tH)?.remove();
      const enPendientes = ESTADO === "pendientes" || DE === "pendientes";
      const activa = /^apartar/.test(ESTADO) ? tA : /^entregar|modal-abonar/.test(ESTADO) ? tE : enPendientes ? tP : tH;
      [tA, tE, tP, tH].forEach((t) => { t.setAttribute("aria-selected", String(t === activa)); t.dataset.state = t === activa ? "active" : "inactive"; });
      const ind = $(".cmp-ind", lista);
      const ubicar = () => { if (ind) { ind.style.width = activa.offsetWidth + "px"; ind.style.transform = `translateX(${activa.offsetLeft}px)`; } };
      ubicar(); alListo.push(ubicar);
    }
    alTocar(tA, "apartar-vacio"); alTocar(tE, "entregar-lista"); alTocar(tH, "historial"); if (tP) alTocar(tP, "pendientes");
  }

  function sinAvisoRojo() {
    const a = $(".ap-avisos");
    if (!a) return;
    a.remove();
    nota("Párrafo rojo arriba de las tres pestañas («…se liberó solo… ver Historial»)", "Sale de Apartar y Entregar; lo dice la pestaña «Pendientes» con su número", "Al entregar, la colaboradora dudó si el aviso era del cliente que atendía. El rojo queda solo para errores.");
  }

  /** El panel de la derecha se queda quieto y su pie (responsable + botón) siempre a la vista. */
  function panelFijo() {
    const aside = $("#hoja-apartados aside.ap-ticket");
    if (!aside) return;
    const medir = () => {
      aside.style.top = ""; aside.style.height = "";
      const arriba = Math.round(aside.getBoundingClientRect().top + window.scrollY);
      aside.style.top = arriba + "px";
      aside.style.height = `calc(100vh - ${arriba + 16}px)`;
    };
    aside.style.minHeight = "0";
    $("#hoja-apartados").style.minHeight = "0";
    medir(); alListo.push(medir);
  }

  function apartarPrendas() {
    const aside = $("#hoja-apartados aside");
    $$("#hoja-apartados aside article").forEach((art) => {
      const stock = conTexto(/^Stock: \d+$/, art);
      if (stock) (stock.closest("span,p") && /Stock/.test(txt(stock.parentElement)) && txt(stock.parentElement).length < 14 ? stock.parentElement : stock).remove();
      cambia(/Quedan (\d+) disponibles? en sede tras apartar/, "Quedan $1 en la tienda", art);
      cambia(/\s*·?\s*Stock: \d+/, "", art);
    });
    if (aside && cambia(/Precio congelado/, "Se le guarda", aside)) nota("«Precio congelado hasta el jue, 3 dic»", "«Se le guarda hasta el jue, 3 dic»", "La ciega no supo si esa era la fecha para recoger.");
    const b = boton(/^Apartar\s*S\//, aside || document);
    if (b) {
      const et = $(".label-cayla", b) || b;
      cambia(/Apartar/, "Seguir: datos del cliente", et);
      nota("Botón «APARTAR S/219.80», que no aparta: abre los datos del cliente", "«SEGUIR: DATOS DEL CLIENTE»", "La ciega lo tocó esperando que guardara.");
    }
    if ($$("#hoja-apartados aside article").length) nota("Cada prenda dice «Stock: 4» y además «Quedan 3 disponibles en sede tras apartar»", "Una sola línea: «Quedan 3 en la tienda»", "El mismo dato dos veces.");
  }

  function apartarCobro() {
    panelFijo();
    nota("«Confirmar apartado» queda bajo el borde de la pantalla (medido: y = 1031 de 900)", "El panel se queda quieto y su pie —responsable y botón— siempre se ve; lo de arriba corre por dentro", "Las tres ciegas tuvieron que bajar la página para encontrar el botón.");
    const aside = $("#hoja-apartados aside");
    if (cambia(/^Resta /, "Le falta ", aside)) nota("«Resta S/153.80»", "«Le falta S/153.80»", "Lo que falta pagar tiene seis nombres en el módulo (Resta, saldo, Falta pagar, Falta, Queda, Saldo al recoger): queda uno.");
    if (cambia(/^Recibe$/, "Paga con", aside)) nota("«Recibe S/» junto a «Otro S/»", "«Paga con S/» (el billete)", "La ciega dudó cuál era el adelanto y cuál el billete.");
    const paso3 = conTexto(/^Si no recoge$/i, aside, "h3");
    if (paso3) {
      paso3.textContent = "Si no viene";
      const seccion = paso3.closest("section");
      const grupo = $("[role=group]", seccion) || $("fieldset", seccion);
      if (grupo) { const p = document.createElement("p"); p.className = "text-sm text-tinta/70"; p.style.margin = "2px 0 8px"; p.textContent = "Le devolvemos su adelanto por:"; grupo.parentElement.insertBefore(p, grupo); }
      nota("Paso «SI NO RECOGE» con Yape / Plin / Transf. sin decir para qué", "«SI NO VIENE · Le devolvemos su adelanto por:»", "La ciega no entendió qué era y lo dejó como estaba.");
      const casilla = $("input[type=checkbox]", seccion);
      if (casilla) {
        const fila = casilla.closest("label") || casilla.parentElement;
        const caja = document.createElement("div");
        caja.className = "mq-condiciones vd-placa";
        caja.innerHTML = "<b>Léele esto al cliente:</b> «Te lo guardamos hasta el <b>jue, 3 dic</b>. Si no vienes, la prenda vuelve a la tienda y te devolvemos tu adelanto completo por Yape.»";
        fila.parentElement.insertBefore(caja, fila);
        cambia(/Le leí las condiciones/, "Se lo leí", fila.parentElement);
        $$("button", fila.parentElement).filter((x) => /Qué es las condiciones/.test(nombre(x))).forEach((x) => x.remove());
        nota("Casilla «Le leí las condiciones», con el texto escondido tras un «?» de 14 px", "Lo que hay que leerle está a la vista, en dos líneas, sobre la casilla «Se lo leí»", "La ciega marcó la casilla sin haber leído nada: no sabía dónde estaban las condiciones. (El 2026-11-16 elegiste esconderlas para compactar: esto lo reabre con esa evidencia.)");
      }
    }
  }

  function apartadoRegistrado() {
    if (!dialogo) return;
    const grupo = $('[aria-label="Con la prenda en la mano"]', dialogo) || conTexto(/^Ahora, con la prenda en la mano/, dialogo)?.closest("fieldset,div");
    const primera = conTexto(/^Listo$/i, dialogo)?.closest("div[class*=rounded], div[class*=card], div[class*=placa]");
    if (grupo && primera && primera.parentElement) {
      primera.parentElement.insertBefore(grupo, primera);
      grupo.style.marginBottom = "12px";
      nota("«Ahora, con la prenda en la mano» (etiqueta, estante, constancia) queda al final, bajo el borde", "Es lo primero de la hoja", "Es lo único que hay que HACER al terminar; la ciega tuvo que bajar dentro de la hoja para verlo.");
    }
    if (cambia(/adelanto de (S\/[\d.]+) · saldo (S\/[\d.]+)/, "dejó hoy, de $1 · le falta $2", dialogo)) nota("«S/66.00 · adelanto de S/219.80 · saldo S/153.80»", "«S/66.00 · dejó hoy, de S/219.80 · le falta S/153.80»", "La ciega: «los números no cuadran entre sí… no supe qué creer».");
    const imp = boton(/^Imprimir y nuevo apartado/, dialogo);
    if (imp) { cambia(/Imprimir y nuevo apartado/, "Imprimir constancia", imp); boton(/^Solo imprimir/, dialogo)?.remove(); nota("Tres salidas: «Imprimir y nuevo apartado», «Solo imprimir», «Sin imprimir»", "Dos: «Imprimir constancia» y «Sin imprimir»", "Una pregunta, una respuesta. (La forma de tres botones viene de «Venta registrada»: decides tú si aplica aquí.)"); }
  }

  function entregarElegido() {
    panelFijo();
    nota("«Entregar y cobrar» queda bajo el borde (medido: y = 918 de 900) y antes hay que bajar para elegir responsable", "Panel quieto, con el responsable y el botón siempre a la vista", "La ciega bajó la página para encontrarlos.");
    const aside = $("#hoja-apartados aside");
    const pie = $$(".ap-ticket-hilo", aside).pop();
    const repetido = pie && $("dl", pie)?.parentElement;
    if (repetido) { repetido.remove(); nota("La cuenta se dice dos veces en el mismo panel (arriba «Falta pagar», abajo «Total / Ya pagó / Saldo»)", "Una sola vez, arriba; el botón lleva el monto", "Repetirla empujaba el botón fuera de la pantalla."); }
    cambia(/^Falta pagar$/, "Le falta", aside);
    const abonar = conTexto(/^¿Viene solo a abonar\?$/, aside);
    if (abonar) { abonar.textContent = "¿Solo abona hoy?"; abonar.nextElementSibling?.remove(); }
    const notaBoleta = conTexto(/^Sale la boleta o factura por el total/, aside, "p");
    if (notaBoleta) { notaBoleta.remove(); nota("Cinco frases explicativas a la vista en Entregar", "Queda lo que se hace; lo que explica pasa al «?»", "Regla «Poco texto a la vista» (2026-11-13): un nombre y, como mucho, una línea."); }
    cambia(/^Listo: entrega la prenda y la boleta\.?$/, "Listo: entrega la prenda y la boleta.", aside);

    const art = $("#hoja-apartados article");
    if (!art) return;
    const otro = boton(/^Otro cliente$/i, art);
    if (otro) { otro.textContent = "← Cambiar de cliente"; otro.style.display = "block"; otro.style.marginLeft = "auto"; nota("«OTRO CLIENTE» pegado al estante, con cara de etiqueta", "«← Cambiar de cliente»", "La ciega no supo si era una advertencia o una etiqueta."); }
    const editar = boton(/^Editar prendas$/, art), liberar = boton(/^Liberar apartado$/, art);
    if (editar && liberar) {
      editar.parentElement.querySelector("span.text-sm")?.remove();
      const frase = liberar.parentElement.querySelector("span.text-sm");
      frase?.remove();
      cambia(/Liberar apartado/, "Cancelar apartado", liberar);
      editar.parentElement.appendChild(liberar);
      nota("«Liberar apartado»", "«Cancelar apartado»", "Es la palabra que ya usa el mensaje que se le manda al cliente («venció y lo cancelamos»).");
    }
    const antes = conTexto(/^Antes de entregar:/, art, "span");
    if (antes) antes.innerHTML = "Antes de entregar: prenda del estante <b>A-39</b> y DNI o constancia del cliente.";
    // La línea de tiempo: el día que vence, «Hoy» no puede ir al centro.
    const tramos = $$("div.relative", $("div.grid.grid-cols-3", art) || art).filter((d) => /^(Apartó|Hoy|Vence)/.test(txt(d)));
    if (tramos.length === 3 && txt(tramos[1]).replace("Hoy", "") === txt(tramos[2]).replace("Vence", "")) {
      tramos[1].style.visibility = "hidden";
      $("b", tramos[2]).textContent = "Vence hoy";
      const barra = $$("span.absolute", tramos[0].parentElement).find((s) => /bg-tinta/.test(s.className));
      if (barra) { barra.style.width = "auto"; barra.style.right = "8px"; }
      nota("Línea de tiempo: «Hoy» al centro aunque hoy es el día en que vence", "«Vence hoy» al final, con la línea llena", "El punto de «Hoy» estaba fijo al medio, sin importar la fecha.");
    }
  }

  function apartadoEntregado() {
    if (!dialogo) return;
    const imp = boton(/^Imprimir y entregar/, dialogo);
    if (imp) { cambia(/Imprimir y entregar/, "Imprimir boleta", imp); boton(/^Solo imprimir/, dialogo)?.remove(); nota("«Imprimir y entregar» en una hoja que ya dice «Apartado entregado»", "«Imprimir boleta» y «Sin imprimir»", "La ciega dudó si ya estaba entregado o no."); }
    const jerga = conTexto(/entra hoy a ingresos y sale de «En custodia»/, dialogo, "p");
    if (jerga) { jerga.remove(); nota("«La venta de S/219.90 entra hoy a ingresos y sale de “En custodia”…»", "Fuera de la hoja de la colaboradora", "Es contabilidad; a quien entrega no le sirve para decidir nada."); }
  }

  const COLS_HISTORIAL = "minmax(0,1.9fr) minmax(0,1fr) 180px 205px 196px";
  const COLS_PENDIENTES = "minmax(0,1fr) 185px 220px 250px";

  /** Una fila de la lista con el dinero dicho siempre igual y la prenda con su nombre. */
  function fila(li, modo) {
    const [cCliente, cPrendas, cDinero, cEstado, cAcc] = li.children;
    if (!cAcc) return;
    li.style.gridTemplateColumns = modo === "pendientes" ? COLS_PENDIENTES : COLS_HISTORIAL;
    li.style.alignItems = "center";
    $$("p", cCliente).forEach((p) => {
      p.style.whiteSpace = "nowrap";
      if (modo !== "historial") return;
      // En la lista general la celda es angosta: el celular en una línea y el código (con su estante) en la siguiente, sin partirse.
      const t = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.includes(" · "));
      if (!t) return;
      const partes = t.textContent.split(" · ");
      const p2 = p.cloneNode(false);
      p2.append(partes.slice(1).join(" · "));
      let sig = t.nextSibling;
      while (sig) { const otro = sig.nextSibling; p2.append(sig); sig = otro; }
      t.textContent = partes[0];
      p.after(p2);
    });
    const prendas = $("span.truncate", cPrendas);
    if (prendas) prendas.textContent = txt(prendas).split(", ").map((p) => NOMBRES[p] || p).join(", ");
    if (modo === "pendientes") {
      cPrendas.style.display = "none";
      const p = $("p", cCliente);
      if (p && prendas) { const s = document.createElement("p"); s.className = p.className; s.style.whiteSpace = "nowrap"; s.textContent = txt(prendas); p.after(s); }
    }
    // Dinero: «Pagó … de …» y «Le falta …», siempre con las mismas dos palabras.
    const t = txt(cDinero);
    const m = t.match(/(S\/[\d.]+) de (S\/[\d.]+)/);
    const saldo = t.match(/saldo (S\/[\d.]+)/);
    const yape = t.match(/por (Yape|Plin|Transf\.?)[^S]*/i);
    if (m) {
      cDinero.innerHTML = /Devolver/.test(txt(cEstado))
        ? `<p class="font-semibold text-tinta" style="white-space:nowrap">Dejó ${m[1]}</p><p class="text-sm text-tinta/60" style="white-space:nowrap">${yape ? yape[0].trim() : ""}</p>`
        : saldo
          ? `<p class="font-semibold text-tinta" style="white-space:nowrap">Le falta ${saldo[1]}</p><p class="text-detalle text-tinta/60" style="white-space:nowrap">pagó ${m[1]} de ${m[2]}</p>`
          : `<p class="text-tinta" style="white-space:nowrap">Total ${m[2]}</p>`;
    }
    $$("p", cEstado).forEach((p) => { if (/^(cerrado|devuelto)$/i.test(txt(p))) p.remove(); });
    cambia(/ · extendido/, " · ya aplazado", cEstado);
    cAcc.style.flexWrap = modo === "pendientes" ? "wrap" : "nowrap";
    cCliente.style.overflow = "hidden";
    return { cAcc, cEstado };
  }

  function cablesDeFila(li, origen) {
    const de = { de: origen };
    alTocar(boton(/^Ver el detalle/, li), "modal-detalle", de);
    alTocar(boton(/^Devolver/, li), "modal-devolver", de);
    alTocar(boton(/^Aplazar$/, li), "modal-aplazar", de);
    alTocar(boton(/^(Liberar|Cancelar apartado)$/, li), "modal-liberar", de);
    alTocar(boton(/^Entregar$/, li), "entregar-elegido");
    alTocar(boton(/^(Escribir a|Escribirle)/, li), "modal-whatsapp", de);
    alTocar(boton(/^Avisarle/, li), "modal-aviso", de);
    alTocar(boton(/^Reimprimir/, li), "modal-reimprimir", de);
  }

  function tituloDe(seccion, texto, n) {
    const h = $("h3, h2", seccion);
    if (!h) return;
    const nodo = [...h.childNodes].find((x) => x.nodeType === 3 && x.textContent.trim()) || [...h.querySelectorAll("*")].flatMap((e) => [...e.childNodes]).find((x) => x.nodeType === 3 && x.textContent.trim() && !/^\d+$/.test(x.textContent.trim()));
    if (nodo) nodo.textContent = texto + " ";
    const c = $(".titulo-cuenta", seccion);
    if (c && n != null) c.textContent = String(n);
  }

  function historial() {
    const cuerpo = $(".ap-cuerpo");
    const lista = cuerpo.lastElementChild;
    const [gHoy, gPronto] = lista.children;
    // Fuera de aquí lo que es trabajo del día: vive en «Pendientes».
    boton(/Escribirles en lote/)?.closest(".anim-revelar, div.rounded-2xl")?.remove();
    $('[data-guia="apartados.pedidos"]')?.remove();
    nota("Al entrar, la lista empieza en y ≈ 860 de 900: antes van el aviso, 4 cifras, la franja de avisos, los pedidos entre tiendas y dos filas de filtros", "Tres cifras en una línea, una fila de filtros y la lista", "Las ciegas bajaron la página para encontrar los apartados. Lo urgente ya no se busca aquí: tiene su pestaña.");
    // Cifras: una línea cada una, sin jerga.
    const cifras = $$(".ap-cifra");
    cifras.forEach((c) => { c.style.padding = "12px 20px"; const ps = $$("p", c); if (ps[2]) ps[2].style.whiteSpace = "nowrap"; });
    const custodia = cifras.find((c) => /En custodia/i.test(txt(c)));
    if (custodia) { const ps = $$("p", custodia); ps[0].textContent = "Adelantos guardados"; ps[2].textContent = "S/290.00 en efectivo"; nota("«EN CUSTODIA · Adelantos: entran a ventas al entregar · S/290.00 fue en efectivo»", "«ADELANTOS GUARDADOS · S/290.00 en efectivo»", "«En custodia» es palabra de contabilidad; dos ciegas tuvieron que adivinarla."); }
    const vencen = cifras.find((c) => /Vencen en 2 días/i.test(txt(c)));
    if (vencen) { vencen.remove(); cifras[0].parentElement.style.gridTemplateColumns = "repeat(3,minmax(0,1fr))"; nota("Tres números distintos para «a cuántos escribir»: tarjeta «Vencen en 2 días: 2», franja «3 clientes por avisar hoy», pestaña «4»", "Un solo lugar: «Pendientes», con su cuenta por grupo", "La ciega vio el 2 y el 3 y tuvo que elegir."); }
    // Filtros en una fila.
    const filtros = $('[data-guia="apartados.filtros"]'), periodo = $('[data-guia="apartados.periodo"]');
    boton(/^Necesitan algo$/, filtros)?.remove();
    if (periodo && filtros) {
      const p = boton(/^Cerrados$/, filtros);
      if (p) { const q = p.cloneNode(true); q.textContent = "Cerrados de: 30 días ▾"; p.after(q); }
      periodo.remove();
      nota("Dos filas de píldoras (estado y período) más una frase", "Una fila: estado, «Cerrados de: 30 días» y el buscador", "El período solo aplica a lo cerrado: es un dato de ese filtro, no otra fila.");
    }
    // Una sola tabla: mismas columnas en todos los grupos, con sus títulos.
    const cab = document.createElement("div");
    cab.className = "mq-cab-tabla";
    cab.style.gridTemplateColumns = COLS_HISTORIAL;
    cab.innerHTML = "<span>Cliente</span><span>Prendas</span><span>Pago</span><span>Estado</span><span></span>";
    lista.before(cab);
    $$("li", lista).forEach((li) => {
      const f = fila(li, "historial");
      if (!f) return;
      // En la lista general: reimprimir, escribir y entregar. Aplazar y cancelar se deciden en «Pendientes» o en el detalle.
      botones(/^(Aplazar|Liberar)$/, f.cAcc).forEach((b) => b.remove());
      const dev = boton(/^Devolver\s*S\//, f.cAcc);
      if (dev) cambia(/Devolver\s*S\/[\d.]+/, "Devolver", dev);
      cablesDeFila(li, "historial");
    });
    nota("Cada fila arma sus propias columnas: no coinciden entre grupos ni dentro del mismo; el celular y el código se parten en 3 líneas; la prenda dice solo «Falda, P…»", "Una tabla con títulos y las mismas columnas en todas las filas; «Le falta S/…» adelante y la prenda con su nombre", "Medido: columnas en x = 565 / 594 / 681 según el grupo.");
    tituloDe(gHoy, "Hoy, sin falta"); tituloDe(gPronto, "Vencen pronto");
    cambia(/Hoy, sin falta/, "Necesitan algo hoy", gHoy);
  }

  function pendientes() {
    const cuerpo = $(".ap-cuerpo");
    const lista = cuerpo.lastElementChild;
    const [gHoy, gPronto, gTiempo, gCerrados] = lista.children;
    const loteBtn = boton(/Escribirles en lote/);
    const franja = loteBtn?.closest(".anim-revelar, div.rounded-2xl");
    const pedidos = $('[data-guia="apartados.pedidos"]');
    $('[data-guia="apartados.cifras"]')?.remove();
    $('[data-guia="apartados.filtros"]')?.remove();
    $('[data-guia="apartados.periodo"]')?.remove();
    gTiempo?.remove(); gCerrados?.remove();
    // «Hoy, sin falta» mezcla dos tareas distintas: devolver plata y decidir un vencido. Cada una, su grupo.
    const gVencidos = gHoy.cloneNode(true);
    $$("li", gHoy).forEach((li) => { if (!/Devolver/.test(txt(li))) li.remove(); });
    $$("li", gVencidos).forEach((li) => { if (/Devolver/.test(txt(li))) li.remove(); });
    gHoy.after(gVencidos);
    tituloDe(gHoy, "Devuelve el adelanto", $$("li", gHoy).length);
    tituloDe(gVencidos, "Vencidos: decide hoy", $$("li", gVencidos).length);
    tituloDe(gPronto, "Vencen hoy o mañana: escríbeles", $$("li", gPronto).length);
    if (loteBtn) {
      const t = $(".titulo-seccion", gPronto);
      t.style.display = "flex"; t.style.alignItems = "center"; t.style.gap = "12px";
      loteBtn.style.marginLeft = "auto";
      cambia(/Escribirles en lote/, "Escribirles a los 3", loteBtn);
      t.appendChild(loteBtn);
      alTocar(loteBtn, "modal-lote", { de: "pendientes" });
      franja?.remove();
    }
    if (pedidos) lista.appendChild(pedidos);
    $$("li", lista).forEach((li) => {
      if (li.closest('[data-guia="apartados.pedidos"]')) return;
      const f = fila(li, "pendientes");
      if (!f) return;
      boton(/^Reimprimir/, f.cAcc)?.remove();
      const w = boton(/^(Escribir a|Avisarle)/, f.cAcc);
      if (w) { w.textContent = /Avisarle/.test(nombre(w)) ? "Avisarle" : "Escribirle"; }
      const lib = boton(/^Liberar$/, f.cAcc);
      if (lib) { lib.textContent = "Cancelar apartado"; lib.classList.remove("btn-secundario"); lib.classList.add("btn-peligro"); }
      cablesDeFila(li, "pendientes");
    });
    cuerpo.style.paddingTop = "8px";
    nota("No existe: lo que hay que hacer hoy vive dentro de «Historial», bajo cifras y filtros", "Pestaña «Pendientes»: solo lo que pide algo, agrupado por lo que hay que hacer", "El nombre «Historial» no dice que ahí está el trabajo del día: la ciega llegó solo porque el aviso rojo lo decía. Tú pediste que exista un Historial (2026-10-09): sigue existiendo, completo.");
    nota("Grupo «Hoy, sin falta» mezcla devolver plata con decidir un vencido", "«Devuelve el adelanto» y «Vencidos: decide hoy», cada uno con sus botones con palabra", "Cada grupo dice qué hacer, no solo qué tan urgente es.");
    nota("«Liberar» como un botón más, igual a «Aplazar»", "«Cancelar apartado», con la cara de lo que no se deshace fácil", "En Entregar ya iba como peligro; en la fila, no.");
  }

  function modales() {
    if (!dialogo) return;
    const volver = DE || (ESTADO === "modal-abonar" ? "entregar-elegido" : "historial");
    // El pie pegado al borde de la hoja: los botones siempre a la vista.
    const pie = $$(".pie-acciones", dialogo).pop();
    if (NUEVO && pie) {
      let p = pie;
      while (p.parentElement && p.parentElement !== dialogo && p.parentElement.offsetHeight < dialogo.scrollHeight * 0.6) { p.parentElement.after(p); }
      pie.classList.add("pie-hoja-fijo");
      if (dialogo.scrollHeight > dialogo.clientHeight + 4) nota("Los botones de la hoja quedan bajo su borde: hay que bajar dentro de la hoja", "El pie con los botones se queda pegado abajo", "La ciega de «Devolver» bajó dentro de la hoja para encontrar «Registrar devolución».");
    }
    if (NUEVO) {
      if (ESTADO === "modal-devolver") { const c = conTexto(/no se gasta ningún correlativo/, dialogo, "p"); if (c) { c.remove(); nota("«…no hay comprobante que anular, así que no se gasta ningún correlativo»", "Fuera", "«Correlativo» es palabra de contabilidad y no cambia lo que hay que hacer."); } }
      if (ESTADO === "modal-liberar") { cambia(/¿Liberar el apartado\?/, "¿Cancelar el apartado?", dialogo); cambia(/^Liberar prendas$/, "Sí, cancelar apartado", dialogo); cambia(/^Por qué se libera$/, "Por qué se cancela", dialogo); nota("«¿Liberar el apartado?» · «Liberar prendas»", "«¿Cancelar el apartado?» · «Sí, cancelar apartado»", "La palabra de la tienda y la del mensaje al cliente."); }
      if (ESTADO === "modal-abonar") {
        cambia(/^Falta pagar hoy$/, "Le falta", dialogo); cambia(/^Queda (S\/)/, "Le falta $1", dialogo); cambia(/^Mejor no$/, "Cancelar", dialogo);
        if (cambia(/Esperarla (\d) días más: recoge hasta el/, "Darle $1 días más: recoge hasta el", dialogo)) nota("«Esperarla 2 días más…» + dos frases + una nota de tres líneas", "«Darle 2 días más: recoge hasta el sáb, 28 nov»", "Texto sin género (regla de vocabulario) y una sola línea.");
        const extra = conTexto(/^Con la mitad o más de lo que le falta/, dialogo); extra?.remove();
        conTexto(/^El abono se suma al adelanto y no emite comprobante/, dialogo, "p")?.remove();
      }
      if (ESTADO === "modal-aplazar") cambia(/^Aplazar el apartado$/, "Aplazar el apartado", dialogo);
    }
    // Cualquier salida de la hoja vuelve a la pantalla de donde se abrió.
    // (Un botón que guarda trae oculto su «Guardando…»: por eso los que guardan se reconocen por cómo empiezan.)
    const sale = /^(Cerrar|Cancelar|Mejor no|Ahora no|Saltar|Sin imprimir)$|^(Registrar devolución|Sí, cancelar apartado|Liberar prendas|Aplazar|Registrar abono|Abrir WhatsApp|Avisar por WhatsApp|Imprimir la copia)/;
    if (ESTADO === "modal-detalle") {
      alTocar(boton(/^Cerrar$/, dialogo), volver);
      alTocar(boton(/^Aplazar/, dialogo), "modal-aplazar", { de: volver });
      alTocar(boton(/^Registrar abono/, dialogo), "modal-abonar", { de: volver });
      alTocar(boton(/^Entregar/, dialogo), "entregar-elegido");
    } else {
      $$("button", dialogo).forEach((b) => { if (sale.test(nombre(b))) alTocar(b, volver); });
    }
  }

  // ───────────────────────────── Navegación (vale para «Hoy» y para «Propuesta») ─────────────────────────────
  function cables() {
    const aside = $("#hoja-apartados aside");
    if (ESTADO === "apartar-vacio") alTocar($("#hoja-apartados input[type=search]")?.closest("div"), "apartar-ticket");
    if (ESTADO === "apartar-ticket") alTocar(boton(/^(Apartar\s*S\/|Seguir: datos)/, aside), "apartar-cobro");
    if (ESTADO === "apartar-cobro") { $$("input, button", aside).forEach((e) => { if (!/Volver/.test(nombre(e))) alTocar(e, "apartar-cobro-listo"); }); alTocar(boton(/Volver/, aside), "apartar-ticket"); }
    if (ESTADO === "apartar-cobro-listo") { alTocar(boton(/^Confirmar apartado/, aside), "apartar-registrado"); alTocar(boton(/Volver/, aside), "apartar-ticket"); }
    if (ESTADO === "apartar-registrado") $$("button", dialogo).forEach((b) => alTocar(b, "apartar-vacio"));
    if (ESTADO === "entregar-lista") $$("#hoja-apartados li button").forEach((b) => alTocar(b, "entregar-elegido"));
    if (/^entregar-(elegido|listo)$/.test(ESTADO)) {
      alTocar(boton(/(Otro cliente|Cambiar de cliente)/i), "entregar-lista");
      alTocar(boton(/^Abonar$/, aside), "modal-abonar", { de: "entregar-elegido" });
      alTocar(boton(/^(Liberar|Cancelar) apartado$/), "modal-liberar", { de: "entregar-elegido" });
      const medios = $$("fieldset button", aside);
      if (ESTADO === "entregar-elegido") medios.forEach((b) => alTocar(b, "entregar-listo"));
      else alTocar(boton(/^Entregar y cobrar/, aside), "entregar-entregado");
    }
    if (ESTADO === "entregar-entregado") $$("button", dialogo).forEach((b) => alTocar(b, "entregar-lista"));
    if (ESTADO === "historial" && !NUEVO) { $$("#hoja-apartados .ap-cuerpo > div:last-child li").forEach((li) => cablesDeFila(li, "historial")); alTocar(boton(/Escribirles en lote/), "modal-lote", { de: "historial" }); }
  }

  /** Restos de haber congelado la pantalla sin base de datos: no son del ERP, se quitan en las dos versiones. */
  function sinRestosDeLaCaptura() {
    cambia(/^Buscando…$/i, "");
    $$("[role=status]").forEach((s) => { if (/No se pudo leer quién cobró cada pago/.test(txt(s))) s.remove(); });
    if (cambia(/Sin cuenta configurada para este medio/, "Yape de la tienda")) conTexto(/^Queda «sin cuenta» hasta que el líder la configure/, document.body)?.remove();
  }

  if (ESTADO === "pendientes" && !NUEVO) { location.replace(url("historial")); return; }
  if (hoja || dialogo) {
    sinRestosDeLaCaptura();
    pestanas();
    if (NUEVO) {
      sinAvisoRojo();
      if (/^apartar-(vacio|ticket)$/.test(ESTADO)) apartarPrendas();
      if (/^apartar-cobro/.test(ESTADO)) apartarCobro();
      if (ESTADO === "apartar-registrado") apartadoRegistrado();
      if (/^entregar-(elegido|listo)$/.test(ESTADO)) entregarElegido();
      if (ESTADO === "entregar-entregado") apartadoEntregado();
      if (ESTADO === "historial") historial();
      if (ESTADO === "pendientes") pendientes();
    }
    if (/^modal-/.test(ESTADO)) modales();
    cables();
  }

  const remedir = () => alListo.forEach((f) => f());
  document.fonts?.ready.then(remedir); addEventListener("load", remedir); addEventListener("resize", remedir);

  // ───────────────────────────── La barra de la maqueta ─────────────────────────────
  const barra = document.createElement("div");
  barra.className = "mq-barra";
  const q = (v) => { const p = new URLSearchParams(location.search); if (v) p.set("v", "hoy"); else p.delete("v"); const s = p.toString(); return (ESTADO === "pendientes" && v ? "historial" : ESTADO) + ".html" + (s ? "?" + s : ""); };
  barra.innerHTML = `<b>MAQUETA · DATOS INVENTADOS</b><span class="mq-seg"><a href="${q(true)}" aria-current="${!NUEVO}">Hoy</a><a href="${q(false)}" aria-current="${NUEVO}">Propuesta</a></span><button class="mq-btn" type="button">${NUEVO ? `Qué cambia aquí (${notas.length})` : "Ver la propuesta →"}</button><a class="mq-btn" href="index.html" style="text-decoration:none">Mapa</a>`;
  document.body.appendChild(barra);
  const panel = document.createElement("div");
  panel.className = "mq-notas";
  panel.hidden = true;
  panel.innerHTML = `<h4>Qué cambia en esta pantalla</h4>` + (notas.length ? `<ul>${notas.map((n) => `<li><em>Hoy:</em> ${n.antes}<br><b>Propuesta:</b> ${n.ahora}<br><em>Por qué: ${n.porque}</em></li>`).join("")}</ul>` : "<p>Nada: es igual a la de hoy.</p>");
  document.body.appendChild(panel);
  $("button.mq-btn", barra).addEventListener("click", () => { if (NUEVO) panel.hidden = !panel.hidden; else location.href = q(false); });
})();
