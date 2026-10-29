import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MatrizCantidades } from "../components/alta-producto/MatrizCantidades";
import { claveCelda, construirCeldas } from "./alta-producto";

// La tabla única de cantidades (ADR-0396, A2 «La tabla única»). `MatrizCantidades` es el molde de Nuevo producto (paso 4) y, desde A2, también el de «Nueva orden de producción»:
// una sola pieza para «cuántas por talla y color».
//
// Estas pruebas fijan que EXTENDER el molde no mueve Nuevo producto. El HTML de hoy (sin ninguna prop nueva) queda guardado en `matriz-cantidades.default.golden.html` y se compara
// letra por letra: si una clase, un atributo o un texto del modo de siempre cambia, falla y dice dónde. Para aceptar un cambio A PROPÓSITO (se vio en el navegador, es otra
// decisión): `pnpm --filter web exec vitest run lib/matriz-cantidades.test.ts -u` y revisar el diff del golden en el PR.
//
// CONTRATO
//   PROMETE: que sin las props nuevas la tabla dibuja exactamente lo de siempre en sus tres modos visibles al servidor (cantidades, y precios con «cerradas»), con una o varias
//            tallas y colores y sin ninguno; y, en el modo `soloCantidades`, que no trae nada de precios ni de costos.
//   ASUME:   `renderToStaticMarkup` dibuja el estado inicial (el segmento arranca en «cantidades»); los otros modos se alcanzan con un clic.
//   NO PROMETE: el CSS, el foco ni el desplazamiento pegajoso: eso es del navegador (`/formidable`, `tema:auditar`). Tampoco cubre el modo «Costos» (solo con un clic).

const TALLAS = [
  { id: "t-s", texto: "S" },
  { id: "t-m", texto: "M" },
  { id: "t-l", texto: "L" },
];
const COLORES = [
  { codigo: "NEG", nombre: "Negro", hex: "#111111", familiaColor: "neutros" },
  { codigo: "CRU", nombre: "Crudo", hex: "#e8dcc0", familiaColor: "neutros" },
  { codigo: "PRO", nombre: "Palo Rosa", hex: "#d8a7a0", familiaColor: "rosas" },
];

const base = {
  onCantidad: () => {},
  precioBase: "89.90",
  precios: {},
  onPrecio: () => {},
  costoBase: "",
  costos: {},
  onCosto: () => {},
  destinoEtiqueta: "TRU · Real Plaza",
};
const html = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(MatrizCantidades as never, { ...base, ...props } as never));

describe("el modo de siempre no cambia (golden)", () => {
  it("1 · tres colores por tres tallas, una celda quitada y números escritos: modo «Cuántas tienes hoy» con su fila y su columna Total", async () => {
    const celdas = construirCeldas(["t-s", "t-m", "t-l"], ["NEG", "CRU", "PRO"]);
    const salida = html({
      celdas,
      tallas: TALLAS,
      colores: COLORES,
      excluidas: new Set([claveCelda("t-l", "NEG")]),
      cantidades: { [claveCelda("t-s", "NEG")]: "4", [claveCelda("t-m", "NEG")]: "6", [claveCelda("t-m", "CRU")]: "12", [claveCelda("t-l", "PRO")]: "3" },
    });
    await expect(salida).toMatchFileSnapshot("./matriz-cantidades.default.golden.html");
  });

  it("2 · la carga inicial ya se cerró: «Cuántas llegaron» (ADR-0328 act. 2026-10-28), con cantidades y precios distintos guardados", async () => {
    const celdas = construirCeldas(["t-s", "t-m"], ["NEG", "CRU"]);
    const salida = html({
      celdas,
      tallas: TALLAS.slice(0, 2),
      colores: COLORES.slice(0, 2),
      excluidas: new Set<string>(),
      cantidades: { [claveCelda("t-s", "NEG")]: "2" },
      precios: { [claveCelda("t-s", "NEG")]: "95", [claveCelda("t-m", "NEG")]: "0" },
      llegada: true,
    });
    await expect(salida).toMatchFileSnapshot("./matriz-cantidades.default.llegada.golden.html");
  });

  it("3 · una talla y un color: sin totales que repitan la celda", async () => {
    const celdas = construirCeldas(["t-m"], ["NEG"]);
    const salida = html({ celdas, tallas: [TALLAS[1]], colores: [COLORES[0]], excluidas: new Set<string>(), cantidades: { [claveCelda("t-m", "NEG")]: "5" } });
    await expect(salida).toMatchFileSnapshot("./matriz-cantidades.default.una-celda.golden.html");
  });

  it("4 · sin colores ni tallas: la fila «Sin color» y la columna «Única»", async () => {
    const celdas = construirCeldas([], []);
    const salida = html({ celdas, tallas: [], colores: [], excluidas: new Set<string>(), cantidades: {} });
    await expect(salida).toMatchFileSnapshot("./matriz-cantidades.default.sin-ejes.golden.html");
  });
});

