import { describe, expect, it } from "vitest";
import { categoriasApagadas, categoriasFueraDeMotores, sinCategoriasApagadas } from "./familias-motores";

describe("categoriasApagadas", () => {
  it("toma solo las categorías cuya familia tiene la marca apagada, venga como objeto o como lista de uno", () => {
    const fuera = categoriasApagadas([
      { id: "bolsas", familias: { entra_a_motores: false } },
      { id: "cajas", familias: [{ entra_a_motores: false }] },
      { id: "polos", familias: { entra_a_motores: true } },
      { id: "blusas", familias: [{ entra_a_motores: true }] },
    ]);
    expect([...fuera].sort()).toEqual(["bolsas", "cajas"]);
  });

  it("lo que no se sabe sigue contando: sin familia, lista vacía o marca ausente no sacan nada", () => {
    expect(categoriasApagadas([{ id: "sueltas", familias: null }, { id: "vacia", familias: [] }]).size).toBe(0);
    expect(categoriasApagadas([{ id: "raro", familias: {} as { entra_a_motores: boolean } }]).size).toBe(0);
    expect(categoriasApagadas([]).size).toBe(0);
  });
});

describe("sinCategoriasApagadas", () => {
  const filas = [
    { cat: "bolsas", n: 1 },
    { cat: "polos", n: 2 },
    { cat: null, n: 3 },
    { cat: "bolsas", n: 4 },
  ];

  it("quita las filas de una categoría apagada y respeta el orden de las demás", () => {
    expect(sinCategoriasApagadas(filas, new Set(["bolsas"]), (f) => f.cat).map((f) => f.n)).toEqual([2, 3]);
  });

  it("una fila sin categoría se queda (no se sabe: sigue contando)", () => {
    expect(sinCategoriasApagadas(filas, new Set(["polos"]), (f) => f.cat).map((f) => f.n)).toEqual([1, 3, 4]);
  });

  it("con nada apagado devuelve todo (una copia, no la misma lista)", () => {
    const todo = sinCategoriasApagadas(filas, new Set(), (f) => f.cat);
    expect(todo).toEqual(filas);
    expect(todo).not.toBe(filas);
  });
});

/** Un cliente de mentira con la cadena `from → select → eq` que usa la lectura. */
function clienteQue(respuesta: { data: unknown; error: unknown } | "lanza") {
  const eq = async () => {
    if (respuesta === "lanza") throw new Error("sin red");
    return respuesta;
  };
  return { from: () => ({ select: () => ({ eq }) }) } as unknown as Parameters<typeof categoriasFueraDeMotores>[0];
}

describe("categoriasFueraDeMotores", () => {
  it("devuelve las categorías de las familias apagadas", async () => {
    const fuera = await categoriasFueraDeMotores(clienteQue({ data: [{ id: "bolsas", familias: { entra_a_motores: false } }], error: null }));
    expect([...fuera]).toEqual(["bolsas"]);
  });

  it("nunca lanza: si la lectura falla o no responde, devuelve vacío y la pantalla cuenta como antes", async () => {
    expect((await categoriasFueraDeMotores(clienteQue({ data: null, error: { message: "boom" } }))).size).toBe(0);
    expect((await categoriasFueraDeMotores(clienteQue({ data: null, error: null }))).size).toBe(0);
    expect((await categoriasFueraDeMotores(clienteQue("lanza"))).size).toBe(0);
  });
});
