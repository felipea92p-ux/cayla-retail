// «Prendas parecidas» en el alta — de lo que devuelven las lecturas de la base a `CandidataAlta[]`. Sin React ni red.
//
// EL PROBLEMA. La alerta necesita por cada prenda que ya existe: foto, colores, tallas, stock por sede, cuándo y dónde se
// cargó. Nada de eso llega en UNA lectura: `fn_productos` trae las variantes (y con ellas precio y costo, que aquí no
// se guardan), la tabla `productos` trae el texto de la ficha, el stock sale de `fn_existencias_productos` y la sede donde
// se cargó, de `fn_producto_origen` (ADR-0292). Este archivo las junta, una prenda por ficha, y descarta todo lo que no es
// del contrato (`parecidas-alta-tipos.ts`).
//
// CONTRATO
//   PROMETE: cada función `leer*` se queda SOLO con las columnas que el contrato usa (un campo que no se copia no se puede
//            filtrar por un descuido: precio y costo no pasan de aquí; ojo, SÍ viajan en la respuesta HTTP de `fn_productos`
//            hasta el navegador —el precio es público y el costo solo le llega a quien ya ve el dinero de compras—, pero
//            ninguna `CandidataAlta` los lleva). `construirCandidatas` devuelve una `CandidataAlta` por prenda, con tallas en
//            el orden de la curva, colores sin repetir, y `disponible = null` si no se pudo leer el stock (nunca un cero
//            inventado). Una fila rara se salta; nunca tumba la lista. `disponible.total` es lo vendible en TIENDAS: el
//            Taller se lista aparte y no se suma (ADR-0270, decisión 4). `cargadaEn` es un dato VERIFICADO (la sede desde
//            la que se operó el alta) o `null`; nunca se infiere de dónde trabaja hoy quien la propuso.
//   ASUME:   que quien llama ya pidió lo que corresponde (marca o categoría) y pasa las lecturas tal como respondió la base.
//            Que `existencias` se pidió SIN sede (`p_ubicacion_id = null`): así `otras` trae TODAS las tiendas por nombre y
//            no hay «aquí» que nombrar (por eso `aqui` no se suma: es 0 por construcción). Que quien elige la marca pasa
//            `marcaId = null` cuando es un comodín como «Importado» (D5): aquí no hay cómo saber qué marca es comodín.
//   NO HACE: no lee nada, no decide qué se parece (eso es `parecidas-alta-reglas.ts`) y no guarda precio ni costo.
//
// Se importa SOLO con rutas relativas (nada de `@/`): las pruebas de esta carpeta corren en vitest sin el alias.

import type { AmbitoParecidas, CandidataAlta, SedeDisponible } from "./parecidas-alta-tipos";
import type { FotoCruda } from "./producto-fotos-reglas";
import { SIN_EXISTENCIAS, type ExistenciasProducto } from "./productos-stock";
import { compararTallas } from "./tallas";
import { nombreTemporada, type Temporada } from "./temporada-reglas";

// ============================================================================
// Qué se lee: marca o categoría (Felipe, D5), y qué ids se piden juntos
// ============================================================================

/** El uuid nulo: así le llega a `fn_productos` «las prendas SIN marca» (ADR-0283: `marca_id is not distinct from null`). */
export const MARCA_SIN_MARCA_ID = "00000000-0000-0000-0000-000000000000";

export type AmbitoDeLectura = {
  ambito: AmbitoParecidas;
  /** Con marca se lee TODA la marca (todas sus categorías): la categoría solo ordena después, no acota. */
  marcaId: string | null;
  /** Solo sin marca: la lista sale de la categoría (D5). */
  categoriaId: string | null;
  /** Identifica lo que se leyó: la marca gana, y cambiar de categoría dentro de la misma marca NO obliga a releer. */
  clave: string;
};

const limpiarId = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim().toLowerCase();
  return t === "" || t === MARCA_SIN_MARCA_ID ? null : t;
};

