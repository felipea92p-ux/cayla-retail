/* Finanzas ▸ Resumen · maqueta 2026-11-09 · LA APP: el marco del ERP, la mesa de mando (sede y mes), el dock de la maqueta y el
   estado. El estado vive en la URL (#a&sede=tru&mes=2026-10&fondo=rejilla&hoja=plata), como ?sede= y ?mes= en Finanzas. */
(function () {
  "use strict";
  const C = window.CAYLA, Z = window.PZ, { ico } = Z;
  const raiz = document.documentElement;

  const estado = { camino: "a", sede: "todas", mes: C.MES_HOY, fondo: "aurora", hoja: null };
  const NOMBRE_FONDO = { aurora: "Aurora", rejilla: "Rejilla", clima: "Clima" };
  const NOMBRE_CAMINO = { a: "Bolsillos", b: "Tablero", c: "Camino" };
  const leerAlm = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const guardarAlm = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  function leerHash() {
    const h = location.hash.replace(/^#/, "").split("&");
    if (/^[abc]$/.test(h[0])) estado.camino = h[0];
    for (const par of h.slice(1)) {
      const [k, v] = par.split("=");
      if (k === "sede" && (v === "todas" || C.SEDES[v])) estado.sede = v;
      if (k === "mes" && C.MESES.includes(v)) estado.mes = v;
      if (k === "fondo" && NOMBRE_FONDO[v]) estado.fondo = v;
      if (k === "hoja") estado.hoja = v || null;
    }
  }
  function ponerHash(cambios = {}) {
    Object.assign(estado, cambios);
    const partes = [estado.camino];
    if (estado.sede !== "todas") partes.push(`sede=${estado.sede}`);
    if (estado.mes !== C.MES_HOY) partes.push(`mes=${estado.mes}`);
    partes.push(`fondo=${estado.fondo}`);
    if (estado.hoja) partes.push(`hoja=${estado.hoja}`);
    history.replaceState(null, "", `#${partes.join("&")}`);
  }
  const modeloActual = () => C.modelo(estado.sede, estado.mes);

  /* el clima del mes: lo pone el modelo (rojo si el mes pierde, ámbar si afloja o la plata libre no alcanza, verde si va bien) */
  function clima(m) {
    if (m.teDeja.mes < 0) return "rojo";
    const flojo = (m.teDeja.antMes != null && m.teDeja.mes < m.teDeja.antMes * 0.8) || m.ventas.cambio < -0.05 || (m.plata.libre != null && m.plata.libre < 0);
    return flojo ? "ambar" : "verde";
  }

  /* ---------------- el marco ---------------- */
  const MENU = [
    ["inicio", "Inicio", "Inicio"], ["pulso", "Salud del negocio", "Salud"], ["gestion", "Gestión", "Gestión"], ["venta", "Ventas", "Ventas"],
    ["web", "Tienda web", "Web"], ["inventario", "Inventario", "Inventario"], ["catalogo", "Catálogo", "Catálogo"], ["compras", "Compras", "Compras"],
    ["finanzas", "Finanzas", "Finanzas", ["Resumen", "Gastos", "Cuentas y dinero", "Estados financieros", "Impuestos", "Cierre de mes"]],
    ["clientes", "Clientes", "Clientes"], ["colaboradores", "Colaboradores", "Equipo"],
  ];
  function marco() {
    document.getElementById("riel").innerHTML = `<div class="riel-marca">${ico("colibri")}<b>CAYLA</b></div>
      <nav aria-label="Menú">${MENU.map(([i, n, corto, hijos]) => hijos
        ? `<button class="fila activa" aria-expanded="true">${ico(i)}<span class="largo">${n}</span><span class="corto">${corto}</span>${ico("der", "flecha")}</button>
           <div class="bandeja">${hijos.map((h, k) => `<a class="fila" href="#" ${k === 0 ? 'aria-current="page"' : ""} data-otra="${h}">${h}</a>`).join("")}</div>`
        : `<a class="fila" href="#" data-otra="${n}">${ico(i)}<span class="largo">${n}</span><span class="corto">${corto}</span></a>`).join("")}</nav>
      <div class="riel-pie"><span class="avatar">FA</span><div><b style="font-weight:500">Felipe A.</b><small>Admin · Trujillo</small></div></div>`;
    document.getElementById("cabecera").innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1">
        <button class="icono-btn btn-hamburguesa" data-cajon aria-label="Abrir el menú">${ico("menu")}</button>
        <div class="buscador" role="search">${ico("buscar")}<span>Buscar o preguntar en CAYLA</span><kbd>⌘K</kbd></div></div>
      <div class="cab-acciones">
        <button class="icono-btn solo-ancho" data-otra="Preguntar" aria-label="Preguntar">${ico("chispa")}</button>
        <button class="icono-btn" data-otra="Actividad" aria-label="Actividad">${ico("campana")}</button>
        <button class="icono-btn" data-tema aria-label="Cambiar a modo oscuro" title="Modo claro u oscuro">${ico(raiz.dataset.tema === "oscuro" ? "sol" : "luna")}</button>
      </div>`;
  }

  /* ---------------- la cabecera de la pantalla y la mesa de mando ---------------- */
  function selectorMes() {
    const i = C.MESES.indexOf(estado.mes);
    const p = C.partesMes(estado.mes);
    return `<div class="sel-mes" data-guia="mes" style="position:relative">
      <button data-mes-paso="-1" ${i <= 0 ? "disabled" : ""} aria-label="Mes anterior">${ico("izq")}</button>
      <button class="mes-nombre" data-mes-abrir aria-haspopup="true" aria-expanded="false">${p.nombre[0].toUpperCase() + p.nombre.slice(1)} ${p.anio}</button>
      <button data-mes-paso="1" ${i >= C.MESES.length - 1 ? "disabled" : ""} aria-label="Mes siguiente">${ico("der")}</button></div>`;
  }
  function mesa(m) {
    const sedes = [["todas", "Todas"], ...C.CLAVES_SEDE.map((s) => [s, C.SEDES[s].nombre])];
    return `<div class="mesa">
      <div class="seg" role="group" aria-label="Ver sede">${sedes.map(([k, n]) => `<button aria-pressed="${estado.sede === k}" data-sede="${k}">${n}</button>`).join("")}<span class="gota"></span></div>
      ${selectorMes()}
      <button class="btn" data-ocultar aria-pressed="${Z.ESTADO.ocultar}" title="Para mostrar la pantalla sin que se vean los montos">${ico(Z.ESTADO.ocultar ? "ojoNo" : "ojo")}<span class="solo-ancho">${Z.ESTADO.ocultar ? "Mostrar montos" : "Ocultar montos"}</span></button>
      ${m.avisos.length ? `<button class="btn" data-hoja="tetoca">Te toca<span class="globo-n ${m.avisos.some((a) => a.tono === "rojo") ? "urge" : ""}">${m.avisos.length}</span></button>` : ""}
      <button class="btn prim" data-otra="Registrar gasto" aria-label="Registrar gasto">${ico("mas")}<span class="txt">Registrar gasto</span></button>
    </div>`;
  }
  function encabezado(m) {
    const p = m.mes;
    const fecha = p.enCurso ? C.fecha(C.HOY, true) : `${p.nombre} ${p.anio} · mes cerrado`;
    const frase = window.CAMINOS[estado.camino].frase(m);
    return `<header class="encabezado"><div class="enc-izq">
      <div class="enc-linea">${m.nombreSede} · ${fecha}<span class="chip clima-chip ${clima(m)}">${{ verde: "El mes va bien", ambar: "Hay que mirarlo", rojo: "El mes pierde" }[clima(m)]}</span></div>
      <h1>Resumen</h1><p class="enc-frase cambia">${frase}</p></div>${mesa(m)}</header>`;
  }

  /* ---------------- dibujar ---------------- */
  let primera = true;
  function pintar({ suave = false } = {}) {
    const m = modeloActual();
    raiz.dataset.camino = estado.camino;
    raiz.dataset.fondo = estado.fondo;
    raiz.dataset.clima = clima(m);
    raiz.classList.toggle("oculto", Z.ESTADO.ocultar);
    const pag = document.getElementById("pagina");
    const cam = window.CAMINOS[estado.camino];
    pag.innerHTML = `${encabezado(m)}<div id="camino" class="camino-${estado.camino} ${suave ? "suave" : ""}">${cam.render(m)}</div>`;
    const caminoEl = document.getElementById("camino");
    [...caminoEl.querySelectorAll(".entra")].forEach((el, i) => el.style.setProperty("--i", el.style.getPropertyValue("--i") || i));
    Z.montarGraficos(pag); Z.montarBarras(pag, m); Z.contarCifras(pag);
    cam.montar && cam.montar(caminoEl, m);
    ubicarGotas();
    dock();
    document.title = `Resumen · ${NOMBRE_CAMINO[estado.camino]} · Finanzas`;
    if (primera && estado.hoja) setTimeout(() => Z.abrirHoja(estado.hoja), 400);
    primera = false;
  }
  function ubicarGotas() {
    document.querySelectorAll(".seg").forEach((seg) => {
      const on = seg.querySelector('[aria-pressed="true"],[aria-selected="true"]'), g = seg.querySelector(".gota");
      if (!on || !g) return;
      g.style.width = `${on.offsetWidth}px`;
      g.style.transform = `translateX(${on.offsetLeft - 4 + 4}px)`;
    });
  }
  function dock() {
    const d = document.getElementById("dock");
    d.innerHTML = `<div class="fila-dock"><span class="etq">Camino</span><div class="seg seg-chico" role="group" aria-label="Camino">${["a", "b", "c"].map((k) => `<button aria-pressed="${estado.camino === k}" data-camino="${k}"><b>${k.toUpperCase()}</b><span>${NOMBRE_CAMINO[k]}</span></button>`).join("")}<span class="gota"></span></div></div>
      <span class="dock-sep"></span>
      <div class="fila-dock"><span class="etq">Fondo</span><div class="seg seg-chico" role="group" aria-label="Fondo">${Object.entries(NOMBRE_FONDO).map(([k, n], i) => `<button aria-pressed="${estado.fondo === k}" data-fondo="${k}"><b>${i + 1}</b><span>${n}</span></button>`).join("")}<span class="gota"></span></div></div><span class="dock-sep"></span><span class="dock-nota">Maqueta<br>cifras de ejemplo</span>`;
    ubicarGotas();
  }

  /* ---------------- lo que se toca ---------------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button,a,[data-hoja]");
    if (!t) { cerrarMeses(); return; }
    if (t.matches("[data-cerrar]")) { Z.cerrarHoja(); return; }
    if (t.dataset.hoja) { e.preventDefault(); cerrarMeses(); Z.abrirHoja(t.dataset.hoja); return; }
    if (t.dataset.sede) { ponerHash({ sede: t.dataset.sede }); pintar({ suave: true }); return; }
    if (t.dataset.camino) { ponerHash({ camino: t.dataset.camino }); window.scrollTo({ top: 0 }); pintar(); return; }
    if (t.dataset.fondo) { ponerHash({ fondo: t.dataset.fondo }); guardarAlm("maq-fondo", t.dataset.fondo); raiz.dataset.fondo = t.dataset.fondo; dock(); return; }
    if (t.dataset.mesPaso) { const i = C.MESES.indexOf(estado.mes) + Number(t.dataset.mesPaso); if (C.MESES[i]) { ponerHash({ mes: C.MESES[i] }); pintar({ suave: true }); } return; }
    if (t.matches("[data-mes-abrir]")) { abrirMeses(t); return; }
    if (t.dataset.mesIr) { cerrarMeses(); ponerHash({ mes: t.dataset.mesIr }); pintar({ suave: true }); return; }
    if (t.matches("[data-ocultar]")) { Z.ESTADO.ocultar = !Z.ESTADO.ocultar; pintar({ suave: true }); return; }
    if (t.matches("[data-tema]")) {
      raiz.dataset.tema = raiz.dataset.tema === "oscuro" ? "claro" : "oscuro";
      guardarAlm("cayla-tema", raiz.dataset.tema); marco(); Z.montarGraficos(document); return;
    }
    if (t.matches("[data-cajon]")) { raiz.toggleAttribute("data-cajon"); return; }
    if (t.dataset.otra) { e.preventDefault(); raiz.removeAttribute("data-cajon"); Z.avisar(`«${t.dataset.otra}» ya existe en el ERP: la maqueta solo dibuja el Resumen.`); return; }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-hoja][role=button]")) { e.preventDefault(); Z.abrirHoja(e.target.dataset.hoja); }
    if (e.key === "Escape") { cerrarMeses(); raiz.removeAttribute("data-cajon"); }
  });
  document.querySelector(".velo-cajon").addEventListener("click", () => raiz.removeAttribute("data-cajon"));

  function abrirMeses(btn) {
    if (document.querySelector(".lista-meses")) { cerrarMeses(); return; }
    btn.setAttribute("aria-expanded", "true");
    const cont = btn.parentElement;
    const meses = [];
    for (let k = 0; k < 12; k++) {
      const c = `2026-${String(k + 1).padStart(2, "0")}`;
      const hay = C.MESES.includes(c), futuro = c > C.MES_HOY;
      meses.push(`<button ${hay ? `data-mes-ir="${c}"` : "disabled"} ${c === estado.mes ? 'aria-current="true"' : ""} title="${futuro ? "Todavía no llega" : hay ? "" : "Sin datos en la maqueta"}">${futuro ? ico("candado") : ""}${C.NOMBRE_MES[k].slice(0, 3)}</button>`);
    }
    cont.insertAdjacentHTML("beforeend", `<div class="lista-meses" role="menu"><span class="lm-anio">2026</span>${meses.join("")}<span class="lm-nota">La maqueta tiene de junio a noviembre.</span></div>`);
    const l = cont.querySelector(".lista-meses");
    const r = cont.getBoundingClientRect();
    if (r.left + 280 > innerWidth - 8) l.style.right = "0";
    l.querySelector('[aria-current="true"]')?.focus();
  }
  function cerrarMeses() {
    document.querySelectorAll(".lista-meses").forEach((x) => x.remove());
    document.querySelectorAll("[data-mes-abrir]").forEach((b) => b.setAttribute("aria-expanded", "false"));
  }
  addEventListener("resize", () => ubicarGotas());

  /* ---------------- arranque ---------------- */
  raiz.dataset.tema = leerAlm("cayla-tema", raiz.dataset.tema || "claro");
  estado.fondo = leerAlm("maq-fondo", "aurora");
  leerHash();
  window.APP = { modeloActual, ponerHash, estado, pintar };
  marco();
  pintar();
  document.fonts && document.fonts.ready.then(() => { ubicarGotas(); Z.montarGraficos(document); });
})();
