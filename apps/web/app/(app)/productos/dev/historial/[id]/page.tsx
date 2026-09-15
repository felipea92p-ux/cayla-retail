import { notFound } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getProductoResumen, getCambiosProducto } from "@/lib/historial-producto";
import { listarMovimientosProducto, cursorDesdeParams, hoyEnLima, serializarCursorMovimientos, type ParamsMovimientos } from "@/lib/movimientos-v2";
import { HistorialProductoPanel } from "@/components/HistorialProductoPanel";

// TODO(B2): borrar cuando se integre en la ficha/lista real
//
// Demo de Historial de Producto (Sesión A3, 2026-09-15): ruta temporal para
// verificar en el navegador que fn_movimientos con p_producto_id y
// fn_historial_producto_cambios devuelven lo mismo que ya muestra
// /movimientos para las mismas filas (mismo signo, misma categoría). No es
// la ficha final, solo el punto donde probar el panel antes de que B2 lo
// monte donde corresponda.
//
// OJO: la carpeta es `dev/`, NO `_dev/`. En el App Router, un segmento con
// guion bajo (`_dev`) es una "private folder" — Next la excluye del ruteo
// por completo (404 directo, sin ni compilar la página). Verificado en el
// navegador el 2026-09-15: con `_dev/` esta ruta nunca aparece en el log del
// servidor; renombrada a `dev/`, sí. Si la consigna de otra sesión pide
// `_dev/` para su propia ruta de demo, tiene el mismo problema.
export default async function HistorialProductoDevPage({
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

  // Mismo criterio que /movimientos: una Líder mira cualquier sede desde el
  // selector (`?ubicacion=`); una integrante, la suya y nada más. La base lo
  // vuelve a comprobar (`fn_puede_operar_ubicacion`) — esto solo decide qué se pinta.
  const ubicacionActivaId = esLider && sp.ubicacion && ubicaciones.some((u) => u.id === sp.ubicacion) ? sp.ubicacion : persona.ubicacionId;
  const cursor = cursorDesdeParams(sp);

  const producto = await getProductoResumen(productoId);
  if (!producto) notFound();

  const [{ filas: movimientos, siguiente }, cambios] = await Promise.all([
    listarMovimientosProducto(productoId, ubicacionActivaId, { cursor }),
    getCambiosProducto(productoId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Historial de producto · demo</p>
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
        pathname={`/productos/dev/historial/${productoId}`}
      />
    </div>
  );
}
