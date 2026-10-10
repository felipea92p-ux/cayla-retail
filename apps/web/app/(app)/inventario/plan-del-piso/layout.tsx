import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «plan_piso» (ADR-0161 B2; ADR-0329 + ADR-0328, actividad 12): quien llega por URL directa sin ese módulo en su
// rol cae en «Sin acceso». Nace solo para el líder (sin rol, 20261006100000); el líder decide después a quién se lo da. Las dos
// lecturas de la base piden solo la puerta de retail (son un catálogo de pertenencias, sin cifras): lo que decide quién la VE es
// este módulo, y quién la CAMBIA es la base (`fijar_grupos_de_categorias` pide al líder).
export default async function PlanDelPisoLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("plan_piso");
  return <>{children}</>;
}
