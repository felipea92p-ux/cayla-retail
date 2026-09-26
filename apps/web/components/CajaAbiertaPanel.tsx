"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  Unlock,
  Banknote,
  CreditCard,
  CirclePlus,
  CircleMinus,
  CircleCheck,
  TriangleAlert,
  History,
} from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { avisar } from "@/components/ui/Avisos";
import { MovimientoCajaModal } from "@/components/MovimientoCajaModal";
import { FilaMovimientoCaja, type EventoCaja } from "@/components/FilaMovimientoCaja";
import { MovimientosCajaModal } from "@/components/MovimientosCajaModal";
import { DetalleVentaModal } from "@/components/DetalleVentaModal";
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
import { duracionAbierta, escalaTurno, formatoDuracion, metodosDe, minutosDeHora, ritmoDelDia, turnoLargo, type MetodoRitmo } from "@/lib/caja-panel-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { DIAS_SEMANA, explicarMeta, minutosDeHora as minutosLima, proyeccionAlCierre, type ParametrosCaja } from "@/lib/configuracion-reglas";
import { hoyLima } from "@/lib/etiqueta-vigencia";

function money(n: number) {
  return "S/" + n.toFixed(2);
}

const ETIQUETA_METODO: Record<string, { texto: string; color: string }> = {
  efectivo: { texto: "Efectivo", color: "var(--color-metodo-efectivo)" },
  tarjeta: { texto: "Tarjeta", color: "var(--color-metodo-tarjeta)" },
  yape: { texto: "Yape / Plin", color: "var(--color-metodo-yape)" },
  plin: { texto: "Yape / Plin", color: "var(--color-metodo-yape)" },
  transferencia: { texto: "Transferencia", color: "var(--color-metodo-transferencia)" },
};

