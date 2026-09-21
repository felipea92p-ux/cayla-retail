import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getColaboradores } from "@/lib/colaboradores";
import { hoyEnLima, textoPeriodo } from "@/lib/movimientos-reglas";
import {
  filtrosDesdeParams,
  leerCursorVentas,
  listarVentasHistorial,
  serializarCursorVentas,
  totalesVentasHistorial,
  type ParamsHistorial,
} from "@/lib/ventas-historial";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { FiltrosHistorialVentas } from "@/components/FiltrosHistorialVentas";
import { HistorialVentasLista } from "@/components/HistorialVentasLista";
import { HistorialVentasTotales } from "@/components/HistorialVentasTotales";
import { PaginacionCursor } from "@/components/Paginacion";

// Historial de ventas (2026-09-21, ADR-0144): el libro de TODAS las ventas registradas, de cualquier
// fecha y de todas las tiendas — la pantalla que `ventas-v2.ts` y el ADR-0052 dejaron diferida.
// Vive en Ventas porque su unidad es la venta: Caja mira el turno, Facturación el comprobante,
// Movimientos el stock, Cambios y Devoluciones eligen una prenda para actuar sobre ella.
//
// Esta página solo traduce la URL a filtros y elige el layout; no calcula nada sobre las filas. Quién
// ve qué lo decide la RLS de `ventas` (`fn_puede_operar_ubicacion`): el líder mira cualquier tienda
// desde el selector (`?sede=`), cada colaboradora la suya. Es solo lectura — como `ventas` no tiene
// política de UPDATE ni de DELETE, una venta se corrige con el proceso (anularla, un cambio, una
// devolución), nunca tocando la fila.
export default async function HistorialVentasPage({ searchParams }: { searchParams: Promise<ParamsHistorial> }) {
  const persona = await requirePersonaActualV2();
  const params = await searchParams;
  const esLider = persona.rol === "lider";

  const [ubicaciones, colaboradores] = await Promise.all([
    getUbicaciones(),
    // Si la lista de colaboradores falla, solo desaparece el filtro por vendedor: el historial sigue.
    esLider ? getColaboradores().catch(() => []) : Promise.resolve([]),
  ]);
  // Solo las tiendas venden: ni el Taller ni un almacén tienen mostrador.
  const tiendas = ubicaciones.filter((u) => u.tipo === "tienda");
  const filtros = filtrosDesdeParams(params, { esLider, sedesIds: tiendas.map((t) => t.id) });
  const cursor = leerCursorVentas(params.cursor);

  const [{ filas, siguiente }, totales] = await Promise.all([listarVentasHistorial(filtros, { cursor }), totalesVentasHistorial(filtros)]);

  const alcance = esLider ? (tiendas.find((t) => t.id === filtros.sedeId)?.nombre ?? "Todas las tiendas") : persona.ubicacionEtiqueta;
  const periodoEnPalabras = textoPeriodo(filtros.periodo, filtros.desde, filtros.hasta);
  const vendedores = colaboradores.map((c) => ({ id: c.persona_id, nombre: c.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={alcance}
        titulo="Historial"
        subtitulo="Todas las ventas registradas: búscalas por fecha, tienda, pago o comprobante."
      />

      <HistorialVentasTotales totales={totales} periodo={periodoEnPalabras} />

      <FiltrosHistorialVentas
        tiendas={esLider ? tiendas.map((t) => ({ id: t.id, nombre: t.nombre })) : undefined}
        vendedores={esLider ? vendedores : undefined}
        periodo={filtros.periodo}
        desde={filtros.desde ?? ""}
        hasta={filtros.hasta ?? ""}
        estado={filtros.estado}
        comprobante={filtros.comprobante}
        pago={filtros.pago ?? ""}
        sede={filtros.sedeId ?? ""}
        vendedor={filtros.vendedorId ?? ""}
      />

      {filas.length === 0 && !cursor ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Ninguna venta coincide con estos filtros ({periodoEnPalabras.toLowerCase()}).</p>
      ) : (
        <HistorialVentasLista filas={filas} hoyLima={hoyEnLima()} />
      )}

      <PaginacionCursor
        mostradas={filas.length}
        cursorSiguiente={siguiente ? serializarCursorVentas(siguiente) : null}
        hayCursor={!!cursor}
        params={params}
        pathname="/vender/historial"
        sustantivo={["venta", "ventas"]}
      />

      <p className="card-cayla px-5 py-3 text-xs text-tinta/65">
        <span className="text-tinta">Registro transparente:</span> una venta no se edita ni se borra. Si se anula, sigue en el historial —tachada— y deja de
        sumar a lo vendido; si la clienta cambia o devuelve una prenda, queda anotado en Cambios o Devoluciones.
      </p>
    </div>
  );
}
