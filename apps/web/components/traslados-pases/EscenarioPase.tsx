import { notFound } from "next/navigation";
import { puede, requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getFirmaRecepcion, getTrasladoDetalle } from "@/lib/traslados";
import { firmaDelPaso } from "@/lib/firma-heredada";
import { getStockPorUbicacion } from "@/lib/inventario-v2";
import { aPrendasBajables } from "@/lib/bajada-reglas";
import { getCatalogo } from "@/lib/catalogo-v2";
import { encontrarPorTipo, getSububicaciones, type Sububicacion } from "@/lib/sububicaciones";
import { loSiguienteDeLaRecepcion, type DestinoRecepcion } from "@/lib/traslados-recepcion-reglas";
import { datosDeDetalle, getCodigosDeSede, vistaConCodigos } from "@/lib/traslados-billetera";
import { TrasladoDetallePanel } from "@/components/TrasladoDetallePanel";
import { TrasladoLoSiguiente } from "@/components/TrasladoLoSiguiente";
import { PaseTraslado } from "@/components/traslados-pases/PaseTraslado";

/** Los lugares de la sede destino. Solo sirven para preguntar «¿piso de venta o almacén?» y decir dónde quedó lo recibido: si la
 *  lectura falla, no se pregunta (la base deja lo recibido en su lugar de siempre) y el pase sigue en pie. */
async function sububicacionesDe(ubicacionId: string): Promise<Sububicacion[]> {
  try {
    return await getSububicaciones(ubicacionId);
  } catch (e) {
    console.error("Traslado: lugares de la sede destino:", e);
    return [];
  }
}

/** Las prendas que HOY siguen en el almacén de la sede y se pueden bajar. Si la lectura falla, `undefined`: «Lo siguiente» se
 *  ofrece como si todo siguiera ahí y la pantalla de bajar descarta lo que no se pueda. */
async function prendasEnElAlmacen(ubicacionId: string): Promise<ReadonlySet<string> | undefined> {
  try {
    const prendas = aPrendasBajables(await getStockPorUbicacion(ubicacionId));
    return new Set(prendas.filter((p) => p.almacenDisponible > 0).map((p) => p.varianteId));
  } catch (e) {
    console.error("Traslado: lo que sigue en el almacén:", e);
    return undefined;
  }
}

// El pase grande de un traslado (ADR-0354): lo mismo que leía la página de detalle de antes (el traslado, el catálogo para
// escanear, la firma de quien recibe, dónde se puede dejar lo recibido y «Lo siguiente»), dibujado como pase.
export async function EscenarioPase({ id, volverA }: { id: string; volverA?: { href: string; a: string } | null }) {
  const persona = await requirePersonaActualV2();
  const [traslado, catalogo, firmaVigente, codigo] = await Promise.all([
    getTrasladoDetalle(id),
    getCatalogo(),
    persona.terminal ? getFirmaRecepcion(id) : Promise.resolve(null),
    getCodigosDeSede(),
  ]);
  if (!traslado) notFound();
  const sububicaciones = await sububicacionesDe(traslado.ubicacionDestinoId);
  const ahoraIso = new Date().toISOString();
  const esDestino = persona.ubicacionId === traslado.ubicacionDestinoId;
  const esOrigen = persona.ubicacionId === traslado.ubicacionOrigenId;
  const puedeCerrarDiferencia = puede(persona, "ajustarInventario");
  const firmaRecepcion = firmaDelPaso({ terminal: persona.terminal, firma: firmaVigente });

  const vista = vistaConCodigos(datosDeDetalle(traslado), { miUbicacionId: persona.ubicacionId, puedeCerrarDiferencia, ahoraIso }, codigo);

  // D-131: se pregunta «¿piso de venta o almacén?» solo si la sede destino tiene piso de venta (el Taller no).
  const tienePiso = encontrarPorTipo(sububicaciones, "piso_venta") !== null;
  const opcionesDestino = tienePiso ? (["piso_venta", "almacen_tienda"] as const).filter((tipo) => encontrarPorTipo(sububicaciones, tipo) !== null) : [];
  const tipoRecibido = sububicaciones.find((s) => s.id === traslado.sububicacionDestinoId)?.tipo;
  const lugarRecibido: DestinoRecepcion = tipoRecibido === "piso_venta" || tipoRecibido === "almacen_tienda" ? tipoRecibido : null;
  const entradaDeLoSiguiente = {
    esDestino,
    lugarRecibido,
    lineas: traslado.lineas,
    trasladoId: traslado.id,
    ultimoIngresoIso: traslado.cerradoEn ?? traslado.confirmadoEn,
    ahoraIso,
    veExistencias: veModulo(persona, "existencias"),
    sede: traslado.ubicacionDestinoNombre,
  };
  let loSiguiente = loSiguienteDeLaRecepcion(entradaDeLoSiguiente);
  if (loSiguiente?.acciones.some((a) => a.clave === "bajar")) {
    loSiguiente = loSiguienteDeLaRecepcion({ ...entradaDeLoSiguiente, bajables: await prendasEnElAlmacen(persona.ubicacionId) });
  }

  return (
    <PaseTraslado
      key={traslado.id}
      vista={vista}
      volverA={volverA}
      abajo={
        <div className="space-y-5">
          {loSiguiente && <TrasladoLoSiguiente {...loSiguiente} />}
          <TrasladoDetallePanel
            traslado={traslado}
            esDestino={esDestino}
            esOrigen={esOrigen}
            esLider={persona.rol === "lider"}
            ahoraIso={ahoraIso}
            puedeCerrarDiferencia={puedeCerrarDiferencia}
            opcionesDestino={[...opcionesDestino]}
            lugarRecibido={lugarRecibido}
            firma={firmaRecepcion}
            catalogo={catalogo
              .filter((v) => v.activo)
              .map((v) => ({ varianteId: v.varianteId, sku: v.sku, referencia: v.referencia, talla: v.talla, color: v.color, codigosBarras: v.codigosBarras }))}
          />
        </div>
      }
    />
  );
}
