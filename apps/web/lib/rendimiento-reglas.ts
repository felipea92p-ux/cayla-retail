/**
 * Rendimiento (ADR-0219): las reglas puras que convierten las cifras crudas de un mes —
 * ya agregadas por `retail.fn_rendimiento_equipo` — en los dos rankings que pide el ADR.
 * Sin React ni supabase: la usa `rendimiento.ts` en el servidor y se prueba en
 * `rendimiento-reglas.test.ts`.
 *
 * EL PROBLEMA PRIMERO. Con 12 integrantes en TRU y 2 en AQP, el volumen de una persona en
 * un mes es chico y desigual. Una integrante nueva con 8 horas trabajadas y una venta
 * grande de suerte puede mostrar S/ 40/hora; una veterana con 160 horas y un mes parejo,
 * S/ 18/hora. El número crudo no dice quién vende mejor — dice quién tuvo menos horas para
 * que la suerte se promediara. ADR-0219 (D-115, D-66) ya lo reconoce con una marca «muestra
 * chica» bajo 40 ventas, pero la marca solo AVISA: el número de al lado sigue siendo el
 * crudo, y el ranking se sigue ordenando por él.
 *
 * LA CORRECCIÓN (Efron-Morris / James-Stein, el mismo método de los promedios de bateo que
 * popularizaron Efron y Morris en 1975): en vez de mostrar el promedio crudo de cada
 * persona, se «encoge» hacia el promedio de su tienda, tanto menos cuanto más horas tenga
 * esa persona detrás de su número. Con pocas horas, el número dice más de la tienda que de
 * la persona; con muchas, dice cada vez más de ella misma.
 *
 * DÓNDE SE APLICA, Y DÓNDE NO (la única desviación de ADR-0219, que solo preveía la marca):
 *   - «Soles por hora» SÍ se contrae — ya es una tasa con una exposición natural (las horas
 *     trabajadas), y el propio ADR ya manda esa cifra al final con «sin horas» cuando no
 *     hay dato: la contracción no le quita cobertura a nadie que hoy no la tenga.
 *   - «Número de ventas» NO se contrae — es un conteo crudo, a propósito, para que siga
 *     funcionando en AQP y Lima, donde las horas trabajadas casi no existen (D-62: su
 *     personal no está cargado en Dynamic). Contraerlo exigiría el mismo dato de
 *     exposición que ahí falta, y ADR-0219 lo diseñó justo para no depender de eso. Sigue
 *     siendo un conteo crudo con su marca «muestra chica» (< 40 ventas, D-66), sin tocar.
 *
 * LA FUERZA DEL PRIOR no se estima de los datos (el estimador clásico de la varianza entre
 * personas, DerSimonian-Laird, es inestable o indefinido con 2 o 3 personas por tienda, que
 * es el caso real de AQP y Lima). En vez de inventar un parámetro nuevo que alguien tendría
 * que calibrar, se ancla al umbral que Felipe ya decidió (D-66: 40 ventas es «muestra
 * chica»): el prior pesa tanto como las horas que le toma a la tienda, a su ritmo típico,
 * llegar a esas 40 ventas. Es la misma idea que ya usa Frescura para su vara por categoría
 * (contraerElResto: cuando una categoría no tiene evidencia propia, pesa la del resto).
 *
 * DECIDÍ: contracción bayesiana con fuerza de prior fija en horas-equivalentes al umbral de
 * D-66, no el estimador de varianza entre personas de Efron-Morris clásico.
 * DESCARTÉ: estimar la varianza entre personas (τ²) de los propios datos del mes — con
 * k = 2 en AQP, la estimación es ruido puro, y con k = 1 no está ni definida.
 * SE ROMPE SI: una tienda no tiene NINGUNA persona con horas>0 en el mes — no hay de dónde
 * sacar el ritmo típico ni el promedio de la tienda; en ese caso la contracción no corre y
 * el ranking de soles por hora queda vacío (como ya lo deja ADR-0219 sin este cambio).
 */

/** Umbral de D-66: menos de esta cantidad de ventas en el mes es «muestra chica». */
export const UMBRAL_MUESTRA_VENTAS = 40;

/** Una fila de `retail.fn_rendimiento_equipo`: lo crudo de una persona en un mes, en una tienda. */
export interface FilaRendimientoCruda {
  personaId: string;
  nombre: string;
  esEncargada: boolean;
  ventas: number;
  soles: number;
  /** Horas trabajadas del mes (`public.jornadas`). `null` sin ninguna jornada con horas. */
  horas: number | null;
}

export interface FilaRankingSolesPorHora {
  personaId: string;
  nombre: string;
  esEncargada: boolean;
  ventas: number;
  muestraChica: boolean;
  /** `null` sin horas: la fila va al final, marcada `sinHoras`. */
  solesPorHoraCrudo: number | null;
  /** El número contraído hacia el promedio de la tienda; es el que ordena el ranking. `null` = `sinHoras`. */
  solesPorHoraContraido: number | null;
  sinHoras: boolean;
  horas: number | null;
}

export interface FilaRankingNumeroVentas {
  personaId: string;
  nombre: string;
  esEncargada: boolean;
  ventas: number;
  muestraChica: boolean;
}

/** D-66: menos de `UMBRAL_MUESTRA_VENTAS` ventas en el mes. */
export function esMuestraChica(ventas: number): boolean {
  return ventas < UMBRAL_MUESTRA_VENTAS;
}

