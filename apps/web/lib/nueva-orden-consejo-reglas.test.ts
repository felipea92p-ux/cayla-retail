import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OPCIONES_DIAS_OBJETIVO, sugerirCurva, type DemandaVariante } from "./produccion-decision-reglas";
import { explicacionDelConsejo, fraseDelConsejo } from "./nueva-orden-consejo-reglas";

// El consejo de la red en «Nueva orden» se pliega a UNA línea (hallazgo H5 del /formidable de Producción, 2026-10-16). Esta prueba fija las frases de esa línea y lo que
// dice «¿Por qué?» cuando no hay nada que sugerir, y vigila que el componente siga usando LA MISMA cuenta de siempre (`sugerirCurva`) y que ninguna palabra de sistema
// («curva», «motor de demanda», «cubrir») se vea sin tocar.

const RAIZ = join(__dirname, "..");
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf8");

/** Una variante con ritmo medido: 0,5 prendas por día. */
function conRitmo(id: string, stockRed: number): DemandaVariante {
  return { varianteId: id, productoId: "p", stockRed, stockTaller: 0, enCamino: 0, ritmoDia: 0.5, sedesConRitmo: 1, ventasNetas: 15, ventasBase: 15, cobertura: { tipo: "sin_ritmo" } as never, banda: "saludable" as never };
}
/** Una variante sin ritmo medido (con o sin ventas sueltas). */
function sinRitmo(id: string, ventasNetas: number): DemandaVariante {
  return { varianteId: id, productoId: "p", stockRed: 0, stockTaller: 0, enCamino: 0, ritmoDia: null, sedesConRitmo: 0, ventasNetas, ventasBase: 0, cobertura: { tipo: "sin_ritmo" } as never, banda: "sin_datos" as never };
}

describe("la línea del consejo de la red", () => {
  it("sin nada que fabricar, una sola frase sin cifras y sin botón que usar", () => {
    expect(fraseDelConsejo(0)).toEqual({ texto: "La red no sugiere nada ahora", sugiere: false });
  });

  it("con prendas que fabricar, dice cuántas y deja usarla", () => {
    expect(fraseDelConsejo(40)).toEqual({ texto: "La red sugiere 40 prendas", sugiere: true });
  });

  it("una sola prenda va en singular", () => {
    expect(fraseDelConsejo(1)).toEqual({ texto: "La red sugiere 1 prenda", sugiere: true });
  });

  it("un total roto (negativo o NaN) no inventa una sugerencia", () => {
    expect(fraseDelConsejo(-3).sugiere).toBe(false);
    expect(fraseDelConsejo(Number.NaN).sugiere).toBe(false);
  });

  it("ninguna frase dice «curva», «motor de demanda» ni «cubrir»", () => {
    for (const total of [0, 1, 40]) expect(fraseDelConsejo(total).texto).not.toMatch(/curva|motor|cubrir/i);
  });
});

describe("lo que dice «¿Por qué?»", () => {
  it("la red sin datos de venta del modelo lo dice", () => {
    expect(explicacionDelConsejo({ total: 0, sugerencias: [], diasObjetivo: 30 })).toBe("La red todavía no tiene datos de venta de este modelo.");
  });

  it("si ninguna talla ni color tiene ritmo medido, no promete que ya alcanza", () => {
    const curva = sugerirCurva([{ varianteId: "a" }, { varianteId: "b" }], new Map([["a", sinRitmo("a", 0)], ["b", sinRitmo("b", 2)]]), new Map(), 30);
    const texto = explicacionDelConsejo({ total: curva.total, sugerencias: [...curva.porVariante.values()], diasObjetivo: 30 });
    expect(curva.total).toBe(0);
    expect(texto).toMatch(/no hay ventas suficientes/i);
    expect(texto).not.toMatch(/alcanza/i);
  });

  it("si lo que se vende ya alcanza para los días elegidos, lo dice con esos días", () => {
    // 0,5 por día × 30 días = 15; con 40 en tiendas no falta nada.
    for (const dias of OPCIONES_DIAS_OBJETIVO) {
      const curva = sugerirCurva([{ varianteId: "a" }], new Map([["a", conRitmo("a", 500)]]), new Map(), dias);
      expect(curva.total).toBe(0);
      expect(explicacionDelConsejo({ total: curva.total, sugerencias: [...curva.porVariante.values()], diasObjetivo: dias })).toContain(`${dias} días`);
    }
  });

  it("una mezcla (una con ritmo que ya alcanza y otra sin ventas) dice que alcanza, no que falten datos", () => {
    const curva = sugerirCurva([{ varianteId: "a" }, { varianteId: "b" }], new Map([["a", conRitmo("a", 500)], ["b", sinRitmo("b", 0)]]), new Map(), 30);
    expect(curva.total).toBe(0);
    expect(explicacionDelConsejo({ total: curva.total, sugerencias: [...curva.porVariante.values()], diasObjetivo: 30 })).toMatch(/alcanza/i);
  });

  it("con algo que fabricar, explica de dónde sale la cifra y sin jerga", () => {
    const curva = sugerirCurva([{ varianteId: "a" }], new Map([["a", conRitmo("a", 0)]]), new Map(), 30);
    expect(curva.total).toBe(15);
    const texto = explicacionDelConsejo({ total: curva.total, sugerencias: [...curva.porVariante.values()], diasObjetivo: 30 });
    expect(texto).toMatch(/venden las tiendas/i);
    expect(texto).not.toMatch(/curva|motor de demanda|cubrir/i);
  });
});