/**
 * Marca o categoría. El uuid nulo de «sin marca» se trata como NO haber elegido marca: listar «todas las prendas sin marca»
 * de todas las categorías no es lo que pide D5 (sin marca, o «Importado», manda la categoría con su buscador).
 *
 * OJO con «Importado»: aquí solo se reconoce el uuid nulo. Una marca comodín REAL (tiene su propio id) se leería como marca,
 * y saldrían todas sus prendas de todas las categorías. Por eso quien elige la marca pasa `marcaId = null` cuando la marca
 * es un comodín (lo mismo que hace con el nombre de la marca en `parecidas-alta-vista.ts`: `null` = sin marca o comodín).
 */
export function ambitoDeLectura(marcaId: string | null | undefined, categoriaId: string | null | undefined): AmbitoDeLectura {
  const m = limpiarId(marcaId);
  if (m) return { ambito: "marca", marcaId: m, categoriaId: null, clave: `marca:${m}` };
  const c = limpiarId(categoriaId);
  if (c) return { ambito: "categoria", marcaId: null, categoriaId: c, clave: `categoria:${c}` };
  return { ambito: "ninguno", marcaId: null, categoriaId: null, clave: "" };
}

/** Ids en minúscula, sin vacíos ni repetidos, ordenados: la misma lista siempre da la misma clave. */
export function idsSinRepetir(ids: readonly (string | null | undefined)[]): string[] {
  const salida = new Set<string>();
  for (const id of ids) {
    const t = (id ?? "").trim().toLowerCase();
    if (t) salida.add(t);
  }
  return [...salida].sort();
}

export const claveDeIds = (ids: readonly (string | null | undefined)[]): string => idsSinRepetir(ids).join(",");

/** Parte una lista en tandas (una URL de PostgREST con cientos de uuids deja de caber). */
export function trocear<T>(xs: readonly T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < xs.length; i += Math.max(1, tamano)) lotes.push(xs.slice(i, i + Math.max(1, tamano)));
  return lotes;
}

/** La lectura salió a medias: estas son las candidatas que sí se pudieron armar. Quien la atrapa muestra `fallo` y las usa. */
export class LecturaParcial extends Error {
  readonly candidatas: CandidataAlta[];
  constructor(candidatas: CandidataAlta[], motivo: string) {
    super(`Lectura parcial de las prendas que ya existen: ${motivo}`);
    this.name = "LecturaParcial";
    this.candidatas = candidatas;
  }
}

// ============================================================================
// Las filas, ya limpias. Cada `leer*` recibe lo que respondió la base (desconocido) y copia SOLO lo del contrato.
// ============================================================================

/** Una variante, tal como la usa el contrato. No lleva precio ni costo: `leerFilasFnProductos` los deja afuera. */
export type FilaVariante = {
  productoId: string;
  referencia: string | null;
  categoriaId: string | null;
  categoria: string | null;
  marcaId: string | null;
  marca: string | null;
  estado: string | null;
  talla: string | null;
  colorCodigo: string | null;
  colorNombre: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  activo: boolean;
};

/** Lo que `fn_productos` no trae y se lee directo de `productos` (la política de lectura la permite a toda cuenta con sesión). */
export type FilaProducto = {
  id: string;
  referencia: string;
  descripcion: string | null;
  /** La CLAVE de la temporada propia («verano»); se traduce a su nombre al armar la candidata. */
  temporada: string | null;
  creadoEn: string | null;
  estado: string;
  estadoAlta: string;
  categoriaId: string | null;
  categoria: string | null;
  marcaId: string | null;
  marca: string | null;
  tejido: string | null;
  patron: string | null;
};

/** Una sede activa: para nombrar también las que tienen 0 (la tarjeta dice «AQP 0», no la omite). */
export type SedeActiva = { id: string; nombre: string; tipo: string };

const texto = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

const registro = (v: unknown): Record<string, unknown> | null => {
  const x = Array.isArray(v) ? v[0] : v;
  return x && typeof x === "object" ? (x as Record<string, unknown>) : null;
};

/** El `nombre` de una relación embebida (PostgREST la entrega como objeto, o como lista de uno si la relación no es única). */
const nombreDe = (v: unknown): string | null => texto(registro(v)?.nombre);

