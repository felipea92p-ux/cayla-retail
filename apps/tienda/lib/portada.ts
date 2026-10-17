import { z } from "zod";
import { fechaCorta, pctTexto } from "@cayla-retail/portada";

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

// Los textos del héroe (partir el nombre, el porcentaje, las fechas y el contador) viven en la portada en una sola pieza
// (@cayla-retail/portada, ADR-0436): la vista previa del ERP los dice igual. Se reexportan para que la tienda los siga pidiendo aquí
// (el contador, `finDeCampana` y `partesCuenta`, lo pide `CuentaRegresiva` directo al paquete, que lo prueba en `textos.test.ts`).
export { fechaCorta, fechaLarga, partirTitulo, pctTexto } from "@cayla-retail/portada";

/** El año en Lima, para la tarjeta del club y el pie. */
export const anioLima = (ahora = new Date()) =>
  Number(ahora.toLocaleDateString("en-CA", { year: "numeric", timeZone: "America/Lima" }));

/** Las frases de la franja de arriba, en el orden en que rotan. La de la campaña va primero si hay una. Con cuenta no se invita a
 *  crearla (quien ya entró leía «Crea tu cuenta…», revisión 2026-10-15): se le recuerda dónde están sus beneficios del Club. El «%» va
 *  pegado a su número con un espacio que no se parte (en un celular angosto la frase baja a dos líneas). */
export function anuncios(campana: Campana | null, conCuenta = false): string[] {
  const club = conCuenta ? "Tus beneficios del Club CAYLA están en Mi perfil" : "Crea tu cuenta y forma parte del Club CAYLA";
  const frases = ["Separa online y recoge en tu tienda", "Mira cuánto hay en cada tienda", club];
  if (!campana) return frases;
  const hasta = campana.hasta ? ` hasta el ${fechaCorta(campana.hasta)}` : "";
  return [`${campana.nombre} · −${pctTexto(campana.pct)}\u00a0%${hasta}`, ...frases];
}
