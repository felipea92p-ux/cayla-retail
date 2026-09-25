import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «reportes_financieros» (ADR-0195 F5): quien llega por URL directa sin el módulo cae en «Sin acceso».
// El candado real sigue en la base (`fn_diario_ubicaciones`: el líder, todo y el consolidado; con el módulo, su tienda).
export default async function ReportesLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("reportes_financieros");
  return <>{children}</>;
}
