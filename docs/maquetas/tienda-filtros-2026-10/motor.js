// El motor de la maqueta de filtros (2026-10-25): dibuja la lista de la tienda (cabecera, categorías, orden, tarjetas, páginas) y conecta
// la lógica pura (`logica.js`) con la página. Las dos opciones lo comparten: cada una solo dibuja SUS controles de color y talla
// dentro de las zonas que el motor le deja y llama a la misma API. Nada de esto cambia entre una opción y otra.
//
//   window.OPCION = { nombre: "…", montar(motor) { … } }   ← lo define cada opción, ANTES de cargar este archivo
//
//   motor.datos()            → { estado, conteos, opciones, muertas, total }   (lo que hay que dibujar ahora)
//   motor.alternar(faceta, valor)   faceta: "color" | "talla"; devuelve false si esa opción daría 0 (no se suma)
//   motor.limpiar(faceta?)          sin faceta: quita color y talla
//   motor.alCambiar(fn)             fn(datos) se llama ahora y tras cada cambio (de cualquier origen)
//   motor.slot("filtros")           la zona DENTRO de la barra pegada, bajo las categorías
//   motor.slot("seleccion")         la zona bajo la barra (no pegada): para «lo que elegiste»
//   motor.capas()                   la capa fuera del lienzo para hojas y paneles flotantes (ver `#capas` en base.css)
//   motor.conservarFoco(el, fn)     ejecuta fn y devuelve el foco al mismo control (por data-id) si se volvió a dibujar
//   motor.etiquetaTalla(k)          «UNICA» → «Estándar / única»; las demás, tal cual
//   motor.vista                     "escritorio" | "celular" (el viewport emulado de la barra de revisión)
(function () {
  "use strict";
  var T = window.TIENDA;
  var LG = window.LOGICA;
  var M = LG.crear(T);
  var RAIZ = document.currentScript ? document.currentScript.src.replace(/[^/]*$/, "") : "";
  var FOTOS = "https://vovjyyiafkxteijimpuy.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/";
  var OPTIMIZADA = "https://tienda.cayla.pe/_next/image?w=640&q=75&url=";
  var OPCIONES = [
    ["opcion-1.html", "Opción 1 · Filtros que se abren"],
    ["opcion-2.html", "Opción 2 · La paleta a la vista"],
  ];

  var params = new URLSearchParams(location.search);
  var vista = params.get("vista") === "celular" ? "celular" : "escritorio";
  var sinBarra = params.has("previa");
  document.body.dataset.vista = vista;

  // Las letras de la tienda (iguales en las dos opciones).
  var fuentes = document.createElement("link");
  fuentes.rel = "stylesheet";
  fuentes.href = "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Newsreader:ital,opsz,wght@1,6..72,300..500&family=EB+Garamond:wght@500&display=swap";
  document.head.appendChild(fuentes);

  var estado = M.estadoVacio();
  var suscriptores = [];
  var avisoTimer = null, toastTimer = null, ultimoGrupoCats = "~";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var calma = function () { return matchMedia("(prefers-reduced-motion: reduce)").matches; };

  var svg = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 8h16M4 16h16"/></svg>',
    bolsa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    cuenta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
    corazon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg>',
    orden: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 4v16M8 4 4 8M8 4l4 4M16 20V4M16 20l-4-4M16 20l4-4"/></svg>',
    percha: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M12 6a2 2 0 1 1 2 2c-1 .5-2 1-2 2v1M12 11 3 17h18l-9-6Z"/></svg>',
  };

  // --- Estado y dirección ------------------------------------------------------------------------------------------------
  function datos() {
    var res = M.resultados(estado);
    return { estado: M.copia(estado), conteos: M.conteos(estado), opciones: M.opciones(estado), muertas: M.muertas(estado), total: res.length, resultados: res };
  }
  function nombreNivel() {
    if (estado.cat) return estado.cat;
    var g = T.grupos.filter(function (x) { return x.id === estado.grupo; })[0];
    return g ? g.nombre : "esta lista";
  }
  // «Verde», «la talla M», «la talla Estándar / única»: lo que se soltó, dicho con el mismo nombre que ven en los controles.
  function lo(s) {
    return s.color.map(function (id) { return M.famNombre[id]; }).concat(s.talla.map(function (t) { return "la talla " + LG.etiquetaTalla(t); }));
  }
  function ni(a) {
    return a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " ni " + a[a.length - 1];
  }
  function y(a) {
    return a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " y " + a[a.length - 1];
  }
  // «lo quitamos» / «la quitamos» / «los quitamos»: concuerda con lo soltado.
  function quitamos(s) {
    var n = s.color.length + s.talla.length;
    return n > 1 ? "los quitamos" : s.talla.length ? "la quitamos" : "lo quitamos";
  }

  function aplicar(r, tipo) {
    estado = r.estado;
    clearTimeout(avisoTimer);
    var zona = $("aviso");
    zona.innerHTML = "";
    if (r.soltoAlgo) {
      var s = r.soltado;
      var texto = tipo === "quitar"
        ? "También quitamos " + y(lo(s)) + ": ya no sumaba nada con lo que dejaste."
        : nombreNivel() + " no tiene " + ni(lo(s)) + ": " + quitamos(s) + ".";
      zona.innerHTML = '<div class="t-aviso"><p>' + esc(texto) + '</p><button type="button" data-deshacer>Deshacer</button></div>';
      var antes = r.antes;
      zona.firstChild.querySelector("[data-deshacer]").addEventListener("click", function () {
        estado = antes;
        zona.innerHTML = "";
        pintar();
        alInicioDeLaLista();
      });
      avisoTimer = setTimeout(function () { zona.innerHTML = ""; }, 9000);
    }
    pintar();
    alInicioDeLaLista();
  }

  // Como `FiltrosDeLista` en la tienda: si la barra ya está pegada (se venía mirando más abajo), la vista vuelve al comienzo de la lista.
  function alInicioDeLaLista() {
    var marca = document.querySelector(".t-filtros-marca");
    if (!marca) return;
    var arriba = marca.getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > arriba + 1) window.scrollTo({ top: arriba, behavior: "instant" });
  }

  // --- Dibujo ------------------------------------------------------------------------------------------------------------
  function cuerpo() {
    return (
      '<header class="t-cab"><div class="t-cab-fila">' +
      '<button class="t-ico t-solo-movil" aria-label="Abrir el menú" type="button">' + svg.menu + "</button>" +
      '<a class="t-nav-b" href="#">Lo nuevo</a><a class="t-nav-b" href="#">Ropa</a><a class="t-nav-b" href="#">Accesorios</a><a class="t-nav-b t-nav-sec" href="#">Looks</a><a class="t-nav-b t-nav-sec" href="#">Ofertas</a>' +
      '<a class="t-logo" href="#" aria-label="CAYLA"><img src="' + RAIZ + 'cayla-isotipo.png" alt=""><span>CAYLA</span></a>' +
      '<div class="t-cab-der"><a class="t-nav-b" href="#">' + esc(T.sede) + " ▾</a>" +
      '<button class="t-ico" aria-label="Tu bolsa" type="button">' + svg.bolsa + '</button><button class="t-ico" aria-label="Entrar o crear mi cuenta" type="button">' + svg.cuenta + "</button></div>" +
      "</div></header>" +
      '<main class="t-ancho">' +
      '<div class="t-lista-cab"><span class="t-ceja">Catálogo</span><h1>Toda la tienda</h1></div>' +
      '<span class="t-filtros-marca" aria-hidden="true"></span>' +
      '<div class="t-filtros" id="barra"><div class="t-filtros-niveles">' +
      '<div class="t-pildoras" id="grupos" role="group" aria-label="Qué buscas"></div>' +
      '<div class="t-subcats" id="cats" role="group" aria-label="Categorías" hidden></div>' +
      '<div id="slot-filtros"></div></div>' +
      '<div class="t-orden"><button type="button" id="orden" aria-label="Cambiar el orden">' + svg.orden + '<span class="t-orden-rot">Orden:</span> <b></b></button></div></div>' +
      '<div id="slot-seleccion"></div>' +
      '<div class="t-aviso-zona" id="aviso" role="status" aria-live="polite"></div>' +
      '<p class="t-conteo" id="resultado" aria-live="polite"></p>' +
      '<div class="t-grilla" id="grilla"></div>' +
      '<nav class="t-paginas" id="paginas" aria-label="Páginas"></nav>' +
      "</main>" +
      '<footer class="t-pie-maqueta">Maqueta con datos reales de tienda.cayla.pe (' + esc(T.sede) + ", " + esc(T.hoy) + "): " + T.prendas.length + " prendas del listado, las que tienen unidades en la tienda se pueden filtrar. Precios de lista. Nada se guarda ni se manda.</footer>"
    );
  }

  function pintarGrupos(c) {
    var cont = $("grupos");
    if (!cont.children.length) {
      cont.innerHTML = '<button type="button" class="t-pildora" data-g="">Todo <small></small></button>' +
        T.grupos.map(function (g) { return '<button type="button" class="t-pildora" data-g="' + g.id + '">' + esc(g.nombre) + " <small></small></button>"; }).join("");
    }
    var todo = Object.keys(c.grupo).reduce(function (s, k) { return s + c.grupo[k]; }, 0);
    Array.prototype.forEach.call(cont.querySelectorAll("[data-g]"), function (b) {
      var g = b.dataset.g || null;
      var n = g ? c.grupo[g] : todo;
      b.setAttribute("aria-current", String(estado.grupo === g));
      b.querySelector("small").textContent = n;
      b.dataset.cero = String(n === 0);
    });
  }

  function pintarCats(c) {
    var cont = $("cats");
    if (!estado.grupo) { cont.hidden = true; cont.innerHTML = ""; ultimoGrupoCats = "~"; return; }
    var g = T.grupos.filter(function (x) { return x.id === estado.grupo; })[0];
    cont.hidden = false;
    if (ultimoGrupoCats !== estado.grupo) {
      var existentes = {};
      T.prendas.forEach(function (p) { if (p.g === g.id) existentes[p.cat] = 1; });
      cont.innerHTML = '<button type="button" class="t-subcat" data-k="">Todo <small></small></button>' +
        g.cats.filter(function (k) { return existentes[k]; }).map(function (k) { return '<button type="button" class="t-subcat" data-k="' + esc(k) + '">' + esc(k) + " <small></small></button>"; }).join("");
      cont.removeAttribute("data-nueva");
      void cont.offsetWidth;
      if (!calma()) cont.setAttribute("data-nueva", "");
      ultimoGrupoCats = estado.grupo;
    }
    Array.prototype.forEach.call(cont.querySelectorAll("[data-k]"), function (b) {
      var k = b.dataset.k || null;
      var n = k ? c.cat[k] || 0 : c.grupo[g.id];
      b.setAttribute("aria-current", String(estado.cat === k));
      b.querySelector("small").textContent = n;
      b.dataset.cero = String(n === 0);
    });
  }

  function fraseTallas(arr) {
    var t = arr.map(function (k) { return LG.etiquetaTalla(k); });
    return t.length === 1 ? "talla " + t[0] : "tallas " + t.join(", ");
  }

  function tarjeta(p) {
    var nota = M.notaDe(p, estado), co = M.coincidencias(p, estado), mu = M.muestras(p, estado);
    var visibles = mu.slice(0, 5), mas = mu.length - visibles.length;
    var enlace = M.enlaceDe(p, estado);
    var foto = p.foto ? OPTIMIZADA + encodeURIComponent(FOTOS + p.foto) : null;
    var teñido = mu.length ? mu[0].hex : "var(--t-foto)";
    var que = [];
    if (co.colores.length) que.push(co.colores.join(" y "));
    if (co.tallas.length) que.push(fraseTallas(co.tallas));
    var abre = "Abriría «" + p.n + "»" + (que.length ? " con " + que.join(" y ") + " ya elegidos" : "");
    return (
      '<article class="t-card" data-prenda="' + p.id + '"><div class="t-card-media">' +
      '<a class="t-card-enlace" href="#" data-ficha="' + esc(abre) + '" title="' + esc(enlace) + '" tabindex="-1" aria-hidden="true"><span class="t-card-foto' + (foto ? "" : " sin-foto") + '" style="--tono:' + teñido + '">' +
      (foto ? '<img src="' + foto + '" alt="" loading="lazy" onerror="this.parentNode.classList.add(\'sin-foto\')">' : "") +
      '<span class="t-dibujo" style="background:color-mix(in srgb,' + teñido + ' 38%, var(--t-foto))">' + svg.percha + "</span></span></a>" +
      '<button type="button" class="t-corazon" aria-pressed="false" aria-label="Guardar en favoritos: ' + esc(p.n) + '" data-fav>' + svg.corazon + "</button></div>" +
      '<div class="t-card-info"><a class="t-card-nom" href="#" data-ficha="' + esc(abre) + '" title="' + esc(enlace) + '">' + esc(p.n) + "</a>" +
      '<span class="t-precio"><b class="num">S/ ' + p.p.toFixed(2) + "</b></span>" +
      '<div class="t-card-pie"><span class="t-muestras" role="img" aria-label="Colores: ' + esc(mu.map(function (x) { return x.nombre; }).join(", ")) + '">' +
      visibles.map(function (x) { return '<i title="' + esc(x.nombre) + '" style="background:' + x.hex + '"' + (x.elegido ? " data-elegido" : "") + "></i>"; }).join("") +
      (mas > 0 ? "<small>+" + mas + "</small>" : "") + '</span><span class="t-card-nota ' + nota.tono + '">' + esc(nota.texto) + "</span></div>" +
      (que.length ? '<div class="t-card-coincide">En ' + esc(que.join(" · ")) + "</div>" : "") +
      "</div></article>"
    );
  }

  function pintarGrilla(res) {
    var cont = $("grilla");
    var ini = (estado.pagina - 1) * LG.POR_PAGINA;
    if (res.length === 0) {
      cont.innerHTML = '<div class="t-vacio" style="grid-column:1/-1"><h2>No hay prendas con eso</h2><p>Quita un filtro para ver más.</p></div>';
      return;
    }
    cont.innerHTML = res.slice(ini, ini + LG.POR_PAGINA).map(tarjeta).join("");
  }

  function pintarPaginas(total) {
    var n = Math.max(1, Math.ceil(total / LG.POR_PAGINA));
    var cont = $("paginas");
    cont.hidden = n <= 1;
    var h = "";
    for (var i = 1; i <= n; i++) h += '<button type="button" data-p="' + i + '"' + (i === estado.pagina ? ' aria-current="page"' : "") + ' aria-label="Página ' + i + '">' + i + "</button>";
    cont.innerHTML = h;
  }

  function pintar() {
    var d = datos();
    pintarGrupos(d.conteos);
    pintarCats(d.conteos);
    $("orden").querySelector("b").textContent = LG.NOMBRE_ORDEN[estado.orden];
    $("resultado").textContent = d.total + (d.total === 1 ? " prenda" : " prendas") + " en " + T.sede;
    pintarGrilla(d.resultados);
    pintarPaginas(d.total);
    var ser = M.serializar(estado);
    try { history.replaceState(null, "", location.pathname + location.search + (ser ? "#" + ser : "")); } catch (x) { /* sin historial */ }
    var datosOpcion = { estado: d.estado, conteos: d.conteos, opciones: d.opciones, muertas: d.muertas, total: d.total };
    suscriptores.forEach(function (fn) { fn(datosOpcion); });
  }

  // --- La barra de revisión (no es parte del diseño) -------------------------------------------------------------------------
  function barraDeRevision() {
    var actual = location.pathname.split("/").pop();
    var b = document.createElement("div");
    b.className = "rev";
    b.innerHTML =
      '<a class="rev-volver" href="index.html">← Comparar</a>' +
      '<nav class="rev-grupo" aria-label="Opción">' + OPCIONES.map(function (o) { return '<a href="' + o[0] + location.search + '"' + (o[0] === actual ? ' aria-current="page"' : "") + ">" + o[1] + "</a>"; }).join("") + "</nav>" +
      '<nav class="rev-grupo" aria-label="Vista">' + [["escritorio", "Escritorio"], ["celular", "Celular"]].map(function (v) {
        var q = new URLSearchParams(location.search); q.set("vista", v[0]);
        return '<a href="?' + q.toString() + location.hash + '"' + (v[0] === vista ? ' aria-current="page"' : "") + ">" + v[1] + "</a>";
      }).join("") + "</nav>" +
      '<button type="button" id="reiniciar">Reiniciar</button>' +
      '<span class="rev-nota">Datos reales de ' + esc(T.sede) + " · " + esc(T.hoy) + "</span>";
    return b;
  }

  function toast(texto) {
    var capas = $("capas");
    var t = capas.querySelector(".t-toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "t-toast";
      t.setAttribute("role", "status");
      t.style.cssText = "position:absolute;left:50%;bottom:20px;transform:translateX(-50%);max-width:min(92%,420px);padding:12px 16px;background:var(--tinta);color:var(--crema);font:400 13px/1.4 var(--sans);text-align:center";
      capas.appendChild(t);
    }
    t.textContent = texto;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 4200);
  }

  // --- La API que usan las opciones -------------------------------------------------------------------------------------------
  var API = {
    L: M, T: T, vista: vista,
    datos: datos,
    alternar: function (faceta, valor) {
      var r = M.alternar(estado, faceta, valor);
      if (!r.hecho) return false;
      aplicar(r, r.estado[faceta].indexOf(valor) < 0 ? "quitar" : "sumar");
      return true;
    },
    limpiar: function (faceta) { estado = M.limpiar(estado, faceta); $("aviso").innerHTML = ""; pintar(); alInicioDeLaLista(); },
    alCambiar: function (fn) { suscriptores.push(fn); var d = datos(); fn({ estado: d.estado, conteos: d.conteos, opciones: d.opciones, muertas: d.muertas, total: d.total }); },
    slot: function (nombre) { return $("slot-" + nombre); },
    capas: function () { return $("capas"); },
    etiquetaTalla: LG.etiquetaTalla,
    conservarFoco: function (el, fn) {
      var a = document.activeElement;
      var id = a && el.contains(a) ? a.getAttribute("data-id") : null;
      fn();
      if (id) { var n = el.querySelector('[data-id="' + id + '"]'); if (n) n.focus({ preventScroll: true }); }
    },
    toast: toast,
  };
  window.MOTOR = API;

  function iniciar() {
    var lienzo = $("lienzo");
    lienzo.innerHTML = cuerpo();
    if (!document.getElementById("capas")) { var c = document.createElement("div"); c.id = "capas"; document.body.appendChild(c); }
    if (!sinBarra) { document.body.prepend(barraDeRevision()); $("reiniciar").addEventListener("click", function () { estado = M.estadoVacio(); clearTimeout(avisoTimer); $("aviso").innerHTML = ""; pintar(); window.scrollTo(0, 0); }); }
    estado = M.leer(location.hash).estado;

    lienzo.addEventListener("click", function (ev) {
      var t = ev.target.closest("[data-g],[data-k],[data-orden],#orden,[data-p],[data-ficha],[data-fav]");
      if (!t) return;
      if (t.matches("[data-ficha]")) { ev.preventDefault(); toast(t.getAttribute("data-ficha") + "."); return; }
      if (t.matches("[data-fav]")) { var p = t.getAttribute("aria-pressed") === "true"; t.setAttribute("aria-pressed", String(!p)); t.querySelector("svg").style.fill = p ? "none" : "currentColor"; return; }
      if (t.matches("[data-g]")) return aplicar(M.navegar(estado, t.dataset.g || null, null), "navegar");
      if (t.matches("[data-k]")) return aplicar(M.navegar(estado, estado.grupo, t.dataset.k || null), "navegar");
      if (t.id === "orden") { estado = M.siguienteOrden(estado); $("aviso").innerHTML = ""; pintar(); alInicioDeLaLista(); return; }
      if (t.matches("[data-p]")) {
        estado = Object.assign(M.copia(estado), { pagina: Number(t.dataset.p) });
        pintar();
        var marca = document.querySelector(".t-filtros-marca");
        window.scrollTo({ top: marca.getBoundingClientRect().top + window.scrollY - 8, behavior: calma() ? "auto" : "smooth" });
      }
    });
    window.addEventListener("hashchange", function () {
      if (location.hash.replace(/^#/, "") === M.serializar(estado)) return;
      estado = M.leer(location.hash).estado;
      clearTimeout(avisoTimer);
      $("aviso").innerHTML = ""; // su «Deshacer» llevaría a un estado que ya no es el de antes
      pintar();
    });
    // La barra pegada no debe tapar lo que se enfoca con el teclado al recorrer las tarjetas.
    var barraPegada = $("barra");
    function ajustarRelleno() { document.documentElement.style.scrollPaddingTop = Math.round(barraPegada.getBoundingClientRect().height) + 8 + "px"; }
    if (window.ResizeObserver) new ResizeObserver(ajustarRelleno).observe(barraPegada);
    ajustarRelleno();

    pintar();
    if (window.OPCION && window.OPCION.montar) window.OPCION.montar(API);
    document.title = (window.OPCION ? window.OPCION.nombre + " · " : "") + "Filtros de color y talla — maqueta";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
