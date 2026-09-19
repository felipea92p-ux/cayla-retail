import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/* ====================================================================
   TarjetaSenal · una señal de un vistazo: ícono, etiqueta, cifra grande y
   una línea que dice qué cuenta (2026-09-19, Resumen de Inventario v2)

   Es la tarjeta compacta del Resumen (agotadas con demanda, cobertura
   crítica, curvas rotas, sobrestock, capital). Distinta de `TarjetaCifra`
   a propósito: esa es una cifra neutra; esta lleva un TONO (rojo = urgente,
   ámbar = atención, verde = tranquilo, neutro) que tiñe la caja, el ícono
   y la cifra — así se lee el estado sin leer el texto. El rojo es solo
   urgencia: nadie lo usa de adorno.

   Si se puede tocar (filtra la tabla o abre un detalle) lleva la flecha y
   es un botón de verdad; si no hay nada detrás (cifra en cero) es una
   tarjeta quieta, sin flecha ni hover — un botón que no hace nada es
   justamente lo que Felipe pidió que no hubiera.
   ==================================================================== */

export type TonoSenal = "rojo" | "ambar" | "verde" | "neutro";

const ESTILO: Record<TonoSenal, { caja: string; disco: string; cifra: string }> = {
  rojo: { caja: "border-rojo/25 bg-rojo/[0.06]", disco: "bg-rojo-profundo text-crema", cifra: "text-rojo-profundo" },
  ambar: { caja: "border-ambar/30 bg-ambar/[0.08]", disco: "bg-ambar text-crema", cifra: "text-ambar-profundo" },
  verde: { caja: "border-verde/30 bg-verde/[0.07]", disco: "bg-verde text-crema", cifra: "text-verde-profundo" },
  neutro: { caja: "border-tinta/10 bg-papel", disco: "bg-sand text-tinta", cifra: "text-tinta" },
};

export function TarjetaSenal({
  titulo,
  valor,
  unidad,
  detalle,
  tono,
  icono,
  onClick,
  activa = false,
  pie,
}: {
  titulo: string;
  valor: ReactNode;
  /** Va pegada a la cifra en chico: «al costo», «uds». */
  unidad?: string;
  detalle: ReactNode;
  tono: TonoSenal;
  icono: ReactNode;
  onClick?: () => void;
  activa?: boolean;
  /** Una línea más abajo (p. ej. «S/ 8,500 con cobertura > 60 días»). */
  pie?: ReactNode;
}) {
  const e = ESTILO[tono];
  const cuerpo = (
    <span className="relative flex items-start gap-3">
      <span aria-hidden className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-full @min-[10rem]:flex ${e.disco}`}>
        {icono}
      </span>
      <span className="min-w-0 flex-1">
        <span className="label-cayla block pr-4 text-[11px] leading-4 text-tinta/75">{titulo}</span>
        {/* La cifra no se parte nunca («S/ 9,538» en tres líneas se lee como tres cosas); si la unidad no cabe al lado, baja. */}
        <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
          <span className={`font-display text-[1.65rem] leading-none whitespace-nowrap tabular-nums ${e.cifra}`}>{valor}</span>
          {unidad && <span className="whitespace-nowrap text-xs text-tinta/65">{unidad}</span>}
        </span>
        <span className="mt-1 block text-xs leading-4 text-tinta/70">{detalle}</span>
        {pie && <span className="mt-0.5 block text-[11px] leading-4 text-tinta/60">{pie}</span>}
      </span>
      {onClick && <ChevronRight aria-hidden strokeWidth={1.5} className="absolute right-0 top-0.5 h-4 w-4 text-tinta/40" />}
    </span>
  );

  const clase = `@container block w-full rounded-lg border p-3.5 text-left ${e.caja} ${activa ? "ring-2 ring-tinta/30" : ""}`;
  if (!onClick) return <div className={clase}>{cuerpo}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={activa} className={`${clase} transition-shadow hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta/50`}>
      {cuerpo}
    </button>
  );
}
