// La «firma» de lo que decide un precio en pantalla: la versión del catálogo (la sube la base en cualquier escritura de
// `variantes` y demás tablas del catálogo, 20260923184300) y las campañas que rigen hoy por prenda (`campanas_vigentes`;
// poner o quitar una etiqueta, o que una campaña empiece o termine, NO sube esa versión). Si la firma cambió, alguna
// pantalla abierta puede estar mostrando un precio viejo. Pura, para probarla.

export type FilaCampana = { variante_id: string; etiqueta_id: string; descuento_pct: number | string };

/** `null` si no hay con qué firmar (las dos lecturas fallaron): quien sondea no decide nada con eso. Si solo una falló,
 *  esa parte se marca «?» y la firma se compara igual por la otra. */
export function firmaDePrecios(version: number | null, campanas: FilaCampana[] | null): string | null {
  if (version === null && campanas === null) return null;
  const partes = campanas === null ? "?" : campanas.map((c) => `${c.variante_id}:${c.etiqueta_id}:${Number(c.descuento_pct)}`).sort().join(",");
  return `${version ?? "?"}|${partes}`;
}

/** ¿Cambió algo que se ve? Una parte desconocida («?») en cualquiera de las dos no cuenta como cambio de esa parte. */
export function cambioLaFirma(antes: string, ahora: string): boolean {
  const [va, ca] = antes.split("|");
  const [vb, cb] = ahora.split("|");
  const versionCambio = va !== "?" && vb !== "?" && va !== vb;
  const campanasCambiaron = ca !== "?" && cb !== "?" && ca !== cb;
  return versionCambio || campanasCambiaron;
}

/** Con el foco en un campo de texto, el refresco espera: rehacer la pantalla bajo los dedos de quien escribe no se hace. */
export function escribiendoEn(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const tipo = (el.getAttribute("type") ?? "text").toLowerCase();
    return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image"].includes(tipo);
  }
  return el.getAttribute("contenteditable") === "true" || el.getAttribute("contenteditable") === "";
}
