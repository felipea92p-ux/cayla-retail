import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «fondos» (ADR-0362, fase 6; ADR-0161): quien llega por URL directa sin ese módulo en su rol cae en «Sin acceso».
// Nace solo para el líder (sin rol, 20261013181000); el líder decide después a quién se lo da (decisión 35). Quien lo tiene ve los fondos
// de todas las personas con sus montos (decisión 34), así que basta el módulo. El candado real sigue en la base: `fn_fondos` y las
// funciones que guardan piden el módulo.
export default async function FondosLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("fondos");
  return <>{children}</>;
}
