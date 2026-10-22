import { exigirModulo } from "@/lib/persona-actual";

// La puerta de Catálogo ▸ Sellos (ADR-0161 B2): se abre con el módulo Sellos (`etiquetas`) o con Campañas (`campanas`), los dos que
// viven en esta fila desde el 2026-10-22. Quien llega por URL directa sin ninguno cae en «Sin acceso»; el candado real sigue en la
// base (`fn_puede_editar_etiquetas`, `fn_puede_campanas`).
export default async function SellosLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("etiquetas", "campanas");
  return <>{children}</>;
}
