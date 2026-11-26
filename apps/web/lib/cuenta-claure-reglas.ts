import { fechaCorta, soles } from "./compras-reglas";
import { deAliada, deAliadaEnTodo, QUIEN_CLAURE, type Quien } from "./empresas-aliadas-reglas";
import type { ChipRespuesta } from "./dinero-telar-reglas";

// Finanzas ▸ Cuentas y dinero ▸ CLAURE (ADR-0560, actividad 1): lógica pura, sin servidor ni navegador. La base calcula qué parte de lo que
// se cobró en cuentas de CAYLA es de CLAURE (`fn_claure_cuenta`, 20261029004000); aquí solo se leen sus filas, se suman y se explican.
// El saldo NO se guarda: sale de sumar estas filas y restar los pagos a CLAURE (`fn_claure_pagos`, actividad 2; principio 4).

export type OrigenClaure = "venta" | "devolucion" | "cambio";

export type FilaClaure = {
  /** El día, en hora de Lima (`aaaa-mm-dd`). */
  fecha: string;
  origen: OrigenClaure;
  medio: string;
  cuentaId: string | null;
  cuentaNombre: string | null;
  ubicacionId: string | null;
  /** Cuántos pagos (ventas) o devoluciones se juntaron en la fila. */
  nPagos: number;
  /** Lo cobrado de CLAURE (+), lo devuelto (−) o, en un cambio, su diferencia. */
  monto: number;
  /** El IGV que va incluido en `monto` (nulo en un cambio). */
  igv: number | null;
  /** La comisión estimada del POS; 0 si el medio no lleva; nula si debería llevar y no hay tarifa. */
  comision: number | null;
  /** Falso en un cambio: se lista para revisarlo, pero no entra al saldo. */
  contado: boolean;
};

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numeroONulo = (v: unknown): number | null => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
const redondear = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function leerFilaClaure(r: Record<string, unknown>): FilaClaure {
  return {
    fecha: String(r.fecha ?? "").slice(0, 10),
    origen: r.origen === "devolucion" || r.origen === "cambio" ? r.origen : "venta",
    medio: String(r.medio ?? ""),
    cuentaId: r.cuenta_id ? String(r.cuenta_id) : null,
    cuentaNombre: r.cuenta_nombre ? String(r.cuenta_nombre) : null,
    ubicacionId: r.ubicacion_id ? String(r.ubicacion_id) : null,
    nPagos: numero(r.n_pagos),
    monto: numero(r.monto),
    igv: numeroONulo(r.igv),
    comision: numeroONulo(r.comision),
    contado: r.contado === true,
  };
}

/** Un gasto que CAYLA pagó y que en parte es de CLAURE (`fn_claure_gastos`, 20261029044000): su parte baja lo que se le debe a Claudia. */
export type GastoClaure = {
  gastoId: string;
  /** El día del gasto (`aaaa-mm-dd`). */
  fecha: string;
  ubicacionId: string | null;
  categoria: string;
  categoriaNombre: string;
  descripcion: string;
  /** Lo que CAYLA pagó en total. */
  montoTotal: number;
  /** Qué parte de esa categoría es de CLAURE (0 a 100). */
  pct: number;
  /** La parte de CLAURE: monto pagado × su %. */
  parte: number;
};

export function leerGastoClaure(r: Record<string, unknown>): GastoClaure {
  return {
    gastoId: String(r.gasto_id ?? ""),
    fecha: String(r.fecha ?? "").slice(0, 10),
    ubicacionId: r.ubicacion_id ? String(r.ubicacion_id) : null,
    categoria: String(r.categoria ?? ""),
    categoriaNombre: String(r.categoria_nombre ?? r.categoria ?? ""),
    descripcion: String(r.descripcion ?? ""),
    montoTotal: numero(r.monto_total),
    pct: numero(r.pct),
    parte: numero(r.parte),
  };
}

/** Un pago a CLAURE: plata que salió de un banco de CAYLA para pagarle a Claudia (`movimientos_dinero.tipo = 'pago_claure'`). */
export type PagoClaure = {
  id: string;
  /** El día del pago (`aaaa-mm-dd`). */
  fecha: string;
  cuentaId: string | null;
  /** El banco de donde salió. */
  cuentaNombre: string | null;
  monto: number;
  /** El n.º de operación, si se anotó. */
  referencia: string | null;
  registradoPor: string | null;
};

export function leerPagoClaure(r: Record<string, unknown>): PagoClaure {
  return {
    id: String(r.id ?? ""),
    fecha: String(r.fecha ?? "").slice(0, 10),
    cuentaId: r.cuenta_id ? String(r.cuenta_id) : null,
    cuentaNombre: r.cuenta_nombre ? String(r.cuenta_nombre) : null,
    monto: numero(r.monto),
    referencia: r.referencia ? String(r.referencia) : null,
    registradoPor: r.registrado_por ? String(r.registrado_por) : null,
  };
}

