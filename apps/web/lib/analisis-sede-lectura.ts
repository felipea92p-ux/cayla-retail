// Análisis v4 (ADR-0357): de lo que devuelve `retail.fn_analisis_sede` (un jsonb por tienda, migraciones 20261006214000 y
// 20261007120000) a las filas del contrato (`PrendaSede`). Lógica pura, sin base ni React; la prueba es `analisis-sede-lectura.test.ts`.
//
// No confía en la forma (principio 9): una fila sin su prenda, su modelo o su nombre se descarta —nunca se inventa una prenda—; un
// número que no es número vale 0 y una cifra negativa, 0; las semanas son siempre 8 (las que falten, viejas y en 0); un precio o un
// costo que no es mayor que 0 es «no se sabe» (null), nunca un 0 que abarate lo quieto.

import type { OrigenPrenda, PrendaSede } from "./analisis-tipos";

/** La función de la base que lee las prendas de UNA tienda. */
export const RPC_ANALISIS_SEDE = "fn_analisis_sede";

/** Cuántas semanas trae cada prenda, de la más vieja a la actual. */
export const SEMANAS_LEIDAS = 8;

/** Lo que se leyó de una tienda. */
export type LecturaDeSede = {
  ubicacionId: string;
  /** Hoy en Lima según la base (YYYY-MM-DD). */
  hoy: string;
  /** De cada 100 líneas vendidas en 30 días, cuántas llevaron rebaja; null si no vendió. */
  rebajaDe100: number | null;
  prendas: PrendaSede[];
  /** Si las filas traen `salio_al_piso` (la función de 20261007120000). Sin la clave, «nunca salió al piso» no se puede saber:
   *  `salioAlPiso` vendría null en todas, como si nada hubiera salido nunca. */
  sabePiso: boolean;
  /** Si las filas traen `ultima_venta` (la función de 20261010120000): con ella se cuentan los días sin venderse del modelo. */
  sabeUltimaVenta: boolean;
};

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const esFecha = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
/** Una fecha de la base (YYYY-MM-DD), o null. */
const fecha = (v: unknown): string | null => (esFecha(v) ? v : null);

