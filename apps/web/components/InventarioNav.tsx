"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-navegación del mundo Inventario: catálogo, recepción y almacén viven juntos
// (decisión de Felipe en el descubrimiento: "inventario y almacén son casi lo mismo").
// Orden = orden de uso real del flujo, no alfabético ni por fecha de construcción:
// Proveedores (a quién le compro) → Compras (pido, opcional) → Recibir (llega) →
// Almacén (bajo a piso) → Catálogo (resultado, lo que ya se puede vender) →
// Etiquetas (utilidad de impresión, se usa en cualquier punto del camino).
const SECCIONES = [
  { href: "/inventario/proveedores", etiqueta: "Proveedores" },
  { href: "/inventario/compras", etiqueta: "Compras" },
  { href: "/inventario/recibir", etiqueta: "Recibir" },
  { href: "/inventario/almacen", etiqueta: "Almacén" },
  { href: "/inventario", etiqueta: "Catálogo" },
  { href: "/inventario/etiquetas", etiqueta: "Etiquetas" },
];

export function InventarioNav() {
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
