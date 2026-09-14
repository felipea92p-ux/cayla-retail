"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-navegación de Productos: el catálogo (qué ES una prenda) y el
// vocabulario del que cuelga (categorías, colores) viven juntos, separados
// del mundo de Inventario (dónde está cada unidad) — mismo espíritu que
// ComprasNav separa "la factura" de "lo que se hace con ella".
//
// Portado desde `trix/catalogo-vocabulario` (V1, ADR-0035: "la base está
// lista, la UI no" — el candado de colores duplicados y el prefijo de
// categoría ya viven en `retail.colores`/`retail.categorias`, pero ninguna
// pantalla de V2 los exponía todavía).
const SECCIONES = [
  { href: "/productos", etiqueta: "Productos" },
  { href: "/productos/categorias", etiqueta: "Categorías" },
  { href: "/productos/colores", etiqueta: "Colores" },
];

export function ProductosNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-tinta/10" aria-label="Secciones de Productos">
      {SECCIONES.map((s) => {
        const activo = pathname === s.href;
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
