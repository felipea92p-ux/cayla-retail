// «Prendas parecidas» en el alta — la LECTURA real de lo que ya existe, sin React: el lector contra la base y el control que
// lleva la carrera, el plazo y la memoria. Vive aparte del hook (`useCandidatasAlta.ts`, que es "use client") porque es lógica
// pura: un Server Component no puede llamar funciones de un archivo cliente (CLAUDE.md), y esta no tiene por qué serlo.
//
// EL PROBLEMA. Al elegir la marca (o, sin marca, la categoría) la alerta necesita ver las prendas que ya hay con su foto,
// colores, tallas y stock. Son varias lecturas que llegan en distinto momento; la persona cambia de marca mientras una
// anterior vuela, vuelve atrás, o pierde la red. El control tiene que entregar SIEMPRE lo de la marca vigente, sin parpadear
// con lo de la anterior y sin dejar la pantalla esperando.
//
// CONTRATO
//   PROMETE: no lee nada si `activo` es falso o no hay ni marca ni categoría. Cancela lo que quedó atrás (AbortController) y
//            vence a los 6 s SIN `AbortSignal.timeout` (no existe en el Safari viejo de las tablets de tienda; ver
//            `use-parecidos.ts`). Un resultado tardío de una marca anterior NUNCA pisa al vigente. Guarda en memoria lo leído
//            para no releer al volver atrás (`VIGENCIA_MEMORIA_MS`); los extras (prendas de otra marca) vencen igual.
//            Si algo falla devuelve `fallo = true` Y las candidatas que sí pudo leer; `reintentar()` vuelve a leer sin vaciar
//            lo que ya se veía. Las lecturas son GET o RPC `fn_*` de solo lectura: el loader global (ADR-0149,
//            `espera-reglas.ts`) no las bloquea, no hace falta `x-espera: no`.
//            Lo que COMPLEMENTA (temporadas, sedes, stock, fotos, sede de origen, y las páginas 2 en adelante de `fn_productos`)
//            tiene un tope propio de `PLAZO_COMPLEMENTO_MS`: una de esas lecturas colgada no tumba la lista, se degrada
//            (sin ese dato, o `LecturaParcial` si falta algo que la persona necesita ver). Solo una lectura ESENCIAL colgada
//            (la primera página de `fn_productos`, las fichas) agota el plazo de 6 s y deja `fallo = true` sin candidatas.
//            Una página de `fn_productos` que PostgREST cortó en silencio (1.000 filas) se detecta y la lectura sale parcial.
//   ASUME:   que la memoria vive lo que vive el hook (un alta): un alta nueva empieza en blanco. Con marca se lee TODA la marca
//            (la categoría solo ordena después); sin marca, la categoría (D5). El uuid nulo de «sin marca» cuenta como no haber
//            elegido marca; una marca comodín («Importado») la convierte en `null` quien llama (ver `ambitoDeLectura`). Sin
//            sesión, las políticas de la base devuelven vacío y se ve como «no hay prendas».
//            Un `leer` inyectado debe aceptar dos llamadas: la de la lista (marca o categoría, `idsExtra` vacío) y la de SOLO
//            EXTRAS (`marcaId` y `categoriaId` nulos, `idsExtra` con las prendas de otra marca que marcó la comprobación de
//            nombres): el control las pide aparte, cuando la lista ya llegó, para no pedir dos veces lo que ya vino en ella.
//            Puede lanzar `LecturaParcial` (con las candidatas que sí armó) o cualquier error: ambos dan `fallo = true`.
//   NO HACE: no compara ni ordena (eso es `parecidas-alta-reglas.ts`), no guarda precio ni costo (se descartan al leer), no escribe.
//
// TRES PIEZAS EN ESTE ARCHIVO, de la más honda a la más fina, para poder probar cada una sin React ni red:
//   1. `crearLectorDeLaBase(cliente)`     las lecturas contra la base (el cliente se inyecta: las pruebas le pasan uno de juguete).
//   2. `crearControlCandidatas(opciones)` la carrera, el plazo y la memoria, sin React (el lector también se inyecta).
//   3. (el hook, en `useCandidatasAlta.ts`) solo conecta el control con React.

