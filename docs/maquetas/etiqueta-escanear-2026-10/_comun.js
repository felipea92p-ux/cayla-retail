/* ====================================================================
   LO COMÚN de las 3 maquetas de «Prendas de una etiqueta» con escaneo (2026-10-21): el MODELO (qué prendas llevan la etiqueta,
   qué cambia, qué pasa cuando se lee un código), la PISTOLA de verdad (una ráfaga de teclas rápida es una lectura, como
   `usePistola`), la CÁMARA del teléfono (simulada, o la de verdad con `BarcodeDetector` si el navegador lo trae), Revisar y
   aplicar, el sello de «listo», la barra de la maqueta y el fondo (Campañas ▸ Etiquetas). Cada maqueta solo decide la CARA.
     EQ.iniciar({ letra: "a", ancho: 820, montar(cuerpo, api), alLeer(r, api), demo(api) })
   ==================================================================== */
window.EQ = (function () {
  const { PRODUCTOS, FUERA_DE_VENTA, ETIQUETAS, LECTURAS_DEMO, icono, iconoCat, mini, esc, soles, plural } = EQD;
  const MAQUETAS = [
    { letra: "a", archivo: "a-lector.html", nombre: "A · El lector en la caja" },
    { letra: "b", archivo: "b-etiqueta.html", nombre: "B · La etiqueta que se llena" },
    { letra: "c", archivo: "c-rafaga.html", nombre: "C · Ráfaga" },
  ];
  const FECHA = "martes 21 de octubre · 16:08";

  // ---------- estado de la maqueta, en el hash (sobrevive al cambiar de maqueta desde index.html) ----------
  const PRED = { etq: "sorteo", tema: "claro", ancho: "esc", mov: "si" };
  const est = { ...PRED };
  for (const par of (location.hash || "").slice(1).split("&")) { const [k, v] = par.split("="); if (k in est && v) est[k] = decodeURIComponent(v); }
  function guardarHash() {
    const h = Object.entries(est).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    try { history.replaceState(null, "", "#" + h); } catch (_) {}
    try { parent.postMessage({ hash: "#" + h }, "*"); } catch (_) {}
  }
  const quieto = () => document.body.classList.contains("quieto") || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const celular = () => est.ancho === "cel";

  // =====================================================================================
  // MODELO. Promete: lo mismo que hoy hace la hoja (marcar por producto o por talla, ver el cambio antes de aplicar) más la
  // LECTURA: un código resuelve UNA talla y color (la prenda que tienes en la mano) y la marca. Nada se guarda hasta «Aplicar».
  // =====================================================================================
  const POR_ID = new Map();
  for (const p of PRODUCTOS) for (const v of p.variantes) POR_ID.set(v.id, { p, v });
  /** La pistola en una Mac en español escribe «CMS'0011'ROS'M» por «CMS-0011-ROS-M» (`guionDeLaPistola`). */
  const normalizar = (c) => String(c || "").trim().replace(/'/g, "-").toUpperCase();
  const clave = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

  const Modelo = {
    crear(claveEtq) {
      const e = ETIQUETAS[claveEtq];
      return { e, iniciales: new Set(e.iniciales), marcadas: new Set(e.iniciales), porCategoria: new Set(e.categorias), modo: "poner", sesion: [], n: 0 };
    },
    heredada: (m, p) => m.porCategoria.has(p.cat),
    cuantas: (m, p) => (Modelo.heredada(m, p) ? p.variantes.length : p.variantes.filter((v) => m.marcadas.has(v.id)).length),
    estadoDe(m, p) { const k = Modelo.cuantas(m, p); return k === 0 ? "ninguna" : k === p.variantes.length ? "todas" : "algunas"; },
    lleva: (m, p) => Modelo.cuantas(m, p) > 0,
    alternarProducto(m, p) {
      if (Modelo.heredada(m, p)) return;
      const poner = Modelo.estadoDe(m, p) !== "todas";
      for (const v of p.variantes) poner ? m.marcadas.add(v.id) : m.marcadas.delete(v.id);
      return poner;
    },
    alternarVariante(m, id) { if (m.marcadas.has(id)) { m.marcadas.delete(id); return false; } m.marcadas.add(id); return true; },
    marcarTodas(m, lista, poner) { for (const p of lista) if (!Modelo.heredada(m, p)) for (const v of p.variantes) poner ? m.marcadas.add(v.id) : m.marcadas.delete(v.id); },
    cambio(m) {
      return { agregar: [...m.marcadas].filter((id) => !m.iniciales.has(id)), quitar: [...m.iniciales].filter((id) => !m.marcadas.has(id)) };
    },
    hayCambio(m) { const c = Modelo.cambio(m); return c.agregar.length + c.quitar.length > 0; },
    precio(m, precio) { return m.e.descuentoPct == null ? null : { antes: precio, despues: Math.round(precio * (1 - m.e.descuentoPct / 100) * 100) / 100 }; },
    filtrar(m, { texto = "", filtro = "todas", cat = "todas" } = {}) {
      const k = clave(texto.replace(/'/g, "-"));
      return PRODUCTOS.filter((p) => {
        if (cat !== "todas" && p.cat !== cat) return false;
        if (k && !clave(`${p.referencia} ${p.codigo} ${p.categoria} ${p.variantes.map((v) => `${v.sku} ${v.color}`).join(" ")}`).includes(k)) return false;
        if (filtro === "con" && !Modelo.lleva(m, p)) return false;
        if (filtro === "sin" && Modelo.lleva(m, p)) return false;
        if (filtro === "cambios" && !p.variantes.some((v) => m.marcadas.has(v.id) !== m.iniciales.has(v.id))) return false;
        return true;
      });
    },
    cuentas(m, base) { const con = base.filter((p) => Modelo.lleva(m, p)).length; return { todas: base.length, con, sin: base.length - con }; },
    totalPrendas(m) { let n = 0; for (const p of PRODUCTOS) n += Modelo.cuantas(m, p); return n; },
    /** Lo que pasa con un código leído. Nunca DESMARCA en «Poner»: la pistola que lee dos veces (o la cámara que vuelve a ver la
     *  misma etiqueta) no deshace lo que acaba de hacer. Para quitar, «Quitarla» en el segmento o la casilla. */
    leer(m, crudo) {
      const codigo = normalizar(crudo);
      const r = { id: ++m.n, codigo, modo: m.modo };
      let hallada = null;
      for (const p of PRODUCTOS) { const v = p.variantes.find((x) => x.sku === codigo); if (v) { hallada = { p, v }; break; } }
      const fuera = !hallada && FUERA_DE_VENTA.find((f) => f.sku === codigo);
      if (hallada) {
        Object.assign(r, hallada);
        if (Modelo.heredada(m, hallada.p)) r.estado = "por-categoria";
        else if (m.modo === "poner") r.estado = m.marcadas.has(hallada.v.id) ? "ya-la-llevaba" : (m.marcadas.add(hallada.v.id), "puesta");
        else r.estado = m.marcadas.has(hallada.v.id) ? (m.marcadas.delete(hallada.v.id), "quitada") : "no-la-llevaba";
      } else if (fuera) { r.estado = "fuera-de-venta"; r.fuera = fuera; }
      else r.estado = "desconocido";
      r.tono = TONOS[r.estado];
      m.sesion.unshift(r);
      return r;
    },
    deshacer(m, r) {
      if (r.deshecha) return;
      if (r.estado === "puesta") m.marcadas.delete(r.v.id);
      if (r.estado === "quitada") m.marcadas.add(r.v.id);
      r.deshecha = true;
    },
    /** «Todas sus tallas»: tras leer una, marcar (o quitar) el resto del producto. Devuelve cuántas cambió. */
    todasSusTallas(m, r) {
      if (!r.p) return 0; let n = 0;
      for (const v of r.p.variantes) { const tiene = m.marcadas.has(v.id); if (r.modo === "poner" && !tiene) { m.marcadas.add(v.id); n++; } if (r.modo === "quitar" && tiene) { m.marcadas.delete(v.id); n++; } }
      return n;
    },
    restoDeTallas(m, r) { if (!r.p || Modelo.heredada(m, r.p)) return 0; return r.p.variantes.filter((v) => (r.modo === "poner" ? !m.marcadas.has(v.id) : m.marcadas.has(v.id))).length; },
    textoCambio(m) {
      const { agregar, quitar } = Modelo.cambio(m);
      const prod = (ids) => new Set(ids.map((id) => POR_ID.get(id).p.id)).size;
      const partes = [];
      if (agregar.length) partes.push(`Se la pones a ${plural(agregar.length, "prenda", "prendas")}${prod(agregar) > 1 ? ` de ${prod(agregar)} productos` : ""}`);
      if (quitar.length) partes.push(`${agregar.length ? "se" : "Se"} la quitas a ${plural(quitar.length, "prenda", "prendas")}`);
      return partes.join(" y ") + ".";
    },
    sumaPrecios(m, ids) { let a = 0, d = 0; for (const id of ids) { const { v } = POR_ID.get(id); a += v.precio; const pr = Modelo.precio(m, v.precio); d += pr ? pr.despues : v.precio; } return { antes: a, despues: d }; },
    variante: (id) => POR_ID.get(id),
  };
  const TONOS = { puesta: "verde", "ya-la-llevaba": "pizarra", quitada: "taupe", "no-la-llevaba": "pizarra", "por-categoria": "pizarra", "fuera-de-venta": "ambar", desconocido: "ambar" };

  /** Lo que se dice de una lectura, en lenguaje de tienda: un chip, el título (la prenda) y una línea. */
  function mensaje(m, r) {
    const det = r.v ? [r.v.talla, r.v.color].filter(Boolean).join(" · ") : "";
    const pr = r.v && Modelo.precio(m, r.v.precio);
    const caja = pr ? (pr.despues === 0 ? `En caja: gratis (antes ${soles(pr.antes)})` : `En caja: ${soles(pr.antes)} → ${soles(pr.despues)}`) : "No cambia el precio: es informativa.";
    switch (r.estado) {
      case "puesta": return { chip: "Lleva la etiqueta", tono: "verde", titulo: r.p.referencia, det, linea: caja };
      case "ya-la-llevaba": return { chip: "Ya la llevaba", tono: "pizarra", titulo: r.p.referencia, det, linea: "No cambia nada: leerla otra vez no se la quita." };
      case "quitada": return { chip: "Se la quitas", tono: "taupe", titulo: r.p.referencia, det, linea: pr ? `Vuelve a ${soles(pr.antes)} en caja.` : "Ya no la lleva." };
      case "no-la-llevaba": return { chip: "No la llevaba", tono: "pizarra", titulo: r.p.referencia, det, linea: "No había nada que quitar." };
      case "por-categoria": return { chip: "Por su categoría", tono: "pizarra", titulo: r.p.referencia, det, linea: `Todos los ${r.p.categoria.toLowerCase()} la llevan por la regla de la campaña.` };
      case "fuera-de-venta": return { chip: "Ya no se vende", tono: "ambar", titulo: r.fuera.referencia, det: r.fuera.detalle, linea: "Esa talla está desactivada: no se puede etiquetar." };
      default: return { chip: "No es de CAYLA", tono: "ambar", titulo: "Este código no es de ninguna prenda", det: "", linea: `Leímos «${r.codigo}». Si es el código del proveedor, búscala por su nombre.` };
    }
  }
  /** La miniatura de una lectura: la prenda, o un ícono de aviso si no es de ninguna. */
  function miniDe(r, clase = "") {
    if (r.p) return mini(r.p.cat, r.v.colorHex, clase);
    if (r.fuera) return mini(r.fuera.cat, r.fuera.colorHex, clase);
    return `<span class="mini ${clase}" style="--c:var(--hueso)" data-oscura="no"><span style="color:var(--ambar)">${icono("qr")}</span></span>`;
  }

  // =====================================================================================
  // PISTOLA. Una ráfaga de 4 o más teclas a menos de 45 ms entre sí, rematada con Enter (o callada 90 ms si son 8 o más), es un
  // CÓDIGO — el mismo criterio de `lib/lectura-pistola.ts`. Si la ráfaga entró a un campo, el campo vuelve a lo que tenía.
  // Funciona con la pistola de verdad: escanea cualquier etiqueta con la maqueta abierta.
  // =====================================================================================
  const RAPIDO = 45;
  function escucharPistola(alCodigo) {
    let buf = "", ultima = -1e9, campo = null, antes = "", espera = 0, rapidas = 0;
    const reset = () => { buf = ""; rapidas = 0; clearTimeout(espera); };
    function fin() {
      const c = buf; reset();
      if (campo) { campo.value = antes; campo.dispatchEvent(new Event("input", { bubbles: true })); }
      alCodigo(c, "pistola");
    }
    document.addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const ahora = e.timeStamp;
      if (e.key === "Enter") {
        if (buf.length >= 4 && rapidas >= 3 && ahora - ultima < 120) { e.preventDefault(); e.stopPropagation(); fin(); } else reset();
        return;
      }
      if (e.key.length !== 1) return;
      if (ahora - ultima > RAPIDO) { reset(); const t = e.target; campo = t && t.matches && t.matches("input,textarea") ? t : null; antes = campo ? campo.value : ""; }
      else rapidas++;
      buf += e.key; ultima = ahora;
      clearTimeout(espera);
      espera = setTimeout(() => { if (buf.length >= 8 && rapidas >= 6) fin(); else reset(); }, 90);
    }, true);
  }

  // =====================================================================================
  // QR: el mismo contenido que imprime la etiqueta (el código de la talla y color). Con `qrcode-generator` si cargó; si no,
  // un dibujo que se le parece (la maqueta no se cae sin red).
  // =====================================================================================
  function qrSvg(texto, clase = "qr") {
    let n = 25, oscuro;
    try {
      const q = window.qrcode(0, "M"); q.addData(texto); q.make(); n = q.getModuleCount(); oscuro = (r, c) => q.isDark(r, c);
    } catch (_) {
      let s = 0; for (const ch of texto) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
      const rnd = (r, c) => (((r * 73856093) ^ (c * 19349663) ^ s) >>> 0) % 7 < 3;
      const ojo = (r, c) => { const en = (a, b) => r >= a && r < a + 7 && c >= b && c < b + 7; for (const [a, b] of [[0, 0], [0, n - 7], [n - 7, 0]]) if (en(a, b)) { const y = r - a, x = c - b; return y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4); } return null; };
      oscuro = (r, c) => { const o = ojo(r, c); return o === null ? rnd(r, c) : o; };
    }
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (oscuro(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    return `<svg class="${clase}" viewBox="0 0 ${n + 4} ${n + 4}" shape-rendering="crispEdges" aria-hidden="true"><rect width="100%" height="100%" fill="#fbf8f2"/><path d="${d}" fill="#1a1a18"/></svg>`; // tema-fijo: un QR es papel impreso
  }

  // =====================================================================================
  // CÁMARA del teléfono (como `EscanerCamara`, ADR del 2026-09-25): video a pantalla completa, visor con esquinas crema, la
  // bandeja crema abajo con lo último leído. Simulada: cada toque «acerca» una etiqueta y la lee. «Usar mi cámara» prende la de
  // verdad y lee con `BarcodeDetector` (Chrome en Android y en Mac); en el ERP, sin él, lee `jsQR`.
  // =====================================================================================
  function abrirCamara({ alLeer, resumen, titulo, alCerrar }) {
    const escena = document.getElementById("escena");
    const cam = document.createElement("div");
    cam.className = "cam papel-fijo"; cam.setAttribute("role", "dialog"); cam.setAttribute("aria-label", "Escanear con la cámara");
    cam.innerHTML = `
      <div class="cam-feed"></div><video playsinline muted hidden></video>
      <div class="cam-etq" aria-hidden="true"><div class="t">CAYLA</div><span class="qr-c"></span><div class="c"></div></div>
      <div class="cam-visor"><i class="esq"></i><i class="esq"></i><i class="esq"></i><i class="esq"></i><i class="laser"></i><i class="destello"></i></div>
      <div class="cam-top">
        <button class="redondo" data-cerrar aria-label="Cerrar la cámara">${icono("x")}</button>
        <h3>${esc(titulo)}<small>Acerca el QR de la etiqueta al cuadro</small></h3>
        <button class="redondo" data-linterna aria-pressed="false" aria-label="Linterna">${icono("linterna")}</button>
      </div>
      <div class="cam-pista"><span data-pista>Toca el cuadro para acercar una prenda (simulado)</span><br>
        <button class="btn sec" data-real style="background:transparent;color:var(--crema-fija);border-color:color-mix(in srgb,var(--crema-fija) 40%,transparent)">${icono("camara")} Usar mi cámara de verdad</button></div>
      <div class="cam-bandeja">
        <div class="ult" data-ult></div>
        <div class="pie">
          <div class="cuenta crece"><span class="etq-ic" data-bolsa>${icono("etiqueta")}</span><span><b data-n>0</b><br><small data-n-txt>leídas en esta pasada</small></span></div>
          <button class="btn pri grande" data-listo>Listo ${icono("der", "flecha")}</button>
        </div>
      </div>`;
    escena.appendChild(cam);
    const $ = (s) => cam.querySelector(s);
    const visor = $(".cam-visor"), etq = $(".cam-etq"), feed = $(".cam-feed"), video = $("video");
    let leidas = 0, ocupado = false, cola = [...LECTURAS_DEMO], flujo = null, reloj = 0, ultima = { c: "", t: 0 };
    const cerrar = () => {
      clearInterval(reloj); if (flujo) flujo.getTracks().forEach((t) => t.stop());
      cam.classList.add("cerrando"); setTimeout(() => { cam.remove(); alCerrar && alCerrar(); }, quieto() ? 0 : 240);
    };
    $("[data-cerrar]").onclick = cerrar; $("[data-listo]").onclick = cerrar;
    $("[data-linterna]").onclick = (e) => { const b = e.currentTarget; b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")); feed.style.filter = b.getAttribute("aria-pressed") === "true" ? "saturate(.9) brightness(1.05)" : ""; };

    function mostrar(r) {
      const t = mensaje(api_.modelo, r);
      leidas++;
      $(".destello").className = "destello " + (r.tono === "ambar" ? "ambar" : "verde");
      visor.classList.remove("lee"); void visor.offsetWidth; visor.classList.add("lee");
      navigator.vibrate && navigator.vibrate(r.tono === "ambar" ? [30, 70, 30] : 35);
      const ficha = document.createElement("div"); ficha.className = "cam-ficha aparece";
      ficha.innerHTML = `${miniDe(r)}<div class="crece"><div class="tit">${esc(t.titulo)}</div><div class="det">${esc(t.det || r.codigo)}</div><span class="chip ${t.tono} punto">${esc(t.chip)}</span></div>`;
      cam.appendChild(ficha);
      const bolsa = $("[data-bolsa]");
      setTimeout(async () => {
        if (r.tono !== "ambar" && r.estado !== "ya-la-llevaba") {
          await volarEl(ficha, bolsa, { dur: 520 });
          bolsa.classList.remove("late"); void bolsa.offsetWidth; bolsa.classList.add("late");
        } else { ficha.animate([{ opacity: 1 }, { opacity: 0, transform: "translate(-50%,-50%) scale(.96)" }], { duration: 380, easing: "ease-out", fill: "forwards" }).onfinish = () => ficha.remove(); }
        ficha.remove();
        rueda($("[data-n]"), leidas);
        const u = document.createElement("div"); u.className = "u";
        u.innerHTML = `${miniDe(r)}<span class="crece"><b style="font-weight:500">${esc(t.titulo)}</b> <small>${esc(t.det)}</small></span><span class="chip ${t.tono}">${esc(t.chip)}</span>`;
        const ult = $("[data-ult]"); ult.prepend(u); while (ult.children.length > 3) ult.lastChild.remove();
        resumen && ($("[data-n-txt]").textContent = resumen());
      }, quieto() ? 0 : 650);
    }
    // Simulada: la etiqueta entra al cuadro, se queda un instante y «se lee».
    async function acercar(codigo) {
      if (ocupado || flujo) return; ocupado = true;
      codigo = codigo || cola.shift() || (cola = [...LECTURAS_DEMO], cola.shift());
      const hall = Modelo.variante(PRODUCTOS.flatMap((p) => p.variantes).find((v) => v.sku === codigo)?.id || "");
      feed.style.setProperty("--c1", hall ? hall.v.colorHex : "#4c5d6e"); // tema-fijo: la tela de la prenda en la cámara simulada
      $(".qr-c").innerHTML = qrSvg(codigo); etq.querySelector(".c").textContent = codigo;
      etq.className = "cam-etq"; void etq.offsetWidth; etq.classList.add("llega");
      await pausa(950);
      const r = alLeer(codigo, "camara");
      mostrar(r);
      await pausa(700);
      etq.className = "cam-etq se-va";
      await pausa(380);
      ocupado = false;
    }
    visor.style.cursor = "pointer"; visor.onclick = () => acercar();
    $("[data-pista]").onclick = () => acercar();
    $("[data-real]").onclick = async () => {
      const pista = $("[data-pista]");
      if (!navigator.mediaDevices?.getUserMedia) { pista.textContent = "Este navegador no deja usar la cámara aquí."; return; }
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = flujo; video.hidden = false; await video.play(); etq.style.display = "none"; feed.style.display = "none";
        $("[data-real]").remove();
        if (!("BarcodeDetector" in window)) { pista.textContent = "La cámara se ve, pero este navegador no trae lector (en el ERP lee jsQR)."; return; }
        const det = new window.BarcodeDetector({ formats: ["qr_code", "code_128", "ean_13"] });
        pista.textContent = "Leyendo con tu cámara: acerca una etiqueta de verdad o una de «Etiquetas de prueba».";
        reloj = setInterval(async () => {
          try {
            const [x] = await det.detect(video); if (!x) return;
            const ahora = Date.now(); if (x.rawValue === ultima.c && ahora - ultima.t < 2500) return; ultima = { c: x.rawValue, t: ahora };
            mostrar(alLeer(x.rawValue, "camara"));
          } catch (_) {}
        }, 220);
      } catch (_) { flujo = null; pista.textContent = "Sin permiso para la cámara: sigue con la simulada."; }
    };
    return { cerrar, acercar, el: cam };
  }

  // =====================================================================================
  // HOJA (Modal del sistema, ADR-0136): velo con desenfoque → hoja que sube 18 px → cascada. Ancho por maqueta.
  // =====================================================================================
  function abrirHoja(html, { ancho = 768, clase = "" } = {}) {
    const escena = document.getElementById("escena");
    cerrarHoja(true);
    const velo = document.createElement("div"); velo.className = "velo"; velo.dataset.hoja = "";
    const capa = document.createElement("div"); capa.className = "capa"; capa.dataset.hoja = "";
    capa.innerHTML = `<section class="hoja ${clase}" role="dialog" aria-modal="true" style="max-width:${ancho}px">${html}</section>`;
    escena.append(velo, capa);
    return capa.querySelector(".hoja");
  }
  function cerrarHoja(seco) {
    const escena = document.getElementById("escena"); const partes = escena.querySelectorAll("[data-hoja]");
    if (!partes.length) return Promise.resolve();
    if (seco || quieto()) { partes.forEach((p) => p.remove()); return Promise.resolve(); }
    escena.classList.add("cerrando");
    return new Promise((fin) => setTimeout(() => { partes.forEach((p) => p.remove()); escena.classList.remove("cerrando"); fin(); }, 220));
  }
  function cabeceraHoja(m) {
    const e = m.e;
    const bajada = e.descuentoPct == null ? "Etiqueta informativa: no cambia ningún precio." : e.descuentoPct === 100 ? "100 % de descuento: en Vender la prenda sale gratis, solo si lleva la etiqueta." : `${e.descuentoPct} % de descuento: en Vender baja solo, a las prendas que lleven la etiqueta.`;
    return `<h2>Prendas de «${esc(e.nombre)}»</h2><p class="bajada">${esc(bajada)}</p>`;
  }
  function responsableHtml() {
    return `<div class="resp"><span class="av" style="--tono:var(--pizarra)">FA</span><span class="crece">Felipe Alvarez <small>· Admin: lo que guardes queda a tu nombre</small></span>${icono("abajo")}</div>`;
  }

  /** Revisar y aplicar: QUÉ pasa en caja antes de guardar (lo mismo que hoy pide la hoja con descuento), con antes → después. */
  function htmlRevisar(m) {
    const { agregar, quitar } = Modelo.cambio(m);
    const s = Modelo.sumaPrecios(m, agregar);
    const e = m.e;
    const pila = (ids) => `<span class="pila">${ids.slice(0, 5).map((id) => { const { p, v } = Modelo.variante(id); return mini(p.cat, v.colorHex); }).join("")}${ids.length > 5 ? `<span class="mas">+${ids.length - 5}</span>` : ""}</span>`;
    const vig = e.vigenteDesde ? (e.vigenteDesde <= "2026-10-21" ? `Desde hoy, ${FECHA.split(" · ")[0]}, hasta el ${e.vigenteHasta.slice(8)} de octubre.` : `Empieza el ${e.vigenteDesde.slice(8)} de noviembre: hasta entonces la caja cobra lo de siempre.`) : "";
    return `<div class="revisar cascada">
      ${agregar.length && e.descuentoPct != null ? `<div class="antes-despues">
        <div class="lado antes"><span class="versal">Hoy en caja</span><b class="num">${soles(s.antes)}</b><small class="tenue">${plural(agregar.length, "prenda", "prendas")}, una de cada</small></div>
        <span class="flecha-ad">${icono("der")}</span>
        <div class="lado"><span class="versal">Con «${esc(e.nombre)}»</span><b class="num" data-cuenta-soles="${s.despues}" data-desde="${s.antes}">${soles(s.antes)}</b><small class="tenue">${e.descuentoPct === 100 ? "salen gratis" : `${e.descuentoPct} % menos`}</small></div>
      </div>` : ""}
      ${agregar.length ? `<div class="bloque-cambio">${pila(agregar)}<div class="crece"><b>Se la pones a ${plural(agregar.length, "prenda", "prendas")}</b><p>${esc(vig || "Se marca en el catálogo; el precio no cambia.")}</p></div></div>` : ""}
      ${quitar.length ? `<div class="bloque-cambio">${pila(quitar)}<div class="crece"><b>Se la quitas a ${plural(quitar.length, "prenda", "prendas")}</b><p>${e.descuentoPct != null ? "Vuelven a su precio de etiqueta en caja." : "Dejan de llevarla."}</p></div></div>` : ""}
      ${e.descuentoPct === 100 && agregar.length ? `<div class="nota" style="background:color-mix(in srgb,var(--ambar) 12%,var(--papel));color:var(--ambar-p)"><span class="i">!</span><span>Quedan <b>por debajo del costo</b>: las ${agregar.length} salen a S/ 0.00. Es lo que pide un sorteo; si no era la idea, vuelve y quítalas.</span></div>` : ""}
      ${responsableHtml()}
      <div class="pie-acciones fila" style="justify-content:space-between"><button class="btn sec" data-volver>${icono("izq")} Volver a la lista</button><button class="btn pri grande" data-aplicar>Sí, aplicar</button></div>
    </div>`;
  }
  function htmlAplicado(m, r) {
    const conPrecio = m.e.descuentoPct != null && r.agregadas > 0;
    return `<div class="listo-final cascada">
      <div class="sello"><span class="onda"></span><span class="onda dos"></span><svg viewBox="0 0 88 88"><circle class="aro" cx="44" cy="44" r="42"/><path class="visto" d="M27 45l11 11 23-25"/></svg></div>
      <h3>«${esc(m.e.nombre)}» al día</h3>
      <p>${[r.agregadas ? `${plural(r.agregadas, "prenda etiquetada", "prendas etiquetadas")}` : "", r.quitadas ? `${plural(r.quitadas, "prenda liberada", "prendas liberadas")}` : ""].filter(Boolean).join(" y ")}.${conPrecio ? " En Vender ya cobran el precio nuevo." : ""}</p>
      <div class="fila envuelve" style="justify-content:center;margin-top:6px">${conPrecio ? `<button class="btn sec">${icono("impresora")} Imprimir etiquetas de precio</button>` : ""}<button class="btn pri" data-listo>Listo</button></div>
    </div>`;
  }

  // ---------- movimiento: cifra que cuenta, vuelo de una ficha, FLIP, onda del botón ----------
  /** Una cifra que cuenta hasta `hasta`; `ultimo` es el texto con que termina («Gratis» en vez de «S/ 0.00»). */
  function cuenta(el, hasta, { dur = 700, fmt = (n) => Math.round(n), ultimo } = {}) {
    if (!el) return; const desde = Number(el.dataset.v ?? (String(el.textContent).replace(/[^\d.-]/g, "") || 0)); el.dataset.v = hasta;
    const fin = () => { el.textContent = ultimo ?? fmt(hasta); if (ultimo) reAnimar(el, "rueda"); };
    if (quieto() || desde === hasta) return fin();
    const t0 = performance.now(), turno = (el._turno = (el._turno || 0) + 1);
    const paso = (t) => { if (el._turno !== turno) return; const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); if (k >= 1) return fin(); el.textContent = fmt(desde + (hasta - desde) * e); requestAnimationFrame(paso); };
    requestAnimationFrame(paso);
    // En una pestaña de fondo el navegador frena los cuadros: la cifra igual termina donde debe.
    setTimeout(() => { if (el._turno === turno && el.textContent !== (ultimo ?? String(fmt(hasta)))) { el._turno++; fin(); } }, dur + 150);
  }
  function rueda(el, valor) { if (!el) return; el.textContent = valor; if (quieto()) return; el.classList.remove("rueda"); void el.offsetWidth; el.classList.add("rueda"); }
  /** Un clon de `desde` vuela en arco hasta `hasta` y se achica al llegar. */
  function volarEl(desde, hasta, { dur = 560, html } = {}) {
    return new Promise((fin) => {
      if (!desde || !hasta || quieto()) return fin();
      const a = desde.getBoundingClientRect(), b = hasta.getBoundingClientRect();
      const g = document.createElement("div"); g.className = "vuelo";
      g.innerHTML = html || desde.outerHTML; document.body.appendChild(g);
      const hijo = g.firstElementChild; if (hijo && !html) { hijo.style.width = a.width + "px"; hijo.style.margin = "0"; hijo.style.animation = "none"; hijo.classList.remove("aparece"); hijo.style.transform = "none"; hijo.style.position = "static"; }
      const r = g.getBoundingClientRect();
      g.style.left = a.left + a.width / 2 - r.width / 2 + "px"; g.style.top = a.top + a.height / 2 - r.height / 2 + "px";
      const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const esc_ = Math.max(0.18, Math.min(0.6, b.width / Math.max(1, r.width)));
      const an = g.animate([
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 60}px) scale(${(1 + esc_) / 2}) rotate(-4deg)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px,${dy}px) scale(${esc_})`, opacity: 0.2 },
      ], { duration: dur, easing: "cubic-bezier(.32,.72,.24,1)" });
      let listo = false; const cierra = () => { if (listo) return; listo = true; g.remove(); fin(); };
      an.onfinish = cierra; setTimeout(cierra, dur + 250); // una pestaña de fondo puede no terminar la animación
    });
  }
  function flip(cont, mutar, { dur = 420 } = {}) {
    const antes = new Map(); if (!quieto()) cont.querySelectorAll("[data-flip]").forEach((el) => antes.set(el.dataset.flip, el.getBoundingClientRect()));
    mutar();
    if (quieto()) return;
    cont.querySelectorAll("[data-flip]").forEach((el) => {
      const a = antes.get(el.dataset.flip); if (!a) { el.animate([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "none" }], { duration: 360, easing: "cubic-bezier(.32,.72,.24,1)" }); return; }
      const b = el.getBoundingClientRect(); const dx = a.left - b.left, dy = a.top - b.top; if (!dx && !dy) return;
      el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: dur, easing: "cubic-bezier(.32,.72,.24,1)" });
    });
  }
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".btn:not(.enlace)"); if (!b || quieto()) return;
    const r = b.getBoundingClientRect(); const d = Math.max(r.width, r.height) * 2;
    b.style.setProperty("--ox", e.clientX - r.left + "px"); b.style.setProperty("--oy", e.clientY - r.top + "px"); b.style.setProperty("--od", d + "px");
    b.removeAttribute("data-onda"); void b.offsetWidth; b.setAttribute("data-onda", ""); setTimeout(() => b.removeAttribute("data-onda"), 460);
  });
  let avisoT = null;
  function aviso(texto, tono = "verde") {
    const esc_ = document.getElementById("escena"); let a = esc_.querySelector(".aviso-flotante");
    if (!a) { a = document.createElement("div"); a.className = "aviso-flotante"; esc_.appendChild(a); }
    a.style.top = esc_.scrollTop + 14 + "px";
    a.innerHTML = `<span class="chip ${tono} punto">${esc(texto)}</span>`; a.classList.remove("ver"); void a.offsetWidth; a.classList.add("ver");
    clearTimeout(avisoT); avisoT = setTimeout(() => a.classList.remove("ver"), 3200);
  }
  const pausa = (ms) => new Promise((r) => setTimeout(r, quieto() ? Math.min(ms, 40) : ms));
  function reAnimar(el, clase) { if (!el || quieto()) return; el.classList.remove(clase); void el.offsetWidth; el.classList.add(clase); }
  /** El barrido de la barra del lector al leer: verde si entró, ámbar si no. */
  function barrer(lector, tono) { if (!lector) return; lector.setAttribute("data-leyendo", ""); lector.removeAttribute("data-barrido"); void lector.offsetWidth; lector.setAttribute("data-barrido", tono === "ambar" ? "ambar" : "verde"); setTimeout(() => lector.removeAttribute("data-leyendo"), 900); }
  /** Escribe en un campo letra por letra (la demo, como una persona). */
  async function tipear(input, texto, ms = 70) { input.focus(); input.value = ""; for (const ch of texto) { input.value += ch; input.dispatchEvent(new Event("input", { bubbles: true })); await pausa(ms); } }

  // ---------- piezas de la hoja que usan las tres caras ----------
  function segmentoHtml(m) {
    return `<span class="fila" style="gap:8px"><span class="versal tenue" style="font-size:10.5px">Al escanear</span><span class="segmento" data-segmento data-tono="${m.modo}" role="group" aria-label="Al escanear">
      <span class="pista"></span>
      <button data-modo="poner" aria-pressed="${m.modo === "poner"}" title="Lo que escaneas se lleva la etiqueta">${icono("plus", "mas")} Poner</button>
      <button data-modo="quitar" aria-pressed="${m.modo === "quitar"}" title="Lo que escaneas deja de llevarla">${icono("minus")} Quitar</button></span></span>`;
  }
  function moverPista(seg) {
    if (!seg) return; const on = seg.querySelector("[aria-pressed=true]"), pista = seg.querySelector(".pista"); if (!on) return;
    pista.style.width = on.offsetWidth + "px"; pista.style.transform = `translateX(${on.offsetLeft - 3}px)`;
  }
  function lectorHtml({ placeholder = celular() ? "Escanea o busca una prenda" : "Escanea la etiqueta o busca por nombre, código o categoría", camara = true, listo = true } = {}) {
    return `<label class="lector" data-lector>
      <span class="lupa">${icono("buscar", "a")}${icono("scan", "b")}</span>
      <input data-buscar placeholder="${esc(placeholder)}" autocomplete="off" aria-label="Buscar o escanear prendas">
      ${listo ? `<span class="listo" title="La pistola lee aquí aunque el cursor esté en otro lado"><i></i><span>Lector listo</span></span><span class="tecla">/</span>` : ""}
      ${camara ? `<button type="button" class="btn sec cam-btn" data-camara title="Escanear con la cámara del teléfono">${icono("camara")}<span class="oculto-cel">Cámara</span></button>` : ""}
    </label>`;
  }
  function casillaHtml(m, p, extra = "") {
    const her = Modelo.heredada(m, p), st = Modelo.estadoDe(m, p);
    return `<button class="casilla" data-casilla="${p.id}" data-estado="${st}" ${her ? "disabled data-cat" : ""} role="checkbox" aria-checked="${st === "todas" ? "true" : st === "algunas" ? "mixed" : "false"}" aria-label="${esc(p.referencia)}: marcar todas sus tallas" ${extra}>
      <svg class="v" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg><svg class="m" viewBox="0 0 24 24"><path d="M6 12h12"/></svg></button>`;
  }
  function puntosHtml(m, p) {
    const her = Modelo.heredada(m, p);
    return `<span class="puntos" aria-hidden="true">${p.variantes.map((v) => `<i data-pv="${v.id}" class="${her ? "cat" : m.marcadas.has(v.id) ? "si" : ""}"></i>`).join("")}</span>`;
  }
  function textoTallas(m, p) {
    if (Modelo.heredada(m, p)) return "todas, por su categoría";
    const k = Modelo.cuantas(m, p), n = p.variantes.length;
    if (n === 1) return k ? "la lleva" : "1 talla y color";
    return k === 0 ? `${n} tallas y colores` : k === n ? `las ${n} tallas` : `${k} de ${n} tallas`;
  }
  function precioHtml(m, p) {
    const pr = Modelo.precio(m, p.variantes[0].precio);
    if (!pr) return `<span class="precio"><span class="tenue">${soles(p.variantes[0].precio)}</span></span>`;
    if (!Modelo.lleva(m, p)) return `<span class="precio"><span class="tenue">${soles(pr.antes)}</span></span>`;
    return `<span class="precio"><s>${soles(pr.antes)}</s><b>${pr.despues === 0 ? "Gratis" : soles(pr.despues)}</b></span>`;
  }
  function tallasHtml(m, p) {
    const her = Modelo.heredada(m, p);
    return `<div class="tallas">${p.variantes.map((v) => `<button class="vp" data-vp="${v.id}" aria-pressed="${her || m.marcadas.has(v.id)}" ${her ? "disabled" : ""}>
      <span class="tic"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span><span class="dot" data-color-dato style="background:${v.colorHex}"></span>${esc([v.talla, v.color].filter(Boolean).join(" · ") || "Única")} <span class="sku">${esc(v.sku)}</span></button>`).join("")}</div>`;
  }
  /** Una fila de la lista. `abierto` muestra sus tallas como píldoras. */
  function filaHtml(m, p, abierto) {
    return `<li data-prod="${p.id}"><div class="fp" aria-expanded="${abierto}">
      ${casillaHtml(m, p)}
      <button class="abre" data-abrir="${p.id}">
        ${mini(p.cat, p.colorHex)}
        <span class="crece"><span class="nom">${esc(p.referencia)}</span>
          <span class="meta">${puntosHtml(m, p)}<span data-tt>${esc(textoTallas(m, p))}</span><span>· ${esc(p.categoria)}</span><span class="mono oculto-cel">${esc(p.codigo)}</span></span></span>
        ${Modelo.heredada(m, p) ? `<span class="chip pizarra punto oculto-cel">Por categoría</span>` : ""}
        <span data-precio>${precioHtml(m, p)}</span>
        ${icono("derChev", "chev")}
      </button></div>${abierto ? tallasHtml(m, p) : ""}</li>`;
  }
  /** Rehace solo lo que cambia de una fila (casilla, puntos, texto, precio) para no perder su animación ni el scroll. */
  function refrescarFila(cont, m, p, { pop } = {}) {
    const li = cont.querySelector(`[data-prod="${p.id}"]`); if (!li) return;
    const cas = li.querySelector("[data-casilla]"); const st = Modelo.estadoDe(m, p);
    cas.dataset.estado = st; cas.setAttribute("aria-checked", st === "todas" ? "true" : st === "algunas" ? "mixed" : "false");
    for (const v of p.variantes) {
      const i = li.querySelector(`[data-pv="${v.id}"]`); if (i) { const antes = i.classList.contains("si"); i.className = Modelo.heredada(m, p) ? "cat" : m.marcadas.has(v.id) ? "si" : ""; if (pop && antes !== i.classList.contains("si")) reAnimar(i, "pop"); }
      const b = li.querySelector(`[data-vp="${v.id}"]`); if (b) b.setAttribute("aria-pressed", String(Modelo.heredada(m, p) || m.marcadas.has(v.id)));
    }
    li.querySelector("[data-tt]").textContent = textoTallas(m, p);
    li.querySelector("[data-precio]").innerHTML = precioHtml(m, p);
  }
  /** Lleva la fila de la prenda leída a la vista (sin mover la página si el foco está escribiendo, ADR-0284) y la hace respirar. */
  function resaltarFila(cont, scroller, p, tono = "verde") {
    const li = cont.querySelector(`[data-prod="${p.id}"]`); if (!li) return;
    const fp = li.querySelector(".fp");
    if (scroller) { const a = scroller.getBoundingClientRect(), b = li.getBoundingClientRect(); if (b.top < a.top || b.bottom > a.bottom) scroller.scrollTo({ top: scroller.scrollTop + (b.top - a.top) - a.height / 3, behavior: quieto() ? "auto" : "smooth" }); }
    fp.removeAttribute("data-recien"); void fp.offsetWidth; fp.setAttribute("data-recien", tono === "ambar" ? "ambar" : "");
  }

  // =====================================================================================
  // LA LISTA que comparten las tres caras: buscador, píldoras (Todas · Con la etiqueta · Sin ella · Categoría), filas, tallas,
  // «Marcar todos / Quitar todos». Lo que se ve es una FOTO al filtrar (como `idsPorMarca`): marcar una prenda con «Sin ella»
  // puesto no la hace desaparecer bajo el mouse. Cada cara solo dice qué hacer cuando algo cambia (`alCambiar`).
  //   raíz con [data-buscar] [data-pildoras] [data-lista] [data-conteo] [data-marcar-todos] [data-quitar-todos]
  // =====================================================================================
  function montarLista(raiz, m, { scroller, alCambiar = () => {}, conCambios = false } = {}) {
    const f = { texto: "", filtro: "todas", cat: "todas" };
    const abiertos = new Set();
    let ids = [];
    const $ = (s) => raiz.querySelector(s);
    const ul = $("[data-lista]"), pild = $("[data-pildoras]");
    const cats = [...new Set(PRODUCTOS.map((p) => p.cat))].map((c) => ({ c, n: EQD.CATS[c] })).sort((a, b) => a.n.localeCompare(b.n, "es"));
    const visibles = () => ids.map((id) => PRODUCTOS.find((p) => p.id === id));
    function foto() { ids = Modelo.filtrar(m, f).map((p) => p.id); }
    function pintarPildoras() {
      const base = Modelo.filtrar(m, { ...f, filtro: "todas" }); const c = Modelo.cuentas(m, base);
      const nc = Modelo.cambio(m); const nCambios = nc.agregar.length + nc.quitar.length;
      const b = (k, t, n) => `<button class="pildora" data-filtro="${k}" aria-pressed="${f.filtro === k}">${t} <span class="chip ${f.filtro === k ? "" : "neutro"}" style="${f.filtro === k ? "background:color-mix(in srgb,var(--crema) 22%,transparent);color:inherit" : ""};padding:0 7px;font-size:11px">${n}</span></button>`;
      const catNom = f.cat === "todas" ? "Categoría" : EQD.CATS[f.cat];
      pild.innerHTML = b("todas", "Todas", c.todas) + b("con", "Con la etiqueta", c.con) + b("sin", "Sin ella", c.sin) + (conCambios && nCambios ? b("cambios", "Lo que cambia", nCambios) : "") +
        `<span style="position:relative"><button class="pildora" data-cat-btn aria-pressed="${f.cat !== "todas"}">${icono("camisa")} ${esc(catNom)} ${f.cat !== "todas" ? `<span data-cat-x aria-label="Quitar categoría">${icono("x")}</span>` : icono("abajo")}</button></span>`;
    }
    function pintar() {
      const vs = visibles();
      ul.innerHTML = vs.length ? vs.map((p) => filaHtml(m, p, abiertos.has(p.id))).join("") :
        `<li class="vacio" style="padding:36px 16px">${icono("embudoX")}<h3>Nada con ese filtro</h3><p>${f.texto ? `Ninguna prenda dice «${esc(f.texto)}».` : "Prueba con otra píldora."}</p><button class="btn sec" data-limpiar>Borrar la búsqueda</button></li>`;
      const conteo = $("[data-conteo]"); if (conteo) conteo.textContent = `${plural(vs.length, "producto", "productos")} · ${plural(Modelo.totalPrendas(m), "prenda la lleva", "prendas la llevan")}`;
      pintarPildoras();
    }
    function refiltrar() { foto(); pintar(); if (scroller) scroller.scrollTop = 0; }
    $("[data-buscar]").addEventListener("input", (e) => { f.texto = e.target.value; refiltrar(); });
    pild.addEventListener("click", (e) => {
      const fb = e.target.closest("[data-filtro]"); if (fb) { f.filtro = fb.dataset.filtro; return refiltrar(); }
      if (e.target.closest("[data-cat-x]")) { f.cat = "todas"; return refiltrar(); }
      const cb = e.target.closest("[data-cat-btn]"); if (!cb) return;
      const abierto = pild.querySelector(".menu-cat"); if (abierto) return abierto.remove();
      const menu = document.createElement("div"); menu.className = "menu-cat";
      menu.innerHTML = [{ c: "todas", n: "Todas" }, ...cats].map((x) => `<button data-c="${x.c}" aria-pressed="${f.cat === x.c}">${x.c === "todas" ? "" : iconoCat(x.c)}${esc(x.n)}${f.cat === x.c ? icono("check") : ""}</button>`).join("");
      cb.parentElement.appendChild(menu);
      // Flota sobre la hoja (como `useDestinoFlotante`): en el celular las píldoras corren de lado y la recortarían.
      const rc = cb.getBoundingClientRect();
      Object.assign(menu.style, { position: "fixed", left: Math.min(rc.left, innerWidth - 236) + "px", top: rc.bottom + 6 + "px" });
      menu.addEventListener("click", (ev) => { const o = ev.target.closest("[data-c]"); if (o) { f.cat = o.dataset.c; refiltrar(); } });
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".menu-cat,[data-cat-btn]")) pild.querySelector(".menu-cat")?.remove(); });
    ul.addEventListener("click", (e) => {
      if (e.target.closest("[data-limpiar]")) { f.texto = ""; f.filtro = "todas"; f.cat = "todas"; $("[data-buscar]").value = ""; return refiltrar(); }
      const cas = e.target.closest("[data-casilla]");
      if (cas) { const p = PRODUCTOS.find((x) => x.id === cas.dataset.casilla); const poner = Modelo.alternarProducto(m, p); refrescarFila(ul, m, p, { pop: true }); pintarPildoras(); return alCambiar({ tipo: poner ? "poner" : "quitar", p, el: cas.closest(".fp") }); }
      const vp = e.target.closest("[data-vp]");
      if (vp) { const { p, v } = Modelo.variante(vp.dataset.vp); const on = Modelo.alternarVariante(m, v.id); refrescarFila(ul, m, p, { pop: true }); pintarPildoras(); return alCambiar({ tipo: on ? "poner" : "quitar", p, v, el: vp }); }
      const ab = e.target.closest("[data-abrir]");
      if (ab) { const id = ab.dataset.abrir; abiertos.has(id) ? abiertos.delete(id) : abiertos.add(id); const li = ul.querySelector(`[data-prod="${id}"]`); li.outerHTML = filaHtml(m, PRODUCTOS.find((p) => p.id === id), abiertos.has(id)); }
    });
    $("[data-marcar-todos]")?.addEventListener("click", () => { Modelo.marcarTodas(m, visibles(), true); visibles().forEach((p) => refrescarFila(ul, m, p, { pop: true })); pintarPildoras(); alCambiar({ tipo: "todos" }); });
    $("[data-quitar-todos]")?.addEventListener("click", () => { Modelo.marcarTodas(m, visibles(), false); visibles().forEach((p) => refrescarFila(ul, m, p, { pop: true })); pintarPildoras(); alCambiar({ tipo: "todos" }); });
    foto(); pintar();
    return {
      f, ul,
      /** Tras una lectura: refresca la fila y la deja a la vista (si la foto no la tenía, la suma arriba). */
      mostrar(p, tono) {
        if (!ids.includes(p.id)) { ids.unshift(p.id); pintar(); }
        refrescarFila(ul, m, p, { pop: true }); pintarPildoras(); resaltarFila(ul, scroller, p, tono);
      },
      refrescar(p) { if (p) refrescarFila(ul, m, p, { pop: true }); else visibles().forEach((x) => refrescarFila(ul, m, x)); pintarPildoras(); const conteo = $("[data-conteo]"); if (conteo) conteo.textContent = `${plural(visibles().length, "producto", "productos")} · ${plural(Modelo.totalPrendas(m), "prenda la lleva", "prendas la llevan")}`; },
      filtrar(filtro) { f.filtro = filtro; refiltrar(); },
      abrir(id) { abiertos.add(id); const li = ul.querySelector(`[data-prod="${id}"]`); if (li) li.outerHTML = filaHtml(m, PRODUCTOS.find((p) => p.id === id), true); },
    };
  }

  // ---------- etiquetas de prueba (NO es parte de la pantalla) ----------
  function abrirPrueba(alLeer) {
    const v = document.createElement("div"); v.className = "prueba-velo";
    const codigos = [...new Set([...LECTURAS_DEMO, "CMS-0047-NEG-S", "ANL-0001-PLA-7"])];
    v.innerHTML = `<div class="prueba"><div class="fila entre"><h4>Etiquetas de prueba (no es parte de la pantalla)</h4><button class="btn sut" data-x>${icono("x")} Cerrar</button></div>
      <p>Son las etiquetas de esta maqueta, con su QR de verdad. Tócalas para simular la lectura, o escanéalas con la pistola (lee de la pantalla si es de 2D) o con «Usar mi cámara de verdad» desde un teléfono. Una prenda real de CAYLA dirá «No es de ninguna prenda»: el catálogo de la maqueta es inventado.</p>
      <div class="prueba-grilla">${codigos.map((c) => { const pr = PRODUCTOS.find((p) => p.variantes.some((x) => x.sku === c)); const f = FUERA_DE_VENTA.find((x) => x.sku === c); return `<button class="etq-p" data-c="${c}">${qrSvg(c, "")}<b>${esc(pr ? pr.referencia : f ? f.referencia + " (ya no se vende)" : "Código de proveedor")}</b><small>${esc(c)}</small></button>`; }).join("")}</div></div>`;
    document.body.appendChild(v);
    v.addEventListener("click", (e) => { if (e.target === v || e.target.closest("[data-x]")) return v.remove(); const b = e.target.closest("[data-c]"); if (b) { v.remove(); alLeer(b.dataset.c, "pistola"); } });
  }

  // ---------- fondo: Campañas ▸ Etiquetas ----------
  function fondoHtml() {
    const t = (clave, nombre, linea, n) => `<article class="tarjeta-etq"><div class="ilus">${icono(clave === "sorteo" ? "regalo" : "etiqueta")}</div><h3>${nombre}</h3><p class="tenue" style="font-size:12.5px">${linea}</p><p class="tenue" style="font-size:12.5px">${n}</p><div class="crece"></div><button class="btn sec" data-abrir-etq="${clave}">Prendas</button><button class="btn sut">Campaña</button></article>`;
    return `<div class="pagina">
      <header class="cab"><div><p class="sede">Tienda TRU · ${FECHA}</p><h1>Campañas</h1><p class="frase">Las etiquetas que bajan el precio en caja y las que solo marcan prendas.</p></div></header>
      <div><p class="grupo-tit versal tenue">General <span class="chip neutro">3</span></p>
      <div class="tarjetas-etq">${t("estreno", "Estreno", "Informativa: no cambia el precio", "13 prendas a la venta")}${t("sorteo", "Sorteo", "<b style='color:var(--tinta)'>100 % de descuento</b> · solo en las prendas etiquetadas", "1 prenda a la venta")}${t("black", "Black Friday", "<b style='color:var(--tinta)'>30 % de descuento</b> · del 27 al 30 de nov.", "5 prendas y todos los anillos")}</div></div>
    </div>`;
  }

  // ---------- la barra y el arranque ----------
  let api_ = null, demoActiva = false, generacion = 0;
  function barra(letra) {
    const op = (g, v, t) => `<button class="op" data-g="${g}" data-v="${v}" aria-pressed="${est[g] === v}">${t}</button>`;
    return `<div class="spike">
      <span class="tit">Maqueta · Prendas de una etiqueta</span>
      <span class="grupo"><span>Ver</span>${MAQUETAS.map((x) => `<a class="nav" href="${x.archivo}" ${x.letra === letra ? 'aria-current="page"' : ""}>${x.nombre}</a>`).join("")}</span>
      <span class="sep"></span>
      <span class="grupo"><span>Etiqueta</span>${op("etq", "sorteo", "Sorteo −100 %")}${op("etq", "black", "Black Friday −30 %")}${op("etq", "estreno", "Estreno")}</span>
      <span class="grupo"><span>Tema</span>${op("tema", "claro", "Claro")}${op("tema", "oscuro", "Oscuro")}</span>
      <span class="grupo"><span>Ancho</span>${op("ancho", "esc", "Escritorio")}${op("ancho", "cel", "375 px")}</span>
      <span class="grupo"><span>Mov.</span>${op("mov", "si", "Sí")}${op("mov", "no", "Sin")}</span>
      <span class="sep"></span>
      <span class="grupo"><button class="op" data-simular title="Como si la pistola leyera la etiqueta siguiente">${"⌁"} Simular lectura</button><button class="op" data-prueba>Etiquetas de prueba</button><button class="op rojo" data-demo>▶ Ver cómo funciona</button><button class="op" data-reiniciar>↻ Reiniciar</button></span>
      <span title="Escanea cualquier etiqueta con tu pistola: la maqueta la lee">${icono("pistola")} tu pistola lee aquí</span>
    </div>`;
  }

  function iniciar(def) {
    document.body.insertAdjacentHTML("afterbegin", barra(def.letra));
    document.body.insertAdjacentHTML("beforeend", `<div id="marco"><div id="escena"></div></div>`);
    if (def.estilos) document.head.insertAdjacentHTML("beforeend", `<style>${def.estilos}</style>`);
    const escena = document.getElementById("escena");
    let simIdx = 0;

    function aplicarEntorno() {
      document.body.classList.toggle("quieto", est.mov === "no");
      document.body.classList.toggle("celular", est.ancho === "cel");
      document.documentElement.dataset.tema = est.tema;
      document.documentElement.style.setProperty("--alto-spike", document.querySelector(".spike").getBoundingClientRect().height + "px");
    }
    function montar() {
      generacion++;
      escena.innerHTML = fondoHtml();
      const modelo = Modelo.crear(est.etq);
      const api = {
        modelo, est, Modelo, EQD, mensaje, miniDe, abrirHoja, cerrarHoja, cabeceraHoja, responsableHtml, htmlRevisar, htmlAplicado,
        lectorHtml, segmentoHtml, moverPista, montarLista: (raiz, o) => montarLista(raiz, modelo, o), casillaHtml, puntosHtml, filaHtml, tallasHtml, refrescarFila, resaltarFila, textoTallas, precioHtml,
        abrirCamara: (o) => abrirCamara({ alLeer: (c, origen) => api.leer(c, origen), ...o }), qrSvg,
        cuenta, rueda, volarEl, flip, aviso, pausa, reAnimar, barrer, tipear, quieto, celular, FECHA,
        viva: ((g) => () => g === generacion)(generacion),
        /** El único camino de una lectura (pistola, cámara, simulada): el modelo decide, la cara anima. */
        leer(codigo, origen = "pistola") { const r = Modelo.leer(modelo, codigo); def.alLeer(r, api, origen); return r; },
        /** Revisar → aplicar → sello, en la hoja que pase la cara. */
        revisarEn(hoja, { alVolver }) {
          const cuerpo = hoja.querySelector("[data-cuerpo]");
          cuerpo.innerHTML = htmlRevisar(modelo);
          const b = cuerpo.querySelector("[data-cuenta-soles]"); if (b) setTimeout(() => cuenta(b, Number(b.dataset.cuentaSoles), { dur: 1100, fmt: soles }), 380);
          if (b) b.dataset.v = b.dataset.desde;
          cuerpo.querySelector("[data-volver]").onclick = alVolver;
          cuerpo.querySelector("[data-aplicar]").onclick = (e) => api.aplicar(hoja, e.currentTarget);
        },
        async aplicar(hoja, boton) {
          const c = Modelo.cambio(modelo);
          if (boton) { boton.disabled = true; boton.innerHTML = `Aplicando…`; }
          await pausa(650);
          const r = { agregadas: c.agregar.length, quitadas: c.quitar.length };
          modelo.iniciales = new Set(modelo.marcadas);
          const cuerpo = hoja.querySelector("[data-cuerpo]"); cuerpo.innerHTML = htmlAplicado(modelo, r);
          aviso(`«${modelo.e.nombre}»: ${[r.agregadas ? plural(r.agregadas, "prenda etiquetada", "prendas etiquetadas") : "", r.quitadas ? plural(r.quitadas, "liberada", "liberadas") : ""].filter(Boolean).join(" y ")}`);
          cuerpo.querySelector("[data-listo]").onclick = () => cerrarHoja();
        },
      };
      api_ = api;
      escena.querySelectorAll("[data-abrir-etq]").forEach((b) => b.addEventListener("click", () => { est.etq = b.dataset.abrirEtq; guardarHash(); syncBarra(); montar(); }));
      def.montar(api);
      return api;
    }
    function syncBarra() { document.querySelectorAll(".spike .op[data-g]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === est[x.dataset.g]))); }

    document.querySelectorAll(".spike .op[data-g]").forEach((b) => b.addEventListener("click", () => {
      const g = b.dataset.g; est[g] = b.dataset.v; guardarHash(); syncBarra(); aplicarEntorno();
      if (g === "etq" || g === "ancho") montar(); else document.querySelectorAll("[data-segmento]").forEach(moverPista);
    }));
    document.querySelectorAll(".spike a.nav").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); location.href = a.getAttribute("href") + location.hash; }));
    document.querySelector("[data-simular]").onclick = () => { api_ && api_.leer(LECTURAS_DEMO[simIdx++ % LECTURAS_DEMO.length], "pistola"); };
    document.querySelector("[data-prueba]").onclick = () => abrirPrueba((c, o) => api_ && api_.leer(c, o));
    document.querySelector("[data-reiniciar]").onclick = () => { demoActiva = false; montar(); };
    const d = document.querySelector("[data-demo]");
    d.onclick = async () => {
      if (demoActiva) return; demoActiva = true; d.textContent = "▶ Mostrando…"; d.disabled = true;
      const api = montar();
      try { await def.demo(api); } catch (_) {}
      demoActiva = false; d.textContent = "▶ Ver cómo funciona"; d.disabled = false;
    };
    // La pistola de verdad: lee en cualquier parte de la maqueta, menos con las etiquetas de prueba encima.
    escucharPistola((c, o) => { if (api_ && !document.querySelector(".prueba-velo")) api_.leer(c, o); });
    // «/» lleva el foco al buscador (como `<Buscador atajo>`).
    document.addEventListener("keydown", (e) => { if (e.key === "/" && !e.target.closest("input,textarea")) { const i = document.querySelector("[data-buscar]"); if (i) { e.preventDefault(); i.focus(); } } });
    window.addEventListener("resize", () => document.querySelectorAll("[data-segmento]").forEach(moverPista));
    aplicarEntorno(); montar();
  }

  return { iniciar, Modelo, mensaje };
})();
