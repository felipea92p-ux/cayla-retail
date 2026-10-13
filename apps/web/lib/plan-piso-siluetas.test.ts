import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_COLORES_DEL_ICONO } from "./plan-piso-colores";
import { SILUETA_GENERICA, SILUETAS_PROPIAS, siluetaDe, prendasDelIcono, siluetaDeIcono, siluetaDePrenda, ORDEN_DEL_ICONO, VARIANTES_DE_SILUETA, variantesDeSilueta } from "./plan-piso-siluetas";

describe("la silueta de cada grupo", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261006100000_plan_del_piso_grupos_del_mix.sql", import.meta.url), "utf8").replace(/--[^\n]*/g, "");
  const filas = [...sql.matchAll(/\('([a-z_]+)',\s*'[^']+',\s*'(?:destino|rutina|ocasional|estacional|conveniencia)',\s*(true|false),\s*\d+\)/g)];
  const sembrados = filas.map((m) => m[1]!);

  it("los 8 grupos que siembra la base (leídos del SQL real) tienen cada uno su silueta propia", () => {
    expect(sembrados).toHaveLength(8);
    for (const clave of sembrados) expect(siluetaDe(clave), clave).toBe(clave);
  });

  it("no sobra ninguna silueta propia: todas son de un grupo que la base siembra", () => {
    for (const clave of SILUETAS_PROPIAS) expect(sembrados, clave).toContain(clave);
    expect(new Set(SILUETAS_PROPIAS).size).toBe(SILUETAS_PROPIAS.length);
  });

  it("la base siembra como máximo SEIS grupos en el riel: son los seis colores de `--grupo-N`; con uno más, dos grupos compartirían color (y silueta genérica)", () => {
    const enRiel = filas.filter((m) => m[2] === "true");
    expect(enRiel).toHaveLength(6);
    expect(enRiel.length).toBeLessThanOrEqual(6);
  });

  it("un grupo que entra después (por migración, no hay pantalla para crearlos) usa la silueta genérica y nunca se queda sin dibujo", () => {
    expect(siluetaDe("camisas_de_lino")).toBe(SILUETA_GENERICA);
    expect(siluetaDe("")).toBe(SILUETA_GENERICA);
    expect(SILUETAS_PROPIAS as readonly string[]).not.toContain(SILUETA_GENERICA);
  });
});

describe("un grupo que mezcla prendas dibuja todas las suyas (Felipe, 2026-10-13: «polos, tops y blusas» no es solo polos)", () => {
  const dibujos = readFileSync(new URL("../components/plan-piso/SiluetasDelPlan.tsx", import.meta.url), "utf8");
  const simbolos = [...dibujos.matchAll(/<symbol id="pp-s-([a-z_]+)"/g)].map((m) => m[1]!);

  it("«Polos, tops y blusas» reparte tres siluetas distintas y la primera es la de siempre (la del ícono sin colores)", () => {
    const v = variantesDeSilueta("polos_tops_blusas");
    expect(v).toHaveLength(3);
    expect(new Set(v).size).toBe(3);
    expect(v[0]).toBe(siluetaDe("polos_tops_blusas"));
  });

  it("cada variante tiene su `<symbol>` en el dibujo: una sin dibujo dejaría la percha vacía", () => {
    for (const [grupo, variantes] of Object.entries(VARIANTES_DE_SILUETA)) {
      expect(SILUETAS_PROPIAS as readonly string[], grupo).toContain(grupo);
      for (const id of variantes) expect(simbolos, `${grupo} → ${id}`).toContain(id);
    }
  });

  it("no hay un dibujo huérfano: todo `<symbol>` de prenda es la silueta de un grupo, una variante o la genérica", () => {
    const usados = new Set<string>([...SILUETAS_PROPIAS, SILUETA_GENERICA, ...Object.values(VARIANTES_DE_SILUETA).flat()]);
    for (const id of simbolos) expect(usados.has(id), id).toBe(true);
  });

  it("las perchas de un tramo cuelgan polo, top, blusa, polo, top, blusa… y vuelve a empezar en cada tramo (depende solo del lugar)", () => {
    const ocho = Array.from({ length: 8 }, (_, k) => siluetaDePrenda("polos_tops_blusas", k));
    expect(ocho).toEqual([
      "polos_tops_blusas",
      "polos_tops_blusas_top",
      "polos_tops_blusas_blusa",
      "polos_tops_blusas",
      "polos_tops_blusas_top",
      "polos_tops_blusas_blusa",
      "polos_tops_blusas",
      "polos_tops_blusas_top",
    ]);
    expect(siluetaDePrenda("polos_tops_blusas", 3)).toBe(siluetaDePrenda("polos_tops_blusas", 3));
  });

  it("un lugar que no es un número entero positivo no rompe nada: cae en una silueta del grupo", () => {
    for (const k of [-1, -4, 2.7, Number.NaN, Number.POSITIVE_INFINITY]) expect(variantesDeSilueta("polos_tops_blusas"), String(k)).toContain(siluetaDePrenda("polos_tops_blusas", k));
    expect(siluetaDePrenda("polos_tops_blusas", Number.NaN)).toBe("polos_tops_blusas");
  });

  it("los demás grupos no cambian: una silueta, la suya, en cualquier lugar; y un grupo desconocido (o un nombre del prototipo) usa la genérica", () => {
    for (const clave of SILUETAS_PROPIAS.filter((c) => c !== "polos_tops_blusas")) {
      expect(variantesDeSilueta(clave), clave).toEqual([clave]);
      for (const k of [0, 1, 2, 7]) expect(siluetaDePrenda(clave, k), `${clave} ${k}`).toBe(clave);
    }
    for (const clave of ["camisas_de_lino", "", "constructor", "toString", "__proto__"]) {
      expect(variantesDeSilueta(clave), clave).toEqual([SILUETA_GENERICA]);
      expect(siluetaDePrenda(clave, 1), clave).toBe(SILUETA_GENERICA);
    }
  });

  it("en el ícono el top va al frente, el polo en medio y la blusa atrás: las tres se ven (la más angosta nunca queda tapada en medio)", () => {
    expect([0, 1, 2].map((i) => siluetaDeIcono("polos_tops_blusas", i))).toEqual(["polos_tops_blusas_top", "polos_tops_blusas", "polos_tops_blusas_blusa"]);
    expect(siluetaDeIcono("polos_tops_blusas", 3)).toBe("polos_tops_blusas_top");
  });

  it("el orden del ícono es una permutación de las variantes (no pierde ni repite una prenda) y el de un grupo sin orden propio es el de sus variantes", () => {
    for (const [grupo, orden] of Object.entries(ORDEN_DEL_ICONO)) {
      expect([...orden].sort(), grupo).toEqual(variantesDeSilueta(grupo).map((_, k) => k));
      expect(new Set(variantesDeSilueta(grupo).map((_, i) => siluetaDeIcono(grupo, i))).size, grupo).toBe(variantesDeSilueta(grupo).length);
    }
    for (const clave of ["jeans", "vestidos_conjuntos", "camisas_de_lino", "constructor"]) {
      for (const i of [0, 1, 2, 5, Number.NaN, -1]) expect(siluetaDeIcono(clave, i), `${clave} ${i}`).toBe(variantesDeSilueta(clave)[0]);
    }
  });

  it("el ícono con colores dibuja siempre las tres prendas de «Polos, tops y blusas» (con 1, 2 o 3 colores) y una por color en los demás grupos", () => {
    for (const colores of [1, 2, 3]) expect(prendasDelIcono("polos_tops_blusas", colores), `${colores} colores`).toBe(3);
    for (const clave of SILUETAS_PROPIAS.filter((c) => c !== "polos_tops_blusas")) for (const colores of [1, 2, 3]) expect(prendasDelIcono(clave, colores), `${clave} ${colores}`).toBe(colores);
    expect(prendasDelIcono("camisas_de_lino", 2)).toBe(2);
  });

  it("un número de colores que no es una cuenta no inventa prendas", () => {
    for (const colores of [0, -2, Number.NaN]) {
      expect(prendasDelIcono("jeans", colores), String(colores)).toBe(0);
      expect(prendasDelIcono("polos_tops_blusas", colores), String(colores)).toBe(3);
    }
  });

  it("un grupo no tiene más variantes que prendas caben en su ícono (el ancho del ícono es el de MAX_COLORES_DEL_ICONO prendas: con más se saldría de la ficha)", () => {
    for (const [grupo, variantes] of Object.entries(VARIANTES_DE_SILUETA)) expect(variantes.length, grupo).toBeLessThanOrEqual(MAX_COLORES_DEL_ICONO);
  });
});
