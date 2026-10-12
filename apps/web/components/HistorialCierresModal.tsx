"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Volver } from "@/components/ui/Volver";
import { ANCHO_DETALLE_CIERRE, DetalleCierreContenido, bajadaDelCierre, tituloDelCierre, useDatosDetalleCierre } from "@/components/CierreCajaDetalle";
import type { CierreCaja } from "@/lib/caja";
import { agruparPorMes, bloqueFecha, estadoCierre, resumirCierres } from "@/lib/historial-cierres-reglas";

function money(n: number) {
  return (n >= 0 ? "S/ " : "-S/ ") + Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hora(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

const BARRA = { cuadro: "bg-verde", sobro: "bg-ambar", falto: "bg-rojo" } as const;
const TONO: Record<keyof typeof BARRA, TonoChip> = { cuadro: "verde", sobro: "ambar", falto: "rojo" };

/**
 * «Historial de cierres» desde la cabecera de Caja: los últimos cierres de esta sede, con su resumen, un filtro para
 * ir directo a los que no cuadraron y agrupados por mes. Tocar una fila abre el detalle de ese cierre EN LA MISMA HOJA
 * (Felipe 2026-10-10, opción «A ampliada»): la hoja crece de ancho para dejar los movimientos a la derecha y arriba lleva
 * «← Historial de cierres» para volver. La lista queda montada (escondida) mientras se mira un cierre, así que al volver el
 * filtro y el lugar del desplazamiento siguen donde estaban. La lógica (resumen, agrupado, estado) vive en
 * `lib/historial-cierres-reglas.ts`.
 */
export function HistorialCierresModal({ cierres, ubicacionNombre, onClose }: { cierres: CierreCaja[]; ubicacionNombre: string; onClose: () => void }) {
  const [soloDiferencia, setSoloDiferencia] = useState(false);
  const { abierto, abrir, cerrar, detalle, cargando, error } = useDatosDetalleCierre();
  const lista = useRef<HTMLDivElement>(null);
  const desplazamiento = useRef({ hoja: 0, lista: 0 });
  const resumen = useMemo(() => resumirCierres(cierres), [cierres]);
  const grupos = useMemo(() => agruparPorMes(soloDiferencia ? cierres.filter((c) => estadoCierre(c.diferencia) !== "cuadro") : cierres), [cierres, soloDiferencia]);

  // La hoja es la que se desplaza (`role="dialog"`); la lista de cierres tiene además su propio desplazamiento.
  const hoja = () => lista.current?.closest<HTMLElement>('[role="dialog"]') ?? null;
  const listaScroll = () => lista.current?.querySelector<HTMLElement>("[data-lista-cierres]") ?? null;

  function verCierre(c: CierreCaja) {
    desplazamiento.current = { hoja: hoja()?.scrollTop ?? 0, lista: listaScroll()?.scrollTop ?? 0 };
    abrir(c);
    // El detalle empieza arriba y el foco pasa a la hoja: la fila que se tocó queda escondida.
    requestAnimationFrame(() => {
      hoja()?.scrollTo({ top: 0 });
      hoja()?.focus({ preventScroll: true });
    });
  }

  function volver() {
    const id = abierto?.id;
    cerrar();
    requestAnimationFrame(() => {
      hoja()?.scrollTo({ top: desplazamiento.current.hoja });
      listaScroll()?.scrollTo({ top: desplazamiento.current.lista });
      lista.current?.querySelector<HTMLElement>(`[data-cierre-id="${id}"]`)?.focus({ preventScroll: true });
    });
  }

  return (
    <Modal
      conCerrar
      titulo={abierto ? tituloDelCierre(abierto) : "Historial de cierres"}
      subtitulo={abierto ? bajadaDelCierre(abierto) : `${ubicacionNombre} · ${cierres.length === 0 ? "sin cierres todavía" : `últimos ${cierres.length}`}`}
      onClose={onClose}
      // La hoja crece (o se encoge) al pasar de la lista al detalle con el mismo ritmo de las demás: `ease-cayla`, sin rebote.
      ancho={`${abierto ? ANCHO_DETALLE_CIERRE : "max-w-xl"} transition-[max-width] duration-300 ease-cayla motion-reduce:transition-none`}
      arriba={
        abierto ? (
          <div className="mb-3 flex items-center gap-2.5 pr-10">
            <Volver onClick={volver} a="Historial de cierres" />
            <button type="button" tabIndex={-1} aria-hidden onClick={volver} className="label-cayla text-[11px] text-taupe transition-colors hover:text-tinta">
              Historial de cierres
            </button>
          </div>
        ) : undefined
      }
    >
      <div ref={lista} hidden={abierto !== null}>
        {cierres.length === 0 ? (
          <p className="py-8 text-center text-sm text-tinta/60">Todavía no hay cierres en esta sede. Aparecerán aquí cuando se cierre la primera caja.</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <TarjetaCifra etiqueta="Cierres" valor={resumen.total} />
              <TarjetaCifra etiqueta="Cuadraron" valor={resumen.cuadraron} tono="text-verde-profundo">
                de {resumen.total}
              </TarjetaCifra>
              <TarjetaCifra
                etiqueta="Diferencia neta"
                valor={`${resumen.diferenciaNeta > 0 ? "+" : ""}${money(resumen.diferenciaNeta)}`}
                tono={resumen.diferenciaNeta === 0 ? undefined : resumen.diferenciaNeta > 0 ? "text-ambar-profundo" : "text-rojo-profundo"}
              >
                {resumen.diferenciaNeta === 0 ? "todo en orden" : resumen.diferenciaNeta > 0 ? "sobró en total" : "faltó en total"}
              </TarjetaCifra>
            </div>

            <div role="group" aria-label="Filtrar cierres" className="mt-4 flex flex-wrap gap-2">
              <button type="button" aria-pressed={!soloDiferencia} onClick={() => setSoloDiferencia(false)} className="pildora-cayla">
                Todos
              </button>
              <button type="button" aria-pressed={soloDiferencia} onClick={() => setSoloDiferencia(true)} className="pildora-cayla">
                Con diferencia · {resumen.conDiferencia}
              </button>
            </div>

            <div data-lista-cierres className="scroll-cayla -mx-1 mt-2 max-h-[52vh] overflow-y-auto px-1">
              {grupos.length === 0 && <p className="py-8 text-center text-sm text-tinta/60">Todos los cierres cuadraron. No hay nada que revisar.</p>}
              {grupos.map((g) => (
                <section key={g.clave} aria-label={g.etiqueta}>
                  <h3 className="label-cayla sticky top-0 z-10 bg-[var(--fondo-hoja)] pb-1 pt-3 text-[10px] text-tinta/60">{g.etiqueta}</h3>
                  <ul className="divide-y divide-sand border-y border-sand">
                    {g.cierres.map((c) => {
                      const estado = estadoCierre(c.diferencia);
                      const { dia, diaSemana } = bloqueFecha(c.cerradaEn);
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            data-cierre-id={c.id}
                            onClick={() => verCierre(c)}
                            className="group relative grid w-full grid-cols-[2.75rem_1fr_auto_1rem] items-center gap-3 py-2.5 pl-3 pr-1 text-left transition-colors hover:bg-sand/30"
                            aria-label={`Ver el detalle del cierre del ${dia} (${diaSemana})`}
                          >
                            <span className={`absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-r ${BARRA[estado]}`} aria-hidden />
                            <span className="text-center leading-none">
                              <span className="font-display block text-[22px] text-tinta">{dia}</span>
                              <span className="label-cayla text-[10px] text-tinta/60">{diaSemana}</span>
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-tinta">{c.cerradaPorNombre ?? "—"}</span>
                              <span className="block truncate text-xs text-tinta/60">
                                {hora(c.abiertaEn)} – {hora(c.cerradaEn)} · contó {money(c.montoCierreReal)}
                              </span>
                            </span>
                            <Chip tono={TONO[estado]} versalitas={false}>
                              {estado === "cuadro" ? "Cuadró" : `${estado === "sobro" ? "Sobró" : "Faltó"} ${money(Math.abs(c.diferencia))}`}
                            </Chip>
                            <ChevronRight className="h-4 w-4 text-tinta/40 transition-colors group-hover:text-rojo" aria-hidden />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
        <div className="flex items-center justify-between gap-3 pt-3">
          <p className="text-xs text-tinta/60">Toca un cierre para ver su detalle</p>
          <Link href="/caja/historial" className="label-cayla text-[11px] text-rojo hover:text-rojo-profundo">
            Ver todas las sedes →
          </Link>
        </div>
      </div>
      {abierto && <DetalleCierreContenido cierre={abierto} detalle={detalle} cargando={cargando} error={error} />}
    </Modal>
  );
}
