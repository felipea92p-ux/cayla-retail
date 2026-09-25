import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «gastos» (ADR-0195 F2): quien llega por URL directa sin el módulo cae en «Sin acceso». El candado
// real sigue en la base (`fn_gastos_ubicaciones`: el líder, todas; con el módulo, su tienda).
export default async function GastosLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("gastos");
  return <>{children}</>;
}
