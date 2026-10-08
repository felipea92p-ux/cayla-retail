"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { leerTodas } from "@/lib/resultado";
import { mismosPrecios, type PreciosReleidos } from "@/lib/precios-en-vivo-reglas";
import { registrarPreciosPropios } from "@/lib/precios-en-vivo-registro";
import type { CampanaLinea } from "@/lib/vender-reglas";

export type { PreciosReleidos } from "@/lib/precios-en-vivo-reglas";

/**
 * Precios y campañas en vivo para Vender (Felipe, 2026-10-08: cambió un precio y quitó una etiqueta de descuento
 * desde otra pestaña y la caja no se enteró). Sondeo, no Supabase Realtime, por la misma razón que `useStockEnVivo`
 * (ADR-0018): activar Realtime es un `alter publication` en el proyecto compartido con Dynamic.
 *
 * Cada vuelta hace lo mínimo:
 * · el precio se relee solo si subió la versión del catálogo (`fn_catalogo_version`, 20260923184300: la sube la base en
 *   cualquier escritura de `variantes`, venga de donde venga). Preguntar la versión es leer un número; sin cambios, no se
 *   lee nada más. Si la versión no se puede leer, se relee el precio igual (más lento, nunca viejo).
 * · las campañas se releen siempre: poner o quitar una etiqueta NO sube esa versión (las etiquetas no están en el
 *   catálogo), y es justo lo que la caja tiene que ver al instante.
 * Las dos son lecturas (un GET y RPC con prefijo `fn_`/`campanas_`): no encienden el loader general (ADR-0149).
 */
async function leerPrecios(conocidos: Set<string>): Promise<Map<string, number> | null> {
  const supabase = createClient();
  const { data, error } = await leerTodas(
    (desde, hasta) => supabase.from("variantes").select("id, precio").order("id").range(desde, hasta),
    { enParalelo: 1 },
  );
  if (error || !data) return null;
  return new Map(data.filter((v) => conocidos.has(v.id)).map((v) => [v.id, Number(v.precio)]));
}

async function leerCampanas(): Promise<Map<string, CampanaLinea> | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("campanas_vigentes");
  // Igual que al cargar la pantalla: si la función no existe en esa base (PGRST202) no hay campañas que aplicar.
  if (error) return error.code === "PGRST202" ? new Map() : null;
  return new Map((data ?? []).map((c) => [c.variante_id, { etiquetaId: c.etiqueta_id, nombre: c.etiqueta_nombre, pct: Number(c.descuento_pct) }]));
}

async function leerVersion(): Promise<number | null> {
  const { data, error } = await createClient().rpc("fn_catalogo_version");
  return error || data === null ? null : Number(data);
}

/**
 * Sondea mientras la pantalla sigue montada y `activo` (hay caja abierta). `alLeer` recibe la lectura cada vez que
 * cambia respecto de la anterior; una lectura que falla no lo llama (la pantalla se queda con lo que mostraba). Sondea
 * también al volver a la pestaña —el caso de Felipe: cambia el precio en otra pestaña y vuelve a Vender— y a la red;
 * nunca con la pestaña oculta ni sin conexión. `conocidos` y `alLeer` se leen por ref, como en `useStockEnVivo`.
 */
export function usePreciosEnVivo(conocidos: string[], activo: boolean, alLeer: (releido: PreciosReleidos) => void, cadaMs = 10_000) {
  const conocidosRef = useRef(conocidos);
  const alLeerRef = useRef(alLeer);
  useEffect(() => {
    conocidosRef.current = conocidos;
    alLeerRef.current = alLeer;
  });
  const ultimoRef = useRef<PreciosReleidos | null>(null);
  const versionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!activo) return;
    // Mientras esta pantalla relee por su cuenta, el refresco general (`<PreciosEnVivo />`) no la rehace.
    const borrarRegistro = registrarPreciosPropios();
    let cancelado = false;
    let enCurso = false;
    ultimoRef.current = null;
    versionRef.current = null;
    const sondear = async () => {
      if (enCurso || document.visibilityState !== "visible" || !navigator.onLine) return;
      enCurso = true;
      try {
        const version = await leerVersion();
        const hayPrecios = ultimoRef.current !== null;
        const releerPrecios = !hayPrecios || version === null || version !== versionRef.current;
        const [precios, campanas] = await Promise.all([
          releerPrecios ? leerPrecios(new Set(conocidosRef.current)) : Promise.resolve(ultimoRef.current!.precios),
          leerCampanas(),
        ]);
        if (cancelado || !precios) return;
        versionRef.current = version;
        // Campañas que no cargaron: se conservan las últimas releídas (o las del servidor, si aún no hay ninguna).
        const releido: PreciosReleidos = { precios, campanas: campanas ?? ultimoRef.current?.campanas ?? null };
        if (ultimoRef.current && mismosPrecios(ultimoRef.current, releido)) return;
        ultimoRef.current = releido;
        alLeerRef.current(releido);
      } finally {
        enCurso = false;
      }
    };
    void sondear();
    const id = window.setInterval(sondear, cadaMs);
    const alVolver = () => {
      if (document.visibilityState === "visible") void sondear();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    window.addEventListener("online", sondear);
    return () => {
      cancelado = true;
      borrarRegistro();
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
      window.removeEventListener("online", sondear);
    };
  }, [activo, cadaMs]);
}
