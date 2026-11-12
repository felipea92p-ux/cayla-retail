import { createClient } from "@/lib/supabase/server";
import { MOTIVO_DUPLICADO, type ParDuplicado } from "@/lib/posibles-duplicados-reglas";

/** Los pares que parecen repetidos (decisión 3: el sistema sugiere, la persona decide). `null` si no se pudo saber (la función aún
 *  no está en la base, o no respondió): sin lista no se avisa nada, nunca un «0» que diga que no hay. */
export async function getPosiblesDuplicados(limite = 50): Promise<ParDuplicado[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_productos_posibles_duplicados", { p_limite: limite });
  if (error || !data) return null;
  return data.map((f) => ({
    productoA: f.producto_a,
    referenciaA: f.referencia_a,
    productoB: f.producto_b,
    referenciaB: f.referencia_b,
    motivo: (f.motivo in MOTIVO_DUPLICADO ? f.motivo : "parecido") as ParDuplicado["motivo"],
  }));
}
