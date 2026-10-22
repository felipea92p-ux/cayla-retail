import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { contarParejasPorCategoria, type MarcaOpcion, type ParejaUso, type ProveedorOpcion, type Vinculo } from "@/lib/marcas";
import { proveedoresParaPedir } from "@/lib/proveedores-reglas";

// Lo que las pantallas que eligen "de quién es" un producto necesitan leer
// (ADR-0109): marcas y proveedores ACTIVOS, qué proveedores trae cada marca, y
// qué parejas se usaron más en cada categoría (para sugerir).
//
// CONTRATO
//   PROMETE: una foto de solo lectura; nunca ofrece una marca o proveedor
//            desactivado, ni un proveedor que es solo de gastos (luz, agua, internet:
//            ADR-0452, act. 2026-10-21) salvo que ya traiga una marca.
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
    supabase.from("proveedores").select("id, nombre, rubros").eq("activo", true).order("nombre"),
    supabase.from("marca_proveedores").select("marca_id, proveedor_id"),
    supabase
      .from("productos")
      .select("categoria_id, marca_id, proveedor_id")
      .order("created_at", { ascending: false })
      .limit(VENTANA_PRODUCTOS),
  ]);

  const marcas = exigir(resMarcas, "las marcas");
  const activos = exigir(resProveedores, "los proveedores");
  // Solo parejas cuya marca Y proveedor siguen activos: ofrecer una pareja con un proveedor desactivado terminaría en error al guardar.
  const activasM = new Set(marcas.map((m) => m.id));
  const activosP = new Set(activos.map((p) => p.id));
  const vinculos = exigir(resVinculos, "los proveedores de cada marca")
    .filter((v) => activasM.has(v.marca_id) && activosP.has(v.proveedor_id))
    .map((v) => ({ marcaId: v.marca_id, proveedorId: v.proveedor_id }));

  const productos = exigir(resProductos, "los productos recientes");
  // A quién se le asigna una marca o un producto: sin quien es solo de gastos, salvo el que ya trae alguna marca (es de mercadería por
  // definición: ocultarlo dejaría una pareja marca-proveedor a medias con algo que existe). Un producto con marca y proveedor siempre
  // tiene su vínculo (la llave compuesta de `productos`), así que mirar los vínculos alcanza y no depende de la ventana de productos;
  // al editar uno, su proveedor actual se conserva aparte (`conservarProv` de ElegirMarcaProveedor).
  const enUso = new Set<string>(vinculos.map((v) => v.proveedorId));
  const proveedores: ProveedorOpcion[] = proveedoresParaPedir(activos, enUso).map((p) => ({ id: p.id, nombre: p.nombre }));

  return {
    marcas,
    proveedores,
    vinculos,
    parejasPorCategoria: contarParejasPorCategoria(productos),
  };
}
