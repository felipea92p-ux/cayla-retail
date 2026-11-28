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
    expect(form).toMatch(/<form onSubmit=\{onSubmit\} className="[^"]*\bgrid\b[^"]*@min-\[880px\]:grid-cols-\[minmax\(0,1fr\)_332px\]/);
  });

  it("la orden se arma en la página, no en una hoja (ADR-0509): el formulario no dibuja un <Modal> ni fija el ancho de una hoja, y el marco lo pone la lista", () => {
    for (const hoja of ["<Modal", 'variante="hoja"', "max-w-[1080px]", "pie-hoja-fijo", "max-w-2xl"]) expect(form, hoja).not.toContain(hoja);
    expect(form).toContain("marco: MarcoDeLaOrden;");
    const marco = readFileSync(new URL("../components/ordenes-lista/MarcoDePagina.tsx", import.meta.url), "utf8");
    // El ancho que decide si la ficha va a la derecha o en una barra es el de la tarjeta del compositor, no el de la pantalla.
    expect(marco).toContain("@container");
    expect(marco).toContain("data-compositor-orden");
    const lista = readFileSync(new URL("../components/ordenes-lista/OrdenesLista.tsx", import.meta.url), "utf8");
    expect(lista).toContain("marco={MarcoDePagina}");
  });

  it("lo que cierra la orden conserva su ancla de guía y sus botones no envían por accidente (Cancelar y las del aviso son type=button)", () => {
    expect(form).toContain('data-guia="prod-orden-nueva.cierre"');
    const botones = form.match(/<(?:Boton|button)\b[\s\S]*?>/g) ?? [];
    for (const etiqueta of botones) {
      if (etiqueta.includes('type="submit"')) continue;
      expect(etiqueta, etiqueta).toMatch(/type="button"/);
    }
  });

  it("la ganancia por prenda sigue siendo del líder y con el mismo precio que el semáforo: la ficha la recibe ya resuelta, nunca la calcula", () => {
    expect(form).toMatch(/ganancia=\{verMargen && semaforo && ganancia !== null \?/);
    expect(form).toContain("semaforoMargen(precioParaMargen(");
    expect(form).toContain("gananciaPorPrenda(precioParaMargen(");
    expect(ficha).not.toContain("semaforoMargen");
    expect(ficha).not.toContain("precioParaMargen");
    expect(ficha).not.toContain("gananciaPorPrenda");
  });

  it("los tres pasos van a la vista, en orden, y cada uno toma su estado de la guía de foco (Producción más clara, 2026-11-26)", () => {
    const pasos = ["PASOS_DE_LA_ORDEN.modelo.titulo", "PASOS_DE_LA_ORDEN.cantidades.titulo", "<NivelDos"].map((marca) => form.indexOf(marca));
    for (const lugar of pasos) expect(lugar).toBeGreaterThan(-1);
    expect([...pasos].sort((a, b) => a - b)).toEqual(pasos);
    expect(form).toContain('estado={estadoDe("modelo")}');
    expect(form).toContain('estado={estadoDe("cantidades")}');
    expect(form).toContain('estado={estadoDe("resto", nivelDosVisto)}');
    expect(form).toMatch(/const estadoDe = \(paso: ClaveDePaso, visto = true\) => estadoDelPaso\(camposDelPaso\(paso, esNuevo\)\.map\(\(id\) => guia\.estado\(id\)\), visto\);/);
    // La sugerencia de las ventas vive en el paso 2, sobre la tabla que llena.
    expect(form.indexOf("<ConsejoDeLaRed")).toBeGreaterThan(pasos[1]);
    expect(form.indexOf("<ConsejoDeLaRed")).toBeLessThan(form.indexOf("<MatrizCantidades"));
  });

  it("el tipo de orden se llama «Para vender» y «Muestra»: nadie escribe «Lote de producción» ni separa datos con un punto medio en lo que se ve", () => {
    const sinComentarios = (t: string) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    for (const [nombre, fuente] of [["formulario", form], ["ficha", ficha], ["paso 3", leer("components/orden-produccion/NivelDos.tsx")], ["modelos", leer("components/orden-produccion/ElegirModelo.tsx")], ["paso", leer("components/orden-produccion/PasoDeLaOrden.tsx")]] as const) {
      const codigo = sinComentarios(fuente);
      expect(codigo, nombre).not.toMatch(/Lote de producción/);
      expect(codigo, nombre).not.toContain("·");
    }
    expect(form).toContain('{ clave: "produccion", etiqueta: "Para vender" }');
  });
});

