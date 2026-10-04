import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado del ancho completo del Inicio de almacén (Felipe, 2026-09-30: «debería ocupar toda la pantalla en cualquier resolución o
// zoom»; ADR-0292). El tope de 64 rem lo pone `AppShell` a TODA pantalla que no esté en `SIN_TOPE_DE_ANCHO`. Agregar «/» a esa lista
// estiraría el Inicio de todas las cuentas, que no fueron pensadas para eso (Equipo de hoy, «Te toca» de la tienda). Por eso el
// Inicio de almacén lo pide con un atributo, `data-ancho-completo`, que el `<main>` lee con `has-[[data-ancho-completo]]:max-w-none`.
//
// Contrato. PROMETE: que `AppShell` conserva esa regla; que el marcador vive en el Inicio de almacén; que ninguna otra pantalla o
// componente lo escribe (una pantalla nueva que necesite ancho completo lo decide con Felipe y lo agrega acá a propósito); y que
// «/» no entró a `SIN_TOPE_DE_ANCHO`. El Observatorio (el Inicio del Admin, ADR-0322) entró así el 2026-10-03: Felipe pidió que el
// mapa llene la pantalla. NO PROMETE: que el diseño se vea bien a cada ancho (eso se mira en el navegador: 1920, 2560,
// 3840, 1280, 768 y 375 px).

const RAIZ = join(__dirname, "..");
const MARCADOR = "data-ancho-completo";
const QUIEN_PIDE_ANCHO_COMPLETO = ["components/inicio-almacen/InicioAlmacen.tsx", "components/observatorio/Observatorio.tsx"];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    if (nombre === "node_modules" || nombre.startsWith(".")) return [];
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(tsx?|css)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

describe("ancho completo del Inicio de almacén", () => {
  it("AppShell le quita el tope al <main> cuando la pantalla lo pide, y no toca a las demás", () => {
    const shell = readFileSync(join(RAIZ, "components/AppShell.tsx"), "utf8");
    expect(shell).toContain('"mx-auto max-w-5xl has-[[data-ancho-completo]]:max-w-none"');
  });

  it("«/» no está en SIN_TOPE_DE_ANCHO: estiraría el Inicio de todas las cuentas", () => {
    const shell = readFileSync(join(RAIZ, "components/AppShell.tsx"), "utf8");
    const lista = /const SIN_TOPE_DE_ANCHO = \[([^\]]*)\]/.exec(shell)?.[1] ?? "";
    expect(lista).not.toBe("");
    expect(lista.split(",").map((r) => r.trim().replace(/"/g, ""))).not.toContain("/");
  });

  it("solo el Inicio de almacén y el Observatorio escriben el marcador", () => {
    const quienes = archivos(RAIZ)
      .filter((f) => readFileSync(f, "utf8").includes(MARCADOR))
      .map((f) => f.slice(RAIZ.length + 1).replaceAll("\\", "/"))
      // AppShell y este candado lo nombran para leerlo, no para pedirlo.
      .filter((f) => f !== "components/AppShell.tsx");
    expect(quienes.sort()).toEqual([...QUIEN_PIDE_ANCHO_COMPLETO].sort());
  });

  it("cada Inicio lo escribe como atributo de un elemento, no en un comentario", () => {
    for (const archivo of QUIEN_PIDE_ANCHO_COMPLETO) {
      const inicio = readFileSync(join(RAIZ, archivo), "utf8");
      expect(inicio).toMatch(/<span hidden data-ancho-completo \/>/);
    }
  });
});
