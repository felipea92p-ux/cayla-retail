"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeftRight, ArrowUp, Eye, FunnelX, Minus, Receipt } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { getDetalleCierre, type DetalleCierre, type EventoCaja } from "@/app/actions/caja";
import type { CierreCaja } from "@/lib/caja";
import { etiquetaDestino } from "@/lib/caja-cierre-reglas";
import type { MetodoCobrado } from "@/lib/caja-tablero-reglas";
import { cuadreDelTurno, duracionTurno, estadoCierre, rutaDelEfectivo } from "@/lib/historial-cierres-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";

function money(n: number) {
  return (n >= 0 ? "S/ " : "-S/ ") + Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hora(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function diaLargo(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}

/** El título y la bajada de la hoja de un cierre (los usa tanto el modal suelto como el historial, que cambia de vista dentro de su hoja). */
export const tituloDelCierre = (c: CierreCaja) => `Cierre · ${c.ubicacionNombre}`;
export const bajadaDelCierre = (c: CierreCaja) => diaLargo(c.cerradaEn);

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

/** El botón de ojo de cada fila de la página `/caja/historial`. */
export function BotonVerDetalleCierre({ cierre }: { cierre: CierreCaja }) {
  const { abrir, modal } = useDetalleCierre();
  return (
    <>
      <button
        type="button"
        onClick={() => abrir(cierre)}
        aria-label={`Ver el detalle del cierre de ${cierre.ubicacionNombre} (${hora(cierre.cerradaEn)})`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-tinta/50 transition-colors hover:bg-tinta/8 hover:text-rojo"
      >
        <Eye className="h-4 w-4" aria-hidden />
      </button>
      {modal}
    </>
  );
}

/** El ancho de la hoja con el detalle: en escritorio deja los movimientos en su propia columna (el contenido pasa a dos columnas desde 56 rem de ancho). */
export const ANCHO_DETALLE_CIERRE = "max-w-5xl";

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
  otro: "var(--color-taupe)",
};

/** El modal de un cierre cuando no hay una hoja de atrás a la que volver (la página `/caja/historial`). */
export function DetalleCierreModal({ cierre, detalle, cargando, error, onClose }: { cierre: CierreCaja; detalle: DetalleCierre | null; cargando: boolean; error: boolean; onClose: () => void }) {
  return (
    <Modal conCerrar titulo={tituloDelCierre(cierre)} subtitulo={bajadaDelCierre(cierre)} onClose={onClose} ancho={ANCHO_DETALLE_CIERRE}>
      <DetalleCierreContenido cierre={cierre} detalle={detalle} cargando={cargando} error={error} />
    </Modal>
  );
}

/**
 * Lo de adentro de la hoja de un cierre. Cuenta el cierre en el orden en que se lee: si cuadró → cómo abrió y cerró → qué se cobró →
 * cómo cuadró el efectivo → a dónde fue. Los movimientos del turno van en su propia columna a la derecha (de 56 rem de ancho para arriba;
 * en celular y tablet quedan al final, en una sola columna).
 */
export function DetalleCierreContenido({ cierre, detalle, cargando, error }: { cierre: CierreCaja; detalle: DetalleCierre | null; cargando: boolean; error: boolean }) {
  const [filtro, setFiltro] = useState<FiltroFlujo>("todo");
  const estado = estadoCierre(cierre.diferencia);
  const cuadre = cuadreDelTurno(cierre);
  const ruta = rutaDelEfectivo(cierre);
  const eventos = detalle?.eventos ?? null;
  const visibles = eventos?.filter((e) => filtro === "todo" || (filtro === "cajon") === esDelCajon(e)) ?? [];
  const duracion = duracionTurno(cierre.abiertaEn, cierre.cerradaEn);
  const tonoDiferencia = estado === "cuadro" ? "text-verde-profundo" : estado === "sobro" ? "text-ambar-profundo" : "text-rojo-profundo";

  return (
    <div className="@container mt-1">
      {/* Veredicto: lo primero que se quiere saber de un cierre es si cuadró. */}
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-tinta px-5 py-4 text-crema">
        <p className="font-display min-w-0 text-2xl leading-tight">{estado === "cuadro" ? "Cuadró, sin diferencia" : `${estado === "sobro" ? "Sobró" : "Faltó"} ${money(Math.abs(cierre.diferencia))}`}</p>
        <div className="shrink-0 text-right">
          <p className="font-display text-3xl leading-none tabular-nums">{money(cierre.montoCierreReal)}</p>
          <p className="label-cayla mt-1 text-[10px] text-crema/70">Contado</p>
        </div>
      </div>

      <div className="mt-6 grid items-start gap-x-8 @4xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0">
          <Seccion titulo="Cómo abrió y cerró la caja" primera>
            <div className="grid grid-cols-2 items-center gap-x-3 gap-y-2 text-sm sm:grid-cols-[1fr_auto_1fr]">
              <div className="min-w-0">
                <p className="whitespace-nowrap text-xs text-tinta/60">Abrió · {hora(cierre.abiertaEn)}</p>
                <p className="truncate font-semibold text-tinta">{cierre.abiertaPorNombre ?? "—"}</p>
              </div>
              {duracion && <span className="order-last col-span-2 justify-self-start rounded-full bg-hueso px-2.5 py-0.5 text-xs text-tinta/70 sm:order-none sm:col-span-1 sm:justify-self-auto">{duracion}</span>}
              <div className="min-w-0 text-right">
                <p className="whitespace-nowrap text-xs text-tinta/60">Cerró · {hora(cierre.cerradaEn)}</p>
                <p className="truncate font-semibold text-tinta">{cierre.cerradaPorNombre ?? "—"}</p>
              </div>
            </div>
            {cierre.motivoDiferenciaApertura && cierre.aperturaEsperada !== null && (
              <AvisoDelCierre>
                Abrió con {money(cierre.montoApertura)} y el cierre anterior había dejado {money(cierre.aperturaEsperada)}: «{cierre.motivoDiferenciaApertura}».
              </AvisoDelCierre>
            )}
          </Seccion>

          <Seccion titulo="Qué se cobró" nota={detalle && detalle.cobros.total > 0 ? `Total vendido ${money(detalle.cobros.total)}` : undefined}>
            {detalle ? <CobrosPorMedio cobros={detalle.cobros} /> : error ? null : <p className="py-3 text-sm text-tinta/60">Cargando lo cobrado…</p>}
          </Seccion>

          <Seccion titulo="Cómo cuadró el efectivo">
            <Linea k="Apertura" v={money(cuadre.apertura)} />
            <Linea
              k={cuadre.movio >= 0 ? "Entró al cajón" : "Salió del cajón"}
              sub="ventas, entradas y salidas en efectivo"
              v={`${cuadre.movio >= 0 ? "+ " : "− "}${money(Math.abs(cuadre.movio))}`}
              tono={cuadre.movio >= 0 ? "text-verde-profundo" : "text-rojo-profundo"}
            />
            <Linea k="El sistema esperaba" v={money(cuadre.esperado)} fuerte />
            <Linea k="Se contó en el cajón" v={money(cierre.montoCierreReal)} />
            <Linea k="Diferencia" v={estado === "cuadro" ? "Cuadró" : `${estado === "sobro" ? "Sobró" : "Faltó"} ${money(Math.abs(cierre.diferencia))}`} tono={tonoDiferencia} fuerte cierre />
          </Seccion>

          {ruta && (
            <Seccion titulo="A dónde fue el efectivo" nota={`de ${money(ruta.total)}`}>
              {/* La barra es `<BarraApilada>` (ADR-0358): lo trasladado contra lo que quedó, medido sobre el 100 %. */}
              <BarraApilada
                className="mb-2 mt-1"
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
              {cierre.fondoRequerido !== null && ruta.quedo + 0.004 < cierre.fondoRequerido && (
                <AvisoDelCierre>Dejó menos del fondo: el día pedía {money(cierre.fondoRequerido)}.</AvisoDelCierre>
              )}
            </Seccion>
          )}

          {cierre.nota && <p className="mt-5 text-xs italic text-tinta/65">{/* unificar-fijo: es la nota escrita al cerrar, no un vacío */}Nota del cierre: {cierre.nota}</p>}
        </div>

        {/* Los movimientos del turno: su propia columna, que se queda a la vista mientras se baja por el resumen y se desplaza por dentro. */}
        <section aria-label="Lo que pasó en el turno" className="mt-6 min-w-0 @4xl:sticky @4xl:top-2 @4xl:mt-0">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="label-cayla text-[10.5px] text-taupe">Lo que pasó en el turno</h3>
            {eventos && (
              <p className="text-xs text-tinta/60">
                {visibles.length} {visibles.length === 1 ? "movimiento" : "movimientos"}
              </p>
            )}
          </div>
          <div role="group" aria-label="Filtrar el flujo" className="mb-2.5 flex flex-wrap gap-1.5">
            {FILTROS.map(([clave, texto]) => (
              <button key={clave} type="button" aria-pressed={filtro === clave} onClick={() => setFiltro(clave)} className="pildora-cayla">
                {texto}
              </button>
            ))}
          </div>
          {cargando && <p className="py-6 text-center text-sm text-tinta/60">Cargando el flujo de esta caja…</p>}
          {error && (
            <Aviso tono="error" className="my-3">
              No se pudo cargar el detalle. Vuelve e intenta de nuevo.
            </Aviso>
          )}
          {eventos && (
            <div className="scroll-cayla max-h-[40vh] divide-y divide-sand overflow-y-auto rounded-xl border border-sand bg-papel px-2 @4xl:max-h-[min(72dvh,46rem)]">
              {visibles.length === 0 ? (
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
                visibles.map((e) => <FilaEvento key={`${e.tipo}-${e.id}`} evento={e} />)
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Un bloque del detalle: su título en versalitas taupe y, a la derecha, una nota corta. Sin recuadro: la línea de abajo y el aire separan. */
function Seccion({ titulo, nota, primera = false, children }: { titulo: string; nota?: string; primera?: boolean; children: ReactNode }) {
  return (
    <section aria-label={titulo} className={primera ? "" : "mt-6"}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h3 className="label-cayla text-[10.5px] text-taupe">{titulo}</h3>
        {nota && <p className="text-xs text-tinta/60">{nota}</p>}
      </div>
      {children}
    </section>
  );
}

/** Una línea de «concepto … monto» con su hilo de arena arriba (la primera de un bloque no lo lleva). `cierre` la separa con una línea de tinta. */
function Linea({ k, sub, v, tono, fuerte = false, cierre = false }: { k: ReactNode; sub?: string; v: ReactNode; tono?: string; fuerte?: boolean; cierre?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 border-t py-2 text-sm first:border-t-0 ${cierre ? "mt-1 border-tinta pt-2.5" : "border-sand"} ${fuerte ? "font-semibold text-tinta" : "text-tinta/80"}`}>
      <p className="min-w-0">
        {k}
        {sub && <span className="block text-xs font-normal text-tinta/60">{sub}</span>}
      </p>
      <p className={`whitespace-nowrap tabular-nums ${tono ?? ""}`}>{v}</p>
    </div>
  );
}

function CobrosPorMedio({ cobros }: { cobros: DetalleCierre["cobros"] }) {
  if (cobros.medios.length === 0) {
    return (
      <Vacio tamano="chico" icono={<Receipt />}>
        Esta caja no cobró ventas.
      </Vacio>
    );
  }
  const otros = cobros.total - (cobros.medios.find((m) => m.clave === "efectivo")?.monto ?? 0);
  return (
    <>
      {/* Un tramo por medio, con el color de siempre de cada uno; la leyenda de abajo dice lo mismo en texto. */}
      <BarraApilada
        className="mb-2 mt-1"
        alto={12}
        sinEntrada
        unidad="soles"
        formato={money}
        segmentos={cobros.medios.map((m) => ({ clave: m.clave, nombre: m.texto, valor: m.monto, color: COLOR_MEDIO[m.clave] }))}
      />
      {cobros.medios.map((m) => (
        <Linea
          key={m.clave}
          k={
            <>
              <MuestraTramo color={COLOR_MEDIO[m.clave]} className="mr-2 align-middle" />
              {m.texto}
              <span className="text-tinta/60"> · {m.ventas} {m.ventas === 1 ? "venta" : "ventas"}</span>
            </>
          }
          v={
            <>
              {money(m.monto)}
              <span className="ml-2 inline-block w-9 text-right text-tinta/60">{m.pct} %</span>
            </>
          }
        />
      ))}
      {cobros.anticipo > 0 && <Linea k={<span className="text-tinta/60">Anticipos de separaciones (ya cobrados antes)</span>} v={<span className="text-tinta/60">{money(cobros.anticipo)}</span>} />}
      {otros > 0.004 && cobros.medios.some((m) => m.clave === "efectivo") && (
        <p className="nota-cayla mt-3">
          Solo el <b>efectivo</b> pasa por el cajón. Los otros {money(otros)} no están en el cajón: van al banco, a la billetera o al POS.
        </p>
      )}
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

type Tono = "mas" | "menos" | "neutro";
const TONO_ICONO: Record<Tono, string> = { mas: "bg-verde/15 text-verde-profundo", menos: "bg-rojo/10 text-rojo-profundo", neutro: "bg-sand text-taupe-profundo" };

function Fila({ hora: h, icono, tono, texto, quien, monto, tachado }: { hora: string; icono: ReactNode; tono: Tono; texto: ReactNode; quien?: string | null; monto: string; tachado?: boolean }) {
  return (
    <div className="grid grid-cols-[4.25rem_1.5rem_1fr_auto] items-center gap-2 px-1 py-2 text-sm">
      <span className="whitespace-nowrap text-xs tabular-nums text-tinta/60">{h}</span>
      <span className={`flex h-6 w-6 items-center justify-center rounded-full ${TONO_ICONO[tono]}`} aria-hidden>
        {icono}
      </span>
      <span className="min-w-0">
        <span className={`block break-words ${tachado ? "text-tinta/50 line-through" : "text-tinta/85"}`}>{texto}</span>
        {quien && <span className="block truncate text-xs text-tinta/60">{quien}</span>}
      </span>
      <span className={`whitespace-nowrap tabular-nums ${tachado ? "text-tinta/50 line-through" : tono === "mas" ? "text-verde-profundo" : tono === "menos" ? "text-rojo-profundo" : "text-tinta"}`}>{monto}</span>
    </div>
  );
}

function FilaEvento({ evento: e }: { evento: EventoCaja }) {
  const mas = <ArrowUp className="h-3 w-3" />;
  const menos = <ArrowDown className="h-3 w-3" />;
  if (e.tipo === "venta") {
    return (
      <Fila
        hora={hora(e.hora)}
        icono={e.anulada ? <Minus className="h-3 w-3" /> : mas}
        tono={e.anulada ? "neutro" : "mas"}
        tachado={e.anulada}
        quien={e.colaboradorNombre}
        texto={
          e.anulada ? (
            "Venta anulada"
          ) : (
            <>
              Venta · {e.unidades} prenda{e.unidades === 1 ? "" : "s"}
              {e.metodos.length > 0 && <span className="text-tinta/55"> · {e.metodos.join(", ")}</span>}
            </>
          )
        }
        monto={`${e.anulada ? "" : "+"}${money(e.total)}`}
      />
    );
  }
  if (e.tipo === "movimiento") {
    const ingreso = e.direccion === "ingreso";
    return (
      <Fila
        hora={hora(e.hora)}
        icono={ingreso ? mas : menos}
        tono={ingreso ? "mas" : "menos"}
        quien={e.colaboradorNombre}
        texto={
          <>
            {e.motivo}
            {e.esAjuste && <span className="text-tinta/55"> · ajuste</span>}
            {e.nota && <span className="text-tinta/55"> · {e.nota}</span>}
          </>
        }
        monto={`${ingreso ? "+" : "-"}${money(e.monto)}`}
      />
    );
  }
  if (e.tipo === "devolucion") {
    return (
      <Fila
        hora={e.hora ? hora(e.hora) : "—"}
        icono={menos}
        tono="menos"
        texto={
          <>
            Devolución<span className="text-tinta/55"> · reembolso {e.metodo ?? "—"}</span>
          </>
        }
        monto={`-${money(e.monto)}`}
      />
    );
  }
  return (
    <Fila
      hora={hora(e.hora)}
      icono={<ArrowLeftRight className="h-3 w-3" />}
      tono="neutro"
      texto={
        <>
          Cambio<span className="text-tinta/55"> · diferencia {e.metodo ?? "—"}</span>
        </>
      }
      monto={`${e.diferencia >= 0 ? "+" : ""}${money(e.diferencia)}`}
    />
  );
}
