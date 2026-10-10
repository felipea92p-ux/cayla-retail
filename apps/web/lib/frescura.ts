import { createClient } from "@/lib/supabase/server";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getAparienciaVariantes } from "@/lib/apariencia-variantes";
import { enLaTabla } from "@/lib/frescura-pantalla";
import {
  armarFrescuraLider,
  armarFrescuraSede,
  type FilaConfianza,
  type FrescuraSede,
  type LlamarRpcFrescura,
  type RespuestaRpc,
  type VaraCategoria,
} from "@/lib/frescura-reglas";
import { leerRespaldoCayla } from "@/lib/frescura-vara-cayla";
import { avisoDatosDeHoy } from "@/lib/analisis-aviso";
import { leerPreparacion, preparacionDeSede, RPC_PREPARACION } from "@/lib/motor-demanda-reglas";
import { conPreciosDeSede, leerPreciosEnSede } from "@/lib/precio-sede-reglas";
import type { Familia, PuertaPiso } from "@/lib/frescura-piso";
import type { ResumenDecisiones } from "@/lib/frescura-decisiones-reglas";
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
 * Las tres lecturas, cada una por su NOMBRE LITERAL (no `supabase.rpc(fn, …)` con el nombre en una variable):
 * `scripts/pruebas/roles_cobertura_modulos.mjs` lee del código de la web qué funciones llama la pantalla, y así sabe que el
 * módulo «frescura» tiene su guardián en la base (`fn_frescura_sede`, `fn_confianza_registro` y, desde el paso 4b,
 * `fn_frescura_decisiones` preguntan por él).
 */
function rpcFrescura(supabase: Supabase): LlamarRpcFrescura {
  return (fn, args) =>
    fn === "fn_frescura_sede"
      ? supabase.rpc("fn_frescura_sede", args as { p_ubicacion_id: string; p_dias: number })
      : fn === "fn_frescura_decisiones"
        ? supabase.rpc("fn_frescura_decisiones", args as { p_ubicacion_id: string; p_dias: number })
        : fn === "fn_frescura_vara_cayla"
          ? // La vara de CAYLA (20261008120000): los tipos generados todavía no la traen, se llama por nombre.
            (supabase.rpc("fn_frescura_vara_cayla" as never) as unknown as PromiseLike<RespuestaRpc>)
          : supabase.rpc("fn_confianza_registro", args as { p_ubicacion_id?: string; p_meses?: number });
}

/**
 * Las cifras de una tienda para «Las N tiendas» —con la suma de lo decidido este mes (paso 4b), null si no se pudo leer—, o
 * `{ separaPiso: false }` si no separa piso y almacén.
 */
export type CifrasDeTienda = (FrescuraSede["cifras"] & { resumen: ResumenDecisiones | null }) | { separaPiso: false };

/** El color y la foto de una prenda (modelo+color): la misma fuente y regla que Existencias (`getAparienciaVariantes`). */
export type AparienciaPrenda = { colorHex: string | null; fotoUrl: string | null };
/** Lo que decide el ícono de una prenda sin foto (`SinFoto`, ADR-0333): `categorias.prefijo` y `categorias.familia`. */
export type CategoriaVisual = { prefijo: string | null; familia: string | null };

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
  /** La vara de CAYLA de respaldo (ADR-0208, act. 2026-10-07): de cuándo es (null = ninguna vigente) o por qué no se leyó. Lo
   *  que decidió con ella viaja en cada prenda (`juzgadaContra`) y en cada categoría (`respaldo`). */
  respaldoCayla: { calculadaEn: string | null; fallo: string | null };
  /** Solo el líder: cada tienda con sus cifras, para «Las N tiendas». */
  tiendas: { id: string; nombre: string; lectura: Tolerado<CifrasDeTienda> }[] | null;
  /** clave → nombre de cada temporada y la estación en que empieza. Vacío si no se pudo leer (la pantalla dice «su
   *  estación» en las frases y muestra la clave junto al color). */
  temporadas: NombresDeTemporadas;
  /** clave de la prenda → su color y su foto. Decorativo: si no se pudo leer viene vacío y la miniatura dibuja la percha. */
  apariencias: Record<string, AparienciaPrenda>;
  /** id de la categoría → lo que decide el ícono de su miniatura. Decorativo, como `apariencias`. De aquí sale también la familia de cada
   *  categoría para la barra de la tienda (si no se pudo leer, la barra va entera, sin partir por familia). */
  categoriasVisuales: Record<string, CategoriaVisual>;
  /** Las familias del catálogo (Indumentaria, Bisutería…), en su orden: la barra de la tienda va una por familia (ADR-0208, act.
   *  2026-10-10 (b)). Vacío si no se pudo leer. */
  familias: Familia[];
  /** variante → su precio en esta tienda (el general, o el propio de la tienda): los soles de la barra. Vacío si no se pudo leer (la
   *  barra no dice plata que no sabe entera). */
  precios: Record<string, number>;
  /** La puerta compartida con Análisis y el motor (`preparacionDeSede`): si la tienda ya registra lo que vende. Sin ella la barra se ve
   *  pero la frase no afirma nada. Null si no se pudo leer o la sede no es tienda. */
  puerta: PuertaPiso;
};

