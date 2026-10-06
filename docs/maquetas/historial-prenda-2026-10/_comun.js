/* ====================================================================
   LO COMÚN de las 3 maquetas: la barra de la maqueta, el catálogo de fondo, la hoja con la vista rápida de HOY (la de la
   captura, con el botón nuevo «Historial» entre «Etiquetas» y «Ver en Existencias») y el cambio de página
   vista rápida ↔ historial dentro de la MISMA hoja. Cada maqueta solo dibuja su página de historial:
     Comun.iniciar({ letra: "a", nombre: "Hilo del tiempo", estilos: "...", dibujar(contenedor, ctx) {...} })
   ==================================================================== */
window.Comun = (function () {
  const { icono, avatar, esc, colores, soles } = HP;
  const MAQUETAS = [
    { letra: "a", archivo: "a-hilo.html", nombre: "A · Hilo del tiempo" },
    { letra: "b", archivo: "b-maquina.html", nombre: "B · Máquina del tiempo" },
    { letra: "c", archivo: "c-capitulos.html", nombre: "C · Capítulos" },
  ];

  // ---------- estado de la maqueta, en el hash (sobrevive al cambiar de maqueta desde index.html) ----------
  const PRED = { caso: "completo", tema: "oscuro", ancho: "esc", mov: "si", abrir: "vista" };
  function leerHash() {
    const s = { ...PRED };
    for (const par of (location.hash || "").slice(1).split("&")) {
      const [k, v] = par.split("=");
      if (k in s && v) s[k] = decodeURIComponent(v);
    }
    return s;
  }
  const est = leerHash();
  function guardarHash() {
    const h = Object.entries(est).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    try { history.replaceState(null, "", "#" + h); } catch (_) {}
  }

  // La vista rápida de hoy: Vestido Summer, 5 colores × 1 talla, 1 unidad en cada uno (la captura).
  const FILAS = ["Cereza", "Crudo", "Crema", "Marrón", "Turquesa"];

  let cfg, ctx, pagina = "vista";

  function iniciar(c) {
    cfg = c;
    document.documentElement.dataset.tema = est.tema;
    if (c.estilos) { const st = document.createElement("style"); st.textContent = c.estilos; document.head.appendChild(st); }
    document.body.innerHTML = barra() + `<div id="marco"><div id="escena">${fondo()}<div class="velo"></div><div class="capa"></div><button class="reabrir" hidden>${icono("historial")} Abrir «Vestido Summer»</button></div></div>`;
    const st2 = document.createElement("style");
    st2.textContent = ESTILOS_COMUNES;
    document.head.appendChild(st2);
    aplicarClases();
    conectarBarra();
    abrir(est.abrir === "hist" ? "hist" : "vista");
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !e.defaultPrevented && document.querySelector(".abierta")) cerrar();
    });
  }

  function aplicarClases() {
    document.body.classList.toggle("celular", est.ancho === "cel");
    document.body.classList.toggle("quieto", est.mov === "no");
    document.documentElement.dataset.tema = est.tema;
    const alto = document.querySelector(".spike").getBoundingClientRect().height;
    document.documentElement.style.setProperty("--alto-spike", alto + "px");
  }

  function barra() {
    const op = (grupo, valor, texto) => `<button class="op" data-g="${grupo}" data-v="${valor}" aria-pressed="${est[grupo] === valor}">${texto}</button>`;
    return `<div class="spike">
      <span class="tit">Historial de la prenda · maqueta</span>
      <span class="grupo">${MAQUETAS.map((m) => `<a class="nav" href="${m.archivo}" data-nav ${m.letra === cfg.letra ? 'aria-current="page"' : ""}>${m.nombre}</a>`).join("")}</span>
      <span class="sep"></span>
      <span class="grupo"><span>Datos</span>${op("caso", "completo", "Completo")}${op("caso", "hoy", "Lo que se guarda hoy")}${op("caso", "recien", "Recién creada")}</span>
      <span class="grupo"><span>Tema</span>${op("tema", "oscuro", "Oscuro")}${op("tema", "claro", "Claro")}</span>
      <span class="grupo"><span>Ancho</span>${op("ancho", "esc", "Escritorio")}${op("ancho", "cel", "375 px")}</span>
      <span class="grupo"><span>Movimiento</span>${op("mov", "si", "Con")}${op("mov", "no", "Sin")}</span>
      <span class="grupo"><span>Abrir en</span>${op("abrir", "vista", "Vista rápida")}${op("abrir", "hist", "Historial")}</span>
      <button class="op" data-reabrir>↻ Reabrir</button>
    </div>`;
  }

  function conectarBarra() {
    document.querySelectorAll(".spike button.op[data-g]").forEach((b) =>
      b.addEventListener("click", () => {
        est[b.dataset.g] = b.dataset.v;
        document.querySelectorAll(`.spike button.op[data-g="${b.dataset.g}"]`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        guardarHash();
        aplicarClases();
        if (b.dataset.g === "caso") { if (pagina === "hist") dibujarHistorial(); }
        if (b.dataset.g === "abrir") abrir(est.abrir === "hist" ? "hist" : "vista");
        if (b.dataset.g === "ancho" || b.dataset.g === "tema") { if (cfg.alCambiarEntorno) cfg.alCambiarEntorno(ctx); }
      })
    );
    document.querySelectorAll(".spike a[data-nav]").forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const destino = a.getAttribute("href") + location.hash;
        // Dentro de index.html, que cambie la pestaña de arriba; suelta, navega.
        if (window.parent !== window) window.parent.postMessage({ maqueta: MAQUETAS.findIndex((m) => a.getAttribute("href") === m.archivo) }, "*");
        else location.href = destino;
      })
    );
    document.querySelector("[data-reabrir]").addEventListener("click", () => abrir(est.abrir === "hist" ? "hist" : "vista"));
    document.querySelector(".reabrir").addEventListener("click", () => abrir("vista"));
  }

  function fondo() {
    const cards = [
      ["Vestido Summer", "Vestidos", "#8e1f2f", true], ["Blusa Aurora", "Blusas", "#e9dcc3", false], ["Falda Plisada", "Faldas", "#3d4a5c", true],
      ["Top Amarre", "Tops", "#b9854c", true], ["Vestido Lino", "Vestidos", "#cdb89a", false], ["Pantalón Nuki", "Pantalones", "#2f2b28", true],
      ["Casaca Cuadros", "Casacas", "#7a3b2e", true], ["Blusa Emma", "Blusas", "#f2ece2", false],
    ];
    return `<div id="fondo"><div class="fcab"><h2>Productos</h2><span>Catálogo · Grilla</span></div><div class="fgrid">${cards
      .map(([n, c, hex, osc]) => `<div class="fcard"><div class="fm" style="background:${hex};color:${osc ? "var(--crema-fija)" : "var(--tinta-fija)"}">${icono("vestido")}</div><div class="ft"><b>${n}</b><i>${c}</i></div></div>`)
      .join("")}</div></div>`;
  }

  // ---------- la hoja ----------
  function abrir(enPagina) {
    const escena = document.getElementById("escena");
    escena.classList.remove("cerrando");
    escena.classList.add("abierta");
    escena.querySelector(".reabrir").hidden = true;
    const capa = escena.querySelector(".capa");
    capa.innerHTML = `<div class="hoja" role="dialog" aria-modal="true" aria-label="Vestido Summer" tabindex="-1">
        <button class="cerrar" aria-label="Cerrar">${icono("x")}</button>
        <div class="paginas">
          <section class="pagina pag-vista">${paginaVista()}</section>
          <section class="pagina pag-hist" hidden></section>
        </div>
      </div>`;
    // Reinicia la animación de entrada (ADR-0136).
    const hoja = capa.querySelector(".hoja");
    hoja.style.animation = "none"; hoja.offsetHeight; hoja.style.animation = "";
    capa.querySelector(".cerrar").addEventListener("click", cerrar);
    escena.querySelector(".velo").onclick = cerrar;
    hoja.querySelector("[data-ir-historial]").addEventListener("click", () => irA("hist"));
    pagina = "vista";
    conectarVista(hoja);
    if (enPagina === "hist") {
      hoja.querySelector(".pag-vista").hidden = true;
      hoja.querySelector(".pag-hist").hidden = false;
      pagina = "hist";
      dibujarHistorial();
    }
    hoja.focus({ preventScroll: true });
  }

  function cerrar() {
    const escena = document.getElementById("escena");
    if (!escena.classList.contains("abierta")) return;
    escena.classList.remove("abierta");
    escena.classList.add("cerrando");
    setTimeout(() => {
      escena.classList.remove("cerrando");
      escena.querySelector(".capa").innerHTML = "";
      escena.querySelector(".reabrir").hidden = false;
    }, 230);
  }

  /** «Da vuelta la página» dentro de la misma hoja; el alto acompaña. */
  function irA(destino) {
    const hoja = document.querySelector(".hoja");
    if (!hoja || destino === pagina) return;
    const pags = hoja.querySelector(".paginas");
    const sale = hoja.querySelector(destino === "hist" ? ".pag-vista" : ".pag-hist");
    const entra = hoja.querySelector(destino === "hist" ? ".pag-hist" : ".pag-vista");
    const h0 = pags.getBoundingClientRect().height;
    const quieto = document.body.classList.contains("quieto") || matchMedia("(prefers-reduced-motion: reduce)").matches;
    sale.classList.add(destino === "hist" ? "sale-izq" : "sale-der");
    setTimeout(() => {
      sale.hidden = true;
      sale.classList.remove("sale-izq", "sale-der");
      entra.hidden = false;
      pagina = destino;
      if (destino === "hist") dibujarHistorial(); else conectarVista(hoja);
      pags.style.height = "auto";
      const h1 = pags.getBoundingClientRect().height;
      pags.style.height = h0 + "px";
      pags.offsetHeight;
      pags.style.height = h1 + "px";
      entra.classList.add(destino === "hist" ? "entra-der" : "entra-izq");
      setTimeout(() => { pags.style.height = ""; entra.classList.remove("entra-der", "entra-izq"); }, 460);
      const foco = entra.querySelector(destino === "hist" ? "[data-volver]" : "[data-ir-historial]");
      if (foco) foco.focus({ preventScroll: true });
    }, quieto ? 0 : 190);
  }

  function dibujarHistorial() {
    const cont = document.querySelector(".pag-hist");
    if (!cont) return;
    ctx = {
      caso: est.caso,
      eventos: HP.eventosDe(est.caso),
      celular: est.ancho === "cel",
      quieto: est.mov === "no",
      volver: () => irA("vista"),
      cabecera: cabeceraHistorial,
    };
    cont.innerHTML = "";
    cfg.dibujar(cont, ctx);
    cont.querySelectorAll("[data-volver]").forEach((b) => b.addEventListener("click", () => irA("vista")));
  }

  /** La cabecera que comparten las tres: volver · título · bajada (qué hay aquí y qué NO hay). */
  function cabeceraHistorial(ctx, { resumen = true } = {}) {
    const ev = ctx.eventos;
    const personas = new Set(ev.filter((e) => e.persona).map((e) => e.persona.id));
    const sinFirma = ev.filter((e) => !e.persona).length;
    const ultimo = ev[ev.length - 1];
    const primero = ev[0];
    const dias = HP.diasDesde(primero.t);
    const frase =
      ctx.caso === "recien"
        ? `Nació ${HP.haceCuanto(primero.t)} y nadie la cambió todavía.`
        : `<b class="num">${ev.length - 1}</b> ${ev.length - 1 === 1 ? "cambio" : "cambios"} en <b class="num">${dias}</b> días · <b class="num">${personas.size}</b> ${personas.size === 1 ? "persona" : "personas"}${sinFirma ? ` · <b class="num">${sinFirma}</b> sin firma` : ""} · el último ${HP.haceCuanto(ultimo.t)}${ultimo.persona ? `, ${ultimo.persona.corto}` : ""}`;
    return `<header class="hc">
      <button class="btn enlace hc-volver" data-volver>${icono("atras")} Vestido Summer</button>
      <div class="hc-titulo">
        <h2 class="disp">Historial</h2>
        <p class="hc-bajada">Lo que cambió en esta prenda, quién lo hizo y cuándo.</p>
      </div>
      ${resumen ? `<p class="hc-resumen">${frase}</p>` : ""}
    </header>`;
  }

  // ---------- la vista rápida de hoy (réplica de la captura) ----------
  function paginaVista() {
    const filas = FILAS.map((n, i) => {
      const c = colores[n];
      return `<button class="vr-fila${i === 0 ? " fijado" : ""}" data-color="${n}" style="--i:${i}">
        <span class="vr-col"><span class="sw" style="background:${c.hex};width:30px;height:30px"></span><span><b>${n}</b><small>1 unidad</small></span></span>
        <span class="vr-celda"><b class="num">1</b><i></i></span>
        <span class="vr-tot num">1</span>
      </button>`;
    }).join("");
    return `<div class="vr-cab">
        <h2 class="disp vr-titulo">Vestido Summer</h2>
        <div class="vr-meta">
          <span class="mono">VES-0013</span><span class="vr-cat">Vestidos</span><span class="chip verde punto">Activo</span>
          <span class="vr-sep"><b class="num">S/99.00</b> en las 5 variantes</span>
          <span class="vr-sep"><b>5</b> colores · <b>1</b> talla</span>
        </div>
      </div>
      <div class="vr-cuerpo">
        <aside class="vr-lado">
          <div class="vr-foto mosaico" style="background:${colores.Cereza.hex};color:var(--crema-fija)">${icono("vestido")}</div>
          <div class="vr-pie-foto"><span class="sw" style="background:${colores.Cereza.hex};width:20px;height:20px"></span><b class="vr-nom">Cereza</b><span class="vr-est">fijado</span></div>
          <p class="vr-pista">Pasa el mouse por un color de la lista y la foto lo muestra. Un clic lo deja fijo.</p>
          <div class="vr-desc"><span class="versal">Descripción</span><p>largo, con broche en la cadera</p></div>
        </aside>
        <div class="vr-matriz">
          <div class="vr-mcab"><div><span class="versal">Unidades por color y talla</span><p>Toca una celda, un color o una talla</p></div><div class="vr-cifra"><b class="disp num">5</b> en TRU</div></div>
          <div class="vr-enc"><span class="versal">Color</span><span class="versal">Estándar<small>5</small></span><span class="versal">Total<small>5</small></span></div>
          ${filas}
        </div>
      </div>
      <div class="vr-pie">
        <button class="btn sec">${icono("lapiz")} Editar</button>
        <button class="btn sec">${icono("impresora")} Etiquetas</button>
        <button class="btn sec vr-historial" data-ir-historial>${icono("historial")} Historial</button>
        <button class="btn pri">${icono("caja")} Ver en Existencias</button>
        <span class="vr-espacio"></span>
        <button class="btn sut">${icono("basura")} Eliminar</button>
      </div>`;
  }

  function conectarVista(hoja) {
    const foto = hoja.querySelector(".vr-foto"), nom = hoja.querySelector(".vr-nom"), sw = hoja.querySelector(".vr-pie-foto .sw"), est2 = hoja.querySelector(".vr-est");
    if (!foto) return;
    let fijo = hoja.querySelector(".vr-fila.fijado")?.dataset.color || "Cereza";
    const mostrar = (n, previa) => {
      const c = colores[n];
      foto.style.background = c.hex;
      foto.style.color = c.oscuro ? "var(--crema-fija)" : "var(--tinta-fija)";
      sw.style.background = c.hex;
      nom.textContent = n;
      est2.textContent = previa && n !== fijo ? "vista previa" : "fijado";
    };
    hoja.querySelectorAll(".vr-fila").forEach((f) => {
      f.onmouseenter = () => mostrar(f.dataset.color, true);
      f.onmouseleave = () => mostrar(fijo, false);
      f.onclick = () => { fijo = f.dataset.color; hoja.querySelectorAll(".vr-fila").forEach((x) => x.classList.toggle("fijado", x === f)); mostrar(fijo, false); };
    });
  }

  const ESTILOS_COMUNES = `
  .reabrir{position:absolute;left:50%;top:45%;transform:translateX(-50%);z-index:60;display:inline-flex;gap:10px;align-items:center;padding:12px 20px;border-radius:999px;background:var(--tinta);color:var(--crema);font-weight:600}
  .reabrir svg{width:18px;height:18px}
  .reabrir[hidden]{display:none}
  /* Vista rápida (réplica) */
  .pag-vista{min-height:0}
  .vr-cab{padding:30px 80px 4px 36px}
  .vr-titulo{font-size:40px;line-height:1.05}
  .vr-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-top:10px;font-size:14.5px;color:var(--taupe)}
  .vr-meta .mono{color:var(--t80);font-size:13.5px}
  .vr-sep{padding-left:12px;border-left:1px solid var(--sand);color:var(--t60)}
  .vr-sep b{color:var(--tinta);font-weight:600}
  .vr-cuerpo{display:grid;grid-template-columns:260px 1fr;gap:26px;padding:22px 36px 18px;overflow:auto;min-height:0}
  .vr-foto{aspect-ratio:4/5;border-radius:var(--r-xl);transition:background-color 380ms var(--ease),color 380ms var(--ease)}
  .vr-pie-foto{display:flex;align-items:center;gap:10px;margin-top:14px}
  .vr-pie-foto .vr-nom{font-size:15px}
  .vr-est{font-size:12.5px;color:var(--taupe)}
  .vr-pista{font-size:12.5px;color:var(--t55);margin-top:6px;line-height:1.45}
  .vr-desc{margin-top:14px;padding-top:12px;border-top:1px solid var(--sand)}
  .vr-desc .versal{color:var(--t55);font-size:10.5px}
  .vr-desc p{font-size:14px;margin-top:4px}
  .vr-matriz{border:1px solid var(--sand);border-radius:var(--r-xl);padding:18px 18px 10px;background:color-mix(in srgb,var(--hueso) 35%,var(--papel));align-self:start}
  .vr-mcab{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
  .vr-mcab .versal{color:var(--t60);font-size:10.5px}
  .vr-mcab p{font-size:14px;color:var(--taupe);margin-top:2px}
  .vr-cifra{font-size:13px;color:var(--t60);white-space:nowrap}
  .vr-cifra b{font-size:40px;color:var(--tinta);margin-right:4px;line-height:1}
  .vr-enc,.vr-fila{display:grid;grid-template-columns:1fr 150px 56px;gap:12px;align-items:center}
  .vr-enc{margin:16px 0 4px;color:var(--t60)}
  .vr-enc .versal{font-size:10.5px}
  .vr-enc span:nth-child(n+2){text-align:center;display:flex;flex-direction:column;align-items:center}
  .vr-enc small{font-size:11px;letter-spacing:0;font-weight:500}
  .vr-fila{width:100%;padding:5px 0;border-radius:var(--r-lg);transition:background-color 200ms var(--ease)}
  .vr-fila:hover{background:var(--t04)}
  .vr-col{display:flex;align-items:center;gap:12px}
  .vr-col b{display:block;font-size:15px;font-weight:500}
  .vr-col small{display:block;font-size:12px;color:var(--t60)}
  .vr-fila.fijado .sw{box-shadow:0 0 0 2px var(--papel),0 0 0 3.5px var(--tinta)}
  .vr-celda{display:flex;flex-direction:column;align-items:center;gap:5px;border:1px solid var(--sand);border-radius:var(--r-lg);padding:7px 0 8px}
  .vr-celda i{width:62%;height:3px;border-radius:2px;background:var(--taupe)}
  .vr-tot{text-align:center;color:var(--t75)}
  .vr-pie{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:14px 36px 22px;border-top:1px solid var(--sand)}
  .vr-espacio{flex:1}
  /* Solo en la maqueta: el botón nuevo se señala UNA vez al abrir (no es parte de la pantalla). */
  @keyframes senal-nuevo{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--rojo) 0%,transparent)}35%{box-shadow:0 0 0 5px color-mix(in srgb,var(--rojo) 35%,transparent)}100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--rojo) 0%,transparent)}}
  .abierta .vr-historial{animation:senal-nuevo 1100ms var(--ease) 650ms 1 backwards}
  @container escena (max-width:640px){
    .vr-cab{padding:22px 60px 2px 18px}
    .vr-titulo{font-size:30px}
    .vr-cuerpo{grid-template-columns:1fr;padding:16px 18px;gap:16px}
    .vr-foto{aspect-ratio:16/10}
    .vr-enc,.vr-fila{grid-template-columns:1fr 96px 40px}
    .vr-pie{display:grid;grid-template-columns:1fr 1fr;padding:12px 16px 18px;gap:8px}
    .vr-pie .btn{padding:0 10px;font-size:13.5px}
    .vr-espacio{display:none}
    .vr-pie .sut{grid-column:1/-1}
  }
  /* Cabecera común del historial */
  .pag-hist{min-height:0}
  .hc{padding:22px 80px 0 28px}
  .hc-volver{margin-left:-8px}
  .hc-titulo{display:flex;align-items:baseline;gap:6px 16px;flex-wrap:wrap;margin-top:6px}
  .hc-titulo h2{font-size:40px;line-height:1.05}
  .hc-bajada{font-size:14.5px;color:var(--taupe)}
  .hc-resumen{margin-top:8px;font-size:13.5px;color:var(--t60)}
  .hc-resumen b{color:var(--tinta);font-weight:600}
  @container escena (max-width:640px){
    .hc{padding:16px 56px 0 16px}
    .hc-titulo h2{font-size:30px}
    .hc-bajada{font-size:13.5px;width:100%}
  }
  `;

  return { iniciar, irA, est, MAQUETAS };
})();
