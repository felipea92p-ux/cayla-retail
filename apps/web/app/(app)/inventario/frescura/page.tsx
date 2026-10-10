import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { getFrescuraPantalla, getFrescuraRed } from "@/lib/frescura";
import type { AccesoFrescura } from "@/lib/frescura-pantalla";
import { FrescuraPanel } from "@/components/frescura/FrescuraPanel";
import { FrescuraRed } from "@/components/frescura/FrescuraRed";

// Frescura del piso (ADR-0208, paso 4): cuánto lleva colgada cada prenda de la sede y qué hacer con lo que se queda.
// La sede es la del selector global (`persona.ubicacionId`): la pantalla no tiene selector propio, como Análisis.
// Esta página solo trae los datos (`getFrescuraPantalla`) y dice qué pantallas ve quien mira (para los botones del
// detalle); todo lo demás —palabras, colores, filtros— vive en `lib/frescura-pantalla.ts` y en el panel.
export default async function FrescuraPage() {
  // La repite aquí además del layout: un layout no vuelve a correr al navegar entre sus hijas (lo mismo que exigirLider).
  const persona = await exigirModulo("frescura");
  // En CAYLA Global (ADR-0208, act. 2026-10-10 (b)): las tiendas juntas, sin prendas.
  if (persona.vista === "global") return <FrescuraRed red={await getFrescuraRed(persona)} />;
  const acceso: AccesoFrescura = {
    existencias: veModulo(persona, "existencias"),
    historial: veModulo(persona, "historial"),
    traslados: veModulo(persona, "traslados"),
    conteos: veModulo(persona, "conteos"),
    atributos: veModulo(persona, "atributos"),
  };
  const datos = await getFrescuraPantalla(persona);
  return <FrescuraPanel datos={datos} acceso={acceso} />;
}
