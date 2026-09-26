"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, ChevronDown, ChevronUp, X } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { useEscapeLibre } from "@/components/ui/useEscapeLibre";
import { useFlechasDelCajon } from "@/components/ui/useFlechasDelCajon";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { ETIQUETA_MOTIVO_NOTA, chipEstado, hace, pasosDeNota, siguientePaso, type FilaVista } from "@/lib/notas-credito-reglas";

/** Debe coincidir con `.anim-cajon-salida` en globals.css. */
const MS_SALIDA = 240;

/* ====================================================================
   Vista rápida de una nota (2026-09-19) — el cajón de la derecha
   Spike: docs/maquetas/notas-credito-spike-2026-09/ (pantalla 1b)

   El mismo modelo que `PorPagarVistaRapida` y `ProveedorVistaRapida` (ADR-0128): para decidir a qué
   proveedor llamar hay que mirar varias notas seguidas, y cada visita al detalle te sacaba de la lista
   perdiendo el orden y el filtro. Acá la lista queda detrás, intacta, y con ↑ ↓ se pasa de una nota a
   la siguiente sin cerrar el cajón.

   Lo que se ve, en el orden en que se decide: cuánto es · en qué estado está · su recorrido · QUÉ HACER
   AHORA (una sola frase, con su porqué) · de dónde salió.
   ==================================================================== */

const BORDE_SUGERENCIA: Record<ReturnType<typeof siguientePaso>["tono"], string> = {
  actuar: "border-l-rojo",
  aviso: "border-l-ambar",
  bien: "border-l-verde",
  espera: "border-l-tinta/45",
};