/**
 * Una cuenta de otra empresa (ADR-0638, `fn_cuentas_de_otras_empresas`): la plata que llega ahí no es de CAYLA, así que se muestra aparte y nunca suma.
 * `ultimoCobro` nulo = todavía no llegó ninguno.
 */
export type CuentaOtraEmpresa = { id: string; nombre: string; empresa: string; cobradoMes: number; cobradoTotal: number; ultimoCobro: string | null };

export function leerCuentaOtraEmpresa(r: Record<string, unknown>): CuentaOtraEmpresa {
  return {
    id: String(r.id ?? ""),
    nombre: String(r.nombre ?? ""),
    empresa: String(r.empresa ?? ""),
    cobradoMes: numero(r.cobrado_mes),
    cobradoTotal: numero(r.cobrado_total),
    ultimoCobro: r.ultimo_cobro ? String(r.ultimo_cobro).slice(0, 10) : null,
  };
}

/** La nota de Dónde está: de quién es, que no suma, y cuánto entró este mes. */
export function notaCuentaOtraEmpresa(c: CuentaOtraEmpresa): string {
  return `${c.nombre}: de ${c.empresa}, no suma. Este mes ${soles(c.cobradoMes)}.`;
}

export type ResumenClaure = {
  /** Lo que las ventas de CLAURE cobraron en cuentas de CAYLA. */
  cobrado: number;
  /** Lo devuelto desde cuentas de CAYLA (positivo). */
  devuelto: number;
  /** La comisión estimada del POS, de los cobros que tienen tarifa. */
  comision: number;
  /** Cuántas filas de tarjeta o QR no tienen tarifa: su comisión no está en `comision`. */
  sinTarifa: number;
  /** Lo que ya se le pagó a CLAURE (pagos vigentes). */
  pagado: number;
  /** La parte de CLAURE de los gastos que pagó CAYLA (alquiler, luz, limpieza…): también baja lo que se le debe. */
  gastos: number;
  /** Lo que se le debe a CLAURE: cobrado − devuelto − comisión − pagado − gastos suyos que pagó CAYLA. El IGV no se resta: lo pone CAYLA (ADR-0638, regla 5). Negativo si se le pagó de más: queda a favor de CAYLA. */
  saldo: number;
  /** El IGV que va incluido en lo cobrado menos lo devuelto. Solo informa: lo pone CAYLA y CLAURE lo devuelve con sus facturas de compra (ADR-0638, regla 5, Felipe 2026-11-09); ya no se le descuenta. */
  igv: number;
  /** Los cambios con prendas de CLAURE: no entran al saldo, se revisan a mano. */
  cambios: { n: number; monto: number };
};

export function resumenClaure(filas: readonly FilaClaure[], pagos: readonly PagoClaure[] = [], gastos: readonly GastoClaure[] = []): ResumenClaure {
  let cobrado = 0;
  let devuelto = 0;
  let comision = 0;
  let sinTarifa = 0;
  let igv = 0;
  let nCambios = 0;
  let montoCambios = 0;
  for (const f of filas) {
    if (!f.contado) {
      nCambios += 1;
      montoCambios += Math.abs(f.monto);
      continue;
    }
    // Un cambio (20261029162000) mueve la plata hacia el dueño de la prenda que se lleva la clienta: si sube lo que se le debe cuenta como cobrado; si baja, como devuelto.
    if (f.origen === "devolucion" || f.monto < 0) devuelto += -f.monto;
    else cobrado += f.monto;
    igv += f.igv ?? 0;
    if (f.comision === null) sinTarifa += 1;
    else comision += f.comision;
  }
  const pagado = pagos.reduce((a, p) => a + p.monto, 0);
  const deGastos = gastos.reduce((a, g) => a + g.parte, 0);
  return {
    cobrado: redondear(cobrado),
    devuelto: redondear(devuelto),
    comision: redondear(comision),
    sinTarifa,
    pagado: redondear(pagado),
    gastos: redondear(deGastos),
    saldo: redondear(cobrado - devuelto - comision - pagado - deGastos),
    igv: redondear(igv),
    cambios: { n: nCambios, monto: redondear(montoCambios) },
  };
}

/** Las filas que entran al saldo, de la más nueva a la más vieja. */
export function filasContadas(filas: readonly FilaClaure[]): FilaClaure[] {
  return filas.filter((f) => f.contado);
}

/** Los cambios con prendas de CLAURE que el saldo todavía no cuenta. */
export function cambiosPorRevisar(filas: readonly FilaClaure[]): FilaClaure[] {
  return filas.filter((f) => !f.contado);
}