describe("la ficha: presentacional y accesible", () => {
  it("no tiene controles del formulario (los de cierre los pone el formulario), ni modal, ni colores sueltos: lo único que se toca es «Ver de qué se forma»", () => {
    // «Ver de qué se forma» (la pieza `BotonVerMas`) solo pliega el desglose del costo: no escribe ni envía nada.
    expect(ficha.match(/<BotonVerMas\b/g)).toHaveLength(1);
    const sinVerMas = ficha.replaceAll("<BotonVerMas", "");
    for (const fuera of ["<button", "<input", "<select", "<textarea", "<Boton", "<Modal", "fixed inset-0"]) expect(sinVerMas, fuera).not.toContain(fuera);
    expect(ficha).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(ficha).not.toMatch(/\brgba?\(/);
  });

  it("es un <aside> con nombre, lleva el ancla de la guía del resumen y el hijo va fuera del desplazamiento (el botón nunca se recorta)", () => {
    expect(ficha).toMatch(/<aside[\s\S]*aria-label="La orden, tal como va a quedar"/);
    expect(ficha).toContain('data-guia="prod-orden-nueva.resumen"');
    expect(ficha.indexOf("overflow-y-auto")).toBeLessThan(ficha.indexOf("{children}"));
    expect(ficha).toContain("shrink-0");
  });

  it("es una barra pegada abajo cuando el marco es angosto y publica su alto (la guía de foco y la carta de colores no quedan detrás); decide el ancho del marco, no el de la pantalla; el nombre no es un h3 hecho a mano", () => {
    expect(ficha).toContain("--alto-barra-ficha");
    expect(ficha).toContain("scroll-padding-bottom");
    expect(ficha).toMatch(/sticky bottom-0/);
    expect(ficha).toContain("@min-[880px]:");
    expect(ficha).not.toMatch(/min-\[980px\]|max-\[979px\]|matchMedia/);
    expect(ficha).not.toMatch(/<h[1-6]/);
  });
});

describe("el costo se lee por prenda y se parte en lo que lo forma", () => {
  it("la ficha dice «Cuesta hacerla» a la vista; de qué se forma (la tela y cada servicio, con dos partes o más) y «Toda la orden» se abren debajo", () => {
    expect(ficha).toContain("Cuesta hacerla");
    expect(ficha).toContain("Toda la orden");
    expect(ficha).toContain('aria-label="De qué se forma el costo de cada prenda"');
    expect(ficha.indexOf("Cuesta hacerla")).toBeLessThan(ficha.indexOf("Toda la orden"));
    expect(ficha).toMatch(/costo\.partes\.length > 1/);
    // El desglose vive dentro de lo que se pliega, no a la vista.
    const plegado = ficha.slice(ficha.indexOf("<FilasDeMas"), ficha.indexOf("</FilasDeMas>"));
    expect(plegado).toContain("costo.partes.map(");
    expect(plegado).toContain("Toda la orden");
  });

  it("la plata va con palabras de tienda: «Se vende a» y «Ganancia por prenda» en soles; la insignia «Margen N %» ya no existe", () => {
    expect(ficha).toContain("Se vende a");
    expect(ficha).toContain("Ganancia por prenda");
    expect(ficha).not.toMatch(/FilaMargen|margen\.porcentaje|>Margen</);
    // El color lo pone el semáforo de siempre, y su palabra queda para quien no ve el color.
    expect(ficha).toContain("TONO_GANANCIA[ganancia.tono]");
    expect(ficha).toContain("title={ganancia.dice}");
  });

  it("los colores, las tallas, la entrega y cada fase de afuera van como pares, no en una frase", () => {
    for (const par of ['<ParDato rotulo="Colores">', '<ParDato rotulo="Tallas">', '<ParDato rotulo="Entrega"', "rotulo={`${a.fase}, afuera`}"]) expect(ficha, par).toContain(par);
  });

  it("el formulario no calcula el reparto en el JSX: lo pide a `partesDelCostoPorPrenda` con el MISMO costo por prenda que mide el margen, y las fases de afuera sin listar siguen en «Afuera»", () => {
    expect(form).toContain("partesDelCostoPorPrenda({");
    expect(form).toMatch(/porPrenda: unitario,/);
    expect(form).toMatch(/partes: partesDelCosto\.map\(/);
    expect(form).toMatch(/afuera=\{serviciosSinListar\.map\(\(s\) => faseDeAfuera\(s\)\)\}/);
  });
});
