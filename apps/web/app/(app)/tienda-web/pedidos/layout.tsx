import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «pedidos_web» (ADR-0408, actividad 8): quien llega por URL directa sin ese módulo en su rol cae en «Sin
// acceso». Nace solo para el líder (sin rol, 20261015010000). El candado real sigue en la base: cada función pide el módulo y la
// tienda que se opera (`fn_pedido_web_exigir`).
export default async function PedidosWebLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("pedidos_web");
  return <>{children}</>;
}
