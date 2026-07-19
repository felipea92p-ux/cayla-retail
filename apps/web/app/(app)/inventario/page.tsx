import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoInteligente, type VarianteInteligente } from "@/lib/inteligencia";
import { createClient } from "@/lib/supabase/server";
import { InventarioNav } from "@/components/InventarioNav";
import { InventarioAgrupado, type ProductoAgrupado } from "@/components/InventarioAgrupado";

export default async function InventarioPage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  const [{ variantes }, sedesResult] = await Promise.all([
    getCatalogoInteligente(persona),
    supabase.from("sedes").select("id, codigo, tipo").order("codigo"),
  ]);
  const todasSedes = sedesResult.data ?? [];
  const sedesOperativas = todasSedes.filter((s) => s.tipo !== "almacen");
  const almacenPropio = todasSedes.find((s) => s.tipo === "almacen" && s.codigo === `${persona.sedeCodigo}-ALM`) ?? null;

  const { data: contenedoresAlmacen } = almacenPropio
    ? await supabase.from("contenedores").select("id, codigo").eq("sede_id", almacenPropio.id).order("codigo")
    : { data: [] };

  // Agrupar variantes por producto — una fila por modelo, matriz de tallas adentro.
  const porProducto = new Map<string, ProductoAgrupado>();
  variantes.forEach((v: VarianteInteligente) => {
    const actual = porProducto.get(v.productoId);
    if (actual) {
      actual.variantes.push(v);
    } else {
      porProducto.set(v.productoId, {
        productoId: v.productoId,
        referencia: v.referencia,
        familia: v.familia,
        categoria: v.categoria,
        marca: v.marca,
        variantes: [v],
      });
    }
  });
  const productos = [...porProducto.values()].sort((a, b) => a.referencia.localeCompare(b.referencia));

  const sedeActual = sedesOperativas.find((s) => s.id === persona.sedeId) ?? {
    id: persona.sedeId,
    codigo: persona.sedeCodigo,
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[10px] text-tinta/45">Inventario</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Catálogo</h1>
      </div>

      <InventarioNav />

      <InventarioAgrupado
        productos={productos}
        sedeActual={sedeActual}
        todasLasSedes={sedesOperativas}
        almacenPropio={almacenPropio}
        contenedoresAlmacen={contenedoresAlmacen ?? []}
      />
    </div>
  );
}
