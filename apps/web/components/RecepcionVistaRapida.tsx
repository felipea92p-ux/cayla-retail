"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { Chip } from "@/components/ui/Chip";
import { useEscapeLibre } from "@/components/ui/useEscapeLibre";
import { diaMes, hoyLima } from "@/lib/fechas-lima";
import { inicialesProveedor } from "@/lib/envio-reglas";
import type { LineaRecepcion } from "@/lib/compras-reglas";
import type { RecepcionDeCompra } from "@/lib/compras-indicadores";

/** Debe coincidir con `.anim-cajon-salida` en globals.css. */
const MS_SALIDA = 240;

// Vista rápida de una recepción (spike de Recibir, 2026-09-19; mismo patrón que `ProveedorVistaRapida`, ADR-0128):
// tocar una fila de «Recibidas» abre un cajón desde el borde derecho en vez de un modal. El problema que resuelve:
// comparar cinco recepciones obligaba a abrir y cerrar cinco modales; acá la lista queda detrás, intacta, y con ↑ ↓
// se pasa de una a la siguiente sin cerrar. Cierre en dos tiempos, como `Modal`: primero sale, luego se desmonta.
//
// El detalle prenda por prenda viaja ya cargado (`detalles`, de `getRecepcionesRecientes`): con ≤ 30 filas no vale
// un viaje al abrir. El enlace al comprobante completo es de Compras (solo líder): un colaborador no lo ve.
export function RecepcionVistaRapida({
  recepcion: r,
  detalle,
  recibio,
  posicion,
  enlaceAlComprobante,
  onCerrar,
  onNavegar,
}: {
  recepcion: RecepcionDeCompra;
  detalle: LineaRecepcion[];
  recibio: string | null;
  posicion: { indice: number; total: number };
  enlaceAlComprobante: boolean;
  onCerrar: () => void;
  onNavegar: (delta: 1 | -1) => void;
}) {
  const [cerrando, setCerrando] = useState(false);
  const pedirCierre = useCallback(() => setCerrando(true), []);
  useEffect(() => {
    if (!cerrando) return;
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(onCerrar, reducido ? 0 : MS_SALIDA);
    return () => clearTimeout(t);
  }, [cerrando, onCerrar]);
  // Escape cierra el cajón solo si ningún control de adentro lo usó (useEscapeLibre.ts).
  const alEscape = useEscapeLibre(pedirCierre);

  const faltan = r.faltante > 0 ? r.faltante : 0;
  const pct = r.unidadesFacturadas > 0 ? Math.min(100, (r.unidadesLlegaron / r.unidadesFacturadas) * 100) : 0;

  return (
    <Dialog.Root open onOpenChange={(abierto) => !abierto && pedirCierre()}>
      <Dialog.Portal>
        <Dialog.Overlay className={`fixed inset-0 z-50 bg-tinta/25 backdrop-blur-[2px] ${cerrando ? "anim-velo-salida" : "anim-velo"}`} />
        <Dialog.Content
          onEscapeKeyDown={alEscape}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              onNavegar(1);
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onNavegar(-1);
            }
          }}
          className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[28.5rem] flex-col border-l border-sand bg-papel outline-none ${cerrando ? "anim-cajon-salida" : "anim-cajon"}`}
        >
          {/* `key`: al pasar de una recepción a otra el contenido se re-asienta; el cajón no se cierra ni se vuelve a abrir. */}
          <div key={`${r.loteId}-${r.compraId}`} className="anim-asentar flex min-h-0 flex-1 flex-col">
            <div className="flex items-start gap-3.5 border-b border-tinta/10 px-6 pb-4 pt-5">
              <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sand text-[13px] font-bold tracking-wide text-tinta/75">
                {inicialesProveedor(r.proveedorNombre)}
              </span>
              <div className="min-w-0 flex-1">
                <Dialog.Title asChild>
                  <h2 className="font-display text-[23px] leading-tight text-tinta">{r.proveedorNombre}</h2>
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-[12.5px] text-tinta/65">
                  {diaMes(hoyLima(new Date(r.fechaRecepcion)))} · {r.numeroGuia ? `Guía ${r.numeroGuia}` : "Sin guía"} · {r.ubicacionNombre}
                  {recibio ? (
                    <>
                      <br />
                      Recibido por {recibio}
                    </>
                  ) : null}
                </Dialog.Description>
              </div>
              <button type="button" onClick={pedirCierre} aria-label="Cerrar" className="-mr-1 rounded-full p-1.5 text-tinta/55 transition-colors hover:bg-tinta/[0.04] hover:text-rojo">
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>

            <div className="scroll-cayla min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
              <dl className="grid grid-cols-3 divide-x divide-sand overflow-hidden rounded-xl border border-sand">
                <div className="px-3.5 py-3">
                  <dt className="label-cayla text-[10px] text-tinta/65">Llegó</dt>
                  <dd className="font-display mt-0.5 text-[21px] leading-tight tabular-nums text-tinta">
                    <CifraQueCuenta valor={r.unidadesLlegaron} alMontar />
                  </dd>
                </div>
                <div className="px-3.5 py-3">
                  <dt className="label-cayla text-[10px] text-tinta/65">Facturado</dt>
                  <dd className="font-display mt-0.5 text-[21px] leading-tight tabular-nums text-tinta">{r.unidadesFacturadas.toLocaleString("es-PE")}</dd>
                </div>
                <div className="px-3.5 py-3">
                  <dt className="label-cayla text-[10px] text-tinta/65">Demora</dt>
                  <dd className="font-display mt-0.5 text-[21px] leading-tight tabular-nums text-tinta">
                    <CifraQueCuenta valor={r.diasDemora} alMontar />
                    <small className="ml-1 font-sans text-[13px] text-tinta/65">{r.diasDemora === 1 ? "día" : "días"}</small>
                  </dd>
                </div>
              </dl>

              <div className="mt-5 flex items-center justify-between gap-3">
                <span className="label-cayla text-[10.5px] text-tinta/55">Cómo llegó {r.documento}</span>
                <Chip tono={faltan > 0 ? "ambar" : "verde"}>
                  {faltan === 0 && <Check aria-hidden className="check-trazo -ml-0.5 mr-1 inline h-3 w-3" strokeWidth={2.4} style={{ "--d": "300ms" } as CSSProperties} />}
                  {faltan > 0 ? `Faltan ${faltan}` : "Completa"}
                </Chip>
              </div>
              <div className="mb-5 mt-2 h-1.5 overflow-hidden rounded-full bg-sand">
                <div className={`anim-crece-x h-full rounded-full ${faltan > 0 ? "bg-ambar" : "bg-verde"}`} style={{ width: `${pct}%` }} />
              </div>

              <h3 className="label-cayla mb-1 text-[10.5px] text-tinta/55">Prenda por prenda</h3>
              {detalle.length > 0 ? (
                <ul className="divide-y divide-tinta/10">
                  {detalle.map((l, i) => (
                    <li key={i} style={{ "--i": i + 2 } as CSSProperties} className="anim-entra flex items-baseline justify-between gap-3 py-2.5 text-[13.5px]">
                      <span className="min-w-0 text-tinta">
                        {l.referencia}
                        {l.sku ? ` · ${l.sku}` : ""}
                        <span className="block truncate text-xs text-tinta/55">{[l.talla, l.color].filter(Boolean).join(" / ") || "—"}</span>
                      </span>
                      <b className="font-display text-[19px] font-normal tabular-nums text-tinta">{l.cantidad}</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-tinta/65">El detalle prenda por prenda de esta guía ya no está en la lista reciente. Ábrelo desde el comprobante.</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 border-t border-tinta/10 px-6 py-4">
              {enlaceAlComprobante ? (
                <Link href={`/compras/factura/${r.compraId}`} onClick={pedirCierre} className="label-cayla text-[11px] text-rojo hover:underline">
                  Ver comprobante completo →
                </Link>
              ) : (
                <span className="text-xs text-tinta/55">El detalle del comprobante es de Compras.</span>
              )}
              <span className="ml-auto flex items-center gap-1.5 text-xs tabular-nums text-tinta/55">
                {posicion.indice + 1} de {posicion.total}
                <button type="button" onClick={() => onNavegar(-1)} aria-label="Recepción anterior" className="rounded-md border border-tinta/15 p-1.5 transition-colors hover:border-rojo hover:text-rojo">
                  <ChevronUp aria-hidden className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onNavegar(1)} aria-label="Recepción siguiente" className="rounded-md border border-tinta/15 p-1.5 transition-colors hover:border-rojo hover:text-rojo">
                  <ChevronDown aria-hidden className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
