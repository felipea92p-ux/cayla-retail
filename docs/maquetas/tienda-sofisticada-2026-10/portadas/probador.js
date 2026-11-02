// ── Portada «Probador» de la maqueta I (2026-10-31) ──
// El inicio no es una foto con un botón: es un probador. La persona arma un look con prendas reales del ERP (tres filas que se
// deslizan: arriba, abajo y complemento; o vestido y complemento), ve cuánto suma y si está en su tienda, y lo separa completo
// de un toque. Contrato con la base: window.TIENDA (scratchpad/portadas-contrato.md). Movimiento: una vez, sin rebote, sin bucle.
(() => {
  const CLAVE = "probador";

  const FILAS = [
    { clave: "arriba", nombre: "Arriba", cats: ["tops", "casacas"], modo: "separado", r: 0 },
    { clave: "abajo", nombre: "Abajo", cats: ["pantalones"], modo: "separado", r: 1 },
    { clave: "vestido", nombre: "Vestido o conjunto", cats: ["vestidos"], modo: "vestido", r: 0 },
    { clave: "complemento", nombre: "Complemento", cats: ["accesorios"], modo: "ambos", r: 2 },
  ];
  // el look con el que abre: blusa satinada, jean y cartera (las tres hay en Arequipa)
  const INICIAL = { arriba: 96, abajo: 25, vestido: 161, complemento: 68 };
  const FILA_DE_CAT = { tops: "arriba", casacas: "arriba", pantalones: "abajo", vestidos: "vestido", accesorios: "complemento" };

  // dónde va cada prenda según su distancia a la del centro (en anchos de prenda), su tamaño y cuánto se ve
  const X = [0, 1.12, 1.95, 2.6, 3.1];
  const S = [1, 0.62, 0.42, 0.3, 0.24];
  const O = [1, 0.5, 0.2, 0, 0];
  const interp = (t, a) => { const i = Math.min(Math.floor(a), t.length - 2); const f = Math.min(a - i, 1); return t[i] + (t[i + 1] - t[i]) * f; };
  const mod = (a, n) => ((a % n) + n) % n;
  const circ = (x, n) => mod(x + n / 2, n) - n / 2; // distancia con signo dando la vuelta
  const dos = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const CURVA = "cubic-bezier(.2,.7,.2,1)";

  const CHEV = (d) => `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const MEZCLAR = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4.5h2.6c1.4 0 2.3.6 3.1 1.8l1.6 3.4c.8 1.2 1.7 1.8 3.1 1.8h2.6M12.5 9.5l2 2-2 2M1.5 11.5h2.6c.9 0 1.6-.3 2.2-.8M14.5 4.5h-2.6c-.9 0-1.6.3-2.2.8M12.5 2.5l2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const CSS = `
.portada-probador { --pp-alto: clamp(500px, calc(100svh - var(--cab) - 120px), 800px); position: relative; display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); grid-template-areas: "lado mesa"; column-gap: clamp(32px, 5vw, 88px);
  align-items: center; padding: 36px var(--g); min-height: calc(100svh - var(--cab) - 40px); background: var(--fondo); color: var(--tinta);
  font-family: var(--texto); overflow-x: clip; box-sizing: border-box; }
.portada-probador *, .portada-probador *::before, .portada-probador *::after { box-sizing: border-box; }
.pp-lado { grid-area: lado; display: grid; gap: 20px; align-content: center; min-width: 0; }
.pp-intro { display: grid; gap: 16px; }
.pp-rotulo { font: 600 11px/1.2 var(--texto); letter-spacing: .2em; text-transform: uppercase; color: var(--tenue); }
.pp-titulo { margin: 0; font: 400 clamp(36px, 3.5vw, 56px)/1.06 var(--display); letter-spacing: -.005em; color: var(--tinta); }
.pp-linea { display: block; overflow: hidden; padding-bottom: .08em; margin-bottom: -.08em; }
.pp-linea > span { display: inline-block; }
.pp-bajada { margin: 0; max-width: 44ch; font-size: 16px; line-height: 1.6; color: var(--tenue); }
.pp-bajada b { color: var(--tinta); font-weight: 600; }

.pp-lista { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--linea); }
.pp-item { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--linea); }
.pp-item > * { transition: opacity .22s var(--ease), transform .35s var(--ease); }
.pp-item.cambia > * { opacity: 0; transform: translateY(6px); }
.pp-mini { display: block; width: 40px; aspect-ratio: 4 / 5; background: var(--placa); }
.pp-mini img { display: block; width: 100%; height: 100%; object-fit: contain; mix-blend-mode: multiply; }
.pp-item-texto { min-width: 0; }
.pp-item small { display: block; margin-bottom: 4px; font: 600 10px/1 var(--texto); letter-spacing: .18em; text-transform: uppercase; color: var(--tenue); }
.pp-nombre { font: 400 18px/1.2 var(--display); color: var(--tinta); text-decoration: none;
  background: linear-gradient(currentColor, currentColor) 0 100% / 0 1px no-repeat; transition: background-size .5s var(--ease); }
