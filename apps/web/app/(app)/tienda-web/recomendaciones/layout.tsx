import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «recomendaciones» (ADR-0161 B2; ADR-0408, Felipe 2026-10-15): quien llega por URL directa sin ese módulo en su
// rol cae en «Sin acceso». Nace solo para el líder (sin rol, 20261015135000); el líder decide después a quién se lo da. El candado real
// sigue en la base: `fn_recomendaciones`, `marcar_recomendacion_leida`, `responder_recomendacion` y `archivar_recomendacion` piden el
// módulo.
export default async function RecomendacionesLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("recomendaciones");
  return <>{children}</>;
}
