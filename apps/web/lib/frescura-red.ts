import {
  CAUSAS_SIN_SABER,
  conteoDeTodo,
  conteoVacio,
  pisoDeLaTienda,
  pisoPorFamilia,
  RAZON_PUERTA,
  respuestaDelPiso,
  sinSaberVacio,
  TRAMOS_PISO,
  tramosDeLaPrenda,
  type ConteoPiso,
  type ConteoSinSaber,
  type Familia,
  type FaltaPuerta,
  type FamiliaPiso,
  type PuertaPiso,
  type RespuestaPiso,
} from "./frescura-piso";
import { resumenCorto } from "./frescura-decisiones-pantalla";
import { registroCorto } from "./frescura-pantalla";
import { envejeceDeMas, parteViejaEsperada } from "./frescura-aguja";
import { varaQueJuzgo, type FilaConfianza, type FrescuraSede, type NivelConfianza } from "./frescura-reglas";

// CAYLA Global ▸ Frescura del piso (ADR-0208, act. 2026-10-10 (b), decisión 4 de Felipe: «la vista de las tres tiendas es la de CAYLA Global
// del selector, para quien tenga ese módulo»). Lo que se ve: una barra por tienda, en la misma escala y con las mismas palabras que la
// barra de cada tienda; arriba, CAYLA entera (la suma); abajo, la cuadrícula categoría × tienda («Jeans envejece en TRU pero no en AQP»).
// A la pantalla viajan solo estos resúmenes, nunca las prendas de las tres tiendas. Puro: lo prueba `frescura-red.test.ts`.

/** Lo que se muestra de una tienda: toda la tienda (todas sus familias juntas), cómo estaba hace 4 semanas y su puerta. */
export type ResumenTienda = {
  id: string;
  nombre: string;
  /** Toda la tienda (`pisoDeLaTienda`, Felipe 2026-10-10 (c): «toda la tienda arriba»), o null si no tiene nada colgado. */
  principal: FamiliaPiso | null;
  /** Las unidades de toda la tienda hace 4 semanas, si se pudo reconstruir. */
  antes: ConteoPiso | null;
  puerta: PuertaPiso;
  /** Por categoría (de cualquier familia): las unidades colgadas por tramo y la parte vieja que su vara espera, para la cuadrícula. */
  porCategoria: { categoriaId: string; nombre: string; unidades: ConteoPiso; esperada?: number | null }[];
  /** Por qué no se pudo leer, si no se pudo. */
  fallo: string | null;
  /** El registro al colgar, mes a mes (lo que antes vivía en «Las N tiendas»: se trae aquí para no perder el dato al quitarla). */
  registro: { mes: string; texto: string; nivel: NivelConfianza | null }[];
  /** Lo decidido este mes en su lista «Por decidir», en una línea; null si nada o si no se pudo leer. */
  decidido: string | null;
};

export function resumenDeTienda(
  t: { id: string; nombre: string; sede: FrescuraSede | null; fallo: string | null },
  o: { familiaDe: (categoriaId: string) => string | null; familias: readonly Familia[]; puerta: PuertaPiso; registro?: readonly FilaConfianza[] | null },
): ResumenTienda {
  const registro = o.registro ? registroCorto(o.registro, t.id) : [];
  if (t.sede === null) return { id: t.id, nombre: t.nombre, principal: null, antes: null, puerta: o.puerta, porCategoria: [], fallo: t.fallo, registro, decidido: null };
  const principal = pisoDeLaTienda(pisoPorFamilia(t.sede.prendas, { familiaDe: o.familiaDe, familias: o.familias }));
  const antes = principal && t.sede.haceUnMes ? conteoDeTodo(t.sede.haceUnMes) : null;
  const varas = new Map(t.sede.categorias.map((v) => [v.categoriaId, parteViejaEsperada(varaQueJuzgo(v).cortes)]));
  const porCategoria = new Map<string, { categoriaId: string; nombre: string; unidades: ConteoPiso; esperada: number | null }>();
  for (const p of t.sede.prendas) {
    if (p.pisoHoy <= 0 || p.categoriaId === "") continue;
    const fila = porCategoria.get(p.categoriaId) ?? { categoriaId: p.categoriaId, nombre: p.categoriaNombre, unidades: conteoVacio(), esperada: varas.get(p.categoriaId) ?? null };
    const u = tramosDeLaPrenda(p).unidades;
    for (const k of TRAMOS_PISO) fila.unidades[k] += u[k];
    porCategoria.set(p.categoriaId, fila);
  }
  const decidido = t.sede.decisiones.estado === "ok" ? resumenCorto(t.sede.decisiones.resumen) : null;
  return { id: t.id, nombre: t.nombre, principal, antes, puerta: o.puerta, porCategoria: [...porCategoria.values()], fallo: null, registro, decidido };
}

