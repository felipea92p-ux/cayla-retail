import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «cierre_mes» (ADR-0195 F9): quien llega por URL directa sin el módulo cae en «Sin acceso». El candado
// real sigue en la base: cerrar, reabrir y leer el cierre piden `fn_es_lider()` (el módulo no se puede delegar).
export default async function CierreLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("cierre_mes");
  return <>{children}</>;
}
