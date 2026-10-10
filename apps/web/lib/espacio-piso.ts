import type { CategoriaMix, GrupoMix } from "./plan-piso-grupos";

/**
 * La historia del espacio del piso (ADR-0329; migración `20261006110000_plan_del_piso_foto_del_espacio.sql`): las fotos que el cron toma
 * cada lunes —por sede y categoría: prendas libres en el piso, modelos distintos y si la sede ya había cuadrado su piso— puestas por
 * grupo del mix, de la más reciente a la más antigua.
 *
 * Para qué sirve: es la columna que falta para medir cuánto rinde el espacio en ropa (nadie lo ha medido). Lo vendido ya se guarda; el
 * espacio de cada categoría no, y lo que no se fotografió no se reconstruye. Por eso lo importante aquí no es el número de una semana sino
 * que NO haya huecos, y que se diga cuáles son: una semana sin foto es un hueco, nunca un 0.
 *
 * PROMETE: leer la respuesta de `fn_espacio_piso` sin confiar en su forma (lo que no sirve es «no se pudo leer», nunca una historia
 * inventada); armar una fila por día con sus prendas por grupo; y decir cuánto hace de la última foto y cuántas semanas faltan.
 * ASUME: lógica pura, sin red. Una foto es de UNA sede: quien llama pasa las de la sede que mira.
 */

export type FotoEspacio = { fecha: string; categoriaId: string; prendas: number; modelos: number; pisoCuadrado: boolean };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const esEntero = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;

/** `fn_espacio_piso`. Null si algo no tiene la forma esperada (se dice «no se pudo leer», no se muestra a medias). */
export function leerFotos(datos: unknown): FotoEspacio[] | null {
  if (!Array.isArray(datos)) return null;
  const fotos: FotoEspacio[] = [];
  for (const f of datos) {
    if (f === null || typeof f !== "object") return null;
    const { fecha, categoria_id: categoriaId, prendas, modelos, piso_cuadrado: pisoCuadrado } = f as Record<string, unknown>;
    if (typeof fecha !== "string" || !FECHA.test(fecha) || typeof categoriaId !== "string" || categoriaId.length === 0) return null;
    if (!esEntero(prendas) || !esEntero(modelos) || modelos > prendas || typeof pisoCuadrado !== "boolean") return null;
    fotos.push({ fecha, categoriaId, prendas, modelos, pisoCuadrado });
  }
  return fotos;
}

export type FilaDeHistoria = {
  fecha: string;
  /** Prendas libres en el piso por grupo del riel (clave del grupo → prendas). Un grupo sin nada ese día es 0: ese día SÍ se fotografió. */
  porGrupo: Record<string, number>;
  /** El total de los grupos del riel. */
  totalRiel: number;
  /** Lo de los grupos de fuera del riel (accesorios, bolsos y calzado): no ocupa percha. */
  fueraDelRiel: number;
  /** Lo de categorías que ese día no pertenecían a ningún grupo («Sin grupo»). */
  sinGrupo: number;
  /** Modelos distintos con alguna prenda colgada (un modelo es de una sola categoría, así que la suma es exacta). */
  modelos: number;
  /** La sede ya había cuadrado su piso cuando se tomó la foto. Sin cuadre, la cifra es la del sistema y no la del piso. */
  cuadrada: boolean;
};

export type HistoriaDelEspacio = {
  filas: FilaDeHistoria[];
  /** La fecha de la última foto, o null si todavía no hay ninguna. */
  ultimaFoto: string | null;
  /** Días de Lima desde la última foto hasta hoy; null sin fotos. */
  diasDesdeLaUltima: number | null;
  /** Semanas del medio en que no hay foto (entre la primera y la última): lo que se perdió y ya no se puede reconstruir. */
  semanasSinFoto: number;
  /** Cuántas de las fotos salen «sin cuadrar» (no sirven para medir el espacio). */
  sinCuadrar: number;
};

const dia = (fecha: string) => Date.parse(`${fecha}T00:00:00Z`) / 86_400_000;

/** Semanas que faltan entre fotos consecutivas: una foto cada 7 días no deja huecos; cada 14, una semana sin foto. Tolera un día de corrimiento. */
export function semanasSinFoto(fechasAscendentes: readonly string[]): number {
  let faltan = 0;
  for (let i = 1; i < fechasAscendentes.length; i++) {
    const paso = dia(fechasAscendentes[i]!) - dia(fechasAscendentes[i - 1]!);
    faltan += Math.max(0, Math.round(paso / 7) - 1);
  }
  return faltan;
}

/** Arma la historia de una sede: una fila por día de foto, de la más reciente a la más antigua, con las prendas por grupo. */
export function armarHistoria(fotos: readonly FotoEspacio[], categorias: readonly CategoriaMix[], grupos: readonly GrupoMix[], hoy: string): HistoriaDelEspacio {
  const grupoDeCategoria = new Map<string, string>();
  for (const c of categorias) if (c.grupoClave !== null) grupoDeCategoria.set(c.categoriaId, c.grupoClave);
  const enRiel = new Map(grupos.map((g) => [g.clave, g.enRiel]));

  const porDia = new Map<string, FilaDeHistoria>();
  for (const f of fotos) {
    let fila = porDia.get(f.fecha);
    if (!fila) {
      fila = { fecha: f.fecha, porGrupo: Object.fromEntries(grupos.filter((g) => g.enRiel).map((g) => [g.clave, 0])), totalRiel: 0, fueraDelRiel: 0, sinGrupo: 0, modelos: 0, cuadrada: true };
      porDia.set(f.fecha, fila);
    }
    const clave = grupoDeCategoria.get(f.categoriaId);
    const delRiel = clave !== undefined ? enRiel.get(clave) : undefined;
    if (delRiel === undefined) fila.sinGrupo += f.prendas;
    else if (delRiel) {
      fila.porGrupo[clave as string] = (fila.porGrupo[clave as string] ?? 0) + f.prendas;
      fila.totalRiel += f.prendas;
    } else fila.fueraDelRiel += f.prendas;
    fila.modelos += f.modelos;
    if (!f.pisoCuadrado) fila.cuadrada = false;
  }

  const filas = [...porDia.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const ultimaFoto = filas[0]?.fecha ?? null;
  return {
    filas,
    ultimaFoto,
    diasDesdeLaUltima: ultimaFoto === null ? null : Math.max(0, Math.round(dia(hoy) - dia(ultimaFoto))),
    semanasSinFoto: semanasSinFoto([...filas].reverse().map((f) => f.fecha)),
    sinCuadrar: filas.filter((f) => !f.cuadrada).length,
  };
}
