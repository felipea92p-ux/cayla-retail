// Lo que se le pide a la IA para proponer un precio y cómo se lee lo que devuelve (ADR-0641).
//
// PROMETE: unas instrucciones fijas (la API las guarda en caché), un mensaje con los datos de la prenda y sus parecidas, el formato
//   exacto de la respuesta y la lectura de esa respuesta contra la regla fija (`precio-propuesto-reglas.ts`): la IA propone, el piso
//   de costo + 30 % y el .90 mandan.
// ASUME: el contexto viene de `fn_precio_contexto` (sin clientes ni personas). NO HACE: no llama a la IA (eso es `/api/precio/proponer`).

import * as z from "zod/v4";
import { elegirCosto, revisarPrecioDeLaIA, type CostoUsado, type PrecioRevisado } from "./precio-propuesto-reglas";

/** El modelo que propone precios: el de fábrica para trabajo que pide criterio (Felipe eligió que la IA proponga el precio). */
export const MODELO_PRECIO = "claude-opus-5-5";

/** Lo que espera la pantalla, en ms: la persona está mirando el botón. Si no responde, se sigue sin propuesta. */
export const ESPERA_PRECIO_MS = 45_000;

/** Lo que devuelve `fn_precio_contexto`. */
export type ParecidaContexto = {
  referencia: string;
  tejido: string | null;
  mismo_tejido: boolean;
  precio: number;
  costo: number | null;
  unidades_90: number;
  stock: number;
  dias_desde_alta: number;
};
export type ContextoPrecio = {
  categoria: { nombre: string; familia: string | null; prefijo: string | null };
  costo_categoria: number | null;
  prendas_con_costo: number;
  producto: { referencia: string; precio: number | null; costo: number | null; unidades_90: number; stock: number; dias_desde_alta: number } | null;
  parecidas: ParecidaContexto[];
};

export const RespuestaPrecioIA = z.object({
  precio: z.number().describe("Precio de etiqueta propuesto en soles, terminado en .90."),
  razon: z.string().describe("Por qué ese precio, en 1 o 2 frases cortas para una encargada de tienda."),
  parecidas: z
    .array(z.object({ referencia: z.string(), precio: z.number() }))
    .describe("Las 1 a 3 prendas parecidas (de la lista) que más pesaron, con su precio."),
});
export type RespuestaPrecioIA = z.infer<typeof RespuestaPrecioIA>;

export const INSTRUCCIONES_PRECIO = `Pones los precios de etiqueta de CAYLA, una marca peruana de moda con tiendas en Trujillo, Arequipa y Lima y un taller propio.

Te dan una prenda (su categoría, su nombre si ya lo tiene, su costo) y hasta 12 prendas parecidas de la misma categoría con su precio, su costo, cuántas se vendieron en los últimos 90 días y cuántas quedan en stock. Propón UN precio de etiqueta en soles.

Cómo decidir:
- El costo manda: el precio tiene que dejar al menos 30 % de margen sobre el precio (precio × 0,70 ≥ costo). Si con eso queda por encima de las parecidas, propón el piso y dilo.
- Los precios de CAYLA terminan en .90 (S/\u00a049.90, S/\u00a089.90).
- Mira primero las parecidas del mismo tejido. Una parecida que se vende bien a un precio es buena referencia; una con mucho stock y pocas ventas probablemente está cara.
- Si el costo es "estimado" (es el promedio de la categoría, no el de esta prenda), propón igual pero dilo en la razón.
- Si te dan el precio actual de la prenda (revisión), di si conviene subirlo, bajarlo o dejarlo igual, y propón el que pondrías. Dejarlo igual es una respuesta válida.

La razón: 1 o 2 frases cortas, de tú, en español neutro peruano, como se lo dirías a la encargada de la tienda. Nombra 1 a 3 parecidas. Sin porcentajes de estadística ni palabras técnicas. Nunca inventes una prenda que no esté en la lista.`;

