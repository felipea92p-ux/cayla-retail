import { createClient } from "@/lib/supabase/server";
import { getUbicaciones } from "@/lib/ubicaciones";
import {
  armarFrescuraLider,
  armarFrescuraSede,
  type FilaConfianza,
  type FrescuraSede,
  type LlamarRpcFrescura,
  type VaraCategoria,
} from "@/lib/frescura-reglas";
import type { NombresDeTemporadas } from "@/lib/frescura-pantalla";
import type { Tolerado } from "@/lib/resultado";
import type { PersonaActualV2 } from "@/lib/persona-actual";

// La parte que LEE de Postgres para Frescura del piso (ADR-0208, pasos 3 y 4 del 3c): solo dice a quién preguntar. Qué se
// pide, en qué orden, cómo falla cada bloque y qué significan los datos vive en `frescura-reglas.ts` (`armarFrescuraLider`,
// `armarFrescuraSede`, puros y probados con la salida real de la base en `frescura-contrato.test.ts`).
//
// QUIÉN LEE QUÉ (paso 4, 20260929100000; ADR-0253: ningún módulo es «solo del líder»). Las lecturas piden «el líder, o el
// módulo Frescura del piso en su rol, en una sede que opera»:
//   · el LÍDER lee todas las tiendas (una `fn_frescura_sede` por tienda, en paralelo) y el registro al colgar de todas:
//     con eso arma la referencia de CAYLA y «Las N tiendas»;
//   · quien tiene el módulo SIN ser líder lee solo su sede, entera. El registro al colgar y la referencia de CAYLA no se le
//     piden: las dos necesitan las otras tiendas, que no opera (DECIDÍ en ADR-0208, «Actualización 2026-09-28 — paso 4»).

export type { FrescuraDeSede, FrescuraLider } from "@/lib/frescura-reglas";

/** Los días de historia que lee cada sede: la ventana más larga de la vara (`VENTANAS_VARA_DIAS`). */
export const FRESCURA_DIAS_LECTURA = 120;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Las dos lecturas, cada una por su NOMBRE LITERAL (no `supabase.rpc(fn, …)` con el nombre en una variable):
 * `scripts/pruebas/roles_cobertura_modulos.mjs` lee del código de la web qué funciones llama la pantalla, y así sabe que el
 * módulo «frescura» tiene su guardián en la base (`fn_frescura_sede` y `fn_confianza_registro` preguntan por él).
 */
function rpcFrescura(supabase: Supabase): LlamarRpcFrescura {
  return (fn, args) =>
    fn === "fn_frescura_sede"
      ? supabase.rpc("fn_frescura_sede", args as { p_ubicacion_id: string; p_dias: number })
      : supabase.rpc("fn_confianza_registro", args as { p_ubicacion_id?: string; p_meses?: number });
}

/** Las cifras de una tienda para «Las N tiendas», o `{ separaPiso: false }` si no separa piso y almacén. */
export type CifrasDeTienda = FrescuraSede["cifras"] | { separaPiso: false };

/** Lo que la pantalla necesita, en una vuelta. Todo es serializable: viaja del servidor al navegador tal cual. */
export type DatosFrescura = {
  /** La sede que se mira: la del selector global (líder) o la suya (los demás). */
  sede: { id: string; nombre: string; tienda: boolean };
  esLider: boolean;
  /** La lectura de esa sede, ya analizada; `{ separaPiso: false }` si no separa piso y almacén (el Taller). */
  lectura: Tolerado<FrescuraSede | { separaPiso: false }>;
  /** Solo el líder: el registro al colgar de las tiendas (este mes y el anterior). Null para los demás: no se muestra. */
  registro: Tolerado<FilaConfianza[]> | null;
  /** Solo el líder: la referencia de CAYLA (todas las tiendas juntas). */
  cayla: Tolerado<VaraCategoria[]> | null;
  /** Solo el líder: cada tienda con sus cifras, para «Las N tiendas». */
  tiendas: { id: string; nombre: string; lectura: Tolerado<CifrasDeTienda> }[] | null;
  /** clave → nombre de cada temporada y la estación en que empieza. Vacío si no se pudo leer (la pantalla dice «su
   *  estación» en las frases y muestra la clave junto al color). */
  temporadas: NombresDeTemporadas;
};

async function nombresDeTemporadas(supabase: Supabase): Promise<NombresDeTemporadas> {
  try {
    const { data, error } = await supabase.rpc("fn_temporadas");
    if (error || !data) return {};
    // `estacion_desde` es la CLAVE de la estación («verano»): la pantalla la nombra con el nombre de esa temporada
    // («Verano»), así el clásico de verano dice «Es de verano» y no «Es de clásico · verano».
    return Object.fromEntries(
      (data as { clave: string; nombre: string; estacion_desde: string | null }[]).map((t) => [t.clave, { nombre: t.nombre, estacionDesde: t.estacion_desde ?? null }]),
    );
  } catch {
    return {};
  }
}

/** Frescura del piso para quien la mira. Las lecturas que fallan vuelven con su aviso; ninguna tumba la pantalla. */
export async function getFrescuraPantalla(
  persona: Pick<PersonaActualV2, "rol" | "ubicacionId" | "ubicacionEtiqueta">,
  dias: number = FRESCURA_DIAS_LECTURA,
): Promise<DatosFrescura> {
  const supabase = await createClient();
  const rpc = rpcFrescura(supabase);
  const ubicaciones = await getUbicaciones();
  const activa = ubicaciones.find((u) => u.id === persona.ubicacionId);
  const sede = { id: persona.ubicacionId, nombre: activa?.nombre ?? persona.ubicacionEtiqueta, tienda: activa?.tipo === "tienda" };
  const sinPiso: Tolerado<{ separaPiso: false }> = { datos: { separaPiso: false }, fallo: null };

  if (persona.rol !== "lider") {
    const [lectura, temporadas] = await Promise.all([
      sede.tienda ? armarFrescuraSede({ id: sede.id, nombre: sede.nombre }, rpc, dias).then((f) => f.lectura) : Promise.resolve(sinPiso),
      nombresDeTemporadas(supabase),
    ]);
    return { sede, esLider: false, lectura, registro: null, cayla: null, tiendas: null, temporadas };
  }

  const tiendas = ubicaciones.filter((u) => u.tipo === "tienda");
  const [lider, temporadas] = await Promise.all([armarFrescuraLider(tiendas, rpc, dias), nombresDeTemporadas(supabase)]);
  const propia = lider.sedes.find((s) => s.ubicacionId === sede.id);
  return {
    sede,
    esLider: true,
    lectura: propia ? propia.lectura : sinPiso,
    registro: lider.confianza,
    cayla: lider.referenciaCayla,
    tiendas: lider.sedes.map((s) => ({
      id: s.ubicacionId,
      nombre: s.nombre,
      lectura: s.lectura.datos
        ? { datos: s.lectura.datos.separaPiso ? s.lectura.datos.cifras : { separaPiso: false as const }, fallo: null }
        : { datos: null, fallo: s.lectura.fallo },
    })),
    temporadas,
  };
}
