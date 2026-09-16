"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-navegación del mundo Inventario. Reescrita el 2026-09-15: la lista
// original (Proveedores/Compras/Almacén/Etiquetas bajo /inventario/*) nunca se
// actualizó cuando esas pantallas se mudaron a sus propios módulos (Compras,
// ADR-0035) — apuntaba a 4 rutas que ya no existen, y ni mencionaba `/mover`,
// que sí es real. Este componente nunca se había montado en ningún lado
// (`grep` sobre apps/web confirmó cero usos), así que el enlace muerto nunca
// se vio — hasta ahora, que se monta desde `layout.tsx`.
//
// Orden = flujo real: Stock (qué hay) → Recibir (entra mercadería) → Mover
// (se redistribuye entre piso/almacén/sedes) → Conteo (se verifica que el
// stock diga la verdad).
const SECCIONES = [
  { href: "/inventario", etiqueta: "Stock" },
  { href: "/inventario/recibir", etiqueta: "Recibir" },
  { href: "/inventario/mover", etiqueta: "Mover" },
  { href: "/inventario/conteo", etiqueta: "Conteo" },
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
            className={`label-cayla -mb-px shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-[11px] transition-colors ${
              activo ? "border-rojo text-tinta" : "border-transparent text-tinta/65 hover:text-rojo"
            }`}
          >
            {s.etiqueta}
          </Link>
        );
      })}
    </div>
  );
}
