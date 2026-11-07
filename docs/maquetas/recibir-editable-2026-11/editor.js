/* Editor de la maqueta «Recibir mercadería» (2026-11).
   La página de abajo es la pantalla REAL del ERP (su HTML y su CSS compilado, capturados de la app local). Este archivo solo le suma un
   editor encima: cada pieza declarada en piezas.js se puede mover y redimensionar, y la disposición se guarda en este navegador.

   Cómo funciona una pieza: la primera vez que se toca se «suelta» de la página. Se deja en su lugar un hueco invisible del mismo tamaño
   (así lo demás no se corre) y la pieza pasa a position:absolute con left/top/width/height. Lo que lleva adentro se sigue adaptando solo:
   las piezas de Recibir deciden por el ancho de SU tarjeta (@container), así que al ensanchar o angostar una se ve cómo responde.
   Lo que se guarda es lo movido respecto al sitio de hoy (dx, dy) y el tamaño nuevo; no se toca el ERP.

   Nada de esto escribe en el ERP ni en la base: es una maqueta. Los datos son los de la base local de pruebas (inventados). */
(() => {
  "use strict";

  const CFG = window.PIEZAS_MAQUETA || { estados: [], piezas: {}, va: {} };
  const M = window.MAQUETA || { estado: "portada" };
  const KEY_CAPA = "recibir-editable-2026-11:capa:" + M.estado;
  const KEY_PREFS = "recibir-editable-2026-11:prefs";
  const UMBRAL_IMAN = 6;
  const MINIMO = 16;
  const ESTADO = CFG.estados.find((e) => e.id === M.estado) || { id: M.estado, nombre: M.estado, archivo: "index.html" };

  const leer = (k, def) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : def;
    } catch {
      return def;
    }
  };
  const escribir = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* sin almacenamiento (ventana privada): la maqueta sigue, solo que no recuerda */
    }
  };
  const px = (n) => Math.round(n * 10) / 10 + "px";
  const R = (n) => Math.round(n);

  const prefs = Object.assign({ modo: "editar", iman: true, oscuro: false, plegado: false, panel: null }, leer(KEY_PREFS, {}));
  const guardarPrefs = () => escribir(KEY_PREFS, prefs);

  /* ───────────────────────── Piezas ───────────────────────── */
  const piezas = new Map(); // id → pieza
  let orden = []; // en orden de documento: el padre antes que sus hijos

  function resolver() {
    const sinEncontrar = [];
    for (const def of CFG.piezas[M.estado] || []) {
      let encontrados = [];
      try {
        // `todos`: la misma pieza repetida (las Vitrinas): cada una se numera.
        encontrados = def.todos ? [...document.querySelectorAll(def.sel)].slice(0, def.max || 6) : [document.querySelector(def.sel)];
      } catch {
        /* selector malo: se ignora */
      }
      encontrados = encontrados.filter(Boolean);
      if (!encontrados.length && !def.opcional) sinEncontrar.push(def.id);
      encontrados.forEach((el, i) => {
        const id = def.todos ? `${def.id}-${i + 1}` : def.id;
        if (piezas.has(id) || el.hasAttribute("data-pieza")) return;
        el.setAttribute("data-pieza", id);
        const nombre = def.todos && encontrados.length > 1 ? `${def.nombre} ${i + 1}` : def.nombre;
        piezas.set(id, { id, nombre, el, hijos: [], padre: null, prof: 0, mat: false, ph: null, g: null, nat: null, z: null, oculta: false });
      });
    }
    if (sinEncontrar.length) console.warn("[maqueta] piezas sin encontrar en esta captura:", sinEncontrar.join(", "));
    orden = [...document.querySelectorAll("[data-pieza]")].map((e) => piezas.get(e.getAttribute("data-pieza"))).filter(Boolean);
    for (const p of orden) {
      const a = p.el.parentElement && p.el.parentElement.closest("[data-pieza]");
      p.padre = a ? piezas.get(a.getAttribute("data-pieza")) || null : null;
      if (p.padre) p.padre.hijos.push(p);
    }
    for (const p of orden) {
      let d = 0;
      for (let q = p.padre; q; q = q.padre) d++;
      p.prof = d;
    }
    // Todo contenedor posicionado: así lo de adentro mide siempre contra su pieza y no contra un ancestro lejano.
    document.body.style.position = "relative";
    for (const p of orden) if (getComputedStyle(p.el).position === "static") p.el.style.position = "relative";
    for (const p of orden) p.estiloBase = p.el.getAttribute("style");
  }

  const raices = () => orden.filter((p) => !p.padre);

  /* Suelta la pieza de la página (ver el encabezado). Devuelve false si no tiene caja que mover. */
  function materializar(p) {
    if (p.mat) return true;
    const el = p.el;
    const cs = getComputedStyle(el);
    const r0 = el.getBoundingClientRect();
    // Un <svg> (el sello de lacre) no tiene offsetWidth: se mide por su caja.
    const w = el.offsetWidth != null ? el.offsetWidth : Math.round(r0.width);
    const h = el.offsetHeight != null ? el.offsetHeight : Math.round(r0.height);
    if (!w && !h) return false;
    const pos = cs.position;
    const estabaEnElFlujo = pos === "relative" || pos === "sticky";
    p.modo = pos === "fixed" || pos === "sticky" ? "fijo" : pos === "absolute" ? "abs" : "flujo";
    if (estabaEnElFlujo) {
      const ph = document.createElement("div");
      ph.className = "rm-hueco";
      ph.setAttribute("aria-hidden", "true");
      ph.style.cssText =
        `display:${cs.display.startsWith("inline") ? "inline-block" : "block"};box-sizing:border-box;width:${w}px;height:${h}px;` +
        `margin:${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft};flex:0 0 auto;visibility:hidden;pointer-events:none;` +
        `grid-column:${cs.gridColumnStart} / ${cs.gridColumnEnd};grid-row:${cs.gridRowStart} / ${cs.gridRowEnd};` +
        `align-self:${cs.alignSelf};justify-self:${cs.justifySelf};order:${cs.order}`;
      p.ph = ph;
    }
    const s = el.style;
    s.margin = "0";
    s.boxSizing = "border-box";
    s.width = w + "px";
    s.height = h + "px";
    s.maxWidth = "none";
    s.maxHeight = "none";
    s.minWidth = "0";
    s.minHeight = "0";
    s.inset = "auto";
    if (p.modo === "fijo") {
      // Pegada a la ventana (las barras de abajo): se queda pegada, con el sitio que tenía.
      s.position = "fixed";
      s.left = px(r0.left);
      s.top = px(r0.top);
      p.nat = { x: r0.left, y: r0.top, w, h };
    } else {
      s.position = "absolute";
      s.left = "0px";
      s.top = "0px";
      if (p.ph) el.before(p.ph);
      const a = el.getBoundingClientRect();
      p.nat = { x: r0.left - a.left, y: r0.top - a.top, w, h };
      s.left = px(p.nat.x);
      s.top = px(p.nat.y);
    }
    p.g = { ...p.nat };
    p.mat = true;
    return true;
  }

  function aplicar(p) {
    const s = p.el.style;
    s.left = px(p.g.x);
    s.top = px(p.g.y);
    s.width = px(p.g.w);
    s.height = px(p.g.h);
    s.zIndex = p.z == null ? "" : String(p.z);
    s.visibility = p.oculta ? "hidden" : "";
  }

  /* Devuelve la pieza a su sitio de hoy. */
  function desmaterializar(p) {
    if (!p.mat) return;
    if (p.ph) p.ph.remove();
    p.ph = null;
    if (p.estiloBase == null) p.el.removeAttribute("style");
    else p.el.setAttribute("style", p.estiloBase);
    p.mat = false;
    p.g = null;
    p.nat = null;
    p.z = null;
    p.oculta = false;
  }

  const cambiada = (p) =>
    p.mat && (Math.abs(p.g.x - p.nat.x) > 0.5 || Math.abs(p.g.y - p.nat.y) > 0.5 || Math.abs(p.g.w - p.nat.w) > 0.5 || Math.abs(p.g.h - p.nat.h) > 0.5 || p.z != null || p.oculta);

  function capaActual() {
    const c = {};
    for (const p of orden) {
      if (!cambiada(p)) continue;
      const e = {};
      if (Math.abs(p.g.x - p.nat.x) > 0.5) e.dx = Math.round((p.g.x - p.nat.x) * 10) / 10;
      if (Math.abs(p.g.y - p.nat.y) > 0.5) e.dy = Math.round((p.g.y - p.nat.y) * 10) / 10;
      if (Math.abs(p.g.w - p.nat.w) > 0.5) e.w = Math.round(p.g.w * 10) / 10;
      if (Math.abs(p.g.h - p.nat.h) > 0.5) e.h = Math.round(p.g.h * 10) / 10;
      if (p.z != null) e.z = p.z;
      if (p.oculta) e.oculta = true;
      c[p.id] = e;
    }
    return c;
  }

  function aplicarCapa(capa) {
    for (const p of orden) {
      const c = capa[p.id];
      if (!c) {
        if (p.mat) desmaterializar(p);
        continue;
      }
      if (!materializar(p)) continue;
      p.g = { x: p.nat.x + (c.dx || 0), y: p.nat.y + (c.dy || 0), w: c.w != null ? c.w : p.nat.w, h: c.h != null ? c.h : p.nat.h };
      p.z = c.z != null ? c.z : null;
      p.oculta = !!c.oculta;
      aplicar(p);
    }
  }

  /* ───────────────────────── Historial (deshacer / rehacer) ───────────────────────── */
  let hist = [];
  let histI = 0;
  let pendienteGuardar = null;

  function confirmar() {
    const c = capaActual();
    const t = JSON.stringify(c);
    escribir(KEY_CAPA, c);
    if (t === hist[histI]) return refrescarPanel();
    hist = hist.slice(0, histI + 1);
    hist.push(t);
    histI = hist.length - 1;
    refrescarPanel();
  }
  function confirmarPronto() {
    clearTimeout(pendienteGuardar);
    pendienteGuardar = setTimeout(confirmar, 350);
  }
  function irA(i) {
    if (i < 0 || i >= hist.length) return;
    histI = i;
    const c = JSON.parse(hist[i]);
    aplicarCapa(c);
    escribir(KEY_CAPA, c);
    refrescarPanel();
  }

  /* ───────────────────────── Interfaz (en un shadow DOM, para no mezclarse con el CSS del ERP) ───────────────────────── */
  const host = document.createElement("div");
  host.id = "rm-host";
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483000;pointer-events:none";
  const raiz = host.attachShadow({ mode: "open" });

  const CSS = `
:host{all:initial}
*{box-sizing:border-box}
button,input{font:inherit;color:inherit}
.capa{position:fixed;inset:0;pointer-events:none;overflow:hidden;font:12px/1.3 "DM Sans",system-ui,sans-serif}
.caja{position:fixed;left:0;top:0;display:none;pointer-events:none}
.hov{border:1.5px dashed #2f6bff;background:rgba(47,107,255,.06)}
.hov span,.marco>.etq{position:absolute;left:-1.5px;bottom:100%;margin-bottom:3px;white-space:nowrap;background:#2f6bff;color:#fff;border-radius:6px;padding:2px 7px;font-weight:600;font-size:11px;line-height:1.35}
.marco{border:1.5px solid #2f6bff;box-shadow:0 0 0 1px rgba(255,255,255,.55)}
.marco>.etq{font-weight:500}
.marco.fija>.etq{background:#14304f}
.mn{position:absolute;width:11px;height:11px;margin:-5.5px 0 0 -5.5px;background:#fff;border:1.5px solid #2f6bff;border-radius:3px;pointer-events:auto;touch-action:none}
.mn[data-d=n],.mn[data-d=s]{cursor:ns-resize}.mn[data-d=e],.mn[data-d=w]{cursor:ew-resize}
.mn[data-d=nw],.mn[data-d=se]{cursor:nwse-resize}.mn[data-d=ne],.mn[data-d=sw]{cursor:nesw-resize}
.mn[data-d=nw]{left:0;top:0}.mn[data-d=n]{left:50%;top:0}.mn[data-d=ne]{left:100%;top:0}
.mn[data-d=e]{left:100%;top:50%}.mn[data-d=se]{left:100%;top:100%}.mn[data-d=s]{left:50%;top:100%}
.mn[data-d=sw]{left:0;top:100%}.mn[data-d=w]{left:0;top:50%}
.guia{position:fixed;display:none;background:#ff2d7a;pointer-events:none}
.guia.v{width:1px;top:0;bottom:0}.guia.h{height:1px;left:0;right:0}
.panel{position:fixed;width:280px;max-height:calc(100vh - 20px);display:flex;flex-direction:column;pointer-events:auto;
  background:color-mix(in srgb,var(--color-papel,#fff) 93%,transparent);color:var(--color-tinta,#1c1a17);
  border:1px solid color-mix(in srgb,var(--color-tinta,#1c1a17) 16%,transparent);border-radius:16px;
  box-shadow:0 22px 48px -18px color-mix(in srgb,var(--color-sombra,#000) 55%,transparent);backdrop-filter:blur(16px);font:12.5px/1.35 "DM Sans",system-ui,sans-serif}
.cab{display:flex;align-items:center;gap:8px;padding:9px 10px 9px 14px;cursor:grab;user-select:none;border-bottom:1px solid color-mix(in srgb,var(--color-tinta,#1c1a17) 10%,transparent)}
.cab:active{cursor:grabbing}.cab strong{font-size:13px}.cab .sub{opacity:.62;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cuerpo{overflow:auto;padding:4px 14px 12px}
.panel.plegado .cuerpo{display:none}.panel.plegado .cab{border-bottom:0}
h4{margin:12px 0 6px;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;opacity:.62;font-weight:700}
.chips{display:flex;flex-wrap:wrap;gap:5px}
.chip{display:inline-flex;align-items:center;min-height:28px;padding:0 10px;border-radius:99px;border:1px solid color-mix(in srgb,var(--color-tinta,#1c1a17) 24%,transparent);
  background:transparent;text-decoration:none;color:inherit;cursor:pointer;font-size:12px;white-space:nowrap}
.chip:hover{background:color-mix(in srgb,var(--color-tinta,#1c1a17) 7%,transparent)}
.chip[aria-current=page]{background:var(--color-tinta,#1c1a17);color:var(--color-crema,#fff);border-color:transparent}
.seg{display:grid;grid-template-columns:1fr 1fr;gap:3px;padding:3px;border-radius:12px;background:color-mix(in srgb,var(--color-tinta,#1c1a17) 8%,transparent)}
.seg button{min-height:30px;border:0;border-radius:9px;background:transparent;cursor:pointer;font-weight:600}
.seg button[aria-pressed=true]{background:var(--color-papel,#fff);box-shadow:0 1px 4px color-mix(in srgb,var(--color-sombra,#000) 28%,transparent)}
label.op{display:flex;align-items:center;gap:7px;margin-top:8px;cursor:pointer}
.fila{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.b{min-height:30px;padding:0 11px;border-radius:9px;border:1px solid color-mix(in srgb,var(--color-tinta,#1c1a17) 24%,transparent);background:transparent;cursor:pointer;font-size:12px}
.b:hover:not(:disabled){background:color-mix(in srgb,var(--color-tinta,#1c1a17) 7%,transparent)}
.b:disabled{opacity:.38;cursor:default}
.b.p{background:var(--color-tinta,#1c1a17);color:var(--color-crema,#fff);border-color:transparent}
.insp .nom{font-weight:700;font-size:13px}.insp .vacio{opacity:.62}
.num{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:7px}
.num label{display:grid;gap:2px;font-size:10.5px;opacity:.85}.num input{width:100%;min-height:28px;padding:0 6px;border-radius:8px;border:1px solid color-mix(in srgb,var(--color-tinta,#1c1a17) 28%,transparent);background:color-mix(in srgb,var(--color-papel,#fff) 70%,transparent)}
.arbol{display:grid;gap:1px;max-height:170px;overflow:auto;margin:0 -4px;padding:0 4px}
.nodo{display:flex;align-items:center;gap:6px;min-height:26px;padding:0 6px;border-radius:7px;cursor:pointer}
.nodo:hover{background:color-mix(in srgb,var(--color-tinta,#1c1a17) 7%,transparent)}
.nodo[aria-selected=true]{background:#2f6bff;color:#fff}
.nodo .n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nodo .pto{width:7px;height:7px;border-radius:50%;background:#ff9a1f;flex:none}
.nodo .ojo{border:0;background:transparent;cursor:pointer;opacity:.7;padding:0 2px}
.nodo.oc .n{opacity:.45;text-decoration:line-through}
.ayuda{margin:12px 0 0;padding:8px 10px;border-radius:10px;background:color-mix(in srgb,var(--color-tinta,#1c1a17) 6%,transparent);font-size:11.5px}
.ayuda summary{cursor:pointer;font-weight:700;font-size:11.5px}.ayuda p{margin:6px 0 0;opacity:.9}
.ayuda b{font-weight:700}
.modal{position:fixed;inset:0;display:none;place-items:center;background:color-mix(in srgb,var(--color-sombra,#000) 40%,transparent);pointer-events:auto}
.modal.ab{display:grid}
.modal .hoja{width:min(720px,calc(100vw - 32px));max-height:calc(100vh - 48px);display:grid;grid-template-rows:auto 1fr auto;gap:10px;padding:16px;border-radius:18px;
  background:var(--color-papel,#fff);color:var(--color-tinta,#1c1a17);font:13px/1.4 "DM Sans",system-ui,sans-serif;box-shadow:0 30px 70px -20px rgba(0,0,0,.5)}
.modal h3{margin:0;font-size:16px}.modal textarea{width:100%;min-height:300px;border-radius:10px;border:1px solid color-mix(in srgb,var(--color-tinta,#1c1a17) 28%,transparent);
  padding:10px;font:12px/1.45 ui-monospace,Menlo,monospace;background:color-mix(in srgb,var(--color-papel,#fff) 80%,transparent);color:inherit;resize:vertical}
.modal .pie{display:flex;gap:8px;justify-content:flex-end;align-items:center}.modal .pie .ok{margin-right:auto;color:#1a8f4c;font-weight:600}
.toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);padding:8px 14px;border-radius:99px;background:var(--color-tinta,#1c1a17);color:var(--color-crema,#fff);font:12.5px "DM Sans",system-ui,sans-serif;opacity:0;transition:opacity .25s;pointer-events:none}
.toast.ve{opacity:1}
`;

  const el$ = (h) => {
    const t = document.createElement("template");
    t.innerHTML = h.trim();
    return t.content.firstElementChild;
  };

  let ui = {};

  function montarUI() {
    const estilo = document.createElement("style");
    estilo.textContent = CSS;
    raiz.append(estilo);

    const capa = el$(`<div class="capa">
      <div class="caja hov"><span></span></div>
      <div class="caja marco"><div class="etq"></div>${["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((d) => `<i class="mn" data-d="${d}"></i>`).join("")}</div>
      <i class="guia v"></i><i class="guia v"></i><i class="guia h"></i><i class="guia h"></i>
    </div>`);
    const panel = el$(`<div class="panel">
      <div class="cab" data-arrastre><strong>Maqueta editable</strong><span class="sub">Recibir mercadería</span><button class="b" data-a="plegar" title="Plegar o abrir el panel" style="min-height:26px;padding:0 9px">▾</button></div>
      <div class="cuerpo">
        <h4>Pantallas del flujo</h4>
        <div class="chips">${CFG.estados
          .map((e) => `<a class="chip" href="${e.archivo}" title="${e.ruta} · ${e.nota}" ${e.id === M.estado ? 'aria-current="page"' : ""}>${e.nombre}</a>`)
          .join("")}</div>
        <h4>Modo</h4>
        <div class="seg"><button data-modo="editar">Editar</button><button data-modo="probar">Probar</button></div>
        <label class="op"><input type="checkbox" data-pref="iman"> Imán de alineación</label>
        <label class="op"><input type="checkbox" data-pref="oscuro"> Modo oscuro</label>
        <div class="fila">
          <button class="b" data-a="deshacer">Deshacer</button><button class="b" data-a="rehacer">Rehacer</button>
          <button class="b" data-a="restablecer">Restablecer pantalla</button>
          <button class="b p" data-a="exportar">Copiar disposición</button>
        </div>
        <h4>Pieza elegida</h4>
        <div class="insp"></div>
        <h4>Piezas de esta pantalla</h4>
        <div class="arbol"></div>
        <details class="ayuda" open><summary>Cómo se usa</summary>
          <p><b>Clic</b> elige una pieza · <b>arrastra</b> la mueve · las <b>manijas</b> de los bordes cambian su tamaño · <b>doble clic</b> entra a sus partes · <b>Esc</b> sube un nivel.</p>
          <p><b>Flechas</b> mueven 1 px (con Mayús, 10) · <b>Alt</b> apaga el imán · <b>Mayús</b> en una esquina mantiene la proporción · <b>Supr</b> oculta · <b>Ctrl/⌘ Z</b> deshace.</p>
          <p>Lo de adentro se adapta solo al ancho de cada tarjeta, como en el ERP. «Probar» recorre el flujo con los botones de verdad.</p>
        </details>
      </div>
    </div>`);
    const modal = el$(`<div class="modal"><div class="hoja"><h3>Disposición de esta pantalla</h3><textarea readonly spellcheck="false"></textarea>
      <div class="pie"><span class="ok"></span><button class="b" data-a="cerrar-modal">Cerrar</button><button class="b p" data-a="copiar">Copiar</button></div></div></div>`);
    const toast = el$(`<div class="toast"></div>`);
    raiz.append(capa, panel, modal, toast);
    document.documentElement.append(host);

    ui = {
      capa,
      hov: capa.querySelector(".hov"),
      hovNom: capa.querySelector(".hov span"),
      marco: capa.querySelector(".marco"),
      etq: capa.querySelector(".marco .etq"),
      guias: [...capa.querySelectorAll(".guia")],
      panel,
      cuerpo: panel.querySelector(".cuerpo"),
      insp: panel.querySelector(".insp"),
      arbol: panel.querySelector(".arbol"),
      modal,
      texto: modal.querySelector("textarea"),
      ok: modal.querySelector(".ok"),
      toast,
    };
    // Nace sobre el menú lateral del ERP (que no es parte de la pantalla), para no tapar lo que se edita. Se arrastra por su cabecera.
    const p0 = prefs.panel || { x: 6, y: 58 };
    ubicarPanel(p0.x, p0.y);
    panel.classList.toggle("plegado", !!prefs.plegado);
    raiz.querySelectorAll("[data-pref]").forEach((c) => {
      c.checked = !!prefs[c.dataset.pref];
    });
  }

  function ubicarPanel(x, y) {
    x = Math.min(Math.max(4, x), Math.max(4, innerWidth - 60));
    y = Math.min(Math.max(4, y), Math.max(4, innerHeight - 44));
    ui.panel.style.left = x + "px";
    ui.panel.style.top = y + "px";
    prefs.panel = { x, y };
  }

  function avisar(texto) {
    ui.toast.textContent = texto;
    ui.toast.classList.add("ve");
    clearTimeout(avisar.t);
    avisar.t = setTimeout(() => ui.toast.classList.remove("ve"), 2200);
  }

  /* ───────────────────────── Selección, alcance y puntería ───────────────────────── */
  let modo = prefs.modo;
  let sel = null; // pieza elegida
  let hov = null; // pieza bajo el puntero
  let escopo = null; // pieza en la que se «entró» (doble clic): se eligen sus hijos directos
  let gesto = null;

  const cadenaDe = (p) => {
    const c = [];
    for (let q = p; q; q = q.padre) c.unshift(q);
    return c;
  };

  /* La pieza que se elige al tocar en (x, y): la más alta bajo el puntero, llevada al nivel del alcance actual. */
  function hallar(x, y, profundo) {
    for (const e of document.elementsFromPoint(x, y)) {
      if (e === host) continue;
      const z = e.closest && e.closest("[data-pieza]");
      if (!z) continue;
      const p = piezas.get(z.getAttribute("data-pieza"));
      if (!p) continue;
      const c = cadenaDe(p);
      if (profundo) return c[c.length - 1];
      if (escopo) {
        const i = c.indexOf(escopo);
        if (i >= 0) return c[i + 1] || c[i];
      }
      return c[0];
    }
    return null;
  }

  function seleccionar(p, { desdeArbol } = {}) {
    sel = p;
    if (p && desdeArbol) escopo = p.padre;
    if (!p) escopo = null;
    refrescarPanel();
  }

  /* ───────────────────────── Marcos que siguen a la pieza ───────────────────────── */
  function colocar(caja, el, oculto) {
    if (!el || oculto || !el.isConnected) {
      caja.style.display = "none";
      return null;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) {
      caja.style.display = "none";
      return null;
    }
    caja.style.display = "block";
    caja.style.transform = `translate(${r.left}px,${r.top}px)`;
    caja.style.width = r.width + "px";
    caja.style.height = r.height + "px";
    return r;
  }

  function bucle() {
    if (modo === "editar") {
      ui.capa.style.display = "";
      const r = colocar(ui.marco, sel && sel.el);
      if (r && sel) {
        const g = sel.mat ? sel.g : null;
        ui.etq.textContent = sel.nombre + " · " + R(r.width) + "×" + R(r.height) + (cambiada(sel) ? " · movida" : "");
        ui.marco.classList.toggle("fija", sel.modo === "fijo");
      }
      const h = hov && hov !== sel ? hov : null;
      if (colocar(ui.hov, h && h.el) && h) ui.hovNom.textContent = h.nombre;
    } else {
      ui.marco.style.display = "none";
      ui.hov.style.display = "none";
    }
    requestAnimationFrame(bucle);
  }

  /* ───────────────────────── Gestos: mover y redimensionar con imán ───────────────────────── */
  // «Plano» = coordenadas de página; las piezas pegadas a la ventana usan las de la ventana.
  const plano = (e, p) => (p && p.modo === "fijo" ? { x: e.clientX, y: e.clientY } : { x: e.clientX + scrollX, y: e.clientY + scrollY });
  const rectPlano = (el, fijo) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + (fijo ? 0 : scrollX), y: r.top + (fijo ? 0 : scrollY), w: r.width, h: r.height };
  };

  function candidatos(p) {
    const fijo = p.modo === "fijo";
    const x = [];
    const y = [];
    const hermanas = (p.padre ? p.padre.hijos : raices()).filter((q) => q !== p && q.el.getClientRects().length);
    const suma = (r) => {
      x.push(r.x, r.x + r.w / 2, r.x + r.w);
      y.push(r.y, r.y + r.h / 2, r.y + r.h);
    };
    for (const q of hermanas) suma(rectPlano(q.el, fijo));
    const marco = p.padre ? p.padre.el : document.querySelector("main") || document.body;
    suma(rectPlano(marco, fijo));
    return { x, y };
  }

  const cercana = (v, lineas) => {
    let mejor = null;
    let dist = UMBRAL_IMAN + 1;
    for (const l of lineas) {
      const d = Math.abs(l - v);
      if (d < dist) {
        dist = d;
        mejor = l;
      }
    }
    return mejor == null ? null : { linea: mejor, d: mejor - v };
  };

  function iniciar(tipo, p, e, dir) {
    if (!materializar(p)) {
      avisar("Esta pieza no tiene caja que mover");
      return;
    }
    const pl = plano(e, p);
    gesto = {
      tipo,
      p,
      dir,
      id: e.pointerId,
      x0: pl.x,
      y0: pl.y,
      g0: { ...p.g },
      r0: rectPlano(p.el, p.modo === "fijo"),
      cand: candidatos(p),
      umbral: tipo === "redim",
      ultimo: e,
    };
    document.documentElement.style.userSelect = "none";
    document.documentElement.style.cursor = tipo === "redim" ? getComputedStyle(e.target.nodeType ? e.target : document.body).cursor : "grabbing";
    try {
      document.documentElement.setPointerCapture(e.pointerId);
    } catch {
      /* algunos navegadores no capturan sobre el elemento raíz */
    }
    gesto.auto = setInterval(autodesplazar, 30);
  }

  function autodesplazar() {
    if (!gesto || gesto.p.modo === "fijo" || !gesto.umbral) return;
    const y = gesto.ultimo.clientY;
    const paso = y > innerHeight - 56 ? 16 : y < 70 ? -16 : 0;
    if (!paso) return;
    const antes = scrollY;
    scrollBy(0, paso);
    if (scrollY !== antes) gestoMover(gesto.ultimo);
  }

  function dibujarGuias(gx, gy) {
    const fijo = gesto && gesto.p.modo === "fijo";
    const [v1, v2, h1, h2] = ui.guias;
    const pon = (g, v, eje) => {
      if (v == null) {
        g.style.display = "none";
        return;
      }
      g.style.display = "block";
      if (eje === "x") g.style.left = v - (fijo ? 0 : scrollX) + "px";
      else g.style.top = v - (fijo ? 0 : scrollY) + "px";
    };
    pon(v1, gx[0], "x");
    pon(v2, gx[1], "x");
    pon(h1, gy[0], "y");
    pon(h2, gy[1], "y");
  }

  function gestoMover(e) {
    const g = gesto;
    g.ultimo = e;
    const p = g.p;
    const pl = plano(e, p);
    let dx = pl.x - g.x0;
    let dy = pl.y - g.y0;
    if (!g.umbral) {
      if (Math.hypot(dx, dy) < 3) return;
      g.umbral = true;
    }
    const imantar = prefs.iman && !e.altKey;
    if (g.tipo === "mover") {
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const guiasX = [];
      const guiasY = [];
      if (imantar) {
        const L = g.r0.x + dx;
        const T = g.r0.y + dy;
        let mx = null;
        let my = null;
        for (const v of [L, L + g.r0.w / 2, L + g.r0.w]) {
          const m = cercana(v, g.cand.x);
          if (m && (!mx || Math.abs(m.d) < Math.abs(mx.d))) mx = m;
        }
        for (const v of [T, T + g.r0.h / 2, T + g.r0.h]) {
          const m = cercana(v, g.cand.y);
          if (m && (!my || Math.abs(m.d) < Math.abs(my.d))) my = m;
        }
        if (mx && !(e.shiftKey && dx === 0)) {
          dx += mx.d;
          guiasX.push(mx.linea);
        }
        if (my && !(e.shiftKey && dy === 0)) {
          dy += my.d;
          guiasY.push(my.linea);
        }
      }
      p.g.x = g.g0.x + dx;
      p.g.y = g.g0.y + dy;
      dibujarGuias(guiasX, guiasY);
    } else {
      const d = g.dir;
      let L = g.r0.x;
      let T = g.r0.y;
      let W = g.r0.w;
      let H = g.r0.h;
      if (d.includes("e")) W = g.r0.w + dx;
      if (d.includes("s")) H = g.r0.h + dy;
      if (d.includes("w")) {
        L = g.r0.x + dx;
        W = g.r0.w - dx;
      }
      if (d.includes("n")) {
        T = g.r0.y + dy;
        H = g.r0.h - dy;
      }
      const guiasX = [];
      const guiasY = [];
      if (imantar) {
        let m;
        if (d.includes("e") && (m = cercana(L + W, g.cand.x))) {
          W += m.d;
          guiasX.push(m.linea);
        }
        if (d.includes("w") && (m = cercana(L, g.cand.x))) {
          L += m.d;
          W -= m.d;
          guiasX.push(m.linea);
        }
        if (d.includes("s") && (m = cercana(T + H, g.cand.y))) {
          H += m.d;
          guiasY.push(m.linea);
        }
        if (d.includes("n") && (m = cercana(T, g.cand.y))) {
          T += m.d;
          H -= m.d;
          guiasY.push(m.linea);
        }
      }
      if (e.shiftKey && d.length === 2) {
        const razon = g.r0.w / g.r0.h;
        H = W / razon;
        if (d.includes("n")) T = g.r0.y + g.r0.h - H;
        if (d.includes("w")) L = g.r0.x + g.r0.w - W;
      }
      if (W < MINIMO) {
        if (d.includes("w")) L -= MINIMO - W;
        W = MINIMO;
      }
      if (H < MINIMO) {
        if (d.includes("n")) T -= MINIMO - H;
        H = MINIMO;
      }
      p.g.x = g.g0.x + (L - g.r0.x);
      p.g.y = g.g0.y + (T - g.r0.y);
      p.g.w = W;
      p.g.h = H;
      dibujarGuias(guiasX, guiasY);
    }
    aplicar(p);
  }

  function terminarGesto(cancelar) {
    if (!gesto) return;
    const g = gesto;
    clearInterval(g.auto);
    try {
      document.documentElement.releasePointerCapture(g.id);
    } catch {
      /* ya no estaba capturado */
    }
    document.documentElement.style.userSelect = "";
    document.documentElement.style.cursor = "";
    dibujarGuias([], []);
    gesto = null;
    if (cancelar) {
      g.p.g = { ...g.g0 };
      aplicar(g.p);
    } else if (g.umbral) confirmar();
    refrescarPanel();
  }

  /* ───────────────────────── Eventos de la página ───────────────────────── */
  const dentroDelEditor = (e) => e.composedPath().includes(host);
  const esCampo = (e) => {
    const t = e.composedPath()[0];
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  };

  const archivoDe = (id) => (CFG.estados.find((x) => x.id === id) || {}).archivo;

  function alProbar(e) {
    const mapa = CFG.va[M.estado] || [];
    for (const m of mapa) {
      let hit = null;
      try {
        hit = e.target.closest(m.sel);
      } catch {
        /* selector malo */
      }
      if (hit) {
        const dest = archivoDe(m.a);
        if (dest) location.href = dest;
        return;
      }
    }
  }

  function eventos() {
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (dentroDelEditor(e) || modo !== "editar" || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const p = hallar(e.clientX, e.clientY);
        if (!p) return seleccionar(null);
        if (p !== sel) seleccionar(p);
        iniciar("mover", p, e);
      },
      true,
    );
    document.addEventListener(
      "pointermove",
      (e) => {
        if (gesto) {
          if (e.pointerId === gesto.id) gestoMover(e);
          return;
        }
        if (modo !== "editar" || dentroDelEditor(e)) {
          hov = null;
          return;
        }
        hov = hallar(e.clientX, e.clientY);
      },
      true,
    );
    document.addEventListener("pointerup", (e) => gesto && e.pointerId === gesto.id && terminarGesto(false), true);
    document.addEventListener("pointercancel", () => terminarGesto(true), true);
    document.addEventListener(
      "dblclick",
      (e) => {
        if (dentroDelEditor(e) || modo !== "editar") return;
        e.preventDefault();
        e.stopPropagation();
        const dentro = hallar(e.clientX, e.clientY, true);
        if (!dentro) return;
        const c = cadenaDe(dentro);
        const base = sel && c.includes(sel) ? sel : c[0];
        const i = c.indexOf(base);
        if (c[i + 1]) {
          escopo = base;
          seleccionar(c[i + 1]);
        }
      },
      true,
    );
    // Lo que el ERP haría con un clic (navegar, abrir, guardar) no pasa aquí: en «Editar» no hace nada y en «Probar» solo recorre el flujo.
    document.addEventListener(
      "click",
      (e) => {
        if (dentroDelEditor(e)) return;
        if (modo === "editar") {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (e.target.closest && e.target.closest("a,button,form")) e.preventDefault();
        alProbar(e);
      },
      true,
    );
    document.addEventListener("submit", (e) => e.preventDefault(), true);
    document.addEventListener("dragstart", (e) => modo === "editar" && e.preventDefault(), true);
    document.addEventListener("selectstart", (e) => modo === "editar" && !dentroDelEditor(e) && e.preventDefault(), true);

    document.addEventListener(
      "keydown",
      (e) => {
        if (esCampo(e)) return;
        const k = e.key;
        const meta = e.metaKey || e.ctrlKey;
        if (meta && k.toLowerCase() === "z") {
          e.preventDefault();
          return e.shiftKey ? irA(histI + 1) : irA(histI - 1);
        }
        if (meta && k.toLowerCase() === "y") {
          e.preventDefault();
          return irA(histI + 1);
        }
        if (k === "Escape") {
          if (gesto) return terminarGesto(true);
          if (ui.modal.classList.contains("ab")) return ui.modal.classList.remove("ab");
          if (modo === "probar" && M.estado === "sin-aviso") location.href = archivoDe("portada");
          if (modo === "editar" && sel) {
            const sube = sel.padre;
            escopo = sube ? sube.padre : null;
            seleccionar(sube);
          }
          return;
        }
        if (modo !== "editar" || !sel) return;
        const paso = e.shiftKey ? 10 : 1;
        const mov = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[k];
        if (mov) {
          e.preventDefault();
          if (!materializar(sel)) return;
          sel.g.x += mov[0];
          sel.g.y += mov[1];
          aplicar(sel);
          confirmarPronto();
        } else if (k === "Delete" || k === "Backspace") {
          e.preventDefault();
          alternarOculta(sel);
        } else if (k === "]") {
          alFrente(sel);
        } else if (k === "[") {
          atras(sel);
        }
      },
      true,
    );
    window.addEventListener("resize", () => ubicarPanel(prefs.panel.x, prefs.panel.y));
  }

  /* ───────────────────────── Acciones sobre una pieza ───────────────────────── */
  function alternarOculta(p) {
    if (!materializar(p)) return;
    p.oculta = !p.oculta;
    aplicar(p);
    confirmar();
  }
  function alFrente(p) {
    if (!materializar(p)) return;
    p.z = Math.max(10, ...orden.map((q) => q.z || 0)) + 1;
    aplicar(p);
    confirmar();
  }
  function atras(p) {
    if (!materializar(p)) return;
    p.z = p.z && p.z > 11 ? p.z - 1 : null;
    aplicar(p);
    confirmar();
  }
  function restablecerPieza(p) {
    desmaterializar(p);
    confirmar();
  }
  function restablecerTodo() {
    for (const p of orden) desmaterializar(p);
    sel = null;
    escopo = null;
    confirmar();
    avisar("La pantalla volvió a como está hoy en el ERP");
  }

  /* ───────────────────────── Panel ───────────────────────── */
  // El (0, 0) de las medidas es la esquina superior izquierda del contenido de la pantalla (no del menú ni de la cabecera general).
  const lienzo = () => {
    const m = document.querySelector("main");
    return (m && m.querySelector(":scope > div")) || m || document.body;
  };

  function medidasDe(p) {
    const L = lienzo().getBoundingClientRect();
    const r = p.el.getBoundingClientRect();
    return { x: R(r.left - L.left), y: R(r.top - L.top), w: R(r.width), h: R(r.height) };
  }
  function medidasNaturales(p) {
    const L = lienzo().getBoundingClientRect();
    const r = (p.ph || p.el).getBoundingClientRect();
    return { x: R(r.left - L.left), y: R(r.top - L.top), w: R(r.width), h: R(r.height) };
  }

  function refrescarPanel() {
    if (!ui.panel) return;
    ui.panel.querySelectorAll("[data-modo]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.modo === modo)));
    raiz.querySelector('[data-a="deshacer"]').disabled = histI <= 0;
    raiz.querySelector('[data-a="rehacer"]').disabled = histI >= hist.length - 1;
    raiz.querySelector('[data-a="restablecer"]').disabled = !orden.some((p) => p.mat);

    if (!sel) {
      ui.insp.innerHTML = `<div class="vacio">Haz clic sobre una pieza de la pantalla (o elígela abajo) para moverla o cambiarle el tamaño.</div>`;
    } else {
      const m = medidasDe(sel);
      const nat = sel.mat ? medidasNaturales(sel) : m;
      ui.insp.innerHTML = `<div class="nom">${sel.nombre}</div>
        <div class="vacio">Hoy: x ${nat.x} · y ${nat.y} · ${nat.w}×${nat.h}</div>
        <div class="num">
          <label>X<input data-c="x" type="number" value="${m.x}"></label><label>Y<input data-c="y" type="number" value="${m.y}"></label>
          <label>Ancho<input data-c="w" type="number" min="${MINIMO}" value="${m.w}"></label><label>Alto<input data-c="h" type="number" min="${MINIMO}" value="${m.h}"></label>
        </div>
        <div class="fila">
          <button class="b" data-a="frente">Al frente</button><button class="b" data-a="atras">Atrás</button>
          <button class="b" data-a="ocultar">${sel.oculta ? "Mostrar" : "Ocultar"}</button>
          <button class="b" data-a="subir" ${sel.padre ? "" : "disabled"}>Elegir la de arriba</button>
          <button class="b" data-a="restablecer-pieza" ${sel.mat ? "" : "disabled"}>Volver a su sitio</button>
        </div>`;
    }
    ui.arbol.innerHTML = orden
      .map(
        (p) =>
          `<div class="nodo${p.oculta ? " oc" : ""}" data-id="${p.id}" aria-selected="${p === sel}" style="padding-left:${6 + p.prof * 14}px"><span class="n">${p.nombre}</span>${
            cambiada(p) ? '<i class="pto" title="Movida o redimensionada"></i>' : ""
          }<button class="ojo" data-ojo="${p.id}" title="${p.oculta ? "Mostrar" : "Ocultar"}">${p.oculta ? "○" : "●"}</button></div>`,
      )
      .join("");
  }

  function conectarPanel() {
    raiz.addEventListener("click", (e) => {
      const t = e.target.closest("[data-a],[data-modo],[data-id],[data-ojo]");
      if (!t) return;
      if (t.dataset.modo) return ponerModo(t.dataset.modo);
      if (t.dataset.ojo) {
        e.stopPropagation();
        return alternarOculta(piezas.get(t.dataset.ojo));
      }
      if (t.dataset.id) return seleccionar(piezas.get(t.dataset.id), { desdeArbol: true });
      switch (t.dataset.a) {
        case "plegar":
          prefs.plegado = !prefs.plegado;
          ui.panel.classList.toggle("plegado", prefs.plegado);
          return guardarPrefs();
        case "deshacer":
          return irA(histI - 1);
        case "rehacer":
          return irA(histI + 1);
        case "restablecer":
          return restablecerTodo();
        case "exportar":
          return exportar();
        case "cerrar-modal":
          return ui.modal.classList.remove("ab");
        case "copiar":
          return copiar();
        case "frente":
          return sel && alFrente(sel);
        case "atras":
          return sel && atras(sel);
        case "ocultar":
          return sel && alternarOculta(sel);
        case "subir":
          if (sel && sel.padre) {
            escopo = sel.padre.padre;
            seleccionar(sel.padre);
          }
          return;
        case "restablecer-pieza":
          return sel && restablecerPieza(sel);
      }
    });
    raiz.addEventListener("change", (e) => {
      const c = e.target;
      if (c.dataset.pref) {
        prefs[c.dataset.pref] = c.checked;
        guardarPrefs();
        if (c.dataset.pref === "oscuro") ponerTema();
      } else if (c.dataset.c && sel) {
        const v = parseFloat(c.value);
        if (!isFinite(v) || !materializar(sel)) return;
        const m = medidasDe(sel);
        const k = c.dataset.c;
        if (k === "x") sel.g.x += v - m.x;
        if (k === "y") sel.g.y += v - m.y;
        if (k === "w") sel.g.w = Math.max(MINIMO, v);
        if (k === "h") sel.g.h = Math.max(MINIMO, v);
        aplicar(sel);
        confirmar();
      }
    });
    // Las manijas viven en el shadow DOM: empiezan el gesto de redimensionar.
    ui.marco.addEventListener("pointerdown", (e) => {
      const d = e.target.dataset && e.target.dataset.d;
      if (!d || !sel || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      iniciar("redim", sel, e, d);
    });
    // El panel se arrastra por su cabecera.
    ui.panel.querySelector("[data-arrastre]").addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      const x0 = e.clientX - ui.panel.offsetLeft;
      const y0 = e.clientY - ui.panel.offsetTop;
      const mueve = (ev) => ubicarPanel(ev.clientX - x0, ev.clientY - y0);
      const suelta = () => {
        removeEventListener("pointermove", mueve);
        removeEventListener("pointerup", suelta);
        guardarPrefs();
      };
      addEventListener("pointermove", mueve);
      addEventListener("pointerup", suelta);
    });
  }

  function ponerModo(m) {
    modo = prefs.modo = m;
    guardarPrefs();
    if (m !== "editar") {
      sel = null;
      hov = null;
      escopo = null;
    }
    document.documentElement.toggleAttribute("data-rm-editando", m === "editar");
    refrescarPanel();
    avisar(m === "editar" ? "Editar: clic elige, arrastra mueve" : "Probar: los toques recorren el flujo");
  }

  function ponerTema() {
    document.documentElement.setAttribute("data-tema", prefs.oscuro ? "oscuro" : "claro");
  }

  /* ───────────────────────── Exportar la disposición ───────────────────────── */
  function exportar() {
    const L = lienzo().getBoundingClientRect();
    const filas = [];
    const cambios = [];
    for (const p of orden) {
      const ahora = medidasDe(p);
      const antes = p.mat ? medidasNaturales(p) : ahora;
      const sangria = "  ".repeat(p.prof);
      filas.push(`${sangria}- ${p.nombre}: x ${ahora.x}, y ${ahora.y}, ${ahora.w}×${ahora.h}${p.oculta ? " (OCULTA)" : ""}`);
      if (cambiada(p)) {
        const partes = [];
        if (antes.x !== ahora.x || antes.y !== ahora.y) partes.push(`de (${antes.x}, ${antes.y}) a (${ahora.x}, ${ahora.y})`);
        if (antes.w !== ahora.w || antes.h !== ahora.h) partes.push(`tamaño ${antes.w}×${antes.h} → ${ahora.w}×${ahora.h}`);
        if (p.oculta) partes.push("oculta");
        if (p.z != null) partes.push("al frente");
        cambios.push(`- ${p.nombre}: ${partes.join(" · ")}`);
      }
    }
    const texto = [
      `MAQUETA EDITABLE · Recibir mercadería · ${ESTADO.nombre} (${ESTADO.ruta || M.capturado || ""})`,
      `Ventana ${innerWidth}×${innerHeight} · zona de contenido de ${R(L.width)} px de ancho · tema ${prefs.oscuro ? "oscuro" : "claro"}`,
      `x, y = esquina superior izquierda de la pieza dentro de la zona de contenido; medidas en px.`,
      ``,
      cambios.length ? `LO QUE CAMBIÉ (${cambios.length})` : `NO CAMBIÉ NADA: está igual que hoy en el ERP.`,
      ...cambios,
      ``,
      `TODAS LAS PIEZAS (en su sitio de ahora)`,
      ...filas,
      ``,
      `JSON (para volver a cargar):`,
      JSON.stringify({ estado: M.estado, ancho: innerWidth, capa: capaActual() }),
    ].join("\n");
    ui.texto.value = texto;
    ui.ok.textContent = "";
    ui.modal.classList.add("ab");
    ui.texto.focus();
    ui.texto.select();
  }

  async function copiar() {
    ui.texto.select();
    let bien = false;
    try {
      await navigator.clipboard.writeText(ui.texto.value);
      bien = true;
    } catch {
      try {
        bien = document.execCommand("copy");
      } catch {
        bien = false;
      }
    }
    ui.ok.textContent = bien ? "Copiado. Pégalo en el chat." : "Selecciona el texto y cópialo con Ctrl/⌘ C.";
  }

  /* ───────────────────────── Arranque ───────────────────────── */
  function arrancar() {
    ponerTema();
    resolver();
    montarUI();
    conectarPanel();
    const guardada = leer(KEY_CAPA, null);
    if (guardada && Object.keys(guardada).length) aplicarCapa(guardada);
    hist = [JSON.stringify(capaActual())];
    histI = 0;
    document.documentElement.toggleAttribute("data-rm-editando", modo === "editar");
    refrescarPanel();
    eventos();
    bucle();
    // Para quien quiera inspeccionar o automatizar desde la consola.
    window.maqueta = { piezas, seleccionar: (id) => seleccionar(piezas.get(id), { desdeArbol: true }), exportar, restablecer: restablecerTodo, capa: capaActual, modo: ponerModo };
  }

  const cuando = () => (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve());
  if (document.readyState === "complete") cuando().then(arrancar);
  else addEventListener("load", () => cuando().then(arrancar));
})();
