import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  argumentosDeFoto,
  BUCKET_FOTOS_DANADAS,
  leerRutasDeFotos,
  MAX_BYTES_FOTO_DANADA,
  MAX_FOTOS_POR_DANADA,
  objecionDeFoto,
  PARAMETROS_RPC_FOTO,
  RPC_REGISTRAR_FOTO_DANADA,
  rutaDeFotoDanada,
  textoFotoNoSubio,
  textoVerFotos,
  tipoDeFotoDanada,
  TIPOS_FOTO_DANADA,
} from "./danadas-foto";

const leer = (a: string) => readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", a), "utf8").replace(/--[^\n]*/g, "");
const TABLA = leer("20261029034000_danadas_foto_del_dano.sql");
const BUCKET = leer("20261029045000_danadas_foto_bucket.sql");

describe("el contrato con la base", () => {
  it("la RPC y sus parámetros son los de la migración, y los hints que la pantalla lee existen", () => {
    const m = new RegExp(`create or replace function retail\\.${RPC_REGISTRAR_FOTO_DANADA}\\(([^)]*)\\)`).exec(TABLA);
    expect(m).not.toBeNull();
    expect(m![1].split(",").map((p) => p.trim().split(/\s+/)[0])).toEqual([...PARAMETROS_RPC_FOTO]);
    for (const h of ["foto_sin_modulo", "foto_sin_tienda", "foto_ruta_invalida", "foto_demasiadas", "responsable_requerido"]) expect(TABLA, h).toContain(`'${h}'`);
  });

  it("el bucket, los tipos, el tope de peso y el de fotos por dañada son los mismos en la base y en la pantalla", () => {
    expect(BUCKET).toContain(`'${BUCKET_FOTOS_DANADAS}'`);
    for (const tipo of TIPOS_FOTO_DANADA) {
      expect(BUCKET, tipo).toContain(`'${tipo}'`);
      expect(TABLA, tipo).toContain(`'${tipo}'`);
    }
    expect(BUCKET).toContain("10 * 1024 * 1024");
    expect(TABLA).toContain("10 * 1024 * 1024");
    expect(MAX_BYTES_FOTO_DANADA).toBe(10 * 1024 * 1024);
    expect(TABLA).toContain(`>= ${MAX_FOTOS_POR_DANADA}`);
  });

  it("la lectura de la foto pasa por la misma regla que la lista de dañadas, y la tabla no crea políticas", () => {
    expect(BUCKET).toContain("retail.fn_puede_ver_foto_danada(name)");
    expect(TABLA).not.toMatch(/\b(create|drop)\s+policy\b/i);
    expect(TABLA).toMatch(/enable row level security/i);
  });
});

describe("qué foto se acepta", () => {
  const foto = (name: string, type: string, size = 1000) => ({ name, type, size });

  it("una imagen de hasta 10 MB; el HEIC sin tipo se reconoce por su extensión; el PDF no es una foto", () => {
    expect(objecionDeFoto(foto("a.jpg", "image/jpeg"))).toBeNull();
    expect(objecionDeFoto(foto("IMG_1.HEIC", ""))).toBeNull();
    expect(tipoDeFotoDanada(foto("IMG_1.HEIC", ""))).toBe("image/heic");
    expect(objecionDeFoto(foto("a.pdf", "application/pdf"))).not.toBeNull();
    expect(objecionDeFoto(foto("a.gif", "image/gif"))).not.toBeNull();
    expect(objecionDeFoto(foto("a.jpg", "image/jpeg", 0))).not.toBeNull();
    expect(objecionDeFoto(foto("a.jpg", "image/jpeg", MAX_BYTES_FOTO_DANADA))).toBeNull();
    expect(objecionDeFoto(foto("a.jpg", "image/jpeg", MAX_BYTES_FOTO_DANADA + 1))).toContain("máximo es 10 MB");
  });

  it("la ruta lleva el id de la dañada como carpeta (lo que la base exige) y un nombre en ASCII simple", () => {
    const ruta = rutaDeFotoDanada("d1", "Botón rotó ñandú.JPG", "u1");
    expect(ruta.startsWith("d1/u1-")).toBe(true);
    expect(ruta).toMatch(/^d1\/u1-[A-Za-z0-9._-]+$/);
    expect(rutaDeFotoDanada("d1", "   ", "u1")).toBe("d1/u1-_");
    expect(TABLA).toContain("ruta like danada_id::text || '/%'");
  });

  it("los argumentos llevan los nombres del contrato", () => {
    const a = argumentosDeFoto("d1", "d1/u1-a.jpg", { name: " a.jpg ", type: "image/jpeg", size: 123 });
    expect(a).toEqual({ p_danada_id: "d1", p_ruta: "d1/u1-a.jpg", p_nombre: "a.jpg", p_tipo: "image/jpeg", p_bytes: 123 });
    expect(Object.keys(a).sort()).toEqual([...PARAMETROS_RPC_FOTO].sort());
  });
});

describe("lo que se lee y lo que se dice", () => {
  it("agrupa las rutas por dañada y no se cae con datos raros", () => {
    const m = leerRutasDeFotos([{ danada_id: "d1", ruta: "d1/a" }, { danada_id: "d1", ruta: "d1/b" }, { danada_id: "d2", ruta: "d2/a" }, null, { danada_id: 3, ruta: "x" }, { danada_id: "d4", ruta: "" }]);
    expect([...m.entries()]).toEqual([["d1", ["d1/a", "d1/b"]], ["d2", ["d2/a"]]]);
    expect(leerRutasDeFotos(null).size).toBe(0);
    expect(leerRutasDeFotos("x").size).toBe(0);
  });

  it("si la foto no sube, la prenda sigue reportada y se dice", () => {
    expect(textoFotoNoSubio(null)).toBe("La prenda quedó reportada, pero la foto no se pudo subir. Puedes seguir sin ella.");
    expect(textoFotoNoSubio("Pesa mucho")).toContain("Pesa mucho");
    expect(textoVerFotos(1)).toBe("Ver la foto del daño");
    expect(textoVerFotos(3)).toBe("Ver las 3 fotos del daño");
  });
});
