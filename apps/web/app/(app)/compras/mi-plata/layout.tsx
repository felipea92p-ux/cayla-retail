import { exigirModulo } from "@/lib/persona-actual";

// La puerta de «Mi plata para compras» (ADR-0480; ADR-0161): quien llega por URL directa sin el módulo en su rol cae en «Sin acceso».
// La clave es `ordenes_compra`, REUSADA: unas 40 funciones de la base la usan como llave (recibir, gastos del viaje, datos bancarios,
// proveedor nuevo, «Nos debe»), así que quien hoy compra sigue pudiendo sin que nadie toque su rol. El candado real sigue en la base.
export default async function MiPlataLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("ordenes_compra");
  return <>{children}</>;
}
