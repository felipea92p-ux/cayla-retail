import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ESCUDOS_DE_TIENDA, escudoDe } from "./escudo-de-tienda";
import { CREDITOS_DE_ESCUDOS } from "./escudos-creditos";

const CARPETA = join(__dirname, "..", "public", "escudos");

describe("el escudo de cada tienda", () => {
  it("cada escudo anotado tiene su archivo en public/escudos y vive en esa carpeta", () => {
    for (const [clave, direccion] of Object.entries(ESCUDOS_DE_TIENDA)) {
      expect(direccion.startsWith("/escudos/"), clave).toBe(true);
      expect(existsSync(join(__dirname, "..", "public", direccion)), `${clave}: falta ${direccion}`).toBe(true);
    }
  });

  it("no sobra ningún archivo: todo lo que hay en la carpeta está anotado (si no, nunca se vería)", () => {
    const archivos = existsSync(CARPETA) ? readdirSync(CARPETA).filter((f) => !f.startsWith(".")) : [];
    const anotados = new Set(Object.values(ESCUDOS_DE_TIENDA).map((d) => d.slice("/escudos/".length)));
    expect(archivos.filter((f) => !anotados.has(f))).toEqual([]);
  });

  it("la clave de cada escudo es la de la dirección (?sede=): minúsculas, sin tildes ni espacios", () => {
    for (const clave of Object.keys(ESCUDOS_DE_TIENDA)) expect(clave).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("una tienda sin escudo (la que un Líder crea sin deploy) no lo inventa: se queda con su nombre", () => {
    expect(escudoDe("Tienda que no existe")).toBeNull();
    expect(escudoDe("")).toBeNull();
  });

  it("encuentra el escudo con cualquier escritura del nombre de la tienda", () => {
    for (const [clave, direccion] of Object.entries(ESCUDOS_DE_TIENDA)) {
      expect(escudoDe(clave)).toBe(direccion);
      expect(escudoDe(clave.toUpperCase())).toBe(direccion);
      expect(escudoDe(`  ${clave}  `)).toBe(direccion);
    }
  });

  it("cada escudo lleva su crédito (autor y licencia): sin él, la licencia Creative Commons no se cumple", () => {
    expect(CREDITOS_DE_ESCUDOS.map((c) => c.clave).sort()).toEqual(Object.keys(ESCUDOS_DE_TIENDA).sort());
    for (const c of CREDITOS_DE_ESCUDOS) {
      expect(c.autor, c.clave).not.toBe("");
      expect(c.licencia, c.clave).toMatch(/^CC BY/);
      expect(c.hrefLicencia, c.clave).toMatch(/^https:\/\/creativecommons\.org\//);
      expect(c.hrefArchivo, c.clave).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    }
  });
});
