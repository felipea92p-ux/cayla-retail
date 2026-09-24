import { redirect } from "next/navigation";

// Finanzas (ADR-0195) nace con Gastos (F2): su puerta lleva ahí. Cuando llegue el Resumen (F10), esta será su pantalla.
export default function FinanzasPage() {
  redirect("/finanzas/gastos");
}
