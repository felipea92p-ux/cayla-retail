"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeftRight, ArrowUp, Eye, Minus, TriangleAlert } from "lucide-react";
import { Modal, botonCancelar } from "@/components/ui/Modal";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { getDetalleCierre, type EventoCaja } from "@/app/actions/caja";
import type { CierreCaja } from "@/lib/caja";
import { etiquetaDestino } from "@/lib/caja-cierre-reglas";
import { cuadreDelTurno, duracionTurno, estadoCierre, rutaDelEfectivo } from "@/lib/historial-cierres-reglas";

function money(n: number) {
  return (n >= 0 ? "S/ " : "-S/ ") + Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hora(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function diaLargo(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}

/**
 * Abrir el detalle de un cierre desde cualquier lista. El detalle se pide al hacer clic (mismo criterio que el resto de
 * la app: el evento dispara el trabajo async, nunca el render) y se guarda por cierre: volver a abrir el mismo no repite
 * la consulta. `modal` va en el JSX de quien lo usa; `abrir(cierre)` lo dispara.
 */
export function useDetalleCierre() {
  const [abierto, setAbierto] = useState<CierreCaja | null>(null);
  const [eventos, setEventos] = useState<Record<string, EventoCaja[]>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  async function abrir(cierre: CierreCaja) {
    setAbierto(cierre);
    if (eventos[cierre.id]) return;
    setCargando(true);
    setError(false);
    try {
      const lista = await getDetalleCierre(cierre.id);
      setEventos((prev) => ({ ...prev, [cierre.id]: lista }));
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }

  const modal = abierto ? (
    <DetalleCierreModal cierre={abierto} eventos={eventos[abierto.id] ?? null} cargando={cargando} error={error} onClose={() => setAbierto(null)} />
  ) : null;
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

type FiltroFlujo = "todo" | "ventas" | "cajon";
const FILTROS: [FiltroFlujo, string][] = [
  ["todo", "Todo"],
  ["ventas", "Ventas"],
  ["cajon", "Mueve el cajón"],
];
// Lo que saca o mete plata del cajón por fuera de una venta; el resto (ventas y cambios) es «Ventas».
const esDelCajon = (e: EventoCaja) => e.tipo === "movimiento" || e.tipo === "devolucion";

function DetalleCierreModal({
  cierre,
  eventos,
  cargando,
  error,
  onClose,
}: {
  cierre: CierreCaja;
  eventos: EventoCaja[] | null;
  cargando: boolean;
  error: boolean;
  onClose: () => void;
}) {
  const [filtro, setFiltro] = useState<FiltroFlujo>("todo");
  const estado = estadoCierre(cierre.diferencia);
  const cuadre = cuadreDelTurno(cierre);
  const ruta = rutaDelEfectivo(cierre);
  const visibles = eventos?.filter((e) => filtro === "todo" || (filtro === "cajon") === esDelCajon(e)) ?? [];
  const duracion = duracionTurno(cierre.abiertaEn, cierre.cerradaEn);

  return (
    <Modal conCerrar titulo={`Cierre · ${cierre.ubicacionNombre}`} subtitulo={diaLargo(cierre.cerradaEn)} onClose={onClose} ancho="max-w-xl">
      {(cerrar) => (
        <div className="space-y-4">
          {/* Veredicto: lo primero que se quiere saber de un cierre es si cuadró. */}
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-tinta px-5 py-4 text-crema">
            <div className="min-w-0">
              <p className="font-display text-2xl leading-tight">
                {estado === "cuadro" ? "Cuadró, sin diferencia" : `${estado === "sobro" ? "Sobró" : "Faltó"} ${money(Math.abs(cierre.diferencia))}`}
              </p>
              <p className="mt-1 text-xs text-crema/70">
                El sistema esperaba {money(cierre.montoCierreSistema)}
                {estado === "cuadro" ? " y se contó lo mismo." : ` y se contó ${money(cierre.montoCierreReal)}.`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-display text-3xl leading-none tabular-nums">{money(cierre.montoCierreReal)}</p>
              <p className="label-cayla mt-1 text-[10px] text-crema/70">Contado</p>
            </div>
          </div>

          {/* El turno: quién abrió, cuánto duró, quién cerró. */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
            <div className="min-w-0">
              <p className="text-xs text-tinta/60">Abrió · {hora(cierre.abiertaEn)}</p>
              <p className="truncate font-semibold text-tinta">{cierre.abiertaPorNombre ?? "—"}</p>
            </div>
            {duracion && <span className="rounded-full bg-hueso px-2.5 py-0.5 text-xs text-tinta/70">{duracion}</span>}
            <div className="min-w-0 text-right">
              <p className="text-xs text-tinta/60">Cerró · {hora(cierre.cerradaEn)}</p>
              <p className="truncate font-semibold text-tinta">{cierre.cerradaPorNombre ?? "—"}</p>
            </div>
          </div>

          {/* El cuadre en tres cifras que suman: lo que debía haber el efectivo = esperado. */}
          <div className="grid grid-cols-3 gap-2">
            <TarjetaCifra etiqueta="Apertura" valor={money(cuadre.apertura)} />
            <TarjetaCifra etiqueta={cuadre.movio >= 0 ? "Entró al cajón" : "Salió del cajón"} valor={money(Math.abs(cuadre.movio))} tono={cuadre.movio >= 0 ? "text-verde-profundo" : "text-rojo-profundo"} />
            <TarjetaCifra etiqueta="Esperado" valor={money(cuadre.esperado)}>
              lo que debía haber
            </TarjetaCifra>
          </div>

          {ruta && (
            <div className="rounded-xl border border-sand p-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-tinta">A dónde fue el efectivo</p>
                <p className="text-xs text-tinta/60">de {money(ruta.total)}</p>
              </div>
              <div className="my-2.5 flex h-2.5 overflow-hidden rounded-full bg-sand" role="img" aria-label={`${ruta.pctTrasladado} % trasladado, ${ruta.pctQuedo} % quedó en el cajón`}>
                <div className="bg-rojo" style={{ width: `${ruta.pctTrasladado}%` }} />
                <div className="bg-verde" style={{ width: `${ruta.pctQuedo}%` }} />
              </div>
              <dl className="space-y-1 text-sm">
                {cierre.traslados.map((t, i) => (
                  <div key={i} className="flex items-start justify-between gap-3">
                    <dt className="text-tinta/75">
                      <span className="mr-2 inline-block h-2 w-2 rounded-full bg-rojo" aria-hidden />
                      {etiquetaDestino(t.destino)}
                      {t.referencia && <span className="block pl-4 text-xs text-tinta/55">{t.referencia}</span>}
                    </dt>
                    <dd className="whitespace-nowrap tabular-nums">{money(t.monto)}</dd>
                  </div>
                ))}
                <div className="flex items-start justify-between gap-3 font-semibold text-tinta">
                  <dt>
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-verde" aria-hidden />
                    Quedó en el cajón
                  </dt>
                  <dd className="whitespace-nowrap tabular-nums">{money(ruta.quedo)}</dd>
                </div>
              </dl>
              {cierre.fondoRequerido !== null && ruta.quedo + 0.004 < cierre.fondoRequerido && (
                <Aviso>Dejó menos del fondo: el día pedía {money(cierre.fondoRequerido)}.</Aviso>
              )}
            </div>
          )}

          {cierre.motivoDiferenciaApertura && cierre.aperturaEsperada !== null && (
            <Aviso>
              Abrió con {money(cierre.montoApertura)} y el cierre anterior había dejado {money(cierre.aperturaEsperada)}: «{cierre.motivoDiferenciaApertura}».
            </Aviso>
          )}

          {/* El flujo del turno, con su filtro. */}
          <section aria-label="Lo que pasó en el turno">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-tinta">
                Lo que pasó en el turno
                {eventos && <span className="font-normal text-tinta/60"> · {visibles.length} {visibles.length === 1 ? "movimiento" : "movimientos"}</span>}
              </p>
              <div role="group" aria-label="Filtrar el flujo" className="flex flex-wrap gap-1.5">
                {FILTROS.map(([clave, texto]) => (
                  <button key={clave} type="button" aria-pressed={filtro === clave} onClick={() => setFiltro(clave)} className="pildora-cayla">
                    {texto}
                  </button>
                ))}
              </div>
            </div>
            {cargando && <p className="py-6 text-center text-sm text-tinta/60">Cargando el flujo de esta caja…</p>}
            {error && <p className="py-6 text-center text-sm text-rojo-profundo">No se pudo cargar el detalle. Cierra e intenta de nuevo.</p>}
            {eventos && (
              <div className="scroll-cayla max-h-[30vh] divide-y divide-sand overflow-y-auto border-y border-sand">
                {visibles.length === 0 ? (
                  <p className="py-6 text-center text-sm text-tinta/60">
                    {eventos.length === 0 ? "Esta caja no tuvo ventas ni movimientos: solo apertura y cierre." : "Nada de este tipo en el turno."}
                  </p>
                ) : (
                  visibles.map((e) => <FilaEvento key={`${e.tipo}-${e.id}`} evento={e} />)
                )}
              </div>
            )}
          </section>

          {cierre.nota && <p className="text-xs italic text-tinta/65">Nota del cierre: {cierre.nota}</p>}

        </div>
      )}
    </Modal>
  );
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 flex items-start gap-2 rounded-lg bg-ambar/10 px-3 py-2 text-xs text-ambar-profundo">
      <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

type Tono = "mas" | "menos" | "neutro";
const TONO_ICONO: Record<Tono, string> = { mas: "bg-verde/15 text-verde-profundo", menos: "bg-rojo/10 text-rojo-profundo", neutro: "bg-sand text-taupe-profundo" };

function Fila({ hora: h, icono, tono, texto, monto, tachado }: { hora: string; icono: ReactNode; tono: Tono; texto: ReactNode; monto: string; tachado?: boolean }) {
  return (
    <div className="grid grid-cols-[4.25rem_1.5rem_1fr_auto] items-center gap-2 px-1 py-2 text-sm">
      <span className="whitespace-nowrap text-xs tabular-nums text-tinta/60">{h}</span>
      <span className={`flex h-6 w-6 items-center justify-center rounded-full ${TONO_ICONO[tono]}`} aria-hidden>
        {icono}
      </span>
      <span className={`min-w-0 truncate ${tachado ? "text-tinta/50 line-through" : "text-tinta/85"}`}>{texto}</span>
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
