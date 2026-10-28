/* Motor de la guía interactiva de /flujo-de-negocio.
 *
 * CONTRATO. Recibe tres cosas, todas ya incrustadas en el mismo archivo HTML (nada se pide por internet):
 *   · DATOS:  el CSS real del ERP, las clases del <html>/<body> y una captura del HTML real de cada estado de pantalla.
 *   · GUION:  los textos de la práctica (intro, barra, una ficha por etapa, desvíos, final). Los escribe un subagente al construir
 *             el archivo a partir de la corrida real; dentro del archivo son texto fijo: no hay IA en vivo, ni internet, ni costo.
 *   · REPLICA: las reglas de ESE flujo (qué hace cada clic, en qué etapa va la persona, qué cuenta como hecho bien).
 * Promete: la persona intenta sola («hazlo tú primero»); si pulsa «No sé qué más hacer», la guía la acompaña de a una acción,
 * mirando en qué etapa real está; puede dejar comentarios cuando quiera, que se guardan en su navegador y al final copia como texto.
 * No hace: enviar nada a ningún lado. Los comentarios solo salen cuando la persona los copia y los pega donde quiera.
 */
(function () {
  "use strict";
  var leer = function (id) { return JSON.parse(document.getElementById(id).textContent); };
  var D = leer("g-datos"), G = leer("g-guion"), R = window.REPLICA;
  var $ = function (id) { return document.getElementById(id); };
  var CLAVE = "cayla-guia:" + (G.caso && G.caso.id ? G.caso.id : "caso");

  var est = R.inicial();
  var fase = "intro"; // intro | intento | guia | fin
  var doc = null, pistaVista = false, guiaMin = false, yaMostroFin = false;

  /* ── Comentarios: se guardan en el navegador de quien practica; nunca viajan solos ────────────────── */
  var comentarios = [];
  try { comentarios = JSON.parse(localStorage.getItem(CLAVE) || "[]"); } catch (e) { comentarios = []; }
  function guardarComentarios() { try { localStorage.setItem(CLAVE, JSON.stringify(comentarios)); } catch (e) { /* sin almacenamiento: quedan en memoria */ } }
  function contexto() {
    if (fase === "intro") return "Antes de empezar";
    if (fase === "fin") return "Al terminar";
    if (fase === "intento") return "Mientras lo intentaba solo/a";
    var e = G.etapas[R.etapa(est)];
    return e ? "Paso " + e.paso + " · " + e.titulo : "Durante la guía";
  }
  function textoCopiable() {
    var t = "Comentarios de la práctica «" + (G.caso ? G.caso.titulo : "") + "»\n" + new Date().toLocaleString("es-PE") + "\n\n";
    if (!comentarios.length) return t + "(sin comentarios)\n";
    comentarios.forEach(function (c) { t += "[" + c.donde + "] " + c.texto + "\n\n"; });
    return t.trim() + "\n";
  }
  function copiar(texto, boton, etiqueta) {
    function listo() { if (boton) { boton.textContent = G.comentarios.copiado; setTimeout(function () { boton.textContent = etiqueta; }, 2200); } }
    function respaldo() {
      var ta = document.createElement("textarea"); ta.value = texto; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); listo(); } catch (e) { if (boton) boton.textContent = G.comentarios.copiarManual; }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(texto).then(listo, respaldo); else respaldo();
  }
  function pintarComentarios() {
    var l = $("g-lista-coment"); l.innerHTML = "";
    comentarios.forEach(function (c, i) {
      var d = document.createElement("div"); d.className = "g-item";
      var s = document.createElement("small"); s.textContent = c.donde;
      var p = document.createElement("div"); p.textContent = c.texto;
      var b = document.createElement("button"); b.type = "button"; b.textContent = "Borrar";
      b.onclick = function () { comentarios.splice(i, 1); guardarComentarios(); pintarComentarios(); };
      d.appendChild(s); d.appendChild(p); d.appendChild(b); l.appendChild(d);
    });
    var n = $("g-n-coment"); n.textContent = comentarios.length; n.hidden = comentarios.length === 0;
    $("g-vacio-coment").hidden = comentarios.length > 0;
  }

  /* ── El ERP dentro del iframe ────────────────────────────────────────────────────────────────────── */
  var herr = {
    toast: function (msg) {
      if (!doc) return;
      var t = doc.createElement("div"); t.className = "g-toast"; t.setAttribute("role", "status"); t.textContent = msg;
      doc.body.appendChild(t); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4200);
    },
  };

  function ring() {
    if (!doc) return;
    var viejo = doc.getElementById("g-ring"); if (viejo) viejo.parentNode.removeChild(viejo);
    if (fase !== "guia") return;
    var el = R.objetivo(R.etapa(est), doc, est); if (!el) return;
    var r = doc.createElement("div"); r.id = "g-ring"; doc.body.appendChild(r);
    function colocar() {
      var b = el.getBoundingClientRect(); if (!b.width) { r.style.display = "none"; return; }
      r.style.display = "block";
      r.style.left = (b.left - 5) + "px"; r.style.top = (b.top - 5) + "px"; r.style.width = (b.width + 10) + "px"; r.style.height = (b.height + 10) + "px";
    }
    try { el.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) { /* sin scroll */ }
    colocar(); doc.defaultView.onresize = colocar; doc.addEventListener("scroll", colocar, true);
    // Un modal entra con animación: se mide otra vez cuando termina, para que el aro caiga sobre el botón y no sobre donde estaba.
    doc.addEventListener("animationend", colocar, true); setTimeout(colocar, 350); setTimeout(colocar, 900);
  }

  function pintarGuia() {
    var g = $("g-guia");
    if (fase !== "guia") { g.hidden = true; return; }
    var clave = R.etapa(est), e = G.etapas[clave];
    g.hidden = false; g.className = "g-tarjeta g-flota" + (guiaMin ? " g-min" : "");
    if (!e) { g.textContent = ""; return; }
    var total = G.caso.totalPasos, hechos = Math.max(0, e.paso - 1), barra = "";
    for (var i = 0; i < total; i++) barra += i < hechos ? "▰" : "▱";
    var h = "";
    h += '<div class="g-cab"><span class="g-paso">Paso ' + e.paso + " de " + total + '</span><span class="g-barra-prog" aria-hidden="true">' + barra + '</span>' +
      '<button type="button" class="g-btn g-sec" id="g-min" style="height:28px;padding:0 9px;font-size:12px">' + (guiaMin ? "Abrir guía" : "Minimizar") + "</button></div>";
    h += "<h2>" + esc(e.titulo) + "</h2>";
    R.desvios(est).forEach(function (k) {
      var d = G.desvios[k]; if (d) h += '<div class="g-aviso g-desvio">⚠ <b>' + esc(d.mensaje) + "</b> " + esc(d.comoVolver || "") + "</div>";
    });
    h += '<div class="g-fila"><span aria-hidden="true">📍</span><span><b>Dónde estás:</b> ' + esc(e.donde) + "</span></div>";
    h += '<div class="g-haz">👉 <b>Sigue aquí:</b> ' + esc(e.haz) + "</div>";
    if (e.porque) h += '<div class="g-fila"><span aria-hidden="true">💡</span><span>' + esc(e.porque) + "</span></div>";
    (e.avisos || []).forEach(function (a) { h += '<div class="g-aviso">🔔 ' + esc(a) + "</div>"; });
    if (pistaVista && e.pista) h += '<div class="g-pista">' + esc(e.pista) + "</div>";
    h += '<div class="g-pie"><button type="button" class="g-btn g-sec" id="g-pista">' + esc(G.barra.pista) + '</button>' +
      '<button type="button" class="g-btn g-sec" id="g-coment-abrir2">' + esc(G.barra.comentar) + "</button></div>";
    g.innerHTML = h;
    $("g-min").onclick = function () { guiaMin = !guiaMin; pintarGuia(); };
    $("g-pista").onclick = function () { pistaVista = true; pintarGuia(); };
    $("g-coment-abrir2").onclick = abrirComentarios;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var etapaAnterior = null;
  function render() {
    doc.body.innerHTML = R.render(est, D.estados);
    R.despues(doc, est, D.estados, herr);
    var e = R.etapa(est); if (e !== etapaAnterior) { pistaVista = false; etapaAnterior = e; }
    ring(); pintarGuia(); comprobarFin();
  }

  function comprobarFin() {
    if (fase === "fin" || yaMostroFin || !R.terminado(est)) return;
    yaMostroFin = true; setTimeout(mostrarFin, 500);
  }
  function mostrarFin() {
    fase = "fin"; $("g-guia").hidden = true; $("g-coment").hidden = true; $("g-barra").hidden = true;
    var res = R.resultado(est), F = G.fin;
    var h = '<span class="g-etiqueta">' + esc(F.etiqueta) + "</span><h1>" + esc(res.ok ? F.tituloOk : F.tituloConDetalles) + "</h1>";
    h += '<div class="g-resultado' + (res.ok ? "" : " g-mal") + '">' + esc(res.ok ? F.resultadoOk : F.resultadoConDetalles) +
      (res.fallos.length ? "<ul style='margin:8px 0 0'>" + res.fallos.map(function (k) { return "<li>" + esc((G.fallos && G.fallos[k]) || k) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
    if (F.aprendiste && F.aprendiste.length) h += "<p><b>" + esc(F.aprendisteTitulo) + "</b></p><ul>" + F.aprendiste.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>";
    h += "<p>" + esc(F.pregunta) + "</p>";
    h += '<textarea id="g-fin-nuevo" class="g-copia" style="min-height:70px" placeholder="' + esc(G.comentarios.placeholder) + '"></textarea>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><button type="button" class="g-btn g-sec" id="g-fin-guardar">' + esc(G.comentarios.guardar) + "</button></div>";
    h += "<p style='margin-top:14px'><b>" + esc(G.comentarios.titulo) + "</b> — " + esc(G.comentarios.finAyuda) + "</p>";
    h += '<textarea id="g-fin-texto" class="g-copia" readonly></textarea>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="g-btn" id="g-fin-copiar">' + esc(G.comentarios.copiar) + '</button>' +
      '<button type="button" class="g-btn g-sec" id="g-fin-reiniciar">' + esc(F.reiniciar) + "</button></div>";
    var v = $("g-fin"); v.querySelector(".g-tarjeta").innerHTML = h; v.hidden = false;
    function refrescar() { $("g-fin-texto").value = textoCopiable(); }
    refrescar();
    $("g-fin-guardar").onclick = function () { var t = $("g-fin-nuevo").value.trim(); if (!t) return; comentarios.push({ donde: "Al terminar", texto: t, cuando: Date.now() }); guardarComentarios(); pintarComentarios(); $("g-fin-nuevo").value = ""; refrescar(); };
    $("g-fin-copiar").onclick = function () { refrescar(); copiar($("g-fin-texto").value, $("g-fin-copiar"), G.comentarios.copiar); $("g-fin-texto").select(); };
    $("g-fin-reiniciar").onclick = reiniciar;
  }

  function reiniciar() {
    est = R.inicial(); fase = "intento"; yaMostroFin = false; etapaAnterior = null; guiaMin = false;
    $("g-fin").hidden = true; $("g-barra").hidden = false; $("g-no-se").hidden = false; render();
  }

  /* ── Eventos dentro del ERP ──────────────────────────────────────────────────────────────────────── */
  function conectar() {
    doc.addEventListener("click", function (e) {
      var cambia = R.alClic(e, est, herr);
      var interactivo = e.target.closest && e.target.closest("a,button,[role=button],summary,label,input,select,textarea");
      if (interactivo && interactivo.tagName !== "INPUT" && interactivo.tagName !== "TEXTAREA") { e.preventDefault(); e.stopPropagation(); }
      if (cambia) render();
    }, true);
    doc.addEventListener("input", function (e) { if (R.alInput) R.alInput(e, est); pintarGuia(); }, true);
    doc.addEventListener("submit", function (e) { e.preventDefault(); }, true);
    doc.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target && e.target.tagName === "INPUT") e.preventDefault(); if (e.key === "Escape" && R.alEscape && R.alEscape(est)) render(); }, true);
  }

  /* ── Fases y botones de la práctica ──────────────────────────────────────────────────────────────── */
  function abrirComentarios() { $("g-coment").hidden = false; $("g-ctx").textContent = contexto(); $("g-texto-coment").focus(); }
  function iniciarUI() {
    $("g-tarea").innerHTML = G.barra.tarea;
    $("g-no-se").textContent = G.barra.noSe;
    $("g-lbl-coment").textContent = G.barra.comentar;
    $("g-intro-titulo").textContent = G.intro.titulo;
    $("g-intro-cuerpo").innerHTML = G.intro.parrafos.map(function (p) { return "<p>" + p + "</p>"; }).join("") +
      (G.intro.lista ? "<ul>" + G.intro.lista.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>" : "");
    $("g-intro-empezar").textContent = G.intro.boton;
    $("g-coment-titulo").textContent = G.comentarios.titulo; $("g-coment-sub").textContent = G.comentarios.ayuda;
    $("g-vacio-coment").textContent = G.comentarios.vacio; $("g-texto-coment").placeholder = G.comentarios.placeholder;
    $("g-coment-guardar").textContent = G.comentarios.guardar; $("g-coment-copiar").textContent = G.comentarios.copiar; $("g-coment-cerrar").textContent = G.comentarios.cerrar;
    $("g-angosta-txt").textContent = G.angosta;
    pintarComentarios();

    $("g-intro-empezar").onclick = function () { fase = "intento"; $("g-intro").hidden = true; $("g-barra").hidden = false; render(); };
    $("g-no-se").onclick = function () { fase = "guia"; guiaMin = false; $("g-no-se").hidden = true; render(); };
    $("g-abrir-coment").onclick = abrirComentarios;
    $("g-coment-cerrar").onclick = function () { $("g-coment").hidden = true; };
    $("g-coment-guardar").onclick = function () {
      var t = $("g-texto-coment").value.trim(); if (!t) return;
      comentarios.push({ donde: contexto(), texto: t, cuando: Date.now() }); guardarComentarios(); pintarComentarios(); $("g-texto-coment").value = "";
    };
    $("g-coment-copiar").onclick = function () { copiar(textoCopiable(), $("g-coment-copiar"), G.comentarios.copiar); };
    $("g-texto-coment").addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") $("g-coment-guardar").click(); });
  }

  function montarERP() {
    var marco = $("g-erp");
    var cssIframe =
      "#g-ring{position:fixed;z-index:2147483000;border:3px solid #b8412d;border-radius:14px;pointer-events:none;box-shadow:0 0 0 4px rgba(184,65,45,.18);animation:g-pulso 1.6s ease-in-out infinite}" +
      "@keyframes g-pulso{0%,100%{box-shadow:0 0 0 3px rgba(184,65,45,.22)}50%{box-shadow:0 0 0 9px rgba(184,65,45,.06)}}" +
      ".g-toast{position:fixed;z-index:2147483100;top:16px;right:16px;max-width:340px;padding:12px 14px;border-radius:12px;background:#1a1a18;color:#f5f0e8;font:500 13.5px/1.4 'DM Sans',system-ui,sans-serif;animation:g-entra .2s ease both}" +
      "@keyframes g-entra{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}" +
      "@media (prefers-reduced-motion:reduce){#g-ring,.g-toast{animation:none}}";
    marco.onload = function () { doc = marco.contentDocument; conectar(); render(); };
    marco.srcdoc = "<!doctype html><html lang=\"es\" class=\"" + D.htmlClase + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<style>" + D.css + "</style><style>" + cssIframe + "</style></head><body class=\"" + D.bodyClase + "\"></body></html>";
  }

  iniciarUI(); montarERP();
  window.__guia = { estado: function () { return est; }, fase: function () { return fase; }, comentarios: function () { return comentarios; } }; // solo para pruebas
})();
