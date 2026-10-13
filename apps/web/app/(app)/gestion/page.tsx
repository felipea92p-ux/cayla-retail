import { redirect } from "next/navigation";
import { exigirModulo, veModulo } from "@/lib/persona-actual";

// La puerta de «Gestión» (ADR-0392): el grupo del lateral que junta las cuatro pantallas de mirar y decidir. Quien llega a
// `/gestion` cae en la primera que ve, en el orden del menú: Análisis, Frescura del piso, Plan del piso, Rendimiento. Sin
// ninguna de las cuatro, `exigirModulo` lo manda a «Sin acceso» (o a elegir sede, en CAYLA Global), como cualquier módulo.
export default async function GestionPage() {
  const persona = await exigirModulo("analisis", "frescura", "plan_piso", "rendimiento");
  if (veModulo(persona, "analisis")) redirect("/inventario/resumen");
  if (veModulo(persona, "frescura")) redirect("/inventario/frescura");
  if (veModulo(persona, "plan_piso")) redirect("/inventario/plan-del-piso");
  redirect("/rendimiento");
}
