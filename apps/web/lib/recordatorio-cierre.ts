import { createClient } from "@/lib/supabase/server";
import { getCajaAbierta } from "@/lib/caja";
import { puede, type PersonaActualV2 } from "@/lib/persona-actual";
import type { CifrasRecordatorio, DatosRecordatorioCierre } from "@/lib/recordatorio-cierre-reglas";

// Lo que el recordatorio de cierre de caja lee de la base (ADR-0303), todo de solo lectura. El layout usa la versión TOTAL
// (`getRecordatorioCierre`, nunca lanza): no tiene `error.tsx` propio, y una excepción aquí dejaría sin pantalla a toda la app
// por un aviso. La ruta del sondeo usa la que lanza, para no confundir «la base no respondió» con «ya no hay caja».

/**
 * ¿Esta cuenta, parada donde está, recibe el recordatorio? Solo en una TIENDA (Almacén y Taller no tienen caja), en la vista
 * de una sede (no en CAYLA Global) y solo quien puede cerrar la caja (`gestionarCaja`): el recordatorio lleva a cerrarla, y a
 * quien no puede, el botón le diría que no.
 */
export function recibeRecordatorioCierre(persona: Pick<PersonaActualV2, "vista" | "ubicacionTipo" | "permisos">): boolean {
  return persona.vista === "sede" && persona.ubicacionTipo === "tienda" && puede(persona, "gestionarCaja");
}

type PersonaRecordatorio = Pick<PersonaActualV2, "vista" | "ubicacionTipo" | "permisos" | "ubicacionId" | "ubicacionEtiqueta">;

/**
 * La hora de cierre de la sede y su caja abierta, si hay. `null` si la cuenta no recibe el recordatorio. LANZA si la base no
 * responde: quien sondea (la ruta) tiene que distinguir «no hay caja» de «no pude preguntar», o un tropiezo de la red se leería
 * como «ya cerraron» y la píldora se despediría sin que nadie cerrara nada.
 */
export async function leerRecordatorioCierre(persona: PersonaRecordatorio): Promise<DatosRecordatorioCierre | null> {
  if (!recibeRecordatorioCierre(persona)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("ubicaciones").select("hora_cierre").eq("id", persona.ubicacionId).maybeSingle();
  if (error) throw error;
  const horaCierre = data?.hora_cierre ? String(data.hora_cierre).slice(0, 5) : null;
  const base = { ubicacionId: persona.ubicacionId, sede: persona.ubicacionEtiqueta, horaCierre };
  // Sin hora de cierre no hay nada que recordar: ni se pregunta por la caja.
  if (!horaCierre) return { ...base, caja: null };
  const caja = await getCajaAbierta(persona.ubicacionId);
  return { ...base, caja: caja ? { id: caja.id, abiertaEn: caja.abiertaEn, abiertaPor: caja.abiertaPorNombre } : null };
}

/** Lo mismo, total: para el layout. Si la base no responde, no hay recordatorio en esta carga (el sondeo lo trae después). */
export async function getRecordatorioCierre(persona: PersonaRecordatorio): Promise<DatosRecordatorioCierre | null> {
  try {
    return await leerRecordatorioCierre(persona);
  } catch (e) {
    console.error("No se pudo leer el recordatorio de cierre de caja", e);
    return null;
  }
}

/**
 * Las dos cifras de la tarjeta: el efectivo que debería haber en el cajón (`fn_esperado_caja`, el mismo número que usa
 * `cerrar_caja`: un solo dueño, ADR-0186) y cuántas ventas lleva el turno. Cada una cae a `null` por su cuenta.
 */
export async function getCifrasRecordatorio(cajaId: string): Promise<CifrasRecordatorio> {
  const supabase = await createClient();
  const [esperado, ventas] = await Promise.all([
    supabase.rpc("fn_esperado_caja", { p_caja_id: cajaId }).then(
      ({ data, error }) => {
        if (error) return null;
        const fila = (Array.isArray(data) ? data[0] : data) as { esperado?: number | string | null } | null;
        return fila?.esperado === null || fila?.esperado === undefined ? null : Number(fila.esperado);
      },
      () => null,
    ),
    supabase
      .from("ventas")
      .select("id", { count: "exact", head: true })
      .eq("caja_id", cajaId)
      .eq("estado", "completada")
      .then(
        ({ count, error }) => (error ? null : (count ?? 0)),
        () => null,
      ),
  ]);
  return { esperado, ventas };
}
