import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «campanas_catalogo» (ADR-0473): quien llega por URL directa sin ese módulo en su rol cae en «Sin acceso».
// Nace solo para el líder (sin rol, 20261022151000). El candado real sigue en la base (`fn_puede_editar_etiquetas`).
export default async function CampanasLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("campanas_catalogo");
  return <>{children}</>;
}
