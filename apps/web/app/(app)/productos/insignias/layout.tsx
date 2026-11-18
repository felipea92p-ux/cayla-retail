import { exigirModulo } from "@/lib/persona-actual";

// La puerta de Catálogo ▸ Insignias (ADR-0161 B2): se abre con el módulo Insignias (`etiquetas`). También con Campañas (`campanas`), solo
// para que el enlace viejo de las campañas (vivieron aquí del 2026-10-22 al 2026-11-13) llegue a la página y esta lo lleve a Catálogo ▸
// Campañas y ofertas (ADR-0655). Quien llega sin ninguno cae en «Sin acceso»; el candado real sigue en la base (`fn_puede_editar_etiquetas`).
export default async function SellosLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("etiquetas", "campanas");
  return <>{children}</>;
}
