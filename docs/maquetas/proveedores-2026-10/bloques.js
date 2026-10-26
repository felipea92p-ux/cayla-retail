// Bloques que las tres direcciones comparten tal cual (la plata y la tabla de prendas): lo que cambia entre direcciones es cómo se
// responde «¿a quién le vuelvo a comprar?», no cómo se ve una deuda.
(function () {
  const C = window.C;

  // La plata con un proveedor: deuda, vencido, plazo real contra el pactado, entregas, «Nos debe» y saldo a favor.
  C.bloquePlata = (p, i0 = 0) => {
    const tarde = p.plazoReal != null && p.pactado != null && p.plazoReal > p.pactado;
    const cifras = [
      C.cifra({ i: i0, et: "Le debes", c: p.deuda > 0 ? "ambar" : "verde", v: C.cuenta(p.deuda, "soles"), d: p.vencido > 0 ? `<span style="color:var(--rojo-p)">Vencido: ${C.S(p.vencido)} (${C.pl(p.facturasVencidas, "comprobante", "comprobantes")})</span>` : p.deuda > 0 ? "Nada vencido" : "Estás al día" }),
      C.cifra({ i: i0 + 1, et: "Pagas a", c: tarde ? "ambar" : p.plazoReal != null ? "verde" : null, v: p.plazoReal != null ? `${p.plazoReal} días` : "—", d: p.plazoReal != null ? `Pactado: ${p.pactado} días · basado en ${C.pl(p.pagadas, "comprobante pagado", "comprobantes pagados")}${C.pistaPlazo(p.plazoReal, p.pactado)}` : `${p.pactado ? `Pactado: ${p.pactado} días. ` : ""}Se calcula con 2 o más comprobantes pagados` }),
      C.cifra({ i: i0 + 2, et: "Entregas atrasadas", c: p.atrasadas > 0 ? "ambar" : "verde", v: C.cuenta(p.atrasadas), d: p.facturas ? `${p.completas} de ${C.pl(p.facturas, "comprobante llegó", "comprobantes llegaron")} completo${p.facturas === 1 ? "" : "s"}${p.diasEntrega ? ` · tarda ${p.diasEntrega} días en llegar` : ""}` : "Sin comprobantes todavía" }),
    ];
    if (p.nosDebe || p.saldoFavor) cifras.push(C.cifra({ i: i0 + 3, et: "Te debe", c: "verde", tono: "verde", v: C.cuenta((p.nosDebe?.monto || 0) + p.saldoFavor, "soles"), d: [p.saldoFavor ? `${C.S(p.saldoFavor)} a favor por una nota de crédito` : "", p.nosDebe ? `${C.pl(p.nosDebe.prendas, "prenda por reponer", "prendas por reponer")} (${C.S(p.nosDebe.monto)})` : ""].filter(Boolean).join(" · ") }));
    return `<div class="cifras">${cifras.join("")}</div>`;
  };

  // La plata con TODOS los proveedores (arriba de la lista): solo mercadería, como hoy.
  C.cifrasCartera = (i0 = 0) => {
    const ps = window.PROVEEDORES, deuda = ps.reduce((a, p) => a + p.deuda, 0), venc = ps.filter((p) => p.vencido > 0);
    const atr = ps.filter((p) => p.atrasadas > 0), gasto = ps.reduce((a, p) => a + C.gasto(p), 0), real = ps.reduce((a, p) => a + p.compras * p.costo, 0);
    return `<div class="cifras">
      ${C.cifra({ i: i0, et: "Le debes a proveedores", c: "ambar", v: C.cuenta(deuda, "soles"), d: `${ps.filter((p) => p.deuda > 0).length} proveedores con saldo` })}
      ${C.cifra({ i: i0 + 1, et: "Ya venció", c: "rojo", v: C.cuenta(venc.reduce((a, p) => a + p.vencido, 0), "soles"), d: venc.map((p) => p.nombre).join(", ") })}
      ${C.cifra({ i: i0 + 2, et: "Entregas atrasadas", c: "ambar", v: C.cuenta(atr.reduce((a, p) => a + p.atrasadas, 0)), d: atr.map((p) => `${p.nombre} (${p.atrasadas})`).join(", ") })}
      ${C.cifra({ i: i0 + 3, et: "Te deben", c: "verde", tono: "verde", v: C.cuenta(ps.reduce((a, p) => a + p.saldoFavor + (p.nosDebe?.monto || 0), 0), "soles"), d: "Textiles Jacard: nota de crédito y 3 prendas por reponer" })}
      ${C.cifra({ i: i0 + 4, et: "Con costo real", c: "pizarra", v: C.cuenta((real / gasto) * 100, "pct"), d: `de lo que compraste llegó por Compras<span style="display:block;margin-top:8px">${C.apilada([{ w: (real / gasto) * 100, c: "var(--pizarra)", t: "Con costo real" }], 6, i0 + 4)}</span>` })}
    </div>`;
  };

  // Prendas de un proveedor, cada una con su ritmo.
  C.tablaPrendas = (p, { max = 8 } = {}) => {
    const r = C.ritmo(p), cols = "minmax(0,1.6fr) 5rem minmax(7rem,1fr) 5rem 7.5rem";
    const filas = [...p.prendas].sort((a, b) => b.compradas - a.compradas).slice(0, max).map((x, i) => {
      const sem = x.quedan === 0 ? 0 : x.vendidas === 0 ? Infinity : x.quedan / (x.vendidas / r.semanas);
      const lectura = !Number.isFinite(sem) ? C.chip("ambar", "Sin ventas") : sem >= C.SEMANAS_STOCK_LARGO ? C.chip("ambar", `${Math.round(sem)} sem`) : sem <= C.SEMANAS_AGOTA ? C.chip("verde", `${Math.max(1, Math.round(sem))} sem`) : C.chip("neutro", `${Math.round(sem)} sem`);
      return `<div class="tabla-fila" data-anim style="--cols:${cols};--i:${i}">
        <span class="nombre"><b>${x.ref}</b><span>${p.marcas[0]}</span></span>
        <span class="der num">${x.compradas}</span>
        <span class="solo-ancha"><span class="num" style="font-size:13px">${x.vendidas} vendidas</span>${C.avance((x.vendidas / x.compradas) * 100, "var(--tinta)", 3)}</span>
        <span class="der num">${x.quedan}</span>
        <span class="der">${lectura}</span>
      </div>`;
    });
    const resto = p.prendas.length - max;
    return `<div class="tabla">
      <div class="tabla-fila tabla-enc" style="--cols:${cols}"><span>Prenda</span><span class="der">Compraste</span><span class="solo-ancha">Vendiste</span><span class="der">Quedan</span><span class="der">Lo que queda, en</span></div>
      ${filas.join("")}
      ${resto > 0 ? `<div class="tabla-fila" style="--cols:1fr"><span class="tenue" style="font-size:13px">y ${C.pl(resto, "prenda más", "prendas más")}, todas sin ventas</span></div>` : ""}
    </div>`;
  };
})();