import type { createClient } from "./supabase/client";
import type { CandidataAlta, LectorCandidatas, ParametrosCandidatas } from "./parecidas-alta-tipos";
import { leerExistenciasProductos } from "./productos-stock";
import type { Temporada } from "./temporada-reglas";
import {
  ambitoDeLectura,
  idsSinRepetir,
  construirCandidatas,
  LecturaParcial,
  leerFilasProductos,
  leerFilasVariantesDirectas,
  leerFotos,
  leerOrigenes,
  leerPaginaDeProductos,
  leerSedes,
  trocear,
  type AmbitoDeLectura,
  type FilaVariante,
  type SedeActiva,
} from "./candidatas-alta-datos";

// ============================================================================
// Números que mandan (todos medidos o decididos, ninguno al tuntún)
// ============================================================================

/** Lo que vence una lectura entera: más que eso y la pantalla dice «no pude ver» y la base vuelve a comprobar al crear. */
export const PLAZO_LECTURA_MS = 6000;
/**
 * El tope de cada lectura que COMPLEMENTA. En producción (2026-09-30, como Integrante) la más lenta tarda ~40 ms en la base; que
 * pase de 2,5 s es una caída, no lentitud. Con este tope, una colgada (y en la primera lectura de un hook van tres juntas) le
 * quita a la lista lo suyo, no la lista entera: así quedan 3,5 s para lo esencial.
 */
export const PLAZO_COMPLEMENTO_MS = 2500;
/** Cuánto vale lo guardado en memoria: si la persona se queda mucho en la misma pantalla, otra sede pudo cargar algo. */
export const VIGENCIA_MEMORIA_MS = 3 * 60_000;
/**
 * `fn_productos` devuelve UNA FILA POR VARIANTE y PostgREST corta la respuesta en 1.000 filas sin avisar (`max_rows`). Con 50
 * prendas por página caben hasta 20 variantes por prenda de promedio (hoy: 6 de promedio, 16 la que más tiene); con las 100 que
 * permite la función, se perdían prendas enteras desde las 10. Hasta 6 páginas (300 prendas, lo más reciente primero).
 */
export const PRODUCTOS_POR_PAGINA_LECTURA = 50;
export const MAX_PAGINAS_LECTURA = 6;
export const TOPE_FILAS_POSTGREST = 1000;
/** Uuids por consulta: 50 caben con holgura en la URL (≈ 1,9 KB) y en el tope de filas de PostgREST (1.000). */
export const TAMANO_LOTE_IDS = 50;

// ============================================================================
// 1. Las lecturas contra la base
// ============================================================================

export type ClienteLectura = ReturnType<typeof createClient>;

/** Una lectura que se quedó sin tiempo o la cancelaron. */
export class LecturaCancelada extends Error {
  constructor() {
    super("La lectura de las prendas que ya existen se canceló o se quedó sin tiempo.");
    this.name = "LecturaCancelada";
  }
}

/**
 * Una señal que se aborta sola a los `plazoMs`, y también cuando se aborta `padre` (si se da). Sin `AbortSignal.timeout` ni
 * `AbortSignal.any`, que el Safari viejo de las tablets no tiene. `limpiar` apaga el temporizador y suelta al padre.
 */
export function crearSenalConPlazo(plazoMs: number, padre?: AbortSignal): { senal: AbortSignal; limpiar: () => void } {
  const control = new AbortController();
  const corte = setTimeout(() => control.abort(), plazoMs);
  const alAbortarElPadre = () => control.abort();
  if (padre) {
    if (padre.aborted) control.abort();
    else padre.addEventListener("abort", alAbortarElPadre, { once: true });
  }
  return {
    senal: control.signal,
    limpiar: () => {
      clearTimeout(corte);
      padre?.removeEventListener("abort", alAbortarElPadre);
    },
  };
}

