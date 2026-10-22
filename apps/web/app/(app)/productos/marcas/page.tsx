import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { proveedoresParaPedir } from "@/lib/proveedores-reglas";
import { MarcasLista, type MarcaFila } from "@/components/MarcasLista";

// Marcas del catálogo y qué proveedores las traen (ADR-0109, 20260918231000).
// Sin proponer/aprobar, como Familias y Categorías: quien cataloga elige entre
// las que existen, y solo un Líder las agrega, renombra o desactiva. Una marca
// puede llegar por más de un proveedor (raro, pero pasa con accesorios y
// chompas importadas), por eso esta pantalla muestra la PAREJA y no un campo.
export default async function MarcasPage() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();

  const [resMarcas, resProveedores, resVinculos, resProductos] = await Promise.all([
    supabase.from("marcas").select("id, nombre, activo").order("nombre"),
    supabase.from("proveedores").select("id, nombre, rubros").eq("activo", true).order("nombre"),
    supabase.from("marca_proveedores").select("marca_id, proveedor_id"),
    supabase.from("productos").select("marca_id, proveedor_id, estado"),
  ]);
  const marcas = exigir(resMarcas, "las marcas");
  const activos = exigir(resProveedores, "los proveedores");
  const vinculos = exigir(resVinculos, "los proveedores de cada marca");
  const productos = exigir(resProductos, "los productos");

  // Los nombres salen de TODOS los activos: una marca ya vinculada a un proveedor se lee con su nombre, sea cual sea su rubro.
  const nombreProveedor = new Map(activos.map((p) => [p.id, p.nombre]));
  // A quién se le puede sumar una marca: sin quien es solo de gastos (ADR-0452, act. 2026-10-21), salvo el que ya trae alguna marca (de
  // mercadería por definición; todo producto con marca y proveedor tiene su vínculo, así que los vínculos alcanzan).
  const enUso = new Set<string>(vinculos.map((v) => v.proveedor_id));
  const proveedores = proveedoresParaPedir(activos, enUso).map((p) => ({ id: p.id, nombre: p.nombre }));
  // Cuántos productos ACTIVOS hay por pareja: es lo que dice si una marca se puede desactivar sin fricción. Y cuántos en
  // TOTAL (también descontinuados): mientras haya uno, la llave de `productos` no deja quitar esa pareja en «Editar».
  const usoPareja = new Map<string, number>();
  const usoParejaTotal = new Map<string, number>();
  const usoMarca = new Map<string, number>();
  for (const p of productos) {
    // Un producto sin marca (ADR-0283) no cuenta para ninguna tarjeta; uno con marca pero sin proveedor cuenta para su marca,
    // no para una pareja (la llave compuesta solo lo ata a ella cuando hay los dos).
    if (!p.marca_id) continue;
    const pareja = p.proveedor_id ? `${p.marca_id}|${p.proveedor_id}` : null;
    if (pareja) usoParejaTotal.set(pareja, (usoParejaTotal.get(pareja) ?? 0) + 1);
    if (p.estado !== "activo") continue;
    if (pareja) usoPareja.set(pareja, (usoPareja.get(pareja) ?? 0) + 1);
    usoMarca.set(p.marca_id, (usoMarca.get(p.marca_id) ?? 0) + 1);
  }

  const filas: MarcaFila[] = marcas.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    activo: m.activo,
    productos: usoMarca.get(m.id) ?? 0,
    proveedores: vinculos
      .filter((v) => v.marca_id === m.id)
      .map((v) => ({
        id: v.proveedor_id,
        nombre: nombreProveedor.get(v.proveedor_id) ?? "(proveedor desactivado)",
        productos: usoPareja.get(`${m.id}|${v.proveedor_id}`) ?? 0,
        productosTotal: usoParejaTotal.get(`${m.id}|${v.proveedor_id}`) ?? 0,
      })),
  }));

  return <MarcasLista marcasIniciales={filas} proveedores={proveedores} puedeEditar={puede(persona, "editarCatalogo")} sede={persona.ubicacionEtiqueta} />;
}
