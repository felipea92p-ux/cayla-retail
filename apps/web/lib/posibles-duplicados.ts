import { conCopiaPorVersion } from "@/lib/copia-por-version";
import { MOTIVO_DUPLICADO, type ParDuplicado } from "@/lib/posibles-duplicados-reglas";

/** La forma de lo que se guarda: la fila de `fn_productos_posibles_duplicados`. Sube si cambia la función (su migración) o qué se lee de ella. */
const FORMA_DUPLICADOS = "20261112212000";

/**
 * Los pares que parecen repetidos (ADR-0650, decisión 3: el sistema sugiere, la persona decide). `null` si no se pudo saber (la función aún
 * no está en la base, o no respondió): sin lista no se avisa nada, nunca un «0» que diga que no hay.
 *
 * Guardada entre visitas (2026-11-13, `docs/innovacion/2026-11-13-cambiar-de-modulo.md`
 * #8): la función compara todas las fichas activas entre sí (~0,5 s en producción en cada entrada a Productos) y solo lee `productos`, que
 * sube la versión del catálogo con cada cambio —también al fusionar dos fichas—, así que la copia nunca queda vieja (`conCopiaPorVersion`).
 * Lee `productos` con los permisos de quien llama, y esa lectura es igual para toda cuenta de retail: la copia se comparte sin mostrar nada de
 * más.
 */
export async function getPosiblesDuplicados(limite = 50): Promise<ParDuplicado[] | null> {
  const data = await conCopiaPorVersion(["posibles-duplicados", FORMA_DUPLICADOS, String(limite)], (supabase, guardar) =>
    guardar([], async () => {
      const { data, error } = await supabase.rpc("fn_productos_posibles_duplicados", { p_limite: limite });
      // Un error LANZA dentro de `guardar`: así no se guarda un «no hay» como si fuera la respuesta.
      if (error || !data) throw new Error(`No se pudieron leer las fichas parecidas: ${error?.message ?? "sin datos"}`);
      return data;
    }),
  ).catch(() => null);
  if (!data) return null;
  return data.map((f) => ({
    productoA: f.producto_a,
    referenciaA: f.referencia_a,
    productoB: f.producto_b,
    referenciaB: f.referencia_b,
    motivo: (f.motivo in MOTIVO_DUPLICADO ? f.motivo : "parecido") as ParDuplicado["motivo"],
  }));
}
