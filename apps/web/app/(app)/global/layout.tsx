import { redirect } from "next/navigation";
import { exigirModulo, requirePersonaActualV2 } from "@/lib/persona-actual";

// CAYLA Global (ADR-0275): todo lo que cuelga de /global es de esa vista. Quien puede verla y está parado en una sede
// entra por /global/entrar, que elige la vista y vuelve aquí: así un enlace o un marcador a /global funciona desde
// cualquier sede. Quien no ve el módulo cae en «Sin acceso» (`exigirModulo`); el candado real está en la base.
export default async function GlobalLayout({ children }: { children: React.ReactNode }) {
  const persona = await requirePersonaActualV2();
  if (persona.vista !== "global" && persona.puedeVerGlobal) redirect("/global/entrar");
  await exigirModulo("cayla_global");
  return children;
}
