import { conteoDeFamilia, conteoVacio, pisoPorFamilia, respuestaDelPiso, TRAMOS_PISO, tramosDeLaPrenda, type ConteoPiso, type Familia, type FamiliaPiso, type PuertaPiso, type RespuestaPiso } from "./frescura-piso";
import type { FrescuraSede } from "./frescura-reglas";

// CAYLA Global ▸ Frescura del piso (ADR-0208, act. 2026-10-10 (b), decisión 4 de Felipe: «la vista de las tres tiendas es la de CAYLA Global
// del selector, para quien tenga ese módulo»). Lo que se ve: una barra por tienda, en la misma escala y con las mismas palabras que la
// barra de cada tienda; arriba, CAYLA entera (la suma); abajo, la cuadrícula categoría × tienda («Jeans envejece en TRU pero no en AQP»).
// A la pantalla viajan solo estos resúmenes, nunca las prendas de las tres tiendas. Puro: lo prueba `frescura-red.test.ts`.

/** Lo que se muestra de una tienda: su familia principal (Indumentaria), las demás, cómo estaba hace 4 semanas y su puerta. */
export type ResumenTienda = {
  id: string;
  nombre: string;
  /** La familia principal (la primera en el orden del catálogo), o null si no tiene nada colgado. */
  principal: FamiliaPiso | null;
  /** Las unidades de esa familia hace 4 semanas, si se pudo reconstruir. */
  antes: ConteoPiso | null;
  puerta: PuertaPiso;
  /** Por categoría (de cualquier familia): las unidades colgadas por tramo, para la cuadrícula. */
  porCategoria: { categoriaId: string; nombre: string; unidades: ConteoPiso }[];
  /** Por qué no se pudo leer, si no se pudo. */
  fallo: string | null;
};

export function resumenDeTienda(
  t: { id: string; nombre: string; sede: FrescuraSede | null; fallo: string | null },
  o: { familiaDe: (categoriaId: string) => string | null; familias: readonly Familia[]; puerta: PuertaPiso },
): ResumenTienda {
  if (t.sede === null) return { id: t.id, nombre: t.nombre, principal: null, antes: null, puerta: o.puerta, porCategoria: [], fallo: t.fallo };
  const familias = pisoPorFamilia(t.sede.prendas, { familiaDe: o.familiaDe, familias: o.familias });
  const principal = familias[0] ?? null;
  const antes = principal && t.sede.haceUnMes ? conteoDeFamilia(t.sede.haceUnMes, principal.codigo, o) : null;
  const porCategoria = new Map<string, { categoriaId: string; nombre: string; unidades: ConteoPiso }>();
  for (const p of t.sede.prendas) {
    if (p.pisoHoy <= 0 || p.categoriaId === "") continue;
    const fila = porCategoria.get(p.categoriaId) ?? { categoriaId: p.categoriaId, nombre: p.categoriaNombre, unidades: conteoVacio() };
    const u = tramosDeLaPrenda(p).unidades;
    for (const k of TRAMOS_PISO) fila.unidades[k] += u[k];
    porCategoria.set(p.categoriaId, fila);
  }
  return { id: t.id, nombre: t.nombre, principal, antes, puerta: o.puerta, porCategoria: [...porCategoria.values()], fallo: null };
}

/** La suma de unas cuentas por tramo. */
function sumar(cuentas: readonly (ConteoPiso | null)[]): ConteoPiso {
  const c = conteoVacio();
  for (const x of cuentas) if (x) for (const k of TRAMOS_PISO) c[k] += x[k];
  return c;
}

const total = (c: ConteoPiso) => c.fresca + c.vigente + c.envejeciendo + c.sin_saber;

/**
 * CAYLA entera: la suma de las familias principales de las tiendas (todas la misma: Indumentaria) y su respuesta. Afirma solo si TODAS las
 * tiendas con algo colgado pasan su puerta: una tienda que no registra lo que vende ensucia la suma (lo vendido sigue «colgado»). Si una tienda
 * no se pudo leer, tampoco: una cifra «de CAYLA» hecha con dos tiendas miente (el criterio de `armarFrescuraLider`).
 */
export function resumenCayla(tiendas: readonly ResumenTienda[]): { principal: FamiliaPiso | null; respuesta: RespuestaPiso; faltan: string[] } {
  const conPiso = tiendas.filter((t) => t.principal !== null && t.principal.total > 0);
  const unidades = sumar(conPiso.map((t) => t.principal!.unidades));
  const principal: FamiliaPiso | null =
    conPiso.length === 0 ? null : { codigo: conPiso[0].principal!.codigo, nombre: conPiso[0].principal!.nombre, unidades, total: total(unidades), prendas: conPiso.reduce((s, t) => s + t.principal!.prendas, 0), soles: null };
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
    const verbo = sinRegistro.length === 1 ? "aún no registra lo que vende" : "aún no registran lo que venden";
    return { principal, faltan, respuesta: { ...respuesta, pregunta, respuesta: `Todavía no se puede saber: ${listar(sinRegistro)} ${verbo}.` } };
  }
  return { principal, faltan, respuesta: { ...respuesta, pregunta } };
}

/** «TRU, AQP y LIM». */
function listar(nombres: readonly string[]): string {
  return nombres.length <= 1 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** Una fila de la cuadrícula: una categoría y, por tienda, cuántas unidades cuelgan y cuántas de cada 100 envejecen (null: no tiene). */
export type FilaCuadricula = { categoriaId: string; nombre: string; celdas: ({ unidades: number; envejeciendo: number; sinSaber: number } | null)[] };

/**
 * La cuadrícula categoría × tienda, ordenada por lo que más envejece en la red. La celda dice las unidades colgadas y cuántas de cada 100
 * envejecen (las que aún no se saben no cuentan en ese porcentaje, pero se dicen: «de 12, 5 aún no se saben»).
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
      const sabidas = unidades - c.unidades.sin_saber;
      viejas += c.unidades.envejeciendo;
      return { unidades, envejeciendo: sabidas > 0 ? Math.round((c.unidades.envejeciendo * 100) / sabidas) : 0, sinSaber: c.unidades.sin_saber };
    });
    return { categoriaId, nombre, celdas, viejas };
  });
  return filas.sort((a, b) => b.viejas - a.viejas || a.nombre.localeCompare(b.nombre, "es")).map((f) => ({ categoriaId: f.categoriaId, nombre: f.nombre, celdas: f.celdas }));
}
