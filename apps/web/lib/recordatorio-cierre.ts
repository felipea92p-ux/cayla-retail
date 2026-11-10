import { createClient } from "@/lib/supabase/server";
import { getCajaAbierta } from "@/lib/caja";
import { getUbicaciones } from "@/lib/ubicaciones";
import { diaLima, hoyLima } from "@/lib/fechas-lima";
import { puede, type PersonaActualV2 } from "@/lib/persona-actual";
import { esFuncionAusente, type CifrasRecordatorio, type DatosRecordatorioCierre } from "@/lib/recordatorio-cierre-reglas";

// Lo que el recordatorio de cierre de caja lee de la base (ADR-0305), todo de solo lectura. El layout usa la versión TOTAL
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
  // La hora de cierre y la caja abierta van EN PARALELO (antes, en serie: tres idas a la base antes de pintar cualquier
  // pantalla). La hora sale de `getUbicaciones()` —con `cache()`, la misma lectura que el layout ya hace para el selector— y la
  // caja de `getCajaAbierta()`, también con `cache()`. Si la sede no tiene hora de cierre, la caja se descarta (y un error al
  // leerla no importa: no hay nada que recordar).
  const [ubicaciones, caja] = await Promise.all([
    getUbicaciones(),
    getCajaAbierta(persona.ubicacionId).then(
      (c) => ({ ok: true as const, c }),
      (e: unknown) => ({ ok: false as const, e }),
    ),
  ]);
  const sede = ubicaciones.find((u) => u.id === persona.ubicacionId);
  const horaHoy = sede?.horaCierre ?? null;
  const base = { ubicacionId: persona.ubicacionId, sede: persona.ubicacionEtiqueta, horaCierre: horaHoy };
  // Si el horario no se pudo LEER no es «sin horario»: se dice, para que el sondeo conserve lo último que sabía y la píldora no despida una caja abierta.
  if (sede?.horaCierreIncierta) throw new Error("No se pudo leer el horario de cierre de la sede");
  if (!caja.ok) {
    // Sin horario cargado no hay nada que recordar. Con él (aunque hoy no abra: puede seguir abierta la caja de ayer), que la base no responda se dice.
    if (!sede?.horarioCargado) return { ...base, caja: null };
    throw caja.e;
  }
  const abierta = caja.c;
  if (!abierta) return { ...base, caja: null };
  const horaDelTurno = await horaCierreDeLaCaja(persona.ubicacionId, horaHoy, abierta.abiertaEn);
  // Sin hora de cierre no hay nada que recordar.
  if (!horaDelTurno) return { ...base, horaCierre: null, caja: null };
  return { ...base, horaCierre: horaDelTurno, caja: { id: abierta.id, abiertaEn: abierta.abiertaEn, abiertaPor: abierta.abiertaPorNombre } };
}

/**
 * El cierre que cuenta para una caja abierta: el del DÍA EN QUE SE ABRIÓ (`instanteDeCierre`). Una caja de ayer que sigue abierta a las 00:15 se recuerda con el
 * cierre de ayer, que puede ser otro que el de hoy (o ninguno, si hoy la tienda no abre). Es la misma regla para el Marcador y para el botón «Cerrar caja» de Caja,
 * que nunca deben discrepar. LANZA si la base no responde (salvo que la función no exista todavía: entonces `horaHoy`).
 */
export async function horaCierreDeLaCaja(ubicacionId: string, horaHoy: string | null, abiertaEn: string): Promise<string | null> {
  const dia = diaLima(abiertaEn);
  if (!dia || dia === hoyLima()) return horaHoy;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_hora_cierre_de" as never, { p_ubicacion_id: ubicacionId, p_fecha: dia } as never);
  if (error) {
    if (esFuncionAusente(error)) return horaHoy;
    throw new Error("No se pudo leer el horario de cierre del día en que se abrió la caja");
  }
  const hora: unknown = data;
  return typeof hora === "string" && hora ? hora.slice(0, 5) : null;
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
