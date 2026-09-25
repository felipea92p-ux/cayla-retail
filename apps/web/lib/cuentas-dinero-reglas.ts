import { fechaCorta, parsearMonto, type Resultado } from "./gastos-reglas";
import { diaYHoraLima, diasEntreFechas } from "./fechas-lima";

// Finanzas ▸ Cuentas y dinero (ADR-0195 F3, 20260925110000): lógica pura, sin servidor ni navegador. La leen las páginas
// (servidor) y los paneles (cliente). Los saldos NO se calculan aquí: los suma la base (`fn_cuentas_dinero_saldos`); aquí
// solo se ordenan, se agrupan y se explican.

// ---- Vocabulario ------------------------------------------------------------------------------------------------------

export type TipoCuenta = "cajon" | "caja_fuerte" | "por_rendir" | "banco" | "por_abonar" | "tarjeta_credito";
export const TEXTO_TIPO_CUENTA: Record<TipoCuenta, string> = {
  cajon: "Cajón o fondo fijo",
  caja_fuerte: "Caja fuerte",
  por_rendir: "Por rendir",
  banco: "Banco o billetera",
  por_abonar: "Por abonar",
  tarjeta_credito: "Tarjeta de crédito (deuda)",
};
/** Las que nacen con el sistema (con cada sede, o una sola): se ven, no se archivan. */
export const TIPOS_AUTOMATICOS: readonly TipoCuenta[] = ["cajon", "caja_fuerte", "por_rendir"];
/** Las que el líder agrega en Configuración. */
export const TIPOS_QUE_SE_AGREGAN: readonly { tipo: TipoCuenta; texto: string }[] = [
  { tipo: "banco", texto: "Banco o billetera (104)" },
  { tipo: "por_abonar", texto: "Por abonar: el POS de tarjeta (105)" },
  { tipo: "tarjeta_credito", texto: "Tarjeta de crédito de CAYLA (451)" },
];

/** Cómo agrupa el spike las cuentas (`vistaCuentas`): cada grupo con su cuenta contable. */
export const GRUPOS_CUENTAS: readonly { clave: string; tipos: readonly TipoCuenta[]; titulo: string; cuenta: string }[] = [
  { clave: "bancos", tipos: ["banco"], titulo: "Bancos", cuenta: "104" },
  { clave: "por_abonar", tipos: ["por_abonar"], titulo: "Por abonar", cuenta: "105" },
  { clave: "cajones", tipos: ["cajon"], titulo: "Cajones y fondo fijo", cuenta: "101" },
  { clave: "fuertes", tipos: ["caja_fuerte", "por_rendir"], titulo: "Cajas fuertes y efectivo por rendir", cuenta: "101" },
  { clave: "tarjetas", tipos: ["tarjeta_credito"], titulo: "Tarjetas de crédito de CAYLA · lo que se debe", cuenta: "451" },
];

export type TipoMovimiento = "aporte" | "prestamo" | "retiro" | "devolucion_prestamo" | "deposito" | "abono_tarjeta" | "pago_tarjeta" | "entre_cuentas";
export const TEXTO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  aporte: "Aporte del dueño",
  prestamo: "Préstamo del dueño",
  retiro: "Retiro de utilidades",
  devolucion_prestamo: "Devolución de préstamo al dueño",
  deposito: "Depósito al banco",
  abono_tarjeta: "Abono de tarjeta",
  pago_tarjeta: "Pago de la tarjeta de crédito",
  entre_cuentas: "Entre cuentas",
};

export type MedioCobro = "yape" | "plin" | "tarjeta" | "transferencia";
export const MEDIOS_COBRO: readonly MedioCobro[] = ["yape", "plin", "tarjeta", "transferencia"];
export const TEXTO_MEDIO_COBRO: Record<MedioCobro, string> = { yape: "Yape", plin: "Plin", tarjeta: "Tarjeta", transferencia: "Transferencia" };
/** A qué tipo de cuenta puede entrar cada medio (la base lo vuelve a exigir). */
export function tiposParaMedio(medio: MedioCobro): TipoCuenta[] {
  return medio === "tarjeta" ? ["por_abonar", "banco"] : ["banco"];
}

// ---- Lo que devuelve la base → tipos de la pantalla ---------------------------------------------------------------------

