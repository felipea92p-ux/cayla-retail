import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { contarParejasPorCategoria, type MarcaOpcion, type ParejaUso, type ProveedorOpcion, type Vinculo } from "@/lib/marcas";

// Lo que las pantallas que eligen "de quién es" un producto necesitan leer
// (ADR-0109): marcas y proveedores ACTIVOS, qué proveedores trae cada marca, y
// qué parejas se usaron más en cada categoría (para sugerir).
//
// CONTRATO
//   PROMETE: una foto de solo lectura; nunca ofrece una marca o proveedor
//            desactivado.
//   NO HACE: "más usadas" es una sugerencia sobre los últimos 2.000 productos,
//            no un dato contable — mismo criterio que los colores más usados.

export type CatalogoMarcas = {
  marcas: MarcaOpcion[];
  proveedores: ProveedorOpcion[];
  vinculos: Vinculo[];
  parejasPorCategoria: Record<string, ParejaUso[]>;
};

const VENTANA_PRODUCTOS = 2000;

export async function getCatalogoMarcas(): Promise<CatalogoMarcas> {
  const supabase = await createClient();
  const [resMarcas, resProveedores, resVinculos, resProductos] = await Promise.all([
    supabase.from("marcas").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("marca_proveedores").select("marca_id, proveedor_id"),
    supabase
      .from("productos")
      .select("categoria_id, marca_id, proveedor_id")
      .order("created_at", { ascending: false })
      .limit(VENTANA_PRODUCTOS),
  ]);

  const marcas = exigir(resMarcas, "las marcas");
  const proveedores = exigir(resProveedores, "los proveedores");
  // Solo parejas cuya marca Y proveedor siguen activos: ofrecer una pareja con un proveedor desactivado terminaría en error al guardar.
  const activasM = new Set(marcas.map((m) => m.id));
  const activosP = new Set(proveedores.map((p) => p.id));
  const vinculos = exigir(resVinculos, "los proveedores de cada marca")
    .filter((v) => activasM.has(v.marca_id) && activosP.has(v.proveedor_id))
    .map((v) => ({ marcaId: v.marca_id, proveedorId: v.proveedor_id }));

  return {
    marcas,
    proveedores,
    vinculos,
    parejasPorCategoria: contarParejasPorCategoria(exigir(resProductos, "los productos recientes")),
  };
}
