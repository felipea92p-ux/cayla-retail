import { redirect } from "next/navigation";

// El almacén vive dentro del mundo Inventario desde el rediseño UX 2026-07-18.
// Esta ruta queda solo para no romper enlaces guardados.
export default function AlmacenRedirect() {
  redirect("/inventario/almacen");
}
