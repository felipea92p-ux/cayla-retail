import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// El presupuesto de ancho de la barra de Finanzas (`.mesa-telar`). Antes vivía solo en un comentario y en ADR-0493, y se había desviado: anotaba
// 1038 px cuando la fila real pedía 1162, porque nadie sumó el ícono «Qué se ve» del Resumen. Por eso «Registrar gasto» caía a otra fila de
// 1400 a 1440 px y la franja fija llegaba a 169 px. Aquí las medidas se cruzan con los cortes reales de `telar.css`. Una pieza nueva en la fila
// suma su ancho aquí: si ya no cabe, esta prueba lo dice antes de que lo vea una colaboradora.
//
// Las medidas son del peor caso, en Chrome con los nombres reales de sede: «Septiembre 2026» y dos dígitos en «Te toca».
const CON_TEXTO = { sedes: 571, mes: 236, icono: 32, teToca: 136, registrar: 155 };
const SOLO_ICONO = { teToca: 76, registrar: 52 };
const HUECO = 12;
const HUECO_APRETADO = 8;
const PIEZAS_SIN_DICHO = 5;
/** Con menos, la frase se queda en un hilo de dos líneas partidas. */
const MINIMO_DEL_DICHO = 150;
/** Lo mínimo de la píldora de sedes para que asomen al menos dos y se note que se desliza. */
const MINIMO_DE_SEDES = 240;

const css = readFileSync(join(__dirname, "..", "app/estilos/telar.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** El cuerpo de un bloque desde su llave, contando las anidadas. */
function cuerpoDesde(abre: number): string {
  let j = abre + 1;
  for (let hondo = 1; hondo > 0; j++) {
    if (css[j] === "{") hondo++;
    if (css[j] === "}") hondo--;
  }
  return css.slice(abre + 1, j - 1);
}

/** Los bloques `@container mesa`, con su ancho mínimo y máximo. */
const bloques = [...css.matchAll(/@container mesa ([^{]+)\{/g)].map((m) => {
  const cond = m[1];
  const min = /min-width:\s*([\d.]+)px/.exec(cond);
  const max = /max-width:\s*([\d.]+)px/.exec(cond);
  return { min: min ? Number(min[1]) : null, max: max ? Number(max[1]) : null, cuerpo: cuerpoDesde(m.index + m[0].length - 1) };
});

/** El tope del bloque de solo máximo donde `patron` aparece. */
function corte(patron: RegExp): number {
  const b = bloques.find((x) => x.max !== null && x.min === null && patron.test(x.cuerpo));
  expect(b, `falta el corte de ${patron}`).toBeDefined();
  return b!.max!;
}

const desde = (() => {
  const b = bloques.find((x) => x.min !== null && x.max === null && /\.mesa-telar-fila\s*\{[^}]*flex-wrap:\s*nowrap/.test(x.cuerpo));
  expect(b, "la fila no se fija en una sola línea por el ancho de la barra").toBeDefined();
  return b!.min!;
})();

describe("la barra de Finanzas va en una sola fila", () => {
  const fila = (a: { sedes: number; mes: number; icono: number; teToca: number; registrar: number }, hueco = HUECO) =>
    a.sedes + a.mes + a.icono + a.teToca + a.registrar + (PIEZAS_SIN_DICHO - 1) * hueco;

  const conRegistrarSoloIcono = { ...CON_TEXTO, registrar: SOLO_ICONO.registrar };
  const conAmbosSoloIcono = { ...conRegistrarSoloIcono, teToca: SOLO_ICONO.teToca };

  it("nunca desde 640 px de ventana: con el lateral abierto las sedes quedarían en un hilo", () => {
    // Ventana de 1024 con el lateral abierto (272) y el relleno del <main> (60): 692 px. Es lo más angosto que todavía va en una fila.
    expect(desde).toBeLessThanOrEqual(692);
    // Ventana de 768: 436 px. Tiene que quedar con las sedes en su propia fila.
    expect(desde).toBeGreaterThan(436);
  });

  it("con todo el texto, cabe justo por encima del primer corte", () => {
    expect(corte(/\.mesa-telar-registrar-texto/)).toBeGreaterThanOrEqual(fila(CON_TEXTO));
  });

  it("con «Registrar gasto» solo en ícono, cabe por encima del segundo corte", () => {
    expect(corte(/\.te-toca-telar-texto/)).toBeGreaterThanOrEqual(fila(conRegistrarSoloIcono));
  });

  it("con «Te toca» también en ícono, cabe por encima del tercero", () => {
    const tercero = bloques.find((x) => x.min !== null && x.max !== null && /\.sedes-telar-titulo/.test(x.cuerpo));
    expect(tercero, "falta el corte que quita el rótulo «Ver sede»").toBeDefined();
    expect(tercero!.max).toBeGreaterThanOrEqual(fila(conAmbosSoloIcono) - 1);
    expect(tercero!.min).toBe(desde);
  });

  it("en lo más angosto de la fila única, las sedes conservan lugar para deslizarse", () => {
    const fijo = conAmbosSoloIcono.mes + conAmbosSoloIcono.icono + conAmbosSoloIcono.teToca + conAmbosSoloIcono.registrar + (PIEZAS_SIN_DICHO - 1) * HUECO_APRETADO;
    expect(desde - fijo).toBeGreaterThanOrEqual(MINIMO_DE_SEDES);
  });

  it("la frase larga solo aparece si le queda lugar para leerse", () => {
    expect(corte(/\.mesa-telar-dice\s*\{[^}]*display:\s*none/)).toBeGreaterThanOrEqual(fila(CON_TEXTO) + HUECO + MINIMO_DEL_DICHO);
  });

  it("los cortes bajan en orden: cada uno quita algo solo cuando el anterior ya no alcanza", () => {
    expect(corte(/\.mesa-telar-registrar-texto/)).toBeGreaterThan(corte(/\.te-toca-telar-texto/));
  });

  it("lo único que se encoge son las sedes", () => {
    const fija = bloques.find((x) => x.min === desde && x.max === null)!.cuerpo;
    expect(fija).toMatch(/\.sedes-telar\s*\{[^}]*flex:\s*0 1 auto/);
    expect(fija).toMatch(/\.selector-mes[^{]*\{[^}]*flex:\s*none/);
  });

  it("el parche del Resumen por el ancho de la ventana ya no existe", () => {
    expect(css).not.toMatch(/#slot-ajustes-resumen/);
    expect(css).not.toMatch(/@media \(max-width: 1500px\)/);
  });
});

describe("más angosto, las sedes van en su propia fila deslizable", () => {
  it("el armado de dos líneas responde al ancho de la barra, justo donde termina la fila única", () => {
    const b = bloques.find((x) => x.max !== null && x.min === null && /\.sedes-telar\s*\{[^}]*flex:\s*1 0 100%/.test(x.cuerpo));
    expect(b, "falta el armado de dos líneas").toBeDefined();
    expect(b!.max!).toBeLessThan(desde);
    expect(desde - b!.max!).toBeLessThanOrEqual(1);
  });
});

describe("las sedes tapadas se notan", () => {
  it("la píldora de sedes es una fila que se desliza y avisa con el borde que se desvanece", () => {
    const componente = readFileSync(join(__dirname, "..", "components/finanzas/telar/MesaDeMando.tsx"), "utf8");
    expect(componente).toMatch(/className="sedes-telar pildoras-desliza"/);
  });
});
