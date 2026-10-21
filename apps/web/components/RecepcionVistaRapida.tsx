"use client";

import type { CSSProperties } from "react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Check } from "lucide-react";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { Chip } from "@/components/ui/Chip";
import { Cajon } from "@/components/ui/Cajon";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { diaLima, diaMes } from "@/lib/fechas-lima";
import type { LineaRecepcion } from "@/lib/compras-reglas";
import type { RecepcionDeCompra } from "@/lib/compras-indicadores";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { EnlaceVer } from "@/components/ui/EnlaceVer";

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
  const faltan = r.faltante > 0 ? r.faltante : 0;
  const pct = r.unidadesFacturadas > 0 ? Math.min(100, (r.unidadesLlegaron / r.unidadesFacturadas) * 100) : 0;

  return (
    <Cajon
      onCerrar={onCerrar}
      clave={`${r.loteId}-${r.compraId}`}
      guia="recibidas.vista-rapida"
      marca={<AvatarPersona personaId={null} nombre={r.proveedorNombre} tamano={40} />}
      titulo={r.proveedorNombre}
      frase={
        <>
          {diaMes(diaLima(r.fechaRecepcion))} · {r.numeroGuia ? `Guía ${r.numeroGuia}` : "Sin guía"} · {r.ubicacionNombre}
          {recibio ? (
            <>
              <br />
              Recibido por {recibio}
            </>
          ) : null}
        </>
      }
      navegacion={{ indice: posicion.indice, total: posicion.total, onNavegar, que: "Recepción", circular: true }}
      pie={(cerrar) => (
        <>
          {enlaceAlComprobante ? (
            // Cierra el cajón en el mismo clic que navega.
            <EnlaceVer href={`/compras/factura/${r.compraId}`} alNavegar={cerrar}>
              Ver comprobante completo
            </EnlaceVer>
          ) : (
            <span className="text-xs text-tinta/55">El detalle del comprobante es de Compras.</span>
          )}
        </>
      )}
    >
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
          {faltan === 0 && <Check aria-hidden className="check-trazo -ml-0.5 mr-1 inline h-3 w-3" style={{ "--d": "300ms" } as CSSProperties} />}
          {faltan > 0 ? `Faltan ${faltan}` : "Completa"}
        </Chip>
      </div>
      <BarraAvance pct={pct} tono={faltan > 0 ? "ambar" : undefined} etiqueta="Llegó de lo facturado" className="mb-5 mt-2" />

      <TituloGrupo className="mb-1">Prenda por prenda</TituloGrupo>
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
    </Cajon>
  );
}
