"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  Unlock,
  Banknote,
  CreditCard,
  CirclePlus,
  CircleMinus,
  CircleCheck,
  TriangleAlert,
  ShoppingBag,
  ArrowRightLeft,
  History,
} from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { MovimientoCajaModal } from "@/components/MovimientoCajaModal";
import { CerrarCajaModalV2 } from "@/components/CerrarCajaModalV2";
import { Sparkline, DonutChart, BarrasHorarias, TendenciaCierres, type SegmentoDona } from "@/components/ui/Graficos";
import { useCountUp } from "@/lib/useCountUp";
import type { CajaAbierta, MovimientoCaja, ResumenCaja, SeriesVentasCaja, CierreCaja } from "@/lib/caja";
import { claveLocal, leer } from "@/lib/almacen-local";
import type { VentaEncolada } from "@/lib/ventas-offline";
import { iniciales } from "@/lib/caja-panel-reglas";

function money(n: number) {
  return "S/" + n.toFixed(2);
}

const ETIQUETA_METODO: Record<string, { texto: string; color: string }> = {
  efectivo: { texto: "Efectivo", color: "var(--color-metodo-efectivo)" },
  tarjeta: { texto: "Tarjeta", color: "var(--color-metodo-tarjeta)" },
  yape: { texto: "Yape / Plin", color: "var(--color-metodo-yape)" },
  plin: { texto: "Yape / Plin", color: "var(--color-metodo-yape)" },
  transferencia: { texto: "Transferencia", color: "var(--color-taupe)" },
};

function colorDeMetodo(texto: string | null): string {
  const t = (texto ?? "").toLowerCase();
  if (t.includes("efectivo")) return "var(--color-metodo-efectivo)";
  if (t.includes("tarjeta")) return "var(--color-metodo-tarjeta)";
  if (t.includes("yape") || t.includes("plin")) return "var(--color-metodo-yape)";
  return "var(--color-taupe)";
}

