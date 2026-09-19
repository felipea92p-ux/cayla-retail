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
 *
 * Desde 2026-09-14 también valen para los `raise exception` de las RPC que necesitan meter un
 * DATO en la frase (qué prenda, qué código, qué tope): la RPC levanta el nombre estable como
 * mensaje y pone el dato en `detail`; acá `frase` puede ser una función que lo recibe.
 */
type Huella = { marca: string; frase: string | ((detalle: string) => string) };

const HUELLAS: Huella[] = [
  {
    // 20260914215059_candado_precio_venta.sql — `registrar_venta` compara cada precio con
    // `variantes.precio`: la caja ya no edita precios, y la base deja de confiar en el
    // navegador. El detalle es «referencia (sku)».
    marca: "venta_precio_cambiado",
    frase: (prenda) => `El precio de ${prenda} cambió: quítala del ticket y vuelve a agregarla.`,
  },
  {
    // 20260917100700_movimientos_respetan_restriccion_sede.sql — una etiqueta con
    // `sedes_permitidas` (ADR-0095) restringe en qué sede se puede VENDER una variante. El
    // detalle es «referencia (sku)», mismo formato que venta_precio_cambiado.
    marca: "venta_variante_restringida_a_otra_sede",
    frase: (prenda) => `${prenda} está restringida a otra sede — no se puede vender desde acá.`,
  },
  {
    // Misma migración — el mismo candado, del lado de Traslados: no se puede sacar de una
    // sede una variante que una etiqueta restringe a otra.
    marca: "traslado_variante_restringida_a_otra_sede",
    frase: (prenda) => `${prenda} está restringida a otra sede — no se puede trasladar desde acá.`,
  },
  {
    // 20260914220804_nota_en_ventas.sql — la nota del ticket tiene tope; la pantalla ya
    // corta en 200, esto es por si llega por otro camino.
    marca: "ventas_nota_corta",
    frase: "La nota es muy larga: hasta 200 caracteres. Acórtala y vuelve a cobrar.",
  },
  {
    // 20260914215103_codigos_descuento.sql — una Colaboradora solo descuenta con código.
    marca: "venta_descuento_requiere_codigo",
    frase: "Para aplicar un descuento necesitas un código válido. Pídeselo a un Líder, o quita el descuento.",
  },
  {
    // Misma migración — el código no existe, está inactivo, venció o es de otra sede.
    marca: "venta_codigo_descuento_invalido",
    frase: (codigo) => `El código ${codigo} no es válido o ya venció. Revísalo o pídele otro a un Líder.`,
  },
  {
    // Misma migración — el % del código es el tope de cada línea.
    marca: "venta_descuento_supera_codigo",
    frase: (tope) => `Ese código permite hasta un ${tope} % de descuento. Baja el descuento o usa otro código.`,
  },
  {
    // 20260915140000_descuento_motivo_y_escalonado.sql — cualquier descuento > 0 pide un
    // motivo de la lista (R-45). El detalle es «referencia (sku)».
    marca: "venta_descuento_requiere_motivo",
    frase: (prenda) => `Elige por qué se aplica el descuento en ${prenda} antes de cobrar.`,
  },
  {
    // Misma migración — el motivo "Otro" pide un texto que lo explique.
    marca: "venta_descuento_otro_sin_detalle",
    frase: (prenda) => `Cuenta en una línea por qué es "Otro" el motivo del descuento en ${prenda}.`,
  },
  {
    // Misma migración — candado universal de R-45: nunca por debajo del costo, sin
    // importar quién descuente. No revela el número — el candado tampoco lo hace.
    marca: "venta_descuento_bajo_costo",
    frase: (prenda) => `Ese descuento en ${prenda} deja el precio por debajo de lo que cuesta. Bájalo un poco.`,
  },
  {
    // Misma migración — banda 20-35 % de un Líder (R-45): pide un argumento escrito.
    marca: "venta_descuento_requiere_argumento",
    frase: (prenda) => `El descuento en ${prenda} pasa el 20 %: escribe el argumento antes de cobrar.`,
  },
  {
    // Misma migración — más de 35 % nadie, ni un Líder (decisión de Felipe, 2026-09-15):
    // la base no puede distinguirlo de cualquier otra de las 9 personas registradas.
    marca: "venta_descuento_supera_autorizacion",
    frase: (prenda) => `El descuento en ${prenda} pasa el 35 % — nadie puede aplicarlo así. Bájalo.`,
  },
  {
    // 20260918170000_venta_aplica_descuento_de_campana.sql — la prenda tiene una campaña
    // vigente y la caja mandó menos descuento (ticket armado antes de que empezara, o
    // campañas que no cargaron). Recargar trae las campañas de hoy. El detalle es
    // «referencia (sku)».
    marca: "venta_campana_omitida",
    frase: (prenda) => `${prenda} tiene una campaña vigente y el ticket no la aplicó. Recarga la pantalla de Vender y vuelve a armar el ticket.`,
  },
  {
    // Misma migración — la etiqueta de campaña ya no alcanza a la prenda (o terminó hace
    // más de 3 días, o no está aprobada).
    marca: "venta_campana_no_vigente",
    frase: (prenda) => `La campaña de ${prenda} ya no está vigente. Recarga la pantalla de Vender y vuelve a armar el ticket.`,
  },
  {
    // Misma migración — el monto no es el % de la etiqueta: la campaña cambió de % entre
    // que se armó el ticket y se cobró.
    marca: "venta_campana_monto_no_coincide",
    frase: (prenda) => `El descuento de campaña de ${prenda} cambió. Recarga la pantalla de Vender y vuelve a armar el ticket.`,
  },
  {
    marca: "venta_campana_sin_etiqueta",
    frase: (prenda) => `El descuento de campaña de ${prenda} llegó incompleto. Recarga la pantalla de Vender y vuelve a armar el ticket.`,
  },
  {
    // Misma migración — un descuento a mano menor o igual que la campaña no vale: un solo
    // descuento por prenda, el mayor.
    marca: "venta_descuento_no_supera_campana",
    frase: (prenda) => `${prenda} ya tiene una campaña con igual o más descuento. Quita el descuento manual o aplica uno mayor.`,
  },
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
    // 0002_esquema.sql — dos variantes no pueden compartir SKU.
    marca: "variantes_sku_key",
    frase: 'Ya existe una variante con ese SKU — revisa el catálogo en vez de crear uno nuevo.',
  },
  {
    // 20260916190000_variantes_identidad_unica.sql — la talla se compara como
    // en el código impreso ("M" = "m ", "Única" = "U"); sin color cuenta como un color.
    marca: "variantes_identidad_unica",
    frase:
      "Ya existe una variante con esa talla y color en este producto. La talla se compara como en la etiqueta: \"M\" y \"m\" son la misma, y \"Única\" es lo mismo que \"U\".",
  },
  {
    // 20260912235500_vocabulario_cerrado.sql — el código impreso es único.
    marca: "variantes_codigo_unico",
    frase: "Ya existe una prenda con ese código (modelo, color y talla). Revisa el catálogo en vez de crearla de nuevo.",
  },
  {
    // 0008_caja_y_pagos.sql — una sola caja abierta por ubicación.
    marca: "cajas_ubicacion_abierta_unica",
    frase: "Esta ubicación ya tiene una caja abierta. Ciérrala antes de abrir otra.",
  },
  {
    // 0010_facturacion.sql — el correlativo no se repite jamás.
    marca: "comprobantes_tipo_serie_numero",
    frase:
      "Ese número de comprobante ya está usado. Vuelve a Facturación y emite de nuevo: el sistema tomará el siguiente correlativo.",
  },
  {
    // 20260914160000_igv_solo_en_factura.sql — boleta y nota de venta no discriminan IGV.
    marca: "compras_igv_solo_factura",
    frase:
      "Una boleta o una nota de venta no lleva IGV aparte: el precio del documento ya es el costo. Pon el IGV en 0 o cambia el tipo a factura.",
  },
  {
    // 20260914150000_proveedores_administrables.sql — dos proveedores no pueden compartir RUC.
    marca: "proveedores_ruc_unico",
    frase: "Ese RUC ya está registrado en otro proveedor. Búscalo en Compras → Proveedores en vez de crear uno nuevo.",
  },
  {
    // 20260914150000_proveedores_administrables.sql — ni el mismo nombre con distinta forma.
    marca: "proveedores_nombre_clave_unica",
    frase: "Ya existe un proveedor con ese nombre (aunque esté escrito distinto). Búscalo en Compras → Proveedores.",
  },
  {
    // RLS: la política rechazó la fila. Pasa cuando se opera sobre una ubicación que no es la tuya.
    marca: "row-level security",
    frase:
      "No tienes permiso para hacer eso en esta ubicación. Si estás cubriendo otra tienda, pídeselo a un Líder.",
  },
  {
    // 20260918010000_familias_tabla_propia.sql — antes de esta huella, un FK
    // roto acá caía en el genérico de abajo ("recarga la pantalla"), que no
    // dice qué elegir. Tiene que ir ANTES del genérico: el mensaje de
    // Postgres para un FK siempre incluye también "violates foreign key
    // constraint", y HUELLAS.find() se queda con la primera que calce.
    marca: "categorias_familia_fk",
    frase: "Esa familia ya no existe o fue desactivada. Recarga la lista y elige otra.",
  },
  {
    marca: "violates foreign key constraint",
    frase:
      "Falta un dato al que esto se engancha (una prenda, una ubicación o un proveedor que ya no existe). Recarga la pantalla y vuelve a intentar.",
  },
  {
    // El token venció mientras el modal estaba abierto.
    marca: "JWT expired",
    frase: "Tu sesión venció. Vuelve a entrar y repite la operación — no se guardó nada.",
  },
  {
    // 0002_esquema.sql:58 — `check (costo >= 0)` sin nombre propio, Postgres
    // la nombra `variantes_costo_check`. `RecepcionFormV2.tsx` ya recorta un
    // costo negativo en el campo, esto es la red de seguridad si llega igual.
    marca: "variantes_costo_check",
    frase: "El costo no puede ser negativo. Corrígelo y vuelve a intentar.",
  },
  {
    // 20260912235500_vocabulario_cerrado.sql — el código son 3 mayúsculas y
    // es la clave primaria de retail.colores.
    marca: "colores_pkey",
    frase: "Ese código de 3 letras ya lo usa otro color. Prueba con otro.",
  },
  {
    // 20260912235500_vocabulario_cerrado.sql — el candado real: "Azul
    // marino" y "azul marino" son el mismo color para fn_clave_texto,
    // aunque el texto no calce byte a byte.
    marca: "colores_clave_unica",
    frase:
      "Ya existe un color muy parecido en el vocabulario (mayúsculas, tildes o espacios de más no cuentan como distinto). Revisa la lista antes de crear uno nuevo.",
  },
  {
    // 20260915160000_categorias_editar_desactivar.sql — el candado real:
    // "Blusas" y "BLUSAS"/"blusas" son la misma categoría para
    // fn_clave_texto, aunque el texto no calce byte a byte. Reemplaza al
    // viejo `categorias_nombre_key` (unique plano, case/accent-sensitive),
    // que esa misma migración eliminó.
    marca: "categorias_nombre_clave_unica",
    frase: "Ya existe una categoría con ese nombre (aunque esté escrito distinto) — en cualquier familia.",
  },
  {
    // 20260912235500_vocabulario_cerrado.sql — el prefijo son exactamente 3 mayúsculas.
    marca: "categorias_prefijo_formato",
    frase: "El prefijo tiene que ser exactamente 3 letras mayúsculas (ej. BLU).",
  },
  {
    // 20260912235500_vocabulario_cerrado.sql — dos categorías no pueden
    // compartir prefijo, o el código de la prenda dejaría de ser único.
    marca: "categorias_prefijo_unico",
    frase: "Ese prefijo ya lo usa otra categoría. Prueba con otras 3 letras.",
  },
  {
    // 20260918010000_familias_tabla_propia.sql — mismo candado que
    // colores_clave_unica: "Belleza" y "belleza " son la misma familia para
    // fn_clave_texto, aunque el texto no calce byte a byte.
    marca: "familias_nombre_unico",
    frase: "Ya existe una familia muy parecida (mayúsculas, tildes o espacios de más no cuentan como distinto).",
  },
];

