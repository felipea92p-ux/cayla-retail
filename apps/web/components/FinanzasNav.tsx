"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-navegación del mundo Finanzas (F1 — jubilación de SINATRA):
// los 4 reportes que Felipe marcó como irrenunciables, cada uno con su lugar.
const SECCIONES = [
  { href: "/finanzas", etiqueta: "Resumen" },
  { href: "/finanzas/registrar", etiqueta: "Registrar" },
  { href: "/finanzas/balances", etiqueta: "Balances" },
  { href: "/finanzas/efectivo", etiqueta: "Efectivo" },
  { href: "/finanzas/comparativo", etiqueta: "Año vs año" },
  { href: "/finanzas/patrimonio", etiqueta: "Patrimonio" },
];

export function FinanzasNav() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-tinta/10">
      {SECCIONES.map((s) => {
        const activo = pathname === s.href;
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`label-cayla -mb-px shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-[10px] transition-colors ${
              activo ? "border-rojo text-tinta" : "border-transparent text-tinta/45 hover:text-rojo"
            }`}
          >
            {s.etiqueta}
          </Link>
        );
      })}
    </div>
  );
}
