import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ProveedoresAnalisis } from "@/lib/analisis-tipos";
import { leerProveedoresAnalisis } from "@/lib/analisis-proveedores-lectura";
import { datosDe } from "@/lib/analisis-con-tope";
import { leerPieza } from "@/lib/analisis-lectura";
import { leerTodas } from "@/lib/resultado";

// Análisis v4 (ADR-0357, «Actualización 2026-10-16», A8): a quién se le pide cada modelo. Lee `productos.proveedor_id` (el proveedor del
// CATÁLOGO) y los nombres de `proveedores`, con un SELECT desde el servidor: sin función de la base ni migración. Las dos tablas las lee
// toda cuenta del equipo (`productos_select` y `proveedores_select` piden `fn_tiene_acceso_retail()`), y quien puede abrir Análisis ya
// pasó esa puerta (`fn_analisis_sede` la exige junto con `fn_puede_analizar`), así que cualquier cuenta con el módulo lo puede leer.
// De `proveedores` solo se piden `id`, `nombre` y `activo`: ni RUC, ni banco, ni teléfono.
//
// Si no responde (o no a tiempo: `analisis-con-tope.ts`), `proveedores` es null y se dice en `falla` (principio 9): la pantalla no
// dibuja «Pídelo a …» ni «A quién pedir», y nunca dice «Sin proveedor» por un error.

export type LecturaProveedores = {
  /** null = no se pudo leer. */
  proveedores: ProveedoresAnalisis | null;
  falla: string | null;
};

/** Lo que se dice si no se pudo leer. */
export const FALLA_PROVEEDORES = "No se pudo leer a quién se le pide cada modelo: no se muestra «Pídelo a …» ni «A quién pedir»";

export async function getProveedoresAnalisis(): Promise<LecturaProveedores> {
  const lectura = await leerPieza("proveedores", {}, async () => {
    const supabase = await createClient();
    // Los modelos con proveedor son cientos y los proveedores, un centenar: cabe en una página, pero PostgREST corta en 1.000 sin avisar,
    // así que se lee por páginas con orden único (`leerTodas`). `enParalelo: 1`: la 2.ª página solo se pide si la 1.ª vino llena.
    const [productos, proveedores] = await Promise.all([
      leerTodas((desde, hasta) => supabase.from("productos").select("id, proveedor_id").not("proveedor_id", "is", null).order("id").range(desde, hasta), { enParalelo: 1 }),
      leerTodas((desde, hasta) => supabase.from("proveedores").select("id, nombre, activo").order("id").range(desde, hasta), { enParalelo: 1 }),
    ]);
    if (productos.error) throw productos.error;
    if (proveedores.error) throw proveedores.error;
    // null = la base respondió algo que no se entiende.
    return leerProveedoresAnalisis(productos.data, proveedores.data);
  });
  const proveedores = datosDe(lectura);
  return proveedores ? { proveedores, falla: null } : { proveedores: null, falla: FALLA_PROVEEDORES };
}
