import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «liquidacion» (ADR-0371): quien llega por URL directa sin ese módulo en su rol cae en «Sin acceso».
// Nace solo para el líder (sin rol, 20261010190000). El candado real sigue en la base: cada función pide el módulo y una
// sede que la cuenta opera.
export default async function LiquidacionLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("liquidacion");
  return <>{children}</>;
}
