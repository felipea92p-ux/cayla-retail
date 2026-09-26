import Link from "next/link";
import { notFound } from "next/navigation";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTrasladoDetalle } from "@/lib/traslados";
import { getCatalogo } from "@/lib/catalogo-v2";
import { TrasladoDetallePanel } from "@/components/TrasladoDetallePanel";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
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
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo={`Inventario · Traslados · ${persona.ubicacionEtiqueta}`}
        titulo={
          <>
            Traslado {traslado.numero}
            {traslado.lineas.length > 0 && <TrasladoEstado situacion={situacion} cerradoConDiferencia={cerradoConDiferencia} />}
          </>
        }
        bajada={
          <>
            {traslado.ubicacionOrigenNombre} <span className="text-taupe">→</span> {traslado.ubicacionDestinoNombre}
            <span className="text-taupe"> · {esDestino ? "entra a tu sede" : persona.ubicacionId === traslado.ubicacionOrigenId ? "sale de tu sede" : "entre otras sedes"}</span>
          </>
        }
        acciones={
          <Link href="/inventario/traslados" className="btn-cayla btn-secundario">
            ← Traslados
          </Link>
        }
      />
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