/** La suma de unas cuentas por tramo. */
function sumar(cuentas: readonly (ConteoPiso | null)[]): ConteoPiso {
  const c = conteoVacio();
  for (const x of cuentas) if (x) for (const k of TRAMOS_PISO) c[k] += x[k];
  return c;
}

const total = (c: ConteoPiso) => c.fresca + c.vigente + c.envejeciendo + c.sin_saber;

/**
 * CAYLA entera: la suma de las tiendas enteras (todas sus familias) y su respuesta. Afirma solo si TODAS las
 * tiendas con algo colgado pasan su puerta: una tienda que no registra lo que vende ensucia la suma (lo vendido sigue «colgado»). Si una tienda
 * no se pudo leer, tampoco: una cifra «de CAYLA» hecha con dos tiendas miente (el criterio de `armarFrescuraLider`).
 */
export function resumenCayla(tiendas: readonly ResumenTienda[]): { principal: FamiliaPiso | null; respuesta: RespuestaPiso; faltan: string[] } {
  const conPiso = tiendas.filter((t) => t.principal !== null && t.principal.total > 0);
  const unidades = sumar(conPiso.map((t) => t.principal!.unidades));
  const sinSaberPor: ConteoSinSaber = sinSaberVacio();
  for (const t of conPiso) for (const c of CAUSAS_SIN_SABER) sinSaberPor[c] += t.principal!.sinSaberPor[c];
  const principal: FamiliaPiso | null =
    conPiso.length === 0
      ? null
      : { codigo: null, nombre: "CAYLA", unidades, total: total(unidades), prendas: conPiso.reduce((s, t) => s + t.principal!.prendas, 0), soles: null, sinSaberPor };
  const caidas = tiendas.filter((t) => t.fallo !== null).map((t) => t.nombre);
  const sinRegistro = conPiso.filter((t) => !t.puerta?.puedeHablar).map((t) => t.nombre);
  const faltan = [...caidas, ...sinRegistro];
  const puerta: PuertaPiso = { puedeHablar: faltan.length === 0, aviso: "" };
  // Hace 4 semanas, solo si todas las tiendas con piso lo tienen: una comparación con una tienda menos no compara lo mismo.
  const antes = conPiso.every((t) => t.antes !== null) ? sumar(conPiso.map((t) => t.antes)) : null;
  const respuesta = respuestaDelPiso(principal, puerta, antes);
  // La pregunta de CAYLA es de CAYLA; si no afirma porque falta una tienda, dice cuál y por qué.
  const pregunta = "¿Está fresco el piso de CAYLA?";
  if (!respuesta.afirma && principal !== null && caidas.length > 0)
    return { principal, faltan, respuesta: { ...respuesta, pregunta, respuesta: `Todavía no se puede saber: no se pudo leer ${listar(caidas)}.` } };
  if (!respuesta.afirma && principal !== null && sinRegistro.length > 0) {
    // Cada tienda con SU razón (Formidable 2026-10-10 (c): a Lima le faltaba cuadrar el piso y la frase decía que no registraba lo que vende).
    const porRazon = new Map<FaltaPuerta | null, string[]>();
    for (const t of conPiso.filter((x) => !x.puerta?.puedeHablar)) porRazon.set(t.puerta?.falta ?? null, [...(porRazon.get(t.puerta?.falta ?? null) ?? []), t.nombre]);
    const partes = [...porRazon].map(([falta, nombres]) => `a ${listar(nombres)} ${falta ? RAZON_FALTA_TIENDA[falta] : "no se sabe qué le falta"}`);
    return { principal, faltan, respuesta: { ...respuesta, pregunta, respuesta: `Todavía no se puede saber: ${partes.join("; ")}.` } };
  }
  return { principal, faltan, respuesta: { ...respuesta, pregunta } };
}

