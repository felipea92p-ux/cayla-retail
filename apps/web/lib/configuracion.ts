import "server-only";
import { createClient } from "@/lib/supabase/server";
import { baseTraeElCorte, leerInicioFinanzas } from "@/lib/finanzas-arranque-reglas";
import {
  leerConfiguracion,
  leerParametrosCaja,
  leerParametrosFinanzas,
  type ConfiguracionTiendas,
  type DatosEmpresa,
  type ParametrosCaja,
  type ParametrosFinanzasConCorte,
} from "@/lib/configuracion-reglas";

export type { CampanaConfig, ConfiguracionTiendas, EfectoCampana, TiendaConfig } from "@/lib/configuracion-reglas";

// Configuración ▸ Tiendas y caja (ADR-0195 F1, 20260924210000). Todo sale de `fn_configuracion_tiendas` (solo líder)
// y de `fn_parametros_caja` (la única regla de qué meta y qué fondo rigen un día; la lee también Caja).

export async function getConfiguracionTiendas(): Promise<ConfiguracionTiendas> {
  const supabase = await createClient();
  const [{ data, error }, whatsapp] = await Promise.all([
    supabase.rpc("fn_configuracion_tiendas" as never),
    // El WhatsApp de cada tienda (ADR-0288 tanda 1b), leído directo de `ubicaciones`: `fn_configuracion_tiendas` no lo
    // trae. Si la base todavía no tiene la columna, la pantalla sigue sin él (principio 9) en vez de caerse.
    supabase.from("ubicaciones").select("id, whatsapp_numero").eq("tipo", "tienda"),
  ]);
  if (error) throw new Error(`No se pudo leer la configuración: ${error.message}`);
  const numeros = new Map((whatsapp.data ?? []).map((u) => [u.id, u.whatsapp_numero ?? null]));
  const config = leerConfiguracion(data);
  return { ...config, tiendas: config.tiendas.map((t) => ({ ...t, whatsappNumero: numeros.get(t.id) ?? null })) };
}

/** Lo que rige hoy (o en `fecha`) en una sede: meta del día, fondo y campañas. `null` si la base todavía no tiene la
 *  función (web publicada antes de pegar 20260924210000): Caja cae a la meta de antes y el cierre no pide fondo. */
export async function getParametrosCaja(ubicacionId: string, fecha: string): Promise<ParametrosCaja | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_parametros_caja" as never, { p_ubicacion_id: ubicacionId, p_fecha: fecha } as never);
  if (error) return null;
  const fila = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : (data as Record<string, unknown> | null);
  return leerParametrosCaja(fila);
}

/** Configuración ▸ Caja y avisos (20260925103000): el mínimo de caja y los umbrales de aviso. `null` si la base aún no los
 *  tiene o la cuenta no ve Finanzas. */
export async function getParametrosFinanzas(): Promise<ParametrosFinanzasConCorte | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_parametros_finanzas" as never);
  if (error) return null;
  const p = leerParametrosFinanzas(data);
  // `inicioFinanzas` nace con ADR-0332: una base que aún no tiene esa migración no manda la clave y sale «sin corte».
  return p ? { ...p, inicioFinanzas: leerInicioFinanzas(data), corteDisponible: baseTraeElCorte(data) } : null;
}

/** Configuración ▸ Empresa: los datos de la empresa y de cada punto de emisión, tal como los usa Facturación. Solo lectura. */
export async function getDatosEmpresa(): Promise<DatosEmpresa> {
  const supabase = await createClient();
  const [{ data: empresa }, { data: ubics }, { data: fiscales }, { data: series }] = await Promise.all([
    supabase.from("configuracion_empresa").select("ruc, razon_social, nombre_comercial, email, telefono, web").maybeSingle(),
    supabase.from("ubicaciones").select("id, nombre, tipo").eq("activo", true).eq("tipo", "tienda").order("nombre"),
    supabase.from("ubicacion_datos_fiscales").select("ubicacion_id, direccion, distrito"),
    supabase.from("series_comprobantes").select("ubicacion_id, tipo, serie").is("archivada_at", null).order("serie"),
  ]);
  return {
    ruc: empresa?.ruc ?? null,
    razonSocial: empresa?.razon_social ?? null,
    nombreComercial: empresa?.nombre_comercial ?? null,
    email: empresa?.email ?? null,
    telefono: empresa?.telefono ?? null,
    web: empresa?.web ?? null,
    tiendas: (ubics ?? []).map((u) => {
      const f = (fiscales ?? []).find((x) => x.ubicacion_id === u.id);
      return {
        id: u.id,
        nombre: u.nombre,
        direccion: f?.direccion ?? null,
        distrito: f?.distrito ?? null,
        series: (series ?? []).filter((x) => x.ubicacion_id === u.id).map((x) => ({ tipo: x.tipo, serie: x.serie })),
      };
    }),
  };
}

