import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { leerMontoArranque } from "./balance-reglas";
import { leerCantidad as leerCantidadEnvio } from "./envio-orden-reglas";
import { parsearPorcentaje } from "./configuracion-reglas";
import { leerMonto as leerMontoDePagoCorregido } from "./corregir-pago-reglas";
import { leerCantidad } from "./insumos-reglas";
import { sinBlancosDeMiles, soloCifrasEscritas } from "./numero-escrito";
import { leerDiasParaLlegar } from "./plan-compra-plazo";
import { parametroFueraDeRango } from "./tienda-web-reglas";
import { leerCostoUnitario, leerMontoPlata } from "./monto-plata-reglas";
import { leerNumero } from "./orden-compra-alta";
import { leerCantidadInsumo, leerPrecioInsumo } from "./ordenes-insumo-reglas";
import { leerDescuento, leerNumeroDeMonto } from "./plan-compra-reglas";
import { leerMonto as leerPrecioDeSede } from "./precio-sede-reglas";
import { leerCosto, leerPrecioVenta } from "./recepcion-envio-reglas";
import { leerSoles } from "./rendimiento-meta-reglas";

// Pegar varias celdas de una hoja de cálculo en un campo de cifra de UNA línea (/chaos de «Nuevo avío», 2026-10-31; Felipe: «sí, los nueve»).
//
// Esta prueba es de TODO el ERP, no de una pantalla: cruza los lectores de cifras que hay, y cada uno tiene que rechazar el pegado y seguir
// aceptando el separador de miles. Vive aparte, y no dentro de la prueba de cada lector, porque lo que protege es justamente que ninguno se
// quede atrás: el 31-oct se arreglaron tres y nueve siguieron inventando el número durante unas horas, en la factura de un proveedor, el
// saldo de arranque del Balance y el costo al recibir mercadería.
//
// Lo que llega al campo lo medimos en el navegador: pegar FILAS deja espacios ORDINARIOS («12 8 5»), pegar COLUMNAS deja la TABULACIÓN
// literal, y un copiado de la web deja el espacio no-rompible, que es un separador de miles de verdad. Por eso los tres casos de abajo.

const FILAS = "12 8 5"; // tres celdas en columna, pegadas: Chrome convierte el salto de línea en un espacio
const COLUMNAS = "12\t8\t5"; // tres celdas en fila, pegadas: la tabulación llega literal
const MILES = "1 200"; // esto NO es un pegado: es como se escriben mil doscientos
const MILES_WEB = "1 200"; // lo mismo, copiado de una página (espacio no-rompible)

/** Lo que cuenta es que no entre un número: cada lector lo dice a su manera. */
const noEntro = (v: unknown): boolean =>
  v === null ||
  (typeof v === "number" && Number.isNaN(v)) ||
  (typeof v === "object" && v !== null && "tipo" in v && (v as { tipo: string }).tipo === "mal") ||
  (typeof v === "object" && v !== null && "centimos" in v && (v as { centimos: number | null }).centimos === null) ||
  (typeof v === "object" && v !== null && "problema" in v && (v as { problema: string | null }).problema !== null) ||
  (typeof v === "object" && v !== null && "ok" in v && (v as { ok: boolean }).ok === false);

const LECTORES: { nombre: string; leer: (t: string) => unknown; miles: unknown }[] = [
  { nombre: "leerCantidad (insumos)", leer: (t) => leerCantidad(t), miles: 1200 },
  { nombre: "leerMontoPlata", leer: (t) => leerMontoPlata(t), miles: 1200 },
  { nombre: "leerCostoUnitario", leer: (t) => leerCostoUnitario(t), miles: 1200 },
  { nombre: "leerNumero (orden de compra, 0 dec.)", leer: (t) => leerNumero(t, 0), miles: { tipo: "ok", escalado: 1200 } },
  { nombre: "leerNumero (orden de compra, 2 dec.)", leer: (t) => leerNumero(t, 2), miles: { tipo: "ok", escalado: 120000 } },
  { nombre: "leerCantidadInsumo", leer: (t) => leerCantidadInsumo(t), miles: { tipo: "ok", escalado: 1200000 } },
  { nombre: "leerPrecioInsumo", leer: (t) => leerPrecioInsumo(t), miles: { tipo: "ok", escalado: 12000000 } },
  { nombre: "leerCosto (recibir mercadería)", leer: (t) => leerCosto(t), miles: { centimos: 120000, problema: null } },
  { nombre: "leerPrecioVenta (recibir mercadería)", leer: (t) => leerPrecioVenta(t, true), miles: { centimos: 120000, problema: null } },
  { nombre: "leerCantidad (envío de una orden)", leer: (t) => leerCantidadEnvio(t, 9999), miles: { cantidad: 1200, problema: null } },
  { nombre: "leerMontoArranque (Balance)", leer: (t) => leerMontoArranque(t), miles: 1200 },
  { nombre: "leerNumeroDeMonto (plan de compra)", leer: (t) => leerNumeroDeMonto(t), miles: 1200 },
  { nombre: "leerMonto (precio por sede)", leer: (t) => leerPrecioDeSede(t), miles: 1200 },
  { nombre: "leerSoles (meta de una persona)", leer: (t) => leerSoles(t), miles: 1200 },
  { nombre: "leerMonto (corregir un pago)", leer: (t) => leerMontoDePagoCorregido(t), miles: 120000 }, // en céntimos
];

