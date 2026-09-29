"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { almacenReleido, apartadoReleido, conStockReleido } from "@/lib/vender-stock-local";
import { sumarCantidades } from "@/lib/inventario-reglas";
import { leerTodas } from "@/lib/resultado";
import { mismoStock, type StockReleido } from "@/lib/stock-en-vivo-reglas";

export type { StockReleido } from "@/lib/stock-en-vivo-reglas";
export { mismoStock } from "@/lib/stock-en-vivo-reglas";

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
 * Por páginas (`leerTodas`), como `getDisponibleEnSede`: PostgREST corta en 1.000 filas SIN error y TRU pasa de
 * 2.300 (piso + almacén). Sin paginar, el sondeo de cada 10 s dejaba en 0 —«agotada»— toda prenda cuyas filas
 * cayeran fuera de las primeras 1.000, al azar; y con la fila de almacén dentro y la de piso fuera, la caja diría
 * «está en el almacén» de una prenda colgada. `sububicacion_id` desempata: la fila es única por (variante,
 * ubicación, sububicación), y sin un orden único dos páginas pueden repetir o saltarse filas.
 *
 * Siempre en serie (`enParalelo: 1`, auditoría 2026-09-29): con `ids` (lo recién vendido, unas pocas filas)
 * cabe en una página igual, y sin `ids` es el sondeo de cada 10 s de TODAS las cajas abiertas a la vez — pedir
 * varias páginas en paralelo ahí multiplica las peticiones simultáneas contra PostgREST sin acortar un sondeo
 * que ya corre en segundo plano, sin que nadie lo espere.
 */
export async function leerStockDeSede(ubicacionId: string, conocidos: string[], ids?: string[]): Promise<StockReleido | null> {
  const conocidosSet = new Set(conocidos);
  const pedidas = ids ? [...new Set(ids)].filter((id) => conocidosSet.has(id)) : conocidos;
  if (pedidas.length === 0) return { cobrable: new Map(), almacen: new Map(), apartado: new Map() };
  const supabase = createClient();
  const { data, error } = await leerTodas(
    (desde, hasta) => {
      // Una consulta nueva por página: el constructor de supabase-js se modifica al encadenar y las páginas van en
      // paralelo; si compartieran uno, las tres pedirían el mismo rango.
      const consulta = supabase
        .from("stock")
        .select("variante_id, cantidad, cantidad_apartada, sububicacion:sububicaciones ( tipo )")
        .eq("ubicacion_id", ubicacionId);
      return (ids ? consulta.in("variante_id", pedidas) : consulta).order("variante_id").order("sububicacion_id").range(desde, hasta);
    },
    { enParalelo: 1 },
  );
  if (error || !data) return null;
  const cantidades = sumarCantidades(data);
  return { cobrable: conStockReleido(new Map(), pedidas, cantidades), almacen: almacenReleido(pedidas, cantidades), apartado: apartadoReleido(pedidas, cantidades) };
}

/**
 * Sondea `leerStockDeSede` mientras la pantalla sigue montada y `activo` (p. ej. hay caja abierta: no hay nada
 * que cobrar/apartar/cambiar igual). `alLeer` recibe el mapa releído cada vez que la lectura sale bien —cada
 * pantalla decide dónde aterriza (su propio `ajustesStock`)—, y de yapa el almacén (solo Vender lo usa) y lo
 * apartado en el piso (Vender y Cambios); quien no los necesita ignora los argumentos que sobran; una lectura que falla no llama a `alLeer`, la
 * pantalla se queda con lo que ya mostraba. Sondea también al volver a la pestaña o a la red; nunca con la
 * pestaña oculta, sin conexión, ni con `activo` en falso.
 *
 * `conocidos` y `alLeer` se leen siempre en su versión más reciente por ref (mismo idioma que `onCodigoRef` en
 * `EscanerCamara`): así el intervalo no se resetea con cada render de quien los provee (una tecla del buscador,
 * por ejemplo) sin que haga falta memoizarlos del lado de quien llama.
 */
export function useStockEnVivo(
  ubicacionId: string,
  conocidos: string[],
  activo: boolean,
  alLeer: (releido: Map<string, number>, almacen: Map<string, number | null>, apartado: Map<string, number>) => void,
  cadaMs = 10_000,
) {
  const conocidosRef = useRef(conocidos);
  const alLeerRef = useRef(alLeer);
  useEffect(() => {
    conocidosRef.current = conocidos;
    alLeerRef.current = alLeer;
  });
  // Lo último que se avisó de verdad (no lo último que se leyó): si la sede no cambió en 10 s, `sondear` vuelve
  // a leer lo mismo y NO llama a `alLeer` — evita el repintado de la grilla entera con datos idénticos.
  const ultimoRef = useRef<StockReleido | null>(null);

  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    // Cada arranque del sondeo (sede nueva, caja que se abre) parte sin memoria: la primera lectura siempre avisa.
    ultimoRef.current = null;
    const sondear = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const releido = await leerStockDeSede(ubicacionId, conocidosRef.current);
      if (!releido || cancelado) return;
      if (ultimoRef.current && mismoStock(ultimoRef.current, releido)) return;
      ultimoRef.current = releido;
      alLeerRef.current(releido.cobrable, releido.almacen, releido.apartado);
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
