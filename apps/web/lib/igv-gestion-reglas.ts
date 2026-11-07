// El IGV de gestión (ADR-0620): las ventas con IGV y el IGV que el líder dice que va a pagar, como capa de LECTURA sobre el Estado de resultados, igual que los sueldos estimados (ADR-0453).
//
// PROMETE: `filasDeGestion` no calcula el IGV: lo lee de `fn_igv_de_gestion` y lo suma a las filas. Las filas que salen dicen de dónde vino su IGV (`igvGestion`) y cuánto dice el libro
// (`resultadoLibro`). 0 dicho y sin dato son distintos: sin dato se resta todo el IGV incluido, con aviso. El reparto entre sedes y el mes a medias ya vienen hechos de la base (`igv_parte`).
// ASUME: `resultado` trae restados los sueldos estimados (`aplicarProvision`); por eso el libro los devuelve.
// NO HACE: no toca el diario, y la renta, el Balance, Patrimonio, el archivo del contador y el cuadro por sede no pueden leer esta capa (lo vigila `igv-gestion-uso.test.ts`).

import { mesNombre, type FilaER } from "./resultados-reglas";

/** `dicho`: lo dijo el líder. `estimado`: nadie lo dijo y se resta todo. `mixto`: varios meses de las dos clases. `sin_igv`: esta unidad no vendió en estas fechas. */
export type OrigenIgv = "dicho" | "estimado" | "mixto" | "sin_igv";

export type IgvGestion = {
  /** El IGV que traen las ventas de estas fechas. */
  incluido: number;
  /** Lo que se resta. Puede ser negativo en una sede con más devuelto que vendido. */
  monto: number;
  origen: OrigenIgv;
  /** Los meses con IGV que nadie dijo («2026-10»), del más viejo al más nuevo. */
  mesesSinDecir: string[];
  /** Alguno de los meses dichos no está entero en estas fechas: se resta su parte. */
  parcial: boolean;
  /** Un monto dicho de un mes que no ha terminado: va entero contra los días que van, sin nada con qué prorratearlo. */
  sinTerminar: boolean;
  /** Esta cuenta recibe lo que dijo el líder. Falso: un monto nulo no quiere decir que nadie lo dijo. */
  veDicho: boolean;
};

/** Una fila de `fn_igv_de_gestion`. `montoDicho` e `igvParte` nulos: nadie lo dijo, o esta cuenta no ve toda CAYLA (`veDicho` los distingue). */
export type FilaIgvGestion = { mes: string; ubicacionId: string | null; igvTramo: number; igvMes: number; montoDicho: number | null; igvParte: number | null; mesEnCurso: boolean; veDicho: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numONulo = (v: unknown): number | null => (v == null ? null : Number(v));

/** Las filas de `fn_igv_de_gestion` (los `numeric` viajan como texto) → tipos de la pantalla. */
export function leerFilasIgv(data: unknown): FilaIgvGestion[] {
  if (!Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    mes: String(r.mes ?? "").slice(0, 7),
    ubicacionId: r.ubicacion_id == null ? null : String(r.ubicacion_id),
    igvTramo: num(r.igv_tramo),
    igvMes: num(r.igv_mes),
    montoDicho: numONulo(r.monto_dicho),
    igvParte: numONulo(r.igv_parte),
    mesEnCurso: r.mes_en_curso === true,
    veDicho: r.ve_dicho === true,
  }));
}

/** Lo que dijo el líder de un mes. La base lo repite en cada fila del mes. */
export function montoDichoDelMes(igv: readonly FilaIgvGestion[], mes: string): number | null {
  return igv.find((x) => x.mes === mes && x.montoDicho !== null)?.montoDicho ?? null;
}

/** Los meses con lo dicho que no caben enteros en estas fechas. La cuenta va por mes y con todas las unidades: una sede sola no sabe si su mes está entero. 0 dicho no tiene partes: entero o a medias, se resta 0. */
function mesesParciales(igv: readonly FilaIgvGestion[]): Set<string> {
  const porMes = new Map<string, { tramo: number; mes: number }>();
  for (const x of igv) {
    if (!x.montoDicho) continue;
    const a = porMes.get(x.mes);
    porMes.set(x.mes, { tramo: (a?.tramo ?? 0) + x.igvTramo, mes: x.igvMes });
  }
  return new Set([...porMes].filter(([, v]) => Math.abs(v.tramo - v.mes) >= 0.005).map(([mes]) => mes));
}

