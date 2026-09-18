/**
 * La aritmética del cierre de un conteo, sin red.
 *
 * Vive aparte de `conteo.ts` por el mismo motivo que `panel-serie.ts` vive aparte de
 * `panel.ts`: acá no se importa nada del servidor, así que se puede probar sin montar
 * Supabase. Y esta es de las que hay que probar — es el único número de todo el módulo
 * que se convierte en una decisión: Felipe mira la diferencia en soles y aprueba o no.
 */

/** Una línea de la varianza, ya valorizada al costo. */
export type LineaVarianza = {
  varianteId: string;
  codigo: string | null;
  referencia: string;
  talla: string | null;
  color: string | null;
  contada: number;
  sistema: number;
  /** contada − sistema. Positivo = había más de lo que el sistema creía. */
  diferencia: number;
  /** `contado` = alguien la tocó · `no_contado` = nadie la vio y el conteo la pone en cero. */
  origen: string;
  /** diferencia × costo. Negativo = plata que falta. */
  soles: number;
  /** Sin costo cargado: su diferencia no suma a los soles y hay que decirlo. */
  sinCosto: boolean;
};

export type Varianza = {
  lineas: LineaVarianza[];
  unidadesSobrantes: number;
  unidadesFaltantes: number;
  solesSobrantes: number;
  solesFaltantes: number;
  /** Sobrantes − faltantes. Es la cifra que Felipe mira antes de aprobar. */
  solesNeto: number;
  /** Cuántas líneas quedaron fuera del cálculo en soles por no tener costo. */
  lineasSinCosto: number;
};

/** Una fila cruda de `previsualizar_cierre_conteo`, con lo que la RPC declara devolver. */
export type FilaPrevisualizacion = {
  variante_id: string | null;
  codigo: string | null;
  referencia: string | null;
  talla: string | null;
  color: string | null;
  contada: number | null;
  sistema: number | null;
  diferencia: number | null;
  origen: string | null;
};

/**
 * La aritmética del cierre, separada de la red para poder probarla.
 *
 * Vale como función aparte por una sola regla, que es la que se rompe callada: una prenda
 * SIN costo no vale cero. Sumarla como cero daría una varianza más chica que la real —
 * la dirección en la que un número equivocado hace daño, porque un faltante que se ve
 * pequeño no se investiga.
 */
export function resumirVarianza(filas: FilaPrevisualizacion[], costoDe: Map<string, number>): Varianza {
  let unidadesSobrantes = 0;
  let unidadesFaltantes = 0;
  let solesSobrantes = 0;
  let solesFaltantes = 0;
  let lineasSinCosto = 0;

  const lineas: LineaVarianza[] = filas.map((f) => {
    const diferencia = f.diferencia ?? 0;
    const costo = costoDe.get(f.variante_id ?? "") ?? 0;
    const sinCosto = costo === 0;
    const soles = Math.round(diferencia * costo * 100) / 100;

    if (diferencia > 0) unidadesSobrantes += diferencia;
    if (diferencia < 0) unidadesFaltantes += -diferencia;
    if (soles > 0) solesSobrantes += soles;
    if (soles < 0) solesFaltantes += -soles;
    if (sinCosto && diferencia !== 0) lineasSinCosto += 1;

    return {
      varianteId: f.variante_id ?? "",
      codigo: f.codigo,
      referencia: f.referencia ?? "(sin referencia)",
      talla: f.talla,
      color: f.color,
      contada: f.contada ?? 0,
      sistema: f.sistema ?? 0,
      diferencia,
      origen: f.origen ?? "contado",
      soles,
      sinCosto,
    };
  });

  // Las diferencias grandes primero: es el orden en que alguien las quiere revisar.
  lineas.sort((a, b) => Math.abs(b.soles) - Math.abs(a.soles) || Math.abs(b.diferencia) - Math.abs(a.diferencia));

  return {
    lineas,
    unidadesSobrantes,
    unidadesFaltantes,
    solesSobrantes: Math.round(solesSobrantes * 100) / 100,
    solesFaltantes: Math.round(solesFaltantes * 100) / 100,
    solesNeto: Math.round((solesSobrantes - solesFaltantes) * 100) / 100,
    lineasSinCosto,
  };
}

// ============================================================================
// La pantalla de Conteo rediseñada (Felipe, 2026-09-16) necesita dos cifras
// más, también sin red:
// ============================================================================

/**
 * Exactitud de inventario sobre los conteos CERRADOS: de cada 100 líneas
 * contadas, cuántas coincidieron con el sistema. Es lo que en un inventario
 * se llama IRA (inventory record accuracy). Null si no hay ninguna línea
 * cerrada — «sin dato» no se disfraza de 100 %.
 *
 * Se mide por líneas y no por unidades a propósito: una línea con 1 unidad
 * de más y otra con 1 de menos NO se cancelan — son dos registros que
 * estaban mal.
 */
export function exactitudConteos(conteos: { estado: string; lineas: number; lineasConDiferencia: number }[]): {
  porcentaje: number;
  lineas: number;
  correctas: number;
  conteos: number;
} | null {
  const cerrados = conteos.filter((c) => c.estado === "cerrado" && c.lineas > 0);
  const lineas = cerrados.reduce((acc, c) => acc + c.lineas, 0);
  if (lineas === 0) return null;
  const correctas = cerrados.reduce((acc, c) => acc + (c.lineas - c.lineasConDiferencia), 0);
  return { porcentaje: Math.round((correctas / lineas) * 1000) / 10, lineas, correctas, conteos: cerrados.length };
}

/** Con qué color se lee la exactitud (Felipe, pantalla Conteo 2026-09-16):
 *  ≥ 98 % sano, ≥ 95 % a vigilar, menos = hay que contar más seguido.
 *  Vive acá para que Conteo y Resumen pinten el mismo número igual. */
export function tonoExactitud(porcentaje: number): "text-verde-profundo" | "text-ambar-profundo" | "text-rojo-profundo" {
  if (porcentaje >= 98) return "text-verde-profundo";
  if (porcentaje >= 95) return "text-ambar-profundo";
  return "text-rojo-profundo";
}

/**
 * Avance del conteo abierto: cuántas prendas con stock en esa sububicación
 * ya se tocaron. Sale de `previsualizar_cierre_conteo`, que ya distingue
 * `contado` de `no_contado` — no hace falta otra consulta. Una prenda que se
 * contó pero NO tenía stock en el sistema (apareció de la nada) cuenta como
 * contada y suma al total: es una línea real del conteo.
 */
export function avanceConteo(filas: { origen: string | null }[]): { contadas: number; total: number; porcentaje: number } {
  const contadas = filas.filter((f) => f.origen === "contado").length;
  const total = filas.length;
  return { contadas, total, porcentaje: total === 0 ? 0 : Math.round((contadas / total) * 100) };
}
