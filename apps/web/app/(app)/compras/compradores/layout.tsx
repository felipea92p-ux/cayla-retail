import { exigirModulo } from "@/lib/persona-actual";

// La puerta de Compradores (ADR-0704): es el módulo «fondos» de siempre —el de «Revisar compras»—, ahora como portada de Compras. Quien llega
// por URL sin ese módulo en su rol cae en «Sin acceso». El candado real sigue en la base: `fn_compradores` pide el mismo módulo.
export default async function CompradoresLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("fondos");
  return <>{children}</>;
}
