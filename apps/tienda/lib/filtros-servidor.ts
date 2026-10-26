import "server-only";
import { cache } from "react";
import { SEGUNDOS_DEL_CATALOGO } from "./catalogo-servidor";
import { db, lecturaCompartida } from "./compartido-servidor";
import { interpretarFiltros, type DatosDeFiltros } from "./filtros-color-talla";
import { sedeDeLaUrl, sedesEnOrden } from "./sede-elegida";
import { leerSedes } from "./tiendas-servidor";

// Qué hay por color y talla (ADR-0512, actividad 3) es igual para todos los que miran la misma tienda: qué variantes de cada prenda tienen
// unidades. Se comparte entre visitas el mismo medio minuto que el catálogo, con el que se junta en la página, para que la prenda que se ve
// en la lista y lo que dice el filtro hablen de la misma foto de la tienda. Solo se pide cuando la dirección trae `?color=` o `?talla=`:
// una visita sin filtros no gasta ni una consulta de más.
//
// Es un complemento de la lista (sin él se ve entera), así que NUNCA la hace esperar como al catálogo: la base corta esta lectura a los 2 s (el
// tope del usuario de la tienda es de 5 s; medido el 2026-10-26: con la función dormida 6 s, la página llegaba a los 5,2 s) y la lista, además,
// no espera más de 2 s por ella aunque la conexión ni se haya abierto.
const TOPE_DE_LA_LECTURA = "2s";
const ESPERA_MAXIMA_DE_LOS_FILTROS_MS = 2000;

const filtrosCompartidos = lecturaCompartida("tienda-filtros-v1", SEGUNDOS_DEL_CATALOGO, async (sedeId: string | null) => {
  // `set local` vale solo dentro de esta transacción: el tope no se queda pegado a la conexión que vuelve al pool.
  const fila = await db().begin(async (sql) => {
    await sql`select set_config('statement_timeout', ${TOPE_DE_LA_LECTURA}, true)`;
    const [una] = await sql`select retail.tienda_filtros(${sedeId}::uuid) as filtros`;
    return una;
  });
  return fila?.filtros ?? null;
});

// Un fallo se anota UNA vez cada 10 s por proceso: con la base caída y mucha gente en la lista, una línea por visita (y por pasada de la página)
// tapaba el resto del registro. Sin ningún dato de nadie: solo el evento y lo que dijo la base.
const AVISOS_CADA_MS = 10000;
let ultimoAviso = 0;
function anotarFallo(mensaje: string) {
  const ahora = Date.now();
  if (ahora - ultimoAviso < AVISOS_CADA_MS) return;
  ultimoAviso = ahora;
  console.error(JSON.stringify({ evento: "tienda_filtros_fallo", mensaje }));
}

/** Qué variantes hay de cada prenda en la tienda `sedeId` (o, sin ella, «Todas»). Si la base no responde, tarda más de 2 s, la función todavía no
 *  existe o responde algo raro, `null`: la lista se ve entera, sin filtrar (y lo dice: la página avisa que no pudo aplicar lo elegido), y la persona
 *  no pierde nada (principio 9). Una vez por petición y tienda. */
export const leerFiltros = cache(async (sedeId: string | null): Promise<DatosDeFiltros | null> => {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  try {
    const tope = new Promise<never>((_, rechazar) => {
      reloj = setTimeout(() => rechazar(new Error(`tarda más de ${ESPERA_MAXIMA_DE_LOS_FILTROS_MS} ms`)), ESPERA_MAXIMA_DE_LOS_FILTROS_MS);
    });
    const datos = interpretarFiltros(await Promise.race([filtrosCompartidos(sedeId), tope]));
    if (!datos) anotarFallo("la base respondió algo que no es lo esperado");
    return datos;
  } catch (error) {
    anotarFallo(error instanceof Error ? error.message : String(error));
    return null;
  } finally {
    clearTimeout(reloj);
  }
});

/** Lo mismo, pidiendo la tienda por su clave de la dirección (`?sede=trujillo`), como llega al navegador. No confía en lo que llega: la busca
 *  entre las tiendas de la web (`sedeDeLaUrl`); una que no existe es «Todas». */
export async function leerFiltrosDeLaSede(sede: string | null): Promise<DatosDeFiltros | null> {
  const sedes = sedesEnOrden(await leerSedes());
  return leerFiltros((sede ? sedeDeLaUrl(sede, sedes) : null)?.id ?? null);
}
