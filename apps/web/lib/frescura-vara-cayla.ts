import {
  analizarSede,
  kaplanMeier,
  leerFrescuraSede,
  varaPorVentanas,
  type Curva,
  type LlamarRpcFrescura,
  type NivelConfianza,
  type Observacion,
  type ObservacionesSede,
} from "./frescura-reglas";

// La vara de CAYLA como RESPALDO (ADR-0208, actualización 2026-10-07; migración 20261008120000). Una categoría con pocas
// ventas en una tienda (menos de 10 con edad conocida) se juzga contra la curva de esa categoría en las TRES tiendas juntas,
// no contra sus 3 ventas: con 3 ventas rápidas, P50 = 1 día y P75 = 2, y una capa de 4 días salía «Se está quedando».
//
// QUIÉN HACE QUÉ. El cron (`GET /api/inventario/frescura-vara-cayla`, cada madrugada) lee las tres tiendas con la llave de
// servicio, arma una curva por categoría con la MISMA receta que `referenciaCayla` (una sola curva con las unidades de todas
// las tiendas: una tienda con 2 ventas no pesa lo que una con 200) y guarda las observaciones anónimas —segundos colgada, si
// se vendió, cuántas— en `retail.frescura_vara_cayla`. La web las lee (`fn_frescura_vara_cayla`) y rearma la curva con
// `kaplanMeier`: cientos de puntos, nada que pese. Aquí no hay React ni Supabase: lo prueba `frescura-vara-cayla.test.ts`.
//
// SE DEGRADA ASÍ: si el cron no corre, la fila envejece y pasados `VIGENCIA_VARA_CAYLA_DIAS` días deja de valer como respaldo
// (la pantalla vuelve a juzgar contra la tienda, como antes de esta actualización, y lo dice). Si una tienda no responde, no se
// guarda nada: una vara «de las tres tiendas» hecha con dos sería una cifra que miente (el mismo criterio de `armarFrescuraLider`).

/** Días que una vara de CAYLA sirve como respaldo desde que se calculó. Pasados, se juzga contra la tienda como antes. */
export const VIGENCIA_VARA_CAYLA_DIAS = 3;

/** Una fila de `retail.frescura_vara_cayla`, como la escribe el cron y la lee la web. */
export type FilaVaraCayla = {
  categoriaId: string;
  /** Cuándo la calculó el cron (ISO). */
  calculadaEn: string;
  /** Cuántas tiendas entraron (las tres, o las que había activas). */
  tiendas: number;
  /** La ventana que eligió la vara (30, 60, 90 o 120 días): la más corta con 20 ventas y los tres cortes, o la más larga. */
  ventanaDias: number;
  /** Unidades vendidas con edad conocida en esa ventana, en las tres tiendas. */
  vendidas: number;
  /** Unidades con edad conocida (vendidas + colgadas) en esa ventana. */
  unidades: number;
  nivel: NivelConfianza | null;
  /** Las unidades de la ventana: cada una con sus segundos colgada, si se vendió y cuántas. Anónimas: sin prenda ni tienda. */
  observaciones: Observacion[];
};

/** Lo que el cron calcula de cada categoría (sin la fecha: la pone la base al guardar). */
export type VaraCaylaCalculada = Omit<FilaVaraCayla, "calculadaEn">;

const SIN_CATEGORIA = "";

/**
 * La vara de cada categoría con las unidades de todas las tiendas juntas —la receta de `referenciaCayla`— y las observaciones
 * de la ventana que eligió, listas para guardar. Una categoría sin ninguna unidad con edad conocida no sale: no hay curva que
 * guardar. Las prendas sin categoría (`""`) tampoco: no hay respaldo para lo que no se sabe qué es.
 */
export function filasDeVaraCayla(sedes: readonly ObservacionesSede[]): VaraCaylaCalculada[] {
  const categorias = new Set<string>();
  for (const sede of sedes) for (const cat of Object.keys(sede)) if (cat !== SIN_CATEGORIA) categorias.add(cat);
  const filas: VaraCaylaCalculada[] = [];
  for (const cat of [...categorias].sort()) {
    const unidadesEn = (d: number) => sedes.flatMap((sede) => sede[cat]?.unidadesEn(d) ?? []);
    const vara = varaPorVentanas(unidadesEn);
    const observaciones = unidadesEn(vara.ventanaDias).filter((o) => o.peso > 0 && Number.isFinite(o.segundos));
    if (observaciones.length === 0) continue;
    filas.push({
      categoriaId: cat,
      tiendas: sedes.length,
      ventanaDias: vara.ventanaDias,
      vendidas: vara.vendidas,
      unidades: vara.curva.unidades,
      nivel: vara.nivel,
      observaciones,
    });
  }
  return filas;
}

/** Una observación en la base: `[segundos, vendida (1/0), peso]`. Compacta a propósito: son cientos por categoría. */
export type ObservacionGuardada = [number, 0 | 1, number];

