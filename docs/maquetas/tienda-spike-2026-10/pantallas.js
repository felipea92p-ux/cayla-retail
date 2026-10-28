// Las pantallas del spike (cada una devuelve su HTML): portada, catálogo, prenda, bolsa, separada, entrar, crear cuenta, mi perfil,
// favoritos, tiendas, looks, un look y las piezas del sistema. La portada tiene una composición propia por dirección (`DIRECCION.hero`);
// lo demás es la misma estructura y cada dirección la viste con su CSS.
(function () {
  const { T, C, I, P, tiendaDe, enBolsa, cuentaHTML, cuentaTexto, logo, anuncio, cabecera, pie, precioHTML, insignias, tarjeta, campo, vacio, estadoChip, favBoton } = window.PZ;
  const D = window.DIRECCION;
  const img = (id, alt = "") => `<img src="${C.foto(P(id))}" alt="${alt}">`;
  const foto = (id, alt = "") => `<span class="foto">${img(id, alt)}</span>`;
  const secCab = (titulo, der = "", id = "") => `<div class="sec-cab rv"><h2 ${id ? `id="${id}"` : ""} class="disp t-h2">${titulo}</h2>${der}</div>`;
  const ver = (href, txt = "Ver todo") => `<a class="ver" href="${href}">${txt} ${I("flecha")}</a>`;
  const totalDe = (ids) => ids.reduce((s, id) => s + C.precio(P(id)).principal, 0);
  const ciudad = () => tiendaDe().ciudad;

  // Estado de la ficha y del catálogo mientras se mira (se reinicia al cambiar de pantalla; lo maneja app.js).
  const S = { color: null, talla: null, pideTalla: false, agregado: null, filtros: { cat: "todo", talla: null, color: null, soloTienda: false, orden: "nuevo", ofertas: false, nuevo: false }, foto: 0 };

  // ── La portada ────────────────────────────────────────────────────────────────────────────────────────────────────
  const texto = () => T.campana
    ? { ceja: "Campaña · hasta el 28 de octubre", tit: ["Aniversario", "CAYLA"], p: `Hasta ${C.campana.pct} % en prendas seleccionadas. Sepáralas online, confírmalas por WhatsApp y recógelas en tu tienda.`, cta: ["Ver las ofertas", "#catalogo?o=ofertas"], sec: ["Ver toda la tienda", "#catalogo"] }
    : { ceja: "Llegó en los últimos 30 días", tit: ["Separa en línea.", "Recoge en tu tienda."], p: "Mira lo que hay en cada tienda, sepáralo aquí y recógelo en tu tienda.", cta: ["Ver lo nuevo", "#catalogo?o=nuevo"], sec: ["Ver toda la tienda", "#catalogo"] };
  const ctas = () => { const t = texto(); return `<div class="acciones"><a class="btn" href="${t.cta[1]}">${t.cta[0]} ${I("flecha")}</a><a class="link" href="${t.sec[1]}">${t.sec[0]}</a></div>`; };
  const cuentaHero = () => (T.campana ? `<div class="hero-cuenta"><span class="ceja">Termina en</span>${cuentaHTML()}</div>` : "");
  const trio = () => (T.campana ? ["tiana", "luna", "semicadera"] : ["kalessi", "strend", "cuello-v"]);
  const chipsDe = (id) => (T.campana && P(id).pct ? `<span class="ins ins-oferta placa-ins">−${P(id).pct} %</span>` : P(id).nuevo ? `<span class="ins ins-nuevo placa-ins">Nuevo</span>` : "");

  const HEROES = {
    // Blanco: el titular enorme y tres placas de distinto tamaño que lo cruzan, cada una con su número como en un catálogo de arte.
    colage: () => {
      const t = texto();
      return `
      <section class="h h-colage${T.campana ? " h-campana" : ""}">
        <div class="h-lineas"><span class="ceja mute sube">${t.ceja}</span><h1 class="disp h-tit sube">${t.tit[0]}<br>${t.tit[1]}</h1></div>
        <div class="h-placas">${trio().map((id, i) => `
          <a class="placa p${i + 1} ${["px-a", "px-b", "px-c"][i]}" href="#prenda/${id}"><span class="placa-in sube" style="--i:${i + 1}"><span class="foto">${img(id)}${chipsDe(id)}</span><span class="placa-pie"><b class="num">0${i + 1}</b><span class="tj-nom">${P(id).nombre}</span>${precioHTML(P(id))}</span></span></a>`).join("")}</div>
        <div class="h-lado sube" style="--i:4"><p>${t.p}</p>${cuentaHero()}${ctas()}</div>
      </section>`;
    },
    // Arcilla: un disco de arcilla detrás y tres óvalos escalonados con su luz y su sombra de piso.
    ovalos: () => {
      const t = texto();
      const tit = T.campana ? `${t.tit[0].toLowerCase()}<br>${t.tit[1].toLowerCase()}` : `${t.tit[0].toLowerCase()}<br>${t.tit[1].toLowerCase()}`;
      return `
      <section class="h h-ovalos${T.campana ? " h-campana" : ""}">
        <span class="ceja mute sube">${t.ceja}</span>
        <h1 class="disp h-tit sube">${tit}</h1>
        <div class="ovalos"><span class="disco" aria-hidden="true"></span>${trio().map((id, i) => `
          <a class="ov ov-${i + 1} ${["px-c", "px-b", "px-a"][i]}" href="#prenda/${id}"><span class="ov-in sube" style="--i:${i + 1}"><span class="foto">${img(id)}${chipsDe(id)}</span><span class="tj-nom">${P(id).nombre}</span>${precioHTML(P(id))}</span></a>`).join("")}</div>
        <div class="h-pie sube" style="--i:4"><p>${t.p}</p>${cuentaHero()}${ctas()}</div>
      </section>`;
    },
    // Rojo colibrí: un campo de rojo entero con una palabra fantasma, y dos tarjetas apiladas que lo cruzan.
    campo: () => {
      const t = texto();
      const [a, b] = trio();
      return `
      <section class="h h-campo${T.campana ? " h-campana" : ""}">
        <div class="campo-rojo">
          <span class="fantasma px-b" aria-hidden="true">${T.campana ? `−${C.campana.pct} %` : "SEPARA"}</span>
          <span class="ceja">${t.ceja}</span>
          <h1 class="disp h-tit sube">${t.tit[0]}<br>${t.tit[1]}</h1>
          <p>${t.p}</p>${cuentaHero()}${ctas()}
        </div>
        <a class="campo-foto2 px-b" href="#prenda/${b}" tabindex="-1" aria-hidden="true"><span class="foto">${img(b)}</span></a>
        <a class="campo-foto px-a" href="#prenda/${a}"><span class="foto">${img(a, P(a).nombre)}${chipsDe(a)}</span><span class="h-leyenda"><span class="tj-nom">${P(a).nombre}</span>${precioHTML(P(a))}</span></a>
      </section>`;
    },
  };

  const franja = () => (T.sesion ? "" : `
    <div class="franja" role="list" aria-label="Lo que ofrece la tienda">
      <div role="listitem">${I("bolsa")}<span><b>Separa sin pagar</b><small>Nada se cobra en la web</small></span></div>
      <div role="listitem">${I("tienda")}<span><b>Recoge en ${ciudad()}</b><small>Con tu código</small></span></div>
      <div role="listitem">${I("regalo")}<span><b>Puntos del Club</b><small>En cada compra</small></span></div>
      <div role="listitem">${I("ayuda")}<span><b>Cambios en tienda</b><small>En cualquier tienda CAYLA</small></span></div>
    </div>`);

  const REP = { blusas: "kalessi", tops: "cuello-v", pantalones: "tiana", faldas: "luna", corsets: "alba" };
  const lookCard = (l, i) => {
    const [a, b] = l.prendas;
    return `
    <article class="look-card rv" style="--i:${i}">
      <a class="look-fotos" href="#look/${l.n}" aria-label="Look ${l.n}: ${l.titulo}"><span class="foto look-f1">${img(a)}</span><span class="foto look-f2">${img(b)}</span></a>
      <div class="look-info"><span class="ceja mute">Look N.º ${l.n}</span><h3 class="look-t">${l.titulo}</h3>
        <div class="look-pie"><span class="precio"><b class="num">${C.soles(totalDe(l.prendas))}</b></span><button class="btn btn-chico btn-sec" data-look="${l.n}">Agregar look</button></div></div>
    </article>`;
  };

  function portada() {
    const nuevos = [...C.prendas.filter((p) => p.nuevo), ...C.prendas.filter((p) => !p.nuevo)].slice(0, 8);
    const ofertas = C.prendas.filter((p) => p.pct).slice(0, 4);
    const top = C.prendas.filter((p) => p.puesto).sort((a, b) => a.puesto - b.puesto);
    return `
    ${HEROES[D.hero]()}
    ${franja()}
    <section class="sec" aria-labelledby="lo-nuevo">
      ${secCab("Lo <em>nuevo</em>", ver("#catalogo?o=nuevo"), "lo-nuevo")}
      <div class="carril-envol">
        <button class="carril-b prev" data-carril="-1" aria-label="Ver las anteriores" disabled>${I("flechaizq")}</button>
        <div class="carril" data-carril-lista>${nuevos.map((p, i) => tarjeta(p, i, { extra: "tj-carril" })).join("")}</div>
        <button class="carril-b next" data-carril="1" aria-label="Ver las siguientes">${I("flecha")}</button>
      </div>
    </section>
    <section class="sec" aria-labelledby="por-categoria">
      ${secCab("Compra por <em>categoría</em>", ver("#catalogo", "Toda la tienda"), "por-categoria")}
      <div class="cat-tiles">${C.categorias.slice(1).map(([k, n], i) => `
        <a class="cat-tile rv" style="--i:${i}" href="#catalogo?cat=${k}"><span class="foto">${img(REP[k])}</span><span class="cat-nom">${n}</span><small>${C.prendas.filter((p) => p.cat === k).length} prendas</small></a>`).join("")}</div>
    </section>
    <section class="sec" aria-labelledby="arma-tu-look">
      ${secCab("Arma tu <em>look</em>", ver("#looks", "Ver los looks"), "arma-tu-look")}
      <div class="looks-inicio">${C.looks.slice(0, 3).map(lookCard).join("")}</div>
    </section>
    ${T.campana ? `
    <section class="ofertas" id="ofertas" aria-labelledby="las-ofertas">
      <div class="ofertas-in">
        <div class="ofertas-cab rv"><div><span class="ceja">${C.campana.nombre}</span><h2 id="las-ofertas" class="disp t-h2">Hasta ${C.campana.pct} % en <em>prendas seleccionadas</em></h2></div><div class="ofertas-der"><div class="hero-cuenta"><span class="ceja">Termina en</span>${cuentaHTML()}</div>${ver("#catalogo?o=ofertas", "Ver las ofertas")}</div></div>
        <div class="rejilla" style="--cols:4">${ofertas.map((p, i) => tarjeta(p, i, { puesto: false })).join("")}</div>
      </div>
    </section>` : ""}
    <section class="sec" aria-labelledby="mas-vendidos">
      ${secCab("Lo más <em>vendido</em>", ver("#catalogo?o=vendidos"), "mas-vendidos")}
      <ol class="top">${top.map((p, i) => `<li class="rv" style="--i:${i}"><span class="top-n" aria-hidden="true">${p.puesto}</span>${tarjeta(p, 0, { puesto: false, meta: false, extra: "tj-top" })}</li>`).join("")}</ol>
    </section>
    <section class="sec" aria-labelledby="asi-se-separa">
      ${secCab("Así se <em>separa</em>", `<span class="ceja mute">Sin pagar en la web</span>`, "asi-se-separa")}
      <ol class="pasos">${C.pasos.map(([t, d], i) => {
        const hecho = T.sesion && i === 0;
        return `<li class="paso rv${hecho ? " hecho" : ""}" style="--i:${i}"><span class="paso-n" aria-hidden="true">${hecho ? I("check") : i + 1}</span><h3>${hecho ? "Ya tienes tu cuenta" : t}</h3><p>${hecho ? "Con ella separas y sigues tus pedidos." : d}</p>${hecho ? '<span class="sr">Hecho</span>' : ""}</li>`;
      }).join("")}</ol>
    </section>
    <section class="club rv" aria-labelledby="club-t">
      <div class="club-txt"><span class="ceja">Club CAYLA</span><h2 id="club-t" class="disp t-h1">${T.sesion ? "Tu cuenta ya es del <em>Club</em>" : "Tu cuenta es tu <em>membresía</em>"}</h2><p>${T.sesion ? `${C.yo.puntos.saldo.toLocaleString("es-PE")} puntos valen ${C.soles(C.yo.puntos.vale)}. Míralos en tu perfil.` : "Al crear tu cuenta entras al Club. No hay que llenar nada más."}</p><a class="btn" href="${T.sesion ? "#cuenta" : "#crear"}">${T.sesion ? "Ver mi perfil" : "Crear mi cuenta"}</a></div>
      <ul class="club-lista">${C.club.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join("")}</ul>
      ${miembro()}
    </section>
    <section class="sec" aria-labelledby="nuestras-tiendas">
      ${secCab("Nuestras <em>tiendas</em>", `<span class="ceja mute">Recoge en la que te quede cerca</span>`, "nuestras-tiendas")}
      <div class="tiendas">${C.tiendas.map(tiendaCard).join("")}</div>
    </section>`;
  }

  // La tarjeta de miembro del Club (la de la portada y la de «Mi perfil»).
  function miembro() {
    const nombre = T.sesion ? `${C.yo.nombre} ${C.yo.apellido}` : "Tu nombre aquí";
    return `<div class="miembro" aria-hidden="true"><span class="miembro-logo">${window.PZ.palabraSvg()}</span><span class="miembro-chip">${I("estrella", "ic-chica")} Club</span><span class="miembro-nombre">${nombre}</span><span class="miembro-pie"><small>Miembro desde</small><b class="num">${C.yo.desde}</b><small>N.º</small><b class="num">${C.yo.numero}</b></span></div>`;
  }
  const tiendaCard = (t, i) => `
    <article class="tienda rv" style="--i:${i}">
      <h3 class="disp t-h2">${t.ciudad}</h3>
      <p class="tienda-fila">${I("tienda", "ic-chica")}<span>${t.direccion}</span></p>
      <p class="tienda-fila">${I("reloj", "ic-chica")}<span>${t.horario}</span></p>
      <p class="tienda-fila">${I("whatsapp", "ic-chica")}<span>WhatsApp ${t.whatsapp}</span></p>
      <div class="acciones"><a class="btn btn-sec" href="#catalogo" data-elegir-tienda="${t.id}">Ver lo que hay</a><a class="link" href="#tiendas">Cómo llegar</a></div>
    </article>`;

  // ── El catálogo ───────────────────────────────────────────────────────────────────────────────────────────────────
  function listaFiltrada() {
    const f = S.filtros;
    let l = C.prendas.filter((p) => (f.cat === "todo" || p.cat === f.cat) && (!f.talla || p.tallas.includes(f.talla)) && (!f.color || p.colores.some((c) => c[0] === f.color)) && (!f.soloTienda || p.stock[T.tienda] > 0) && (!f.ofertas || p.pct) && (!f.nuevo || p.nuevo));
    const ord = { nuevo: (a, b) => (b.nuevo ? 1 : 0) - (a.nuevo ? 1 : 0), menor: (a, b) => C.precio(a).principal - C.precio(b).principal, mayor: (a, b) => C.precio(b).principal - C.precio(a).principal, vendidos: (a, b) => (a.puesto || 99) - (b.puesto || 99) }[f.orden];
    return ord ? [...l].sort(ord) : l;
  }
  const tituloCat = () => (S.filtros.ofertas ? "Ofertas" : S.filtros.nuevo ? "Lo nuevo" : S.filtros.orden === "vendidos" ? "Lo más vendido" : S.filtros.cat === "todo" ? "Toda la tienda" : C.nombreCat(S.filtros.cat));
  function activos() {
    const f = S.filtros, a = [];
    if (f.talla) a.push(["talla", `Talla ${f.talla}`]);
    if (f.color) a.push(["color", f.color]);
    if (f.soloTienda) a.push(["soloTienda", `Solo lo que hay en ${ciudad()}`]);
    return a.length ? `${a.map(([k, t]) => `<button class="pildora pildora-puesta" data-quitar-filtro="${k}">${t} ${I("x", "ic-chica")}</button>`).join("")}<button class="boton-limpiar" data-limpiar-filtros>${I("filtro", "ic-chica")} Limpiar todo</button>` : "";
  }
  function rejillaCat() {
    const l = listaFiltrada();
    if (!l.length) {
      return vacio({ icono: "buscar", titulo: "No hay prendas con eso", texto: `Prueba con otra talla o quita un filtro. Si cambias de tienda, quizá ahí sí la hay.`, acciones: `<button class="btn" data-limpiar-filtros>Limpiar los filtros</button>` });
    }
    return `<div class="rejilla dens" data-rejilla>${l.map((p, i) => tarjeta(p, i % 6, { extra: i === 0 && l.length > 6 ? "grande" : i === 7 && l.length > 9 ? "grande" : "" })).join("")}</div>`;
  }
  function catalogo() {
    const f = S.filtros;
    const n = listaFiltrada().length;
    return `
    <div class="cat-cab"><div><span class="ceja mute">Tienda online</span><h1 class="disp t-h1 sube" data-titulo>${tituloCat()}</h1></div><span class="cat-n"><b class="num" data-n-prendas>${n}</b> ${n === 1 ? "prenda" : "prendas"} en ${ciudad()}</span></div>
    <div class="filtros" data-filtros>
      <div class="cats" role="group" aria-label="Categoría">${C.categorias.map(([k, nom]) => `<button data-cat="${k}" aria-pressed="${f.cat === k && !f.ofertas && !f.nuevo}">${nom}</button>`).join("")}</div>
      <div class="filtros-der">
        <button class="pildora" data-abrir="filtros" aria-haspopup="dialog">${I("filtro", "ic-chica")} Filtros<span class="globo-chico" data-n-filtros ${[f.talla, f.color, f.soloTienda].filter(Boolean).length ? "" : "hidden"}>${[f.talla, f.color, f.soloTienda].filter(Boolean).length}</span></button>
        <label class="orden"><span class="sr">Ordenar por</span><select data-orden>${[["nuevo", "Recién llegado"], ["vendidos", "Lo más vendido"], ["menor", "Precio: de menor a mayor"], ["mayor", "Precio: de mayor a menor"]].map(([v, t]) => `<option value="${v}" ${f.orden === v ? "selected" : ""}>${t}</option>`).join("")}</select>${I("chevron", "ic-chica")}</label>
      </div>
    </div>
    <div class="activos" data-activos>${activos()}</div>
    <div class="cat-rejilla" data-cat-rejilla>${rejillaCat()}</div>`;
  }

  // ── La ficha de una prenda ────────────────────────────────────────────────────────────────────────────────────────
  function tablaStock(p, colorNombre) {
    const t = tiendaDe();
    const st = C.stockPorTalla(p, t.id);
    return `
    <div class="bloque bloque-stock">
      <span class="etq"><span>Cuánto hay en ${t.ciudad} <b>${colorNombre}</b></span></span>
      <div class="stock-envol"><table class="stock"><caption class="sr">Cuánto hay de ${p.nombre} en ${colorNombre}, en ${t.ciudad}, por talla</caption>
        <thead><tr><th scope="col"><span class="sr">Tienda</span></th>${p.tallas.map((x) => `<th scope="col" class="${S.talla === x ? "elegida" : ""}">${x}</th>`).join("")}</tr></thead>
        <tbody><tr><th scope="row">${t.ciudad}</th>${p.tallas.map((x) => `<td class="${S.talla === x ? "elegida" : ""} ${st[x] <= 0 ? "cero" : st[x] <= 1 ? "ultima" : ""}">${C.nivel(st[x])}</td>`).join("")}</tr></tbody></table></div>
    </div>`;
  }
  function prenda(id) {
    const p = P(id);
    S.color = S.color || p.colores[0][0];
    const colorIdx = Math.max(0, p.colores.findIndex((c) => c[0] === S.color));
    const t = tiendaDe();
    const st = C.stockPorTalla(p, t.id);
    const hayAqui = p.stock[t.id] > 0;
    const otra = C.tiendas.find((x) => x.id !== t.id);
    const talla = S.talla;
    const tallaAgotada = talla && st[talla] <= 0;
    const chips = [p.nuevo ? `<span class="chip chip-nuevo">Nuevo</span>` : "", p.puesto ? `<span class="chip chip-puesto">N.º ${p.puesto} en lo más vendido</span>` : "", p.pct && T.campana ? `<span class="chip chip-oferta">${I("chispas", "ic-chica")} ${C.campana.nombre} −${p.pct} %</span>` : ""].join("");
    const va = [...C.looks.filter((l) => l.prendas.includes(p.id)).flatMap((l) => l.prendas), ...C.prendas.filter((x) => x.cat !== p.cat).map((x) => x.id)].filter((x, i, a) => x !== p.id && a.indexOf(x) === i).slice(0, 4);
    const mismas = C.prendas.filter((x) => x.cat === p.cat && x.id !== p.id).slice(0, 4);
    const cta = !hayAqui
      ? `<button class="btn" data-avisame="${p.id}">${I("campana")} Avísame cuando llegue</button>`
      : tallaAgotada
        ? `<button class="btn" data-avisame="${p.id}">${I("campana")} Avísame cuando llegue la ${talla}</button>`
        : `<button class="btn" data-agregar="${p.id}">Agregar a la bolsa</button>`;
    const linea = S.agregado === p.id
      ? `<p class="pdp-bolsa" role="status" data-lleno>${I("check")} <span>Agregaste ${p.nombre}, talla ${S.talla}.</span><a class="enlace" href="#bolsa">Ver mi bolsa (${enBolsa()})</a></p>`
      : `<p class="pdp-bolsa" role="status"></p>`;
    return `
    <nav class="ruta" aria-label="Dónde estás"><a href="#catalogo">Toda la tienda</a><span aria-hidden="true">/</span><a href="#catalogo?cat=${p.cat}">${C.nombreCat(p.cat)}</a><span aria-hidden="true">/</span><span aria-current="page">${p.nombre}</span></nav>
    <section class="pdp">
      <div class="galeria">
        ${p.foto.length > 1 ? `<div class="galeria-mini" role="group" aria-label="Fotos">${p.foto.map((_, i) => `<button class="foto" data-foto="${i}" aria-pressed="${S.foto === i}" aria-label="Foto ${i + 1}"><img src="${C.foto(p, i)}" alt=""></button>`).join("")}</div>` : ""}
        <figure class="foto foto-grande" data-viaja="${p.id}" data-lupa><img src="${C.foto(p, Math.min(S.foto, p.foto.length - 1))}" alt="${p.nombre}, foto ${S.foto + 1}">
          ${colorIdx > 0 ? `<figcaption class="foto-chip">Foto en otro color</figcaption>` : `<figcaption class="foto-chip">${I("tienda", "ic-chica")} ${C.nivelFrase(p.stock[t.id])} en ${t.ciudad}</figcaption>`}
          ${favBoton(p, "ficha")}<span class="lupa-pista">${I("zoom", "ic-chica")}</span>
        </figure>
      </div>
      <div class="panel">
        ${chips ? `<div class="pdp-chips">${chips}</div>` : ""}
        <h1>${p.nombre}</h1>
        <div class="bloque bloque-precio">
          ${precioHTML(p, true)}
          ${p.pct && T.campana ? `<span class="falta">${I("reloj", "ic-chica")} Termina en <b data-cuenta-texto>${cuentaTexto()}</b></span>` : ""}
        </div>
        <div class="bloque"><span class="etq"><span>Color <b>${S.color}</b></span></span>
          <div class="swatches" role="group" aria-label="Color" data-grupo="color">${p.colores.map(([n, hex]) => `<button class="swatch" data-valor="${n}" aria-pressed="${n === S.color}"><i style="background:${hex}" data-color-dato aria-hidden="true"></i>${n}</button>`).join("")}</div>
          ${colorIdx > 0 ? `<span class="swatch-nota">Este color aún no tiene foto: la ves en otro color.</span>` : ""}
        </div>
        <div class="bloque" data-bloque-tallas ${S.pideTalla && !S.talla ? "data-pide" : ""}>
          <span class="etq"><span>Talla${talla ? ` <b>${talla}</b>` : ""}</span>${S.pideTalla && !S.talla ? `<span class="etq-pide" role="status">Elige una para seguir</span>` : `<a class="enlace enlace-chico" href="#" data-abrir="guia">Guía de tallas</a>`}</span>
          <div class="tallas" role="group" aria-label="Talla" data-grupo="talla">${p.tallas.map((x) => `<button class="talla" data-valor="${x}" aria-pressed="${x === talla}" ${st[x] <= 0 ? "data-agotada" : ""}>${x}${st[x] <= 0 ? "<small>Agotada</small>" : st[x] === 1 ? "<small>Última</small>" : ""}</button>`).join("")}</div>
        </div>
        ${tablaStock(p, S.color)}
        ${p.id === "kalessi" ? `<p class="aviso-suave" role="status">${I("reloj", "ic-chica")}<span>3 personas la separaron hoy.</span></p>` : ""}
        ${!hayAqui && p.stock[otra.id] > 0 ? `<p class="aviso-suave" role="status">${I("tienda", "ic-chica")}<span>No hay en ${t.ciudad}, pero sí en ${otra.ciudad}. Cambia de tienda arriba para separarla.</span></p>` : ""}
        <div class="cta-linea">${cta}${favBoton(p, "cta")}</div>
        ${linea}
        <a class="btn btn-sec btn-probar" href="#looks">${I("chispas")} Arma un look con esta prenda</a>
        <div class="acordeon"><details open><summary>Detalles ${I("chevron", "ic-chica")}</summary><p>${p.desc}</p></details></div>
      </div>
    </section>
    <section class="sec" aria-labelledby="va-con">${secCab("Va <em>con</em>", "", "va-con")}<div class="rejilla" style="--cols:4">${va.map((x, i) => tarjeta(P(x), i, { meta: false })).join("")}</div></section>
    ${mismas.length ? `<section class="sec" aria-labelledby="sigue">${secCab(`Más de <em>${C.nombreCat(p.cat).toLowerCase()}</em>`, ver(`#catalogo?cat=${p.cat}`), "sigue")}<div class="rejilla" style="--cols:4">${mismas.map((x, i) => tarjeta(x, i, { meta: false })).join("")}</div></section>` : ""}
    <div class="barra-compra" aria-label="Agregar a la bolsa"><div class="barra-compra-info"><span class="tj-nom">${p.nombre}</span>${precioHTML(p)}</div>${cta}</div>`;
  }

  // ── La bolsa ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const lineaMarca = (l) => {
    const p = P(l.id);
    const n = C.stockPorTalla(p, T.tienda)[l.talla] ?? 0;
    return n > 0 ? { tipo: "hay", texto: `${n === 1 ? "Queda la última" : "Hay"} en ${ciudad()}` } : { tipo: "agotada", texto: `Agotada en ${ciudad()}: quítala para seguir` };
  };
  function totales() {
    let subtotal = 0, ahorro = 0, prendas = 0;
    T.bolsa.forEach((l) => { const pr = C.precio(P(l.id)); const antes = pr.antes || pr.principal; subtotal += antes * l.cant; ahorro += (antes - pr.principal) * l.cant; prendas += l.cant; });
    const cupon = T.cupon ? 10 : 0;
    return { subtotal, ahorro: T.campana ? ahorro : 0, cupon, prendas, total: subtotal - (T.campana ? ahorro : 0) - cupon };
  }
  function bolsa() {
    if (!T.bolsa.length) {
      const sug = C.prendas.filter((p) => p.puesto).sort((a, b) => a.puesto - b.puesto).slice(0, 4);
      return `
      <div class="bolsa-vacia">${vacio({ icono: "bolsa", titulo: "Tu bolsa está vacía", texto: "Elige una prenda y su talla, o agrega un look completo.", acciones: `<a class="btn" href="#catalogo">Ver toda la tienda</a><a class="btn btn-sec" href="#looks">Ver los looks</a>` })}</div>
      <section class="sec" aria-labelledby="sigue-m">${secCab("Sigue <em>mirando</em>", ver("#catalogo?o=vendidos", "Lo más vendido"), "sigue-m")}<div class="rejilla" style="--cols:4">${sug.map((p, i) => tarjeta(p, i, { meta: false })).join("")}</div></section>`;
    }
    const t = totales();
    const agot = T.bolsa.some((l) => lineaMarca(l).tipo === "agotada");
    return `
    <div class="cat-cab"><div><span class="ceja mute">Tu bolsa</span><h1 class="disp t-h1 sube">${t.prendas} ${t.prendas === 1 ? "prenda" : "prendas"} <em>por separar</em></h1></div>${ver("#catalogo", "Seguir mirando")}</div>
    <ol class="pasos-bolsa" aria-label="Pasos para separar"><li class="hecho"><span>Tu bolsa</span></li><li class="hecho"><span>Tu tienda</span></li><li class="${T.sesion ? "hecho" : ""}"><span>${T.sesion ? "Lista para separar" : "Tu cuenta"}</span></li></ol>
    <section class="bolsa-cuerpo">
      <div class="bolsa-principal">
        <div class="bolsa-items">${T.bolsa.map((l, i) => {
          const p = P(l.id), pr = C.precio(p), m = lineaMarca(l);
          return `
          <div class="bolsa-item sube" style="--i:${i}" data-marca="${m.tipo}">
            <a class="foto" href="#prenda/${p.id}" aria-hidden="true" tabindex="-1">${img(p.id)}</a>
            <span class="bi-txt">
              <a class="tj-nom" href="#prenda/${p.id}">${p.nombre}</a>
              <small>${l.color} · Talla ${l.talla}</small>
              ${pr.oferta && T.campana ? `<span class="bi-campana">${C.campana.nombre} −${pr.pct} %</span>` : ""}
              ${m.tipo === "hay" ? `<small class="ok">${I("check", "ic-chica")} ${m.texto}</small>` : `<em class="mal">${m.texto}</em>`}
            </span>
            <span class="bi-der"><b class="num">${C.soles(pr.principal * l.cant)}</b>${pr.antes && T.campana ? `<s class="num"><span class="sr">Antes </span>${C.soles(pr.antes * l.cant)}</s>` : ""}</span>
            <div class="bi-acc">
              ${m.tipo === "hay" ? `<div class="cantidad" role="group" aria-label="Cantidad de ${p.nombre}"><button data-cant="${i}" data-d="-1" aria-label="Quitar una" ${l.cant <= 1 ? "disabled" : ""}>${I("menos")}</button><output class="num">${l.cant}</output><button data-cant="${i}" data-d="1" aria-label="Agregar una" ${l.cant >= 3 ? "disabled" : ""}>${I("mas")}</button></div>` : ""}
              <button class="quitar" data-quitar="${i}" aria-label="Quitar de tu bolsa: ${p.nombre}">Quitar</button>
            </div>
          </div>`;
        }).join("")}</div>
        <div class="bloque-tienda"><span class="etq"><span>Recoges en</span></span>
          <div class="op-tienda op-fija"><span class="op-t"><b>${tiendaDe().ciudad}</b><small>${tiendaDe().direccion} · ${tiendaDe().horario.split(" · ")[0]}</small></span>${I("tienda")}</div>
          <p class="mute nota-chica">Tu bolsa es de esta tienda. Para cambiarla, usa el selector de arriba (la bolsa se vaciará).</p>
        </div>
      </div>
      <div class="bolsa-lado">
        <aside class="resumen" aria-label="Resumen">
          <h3>Resumen</h3>
          <div class="res-filas">
            <div><span>Prendas (${t.prendas})</span><span class="num">${C.soles(t.subtotal)}</span></div>
            ${t.ahorro ? `<div><span>Ahorras con las campañas</span><span class="num ahorro">−${C.soles(t.ahorro)}</span></div>` : ""}
            ${t.cupon ? `<div><span>Cupón ${T.cupon}</span><span class="num ahorro">−${C.soles(t.cupon)}</span></div>` : ""}
            <div class="tot"><span>Total de tu pedido</span><span class="num">${C.soles(t.total)}</span></div>
          </div>
          <ul class="promesas"><li>${I("check", "ic-chica")} Separar no cuesta nada</li><li>${I("whatsapp", "ic-chica")} La tienda la confirma por WhatsApp</li><li>${I("tienda", "ic-chica")} La recoges con tu código</li></ul>
        </aside>
        <form class="separar" data-form-separar novalidate>
          ${T.sesion ? `
          <div class="cupon" data-cupon>
            <label class="campo-et" for="cupon"><span>Código de cupón</span></label>
            <div class="cupon-fila"><input id="cupon" name="cupon" placeholder="Escríbelo o elige uno" value="${T.cupon || ""}" autocomplete="off"><button class="btn btn-sec btn-chico" type="button" data-cupon-aplicar>${T.cupon ? "Quitar" : "Aplicar"}</button></div>
            ${!T.cupon ? `<div class="cupon-mios"><button type="button" class="pildora" data-cupon-mio="ANIV-7K2P">${I("regalo", "ic-chica")} ANIV-7K2P · S/ 10</button></div>` : `<p class="campo-nota ok">${I("check", "ic-chica")} Cupón aplicado: S/ 10 de descuento.</p>`}
          </div>` : ""}
          <button class="btn btn-ancho btn-separar" ${agot ? "disabled" : ""} type="submit">${T.sesion ? `Separar en ${tiendaDe().ciudad}` : "Entra para separar"}</button>
          <p class="nota-chica mute">${agot ? "Quita lo que está agotado para poder separar." : T.sesion ? "Al separar, armamos tu mensaje de WhatsApp. No pagas nada en la web." : "Entra o crea tu cuenta con tu correo, en un minuto. Tu bolsa te espera aquí."}</p>
          <p class="aviso" data-aviso role="status"></p>
        </form>
      </div>
    </section>`;
  }

  // La separación hecha (la página que sigue a «Separar»).
  function separado() {
    const s = T.separado || { n: C.deEjemplo.numero, tienda: T.tienda, lineas: [{ id: "kalessi", color: "Chocolate", talla: "M", cant: 1 }, { id: "tiana", color: "Celeste", talla: "28", cant: 1 }], total: 233 };
    const t = C.tienda(s.tienda);
    const msg = `Hola, CAYLA ${t.ciudad}. Quiero confirmar mi separación N.º ${s.n}:\n${s.lineas.map((l) => `· ${P(l.id).nombre} (${l.color}, talla ${l.talla})${l.cant > 1 ? ` ×${l.cant}` : ""}`).join("\n")}\nTotal: ${C.soles(s.total)}`;
    return `
    <section class="separado">
      <div class="separado-cab sube"><span class="separado-ok">${I("check")}</span><span class="ceja mute">Separación N.º ${s.n} · por confirmar</span><h1 class="disp t-h1">Te la guardamos en <em>${t.ciudad}</em></h1><p class="mute">Mándala por WhatsApp: la tienda la confirma y te guarda las prendas.</p></div>
      <div class="separado-cuerpo">
        <div class="separado-izq sube" style="--i:2">
          <div class="wsp-caja"><span class="ceja">Tu mensaje</span><pre class="mensaje">${msg}</pre><a class="btn btn-ancho btn-wsp" href="#separado" data-wsp>${I("whatsapp")} Mandar por WhatsApp</a></div>
        </div>
        <div class="separado-der sube" style="--i:3">
          <ol class="sigue-pasos"><li class="hecho"><b>Separaste</b><span>Ya está en tu cuenta.</span></li><li><b>La tienda la confirma</b><span>Te escribe por WhatsApp.</span></li><li><b>Coordinas el pago y la recoges</b><span>Con tu código, en ${t.ciudad}.</span></li></ol>
          <div class="acciones"><a class="btn btn-sec" href="#cuenta">Ver mis pedidos</a><a class="link" href="#catalogo">Seguir mirando</a></div>
        </div>
      </div>
    </section>`;
  }

  // ── Entrar y crear cuenta ─────────────────────────────────────────────────────────────────────────────────────────
  const authPanel = (titulo, texto) => `
    <aside class="auth-arte" aria-hidden="true">
      <div class="auth-arte-in">${window.PZ.colibriSvg()}<h2 class="disp">${titulo}</h2><p>${texto}</p></div>
      <div class="auth-fotos"><span class="foto af1">${img("kalessi")}</span><span class="foto af2">${img("alba")}</span><span class="foto af3">${img("tiana")}</span></div>
    </aside>`;
  function entrar() {
    return `
    <section class="auth">
      ${authPanel("Con tu cuenta separas y sigues tus pedidos.", "Entra con tu correo. Tu bolsa te espera donde la dejaste.")}
      <div class="auth-forma">
        <form class="forma sube" data-form-entrar novalidate>
          <span class="ceja mute">Tu cuenta</span><h1 class="disp t-h1">Entrar</h1>
          ${campo({ id: "correo", etiqueta: "Correo", tipo: "email", placeholder: "tucorreo@gmail.com", auto: "email", estado: "sigue" })}
          ${campo({ id: "clave", etiqueta: "Contraseña", tipo: "password", auto: "current-password", lado: `<button type="button" class="ver-clave" data-ver-clave aria-label="Mostrar la contraseña">${I("ojo")}</button>` })}
          <button class="btn btn-ancho" type="submit">Entrar</button>
          <p class="aviso" data-aviso role="status"></p>
          <a class="enlace" href="#entrar">Olvidé mi contraseña</a>
          <div class="o"><span>¿Todavía no tienes cuenta?</span></div>
          <a class="btn btn-sec btn-ancho" href="#crear">Crear mi cuenta</a>
        </form>
      </div>
    </section>`;
  }
  function crear() {
    return `
    <section class="auth">
      ${authPanel("Tu cuenta ya es tu membresía.", "Puntos en cada compra, un regalo en tu cumpleaños y tus pedidos en un lugar.")}
      <div class="auth-forma">
        <form class="forma sube" data-form-crear novalidate>
          <span class="ceja mute">Club CAYLA</span><h1 class="disp t-h1">Crear cuenta</h1>
          <p class="mute forma-intro">Con tu correo, en un minuto. Te enviamos un código de 6 números.</p>
          ${campo({ id: "correo", etiqueta: "Correo", tipo: "email", placeholder: "tucorreo@gmail.com", auto: "email", estado: "sigue", lado: `<button type="button" class="btn btn-chico btn-sec" data-codigo>Obtener código</button>` })}
          <div class="campo campo-codigo" data-campo="codigo" data-estado="" hidden>
            <label class="campo-et" for="codigo"><span>Código</span><span class="campo-marca"></span></label>
            <div class="campo-caja"><input id="codigo" name="codigo" inputmode="numeric" maxlength="6" placeholder="6 números" autocomplete="one-time-code" aria-describedby="codigo-nota"></div>
            <p class="campo-nota" id="codigo-nota">Te lo enviamos a tu correo. Vale 30 minutos.</p>
          </div>
          ${campo({ id: "nombre", etiqueta: "Tu nombre", placeholder: "Como te llamas", auto: "given-name" })}
          ${campo({ id: "clave", etiqueta: "Contraseña", tipo: "password", auto: "new-password", nota: "Mínimo 8 caracteres.", lado: `<button type="button" class="ver-clave" data-ver-clave aria-label="Mostrar la contraseña">${I("ojo")}</button>` })}
          <label class="check"><input type="checkbox" name="mayor"><span class="check-caja" aria-hidden="true">${I("check", "ic-chica")}</span><span>Soy mayor de 18 años <small>Obligatorio</small></span></label>
          <label class="check"><input type="checkbox" name="wsp"><span class="check-caja" aria-hidden="true">${I("check", "ic-chica")}</span><span>Quiero recibir los avisos del Club por WhatsApp <small>Opcional</small></span></label>
          <button class="btn btn-ancho" type="submit">Crear mi cuenta</button>
          <p class="aviso" data-aviso role="status"></p>
          <p class="mute nota-chica">¿Ya tienes cuenta? <a class="enlace" href="#entrar">Entrar</a></p>
        </form>
      </div>
    </section>`;
  }

  // ── Mi perfil, favoritos, tiendas y looks ─────────────────────────────────────────────────────────────────────────
  function cuenta() {
    const y = C.yo, pt = y.puntos;
    return `
    <div class="cat-cab"><div><span class="ceja mute">Mi perfil</span><h1 class="disp t-h1 sube">Hola, <em>${y.nombre}</em></h1><p class="mute pf-linea">Miembro del Club CAYLA desde ${y.desde}</p></div><a class="enlace" href="#" data-salir>Salir</a></div>
    <section class="perfil">
      <div class="pf-club">
        <div class="pf-sec-cab"><h2 class="disp t-h3">Mi Club CAYLA</h2><a class="ver" href="#portada">Cómo funciona ${I("flecha")}</a></div>
        <div class="pf-club-in">
          ${miembro()}
          <div class="puntos">
            <span class="ceja mute">Tus puntos</span>
            <p class="saldo"><b class="num" data-contar="${pt.saldo}">${pt.saldo.toLocaleString("es-PE")}</b><span>valen ${C.soles(pt.vale)}</span></p>
            <p class="mute">Ganas puntos en cada compra, en tienda y en la web. Los conservas hasta el ${pt.pierdeEl}.</p>
            <div class="regalo"><span class="regalo-ico">${I("regalo")}</span><div><b>Tu cumpleaños: ${pt.cumple}</b><small>Ese mes te regalamos ${pt.regalo} puntos con tu primera compra.</small></div></div>
            <div class="canje"><div><b>Canjear 500 puntos</b><small>Un cupón de S/ 10 para tu bolsa</small></div><button class="btn btn-sec btn-chico" data-canje>Canjear</button></div>
            <p class="pt-sub">Tus cupones</p>
            ${y.cupones.map((c) => `<div class="cupon-mio"><span class="cupon-codigo">${I("regalo", "ic-chica")} <b>${c.codigo}</b></span><span class="mute">${c.texto}</span><button class="enlace" data-copiar="${c.codigo}">${I("copiar", "ic-chica")} Copiar</button></div>`).join("")}
            <details class="historial"><summary>Tu historial de puntos ${I("chevron", "ic-chica")}</summary>${y.movimientos.map(([t, n, f]) => `<div><span>${t}<small>${f}</small></span><b class="num ${n.startsWith("−") ? "menos" : "mas"}">${n}</b></div>`).join("")}</details>
          </div>
        </div>
      </div>
      <div class="pf-pedidos">
        <div class="pf-sec-cab"><h2 class="disp t-h3">Mis pedidos</h2><span class="ceja mute">${y.pedidos.length} separaciones</span></div>
        ${y.pedidos.map((o, i) => `
          <article class="pedido rv" style="--i:${i}">
            <div class="pedido-cab"><div><b>Separación N.º ${o.n}</b><small class="mute">${o.fecha} · ${C.tienda(o.tienda).ciudad}</small></div>${estadoChip(o.estado)}</div>
            <div class="pedido-fotos">${o.prendas.map(([id, c, t]) => `<span class="pedido-p"><span class="foto">${img(id)}</span><small>${P(id).nombre}<br>${c} · ${t}</small></span>`).join("")}</div>
            <p class="pedido-nota mute">${C.ESTADOS_PEDIDO[o.estado][1]} ${o.codigo ? `<b class="codigo">${o.codigo}</b>` : ""}</p>
          </article>`).join("")}
      </div>
    </section>
    <section class="sec" aria-labelledby="mis-fav">${secCab("Tus <em>favoritos</em>", ver("#favoritos"), "mis-fav")}<div class="rejilla" style="--cols:4">${y.favoritos.map((id, i) => tarjeta(P(id), i, { meta: false })).join("")}</div></section>`;
  }
  function favoritos() {
    const l = T.favs.map(P);
    return `
    <div class="cat-cab"><div><span class="ceja mute">Guardado</span><h1 class="disp t-h1 sube">Tus <em>favoritos</em></h1></div><span class="cat-n"><b class="num">${l.length}</b> ${l.length === 1 ? "prenda" : "prendas"}</span></div>
    <div class="cat-rejilla">${l.length ? `<div class="rejilla">${l.map((p, i) => tarjeta(p, i)).join("")}</div>` : vacio({ icono: "corazon", titulo: "Aún no guardas nada", texto: "Toca el corazón de una prenda y la verás aquí.", acciones: `<a class="btn" href="#catalogo">Ver toda la tienda</a>` })}</div>`;
  }
  function tiendas() {
    return `
    <div class="cat-cab"><div><span class="ceja mute">Recoge en la que te quede cerca</span><h1 class="disp t-h1 sube">Nuestras <em>tiendas</em></h1></div></div>
    <section class="tiendas-pag"><div class="tiendas">${C.tiendas.map(tiendaCard).join("")}</div><p class="mute tiendas-nota">Lo que separas en la web lo recoges en la tienda que elijas. ¿Tienes una duda? Escríbele por WhatsApp.</p></section>`;
  }
  function looks() {
    return `
    <div class="cat-cab"><div><span class="ceja mute">Ideas listas para llevar</span><h1 class="disp t-h1 sube">Arma tu <em>look</em></h1></div></div>
    <section class="looks-pag"><div class="looks-inicio">${C.looks.map(lookCard).join("")}</div></section>`;
  }
  function look(n) {
    const l = C.looks.find((x) => x.n === +n) || C.looks[0];
    return `
    <nav class="ruta" aria-label="Dónde estás"><a href="#looks">Looks</a><span aria-hidden="true">/</span><span aria-current="page">Look N.º ${l.n}</span></nav>
    <section class="look-det">
      <div class="look-det-fotos">${l.prendas.map((id, i) => `<a class="foto look-d${i + 1}" href="#prenda/${id}">${img(id, P(id).nombre)}</a>`).join("")}</div>
      <div class="look-det-info panel"><span class="ceja mute">Look N.º ${l.n}</span><h1 class="disp t-h1">${l.titulo}</h1>
        <ul class="look-prendas">${l.prendas.map((id) => `<li><a href="#prenda/${id}"><span class="foto">${img(id)}</span><span><b class="tj-nom">${P(id).nombre}</b><small class="mute">${P(id).colores[0][0]} · ${P(id).tallas.join(", ")}</small></span></a>${precioHTML(P(id))}</li>`).join("")}</ul>
        <div class="total"><span>Total del look</span><b class="num">${C.soles(totalDe(l.prendas))}</b></div>
        <button class="btn btn-ancho" data-look="${l.n}">Agregar look completo a la bolsa</button>
        <p class="mute nota-chica">Se agrega la primera talla que hay en ${ciudad()}. Podrás cambiarla en tu bolsa.</p>
      </div>
    </section>`;
  }

  // ── No encontrada ────────────────────────────────────────────────────────────────────────────────────────────────
  const noEncontrada = () => `<div class="sec">${vacio({ icono: "buscar", titulo: "Esa página no existe", texto: "Puede que el enlace esté viejo. Vuelve a la tienda y sigue desde ahí.", acciones: `<a class="btn" href="#portada">Ir al inicio</a>` })}</div>`;

  window.PANTALLAS = { portada, catalogo, prenda, bolsa, separado, entrar, crear, cuenta, favoritos, tiendas, looks, look, noEncontrada, S, rejillaCat, activos, listaFiltrada, totales, tituloCat, tablaStock, miembro, lineaMarca };
})();