function colorDeMetodo(texto: string | null): string {
  const t = (texto ?? "").toLowerCase();
  if (t.includes("efectivo")) return "var(--color-metodo-efectivo)";
  if (t.includes("tarjeta")) return "var(--color-metodo-tarjeta)";
  if (t.includes("yape") || t.includes("plin")) return "var(--color-metodo-yape)";
  if (t.includes("transferencia")) return "var(--color-metodo-transferencia)";
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

/** Cuántos movimientos muestra la tarjeta del tablero; el resto se ve en «Ver todo». */
const LIMITE_TARJETA = 8;

export function CajaAbiertaPanel({
  ubicacionNombre,
  personaNombre,
  personaRol,
  puedeCerrar,
  caja,
  resumen,
  movimientos,
  series,
  ventasHoy,
  metaVentaDiaria,
  parametros = null,
  esperadoCajon = null,
  horaCierre = null,
  cierresRecientes,
}: {
  ubicacionNombre: string;
  personaNombre: string;
  personaRol: "lider" | "integrante";
  /** ¿Puede cerrar la caja? Un líder o la terminal de ventas (ADR-0160); el candado real está en `cerrar_caja`. */
  puedeCerrar: boolean;
  caja: CajaAbierta;
  resumen: ResumenCaja;
  movimientos: MovimientoCaja[];
  series: SeriesVentasCaja;
  ventasHoy: VentaDelDia[];
  metaVentaDiaria: number | null;
  /** Lo que rige hoy (ADR-0195 F1): meta con campañas y fondo de caja. `null` = base sin fn_parametros_caja. */
  parametros?: ParametrosCaja | null;
  /** Cuánto debería haber en el cajón (`fn_esperado_caja`); `null` si quien mira no puede cerrar. */
  esperadoCajon?: number | null;
  /** A qué hora cierra la tienda («21:00»): con ella, «al ritmo de hoy cierras en…». Null = se muestra el avance en %. */
  horaCierre?: string | null;
  cierresRecientes: CierreCaja[];
}) {
  const [modal, setModal] = useState<"movimiento" | "cerrar" | "todos" | null>(null);
  // La venta cuyo detalle está abierto. Aparte de `modal`: se apila sobre «Ver todo».
  const [ventaAbiertaId, setVentaAbiertaId] = useState<string | null>(null);
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
  const faltaMeta = metaVentaDiaria ? Math.max(0, metaVentaDiaria - totalVentas) : 0;
  // 0 = lunes, igual que la base (isodow − 1).
  const diaHoy = DIAS_SEMANA[(new Date(`${hoyLima()}T12:00:00`).getDay() + 6) % 7]!;
  const explicacionMeta = parametros ? explicarMeta(parametros, diaHoy, soles0, ubicacionNombre) : "";
  // «Al ritmo de hoy»: la hora de ahora se lee DESPUÉS de montar (en el servidor sería otra y React avisaría de la
  // diferencia) y se renueva cada minuto. Todo en hora de Lima.
  const [ahora, setAhora] = useState<string | null>(null);
  useEffect(() => {
    const leer = () => setAhora(diaYHoraLima(new Date().toISOString()).hora);
    leer();
    const id = window.setInterval(leer, 60_000);
    return () => window.clearInterval(id);
  }, []);
  const alCierre =
    ahora && metaVentaDiaria !== null
      ? proyeccionAlCierre({ vendido: totalVentas, abrioMin: minutosLima(diaYHoraLima(caja.abiertaEn).hora) ?? 0, ahoraMin: minutosLima(ahora) ?? 0, cierreMin: minutosLima(horaCierre) })
      : null;
  // El fondo que pide el cierre y por qué: la campaña que lo sube, o lo normal de la tienda.
  const fondoCierre =
    parametros && parametros.fondo !== null
      ? {
          monto: parametros.fondo,
          motivo:
            parametros.fondoBase !== null && parametros.fondo > parametros.fondoBase
              ? `Por ${parametros.campanas.filter((c) => c.fondo === parametros.fondo).map((c) => c.nombre).join(" y ")}`
              : `Lo normal de ${ubicacionNombre}`,
        }
      : null;

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

  const todosLosEventos: EventoCaja[] = [
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
      // Hora de Lima, no la del navegador: las ventas de la misma lista ya llegan en hora de Lima.
      const horaLima = diaYHoraLima(m.creadoEn).hora;
      return {
        id: m.id,
        minutos: minutosDeHora(horaLima),
        horaTexto: horaLima,
        icono: m.tipo,
        titulo: m.motivo,
        meta: m.registradoPorNombre ?? "—",
        monto: m.tipo === "egreso" ? -m.monto : m.monto,
        color: m.tipo === "egreso" ? "var(--color-rojo)" : "var(--color-verde)",
      };
    }),
  ].sort((a, b) => b.minutos - a.minutos);
  // La tarjeta muestra las más recientes; «Ver todo» abre el resto sin alargar el tablero.
  const eventos = todosLosEventos.slice(0, LIMITE_TARJETA);

  // Hasta 14: el gráfico solo muestra los 7 más viejos cuando su tarjeta es lo bastante ancha (TendenciaCierres).
  const cierresUbicacion = cierresRecientes
    .filter((c) => c.ubicacionId === caja.ubicacionId)
    .slice(0, 14)
    .reverse();
  const maxCierre = Math.max(...cierresUbicacion.map((c) => c.montoCierreSistema), 0.0001);

  return (
    <div className="pb-8">
      {/* La disposición decide por el ancho del PROPIO tablero (`@container`), no por el de la ventana: la barra
          lateral y los márgenes se comen ~350 px, así que la misma pantalla da 700 px de tablero o 1500. Los
          modales van FUERA de este contenedor: `container-type` aplica contención de layout y ataría su `fixed`
          al tablero en vez de a la pantalla. Umbrales: 560/800 (columnas de KPI), 720 (encabezado en dos zonas),
          900 (dos columnas: la dona necesita ~440 px de tarjeta para tener anillo y leyenda lado a lado) y 1400 (encabezado en tres zonas y cuerpo en tres columnas, con "Movimientos" como
          riel alto a la derecha). */}
      <div className="@container space-y-4">
        {/* ---------- Encabezado ---------- */}
        {/* La misma cabecera de Cambios y Devoluciones (`EncabezadoPagina`, Atelier): dónde y cuándo arriba con el
            hilo, el título grande, y a la derecha la pieza viva de la pantalla — aquí el reloj del turno. Las acciones
            (ingreso/egreso y cerrar) bajan solas bajo la frase porque la derecha es del reloj; el estado de la cola offline,
            sobre el reloj. La hora corre en el reloj, así que la línea de arriba dice solo el día. Sin avatar: las
            iniciales no aportaban nada. */}
        <div className="pb-3">
          <EncabezadoPagina
            sede={ubicacionNombre}
            titulo="Caja"
            subtitulo={`Turno de ${personaNombre} · ${personaRol === "lider" ? "Líder de equipo" : "Integrante"}`}
            sinHora
            acciones={
              <>
                <Boton peso="discreto" onClick={() => setModal("movimiento")}>
                  Registrar movimiento
                </Boton>
                {/* D-13: solo el líder cierra la caja. El candado real está en `cerrar_caja`
                    (20260921110000); acá solo se decide qué se muestra. A quien no es líder no se le
                    deja un hueco mudo: se le dice quién la cierra. */}
                {puedeCerrar ? (
                  <Boton peso="primario" onClick={() => setModal("cerrar")}>
                    Cerrar caja
                  </Boton>
                ) : (
                  <p className="text-xs text-tinta/60">La caja la cierra un líder de equipo o la terminal de ventas.</p>
                )}
              </>
            }
          >
            {/* El estado de la cola offline vive sobre el reloj: las dos piezas «en vivo» juntas, y en la
                izquierda quedan solo las acciones. Entre las dos miden lo mismo que la columna de la izquierda
                (~170 px), así que la cabecera no crece. */}
            <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
              <EstadoSync pendientes={cola.length} />
              <RelojDeCaja abiertaEn={caja.abiertaEn} />
            </div>
          </EncabezadoPagina>
        </div>

        {/* ---------- Turno largo: una caja que pasó la noche sin cerrarse (auditoría de /caja, #3) ---------- */}
        <AvisoTurnoLargo abiertaEn={caja.abiertaEn} esLider={personaRol === "lider"} />

        {/* ---------- Meta de hoy y lo que pedirá el cierre (ADR-0195 F1; spike docs/maquetas/finanzas-2026-09/, vista Caja) ----------
            Solo si la ubicación tiene meta. La barra va en tinta (el rojo de la pantalla no se gasta en un avance). «Al cerrar»
            lo ve quien puede cerrar: el esperado del cajón es de quien cierra, como `fn_esperado_caja`. */}
        {metaVentaDiaria !== null && metaPct !== null && (
          <div className={`grid gap-3 ${puedeCerrar && fondoCierre ? "@[900px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : ""}`}>
            <div className="card-cayla anim-sube flex flex-col p-5" style={{ "--i": 2 } as CSSProperties}>
              <h2 className="font-display text-[22px] leading-tight text-tinta">Meta de hoy · {soles0(metaVentaDiaria)}</h2>
              <p className="mt-1 text-[13px] text-taupe">{explicacionMeta}</p>
              <div className="mb-1 mt-4 h-3 overflow-hidden rounded-full bg-sand">
                <div className="h-full rounded-full bg-tinta transition-[width] duration-1000 [transition-timing-function:var(--ease-cayla)]" style={{ width: `${metaPct}%` }} />
              </div>
              <dl className="mt-auto grid grid-cols-3 gap-4 pt-4">
                <DatoMeta etiqueta="Llevas" valor={soles0(totalVentas)} />
                <DatoMeta etiqueta="Te faltan" valor={faltaMeta > 0 ? soles0(faltaMeta) : "—"} detalle={faltaMeta > 0 ? undefined : <b className="font-semibold text-verde-profundo">Meta cumplida.</b>} />
                {alCierre !== null ? (
                  <DatoMeta
                    etiqueta="Al ritmo de hoy cierras en"
                    valor={soles0(alCierre)}
                    detalle={
                      alCierre >= metaVentaDiaria
                        ? "Llegas a la meta."
                        : `Te quedarían ${soles0(metaVentaDiaria - alCierre)} por vender. Son las ${ahora}; cierras a las ${horaCierre}.`
                    }
                  />
                ) : (
                  <DatoMeta etiqueta="Avance" valor={`${metaPct} %`} detalle="de la meta de hoy" />
                )}
              </dl>
            </div>
            {puedeCerrar && fondoCierre && (
              <div className="card-cayla anim-sube p-5" style={{ "--i": 3 } as CSSProperties}>
                <h2 className="font-display text-[22px] leading-tight text-tinta">Al cerrar</h2>
                <p className="mt-1 text-[13px] text-taupe">Lo que el cierre te va a pedir.</p>
                <dl className="mt-3 text-[13px] text-tinta">
                  <div className="flex items-baseline justify-between gap-3 border-t border-sand py-2.5">
                    <dt>Debería haber en el cajón</dt>
                    <dd className="whitespace-nowrap font-semibold tabular-nums">{esperadoCajon === null ? "—" : soles0(esperadoCajon)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-sand py-2.5">
                    <dt>Deja para el próximo turno</dt>
                    <dd className="whitespace-nowrap font-semibold tabular-nums">{soles0(fondoCierre.monto)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-sand py-2.5">
                    <dt>Lo demás se traslada</dt>
                    <dd className="text-right text-[12px] text-taupe">a la caja fuerte, al banco o al líder</dd>
                  </div>
                </dl>
                <p className="mt-1 text-[12.5px] text-taupe">
                  {fondoCierre.motivo}. El fondo normal lo pone el líder en Configuración ▸ Tiendas y caja; cada campaña puede subirlo.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ---------- KPIs ---------- */}
        <div className="grid grid-cols-2 gap-3 @[560px]:grid-cols-3 @[800px]:grid-cols-5">
          <TarjetaKpi indice={3} etiqueta="Apertura" valor={caja.montoApertura} icono={<Unlock size={15} aria-hidden />} colorBorde="var(--color-taupe)" />
          <TarjetaKpi
            indice={4}
            etiqueta="Ventas efectivo"
            valor={resumen.ventasEfectivo}
            icono={<Banknote size={15} aria-hidden />}
            colorBorde="var(--color-metodo-efectivo)"
            sparkline={series.porHora.map((p) => p.efectivo)}
          />
          <TarjetaKpi
            indice={5}
            etiqueta="Ventas otro método"
            valor={resumen.ventasOtros}
            icono={<CreditCard size={15} aria-hidden />}
            colorBorde="var(--color-taupe)"
            sparkline={series.porHora.map((p) => p.otros)}
          />
          <TarjetaKpi indice={6} etiqueta="Entradas" valor={resumen.ingresos} icono={<CirclePlus size={15} aria-hidden />} colorBorde="var(--color-verde)" />
          <TarjetaKpi indice={7} etiqueta="Salidas" valor={resumen.egresos} icono={<CircleMinus size={15} aria-hidden />} colorBorde="var(--color-rojo)" />
        </div>

        {/* ---------- Cuerpo ---------- */}
        {/* Una sola cuadrícula para las cuatro tarjetas. Ancho medio (900–1400): dos columnas para la dona y el
            ritmo, y debajo el historial y los movimientos a ancho completo (una tarjeta más alta que su vecina
            en una fila de dos columnas se estira y deja la otra medio vacía; a ancho completo el historial gana
            días y los movimientos se parten en dos columnas). Ancho de sobra (≥ 1400): tres columnas, con
            "Movimientos" como riel alto a la derecha —su alto natural coincide con las dos filas de la
            izquierda— y el historial ocupando dos columnas. En angosto, una columna: lo vivo antes que lo viejo. */}
        <div className="grid gap-3 @[900px]:grid-cols-2 @[1400px]:grid-cols-3">
          <div className="card-cayla anim-sube flex flex-col p-5" style={{ "--i": 5 } as CSSProperties}>
            <p className="text-sm font-bold text-tinta">Métodos de pago</p>
            <p className="mb-3.5 text-xs text-tinta/50">Distribución de ventas de esta caja</p>
            {segmentosDona.length === 0 ? (
              <p className="py-6 text-center text-xs text-tinta/50">Sin ventas registradas todavía.</p>
            ) : (
              <TablaOGrafico segmentos={segmentosDona} total={totalDona} />
            )}
          </div>

          <div className="card-cayla anim-sube flex flex-col p-5" style={{ "--i": 6 } as CSSProperties}>
            <p className="text-sm font-bold text-tinta">Ritmo del día</p>
            <p className="mb-3.5 text-xs text-tinta/50">Cada punto es una venta, desde que abrió la caja</p>
            <RitmoDelDia ventas={ventasHoy} abiertaEn={caja.abiertaEn} idsNuevos={idsNuevos} />
          </div>

          <div className="card-cayla anim-sube order-last flex flex-col p-5 @[900px]:order-none @[900px]:col-span-2" style={{ "--i": 8 } as CSSProperties}>
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
          <div className="card-cayla anim-sube @container flex flex-col p-5 @[900px]:col-span-2 @[1400px]:col-span-1 @[1400px]:col-start-3 @[1400px]:row-start-1 @[1400px]:row-span-2" style={{ "--i": 7 } as CSSProperties}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-tinta">Movimientos recientes</p>
                <p className="mb-1.5 text-xs text-tinta/50">Últimos registros de esta caja</p>
              </div>
              {todosLosEventos.length > 0 && (
                <button
                  type="button"
                  onClick={() => setModal("todos")}
                  className="label-cayla shrink-0 rounded-md px-2 py-1 text-[11px] text-taupe-profundo transition-colors hover:bg-sand/40 hover:text-tinta"
                >
                  Ver todo{todosLosEventos.length > LIMITE_TARJETA ? ` (${todosLosEventos.length})` : ""}
                </button>
              )}
            </div>
            {eventos.length === 0 ? (
              <p className="py-6 text-center text-xs text-tinta/50">Todavía no hay movimientos.</p>
            ) : (
              <div className="divide-y divide-sand @[640px]:columns-2 @[640px]:gap-x-10">
                {eventos.map((e) => (
                  <FilaMovimientoCaja key={e.id} e={e} nuevo={idsNuevos.has(e.id)} onAbrirVenta={setVentaAbiertaId} />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {modal === "movimiento" && <MovimientoCajaModal cajaId={caja.id} esLider={personaRol === "lider"} onClose={() => setModal(null)} />}
      {modal === "cerrar" && <CerrarCajaModalV2 cajaId={caja.id} cola={cola} fondo={fondoCierre} ubicacionId={caja.ubicacionId} onClose={() => setModal(null)} />}
      {modal === "todos" && (
        <MovimientosCajaModal
          eventos={todosLosEventos}
          idsNuevos={idsNuevos}
          ubicacionNombre={ubicacionNombre}
          onAbrirVenta={setVentaAbiertaId}
          onClose={() => setModal(null)}
        />
      )}
      {ventaAbiertaId && (
        <DetalleVentaModal
          ventaId={ventaAbiertaId}
          vendedor={ventasHoy.find((v) => v.ventaId === ventaAbiertaId)?.vendedor ?? null}
          ubicacionNombre={ubicacionNombre}
          onClose={() => setVentaAbiertaId(null)}
        />
      )}
    </div>
  );
}

// Hora de Lima, la de las tiendas: la misma que dice `FechaHoraLima` en las demás cabeceras.
const FORMATO_HORA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
const FORMATO_HORA_CORTA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });

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

/** Franja que avisa de una caja abierta de más de ~18 h: casi seguro se quedó sin cerrar y el arqueo de cada día
 *  se está perdiendo. A quien no cierra le dice a quién avisar. */
function AvisoTurnoLargo({ abiertaEn, esLider }: { abiertaEn: string; esLider: boolean }) {
  const ahora = useAhora(60_000);
  if (!ahora) return null;
  const minutos = Math.floor((ahora.getTime() - new Date(abiertaEn).getTime()) / 60_000);
  if (!turnoLargo(minutos)) return null;
  return (
    <div role="status" className="card-cayla border-l-2 border-l-rojo px-5 py-3 text-sm text-tinta">
      Esta caja lleva <b className="font-medium">{formatoDuracion(minutos)}</b> abierta.{" "}
      {esLider ? "Ciérrala para que el arqueo quede día por día." : "Avisa a un líder de equipo para que la cierre."}
    </div>
  );
}

/** Reloj del turno (Atelier): la hora que corre y, debajo, el turno como un hilo que se va cosiendo desde la
 *  apertura — cada marca es una hora — con cuánto lleva abierta la caja. Es la pieza viva de la cabecera, a la
 *  derecha del título. La tarjeta es siempre la misma (no se remonta al llegar la hora): así su entrada no se
 *  repite. Los dígitos ruedan uno a uno (`Digitos`); el hilo y el punto avanzan con una transición de 1 s lineal,
 *  igual al intervalo del reloj, para que se deslicen en vez de saltar. */
function RelojDeCaja({ abiertaEn }: { abiertaEn: string }) {
  const ahora = useAhora(1000);
  const tarjeta =
    "anim-sube w-full rounded-[20px] bg-papel/70 px-6 py-[18px] shadow-[0_22px_44px_-30px_rgba(80,50,20,0.5)] ring-1 ring-tinta/[0.07] backdrop-blur-sm sm:w-auto sm:min-w-[300px]";

  // Nace vacío (servidor y primer render del cliente) y reserva el alto para que el encabezado no salte.
  if (!ahora) return <div aria-hidden className={`${tarjeta} h-[132px]`} style={{ "--i": 1 } as CSSProperties} />;

  const p = Object.fromEntries(FORMATO_HORA.formatToParts(ahora).map((x) => [x.type, x.value]));
  const h = p.hour ?? "";
  const m = p.minute ?? "";
  const s = p.second ?? "";
  const periodo = p.dayPeriod ?? "";
  const desde = FORMATO_HORA_CORTA.format(new Date(abiertaEn));
  const lleva = duracionAbierta(abiertaEn, ahora.getTime());
  const { horas, fraccion } = escalaTurno((ahora.getTime() - new Date(abiertaEn).getTime()) / 60_000);
  const avance = `${(fraccion * 100).toFixed(2)}%`;
  return (
    <div className={tarjeta} style={{ "--i": 1 } as CSSProperties}>
      <div className="font-display flex items-baseline gap-2 lining-nums tabular-nums text-tinta">
        <span aria-hidden className="text-[52px] leading-none">
          <Digitos texto={h} />:<Digitos texto={m} />
        </span>
        <span aria-hidden className="text-[22px] leading-none text-taupe-profundo">
          :<Digitos texto={s} />
        </span>
        <span aria-hidden className="label-cayla ml-0.5 text-[11px] text-tinta/55">
          {periodo}
        </span>
        <span className="sr-only">{`${h}:${m}:${s} ${periodo}`}</span>
      </div>
      <div aria-hidden className="relative mb-2 mt-4 h-px bg-sand">
        {Array.from({ length: horas + 1 }, (_, i) => (
          <i key={i} className="absolute -top-[3px] h-[7px] w-px bg-tinta/25" style={{ left: `${(i / horas) * 100}%` }} />
        ))}
        <div className="hilo-dibuja absolute -top-px left-0 h-[3px] rounded-full bg-taupe transition-[width] duration-1000 ease-linear" style={{ width: avance }} />
        <span className="absolute -top-1 h-[9px] w-[9px] -translate-x-1/2 rounded-full bg-tinta transition-[left] duration-1000 ease-linear" style={{ left: avance }} />
      </div>
      <p className="flex justify-between gap-6 text-xs text-tinta/65">
        <span>
          Abrió <b className="font-medium text-tinta/85">{desde}</b>
        </span>
        <span>
          Lleva{" "}
          <b key={lleva} className="anim-asentar inline-block font-medium text-tinta/85">
            {lleva}
          </b>
        </span>
      </p>
    </div>
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
 * (decisión del 2026-09-18, ADR-0116). Sale de `ventasHoy`, sin consultas nuevas.
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
  indice,
  etiqueta,
  valor,
  icono,
  colorBorde,
  sparkline,
}: {
  /** Su turno en la entrada escalonada (`anim-sube`): cada tarjeta sube 70 ms después de la anterior. */
  indice: number;
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
    <div className="card-cayla alza-cayla anim-sube relative overflow-hidden p-4" style={{ borderLeft: `3px solid ${colorBorde}`, "--i": indice } as CSSProperties}>
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

/** «S/ 1,700»: las cifras de la tarjeta de meta van redondas (spike de Finanzas). */
function soles0(n: number): string {
  return `S/ ${Math.round(n).toLocaleString("es-PE")}`;
}

function DatoMeta({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="label-cayla text-[11px] text-taupe">{etiqueta}</dt>
      <dd className="font-display mt-1 text-[26px] leading-none tabular-nums text-tinta">{valor}</dd>
      {detalle && <dd className="mt-1.5 text-[12px] text-taupe">{detalle}</dd>}
    </div>
  );
}
