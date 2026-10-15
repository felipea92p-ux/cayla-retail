"use client";

import { useState, type ReactNode } from "react";
import { BarrasTiempo } from "@/components/ui/BarrasTiempo";
import { Flag, FunnelX, Receipt } from "lucide-react";
import { ANCHO_HOJA, Modal } from "@/components/ui/Modal";
import { getDetalleCierre, type DetalleCierre, type EventoCaja } from "@/app/actions/caja";
import type { CierreCaja } from "@/lib/caja";
import { etiquetaDestino } from "@/lib/caja-cierre-reglas";
import type { MetodoCobrado } from "@/lib/caja-tablero-reglas";
import { cascadaEfectivo, diaDelTurno, duracionTurno, escalaDiferencia, estadoCierre, quienAtendio, rutaDelEfectivo, type MarcaDelDia } from "@/lib/historial-cierres-reglas";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { filaDeMovimiento } from "@/lib/caja-movimiento-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { TituloSeccion } from "@/components/ui/TituloSeccion";

function money(n: number) {
  return (n >= 0 ? "S/\u00a0" : "-S/\u00a0") + Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hora(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function diaLargo(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}

/** El título y la bajada de la hoja de un cierre (los usa tanto el modal suelto como el historial, que cambia de vista dentro de su hoja). */
export const tituloDelCierre = (c: CierreCaja) => `Cierre · ${c.ubicacionNombre}`;
export function bajadaDelCierre(c: CierreCaja) {
  const duracion = duracionTurno(c.abiertaEn, c.cerradaEn);
  const quien = quienAtendio(c);
  const personas = quien.mismaPersona ? `atendió ${quien.nombre}` : [c.abiertaPorNombre && `abrió ${c.abiertaPorNombre}`, c.cerradaPorNombre && `cerró ${c.cerradaPorNombre}`].filter(Boolean).join(", ");
  return [diaLargo(c.cerradaEn), `${hora(c.abiertaEn)} – ${hora(c.cerradaEn)}${duracion ? ` (${duracion})` : ""}`, personas].filter(Boolean).join(" · ");
}

/**
 * Los datos del detalle de un cierre, pedidos al hacer clic (mismo criterio que el resto de la app: el evento dispara el trabajo async,
 * nunca el render) y guardados por cierre: volver a abrir el mismo no repite la consulta. `abrir(cierre)` lo dispara y `cerrar()` lo suelta.
 */
export function useDatosDetalleCierre() {
  const [abierto, setAbierto] = useState<CierreCaja | null>(null);
  const [detalles, setDetalles] = useState<Record<string, DetalleCierre>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  async function abrir(cierre: CierreCaja) {
    setAbierto(cierre);
    if (detalles[cierre.id]) return;
    setCargando(true);
    setError(false);
    try {
      const detalle = await getDetalleCierre(cierre.id);
      setDetalles((prev) => ({ ...prev, [cierre.id]: detalle }));
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }

  return { abierto, abrir, cerrar: () => setAbierto(null), detalle: abierto ? (detalles[abierto.id] ?? null) : null, cargando, error };
}

/** Abrir el detalle de un cierre desde una lista que no tiene hoja propia (la página `/caja/historial`): `modal` va en el JSX, `abrir(cierre)` lo dispara. */
export function useDetalleCierre() {
  const { abierto, abrir, cerrar, detalle, cargando, error } = useDatosDetalleCierre();
  const modal = abierto ? <DetalleCierreModal cierre={abierto} detalle={detalle} cargando={cargando} error={error} onClose={cerrar} /> : null;
  return { abrir, modal };
}

/** El ancho de la hoja con el detalle: deja las tres tarjetas del cierre en una fila (en celular y tablet pasan a una sola columna). */
export const ANCHO_DETALLE_CIERRE = ANCHO_HOJA.ancha;

type FiltroFlujo = "todo" | "ventas" | "cajon";
const FILTROS: [FiltroFlujo, string][] = [
  ["todo", "Todo"],
  ["ventas", "Ventas"],
  ["cajon", "Mueve el cajón"],
];
// Lo que saca o mete plata del cajón por fuera de una venta; el resto (ventas y cambios) es «Ventas».
const esDelCajon = (e: EventoCaja) => e.tipo === "movimiento" || e.tipo === "devolucion";

// El color de cada forma de pago es el de siempre (tokens `--color-metodo-*`, los mismos de la dona de Caja y del Historial de ventas).
const COLOR_MEDIO: Record<MetodoCobrado["clave"], string> = {
  efectivo: "var(--color-metodo-efectivo)",
  tarjeta: "var(--color-metodo-tarjeta)",
  yape: "var(--color-metodo-yape)",
  transferencia: "var(--color-metodo-transferencia)",
  qr: "var(--color-metodo-qr)",
  otro: "var(--color-taupe)",
};
const COLOR_ESTADO = { cuadro: "var(--color-verde)", sobro: "var(--color-ambar)", falto: "var(--color-rojo)" } as const;
const TONO_ESTADO: Record<keyof typeof COLOR_ESTADO, TonoChip> = { cuadro: "verde", sobro: "ambar", falto: "rojo" };
const TEXTO_ESTADO = (estado: keyof typeof COLOR_ESTADO, dif: number) => (estado === "cuadro" ? "Cuadró" : `${estado === "sobro" ? "Sobró" : "Faltó"} ${money(Math.abs(dif))}`);

/** El modal de un cierre cuando no hay una hoja de atrás a la que volver (la página `/caja/historial`). */
export function DetalleCierreModal({ cierre, detalle, cargando, error, onClose }: { cierre: CierreCaja; detalle: DetalleCierre | null; cargando: boolean; error: boolean; onClose: () => void }) {
  return (
    <Modal conCerrar titulo={tituloDelCierre(cierre)} subtitulo={bajadaDelCierre(cierre)} onClose={onClose} tamano="ancha">
      <DetalleCierreContenido cierre={cierre} detalle={detalle} cargando={cargando} error={error} />
    </Modal>
  );
}

/**
 * Lo de adentro de la hoja de un cierre, «La línea del día» (Felipe 2026-10-12, propuesta A de
 * `docs/maquetas/historial-cierres-visual-2026-10/`): el veredicto con su escala → cómo fue el día (ventas por hora y marcas) → tres
 * tarjetas, cada una con su gráfico (qué se cobró, cómo cuadró el efectivo, a dónde fue) → lo que pasó en el turno, en una línea con
 * puntos. Los cálculos están en `lib/historial-cierres-reglas.ts`; aquí solo se dibuja.
 */
export function DetalleCierreContenido({ cierre, detalle, cargando, error }: { cierre: CierreCaja; detalle: DetalleCierre | null; cargando: boolean; error: boolean }) {
  const [filtro, setFiltro] = useState<FiltroFlujo>("todo");
  const estado = estadoCierre(cierre.diferencia);
  const ruta = rutaDelEfectivo(cierre);
  const eventos = detalle?.eventos ?? null;
  const dia = eventos ? diaDelTurno(cierre, eventos) : null;
  const efectivoVendido = detalle?.cobros.medios.find((m) => m.clave === "efectivo")?.monto ?? 0;
  const cascada = detalle ? cascadaEfectivo(cierre, efectivoVendido) : null;
  const visibles = eventos?.filter((e) => filtro === "todo" || (filtro === "cajon") === esDelCajon(e)) ?? [];
  const escala = escalaDiferencia(cierre.diferencia);
  const esperando = !detalle && !error;

  return (
    <div data-guia="caja-historial.detalle" className="@container mt-1 space-y-3.5">
      {/* Veredicto: lo primero que se quiere saber de un cierre es si cuadró, y qué tan lejos quedó. */}
      <div className="grid items-center gap-x-8 gap-y-3 rounded-2xl bg-tinta px-5 py-4 text-crema @2xl:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <p className="font-display text-[30px] leading-tight @2xl:text-[34px]">{estado === "cuadro" ? "Cuadró, sin diferencia" : `${estado === "sobro" ? "Sobró" : "Faltó"} ${money(Math.abs(cierre.diferencia))}`}</p>
          <p className="mt-1 text-[13px] text-crema/70">
            El sistema esperaba {money(cierre.montoCierreSistema)}
            {estado === "cuadro" ? " y se contó lo mismo." : ` y se contó ${money(cierre.montoCierreReal)}.`}
          </p>
          <div className="relative mt-4 h-9" role="img" aria-label={estado === "cuadro" ? "Cuadró: la diferencia es cero" : `${TEXTO_ESTADO(estado, cierre.diferencia)} en una escala de ${money(escala.rango)} a cada lado`}>
            <div
              className="absolute inset-x-0 top-[13px] h-2 rounded-full"
              style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--color-rojo) 55%, transparent) 0 49.5%, var(--color-verde) 49.5% 50.5%, color-mix(in srgb, var(--color-ambar) 60%, transparent) 50.5% 100%)" }}
            />
            <span className="absolute top-[6px] h-[22px] w-[22px] -translate-x-1/2 rounded-full border-4 border-tinta bg-crema" style={{ left: `${escala.pos}%` }} />
            <span className="absolute left-0 top-6 text-[11px] text-crema/70">falta {money(escala.rango)}</span>
            <span className="absolute left-1/2 top-6 -translate-x-1/2 text-[11px] text-crema/70">cuadra</span>
            <span className="absolute right-0 top-6 text-[11px] text-crema/70">sobra {money(escala.rango)}</span>
          </div>
        </div>
        <div className="@2xl:text-right">
          <p className="font-display text-[40px] leading-none tabular-nums @2xl:text-[44px]">{money(cierre.montoCierreReal)}</p>
          <p className="label-cayla mt-1.5 text-[10px] text-crema/70">Contado</p>
        </div>
      </div>

      {cierre.motivoDiferenciaApertura && cierre.aperturaEsperada !== null && (
        <AvisoDelCierre>
          Abrió con {money(cierre.montoApertura)} y el cierre anterior había dejado {money(cierre.aperturaEsperada)}: «{cierre.motivoDiferenciaApertura}».
        </AvisoDelCierre>
      )}

      {error && (
        <Aviso tono="error">No se pudo cargar el detalle. Vuelve e intenta de nuevo.</Aviso>
      )}

      <Tarjeta
        titulo="Cómo fue el día"
        nota={
          <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            <span>ventas por hora</span>
            <Leyenda color="var(--color-rojo)" texto="sale plata" />
            <Leyenda color="var(--color-pizarra)" texto="cambio" />
            <span className="inline-flex items-center gap-1">
              <Flag className="h-3 w-3 fill-tinta text-tinta" aria-hidden />
              abre y cierra
            </span>
          </span>
        }
      >
        {dia ? <DiaDelTurno dia={dia} /> : esperando ? <p className="py-8 text-center text-sm text-tinta/60">{cargando ? "Cargando el día de esta caja…" : "…"}</p> : null}
      </Tarjeta>

      <div className="grid gap-3.5 @4xl:grid-cols-3">
        <Tarjeta titulo="Qué se cobró" nota={detalle && detalle.cobros.total > 0 ? money(detalle.cobros.total) : undefined}>
          {detalle ? <CobrosPorMedio cobros={detalle.cobros} /> : esperando ? <p className="py-8 text-center text-sm text-tinta/60">Cargando lo cobrado…</p> : null}
        </Tarjeta>

        <Tarjeta titulo="Cómo cuadró el efectivo">
          {cascada ? (
            <>
              <CascadaDelEfectivo c={cascada} estado={estado} />
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-sand pt-2.5 text-sm">
                <span>Diferencia</span>
                <Chip tono={TONO_ESTADO[estado]} versalitas={false}>
                  {TEXTO_ESTADO(estado, cierre.diferencia)}
                </Chip>
              </div>
            </>
          ) : esperando ? (
            <p className="py-8 text-center text-sm text-tinta/60">Cargando el efectivo…</p>
          ) : null}
        </Tarjeta>

        <Tarjeta titulo="A dónde fue el efectivo" nota={ruta ? `de ${money(ruta.total)}` : undefined}>
          {ruta ? (
            <>
              {/* La barra es `<BarraApilada>` (ADR-0358): lo trasladado contra lo que quedó, medido sobre el 100 %. */}
              <BarraApilada
                className="mb-2.5 mt-1"
                alto={12}
                total={100}
                sinEntrada
                formato={(n) => `${n} %`}
                etiqueta={`${ruta.pctTrasladado} % trasladado, ${ruta.pctQuedo} % quedó en el cajón`}
                segmentos={[
                  { clave: "trasladado", nombre: "Trasladado", valor: ruta.pctTrasladado, clase: "bg-rojo" },
                  { clave: "quedo", nombre: "Quedó en el cajón", valor: ruta.pctQuedo, clase: "bg-verde" },
                ]}
              />
              {cierre.traslados.map((t, i) => (
                <Linea
                  key={i}
                  k={
                    <>
                      <span className="mr-2 inline-block h-2 w-2 rounded-full bg-rojo" aria-hidden />
                      {etiquetaDestino(t.destino)}
                    </>
                  }
                  sub={t.referencia ?? undefined}
                  v={money(t.monto)}
                />
              ))}
              <Linea
                k={
                  <>
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-verde" aria-hidden />
                    Quedó en el cajón
                  </>
                }
                v={money(ruta.quedo)}
                fuerte
              />
              {cierre.fondoRequerido !== null && cierre.fondoRequerido > 0 && (
                <div className="mt-2.5">
                  <p className="mb-1.5 text-xs text-tinta/60">Fondo que pedía el día: {money(cierre.fondoRequerido)}</p>
                  <BarraApilada
                    alto={8}
                    total={cierre.fondoRequerido}
                    sinEntrada
                    formato={money}
                    etiqueta={`Quedó ${money(ruta.quedo)} de ${money(cierre.fondoRequerido)} que pedía el día`}
                    segmentos={[{ clave: "quedo", nombre: "Quedó en el cajón", valor: Math.min(ruta.quedo, cierre.fondoRequerido), clase: "bg-verde" }]}
                  />
                </div>
              )}
              {cierre.fondoRequerido !== null && ruta.quedo + 0.004 < cierre.fondoRequerido && (
                <AvisoDelCierre>Dejó menos del fondo: el día pedía {money(cierre.fondoRequerido)}.</AvisoDelCierre>
              )}
            </>
          ) : (
            <p className="py-6 text-sm text-tinta/60">Este cierre es anterior al registro de traslados: no dice a dónde fue el efectivo.</p>
          )}
        </Tarjeta>
      </div>

      <Tarjeta titulo="Lo que pasó en el turno" nota={eventos ? `${visibles.length} ${visibles.length === 1 ? "movimiento" : "movimientos"}` : undefined}>
        <div role="group" aria-label="Filtrar el flujo" className="mb-2 flex flex-wrap gap-1.5">
          {FILTROS.map(([clave, texto]) => (
            <button key={clave} type="button" aria-pressed={filtro === clave} onClick={() => setFiltro(clave)} className="pildora-cayla">
              {texto}
            </button>
          ))}
        </div>
        {cargando && <p className="py-6 text-center text-sm text-tinta/60">Cargando el flujo de esta caja…</p>}
        {eventos &&
          (visibles.length === 0 ? (
            eventos.length === 0 ? (
              <Vacio tamano="chico" icono={<Receipt />}>
                Esta caja no tuvo ventas ni movimientos: solo apertura y cierre.
              </Vacio>
            ) : (
              <Vacio tamano="chico" icono={<FunnelX />} accion={{ texto: "Ver todo", onClick: () => setFiltro("todo") }}>
                Nada de este tipo en el turno.
              </Vacio>
            )
          ) : (
            <div className="scroll-cayla max-h-[46vh] overflow-y-auto pr-2">
              {/* La línea del día: un hilo con un punto por cada hecho, del color de lo que hizo. */}
              <div className="relative pl-6 before:absolute before:bottom-3 before:left-2 before:top-3 before:w-0.5 before:bg-sand">
                {visibles.map((e) => (
                  <FilaEvento key={`${e.tipo}-${e.id}`} evento={e} />
                ))}
              </div>
            </div>
          ))}
      </Tarjeta>

      {cierre.nota && <p className="text-xs italic text-tinta/65">{/* unificar-fijo: es la nota escrita al cerrar, no un vacío */}Nota del cierre: {cierre.nota}</p>}
    </div>
  );
}

