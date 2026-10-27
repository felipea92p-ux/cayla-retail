import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «preguntas_equipo» (ADR-0529, actividad 9): quien llega por URL directa sin el módulo cae en «Sin acceso».
// Nace solo para el líder (sin rol, 20261027165000); el líder decide después a quién se lo da. El candado real sigue en la base:
// `fn_asistente_preguntas_equipo` pide el módulo y, sin ser líder, solo deja ver la propia sede.
export default async function PreguntasEquipoLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("preguntas_equipo");
  return <>{children}</>;
}
