// Abrir un .zip en el navegador, sin librerías: la propuesta del SIRE llega comprimida (un .zip con un solo .txt adentro) y pedirle
// a la persona que la descomprima antes es un paso que se olvida (ADR-0601). Solo lee lo que SUNAT entrega: archivos «stored» o
// «deflate», sin cifrar. La descompresión la hace el propio navegador (`DecompressionStream`), así que no hay código de compresión aquí.

export type ArchivoDelZip = { nombre: string; contenido: Uint8Array };

/** ¿Empieza como un zip? («PK\x03\x04») */
export function esZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

async function inflar(datos: Uint8Array): Promise<Uint8Array> {
  const flujo = new Blob([datos as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

/**
 * Los archivos de un zip, leyendo su índice central (el que dice los tamaños de verdad: la cabecera local puede traerlos en cero).
 * Devuelve `null` si el archivo no es un zip que se pueda leer.
 */
export async function leerZip(bytes: Uint8Array): Promise<ArchivoDelZip[] | null> {
  if (!esZip(bytes)) return null;
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // El fin del índice central está en los últimos 22 bytes (más un comentario opcional de hasta 64 KB).
  let fin = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (vista.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin === -1) return null;
  const cuantos = vista.getUint16(fin + 10, true);
  let p = vista.getUint32(fin + 16, true);
  const nombres = new TextDecoder();
  const archivos: ArchivoDelZip[] = [];
  for (let k = 0; k < cuantos; k++) {
    if (p + 46 > bytes.length || vista.getUint32(p, true) !== 0x02014b50) return null;
    const metodo = vista.getUint16(p + 10, true);
    const comprimido = vista.getUint32(p + 20, true);
    const largoNombre = vista.getUint16(p + 28, true);
    const largoExtra = vista.getUint16(p + 30, true);
    const largoComentario = vista.getUint16(p + 32, true);
    const local = vista.getUint32(p + 42, true);
    const nombre = nombres.decode(bytes.subarray(p + 46, p + 46 + largoNombre));
    p += 46 + largoNombre + largoExtra + largoComentario;
    if (nombre.endsWith("/")) continue;
    if (local + 30 > bytes.length || vista.getUint32(local, true) !== 0x04034b50) return null;
    const inicio = local + 30 + vista.getUint16(local + 26, true) + vista.getUint16(local + 28, true);
    const datos = bytes.subarray(inicio, inicio + comprimido);
    if (metodo === 0) archivos.push({ nombre, contenido: datos });
    else if (metodo === 8) archivos.push({ nombre, contenido: await inflar(datos) });
    else return null;
  }
  return archivos;
}
