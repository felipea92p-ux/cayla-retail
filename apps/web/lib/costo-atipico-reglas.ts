import { soles } from "./compras-reglas";
import type { MotivoDeCosto } from "./cuenta-de-precio";

// El «costo atípico» (Felipe, 2026-09-30). La REGLA vive en la base (`retail.fn_costo_fuera_de_banda`, migración
// 20260930120000): la web NO la repite. Cuando un cierre de Producción, una factura o una recepción trae un costo por
// prenda fuera de lo normal, la base rechaza con el mensaje estable `costo_atipico` y el dato en `details` (JSON:
// motivo, costo_unitario, costo_vigente, precio, sku). Acá solo se LEE esa respuesta y se pone en palabras de CAYLA,
// una sola vez para todas las pantallas que piden confirmar un costo. Puro: sin Supabase ni `next/headers`.

/** El motivo con el que un líder confirma un costo atípico al pasar una orden al stock (P19, Felipe 2026-11-02): de 5 a 300 letras. Es el mismo rango que
 *  `retail.fn_costo_atipico_motivo()`; la base lo vuelve a exigir. */
export const MOTIVO_COSTO_MIN = 5;
export const MOTIVO_COSTO_MAX = 300;

/** Lo que falta para que el motivo sirva, en palabras de CAYLA, o `null` si ya sirve. */
export function problemaDelMotivoDeCosto(texto: string): string | null {
  const limpio = texto.trim();
  if (limpio.length === 0) return "Escribe el motivo: por qué este costo es correcto.";
  if (limpio.length < MOTIVO_COSTO_MIN) return `Cuéntalo con al menos ${MOTIVO_COSTO_MIN} letras.`;
  if (limpio.length > MOTIVO_COSTO_MAX) return `El motivo va hasta ${MOTIVO_COSTO_MAX} letras.`;
  return null;
}

// «sin_igv» y «fuera_de_banda» los suma ADR-0668 (A4, 20261115205000) en Recibir: la base los manda por las mismas puertas.
export const MOTIVOS_COSTO_ATIPICO = ["sin_costo", "mayor_que_precio", "sube", "baja", "sin_igv", "fuera_de_banda"] as const;
export type MotivoCostoAtipico = (typeof MOTIVOS_COSTO_ATIPICO)[number];

export type CostoAtipico = {
  motivo: MotivoCostoAtipico;
  /** El costo por prenda con el que se cerraría. */
  costoUnitario: number;
  /** El costo actual de la prenda (0 o `null` si todavía no tiene). */
  costoVigente: number | null;
  precio: number | null;
  sku: string | null;
  /** La prenda a la que se refiere (las recepciones y facturas lo mandan para saber qué línea corregir). */
  varianteId: string | null;
  /** La posición de la línea en lo que se mandó (desde 1): con ella la pantalla pone la marca y lleva el foco a SU línea. */
  linea: number | null;
};

type ErrorConDetalle = { message?: string | null; details?: string | null } | null | undefined;

const numeroONulo = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Lo que dice la base cuando pide confirmar un costo, o `null` si el error no es ese. Solo el LÍDER recibe el dato: a
 * quien no ve montos la base le contesta `costo_atipico_sin_lider`, sin cifras, y eso NO se lee acá (lo dice
 * `traducirError`). Nunca lanza: un `details` roto es «no es un costo atípico» y el error sigue su camino normal.
 */
export function leerCostoAtipico(error: ErrorConDetalle): CostoAtipico | null {
  if (!error || error.message !== "costo_atipico" || !error.details) return null;
  try {
    return leerLinea(JSON.parse(error.details));
  } catch {
    return null;
  }
}

/** Una línea del JSON de la base, o `null` si le falta el motivo o el costo. */
function leerLinea(d: unknown): CostoAtipico | null {
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const motivo = MOTIVOS_COSTO_ATIPICO.find((m) => m === o.motivo);
  const costoUnitario = numeroONulo(o.costo_unitario);
  if (!motivo || costoUnitario === null) return null;
  return {
    motivo,
    costoUnitario,
    costoVigente: numeroONulo(o.costo_vigente),
    precio: numeroONulo(o.precio),
    sku: typeof o.sku === "string" && o.sku ? o.sku : null,
    varianteId: typeof o.variante_id === "string" && o.variante_id ? o.variante_id : null,
    linea: Number.isInteger(o.linea) && (o.linea as number) > 0 ? (o.linea as number) : null,
  };
}

/**
 * Lo mismo para las pantallas con VARIAS líneas (recepción de un lote, factura, envío): la base junta todas las atípicas en
 * `{"items":[…]}`. Acepta también el formato de una sola línea (Producción), que devuelve como lista de una. Una línea rota se
 * descarta; si no queda ninguna, `null`. Nunca lanza.
 */
export function leerCostosAtipicos(error: ErrorConDetalle): CostoAtipico[] | null {
  if (!error || error.message !== "costo_atipico" || !error.details) return null;
  try {
    const d = JSON.parse(error.details) as { items?: unknown };
    if (Array.isArray(d?.items)) {
      const lineas = d.items.map(leerLinea).filter((l): l is CostoAtipico => l !== null);
      return lineas.length > 0 ? lineas : null;
    }
    const una = leerLinea(d);
    return una ? [una] : null;
  } catch {
    return null;
  }
}

