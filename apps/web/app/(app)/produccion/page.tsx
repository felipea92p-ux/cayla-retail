import { redirect } from "next/navigation";

// `/produccion` es el módulo padre (ADR-0130). Mientras el Resumen no exista
// (F6), su primera pantalla es la de Órdenes; el enlace `/produccion` que ya
// usa el Resumen de Inventario (`lib/resumen-acciones.ts`) sigue resolviendo.
// El control de acceso vive en cada pantalla hija.
export default function ProduccionPage() {
  redirect("/produccion/ordenes");
}
