import { redirect } from "next/navigation";
import { exigirModulo, veModulo } from "@/lib/persona-actual";

// La puerta de «Tienda web» (ADR-0430): quien llega a `/tienda-web` cae en la primera pantalla del grupo que ve, en el orden del menú.
// Sin ninguna, `exigirModulo` lo manda a «Sin acceso» (o a elegir sede, en CAYLA Global), como cualquier módulo.
export default async function TiendaWebPage() {
  const persona = await exigirModulo("pedidos_web", "vitrina_web", "recomendaciones", "configuracion");
  if (veModulo(persona, "pedidos_web")) redirect("/tienda-web/pedidos");
  if (veModulo(persona, "vitrina_web")) redirect("/tienda-web/vitrina");
  if (veModulo(persona, "recomendaciones")) redirect("/tienda-web/recomendaciones");
  redirect("/tienda-web/ajustes");
}
