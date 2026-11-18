import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «libro_reclamaciones» (ADR-0161; ADR-0679, Felipe 2026-11-18): quien llega por URL directa sin ese módulo en su
// rol cae en «Sin acceso». Nace solo para el líder (sin rol, 20261118151000); el líder decide después a quién se lo da. El candado real
// sigue en la base: `fn_libro_reclamaciones` pide el módulo.
export default async function LibroReclamacionesLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("libro_reclamaciones");
  return <>{children}</>;
}
