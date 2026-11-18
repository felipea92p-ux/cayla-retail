// El motor del spike: rutas por #ancla, la barra de revisión (no es parte del diseño), todo lo que se toca (menús, buscador, filtros, bolsa,
// favoritos, cuenta, separar), los avisos, la foto que viaja de la lista a la ficha y la entrada al hacer scroll.
// Cada dirección solo declara su nombre y su portada (`window.DIRECCION`); sus colores, letras y marcos viven en su CSS.
(function () {
  const { T, C, I, P, guardar, tiendaDe, enBolsa, anuncio, cabecera, pie, precioHTML, tarjeta, campo, notaStock, cuentaTexto, partesCuenta } = window.PZ;
  const D = window.DIRECCION;
  const PA = window.PANTALLAS;
  const S = PA.S;
  const calma = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const norm = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  let primera = true;
  let viajaDesde = null;

  const DIRECCIONES = [["blanco", "Blanco"], ["arcilla", "Arcilla"], ["rojo", "Rojo colibrí"]];
  const RUTAS = [["portada", "Portada"], ["catalogo", "Catálogo"], ["prenda/kalessi", "Prenda"], ["bolsa", "Bolsa"], ["entrar", "Entrar"], ["crear", "Crear cuenta"], ["cuenta", "Mi perfil"], ["tiendas", "Tiendas"], ["looks", "Looks"], ["piezas", "Piezas"]];

  // ── Rutas ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  function ruta() {
    const [camino, qs = ""] = (location.hash.replace(/^#/, "") || "portada").split("?");
    const [pantalla, id] = camino.split("/");
    const OK = ["portada", "catalogo", "prenda", "bolsa", "separado", "entrar", "crear", "cuenta", "favoritos", "tiendas", "looks", "look", "piezas"];
    return { pantalla: OK.includes(pantalla) ? pantalla : "noEncontrada", id, q: new URLSearchParams(qs) };
  }
  const hrefDe = (r) => `#${r}`;

  // ── La barra de revisión ──────────────────────────────────────────────────────────────────────────────────────────
  function barra() {
    const r = ruta();
    const actual = r.pantalla === "prenda" ? "prenda/" + (r.id || "kalessi") : r.pantalla;
    const qs = (extra) => { const u = new URLSearchParams(location.search); Object.entries(extra).forEach(([k, v]) => u.set(k, v)); u.delete("ver"); return "?" + u.toString(); };
    const b = document.createElement("div");
    b.className = "rev";
    b.innerHTML = `
      <a class="rev-volver" href="index.html">← Comparar</a>
      <nav class="rev-grupo" aria-label="Dirección">${DIRECCIONES.map(([id, n]) => `<a href="${id}.html${location.search}${location.hash}" ${id === D.id ? 'aria-current="page"' : ""}>${n}</a>`).join("")}</nav>
      <nav class="rev-grupo" aria-label="Pantalla">${RUTAS.map(([p, n]) => `<a href="${hrefDe(p)}" ${p === actual ? 'aria-current="page"' : ""}>${n}</a>`).join("")}</nav>
      <nav class="rev-grupo" aria-label="Estado">
        <button data-rev="sesion" aria-pressed="${T.sesion}">${T.sesion ? "Con cuenta" : "Visitante"}</button>
        <button data-rev="tema" aria-pressed="${T.tema === "oscuro"}">${T.tema === "oscuro" ? "Oscuro" : "Claro"}</button>
        <button data-rev="campana" aria-pressed="${T.campana}">${T.campana ? "Campaña" : "Sin campaña"}</button>
      </nav>
      <nav class="rev-grupo" aria-label="Ver abierto">${[["mega", "Menú Ropa"], ["buscar", "Buscador"], ["tienda", "Tienda"], ["cuenta", "Cuenta"], ["filtros", "Filtros"], ["guia", "Tallas"], ["menu", "Menú móvil"]].map(([k, n]) => `<button data-rev-ver="${k}">${n}</button>`).join("")}</nav>
      <a class="rev-demo" href="${qs({ demo: "" }).replace("demo=", "demo")}${location.hash}">▶ Demo</a>
      <a class="rev-celu" href="celular.html?d=${D.id}${location.hash ? "&h=" + encodeURIComponent(location.hash.slice(1)) : ""}">Celular</a>`;
    return b;
  }

  // ── Dibujar ───────────────────────────────────────────────────────────────────────────────────────────────────────
  function aplicarTema() {
    const h = document.documentElement;
    h.dataset.d = D.id;
    h.dataset.tema = T.tema;
    h.style.colorScheme = T.tema === "oscuro" ? "dark" : "light";
  }

  function renderPantalla(r) {
    const lienzo = $("#lienzo");
    const f = PA[r.pantalla === "noEncontrada" ? "noEncontrada" : r.pantalla];
    // Estado de lo que se mira: se reinicia al cambiar de prenda o de pantalla.
    if (r.pantalla === "prenda") {
      if (S.idActual !== r.id) { S.color = null; S.talla = null; S.pideTalla = false; S.agregado = null; S.foto = 0; S.idActual = r.id; }
    } else S.idActual = null;
    if (r.pantalla === "catalogo") {
      const f0 = S.filtros;
      f0.cat = r.q.get("cat") || "todo";
      f0.ofertas = r.q.get("o") === "ofertas";
      f0.nuevo = r.q.get("o") === "nuevo";
      f0.orden = r.q.get("o") === "vendidos" ? "vendidos" : r.q.get("o") === "nuevo" ? "nuevo" : f0.orden === "vendidos" && !r.q.has("o") ? "nuevo" : f0.orden;
      if (!r.q.has("conservar")) { f0.talla = null; f0.color = null; f0.soloTienda = false; }
    }
    const seccion = { catalogo: r.q.get("o") === "ofertas" ? "ofertas" : r.q.get("o") === "nuevo" ? "nuevo" : "ropa", looks: "looks", look: "looks" }[r.pantalla] || "";
    lienzo.innerHTML = `${anuncio()}${cabecera(seccion)}<main id="principal" class="pag" data-pantalla="${r.pantalla}">${f(r.pantalla === "look" || r.pantalla === "prenda" ? r.id : undefined)}</main>${pie()}`;
    lienzo.dataset.pantalla = r.pantalla;
  }

  function despuesDeDibujar(r, conservar) {
    document.title = `${D.nombre} · ${r.pantalla} — Spike de la tienda`;
    if (!conservar) window.scrollTo(0, 0);
    revelar($("#lienzo"));
    actualizarCarril();
    contarPuntos();
    if (r.pantalla === "entrar" || r.pantalla === "crear") marcarCampos($("form.forma"));
    const ver = new URLSearchParams(location.search).get("ver");
    if (ver && primera) setTimeout(() => abrir(ver), 350);
  }

  function pintar({ conservar = false } = {}) {
    const r = ruta();
    if (!new URLSearchParams(location.search).has("previa")) {
      const vieja = $(".rev");
      if (vieja) vieja.replaceWith(barra()); else document.body.prepend(barra());
    }
    aplicarTema();
    // Las pantallas de «lo mío» piden entrar.
    if ((r.pantalla === "cuenta") && !T.sesion) { location.replace("#entrar?volver=cuenta"); return; }
    const hacer = () => {
      cerrarTodo(true);
      const y = window.scrollY;
      renderPantalla(r);
      if (viajaDesde && r.pantalla === "prenda") { const g = $(".foto-grande"); if (g) g.style.viewTransitionName = "foto"; }
      despuesDeDibujar(r, conservar);
      if (conservar) window.scrollTo(0, y);
    };
    if (!primera && !conservar && viajaDesde && document.startViewTransition && !calma()) {
      const t = document.startViewTransition(hacer);
      t.finished.finally(() => { document.querySelectorAll("[style*=view-transition-name]").forEach((e) => (e.style.viewTransitionName = "")); viajaDesde = null; });
    } else { hacer(); viajaDesde = null; }
    primera = false;
  }

  // ── Entrada al hacer scroll, parallax, carril, cuenta regresiva, puntos ──────────────────────────────────────────
  function revelar(lienzo) {
    if (calma() || !("IntersectionObserver" in window)) return;
    lienzo.dataset.rv = "on";
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("v"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    $$(".rv", lienzo).forEach((el) => io.observe(el));
  }
  let marco = 0;
  window.addEventListener("scroll", () => {
    if (marco || calma()) return;
    marco = requestAnimationFrame(() => { marco = 0; $(".h")?.style.setProperty("--sy", Math.min(window.scrollY, 1100)); });
  }, { passive: true });
  function actualizarCarril() {
    const l = $("[data-carril-lista]");
    if (!l) return;
    const prev = $('[data-carril="-1"]'), next = $('[data-carril="1"]');
    const act = () => { prev.disabled = l.scrollLeft < 4; next.disabled = l.scrollLeft + l.clientWidth >= l.scrollWidth - 4; };
    l.addEventListener("scroll", act, { passive: true });
    act();
  }
  setInterval(() => {
    const c = partesCuenta();
    $$("[data-cuenta]").forEach((e) => { const b = e.querySelectorAll("b"); if (b.length >= 3) { b[0].textContent = c.d; b[1].textContent = String(c.h).padStart(2, "0"); b[2].textContent = String(c.m).padStart(2, "0"); } });
    $$("[data-cuenta-texto]").forEach((e) => (e.textContent = cuentaTexto()));
  }, 1000);
  function contarPuntos() {
    $$("[data-contar]").forEach((el) => {
      const meta = +el.dataset.contar;
      if (calma()) return;
      const io = new IntersectionObserver((es) => es.forEach((e) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const paso = (t) => { const k = Math.min(1, (t - t0) / 1300); el.textContent = Math.round(meta * (1 - Math.pow(1 - k, 3))).toLocaleString("es-PE"); if (k < 1) requestAnimationFrame(paso); };
        requestAnimationFrame(paso);
      }));
      io.observe(el);
    });
  }

  // ── Avisos ────────────────────────────────────────────────────────────────────────────────────────────────────────
  function avisar(texto, { tipo = "ok", accion = null, ms = 4200 } = {}) {
    let caja = $("#avisos");
    if (!caja) { caja = document.createElement("div"); caja.id = "avisos"; caja.setAttribute("role", "region"); caja.setAttribute("aria-label", "Avisos"); document.body.appendChild(caja); }
    const a = document.createElement("div");
    a.className = `aviso-flot aviso-${tipo}`;
    a.setAttribute("role", tipo === "error" ? "alert" : "status");
    a.innerHTML = `<span class="aviso-ico">${I(tipo === "error" ? "alerta" : tipo === "info" ? "info" : "check")}</span><span class="aviso-t">${texto}</span>${accion ? `<a class="enlace" href="${accion.href}">${accion.texto}</a>` : ""}<button class="aviso-x" aria-label="Cerrar el aviso">${I("x", "ic-chica")}</button>`;
    caja.appendChild(a);
    requestAnimationFrame(() => a.classList.add("dentro"));
    const quitar = () => { a.classList.remove("dentro"); setTimeout(() => a.remove(), 400); };
    a.querySelector(".aviso-x").addEventListener("click", quitar);
    setTimeout(quitar, accion ? Math.max(ms, 7000) : ms);
  }

  // ── La bolsa: agregar, la foto que vuela y el golpecito del globo ────────────────────────────────────────────────
  function volar(origen) {
    const bolsaIco = $(".bolsa-ico");
    const foto = origen && (origen.matches("img") ? origen : $("img", origen));
    if (!bolsaIco || !foto || calma()) return;
    const a = foto.getBoundingClientRect(), b = bolsaIco.getBoundingClientRect();
    if (!a.width) return;
    const clon = document.createElement("img");
    clon.src = foto.currentSrc || foto.src;
    clon.className = "vuela";
    clon.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`;
    document.body.appendChild(clon);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const anim = clon.animate([{ transform: "translate(0,0) scale(1)", opacity: 0.95 }, { transform: `translate(${dx * 0.7}px, ${dy * 0.5 - 40}px) scale(.55)`, opacity: 0.9, offset: 0.55 }, { transform: `translate(${dx}px, ${dy}px) scale(.08)`, opacity: 0.1 }], { duration: 750, easing: "cubic-bezier(.5,0,.2,1)" });
    anim.onfinish = () => { clon.remove(); bolsaIco.classList.remove("golpe"); void bolsaIco.offsetWidth; bolsaIco.classList.add("golpe"); };
  }
  function actualizarGlobos() {
    const g = $('[data-globo="bolsa"]'), n = enBolsa();
    if (g) { g.textContent = n; g.hidden = !n; }
    const f = $('[data-globo="fav"]');
    if (f) { f.textContent = T.favs.length; f.hidden = !T.favs.length; }
  }
  function agregar(id, color, talla, cant = 1, origen = null, silencioso = false) {
    const l = T.bolsa.find((x) => x.id === id && x.color === color && x.talla === talla);
    if (l) l.cant = Math.min(3, l.cant + cant); else T.bolsa.push({ id, color, talla, cant });
    guardar();
    actualizarGlobos();
    volar(origen);
    if (!silencioso) avisar(`Agregaste ${P(id).nombre}, talla ${talla}.`, { accion: { texto: `Ver mi bolsa (${enBolsa()})`, href: "#bolsa" } });
  }
  const primeraTalla = (p) => p.tallas.find((t) => C.stockPorTalla(p, T.tienda)[t] > 0);

  // ── Overlays ──────────────────────────────────────────────────────────────────────────────────────────────────────
  function capas() {
    let c = $("#capas");
    if (!c) { c = document.createElement("div"); c.id = "capas"; document.body.appendChild(c); }
    return c;
  }
  function cerrarTodo(rapido = false) {
    $$("[data-menu]").forEach((m) => { m.hidden = true; });
    $$("[aria-expanded]").forEach((b) => b.setAttribute("aria-expanded", "false"));
    $$("#capas > *").forEach((e) => { if (rapido) e.remove(); else { e.classList.remove("abierta"); setTimeout(() => e.remove(), 380); } });
    document.documentElement.classList.remove("capa-abierta");
    $(".cab")?.classList.remove("mega-forzado");
  }
  function velo(alCerrar) {
    const v = document.createElement("div");
    v.className = "velo";
    v.addEventListener("click", () => cerrarTodo());
    return v;
  }
  function montar(nodo) {
    cerrarTodo(true);
    const c = capas();
    c.appendChild(nodo);
    requestAnimationFrame(() => nodo.classList.add("abierta"));
    document.documentElement.classList.add("capa-abierta");
  }

  const SUGERENCIAS = ["Blusas", "Pantalones", "Corsets", "Faldas", "Celeste", "Negro"];
  function panelBuscar() {
    const n = document.createElement("div");
    n.className = "buscador";
    n.setAttribute("role", "dialog"); n.setAttribute("aria-modal", "true"); n.setAttribute("aria-label", "Buscar en la tienda");
    n.innerHTML = `
      <div class="velo" data-cerrar></div>
      <div class="buscador-panel">
        <div class="buscador-fila"><label class="buscador-caja">${I("buscar")}<span class="sr">Buscar en la tienda</span><input data-q placeholder="Busca una prenda, un color o una categoría" autocomplete="off" autofocus></label><button class="ico" data-cerrar aria-label="Cerrar el buscador">${I("x")}</button></div>
        <div class="buscador-cuerpo" data-resultados></div>
      </div>`;
    montar(n);
    pintarResultados("");
    setTimeout(() => $("[data-q]", n)?.focus(), 80);
  }
  function resaltar(t, q) {
    if (!q) return t;
    const i = norm(t).indexOf(norm(q));
    return i < 0 ? t : `${t.slice(0, i)}<mark>${t.slice(i, i + q.length)}</mark>${t.slice(i + q.length)}`;
  }
  function pintarResultados(q) {
    const cuerpo = $("[data-resultados]");
    if (!cuerpo) return;
    const nq = norm(q.trim());
    if (!nq) {
      const top = C.prendas.filter((p) => p.puesto).sort((a, b) => a.puesto - b.puesto).slice(0, 3);
      cuerpo.innerHTML = `
        <span class="ceja mute">Busca por categoría</span>
        <div class="sugerencias">${SUGERENCIAS.map((s) => `<button class="pildora" data-sug="${s}">${s}</button>`).join("")}</div>
        <span class="ceja mute">Lo más buscado</span>
        <ul class="resultados">${top.map((p) => resultado(p, "")).join("")}</ul>`;
      return;
    }
    const res = C.prendas.filter((p) => [p.nombre, C.nombreCat(p.cat), ...p.colores.map((c) => c[0])].some((t) => norm(t).includes(nq)));
    cuerpo.innerHTML = res.length
      ? `<span class="ceja mute resultados-cuenta">${res.length} ${res.length === 1 ? "resultado" : "resultados"} en ${tiendaDe().ciudad}</span><ul class="resultados">${res.slice(0, 6).map((p) => resultado(p, q)).join("")}</ul>${res.length > 6 ? `<a class="ver" href="#catalogo">Ver los ${res.length} resultados ${I("flecha")}</a>` : ""}`
      : `<div class="vacio vacio-chico">${I("buscar", "vacio-ico")}<h3>No encontramos «${q}»</h3><p>Prueba con otra palabra: un color, una prenda o un nombre.</p><div class="sugerencias sugerencias-centro">${SUGERENCIAS.slice(0, 4).map((s) => `<button class="pildora" data-sug="${s}">${s}</button>`).join("")}</div></div>`;
  }
  const resultado = (p, q) => `<li><a class="resultado" href="#prenda/${p.id}"><span class="foto"><img src="${C.foto(p)}" alt="" loading="lazy"></span><span class="resultado-t"><b class="tj-nom">${resaltar(p.nombre, q)}</b><small class="mute">${C.nombreCat(p.cat)}</small>${notaStock(p)}</span>${precioHTML(p)}</a></li>`;

  function panelFiltros() {
    const f = S.filtros;
    const tallas = [...new Set(C.prendas.flatMap((p) => p.tallas))];
    const colores = [...new Map(C.prendas.flatMap((p) => p.colores).map((c) => [c[0], c[1]])).entries()].slice(0, 14);
    const n = PA.listaFiltrada().length;
    const h = document.createElement("div");
    h.className = "hoja hoja-lado";
    h.setAttribute("role", "dialog"); h.setAttribute("aria-modal", "true"); h.setAttribute("aria-label", "Filtros");
    h.innerHTML = `
      <div class="velo" data-cerrar></div>
      <div class="hoja-cuerpo">
        <div class="hoja-asa" aria-hidden="true"></div>
        <div class="hoja-cab"><h2 class="disp t-h3">Filtros</h2><button class="ico" data-cerrar aria-label="Cerrar los filtros">${I("x")}</button></div>
        <div class="hoja-scroll">
          <div class="bloque"><span class="etq"><span>Talla</span></span><div class="tallas">${tallas.map((t) => `<button class="talla" data-f-talla="${t}" aria-pressed="${f.talla === t}">${t}</button>`).join("")}</div></div>
          <div class="bloque"><span class="etq"><span>Color</span></span><div class="swatches">${colores.map(([nom, hex]) => `<button class="swatch" data-f-color="${nom}" aria-pressed="${f.color === nom}"><i style="background:${hex}" data-color-dato></i>${nom}</button>`).join("")}</div></div>
          <div class="bloque interruptor-fila"><span><b>Solo lo que hay en ${tiendaDe().ciudad}</b><small class="mute">Esconde lo que no podrías recoger ahí.</small></span><button class="interruptor" role="switch" aria-checked="${f.soloTienda}" data-f-solo aria-label="Solo lo que hay en ${tiendaDe().ciudad}"><i></i></button></div>
        </div>
        <div class="hoja-pie pie-acciones"><button class="btn btn-sec" data-limpiar-filtros>Limpiar</button><button class="btn" data-cerrar>Ver <span data-n-ver>${n}</span> ${n === 1 ? "prenda" : "prendas"}</button></div>
      </div>`;
    montar(h);
  }
  function panelGuia() {
    const filas = [["S", "84–88", "64–68", "90–94"], ["M", "89–93", "69–73", "95–99"], ["L", "94–98", "74–78", "100–104"], ["XL", "99–104", "79–84", "105–110"]];
    const pant = [["26", "64–67", "90–93"], ["28", "68–71", "94–97"], ["30", "72–75", "98–101"], ["32", "76–79", "102–105"]];
    const h = document.createElement("div");
    h.className = "hoja hoja-centro";
    h.setAttribute("role", "dialog"); h.setAttribute("aria-modal", "true"); h.setAttribute("aria-label", "Guía de tallas");
    h.innerHTML = `
      <div class="velo" data-cerrar></div>
      <div class="hoja-cuerpo">
        <div class="hoja-asa" aria-hidden="true"></div>
        <div class="hoja-cab"><h2 class="disp t-h3">Guía de tallas</h2><button class="ico" data-cerrar aria-label="Cerrar la guía">${I("x")}</button></div>
        <div class="hoja-scroll">
          <p class="mute">Medidas en centímetros, tomadas sobre el cuerpo. Si estás entre dos tallas, elige la más grande.</p>
          <table class="tabla-medidas"><caption>Blusas, tops y corsets</caption><thead><tr><th>Talla</th><th>Busto</th><th>Cintura</th><th>Cadera</th></tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c, i) => (i ? `<td class="num">${c}</td>` : `<th scope="row">${c}</th>`)).join("")}</tr>`).join("")}</tbody></table>
          <table class="tabla-medidas"><caption>Pantalones y faldas</caption><thead><tr><th>Talla</th><th>Cintura</th><th>Cadera</th></tr></thead><tbody>${pant.map((f) => `<tr>${f.map((c, i) => (i ? `<td class="num">${c}</td>` : `<th scope="row">${c}</th>`)).join("")}</tr>`).join("")}</tbody></table>
        </div>
      </div>`;
    montar(h);
  }
  function panelMenuMovil() {
    const m = document.createElement("div");
    m.className = "menu-movil";
    m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-label", "Menú");
    m.innerHTML = `
      <div class="menu-movil-cab">${window.PZ.logo()}<button class="ico" data-cerrar aria-label="Cerrar el menú">${I("x")}</button></div>
      <nav class="menu-movil-grandes" aria-label="Secciones">
        <a href="#catalogo?o=nuevo">Nuevo ${I("flecha")}</a>
        <details><summary>Ropa ${I("chevron")}</summary><div class="menu-movil-sub">${C.menuRopa.map(([g, cats]) => `<span class="ceja mute">${g}</span>${cats.map((c) => `<a href="#catalogo?cat=${c}">${C.nombreCat(c)}</a>`).join("")}`).join("")}<a href="#catalogo">Toda la tienda</a></div></details>
        <a href="#looks">Looks ${I("flecha")}</a>
        ${T.campana ? `<a class="nav-oferta" href="#catalogo?o=ofertas">Ofertas ${I("flecha")}</a>` : ""}
      </nav>
      <div class="menu-movil-pie">
        <span class="ceja mute">Recoges en</span>
        <div class="menu-movil-tiendas">${C.tiendas.map((t) => `<button class="op-tienda" aria-pressed="${t.id === T.tienda}" data-tienda="${t.id}"><b>${t.ciudad}</b><small>${t.direccion}</small></button>`).join("")}</div>
        ${T.sesion ? `<a class="btn btn-sec btn-ancho" href="#cuenta">Mi perfil</a>` : `<a class="btn btn-ancho" href="#entrar">Entrar</a><a class="btn btn-sec btn-ancho" href="#crear">Crear mi cuenta</a>`}
      </div>`;
    montar(m);
  }

  function abrir(nombre, disparador) {
    if (nombre === "mega") { cerrarTodo(true); $(".cab")?.classList.add("mega-forzado"); return; }
    if (nombre === "buscar") return panelBuscar();
    if (nombre === "filtros") return panelFiltros();
    if (nombre === "guia") return panelGuia();
    if (nombre === "menu") return panelMenuMovil();
    if (nombre === "tienda" || nombre === "cuenta") {
      const m = $(`[data-menu="${nombre}"]`);
      if (!m) return;
      const abierto = !m.hidden;
      cerrarTodo(true);
      if (!abierto) { m.hidden = false; (disparador || m.parentElement.querySelector("button"))?.setAttribute("aria-expanded", "true"); }
    }
  }

  // ── Formularios: campos con estado (sigue / hecho / error) ───────────────────────────────────────────────────────
  const correoValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
  function marcar(c, estado, nota) {
    if (!c) return;
    c.dataset.estado = estado;
    const m = $(".campo-marca", c);
    if (m) m.innerHTML = estado === "hecho" ? `${I("check", "ic-chica")} Listo` : estado === "sigue" ? "Sigue aquí" : estado === "error" ? `${I("alerta", "ic-chica")} Revisa` : "";
    const n = $(".campo-nota", c);
    if (n && nota !== undefined) { n.innerHTML = nota; if (estado === "error") n.setAttribute("role", "alert"); else n.removeAttribute("role"); }
    const i = $("input", c);
    if (i) { if (estado === "error") i.setAttribute("aria-invalid", "true"); else i.removeAttribute("aria-invalid"); }
  }
  // Lo que cada campo ya tiene bien; el primero que falta es el que «sigue».
  function marcarCampos(form) {
    if (!form) return;
    const cs = $$(".campo:not([hidden])", form);
    let sigue = false;
    cs.forEach((c) => {
      const i = $("input", c), v = (i?.value || "").trim();
      const id = c.dataset.campo;
      const ok = id === "correo" ? correoValido(v) : id === "codigo" ? /^\d{6}$/.test(v) : id === "nombre" ? v.length >= 2 : id === "clave" ? (form.matches("[data-form-crear]") ? v.length >= 8 : v.length >= 1) : false;
      if (c.dataset.estado === "error" && !ok && v) return;
      if (ok) marcar(c, "hecho"); else if (!sigue) { marcar(c, "sigue"); sigue = true; } else marcar(c, "");
    });
  }
  function irAlVolver(porDefecto) {
    const v = ruta().q.get("volver");
    location.hash = "#" + (v || porDefecto);
  }

  // ── Clics ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  document.addEventListener("click", (e) => {
    const t = e.target;
    const en = (s) => t.closest(s);
    // La barra de revisión
    const rev = en("[data-rev]");
    if (rev) {
      const k = rev.dataset.rev;
      if (k === "sesion") T.sesion = !T.sesion; else if (k === "tema") T.tema = T.tema === "oscuro" ? "claro" : "oscuro"; else if (k === "campana") T.campana = !T.campana;
      guardar(); return pintar({ conservar: true });
    }
    const rv = en("[data-rev-ver]");
    if (rv) { const k = rv.dataset.revVer; if (k === "filtros" && ruta().pantalla !== "catalogo") { location.hash = "#catalogo"; setTimeout(() => abrir(k), 400); } else if (k === "guia" && ruta().pantalla !== "prenda") { location.hash = "#prenda/kalessi"; setTimeout(() => abrir(k), 400); } else abrir(k); return; }
    if (en("[data-cerrar]")) { e.preventDefault(); return cerrarTodo(); }
    // Abrir menús y paneles
    const ab = en("[data-abrir]");
    if (ab) { e.preventDefault(); return abrir(ab.dataset.abrir, ab); }
    // Cerrar menús al tocar fuera
    if (!en(".sel-tienda") && !en(".persona") && !en(".menu")) { $$("[data-menu]").forEach((m) => { m.hidden = true; }); $$("[aria-expanded]").forEach((b) => b.setAttribute("aria-expanded", "false")); }
    // Un enlace dentro de un panel lo cierra
    if (en("#capas a[href^='#']")) cerrarTodo();
    if (en(".menu a[href^='#']")) $$("[data-menu]").forEach((m) => { m.hidden = true; });

    // Tienda elegida
    const ti = en("[data-tienda]");
    if (ti) {
      const id = ti.dataset.tienda;
      if (id === T.tienda) { cerrarTodo(true); return; }
      if (T.bolsa.length) {
        const av = $("[data-aviso-tienda]");
        if (av) { av.hidden = false; $("[data-tienda-nueva]", av).textContent = C.tienda(id).ciudad; av.dataset.id = id; return; }
      }
      T.tienda = id; guardar(); cerrarTodo(true); avisar(`Ahora ves lo que hay en ${C.tienda(id).ciudad}.`, { tipo: "info" }); return pintar({ conservar: true });
    }
    if (en("[data-confirma-tienda]")) { const id = $("[data-aviso-tienda]").dataset.id; T.bolsa = []; T.cupon = null; T.tienda = id; guardar(); cerrarTodo(true); avisar(`Ahora recoges en ${C.tienda(id).ciudad}. Tu bolsa quedó vacía.`, { tipo: "info" }); return pintar({ conservar: true }); }
    if (en("[data-cancela-tienda]")) { $("[data-aviso-tienda]").hidden = true; return; }
    const et = en("[data-elegir-tienda]");
    if (et) { T.tienda = et.dataset.elegirTienda; guardar(); }

    // Favoritos
    const fav = en("[data-fav]");
    if (fav) {
      e.preventDefault(); e.stopPropagation();
      const id = fav.dataset.fav, i = T.favs.indexOf(id);
      if (i >= 0) T.favs.splice(i, 1); else T.favs.push(id);
      guardar(); actualizarGlobos();
      $$(`[data-fav="${id}"]`).forEach((b) => { const on = T.favs.includes(id); b.setAttribute("aria-pressed", on); b.innerHTML = I(on ? "corazonlleno" : "corazon"); b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); });
      return;
    }
    // Agregar rápido desde la tarjeta
    const rap = en("[data-rapido]");
    if (rap) { e.preventDefault(); e.stopPropagation(); const p = P(rap.dataset.rapido); agregar(p.id, p.colores[0][0], rap.dataset.talla, 1, $(".tj-foto img", rap.closest(".tj"))); return; }
    // Carril
    const car = en("[data-carril]");
    if (car) { const l = $("[data-carril-lista]"); l.scrollBy({ left: +car.dataset.carril * l.clientWidth * 0.85, behavior: calma() ? "auto" : "smooth" }); return; }
    // Catálogo: categorías y filtros
    const cat = en("[data-cat]");
    if (cat && en("[data-filtros]")) { S.filtros.cat = cat.dataset.cat; S.filtros.ofertas = false; S.filtros.nuevo = false; return repintarCatalogo(true); }
    const ft = en("[data-f-talla]"); if (ft) { S.filtros.talla = S.filtros.talla === ft.dataset.fTalla ? null : ft.dataset.fTalla; return repintarCatalogo(false, true); }
    const fc = en("[data-f-color]"); if (fc) { S.filtros.color = S.filtros.color === fc.dataset.fColor ? null : fc.dataset.fColor; return repintarCatalogo(false, true); }
    const fs = en("[data-f-solo]"); if (fs) { S.filtros.soloTienda = !S.filtros.soloTienda; return repintarCatalogo(false, true); }
    const qf = en("[data-quitar-filtro]"); if (qf) { S.filtros[qf.dataset.quitarFiltro] = qf.dataset.quitarFiltro === "soloTienda" ? false : null; return repintarCatalogo(); }
    if (en("[data-limpiar-filtros]")) { Object.assign(S.filtros, { talla: null, color: null, soloTienda: false, cat: "todo", ofertas: false, nuevo: false }); if (en(".hoja")) { cerrarTodo(); } return repintarCatalogo(true); }
    const sug = en("[data-sug]"); if (sug) { const q = $("[data-q]"); if (q) { q.value = sug.dataset.sug; pintarResultados(q.value); q.focus(); } return; }

    // Ficha: color, talla, fotos, agregar
    const val = en("[data-grupo] [data-valor]");
    if (val) {
      const g = val.closest("[data-grupo]").dataset.grupo;
      if (g === "color") { S.color = val.dataset.valor; S.foto = 0; } else { S.talla = S.talla === val.dataset.valor ? null : val.dataset.valor; S.pideTalla = false; }
      S.agregado = null; return pintar({ conservar: true });
    }
    const fo = en("[data-foto]"); if (fo) { S.foto = +fo.dataset.foto; return pintar({ conservar: true }); }
    const ag = en("[data-agregar]");
    if (ag) {
      const p = P(ag.dataset.agregar);
      if (!S.talla) { S.pideTalla = true; pintar({ conservar: true }); $("[data-bloque-tallas]")?.scrollIntoView({ block: "center", behavior: calma() ? "auto" : "smooth" }); $("[data-bloque-tallas] .talla")?.focus({ preventScroll: true }); return; }
      agregar(p.id, S.color, S.talla, 1, $(".foto-grande img"), true);
      S.agregado = p.id; pintar({ conservar: true });
      return avisar(`Agregaste ${p.nombre}, talla ${S.talla}.`, { accion: { texto: `Ver mi bolsa (${enBolsa()})`, href: "#bolsa" } });
    }
    const av = en("[data-avisame]"); if (av) { avisar("Listo: te avisamos por WhatsApp cuando llegue.", { tipo: "info" }); av.disabled = true; av.innerHTML = `${I("check")} Te avisamos cuando llegue`; return; }
    const lk = en("[data-look]");
    if (lk) {
      e.preventDefault();
      const l = C.looks.find((x) => x.n === +lk.dataset.look);
      l.prendas.forEach((id) => { const p = P(id); const tl = primeraTalla(p); if (tl) agregar(id, p.colores[0][0], tl, 1, null, true); });
      avisar(`Agregaste el look N.º ${l.n} a tu bolsa.`, { accion: { texto: `Ver mi bolsa (${enBolsa()})`, href: "#bolsa" } }); volar($("img", lk.closest(".look-card, .look-det")));
      return;
    }
    // Bolsa
    const cn = en("[data-cant]"); if (cn) { const l = T.bolsa[+cn.dataset.cant]; l.cant = Math.max(1, Math.min(3, l.cant + +cn.dataset.d)); guardar(); return pintar({ conservar: true }); }
    const qu = en("[data-quitar]"); if (qu) { const [l] = T.bolsa.splice(+qu.dataset.quitar, 1); guardar(); avisar(`Quitaste ${P(l.id).nombre} de tu bolsa.`, { tipo: "info" }); return pintar({ conservar: true }); }
    if (en("[data-cupon-aplicar]")) { T.cupon = T.cupon ? null : "ANIV-7K2P"; guardar(); return pintar({ conservar: true }); }
    const cm = en("[data-cupon-mio]"); if (cm) { T.cupon = cm.dataset.cuponMio; guardar(); return pintar({ conservar: true }); }
    if (en("[data-canje]")) { avisar("Canjeaste 500 puntos: tienes un cupón nuevo de S/ 10.", { tipo: "ok" }); return; }
    const cp = en("[data-copiar]"); if (cp) { try { navigator.clipboard?.writeText(cp.dataset.copiar); } catch { /* sin portapapeles */ } avisar(`Copiaste ${cp.dataset.copiar}.`, { tipo: "info" }); return; }
    if (en("[data-wsp]")) { e.preventDefault(); avisar("Se abrió WhatsApp con tu mensaje ya escrito.", { tipo: "info" }); return; }
    // Cuenta
    if (en("[data-salir]")) { e.preventDefault(); T.sesion = false; guardar(); avisar("Saliste de tu cuenta. Tu bolsa sigue aquí.", { tipo: "info" }); location.hash = "#portada"; return pintar(); }
    const vc = en("[data-ver-clave]"); if (vc) { const i = $("input", vc.parentElement); const ver = i.type === "password"; i.type = ver ? "text" : "password"; vc.innerHTML = I(ver ? "ojotachado" : "ojo"); vc.setAttribute("aria-label", ver ? "Ocultar la contraseña" : "Mostrar la contraseña"); return; }
    if (en("[data-codigo]")) {
      const correo = $("#correo");
      if (!correoValido(correo.value)) { marcar($("[data-campo=correo]"), "error", "Escribe un correo válido, como tucorreo@gmail.com."); correo.focus(); return; }
      const c = $("[data-campo=codigo]"); c.hidden = false; marcar($("[data-campo=correo]"), "hecho"); marcar(c, "sigue", `Te enviamos un código de 6 números a <b>${correo.value.trim()}</b>. Vale 30 minutos.`); $("#codigo").focus();
      avisar("Te enviamos el código a tu correo.", { tipo: "info" }); return;
    }
  });

  function repintarCatalogo(titulo, soloPanel = false) {
    const c = $("[data-cat-rejilla]");
    if (!c) return;
    c.innerHTML = PA.rejillaCat();
    $$(".rv", c).forEach((x) => x.classList.add("v"));
    const n = PA.listaFiltrada().length;
    $$("[data-n-prendas]").forEach((x) => (x.textContent = n));
    $$("[data-n-ver]").forEach((x) => (x.textContent = n));
    const a = $("[data-activos]"); if (a) a.innerHTML = PA.activos();
    $$("[data-cat]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === S.filtros.cat && !S.filtros.ofertas && !S.filtros.nuevo)));
    const nf = [S.filtros.talla, S.filtros.color, S.filtros.soloTienda].filter(Boolean).length;
    const g = $("[data-n-filtros]"); if (g) { g.textContent = nf; g.hidden = !nf; }
    const tt = $("[data-titulo]"); if (tt) tt.textContent = PA.tituloCat();
    if (soloPanel) {
      $$("[data-f-talla]").forEach((b) => b.setAttribute("aria-pressed", String(S.filtros.talla === b.dataset.fTalla)));
      $$("[data-f-color]").forEach((b) => b.setAttribute("aria-pressed", String(S.filtros.color === b.dataset.fColor)));
      const sw = $("[data-f-solo]"); if (sw) sw.setAttribute("aria-checked", String(S.filtros.soloTienda));
    }
  }

  // ── Cambios, entradas y envíos ───────────────────────────────────────────────────────────────────────────────────
  document.addEventListener("change", (e) => {
    if (e.target.matches("[data-orden]")) { S.filtros.orden = e.target.value; repintarCatalogo(); }
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.matches("[data-q]")) return pintarResultados(t.value);
    const form = t.closest("form.forma");
    if (form) {
      if (t.id === "codigo") t.value = t.value.replace(/\D/g, "").slice(0, 6);
      if (t.id === "codigo" && t.value.length === 6) { marcar($("[data-campo=codigo]"), "hecho", "Código confirmado."); }
      const c = t.closest(".campo"); if (c?.dataset.estado === "error") marcar(c, "", "");
      marcarCampos(form);
    }
  });
  document.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.matches("[data-form-separar]")) {
      if (!T.sesion) { location.hash = "#entrar?volver=bolsa"; return; }
      if (f.querySelector(".btn-separar:disabled")) return;
      const t = PA.totales();
      T.separado = { n: "0043", tienda: T.tienda, lineas: T.bolsa.map((l) => ({ ...l })), total: t.total };
      T.bolsa = []; T.cupon = null; guardar();
      location.hash = "#separado"; return;
    }
    if (f.matches("[data-form-entrar]")) {
      const correo = $("#correo", f), clave = $("#clave", f);
      let ok = true;
      if (!correoValido(correo.value)) { marcar($("[data-campo=correo]", f), "error", "Escribe un correo válido, como tucorreo@gmail.com."); ok = false; }
      if (!clave.value) { marcar($("[data-campo=clave]", f), "error", "Escribe tu contraseña."); ok = false; }
      if (!ok) { $("[data-aviso]", f).innerHTML = `<span class="mal">${I("alerta", "ic-chica")} Revisa lo marcado y vuelve a intentarlo.</span>`; return; }
      T.sesion = true; guardar();
      avisar(`Listo: entraste a tu cuenta, ${C.yo.nombre}.`);
      irAlVolver("portada"); return;
    }
    if (f.matches("[data-form-crear]")) {
      let ok = true;
      const v = (id) => ($(`#${id}`, f)?.value || "").trim();
      if (!correoValido(v("correo"))) { marcar($("[data-campo=correo]", f), "error", "Escribe un correo válido, como tucorreo@gmail.com."); ok = false; }
      else if (!/^\d{6}$/.test(v("codigo"))) { const c = $("[data-campo=codigo]", f); c.hidden = false; marcar(c, "error", "Pide tu código y escríbelo aquí: son 6 números."); ok = false; }
      if (v("nombre").length < 2) { marcar($("[data-campo=nombre]", f), "error", "Escribe tu nombre."); ok = false; }
      if (v("clave").length < 8) { marcar($("[data-campo=clave]", f), "error", "Mínimo 8 caracteres."); ok = false; }
      if (!$("[name=mayor]", f).checked) { $("[data-aviso]", f).innerHTML = `<span class="mal">${I("alerta", "ic-chica")} Confirma que eres mayor de 18 años.</span>`; ok = false; }
      if (!ok) return;
      T.sesion = true; guardar();
      avisar("Listo: tu cuenta ya es del Club CAYLA.");
      location.hash = "#cuenta"; return;
    }
  });

  // ── Teclado ───────────────────────────────────────────────────────────────────────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if ($("#capas > *") || $("[data-menu]:not([hidden])")) { cerrarTodo(); } }
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); abrir("buscar"); }
    if (e.key === "Enter" && e.target.matches("[data-q]")) { const a = $(".resultado"); if (a) { location.hash = a.getAttribute("href"); } }
  });

  // ── La foto que viaja de la lista a la ficha, y la lupa ──────────────────────────────────────────────────────────
  document.addEventListener("pointerdown", (e) => {
    const a = e.target.closest(".tj-enlace");
    if (a && !calma()) { viajaDesde = a.dataset.fotoViaja; const f = a.closest(".tj-foto"); if (f) f.style.viewTransitionName = "foto"; }
  }, true);
  document.addEventListener("pointermove", (e) => {
    const f = e.target.closest?.("[data-lupa]");
    if (!f) return;
    const r = f.getBoundingClientRect();
    f.style.setProperty("--lx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    f.style.setProperty("--ly", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  });

  window.addEventListener("hashchange", () => pintar());
  window.TIENDA = { pintar, abrir, cerrarTodo, avisar, agregar, marcar, marcarCampos };
  if (document.readyState !== "loading") pintar(); else document.addEventListener("DOMContentLoaded", () => pintar());
})();
