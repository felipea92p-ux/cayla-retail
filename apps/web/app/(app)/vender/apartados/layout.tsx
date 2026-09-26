import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «apartados» (ADR-0196; antes colgaba de «vender»). Quien llega por URL directa sin él en su rol
// cae en «Sin acceso». La base, además, exige que la cuenta opere esa tienda (`fn_puede_operar_ubicacion`).
export default async function ApartadosLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("apartados");
  return <>{children}</>;
}
