import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { armarScript, comparar, HOLGURA_MINIMA, leerSalida, MEDIDAS, TOLERANCIA } from "../../../scripts/rendimiento/presupuesto.mjs";

// El presupuesto de rendimiento (ADR-0656, `scripts/rendimiento/presupuesto.mjs`): la parte que no necesita la base. La medida de
// verdad corre en una tanda del CI (`pnpm pruebas:presupuesto-rendimiento`); aquí se prueba qué frena y qué no, para que un cambio
// en la regla no deje pasar una función que se volvió cara (o no frene por ruido).

type Fila = { clave: string; veredicto: string };
const veredicto = (filas: Fila[], clave: string) => filas.find((f) => f.clave === clave)?.veredicto;

describe("comparar", () => {
  const claves = ["a", "b", "c", "d", "e"];
  const presupuesto = { a: 1000, b: 1000, c: 10, d: 1000, e: 1000 };

  it("frena lo que lee más del 25 % sobre su presupuesto, y deja pasar lo que está dentro", () => {
    const filas = comparar(
      { a: { bloques: 1250, ms: 1 }, b: { bloques: 1251, ms: 1 }, c: { bloques: 10, ms: 0 }, d: { bloques: 900, ms: 1 }, e: { bloques: 1000, ms: 1 } },
      presupuesto,
      claves,
    );
    expect(veredicto(filas, "a")).toBe("ok");
    expect(veredicto(filas, "b")).toBe("excede");
    expect(veredicto(filas, "d")).toBe("ok");
    expect(TOLERANCIA).toBe(0.25);
  });

  it("una función chica no frena por unos pocos bloques (ruido), pero sí si se dispara", () => {
    const filas = comparar({ c: { bloques: 10 + HOLGURA_MINIMA, ms: 0 } }, { c: 10 }, ["c"]);
    expect(veredicto(filas, "c")).toBe("ok");
    expect(veredicto(comparar({ c: { bloques: 11 + HOLGURA_MINIMA, ms: 0 } }, { c: 10 }, ["c"]), "c")).toBe("excede");
  });

  it("leer mucho menos no frena: avisa para aceptar el número nuevo", () => {
    expect(veredicto(comparar({ a: { bloques: 500, ms: 1 } }, { a: 1000 }, ["a"]), "a")).toBe("bajo");
    expect(veredicto(comparar({ c: { bloques: 2, ms: 0 } }, { c: 10 }, ["c"]), "c")).toBe("ok");
  });

  it("una función que falla, una sin presupuesto, una que no se midió y un presupuesto que sobra, frenan", () => {
    const filas = comparar({ a: { error: "function retail.fn_x() does not exist" }, b: { bloques: 5, ms: 0 } }, { a: 1, z: 3 }, ["a", "b", "c"]);
    expect(filas.map((f: Fila) => `${f.clave}:${f.veredicto}`)).toEqual(["a:error", "b:sin-presupuesto", "c:error", "z:sobra"]);
  });
});

describe("leerSalida", () => {
  it("lee la línea de la base, las medidas y los errores (con «|» dentro del mensaje)", () => {
    const salida = "base|12\nfn_a@lider|340|5\nfn_b@lider|error|syntax error at or near \"|\"\n\notra cosa\n";
    expect(leerSalida(salida)).toEqual({
      productos: 12,
      medidas: { "fn_a@lider": { bloques: 340, ms: 5 }, "fn_b@lider": { error: 'syntax error at or near "|"' } },
    });
  });
});

describe("lo que se mide", () => {
  it("las seis funciones del marco que llama persona-actual.ts, como líder y como colaboradora, y una vez cada módulo", () => {
    const fuente = readFileSync(new URL("./persona-actual.ts", import.meta.url), "utf8");
    const delMarco = [...fuente.matchAll(/^\s+supabase\.rpc\("(fn_[a-z_]+)"\)/gm)].map((m) => m[1]);
    const claves: string[] = MEDIDAS.map((m: { clave: string }) => m.clave);
    for (const fn of delMarco) {
      expect(claves, fn).toContain(`${fn}@lider`);
      expect(claves, fn).toContain(`${fn}@colaboradora`);
    }
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("cada medida corre en la misma transacción que el volumen, que siempre se deshace", () => {
    const script = armarScript("-- volumen");
    expect(script.startsWith("begin;")).toBe(true);
    expect(script.trimEnd().endsWith("rollback;")).toBe(true);
    expect(script).not.toMatch(/\bcommit\b/i);
    expect(script.match(/\|' \|\| pg_temp\.bloques\(/g)?.length).toBe(MEDIDAS.length);
  });

  it("presupuesto.json tiene un número por cada medida, y nada más", () => {
    const json = JSON.parse(readFileSync(new URL("../../../scripts/rendimiento/presupuesto.json", import.meta.url), "utf8"));
    expect(Object.keys(json.bloques).sort()).toEqual(MEDIDAS.map((m: { clave: string }) => m.clave).sort());
    for (const n of Object.values(json.bloques)) expect(Number.isInteger(n) && (n as number) >= 0).toBe(true);
  });
});
