import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { Ayuda } from "@/components/Ayuda";
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
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("marca_proveedores").select("marca_id, proveedor_id"),
    supabase.from("productos").select("marca_id, proveedor_id, estado"),
  ]);
  const marcas = exigir(resMarcas, "las marcas");
  const proveedores = exigir(resProveedores, "los proveedores");
  const vinculos = exigir(resVinculos, "los proveedores de cada marca");
  const productos = exigir(resProductos, "los productos");

  const nombreProveedor = new Map(proveedores.map((p) => [p.id, p.nombre]));
  // Cuántos productos ACTIVOS hay por pareja: es lo que dice si una marca se puede desactivar sin fricción. Y cuántos en
  // TOTAL (también descontinuados): mientras haya uno, la llave de `productos` no deja quitar esa pareja en «Editar».
  const usoPareja = new Map<string, number>();
  const usoParejaTotal = new Map<string, number>();
  const usoMarca = new Map<string, number>();
  for (const p of productos) {
    const pareja = `${p.marca_id}|${p.proveedor_id}`;
    usoParejaTotal.set(pareja, (usoParejaTotal.get(pareja) ?? 0) + 1);
    if (p.estado !== "activo") continue;
    usoPareja.set(pareja, (usoPareja.get(pareja) ?? 0) + 1);
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

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Productos · Catálogo</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          Marcas
          <Ayuda titulo="Marcas">
            De quién es cada prenda y qué proveedores la traen. Todo producto tiene una marca y un proveedor, y el proveedor tiene que traer esa marca:
            la base no deja guardar otra pareja. Una marca puede llegar por más de un proveedor. Con «Editar» cambias el nombre y quién la trae: un
            proveedor se quita solo si ninguno de sus productos lo usa. No se puede desactivar una marca con productos activos.
          </Ayuda>
        </h1>
      </div>

      <MarcasLista marcasIniciales={filas} proveedores={proveedores} puedeEditar={puede(persona, "editarCatalogo")} />
    </div>
  );
}
