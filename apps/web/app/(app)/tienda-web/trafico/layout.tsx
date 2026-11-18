import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «trafico» (ADR-0161 B2; ADR-0495, Felipe 2026-10-23): quien llega por URL directa sin ese módulo en su rol cae en
// «Sin acceso». Nace solo para el líder (sin rol, 20261023231000); el líder decide después a quién se lo da. El candado real sigue en la
// base: `resumen_trafico_web` pide el módulo.
export default async function TraficoLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("trafico");
  return <>{children}</>;
}