/** Corre `hacer` con una señal que vence a los `PLAZO_COMPLEMENTO_MS` y que también se aborta con `padre` (si lo hay). */
async function conTope<T>(padre: AbortSignal | undefined, hacer: (senal: AbortSignal) => Promise<T>): Promise<T> {
  const { senal, limpiar } = crearSenalConPlazo(PLAZO_COMPLEMENTO_MS, padre);
  try {
    return await hacer(senal);
  } finally {
    limpiar();
  }
}

/** Una lectura que complementa: cualquier fallo o demora es `null` («no se sabe»), nunca un error que tumbe la lista. */
async function opcional<T>(
  padre: AbortSignal | undefined,
  hacer: (senal: AbortSignal) => PromiseLike<{ data: unknown; error: unknown }>,
  convertir: (datos: unknown) => T,
): Promise<T | null> {
  try {
    return await conTope(padre, async (senal) => {
      const { data, error } = await hacer(senal);
      return error || data == null ? null : convertir(data);
    });
  } catch {
    return null;
  }
}

/** Lo que se lee una vez por hook y se recuerda (temporadas, sedes): un fallo NO se guarda, se vuelve a intentar. */
function conMemoria<T>(leer: () => Promise<T | null>): () => Promise<T | null> {
  let guardada: T | null = null;
  let enVuelo: Promise<T | null> | null = null;
  return () => {
    if (guardada !== null) return Promise.resolve(guardada);
    if (!enVuelo) {
      enVuelo = leer()
        .then((r) => {
          if (r !== null) guardada = r;
          return r;
        })
        .finally(() => {
          enVuelo = null;
        });
    }
    return enVuelo;
  };
}

const lanzarSiCancelada = (senal: AbortSignal) => {
  if (senal.aborted) throw new LecturaCancelada();
};

