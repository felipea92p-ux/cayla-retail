import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leerFilasDeValor, type SedeConValor } from "@/lib/valor-inventario-reglas";

/**
 * Lo que vale lo que hay en cada sede, a costo (ADR-0557), para «Ver el valor a costo» de Existencias. La puerta está en la base
 * (`fn_valor_inventario_existencias`): sin el dinero de Compras devuelve CERO filas, y aquí eso es `null` («no se dibuja»), nunca un 0.
 * La suma se hace en la base: el costo de cada prenda no llega al navegador (ADR-0183).
 *
 * Dato SECUNDARIO: si la base no responde, devuelve `null` y Existencias sigue en pie sin el enlace. Nunca lanza.
 */
export async function getValorInventario(): Promise<SedeConValor[] | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_valor_inventario_existencias");
    if (error) {
      console.error("Existencias: no se pudo leer el valor del inventario", error);
      return null;
    }
    return leerFilasDeValor(data);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Existencias: no se pudo leer el valor del inventario", error);
    return null;
  }
}