describe("ningún lector de cifras lee un pegado de varias celdas como un número", () => {
  for (const { nombre, leer } of LECTORES) {
    it(`${nombre}: tres celdas en columna no son un número`, () => {
      expect(noEntro(leer(FILAS)), `«${FILAS}» entró como ${JSON.stringify(leer(FILAS))}`).toBe(true);
    });
    it(`${nombre}: tres celdas en fila (con tabulación) tampoco`, () => {
      expect(noEntro(leer(COLUMNAS)), `«12⇥8⇥5» entró como ${JSON.stringify(leer(COLUMNAS))}`).toBe(true);
    });
  }
  // El descuento y el porcentaje van aparte: su rango es chico (0 a 99, −99 a 300), así que el pegado se prueba con dos celdas.
  it("parsearPorcentaje (configuración): dos celdas no son un porcentaje", () => {
    expect(parsearPorcentaje("1 2").ok).toBe(false);
    expect(parsearPorcentaje("1\t2").ok).toBe(false);
    expect(parsearPorcentaje("25 %")).toEqual({ ok: true, valor: 25 }); // y lo de siempre no se rompe
    expect(parsearPorcentaje("-15")).toEqual({ ok: true, valor: -15 });
    // Ojo (preexistente, no lo cambia este PR): su propio mensaje de error sugiere «−15» con el menos tipográfico, que la función
    // NO acepta — solo el guion. Queda anotado en el backlog: el aviso le pide a la persona algo que después rechaza.
  });
  it("leerDescuento (plan de compra): dos celdas no son un descuento", () => {
    expect(leerDescuento("1 2")).toBeNull();
    expect(leerDescuento("1\t2")).toBeNull();
  });
});

describe("y todos leen igual el símbolo del sol: «S/.» es el sol entero, no un punto decimal", () => {
  // Felipe, 2026-10-31. «S/.» es la abreviatura de toda la vida del sol: «S/. 25» son veinticinco SOLES. Varios lectores dejaban
  // el punto suelto y leían veinticinco CÉNTIMOS —cien veces menos, en silencio—, y otros lo rechazaban: la misma cosa escrita
  // igual daba tres respuestas distintas. Es el caso que `/chaos` encontró el 2026-10-28 en el alta de productos («S/. 59» → 0.59).
  for (const { nombre, leer } of LECTORES) {
    // El de la meta y el del porcentaje no llevan símbolo de moneda; el descuento tampoco.
    if (/leerSoles|parsearPorcentaje/.test(nombre)) continue;
    it(`${nombre}: «S/. 25» vale lo mismo que «S/ 25»`, () => {
      expect(leer("S/. 25")).toEqual(leer("S/ 25"));
      expect(leer("S/.25")).toEqual(leer("S/ 25"));
    });
  }
});

