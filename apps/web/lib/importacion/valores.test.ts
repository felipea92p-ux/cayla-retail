import { describe, it, expect } from "vitest";
import { valoresDistintos, cruzarConVocabulario, normalizarTalla, tokenTalla } from "./valores";
import type { FilaEstandar } from "./mapeo";

function fila(color: string, categoria = ""): FilaEstandar {
  return {
    referencia: "x", codigoCliente: "", categoria, talla: "", color,
    costo: 0, precio: 0, marca: "", genero: "", temporada: "", descripcion: "",
    tejido: "", patron: "", filaOrigen: 0,
  };
}

describe("valoresDistintos — resolver el diccionario, no las filas", () => {
  it("agrupa las variantes de escritura del mismo valor", () => {
    // Tres personas capturando en paralelo escriben el mismo color de tres formas.
    // Tratarlas como tres valores distintos triplicaría lo que hay que revisar
    // y propondría crear tres colores donde hay uno.
    const filas = [fila("Azul marino"), fila("AZUL MARINO"), fila("azul  marino"), fila("Rojo")];
    const r = valoresDistintos(filas, "color");
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ texto: "Azul marino", apariciones: 3 });
  });

  it("conserva la grafia MAS frecuente como representante", () => {
    const filas = [...Array(300).fill(fila("Azul marino")), fila("azul marino"), fila("AZUL MARINO")];
    const r = valoresDistintos(filas, "color");
    expect(r[0].texto).toBe("Azul marino");
    expect(r[0].apariciones).toBe(302);
  });

  it("ordena por cuantas prendas lo usan: lo que mas pesa se revisa primero", () => {
    const filas = [fila("Rojo"), ...Array(10).fill(fila("Negro")), ...Array(5).fill(fila("Beige"))];
    const r = valoresDistintos(filas, "color");
    expect(r.map((v) => v.texto)).toEqual(["Negro", "Beige", "Rojo"]);
  });

  it("ignora celdas vacias o solo con espacios", () => {
    const filas = [fila("Negro"), fila(""), fila("   ")];
    expect(valoresDistintos(filas, "color")).toHaveLength(1);
  });

  it("reduce 3000 filas a un punado de valores — la razon de todo esto", () => {
    const colores = ["Negro", "Blanco", "Azul marino", "Rojo", "Beige"];
    const filas = Array.from({ length: 3000 }, (_, i) => fila(colores[i % colores.length]));
    const r = valoresDistintos(filas, "color");
    expect(r).toHaveLength(5);
    expect(r.reduce((s, v) => s + v.apariciones, 0)).toBe(3000);
  });
});

describe("cruzarConVocabulario", () => {
  const vocabulario = [
    { clave: "NEG", nombre: "Negro" },
    { clave: "AZM", nombre: "Azul marino" },
    { clave: "BEI", nombre: "Beige" },
  ];

  it("reconoce lo que ya existe sin importar mayusculas ni acentos", () => {
    const valores = [
      { texto: "AZUL MARINO", apariciones: 10 },
      { texto: "Fucsia neon", apariciones: 3 },
    ];
    const { yaExisten, nuevos } = cruzarConVocabulario(valores, vocabulario);
    expect(yaExisten).toHaveLength(1);
    expect(yaExisten[0].existente).toEqual({ clave: "AZM", nombre: "Azul marino" });
    expect(nuevos.map((n) => n.texto)).toEqual(["Fucsia neon"]);
  });

  it("con un vocabulario vacio (cliente nuevo) todo es nuevo", () => {
    const valores = [{ texto: "Negro", apariciones: 5 }];
    const { yaExisten, nuevos } = cruzarConVocabulario(valores, []);
    expect(yaExisten).toHaveLength(0);
    expect(nuevos).toHaveLength(1);
  });

  it("cruza igual que el indice unico de Postgres, para no chocar al escribir", () => {
    // El índice de `colores` es sobre fn_clave_texto(nombre). Si acá se cruzara
    // de otra forma, el importador creería que es nuevo y la base lo rechazaría.
    const { yaExisten } = cruzarConVocabulario([{ texto: "  negro  ", apariciones: 1 }], vocabulario);
    expect(yaExisten[0]?.existente?.clave).toBe("NEG");
  });
});

describe("normalizarTalla", () => {
  const casos: Array<[string, string]> = [
    ["m", "M"],
    [" M ", "M"],
    ["T-M", "M"],
    ["T.M", "M"],
    ["Talla M", "M"],
    ["TALLA: L", "L"],
    ["XL", "XL"],
    ["38", "38"],
    // Todas las formas de talla única colapsan a una, como fn_token_talla en la base.
    ["Único", "Único"],
    ["U", "Único"],
    ["unica", "Único"],
    ["Talla única", "Único"],
    ["", "Único"],
  ];
  for (const [entrada, esperado] of casos) {
    it(`"${entrada}" → "${esperado}"`, () => {
      expect(normalizarTalla(entrada)).toBe(esperado);
    });
  }
});

describe("tokenTalla replica fn_token_talla (0047)", () => {
  // Los esperados son lo que devuelve la función de Postgres, verificado con
  // `select fn_token_talla(x)` en local. Si esto cambia allá, cambia acá.
  const casos: Array<[string, string]> = [
    ["", "U"],
    ["   ", "U"],
    ["U", "U"],
    ["Único", "U"],
    ["unica", "U"],
    ["Talla única", "U"],
    ["Estándar", "STD"],
    ["M", "M"],
    ["m", "M"],
    ["S/M", "SM"],
    ["SM", "SM"],
    ["38", "38"],
    ["Ñandú 2", "NANDU2"],
  ];
  for (const [entrada, esperado] of casos) {
    it(`"${entrada}" → "${esperado}"`, () => {
      expect(tokenTalla(entrada)).toBe(esperado);
    });
  }
});
