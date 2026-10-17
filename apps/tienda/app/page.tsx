import { redirect } from "next/navigation";
import { INICIO_CON_CUENTA } from "@/lib/sesion";

// La portada de quien no tenía cuenta ya no existe (Felipe 2026-10-17): la tienda —prendas, precios y cuánto hay en cada tienda— se ve
// sin iniciar sesión, así que la puerta es el Inicio para todos. El proxy ya lo resuelve antes de llegar aquí; esto es la red por si no.
export default function Portada() {
  redirect(INICIO_CON_CUENTA);
}
