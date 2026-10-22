import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «campanas» (ADR-0473): quien llega por URL directa sin ese módulo en su rol cae en «Sin acceso».
// El candado real sigue en la base (`fn_puede_campanas`).
export default async function CampanasLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("campanas");
  return <>{children}</>;
}
