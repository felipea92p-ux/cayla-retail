/* ── Portada «Frase» de la maqueta I (2026-10-31). La tienda te habla: el inicio es UNA frase grande, armada con los datos de la tienda
   elegida, y esa frase es el menú. Cada dato subrayado abre un abanico (tres prendas reales, la tienda o las tres sedes) y lleva a su
   pantalla. Contrato con la base: window.TIENDA y window.PORTADAS (scratchpad/portadas-contrato.md). Lo inventado va marcado «de ejemplo». ── */
(function () {
  "use strict";

  // «Prendas nuevas»: de ejemplo y estables por tienda, hasta que la base dé las suyas con T.nuevas(sede).
  const NUEVAS_EJEMPLO = { Trujillo: 17, Arequipa: 23, Lima: 12 };
  const SEDES = ["Trujillo", "Arequipa", "Lima"];
  const FRANJA = [
    ["f31", "Modelo con casaca de cuero marrón"],
    ["f36", "Modelo con conjunto tejido celeste"],
    ["f45", "Dos amigas con polos de ribete"],
    ["f18", "Modelo con vestido beige de tiras"],
    ["f49", "Modelo con top celeste y short de jean"],
    ["f30", "Modelo con chaleco blanco de botones"],
  ];

  const CSS = `
.portada-frase { position: relative; display: flex; flex-direction: column; justify-content: center; min-height: calc(100svh - var(--cab));
  padding: clamp(32px, 7vh, 88px) var(--g) clamp(28px, 6vh, 64px); background: var(--fondo); color: var(--tinta); font-family: var(--texto);
  --g1: max(1.5px, .028em); --g2: max(2px, .045em); --subrayado: color-mix(in srgb, var(--tinta) 42%, transparent); }
.portada-frase .fr-cuerpo { width: 100%; max-width: 1240px; }
.portada-frase .fr-rotulo { display: flex; flex-wrap: wrap; gap: 6px 10px; margin: 0; font: 600 11.5px/1.3 var(--texto); letter-spacing: .16em;
  text-transform: uppercase; color: var(--tenue); }
.portada-frase .fr-rotulo .fr-pista { color: var(--tinta); }
.portada-frase .fr-frase { margin: clamp(16px, 3vh, 28px) 0 0; max-width: 16.5em; font: 400 clamp(34px, 5.3vw, 84px)/1.15 var(--display);
  letter-spacing: -.004em; text-wrap: pretty; }
.portada-frase .fr-w { display: inline-block; opacity: 0; transform: translateY(.38em); }
.portada-frase.fr-entra .fr-w { animation: fr-sube .75s var(--ease) both; animation-delay: calc(var(--w) * 55ms + 120ms); }
.portada-frase.fr-listo .fr-w { opacity: 1; transform: none; animation: none; }
.portada-frase .fr-w[hidden] { display: none; }

/* los datos: un enlace subrayado que se dibuja una vez al entrar; al abrir su abanico, el rojo corre por debajo */
.portada-frase .fr-dato { color: inherit; text-decoration: none; cursor: pointer; padding-bottom: .02em;
  background-image: linear-gradient(var(--acento), var(--acento)), linear-gradient(var(--subrayado), var(--subrayado));
  background-repeat: no-repeat; background-position: 0 100%, 0 100%; background-size: 0% var(--g2), 0% var(--g1); }
.portada-frase.fr-entra .fr-dato { animation: fr-subraya .9s var(--ease) both; animation-delay: var(--d); }
.portada-frase.fr-listo .fr-dato { background-size: 0% var(--g2), 100% var(--g1); transition: background-size .45s var(--ease); }
.portada-frase.fr-listo .fr-dato.fr-activo { background-size: 100% var(--g2), 100% var(--g1); }
@media (hover: hover) { .portada-frase.fr-listo .fr-dato:hover { background-size: 100% var(--g2), 100% var(--g1); } }
.portada-frase .fr-dato:focus-visible { outline: 2px solid var(--tinta); outline-offset: 4px; }
.portada-frase button.fr-dato { font: inherit; letter-spacing: inherit; color: inherit; background-color: transparent; border: 0; padding: 0 0 .02em;
  margin: 0; text-align: inherit; }
.portada-frase .fr-flecha { width: .34em; height: .34em; margin-left: .14em; vertical-align: .14em; transition: transform .35s var(--ease); }
.portada-frase .fr-sede[aria-expanded="true"] .fr-flecha { transform: rotate(180deg); }
.portada-frase .fr-parte { transition: opacity .3s var(--ease); }
.portada-frase .fr-parte.fr-sale { opacity: 0; transition-duration: .2s; }
.portada-frase .fr-num.fr-rodando { display: inline-grid; vertical-align: baseline; clip-path: inset(0 -.1em); }
.portada-frase .fr-num.fr-rodando > span { grid-area: 1 / 1; transition: transform .7s var(--ease), opacity .5s var(--ease); }
.portada-frase .fr-num.fr-rodando .fr-n-nuevo { transform: translateY(70%); opacity: 0; }
.portada-frase .fr-num.fr-rodar .fr-n-viejo { transform: translateY(-70%); opacity: 0; }
.portada-frase .fr-num.fr-rodar .fr-n-nuevo { transform: none; opacity: 1; }

.portada-frase .fr-nota { margin: clamp(16px, 3vh, 26px) 0 0; max-width: 62ch; font-size: 13px; line-height: 1.5; color: var(--tenue); }
.portada-frase .fr-ejemplo { text-decoration: underline dashed; text-underline-offset: 3px; text-decoration-color: var(--tenue); }

/* la franja de la temporada: acompaña sin competir; cada foto se descubre de abajo hacia arriba, una vez */
.portada-frase .fr-franja { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; height: clamp(140px, 23vh, 232px);
  margin: clamp(28px, 6vh, 64px) 0 0; padding: 0; list-style: none; }
.portada-frase .fr-franja li { overflow: hidden; background: var(--linea); clip-path: inset(100% 0 0 0); }
.portada-frase .fr-franja img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 50% 24%; }
.portada-frase.fr-entra .fr-franja li { animation: fr-foto 1s var(--ease) both; animation-delay: calc(var(--k) * 90ms + var(--d0)); }
.portada-frase.fr-listo .fr-franja li { clip-path: none; animation: none; }

/* el abanico: una tarjeta de papel que sube desde el dato, con sus prendas abriéndose en abanico */
.portada-frase .fr-abanico { position: absolute; z-index: 30; display: block; width: max-content; max-width: calc(100vw - 24px);
  font: 400 14px/1.35 var(--texto); letter-spacing: 0; text-align: left; white-space: normal; color: var(--tinta); }
.portada-frase .fr-abanico[hidden] { display: none; }
.portada-frase .fr-ab-caja { display: block; padding: 18px 18px 14px; background: var(--papel); border: 1px solid var(--linea);
  box-shadow: 0 28px 60px -32px var(--sombra); opacity: 0; transform: translateY(10px); transition: opacity .25s var(--ease), transform .45s var(--ease); }
.portada-frase .fr-abajo .fr-ab-caja { transform: translateY(-10px); }
.portada-frase .fr-abierto .fr-ab-caja { opacity: 1; transform: none; }
.portada-frase .fr-ab-titulo { display: block; margin: 0 2px 12px; font: 600 10.5px/1.2 var(--texto); letter-spacing: .16em; text-transform: uppercase; color: var(--tenue); }
.portada-frase .fr-cartas { display: flex; justify-content: center; gap: 10px; padding: 6px 10px 0; }
.portada-frase .fr-carta { position: relative; z-index: var(--z); display: block; width: clamp(86px, 8.2vw, 122px); color: var(--tinta);
  text-decoration: none; transform: translateY(24px) scale(.92); opacity: 0;
  transition: transform .6s var(--ease), opacity .4s var(--ease); transition-delay: calc(var(--k) * 70ms + 60ms); }
.portada-frase .fr-abierto .fr-carta { transform: translateY(var(--y)); opacity: 1; }
.portada-frase .fr-carta .fr-placa { transform-origin: 50% 90%; transition: transform .7s var(--ease); transition-delay: calc(var(--k) * 70ms + 140ms); }
.portada-frase .fr-abierto .fr-carta .fr-placa { transform: rotate(var(--r)); }
@media (hover: hover) { .portada-frase .fr-abierto .fr-carta:hover { transform: translateY(calc(var(--y) - 8px)); transition-delay: 0s; z-index: 4; } }
.portada-frase .fr-carta:focus-visible { outline: 2px solid var(--tinta); outline-offset: 3px; }
.portada-frase .fr-placa { display: block; aspect-ratio: 4 / 5; padding: 8%; background: var(--placa); border: 1px solid var(--linea);
  box-shadow: 0 16px 28px -22px var(--sombra); }
.portada-frase .fr-placa img { display: block; width: 100%; height: 100%; object-fit: contain; mix-blend-mode: multiply; }
.portada-frase .fr-pie { display: grid; gap: 1px; padding: 8px 2px 0; }
.portada-frase .fr-nombre { font-weight: 600; font-size: 12.5px; line-height: 1.25; }
.portada-frase .fr-precio { font-size: 12px; color: var(--tenue); font-variant-numeric: tabular-nums; }
.portada-frase .fr-stock { font-size: 11.5px; color: var(--ocre); }
.portada-frase .fr-ver { display: inline-flex; align-items: center; gap: 6px; margin: 14px 2px 0; min-height: 32px; font: 600 13px/1 var(--texto);
  color: var(--tinta); text-decoration: none; }
.portada-frase .fr-ver svg { width: 14px; height: 14px; transition: transform .35s var(--ease); }
@media (hover: hover) { .portada-frase .fr-ver:hover svg { transform: translateX(4px); } .portada-frase .fr-ver:hover { text-decoration: underline; text-underline-offset: 4px; } }
.portada-frase .fr-ver:focus-visible { outline: 2px solid var(--tinta); outline-offset: 3px; }
.portada-frase .fr-pie-ab { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.portada-frase .fr-pie-ab .fr-ejemplo { font-size: 11.5px; color: var(--tenue); }

/* el abanico de la tienda y el de las sedes */
.portada-frase .fr-tienda { display: grid; gap: 6px; min-width: 240px; max-width: 300px; }
.portada-frase .fr-tienda b { font: 400 24px/1.1 var(--display); }
.portada-frase .fr-tienda span { font-size: 13.5px; line-height: 1.45; color: var(--tenue); }
.portada-frase .fr-estado { color: var(--ocre); font-weight: 600; }
.portada-frase .fr-estado.fr-abierta { color: var(--verde); }
.portada-frase .fr-sedes { display: grid; min-width: 250px; margin: 0; padding: 0; list-style: none; }
.portada-frase .fr-opcion { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 2px 16px; width: 100%; min-height: 52px;
  padding: 8px 4px; font: inherit; color: var(--tinta); text-align: left; background: none; border: 0; border-top: 1px solid var(--linea); cursor: pointer; }
.portada-frase .fr-sedes li:first-child .fr-opcion { border-top: 0; }
.portada-frase .fr-opcion b { font: 400 22px/1.1 var(--display); }
.portada-frase .fr-opcion small { grid-column: 1; font-size: 12.5px; color: var(--tenue); }
.portada-frase .fr-opcion .fr-marca { grid-row: 1 / 3; grid-column: 2; width: 16px; height: 16px; color: var(--tinta); }
.portada-frase .fr-opcion:focus-visible { outline: 2px solid var(--tinta); outline-offset: 2px; }
@media (hover: hover) { .portada-frase .fr-opcion:hover b { text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 1px; } }

@keyframes fr-sube { from { opacity: 0; transform: translateY(.38em); } to { opacity: 1; transform: none; } }
@keyframes fr-subraya { from { background-size: 0% var(--g2), 0% var(--g1); } to { background-size: 0% var(--g2), 100% var(--g1); } }
@keyframes fr-foto { from { clip-path: inset(100% 0 0 0); } to { clip-path: inset(0 0 0 0); } }

@media (max-width: 760px) {
  .portada-frase { justify-content: flex-start; min-height: 0; padding-top: 36px; }
  .portada-frase .fr-frase { font-size: clamp(30px, 8.6vw, 44px); line-height: 1.2; }
  .portada-frase .fr-franja { grid-template-columns: repeat(3, minmax(0, 1fr)); height: 136px; gap: 8px; }
  .portada-frase .fr-franja li:nth-child(n + 4) { display: none; }
  .portada-frase .fr-carta { width: 84px; }
  .portada-frase .fr-cartas { gap: 8px; padding: 6px 6px 0; }
  .portada-frase .fr-ab-caja { padding: 14px 12px 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .portada-frase *, .portada-frase { animation: none !important; transition: none !important; }
  .portada-frase .fr-w { opacity: 1; transform: none; }
  .portada-frase .fr-franja li { clip-path: none; }
}`;

  const FLECHA = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  const VISTO = `<svg class="fr-marca" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const plural = (n, uno, varios) => (n === 1 ? uno : varios);

  let T = null, raiz = null, caja = null, frase = null, ab = null;
  let estado = null, abierto = null, vivo = false, ultimoPuntero = "mouse", silenciado = null;
  let tAbre = 0, tCierre = 0, tOculta = 0;
  const timers = new Set(), limpiezas = [];
  const despues = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const escuchar = (el, ev, fn, opc) => { el.addEventListener(ev, fn, opc); limpiezas.push(() => el.removeEventListener(ev, fn, opc)); };

  // ── los datos de la frase ──
  function nuevasDe(sede) {
    if (typeof T.nuevas === "function") {
      const l = (T.nuevas(sede) || []).map((x) => (typeof x === "number" ? T.P[x] : x)).filter(Boolean);
      if (l.length) return { n: l.length, muestra: l.slice(0, 3), ejemplo: true }; // las fechas de llegada de la base también son de ejemplo
    }
    const pool = T.prendas.filter((p) => p.foto).slice().sort((a, b) => b.id - a.id);
    const i = Math.max(0, SEDES.indexOf(sede));
    return { n: NUEVAS_EJEMPLO[sede] ?? 15, muestra: pool.slice(i * 3, i * 3 + 3), ejemplo: true };
  }
  function fraseTienda(a) {
    const t = String(a?.texto || "").replace(/^\s*(abierta|cerrada)\s*[·:,–-]\s*/i, "").trim();
    const hora = (t.match(/(\d{1,2}(?::\d{2})?\s*[ap]\.\s*m\.)/i) || [])[1];
    const art = (h) => (/^1(\D|$)/.test(h) ? "la" : "las");
    const junta = (x) => x.replace(/(\d)\s+([ap])\.\s*m\./gi, "$1\u00a0$2.\u00a0m.");
    if (a?.abierta) return hora ? junta(`abierta hasta ${art(hora)} ${hora}`) : "abierta ahora";
    const abre = t.match(/abre\s+(.+)$/i);
    return abre ? junta(`que abre ${abre[1]}`) : "cerrada por ahora";
  }
  function datos() {
    const sede = T.sede();
    const nv = nuevasDe(sede);
    const rango = (p) => (T.claseStock(p) === "ultima" ? 0 : 1);
    const acaban = T.prendas.filter((p) => { const c = T.claseStock(p); return c === "pocas" || c === "ultima"; })
      .sort((a, b) => rango(a) - rango(b) || a.id - b.id);
    const a = T.abierta(sede) || {};
    return { sede, nuevas: nv.n, muestraNuevas: nv.muestra, nuevasEjemplo: nv.ejemplo, acaban: acaban.length, muestraAcaban: acaban.slice(0, 3),
      tienda: fraseTienda(a), abierta: !!a.abierta, estadoTexto: a.texto || "" };
  }

  // ── la frase: cada palabra es un span (para entrar de a una); cada dato, un enlace ──
  function construir(d) {
    let i = 0;
    const w = (txt) => txt.split(" ").map((x) => `<span class="fr-w" style="--w:${i++}">${esc(x)}</span>`).join(" ");
    const num = (n, clave) => `<span class="fr-w fr-num" data-num="${clave}" data-cuenta="${n}" data-pref="" data-dec="0" style="--w:${i++}">${n}</span>`;
    const fin = () => `--d:${(i - 1) * 55 + 520}ms`;
    let h = `${w("Hoy en")} `;
    h += `<button type="button" class="fr-dato fr-sede" data-dato="sede" aria-haspopup="true" aria-expanded="false" aria-label="Tienda: ${esc(d.sede)}. Cambiar de tienda">`
      + `<span class="fr-parte" data-parte="sede">${w(d.sede)}</span>&#8288;<svg class="fr-flecha" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`;
    h = h.replace(`data-dato="sede"`, `data-dato="sede" style="${fin()}"`) + `</button> `;
    h += `${w("te esperan")} `;
    let a = `<a class="fr-dato" data-dato="nuevas" href="#nuevo">${num(d.nuevas, "nuevas")} <span class="fr-parte" data-parte="nuevas">${w(plural(d.nuevas, "prenda nueva", "prendas nuevas"))}</span></a>`;
    h += a.replace(`data-dato="nuevas"`, `data-dato="nuevas" style="${fin()}"`) + `&#8288;<span class="fr-w" style="--w:${i++}">,</span> `;
    if (d.acaban > 0) {
      a = `<a class="fr-dato" data-dato="acaban" href="#catalogo">${num(d.acaban, "acaban")} <span class="fr-parte" data-parte="acaban">${w(plural(d.acaban, "que se está acabando", "que se están acabando"))}</span></a>`;
      h += a.replace(`data-dato="acaban"`, `data-dato="acaban" style="${fin()}"`) + " ";
    } else {
      h += `<span class="fr-parte" data-parte="acaban">${w("ninguna por acabarse")}</span> `;
    }
    h += `${w("y una tienda")} `;
    a = `<a class="fr-dato" data-dato="tienda" href="#inicio-tiendas"><span class="fr-parte" data-parte="tienda">${w(d.tienda)}</span></a>`;
    h += a.replace(`data-dato="tienda"`, `data-dato="tienda" style="${fin()}"`) + `&#8288;<span class="fr-w fr-punto" style="--w:${i++}"${/\.$/.test(d.tienda) ? " hidden" : ""}>.</span>`;
    return { html: h, palabras: i };
  }

  function hoyEnLima() {
    try {
      const t = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", weekday: "long", day: "numeric", month: "long" }).format(new Date()).replace(",", "");
      return t.charAt(0).toUpperCase() + t.slice(1);
    } catch { return "Hoy"; }
  }

  function notaHtml(d) {
    const nuevas = d.nuevasEjemplo ? `Las prendas nuevas y su número son <span class="fr-ejemplo">de ejemplo</span>; lo` : "Lo";
    return `${nuevas} que se acaba sale del stock que mostraba cada prenda el 31 de octubre, y el horario es el real de la tienda.`;
  }

  // ── montar ──
  function montar(r, tienda) {
    T = tienda; raiz = r; vivo = true;
    if (!document.getElementById("estilo-frase")) {
      const s = document.createElement("style"); s.id = "estilo-frase"; s.textContent = CSS; document.head.appendChild(s);
    }
    estado = { d: datos() };
    const f = construir(estado.d);
    const d0 = f.palabras * 40 + 300;
    raiz.innerHTML = `<div class="portada-frase" style="--d0:${d0}ms">
      <div class="fr-cuerpo">
        <p class="fr-rotulo"><span>${esc(hoyEnLima())}</span><span aria-hidden="true">·</span><span class="fr-pista">Toca lo subrayado</span></p>
        <p class="fr-frase">${f.html}</p>
        <p class="fr-nota">${notaHtml(estado.d)}</p>
      </div>
      <ul class="fr-franja" aria-label="Fotos de la temporada">${FRANJA.map(([fo, alt], k) => `<li style="--k:${k}"><img src="${T.foto(fo)}" alt="${esc(alt)}" loading="${k < 3 ? "eager" : "lazy"}"></li>`).join("")}</ul>
      <span class="fr-abanico" hidden></span>
    </div>`;
    caja = raiz.querySelector(".portada-frase");
    frase = caja.querySelector(".fr-frase");
    ab = caja.querySelector(".fr-abanico");

    // la entrada corre una vez, cuando la portada se ve
    if (T.reducido) caja.classList.add("fr-listo");
    else {
      const io = new IntersectionObserver((es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        caja.classList.add("fr-entra");
        caja.querySelectorAll(".fr-num").forEach((n) => despues(() => T.contar?.(n), parseFloat(n.style.getPropertyValue("--w")) * 55 + 160));
        despues(() => { caja.classList.remove("fr-entra"); caja.classList.add("fr-listo"); }, d0 + 6 * 90 + 1100);
      }, { threshold: 0.15 });
      io.observe(caja);
      limpiezas.push(() => io.disconnect());
    }

    escuchar(document, "pointerdown", (e) => {
      ultimoPuntero = e.pointerType || "mouse";
      if (abierto && !e.target.closest?.(".fr-abanico, .fr-dato")) cerrar();
    }, true);
    escuchar(caja, "pointerover", (e) => {
      if (e.pointerType !== "mouse") return;
      const d = e.target.closest(".fr-dato");
      if (d && d.dataset.dato === "sede") { clearTimeout(tAbre); if (abierto?.link === d) clearTimeout(tCierre); else programarCierre(); }
      else if (d) {
        clearTimeout(tCierre);
        if (abierto?.link === d) return;
        clearTimeout(tAbre);
        const punto = { x: e.clientX, y: e.clientY };
        tAbre = despues(() => abrir(d.dataset.dato, d, punto), abierto ? 0 : 80);
      } else if (e.target.closest(".fr-abanico")) clearTimeout(tCierre);
      else { clearTimeout(tAbre); programarCierre(); }
    });
    escuchar(caja, "pointerleave", (e) => { if (e.pointerType === "mouse") { clearTimeout(tAbre); programarCierre(); } });
    escuchar(caja, "click", alClic);
    escuchar(caja, "focusin", (e) => {
      const d = e.target.closest?.(".fr-dato");
      // el foco del teclado abre el abanico del dato (la sede se abre con Enter); tras un Escape, el foco que vuelve no lo reabre
      if (d === silenciado) { silenciado = null; return; }
      if (d && d.dataset.dato !== "sede" && d.matches(":focus-visible") && abierto?.link !== d) abrir(d.dataset.dato, d);
    });
    escuchar(caja, "focusout", (e) => {
      if (!abierto) return;
      const a = e.relatedTarget;
      if (a && (abierto.link.contains(a) || ab.contains(a))) return;
      despues(() => { const f = document.activeElement; if (abierto && !abierto.link.contains(f) && !ab.contains(f)) cerrar(); }, 0);
    });
    escuchar(document, "keydown", (e) => {
      if (e.key !== "Escape" || !abierto) return;
      const l = abierto.link; cerrar(); silenciado = l; l.focus({ preventScroll: true });
      e.stopPropagation();
    });
    escuchar(window, "resize", () => cerrar(true));
    if (typeof T.alCambiarSede === "function") {
      const quitar = T.alCambiarSede(alCambiarSede);
      if (typeof quitar === "function") limpiezas.push(quitar);
    }
  }

  function desmontar() {
    vivo = false;
    clearTimeout(tAbre); clearTimeout(tCierre); clearTimeout(tOculta);
    timers.forEach(clearTimeout); timers.clear();
    limpiezas.splice(0).forEach((f) => f());
    abierto = null; caja = frase = ab = null;
  }

  // ── tocar un dato ──
  function navegar(tipo) {
    cerrar(true);
    if (tipo === "nuevas") T.ir("nuevo");
    else if (tipo === "acaban") T.ir("catalogo", { filtro: "pocas" });
    else if (tipo === "tienda") T.ir("inicio", { ancla: "inicio-tiendas" });
  }
  function alClic(e) {
    const carta = e.target.closest(".fr-carta");
    if (carta) { e.preventDefault(); cerrar(true); T.ir("ficha", { id: +carta.dataset.id }); return; }
    const ver = e.target.closest(".fr-ver");
    if (ver) { e.preventDefault(); navegar(ver.dataset.va); return; }
    const op = e.target.closest(".fr-opcion");
    if (op) {
      e.preventDefault();
      const nombre = op.dataset.sede;
      cerrar(); silenciado = frase.querySelector(".fr-sede"); silenciado?.focus({ preventScroll: true });
      if (nombre !== T.sede()) {
        T.cambiarSede(nombre);
        // si la base no avisara a quien llamó, la frase igual se reescribe
        despues(() => { if (vivo && estado.d.sede !== T.sede()) alCambiarSede(T.sede()); }, 30);
      }
      return;
    }
    const d = e.target.closest(".fr-dato");
    if (!d) return;
    e.preventDefault();
    if (d.dataset.dato === "sede") { abierto?.link === d ? cerrar() : abrir("sede", d); return; }
    // en táctil, el primer toque muestra el abanico y el segundo lleva; con mouse o teclado, lleva de una
    const tactil = e.detail !== 0 && ultimoPuntero !== "mouse";
    if (tactil && abierto?.link !== d) { abrir(d.dataset.dato, d); return; }
    navegar(d.dataset.dato);
  }

  // ── el abanico ──
  function cartas(lista, conStock, etiqueta) {
    const giros = lista.length === 3 ? [[-5, 8], [0, 0], [5, 8]] : lista.length === 2 ? [[-3, 4], [3, 4]] : [[0, 0]];
    return `<span class="fr-cartas" role="list" aria-label="${esc(etiqueta)}">${lista.map((p, k) => {
      const [r, y] = giros[k];
      return `<a class="fr-carta" role="listitem" href="#ficha" data-id="${p.id}" style="--k:${k};--r:${r}deg;--y:${y}px;--z:${k === 1 ? 3 : 2 - (k > 1 ? 1 : 0)}">`
        + `<span class="fr-placa"><img src="${esc(p.foto)}" alt=""></span>`
        + `<span class="fr-pie"><span class="fr-nombre">${esc(p.nombre)}</span><span class="fr-precio">${T.sol(p.precio)}</span>`
        + `${conStock ? `<span class="fr-stock">${esc(T.stockTexto(p))}</span>` : ""}</span></a>`;
    }).join("")}</span>`;
  }
  const ver = (texto, va, extra = "") => `<span class="fr-pie-ab"><a class="fr-ver" href="#" data-va="${va}">${esc(texto)} ${FLECHA}</a>${extra}</span>`;
  function contenido(tipo) {
    const d = estado.d;
    if (tipo === "nuevas") {
      return `<span class="fr-ab-titulo">Llegaron a ${esc(d.sede)}</span>${cartas(d.muestraNuevas, false, "Tres de las prendas nuevas")}`
        + ver(d.nuevas === 1 ? "Ver la nueva" : `Ver las ${d.nuevas} nuevas`, "nuevas", d.nuevasEjemplo ? `<span class="fr-ejemplo">de ejemplo</span>` : "");
    }
    if (tipo === "acaban") {
      return `<span class="fr-ab-titulo">Quedan pocas en ${esc(d.sede)}</span>${cartas(d.muestraAcaban, true, "Tres de las prendas que se acaban")}`
        + ver(d.acaban === 1 ? "Ver la que se acaba" : `Ver las ${d.acaban} que se acaban`, "acaban");
    }
    if (tipo === "tienda") {
      const t = (T.tiendas || []).find((x) => x.nombre === d.sede) || { nombre: d.sede, direccion: "", horario: "" };
      return `<span class="fr-tienda"><b>CAYLA ${esc(t.nombre)}</b>${t.direccion ? `<span>${esc(t.direccion)}</span>` : ""}`
        + `${t.horario ? `<span>${esc(t.horario)}</span>` : ""}<span class="fr-estado${d.abierta ? " fr-abierta" : ""}">${esc(d.estadoTexto)}</span></span>`
        + ver("Ver las tres tiendas", "tienda");
    }
    // sede: las tres tiendas, cada una con su estado de ahora
    return `<span class="fr-ab-titulo">Elige tu tienda</span><ul class="fr-sedes">${SEDES.map((s) => {
      const a = T.abierta(s) || {};
      const es = s === d.sede;
      return `<li><button type="button" class="fr-opcion" data-sede="${s}" aria-current="${es}"><b>${s}</b><small>${esc(a.texto || "")}</small>${es ? VISTO : ""}</button></li>`;
    }).join("")}</ul>`;
  }
  function abrir(tipo, link, punto) {
    if (!vivo || !ab) return;
    clearTimeout(tCierre); clearTimeout(tOculta);
    if (abierto?.link === link) return;
    if (abierto) cerrar(true);
    ab.innerHTML = `<span class="fr-ab-caja">${contenido(tipo)}</span>`;
    ab.dataset.tipo = tipo;
    ab.classList.remove("fr-abierto", "fr-abajo");
    ab.hidden = false;
    link.after(ab); // queda en el DOM junto a su dato: con Tab se llega a sus prendas
    posicionar(link, punto);
    link.classList.add("fr-activo");
    if (tipo === "sede") link.setAttribute("aria-expanded", "true");
    abierto = { tipo, link };
    void ab.offsetWidth;
    ab.classList.add("fr-abierto");
  }
  function posicionar(link, punto) {
    const rc = caja.getBoundingClientRect();
    const tramos = [...link.getClientRects()].filter((x) => x.width > 2);
    const r = (punto && tramos.find((x) => punto.y >= x.top - 4 && punto.y <= x.bottom + 4)) || tramos[0] || link.getBoundingClientRect();
    const w = ab.offsetWidth, h = ab.offsetHeight, m = 12;
    const vw = document.documentElement.clientWidth;
    const cab = parseFloat(getComputedStyle(caja).getPropertyValue("--cab")) || 72;
    let left = Math.max(m, Math.min(r.left + r.width / 2 - w / 2, vw - w - m));
    const arriba = r.top - h - 14 > cab + 8;
    const top = arriba ? r.top - h - 14 : r.bottom + 14;
    ab.style.left = `${left - rc.left}px`;
    ab.style.top = `${top - rc.top}px`;
    ab.classList.toggle("fr-abajo", !arriba);
  }
  function programarCierre() { clearTimeout(tCierre); if (abierto) tCierre = despues(() => cerrar(), 260); }
  function cerrar(inmediato) {
    clearTimeout(tCierre);
    if (!abierto || !ab) return;
    abierto.link.classList.remove("fr-activo");
    if (abierto.tipo === "sede") abierto.link.setAttribute("aria-expanded", "false");
    abierto = null;
    ab.classList.remove("fr-abierto");
    if (inmediato || T.reducido) { ab.hidden = true; return; }
    clearTimeout(tOculta);
    tOculta = despues(() => { if (!abierto && ab) ab.hidden = true; }, 240);
  }

  // ── cambiar de tienda: los números ruedan y las palabras cambian con un fundido ──
  function cambiarParte(clave, texto) {
    const el = frase.querySelector(`[data-parte="${clave}"]`);
    if (!el) return;
    const html = texto.split(" ").map((x) => `<span class="fr-w">${esc(x)}</span>`).join(" ");
    if (el.textContent.replace(/\s+/g, " ").trim() === texto.replace(/\s+/g, " ")) return;
    if (T.reducido) { el.innerHTML = html; return; }
    el.classList.add("fr-sale");
    despues(() => { el.innerHTML = html; el.classList.remove("fr-sale"); }, 210);
  }
  function rodar(clave, nuevo) {
    const el = frase.querySelector(`[data-num="${clave}"]`);
    if (!el) return;
    const viejo = el.textContent.trim();
    el.dataset.cuenta = nuevo;
    if (String(nuevo) === viejo || T.reducido) { el.textContent = nuevo; return; }
    el.innerHTML = `<span class="fr-n-viejo">${esc(viejo)}</span><span class="fr-n-nuevo">${nuevo}</span>`;
    el.classList.add("fr-rodando");
    void el.offsetWidth;
    el.classList.add("fr-rodar");
    despues(() => { el.textContent = nuevo; el.classList.remove("fr-rodando", "fr-rodar"); }, 760);
  }
  function alCambiarSede() {
    if (!vivo || !frase) return;
    const nd = datos();
    const viejo = estado.d;
    if (nd.sede === viejo.sede && nd.acaban === viejo.acaban && nd.tienda === viejo.tienda) return;
    cerrar(true);
    estado.d = nd;
    const sede = frase.querySelector(".fr-sede");
    sede?.setAttribute("aria-label", `Tienda: ${nd.sede}. Cambiar de tienda`);
    if ((nd.acaban > 0) !== (viejo.acaban > 0)) {
      // cambia la forma de la frase (aparece o se va «que se están acabando»): se rehace entera con un fundido
      const f = construir(nd);
      const poner = () => { frase.innerHTML = f.html; frase.style.opacity = ""; };
      if (T.reducido) poner(); else { frase.style.transition = "opacity .2s"; frase.style.opacity = "0"; despues(poner, 210); }
    } else {
      cambiarParte("sede", nd.sede);
      rodar("nuevas", nd.nuevas);
      cambiarParte("nuevas", plural(nd.nuevas, "prenda nueva", "prendas nuevas"));
      if (nd.acaban > 0) { rodar("acaban", nd.acaban); cambiarParte("acaban", plural(nd.acaban, "que se está acabando", "que se están acabando")); }
      cambiarParte("tienda", nd.tienda);
      const punto = frase.querySelector(".fr-punto");
      if (punto) despues(() => { punto.hidden = /\.$/.test(nd.tienda); }, T.reducido ? 0 : 210);
    }
    const nota = caja.querySelector(".fr-nota");
    if (nota) nota.innerHTML = notaHtml(nd);
  }

  window.PORTADAS = window.PORTADAS || {};
  window.PORTADAS.frase = { nombre: "Frase", montar, desmontar };
})();
