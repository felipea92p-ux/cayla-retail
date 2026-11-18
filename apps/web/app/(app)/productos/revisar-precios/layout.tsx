import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «productos» (ADR-0161 B2): «Revisar precios» es una vista de Catálogo ▸ Productos, no un módulo aparte (ADR-0306).
// Quien llega por URL directa sin ese módulo cae en «Sin acceso». El candado real está en la base (`fn_precios_a_revisar`).
export default async function RevisarPreciosLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("productos");
  return <>{children}</>;
}
