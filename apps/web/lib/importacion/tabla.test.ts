import { describe, it, expect } from "vitest";
import { parsearCSV, detectarSeparador, detectarCabecera } from "./tabla";

/**
 * Los casos de acá no son inventados: son las formas en que un CSV de una tienda
 * real rompe un parser hecho con `split`. Cada uno falla en silencio —no lanza
 * nada, devuelve datos mal— y por eso vale la pena fijarlos.
 */

describe("detectarSeparador", () => {
  it("elige el punto y coma, que es lo que escribe Excel en español", () => {
    expect(detectarSeparador("SKU;Nombre;Precio\nA1;Blusa;89.90")).toBe(";");
  });

  it("elige la coma cuando es la que separa de verdad", () => {
    expect(detectarSeparador("SKU,Nombre,Precio\nA1,Blusa,89.90")).toBe(",");
  });

  it("no se deja engañar por comas DENTRO de un campo entrecomillado", () => {
    // Con `;` hay 3 columnas consistentes; contar comas a secas elegiría `,`
    // y partiría "Blusa, manga larga" en dos.
    const csv = 'SKU;Nombre;Precio\nA1;"Blusa, manga larga, escote V";89.90\nA2;"Falda, corta";59.00';
    expect(detectarSeparador(csv)).toBe(";");
  });

  it("reconoce el tabulador de un pegado desde Excel", () => {
    expect(detectarSeparador("SKU\tNombre\tPrecio\nA1\tBlusa\t89.90")).toBe("\t");
  });
});

describe("parsearCSV", () => {
  it("quita el BOM que Excel escribe al guardar como CSV UTF-8", () => {
    // Sin quitarlo la primera cabecera se llama "﻿SKU" y no coincide con nada.
    const filas = parsearCSV("﻿SKU;Nombre\nA1;Blusa");
    expect(filas[0][0]).toBe("SKU");
  });

  it("respeta las comas dentro de comillas", () => {
    const filas = parsearCSV('SKU;Nombre;Precio\nA1;"Blusa, manga larga";89.90');
    expect(filas[1]).toEqual(["A1", "Blusa, manga larga", "89.90"]);
  });

  it("entiende las comillas escapadas como doble comilla", () => {
    const filas = parsearCSV('SKU;Nombre\nA1;"Blusa ""Premium"" edicion"');
    expect(filas[1][1]).toBe('Blusa "Premium" edicion');
  });

  it("aguanta un salto de linea DENTRO de una celda", () => {
    // Una descripción con salto adentro es lo más normal del mundo, y es lo que
    // parte por la mitad cualquier parser hecho con split("\n").
    const filas = parsearCSV('SKU;Descripcion\nA1;"Blusa azul\nmanga larga";');
    expect(filas).toHaveLength(2);
    expect(filas[1][1]).toBe("Blusa azul\nmanga larga");
  });

  it("trata CRLF como un solo fin de linea", () => {
    const filas = parsearCSV("SKU;Nombre\r\nA1;Blusa\r\nA2;Falda");
    expect(filas).toHaveLength(3);
    expect(filas[2]).toEqual(["A2", "Falda"]);
  });

  it("lee la ultima fila aunque el archivo no termine en salto de linea", () => {
    const filas = parsearCSV("SKU;Nombre\nA1;Blusa");
    expect(filas).toHaveLength(2);
  });

  it("descarta filas totalmente vacias pero conserva celdas vacias", () => {
    const filas = parsearCSV("SKU;Nombre;Color\nA1;Blusa;\n;;\nA2;Falda;Azul");
    expect(filas).toHaveLength(3);
    expect(filas[1]).toEqual(["A1", "Blusa", ""]);
  });

  it("rellena las filas cortas en vez de truncar las largas", () => {
    // Una fila más ancha que la cabecera casi siempre es una columna sin título.
    // Truncar perdería el precio en silencio.
    const filas = parsearCSV("SKU;Nombre\nA1;Blusa;89.90");
    expect(filas[0]).toEqual(["SKU", "Nombre", ""]);
    expect(filas[1]).toEqual(["A1", "Blusa", "89.90"]);
  });

  it("NO convierte nada: los ceros a la izquierda y la moneda se conservan", () => {
    // "0012" convertido a número es un código de barras destruido.
    const filas = parsearCSV("Codigo;Precio\n0012;S/ 89,90");
    expect(filas[1]).toEqual(["0012", "S/ 89,90"]);
  });
});

