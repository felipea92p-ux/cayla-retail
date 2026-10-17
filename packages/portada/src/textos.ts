// Los textos del héroe de una campaña (antes en apps/tienda/lib/portada.ts): los usan la tienda y la vista previa del ERP, para que la
// portada que se diseña diga exactamente lo mismo que la que ve el cliente.

/**
 * El nombre en dos partes: la línea de arriba y la que va en cursiva. Sin `corte`, la última palabra en cursiva («Aniversario» /
 * «CAYLA»); con `corte`, desde esa palabra (0: todo en cursiva; tantas como palabras o más: nada en cursiva).
 */
export function partirTitulo(nombre: string, corte: number | null = null): [string, string] {
  const palabras = nombre.trim().split(/\s+/);
  if (corte === null) {
    if (palabras.length < 2) return [nombre.trim(), ""];
    return [palabras.slice(0, -1).join(" "), palabras[palabras.length - 1]];
  }
  return [palabras.slice(0, corte).join(" "), palabras.slice(corte).join(" ")];
}

/** «12» o «12.5»: el porcentaje sin ceros de más. */
export const pctTexto = (pct: number) => String(Number(pct.toFixed(2)));

/** La campaña rige todo su último día en Lima: termina a las 23:59:59 (UTC−5). */
export const finDeCampana = (hasta: string) => new Date(`${hasta}T23:59:59-05:00`).getTime();

export function partesCuenta(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

const fecha = (hasta: string, opciones: Intl.DateTimeFormatOptions) =>
  new Date(`${hasta}T12:00:00-05:00`).toLocaleDateString("es-PE", { ...opciones, timeZone: "America/Lima" });

/** «21 de octubre» */
export const fechaLarga = (hasta: string) => fecha(hasta, { day: "numeric", month: "long" });

/** «21 oct.» */
export const fechaCorta = (hasta: string) => fecha(hasta, { day: "numeric", month: "short" });

/** Lo que una campaña anuncia: su nombre, su descuento (null: sin descuento, actividad 6a) y su último día. */
export type AnuncioDeCampana = { nombre: string; pct: number | null; hasta: string | null };

/**
 * La frase de la franja de arriba: «Día del Gato · −15 % hasta el 30 oct.» o, sin descuento, «Navidad · mira lo que elegimos». El «%» va
 * pegado a su número con un espacio que no se parte (en un celular angosto la frase baja a dos líneas, nunca deja el «%» solo).
 */
export function anuncioDeCampana({ nombre, pct, hasta }: AnuncioDeCampana): string {
  if (!pct) return `${nombre} · mira lo que elegimos`;
  return `${nombre} · −${pctTexto(pct)}\u00a0%${hasta ? ` hasta el ${fechaCorta(hasta)}` : ""}`;
}

/** Lo que el héroe dice en negrita antes de su frase: «−15 % en prendas elegidas.» o, sin descuento, «Prendas elegidas para Navidad.». */
export const destacadoDeCampana = ({ nombre, pct }: Pick<AnuncioDeCampana, "nombre" | "pct">): string =>
  pct ? `−${pctTexto(pct)} % en prendas elegidas.` : `Prendas elegidas para ${nombre}.`;