describe("el modo `soloCantidades` (Nueva orden): solo cuántas, sin precios ni costos", () => {
  const celdas = construirCeldas(["t-s", "t-m"], ["NEG", "CRU"]);
  const solo = (extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(MatrizCantidades as never, {
        soloCantidades: true,
        celdas,
        tallas: TALLAS.slice(0, 2),
        colores: COLORES.slice(0, 2),
        excluidas: new Set<string>(),
        cantidades: { [claveCelda("t-s", "NEG")]: "4" },
        onCantidad: () => {},
        preguntaCelda: "Cuántas prendas de",
        fantasma: (clave: string) => (clave === claveCelda("t-m", "CRU") ? "9" : "0"),
        tituloDe: (clave: string) => (clave === claveCelda("t-s", "NEG") ? "BLU-NEG-S · pide mucho" : undefined),
        teclado: true,
        ...extra,
      } as never)
    );

  it("no trae nada de precios ni de costos: ni el segmento, ni las bajadas, ni los botones − y +", () => {
    const h = solo();
    for (const fuera of ["Qué escribes en la tabla", "Cuántas tienes", "Restar a", "Sumar a", "Precio", "Costo", "Lo que hay hoy en"]) expect(h).not.toContain(fuera);
    expect(h).not.toContain("<button");
  });

  it("«Llenar todas con» siempre a la vista, y es la ÚNICA caja que la guía no busca como cursor (`data-sin-cursor`)", () => {
    const h = solo();
    expect(h).toContain("Llenar todas con");
    expect(h).not.toContain("invisible");
    expect([...h.matchAll(/data-sin-cursor/g)]).toHaveLength(1);
    expect(h).toMatch(/<input id="alta-llenar-todas"[^>]*data-sin-cursor/);
  });

  it("dice lo que `preguntaCelda` le pide, y trae el gris (`fantasma`) y el título (`tituloDe`) de cada celda", () => {
    const h = solo();
    expect(h).toContain('aria-label="Cuántas prendas de Negro en S"');
    expect(h).toContain('aria-label="Cuántas prendas de Crudo en M"');
    expect(h).not.toContain("Cuántas tienes de");
    expect(h).toMatch(/aria-label="Cuántas prendas de Crudo en M" placeholder="9"/);
    expect(h).toContain('title="BLU-NEG-S · pide mucho"');
    expect([...h.matchAll(/ title="/g)]).toHaveLength(1);
  });

  it("`teclado` marca la raíz (`data-matriz-mover`) y sin `teclado` no hay marca", () => {
    expect(solo()).toContain("data-matriz-mover");
    expect(solo({ teclado: false })).not.toContain("data-matriz-mover");
  });

  it("`accionFila` dibuja su pieza SOLO en las filas con color (no en «Sin color»)", () => {
    const accion = (c: { nombre: string }) => createElement("button", { type: "button", "aria-label": `Quitar ${c.nombre}` }, "×");
    const conColores = solo({ accionFila: accion });
    expect(conColores).toContain('aria-label="Quitar Negro"');
    expect(conColores).toContain('aria-label="Quitar Crudo"');
    const sinColores = renderToStaticMarkup(
      createElement(MatrizCantidades as never, { soloCantidades: true, celdas: construirCeldas(["t-s"], []), tallas: [TALLAS[0]], colores: [], excluidas: new Set<string>(), cantidades: {}, onCantidad: () => {}, accionFila: accion } as never)
    );
    expect(sinColores).toContain("Sin color");
    expect(sinColores).not.toContain("Quitar");
  });

  it("sin colores ni tallas dibuja «Sin color» y «Única»", () => {
    const h = renderToStaticMarkup(createElement(MatrizCantidades as never, { soloCantidades: true, celdas: construirCeldas([], []), tallas: [], colores: [], excluidas: new Set<string>(), cantidades: {}, onCantidad: () => {} } as never));
    expect(h).toContain("Sin color");
    expect(h).toContain("Única");
    expect(h).toContain('aria-label="Cuántas tienes de Sin color en Única"');
  });

  it("la celda que el modelo no tiene sale rayada, con su título, y SIN caja", () => {
    const h = solo({ excluidas: new Set([claveCelda("t-m", "NEG")]) });
    expect(h).toContain("repeating-linear-gradient");
    expect(h).toContain('title="Este modelo no tiene esta combinación"');
    expect(h).not.toContain('aria-label="Cuántas prendas de Negro en M"');
    expect(h).toContain('aria-label="Cuántas prendas de Negro en S"');
  });

  it("el nombre de la fila es solo el color aunque lleve un «×» dentro (si no, el lector oye «Negro Quitar Negro»), y solo cuando hay una acción en la fila", () => {
    const accion = (c: { nombre: string }) => createElement("button", { type: "button", "aria-label": `Quitar ${c.nombre}` }, "×");
    const conAccion = solo({ accionFila: accion });
    expect(conAccion).toMatch(/<th scope="row" aria-label="Negro"/);
    expect(conAccion).toMatch(/<th scope="row" aria-label="Crudo"/);
    expect(solo()).not.toMatch(/<th scope="row" aria-label=/);
  });

  it("el número gris de la celda es legible (55 %, no 25 %) y la celda enfocada no queda bajo el encabezado, el «Total» ni la columna del color", () => {
    const h = solo();
    expect(h).toContain("placeholder:text-tinta/55");
    expect(h).not.toContain("placeholder:text-tinta/25");
    for (const margen of ["scroll-mt-14", "scroll-mb-12", "scroll-ml-32"]) expect(h).toContain(margen);
    // Nuevo producto conserva su 25 % y no trae esos márgenes (lo fijan además los golden).
    const defecto = html({ celdas, tallas: TALLAS.slice(0, 2), colores: COLORES.slice(0, 2), excluidas: new Set<string>(), cantidades: {} });
    expect(defecto).toContain("placeholder:text-tinta/25");
    expect(defecto).not.toContain("scroll-mt-14");
  });

  it("la franja del color es dato (no se invierte en oscuro) y el nombre del color tiene fondo OPACO en las filas con cebra (sticky sobre celdas que se deslizan)", () => {
    const h = solo();
    expect(h).toContain("data-color-dato");
    expect(h).toContain("bg-[color-mix(in_srgb,var(--color-hueso)_40%,var(--color-papel))]");
    // El modo de siempre no cambia: la franja sin marca y el fondo translúcido de siempre (lo fijan los golden de arriba).
    const defecto = html({ celdas, tallas: TALLAS.slice(0, 2), colores: COLORES.slice(0, 2), excluidas: new Set<string>(), cantidades: {} });
    expect(defecto).not.toContain("data-color-dato");
    expect(defecto).not.toContain("data-matriz-mover");
    expect(defecto).not.toContain("data-sin-cursor");
  });
});

// Lectura de la fuente: lo que la prueba de HTML no puede ver (el teclado, el cursor, los candados de las piezas vecinas). Mismo estilo que `modelo-nuevo-reglas.test.ts`.
describe("la tabla única, vista en el código", () => {
  const leer = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8");

  it("(a) el molde: marca las cajas que el cursor no busca y la raíz que se mueve con el teclado; Enter siempre `preventDefault`; imports relativos y sin modal", () => {
    const molde = leer("components/alta-producto/MatrizCantidades.tsx");
    expect(molde).toContain("data-sin-cursor");
    expect(molde).toContain("data-matriz-mover");
    expect(molde).toMatch(/function alTeclear[\s\S]*e\.preventDefault\(\)/);
    expect(molde).not.toMatch(/from "@\//);
    expect(molde).not.toContain("<Modal");
  });

  it("(b) la guía no manda el cursor a «Llenar todas con»", () => {
    expect(leer("components/alta-producto/useGuiaAlta.ts")).toContain(":not([data-sin-cursor])");
  });

  it("(c) el formulario de la orden usa la tabla única y no tiene su matriz a mano", () => {
    const f = leer("components/NuevaOrdenProduccionForm.tsx");
    for (const fuera of ["<table", 'type="number"', "unificar-fijo", "compararTallas"]) expect(f).not.toContain(fuera);
    for (const dentro of [
      "<MatrizCantidades",
      "soloCantidades",
      "lineasDeModeloExistente(",
      "cantidadesAlCambiarColores(",
      "input:not([data-sin-cursor])",
      // Funcional: «Llenar todas con» llama a `onCantidad` una vez por celda en el mismo ciclo; con `{ ...cantidades }` solo sobreviviría la última.
      "setCantidades((c) => ({ ...c, [clave]: valor }))",
    ]) {
      expect(f, dentro).toContain(dentro);
    }
  });

  it("(c2) «+ Agregar color» va ARRIBA de la tabla (con el panel debajo, la carta se corría 52 px bajo el mouse en cada color) y el «×» avisa si fue con el teclado", () => {
    const f = leer("components/NuevaOrdenProduccionForm.tsx");
    expect(f.indexOf("<AgregarColor")).toBeGreaterThan(-1);
    expect(f.indexOf("<AgregarColor")).toBeLessThan(f.indexOf("<MatrizCantidades"));
    expect(f).toContain("quitarColor(color.codigo, conTeclado)");
    expect(leer("components/orden-produccion/AgregarColor.tsx")).toContain("e.detail === 0");
  });

  it("(d) el rayado vive en `rayado.ts` y `MatrizVariantes` lo sigue exportando (Editar producto y Recibir lo importan de allí)", () => {
    expect(leer("components/alta-producto/rayado.ts")).toContain("repeating-linear-gradient(135deg,transparent_0_6px");
    expect(leer("components/alta-producto/MatrizVariantes.tsx")).toMatch(/export \{ RAYADO_FUERA \}/);
  });

  it("(e) `ElegirColores` conserva sus valores de siempre: `sinElegidos` y `enfocarBuscador` apagados, y la carta abierta de entrada", () => {
    const e = leer("components/alta-producto/ElegirColores.tsx");
    expect(e).toMatch(/sinElegidos = false/);
    expect(e).toMatch(/enfocarBuscador = false/);
    expect(e).toMatch(/cartaAbierta = true/);
    expect(e).toMatch(/export \{ Punto \}/);
  });

  it("(f) «+ Agregar color»: botones que no envían la orden, Enter del buscador sin enviarla, y nada de overlay propio ni colores sueltos", () => {
    const a = leer("components/orden-produccion/AgregarColor.tsx");
    expect(a).toMatch(/<ElegirColores[^>]*cartaAbierta=\{false\}[^>]*\bsinElegidos\b[^>]*\benfocarBuscador\b/);
    // Todo `<Boton` lleva `type="button"` antes de cualquier flecha: dentro del <form> de la orden un botón sin type la enviaría.
    for (const etiqueta of a.match(/<Boton[\s\S]*?>/g) ?? []) expect(etiqueta).toMatch(/type="button"/);
    expect(a).toMatch(/contains\(e\.target as Node\)/);
    expect(a).toContain('"combobox"');
    expect(a).not.toContain("<Modal");
    expect(a).not.toContain("fixed inset-0");
    expect(a).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
