import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «impuestos» (ADR-0195 F8): quien llega por URL directa sin el módulo cae en «Sin acceso». El candado
// real sigue en la base: cada función de Impuestos pide `fn_puede_ver_impuestos()` (el líder o el módulo, ADR-0253).
export default async function ImpuestosLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("impuestos");
  return <>{children}</>;
}
