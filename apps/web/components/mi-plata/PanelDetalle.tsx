import type { ReactNode } from "react";

// El detalle de «Revisar compras»: lo que se está revisando se abre AL LADO de la lista, sin otra hoja, para pasar de uno a otro sin
// perder el lugar. Diseño «A · Bandeja serena» (Felipe lo eligió el 2026-10-23 mirando el lienzo de tres direcciones): arriba, en
// versalitas, qué es y de qué ronda; el título en serif (el proveedor, la persona); debajo, en una línea, de quién, cuándo y cuánto;
// a la derecha, el monto en grande o el estado. Delante del título puede ir un avatar. Sin estado propio: lo dibuja cada detalle.
export function PanelDetalle({
  sobre,
  titulo,
  subtitulo,
  monto,
  estado,
  avatar,
  guia,
  children,
}: {
  sobre: string;
  titulo: string;
  subtitulo?: string;
  /** El monto en grande, arriba a la derecha («S/ 300.00»). */
  monto?: string;
  estado?: ReactNode;
  avatar?: ReactNode;
  guia?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={titulo} data-guia={guia} className="card-cayla @container flex min-w-0 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3.5">
          {avatar}
          <div className="min-w-0">
            <span className="label-cayla block text-[11px] text-taupe">{sobre}</span>
            <h3 className="revisar-titulo mt-1">{titulo}</h3>
            {subtitulo && <span className="mt-1 block text-[13px] text-taupe">{subtitulo}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {estado}
          {monto && <span className="whitespace-nowrap font-serif text-[34px] leading-none tabular-nums text-tinta">{monto}</span>}
        </div>
      </div>
      {children}
    </section>
  );
}
