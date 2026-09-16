import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTrasladoDetalle } from "@/lib/traslados";
import { getCatalogo } from "@/lib/catalogo-v2";
import { TrasladoDetallePanel } from "@/components/TrasladoDetallePanel";

export default async function TrasladoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const persona = await requirePersonaActualV2();
  const [traslado, catalogo] = await Promise.all([getTrasladoDetalle(id), getCatalogo()]);
  if (!traslado) notFound();

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">
          <Link href="/inventario/traslados" className="hover:text-rojo">
            Traslados
          </Link>{" "}
          · {persona.ubicacionEtiqueta}
        </p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          Traslado {traslado.numero}
          <span className="text-tinta/55"> · </span>
          {traslado.ubicacionOrigenNombre} <span className="text-tinta/55">→</span> {traslado.ubicacionDestinoNombre}
        </h1>
      </div>
      <TrasladoDetallePanel
        traslado={traslado}
        esDestino={persona.ubicacionId === traslado.ubicacionDestinoId}
        esLider={persona.rol === "lider"}
        catalogo={catalogo
          .filter((v) => v.activo)
          .map((v) => ({ varianteId: v.varianteId, sku: v.sku, referencia: v.referencia, talla: v.talla, color: v.color, codigosBarras: v.codigosBarras }))}
      />
    </div>
  );
}
