"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-navegación del mundo Compras (ADR-0035): la factura del proveedor es
// el eje, y las otras dos pestañas son lo que se hace CONTRA una factura —
// recibir su mercadería y pagar su saldo. Por eso viven juntas y no en
// Inventario ni en Caja.
const SECCIONES = [
  { href: "/compras", etiqueta: "Facturas" },
  { href: "/compras/recibir", etiqueta: "Recibir mercadería" },
  { href: "/compras/por-pagar", etiqueta: "Por pagar" },
];

export function ComprasNav() {
  const pathname = usePathname();
  return (
    // Sin `overflow-x-auto`: las pestañas bajan 1px (`-mb-px`) para pisar la
    // línea del borde, y con overflow activo ese píxel desbordado hacía
    // aparecer una barra de scroll. Con tres pestañas alcanza con envolver.
    <nav className="flex flex-wrap gap-1 border-b border-tinta/10" aria-label="Secciones de Compras">
      {SECCIONES.map((s) => {
        // "Facturas" también cubre /compras/nueva y /compras/<id>.
        const activo =
          s.href === "/compras"
            ? pathname === "/compras" || (pathname.startsWith("/compras/") && !SECCIONES.slice(1).some((o) => pathname.startsWith(o.href)))
            : pathname.startsWith(s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`label-cayla -mb-px shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-[11px] transition-colors ${
              activo ? "border-rojo text-tinta" : "border-transparent text-tinta/65 hover:text-rojo"
            }`}
          >
            {s.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
