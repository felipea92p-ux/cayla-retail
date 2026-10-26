// Proveedores v4 (2026-10-26, cuarta ronda): «innovadoras y visuales». Se mantiene lo que Felipe pidió antes: muchos proveedores sin
// mosaico, ordenar por prendas o dinero, nada de espacio muerto, el color solo con su significado (ritmo: ● verde repón, ■ pizarra a su
// ritmo, ▲ ámbar frena; ✕ rojo solo lo vencido) y, a la derecha, lo que no se ve a simple vista. Cambia la FORMA de mirar:
//   A · Mapa de decisiones — cada proveedor es un punto: a la derecha, más le compras; arriba, más rápido se vende. Las cuatro zonas dicen qué hacer.
//   B · Sol de proveedores  — el ranking en círculo: cada rayo es un proveedor, el largo es cuánto le compras y gira del mayor al menor.
//   C · Mapa de calor       — el ranking con sus tallas y sus sedes en celdas de color: dónde se agota y dónde se queda, de un vistazo.
(function () {
  const C = window.C;
  const E = { modo: "prendas", filtro: null, elegido: null, q: "" };

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

  // =========================================================================================================
  // A · MAPA DE DECISIONES — x: cuánto le compras (escala log) · y: semanas para vender lo que queda (arriba, rápido)
  // =========================================================================================================
  // El alto del mapa nunca pasa la pantalla: en una pantalla ancha el mapa se estira a lo ancho, no a lo alto (sin espacio muerto).
  let MW = 1000;
  const MH = 560, ML = 64, MR = 24, MT = 26, MB = 54;
  const anchoMapa = () => {
    const w = innerWidth, principal = w > 1100 ? w - 2 * Math.min(40, Math.max(16, w * 0.03)) - (w >= 1700 ? 420 : 380) - 22 - 40 : w - 72;
    const alto = Math.min(640, Math.max(420, innerHeight - 320));
    MW = Math.max(760, Math.round((MH * principal) / alto));
  };
  function geoMapa() {
    const vs = window.PROVEEDORES.map(val), lo = Math.min(...vs) * 0.8, hi = Math.max(...vs) * 1.25;
    const X = (v) => ML + ((Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (MW - ML - MR);
    const Y = (s) => MT + (Math.log(Math.min(Math.max(Number.isFinite(s) ? s : 140, 1), 140)) / Math.log(140)) * (MH - MT - MB);
    const corte = val(ranking()[9]); // tus 10 más grandes, a la derecha de esta línea
    return { X, Y, lo, hi, corte };
  }
  function mapa() {
    anchoMapa();
    const g = geoMapa(), xc = g.X(g.corte), y6 = g.Y(6), y16 = g.Y(16), top = ranking().slice(0, 8).map((p) => p.id);
    const ticksX = (E.modo === "soles" ? [200, 500, 1000, 2000, 5000, 10000] : [5, 10, 20, 50, 100, 200, 400]).filter((t) => t > g.lo && t < g.hi);
    const ticksY = [1, 2, 3, 6, 10, 16, 30, 60, 100];
    const zona = (x, y, w, h, cls, i) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="x-zona ${cls}" data-anim="funde" style="--i:${i}"/>`;
    const puntos = [...window.PROVEEDORES].sort((a, b) => b.estantes - a.estantes).map((p, i) => {
      const k = claseDe(p), r = 4 + Math.sqrt(p.estantes) * 1.15, x = g.X(val(p)), y = g.Y(semDe(p));
      return `<g class="x-punto ${k}" data-p="${p.id}" data-ritmo="${k}" tabindex="0" role="button" aria-label="${C.esc(p.nombre)}" style="transform:translate(${x}px,${y}px)">
        <circle r="${r}" class="x-burb" style="--i:${Math.min(i, 40)}"/>
        ${top.includes(p.id) ? (x > MW - 200 ? `<text x="${-r - 6}" y="4" text-anchor="end" class="x-etq">${p.nombre}</text>` : `<text x="${r + 6}" y="4" class="x-etq">${p.nombre}</text>`) : ""}
      </g>`;
    }).join("");
    return `<div class="x-mapa" data-anim>
      <div class="x-mapa-cab"><h2>¿A quién le vuelves a comprar?</h2><p>A la derecha, más le compras. Arriba, más rápido se vende. Más grande el punto, más prendas siguen en tus tiendas.</p></div>
      <p class="desliza">Desliza el mapa de lado para verlo entero →</p>
      <div class="x-lienzo"><svg viewBox="0 0 ${MW} ${MH}" class="x-svg" role="img" aria-label="Mapa de proveedores: cuánto le compras contra qué tan rápido se vende">
        ${zona(xc, MT, MW - MR - xc, y6 - MT, "verde fuerte", 1)}${zona(ML, MT, xc - ML, y6 - MT, "verde", 2)}
        ${zona(xc, y16, MW - MR - xc, MH - MB - y16, "ambar fuerte", 3)}${zona(ML, y16, xc - ML, MH - MB - y16, "ambar", 4)}
        <g class="x-guias">${ticksY.map((t) => `<line x1="${ML}" x2="${MW - MR}" y1="${g.Y(t)}" y2="${g.Y(t)}"/><text x="${ML - 10}" y="${g.Y(t) + 4}" text-anchor="end">${t === 100 ? "100+" : t}</text>`).join("")}
          ${ticksX.map((t) => `<text x="${g.X(t)}" y="${MH - MB + 20}" text-anchor="middle">${E.modo === "soles" ? C.S(t) : t}</text>`).join("")}</g>
        <line x1="${xc}" x2="${xc}" y1="${MT}" y2="${MH - MB}" class="x-corte"/>
        <text x="${xc + 8}" y="${MT + 46}" class="x-corte-t">tus 10 proveedores más grandes →</text>
        <text x="${ML - 44}" y="${(MT + MH - MB) / 2}" class="x-eje" transform="rotate(-90 ${ML - 44} ${(MT + MH - MB) / 2})" text-anchor="middle">semanas para vender lo que queda</text>
        <text x="${(ML + MW - MR) / 2}" y="${MH - 8}" class="x-eje" text-anchor="middle">cuánto le compras · ${E.modo === "soles" ? "dinero" : "prendas"} →</text>
        <g class="x-rotulos">
          <text x="${MW - MR - 12}" y="${MT + 22}" text-anchor="end" class="x-rot verde">REPÓN · SE VENDEN RÁPIDO</text>
          <text x="${ML + 12}" y="${MT + 22}" class="x-rot verde suave">PRUEBA COMPRARLES MÁS</text>
          <text x="${MW - MR - 12}" y="${MH - MB - 12}" text-anchor="end" class="x-rot ambar">FRENA</text>
          <text x="${ML + 12}" y="${MH - MB - 12}" class="x-rot ambar suave">NO INSISTAS</text>
        </g>
        <g class="x-puntos">${puntos}</g>
      </svg></div><div class="x-tip" hidden></div>
    </div>`;
  }
  function moverMapa(raiz) {
    const g = geoMapa();
    raiz.querySelectorAll(".x-punto").forEach((el) => { const p = P(el.dataset.p); el.style.transform = `translate(${g.X(val(p))}px,${g.Y(semDe(p))}px)`; });
  }

  // =========================================================================================================
  // B · SOL DE PROVEEDORES — un rayo por proveedor, del mayor (arriba) al menor, en el sentido del reloj
  // =========================================================================================================
  const R0 = 128, LMAX = 180;
  function geoSol() {
    const rk = ranking(), max = val(rk[0]), n = rk.length, paso = 360 / n;
    const m = new Map(rk.map((p, i) => [p.id, { i, ang: i * paso, len: 8 + (LMAX - 8) * Math.sqrt(val(p) / max), fv: vend(p) / val(p) }]));
    return { m, paso, max };
  }
  function sol() {
    const g = geoSol(), ancho = Math.max(4, ((2 * Math.PI * R0) / window.PROVEEDORES.length) * 0.62);
    const anillos = [0.1, 0.4, 1].map((f) => `<circle r="${R0 + (LMAX - 8) * Math.sqrt(f) + 8}" class="x-guia-c"/><text x="-10" y="${-(R0 + (LMAX - 8) * Math.sqrt(f) + 12)}" text-anchor="end" class="x-guia-t">${fmt(g.max * f)}</text>`).join("");
    const rayos = window.PROVEEDORES.map((p) => {
      const d = g.m.get(p.id), k = claseDe(p);
      return `<g class="x-rayo ${k}" data-p="${p.id}" data-ritmo="${k}" tabindex="0" role="button" aria-label="${C.esc(p.nombre)}" style="transform:rotate(${d.ang}deg)">
        <rect class="x-r-fondo" x="${-ancho / 2 - 2}" y="${-(R0 + LMAX + 30)}" width="${ancho + 4}" height="${LMAX + 30}" />
        <g class="x-crece" style="--i:${d.i}">
          <rect class="x-r-queda" x="${-ancho / 2}" width="${ancho}" rx="2" style="y:${-(R0 + d.len)}px;height:${d.len}px" />
          <rect class="x-r-vend" x="${-ancho / 2}" width="${ancho}" rx="2" style="y:${-(R0 + d.len * d.fv)}px;height:${d.len * d.fv}px" />
        </g><g class="x-r-punta" style="transform:translateY(${-(R0 + d.len + 9)}px)"><circle r="4.5" class="x-r-marca ${k}"/></g>
      </g>`;
    }).join("");
    return `<div class="x-sol" data-anim>
      <div class="x-mapa-cab"><h2>Tus proveedores, del que más le compras al que menos</h2><p>Cada rayo es un proveedor y gira como el reloj: arriba el primero. El largo es cuánto le compraste; lo oscuro, lo que ya vendiste. La punta dice cómo se vende.</p></div>
      <div class="x-sol-caja">
        <svg viewBox="${(() => { const v = matchMedia("(max-width:760px)").matches ? 330 : 470; return `${-v} ${-v} ${2 * v} ${2 * v}`; })()}" class="x-svg x-sol-svg" role="img" aria-label="Ranking circular de proveedores">
          <g class="x-guias-sol">${anillos}</g>
          <g class="x-rayos">${rayos}</g>
          <g class="x-etiquetas" data-etiquetas>${etiquetasSol(g)}</g>
          <circle r="${R0 - 10}" class="x-centro-c"/>
        </svg>
        <div class="x-centro" data-centro>${centro()}</div>
        <div class="x-tip" hidden></div>
      </div>
    </div>`;
  }
  function etiquetasSol(g) {
    return ranking().slice(0, 14).map((p) => {
      const d = g.m.get(p.id), izq = d.ang > 180, rr = R0 + d.len + 20;
      return `<g style="transform:rotate(${d.ang}deg)"><text class="x-sol-etq" transform="translate(0 ${-rr}) rotate(${izq ? 90 : -90})" text-anchor="${izq ? "end" : "start"}" dominant-baseline="middle"><tspan class="n">${d.i + 1}</tspan> ${p.nombre.length > 19 ? p.nombre.slice(0, 18) + "…" : p.nombre}</text></g>`;
    }).join("");
  }
  function centro(p = null) {
    if (!p) {
      const ps = window.PROVEEDORES, total = ps.reduce((a, x) => a + val(x), 0), v = ps.reduce((a, x) => a + vend(x), 0);
      return `<span class="versalita">${ps.length} proveedores</span><b class="num">${fmt(total)}</b><span>${E.modo === "soles" ? "gastados" : "prendas compradas"}</span><em><b>${C.P((v / total) * 100)}</b> ya vendido</em>`;
    }
    const k = claseDe(p), pos = ranking().findIndex((x) => x.id === p.id) + 1;
    return `<span class="versalita">Puesto ${pos}</span><b class="x-c-nom">${p.nombre}</b><b class="num">${fmt(val(p))}</b><em class="${k}">${marca(k)} ${semTxt(semDe(p))} sem · ${RITMO[k].palabra}</em>`;
  }
  function moverSol(raiz) {
    const g = geoSol();
    raiz.querySelectorAll(".x-rayo").forEach((el) => {
      const d = g.m.get(el.dataset.p);
      el.style.transform = `rotate(${d.ang}deg)`;
      const q = el.querySelector(".x-r-queda"), v = el.querySelector(".x-r-vend"), t = el.querySelector(".x-r-punta");
      q.style.y = `${-(R0 + d.len)}px`; q.style.height = `${d.len}px`;
      v.style.y = `${-(R0 + d.len * d.fv)}px`; v.style.height = `${d.len * d.fv}px`;
      t.style.transform = `translateY(${-(R0 + d.len + 9)}px)`;
    });
    const et = raiz.querySelector("[data-etiquetas]");
    et.classList.add("cambia");
    setTimeout(() => { et.innerHTML = etiquetasSol(g); et.classList.remove("cambia"); }, 700);
    raiz.querySelector("[data-centro]").innerHTML = centro(E.elegido ? P(E.elegido) : null);
    raiz.querySelectorAll(".x-guia-t").forEach((t, i) => (t.textContent = fmt(g.max * [0.1, 0.4, 1][i])));
  }

  // =========================================================================================================
  // C · MAPA DE CALOR — el ranking con sus tallas y sus sedes: cada celda es cuántas semanas tarda en venderse lo que queda
  // =========================================================================================================
  function filaCalor(p, pos, max, i) {
    const r = C.ritmo(p), k = claseDe(p), juz = r.juzgable;
    const celda = (s, hay, titulo, j) => `<span class="x-celda ${juz ? paso(s, hay) : hay ? "s9" : "s0"}" title="${C.esc(titulo)}" style="--j:${j}"><em>${hay ? semTxt(s) : ""}</em></span>`;
    return `<button class="x-hfila" data-p="${p.id}" data-elegir="${p.id}" data-ritmo="${k}" style="--i:${Math.min(i, 30)}">
      <span class="x-h-pos num">${pos}</span>
      <span class="x-h-nom"><b>${p.nombre}</b></span>
      <span class="x-h-barra"><i style="width:${(val(p) / max) * 100}%"><em style="width:${(vend(p) / val(p)) * 100}%"></em></i><b class="num">${fmt(val(p))}</b></span>
      <span class="x-h-celdas">${C.porTalla(p).map((x, j) => celda(x.sem, x.v + x.q > 0, `${p.nombre} · talla ${x.t}: ${x.v} vendidas, ${x.q} quedan`, j)).join("")}</span>
      <span class="x-h-celdas">${C.porSede(p).map((x, j) => celda(semSub(x.v, x.q, r.semanas), x.llego > 0, `${p.nombre} · ${x.nombre}: ${x.llego ? `${x.v} vendidas, ${x.q} quedan` : "no le llegó nada"}`, j + 4)).join("")}</span>
      <span class="x-h-total ${juz ? paso(semDe(p)) : "s9"}">${marca(k)}<b class="num">${juz ? semTxt(semDe(p)) : "—"}</b></span>
    </button>`;
  }
  function calorFilas() {
    const rk = ranking(), max = val(rk[0]);
    return rk.map((p, i) => filaCalor(p, i + 1, max, i)).join("");
  }
  function calor() {
    const ps = window.PROVEEDORES;
    // La fila de toda la tienda arriba: suma de todos los proveedores, por talla y por sede.
    const tot = (fn) => { const v = ps.reduce((a, p) => a + fn(p)[0], 0), q = ps.reduce((a, p) => a + fn(p)[1], 0); return semSub(v, q, 3.6); };
    const tienda = [...["S", "M", "L", "XL"].map((t) => tot((p) => p.tallas[t])), ...["tru", "aqp", "lim"].map((s) => tot((p) => p.sedes[s]))];
    return `<div class="x-calor" data-anim>
      <div class="x-mapa-cab"><h2>Dónde se agota y dónde se queda</h2><p>Cada fila es un proveedor, del que más le compras al que menos. Cada celda dice en cuántas semanas se vende lo que queda de esa talla o en esa sede.</p></div>
      <div class="x-escala" aria-label="Escala">
        <span class="x-celda s1"><em>≤ 3</em></span><span class="x-celda s2"><em>≤ 6</em></span><span class="x-celda s3"><em>6–16</em></span><span class="x-celda s4"><em>16–30</em></span><span class="x-celda s5"><em>30+</em></span>
        <span class="x-escala-t">semanas para vender lo que queda · <b>verde, se agota: repón</b> · <b>ámbar, se queda: frena</b></span>
      </div>
      <p class="desliza">Desliza la tabla de lado para ver las tallas y las sedes →</p>
      <div class="x-htabla">
        <div class="x-hfila x-henc"><span class="x-h-pos">#</span><span class="x-h-nom">Proveedor</span><span class="x-h-barra">Le compraste · ${E.modo === "soles" ? "dinero" : "prendas"}</span>
          <span class="x-h-celdas">${["S", "M", "L", "XL"].map((t) => `<span>${t}</span>`).join("")}</span><span class="x-h-celdas">${["TRU", "AQP", "LIM"].map((t) => `<span>${t}</span>`).join("")}</span><span class="x-h-total">Todo</span></div>
        <div class="x-hfila x-htienda"><span class="x-h-pos"></span><span class="x-h-nom"><b>Toda la tienda</b></span><span class="x-h-barra tenue">${C.nuevo()}</span>
          <span class="x-h-celdas">${tienda.slice(0, 4).map((s) => `<span class="x-celda ${paso(s)}"><em>${semTxt(s)}</em></span>`).join("")}</span><span class="x-h-celdas">${tienda.slice(4).map((s) => `<span class="x-celda ${paso(s)}"><em>${semTxt(s)}</em></span>`).join("")}</span><span></span></div>
        <div data-filas>${calorFilas()}</div>
      </div>
      <p class="x-pie-calor">${C.icon("taller", 16)} El Taller (CAYLA SAC, ${C.N(window.TALLER.prendas)} prendas) va aparte: no es un proveedor.</p>
    </div>`;
  }
  // Reordenar con FLIP: cada fila se desliza de su puesto viejo al nuevo.
  function moverCalor(raiz) {
    const caja = raiz.querySelector("[data-filas]"), antes = new Map([...caja.children].map((el) => [el.dataset.p, el.getBoundingClientRect().top]));
    caja.innerHTML = calorFilas();
    caja.querySelectorAll(".x-hfila").forEach((el) => {
      el.classList.add("visto", "sin-entrada");
      const t0 = antes.get(el.dataset.p); if (t0 == null) return;
      const dy = t0 - el.getBoundingClientRect().top; if (!dy) return;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 700, easing: "cubic-bezier(0.32,0.72,0.24,1)" });
    });
  }

  // ---------- La página ----------
  const VISUAL = { a: mapa, b: sol, c: calor }, MOVER = { a: moverMapa, b: moverSol, c: moverCalor };
  function lista(dir) {
    return `
      ${C.encabezado({ titulo: "Proveedores", frase: "A quién le compras más y cómo se vende lo que le compraste.", der: `<button class="btn btn-secundario versal">Mercadería · Servicios</button><button class="btn btn-primario versal">${C.icon("plus", 16)} Nuevo proveedor</button>` })}
      <div class="x-cuerpo dir-${dir}">
        <main class="x-principal">${controles()}<div class="tarjeta x-visual" data-visual>${VISUAL[dir]()}</div></main>
        <aside class="x-lado" data-lado>${lado()}</aside>
      </div>`;
  }
  function despues(raiz, e) {
    const dir = e.dir, visual = raiz.querySelector("[data-visual]");
    const aplicarFiltro = () => {
      raiz.querySelectorAll("[data-ritmo][data-p]").forEach((el) => el.classList.toggle("apagado", !pasa(P(el.dataset.p))));
      raiz.querySelectorAll("[data-p]").forEach((el) => el.classList.toggle("elegido", el.dataset.p === E.elegido));
      raiz.querySelectorAll(".x-chip").forEach((b) => { const on = (b.dataset.filtro || null) === E.filtro; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    };
    const pintarLado = () => { const l = raiz.querySelector("[data-lado]"); l.innerHTML = lado(); C.animar(l); if (dir === "b") raiz.querySelector("[data-centro]").innerHTML = centro(E.elegido ? P(E.elegido) : null); aplicarFiltro(); };
    // Lo que se ve al pasar el mouse: una tarjeta junto al punto, al rayo o a la celda.
    visual.addEventListener("mouseover", (ev) => {
      const el = ev.target.closest("[data-p]"), tip = visual.querySelector(".x-tip"); if (!el || !tip || dir === "c") return;
      const p = P(el.dataset.p), k = claseDe(p), r = el.getBoundingClientRect();
      tip.innerHTML = `<b>${p.nombre}</b><span>Le compraste <b class="num">${fmt(val(p))}</b>${E.modo === "prendas" ? " prendas" : ""} · vendiste <b class="num">${C.P(C.vendidoPct(p))}</b></span><span class="${k}">${marca(k)} ${semTxt(semDe(p))} semanas · ${RITMO[k].palabra}</span>${p.vencido ? `<span class="x-rojo"><i class="x-forma cruz"></i> ${C.S(p.vencido)} vencido</span>` : ""}`;
      tip.hidden = false;
      const caja = tip.offsetParent.getBoundingClientRect();
      // Junto al punto; si está en la mitad de abajo, la tarjeta va arriba de él para no salirse.
      const x = Math.min(r.left - caja.left + r.width / 2 + 14, caja.width - 250), abajo = r.top - caja.top > caja.height / 2;
      const y = abajo ? Math.max(r.top - caja.top - tip.offsetHeight - 8, 0) : Math.max(r.top - caja.top - 10, 0);
      tip.style.transform = `translate(${x}px,${y}px)`;
      if (dir === "b") raiz.querySelector("[data-centro]").innerHTML = centro(p);
    });
    visual.addEventListener("mouseout", (ev) => { const tip = visual.querySelector(".x-tip"); if (!ev.relatedTarget || !ev.relatedTarget.closest?.("[data-p]")) { if (tip) tip.hidden = true; if (dir === "b") raiz.querySelector("[data-centro]").innerHTML = centro(E.elegido ? P(E.elegido) : null); } });
    raiz.onclick = (ev) => {
      const t = ev.target.closest("[data-modo],[data-filtro],[data-elegir],[data-p]");
      if (!t) return;
      if (t.dataset.modo) {
        if (E.modo === t.dataset.modo) return;
        E.modo = t.dataset.modo;
        raiz.querySelectorAll("[data-modo]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.modo === E.modo));
        if (dir === "a") {
          // Los puntos se deslizan de su lugar viejo al nuevo (el eje cambia de prendas a dinero).
          const viejos = new Map([...visual.querySelectorAll(".x-punto")].map((el) => [el.dataset.p, el.style.transform]));
          visual.innerHTML = mapa(); C.animar(visual);
          visual.querySelectorAll(".x-punto").forEach((el) => { el.classList.add("quieto"); const nuevo = el.style.transform; el.style.transition = "none"; el.style.transform = viejos.get(el.dataset.p); el.getBoundingClientRect(); el.style.transition = ""; el.style.transform = nuevo; });
        }
        else MOVER[dir](raiz);
        pintarLado();
      } else if (t.hasAttribute("data-filtro")) { const f = t.dataset.filtro || null; E.filtro = E.filtro === f ? null : f; aplicarFiltro(); }
      else { const id = t.hasAttribute("data-elegir") ? t.dataset.elegir : t.dataset.p; E.elegido = !id || id === E.elegido ? null : id; pintarLado(); if (E.elegido && matchMedia("(max-width:1100px)").matches) raiz.querySelector("[data-lado]").scrollIntoView({ behavior: "smooth" }); }
    };
    raiz.oninput = (ev) => { if (ev.target.matches("[data-buscar]")) { E.q = ev.target.value; aplicarFiltro(); } };
    raiz.onkeydown = (ev) => { const el = ev.target.closest?.("[data-p]"); if (el && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); el.click(); } };
    // Los rayos del sol y las filas del calor entran en cascada; los puntos del mapa caen a su lugar.
    requestAnimationFrame(() => visual.classList.add("llega"));
    aplicarFiltro();
  }

  window.DIRS = {
    a: { lema: "Mapa de decisiones: cuánto le compras contra qué tan rápido se vende.", lista: () => lista("a"), despues },
    b: { lema: "Sol de proveedores: el ranking en círculo, del mayor al menor.", lista: () => lista("b"), despues },
    c: { lema: "Mapa de calor: tallas y sedes de cada proveedor, en verde lo que se agota y en ámbar lo que se queda.", lista: () => lista("c"), despues },
  };
})();