function igvDeLasFilas(suyas: readonly FilaIgvGestion[], parciales: ReadonlySet<string>): IgvGestion {
  const dichas = suyas.filter((x) => x.montoDicho !== null);
  // Un mes sin decir y sin IGV en estas fechas no falta: no hay nada que restar.
  const sinDecir = suyas.filter((x) => x.montoDicho === null && x.igvTramo !== 0);
  const origen: OrigenIgv = dichas.length ? (sinDecir.length ? "mixto" : "dicho") : sinDecir.length ? "estimado" : "sin_igv";
  const veDicho = suyas.every((x) => x.veDicho);
  return {
    incluido: r2(suyas.reduce((a, x) => a + x.igvTramo, 0)),
    monto: r2(dichas.reduce((a, x) => a + (x.igvParte ?? 0), 0) + sinDecir.reduce((a, x) => a + x.igvTramo, 0)),
    origen,
    // Sin ver lo dicho no se sabe qué meses faltan: decir uno sería afirmar algo que puede ser falso.
    mesesSinDecir: veDicho ? [...new Set(sinDecir.map((x) => x.mes))].sort() : [],
    parcial: dichas.some((x) => parciales.has(x.mes)),
    sinTerminar: dichas.some((x) => x.mesEnCurso && !!x.montoDicho),
    veDicho,
  };
}

/** Las filas que le tocan a una columna: CAYLA suma todas; «De la empresa», las que no son de una tienda. */
function filasDeLaColumna(f: Pick<FilaER, "ubicacionId" | "unidad">, igv: readonly FilaIgvGestion[]): FilaIgvGestion[] {
  if (f.unidad === "consolidado") return [...igv];
  return igv.filter((x) => x.ubicacionId === (f.unidad === "empresa" ? null : f.ubicacionId));
}

/**
 * Las columnas del Estado de resultados en gestión:
 *   Ventas con IGV    = ventas + IGV incluido
 *   Resultado gestión = Ventas con IGV − IGV del mes − mercadería − gastos (con sueldos estimados)
 *   Según el libro    = Resultado gestión − IGV incluido + IGV del mes + sueldos estimados
 * El margen se mueve con las ventas: lo que cuesta tener abierta la sede (`margen − resultado`) sigue igual.
 */
export function filasDeGestion(filas: readonly FilaER[], igv: readonly FilaIgvGestion[]): FilaER[] {
  const parciales = mesesParciales(igv);
  return filas.map((f) => {
    const g = igvDeLasFilas(filasDeLaColumna(f, igv), parciales);
    const neto = g.incluido - g.monto;
    return { ...f, ventas: r2(f.ventas + g.incluido), margen: r2(f.margen + neto), resultado: r2(f.resultado + neto), igvGestion: g, resultadoLibro: r2(f.resultado + f.planillaEstimada) };
  });
}

type Lectura<T> = { datos: T; falla: string | null };

/** Lo que se dice si no se pudo leer el IGV. Esa pantalla cae entera al libro. */
export const AVISO_SIN_IGV = "No se pudo leer el IGV del mes: estas cifras van sin IGV, como en el libro.";

/**
 * Todas las columnas de una pantalla pasan a gestión juntas, o ninguna: comparar ventas con IGV contra ventas sin IGV daría un «las ventas subieron 18 %» que nunca pasó.
 * Una lectura que ya falló sigue como está (no tiene filas). `igv` va en el mismo orden que `lecturas`; `null` donde no hizo falta leerlo. `hilo`: la lectura de la línea de los meses, si la
 * pantalla la dibuja: si esa falló, la cabecera también se queda en el libro.
 */
export function pasarAGestion(lecturas: readonly Lectura<FilaER[]>[], igv: readonly (Lectura<FilaIgvGestion[]> | null)[], hilo: Lectura<FilaIgvGestion[]> | null = null): { lecturas: Lectura<FilaER[]>[]; falla: string | null } {
  if (hilo?.falla || igv.some((x) => x?.falla)) return { lecturas: [...lecturas], falla: AVISO_SIN_IGV };
  return {
    lecturas: lecturas.map((l, i) => {
      const suyo = igv[i];
      return l.falla || !suyo ? l : { datos: filasDeGestion(l.datos, suyo.datos), falla: null };
    }),
    falla: null,
  };
}

