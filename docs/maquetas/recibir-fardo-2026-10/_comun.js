/* ====================================================================
   LO COMÚN de las 3 maquetas de «Recibir mercadería»: el MODELO del proceso (el mismo en las tres: qué dijeron que venía, qué
   se contó, qué se separó en conocidas y nuevas, qué causa tiene cada diferencia, quién recibe), la barra de la maqueta, la
   cabecera del módulo, la hoja «Prenda nueva» y la pantalla final «Recibido». Cada maqueta solo decide CÓMO se recorre.
     Comun.iniciar({ letra: "a", estilos: "...", montar(escena, api) {...}, demo(api) {...} })
   ==================================================================== */
window.Comun = (function () {
  const { icono, iconoCat, mini, esc, avatar, FARDO, SIN_AVISO, NUEVOS, CATS, PROVEEDORES, PERSONAS, SEDE, CAUSAS, unidades, prov, plural, COLORES } = RF;
  const MAQUETAS = [
    { letra: "a", archivo: "a-camino.html", nombre: "A · Camino" },
    { letra: "b", archivo: "b-mesa.html", nombre: "B · Mesa de conteo" },
    { letra: "c", archivo: "c-hilo.html", nombre: "C · Hilo de la pistola" },
  ];
  const FECHA = "lunes 12 de octubre · 10:42";

  // ---------- estado de la maqueta, en el hash (sobrevive al cambiar de maqueta desde index.html) ----------
  const PRED = { caso: "aviso", tema: "claro", ancho: "esc", mov: "si", en: "inicio" };
  function leerHash() {
    const s = { ...PRED };
    for (const par of (location.hash || "").slice(1).split("&")) { const [k, v] = par.split("="); if (k in s && v) s[k] = decodeURIComponent(v); }
    return s;
  }
  const est = leerHash();
  function guardarHash() {
    const h = Object.entries(est).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    try { history.replaceState(null, "", "#" + h); } catch (_) {}
    try { parent.postMessage({ hash: "#" + h }, "*"); } catch (_) {}
  }
  const quieto = () => document.body.classList.contains("quieto") || matchMedia("(prefers-reduced-motion: reduce)").matches;

  // =====================================================================================
  // MODELO. Promete: una sola verdad de la recepción que las tres caras pintan. Asume: las unidades reales del fardo (RF.CONTENIDO)
  // son lo que la pistola «lee». No hace: no guarda nada en ningún lado (es una maqueta).
  // =====================================================================================
  let uid = 0;
  function nuevaLinea(l) {
    return { id: l.id, cat: l.cat, marca: l.marca, prov: l.prov, dijeron: l.dijeron ?? null, desc: l.desc || "", contadas: 0, conocidas: {}, nuevas: [], causa: null, nota: "", cola: unidades(l.id), corregida: false, visitada: false };
  }
  const Modelo = {
    crear(caso) {
      const m = { caso, abierto: false, cerrado: false, responsable: null, nota: "", lineas: [], fardo: null, proveedor: null, dijeronTotal: null, guia: "" };
      if (caso === "aviso") { m.fardo = FARDO; m.lineas = FARDO.lineas.map(nuevaLinea); m.guia = FARDO.guia; }
      else { m.proveedor = SIN_AVISO.prov; m.dijeronTotal = SIN_AVISO.dijeronTotal; }
      return m;
    },
    linea(m, id) { return m.lineas.find((l) => l.id === id) || null; },
    abrir(m) { m.abierto = true; },
    /** Sin aviso: la persona agrega la categoría que va a contar. Si ese proveedor manda esa categoría, la caja tiene contenido real. */
    agregarLinea(m, cat) {
      const base = FARDO.lineas.find((l) => l.cat === cat && l.prov === m.proveedor);
      const p = prov(m.proveedor);
      const l = base ? nuevaLinea({ ...base, dijeron: null }) : nuevaLinea({ id: `${cat.toLowerCase()}-${++uid}`, cat, marca: p.marcas[0], prov: p.id, dijeron: null, desc: "" });
      if (!base) l.cola = [];
      m.lineas.push(l);
      return l;
    },
    quitarLinea(m, id) { m.lineas = m.lineas.filter((l) => l.id !== id); },
    contar(m, id, { delta = 0, valor } = {}) {
      const l = Modelo.linea(m, id); if (!l) return;
      l.visitada = true;
      l.contadas = Math.max(0, Math.floor(valor != null ? Number(valor) || 0 : l.contadas + delta));
      return l.contadas;
    },
    /** La pistola lee la siguiente prenda de la caja. Conocida: se suma. Nueva: se devuelve para que la persona la anote (no se consume). */
    leer(m, id) {
      const l = id ? Modelo.linea(m, id) : m.lineas.find((x) => x.cola.length);
      if (!l) return { tipo: "vacia", linea: null };
      if (!l.cola.length) return { tipo: "vacia", linea: l };
      const u = l.cola[0];
      if (u.codigo) { l.cola.shift(); sumarConocida(l, u); return { tipo: "conocida", linea: l, prenda: u }; }
      const mod = NUEVOS[u.nuevo];
      return { tipo: "nueva", linea: l, unidad: u, modelo: { id: u.nuevo, ...mod, pendientes: l.cola.filter((x) => x.nuevo === u.nuevo).length } };
    },
    agregarConocida(m, id, codigo) {
      const l = Modelo.linea(m, id); const p = RF.CATALOGO.find((x) => x.codigo === codigo); if (!l || !p) return null;
      const i = l.cola.findIndex((x) => x.codigo === codigo); if (i >= 0) l.cola.splice(i, 1);
      sumarConocida(l, p); return p;
    },
    quitarConocida(m, id, codigo) {
      const l = Modelo.linea(m, id); const c = l && l.conocidas[codigo]; if (!c) return;
      c.n--; l.cola.unshift({ ...c.prenda }); if (c.n <= 0) delete l.conocidas[codigo];
    },
    anotarNueva(m, id, datos) {
      const l = Modelo.linea(m, id); if (!l) return null;
      const cant = Object.values(datos.tallas || {}).reduce((a, b) => a + (Number(b) || 0), 0) || Number(datos.cant) || 0;
      const n = { id: `n${++uid}`, modelo: datos.modelo || null, desc: datos.desc, color: datos.color, hex: datos.hex, tallas: datos.tallas || {}, cant };
      l.nuevas.push(n); l.visitada = true;
      if (n.modelo) { let q = cant; l.cola = l.cola.filter((x) => (x.nuevo === n.modelo && q-- > 0 ? false : true)); }
      ajustarConteo(l); return n;
    },
    quitarNueva(m, id, nuevaId) { const l = Modelo.linea(m, id); if (l) l.nuevas = l.nuevas.filter((n) => n.id !== nuevaId); },
    ponerCausa(m, id, clave) { const l = Modelo.linea(m, id); if (l) l.causa = l.causa === clave ? null : clave; },
    identificadas(l) { return Object.values(l.conocidas).reduce((a, c) => a + c.n, 0) + l.nuevas.reduce((a, n) => a + n.cant, 0); },
    conocidasDe(l) { return Object.values(l.conocidas).reduce((a, c) => a + c.n, 0); },
    nuevasDe(l) { return l.nuevas.reduce((a, n) => a + n.cant, 0); },
    sinSeparar(l) { return Math.max(0, l.contadas - Modelo.identificadas(l)); },
    diferencia(l) { return l.dijeron == null ? null : l.contadas - l.dijeron; },
    quedanEnCaja(l) { return l.cola.length; },
    totalDijeron(m) { return m.fardo ? m.lineas.reduce((a, l) => a + (l.dijeron || 0), 0) : m.dijeronTotal; },
    totalContadas(m) { return m.lineas.reduce((a, l) => a + l.contadas, 0); },
    totalConocidas(m) { return m.lineas.reduce((a, l) => a + Modelo.conocidasDe(l), 0); },
    totalNuevas(m) { return m.lineas.reduce((a, l) => a + Modelo.nuevasDe(l), 0); },
    modelosNuevos(m) { return m.lineas.flatMap((l) => l.nuevas.map((n) => ({ ...n, linea: l }))); },
    /** Lo que apaga «Recibir», en el orden de la pantalla: lo mismo que pinta «Falta:» (ADR-0284; no agrega reglas). */
    faltan(m) {
      const f = [];
      if (Modelo.totalContadas(m) === 0) f.push({ clave: "vacio", texto: "Cuenta lo que llegó" });
      for (const l of m.lineas) {
        const c = CATS[l.cat];
        if (l.contadas === 0 && l.dijeron > 0) f.push({ clave: "contar", lineaId: l.id, texto: `Cuenta ${c.art} ${c.varias}` });
        const s = Modelo.sinSeparar(l);
        if (s > 0) f.push({ clave: "separar", lineaId: l.id, texto: `Separa ${plural(s, c.una, c.varias)}: ¿conocidas o nuevas?` });
        const d = Modelo.diferencia(l);
        if (d != null && d !== 0 && l.contadas > 0 && !l.causa) f.push({ clave: "causa", lineaId: l.id, texto: d < 0 ? `Di por qué faltan ${plural(-d, c.una, c.varias)}` : `Di por qué sobran ${plural(d, c.una, c.varias)}` });
      }
      if (!m.fardo && m.dijeronTotal != null && Modelo.totalContadas(m) > 0 && Modelo.totalContadas(m) !== m.dijeronTotal && !m.causaTotal) {
        const d = Modelo.totalContadas(m) - m.dijeronTotal;
        f.push({ clave: "causa-total", texto: d < 0 ? `Di por qué faltan ${-d} prendas` : `Di por qué sobran ${d} prendas` });
      }
      if (!m.responsable) f.push({ clave: "responsable", texto: "Elige quién recibe" });
      return f;
    },
    listo(m) { return Modelo.faltan(m).length === 0; },
    resumen(m) {
      return {
        dijeron: Modelo.totalDijeron(m), contadas: Modelo.totalContadas(m), conocidas: Modelo.totalConocidas(m), nuevas: Modelo.totalNuevas(m),
        modelosNuevos: Modelo.modelosNuevos(m),
        diferencias: m.lineas.map((l) => ({ linea: l, dif: Modelo.diferencia(l) ?? 0, causa: l.causa })).filter((x) => x.dif !== 0),
      };
    },
    cerrar(m) { m.cerrado = true; m.hora = "10:58"; return Modelo.resumen(m); },
    // Atajos de la simulación (una persona real cuenta y escanea de a una).
    contarReal(m, id) { const l = Modelo.linea(m, id); if (l) { l.contadas = Modelo.identificadas(l) + l.cola.length; l.visitada = true; } },
    separarTodo(m, id) {
      const l = Modelo.linea(m, id); if (!l) return;
      let guarda = 0;
      while (l.cola.length && guarda++ < 500) {
        const r = Modelo.leer(m, id);
        if (r.tipo === "nueva") Modelo.anotarNueva(m, id, { modelo: r.modelo.id, desc: r.modelo.desc, color: r.modelo.color, hex: r.modelo.hex, tallas: r.modelo.tallas });
      }
    },
  };
  function sumarConocida(l, u) { const c = (l.conocidas[u.codigo] ||= { prenda: u, n: 0 }); c.n++; l.visitada = true; ajustarConteo(l); }
  /** Separar más de lo contado corrige el conteo: la prenda en la mano manda sobre el número tecleado (perdonar antes que preguntar). */
  function ajustarConteo(l) { const i = Modelo.identificadas(l); if (l.contadas < i) { if (l.contadas > 0) l.corregida = true; l.contadas = i; } }

  // =====================================================================================
  // UI COMÚN
  // =====================================================================================
  function cabecera({ frase, der = "", volver = "" }) {
    return `<header class="cab" data-voz="cabecera">
      <div class="anim-sube">
        <div class="fila" style="gap:12px">${volver}<p class="sede">${esc(SEDE)} · ${FECHA}</p></div>
        <h1>Recibir mercadería</h1>
        <p class="frase">${frase}</p>
      </div>
      ${der ? `<div class="der anim-sube" style="--i:1">${der}</div>` : ""}
    </header>`;
  }
  const volverBtn = (a, attrs = "") => `<button class="volver" ${attrs} aria-label="Volver a ${esc(a)}" title="Volver a ${esc(a)}">${icono("izq")}</button>`;

  /** La fila «Falta:» tocable al pie (ADR-0284): cada cosa lleva a su lugar. */
  function faltaChips(m, { alTocar = "" } = {}) {
    const f = Modelo.faltan(m);
    if (!f.length) return `<div class="falta-chips listo"><span class="chip verde punto">Todo listo para recibir</span></div>`;
    return `<div class="falta-chips"><span class="label" style="margin-right:4px">Falta</span>${f.map((x) => `<button class="fc" data-falta="${x.clave}" ${x.lineaId ? `data-linea="${x.lineaId}"` : ""}>${icono("der")}${esc(x.texto)}</button>`).join("")}</div>`;
  }

  /** El bloque «Dijeron / Contaste» con la balanza: el brazo se inclina hacia donde hay más (una vez, al cambiar). */
  function balanza(dijeron, contadas, { chica = false } = {}) {
    const d = dijeron == null ? 0 : contadas - dijeron;
    const ang = dijeron == null ? 0 : Math.max(-9, Math.min(9, d * 1.6));
    const estado = dijeron == null ? "neutro" : contadas === 0 ? "neutro" : d === 0 ? "verde" : "ambar";
    const texto = dijeron == null ? "Sin aviso: no hay con qué comparar" : contadas === 0 ? "Todavía no contaste" : d === 0 ? "Cuadra con lo que dijeron" : d < 0 ? `Faltan ${-d}` : `Sobran ${d}`;
    return `<div class="balanza ${chica ? "chica" : ""}" data-estado="${estado}">
      <div class="lado"><span class="label">Dijeron</span><b class="num disp">${dijeron == null ? "—" : dijeron}</b></div>
      <svg viewBox="0 0 120 70" aria-hidden="true">
        <path class="poste" d="M60 14v46M40 60h40"/>
        <g class="brazo" style="--ang:${ang}deg"><path d="M14 22h92"/><circle cx="60" cy="22" r="3.5"/>
          <path class="plato" d="M8 36h12l-6-14zM100 36h12l-6-14z"/></g>
      </svg>
      <div class="lado"><span class="label">Contaste</span><b class="num disp" data-cuenta>${contadas}</b></div>
      <p class="veredicto"><span class="chip punto ${estado === "verde" ? "verde" : estado === "ambar" ? "ambar" : "neutro"}">${texto}</span></p>
    </div>`;
  }

  // ---------- la hoja (modal del sistema) ----------
  let hojaAbierta = null;
  function hoja(html, { alCerrar, clase = "" } = {}) {
    cerrarHoja(true);
    const esc_ = document.getElementById("escena");
    const velo = document.createElement("div"); velo.className = "velo";
    const capa = document.createElement("div"); capa.className = "capa";
    capa.innerHTML = `<div class="hoja cascada ${clase}" role="dialog" aria-modal="true"><button class="cerrar" data-sin-cascada aria-label="Cerrar">${icono("x")}</button>${html}</div>`;
    const top = esc_.scrollTop, alto = esc_.clientHeight;
    for (const el of [velo, capa]) { el.style.top = top + "px"; el.style.height = alto + "px"; el.style.bottom = "auto"; }
    esc_.appendChild(velo); esc_.appendChild(capa);
    const overflowAntes = esc_.style.overflow; esc_.style.overflow = "hidden";
    hojaAbierta = { velo, capa, alCerrar, overflowAntes };
    velo.addEventListener("click", () => cerrarHoja());
    capa.querySelector(".cerrar").addEventListener("click", () => cerrarHoja());
    const primero = capa.querySelector("input,button:not(.cerrar)"); if (primero) setTimeout(() => primero.focus(), 200);
    return capa.querySelector(".hoja");
  }
  function cerrarHoja(seco = false) {
    if (!hojaAbierta) return;
    const { velo, capa, alCerrar, overflowAntes } = hojaAbierta; hojaAbierta = null;
    const fin = () => { velo.remove(); capa.remove(); const e = document.getElementById("escena"); if (e) e.style.overflow = overflowAntes || ""; alCerrar && alCerrar(); };
    if (seco || quieto()) return fin();
    velo.classList.add("cerrando"); capa.classList.add("cerrando");
    velo.style.animation = "velo-out 220ms var(--ease-salida) both"; capa.firstElementChild.style.animation = "hoja-out 220ms var(--ease-salida) both";
    setTimeout(fin, 230);
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && hojaAbierta && !e.defaultPrevented) { e.stopPropagation(); cerrarHoja(); } });

  /** «Prenda nueva»: no está en el catálogo. Se anota para crearla después; lo contado queda en el almacén. */
  function hojaNueva({ linea, sugerida = null, alGuardar }) {
    const c = CATS[linea.cat];
    const d = { desc: sugerida ? sugerida.desc : "", color: sugerida ? sugerida.color : "", hex: sugerida ? sugerida.hex : "", tallas: Object.fromEntries(c.tallas.map((t) => [t, (sugerida && sugerida.tallas[t]) || 0])) };
    const h = hoja(`
      <div class="fila" style="gap:12px">${RF.mini(linea.cat, d.hex || "#b9b2a7", "grande")}
        <div><p class="label">Prenda nueva · ${esc(c.nombre)} · ${esc(linea.marca)}</p><h2>No está en el catálogo</h2></div></div>
      <p class="bajada">Anótala para que se cree después. Lo que cuentes aquí queda guardado en el almacén, pero no se puede vender hasta crearla.
        ${sugerida ? `<br><span class="tenue">La pistola leyó el código del proveedor <span class="mono">${esc(sugerida.codigoProv || "")}</span>, que CAYLA no conoce.</span>` : ""}</p>
      <div class="campo luz" data-campo="desc"><div class="fila entre"><span class="fila" style="gap:8px"><span class="marca" data-estado="falta"></span><span class="label">Qué es</span></span><span class="sigue" hidden>Sigue aquí</span></div>
        <div class="caja"><input name="desc" placeholder="Ej. ${esc(c.ej)}" value="${esc(d.desc)}" autocomplete="off"></div></div>
      <div class="campo luz" data-campo="color"><div class="fila entre"><span class="fila" style="gap:8px"><span class="marca" data-estado="falta"></span><span class="label">Color</span></span><span class="sigue" hidden>Sigue aquí</span></div>
        <div class="colores">${COLORES.map((k) => `<button type="button" class="color" data-color="${esc(k.n)}" data-hex="${k.hex}" aria-pressed="${k.n === d.color}" title="${esc(k.n)}"><i style="--c:${k.hex}"></i><span>${esc(k.n)}</span></button>`).join("")}</div></div>
      <div class="campo luz" data-campo="tallas"><div class="fila entre"><span class="fila" style="gap:8px"><span class="marca" data-estado="falta"></span><span class="label">Cuántas de cada talla</span></span><span class="sigue" hidden>Sigue aquí</span></div>
        <div class="tallas">${c.tallas.map((t) => `<div class="talla" data-talla="${t}"><b>${t}</b><div class="paso"><button type="button" data-d="-1" aria-label="Una menos">${icono("minus")}</button><span class="num" data-n>${d.tallas[t]}</span><button type="button" data-d="1" aria-label="Una más">${icono("plus")}</button></div></div>`).join("")}</div></div>
      <div class="pie-hoja"><p class="total">Total <b class="num disp" data-total>0</b></p><div class="fila"><button class="btn sut" data-cancelar>Cancelar</button><button class="btn pri grande" data-guardar disabled>${icono("chispa")}<span data-txt>Anotar como nueva</span></button></div></div>
    `, { clase: "hoja-nueva" });
    const total = () => Object.values(d.tallas).reduce((a, b) => a + b, 0);
    function pintar() {
      h.querySelector("[data-total]").textContent = total();
      const ok = d.desc.trim().length >= 3 && total() > 0;
      const b = h.querySelector("[data-guardar]"); b.disabled = !ok; h.querySelector("[data-txt]").textContent = total() > 0 ? `Anotar ${total()} ${total() === 1 ? "nueva" : "nuevas"}` : "Anotar como nueva";
      h.querySelector(".mini").style.setProperty("--c", d.hex || "#b9b2a7");
      // La guía de foco: una marca por campo, UNA luz a la vez; el color es sugerido (no bloquea).
      const estados = { desc: d.desc.trim().length >= 3 ? "hecho" : "falta", color: d.color ? "hecho" : "opcional", tallas: total() > 0 ? "hecho" : "falta" };
      const ahora = estados.desc !== "hecho" ? "desc" : estados.tallas !== "hecho" ? "tallas" : null;
      for (const [k, e] of Object.entries(estados)) {
        const campo = h.querySelector(`[data-campo="${k}"]`); const marca = campo.querySelector(".marca");
        const estado = ahora === k ? "ahora" : e;
        if (marca.dataset.estado !== estado) { marca.dataset.estado = estado; marca.innerHTML = estado === "hecho" ? `<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>` : ""; }
        campo.dataset.estado = ahora === k ? "ahora" : ""; campo.querySelector(".sigue").hidden = ahora !== k;
      }
    }
    h.querySelector("input[name=desc]").addEventListener("input", (e) => { d.desc = e.target.value; pintar(); });
    h.querySelectorAll(".color").forEach((b) => b.addEventListener("click", () => { d.color = b.dataset.color; d.hex = b.dataset.hex; h.querySelectorAll(".color").forEach((x) => x.setAttribute("aria-pressed", x === b)); pintar(); }));
    h.querySelectorAll(".talla button").forEach((b) => b.addEventListener("click", () => {
      const t = b.closest(".talla").dataset.talla; d.tallas[t] = Math.max(0, d.tallas[t] + Number(b.dataset.d));
      const n = b.closest(".talla").querySelector("[data-n]"); n.textContent = d.tallas[t]; n.classList.remove("rueda"); void n.offsetWidth; n.classList.add("rueda"); pintar();
    }));
    h.querySelector("[data-cancelar]").addEventListener("click", () => cerrarHoja());
    h.querySelector("[data-guardar]").addEventListener("click", () => {
      const datos = { modelo: sugerida ? sugerida.id : null, desc: d.desc.trim(), color: d.color, hex: d.hex, tallas: Object.fromEntries(Object.entries(d.tallas).filter(([, n]) => n > 0)) };
      cerrarHoja(); alGuardar(datos);
    });
    pintar();
    return h;
  }

  /** La ficha de una prenda nueva anotada (misma pieza en las tres y en «Recibido»). */
  function fichaNueva(n, l, { quitar = true } = {}) {
    const tallas = Object.entries(n.tallas).map(([t, k]) => `<span class="tl"><b>${t}</b>${k}</span>`).join("");
    return `<div class="ficha-nueva" data-nueva="${n.id}">${RF.mini(l.cat, n.hex || "#b9b2a7")}
      <div class="crece"><p class="fila" style="gap:8px"><b>${esc(n.desc)}</b><span class="chip taupe">${icono("chispa")}Nueva</span></p>
      <p class="tenue" style="font-size:12.5px">${esc(CATS[l.cat].nombre)} · ${esc(l.marca)} · ${esc(n.color || "sin color")} · <span class="tallas-in">${tallas}</span></p></div>
      <b class="num disp cant">${n.cant}</b>${quitar ? `<button class="quitar" data-quitar-nueva="${n.id}" data-linea="${l.id}" aria-label="Quitar">${icono("x")}</button>` : ""}</div>`;
  }
  /** Una prenda conocida sumada (código CAYLA): miniatura, nombre, talla y color, cuántas. */
  function fichaConocida(c, l, { quitar = true } = {}) {
    const p = c.prenda;
    return `<div class="ficha-conocida" data-codigo="${p.codigo}">${RF.mini(l.cat, p.hex, "chica")}
      <div class="crece"><b>${esc(p.nombre)}</b> <span class="tenue">· ${esc(p.talla)} · ${esc(p.color)}</span><br><span class="mono tenue" style="font-size:11px">${esc(p.codigo)}</span></div>
      <b class="num disp cant">${c.n}</b>${quitar ? `<button class="quitar" data-quitar-conocida="${p.codigo}" data-linea="${l.id}" aria-label="Quitar una">${icono("minus")}</button>` : ""}</div>`;
  }

  /** Quién recibe (ComboResponsable, ADR-0162): la gente de la sede; nunca quien creó la orden (ADR-0362, d.17). */
  function responsableHtml(m) {
    return `<div class="responsables">${PERSONAS.filter((p) => p.id !== "rosa").map((p) => `<button class="resp" data-resp="${p.id}" aria-pressed="${m.responsable === p.id}">${avatar(p, 28)}<span><b>${esc(p.nombre)}</b><small>${esc(p.rol)}</small></span>${m.responsable === p.id ? `<span class="marca" data-estado="hecho"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span>` : ""}</button>`).join("")}
      <p class="tenue" style="font-size:12px;flex-basis:100%">Rosa Delgado no aparece: ella hizo la orden de compra y quien la hace no puede recibirla (regla de Compras).</p></div>`;
  }

  /** La pantalla final «Recibido»: igual en las tres. */
  function pantallaRecibido(m, { otra = "" } = {}) {
    const r = Modelo.resumen(m);
    const difs = r.diferencias.map(({ linea, dif, causa }) => {
      const c = CATS[linea.cat]; const causas = dif < 0 ? CAUSAS.faltante : CAUSAS.sobrante; const k = causas.find((x) => x.clave === causa);
      return `<li><b class="num">${dif < 0 ? "−" : "+"}${Math.abs(dif)}</b> ${esc(c.varias)} · ${esc(k ? k.texto : "sin causa")} <span class="tenue">→ ${esc(k ? k.luego : "")}</span></li>`;
    }).join("");
    const nuevos = r.modelosNuevos;
    const quien = PERSONAS.find((p) => p.id === m.responsable);
    return `<section class="recibido cascada">
      <div class="fila arriba" style="gap:20px">
        <div class="sello"><span class="onda"></span><span class="onda dos"></span><svg viewBox="0 0 88 88"><circle class="aro" cx="44" cy="44" r="42"/><path class="visto" d="M27 45l11 11 23-25"/></svg></div>
        <div><p class="label">Recibido · ${esc(SEDE)} · ${m.hora || "10:58"}</p><h2 class="disp" style="font-size:36px;line-height:1.05;margin-top:4px">${r.contadas} prendas entraron al almacén</h2>
          <p class="tenue" style="margin-top:6px">${quien ? `Recibió ${esc(quien.nombre)}.` : ""} ${m.fardo ? `Fardo ${esc(m.fardo.codigo)} · guía ${esc(m.guia)}` : `Sin aviso · ${esc(prov(m.proveedor).nombre)}`}.</p></div>
      </div>
      <div class="cifras">
        <div class="tc"><p class="label"><i></i>Dijeron</p><p class="valor num">${r.dijeron ?? "—"}</p></div>
        <div class="tc"><p class="label"><i class="verde"></i>Contaste</p><p class="valor num" data-cuenta>${r.contadas}</p></div>
        <div class="tc"><p class="label"><i class="${r.diferencias.length ? "ambar" : "verde"}"></i>Diferencias</p><p class="valor num">${r.diferencias.length}<small>${r.diferencias.length === 1 ? "línea" : "líneas"}</small></p></div>
        <div class="tc"><p class="label"><i class="pizarra"></i>Por crear</p><p class="valor num">${nuevos.length}<small>${nuevos.length === 1 ? "prenda nueva" : "prendas nuevas"}</small></p></div>
      </div>
      <div class="bloque">
        <div class="fila entre envuelve"><h3 class="disp" style="font-size:22px">${r.conocidas} prendas ya se pueden etiquetar y vender</h3><span class="chip verde punto">En el almacén</span></div>
        <p class="tenue">Las conocidas entraron al stock del almacén con su movimiento. Lo que sigue en la tienda: la etiqueta de precio y colgarlas en el piso.</p>
        <div class="fila envuelve" style="margin-top:10px"><button class="btn pri grande" data-accion="etiquetas">${icono("impresora")}Imprimir ${r.conocidas} etiquetas</button><button class="btn sec grande" data-accion="colgar">${icono("percha")}Colgar en el piso</button></div>
      </div>
      ${nuevos.length ? `<div class="bloque porcrear">
        <div class="fila entre envuelve"><h3 class="disp" style="font-size:22px">${nuevos.length === 1 ? "Una prenda nueva por crear" : `${nuevos.length} prendas nuevas por crear`} · ${r.nuevas} unidades</h3><span class="chip pizarra punto">Guardadas, no se venden aún</span></div>
        <p class="tenue">Están en el almacén, pero no existen en el catálogo: hasta que alguien las cree (nombre, precio, foto) Vender no las encuentra. Quedan anotadas aquí, en Catálogo ▸ Productos ▸ <b>Por crear</b> y en el Inicio de la encargada.</p>
        <div class="col" style="gap:8px;margin-top:10px">${nuevos.map((n) => `<div class="fila" style="gap:10px">${fichaNueva(n, n.linea, { quitar: false })}<button class="btn sec" data-accion="crear" data-nueva="${n.id}">${icono("plus", "mas")}Crear ahora</button></div>`).join("")}</div>
        <div class="fila envuelve" style="margin-top:12px"><button class="btn sut" data-accion="avisar">${icono("campana")}Avisar a Lucía (encargada)</button><span class="tenue" style="font-size:12.5px">Al crearla, el stock contado entra solo: no se vuelve a contar.</span></div>
      </div>` : ""}
      ${difs ? `<div class="bloque"><h3 class="disp" style="font-size:22px">Lo que no cuadró</h3><ul class="difs">${difs}</ul><p class="tenue" style="font-size:12.5px">La sede dice qué pasó; Compras decide qué pasa con la plata. Tú no tienes que hacer nada más.</p></div>` : `<div class="bloque"><div class="fila" style="gap:8px"><span class="chip verde punto">Cuadró</span><span class="tenue">Llegó exactamente lo que dijeron.</span></div></div>`}
      <div class="fila envuelve" style="gap:10px">${otra}<button class="btn sut" data-accion="historial">${icono("lista")}Ver todo lo recibido</button></div>
    </section>`;
  }

  // ---------- movimiento: cifra que cuenta, vuelo de una ficha, FLIP, onda del botón ----------
  function cuenta(el, hasta, dur = 700) {
    if (!el) return; const desde = Number(String(el.textContent).replace(/[^\d-]/g, "")) || 0; hasta = Number(hasta) || 0;
    if (quieto() || desde === hasta) { el.textContent = hasta; return; }
    const t0 = performance.now();
    const paso = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(desde + (hasta - desde) * e); if (k < 1) requestAnimationFrame(paso); };
    requestAnimationFrame(paso);
  }
  function rueda(el, valor) { if (!el) return; el.textContent = valor; if (quieto()) return; el.classList.remove("rueda"); void el.offsetWidth; el.classList.add("rueda"); }
  function volar(desde, hasta, html, { dur = 460 } = {}) {
    return new Promise((fin) => {
      if (!desde || !hasta || quieto()) return fin();
      const a = desde.getBoundingClientRect(), b = hasta.getBoundingClientRect();
      const g = document.createElement("div"); g.className = "vuelo"; g.innerHTML = html; document.body.appendChild(g);
      const r = g.getBoundingClientRect();
      g.style.left = a.left + a.width / 2 - r.width / 2 + "px"; g.style.top = a.top + a.height / 2 - r.height / 2 + "px";
      const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const an = g.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${dx * 0.55}px,${dy * 0.55 - 26}px) scale(.9)`, opacity: 1, offset: 0.55 }, { transform: `translate(${dx}px,${dy}px) scale(.6)`, opacity: 0 }], { duration: dur, easing: "cubic-bezier(.32,.72,.24,1)" });
      an.onfinish = () => { g.remove(); fin(); };
    });
  }
  function flip(cont, mutar, { dur = 420 } = {}) {
    const antes = new Map(); if (!quieto()) cont.querySelectorAll("[data-flip]").forEach((el) => antes.set(el.dataset.flip, el.getBoundingClientRect()));
    mutar();
    if (quieto()) return;
    cont.querySelectorAll("[data-flip]").forEach((el) => {
      const a = antes.get(el.dataset.flip); if (!a) { el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.32,.72,.24,1)" }); return; }
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
  // Un <input type="number"> con foco cambia de valor con la rueda del mouse en Chrome: al desplazar la página sobre el número
  // grande, el conteo bajaba solo. Se le quita el foco antes de que la rueda lo toque.
  document.addEventListener("wheel", (e) => { const a = document.activeElement; if (a && a.matches && a.matches('input[type="number"]') && a.contains(e.target)) a.blur(); }, { passive: true });
  let avisoT = null;
  function aviso(texto, tono = "verde") {
    const esc_ = document.getElementById("escena"); let a = esc_.querySelector(".aviso-flotante");
    if (!a) { a = document.createElement("div"); a.className = "aviso-flotante"; esc_.appendChild(a); }
    a.style.top = esc_.scrollTop + 14 + "px";
    a.innerHTML = `<span class="chip ${tono} punto">${esc(texto)}</span>`; a.classList.remove("ver"); void a.offsetWidth; a.classList.add("ver");
    clearTimeout(avisoT); avisoT = setTimeout(() => a.classList.remove("ver"), 3200);
  }
  const pausa = (ms) => new Promise((r) => setTimeout(r, quieto() ? Math.min(ms, 40) : ms));
  function flash(el, tono = "verde") { if (!el || quieto()) return; el.classList.remove("flash-verde", "flash-ambar"); void el.offsetWidth; el.classList.add(tono === "verde" ? "flash-verde" : "flash-ambar"); }
  function destello(el) { if (!el || quieto()) return; el.classList.remove("anim-destello"); void el.offsetWidth; el.classList.add("anim-destello"); }

  // ---------- la barra y el arranque ----------
  let cfg, demoActiva = false, generacion = 0;
  function barra() {
    const op = (g, v, t) => `<button class="op" data-g="${g}" data-v="${v}" aria-pressed="${est[g] === v}">${t}</button>`;
    return `<div class="spike">
      <span class="tit">Recibir mercadería · maqueta</span>
      <span class="grupo">${MAQUETAS.map((m) => `<a class="nav" href="${m.archivo}" data-nav ${m.letra === cfg.letra ? 'aria-current="page"' : ""}>${m.nombre}</a>`).join("")}</span>
      <span class="sep"></span>
      <span class="grupo"><span>Datos</span>${op("caso", "aviso", "Con aviso de Compras")}${op("caso", "sin", "Sin aviso (WhatsApp)")}</span>
      <span class="grupo"><span>Tema</span>${op("tema", "claro", "Claro")}${op("tema", "oscuro", "Oscuro")}</span>
      <span class="grupo"><span>Ancho</span>${op("ancho", "esc", "Escritorio")}${op("ancho", "cel", "375 px")}</span>
      <span class="grupo"><span>Movimiento</span>${op("mov", "si", "Con")}${op("mov", "no", "Sin")}</span>
      <span class="grupo"><span>Abrir en</span>${op("en", "inicio", "Inicio")}${op("en", "contar", "Contar")}${op("en", "separar", "Separar")}${op("en", "cerrar", "Cerrar")}${op("en", "recibido", "Recibido")}</span>
      <span class="sep"></span>
      <span class="grupo">${cfg.demo ? `<button class="op rojo" data-demo>▶ Ver cómo se recibe</button>` : ""}<button class="op" data-reiniciar>↻ Reiniciar</button></span>
    </div>`;
  }
  function aplicarClases() {
    document.body.classList.toggle("celular", est.ancho === "cel");
    document.body.classList.toggle("quieto", est.mov === "no");
    document.documentElement.dataset.tema = est.tema;
    const alto = document.querySelector(".spike").getBoundingClientRect().height;
    document.documentElement.style.setProperty("--alto-spike", alto + "px");
  }
  function montar() {
    generacion++; demoActiva = false; cerrarHoja(true);
    const escena = document.getElementById("escena"); escena.innerHTML = ""; escena.scrollTop = 0;
    const modelo = Modelo.crear(est.caso);
    cfg.montar(escena, api(modelo));
  }
  function api(modelo) {
    const g = generacion;
    return { modelo, est, Modelo, cabecera, volverBtn, faltaChips, balanza, hoja, cerrarHoja, hojaNueva, fichaNueva, fichaConocida, responsableHtml, pantallaRecibido, cuenta, rueda, volar, flip, aviso, pausa, flash, destello, quieto, viva: () => g === generacion && !hojaAbiertaAjena(), FECHA };
  }
  function hojaAbiertaAjena() { return false; }
  function conectarBarra() {
    document.querySelectorAll(".spike .op[data-g]").forEach((b) => b.addEventListener("click", () => {
      const g = b.dataset.g; est[g] = b.dataset.v; guardarHash();
      document.querySelectorAll(`.spike .op[data-g="${g}"]`).forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === est[g])));
      aplicarClases();
      if (g === "caso" || g === "en") montar();
    }));
    document.querySelectorAll(".spike a.nav").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); location.href = a.getAttribute("href") + location.hash; }));
    document.querySelector("[data-reiniciar]").addEventListener("click", () => montar());
    const d = document.querySelector("[data-demo]");
    if (d) d.addEventListener("click", async () => {
      if (demoActiva) return; est.en = "inicio"; guardarHash(); document.querySelectorAll('.spike .op[data-g="en"]').forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === "inicio"))); montar(); demoActiva = true; d.textContent = "▶ Recibiendo…"; d.disabled = true;
      const g = generacion;
      try { await cfg.demo(api(cfgModeloActual()), () => g === generacion); } finally { if (g === generacion) demoActiva = false; d.textContent = "▶ Ver cómo se recibe"; d.disabled = false; }
    });
    window.addEventListener("resize", aplicarClases);
  }
  let modeloActual = null;
  function cfgModeloActual() { return modeloActual; }
  function iniciar(c) {
    cfg = c;
    document.documentElement.dataset.tema = est.tema;
    if (c.estilos) { const st = document.createElement("style"); st.textContent = c.estilos; document.head.appendChild(st); }
    const st2 = document.createElement("style"); st2.textContent = ESTILOS_COMUNES; document.head.appendChild(st2);
    document.body.innerHTML = barra() + `<div id="marco"><div id="escena"></div></div>`;
    // `montar` recibe el modelo nuevo cada vez; la demo necesita el mismo objeto, así que lo recordamos aquí.
    const montarOriginal = c.montar; c.montar = (escena, a) => { modeloActual = a.modelo; return montarOriginal(escena, a); };
    aplicarClases(); conectarBarra(); montar();
  }

  const ESTILOS_COMUNES = `
  .volver{width:34px;height:34px;border-radius:50%;border:1.5px solid var(--t25);display:grid;place-items:center;color:var(--tinta);transition:background-color 220ms var(--ease),border-color 220ms var(--ease),translate 220ms var(--ease)}
  .volver:hover{background:var(--hueso);border-color:var(--tinta);translate:-2px 0}
  .balanza{display:grid;grid-template-columns:1fr 120px 1fr;align-items:center;gap:8px 14px;padding:14px 18px;border:1px solid var(--sand);border-radius:var(--r-xl);background:var(--papel)}
  .balanza .lado{display:flex;flex-direction:column;gap:2px}.balanza .lado:last-of-type{align-items:flex-end;text-align:right}
  .balanza .lado b{font-size:40px;line-height:1}
  .balanza svg{width:120px;height:70px;stroke:var(--t45);fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
  .balanza .brazo{transform-origin:60px 22px;transform:rotate(var(--ang,0deg));transition:transform 900ms var(--ease)}
  .balanza .brazo circle{fill:var(--tinta);stroke:none}
  .balanza[data-estado="verde"] svg{stroke:var(--verde)}.balanza[data-estado="ambar"] svg{stroke:var(--ambar)}
  .balanza .veredicto{grid-column:1/-1;display:flex;justify-content:center}
  .balanza.chica{padding:10px 14px;grid-template-columns:1fr 90px 1fr}.balanza.chica .lado b{font-size:28px}.balanza.chica svg{width:90px;height:52px}
  .campo{padding:12px;border-radius:var(--r-lg);margin-top:14px}
  .campo .caja{margin-top:8px}
  .colores{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  .color{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--sand);border-radius:999px;padding:4px 10px 4px 5px;font-size:12.5px;color:var(--t75);transition:border-color 200ms var(--ease),background-color 200ms var(--ease)}
  .color i{width:18px;height:18px;border-radius:50%;background:var(--c);box-shadow:inset 0 0 0 1px var(--t15)}
  .color:hover{border-color:var(--t45)}.color[aria-pressed=true]{border-color:var(--tinta);background:var(--hueso);color:var(--tinta)}
  .tallas{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
  .talla{display:flex;flex-direction:column;align-items:center;gap:4px;border:1px solid var(--sand);border-radius:var(--r-lg);padding:8px 10px;min-width:72px;background:var(--papel)}
  .talla>b{font-size:13px}
  .paso{display:inline-flex;align-items:center;gap:2px}
  .paso button{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;color:var(--t75);transition:background-color 150ms,color 150ms}
  .paso button:hover{background:var(--hueso);color:var(--tinta)}
  .paso .num{min-width:26px;text-align:center;font-weight:600;font-size:16px}
  .pie-hoja{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:18px;padding-top:14px;border-top:1px solid var(--sand);flex-wrap:wrap}
  .pie-hoja .total{font-size:14px;color:var(--t65)}.pie-hoja .total b{font-size:24px;margin-left:6px;color:var(--tinta)}
  .ficha-nueva,.ficha-conocida{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--sand);border-radius:var(--r-lg);background:var(--papel);flex:1;min-width:0}
  .ficha-nueva{border-style:dashed;border-color:color-mix(in srgb,var(--pizarra) 45%,transparent)}
  .ficha-nueva .cant,.ficha-conocida .cant{font-size:24px;min-width:34px;text-align:right}
  .ficha-nueva .tl{display:inline-flex;gap:3px;margin-right:6px}.ficha-nueva .tl b{font-weight:700;color:var(--t75)}
  .quitar{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;color:var(--t45);transition:background-color 150ms,color 150ms}
  .quitar:hover{background:var(--hueso);color:var(--rojo)}
  .responsables{display:flex;flex-wrap:wrap;gap:8px}
  .resp{display:flex;align-items:center;gap:10px;border:1px solid var(--sand);border-radius:var(--r-lg);padding:8px 12px 8px 8px;background:var(--papel);min-width:220px;transition:border-color 200ms var(--ease),background-color 200ms var(--ease),translate 200ms var(--ease)}
  .resp span b{display:block;font-size:14px}.resp span small{display:block;font-size:12px;color:var(--t55)}
  .resp:hover{border-color:var(--t45);translate:0 -1px}.resp[aria-pressed=true]{border-color:var(--tinta);background:var(--hueso)}
  .resp .marca{margin-left:auto}
  .recibido{display:flex;flex-direction:column;gap:18px}
  .recibido .cifras{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .recibido .bloque{background:var(--papel);border:1px solid var(--sand);border-radius:var(--r-xl);padding:18px 20px}
  .recibido .bloque.porcrear{border-style:dashed;border-color:color-mix(in srgb,var(--pizarra) 45%,transparent)}
  .recibido .difs{list-style:none;display:flex;flex-direction:column;gap:6px;margin-top:8px;font-size:14px}
  .recibido .difs b{font-size:18px;margin-right:4px}
  @container escena (max-width:640px){.recibido .cifras{grid-template-columns:1fr 1fr}.recibido h2.disp{font-size:28px!important}.balanza{grid-template-columns:1fr 90px 1fr}.balanza .lado b{font-size:30px}.balanza svg{width:90px;height:52px}}
  .vuelo{position:fixed;z-index:200;pointer-events:none;background:var(--papel);border:1px solid var(--sand);border-radius:10px;padding:6px 10px;font-size:12.5px;display:flex;align-items:center;gap:8px;box-shadow:var(--sh-md);white-space:nowrap}
  .aviso-flotante{position:absolute;top:14px;right:16px;z-index:60;opacity:0;transform:translateY(-6px);transition:opacity 260ms var(--ease),transform 260ms var(--ease);pointer-events:none}
  .aviso-flotante.ver{opacity:1;transform:none}
  .aviso-flotante .chip{padding:8px 14px;font-size:13px;box-shadow:var(--sh-md);background:var(--papel)}
  `;

  return { iniciar, Modelo, MAQUETAS };
})();
