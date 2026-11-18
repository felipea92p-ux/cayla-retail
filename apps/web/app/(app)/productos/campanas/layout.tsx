import { exigirModulo } from "@/lib/persona-actual";

// La puerta de Catálogo ▸ Campañas y ofertas (ADR-0655): se abre con el módulo Campañas (`campanas`) o con Insignias (`etiquetas`), los mismos dos
// que abrían las campañas dentro de Insignias (2026-10-22 → 2026-11-13): separar la fila no le quita ni le da acceso a nadie. Quien llega por URL
// directa sin ninguno cae en «Sin acceso»; el candado real sigue en la base (`fn_puede_campanas`).
export default async function CampanasLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("campanas", "etiquetas");
  return <>{children}</>;
}