/** Lo que le falta a una tienda, dicho después de su nombre: «a Tienda Lima le falta cuadrar el piso». */
const RAZON_FALTA_TIENDA: Record<FaltaPuerta, string> = {
  piso_cuadrado: "le falta cuadrar el piso",
  almacen_contado: "le falta contar el almacén",
  venta_identificada: "le faltan ventas con su prenda",
};

/** La razón de UNA tienda, para su fila: «Falta cuadrar el piso: sus cifras son aproximadas.» */
export function razonDeLaTienda(puerta: PuertaPiso): string | null {
  if (puerta === null) return "No se pudo saber si registra lo que vende: sus cifras pueden fallar.";
  if (puerta.puedeHablar) return null;
  const razon = puerta.falta ? RAZON_PUERTA[puerta.falta] : "no se sabe qué le falta";
  return `${razon[0].toUpperCase()}${razon.slice(1)}: sus cifras son aproximadas.`;
}

/** «TRU, AQP y LIM». */
function listar(nombres: readonly string[]): string {
  return nombres.length <= 1 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * Una fila de la cuadrícula: una categoría y, por tienda, cuántas unidades cuelgan, cuántas de cada 100 envejecen y si son más de las que su
 * vara espera (`deMas`, la misma regla que «se queda por edad» de la aguja: el resaltado ya no sale de un 30 % fijo). null: no tiene.
 */
export type FilaCuadricula = { categoriaId: string; nombre: string; celdas: ({ unidades: number; envejeciendo: number; sinSaber: number; deMas: boolean } | null)[] };

/**
 * La cuadrícula categoría × tienda, ordenada por lo que más envejece en la red. La celda dice las unidades colgadas y cuántas de cada 100
 * COLGADAS envejecen: el mismo 100 de las barras de arriba («25 % envejeciendo · 75 % aún no se sabe»). Sobre las que ya se saben, 2 viejas
 * de 4 colgadas se leían «100 % de 4» (visto en el navegador el 2026-10-10); las que aún no se saben se dicen aparte.
 */
export function cuadricula(tiendas: readonly ResumenTienda[]): FilaCuadricula[] {
  const nombres = new Map<string, string>();
  for (const t of tiendas) for (const c of t.porCategoria) nombres.set(c.categoriaId, c.nombre);
  const filas: (FilaCuadricula & { viejas: number })[] = [...nombres].map(([categoriaId, nombre]) => {
    let viejas = 0;
    const celdas = tiendas.map((t) => {
      const c = t.porCategoria.find((x) => x.categoriaId === categoriaId);
      if (!c) return null;
      const unidades = total(c.unidades);
      if (unidades <= 0) return null;
      viejas += c.unidades.envejeciendo;
      const sabidas = c.unidades.fresca + c.unidades.vigente + c.unidades.envejeciendo;
      return {
        unidades,
        envejeciendo: Math.round((c.unidades.envejeciendo * 100) / unidades),
        sinSaber: c.unidades.sin_saber,
        deMas: envejeceDeMas(c.unidades.envejeciendo, sabidas, c.esperada ?? null),
      };
    });
    return { categoriaId, nombre, celdas, viejas };
  });
  return filas.sort((a, b) => b.viejas - a.viejas || a.nombre.localeCompare(b.nombre, "es")).map((f) => ({ categoriaId: f.categoriaId, nombre: f.nombre, celdas: f.celdas }));
}

/**
 * El enlace que lleva de CAYLA Global a UNA tienda en Frescura, con la categoría ya elegida si se da (Felipe, Formidable 2026-10-10 (c):
 * «quitar y conectar»). Pasa por la ruta que cambia la tienda del selector (`/inventario/frescura/tienda`), porque una página no puede
 * escribir la cookie mientras se dibuja.
 */
export function enlaceATienda(ubicacionId: string, categoriaId?: string): string {
  const q = new URLSearchParams({ tienda: ubicacionId });
  if (categoriaId) q.set("cat", categoriaId);
  return `/inventario/frescura/tienda?${q.toString()}`;
}