/**
 * La miniatura de cada prenda de la tabla (ADR-0333: sin foto, el ícono de su categoría sobre su color; nunca el isotipo). La
 * lectura de Frescura trae el NOMBRE del color pero no su hex ni la foto ni el prefijo de la categoría, así que se piden aquí,
 * por la talla de cada prenda, sin tocar la función SQL. Es un dato decorativo (`lib/resultado.ts`, `tolerar`): nadie decide
 * mirando una miniatura, así que si falla la pantalla sigue entera y cada prenda se dibuja con la percha.
 */
async function miniaturasDeLaTabla(supabase: Supabase, lectura: DatosFrescura["lectura"]): Promise<Pick<DatosFrescura, "apariencias" | "categoriasVisuales">> {
  const vacio = { apariencias: {}, categoriasVisuales: {} };
  const sede = lectura.datos;
  if (!sede || !sede.separaPiso) return vacio;
  try {
    const prendas = sede.prendas.filter(enLaTabla);
    const idsPorClave = new Map(prendas.map((p) => [p.clave, p.tallas[0]?.varianteId ?? null] as const));
    const categoriaIds = [...new Set(prendas.map((p) => p.categoriaId).filter((id) => id !== ""))];
    const [apariencia, categorias] = await Promise.all([
      getAparienciaVariantes(supabase, [...idsPorClave.values()].filter((id): id is string => id !== null)),
      categoriaIds.length > 0 ? supabase.from("categorias").select("id, prefijo, familia").in("id", categoriaIds) : Promise.resolve({ data: [], error: null }),
    ]);
    const apariencias: Record<string, AparienciaPrenda> = {};
    for (const [clave, varianteId] of idsPorClave) {
      const a = varianteId ? apariencia.get(varianteId) : undefined;
      if (a) apariencias[clave] = { colorHex: a.colorHex, fotoUrl: a.fotoUrl };
    }
    const categoriasVisuales: Record<string, CategoriaVisual> = {};
    if (!categorias.error) for (const c of categorias.data ?? []) categoriasVisuales[c.id] = { prefijo: c.prefijo ?? null, familia: c.familia ?? null };
    return { apariencias, categoriasVisuales };
  } catch {
    return vacio;
  }
}

/** Las familias del catálogo, en su orden. Si la lectura falla, ninguna: la barra de la tienda va entera. Nunca lanza. */
async function familiasDelCatalogo(supabase: Supabase): Promise<Familia[]> {
  try {
    const { data, error } = await supabase.from("familias").select("codigo, nombre, orden");
    if (error || !data) return [];
    return data.map((f) => ({ codigo: f.codigo, nombre: f.nombre, orden: Number(f.orden) || 0 }));
  } catch {
    return [];
  }
}

/** Ids por consulta: viajan en la URL, y una tienda grande cuelga cientos de tallas. */
const IDS_POR_CONSULTA = 100;

/**
 * El precio en esta tienda de cada talla colgada (`variantes.precio`, con el propio de la tienda encima: `fn_precios_en_sede`, la regla de
 * `fn_precio_en_sede`). Si algo falla, ninguno: la barra no dice soles que no sabe enteros. Nunca lanza.
 */
async function preciosDelPiso(supabase: Supabase, sedeId: string, lectura: DatosFrescura["lectura"]): Promise<Record<string, number>> {
  const sede = lectura.datos;
  if (!sede || !sede.separaPiso) return {};
  const ids = [...new Set(sede.prendas.flatMap((p) => p.tallas.filter((t) => t.pisoHoy > 0).map((t) => t.varianteId)))];
  if (ids.length === 0) return {};
  try {
    const trozos: string[][] = [];
    for (let i = 0; i < ids.length; i += IDS_POR_CONSULTA) trozos.push(ids.slice(i, i + IDS_POR_CONSULTA));
    const [lecturas, propios] = await Promise.all([
      Promise.all(trozos.map((t) => supabase.from("variantes").select("id, precio").in("id", t))),
      supabase.rpc("fn_precios_en_sede", { p_ubicacion_id: sedeId }),
    ]);
    if (lecturas.some((l) => l.error)) return {};
    const generales = new Map<string, number>();
    for (const l of lecturas) for (const v of l.data ?? []) if (v.precio !== null && Number.isFinite(Number(v.precio))) generales.set(v.id, Number(v.precio));
    // Sin la lectura de los propios, el general: la base cobra con `fn_precio_en_sede` igual; aquí solo se pesa la barra.
    return Object.fromEntries(propios.error ? generales : conPreciosDeSede(generales, leerPreciosEnSede(propios.data)));
  } catch {
    return {};
  }
}

