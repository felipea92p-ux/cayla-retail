import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «configuracion» (ADR-0195 F1; delegable desde el ADR-0253: sus funciones piden
// `fn_puede_configurar()`). Quien llega por URL directa sin el módulo cae en «Sin acceso»; el candado real sigue en la base.
export default async function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("configuracion");
  return <>{children}</>;
}
