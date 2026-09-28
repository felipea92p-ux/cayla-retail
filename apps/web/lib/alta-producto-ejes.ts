// Guardar qué tallas/tejidos/patrones ofrece una categoría, desde el navegador
// (PUT /api/productos/categorias/ejes → RPC `actualizar_categoria_ejes`).
//
// CONTRATO
//   PROMETE: devolver `null` si se guardó, o una frase humana si no.
//   ASUME:   quien llama manda el conjunto COMPLETO de cada eje (la RPC
//            reemplaza, no amplía). Por eso `EjeIds` lleva los tres.
//   NO HACE: no decide permisos (los pone la RPC) ni actualiza la pantalla:
//            eso es de quien llama, tras un `null`.
//
// Vive aparte del formulario porque lo usan DOS gestos distintos —"configurar
// una categoría vacía" y "proponer un valor nuevo y ofrecerlo en esta
// categoría"— y los dos deben guardar igual, no parecido.
//
// `encabezados` (ADR-0161): la firma del combo «Responsable» de quien llama
// (`responsable.encabezados()`). Es obligatorio a propósito: cambiar el
// catálogo es operación de tienda y ningún gesto nuevo debe olvidar firmarlo.

export type EjeIds = { tallaIds: string[]; tejidoIds: string[]; patronIds: string[] };

export type TipoVocabulario = "tallas" | "tejidos" | "patrones";

/** Lo que la categoría ofrece hoy, más `id` en el eje `tipo`: el conjunto COMPLETO que `guardarEjesCategoria` necesita para ofrecer
 *  un valor más sin quitarle nada. Ofrecer uno que ya estaba no lo repite. */
export function sumarAlEje(ejes: EjeIds, tipo: TipoVocabulario, id: string): EjeIds {
  const clave = tipo === "tallas" ? "tallaIds" : tipo === "tejidos" ? "tejidoIds" : "patronIds";
  return ejes[clave].includes(id) ? ejes : { ...ejes, [clave]: [...ejes[clave], id] };
}

export async function guardarEjesCategoria(
  categoriaId: string,
  ejes: EjeIds,
  encabezados: Record<string, string>,
  tallaHabitualIds?: string[],
): Promise<string | null> {
  try {
    const res = await fetch("/api/productos/categorias/ejes", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...encabezados },
      body: JSON.stringify({ categoriaId, ...ejes, ...(tallaHabitualIds ? { tallaHabitualIds } : {}) }),
    });
    if (res.ok) return null;
    const datos = await res.json().catch(() => null);
    return datos?.error ?? "No se pudo guardar en la categoría. Reintenta.";
  } catch {
    return "No se pudo hablar con el servidor. Reintenta en un momento.";
  }
}

type RutaVocabulario = TipoVocabulario | "etiquetas";

const CLAVE_RESPUESTA: Record<RutaVocabulario, string> = { tallas: "talla", tejidos: "tejido", patrones: "patron", etiquetas: "etiqueta" };

export type ValorCreado = { id: string; texto: string; aprobado: boolean };

async function proponerEnVocabulario(
  ruta: RutaVocabulario,
  texto: string,
  encabezados: Record<string, string>,
): Promise<{ valor: ValorCreado | null; error: string | null }> {
  try {
    const res = await fetch(`/api/productos/${ruta}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...encabezados },
      // Tallas guarda el texto en `valor`; tejidos, patrones y etiquetas en `nombre` (así están sus rutas).
      body: JSON.stringify(ruta === "tallas" ? { valor: texto } : { nombre: texto }),
    });
    const datos = await res.json().catch(() => null);
    if (!res.ok) return { valor: null, error: datos?.error ?? "No se pudo agregar." };
    const fila = datos?.[CLAVE_RESPUESTA[ruta]];
    if (!fila?.id) return { valor: null, error: "La respuesta no trajo el valor creado. Recarga la pantalla." };
    return { valor: { id: fila.id, texto: fila.valor ?? fila.nombre ?? texto, aprobado: fila.estado === "aprobado" }, error: null };
  } catch {
    return { valor: null, error: "No se pudo hablar con el servidor. Reintenta en un momento." };
  }
}

/** Propone un valor nuevo (POST /api/productos/{tipo}). Un Líder lo deja aprobado de una; cualquier otro rol lo deja pendiente. */
export function proponerValorVocabulario(tipo: TipoVocabulario, texto: string, encabezados: Record<string, string>) {
  return proponerEnVocabulario(tipo, texto, encabezados);
}

/**
 * Crea una etiqueta nueva desde el alta (POST /api/productos/etiquetas): el mismo mecanismo que un tejido o un patrón nuevo
 * (vocabulario cerrado, ADR-0095). Un Líder la deja aprobada de una y se puede aplicar ya; cualquier otro rol la deja
 * PENDIENTE y no se puede aplicar a la prenda hasta que un Líder la apruebe (`valor.aprobado === false`).
 * Con internet caído devuelve la frase «No se pudo hablar con el servidor», sin crear nada.
 */
export function proponerEtiqueta(texto: string, encabezados: Record<string, string>) {
  return proponerEnVocabulario("etiquetas", texto, encabezados);
}
