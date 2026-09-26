import { Volver } from "@/components/ui/Volver";
import { notFound } from "next/navigation";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTrasladoDetalle } from "@/lib/traslados";
import { getCatalogo } from "@/lib/catalogo-v2";
import { encontrarPorTipo, getSububicaciones, type Sububicacion } from "@/lib/sububicaciones";
import { TrasladoDetallePanel } from "@/components/TrasladoDetallePanel";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { TrasladoEstado } from "@/components/TrasladoEstado";
import { situacionTraslado } from "@/lib/traslados-reglas";
import type { DestinoRecepcion } from "@/lib/traslados-recepcion-reglas";
import { volverAMovimientos } from "@/lib/movimientos-reglas";

/** Los lugares de la sede destino. Solo sirven para preguntar «¿piso de venta o almacén?» y decir dónde quedó lo
 *  recibido: si la lectura falla, no se pregunta (la base deja lo recibido en su lugar de siempre) y la pantalla donde
 *  se confirma una recepción sigue en pie. */
async function sububicacionesDe(ubicacionId: string): Promise<Sububicacion[]> {
  try {
    return await getSububicaciones(ubicacionId);
  } catch (e) {
    console.error("Traslado: lugares de la sede destino:", e);
    return [];
  }
}

export default async function TrasladoDetallePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ volver?: string }> }) {
  const [{ id }, { volver }] = await Promise.all([params, searchParams]);
  // Abierto desde Movimientos (ADR-0234): «←» vuelve a esa lista, con sus filtros, en vez de a Traslados.
  const volverA = volverAMovimientos(volver);
  const persona = await requirePersonaActualV2();
  const [traslado, catalogo] = await Promise.all([getTrasladoDetalle(id), getCatalogo()]);
  if (!traslado) notFound();
  const sububicaciones = await sububicacionesDe(traslado.ubicacionDestinoId);

  // Un solo «ahora» para el título y el panel (mismo criterio que la lista).
  const ahoraIso = new Date().toISOString();
  const esDestino = persona.ubicacionId === traslado.ubicacionDestinoId;
  const esOrigen = persona.ubicacionId === traslado.ubicacionOrigenId;
  const puedeCerrarDiferencia = puede(persona, "ajustarInventario");
  const cerradoConDiferencia = traslado.lineas.some((l) => l.cantidadRecibida !== null && l.cantidadRecibida !== (l.cantidadEnviada ?? 0));
  // La insignia del título dice lo mismo que la de la lista: se lee desde el destino o, si no, desde el origen.
  const situacion = situacionTraslado(
    { ...traslado, cerradoConDiferencia },
    { miUbicacionId: esDestino ? traslado.ubicacionDestinoId : traslado.ubicacionOrigenId, puedeCerrarDiferencia, ahoraIso },
  );

  // D-131: se pregunta «¿piso de venta o almacén?» solo si la sede destino tiene piso de venta (el Taller no).
  const tienePiso = encontrarPorTipo(sububicaciones, "piso_venta") !== null;
  const opcionesDestino = tienePiso
    ? (["piso_venta", "almacen_tienda"] as const).filter((tipo) => encontrarPorTipo(sububicaciones, tipo) !== null)
    : [];
  const tipoRecibido = sububicaciones.find((s) => s.id === traslado.sububicacionDestinoId)?.tipo;
  const lugarRecibido: DestinoRecepcion = tipoRecibido === "piso_venta" || tipoRecibido === "almacen_tienda" ? tipoRecibido : null;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo={
          <>
            Traslado {traslado.numero}
            {/* Suelta, la insignia se apoya en la línea base y en la serif de 46 px cuelga por debajo del título;
                `inline-flex` mide solo la insignia y `align-middle` la centra en las minúsculas. */}
            {traslado.lineas.length > 0 && (
              <span className="ml-3 inline-flex align-middle">
                <TrasladoEstado situacion={situacion} cerradoConDiferencia={traslado.estado === "cerrada" && cerradoConDiferencia} />
              </span>
            )}
          </>
        }
        subtitulo={
          <>
            {traslado.ubicacionOrigenNombre} <span className="text-taupe">→</span> {traslado.ubicacionDestinoNombre}
            <span className="text-taupe"> · {esDestino ? "entra a tu sede" : esOrigen ? "sale de tu sede" : "entre otras sedes"}</span>
          </>
        }
        pie={
          // La vuelta común (`Volver`): a Movimientos si se llegó desde ahí, con sus filtros; si no, a Traslados.
          volverA ? <Volver forma="boton" href={volverA} a="Movimientos" /> : <Volver forma="boton" href="/inventario/traslados" a="Traslados" />
        }
      />
      <TrasladoDetallePanel
        traslado={traslado}
        esDestino={esDestino}
        esOrigen={esOrigen}
        esLider={persona.rol === "lider"}
        ahoraIso={ahoraIso}
        puedeCerrarDiferencia={puedeCerrarDiferencia}
        opcionesDestino={[...opcionesDestino]}
        lugarRecibido={lugarRecibido}
        catalogo={catalogo
          .filter((v) => v.activo)
          .map((v) => ({ varianteId: v.varianteId, sku: v.sku, referencia: v.referencia, talla: v.talla, color: v.color, codigosBarras: v.codigosBarras }))}
      />
    </div>
  );
}
