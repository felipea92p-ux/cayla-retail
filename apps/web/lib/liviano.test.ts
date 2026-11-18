import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { leerEquipo, type NavegadorLike } from "./clase-de-equipo";
import {
  ATRIBUTO_LIVIANO,
  CLAVE_LIVIANO,
  equipoEsLento,
  livianoEsAutomatico,
  resolverLiviano,
  SCRIPT_LIVIANO_ANTES_DE_PINTAR,
} from "./liviano-reglas";

// ADR-0674 · El modo liviano del teléfono de gama baja.

const NADA = { ram: null, nucleos: null, red: null, ahorroDeDatos: false, tactil: false } as const;
const TELEFONO = { ...NADA, nucleos: 8, tactil: true } as const;

describe("equipoEsLento: cuándo se enciende solo", () => {
  it("2 GB o menos, en cualquier equipo: sí", () => {
    for (const ram of [0.25, 0.5, 1, 2]) {
      expect(equipoEsLento({ ...NADA, ram, nucleos: 8 })).toBe(true);
      expect(equipoEsLento({ ...TELEFONO, ram })).toBe(true);
    }
  });

  it("el teléfono barato de 2026 (3–4 GB, 8 núcleos, táctil): sí", () => {
    expect(equipoEsLento({ ...TELEFONO, ram: 4 })).toBe(true);
  });

  it("un teléfono de 6 u 8 GB: no", () => {
    expect(equipoEsLento({ ...TELEFONO, ram: 8 })).toBe(false);
  });

  it("un computador de 4 GB o de 4 núcleos (sin pantalla táctil): no; el Mac mini, tampoco", () => {
    expect(equipoEsLento({ ...NADA, ram: 4, nucleos: 4 })).toBe(false);
    expect(equipoEsLento({ ...NADA, ram: 16, nucleos: 4 })).toBe(false);
    expect(equipoEsLento({ ...NADA, ram: 8, nucleos: 8 })).toBe(false);
  });

  it("el iPhone y el iPad (Safari no dice la memoria y dice 2 núcleos a propósito): no", () => {
    expect(equipoEsLento({ ...NADA, nucleos: 2, tactil: true })).toBe(false);
  });

  it("ahorro de datos encendido: sí, en cualquier equipo", () => {
    expect(equipoEsLento({ ...NADA, ahorroDeDatos: true })).toBe(true);
    expect(equipoEsLento({ ram: 8, nucleos: 16, red: "4g", ahorroDeDatos: true, tactil: false })).toBe(true);
  });

  it("una red lenta sola no lo enciende (la red cambia; el equipo, no)", () => {
    expect(equipoEsLento({ ...NADA, ram: 8, nucleos: 8, red: "2g" })).toBe(false);
  });
});

describe("resolverLiviano: el botón manda sobre el equipo", () => {
  it("sin nada guardado, decide el equipo", () => {
    expect(resolverLiviano(null, { ...NADA, ram: 2 })).toBe("si");
    expect(resolverLiviano(null, { ...NADA, ram: 8, nucleos: 8 })).toBe("no");
    expect(resolverLiviano(null, { ...TELEFONO, ram: 4 })).toBe("si");
  });

  it("lo que eligió la persona gana, para los dos lados", () => {
    expect(resolverLiviano("no", { ...NADA, ram: 1 })).toBe("no");
    expect(resolverLiviano("si", { ...NADA, ram: 8, nucleos: 8 })).toBe("si");
  });

  it("lo guardado corrupto no cuenta", () => {
    for (const malo of ["sí", "true", 1, "", undefined]) expect(resolverLiviano(malo, { ...NADA, ram: 2 })).toBe("si");
  });
});

describe("livianoEsAutomatico: el tercer estado de «Apariencia»", () => {
  it("sin nada guardado lo decide el equipo; lo corrupto tampoco cuenta como elección", () => {
    for (const nada of [null, undefined, "", "sí", "auto", 1]) expect(livianoEsAutomatico(nada)).toBe(true);
  });

  it("lo que eligió la persona, para los dos lados, ya no es automático", () => {
    expect(livianoEsAutomatico("si")).toBe(false);
    expect(livianoEsAutomatico("no")).toBe(false);
  });

  it("«Volver a automático» borra lo guardado: entonces manda el equipo, igual que en el script del <head>", () => {
    const lento = { ...TELEFONO, ram: 4 };
    expect(resolverLiviano("no", lento)).toBe("no");
    expect(resolverLiviano(null, lento)).toBe("si");
    expect(correrScript(null, { deviceMemory: 4, hardwareConcurrency: 8 }, true)).toBe("si");
  });
});

function correrScript(guardado: string | null | "lanza", nav: NavegadorLike | undefined, tactil: boolean | "lanza" = false) {
  const atributos = new Map<string, string>();
  const documento = { documentElement: { setAttribute: (k: string, v: string) => atributos.set(k, v) } };
  const almacen = {
    getItem: (k: string) => {
      if (guardado === "lanza") throw new Error("bloqueado");
      return k === CLAVE_LIVIANO ? guardado : null;
    },
  };
  const matchMedia = (consulta: string) => {
    if (tactil === "lanza") throw new Error("sin matchMedia");
    return { matches: consulta === "(pointer: coarse)" && tactil };
  };
  new Function("document", "localStorage", "navigator", "matchMedia", SCRIPT_LIVIANO_ANTES_DE_PINTAR)(documento, almacen, nav, matchMedia);
  return atributos.get(ATRIBUTO_LIVIANO);
}

