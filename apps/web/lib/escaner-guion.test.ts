import { describe, expect, it } from "vitest";
import { guionDeLaPistola } from "./escaner-guion";
import { filtrarPrendasV2, resolverCodigoV2, type PrendaBuscableV2 } from "./buscar-prenda-v2";
import { coincidenciasPorCodigo } from "./conteo-reglas";
import { tallaPorCodigo } from "./existencias-prendas";

// Tienda TRU, 2026-09-29: la pistola escribió «CMS'0011'ROS'STD» por «CMS-0011-ROS-STD» y Vender dijo «No encontramos».
const LLEGA = "CMS'0011'ROS'STD";
const ES = "CMS-0011-ROS-STD";

const prenda = (p: Partial<PrendaBuscableV2>): PrendaBuscableV2 => ({
  varianteId: "v",
  sku: "SKU",
  referencia: "Camisa Lara",
  talla: "STD",
  color: "Rosado",
  codigosBarras: [],
  ...p,
});

describe("guionDeLaPistola", () => {
  it("cambia el apóstrofo por el guion en todo el código", () => {
    expect(guionDeLaPistola(LLEGA)).toBe(ES);
  });
  it("deja igual lo que ya viene bien: guiones, letras, números", () => {
    expect(guionDeLaPistola(ES)).toBe(ES);
    expect(guionDeLaPistola("7501234567890")).toBe("7501234567890");
    expect(guionDeLaPistola("")).toBe("");
  });
});

describe("Vender y las demás pantallas que resuelven un código (resolverCodigoV2)", () => {
  const catalogo = [prenda({ varianteId: "a", sku: ES }), prenda({ varianteId: "b", sku: "CMS-0011-BEI-STD", codigosBarras: ["7501234567890"] })];
  it("el código con apóstrofos resuelve la misma prenda que el código con guiones", () => {
    expect(resolverCodigoV2(LLEGA, catalogo)?.varianteId).toBe("a");
    expect(resolverCodigoV2(ES, catalogo)?.varianteId).toBe("a");
  });
  it("sin mayúsculas ni espacios alrededor, como siempre", () => {
    expect(resolverCodigoV2(`  ${LLEGA.toLowerCase()} `, catalogo)?.varianteId).toBe("a");
  });
  it("también resuelve por un código de barras guardado con guion", () => {
    const c = [prenda({ varianteId: "z", sku: "X", codigosBarras: ["FAB-77-A"] })];
    expect(resolverCodigoV2("FAB'77'A", c)?.varianteId).toBe("z");
  });
  it("un código que no existe sigue sin resolver (no se inventa una prenda)", () => {
    expect(resolverCodigoV2("CMS'9999'ROS'STD", catalogo)).toBeNull();
  });
  it("la lista que se despliega mientras se escanea también la encuentra", () => {
    expect(filtrarPrendasV2("CMS'0011'ROS", catalogo, 10).map((v) => v.varianteId)).toEqual(["a"]);
  });
  it("un nombre con apóstrofo sigue encontrándose escribiéndolo con apóstrofo", () => {
    const c = [prenda({ varianteId: "n", referencia: "Polo O'Neil" })];
    expect(filtrarPrendasV2("o'neil", c, 10).map((v) => v.varianteId)).toEqual(["n"]);
  });
});

describe("Conteo: la lista bajo la caja de escanear", () => {
  const catalogo = [
    { sku: ES, codigosBarras: [] as string[] },
    { sku: "POL-0004-NEG-M", codigosBarras: ["7501234567890"] },
  ];
  it("encuentra la prenda con el código que escribió la pistola, y no ofrece dar de alta una que ya existe", () => {
    expect(coincidenciasPorCodigo(LLEGA, catalogo)).toEqual([catalogo[0]]);
  });
  it("el pedazo de código a medias también", () => {
    expect(coincidenciasPorCodigo("CMS'0011", catalogo)).toEqual([catalogo[0]]);
  });
});

describe("Existencias: escanear una talla (tallaPorCodigo)", () => {
  const fila = (varianteId: string, sku: string) => ({ varianteId, sku, codigosBarras: [] as string[] });
  const filas = [fila("m", "POL-0004-NEG-M"), fila("l", "POL-0004-NEG-L")];
  it("abre la talla exacta aunque el guion llegue como apóstrofo", () => {
    expect(tallaPorCodigo(filas as never, "POL'0004'NEG'M")?.varianteId).toBe("m");
  });
  it("sigue sin abrir una talla por parecerse", () => {
    expect(tallaPorCodigo(filas as never, "POL'0004'NEG")).toBeNull();
  });
});
