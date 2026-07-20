"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-navegación del mundo Inventario: catálogo, recepción y almacén viven juntos
// (decisión de Felipe en el descubrimiento: "inventario y almacén son casi lo mismo").
const SECCIONES = [
  { href: "/inventario", etiqueta: "Catálogo" },
  { href: "/inventario/recibir", etiqueta: "Recibir" },
  { href: "/inventario/almacen", etiqueta: "Almacén" },
  { href: "/inventario/etiquetas", etiqueta: "Etiquetas" },
  { href: "/inventario/proveedores", etiqueta: "Proveedores" },
];

export function InventarioNav() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b border-tinta/10">
      {SECCIONES.map((s) => {
        const activo = pathname === s.href;
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`label-cayla -mb-px border-b-2 px-3 pb-2.5 pt-1 text-[10px] transition-colors ${
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
