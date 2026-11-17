import * as z from "zod/v4";
import { TIPOS_MEJORA } from "./informe";

// La forma de lo que la IA devuelve en el informe del lunes (ADR-0536, actividad 10). Solo lo usa el servidor (`informe-servidor.ts`).
// Vive aparte de `informe.ts` (ADR-0674 act. g): ese archivo lo importa también la tarjeta del informe, que dibuja el navegador, y por
// tener el esquema adentro «Preguntas del equipo» bajaba zod entero sin validar nada con él.

/** Lo que la IA devuelve, siempre con esta forma (salida estructurada). */
export const InformeDeLaIA = z.object({
  mejoras: z.array(
    z.object({
      tipo: z.enum(TIPOS_MEJORA),
      /** Qué hacer, en una línea (máx. 80 letras). */
      titulo: z.string(),
      /** Por qué y qué cambia para la tienda, en dos o tres frases (máx. 300 letras), sin cifras. */
      detalle: z.string(),
      /** Las referencias («p1», «p7»…) de las preguntas que la sostienen, tal cual vinieron en la lista. */
      preguntas: z.array(z.string()),
    }),
  ),
});
export type InformeDeLaIA = z.infer<typeof InformeDeLaIA>;
