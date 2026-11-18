import { z } from "zod";
import type { HojaLibro, ListaLibro } from "./libro-reclamaciones-reglas";

// La lectura de `retail.fn_libro_reclamaciones()` (ADR-0679). Vive aparte porque es la única pieza del Libro con zod: la usa la página
// (servidor), y los componentes importan solo `libro-reclamaciones-reglas.ts`, sin zod (ADR-0674, `lib/vender-no-se-arrastra.test.ts`).

const esquemaHoja = z.object({
  id: z.string().uuid(),
  codigo: z.string(),
  creada_en: z.string(),
  tipo: z.enum(["reclamo", "queja"]),
  tienda: z.string().nullable(),
  consumidor: z.object({
    nombre: z.string(),
    tipo_documento: z.enum(["dni", "ce", "pasaporte"]),
    documento: z.string(),
    domicilio: z.string(),
    telefono: z.string(),
    correo: z.string(),
    menor_de_edad: z.boolean(),
    apoderado: z.string().nullable(),
  }),
  bien: z.object({ tipo: z.enum(["producto", "servicio"]), monto: z.union([z.number(), z.string()]).nullable(), descripcion: z.string() }),
  detalle: z.string(),
  pedido: z.string(),
  copia_enviada: z.boolean(),
  vence_el: z.string(),
  dias_restantes: z.number(),
  /** La respuesta de CAYLA (PARTE 4, 20261118152000). Sin el dato, todavía sin responder. */
  respuesta: z.string().nullable().optional().default(null),
  respondida_en: z.string().nullable().optional().default(null),
  /** Si la respuesta ya salió al correo del cliente (la manda la tienda). */
  respuesta_enviada: z.boolean().optional().default(false),
});

/** La lista de `fn_libro_reclamaciones`, o null si la forma no se entiende (la pantalla dice que no se pudo leer). Una hoja rara se
 *  salta: no tumba a las demás. */
export function leerLibro(dato: unknown): ListaLibro | null {
  const r = z.object({ hoy: z.string(), hojas: z.array(z.unknown()), hay_mas: z.boolean() }).safeParse(dato);
  if (!r.success) return null;
  return {
    hoy: r.data.hoy,
    hayMas: r.data.hay_mas,
    hojas: r.data.hojas.flatMap((h) => {
      const x = esquemaHoja.safeParse(h);
      return x.success ? [x.data satisfies HojaLibro] : [];
    }),
  };
}