/**
 * La puerta compartida (ADR-0346; la misma de Análisis, `avisoDatosDeHoy`): si la tienda ya registra lo que vende, con el piso cuadrado y
 * el almacén contado. Sin ella, lo vendido sin registrar sigue «colgado» y envejece en falso, así que la frase de Frescura no afirma nada.
 * Null si no se pudo leer. Nunca lanza.
 */
async function puertaDelPiso(supabase: Supabase, sedeId: string): Promise<PuertaPiso> {
  try {
    const { data, error } = await supabase.rpc(RPC_PREPARACION as never, { p_ubicacion_id: sedeId } as never);
    if (error) return null;
    const fila = leerPreparacion(data).find((f) => f.ubicacionId === sedeId);
    if (!fila) return null;
    const p = { ...preparacionDeSede(fila), dias: fila.dias, hoy: fila.hoy, primeraVenta: fila.primeraVenta };
    return { puedeHablar: p.puedeHablar, aviso: avisoDatosDeHoy(p) };
  } catch {
    return null;
  }
}

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
  // Las tres lecturas chicas a la vez —las sedes, la vara de CAYLA de respaldo y los nombres de las temporadas— y recién después
  // las tiendas: `analizarSede` necesita la vara al juzgar cada prenda. Si la vara falla no frena nada: se juzga contra la tienda y
  // la pantalla lo dice.
  const [ubicaciones, { respaldo, calculadaEn, fallo: falloRespaldo }, temporadas, familias] = await Promise.all([
    getUbicaciones(),
    leerRespaldoCayla(rpc, new Date().toISOString()),
    nombresDeTemporadas(supabase),
    familiasDelCatalogo(supabase),
  ]);
  const activa = ubicaciones.find((u) => u.id === persona.ubicacionId);
  const sede = { id: persona.ubicacionId, nombre: activa?.nombre ?? persona.ubicacionEtiqueta, tienda: activa?.tipo === "tienda" };
  const sinPiso: Tolerado<{ separaPiso: false }> = { datos: { separaPiso: false }, fallo: null };
  const respaldoCayla = { calculadaEn, fallo: falloRespaldo };
  // Lo que acompaña a la lectura de la sede, todo a la vez y tolerante: miniaturas, precios y la puerta.
  const deLaSede = async (lectura: DatosFrescura["lectura"]) => {
    const [miniaturas, precios, puerta] = await Promise.all([
      miniaturasDeLaTabla(supabase, lectura),
      preciosDelPiso(supabase, sede.id, lectura),
      sede.tienda ? puertaDelPiso(supabase, sede.id) : Promise.resolve(null),
    ]);
    return { ...miniaturas, familias, precios, puerta };
  };

  if (persona.rol !== "lider") {
    const lectura = sede.tienda ? (await armarFrescuraSede({ id: sede.id, nombre: sede.nombre }, rpc, dias, respaldo)).lectura : sinPiso;
    return { sede, esLider: false, lectura, registro: null, cayla: null, respaldoCayla, tiendas: null, temporadas, ...(await deLaSede(lectura)) };
  }

  const tiendas = ubicaciones.filter((u) => u.tipo === "tienda");
  const lider = await armarFrescuraLider(tiendas, rpc, dias, respaldo);
  const propia = lider.sedes.find((s) => s.ubicacionId === sede.id);
  const lecturaDeSede = propia ? propia.lectura : sinPiso;
  return {
    sede,
    esLider: true,
    lectura: lecturaDeSede,
    registro: lider.confianza,
    cayla: lider.referenciaCayla,
    respaldoCayla,
    tiendas: lider.sedes.map((s) => ({
      id: s.ubicacionId,
      nombre: s.nombre,
      lectura: s.lectura.datos
        ? {
            datos: s.lectura.datos.separaPiso
              ? { ...s.lectura.datos.cifras, resumen: s.lectura.datos.decisiones.estado === "ok" ? s.lectura.datos.decisiones.resumen : null }
              : { separaPiso: false as const },
            fallo: null,
          }
        : { datos: null, fallo: s.lectura.fallo },
    })),
    temporadas,
    ...(await deLaSede(lecturaDeSede)),
  };
}