/**
 * La contracción de Efron-Morris/James-Stein de `solesPorHora` hacia el promedio de la
 * tienda, con la fuerza del prior anclada a D-66 (ver el comentario del archivo).
 *
 * `θ̂ᵢ = (horasᵢ · yᵢ + horasPrior · ȳ₋ᵢ) / (horasᵢ + horasPrior)`
 *
 * con `ȳ₋ᵢ` el promedio del RESTO de la tienda SIN esa persona (soles del resto ÷ horas del
 * resto) y `horasPrior` las horas que le toma a la tienda entera, a su propio ritmo de
 * ventas por hora, juntar `UMBRAL_MUESTRA_VENTAS` ventas.
 *
 * `ȳ` se calcula SIN la propia persona (el mismo principio que `contraElResto` de Frescura:
 * con ella adentro, quien tuvo un mes muy bueno infla el promedio contra el que se lo
 * compara, y se «esconde detrás» de su propio número — más notorio cuanto menos personas
 * tenga la tienda, que es justo el caso de AQP con 2). `horasPrior` sí usa el total de la
 * tienda entera: es una escala de cuánto pesa la evidencia, no un valor que se le compare a
 * cada persona, y no tiene el mismo problema.
 *
 * Devuelve un mapa `personaId → número contraído`, solo de quienes tienen `horas > 0` Y al
 * menos otra persona con horas en la misma tienda (sin nadie más, no hay «resto» del que
 * partir, y el número queda tal cual — se marca aparte, ver `construirRankingSolesPorHora`).
 */
export function contraerSolesPorHora(
  filas: readonly FilaRendimientoCruda[],
): Map<string, number> {
  const conHoras = filas.filter(
    (f): f is FilaRendimientoCruda & { horas: number } =>
      f.horas !== null && f.horas > 0,
  );
  const horasTotales = conHoras.reduce((s, f) => s + f.horas, 0);
  if (horasTotales <= 0) return new Map();

  const solesTotales = conHoras.reduce((s, f) => s + f.soles, 0);
  const ventasTotales = conHoras.reduce((s, f) => s + f.ventas, 0);
  const ventasPorHoraTienda = ventasTotales / horasTotales;

  // Horas que le toma a esta tienda, a su ritmo, llegar al umbral de D-66. Sin ventas en el
  // mes (ventasPorHoraTienda = 0) no hay ritmo del que partir: se usa el total de horas de
  // la tienda como fuerza de prior, así el peso de cada persona queda entre 0 y 1 igual.
  const horasPrior =
    ventasPorHoraTienda > 0
      ? UMBRAL_MUESTRA_VENTAS / ventasPorHoraTienda
      : horasTotales;

  const resultado = new Map<string, number>();
  for (const f of conHoras) {
    const horasResto = horasTotales - f.horas;
    if (horasResto <= 0) continue; // sola con horas en su tienda: sin resto, sin contracción
    const promedioResto = (solesTotales - f.soles) / horasResto;
    const solesPorHora = f.soles / f.horas;
    const contraido =
      (f.horas * solesPorHora + horasPrior * promedioResto) /
      (f.horas + horasPrior);
    resultado.set(f.personaId, contraido);
  }
  return resultado;
}

/**
 * El ranking «vende más por hora» de ADR-0219 (D-121): ordena por el número CONTRAÍDO, no
 * por el crudo (el ADR decía «ordena por soles por hora»; la contracción es la corrección
 * de esta ficha). Solo entran personas con al menos una venta (D-121). Quien no tiene horas
 * va al final, marcado `sinHoras`, en el mismo orden que traía `filas` — igual que hoy.
 */
export function construirRankingSolesPorHora(
  filas: readonly FilaRendimientoCruda[],
): FilaRankingSolesPorHora[] {
  const conVenta = filas.filter((f) => f.ventas > 0);
  const contraidos = contraerSolesPorHora(conVenta);

  const filasArmadas: FilaRankingSolesPorHora[] = conVenta.map((f) => {
    const sinHoras = f.horas === null || f.horas <= 0;
    return {
      personaId: f.personaId,
      nombre: f.nombre,
      esEncargada: f.esEncargada,
      ventas: f.ventas,
      muestraChica: esMuestraChica(f.ventas),
      solesPorHoraCrudo: sinHoras ? null : f.soles / (f.horas as number),
      // Sin resto de quien contraer (sola con horas en su tienda), se queda con el crudo:
      // no hay nada con qué corregirlo, y sigue siendo mejor que null (que aquí es «sinHoras»).
      solesPorHoraContraido: sinHoras
        ? null
        : (contraidos.get(f.personaId) ?? f.soles / (f.horas as number)),
      sinHoras,
      horas: f.horas,
    };
  });

  const conHoras = filasArmadas.filter((f) => !f.sinHoras);
  const sinHoras = filasArmadas.filter((f) => f.sinHoras);
  conHoras.sort(
    (a, b) => (b.solesPorHoraContraido ?? 0) - (a.solesPorHoraContraido ?? 0),
  );
  return [...conHoras, ...sinHoras];
}

/**
 * El ranking «cierra más ventas» de ADR-0219 (D-121): conteo CRUDO, sin contraer (ver el
 * comentario del archivo — a propósito, para que siga sirviendo donde no hay horas). Solo
 * entran personas con al menos una venta.
 */
export function construirRankingNumeroVentas(
  filas: readonly FilaRendimientoCruda[],
): FilaRankingNumeroVentas[] {
  return filas
    .filter((f) => f.ventas > 0)
    .map((f) => ({
      personaId: f.personaId,
      nombre: f.nombre,
      esEncargada: f.esEncargada,
      ventas: f.ventas,
      muestraChica: esMuestraChica(f.ventas),
    }))
    .sort((a, b) => b.ventas - a.ventas);
}
