// Las piezas del spike: el estado de la visita (tienda elegida, sesión, tema, bolsa, favoritos) y lo que se repite en todas las pantallas
// (cabecera, anuncio, pie, tarjeta de prenda, precio, insignias, cuenta regresiva, campos de formulario, vacíos).
// El estado vive en la sesión del navegador y se puede fijar desde la dirección (`?tema=oscuro&sesion=si&tienda=tru&campana=no&bolsa=vacia`)
// para abrir la maqueta justo en el estado que se quiere ver.
(function () {
  const C = window.CAYLA;
  const M = window.CAYLA_MARCA;
  const I = window.ICONO;

  // ── Estado de la visita ───────────────────────────────────────────────────────────────────────────────────────────
  let guardado = {};
  try { guardado = JSON.parse(sessionStorage.getItem("cayla-spike") || "{}"); } catch { /* sin almacenamiento */ }
  const q = new URLSearchParams(location.search);
  const T = {
    tienda: guardado.tienda || "aqp",
    sesion: guardado.sesion ?? false,
    tema: guardado.tema || "claro",
    campana: guardado.campana ?? true,
    bolsa: guardado.bolsa || [{ id: "kalessi", color: "Chocolate", talla: "M", cant: 1 }, { id: "tiana", color: "Celeste", talla: "28", cant: 1 }],
    favs: guardado.favs || ["alba", "luna"],
    cupon: guardado.cupon || null,
    separado: guardado.separado || null,
  };
  if (q.has("tema")) T.tema = q.get("tema") === "oscuro" ? "oscuro" : "claro";
  if (q.has("sesion")) T.sesion = q.get("sesion") === "si";
  if (q.has("tienda")) T.tienda = q.get("tienda") === "tru" ? "tru" : "aqp";
  if (q.has("campana")) T.campana = q.get("campana") !== "no";
  if (q.get("bolsa") === "vacia") T.bolsa = [];
  const guardar = () => { try { sessionStorage.setItem("cayla-spike", JSON.stringify(T)); } catch { /* sin almacenamiento */ } };

  // ── Pequeñas ayudas ───────────────────────────────────────────────────────────────────────────────────────────────
  const P = (id) => C.prenda(id);
  const tiendaDe = () => C.tienda(T.tienda);
  const dosDigitos = (n) => String(n).padStart(2, "0");
  const partesCuenta = () => {
    const ms = Math.max(0, C.campana.hasta - Date.now());
    return { d: Math.floor(ms / 864e5), h: Math.floor((ms % 864e5) / 36e5), m: Math.floor((ms % 36e5) / 6e4), s: Math.floor((ms % 6e4) / 1e3) };
  };
  const cuentaTexto = () => { const c = partesCuenta(); return `${c.d} d ${dosDigitos(c.h)} h ${dosDigitos(c.m)} min`; };
  const cuentaHTML = () => { const c = partesCuenta(); return `<span class="cuenta" data-cuenta aria-label="Termina en ${cuentaTexto()}"><b>${c.d}</b><small>d</small><b>${dosDigitos(c.h)}</b><small>h</small><b>${dosDigitos(c.m)}</b><small>min</small></span>`; };
  const enBolsa = () => T.bolsa.reduce((n, l) => n + l.cant, 0);

  // ── Marca y cabecera ──────────────────────────────────────────────────────────────────────────────────────────────
  const logoSvg = () => `<svg class="logo" viewBox="${M.logo.viewBox}" style="aspect-ratio:${M.logo.ancho} / ${M.logo.alto}" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${M.logo.trazo}"/></svg>`;
  const logo = (extra = "") => `<a class="logo-a ${extra}" href="#portada" aria-label="CAYLA, ir al inicio">${logoSvg()}</a>`;
  const palabraSvg = () => `<svg class="palabra" viewBox="${M.palabra.viewBox}" style="aspect-ratio:${M.palabra.ancho} / ${M.palabra.alto}" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${M.palabra.trazo}"/></svg>`;
  const colibriSvg = () => `<svg class="colibri" viewBox="${M.colibri.viewBox}" style="aspect-ratio:${M.colibri.ancho} / ${M.colibri.alto}" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${M.colibri.trazo}"/></svg>`;

  function anuncio() {
    const t = tiendaDe();
    return T.campana
      ? `<div class="anu"><a href="#catalogo?o=ofertas"><b>${C.campana.nombre}</b> · −${C.campana.pct} % en prendas seleccionadas · termina en <span data-cuenta-texto>${cuentaTexto()}</span></a></div>`
      : `<div class="anu">Separa en línea · Recoge en ${t.ciudad} · Coordinas el pago con la tienda</div>`;
  }

  function megaRopa() {
    const nuevas = C.prendas.filter((p) => p.nuevo).slice(0, 3);
    return `
      <div class="mega" role="region" aria-label="Ropa">
        <div class="mega-in">
          ${C.menuRopa.map(([g, cats]) => `
            <div class="mega-grupo"><span class="ceja">${g}</span>
              ${cats.map((c) => `<a class="mega-cat" href="#catalogo?cat=${c}"><span>${C.nombreCat(c)}</span><small>${C.prendas.filter((p) => p.cat === c).length}</small></a>`).join("")}
            </div>`).join("")}
          <div class="mega-recien">
            <div class="mega-recien-cab"><span class="ceja">Recién llegado</span><a class="ver" href="#catalogo?o=nuevo">Ver todo ${I("flecha")}</a></div>
            <div class="mega-recien-fila">${nuevas.map((p) => `
              <a class="mega-prenda" href="#prenda/${p.id}"><span class="foto"><img src="${C.foto(p)}" alt="" loading="lazy"></span><span class="mega-prenda-n">${p.nombre}</span></a>`).join("")}</div>
          </div>
        </div>
      </div>`;
  }

  function menuTienda() {
    return `
      <div class="menu menu-tienda" role="menu" aria-label="Tu tienda" data-menu="tienda" hidden>
        <span class="ceja">Recoges en</span>
        ${C.tiendas.map((t) => `
          <button class="menu-op" role="menuitemradio" aria-checked="${t.id === T.tienda}" data-tienda="${t.id}">
            <span class="radio" aria-hidden="true"></span><span class="menu-op-t"><b>${t.ciudad}</b><small>${t.direccion}</small></span>${I("tienda")}
          </button>`).join("")}
        <div class="sel-aviso" role="alert" data-aviso-tienda hidden>
          <p>Tu bolsa se vaciará.</p>
          <div class="sel-aviso-acc"><button class="btn btn-chico" data-confirma-tienda>Cambiar a <span data-tienda-nueva></span></button><button class="enlace" data-cancela-tienda>Cancelar</button></div>
        </div>
      </div>`;
  }

  function menuPersona() {
    const n = T.favs.length;
    return T.sesion
      ? `<div class="menu menu-persona" role="menu" data-menu="cuenta" hidden>
          <p class="menu-hola">Hola, <b>${C.yo.nombre}</b></p>
          <a class="menu-op" role="menuitem" href="#cuenta">${I("usuario")}<span class="menu-op-t"><b>Mi perfil</b></span></a>
          <a class="menu-op" role="menuitem" href="#favoritos">${I("corazon")}<span class="menu-op-t"><b>Favoritos</b></span>${n ? `<small class="menu-n">${n}</small>` : ""}</a>
          <button class="menu-op" role="menuitem" data-salir>${I("salir")}<span class="menu-op-t"><b>Salir</b></span></button>
        </div>`
      : `<div class="menu menu-persona" role="menu" data-menu="cuenta" hidden>
          <a class="menu-op" role="menuitem" href="#entrar">${I("usuario")}<span class="menu-op-t"><b>Entrar</b></span></a>
          <a class="menu-op" role="menuitem" href="#crear">${I("mas")}<span class="menu-op-t"><b>Crear mi cuenta</b></span></a>
          <a class="menu-op" role="menuitem" href="#favoritos">${I("corazon")}<span class="menu-op-t"><b>Favoritos</b></span>${n ? `<small class="menu-n">${n}</small>` : ""}</a>
        </div>`;
  }

  function cabecera(actual) {
    const t = tiendaDe();
    const a = (r) => (actual === r ? ' aria-current="page"' : "");
    return `
    <header class="cab">
      <div class="cab-fila">
        <button class="ico btn-menu" data-abrir="menu" aria-label="Abrir el menú">${I("menu")}</button>
        ${logo()}
        <nav class="nav" aria-label="Secciones">
          <a class="nav-b" href="#catalogo?o=nuevo"${a("nuevo")}>Nuevo</a>
          <div class="mega-envol"><a class="nav-b" href="#catalogo" aria-haspopup="true"${a("ropa")}>Ropa ${I("chevron", "ic-chica")}</a>${megaRopa()}</div>
          <a class="nav-b" href="#looks"${a("looks")}>Looks</a>
          ${T.campana ? `<a class="nav-b nav-oferta" href="#catalogo?o=ofertas"${a("ofertas")}>Ofertas</a>` : ""}
        </nav>
        <span class="esp"></span>
        <div class="acc">
          <button class="ico ico-txt" data-abrir="buscar" aria-label="Buscar en la tienda">${I("buscar")}<span class="ico-t">Buscar</span></button>
          <div class="sel-tienda">
            <button class="nav-b nav-tienda" data-abrir="tienda" aria-haspopup="menu" aria-label="Tienda: ${t.ciudad}. Cambiar">${I("tienda")}<span class="nav-tienda-n"><b>${t.ciudad}</b></span>${I("chevron", "ic-chica")}</button>
            ${menuTienda()}
          </div>
          <a class="ico" href="#favoritos" aria-label="Favoritos${T.favs.length ? `, ${T.favs.length}` : ""}">${I("corazon")}<span class="globo" data-globo="fav" ${T.favs.length ? "" : "hidden"}>${T.favs.length}</span></a>
          <div class="persona">
            <button class="ico" data-abrir="cuenta" aria-haspopup="menu" aria-label="${T.sesion ? `Tu cuenta, ${C.yo.nombre}` : "Entrar o crear mi cuenta"}">${I("usuario")}${T.sesion ? '<span class="punto-sesion" aria-hidden="true"></span>' : ""}</button>
            ${menuPersona()}
          </div>
          <a class="ico bolsa-ico" href="#bolsa" aria-label="Tu bolsa${enBolsa() ? `, ${enBolsa()} ${enBolsa() === 1 ? "prenda" : "prendas"}` : ""}">${I("bolsa")}<span class="globo" data-globo="bolsa" ${enBolsa() ? "" : "hidden"}>${enBolsa()}</span></a>
        </div>
      </div>
    </header>`;
  }

  function pie() {
    return `
    <footer class="pie">
      <div class="pie-marca">${logo()}<p class="mute">Separa en línea, mándalo por WhatsApp y recógelo en tu tienda.</p>
        <div class="pie-tiendas">${C.tiendas.map((t) => `<a class="pie-t" href="#tiendas">${I("tienda", "ic-chica")}<span><b>${t.ciudad}</b><small>${t.horario.split(" · ")[0]}</small></span></a>`).join("")}</div></div>
      <div><span class="ceja">Tienda</span><ul><li><a href="#catalogo">Toda la tienda</a></li><li><a href="#catalogo?o=nuevo">Lo nuevo</a></li><li><a href="#looks">Arma tu look</a></li><li><a href="#portada">Más vendidos</a></li></ul></div>
      <div><span class="ceja">Ayuda</span><ul><li><a href="#portada">Cómo separar</a></li><li><a href="#tiendas">Nuestras tiendas</a></li><li><a href="#portada">Cambios y devoluciones</a></li></ul></div>
      <div><span class="ceja">Club CAYLA</span><ul><li><a href="${T.sesion ? "#cuenta" : "#crear"}">${T.sesion ? "Mi perfil" : "Crear mi cuenta"}</a></li><li><a href="#portada">Términos del Club</a></li><li><a href="#portada">Privacidad</a></li></ul></div>
      <p class="pie-fin mute">© CAYLA · Maqueta del spike: precios, tallas, stock y pedidos son de ejemplo.</p>
    </footer>`;
  }

  // ── Prenda: precio, insignias, tarjeta ───────────────────────────────────────────────────────────────────────────
  function precioHTML(p, grande = false) {
    const pr = C.precio(p);
    return `<span class="precio${pr.oferta ? " oferta" : ""}${grande ? " grande" : ""}"><b class="num">${C.soles(pr.principal)}</b>${pr.antes ? `<s class="num"><span class="sr">Antes </span>${C.soles(pr.antes)}</s>` : ""}</span>`;
  }
  function insignias(p, { sinNuevo = false, puesto = true } = {}) {
    const r = [];
    if (p.pct && T.campana) r.push(`<span class="ins ins-oferta">−${p.pct} %</span>`);
    if (p.nuevo && !sinNuevo) r.push(`<span class="ins ins-nuevo">Nuevo</span>`);
    if (p.puesto && puesto) r.push(`<span class="ins ins-puesto">N.º ${p.puesto}</span>`);
    return r.length ? `<span class="insignias">${r.slice(0, 3).join("")}</span>` : "";
  }
  // Lo que hay en la tienda elegida, en corto (la nota de la tarjeta).
  function notaStock(p) {
    const n = p.stock[T.tienda];
    const t = tiendaDe().ciudad;
    if (n > 3) return `<span class="tj-stock ok">Hay en ${t}</span>`;
    if (n > 1) return `<span class="tj-stock poco">Quedan ${n} en ${t}</span>`;
    if (n === 1) return `<span class="tj-stock poco">Última en ${t}</span>`;
    const otra = C.tiendas.find((x) => x.id !== T.tienda);
    return `<span class="tj-stock no">No hay en ${t}${p.stock[otra.id] > 0 ? ` · hay en ${otra.ciudad}` : ""}</span>`;
  }
  const favBoton = (p, forma = "tarjeta") => {
    const on = T.favs.includes(p.id);
    return `<button class="fav fav-${forma}" data-fav="${p.id}" aria-pressed="${on}" aria-label="${on ? "Quitar de favoritos" : "Guardar en favoritos"}: ${p.nombre}">${I(on ? "corazonlleno" : "corazon")}</button>`;
  };
  function tarjeta(p, i = 0, opt = {}) {
    const st = C.stockPorTalla(p, T.tienda);
    const rapido = p.tallas.map((t) => `<button class="tj-talla" data-rapido="${p.id}" data-talla="${t}" ${st[t] > 0 ? "" : "disabled"} aria-label="Agregar talla ${t}">${t}</button>`).join("");
    return `
    <article class="tj rv ${opt.extra || ""}" style="--i:${i}" data-id="${p.id}" data-cat="${p.cat}" data-aqp="${p.stock.aqp}" data-tru="${p.stock.tru}" data-pct="${p.pct || 0}">
      <div class="tj-foto">
        <a class="tj-enlace" href="#prenda/${p.id}" aria-label="${p.nombre}" data-foto-viaja="${p.id}"><img src="${C.foto(p)}" alt="" loading="lazy"></a>
        ${insignias(p, opt)}
        ${favBoton(p)}
        <div class="tj-rapido" aria-label="Agregar rápido"><span class="tj-rapido-t">Agregar</span><span class="tj-tallas">${rapido}</span></div>
      </div>
      <div class="tj-info">
        <a class="tj-nom" href="#prenda/${p.id}">${p.nombre}</a>
        ${precioHTML(p)}
        ${opt.meta === false ? "" : `<span class="tj-meta">${C.nombreCat(p.cat)} · ${p.colores.length === 1 ? p.colores[0][0] : p.colores.length + " colores"}</span>`}
        ${opt.stock === false ? "" : notaStock(p)}
      </div>
    </article>`;
  }

  // ── Formularios y vacíos ─────────────────────────────────────────────────────────────────────────────────────────
  // Un campo con su estado: «sigue» (el que toca), «hecho» (✓) o «error»; la marca se dice con texto, nunca solo con color.
  function campo({ id, etiqueta, tipo = "text", placeholder = "", estado = "", nota = "", valor = "", auto = "", extra = "", lado = "" }) {
    const marca = estado === "hecho" ? `${I("check", "ic-chica")} Listo` : estado === "sigue" ? "Sigue aquí" : estado === "error" ? `${I("alerta", "ic-chica")} Revisa` : "";
    return `
    <div class="campo" data-campo="${id}" data-estado="${estado}">
      <label class="campo-et" for="${id}"><span>${etiqueta}</span><span class="campo-marca">${marca}</span></label>
      <div class="campo-caja"><input id="${id}" name="${id}" type="${tipo}" placeholder="${placeholder}" value="${valor}" ${auto ? `autocomplete="${auto}"` : ""} ${estado === "error" ? 'aria-invalid="true"' : ""} aria-describedby="${id}-nota" ${extra}>${lado}</div>
      <p class="campo-nota" id="${id}-nota" ${estado === "error" ? 'role="alert"' : ""}>${nota}</p>
    </div>`;
  }
  function vacio({ icono = "tienda", titulo, texto, acciones = "", chico = false }) {
    return `<div class="vacio${chico ? " vacio-chico" : ""}" role="status">${I(icono, "vacio-ico")}<h3>${titulo}</h3><p>${texto}</p>${acciones ? `<div class="acciones">${acciones}</div>` : ""}</div>`;
  }
  const estadoChip = (e) => {
    const [t] = C.ESTADOS_PEDIDO[e];
    return `<span class="chip chip-${e}">${e === "lista" ? I("check", "ic-chica") : ""}${t}</span>`;
  };

  window.PZ = { T, C, I, P, guardar, tiendaDe, enBolsa, cuentaHTML, cuentaTexto, partesCuenta, logo, logoSvg, palabraSvg, colibriSvg, anuncio, cabecera, pie, precioHTML, insignias, notaStock, favBoton, tarjeta, campo, vacio, estadoChip, megaRopa };
})();
