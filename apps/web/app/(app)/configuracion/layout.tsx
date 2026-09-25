import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «configuracion» (ADR-0195 F1): «solo líder por ahora» (sus funciones exigen fn_es_lider()). Quien
// llega por URL directa sin el módulo cae en «Sin acceso»; el candado real sigue en la base.
export default async function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("configuracion");
  return <>{children}</>;
}
