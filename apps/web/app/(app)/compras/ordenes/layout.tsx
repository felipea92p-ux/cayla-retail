import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «ordenes_compra» (ADR-0362; ADR-0161): quien llega por URL directa sin ese módulo en su rol cae en «Sin acceso».
// Nace solo para el líder (sin rol, 20261010214500); el líder decide después a quién se lo da. Quien lo tiene ve las órdenes de todas
// las sedes con sus precios (decisiones 34 y 37), así que basta el módulo: no pide además el dinero de Compras. El candado real sigue en
// la base: `fn_ordenes_compra` y las funciones que guardan piden el módulo.
export default async function OrdenesCompraLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("ordenes_compra");
  return <>{children}</>;
}
