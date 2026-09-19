"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Unlock,
  Banknote,
  CreditCard,
  CirclePlus,
  CircleMinus,
  CircleCheck,
  TriangleAlert,
  ShoppingBag,
  History,
} from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { MovimientoCajaModal } from "@/components/MovimientoCajaModal";
import { CerrarCajaModalV2 } from "@/components/CerrarCajaModalV2";
import { Sparkline, TendenciaCierres } from "@/components/ui/Graficos";
import { DonaMetodos, type SegmentoDona } from "@/components/ui/DonaMetodos";
import { useCountUp } from "@/lib/useCountUp";
import { useEnVista } from "@/lib/useEnVista";
import { useCajaEnVivo } from "@/lib/useCajaEnVivo";
import { useAumento, useIdsNuevos } from "@/lib/useNovedades";
import type { CajaAbierta, MovimientoCaja, ResumenCaja, SeriesVentasCaja, CierreCaja } from "@/lib/caja";
import { claveLocal, leer } from "@/lib/almacen-local";
import type { VentaEncolada } from "@/lib/ventas-offline";
import { duracionAbierta, formatoDuracion, metodosDe, minutosDeHora, ritmoDelDia, type MetodoRitmo } from "@/lib/caja-panel-reglas";

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

export type VentaDelDia = {
  ventaId: string;
  hora: string;
  vendedor: string | null;
  metodosPago: string | null;
  total: number;
};

