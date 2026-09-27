import { createClient } from "@/lib/supabase/server";
import type { Tolerado } from "@/lib/resultado";
import { getUbicaciones, type Ubicacion } from "@/lib/ubicaciones";
import {
  analizarSede,
  leerConfianzaRegistro,
  leerFrescuraSede,
  referenciaCayla,
  type FilaConfianza,
  type FrescuraSede,
  type ObservacionesSede,
  type VaraCategoria,
} from "@/lib/frescura-reglas";

// La parte que LEE de Postgres para Frescura del piso (ADR-0208, paso 3 del 3c). Todo lo que decide qué significan los
// datos vive en `frescura-reglas.ts` (puro, probado); aquí solo se pide, se valida la forma y se arma.
//
// Lo que se pide, todo EN PARALELO: una `retail.fn_frescura_sede` por tienda (una sola lectura del libro por sede) y
// una `retail.fn_confianza_registro` para todas (el indicador de registro al colgar, por sede y mes de Lima). Las dos
// exigen líder y operar la sede (`fn_es_lider()` + `fn_puede_operar_ubicacion`); el módulo `frescura` nace con la
// pantalla (paso 4), no aquí.
//
// Mismo patrón que `existencias-ritmo-servidor.ts` («Tolerado»): cada bloque falla por su cuenta. Si Trujillo no
// responde, Arequipa y Lima se siguen viendo, y la tarjeta de Trujillo dice «no se pudo cargar». Lo único que NO se arma
// a medias es la referencia de CAYLA: con una sede caída, una curva «de las 3 sedes» hecha con dos sería una cifra que
// miente (principio 9: degradarse con gracia es decir qué falta, no inventar).

/** Los días de historia que lee cada sede: la ventana más larga de la vara (`VENTANAS_VARA_DIAS`). */
export const FRESCURA_DIAS_LECTURA = 120;

export type FrescuraDeSede = {
  ubicacionId: string;
  nombre: string;
  /** `{ separaPiso: false }`: la sede no separa piso y almacén (no hay frescura que medir). */
  lectura: Tolerado<FrescuraSede | { separaPiso: false }>;
};

export type FrescuraLider = {
  sedes: FrescuraDeSede[];
  /** El registro al colgar de cada sede, este mes y el anterior. */
  confianza: Tolerado<FilaConfianza[]>;
  /** Una curva por categoría con las unidades de todas las tiendas juntas (solo el líder la ve). */
  referenciaCayla: Tolerado<VaraCategoria[]>;
};

type ErrorRpc = { message: string; hint?: string | null } | null;
type Cliente = Awaited<ReturnType<typeof createClient>>;

/** El aviso para la pantalla, sin jerga de Postgres. La pista `frescura_sin_permiso` es un «no tienes acceso», no un fallo. */
function aviso(que: string, error: ErrorRpc): string {
  if (error?.hint === "frescura_sin_permiso") return `No tienes acceso a ${que}.`;
  return `No se pudo cargar ${que}. Lo demás de esta pantalla sí está al día.`;
}

async function leerSede(
  supabase: Cliente,
  u: Pick<Ubicacion, "id" | "nombre">,
  dias: number,
): Promise<{ fila: FrescuraDeSede; observaciones: ObservacionesSede | null }> {
  const que = `la frescura de ${u.nombre}`;
  const fallo = (mensaje: string) => ({ fila: { ubicacionId: u.id, nombre: u.nombre, lectura: { datos: null, fallo: mensaje } }, observaciones: null });
  try {
    const { data, error } = await supabase.rpc("fn_frescura_sede", { p_ubicacion_id: u.id, p_dias: dias });
    if (error) {
      console.error(`No se pudo leer ${que}:`, error.message);
      return fallo(aviso(que, error));
    }
    const lectura = leerFrescuraSede(data);
    if (lectura === null) {
      console.error(`No se pudo leer ${que}: la respuesta no tiene la forma de fn_frescura_sede.`);
      return fallo(aviso(que, null));
    }
    if (!lectura.separaPiso) return { fila: { ubicacionId: u.id, nombre: u.nombre, lectura: { datos: { separaPiso: false }, fallo: null } }, observaciones: {} };
    const { sede, observaciones } = analizarSede(lectura);
    return { fila: { ubicacionId: u.id, nombre: u.nombre, lectura: { datos: sede, fallo: null } }, observaciones };
  } catch (e) {
    console.error(`No se pudo leer ${que}:`, e);
    return fallo(aviso(que, null));
  }
}

async function leerConfianza(supabase: Cliente): Promise<Tolerado<FilaConfianza[]>> {
  const que = "el registro al colgar de las sedes";
  try {
    const { data, error } = await supabase.rpc("fn_confianza_registro", {});
    if (error) {
      console.error(`No se pudo leer ${que}:`, error.message);
      return { datos: null, fallo: aviso(que, error) };
    }
    return { datos: leerConfianzaRegistro(data), fallo: null };
  } catch (e) {
    console.error(`No se pudo leer ${que}:`, e);
    return { datos: null, fallo: aviso(que, null) };
  }
}

/**
 * Frescura del piso para el líder: sus tiendas, el registro al colgar y la referencia de CAYLA, en una vuelta. Las
 * lecturas que fallan vuelven con su aviso; ninguna tumba la pantalla.
 */
export async function getFrescuraLider(dias: number = FRESCURA_DIAS_LECTURA): Promise<FrescuraLider> {
  const tiendas = (await getUbicaciones()).filter((u) => u.tipo === "tienda");
  const supabase = await createClient();
  const [lecturas, confianza] = await Promise.all([Promise.all(tiendas.map((t) => leerSede(supabase, t, dias))), leerConfianza(supabase)]);

  const caidas = lecturas.filter((l) => l.observaciones === null).map((l) => l.fila.nombre);
  const cayla: Tolerado<VaraCategoria[]> =
    caidas.length > 0
      ? { datos: null, fallo: `La referencia de CAYLA necesita todas las tiendas y falta ${caidas.join(", ")}.` }
      : { datos: referenciaCayla(lecturas.map((l) => l.observaciones ?? {})), fallo: null };

  return { sedes: lecturas.map((l) => l.fila), confianza, referenciaCayla: cayla };
}
