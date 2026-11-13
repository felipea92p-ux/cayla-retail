import { HojasAlCentro } from "@/components/ui/HojasAlCentro";
import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «recibir» (ADR-0161 B2): quien llega por URL directa sin ese módulo en su rol cae en «Sin acceso».
// El candado real sigue en la base; esto evita abrir una pantalla que después falla al guardar.
// Las hojas de Recibir abren al centro (Felipe 2026-11-12; `HojasAlCentro.tsx`): es el primer módulo, y el resto del ERP le sigue.
export default async function RecibirLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("recibir");
  return <HojasAlCentro>{children}</HojasAlCentro>;
}
