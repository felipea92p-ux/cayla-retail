import { redirect } from "next/navigation";

// «Revisar compras» (antes «Fondos por rendir»; ADR-0362, ADR-0480, ADR-0504) se fue con Compras reestructurado (ADR-0704, Felipe 2026-11-26):
// lo que se revisaba de todas las personas juntas vive ahora en el detalle de cada una (Compradores ▸ la persona: su plata, su papel, sus
// gastos, su cierre, y sus entregas y devoluciones con «Anular»); «Quién tiene plata» es la portada de Compradores, y las rendiciones por
// aprobar salen ahí cuando hay alguna. La ruta queda para los enlaces guardados.
export default function FondosPage() {
  redirect("/compras/compradores");
}
