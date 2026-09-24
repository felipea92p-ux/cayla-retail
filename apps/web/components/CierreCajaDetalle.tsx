"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Modal, botonCancelar } from "@/components/ui/Modal";
import { getDetalleCierre, type EventoCaja } from "@/app/actions/caja";
import type { CierreCaja } from "@/lib/caja";
import { etiquetaDestino } from "@/lib/caja-cierre-reglas";

function money(n: number) {
  return (n >= 0 ? "S/" : "-S/") + Math.abs(n).toFixed(2);
}

function hora(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** El botón de ojo de cada fila del historial. El detalle se pide al hacer clic
 *  (mismo criterio que cualquier otra acción de esta app: el evento dispara el
 *  trabajo async, nunca el render) — no un `useEffect` en el modal, y no se
 *  repite si ya se cargó una vez y se vuelve a abrir el mismo modal. */
export function BotonVerDetalleCierre({ cierre }: { cierre: CierreCaja }) {
  const [abierto, setAbierto] = useState(false);
  const [eventos, setEventos] = useState<EventoCaja[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  async function abrir() {
    setAbierto(true);
    if (eventos !== null) return;
    setCargando(true);
    setError(false);
    try {
      setEventos(await getDetalleCierre(cierre.id));
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label={`Ver el detalle del cierre de ${cierre.ubicacionNombre} (${hora(cierre.cerradaEn)})`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-tinta/50 transition-colors hover:bg-tinta/8 hover:text-rojo"
      >
        <Eye className="h-4 w-4" aria-hidden />
      </button>
      {abierto && (
        <DetalleCierreModal cierre={cierre} eventos={eventos} cargando={cargando} error={error} onClose={() => setAbierto(false)} />
      )}
    </>
  );
}

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
  const cuadra = Math.abs(cierre.diferencia) < 0.01;

  return (
    <Modal titulo={`Detalle del cierre · ${cierre.ubicacionNombre}`} subtitulo={`${hora(cierre.abiertaEn)} – ${hora(cierre.cerradaEn)}`} onClose={onClose} ancho="max-w-lg">
      {(cerrar) => (
        <div className="space-y-4">
          {/* Apertura y cierre no se piden de nuevo: ya viajaron con la fila. */}
          <dl className="grid grid-cols-2 gap-3 border-y border-tinta/10 py-3 text-sm sm:grid-cols-4">
            <Dato etiqueta="Abrió">{cierre.abiertaPorNombre ?? "—"}</Dato>
            <Dato etiqueta="Apertura">{money(cierre.montoApertura)}</Dato>
            <Dato etiqueta="Cerró">{cierre.cerradaPorNombre ?? "—"}</Dato>
            <Dato etiqueta="Contado">{money(cierre.montoCierreReal)}</Dato>
          </dl>

          {cargando && <p className="py-6 text-center text-sm text-tinta/55">Cargando el flujo de esta caja…</p>}
          {error && <p className="py-6 text-center text-sm text-rojo">No se pudo cargar el detalle. Cierra e intenta de nuevo.</p>}

          {eventos && (
            <div className="max-h-[50vh] space-y-1 overflow-y-auto">
              {eventos.length === 0 ? (
                <p className="py-6 text-center text-sm text-tinta/55">Esta caja no tuvo ventas ni movimientos — solo apertura y cierre.</p>
              ) : (
                eventos.map((e) => <FilaEvento key={`${e.tipo}-${e.id}`} evento={e} />)
              )}
            </div>
          )}

          <div className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${cuadra ? "bg-tinta/5" : cierre.diferencia > 0 ? "bg-verde-profundo/10" : "bg-rojo-profundo/10"}`}>
            <span className="text-tinta/70">Diferencia del cuadre</span>
            <span className={`font-semibold ${cuadra ? "text-tinta" : cierre.diferencia > 0 ? "text-verde-profundo" : "text-rojo-profundo"}`}>
              {cierre.diferencia >= 0 ? "+" : ""}
              {money(cierre.diferencia)}
            </span>
          </div>
          {/* ADR-0186: a dónde fue el efectivo y cuánto quedó en el cajón (solo cierres desde entonces). */}
          {(cierre.traslados.length > 0 || cierre.montoFondo !== null) && (
            <dl className="space-y-1 text-sm">
              {cierre.traslados.map((t, i) => (
                <div key={i} className="flex justify-between gap-3">
                  <dt className="text-tinta/65">
                    Trasladado · {etiquetaDestino(t.destino)}
                    {t.referencia && <span className="text-tinta/45"> · {t.referencia}</span>}
                  </dt>
                  <dd className="whitespace-nowrap tabular-nums">-{money(t.monto)}</dd>
                </div>
              ))}
              {cierre.montoFondo !== null && (
                <div className="flex justify-between gap-3 font-semibold">
                  <dt>Quedó en el cajón</dt>
                  <dd className="whitespace-nowrap tabular-nums">{money(cierre.montoFondo)}</dd>
                </div>
              )}
              {cierre.montoFondo !== null && cierre.fondoRequerido !== null && cierre.montoFondo + 0.004 < cierre.fondoRequerido && (
                <div className="flex justify-between gap-3 text-ambar-profundo">
                  <dt>Dejó menos del fondo</dt>
                  <dd className="whitespace-nowrap tabular-nums">pedía {money(cierre.fondoRequerido)}</dd>
                </div>
              )}
            </dl>
          )}
          {cierre.motivoDiferenciaApertura && cierre.aperturaEsperada !== null && (
            <p className="rounded-md bg-ambar/10 px-3 py-2 text-xs text-ambar-profundo">
              Abrió con {money(cierre.montoApertura)} y el cierre anterior había dejado {money(cierre.aperturaEsperada)}:
              «{cierre.motivoDiferenciaApertura}».
            </p>
          )}
          {cierre.nota && <p className="text-xs italic text-tinta/60">{cierre.nota}</p>}

          <button type="button" onClick={cerrar} className={botonCancelar}>
            Cerrar
          </button>
        </div>
      )}
    </Modal>
  );
}

function FilaEvento({ evento: e }: { evento: EventoCaja }) {
  if (e.tipo === "venta") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm">
        <span className="min-w-0 truncate text-tinta/80">
          <span className="label-cayla mr-2 text-[10px] text-tinta/45">{hora(e.hora)}</span>
          {e.anulada ? <span className="text-tinta/50 line-through">Venta anulada</span> : `Venta · ${e.unidades} prenda${e.unidades === 1 ? "" : "s"}`}
          {e.metodos.length > 0 && <span className="text-tinta/50"> · {e.metodos.join(", ")}</span>}
        </span>
        <span className={`shrink-0 tabular-nums ${e.anulada ? "text-tinta/40 line-through" : "text-verde-profundo"}`}>+{money(e.total)}</span>
      </div>
    );
  }
  if (e.tipo === "movimiento") {
    const signo = e.direccion === "ingreso" ? "+" : "-";
    return (
      <div className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm">
        <span className="min-w-0 truncate text-tinta/80">
          <span className="label-cayla mr-2 text-[10px] text-tinta/45">{hora(e.hora)}</span>
          {e.motivo}
          {e.esAjuste && <span className="text-tinta/50"> · ajuste</span>}
          {e.nota && <span className="text-tinta/50"> · {e.nota}</span>}
        </span>
        <span className={`shrink-0 tabular-nums ${e.direccion === "ingreso" ? "text-verde-profundo" : "text-rojo-profundo"}`}>
          {signo}
          {money(e.monto)}
        </span>
      </div>
    );
  }
  if (e.tipo === "devolucion") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm">
        <span className="min-w-0 truncate text-tinta/80">
          <span className="label-cayla mr-2 text-[10px] text-tinta/45">{hora(e.hora)}</span>
          Devolución · reembolso {e.metodo ?? "—"}
        </span>
        <span className="shrink-0 tabular-nums text-rojo-profundo">-{money(e.monto)}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm">
      <span className="min-w-0 truncate text-tinta/80">
        <span className="label-cayla mr-2 text-[10px] text-tinta/45">{hora(e.hora)}</span>
        Cambio · diferencia {e.metodo ?? "—"}
      </span>
      <span className={`shrink-0 tabular-nums ${e.diferencia >= 0 ? "text-verde-profundo" : "text-rojo-profundo"}`}>
        {e.diferencia >= 0 ? "+" : ""}
        {money(e.diferencia)}
      </span>
    </div>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label-cayla text-[10px] text-tinta/55">{etiqueta}</dt>
      <dd className="truncate text-sm text-tinta">{children}</dd>
    </div>
  );
}