.pp-nombre:focus-visible { outline: 2px solid var(--acento); outline-offset: 2px; }
.pp-stock { display: block; margin-top: 3px; font-size: 13px; color: var(--tenue); }
.pp-stock.hay { color: var(--verde); }
.pp-stock.pocas, .pp-stock.ultima { color: var(--ocre); }
.pp-precio { font-size: 15px; font-variant-numeric: tabular-nums; white-space: nowrap; }

.pp-cierre { display: grid; gap: 14px; }
.pp-total { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.pp-total > span { font-size: 14px; color: var(--tenue); }
.pp-odometro { display: inline-flex; align-items: flex-start; font: 400 clamp(30px, 2.6vw, 40px)/1.15 var(--display); font-variant-numeric: tabular-nums; }
.pp-sol, .pp-punto { display: inline-block; height: 1.15em; line-height: 1.15em; white-space: pre; }
.pp-dig { display: inline-block; width: 1.04ch; height: 1.15em; clip-path: inset(0 -.3em); } /* corta solo arriba y abajo: un 0 ancho no se recorta */
.pp-col { display: block; transition: transform .75s var(--ease); }
.pp-col span { display: block; height: 1.15em; line-height: 1.15em; text-align: center; }
.pp-acciones { display: flex; gap: 10px; }
.pp-btn { appearance: none; display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 52px; padding: 0 24px;
  border: 1px solid var(--tinta); background: transparent; color: var(--tinta); font: 600 12px/1 var(--texto); letter-spacing: .16em;
  text-transform: uppercase; cursor: pointer; transition: transform .35s var(--ease), box-shadow .35s var(--ease), opacity .3s; }
.pp-btn-primario { flex: 1 1 auto; background: var(--tinta); color: var(--fondo); }
.pp-btn:focus-visible, .pp-chip:focus-visible, .pp-flecha:focus-visible, .pp-interruptor:focus-visible { outline: 2px solid var(--acento); outline-offset: 3px; }
.pp-btn[aria-disabled="true"] { opacity: .5; cursor: default; }
.pp-letra { margin: 0; font-size: 13px; color: var(--tenue); }
@media (min-width: 861px) { .pp-letra { display: none; } } /* en escritorio lo dice la franja de arriba de la tienda */

.pp-casa { display: grid; gap: 10px; }
.pp-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.pp-chip { display: inline-flex; align-items: center; gap: 10px; padding: 4px 16px 4px 4px; border: 1px solid var(--linea); border-radius: 999px;
  background: transparent; color: var(--tinta); font: 400 14px/1 var(--texto); white-space: nowrap; cursor: pointer;
  transition: border-color .3s var(--ease), background-color .3s var(--ease); }
.pp-chip img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
.pp-chip[aria-pressed="true"] { border-color: var(--tinta); background: var(--papel); }

.pp-mesa-caja { grid-area: mesa; position: relative; min-width: 0; }
.pp-mesa { --pp-tinta: var(--tinta); --pp-tenue: var(--tenue); --pp-linea: var(--linea); position: relative; height: var(--pp-alto); display: grid;
  grid-template-rows: auto minmax(0, 1fr); background: var(--placa); border: 1px solid var(--linea); color: var(--pp-tinta); }
/* en oscuro la mesa sigue clara (la placa es dato de la prenda): su texto toma el oscuro del fondo */
:root[data-tema="oscuro"] .portada-probador .pp-mesa { --pp-tinta: var(--fondo); --pp-tenue: color-mix(in srgb, var(--fondo) 68%, var(--placa));
  --pp-linea: color-mix(in srgb, var(--fondo) 14%, var(--placa)); }
.pp-mesa .pp-rotulo { color: var(--pp-tenue); }
.pp-mesa-cab { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid var(--pp-linea); }
.pp-filas { display: grid; grid-template-rows: 1fr 1fr 0fr 1fr; min-height: 0; transition: grid-template-rows .8s var(--ease); }
.portada-probador[data-modo="vestido"] .pp-filas { grid-template-rows: 0fr 0fr 2fr 1fr; }
.pp-fila { position: relative; min-height: 0; overflow: hidden; touch-action: pan-y; user-select: none; -webkit-user-select: none; outline: none; transition: opacity .5s var(--ease); }
.pp-fila + .pp-fila::before { content: ""; position: absolute; left: 20px; right: 20px; top: 0; height: 1px; background: var(--pp-linea); z-index: 7; }
.portada-probador[data-modo="vestido"] .pp-fila[data-fila="vestido"]::before { display: none; }
.portada-probador[data-modo="vestido"] .pp-fila[data-fila="arriba"], .portada-probador[data-modo="vestido"] .pp-fila[data-fila="abajo"],
.portada-probador[data-modo="separado"] .pp-fila[data-fila="vestido"] { opacity: 0; }
.pp-fila:focus-visible::after { content: ""; position: absolute; inset: 3px; border: 2px solid var(--acento); pointer-events: none; z-index: 9; }
.pp-pista { position: absolute; inset: 0; }
.pp-pieza { position: absolute; left: 50%; top: 50%; height: min(84%, 330px); aspect-ratio: 4 / 5; margin: 0; background: var(--placa); will-change: transform, opacity; }
.pp-pieza:not(.centro) { cursor: pointer; }
.pp-pieza img { display: block; width: 100%; height: 100%; object-fit: contain; mix-blend-mode: multiply; pointer-events: none; -webkit-user-drag: none; }
.pp-fila-rotulo { position: absolute; left: 20px; top: 13px; z-index: 12; font: 600 10.5px/1 var(--texto); letter-spacing: .18em; text-transform: uppercase; color: var(--pp-tenue); pointer-events: none; }
.pp-fila-rotulo i { margin-left: 8px; font-style: normal; font-variant-numeric: tabular-nums; letter-spacing: .08em; }
.pp-flecha { position: absolute; top: 50%; z-index: 8; width: 40px; height: 40px; margin-top: -20px; padding: 0; display: grid; place-items: center;
  border: 1px solid var(--pp-linea); border-radius: 50%; background: var(--placa); color: var(--pp-tinta); cursor: pointer;
  transition: border-color .3s var(--ease), transform .35s var(--ease); }
.pp-ant { left: 14px; }
.pp-sig { right: 14px; }
.pp-aviso { position: absolute; left: 50%; bottom: 8px; z-index: 12; transform: translateX(-50%); padding: 5px 12px; border: 1px solid var(--pp-linea);
  border-radius: 999px; background: var(--placa); color: var(--pp-tenue); font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity .4s var(--ease); }
.pp-fila.sin-stock .pp-aviso { opacity: 1; }

.pp-interruptor { display: inline-flex; align-items: center; gap: 10px; padding: 4px 0; border: 0; background: none; color: var(--pp-tinta); font: 500 13px/1 var(--texto); cursor: pointer; }
.pp-int-pista { position: relative; width: 34px; height: 20px; border: 1px solid var(--pp-tenue); border-radius: 999px; transition: background-color .3s var(--ease), border-color .3s var(--ease); }
.pp-int-perilla { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--pp-tenue); transition: transform .4s var(--ease), background-color .3s var(--ease); }
.pp-interruptor[aria-checked="true"] .pp-int-pista { background: var(--pp-tinta); border-color: var(--pp-tinta); }
.pp-interruptor[aria-checked="true"] .pp-int-perilla { transform: translateX(14px); background: var(--placa); }