describe("detectarCabecera", () => {
  it("salta el titulo y las filas en blanco de arriba", () => {
    const filas = parsearCSV(
      "INVENTARIO 2026;;;\n;;;\nSKU;Referencia;Talla;Precio\nA1;Blusa;M;89.90\nA2;Falda;S;59.00"
    );
    expect(detectarCabecera(filas)).toBe(1);
    expect(filas[1]).toEqual(["SKU", "Referencia", "Talla", "Precio"]);
  });

  it("devuelve 0 cuando la cabecera ya esta en la primera fila", () => {
    const filas = parsearCSV("SKU;Referencia;Talla;Precio\nA1;Blusa;M;89.90\nA2;Falda;S;59.00");
    expect(detectarCabecera(filas)).toBe(0);
  });

  it("ignora una fila de titulos repetidos", () => {
    // "Total;Total" delata títulos combinados, no la cabecera real.
    const filas = parsearCSV("Total;Total;Total;Total\nSKU;Referencia;Talla;Precio\nA1;Blusa;M;89.90");
    expect(detectarCabecera(filas)).toBe(1);
  });

  it("prefiere no adivinar antes que saltarse datos reales", () => {
    // Sin una frontera texto/número clara, devuelve 0 y lo corrige la persona.
    const filas = parsearCSV("A1;B1;C1\nA2;B2;C2");
    expect(detectarCabecera(filas)).toBe(0);
  });

  // --- revisión adversarial del 2026-09-11 ---

  it("encuentra la cabecera de un catálogo que no trae ningún número", () => {
    // Nombres, tallas y colores; el precio va aparte. Ninguna fila tiene MENOS
    // números que la siguiente (todas tienen 0), y antes eso caía a la fila 0.
    const filas = parsearCSV(
      "LISTA DE PRENDAS;;\n;;\nReferencia;Talla;Color\nBlusa V;M;Azul marino\nFalda A;S;Negro"
    );
    expect(detectarCabecera(filas)).toBe(1);
    expect(filas[1]).toEqual(["Referencia", "Talla", "Color"]);
  });

  it("no confunde una fila de metadatos con la cabecera", () => {
    // "Tienda: Trujillo | Fecha: enero" está llena, sin repetidos y sin
    // números — cumplía todo lo que se le pedía a una cabecera.
    const filas = parsearCSV(
      "Tienda: Trujillo;Fecha: enero;;\nSKU;Referencia;Talla;Precio\nA1;Blusa;M;89.90\nA2;Falda;S;59.00\nA3;Jean;30;120"
    );
    expect(detectarCabecera(filas)).toBe(1);
  });
});

describe("revisión adversarial del 2026-09-11 · CSV", () => {
  it("detecta el separador aunque la primera línea sea un título sin separadores", () => {
    // La primera línea daba 1 columna con los cuatro separadores, se
    // descartaban todos y se caía a `;` — en un archivo de comas, una sola
    // columna gigante.
    const csv = "INVENTARIO 2026\nSKU,Referencia,Talla,Precio\nA1,Blusa,M,89.90\nA2,Falda,S,59.00";
    expect(detectarSeparador(csv)).toBe(",");
    expect(parsearCSV(csv)[1]).toEqual(["SKU", "Referencia", "Talla", "Precio"]);
  });

  it("una comilla en mitad de una celda es texto, no el inicio de una cita", () => {
    // 32" de una medida. Antes abría el modo entrecomillado y, sin cierre, se
    // tragaba el resto del archivo en una sola celda.
    const filas = parsearCSV('SKU;Referencia;Precio\nA1;Pantalon 32" cintura;120\nA2;Falda;59');
    expect(filas).toHaveLength(3);
    expect(filas[1]).toEqual(["A1", 'Pantalon 32" cintura', "120"]);
    expect(filas[2]).toEqual(["A2", "Falda", "59"]);
  });

  it("una celda entrecomillada al inicio sigue funcionando igual", () => {
    const filas = parsearCSV('SKU;Referencia\nA1;"Blusa; manga larga"');
    expect(filas[1]).toEqual(["A1", "Blusa; manga larga"]);
  });
});
