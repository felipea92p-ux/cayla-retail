/**
 * Cómo se leen los errores de ESCRITURA en las pantallas.
 *
 * EL HERMANO QUE FALTABA. `lib/resultado.ts` resolvió el lado de la lectura y dejó la regla
 * escrita: los mensajes se muestran "sin jerga de Postgres, que no le sirve de nada y la
 * asusta". Pero ese archivo solo cubre `select`. Del lado de la escritura, 29 llamadas en 17
 * componentes hacían `setError(error.message)` — o sea, le ponían delante a una Encargada, con
 * la clienta en el mostrador, un texto como:
 *
 *     new row for relation "stock" violates check constraint "stock_cantidad_no_negativa"
 *
 * Eso no le dice qué pasó ni qué hacer. Peor: enseña que el sistema es hostil, y quien recién
 * aprende no vuelve a probar nada por su cuenta.
 *
 * LO QUE ESTE ARCHIVO NO HACE, Y ES DELIBERADO. No re-traduce lo que ya está bien dicho. Las
 * RPC del repo levantan sus errores en castellano de CAYLA —"Esta caja ya está cerrada — no se
 * pueden registrar más ventas ahí", "No tienes permiso para vender en esa caja"— y Postgres los
 * devuelve con `code = 'P0001'`. Esos pasan tal cual: reescribirlos sería alejar el mensaje de
 * la regla de negocio que lo produjo, y dejaría dos textos que se pueden desincronizar.
 *
 * Lo que sí traduce es lo que Postgres escribe por su cuenta: violaciones de `check`, de índice
 * único, de RLS y de llave foránea. Son las redes de seguridad del esquema (principio 2), y
 * cuando saltan siempre hay una frase humana equivalente — porque sabemos exactamente qué
 * estado imposible estaban impidiendo.
 *
 * LO QUE NO RECONOCE, NO SE LO TRAGA. Cae a un mensaje honesto con el texto original detrás de
 * "Código:", igual que `app/(app)/error.tsx` hace con `error.digest`. Un error escondido es
 * peor que uno feo: si mañana aparece una huella nueva, queremos verla para agregarla acá.
 *
 * Generaliza el caso suelto que ya existía en `RecibirLoteForm.tsx` (el de
 * `productos_sku_padre_key`), incluida su mejor idea: el mensaje no solo dice qué falló, dice
 * A DÓNDE IR EN VEZ DE.
 */

/** La forma del error de supabase-js, sin acoplarnos a su tipo. */
export type ErrorEscritura = {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
} | null;

/**
 * Huellas técnicas conocidas → frase accionable.
 *
 * La marca es el nombre real de la restricción en `supabase/migrations/*.sql`, no una palabra
 * suelta del mensaje: los nombres los elegimos nosotros y no cambian con la versión de Postgres.
 */
const HUELLAS: { marca: string; frase: string }[] = [
  {
    // 0010_stock_concurrencia.sql:14 — la red que impide dejar el stock en negativo.
    marca: "stock_cantidad_no_negativa",
    frase:
      "No hay suficiente stock para eso. Revisa la cantidad, o mira en Inventario si la prenda está en el almacén y todavía no bajó a piso.",
  },
  {
    // 0045_ajuste_con_signo.sql:97 — la misma red, sobre el almacén interno de la sede.
    // Los dos nombres no se solapan (`stock_almacen_…` no contiene a `stock_…` de forma
    // contigua), así que el orden entre ambas no decide nada. Va primera igual, porque la
    // regla de esta lista es que gana la PRIMERA que coincide y conviene que lo específico
    // quede delante de lo general el día que alguien renombre una.
    marca: "stock_almacen_cantidad_no_negativa",
    frase:
      "No hay tanto en el almacén de esta sede. Revisa la cantidad — puede que parte ya esté abajo, en el piso de venta.",
  },
  {
    // 0045_ajuste_con_signo.sql:106 — solo el ajuste lleva signo; un movimiento de cero
    // no significa nada.
    marca: "movimientos_cantidad_coherente",
    frase:
      "Esa cantidad no sirve: tiene que ser mayor que cero. Solo un ajuste de inventario puede ir en negativo, y es para cuando cuentas MENOS de lo que dice el sistema.",
  },
  {
    // 0001_init.sql — dos productos no pueden compartir referencia.
    marca: "productos_sku_padre_key",
    frase:
      'Ya existe un producto con esa referencia — búscalo en "¿Reingreso de algo que ya existe?" en vez de crear uno nuevo.',
  },
  {
    // 0007_finanzas.sql:22 — una sola caja abierta por sede.
    marca: "cajas_sede_abierta_unique",
    frase: "Esta sede ya tiene una caja abierta. Ciérrala antes de abrir otra.",
  },
  {
    // 0032_comprobantes.sql:48 — el correlativo no se repite jamás.
    marca: "comprobantes_tipo_serie_numero",
    frase:
      "Ese número de comprobante ya está usado. Vuelve a Facturación y emite de nuevo: el sistema tomará el siguiente correlativo.",
  },
  {
    // 0006_personas_auth_user_id_unique.sql — una cuenta, una persona.
    marca: "personas_auth_user_id",
    frase: "Esa cuenta ya está vinculada a otro integrante.",
  },
  {
    // RLS: la política rechazó la fila. Pasa cuando se opera sobre una sede que no es la tuya.
    marca: "row-level security",
    frase:
      "No tienes permiso para hacer eso en esta sede. Si estás cubriendo otra tienda, cambia de sede arriba a la derecha; si no, pídeselo a un Líder.",
  },
  {
    marca: "violates foreign key constraint",
    frase:
      "Falta un dato al que esto se engancha (una prenda, una sede o un proveedor que ya no existe). Recarga la pantalla y vuelve a intentar.",
  },
  {
    // El token venció mientras el modal estaba abierto.
    marca: "JWT expired",
    frase: "Tu sesión venció. Vuelve a entrar y repite la operación — no se guardó nada.",
  },
  {
    // 0054_venta_idempotente.sql — LA EXCEPCIÓN A LA REGLA DE ARRIBA, y va explicada porque
    // contradice el párrafo "no re-traduce lo que ya está bien dicho".
    //
    // Este `raise exception` llega con `code = 'P0001'`, o sea que por la regla general pasaría
    // tal cual. Pero su texto NO está en idioma CAYLA: habla de "token" y de "reutilizar", que
    // son palabras del sistema, no del mostrador. Y no se arregla en la RPC porque el mismo
    // texto está vivo en producción desde un parche a mano anterior a este repo; cambiarlo allá
    // es DDL en el proyecto compartido con Dynamic. Se traduce acá, que es el único sitio donde
    // el arreglo cubre los dos entornos a la vez.
    //
    // La marca es nuestra propia frase y no el nombre de una restricción —lo contrario de lo que
    // pide el comentario de arriba— porque la excepción se levanta desde el cuerpo de la función,
    // no desde el índice: no hay nombre de restricción en el mensaje. Es texto que elegimos
    // nosotros y vive en `0054`, así que es tan estable como un nombre de constraint.
    //
    // CUÁNDO LO VE: intentó registrar, pareció fallar, corrigió el carrito y volvió a darle. La
    // primera SÍ había entrado. Lo que necesita saber no es que un token se reusó — es que a la
    // clienta ya se le cobró y que esto de ahora es una venta aparte.
    marca: "Este token ya se uso para una venta con otros datos",
    frase:
      "La venta anterior sí se registró, aunque la pantalla dijera que no. Revísala abajo en «Ventas de hoy» antes de volver a cobrar: si esto es una venta distinta, cierra y abre «Registrar venta» de nuevo.",
  },
];

