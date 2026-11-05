// Motor común de las seis direcciones: la barra de revisión (no es parte del diseño), las cuatro pestañas por #ancla (portada,
// catálogo, prenda, bolsa), la bolsa y los toques que se repiten (filtros, elegir color/talla/tienda, agregar, separar), más la
// entrada al hacer scroll y el parallax suave de la portada. Cada dirección solo declara su nombre y qué composición de portada
// usa (`hero`); sus colores, letras y marcos viven en su CSS.
(function () {
  const C = window.CAYLA;
  const M = window.CAYLA_MARCA;
  const D = window.DIRECCION;
  const PANTALLAS = [["portada", "Portada"], ["catalogo", "Catálogo"], ["prenda", "Prenda"], ["bolsa", "Bolsa"]];
  const DIRECCIONES = [["blanco.html", "1 · Blanco"], ["indigo.html", "2 · Índigo"], ["musgo.html", "3 · Musgo"], ["mantequilla.html", "4 · Mantequilla"], ["arcilla.html", "5 · Arcilla"], ["rojo.html", "6 · Rojo colibrí"]];
  const calma = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  let primera = true;

  // La bolsa vive en la sesión del navegador; si no deja guardar, vive en memoria.
  let memoria = [];
  const bolsa = {
    leer() { try { return JSON.parse(sessionStorage.getItem("cayla-paleta-bolsa") || "null") || memoria; } catch { return memoria; } },
    guardar(l) { memoria = l; try { sessionStorage.setItem("cayla-paleta-bolsa", JSON.stringify(l)); } catch { /* sin almacenamiento */ } },
  };
  if (bolsa.leer().length === 0) bolsa.guardar([{ id: "kalessi", color: "Chocolate", talla: "M" }, { id: "tiana", color: "Celeste", talla: "28" }]);

  const sel = {};
  const estado = { tienda: null };
  const filtro = { cat: "todo", tienda: "todas" };

  const ruta = () => {
    const [p, id] = (location.hash.replace("#", "") || "portada").split("/");
    return { pantalla: PANTALLAS.some((x) => x[0] === p) ? p : "portada", id };
  };
  const vista = () => (new URLSearchParams(location.search).get("vista") === "celular" ? "celular" : "escritorio");

  function barra() {
    const actual = location.pathname.split("/").pop();
    const r = ruta();
    const b = document.createElement("div");
    b.className = "rev";
    b.innerHTML = `
      <a class="rev-volver" href="index.html">← Comparar</a>
      <nav class="rev-grupo" aria-label="Dirección">${DIRECCIONES.map(([f, n]) => `<a href="${f}${location.search}${location.hash}" ${f === actual ? 'aria-current="page"' : ""}>${n}</a>`).join("")}</nav>
      <nav class="rev-grupo" aria-label="Pestaña">${PANTALLAS.map(([p, n]) => `<a href="#${p === "prenda" ? "prenda/" + (r.id || "kalessi") : p}" ${p === r.pantalla ? 'aria-current="page"' : ""}>${n}</a>`).join("")}</nav>
      <nav class="rev-grupo" aria-label="Vista">${[["escritorio", "Escritorio"], ["celular", "Celular"]].map(([v, n]) => `<a href="?vista=${v}${location.hash}" ${v === vista() ? 'aria-current="page"' : ""}>${n}</a>`).join("")}</nav>
      <a class="rev-demo" href="?demo${location.hash}" style="background:#e9e5d9;color:#111;font-weight:600">▶ Demo</a>
      <span class="rev-nota">Precios, tallas y stock de ejemplo</span>`;
    return b;
  }

  // ── Piezas ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const logoSvg = () => `<svg class="logo" viewBox="${M.logo.viewBox}" style="aspect-ratio:${M.logo.ancho} / ${M.logo.alto}" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${M.logo.trazo}"/></svg>`;
  const logo = () => `<a class="logo-a" href="#portada" aria-label="CAYLA, ir a la portada">${logoSvg()}</a>`;
  const anu = () => `<div class="anu">Separa en línea · Recoge en Arequipa o Trujillo · Pagas en la tienda</div>`;
  const cab = () => `
    <header class="cab">
      <button class="cab-menu" aria-label="Abrir el menú"><i></i><i></i></button>
      ${logo()}
      <nav class="cab-nav" aria-label="Tienda"><a href="#catalogo">Lo nuevo</a><a href="#catalogo">Ropa</a><a href="#catalogo">Looks</a><a href="#portada">Tiendas</a></nav>
      <nav class="cab-acc" aria-label="Tu cuenta"><a href="#catalogo">Buscar</a><a href="#catalogo">Entrar</a><a class="cab-bolsa" href="#bolsa">Bolsa <b data-cuenta-bolsa>0</b></a></nav>
    </header>`;
  const pie = () => `
    <footer class="pie">
      <div>${logo()}<p class="mute" style="max-width:30ch;margin:16px 0 0">Separa en línea, confirma por WhatsApp y recoge en tu tienda.</p></div>
      <div><span class="cap">Ayuda</span><ul><li><a href="#portada">Cómo separar</a></li><li><a href="#portada">Cambios y devoluciones</a></li><li><a href="#portada">Nuestras tiendas</a></li></ul></div>
      <div><span class="cap">Tu cuenta</span><ul><li><a href="#catalogo">Crear mi cuenta</a></li><li><a href="#catalogo">Entrar</a></li><li><a href="#catalogo">Olvidé mi contraseña</a></li></ul></div>
      <div><span class="cap">CAYLA</span><ul><li><a href="#portada">Club CAYLA</a></li><li><a href="#portada">Privacidad</a></li><li><a href="#portada">Términos del Club</a></li></ul></div>
    </footer>`;
  const colores = (p) => (p.colores.length === 1 ? p.colores[0][0] : p.colores.length + " colores");
  const P = (id) => C.prenda(id);
  const foto = (id) => C.foto(P(id));
  const img = (id, alt) => `<img src="${foto(id)}" alt="${alt === undefined ? P(id).nombre : alt}">`;
  const tj = (p, i, conPrecio, extra = "") => `
    <a class="tj rv ${extra}" style="--i:${i}" href="#prenda/${p.id}" data-cat="${p.cat}" data-aqp="${p.stock.aqp}" data-tru="${p.stock.tru}">
      <span class="tj-foto"><img src="${C.foto(p)}" alt="${p.nombre}" loading="lazy"><span class="tj-ver">Ver prenda</span></span>
      <span class="tj-info">
        <span class="tj-nombre">${p.nombre}</span>
        ${conPrecio ? `<span class="tj-precio num">${C.precio(p.precio)}</span>` : `<span class="tj-precio mute">Ver precio</span>`}
        <span class="tj-meta">${C.nombreCat(p.cat)} · ${colores(p)}</span>
        ${conPrecio ? `<span class="tj-stock">Arequipa ${C.stockTexto(p.stock.aqp)} · Trujillo ${C.stockTexto(p.stock.tru)}</span>` : ""}
      </span>
    </a>`;
  const TXT = {
    cap: "Llegó en los últimos 30 días",
    tit: ["Separa en línea.", "Recoge en tu tienda."],
    p: "Crea tu cuenta para ver precios, tallas y cuánto hay en Arequipa y Trujillo. No pagas nada en la web.",
  };
  const acciones = () => `<div class="acciones"><a class="btn" href="#catalogo">Crear mi cuenta</a><a class="link" href="#catalogo">Ya tengo cuenta</a></div>`;
  const REP = { blusas: "kalessi", tops: "cuello-v", pantalones: "tiana", faldas: "luna", corsets: "alba" };

  // ── La portada: cada dirección tiene su composición, siempre en capas ─────────────────────────────────────────────
  const HEROES = {
    // 1 · Blanco: un titular enorme y tres placas de tamaños distintos que lo cruzan, con su número como en un catálogo de arte.
    colage: () => `
      <section class="h h-colage">
        <div class="h-lineas"><span class="cap mute sube">${TXT.cap}</span><h1 class="disp h-tit sube">${TXT.tit[0]}<br>${TXT.tit[1]}</h1></div>
        <div class="h-placas">${[["kalessi", "01", "p1", "px-a"], ["tiana", "02", "p2", "px-b"], ["alba", "03", "p3", "px-c"]].map(([id, n, c, px], i) => `
          <a class="placa ${c} ${px}" href="#prenda/${id}"><span class="placa-in sube" style="--i:${i + 1}"><span class="foto">${img(id)}</span><span class="placa-pie"><b class="num">${n}</b><span class="tj-nombre">${P(id).nombre}</span></span></span></a>`).join("")}</div>
        <div class="h-lado sube" style="--i:4"><p>${TXT.p}</p>${acciones()}</div>
      </section>`,
    // 2 · Índigo: el azul con el titular y, a la derecha, una pila de láminas montadas una sobre otra.
    laminas: () => `
      <section class="h h-laminas">
        <div class="h-izq">
          <span class="h-aro" aria-hidden="true"></span>
          <span class="cap">${TXT.cap}</span>
          <h1 class="disp h-tit sube">${TXT.tit[0]}<br><em>${TXT.tit[1]}</em></h1>
          <p>${TXT.p}</p>${acciones()}
        </div>
        <div class="h-der"><div class="h-pila">
          <a class="h-marco m1 px-a sube" style="--i:1" href="#prenda/kalessi"><span class="foto">${img("kalessi")}</span></a>
          <a class="h-marco m2 px-b sube" style="--i:2" href="#prenda/tiana"><span class="foto">${img("tiana")}</span></a>
          <a class="h-marco m3 px-c sube" style="--i:3" href="#prenda/alba"><span class="foto">${img("alba")}</span><span class="h-leyenda"><span class="tj-nombre">${P("alba").nombre}</span><span class="mute">Ver precio</span></span></a>
        </div></div>
      </section>`,
    // 3 · Musgo: tres arcos de alturas distintas, dobles, parados sobre el suelo musgo y bajo un sol pálido.
    arco: () => `
      <section class="h h-arco">
        <div class="h-texto">
          <span class="cap">${TXT.cap}</span>
          <h1 class="disp h-tit sube">${TXT.tit[0]}<br>${TXT.tit[1]}</h1>
          <p>${TXT.p}</p>${acciones()}
        </div>
        <div class="h-arcos"><span class="sol" aria-hidden="true"></span>${["tiana", "kalessi", "strend"].map((id, i) => `
          <a class="arco ${"abc"[i] === "b" ? "px-b" : "abc"[i] === "a" ? "px-a" : "px-c"}" href="#prenda/${id}"><span class="arco-in sube" style="--i:${i + 1}"><span class="foto">${img(id)}</span><span class="tj-nombre">${P(id).nombre}</span></span></a>`).join("")}</div>
      </section>`,
    // 4 · Mantequilla: el titular lleva fotos adentro, y abajo un abanico de tarjetas con un sello que gira una vez.
    pildoras: () => `
      <section class="h h-pildoras">
        <h1 class="disp h-tit sube">Separa <span class="pill">${img("kalessi", "")}</span> en línea.<br>Recoge en tu <span class="pill pill-3">${img("tiana", "")}</span> tienda.</h1>
        <div class="h-fila">
          <div class="h-fila-izq sube" style="--i:2"><p>${TXT.p}</p><div class="h-chips"><span>Arequipa</span><span>Trujillo</span><span>Pagas al recoger</span></div>${acciones()}</div>
          <div class="h-abanico">
            ${[["tiana", "c1", "px-c"], ["alba", "c2", "px-b"], ["kalessi", "c3", "px-a"]].map(([id, c, px], i) => `
            <a class="carta ${c} ${px}" href="#prenda/${id}"><span class="carta-in sube" style="--i:${i + 2}"><span class="foto">${img(id)}</span><span class="tj-nombre">${P(id).nombre}</span></span></a>`).join("")}
            <svg class="sello" viewBox="0 0 120 120" aria-hidden="true"><defs><path id="circ" d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0"/></defs><circle cx="60" cy="60" r="59" class="sello-fondo"/><text class="sello-txt"><textPath href="#circ" textLength="278" lengthAdjust="spacing">SEPARA · RECOGE · PAGA AL RECOGER ·</textPath></text><path class="sello-estrella" d="M60 44l4.4 9 9.9 1.4-7.2 7 1.7 9.8L60 66.5 51.2 71.2l1.7-9.8-7.2-7 9.9-1.4z"/></svg>
          </div>
        </div>
      </section>`,
    // 5 · Arcilla: un disco de arcilla detrás y tres óvalos escalonados con su luz y su sombra de piso.
    ovalos: () => `
      <section class="h h-ovalos">
        <h1 class="disp h-tit sube">${TXT.tit[0].toLowerCase()}<br>${TXT.tit[1].toLowerCase()}</h1>
        <div class="ovalos"><span class="disco" aria-hidden="true"></span>${["kalessi", "alba", "tiana"].map((id, i) => `
          <a class="ov ov-${i + 1} ${["px-c", "px-b", "px-a"][i]}" href="#prenda/${id}"><span class="ov-in sube" style="--i:${i + 1}"><span class="foto">${img(id)}</span><span class="tj-nombre">${P(id).nombre}</span></span></a>`).join("")}</div>
        <div class="h-pie sube" style="--i:4"><p>${TXT.p}</p>${acciones()}</div>
      </section>`,
    // 6 · Rojo colibrí: un campo de rojo entero con una palabra fantasma, y dos tarjetas apiladas que lo cruzan.
    campo: () => `
      <section class="h h-campo">
        <div class="campo-rojo">
          <span class="fantasma px-b" aria-hidden="true">SEPARA</span>
          <span class="cap">${TXT.cap}</span>
          <h1 class="disp h-tit sube">${TXT.tit[0]}<br>${TXT.tit[1]}</h1>
          <p>${TXT.p}</p>${acciones()}
        </div>
        <a class="campo-foto2 px-b" href="#prenda/tiana" tabindex="-1" aria-hidden="true"><span class="foto">${img("tiana", "")}</span></a>
        <a class="campo-foto px-a" href="#prenda/alba"><span class="foto">${img("alba")}</span><span class="h-leyenda"><span class="tj-nombre">${P("alba").nombre}</span><span class="mute">Ver precio</span></span></a>
      </section>`,
  };

  const secCab = (t, der) => `<div class="sec-cab rv"><h2 class="disp t-h2">${t}</h2>${der || ""}</div>`;
  const look = C.looks[0];

  const pantallas = {
    portada() {
      const nuevos = ["luna", "semicadera", "cuello-v", "rayas"];
      return `${anu()}${cab()}
      ${HEROES[D.hero]()}
      <section class="sec" aria-label="Qué buscas">
        ${secCab("Qué buscas", `<a class="link cap" href="#catalogo">Ver todo</a>`)}
        <div class="cat-tiles">${C.categorias.slice(1).map(([k, n], i) => `
          <a class="cat-tile rv" style="--i:${i}" href="#catalogo"><span class="foto">${img(REP[k], "")}</span><span class="cat-nom">${n}</span><small>${C.prendas.filter((p) => p.cat === k).length} prendas</small></a>`).join("")}</div>
      </section>
      <section class="sec">
        ${secCab("Recién llegado", `<a class="link cap" href="#catalogo">Ver las ${C.prendas.length} prendas</a>`)}
        <div class="rejilla" style="--cols:4">${nuevos.map((id, i) => tj(P(id), i, false)).join("")}</div>
      </section>
      <section class="sec">
        <div class="look">
          <span class="look-fondo" aria-hidden="true"></span>
          <div class="look-texto rv"><span class="cap mute">Look N.º ${look.n}</span><h2 class="disp t-h1" style="font-size:clamp(32px,4.4cqi,64px);margin-top:14px">${look.titulo}</h2><p class="mute" style="max-width:34ch;margin:16px 0 24px">Dos prendas que ya se llevan bien. Agrégalas juntas a tu bolsa.</p><a class="btn btn-sec" href="#bolsa">Ver el look</a></div>
          ${tj(P(look.prendas[0]), 1, false, "look-a")}${tj(P(look.prendas[1]), 2, false, "look-b")}
        </div>
      </section>
      <section class="sec">
        ${secCab("Así se separa", `<span class="cap mute">Sin pagar en la web</span>`)}
        <div class="pasos">${C.pasos.map(([t, d], i) => `<div class="paso rv" style="--i:${i}"><span class="paso-n">${i + 1}</span><h3>${t}</h3><p>${d}</p></div>`).join("")}</div>
      </section>
      <section class="club rv">
        <div><span class="cap" style="opacity:.75">Club CAYLA</span><h2 class="disp t-h1" style="font-size:clamp(30px,3.8cqi,56px);margin-top:16px">Tu cuenta ya es tu membresía</h2><p>Al crear tu cuenta entras al Club. No hay que llenar nada más.</p><a class="btn" href="#catalogo">Crear mi cuenta</a></div>
        <ul>${C.club.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join("")}</ul>
        <div class="club-foto foto" aria-hidden="true">${img("olenka", "")}</div>
      </section>
      <section class="sec">
        ${secCab("Nuestras tiendas", `<span class="cap mute">Recoge en la que te quede cerca</span>`)}
        <div class="tiendas">${C.tiendas.map((t, i) => `<div class="tienda rv" style="--i:${i}"><h3 class="disp t-h2">${t.ciudad}</h3><p>${t.direccion}</p><p class="mute">${t.horario}</p><div class="acciones"><a class="btn btn-sec" href="#portada">WhatsApp ${t.whatsapp}</a><a class="link" href="#portada">Cómo llegar</a></div></div>`).join("")}</div>
      </section>
      ${pie()}`;
    },

    catalogo() {
      return `${cab()}
      <div class="cat-cab"><h1 class="disp t-h1 sube">Toda la tienda</h1><span class="cap mute"><b data-cuenta-prendas>${C.prendas.length}</b> prendas</span></div>
      <div class="filtros" data-filtros>
        <div role="group" aria-label="Qué buscas">${C.categorias.map(([k, n], i) => `<button data-filtro="${k}" aria-pressed="${i === 0}">${n}</button>`).join("")}</div>
        <div role="group" aria-label="En qué tienda">${[["todas", "Todas las tiendas"], ["aqp", "Arequipa"], ["tru", "Trujillo"]].map(([k, n], i) => `<button data-filtro-tienda="${k}" aria-pressed="${i === 0}">${n}</button>`).join("")}</div>
      </div>
      <div class="cat-rejilla"><div class="rejilla dens" data-rejilla>${C.prendas.map((p, i) => tj(p, i % 6, true, i === 0 || i === 7 ? "grande" : "")).join("")}</div></div>
      <p class="sec mute" data-sin-resultados hidden style="padding-top:24px">No hay prendas de este tipo en esa tienda. Prueba con «Todas las tiendas»: la tienda puede pedirla a la otra.</p>
      ${pie()}`;
    },

    prenda({ id }) {
      const p = C.prenda(id);
      const va = [...new Set((C.looks.find((l) => l.prendas.includes(p.id)) || C.looks[0]).prendas.concat(C.prendas.filter((x) => x.cat !== p.cat).map((x) => x.id)))].filter((x) => x !== p.id).slice(0, 3);
      return `${cab()}
      <div class="ruta"><a href="#catalogo">Toda la tienda</a> &nbsp;/&nbsp; <a href="#catalogo">${C.nombreCat(p.cat)}</a></div>
      <section class="ficha">
        <div class="galeria">
          <div class="foto sube"><img src="${C.foto(p)}" alt="${p.nombre}"><span class="foto-chip">Arequipa ${C.stockTexto(p.stock.aqp)} · Trujillo ${C.stockTexto(p.stock.tru)}</span></div>
          ${p.foto.length > 1 ? `<div class="galeria-mini">${p.foto.map((_, i) => `<div class="foto"><img src="${C.foto(p, i)}" alt="${p.nombre}, foto ${i + 1}"></div>`).join("")}</div>` : ""}
        </div>
        <div class="panel">
          <div><h1>${p.nombre}</h1><div class="precio num">${C.precio(p.precio)}</div></div>
          <div class="campo"><div class="campo-cab"><span class="cap">Color</span></div>
            <div class="opciones" data-grupo="color">${p.colores.map(([n, hex], i) => `<button class="color" data-valor="${n}" aria-pressed="${i === 0}"><i style="background:${hex}"></i>${n}</button>`).join("")}</div></div>
          <div class="campo"><div class="campo-cab"><span class="cap">Talla</span><a class="link mute" href="#prenda/${p.id}">Guía de tallas</a></div>
            <div class="opciones" data-grupo="talla" role="group" aria-label="Talla">${p.tallas.map((t) => `<button class="talla" data-valor="${t}" aria-pressed="false">${t}</button>`).join("")}</div></div>
          <dl class="stock"><span class="cap" style="margin-bottom:8px">En tienda</span>${C.tiendas.map((t) => `<div><dt>${t.ciudad}</dt><dd class="${p.stock[t.id] ? "" : "mute"}">${C.stockFrase(p.stock[t.id])}</dd></div>`).join("")}</dl>
          <button class="btn" data-agregar="${p.id}">Agregar a la bolsa</button>
          <p class="aviso" data-aviso role="status" aria-live="polite"></p>
          <p class="mute" style="margin:-14px 0 0">No pagas nada en la web: separas, la tienda te la guarda y pagas al recoger.</p>
          <div class="mas">
            <details><summary>Medidas y calce</summary><p>Las medidas de cada talla, tomadas sobre la prenda.</p></details>
            <details><summary>Cambios y devoluciones</summary><p>Igual que en tienda: cámbiala en cualquier tienda CAYLA.</p></details>
          </div>
        </div>
      </section>
      <section class="sec">${secCab("Va con")}<div class="vacon">${va.map((x, i) => tj(C.prenda(x), i, true)).join("")}</div></section>
      ${pie()}`;
    },

    bolsa({ bolsa: b }) {
      const total = b.reduce((s, l) => s + C.prenda(l.id).precio, 0);
      return `${cab()}
      <div class="cat-cab"><h1 class="disp t-h1 sube">Tu bolsa</h1><span class="cap mute">${b.length} ${b.length === 1 ? "prenda" : "prendas"}</span></div>
      <ol class="pasos-bolsa" aria-label="Pasos para separar"><li class="hecho"><span>Tu bolsa</span></li><li><span>Tu tienda</span></li><li><span>Separada</span></li></ol>
      <section class="bolsa-cuerpo">
        <div>${b.length === 0 ? `<p style="padding:24px 0;border-top:1px solid var(--line)">Tu bolsa está vacía. <a class="link" href="#catalogo">Ver la ropa</a></p>` : b.map((l, i) => { const p = C.prenda(l.id); return `
          <div class="linea sube" style="--i:${i}">
            <a class="foto" href="#prenda/${p.id}"><img src="${C.foto(p)}" alt="${p.nombre}"></a>
            <div><a class="tj-nombre" href="#prenda/${p.id}">${p.nombre}</a><span class="cap">${l.color} · Talla ${l.talla}</span>
              <span data-hay-aqp="${p.stock.aqp}" data-hay-tru="${p.stock.tru}">Elige la tienda para ver si hay</span>
              <button class="quitar" data-quitar="${i}">Quitar</button></div>
            <span class="precio num">${C.precio(p.precio)}</span>
          </div>`; }).join("")}</div>
        <aside class="resumen sube" style="--i:2">
          <div data-antes-de-separar style="display:grid;gap:24px">
            <div class="campo"><span class="cap">Recógelo en</span>
              <div data-grupo="tienda" style="display:grid;gap:8px">${C.tiendas.map((t) => `<button class="op-tienda" data-valor="${t.id}" aria-pressed="false"><b style="font-weight:600">${t.ciudad}</b><span class="mute">${t.direccion}</span></button>`).join("")}</div></div>
            <div class="total"><span>Total <span class="mute">· pagas al recoger</span></span><b class="num">${C.precio(total)}</b></div>
            <button class="btn" data-separar ${b.length ? "" : "disabled"}>Separar</button>
            <p class="aviso" data-aviso role="status" aria-live="polite" style="margin:-12px 0 0"></p>
            <p class="mute" style="margin:0;font-size:13px">Puedes tener hasta 3 separaciones abiertas a la vez.</p>
          </div>
          <div class="listo" data-confirmacion hidden>
            <span class="cap mute">Separación N.º ${C.deEjemplo.numero} · por confirmar</span>
            <h2 class="disp" tabindex="-1">Te la guardamos en <span data-tienda-elegida></span></h2>
            <p>Mándala por WhatsApp: la tienda la confirma y te guarda las prendas. Pagas al recoger.</p>
            <button class="btn" data-whatsapp>Mandar por WhatsApp</button>
            <p class="mensaje" data-mensaje hidden>Hola, CAYLA <span data-tienda-elegida></span>. Quiero confirmar mi separación N.º ${C.deEjemplo.numero}:
${b.map((l) => `· ${C.prenda(l.id).nombre} (${l.color}, talla ${l.talla})`).join("\n")}</p>
          </div>
        </aside>
      </section>
      ${pie()}`;
    },
  };

  // ── Toques ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const contarBolsa = () => document.querySelectorAll("[data-cuenta-bolsa]").forEach((e) => (e.textContent = bolsa.leer().length));
  const paso = (n) => document.querySelector(`.pasos-bolsa li:nth-child(${n})`)?.classList.add("hecho");

  // Lo que entra al hacer scroll: una vez, sin rebote. Sin «reducir movimiento» y sin IntersectionObserver, todo se ve de entrada.
  function revelar(lienzo) {
    if (calma() || !("IntersectionObserver" in window)) return;
    lienzo.dataset.rv = "on";
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("v"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    lienzo.querySelectorAll(".rv").forEach((el) => io.observe(el));
  }
  // El parallax solo mueve la portada, y se detiene pasada su altura.
  let marco = 0;
  window.addEventListener("scroll", () => {
    if (marco || calma()) return;
    marco = requestAnimationFrame(() => { marco = 0; document.querySelector(".h")?.style.setProperty("--sy", Math.min(window.scrollY, 1100)); });
  }, { passive: true });

  function pintar() {
    const r = ruta();
    if (!new URLSearchParams(location.search).has("previa")) {
      const vieja = document.querySelector(".rev");
      if (vieja) vieja.replaceWith(barra()); else document.body.prepend(barra());
    }
    const lienzo = document.getElementById("lienzo");
    lienzo.dataset.vista = vista();
    lienzo.dataset.pantalla = r.pantalla;
    delete lienzo.dataset.rv;
    filtro.cat = "todo"; filtro.tienda = "todas"; estado.tienda = null; delete sel.tienda; delete sel.talla; delete sel.color;
    lienzo.innerHTML = pantallas[r.pantalla]({ id: r.id, bolsa: bolsa.leer() });
    document.title = `${D.nombre} · ${PANTALLAS.find((x) => x[0] === r.pantalla)[1]} — Tienda, nueva paleta`;
    contarBolsa();
    if (!primera || r.pantalla !== "portada") window.scrollTo(0, 0);
    primera = false;
    revelar(lienzo);
  }

  function elegir(boton) {
    const grupo = boton.closest("[data-grupo]");
    grupo.querySelectorAll("[data-valor]").forEach((b) => b.setAttribute("aria-pressed", String(b === boton)));
    sel[grupo.dataset.grupo] = boton.dataset.valor;
    if (grupo.dataset.grupo === "tienda") {
      estado.tienda = boton.dataset.valor;
      paso(2);
      document.querySelectorAll("[data-hay-aqp]").forEach((x) => {
        const n = Number(x.dataset["hay" + (estado.tienda === "aqp" ? "Aqp" : "Tru")]);
        x.textContent = n > 0 ? `${C.stockFrase(n)} en ${C.tiendas.find((t) => t.id === estado.tienda).ciudad}` : "No hay aquí: la tienda la pide a la otra";
        x.dataset.falta = String(n <= 0);
      });
    }
    const aviso = document.querySelector("[data-aviso]");
    if (aviso) aviso.textContent = "";
  }

  function filtrar(boton) {
    const fila = boton.closest("[data-filtros]");
    const clave = boton.dataset.filtro ? "cat" : "tienda";
    fila.querySelectorAll(clave === "cat" ? "[data-filtro]" : "[data-filtro-tienda]").forEach((b) => b.setAttribute("aria-pressed", String(b === boton)));
    filtro[clave] = boton.dataset.filtro || boton.dataset.filtroTienda;
    let visibles = 0;
    document.querySelectorAll("[data-rejilla] [data-cat]").forEach((el) => {
      const porCat = filtro.cat === "todo" || el.dataset.cat === filtro.cat;
      const porTienda = filtro.tienda === "todas" || Number(el.dataset[filtro.tienda]) > 0;
      el.hidden = !(porCat && porTienda);
      if (!el.hidden) visibles++;
    });
    document.querySelectorAll("[data-cuenta-prendas]").forEach((x) => (x.textContent = visibles));
    document.querySelectorAll("[data-sin-resultados]").forEach((x) => (x.hidden = visibles > 0));
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-valor],[data-filtro],[data-filtro-tienda],[data-agregar],[data-quitar],[data-separar],[data-whatsapp]");
    if (!t) return;
    if (t.matches("[data-valor]")) return elegir(t);
    if (t.matches("[data-filtro],[data-filtro-tienda]")) return filtrar(t);
    if (t.matches("[data-agregar]")) {
      const p = C.prenda(t.dataset.agregar);
      const aviso = document.querySelector("[data-aviso]");
      if (!sel.talla) { if (aviso) aviso.textContent = "Elige tu talla para agregarla a la bolsa."; document.querySelector('[data-grupo="talla"] [data-valor]')?.focus(); return; }
      const l = bolsa.leer();
      l.push({ id: p.id, color: sel.color || p.colores[0][0], talla: sel.talla });
      bolsa.guardar(l);
      contarBolsa();
      if (aviso) aviso.textContent = `Agregaste ${p.nombre}, talla ${sel.talla}.`;
      t.dataset.hecho = "si";
      return;
    }
    if (t.matches("[data-quitar]")) {
      const l = bolsa.leer();
      l.splice(Number(t.dataset.quitar), 1);
      bolsa.guardar(l);
      pintar();
      return;
    }
    if (t.matches("[data-separar]")) {
      const aviso = document.querySelector("[data-aviso]");
      if (!estado.tienda) { if (aviso) aviso.textContent = "Elige en qué tienda la recoges."; document.querySelector('[data-grupo="tienda"] [data-valor]')?.focus(); return; }
      document.querySelectorAll("[data-antes-de-separar]").forEach((x) => (x.hidden = true));
      const listo = document.querySelector("[data-confirmacion]");
      if (listo) {
        const tienda = C.tiendas.find((x) => x.id === estado.tienda);
        listo.querySelectorAll("[data-tienda-elegida]").forEach((x) => (x.textContent = tienda.ciudad));
        listo.hidden = false;
        paso(3);
        listo.querySelector("h2, [tabindex]")?.focus?.();
        listo.scrollIntoView({ behavior: calma() ? "auto" : "smooth", block: "center" });
      }
      return;
    }
    if (t.matches("[data-whatsapp]")) {
      const m = document.querySelector("[data-mensaje]");
      if (m) m.hidden = !m.hidden;
    }
  });

  // Un formulario de la maqueta nunca manda nada.
  document.addEventListener("submit", (e) => { e.preventDefault(); location.hash = "catalogo"; });
  window.TIENDA = { pintar };
  window.addEventListener("hashchange", pintar);
  document.addEventListener("DOMContentLoaded", pintar);
  if (document.readyState !== "loading") pintar();
})();
