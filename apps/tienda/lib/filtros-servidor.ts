import "server-only";
import { cache } from "react";
import { SEGUNDOS_DEL_CATALOGO } from "./catalogo-servidor";
import { db, lecturaCompartida } from "./compartido-servidor";
import { interpretarFiltros, type DatosDeFiltros } from "./filtros-color-talla";

// Qué hay por color y talla (ADR-0512, actividad 3) es igual para todos los que miran la misma tienda: qué variantes de cada prenda tienen
// unidades. Se comparte entre visitas el mismo medio minuto que el catálogo, con el que se junta en la página, para que la prenda que se ve
// en la lista y lo que dice el filtro hablen de la misma foto de la tienda. Solo se pide cuando la dirección trae `?color=` o `?talla=`:
// una visita sin filtros no gasta ni una consulta de más.
const filtrosCompartidos = lecturaCompartida("tienda-filtros-v1", SEGUNDOS_DEL_CATALOGO, async (sedeId: string | null) => {
  const [fila] = await db()`select retail.tienda_filtros(${sedeId}::uuid) as filtros`;
  return fila?.filtros ?? null;
});

/** Qué variantes hay de cada prenda en la tienda `sedeId` (o, sin ella, «Todas»). Si la base no responde, la función todavía no existe o
 *  responde algo raro, `null`: la lista se ve entera, sin filtrar, y la persona no pierde nada (principio 9). Un solo aviso en el registro por
 *  fallo, sin ningún dato de nadie. Una vez por petición y tienda. */
export const leerFiltros = cache(async (sedeId: string | null): Promise<DatosDeFiltros | null> => {
  try {
    return interpretarFiltros(await filtrosCompartidos(sedeId));
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_filtros_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return null;
  }
});