/** Una tarjeta del detalle: su título de bloque (`TituloSeccion`, ADR-0358) con una nota corta a la derecha. */
function Tarjeta({ titulo, nota, children }: { titulo: string; nota?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="min-w-0 rounded-2xl border border-sand bg-papel px-[18px] py-4">
      <TituloSeccion nivel={3} dato={nota} className="mb-2.5">
        {titulo}
      </TituloSeccion>
      {children}
    </section>
  );
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
      {texto}
    </span>
  );
}

/** Una línea de «concepto … monto» con su hilo de arena arriba (la primera de un bloque no lo lleva). */
function Linea({ k, sub, v, fuerte = false }: { k: ReactNode; sub?: string; v: ReactNode; fuerte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 border-t border-sand py-1.5 text-[13.5px] first:border-t-0 ${fuerte ? "font-semibold text-tinta" : "text-tinta/80"}`}>
      <p className="min-w-0">
        {k}
        {sub && <span className="block text-xs font-normal text-tinta/60">{sub}</span>}
      </p>
      <p className="whitespace-nowrap tabular-nums">{v}</p>
    </div>
  );
}

const MARCA: Record<Exclude<MarcaDelDia["tipo"], "apertura" | "cierre">, string> = { sale: "var(--color-rojo)", entra: "var(--color-verde)", cambio: "var(--color-pizarra)" };

/** Las ventas de cada hora del turno en barras, con las marcas del día arriba (se abre, se cierra, sale plata, un cambio). */
function DiaDelTurno({ dia }: { dia: ReturnType<typeof diaDelTurno> }) {
  const resumen = dia.horas.filter((h) => h.total > 0).map((h) => `${h.etiqueta}: ${money(h.total)}`).join(", ");
  if (dia.ventas === 0) {
    return (
      <Vacio tamano="chico" icono={<Receipt />}>
        Esta caja no cobró ventas.
      </Vacio>
    );
  }
  return (
    <>
      <div role="img" aria-label={`Ventas por hora. ${resumen}`}>
        <div className="relative h-6" aria-hidden>
          <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-sand" />
          {dia.marcas.map((m, i) =>
            m.tipo === "apertura" || m.tipo === "cierre" ? (
              <Flag key={i} className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 fill-tinta text-tinta ${m.tipo === "cierre" ? "-translate-x-full" : ""}`} style={{ left: `${m.pos * 100}%` }} />
            ) : (
              <span key={i} className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-papel" style={{ left: `${m.pos * 100}%`, background: MARCA[m.tipo] }} />
            ),
          )}
        </div>
        {/* Las barras por tiempo del sistema (ronda 14): el pico en tinta con su monto; cada hora dice lo suyo al pasar el mouse. */}
        <BarrasTiempo
          className="mt-5"
          alto={112}
          decorativa
          barras={dia.horas.map((h, i) => ({ clave: String(h.hora), valor: h.total, etiqueta: i % 2 === 0 ? h.etiqueta : "", tip: `${h.etiqueta}: ${money(h.total)}`, cifra: money(h.total) }))}
          destacada={dia.horas.find((h) => h.pico) ? String(dia.horas.find((h) => h.pico)!.hora) : null}
          etiqueta="Ventas por hora"
        />
      </div>
      <dl className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <Cifra n={dia.ventas} texto={dia.ventas === 1 ? "venta" : "ventas"} />
        <Cifra n={dia.prendas} texto={dia.prendas === 1 ? "prenda" : "prendas"} />
        {dia.promedio !== null && <Cifra n={money(dia.promedio)} texto="por venta" />}
        {dia.anuladas > 0 && <Cifra n={dia.anuladas} texto={dia.anuladas === 1 ? "anulada" : "anuladas"} />}
        {dia.horaFuerte && <span className="ml-auto text-tinta/60">Hora fuerte: {dia.horaFuerte}</span>}
      </dl>
    </>
  );
}