/** Las filas como las recibe `guardar_frescura_vara_cayla` (claves en snake_case, observaciones compactas). */
export function filasParaGuardar(filas: readonly VaraCaylaCalculada[]) {
  return filas.map((f) => ({
    categoria_id: f.categoriaId,
    tiendas: f.tiendas,
    ventana_dias: f.ventanaDias,
    vendidas: f.vendidas,
    unidades: f.unidades,
    nivel: f.nivel,
    observaciones: f.observaciones.map((o): ObservacionGuardada => [o.segundos, o.vendida ? 1 : 0, o.peso]),
  }));
}

const NIVELES: readonly NivelConfianza[] = ["pocos_datos", "aceptable", "solido"];

function leerObservacion(v: unknown): Observacion | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const [segundos, vendida, peso] = v;
  if (typeof segundos !== "number" || !Number.isFinite(segundos) || typeof peso !== "number" || !(peso > 0)) return null;
  if (vendida !== 0 && vendida !== 1) return null;
  return { segundos, vendida: vendida === 1, peso };
}

/**
 * Lo que devuelve `fn_frescura_vara_cayla`, leído con tolerancia: null si no tiene la forma (la pantalla sigue sin respaldo y lo
 * dice). Una observación malformada descarta su fila entera, no la lectura: una curva con puntos de menos no es la curva.
 */
export function leerVaraCayla(v: unknown): FilaVaraCayla[] | null {
  if (!Array.isArray(v)) return null;
  const filas: FilaVaraCayla[] = [];
  for (const f of v) {
    if (typeof f !== "object" || f === null) return null;
    const r = f as Record<string, unknown>;
    if (typeof r.categoria_id !== "string" || typeof r.calculada_en !== "string" || !Array.isArray(r.observaciones)) return null;
    const observaciones = r.observaciones.map(leerObservacion);
    if (observaciones.some((o) => o === null)) continue;
    const nivel = NIVELES.find((n) => n === r.nivel) ?? null;
    filas.push({
      categoriaId: r.categoria_id,
      calculadaEn: r.calculada_en,
      tiendas: Number(r.tiendas) || 0,
      ventanaDias: Number(r.ventana_dias) || 0,
      vendidas: Number(r.vendidas) || 0,
      unidades: Number(r.unidades) || 0,
      nivel,
      observaciones: observaciones as Observacion[],
    });
  }
  return filas;
}

/** ¿Sirve como respaldo hoy? Calculada hace `VIGENCIA_VARA_CAYLA_DIAS` días o menos (y no en el futuro). */
export function varaCaylaVigente(f: Pick<FilaVaraCayla, "calculadaEn">, ahora: string): boolean {
  const edad = Date.parse(ahora) - Date.parse(f.calculadaEn);
  return Number.isFinite(edad) && edad >= 0 && edad <= VIGENCIA_VARA_CAYLA_DIAS * 86_400_000;
}

/** La curva de una fila, para ubicar y medir una prenda contra ella (`contraElResto`). */
export function curvaDeVaraCayla(f: Pick<FilaVaraCayla, "observaciones">): Curva {
  return kaplanMeier(f.observaciones);
}

/** Lo que calculó el cron: las filas, o qué tiendas no respondieron (con una caída no se guarda nada). */
export type VaraCaylaCalculo = { filas: VaraCaylaCalculada[]; caidas: string[] };

/**
 * Lo que hace el cron, sin Supabase: una `fn_frescura_sede` por tienda (con la llave de servicio, sin persona) → las
 * observaciones de cada una → la vara de cada categoría con todas juntas. Si una tienda no responde, `caidas` la nombra y las
 * filas no valen: quien llama no guarda. Una tienda que no separa piso y almacén entra con cero observaciones.
 */
export async function calcularVaraCayla(
  tiendas: readonly { id: string; nombre: string }[],
  rpc: LlamarRpcFrescura,
  dias: number,
): Promise<VaraCaylaCalculo> {
  const lecturas = await Promise.all(
    tiendas.map(async (t): Promise<ObservacionesSede | null> => {
      try {
        const { data, error } = await rpc("fn_frescura_sede", { p_ubicacion_id: t.id, p_dias: dias });
        if (error) {
          console.error(`Vara de CAYLA: no se pudo leer ${t.nombre}:`, error.message);
          return null;
        }
        const lectura = leerFrescuraSede(data);
        if (lectura === null) {
          console.error(`Vara de CAYLA: la respuesta de ${t.nombre} no tiene la forma de fn_frescura_sede.`);
          return null;
        }
        return lectura.separaPiso ? analizarSede(lectura).observaciones : {};
      } catch (e) {
        console.error(`Vara de CAYLA: no se pudo leer ${t.nombre}:`, e);
        return null;
      }
    }),
  );
  const caidas = tiendas.filter((_, i) => lecturas[i] === null).map((t) => t.nombre);
  if (caidas.length > 0) return { filas: [], caidas };
  return { filas: filasDeVaraCayla(lecturas.filter((l): l is ObservacionesSede => l !== null)), caidas: [] };
}