/** Una página de `fn_productos`. Los parámetros van LITERALES (no un spread): `pnpm datos:comparar` los lee del código. */
async function pedirPagina(cliente: ClienteLectura, ambito: AmbitoDeLectura, pagina: number, senal: AbortSignal): Promise<unknown> {
  const { data, error } = ambito.marcaId
    ? await cliente
        .rpc("fn_productos", { p_marca_id: ambito.marcaId, p_orden: "recientes", p_pagina: pagina, p_por_pagina: PRODUCTOS_POR_PAGINA_LECTURA })
        .abortSignal(senal)
    : await cliente
        .rpc("fn_productos", { p_categoria_id: ambito.categoriaId ?? undefined, p_orden: "recientes", p_pagina: pagina, p_por_pagina: PRODUCTOS_POR_PAGINA_LECTURA })
        .abortSignal(senal);
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Las páginas de `fn_productos`, de la más reciente a la más antigua: así, si una categoría trae más de 300, lo que se corta
 * es lo más viejo. La primera página es ESENCIAL y va sola (de ella sale el total): si falla, falla la lectura, no hay nada que
 * mostrar. Las demás van TODAS A LA VEZ y cada una con su tope: una que falla, que tarda demasiado o que PostgREST cortó deja lo
 * ya leído y la lectura sale parcial (`completa = false`).
 */
async function leerPaginasDeProductos(cliente: ClienteLectura, ambito: AmbitoDeLectura, senal: AbortSignal): Promise<{ filas: FilaVariante[]; completa: boolean }> {
  let primera: ReturnType<typeof leerPaginaDeProductos>;
  try {
    primera = leerPaginaDeProductos(await pedirPagina(cliente, ambito, 1, senal), 1, PRODUCTOS_POR_PAGINA_LECTURA, TOPE_FILAS_POSTGREST);
  } catch (e) {
    lanzarSiCancelada(senal); // una señal abortada no es «falló la base»: es que ya no importa
    throw e;
  }
  if (primera.filas.length === 0) return { filas: [], completa: true };

  const paginas = Math.min(MAX_PAGINAS_LECTURA, Math.ceil(primera.total / PRODUCTOS_POR_PAGINA_LECTURA));
  const demas = await Promise.all(
    Array.from({ length: Math.max(0, paginas - 1) }, (_, i) => {
      const pagina = i + 2;
      return conTope(senal, async (s) => leerPaginaDeProductos(await pedirPagina(cliente, ambito, pagina, s), pagina, PRODUCTOS_POR_PAGINA_LECTURA, TOPE_FILAS_POSTGREST)).catch(() => null);
    }),
  );

  const filas = [...primera.filas];
  let completa = !primera.cortada;
  for (const p of demas) {
    if (!p) {
      completa = false;
      continue;
    }
    filas.push(...p.filas);
    if (p.cortada) completa = false;
  }
  return { filas, completa };
}

// Las columnas que se piden a cada tabla, una por una: `variantes.costo` no es legible para la web (la base lo niega) y
// `select *` fallaría; además así no viaja nada que el contrato no use. (`propuesto_por` tampoco: la sede donde se cargó sale
// de `fn_producto_origen`, no de quién la propuso.)
const SELECT_PRODUCTOS =
  "id, referencia, descripcion, temporada, created_at, estado, estado_alta, categoria_id, marca_id, categoria:categorias(nombre), marca:marcas(nombre), tejido:tejidos(nombre), patron:patrones(nombre)";
const SELECT_VARIANTES = "producto_id, color_codigo, activo, talla:tallas(valor), color:colores(nombre, hex)";
const SELECT_FOTOS = "producto_id, url, orden, es_principal, color_codigo";

/** Falla de UNA tanda = falla la lectura (`null`): mejor «no sé» que una ficha a medias que parezca completa. */
async function leerEnTandas(
  ids: readonly string[],
  senal: AbortSignal,
  pedir: (lote: string[], senal: AbortSignal) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<unknown[] | null> {
  try {
    const respuestas = await Promise.all(
      trocear(ids, TAMANO_LOTE_IDS).map(async (lote) => {
        lanzarSiCancelada(senal);
        const { data, error } = await pedir(lote, senal);
        if (error) throw error;
        return Array.isArray(data) ? data : [];
      }),
    );
    return respuestas.flat();
  } catch {
    return null;
  }
}

/**
 * El lector de verdad. `cliente` se inyecta: la pantalla le pasa `createClient()` y las pruebas uno de juguete.
 * Devuelve las candidatas; si alguna lectura de las que la persona necesita ver falla (el texto de la ficha, las variantes de
 * otra marca, las fotos, una página de la lista), lanza `LecturaParcial` con las que sí pudo armar. Sin marca ni categoría lee
 * SOLO `idsExtra` (las prendas que la comprobación de nombres marcó, que pueden ser de otra marca o categoría).
 *
 * Lecturas por selección de marca (dos rondas, lo de cada ronda va en paralelo):
 *   ronda 1  `fn_productos` (página 1, y las demás juntas) · y, UNA vez por hook, `fn_temporadas` y `ubicaciones`
 *   ronda 2  `productos` (1 consulta por 50 prendas) · `fn_existencias_productos` · `fn_producto_origen` ·
 *            `producto_fotos` (solo si a alguna variante le falta)
 * Con `idsExtra` que no estén en la lista: `variantes` de esas prendas en la ronda 2 (y sus fotos).
 */
export function crearLectorDeLaBase(cliente: ClienteLectura): LectorCandidatas {
  // Complementos compartidos por todas las lecturas de este hook: cada uno con su tope y sin tumbar nada si falla.
  const temporadas = conMemoria<Temporada[]>(() =>
    opcional(
      undefined,
      (senal) => cliente.rpc("fn_temporadas").abortSignal(senal),
      (datos) => (Array.isArray(datos) ? (datos as Temporada[]) : []),
    ).then((r) => (r && r.length > 0 ? r : null)),
  );
  const sedes = conMemoria<SedeActiva[]>(() =>
    opcional(undefined, (senal) => cliente.from("ubicaciones").select("id, nombre, tipo").eq("activo", true).abortSignal(senal), leerSedes).then((r) =>
      r && r.length > 0 ? r : null,
    ),
  );

  return async ({ marcaId, categoriaId, idsExtra, senal }) => {
    const ambito = ambitoDeLectura(marcaId, categoriaId);
    const extras = idsSinRepetir(idsExtra);
    if (ambito.ambito === "ninguno" && extras.length === 0) return [];

    // Ronda 1. Los dos de contexto nunca fallan hacia arriba (devuelven null), tienen su tope y arrancan ya, en paralelo.
    const enContexto = Promise.all([temporadas(), sedes()]);
    let filas: FilaVariante[] = [];
    const motivos: string[] = [];
    if (ambito.ambito !== "ninguno") {
      const leidas = await leerPaginasDeProductos(cliente, ambito, senal);
      filas = leidas.filas;
      if (!leidas.completa) motivos.push("faltan prendas del catálogo");
    }
    lanzarSiCancelada(senal);

    const principales = idsSinRepetir(filas.map((f) => f.productoId));
    const vistos = new Set(principales);
    const deOtraMarca = extras.filter((id) => !vistos.has(id));
    const todos = [...principales, ...deOtraMarca];
    if (todos.length === 0) return [];

    // Solo si a alguna variante le falta la foto, se piden las de la prenda (las de otra marca no traen ninguna: siempre).
    const conFotoFaltante = new Set(filas.filter((f) => f.fotoUrl === null).map((f) => f.productoId));
    const paraFotos = [...principales.filter((id) => conFotoFaltante.has(id)), ...deOtraMarca];

    // Ronda 2, toda en paralelo. Esenciales (van con el plazo de la lectura): fichas y variantes de otra marca. Complementos
    // (cada uno con su tope): stock, sede donde se cargó, fotos.
    const [productos, variantesAjenas, existencias, fotos, origen] = await Promise.all([
      leerEnTandas(todos, senal, (lote, s) => cliente.from("productos").select(SELECT_PRODUCTOS).in("id", lote).neq("estado_alta", "rechazado").abortSignal(s)),
      deOtraMarca.length === 0
        ? Promise.resolve<unknown[] | null>([])
        : leerEnTandas(deOtraMarca, senal, (lote, s) => cliente.from("variantes").select(SELECT_VARIANTES).in("producto_id", lote).abortSignal(s)),
      // Sin sede (`p_ubicacion_id = null`): `otras` trae TODAS las tiendas por nombre y `en_taller` todo el Taller.
      // Si no se pudo leer: `disponible = null`, la tarjeta dice «no se pudo leer»: nunca un cero inventado.
      opcional(senal, (s) => cliente.rpc("fn_existencias_productos" as never, { p_producto_ids: todos, p_ubicacion_id: null } as never).abortSignal(s), leerExistenciasProductos),
      paraFotos.length === 0
        ? Promise.resolve<unknown[] | null>([])
        : conTope(senal, (s) => leerEnTandas(paraFotos, s, (lote, sl) => cliente.from("producto_fotos").select(SELECT_FOTOS).in("producto_id", lote).abortSignal(sl))),
      // Dónde se cargó (ADR-0292, `security definer`: la lee toda cuenta con sesión, a diferencia de `colaboradores`). Sin ella,
      // `cargadaEn = null` y la tarjeta dice solo «hace X h». NO se infiere de dónde trabaja hoy quien la propuso.
      opcional(senal, (s) => cliente.rpc("fn_producto_origen" as never, { p_producto_ids: todos } as never).abortSignal(s), leerOrigenes),
    ]);
    lanzarSiCancelada(senal);

    if (productos === null) motivos.push("no se leyó el detalle de las fichas");
    if (variantesAjenas === null) motivos.push("no se leyeron las variantes de las prendas de otra marca");
    // Una foto que no se pudo leer NO es «sin foto todavía»: la foto es la evidencia, así que se avisa en vez de afirmar lo falso.
    if (fotos === null) motivos.push("no se leyeron las fotos de algunas prendas");

    const [temporadasLeidas, sedesLeidas] = await enContexto; // a lo más PLAZO_COMPLEMENTO_MS desde que arrancaron
    lanzarSiCancelada(senal);
    const candidatas = construirCandidatas({
      variantes: [...filas, ...leerFilasVariantesDirectas(variantesAjenas)],
      productos: productos === null ? null : leerFilasProductos(productos),
      existencias,
      sedes: sedesLeidas,
      fotos: leerFotos(fotos),
      origen,
      temporadas: temporadasLeidas,
    });
    if (motivos.length > 0) throw new LecturaParcial(candidatas, motivos.join("; "));
    return candidatas;
  };
}

// ============================================================================
// 2. El control: carrera, plazo y memoria, sin React
// ============================================================================

export type InstantaneaCandidatas = {
  /** De qué lectura es (`AmbitoDeLectura.clave`): el hook solo muestra la que coincide con lo que la pantalla tiene elegido AHORA. */
  clave: string;
  candidatas: CandidataAlta[];
  cargando: boolean;
  fallo: boolean;
};

export const SIN_CANDIDATAS: CandidataAlta[] = [];
const VACIA: InstantaneaCandidatas = Object.freeze({ clave: "", candidatas: SIN_CANDIDATAS, cargando: false, fallo: false });

export type OpcionesControl = {
  /** El lector inyectado (pruebas y página de prueba). Puede cambiarse después con `usarLector`. */
  leer?: LectorCandidatas;
  /** Cómo armar el lector de verdad cuando no hay uno inyectado: se llama UNA vez, al primer uso (así renderizar no toca la red). */
  crearLector?: () => LectorCandidatas;
  /** Ahora, en milisegundos. Se inyecta para probar la vigencia de la memoria. */
  ahora?: () => number;
  plazoMs?: number;
  vigenciaMs?: number;
};

export type PeticionControl = Pick<ParametrosCandidatas, "marcaId" | "categoriaId" | "idsExtra" | "activo">;

type Carga = { cancelar: () => void };

/** Un extra leído (prenda de otra marca): `candidata = null` = la base no la tiene (o no se ve). `en` = cuándo, para que venza. */
type Extra = { candidata: CandidataAlta | null; en: number };

/**
 * La parte sin React. `sincronizar` se llama cada vez que cambian los parámetros y es idempotente. Dos carriles:
 *   · la LISTA de la marca (o categoría), con su memoria por ámbito;
 *   · los EXTRAS (ids de otra marca que marcó la comprobación de nombres), por id, que esperan a la lista para no pedir
 *     dos veces lo que ya vino en ella. Su memoria vence igual que la de la lista (su stock también envejece).
 * Cada carril lleva su número de generación: lo que llega con un número viejo se descarta, no importa cuándo llegue.
 */
export function crearControlCandidatas(opciones: OpcionesControl) {
  const ahora = opciones.ahora ?? Date.now;
  const plazoMs = opciones.plazoMs ?? PLAZO_LECTURA_MS;
  const vigenciaMs = opciones.vigenciaMs ?? VIGENCIA_MEMORIA_MS;

  let inyectado: LectorCandidatas | undefined = opciones.leer;
  let propio: LectorCandidatas | null = null;
  const leer: LectorCandidatas = (p) => {
    if (inyectado) return inyectado(p);
    propio ??= opciones.crearLector?.() ?? null;
    if (!propio) throw new Error("No hay con qué leer las prendas que ya existen.");
    return propio(p);
  };

  const memoria = new Map<string, { candidatas: CandidataAlta[]; en: number }>();
  const extras = new Map<string, Extra>();
  const extrasFallidos = new Set<string>();
  const oyentes = new Set<() => void>();
  /** Un extra que sigue valiendo: leído hace menos de `vigenciaMs`. */
  const vigente = (e: Extra | undefined): e is Extra => !!e && ahora() - e.en < vigenciaMs;

  let snapshot: InstantaneaCandidatas = VACIA;
  let peticion: { ambito: AmbitoDeLectura; idsExtra: string[] } | null = null;
  let base: InstantaneaCandidatas = VACIA;
  let cargaBase: Carga | null = null;
  let cargaExtras: Carga | null = null;
  let generacionBase = 0;
  let generacionExtras = 0;

  /** Lanza una lectura con su señal, su plazo y su botón de cancelar. Aunque el lector ignore la señal, el plazo la rechaza. */
  function lanzar(p: { marcaId: string | null; categoriaId: string | null; idsExtra: string[] }): { promesa: Promise<CandidataAlta[]>; cancelar: () => void } {
    const control = new AbortController();
    const corte = setTimeout(() => control.abort(), plazoMs);
    const vencida = new Promise<never>((_, rechazar) => {
      control.signal.addEventListener("abort", () => rechazar(new LecturaCancelada()), { once: true });
    });
    const real = (async () => leer({ ...p, senal: control.signal }))();
    real.catch(() => {}); // si la carrera ya la ganó el plazo, su rechazo tardío no es un error sin atender
    const promesa = Promise.race([real, vencida]);
    const limpiar = () => clearTimeout(corte);
    promesa.then(limpiar, limpiar);
    return {
      promesa,
      cancelar: () => {
        limpiar();
        control.abort();
      },
    };
  }

  function publicar() {
    const ids = peticion?.idsExtra ?? [];
    const enBase = new Set(base.candidatas.map((c) => c.id));
    const deExtras = ids.map((id) => extras.get(id)?.candidata).filter((c): c is CandidataAlta => !!c && !enBase.has(c.id));
    snapshot = {
      clave: base.clave,
      candidatas: deExtras.length > 0 ? [...base.candidatas, ...deExtras] : base.candidatas,
      // Solo la lista da «cargando»: los extras llegan después y la engrosan sin apagarla (si no, cada tecla parpadearía).
      cargando: base.cargando,
      fallo: base.fallo || ids.some((id) => extrasFallidos.has(id)),
    };
    oyentes.forEach((f) => f());
  }

  function resolverExtras() {
    if (!peticion || base.cargando || cargaExtras) return;
    const enBase = new Set(base.candidatas.map((c) => c.id));
    // Se pide lo que falta o lo que ya venció; lo vencido se sigue mostrando hasta que llegue lo nuevo.
    const faltan = peticion.idsExtra.filter((id) => !enBase.has(id) && !extrasFallidos.has(id) && !vigente(extras.get(id)));
    if (faltan.length === 0) return;
    const g = ++generacionExtras;
    const { promesa, cancelar } = lanzar({ marcaId: null, categoriaId: null, idsExtra: faltan });
    cargaExtras = { cancelar };
    promesa.then(
      (lista) => {
        if (g !== generacionExtras) return;
        cargaExtras = null;
        const en = ahora();
        const hallados = new Set<string>();
        for (const c of lista) {
          extras.set(c.id, { candidata: c, en });
          hallados.add(c.id);
        }
        for (const id of faltan) if (!hallados.has(id)) extras.set(id, { candidata: null, en });
        publicar();
        resolverExtras(); // los ids pudieron cambiar mientras tanto
      },
      (error: unknown) => {
        if (g !== generacionExtras) return;
        cargaExtras = null;
        // Lo que sí llegó se muestra; TODO lo pedido queda como fallido (se relee en `reintentar`), así `fallo` sigue en pie.
        if (error instanceof LecturaParcial) for (const c of error.candidatas) extras.set(c.id, { candidata: c, en: ahora() });
        for (const id of faltan) extrasFallidos.add(id);
        publicar();
        resolverExtras();
      },
    );
  }

  function cargarBase(ambito: AmbitoDeLectura, conservar: boolean) {
    cargaBase?.cancelar();
    const g = ++generacionBase;
    base = { clave: ambito.clave, candidatas: conservar && base.clave === ambito.clave ? base.candidatas : SIN_CANDIDATAS, cargando: true, fallo: false };
    const { promesa, cancelar } = lanzar({ marcaId: ambito.marcaId, categoriaId: ambito.categoriaId, idsExtra: [] });
    cargaBase = { cancelar };
    publicar();
    promesa.then(
      (candidatas) => {
        if (g !== generacionBase) return; // llegó tarde: ya se eligió otra marca
        cargaBase = null;
        memoria.set(ambito.clave, { candidatas, en: ahora() });
        base = { clave: ambito.clave, candidatas, cargando: false, fallo: false };
        publicar();
        resolverExtras();
      },
      (error: unknown) => {
        if (g !== generacionBase) return;
        cargaBase = null;
        // A medias (se leyó la lista pero faltó algo): se muestra lo que hay y se avisa. Nunca se guarda en memoria.
        base = {
          clave: ambito.clave,
          candidatas: error instanceof LecturaParcial ? error.candidatas : base.candidatas,
          cargando: false,
          fallo: true,
        };
        publicar();
        resolverExtras();
      },
    );
  }

  function anular() {
    cargaBase?.cancelar();
    cargaExtras?.cancelar();
    cargaBase = null;
    cargaExtras = null;
    generacionBase++;
    generacionExtras++;
    peticion = null;
    base = VACIA;
    if (snapshot !== VACIA) {
      snapshot = VACIA;
      oyentes.forEach((f) => f());
    }
  }

  return {
    suscribir(alCambiar: () => void) {
      oyentes.add(alCambiar);
      return () => {
        oyentes.delete(alCambiar);
      };
    },
    instantanea: () => snapshot,

    /** Cambia el lector inyectado (o lo quita: `undefined` vuelve al de la base). Vale desde la PRÓXIMA lectura; la memoria no se toca. */
    usarLector(lector: LectorCandidatas | undefined) {
      inyectado = lector;
    },

    sincronizar(p: PeticionControl) {
      const ambito = p.activo ? ambitoDeLectura(p.marcaId, p.categoriaId) : ambitoDeLectura(null, null);
      if (ambito.ambito === "ninguno") {
        anular();
        return;
      }
      peticion = { ambito, idsExtra: idsSinRepetir(p.idsExtra) };
      if (base.clave === ambito.clave) {
        // Misma lista: solo pudieron cambiar los extras.
        resolverExtras();
        publicar();
        return;
      }
      const guardada = memoria.get(ambito.clave);
      if (guardada && ahora() - guardada.en < vigenciaMs) {
        cargaBase?.cancelar();
        cargaBase = null;
        generacionBase++;
        base = { clave: ambito.clave, candidatas: guardada.candidatas, cargando: false, fallo: false };
        publicar();
        resolverExtras();
        return;
      }
      memoria.delete(ambito.clave);
      cargarBase(ambito, false);
    },

    /**
     * Vuelve a leer lo de ahora (lista y extras), sin mirar la memoria. Mientras tanto se sigue viendo lo que había: los extras
     * ya leídos se marcan como vencidos (se releen) pero no se borran, para que no parpadeen.
     */
    reintentar() {
      if (!peticion) return;
      memoria.delete(peticion.ambito.clave);
      for (const e of extras.values()) e.en = Number.NEGATIVE_INFINITY;
      extrasFallidos.clear();
      cargaExtras?.cancelar();
      cargaExtras = null;
      generacionExtras++;
      cargarBase(peticion.ambito, true);
    },

    /** Al desmontar (o al apagar el efecto): cancela lo que vuela. La memoria se conserva: en React StrictMode el efecto se arma dos veces. */
    cerrar: anular,
  };
}
