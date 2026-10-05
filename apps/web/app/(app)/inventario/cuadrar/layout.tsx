import { exigirModulo } from "@/lib/persona-actual";

// La puerta de «Cuadrar el piso» (ADR-0328): es una función de Existencias (ADR-0306), no un módulo propio; quien ve Existencias
// entra y escanea. Confirmar el cuadre es solo de un líder, y eso lo decide la base (`cuadrar_piso`, hint `cuadre_solo_lider`).
// El layout de /inventario no protege nada: sin este archivo la URL directa quedaba abierta.
export default async function CuadrarLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("existencias");
  return <>{children}</>;
}
