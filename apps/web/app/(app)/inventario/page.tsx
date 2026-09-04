import Link from "next/link";
import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoInteligente, type VarianteInteligente } from "@/lib/inteligencia";
import { getSedes } from "@/lib/sedes";
import { createClient } from "@/lib/supabase/server";
import { InventarioNav } from "@/components/InventarioNav";
import { InventarioAgrupado, type ProductoAgrupado } from "@/components/InventarioAgrupado";

export default async function InventarioPage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  // getSedes() ya está cacheado por request (el layout lo pidió primero) — resolverlo
  // acá no cuesta un viaje de red nuevo, y permite calcular almacenPropio ANTES de
  // lanzar getCatalogoInteligente, para que la consulta a `contenedores` (que depende
  // de almacenPropio.id) vaya en paralelo con la rama más lenta en vez de esperarla.
  const todasSedes = await getSedes();
  const sedesOperativas = todasSedes.filter((s) => s.tipo !== "almacen");
  const almacenPropio = todasSedes.find((s) => s.tipo === "almacen" && s.codigo === `${persona.sedeCodigo}-ALM`) ?? null;

  const [{ variantes }, contenedoresRes] = await Promise.all([
    getCatalogoInteligente(persona),
    almacenPropio
      ? supabase.from("contenedores").select("id, codigo").eq("sede_id", almacenPropio.id).order("codigo")
      : Promise.resolve({ data: [] as { id: string; codigo: string }[] }),
  ]);
  const contenedoresAlmacen = contenedoresRes.data;

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
        <div className="flex gap-2">
          {persona.rol === "lider" && (
            <Link
              href="/inventario/producto/nuevo"
              className="label-cayla bg-tinta px-4 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo"
            >
              + Nuevo producto
            </Link>
          )}
          <a
            href="/api/export/inventario"
            className="label-cayla border border-tinta/25 px-4 py-2.5 text-[10px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
          >
            Exportar Excel
          </a>
        </div>
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
