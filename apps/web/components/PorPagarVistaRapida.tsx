"use client";

import Link from "next/link";
import { ArrowUpRight, Banknote } from "lucide-react";
import { BotonPagar } from "@/components/CompraDetallePanel";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Cajon } from "@/components/ui/Cajon";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import type { DatosPagoProveedor, ResultadoPago } from "@/components/PagoPiezas";
import { ETIQUETA_METODO_PAGO, soles, type CompraResumen, type PagoCompra } from "@/lib/compras-reglas";
import { diaMes, diasHastaLima, hoyLima } from "@/lib/fechas-lima";
import type { NotaPendiente } from "@/lib/compras-indicadores";
import { etiquetaVence, pasosDeComprobante, tramoDe, type PasoDeComprobante } from "@/lib/por-pagar-reglas";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { MarcaNoDeducible } from "@/components/MarcaNoDeducible";
import { Vacio } from "@/components/ui/Vacio";

const BORDE: Record<PasoDeComprobante["tono"], string> = { rojo: "border-l-rojo", ambar: "border-l-ambar", verde: "border-l-verde", neutro: "border-l-tinta/25" };

// Vista rápida de un comprobante por pagar (spike 2026-09-19, mismo modelo que `ProveedorVistaRapida`, ADR-0128):
// al tocar una fila se abre un cajón desde el borde derecho en vez de saltar al detalle. El problema que resuelve:
// para decidir a cuál pagar primero hay que mirar varios comprobantes, y cada visita al detalle te sacaba de la
// lista, perdiendo el orden, el filtro y lo marcado. Acá la lista queda detrás, intacta, y con ↑ ↓ se pasa de un
// comprobante al siguiente sin cerrar.
//
// Lo ve quien tiene Por pagar (antes solo el líder, ADR-0126); desde ADR-0387, con el comprobante entero de cualquier tienda y
// pagando a nombre de la empresa, sin elegir tienda. El detalle completo sigue siendo la
// pantalla de referencia: esto es el vistazo, no la reemplaza. El historial de pagos vive allí: `CompraResumen`
// no lo trae y pedirlo en cada clic sería una consulta más por fila; aquí van el total, lo pagado y el plazo.
//
// El cajón es la pieza del sistema (`<Cajon>`, ADR-0358, ronda 17): la banda, el pie con «n de N» y el cierre en dos tiempos.
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
}) {
  const tramo = tramoDe(c, ahora);
  const tonoChip: TonoChip = tramo === "vencidas" ? "rojo" : tramo === "semana" ? "ambar" : "neutro";
  const saldoFavor = datos?.saldoFavor ?? 0;
  const pasos = pasosDeComprobante(c, otros, { proveedor: c.proveedorNombre, saldoFavor, notaPendiente: nota?.montoEsperado ?? null, formato: soles }, ahora);

  return (
    <Cajon
      onCerrar={onCerrar}
      clave={c.id}
      guia="por-pagar.vista"
      guiaPie="por-pagar.vista-acciones"
      marca={<AvatarPersona personaId={null} nombre={c.proveedorNombre} tamano={40} />}
      sobre={c.proveedorNombre}
      titulo={<span className="tabular-nums">{c.documento}</span>}
      navegacion={{ indice: posicion.indice, total: posicion.total, onNavegar, que: "Comprobante" }}
      pie={
        <>
          <BotonPagar compra={c} saldoFavor={saldoFavor} datos={datos} onPagado={onPagado} etiqueta={`Pagar ${soles(c.saldo)}`} conIcono />
          <Link
            href={`/compras/factura/${c.id}`}
            className="btn-cayla btn-secundario inline-flex items-center gap-2"
          >
            Abrir comprobante <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        </>
      }
    >
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

      <div className="mt-[18px] space-y-3" data-guia="por-pagar.vista-pasos">
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
          <TituloGrupo className="mb-1">Pagos de este comprobante</TituloGrupo>
          {pagos.length === 0 ? (
            <Vacio tamano="chico" alinear="izquierda" className="border-t border-tinta/10 px-0" icono={<Banknote />}>Sin pagos todavía.</Vacio>
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
                  {p.noDeducible && <MarcaNoDeducible nd={p.noDeducible} montoDeLaFila={p.monto} className="col-span-full" />}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Cajon>
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
