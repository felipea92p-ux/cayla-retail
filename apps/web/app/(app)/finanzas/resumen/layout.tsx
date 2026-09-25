import { exigirModulo } from "@/lib/persona-actual";

// La puerta del Resumen (ADR-0195 F10): es parte del módulo «reportes_financieros» (Resumen y Reportes). Quien llega por URL
// directa sin el módulo cae en «Sin acceso». El candado real sigue en la base (`fn_resumen_finanzas`: el líder, todo; con el
// módulo, su sede).
export default async function ResumenLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("reportes_financieros");
  return <>{children}</>;
}
