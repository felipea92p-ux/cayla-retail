"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Cajon } from "@/components/ui/Cajon";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { ETIQUETA_MOTIVO_NOTA, chipEstado, diaDelCierre, esDocumentoInterno, faltaNotaDelProveedor, hace, nombreDeNotaDeCredito, pasosDeNota, siguientePaso, type FilaVista } from "@/lib/notas-credito-reglas";
import { TituloGrupo } from "@/components/ui/TituloSeccion";

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
  onAdjuntar,
  onDetalle,
}: {
  nota: FilaVista;
  posicion: { indice: number; total: number };
  onCerrar: () => void;
  onNavegar: (delta: 1 | -1) => void;
  onRegistrar: (compraId: string) => void;
  /** «Llegó su nota de crédito» (fase 5b): adjuntar la nota del proveedor a este documento interno. */
  onAdjuntar: (id: string) => void;
  onDetalle: (id: string) => void;
}) {

  const chip = chipEstado(f);
  const sugerencia = siguientePaso(f);
  const pasos = pasosDeNota(f);

  // Las tres celdas que responden «¿qué pasó con el dinero?» de un vistazo. En una pendiente todavía no
  // pasó nada: lo que se muestra es lo que VA a pasar.
  const celdas: { titulo: string; valor: string; pie: string; tono?: string }[] =
    f.clase === "pendiente"
      ? [
          { titulo: "Comprobante", valor: f.documento, pie: `debes ${soles(f.compraSaldo)}` },
          { titulo: "Antigüedad", valor: `${f.edadDias} ${f.edadDias === 1 ? "día" : "días"}`, pie: `cerrado el ${diaMes(diaDelCierre(f))}` },
          { titulo: "Unidades", valor: f.unidadesCerradas.toLocaleString("es-PE"), pie: "cerradas sin llegar" },
        ]
      : [
          { titulo: "Bajó la deuda", valor: soles(f.aplicado), pie: `de ${f.documento}` },
          { titulo: "Devuelto", valor: soles(f.devuelto?.monto ?? 0), pie: f.devuelto ? `${diaMes(f.devuelto.fecha)} · ${f.devuelto.metodo ?? "sin medio"}` : "nada devuelto", tono: f.devuelto ? "text-verde-profundo" : undefined },
          { titulo: "A favor", valor: soles(f.vivo), pie: f.vivo > 0.004 ? "sin usar" : "nada a favor", tono: f.vivo > 0.004 ? "text-verde-profundo" : undefined },
        ];

  return (
    <Cajon
      onCerrar={onCerrar}
      clave={f.id}
      guiaPie="notas-credito.vista-acciones"
      etiquetaCerrar="Cerrar vista rápida"
      marca={<AvatarPersona personaId={null} nombre={f.proveedorNombre} tamano={40} />}
      sobre={f.clase === "pendiente" ? "Nota por reclamar" : nombreDeNotaDeCredito(f.serieNumero)}
      titulo={f.proveedorNombre}
      frase={f.documento}
      navegacion={{ indice: posicion.indice, total: posicion.total, onNavegar, que: "Nota" }}
      pie={
        <>
          {f.clase === "pendiente" ? (
            <button
              type="button"
              disabled={f.bloqueada}
              onClick={() => onRegistrar(f.compraId)}
              className="btn-cayla btn-primario"
            >
              {f.bloqueada ? "Aún no se puede" : "Registrar nota"}
            </button>
          ) : faltaNotaDelProveedor(f) ? (
            <button type="button" onClick={() => onAdjuntar(f.id)} className="btn-cayla btn-primario">
              Llegó su nota de crédito
            </button>
          ) : null}
          <button type="button" onClick={() => onDetalle(f.id)} className="btn-cayla btn-secundario">
            Ver detalle
          </button>
          <Link href={`/compras/factura/${f.compraId}`} className="btn-cayla btn-secundario inline-flex items-center gap-2">
            Comprobante <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        </>
      }
    >
      <p className="label-cayla text-[10.5px] text-tinta/65">{f.clase === "pendiente" ? "Esperado con IGV" : esDocumentoInterno(f.serieNumero) ? "Monto del documento" : "Monto de la nota"}</p>
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

      <div data-guia="notas-credito.vista-sugerencia" className={`card-cayla anim-revelar mt-[18px] border-l-2 px-4 py-3 text-[13.5px] leading-relaxed text-tinta ${BORDE_SUGERENCIA[sugerencia.tono]}`} style={{ animationDelay: "220ms" }}>
        {sugerencia.texto}
      </div>

      <section className="mt-[22px]">
        <TituloGrupo className="mb-1">De dónde sale</TituloGrupo>
        <dl className="text-[13px]">
          <Dato k="Comprobante" v={`${f.documento} · emitido el ${diaMes(f.compraFechaEmision)}`} />
          <Dato k="Total" v={soles(f.compraTotal)} />
          <Dato k="Se debe hoy" v={soles(f.compraSaldo)} />
          {f.clase === "nota" && f.nota && <Dato k="Nota" v={f.nota} />}
        </dl>
      </section>
    </Cajon>
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
