import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ADR-0674 · CSS por pantalla. `globals.css` lo descarga y lo compara TODA pantalla del ERP, también Vender en un teléfono de gama baja:
// medido el 2026-11-17 (Productos, procesador frenado 4 veces), sacar el CSS que solo usan pantallas de otros módulos bajó el recálculo
// de estilos de ~270 a ~200 ms. Ese CSS se importa ahora desde los componentes que usan sus clases: llega solo adonde se usa.
//
// Lo que esta prueba asegura, para que mover un CSS no rompa una pantalla en silencio:
//   1. Ninguno vuelve a `globals.css`.
//   2. Todo archivo que usa una clase de uno de ellos lo importa (correcto por construcción: donde se dibuja la clase, llega su CSS).
//   3. Ningún CSS global menciona sus clases. Uno que se carga aparte llega DESPUÉS de los globales: si un global lo pisaba (iba después
//      en `globals.css`), al moverlo el orden se invertiría. Por eso `tienda-web.css`, `trafico.css`, `estados-financieros.css`,
//      `tienda-web-conf.css` y `vidrio/vitrinas-sedes.css` siguen globales (los pisan `vidrio/tienda-web.css`, `tacto.css`,
//      `vidrio/estados.css` y `vidrio/config-vistas.css`).
//
// Para sumar uno: sácalo de `globals.css`, impórtalo desde cada componente que use sus clases (`import "@/app/estilos/<archivo>.css"`) y
// agrégalo aquí. Si varios van juntos y en orden, una entrada en `app/estilos/por-pantalla/` los importa.

/** El CSS que se importa por pantalla, con los archivos que lo forman. */
const POR_PANTALLA: Record<string, string[]> = {
  "por-pantalla/observatorio.css": ["observatorio.css", "vidrio/observatorio.css"],
  "por-pantalla/analisis-pestanas.css": ["analisis-quieta.css", "analisis-pedir.css", "analisis-ficha.css", "analisis-b.css"],
  "por-pantalla/rotulos.css": ["rotulo.css", "rotulos-brother.css"],
  "finanzas-recorrido.css": ["finanzas-recorrido.css"],
  "campana-efectos.css": ["campana-efectos.css"],
  "acompanante.css": ["acompanante.css"],
  "inicio-almacen.css": ["inicio-almacen.css"],
  "cartel-club.css": ["cartel-club.css"],
  "etiquetas-precio.css": ["etiquetas-precio.css"],
  "ordenes-lista.css": ["ordenes-lista.css"],
  "vidrio/clientes.css": ["vidrio/clientes.css"],
  "vidrio/colaboradores.css": ["vidrio/colaboradores.css"],
};

/**
 * Los CSS globales que SÍ mencionan clases de uno de ellos, porque en `globals.css` iban ANTES: el de la pantalla los pisaba y, cargado
 * aparte (siempre después de los globales), los sigue pisando. El orden no cambia. Uno que iba DESPUÉS no entra aquí: ese archivo se queda global.
 */
const IBAN_ANTES: Record<string, string[]> = {
  "por-pantalla/analisis-pestanas.css": ["estilos/analisis.css"],
};

const ESTILOS = "app/estilos";
const leer = (p: string) => readFileSync(p, "utf8");
const sinComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
/** Las clases con guion que define un CSS (las de una palabra, como `.activo`, son demasiado comunes para atribuirlas a un archivo). */
const clasesDe = (css: string) => new Set([...sinComentarios(css).matchAll(/\.([a-z_][a-z0-9_]*-[a-z0-9_-]+)/gi)].map((m) => m[1]));

function archivos(dir: string, ext: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name.startsWith(".")) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? archivos(p, ext) : ext.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

const globals = leer("app/globals.css");
// Cada fuente se lee una vez: la prueba de abajo las recorre una vez por cada CSS de la lista (hoy 12), y leerlas en cada vuelta era casi todo
// su tiempo (medido el 2026-11-18).
const fuentes = ["components", "app", "lib"].flatMap((d) => archivos(d, /\.(tsx?|mjs)$/)).map((ruta) => ({ ruta, texto: leer(ruta) }));
const cssGlobales = [...globals.matchAll(/@import "\.\/(estilos\/[^"]+)"/g)].map((m) => m[1]);

describe("CSS por pantalla (ADR-0674)", () => {
  it("las entradas existen y cada grupo importa sus archivos en orden", () => {
    for (const [entrada, miembros] of Object.entries(POR_PANTALLA)) {
      const css = leer(path.join(ESTILOS, entrada));
      if (miembros.length === 1 && miembros[0] === entrada) continue;
      const importados = [...css.matchAll(/@import "\.\.\/([^"]+)"/g)].map((m) => m[1]);
      expect(importados, entrada).toEqual(miembros);
    }
  });

  it("ninguno vuelve a globals.css", () => {
    for (const miembro of Object.values(POR_PANTALLA).flat()) expect(cssGlobales, miembro).not.toContain(`estilos/${miembro}`);
  });

  it("todo archivo que usa una de sus clases importa su CSS", () => {
    const faltan: string[] = [];
    for (const [entrada, miembros] of Object.entries(POR_PANTALLA)) {
      const clases = [...new Set(miembros.flatMap((m) => [...clasesDe(leer(path.join(ESTILOS, m)))]))];
      expect(clases.length, entrada).toBeGreaterThan(0);
      // Una sola expresión con todas las clases: la clase dentro de un texto (comillas, comilla invertida o espacio a cada lado).
      const re = new RegExp(`["'\`\\s](?:${clases.map((c) => c.replace(/-/g, "\\-")).join("|")})(?=["'\`\\s])`);
      const importa = `import "@/app/estilos/${entrada}";`;
      for (const { ruta, texto } of fuentes) if (re.test(texto) && !texto.includes(importa)) faltan.push(`${ruta} → ${importa}`);
    }
    expect(faltan, "Este archivo usa clases de un CSS que ya no es global: impórtalo").toEqual([]);
  });

  it("ningún CSS global menciona sus clases (al cargarse aparte, el orden se invertiría)", () => {
    const choques: string[] = [];
    // Sin comentarios desde ya: la vuelta de abajo los mira una vez por cada clase.
    const globalesConCuerpo = [...cssGlobales.map((g) => ({ nombre: g, css: leer(path.join("app", g)) })), { nombre: "globals.css", css: globals }].map((g) => ({ ...g, css: sinComentarios(g.css) }));
    for (const [entrada, miembros] of Object.entries(POR_PANTALLA)) {
      const permitidos = IBAN_ANTES[entrada] ?? [];
      for (const miembro of miembros) {
        for (const clase of clasesDe(leer(path.join(ESTILOS, miembro)))) {
          const re = new RegExp(`\\.${clase.replace(/-/g, "\\-")}(?![a-z0-9_-])`);
          for (const g of globalesConCuerpo) {
            if (!permitidos.includes(g.nombre) && re.test(g.css)) choques.push(`${g.nombre} menciona .${clase} (de ${miembro})`);
          }
        }
      }
    }
    expect(choques).toEqual([]);
  });
});
