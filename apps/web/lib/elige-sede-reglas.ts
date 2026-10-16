// «Elige sede» (CAYLA Global, ADR-0275): la pantalla a la que se vuelve después de elegir la sede viene por la URL (`?desde=`), y
// cualquiera puede escribirla. Solo pasa una ruta del propio ERP (la misma idea que `desdeSeguro` de Productos): una que, resuelta contra
// el origen del ERP, sigue en el ERP. Si no, la pantalla ofrece las sedes sin destino.

const ORIGEN_DE_PRUEBA = "http://cayla.local";

/** La ruta interna a la que volver, o null si `desde` no es una ruta segura del ERP. */
export function rutaDeVuelta(desde: string | null | undefined): string | null {
  if (!desde || desde.length > 500) return null;
  if (!desde.startsWith("/") || desde.startsWith("//")) return null;
  if (/[\\\s\u0000-\u001f\u007f]/.test(desde)) return null;
  try {
    const url = new URL(desde, ORIGEN_DE_PRUEBA);
    if (url.origin !== ORIGEN_DE_PRUEBA) return null;
  } catch {
    return null;
  }
  return desde;
}
