import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «rendimiento» (ADR-0219): quien llega por URL directa sin el módulo cae en
// «Sin acceso». El candado real (y qué tienda ve cada cuenta) está en la base,
// `fn_rendimiento_ubicaciones`.
export default async function RendimientoLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("rendimiento");
  return <>{children}</>;
}