type Fila = Record<string, unknown>;
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numONull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const texto = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export type CuentaDinero = {
  id: string;
  nombre: string;
  tipo: TipoCuenta;
  cuentaContable: string;
  ubicacionId: string | null;
  ubicacionNombre: string | null;
  numero: string | null;
  /** Nulo = no le toca verlo (un banco para quien solo deposita; el cajón abierto para quien no cierra la caja). */
  saldo: number | null;
  archivada: boolean;
  soloDestino: boolean;
  cajaId: string | null;
  cajaAbierta: boolean;
  saldoDesde: string | null;
  ultimaConciliacion: string | null;
  ultimoAbono: string | null;
  orden: number;
};
export function leerCuenta(c: Fila): CuentaDinero {
  return {
    id: String(c.id),
    nombre: String(c.nombre),
    tipo: String(c.tipo) as TipoCuenta,
    cuentaContable: String(c.cuenta_contable),
    ubicacionId: texto(c.ubicacion_id),
    ubicacionNombre: texto(c.ubicacion_nombre),
    numero: texto(c.numero),
    saldo: numONull(c.saldo),
    archivada: Boolean(c.archivada),
    soloDestino: Boolean(c.solo_destino),
    cajaId: texto(c.caja_id),
    cajaAbierta: Boolean(c.caja_abierta),
    saldoDesde: texto(c.saldo_desde),
    ultimaConciliacion: texto(c.ultima_conciliacion),
    ultimoAbono: texto(c.ultimo_abono),
    orden: num(c.orden),
  };
}

export type MovimientoDinero = {
  id: string;
  tipo: TipoMovimiento;
  fecha: string;
  origenId: string | null;
  origenNombre: string | null;
  origenTipo: TipoCuenta | null;
  destinoId: string | null;
  destinoNombre: string | null;
  destinoTipo: TipoCuenta | null;
  monto: number;
  comision: number;
  referencia: string | null;
  ubicacionId: string | null;
  estado: "vigente" | "anulado";
  motivoAnulacion: string | null;
  registradoPor: string | null;
  anuladoPor: string | null;
  cajaMovimientoId: string | null;
  puedeAnular: boolean;
};
export function leerMovimiento(m: Fila): MovimientoDinero {
  return {
    id: String(m.id),
    tipo: String(m.tipo) as TipoMovimiento,
    fecha: String(m.fecha),
    origenId: texto(m.cuenta_origen_id),
    origenNombre: texto(m.origen_nombre),
    origenTipo: texto(m.origen_tipo) as TipoCuenta | null,
    destinoId: texto(m.cuenta_destino_id),
    destinoNombre: texto(m.destino_nombre),
    destinoTipo: texto(m.destino_tipo) as TipoCuenta | null,
    monto: num(m.monto),
    comision: num(m.comision),
    referencia: texto(m.referencia),
    ubicacionId: texto(m.ubicacion_id),
    estado: m.estado === "anulado" ? "anulado" : "vigente",
    motivoAnulacion: texto(m.motivo_anulacion),
    registradoPor: texto(m.registrado_por_nombre) || null,
    anuladoPor: texto(m.anulado_por_nombre) || null,
    cajaMovimientoId: texto(m.caja_movimiento_id),
    puedeAnular: Boolean(m.puede_anular),
  };
}

export type FilaMedio = { ubicacionId: string; ubicacionNombre: string; medio: MedioCobro; cuentaId: string | null; cuentaNombre: string | null; vigenteDesde: string | null };
export function leerMedio(m: Fila): FilaMedio {
  return {
    ubicacionId: String(m.ubicacion_id),
    ubicacionNombre: String(m.ubicacion_nombre),
    medio: String(m.medio) as MedioCobro,
    cuentaId: texto(m.cuenta_id),
    cuentaNombre: texto(m.cuenta_nombre),
    vigenteDesde: texto(m.vigente_desde),
  };
}

export type MovimientoDueno = { id: string; tipo: TipoMovimiento; fecha: string; monto: number; referencia: string | null; cuentaNombre: string | null };
export function leerMovimientoDueno(m: Fila): MovimientoDueno {
  return { id: String(m.id), tipo: String(m.tipo) as TipoMovimiento, fecha: String(m.fecha), monto: num(m.monto), referencia: texto(m.referencia), cuentaNombre: texto(m.cuenta_nombre) };
}