/**
 * La fecha como ISO de PostgREST, si tiene forma de fecha con hora, y AL MILISEGUNDO: la base entrega microsegundos
 * («…41.631114+00:00») y el Safari viejo de las tablets de tienda es quisquilloso con ellos (y con el espacio en vez de la
 * «T»). Las reglas la leen con `Date.parse`; normalizada aquí, en la puerta, no hay que acordarse de hacerlo allá.
 */
const fechaValida = (v: unknown): string | null => {
  const t = texto(v);
  if (t === null || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(t)) return null;
  return t.replace(" ", "T").replace(/(\.\d{3})\d+/, "$1");
};

/**
 * Las filas de `fn_productos` (una por variante). Se queda con lo del contrato: `precio`, `costo`, `codigos_barras`, el
 * proveedor y las cifras de demanda NO se copian, así que no existen más allá de esta función (candado de dinero, ADR-0126).
 */
export function leerFilasFnProductos(datos: unknown): FilaVariante[] {
  if (!Array.isArray(datos)) return [];
  const filas: FilaVariante[] = [];
  for (const fila of datos) {
    const r = registro(fila);
    const productoId = texto(r?.producto_id);
    if (!r || !productoId) continue;
    filas.push({
      productoId: productoId.toLowerCase(),
      referencia: texto(r.referencia),
      categoriaId: texto(r.categoria_id),
      categoria: texto(r.categoria_nombre),
      marcaId: texto(r.marca_id),
      marca: texto(r.marca_nombre),
      estado: texto(r.estado),
      talla: texto(r.talla),
      colorCodigo: texto(r.color_codigo),
      colorNombre: texto(r.color_nombre),
      colorHex: texto(r.color_hex),
      fotoUrl: texto(r.foto_url),
      activo: r.activo !== false,
    });
  }
  return filas;
}

