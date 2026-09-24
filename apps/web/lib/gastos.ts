import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  leerEgreso,
  leerGasto,
  leerMarca,
  leerPanel,
  type CategoriaGasto,
  type EgresoPorClasificar,
  type GastoFila,
  type MarcaNoGasto,
  type PanelGastos,
  type UbicacionGastos,
  type Ver,
} from "@/lib/gastos-reglas";

// Finanzas ▸ Gastos (ADR-0195 F2, 20260924235100). Todo sale de funciones que ya miran solo lo que la cuenta ve
// (`fn_gastos_ubicaciones`): el líder, todas y «la empresa»; con el módulo Gastos, su tienda. Si una lectura falla, la
// pantalla se dibuja igual y lo dice (principio 9): nunca muestra ceros como si fueran datos.

type Lectura<T> = { datos: T; falla: string | null };
const falla = (que: string, e: { message: string }) => `No se pudo leer ${que}: ${e.message}`;

export async function getCategoriasGasto(): Promise<CategoriaGasto[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("fn_categorias_gasto" as never);
  return ((data ?? []) as Record<string, unknown>[]).map((c) => ({
    codigo: String(c.codigo),
    nombre: String(c.nombre),
    ejemplos: String(c.ejemplos ?? ""),
    cuenta: String(c.cuenta),
    cuentaNombre: String(c.cuenta_nombre),
  }));
}

/** Las ubicaciones cuyos gastos ve la cuenta, con su nombre, y las cajas abiertas de ellas (para «efectivo del cajón»). */
export async function getContextoGastos(): Promise<{ ubicaciones: UbicacionGastos[]; cajasAbiertas: { id: string; ubicacionId: string }[] }> {
  const supabase = await createClient();
  const { data: ids } = await supabase.rpc("fn_gastos_ubicaciones" as never);
  const lista = ((ids ?? []) as string[]).filter(Boolean);
  if (!lista.length) return { ubicaciones: [], cajasAbiertas: [] };
  const [{ data: ubics }, { data: cajas }] = await Promise.all([
    supabase.from("ubicaciones").select("id, nombre, tipo").in("id", lista),
    supabase.from("cajas").select("id, ubicacion_id").eq("estado", "abierta").in("ubicacion_id", lista),
  ]);
  const orden = { tienda: 0, taller: 1, almacen: 2 } as Record<string, number>;
  return {
    ubicaciones: ((ubics ?? []) as { id: string; nombre: string; tipo: string }[])
      .sort((a, b) => (orden[a.tipo] ?? 9) - (orden[b.tipo] ?? 9) || a.nombre.localeCompare(b.nombre))
      .map((u) => ({ id: u.id, nombre: u.nombre })),
    cajasAbiertas: ((cajas ?? []) as { id: string; ubicacion_id: string }[]).map((c) => ({ id: c.id, ubicacionId: c.ubicacion_id })),
  };
}

export async function getPanelGastos(desde: string, hasta: string, ver: Ver): Promise<Lectura<PanelGastos | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_gastos_panel" as never, { p_desde: desde, p_hasta: hasta, p_ubicacion_id: ver.ubicacionId, p_solo_empresa: ver.soloEmpresa } as never);
  if (error) return { datos: null, falla: falla("el resumen de gastos", error) };
  return { datos: leerPanel(data), falla: null };
}

export async function getGastos(desde: string, hasta: string, ver: Ver): Promise<Lectura<GastoFila[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_gastos_lista" as never, { p_desde: desde, p_hasta: hasta, p_ubicacion_id: ver.ubicacionId, p_solo_empresa: ver.soloEmpresa, p_limite: 500 } as never);
  if (error) return { datos: [], falla: falla("los gastos", error) };
  return { datos: ((data ?? []) as Record<string, unknown>[]).map(leerGasto), falla: null };
}

export async function getEgresosPorClasificar(ver: Ver): Promise<Lectura<EgresoPorClasificar[]>> {
  if (ver.soloEmpresa) return { datos: [], falla: null }; // la empresa no tiene cajón
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_egresos_sin_clasificar" as never, { p_ubicacion_id: ver.ubicacionId, p_limite: 300 } as never);
  if (error) return { datos: [], falla: falla("los egresos de caja", error) };
  return { datos: ((data ?? []) as Record<string, unknown>[]).map(leerEgreso), falla: null };
}

export async function getMarcasNoGasto(ver: Ver): Promise<MarcaNoGasto[]> {
  if (ver.soloEmpresa) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_egresos_no_gasto_lista" as never, { p_ubicacion_id: ver.ubicacionId, p_limite: 100 } as never);
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map(leerMarca);
}

/** Los proveedores activos, para elegir el del comprobante (el directorio lo lee cualquier cuenta con acceso). */
export async function getProveedoresParaGasto(): Promise<{ id: string; nombre: string; ruc: string | null }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("proveedores").select("id, nombre, ruc").eq("activo", true).order("nombre");
  return ((data ?? []) as { id: string; nombre: string; ruc: string | null }[]).map((p) => ({ id: p.id, nombre: p.nombre, ruc: p.ruc }));
}

/** Los gastos de una ubicación en un rango (Producción ▸ Eficiencia lee los del Taller). Vacío si la cuenta no los ve. */
export async function getGastosDeUbicacion(ubicacionId: string, desde: string, hasta: string): Promise<GastoFila[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_gastos_lista" as never, { p_desde: desde, p_hasta: hasta, p_ubicacion_id: ubicacionId, p_limite: 500 } as never);
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map(leerGasto).filter((g) => g.estado === "vigente");
}