export type SinCuenta = { origen: string; n: number; monto: number };
export function leerSinCuenta(s: Fila): SinCuenta {
  return { origen: String(s.origen), n: num(s.n), monto: num(s.monto) };
}

export type EfectivoFila = {
  ubicacionId: string;
  ubicacionNombre: string;
  cajaId: string | null;
  abierta: boolean;
  abiertaEn: string | null;
  abiertaPor: string | null;
  apertura: number;
  ventasEfectivo: number;
  ingresos: number;
  egresos: number;
  depositos: number;
  reembolsos: number;
  cambios: number;
  /** Lo que debería haber (el esperado del cierre). Nulo para quien no puede cerrar la caja. */
  esperado: number | null;
  cerradaEn: string | null;
  fondo: number | null;
};
export function leerEfectivo(f: Fila): EfectivoFila {
  return {
    ubicacionId: String(f.ubicacion_id),
    ubicacionNombre: String(f.ubicacion_nombre),
    cajaId: texto(f.caja_id),
    abierta: Boolean(f.abierta),
    abiertaEn: texto(f.abierta_en),
    abiertaPor: texto(f.abierta_por) || null,
    apertura: num(f.apertura),
    ventasEfectivo: num(f.ventas_efectivo),
    ingresos: num(f.ingresos),
    egresos: num(f.egresos),
    depositos: num(f.depositos),
    reembolsos: num(f.reembolsos),
    cambios: num(f.cambios),
    esperado: numONull(f.esperado),
    cerradaEn: texto(f.cerrada_en),
    fondo: numONull(f.fondo),
  };
}
/** Lo que entra y sale del cajón que no es venta ni egreso: ingresos, devoluciones y cambios en efectivo. */
export function otrosDelCajon(f: Pick<EfectivoFila, "ingresos" | "reembolsos" | "cambios">): number {
  return Math.round((f.ingresos - f.reembolsos + f.cambios) * 100) / 100;
}

export type CierreConDiferencia = { cajaId: string; ubicacionNombre: string; cerradaEn: string; diferencia: number; cerradaPor: string | null };
export function leerCierre(c: Fila): CierreConDiferencia {
  return { cajaId: String(c.caja_id), ubicacionNombre: String(c.ubicacion_nombre), cerradaEn: String(c.cerrada_en), diferencia: num(c.diferencia), cerradaPor: texto(c.cerrada_por) || null };
}

export type EgresoParaMovimiento = { id: string; cajaId: string; monto: number; motivo: string; nota: string | null; creadoEn: string; marca: string | null };
export function leerEgresoParaMovimiento(e: Fila): EgresoParaMovimiento {
  return { id: String(e.id), cajaId: String(e.caja_id), monto: num(e.monto), motivo: String(e.motivo), nota: texto(e.nota), creadoEn: String(e.creado_en), marca: texto(e.marca) };
}

export type ConciliacionCuenta = {
  id: string;
  nombre: string;
  tipo: TipoCuenta;
  saldoHoy: number;
  ultimaFecha: string | null;
  ultimoSaldoBanco: number | null;
  ultimaDiferencia: number | null;
  pendientes: number;
};
export function leerConciliacionCuenta(c: Fila): ConciliacionCuenta {
  return {
    id: String(c.id),
    nombre: String(c.nombre),
    tipo: String(c.tipo) as TipoCuenta,
    saldoHoy: num(c.saldo_hoy),
    ultimaFecha: texto(c.ultima_fecha),
    ultimoSaldoBanco: numONull(c.ultimo_saldo_banco),
    ultimaDiferencia: numONull(c.ultima_diferencia),
    pendientes: num(c.pendientes),
  };
}

