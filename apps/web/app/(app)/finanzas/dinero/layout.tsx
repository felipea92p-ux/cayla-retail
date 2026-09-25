import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «cuentas_dinero» (ADR-0195 F3/F4): Cuentas, Efectivo por tienda, Por pagar y Conciliación. Quien
// llega por URL directa sin el módulo cae en «Sin acceso». El candado real sigue en la base (`fn_cuentas_dinero_ubicaciones`:
// el líder, todas; con el módulo, su tienda; conciliar y administrar cuentas, solo el líder).
export default async function DineroLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("cuentas_dinero");
  return <>{children}</>;
}
