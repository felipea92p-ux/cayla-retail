import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  leerCierre,
  leerConciliacion,
  leerConciliacionCuenta,
  leerCuenta,
  leerEfectivo,
  leerMedio,
  leerMovimiento,
  leerMovimientoDueno,
  leerSinCuenta,
  type CierreConDiferencia,
  type Conciliacion,
  type ConciliacionCuenta,
  type CuentaDinero,
  type EfectivoFila,
  type FilaMedio,
  type MovimientoDinero,
  type MovimientoDueno,
  type SinCuenta,
} from "@/lib/cuentas-dinero-reglas";
import { deudaConDueno } from "@/lib/cuentas-dinero-reglas";
import { leerVer, type UbicacionGastos, type Ver } from "@/lib/gastos-reglas";

// Finanzas ▸ Cuentas y dinero (ADR-0195 F3, 20260925110000). Todo sale de funciones que ya miran solo lo que la cuenta ve
// (`fn_cuentas_dinero_ubicaciones`: el líder, todas; con el módulo, su sede). Los saldos los SUMA la base. Si una lectura
// falla, la pantalla se dibuja igual y lo dice (principio 9): nunca muestra ceros como si fueran datos.

export type Lectura<T> = { datos: T; falla: string | null };
const falla = (que: string, e: { message: string }) => `No se pudo leer ${que}: ${e.message}`;
type Fila = Record<string, unknown>;

/** Las tiendas y el Taller cuyo dinero ve la cuenta, con su nombre (para «Ver»), y cuáles son el Taller (su cajón es un
 *  fondo fijo). */
export async function getUbicacionesDinero(): Promise<{ ubicaciones: UbicacionGastos[]; talleres: string[] }> {
  const supabase = await createClient();
  const { data: ids } = await supabase.rpc("fn_cuentas_dinero_ubicaciones" as never);
  const lista = ((ids ?? []) as string[]).filter(Boolean);
  if (!lista.length) return { ubicaciones: [], talleres: [] };
  const { data } = await supabase.from("ubicaciones").select("id, nombre, tipo").in("id", lista).in("tipo", ["tienda", "taller"]);
  const orden = { tienda: 0, taller: 1 } as Record<string, number>;
  const filas = ((data ?? []) as { id: string; nombre: string; tipo: string }[]).sort((a, b) => (orden[a.tipo] ?? 9) - (orden[b.tipo] ?? 9) || a.nombre.localeCompare(b.nombre, "es"));
  return { ubicaciones: filas.map((u) => ({ id: u.id, nombre: u.nombre })), talleres: filas.filter((u) => u.tipo === "taller").map((u) => u.id) };
}

export async function getSaldos(ubicacionId: string | null = null): Promise<Lectura<CuentaDinero[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_cuentas_dinero_saldos" as never, { p_corte: null, p_ubicacion_id: ubicacionId } as never);
  if (error) return { datos: [], falla: falla("las cuentas", error) };
  return { datos: ((data ?? []) as Fila[]).map(leerCuenta), falla: null };
}

export async function getMovimientos(ubicacionId: string | null): Promise<Lectura<MovimientoDinero[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_movimientos_dinero" as never, { p_ubicacion_id: ubicacionId, p_limite: 150 } as never);
  if (error) return { datos: [], falla: falla("los movimientos", error) };
  return { datos: ((data ?? []) as Fila[]).map(leerMovimiento), falla: null };
}

/** Solo el líder: aportes, préstamos, retiros y devoluciones. */
export async function getPlataDelDueno(): Promise<MovimientoDueno[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_plata_del_dueno" as never);
  if (error) return [];
  return ((data ?? []) as Fila[]).map(leerMovimientoDueno);
}

/** Solo el líder: a qué cuenta entra hoy cada medio en cada tienda. */
export async function getMediosDeCobro(): Promise<Lectura<FilaMedio[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_medios_de_cobro" as never);
  if (error) return { datos: [], falla: falla("a qué cuenta entra cada cobro", error) };
  return { datos: ((data ?? []) as Fila[]).map(leerMedio), falla: null };
}

