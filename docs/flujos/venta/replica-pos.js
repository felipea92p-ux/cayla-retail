/* Réplica del Punto de venta (escritorio) para las guías de la familia «venta».
 *
 * QUÉ ES. El HTML y el CSS son los REALES del ERP, capturados estado por estado (no una copia a mano): así se ve idéntico y no
 * envejece por diseño propio. Esto solo decide QUÉ CAPTURA mostrar según lo que la persona haga, y parchea por DOM lo mínimo
 * (montos, cantidad, el combo «Responsable» que una colaboradora ve y un Admin no).
 *
 * QUÉ PROMETE. Lo que se ve en cada estado es lo que el ERP mostró de verdad en esa captura. Lo que NO es el ERP (el combo de
 * responsable, los avisos «en esta práctica…») está marcado como tal: el combo con las clases del componente real
 * (`ComboResponsable.tsx`); los avisos, con un estilo propio distinto.
 * QUÉ NO PROMETE. Toda la pantalla: solo el camino de venta (Inicio → Punto de Venta → ticket → cobro → venta registrada). El resto
 * responde «en esta práctica eso no está disponible». Una sola prenda por ticket.
 */
(function () {
  "use strict";
  var RESPONSABLE = "Valentina";
  var NOMBRES = ["Valentina", "Camila", "Renata"]; // inventados; en la tienda real salen de quién marcó entrada hoy
  var PROD = {
    blusa: { nombre: "Blusa Emma", aria: "Agregar Blusa Emma Beige talla L", precio: 79.9, max: 5, piso: 5 },
    casaca: { nombre: "Casaca Luciana", aria: "Agregar Casaca Luciana Beige talla M", precio: 159.9, max: 1, piso: 1 },
  };
  var METODOS = { F1: "efectivo", F2: "tarjeta", F3: "yape", F4: "plin", F5: "transferencia" };
  var ETIQ_METODO = { efectivo: "Efectivo", tarjeta: "Tarjeta", yape: "Yape", plin: "Plin", transferencia: "Transferencia" };
  var COMP = { Boleta: "boleta", Factura: "factura", "Nota de venta": "nota" };

  var r2 = function (x) { return Math.round(x * 100) / 100; };
  var soles = function (x) { return "S/" + x.toFixed(2); };
  function montos(total) { var sub = r2(total / 1.18); return { total: total, sub: sub, igv: r2(total - sub) }; }
  var norm = function (s) { return String(s || "").replace(/\s+/g, " ").trim(); };
  var soloDigitos = function (s) { return String(s || "").replace(/\D/g, ""); };

  // Qué (producto, cantidad) dibuja cada captura, para saber qué montos cambiar
  function baseDe(clave) {
    if (clave === "vender_blusa_2") return { prod: "blusa", qty: 2 };
    if (clave === "vender_casaca") return { prod: "casaca", qty: 1 };
    if (clave === "vender_vacio" || clave === "inicio_ventas") return null;
    return { prod: "blusa", qty: 1 }; // vender_blusa, vender_post, cobro_*, registrada
  }

  /* ── Estado ─────────────────────────────────────────────────────────────────────────────────────── */
  function inicial() {
    return { pant: "inicio", carrito: null, resp: null, respAbierto: false, cobro: false, metodo: null, comp: "boleta", dni: "", nombre: "",
      ayuda: false, registrada: false, terminado: false, hoy: 0, vendidasBlusa: 0, venta: null, aviso: null };
  }
  function carritoOk(e) { return !!e.carrito && e.carrito.prod === "blusa" && e.carrito.qty === 1; }

  function clave(e) {
    if (e.pant === "inicio") return "inicio_ventas";
    if (e.registrada) return "registrada";
    if (e.cobro) return e.metodo ? "cobro_" + e.metodo + "_" + e.comp : (e.comp === "boleta" ? "cobro_base" : "cobro_efectivo_" + e.comp);
    if (!e.carrito) return e.hoy > 0 ? "vender_post" : "vender_vacio";
    if (e.carrito.prod === "casaca") return "vender_casaca";
    return e.carrito.qty === 1 ? "vender_blusa" : "vender_blusa_2";
  }
  function render(e, ES) { return ES[clave(e)].html; }

  /* ── Parches por DOM ────────────────────────────────────────────────────────────────────────────── */
  function textos(doc, fn) {
    var w = doc.createTreeWalker(doc.body, 4), n;
    while ((n = w.nextNode())) { var v = fn(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
  }
  function porTexto(doc, sel, re) { return Array.prototype.find.call(doc.querySelectorAll(sel), function (x) { return re.test(norm(x.textContent)); }); }

  var ICONO_USUARIO = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-[18px] w-[18px] flex-none" aria-hidden="true"><circle cx="12" cy="8" r="5"></circle><path d="M20 21a8 8 0 0 0-16 0"></path></svg>';
  var ICONO_FLECHA = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 flex-none transition-transform duration-200" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>';
  function avatar(nombre) { return '<span aria-hidden="true" class="font-display relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-sand text-tinta h-7 w-7 text-sm">' + nombre.charAt(0) + "</span>"; }

  // El combo «Responsable»: lo que una colaboradora ve en lugar de «Admin · queda a tu nombre» (mismas clases que ComboResponsable.tsx)
  function comboHTML(e) {
    var elegido = e.resp;
    var boton = '<button type="button" data-g-combo aria-haspopup="listbox" aria-expanded="' + (e.respAbierto ? "true" : "false") + '" aria-label="' +
      (elegido ? "Responsable: " + elegido + ". Cambiar" : "Elegir responsable") + '" class="flex h-12 w-full items-center gap-2.5 rounded-lg border bg-crema px-3.5 text-left transition-[border-color,box-shadow] duration-200 ' +
      (elegido ? "border-tinta" : "border-dashed border-rojo/55 text-rojo-profundo hover:border-rojo") + '">' +
      (elegido ? avatar(elegido) : ICONO_USUARIO) + '<span class="min-w-0 flex-1 truncate text-sm">' + (elegido || "¿Quién está atendiendo?") + "</span>" + ICONO_FLECHA + "</button>";
    return '<div class="relative mb-3" data-g-combo-raiz><p class="label-cayla mb-1.5 flex items-center gap-1.5 text-[11px] text-tinta/70">Responsable <span class="text-rojo" aria-hidden="true">*</span></p>' +
      boton + (elegido ? "" : '<p class="mt-1.5 text-xs text-tinta/60">Obligatorio para guardar.</p>') + "</div>";
  }
  function listaHTML(e, rect) {
    var filas = NOMBRES.map(function (n) {
      return '<button type="button" role="option" aria-selected="' + (e.resp === n) + '" data-g-opt="' + n + '" class="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors enabled:hover:bg-rojo/10">' +
        avatar(n) + '<span class="min-w-0 flex-1">' + n + '<small class="block text-[11.5px] text-tinta/60">De turno</small></span><span class="h-2 w-2 flex-none rounded-full bg-verde" aria-hidden="true"></span></button>';
    }).join("");
    return '<div id="g-lista-resp" style="position:fixed;left:' + rect.left + "px;top:" + (rect.bottom + 6) + "px;width:" + rect.width + 'px;z-index:60" class="anim-revelar lista-flotante z-50 flex flex-col overflow-hidden rounded-xl">' +
      '<div role="listbox" class="min-h-0 flex-1 overflow-y-auto p-2"><p class="label-cayla px-2 pb-2 pt-1.5 text-[11px] text-tinta/60">De turno ahora · Tienda Trujillo</p>' + filas + "</div></div>";
  }

  var cache = {}; // clases de botón habilitado/deshabilitado, leídas de las capturas reales
  function clasesBoton(ES) {
    if (cache.listo) return cache;
    function del(clave, re) {
      var t = document.createElement("div"); t.innerHTML = ES[clave].html;
      var b = Array.prototype.find.call(t.querySelectorAll("button"), function (x) { return re.test(norm(x.textContent)); });
      return b ? b.className : "";
    }
    cache.cobrarGris = del("vender_vacio", /^Cobrar/); cache.cobrarNegro = del("vender_blusa", /^Cobrar/);
    cache.confirmarGris = del("cobro_base", /Confirmar cobro/); cache.confirmarNegro = del("cobro_yape_boleta", /Confirmar cobro/);
    var t2 = document.createElement("div"); t2.innerHTML = ES.ayuda_dni.html;
    var bb = t2.querySelector('button[aria-label="Qué es Consulta de DNI"]'), gl = t2.querySelector(".anim-globo");
    cache.ayudaAbierta = bb ? bb.className : ""; cache.globo = gl ? gl.outerHTML : "";
    var t3 = document.createElement("div"); t3.innerHTML = ES.cobro_yape_boleta.html;
    var b3 = t3.querySelector('button[aria-label="Qué es Consulta de DNI"]'); cache.ayudaCerrada = b3 ? b3.className : "";
    cache.listo = true; return cache;
  }

  function permiteConfirmar(e) {
    if (!e.carrito || !e.resp || !e.metodo) return false;
    var d = e.dni.length;
    if (e.comp === "factura") return d === 11;
    return d === 0 || d === 8;
  }
  function motivoBloqueo(e) {
    if (!e.carrito) return "Agrega una prenda para cobrar.";
    if (!e.resp) return "Elige quién está atendiendo.";
    if (e.cobro && !e.metodo) return "Elige cómo pagó la clienta.";
    if (e.cobro && e.comp === "factura" && e.dni.length !== 11) return "Escribe el RUC de la empresa.";
    if (e.cobro && e.dni.length > 0 && e.dni.length !== 8 && e.comp !== "factura") return "El DNI tiene 8 dígitos: complétalo o déjalo vacío.";
    return "";
  }
  function pintarBloqueo(doc, e, cl) {
    var motivo = motivoBloqueo(e);
    var hint = doc.getElementById("ticket-motivo-bloqueo");
    if (hint) {
      hint.textContent = motivo;
      var grid = hint.parentElement; if (grid) { grid.classList.toggle("grid-rows-[1fr]", !!motivo); grid.classList.toggle("grid-rows-[0fr]", !motivo); }
    }
    var cobrar = porTexto(doc, "button", /^Cobrar/);
    if (cobrar && !e.cobro) { var ok = !!e.carrito && !!e.resp; cobrar.disabled = !ok; cobrar.className = ok ? cl.cobrarNegro : cl.cobrarGris; }
    var conf = porTexto(doc, "button", /Confirmar cobro/);
    if (conf) { var ok2 = permiteConfirmar(e); conf.disabled = !ok2; conf.className = ok2 ? cl.confirmarNegro : cl.confirmarGris; }
  }

  function despues(doc, e, ES, herr) {
    var cl = clasesBoton(ES), k = clave(e), base = baseDe(k);
    // 1. Montos, nombre y cantidad según lo que hay en el ticket
    if (base && e.carrito && (base.prod !== e.carrito.prod || base.qty !== e.carrito.qty)) {
      var pb = PROD[base.prod], pn = PROD[e.carrito.prod];
      var a = montos(r2(pb.precio * base.qty)), b = montos(r2(pn.precio * e.carrito.qty));
      textos(doc, function (s) {
        if (base.prod !== e.carrito.prod) s = s.split(pb.nombre).join(pn.nombre);
        return s.split(soles(a.total)).join(soles(b.total)).split(soles(a.sub)).join(soles(b.sub)).split(soles(a.igv)).join(soles(b.igv));
      });
      if (base.prod === e.carrito.prod || base.prod !== e.carrito.prod) {
        var q = doc.querySelector('input[aria-label^="Cantidad de"]'); if (q) q.value = String(e.carrito.qty);
      }
    }
    if (e.carrito && (e.cobro || e.registrada)) textos(doc, function (s) { return e.carrito.qty === 1 ? s : s.replace(/\b1 prenda\b/, e.carrito.qty + " prendas"); });
    // 2. «Hoy» y stock del piso tras una venta
    if (k === "vender_post") textos(doc, function (s) { return s.replace("S/79.90", soles(e.hoy)).replace(/\b4 en piso\b/, (PROD.blusa.piso - e.vendidasBlusa) + " en piso"); });
    // 3. El combo de responsable sustituye la etiqueta del Admin
    var badge = porTexto(doc, "p", /Admin · queda a tu nombre/);
    if (badge && !badge.querySelector("[data-g-combo]")) { var cont = doc.createElement("div"); cont.innerHTML = comboHTML(e); badge.replaceWith(cont.firstChild); }
    var combo = doc.querySelector("[data-g-combo]");
    if (e.respAbierto && combo) { doc.body.insertAdjacentHTML("beforeend", listaHTML(e, combo.getBoundingClientRect())); }
    // 4. Botones y motivo de bloqueo según responsable, método y documento
    pintarBloqueo(doc, e, cl);
    // 5. Lo que la persona ya escribió
    var dni = doc.getElementById("documento-numero"); if (dni && e.dni) dni.value = e.dni;
    var nom = doc.querySelector('input[placeholder*="ombre"], input[id*="nombre"]'); if (nom && e.nombre) nom.value = e.nombre;
    // 6. Globo de ayuda del DNI
    var ayuda = doc.querySelector('button[aria-label="Qué es Consulta de DNI"]');
    if (ayuda) {
      ayuda.className = e.ayuda ? cl.ayudaAbierta : cl.ayudaCerrada;
      var viejo = ayuda.parentElement.querySelector(".anim-globo"); if (viejo) viejo.remove();
      if (e.ayuda && cl.globo) ayuda.insertAdjacentHTML("afterend", cl.globo);
    }
    // 7. Venta registrada: el aviso verde de la captura se va solo, como en el ERP real (~4 s)
    if (e.registrada) setTimeout(function () { var av = doc.querySelector('div[aria-live="polite"]'); if (av) av.innerHTML = ""; }, 4200);
    // 8. Venta registrada: medio, comprobante, cliente y hora de esta venta
    if (e.registrada && e.venta) {
      var v = e.venta, nombreCli = v.nombre || (v.dni.length === 8 ? "DNI " + v.dni : "Cliente varios");
      var serie = v.comp === "factura" ? "F001-000001" : v.comp === "nota" ? "NV-000001" : "B001-000013";
      var tipo = v.comp === "factura" ? "Factura" : v.comp === "nota" ? "Nota de venta" : "Boleta";
      var ahora = new Date(), p2 = function (n) { return (n < 10 ? "0" : "") + n; };
      var fecha = p2(ahora.getDate()) + "/" + p2(ahora.getMonth() + 1) + "/" + ahora.getFullYear() + " " + p2(ahora.getHours()) + ":" + p2(ahora.getMinutes());
      textos(doc, function (s) {
        if (v.metodo !== "yape") s = s.replace(/^Yape$/, ETIQ_METODO[v.metodo]);
        if (tipo !== "Boleta") s = s.replace("B001-000013", serie).replace(/^Boleta\b/, tipo);
        return s.replace("Cliente varios", nombreCli).replace(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/, fecha);
      });
    }
  }

  /* ── Clics ──────────────────────────────────────────────────────────────────────────────────────── */
  function alClic(ev, e, herr) {
    var el = ev.target.closest ? ev.target.closest('button,a,[role="button"],[role="option"],summary,label,input,select,textarea') : null;
    var cambio = false;
    e.aviso = null;
    if (e.ayuda && !(el && el.getAttribute("aria-label") === "Qué es Consulta de DNI")) { e.ayuda = false; cambio = true; }
    if (!el) { if (e.respAbierto) { e.respAbierto = false; return true; } return cambio; }
    if (el.hasAttribute("data-g-opt")) { e.resp = el.getAttribute("data-g-opt"); e.respAbierto = false; return true; }
    if (el.hasAttribute("data-g-combo")) { e.respAbierto = !e.respAbierto; return true; }
    if (e.respAbierto) { e.respAbierto = false; cambio = true; }

    var t = norm(el.textContent), aria = el.getAttribute("aria-label") || "", atajo = el.getAttribute("aria-keyshortcuts") || "";
    var esBoton = el.tagName === "BUTTON" || el.tagName === "A" || el.getAttribute("role") === "button";
    var noDisp = function (aviso) { e.aviso = aviso || "no_disponible"; herr.toast("En esta práctica eso no está disponible."); return true; };

    // — Menú lateral y cabecera
    if (el.closest("#lateral")) {
      if (t === "Punto de Venta") { e.pant = "vender"; return true; }
      if (t === "Inicio") { e.pant = "inicio"; return true; }
      if (t === "Ventas") return cambio;
      return esBoton ? noDisp() : cambio;
    }
    if (aria === "Cambiar de ubicación") { e.aviso = "sede"; herr.toast("En esta práctica trabajas en Tienda Trujillo."); return true; }
    // — Inicio
    if (e.pant === "inicio") { if (t === "Vender") { e.pant = "vender"; return true; } return esBoton ? noDisp() : cambio; }
    // — Venta registrada
    if (e.registrada) {
      if (t === "Imprimir y nueva venta" || t === "Sin imprimir") {
        if (t === "Imprimir y nueva venta") herr.toast("Se envió a la impresora (en la práctica no sale papel).");
        var tot = e.venta.total; e.hoy = r2(e.hoy + tot); if (e.venta.prod === "blusa") e.vendidasBlusa += e.venta.qty;
        e.registrada = false; e.cobro = false; e.carrito = null; e.metodo = null; e.comp = "boleta"; e.dni = ""; e.nombre = ""; e.terminado = true; return true;
      }
      if (t === "Solo imprimir") { herr.toast("Se envió a la impresora (en la práctica no sale papel)."); return cambio; }
      return cambio;
    }
    // — Cobro
    if (e.cobro) {
      if (METODOS[atajo]) { e.metodo = e.metodo === METODOS[atajo] ? null : METODOS[atajo]; return true; }
      if (COMP[t] && el.tagName === "BUTTON") {
        if (!e.metodo && COMP[t] !== "boleta") { herr.toast("Primero elige cómo pagó la clienta."); return cambio; }
        e.comp = COMP[t]; if (e.comp === "factura") e.dni = ""; return true;
      }
      if (aria === "Qué es Consulta de DNI") { e.ayuda = !e.ayuda; return true; }
      if (/Ticket/.test(t) && el.tagName === "BUTTON" && t.length < 12) { e.cobro = false; return true; }
      if (/Confirmar cobro/.test(t)) {
        if (!permiteConfirmar(e)) return cambio;
        var p = PROD[e.carrito.prod]; e.venta = { prod: e.carrito.prod, qty: e.carrito.qty, metodo: e.metodo, comp: e.comp, dni: e.dni, nombre: e.nombre, resp: e.resp, total: r2(p.precio * e.carrito.qty) };
        e.registrada = true; return true;
      }
      return esBoton && !el.closest("form") ? noDisp() : cambio;
    }
    // — Punto de venta (catálogo + ticket)
    var ids = Object.keys(PROD);
    for (var i = 0; i < ids.length; i++) {
      var pr = PROD[ids[i]];
      if (aria === pr.aria) {
        if (e.carrito && e.carrito.prod === ids[i]) { if (e.carrito.qty < pr.max) e.carrito.qty++; else herr.toast("Máximo disponible en sede: " + pr.max + "."); }
        else e.carrito = { prod: ids[i], qty: 1 };
        return true;
      }
    }
    if (/^Talla .* en el almacén/.test(aria)) { e.aviso = "talla_almacen"; herr.toast("Esa talla está en el almacén, no en el piso de venta."); return true; }
    if (/^Quitar /.test(aria)) { e.carrito = null; return true; }
    if (aria === "Aumentar cantidad" && e.carrito) { var pa = PROD[e.carrito.prod]; if (e.carrito.qty < pa.max) e.carrito.qty++; else herr.toast("Máximo disponible en sede: " + pa.max + "."); return true; }
    if (aria === "Reducir cantidad" && e.carrito) { e.carrito.qty--; if (e.carrito.qty < 1) e.carrito = null; return true; }
    if (/^Cobrar/.test(t) && el.tagName === "BUTTON") { if (e.carrito && e.resp) { e.cobro = true; return true; } return cambio; }
    if (/^Apartar/.test(t) || t === "Apartados") { e.aviso = "apartar"; herr.toast("Apartar guarda la prenda para una clienta sin cobrarla. En esta práctica esa pantalla no está."); return true; }
    if (t === "Desc." || /Aplicar descuento/.test(t) || /^Descuento/.test(aria)) { e.aviso = "descuento"; herr.toast("Los descuentos no se usan en esta práctica."); return true; }
    if (/Agregar clienta/.test(t)) { e.aviso = "clienta"; herr.toast("La clienta no quiere dar sus datos: aquí no se agrega."); return true; }
    if (/Dejar en espera/.test(t)) { e.aviso = "espera"; herr.toast("Dejar en espera no se usa en esta práctica."); return true; }
    return esBoton ? noDisp() : cambio;
  }
  function alInput(ev, e) {
    var i = ev.target;
    if (i.id === "documento-numero") {
      var max = e.comp === "factura" ? 11 : 8; e.dni = soloDigitos(i.value).slice(0, max); if (i.value !== e.dni) i.value = e.dni;
    } else if (/nombre|razón/i.test((i.id || "") + (i.placeholder || ""))) e.nombre = i.value;
    // Habilita o no «Confirmar cobro» sin volver a dibujar (así no se pierde el foco al escribir)
    var doc = i.ownerDocument, cl = cache, conf = porTexto(doc, "button", /Confirmar cobro/);
    if (conf && cl.listo) { var ok = permiteConfirmar(e); conf.disabled = !ok; conf.className = ok ? cl.confirmarNegro : cl.confirmarGris; }
    var hint = doc.getElementById("ticket-motivo-bloqueo"); if (hint) { var m = motivoBloqueo(e); hint.textContent = m; var g = hint.parentElement; if (g) { g.classList.toggle("grid-rows-[1fr]", !!m); g.classList.toggle("grid-rows-[0fr]", !m); } }
  }
  function alEscape(e) { if (e.respAbierto || e.ayuda) { e.respAbierto = false; e.ayuda = false; return true; } return false; }

  /* ── Guía: en qué etapa real está la persona, qué se equivocó y qué resaltar ─────────────────────── */
  function etapa(e) {
    if (e.registrada) return "cerrar";
    if (e.pant === "inicio") return "vender";
    if (!carritoOk(e)) return "talla";
    if (!e.resp) return "responsable";
    if (!e.cobro) return "cobrar";
    if (!e.metodo) return "pago";
    return "confirmar";
  }
  function desvios(e) {
    var d = [];
    if (e.carrito && !carritoOk(e)) d.push(e.carrito.prod !== "blusa" ? "prenda_equivocada" : "cantidad_equivocada");
    if (e.cobro && e.metodo && e.metodo !== "yape") d.push("pago_equivocado");
    if (e.cobro && e.comp !== "boleta") d.push("comprobante_equivocado");
    if (e.cobro && e.dni) d.push("dni_escrito");
    if (e.aviso) d.push(e.aviso);
    return d;
  }
  function objetivo(et, doc, e) {
    var por = function (sel) { return doc.querySelector(sel); };
    if (et === "vender") return porTexto(doc, "a,button", /^Vender$/) || porTexto(doc, "aside a", /Punto de Venta/);
    if (et === "talla") return (e.carrito && !carritoOk(e)) ? (por('button[aria-label^="Quitar"]') || por("button")) : por('button[aria-label="' + PROD.blusa.aria + '"]');
    if (et === "responsable") return e.respAbierto ? por('[data-g-opt="' + RESPONSABLE + '"]') : por("[data-g-combo]");
    if (et === "cobrar") return porTexto(doc, "button", /^Cobrar/);
    if (et === "pago") return por('button[aria-keyshortcuts="F3"]');
    if (et === "confirmar") {
      if (e.metodo !== "yape") return por('button[aria-keyshortcuts="F3"]');
      if (e.comp !== "boleta") return porTexto(doc, "button", /^Boleta$/);
      if (e.dni) return doc.getElementById("documento-numero");
      return porTexto(doc, "button", /Confirmar cobro/);
    }
    if (et === "cerrar") return porTexto(doc, "button", /^Sin imprimir$/);
    return null;
  }
  function terminado(e) { return !!e.terminado; }
  function resultado(e) {
    var v = e.venta || {}, f = [];
    if (v.prod !== "blusa") f.push("prenda");
    if (v.qty !== 1) f.push("cantidad");
    if (v.metodo !== "yape") f.push("pago");
    if (v.comp !== "boleta") f.push("comprobante");
    if (v.dni) f.push("dni");
    if (v.resp !== RESPONSABLE) f.push("responsable");
    return { ok: f.length === 0, fallos: f };
  }

  window.REPLICA = { inicial: inicial, render: render, despues: despues, alClic: alClic, alInput: alInput, alEscape: alEscape, etapa: etapa, desvios: desvios, objetivo: objetivo, terminado: terminado, resultado: resultado };
})();
