import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «existencias» (ADR-0161 B2, ADR-0208, ADR-0306: bajar al piso es una función de Existencias): el layout de /inventario no protege nada, así que sin este
// archivo la URL directa quedaba abierta. El candado real sigue en la base (`bajar_al_piso` pregunta fn_ve_modulo).
export default async function BajarLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("existencias");
  return <>{children}</>;
}
