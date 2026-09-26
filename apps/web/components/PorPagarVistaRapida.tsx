"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, ChevronDown, ChevronUp, X } from "lucide-react";
import { BotonPagar } from "@/components/CompraDetallePanel";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { useEscapeLibre } from "@/components/ui/useEscapeLibre";
import type { DatosPagoProveedor, ResultadoPago } from "@/components/PagoPiezas";
import { ETIQUETA_METODO_PAGO, soles, type CompraResumen, type PagoCompra } from "@/lib/compras-reglas";
import { diaMes, diasHastaLima, hoyLima } from "@/lib/fechas-lima";
import type { NotaPendiente } from "@/lib/compras-indicadores";
import { etiquetaVence, pasosDeComprobante, tramoDe, type PasoDeComprobante } from "@/lib/por-pagar-reglas";

/** Debe coincidir con `.anim-cajon-salida` en globals.css. */
const MS_SALIDA = 240;

const BORDE: Record<PasoDeComprobante["tono"], string> = { rojo: "border-l-rojo", ambar: "border-l-ambar", verde: "border-l-verde", neutro: "border-l-tinta/25" };

// Vista rápida de un comprobante por pagar (spike 2026-09-19, mismo modelo que `ProveedorVistaRapida`, ADR-0128):
// al tocar una fila se abre un cajón desde el borde derecho en vez de saltar al detalle. El problema que resuelve:
// para decidir a cuál pagar primero hay que mirar varios comprobantes, y cada visita al detalle te sacaba de la
// lista, perdiendo el orden, el filtro y lo marcado. Acá la lista queda detrás, intacta, y con ↑ ↓ se pasa de un
// comprobante al siguiente sin cerrar.
//
// Es solo de líder (el dinero de Compras solo llega a un líder, ADR-0126). El detalle completo sigue siendo la
// pantalla de referencia: esto es el vistazo, no la reemplaza. El historial de pagos vive allí: `CompraResumen`
// no lo trae y pedirlo en cada clic sería una consulta más por fila; aquí van el total, lo pagado y el plazo.
//
// Cierre en dos tiempos, igual que `Modal`: primero se anima la salida y recién ahí se le avisa al padre.
export function PorPagarVistaRapida({
  compra: c,
  otros,
  datos,
  nota,
  pagos,
  posicion,
  ahora,
  onCerrar,
  onNavegar,
  onPagado,
  misTiendas,
}: {
  compra: CompraResumen;
  /** Los demás comprobantes con saldo del mismo proveedor (los que la lista tiene a la vista). */
  otros: CompraResumen[];
  datos?: DatosPagoProveedor;
  nota?: NotaPendiente;
  /** Los pagos ya registrados de este comprobante (del más reciente al más antiguo); `undefined` si no se pudieron leer: la sección se omite. */
  pagos?: PagoCompra[];
  posicion: { indice: number; total: number };
  ahora: Date;
  onCerrar: () => void;
  onNavegar: (delta: 1 | -1) => void;
  /** El pago que se registra desde el cajón avisa a la lista, que hace reaccionar la pantalla y cierra el cajón. */
  onPagado: (r: ResultadoPago) => void;
  /** ADR-0184 (F4-F5): solo para un comprador de tienda — sus tiendas, para pagar con la que corresponda. */
  misTiendas?: { id: string; nombre: string }[];
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

  const tramo = tramoDe(c, ahora);
  const tonoChip: TonoChip = tramo === "vencidas" ? "rojo" : tramo === "semana" ? "ambar" : "neutro";
  const saldoFavor = datos?.saldoFavor ?? 0;
  const pasos = pasosDeComprobante(c, otros, { proveedor: c.proveedorNombre, saldoFavor, notaPendiente: nota?.montoEsperado ?? null, formato: soles }, ahora);

  return (
    <Dialog.Root open onOpenChange={(abierto) => !abierto && pedirCierre()}>
      <Dialog.Portal>
        <Dialog.Overlay className={`fixed inset-0 z-50 bg-tinta/25 backdrop-blur-[2px] ${cerrando ? "anim-velo-salida" : "anim-velo"}`} />
        <Dialog.Content
          onEscapeKeyDown={alEscape}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); onNavegar(1); }
            if (e.key === "ArrowUp") { e.preventDefault(); onNavegar(-1); }
          }}
          className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[28.5rem] flex-col border-l border-sand bg-papel outline-none ${cerrando ? "anim-cajon-salida" : "anim-cajon"}`}
        >
          {/* `key`: al pasar de un comprobante a otro el contenido se re-asienta (y la línea de vida se vuelve a dibujar);
              el cajón no se cierra ni se vuelve a abrir. */}
          <div key={c.id} className="anim-asentar flex min-h-0 flex-1 flex-col">
            <div className="flex items-start gap-3.5 border-b border-tinta/10 px-6 pb-4 pt-5">
              <span aria-hidden className="font-display grid h-14 w-14 shrink-0 place-items-center rounded-full bg-sand text-2xl text-tinta">
                {c.proveedorNombre.trim().split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <Dialog.Description className="label-cayla truncate text-[10.5px] text-tinta/65">{c.proveedorNombre}</Dialog.Description>
                <Dialog.Title asChild>
                  <h2 className="font-display text-[23px] leading-tight tabular-nums text-tinta">{c.documento}</h2>
                </Dialog.Title>
              </div>
              <button type="button" onClick={pedirCierre} aria-label="Cerrar" className="-mr-1 rounded-full p-1.5 text-tinta/55 transition-colors hover:bg-tinta/[0.04] hover:text-rojo">
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>

            <div className="scroll-cayla min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="label-cayla text-[10.5px] text-tinta/65">Saldo por pagar</p>
                  <p className="font-display text-[40px] leading-[1.1] tabular-nums text-tinta">{soles(c.saldo)}</p>
                </div>
                <Chip tono={tonoChip}>{c.fechaVencimiento ? etiquetaVence(c.fechaVencimiento, ahora) : "Sin fecha de vencimiento"}</Chip>
              </div>

              <dl className="mt-[18px] grid grid-cols-3 divide-x divide-sand overflow-hidden rounded-xl border border-sand">
                <div className="px-3.5 py-3">
                  <dt className="label-cayla text-[10px] text-tinta/65">Total</dt>
                  <dd className="font-display mt-0.5 text-[20px] leading-tight tabular-nums text-tinta">{soles(c.total)}</dd>
                </div>
                <div className="px-3.5 py-3">
                  <dt className="label-cayla text-[10px] text-tinta/65">Pagado</dt>
                  <dd className={`font-display mt-0.5 text-[20px] leading-tight tabular-nums ${c.pagado > 0 ? "text-verde-profundo" : "text-tinta/55"}`}>{c.pagado > 0 ? soles(c.pagado) : "—"}</dd>
                </div>
                <div className="px-3.5 py-3">
                  <dt className="label-cayla text-[10px] text-tinta/65">Crédito</dt>
                  <dd className="font-display mt-0.5 text-[20px] leading-tight tabular-nums text-tinta">{datos?.plazoCreditoDias != null ? `${datos.plazoCreditoDias} días` : "—"}</dd>
                </div>
              </dl>

              <LineaDeVida emision={c.fechaEmision} vencimiento={c.fechaVencimiento} ahora={ahora} />

              <div className="mt-[18px] space-y-3">
                {pasos.map((p, i) => (
                  <div key={i} className={`card-cayla anim-revelar border-l-2 px-4 py-3 text-[13.5px] text-tinta ${BORDE[p.tono]}`} style={{ animationDelay: `${180 + i * 80}ms` }}>
                    <b className="font-semibold">{p.fuerte}</b>
                    {p.resto}
                  </div>
                ))}
              </div>

              {/* Pagos de este comprobante (como en el spike): cuándo, con qué medio y cuánto. Sin pagos, se dice. */}
              {pagos && (
                <section className="mt-[22px]">
                  <h3 className="label-cayla mb-1 text-[11px] text-tinta/65">Pagos de este comprobante</h3>
                  {pagos.length === 0 ? (
                    <p className="border-t border-tinta/10 py-2.5 text-[13px] text-tinta/55">Sin pagos todavía.</p>
                  ) : (
                    <ul>
                      {pagos.map((p, i) => (
                        <li key={p.id} className="anim-revelar grid grid-cols-[3.4rem_1fr_auto] items-baseline gap-3 border-t border-tinta/10 py-2.5 text-[13px]" style={{ animationDelay: `${260 + i * 60}ms` }}>
                          <span className="tabular-nums text-tinta/55">{diaMes(p.fecha)}</span>
                          <span>
                            {ETIQUETA_METODO_PAGO[p.metodo] ?? p.metodo}
                            {p.referencia && <span className="block text-xs text-tinta/55">{p.referencia}</span>}
                          </span>
                          <b className="font-medium tabular-nums">{soles(p.monto)}</b>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 border-t border-tinta/10 px-6 py-4">
              <BotonPagar compra={c} saldoFavor={saldoFavor} datos={datos} onPagado={onPagado} etiqueta={`Pagar ${soles(c.saldo)}`} conIcono misTiendas={misTiendas} />
              <Link
                href={`/compras/factura/${c.id}`}
                className="label-cayla inline-flex items-center gap-2 rounded-md border border-tinta/25 px-3 py-3 text-[11px] text-tinta/80 transition-colors hover:border-rojo hover:text-rojo"
              >
                Abrir comprobante <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
              </Link>
              <span className="ml-auto flex items-center gap-1.5 text-xs tabular-nums text-tinta/55">
                {posicion.indice + 1} de {posicion.total}
                <button type="button" onClick={() => onNavegar(-1)} disabled={posicion.indice <= 0} aria-label="Comprobante anterior" className="rounded-md border border-tinta/15 p-1.5 transition-colors hover:border-rojo hover:text-rojo disabled:pointer-events-none disabled:opacity-35">
                  <ChevronUp aria-hidden className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onNavegar(1)} disabled={posicion.indice >= posicion.total - 1} aria-label="Comprobante siguiente" className="rounded-md border border-tinta/15 p-1.5 transition-colors hover:border-rojo hover:text-rojo disabled:pointer-events-none disabled:opacity-35">
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

// «Línea de vida» del comprobante: de la emisión (círculo) al vencimiento (raya), con HOY marcado. El avance se
// dibuja al abrir; si ya venció, el tramo pasado del vencimiento se dibuja en rojo, y HOY emite dos ondas y se
// queda quieto. `pathLength="1"` en cada línea: el dasharray es 1 sin medir nada. Todo en días de Lima.
function LineaDeVida({ emision, vencimiento, ahora }: { emision: string; vencimiento: string | null; ahora: Date }) {
  if (!vencimiento) return null;
  const dE = diasHastaLima(emision, ahora);
  const dV = diasHastaLima(vencimiento, ahora);
  const fin = Math.max(dV, 0) + 2;
  const span = Math.max(1, fin - dE);
  const x0 = 14;
  const x1 = 386;
  const X = (d: number) => x0 + ((d - dE) / span) * (x1 - x0);
  const xe = X(dE);
  const xv = X(dV);
  const xh = X(0);
  const vencida = dV < 0;
  const cerca = Math.abs(xh - xe) < 70;
  return (
    <div className="mt-[22px]">
      <svg viewBox="0 0 400 74" className="block h-auto w-full overflow-visible" role="img" aria-label={`Línea de vida: emitida ${diaMes(emision)}, vence ${diaMes(vencimiento)}${vencida ? ", ya vencida" : ""}`}>
        <line x1={xe} y1="30" x2={vencida ? xv : x1} y2="30" strokeWidth="2" strokeLinecap="round" className="stroke-tinta/15" />
        <line pathLength={1} x1={xe} y1="30" x2={vencida ? xv : xh} y2="30" strokeWidth="2" strokeLinecap="round" className="trazo-linea anim-trazo stroke-tinta" style={{ ["--i" as string]: 2 }} />
        {vencida && <line pathLength={1} x1={xv} y1="30" x2={xh} y2="30" strokeWidth="2" strokeLinecap="round" className="trazo-linea anim-trazo stroke-rojo" style={{ ["--i" as string]: 18 }} />}
        <circle cx={xe} cy="30" r="4.5" strokeWidth="1.8" className="anim-revelar fill-papel stroke-tinta" />
        <line x1={xv} y1="22" x2={xv} y2="38" strokeWidth="2" strokeLinecap="round" className="stroke-tinta" />
        <circle cx={xh} cy="30" r="5" className="anim-vivo-onda fill-rojo" style={{ transformBox: "fill-box", transformOrigin: "center", animationDelay: "1200ms" }} />
        <circle cx={xh} cy="30" r="5" className="anim-revelar fill-rojo" style={{ animationDelay: "900ms" }} />
        <text x={xe} y="56" textAnchor={xe < 40 ? "start" : "middle"} className="fill-tinta/65 text-[10.5px] font-medium">
          Emitida {diaMes(emision)}
        </text>
        <text x={Math.min(xv, x1 - 30)} y="14" textAnchor={xv > x1 - 50 ? "end" : "middle"} className="fill-tinta text-[10.5px] font-semibold">
          Vence {diaMes(vencimiento)}
        </text>
        <text x={xh} y={cerca ? 70 : 56} textAnchor="middle" className="fill-rojo text-[10.5px] font-semibold">
          Hoy {diaMes(hoyLima(ahora))}
        </text>
      </svg>
    </div>
  );
}