/* «así se ve puesto»: la foto de campaña asoma cuando el look armado es uno de la casa */
.pp-puesto { position: absolute; right: -22px; bottom: -22px; z-index: 12; width: 132px; margin: 0; padding: 6px 6px 8px; background: var(--papel);
  border: 1px solid var(--linea); box-shadow: 0 24px 40px -26px var(--sombra); clip-path: circle(0% at 50% 50%); pointer-events: none;
  transition: clip-path .8s var(--ease); }
.pp-puesto.visible { clip-path: circle(80% at 50% 50%); }
.pp-puesto img { display: block; width: 100%; aspect-ratio: 3 / 4; object-fit: cover; }
.pp-puesto figcaption { padding-top: 7px; text-align: center; font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--tenue); }

@media (hover: hover) {
  .pp-btn:not([aria-disabled="true"]):hover { transform: translateY(-2px); box-shadow: 0 14px 24px -18px var(--sombra); }
  .pp-chip:hover { border-color: var(--tinta); }
  .pp-flecha:hover { border-color: var(--pp-tinta); }
  .pp-ant:hover { transform: translateX(-2px); }
  .pp-sig:hover { transform: translateX(2px); }
  .pp-nombre:hover { background-size: 100% 1px; }
}

/* entrada: el título sube línea por línea y las tres prendas llegan una a una y se asientan (una vez) */
.portada-probador.pp-entrando .pp-linea > span { transform: translateY(108%); }
.portada-probador.pp-entro .pp-linea > span { transform: none; transition: transform 1.05s var(--ease) calc(var(--l) * 130ms + 120ms); }
.portada-probador.pp-entrando :is(.pp-intro > .pp-rotulo, .pp-bajada, .pp-lista, .pp-cierre, .pp-casa, .pp-mesa-cab, .pp-flecha, .pp-fila-rotulo) { opacity: 0; transform: translateY(12px); }
.portada-probador.pp-entro :is(.pp-intro > .pp-rotulo, .pp-bajada, .pp-lista, .pp-cierre, .pp-casa, .pp-mesa-cab, .pp-flecha, .pp-fila-rotulo) {
  opacity: 1; transform: none; transition: opacity .8s var(--ease) var(--d, 0ms), transform .9s var(--ease) var(--d, 0ms); }
