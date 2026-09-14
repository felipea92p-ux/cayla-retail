"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-navegación del mundo Compras (ADR-0035): la factura del proveedor es
// el eje, y "Recibir mercadería" y "Por pagar" son lo que se hace CONTRA una
// factura. "Proveedores" va primero porque es la condición previa de todo lo
// demás: sin proveedor registrado no hay factura que registrar
// (`compras.proveedor_id` es FK dura). Por eso viven juntas y no en
// Inventario ni en Caja.
const SECCIONES = [
  { href: "/compras/proveedores", etiqueta: "Proveedores" },
  { href: "/compras", etiqueta: "Facturas" },
  { href: "/compras/recibir", etiqueta: "Recibir mercadería" },
  { href: "/compras/por-pagar", etiqueta: "Por pagar" },
];

// "Facturas" es la raíz del módulo y también cubre /compras/nueva y
// /compras/<id>: está activa cuando ninguna otra sección reclama la ruta.
const OTRAS = SECCIONES.filter((s) => s.href !== "/compras");

export function ComprasNav() {
  const pathname = usePathname();
  return (
    // Sin `overflow-x-auto`: las pestañas bajan 1px (`-mb-px`) para pisar la
    // línea del borde, y con overflow activo ese píxel desbordado hacía
    // aparecer una barra de scroll. Con cuatro pestañas alcanza con envolver.
    <nav className="flex flex-wrap gap-1 border-b border-tinta/10" aria-label="Secciones de Compras">
      {SECCIONES.map((s) => {
        const activo =
          s.href === "/compras"
            ? pathname === "/compras" || (pathname.startsWith("/compras/") && !OTRAS.some((o) => pathname.startsWith(o.href)))
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
