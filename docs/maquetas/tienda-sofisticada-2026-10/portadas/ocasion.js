// ── Portada «¿A dónde vas hoy?» (maqueta I, 2026-10-31) ──
// Quien entra sin saber qué buscar elige su plan y ve un look armado con prendas reales del ERP, listo para separar. Las prendas, sus
// precios y su stock son reales (datos.js); qué prendas van con cada plan y qué foto lo acompaña es DE EJEMPLO (lo armó la maqueta, no
// la base). Cumple el contrato de `scratchpad/portadas-contrato.md`: se registra en window.PORTADAS.ocasion y usa solo los tokens de la base.
(function () {
  "use strict";

  // Cada plan: la foto de campaña (fNN de «Editadas») y las prendas que se ven en ella o le combinan. Donde la foto tiene cruce con una
  // prenda (Chaleco Cecia ↔ f19, Blusa Emilia ↔ f06, Casaca Jean Oversize ↔ f34, Top Bandana ↔ f40, Casaca Jean Crop ↔ f50), esa va primero.
  const PLANES = [
    { clave: "trabajo", nombre: "Al trabajo", foto: "f19", cat: "tops", ids: [243, 126, 68],
      alt: "Modelo con chaleco gris de botones, pantalón blanco y cartera negra", frase: "Chaleco entallado y lino: armada de 9 a 6." },
    { clave: "cena", nombre: "A una cena", foto: "f06", cat: "tops", ids: [89, 178, 237, 189],
      alt: "Modelo con blusa negra de cuello halter y jean acampanado", frase: "Negro y satinado, con un brillo en las orejas." },
    { clave: "finde", nombre: "Al fin de semana", foto: "f34", cat: "casacas", ids: [242, 29, 280],
      alt: "Modelo con casaca jean oversize sobre un top blanco", frase: "Denim encima y lino abajo, cómodo todo el sábado." },
    { clave: "fiesta", nombre: "A una fiesta", foto: "f40", cat: "tops", ids: [202, 20, 222],
      alt: "Dos modelos con tops tipo bandana estampados", frase: "Estampado arriba y brillo abajo, para bailar." },
    { clave: "viaje", nombre: "De viaje", foto: "f50", cat: "casacas", ids: [240, 25, 123],
      alt: "Modelo con casaca jean corta y pantalón negro ancho", frase: "Una casaca corta y un jean que aguanta el camino." },
  ];

  const CSS = `
.portada-ocasion {
  --po-alto: clamp(440px, calc(100svh - var(--cab) - 250px), 700px);
  display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  grid-template-areas: "cab escena" "planes escena" "nota resumen"; grid-template-rows: auto 1fr auto;
  column-gap: clamp(28px, 4.4vw, 80px);
  padding: clamp(24px, 4vh, 44px) var(--g) clamp(24px, 4vh, 40px);
  color: var(--tinta); font-family: var(--texto); box-sizing: border-box; max-width: 100%;
}
.portada-ocasion *, .portada-ocasion *::before, .portada-ocasion *::after { box-sizing: border-box; }
.po-cab { grid-area: cab; display: grid; gap: 14px; align-content: start; padding-bottom: 22px; }
.po-rotulo { margin: 0; font-size: 11.5px; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; color: var(--tenue); }
.po-titulo { margin: 0; font: 400 clamp(40px, 4.5vw, 70px)/1 var(--display); letter-spacing: -.005em; }
.po-linea { display: block; overflow: hidden; padding-bottom: .08em; }
.po-linea > span { display: block; transition: transform 1s var(--ease); transition-delay: calc(var(--l) * 110ms); }
.po-bajada { margin: 4px 0 0; max-width: 40ch; font-size: 16px; line-height: 1.55; color: var(--tenue); }

.po-planes { grid-area: planes; display: grid; align-content: start; border-top: 1px solid var(--tinta); }
.po-plan { appearance: none; -webkit-appearance: none; background: none; border: 0; border-bottom: 1px solid var(--linea); margin: 0;
  padding: 12px 0; width: 100%; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 14px; align-items: baseline;
  text-align: left; color: inherit; font: inherit; cursor: pointer; position: relative; }
.po-plan::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--tinta);
  transform: scaleX(0); transform-origin: left; transition: transform .7s var(--ease); }
.po-plan[aria-selected="true"]::after { transform: scaleX(1); }
.po-n { font-size: 12px; font-weight: 600; letter-spacing: .16em; color: var(--tenue); font-variant-numeric: tabular-nums; transition: color .3s; }
.po-plan[aria-selected="true"] .po-n { color: var(--acento); }
.po-nombre { font: 400 clamp(24px, 2.3vw, 36px)/1.1 var(--display); color: color-mix(in srgb, var(--tinta) 72%, transparent);
  transition: transform .6s var(--ease), color .3s; }
.po-plan[aria-selected="true"] .po-nombre { color: var(--tinta); transform: translateX(14px); }
.po-meta { font-size: 13px; color: var(--tenue); font-variant-numeric: tabular-nums; white-space: nowrap; }
.po-plan:focus-visible { outline: 2px solid var(--tinta); outline-offset: 3px; }
@media (hover: hover) { .po-plan:hover .po-nombre { color: var(--tinta); } }
.po-nota { grid-area: nota; margin: 18px 0 0; font-size: 13px; color: var(--tenue); align-self: start; }
.po-ejemplo { border-bottom: 1px dashed currentColor; padding-bottom: 1px; }

.po-escena { grid-area: escena; position: relative; height: var(--po-alto); }
.po-marco { position: absolute; top: 0; bottom: 0; left: 0; width: 63%; }
.po-fotos { position: absolute; inset: 0; overflow: hidden; background: var(--papel); }
.po-capa { position: absolute; inset: 0; clip-path: circle(0px at var(--x, 0px) var(--y, 50%)); transition: clip-path 1s var(--ease); }
.po-capa.abierta { clip-path: circle(var(--r, 150%) at var(--x, 0px) var(--y, 50%)); }
.po-capa img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 50% 24%; transform: scale(1.07);
  transition: transform 1.5s var(--ease); }
.po-capa.abierta img { transform: none; }
.po-frase { position: absolute; z-index: 2; left: 14px; bottom: 14px; max-width: calc(100% - 28px); margin: 0; padding: 8px 12px;
  background: var(--papel); color: var(--tinta); font-size: 13.5px; line-height: 1.35; transition: opacity .35s var(--ease), transform .5s var(--ease); }
.po-frase.cambiando { opacity: 0; transform: translateY(6px); }
.po-piezas { position: absolute; z-index: 3; right: 0; top: 50%; transform: translateY(-50%); width: 43%; margin: 0; padding: 0;
  list-style: none; display: grid; gap: 10px; }
.po-pieza { opacity: 0; transform: translateX(28px); transition: opacity .5s var(--ease), transform .75s var(--ease);
  transition-delay: calc(var(--i) * 85ms); }
.po-piezas.visible .po-pieza { opacity: 1; transform: none; }
.po-piezas.saliendo .po-pieza { opacity: 0; transform: translateX(-10px); transition-duration: .18s; transition-delay: 0s; }
.po-pieza a { display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 14px; align-items: center; padding: 9px 16px 9px 9px;
  background: var(--papel); border: 1px solid var(--linea); color: inherit; text-decoration: none;
  box-shadow: 0 20px 44px -28px var(--sombra); transition: border-color .3s, transform .5s var(--ease); }
.po-pieza a:focus-visible { outline: 2px solid var(--tinta); outline-offset: 2px; }
@media (hover: hover) { .po-pieza a:hover { border-color: var(--tinta); transform: translateX(-4px); } }
.po-mini { display: block; aspect-ratio: 4 / 5; background: var(--placa); }
.po-mini img { display: block; width: 100%; height: 100%; padding: 4px; object-fit: contain; mix-blend-mode: multiply; }
.po-txt { display: grid; gap: 3px; min-width: 0; }
.po-txt b { font: 400 18px/1.15 var(--display); }
.po-precio { font-size: 14px; font-variant-numeric: tabular-nums; }
.po-stock { font-size: 12.5px; color: var(--tenue); }
.po-stock.hay { color: var(--verde); }
.po-stock.pocas, .po-stock.ultima { color: var(--ocre); }

.po-resumen { grid-area: resumen; display: flex; flex-wrap: wrap; align-items: center; gap: 14px 20px; margin-top: 16px; padding-top: 16px;
  border-top: 1px solid var(--linea); }
.po-total { display: grid; gap: 4px; margin-right: auto; }
.po-total span { font-size: 11.5px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: var(--tenue); }
.po-total b { font: 400 30px/1 var(--display); font-variant-numeric: tabular-nums; }
.po-btn { appearance: none; -webkit-appearance: none; min-height: 48px; padding: 0 22px; display: inline-flex; align-items: center; gap: 10px;
  border: 1px solid var(--tinta); background: transparent; color: var(--tinta); font: 600 12px/1 var(--texto); letter-spacing: .14em;
  text-transform: uppercase; cursor: pointer; transition: background .3s, color .3s, border-color .3s; }
.po-btn.primario { background: var(--tinta); color: var(--fondo); }
.po-btn svg { width: 16px; height: 16px; transition: transform .4s var(--ease); }
.po-btn:focus-visible { outline: 2px solid var(--tinta); outline-offset: 3px; }
@media (hover: hover) {
  .po-btn.primario:hover { background: color-mix(in srgb, var(--tinta) 82%, var(--acento)); border-color: color-mix(in srgb, var(--tinta) 82%, var(--acento)); }
  .po-btn.secundario:hover { background: var(--tinta); color: var(--fondo); }
  .po-btn.secundario:hover svg { transform: translateX(4px); }
}

/* entrada: una vez, cuando la portada se ve */
.portada-ocasion.po-antes .po-linea > span { transform: translateY(108%); }
.po-aparece { transition: opacity .7s var(--ease), transform .9s var(--ease); transition-delay: var(--d, 0ms); }
.portada-ocasion.po-antes .po-aparece { opacity: 0; transform: translateY(14px); }

@media (max-width: 1100px) {
  .portada-ocasion { grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); }
  .po-piezas { width: 50%; }
  .po-marco { width: 60%; }
  .po-meta { display: none; }
}
@media (max-width: 860px) {
  .portada-ocasion { grid-template-columns: minmax(0, 1fr); grid-template-areas: "cab" "planes" "escena" "resumen" "nota";
    grid-template-rows: auto; padding-top: 24px; }
  .po-cab { padding-bottom: 14px; }
  .po-titulo { font-size: clamp(38px, 10.5vw, 56px); }
  .po-bajada { font-size: 15px; }
  .po-planes { display: flex; gap: 8px; overflow-x: auto; border-top: 0; margin: 2px calc(-1 * var(--g)) 14px; padding: 2px var(--g) 6px;
    scroll-snap-type: x proximity; scrollbar-width: none; }
  .po-planes::-webkit-scrollbar { display: none; }
  .po-plan { flex: none; width: auto; display: inline-flex; padding: 0 16px; min-height: 44px; align-items: center; border: 1px solid var(--linea);
    border-radius: 999px; background: var(--papel); scroll-snap-align: start; scroll-margin-inline: var(--g); transition: background .3s, border-color .3s; }
  .po-plan::after, .po-n, .po-meta { display: none; }
  .po-nombre { font-size: 17px; white-space: nowrap; }
  .po-plan[aria-selected="true"] { background: var(--tinta); border-color: var(--tinta); }
  .po-plan[aria-selected="true"] .po-nombre { color: var(--fondo); transform: none; }
  .po-escena { height: auto; }
  .po-marco { position: relative; width: 100%; aspect-ratio: 4 / 5; max-height: 64svh; }
  .po-piezas { position: static; transform: none; width: auto; margin-top: 12px; }
  .po-pieza { transform: translateY(16px); }
  .po-resumen { margin-top: 18px; }
  .po-total { flex: 1 0 100%; }
  .po-btn { flex: 1 1 auto; justify-content: center; }
  .po-nota { margin-top: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .portada-ocasion *, .portada-ocasion *::before, .portada-ocasion *::after { transition: none !important; }
}
`;

  const flecha = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4"/></svg>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  let estado = null; // todo lo que hay que soltar al desmontar

  function montar(raiz, T) {
    if (!document.getElementById("estilo-ocasion")) {
      const st = document.createElement("style"); st.id = "estilo-ocasion"; st.textContent = CSS; document.head.appendChild(st);
    }
    const reducido = !!T.reducido || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conMouse = matchMedia("(hover: hover) and (pointer: fine)");
    const planes = PLANES.map((pl) => ({ ...pl, ids: pl.ids.filter((id) => T.P[id]) }));
    const total = (pl) => pl.ids.reduce((s, id) => s + T.P[id].precio, 0);
    const dos = (n) => String(n).padStart(2, "0");

    raiz.innerHTML = `
<div class="portada-ocasion${reducido ? "" : " po-antes"}">
  <div class="po-cab">
    <p class="po-rotulo po-aparece" style="--d:0ms">Para hoy en <span data-po-sede>${esc(T.sede())}</span></p>
    <h1 class="po-titulo"><span class="po-linea"><span style="--l:0">¿A dónde</span></span><span class="po-linea"><span style="--l:1">vas hoy?</span></span></h1>
    <p class="po-bajada po-aparece" style="--d:260ms">Elige tu plan y te mostramos un look con prendas de la tienda. Lo separas sin pagar y lo recoges.</p>
  </div>
  <div class="po-planes" role="tablist" aria-orientation="vertical" aria-label="¿A dónde vas hoy?">
    ${planes.map((pl, i) => `<button type="button" role="tab" class="po-plan po-aparece" id="po-tab-${pl.clave}" data-plan="${i}"
      aria-controls="po-escena" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" style="--d:${360 + i * 70}ms">
      <span class="po-n">${dos(i + 1)}</span><span class="po-nombre">${esc(pl.nombre)}</span><span class="po-meta">${pl.ids.length} prendas · ${T.sol(total(pl))}</span></button>`).join("")}
  </div>
  <p class="po-nota po-aparece" style="--d:760ms"><span class="po-ejemplo">Combinaciones de ejemplo, con prendas reales</span></p>
  <div class="po-escena" id="po-escena" role="tabpanel" aria-labelledby="po-tab-${planes[0].clave}">
    <div class="po-marco"><div class="po-fotos"></div><p class="po-frase" aria-live="polite"></p></div>
    <ul class="po-piezas" aria-label="Prendas del look"></ul>
  </div>
  <div class="po-resumen po-aparece" style="--d:900ms">
    <div class="po-total"><span>El look completo</span><b data-cuenta="0" data-pref="S/ " data-dec="2">S/ 0.00</b></div>
    <button type="button" class="po-btn primario" data-po-separar>Separar todo</button>
    <button type="button" class="po-btn secundario" data-po-mas>Ver más para este plan ${flecha}</button>
  </div>
</div>`;

    const $ = (s) => raiz.querySelector(s);
    const raizPortada = $(".portada-ocasion");
    const tabs = [...raiz.querySelectorAll(".po-plan")];
    const escena = $(".po-escena"), fotos = $(".po-fotos"), frase = $(".po-frase"), piezas = $(".po-piezas");
    const totalEl = $(".po-total b"), separar = $("[data-po-separar]"), mas = $("[data-po-mas]"), sedeEl = $("[data-po-sede]");
    const timers = new Set();
    const despues = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    let actual = -1, turno = 0, entro = false, hoverT = 0;

    // ── la foto: una capa nueva que se abre en círculo desde donde está el mouse (proyectado sobre el marco de la foto) ──
    function origenDesde(x, y) {
      const r = fotos.getBoundingClientRect();
      const ox = Math.min(Math.max(x - r.left, 0), r.width), oy = Math.min(Math.max(y - r.top, 0), r.height);
      const rad = Math.max(...[[0, 0], [r.width, 0], [0, r.height], [r.width, r.height]].map(([a, b]) => Math.hypot(a - ox, b - oy)));
      return { x: ox, y: oy, r: Math.ceil(rad) + 2 };
    }
    function origenDeElemento(el) {
      const r = el.getBoundingClientRect();
      return origenDesde(r.left + r.width / 2, r.top + r.height / 2);
    }
    function ponerFoto(pl, origen) {
      const capa = document.createElement("div");
      capa.className = "po-capa";
      capa.style.setProperty("--x", origen.x + "px"); capa.style.setProperty("--y", origen.y + "px"); capa.style.setProperty("--r", origen.r + "px");
      const img = document.createElement("img");
      img.src = T.foto(pl.foto); img.alt = pl.alt; img.decoding = "async";
      capa.appendChild(img); fotos.appendChild(capa);
      const limpiar = () => { while (fotos.firstElementChild && fotos.firstElementChild !== capa) fotos.firstElementChild.remove(); };
      if (reducido) { capa.classList.add("abierta"); limpiar(); return; }
      // tope de capas apiladas si alguien recorre la lista muy rápido
      while (fotos.children.length > 3) fotos.firstElementChild.remove();
      let abierta = false;
      const abrir = () => { if (abierta || !capa.isConnected) return; abierta = true; void capa.offsetWidth; capa.classList.add("abierta"); };
      (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => requestAnimationFrame(abrir));
      despues(abrir, 700);
      capa.addEventListener("transitionend", (e) => { if (e.propertyName === "clip-path" && e.target === capa) limpiar(); });
    }

    // ── las prendas: salen las del plan anterior y entran las nuevas en cascada ──
    function tarjeta(id, k) {
      const p = T.P[id];
      return `<li class="po-pieza" style="--i:${k}"><a href="#ficha" data-id="${id}">
        <span class="po-mini"><img src="${esc(p.foto)}" alt="" loading="lazy"></span>
        <span class="po-txt"><b>${esc(p.nombre)}</b><span class="po-precio">${T.sol(p.precio)}</span>
        <span class="po-stock ${T.claseStock(p)}" data-stock="${id}">${esc(T.stockTexto(p))}</span></span></a></li>`;
    }
    function ponerPiezas(pl, espera) {
      const mio = ++turno;
      const hayAntes = piezas.children.length > 0;
      if (reducido) { piezas.innerHTML = pl.ids.map(tarjeta).join(""); piezas.classList.add("visible"); return; }
      if (hayAntes) piezas.classList.add("saliendo");
      despues(() => {
        if (mio !== turno) return;
        piezas.classList.remove("visible", "saliendo");
        piezas.innerHTML = pl.ids.map(tarjeta).join("");
        void piezas.offsetWidth;
        requestAnimationFrame(() => { if (mio === turno) piezas.classList.add("visible"); });
      }, hayAntes ? 180 : espera);
    }

    function elegir(i, origen, opc = {}) {
      if (i === actual && !opc.forzar) return;
      actual = i;
      const pl = planes[i];
      tabs.forEach((t, k) => { t.setAttribute("aria-selected", String(k === i)); t.tabIndex = k === i ? 0 : -1; });
      escena.setAttribute("aria-labelledby", tabs[i].id);
      ponerFoto(pl, origen || origenDeElemento(tabs[i]));
      ponerPiezas(pl, opc.esperaPiezas || 0);
      // la frase de la foto cambia con un fundido corto
      if (reducido || !frase.textContent) frase.textContent = pl.frase;
      else { frase.classList.add("cambiando"); despues(() => { frase.textContent = pl.frase; frase.classList.remove("cambiando"); }, 220); }
      totalEl.dataset.cuenta = String(total(pl));
      const contar = () => { if (T.contar && !reducido) T.contar(totalEl); else totalEl.textContent = T.sol(total(pl)); };
      if (opc.esperaTotal) despues(contar, opc.esperaTotal); else contar();
      separar.textContent = "Separar todo"; separar.disabled = false;
      // en el celular, la píldora elegida se deja a la vista
      if (!conMouse.matches && tabs[i].scrollIntoView) {
        const fila = tabs[i].parentElement, r = tabs[i].getBoundingClientRect(), f = fila.getBoundingClientRect();
        if (r.left < f.left || r.right > f.right) fila.scrollTo({ left: fila.scrollLeft + r.left - f.left - 16, behavior: reducido ? "auto" : "smooth" });
      }
    }

    // ── eventos ──
    const enMouse = (e) => {
      if (!conMouse.matches) return;
      const i = +e.currentTarget.dataset.plan;
      clearTimeout(hoverT);
      const { clientX, clientY } = e;
      hoverT = despues(() => elegir(i, origenDesde(clientX, clientY)), 70);
    };
    const enSalir = () => clearTimeout(hoverT);
    const enClic = (e) => {
      const i = +e.currentTarget.dataset.plan;
      clearTimeout(hoverT);
      elegir(i, e.clientX || e.clientY ? origenDesde(e.clientX, e.clientY) : origenDeElemento(e.currentTarget));
    };
    const enFoco = (e) => {
      // el foco de teclado elige (pestañas con activación automática); el del clic ya lo resuelve enClic
      if (!e.currentTarget.matches(":focus-visible")) return;
      elegir(+e.currentTarget.dataset.plan, origenDeElemento(e.currentTarget));
    };
    const enTecla = (e) => {
      const k = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      let i = actual;
      if (k) i = (actual + k + tabs.length) % tabs.length;
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = tabs.length - 1;
      else return;
      e.preventDefault();
      tabs[i].focus();
      elegir(i, origenDeElemento(tabs[i]));
    };
    tabs.forEach((t) => {
      t.addEventListener("pointerenter", enMouse);
      t.addEventListener("pointerleave", enSalir);
      t.addEventListener("click", enClic);
      t.addEventListener("focus", enFoco);
      t.addEventListener("keydown", enTecla);
    });
    const enPieza = (e) => {
      const a = e.target.closest("a[data-id]");
      if (!a) return;
      e.preventDefault();
      T.ir("ficha", { id: +a.dataset.id });
    };
    piezas.addEventListener("click", enPieza);
    const enSeparar = () => {
      const pl = planes[actual];
      T.agregarVarias(pl.ids, piezas);
      separar.textContent = "✓ En tu bolsa";
    };
    separar.addEventListener("click", enSeparar);
    const enMas = () => T.ir("catalogo", { cat: planes[actual].cat });
    mas.addEventListener("click", enMas);

    // ── la tienda elegida: el rótulo y el stock de cada prenda ──
    const desuscribir = T.alCambiarSede ? T.alCambiarSede((nombre) => {
      sedeEl.textContent = nombre;
      piezas.querySelectorAll("[data-stock]").forEach((s) => {
        const p = T.P[+s.dataset.stock];
        s.textContent = T.stockTexto(p);
        s.className = "po-stock " + T.claseStock(p);
      });
    }) : null;

    // ── entrada: corre una vez, cuando la portada se ve (si la vista de Inicio está oculta, espera) ──
    function entrar() {
      if (entro) return;
      entro = true;
      if (reducido) { elegir(0, origenDesde(-1, -1), { forzar: true }); return; }
      requestAnimationFrame(() => {
        raizPortada.classList.remove("po-antes");
        despues(() => {
          const r = fotos.getBoundingClientRect();
          elegir(0, origenDesde(r.left, r.top + r.height * 0.55), { forzar: true, esperaPiezas: 560, esperaTotal: 900 });
        }, 380);
      });
    }
    let io = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver((ents) => { if (ents.some((x) => x.isIntersecting)) { io.disconnect(); io = null; entrar(); } }, { threshold: 0.15 });
      io.observe(raizPortada);
    } else entrar();

    estado = { raiz, tabs, timers, io, desuscribir, piezas, separar, mas, enMouse, enSalir, enClic, enFoco, enTecla, enPieza, enSeparar, enMas };
  }

  function desmontar() {
    if (!estado) return;
    const s = estado;
    s.timers.forEach(clearTimeout); s.timers.clear();
    if (s.io) s.io.disconnect();
    if (typeof s.desuscribir === "function") s.desuscribir();
    s.tabs.forEach((t) => {
      t.removeEventListener("pointerenter", s.enMouse);
      t.removeEventListener("pointerleave", s.enSalir);
      t.removeEventListener("click", s.enClic);
      t.removeEventListener("focus", s.enFoco);
      t.removeEventListener("keydown", s.enTecla);
    });
    s.piezas.removeEventListener("click", s.enPieza);
    s.separar.removeEventListener("click", s.enSeparar);
    s.mas.removeEventListener("click", s.enMas);
    estado = null;
  }

  window.PORTADAS = window.PORTADAS || {};
  window.PORTADAS.ocasion = { nombre: "Ocasión", montar, desmontar };
})();