// Funciones de módulo (no flechas dentro del componente): `useIdsNuevos` exige un `idDe` estable.
const idVenta = (v: VentaDelDia) => v.ventaId;
const idMovimiento = (m: MovimientoCaja) => m.id;

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

  // En vivo: sondea la caja cada pocos segundos y, si entró algo, Next vuelve a leer la pantalla y llegan props
  // nuevas. Lo que sigue solo detecta QUÉ es nuevo para que cada pieza lo muestre; nada de esto pide datos.
  useCajaEnVivo(caja.id);
  const ventasNuevas = useIdsNuevos(ventasHoy, idVenta);
  const movimientosNuevos = useIdsNuevos(movimientos, idMovimiento);
  const idsNuevos = new Set([...ventasNuevas.ids, ...movimientosNuevos.ids]);
  useEffect(() => {
    const n = ventasNuevas.nuevos;
    if (n.length === 0) return;
    // `ventasHoy` viene de la más nueva a la más vieja: n[0] es la última en entrar.
    const total = n.reduce((a, v) => a + v.total, 0);
    avisar.exito(n.length === 1 ? "Nueva venta" : `${n.length} ventas nuevas`, {
      detalle: n.length === 1 ? `${money(total)} · ${nombresDeMetodos(n[0]!.metodosPago)} · ${n[0]!.hora}` : `${money(total)} en total`,
    });
  }, [ventasNuevas.nuevos]);

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

  // Hasta 14: el gráfico solo muestra los 7 más viejos cuando su tarjeta es lo bastante ancha (TendenciaCierres).
  const cierresUbicacion = cierresRecientes
    .filter((c) => c.ubicacionId === caja.ubicacionId)
    .slice(0, 14)
    .reverse();
  const maxCierre = Math.max(...cierresUbicacion.map((c) => c.montoCierreSistema), 0.0001);

  return (
    <div className="anim-entrada pb-8">
      {/* La disposición decide por el ancho del PROPIO tablero (`@container`), no por el de la ventana: la barra
          lateral y los márgenes se comen ~350 px, así que la misma pantalla da 700 px de tablero o 1500. Los
          modales van FUERA de este contenedor: `container-type` aplica contención de layout y ataría su `fixed`
          al tablero en vez de a la pantalla. Umbrales: 560/800 (columnas de KPI), 720 (encabezado en dos zonas),
          900 (dos columnas: la dona necesita ~440 px de tarjeta para tener anillo y leyenda lado a lado) y 1400 (encabezado en tres zonas y cuerpo en tres columnas, con "Movimientos" como
          riel alto a la derecha). */}
      <div className="@container space-y-4">
        {/* ---------- Encabezado ---------- */}
        {/* Tres zonas cuando hay ancho (identidad · hora del turno · acciones); dos con ancho medio (la hora baja
            bajo la identidad, junto a las acciones) y apilado en angosto. Las acciones (ingreso/egreso y cerrar)
            viven arriba y a un lado, no en una barra fija abajo. Sin avatar: las iniciales no aportaban nada. */}
        <div className="card-cayla grid items-center gap-x-8 gap-y-1.5 p-6 @[720px]:grid-cols-[1fr_auto] @[1400px]:grid-cols-[1fr_auto_1fr]">
          <div className="min-w-0">
            <p className="label-cayla text-[11px] text-tinta/55">Caja · {ubicacionNombre}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="font-display text-2xl text-tinta">Caja abierta</h1>
              <EstadoSync pendientes={cola.length} />
            </div>
            <p className="mt-0.5 text-[13px] text-tinta/65">
              {personaNombre} · {personaRol === "lider" ? "Líder de equipo" : "Integrante"}
            </p>
          </div>
          <RelojDeCaja abiertaEn={caja.abiertaEn} className="@[720px]:col-start-1 @[1400px]:col-start-2 @[1400px]:row-start-1" />
          <div className="mt-2.5 flex w-full gap-2.5 @[720px]:col-start-2 @[720px]:row-start-1 @[720px]:row-span-2 @[720px]:mt-0 @[720px]:w-auto @[720px]:justify-self-end @[1400px]:col-start-3 @[1400px]:row-span-1">
            <Boton peso="discreto" className="flex-1 @[720px]:flex-none" onClick={() => setModal("movimiento")}>
              + Ingreso / egreso
            </Boton>
            <Boton peso="primario" className="flex-1 @[720px]:flex-none" onClick={() => setModal("cerrar")}>
              Cerrar caja
            </Boton>
          </div>
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
        <div className="grid grid-cols-2 gap-3 @[560px]:grid-cols-3 @[800px]:grid-cols-5">
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

        {/* ---------- Cuerpo ---------- */}
        {/* Una sola cuadrícula para las cuatro tarjetas. Ancho medio (900–1400): dos columnas para la dona y el
            ritmo, y debajo el historial y los movimientos a ancho completo (una tarjeta más alta que su vecina
            en una fila de dos columnas se estira y deja la otra medio vacía; a ancho completo el historial gana
            días y los movimientos se parten en dos columnas). Ancho de sobra (≥ 1400): tres columnas, con
            "Movimientos" como riel alto a la derecha —su alto natural coincide con las dos filas de la
            izquierda— y el historial ocupando dos columnas. En angosto, una columna: lo vivo antes que lo viejo. */}
        <div className="grid gap-3 @[900px]:grid-cols-2 @[1400px]:grid-cols-3">
          <div className="card-cayla flex flex-col p-5">
            <p className="text-sm font-bold text-tinta">Métodos de pago</p>
            <p className="mb-3.5 text-xs text-tinta/50">Distribución de ventas de esta caja</p>
            {segmentosDona.length === 0 ? (
              <p className="py-6 text-center text-xs text-tinta/50">Sin ventas registradas todavía.</p>
            ) : (
              <TablaOGrafico segmentos={segmentosDona} total={totalDona} />
            )}
          </div>

          <div className="card-cayla flex flex-col p-5">
            <p className="text-sm font-bold text-tinta">Ritmo del día</p>
            <p className="mb-3.5 text-xs text-tinta/50">Cada punto es una venta, desde que abrió la caja</p>
            <RitmoDelDia ventas={ventasHoy} abiertaEn={caja.abiertaEn} idsNuevos={idsNuevos} />
          </div>

          <div className="card-cayla order-last flex flex-col p-5 @[900px]:order-none @[900px]:col-span-2">
            <p className="text-sm font-bold text-tinta">Historial de cierres</p>
            <p className="mb-3.5 text-xs text-tinta/50">Últimos días · {ubicacionNombre}</p>
            <TendenciaCierres
              dias={cierresUbicacion.map((c) => {
                const fecha = new Date(c.cerradaEn);
                return {
                  etiqueta: fecha.toLocaleDateString("es-PE", { weekday: "narrow" }).toUpperCase(),
                  etiquetaLarga: fecha.toLocaleDateString("es-PE", { weekday: "short", day: "numeric" }),
                  monto: `S/${Math.round(c.montoCierreSistema)}`,
                  alturaPct: (c.montoCierreSistema / maxCierre) * 100,
                  ok: Math.abs(c.diferencia) < 0.01,
                };
              })}
            />
            <Link href="/caja/historial" className="label-cayla mt-auto inline-flex items-center gap-1.5 pt-1 text-[11px] text-rojo hover:text-rojo-profundo">
              <History size={12} aria-hidden /> Ver historial completo
            </Link>
          </div>
          <div className="card-cayla @container flex flex-col p-5 @[900px]:col-span-2 @[1400px]:col-span-1 @[1400px]:col-start-3 @[1400px]:row-start-1 @[1400px]:row-span-2">
            <p className="text-sm font-bold text-tinta">Movimientos recientes</p>
            <p className="mb-1.5 text-xs text-tinta/50">Últimos registros de esta caja</p>
            {eventos.length === 0 ? (
              <p className="py-6 text-center text-xs text-tinta/50">Todavía no hay movimientos.</p>
            ) : (
              <div className="divide-y divide-sand @[640px]:columns-2 @[640px]:gap-x-10">
                {eventos.map((e) => (
                  // `isolate` + el velo en `-z-10`: el resaltado de una fila nueva queda DETRÁS de su texto.
                  <div key={e.id} className="anim-revelar relative isolate flex items-center gap-3 py-2.5 @[640px]:break-inside-avoid">
                    {idsNuevos.has(e.id) && (
                      <span aria-hidden className="anim-vivo-fila pointer-events-none absolute -inset-x-2 inset-y-0.5 -z-10 rounded-lg bg-verde/15" />
                    )}
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

        </div>
      </div>

      {modal === "movimiento" && <MovimientoCajaModal cajaId={caja.id} onClose={() => setModal(null)} />}
      {modal === "cerrar" && <CerrarCajaModalV2 cajaId={caja.id} cola={cola} onClose={() => setModal(null)} />}
    </div>
  );
}

const FORMATO_HORA = new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });

/** Cada dígito es su propia caja de ancho fijo y se remonta (`key`) solo cuando cambia: rueda
 *  a su lugar únicamente el que cambió, y el reloj no baila de lado a lado. */
function Digitos({ texto }: { texto: string }) {
  return (
    <>
      {[...texto].map((c, i) => (
        <span key={`${i}${c}`} className="anim-rueda inline-block w-[0.56em] text-center">
          {c}
        </span>
      ))}
    </>
  );
}

/** Aguja de segundos: da la vuelta cada 60 s y arranca ya en el segundo real. Se fija en un
 *  efecto porque `Date.now()` no puede leerse al renderizar (un minuto UTC coincide con el
 *  local: todos los husos horarios son múltiplos de un minuto). */
function Aguja() {
  const ref = useRef<SVGGElement>(null);
  useEffect(() => {
    ref.current?.style.setProperty("animation-delay", `${-(Date.now() % 60_000) / 1000}s`);
  }, []);
  return (
    <svg viewBox="0 0 20 20" className="h-[19px] w-[19px] shrink-0 text-tinta/70 @[1400px]:h-[26px] @[1400px]:w-[26px]" aria-hidden>
      <circle cx="10" cy="10" r="8.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10 2.6v1.6M17.4 10h-1.6M10 17.4v-1.6M2.6 10h1.6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <g ref={ref} className="anim-caja-aguja">
        <line x1="10" y1="10" x2="10" y2="4.4" stroke="var(--color-tinta)" strokeWidth="1.3" strokeLinecap="round" />
      </g>
      <circle cx="10" cy="10" r="1.3" fill="var(--color-tinta)" />
    </svg>
  );
}

/** La hora actual, refrescada cada `cadaMs`. Nace en `null` (servidor y primer render del cliente):
 *  la hora del cliente puede diferir de la del servidor, y mostrarla recién montado evita un
 *  mismatch de hidratación. */
function useAhora(cadaMs: number): Date | null {
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setAhora(new Date());
    tick();
    const id = setInterval(tick, cadaMs);
    return () => clearInterval(id);
  }, [cadaMs]);
  return ahora;
}