/** Solo el líder: lo que movió plata este mes y todavía no dice de qué cuenta. */
export async function getSinCuenta(): Promise<SinCuenta[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_dinero_sin_cuenta" as never, { p_desde: null, p_hasta: null } as never);
  if (error) return [];
  return ((data ?? []) as Fila[]).map(leerSinCuenta).filter((s) => Math.abs(s.monto) >= 0.01);
}

export async function getEfectivo(ubicacionId: string | null): Promise<Lectura<EfectivoFila[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_efectivo_por_tienda" as never, { p_ubicacion_id: ubicacionId } as never);
  if (error) return { datos: [], falla: falla("el efectivo de las tiendas", error) };
  return { datos: ((data ?? []) as Fila[]).map(leerEfectivo), falla: null };
}

export async function getCierresConDiferencia(ubicacionId: string | null): Promise<CierreConDiferencia[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_cierres_con_diferencia" as never, { p_ubicacion_id: ubicacionId, p_dias: 14 } as never);
  if (error) return [];
  return ((data ?? []) as Fila[]).map(leerCierre);
}

/** Solo el líder: las cuentas que se concilian, con su última conciliación y lo pendiente. */
export async function getConciliacionCuentas(): Promise<Lectura<ConciliacionCuenta[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliacion_cuentas" as never);
  if (error) return { datos: [], falla: falla("las cuentas por conciliar", error) };
  return { datos: ((data ?? []) as Fila[]).map(leerConciliacionCuenta), falla: null };
}

export async function getConciliacion(cuentaId: string, hasta: string | null): Promise<Lectura<Conciliacion | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliacion" as never, { p_cuenta_id: cuentaId, p_hasta: hasta } as never);
  if (error) return { datos: null, falla: falla("la conciliación", error) };
  return { datos: leerConciliacion(data), falla: null };
}

/** Lo que comparten las tres pestañas: las sedes, qué se mira, las cuentas para el modal «+ Registrar movimiento», lo que
 *  CAYLA le debe al dueño (tope de una devolución) y el número de la píldora de Conciliación (solo el líder). */
export async function getContextoDinero(
  persona: { rol: "lider" | "integrante"; ubicacionId: string },
  verParam: string | undefined,
): Promise<{
  ubicaciones: UbicacionGastos[];
  talleres: string[];
  ver: Ver;
  esLider: boolean;
  cuentas: Lectura<CuentaDinero[]>;
  plata: MovimientoDueno[];
  deuda: number;
  conciliacion: Lectura<ConciliacionCuenta[]>;
}> {
  const esLider = persona.rol === "lider";
  const { ubicaciones, talleres } = await getUbicacionesDinero();
  // «Ver» aquí es una sede o todas: la empresa no tiene cajón.
  const ver = leerVer(verParam === "empresa" ? undefined : verParam, ubicaciones, esLider, persona.ubicacionId);
  const [cuentas, plata, conciliacion] = await Promise.all([
    getSaldos(null),
    esLider ? getPlataDelDueno() : Promise.resolve([]),
    esLider ? getConciliacionCuentas() : Promise.resolve({ datos: [], falla: null }),
  ]);
  return { ubicaciones, talleres, ver, esLider, cuentas, plata, deuda: deudaConDueno(plata).deuda, conciliacion };
}

/** La píldora de Conciliación: las líneas de los bancos que faltan revisar. */
export function pendientesDeConciliar(cuentas: readonly ConciliacionCuenta[]): number {
  return cuentas.reduce((a, c) => a + c.pendientes, 0);
}

/** Los bancos a los que se deposita (para «¿A qué cuenta llegó?» al clasificar un egreso). Vacío sin el módulo. */
export async function getDestinosDeposito(): Promise<{ id: string; nombre: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_cuentas_dinero_destinos" as never);
  if (error) return [];
  return ((data ?? []) as Fila[]).map((d) => ({ id: String(d.id), nombre: String(d.nombre) }));
}
