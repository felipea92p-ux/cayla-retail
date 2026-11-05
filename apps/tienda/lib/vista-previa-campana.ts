import { z } from "zod";
import { interpretarDisenoCampana, type DisenoDeLaTienda } from "./diseno-campana";

// La vista previa privada de un diseño de campaña (Tienda web ▸ Campañas, ERP): el líder crea un enlace con una llave larga y la tienda muestra
// ESE diseño —borrador o programado, aunque la campaña aún no empiece— a quien lo tenga, hasta 7 días. La base la arma en
// `retail.tienda_diseno_campana_previa(llave)`; aquí se valida la llave antes de preguntar y la respuesta antes de pintar. Principio 9: una llave
// rara, vencida o una respuesta que no se entiende es «el enlace no sirve», nunca una pantalla a medias ni un error con datos.

/** La llave que crea el ERP: 48 letras de 0 a f. Cualquier otra cosa ni llega a la base. */
export const esLlaveDeVistaPrevia = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{48}$/.test(v);

const esquema = z.object({
  campana: z
    .object({
      nombre: z.string().min(1),
      pct: z.number().positive(),
      desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
      hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
      diseno: z.unknown(),
    })
    .nullable(),
  expira_en: z.string().optional(),
});

export type VistaPreviaDeCampana = {
  campana: { nombre: string; pct: number; desde: string | null; hasta: string | null };
  /** El diseño listo para pintar; `null` si la tienda no sabe pintarlo (la vista previa dice que se vería «como siempre»). */
  diseno: DisenoDeLaTienda | null;
  /** Hasta qué día (de Lima, `aaaa-mm-dd`) vale el enlace. */
  valeHasta: string | null;
};

/** Lo que devuelve la base, convertido en lo que se pinta, o `null` si el enlace no sirve. */
export function interpretarVistaPrevia(dato: unknown, origenDeImagenes?: string | null): VistaPreviaDeCampana | null {
  const leido = esquema.safeParse(dato);
  if (!leido.success || !leido.data.campana) return null;
  const { nombre, pct, desde, hasta, diseno } = leido.data.campana;
  return {
    campana: { nombre, pct, desde, hasta },
    diseno: interpretarDisenoCampana({ campana: { nombre, diseno } }, nombre, origenDeImagenes),
    valeHasta: diaDeLima(leido.data.expira_en),
  };
}

/** El día de Lima (UTC−5, sin horario de verano) de un instante ISO; `null` si no es una fecha. */
function diaDeLima(instante: string | undefined): string | null {
  const t = instante ? Date.parse(instante) : NaN;
  return Number.isNaN(t) ? null : new Date(t - 5 * 3600 * 1000).toISOString().slice(0, 10);
}
