import { exigirModulo } from "@/lib/persona-actual";

// La puerta de «El barrido del piso» (ADR-0690): es una función de Existencias (ADR-0306), no un módulo propio; quien ve Existencias
// entra, escanea y confirma (ADR-0534, Felipe 2026-11-22). La base lo vuelve a preguntar (hint `barrido_sin_modulo`).
export default async function BarridoLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("existencias");
  return <>{children}</>;
}