/**
 * Las columnas de un mes del hilo, con la lectura de IGV de todo el hilo: una sola para los trece meses (ADR-0450, tope de conexiones). Si no se pudo leer, todos los meses quedan en el libro,
 * para que la línea no mezcle ventas con y sin IGV.
 */
export function columnasDelMes(datos: readonly FilaER[], igv: Lectura<FilaIgvGestion[]>, mes: string): FilaER[] {
  return igv.falla
    ? [...datos]
    : filasDeGestion(
        datos,
        igv.datos.filter((x) => x.mes === mes),
      );
}

/** Las barritas del calendario no llevan aviso: sin el IGV no se dibujan (`null`), en vez de mezclar con la cabecera una cifra del libro que nadie dice que lo es. */
export function mesesDelCalendario<T extends { resultado: number | null }>(meses: readonly T[], falla: string | null): T[] {
  return falla ? meses.map((m) => ({ ...m, resultado: null })) : [...meses];
}

/** «noviembre», «octubre y noviembre», «septiembre, octubre y noviembre». */
function nombresDeMeses(meses: readonly string[]): string {
  const n = meses.map(mesNombre);
  return n.length < 2 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} y ${n.at(-1)}`;
}

/** Lo que se le dice a quien no ve toda CAYLA. No afirma que el líder haya dicho el monto ni que falte: esa cuenta no lo sabe, y cualquiera de las dos cosas podría ser falsa. */
const SIN_VER_LO_DICHO = "Esta cifra resta todo el IGV incluido en las ventas. Lo que se paga cada mes se ve mirando toda CAYLA.";

/** De dónde vino el IGV de esta cifra, en una línea, para abrir su fila. `null` si no hay IGV del que hablar. */
export function textoDelIgv(g: IgvGestion): string | null {
  if (g.origen === "sin_igv") return null;
  if (!g.veDicho) return SIN_VER_LO_DICHO;
  if (g.origen === "dicho") return g.sinTerminar ? "Lo dijo el líder para el mes entero, y el mes no ha terminado: se resta completo contra las ventas de los días que van." : g.parcial ? "Lo dijo el líder. Estas fechas llevan su parte del mes." : "Lo dijo el líder.";
  const falta = `el líder todavía no dijo el IGV de ${nombresDeMeses(g.mesesSinDecir)}, así que se resta todo el de ese ${g.mesesSinDecir.length === 1 ? "mes" : "período"}`;
  return g.origen === "mixto" ? `En parte estimado: ${falta}.` : `Estimado: ${falta}.`;
}

/** El aviso junto a la cifra: lo que no dijo nadie se dice a la vista. */
export function avisoDelIgv(g: IgvGestion | undefined): string | null {
  if (!esEstimado(g)) return null;
  if (!g!.veDicho) return SIN_VER_LO_DICHO;
  return `El líder todavía no dijo el IGV de ${nombresDeMeses(g!.mesesSinDecir)}: se resta todo el incluido en las ventas.`;
}

/**
 * La cifra se comparó con otra que restó su IGV de otra forma: decir «más» o «menos» mezclaría dos bases. No basta el origen: dicho el mes en curso va entero y su mes pasado «a esta fecha»
 * lleva solo su parte, y los dos dicen «dicho». Sin mirar `parcial` y `sinTerminar`, el resultado saldría peor por miles sin que haya pasado nada.
 */
export const mismaBaseDeIgv = (a: Pick<FilaER, "igvGestion">, b: Pick<FilaER, "igvGestion"> | null): boolean => {
  if (!b) return false;
  const [x, y] = [a.igvGestion, b.igvGestion];
  return x?.origen === y?.origen && x?.parcial === y?.parcial && x?.sinTerminar === y?.sinTerminar;
};

/** Un mes sin monto dicho, o con una parte sin decir: la línea de los meses lo dibuja hueco. */
export function esEstimado(g: IgvGestion | undefined): boolean {
  return g?.origen === "estimado" || g?.origen === "mixto";
}
