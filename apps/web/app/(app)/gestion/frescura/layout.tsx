import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «frescura» (ADR-0161 B2; ADR-0208 paso 4): quien llega por URL directa sin ese módulo en su rol cae
// en «Sin acceso». Nace solo para el líder (sin rol, 20260929100000); el líder decide después a quién se lo da. El candado
// real sigue en la base: las tres lecturas piden «el líder, o este módulo, en una sede que opera».
export default async function FrescuraLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("frescura");
  return <>{children}</>;
}