/** Textos que delatan que ni siquiera se llegó al servidor. */
const SIN_RED = ["failed to fetch", "networkerror", "load failed", "fetch failed", "aborted"];

/**
 * ¿El error tiene forma de corte de red, no de rechazo del servidor? Se usa para
 * bifurcar ANTES de mostrar nada — la cola de ventas offline (`lib/ventas-offline.ts`,
 * BACKLOG "resiliencia sin internet") la reusa para decidir si una venta se encola en vez
 * de mostrarse como fallo. Misma lista `SIN_RED` que `traducirError` ya usaba: una sola
 * fuente de verdad para "esto no llegó al servidor" (principio 4).
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
 */
export function traducirError(error: ErrorEscritura, contexto: string): string {
  if (!error) return `No se pudo ${contexto}.`;

  if (esFalloDeRed(error)) {
    return `No se pudo ${contexto}: la conexión falló antes de llegar al servidor. No se guardó nada — revisa el internet y vuelve a intentar.`;
  }

  const crudo = [error.message, error.details, error.hint].filter(Boolean).join(" · ");
  const enMinusculas = crudo.toLowerCase();

  const huella = HUELLAS.find((h) => enMinusculas.includes(h.marca.toLowerCase()));
  if (huella) return typeof huella.frase === "function" ? huella.frase(error.details ?? "") : huella.frase;

  // `P0001` es un `raise exception` de nuestras propias RPC: ya viene en idioma CAYLA.
  if (error.code === "P0001" && error.message) return error.message;

  return `No se pudo ${contexto}. Vuelve a intentar; si sigue igual, avisa a Felipe. Código: ${crudo}`;
}
