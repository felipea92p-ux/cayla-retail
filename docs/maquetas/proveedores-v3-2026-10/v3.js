// Proveedores v3 (2026-10-26, tercera ronda). Lo que pidió Felipe: un RANKING que se ordene por prendas compradas o por dinero, y a la
// DERECHA lo que no se ve a simple vista. Lo que rechazó: el mosaico, el espacio muerto y el color mal usado. Las reglas salen de
// INVESTIGACION.md: una barra neutra por fila (el largo es cuánto le compras), el color solo en la marca del ritmo y en las excepciones
// (siempre con forma y palabra), y la columna derecha como una cola ordenada por urgencia.
(function () {
  const C = window.C;

  // ---------- Estado de la lista (vive en la maqueta, no en la URL) ----------
  const E = { modo: "prendas", orden: "compras", asc: false, filtro: null, q: "", todos: false, abierto: null, elegido: null };
  const POR_PAGINA = 20;

  // ---------- El ritmo: forma, color y palabra (nunca color solo) ----------
  const RITMO = {
    rapido: { palabra: "Repón", forma: "circulo", ayuda: "Lo que queda se acaba en 6 semanas o menos" },
    medio: { palabra: "A su ritmo", forma: "cuadrado", ayuda: "Lo que queda se vende en 6 a 16 semanas" },
    lento: { palabra: "Frena", forma: "triangulo", ayuda: "Tardaría 16 semanas o más en venderse" },
    nomide: { palabra: "Poco para medir", forma: "anillo", ayuda: "Le compraste menos de 20 prendas" },
  };
  const claseDe = (p) => { const r = C.ritmo(p); return !r.juzgable ? "nomide" : r.lento ? "lento" : r.agota ? "rapido" : "medio"; };
  const sem = (p) => { const r = C.ritmo(p); return !r.juzgable ? null : !Number.isFinite(r.agotar) ? Infinity : r.agotar; };
  const semTxt = (p) => { const s = sem(p); return s == null ? "—" : !Number.isFinite(s) ? "sin ventas" : s >= 100 ? "100+ sem" : `${Math.max(1, Math.round(s))} sem`; };
  const marca = (k, extra = "") => `<i class="w-forma ${RITMO[k].forma} ${k}" aria-hidden="true"></i>${extra}`;
  // Lo que le debes: el monto vencido en rojo y con su ✕ (lo único que pide actuar hoy); si no, lo que le debes en tinta.
  const deuda = (p) => (p.vencido ? `<span class="w-rojo" title="${C.S(p.vencido)} ya venció de ${C.S(p.deuda)}"><i class="w-forma cruz" aria-hidden="true"></i> ${C.S(p.vencido)}</span>` : p.deuda ? C.S(p.deuda) : '<span class="tenue">—</span>');
  const ritmoCelda = (p, conPalabra = true) => { const k = claseDe(p); return `<span class="w-ritmo ${k}" title="${RITMO[k].ayuda}">${marca(k)}<b class="num">${semTxt(p)}</b>${conPalabra ? `<span class="w-palabra">${RITMO[k].palabra}</span>` : ""}</span>`; };

  // ---------- Cuánto le compras: prendas o dinero ----------
  const val = (p) => (E.modo === "soles" ? C.gasto(p) : p.comprado);
  const vend = (p) => (E.modo === "soles" ? p.vendidas * p.costo : p.vendidas);
  const fmt = (n) => (E.modo === "soles" ? C.S(n) : C.N(n));
  const aprox = (p) => E.modo === "soles" && C.costoReal(p) < C.COSTO_REAL_MIN_PCT;

  // ---------- Lo que se lista: filtro, búsqueda y orden ----------
  const sinTildes = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const CLAVES = {
    compras: (p) => val(p),
    vendido: (p) => C.vendidoPct(p),
    semanas: (p) => (sem(p) == null ? -1 : Math.min(sem(p), 999)),
    margen: (p) => C.margen(p) ?? -1,
    deuda: (p) => p.deuda + p.vencido * 10,
  };
  function filas() {
    const q = sinTildes(E.q.trim());
    let xs = window.PROVEEDORES.filter((p) => (!E.filtro ? true : E.filtro === "vencido" ? p.vencido > 0 : claseDe(p) === E.filtro));
    if (q) xs = xs.filter((p) => sinTildes(`${p.nombre} ${p.marcas.join(" ")} ${p.rubro}`).includes(q));
    const f = CLAVES[E.orden];
    xs.sort((a, b) => (E.asc ? f(a) - f(b) : f(b) - f(a)) || val(b) - val(a));
    return xs;
  }
  // El puesto en el ranking es siempre por cuánto le compras (prendas o dinero), aunque se ordene por otra columna.
  const puestos = () => new Map([...window.PROVEEDORES].sort((a, b) => val(b) - val(a)).map((p, i) => [p.id, i + 1]));

  // ---------- La barra de control: ordenar, filtrar, buscar ----------
  function controles() {
    const ps = window.PROVEEDORES, n = (k) => ps.filter((p) => claseDe(p) === k).length, venc = ps.filter((p) => p.vencido > 0).length;
    const chip = (k, txt, cuenta, forma = "") => `<button class="w-chip ${E.filtro === k ? "on" : ""}" data-filtro="${k ?? ""}" aria-pressed="${E.filtro === k}">${forma}${txt}<span class="globito">${cuenta}</span></button>`;
    return `<div class="w-controles">
      <div class="w-orden" role="group" aria-label="Ordenar el ranking por">
        <span class="w-orden-et">Ordenar por</span>
        <button data-modo="prendas" aria-pressed="${E.modo === "prendas"}">Prendas compradas</button>
        <button data-modo="soles" aria-pressed="${E.modo === "soles"}">Dinero gastado</button>
      </div>
      <label class="w-buscar"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="search" placeholder="Buscar proveedor o marca" value="${C.esc(E.q)}" data-buscar aria-label="Buscar proveedor o marca"></label>
      <div class="w-chips">
        ${chip(null, "Todos", ps.length)}
        ${chip("rapido", "Repón", n("rapido"), marca("rapido"))}
        ${chip("medio", "A su ritmo", n("medio"), marca("medio"))}
        ${chip("lento", "Frena", n("lento"), marca("lento"))}
        ${chip("nomide", "Poco para medir", n("nomide"), marca("nomide"))}
        ${chip("vencido", "Con deuda vencida", venc, '<i class="w-forma cruz" aria-hidden="true"></i>')}
      </div>
    </div>`;
  }

  const encab = (clave, titulo, clase = "") => {
    const activo = E.orden === clave, flecha = activo ? (E.asc ? "↑" : "↓") : "";
    return `<button class="w-th ${clase} ${activo ? "on" : ""}" data-orden="${clave}" aria-sort="${activo ? (E.asc ? "ascending" : "descending") : "none"}">${titulo}<span class="w-flecha">${flecha}</span></button>`;
  };
  const verMas = (total) => (total > POR_PAGINA ? `<button class="w-vermas" data-vermas>${E.todos ? "Ver menos" : `Ver los ${total - POR_PAGINA} que faltan`}<span aria-hidden="true">${E.todos ? "↑" : "↓"}</span></button>` : "");
  const tallerFila = () => `<p class="w-taller">${C.icon("taller", 16)}<b>Producción propia</b> · ${window.TALLER.nombre}: ${C.N(window.TALLER.prendas)} prendas. No entra al ranking: lo hace el Taller.</p>`;
  const vacio = () => `<p class="w-vacio">Ningún proveedor con ese filtro${E.q ? ` y «${C.esc(E.q)}»` : ""}. <button class="enlace" data-limpiar>Ver todos</button></p>`;

  // La barra de la fila: el largo es cuánto le compras (contra el mayor); lo de tinta es lo vendido. Neutra: el color va en el ritmo.
  const barra = (p, max, i) => `<span class="w-barra" style="--w:${(val(p) / max) * 100}%"><span class="w-barra-llena" data-anim="x" style="--i:${Math.min(i, 20)}"><i style="width:${(vend(p) / val(p)) * 100}%"></i></span><b class="num">${aprox(p) ? "≈ " : ""}${fmt(val(p))}</b></span>`;

  // ---------- A · Tabla ranking con filas que se abren ----------
  function rankingA() {
    const xs = filas(), vis = E.todos ? xs : xs.slice(0, POR_PAGINA), max = Math.max(...window.PROVEEDORES.map(val)), pos = puestos();
    const cols = "2rem minmax(10rem,1.2fr) minmax(9rem,1.5fr) 4.5rem 9rem 6.5rem 6.5rem 1rem";
    return `<div class="tabla w-tabla" style="--cols:${cols}">
      <div class="w-fila w-enc">
        <span class="der">#</span><span>Proveedor</span>${encab("compras", `Le compraste · ${E.modo === "soles" ? "dinero" : "prendas"}`)}
        ${encab("vendido", "Vendido", "der")}${encab("semanas", "Lo que queda se vende en")}${encab("margen", "Margen", "der w-mov")}${encab("deuda", "Le debes", "der w-mov")}<span></span>
      </div>
      ${vis.length ? vis.map((p, i) => filaA(p, i, max, pos)).join("") : vacio()}
    </div>${verMas(xs.length)}${tallerFila()}`;
  }
  function filaA(p, i, max, pos) {
    const m = C.margen(p), abierto = E.abierto === p.id;
    return `<div class="w-grupo ${abierto ? "abierto" : ""}">
      <button class="w-fila" data-abrir="${p.id}" aria-expanded="${abierto}" data-anim style="--i:${Math.min(i, 20)}">
        <span class="der num w-pos">${pos.get(p.id)}</span>
        <span class="w-nom"><b>${p.nombre}</b><span>${p.marcas.join(", ")} · ${p.rubro}</span></span>
        ${barra(p, max, i)}
        <span class="der num">${C.P(C.vendidoPct(p))}</span>
        ${ritmoCelda(p)}
        <span class="der num w-mov">${m == null ? '<span class="tenue w-chico">por confirmar</span>' : C.P(m)}</span>
        <span class="der num w-mov">${deuda(p)}</span>
        <span class="w-chev">${C.icon("chevron", 16)}</span>
      </button>
      ${abierto ? detalleEnFila(p) : ""}
    </div>`;
  }
  function detalleEnFila(p) {
    const r = C.ritmo(p), tallas = C.porTalla(p), sedes = C.porSede(p), tc = C.tallaClave(p), sc = C.sedeClave(p);
    const maxT = Math.max(...tallas.map((x) => x.v + x.q)), maxS = Math.max(...sedes.map((x) => x.llego), 1);
    return `<div class="w-detalle">
      <div class="w-det-bloque"><span class="versalita">Qué hacer</span><p class="w-det-frase"><b>${C.decision(p).corto}.</b> ${C.decision(p).frase}</p>
        <p class="tenue">${C.N(p.vendidas)} vendidas de ${C.N(p.comprado)} en ${Math.round(r.semanas)} semanas · ${C.P(C.costoReal(p))} con costo real</p></div>
      <div class="w-det-bloque">${C.nuevo()}<span class="versalita">Tallas</span>
        ${tallas.map((x) => `<div class="w-mini"><span>${x.t}</span><span class="w-mini-barra"><i style="width:${((x.v + x.q) / maxT) * 100}%"><em style="width:${x.v + x.q ? (x.v / (x.v + x.q)) * 100 : 0}%"></em></i></span><span class="num">${x.v} · ${x.q}</span></div>`).join("")}
        <p class="w-det-nota">${tc.primero && Number.isFinite(tc.primero.sem) ? `La <b>${tc.primero.t}</b> se acaba primero; la <b>${tc.sobra.t}</b> sobra.` : "Ninguna talla se vende todavía."}</p></div>
      <div class="w-det-bloque">${C.nuevo()}<span class="versalita">Sedes</span>
        ${sedes.map((x) => `<div class="w-mini"><span>${x.nombre}</span><span class="w-mini-barra"><i style="width:${(x.llego / maxS) * 100}%"><em style="width:${x.llego ? (x.v / x.llego) * 100 : 0}%"></em></i></span><span class="num">${x.llego ? C.P(x.pct) : "nada"}</span></div>`).join("")}
        <p class="w-det-nota">${sc.unica ? `Todo está en <b>${sc.unica.nombre}</b>.` : `Rinde en <b>${sc.mejor.nombre}</b> (${C.P(sc.mejor.pct)} vendido).`}</p></div>
      <div class="w-det-bloque"><span class="versalita">Plata</span>
        <p class="w-det-dato"><span>Le debes</span><b class="num">${C.S(p.deuda)}</b></p>
        ${p.vencido ? `<p class="w-det-dato w-rojo"><span>Ya venció</span><b class="num">${C.S(p.vencido)}</b></p>` : ""}
        <p class="w-det-dato"><span>Entregas atrasadas</span><b class="num">${p.atrasadas}</b></p>
        <button class="btn btn-secundario w-ficha" title="La ficha se rediseña cuando elijas la lista">Abrir su ficha ${C.icon("arrow-right", 16)}</button></div>
    </div>`;
  }

  // ---------- B · Ranking compacto + concentración + panel de detalle ----------
  function pareto() {
    const ps = [...window.PROVEEDORES].sort((a, b) => val(b) - val(a)), tot = ps.reduce((a, p) => a + val(p), 0), max = val(ps[0]);
    let acc = 0; const acum = ps.map((p) => (acc += val(p)) / tot);
    const n80 = acum.findIndex((x) => x >= 0.8) + 1, top10 = acum[9];
    const W = 1000, H = 120, bw = W / ps.length;
    const linea = acum.map((a, i) => `${(i + 0.5) * bw},${H - a * (H - 8)}`).join(" ");
    return `<div class="w-pareto" data-anim>
      <div class="w-pareto-txt"><b class="serif">${C.P(top10 * 100)}</b><span>de lo que compras es de tus <b>10</b> primeros proveedores. Con <b>${n80}</b> llegas al 80 %.</span></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="w-pareto-svg" role="img" aria-label="Lo que le compras a cada proveedor, de mayor a menor, y la suma acumulada">
        ${ps.map((p, i) => `<rect x="${i * bw + 1}" y="${H - (val(p) / max) * (H - 8)}" width="${bw - 2}" height="${(val(p) / max) * (H - 8)}" class="${i < 10 ? "top" : ""} ${E.elegido === p.id ? "elegido" : ""}" data-anim="y" style="--i:${Math.min(i, 30)}"><title>${C.esc(p.nombre)}: ${fmt(val(p))}</title></rect>`).join("")}
        ${E.elegido ? (() => { const i = ps.findIndex((p) => p.id === E.elegido); return i < 0 ? "" : `<line x1="${(i + 0.5) * bw}" x2="${(i + 0.5) * bw}" y1="0" y2="${H}" class="w-pareto-sel"/>`; })() : ""}
        <line x1="0" x2="${W}" y1="${H - 0.8 * (H - 8)}" y2="${H - 0.8 * (H - 8)}" class="w-pareto-80"/>
        <polyline points="${linea}" class="w-pareto-linea" data-anim="dibuja" data-largo-auto/>
      </svg>
    </div>`;
  }
  function rankingB() {
    const xs = filas(), vis = E.todos ? xs : xs.slice(0, POR_PAGINA), max = Math.max(...window.PROVEEDORES.map(val)), pos = puestos();
    const cols = "2.25rem minmax(11rem,1fr) minmax(10rem,1.5fr) 9.5rem 7rem";
    return `${pareto()}
      <div class="tabla w-tabla w-tabla-b" style="--cols:${cols}">
        <div class="w-fila w-enc"><span class="der">#</span><span>Proveedor</span>${encab("compras", `Le compraste · ${E.modo === "soles" ? "dinero" : "prendas"}`)}${encab("semanas", "Se vende en")}${encab("deuda", "Le debes", "der w-mov")}</div>
        ${vis.length ? vis.map((p, i) => `<button class="w-fila ${E.elegido === p.id ? "elegida" : ""}" data-elegir="${p.id}" aria-pressed="${E.elegido === p.id}" data-anim style="--i:${Math.min(i, 20)}">
          <span class="der num w-pos">${pos.get(p.id)}</span>
          <span class="w-nom"><b>${p.nombre}</b><span>${C.P(C.vendidoPct(p))} vendido</span></span>
          ${barra(p, max, i)}
          ${ritmoCelda(p)}
          <span class="der num w-mov">${deuda(p)}</span>
        </button>`).join("") : vacio()}
      </div>${verMas(xs.length)}${tallerFila()}`;
  }
  function panelProveedor(p) {
    const r = C.ritmo(p), k = claseDe(p), m = C.margen(p), tallas = C.porTalla(p), sedes = C.porSede(p), tc = C.tallaClave(p), sc = C.sedeClave(p);
    const maxT = Math.max(...tallas.map((x) => x.v + x.q)), maxS = Math.max(...sedes.map((x) => x.llego), 1);
    return `<div class="w-panel" data-anim>
      <button class="w-panel-volver" data-elegir="">${C.icon("arrow-left", 16)} Lo que no se ve a simple vista</button>
      <h2>${p.nombre}</h2>
      <p class="w-panel-dec ${k}">${marca(k)}<b>${C.decision(p).corto}.</b> ${C.decision(p).frase}</p>
      <div class="w-panel-nums">
        <div><span>Le compraste</span><b class="num">${C.N(p.comprado)}</b><em>${C.S(C.gasto(p))}${C.costoReal(p) < 50 ? " aprox." : ""}</em></div>
        <div><span>Vendiste</span><b class="num">${C.N(p.vendidas)}</b><em>${C.P(C.vendidoPct(p))}</em></div>
        <div><span>Se vende en</span><b class="num">${semTxt(p)}</b><em>${RITMO[k].palabra}</em></div>
        <div><span>Margen</span><b class="num">${m == null ? "¿?" : C.P(m)}</b><em>${m == null ? "por confirmar" : ""}</em></div>
      </div>
      <div class="w-panel-bloque">${C.nuevo()}<span class="versalita">Tallas</span>
        ${tallas.map((x) => `<div class="w-mini"><span>${x.t}</span><span class="w-mini-barra"><i style="width:${((x.v + x.q) / maxT) * 100}%"><em style="width:${x.v + x.q ? (x.v / (x.v + x.q)) * 100 : 0}%"></em></i></span><span class="num">${x.v} · ${x.q}</span></div>`).join("")}
        <p class="w-det-nota">${tc.primero && Number.isFinite(tc.primero.sem) ? `La <b>${tc.primero.t}</b> se acaba primero; la <b>${tc.sobra.t}</b> sobra.` : "Ninguna talla se vende todavía."}</p></div>
      <div class="w-panel-bloque">${C.nuevo()}<span class="versalita">Sedes</span>
        ${sedes.map((x) => `<div class="w-mini"><span>${x.nombre}</span><span class="w-mini-barra"><i style="width:${(x.llego / maxS) * 100}%"><em style="width:${x.llego ? (x.v / x.llego) * 100 : 0}%"></em></i></span><span class="num">${x.llego ? C.P(x.pct) : "nada"}</span></div>`).join("")}
        <p class="w-det-nota">${sc.unica ? `Todo está en <b>${sc.unica.nombre}</b>.` : `Rinde en <b>${sc.mejor.nombre}</b>.`}</p></div>
      <div class="w-panel-bloque"><span class="versalita">Plata</span>
        <p class="w-det-dato"><span>Le debes</span><b class="num">${C.S(p.deuda)}</b></p>
        ${p.vencido ? `<p class="w-det-dato w-rojo"><span>Ya venció</span><b class="num">${C.S(p.vencido)}</b></p>` : ""}
        <p class="w-det-dato"><span>Entregas atrasadas</span><b class="num">${p.atrasadas}</b></p></div>
      <button class="btn btn-primario w-ficha" title="La ficha se rediseña cuando elijas la lista">Abrir su ficha ${C.icon("arrow-right", 16)}</button>
    </div>`;
  }

  // ---------- C · Compraste contra vendiste (dos puntos y el tramo que queda) ----------
  function rankingC() {
    const xs = filas(), vis = E.todos ? xs : xs.slice(0, POR_PAGINA), max = Math.max(...window.PROVEEDORES.map(val)), pos = puestos();
    const cols = "2.25rem minmax(11rem,1fr) minmax(14rem,2fr) 9.5rem 7rem";
    const marcas = [0.25, 0.5, 0.75, 1].map((f) => `<span style="left:${f * 90}%">${fmt(max * f)}</span>`).join("");
    return `<div class="tabla w-tabla w-tabla-c" style="--cols:${cols}">
      <div class="w-fila w-enc"><span class="der">#</span><span>Proveedor</span><span class="w-escala-cab">${encab("compras", `Vendiste <i class="w-punto lleno"></i> · le compraste <i class="w-punto"></i> · ${E.modo === "soles" ? "dinero" : "prendas"}`)}<span class="w-escala">${marcas}</span></span>${encab("semanas", "Lo que queda se vende en")}${encab("deuda", "Le debes", "der w-mov")}</div>
      ${vis.length ? vis.map((p, i) => {
        const a = (vend(p) / max) * 90, b = (val(p) / max) * 90;
        const abierto = E.abierto === p.id;
        return `<div class="w-grupo ${abierto ? "abierto" : ""}"><button class="w-fila" data-abrir="${p.id}" aria-expanded="${abierto}" data-anim style="--i:${Math.min(i, 20)}">
          <span class="der num w-pos">${pos.get(p.id)}</span>
          <span class="w-nom"><b>${p.nombre}</b><span>${p.marcas.join(", ")} · ${p.rubro}</span></span>
          <span class="w-pesas"><span class="w-guias"></span>
            <span class="w-tramo" data-anim="x" style="--i:${Math.min(i, 20)};left:${a}%;width:${b - a}%"></span>
            <i class="w-punto lleno" data-anim="asoma" style="--i:${Math.min(i, 20)};left:${a}%"></i>
            <i class="w-punto" data-anim="asoma" style="--i:${Math.min(i, 20) + 4};left:${b}%"></i>
            ${b - a > 8 ? `<span class="w-pesas-n num" style="left:${b}%">${aprox(p) ? "≈ " : ""}${fmt(val(p))}</span><span class="w-pesas-v num" style="left:${a}%">${fmt(vend(p))}</span>`
              : `<span class="w-pesas-n num" style="left:${b}%">${fmt(vend(p))} de ${aprox(p) ? "≈ " : ""}${fmt(val(p))}</span>`}
          </span>
          ${ritmoCelda(p)}
          <span class="der num w-mov">${deuda(p)}</span>
        </button>${abierto ? detalleEnFila(p) : ""}</div>`;
      }).join("") : vacio()}
    </div>${verMas(xs.length)}${tallerFila()}`;
  }

  // ---------- La columna derecha: lo que no se ve a simple vista, por urgencia ----------
  function excepciones() {
    const ps = window.PROVEEDORES;
    const venc = ps.filter((p) => p.vencido > 0).sort((a, b) => b.vencido - a.vencido), atr = ps.filter((p) => p.atrasadas > 0);
    const lentos = ps.filter((p) => claseDe(p) === "lento").sort((a, b) => (sem(b) ?? 0) - (sem(a) ?? 0));
    const rapidos = ps.filter((p) => claseDe(p) === "rapido").sort((a, b) => val(b) - val(a));
    const parada = ps.filter((p) => p.plataParada >= C.PLATA_PARADA_MIN), bajo = ps.filter((p) => C.margen(p) != null && C.margen(p) < C.MARGEN_BAJO_PCT);
    const gasto = ps.reduce((a, p) => a + C.gasto(p), 0), real = ps.reduce((a, p) => a + p.compras * p.costo, 0);
    const deyner = ps.find((p) => p.id === "deyner"), lasak = ps.find((p) => p.id === "lasak");
    const nombres = (xs, dato, n = 3) => `<ul class="w-exc-lista">${xs.slice(0, n).map((p) => `<li><button class="enlace" data-ver="${p.id}">${p.nombre}</button><span class="num">${dato(p)}</span></li>`).join("")}${xs.length > n ? `<li class="tenue">y ${xs.length - n} más</li>` : ""}</ul>`;
    const item = ({ tono, forma, cifra, titulo, cuerpo = "", filtro, nuevo }) => `<article class="w-exc ${tono}" data-anim>
      <div class="w-exc-cab">${forma}<b class="w-exc-cifra num">${cifra}</b><span class="w-exc-tit">${titulo}</span></div>${cuerpo}
      ${nuevo ? C.nuevo() : ""}${filtro ? `<button class="w-exc-ver" data-filtro="${filtro}">Ver en el ranking ${C.icon("arrow-right", 14)}</button>` : ""}</article>`;
    const grupos = [
      { titulo: "Para hoy", items: [
        venc.length && item({ tono: "rojo", forma: '<i class="w-forma cruz"></i>', cifra: C.S(venc.reduce((a, p) => a + p.vencido, 0)), titulo: `ya vencieron con ${C.pl(venc.length, "proveedor", "proveedores")}. Págalo antes de pedirles más.`, cuerpo: nombres(venc, (p) => C.S(p.vencido)), filtro: "vencido" }),
        atr.length && item({ tono: "ambar", forma: marca("lento"), cifra: C.N(atr.reduce((a, p) => a + p.atrasadas, 0)), titulo: "entregas atrasadas. Reclámalas antes de que se acumulen.", cuerpo: nombres(atr, (p) => C.pl(p.atrasadas, "entrega", "entregas")) }),
      ] },
      { titulo: "Antes de volver a comprar", items: [
        lentos.length && item({ tono: "ambar", forma: marca("lento"), cifra: C.N(lentos.reduce((a, p) => a + p.estantes, 0)), titulo: `prendas de ${lentos.length} proveedores tardarían más de 16 semanas en venderse. Frena con ellos.`, cuerpo: nombres(lentos, semTxt), filtro: "lento" }),
        parada.length && item({ tono: "ambar", forma: marca("lento"), cifra: C.S(parada.reduce((a, p) => a + p.plataParada, 0)), titulo: "parados en prendas que no se venden hace más de 3 semanas.", cuerpo: nombres(parada, (p) => `${p.prendasParadas} prendas`) }),
        bajo.length && item({ tono: "ambar", forma: marca("lento"), cifra: C.P(C.margen(bajo[0])), titulo: `de margen con ${bajo[0].nombre}: menos de 35 %. Renegocia el precio.`, cuerpo: "" }),
        item({ tono: "pizarra", forma: marca("medio"), cifra: C.P(100 - (real / gasto) * 100), titulo: "de lo que compraste vino por la carga inicial: su costo está por confirmar, así que el margen no se sabe todavía.", cuerpo: "" }),
      ] },
      { titulo: "Oportunidades", items: [
        rapidos.length && item({ tono: "verde", forma: marca("rapido"), cifra: C.N(rapidos.length), titulo: "proveedores se agotan en 6 semanas o menos. Repón; si el margen está por confirmar, míralo antes.", cuerpo: nombres(rapidos, semTxt), filtro: "rapido" }),
        item({ tono: "pizarra", forma: '<i class="w-forma rombo"></i>', cifra: C.tallaClave(deyner).primero.t, titulo: `es la talla que se acaba primero en ${deyner.nombre}; la ${C.tallaClave(deyner).sobra.t} sobra. Pide la curva al revés.`, nuevo: true }),
        item({ tono: "pizarra", forma: '<i class="w-forma rombo"></i>', cifra: "Lima", titulo: `tiene todo lo de ${lasak.nombre}. Prueba trasladar a Trujillo antes de rebajar.`, nuevo: true }),
      ] },
    ];
    const total = ps.reduce((a, p) => a + p.comprado, 0), vendidas = ps.reduce((a, p) => a + p.vendidas, 0);
    return `<div class="w-aside-cab"><h2>Lo que no se ve a simple vista</h2>
        <div class="w-resumen"><div><b class="num">${C.N(total)}</b><span>prendas compradas</span></div><div><b class="num">${C.P((vendidas / total) * 100)}</b><span>ya vendido</span></div><div><b class="num">${C.S(window.PROVEEDORES.reduce((a, p) => a + p.deuda, 0))}</b><span>les debes</span></div></div></div>
      ${grupos.map((g) => { const its = g.items.filter(Boolean); return its.length ? `<section class="w-grupo-exc"><h3>${g.titulo}</h3>${its.join("")}</section>` : ""; }).join("")}`;
  }

  // ---------- La página ----------
  const RANKING = { a: rankingA, b: rankingB, c: rankingC };
  function lista(dir) {
    return `
      ${C.encabezado({ titulo: "Proveedores", frase: "A quién le compras más y cómo se vende lo que le compraste.", der: `<button class="btn btn-secundario versal">Mercadería · Servicios</button><button class="btn btn-primario versal">${C.icon("plus", 16)} Nuevo proveedor</button>` })}
      <div class="w-cuerpo dir-${dir}">
        <main class="w-principal">${controles()}<div data-ranking>${RANKING[dir]()}</div></main>
        <aside class="w-aside" data-aside>${dir === "b" && E.elegido ? panelProveedor(window.PROVEEDORES.find((p) => p.id === E.elegido)) : excepciones()}</aside>
      </div>`;
  }

  function despues(raiz, e) {
    const dir = e.dir;
    const pintar = (todo) => {
      raiz.querySelector("[data-ranking]").innerHTML = RANKING[dir]();
      if (todo) {
        raiz.querySelector(".w-controles").outerHTML = controles();
        const aside = raiz.querySelector("[data-aside]");
        aside.innerHTML = dir === "b" && E.elegido ? panelProveedor(window.PROVEEDORES.find((p) => p.id === E.elegido)) : excepciones();
        C.animar(aside);
      }
      C.animar(raiz.querySelector("[data-ranking]"));
    };
    raiz.onclick = (ev) => {
      const t = ev.target.closest("[data-modo],[data-filtro],[data-orden],[data-vermas],[data-abrir],[data-elegir],[data-ver],[data-limpiar]");
      if (!t) return;
      if (t.dataset.modo) { E.modo = t.dataset.modo; E.orden = "compras"; E.asc = false; pintar(true); }
      else if (t.hasAttribute("data-filtro")) { const f = t.dataset.filtro || null; E.filtro = E.filtro === f ? null : f; E.todos = false; pintar(true); if (t.closest(".w-aside")) raiz.querySelector(".w-principal").scrollIntoView({ behavior: "smooth", block: "start" }); }
      else if (t.dataset.orden) { E.asc = E.orden === t.dataset.orden ? !E.asc : false; E.orden = t.dataset.orden; pintar(false); }
      else if (t.hasAttribute("data-vermas")) { E.todos = !E.todos; pintar(false); }
      else if (t.hasAttribute("data-limpiar")) { E.filtro = null; E.q = ""; pintar(true); }
      else if (t.dataset.abrir) { E.abierto = E.abierto === t.dataset.abrir ? null : t.dataset.abrir; pintar(false); }
      else if (t.hasAttribute("data-elegir")) { E.elegido = t.dataset.elegir || null; pintar(true); if (E.elegido && matchMedia("(max-width:1100px)").matches) raiz.querySelector("[data-aside]").scrollIntoView({ behavior: "smooth" }); }
      else if (t.dataset.ver) {
        if (dir === "b") { E.elegido = t.dataset.ver; pintar(true); }
        else { E.filtro = null; E.q = window.PROVEEDORES.find((p) => p.id === t.dataset.ver).nombre; E.abierto = t.dataset.ver; pintar(true); raiz.querySelector(".w-principal").scrollIntoView({ behavior: "smooth", block: "start" }); }
      }
    };
    raiz.oninput = (ev) => { if (ev.target.matches("[data-buscar]")) { E.q = ev.target.value; E.todos = false; pintar(false); } };
  }

  window.DIRS = {
    a: { lema: "Ranking en tabla: cada fila se abre con sus tallas, sedes y plata.", lista: () => lista("a"), despues },
    b: { lema: "Ranking con la concentración arriba; al tocar un proveedor, su detalle va a la derecha.", lista: () => lista("b"), despues },
    c: { lema: "Ranking de lo que compraste contra lo que vendiste: el tramo es lo que queda.", lista: () => lista("c"), despues },
  };
})();
