// Proveedores v2 (2026-10-26, tras la primera ronda): Felipe no podía ver a simple vista a quién le compra más y tenía que leer letra
// chica para lo importante. Dos reglas para las tres direcciones:
//   1. EL TAMAÑO es cuánto le compras (prendas o soles): lo más grande es a quien más le compras.
//   2. EL COLOR es el ritmo de venta, y con él qué hacer: verde = se agota en 6 semanas o menos (repón); pizarra = vende a su ritmo;
//      ámbar = tardaría 16 semanas o más (frena). Un color significa lo mismo en toda la pantalla: proveedores, tallas, sedes y prendas.
// Lo importante va en letra grande; la letra chica solo explica.
(function () {
  const C = window.C;
  window.MODO = window.MODO || "prendas"; // «prendas» o «soles»: con qué se mide «cuánto le compras»

  // ---------- Color = ritmo ----------
  const RITMOS = {
    rapido: { color: "var(--verde)", nombre: "Repón", largo: "Se vende rápido", regla: "Lo que queda se acaba en 6 semanas o menos" },
    medio: { color: "var(--pizarra)", nombre: "A su ritmo", largo: "Vende a su ritmo", regla: "Lo que queda se vende en 6 a 16 semanas" },
    lento: { color: "var(--g-baja)", sobre: "var(--tinta-fija)", nombre: "Frena", largo: "Rota lento", regla: "Tardaría 16 semanas o más en venderse" },
    nomide: { color: "var(--taupe)", nombre: "Aún no se sabe", largo: "Aún no se sabe", regla: "Le compraste menos de 20 prendas" },
  };
  const claseDe = (sem, juzgable = true) => (!juzgable ? "nomide" : !Number.isFinite(sem) || sem >= C.SEMANAS_STOCK_LARGO ? "lento" : sem <= C.SEMANAS_AGOTA ? "rapido" : "medio");
  const ritmoDe = (p) => { const r = C.ritmo(p); return claseDe(r.agotar, r.juzgable); };
  const semCorto = (sem) => (!Number.isFinite(sem) ? "∞" : sem >= 100 ? "100+" : String(Math.max(1, Math.round(sem))));
  const semDe = (p) => { const r = C.ritmo(p); return r.juzgable ? semCorto(r.agotar) : "—"; };
  const semSub = (q, v, semanas) => (q === 0 ? 0 : v === 0 ? Infinity : q / (v / semanas));
  C.claseDe = claseDe; C.RITMOS = RITMOS;

  // ---------- Cuánto le compras ----------
  const valor = (p) => (window.MODO === "soles" ? C.gasto(p) : p.comprado);
  const valorVendido = (p) => (window.MODO === "soles" ? p.vendidas * p.costo : p.vendidas);
  const fmtValor = (n) => (window.MODO === "soles" ? C.S(n) : C.N(n));
  const unidad = () => (window.MODO === "soles" ? "" : " prendas");

  // Lo que se dice aparte del color (solo lo que cambia la decisión), en letra legible.
  const avisosDe = (p) => {
    const xs = [], r = C.ritmo(p), m = C.margen(p);
    if (p.vencido > 0) xs.push({ tono: "rojo", t: `${C.S(p.vencido)} vencido` });
    if (r.agota && m == null) xs.push({ tono: "neutro", t: "Mira su margen antes" });
    if (m != null && m < C.MARGEN_BAJO_PCT) xs.push({ tono: "neutro", t: `Margen bajo · ${C.P(m)}` });
    if (p.plataParada >= C.PLATA_PARADA_MIN) xs.push({ tono: "neutro", t: `${C.S(p.plataParada)} parados` });
    if (p.atrasadas > 0) xs.push({ tono: "neutro", t: C.pl(p.atrasadas, "entrega atrasada", "entregas atrasadas") });
    return xs;
  };
  const marcas = (p) => avisosDe(p).map((x) => `<span class="v-marca ${x.tono}">${x.t}</span>`).join("");

  // ---------- La leyenda: es también el filtro ----------
  function leyenda() {
    const ps = window.PROVEEDORES, cuenta = (k) => ps.filter((p) => ritmoDe(p) === k).length;
    return `<div class="v-leyenda" data-anim>
      ${["rapido", "medio", "lento"].map((k) => `<button class="v-ley" data-filtro="${k}" style="--c:${RITMOS[k].color};--s:${RITMOS[k].sobre || "var(--crema)"}" aria-pressed="false">
        <i></i><span><b>${RITMOS[k].nombre}</b> <span class="v-ley-n">${cuenta(k)}</span><small>${RITMOS[k].regla}</small></span></button>`).join("")}
      <div class="v-modo" role="group" aria-label="Medir cuánto le compras en">
        <span>Tamaño según</span>
        <button data-modo="prendas" aria-pressed="${window.MODO === "prendas"}">Prendas</button><button data-modo="soles" aria-pressed="${window.MODO === "soles"}">Soles</button>
      </div>
    </div>`;
  }

  // ---------- A · Mosaico: el área es lo que le compras ----------
  function squarify(items, x, y, w, h) {
    const out = [], suma = (r) => r.reduce((a, i) => a + i.area, 0);
    const peor = (row, lado) => { const s = suma(row), mx = Math.max(...row.map((i) => i.area)), mn = Math.min(...row.map((i) => i.area)); return Math.max((lado * lado * mx) / (s * s), (s * s) / (lado * lado * mn)); };
    const poner = (row) => {
      const s = suma(row);
      if (w >= h) { const cw = s / h; let cy = y; row.forEach((i) => { const rh = i.area / cw; out.push({ ...i, x, y: cy, w: cw, h: rh }); cy += rh; }); x += cw; w -= cw; }
      else { const rh = s / w; let cx = x; row.forEach((i) => { const rw = i.area / rh; out.push({ ...i, x: cx, y, w: rw, h: rh }); cx += rw; }); y += rh; h -= rh; }
    };
    let row = []; const resto = [...items];
    while (resto.length) {
      const lado = Math.min(w, h), i = resto[0];
      if (!row.length || peor([...row, i], lado) <= peor(row, lado)) { row.push(i); resto.shift(); } else { poner(row); row = []; }
    }
    if (row.length) poner(row);
    return out;
  }
  function mosaico(ancho) {
    const ps = [...window.PROVEEDORES].sort((a, b) => valor(b) - valor(a));
    const alto = ancho < 700 ? 760 : Math.round(Math.min(620, Math.max(460, ancho * 0.42)));
    const total = ps.reduce((a, p) => a + valor(p), 0);
    const items = ps.map((p) => ({ p, area: (valor(p) / total) * ancho * alto }));
    const rects = ancho < 700 ? squarify(items, 0, 0, ancho, alto) : squarify(items, 0, 0, ancho, alto);
    return `<div class="v-mosaico" style="height:${alto}px">${rects.map((r, i) => {
      const p = r.p, k = ritmoDe(p), grande = r.w > 230 && r.h > 200, mediano = r.w > 130 && r.h > 168, chico = r.w > 64 && r.h > 64;
      const pct = (valorVendido(p) / valor(p)) * 100;
      return `<button class="v-tesela ${grande ? "grande" : mediano ? "mediano" : chico ? "chico" : "mini"} ${k}" data-ir="ficha/${p.id}" data-ritmo="${k}" data-anim="tesela"
        style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;--c:${RITMOS[k].color};--s:${RITMOS[k].sobre || "var(--crema)"};--i:${i}" title="${C.esc(p.nombre)}: ${fmtValor(valor(p))}${unidad()}, ${RITMOS[k].largo.toLowerCase()}">
        <span class="v-t-nom">${p.nombre}</span>
        ${mediano ? `<span class="v-t-valor"><b>${fmtValor(valor(p))}</b>${unidad()}</span>` : ""}
        ${mediano ? `<span class="v-t-ritmo"><b>${semDe(p)}</b> ${semDe(p) === "—" ? "" : "semanas"}<em>${RITMOS[k].nombre}</em></span>` : chico ? (k === "nomide" ? `<span class="v-t-ritmo mini">Aún no se sabe</span>` : `<span class="v-t-ritmo mini"><b>${semDe(p)}</b> sem</span>`) : ""}
        ${mediano ? `<span class="v-t-barra" aria-hidden="true"><i style="width:${pct}%"></i></span><span class="v-t-vend">${C.P(pct)} vendido</span>` : ""}
        ${grande ? `<span class="v-t-marcas">${marcas(p)}</span>` : ""}
      </button>`;
    }).join("")}</div>`;
  }

  // ---------- B · Barras: el largo es lo que le compras ----------
  function barras() {
    const ps = [...window.PROVEEDORES].sort((a, b) => valor(b) - valor(a)), max = valor(ps[0]);
    return `<div class="v-barras">${ps.map((p, i) => {
      const k = ritmoDe(p), largo = (valor(p) / max) * 80, vend = (valorVendido(p) / valor(p)) * 100;
      return `<button class="v-fila ${k}" data-ir="ficha/${p.id}" data-ritmo="${k}" data-anim style="--c:${RITMOS[k].color};--s:${RITMOS[k].sobre || "var(--crema)"};--i:${i}">
        <span class="v-f-nom"><b>${p.nombre}</b><span>${marcas(p)}</span></span>
        <span class="v-f-pista">
          <span class="v-f-barra" data-anim="x" style="--i:${i};width:${largo}%">
            <i class="vend" style="width:${vend}%"></i>
            ${largo > 14 ? `<span class="v-f-dentro">${fmtValor(valorVendido(p))} ${window.MODO === "soles" ? "vendido" : "vendidas"}</span>` : ""}
          </span>
          <span class="v-f-total"><b>${fmtValor(valor(p))}</b>${unidad()}</span>
        </span>
        <span class="v-f-sem"><b>${semDe(p)}</b><span>${semDe(p) === "—" ? "sin medir" : "semanas"}</span><em>${RITMOS[k].nombre}</em></span>
      </button>`;
    }).join("")}</div>`;
  }

  // ---------- C · Prendas en fila: cada figura son 10 prendas (o S/ 250) ----------
  const FIGURA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>';
  function figuras() {
    const ps = [...window.PROVEEDORES].sort((a, b) => valor(b) - valor(a));
    const cada = window.MODO === "soles" ? 250 : 10;
    return `<p class="v-clave"><span class="v-fig lleno" style="--c:var(--tinta)">${FIGURA}</span> = ${window.MODO === "soles" ? "S/ 250" : "10 prendas"} vendidas <span class="v-fig" style="--c:var(--tinta)">${FIGURA}</span> = ${window.MODO === "soles" ? "S/ 250" : "10 prendas"} que quedan</p>
    <div class="v-figuras">${ps.map((p, i) => {
      const k = ritmoDe(p), tot = Math.max(1, Math.round(valor(p) / cada)), llenas = Math.min(tot, Math.round(valorVendido(p) / cada));
      return `<button class="v-ffila ${k}" data-ir="ficha/${p.id}" data-ritmo="${k}" data-anim style="--c:${RITMOS[k].color};--s:${RITMOS[k].sobre || "var(--crema)"};--i:${i}">
        <span class="v-f-nom"><b>${p.nombre}</b><span>${marcas(p)}</span></span>
        <span class="v-ffig">${Array.from({ length: tot }, (_, j) => `<span class="v-fig ${j < llenas ? "lleno" : ""}" style="--j:${j}">${FIGURA}</span>`).join("")}
          <span class="v-f-total"><b>${fmtValor(valor(p))}</b>${unidad()}</span></span>
        <span class="v-f-sem"><b>${semDe(p)}</b><span>${semDe(p) === "—" ? "sin medir" : "semanas"}</span><em>${RITMOS[k].nombre}</em></span>
      </button>`;
    }).join("")}</div>`;
  }

  // ---------- La lista, común a las tres ----------
  const TITULO = {
    a: ["El mosaico de tus proveedores", "Más grande, más le compras. El color dice cómo se vende lo que le compraste."],
    b: ["A quién le compras más", "La barra es lo que le compraste; la parte fuerte, lo que ya vendiste. El color dice cómo se vende."],
    c: ["Lo que le compraste, prenda a prenda", "Cada figura son 10 prendas: llena si ya se vendió, vacía si sigue en el estante."],
  };
  function lista(dir) {
    const hall = C.hallazgosCartera();
    const visual = dir === "a" ? `<div class="v-mosaico-caja" data-mosaico></div>` : dir === "b" ? barras() : figuras();
    return `
      ${C.encabezado({ titulo: "Proveedores", frase: "A quién le compras más y cómo se vende lo que le compraste.", der: `<button class="btn btn-primario versal">${C.icon("plus", 16)} Nuevo proveedor</button>` })}
      ${leyenda()}
      <section class="tarjeta v-visual" data-anim style="--i:1">
        <div class="v-visual-cab"><h2>${TITULO[dir][0]}</h2><p>${TITULO[dir][1]}</p></div>
        ${visual}
        ${C.taller().replace('class="taller"', 'class="taller v-taller"')}
      </section>
      <section class="v-bloque">${C.ts("Lo que quizá no ves", { cuenta: hall.length })}<div class="avisos">${hall.map((h, k) => C.aviso(h, k)).join("")}</div></section>
      <section class="v-bloque">${C.ts("La plata con tus proveedores")}${cifrasPlata()}</section>`;
  }

  function cifrasPlata() {
    const ps = window.PROVEEDORES, deuda = ps.reduce((a, p) => a + p.deuda, 0), venc = ps.filter((p) => p.vencido > 0), atr = ps.filter((p) => p.atrasadas > 0);
    const favor = ps.reduce((a, p) => a + p.saldoFavor + (p.nosDebe?.monto || 0), 0);
    const g = (et, v, d, c) => `<div class="v-grande" data-anim style="--c:${c}"><span class="v-g-et"><i></i>${et}</span><b class="v-g-v">${v}</b><span class="v-g-d">${d}</span></div>`;
    return `<div class="v-grandes">
      ${g("Le debes", C.cuenta(deuda, "soles"), `a ${ps.filter((p) => p.deuda > 0).length} proveedores`, "var(--tinta)")}
      ${g("Ya venció", C.cuenta(venc.reduce((a, p) => a + p.vencido, 0), "soles"), venc.map((p) => p.nombre).join(", ") || "Nada", "var(--rojo)")}
      ${g("Entregas atrasadas", C.cuenta(atr.reduce((a, p) => a + p.atrasadas, 0)), atr.map((p) => p.nombre).join(", ") || "Ninguna", "var(--ambar)")}
      ${g("Te deben", C.cuenta(favor, "soles"), "Textiles Jacard", "var(--verde)")}
    </div>`;
  }

  // ---------- La ficha, común a las tres ----------
  function ficha(p) {
    const r = C.ritmo(p), k = ritmoDe(p), R = RITMOS[k], m = C.margen(p), d = C.decision(p);
    const titular = k === "rapido" ? (m == null ? "Repón, pero mira su margen" : "Vuelve a comprarle") : k === "lento" ? "Frena: no le pidas más" : k === "medio" ? "Vende a su ritmo" : "Todavía no se sabe";
    const hall = C.hallazgosFicha(p);
    const n = (et, v, sub, c = "var(--tinta)") => `<div class="v-num" style="--c:${c}"><span class="v-g-et"><i></i>${et}</span><b class="v-g-v">${v}</b>${sub ? `<span class="v-g-d">${sub}</span>` : ""}</div>`;
    const otras = C.otras(p);
    return `
      ${C.encabezado({ volver: true, titulo: p.nombre, frase: `${p.rubro} · ${p.contacto}`, pie: `${p.marcas.map((x) => C.chip("neutro", x, { frase: true })).join("")}${p.pactado ? C.chip("neutro", `Crédito a ${p.pactado} días`, { frase: true }) : ""}`, der: `<button class="btn btn-secundario">Editar</button><button class="btn btn-primario versal">${C.icon("plus", 16)} Orden de compra</button>` })}
      ${p.vencido > 0 || p.atrasadas > 0 || p.saldoFavor ? C.pasoSugerido(p) : ""}
      <section class="v-heroe ${k}" data-anim style="--c:${R.color};--s:${R.sobre || "var(--crema)"};--i:1">
        <div class="v-heroe-izq">
          <span class="v-heroe-et">${R.largo}</span>
          <h2>${titular}</h2>
          <p>${d.frase}</p>
          <div class="v-heroe-marcas">${marcas(p)}</div>
        </div>
        <div class="v-heroe-der">
          <b>${semDe(p)}</b>
          <span>${r.juzgable ? (Number.isFinite(r.agotar) ? "semanas para vender lo que le queda" : "no ha vendido nada") : "le compraste muy poco para medir"}</span>
        </div>
      </section>
      <section class="tarjeta v-compra" data-anim style="--i:2;--c:${R.color};--s:${R.sobre || "var(--crema)"}">
        <div class="v-nums">
          ${n("Le compraste", C.cuenta(p.comprado), C.S(C.gasto(p)) + (m == null ? " aprox." : ""))}
          ${n("Vendiste", C.cuenta(p.vendidas), C.P(C.vendidoPct(p)), R.color)}
          ${n("Quedan", C.cuenta(p.estantes), "en tus tiendas", `color-mix(in srgb,${R.color} 40%,var(--hueso))`)}
          ${n("Ganas", m == null ? "¿?" : C.cuenta(m, "pct"), m == null ? "costo por confirmar" : m < C.MARGEN_BAJO_PCT ? "margen bajo" : "de margen", m == null ? "var(--taupe)" : m < C.MARGEN_BAJO_PCT ? "var(--ambar)" : "var(--verde)")}
        </div>
        <div class="v-barra-grande" aria-label="${p.vendidas} vendidas y ${p.estantes} quedan de ${p.comprado}">
          <i class="vend" data-anim="x" style="flex:${p.vendidas}"><span>${C.vendidoPct(p) >= 12 ? `${C.N(p.vendidas)} vendidas` : ""}</span></i>
          <i class="queda" data-anim="x" style="flex:${p.estantes};--i:3"><span>${C.vendidoPct(p) >= 12 ? "" : `${C.N(p.vendidas)} vendidas · `}${C.N(p.estantes)} quedan</span></i>
          ${otras ? `<i class="otras" style="flex:${otras}" title="${otras} otras salidas"></i>` : ""}
        </div>
      </section>
      <div class="v-par">${tallasGrandes(p)}${sedesGrandes(p)}</div>
      <section class="v-bloque">${C.ts("Prenda por prenda", { cuenta: p.prendas.length })}${prendasGrandes(p)}</section>
      ${hall.length ? `<section class="v-bloque">${C.ts("Lo que quizá no ves", { cuenta: hall.length })}<div class="avisos">${hall.map((h, i) => C.aviso({ ...h, id: null }, i)).join("")}</div></section>` : ""}
      <section class="v-bloque">${C.ts("La plata con él")}${plataGrande(p)}</section>`;
  }

  // Tallas: cada columna con el color de SU ritmo, así se ve cuál se acaba (verde) y cuál sobra (ámbar).
  function tallasGrandes(p) {
    const r = C.ritmo(p), xs = C.porTalla(p).map((x) => ({ ...x, k: claseDe(x.sem, r.juzgable) })), max = Math.max(...xs.map((x) => x.v + x.q));
    return `<div class="tarjeta v-mitad nuevo" data-anim style="--i:3"><span class="nuevo-marca">${C.nuevo()}</span>
      <h3>Tallas</h3>
      <div class="v-tallas">${xs.map((x, i) => `<div class="v-talla" style="--c:${RITMOS[x.k].color};--s:${RITMOS[x.k].sobre || "var(--crema)"}">
        <span class="v-talla-txt"><b>${x.q}</b> quedan</span>
        <div class="v-talla-col"><i class="q" data-anim="y" style="--i:${i};height:${(x.q / max) * 100}%"></i><i class="v" data-anim="y" style="--i:${i + 2};height:${(x.v / max) * 100}%"></i></div>
        <b class="v-talla-t">${x.t}</b><span class="v-talla-r">${x.k === "rapido" ? "Se acaba" : x.k === "lento" ? "Sobra" : x.k === "medio" ? "A su ritmo" : "—"}</span>
        <span class="v-talla-txt">${x.v} vendidas</span></div>`).join("")}</div>
    </div>`;
  }
  function sedesGrandes(p) {
    const r = C.ritmo(p), xs = C.porSede(p), max = Math.max(...xs.map((x) => x.llego), 1);
    return `<div class="tarjeta v-mitad nuevo" data-anim style="--i:4"><span class="nuevo-marca">${C.nuevo()}</span>
      <h3>Sedes</h3>
      <div class="v-sedes">${xs.map((x, i) => { const k = x.llego ? claseDe(semSub(x.q, x.v, r.semanas), r.juzgable) : "nomide"; return `<div class="v-sede" style="--c:${RITMOS[k].color};--s:${RITMOS[k].sobre || "var(--crema)"}">
        <span class="v-sede-nom">${x.nombre}</span>
        ${x.llego ? `<span class="v-sede-pista"><span class="v-sede-barra" data-anim="x" style="--i:${i};width:${(x.llego / max) * 100}%"><i style="flex:${x.v}"></i><i class="q" style="flex:${x.q}"></i></span></span>
        <span class="v-sede-n"><b>${C.P(x.pct)}</b> vendido<em>${RITMOS[k].nombre}</em></span>` : `<span class="v-sede-vacia">No le llegó nada</span><span></span>`}
      </div>`; }).join("")}</div>
    </div>`;
  }
  function prendasGrandes(p) {
    const r = C.ritmo(p), max = Math.max(...p.prendas.map((x) => x.compradas));
    const xs = [...p.prendas].sort((a, b) => b.compradas - a.compradas);
    return `<div class="tarjeta v-prendas">${xs.map((x, i) => { const sem = semSub(x.quedan, x.vendidas, r.semanas), k = claseDe(sem, r.juzgable); return `<div class="v-prenda" data-anim style="--c:${RITMOS[k].color};--s:${RITMOS[k].sobre || "var(--crema)"};--i:${i}">
      <span class="v-prenda-nom">${x.ref}</span>
      <span class="v-prenda-pista"><span class="v-sede-barra" data-anim="x" style="--i:${i};width:${(x.compradas / max) * 100}%"><i style="flex:${x.vendidas}"></i><i class="q" style="flex:${x.quedan}"></i></span></span>
      <span class="v-prenda-n"><b>${x.vendidas}</b> de ${x.compradas}</span>
      <span class="v-prenda-sem"><b>${semCorto(sem)}</b> sem</span>
    </div>`; }).join("")}</div>`;
  }
  function plataGrande(p) {
    const tarde = p.plazoReal != null && p.pactado != null && p.plazoReal > p.pactado;
    const g = (et, v, d, c) => `<div class="v-grande" data-anim style="--c:${c}"><span class="v-g-et"><i></i>${et}</span><b class="v-g-v">${v}</b><span class="v-g-d">${d}</span></div>`;
    return `<div class="v-grandes">
      ${g("Le debes", C.cuenta(p.deuda, "soles"), p.deuda ? `${C.pl(p.facturas, "comprobante", "comprobantes")}` : "Estás al día", "var(--tinta)")}
      ${g("Ya venció", C.cuenta(p.vencido, "soles"), p.vencido ? "Págalo antes de pedirle más" : "Nada vencido", p.vencido ? "var(--rojo)" : "var(--verde)")}
      ${g("Le pagas a", p.plazoReal != null ? `${p.plazoReal} días` : "—", p.pactado ? `Quedaron en ${p.pactado} días${tarde ? " · pagas tarde" : ""}` : "Sin plazo pactado", tarde ? "var(--ambar)" : "var(--verde)")}
      ${g("Entregas atrasadas", C.cuenta(p.atrasadas), p.facturas ? `${p.completas} de ${p.facturas} llegaron completas` : "Sin comprobantes", p.atrasadas ? "var(--ambar)" : "var(--verde)")}
      ${p.saldoFavor || p.nosDebe ? g("Te debe", C.cuenta(p.saldoFavor + (p.nosDebe?.monto || 0), "soles"), [p.saldoFavor ? "nota de crédito" : "", p.nosDebe ? `${p.nosDebe.prendas} prendas por reponer` : ""].filter(Boolean).join(" · "), "var(--verde)") : ""}
    </div>`;
  }

  // ---------- Después de pintar: el mosaico se mide con el ancho real; la leyenda filtra; el modo cambia el tamaño ----------
  function despues(raiz, e) {
    if (e.vista !== "lista") return;
    const caja = raiz.querySelector("[data-mosaico]");
    const pintarMosaico = () => { if (caja) { caja.innerHTML = mosaico(caja.clientWidth); C.animar(caja); aplicarFiltro(); } };
    let filtro = null;
    const aplicarFiltro = () => {
      raiz.querySelectorAll("[data-ritmo]").forEach((el) => el.classList.toggle("apagado", !!filtro && el.dataset.ritmo !== filtro));
      raiz.querySelectorAll("[data-filtro]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.filtro === filtro));
    };
    raiz.querySelectorAll("[data-filtro]").forEach((b) => b.addEventListener("click", () => { filtro = filtro === b.dataset.filtro ? null : b.dataset.filtro; aplicarFiltro(); }));
    raiz.querySelectorAll("[data-modo]").forEach((b) => b.addEventListener("click", () => { window.MODO = b.dataset.modo; window.repintar(); }));
    pintarMosaico();
    if (caja) { let t; const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(pintarMosaico, 120); }); ro.observe(caja); }
  }

  window.DIRS = {
    a: { lema: "El área es cuánto le compras; el color, cómo se vende.", lista: () => lista("a"), ficha, despues },
    b: { lema: "La barra es cuánto le compras; el color, cómo se vende.", lista: () => lista("b"), ficha, despues },
    c: { lema: "Cada figura son 10 prendas; el color, cómo se vende.", lista: () => lista("c"), ficha, despues },
  };
})();
