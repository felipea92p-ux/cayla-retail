/**
 * Temporadas como atributo del producto (ADR-0246): las reglas puras que comparten la pestaña «Temporadas» de Atributos,
 * la ficha, el alta y la lista «Sin temporada». Sin React ni supabase, para usarlas en el servidor y en el navegador.
 *
 * Lo que NO vive aquí, a propósito: cuál es la temporada de una prenda (color → producto → categoría). Esa regla es
 * UNA sola y está en la base (`retail.fn_temporada_efectiva`); la pantalla solo muestra lo que la base resolvió.
 */

import type { Opcion } from "@/components/ui/campos";

export type Estacion = "otono" | "invierno" | "primavera" | "verano";

/** Una fila de `retail.fn_temporadas()`. */
export type Temporada = {
  clave: string;
  nombre: string;
  orden: number;
  es_clasico: boolean;
  estacion_desde: Estacion | null;
  estacion_hasta: Estacion | null;
  mitad: "PV" | "OI" | null;
};

/** Una fila de `retail.fn_calendario_estaciones()`. */
export type EventoCalendario = {
  anio: number;
  estacion: Estacion;
  inicio: string;
  hasta: string | null;
  fuente: "senamhi" | "usno" | "ajustada";
  editable: boolean;
  en_curso: boolean;
};

/** Una fila de `retail.fn_temporada_efectiva()`: la temporada de cada modelo+color y de dónde la sacó. */
export type TemporadaEfectiva = {
  producto_id: string;
  color_codigo: string | null;
  estado: string;
  temporada: string | null;
  origen: "color" | "producto" | "categoria" | null;
};

export const NOMBRE_ESTACION: Record<Estacion, string> = {
  otono: "Otoño",
  invierno: "Invierno",
  primavera: "Primavera",
  verano: "Verano",
};

/** Las etiquetas de la fuente de una fecha del calendario, en palabras de tienda. */
export const NOMBRE_FUENTE: Record<EventoCalendario["fuente"], string> = {
  senamhi: "SENAMHI",
  usno: "Por confirmar con SENAMHI",
  ajustada: "Ajustada por el líder",
};

/** El valor del desplegable que significa «sin temporada propia» (hereda la de su categoría, o queda sin temporada). */
export const SIN_PROPIA = "";

/** El nombre de una clave; si la clave no está en la lista (no debería: la base lo impide), la muestra tal cual. */
export function nombreTemporada(temporadas: readonly Temporada[], clave: string | null | undefined): string | null {
  if (!clave) return null;
  return temporadas.find((t) => t.clave === clave)?.nombre ?? clave;
}

/**
 * Las opciones del desplegable de temporada, en el orden de la lista. La primera dice qué pasa si no se elige nada:
 * «Igual que su categoría (Verano)» cuando la categoría tiene una, o «Sin temporada» cuando no. Así nadie tiene que
 * adivinar que «vacío» hereda.
 *
 * `heredada`: el nombre de lo que se hereda si se deja vacío (la temporada de la categoría en la ficha; la del producto
 * en la excepción por color), y de quién.
 */
export function opcionesTemporada(
  temporadas: readonly Temporada[],
  heredada: { nombre: string | null; de: "categoría" | "prenda" } = { nombre: null, de: "categoría" },
): Opcion<string>[] {
  const primera: Opcion<string> = {
    valor: SIN_PROPIA,
    texto: heredada.nombre ? `Igual que su ${heredada.de} (${heredada.nombre})` : "Sin temporada",
  };
  return [
    primera,
    ...[...temporadas]
      .sort((a, b) => a.orden - b.orden)
      .map((t) => ({ valor: t.clave, texto: t.nombre, grupo: t.es_clasico ? "Clásicos" : "De temporada" })),
  ];
}

/**
 * Contra qué prendas mide Frescura si una envejeció, dicho con palabras y no con siglas («PV»/«OI» no le dicen nada a
 * nadie): la mitad del año de su temporada. Los clásicos, aunque sean de verano o de invierno, van aparte: se miden
 * contra su propia historia, no contra la moda de la temporada.
 */
export function grupoDeComparacion(t: Pick<Temporada, "es_clasico" | "mitad">): string {
  if (t.es_clasico) return "Aparte (clásico)";
  return t.mitad === "OI" ? "Otoño-Invierno" : "Primavera-Verano";
}

