import { z } from "zod";

// Lo que la portada pública muestra sin cuenta (ADR-0408): la campaña vigente que termina primero.
// La base lo arma en `retail.tienda_portada()`; aquí solo se valida la forma y se preparan los textos.
const esquemaPortada = z.object({
  campana: z
    .object({
      nombre: z.string().min(1),
      pct: z.number().positive(),
      // Último día de la campaña (fecha de Lima, «2026-10-21»); null si no tiene fecha de término.
      hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    })
    .nullable(),
});

export type Portada = z.infer<typeof esquemaPortada>;
export type Campana = NonNullable<Portada["campana"]>;

/** Sin base no hay campaña, pero la portada igual se muestra (principio 9: se degrada, no se cae). */
export const PORTADA_SIN_DATOS: Portada = { campana: null };

export function interpretarPortada(dato: unknown): Portada {
  const resultado = esquemaPortada.safeParse(dato);
  return resultado.success ? resultado.data : PORTADA_SIN_DATOS;
}

/** El título grande en dos líneas: «Aniversario» / «CAYLA». La última palabra va en cursiva. */
export function partirTitulo(nombre: string): [string, string] {
  const palabras = nombre.trim().split(/\s+/);
  if (palabras.length < 2) return [nombre.trim(), ""];
  return [palabras.slice(0, -1).join(" "), palabras[palabras.length - 1]];
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

/** El año en Lima, para la tarjeta del club y el pie. */
export const anioLima = (ahora = new Date()) =>
  Number(ahora.toLocaleDateString("en-CA", { year: "numeric", timeZone: "America/Lima" }));

/** «21 de octubre» */
export const fechaLarga = (hasta: string) => fecha(hasta, { day: "numeric", month: "long" });

/** «21 oct.» */
export const fechaCorta = (hasta: string) => fecha(hasta, { day: "numeric", month: "short" });

/** Las frases de la franja de arriba, en el orden en que rotan. La de la campaña va primero si hay una. Con cuenta no se invita a
 *  crearla (quien ya entró leía «Crea tu cuenta…», revisión 2026-10-15): se le recuerda dónde están sus beneficios del Club. El «%» va
 *  pegado a su número con un espacio que no se parte (en un celular angosto la frase baja a dos líneas). */
export function anuncios(campana: Campana | null, conCuenta = false): string[] {
  const club = conCuenta ? "Tus beneficios del Club CAYLA están en Mi cuenta" : "Crea tu cuenta y forma parte del Club CAYLA";
  const frases = ["Separa online y recoge en tu tienda", "Mira cuánto hay en cada tienda", club];
  if (!campana) return frases;
  const hasta = campana.hasta ? ` hasta el ${fechaCorta(campana.hasta)}` : "";
  return [`${campana.nombre} · −${pctTexto(campana.pct)}\u00a0%${hasta}`, ...frases];
}