function Cifra({ n, texto }: { n: number | string; texto: string }) {
  return (
    <div>
      <dt className="sr-only">{texto}</dt>
      <dd>
        <b className="font-semibold tabular-nums">{n}</b> <span className="text-tinta/60">{texto}</span>
      </dd>
    </div>
  );
}

/** La cascada del efectivo: apertura + lo vendido en efectivo ± otros movimientos = lo esperado, y lo que se contó al lado. Las cifras suman siempre. */
function CascadaDelEfectivo({ c, estado }: { c: ReturnType<typeof cascadaEfectivo>; estado: keyof typeof COLOR_ESTADO }) {
  const hayOtros = Math.abs(c.otros) >= 0.005;
  const techo = Math.max(c.apertura + c.vendido, c.esperado, c.contado, 1);
  const H = 130;
  const base = 150;
  const k = H / techo;
  const Y = (v: number) => base - v * k;
  type Col = { clave: string; desde: number; hasta: number; fill: string; valor: string; color: string; l1: string; l2?: string };
  const cols: Col[] = [
    { clave: "apertura", desde: 0, hasta: c.apertura, fill: "var(--color-taupe)", valor: c.apertura.toFixed(2), color: "var(--color-tinta)", l1: "Apertura" },
    { clave: "vendido", desde: c.apertura, hasta: c.apertura + c.vendido, fill: "var(--color-metodo-efectivo)", valor: `+${c.vendido.toFixed(2)}`, color: "var(--color-tinta)", l1: "Efectivo", l2: "vendido" },
  ];
  if (hayOtros) {
    const arriba = c.apertura + c.vendido;
    cols.push({
      clave: "otros",
      desde: c.otros < 0 ? arriba + c.otros : arriba,
      hasta: c.otros < 0 ? arriba : arriba + c.otros,
      fill: c.otros < 0 ? "var(--color-rojo)" : "var(--color-verde)",
      valor: `${c.otros < 0 ? "−" : "+"}${Math.abs(c.otros).toFixed(2)}`,
      color: c.otros < 0 ? "var(--color-rojo-profundo)" : "var(--color-verde-profundo)",
      l1: c.otros < 0 ? "Salidas" : "Entradas",
      l2: "del cajón",
    });
  }
  cols.push(
    { clave: "esperado", desde: 0, hasta: c.esperado, fill: "var(--color-tinta)", valor: c.esperado.toFixed(2), color: "var(--color-tinta)", l1: "Esperado" },
    { clave: "contado", desde: 0, hasta: c.contado, fill: COLOR_ESTADO[estado], valor: c.contado.toFixed(2), color: "var(--color-tinta)", l1: "Contado" },
  );
  const ancho = 40;
  const paso = (300 - 20 - ancho) / (cols.length - 1);
  const dice = `Apertura ${money(c.apertura)}, efectivo vendido ${money(c.vendido)}${hayOtros ? `, ${c.otros < 0 ? "salidas" : "entradas"} del cajón ${money(Math.abs(c.otros))}` : ""}, esperado ${money(c.esperado)}, contado ${money(c.contado)}`;
  return (
    <svg viewBox="0 0 300 186" className="mx-auto block w-full max-w-[340px]" role="img" aria-label={dice}>
      <line x1="6" x2="294" y1={base + 0.5} y2={base + 0.5} stroke="var(--color-sand)" />
      {cols.map((col, i) => {
        const x = 10 + i * paso;
        const alto = Math.max(3, (col.hasta - col.desde) * k);
        const y = Y(col.hasta);
        return (
          <g key={col.clave}>
            <rect x={x} y={y} width={ancho} height={alto} rx="4" style={{ fill: col.fill }} />
            <text x={x + ancho / 2} y={y - 6} textAnchor="middle" fontSize="10.5" fontWeight="600" style={{ fill: col.color }}>
              {col.valor}
            </text>
            <text x={x + ancho / 2} y={base + 16} textAnchor="middle" fontSize="10.5" className="fill-tinta/60">
              {col.l1}
            </text>
            {col.l2 && (
              <text x={x + ancho / 2} y={base + 28} textAnchor="middle" fontSize="10.5" className="fill-tinta/60">
                {col.l2}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Lo cobrado por medio de pago: el total arriba, la barra apilada del sistema (ronda 14 de /unificar: la dona pasó a la barra que
 *  reparte un total, como «Cómo se pagó» del Historial) y, debajo, cada medio con su monto, su % y cuántas ventas. */
function CobrosPorMedio({ cobros }: { cobros: DetalleCierre["cobros"] }) {
  if (cobros.medios.length === 0) {
    return (
      <Vacio tamano="chico" icono={<Receipt />}>
        Esta caja no cobró ventas.
      </Vacio>
    );
  }
  return (
    <>
      <p className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-tinta/60">cobrado</span>
        <b className="font-display text-[22px] font-normal tabular-nums text-tinta">{`S/\u00a0${Math.round(cobros.total).toLocaleString("es-PE")}`}</b>
      </p>
      <BarraApilada
        className="mt-2"
        formato={money}
        etiqueta={`Total cobrado ${money(cobros.total)}. ${cobros.medios.map((m) => `${m.texto} ${m.pct} %`).join(", ")}`}
        segmentos={cobros.medios.map((m) => ({ clave: m.clave, nombre: m.texto, valor: m.monto, color: COLOR_MEDIO[m.clave] }))}
      />
      <div className="mt-2">
        {cobros.medios.map((m) => (
          <Linea
            key={m.clave}
            k={
              <>
                <MuestraTramo color={COLOR_MEDIO[m.clave]} className="mr-2 align-middle" />
                {m.texto}
              </>
            }
            sub={`${m.ventas} ${m.ventas === 1 ? "venta" : "ventas"}`}
            v={
              <>
                {money(m.monto)}
                <span className="ml-2 inline-block w-9 text-right text-tinta/60">{m.pct} %</span>
              </>
            }
          />
        ))}
        {cobros.anticipo > 0 && <Linea k={<span className="text-tinta/60">Anticipos de separaciones (ya cobrados antes)</span>} v={<span className="text-tinta/60">{money(cobros.anticipo)}</span>} />}
      </div>
    </>
  );
}

function AvisoDelCierre({ children }: { children: ReactNode }) {
  return (
    <Aviso tono="atencion" chico className="mt-2">
      {children}
    </Aviso>
  );
}

type Tono = "mas" | "menos" | "neutro" | "anulada";
const PUNTO: Record<Tono, string> = { mas: "bg-verde", menos: "bg-rojo", neutro: "bg-pizarra", anulada: "bg-tinta/30" };

/** Un hecho del turno sobre el hilo: su hora, qué fue (y quién lo hizo, o con qué se pagó) y su monto. */
function Fila({ hora: h, tono, texto, sub, monto, tachado }: { hora: string; tono: Tono; texto: ReactNode; sub?: ReactNode; monto: string; tachado?: boolean }) {
  return (
    <div className="relative grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-0.5 py-2 text-sm sm:grid-cols-[4.75rem_1fr_auto]">
      <span className={`absolute -left-[23px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full ring-2 ring-papel ${PUNTO[tono]}`} aria-hidden />
      <span className="col-span-2 whitespace-nowrap text-xs tabular-nums text-tinta/60 sm:col-span-1">{h}</span>
      <span className="min-w-0">
        <span className={`block break-words ${tachado ? "text-tinta/50 line-through" : "text-tinta/85"}`}>{texto}</span>
        {sub && <span className="block break-words text-xs text-tinta/60">{sub}</span>}
      </span>
      <span className={`whitespace-nowrap tabular-nums ${tachado ? "text-tinta/50 line-through" : tono === "mas" ? "text-verde-profundo" : tono === "menos" ? "text-rojo-profundo" : "text-tinta"}`}>{monto}</span>
    </div>
  );
}

const unidad = (n: number) => `${n} prenda${n === 1 ? "" : "s"}`;
const juntar = (...partes: (string | null | undefined | false)[]) => partes.filter(Boolean).join(" · ") || undefined;

function FilaEvento({ evento: e }: { evento: EventoCaja }) {
  if (e.tipo === "venta") {
    return (
      <Fila
        hora={hora(e.hora)}
        tono={e.anulada ? "anulada" : "mas"}
        tachado={e.anulada}
        texto={e.anulada ? "Venta anulada" : `Venta · ${unidad(e.unidades)}`}
        sub={e.anulada ? undefined : juntar(e.metodos.join(", "), e.colaboradorNombre)}
        monto={`${e.anulada ? "" : "+"}${money(e.total)}`}
      />
    );
  }
  if (e.tipo === "movimiento") {
    const ingreso = e.direccion === "ingreso";
    // El mismo nombre que la lista del turno: un gasto se llama por lo que se pagó, no «Otro · Gasto · …».
    const fila = filaDeMovimiento(e);
    return <Fila hora={hora(e.hora)} tono={ingreso ? "mas" : "menos"} texto={e.esAjuste ? `${fila.titulo} · ajuste` : fila.titulo} sub={juntar(fila.detalle, e.colaboradorNombre)} monto={`${ingreso ? "+" : "-"}${money(e.monto)}`} />;
  }
  if (e.tipo === "devolucion") {
    return <Fila hora={e.hora ? hora(e.hora) : "—"} tono="menos" texto="Devolución" sub={`reembolso ${e.metodo ?? "—"}`} monto={`-${money(e.monto)}`} />;
  }
  return <Fila hora={hora(e.hora)} tono="neutro" texto="Cambio" sub={`diferencia ${e.metodo ?? "—"}`} monto={`${e.diferencia >= 0 ? "+" : ""}${money(e.diferencia)}`} />;
}
