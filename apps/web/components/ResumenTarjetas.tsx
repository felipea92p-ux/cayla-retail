import { ChartColumn, Receipt, Send, ShoppingBag } from "lucide-react";
import { soles } from "@/lib/compras-reglas";
import type { EstadoComprobante, VentaDelDia } from "@/lib/comprobantes-reglas";
import type { ResumenPorEnviar } from "@/lib/facturacion-reglas";
import {
  antiguedad,
  comparativoEnCantidad,
  comparativoEnPorcentaje,
  horaDeLima,
  horaDeReloj,
  progresoDeEnvio,
  tonoPorEnviar,
  tonoVendidoHoy,
  ventasUnicas,
  type TonoKpi,
} from "@/lib/facturacion-resumen-reglas";
import { MAX_BARRAS, type VentaEnHora } from "@/lib/facturacion-resumen-graficos";
import type { VentasDeReferencia } from "@/lib/ventas-comparativo";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { TarjetaKpiVidrio } from "@/components/ui/TarjetaKpiVidrio";
import { BarraDeEnvio, BarrasDeTicket, EjeDeVentas, SparklineAcumulado } from "@/components/ResumenVisualizaciones";

// Las cuatro tarjetas de arriba del Resumen (spec §7 y §9). En fila de cuatro desde 1280 px de
// ventana (`xl:`): el spec decía 980 px, pero con el menú lateral desplegado (17 rem) a esa
// ventana el contenido mide ~670 px y cada tarjeta quedaba en ~150 px; por debajo, de dos en dos.
// Es de servidor: decide el tono, el
// texto de contexto y la visualización de cada una a partir de lo que llega; el dibujo y la luz
// viven en `TarjetaKpiVidrio` y `ResumenVisualizaciones`. Cada dato es independiente: si falla la
// referencia de la semana pasada, o la cola de SUNAT, esa tarjeta lo dice y las demás siguen.

const REFERENCIA = "vs. mismo día de la semana pasada a esta hora";
const SIN_REFERENCIA = "No se pudo leer la semana pasada.";

/** «+12%» en verde si va bien y en rojo si va mal; nunca solo el color: lleva el signo. */
function Delta({ texto, positivo }: { texto: string; positivo: boolean }) {
  return <span className={`font-semibold ${positivo ? "text-verde" : "text-rojo-profundo"}`}>{texto}</span>;
}

