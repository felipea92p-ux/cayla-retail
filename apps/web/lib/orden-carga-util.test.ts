import { describe, expect, it } from "vitest";
import { type CeldaAlta } from "./alta-producto";
import {
  BORRADOR_VACIO,
  celdasDelBorrador,
  paramsRpcModeloNuevo,
  type BorradorModelo,
  type CategoriaDeModelo,
  type ColorDeModelo,
} from "./modelo-nuevo-reglas";

// Pines de la CARGA ÚTIL de «Nueva orden» (ADR-0396, A2 «La tabla única»). Lo que viaja a `abrir_produccion` y a
// `abrir_produccion_con_modelo_nuevo` NO cambia cuando la matriz hecha a mano se reemplaza por la tabla de Nuevo producto: esta
// prueba se escribió ANTES de tocar el formulario, con los literales de HOY, y es la vara contra la que se mide el cambio.
//
// CONTRATO
//   PROMETE: que, para un modelo nuevo, `p_variantes` sale con las mismas líneas y en el mismo orden de siempre (el del vocabulario de colores y el
//            canónico de tallas, nunca el de los clics), y que, para un modelo que existe, las líneas salen de leer `cantidades[varianteId]` como lo hace
//            el formulario (`lineasDeHoy`, copiado tal cual) y un número escrito en una celda que el modelo no tiene no cuenta.
//   ASUME:   las claves de celda son las de `claveCelda` (`talla|color`) para un modelo nuevo y el `varianteId` para uno que existe.
//   NO PROMETE: que la base acepte (ella valida otra vez): eso lo prueban `modelo-nuevo-reglas.test.ts` y `scripts/pruebas/`.

const T = (id: string, valor: string, habitual = false) => ({ id, valor, habitual });
const BLUSAS: CategoriaDeModelo = {
  id: "cat-blusas",
  nombre: "Blusas",
  prefijo: "BLU",
  familia: "indumentaria",
  tallas: [T("t-xl", "XL"), T("t-m", "M", true), T("t-std", "Estándar"), T("t-s", "S", true), T("t-l", "L", true), T("t-xs", "XS")],
};
const COLORES: ColorDeModelo[] = [
  { codigo: "NEG", nombre: "Negro", hex: "#111111", familiaColor: "neutros" },
  { codigo: "CRU", nombre: "Crudo", hex: null, familiaColor: "neutros" },
  { codigo: "PRO", nombre: "Palo Rosa", hex: null, familiaColor: "rosas" },
];

const borrador = (o: Partial<BorradorModelo> = {}): BorradorModelo => ({
  ...BORRADOR_VACIO,
  nombre: "Short Sastre",
  categoria: BLUSAS,
  tallaIds: ["t-s", "t-m"],
  colorCodigos: [],
  precio: "40",
  ...o,
});
const variantesDe = (b: BorradorModelo) => {
  const celdas: CeldaAlta[] = celdasDelBorrador(b, COLORES);
  const params = paramsRpcModeloNuevo({ ubicacionId: "u", borrador: b, celdas, costos: { tela: "", avios: "", maquila: "" }, fechaEntrega: "", nota: "", confirmoDistinto: false, token: "t" });
  return params.p_variantes;
};