/** Cuántas prendas hay en total según `fn_productos` (lo repite cada fila): para saber si falta pedir otra página. */
export function totalDeProductos(datos: unknown): number {
  if (!Array.isArray(datos) || datos.length === 0) return 0;
  const n = Number(registro(datos[0])?.total_productos);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/**
 * Una página de `fn_productos` (una fila POR VARIANTE, hasta `porPagina` prendas) y si llegó CORTADA. PostgREST corta la
 * respuesta a `topeFilas` (1.000) SIN avisar: con muchas variantes por prenda, una página de 100 prendas pierde las últimas y
 * deja a medias la que quedó en el borde. Se sabe por dos señales: llegaron `topeFilas` filas (el tope mismo) o llegaron menos
 * prendas de las que `total_productos` promete para esa página. Una página cortada no se descarta: sirve, pero la lectura ya
 * no es completa.
 */
export function leerPaginaDeProductos(
  datos: unknown,
  pagina: number,
  porPagina: number,
  topeFilas: number,
): { filas: FilaVariante[]; total: number; cortada: boolean } {
  const filas = leerFilasFnProductos(datos);
  const total = totalDeProductos(datos);
  const recibidas = new Set(filas.map((f) => f.productoId)).size;
  const esperadas = Math.min(porPagina, Math.max(0, total - (pagina - 1) * porPagina));
  const crudas = Array.isArray(datos) ? datos.length : 0;
  return { filas, total, cortada: crudas >= topeFilas || recibidas < esperadas };
}

/** Las variantes de prendas que `fn_productos` no devolvió (otra marca o categoría): de la tabla `variantes`, SIN sus columnas de dinero. */
export function leerFilasVariantesDirectas(datos: unknown): FilaVariante[] {
  if (!Array.isArray(datos)) return [];
  const filas: FilaVariante[] = [];
  for (const fila of datos) {
    const r = registro(fila);
    const productoId = texto(r?.producto_id);
    if (!r || !productoId) continue;
    const color = registro(r.color);
    filas.push({
      productoId: productoId.toLowerCase(),
      referencia: null,
      categoriaId: null,
      categoria: null,
      marcaId: null,
      marca: null,
      estado: null,
      talla: texto(registro(r.talla)?.valor),
      colorCodigo: texto(r.color_codigo),
      colorNombre: texto(color?.nombre),
      colorHex: texto(color?.hex),
      fotoUrl: null,
      activo: r.activo !== false,
    });
  }
  return filas;
}

/** Las filas de la consulta directa a `productos` (con marca, categoría, tejido y patrón ya como nombres). */
export function leerFilasProductos(datos: unknown): FilaProducto[] {
  if (!Array.isArray(datos)) return [];
  const filas: FilaProducto[] = [];
  for (const fila of datos) {
    const r = registro(fila);
    const id = texto(r?.id);
    const referencia = texto(r?.referencia);
    if (!r || !id || !referencia) continue;
    filas.push({
      id: id.toLowerCase(),
      referencia,
      descripcion: texto(r.descripcion),
      temporada: texto(r.temporada),
      creadoEn: fechaValida(r.created_at),
      estado: texto(r.estado) ?? "activo",
      estadoAlta: texto(r.estado_alta) ?? "aprobado",
      categoriaId: texto(r.categoria_id),
      categoria: nombreDe(r.categoria),
      marcaId: texto(r.marca_id),
      marca: nombreDe(r.marca),
      tejido: nombreDe(r.tejido),
      patron: nombreDe(r.patron),
    });
  }
  return filas;
}

/** `producto_fotos`, agrupadas por prenda. */
export function leerFotos(datos: unknown): Map<string, FotoCruda[]> {
  const porProducto = new Map<string, FotoCruda[]>();
  if (!Array.isArray(datos)) return porProducto;
  for (const fila of datos) {
    const r = registro(fila);
    const productoId = texto(r?.producto_id)?.toLowerCase();
    const url = texto(r?.url);
    if (!r || !productoId || !url) continue;
    const orden = Number(r.orden);
    const lista = porProducto.get(productoId) ?? [];
    lista.push({ url, orden: Number.isFinite(orden) ? orden : 0, es_principal: r.es_principal === true, color_codigo: texto(r.color_codigo) });
    porProducto.set(productoId, lista);
  }
  return porProducto;
}

/** Las sedes activas (`ubicaciones`). */
export function leerSedes(datos: unknown): SedeActiva[] {
  if (!Array.isArray(datos)) return [];
  const sedes: SedeActiva[] = [];
  for (const fila of datos) {
    const r = registro(fila);
    const id = texto(r?.id);
    const nombre = texto(r?.nombre);
    if (!r || !id || !nombre) continue;
    sedes.push({ id: id.toLowerCase(), nombre, tipo: texto(r.tipo) ?? "tienda" });
  }
  return sedes;
}

/**
 * `fn_producto_origen` (ADR-0292): prenda → nombre de la sede desde la que se operó su alta. Una prenda anterior a esa
 * migración no tiene fila, y una fila sin sede dice «se registró, pero no sé dónde»: ninguna entra al mapa (`cargadaEn = null`).
 */
export function leerOrigenes(datos: unknown): Map<string, string> {
  const porProducto = new Map<string, string>();
  if (!Array.isArray(datos)) return porProducto;
  for (const fila of datos) {
    const r = registro(fila);
    const productoId = texto(r?.producto_id)?.toLowerCase();
    const sede = texto(r?.ubicacion_nombre);
    if (productoId && sede) porProducto.set(productoId, sede);
  }
  return porProducto;
}

// ============================================================================
// Armar la candidata
// ============================================================================

/**
 * La foto de la prenda, en una. Con las filas de `producto_fotos` a la mano (se piden solo si a alguna variante le falta)
 * gana la principal, luego la general (sin color) y luego la de menor orden. Sin ellas, la primera foto de una variante.
 * `null` = «Sin foto todavía»: nunca se inventa una de otro color. A propósito NO se piden las filas cuando TODAS las variantes
 * ya traen su foto (una lectura menos por cada 50 prendas): en ese caso sale la de la primera variante, que puede no ser la
 * marcada «principal»; es una foto de la misma prenda, que es lo que compara quien mira.
 */
export function fotoDePrenda(fotos: readonly FotoCruda[], fotosDeVariantes: readonly (string | null)[]): string | null {
  if (fotos.length > 0) {
    return [...fotos].sort(
      (a, b) => Number(b.es_principal) - Number(a.es_principal) || Number(a.color_codigo !== null) - Number(b.color_codigo !== null) || a.orden - b.orden,
    )[0].url;
  }
  return fotosDeVariantes.find((u): u is string => !!u) ?? null;
}

/** Las variantes que cuentan para colores y tallas: las activas; si ninguna lo está (una descontinuada), todas, para no dejar la tarjeta vacía. */
const variantesQueCuentan = (filas: readonly FilaVariante[]): FilaVariante[] => {
  const activas = filas.filter((f) => f.activo);
  return activas.length > 0 ? activas : [...filas];
};

/** Colores sin repetir (por código, o por nombre si no hay), en orden alfabético: el orden en que llegan las filas no cuenta. */
export function coloresDe(filas: readonly FilaVariante[]): { nombre: string; hex: string }[] {
  const vistos = new Map<string, { nombre: string; hex: string }>();
  for (const f of filas) {
    if (!f.colorNombre) continue;
    const clave = (f.colorCodigo ?? f.colorNombre).toLowerCase();
    if (!vistos.has(clave)) vistos.set(clave, { nombre: f.colorNombre, hex: f.colorHex ?? "" });
  }
  return [...vistos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Tallas sin repetir, en el orden de la curva (XS S M L XL · 36 38 40 · Única al final). */
export function tallasDe(filas: readonly FilaVariante[]): string[] {
  const vistas = new Set<string>();
  for (const f of filas) if (f.talla) vistas.add(f.talla);
  return [...vistas].sort(compararTallas);
}

/** «primavera_verano» → «Primavera verano»: solo si la lista de temporadas no se pudo leer o no conoce la clave. */
const humanizar = (clave: string): string => {
  const t = clave.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** El nombre legible de la temporada propia. `null` = la prenda no tiene una propia. */
export function nombreLegibleDeTemporada(clave: string | null, temporadas: readonly Temporada[] | null | undefined): string | null {
  if (!clave) return null;
  const nombre = nombreTemporada(temporadas ?? [], clave);
  return nombre && nombre !== clave ? nombre : humanizar(clave);
}

/**
 * El stock por sede en cantidades. Con la lista de sedes activas, una entrada por cada una (con ceros: «TRU 0»); sin ella,
 * solo las que tienen algo. Tiendas por nombre y el Taller al final (la pantalla puede poner primero la sede actual).
 * El TOTAL es lo que se puede vender hoy: la suma de las TIENDAS. El Taller se lista aparte y no se suma (ADR-0270, decisión 4:
 * «40 en taller», no sumado a lo vendible), para que «Disp.» diga aquí lo mismo que Existencias y el Catálogo.
 */
export function disponibleDe(
  existencias: ExistenciasProducto | undefined,
  sedes: readonly SedeActiva[] | null | undefined,
): NonNullable<CandidataAlta["disponible"]> {
  const e = existencias ?? SIN_EXISTENCIAS;
  const porId = new Map(e.otras.map((o) => [o.ubicacionId.toLowerCase(), o.disponible]));
  const porNombre = new Map(e.otras.map((o) => [o.sede, o.disponible]));
  const listadas = new Set<string>();
  const porSede: SedeDisponible[] = [];
  const tiendas = (sedes ?? []).filter((s) => s.tipo !== "taller").sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  for (const s of tiendas) {
    listadas.add(s.nombre);
    porSede.push({ sede: s.nombre, disponible: porId.get(s.id) ?? porNombre.get(s.nombre) ?? 0 });
  }
  // Lo que la función trajo y la lista de sedes no conoce (o no se pudo leer): se lista igual, para que el total cuadre.
  for (const o of [...e.otras].sort((a, b) => a.sede.localeCompare(b.sede, "es"))) {
    if (!listadas.has(o.sede)) porSede.push({ sede: o.sede, disponible: o.disponible });
  }
  const enTiendas = porSede.reduce((t, s) => t + s.disponible, 0);
  const taller = (sedes ?? []).find((s) => s.tipo === "taller");
  if (taller || e.enTaller > 0) porSede.push({ sede: taller?.nombre ?? "Taller", disponible: e.enTaller });
  return { total: enTiendas, porSede };
}

export type EntradaCandidatas = {
  /** Las variantes de todas las prendas, de `fn_productos` (y, para las de otra marca, de `variantes`). */
  variantes: readonly FilaVariante[];
  /** `null` = esa lectura falló: la ficha sale de las filas de variantes y no se excluye nada (degrada, no pierde). */
  productos: readonly FilaProducto[] | null;
  /** `null` = no se pudo leer el stock: `disponible` queda en `null`. Un producto sin fila en un mapa que sí se leyó = cero de verdad. */
  existencias: ReadonlyMap<string, ExistenciasProducto> | null;
  sedes?: readonly SedeActiva[] | null;
  fotos?: ReadonlyMap<string, readonly FotoCruda[]>;
  /** prenda → nombre de la sede desde la que se operó su alta (`fn_producto_origen`). `null`/ausente = no se sabe: `cargadaEn = null`. */
  origen?: ReadonlyMap<string, string> | null;
  temporadas?: readonly Temporada[] | null;
};

/**
 * Una `CandidataAlta` por prenda, en el orden en que llegaron sus variantes (`fn_productos` ya las manda de la más reciente a
 * la más antigua) y, al final, las que solo trajo la consulta directa. Se salta la prenda «rechazada» (la base tampoco la cuenta:
 * `productos_referencia_clave_unica` la ignora); la «pendiente» entra.
 */
export function construirCandidatas(entrada: EntradaCandidatas): CandidataAlta[] {
  const variantesDe = new Map<string, FilaVariante[]>();
  for (const v of entrada.variantes) {
    const lista = variantesDe.get(v.productoId) ?? [];
    lista.push(v);
    variantesDe.set(v.productoId, lista);
  }
  const fichas = new Map((entrada.productos ?? []).map((p) => [p.id, p]));
  const ids = [...variantesDe.keys()];
  for (const p of entrada.productos ?? []) if (!variantesDe.has(p.id)) ids.push(p.id);

  const candidatas: CandidataAlta[] = [];
  for (const id of ids) {
    const filas = variantesDe.get(id) ?? [];
    const ficha = fichas.get(id) ?? null;
    // La lectura de fichas salió bien y esta prenda no está: es «rechazada» (o no se ve). No se ofrece.
    if (entrada.productos && !ficha) continue;
    if (ficha?.estadoAlta === "rechazado") continue;
    const primera = filas[0];
    const referencia = ficha?.referencia ?? primera?.referencia ?? null;
    if (!referencia) continue; // sin nombre no hay qué comparar

    const cuentan = variantesQueCuentan(filas);
    const estado = ficha?.estado ?? primera?.estado;
    candidatas.push({
      id,
      referencia,
      categoriaId: ficha?.categoriaId ?? primera?.categoriaId ?? null,
      categoria: ficha?.categoria ?? primera?.categoria ?? null,
      marcaId: ficha ? ficha.marcaId : (primera?.marcaId ?? null),
      marca: ficha?.marca ?? primera?.marca ?? null,
      estado: estado === "descontinuado" ? "descontinuado" : "activo",
      descripcion: ficha?.descripcion ?? null,
      tejido: ficha?.tejido ?? null,
      patron: ficha?.patron ?? null,
      temporada: nombreLegibleDeTemporada(ficha?.temporada ?? null, entrada.temporadas),
      creadoEn: ficha?.creadoEn ?? null,
      fotoUrl: fotoDePrenda(entrada.fotos?.get(id) ?? [], filas.map((f) => f.fotoUrl)),
      colores: coloresDe(cuentan),
      tallas: tallasDe(cuentan),
      disponible: entrada.existencias ? disponibleDe(entrada.existencias.get(id), entrada.sedes) : null,
      cargadaEn: entrada.origen?.get(id) ?? null,
    });
  }
  return candidatas;
}