/** Textos que delatan que ni siquiera se llegó al servidor. */
const SIN_RED = ["failed to fetch", "networkerror", "load failed", "fetch failed", "aborted"];

/**
 * ¿Este error es de RED, y no una respuesta del servidor?
 *
 * La distinción decide qué hacer con el trabajo, no solo qué frase mostrar. Un fallo de red
 * significa "el servidor no se enteró": la operación se puede encolar y repetir. Un rechazo
 * del servidor —`P0001` de una RPC, un `check`, RLS— significa "se enteró y dijo no":
 * repetirla dará el mismo no, y encolarla es prometer un guardado que nunca va a ocurrir.
 * `ConteoPanel` encolaba en los dos casos, y solo se notó al probar sin red (ADR-0034).
 */
export function esFalloDeRed(error: ErrorEscritura): boolean {
  if (!error) return false;
  const crudo = [error.message, error.details, error.hint].filter(Boolean).join(" · ").toLowerCase();
  return SIN_RED.some((t) => crudo.includes(t));
}

/**
 * Convierte el error de una escritura en una frase que una Encargada puede leer y usar.
 *
 * `contexto` describe la acción en el idioma del negocio ("registrar la venta", "cerrar la
 * caja"), no la RPC: termina dentro de la frase que ella lee con prisa.
 *
 * `reintentoSeguro` lo pasa la escritura que puede repetirse sin duplicar nada — hoy solo la
 * venta, desde `0054`, que va con un token de idempotencia. Cambia SOLO el mensaje de "no
 * llegué al servidor", y por una razón concreta: ese mensaje afirma "no se guardó nada" y
 * `Failed to fetch` no puede saberlo. No distingue entre "no salió" y "salió, entró, y se
 * cortó la respuesta". Donde la escritura es idempotente la duda deja de importar y se puede
 * decir la verdad completa; donde no lo es, sigue diciendo lo de siempre, que al menos no
 * promete una seguridad que no existe.
 */
export function traducirError(
  error: ErrorEscritura,
  contexto: string,
  opciones?: { reintentoSeguro?: boolean }
): string {
  if (!error) return `No se pudo ${contexto}.`;

  const crudo = [error.message, error.details, error.hint].filter(Boolean).join(" · ");
  const enMinusculas = crudo.toLowerCase();

  if (esFalloDeRed(error)) {
    if (opciones?.reintentoSeguro) {
      return `No se pudo ${contexto}: la conexión se cortó. Revisa el internet y vuelve a intentar con el mismo carrito — si alcanzó a entrar, el sistema la reconoce y no la cobra dos veces.`;
    }
    return `No se pudo ${contexto}: la conexión falló antes de llegar al servidor. No se guardó nada — revisa el internet y vuelve a intentar.`;
  }

  const huella = HUELLAS.find((h) => enMinusculas.includes(h.marca.toLowerCase()));
  if (huella) return huella.frase;

  // `P0001` es un `raise exception` de nuestras propias RPC: ya viene en idioma CAYLA.
  if (error.code === "P0001" && error.message) return error.message;

  return `No se pudo ${contexto}. Vuelve a intentar; si sigue igual, avisa a Felipe. Código: ${crudo}`;
}
