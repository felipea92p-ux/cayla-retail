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
    supabase.from("sedes").select("id, codigo").order("codigo"),
  ]);
  const sedesOperativas = (sedesResult.data ?? []).filter(
    (s): s is { id: string; codigo: string } => s.id != null && s.codigo != null
  );

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
        fotoUrl: v.fotoUrl,
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
      <div className="flex items-end justify-between">
        <div>
          <p className="label-cayla text-[10px] text-tinta/45">Inventario</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Catálogo</h1>
        </div>
        <a
          href="/api/export/inventario"
          className="label-cayla border border-tinta/25 px-4 py-2.5 text-[10px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
        >
          Exportar Excel
        </a>
      </div>

      <InventarioNav />

      <InventarioAgrupado productos={productos} sedeActual={sedeActual} todasLasSedes={sedesOperativas} />
    </div>
  );
}
