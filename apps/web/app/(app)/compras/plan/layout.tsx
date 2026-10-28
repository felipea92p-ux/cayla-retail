import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «plan_compra» (ADR-0349; ADR-0161): quien llega por URL directa sin ese módulo en su rol cae en «Sin acceso».
// Además, como toda pantalla de Compras, pide ver el dinero de Compras (el layout de /compras, ADR-0126): el plan muestra costos.
// Nace solo para el líder (sin rol, 20261005220000); el líder decide después a quién se lo da. El candado real sigue en la base:
// `fn_plan_compra` y `guardar_plan_compra_linea` piden el módulo.
export default async function PlanCompraLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("plan_compra");
  return <>{children}</>;
}
