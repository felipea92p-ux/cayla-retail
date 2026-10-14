import { createClient } from "@/lib/supabase/server";
import { exigir, leerTodas } from "@/lib/resultado";
import type { FichaDeModelo } from "@/lib/produccion-hoja-modelo";
import type { ColorConFicha } from "@/lib/ficha-del-color";

// La ficha de cada modelo del Resumen de Producción: lo que Catálogo ▸ Productos dice en la suya (código, marca, proveedor, material, patrón, descripción, temporada).
// Es un dato SECUNDARIO: quien llama la envuelve en `opcional(...)`, y si no se pudo leer la hoja «Ver el modelo» lo dice en vez de escribir «sin registrar». Son columnas de
// `productos` y de sus tablas de vocabulario, de lectura abierta a toda sesión (`productos_select`): no hace falta un permiso más ni una migración.

/**
 * `productoId` → su ficha. Un modelo que la base no devuelve (no existe, o no se vio) simplemente no aparece: quien arma la hoja le pasa `null`.
 * Se lee por páginas con orden único (ADR-0192): el Resumen puede ofrecer más modelos de los que caben en una respuesta de PostgREST.
 */
export async function getFichasDeModelos(productoIds: readonly string[]): Promise<Record<string, FichaDeModelo>> {
  if (productoIds.length === 0) return {};
  const supabase = await createClient();
  const pedidos = new Set(productoIds);
  const filas = exigir(
    await leerTodas((desde, hasta) =>
      supabase
        .from("productos")
        .select("id, codigo, descripcion, temporada, marca:marcas ( nombre ), proveedor:proveedores ( nombre ), tejido:tejidos ( nombre ), patron:patrones ( nombre )")
        .order("id")
        .range(desde, hasta),
    ),
    "la ficha de los modelos",
  );
  const limpio = (t: string | null | undefined) => t?.trim() || null;
  const salida: Record<string, FichaDeModelo> = {};
  for (const f of filas) {
    if (!pedidos.has(f.id)) continue;
    salida[f.id] = {
      codigo: limpio(f.codigo),
      descripcion: limpio(f.descripcion),
      marca: limpio(f.marca?.nombre),
      proveedor: limpio(f.proveedor?.nombre),
      tejido: limpio(f.tejido?.nombre),
      patron: limpio(f.patron?.nombre),
      temporada: limpio(f.temporada),
    };
  }
  return salida;
}

/**
 * El vocabulario de colores con su ficha (qué transmite cada uno y con qué se combina, ADR-0316): la hoja la muestra bajo la foto del color que se mira, como Catálogo ▸ Productos.
 * Solo los activos: un color desactivado no se recomienda. Misma lectura, mismas columnas y mismo permiso que las otras pantallas que la usan (Productos, Vender).
 */
export async function getFichasDeColor(): Promise<ColorConFicha[]> {
  const supabase = await createClient();
  const colores = exigir(await supabase.from("colores").select("codigo, nombre, hex, familia_color, tipo, descripcion, combina_con").eq("activo", true).order("nombre"), "los colores");
  return colores.map((c) => ({ codigo: c.codigo, nombre: c.nombre, hex: c.hex, familiaColor: c.familia_color ?? "", tipo: c.tipo, descripcion: c.descripcion ?? null, combinaCon: c.combina_con ?? [] }));
}
