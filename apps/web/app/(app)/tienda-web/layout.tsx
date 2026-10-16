import { exigirModulo } from "@/lib/persona-actual";

// La puerta del GRUPO «Tienda web» (ADR-0430, Felipe 2026-10-16): entra quien ve alguna de sus pantallas. Cada pantalla repite la de
// su módulo en su propio layout (Pedidos pide «pedidos_web»; Vitrina, «vitrina_web»; Recomendaciones, «recomendaciones»; Ajustes,
// «configuracion»): con solo esta puerta, quien tiene Pedidos sin Vitrina abriría la Vitrina por URL. El candado real sigue en la base.
export default async function TiendaWebLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("pedidos_web", "vitrina_web", "recomendaciones", "configuracion");
  return <>{children}</>;
}
