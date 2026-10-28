import { redirect } from "next/navigation";
import { urlNuevoTrasladoDesdeMover, type ParametrosDeUrl } from "@/lib/traslados-reglas";

// «Nuevo traslado» ya no vive aquí: desde el 2026-10-03 es `/inventario/traslados/nuevo` (ADR-0242 D-4), dentro de Traslados.
// Esta dirección se queda solo para que sigan funcionando los enlaces de antes —Producción («llevarlas a las tiendas»),
// Cambios («pedirla a otra sede»), Análisis, Frescura y los favoritos de la gente—: redirige con TODOS sus parámetros
// (`?origen=&destino=&variante=&cantidad=&lineas=`). La puerta del módulo «traslados» la pone el layout de la ruta nueva.
export default async function MoverRedirige({ searchParams }: { searchParams: Promise<ParametrosDeUrl> }) {
  redirect(urlNuevoTrasladoDesdeMover(await searchParams));
}