/** Un número de la base: los jsonb llegan como número; un texto numérico también se entiende. */
function numero(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Una cantidad: entera y nunca negativa; lo que no es número, 0. */
const cantidad = (v: unknown): number => Math.max(0, Math.round(numero(v) ?? 0));

/** Dinero: mayor que 0, o null («no se sabe»). */
function dinero(v: unknown): number | null {
  const n = numero(v);
  return n !== null && n > 0 ? n : null;
}

/** Los días sin venderse: null si la base no supo de dónde contarlos; nunca negativos. */
function dias(v: unknown): number | null {
  const n = numero(v);
  return n === null ? null : Math.max(0, Math.round(n));
}

/** El color de la prenda para la miniatura: un hex de CSS (`#D5BA98`) o null (estampado, multicolor). */
const hex = (v: unknown): string | null => (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim() : null);

const origen = (v: unknown): OrigenPrenda | null => (v === "taller" || v === "terceros" ? v : null);

/**
 * Siempre `SEMANAS_LEIDAS` semanas, de la más vieja a la actual. Si vinieron menos, faltan las más viejas (se rellenan con 0
 * al principio); si vinieron más, se quedan las más recientes (las del final). Lo que no es un arreglo, 8 semanas en 0.
 */
export function leerSemanas(v: unknown): number[] {
  const leidas = Array.isArray(v) ? v.map(cantidad) : [];
  const recientes = leidas.slice(-SEMANAS_LEIDAS);
  return [...Array<number>(SEMANAS_LEIDAS - recientes.length).fill(0), ...recientes];
}

/** Una fila de la base como `PrendaSede`, o null si no calza (sin prenda, sin modelo o sin nombre). */
export function leerPrendaSede(v: unknown): PrendaSede | null {
  if (!esObjeto(v)) return null;
  const varianteId = texto(v.variante_id);
  const productoId = texto(v.producto_id);
  const nombre = texto(v.nombre);
  if (!varianteId || !productoId || !nombre) return null;
  const elOrigen = origen(v.origen);
  const llegaron30 = cantidad(v.llegaron_30);
  return {
    varianteId,
    productoId,
    nombre,
    // Una prenda sin color guardado se nombra sin él («Polo Lucky · M»); sin talla es la única (como en Producción y Frescura).
    color: texto(v.color) ?? "",
    colorHex: hex(v.color_hex),
    talla: texto(v.talla) ?? "Única",
    categoria: texto(v.categoria),
    categoriaPrefijo: texto(v.categoria_prefijo),
    categoriaFamilia: texto(v.categoria_familia),
    fotoUrl: texto(v.foto_url),
    precio: dinero(v.precio),
    costo: dinero(v.costo),
    origen: elOrigen,
    // El proveedor solo dice algo si la prenda se compra a terceros (abre Compras con él).
    proveedorId: elOrigen === "terceros" ? texto(v.proveedor_id) : null,
    piso: cantidad(v.piso),
    almacen: cantidad(v.almacen),
    vendidas30: cantidad(v.vendidas_30),
    semanas: leerSemanas(v.semanas),
    diasSinVender: dias(v.dias_sin_vender),
    salioAlPiso: fecha(v.salio_al_piso),
    // Sin la clave (la base sin 20261010120000) queda undefined: «no se sabe», distinto de null («nunca se vendió»).
    ...("ultima_venta" in v ? { ultimaVenta: fecha(v.ultima_venta) } : {}),
    llego: fecha(v.llego),
    llegaron30,
    vendidasDeLasQueLlegaron30: Math.min(cantidad(v.vendidas_de_llegadas_30), llegaron30),
  };
}

/** Las filas de una tienda: descarta las que no calzan y una prenda repetida (se queda la primera). */
export function leerPrendasSede(v: unknown): PrendaSede[] {
  if (!Array.isArray(v)) return [];
  const vistas = new Set<string>();
  const prendas: PrendaSede[] = [];
  for (const crudo of v) {
    const p = leerPrendaSede(crudo);
    if (!p || vistas.has(p.varianteId)) continue;
    vistas.add(p.varianteId);
    prendas.push(p);
  }
  return prendas;
}

/** «De cada 100», entre 0 y 100; null si no vendió o no es un número. */
function deCada100(v: unknown): number | null {
  const n = numero(v);
  return n === null ? null : Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * La respuesta entera de `fn_analisis_sede`, o null si no es la forma esperada: la base respondió NULL (la cuenta no puede
 * analizar) o algo que no se entiende. Quien llama lo dice como «no se pudo leer», nunca como «no tiene prendas».
 */
export function leerAnalisisSede(v: unknown): LecturaDeSede | null {
  if (!esObjeto(v)) return null;
  const ubicacionId = texto(v.ubicacion_id);
  if (!ubicacionId || !esFecha(v.hoy) || !Array.isArray(v.prendas)) return null;
  // Sin filas no hay nada que no se sepa; con filas, basta que una traiga la clave (la función nueva la pone en todas).
  const sabePiso = v.prendas.length === 0 || v.prendas.some((p) => esObjeto(p) && "salio_al_piso" in p);
  const sabeUltimaVenta = v.prendas.length === 0 || v.prendas.some((p) => esObjeto(p) && "ultima_venta" in p);
  return { ubicacionId, hoy: v.hoy, rebajaDe100: deCada100(v.rebaja_de_100), prendas: leerPrendasSede(v.prendas), sabePiso, sabeUltimaVenta };
}

/**
 * La frase de lo que no se pudo leer, con el nombre de cada tienda («No se pudieron leer las prendas de Tienda Lima»); null si
 * todas respondieron.
 */
export function fraseFallaSedes(nombres: readonly string[]): string | null {
  if (nombres.length === 0) return null;
  const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  return `No se pudieron leer las prendas de ${lista}`;
}