export type LineaConciliacion = { clave: string; fecha: string; detalle: string; monto: number; revisado: boolean; montoRevisado: number | null; revisadoPor: string | null };
export type HistorialConciliacion = { id: string; fecha: string; saldoBanco: number; saldoSistema: number; diferencia: number; nota: string | null };
export type Conciliacion = {
  cuenta: { id: string; nombre: string; tipo: TipoCuenta; saldoDesde: string | null };
  desde: string;
  hasta: string;
  saldoSistema: number;
  conciliacion: { id: string; saldoBanco: number; saldoSistema: number; diferencia: number; nota: string | null; registradoPor: string | null } | null;
  lineas: LineaConciliacion[];
  historial: HistorialConciliacion[];
};
export function leerConciliacion(data: unknown): Conciliacion | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Fila;
  const c = (d.cuenta ?? {}) as Fila;
  const k = d.conciliacion as Fila | null | undefined;
  return {
    cuenta: { id: String(c.id), nombre: String(c.nombre), tipo: String(c.tipo) as TipoCuenta, saldoDesde: texto(c.saldo_desde) },
    desde: String(d.desde),
    hasta: String(d.hasta),
    saldoSistema: num(d.saldo_sistema),
    conciliacion: k
      ? { id: String(k.id), saldoBanco: num(k.saldo_banco), saldoSistema: num(k.saldo_sistema), diferencia: num(k.diferencia), nota: texto(k.nota), registradoPor: texto(k.registrado_por) || null }
      : null,
    lineas: ((d.lineas ?? []) as Fila[]).map((l) => ({
      clave: String(l.clave),
      fecha: String(l.fecha),
      detalle: String(l.detalle),
      monto: num(l.monto),
      revisado: Boolean(l.revisado),
      montoRevisado: numONull(l.monto_revisado),
      revisadoPor: texto(l.revisado_por) || null,
    })),
    historial: ((d.historial ?? []) as Fila[]).map((h) => ({
      id: String(h.id),
      fecha: String(h.fecha),
      saldoBanco: num(h.saldo_banco),
      saldoSistema: num(h.saldo_sistema),
      diferencia: num(h.diferencia),
      nota: texto(h.nota),
    })),
  };
}

// ---- Cuentas: qué se ve y cómo se explica ----------------------------------------------------------------------------

const corto = (nombre: string) => nombre.replace(/^Tienda\s+/i, "");

/** «BCP · Cta. corriente» → «BCP» en las tablas angostas (como el spike): el tipo de cuenta ya lo dice la columna. */
export function nombreCorto(nombre: string): string {
  return nombre.replace(/\s+·\s+(cta\.?|cuenta)\s.*$/i, "");
}

/** Qué cuentas se dibujan como tarjeta. Las de CAYLA entera (bancos, POS, tarjeta, lo que tiene el líder) se ven igual en
 *  cualquier «Ver»; el cajón y la caja fuerte, solo los de la sede que se mira. Las archivadas y las «solo destino» no. */
export function cuentasVisibles(cuentas: readonly CuentaDinero[], ubicacionId: string | null): CuentaDinero[] {
  return cuentas.filter((c) => !c.archivada && !c.soloDestino && (c.ubicacionId === null || ubicacionId === null || c.ubicacionId === ubicacionId));
}

/** Los grupos del spike con sus cuentas (los vacíos no salen). */
export function agruparCuentas(cuentas: readonly CuentaDinero[]) {
  return GRUPOS_CUENTAS.map((g) => ({ ...g, cuentas: cuentas.filter((c) => g.tipos.includes(c.tipo)) })).filter((g) => g.cuentas.length > 0);
}