describe("y el separador de miles no se pierde en ninguno", () => {
  for (const { nombre, leer, miles } of LECTORES) {
    it(`${nombre}: «1 200» siguen siendo mil doscientos`, () => {
      expect(leer(MILES)).toEqual(miles);
    });
    it(`${nombre}: también copiado de la web (espacio no-rompible)`, () => {
      expect(leer(MILES_WEB)).toEqual(miles);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------
// El candado: que no aparezca el décimo
// ---------------------------------------------------------------------------------------------------------------------------------
// Lo de arriba protege los lectores que HAY. Esto protege a los que vengan: el 31-oct se arreglaron tres y nueve se quedaron atrás
// —la factura de un proveedor, el saldo de arranque del Balance, el costo al recibir— porque cada uno borraba los blancos por su
// cuenta antes de leer. Mismo molde que «ningún lector de plata de Finanzas vuelve a borrar comas» (`monto-lectores.test.ts`).

/**
 * `.replace(/…\s…/g, "")` que borra TODOS los blancos del texto. Dos cosas parecidas que NO se persiguen, porque son correctas:
 * colapsarlos a un espacio (`, " "`, para comparar nombres) y recortar un prefijo o un sufijo, que lleva ancla (`/^Tienda\s+/`,
 * `/\s*\([^)]*\)$/`). Por eso la expresión exige el flag `g`, el reemplazo vacío y NINGÚN ancla.
 */
const BORRA_BLANCOS = /\.replace\(\s*\/(?![^/\n]*[\^$])(?:\\.|[^/\\\n])*\\s(?:\\.|[^/\\\n])*\/[a-z]*g[a-z]*\s*,\s*(?:""|''|``)\s*\)/;

/**
 * Lo que borra blancos con razón y no lee una cifra: un teléfono, un código de barras, una búsqueda, un nombre comparable.
 * Esta lista solo BAJA. Un archivo nuevo no entra: si lee una cifra, usa `sinBlancosDeMiles`; si no, va con `// blanco-fijo: <motivo>`.
 */
const NO_LEEN_CIFRAS = [
  "lib/club-reglas.ts", // el número de WhatsApp
  "lib/club-caja-reglas.ts",
  "lib/club-qr-reglas.ts",
  "lib/club-registro-reglas.ts",
  "lib/clienta-ticket-reglas.ts",
  "lib/filtro-busqueda-especial.ts", // comparar marcas escritas distinto
  "lib/separaciones-reglas.ts", // buscar un apartado por nombre
  "lib/proveedor-de-orden-reglas.ts", // un RUC
  "lib/parecidas-alta-vista.ts", // resaltar lo que coincide
  "lib/bajada-reglas.ts", // ¿el texto buscado tiene al menos dos letras?
  "lib/guias/reglas.ts",
];

describe("ningún lector de cifras vuelve a borrar los blancos por su cuenta", () => {
  const RAIZ = process.cwd();
  const archivos = (dir: string): string[] =>
    readdirSync(join(RAIZ, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? archivos(join(dir, e.name)) : [join(dir, e.name)],
    );

  const candidatos = [...archivos("lib"), ...archivos("components")].filter(
    (f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && !NO_LEEN_CIFRAS.includes(f.split(sep).join("/")),
  );

  it("el escáner mira de verdad el código (si no, no vigila nada)", () => {
    expect(candidatos.length).toBeGreaterThan(400);
    expect(BORRA_BLANCOS.test('const t = texto.replace(/\\s+/g, "");')).toBe(true);
    expect(BORRA_BLANCOS.test('const t = texto.replace(/\\s/g, "");')).toBe(true);
    // Colapsar a un espacio es correcto y no se persigue.
    expect(BORRA_BLANCOS.test('const t = nombre.replace(/\\s+/g, " ");')).toBe(false);
    // Recortar un prefijo o un sufijo lleva ancla y tampoco se persigue.
    expect(BORRA_BLANCOS.test('const t = u.nombre.replace(/^Tienda\\s+/i, "");')).toBe(false);
    expect(BORRA_BLANCOS.test('const t = n.replace(/\\s*\\([^)]*\\)\\s*$/, "");')).toBe(false);
    // Y sí se persigue el borrado total, aunque venga mezclado con otra cosa.
    expect(BORRA_BLANCOS.test('const t = texto.replace(/%|\\s/g, "");')).toBe(true);
  });

  it("ninguno borra los blancos antes de leer una cifra", () => {
    const culpables: string[] = [];
    for (const f of candidatos) {
      readFileSync(join(RAIZ, f), "utf8")
        .split("\n")
        .forEach((linea, i) => {
          const esComentario = /^\s*(\*|\/\/)/.test(linea); // un encabezado puede citar el patrón para explicarlo
          if (!esComentario && BORRA_BLANCOS.test(linea) && !/blanco-fijo:\s*.{10,}/.test(linea)) culpables.push(`${f}:${i + 1}  ${linea.trim()}`);
        });
    }
    // Un borrado legítimo lo dice en su línea: `// blanco-fijo: <motivo de 10 caracteres o más>`.
    expect(culpables).toEqual([]);
  });
});

describe("soloCifrasEscritas: un campo de entero deja ver el pegado en vez de juntarlo", () => {
  it("quita lo que no es cifra pero conserva los blancos, para que el validador pueda hablar", () => {
    expect(soloCifrasEscritas("12 8 5")).toBe("12 8 5");
    expect(soloCifrasEscritas("12\t8\t5")).toBe("12\t8\t5");
    expect(soloCifrasEscritas("14 días")).toBe("14 ");
    expect(soloCifrasEscritas("14")).toBe("14");
    expect(soloCifrasEscritas("")).toBe("");
  });
  it("el signo solo pasa donde el campo lo admite", () => {
    expect(soloCifrasEscritas("-2")).toBe("2");
    expect(soloCifrasEscritas("-2", { signo: true })).toBe("-2");
  });
  it("y lo que deja pasar, los validadores de días y de plazos lo rechazan", () => {
    // `leerDiasParaLlegar` y `parametroFueraDeRango` son estrictos (`/^\d{1,3}$/`, `/^-?\d+$/` sobre el texto recortado):
    // por eso basta con NO borrar el blanco. Si alguien los afloja, estas dos líneas se ponen en rojo.
    expect(leerDiasParaLlegar(soloCifrasEscritas("12 8 5"))).toBeNull();
    expect(parametroFueraDeRango("diasAvisoSinRecoger", soloCifrasEscritas("12 8 5", { signo: true }))).toBe(true);
    expect(leerDiasParaLlegar(soloCifrasEscritas("14"))).toBe(14);
  });
});
