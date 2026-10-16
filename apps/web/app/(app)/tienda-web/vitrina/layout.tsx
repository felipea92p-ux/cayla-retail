import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «vitrina_web» (ADR-0408, actividad 3): quien llega por URL directa sin ese módulo en su rol cae en «Sin
// acceso». Nace solo para el líder (sin rol, 20261014225000). El candado real sigue en la base: cada función pide el módulo.
export default async function VitrinaLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("vitrina_web");
  return <>{children}</>;
}
