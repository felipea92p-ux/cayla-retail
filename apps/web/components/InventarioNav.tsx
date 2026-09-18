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
// Reescrita otra vez el 2026-09-16 (Felipe, al integrar sus 4 diseños de
// Inventario): las pestañas son las 4 PANTALLAS del módulo, no sus acciones.
// Existencias (qué hay) → Movimientos (por qué cambió) → Traslados (qué
// viaja entre sedes) → Conteo (se verifica que el stock diga la verdad).
// «Recibir» y «Mover» dejaron de ser pestañas: mover es el botón «+ Nuevo
// traslado» dentro de Existencias y Traslados; recibir sin factura sigue
// viva en `/inventario/recibir` y en «+ Nuevo» (Compras tiene el camino
// principal, contra factura). Ninguna ruta se borró.
//
// Cada pestaña sabe qué rutas cuelgan de ella (`prefijos`): el detalle de un
// traslado o de un conteo tiene que iluminar SU pestaña, y `/inventario` a
// secas no puede ser prefijo de nada o se iluminaría siempre.
// Quinta pestaña, 2026-09-17 (ADR-0101): "Resumen" — decisión a nivel red,
// distinta de las 4 operativas que fijó ADR-0071. Al final de la lista a
// propósito: no cambia qué muestra `/inventario` a secas (sigue siendo
// Existencias), solo agrega una pantalla nueva al lado.
const SECCIONES: { href: string; etiqueta: string; prefijos: string[] }[] = [
  { href: "/inventario", etiqueta: "Existencias", prefijos: ["/inventario/mover"] },
  { href: "/inventario/movimientos", etiqueta: "Movimientos", prefijos: ["/inventario/movimientos"] },
  { href: "/inventario/traslados", etiqueta: "Traslados", prefijos: ["/inventario/traslados"] },
  { href: "/inventario/conteo", etiqueta: "Conteo", prefijos: ["/inventario/conteo"] },
  { href: "/inventario/resumen", etiqueta: "Resumen", prefijos: ["/inventario/resumen"] },
];

export function InventarioNav({ mostrarResumen = false }: { mostrarResumen?: boolean }) {
  const pathname = usePathname();
  const secciones = mostrarResumen ? SECCIONES : SECCIONES.filter((s) => s.href !== "/inventario/resumen");
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-tinta/10">
      {secciones.map((s) => {
        const activo = pathname === s.href || s.prefijos.some((p) => pathname === p || pathname.startsWith(p + "/"));
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={activo ? "page" : undefined}
            className={`label-cayla -mb-px shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-[11px] transition-colors ${
              activo ? "border-rojo text-tinta" : "border-transparent text-tinta/65 hover:text-rojo"
            }`}
          >
            {s.etiqueta}
          </Link>
        );
      })}
      {/* «Ingreso sin comprobante» (ADR-0106): la excepción de recibir — mercadería que llegó y todavía no tiene
          su comprobante, muestras y obsequios. Vive en Inventario, no como par de Compras; a la derecha y
          discreto para que no compita con las pestañas. */}
      <Link
        href="/inventario/recibir"
        className={`label-cayla -mb-px ml-auto shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-[11px] transition-colors ${
          pathname === "/inventario/recibir" ? "border-rojo text-tinta" : "border-transparent text-tinta/55 hover:text-rojo"
        }`}
      >
        Ingreso sin comprobante
      </Link>
    </div>
  );
}