/** Reloj del turno: la hora que corre, desde cuándo está abierta la caja y cuánto lleva. Con ancho de
 *  tablero se vuelve la pieza central del encabezado (dos líneas, hora grande); si no, una sola línea bajo
 *  la identidad. `className` trae su lugar en la cuadrícula del encabezado. */
function RelojDeCaja({ abiertaEn, className = "" }: { abiertaEn: string; className?: string }) {
  const ahora = useAhora(1000);

  // Reserva el alto de la línea para que el encabezado no salte al montar.
  if (!ahora) {
    return (
      <p aria-hidden className={`mt-1.5 h-[22px] text-[13px] text-tinta/35 @[1400px]:mt-0 @[1400px]:h-[66px] @[1400px]:text-center ${className}`}>
        —
      </p>
    );
  }

  const p = Object.fromEntries(FORMATO_HORA.formatToParts(ahora).map((x) => [x.type, x.value]));
  const h = p.hour ?? "";
  const m = p.minute ?? "";
  const s = p.second ?? "";
  const periodo = p.dayPeriod ?? "";
  const desde = new Date(abiertaEn).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  const lleva = duracionAbierta(abiertaEn, ahora.getTime());
  return (
    <p
      className={`mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-tinta/65 @[1400px]:mt-0 @[1400px]:flex-col @[1400px]:gap-y-2.5 @[1400px]:text-[14px] ${className}`}
    >
      <span className="inline-flex items-center gap-2 font-display text-[21px] leading-none text-tinta @[1400px]:gap-3 @[1400px]:text-[32px]">
        <Aguja />
        <span aria-hidden>
          <Digitos texto={h} />:<Digitos texto={m} />:<Digitos texto={s} />
        </span>
        <span aria-hidden className="label-cayla ml-0.5 text-[10px] text-tinta/55 @[1400px]:text-[12px]">
          {periodo}
        </span>
        <span className="sr-only">{`${h}:${m}:${s} ${periodo}`}</span>
      </span>
      <span aria-hidden className="hidden h-3.5 w-px bg-tinta/15 sm:block @[1400px]:hidden" />
      <span>
        Abierta desde las {desde} · lleva{" "}
        <b key={lleva} className="anim-asentar inline-block font-semibold text-tinta/80">
          {lleva}
        </b>
      </span>
    </p>
  );
}

