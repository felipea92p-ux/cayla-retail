import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «campanas» (ADR-0436, Felipe 2026-10-17): quien llega por URL directa sin ese módulo en su rol cae en «Sin acceso».
// Nace solo para el líder (sin rol, 20261017144000); el líder decide después a quién se lo da. El candado real sigue en la base:
// `campanas_lista` y `campanas_portada_dias` piden el módulo (`fn_puede_campanas`).
export default async function CampanasLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("campanas");
  return <>{children}</>;
}
