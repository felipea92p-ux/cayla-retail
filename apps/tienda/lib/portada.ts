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

const fecha = (hasta: string, opciones: Intl.DateTimeFormatOptions) =>
  new Date(`${hasta}T12:00:00-05:00`).toLocaleDateString("es-PE", { ...opciones, timeZone: "America/Lima" });

/** El año en Lima, para la tarjeta del club y el pie. */
export const anioLima = (ahora = new Date()) =>
  Number(ahora.toLocaleDateString("en-CA", { year: "numeric", timeZone: "America/Lima" }));

/** «21 de octubre» */
export const fechaLarga = (hasta: string) => fecha(hasta, { day: "numeric", month: "long" });

/** «21 oct.» */
export const fechaCorta = (hasta: string) => fecha(hasta, { day: "numeric", month: "short" });

export type FraseAnuncio = { texto: string; icono: "ticket" | "flechas" | "chat" | "chispa"; href?: string };

/** Los mensajes de la franja de arriba (Felipe 2026-11-05). Solo lo que la tienda hace hoy, y cada uno lleva a donde se explica. La campaña va primero si
 *  hay una. El plazo de cambio sale de la base (`retail.tienda_ayuda()`); sin él, la frase no dice un número. El «%» va pegado a su número con un
 *  espacio que no se parte (en un celular angosto la frase baja a dos líneas). */
export function anuncios(campana: Campana | null, diasParaCambiar: number | null): FraseAnuncio[] {
  const frases: FraseAnuncio[] = [
    { texto: "Separa sin pagar", icono: "ticket", href: "/como-separar" },
    { texto: diasParaCambiar ? `Cambios en ${diasParaCambiar} días` : "Cambios en cualquier tienda", icono: "flechas", href: "/cambios-y-devoluciones" },
    { texto: "Atención por WhatsApp", icono: "chat", href: "/tiendas" },
  ];
  if (!campana) return frases;
  const hasta = campana.hasta ? ` hasta el ${fechaCorta(campana.hasta)}` : "";
  return [{ texto: `${campana.nombre} · −${pctTexto(campana.pct)}\u00a0%${hasta}`, icono: "chispa" }, ...frases];
}
