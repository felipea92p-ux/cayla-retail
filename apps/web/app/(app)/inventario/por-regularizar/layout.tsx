import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «existencias» (ADR-0330: las ventas sin registrar son una diferencia de stock y viven en Existencias; ADR-0306:
// es una función del módulo donde está su botón, no un módulo aparte). El layout de /inventario no protege nada, así que sin este
// archivo la URL directa quedaba abierta. El candado real sigue en la base (`regularizar_prenda` pregunta por la sede).
export default async function PorRegularizarLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("existencias");
  return <>{children}</>;
}
