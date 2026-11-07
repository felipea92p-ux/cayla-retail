import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ADR-0611, mejora 6: los tiempos tienen nombre y lo de todos los días responde rápido. Felipe eligió el ritmo «Rápido» mirando la maqueta (2026-11-05).
const globales = readFileSync("app/globals.css", "utf8");
const PIEZAS = ["app/estilos/campos-y-casillas.css", "app/estilos/pestanas-y-segmentos.css", "app/estilos/vidrio/campos-y-botones.css", "app/estilos/vidrio/notas-avisos-combos.css", "app/estilos/vacio-aviso-buscador.css"];

const ms = (nombre: string) => Number(globales.match(new RegExp(`${nombre}: (\\d+)ms`))?.[1]);

describe("tiempos con nombre, ritmo «Rápido» (ADR-0611, mejora 6)", () => {
  it("cuatro tiempos, de menos a más, y lo de todos los días bajo 200 ms", () => {
    expect([ms("--t-resp"), ms("--t-cambio"), ms("--t-hoja"), ms("--t-momento")]).toEqual([100, 160, 260, 480]);
    expect(ms("--t-cambio")).toBeLessThan(200);
  });

  it("una hoja se deja usar enseguida: su último campo llega en menos de medio segundo", () => {
    const desfase = Number(globales.match(/\(var\(--k, 0\) \+ 2\) \* (\d+)ms \+ (\d+)ms/)?.[1]);
    const inicio = Number(globales.match(/\(var\(--k, 0\) \+ 2\) \* \d+ms \+ (\d+)ms/)?.[1]);
    expect((7 + 2) * desfase + inicio + ms("--t-hoja")).toBeLessThan(500);
  });

  it("el botón usa los tiempos con nombre, sin números sueltos", () => {
    const boton = globales.slice(globales.indexOf(":is(.mov-boton, .btn-cayla:not(.btn-enlace)) {"));
    const transicion = boton.slice(boton.indexOf("transition:"), boton.indexOf(";", boton.indexOf("transition:")));
    expect(transicion).not.toMatch(/\d+ms/);
    expect(globales).not.toContain("cayla-brillo 650ms");
  });

  it.each(PIEZAS)("%s: sus transiciones no pasan de 100 ms en un número suelto", (p) => {
    const sueltas = [...readFileSync(p, "utf8").matchAll(/\btransition\s*:[^;{}]*;/g)]
      .flatMap((d) => [...d[0].matchAll(/\b(\d+)ms\b/g)].map((m) => Number(m[1])))
      .filter((n) => n >= 100);
    expect(sueltas).toEqual([]);
  });
});
