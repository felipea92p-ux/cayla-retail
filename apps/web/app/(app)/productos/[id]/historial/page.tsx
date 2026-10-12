import { notFound } from "next/navigation";
import { requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getHistorialPrenda, getPrendaDelHistorial } from "@/lib/historial-prenda";
import { desdeDeParams, vueltaAProductos } from "@/lib/vuelta-productos";
import { HistorialPrenda } from "@/components/historial-prenda/HistorialPrenda";
import { Volver } from "@/components/ui/Volver";

// Página completa del historial de una prenda (ADR-0354). Es lo que se ve al entrar por enlace directo o al recargar; viniendo
// desde la Tabla de Productos, el mismo hilo se abre como ventana encima de la lista (`../../@modal/(.)[id]/historial/page.tsx`),
// y desde la Grilla, dentro de la vista rápida. Solo cambios de la prenda y quién los hizo: las ventas y el stock (lo que esta
// página mostraba antes, con su selector de sede) viven en Movimientos.
export default async function HistorialProductoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ desde?: string | string[] }>;
}) {
  const persona = await requirePersonaActualV2();
  const { id: productoId } = await params;
  // Tabla o Grilla de Productos de donde se salió (`lib/vuelta-productos.ts`).
  const desde = desdeDeParams((await searchParams).desde);

  const [prenda, lectura] = await Promise.all([getPrendaDelHistorial(productoId), getHistorialPrenda(productoId)]);
  if (!prenda) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Volver href={vueltaAProductos(desde)} a="Productos" className="mb-2" />
        <h1 className="font-display mt-1 text-[34px] leading-tight text-tinta">Historial</h1>
        <p className="mt-1 text-sm text-taupe">
          «{prenda.referencia}»{prenda.categoria ? ` · ${prenda.categoria}` : ""} · lo que cambió en esta prenda, quién lo hizo y cuándo
        </p>
      </div>
      <HistorialPrenda
        lectura={lectura}
        nombre={prenda.referencia}
        totalVariantes={prenda.variantes}
        hrefMovimientos={veModulo(persona, "movimientos") ? `/inventario/movimientos?q=${encodeURIComponent(prenda.codigo ?? prenda.referencia)}` : null}
      />
    </div>
  );
}
