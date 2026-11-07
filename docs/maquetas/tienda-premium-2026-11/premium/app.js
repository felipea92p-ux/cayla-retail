// CAYLA · maqueta Premium navegable (2026-11-07). Aislada: no llama a ninguna API de escritura, no envía mensajes ni toca
// la tienda real. Lo que «guarda» (bolsa, sesión, favoritos, pedidos) vive solo en sessionStorage de este navegador.
// Una sola app con rutas en el #hash; cada pantalla es una función que devuelve HTML con piezas del sistema (sistema.css).
(() => {
  "use strict";
  const D = window.CAYLA;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const sol = n => `S/ ${Number(n || 0).toFixed(2)}`;

  // ——— Íconos (un solo trazo, 1.7) ———
  const I = {
    buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    bolsa: '<path d="M6 7h12l1 13H5L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
    usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
    flecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    flechaIzq: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    chev: '<path d="m6 9 6 6 6-6"/>', chevDer: '<path d="m9 6 6 6-6 6"/>', chevIzq: '<path d="m15 6-6 6 6 6"/>',
    corazon: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9Z"/>',
    wsp: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19l-4 1Z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1a4 4 0 0 1-2-2l1-1-1-2L9 9.5Z"/>',
    ubic: '<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    ticket: '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4V7Z"/><path d="M14 8v1M14 12v1M14 16v.5"/>',
    tienda: '<path d="M4 9l1-5h14l1 5"/><path d="M5 9v11h14V9"/><path d="M4 9h16"/><path d="M10 20v-6h4v6"/>',
    cambio: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    chispa: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/>',
    candado: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    abierto: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
    dado: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r=".8" fill="currentColor"/><circle cx="15" cy="15" r=".8" fill="currentColor"/><circle cx="15" cy="9" r=".8" fill="currentColor"/><circle cx="9" cy="15" r=".8" fill="currentColor"/>',
    mas: '<path d="M12 5v14M5 12h14"/>', menos: '<path d="M5 12h14"/>',
    basura: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    ojo: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    ojoNo: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/>',
    alerta: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    filtro: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    ordenar: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
    regalo: '<rect x="3" y="8" width="18" height="4"/><path d="M5 12v8h14v-8M12 8v12M12 8S10 3 7.5 4.5 9 8 12 8Zm0 0s2-5 4.5-3.5S15 8 12 8Z"/>',
    estrella: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/>',
    doc: '<path d="M6 3h9l4 4v14H6V3Z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
    telefono: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    regla: '<path d="M3 17 17 3l4 4L7 21l-4-4Z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
    percha: '<path d="M12 7a2 2 0 1 1 2-2"/><path d="M12 7v2L3 17h18l-9-8"/>',
    campana: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    salir: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
    lupaX: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8.5 8.5l5 5M13.5 8.5l-5 5"/>',
  };
  const ic = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ""}</svg>`;
  const GOOGLE = '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8Z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.8 0-5.2-1.9-6.1-4.5H2.2v2.9A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.9 14.1a6.6 6.6 0 0 1 0-4.2V7H2.2a11 11 0 0 0 0 10l3.7-2.9Z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.1 1.6l3.1-3.1A11 11 0 0 0 2.2 7l3.7 2.9C6.8 7.3 9.2 5.4 12 5.4Z"/></svg>';
  const LOGO = `<svg viewBox="${D.logo.v}" role="img" aria-label="CAYLA"><path fill="currentColor" d="${D.logo.d}"/></svg>`;

  // ——— Datos ———
  const PRENDAS = D.prendas.filter(p => p.fotos.length);
  const porId = new Map(D.prendas.map(p => [p.id, p]));
  // El recorte liviano de la tienda real (solo anchos 640 y 1000, ADR-0613); si no existe, la foto original del catálogo.
  const FOTO = (f, w = 640) => /^https?:/.test(f) ? f : `https://cayla.pe/api/recorte/${encodeURIComponent(f)}?w=${w > 700 ? 1000 : 640}&v=2`;
  const ORIGINAL = f => `https://vovjyyiafkxteijimpuy.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/${f}`;
  document.addEventListener("error", e => {
    const img = e.target;
    if (img.tagName !== "IMG" || img.dataset.respaldo) return;
    const m = /\/api\/recorte\/([^?]+)/.exec(img.src);
    if (m) { img.dataset.respaldo = "1"; img.src = ORIGINAL(decodeURIComponent(m[1])); }
  }, true);
  const SEDES = D.sedes;
  const ESCUDO = k => `recursos/${k}.png`;
  // Las campañas activas, como las anuncia hoy la portada de cayla.pe (leído el ${D.fecha?.slice(0, 10)}).
  const CAMPANAS = (() => {
    const out = [];
    const re = /([A-ZÁÉÍÓÚÑa-záéíóúñ ]{3,40}?)\s*[−-](\d{1,2})\s*%\s*hasta\s*([0-9]{1,2}\s*[a-záéíóú]{3,4}\.?)/g;
    let m; const txt = D.portada || "";
    while ((m = re.exec(txt))) if (!out.some(c => c.nombre === m[1].trim())) out.push({ nombre: m[1].trim(), pct: Number(m[2]), hasta: m[3].trim() });
    return out.length ? out : [{ nombre: "Top ventas", pct: 20, hasta: "31 dic." }, { nombre: "Para liquidar", pct: 15, hasta: "31 dic." }];
  })();
  const campanaDe = p => p.ofe || p.a ? CAMPANAS.find(c => c.pct === p.pct) || null : null;
  // Horarios de cada tienda (los mismos textos de la tienda real), para decir «Abierta · cierra …».
  const HORARIOS = {
    trujillo: d => d === 0 ? [8.5, 18.25] : [8.5, 20.25],
    arequipa: () => [14, 22],
    lima: d => d === 0 ? null : [11, 19.5],
  };
  const hhmm = h => { const H = Math.floor(h), M = Math.round((h - H) * 60); const ap = H >= 12 ? "p. m." : "a. m."; const h12 = H % 12 || 12; return `${h12}${M ? `:${String(M).padStart(2, "0")}` : ""} ${ap}`; };
  function estadoTienda(k) {
    const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
    const h = ahora.getHours() + ahora.getMinutes() / 60, r = HORARIOS[k]?.(ahora.getDay());
    if (r && h >= r[0] && h < r[1]) return { abierta: true, texto: `Abierta · cierra ${hhmm(r[1])}` };
    const man = HORARIOS[k]?.((ahora.getDay() + 1) % 7);
    if (r && h < r[0]) return { abierta: false, texto: `Cerrada · abre ${hhmm(r[0])}` };
    return { abierta: false, texto: man ? `Cerrada · abre mañana ${hhmm(man[0])}` : "Cerrada" };
  }
  const nivel = t => !t ? "no" : /^(Disponible|Hay)$/i.test(t) || /todas las tiendas/i.test(t) ? "hay" : /Quedan|Última|pocas/i.test(t) ? "poco" : /Hay en|Solo en/i.test(t) ? "otra" : "no";
  const notaSede = (p, k = S.sede) => p.s?.[k] || (Object.entries(p.s || {}).find(([, v]) => nivel(v) !== "no") ? `Hay en ${SEDES.find(s => s.k === Object.entries(p.s).find(([, v]) => nivel(v) !== "no")[0])?.n}` : "No hay por ahora");
  const hayEn = (p, k) => ["hay", "poco"].includes(nivel(p.s?.[k]));

  // ——— Estado de la maqueta (solo en este navegador) ———
  const CLAVE = "cayla-premium-estado";
  const S = Object.assign({ sede: "trujillo", bolsa: [], sesion: null, club: false, favs: [], pedidos: [], volver: null, registro: {} }, (() => { try { return JSON.parse(sessionStorage.getItem(CLAVE) || "{}"); } catch { return {}; } })());
  const guardar = () => { try { sessionStorage.setItem(CLAVE, JSON.stringify(S)); } catch {} };
  const enBolsa = () => S.bolsa.reduce((a, l) => a + l.cant, 0);
  const T = { portada: 0, filtros: false, cajon: null, verMas: 24, color: 0, talla: null, pideTalla: false, foto: 0, arma: null, zona: "arriba", camp: null, clave: false, err: {}, paso: "correo", cargando: null, deshacer: null, club: null };

  // ——— Rutas ———
  function ruta() {
    const h = location.hash.slice(1) || "/";
    const [path, qs] = h.split("?");
    return { path, q: new URLSearchParams(qs || ""), partes: path.split("/").filter(Boolean) };
  }
  const ir = h => { location.hash = h; };
  const conQ = (base, q, cambios) => { const n = new URLSearchParams(q); for (const [k, v] of Object.entries(cambios)) v == null || v === "" ? n.delete(k) : n.set(k, v); const s = n.toString(); return `#${base}${s ? `?${s}` : ""}`; };

  // ——— Piezas compartidas ———
  const etiquetaDe = (p, sinNuevo = false) => p.pct ? { t: `−${p.pct} %`, c: "oferta" } : p.nuevo && !sinNuevo ? { t: "Nuevo", c: "" } : p.vend && p.vend <= 3 ? { t: "Más vendido", c: "" } : null;
  function tarjeta(p, { sinRapido = false, sinNuevo = false } = {}) {
    const e = etiquetaDe(p, sinNuevo), n = notaSede(p), nv = nivel(n);
    const fav = S.favs.includes(p.id);
    const colores = (p.co || []).slice(0, 5).map(c => `<i style="background:${esc(c.h || "#ddd")}" title="${esc(c.n)}"></i>`).join("");
    const masC = Math.max(0, (p.co || []).length - 5) + (p.mas || 0);
    return `<article class="prenda${nv === "no" ? " agotada" : ""}">
      <a class="prenda-foto" href="#/prenda/${p.id}" tabindex="-1" aria-hidden="true">
        ${e ? `<span class="prenda-etiqueta ${e.c}">${e.t}</span>` : ""}
        <img src="${FOTO(p.fotos[0], 480)}" alt="" loading="lazy">
      </a>
      <button class="btn-icono prenda-fav" data-a="fav" data-id="${p.id}" aria-pressed="${fav}" aria-label="${fav ? "Quitar de" : "Guardar en"} favoritos: ${esc(p.n)}">${ic("corazon")}</button>
      ${sinRapido ? "" : `<div class="prenda-rapido"><button class="btn btn-claro btn-chico btn-ancho" data-a="rapido" data-id="${p.id}">${ic("bolsa")} Agregar rápido</button></div>`}
      <div class="prenda-info">
        <a class="prenda-nombre" href="#/prenda/${p.id}">${esc(p.n)}</a>
        <span class="prenda-precio${p.a ? " oferta" : ""}"><b class="num">${p.desde ? "Desde " : ""}${sol(p.p)}</b>${p.a ? `<s class="num"><span class="sr">Antes </span>${sol(p.a)}</s>` : ""}</span>
        <div class="prenda-pie"><span class="muestras" ${p.co?.length ? `role="img" aria-label="Colores: ${esc(p.co.map(c => c.n).join(", "))}"` : ""}>${colores}${masC ? `<small>+${masC}</small>` : ""}</span><span class="dispo ${nv}">${esc(n)}</span></div>
      </div>
    </article>`;
  }
  // En una lista que ya se llama «Lo nuevo», el sello «Nuevo» no se repite (decisión 3 del README).
  const rejilla = (ps, cls = "", op = {}) => `<div class="rejilla ${cls}">${ps.map(p => tarjeta(p, op)).join("")}</div>`;
  const secCab = (titulo, href, txt = "Ver todo", ceja = "", bajada = "") => `<div class="sec-cab"><div>${ceja ? `<span class="ceja">${ceja}</span>` : ""}<h2 class="h2">${titulo}</h2>${bajada ? `<p class="bajada">${bajada}</p>` : ""}</div>${href ? `<a class="enlace" href="${href}">${txt} ${ic("flecha")}</a>` : ""}</div>`;
  const migas = items => `<nav class="migas ancho" aria-label="Estás en">${items.map((x, i) => i < items.length - 1 ? `<a href="${x[1]}">${esc(x[0])}</a><span aria-hidden="true">/</span>` : `<span aria-current="page">${esc(x[0])}</span>`).join("")}</nav>`;
  const vacio = (icono, titulo, texto, acciones = "", nivel = "h2") => `<div class="vacio">${ic(icono)}<${nivel} class="h3">${titulo}</${nivel}><p>${texto}</p>${acciones ? `<div class="fila" style="justify-content:center;margin-top:8px">${acciones}</div>` : ""}</div>`;
  const sede = () => SEDES.find(s => s.k === S.sede);

  // ——— Marco: anuncio, cabecera, pie ———
  function cabecera(r) {
    const ropa = D.grupos.filter(g => g.menu === "ropa"), acc = D.grupos.filter(g => g.menu === "accesorios");
    const actual = r.path;
    const n = enBolsa();
    return `<div class="anuncio" role="region" aria-label="Así compras en CAYLA"><div class="ancho"><span>Separa sin pagar en la web</span><span>Recoge en tu tienda</span><span>Cambios en 15 días</span></div></div>
    <header class="cab"><div class="ancho">
      <button class="btn-icono solo-movil" data-a="menu" aria-label="Abrir menú">${ic("menu")}</button>
      <a class="logo" href="#/" aria-label="CAYLA, inicio">${LOGO}</a>
      <nav class="nav" aria-label="Principal">
        <a href="#/catalogo?lista=nuevo" ${r.q.get("lista") === "nuevo" ? 'aria-current="page"' : ""}>Lo nuevo</a>
        <button data-a="mega" data-m="ropa" aria-expanded="${T.mega === "ropa"}">Ropa ${ic("chev")}</button>
        <button data-a="mega" data-m="accesorios" aria-expanded="${T.mega === "accesorios"}">Accesorios ${ic("chev")}</button>
        <a href="#/looks" ${actual.startsWith("/look") ? 'aria-current="page"' : ""}>Outfits</a>
        <a href="#/ofertas" class="oferta" ${actual === "/ofertas" ? 'aria-current="page"' : ""}>Ofertas</a>
      </nav>
      <span class="cab-esp"></span>
      <form class="buscador" role="search" data-f="buscar">${ic("buscar")}<label class="sr" for="q">Buscar</label><input id="q" name="q" placeholder="Busca blusas, jeans, vestidos…" value="${esc(r.q.get("q") || "")}" autocomplete="off"></form>
      <button class="sede-boton" data-a="sede" aria-label="Tienda elegida: ${sede().n}. Cambiar">${`<img src="${ESCUDO(S.sede)}" alt="">`}<span class="sede-nombre">${sede().n}</span>${ic("chev")}</button>
      <button class="btn-icono solo-movil" data-a="buscarMovil" aria-label="Buscar">${ic("buscar")}</button>
      <button class="btn-icono lupa-cab" data-a="buscarMovil" aria-label="Buscar">${ic("buscar")}</button>
      <a class="btn-icono solo-escritorio" href="${S.sesion ? "#/cuenta" : "#/entrar"}" aria-label="${S.sesion ? "Mi perfil" : "Entrar"}">${ic("usuario")}</a>
      <a class="btn-icono" href="#/bolsa" aria-label="Bolsa, ${n} prendas">${ic("bolsa")}${n ? `<span class="globo">${n}</span>` : ""}</a>
    </div>
    <button class="sede-linea" data-a="sede" aria-label="Tienda elegida: ${sede().n}. Cambiar"><img src="${ESCUDO(S.sede)}" alt="">Viendo <b>${sede().n}</b> · <u>Cambiar</u></button>
    ${T.mega ? megaMenu(T.mega === "ropa" ? ropa : acc, T.mega) : ""}
    </header>`;
  }
  function megaMenu(grupos, menu) {
    const destacada = PRENDAS.find(p => p.nuevo && grupos.some(g => g.clave === p.g));
    return `<div class="mega" role="region" aria-label="Menú ${menu}"><div class="ancho">
      ${grupos.map(g => `<div><h4>${esc(g.nombre)}</h4><a href="#/catalogo?grupo=${g.clave}"><b>Ver todo</b></a>${D.categorias.filter(c => c.g === g.clave).map(c => `<a href="#/catalogo?categoria=${c.pre}">${esc(c.n)}</a>`).join("")}</div>`).join("")}
      ${destacada ? `<a class="mega-foto" href="#/catalogo?lista=nuevo"><img src="${FOTO(destacada.fotos[0], 480)}" alt=""><span>Lo nuevo</span></a>` : ""}
    </div></div>`;
  }
  function pie() {
    return `<footer class="pie"><div class="ancho">
      <nav class="pie-ayuda" aria-label="Ayuda">
        <a href="#/como-separar">${ic("ticket")}<span>Cómo separar</span>${ic("flecha")}</a>
        <a href="#/cambios">${ic("cambio")}<span>Cambios y devoluciones</span>${ic("flecha")}</a>
        <a href="#/tiendas">${ic("tienda")}<span>Nuestras tiendas</span>${ic("flecha")}</a>
      </nav>
      <div class="pie-cols">
        <div class="pie-marca"><a class="logo" href="#/" aria-label="CAYLA">${LOGO}</a><p>Donde el estilo transforma.</p></div>
        <div><h4>Comprar</h4><ul><li><a href="#/catalogo?lista=nuevo">Lo nuevo</a></li><li><a href="#/ofertas">Ofertas</a></li><li><a href="#/catalogo?lista=vendidos">Más vendidos</a></li><li><a href="#/looks">Outfits listos</a></li><li><a href="#/arma">Arma tu outfit</a></li><li><a href="#/catalogo">Toda la tienda</a></li></ul></div>
        <div><h4>Ayuda</h4><ul><li><a href="#/como-separar">Cómo separar</a></li><li><a href="#/cambios">Cambios y devoluciones</a></li><li><a href="#/ayuda">Preguntas frecuentes</a></li><li><a href="#/tiendas">Nuestras tiendas</a></li><li><button class="enlace-texto" data-a="sugerencia">Envíanos una sugerencia</button></li></ul></div>
        <div><h4>Club CAYLA</h4><ul><li><a href="#/club">Qué es el Club</a></li><li><a href="${S.sesion ? "#/cuenta" : "#/crear-cuenta"}">${S.sesion ? "Mi perfil" : "Crear mi cuenta"}</a></li>${S.sesion ? "" : '<li><a href="#/entrar">Entrar</a></li>'}<li><a href="#/terminos">Términos del Club</a></li><li><a href="#/privacidad">Privacidad</a></li></ul></div>
      </div>
      <div class="pie-legal"><span>© 2026 CAYLA · Trujillo · Arequipa · Lima</span><span>Escudos de las ciudades: Wikimedia Commons (licencias CC en la tienda real).</span></div>
    </div></footer>`;
  }

  // ——— Pantallas ———
  const P = {};

  P.inicio = () => {
    const nuevos = PRENDAS.filter(p => p.nuevo && p.g !== "mas" && p.g !== "bisuteria");
    const grupos = [0, 1, 2].map(i => nuevos.slice(i * 3, i * 3 + 3)).filter(g => g.length === 3);
    const g = grupos[T.portada % grupos.length] || [];
    const cats = D.categorias.map(c => ({ ...c, p: PRENDAS.find(p => p.cat === c.n) })).filter(c => c.p);
    const ofertas = PRENDAS.filter(p => p.ofe && (!T.camp || campanaDe(p)?.nombre === T.camp)).slice(0, 4);
    const vendidos = PRENDAS.filter(p => p.vend).sort((a, b) => a.vend - b.vend).slice(0, 4);
    return `
    <section class="portada" aria-label="Lo nuevo">
      <div class="ancho">
        <div class="portada-texto revela">
          <span class="ceja">Recién llegado · ${esc(sede().n)}</span>
          <h1 class="display">Lo nuevo</h1>
          <p class="bajada">Prendas que inspiran tu estilo.</p>
          <div class="portada-acciones"><a class="btn btn-primario" href="#/catalogo?lista=nuevo">Descubrir novedades ${ic("flecha")}</a><a class="btn btn-secundario" href="#/arma">Arma tu outfit</a></div>
          ${grupos.length > 1 ? `<div class="portada-puntos" role="group" aria-label="Elegir prendas de la portada">${grupos.map((_, i) => `<button data-a="portada" data-i="${i}" aria-label="Grupo ${i + 1} de ${grupos.length}" aria-current="${i === T.portada % grupos.length}"></button>`).join("")}</div>` : ""}
        </div>
        <div class="portada-escena">
          <div class="portada-arco" aria-hidden="true"></div>
          ${g.map(p => `<a class="portada-pieza" href="#/prenda/${p.id}" aria-label="${esc(p.n)}, ${sol(p.p)}"><img src="${FOTO(p.fotos[0], 640)}" alt="" fetchpriority="high"><figcaption>${esc(p.n)} · ${sol(p.p)}</figcaption></a>`).join("")}
        </div>
      </div>
    </section>
    <section class="beneficios" aria-label="Por qué comprar en CAYLA"><ul class="ancho">
      <li>${ic("ticket")}<span><b>Separa sin pagar</b><small>Pago por WhatsApp</small></span></li>
      <li>${ic("tienda")}<span><b>Recoge en tu tienda</b><small>Hasta 7 días después de pagar</small></span></li>
      <li>${ic("cambio")}<span><b>Cambios en 15 días</b><small>En cualquier tienda CAYLA</small></span></li>
      <li>${ic("wsp")}<span><b>Asesoría</b><small>Por WhatsApp, con tu tienda</small></span></li>
    </ul></section>
    <section class="seccion ancho" aria-labelledby="t-cat">
      ${secCab('<span id="t-cat">Compra por categoría</span>', "#/catalogo", "Ver todas")}
      <div class="carril-envoltura"><div class="carril" id="carrilCat">${cats.map(c => `<a class="cat" href="#/catalogo?categoria=${c.pre}"><span class="cat-foto"><img src="${FOTO(c.p.fotos[0], 320)}" alt="" loading="lazy"></span><span>${esc(c.n)}</span></a>`).join("")}</div>
      <button class="carril-flecha izq" data-a="carril" data-d="-1" data-c="carrilCat" aria-label="Ver categorías anteriores">${ic("chevIzq")}</button><button class="carril-flecha der" data-a="carril" data-d="1" data-c="carrilCat" aria-label="Ver más categorías">${ic("chevDer")}</button></div>
    </section>
    <section class="seccion ancho" aria-label="Arma tu outfit">
      <div class="editorial">
        <div class="editorial-foto"><img src="recursos/modelo-arma-tu-look-600.webp" alt="" loading="lazy"></div>
        <div class="editorial-texto"><span class="ceja" style="color:rgba(251,243,238,.8)">Herramienta</span><h2 class="h1">Arma tu outfit</h2><p>Combina prendas de tu tienda, fija las que te gustan y mira el total antes de separar.</p><a class="btn btn-claro" href="#/arma">Crear mi outfit ${ic("flecha")}</a></div>
        <div class="editorial-lado"><img src="recursos/mano-arma-tu-outfit-640.webp" alt="" loading="lazy"></div>
      </div>
    </section>
    <section class="seccion ancho" aria-labelledby="t-nuevo">${secCab('<span id="t-nuevo">Lo nuevo</span>', "#/catalogo?lista=nuevo", "Ver todo")}${rejilla(nuevos.slice(0, 8), "", { sinNuevo: true })}</section>
    <section class="seccion ancho" aria-labelledby="t-looks">${secCab('<span id="t-looks">Outfits listos</span>', "#/looks", "Ver todos", "", "Prendas que se ven bien juntas. Agregas el outfit entero y eliges cada talla en un paso.")}
      <div class="rejilla tres">${D.looks.slice(0, 3).map((l, i) => tarjetaLook(l, i)).join("")}</div></section>
    <section class="banda" aria-labelledby="t-ofertas"><div class="ancho">
      ${secCab('<span id="t-ofertas">Las ofertas</span>', "#/ofertas", "Ver todas", "", "El descuento ya está en el precio. Lo tachado es el precio de antes.")}
      <div class="campanas">${CAMPANAS.map(c => `<button class="campana" data-a="camp" data-c="${esc(c.nombre)}" aria-pressed="${T.camp === c.nombre}"><span class="pct num">−${c.pct} %</span><h3>${esc(c.nombre)}</h3><small>Hasta el ${esc(c.hasta)} · ${PRENDAS.filter(p => campanaDe(p)?.nombre === c.nombre).length} prendas</small></button>`).join("")}</div>
      ${rejilla(ofertas)}
    </div></section>
    <section class="seccion ancho" aria-labelledby="t-vend">${secCab('<span id="t-vend">Más vendidos</span>', "#/catalogo?lista=vendidos", "Ver todo", "", `Lo que más se llevan en ${esc(sede().n)}.`)}${rejilla(vendidos)}</section>
    <section class="seccion ancho" aria-label="Club CAYLA">${bloqueClub()}</section>
    <section class="seccion ancho" aria-labelledby="t-tiendas">${secCab('<span id="t-tiendas">Nuestras tiendas</span>', "#/tiendas", "Ver tiendas")}${tarjetasTiendas()}</section>
    <section class="seccion ancho ultima" aria-labelledby="t-sep">${secCab('<span id="t-sep">Así se separa</span>', "#/como-separar", "Ver los plazos", "Sin pagar en la web")}${pasosSeparar()}</section>`;
  };
  const pasosSeparar = () => `<ol class="pasos">
    <li><b>Elige tus prendas y tu tienda</b><p>En cada prenda ves cuánto hay en Arequipa, Lima y Trujillo.</p></li>
    <li><b>Entra o crea tu cuenta</b><p>Con tu correo, en un minuto.</p></li>
    <li><b>Toca «Separar» y mándalo por WhatsApp</b><p>El mensaje ya va escrito. No pagas nada en la web.</p></li>
    <li><b>Paga y recógelo</b><p>Coordinas el pago con la tienda y lo recoges con tu código.</p></li></ol>`;
  const tarjetaClub = (nombre = "Tu nombre aquí", dato = "") => `<div class="tarjeta-club" aria-hidden="true"><div class="entre"><span class="logo" style="color:var(--rojo)">${LOGO}</span><span style="font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--cacao-2)">Club</span></div><div class="tarjeta-club-nombre">${esc(nombre)}</div><div class="tarjeta-club-pie"><span>Miembro desde 2026</span>${dato}</div></div>`;
  const bloqueClub = () => `<div class="club">
    <div><span class="ceja">Club CAYLA</span><h2 class="h1">Tu cuenta es tu invitación.</h2>
      <ul class="club-lista"><li>${ic("estrella")}Puntos en cada compra</li><li>${ic("regalo")}Puntos de regalo en tu cumpleaños</li><li>${ic("ticket")}Cupones al canjear tus puntos</li><li>${ic("doc")}Tus pedidos en un solo lugar</li></ul>
      <div class="club-acciones"><a class="btn btn-claro" href="${S.sesion ? "#/club" : "#/crear-cuenta"}">${S.sesion ? "Ver mi Club" : "Crear mi cuenta"}</a><a class="btn btn-sobre-rojo" href="#/club">Cómo funciona</a></div></div>
    ${tarjetaClub(S.sesion?.nombre || "Tu nombre aquí")}
  </div>`;
  const tarjetasTiendas = () => `<div class="tiendas">${SEDES.map(s => { const e = estadoTienda(s.k); return `<article class="tienda">
    <div class="tienda-foto"><img src="${ESCUDO(s.k)}" alt=""><span class="marca-demo">Foto de la tienda: pendiente</span></div>
    <div class="tienda-cuerpo"><div class="entre"><h3>${esc(s.n)}</h3><span class="estado ${e.abierta ? "" : "cerrada"}">${e.texto}</span></div>
      <div class="tienda-dato">${ic("ubic")}<span>${esc(s.dir)}</span></div><div class="tienda-dato">${ic("reloj")}<span>${esc(s.hor)}</span></div></div>
    <div class="tienda-acciones"><button class="btn btn-primario btn-chico" data-a="wsp" data-k="${s.k}">${ic("wsp")} WhatsApp</button><a class="btn btn-secundario btn-chico" href="#/tienda/${s.k}">Ver tienda</a></div>
  </article>`; }).join("")}</div>`;

  // Outfits
  const prendaDeLook = x => PRENDAS.find(p => p.n.toLowerCase() === x[0].toLowerCase()) || null;
  function tarjetaLook(l, i) {
    return `<a class="outfit" href="#/look/${i}"><div class="outfit-lamina">${l.ps.slice(0, 3).map(x => `<img src="${FOTO(x[2], 480)}" alt="" loading="lazy">`).join("")}</div>
      <div class="outfit-cab"><h3>${esc(l.n)}</h3><b class="num">${sol(l.t)}</b></div><p>${l.ps.length} prendas · ${esc(l.ps.map(x => x[0]).join(" + "))}</p></a>`;
  }
  P.looks = () => `${migas([["Inicio", "#/"], ["Outfits listos"]])}
    <div class="ancho"><div class="pagina-cab"><div><span class="ceja">Combinaciones listas</span><h1 class="h1">Outfits listos</h1><p class="bajada">Prendas que se ven bien juntas. Agregas el outfit entero y eliges cada talla en un paso.</p></div><a class="btn btn-secundario" href="#/arma">${ic("chispa")} Arma el tuyo</a></div>
    <div class="rejilla tres">${D.looks.map(tarjetaLook).join("")}</div></div><div class="seccion"></div>`;
  P.look = r => {
    const i = Number(r.partes[1]); const l = D.looks[i];
    if (!l) return P.noExiste();
    const ps = l.ps.map(x => ({ x, p: prendaDeLook(x) }));
    return `${migas([["Inicio", "#/"], ["Outfits listos", "#/looks"], [l.n]])}
    <div class="ancho ficha"><div class="outfit-lamina" style="aspect-ratio:4/4.2;border-radius:var(--r-l)">${l.ps.slice(0, 3).map(x => `<img src="${FOTO(x[2], 800)}" alt="">`).join("")}</div>
      <div class="ficha-info"><div><span class="ceja">Outfit listo</span><h1 class="h1">${esc(l.n)}</h1><p class="bajada">${esc(l.f || "")}</p></div>
        <div class="resumen"><ul>${ps.map(({ x, p }) => `<li><img src="${FOTO(x[2], 160)}" alt=""><span>${p ? `<a href="#/prenda/${p.id}"><b>${esc(x[0])}</b></a><br><span class="dispo ${nivel(notaSede(p))}">${esc(notaSede(p))}</span>` : `<b>${esc(x[0])}</b><br><span class="texto-chico">Ver en la tienda</span>`}</span><span class="num">${sol(x[1])}</span></li>`).join("")}</ul>
        <div class="resumen-total"><span>Total del outfit</span><b class="num">${sol(l.t)}</b></div></div>
        <button class="btn btn-primario btn-ancho" data-a="lookBolsa" data-i="${i}">${ic("bolsa")} Agregar el outfit a la bolsa</button>
        <a class="btn btn-secundario btn-ancho" href="#/arma?look=${i}">${ic("chispa")} Cambiar prendas en «Arma tu outfit»</a>
        ${garantias()}</div></div>
    <section class="seccion ancho ultima">${secCab("Otros outfits", "#/looks", "Ver todos")}<div class="rejilla tres">${D.looks.map((x, j) => j === i ? "" : tarjetaLook(x, j)).join("")}</div></section>`;
  };
  const garantias = () => `<div class="ficha-garantias"><div>${ic("ticket")}<span><b>Separas sin pagar en la web.</b> La tienda te confirma por WhatsApp y coordinas el pago con ella.</span></div><div>${ic("tienda")}<span><b>Recoges en tu tienda,</b> hasta 7 días después de pagar.</span></div><div>${ic("cambio")}<span><b>Cambias en cualquier tienda CAYLA:</b> 15 días, con tu boleta y la etiqueta puesta.</span></div></div>`;

  // Catálogo
  const LISTAS = { nuevo: ["Lo nuevo", "Recién llegado a las tiendas."], ofertas: ["Ofertas", "El descuento ya está en el precio."], vendidos: ["Más vendidos", "Lo que más se llevan."], favoritos: ["Tus favoritos", "Lo que guardaste con el corazón."] };
  const ORDENES = [["destacado", "Destacado"], ["nuevo", "Lo nuevo primero"], ["menor", "Precio: de menor a mayor"], ["mayor", "Precio: de mayor a menor"]];
  function filtrar(q) {
    let ps = PRENDAS;
    const lista = q.get("lista"), cat = q.get("categoria"), gr = q.get("grupo"), b = (q.get("q") || "").trim().toLowerCase();
    if (lista === "nuevo") ps = ps.filter(p => p.nuevo);
    if (lista === "ofertas") ps = ps.filter(p => p.ofe || p.a);
    if (lista === "vendidos") ps = ps.filter(p => p.vend).sort((a, z) => a.vend - z.vend);
    if (lista === "favoritos") ps = ps.filter(p => S.favs.includes(p.id));
    if (cat) { const c = D.categorias.find(x => x.pre === cat); ps = ps.filter(p => p.cat === c?.n); }
    if (gr) ps = ps.filter(p => p.g === gr);
    if (q.get("campana")) ps = ps.filter(p => campanaDe(p)?.nombre === q.get("campana"));
    if (b) { const n = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); const bb = n(b); ps = ps.filter(p => n(`${p.n} ${p.cat} ${(p.co || []).map(c => c.n).join(" ")}`).includes(bb)); }
    const base = ps;
    const talla = q.get("talla"), color = q.get("color");
    if (talla) ps = ps.filter(p => p.t.includes(talla) && !p.tOff.includes(talla));
    if (color) ps = ps.filter(p => (p.co || []).some(c => c.n === color));
    if (q.get("hay") === "1") ps = ps.filter(p => hayEn(p, S.sede));
    const o = q.get("orden");
    if (o === "menor") ps = [...ps].sort((a, z) => a.p - z.p);
    if (o === "mayor") ps = [...ps].sort((a, z) => z.p - a.p);
    if (o === "nuevo") ps = [...ps].sort((a, z) => Number(z.nuevo) - Number(a.nuevo));
    if (!o || o === "destacado") ps = [...ps].sort((a, z) => Number(hayEn(z, S.sede)) - Number(hayEn(a, S.sede)));
    return { ps, base };
  }
  function opcionesFiltro(base, q, r) {
    const tallas = [...new Set(base.flatMap(p => p.t))].filter(Boolean);
    const ORDEN_T = ["XS", "S", "M", "L", "XL", "XXL", "Estándar"];
    tallas.sort((a, b) => (ORDEN_T.indexOf(a) + 1 || 50 + Number(a) || 99) - (ORDEN_T.indexOf(b) + 1 || 50 + Number(b) || 99));
    const colores = [...new Map(base.flatMap(p => p.co || []).map(c => [c.n, c])).values()].slice(0, 18);
    const href = cambios => conQ(r.path, q, { ...cambios, ver: null });
    return `
      <div class="filtro"><h3>Categoría</h3><ul class="lista-chica">
        <li><a href="${href({ categoria: null, grupo: null })}" aria-current="${!q.get("categoria") && !q.get("grupo")}">Todo</a></li>
        ${D.grupos.map(g => { const n = PRENDAS.filter(p => p.g === g.clave).length; return n ? `<li><a href="${href({ grupo: g.clave, categoria: null })}" aria-current="${q.get("grupo") === g.clave}">${esc(g.nombre.replace("/", " y "))} <small>${n}</small></a></li>` : ""; }).join("")}
      </ul></div>
      <div class="filtro"><h3>Disponibilidad</h3><label class="casilla"><input type="checkbox" data-a="hay" ${q.get("hay") === "1" ? "checked" : ""}><span>Solo lo que hay en ${esc(sede().n)}</span></label></div>
      ${tallas.length ? `<div class="filtro"><h3>Talla</h3><div class="opciones">${tallas.map(t => `<a class="opcion" href="${href({ talla: q.get("talla") === t ? null : t })}" aria-pressed="${q.get("talla") === t}">${esc(t)}</a>`).join("")}</div></div>` : ""}
      ${colores.length ? `<div class="filtro"><h3>Color</h3><div class="opciones">${colores.map(c => `<a class="opcion" href="${href({ color: q.get("color") === c.n ? null : c.n })}" aria-pressed="${q.get("color") === c.n}"><i style="background:${esc(c.h || "#ddd")}"></i>${esc(c.n)}</a>`).join("")}</div></div>` : ""}`;
  }
  P.catalogo = r => {
    const q = r.q, lista = q.get("lista");
    if (lista === "favoritos" && !S.sesion) { S.volver = "/catalogo?lista=favoritos"; guardar(); return P.entrar(r, "Entra para ver tus favoritos."); }
    const cat = D.categorias.find(c => c.pre === q.get("categoria")), gr = D.grupos.find(g => g.clave === q.get("grupo"));
    const titulo = q.get("q") ? `«${esc(q.get("q"))}»` : cat ? esc(cat.n) : gr ? esc(gr.nombre.replace("/", " y ")) : LISTAS[lista]?.[0] || "Toda la tienda";
    const { ps, base } = filtrar(q);
    const puestos = [["talla", q.get("talla")], ["color", q.get("color")], ["hay", q.get("hay") === "1" ? `En ${sede().n}` : null], ["q", q.get("q") ? `Búsqueda: ${q.get("q")}` : null], ["campana", q.get("campana")]].filter(x => x[1]);
    const cuantos = Math.min(ps.length, Number(q.get("ver") || 24));
    const nFiltros = puestos.length;
    return `${migas([["Inicio", "#/"], ...(cat ? [[D.grupos.find(g => g.clave === cat.g)?.nombre.replace("/", " y ") || "", `#/catalogo?grupo=${cat.g}`]] : []), [titulo.replace(/«|»/g, "")]])}
    <div class="ancho">
      <div class="pagina-cab"><div><span class="ceja">${q.get("q") ? "Resultados" : "Catálogo"} · ${esc(sede().n)}</span><h1 class="h1">${titulo}</h1>${LISTAS[lista] && !cat ? `<p class="bajada">${LISTAS[lista][1]}</p>` : ""}</div></div>
      <div class="filtros-movil"><button class="btn btn-secundario btn-chico" data-a="filtros">${ic("filtro")} Filtros${nFiltros ? ` (${nFiltros})` : ""}</button><label class="selector">${ic("ordenar")}<span class="sr">Ordenar</span><select data-a="orden" aria-label="Ordenar">${ORDENES.map(o => `<option value="${o[0]}" ${q.get("orden") === o[0] ? "selected" : ""}>${o[1]}</option>`).join("")}</select></label></div>
      <div class="catalogo">
        <aside class="filtros-lado" aria-label="Filtros">${opcionesFiltro(base, q, r)}</aside>
        <div>
          <div class="barra-lista"><span class="cuenta" aria-live="polite"><b>${ps.length}</b> ${ps.length === 1 ? "prenda" : "prendas"}${q.get("hay") === "1" ? ` en ${esc(sede().n)}` : ""}</span>
            <label class="selector solo-escritorio">Ordenar: <select data-a="orden" aria-label="Ordenar">${ORDENES.map(o => `<option value="${o[0]}" ${(q.get("orden") || "destacado") === o[0] ? "selected" : ""}>${o[1]}</option>`).join("")}</select>${ic("chev")}</label></div>
          ${puestos.length ? `<div class="puestos">${puestos.map(([k, v]) => `<a class="puesto" href="${conQ(r.path, q, { [k]: null })}" aria-label="Quitar filtro ${esc(v)}">${esc(v)} ${ic("cerrar")}</a>`).join("")}<a class="enlace-texto texto-chico" style="align-self:center" href="${conQ(r.path, q, { talla: null, color: null, hay: null, q: null, campana: null })}">Limpiar todo</a></div>` : ""}
          ${ps.length ? `${rejilla(ps.slice(0, cuantos), "tres", { sinNuevo: lista === "nuevo" })}
            ${cuantos < ps.length ? `<div style="display:grid;justify-items:center;gap:12px;margin-top:48px"><span class="texto-chico">Viste ${cuantos} de ${ps.length}</span><div style="width:200px;height:2px;background:var(--linea);border-radius:2px"><div style="height:100%;width:${(cuantos / ps.length) * 100}%;background:var(--cacao)"></div></div><a class="btn btn-secundario" href="${conQ(r.path, q, { ver: cuantos + 24 })}" data-sin-subir>Ver ${Math.min(24, ps.length - cuantos)} más</a></div>` : ""}`
            : vacio(q.get("q") ? "lupaX" : "percha", q.get("q") ? `No encontramos «${esc(q.get("q"))}»` : lista === "favoritos" ? "Aún no guardas favoritos" : "No hay prendas con estos filtros", q.get("q") ? "Prueba con otra palabra: una prenda («blusa»), un color («negro») o una categoría." : lista === "favoritos" ? "Toca el corazón de una prenda para guardarla aquí." : `Quita un filtro o mira lo que hay en otra tienda.`, `${puestos.length ? `<a class="btn btn-secundario" href="${conQ(r.path, q, { talla: null, color: null, hay: null, q: null })}">Quitar filtros</a>` : ""}<a class="btn btn-primario" href="#/catalogo?lista=nuevo">Ver lo nuevo</a>`)}
        </div>
      </div>
    </div><div class="seccion"></div>`;
  };
  P.ofertas = r => {
    const elegida = r.q.get("campana");
    const ps = PRENDAS.filter(p => (p.ofe || p.a) && (!elegida || campanaDe(p)?.nombre === elegida));
    return `${migas([["Inicio", "#/"], ["Ofertas"]])}
    <div class="ancho"><div class="pagina-cab"><div><span class="ceja">Campañas vigentes</span><h1 class="h1">Las ofertas</h1><p class="bajada">El descuento ya está aplicado en el precio de la web y en la tienda. Lo tachado es el precio de antes.</p></div></div>
    <div class="campanas">${CAMPANAS.map(c => `<a class="campana" href="${conQ("/ofertas", r.q, { campana: elegida === c.nombre ? null : c.nombre })}" aria-pressed="${elegida === c.nombre}"><span class="pct num">−${c.pct} %</span><h3>${esc(c.nombre)}</h3><small>Vigente hasta el ${esc(c.hasta)} · ${PRENDAS.filter(p => campanaDe(p)?.nombre === c.nombre).length} prendas</small></a>`).join("")}</div>
    <div class="aviso" style="margin-bottom:32px">${ic("info")}<span>Las condiciones de cada campaña (vigencia, tiendas, stock) salen del ERP. Esta maqueta solo muestra nombre, descuento y fecha tal como los anuncia hoy cayla.pe, y asigna cada prenda a su campaña por su porcentaje: no agrega condiciones.</span></div>
    <div class="barra-lista"><span class="cuenta"><b>${ps.length}</b> prendas en oferta${elegida ? ` · ${esc(elegida)}` : ""}</span>${elegida ? `<a class="puesto" href="#/ofertas">${esc(elegida)} ${ic("cerrar")}</a>` : ""}</div>
    ${ps.length ? rejilla(ps) : vacio("percha", "No hay ofertas ahora", "Cuando haya una campaña, la verás aquí con su vigencia.", '<a class="btn btn-primario" href="#/catalogo?lista=nuevo">Ver lo nuevo</a>')}</div><div class="seccion"></div>`;
  };

  // Ficha de prenda
  P.prenda = r => {
    const p = porId.get(r.partes[1]);
    if (!p) return P.noExiste("Esta prenda ya no está en la tienda.");
    if (T.fichaDe !== p.id) { T.fichaDe = p.id; T.color = 0; T.talla = p.t.length === 1 ? p.t[0] : null; T.pideTalla = false; T.foto = 0; }
    const colores = (p.coF?.length ? p.coF.map(c => ({ n: c.n, h: c.h })) : p.co) || [];
    const c = colores[T.color] || colores[0];
    const camp = campanaDe(p);
    const rel = PRENDAS.filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 4);
    const nota = notaSede(p), nv = nivel(nota);
    const sinStock = !hayEn(p, S.sede);
    const fotos = p.fotos.slice(0, 6);
    const accion = sinStock ? `<button class="btn btn-secundario" data-a="avisame" data-id="${p.id}">${ic("campana")} Avísame cuando llegue a ${esc(sede().n)}</button>` : `<button class="btn btn-primario" data-a="agregar" data-id="${p.id}" ${T.cargando === "agregar" ? 'aria-busy="true"' : ""}>${ic("bolsa")} Agregar a la bolsa</button>`;
    const grupoDe = D.grupos.find(g => g.clave === p.g);
    return `${migas([["Inicio", "#/"], ...(grupoDe ? [[grupoDe.nombre.replace("/", " y "), `#/catalogo?grupo=${p.g}`]] : []), ...(p.cat ? [[p.cat, `#/catalogo?categoria=${D.categorias.find(x => x.n === p.cat)?.pre || ""}`]] : []), [p.n]])}
    <div class="ancho ficha">
      <div class="galeria">
        <div class="galeria-miniaturas">${fotos.map((f, i) => `<button data-a="foto" data-i="${i}" aria-current="${i === T.foto}" aria-label="Foto ${i + 1}"><img src="${FOTO(f, 160)}" alt=""></button>`).join("")}</div>
        <div><div class="galeria-carril" id="galeria">${(window.innerWidth >= 1024 ? [fotos[T.foto]] : fotos).map(f => `<div class="galeria-principal">${etiquetaDe(p) ? `<span class="prenda-etiqueta ${etiquetaDe(p).c}">${etiquetaDe(p).t}</span>` : ""}<img src="${FOTO(f, 1080)}" alt="${esc(p.n)}"></div>`).join("")}</div>
        ${fotos.length > 1 ? `<div class="galeria-puntos" aria-hidden="true">${fotos.map((_, i) => `<i aria-current="${i === 0}"></i>`).join("")}</div>` : ""}</div>
      </div>
      <div class="ficha-info">
        <div><span class="ceja">${esc(p.cat || "CAYLA")}</span><h1 class="h1">${esc(p.n)}</h1></div>
        <div><div class="ficha-precio${p.a ? " oferta" : ""}"><b class="num">${p.desde ? "Desde " : ""}${sol(p.p)}</b>${p.a ? `<s class="num"><span class="sr">Antes </span>${sol(p.a)}</s><span class="pildora" style="background:var(--vino);color:var(--sobre-rojo)">−${p.pct} %</span>` : ""}</div>
          ${camp ? `<p class="texto-chico" style="margin:6px 0 0">Campaña «${esc(camp.nombre)}», vigente hasta el ${esc(camp.hasta)}.</p>` : ""}${p.desde ? `<p class="texto-chico" style="margin:6px 0 0">El precio cambia según la talla: elige la tuya para verlo.</p>` : ""}</div>
        ${colores.length ? `<div class="ficha-bloque"><div class="ficha-etq"><span>Color: <b>${esc(c?.n || "")}</b></span><span class="texto-chico">${colores.length} ${colores.length === 1 ? "color" : "colores"}</span></div>
          <div class="colores" role="radiogroup" aria-label="Color">${colores.map((k, i) => `<button class="color" role="radio" aria-checked="${i === T.color}" data-a="color" data-i="${i}" aria-label="${esc(k.n)}" title="${esc(k.n)}"><i style="background:${esc(k.h || "#ddd")}"></i></button>`).join("")}</div></div>` : ""}
        ${p.t.length ? `<div class="ficha-bloque" id="bloqueTalla"><div class="ficha-etq"><span>Talla${T.talla ? `: <b>${esc(T.talla)}</b>` : ""}</span><button class="enlace-texto texto-chico" data-a="guiaTallas">${ic("regla")} Guía de tallas</button></div>
          <div class="tallas" role="radiogroup" aria-label="Talla">${p.t.map(t => { const off = p.tOff.includes(t); return `<button class="opcion" role="radio" data-a="talla" data-t="${esc(t)}" aria-checked="${T.talla === t}" ${off ? 'disabled aria-label="' + esc(t) + ', agotada"' : ""}>${esc(t)}</button>`; }).join("")}</div>
          ${T.pideTalla && !T.talla ? `<p class="campo"><span class="pie-campo error" role="alert">${ic("alerta")} Elige tu talla para agregarla.</span></p>` : ""}</div>` : `<p class="texto-chico">Las tallas de esta prenda se confirman con la tienda.</p>`}
        <div class="ficha-bloque"><div class="ficha-etq"><span>Disponibilidad</span><button class="enlace-texto texto-chico" data-a="sede">Cambiar tienda</button></div>
          <ul class="stock-sedes">${SEDES.map(s => `<li aria-current="${s.k === S.sede}"><span>${s.k === S.sede ? `<b>${esc(s.n)}</b> · tu tienda` : esc(s.n)}</span><span class="dispo ${nivel(p.s?.[s.k])}">${esc(p.s?.[s.k] || "No hay por ahora")}</span></li>`).join("")}</ul>
          ${sinStock ? `<div class="aviso atencion">${ic("info")}<span>No hay en ${esc(sede().n)} ahora. Cada tienda maneja lo suyo: puedes cambiar de tienda o pedir que te avisemos.</span></div>` : ""}</div>
        <div class="ficha-acciones escritorio">${accion}<button class="btn-icono" style="border:1px solid var(--linea-fuerte);width:48px;height:48px" data-a="fav" data-id="${p.id}" aria-pressed="${S.favs.includes(p.id)}" aria-label="Guardar en favoritos">${ic("corazon")}</button></div>
        <a class="enlace" href="#/arma?con=${p.id}" style="justify-self:start">${ic("chispa")} Arma un outfit con esta prenda</a>
        ${garantias()}
        <div class="acordeon">
          <details open><summary>Descripción ${ic("mas")}</summary><div class="contenido">${p.desc ? esc(p.desc) : "Esta prenda aún no tiene descripción en el catálogo. <span class='demo'>Falta dato</span>"}</div></details>
          <details><summary>Materiales y cuidado ${ic("mas")}</summary><div class="contenido">El catálogo todavía no guarda materiales ni cuidados por prenda. Propuesta: sumar ese campo en el ERP para mostrarlo aquí. <span class="demo">Propuesta</span></div></details>
          <details><summary>Separar y recoger ${ic("mas")}</summary><div class="contenido">La tienda tiene 24 horas para confirmar tu pedido. Desde que lo confirma, tienes 48 horas para pagar (Yape, Plin, transferencia o en tienda) y hasta 7 días después de pagar para recogerlo. <a href="#/como-separar">Ver cómo separar</a></div></details>
        </div>
      </div>
    </div>
    <div class="ancho"><div class="barra-compra">${accion}</div></div>
    ${rel.length ? `<section class="seccion ancho ultima">${secCab("También te puede gustar", `#/catalogo?categoria=${D.categorias.find(x => x.n === p.cat)?.pre || ""}`, "Ver todo", esc(p.cat || ""))}${rejilla(rel)}</section>` : ""}`;
  };

  // Arma tu outfit
  const ZONAS = [["arriba", "Arriba", p => ["arriba", "encima"].includes(p.g)], ["abajo", "Abajo", p => p.g === "abajo"], ["vestido", "Vestido", p => p.pre === "VES" || p.cat === "Vestidos" || p.cat === "Enterizos"], ["bolso", "Accesorio", p => p.g === "bolsos"]];
  const deZona = z => PRENDAS.filter(p => ZONAS.find(x => x[0] === z)[2](p) && hayEn(p, S.sede)).slice(0, 30);
  function armaInicial(q) {
    const a = { arriba: null, abajo: null, vestido: null, bolso: null, fijo: {} };
    const pick = z => deZona(z)[0]?.id || null;
    a.arriba = pick("arriba"); a.abajo = pick("abajo"); a.bolso = pick("bolso");
    const con = porId.get(q.get("con"));
    if (con) { const z = ZONAS.find(x => x[2](con))?.[0]; if (z === "vestido") { a.vestido = con.id; a.arriba = a.abajo = null; } else if (z) a[z] = con.id; if (z) a.fijo[z] = true; }
    const look = D.looks[Number(q.get("look"))];
    if (q.has("look") && look) for (const x of look.ps) { const p = prendaDeLook(x); const z = p && ZONAS.find(y => y[2](p))?.[0]; if (z) a[z] = p.id; }
    return a;
  }
  P.arma = r => {
    const clave = `${r.q.get("con") || ""}|${r.q.get("look") || ""}|${S.sede}`;
    if (!T.arma || T.armaClave !== clave) { T.arma = armaInicial(r.q); T.armaClave = clave; }
    const A = T.arma;
    const piezas = (A.vestido ? ["vestido", "bolso"] : ["arriba", "abajo", "bolso"]).map(z => [z, porId.get(A[z])]).filter(x => x[1]);
    const total = piezas.reduce((s, [, p]) => s + p.p, 0);
    const ranura = (z, etq) => {
      const p = porId.get(A[z]);
      return `<div class="ranura ${p ? "" : "vacia"} ${T.zona === z ? "activa" : ""}" data-a="zona" data-z="${z}" aria-label="${etq}${p ? `: ${esc(p.n)}` : ": vacío"}" role="group">
        ${p ? `<img src="${FOTO(p.fotos[0], 560)}" alt="">
        <div class="ranura-herr"><button data-a="fijar" data-z="${z}" aria-pressed="${!!A.fijo[z]}" aria-label="${A.fijo[z] ? "Soltar" : "Fijar"} ${etq}" title="${A.fijo[z] ? "Fijada: Sorpréndeme no la cambia" : "Fijar esta prenda"}">${ic(A.fijo[z] ? "candado" : "abierto")}</button><button data-a="quitarZona" data-z="${z}" aria-label="Quitar ${etq}">${ic("cerrar")}</button></div>
        <div class="ranura-flechas"><button data-a="pasar" data-z="${z}" data-d="-1" aria-label="${etq} anterior">${ic("chevIzq")}</button><button data-a="pasar" data-z="${z}" data-d="1" aria-label="${etq} siguiente">${ic("chevDer")}</button></div>` : `<span>${ic("mas")} ${etq}</span>`}
      </div>`;
    };
    const opciones = deZona(T.zona);
    return `${migas([["Inicio", "#/"], ["Arma tu outfit"]])}
    <div class="ancho"><div class="pagina-cab"><div><span class="ceja">Herramienta · ${esc(sede().n)}</span><h1 class="h1">Arma tu outfit</h1><p class="bajada">Toca una zona y elige la prenda. Fija con el candado lo que te gusta y deja que «Sorpréndeme» cambie lo demás.</p></div>
      <button class="btn btn-secundario" data-a="sorprende">${ic("dado")} Sorpréndeme</button></div>
    <div class="armador">
      <div class="lienzo" style="${A.vestido ? "grid-template-rows:minmax(0,2.1fr) minmax(0,.5fr)" : ""}">${A.vestido ? ranura("vestido", "Vestido") : ranura("arriba", "Arriba") + ranura("abajo", "Abajo")}${ranura("bolso", "Accesorio")}</div>
      <div class="armador-panel">
        <div class="pestanas" role="tablist" aria-label="Zona">${ZONAS.map(([z, n]) => `<button role="tab" data-a="zona" data-z="${z}" aria-selected="${T.zona === z}">${n}</button>`).join("")}</div>
        ${T.zona === "vestido" && !A.vestido ? `<p class="texto-chico" style="margin:0">El vestido ocupa arriba y abajo.</p>` : ""}
        ${opciones.length ? `<div class="mini-rejilla">${opciones.map(p => `<button class="mini" data-a="elegir" data-id="${p.id}" aria-pressed="${A[T.zona] === p.id}"><span class="prenda-foto"><img src="${FOTO(p.fotos[0], 320)}" alt="" loading="lazy"></span><span>${esc(p.n)}</span><b class="num">${sol(p.p)}</b></button>`).join("")}</div>` : vacio("percha", "Nada para esta zona", `No hay prendas de esta zona en ${esc(sede().n)} ahora.`)}
        <div class="resumen"><ul>${piezas.length ? piezas.map(([z, p]) => `<li><img src="${FOTO(p.fotos[0], 160)}" alt=""><span><a href="#/prenda/${p.id}"><b>${esc(p.n)}</b></a><br><span class="dispo ${nivel(notaSede(p))}">${esc(notaSede(p))}</span>${A.fijo[z] ? ' · <span class="texto-chico">fijada</span>' : ""}</span><span class="num">${sol(p.p)}</span></li>`).join("") : '<li style="display:block" class="texto-chico">Tu outfit está vacío: elige una prenda.</li>'}</ul>
          <div class="resumen-total"><span>${piezas.length} ${piezas.length === 1 ? "prenda" : "prendas"}</span><b class="num">${sol(total)}</b></div></div>
        <button class="btn btn-primario btn-ancho" data-a="armaBolsa" ${piezas.length ? "" : "disabled"}>${ic("bolsa")} Agregar ${piezas.length || ""} ${piezas.length === 1 ? "prenda" : "prendas"} a la bolsa</button>
        <p class="texto-chico" style="margin:0;text-align:center">Eliges cada talla en el siguiente paso.</p>
      </div>
    </div></div><div class="seccion"></div>`;
  };

  // Bolsa y separación
  P.bolsa = () => {
    if (!S.bolsa.length) {
      // Se conserva el vacío de la tienda real: un solo título, centrado, sin recuadro.
      return `<div class="ancho">${vacio("bolsa", "Tu bolsa está vacía", "Elige una prenda y su talla, o agrega un outfit completo.", '<a class="btn btn-primario" href="#/catalogo">Ver toda la tienda</a><a class="btn btn-secundario" href="#/looks">Ver outfits listos</a>', "h1")}</div>
      <section class="seccion ancho ultima">${secCab("Lo nuevo", "#/catalogo?lista=nuevo", "Ver todo", "Recién llegado")}${rejilla(PRENDAS.filter(p => p.nuevo).slice(0, 4), "", { sinNuevo: true })}</section>`;
    }
    const lineas = S.bolsa.map((l, i) => ({ l, i, p: porId.get(l.id) })).filter(x => x.p);
    const total = lineas.reduce((s, { l, p }) => s + p.p * l.cant, 0);
    const antes = lineas.reduce((s, { l, p }) => s + (p.a || p.p) * l.cant, 0);
    const faltan = lineas.filter(({ p }) => !hayEn(p, S.sede));
    const n = enBolsa();
    const btnSeparar = faltan.length ? `<button class="btn btn-primario btn-ancho" disabled>Separar en ${esc(sede().n)}</button><p class="texto-chico" style="margin:0">${faltan.length === 1 ? "Una prenda no está" : `${faltan.length} prendas no están`} en ${esc(sede().n)}: quítala${faltan.length > 1 ? "s" : ""} o elige otra tienda.</p>` : `<button class="btn btn-primario btn-ancho" data-a="separar" ${T.cargando === "separar" ? 'aria-busy="true"' : ""}>${S.sesion ? `Separar en ${esc(sede().n)}` : "Entra para separar"}</button>`;
    return `<div class="ancho"><div class="pagina-cab"><div><h1 class="h1">Tu bolsa</h1><p class="bajada">${n} ${n === 1 ? "prenda" : "prendas"} · para recoger en ${esc(sede().n)}</p></div></div>
    <div class="bolsa" style="padding-top:0">
      <div>
        ${lineas.map(({ l, i, p }) => { const nt = notaSede(p), nv = nivel(nt); return `<div class="linea">
          <a class="prenda-foto" href="#/prenda/${p.id}"><img src="${FOTO(p.fotos[0], 240)}" alt=""></a>
          <div><h3><a href="#/prenda/${p.id}">${esc(p.n)}</a></h3><p class="detalle">${[l.color, l.talla ? `Talla ${l.talla}` : null].filter(Boolean).map(esc).join(" · ")}</p>
            <span class="dispo ${nv}">${nv === "hay" || nv === "poco" ? `${esc(nt)} en ${esc(sede().n)}` : `No hay en ${esc(sede().n)}`}</span>
            <div class="fila" style="margin-top:12px"><div class="cantidad" role="group" aria-label="Cantidad de ${esc(p.n)}"><button data-a="cant" data-i="${i}" data-d="-1" ${l.cant <= 1 ? "disabled" : ""} aria-label="Una menos">${ic("menos")}</button><output>${l.cant}</output><button data-a="cant" data-i="${i}" data-d="1" ${l.cant >= 2 || n >= 20 ? "disabled" : ""} aria-label="Una más">${ic("mas")}</button></div>
            <button class="enlace-texto texto-chico" data-a="quitar" data-i="${i}">Quitar</button></div>
            ${l.cant >= 2 ? '<p class="texto-chico" style="margin:6px 0 0">Máximo 2 de cada prenda por pedido.</p>' : ""}</div>
          <div class="linea-der"><b class="num">${sol(p.p * l.cant)}</b>${p.a ? `<s class="texto-chico num">${sol(p.a * l.cant)}</s>` : ""}</div></div>`; }).join("")}
      </div>
      <aside class="caja-resumen" aria-label="Resumen">
        <div><span class="ceja" style="color:var(--cacao-2)">Recoges en</span><button class="sede-op" data-a="sede" aria-label="Cambiar tienda de recojo"><img src="${ESCUDO(S.sede)}" alt=""><span><b>CAYLA ${esc(sede().n)}</b><small>${esc(sede().dir)}</small></span><span class="texto-chico">Cambiar</span></button></div>
        <dl>
          <div><dt>${n} ${n === 1 ? "prenda" : "prendas"}</dt><dd class="num">${sol(antes)}</dd></div>
          ${antes > total ? `<div><dt>Descuentos de campaña</dt><dd class="num" style="color:var(--acento)">−${sol(antes - total)}</dd></div>` : ""}
          <div class="total"><dt>Total</dt><dd class="num">${sol(total)}</dd></div>
          <div><dt><b style="color:var(--cacao)">Pagas hoy</b></dt><dd><b>S/ 0.00</b></dd></div>
        </dl>
        ${btnSeparar}
        <ol class="pasos-separar"><li><span><b style="color:var(--cacao)">Separas hoy sin pagar.</b> Se crea tu pedido y lo mandas por WhatsApp.</span></li><li><span><b style="color:var(--cacao)">La tienda lo confirma en 24 horas.</b> Si no, se cierra solo.</span></li><li><span><b style="color:var(--cacao)">Pagas en 48 horas</b> desde que confirma: Yape, Plin, transferencia o en tienda.</span></li><li><span><b style="color:var(--cacao)">Recoges con tu código,</b> hasta 7 días después de pagar.</span></li></ol>
        <a class="enlace-texto texto-chico" href="#/como-separar">Ver cómo separar</a>
      </aside>
    </div></div><div class="seccion"></div>`;
  };
  P.datos = () => {
    if (!S.sesion) { S.volver = "/bolsa"; guardar(); return P.entrar({ q: new URLSearchParams() }, "Entra para separar."); }
    const e = T.err;
    return `<div class="ancho angosto"><div class="pagina-cab"><div><span class="ceja">Último paso · solo la primera vez</span><h1 class="h1">Completa tus datos para separar</h1><p class="bajada">Con tu documento y tu celular la tienda confirma tu pedido, y entras al Club CAYLA.</p></div></div>
    <form class="ficha-bloque" data-f="datos" novalidate style="gap:20px">
      ${campo("doc", "DNI o carné de extranjería", "text", "", e.doc, "8 a 12 caracteres", 'inputmode="numeric" autocomplete="off"')}
      ${campo("cel", "Celular (WhatsApp)", "tel", "", e.cel, "La tienda te escribe aquí para confirmar", 'inputmode="tel" autocomplete="tel"')}
      ${campo("cumple", "Cumpleaños", "date", "", null, "Opcional: en tu cumpleaños recibes puntos de regalo")}
      <label class="casilla"><input type="checkbox" name="mayor"><span>Soy mayor de 18 años</span></label>${e.mayor ? `<span class="campo"><span class="pie-campo error">${ic("alerta")} ${e.mayor}</span></span>` : ""}
      <label class="casilla"><input type="checkbox" name="terminos"><span>Acepto los <a class="enlace-texto" href="#/terminos">Términos del Club</a> y la <a class="enlace-texto" href="#/privacidad">Privacidad</a></span></label>${e.terminos ? `<span class="campo"><span class="pie-campo error">${ic("alerta")} ${e.terminos}</span></span>` : ""}
      <label class="casilla"><input type="checkbox" name="wsp"><span>Quiero recibir avisos del Club por WhatsApp <span class="texto-chico">(opcional)</span></span></label>
      <button class="btn btn-primario btn-ancho" ${T.cargando === "datos" ? 'aria-busy="true"' : ""}>Guardar y separar en ${esc(sede().n)}</button>
      <a class="enlace-texto texto-chico" href="#/bolsa" style="justify-self:center">Volver a la bolsa</a>
    </form></div><div class="seccion"></div>`;
  };
  P.separado = r => {
    const ped = S.pedidos.find(x => x.num === r.partes[1]);
    if (!ped) return P.noExiste("No encontramos ese pedido.");
    const s = SEDES.find(x => x.k === ped.sede);
    const quedan = Math.max(0, ped.creado + 24 * 3600e3 - Date.now());
    const hh = Math.floor(quedan / 3600e3), mm = Math.floor((quedan % 3600e3) / 60e3);
    const est = ped.estado || 0;
    const HITOS = ["Separado", "Confirmado por la tienda", "Pagado", "Listo para recoger", "Entregado"];
    return `<div class="ancho angosto"><div class="pagina-cab" style="display:block;text-align:center">
      <span class="ceja">Pedido ${esc(ped.num)}</span><h1 class="h1">${est === 0 ? "¡Listo, lo separaste!" : HITOS[est]}</h1>
      <p class="bajada" style="margin-inline:auto">${est === 0 ? `Ahora mándalo por WhatsApp a CAYLA ${esc(s.n)} para que te lo confirmen. No pagas nada todavía.` : est === 1 ? `CAYLA ${esc(s.n)} lo guardó para ti. Tienes 48 horas para pagarlo: coordínalo por WhatsApp.` : est === 2 ? `Recibimos tu pago. Te avisan por WhatsApp cuando esté listo.` : est === 3 ? `Muestra tu código en caja. Recoge hasta 7 días después de pagar.` : "Gracias por tu compra. Tienes 15 días para cambiarlo en cualquier tienda CAYLA, con tu boleta y la etiqueta puesta."}</p></div>
      ${est === 0 ? `<div class="aviso atencion" style="margin-bottom:16px">${ic("reloj")}<span><b>Sin confirmar, se cierra en ${hh} h ${String(mm).padStart(2, "0")} min.</b> Si la tienda no lo confirma en 24 horas, el pedido se cierra solo y puedes volver a separarlo.</span></div>
      <button class="btn btn-primario btn-ancho" data-a="wsp" data-k="${ped.sede}" data-num="${ped.num}">${ic("wsp")} Enviar por WhatsApp</button>` : ""}
      ${est === 3 ? `<div class="vacio" style="border-style:solid;background:var(--blanco)"><span class="texto-chico">Tu código de recojo</span><b style="font:400 56px/1 var(--serif);letter-spacing:.12em">${ped.codigo}</b><span class="demo">Demostración</span></div>` : ""}
      <ol class="pasos-separar" style="margin:32px 0">${HITOS.map((h, i) => `<li style="${i > est ? "opacity:.5" : ""}"><span><b style="color:var(--cacao)">${h}</b>${i === est ? " · ahora" : i < est ? " ✓" : ""}</span></li>`).join("")}</ol>
      <div class="resumen"><ul>${ped.lineas.map(l => { const p = porId.get(l.id); return p ? `<li><img src="${FOTO(p.fotos[0], 160)}" alt=""><span><b>${esc(p.n)}</b><br><span class="texto-chico">${[l.color, l.talla && `Talla ${l.talla}`, `${l.cant} ${l.cant === 1 ? "unidad" : "unidades"}`].filter(Boolean).map(esc).join(" · ")}</span></span><span class="num">${sol(p.p * l.cant)}</span></li>` : ""; }).join("")}</ul><div class="resumen-total"><span>Total a pagar en tienda</span><b class="num">${sol(ped.total)}</b></div></div>
      <div class="fila" style="justify-content:center;margin-top:24px"><span class="demo">Demostración</span><button class="btn btn-secundario btn-chico" data-a="avanzar" data-num="${ped.num}" ${est >= 4 ? "disabled" : ""}>Simular siguiente estado</button><a class="btn btn-secundario btn-chico" href="#/cuenta">Mis pedidos</a></div>
    </div><div class="seccion"></div>`;
  };

  // Cuenta: campos
  function campo(nombre, etiqueta, tipo, valor, error, ayuda, extra = "") {
    return `<div class="campo"><label for="c-${nombre}">${etiqueta}</label><div class="caja ${error ? "error" : ""}"><input id="c-${nombre}" name="${nombre}" type="${tipo}" value="${esc(valor || "")}" ${error ? 'aria-invalid="true"' : ""} aria-describedby="p-${nombre}" ${extra}></div>
      ${error ? `<span class="pie-campo error" id="p-${nombre}" role="alert">${ic("alerta")} ${error}</span>` : ayuda ? `<span class="pie-campo" id="p-${nombre}">${ayuda}</span>` : ""}</div>`;
  }
  const campoClave = (nombre, etiqueta, error, ayuda, auto = "current-password") => `<div class="campo"><label for="c-${nombre}">${etiqueta}</label><div class="caja ${error ? "error" : ""}"><input id="c-${nombre}" name="${nombre}" type="${T.clave ? "text" : "password"}" autocomplete="${auto}" ${error ? 'aria-invalid="true"' : ""} aria-describedby="p-${nombre}"><button type="button" class="btn-icono" data-a="verClave" aria-label="${T.clave ? "Ocultar" : "Mostrar"} contraseña" aria-pressed="${T.clave}">${ic(T.clave ? "ojoNo" : "ojo")}</button></div>
    ${error ? `<span class="pie-campo error" id="p-${nombre}" role="alert">${ic("alerta")} ${error}</span>` : ayuda ? `<span class="pie-campo" id="p-${nombre}">${ayuda}</span>` : ""}</div>`;
  const panelClub = (titulo = "Separa hoy, recoge en tu tienda.") => `<aside class="acceso-club"><div><span class="ceja">Club CAYLA</span><h2 class="h2">${titulo}</h2></div>
    <ul><li>${ic("ticket")}<span>Separas sin pagar en la web y pagas en tu tienda.</span></li><li>${ic("estrella")}<span>Puntos en cada compra, que cambias por cupones.</span></li><li>${ic("regalo")}<span>En tu cumpleaños, puntos de regalo.</span></li></ul>
    ${tarjetaClub("Tu nombre aquí")}</aside>`;
  const demoNota = txt => `<div class="aviso atencion" style="font-size:13px">${ic("info")}<span><span class="demo">Demostración</span> ${txt}</span></div>`;
  P.entrar = (r, motivo) => {
    if (S.sesion && !motivo) { setTimeout(() => ir("/cuenta")); return ""; }
    const e = T.err;
    return `<section class="acceso"><div class="acceso-marco">
      <div class="acceso-form">
        <div><h1 class="h1">Entrar</h1><p class="bajada">${motivo || "Con tu cuenta separas, guardas favoritos y ves tus pedidos."}</p></div>
        ${e.general ? `<div class="aviso error" role="alert">${ic("alerta")}<span>${e.general}</span></div>` : ""}
        <form class="ficha-bloque" data-f="entrar" novalidate style="gap:16px">
          ${campo("correo", "Correo", "email", T.correo || "", e.correo, "", 'autocomplete="email" inputmode="email"')}
          ${campoClave("clave", 'Contraseña <a class="enlace-texto" style="font-weight:400" href="#/olvide">Olvidé mi contraseña</a>', e.clave)}
          <button class="btn btn-primario btn-ancho" ${T.cargando === "entrar" ? 'aria-busy="true"' : ""}>${T.cargando === "entrar" ? "Entrando…" : "Entrar"}</button>
        </form>
        <div class="separador">o</div>
        <button class="btn btn-google btn-ancho" data-a="google">${GOOGLE} Continuar con Google</button>
        <p class="acceso-pie">¿Primera vez en CAYLA? <a class="enlace-texto" href="#/crear-cuenta"><b>Crea tu cuenta</b></a></p>
        ${demoNota("Entra con cualquier correo y la contraseña <b>cayla2026</b>. Otra contraseña muestra el error real de la tienda.")}
      </div>
      ${panelClub()}
    </div></section>`;
  };
  P.crearCuenta = () => {
    if (S.sesion) { setTimeout(() => ir("/cuenta")); return ""; }
    const R = S.registro, e = T.err;
    const confirmado = R.confirmado;
    return `<section class="acceso"><div class="acceso-marco">
      <div class="acceso-form">
        <div><h1 class="h1">Crea tu cuenta</h1><p class="bajada">En un minuto. Solo te pedimos lo necesario.</p></div>
        <button class="btn btn-google btn-ancho" data-a="google">${GOOGLE} Continuar con Google</button>
        <div class="separador">o con tu correo</div>
        <form class="ficha-bloque" data-f="registro" novalidate style="gap:16px">
          <div class="campo"><label for="c-correo">Correo ${confirmado ? `<small style="color:var(--verde)">✓ Confirmado</small>` : ""}</label>
            <div class="caja ${e.correo ? "error" : confirmado ? "bien" : ""}"><input id="c-correo" name="correo" type="email" autocomplete="email" value="${esc(R.correo || "")}" ${confirmado ? "readonly" : ""} aria-describedby="p-correo">${confirmado ? `<button type="button" class="btn btn-chico" style="background:none" data-a="cambiarCorreo">Cambiar</button>` : `<button type="button" class="btn btn-secundario btn-chico" style="margin-right:6px" data-a="codigo" ${T.cargando === "codigo" ? 'aria-busy="true"' : ""}>${R.enviado ? "Reenviar" : "Obtener código"}</button>`}</div>
            ${e.correo ? `<span class="pie-campo error" id="p-correo" role="alert">${ic("alerta")} ${e.correo}</span>` : `<span class="pie-campo" id="p-correo">${confirmado ? "Listo: ese correo es tuyo." : R.enviado ? `Te mandamos un código de 6 números a ${esc(R.correo)}. Vence en 30 minutos.` : "Toca «Obtener código»: te llega un código de 6 números a este correo."}</span>`}</div>
          ${R.enviado && !confirmado ? `<div class="campo"><label>Código de 6 números</label><div class="codigo" data-codigo>${[0, 1, 2, 3, 4, 5].map(i => `<input inputmode="numeric" aria-label="Número ${i + 1} de 6" data-i="${i}" autocomplete="${i === 0 ? "one-time-code" : "off"}">`).join("")}</div>${e.codigo ? `<span class="pie-campo error" role="alert">${ic("alerta")} ${e.codigo}</span>` : '<span class="pie-campo">Se revisa solo al escribir el sexto número.</span>'}</div>${demoNota("El código que funciona es <b>246810</b>. Otro muestra «Ese código no es».")}` : ""}
          ${confirmado ? `${campo("nombre", "Tu nombre", "text", R.nombre || "", e.nombre, "Como quieres que te llamemos", 'autocomplete="given-name"')}
            ${campoClave("clave", "Crea tu contraseña", e.clave, "8 caracteres o más", "new-password")}
            <label class="casilla"><input type="checkbox" name="mayor"><span>Soy mayor de 18 años</span></label>${e.mayor ? `<span class="campo"><span class="pie-campo error">${ic("alerta")} ${e.mayor}</span></span>` : ""}
            <label class="casilla"><input type="checkbox" name="wsp"><span>Avisos del Club por WhatsApp <span class="texto-chico">(opcional)</span></span></label>
            <button class="btn btn-primario btn-ancho" ${T.cargando === "registro" ? 'aria-busy="true"' : ""}>Crear mi cuenta</button>` : ""}
        </form>
        <p class="acceso-pie">¿Ya tienes cuenta? <a class="enlace-texto" href="#/entrar"><b>Entrar</b></a></p>
      </div>
      ${panelClub("Tu cuenta es tu invitación al Club.")}
    </div></section>`;
  };
  P.olvide = () => {
    const e = T.err;
    return `<section class="acceso"><div class="acceso-marco" style="grid-template-columns:1fr;max-width:520px">
      <div class="acceso-form">${T.enlaceEnviado ? `<div style="display:grid;gap:16px;text-align:center;justify-items:center">${ic("check")}<h1 class="h1">Revisa tu correo</h1><p class="bajada">Si <b>${esc(T.correo)}</b> tiene una cuenta, te llega un enlace para crear una contraseña nueva. Vence en 30 minutos.</p><a class="btn btn-secundario" href="#/nueva-contrasena">${ic("flecha")} Simular abrir el enlace</a><a class="enlace-texto texto-chico" href="#/entrar">Volver a entrar</a></div>` :
      `<div><h1 class="h1">Olvidé mi contraseña</h1><p class="bajada">Escribe tu correo y te mandamos un enlace para crear una nueva.</p></div>
      <form class="ficha-bloque" data-f="olvide" novalidate style="gap:16px">${campo("correo", "Correo", "email", T.correo || "", e.correo, "", 'autocomplete="email"')}<button class="btn btn-primario btn-ancho" ${T.cargando === "olvide" ? 'aria-busy="true"' : ""}>Enviar el enlace</button></form>
      <a class="enlace-texto texto-chico" href="#/entrar" style="justify-self:center">Volver a entrar</a>`}</div></div></section>`;
  };
  P.nuevaContrasena = () => {
    const e = T.err;
    return `<section class="acceso"><div class="acceso-marco" style="grid-template-columns:1fr;max-width:520px"><div class="acceso-form">
      ${T.claveLista ? `<div style="display:grid;gap:16px;text-align:center;justify-items:center">${ic("check")}<h1 class="h1">Contraseña lista</h1><p class="bajada">Ya puedes entrar con tu contraseña nueva.</p><a class="btn btn-primario" href="#/entrar">Entrar</a></div>` :
      `<div><h1 class="h1">Crea una contraseña nueva</h1><p class="bajada">8 caracteres o más. Evita la de otras cuentas.</p></div>
      <form class="ficha-bloque" data-f="nueva" novalidate style="gap:16px">${campoClave("clave", "Contraseña nueva", e.clave, "8 caracteres o más", "new-password")}${campoClave("clave2", "Repítela", e.clave2, "", "new-password")}<button class="btn btn-primario btn-ancho">Guardar contraseña</button></form>
      <div class="aviso" style="font-size:13px">${ic("info")}<span>Si el enlace venció o ya se usó, <a class="enlace-texto" href="#/olvide">pide otro</a>.</span></div>`}
    </div></div></section>`;
  };
  P.cuenta = () => {
    if (!S.sesion) { S.volver = "/cuenta"; guardar(); setTimeout(() => ir("/entrar")); return ""; }
    const ini = (S.sesion.nombre || "?").slice(0, 1).toUpperCase();
    return `<div class="ancho"><div class="cuenta-cab"><span class="avatar">${ini}</span><div style="flex:1"><span class="ceja">Mi perfil</span><h1 class="h1">Hola, ${esc(S.sesion.nombre)}</h1><p class="texto-chico" style="margin:4px 0 0">${esc(S.sesion.correo)}</p></div><button class="btn btn-secundario btn-chico" data-a="salir">${ic("salir")} Salir</button></div>
      <div class="tarjetas-cuenta">
        <a class="tarjeta-cuenta" href="#/club">${ic("estrella")}<b>${S.club ? "Eres del Club" : "Club CAYLA"}</b><span>${S.club ? "Mira tus puntos y canjéalos por cupones." : "Entras al completar tu documento y tu celular."}</span></a>
        <a class="tarjeta-cuenta" href="#/catalogo?lista=favoritos">${ic("corazon")}<b>Favoritos</b><span>${S.favs.length} ${S.favs.length === 1 ? "prenda guardada" : "prendas guardadas"}</span></a>
        <a class="tarjeta-cuenta" href="#/bolsa">${ic("bolsa")}<b>Tu bolsa</b><span>${enBolsa()} ${enBolsa() === 1 ? "prenda" : "prendas"}</span></a>
      </div>
      <section class="seccion">${secCab("Mis pedidos", "", "")}${S.pedidos.length ? `<div class="resumen"><ul>${S.pedidos.map(x => `<li style="grid-template-columns:1fr auto auto"><span><a href="#/separado/${x.num}"><b>Pedido ${esc(x.num)}</b></a><br><span class="texto-chico">CAYLA ${esc(SEDES.find(s => s.k === x.sede).n)} · ${x.lineas.length} ${x.lineas.length === 1 ? "prenda" : "prendas"}</span></span><span class="pildora">${["Por confirmar", "Confirmado", "Pagado", "Listo para recoger", "Entregado"][x.estado || 0]}</span><b class="num">${sol(x.total)}</b></li>`).join("")}</ul></div>` : vacio("doc", "Todavía no tienes pedidos", "Cuando separes, tu pedido aparece aquí con su estado.", '<a class="btn btn-primario" href="#/catalogo">Ver la tienda</a>')}</section>
    </div><div class="seccion"></div>`;
  };
  P.club = r => {
    const vista = r.q.get("estado") || (S.club ? "miembro" : S.sesion ? "cuenta" : "visitante");
    const demoPuntos = 340;
    return `<section class="ancho" style="padding-top:24px">${bloqueClub()}</section>
    <div class="ancho">
      <section class="seccion">${secCab("Cómo funciona", "", "", "Club CAYLA")}
        <ol class="pasos"><li><b>Crea tu cuenta</b><p>Con tu correo y tu nombre, o con Google.</p></li><li><b>Completa documento y celular</b><p>Al separar por primera vez, o antes desde Mi perfil. Ahí entras al Club.</p></li><li><b>Suma 1 punto por cada S/ 1</b><p>Lo que pagas en la web o en la tienda, a tu nombre. En tu mes de cumpleaños, tu primera compra suma 100 más.</p></li><li><b>Canjéalos desde 200</b><p>100 puntos valen S/ 5. Recibes un cupón que vale 7 días.</p></li></ol></section>
      <section class="seccion"><div class="sec-cab"><div><span class="ceja">Así se ve tu Club</span><h2 class="h2">Tu tarjeta y tus puntos</h2></div>
        <div class="pestanas" role="tablist" aria-label="Estado de membresía">${[["visitante", "Sin cuenta"], ["cuenta", "Con cuenta"], ["miembro", "Miembro"]].map(([k, n]) => `<a role="tab" href="${conQ("/club", r.q, { estado: k })}" aria-selected="${vista === k}" style="display:inline-flex;align-items:center;min-height:44px;padding:0 16px;font-weight:600;font-size:14px;border-bottom:2px solid ${vista === k ? "var(--acento)" : "transparent"};color:${vista === k ? "var(--cacao)" : "var(--cacao-2)"}">${n}</a>`).join("")}</div></div>
        <div class="grid-2" style="align-items:center;gap:48px">
          <div style="display:grid;place-items:center;padding:24px;background:var(--arena);border-radius:var(--r-l)">${tarjetaClub(vista === "miembro" ? S.sesion?.nombre || "María" : "Tu nombre aquí", vista === "miembro" ? `<b class="num">${demoPuntos}</b>` : "")}</div>
          <div style="display:grid;gap:16px">
            ${vista === "visitante" ? `<h3 class="h3">Aún no eres del Club</h3><p class="bajada" style="margin:0">Crea tu cuenta para separar. Al completar tu documento y tu celular, entras al Club.</p><div class="fila"><a class="btn btn-primario" href="#/crear-cuenta">Crear mi cuenta</a><a class="btn btn-secundario" href="#/entrar">Ya tengo cuenta</a></div>`
            : vista === "cuenta" ? `<h3 class="h3">Tienes cuenta, te falta un paso</h3><p class="bajada" style="margin:0">Completa tu documento y tu celular para entrar al Club. Se hace solo una vez.</p><div class="fila"><a class="btn btn-primario" href="#/datos">Completar mis datos</a></div>`
            : `<div class="fila"><h3 class="h3">${demoPuntos} puntos</h3><span class="demo">Saldo de demostración</span></div>
              <div style="height:8px;background:var(--arena-2);border-radius:4px"><div style="height:100%;width:${(demoPuntos % 100)}%;background:var(--vino);border-radius:4px"></div></div>
              <p class="texto-chico" style="margin:0">Con ${demoPuntos} puntos puedes canjear hasta ${Math.floor(demoPuntos / 100) * 100} (S/ ${Math.floor(demoPuntos / 100) * 5}). Te faltan ${100 - (demoPuntos % 100)} para los siguientes S/ 5.</p>
              <button class="btn btn-primario" data-a="canjear" style="justify-self:start">Canjear 200 puntos por S/ 10</button>
              <p class="texto-chico" style="margin:0">Reglas de los Términos del Club: 1 punto por cada S/ 1 que pagas · 100 puntos valen S/ 5 · se canjea desde 200, de 100 en 100 · el cupón vale 7 días, en compras desde 3 veces su valor.</p>`}
          </div></div></section>
      <section class="seccion ultima">${secCab("Lo que tienes que saber", "#/terminos", "Términos del Club")}
        <div class="faq">${[["¿Cuándo entro al Club?", "Al completar tu documento y tu celular: la primera vez que separas, o antes desde Mi perfil."], ["¿Los puntos vencen?", "Mira el punto 8 de los Términos del Club («Cuánto duran tus puntos y tus datos»). Hoy dos pantallas lo dicen distinto: está anotado en la auditoría."], ["¿Cómo uso un cupón?", "Al pagar, en la web o en caja. Vale 7 días, una sola vez, en compras desde 3 veces su valor, y no se junta con otro cupón."]].map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</div></section>
    </div>`;
  };

  // Tiendas y ayuda
  P.tiendas = () => `${migas([["Inicio", "#/"], ["Nuestras tiendas"]])}<div class="ancho"><div class="pagina-cab"><div><span class="ceja">Trujillo · Arequipa · Lima</span><h1 class="h1">Nuestras tiendas</h1><p class="bajada">Separa en la web y recoge en la que elijas. Cada tienda maneja su propio stock.</p></div></div>${tarjetasTiendas()}</div><div class="seccion"></div>`;
  P.tienda = r => {
    const s = SEDES.find(x => x.k === r.partes[1]);
    if (!s) return P.noExiste();
    const e = estadoTienda(s.k);
    const hay = PRENDAS.filter(p => hayEn(p, s.k));
    return `${migas([["Inicio", "#/"], ["Nuestras tiendas", "#/tiendas"], [s.n]])}<div class="ancho">
      <div class="ficha" style="grid-template-columns:1fr 1fr"><div class="tienda-foto" style="border-radius:var(--r-l);aspect-ratio:4/3"><img src="${ESCUDO(s.k)}" alt="" style="width:120px;height:120px"><span class="marca-demo">Foto de la tienda: pendiente, no se usa una inventada</span></div>
      <div class="ficha-info"><div><span class="ceja">CAYLA</span><h1 class="h1">${esc(s.n)}</h1><span class="estado ${e.abierta ? "" : "cerrada"}" style="margin-top:8px">${e.texto}</span></div>
        <div class="tienda-dato">${ic("ubic")}<span><b style="color:var(--cacao)">Dirección</b><br>${esc(s.dir)}</span></div>
        <div class="tienda-dato">${ic("reloj")}<span><b style="color:var(--cacao)">Horario</b><br>${esc(s.hor)}</span></div>
        <div class="tienda-dato">${ic("telefono")}<span><b style="color:var(--cacao)">WhatsApp</b><br>+51 ${esc(s.wa)}</span></div>
        <div class="fila"><button class="btn btn-primario" data-a="wsp" data-k="${s.k}">${ic("wsp")} Escribir por WhatsApp</button><button class="btn btn-secundario" data-a="mapa" data-k="${s.k}">${ic("ubic")} Cómo llegar</button></div>
        ${S.sede === s.k ? `<p class="texto-chico">${ic("check")} Estás viendo lo que hay en ${esc(s.n)}.</p>` : `<button class="enlace" data-a="elegirSede" data-k="${s.k}" style="justify-self:start;background:none;border-width:0 0 1px">Ver lo que hay en ${esc(s.n)} ${ic("flecha")}</button>`}</div></div>
      <section class="seccion">${secCab(`Lo que hay en ${esc(s.n)}`, "#/catalogo?hay=1", `Ver las ${hay.length}`)}${rejilla(hay.slice(0, 4))}</section></div><div class="seccion"></div>`;
  };
  const ayudaCab = (ceja, titulo, bajada) => `<div class="ancho"><div class="pagina-cab"><div><span class="ceja">${ceja}</span><h1 class="h1">${titulo}</h1><p class="bajada">${bajada}</p></div></div></div>`;
  P.comoSeparar = () => `${migas([["Inicio", "#/"], ["Cómo separar"]])}${ayudaCab("Ayuda", "Separa online, recoge en tu tienda", "En la web no pagas nada: separas tus prendas, la tienda te lo confirma por WhatsApp y lo recoges en la tienda que elijas.")}
    <div class="ancho">${pasosSeparar()}
      <section class="seccion">${secCab("Los plazos de tu pedido", "", "", "Lo que tienes que saber")}
        <div class="tarjetas-cuenta">
          <div class="tarjeta-cuenta">${ic("reloj")}<b>24 horas para confirmar</b><span>La tienda tiene 24 horas para confirmarlo. Si no lo confirma, el pedido se cierra solo y puedes volver a separarlo.</span></div>
          <div class="tarjeta-cuenta">${ic("ticket")}<b>48 horas para pagar</b><span>Desde que la tienda confirma tu pedido. Si no llega ningún pago, se anula solo y las prendas vuelven a la tienda.</span></div>
          <div class="tarjeta-cuenta">${ic("tienda")}<b>7 días para recoger</b><span>Todavía no hacemos envíos. Lo recoges en tu tienda, hasta 7 días después de pagar.</span></div>
        </div></section>
      <section class="seccion ultima"><div class="club" style="grid-template-columns:1fr auto"><div><span class="ceja">Club CAYLA</span><h2 class="h2" style="color:#fff">Crea tu cuenta cuando quieras separar algo.</h2><p style="margin:8px 0 0;opacity:.9">El catálogo es de todos. Entras al Club al completar tu documento y tu celular.</p></div><div class="club-acciones"><a class="btn btn-claro" href="#/crear-cuenta">Crear mi cuenta</a><a class="btn btn-sobre-rojo" href="#/entrar">Entrar</a></div></div></section>
    </div>`;
  P.cambios = () => `${migas([["Inicio", "#/"], ["Cambios y devoluciones"]])}${ayudaCab("Ayuda", "Cambios y devoluciones", "Lo que separas en la web se cambia o se devuelve igual que lo que compras en tienda.")}
    <div class="ancho"><div class="tarjetas-cuenta"><div class="tarjeta-cuenta">${ic("reloj")}<b>Tienes 15 días</b><span>Para cambiar o devolver tu prenda, igual que en tienda.</span></div><div class="tarjeta-cuenta">${ic("tienda")}<b>En cualquier tienda CAYLA</b><span>La que te quede más cerca, aunque no sea donde la recogiste.</span></div><div class="tarjeta-cuenta">${ic("doc")}<b>Lleva tu boleta</b><span>Y la prenda con su etiqueta puesta.</span></div></div>
    <section class="seccion ultima">${secCab("Cambia en la que te quede cerca", "#/tiendas", "Ver tiendas")}${tarjetasTiendas()}</section></div>`;
  P.ayuda = () => `${migas([["Inicio", "#/"], ["Preguntas frecuentes"]])}${ayudaCab("Ayuda", "Preguntas frecuentes", "Respuestas con los mismos plazos y reglas que usa la tienda.")}
    <div class="ancho"><div class="faq" style="max-width:760px">${[
      ["¿Pago algo en la web?", "No. En la web separas. La tienda te confirma por WhatsApp y coordinas el pago con ella: Yape, Plin, transferencia o en tienda."],
      ["¿Cuánto tiempo se guarda lo que separo?", "La tienda tiene 24 horas para confirmarlo. Desde que lo confirma, tienes 48 horas para pagar. Después de pagar, tienes hasta 7 días para recogerlo."],
      ["¿Hacen envíos?", "Todavía no. Todo se recoge en la tienda que elegiste."],
      ["¿Puedo separar prendas de dos tiendas?", "Cada pedido es de una tienda, y cada tienda maneja su propio stock. En cada prenda ves cuánto hay en Arequipa, Lima y Trujillo."],
      ["¿Cómo recojo?", "Con el código de tu pedido: lo muestras en caja."],
      ["¿Puedo cambiar una prenda?", "Sí, en 15 días y en cualquier tienda CAYLA, con tu boleta y la etiqueta puesta."],
      ["¿Necesito cuenta para ver precios?", "No. El catálogo, los precios y cuánto hay en cada tienda se ven sin cuenta. La cuenta se pide al separar o al guardar favoritos."],
    ].map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</div>
    <div class="aviso" style="margin-top:32px;max-width:760px">${ic("info")}<span>La tienda real no tiene hoy una página de preguntas frecuentes: esta se arma solo con textos que ya existen en «Cómo separar», «Cambios» y la bolsa. <span class="demo">Propuesta</span></span></div></div><div class="seccion"></div>`;
  const legal = (titulo, secciones, nota) => `${migas([["Inicio", "#/"], [titulo]])}${ayudaCab("Legal", titulo, nota)}<div class="ancho doc"><nav class="doc-indice" aria-label="Índice">${secciones.map((s, i) => `<a href="#/${location.hash.split("/")[1].split("?")[0]}" data-a="irSeccion" data-s="s${i}">${esc(s[0])}</a>`).join("")}</nav><div class="prosa">${secciones.map((s, i) => `<h2 id="s${i}">${esc(s[0])}</h2>${s[1].split("\n").filter(Boolean).map(x => `<p>${esc(x)}</p>`).join("")}`).join("")}</div></div>`;
  P.terminos = () => legal("Términos del Club", D.legal?.terminos || [["Texto vigente", "El texto legal no se rediseña: la maqueta muestra solo cómo se compone (índice a la izquierda, lectura de 680 px)."]], "La maqueta conserva el texto vigente. No cambia derechos ni condiciones.");
  P.privacidad = () => legal("Privacidad", D.legal?.privacidad || [["Texto vigente", "El texto legal no se rediseña: la maqueta muestra solo cómo se compone (índice a la izquierda, lectura de 680 px)."]], "Cómo cuidamos tus datos. La maqueta conserva el texto vigente.");
  P.noExiste = (txt = "Esta página no está.") => `<div class="ancho error-pagina"><span class="cifra" aria-hidden="true">404</span><h1 class="h1">${esc(txt)}</h1><p>Puede que el enlace sea viejo o que la prenda ya no esté. Sigue por aquí:</p><div class="fila" style="justify-content:center"><a class="btn btn-primario" href="#/catalogo?lista=nuevo">Ver lo nuevo</a><a class="btn btn-secundario" href="#/">Ir al inicio</a></div></div>`;
  P.error = () => `<div class="ancho error-pagina"><span class="cifra" aria-hidden="true">${ic("alerta", "")}</span><h1 class="h1">No pudimos mostrar esta página.</h1><p>Es un problema de conexión de nuestro lado, no de tu equipo. Tu bolsa sigue guardada.</p><div class="fila" style="justify-content:center"><button class="btn btn-primario" data-a="reintentar">Intentar de nuevo</button><a class="btn btn-secundario" href="#/">Ir al inicio</a></div></div>`;
  P.cargando = () => `<div class="ancho"><div class="pagina-cab"><div style="width:100%"><div class="esqueleto" style="height:14px;width:120px;margin-bottom:16px"></div><div class="esqueleto" style="height:44px;width:min(380px,80%)"></div></div></div><div class="rejilla">${Array.from({ length: 8 }, () => `<div><div class="esqueleto" style="aspect-ratio:3/4"></div><div class="esqueleto" style="height:14px;width:70%;margin-top:12px"></div><div class="esqueleto" style="height:14px;width:40%;margin-top:8px"></div></div>`).join("")}</div></div>`;

  // ——— Capas: menú, filtros, sede, modales, avisos ———
  const capas = $("#capas");
  function cerrarCapas() { capas.innerHTML = ""; document.body.style.overflow = ""; T.capa = null; if (T.foco) { T.foco.focus?.(); T.foco = null; } }
  function abrir(html, cual) {
    T.foco = document.activeElement;
    capas.innerHTML = `<div class="velo" data-a="cerrar"></div>${html}`;
    document.body.style.overflow = "hidden";
    T.capa = cual;
    requestAnimationFrame(() => capas.querySelector("[autofocus], .cajon button, .modal button, .modal a")?.focus());
  }
  const modal = (titulo, cuerpo, etiqueta = titulo) => `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(etiqueta)}"><button class="btn-icono modal-cerrar" data-a="cerrar" aria-label="Cerrar">${ic("cerrar")}</button><h2 class="h2" style="font-size:28px;padding-right:40px">${titulo}</h2>${cuerpo}</div>`;
  function cajonMenu() {
    const grupo = (m, nombre) => `<div class="menu-grupo"><button data-a="abrirGrupo" data-m="${m}" aria-expanded="${T.grupo === m}">${nombre} ${ic("chev")}</button>${T.grupo === m ? `<ul>${D.grupos.filter(g => g.menu === m).flatMap(g => D.categorias.filter(c => c.g === g.clave)).map(c => `<li><a href="#/catalogo?categoria=${c.pre}" data-a="cerrar">${esc(c.n)}</a></li>`).join("")}</ul>` : ""}</div>`;
    abrir(`<nav class="cajon izq" role="dialog" aria-modal="true" aria-label="Menú"><div class="cajon-cab"><span class="logo" style="color:var(--rojo)">${LOGO}</span><button class="btn-icono" data-a="cerrar" aria-label="Cerrar menú">${ic("cerrar")}</button></div>
      <div class="cajon-cuerpo">
        <a class="menu-simple" href="#/catalogo?lista=nuevo" data-a="cerrar">Lo nuevo</a>${grupo("ropa", "Ropa")}${grupo("accesorios", "Accesorios")}
        <a class="menu-simple" href="#/looks" data-a="cerrar">Outfits listos</a><a class="menu-simple" href="#/arma" data-a="cerrar">Arma tu outfit</a><a class="menu-simple" href="#/ofertas" data-a="cerrar" style="color:var(--acento)">Ofertas</a><a class="menu-simple" href="#/club" data-a="cerrar">Club CAYLA</a>
        <div style="display:grid;gap:4px;margin-top:24px;font-size:14.5px"><a href="#/tiendas" data-a="cerrar" style="padding:8px 0">Nuestras tiendas</a><a href="#/como-separar" data-a="cerrar" style="padding:8px 0">Cómo separar</a><a href="#/cambios" data-a="cerrar" style="padding:8px 0">Cambios y devoluciones</a></div>
      </div>
      <div class="cajon-pie"><button class="sede-op" data-a="sede"><img src="${ESCUDO(S.sede)}" alt=""><span><b>Tu tienda: ${esc(sede().n)}</b><small>${esc(estadoTienda(S.sede).texto)}</small></span><span class="texto-chico">Cambiar</span></button><a class="btn btn-secundario btn-ancho" href="${S.sesion ? "#/cuenta" : "#/entrar"}" data-a="cerrar">${ic("usuario")} ${S.sesion ? "Mi perfil" : "Entrar o crear cuenta"}</a></div></nav>`, "menu");
  }
  function cajonFiltros() {
    const r = ruta(); const { base, ps } = filtrar(r.q);
    abrir(`<div class="cajon der" role="dialog" aria-modal="true" aria-label="Filtros"><div class="cajon-cab"><h2>Filtros</h2><button class="btn-icono" data-a="cerrar" aria-label="Cerrar filtros">${ic("cerrar")}</button></div>
      <div class="cajon-cuerpo">${opcionesFiltro(base, r.q, r)}</div>
      <div class="cajon-pie"><button class="btn btn-primario btn-ancho" data-a="cerrar">Ver ${ps.length} prendas</button><a class="btn btn-secundario btn-ancho" href="${conQ(r.path, r.q, { talla: null, color: null, hay: null })}">Limpiar</a></div></div>`, "filtros");
  }
  function modalSede() {
    abrir(modal("Elige tu tienda", `<p class="bajada" style="margin-top:8px">Ves los precios y lo que hay en esa tienda, y ahí recoges lo que separas.</p>
      <div class="lista-sedes" role="radiogroup" aria-label="Tienda">${SEDES.map(s => { const e = estadoTienda(s.k); return `<button class="sede-op" role="radio" aria-checked="${s.k === S.sede}" data-a="elegirSede" data-k="${s.k}"><img src="${ESCUDO(s.k)}" alt=""><span><b>${esc(s.n)}</b><small>${esc(s.dir)}</small><small class="estado ${e.abierta ? "" : "cerrada"}" style="font-size:12px">${e.texto}</small></span>${s.k === S.sede ? ic("check") : ""}</button>`; }).join("")}</div>
      ${S.bolsa.length ? `<div class="aviso atencion" style="margin-top:16px">${ic("info")}<span>Tu bolsa es de ${esc(sede().n)}. Si cambias de tienda, revisamos qué hay allá: lo que no esté queda marcado para que lo quites.</span></div>` : ""}`), "sede");
  }
  function toast(html, tipo = "") { const t = document.createElement("div"); t.className = `toast ${tipo}`; t.setAttribute("role", "status"); t.innerHTML = html; document.querySelectorAll(".toast").forEach(x => x.remove()); document.body.append(t); clearTimeout(T.toastT); T.toastT = setTimeout(() => t.remove(), 4500); }

  // ——— Acciones ———
  const espera = (ms, clave) => new Promise(res => { T.cargando = clave; render(false); setTimeout(() => { T.cargando = null; res(); }, ms); });
  function agregar(id, talla, color, cant = 1) {
    if (enBolsa() + cant > 20) { toast(`${ic("alerta")} Llegaste al máximo de 20 prendas por pedido.`, "error"); return false; }
    const ya = S.bolsa.find(l => l.id === id && l.talla === talla && l.color === color);
    if (ya) { if (ya.cant >= 2) { toast(`${ic("alerta")} Máximo 2 de cada prenda por pedido.`, "error"); return false; } ya.cant++; } else S.bolsa.push({ id, talla, color, cant });
    guardar(); return true;
  }
  const ACC = {
    cerrar: () => cerrarCapas(),
    menu: () => cajonMenu(),
    abrirGrupo: t => { T.grupo = T.grupo === t.dataset.m ? null : t.dataset.m; cajonMenu(); },
    mega: t => { T.mega = T.mega === t.dataset.m ? null : t.dataset.m; render(false); },
    filtros: () => cajonFiltros(),
    sede: () => modalSede(),
    elegirSede: t => { S.sede = t.dataset.k; guardar(); cerrarCapas(); T.arma = null; toast(`${ic("check")} Ahora ves lo que hay en ${esc(sede().n)}.`); render(false); },
    portada: t => { T.portada = Number(t.dataset.i); render(false); },
    carril: t => { const c = $(`#${t.dataset.c}`); c.scrollBy({ left: Number(t.dataset.d) * c.clientWidth * .8, behavior: "smooth" }); },
    camp: t => { T.camp = T.camp === t.dataset.c ? null : t.dataset.c; render(false); },
    fav: t => {
      if (!S.sesion) { S.volver = location.hash.slice(1); guardar(); abrir(modal("Guarda tus favoritos", `<p class="bajada">Entra o crea tu cuenta para guardar prendas y verlas en cualquier aparato.</p><div class="ficha-bloque" style="margin-top:24px"><a class="btn btn-primario btn-ancho" href="#/entrar" data-a="cerrar">Entrar</a><a class="btn btn-secundario btn-ancho" href="#/crear-cuenta" data-a="cerrar">Crear mi cuenta</a></div>`), "fav"); return; }
      const i = S.favs.indexOf(t.dataset.id); i >= 0 ? S.favs.splice(i, 1) : S.favs.push(t.dataset.id); guardar();
      toast(i >= 0 ? "Lo quitaste de tus favoritos." : `${ic("corazon")} Guardado en <a href="#/catalogo?lista=favoritos">tus favoritos</a>`); render(false);
    },
    rapido: t => {
      const p = porId.get(t.dataset.id);
      const libres = p.t.filter(x => !p.tOff.includes(x));
      if (!hayEn(p, S.sede)) { ir(`/prenda/${p.id}`); return; }
      if (libres.length > 1) {
        abrir(modal(esc(p.n), `<p class="bajada">${sol(p.p)} · elige tu talla</p><div class="tallas" style="margin-top:16px">${p.t.map(x => `<button class="opcion" data-a="rapidoTalla" data-id="${p.id}" data-t="${esc(x)}" ${p.tOff.includes(x) ? "disabled" : ""}>${esc(x)}</button>`).join("")}</div><a class="enlace-texto texto-chico" style="display:inline-block;margin-top:16px" href="#/prenda/${p.id}" data-a="cerrar">Ver la prenda completa</a>`, `Agregar ${p.n}`), "rapido");
        return;
      }
      if (agregar(p.id, libres[0] || null, p.co?.[0]?.n || null)) { toast(`<img src="${FOTO(p.fotos[0], 120)}" alt=""><span>Agregaste <b>${esc(p.n)}</b></span><a href="#/bolsa">Ver bolsa</a>`); render(false); }
    },
    rapidoTalla: t => { const p = porId.get(t.dataset.id); cerrarCapas(); if (agregar(p.id, t.dataset.t, p.co?.[0]?.n || null)) { toast(`<img src="${FOTO(p.fotos[0], 120)}" alt=""><span>Agregaste <b>${esc(p.n)}</b> · talla ${esc(t.dataset.t)}</span><a href="#/bolsa">Ver bolsa</a>`); render(false); } },
    foto: t => { T.foto = Number(t.dataset.i); render(false); },
    color: t => { T.color = Number(t.dataset.i); render(false); },
    talla: t => { T.talla = t.dataset.t; T.pideTalla = false; render(false); },
    guiaTallas: () => abrir(modal("Guía de tallas", `<p class="bajada">La tienda todavía no tiene medidas por prenda en el ERP, así que esta maqueta no las inventa.</p><div class="aviso" style="margin-top:16px">${ic("info")}<span><span class="demo">Propuesta</span> Una tabla por categoría (busto, cintura, cadera, largo) cargada en Catálogo, y aquí la de esta prenda.</span></div><p class="texto-chico" style="margin-top:16px">Mientras tanto, la tienda te asesora por WhatsApp.</p>`), "tallas"),
    agregar: async t => {
      const p = porId.get(t.dataset.id);
      if (p.t.length > 1 && !T.talla) { T.pideTalla = true; render(false); $("#bloqueTalla")?.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
      await espera(500, "agregar");
      const colores = (p.coF?.length ? p.coF : p.co) || [];
      if (agregar(p.id, T.talla || p.t[0] || null, colores[T.color]?.n || null)) toast(`<img src="${FOTO(p.fotos[0], 120)}" alt=""><span>Agregaste <b>${esc(p.n)}</b>${T.talla ? ` · talla ${esc(T.talla)}` : ""}</span><a href="#/bolsa">Ver bolsa</a>`);
      render(false);
    },
    avisame: t => { if (!S.sesion) { S.volver = location.hash.slice(1); guardar(); ir("/entrar"); return; } toast(`${ic("campana")} Te avisamos cuando llegue a ${esc(sede().n)}. <span class="demo" style="margin-left:4px">Simulado</span>`); },
    cant: t => { const l = S.bolsa[Number(t.dataset.i)]; l.cant = Math.max(1, Math.min(2, l.cant + Number(t.dataset.d))); guardar(); render(false); },
    quitar: t => { const i = Number(t.dataset.i); const [l] = S.bolsa.splice(i, 1); T.deshacer = { l, i }; guardar(); render(false); toast(`Quitaste <b>${esc(porId.get(l.id)?.n)}</b>. <button class="enlace-texto" style="color:inherit;font-weight:600;margin-left:8px" data-a="deshacer">Deshacer</button>`); },
    deshacer: () => { if (T.deshacer) { S.bolsa.splice(T.deshacer.i, 0, T.deshacer.l); T.deshacer = null; guardar(); document.querySelector(".toast")?.remove(); render(false); } },
    separar: async () => {
      if (!S.sesion) { S.volver = "/bolsa"; guardar(); abrir(modal("Entra para separar", `<p class="bajada">Tu bolsa queda guardada. Con tu cuenta, el pedido queda a tu nombre y lo sigues desde Mi perfil.</p><div class="ficha-bloque" style="margin-top:24px"><a class="btn btn-primario btn-ancho" href="#/entrar" data-a="cerrar">Entrar</a><a class="btn btn-secundario btn-ancho" href="#/crear-cuenta" data-a="cerrar">Crear mi cuenta</a></div>`), "separar"); return; }
      if (!S.club) { ir("/datos"); return; }
      await espera(900, "separar"); crearPedido();
    },
    wsp: t => {
      const s = SEDES.find(x => x.k === t.dataset.k), ped = S.pedidos.find(x => x.num === t.dataset.num);
      const msj = ped ? `Hola CAYLA ${s.n}, separé el pedido web ${ped.num}: ${ped.lineas.map(l => `${porId.get(l.id)?.n}${l.talla ? ` (${l.talla})` : ""} x${l.cant}`).join(", ")}. Total: ${sol(ped.total)}. ¿Me confirman la separación?` : `Hola CAYLA ${s.n}, tengo una consulta.`;
      abrir(modal("WhatsApp", `<p class="bajada">Se abriría WhatsApp con CAYLA ${esc(s.n)} (+51 ${esc(s.wa)}) y este mensaje ya escrito:</p><div style="margin-top:16px;padding:16px;border-radius:12px 12px 12px 2px;background:#e4ecdb;font-size:14.5px">${esc(msj)}</div><div class="aviso atencion" style="margin-top:16px">${ic("info")}<span><span class="demo">Simulación</span> En la maqueta no se envía nada ni se abre WhatsApp.</span></div><button class="btn btn-primario btn-ancho" style="margin-top:16px" data-a="cerrar">Entendido</button>`), "wsp");
    },
    mapa: t => { const s = SEDES.find(x => x.k === t.dataset.k); abrir(modal("Cómo llegar", `<p class="bajada">Se abriría Google Maps con: <b>${esc(s.dir)}</b>.</p><div class="aviso" style="margin-top:16px">${ic("info")}<span><span class="demo">Simulación</span> La maqueta no sale de la página.</span></div>`), "mapa"); },
    avanzar: t => { const p = S.pedidos.find(x => x.num === t.dataset.num); p.estado = Math.min(4, (p.estado || 0) + 1); guardar(); render(false); },
    lookBolsa: t => { const l = D.looks[Number(t.dataset.i)]; const ps = l.ps.map(prendaDeLook).filter(Boolean); modalTallasConjunto(ps, `Outfit «${l.n}»`); },
    armaBolsa: () => { const A = T.arma; const ps = (A.vestido ? ["vestido", "bolso"] : ["arriba", "abajo", "bolso"]).map(z => porId.get(A[z])).filter(Boolean); modalTallasConjunto(ps, "Tu outfit"); },
    conjuntoTalla: t => { T.tallasConj[t.dataset.id] = t.dataset.t; modalTallasConjunto(T.conj, T.conjNombre); },
    conjuntoAgregar: () => {
      const falta = T.conj.filter(p => p.t.length > 1 && !T.tallasConj[p.id]);
      if (falta.length) { T.conjFalta = true; modalTallasConjunto(T.conj, T.conjNombre); return; }
      let n = 0; for (const p of T.conj) if (hayEn(p, S.sede) && agregar(p.id, T.tallasConj[p.id] || p.t[0] || null, p.co?.[0]?.n || null)) n++;
      cerrarCapas(); toast(`${ic("check")} Agregaste ${n} ${n === 1 ? "prenda" : "prendas"} a tu bolsa <a href="#/bolsa">Ver bolsa</a>`); render(false);
    },
    zona: t => { T.zona = t.dataset.z; render(false); },
    elegir: t => { const A = T.arma, z = T.zona; if (z === "vestido") { A.vestido = t.dataset.id; } else { A[z] = t.dataset.id; if (z !== "bolso") A.vestido = null; } render(false); },
    pasar: (t, e) => { e.stopPropagation(); const z = t.dataset.z, ops = deZona(z), i = ops.findIndex(p => p.id === T.arma[z]); T.arma[z] = ops[(i + Number(t.dataset.d) + ops.length) % ops.length]?.id || null; T.zona = z; render(false); },
    fijar: (t, e) => { e.stopPropagation(); const z = t.dataset.z; T.arma.fijo[z] = !T.arma.fijo[z]; render(false); },
    quitarZona: (t, e) => { e.stopPropagation(); const z = t.dataset.z; T.arma[z] = null; T.arma.fijo[z] = false; render(false); },
    sorprende: () => {
      const A = T.arma; const zonas = A.vestido ? ["vestido", "bolso"] : ["arriba", "abajo", "bolso"];
      const libres = zonas.filter(z => !A.fijo[z]);
      if (!libres.length) { toast(`${ic("candado")} Todo tiene candado: suelta una prenda para cambiarla.`); return; }
      for (const z of libres) { const ops = deZona(z).filter(p => p.id !== A[z]); if (ops.length) A[z] = ops[Math.floor(Math.random() * ops.length)].id; }
      render(false);
    },
    verClave: () => { const v = document.querySelectorAll('[name="clave"],[name="clave2"]'); const vals = [...v].map(x => x.value); T.clave = !T.clave; render(false); document.querySelectorAll('[name="clave"],[name="clave2"]').forEach((x, i) => { x.value = vals[i] || ""; }); },
    google: () => abrir(modal("Continuar con Google", `<p class="bajada">Aquí se abriría la ventana de Google para elegir tu cuenta.</p><div class="aviso atencion" style="margin-top:16px">${ic("info")}<span><span class="demo">Simulación</span> En la tienda real el botón está listo en el código pero apagado (falta configurar el proveedor). Ninguna cuenta real se usa aquí.</span></div><button class="btn btn-google btn-ancho" style="margin-top:16px" data-a="googleOk">${GOOGLE} María Pérez · maria@ejemplo.pe</button>`), "google"),
    googleOk: () => { cerrarCapas(); iniciar({ nombre: "María", correo: "maria@ejemplo.pe" }); },
    codigo: async () => {
      const c = $("#c-correo")?.value.trim(); S.registro.correo = c;
      if (!c) { T.err = { correo: "Escribe tu correo." }; render(false); return; }
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(c)) { T.err = { correo: "Revisa tu correo: le falta algo (por ejemplo, «@» o «.com»)." }; render(false); return; }
      T.err = {}; await espera(700, "codigo"); S.registro.enviado = true; guardar(); render(false); $("[data-codigo] input")?.focus();
    },
    cambiarCorreo: () => { S.registro = { correo: S.registro.correo }; guardar(); render(false); },
    salir: () => { S.sesion = null; S.club = false; guardar(); toast("Saliste de tu cuenta."); ir("/"); },
    canjear: () => toast(`${ic("ticket")} Cupón de S/ 10 <b>CAY-DEMO-0001</b> listo: vale 7 días y se usa cuando pagas. <span class="demo" style="margin-left:4px">Simulado</span>`),
    hay: t => { const r = ruta(); ir(conQ(r.path, r.q, { hay: t.checked ? "1" : null }).slice(1)); if (T.capa === "filtros") setTimeout(cajonFiltros, 30); },
    buscarMovil: () => abrir(`<div class="modal" role="dialog" aria-modal="true" aria-label="Buscar" style="top:16px;transform:translateX(-50%);animation:none"><form class="buscador" data-f="buscar" style="width:100%;height:52px">${ic("buscar")}<input name="q" placeholder="Busca blusas, jeans, vestidos…" autofocus aria-label="Buscar"></form><p class="texto-chico" style="margin:16px 0 8px">Categorías</p><div class="opciones">${D.categorias.slice(0, 10).map(c => `<a class="opcion" href="#/catalogo?categoria=${c.pre}" data-a="cerrar">${esc(c.n)}</a>`).join("")}</div></div>`, "buscar"),
    sugerencia: () => abrir(modal("Envíanos una sugerencia", `<p class="bajada">Hoy es el botón flotante «Recomendaciones» que aparece en todas las páginas. La propuesta lo lleva aquí, al pie y a Mi perfil, para que no tape productos.</p><div class="campo" style="margin-top:16px"><label for="sug">Tu sugerencia</label><textarea id="sug" style="min-height:100px;border:1px solid var(--linea-fuerte);border-radius:12px;padding:12px;font:inherit"></textarea></div><button class="btn btn-primario btn-ancho" style="margin-top:16px" data-a="sugerenciaOk">Enviar</button>`), "sug"),
    sugerenciaOk: () => { cerrarCapas(); toast(`${ic("check")} Gracias. <span class="demo" style="margin-left:4px">Simulado: no se envió</span>`); },
    irSeccion: (t, e) => { e.preventDefault(); $(`#${t.dataset.s}`)?.scrollIntoView({ behavior: "smooth" }); },
    reintentar: () => ir("/"),
  };
  function modalTallasConjunto(ps, nombre) {
    if (T.conjNombre !== nombre) { T.tallasConj = {}; T.conjFalta = false; }
    T.conj = ps; T.conjNombre = nombre;
    abrir(modal(esc(nombre), `<p class="bajada">Elige la talla de cada prenda. Se agregan a tu bolsa de ${esc(sede().n)}.</p>
      <div style="display:grid;gap:20px;margin-top:20px">${ps.map(p => { const hay = hayEn(p, S.sede); return `<div style="display:grid;grid-template-columns:56px 1fr;gap:12px;align-items:start"><span class="prenda-foto" style="border-radius:8px"><img src="${FOTO(p.fotos[0], 160)}" alt=""></span><div><div class="entre"><b style="font-size:14.5px">${esc(p.n)}</b><span class="num">${sol(p.p)}</span></div>
        ${!hay ? `<span class="dispo no">No hay en ${esc(sede().n)}: no se agrega</span>` : p.t.length > 1 ? `<div class="opciones" style="margin-top:8px">${p.t.map(x => `<button class="opcion" data-a="conjuntoTalla" data-id="${p.id}" data-t="${esc(x)}" aria-pressed="${T.tallasConj[p.id] === x}" ${p.tOff.includes(x) ? "disabled" : ""}>${esc(x)}</button>`).join("")}</div>${T.conjFalta && !T.tallasConj[p.id] ? `<span class="campo"><span class="pie-campo error">${ic("alerta")} Elige su talla</span></span>` : ""}` : `<span class="texto-chico">${p.t[0] ? `Talla ${esc(p.t[0])}` : "Talla única"}</span>`}</div></div>`; }).join("")}</div>
      <div class="resumen-total" style="padding:20px 0 0;margin-top:20px"><span>Total</span><b class="num">${sol(ps.filter(p => hayEn(p, S.sede)).reduce((s, p) => s + p.p, 0))}</b></div>
      <button class="btn btn-primario btn-ancho" style="margin-top:16px" data-a="conjuntoAgregar">${ic("bolsa")} Agregar a la bolsa</button>`, `Elegir tallas: ${nombre}`), "conjunto");
  }
  function crearPedido() {
    const num = `W-${1000 + Math.floor(Math.random() * 9000)}`;
    const total = S.bolsa.reduce((s, l) => s + (porId.get(l.id)?.p || 0) * l.cant, 0);
    S.pedidos.unshift({ num, sede: S.sede, lineas: S.bolsa.map(l => ({ ...l })), total, creado: Date.now(), estado: 0, codigo: String(1000 + Math.floor(Math.random() * 9000)) });
    S.bolsa = []; guardar(); ir(`/separado/${num}`);
  }
  function iniciar(sesion) {
    S.sesion = sesion; guardar(); T.err = {};
    toast(`${ic("check")} Hola, ${esc(sesion.nombre)}. Entraste a tu cuenta.`);
    const v = S.volver; S.volver = null; guardar(); ir(v || "/cuenta");
  }

  // Formularios
  const FORM = {
    buscar: f => { const q = new FormData(f).get("q")?.toString().trim(); cerrarCapas(); ir(`/catalogo${q ? `?q=${encodeURIComponent(q)}` : ""}`); },
    entrar: async f => {
      const d = Object.fromEntries(new FormData(f)); T.correo = d.correo; const e = {};
      if (!d.correo) e.correo = "Escribe el correo con el que creaste tu cuenta.";
      else if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(d.correo)) e.correo = "Revisa tu correo: le falta algo (por ejemplo, «@» o «.com»).";
      if (!d.clave) e.clave = "Escribe tu contraseña."; else if (d.clave.length < 8) e.clave = "Tu contraseña tiene 8 caracteres o más: revísala.";
      T.err = e; if (Object.keys(e).length) { render(false); f.querySelector("[aria-invalid]")?.focus(); return; }
      await espera(800, "entrar");
      if (d.clave !== "cayla2026") { T.err = { general: "El correo o la contraseña no coinciden. Revísalos o recupera tu contraseña." }; render(false); return; }
      iniciar({ nombre: d.correo.split("@")[0].replace(/^\w/, c => c.toUpperCase()), correo: d.correo });
    },
    registro: async f => {
      const d = Object.fromEntries(new FormData(f)); const e = {};
      if (!d.nombre?.trim()) e.nombre = "Escribe tu nombre.";
      if (!d.clave || d.clave.length < 8) e.clave = "Tu contraseña necesita 8 caracteres o más.";
      if (!d.mayor) e.mayor = "Para crear tu cuenta tienes que ser mayor de 18 años.";
      S.registro.nombre = d.nombre; T.err = e; if (Object.keys(e).length) { render(false); return; }
      await espera(900, "registro");
      const correo = S.registro.correo; S.registro = {}; iniciar({ nombre: d.nombre.trim().split(" ")[0], correo });
    },
    olvide: async f => {
      const c = new FormData(f).get("correo")?.toString().trim(); T.correo = c;
      if (!c || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(c)) { T.err = { correo: c ? "Revisa tu correo: le falta algo." : "Escribe tu correo." }; render(false); return; }
      T.err = {}; await espera(700, "olvide"); T.enlaceEnviado = true; render(false);
    },
    nueva: f => {
      const d = Object.fromEntries(new FormData(f)); const e = {};
      if (!d.clave || d.clave.length < 8) e.clave = "Necesita 8 caracteres o más."; else if (d.clave !== d.clave2) e.clave2 = "Las dos contraseñas no son iguales.";
      T.err = e; if (Object.keys(e).length) { render(false); return; } T.claveLista = true; render(false);
    },
    datos: async f => {
      const d = Object.fromEntries(new FormData(f)); const e = {};
      if (!/^\w{8,12}$/.test(d.doc || "")) e.doc = "Escribe tu DNI (8 números) o tu carné de extranjería.";
      if (!/^9\d{8}$/.test((d.cel || "").replace(/\s/g, ""))) e.cel = "Escribe tu celular de 9 números, empieza con 9.";
      if (!d.mayor) e.mayor = "Tienes que ser mayor de 18 años.";
      if (!d.terminos) e.terminos = "Para entrar al Club, acepta los Términos y la Privacidad.";
      T.err = e; if (Object.keys(e).length) { render(false); f.querySelector("[aria-invalid]")?.focus(); return; }
      await espera(900, "datos"); S.club = true; guardar(); crearPedido();
    },
  };
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-a]");
    if (!t) { if (T.mega && !e.target.closest(".mega")) { T.mega = null; render(false); } return; }
    if (t.tagName === "SELECT" || (t.tagName === "INPUT" && t.type === "checkbox")) return;
    const f = ACC[t.dataset.a]; if (!f) return;
    if (t.tagName !== "A") e.preventDefault();
    f(t, e);
  });
  document.addEventListener("change", e => {
    const t = e.target.closest("[data-a]"); if (!t) return;
    if (t.dataset.a === "orden") { const r = ruta(); ir(conQ(r.path, r.q, { orden: t.value }).slice(1)); }
    if (t.dataset.a === "hay") ACC.hay(t);
  });
  document.addEventListener("submit", e => { const f = e.target.closest("[data-f]"); if (!f) return; e.preventDefault(); FORM[f.dataset.f]?.(f); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { if (T.capa) cerrarCapas(); else if (T.mega) { T.mega = null; render(false); } }
  });
  // El código de 6 números: avanza solo, acepta pegar y se revisa con el sexto.
  document.addEventListener("input", e => {
    const t = e.target; if (!t.closest("[data-codigo]")) return;
    const cajas = [...t.closest("[data-codigo]").querySelectorAll("input")];
    const v = t.value.replace(/\D/g, "");
    if (v.length > 1) { v.split("").slice(0, 6).forEach((c, i) => { if (cajas[i]) cajas[i].value = c; }); } else t.value = v;
    const sig = cajas.find(x => !x.value); (sig || cajas[5]).focus();
    const codigo = cajas.map(x => x.value).join("");
    if (codigo.length === 6) setTimeout(async () => { if (codigo === "246810") { S.registro.confirmado = true; T.err = {}; guardar(); render(false); $("#c-nombre")?.focus(); } else { T.err = { codigo: "Ese código no es. Revísalo o pide uno nuevo." }; render(false); $("[data-codigo] input")?.focus(); } }, 250);
  });

  // ——— Render ———
  const PANTALLA = { "": P.inicio, catalogo: P.catalogo, ofertas: P.ofertas, prenda: P.prenda, looks: P.looks, look: P.look, arma: P.arma, bolsa: P.bolsa, datos: P.datos, separado: P.separado, entrar: P.entrar, "crear-cuenta": P.crearCuenta, verificar: P.crearCuenta, olvide: P.olvide, "nueva-contrasena": P.nuevaContrasena, cuenta: P.cuenta, club: P.club, tiendas: P.tiendas, tienda: P.tienda, "como-separar": P.comoSeparar, cambios: P.cambios, ayuda: P.ayuda, terminos: P.terminos, privacidad: P.privacidad, error: P.error, cargando: P.cargando };
  let anterior = null;
  function render(nuevaRuta = true) {
    const r = ruta();
    // Atajos de revisión (?demo=…): llenan estados para mirarlos sin recorrer el flujo. Nada sale del navegador.
    const demo = r.q.get("demo");
    if (demo === "sesion" && !S.sesion) { S.sesion = { nombre: "María", correo: "maria@ejemplo.pe" }; guardar(); }
    if (demo === "llena" && !S.bolsa.length) { PRENDAS.filter(p => hayEn(p, S.sede) && p.t.length).filter((_, i) => i % 7 === 0).slice(0, 3).forEach((p, i) => S.bolsa.push({ id: p.id, talla: p.t.find(t => !p.tOff.includes(t)) || null, color: p.co?.[0]?.n || null, cant: i === 0 ? 2 : 1 })); guardar(); }
    if (r.partes[0] === "separado" && r.partes[1] === "demo" && !S.pedidos.some(x => x.num === "demo")) {
      const ls = PRENDAS.filter(p => hayEn(p, S.sede) && p.t.length).slice(2, 4).map(p => ({ id: p.id, talla: p.t[0], color: p.co?.[0]?.n || null, cant: 1 }));
      S.pedidos.unshift({ num: "demo", sede: S.sede, lineas: ls, total: ls.reduce((s, l) => s + porId.get(l.id).p, 0), creado: Date.now(), estado: 0, codigo: "4821" }); guardar();
    }
    const f = PANTALLA[r.partes[0] || ""] || (() => P.noExiste());
    if (nuevaRuta) { T.err = {}; T.mega = null; if (anterior !== r.partes[0]) { T.enlaceEnviado = false; T.claveLista = false; } }
    const foco = document.activeElement?.id;
    const cuerpo = f(r);
    $("#app").innerHTML = `${cabecera(r)}<main id="contenido" tabindex="-1">${cuerpo}</main>${["entrar", "crear-cuenta", "olvide", "nueva-contrasena", "verificar"].includes(r.partes[0]) ? "" : pie()}`;
    document.title = `${(document.querySelector("main h1")?.textContent || "Inicio").trim()} · CAYLA`;
    if (nuevaRuta && anterior !== location.hash.split("?")[0] && !document.activeElement?.closest?.("[data-sin-subir]")) { window.scrollTo(0, 0); }
    if (!nuevaRuta && foco) document.getElementById(foco)?.focus();
    anterior = location.hash.split("?")[0];
    // Galería del celular: el punto sigue a la foto
    const g = $("#galeria"); if (g) g.addEventListener("scroll", () => { const i = Math.round(g.scrollLeft / g.clientWidth); document.querySelectorAll(".galeria-puntos i").forEach((x, j) => x.setAttribute("aria-current", String(i === j))); }, { passive: true });
  }
  window.addEventListener("hashchange", () => { cerrarCapas(); render(true); });
  render(true);
})();
