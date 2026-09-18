"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingBag, TrendingDown, TrendingUp } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { MovimientoCajaModal } from "@/components/MovimientoCajaModal";
import { CerrarCajaModalV2 } from "@/components/CerrarCajaModalV2";
import { TarjetaIndicador, normalizarSparkline } from "@/components/TarjetaIndicador";
import { DonaMetodosPago, TendenciaCierres, VentasPorHoraChart } from "@/components/CajaGraficos";
import type { CajaAbierta, ResumenCaja } from "@/lib/caja";
import type { EventoCaja } from "@/app/actions/caja";
import { claveLocal, leer } from "@/lib/almacen-local";
import type { VentaEncolada } from "@/lib/ventas-offline";
import { egresosElevados, iniciales, senalCaja, type Comparativo, type PuntoTendenciaCierres } from "@/lib/caja-panel-reglas";

function money(n: number) {
  return "S/" + n.toFixed(2);
}

type Props = {
  caja: CajaAbierta;
  ubicacionEtiqueta: string;
  resumen: ResumenCaja;
  eventosHoy: EventoCaja[];
  metaVentaDiaria: number | null;
  comparativoMeta: Comparativo | null;
  ventasPorHora: { hora: number; monto: number }[];
  horaActual: number;
  tendenciaCierres: PuntoTendenciaCierres[];
};

