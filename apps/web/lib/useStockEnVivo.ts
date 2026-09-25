"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { stockYApartadoReleidos } from "@/lib/vender-stock-local";
import { sumarCantidades } from "@/lib/inventario-reglas";

/**
 * Stock en vivo, compartido por Vender/Apartados/Cambios (2026-09-25) — cierra el hueco que reportó Felipe:
 * escaneó una prenda «agotada» en Vender, la repusieron en otra caja con la pantalla todavía abierta, y no se
 * sumó hasta reiniciar el navegador. Nada releía `stock` mientras la pantalla seguía montada; cada una de estas
 * tres pantallas cargaba su catálogo UNA vez al entrar y solo se corregía con lo que ELLA MISMA vendía/apartaba/
 * cambiaba (ADR-0192). Afecta igual al lector físico del mostrador, no es un problema de la cámara.
 *
 * Sondeo, no Supabase Realtime, por la misma razón que `useCajaEnVivo`/`useDeTurno` (ADR-0018): la publicación
 * de Realtime sigue en 0 tablas, y activarla es un `alter publication` en el proyecto Postgres COMPARTIDO con
 * Dynamic — para y confirma con Felipe antes de correrlo, no es ejecución directa.
 */

/**
 * Lee de la base el stock cobrable de una sede (lectura directa de `stock`, la misma de `getDisponibleEnSede`
 * pero desde el cliente; un GET no enciende el loader general, ADR-0149). Con `ids`, solo esas prendas (`.in`,
 * acotado a `conocidos`); sin ellos, TODA la sede — sin `.in`, para no armar una URL con cientos de ids de
 * golpe. Lo que no vuelve en la respuesta queda en 0 (`conStockReleido`), nunca "no sé". `null` si la consulta
 * falló: quien llama decide qué hacer (la pantalla suele quedarse con lo que ya mostraba).
 *
 * Devuelve el stock cobrable Y lo apartado en el piso, de las MISMAS filas (una sola consulta): una prenda pasa de
 * «agotada» a «apartada para una clienta» cuando lo que falta en el piso es de otra clienta, y para decirlo la pantalla
 * necesita las dos cifras al día, no solo la primera.
 */
export async function leerStockYApartadoDeSede(
  ubicacionId: string,
  conocidos: string[],
  ids?: string[],
): Promise<{ stock: Map<string, number>; apartado: Map<string, number> } | null> {
  const conocidosSet = new Set(conocidos);
  const pedidas = ids ? [...new Set(ids)].filter((id) => conocidosSet.has(id)) : conocidos;
  if (pedidas.length === 0) return { stock: new Map(), apartado: new Map() };
  const consulta = createClient()
    .from("stock")
    .select("variante_id, cantidad, cantidad_apartada, sububicacion:sububicaciones ( tipo )")
    .eq("ubicacion_id", ubicacionId);
  const { data, error } = await (ids ? consulta.in("variante_id", pedidas) : consulta);
  if (error || !data) return null;
  return stockYApartadoReleidos(pedidas, sumarCantidades(data));
}

/** Solo lo cobrable (para quien no necesita lo apartado). Misma consulta que `leerStockYApartadoDeSede`. */
export async function leerStockDeSede(ubicacionId: string, conocidos: string[], ids?: string[]): Promise<Map<string, number> | null> {
  return (await leerStockYApartadoDeSede(ubicacionId, conocidos, ids))?.stock ?? null;
}

/**
 * Sondea `leerStockYApartadoDeSede` mientras la pantalla sigue montada y `activo` (p. ej. hay caja abierta: no hay
 * nada que cobrar/apartar/cambiar igual). `alLeer` recibe el mapa releído de lo cobrable y, como segundo argumento, el
 * de lo apartado en el piso (quien no lo necesita lo ignora) cada vez que la lectura sale bien —cada pantalla decide
 * dónde aterriza (su propio `ajustesStock`)—; una lectura que falla no llama a `alLeer`, la pantalla se queda con lo
 * que ya mostraba. Sondea también al volver a la pestaña o a la red; nunca con la pestaña oculta, sin conexión, ni
 * con `activo` en falso.
 *
 * `conocidos` y `alLeer` se leen siempre en su versión más reciente por ref (mismo idioma que `onCodigoRef` en
 * `EscanerCamara`): así el intervalo no se resetea con cada render de quien los provee (una tecla del buscador,
 * por ejemplo) sin que haga falta memoizarlos del lado de quien llama.
 */
export function useStockEnVivo(
  ubicacionId: string,
  conocidos: string[],
  activo: boolean,
  alLeer: (releido: Map<string, number>, apartado: Map<string, number>) => void,
  cadaMs = 10_000,
) {
  const conocidosRef = useRef(conocidos);
  const alLeerRef = useRef(alLeer);
  useEffect(() => {
    conocidosRef.current = conocidos;
    alLeerRef.current = alLeer;
  });

  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    const sondear = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const leido = await leerStockYApartadoDeSede(ubicacionId, conocidosRef.current);
      if (leido && !cancelado) alLeerRef.current(leido.stock, leido.apartado);
    };
    void sondear();
    const id = window.setInterval(sondear, cadaMs);
    const alVolver = () => {
      if (document.visibilityState === "visible") void sondear();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", sondear);
    return () => {
      cancelado = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", sondear);
    };
  }, [ubicacionId, activo, cadaMs]);
}
