import { ReceiptText, Wallet } from "lucide-react";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getColaboradores, getColaboradoresInactivos, getColaboradoresSuspendidos } from "@/lib/colaboradores";
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
import { ResumenSede } from "@/components/ui/ResumenSede";
import { EstadoVacio } from "@/components/ComprasAgrupadas";
import { FiltrosHistorialVentas } from "@/components/FiltrosHistorialVentas";
import { HistorialVentasLista } from "@/components/HistorialVentasLista";
import { HistorialVentasPulso } from "@/components/HistorialVentasPulso";
import { PaginacionCursor } from "@/components/Paginacion";

// Historial de ventas (2026-09-21, ADR-0147): el libro de TODAS las ventas registradas, de cualquier
// fecha y de todas las tiendas — la pantalla que `ventas-v2.ts` y el ADR-0052 dejaron diferida.
// Vive en Ventas porque su unidad es la venta: Caja mira el turno, Facturación el comprobante,
// Movimientos el stock, Cambios y Devoluciones eligen una prenda para actuar sobre ella.
//
// Esta página solo traduce la URL a filtros y elige el layout; no calcula nada sobre las filas. Quién
// ve qué lo decide la RLS de `ventas` (`fn_puede_operar_ubicacion`): el líder mira cualquier tienda
// desde el filtro (`?sede=`), cada colaboradora la suya. Es solo lectura — como `ventas` no tiene
// política de UPDATE ni de DELETE, una venta se corrige con el proceso (anularla, un cambio, una
// devolución), nunca tocando la fila.
//
// Aspecto (2026-09-21): la misma línea que Cambios, Devoluciones y Caja (Atelier) — cabecera con las cifras de
// la tienda arriba a la derecha, hilo taupe con un nudo por día — y los filtros como los de Catálogo. Las ventas
// mandan: van en la columna principal, y el pulso del período (lo vendido día por día, dibujado como hilos) las
// acompaña en un lateral, chico y pegajoso.
export default async function HistorialVentasPage({ searchParams }: { searchParams: Promise<ParamsHistorial> }) {
  const persona = await requirePersonaActualV2();
  const params = await searchParams;
  const esLider = persona.rol === "lider";

  const [ubicaciones, colaboradores, suspendidos, inactivos] = await Promise.all([
    getUbicaciones(),
    // Si la lista de colaboradores falla, solo desaparece el filtro por vendedor: el historial sigue.
    esLider ? getColaboradores().catch(() => []) : Promise.resolve([]),
    // Quien está suspendido o ya no está activo en Dynamic igual vendió: sus ventas tienen que poder filtrarse por su nombre.
    esLider ? getColaboradoresSuspendidos().catch(() => []) : Promise.resolve([]),
    esLider ? getColaboradoresInactivos().catch(() => []) : Promise.resolve([]),
  ]);
  // Solo las tiendas venden: ni el Taller ni un almacén tienen mostrador.
  const tiendas = ubicaciones.filter((u) => u.tipo === "tienda");
  const filtros = filtrosDesdeParams(params, { esLider, sedesIds: tiendas.map((t) => t.id) });
  const cursor = leerCursorVentas(params.cursor);

  const [{ filas, siguiente }, totales] = await Promise.all([listarVentasHistorial(filtros, { cursor }), totalesVentasHistorial(filtros)]);

  const alcance = esLider ? (tiendas.find((t) => t.id === filtros.sedeId)?.nombre ?? "Todas las tiendas") : persona.ubicacionEtiqueta;
  const periodoEnPalabras = textoPeriodo(filtros.periodo, filtros.desde, filtros.hasta);
  const vendedores = [...colaboradores, ...suspendidos, ...inactivos].map((c) => ({ id: c.persona_id, nombre: c.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const totalesPorDia = Object.fromEntries(totales.porDia.map((d) => [d.fecha, { ventas: d.ventas, total: d.total }]));
  const { resumen } = totales;

  return (
    <div className="space-y-7">
      <EncabezadoPagina
        sede={alcance}
        titulo="Historial"
        subtitulo="Todas las ventas registradas, de cualquier fecha."
      >
        {/* Las cifras del rango, como las de la tienda en Cambios y Devoluciones (el ticket promedio va con el
            trazo, que es donde se interpreta). Pasado el tope de 1000 ventas serían parciales: el trazo de abajo
            lo dice y acá no se muestran. */}
        {!totales.parcial && (
          <ResumenSede
            sede={alcance}
            cifras={[
              { valor: resumen.total, formato: "soles", etiqueta: "vendido", icono: Wallet },
              { valor: resumen.ventas, etiqueta: resumen.ventas === 1 ? "venta" : "ventas", icono: ReceiptText },
            ]}
          />
        )}
      </EncabezadoPagina>

      {/* Las ventas son lo primero: ocupan la columna principal y el pulso las acompaña en un lateral pegajoso (desde 1280 px).
          Más angosto, el pulso pasa DEBAJO de la lista, no encima: nada se interpone entre la persona y las ventas. */}
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
        <div className="min-w-0 space-y-7">
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
            incluirPrueba={filtros.incluirPrueba}
          />

          {filas.length === 0 && !cursor ? (
            <EstadoVacio
              titulo="Ninguna venta coincide"
              detalle={`No hay ventas con estos filtros (${periodoEnPalabras.toLowerCase()}). Prueba con otro período o quita algún filtro.`}
            />
          ) : (
            <HistorialVentasLista filas={filas} hoyLima={hoyEnLima()} totalesPorDia={totalesPorDia} />
          )}

          <PaginacionCursor
            mostradas={filas.length}
            cursorSiguiente={siguiente ? serializarCursorVentas(siguiente) : null}
            hayCursor={!!cursor}
            params={params}
            pathname="/vender/historial"
            sustantivo={["venta", "ventas"]}
          />

          <p className="max-w-2xl text-xs leading-relaxed text-tinta/60">
            <span className="text-tinta">Registro transparente:</span> una venta no se edita ni se borra. Si se anula, sigue en el historial —tachada— y deja de
            sumar a lo vendido; si la clienta cambia o devuelve una prenda, queda anotado en Cambios o Devoluciones.
          </p>
        </div>

        <aside aria-label="Pulso del período" className="xl:sticky xl:top-24">
          <HistorialVentasPulso totales={totales} periodo={periodoEnPalabras} />
        </aside>
      </div>
    </div>
  );
}
