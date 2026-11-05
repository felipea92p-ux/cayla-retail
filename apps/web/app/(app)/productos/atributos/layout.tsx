import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «atributos» (ADR-0161 B2): quien llega por URL directa sin ese módulo en su rol cae en «Sin acceso».
// El candado real sigue en la base; esto evita abrir una pantalla que después falla al guardar. Los sellos vivieron en una pestaña
// de esta pantalla hasta el 2026-10-22 (quien veía Sellos también entraba): desde ese día son Catálogo ▸ Insignias.
export default async function AtributosLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("atributos");
  return <>{children}</>;
}
