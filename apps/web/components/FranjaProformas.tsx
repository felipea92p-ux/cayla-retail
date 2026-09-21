import type { CSSProperties } from "react";
import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import type { ResumenProformas } from "@/lib/facturacion-reglas";
import { franjaDeProformas } from "@/lib/facturacion-proformas-reglas";

// La franja de proformas del Resumen (spec §7): una fila que dice cuántas cotizaciones siguen valiendo, por
// cuánto y cuántas vencen pronto, y lleva a la vista. Es de servidor y no decide nada: lo que dice sale de
// `franjaDeProformas` (la misma cuenta del contador de la pestaña). `resumen === null` es que la lectura falló
// (el marco ya lo registró en el log): lo dice, nunca una cifra inventada. Sin ninguna vigente es una línea,
// no tres ceros. Lo que vence pronto lleva chip ámbar: el estado nunca va solo en color.
export function FranjaProformas({ resumen }: { resumen: ResumenProformas | null }) {
  const franja = resumen ? franjaDeProformas(resumen) : null;

  return (
    <section aria-label="Proformas" className="card-cayla anim-sube flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3" style={{ "--i": 4 } as CSSProperties}>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <p className="label-cayla text-[11px] text-tinta/65">Proformas</p>
        {franja === null ? (
          <p className="text-[15px] text-tinta/65">No se pudieron leer las proformas</p>
        ) : !franja.hay ? (
          <p className="text-[15px] text-tinta/65">{franja.texto}</p>
        ) : (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-tinta">
            <span>{franja.vigentes}</span>
            <span aria-hidden="true" className="text-tinta/35">
              ·
            </span>
            <span className="tabular-nums">{franja.monto}</span>
            <span aria-hidden="true" className="text-tinta/35">
              ·
            </span>
            {franja.urgente ? (
              <Chip tono="ambar" versalitas={false}>
                {franja.porVencer}
              </Chip>
            ) : (
              <span className="text-tinta/65">{franja.porVencer}</span>
            )}
          </p>
        )}
      </div>
      <Link
        href="/vender/facturacion/proformas"
        className="label-cayla shrink-0 rounded-lg px-2 py-1.5 text-[11px] text-tinta/60 outline-none transition-colors duration-200 hover:bg-sand/40 hover:text-tinta focus-visible:outline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60"
      >
        Ver proformas →
      </Link>
    </section>
  );
}
