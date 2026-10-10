import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «productos» (ADR-0161 B2): «Por revisar» es una vista de Catálogo ▸ Productos, no un módulo aparte (ADR-0306:
// lo de adentro de un módulo no se da de alta en Roles y accesos). Quien llega por URL directa sin ese módulo cae en «Sin acceso».
// El candado real está en la base (`fn_productos_por_revisar` y `revisar_producto_censo`: solo quien edita el catálogo).
export default async function PorRevisarLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("productos");
  return <>{children}</>;
}
