import { redirect } from "next/navigation";

// La recepción vive dentro del mundo Inventario desde el rediseño UX 2026-07-18.
export default function RecibirRedirect() {
  redirect("/inventario/recibir");
}
