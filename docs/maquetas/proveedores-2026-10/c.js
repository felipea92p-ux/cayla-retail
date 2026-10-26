// Dirección C · «El flujo»: se ve adónde fue cada prenda que compraste. La lista abre con el río de toda la mercadería —de cada proveedor a
// «vendido», «en estantes» o «rotando lento»— y sigue con una cinta por proveedor; la ficha, el río de UN proveedor (de dónde vino, qué prenda
// era, adónde fue), el perchero de sus tallas, las sedes y el hilo del pago.
(function () {
  const C = window.C;

  // ---------- Un río (sankey) de columnas: nodos apilados y cintas entre columnas vecinas ----------
  function rio({ columnas, flujos, W, H, mIzq = 190, mDer = 210, gap = 10, anchoNodo = 12, id = "rio" }) {
    const n = columnas.length, colX = (k) => mIzq + (k * (W - mIzq - mDer - anchoNodo)) / (n - 1);
    const total = Math.max(...columnas.map((c) => c.reduce((a, x) => a + x.valor, 0)));
    const huecos = Math.max(...columnas.map((c) => c.length - 1));
    const esc = (H - 20 - huecos * gap) / total;
    const pos = {};
    columnas.forEach((col, k) => {
      const alto = col.reduce((a, x) => a + x.valor * esc, 0) + (col.length - 1) * gap;
      let y = 10 + (H - 20 - alto) / 2;
      col.forEach((nodo) => { const h = Math.max(2, nodo.valor * esc); pos[nodo.id] = { x: colX(k), y, h, sal: y, ent: y, k, nodo }; y += h + gap; });
    });
    const cintas = flujos.filter((f) => f.valor > 0).map((f, i) => {
      const a = pos[f.de], b = pos[f.a], h = f.valor * esc;
      const xa = a.x + anchoNodo, xb = b.x, xm = (xa + xb) / 2, ya = a.sal, yb = b.ent;
      a.sal += h; b.ent += h;
      return `<path d="M${xa},${ya} C${xm},${ya} ${xm},${yb} ${xb},${yb} L${xb},${yb + h} C${xm},${yb + h} ${xm},${ya + h} ${xa},${ya + h} Z" class="c-cinta" data-de="${f.de}" data-a="${f.a}" style="--c:${f.color};--i:${i}"><title>${C.esc(f.titulo || "")}</title></path>`;
    }).join("");
    const nodos = Object.values(pos).map(({ x, y, h, k, nodo }, i) => {
      const izq = k === 0, der = k === n - 1;
      const tx = izq ? x - 10 : x + anchoNodo + 10, anc = izq ? "end" : "start";
      const yy = y + h / 2;
      return `<g class="c-nodo ${nodo.ir ? "c-va" : ""}" data-nodo="${nodo.id}" ${nodo.ir ? `data-ir="${nodo.ir}" tabindex="0" role="button" aria-label="${C.esc(nodo.label)}"` : ""}>
        <rect x="${x}" y="${y}" width="${anchoNodo}" height="${h}" rx="3" data-anim="y" style="--c:${nodo.color};--i:${i}"/>
        <text x="${tx}" y="${yy + (h > 26 && nodo.sub ? -2 : 4)}" text-anchor="${anc}" class="c-nl ${!izq && !der ? "medio" : ""}">${nodo.label}</text>
        ${nodo.sub && h > 26 ? `<text x="${tx}" y="${yy + 13}" text-anchor="${anc}" class="c-ns ${!izq && !der ? "medio" : ""}">${nodo.sub}</text>` : ""}
      </g>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="c-svg" id="${id}" role="img">${cintas}${nodos}</svg>`;
  }

  const DEST = {
    vendido: { label: "Vendiste", color: "var(--tinta)" },
    rota: { label: "En estantes, a su ritmo", color: "var(--g-neutro)" },
    lento: { label: "En estantes, rotando lento", color: "var(--ambar)" },
    otras: { label: "Otras salidas", color: "var(--taupe)" },
  };
  const colorProv = (p) => C.tonoVar(C.decision(p).tono);

  function rioCartera() {
    const orden = (p) => C.ORDEN_DECISION.indexOf(C.decision(p).clave) * 1e6 - C.gasto(p);
    const ps = [...window.PROVEEDORES].sort((a, b) => orden(a) - orden(b));
    const suma = { vendido: 0, rota: 0, lento: 0, otras: 0 }, flujos = [];
    ps.forEach((p) => {
      const queda = C.ritmo(p).lento ? "lento" : "rota";
      suma.vendido += p.vendidas; suma[queda] += p.estantes; suma.otras += C.otras(p);
      flujos.push({ de: p.id, a: "vendido", valor: p.vendidas, color: "var(--tinta)", titulo: `${p.nombre}: ${p.vendidas} vendidas` });
      flujos.push({ de: p.id, a: queda, valor: p.estantes, color: DEST[queda].color, titulo: `${p.nombre}: ${p.estantes} en estantes` });
      flujos.push({ de: p.id, a: "otras", valor: C.otras(p), color: "var(--taupe)", titulo: `${p.nombre}: ${C.otras(p)} otras salidas` });
    });
    const total = ps.reduce((a, p) => a + p.comprado, 0);
    const izq = ps.map((p) => ({ id: p.id, label: p.nombre, sub: `${C.N(p.comprado)} · ${C.decision(p).corto.toLowerCase()}`, valor: p.comprado, color: colorProv(p), ir: `ficha/${p.id}` }));
    const der = ["vendido", "rota", "lento", "otras"].map((k) => ({ id: k, label: `${DEST[k].label}: ${C.N(suma[k])}`, sub: `${C.P((suma[k] / total) * 100)} de lo que compraste`, valor: suma[k], color: DEST[k].color }));
    return { svg: rio({ columnas: [izq, der], flujos, W: 1200, H: 440, mIzq: 230, mDer: 260, gap: 7, id: "rio-cartera" }), total, suma };
  }

  function cinta(p, max, i) {
    const queda = C.ritmo(p).lento ? "var(--ambar)" : "var(--g-neutro)", w = (p.comprado / max) * 100;
    return `<span class="c-cinta-fila" style="--w:${w}%"><span class="c-cinta-barra" data-anim="x" style="--i:${i}">
      <i style="flex:${p.vendidas};--c:var(--tinta)"></i><i style="flex:${p.estantes};--c:${queda}"></i><i style="flex:${C.otras(p)};--c:var(--taupe)"></i></span>
      <span class="c-cinta-n num">${C.N(p.comprado)}</span></span>`;
  }

  function lista() {
    const { svg, total, suma } = rioCartera(), hall = C.hallazgosCartera();
    const ps = [...window.PROVEEDORES].sort((a, b) => C.gasto(b) - C.gasto(a)), max = Math.max(...ps.map((p) => p.comprado));
    const cols = "minmax(0,1.3fr) minmax(0,2.2fr) 5.5rem 11rem 1rem";
    return `
      ${C.encabezado({ titulo: "Proveedores", frase: "Adónde fue lo que le compraste a cada uno: lo que ya vendiste, lo que sigue en estantes y lo que se está quedando.", der: `<button class="btn btn-secundario versal">Mercadería · Servicios</button><button class="btn btn-primario versal">${C.icon("plus", 16)} Nuevo proveedor</button>` })}
      <section class="tarjeta c-heroe" data-anim style="--i:1">
        <div class="c-heroe-cab">
          <div><span class="versalita">El río de tu mercadería</span>
            <h2>Le compraste ${C.cuenta(total)} prendas a ${window.PROVEEDORES.length} proveedores. Vendiste ${C.cuenta(suma.vendido)}; ${C.cuenta(suma.lento)} se están quedando.</h2></div>
          <div class="c-heroe-cifras">
            <div style="--c:var(--tinta)"><b class="serif">${C.P((suma.vendido / total) * 100)}</b><span>vendido</span></div>
            <div style="--c:var(--g-neutro)"><b class="serif">${C.P((suma.rota / total) * 100)}</b><span>a su ritmo</span></div>
            <div style="--c:var(--ambar)"><b class="serif">${C.P((suma.lento / total) * 100)}</b><span>rotando lento</span></div>
          </div>
        </div>
        <p class="desliza">Desliza el gráfico de lado para verlo entero →</p><div class="c-lienzo">${svg}</div>
        <p class="tenue c-pie">Toca un proveedor para ver su río. El color de la izquierda es lo que harías con él: verde, vuelve a comprarle; pizarra y ámbar suave, mira antes; ámbar, frena.</p>
      </section>
      <div class="c-dos">
        <section class="c-bloque">${C.ts("Proveedor por proveedor", { cuenta: ps.length, dato: "el largo de la cinta es lo que le compraste" })}
          <div class="tabla c-tabla">
            <div class="tabla-fila tabla-enc" style="--cols:${cols}"><span>Proveedor</span><span>Adónde fue</span><span class="der">Queda en</span><span>Lectura</span><span></span></div>
            ${ps.map((p, i) => { const r = C.ritmo(p), v = C.veredicto(p); return `<button class="tabla-fila" data-ir="ficha/${p.id}" data-fila="${p.id}" data-anim style="--cols:${cols};--i:${i}">
              <span class="nombre"><b>${p.nombre}</b><span>${C.S(C.gasto(p))} · ${C.P(C.costoReal(p))} con costo real</span></span>
              ${cinta(p, max, i)}
              <span class="der num c-sem">${!r.juzgable ? "—" : Number.isFinite(r.agotar) ? `${Math.max(1, Math.round(r.agotar))} sem` : "∞"}</span>
              <span>${C.chip(v.tono, v.texto, { title: v.porque })}</span>
              <span class="flecha">${C.icon("chevron", 16)}</span></button>`; }).join("")}
          </div>
          <span class="leyenda"><span><span class="muestra" style="--c:var(--tinta)"></span>Vendidas</span><span><span class="muestra" style="--c:var(--g-neutro)"></span>En estantes, a su ritmo</span><span><span class="muestra" style="--c:var(--ambar)"></span>En estantes, rotando lento</span><span><span class="muestra" style="--c:var(--taupe)"></span>Otras salidas</span></span>
          ${C.taller()}
        </section>
        <aside class="c-bloque">${C.ts("Lo que quizá no ves", { cuenta: hall.length })}<div class="c-avisos">${hall.map((h, k) => C.aviso(h, k)).join("")}</div></aside>
      </div>
      <section class="c-bloque">${C.ts("La plata con tus proveedores", { dato: "solo mercadería" })}${C.cifrasCartera()}</section>
      <p class="nota">«Rotando lento» es lo que queda de los proveedores que tardarían 16 semanas o más en venderlo, la misma regla del veredicto. «Otras salidas» son ajustes y devoluciones al proveedor. Todo el río está en prendas, no en soles: vale igual para lo que vino por Compras y por la carga inicial.</p>`;
  }

  // ---------- Ficha ----------
  function rioProveedor(p) {
    const real = p.compras / p.comprado, top = [...p.prendas].sort((a, b) => b.compradas - a.compradas);
    const muestra = top.slice(0, 5), resto = top.slice(5);
    const prendas = muestra.map((x, k) => ({ id: `pr${k}`, x })).concat(resto.length ? [{ id: "resto", x: resto.reduce((a, x) => ({ ref: `${resto.length} prendas más`, compradas: a.compradas + x.compradas, vendidas: a.vendidas + x.vendidas, quedan: a.quedan + x.quedan }), { compradas: 0, vendidas: 0, quedan: 0 }) }] : []);
    const lento = C.ritmo(p).lento, queda = lento ? "var(--ambar)" : "var(--g-neutro)";
    const col0 = [
      { id: "compras", label: "Por Compras", sub: `${C.N(p.compras)} · costo exacto`, valor: p.compras, color: "var(--pizarra)" },
      { id: "carga", label: "De la carga inicial", sub: `${C.N(p.comprado - p.compras)} · costo estimado`, valor: p.comprado - p.compras, color: "var(--taupe)" },
    ].filter((x) => x.valor > 0);
    const col1 = prendas.map(({ id, x }) => ({ id, label: x.ref, sub: `${x.vendidas} de ${x.compradas}`, valor: x.compradas, color: "var(--tinta)" }));
    const otras = C.otras(p);
    const col2 = [
      { id: "vendido", label: `Vendiste ${C.N(p.vendidas)}`, sub: C.P(C.vendidoPct(p)), valor: p.vendidas, color: "var(--tinta)" },
      { id: "queda", label: `Quedan ${C.N(p.estantes)}`, sub: lento ? "rotando lento" : "a su ritmo", valor: p.estantes, color: queda },
      { id: "otras", label: `Otras salidas ${C.N(otras)}`, sub: "", valor: otras, color: "var(--taupe)" },
    ].filter((x) => x.valor > 0);
    const flujos = [];
    prendas.forEach(({ id, x }) => {
      const c = Math.round(x.compradas * real);
      flujos.push({ de: "compras", a: id, valor: c, color: "var(--pizarra)" }, { de: "carga", a: id, valor: x.compradas - c, color: "var(--taupe)" });
    });
    prendas.forEach(({ id, x }) => flujos.push({ de: id, a: "vendido", valor: x.vendidas, color: "var(--tinta)" }, { de: id, a: "queda", valor: x.quedan, color: queda }, { de: id, a: "otras", valor: x.compradas - x.vendidas - x.quedan, color: "var(--taupe)" }));
    return rio({ columnas: [col0, col1, col2], flujos, W: 1200, H: 420, mIzq: 200, mDer: 170, gap: 10, id: "rio-prov" });
  }

  function perchero(p) {
    const xs = C.porTalla(p), max = Math.max(...xs.map((x) => x.v + x.q)), tc = C.tallaClave(p);
    const W = 520, H = 270, paso = W / (xs.length + 1), alto = 170;
    const cols = xs.map((x, k) => {
      const cx = paso * (k + 1), hv = (x.v / max) * alto, hq = (x.q / max) * alto, primero = tc.primero && x.t === tc.primero.t;
      return `<g class="c-percha ${primero ? "primero" : ""}">
        <path d="M${cx} 30 v8 M${cx - 26} 56 L${cx} 40 L${cx + 26} 56 Z" class="c-gancho" data-anim="funde" style="--i:${k}"/>
        <text x="${cx}" y="25" text-anchor="middle" class="c-talla">${x.t}</text>
        <rect x="${cx - 20}" y="58" width="40" height="${hv}" rx="3" class="c-vend" data-anim="cae" style="--i:${k}"/>
        <rect x="${cx - 20}" y="${60 + hv}" width="40" height="${hq}" rx="3" class="c-queda" data-anim="cae" style="--i:${k + 2}"/>
        <text x="${cx}" y="${74 + hv + hq}" text-anchor="middle" class="c-pn">${x.v} · ${x.q}</text>
        ${primero ? `<text x="${cx}" y="${92 + hv + hq}" text-anchor="middle" class="c-pnota">se acaba primero</text>` : ""}
      </g>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="c-perchero" role="img" aria-label="Vendidas y quedan por talla"><line x1="${paso * 0.4}" x2="${W - paso * 0.4}" y1="32" y2="32" class="c-barra" data-anim="dibuja" data-largo-auto/>${cols}</svg>`;
  }

  function hiloPago(p) {
    if (p.pactado == null || p.plazoReal == null) return `<p class="tenue" style="font-size:13.5px">${p.pactado ? `Pactado a ${p.pactado} días. ` : ""}El plazo real aparece con 2 o más comprobantes pagados.</p>`;
    const max = Math.max(p.pactado, p.plazoReal) + 15, X = (d) => 20 + (d / max) * 640, tarde = p.plazoReal > p.pactado;
    return `<svg viewBox="0 0 680 92" class="c-hilo" role="img" aria-label="Le pagas a ${p.plazoReal} días; lo pactado es ${p.pactado}">
      <line x1="20" x2="660" y1="46" y2="46" class="c-hilo-fondo"/>
      <line x1="20" x2="${X(p.plazoReal)}" y1="46" y2="46" class="c-hilo-real ${tarde ? "tarde" : ""}" data-anim="dibuja" data-largo-auto/>
      <circle cx="20" cy="46" r="5" class="c-hilo-ini"/><text x="20" y="76" text-anchor="middle" class="c-ht">llega la factura</text>
      <line x1="${X(p.pactado)}" x2="${X(p.pactado)}" y1="32" y2="60" class="c-hilo-pac"/><text x="${X(p.pactado)}" y="24" text-anchor="middle" class="c-ht">pactado · ${p.pactado} días</text>
      <circle cx="${X(p.plazoReal)}" cy="46" r="8" class="c-hilo-pago ${tarde ? "tarde" : ""}" data-anim="asoma" style="--i:12"/><text x="${X(p.plazoReal)}" y="80" text-anchor="middle" class="c-ht fuerte">le pagas · ${p.plazoReal} días</text>
    </svg>`;
  }

  function ficha(p) {
    const r = C.ritmo(p), d = C.decision(p), sc = C.sedeClave(p), tc = C.tallaClave(p), hall = C.hallazgosFicha(p);
    return `
      ${C.encabezado({ volver: true, titulo: p.nombre, frase: `RUC ${p.ruc} · ${p.contacto} · ${p.rubro}`, pie: `${C.chip("neutro", "Mercadería", { frase: true })}${p.marcas.map((x) => C.chip("neutro", x, { frase: true })).join("")}${p.pactado ? C.chip("neutro", `Crédito a ${p.pactado} días`) : ""}`, der: `<button class="btn btn-secundario">Editar</button><button class="btn btn-primario versal">${C.icon("plus", 16)} Orden de compra</button>` })}
      ${C.pasoSugerido(p)}
      <section class="tarjeta c-heroe" data-anim style="--i:2">
        <div class="c-heroe-cab">
          <div><span class="versalita">Adónde fue lo que le compraste</span>
            <h2>De ${C.cuenta(p.comprado)} prendas vendiste ${C.cuenta(p.vendidas)} y quedan ${C.cuenta(p.estantes)}.</h2>
            <p class="c-veredicto" style="--c:${C.tonoVar(d.tono)}"><b>${d.corto}.</b> ${d.frase}</p></div>
          <div class="c-heroe-cifras">
            <div style="--c:var(--tinta)"><b class="serif">${C.P(C.vendidoPct(p))}</b><span>vendido</span></div>
            <div style="--c:${r.lento ? "var(--ambar)" : "var(--g-neutro)"}"><b class="serif">${!r.juzgable ? "—" : Number.isFinite(r.agotar) ? Math.max(1, Math.round(r.agotar)) : "∞"}</b><span>semanas para lo que queda</span></div>
            <div style="--c:var(--pizarra)"><b class="serif">${C.P(C.costoReal(p))}</b><span>con costo real</span></div>
          </div>
        </div>
        <p class="desliza">Desliza el gráfico de lado para verlo entero →</p><div class="c-lienzo">${rioProveedor(p)}</div>
      </section>
      <div class="c-par">
        <div class="tarjeta c-mitad nuevo" data-anim style="--i:4"><span class="nuevo-marca">${C.nuevo()}</span>
          <span class="versalita">El perchero de tallas</span>
          <h3>${tc.primero && Number.isFinite(tc.primero.sem) ? `La ${tc.primero.t} se acaba primero` : "Ninguna talla se vende todavía"}</h3>
          <p class="tenue">${tc.sobra ? `Lo oscuro ya se vendió; lo claro sigue colgado. La ${tc.sobra.t} es la que más sobra.` : ""}</p>
          ${perchero(p)}
        </div>
        <div class="tarjeta c-mitad nuevo" data-anim style="--i:5"><span class="nuevo-marca">${C.nuevo()}</span>
          <span class="versalita">Las sedes</span>
          <h3>${sc.unica ? `Todo está en ${sc.unica.nombre}` : `Rinde en ${sc.mejor.nombre}`}</h3>
          <p class="tenue">${sc.unica ? "Las otras sedes no recibieron nada: prueba trasladar una parte antes de rebajar." : `De lo que llegó a ${sc.mejor.nombre} se vendió el ${C.P(sc.mejor.pct)}; en ${sc.peor.nombre}, el ${C.P(sc.peor.pct)}.`}</p>
          <div class="c-sedes">${C.porSede(p).map((x, k) => `<div class="c-sede">
            <span class="c-sedenom"><i style="--c:var(--sede-${x.s})"></i>${x.nombre}</span>
            ${x.llego ? `<span class="c-sedebar" data-anim="x" style="--i:${k};--w:${(x.llego / Math.max(...C.porSede(p).map((y) => y.llego))) * 100}%"><i style="flex:${x.v};--c:var(--sede-${x.s})"></i><i style="flex:${x.q};--c:color-mix(in srgb,var(--sede-${x.s}) 22%,var(--hueso))"></i></span>` : `<span class="tenue" style="font-size:12.5px">No llegó nada</span>`}
            <span class="num der">${x.llego ? `${x.v} de ${x.llego}` : ""}</span>
          </div>`).join("")}</div>
          <span class="leyenda"><span>Lo intenso: vendido · lo claro: queda en la sede</span></span>
        </div>
      </div>
      ${hall.length ? `<section class="c-bloque">${C.ts("Lo que quizá no ves", { cuenta: hall.length })}<div class="avisos">${hall.map((h, k) => C.aviso({ ...h, id: null }, k)).join("")}</div></section>` : ""}
      <section class="c-bloque">${C.ts("La plata con él")}<div class="tarjeta c-hilo-caja" data-anim><span class="versalita">El hilo del pago</span>${hiloPago(p)}</div>${C.bloquePlata(p)}</section>
      <section class="c-bloque">${C.ts("Prenda por prenda", { cuenta: p.prendas.length })}${C.tablaPrendas(p)}</section>
      <p class="nota">El río está en prendas: de dónde vinieron (Compras con su costo exacto o la carga inicial con su costo estimado), qué prenda eran y adónde fueron. Cuando Compras esté en uso, la cinta pizarra de la izquierda crece sola.</p>`;
  }

  // Pasar el mouse por un proveedor del río enciende sus cintas; y su fila de la tabla enciende lo mismo.
  function despues(raiz, e) {
    const svg = raiz.querySelector(".c-svg");
    if (!svg) return;
    const marcar = (id, si) => {
      svg.classList.toggle("enfocado", si);
      svg.querySelectorAll(`.c-cinta[data-de="${id}"],.c-cinta[data-a="${id}"]`).forEach((c) => c.classList.toggle("encendida", si));
      raiz.querySelectorAll(`[data-fila="${id}"]`).forEach((f) => f.classList.toggle("encendido", si));
    };
    svg.querySelectorAll(".c-nodo").forEach((g) => {
      const id = g.dataset.nodo;
      g.addEventListener("mouseenter", () => marcar(id, true)); g.addEventListener("mouseleave", () => marcar(id, false));
      g.addEventListener("focus", () => marcar(id, true)); g.addEventListener("blur", () => marcar(id, false));
      g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && g.dataset.ir) C.ir(g.dataset.ir); });
    });
    raiz.querySelectorAll("[data-fila]").forEach((f) => { f.addEventListener("mouseenter", () => marcar(f.dataset.fila, true)); f.addEventListener("mouseleave", () => marcar(f.dataset.fila, false)); });
    // Las cintas corren de izquierda a derecha una sola vez, cuando el río se ve.
    const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { svg.classList.add("corre"); io.disconnect(); } }), { threshold: 0.2 });
    io.observe(svg);
  }

  window.DIRS.c = { nombre: "C · El flujo", lema: "Adónde fue cada prenda que compraste: vendida, en estantes o quedándose.", lista, ficha, despues };
})();
