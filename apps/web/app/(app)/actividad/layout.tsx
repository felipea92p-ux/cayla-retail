import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «actividad» (ADR-0207): quien llega por URL directa sin el módulo cae en «Sin acceso». El candado
// real (y el alcance por sede) está en la base, `fn_actividad`.
export default async function ActividadLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("actividad");
  return <>{children}</>;
}