describe("el componente del consejo", () => {
  const consejo = leer("components/orden-produccion/ConsejoDeLaRed.tsx");
  const formulario = leer("components/NuevaOrdenProduccionForm.tsx");
  /** El texto sin comentarios (un comentario puede nombrar la palabra vieja para explicar por qué ya no se muestra). */
  const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

  it("arranca cerrado, es un botón con aria-expanded y su panel tiene id (nunca solo con el mouse)", () => {
    expect(consejo).toMatch(/useState\(false\)/);
    expect(consejo).toContain("aria-expanded={abierto}");
    expect(consejo).toContain("aria-controls={idPanel}");
    expect(consejo).toMatch(/>\s*¿Por qué\?\s*</);
  });

  it("el panel de «¿Por qué?» solo se pinta abierto: ni el selector de días, ni el detalle, ni el motor se ven sin tocar", () => {
    const despues = consejo.split("{abierto && (")[1] ?? "";
    expect(despues).toContain("Desplegable");
    expect(despues).toContain("MotorEnProduccion");
    expect(despues).toContain("prod-orden-nueva.por-que");
    expect(consejo.split("{abierto && (")[0]).not.toContain("<Desplegable");
    expect(consejo.split("{abierto && (")[0]).not.toContain("<MotorEnProduccion");
  });

  it("la palabra «Cubrir», «Curva sugerida» y «motor de demanda» no están en lo que se ve antes de tocar «¿Por qué?»", () => {
    const antes = sinComentarios(consejo.split("{abierto && (")[0]);
    expect(antes).not.toMatch(/Cubrir|Curva sugerida|motor de demanda/i);
    expect(sinComentarios(formulario)).not.toMatch(/Curva sugerida por la red|Nada que fabricar/);
  });

  it("«Usarla» sigue llamando a la misma función que llena «Cuántas» y sale solo cuando la red sugiere", () => {
    expect(formulario).toContain("onUsar={usarCurva}");
    expect(formulario).toMatch(/function usarCurva\(\) \{\s*setCantidades\(cantidadesDeLaCurva\(curva\)\);\s*\}/);
    expect(consejo).toContain("onClick={onUsar}");
    expect(consejo).toMatch(/frase\.sugiere &&/);
  });

  it("el formulario le pasa la MISMA sugerencia, los mismos días y el mismo motor de siempre", () => {
    expect(formulario).toContain("<ConsejoDeLaRed");
    expect(formulario).toContain("curva={curva}");
    expect(formulario).toContain("diasObjetivo={diasObjetivo}");
    expect(formulario).toContain("onDias={setDiasObjetivo}");
    expect(formulario).toContain("motor={datos.motor}");
    expect(formulario).toContain("disponible={disponibleDeVariante}");
    expect(formulario).toContain("onUsarMotor={setCantidades}");
  });

  it("el motivo de cada talla y color ya no se apaga a 60 %: se lee a 70 % o más (contraste, H11)", () => {
    expect(consejo).not.toMatch(/text-tinta\/(?:[1-5]\d|60)\b/);
    expect(consejo).toContain("text-tinta/70");
  });

  it("conserva las anclas de la guía (red, cubrir, por-que, motor) y suma la del «¿Por qué?»", () => {
    for (const ancla of ["prod-orden-nueva.red", "prod-orden-nueva.cubrir", "prod-orden-nueva.por-que", "prod-orden-nueva.por-que-abrir", "prod-orden-nueva.motor", "prod-orden-nueva.red-abrir"]) {
      expect(consejo, ancla).toContain(`"${ancla}"`);
    }
  });
});
