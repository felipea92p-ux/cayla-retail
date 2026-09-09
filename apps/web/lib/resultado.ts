/**
 * Cómo se leen los errores de Supabase en las pantallas.
 *
 * EL PROBLEMA QUE RESUELVE. El patrón `const { data } = await supabase...` descarta el
 * error de la consulta. Cuando falla, `data` viene `null`, el código hace `data ?? []`, y
 * la pantalla no muestra un error: muestra vacío. Auditado el 2026-09-09: 20 consultas así
 * contra 1 que revisaba el error.
 *
 * Lo grave no es que se caiga una pantalla — es que NO se caiga. Si falla la consulta de
 * `ventas`, el Estado de Resultados dibuja "S/0 en ventas" con cara de normalidad, y un
 * Líder mira su negocio y cree que no vendió nada. Una pantalla caída se nota; una
 * pantalla que miente, no. Eso es lo que el principio 9 llama no degradarse con gracia.
 *
 * DOS COMPORTAMIENTOS, decididos con Felipe el 2026-09-09, según lo que cuesta el error:
 *
 * - `exigir()` — para datos donde un número equivocado ES una decisión equivocada:
 *   plata, stock, catálogo. Revienta con contexto y lo atrapa el `error.tsx` de la
 *   sección. La pantalla no se dibuja. Preferimos no mostrar nada antes que mostrar algo
 *   falso.
 *
 * - `tolerar()` — para datos secundarios: un directorio, un listado de apoyo. La pantalla
 *   sigue viva con lo que sí cargó y avisa en el lugar del dato que falta, para que quien
 *   está en el mostrador con una clienta enfrente pueda seguir trabajando.
 *
 * La regla para elegir: pregúntate si alguien puede tomar una decisión de negocio mirando
 * ese dato. Si sí, `exigir()`.
 */

/** La forma que devuelve cualquier consulta de supabase-js, sin acoplarnos a su tipo. */
type ResultadoConsulta<T> = { data: T | null; error: { message: string } | null };

/**
 * Datos sin los cuales la pantalla no debe dibujarse. Lanza si la consulta falló, y de
 * paso estrecha el tipo: lo que devuelve ya no es `T | null`, así que desaparecen los
 * `?? []` que escondían el fallo.
 *
 * `que` describe el dato en el idioma del negocio ("las ventas del mes"), no la tabla:
 * termina en un log que alguien va a leer con prisa.
 */
export function exigir<T>(resultado: ResultadoConsulta<T>, que: string): T {
  if (resultado.error) {
    throw new Error(`No se pudo leer ${que}: ${resultado.error.message}`);
  }
  if (resultado.data === null) {
    // supabase-js devuelve [] —no null— cuando una consulta de lista sale bien, así que
    // llegar acá sin error es una anomalía real, no una lista vacía.
    throw new Error(`No se pudo leer ${que}: la consulta no devolvió datos.`);
  }
  return resultado.data;
}

/**
 * Como `exigir()`, pero para consultas donde "no hay fila" es una respuesta legítima y no
 * un fallo — las de `.maybeSingle()`: ¿hay una caja abierta ahora? ¿esta sede tiene almacén?
 *
 * La distinción importa más de lo que parece. Con `const { data }` a secas, un error de red
 * y un "no hay caja abierta" llegan idénticos: `data === null`. La pantalla dice "caja
 * cerrada" y alguien intenta abrir una segunda caja sobre una que sí estaba abierta. Acá el
 * fallo revienta y el vacío pasa, que son cosas distintas y deben tratarse distinto.
 */
export function exigirOpcional<T>(resultado: ResultadoConsulta<T>, que: string): T | null {
  if (resultado.error) {
    throw new Error(`No se pudo leer ${que}: ${resultado.error.message}`);
  }
  return resultado.data;
}

/** Lo que `tolerar()` entrega: los datos si llegaron, y el aviso para pintar si no. */
export type Tolerado<T> = { datos: T | null; fallo: string | null };

/**
 * Datos secundarios: si fallan, la pantalla sigue. Devuelve `fallo` con un mensaje ya
 * redactado para mostrarle a una Encargada — sin jerga de Postgres, que no le sirve de
 * nada y la asusta.
 */
export function tolerar<T>(resultado: ResultadoConsulta<T>, que: string): Tolerado<T> {
  if (resultado.error) {
    return { datos: null, fallo: `No se pudo cargar ${que}. Lo demás de esta pantalla sí está al día.` };
  }
  return { datos: resultado.data, fallo: null };
}
