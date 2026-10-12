"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, FileText, LayoutGrid, Send, type LucideIcon } from "lucide-react";
import { esMesValido, hrefPestana, PESTANAS, pestanaDeRuta, type ClavePestana, type ConteosPestanas } from "@/lib/facturacion-reglas";
import { ALTO_PESTANAS_MOVIL, EnCuerpo } from "@/components/apartados/piezas";

// Las cuatro pestañas de Comprobantes, abajo y solo en celular y tablet (Felipe, 2026-09-26, opción 2B del spike
// `docs/maquetas/comprobantes-conectado-2026-09/`): al alcance del pulgar, como en Apartados. No es un segundo
// menú: el ☰ sigue siendo el del ERP (ADR-0206, con la excepción anotada para estas barras de pestañas). Arriba,
// en computadora, siguen las pestañas de vidrio (`FacturacionPestanas`).
const ICONO: Record<ClavePestana, LucideIcon> = { hoy: CalendarDays, series: LayoutGrid, cola: Send, proformas: FileText };
const TONO: Record<"neutro" | "ambar" | "rojo", string> = { neutro: "bg-tinta/80", ambar: "bg-ambar", rojo: "bg-rojo" };

export function PestanasComprobantesMovil({ conteos }: { conteos: ConteosPestanas }) {
  const activa = pestanaDeRuta(usePathname());
  const m = useSearchParams().get("m");
  const mes = esMesValido(m) ? m : null;
  return (
    <EnCuerpo>
      <nav
        aria-label="Vistas de Comprobantes"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-sand bg-papel pb-[env(safe-area-inset-bottom)] sm:left-lateral lg:hidden"
      >
        {PESTANAS.map((p) => {
          const Icono = ICONO[p.clave];
          const conteo = conteos[p.clave];
          const esActiva = p.clave === activa;
          return (
            <Link
              key={p.clave}
              href={hrefPestana(p, mes)}
              aria-current={esActiva ? "page" : undefined}
              style={{ height: ALTO_PESTANAS_MOVIL }}
              className={`relative flex flex-col items-center justify-center gap-1 text-[11px] transition-colors ${esActiva ? "font-semibold text-tinta" : "text-tinta/55"}`}
            >
              <Icono aria-hidden size={19} strokeWidth={1.75} className={esActiva ? "text-rojo" : undefined} />
              {p.etiqueta}
              {conteo && (
                <span className={`absolute top-2 left-[calc(50%+6px)] grid h-[17px] min-w-[17px] place-items-center rounded-full px-1 text-[10px] text-papel tabular-nums ${TONO[conteo.tono]}`}>
                  {conteo.valor}
                  <span className="sr-only"> {conteo.texto}</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </EnCuerpo>
  );
}
