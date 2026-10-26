// Lo común a las tres direcciones: las reglas (copiadas de apps/web/lib, mismos umbrales), las piezas del sistema dibujadas en HTML
// (Chip, TarjetaCifra, BarraApilada, BarraAvance, EncabezadoPagina…), el movimiento de una sola vez y el ir y venir entre vistas.
(function () {
  const C = (window.C = {});

  // ---------- Formatos ----------
  C.N = (n) => Math.round(n).toLocaleString("es-PE");
  C.S = (n) => "S/ " + Math.round(n).toLocaleString("es-PE");
  C.P = (n) => (n == null ? "—" : Math.round(n) + " %");
  C.pl = (n, s, p) => `${C.N(n)} ${n === 1 ? s : p}`;
  C.esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // ---------- Reglas (apps/web/lib/proveedor-ritmo-reglas.ts y proveedor-prendas-reglas.ts) ----------
  C.DIAS_PARA_JUZGAR = 21; C.MIN_COMPRADAS = 20; C.SEMANAS_STOCK_LARGO = 16; C.SEMANAS_AGOTA = 6;
  C.MIN_VENDIDAS = 10; C.COSTO_REAL_MIN_PCT = 50; C.MARGEN_BAJO_PCT = 35; C.PLATA_PARADA_MIN = 500;

  C.ritmo = (p) => {
    const semanas = Math.max(1, p.dias / 7);
    const porSemana = p.vendidas / semanas;
    const agotar = p.estantes === 0 ? 0 : p.vendidas === 0 ? Infinity : p.estantes / porSemana;
    const juzgable = p.dias >= C.DIAS_PARA_JUZGAR && p.comprado >= C.MIN_COMPRADAS;
    return { semanas, porSemana, agotar, juzgable,
      lento: juzgable && p.estantes > 0 && agotar >= C.SEMANAS_STOCK_LARGO,
      agota: juzgable && p.vendidas > 0 && p.estantes > 0 && agotar <= C.SEMANAS_AGOTA };
  };
  C.semanasTxt = (r) => (Number.isFinite(r.agotar) ? `unas ${Math.round(r.agotar)} semanas` : "un tiempo que no se puede medir");
  C.costoReal = (p) => (p.compras / p.comprado) * 100;
  C.margen = (p) => (C.costoReal(p) >= C.COSTO_REAL_MIN_PCT ? ((p.precio - p.costo) / p.precio) * 100 : null);
  C.gasto = (p) => p.comprado * p.costo;
  C.otras = (p) => p.comprado - p.vendidas - p.estantes;
  C.vendidoPct = (p) => (p.vendidas / p.comprado) * 100;

  const conMargen = () => window.PROVEEDORES.filter((p) => C.margen(p) != null);
  C.margenPromedio = () => {
    const xs = conMargen(); const v = xs.reduce((a, p) => a + p.vendidas, 0);
    return xs.reduce((a, p) => a + C.margen(p) * p.vendidas, 0) / v;
  };

  // El veredicto de una palabra del ranking (veredictoDe): el ritmo primero.
  C.veredicto = (p) => {
    const r = C.ritmo(p), m = C.margen(p), real = C.costoReal(p);
    if (r.lento) return { tono: "ambar", texto: "Rota lento", porque: `Vender lo que le queda tardaría ${C.semanasTxt(r)} (${C.N(p.vendidas)} vendidas en ${Math.round(r.semanas)} semanas, ${C.N(p.estantes)} siguen en estantes).` };
    if (p.vendidas < C.MIN_VENDIDAS) return { tono: "pizarra", texto: "Pocas ventas", porque: `Solo ${p.vendidas} unidades vendidas: todavía no alcanza para juzgarlo.` };
    if (real < C.COSTO_REAL_MIN_PCT) return { tono: "pizarra", texto: "Costo por confirmar", porque: `Solo el ${Math.round(real)} % de lo que le compraste llegó por Compras con su costo real; el resto viene de la carga inicial. Vendiste el ${Math.round(C.vendidoPct(p))} % de lo comprado.` };
    if (m != null && m < C.MARGEN_BAJO_PCT) return { tono: "ambar", texto: "Margen bajo", porque: `Ganas ${Math.round(m)} % de lo que vendes: menos de ${C.MARGEN_BAJO_PCT} %.` };
    return { tono: "verde", texto: "Rinde", porque: `Vendiste el ${Math.round(C.vendidoPct(p))} % de lo comprado${m != null ? ` con ${Math.round(m)} % de margen` : ""}.` };
  };

  // La respuesta a «¿le vuelvo a comprar?» (la junta de «vuelve a comprarle», «se agota pronto» y «frena» de proveedor-analisis-reglas.ts).
  C.decision = (p) => {
    const r = C.ritmo(p), m = C.margen(p), v = C.veredicto(p);
    if (r.agota && m != null && p.vendidas >= C.MIN_VENDIDAS && m >= C.margenPromedio())
      return { clave: "repon", tono: "verde", corto: "Vuelve a comprarle", frase: `Lo que le queda se acaba en ${C.semanasTxt(r)}, y deja ${Math.round(m)} % de margen.` };
    if (r.agota) return { clave: "agota", tono: "verde", corto: "Se agota pronto", frase: `Se acaba en ${C.semanasTxt(r)}. Su margen está por confirmar: míralo antes de reponer.` };
    if (r.lento) return { clave: "frena", tono: "ambar", corto: "Frena", frase: Number.isFinite(r.agotar) ? `Vender lo que le queda tardaría ${C.semanasTxt(r)}.` : "No ha vendido nada en más de 3 semanas." };
    if (p.plataParada >= C.PLATA_PARADA_MIN) return { clave: "mira", tono: "ambar", corto: "Mira sus prendas paradas", frase: `${v.texto}, pero ${C.pl(p.prendasParadas, "prenda tiene", "prendas tienen")} ${C.S(p.plataParada)} parados.` };
    if (v.texto === "Margen bajo") return { clave: "mira", tono: "ambar", corto: "Renegocia el precio", frase: `Vende a buen ritmo, pero ganas solo ${Math.round(C.margen(p))} % de lo que vendes.` };
    if (v.texto === "Pocas ventas") return { clave: "mira", tono: "pizarra", corto: "Todavía no se sabe", frase: `Le compraste poco (${C.N(p.comprado)} unidades): con eso no se puede medir su ritmo.` };
    if (v.texto === "Costo por confirmar") return { clave: "mira", tono: "pizarra", corto: "Confirma su costo", frase: `Vende a su ritmo (${C.semanasTxt(r)} para lo que queda), pero su costo viene de la carga inicial.` };
    return { clave: "mira", tono: "verde", corto: "Va bien", frase: v.porque };
  };
  C.ORDEN_DECISION = ["repon", "agota", "mira", "frena"];

  // «¿Y ahora qué?» de la ficha (siguientePaso, proveedores-reglas.ts).
  C.paso = (p) => {
    if (p.vencido > 0) return { tono: "rojo", fuerte: `${C.S(p.vencido)} ya venció`, resto: ` en ${C.pl(p.facturasVencidas, "comprobante", "comprobantes")}. Conviene pagarlo antes de pedirle más.`, accion: "Pagar" };
    if (p.atrasadas > 0) return { tono: "ambar", fuerte: `${C.pl(p.atrasadas, "entrega atrasada", "entregas atrasadas")}.`, resto: ` Reclámal${p.atrasadas === 1 ? "a" : "as"} antes de que se acumule${p.atrasadas === 1 ? "" : "n"}.`, accion: "Ver entregas" };
    if (p.saldoFavor > 0) return { tono: "verde", fuerte: `Te debe ${C.S(p.saldoFavor)}`, resto: " por una nota de crédito. Se descuenta al pagar su próximo comprobante.", accion: "Ver saldo" };
    if (!p.facturas) return { tono: "neutro", fuerte: "Todavía sin comprobantes.", resto: " Registra su primera factura para ver cuánto le debes.", accion: null };
    return { tono: "verde", fuerte: "Todo al día.", resto: " Sin deuda vencida ni entregas atrasadas.", accion: null };
  };

  // Tallas y sedes (los datos nuevos): semanas por talla y la sede donde más se vende de lo que llegó.
  C.porTalla = (p) => {
    const r = C.ritmo(p);
    return Object.entries(p.tallas).map(([t, [v, q]]) => ({ t, v, q, sem: q === 0 ? 0 : v === 0 ? Infinity : q / (v / r.semanas) }));
  };
  C.tallaClave = (p) => {
    const xs = C.porTalla(p).filter((x) => x.q > 0);
    const primero = [...xs].sort((a, b) => a.sem - b.sem)[0], sobra = [...xs].sort((a, b) => b.sem - a.sem)[0];
    return { primero, sobra };
  };
  C.SEDES = { tru: "Trujillo", aqp: "Arequipa", lim: "Lima" };
  C.porSede = (p) => Object.entries(p.sedes).map(([s, [v, q]]) => ({ s, nombre: C.SEDES[s], v, q, llego: v + q, pct: v + q ? (v / (v + q)) * 100 : null }));
  C.sedeClave = (p) => {
    const xs = C.porSede(p).filter((x) => x.llego > 0).sort((a, b) => b.pct - a.pct);
    return { mejor: xs[0], peor: xs[xs.length - 1], unica: xs.length === 1 ? xs[0] : null };
  };

  // «Lo que quizá no ves» de la lista: las mismas reglas, en orden de importancia.
  C.hallazgosCartera = () => {
    const ps = window.PROVEEDORES, out = [];
    const repon = ps.filter((p) => C.decision(p).clave === "repon");
    repon.forEach((p) => out.push({ tono: "exito", titulo: `Vuelve a comprarle a ${p.nombre}`, texto: C.decision(p).frase, numeros: [`${C.N(p.vendidas)} vendidas de ${C.N(p.comprado)} en ${Math.round(C.ritmo(p).semanas)} semanas`, `${C.N(p.estantes)} siguen en estantes`, `Margen ${C.P(C.margen(p))}; el promedio de tus proveedores con costo real es ${C.P(C.margenPromedio())}`], regla: `Agota lo que le queda en ${C.SEMANAS_AGOTA} semanas o menos, con ${C.MIN_VENDIDAS} vendidas o más y margen igual o mayor al promedio.`, id: p.id }));
    const lentos = ps.filter((p) => C.ritmo(p).lento).sort((a, b) => C.ritmo(b).agotar - C.ritmo(a).agotar);
    if (lentos.length) {
      const u = lentos.reduce((a, p) => a + p.estantes, 0);
      out.push({ tono: "atencion", titulo: `Frena con ${lentos.length} proveedores: ${C.N(u)} prendas tardarían más de una temporada en venderse`, texto: `El más lento es ${lentos[0].nombre}: vender lo que le queda tardaría ${C.semanasTxt(C.ritmo(lentos[0]))}.`, numeros: lentos.map((p) => `${p.nombre}: ${C.N(p.estantes)} en estantes, ${C.semanasTxt(C.ritmo(p))}`), regla: `Vender lo que le queda tardaría ${C.SEMANAS_STOCK_LARGO} semanas o más al ritmo actual (con ${C.MIN_COMPRADAS} compradas o más y ${C.DIAS_PARA_JUZGAR} días en la tienda).`, id: lentos[0].id });
    }
    ps.filter((p) => C.decision(p).clave === "agota").forEach((p) => out.push({ tono: "info", titulo: `${p.nombre} se vende rápido: se agota en ${C.semanasTxt(C.ritmo(p))}`, texto: "Su margen está por confirmar (llegó por la carga inicial). Míralo antes de reponer.", numeros: [`${C.N(p.vendidas)} vendidas en ${Math.round(C.ritmo(p).semanas)} semanas`, `0 % llegó por Compras con su costo real`], regla: `Agota en ${C.SEMANAS_AGOTA} semanas o menos, pero sin costo real no se recomienda comprar.`, id: p.id }));
    ps.filter((p) => p.plataParada >= C.PLATA_PARADA_MIN).forEach((p) => out.push({ tono: "atencion", titulo: `${p.nombre}: ${C.pl(p.prendasParadas, "prenda lleva", "prendas llevan")} más de 3 semanas sin venderse, ${C.S(p.plataParada)} parados`, texto: "Antes de volver a comprarle, mira cuáles no rotan: puede ser el modelo, el precio o dónde está exhibida.", numeros: p.prendas.filter((x) => x.vendidas === 0).map((x) => `${x.ref}: ${x.quedan} sin vender, ${C.S(x.quedan * p.costo)}`), regla: `Prendas con 0 ventas y al menos ${C.DIAS_PARA_JUZGAR} días en la tienda; la plata cuenta solo lo que llegó por Compras.`, id: p.id }));
    const lasak = ps.find((p) => p.id === "lasak");
    out.push({ tono: "info", nuevo: true, titulo: `Todo lo de ${lasak.nombre} está en Lima`, texto: "Trujillo y Arequipa no recibieron ni una prenda. Antes de liquidar, prueba trasladar una parte.", numeros: C.porSede(lasak).map((x) => `${x.nombre}: llegaron ${x.llego}, vendidas ${x.v}`), regla: "Toda la mercadería de un proveedor que rota lento está en una sola sede.", id: lasak.id });
    return out.slice(0, 5);
  };

  // Lo que quizá no ves de UNA ficha.
  C.hallazgosFicha = (p) => {
    const out = [], r = C.ritmo(p), d = C.decision(p);
    if (r.lento) out.push({ tono: "atencion", titulo: `A este ritmo, vender lo que le queda tardaría ${C.semanasTxt(r)}`, texto: "Antes de pedirle más, mueve lo que hay: otra sede, otra vitrina o una rebaja.", numeros: [`${C.N(p.vendidas)} vendidas en ${Math.round(r.semanas)} semanas (${r.porSemana.toFixed(1).replace(".", ",")} por semana)`, `${C.N(p.estantes)} siguen en estantes`], regla: `Avisa desde ${C.SEMANAS_STOCK_LARGO} semanas.` });
    if (d.clave === "repon" || d.clave === "agota") out.push({ tono: d.clave === "repon" ? "exito" : "info", titulo: d.clave === "repon" ? "Vuelve a comprarle: se agota pronto y deja buen margen" : `Se agota en ${C.semanasTxt(r)} (margen por confirmar)`, texto: d.frase, numeros: [`${C.N(p.vendidas)} vendidas en ${Math.round(r.semanas)} semanas`, `${C.N(p.estantes)} siguen en estantes`], regla: `Se agota en ${C.SEMANAS_AGOTA} semanas o menos.` });
    if (p.plataParada >= C.PLATA_PARADA_MIN) out.push({ tono: "atencion", titulo: `${C.pl(p.prendasParadas, "prenda lleva", "prendas llevan")} más de 3 semanas sin venderse: ${C.S(p.plataParada)} parados`, texto: "Mira cuáles no rotan: puede ser el modelo, el precio o dónde está exhibida.", numeros: p.prendas.filter((x) => x.vendidas === 0).map((x) => `${x.ref}: ${x.quedan} sin vender`), regla: "0 ventas y 21 días o más en la tienda, con costo real." });
    const tc = C.tallaClave(p);
    if (tc.primero && tc.sobra && tc.primero.t !== tc.sobra.t && Number.isFinite(tc.primero.sem)) out.push({ tono: "info", nuevo: true, titulo: `La ${tc.primero.t} se acaba primero; la ${tc.sobra.t} es la que más sobra`, texto: "Si le vuelves a comprar, pide más de la talla que se acaba y menos de la que sobra.", numeros: C.porTalla(p).map((x) => `${x.t}: ${x.v} vendidas, ${x.q} quedan`), regla: "Semanas para vender lo que queda, talla por talla." });
    const sc = C.sedeClave(p);
    if (sc.unica) out.push({ tono: "info", nuevo: true, titulo: `Todo está en ${sc.unica.nombre}`, texto: "Las otras sedes no recibieron nada: prueba trasladar una parte antes de rebajar.", numeros: C.porSede(p).map((x) => `${x.nombre}: llegaron ${x.llego}, vendidas ${x.v}`), regla: "Toda la mercadería en una sola sede." });
    else if (sc.mejor && sc.peor && sc.mejor.pct - sc.peor.pct >= 15) out.push({ tono: "info", nuevo: true, titulo: `Rinde en ${sc.mejor.nombre}: vendió el ${C.P(sc.mejor.pct)} de lo que llegó`, texto: `En ${sc.peor.nombre} vendió solo el ${C.P(sc.peor.pct)}. Manda allá lo que sobra.`, numeros: C.porSede(p).map((x) => `${x.nombre}: ${x.v} de ${x.llego}`), regla: "Lo vendido sobre lo que llegó a cada sede." });
    return out.slice(0, 4);
  };

  // ---------- Íconos (lucide, grosor de fábrica) ----------
  const ICON = {
    "arrow-left": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    duda: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    idea: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    pausa: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    repetir: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    ojo: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    camion: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    billetera: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    tienda: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
    percha: '<path d="M12 7a2 2 0 1 0-2-2"/><path d="M12 7v1.5L3.5 15A2 2 0 0 0 5 18.5h14a2 2 0 0 0 1.5-3.5L12 8.5"/>',
    taller: '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
  };
  C.icon = (n, s = 16, extra = "") => `<svg aria-hidden="true" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${ICON[n] || ""}</svg>`;

  // ---------- Piezas ----------
  const tonoChip = { verde: "chip-verde", ambar: "chip-ambar", pizarra: "chip-pizarra", rojo: "chip-rojo", neutro: "chip-neutro" };
  C.chip = (tono, texto, o = {}) => `<span class="chip ${tonoChip[tono] || "chip-neutro"} ${o.frase ? "frase" : "punto"}" ${o.title ? `title="${C.esc(o.title)}"` : ""}>${texto}</span>`;
  C.nuevo = () => `<span class="chip chip-nuevo" title="Lo construye otra sesión en paralelo: aquí con datos inventados">Dato nuevo · en construcción</span>`;
  C.cuenta = (v, fmt = "num") => `<span class="num" data-cuenta="${v}" data-fmt="${fmt}">${fmt === "soles" ? C.S(v) : fmt === "pct" ? C.P(v) : C.N(v)}</span>`;
  C.cifra = ({ et, v, d = "", c, i = 0, tono = "" }) => `<div class="cifra" data-anim style="--i:${i}"><span class="et">${c ? `<i style="--c:var(--${c})"></i>` : ""}${et}</span><span class="v ${tono}">${v}</span><span class="d">${d}</span></div>`;
  C.apilada = (segs, alto = 8, i = 0) => `<div class="apilada" data-anim="x" style="--alto:${alto}px;--i:${i}">${segs.filter((s) => s.w > 0).map((s) => `<i style="--w:${s.w}%;--c:${s.c}" title="${C.esc(s.t || "")}"></i>`).join("")}</div>`;
  C.avance = (pct, c = "var(--tinta)", alto = 6) => `<div class="avance" style="--alto:${alto}px"><i data-anim="x" style="--w:${Math.max(0, Math.min(100, pct))}%;--c:${c}"></i></div>`;
  C.ts = (titulo, { cuenta, dato, extra = "" } = {}) => `<div class="ts"><h2>${titulo}${cuenta != null ? ` <span class="globito">${cuenta}</span>` : ""}</h2>${dato ? `<span class="dato">${dato}</span>` : ""}${extra}</div>`;
  C.encabezado = ({ sede = "Todas las tiendas", titulo, frase = "", der = "", volver = false, pie = "" }) => `
    <header class="cab" data-anim>
      <div class="cab-izq">
        <div class="linea-sede">${volver ? `<button class="volver" data-ir="lista" aria-label="Volver a Proveedores">${C.icon("arrow-left", 16)}</button>` : ""}<span>${sede} · lunes 26 de octubre</span>${volver ? `<span class="taupe">Proveedores</span>` : ""}</div>
        <h1>${titulo}</h1>${frase ? `<p class="frase">${frase}</p>` : ""}${pie ? `<div class="cab-pie">${pie}</div>` : ""}
      </div>
      ${der ? `<div class="cab-der">${der}</div>` : ""}
    </header>`;
  C.pasoSugerido = (p) => {
    const s = C.paso(p), col = { rojo: "var(--rojo)", ambar: "var(--ambar)", verde: "var(--verde)", neutro: "var(--taupe)" }[s.tono];
    return `<div class="paso" data-anim style="--i:1;--c:${col}"><span class="paso-n">1</span><p><b>${s.fuerte}</b>${s.resto}</p>${s.accion ? `<button class="btn btn-secundario">${s.accion} ${C.icon("arrow-right", 16)}</button>` : ""}</div>`;
  };
  // PistaPlazo: lo pactado como raya, lo real como punto.
  C.pistaPlazo = (real, pactado) => {
    if (real == null || pactado == null) return "";
    const max = Math.max(real, pactado) * 1.25, x = (n) => (n / max) * 100, tarde = real > pactado;
    return `<div class="pista" aria-label="Pagas a ${real} días; lo pactado es ${pactado}"><span class="pista-raya"></span><span class="pista-pactado" style="left:${x(pactado)}%"></span><span class="pista-real ${tarde ? "tarde" : ""}" data-anim="asoma" style="left:${x(real)}%"></span></div>`;
  };
  // «Lo que quizá no ves»: el aviso con su «¿Por qué?» (nunca solo con hover).
  C.aviso = (h, i = 0) => {
    const tono = { atencion: "ambar", exito: "verde", info: "pizarra" }[h.tono], ic = { atencion: "alerta", exito: "check", info: "idea" }[h.tono];
    return `<article class="aviso aviso-${tono}" data-anim style="--i:${i}">
      <span class="aviso-ic">${C.icon(ic, 16)}</span>
      <div class="aviso-cuerpo"><h3>${h.titulo}</h3><p>${h.texto}</p>
        <details><summary>¿Por qué?</summary><ul>${h.numeros.map((n) => `<li>${n}</li>`).join("")}</ul><p class="regla">${h.regla}</p></details>
        ${h.nuevo ? C.nuevo() : ""}</div>
      ${h.id ? `<button class="ver" data-ir="ficha/${h.id}">Ver ${C.icon("arrow-right", 14)}</button>` : ""}
    </article>`;
  };
  C.taller = () => {
    const t = window.TALLER, total = window.PROVEEDORES.reduce((a, p) => a + C.gasto(p), 0) + t.gasto;
    return `<p class="taller" data-anim>${C.icon("taller", 16)}<span><b>Producción propia</b> · ${t.nombre}: ${C.N(t.prendas)} prendas, ${C.P((t.gasto / total) * 100)} del gasto</span><span class="tenue">No entra a esta cuenta: es lo que hace el Taller, no un proveedor.</span></p>`;
  };
  C.tonoVar = (t) => ({ verde: "var(--verde)", ambar: "var(--ambar)", pizarra: "var(--pizarra)", rojo: "var(--rojo)" })[t] || "var(--taupe)";

  // ---------- Movimiento de una vez: entra al verse; las cifras cuentan al verse ----------
  C.animar = (raiz) => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("visto"); io.unobserve(e.target);
      if (e.target.dataset.cuenta != null && !reduce) contar(e.target);
    }), { threshold: 0.12 });
    raiz.querySelectorAll("[data-anim],[data-cuenta]").forEach((el) => io.observe(el));
    raiz.querySelectorAll("[data-largo-auto]").forEach((el) => { const L = Math.ceil(el.getTotalLength ? el.getTotalLength() : 1000); el.style.setProperty("--largo", L); });
  };
  function contar(el) {
    const fin = +el.dataset.cuenta, fmt = el.dataset.fmt, t0 = performance.now(), dur = 900;
    const f = (n) => (fmt === "soles" ? C.S(n) : fmt === "pct" ? C.P(n) : C.N(n));
    const paso = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = f(fin * e); if (k < 1) requestAnimationFrame(paso); };
    requestAnimationFrame(paso);
  }

  // ---------- Ir y venir: #a/lista · #b/ficha/lasak ----------
  C.estado = () => {
    const [dir = "a", vista = "lista", id = "deyner"] = location.hash.replace(/^#/, "").split("/");
    return { dir: "abc".includes(dir) && dir ? dir : "a", vista: vista === "ficha" ? "ficha" : "lista", id: window.PROVEEDORES.some((p) => p.id === id) ? id : "deyner" };
  };
  C.ir = (destino) => {
    const e = C.estado();
    if (destino === "lista") location.hash = `${e.dir}/lista`;
    else if (destino.startsWith("ficha/")) location.hash = `${e.dir}/ficha/${destino.slice(6)}`;
    else location.hash = destino;
  };
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-ir]");
    if (b) { ev.preventDefault(); C.ir(b.dataset.ir); }
  });
})();
