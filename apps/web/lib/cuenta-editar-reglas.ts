import { parsearMonto, type Resultado } from "./gastos-reglas";
import { TEXTO_MEDIO_COBRO, TIPOS_AUTOMATICOS, type MedioCobro, type TipoCuenta } from "./cuentas-dinero-reglas";

// Configuración ▸ Cuentas y cobros ▸ «Editar cuenta» (ADR-0195 F3, actualización 2026-09-25;
// 20260925210100_finanzas_editar_y_eliminar_cuentas.sql). Lógica pura: lee lo que dice la base de una cuenta
// (`fn_cuenta_dinero_detalle`), cuenta en palabras quién la usa y arma lo que se manda a `editar_cuenta_dinero`. QUÉ se
// puede cambiar lo decide la base (y lo vuelve a exigir al guardar); aquí solo se refleja.

export type UsoCuenta = { tabla: string; n: number };
export type DetalleCuenta = {
  id: string;
  nombre: string;
  tipo: TipoCuenta;
  numero: string | null;
  /** Con su signo: la tarjeta de crédito empieza con lo que se debe, en negativo. */
  saldoInicial: number;
  saldoDesde: string | null;
  archivada: boolean;
  /** Cajón, caja fuerte y efectivo por rendir: nacen con cada sede; solo cambian de nombre. */
  automatica: boolean;
  usos: UsoCuenta[];
  usada: boolean;
  /** Los cobros que entran HOY a esta cuenta (impiden archivarla). */
  recibe: { tienda: string; medio: MedioCobro }[];
  puedeEliminar: boolean;
  puedeCambiarTipo: boolean;
  puedeCambiarSaldo: boolean;
  motivoSaldo: string | null;
};

type Fila = Record<string, unknown>;

export function leerDetalleCuenta(data: unknown): DetalleCuenta | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Fila;
  const usos = new Map<string, number>();
  // Una tabla con dos llaves a la cuenta (el origen y el destino de un movimiento) llega dos veces: se suma.
  for (const u of (Array.isArray(d.usos) ? d.usos : []) as Fila[]) usos.set(String(u.tabla), (usos.get(String(u.tabla)) ?? 0) + Number(u.n ?? 0));
  return {
    id: String(d.id),
    nombre: String(d.nombre ?? ""),
    tipo: d.tipo as TipoCuenta,
    numero: d.numero == null ? null : String(d.numero),
    saldoInicial: Number(d.saldo_inicial ?? 0),
    saldoDesde: d.saldo_desde == null ? null : String(d.saldo_desde),
    archivada: d.archivada === true,
    automatica: d.automatica === true,
    usos: [...usos.entries()].map(([tabla, n]) => ({ tabla, n })).sort((a, b) => b.n - a.n || a.tabla.localeCompare(b.tabla)),
    usada: d.usada === true,
    recibe: ((Array.isArray(d.recibe) ? d.recibe : []) as Fila[]).map((r) => ({ tienda: String(r.tienda), medio: r.medio as MedioCobro })),
    puedeEliminar: d.puede_eliminar === true,
    puedeCambiarTipo: d.puede_cambiar_tipo === true,
    puedeCambiarSaldo: d.puede_cambiar_saldo === true,
    motivoSaldo: d.motivo_saldo == null ? null : String(d.motivo_saldo),
  };
}

// ---- Quién la usa, en palabras ------------------------------------------------------------------------------------------

const USOS: Record<string, readonly [string, string]> = {
  venta_pagos: ["cobro de venta", "cobros de ventas"],
  separacion_pagos: ["abono de apartado", "abonos de apartados"],
  separaciones: ["devolución de un apartado", "devoluciones de apartados"],
  cambios: ["diferencia de un cambio", "diferencias de cambios"],
  devoluciones: ["reembolso de una devolución", "reembolsos de devoluciones"],
  caja_traslados: ["traslado de un cierre de caja", "traslados de cierres de caja"],
  compra_pagos: ["pago a un proveedor", "pagos a proveedores"],
  comprobantes_produccion_pagos: ["pago de Producción", "pagos de Producción"],
  proveedor_creditos: ["reembolso de un proveedor", "reembolsos de proveedores"],
  gastos: ["gasto", "gastos"],
  activos_fijos: ["activo", "activos"],
  movimientos_dinero: ["movimiento de dinero", "movimientos de dinero"],
  medios_de_cobro: ["cambio en «A qué cuenta entra cada cobro»", "cambios en «A qué cuenta entra cada cobro»"],
  conciliaciones: ["conciliación", "conciliaciones"],
  dinero_revisados: ["línea revisada", "líneas revisadas"],
  cuentas_asignadas: ["pago asignado después", "pagos asignados después"],
};

const numeroEnPalabras = (n: number) => n.toLocaleString("es-PE");

