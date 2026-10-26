// Dirección B · «El reloj del ritmo»: todo se mide en UNA unidad, las semanas que tardaría en venderse lo que queda (la regla única de
// proveedor-ritmo-reglas.ts). La lista es un mapa de ese reloj —a la izquierda se acaba, a la derecha se queda—; la ficha, la curva «si sigue así».
(function () {
  const C = window.C;
  const TOPE = 100; // la escala llega hasta 100 semanas; más allá es «100+»
  const lx = (s) => Math.log2(Math.max(1, Math.min(s, TOPE))) / Math.log2(TOPE); // 0..1, escala que estira lo corto
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const fechaEn = (semanas) => {
    const d = new Date(window.HOY + "T12:00:00"); d.setDate(d.getDate() + Math.round(semanas * 7));
    return d.getFullYear() === 2026 ? `el ${d.getDate()} de ${MESES[d.getMonth()]}` : `${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  };
  const tonoDe = (p) => C.tonoVar(C.decision(p).tono === "pizarra" ? "pizarra" : C.ritmo(p).lento ? "ambar" : C.ritmo(p).agota ? "verde" : "pizarra");

  // La regla chica de una fila: 1 → 100+ semanas, verde hasta 6, ámbar desde 16, el punto en su lugar.
  const regla = (s, i = 0) => {
    const pos = Number.isFinite(s) ? lx(s) * 100 : 100;
    const c = !Number.isFinite(s) || s >= 16 ? "var(--ambar)" : s <= 6 ? "var(--verde)" : "var(--tinta)";
    return `<span class="b-regla"><i class="b-z v" style="width:${lx(6) * 100}%"></i><i class="b-z a" style="left:${lx(16) * 100}%"></i>
      <i class="b-p" data-anim="asoma" style="--i:${i};left:${pos}%;--c:${c}"></i></span>`;
  };
  const semTxt = (s) => (!Number.isFinite(s) ? "sin ventas" : s >= TOPE ? "100+ sem" : `${Math.max(1, Math.round(s))} sem`);

  // ---------- El mapa ----------
  function mapa() {
    const W = 1200, H = 400, x0 = 40, x1 = W - 40, y0 = 70, base = 340;
    const X = (s) => x0 + lx(s) * (x1 - x0);
    const ps = window.PROVEEDORES.filter((p) => C.ritmo(p).juzgable).sort((a, b) => C.ritmo(a).agotar - C.ritmo(b).agotar);
    // Un enjambre sencillo: cada círculo, con su nombre al lado, se aleja del centro hasta no tocar a nadie (ni su texto al de otro).
    const puestos = [], cajas = [];
    const choca = (a) => cajas.some((b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0);
    ps.forEach((p) => {
      const r = 9 + Math.sqrt(p.comprado) * 1.15, x = X(C.ritmo(p).agotar);
      const lw = Math.max(p.nombre.length * 7.6, 150) + 10;
      const caja = (y, izq) => ({ x0: izq ? x - r - lw : x - r - 2, x1: izq ? x + r + 2 : x + r + lw, y0: y - Math.max(r, 17) - 3, y1: y + Math.max(r, 17) + 3 });
      const lados = x > W - 260 ? [true] : x - lw < x0 ? [false] : [false, true];
      let puesto = { y: 175, izq: lados[0] };
      buscar: for (let k = 0; k < 80; k++) {
        const cand = 175 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 6;
        if (cand < y0 + r - 10 || cand > base - r - 10) continue;
        for (const izq of lados) if (!choca(caja(cand, izq))) { puesto = { y: cand, izq }; break buscar; }
      }
      cajas.push(caja(puesto.y, puesto.izq)); puestos.push({ p, x, y: puesto.y, r, izq: puesto.izq });
    });
    const ticks = [1, 2, 4, 6, 10, 16, 26, 52, 100];
    const zonas = `
      <rect x="${x0}" y="${y0 - 40}" width="${X(6) - x0}" height="${base - y0 + 40}" rx="10" class="b-zona v" data-anim="funde" style="--i:1"/>
      <rect x="${X(16)}" y="${y0 - 40}" width="${x1 - X(16)}" height="${base - y0 + 40}" rx="10" class="b-zona a" data-anim="funde" style="--i:2"/>
      <text x="${x0 + 14}" y="${y0 - 16}" class="b-zt v" data-anim="funde" style="--i:3">SE ACABA PRONTO · REPÓN</text>
      <text x="${(X(6) + X(16)) / 2}" y="${y0 - 16}" text-anchor="middle" class="b-zt" data-anim="funde" style="--i:3">VA A SU RITMO</text>
      <text x="${x1 - 14}" y="${y0 - 16}" text-anchor="end" class="b-zt a" data-anim="funde" style="--i:3">ROTA LENTO · FRENA</text>`;
    const eje = `<line x1="${x0}" x2="${x1}" y1="${base}" y2="${base}" class="b-eje" data-anim="dibuja" data-largo-auto/>
      ${ticks.map((t, k) => `<g data-anim="funde" style="--i:${4 + k}"><line x1="${X(t)}" x2="${X(t)}" y1="${base - 4}" y2="${base + 4}" class="b-tick"/><text x="${X(t)}" y="${base + 22}" text-anchor="middle" class="b-tt">${t === 100 ? "100+" : t}</text></g>`).join("")}
      <text x="${x1}" y="${base + 44}" text-anchor="end" class="b-tt">semanas para vender lo que le queda, al ritmo de hoy</text>`;
    const circulos = puestos.map(({ p, x, y, r, izq }, k) => {
      const real = C.costoReal(p) >= C.COSTO_REAL_MIN_PCT, c = tonoDe(p);
      return `<g class="b-burbuja" tabindex="0" role="button" data-ir="ficha/${p.id}" data-burbuja="${p.id}" aria-label="${C.esc(p.nombre)}: ${semTxt(C.ritmo(p).agotar)}" style="--c:${c}">
        <g class="b-corre" style="--dx:${Math.max(x0 - x, -240)}px;--i:${k}">
          <circle cx="${x}" cy="${y}" r="${r}" class="${real ? "lleno" : "hueco"}"/>
          <text x="${x}" y="${y + 4}" text-anchor="middle" class="b-bn">${semTxt(C.ritmo(p).agotar).replace(" sem", "")}</text>
          <text x="${izq ? x - r - 8 : x + r + 8}" y="${y - 2}" text-anchor="${izq ? "end" : "start"}" class="b-nom">${p.nombre}</text>
          <text x="${izq ? x - r - 8 : x + r + 8}" y="${y + 14}" text-anchor="${izq ? "end" : "start"}" class="b-sub">${C.N(p.estantes)} quedan de ${C.N(p.comprado)}</text>
        </g></g>`;
    }).join("");
    const nojuz = window.PROVEEDORES.filter((p) => !C.ritmo(p).juzgable);
    return `<section class="tarjeta b-mapa" data-anim style="--i:1">
      <div class="b-mapa-cab">
        <div><span class="versalita">El reloj de tus proveedores</span><h2>¿Cuánto tardaría en venderse lo que le queda?</h2>
          <p class="tenue">Cada círculo es un proveedor y su número son esas semanas. Más grande, más le compraste.</p></div>
        <div class="leyenda b-ley"><span><i class="b-mue lleno"></i>Con costo real</span><span><i class="b-mue hueco"></i>Costo por confirmar</span></div>
      </div>
      <p class="desliza">Desliza el gráfico de lado para verlo entero →</p><div class="b-lienzo"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa de proveedores por semanas para vender lo que les queda">${zonas}${eje}${circulos}</svg></div>
      ${nojuz.length ? `<p class="b-nojuz">${C.icon("duda", 14)} Aún no se puede medir: ${nojuz.map((p) => `<button class="enlace" data-ir="ficha/${p.id}">${p.nombre}</button> (le compraste ${p.comprado})`).join(", ")}. Con menos de ${C.MIN_COMPRADAS} unidades no se habla de ritmo.</p>` : ""}
    </section>`;
  }

  function tabla() {
    const ps = [...window.PROVEEDORES].sort((a, b) => (C.ritmo(a).juzgable ? C.ritmo(a).agotar : 1e9) - (C.ritmo(b).juzgable ? C.ritmo(b).agotar : 1e9));
    const cols = "minmax(0,1.5fr) minmax(9rem,1.3fr) 4.5rem minmax(6rem,.9fr) 6rem 4.5rem 11rem 1rem";
    return `<div class="tabla b-tabla">
      <div class="tabla-fila tabla-enc" style="--cols:${cols}"><span>Proveedor</span><span>Lo que queda se vende en</span><span></span><span class="solo-ancha">Vendiste</span><span class="der solo-ancha">Gastaste</span><span class="der solo-ancha">Margen</span><span>Lectura</span><span></span></div>
      ${ps.map((p, i) => { const r = C.ritmo(p), v = C.veredicto(p); return `<button class="tabla-fila" data-ir="ficha/${p.id}" data-fila="${p.id}" data-anim style="--cols:${cols};--i:${i}">
        <span class="nombre"><b>${p.nombre}</b><span>${p.marcas.join(", ")} · ${C.P(C.costoReal(p))} con costo real</span></span>
        <span>${r.juzgable ? regla(r.agotar, i) : `<span class="tenue" style="font-size:12.5px">Aún no se mide</span>`}</span>
        <span class="num b-semtxt">${r.juzgable ? semTxt(r.agotar) : "—"}</span>
        <span class="solo-ancha"><span class="num" style="font-size:12.5px">${C.P(C.vendidoPct(p))} · ${p.vendidas} de ${p.comprado}</span>${C.avance(C.vendidoPct(p), "var(--tinta)", 3)}</span>
        <span class="der num solo-ancha">${C.S(C.gasto(p))}</span>
        <span class="der num solo-ancha">${C.P(C.margen(p))}</span>
        <span>${C.chip(v.tono, v.texto, { title: v.porque })}</span>
        <span class="flecha">${C.icon("chevron", 16)}</span>
      </button>`; }).join("")}
    </div>`;
  }

  function lista() {
    const hall = C.hallazgosCartera();
    return `
      ${C.encabezado({ titulo: "Proveedores", frase: "Lo que le queda a cada proveedor, medido en semanas. A la izquierda se acaba: repón. A la derecha se queda en el estante: frena.", der: `<button class="btn btn-secundario versal">Mercadería · Servicios</button><button class="btn btn-primario versal">${C.icon("plus", 16)} Nuevo proveedor</button>` })}
      ${mapa()}
      <div class="b-dos">
        <section class="b-bloque">${C.ts("Del que se acaba antes al que más tarda", { cuenta: window.PROVEEDORES.length })}${tabla()}${C.taller()}</section>
        <aside class="b-bloque b-lado">${C.ts("Lo que quizá no ves", { cuenta: hall.length })}<div class="b-avisos">${hall.map((h, k) => C.aviso(h, k)).join("")}</div></aside>
      </div>
      <section class="b-bloque">${C.ts("La plata con tus proveedores", { dato: "solo mercadería" })}${C.cifrasCartera()}</section>
      <p class="nota">El reloj usa la misma regla que el veredicto y los avisos: ventas desde que llegó la primera prenda, y lo que queda dividido por ese ritmo. Vale para lo que vino por Compras y por la carga inicial. Un círculo hueco tiene el costo por confirmar: ahí no se habla de margen.</p>`;
  }

  // ---------- Ficha: la curva «si sigue así» ----------
  function curva(p) {
    const r = C.ritmo(p), W = 900, H = 320, x0 = 56, x1 = W - 24, y0 = 24, base = H - 46;
    const inicio = p.vendidas + p.estantes, fin = Number.isFinite(r.agotar) ? r.semanas + r.agotar : Infinity;
    const vista = Math.min(Math.max(fin * 1.08, r.semanas + 18), 56); // se corta a 56 semanas: lo más lejano se dice con palabras
    const X = (s) => x0 + (Math.min(s, vista) / vista) * (x1 - x0), Y = (u) => base - (u / inicio) * (base - y0);
    const hoyX = X(r.semanas), corte = fin > vista;
    const yFinVista = corte ? Y(p.estantes - r.porSemana * (vista - r.semanas)) : Y(0);
    const pasos = 6, real = Array.from({ length: pasos + 1 }, (_, k) => { const s = (r.semanas * k) / pasos; return `${X(s).toFixed(1)},${Y(inicio - r.porSemana * s).toFixed(1)}`; });
    const area = `M${X(0)},${base} L${real.join(" L")} L${hoyX},${base} Z`;
    const z6 = X(r.semanas + 6), z16 = X(r.semanas + 16);
    const titular = !r.juzgable ? "Todavía no se puede medir su ritmo." : !Number.isFinite(r.agotar) ? "No ha vendido nada: lo que le queda no tiene fecha." : r.agota ? `Lo que le queda se acaba ${fechaEn(r.agotar)}.` : `A este ritmo, lo que le queda dura hasta ${fechaEn(r.agotar)}.`;
    const yTicks = [inicio, Math.round(inicio / 2), 0];
    return `<section class="tarjeta b-curva" data-anim style="--i:2">
      <div class="b-curva-cab"><span class="versalita">Si sigue así</span><h2>${titular}</h2>
        <p class="tenue">${r.juzgable ? `Vende ${r.porSemana.toFixed(1).replace(".", ",")} por semana desde que llegó (hace ${Math.round(r.semanas)} semanas). Le quedan ${C.N(p.estantes)}: ${C.semanasTxt(r)} más.` : `Le compraste ${p.comprado}: con menos de ${C.MIN_COMPRADAS} unidades no se habla de ritmo.`}</p></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Unidades en estantes semana a semana y lo que vendría si sigue así">
        ${z6 < x1 ? `<rect x="${hoyX}" y="${y0}" width="${Math.min(z6, x1) - hoyX}" height="${base - y0}" class="b-zona v" data-anim="funde" style="--i:2"/>` : ""}
        ${z16 < x1 ? `<rect x="${z16}" y="${y0}" width="${x1 - z16}" height="${base - y0}" class="b-zona a" data-anim="funde" style="--i:3"/>` : ""}
        ${z6 < x1 ? `<text x="${hoyX + 8}" y="${base - 10}" class="b-zt v" data-anim="funde" style="--i:4">SE ACABA PRONTO</text>` : ""}
        ${z16 < x1 ? `<text x="${x1 - 8}" y="${base - 10}" text-anchor="end" class="b-zt a" data-anim="funde" style="--i:4">ROTA LENTO</text>` : ""}
        ${yTicks.map((u) => `<g><line x1="${x0}" x2="${x1}" y1="${Y(u)}" y2="${Y(u)}" class="b-guia"/><text x="${x0 - 10}" y="${Y(u) + 4}" text-anchor="end" class="b-tt">${C.N(u)}</text></g>`).join("")}
        <path d="${area}" class="b-area" data-anim="funde" style="--i:3"/>
        <polyline points="${real.join(" ")}" class="b-linea" data-anim="dibuja" data-largo-auto style="--i:1"/>
        ${r.juzgable && r.porSemana > 0 ? `<line x1="${hoyX}" y1="${Y(p.estantes)}" x2="${corte ? x1 : X(fin)}" y2="${yFinVista}" class="b-proy" data-anim="funde" style="--i:16"/>` : ""}
        <line x1="${hoyX}" x2="${hoyX}" y1="${y0}" y2="${base}" class="b-hoy"/>
        <text x="${hoyX}" y="${base + 20}" text-anchor="middle" class="b-tt b-hoyt">hoy</text>
        <circle cx="${hoyX}" cy="${Y(p.estantes)}" r="6" class="b-punto" data-anim="asoma" style="--i:8"/>
        <text x="${hoyX + 12}" y="${Y(p.estantes) < y0 + 30 ? Y(p.estantes) + 26 : Y(p.estantes) - 10}" class="b-cifra">${C.N(p.estantes)} quedan</text>
        ${r.juzgable && Number.isFinite(fin) && !corte ? `<circle cx="${X(fin)}" cy="${Y(0)}" r="6" class="b-fin" data-anim="asoma" style="--i:16"/><text x="${X(fin)}" y="${Y(0) - 14}" text-anchor="middle" class="b-cifra">se acaba</text>` : ""}
        ${corte && Number.isFinite(fin) ? `<text x="${x1}" y="${yFinVista - 12}" text-anchor="end" class="b-cifra">sigue hasta la semana ${Math.round(fin)} →</text>` : ""}
        <text x="${x0}" y="${base + 20}" class="b-tt">llegó</text>
        <text x="${x1}" y="${base + 38}" text-anchor="end" class="b-tt">semanas</text>
      </svg>
      <div class="leyenda"><span><span class="muestra" style="--c:var(--tinta)"></span>En estantes hasta hoy</span><span><span class="muestra b-mue-proy"></span>Si sigue así</span></div>
    </section>`;
  }

  function relojes(titulo, filas, frase, nuevo = true) {
    return `<div class="tarjeta b-relojes ${nuevo ? "nuevo" : ""}" data-anim style="--i:5">
      ${nuevo ? `<span class="nuevo-marca">${C.nuevo()}</span>` : ""}
      <span class="versalita">${titulo}</span><h3>${frase}</h3>
      <div class="b-filas">${filas.map((f, k) => `<div class="b-rfila"><span class="b-rnom">${f.punto ? `<i style="--c:${f.punto}"></i>` : ""}${f.nombre}</span>${f.vacio ? `<span class="tenue" style="font-size:12.5px">${f.vacio}</span><span></span>` : `${regla(f.sem, k)}<span class="num b-semtxt">${semTxt(f.sem)}</span>`}<span class="num tenue b-rdet">${f.det}</span></div>`).join("")}</div>
    </div>`;
  }

  function ficha(p) {
    const r = C.ritmo(p), m = C.margen(p), tc = C.tallaClave(p), sc = C.sedeClave(p), hall = C.hallazgosFicha(p);
    const tallas = C.porTalla(p).map((x) => ({ nombre: x.t, sem: x.sem, det: `${x.v} vendidas · ${x.q} quedan` }));
    const sedes = C.porSede(p).map((x) => ({ nombre: x.nombre, punto: `var(--sede-${x.s})`, sem: x.q === 0 ? 0 : x.v === 0 ? Infinity : x.q / (x.v / r.semanas), det: x.llego ? `${x.v} de ${x.llego}` : "", vacio: x.llego ? "" : "No llegó nada" }));
    const lado = [
      C.cifra({ i: 3, et: "Vendes por semana", c: r.lento ? "ambar" : r.agota ? "verde" : null, v: `${r.porSemana.toFixed(1).replace(".", ",")}`, d: `${C.N(p.vendidas)} en ${Math.round(r.semanas)} semanas` }),
      C.cifra({ i: 4, et: "Compraste", v: C.cuenta(p.comprado), d: `${C.N(p.compras)} por Compras · ${C.N(p.comprado - p.compras)} de la carga inicial` }),
      C.cifra({ i: 5, et: "Margen", c: m == null ? "pizarra" : m < C.MARGEN_BAJO_PCT ? "ambar" : "verde", v: m == null ? "Por confirmar" : C.cuenta(m, "pct"), d: m == null ? `Solo el ${C.P(C.costoReal(p))} tiene costo real` : `Tu promedio: ${C.P(C.margenPromedio())}` }),
      C.cifra({ i: 6, et: "Lectura", v: `<span style="font-size:22px">${C.decision(p).corto}</span>`, d: C.veredicto(p).porque }),
    ].join("");
    return `
      ${C.encabezado({ volver: true, titulo: p.nombre, frase: `RUC ${p.ruc} · ${p.contacto} · ${p.rubro}`, pie: `${C.chip("neutro", "Mercadería", { frase: true })}${p.marcas.map((x) => C.chip("neutro", x, { frase: true })).join("")}${p.pactado ? C.chip("neutro", `Crédito a ${p.pactado} días`) : ""}`, der: `<button class="btn btn-secundario">Editar</button><button class="btn btn-primario versal">${C.icon("plus", 16)} Orden de compra</button>` })}
      ${C.pasoSugerido(p)}
      <div class="b-heroe">${curva(p)}<div class="b-lado-cifras">${lado}</div></div>
      <div class="b-par">
        ${relojes("Talla por talla", tallas, tc.primero && Number.isFinite(tc.primero.sem) ? `La ${tc.primero.t} se acaba primero; la ${tc.sobra.t} es la que más tarda` : "Ninguna talla tiene ritmo todavía")}
        ${relojes("Sede por sede", sedes, sc.unica ? `Todo está en ${sc.unica.nombre}` : `En ${sc.mejor.nombre} se vende más rápido`)}
      </div>
      ${hall.length ? `<section class="b-bloque">${C.ts("Lo que quizá no ves", { cuenta: hall.length })}<div class="avisos">${hall.map((h, k) => C.aviso({ ...h, id: null }, k)).join("")}</div></section>` : ""}
      <section class="b-bloque">${C.ts("Prenda por prenda", { cuenta: p.prendas.length, dato: "cada una con su reloj" })}${C.tablaPrendas(p)}</section>
      <section class="b-bloque">${C.ts("La plata con él")}${C.bloquePlata(p)}</section>
      <p class="nota">La curva es la misma cuenta del veredicto: ventas desde que llegó la primera prenda. Si las ventas cambian, la curva cambia con ellas; no es una promesa, es «si sigue así».</p>`;
  }

  // Pasar el mouse por un círculo enciende su fila, y al revés.
  function despues(raiz, e) {
    if (e.vista !== "lista") return;
    const marcar = (id, si) => raiz.querySelectorAll(`[data-fila="${id}"],.b-burbuja[data-burbuja="${id}"]`).forEach((el) => el.classList.toggle("encendido", si));
    raiz.querySelectorAll(".b-burbuja,[data-fila]").forEach((el) => {
      const id = el.dataset.burbuja || el.dataset.fila;
      el.addEventListener("mouseenter", () => marcar(id, true)); el.addEventListener("mouseleave", () => marcar(id, false));
      el.addEventListener("focus", () => marcar(id, true)); el.addEventListener("blur", () => marcar(id, false));
      el.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && el.classList.contains("b-burbuja")) C.ir(`ficha/${id}`); });
    });
    raiz.querySelectorAll(".b-corre").forEach((g) => g.classList.add("listo"));
  }

  window.DIRS.b = { nombre: "B · El reloj del ritmo", lema: "Una sola medida: las semanas que tardaría en venderse lo que queda.", lista, ficha, despues };
})();
