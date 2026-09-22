import Link from "next/link";
import { notFound } from "next/navigation";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTrasladoDetalle } from "@/lib/traslados";
import { getCatalogo } from "@/lib/catalogo-v2";
import { TrasladoDetallePanel } from "@/components/TrasladoDetallePanel";
import { InventarioHero, fotoHeroPorPantalla } from "@/components/InventarioHero";

export default async function TrasladoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const persona = await requirePersonaActualV2();
  const [traslado, catalogo] = await Promise.all([getTrasladoDetalle(id), getCatalogo()]);
  if (!traslado) notFound();

  return (
    <div className="space-y-6">
      <InventarioHero
        eyebrow={
          <>
            <Link href="/inventario/traslados" className="hover:text-rojo">
              Traslados
            </Link>{" "}
            · {persona.ubicacionEtiqueta}
          </>
        }
        titulo={
          <>
            Traslado {traslado.numero}
            <span className="text-tinta/55"> · </span>
            {traslado.ubicacionOrigenNombre} <span className="text-tinta/55">→</span> {traslado.ubicacionDestinoNombre}
          </>
        }
        foto={fotoHeroPorPantalla("traslados")}
        variante="integrado"
      />
      <TrasladoDetallePanel
        traslado={traslado}
        esDestino={persona.ubicacionId === traslado.ubicacionDestinoId}
        ahoraIso={new Date().toISOString()}
        puedeCerrarDiferencia={puede(persona, "ajustarInventario")}
        catalogo={catalogo
          .filter((v) => v.activo)
          .map((v) => ({ varianteId: v.varianteId, sku: v.sku, referencia: v.referencia, talla: v.talla, color: v.color, codigosBarras: v.codigosBarras }))}
      />
    </div>
  );
}
