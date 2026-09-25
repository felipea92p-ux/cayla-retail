// Un .zip sin comprimir (método «stored»), para juntar varios CSV en una sola descarga: el «Paquete para el contador» de
// Impuestos (ADR-0195 F8) lleva el registro de ventas, el de compras y el resumen del mes. Sin dependencias: el formato
// «stored» es cabecera + datos tal cual + un índice al final, y se abre con cualquier descompresor (Windows, macOS, Excel
// no). Unos cuantos KB de CSV no justifican una librería de compresión (principio 3).

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (el de zip y png). */
export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Fecha y hora en el formato de MS-DOS que usa zip (resolución de 2 segundos). */
function fechaDos(d: Date): { hora: number; fecha: number } {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    fecha: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export type ArchivoZip = { nombre: string; contenido: string | Uint8Array };

export function crearZip(archivos: readonly ArchivoZip[], fecha = new Date()): Uint8Array {
  const utf8 = new TextEncoder();
  const { hora, fecha: dia } = fechaDos(fecha);
  const partes: Uint8Array[] = [];
  const indice: Uint8Array[] = [];
  let desplazamiento = 0;

  for (const a of archivos) {
    const nombre = utf8.encode(a.nombre);
    const datos = typeof a.contenido === "string" ? utf8.encode(a.contenido) : a.contenido;
    const crc = crc32(datos);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // firma de cabecera local
    local.setUint16(4, 20, true); // versión necesaria
    local.setUint16(6, 0x0800, true); // nombre en UTF-8
    local.setUint16(8, 0, true); // sin comprimir
    local.setUint16(10, hora, true);
    local.setUint16(12, dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, datos.length, true);
    local.setUint16(26, nombre.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nombre, datos);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true); // firma del índice
    central.setUint16(4, 20, true); // hecho con
    central.setUint16(6, 20, true); // versión necesaria
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, hora, true);
    central.setUint16(14, dia, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, datos.length, true);
    central.setUint32(24, datos.length, true);
    central.setUint16(28, nombre.length, true);
    central.setUint32(42, desplazamiento, true); // dónde empieza su cabecera local
    indice.push(new Uint8Array(central.buffer), nombre);

    desplazamiento += 30 + nombre.length + datos.length;
  }

  const largoIndice = indice.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); // fin del índice
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, largoIndice, true);
  fin.setUint32(16, desplazamiento, true);

  const todo = [...partes, ...indice, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of todo) {
    salida.set(p, i);
    i += p.length;
  }
  return salida;
}
