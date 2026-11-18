import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { crearZip, crc32 } from "./zip-simple";
import { esZip, leerZip } from "./zip-leer";

/** Un zip de un solo archivo comprimido con «deflate», como el que entrega SUNAT. */
function zipDeflate(nombre: string, texto: string): Uint8Array {
  const datos = new TextEncoder().encode(texto);
  const comp = new Uint8Array(deflateRawSync(datos));
  const n = new TextEncoder().encode(nombre);
  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true);
  local.setUint16(4, 20, true);
  local.setUint16(8, 8, true);
  local.setUint32(14, crc32(datos), true);
  local.setUint32(18, comp.length, true);
  local.setUint32(22, datos.length, true);
  local.setUint16(26, n.length, true);
  const central = new DataView(new ArrayBuffer(46));
  central.setUint32(0, 0x02014b50, true);
  central.setUint16(10, 8, true);
  central.setUint32(16, crc32(datos), true);
  central.setUint32(20, comp.length, true);
  central.setUint32(24, datos.length, true);
  central.setUint16(28, n.length, true);
  central.setUint32(42, 0, true);
  const inicioCentral = 30 + n.length + comp.length;
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, 1, true);
  fin.setUint16(10, 1, true);
  fin.setUint32(12, 46 + n.length, true);
  fin.setUint32(16, inicioCentral, true);
  const partes = [new Uint8Array(local.buffer), n, comp, new Uint8Array(central.buffer), n, new Uint8Array(fin.buffer)];
  const total = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) {
    total.set(p, o);
    o += p.length;
  }
  return total;
}

describe("leerZip", () => {
  it("abre un zip comprimido con deflate", async () => {
    const r = await leerZip(zipDeflate("propuesta.txt", "RUC|Periodo\n20605964550|202610"));
    expect(r?.map((a) => [a.nombre, new TextDecoder().decode(a.contenido)])).toEqual([["propuesta.txt", "RUC|Periodo\n20605964550|202610"]]);
  });

  it("abre un zip sin comprimir (el que arma el propio ERP)", async () => {
    const r = await leerZip(crearZip([{ nombre: "a.txt", contenido: "hola" }, { nombre: "b.txt", contenido: "chau" }]));
    expect(r?.map((a) => new TextDecoder().decode(a.contenido))).toEqual(["hola", "chau"]);
  });

  it("lo que no es zip devuelve null", async () => {
    const txt = new TextEncoder().encode("RUC|Periodo");
    expect(esZip(txt)).toBe(false);
    expect(await leerZip(txt)).toBeNull();
  });
});
