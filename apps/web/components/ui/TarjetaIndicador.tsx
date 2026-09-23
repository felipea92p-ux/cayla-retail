import Link from "next/link";
import { ChevronRight } from "lucide-react";

/* ====================================================================
   TarjetaIndicador (2026-09-22) — extraída de Existencias («Prioridades de
   hoy») para que Movimientos use el mismo lenguaje visual en su resumen.
   Identidad de color PROPIA y permanente (no solo cuando pide algo):
   extremadamente tenue (fondo al 2-3%, borde al 10-18%), nunca un bloque de
   color sólido. `urgente` (dato real, no decoración) la intensifica un poco
   más (fondo al 5-6%, borde al 20-35%) — la diferencia entre "así se ve
   siempre" y "hoy pide algo".
   ==================================================================== */
export const TONO_TARJETA = {
  coral: { icono: "bg-rojo/10 text-rojo-profundo", borde: "border-rojo/[0.12] bg-rojo/[0.025]", fuerte: "border-rojo/25 bg-rojo/[0.055]" },
  verde: { icono: "bg-verde/15 text-verde-profundo", borde: "border-verde/[0.15] bg-verde/[0.025]", fuerte: "border-verde/30 bg-verde/[0.05]" },
  ambar: { icono: "bg-ambar/15 text-ambar-profundo", borde: "border-ambar/[0.18] bg-ambar/[0.03]", fuerte: "border-ambar/35 bg-ambar/[0.06]" },
  neutro: { icono: "bg-tinta/8 text-tinta/70", borde: "border-tinta/10 bg-tinta/[0.02]", fuerte: "border-tinta/20 bg-tinta/[0.04]" },
} as const;

export function TarjetaIndicador({
  tono,
  icono: Icono,
  etiqueta,
  valor,
  unidad,
  urgente = false,
  activa = false,
  href,
  onClick,
  children,
}: {
  tono: keyof typeof TONO_TARJETA;
  icono: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  etiqueta: string;
  /** Casi siempre un número (se formatea con separador de miles); una cadena ya
   *  formada («+3», «—») cuando el signo o el guion largo es parte del dato, como
   *  en el resumen de Movimientos. */
  valor: number | string;
  unidad: string;
  urgente?: boolean;
  activa?: boolean;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const clickeable = Boolean(href || onClick);
  const t = TONO_TARJETA[tono];
  const clase = `card-cayla group relative block p-4 text-left transition-all duration-200 ${urgente ? t.fuerte : t.borde} ${
    clickeable ? "hover:-translate-y-0.5 hover:shadow-md" : ""
  } ${activa ? "bg-sand/40" : ""}`;
  const contenido = (
    <>
      <div className="flex items-start justify-between">
        <span aria-hidden className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${t.icono}`}>
          <Icono className="h-4 w-4" strokeWidth={1.5} />
        </span>
        {clickeable && <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-tinta/30 transition-transform group-hover:translate-x-0.5" />}
      </div>
      <p className="label-cayla mt-2.5 text-[11px] text-tinta/65">{etiqueta}</p>
      <p className="mt-0.5 flex items-baseline gap-2">
        <span className="font-display text-[1.7rem] leading-none tabular-nums text-tinta">{typeof valor === "number" ? valor.toLocaleString("es-PE") : valor}</span>
        <span className="text-sm text-tinta/55">{unidad}</span>
      </p>
      <p className="mt-1 text-xs leading-snug text-tinta/65">{children}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={clase}>
        {contenido}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${clase} w-full`} aria-pressed={activa}>
        {contenido}
      </button>
    );
  }
  return <div className={clase}>{contenido}</div>;
}
