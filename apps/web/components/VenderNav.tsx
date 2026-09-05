"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-navegación del mundo Vender: la caja del día y la facturación electrónica
// (emitir un comprobante cierra una venta — no es un reporte, por eso vive
// acá y no en Finanzas; movido de /finanzas/facturacion el 2026-09-03).
const SECCIONES = [
  { href: "/vender", etiqueta: "Caja del día" },
  { href: "/vender/facturacion", etiqueta: "Facturación" },
];

export function VenderNav() {
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