function minutosDeHora(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export type VentaDelDia = {
  ventaId: string;
  hora: string;
  vendedor: string | null;
  metodosPago: string | null;
  total: number;
};

export function CajaAbiertaPanel({
  ubicacionNombre,
  personaNombre,
  personaRol,
  caja,
  resumen,
  movimientos,
  series,
  ventasHoy,
  metaVentaDiaria,
  cierresRecientes,
}: {
  ubicacionNombre: string;
  personaNombre: string;
  personaRol: "lider" | "integrante";
  caja: CajaAbierta;
  resumen: ResumenCaja;
  movimientos: MovimientoCaja[];
  series: SeriesVentasCaja;
  ventasHoy: VentaDelDia[];
  metaVentaDiaria: number | null;
  cierresRecientes: CierreCaja[];
}) {
  const [modal, setModal] = useState<"movimiento" | "cerrar" | null>(null);
  // Cola de ventas offline de ESTA sede (ADR-0092): ver nota original en este
  // archivo — no existe `localStorage` en el servidor, se lee tras montar.
  const [cola, setCola] = useState<VentaEncolada[]>([]);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setCola(leer<VentaEncolada[]>(claveLocal(caja.ubicacionId, "cola"), []));
    }, 0);
    return () => window.clearTimeout(id);
  }, [caja.ubicacionId]);

  const totalVentas = resumen.ventasEfectivo + resumen.ventasOtros;
  const metaPct = metaVentaDiaria ? Math.min(100, Math.round((totalVentas / metaVentaDiaria) * 100)) : null;

  const segmentosDona: SegmentoDona[] = Object.entries(series.porMetodo)
    .filter(([metodo]) => metodo !== "yape" && metodo !== "plin")
    .map(([metodo, valor]) => ({
      etiqueta: ETIQUETA_METODO[metodo]?.texto ?? metodo,
      valor: valor ?? 0,
      color: ETIQUETA_METODO[metodo]?.color ?? "var(--color-taupe)",
    }));
  const yapePlin = (series.porMetodo.yape ?? 0) + (series.porMetodo.plin ?? 0);
  if (yapePlin > 0) segmentosDona.push({ etiqueta: "Yape / Plin", valor: yapePlin, color: "var(--color-metodo-yape)" });
  const totalDona = segmentosDona.reduce((a, s) => a + s.valor, 0);

  const horaActual = new Date().getHours();
  const todasLasHoras = Array.from({ length: 24 }, (_, hora) => {
    const punto = series.porHora.find((p) => p.hora === hora);
    return { hora, monto: (punto?.efectivo ?? 0) + (punto?.otros ?? 0) };
  });
  // Recorta a la ventana con actividad, siempre hasta la hora actual — nunca
  // muestra horas futuras del día, que todavía no pasaron.
  const primeraConVentas = todasLasHoras.findIndex((x) => x.monto > 0);
  const desdeHora = primeraConVentas === -1 ? horaActual : Math.min(primeraConVentas, horaActual);
  const barrasHora = todasLasHoras.filter((p) => p.hora >= desdeHora && p.hora <= horaActual);

  type EventoTimeline = {
    id: string;
    minutos: number;
    horaTexto: string;
    icono: "venta" | "ingreso" | "egreso";
    titulo: string;
    meta: string;
    monto: number;
    color: string;
  };
  const eventos: EventoTimeline[] = [
    ...ventasHoy.map((v) => ({
      id: v.ventaId,
      minutos: minutosDeHora(v.hora),
      horaTexto: v.hora,
      icono: "venta" as const,
      titulo: `Venta${v.metodosPago ? ` · ${v.metodosPago}` : ""}`,
      meta: v.vendedor ?? "—",
      monto: v.total,
      color: colorDeMetodo(v.metodosPago),
    })),
    ...movimientos.map((m) => {
      const d = new Date(m.creadoEn);
      return {
        id: m.id,
        minutos: d.getHours() * 60 + d.getMinutes(),
        horaTexto: d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }),
        icono: m.tipo,
        titulo: m.motivo,
        meta: m.registradoPorNombre ?? "—",
        monto: m.tipo === "egreso" ? -m.monto : m.monto,
        color: m.tipo === "egreso" ? "var(--color-rojo)" : "var(--color-verde)",
      };
    }),
  ]
    .sort((a, b) => b.minutos - a.minutos)
    .slice(0, 8);

  const cierresUbicacion = cierresRecientes
    .filter((c) => c.ubicacionId === caja.ubicacionId)
    .slice(0, 7)
    .reverse();
  const maxCierre = Math.max(...cierresUbicacion.map((c) => c.montoCierreSistema), 0.0001);

  const haySincronizando = cola.length > 0;

  return (
    <div className="anim-entrada space-y-4 pb-8 sm:pb-24">
      {/* ---------- Encabezado ---------- */}
      <div className="card-cayla flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-4">
          <div
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-tinta text-sm font-bold text-crema"
          >
            {iniciales(personaNombre)}
          </div>
          <div>
            <p className="label-cayla text-[11px] text-tinta/55">Caja · {ubicacionNombre}</p>
            <h1 className="font-display mt-0.5 text-2xl text-tinta">Caja abierta</h1>
            <p className="mt-0.5 text-[13px] text-tinta/65">
              {personaNombre} · {personaRol === "lider" ? "Líder de equipo" : "Integrante"} · Abierta desde las{" "}
              {new Date(caja.abiertaEn).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })} ·{" "}
              <RelojEnVivo />
            </p>
          </div>
        </div>
        {haySincronizando ? (
          <span className="label-cayla inline-flex shrink-0 items-center gap-2 rounded-full bg-ambar/15 px-3.5 py-2 text-[12px] font-bold text-ambar-profundo">
            <TriangleAlert size={14} aria-hidden />
            {cola.length} venta{cola.length === 1 ? "" : "s"} sin sincronizar
          </span>
        ) : (
          <span className="label-cayla inline-flex shrink-0 items-center gap-2 rounded-full bg-verde/15 px-3.5 py-2 text-[12px] font-bold text-verde-profundo">
            <CircleCheck size={14} aria-hidden />
            Todo sincronizado
          </span>
        )}
      </div>

      {/* ---------- Meta del día (solo si la ubicación tiene una configurada) ---------- */}
      {metaVentaDiaria !== null && metaPct !== null && (
        <div className="card-cayla p-5">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-1.5">
            <span className="label-cayla text-[11px] text-tinta/55">Meta del día</span>
            <span className="text-sm font-semibold text-tinta">
              {money(totalVentas)} <span className="font-normal text-tinta/50">de {money(metaVentaDiaria)}</span>
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-sand">
            <div
              className="h-full rounded-full bg-rojo transition-[width] duration-1000 [transition-timing-function:var(--ease-cayla)]"
              style={{ width: `${metaPct}%` }}
            />
          </div>
        </div>
      )}

      {/* ---------- KPIs ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <TarjetaKpi etiqueta="Apertura" valor={caja.montoApertura} icono={<Unlock size={15} aria-hidden />} colorBorde="var(--color-taupe)" />
        <TarjetaKpi
          etiqueta="Ventas efectivo"
          valor={resumen.ventasEfectivo}
          icono={<Banknote size={15} aria-hidden />}
          colorBorde="var(--color-metodo-efectivo)"
          sparkline={series.porHora.map((p) => p.efectivo)}
        />
        <TarjetaKpi
          etiqueta="Ventas otro método"
          valor={resumen.ventasOtros}
          icono={<CreditCard size={15} aria-hidden />}
          colorBorde="var(--color-taupe)"
          sparkline={series.porHora.map((p) => p.otros)}
        />
        <TarjetaKpi etiqueta="Ingresos" valor={resumen.ingresos} icono={<CirclePlus size={15} aria-hidden />} colorBorde="var(--color-verde)" />
        <TarjetaKpi etiqueta="Egresos" valor={resumen.egresos} icono={<CircleMinus size={15} aria-hidden />} colorBorde="var(--color-rojo)" />
      </div>

      {/* ---------- Métodos de pago + Ventas por hora ---------- */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="card-cayla p-5">
          <p className="text-sm font-bold text-tinta">Métodos de pago</p>
          <p className="mb-3.5 text-xs text-tinta/50">Distribución de ventas de esta caja</p>
          {segmentosDona.length === 0 ? (
            <p className="py-6 text-center text-xs text-tinta/50">Sin ventas registradas todavía.</p>
          ) : (
            <TablaOGrafico segmentos={segmentosDona} total={totalDona} />
          )}
        </div>
        <div className="card-cayla p-5">
          <p className="text-sm font-bold text-tinta">Ventas por hora</p>
          <p className="mb-3.5 text-xs text-tinta/50">Hoy · hora actual resaltada</p>
          <BarrasHorarias puntos={barrasHora} horaActual={horaActual} />
        </div>
      </div>

      {/* ---------- Movimientos recientes + Historial de cierres ---------- */}
      <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="card-cayla p-5">
          <p className="text-sm font-bold text-tinta">Movimientos recientes</p>
          <p className="mb-1.5 text-xs text-tinta/50">Últimos registros de esta caja</p>
          {eventos.length === 0 ? (
            <p className="py-6 text-center text-xs text-tinta/50">Todavía no hay movimientos.</p>
          ) : (
            <div className="divide-y divide-sand">
              {eventos.map((e) => (
                <div key={e.id} className="anim-revelar flex items-center gap-3 py-2.5">
                  <div
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `color-mix(in srgb, ${e.color} 14%, transparent)`, color: e.color }}
                  >
                    {e.icono === "venta" ? <ShoppingBag size={14} /> : e.icono === "ingreso" ? <CirclePlus size={14} /> : <CircleMinus size={14} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-tinta">{e.titulo}</p>
                    <p className="text-[11.5px] text-tinta/50">
                      {e.horaTexto} · {e.meta}
                    </p>
                  </div>
                  <p key={e.monto} className={`anim-asentar shrink-0 text-sm font-bold tabular-nums ${e.monto < 0 ? "text-rojo" : "text-verde-profundo"}`}>
                    {e.monto < 0 ? "−" : "+"}
                    {money(Math.abs(e.monto))}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-cayla p-5">
          <p className="text-sm font-bold text-tinta">Historial de cierres</p>
          <p className="mb-3.5 text-xs text-tinta/50">Últimos días · {ubicacionNombre}</p>
          <TendenciaCierres
            dias={cierresUbicacion.map((c) => ({
              etiqueta: new Date(c.cerradaEn).toLocaleDateString("es-PE", { weekday: "narrow" }).toUpperCase(),
              alturaPct: (c.montoCierreSistema / maxCierre) * 100,
              ok: Math.abs(c.diferencia) < 0.01,
            }))}
          />
          <Link href="/caja/historial" className="label-cayla inline-flex items-center gap-1.5 text-[11px] font-bold text-rojo hover:text-rojo-profundo">
            <History size={12} aria-hidden /> Ver historial completo
          </Link>
        </div>
      </div>

      {/* ---------- Barra de acciones ---------- */}
      <div className="fixed inset-x-0 bottom-16 z-30 flex justify-center gap-2.5 border-t border-tinta/10 bg-crema/95 px-4 py-3 backdrop-blur-sm sm:bottom-0">
        <Link href="/cambios">
          <Boton peso="discreto" className="inline-flex items-center gap-2">
            <ArrowRightLeft size={14} aria-hidden /> Cambios
          </Boton>
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

function RelojEnVivo() {
  const [texto, setTexto] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setTexto(new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  // `null` en el primer render del servidor: la hora del cliente puede diferir
  // de la del servidor, mostrarla recién montado evita un mismatch de hidratación.
  return <span className="tabular-nums">{texto ?? "—"}</span>;
}

function TarjetaKpi({
  etiqueta,
  valor,
  icono,
  colorBorde,
  sparkline,
}: {
  etiqueta: string;
  valor: number;
  icono: ReactNode;
  colorBorde: string;
  sparkline?: number[];
}) {
  const animado = useCountUp(valor);
  return (
    <div className="card-cayla alza-cayla relative overflow-hidden p-4" style={{ borderLeft: `3px solid ${colorBorde}` }}>
      <div className="mb-2.5 flex items-center justify-between">
        <span className="label-cayla text-[10.5px] text-tinta/55">{etiqueta}</span>
        <span style={{ color: colorBorde }}>{icono}</span>
      </div>
      <p className="font-display text-xl font-semibold text-tinta">{money(animado)}</p>
      <div className="mt-2">{sparkline && sparkline.length > 1 && <Sparkline puntos={sparkline} color={colorBorde} />}</div>
    </div>
  );
}

function TablaOGrafico({ segmentos, total }: { segmentos: SegmentoDona[]; total: number }) {
  const [comoTabla, setComoTabla] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-5">
        <DonutChart segmentos={segmentos} total={total} />
        <div className="min-w-[150px] flex-1 space-y-2">
          {segmentos.map((s) => (
            <div key={s.etiqueta} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="flex items-center gap-2">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
                {s.etiqueta}
              </span>
              <span className="font-bold tabular-nums text-tinta/70">
                {total > 0 ? Math.round((s.valor / total) * 100) : 0}% · {money(s.valor)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setComoTabla((v) => !v)}
        className="mt-2 text-[11.5px] text-tinta/50 underline hover:text-tinta"
      >
        {comoTabla ? "Ocultar tabla" : "Ver como tabla"}
      </button>
      {comoTabla && (
        <table className="mt-2.5 w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-tinta/50">
              <th className="border-b border-sand pb-1 font-medium">Método</th>
              <th className="border-b border-sand pb-1 font-medium">%</th>
              <th className="border-b border-sand pb-1 font-medium">Monto</th>
            </tr>
          </thead>
          <tbody>
            {segmentos.map((s) => (
              <tr key={s.etiqueta} className="text-tinta/70">
                <td className="border-b border-sand/60 py-1">{s.etiqueta}</td>
                <td className="border-b border-sand/60 py-1">{total > 0 ? Math.round((s.valor / total) * 100) : 0}%</td>
                <td className="border-b border-sand/60 py-1">{money(s.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
