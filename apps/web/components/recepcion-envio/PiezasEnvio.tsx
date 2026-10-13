import type { CSSProperties, ReactNode } from "react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { soles } from "@/lib/compras-reglas";
import { nombreDeLinea, ordenesDelEnvio, proveedoresDelEnvio, type DetalleEnvio } from "@/lib/recepcion-envio-reglas";

// Piezas de la pantalla «Recibir ENV-…» (ADR-0362, fase 4) que no guardan nada: la cabecera de Inventario con la cifra a la derecha y la
// lista de lo que trae el envío (para leerla antes de abrirlo, o cuando no se puede recibir desde aquí).

/** La cabecera de la recepción: sede y hora, «Recibir ENV-000061», una frase corta, la flecha de vuelta a Recibir y, a la derecha, UNA
 *  cifra (vienen, contadas o recibidas). La sede de arriba es la de la cabecera del ERP: dónde está quien mira. */
export function CabeceraEnvio({ sede, detalle, frase, cifra }: { sede: string; detalle: DetalleEnvio; frase: ReactNode; cifra: { rotulo: string; valor: ReactNode } | null }) {
  return (
    <EncabezadoPagina sede={sede} titulo={`Recibir ${detalle.numero}`} subtitulo={frase} volver={<Volver href="/recibir" a="Recibir mercadería" />}>
      {cifra && (
        <div data-guia="recepcion.cifra" className="anim-sube text-right" style={{ "--i": 1 } as CSSProperties}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-taupe-profundo">{cifra.rotulo}</p>
          <p className="font-display mt-1 text-2xl tabular-nums text-tinta" aria-live="polite">
            {cifra.valor}
          </p>
        </div>
      )}
    </EncabezadoPagina>
  );
}

/** «Textiles Andina · OC-000129»: de quién y de qué órdenes es el envío. */
export function origenDelEnvio(d: DetalleEnvio): string {
  const proveedores = proveedoresDelEnvio(d).map((p) => p.nombre);
  return [proveedores.join(", "), ordenesDelEnvio(d).join(", ")].filter(Boolean).join(" · ");
}

/** Lo que trae el envío, línea por línea, para leer (sin tocar nada). */
export function LoQueTrae({ detalle, conCosto = true }: { detalle: DetalleEnvio; conCosto?: boolean }) {
  const variosProveedores = proveedoresDelEnvio(detalle).length >= 2;
  return (
    <ul className="divide-y divide-sand">
      {detalle.lineas.map((l) => (
        <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="text-sm text-tinta">{nombreDeLinea(l)}</p>
            <p className="text-xs text-taupe">
              {[l.orden.numero, variosProveedores ? l.proveedor?.nombre : null, conCosto ? `${soles(l.costoUnitario)} c/u` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <p className="text-sm tabular-nums text-tinta">
            {l.enviado.toLocaleString("es-PE")} <span className="text-taupe">{l.enviado === 1 ? "prenda" : "prendas"}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