/** Cuándo termina la estación de una temporada, dicho para la tienda. Los clásicos de todo el año no terminan. */
export function textoFinDeEstacion(t: Pick<Temporada, "es_clasico" | "estacion_hasta">): string {
  if (!t.estacion_hasta) return "Todo el año: no pasa a temporada pasada";
  // «la primavera», pero «el verano», «el otoño», «el invierno».
  const fin = `al empezar ${t.estacion_hasta === "primavera" ? "la" : "el"} ${NOMBRE_ESTACION[t.estacion_hasta].toLowerCase()}`;
  return t.es_clasico ? `Fuera de su estación se sugiere guardarlo (termina ${fin})` : `Termina ${fin}`;
}

/**
 * El instante de una fecha y hora escritas en la pantalla, SIEMPRE en hora de Perú (UTC−5, sin horario de verano).
 * Sin la zona, la base la tomaría como UTC y la estación empezaría 5 horas antes. `null` si algo no es una fecha real.
 */
export function instanteLima(fecha: string, hora: string): string | null {
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim());
  const h = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!f || !h) return null;
  const a = Number(f[1]);
  const m = Number(f[2]);
  const d = Number(f[3]);
  const hh = Number(h[1]);
  const mm = Number(h[2]);
  if (hh > 23 || mm > 59) return null;
  const utc = new Date(Date.UTC(a, m - 1, d, hh + 5, mm));
  // Una fecha que no existe (31 de junio) se corre al mes siguiente: se rechaza en vez de guardarse otra.
  const local = new Date(utc.getTime() - 5 * 3600_000);
  if (local.getUTCFullYear() !== a || local.getUTCMonth() !== m - 1 || local.getUTCDate() !== d) return null;
  return `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-05:00`;
}

/** La fecha y hora de Perú de un instante guardado, para llenar el formulario al corregirla («2026-12-21», «15:50»). */
export function partesLima(instante: string): { fecha: string; hora: string } {
  const lima = new Date(new Date(instante).getTime() - 5 * 3600_000);
  const dos = (n: number) => String(n).padStart(2, "0");
  return {
    fecha: `${lima.getUTCFullYear()}-${dos(lima.getUTCMonth() + 1)}-${dos(lima.getUTCDate())}`,
    hora: `${dos(lima.getUTCHours())}:${dos(lima.getUTCMinutes())}`,
  };
}

/** «21 dic 2026, 15:50» en hora de Perú. */
export function textoInstanteLima(instante: string): string {
  const { fecha, hora } = partesLima(instante);
  const [a, m, d] = fecha.split("-").map(Number);
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
  return `${d} ${MESES[m - 1]} ${a}, ${hora}`;
}

/** El calendario agrupado por año, en orden, para la tabla de la pestaña. */
export function calendarioPorAnio(eventos: readonly EventoCalendario[]): { anio: number; eventos: EventoCalendario[] }[] {
  const porAnio = new Map<number, EventoCalendario[]>();
  for (const e of [...eventos].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    porAnio.set(e.anio, [...(porAnio.get(e.anio) ?? []), e]);
  }
  return [...porAnio.entries()].sort(([a], [b]) => a - b).map(([anio, evs]) => ({ anio, eventos: evs }));
}

/** ¿Falta el año siguiente en el calendario? Entonces la pestaña avisa que hay que agregarlo. */
export function faltaAnioSiguiente(eventos: readonly EventoCalendario[], anioHoy: number): boolean {
  return eventos.filter((e) => e.anio === anioHoy + 1).length < 4;
}

/**
 * La lista «Sin temporada»: modelos+colores activos sin temporada efectiva, agrupados por prenda. Una prenda aparece con
 * sus colores solo si alguno quedó sin temporada. Las descontinuadas no se piden (ya no se venden).
 */
export function agruparSinTemporada(
  filas: readonly TemporadaEfectiva[],
): { producto_id: string; colores: (string | null)[] }[] {
  const porPrenda = new Map<string, (string | null)[]>();
  for (const f of filas) {
    if (f.temporada || f.estado !== "activo") continue;
    porPrenda.set(f.producto_id, [...(porPrenda.get(f.producto_id) ?? []), f.color_codigo]);
  }
  return [...porPrenda.entries()].map(([producto_id, colores]) => ({ producto_id, colores }));
}

/**
 * Cuántas prendas activas heredan hoy la temporada de una categoría: las que no tienen la suya (ni en el producto ni en
 * sus colores). Es la cifra que se muestra ANTES de cambiarle la temporada a una categoría, porque las reclasifica
 * todas al instante.
 */
export function cuantasHeredan(
  filas: readonly TemporadaEfectiva[],
  productosDeLaCategoria: ReadonlySet<string>,
): number {
  const prendas = new Set<string>();
  for (const f of filas) {
    if (f.estado !== "activo" || !productosDeLaCategoria.has(f.producto_id)) continue;
    if (f.origen === "categoria" || f.origen === null) prendas.add(f.producto_id);
  }
  return prendas.size;
}