export function ResumenTarjetas({
  ventas,
  porEnviar,
  comprobantesDeHoy,
  referencia,
  ahora,
}: {
  /** Las ventas de hoy tal como las devuelve `fn_ventas_del_dia` (la definición de ADR-0110). */
  ventas: VentaDelDia[];
  /** La cola de SUNAT sin filtro de mes; `null` si la lectura falló. */
  porEnviar: ResumenPorEnviar | null;
  /** Los comprobantes de hoy, para la barra «hoy: N de M enviados». */
  comprobantesDeHoy: { estado: EstadoComprobante }[];
  /** Lo vendido el mismo día de la semana pasada hasta esta hora; `null` si la lectura falló. */
  referencia: VentasDeReferencia | null;
  ahora: Date;
}) {
  // Una fila por venta: `fn_ventas_del_dia` repite la venta que tiene dos comprobantes (un anulado y su reemplazo).
  const unicas = ventasUnicas(ventas);
  const cantidad = unicas.length;
  const total = Math.round(unicas.reduce((suma, v) => suma + Number(v.total), 0) * 100) / 100;
  // La RPC las devuelve de la más nueva a la más vieja; los gráficos leen de izquierda a derecha.
  const cronologicas = [...unicas].reverse();
  const enHora: VentaEnHora[] = cronologicas.map((v) => ({ hora: horaDeReloj(v.hora), monto: Number(v.total) }));
  const horaAhora = horaDeLima(ahora.toISOString());

  const tonoVendido: TonoKpi = tonoVendidoHoy(total, referencia ? referencia.total : null);
  const enPorcentaje = referencia ? comparativoEnPorcentaje(total, referencia.total) : null;
  const enCantidad = referencia ? comparativoEnCantidad(cantidad, referencia.ventas.length) : null;

  const tonoEnvio: TonoKpi = porEnviar ? tonoPorEnviar(porEnviar) : "taupe";
  const { enviados, total: deHoy } = progresoDeEnvio(comprobantesDeHoy);

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <TarjetaKpiVidrio
        etiqueta="Vendido hoy"
        tono={tonoVendido}
        icono={<ChartColumn size={15} strokeWidth={1.75} />}
        indice={0}
        valor={<CifraAnimada valor={total} formato="soles" />}
        contexto={
          !referencia ? (
            SIN_REFERENCIA
          ) : enPorcentaje ? (
            <>
              <Delta {...enPorcentaje} /> {REFERENCIA} ({soles(referencia.total)})
            </>
          ) : (
            "Sin ventas a esta hora la semana pasada."
          )
        }
      >
        <SparklineAcumulado hoy={enHora} semanaPasada={referencia ? referencia.ventas : null} horaAhora={horaAhora} />
      </TarjetaKpiVidrio>

      <TarjetaKpiVidrio
        etiqueta="Ventas"
        tono="taupe"
        icono={<ShoppingBag size={15} strokeWidth={1.75} />}
        indice={1}
        valor={<CifraAnimada valor={cantidad} />}
        contexto={
          !referencia || !enCantidad ? (
            cantidad === 0 ? "Todavía no hay ventas hoy." : SIN_REFERENCIA
          ) : (
            <>
              <Delta {...enCantidad} /> {REFERENCIA} ({referencia.ventas.length} {referencia.ventas.length === 1 ? "venta" : "ventas"})
            </>
          )
        }
      >
        <EjeDeVentas horas={enHora.map((v) => v.hora)} />
      </TarjetaKpiVidrio>

      <TarjetaKpiVidrio
        etiqueta="Por enviar a SUNAT"
        tono={tonoEnvio}
        icono={<Send size={15} strokeWidth={1.75} />}
        indice={2}
        colorearCifra
        // Sin `CifraAnimada`: sube desde 0 cada vez que cambia el valor, y esta cifra es una cola que
        // sube y baja. Con `key` la cifra «se asienta» (`anim-asentar`) solo cuando cambia.
        valor={
          porEnviar ? (
            <span key={porEnviar.porEnviar} className="anim-asentar inline-block">
              {porEnviar.porEnviar}
            </span>
          ) : (
            "—"
          )
        }
        contexto={
          !porEnviar ? (
            "No se pudo leer la cola de SUNAT."
          ) : porEnviar.porEnviar === 0 ? (
            "Todo al día."
          ) : (
            <>
              {porEnviar.rechazados > 0 && (
                <>
                  <span className="font-semibold text-rojo-profundo">
                    {porEnviar.rechazados} rechazado{porEnviar.rechazados === 1 ? "" : "s"}
                  </span>
                  {" · "}
                </>
              )}
              {porEnviar.masAntiguoAt && <>la más antigua: {antiguedad(porEnviar.masAntiguoAt, ahora)}</>}
            </>
          )
        }
      >
        <BarraDeEnvio enviados={enviados} total={deHoy} />
      </TarjetaKpiVidrio>

      <TarjetaKpiVidrio
        etiqueta="Ticket promedio"
        tono="taupe"
        icono={<Receipt size={15} strokeWidth={1.75} />}
        indice={3}
        valor={cantidad > 0 ? <CifraAnimada valor={total / cantidad} formato="soles" /> : "—"}
        contexto={
          cantidad === 0
            ? "Sin ventas todavía."
            : `Total ÷ ${cantidad} venta${cantidad === 1 ? "" : "s"}. ${
                cantidad > MAX_BARRAS ? `Barras: las últimas ${MAX_BARRAS}. ` : ""
              }La línea punteada es el promedio${cantidad > MAX_BARRAS ? " de todas" : ""}.`
        }
      >
        <BarrasDeTicket totales={cronologicas.map((v) => Number(v.total))} />
      </TarjetaKpiVidrio>
    </div>
  );
}
