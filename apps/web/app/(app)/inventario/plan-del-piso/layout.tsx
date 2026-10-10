import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «plan_piso» (ADR-0161 B2; ADR-0329 + ADR-0328, actividad 12): quien llega por URL directa sin ese módulo en su
// rol cae en «Sin acceso». Nace solo para el líder (sin rol, 20261006100000); el líder decide después a quién se lo da. Desde
// 20261010170000 (ADR-0352, actualización 2026-10-10) también la base lo exige: las tres lecturas (`fn_grupos_mix`,
// `fn_categorias_grupo_mix`, `fn_espacio_piso`) piden `fn_ve_modulo('plan_piso')`, así que apagarlo a un rol lo apaga por la API y no solo
// aquí; y quién CAMBIA los grupos lo sigue decidiendo la base (`fijar_grupos_de_categorias` pide al líder).
export default async function PlanDelPisoLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("plan_piso");
  return <>{children}</>;
}
