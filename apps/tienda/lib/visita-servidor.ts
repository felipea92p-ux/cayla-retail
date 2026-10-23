import "server-only";
import { base } from "./base";

// Tienda web ▸ Tráfico (ADR-0495): anotar los pasos de un visitante en la base, por su puerta (`retail.tienda_anotar_pasos`). Medir no
// puede tumbar nada: si la base no responde, el paso se pierde y queda una línea en el registro; la página y la acción siguen igual
// (principio 9). La base vuelve a revisar cada paso y descarta lo que no calza.
export async function anotarPasos(visitante: string, pasos: readonly object[], region: string | null): Promise<void> {
  if (!pasos.length) return;
  try {
    await base()`select retail.tienda_anotar_pasos(${visitante}::uuid, ${JSON.stringify(pasos)}::text::jsonb, ${region})`;
  } catch (error) {
    console.error(JSON.stringify({ evento: "trafico_anotar", mensaje: error instanceof Error ? error.message : String(error) }));
  }
}