describe("modelo nuevo: `p_variantes` de hoy, con literales", () => {
  it("sin color: una línea por talla, con `color_codigo` nulo, en el orden canónico (S antes que M aunque se marcó M primero)", () => {
    const b = borrador({ tallaIds: ["t-m", "t-s"], colorCodigos: [], cantidades: { "t-s|": "5", "t-m|": "3" } });
    expect(variantesDe(b)).toEqual([
      { talla_id: "t-s", color_codigo: null, cantidad: 5 },
      { talla_id: "t-m", color_codigo: null, cantidad: 3 },
    ]);
  });

  it("dos colores marcados PRO primero y NEG después: las líneas salen en el orden del vocabulario (NEG, PRO), no en el de los clics", () => {
    const b = borrador({
      colorCodigos: ["PRO", "NEG"],
      cantidades: { "t-s|PRO": "4", "t-m|NEG": "2", "t-s|NEG": "1", "t-m|PRO": "" },
    });
    expect(variantesDe(b)).toEqual([
      { talla_id: "t-s", color_codigo: "NEG", cantidad: 1 },
      { talla_id: "t-m", color_codigo: "NEG", cantidad: 2 },
      { talla_id: "t-s", color_codigo: "PRO", cantidad: 4 },
    ]);
  });

  it("una talla desmarcada: lo que había escrito en ella no viaja (el número queda huérfano en `cantidades`)", () => {
    const b = borrador({ tallaIds: ["t-s"], colorCodigos: ["NEG"], cantidades: { "t-s|NEG": "6", "t-m|NEG": "9" } });
    expect(variantesDe(b)).toEqual([{ talla_id: "t-s", color_codigo: "NEG", cantidad: 6 }]);
  });

  it("celdas '', '0' y '007': vacío y cero no viajan; «007» se lee 7", () => {
    const b = borrador({ tallaIds: ["t-s", "t-m", "t-l"], colorCodigos: ["NEG"], cantidades: { "t-s|NEG": "", "t-m|NEG": "0", "t-l|NEG": "007" } });
    expect(variantesDe(b)).toEqual([{ talla_id: "t-l", color_codigo: "NEG", cantidad: 7 }]);
  });

  it("sin tallas ni colores es UNA variante (una correa): `talla_id` y `color_codigo` nulos", () => {
    const b = borrador({ categoria: { ...BLUSAS, tallas: [] }, tallaIds: [], colorCodigos: [], cantidades: { "|": "12" } });
    expect(variantesDe(b)).toEqual([{ talla_id: null, color_codigo: null, cantidad: 12 }]);
  });

  it("permutar el orden de los clics (tallas y colores) no cambia ni una línea ni su orden", () => {
    const cantidades = { "t-s|NEG": "1", "t-m|NEG": "2", "t-s|PRO": "4", "t-m|PRO": "5" };
    const a = variantesDe(borrador({ tallaIds: ["t-s", "t-m"], colorCodigos: ["NEG", "PRO"], cantidades }));
    const b = variantesDe(borrador({ tallaIds: ["t-m", "t-s"], colorCodigos: ["PRO", "NEG"], cantidades }));
    expect(b).toEqual(a);
    expect(a).toEqual([
      { talla_id: "t-s", color_codigo: "NEG", cantidad: 1 },
      { talla_id: "t-m", color_codigo: "NEG", cantidad: 2 },
      { talla_id: "t-s", color_codigo: "PRO", cantidad: 4 },
      { talla_id: "t-m", color_codigo: "PRO", cantidad: 5 },
    ]);
  });
});

// El oráculo: la expresión de `NuevaOrdenProduccionForm.tsx` (`lineas`), copiada tal cual el 2026-10-13, antes de A2. Es la definición de «lo de hoy» para un modelo que existe.
type VarianteMin = { varianteId: string };
const lineasDeHoy = (variantes: readonly VarianteMin[], cantidades: Readonly<Record<string, string>>) =>
  variantes
    .map((v) => ({ variante_id: v.varianteId, cantidad: Math.floor(Number(cantidades[v.varianteId]) || 0) }))
    .filter((l) => l.cantidad > 0);

describe("modelo que existe: las líneas de hoy, con literales (el oráculo)", () => {
  // 3 colores × 3 tallas con (Negro, L) ausente: el catálogo no tiene esa combinación, así que no hay `varianteId` que sumar.
  const variantes: VarianteMin[] = [
    "neg-s", "neg-m", // (neg-l no existe)
    "cru-s", "cru-m", "cru-l",
    "pro-s", "pro-m", "pro-l",
  ].map((varianteId) => ({ varianteId }));

  it("lee la cantidad por `varianteId`, en el orden de las variantes, y descarta lo que no es mayor que cero", () => {
    const cantidades = { "neg-s": "5", "neg-m": "", "cru-s": "0", "cru-m": " 7 ", "cru-l": "003", "pro-s": "abc", "pro-m": "-3", "pro-l": "2" };
    expect(lineasDeHoy(variantes, cantidades)).toEqual([
      { variante_id: "neg-s", cantidad: 5 },
      { variante_id: "cru-m", cantidad: 7 },
      { variante_id: "cru-l", cantidad: 3 },
      { variante_id: "pro-l", cantidad: 2 },
    ]);
  });

  it("un número escrito en la clave de una celda que el modelo no tiene no cuenta (no hay variante a la que sumarle)", () => {
    const cantidades = { "neg-s": "1", "ausente|NEG|L": "50", "neg-l": "40" };
    expect(lineasDeHoy(variantes, cantidades)).toEqual([{ variante_id: "neg-s", cantidad: 1 }]);
  });

  it("sin nada escrito no hay líneas", () => {
    expect(lineasDeHoy(variantes, {})).toEqual([]);
  });
});