/** El aviso que ve el líder antes de confirmar: qué pasó y con qué cifras, en dos partes (título y detalle). */
export function fraseCostoAtipico(d: CostoAtipico): { titulo: string; detalle: string } {
  const prenda = d.sku ? ` de ${d.sku}` : "";
  const vigente = d.costoVigente !== null && d.costoVigente > 0 ? d.costoVigente : null;
  const cuesta = soles(Math.max(0, d.costoUnitario));

  switch (d.motivo) {
    case "sin_costo":
      return {
        titulo: "El costo por prenda es cero",
        detalle: `Cada prenda${prenda} saldría a ${soles(0)}: quedaría sin costo y con un margen de 100 %.`,
      };
    case "mayor_que_precio":
      return {
        titulo: "El costo es igual o mayor que el precio de venta",
        detalle: `Cada prenda${prenda} saldría a ${cuesta}${d.precio !== null ? ` y se vende a ${soles(d.precio)}` : ""}: se vendería con pérdida.`,
      };
    case "sube":
      return {
        titulo: "El costo por prenda subió mucho",
        detalle: vigente
          ? `Cada prenda${prenda} saldría a ${cuesta}: ${(d.costoUnitario / vigente).toLocaleString("es-PE", { maximumFractionDigits: 1 })} veces su costo actual (${soles(vigente)}).`
          : `Cada prenda${prenda} saldría a ${cuesta}, más del doble de su costo actual.`,
      };
    case "baja":
      return {
        titulo: "El costo por prenda bajó mucho",
        detalle: vigente
          ? `Cada prenda${prenda} saldría a ${cuesta}: ${Math.round((d.costoUnitario / vigente) * 100)} % de su costo actual (${soles(vigente)}).`
          : `Cada prenda${prenda} saldría a ${cuesta}, menos de dos tercios de su costo actual.`,
      };
    case "sin_igv":
      return { titulo: AVISO_DE_DUDA.sin_igv.titulo, detalle: `Cada prenda${prenda} saldría a ${cuesta}: es lo de la orden sin el impuesto.` };
    case "fuera_de_banda":
      return { titulo: AVISO_DE_DUDA.fuera_de_banda.titulo, detalle: `Cada prenda${prenda} saldría a ${cuesta}, lejos de lo que suele costar.` };
  }
}

/* ───────────── El aviso ANTES de guardar (ADR-0668, A4): la misma duda que la base, con sus cifras ───────────── */
//
// Mientras el costo de una prenda tenga una duda sin confirmar, la hoja no sugiere precio (ni la línea «Te quedan» ni la IA) y no deja
// cerrar: un 440 escrito por 44 no debe proponer S/ 998.90. Las palabras son las de la maqueta aprobada
// (`docs/maquetas/precio-sugerido-2026-11/`), recortadas a una línea de 8 palabras o menos (CLAUDE.md «Poco texto»).

/** Los títulos que comparten el aviso de antes y el rechazo de la base. */
const AVISO_DE_DUDA = {
  sin_igv: { titulo: "¿Escribiste el monto sin impuesto?" },
  fuera_de_banda: { titulo: "Fuera de lo que suele costar" },
} as const;

export type AvisoDeCostoDudoso = {
  titulo: string;
  linea: string;
  /** «Usar S/ …»: el monto que la pantalla propone poner en su lugar (lo de la orden, con todo). `null`: no hay uno mejor. */
  usar: number | null;
};

/** El aviso para una duda, con las cifras con las que la base la juzgó. */
export function avisoDeCostoDudoso(
  motivo: MotivoDeCosto,
  ref: { anterior: number | null; deLaOrden: number | null; banda: { lo: number; hi: number } | null },
): AvisoDeCostoDudoso {
  switch (motivo) {
    case "sube":
    case "baja":
      return {
        titulo: ref.anterior !== null ? `Antes pagabas ${soles(ref.anterior)}` : "Es muy distinto a lo de antes",
        linea: "¿Es de una prenda, no de la docena?",
        usar: null,
      };
    case "sin_igv":
      return { titulo: AVISO_DE_DUDA.sin_igv.titulo, linea: ref.deLaOrden !== null ? `La orden dice ${soles(ref.deLaOrden)} con todo.` : "Pon el total del papel.", usar: ref.deLaOrden };
    case "fuera_de_banda":
      return {
        titulo: AVISO_DE_DUDA.fuera_de_banda.titulo,
        linea: ref.banda ? `Suele ir de ${soles(ref.banda.lo)} a ${soles(ref.banda.hi)}.` : "¿Es de una prenda? Revisa los ceros.",
        usar: null,
      };
  }
}

/**
 * El aviso para UNA o VARIAS líneas a la vez: una recepción o una factura puede traer varias prendas con costo raro y el
 * líder las confirma juntas. Con una sola, el título y el detalle de siempre; con varias, un título con la cuenta y un
 * detalle por línea (cada uno ya nombra su prenda).
 */
export function fraseCostosAtipicos(costos: CostoAtipico[]): { titulo: string; detalles: string[] } {
  if (costos.length === 1) {
    const f = fraseCostoAtipico(costos[0]);
    return { titulo: f.titulo, detalles: [f.detalle] };
  }
  return { titulo: `${costos.length} líneas tienen un costo fuera de lo normal`, detalles: costos.map((c) => fraseCostoAtipico(c).detalle) };
}