.portada-probador .pp-bajada { --d: 420ms; }
.portada-probador .pp-lista { --d: 1500ms; }
.portada-probador .pp-cierre { --d: 1650ms; }
.portada-probador .pp-casa { --d: 1800ms; }
.portada-probador :is(.pp-mesa-cab, .pp-flecha, .pp-fila-rotulo) { --d: 1350ms; }
.portada-probador.pp-entrando .pp-mesa { opacity: 0; transform: translateY(18px); }
.portada-probador.pp-entro .pp-mesa { opacity: 1; transform: none; transition: opacity .9s var(--ease) .2s, transform 1.1s var(--ease) .2s; }
.portada-probador.pp-entrando .pp-pieza img { opacity: 0; transform: translateY(-46px) rotate(-3deg); }
.portada-probador.pp-entro .pp-pieza img { opacity: 1; transform: none; transition: opacity .6s var(--ease) 1.5s, transform .9s var(--ease) 1.5s; }
.portada-probador.pp-entro .pp-pieza.centro img { transition: opacity .7s var(--ease) calc(var(--r) * 200ms + 650ms), transform 1s var(--ease) calc(var(--r) * 200ms + 650ms); }

@media (max-width: 860px) {
  .portada-probador { --pp-alto: 468px; grid-template-columns: minmax(0, 1fr); grid-template-areas: "intro" "mesa" "cierre" "lista" "casa";
    row-gap: 22px; padding: 28px var(--g) 40px; min-height: 0; align-items: start; }
  .pp-lado { display: contents; }
  .pp-intro { grid-area: intro; }
  .pp-lista { grid-area: lista; }
  .pp-cierre { grid-area: cierre; padding: 14px 16px 16px; background: var(--papel); border: 1px solid var(--linea); }
  .pp-casa { grid-area: casa; }
  .pp-titulo { font-size: clamp(32px, 8.6vw, 40px); }
  .pp-bajada { font-size: 15px; }
  .pp-mesa-cab { padding: 10px 12px; }
  .pp-fila-rotulo { left: 12px; top: 10px; }
  .pp-pieza { top: calc(50% + 9px); height: min(74%, 330px); }
  .pp-fila + .pp-fila::before { left: 12px; right: 12px; }
  .pp-flecha { width: 36px; height: 36px; margin-top: -18px; }
  .pp-ant { left: 6px; }
  .pp-sig { right: 6px; }
  .pp-btn { min-height: 48px; padding: 0 16px; }
  .pp-letra { font-size: 12.5px; }
  .pp-chips { flex-wrap: nowrap; overflow-x: auto; margin-inline: calc(-1 * var(--g)); padding-inline: var(--g); scrollbar-width: none; }
  .pp-chips::-webkit-scrollbar { display: none; }
  .pp-puesto { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .portada-probador *, .portada-probador *::before, .portada-probador *::after { transition: none !important; }
}
`;

  let vivo = null;

  function montar(raiz, T) {
    if (!document.getElementById("estilo-" + CLAVE)) {
      const s = document.createElement("style");
      s.id = "estilo-" + CLAVE;
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    const reducido = !!T.reducido || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers = new Set();
    const limpiezas = [];
    const espera = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); limpiezas.push(() => el.removeEventListener(ev, fn, opt)); };
    const P = T.P;
    let modo = "separado";

    // ── las filas: prendas reales del ERP por categoría ──
    const filas = {};
    for (const def of FILAS) {
      let ids = T.prendas.filter((p) => def.cats.includes(p.cat)).map((p) => p.id);
      if (def.clave === "arriba") {
        // intercala una casaca cada tres tops para que al girar se vea de todo
        const tops = ids.filter((id) => P[id].cat === "tops");
        const casacas = ids.filter((id) => P[id].cat === "casacas");
        ids = [];
        tops.forEach((id, k) => { ids.push(id); if (k % 3 === 2 && casacas.length) ids.push(casacas.shift()); });
        ids.push(...casacas);
      }
      const i = Math.max(0, ids.indexOf(INICIAL[def.clave]));
      filas[def.clave] = { ...def, ids, n: ids.length, i, pos: i, token: 0, el: null, piezas: [], ultD: [], arrastro: 0 };
    }
    const actual = (f) => P[f.ids[f.i]];
    const filasActivas = () => (modo === "vestido" ? [filas.vestido, filas.complemento] : [filas.arriba, filas.abajo, filas.complemento]);

    const filaHtml = (f) => `
      <div class="pp-fila" data-fila="${f.clave}" style="--r:${f.r}" tabindex="0" role="group" aria-roledescription="carrusel">
        <span class="pp-fila-rotulo" aria-hidden="true">${f.nombre}<i></i></span>
        <button type="button" class="pp-flecha pp-ant" data-paso="-1" aria-label="${f.nombre}: prenda anterior">${CHEV("M10 3 5 8l5 5")}</button>
        <div class="pp-pista">${f.ids.map((id, k) => `<figure class="pp-pieza" data-k="${k}" aria-hidden="true"><img data-src="${esc(P[id].foto)}" alt="" draggable="false"></figure>`).join("")}</div>
        <button type="button" class="pp-flecha pp-sig" data-paso="1" aria-label="${f.nombre}: prenda siguiente">${CHEV("m6 3 5 5-5 5")}</button>
        <span class="pp-aviso" aria-hidden="true"></span>
      </div>`;

    const r = document.createElement("div");
    r.className = "portada-" + CLAVE + (reducido ? "" : " pp-entrando");
    r.dataset.modo = modo;
    r.innerHTML = `
      <div class="pp-lado">
        <div class="pp-intro">
          <span class="pp-rotulo">El probador · arma tu look</span>
          <h1 class="pp-titulo"><span class="pp-linea" style="--l:0"><span>Combínalo aquí,</span></span><span class="pp-linea" style="--l:1"><span>pruébatelo en tienda.</span></span></h1>
          <p class="pp-bajada">Mueve cada fila hasta dar con tu look: te decimos cuánto suma y si está en tu tienda de <b data-sede></b>.</p>
        </div>
        <ul class="pp-lista" aria-label="Las prendas de tu look"></ul>
        <div class="pp-cierre">
          <div class="pp-total"><span>El look completo</span><b class="pp-odometro" role="status"></b></div>
          <div class="pp-acciones">
            <button type="button" class="pp-btn pp-btn-primario" data-separar>Separar el look</button>
            <button type="button" class="pp-btn" data-mezclar>${MEZCLAR}<span>Mezclar</span></button>
          </div>
          <p class="pp-letra">Lo separas sin pagar y lo recoges en tu tienda.</p>
        </div>
        <div class="pp-casa">
          <span class="pp-rotulo">O empieza por un look de la casa</span>
          <div class="pp-chips">${T.looks.map((l, k) => `<button type="button" class="pp-chip" data-look="${k}" aria-pressed="false"><img src="${esc(T.foto(l.f))}" alt="" loading="lazy">${esc(l.n)}</button>`).join("")}</div>
        </div>
      </div>
      <div class="pp-mesa-caja">
        <div class="pp-mesa">
          <div class="pp-mesa-cab">
            <span class="pp-rotulo">Tu look en <span data-sede></span></span>
            <button type="button" class="pp-interruptor" role="switch" aria-checked="false"><span class="pp-int-pista"><span class="pp-int-perilla"></span></span>Vestido o conjunto</button>
          </div>
          <div class="pp-filas">${FILAS.map((d) => filaHtml(filas[d.clave])).join("")}</div>
        </div>
        <figure class="pp-puesto" aria-hidden="true"><img alt=""><figcaption>Así se ve puesto</figcaption></figure>
      </div>`;
    raiz.appendChild(r);

    const lista = r.querySelector(".pp-lista");
    const odoEl = r.querySelector(".pp-odometro");
    const btnSeparar = r.querySelector("[data-separar]");
    const btnMezclar = r.querySelector("[data-mezclar]");
    const interruptor = r.querySelector(".pp-interruptor");
    const chips = [...r.querySelectorAll(".pp-chip")];
    const puesto = r.querySelector(".pp-puesto");
    const puestoImg = puesto.querySelector("img");
    for (const f of Object.values(filas)) {
      f.el = r.querySelector(`.pp-fila[data-fila="${f.clave}"]`);
      f.piezas = [...f.el.querySelectorAll(".pp-pieza")];
    }

    // ── dibujar una fila según su posición (continua mientras se arrastra) ──
    function pintar(f, { dur = 0, curva = CURVA } = {}) {
      f.piezas.forEach((el, k) => {
        const d = circ(k - f.pos, f.n);
        const a = Math.abs(d);
        const ult = f.ultD[k];
        // la que da la vuelta de un lado al otro (o se mueve fuera de vista) salta sin cruzar la mesa
        const salta = ult === undefined || Math.abs(d - ult) > f.n / 2 || (a > 2.6 && Math.abs(ult) > 2.6);
        el.style.transition = dur && !salta ? `transform ${dur}ms ${curva}, opacity ${dur}ms ${curva}` : "none";
        el.style.transform = `translate(-50%, -50%) translateX(${Math.sign(d) * interp(X, a) * 100}%) scale(${interp(S, a)})`;
        el.style.opacity = String(interp(O, a));
        el.style.zIndex = String(10 - Math.round(a));
        el.style.visibility = a > 3.4 ? "hidden" : "";
        el.classList.toggle("centro", a < 0.5);
        if (a < 3.2) { const img = el.firstChild; if (!img.getAttribute("src")) img.src = img.dataset.src; }
        f.ultD[k] = d;
      });
    }

    // ── mover una fila N prendas: cada paso frena un poco más que el anterior, sin rebote ──
    function mover(f, delta, total) {
      delta = Math.round(delta);
      const token = ++f.token;
      if (!delta) { f.pos = f.i; pintar(f, { dur: reducido ? 0 : 420 }); return Promise.resolve(); }
      if (reducido) { f.i = mod(f.i + delta, f.n); f.pos = f.i; pintar(f); return Promise.resolve(); }
      const s = Math.abs(delta);
      const dir = Math.sign(delta);
      const tt = total ?? (s === 1 ? 460 : Math.min(320 + s * 60, 900));
      const t = (k) => tt * (1 - Math.pow(1 - k / s, 1 / 3));
      return new Promise((listo) => {
        for (let k = 1; k <= s; k++) {
          espera(() => {
            if (token !== f.token) { listo(); return; }
            f.i = mod(f.i + dir, f.n);
            f.pos = f.i;
            const dur = Math.max(50, t(k) - t(k - 1));
            const ultimo = k === s;
            pintar(f, { dur, curva: ultimo ? CURVA : "linear" });
            if (ultimo) espera(listo, dur);
          }, t(k - 1));
        }
      });
    }

    // ── lo que pasa cuando una fila se asienta: su rótulo, su línea en la lista, el total y si es un look de la casa ──
    function textoStock(p) {
      const c = T.claseStock(p);
      if (c !== "sin") return T.stockTexto(p);
      const otra = /en (Trujillo|Arequipa|Lima)/.exec(p.stock || "")?.[1];
      return `No hay en ${T.sede()}` + (otra && otra !== T.sede() ? ` · hay en ${otra}` : "");
    }
    const itemHtml = (f) => {
      const p = actual(f);
      return `<span class="pp-mini"><img src="${esc(p.foto)}" alt=""></span>
        <span class="pp-item-texto"><small>${f.nombre}</small><a class="pp-nombre" href="#ficha" data-id="${p.id}">${esc(p.nombre)}</a><span class="pp-stock ${T.claseStock(p)}">${esc(textoStock(p))}</span></span>
        <span class="pp-precio">${T.sol(p.precio)}</span>`;
    };
    function pintarLista() {
      lista.innerHTML = filasActivas().map((f) => `<li class="pp-item" data-fila="${f.clave}" data-id="${actual(f).id}">${itemHtml(f)}</li>`).join("");
    }
    function pintarItem(f) {
      const li = lista.querySelector(`[data-fila="${f.clave}"]`);
      if (!li || li.dataset.id === String(actual(f).id)) return;
      li.dataset.id = actual(f).id;
      if (reducido) { li.innerHTML = itemHtml(f); return; }
      li.classList.add("cambia");
      espera(() => { li.innerHTML = itemHtml(f); void li.offsetWidth; li.classList.remove("cambia"); }, 200);
    }
    function rotular(f) {
      const p = actual(f);
      const sin = T.claseStock(p) === "sin";
      f.el.querySelector(".pp-fila-rotulo i").textContent = `${dos(f.i + 1)} / ${dos(f.n)}`;
      f.el.setAttribute("aria-label", `${f.nombre}: ${p.nombre}, ${T.sol(p.precio)}. Cambia con las flechas.`);
      f.el.classList.toggle("sin-stock", sin);
      f.el.querySelector(".pp-aviso").textContent = sin ? `No está en ${T.sede()}` : "";
    }
    function alAsentar(f) { rotular(f); pintarItem(f); pintarTotal(); comprobarLook(); }

    // el total rueda dígito a dígito, como un odómetro
    let odoTxt = "";
    function odo(valor) {
      const nuevo = valor.toFixed(2);
      odoEl.setAttribute("aria-label", "El look completo: S/ " + nuevo);
      if (nuevo.length !== odoTxt.length) {
        const viejo = odoTxt.replace(".", "");
        odoEl.innerHTML = `<span class="pp-sol" aria-hidden="true">S/ </span>` + [...nuevo].map((ch) => (/\d/.test(ch)
          ? `<span class="pp-dig" aria-hidden="true"><span class="pp-col">${[..."0123456789"].map((n) => `<span>${n}</span>`).join("")}</span></span>`
          : `<span class="pp-punto" aria-hidden="true">${ch}</span>`)).join("");
        const cols = [...odoEl.querySelectorAll(".pp-col")];
        const desde = viejo.padStart(cols.length, "0").slice(-cols.length);
        cols.forEach((c, k) => { c.style.transition = "none"; c.style.transform = `translateY(${-1.15 * +desde[k]}em)`; });
        void odoEl.offsetWidth;
        cols.forEach((c) => { c.style.transition = ""; });
      }
      odoTxt = nuevo;
      const digs = nuevo.replace(".", "");
      const cols = [...odoEl.querySelectorAll(".pp-col")];
      cols.forEach((c, k) => {
        c.style.transitionDelay = `${(cols.length - 1 - k) * 45}ms`;
        c.style.transform = `translateY(${-1.15 * +digs[k]}em)`;
      });
    }
    const pintarTotal = () => odo(filasActivas().reduce((s, f) => s + actual(f).precio, 0));

    function comprobarLook() {
      const ids = filasActivas().map((f) => actual(f).id).sort((a, b) => a - b).join(",");
      let hallado = null;
      T.looks.forEach((l, k) => {
        const si = [...l.en, ...l.con].sort((a, b) => a - b).join(",") === ids;
        chips[k].setAttribute("aria-pressed", String(si));
        if (si) hallado = l;
      });
      if (hallado) {
        puestoImg.src = T.foto(hallado.f);
        puestoImg.alt = `El look «${hallado.n}» puesto`;
        puesto.classList.add("visible");
      } else puesto.classList.remove("visible");
    }

    // ── vestido o conjunto: junta arriba y abajo en una sola fila ──
    function cambiarModo(nuevo) {
      modo = nuevo;
      r.dataset.modo = modo;
      interruptor.setAttribute("aria-checked", String(modo === "vestido"));
      for (const f of Object.values(filas)) f.el.toggleAttribute("inert", !(f.modo === "ambos" || f.modo === modo));
      pintarLista();
      filasActivas().forEach(rotular);
      pintarTotal();
      comprobarLook();
    }

    // ── interacción de cada fila: flechas, teclado, clic en una vecina y arrastre ──
    for (const f of Object.values(filas)) {
      const el = f.el;
      el.querySelectorAll(".pp-flecha").forEach((b) => on(b, "click", () => mover(f, +b.dataset.paso).then(() => alAsentar(f))));
      on(el, "keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        mover(f, e.key === "ArrowLeft" ? -1 : 1).then(() => alAsentar(f));
      });
      on(el, "click", (e) => {
        if (performance.now() - f.arrastro < 350) return;
        const pz = e.target.closest(".pp-pieza");
        if (!pz) return;
        const d = Math.round(circ(+pz.dataset.k - f.i, f.n));
        if (d) mover(f, d).then(() => alAsentar(f));
      });
      let ini = null;
      on(el, "pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest(".pp-flecha")) return;
        ini = { x: e.clientX, y: e.clientY, pos: f.pos, id: e.pointerId, moviendo: false, hist: [[performance.now(), e.clientX]] };
      });
      on(el, "pointermove", (e) => {
        if (!ini || e.pointerId !== ini.id) return;
        const dx = e.clientX - ini.x;
        const dy = e.clientY - ini.y;
        if (!ini.moviendo) {
          if (Math.abs(dx) < 6) return;
          if (Math.abs(dy) > Math.abs(dx)) { ini = null; return; }
          ini.moviendo = true;
          ini.pos = f.pos;
          ini.x = e.clientX;
          f.token++;
          el.setPointerCapture?.(e.pointerId);
          return;
        }
        const paso = f.piezas[0].offsetWidth * X[1] || 1;
        f.pos = ini.pos - (e.clientX - ini.x) / paso;
        pintar(f);
        ini.hist.push([performance.now(), e.clientX]);
        if (ini.hist.length > 6) ini.hist.shift();
      });
      const soltar = () => {
        if (!ini) return;
        const { moviendo, hist } = ini;
        ini = null;
        if (!moviendo) return;
        f.arrastro = performance.now();
        const [t0, x0] = hist[0];
        const [t1, x1] = hist[hist.length - 1];
        const v = t1 > t0 ? (x1 - x0) / (t1 - t0) : 0;
        const paso = f.piezas[0].offsetWidth * X[1] || 1;
        const impulso = Math.max(-2, Math.min(2, -(v * 160) / paso)); // un tirón suma hasta dos prendas, no más
        const destino = Math.round(f.pos + impulso);
        f.pos = destino;
        pintar(f, { dur: reducido ? 0 : 460 });
        f.i = mod(destino, f.n);
        f.pos = f.i;
        espera(() => alAsentar(f), reducido ? 0 : 460);
      };
      on(el, "pointerup", soltar);
      on(el, "pointercancel", soltar);
    }

    // ── mezclar: las filas giran como un tragamonedas, escalonadas, y frenan en una combinación al azar ──
    let mezclando = false;
    on(btnMezclar, "click", async () => {
      if (mezclando) return;
      mezclando = true;
      btnMezclar.setAttribute("aria-disabled", "true");
      const activas = filasActivas();
      await Promise.all(activas.map((f, k) => new Promise((listo) => espera(() => {
        let s;
        do { s = 6 + Math.floor(Math.random() * 7); } while (s % f.n === 0);
        mover(f, s, 700).then(listo);
      }, reducido ? 0 : k * 120))));
      activas.forEach((f) => { rotular(f); pintarItem(f); });
      pintarTotal();
      comprobarLook();
      mezclando = false;
      btnMezclar.removeAttribute("aria-disabled");
    });

    // ── looks de la casa: las filas se deslizan hasta esas prendas ──
    chips.forEach((chip, k) => on(chip, "click", async () => {
      const l = T.looks[k];
      const quiere = {};
      [...l.en, ...l.con].forEach((id) => { const c = P[id] && FILA_DE_CAT[P[id].cat]; if (c) quiere[c] = id; });
      const nuevoModo = quiere.vestido ? "vestido" : quiere.arriba || quiere.abajo ? "separado" : modo;
      if (nuevoModo !== modo) cambiarModo(nuevoModo);
      await Promise.all(Object.entries(quiere).map(([c, id], j) => new Promise((listo) => espera(() => {
        const f = filas[c];
        const destino = f.ids.indexOf(id);
        if (destino < 0) { listo(); return; }
        const delta = Math.round(circ(destino - f.i, f.n));
        mover(f, delta, 420 + Math.abs(delta) * 50).then(listo);
      }, reducido ? 0 : j * 110))));
      filasActivas().forEach((f) => { rotular(f); pintarItem(f); });
      pintarTotal();
      comprobarLook();
    }));

    on(interruptor, "click", () => cambiarModo(modo === "vestido" ? "separado" : "vestido"));

    // ── separar el look: cada prenda vuela desde su fila a la bolsa ──
    let etiquetaSeparar = null;
    on(btnSeparar, "click", () => {
      filasActivas().forEach((f, k) => espera(() => T.agregar(actual(f).id, f.piezas[f.i].firstChild), reducido ? 0 : k * 140));
      if (etiquetaSeparar) clearTimeout(etiquetaSeparar);
      btnSeparar.textContent = "Listo, está en tu bolsa";
      etiquetaSeparar = espera(() => { btnSeparar.textContent = "Separar el look"; etiquetaSeparar = null; }, 2600);
    });

    on(lista, "click", (e) => {
      const a = e.target.closest(".pp-nombre");
      if (!a) return;
      e.preventDefault();
      T.ir("ficha", { id: +a.dataset.id });
    });

    // ── la tienda elegida ──
    const pintarSede = () => r.querySelectorAll("[data-sede]").forEach((el) => { el.textContent = T.sede(); });
    const quitarSede = T.alCambiarSede?.(() => {
      pintarSede();
      Object.values(filas).forEach(rotular);
      pintarLista();
    });

    // ── primer dibujo y entrada ──
    pintarSede();
    for (const f of Object.values(filas)) { pintar(f); rotular(f); f.el.toggleAttribute("inert", !(f.modo === "ambos" || f.modo === modo)); }
    pintarLista();
    comprobarLook();
    if (reducido) pintarTotal();
    else {
      odo(0);
      requestAnimationFrame(() => requestAnimationFrame(() => r.classList.add("pp-entro")));
      espera(pintarTotal, 1700);
      espera(() => r.classList.remove("pp-entrando", "pp-entro"), 2900);
    }

    vivo = {
      limpiar() {
        timers.forEach(clearTimeout);
        timers.clear();
        limpiezas.forEach((fn) => fn());
        if (typeof quitarSede === "function") quitarSede();
        Object.values(filas).forEach((f) => { f.token++; });
      },
    };
  }

  function desmontar() {
    vivo?.limpiar();
    vivo = null;
  }

  window.PORTADAS = window.PORTADAS || {};
  window.PORTADAS[CLAVE] = { nombre: "Probador", montar, desmontar };
})();
