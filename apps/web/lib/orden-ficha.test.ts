import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// La hoja ancha con ficha viva (ADR-0396, A3), vista en el código: lo que la prueba de HTML no alcanza y lo que un reordenamiento del JSX podría romper sin avisar.
// La lógica de los textos de la ficha está en `orden-ficha-reglas.test.ts`; el aspecto y el desplazamiento, en el navegador.
//
// CONTRATO
//   PROMETE: que el botón que abre la orden sigue DENTRO del `<form>` (si la ficha saliera de él, «Abrir orden» dejaría de enviar), que ya no hay pie pegado ni la hoja angosta de antes, que la ficha
//            es presentacional (sin controles propios: los de cierre viven en el formulario, así su guía y su huella siguen siendo las de siempre) y que las anclas de la guía existen.
//   NO PROMETE: que se vea bien (se mide en el navegador a 1440, 1280 y 1024) ni que la barra de abajo funcione en un celular (Producción es de escritorio).

const leer = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8");
const form = leer("components/NuevaOrdenProduccionForm.tsx");
const ficha = leer("components/orden-produccion/FichaOrden.tsx");

describe("el formulario: dos paneles dentro del <form>", () => {
  it("la ficha vive dentro del <form> y el botón de enviar va dentro de ella: sigue enviando la orden", () => {
    const abre = form.indexOf("<form");
    const cierra = form.indexOf("</form>");
    const fichaAbre = form.indexOf("<FichaOrden");
    const fichaCierra = form.indexOf("</FichaOrden>");
    const enviar = form.indexOf('type="submit"');
    expect(abre).toBeGreaterThan(-1);
    expect(fichaAbre).toBeGreaterThan(abre);
    expect(enviar).toBeGreaterThan(fichaAbre);
    expect(enviar).toBeLessThan(fichaCierra);
    expect(fichaCierra).toBeLessThan(cierra);
    // Un solo botón de enviar y la rejilla es el propio <form> (la ficha es su hija directa).
    expect(form.match(/type="submit"/g)).toHaveLength(1);
    expect(form).toMatch(/<form onSubmit=\{onSubmit\} className="[^"]*\bgrid\b[^"]*min-\[980px\]:grid-cols-\[minmax\(0,1fr\)_332px\]/);
  });

  it("la hoja es ancha y de la variante «hoja»; ya no hay pie pegado ni la hoja de 672 px", () => {
    expect(form).toMatch(/variante="hoja"/);
    expect(form).toContain("max-w-[1080px]");
    expect(form).not.toContain("pie-hoja-fijo");
    expect(form).not.toContain("max-w-2xl");
  });

  it("lo que cierra la orden conserva su ancla de guía y sus botones no envían por accidente (Cancelar y las del aviso son type=button)", () => {
    expect(form).toContain('data-guia="prod-orden-nueva.cierre"');
    const botones = form.match(/<(?:Boton|button)\b[\s\S]*?>/g) ?? [];
    for (const etiqueta of botones) {
      if (etiqueta.includes('type="submit"')) continue;
      expect(etiqueta, etiqueta).toMatch(/type="button"/);
    }
  });

  it("el margen sigue siendo del líder y con el mismo precio: la ficha recibe el margen ya resuelto, nunca lo calcula", () => {
    expect(form).toMatch(/margen=\{verMargen && semaforo \?/);
    expect(form).toContain("semaforoMargen(precioParaMargen(");
    expect(ficha).not.toContain("semaforoMargen");
    expect(ficha).not.toContain("precioParaMargen");
  });
});

describe("la ficha: presentacional y accesible", () => {
  it("no tiene controles propios (los de cierre los pone el formulario), ni modal, ni colores sueltos", () => {
    for (const fuera of ["<button", "<input", "<select", "<textarea", "<Boton", "<Modal", "fixed inset-0"]) expect(ficha, fuera).not.toContain(fuera);
    expect(ficha).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(ficha).not.toMatch(/\brgba?\(/);
  });

  it("es un <aside> con nombre, lleva el ancla de la guía del resumen y el hijo va fuera del desplazamiento (el botón nunca se recorta)", () => {
    expect(ficha).toMatch(/<aside[\s\S]*aria-label="La orden, tal como va a quedar"/);
    expect(ficha).toContain('data-guia="prod-orden-nueva.resumen"');
    expect(ficha.indexOf("overflow-y-auto")).toBeLessThan(ficha.indexOf("{children}"));
    expect(ficha).toContain("shrink-0");
  });

  it("bajo 980 px es una barra pegada abajo y publica su alto (la guía de foco y la carta de colores no quedan detrás); el nombre no es un h3 hecho a mano", () => {
    expect(ficha).toContain("--alto-barra-ficha");
    expect(ficha).toContain("max-width: 979px");
    expect(ficha).toMatch(/sticky bottom-\[-1\.5rem\]/);
    expect(ficha).not.toMatch(/<h[1-6]/);
  });
});
