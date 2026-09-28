import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getProductoResumen, getCambiosProducto } from "@/lib/historial-producto";
import {
  listarMovimientosProducto,
  cursorDesdeParams,
  hoyEnLima,
  serializarCursorMovimientos,
  type ParamsMovimientos,
} from "@/lib/movimientos-v2";
import { desdeDeParams, vueltaAProductos } from "@/lib/vuelta-productos";
import { HistorialProductoPanel } from "@/components/HistorialProductoPanel";
import { ModalRuta } from "@/components/ui/ModalRuta";

// Historial de producto como modal, encima de la lista desde la que se abrió.
//
// Ruta interceptada de Next: al navegar a `/productos/<id>/historial` DESDE
// otra pantalla de Productos (clic en el menú "..." de una fila), Next no
// cambia la pantalla de fondo — dibuja esta página en el slot `modal` del
// layout y deja la lista donde estaba. La URL sí cambia, así que copiarla,
// compartirla o recargar muestra la página completa
// (`../../../[id]/historial/page.tsx`): el mismo panel, sin modal. Mismo
// criterio que `/compras/@modal/(.)factura/[compraId]`.
export default async function HistorialProductoModal({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ParamsMovimientos & { desde?: string | string[] }>;
}) {
  const persona = await requirePersonaActualV2();
  const { id: productoId } = await params;
  const sp = await searchParams;
  const esLider = persona.rol === "lider";
  const ubicaciones = await getUbicaciones();

  const ubicacionActivaId =
    esLider && sp.ubicacion && ubicaciones.some((u) => u.id === sp.ubicacion) ? sp.ubicacion : persona.ubicacionId;
  const cursor = cursorDesdeParams(sp);
  // Tabla o Grilla de Productos de donde se salió (`lib/vuelta-productos.ts`); sobrevive a paginar y a cambiar de sede.
  const desde = desdeDeParams(sp.desde);

  const producto = await getProductoResumen(productoId);
  if (!producto) {
    return (
      <ModalRuta titulo="Producto no encontrado" ancho="max-w-sm">
        <p className="text-sm text-tinta/75">No existe un producto con ese enlace, o ya no tienes acceso a él.</p>
      </ModalRuta>
    );
  }

  const [{ filas: movimientos, siguiente }, cambios] = await Promise.all([
    listarMovimientosProducto(productoId, ubicacionActivaId, { cursor }),
    // El costo, solo a quien ve el dinero de compras (20260923193700): el historial no es otra puerta para verlo.
    getCambiosProducto(productoId, { verCosto: puede(persona, "verDineroCompras") }),
  ]);

  return (
    <ModalRuta titulo={producto.referencia} subtitulo={producto.categoria ?? "Sin categoría"} ancho="max-w-4xl">
      <HistorialProductoPanel
        productoId={productoId}
        ubicaciones={ubicaciones}
        ubicacionActivaId={ubicacionActivaId}
        puedeCambiarUbicacion={esLider}
        movimientos={movimientos}
        cambios={cambios}
        hoyLima={hoyEnLima()}
        cursorSiguiente={siguiente ? serializarCursorMovimientos(siguiente) : null}
        hayCursor={!!cursor}
        pathname={`/productos/${productoId}/historial`}
        desde={desde}
      />
    </ModalRuta>
  );
}