/** Lo que va en el mensaje: la prenda y sus parecidas, como datos. Nada de clientes, personas ni sedes. */
export function mensajePrecio(p: {
  origen: "alta" | "revision" | "recepcion";
  contexto: ContextoPrecio;
  costo: CostoUsado;
  referencia?: string | null;
  descripcion?: string | null;
  tejido?: string | null;
}): string {
  const prenda = {
    categoria: p.contexto.categoria.nombre,
    familia: p.contexto.categoria.familia,
    nombre: p.referencia?.trim() || p.contexto.producto?.referencia || null,
    descripcion: p.descripcion?.trim() || null,
    tejido: p.tejido ?? null,
    costo: p.costo.costo,
    costo_es: p.costo.estimado ? "estimado (promedio de la categoría)" : "real",
    // Una prenda que ya existe (revisión, o la que llegó otra vez al recibir): su precio de hoy y cómo se vende.
    ...(p.contexto.producto
      ? {
          precio_actual: p.contexto.producto.precio,
          vendidas_90_dias: p.contexto.producto.unidades_90,
          stock: p.contexto.producto.stock,
          dias_desde_alta: p.contexto.producto.dias_desde_alta,
        }
      : {}),
  };
  const parecidas = p.contexto.parecidas.map((x) => ({
    nombre: x.referencia,
    tejido: x.tejido,
    mismo_tejido: x.mismo_tejido,
    precio: x.precio,
    costo: x.costo,
    vendidas_90_dias: x.unidades_90,
    stock: x.stock,
  }));
  const tarea = !p.contexto.producto
    ? "Propón el precio de esta prenda nueva."
    : p.origen === "recepcion"
      ? "Llegó otra vez esta prenda, con el costo de esta compra. Revisa su precio: di si conviene subirlo, bajarlo o dejarlo."
      : "Revisa el precio de esta prenda que ya se vende.";
  return `${tarea}\n\nPrenda:\n${JSON.stringify(prenda, null, 1)}\n\nParecidas (${parecidas.length}):\n${JSON.stringify(parecidas, null, 1)}`;
}

export type PropuestaLista = PrecioRevisado & {
  costo: number;
  costoEstimado: boolean;
  razon: string;
  /** Solo las que de verdad están en la lista que se le dio (la IA no puede inventar una prenda). */
  parecidas: { referencia: string; precio: number }[];
};

/** Lo que devolvió la IA, revisado: el precio por la regla fija y las parecidas contra la lista. `null` si no se le puede creer. */
export function leerRespuestaPrecio(cruda: RespuestaPrecioIA | null, costo: CostoUsado, contexto: ContextoPrecio): PropuestaLista | null {
  if (!cruda) return null;
  const revisado = revisarPrecioDeLaIA(cruda.precio, costo.costo);
  if (!revisado) return null;
  const razon = cruda.razon.replace(/\s+/g, " ").trim().slice(0, 600);
  if (razon.length < 10) return null;
  const conocidas = new Map(contexto.parecidas.map((x) => [x.referencia.toLowerCase(), x]));
  const parecidas = cruda.parecidas
    .map((x) => conocidas.get(x.referencia.trim().toLowerCase()))
    .filter((x): x is ParecidaContexto => !!x)
    .filter((x, i, todas) => todas.indexOf(x) === i)
    .slice(0, 3)
    .map((x) => ({ referencia: x.referencia, precio: x.precio }));
  return { ...revisado, costo: costo.costo, costoEstimado: costo.estimado, razon, parecidas };
}

/** El costo con que se calcula, a partir del contexto: el escrito (alta), el de la prenda (revisión) o el de la categoría. */
export function costoDelContexto(contexto: ContextoPrecio, costoEscrito: number | null): CostoUsado | null {
  return elegirCosto(costoEscrito ?? contexto.producto?.costo ?? null, contexto.costo_categoria);
}