/** Lo que de esa fila se le debe a CLAURE: lo cobrado (o devuelto, en negativo) menos la comisión estimada. El IGV no se resta: lo pone CAYLA. */
export function seLeDebeDeFila(f: FilaClaure): number {
  return redondear(f.monto - (f.comision ?? 0));
}

const TEXTO_MEDIO: Record<string, string> = { yape: "Yape", plin: "Plin", tarjeta: "Tarjeta", transferencia: "Transferencia", qr: "QR", cambio: "Sin diferencia" };
export function textoMedioClaure(medio: string): string {
  return TEXTO_MEDIO[medio] ?? medio;
}

const TEXTO_ORIGEN: Record<OrigenClaure, string> = { venta: "Venta", devolucion: "Devolución", cambio: "Cambio" };
export function textoOrigenClaure(origen: OrigenClaure): string {
  return TEXTO_ORIGEN[origen];
}

/** La pregunta de la cabecera y su cifra: lo que se le debe a CLAURE o, si se le pagó de más, lo que CLAURE le debe a CAYLA (siempre en positivo). */
export function respuestaClaure(saldo: number): { pregunta: string; valor: number } {
  return saldo < 0 ? { pregunta: "¿Cuánto te debe CLAURE?", valor: -saldo } : { pregunta: "¿Cuánto le debes a CLAURE?", valor: saldo };
}

/** Bajo la pregunta: de dónde sale la cifra y lo que pide atención. */
export function chipsClaure(r: ResumenClaure, hayDatos: boolean): ChipRespuesta[] {
  if (!hayDatos) return [{ texto: "Sin cobros todavía", tono: "pizarra" }];
  const chips: ChipRespuesta[] = [{ texto: `Cobrado ${soles(r.cobrado)}`, tono: "pizarra" }];
  if (r.devuelto > 0) chips.push({ texto: `Devuelto ${soles(r.devuelto)}`, tono: "pizarra" });
  if (r.comision > 0) chips.push({ texto: `Comisión del POS ${soles(r.comision)}`, tono: "pizarra" });
  if (r.pagado > 0) chips.push({ texto: `Ya pagado ${soles(r.pagado)}`, tono: "verde" });
  if (r.gastos > 0) chips.push({ texto: `Gastos suyos que pagó CAYLA ${soles(r.gastos)}`, tono: "pizarra" });
  if (r.saldo < 0) chips.push({ texto: "Se le pagó de más: queda a favor de CAYLA", tono: "ambar" });
  if (r.sinTarifa > 0) chips.push({ texto: `${r.sinTarifa} ${r.sinTarifa === 1 ? "cobro" : "cobros"} sin tarifa`, tono: "ambar" });
  if (r.cambios.n > 0) chips.push({ texto: `${r.cambios.n} ${r.cambios.n === 1 ? "cambio" : "cambios"} por revisar`, tono: "ambar" });
  return chips;
}

/** El monto con que arranca «Pagar a CLAURE»: todo lo que se le debe, en el formato del campo; vacío si no se le debe nada. */
export function montoSugeridoPago(saldo: number): string {
  return saldo > 0 ? saldo.toFixed(2) : "";
}

/** Lo que hay en las cuentas de CAYLA se parte en lo que es de Claudia (lo que se le debe) y lo que queda disponible; `null` si no se le debe nada. */
export function disponibleReal(total: number, saldo: number): { deClaudia: number; disponible: number } | null {
  if (!(saldo > 0)) return null;
  return { deClaudia: redondear(saldo), disponible: redondear(total - saldo) };
}

/** Bajo «¿Cuánta plata tienes?»: «De eso, S/ X es de Claudia» y «Disponible real S/ Y» (en rojo si lo que se le debe pasa de lo que hay). */
export function chipsDisponible(total: number, saldo: number, quien: Quien = QUIEN_CLAURE): { texto: string; tono: "verde" | "ambar" | "rojo" }[] {
  const d = disponibleReal(total, saldo);
  if (!d) return [];
  return [
    { texto: `De eso, ${soles(d.deClaudia)} es de ${quien.duena}`, tono: "ambar" },
    { texto: `Disponible real ${soles(d.disponible)}`, tono: d.disponible < 0 ? "rojo" : "verde" },
  ];
}

/**
 * Quién pone el IGV de lo vendido de CLAURE, en una sola frase para toda pantalla (ADR-0624 act. 2026-11-09; ADR-0638, regla 5). Desde la regla 5 no se le
 * descuenta a Claudia en ningún caso: lo pone CAYLA y queda por recuperar (la 1673 del Balance) hasta que CLAURE lo devuelva con sus facturas de compra.
 */
export const IGV_DE_CLAURE = "Ese IGV lo pone CAYLA y no se le descuenta a Claudia: CLAURE lo devuelve con sus facturas de compra.";

