import { z } from "zod";
import { anuncioDeCampana, disenoParaPintar } from "@cayla-retail/portada";

// Lo que la portada pública muestra sin cuenta (ADR-0408): las campañas que anuncia la portada, en orden (LA regla de la base,
// ADR-0436; con más de una, el carrusel de la actividad 6b). La base lo arma en `retail.tienda_portada()`; aquí solo se valida la forma y
// se preparan los textos.
const esquemaCampana = z.object({
  // Su id y sus modelos (ADR-0436, actividad 6a): con ellos se muestran las prendas de una campaña sin descuento, que no bajan de precio
  // y no salen en «Ofertas». Una base de antes no los trae: sin id ni modelos, la campaña se anuncia igual que antes.
  id: z.string().uuid().nullish().catch(null).transform((x) => x ?? null),
  nombre: z.string().min(1),
  // null: una campaña sin descuento (actividad 6a). Un 0 o un texto siguen siendo una respuesta rara.
  pct: z.number().positive().nullable(),
  // Último día de la campaña (fecha de Lima, «2026-10-21»); null si no tiene fecha de término.
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  // Su diseño publicado en el ERP (ADR-0436, actividad 5). Nunca tumba la campaña: si falta, esta versión no lo sabe leer o su letra
  // no se lee, queda null y la portada sale con el rojo de siempre (`disenoParaPintar`, la misma revisión que apaga «Publicar»).
  diseno: z.unknown().optional().transform(disenoParaPintar),
  prendas: z.array(z.string().uuid()).catch([]).optional().transform((x) => x ?? []),
});

const esquemaPortada = z.object({
  campana: esquemaCampana.nullable(),
  // Todas, en orden (la primera es `campana`). Una base de antes del carrusel no la trae: sale la única que manda.
  campanas: z.array(z.unknown()).optional(),
});

export type Campana = z.infer<typeof esquemaCampana>;
/** `campana`: la primera (la franja con cuenta y la lista de una campaña la siguen leyendo así); `campanas`: todas, en orden. */
export type Portada = { campana: Campana | null; campanas: Campana[] };

/** Sin base no hay campaña, pero la portada igual se muestra (principio 9: se degrada, no se cae). */
export const PORTADA_SIN_DATOS: Portada = { campana: null, campanas: [] };

/**
 * Lo que manda la base, revisado. Una respuesta sin forma (o con la primera campaña rara) es la portada sin campaña, como siempre; en la
 * lista, una campaña rara se salta sin tumbar a las demás (la tienda de esta versión no sabe leerla).
 */
export function interpretarPortada(dato: unknown): Portada {
  const resultado = esquemaPortada.safeParse(dato);
  if (!resultado.success) return PORTADA_SIN_DATOS;
  const { campana, campanas } = resultado.data;
  if (campanas === undefined) return { campana, campanas: campana ? [campana] : [] };
  const leidas = campanas.flatMap((c) => {
    const r = esquemaCampana.safeParse(c);
    return r.success ? [r.data] : [];
  });
  return { campana: leidas[0] ?? null, campanas: leidas };
}

// Los textos del héroe (partir el nombre, el porcentaje, las fechas y el contador) viven en la portada en una sola pieza
// (@cayla-retail/portada, ADR-0436): la vista previa del ERP los dice igual. Se reexportan para que la tienda los siga pidiendo aquí
// (el contador, `finDeCampana` y `partesCuenta`, lo pide `CuentaRegresiva` directo al paquete, que lo prueba en `textos.test.ts`).
export { fechaCorta, fechaLarga, partirTitulo, pctTexto } from "@cayla-retail/portada";

/** El año en Lima, para la tarjeta del club y el pie. */
export const anioLima = (ahora = new Date()) =>
  Number(ahora.toLocaleDateString("en-CA", { year: "numeric", timeZone: "America/Lima" }));

/** Las frases de la franja de arriba, en el orden en que rotan. Las de las campañas van primero, en su orden (`anuncioDeCampana`, la
 *  misma frase de la vista previa del ERP; sin descuento, sin %). Con cuenta no se invita a crearla (quien ya entró leía «Crea tu
 *  cuenta…», revisión 2026-10-15): se le recuerda dónde están sus beneficios del Club. */
export function anuncios(campanas: readonly Campana[], conCuenta = false): string[] {
  const club = conCuenta ? "Tus beneficios del Club CAYLA están en Mi perfil" : "Crea tu cuenta y forma parte del Club CAYLA";
  return [...campanas.map(anuncioDeCampana), "Separa online y recoge en tu tienda", "Mira cuánto hay en cada tienda", club];
}