/** Estado de la cola offline, con un poco de vida: una onda suave detrás del ícono (respira, no
 *  parpadea), el visto que se traza al aparecer, y el chip que se re-asienta al cambiar de
 *  estado. La región `role="status"` es estable y solo el chip de adentro se remonta: así el
 *  cambio se anuncia y además se anima. El ícono distinto (visto/alerta) mantiene el estado
 *  legible sin depender del color. */
function EstadoSync({ pendientes }: { pendientes: number }) {
  const ok = pendientes === 0;
  const Icono = ok ? CircleCheck : TriangleAlert;
  return (
    <span role="status" className="shrink-0">
      <span
        key={ok ? "ok" : "pendiente"}
        className={`anim-asentar label-cayla inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] ${
          ok ? "bg-verde/15 text-verde-profundo" : "bg-ambar/15 text-ambar-profundo"
        }`}
      >
        <span aria-hidden className="relative flex h-[15px] w-[15px] items-center justify-center">
          <span className={`anim-caja-ping absolute inset-0 rounded-full ${ok ? "bg-verde" : "bg-ambar"}`} />
          <Icono size={15} className={`relative ${ok ? "anim-caja-check" : ""}`} />
        </span>
        <span className="relative">{ok ? "Todo sincronizado" : `${pendientes} venta${pendientes === 1 ? "" : "s"} sin sincronizar`}</span>
      </span>
    </span>
  );
}

// Cada método con su etiqueta y su color: los mismos de la dona (`ETIQUETA_METODO`), una sola fuente.
// "otro" no tiene color de dato propio y cae al taupe neutro, como ya hace `colorDeMetodo`.
const METODO_RITMO: Record<MetodoRitmo, { texto: string; color: string }> = {
  efectivo: ETIQUETA_METODO.efectivo!,
  tarjeta: ETIQUETA_METODO.tarjeta!,
  yape: ETIQUETA_METODO.yape!,
  transferencia: ETIQUETA_METODO.transferencia!,
  otro: { texto: "Otro", color: "var(--color-taupe)" },
};

/** Los métodos de una venta con los nombres de la dona: "Yape / Plin", "Efectivo + Yape / Plin". */
function nombresDeMetodos(texto: string | null): string {
  const claves = metodosDe(texto);
  return claves.length === 0 ? "sin método" : claves.map((m) => METODO_RITMO[m].texto).join(" + ");
}

/** Punto de un solo método: su color. De pago mixto: el círculo partido en partes iguales. */
function fondoDePunto(metodos: MetodoRitmo[]): string {
  const colores = metodos.map((m) => METODO_RITMO[m].color);
  if (colores.length === 0) return "var(--color-taupe)";
  if (colores.length === 1) return colores[0]!;
  const parte = 100 / colores.length;
  return `conic-gradient(${colores.map((c, i) => `${c} ${i * parte}% ${(i + 1) * parte}%`).join(", ")})`;
}