describe("script antes de pintar: da lo mismo que las reglas, en todo equipo", () => {
  const equipos: (NavegadorLike | undefined)[] = [
    undefined,
    {},
    { deviceMemory: 2, hardwareConcurrency: 8, connection: { effectiveType: "4g", saveData: false } },
    { deviceMemory: 4, hardwareConcurrency: 4 },
    { deviceMemory: 16, hardwareConcurrency: 4 },
    { deviceMemory: 32, hardwareConcurrency: 16 },
    { deviceMemory: 4, hardwareConcurrency: 8 },
    { deviceMemory: 8, hardwareConcurrency: 16, connection: { saveData: true } },
    { deviceMemory: 3, hardwareConcurrency: 2 },
    { deviceMemory: 0.5 },
    { hardwareConcurrency: 2 },
    { hardwareConcurrency: 4, connection: { saveData: true } },
    { deviceMemory: 1, hardwareConcurrency: 2.5 },
    { deviceMemory: "2", hardwareConcurrency: "4" },
  ];

  it("sin nada guardado, con almacenamiento bloqueado y con cada elección del botón", () => {
    for (const guardado of [null, "lanza", "si", "no", "basura"] as const) {
      for (const nav of equipos) {
        for (const tactil of [false, true]) {
          const esperado = resolverLiviano(guardado === "lanza" ? null : guardado, leerEquipo(nav, tactil));
          expect(correrScript(guardado, nav, tactil), `${guardado} · ${JSON.stringify(nav)} · táctil ${tactil}`).toBe(esperado);
        }
      }
    }
  });

  it("si leer `connection` lanza, decide con lo demás y no rompe", () => {
    const nav = {
      deviceMemory: 2,
      get connection(): never {
        throw new Error("bloqueado");
      },
    };
    expect(correrScript(null, nav)).toBe("si");
  });

  it("sin `matchMedia`, cuenta como no táctil y no rompe", () => {
    expect(correrScript(null, { deviceMemory: 4 }, "lanza")).toBe("no");
    expect(correrScript(null, { deviceMemory: 2 }, "lanza")).toBe("si");
  });

  it("va en el <head> de la app, junto a los del tema y las animaciones", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toMatch(/SCRIPT_MOVIMIENTO_ANTES_DE_PINTAR \}\} \/>[\s\S]*?SCRIPT_LIVIANO_ANTES_DE_PINTAR \}\} \/>[\s\S]*?<\/head>/);
  });
});

describe("el CSS liviano es la cara maciza del vidrio, sin diseño propio", () => {
  const css = readFileSync("app/estilos/liviano.css", "utf8");
  const recetas = readFileSync("app/estilos/vidrio/recetas.css", "utf8");
  const aguanta = readFileSync("app/estilos/vidrio/aguanta.css", "utf8");
  const globals = readFileSync("app/globals.css", "utf8");
  const decls = (t: string) => [...t.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()] as const);

  // Lo que el vidrio que aguanta pone en claro y en oscuro: los bloques `prefers-reduced-transparency` de las recetas, en su orden, y
  // después el bloque de `aguanta.css`, que les gana.
  const claro = new Map<string, string>();
  const oscuro = new Map<string, string>();
  for (const [bloque] of recetas.matchAll(/@media \(prefers-reduced-transparency: reduce\) \{[\s\S]*?\n\}\n/g)) {
    const paraLosDos = /:root,\s*:root\[data-tema="oscuro"\]/.test(bloque);
    for (const [k, v] of decls(bloque)) {
      oscuro.set(k, v);
      if (paraLosDos) claro.set(k, v);
    }
  }
  const bloqueAguanta = aguanta.slice(
    aguanta.indexOf("@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {"),
    aguanta.indexOf("@media (prefers-contrast: more) {"),
  );
  for (const [k, v] of decls(bloqueAguanta)) {
    claro.set(k, v);
    oscuro.set(k, v);
  }
  const bloqueLiviano = css.slice(css.indexOf(':root[data-liviano="si"],'), css.indexOf("}", css.indexOf(':root[data-liviano="si"],')));
  const liviano = new Map(decls(bloqueLiviano));

  it("trae cada variable maciza con su mismo valor, y nada más", () => {
    expect(claro.size).toBeGreaterThan(40);
    // Hoy ninguna receta maciza difiere entre claro y oscuro: el bloque de los dos temas basta. Si eso cambia, este archivo necesita su
    // bloque oscuro (`:root[data-liviano="si"][data-tema="oscuro"]`, dentro de `@media screen`).
    expect([...oscuro].filter(([k, v]) => claro.get(k) !== v)).toEqual([]);
    expect(Object.fromEntries(liviano), "Copia a `app/estilos/liviano.css` la receta maciza que cambió o nació").toEqual(Object.fromEntries(claro));
  });

  it("vale para los dos temas, sin desenfoque y sin las nubes", () => {
    expect(bloqueLiviano).toContain(':root[data-liviano="si"][data-tema="oscuro"]');
    expect(css).toMatch(/:root\[data-liviano="si"\] \*,[\s\S]*?backdrop-filter: none !important;/);
    expect(css).toMatch(/:root\[data-liviano="si"\] \.marco-aurora \{\s*display: none;/);
  });

  it("se importa después de la cara maciza que copia", () => {
    expect(globals.indexOf('@import "./estilos/liviano.css"')).toBeGreaterThan(globals.indexOf('@import "./estilos/vidrio/aguanta.css"'));
  });
});
