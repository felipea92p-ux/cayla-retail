import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// /chaos 2026-10-31 (hallazgos #2 y #3): las hojas «Agregar tallas» y «Agregar colores» de Nueva orden se abren desde un botón de la tabla. Al cerrarlas el foco tiene que volver a ESE botón
// (sin `Dialog.Trigger`, Radix no sabe cuál era y lo manda al <body>), y en el celular la hoja de colores no puede abrir con el cursor en el buscador (sube el teclado y la lista tapa los botones).
const leer = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8");
const formulario = leer("components/NuevaOrdenProduccionForm.tsx");
const talla = leer("components/orden-produccion/AgregarTallaModal.tsx");
const colores = leer("components/orden-produccion/AgregarColorAlModeloModal.tsx");

describe("las hojas de «+ Talla» y «+ Color»", () => {
  it("devuelven el foco al botón que las abrió", () => {
    expect(talla).toMatch(/alCerrarEnfocar=\{/);
    expect(colores).toMatch(/alCerrarEnfocar=\{/);
    expect(formulario).toMatch(/alCerrarEnfocar=\{botonTallaRef\}/);
    expect(formulario).toMatch(/alCerrarEnfocar=\{botonColorRef\}/);
    expect(formulario).toMatch(/ref=\{que === "Talla" \? botonTallaRef : botonColorRef\}/);
  });
  it("la de colores deja el foco en la hoja (no en el buscador) donde no hay teclado físico", () => {
    expect(colores).toMatch(/focoEnLaHoja=\{!enfocar\}/);
  });
});
