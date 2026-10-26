// Proveedores v5 (2026-10-26, quinta ronda): «que sea un ranking más visual e interactivo pero sin ser demasiado extravagante».
// Vuelve a ser una LISTA ORDENADA (como pidió en la tercera ronda) pero cada fila se ve y se toca: barras grandes, la línea de ventas,
// el orden que se reacomoda deslizándose y lo que sube o baja al cambiar entre prendas y dinero. Se mantiene: el color solo con su
// significado (● verde repón · ■ pizarra a su ritmo · ▲ ámbar frena · ✕ rojo vencido), nada de espacio muerto y, a la derecha, lo que no
// se ve a simple vista. Las tres cambian cómo se presenta el ranking:
//   A · Podio y lista       — los 3 primeros en tarjetas grandes y el resto en filas con su barra.
//   B · Carriles            — cada proveedor es un carril con su barra grande; al tocarlo se abre ahí mismo con tallas, sedes y plata.
//   C · Filas con su venta  — cada fila con la línea de ventas por día y su anillo; se marcan hasta 3 para compararlos a la derecha.
(function () {
  const C = window.C;
  const E = { modo: "prendas", filtro: null, elegido: null, q: "", todos: false, abierto: null, comparar: [], antes: null };

  // ---------- Ritmo: forma + color + palabra ----------
  const RITMO = {
    rapido: { palabra: "Repón", forma: "circulo" },
    medio: { palabra: "A su ritmo", forma: "cuadrado" },
    lento: { palabra: "Frena", forma: "triangulo" },
    nomide: { palabra: "Poco para medir", forma: "anillo" },
  };
  const claseDe = (p) => { const r = C.ritmo(p); return !r.juzgable ? "nomide" : r.lento ? "lento" : r.agota ? "rapido" : "medio"; };
  const semDe = (p) => { const r = C.ritmo(p); return !Number.isFinite(r.agotar) ? Infinity : r.agotar; };
  const semTxt = (s) => (s == null ? "—" : !Number.isFinite(s) ? "∞" : s >= 100 ? "100+" : String(Math.max(1, Math.round(s))));
  const marca = (k) => `<i class="x-forma ${RITMO[k].forma} ${k}" aria-hidden="true"></i>`;
  // La escala de calor (C y el detalle): cinco pasos del verde al ámbar, por semanas para vender lo que queda.
  const paso = (s, hay = true) => (!hay ? "s0" : !Number.isFinite(s) ? "s5" : s <= 3 ? "s1" : s <= 6 ? "s2" : s < 16 ? "s3" : s < 30 ? "s4" : "s5");
  const semSub = (v, q, semanas) => (q === 0 ? 0 : v === 0 ? Infinity : q / (v / semanas));

  // ---------- Cuánto le compras ----------
  const val = (p) => (E.modo === "soles" ? C.gasto(p) : p.comprado);
  const vend = (p) => (E.modo === "soles" ? p.vendidas * p.costo : p.vendidas);
  const fmt = (n) => (E.modo === "soles" ? C.S(n) : C.N(n));
  const ranking = () => [...window.PROVEEDORES].sort((a, b) => val(b) - val(a));
  const sinTildes = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const pasa = (p) => (!E.filtro || (E.filtro === "vencido" ? p.vencido > 0 : claseDe(p) === E.filtro)) && (!E.q || sinTildes(`${p.nombre} ${p.marcas.join(" ")}`).includes(sinTildes(E.q)));
  const P = (id) => window.PROVEEDORES.find((p) => p.id === id);

  // ---------- Controles ----------
  function controles() {
    const ps = window.PROVEEDORES, n = (k) => ps.filter((p) => claseDe(p) === k).length;
    const chip = (k, txt, cuenta, forma = "") => `<button class="x-chip ${E.filtro === k ? "on" : ""}" data-filtro="${k ?? ""}" aria-pressed="${E.filtro === k}">${forma}${txt}<span class="globito">${cuenta}</span></button>`;
    return `<div class="x-controles">
      <div class="x-orden" role="group" aria-label="Medir cuánto le compras en">
        <button data-modo="prendas" aria-pressed="${E.modo === "prendas"}">Prendas compradas</button><button data-modo="soles" aria-pressed="${E.modo === "soles"}">Dinero gastado</button>
      </div>
      <div class="x-chips">${chip(null, "Todos", ps.length)}${chip("rapido", "Repón", n("rapido"), marca("rapido"))}${chip("medio", "A su ritmo", n("medio"), marca("medio"))}${chip("lento", "Frena", n("lento"), marca("lento"))}${chip("nomide", "Poco para medir", n("nomide"), marca("nomide"))}${chip("vencido", "Deuda vencida", ps.filter((p) => p.vencido).length, '<i class="x-forma cruz" aria-hidden="true"></i>')}</div>
      <label class="x-buscar"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="search" data-buscar placeholder="Encontrar un proveedor" value="${C.esc(E.q)}" aria-label="Encontrar un proveedor"></label>
    </div>`;
  }

  // ---------- Anillo (pieza del sistema) ----------
  const anillo = (pct, tono = "var(--tinta)", t = 54) => {
    const r = t / 2 - 5, L = 2 * Math.PI * r;
    return `<svg class="x-anillo" width="${t}" height="${t}" viewBox="0 0 ${t} ${t}" aria-hidden="true"><circle cx="${t / 2}" cy="${t / 2}" r="${r}" class="pista"/><circle cx="${t / 2}" cy="${t / 2}" r="${r}" class="arco" style="stroke:${tono};--largo:${L};stroke-dasharray:${(pct / 100) * L} ${L}" transform="rotate(-90 ${t / 2} ${t / 2})"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle">${Math.round(pct)}%</text></svg>`;
  };

  // ---------- La columna derecha: lo que no se ve a simple vista ----------
  function insights() {
    const ps = window.PROVEEDORES, total = ps.reduce((a, p) => a + p.comprado, 0), vendidas = ps.reduce((a, p) => a + p.vendidas, 0);
    const venc = ps.filter((p) => p.vencido).sort((a, b) => b.vencido - a.vencido), atr = ps.filter((p) => p.atrasadas);
    const lentos = ps.filter((p) => claseDe(p) === "lento").sort((a, b) => b.estantes - a.estantes), rapidos = ps.filter((p) => claseDe(p) === "rapido").sort((a, b) => b.comprado - a.comprado);
    const rk = ranking(), suma = rk.reduce((a, p) => a + val(p), 0), top10 = (rk.slice(0, 10).reduce((a, p) => a + val(p), 0) / suma) * 100;
    const gasto = ps.reduce((a, p) => a + C.gasto(p), 0), real = ps.reduce((a, p) => a + p.compras * p.costo, 0);
    const parados = lentos.reduce((a, p) => a + p.estantes, 0), maxL = lentos[0]?.estantes || 1;
    // Las tallas de TODA la tienda: cuál se acaba primero sumando a todos los proveedores (dato nuevo).
    const tallas = ["S", "M", "L", "XL"].map((t) => { const v = ps.reduce((a, p) => a + p.tallas[t][0], 0), q = ps.reduce((a, p) => a + p.tallas[t][1], 0); return { t, v, q, s: q / (v / 3.6) }; });
    const lista = (xs, dato, n = 3) => `<ul class="x-lista">${xs.slice(0, n).map((p) => `<li><button data-elegir="${p.id}">${p.nombre}</button><span class="num">${dato(p)}</span></li>`).join("")}${xs.length > n ? `<li class="tenue">y ${xs.length - n} más</li>` : ""}</ul>`;
    return `<div class="x-lado-cab"><h2>Lo que no se ve a simple vista</h2>
        <div class="x-resumen">${anillo((vendidas / total) * 100)}<div><b class="num">${C.N(total)}</b> prendas compradas a ${ps.length} proveedores; <b class="num">${C.N(vendidas)}</b> ya se vendieron.</div></div></div>
      <section class="x-grupo"><h3>Para hoy</h3>
        <article class="x-card rojo"><div class="x-card-cab"><i class="x-forma cruz"></i><b class="num">${C.S(venc.reduce((a, p) => a + p.vencido, 0))}</b><span>ya vencieron. Págalo antes de pedirles más.</span></div>${lista(venc, (p) => C.S(p.vencido))}</article>
        <article class="x-card ambar"><div class="x-card-cab">${marca("lento")}<b class="num">${atr.reduce((a, p) => a + p.atrasadas, 0)}</b><span>entregas atrasadas. Reclámalas.</span></div>${lista(atr, (p) => C.pl(p.atrasadas, "entrega", "entregas"))}</article>
      </section>
      <section class="x-grupo"><h3>Antes de volver a comprar</h3>
        <article class="x-card ambar"><div class="x-card-cab">${marca("lento")}<b class="num">${C.N(parados)}</b><span>prendas de ${lentos.length} proveedores tardarían más de 16 semanas en venderse.</span></div>
          <div class="x-barritas">${lentos.slice(0, 5).map((p) => `<button data-elegir="${p.id}"><span>${p.nombre}</span><i style="width:${(p.estantes / maxL) * 100}%"></i><b class="num">${p.estantes}</b></button>`).join("")}</div></article>
        <article class="x-card"><div class="x-card-cab x-con-anillo">${anillo(top10, "var(--tinta)")}<span>de lo que compras ${E.modo === "soles" ? "(en dinero)" : "(en prendas)"} es de tus <b>10</b> primeros proveedores.</span></div></article>
        <article class="x-card pizarra"><div class="x-card-cab x-con-anillo">${anillo(100 - (real / gasto) * 100, "var(--pizarra)")}<span>de lo comprado vino por la carga inicial: su costo y su margen están <b>por confirmar</b>.</span></div></article>
      </section>
      <section class="x-grupo"><h3>Oportunidades</h3>
        <article class="x-card verde"><div class="x-card-cab">${marca("rapido")}<b class="num">${rapidos.length}</b><span>proveedores se agotan en 6 semanas o menos. Repón; si su margen está por confirmar, míralo antes.</span></div>${lista(rapidos, (p) => `${semTxt(semDe(p))} sem`)}</article>
        <article class="x-card pizarra">${C.nuevo()}<div class="x-card-cab"><i class="x-forma rombo"></i><span>En toda la tienda, la talla que se acaba primero:</span></div>
          <div class="x-celdas">${tallas.map((x) => `<span class="x-celda ${paso(x.s)}"><b>${x.t}</b><em>${semTxt(x.s)} sem</em></span>`).join("")}</div></article>
        <article class="x-card pizarra">${C.nuevo()}<div class="x-card-cab"><i class="x-forma rombo"></i><span><button data-elegir="lasak" class="x-enl">Lasak Store</button> tiene todo en Lima: prueba trasladar a Trujillo antes de rebajar.</span></div></article>
      </section>`;
  }

  // El detalle de un proveedor en la columna derecha (al tocarlo en cualquiera de las tres).
  function detalle(p) {
    const r = C.ritmo(p), k = claseDe(p), m = C.margen(p), pos = ranking().findIndex((x) => x.id === p.id) + 1;
    const tallas = C.porTalla(p), sedes = C.porSede(p);
    return `<div class="x-det">
      <button class="x-volver" data-elegir="">${C.icon("arrow-left", 16)} Lo que no se ve a simple vista</button>
      <span class="versalita">Puesto ${pos} de ${window.PROVEEDORES.length} · ${E.modo === "soles" ? "por dinero" : "por prendas"}</span>
      <h2>${p.nombre}</h2>
      <p class="x-det-dec ${k}">${marca(k)}<b>${RITMO[k].palabra}.</b> ${C.decision(p).frase}</p>
      <div class="x-det-nums">
        <div><span>Le compraste</span><b class="num">${C.N(p.comprado)}</b><em>${C.S(C.gasto(p))}${C.costoReal(p) < 50 ? " aprox." : ""}</em></div>
        <div><span>Vendiste</span><b class="num">${C.N(p.vendidas)}</b><em>${C.P(C.vendidoPct(p))}</em></div>
        <div class="${k}"><span>Se vende en</span><b class="num">${semTxt(semDe(p))} sem</b><em>lo que queda</em></div>
        <div><span>Margen</span><b class="num">${m == null ? "¿?" : C.P(m)}</b><em>${m == null ? "por confirmar" : ""}</em></div>
      </div>
      <div class="x-det-bloque">${C.nuevo()}<span class="versalita">Tallas · semanas para vender lo que queda</span>
        <div class="x-celdas">${tallas.map((x) => `<span class="x-celda ${paso(x.sem)}" title="${x.v} vendidas, ${x.q} quedan"><b>${x.t}</b><em>${semTxt(x.sem)} sem</em></span>`).join("")}</div></div>
      <div class="x-det-bloque">${C.nuevo()}<span class="versalita">Sedes · semanas para vender lo que queda</span>
        <div class="x-celdas">${sedes.map((x) => `<span class="x-celda ${paso(semSub(x.v, x.q, r.semanas), x.llego > 0)}" title="${x.v} vendidas, ${x.q} quedan"><b>${x.nombre}</b><em>${x.llego ? `${semTxt(semSub(x.v, x.q, r.semanas))} sem` : "no llegó"}</em></span>`).join("")}</div></div>
      <div class="x-det-plata">
        <p><span>Le debes</span><b class="num">${C.S(p.deuda)}</b></p>
        ${p.vencido ? `<p class="x-rojo"><span><i class="x-forma cruz"></i> Ya venció</span><b class="num">${C.S(p.vencido)}</b></p>` : ""}
        <p><span>Entregas atrasadas</span><b class="num">${p.atrasadas}</b></p>
      </div>
      <button class="btn btn-primario" title="La ficha se rediseña cuando elijas la lista">Abrir su ficha ${C.icon("arrow-right", 16)}</button>
    </div>`;
  }
  const lado = () => (E.elegido ? detalle(P(E.elegido)) : insights());

  // ---------- Lo que se lista ----------
  const POR_PAGINA = 20;
  const visibles = () => ranking().filter(pasa);
  const puestoDe = () => new Map(ranking().map((p, i) => [p.id, i + 1]));
  const iniciales = (n) => n.split(" ").filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  // El ritmo como una píldora: forma, semanas y palabra (nunca color solo).
  const pildora = (p, chica = false) => {
    const k = claseDe(p), r = C.ritmo(p);
    if (chica) return `<span class="v5-pill ${k} chica">${marca(k)}<b class="num">${r.juzgable ? `${semTxt(semDe(p))} sem` : "—"}</b></span><span class="v5-pill-palabra">${RITMO[k].palabra}</span>`;
    return `<span class="v5-pill ${k}" title="${k === "nomide" ? "Le compraste menos de 20 prendas" : "Semanas para vender lo que le queda"}">${marca(k)}${r.juzgable ? `<b class="num">${semTxt(semDe(p))} sem</b>` : ""}<span>${RITMO[k].palabra}</span></span>`;
  };
  // Cuánto subió o bajó en el ranking al cambiar entre prendas y dinero.
  const cambio = (p, pos) => {
    if (!E.antes) return "";
    const d = E.antes.get(p.id) - pos;
    return d ? `<span class="v5-cambio ${d > 0 ? "sube" : "baja"}" title="${d > 0 ? "Subió" : "Bajó"} ${Math.abs(d)} puestos al cambiar a ${E.modo === "soles" ? "dinero" : "prendas"}">${d > 0 ? "↑" : "↓"}${Math.abs(d)}</span>` : "";
  };
  const deudaTxt = (p) => (p.vencido ? `<span class="x-rojo v5-deuda"><i class="x-forma cruz"></i>${C.S(p.vencido)} vencido</span>` : p.deuda ? `<span class="v5-deuda">Le debes ${C.S(p.deuda)}</span>` : "");
  const unidad = () => (E.modo === "soles" ? "" : " prendas");
  const aprox = (p) => (E.modo === "soles" && C.costoReal(p) < C.COSTO_REAL_MIN_PCT ? "≈ " : "");
  const verMas = (n) => (n > POR_PAGINA ? `<button class="v5-vermas" data-vermas>${E.todos ? "Ver solo los primeros 20 ↑" : `Ver los ${n - POR_PAGINA} que faltan ↓`}</button>` : "");
  const vacio = () => `<p class="v5-vacio">Ningún proveedor con ese filtro. <button class="x-enl" data-filtro="">Ver todos</button></p>`;
  const taller = () => `<p class="v5-taller">${C.icon("taller", 16)} El Taller (CAYLA SAC, ${C.N(window.TALLER.prendas)} prendas) va aparte: no es un proveedor.</p>`;
  const cuenta = (n) => `<p class="v5-cuenta">${n === window.PROVEEDORES.length ? `${n} proveedores` : `${n} de ${window.PROVEEDORES.length} proveedores`}, del que más le compras al que menos · ${E.modo === "soles" ? "en dinero" : "en prendas"}</p>`;

  // =====================================================================================================
  // A · PODIO Y LISTA
  // =====================================================================================================
  function rankingA() {
    const xs = visibles(), pos = puestoDe(), max = Math.max(...window.PROVEEDORES.map(val)), total = window.PROVEEDORES.reduce((a, p) => a + val(p), 0);
    if (!xs.length) return vacio();
    const podio = xs.slice(0, 3), resto = xs.slice(3, E.todos ? undefined : POR_PAGINA);
    return `${cuenta(xs.length)}
      <div class="v5-podio">${podio.map((p, i) => `<button class="v5-carta" data-k="${p.id}" data-elegir="${p.id}" style="--i:${i}">
        <span class="v5-carta-cab"><b class="v5-puesto">${pos.get(p.id)}</b>${cambio(p, pos.get(p.id))}<span class="v5-avatar">${iniciales(p.nombre)}</span></span>
        <span class="v5-carta-nom">${p.nombre}</span>
        <span class="v5-carta-valor"><b class="num">${aprox(p)}${fmt(val(p))}</b>${unidad()}</span>
        <span class="v5-carta-peso">${C.P((val(p) / total) * 100)} de todo lo que compras</span>
        <span class="v5-barra grande"><i style="width:100%"><em style="width:${(vend(p) / val(p)) * 100}%"></em></i></span>
        <span class="v5-carta-pie">${pildora(p)}<span class="tenue">${C.P(C.vendidoPct(p))} vendido</span></span>
        ${deudaTxt(p)}
      </button>`).join("")}</div>
      <div class="v5-filas">${resto.map((p) => `<button class="v5-fila" data-k="${p.id}" data-elegir="${p.id}">
        <span class="v5-puesto-chico num">${pos.get(p.id)}</span>
        <span class="v5-avatar chico">${iniciales(p.nombre)}</span>
        <span class="v5-nom"><b>${p.nombre}</b><span>${p.marcas.join(", ")} · ${p.rubro}</span></span>
        <span class="v5-barra"><i style="width:${(val(p) / max) * 100}%"><em style="width:${(vend(p) / val(p)) * 100}%"></em></i><b class="num">${aprox(p)}${fmt(val(p))}</b></span>
        <span class="v5-vend num">${C.P(C.vendidoPct(p))}<small>vendido</small></span>
        ${pildora(p)}
        <span class="v5-fin">${cambio(p, pos.get(p.id))}${deudaTxt(p)}</span>
      </button>`).join("")}</div>
      ${verMas(xs.length)}${taller()}`;
  }

  // =====================================================================================================
  // B · CARRILES QUE SE ABREN
  // =====================================================================================================
  function carrilAbierto(p) {
    const r = C.ritmo(p), m = C.margen(p);
    return `<div class="v5-abierto">
      <div class="v5-ab-bloque"><span class="versalita">Qué hacer</span><p class="v5-ab-frase ${claseDe(p)}">${marca(claseDe(p))}<b>${RITMO[claseDe(p)].palabra}.</b> ${C.decision(p).frase}</p>
        <p class="tenue">Margen: ${m == null ? "por confirmar (vino por la carga inicial)" : C.P(m)} · ${C.P(C.costoReal(p))} con costo real</p></div>
      <div class="v5-ab-bloque">${C.nuevo()}<span class="versalita">Tallas · semanas para vender lo que queda</span>
        <div class="x-celdas">${C.porTalla(p).map((x) => `<span class="x-celda ${paso(x.sem)}" title="${x.v} vendidas, ${x.q} quedan"><b>${x.t}</b><em>${semTxt(x.sem)} sem</em></span>`).join("")}</div></div>
      <div class="v5-ab-bloque">${C.nuevo()}<span class="versalita">Sedes · semanas para vender lo que queda</span>
        <div class="x-celdas">${C.porSede(p).map((x) => `<span class="x-celda ${paso(semSub(x.v, x.q, r.semanas), x.llego > 0)}"><b>${x.nombre}</b><em>${x.llego ? `${semTxt(semSub(x.v, x.q, r.semanas))} sem` : "no llegó"}</em></span>`).join("")}</div></div>
      <div class="v5-ab-bloque v5-ab-plata"><span class="versalita">Plata</span>
        <p><span>Le debes</span><b class="num">${C.S(p.deuda)}</b></p>${p.vencido ? `<p class="x-rojo"><span>Ya venció</span><b class="num">${C.S(p.vencido)}</b></p>` : ""}
        <p><span>Entregas atrasadas</span><b class="num">${p.atrasadas}</b></p>
        <button class="btn btn-secundario" title="La ficha se rediseña cuando elijas la lista">Abrir su ficha ${C.icon("arrow-right", 16)}</button></div>
    </div>`;
  }
  function rankingB() {
    const xs = visibles(), pos = puestoDe(), max = Math.max(...window.PROVEEDORES.map(val));
    if (!xs.length) return vacio();
    const vis = xs.slice(0, E.todos ? undefined : POR_PAGINA);
    return `${cuenta(xs.length)}<div class="v5-carriles">${vis.map((p) => {
      const ancho = (val(p) / max) * 100, fv = vend(p) / val(p), abierto = E.abierto === p.id;
      return `<div class="v5-carril ${abierto ? "abierto" : ""}" data-k="${p.id}">
        <button class="v5-carril-cab" data-abrir="${p.id}" aria-expanded="${abierto}">
          <b class="v5-puesto-med num">${pos.get(p.id)}</b>
          <span class="v5-carril-cuerpo">
            <span class="v5-carril-linea"><b class="v5-carril-nom">${p.nombre}</b>${cambio(p, pos.get(p.id))}<span class="tenue">${p.marcas.join(", ")} · ${p.rubro}</span>${deudaTxt(p)}</span>
            <span class="v5-pista"><span class="v5-tramos" style="width:${ancho}%">
              <i class="vend" style="flex:${p.vendidas}">${ancho * fv > 13 ? `<em>${fmt(vend(p))} ${E.modo === "soles" ? "vendido" : "vendidas"}</em>` : ""}</i>
              <i class="queda" style="flex:${p.estantes}">${ancho * (p.estantes / p.comprado) > 13 ? `<em>${fmt(E.modo === "soles" ? p.estantes * p.costo : p.estantes)} ${E.modo === "soles" ? "en estantes" : "quedan"}</em>` : ""}</i>
              ${C.otras(p) ? `<i class="otras" style="flex:${C.otras(p)}" title="${C.otras(p)} otras salidas (ajustes y devoluciones)"></i>` : ""}
            </span><b class="v5-total num">${aprox(p)}${fmt(val(p))}</b></span>
          </span>
          ${pildora(p)}
          <span class="v5-chev">${C.icon("chevron", 18)}</span>
        </button>
        <div class="v5-plegable"><div>${abierto ? carrilAbierto(p) : ""}</div></div>
      </div>`;
    }).join("")}</div>${verMas(xs.length)}${taller()}`;
  }

  // =====================================================================================================
  // C · FILAS CON SU VENTA DIARIA + COMPARAR
  // =====================================================================================================
  // Ventas por día desde que llegó (datos de ejemplo, con semilla por proveedor; suman exactamente sus vendidas).
  const SERIES = new Map();
  function serie(p) {
    if (SERIES.has(p.id)) return SERIES.get(p.id);
    const n = Math.max(7, Math.min(28, p.dias));
    let h = [...p.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const azar = () => (h = (Math.imul(h, 1103515245) + 12345) >>> 0) / 4294967296;
    const k = claseDe(p), tendencia = k === "rapido" ? 0.9 : k === "lento" ? -0.6 : 0.15;
    const w = Array.from({ length: n }, (_, d) => Math.max(0.05, 1 + 0.4 * Math.sin(d / 2.2 + azar() * 6) + tendencia * (d / n - 0.5) + (azar() - 0.5) * 0.7));
    const tw = w.reduce((a, b) => a + b, 0), crudo = w.map((x) => (x / tw) * p.vendidas), ent = crudo.map(Math.floor);
    let falta = p.vendidas - ent.reduce((a, b) => a + b, 0);
    crudo.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).slice(0, falta).forEach(([, i]) => ent[i]++);
    SERIES.set(p.id, ent);
    return ent;
  }
  const linea = (p, W = 150, H = 34) => {
    // Promedio de 3 días para que se lea la tendencia y no el ruido; la escala nunca baja de 5 por día, así un proveedor que vende 0 o 1
    // al día se ve casi plano (que es lo que pasa) y no como picos.
    const crudo = serie(p), s = crudo.map((_, i) => (crudo[Math.max(0, i - 1)] + crudo[i] + crudo[Math.min(crudo.length - 1, i + 1)]) / 3);
    const max = Math.max(5, ...s), X = (i) => (i / (s.length - 1)) * W, Y = (v) => H - 3 - (v / max) * (H - 8);
    const pts = s.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    const sem7 = crudo.slice(-7).reduce((a, b) => a + b, 0), antes7 = crudo.slice(-14, -7).reduce((a, b) => a + b, 0);
    return `<span class="v5-linea" title="Ventas por día en los últimos ${crudo.length} días: ${sem7} la última semana, ${antes7} la anterior">
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><path d="M0,${H} L${pts.replace(/ /g, " L")} L${W},${H} Z" class="area"/><polyline points="${pts}" class="trazo" data-anim="dibuja" data-largo-auto/><circle cx="${X(s.length - 1)}" cy="${Y(s[s.length - 1])}" r="2.6" class="punto"/></svg>
      <span class="v5-linea-n"><b class="num">${sem7}</b> esta semana ${sem7 > antes7 ? "↑" : sem7 < antes7 ? "↓" : ""}</span></span>`;
  };
  function rankingC() {
    const xs = visibles(), pos = puestoDe(), max = Math.max(...window.PROVEEDORES.map(val));
    if (!xs.length) return vacio();
    const vis = xs.slice(0, E.todos ? undefined : POR_PAGINA);
    return `${cuenta(xs.length)}<p class="v5-ayuda">Marca hasta 3 proveedores para compararlos lado a lado →</p>
      <div class="v5-filas c">${vis.map((p) => {
        const marcado = E.comparar.includes(p.id);
        return `<div class="v5-fila c ${marcado ? "marcada" : ""}" data-k="${p.id}" data-elegir="${p.id}" role="button" tabindex="0">
          <button class="v5-casilla ${marcado ? "on" : ""}" data-comparar="${p.id}" aria-pressed="${marcado}" aria-label="Comparar ${C.esc(p.nombre)}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"/></svg></button>
          <span class="v5-puesto-chico num">${pos.get(p.id)}</span>
          <span class="v5-nom"><b>${p.nombre}</b><span>${cambio(p, pos.get(p.id))}${deudaTxt(p) || `${p.marcas.join(", ")} · ${p.rubro}`}</span></span>
          ${linea(p)}
          <span class="v5-anillo">${anillo(C.vendidoPct(p), "var(--tinta)", 42)}<small>vendido</small></span>
          <span class="v5-barra"><i style="width:${(val(p) / max) * 100}%"><em style="width:${(vend(p) / val(p)) * 100}%"></em></i><b class="num">${aprox(p)}${fmt(val(p))}</b></span>
          ${pildora(p)}
        </div>`;
      }).join("")}</div>${verMas(xs.length)}${taller()}`;
  }
  // La comparación a la derecha: hasta 3 proveedores, cada dato en su fila para leerlo de un golpe.
  function comparacion() {
    const ps = E.comparar.map(P), maxV = Math.max(...ps.map(val));
    const fila = (titulo, celda) => `<div class="v5-cmp-fila"><span class="v5-cmp-et">${titulo}</span>${ps.map((p) => `<span class="v5-cmp-c">${celda(p)}</span>`).join("")}</div>`;
    return `<div class="v5-cmp" style="--n:${ps.length}">
      <div class="v5-cmp-cab"><h2>Comparar</h2><button class="x-volver" data-comparar="">Quitar todos</button></div>
      ${ps.length < 2 ? `<p class="tenue">Marca ${ps.length ? "uno o dos más" : "hasta 3"} en el ranking para verlos lado a lado.</p>` : ""}
      <div class="v5-cmp-tabla">
        <div class="v5-cmp-fila v5-cmp-nombres"><span></span>${ps.map((p) => `<span class="v5-cmp-c"><b>${p.nombre}</b><button class="v5-quitar" data-comparar="${p.id}" aria-label="Quitar ${C.esc(p.nombre)}">×</button></span>`).join("")}</div>
        ${fila("Le compraste", (p) => `<b class="num">${fmt(val(p))}</b><span class="v5-barra mini"><i style="width:${(val(p) / maxV) * 100}%"><em style="width:${(vend(p) / val(p)) * 100}%"></em></i></span>`)}
        ${fila("Vendiste", (p) => `<b class="num">${C.P(C.vendidoPct(p))}</b>`)}
        ${fila("Lo que queda se vende en", (p) => pildora(p, true))}
        ${fila("Ventas, últimos días", (p) => linea(p, 92, 30))}
        ${fila("Margen", (p) => (C.margen(p) == null ? '<span class="tenue">por confirmar</span>' : `<b class="num">${C.P(C.margen(p))}</b>`))}
        ${fila("Le debes", (p) => (p.vencido ? `<b class="x-rojo num">${C.S(p.vencido)} vencido</b>` : `<b class="num">${C.S(p.deuda)}</b>`))}
        ${fila("Talla que se acaba", (p) => { const t = C.tallaClave(p).primero; return t && Number.isFinite(t.sem) ? `<b>${t.t}</b> <span class="tenue">${semTxt(t.sem)} sem</span>` : "—"; })}
      </div>
    </div>`;
  }

  // ---------- La página ----------
  const RANKING = { a: rankingA, b: rankingB, c: rankingC };
  const ladoDe = (dir) => (dir === "c" && E.comparar.length ? comparacion() : lado());
  function lista(dir) {
    return `
      ${C.encabezado({ titulo: "Proveedores", frase: "A quién le compras más y cómo se vende lo que le compraste.", der: `<button class="btn btn-secundario versal">Mercadería · Servicios</button><button class="btn btn-primario versal">${C.icon("plus", 16)} Nuevo proveedor</button>` })}
      <div class="x-cuerpo dir-${dir}">
        <main class="x-principal">${controles()}<div class="v5-ranking" data-ranking>${RANKING[dir]()}</div></main>
        <aside class="x-lado" data-lado>${ladoDe(dir)}</aside>
      </div>`;
  }

  // Reacomodar con FLIP: cada proveedor se desliza de su lugar viejo al nuevo, y lo que llega aparece.
  function flip(caja, pintar) {
    const antes = new Map([...caja.querySelectorAll("[data-k]")].map((el) => [el.dataset.k, el.getBoundingClientRect()]));
    pintar();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    caja.querySelectorAll("[data-k]").forEach((el) => {
      const a = antes.get(el.dataset.k), b = el.getBoundingClientRect();
      if (!a) { el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: "cubic-bezier(0.32,0.72,0.24,1)" }); return; }
      const dx = a.left - b.left, dy = a.top - b.top;
      if (dx || dy) el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: 700, easing: "cubic-bezier(0.32,0.72,0.24,1)" });
    });
  }

  function despues(raiz, e) {
    const dir = e.dir, caja = raiz.querySelector("[data-ranking]");
    const pintarRanking = (conFlip) => { const f = () => { caja.innerHTML = RANKING[dir](); marcarElegido(); C.animar(caja); }; conFlip ? flip(caja, f) : f(); };
    const pintarLado = () => { const l = raiz.querySelector("[data-lado]"); l.innerHTML = ladoDe(dir); C.animar(l); marcarElegido(); };
    const marcarElegido = () => raiz.querySelectorAll("[data-k]").forEach((el) => el.classList.toggle("elegido", el.dataset.k === E.elegido));
    const chips = () => raiz.querySelectorAll(".x-chip").forEach((b) => { const on = (b.dataset.filtro || null) === E.filtro; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    raiz.onclick = (ev) => {
      const t = ev.target.closest("[data-modo],[data-filtro],[data-vermas],[data-abrir],[data-comparar],[data-elegir]");
      if (!t) return;
      if (t.dataset.modo) {
        if (E.modo === t.dataset.modo) return;
        E.antes = puestoDe(); E.modo = t.dataset.modo;
        raiz.querySelectorAll("[data-modo]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.modo === E.modo));
        pintarRanking(true); pintarLado();
      } else if (t.hasAttribute("data-filtro")) { const f = t.dataset.filtro || null; E.filtro = E.filtro === f ? null : f; E.todos = false; chips(); pintarRanking(true); }
      else if (t.hasAttribute("data-vermas")) { E.todos = !E.todos; pintarRanking(false); }
      else if (t.hasAttribute("data-abrir")) {
        // Un carril abierto a la vez: se pliega el anterior y se abre el nuevo, sin rehacer la lista.
        const id = t.dataset.abrir, ya = E.abierto === id;
        raiz.querySelectorAll(".v5-carril.abierto").forEach((c) => { c.classList.remove("abierto"); c.querySelector("[data-abrir]").setAttribute("aria-expanded", "false"); });
        E.abierto = ya ? null : id;
        if (!ya) { const c = raiz.querySelector(`.v5-carril[data-k="${id}"]`); c.querySelector(".v5-plegable>div").innerHTML = carrilAbierto(P(id)); requestAnimationFrame(() => c.classList.add("abierto")); t.setAttribute("aria-expanded", "true"); }
      } else if (t.hasAttribute("data-comparar")) {
        ev.stopPropagation();
        const id = t.dataset.comparar;
        if (!id) E.comparar = [];
        else if (E.comparar.includes(id)) E.comparar = E.comparar.filter((x) => x !== id);
        else E.comparar = [...E.comparar.slice(-2), id];
        raiz.querySelectorAll("[data-comparar]").forEach((b) => { if (!b.closest(".v5-fila")) return; const on = E.comparar.includes(b.dataset.comparar); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.closest(".v5-fila").classList.toggle("marcada", on); });
        pintarLado();
      } else {
        const id = t.dataset.elegir || null;
        if (dir === "b" && id && t.closest(".x-lado")) {
          // En los carriles el detalle se abre en la lista: se busca el carril, se abre y se lleva a la vista.
          E.filtro = null; E.q = ""; E.todos = true; E.abierto = id; chips(); pintarRanking(false);
          raiz.querySelector(`.v5-carril[data-k="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        E.elegido = !id || id === E.elegido ? null : id;
        if (dir === "c" && E.comparar.length && t.closest(".x-lado")) E.comparar = [];
        pintarLado();
        if (E.elegido && matchMedia("(max-width:1100px)").matches) raiz.querySelector("[data-lado]").scrollIntoView({ behavior: "smooth" });
      }
    };
    raiz.oninput = (ev) => { if (ev.target.matches("[data-buscar]")) { E.q = ev.target.value; E.todos = !!E.q; pintarRanking(false); } };
    raiz.onkeydown = (ev) => { const el = ev.target.closest?.(".v5-fila.c"); if (el && ev.target === el && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); el.click(); } };
    marcarElegido();
  }

  window.DIRS = {
    a: { lema: "Podio y lista: los 3 primeros en grande y el resto en filas con su barra.", lista: () => lista("a"), despues },
    b: { lema: "Carriles: cada proveedor con su barra grande; al tocarlo se abre ahí mismo.", lista: () => lista("b"), despues },
    c: { lema: "Filas con su venta diaria; marca hasta 3 para compararlos a la derecha.", lista: () => lista("c"), despues },
  };
})();