/** «Yape de TRU y AQP · transferencias»: qué cobros entran hoy a una cuenta, dicho en palabras (sale de `medios_de_cobro`). */
export function textoRecibe(cuenta: Pick<CuentaDinero, "id">, medios: readonly FilaMedio[]): string | null {
  const tiendas = [...new Set(medios.map((m) => m.ubicacionId))];
  // Como en el spike: lo que llega de todas las tiendas va primero («Plin de las 3 tiendas · Yape de LIM») y las
  // transferencias al final («Yape de TRU y AQP · transferencias»).
  const partes: { texto: string; orden: number }[] = [];
  for (const medio of MEDIOS_COBRO) {
    const aqui = medios.filter((m) => m.medio === medio && m.cuentaId === cuenta.id);
    if (!aqui.length) continue;
    const todas = aqui.length === tiendas.length && tiendas.length > 1;
    const de = listaY(aqui.map((m) => corto(m.ubicacionNombre)));
    const nombre = medio === "tarjeta" ? "tarjeta" : TEXTO_MEDIO_COBRO[medio];
    if (medio === "transferencia") partes.push({ texto: todas || tiendas.length === 1 ? "transferencias" : `transferencias de ${de}`, orden: 2 });
    else partes.push({ texto: todas ? `${nombre} de las ${tiendas.length} tiendas` : `${nombre} de ${de}`, orden: todas ? 0 : 1 });
  }
  if (!partes.length) return null;
  const t = [...partes].sort((a, b) => a.orden - b.orden).map((p) => p.texto).join(" · ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function listaY(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

/** La línea de abajo de cada tarjeta: de dónde le llega la plata, o qué es. */
export function explicacionCuenta(c: CuentaDinero, medios: readonly FilaMedio[], esTaller: boolean): string {
  const recibe = textoRecibe(c, medios);
  switch (c.tipo) {
    case "banco":
      return recibe ?? "Sin cobros asignados todavía";
    case "por_abonar":
      return recibe ? `${recibe}, hasta que el banco los abona` : "Cobros con tarjeta hasta que el banco los abona";
    case "cajon":
      if (esTaller) return "Para gastos chicos del Taller";
      return c.cajaAbierta ? "Caja abierta hoy" : "Caja cerrada: lo que quedó para el próximo turno";
    case "caja_fuerte":
      return "Lo que los cierres guardan en la tienda";
    case "por_rendir":
      return "Lo que un cierre entrega al líder, hasta que lo deposita";
    case "tarjeta_credito":
      return "Lo que debes a la tarjeta";
  }
}

export type Insignia = { texto: string; tono: "verde" | "ambar" | "pizarra" };

/** La insignia de la tarjeta: «conciliada 19 sep» (ámbar si pasó más de una semana), «5 días sin abonar». */
export function insigniaCuenta(c: Pick<CuentaDinero, "tipo" | "ultimaConciliacion" | "ultimoAbono" | "saldo">, hoy: string): Insignia | null {
  if (c.tipo === "banco") {
    if (!c.ultimaConciliacion) return { texto: "sin conciliar", tono: "ambar" };
    return { texto: `conciliada ${fechaCorta(c.ultimaConciliacion)}`, tono: diasEntreFechas(c.ultimaConciliacion, hoy) > 7 ? "ambar" : "verde" };
  }
  if (c.tipo === "por_abonar") {
    if (!c.ultimoAbono) return (c.saldo ?? 0) > 0 ? { texto: "sin abonos todavía", tono: "pizarra" } : null;
    const d = diasEntreFechas(c.ultimoAbono, hoy);
    return { texto: d === 0 ? "abonada hoy" : `${d} ${d === 1 ? "día" : "días"} sin abonar`, tono: "pizarra" };
  }
  return null;
}

/** «Cierre de caja» y compañía: el origen de lo que no dice su cuenta, en palabras. */
export const TEXTO_SIN_CUENTA: Record<string, string> = {
  cobros: "cobros de tiendas sin cuenta asignada",
  pago: "pagos a proveedores que no dicen de qué cuenta salieron",
  gasto: "gastos de la empresa o de una tienda sin banco",
  activo: "activos pagados sin cajón",
  traslado: "cierres que mandaron al banco sin decir cuál",
  reembolso: "reembolsos de proveedores sin decir a qué cuenta entraron",
};

// ---- La plata del dueño ---------------------------------------------------------------------------------------------

/** Cuánto le debe CAYLA al dueño y cuánto se devolvió de cada préstamo (lo devuelto paga primero el más antiguo). */
export function deudaConDueno(movs: readonly MovimientoDueno[]): { deuda: number; prestamos: { id: string; fecha: string; monto: number; referencia: string | null; devuelto: number }[] } {
  const prestamos = movs.filter((m) => m.tipo === "prestamo").map((m) => ({ id: m.id, fecha: m.fecha, monto: m.monto, referencia: m.referencia, devuelto: 0 }));
  let devuelto = movs.filter((m) => m.tipo === "devolucion_prestamo").reduce((a, m) => a + m.monto, 0);
  for (const p of prestamos) {
    const d = Math.min(devuelto, p.monto);
    p.devuelto = Math.round(d * 100) / 100;
    devuelto -= d;
  }
  const deuda = Math.round(prestamos.reduce((a, p) => a + p.monto - p.devuelto, 0) * 100) / 100;
  return { deuda, prestamos };
}

// ---- El modal «Registrar movimiento» ----------------------------------------------------------------------------------

/** «Qué pasó» en palabras del negocio. Poner y sacar plata del dueño se abren en dos (aporte o préstamo; devolución o retiro). */
export type QuePaso = "deposito" | "abono_tarjeta" | "pago_tarjeta" | "entre_cuentas" | "dueno_pone" | "dueno_saca";
export const OPCIONES_QUE_PASO: readonly { valor: QuePaso; texto: string; soloLider: boolean; origen: readonly TipoCuenta[] | null; destino: readonly TipoCuenta[] | null }[] = [
  { valor: "deposito", texto: "Depósito al banco", soloLider: false, origen: ["cajon", "caja_fuerte", "por_rendir"], destino: ["banco"] },
  { valor: "abono_tarjeta", texto: "Abono de tarjeta", soloLider: true, origen: ["por_abonar"], destino: ["banco"] },
  { valor: "pago_tarjeta", texto: "Pagar la tarjeta de crédito", soloLider: true, origen: ["banco"], destino: ["tarjeta_credito"] },
  { valor: "entre_cuentas", texto: "Entre cuentas", soloLider: true, origen: ["banco"], destino: ["banco"] },
  { valor: "dueno_pone", texto: "Poner plata del dueño", soloLider: true, origen: null, destino: ["banco", "caja_fuerte", "por_rendir"] },
  { valor: "dueno_saca", texto: "Sacar plata del dueño", soloLider: true, origen: ["banco", "cajon", "caja_fuerte", "por_rendir"], destino: null },
];
export function opcionQuePaso(v: QuePaso) {
  return OPCIONES_QUE_PASO.find((o) => o.valor === v)!;
}

export type BorradorMovimiento = {
  que: QuePaso;
  /** Poner: aporte | prestamo. Sacar: devolucion_prestamo | retiro. */
  clase: "aporte" | "prestamo" | "devolucion_prestamo" | "retiro";
  origen: string;
  destino: string;
  monto: string;
  referencia: string;
  comision: string;
  fecha: string;
  /** Si sale de un cajón: de la caja abierta ahora, o un egreso que la tienda ya registró. */
  fuente: "caja" | "egreso";
  egresoId: string;
};

export type PayloadMovimiento = {
  p_tipo: TipoMovimiento;
  p_monto: number;
  p_cuenta_origen_id: string | null;
  p_cuenta_destino_id: string | null;
  p_fecha: string | null;
  p_referencia: string | null;
  p_comision: number;
  p_caja_id: string | null;
  p_caja_movimiento_id: string | null;
};

export function tipoDeMovimiento(b: Pick<BorradorMovimiento, "que" | "clase">): TipoMovimiento {
  if (b.que === "dueno_pone") return b.clase === "prestamo" ? "prestamo" : "aporte";
  if (b.que === "dueno_saca") return b.clase === "devolucion_prestamo" ? "devolucion_prestamo" : "retiro";
  return b.que;
}

/** Revisa el formulario antes de mandarlo (la base vuelve a revisar todo). `deuda` = lo que CAYLA le debe al dueño. */
export function validarMovimiento(
  b: BorradorMovimiento,
  ctx: { cuentas: readonly CuentaDinero[]; egresos: readonly EgresoParaMovimiento[]; deuda: number; hoy: string },
): Resultado<PayloadMovimiento> {
  const op = opcionQuePaso(b.que);
  const tipo = tipoDeMovimiento(b);
  const origen = op.origen ? ctx.cuentas.find((c) => c.id === b.origen) ?? null : null;
  const destino = op.destino ? ctx.cuentas.find((c) => c.id === b.destino) ?? null : null;
  if (op.origen && !origen) return { ok: false, error: "Elige de qué cuenta sale." };
  if (op.destino && !destino) return { ok: false, error: "Elige a qué cuenta llega." };
  if (origen && destino && origen.id === destino.id) return { ok: false, error: "La plata no cambia de lugar si sale y llega a la misma cuenta." };
  if (origen && !op.origen!.includes(origen.tipo)) return { ok: false, error: "Esa cuenta no sirve de origen para este movimiento." };
  if (destino && !op.destino!.includes(destino.tipo)) return { ok: false, error: "Esa cuenta no sirve de destino para este movimiento." };

  const esCajon = origen?.tipo === "cajon";
  let monto: number;
  let egresoId: string | null = null;
  let cajaId: string | null = null;
  if (esCajon && b.fuente === "egreso") {
    const e = ctx.egresos.find((x) => x.id === b.egresoId);
    if (!e) return { ok: false, error: "Elige el egreso que ya registró la tienda." };
    egresoId = e.id;
    monto = e.monto;
  } else {
    const m = parsearMonto(b.monto);
    if (!m.ok) return m;
    monto = m.valor;
    if (esCajon) {
      if (!origen!.cajaId) return { ok: false, error: "La caja de esa tienda está cerrada: elige un egreso ya registrado." };
      cajaId = origen!.cajaId;
    }
  }

  let comision = 0;
  if (tipo === "abono_tarjeta" && b.comision.trim() !== "") {
    const c = parsearMonto(b.comision);
    if (!c.ok) return { ok: false, error: `Comisión: ${c.error.charAt(0).toLowerCase()}${c.error.slice(1)}` };
    comision = c.valor;
  }
  if (tipo === "devolucion_prestamo" && monto > ctx.deuda + 0.001) {
    return { ok: false, error: `CAYLA te debe ${soles2(ctx.deuda)}: una devolución no puede ser mayor.` };
  }
  let fecha: string | null = null;
  if (!esCajon) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) return { ok: false, error: "Elige la fecha." };
    if (b.fecha > ctx.hoy) return { ok: false, error: "La fecha no puede ser futura." };
    fecha = b.fecha;
  }
  return {
    ok: true,
    valor: {
      p_tipo: tipo,
      p_monto: monto,
      p_cuenta_origen_id: origen?.id ?? null,
      p_cuenta_destino_id: destino?.id ?? null,
      p_fecha: fecha,
      p_referencia: b.referencia.trim() || null,
      p_comision: comision,
      p_caja_id: cajaId,
      p_caja_movimiento_id: egresoId,
    },
  };
}

