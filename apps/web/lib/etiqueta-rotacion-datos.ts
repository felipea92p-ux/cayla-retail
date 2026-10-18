import "server-only";
// La lectura de Rotación en la pestaña Etiquetas (actividad 6, ADR-0441), sin migración: las mismas lecturas de Análisis, en todas
// las tiendas. Una sola forma de contar el stock y lo vendido en el ERP: si mañana Análisis corrige cómo cuenta un cambio, estas
// tarjetas lo siguen solas.
//
// CONTRATO
//   PROMETE: por talla y color, lo libre (piso y almacén) y lo vendido en 30 días de todas las tiendas activas (`fn_analisis_sede`), y
//            lo que salió sin registrar en esos días (`prendas_por_regularizar`) solo si quien mira es líder (la RLS deja ver las de
//            todas las tiendas solo al líder: con su sede sola, la nota diría un número chico como si fuera de la red).
//   ASUME:   quien mira puede analizar (líder o un rol que ve Análisis): sin eso `fn_analisis_sede` devuelve NULL y aquí no se llama.
//   FALLA:   NUNCA lanza ni hace esperar la pestaña: si una tienda no responde o tarda más de `ESPERA_MS`, devuelve `null` y las tarjetas
//            se ven como antes, sin la línea de unidades (principio 9).

import { createClient } from "@/lib/supabase/server";
import { getPrendasPorSede } from "@/lib/analisis-sede";
import { getUbicaciones } from "@/lib/ubicaciones";
import { leerVendidoSinRegistrar } from "@/lib/vendido-sin-registrar";
import { hoyLima, sumarDias } from "@/lib/fechas-lima";
import { DIAS_ROTACION, juntarTiendas, type LecturaRotacion } from "@/lib/etiqueta-rotacion";

/** Cuánto se espera la lectura antes de mostrar la pestaña sin ella: tres `fn_analisis_sede` en paralelo, una por tienda. */
const ESPERA_MS = 4000;

async function leer(esLider: boolean): Promise<LecturaRotacion | null> {
  const tiendas = (await getUbicaciones()).filter((u) => u.tipo === "tienda" && u.activo);
  if (tiendas.length === 0) return null;
  const ids = tiendas.map((t) => t.id);
  const desde = `${sumarDias(hoyLima(), -(DIAS_ROTACION - 1))}T00:00:00-05:00`;
  const [lectura, sinRegistrar] = await Promise.all([
    getPrendasPorSede(ids),
    esLider
      ? createClient()
          .then((supabase) => Promise.all(ids.map((id) => leerVendidoSinRegistrar(supabase, id, desde))))
          .then((porTienda) => porTienda.reduce((n, filas) => n + filas.length, 0))
          .catch((e: unknown) => {
            console.error(`vendido sin registrar de Etiquetas: ${e instanceof Error ? e.message : String(e)}`);
            return null;
          })
      : Promise.resolve(null),
  ]);
  // Si una tienda no respondió, la suma saldría corta y la tarjeta diría «quedan 3» cuando quedan 8: mejor no decir nada.
  if (lectura.falla) {
    console.error(`rotación de Etiquetas: ${lectura.falla}`);
    return null;
  }
  const porTalla = juntarTiendas(lectura.porSede);
  let registradas = 0;
  for (const t of porTalla.values()) registradas += t.vendidas;
  return { porTalla: Object.fromEntries(porTalla), registradas, sinRegistrar };
}

export async function getLecturaRotacion(esLider: boolean): Promise<LecturaRotacion | null> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tarde = new Promise<null>((resolver) => {
    reloj = setTimeout(() => resolver(null), ESPERA_MS);
  });
  try {
    return await Promise.race([
      leer(esLider).catch((e: unknown) => {
        console.error(`rotación de Etiquetas: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }),
      tarde,
    ]);
  } finally {
    clearTimeout(reloj);
  }
}