/** La frase de arriba: desde cuándo se cuenta y qué entra. */
export function fraseClaure(desde: string | null): string {
  const cuando = desde ? `Se cuenta desde el ${fechaCorta(desde)}. ` : "";
  return `${cuando}Entra lo que una venta de CLAURE cobró en una cuenta de CAYLA (tarjeta, QR, Yape, transferencia). El efectivo no entra: lo tiene Claudia. El IGV de esas ventas lo pone CAYLA: no se le descuenta.`;
}

/** La nota al pie: cómo se calcula lo que no se ve en la tabla. */
export const NOTA_CLAURE =
  "La comisión del POS es una estimación con la tarifa de la máquina (Configuración ▸ Dinero) y la asume CLAURE. El IGV va incluido en lo cobrado y no se le descuenta a Claudia: lo pone CAYLA, que lo recupera con las facturas de compra de CLAURE. Una prenda de CLAURE devuelta y reembolsada desde una cuenta de CAYLA resta; si se reembolsó en efectivo, no. En un cambio la plata sigue a la prenda que se lleva el cliente: si se lleva una de CAYLA, baja lo que se le debe; si pasa de una de CAYLA a una de CLAURE, sube.";

/** Bajo los pagos: dónde se anula uno equivocado. */
/** Bajo los gastos: de dónde sale la parte de cada uno. */
export const NOTA_GASTOS_CLAURE =
  "Cada categoría de gasto tiene su parte de CLAURE (de fábrica: alquiler, luz y mantenimiento, la mitad; agua, internet, baño, limpieza y bolsas, todo). Esa parte baja lo que se le debe y sale del gasto de CAYLA en Estados financieros.";

export const NOTA_PAGOS_CLAURE =
  "Un pago equivocado se anula en Dónde está ▸ Movimientos, y el saldo vuelve a subir. El efectivo que se quedó con Claudia al cerrar la caja sale de ese cierre y no se anula desde aquí.";

/**
 * Lo vendido de CLAURE en un período, neto de anulaciones y devoluciones (`fn_claure_ventas_en`, 20261029020000): `ventas` con IGV, `igv`, `base`
 * (sin IGV, lo que es de Claudia y NO es ingreso de CAYLA) y `costo` de sus prendas. Sirve para decir «de eso, CLAURE» donde la cifra
 * de CAYLA no lo incluye (el Estado de resultados) o lo incluye a la fuerza (el IGV de Impuestos: la boleta sale con el RUC de CAYLA).
 */
export type VentasClaure = { ventas: number; igv: number; base: number; costo: number; /** De qué aliadas es (ADR-0683); sin él, CLAURE. */ quien?: Quien };

/** La base devuelve UNA fila; sin filas, sin CLAURE o sin ventas en el período no hay nada que decir (`null`). */
export function leerVentasClaure(datos: unknown): VentasClaure | null {
  const r = (Array.isArray(datos) ? datos[0] : datos) as Record<string, unknown> | null | undefined;
  if (!r || typeof r !== "object") return null;
  const v = { ventas: redondear(numero(r.ventas)), igv: redondear(numero(r.igv)), base: redondear(numero(r.base)), costo: redondear(numero(r.costo)) };
  return v.ventas === 0 && v.igv === 0 && v.base === 0 ? null : v;
}

/** Impuestos: el IGV de SUNAT sigue entero, y esto dice cuánto de él viene de ventas de CLAURE. `null` si no hay IGV de CLAURE en el mes. */
export function lineaImpuestosClaure(v: VentasClaure | null): { titulo: string; texto: string } | null {
  if (!v || !(v.igv > 0)) return null;
  return deAliadaEnTodo({
    titulo: `De ese IGV, ${soles(v.igv)} es de ventas de CLAURE`,
    texto: `Las boletas de CLAURE salen con el RUC de CAYLA, así que SUNAT las cuenta aquí. Lo que CLAURE vendió en el mes (${soles(v.base)} sin IGV) es de Claudia. ${IGV_DE_CLAURE}`,
  }, v.quien ?? QUIEN_CLAURE);
}

/** Estado de resultados, el cuadro por sede: lo vendido de CLAURE no suma a sus ventas ni a su ganancia; la nota lo dice con su cifra. No afirma que la pantalla no lo muestre: arriba, «Prendas de CLAURE» sí lo separa. `null` si no hubo. */
export function notaResultadosClaure(v: VentasClaure | null): string | null {
  if (!v || !(v.base > 0)) return null;
  return deAliada(
    `Lo vendido de CLAURE (${soles(v.base)} sin IGV) no cuenta en las ventas ni en la ganancia de este cuadro: es de Claudia, no es ingreso ni costo de CAYLA. Lo que se le debe está en Cuentas y dinero ▸ CLAURE.`,
    v.quien ?? QUIEN_CLAURE,
  );
}
