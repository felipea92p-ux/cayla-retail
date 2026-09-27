import { notFound } from "next/navigation";
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
import { HistorialProductoPanel } from "@/components/HistorialProductoPanel";
import { Volver } from "@/components/ui/Volver";

// Página completa del historial de un producto. Es lo que se ve al entrar
// por enlace directo o al recargar; viniendo desde la lista de Productos, el
// mismo panel se abre como modal encima de la lista
// (`../../@modal/(.)[id]/historial/page.tsx`) — mismo cuerpo, distinto marco,
// igual que el detalle de factura en Compras.
export default async function HistorialProductoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ParamsMovimientos>;
}) {
  const persona = await requirePersonaActualV2();
  const { id: productoId } = await params;
  const sp = await searchParams;
  const esLider = persona.rol === "lider";
  const ubicaciones = await getUbicaciones();

  const ubicacionActivaId =
    esLider && sp.ubicacion && ubicaciones.some((u) => u.id === sp.ubicacion) ? sp.ubicacion : persona.ubicacionId;
  const cursor = cursorDesdeParams(sp);

  const producto = await getProductoResumen(productoId);
  if (!producto) notFound();

  const [{ filas: movimientos, siguiente }, cambios] = await Promise.all([
    listarMovimientosProducto(productoId, ubicacionActivaId, { cursor }),
    // El costo, solo a quien ve el dinero de compras (20260923193700): el historial no es otra puerta para verlo.
    getCambiosProducto(productoId, { verCosto: puede(persona, "verDineroCompras") }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Volver href="/productos" a="Productos" className="mb-2" />
        <h1 className="font-display mt-1 text-2xl text-tinta">{producto.referencia}</h1>
        <p className="mt-1 text-sm text-tinta/65">{producto.categoria ?? "Sin categoría"}</p>
      </div>

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
      />
    </div>
  );
}