// Alto de cada fila de puntos apilados (el punto mayor mide 16 + 3 de aire) y aire sobre el eje.
const PASO_PUNTO = 19;
const BASE_PUNTO = 8;

// El tamaño de la cifra sigue al ancho REAL de la fila de métricas (`cqi`, contenedor de la fila) en vez de
// saltar por puntos de corte: 26 px cuando sobra sitio y hasta 16 px en una tarjeta angosta. Antes, a 340 px
// "S/171.39" se salía de su columna y desbordaba la página.
function Metrica({ etiqueta, valor, asentar = false }: { etiqueta: string; valor: string; asentar?: boolean }) {
  return (
    <div className="min-w-0 border-l border-sand px-1 text-center first:border-l-0">
      {/* `asentar`: para una cifra que cambia de golpe (el conteo de "desde la última venta" se reinicia con
          cada venta nueva) y no para las que ya cuentan cuadro a cuadro, donde remontar sería un parpadeo. */}
      <p
        key={asentar ? valor : undefined}
        className={`font-display whitespace-nowrap text-[length:clamp(16px,6.4cqi,26px)] leading-none text-tinta ${asentar ? "anim-asentar" : ""}`}
      >
        {valor}
      </p>
      <p className="label-cayla mt-2 text-[10px] leading-snug text-tinta/55">{etiqueta}</p>
    </div>
  );
}

/**
 * "Ritmo del día": cuántas ventas, ticket promedio y cuánto hace de la última, y debajo una línea
 * de tiempo de la apertura a ahora con una venta por punto (tamaño = monto, color = método). Sustituye
 * al gráfico de barras por hora, que con pocas ventas al día era una barra sin cifra ni comparación
 * (decisión del 2026-09-18, ADR-0113). Sale de `ventasHoy`, sin consultas nuevas.
 */
