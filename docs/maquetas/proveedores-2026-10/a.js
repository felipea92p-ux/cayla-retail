// Dirección A · «Tres montones»: la respuesta primero. La lista ya viene repartida en lo que vas a hacer —vuelve a comprarle, mira antes,
// frena— y la ficha abre con la respuesta en una frase y las tres preguntas que la sostienen (¿se vende? ¿te deja plata? ¿cumple?).
(function () {
  const C = window.C;
  const MONTONES = [
    { clave: ["repon", "agota"], icono: "repetir", titulo: "Vuelve a comprarle", bajada: "Lo que le queda se acaba en 6 semanas o menos.", tono: "verde" },
    { clave: ["mira"], icono: "ojo", titulo: "Mira antes de pedirle", bajada: "Hay algo que revisar: su costo, su margen o prendas paradas.", tono: "pizarra" },
    { clave: ["frena"], icono: "pausa", titulo: "Frena", bajada: "Vender lo que le queda tardaría 16 semanas o más.", tono: "ambar" },
  ];

  const semanasCorto = (p) => {
    const r = C.ritmo(p);
    if (!r.juzgable) return { n: "—", t: "aún no se mide" };
    if (!Number.isFinite(r.agotar)) return { n: "∞", t: "no vendió nada" };
    return { n: Math.max(1, Math.round(r.agotar)), t: "semanas para vender lo que queda" };
  };

  function carta(p, i) {
    const d = C.decision(p), v = C.veredicto(p), s = semanasCorto(p), sc = C.sedeClave(p), tc = C.tallaClave(p);
    const banderas = [
      p.vencido > 0 ? C.chip("rojo", `${C.S(p.vencido)} vencido`) : "",
      p.atrasadas > 0 ? C.chip("ambar", C.pl(p.atrasadas, "entrega atrasada", "entregas atrasadas")) : "",
      p.saldoFavor || p.nosDebe ? C.chip("verde", "Te debe") : "",
    ].join("");
    const pista = sc.unica ? `Todo está en ${sc.unica.nombre}` : `Rinde en ${sc.mejor.nombre} (${C.P(sc.mejor.pct)})`;
    return `<button class="a-carta" data-ir="ficha/${p.id}" data-anim style="--i:${i}" aria-label="${C.esc(p.nombre)}: ${d.corto}">
      <span class="a-carta-cab"><span class="nombre"><b>${p.nombre}</b><span>${p.marcas.join(", ")} · ${p.rubro}</span></span>${C.chip(v.tono, v.texto, { title: v.porque })}</span>
      <span class="a-carta-cuerpo">
        <span class="a-frase">${d.clave === "agota" ? `<b>Mira el margen antes.</b> ` : ""}${d.frase}</span>
        <span class="a-reloj"><b class="num">${s.n}</b><span>${s.t}</span></span>
      </span>
      ${C.apilada([{ w: (p.vendidas / p.comprado) * 100, c: "var(--tinta)", t: "Vendidas" }, { w: (p.estantes / p.comprado) * 100, c: "var(--g-neutro)", t: "En estantes" }], 8, i)}
      <span class="leyenda"><span><span class="muestra" style="--c:var(--tinta)"></span><b>${C.N(p.vendidas)}</b> vendidas</span><span><span class="muestra" style="--c:var(--g-neutro)"></span><b>${C.N(p.estantes)}</b> quedan</span><span class="tenue">de ${C.N(p.comprado)}</span></span>
      <span class="a-carta-pie">
        <span class="a-dato"><span class="a-sede" style="--c:var(--sede-${(sc.unica || sc.mejor).s})"></span>${pista}</span>
        ${tc.primero && Number.isFinite(tc.primero.sem) ? `<span class="a-dato">${C.icon("percha", 14)}La ${tc.primero.t} se acaba primero</span>` : ""}
        ${banderas ? `<span class="a-banderas">${banderas}</span>` : ""}
      </span>
    </button>`;
  }

  function lista() {
    const ps = window.PROVEEDORES;
    const orden = (a, b) => C.gasto(b) - C.gasto(a);
    const frenaOrden = (a, b) => C.ritmo(b).agotar - C.ritmo(a).agotar;
    let i = 0;
    const columnas = MONTONES.map((m, k) => {
      const xs = ps.filter((p) => m.clave.includes(C.decision(p).clave)).sort(m.clave[0] === "frena" ? frenaOrden : orden);
      return `<section class="a-monton a-${m.tono}" aria-labelledby="mt-${k}">
        <header class="a-monton-cab" data-anim style="--i:${k}">
          <span class="a-monton-ic">${C.icon(m.icono, 20)}</span>
          <div><h2 id="mt-${k}">${m.titulo} <span class="globito">${xs.length}</span></h2><p>${m.bajada}</p></div>
        </header>
        <div class="a-cartas">${xs.map((p) => carta(p, ++i)).join("")}</div>
      </section>`;
    }).join("");
    return `
      ${C.encabezado({ titulo: "Proveedores", frase: "A quién le vuelves a comprar, a quién frenas y qué mirar antes de pedir. Cada proveedor está donde lo pone su ritmo de venta.", der: `<button class="btn btn-secundario versal">Mercadería · Servicios</button><button class="btn btn-primario versal">${C.icon("plus", 16)} Nuevo proveedor</button>` })}
      <div class="a-montones">${columnas}</div>
      <section class="a-bloque">${C.ts("Lo que quizá no ves", { cuenta: C.hallazgosCartera().length, dato: "avisos que salen de las mismas cifras" })}<div class="avisos">${C.hallazgosCartera().map((h, k) => C.aviso(h, k)).join("")}</div></section>
      <section class="a-bloque">${C.ts("La plata con tus proveedores", { dato: "solo mercadería" })}${C.cifrasCartera()}</section>
      ${C.taller()}
      <p class="nota">Un proveedor cae en «Vuelve a comprarle» si lo que le queda se vende en 6 semanas o menos; en «Frena», si tardaría 16 semanas o más. Lo de unidades vale para todo; lo de dinero (margen, plata parada) solo para lo que llegó por Compras con su costo real. Hoy casi todo vino por la carga inicial: por eso dice «Costo por confirmar» y no recomienda gastar a ciegas.</p>`;
  }

  // ---------- Ficha ----------
  const RESPUESTA = { repon: "Sí, vuelve a comprarle.", agota: "Se agota: mira el margen y repón.", mira: "Mira antes de pedirle.", frena: "Frena. No le pidas más por ahora." };

  function pregunta({ q, marca, tono, respuesta, detalle, extra = "", i }) {
    return `<div class="a-pregunta" data-anim style="--i:${i};--c:${C.tonoVar(tono)}">
      <span class="a-marca">${C.icon(marca, 18)}</span>
      <span class="versalita">${q}</span>
      <b class="a-respuesta">${respuesta}</b>
      <span class="a-det">${detalle}</span>${extra}
    </div>`;
  }

  function reglaSemanas(p) {
    // Una regla de 0 a 26+ semanas con las dos marcas que deciden (6 y 16) y el punto del proveedor.
    const r = C.ritmo(p), max = 26, x = (n) => (Math.min(n, max) / max) * 100;
    const pos = Number.isFinite(r.agotar) ? x(r.agotar) : 100;
    return `<span class="a-regla"><span class="a-regla-z v" style="width:${x(6)}%"></span><span class="a-regla-z a" style="left:${x(16)}%"></span>
      <span class="a-regla-m" style="left:${x(6)}%">6</span><span class="a-regla-m" style="left:${x(16)}%">16</span><span class="a-regla-m" style="left:100%">26+</span>
      <span class="a-regla-p" data-anim="asoma" style="left:${pos}%"></span></span>`;
  }

  function tallas(p) {
    const xs = C.porTalla(p), max = Math.max(...xs.map((x) => x.v + x.q)), tc = C.tallaClave(p);
    return `<div class="tarjeta a-mitad nuevo" data-anim style="--i:6">
      <span class="nuevo-marca">${C.nuevo()}</span>
      <span class="versalita">Las tallas</span>
      <h3>${tc.primero && Number.isFinite(tc.primero.sem) ? `La ${tc.primero.t} se acaba primero` : "Ninguna talla se vende todavía"}</h3>
      <p class="tenue">${tc.sobra ? `La ${tc.sobra.t} es la que más sobra. Si le vuelves a comprar, pide la curva al revés de lo que sobra.` : ""}</p>
      <div class="a-tallas">${xs.map((x, k) => `<div class="a-talla ${tc.primero && x.t === tc.primero.t ? "primero" : ""}">
        <div class="a-talla-col"><i data-anim="y" style="--i:${k};height:${(x.q / max) * 100}%;--c:var(--g-neutro)" title="Quedan ${x.q}"></i><i data-anim="y" style="--i:${k + 2};height:${(x.v / max) * 100}%;--c:var(--tinta)" title="Vendidas ${x.v}"></i></div>
        <b>${x.t}</b><span class="num">${x.v} · ${x.q}</span></div>`).join("")}</div>
      <span class="leyenda"><span><span class="muestra" style="--c:var(--tinta)"></span>vendidas</span><span><span class="muestra" style="--c:var(--g-neutro)"></span>quedan</span></span>
    </div>`;
  }

  function sedes(p) {
    const xs = C.porSede(p), sc = C.sedeClave(p);
    return `<div class="tarjeta a-mitad nuevo" data-anim style="--i:7">
      <span class="nuevo-marca">${C.nuevo()}</span>
      <span class="versalita">Las sedes</span>
      <h3>${sc.unica ? `Todo está en ${sc.unica.nombre}` : `Rinde en ${sc.mejor.nombre}`}</h3>
      <p class="tenue">${sc.unica ? "Las otras sedes no recibieron nada: prueba trasladar una parte antes de rebajar." : `Vendió el ${C.P(sc.mejor.pct)} de lo que llegó allí; en ${sc.peor.nombre}, el ${C.P(sc.peor.pct)}.`}</p>
      <div class="a-sedes">${xs.map((x, k) => `<div class="a-sedefila">
        <span class="a-sedenom"><span class="a-sede" style="--c:var(--sede-${x.s})"></span>${x.nombre}</span>
        ${x.llego ? C.apilada([{ w: (x.v / x.llego) * 100, c: `var(--sede-${x.s})`, t: "Vendidas" }], 10, k) : `<span class="tenue" style="font-size:12.5px">No llegó nada</span>`}
        <span class="num der">${x.llego ? `${C.P(x.pct)} <span class="tenue">de ${x.llego}</span>` : ""}</span>
      </div>`).join("")}</div>
    </div>`;
  }

  function ficha(p) {
    const d = C.decision(p), r = C.ritmo(p), m = C.margen(p), real = C.costoReal(p), tarde = p.plazoReal != null && p.pactado != null && p.plazoReal > p.pactado;
    const seVende = !r.juzgable ? { marca: "duda", tono: "pizarra", resp: "Aún no se mide", det: `Le compraste ${C.N(p.comprado)}: con menos de ${C.MIN_COMPRADAS} no se habla de ritmo.` }
      : r.agota ? { marca: "check", tono: "verde", resp: `Rápido · ${C.semanasTxt(r)}`, det: `${r.porSemana.toFixed(1).replace(".", ",")} por semana. Lo que queda se acaba pronto.` }
      : r.lento ? { marca: "alerta", tono: "ambar", resp: `Lento · ${C.semanasTxt(r)}`, det: `${C.N(p.vendidas)} vendidas en ${Math.round(r.semanas)} semanas; ${C.N(p.estantes)} siguen en estantes.` }
      : { marca: "check", tono: "verde", resp: `A su ritmo · ${C.semanasTxt(r)}`, det: `${r.porSemana.toFixed(1).replace(".", ",")} por semana.` };
    const plata = m == null ? { marca: "duda", tono: "pizarra", resp: "Por confirmar", det: `Solo el ${C.P(real)} llegó por Compras con su costo real; el resto es de la carga inicial.` }
      : m < C.MARGEN_BAJO_PCT ? { marca: "alerta", tono: "ambar", resp: `Poco · ${C.P(m)}`, det: `Menos de ${C.MARGEN_BAJO_PCT} %: renegocia el precio.` }
      : { marca: "check", tono: "verde", resp: `Sí · ${C.P(m)} de margen`, det: `Tu promedio es ${C.P(C.margenPromedio())}. ${p.plataParada ? `Ojo: ${C.S(p.plataParada)} parados.` : ""}` };
    // «¿Cumple?» es del proveedor (entregas); lo que TÚ le debes va en el paso sugerido y aquí solo como nota.
    const debes = p.vencido > 0 ? ` Ojo: tú le debes ${C.S(p.vencido)} vencido.` : "";
    const cumple = p.atrasadas > 0 ? { marca: "alerta", tono: "ambar", resp: `A medias · ${C.pl(p.atrasadas, "entrega atrasada", "entregas atrasadas")}`, det: `${p.completas} de ${p.facturas} llegaron completas.${debes}` }
      : p.facturas ? { marca: "check", tono: "verde", resp: "Sí · entrega completo", det: `${p.completas} de ${C.pl(p.facturas, "entrega llegó completa", "entregas llegaron completas")}${p.diasEntrega ? `, en ${p.diasEntrega} días` : ""}.${debes}` }
      : { marca: "duda", tono: "pizarra", resp: "Sin comprobantes", det: "Registra su primera factura para saberlo." };
    const hall = C.hallazgosFicha(p);
    return `
      ${C.encabezado({ volver: true, titulo: p.nombre, frase: `RUC ${p.ruc} · ${p.contacto} · ${p.rubro}`, pie: `${C.chip("neutro", "Mercadería", { frase: true })}${p.marcas.map((x) => C.chip("neutro", x, { frase: true })).join("")}${p.pactado ? C.chip("neutro", `Crédito a ${p.pactado} días`) : ""}`, der: `<button class="btn btn-secundario">Editar</button><button class="btn btn-primario versal">${C.icon("plus", 16)} Orden de compra</button>` })}
      ${C.pasoSugerido(p)}
      <section class="a-veredicto a-${d.tono}" data-anim style="--i:2">
        <div class="a-veredicto-izq">
          <span class="versalita">¿Le vuelves a comprar?</span>
          <h2>${RESPUESTA[d.clave]}</h2>
          <p>${d.frase}</p>
        </div>
        <div class="a-preguntas">
          ${pregunta({ i: 3, q: "¿Se vende?", marca: seVende.marca, tono: seVende.tono, respuesta: seVende.resp, detalle: seVende.det, extra: r.juzgable ? reglaSemanas(p) : "" })}
          ${pregunta({ i: 4, q: "¿Te deja plata?", marca: plata.marca, tono: plata.tono, respuesta: plata.resp, detalle: plata.det, extra: `<span class="a-mini">${C.apilada([{ w: real, c: "var(--pizarra)", t: "Con costo real" }], 6, 4)}<span class="tenue">${C.P(real)} con costo real</span></span>` })}
          ${pregunta({ i: 5, q: "¿Cumple?", marca: cumple.marca, tono: cumple.tono, respuesta: cumple.resp, detalle: cumple.det })}
        </div>
      </section>
      <section class="a-bloque">
        ${C.ts("Lo que le compraste", { cuenta: p.prendas.length, dato: `${C.S(C.gasto(p))} al costo${m == null ? " estimado" : ""}` })}
        <div class="tarjeta a-comprado" data-anim style="--i:5">
          <div class="a-comprado-cifras">
            <div><span class="versalita">Compraste</span><b class="serif">${C.cuenta(p.comprado)}</b></div>
            <div><span class="versalita">Vendiste</span><b class="serif">${C.cuenta(p.vendidas)}</b><span class="tenue">${C.P(C.vendidoPct(p))}</span></div>
            <div><span class="versalita">Quedan</span><b class="serif">${C.cuenta(p.estantes)}</b><span class="tenue">en estantes</span></div>
            ${C.otras(p) ? `<div><span class="versalita">Otras salidas</span><b class="serif">${C.cuenta(C.otras(p))}</b><span class="tenue">ajustes y devoluciones</span></div>` : ""}
          </div>
          ${C.apilada([{ w: C.vendidoPct(p), c: "var(--tinta)", t: "Vendidas" }, { w: (p.estantes / p.comprado) * 100, c: "var(--g-neutro)", t: "En estantes" }, { w: (C.otras(p) / p.comprado) * 100, c: "var(--taupe)", t: "Otras salidas" }], 14, 5)}
          <div class="a-origen">
            <span class="versalita">De dónde vino</span>
            ${C.apilada([{ w: real, c: "var(--pizarra)", t: "Por Compras" }, { w: 100 - real, c: "var(--hueso)", t: "Carga inicial" }], 6, 6)}
            <span class="leyenda"><span><span class="muestra" style="--c:var(--pizarra)"></span>Por Compras, costo exacto: <b>${C.N(p.compras)}</b></span><span><span class="muestra" style="--c:var(--hueso)"></span>De la carga inicial, costo estimado: <b>${C.N(p.comprado - p.compras)}</b></span></span>
          </div>
        </div>
      </section>
      <div class="a-par">${tallas(p)}${sedes(p)}</div>
      ${hall.length ? `<section class="a-bloque">${C.ts("Lo que quizá no ves", { cuenta: hall.length })}<div class="avisos">${hall.map((h, k) => C.aviso({ ...h, id: null }, k)).join("")}</div></section>` : ""}
      <section class="a-bloque">${C.ts("Prenda por prenda", { cuenta: p.prendas.length, dato: "lo que queda, en semanas al ritmo de hoy" })}${C.tablaPrendas(p)}</section>
      <section class="a-bloque">${C.ts("La plata con él")}${C.bloquePlata(p)}</section>
      <p class="nota">«Te deja plata» solo se responde con lo que llegó por Compras con su costo real (la mitad o más). Con la carga inicial el costo pudo distorsionarse, así que dice «por confirmar» en vez de recomendar comprar.</p>`;
  }

  window.DIRS = window.DIRS || {};
  window.DIRS.a = { nombre: "A · Tres montones", lema: "La respuesta primero: cada proveedor ya está en lo que vas a hacer con él.", lista, ficha };
})();
