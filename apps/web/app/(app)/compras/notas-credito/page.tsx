import { redirect } from "next/navigation";

// «Notas de crédito de proveedor» se retiró (ADR-0480, Felipe 2026-10-22: «por ahora no manejaremos notas de crédito»). Un enlace
// viejo o un marcador lleva a Facturas de proveedor. Las tablas y funciones de notas siguen en la base: nada se borró.
export default function NotasCreditoRetirada() {
  redirect("/compras");
}