/** «3 cobros de ventas, 1 movimiento de dinero y 2 cambios en…». Una tabla que no está en la lista igual se cuenta. */
export function textoUsos(usos: readonly UsoCuenta[]): string | null {
  const partes = usos
    .filter((u) => u.n > 0)
    .map((u) => {
      const [uno, varios] = USOS[u.tabla] ?? [`registro en ${u.tabla}`, `registros en ${u.tabla}`];
      return `${numeroEnPalabras(u.n)} ${u.n === 1 ? uno : varios}`;
    });
  if (partes.length === 0) return null;
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/** «Yape de Tienda TRU y Tarjeta de Tienda LIM». */
export function textoRecibeHoy(recibe: DetalleCuenta["recibe"]): string | null {
  const partes = recibe.map((r) => `${TEXTO_MEDIO_COBRO[r.medio] ?? r.medio} de ${r.tienda}`);
  if (partes.length === 0) return null;
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

// ---- El formulario ------------------------------------------------------------------------------------------------------

export type FormCuenta = { nombre: string; numero: string; tipo: TipoCuenta; saldo: string; desde: string };

/** El saldo como se escribe: la tarjeta, lo que se debe en positivo (igual que al agregarla). */
function saldoEscrito(tipo: TipoCuenta, saldo: number): string {
  const v = tipo === "tarjeta_credito" ? -saldo : saldo;
  return v === 0 ? "0" : String(Number(v.toFixed(2)));
}

export function formInicial(d: DetalleCuenta): FormCuenta {
  return { nombre: d.nombre, numero: d.numero ?? "", tipo: d.tipo, saldo: saldoEscrito(d.tipo, d.saldoInicial), desde: d.saldoDesde ?? "" };
}

/** Lo que se manda a `editar_cuenta_dinero`. Lo que no cambia va nulo (la base lo deja como está). */
export type PayloadEditarCuenta = {
  p_cuenta_id: string;
  p_nombre: string;
  p_numero: string | null;
  p_tipo: TipoCuenta | null;
  p_saldo_inicial: number | null;
  p_saldo_desde: string | null;
};

export function cambiosDeCuenta(d: DetalleCuenta, f: FormCuenta, hoy: string): Resultado<{ payload: PayloadEditarCuenta; hayCambios: boolean }> {
  const nombre = f.nombre.trim();
  if (!nombre) return { ok: false, error: "La cuenta necesita un nombre." };
  if (nombre.length > 80) return { ok: false, error: "El nombre es muy largo (máximo 80 letras)." };
  const numero = d.automatica ? d.numero : f.numero.trim() || null;
  if ((numero ?? "").length > 40) return { ok: false, error: "El número es muy largo (máximo 40 caracteres)." };

  const tipo = d.puedeCambiarTipo && !TIPOS_AUTOMATICOS.includes(f.tipo) ? f.tipo : d.tipo;

  let saldo = d.saldoInicial;
  let desde = d.saldoDesde;
  if (d.puedeCambiarSaldo && !d.automatica) {
    const escrito = f.saldo.trim().replace(/^-/, "");
    let valor = 0;
    if (escrito !== "" && escrito !== "0") {
      const m = parsearMonto(escrito);
      if (!m.ok) return m;
      valor = m.valor;
    }
    // La tarjeta de crédito empieza con lo que se debe: se guarda en negativo.
    saldo = tipo === "tarjeta_credito" ? -valor : valor;
    if (!f.desde) return { ok: false, error: "Di desde qué día cuenta el saldo inicial." };
    if (f.desde > hoy) return { ok: false, error: "La fecha del saldo inicial no puede ser futura." };
    desde = f.desde;
  }

  const cambiaSaldo = Math.round(saldo * 100) !== Math.round(d.saldoInicial * 100) || desde !== d.saldoDesde;
  const payload: PayloadEditarCuenta = {
    p_cuenta_id: d.id,
    p_nombre: nombre,
    p_numero: numero,
    p_tipo: tipo !== d.tipo ? tipo : null,
    p_saldo_inicial: cambiaSaldo ? saldo : null,
    p_saldo_desde: cambiaSaldo ? desde : null,
  };
  const hayCambios = nombre !== d.nombre || numero !== d.numero || payload.p_tipo !== null || cambiaSaldo;
  return { ok: true, valor: { payload, hayCambios } };
}

/** Qué hacer con una cuenta que ya no se usa: eliminarla (nunca se usó), archivarla o reactivarla. Nulo = nada. */
export type SalidaCuenta =
  | { accion: "eliminar" }
  | { accion: "archivar"; bloqueo: string | null }
  | { accion: "reactivar" }
  | null;

export function salidaDeCuenta(d: DetalleCuenta): SalidaCuenta {
  if (d.automatica) return null;
  // Por la que nunca pasó nada se elimina, esté archivada o no: es deshacer un error.
  if (d.puedeEliminar) return { accion: "eliminar" };
  if (d.archivada) return { accion: "reactivar" };
  const recibe = textoRecibeHoy(d.recibe);
  return { accion: "archivar", bloqueo: recibe ? `Hoy entra a esta cuenta: ${recibe}. Cámbialo en «A qué cuenta entra cada cobro» antes de archivarla.` : null };
}