function soles2(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Las cuentas que se ofrecen en «De» o «A» para una opción (activas; con saldo para quien las ve). */
export function cuentasPara(cuentas: readonly CuentaDinero[], tipos: readonly TipoCuenta[] | null, punta: "origen" | "destino"): CuentaDinero[] {
  if (!tipos) return [];
  return cuentas.filter((c) => !c.archivada && tipos.includes(c.tipo) && (punta === "destino" || !c.soloDestino));
}

// ---- Conciliación -----------------------------------------------------------------------------------------------------

export function resumenConciliacion(lineas: readonly LineaConciliacion[]): { total: number; revisadas: number; porRevisar: LineaConciliacion[] } {
  const porRevisar = lineas.filter((l) => !l.revisado);
  return { total: lineas.length, revisadas: lineas.length - porRevisar.length, porRevisar };
}

/** ¿Cuadra con el banco? Al céntimo. */
export function cuadra(diferencia: number | null): boolean {
  return diferencia !== null && Math.abs(diferencia) < 0.005;
}

/** La cuenta que conviene conciliar primero: la que lleva más tiempo sin conciliarse (o nunca). */
export function cuentaParaConciliar(cuentas: readonly ConciliacionCuenta[], pedida: string | undefined): ConciliacionCuenta | null {
  const elegida = cuentas.find((c) => c.id === pedida);
  if (elegida) return elegida;
  const bancos = cuentas.filter((c) => c.tipo === "banco");
  const lista = bancos.length ? bancos : [...cuentas];
  return [...lista].sort((a, b) => (a.ultimaFecha ?? "0000").localeCompare(b.ultimaFecha ?? "0000"))[0] ?? null;
}

/** «Hoy, jueves 24»: el título de Efectivo por tienda. */
export function hoyEnPalabras(hoy: string): string {
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const d = new Date(`${hoy}T12:00:00Z`);
  return `Hoy, ${dias[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** «martes 22»: el día de un cierre, en hora de Lima (cinco horas detrás de UTC todo el año, como `diaYHoraLima`). */
export function diaYNumero(iso: string): string {
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const lima = new Date(Date.parse(iso) - 5 * 3_600_000);
  return `${dias[lima.getUTCDay()]} ${lima.getUTCDate()}`;
}

/** «09:02» en hora de Lima. */
export function horaLima(iso: string): string {
  return diaYHoraLima(iso).hora;
}
