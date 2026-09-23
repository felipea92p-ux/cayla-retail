import Link from "next/link";
import { notFound } from "next/navigation";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTrasladoDetalle } from "@/lib/traslados";
import { getCatalogo } from "@/lib/catalogo-v2";
import { TrasladoDetallePanel } from "@/components/TrasladoDetallePanel";
import { TrasladoEstado } from "@/components/TrasladoEstado";
import { situacionTraslado } from "@/lib/traslados-reglas";

export default async function TrasladoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const persona = await requirePersonaActualV2();
  const [traslado, catalogo] = await Promise.all([getTrasladoDetalle(id), getCatalogo()]);
  if (!traslado) notFound();

  // Un solo «ahora» para el título y el panel (mismo criterio que la lista).
  const ahoraIso = new Date().toISOString();
  const esDestino = persona.ubicacionId === traslado.ubicacionDestinoId;
  const puedeCerrarDiferencia = puede(persona, "ajustarInventario");
  // La insignia del título dice lo mismo que la de la lista: se lee desde el destino o, si no, desde el origen.
  const situacion = situacionTraslado(traslado, {
    miUbicacionId: esDestino ? traslado.ubicacionDestinoId : traslado.ubicacionOrigenId,
    puedeCerrarDiferencia,
    ahoraIso,
  });
  const cerradoConDiferencia = traslado.lineas.some((l) => l.cantidadRecibida !== null && l.cantidadRecibida !== (l.cantidadEnviada ?? 0));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] text-taupe">
          <Link href="/inventario/traslados" className="btn-enlace text-[13px]">
            ← Traslados
          </Link>{" "}
          · {persona.ubicacionEtiqueta}
        </p>
        <h1 className="font-display mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[30px] leading-tight text-tinta">
          Traslado {traslado.numero}
          {traslado.lineas.length > 0 && <TrasladoEstado situacion={situacion} cerradoConDiferencia={cerradoConDiferencia} />}
        </h1>
        <p className="mt-1 text-[15px] text-tinta">
          {traslado.ubicacionOrigenNombre} <span className="text-taupe">→</span> {traslado.ubicacionDestinoNombre}
          <span className="text-sm text-taupe"> · {esDestino ? "entra a tu sede" : persona.ubicacionId === traslado.ubicacionOrigenId ? "sale de tu sede" : "entre otras sedes"}</span>
        </p>
      </div>
      <TrasladoDetallePanel
        traslado={traslado}
        esDestino={esDestino}
        ahoraIso={ahoraIso}
        puedeCerrarDiferencia={puedeCerrarDiferencia}
        catalogo={catalogo
          .filter((v) => v.activo)
          .map((v) => ({ varianteId: v.varianteId, sku: v.sku, referencia: v.referencia, talla: v.talla, color: v.color, codigosBarras: v.codigosBarras }))}
      />
    </div>
  );
}
