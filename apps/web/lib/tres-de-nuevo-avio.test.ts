import { describe, expect, it } from "vitest";
import { MAX_NOMBRE_CLASE, problemaDelNombreDeClase } from "./avio-clases-reglas";
import { problemasDeLaMedida } from "./avio-nuevo-reglas";
import type { ClaseDeAvio } from "./avio-clases-reglas";
import type { EntradaAvioNuevo } from "./avio-nuevo-reglas";

// Tres de los hallazgos de `/chaos` sobre «Nuevo avío» (2026-10-31). Felipe pidió cerrarlos.

const clase = (extra: Partial<ClaseDeAvio> = {}): ClaseDeAvio => ({
  id: "k1", nombre: "Botón", prefijo: "BOT", comportamiento: "pieza", unidadSugerida: "unidad",
  pideColor: true, orden: 10, activo: true, nota: null, ...extra,
});

const entrada = (extra: Partial<EntradaAvioNuevo> = {}): EntradaAvioNuevo =>
  ({ nombre: "Nácar", claseId: "k1", medida: "", medidaUnidad: "", unidad: "unidad", filas: [], puedeSaldo: true, ...extra }) as EntradaAvioNuevo;

// ── Hallazgo 7 · un botón sin medida SÍ se puede registrar ──────────────────────────────────────────────────────
// El diseño lo dice (`COMPORTAMIENTOS.pieza.requerida = false`) y la base acepta la medida nula, pero la pantalla no
// dejaba: al elegir la clase se rellena la UNIDAD sola, y la validación tomaba «hay unidad» por «hay medida escrita».
// Importa porque quien no sabe la línea del botón inventaba un número, y ese número entra en el nombre de la ficha
// y en su identidad para siempre.
describe("la medida de un avío: se pide donde distingue, y no donde el diseño dice que es opcional", () => {
  it("un botón sin medida se puede registrar (la unidad que propone la clase no cuenta como medida escrita)", () => {
    expect(problemasDeLaMedida(entrada({ medidaUnidad: "linea" }), clase())).toEqual([]);
    expect(problemasDeLaMedida(entrada(), clase())).toEqual([]);
  });
  it("y con medida escrita sigue validándose igual", () => {
    expect(problemasDeLaMedida(entrada({ medida: "18", medidaUnidad: "linea" }), clase())).toEqual([]);
    expect(problemasDeLaMedida(entrada({ medida: "0", medidaUnidad: "linea" }), clase())).toHaveLength(1);
    expect(problemasDeLaMedida(entrada({ medida: "abc", medidaUnidad: "linea" }), clase())).toHaveLength(1);
  });
  it("lo que SÍ se distingue por su medida la sigue pidiendo: un cierre, un elástico, un hilo", () => {
    for (const c of ["largo", "ancho", "titulo"] as const) {
      const p = problemasDeLaMedida(entrada({ medidaUnidad: "centimetro" }), clase({ comportamiento: c, nombre: "Cierre" }));
      expect(p, c).toHaveLength(1);
    }
  });
  it("y una etiqueta sigue sin llevarla", () => {
    expect(problemasDeLaMedida(entrada(), clase({ comportamiento: "etiqueta", nombre: "Etiqueta" }))).toEqual([]);
    expect(problemasDeLaMedida(entrada({ medida: "18" }), clase({ comportamiento: "etiqueta" }))).toHaveLength(1);
  });
});

// ── Hallazgo 5 · el nombre de una clase nueva no se recorta en silencio ─────────────────────────────────────────
// El API hacía `nombre.trim().slice(0, 60)`: se pidió crear una clase de 106 letras y se creó cortada a media
// palabra, con el aviso de éxito mostrando el nombre mutilado como si fuera el pedido. Y de esa clase sale el
// prefijo del código de TODOS sus avíos.
describe("una clase de avío no se crea con el nombre cortado a media palabra", () => {
  it("un nombre largo se rechaza diciendo cuánto cabe y cuánto tiene, en vez de cortarlo", () => {
    const largo = "Cinta elastica de polipropileno trenzado para pretina reforzada de pantalon de vestir modelo invierno 2027";
    const p = problemaDelNombreDeClase(largo);
    expect(p).toBeTruthy();
    expect(p).toContain(String(MAX_NOMBRE_CLASE));
    expect(p).toContain(String(largo.length));
  });
  it("uno que cabe pasa, con sus espacios de los extremos recortados", () => {
    expect(problemaDelNombreDeClase("Broche")).toBeNull();
    expect(problemaDelNombreDeClase("  Broche  ")).toBeNull();
    expect(problemaDelNombreDeClase("x".repeat(MAX_NOMBRE_CLASE))).toBeNull();
    expect(problemaDelNombreDeClase("x".repeat(MAX_NOMBRE_CLASE + 1))).toBeTruthy();
  });
  it("y uno vacío lo dice como lo que es", () => {
    expect(problemaDelNombreDeClase("")).toBeTruthy();
    expect(problemaDelNombreDeClase("   ")).toBeTruthy();
  });
});