function RitmoDelDia({ ventas, abiertaEn, idsNuevos }: { ventas: VentaDelDia[]; abiertaEn: string; idsNuevos: ReadonlySet<string> }) {
  const ahora = useAhora(15_000);
  const { ref, enVista } = useEnVista<HTMLDivElement>();
  const r = ahora ? ritmoDelDia(ventas, abiertaEn, ahora.getTime()) : null;
  const nVentas = useCountUp(enVista && r ? r.cantidad : 0);
  const ticket = useCountUp(enVista && r ? r.ticketPromedio : 0);

  const hora = (d: Date) => d.toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit" });
  const desdeUltima = r?.minutosDesdeUltima === 0 ? "< 1 min" : formatoDuracion(r?.minutosDesdeUltima ?? 0);

  return (
    // La raíz es siempre la misma (de ella cuelga el observador de "a la vista"); lo de adentro cambia.
    <div ref={ref} className="flex flex-1 flex-col">
      {!r || !ahora ? (
        <div className="min-h-[190px]" />
      ) : r.cantidad === 0 ? (
        <p className="m-auto py-6 text-center text-xs text-tinta/50">Sin ventas registradas todavía hoy.</p>
      ) : (
        <>
          <p className="sr-only">
            {r.cantidad} venta{r.cantidad === 1 ? "" : "s"} hoy · ticket promedio {money(r.ticketPromedio)} · última venta hace {desdeUltima}
          </p>
          <div aria-hidden className="@container grid grid-cols-3">
            <Metrica etiqueta="Ventas" valor={String(Math.round(nVentas))} />
            <Metrica etiqueta="Ticket promedio" valor={money(ticket)} />
            <Metrica etiqueta="Desde la última venta" valor={desdeUltima} asentar />
          </div>

          <div aria-hidden className="mt-auto pt-7">
            <div className="relative" style={{ height: BASE_PUNTO + Math.max(1, r.filas) * PASO_PUNTO }}>
              <span className={`absolute inset-x-0 bottom-0 h-px origin-left bg-tinta/25 ${enVista ? "anim-ritmo-linea" : "scale-x-0"}`} />
              <span className="absolute -bottom-[3px] left-0 h-[7px] w-px bg-tinta/40" />
              {/* "Ahora": el extremo vivo del eje, con la misma onda que el estado de sincronización */}
              <span className="absolute -bottom-[4px] right-0 h-[9px] w-[9px]">
                <span className="anim-caja-ping absolute inset-0 rounded-full bg-tinta" />
                <span className="absolute inset-0 rounded-full border border-tinta bg-papel" />
              </span>
              {r.puntos.map((p, i) => {
                const d = 8 + 8 * p.peso;
                const nueva = idsNuevos.has(p.id);
                return (
                  <span
                    key={p.id}
                    // `transition-[left,bottom]`: el eje crece con el reloj y los puntos se deslizan a su nuevo sitio
                    // en vez de saltar. Una venta nueva entra sin la cola de espera de las demás (`--i` 0) y con una onda.
                    className={`group absolute rounded-full transition-[left,bottom] duration-700 hover:z-20 ${enVista ? "anim-ritmo-punto" : "opacity-0"}`}
                    style={
                      {
                        left: `calc(${p.pos * 100}% - ${d / 2}px)`,
                        bottom: BASE_PUNTO + p.fila * PASO_PUNTO,
                        width: d,
                        height: d,
                        background: fondoDePunto(p.metodos),
                        "--i": nueva ? 0 : i,
                      } as CSSProperties
                    }
                  >
                    {nueva && (
                      <span
                        aria-hidden
                        className="anim-vivo-onda pointer-events-none absolute inset-0 rounded-full"
                        style={{ background: fondoDePunto(p.metodos) }}
                      />
                    )}
                    <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-tinta px-1.5 py-0.5 text-[10px] text-crema opacity-0 transition-opacity group-hover:opacity-100">
                      {money(p.total)} · {p.hora}
                    </span>
                  </span>
                );
              })}
            </div>
            <div className="mt-2.5 flex justify-between text-[11px] text-tinta/55">
              <span>{r.abrioHoy ? `Abre ${hora(new Date(abiertaEn))}` : "Desde medianoche"}</span>
              <span>Ahora {hora(ahora)}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-tinta/55">
              {r.metodos.map((m) => (
                <span key={m} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: METODO_RITMO[m].color }} />
                  {METODO_RITMO[m].texto}
                </span>
              ))}
              <span className="ml-auto">El tamaño del punto es el monto</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
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
  // Cuando la cifra SUBE (entró una venta o un movimiento) la tarjeta lo dice: un velo de su color que se
  // disipa y una insignia "+S/337.00" que sube y se va. `pulso` es la `key` que reinicia las dos capas.
  const { pulso, delta } = useAumento(valor);
  return (
    <div className="card-cayla alza-cayla relative overflow-hidden p-4" style={{ borderLeft: `3px solid ${colorBorde}` }}>
      {pulso > 0 && (
        <>
          <span
            key={`velo${pulso}`}
            aria-hidden
            className="anim-vivo-destello pointer-events-none absolute inset-0"
            style={{ backgroundColor: `color-mix(in srgb, ${colorBorde} 20%, transparent)` }}
          />
          <span
            key={`delta${pulso}`}
            aria-hidden
            className="anim-vivo-delta pointer-events-none absolute right-3 top-9 rounded-full bg-tinta px-2 py-0.5 text-[11px] font-bold tabular-nums text-crema"
          >
            +{money(delta)}
          </span>
        </>
      )}
      <div className="mb-2.5 flex items-center justify-between">
        <span className="label-cayla text-[10.5px] text-tinta/55">{etiqueta}</span>
        <span style={{ color: colorBorde }}>{icono}</span>
      </div>
      <p className="font-display text-xl text-tinta">{money(animado)}</p>
      <div className="mt-2">{sparkline && sparkline.length > 1 && <Sparkline puntos={sparkline} color={colorBorde} />}</div>
    </div>
  );
}

function TablaOGrafico({ segmentos, total }: { segmentos: SegmentoDona[]; total: number }) {
  const [comoTabla, setComoTabla] = useState(false);
  return (
    // Centrada en las dos direcciones dentro de la tarjeta: la tarjeta se estira a la altura de su
    // vecina y el gráfico se queda en el medio del espacio que sobra, no pegado arriba a la izquierda.
    // `@container`: la dona escala con el ancho de ESTA tarjeta (ver DonaMetodos).
    <div className="@container flex flex-1 flex-col items-center justify-center">
      <DonaMetodos segmentos={segmentos} total={total} formato={money} />
      <button
        type="button"
        onClick={() => setComoTabla((v) => !v)}
        className="mt-3 text-[11.5px] text-tinta/50 underline hover:text-tinta"
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
