import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «campanas_web» (Tienda web ▸ Campañas, 20261021161000): quien llega por URL directa sin ese módulo en su rol cae
// en «Sin acceso». Nace solo para el líder (sin rol). El candado real sigue en la base: cada función pide el módulo.
export default async function CampanasWebLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("campanas_web");
  return <>{children}</>;
}
