"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resumirCatalogo, type DatosCatalogo } from "@/lib/recomendaciones-temas";

/** Lo que la hoja sabe del catálogo para responder: nada pedido todavía, leyendo, leído, o no se pudo (la hoja sigue sin cifras). */
export type LecturaCatalogo = { estado: "sin_pedir" } | { estado: "leyendo" } | { estado: "ok"; datos: DatosCatalogo } | { estado: "fallo" };

/** Las prendas activas que se leen como máximo (en producción eran ~2.050 el 2026-10-17: tres vueltas de 1.000). */
const VUELTAS = 6;
const POR_VUELTA = 1000;

// Una lectura por visita a la pantalla: abrir otra recomendación que habla de tallas no vuelve a pedir el catálogo.
let lectura: Promise<DatosCatalogo> | null = null;

async function leerCatalogo(): Promise<DatosCatalogo> {
  const base = createClient();
  const [tallas, colores] = await Promise.all([
    base.from("tallas").select("id, valor").eq("activo", true),
    base.from("colores").select("codigo, nombre, hex"),
  ]);
  if (tallas.error || colores.error) throw tallas.error ?? colores.error;
  const variantes: { producto_id: string; talla_id: string | null; color_codigo: string | null }[] = [];
  for (let i = 0; i < VUELTAS; i++) {
    // Los modelos activos que no son de prueba: lo que un cliente podría encontrar hoy.
    const { data, error } = await base
      .from("variantes")
      .select("producto_id, talla_id, color_codigo, productos!inner(estado, es_prueba)")
      .eq("activo", true)
      .eq("productos.estado", "activo")
      .eq("productos.es_prueba", false)
      // Sin un orden único, dos vueltas pueden repetir una variante o saltarse otra (el contador de modelos por talla sale desviado).
      .order("id")
      .range(i * POR_VUELTA, (i + 1) * POR_VUELTA - 1);
    if (error) throw error;
    for (const v of data ?? []) variantes.push({ producto_id: v.producto_id, talla_id: v.talla_id, color_codigo: v.color_codigo });
    if ((data ?? []).length < POR_VUELTA) break;
  }
  return resumirCatalogo(variantes, tallas.data ?? [], colores.data ?? []);
}

/**
 * El catálogo que sirve para responder («Lo que pide», actividad 4): modelos por talla y colores en uso. Se lee solo si `activo` (algún
 * tema de la recomendación lo necesita) y una vez por visita. Todo lo lee cualquier cuenta del ERP (las políticas de `variantes`,
 * `productos`, `tallas` y `colores` piden solo una cuenta de retail): no depende de la sede de quien responde, a diferencia del stock.
 * Si no responde, se degrada así: la hoja no muestra cifras y las formas de empezar no afirman ninguna; no se pierde nada.
 */
export function useCatalogoParaResponder(activo: boolean): LecturaCatalogo {
  const [resultado, setResultado] = useState<LecturaCatalogo | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    lectura ??= leerCatalogo();
    lectura.then(
      (datos) => vivo && setResultado({ estado: "ok", datos }),
      () => {
        lectura = null; // la próxima vez que se abra una que lo necesite, se vuelve a intentar
        if (vivo) setResultado({ estado: "fallo" });
      },
    );
    return () => {
      vivo = false;
    };
  }, [activo]);
  if (resultado) return resultado;
  return activo ? { estado: "leyendo" } : { estado: "sin_pedir" };
}
