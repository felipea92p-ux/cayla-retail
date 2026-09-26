import Link from "next/link";
import { ChevronRight } from "lucide-react";

// Los avisos de Ventas ▸ Historial (ADR-0230): lo que espera a alguien, de CUALQUIER fecha —un comprobante rechazado
// hace 40 días no aparece en «30 días», y es justo el que más urge—. Cada uno lleva a la pantalla que lo resuelve.
// Notas en hueso (la «nota» del orden de pantalla, ADR-0169) con un punto del tono del estado; no se cierran: si el
// problema sigue, el aviso sigue (lo urgente no se oculta, como en el Inicio).

export type AvisoHistorial = { tono: "ambar" | "rojo" | "pizarra"; texto: string; href: string; accion: string };

const PUNTO: Record<AvisoHistorial["tono"], string> = { ambar: "bg-ambar", rojo: "bg-rojo", pizarra: "bg-pizarra" };

export function AvisosHistorial({ avisos }: { avisos: AvisoHistorial[] }) {
  if (avisos.length === 0) return null;
  return (
    <ul aria-label="Avisos" className="grid gap-2">
      {avisos.map((a) => (
        <li key={a.href}>
          <Link href={a.href} className="group flex items-center gap-3 rounded-xl bg-hueso px-4 py-2.5 text-[13.5px] text-tinta transition-colors hover:bg-sand">
            <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[a.tono]}`} />
            <span className="min-w-0 flex-1">{a.texto}</span>
            <span className="label-cayla flex shrink-0 items-center gap-0.5 text-[10.5px] text-tinta/75 group-hover:text-rojo">
              {a.accion} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
