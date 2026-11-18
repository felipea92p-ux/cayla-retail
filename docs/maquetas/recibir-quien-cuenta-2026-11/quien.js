// Maqueta navegable: dónde se pide «Quién cuenta» en Recibir mercadería. No guarda nada; todo es inventado.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ico = (n, c = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${c}" aria-hidden="true">${window.ICONOS[n] || ""}</svg>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const EQUIPO = ["Janis Rojas", "Marco Díaz", "Lucía Paredes"];
  const CATS = ["Conjuntos", "Vestidos", "Casacas", "Pantalones"];
  const MARCAS = ["Sin marca", "Aurora", "Bahía"];
  const ini = (n) => n.split(" ").map((p) => p[0]).slice(0, 2).join("");
  const PASOS = ["Empezar a recibir", "Contar", "¿Qué llegó?", "Agregado"];

  const NOTAS = {
    hoy: "<b>Hoy.</b> «Quién cuenta» aparece al final del resumen, abajo a la derecha. La hoja «¿Qué llegó?» no lo menciona: si falta, la base lo rechaza y la hoja culpa a la conexión. Prueba: terminal, paso 3, «Agregar y contar».",
    a: "<b>A · Al empezar.</b> Se pregunta antes de «Empezar a recibir» y queda recordado: quien abre el conteo firma todos sus pasos (así funciona hoy). En Contar solo se ve una línea tranquila con «Cambiar».",
    b: "<b>B · Franja en Contar.</b> Una franja arriba de la lista, siempre a la vista. En una terminal, mientras no se elige, «Agregar» espera. No resuelve a quien nunca la mira, pero se ve sin bajar.",
    c: "<b>C · En la hoja.</b> «Quién cuenta» es el primer campo de «¿Qué llegó?» cuando falta, con la luz de la guía de foco. Resuelve justo el error de la captura, pero llega tarde para quien cuenta una línea de la guía.",
    rec: "<b>A + C (mi propuesta).</b> Se pide una vez al empezar (lo normal: ya queda para todo el conteo) y la hoja lo vuelve a pedir solo si aún falta. Una persona con sesión nunca ve nada de esto.",
  };

  const nuevo = () => ({ opcion: "rec", cuenta: "terminal", quien: null, paso: 1, agregados: [], error: false, cat: "", marca: "", visto: { 1: false } });
  let S = nuevo();
  const falta = () => S.cuenta === "terminal" && !S.quien;
  const pideAlEmpezar = () => S.opcion === "a" || S.opcion === "rec";
  const pideEnHoja = () => S.opcion === "c" || S.opcion === "rec";

  function aviso(t) {
    const d = document.createElement("div");
    d.className = "qc-toast";
    d.textContent = t;
    $("#avisos").append(d);
    setTimeout(() => d.remove(), 3600);
  }

  // Lista flotante para los combos
  function cerrarLista() { $(".bm-lista-flotante")?.remove(); document.removeEventListener("pointerdown", fuera, true); }
  function fuera(e) { if (!e.target.closest(".bm-lista-flotante")) { e.stopPropagation(); cerrarLista(); } }
  function abrirLista(ancla, opciones, valor, alElegir) {
    cerrarLista();
    const r = ancla.getBoundingClientRect();
    const l = document.createElement("div");
    l.className = "bm-lista-flotante anim-revelar lista-flotante scroll-cayla rounded-lg";
    l.setAttribute("role", "listbox");
    l.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 260))}px`;
    l.style.top = `${r.bottom + 6}px`;
    l.style.minWidth = `${Math.max(192, r.width)}px`;
    l.style.zIndex = 120;
    l.innerHTML = opciones.map((o, i) => `<button type="button" role="option" class="bm-op" data-i="${i}" aria-selected="${o === valor}">${esc(o)}${o === valor ? ico("check") : ""}</button>`).join("");
    l.addEventListener("click", (e) => {
      const b = e.target.closest(".bm-op");
      if (!b) return;
      cerrarLista();
      alElegir(opciones[+b.dataset.i]);
    });
    document.body.append(l);
    setTimeout(() => document.addEventListener("pointerdown", fuera, true));
    $(".bm-op[aria-selected=true], .bm-op", l).focus();
  }

  const combo = (id, texto, vacio, accion, luz = false) =>
    `<button type="button" class="qc-pozo" id="${id}" data-accion="${accion}" ${vacio ? "data-vacio" : ""} ${luz ? "data-luz" : ""} aria-haspopup="listbox">${texto}${ico("chevron-down")}</button>`;
  const comboQuien = (id, luz) =>
    combo(id, S.quien ? `<span class="bm-avatar">${ini(S.quien)}</span>${esc(S.quien)}` : "Elige quién cuenta", !S.quien, "abrir-quien", luz);
  const campoQuien = (id, luz, rotulo = "Quién cuenta") =>
    `<div class="qc-campo" data-campo="quien"><div class="qc-etiqueta">${S.quien ? `<span class="qc-visto">${ico("check")}</span>` : ""}${rotulo}${S.quien ? "" : " <em>*</em>"}</div>${comboQuien(id, luz)}</div>`;
  const lineaQuien = () =>
    S.cuenta === "persona"
      ? `<div class="qc-linea"><span class="bm-avatar">LP</span><span>Cuenta: <b>Lucía Paredes</b> · tu sesión</span></div>`
      : `<div class="qc-linea"><span class="bm-avatar">${ini(S.quien)}</span><span>Cuenta: <b>${esc(S.quien)}</b></span><button type="button" class="btn-cayla btn-enlace qc-cambiar" data-accion="abrir-quien" id="cambiar">Cambiar</button></div>`;

  // ---- Escenas -------------------------------------------------------------------------------------------------------------------------
  function escenaEmpezar() {
    const pide = pideAlEmpezar() && S.cuenta === "terminal";
    const bloqueado = pide && falta();
    return `<div class="qc-tarjeta">
      <h2>Llegó un envío de Lima</h2>
      <p class="qc-bajada">12 modelos · 340 prendas según la guía. Cuando empieces, todo lo que cuentes queda a nombre de quien cuenta.</p>
      ${pide ? campoQuien("combo-quien", falta(), "¿Quién va a contar?") : ""}
      ${!pide && S.cuenta === "persona" ? lineaQuien() : ""}
      <div class="qc-pie">
        ${bloqueado ? `<span class="qc-ayuda" data-falta>Falta: elegir quién cuenta.</span>` : ""}
        <button type="button" class="btn-cayla btn-primario" data-accion="empezar" ${bloqueado ? "disabled" : ""}>Empezar a recibir ${ico("arrow-right", "h-4 w-4")}</button>
      </div>
    </div>`;
  }

  function franja() {
    if (S.cuenta === "persona") return "";
    const visible = S.opcion === "b" || ((S.opcion === "a" || S.opcion === "rec") && S.quien);
    if (!visible) return "";
    if (S.opcion === "b" && falta())
      return `<div class="qc-franja" data-falta><div class="qc-franja-texto"><b>Antes de contar: ¿quién cuenta?</b><span>Lo que contaste queda a su nombre.</span></div>${comboQuien("combo-quien", true)}</div>`;
    return `<div class="qc-franja">${lineaQuien()}</div>`;
  }

  function filas() {
    const base = [["vestidos", "Vestidos", "Aurora", 120], ["camisas", "Camisas", "Bahía", 80]];
    const todas = [...base.map((b) => ({ ic: b[0], n: b[1], m: b[2], c: b[3] })), ...S.agregados];
    return todas.map((f, i) => `<div class="qc-fila" ${f.nuevo && S.paso === 4 ? "data-nueva" : ""}><span class="qc-fila-ic">${ico("package")}</span><span class="qc-fila-nombre">${esc(f.n)}<span>${esc(f.m)}${f.nuevo ? " · fuera de la guía" : ""}</span></span><span class="qc-fila-num">${f.c}</span></div>`).join("");
  }

  function escenaContar() {
    const espera = S.opcion === "b" && falta();
    const total = 200 + S.agregados.reduce((a, f) => a + f.c, 0);
    return `<div style="display:grid;gap:16px">
      ${franja()}
      <div class="qc-tarjeta">
        <h2>Contar el envío</h2>
        <div style="display:grid;gap:8px">${filas()}</div>
        <div class="qc-pie">
          ${espera ? `<span class="qc-ayuda" data-falta>Elige quién cuenta para seguir.</span>` : ""}
          ${S.paso === 4 ? `<span class="qc-sello" data-bien>${ico("check", "h-3 w-3")} Se agregó y quedó a nombre de ${esc(S.cuenta === "persona" ? "Lucía Paredes" : S.quien)}</span>` : ""}
          <button type="button" class="btn-cayla btn-secundario" data-accion="abrir-hoja" ${espera ? "disabled" : ""}>+ Agregar lo que llegó</button>
        </div>
      </div></div>`;
  }
  function resumen() {
    const total = 200 + S.agregados.reduce((a, f) => a + f.c, 0);
    const hoyAlFinal = S.opcion === "hoy" && S.cuenta === "terminal";
    return `<aside class="qc-tarjeta qc-resumen"><h2 style="font-size:22px">Resumen del envío</h2>
      <dl><div class="qc-grande"><dt>Contaste</dt><dd>${total}</dd></div><div><dt>Por contar</dt><dd>${S.agregados.length ? 0 : 2}</dd></div></dl>
      ${hoyAlFinal ? `<div class="qc-hoy-quien"><div class="qc-etiqueta">Quién cuenta ${S.quien ? "" : "<em>*</em>"}</div>${comboQuien("combo-quien", false)}<span class="qc-ayuda">Así está hoy: al final, sin avisar.</span></div>` : ""}
      <button type="button" class="btn-cayla btn-primario" disabled>Pasar a cerrar ${ico("arrow-right", "h-4 w-4")}</button>
    </aside>`;
  }

  function hojaHTML() {
    const pide = pideEnHoja() && S.cuenta === "terminal";
    const faltaQuien = pide && falta();
    const hecho = S.cat && S.marca;
    const bloqueado = faltaQuien || !hecho;
    return `<div class="bm-velo" id="velo"><div class="bm-hoja" role="dialog" aria-modal="true" aria-label="¿Qué llegó?">
      <button type="button" class="bm-hoja-cerrar" data-accion="cerrar-hoja" aria-label="Cerrar">${ico("x")}</button>
      <h2>¿Qué llegó?</h2><p class="bm-hoja-bajada">Agrega cada categoría que llegó y cuéntala.</p>
      <div style="display:grid;gap:16px;margin-top:16px">
        ${faltaQuien ? campoQuien("combo-quien", true) : pide ? `<div class="qc-linea">${lineaQuien().replace("qc-linea", "")}</div>` : ""}
        <div class="qc-campo"><div class="qc-etiqueta">${S.cat ? `<span class="qc-visto">${ico("check")}</span>` : ""}Qué llegó</div>${combo("combo-cat", S.cat ? esc(S.cat) : "Elige la categoría", !S.cat, "abrir-cat")}</div>
        <div class="qc-campo"><div class="qc-etiqueta">${S.marca ? `<span class="qc-visto">${ico("check")}</span>` : ""}La marca</div>${combo("combo-marca", S.marca ? esc(S.marca) : "Elige la marca", !S.marca, "abrir-marca")}</div>
        ${S.error ? `<div class="aviso-cayla" role="alert" style="padding:12px 14px;border-radius:14px;border:1px solid color-mix(in srgb,var(--color-rojo) 35%,transparent);background:color-mix(in srgb,var(--color-rojo) 6%,transparent)"><b style="color:var(--color-rojo-profundo)">No se pudo agregar</b><div style="font-size:14px">No se pudo agregar. Revisa la conexión y vuelve a intentar.</div><div style="font-size:12px;color:var(--color-taupe);margin-top:6px">(La base dijo, en verdad: «Elige quién hace esta operación».)</div></div>` : ""}
        ${faltaQuien ? `<p class="qc-ayuda" data-falta>Falta: elegir quién cuenta.</p>` : hecho ? `<p class="qc-ayuda">Todo listo.</p>` : ""}
        <div class="qc-hoja-pie"><button type="button" class="btn-cayla btn-secundario" data-accion="cerrar-hoja">Cancelar</button>
        <button type="button" class="btn-cayla btn-primario" data-accion="agregar" ${bloqueado && S.opcion !== "hoy" ? "disabled" : ""} ${S.opcion === "hoy" && !hecho ? "disabled" : ""}>+ Agregar y contar</button></div>
      </div></div></div>`;
  }

  // ---- Pintar -------------------------------------------------------------------------------------------------------------------------------
  function pintar() {
    $$("[data-cuenta]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cuenta === S.cuenta)));
    $$("[data-opcion]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.opcion === S.opcion)));
    $("#nota").innerHTML = NOTAS[S.opcion] + (S.cuenta === "persona" ? " <b>Con una persona con sesión no cambia nada: ya firma ella.</b>" : "");
    $("#pasos").innerHTML = PASOS.map((p, i) => `<li><button type="button" class="qc-paso" data-paso="${i + 1}" ${S.paso === i + 1 ? 'aria-current="step"' : ""} ${S.paso > i + 1 ? "data-hecho" : ""}>${p}</button></li>`).join("");
    const esc2 = $("#escena");
    if (S.paso === 1) { esc2.removeAttribute("data-dos"); esc2.innerHTML = escenaEmpezar(); }
    else { esc2.setAttribute("data-dos", ""); esc2.innerHTML = escenaContar() + resumen(); }
    $("#velo")?.remove();
    if (S.paso === 3) document.body.insertAdjacentHTML("beforeend", hojaHTML());
  }

  function ir(p) {
    cerrarLista();
    S.error = false;
    if (p >= 2 && falta() && pideAlEmpezar()) { S.paso = 1; aviso("Primero elige quién cuenta."); return pintar(); }
    if (p === 4 && !S.agregados.length) { S.agregados.push({ n: "Conjuntos", m: "Sin marca", c: 24, nuevo: true, ic: "package" }); }
    S.paso = p;
    pintar();
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.cuenta) { S.cuenta = t.dataset.cuenta; S.error = false; return pintar(); }
    if (t.dataset.opcion) { const keep = S.paso; S = { ...nuevo(), opcion: t.dataset.opcion, cuenta: S.cuenta, paso: 1 }; pintar(); return keep && void 0; }
    if (t.id === "reiniciar") { S = { ...nuevo(), opcion: S.opcion, cuenta: S.cuenta }; return pintar(); }
    if (t.dataset.paso) return ir(+t.dataset.paso);
    switch (t.dataset.accion) {
      case "empezar": S.paso = 2; pintar(); break;
      case "abrir-hoja": S.paso = 3; S.cat = ""; S.marca = ""; S.error = false; pintar(); break;
      case "cerrar-hoja": S.paso = 2; S.error = false; pintar(); break;
      case "abrir-quien": abrirLista(t, EQUIPO, S.quien, (n) => { S.quien = n; S.error = false; const p = S.paso; pintar(); if (p === 3) $("#velo") ; }); break;
      case "abrir-cat": abrirLista(t, CATS, S.cat, (n) => { S.cat = n; pintar(); }); break;
      case "abrir-marca": abrirLista(t, MARCAS, S.marca, (n) => { S.marca = n; pintar(); }); break;
      case "agregar":
        if (falta() && !pideEnHoja()) { S.error = true; return pintar(); } // lo que pasa hoy
        S.agregados.push({ n: S.cat, m: S.marca, c: 24, nuevo: true });
        S.paso = 4; aviso("Se agregó y quedó a nombre de quien cuenta."); pintar(); break;
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.paso === 3 && !$(".bm-lista-flotante")) { S.paso = 2; pintar(); } });
  pintar();
})();