export function NotaCreditoVistaRapida({
  nota: f,
  posicion,
  onCerrar,
  onNavegar,
  onRegistrar,
  onDetalle,
}: {
  nota: FilaVista;
  posicion: { indice: number; total: number };
  onCerrar: () => void;
  onNavegar: (delta: 1 | -1) => void;
  onRegistrar: (compraId: string) => void;
  onDetalle: (id: string) => void;
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
  // ↑ ↓ pasan de nota solo con teclas del cajón: no con las de un modal abierto desde aquí (useFlechasDelCajon.ts).
  const alFlecha = useFlechasDelCajon(onNavegar);

  const chip = chipEstado(f);
  const sugerencia = siguientePaso(f);
  const pasos = pasosDeNota(f);
  const iniciales = f.proveedorNombre.trim().split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  // Las tres celdas que responden «¿qué pasó con el dinero?» de un vistazo. En una pendiente todavía no
  // pasó nada: lo que se muestra es lo que VA a pasar.
  const celdas: { titulo: string; valor: string; pie: string; tono?: string }[] =
    f.clase === "pendiente"
      ? [
          { titulo: "Comprobante", valor: f.documento, pie: `debes ${soles(f.compraSaldo)}` },
          { titulo: "Antigüedad", valor: `${f.edadDias} ${f.edadDias === 1 ? "día" : "días"}`, pie: `cerrado el ${diaMes(f.cerradoEn?.slice(0, 10) ?? f.fecha)}` },
          { titulo: "Unidades", valor: f.unidadesCerradas.toLocaleString("es-PE"), pie: "cerradas sin llegar" },
        ]
      : [
          { titulo: "Bajó la deuda", valor: soles(f.aplicado), pie: `de ${f.documento}` },
          { titulo: "Devuelto", valor: soles(f.devuelto?.monto ?? 0), pie: f.devuelto ? `${diaMes(f.devuelto.fecha)} · ${f.devuelto.metodo ?? "sin medio"}` : "nada devuelto", tono: f.devuelto ? "text-verde-profundo" : undefined },
          { titulo: "A favor", valor: soles(f.vivo), pie: f.vivo > 0.004 ? "sin usar" : "nada a favor", tono: f.vivo > 0.004 ? "text-verde-profundo" : undefined },
        ];

  return (
    <Dialog.Root open onOpenChange={(abierto) => !abierto && pedirCierre()}>
      <Dialog.Portal>
        <Dialog.Overlay className={`fixed inset-0 z-50 bg-tinta/25 backdrop-blur-[2px] ${cerrando ? "anim-velo-salida" : "anim-velo"}`} />
        <Dialog.Content
          onEscapeKeyDown={alEscape}
          onKeyDown={alFlecha}
          className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[28.5rem] flex-col border-l border-sand bg-papel outline-none ${cerrando ? "anim-cajon-salida" : "anim-cajon"}`}
        >
          {/* `key`: al pasar de una nota a otra el contenido se re-asienta; el cajón no se cierra. */}
          <div key={f.id} className="anim-asentar flex min-h-0 flex-1 flex-col">
            <div className="flex items-start gap-3.5 border-b border-tinta/10 px-6 pb-4 pt-5">
              <span aria-hidden className="font-display grid h-14 w-14 shrink-0 place-items-center rounded-full bg-sand text-2xl text-tinta">{iniciales}</span>
              <div className="min-w-0 flex-1">
                <Dialog.Description className="label-cayla truncate text-[10.5px] text-tinta/65">{f.clase === "pendiente" ? "Nota por reclamar" : `Nota ${f.serieNumero ?? ""}`}</Dialog.Description>
                <Dialog.Title asChild>
                  <h2 className="font-display truncate text-[23px] leading-tight text-tinta">{f.proveedorNombre}</h2>
                </Dialog.Title>
                <p className="truncate text-[13px] text-tinta/55">{f.documento}</p>
              </div>
              <button type="button" onClick={pedirCierre} aria-label="Cerrar vista rápida" className="-mr-1 rounded-full p-1.5 text-tinta/55 transition-colors hover:bg-tinta/[0.04] hover:text-rojo">
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>

            <div className="scroll-cayla min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
              <p className="label-cayla text-[10.5px] text-tinta/65">{f.clase === "pendiente" ? "Esperado con IGV" : "Monto de la nota"}</p>
              <p className="font-display text-[40px] leading-[1.1] tabular-nums text-tinta">{soles(f.monto)}</p>
              <div className="mb-[18px] mt-2.5 flex flex-wrap gap-2">
                <Chip tono={chip.tono}>{chip.texto}</Chip>
                {f.clase === "pendiente" && !f.bloqueada && <Chip tono={f.tramo === "urgente" ? "rojo" : f.tramo === "medio" ? "ambar" : "neutro"}>{hace(f.edadDias)}</Chip>}
                {f.motivo && <Chip tono="neutro">{ETIQUETA_MOTIVO_NOTA[f.motivo] ?? f.motivo}</Chip>}
              </div>

              <dl className="grid grid-cols-3 divide-x divide-sand overflow-hidden rounded-xl border border-sand">
                {celdas.map((c) => (
                  <div key={c.titulo} className="min-w-0 px-3.5 py-3">
                    <dt className="label-cayla text-[10px] text-tinta/65">{c.titulo}</dt>
                    <dd className={`font-display mt-0.5 truncate text-[20px] leading-tight tabular-nums ${c.tono ?? "text-tinta"}`}>{c.valor}</dd>
                    <dd className="truncate text-[11.5px] text-tinta/55">{c.pie}</dd>
                  </div>
                ))}
              </dl>

              <LineaDeVida pasos={pasos} />

              <div className={`card-cayla anim-revelar mt-[18px] border-l-2 px-4 py-3 text-[13.5px] leading-relaxed text-tinta ${BORDE_SUGERENCIA[sugerencia.tono]}`} style={{ animationDelay: "220ms" }}>
                {sugerencia.texto}
              </div>

              <section className="mt-[22px]">
                <h3 className="label-cayla mb-1 text-[11px] text-tinta/65">De dónde sale</h3>
                <dl className="text-[13px]">
                  <Dato k="Comprobante" v={`${f.documento} · emitido el ${diaMes(f.compraFechaEmision)}`} />
                  <Dato k="Total" v={soles(f.compraTotal)} />
                  <Dato k="Se debe hoy" v={soles(f.compraSaldo)} />
                  {f.clase === "nota" && f.nota && <Dato k="Nota" v={f.nota} />}
                </dl>
              </section>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 border-t border-tinta/10 px-6 py-4">
              {f.clase === "pendiente" ? (
                <button
                  type="button"
                  disabled={f.bloqueada}
                  onClick={() => onRegistrar(f.compraId)}
                  className="label-cayla boton-brillo rounded-md bg-tinta px-3 py-3 text-[11px] text-crema transition-colors hover:bg-rojo disabled:pointer-events-none disabled:opacity-40"
                >
                  {f.bloqueada ? "Aún no se puede" : "Registrar nota"}
                </button>
              ) : null}
              <button type="button" onClick={() => onDetalle(f.id)} className="label-cayla rounded-md border border-tinta/25 px-3 py-3 text-[11px] text-tinta/80 transition-colors hover:border-rojo hover:text-rojo">
                Ver detalle
              </button>
              <Link href={`/compras/factura/${f.compraId}`} className="label-cayla inline-flex items-center gap-2 rounded-md border border-tinta/25 px-3 py-3 text-[11px] text-tinta/80 transition-colors hover:border-rojo hover:text-rojo">
                Comprobante <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
              </Link>
              <span className="ml-auto flex items-center gap-1.5 text-xs tabular-nums text-tinta/55">
                {posicion.indice + 1} de {posicion.total}
                <button type="button" onClick={() => onNavegar(-1)} disabled={posicion.indice <= 0} aria-label="Nota anterior" className="rounded-md border border-tinta/15 p-1.5 transition-colors hover:border-rojo hover:text-rojo disabled:pointer-events-none disabled:opacity-35">
                  <ChevronUp aria-hidden className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onNavegar(1)} disabled={posicion.indice >= posicion.total - 1} aria-label="Nota siguiente" className="rounded-md border border-tinta/15 p-1.5 transition-colors hover:border-rojo hover:text-rojo disabled:pointer-events-none disabled:opacity-35">
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

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-4 border-t border-tinta/10 py-2">
      <dt className="text-tinta/55">{k}</dt>
      <dd className="truncate text-right tabular-nums text-tinta">{v}</dd>
    </div>
  );
}

/**
 * La línea de vida horizontal: los pasos de la nota, con el avance DIBUJÁNDOSE hasta el último hecho.
 * `pathLength="1"` para que el dasharray sea 1 sin medir nada (mismo recurso que Por pagar).
 */
function LineaDeVida({ pasos }: { pasos: ReturnType<typeof pasosDeNota> }) {
  const n = pasos.length;
  if (n === 0) return null;
  const x0 = 44;
  const x1 = 356;
  const X = (i: number) => (n === 1 ? 200 : x0 + ((x1 - x0) * i) / (n - 1));
  const ultimoHecho = Math.max(0, pasos.map((p) => p.estado).lastIndexOf("hecho"));
  return (
    <div className="mt-[22px]">
      <svg viewBox="0 0 400 56" className="block h-auto w-full overflow-visible" role="img" aria-label={`Recorrido de la nota: ${pasos.map((p) => `${p.clave} ${p.estado === "hecho" ? "hecho" : "pendiente"}`).join(", ")}`}>
        <line x1={X(0)} y1="14" x2={X(n - 1)} y2="14" strokeWidth="2" strokeLinecap="round" className="stroke-tinta/15" />
        {ultimoHecho > 0 && <line pathLength={1} x1={X(0)} y1="14" x2={X(ultimoHecho)} y2="14" strokeWidth="2" strokeLinecap="round" className="trazo-linea anim-trazo stroke-tinta" style={{ ["--i" as string]: 2 }} />}
        {pasos.map((p, i) => (
          <g key={p.clave} className="anim-revelar" style={{ animationDelay: `${200 + i * 120}ms` }}>
            <circle cx={X(i)} cy="14" r="6" strokeWidth="1.8" className={p.estado === "hecho" ? "fill-tinta stroke-tinta" : p.estado === "ahora" ? "fill-papel stroke-rojo" : "fill-papel stroke-tinta/45"} />
            <text x={X(i)} y="36" textAnchor="middle" className={`text-[10.5px] ${p.estado === "ahora" ? "fill-tinta font-semibold" : "fill-tinta/65 font-medium"}`}>
              {p.clave}
            </text>
            {p.fecha && (
              <text x={X(i)} y="50" textAnchor="middle" className="fill-tinta/45 text-[10px]">
                {p.fecha}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
