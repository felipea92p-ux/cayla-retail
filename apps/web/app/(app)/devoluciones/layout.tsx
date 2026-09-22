import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «devoluciones» (ADR-0161 B2): quien llega por URL directa sin ese módulo en su rol cae en «Sin acceso».
// El candado real sigue en la base; esto evita abrir una pantalla que después falla al guardar.
export default async function DevolucionesLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("devoluciones");
  return <>{children}</>;
}
