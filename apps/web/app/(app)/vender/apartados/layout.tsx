import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «vender» (ADR-0161 B2): Apartados usa la misma caja que el Punto de venta, así que cuelga de ese
// módulo. Quien llega por URL directa sin él en su rol cae en «Sin acceso». El candado real sigue en la base.
export default async function ApartadosLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("vender");
  return <>{children}</>;
}
