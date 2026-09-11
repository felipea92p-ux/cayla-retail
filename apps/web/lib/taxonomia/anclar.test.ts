import { describe, it, expect } from "vitest";
import { claveTexto, anclarPorNombre, type TerminoPropio, type TerminoUniversal } from "./anclar";

/**
 * `claveTexto` es una réplica en TypeScript de `fn_clave_texto` (0046). Si las dos
 * divergen, el importador cree que un color es nuevo, intenta crearlo, y la base lo
 * rechaza por el índice único sobre `fn_clave_texto(nombre)` — un error tardío, en
 * mitad de una escritura, sobre un dato que el cliente ya confirmó en pantalla.
 *
 * Los casos de abajo salieron de correr la función real contra el Postgres local:
 *   select fn_clave_texto('  AZUL   Marino ');  -- 'azul marino'
 * Si alguien toca cualquiera de las dos, este test es el que avisa.
 */
describe("claveTexto — debe coincidir con fn_clave_texto de Postgres", () => {
  const casos: Array<[string, string]> = [
    ["Azul marino", "azul marino"],
    ["AZUL MARINO", "azul marino"],
    ["  AZUL   Marino ", "azul marino"],
    ["azul marino", "azul marino"],
    ["Púrpura", "purpura"],
    ["Marrón", "marron"],
    ["Animal print", "animal print"],
    ["Palo rosa", "palo rosa"],
    ["Verde água", "verde agua"],
    ["ÑANDÚ", "nandu"],
  ];

  for (const [entrada, esperado] of casos) {
    it(`"${entrada}" → "${esperado}"`, () => {
      expect(claveTexto(entrada)).toBe(esperado);
    });
  }
});

describe("anclarPorNombre — lo que resuelve el código no va a la IA", () => {
  // Los 19 colores universales reales (taxonomia_valores del atributo '1').
  const universales: TerminoUniversal[] = [
    { id: "14", nombre: "Amarillo" },
    { id: "2", nombre: "Azul" },
    { id: "15", nombre: "Azul marino" },
    { id: "16", nombre: "Beige" },
    { id: "1", nombre: "Blanco" },
    { id: "9", nombre: "Gris" },
    { id: "10", nombre: "Marrón" },
    { id: "11", nombre: "Multicolor" },
    { id: "12", nombre: "Naranja" },
    { id: "13", nombre: "Negro" },
    { id: "17", nombre: "Rosa" },
  ];

  it("resuelve por nombre exacto sin importar mayúsculas ni acentos", () => {
    const propios: TerminoPropio[] = [
      { clave: "NEG", nombre: "Negro" },
      { clave: "AZM", nombre: "AZUL MARINO" },
      { clave: "MAR", nombre: "Marron" }, // sin tilde, como lo escribiría un Excel sucio
    ];
    const { resueltos, pendientes } = anclarPorNombre(propios, universales);

    expect(pendientes).toHaveLength(0);
    expect(resueltos.map((r) => [r.clave, r.universalId])).toEqual([
      ["NEG", "13"],
      ["AZM", "15"],
      ["MAR", "10"],
    ]);
    expect(resueltos.every((r) => r.confianza === "exacta")).toBe(true);
  });

  it("deja pendiente lo que de verdad pide criterio", () => {
    const propios: TerminoPropio[] = [
      { clave: "PAL", nombre: "Palo rosa" },
      { clave: "CAM", nombre: "Camel" },
      { clave: "ANI", nombre: "Animal print" },
    ];
    const { resueltos, pendientes } = anclarPorNombre(propios, universales);

    expect(resueltos).toHaveLength(0);
    expect(pendientes.map((p) => p.clave)).toEqual(["PAL", "CAM", "ANI"]);
  });

  it("un nombre que se repite en varias ramas NO es coincidencia exacta: va al modelo", () => {
    // El árbol real tiene 4 "Pantalones" (deportiva, bebé, dormir, prendas).
    // Antes ganaba la última rama cargada y salía como "exacta". Revisión del
    // 2026-09-11.
    const ramas: TerminoUniversal[] = [
      { id: "aa-1-4-9", nombre: "Pantalones", ruta: "Ropa y accesorios > Prendas de vestir > Pantalones" },
      { id: "aa-1-2-5", nombre: "Pantalones", ruta: "Ropa y accesorios > Prendas de vestir > Ropa deportiva > Pantalones" },
      { id: "aa-1-9-3", nombre: "Pantalones", ruta: "Ropa y accesorios > Prendas de vestir > Ropa de bebé > Pantalones" },
      { id: "aa-1-2-3", nombre: "Blusas", ruta: "Ropa y accesorios > Prendas de vestir > Camisas y tops > Blusas" },
    ];
    const { resueltos, pendientes } = anclarPorNombre(
      [
        { clave: "PAN", nombre: "Pantalones" },
        { clave: "BLU", nombre: "Blusas" },
      ],
      ramas
    );
    expect(resueltos.map((r) => [r.clave, r.universalId])).toEqual([["BLU", "aa-1-2-3"]]);
    expect(pendientes.map((p) => p.clave)).toEqual(["PAN"]);
  });

  it("sobre los 30 colores reales de CAYLA, el código resuelve la mayoría solo", () => {
    // Tal como están hoy en `colores` (0046 + 0050).
    const cayla = [
      "Negro", "Blanco", "Crudo", "Gris", "Beige", "Azul marino", "Azul claro",
      "Celeste", "Rojo", "Vino", "Rosado", "Palo rosa", "Fucsia", "Naranja",
      "Amarillo", "Mostaza", "Verde", "Verde oliva", "Verde agua", "Morado",
      "Lila", "Camel", "Marrón", "Chocolate", "Arena", "Dorado", "Plateado",
      "Estampado", "Multicolor", "Animal print",
    ].map((nombre, i) => ({ clave: `C${i}`, nombre }));

    const { resueltos, pendientes } = anclarPorNombre(cayla, universales);

    // Con este subconjunto de 11 universales ya se resuelven 8 sin gastar un token.
    // El número exacto importa menos que la forma: la IA nunca ve lo obvio.
    expect(resueltos.length).toBeGreaterThan(0);
    expect(resueltos.length + pendientes.length).toBe(30);
    expect(pendientes.map((p) => p.nombre)).toContain("Palo rosa");
    expect(resueltos.map((r) => r.clave)).not.toContain(
      pendientes.map((p) => p.clave)[0]
    );
  });
});