export function CajaAbiertaPanel({
  caja,
  ubicacionEtiqueta,
  resumen,
  eventosHoy,
  metaVentaDiaria,
  comparativoMeta,
  ventasPorHora,
  horaActual,
  tendenciaCierres,
}: Props) {
  const [modal, setModal] = useState<"movimiento" | "cerrar" | null>(null);
  const [alertaVisible, setAlertaVisible] = useState(true);
  // Cola de ventas offline de ESTA sede (ADR-0092): esta pantalla (/caja) es una
  // segunda puerta a "Cerrar caja" además de Vender, y comparte el mismo riesgo —
  // efectivo cobrado sin red que el "esperado" del servidor todavía no ve. NO corre
  // el trío de sincronización (mount/online/latido): por ADR-0043 ese estado vive
  // solo en `PuntoDeVenta.tsx`. Acá basta una lectura de una sola vez.
  const [cola, setCola] = useState<VentaEncolada[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCola(leer<VentaEncolada[]>(claveLocal(caja.ubicacionId, "cola"), []));
  }, [caja.ubicacionId]);

  const ventasHoy = resumen.ventasEfectivo + resumen.ventasOtros;
  const senal = senalCaja(cola.length);
  const alerta = egresosElevados(resumen.egresos, ventasHoy);
  const pctMeta = metaVentaDiaria ? Math.min(100, Math.round((ventasHoy / metaVentaDiaria) * 100)) : 0;

  const eventosFeed = eventosHoy.filter(esEventoDeFeed).slice(0, 8);

  return (
    <div className="space-y-4">
      {alerta.alerta && alertaVisible && (
        <div className="anim-revelar flex items-start gap-3 rounded-xl border border-ambar/35 bg-ambar/12 px-4 py-3 text-[13px] text-tinta">
          <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-ambar-profundo" aria-hidden />
          <p className="flex-1">
            <b className="text-ambar-profundo">Egresos elevados:</b> hoy van {money(resumen.egresos)}, el {alerta.pct}% de lo vendido hoy.
          </p>
          <button
            type="button"
            onClick={() => setAlertaVisible(false)}
            aria-label="Descartar aviso"
            className="shrink-0 text-tinta/50 hover:text-tinta"
          >
            ✕
          </button>
        </div>
      )}

      {/* Encabezado: quién abrió, desde cuándo, y la señal de la cola offline en vez
          de un "cuadre" en vivo (ADR-0042 — ver caja-panel-reglas.ts:senalCaja). */}
      <div className="card-cayla flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rojo to-rojo-profundo text-sm font-bold text-crema">
            {iniciales(caja.abiertaPorNombre ?? "—")}
          </div>
          <div>
            <p className="label-cayla text-[11px] text-tinta/60">Caja · {ubicacionEtiqueta}</p>
            <h1 className="font-display mt-0.5 text-2xl text-tinta">Caja abierta</h1>
            <p className="mt-0.5 text-[13px] text-tinta/70">
              {caja.abiertaPorNombre ?? "—"} · Abierta desde las{" "}
              {new Date(caja.abiertaEn).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })} · <RelojEnVivo />
            </p>
          </div>
        </div>
        <Chip tono={senal.tono === "verde" ? "verde" : "ambar"}>{senal.texto}</Chip>
      </div>

      {metaVentaDiaria === null ? (
        <p className="px-1 text-xs text-tinta/50">Meta del día: sin configurar para esta sede.</p>
      ) : (
        <div className="card-cayla p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="label-cayla text-[11px] text-tinta/60">Meta del día</span>
            <span className="text-sm font-semibold text-tinta">
              {money(ventasHoy)} <span className="font-normal text-tinta/55">de {money(metaVentaDiaria)}</span>
              {comparativoMeta && (
                <span className={`ml-2 text-xs font-bold ${comparativoMeta.positivo ? "text-verde" : "text-tinta/60"}`}>
                  {comparativoMeta.texto}
                </span>
              )}
            </span>
          </div>
          <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-sand">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rojo to-verde transition-[width] duration-700"
              style={{ width: `${pctMeta}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <TarjetaIndicador etiqueta="Apertura" valor={money(caja.montoApertura)} />
        <TarjetaIndicador
          etiqueta="Ventas efectivo"
          valor={money(resumen.ventasEfectivo)}
          sparkline={normalizarSparkline(cumulativo(ventasPorHora, "efectivo", resumen))}
        />
        <TarjetaIndicador
          etiqueta="Ventas otro método"
          valor={money(resumen.ventasOtros)}
          sparkline={normalizarSparkline(cumulativo(ventasPorHora, "otros", resumen))}
        />
        <TarjetaIndicador etiqueta="Ingresos" valor={money(resumen.ingresos)} />
        <TarjetaIndicador etiqueta="Egresos" valor={money(resumen.egresos)} critico={alerta.alerta} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <DonaMetodosPago porMetodo={resumen.porMetodo} />
        <VentasPorHoraChart datos={ventasPorHora} horaActual={horaActual} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="card-cayla p-5">
          <p className="text-sm font-semibold text-tinta">Movimientos recientes</p>
          <p className="mt-1 text-xs text-tinta/60">Últimos registros de esta caja</p>
          {eventosFeed.length === 0 ? (
            <p className="mt-6 text-sm text-tinta/50">Todavía no hay movimientos hoy.</p>
          ) : (
            <div className="mt-3 divide-y divide-sand">
              {eventosFeed.map((e) => (
                <FilaEvento key={`${e.tipo}-${e.id}`} evento={e} />
              ))}
            </div>
          )}
        </div>

        <div className="card-cayla p-5">
          <p className="text-sm font-semibold text-tinta">Historial de cierres</p>
          <p className="mt-1 text-xs text-tinta/60">Últimos 7 días</p>
          <div className="mt-4">
            <TendenciaCierres serie={tendenciaCierres} />
          </div>
          <Link href="/caja/historial" className="mt-3 inline-block text-xs font-semibold text-rojo hover:text-rojo-profundo">
            Ver historial completo →
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href="/cambios"
          className="alza-cayla label-cayla rounded-md border border-tinta/15 bg-papel px-4 py-2.5 text-[12px] text-tinta hover:border-tinta/30"
        >
          ↔ Cambios
        </Link>
        <Boton peso="discreto" onClick={() => setModal("movimiento")}>
          + Ingreso / egreso
        </Boton>
        <Boton peso="primario" onClick={() => setModal("cerrar")}>
          Cerrar caja
        </Boton>
      </div>

      {modal === "movimiento" && <MovimientoCajaModal cajaId={caja.id} onClose={() => setModal(null)} />}
      {modal === "cerrar" && <CerrarCajaModalV2 cajaId={caja.id} cola={cola} onClose={() => setModal(null)} />}
    </div>
  );
}

/** Suma acumulada intradía de un lado del gráfico de dona — no hay serie histórica
 *  de 7 días por KPI (ver auditoría), así que el sparkline muestra el momentum de
 *  HOY: cuánto se llevaba vendido a cada hora, real y barato de calcular con lo que
 *  ya se pidió para el gráfico de barras. `resumen.porMetodo` no distingue por hora,
 *  así que el reparto efectivo/otros de cada hora se aproxima con la proporción del
 *  día completo — suficiente para una mini-línea de tendencia, no para un monto exacto. */
function cumulativo(porHora: { hora: number; monto: number }[], cual: "efectivo" | "otros", resumen: ResumenCaja): number[] {
  const totalDia = resumen.ventasEfectivo + resumen.ventasOtros;
  const proporcion = totalDia > 0 ? (cual === "efectivo" ? resumen.ventasEfectivo : resumen.ventasOtros) / totalDia : 0;
  let acumulado = 0;
  return porHora.map((p) => {
    acumulado += p.monto * proporcion;
    return acumulado;
  });
}

function RelojEnVivo() {
  const [hora, setHora] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  // `hora` arranca null: en el servidor no hay reloj — mostrar algo distinto ahí
  // desincronizaría la hidratación. Se llena recién tras montar en el cliente.
  return <span className="tabular-nums">{hora ?? "—:—:—"}</span>;
}

type EventoFeed = Extract<EventoCaja, { tipo: "venta" }> | Extract<EventoCaja, { tipo: "movimiento" }>;

function esEventoDeFeed(e: EventoCaja): e is EventoFeed {
  return (e.tipo === "venta" && !e.anulada) || e.tipo === "movimiento";
}

function FilaEvento({ evento }: { evento: EventoFeed }) {
  const hora = new Date(evento.hora).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  if (evento.tipo === "venta") {
    return (
      <div className="flex items-center gap-3 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-metodo-efectivo/15 text-metodo-efectivo">
          <ShoppingBag className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-tinta">
            Venta{" "}
            <span className="label-cayla ml-1 rounded-full bg-sand px-2 py-0.5 text-[10px] text-tinta/70">
              {evento.metodos.map((m) => LABEL_METODO_CORTO[m] ?? m).join(" + ") || "—"}
            </span>
          </p>
          <p className="text-[11.5px] text-tinta/55">
            {hora} {evento.colaboradorNombre ? `· ${evento.colaboradorNombre}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums text-verde-profundo">+ {money(evento.total)}</span>
      </div>
    );
  }
  const esEgreso = evento.direccion === "egreso";
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${esEgreso ? "bg-rojo/12 text-rojo-profundo" : "bg-verde/12 text-verde-profundo"}`}
      >
        {esEgreso ? <TrendingDown className="h-4 w-4" aria-hidden /> : <TrendingUp className="h-4 w-4" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-tinta">{evento.motivo}</p>
        <p className="text-[11.5px] text-tinta/55">
          {hora} {evento.colaboradorNombre ? `· ${evento.colaboradorNombre}` : ""}
          {evento.nota && <span className="block">{evento.nota}</span>}
        </p>
      </div>
      <span className={`shrink-0 text-sm font-bold tabular-nums ${esEgreso ? "text-rojo" : "text-tinta"}`}>
        {esEgreso ? "−" : "+"} {money(evento.monto)}
      </span>
    </div>
  );
}

const LABEL_METODO_CORTO: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", yape: "Yape", plin: "Plin", transferencia: "Transf." };
