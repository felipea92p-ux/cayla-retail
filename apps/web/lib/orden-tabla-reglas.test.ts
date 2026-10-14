import { describe, expect, it } from "vitest";
import { claveCelda, limpiarCantidad } from "./alta-producto";
import { BORRADOR_VACIO, celdasDelBorrador, paramsRpcModeloNuevo, resumenCantidades, type BorradorModelo, type CategoriaDeModelo, type ColorDeModelo } from "./modelo-nuevo-reglas";
import { cantidadesAlCambiarColores, lineasDeModeloExistente, tablaDeModeloExistente, tablaDeModeloNuevo } from "./orden-tabla-reglas";
import { compararTallas } from "./tallas";
import { totalesCantidades } from "./tabla-alta-reglas";

// La tabla de «Nueva orden» (ADR-0396, A2). Contrato en `orden-tabla-reglas.ts`. Aquí se prueba, con una semilla fija, que la tabla nueva MANDA LO MISMO que la matriz de antes:
//   · un modelo que existe: `lineasDeModeloExistente` contra el oráculo (`lineasDeHoy`, la expresión del formulario antes de A2, copiada tal cual);
//   · un modelo nuevo: las celdas son por referencia las de `celdasDelBorrador`, y los totales de la tabla son los que ya contaba la orden.

// El oráculo: la expresión de `NuevaOrdenProduccionForm.tsx` (`lineas`) tal como estaba el 2026-10-13, antes de A2.
const lineasDeHoy = (variantes: readonly { varianteId: string }[], cantidades: Readonly<Record<string, string>>) =>
  variantes
    .map((v) => ({ variante_id: v.varianteId, cantidad: Math.floor(Number(cantidades[v.varianteId]) || 0) }))
    .filter((l) => l.cantidad > 0);

// PRNG determinista (mulberry32), el mismo de `modelo-nuevo-reglas.test.ts`: una corrida exacta se repite.
const prng = (semilla: number) => () => {
  semilla |= 0;
  semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const elegir = <X,>(r: () => number, xs: readonly X[]) => xs[Math.floor(r() * xs.length)];

type V = { varianteId: string; talla: string | null; color: string | null; colorHex: string | null };
const v = (id: string, talla: string | null, color: string | null, colorHex: string | null = null): V => ({ varianteId: id, talla, color, colorHex });

describe("tablaDeModeloExistente", () => {
  // 3 colores × 3 tallas con (Negro, L) ausente.
  const variantes = [v("neg-s", "S", "Negro", "#111"), v("neg-m", "M", "Negro", "#111"), v("cru-s", "S", "Crudo"), v("cru-m", "M", "Crudo"), v("cru-l", "L", "Crudo"), v("pro-s", "S", "Palo Rosa"), v("pro-m", "M", "Palo Rosa"), v("pro-l", "L", "Palo Rosa")];

  it("las claves de las celdas con caja son EXACTAMENTE los varianteId, y las que el modelo no tiene salen rayadas con prefijo `ausente|`", () => {
    const t = tablaDeModeloExistente(variantes);
    const conCaja = t.celdas.filter((c) => !t.excluidas.has(c.clave)).map((c) => c.clave);
    expect(new Set(conCaja)).toEqual(new Set(variantes.map((x) => x.varianteId)));
    expect(conCaja.length).toBe(variantes.length);
    expect([...t.excluidas]).toEqual(["ausente|Negro|L"]);
    for (const clave of t.excluidas) expect(clave.startsWith("ausente|")).toBe(true);
    expect(t.celdas.length).toBe(3 * 3);
  });

  it("las tallas salen en el orden canónico, los colores en el orden en que aparecen, y el color lleva su hex", () => {
    const t = tablaDeModeloExistente([v("a", "L", "Verde"), v("b", "S", "Azul", "#00f"), v("c", "M", "Verde"), v("d", "XL", "Azul")]);
    expect(t.tallas.map((x) => x.texto)).toEqual(["S", "M", "L", "XL"]);
    expect(t.tallas.map((x) => x.texto)).toEqual([...t.tallas.map((x) => x.texto)].sort(compararTallas));
    expect(t.colores.map((c) => c.nombre)).toEqual(["Verde", "Azul"]);
    expect(t.colores.find((c) => c.nombre === "Azul")?.hex).toBe("#00f");
  });

  it("todas sin talla: sin columnas y `tallaId` nulo; todas sin color: sin filas y `color` nulo", () => {
    const sinTalla = tablaDeModeloExistente([v("a", null, "Negro"), v("b", null, "Crudo")]);
    expect(sinTalla.tallas).toEqual([]);
    expect(sinTalla.celdas.every((c) => c.tallaId === null)).toBe(true);
    expect(sinTalla.colores.map((c) => c.nombre)).toEqual(["Negro", "Crudo"]);
    const sinColor = tablaDeModeloExistente([v("a", "S", null), v("b", "M", null)]);
    expect(sinColor.colores).toEqual([]);
    expect(sinColor.celdas.every((c) => c.color === null)).toBe(true);
    expect(sinColor.tallas.map((x) => x.texto)).toEqual(["S", "M"]);
    const ninguno = tablaDeModeloExistente([v("a", null, null)]);
    expect(ninguno.tallas).toEqual([]);
    expect(ninguno.colores).toEqual([]);
    expect(ninguno.celdas).toEqual([{ tallaId: null, color: null, clave: "a" }]);
  });

  it("una mezcla (algunas con talla y otras sin) dibuja «Única» y «Sin color» como entradas, como la matriz de antes", () => {
    const t = tablaDeModeloExistente([v("a", "S", "Negro"), v("b", null, "Negro"), v("c", "S", null)]);
    expect(t.tallas.map((x) => x.texto).sort()).toEqual(["S", "Única"].sort());
    expect(t.colores.map((c) => c.nombre)).toEqual(["Negro", "Sin color"]);
    // (Sin color, Única) no existe: es una celda rayada.
    expect([...t.excluidas]).toEqual(["ausente|Sin color|Única"]);
  });

  it("una cantidad escrita en la clave de una celda `ausente|` no suma: ni a las líneas ni a los totales de la tabla", () => {
    const t = tablaDeModeloExistente(variantes);
    const cantidades = { "neg-s": "2", "ausente|Negro|L": "50" };
    expect(lineasDeModeloExistente(variantes, cantidades)).toEqual([{ variante_id: "neg-s", cantidad: 2 }]);
    expect(totalesCantidades(t.celdas, t.excluidas, cantidades).total).toBe(2);
  });
});

describe("lineasDeModeloExistente es la expresión de hoy (paridad con el oráculo, al azar y con semilla fija)", () => {
  const textos = ["", "0", " 7 ", "003", "2.5", "1e3", "-3", "abc", "12000", "5", "12", "9999", "0.9", "  "];

  function modeloAlAzar(r: () => number): V[] {
    const tallas = ["S", "M", "L", "XL", "Estándar"].filter(() => r() < 0.6);
    const colores = ["Negro", "Crudo", "Palo Rosa", "Verde"].filter(() => r() < 0.6);
    const conTalla = r() < 0.8 && tallas.length > 0;
    const conColor = r() < 0.8 && colores.length > 0;
    const ts: (string | null)[] = conTalla ? tallas : [null];
    const cs: (string | null)[] = conColor ? colores : [null];
    const out: V[] = [];
    let i = 0;
    for (const c of cs) for (const t of ts) if (r() < 0.85) out.push(v(`v${i++}`, t, c));
    return out;
  }

  it("3.000 casos: mismas líneas y en el MISMO orden que el oráculo", () => {
    const r = prng(284);
    for (let i = 0; i < 3000; i++) {
      const variantes = modeloAlAzar(r);
      const cantidades = Object.fromEntries(variantes.map((x) => [x.varianteId, elegir(r, textos)]));
      expect(lineasDeModeloExistente(variantes, cantidades)).toEqual(lineasDeHoy(variantes, cantidades));
    }
  });

  it("en el dominio de la caja (solo dígitos, hasta 4) el total de la tabla es la suma de las líneas que se mandan", () => {
    const r = prng(285);
    const delaCaja = ["", "0", "7", "003", "12", "9999", "0007"];
    for (let i = 0; i < 3000; i++) {
      const variantes = modeloAlAzar(r);
      if (variantes.length === 0) continue;
      const cantidades = Object.fromEntries(variantes.map((x) => [x.varianteId, elegir(r, delaCaja)]));
      for (const c of Object.values(cantidades)) expect(/^\d{0,4}$/.test(c)).toBe(true);
      const t = tablaDeModeloExistente(variantes);
      const suma = lineasDeModeloExistente(variantes, cantidades).reduce((s, l) => s + l.cantidad, 0);
      expect(totalesCantidades(t.celdas, t.excluidas, cantidades).total).toBe(suma);
    }
  });

  it("fuera de ese dominio las dos lecturas divergen (por eso la caja no deja escribir '10000', '2.5' ni '1e3'): `limpiarCantidad` cierra la puerta al teclear", () => {
    const variantes = [v("a", "M", "Negro")];
    const t = tablaDeModeloExistente(variantes);
    for (const texto of ["10000", "2.5", "1e3"]) {
      const cantidades = { a: texto };
      const mandada = lineasDeModeloExistente(variantes, cantidades).reduce((s, l) => s + l.cantidad, 0);
      const contada = totalesCantidades(t.celdas, t.excluidas, cantidades).total;
      expect(mandada).not.toBe(contada);
      // Escrito en la caja, el texto ya viene limpio y las dos lecturas vuelven a coincidir.
      const limpio = { a: limpiarCantidad(texto) };
      expect(lineasDeModeloExistente(variantes, limpio).reduce((s, l) => s + l.cantidad, 0)).toBe(totalesCantidades(t.celdas, t.excluidas, limpio).total);
    }
  });
});

describe("tablaDeModeloNuevo (3.000 borradores al azar)", () => {
  const T = (id: string, valor: string, habitual = false) => ({ id, valor, habitual });
  const BLUSAS: CategoriaDeModelo = {
    id: "cat-blusas",
    nombre: "Blusas",
    prefijo: "BLU",
    familia: "indumentaria",
    tallas: [T("t-xl", "XL"), T("t-m", "M", true), T("t-std", "Estándar"), T("t-s", "S", true), T("t-l", "L", true), T("t-xs", "XS")],
  };
  const SIN_TALLAS: CategoriaDeModelo = { id: "cat-sin", nombre: "Sin tallas", prefijo: null, familia: null, tallas: [] };
  const COLORES: ColorDeModelo[] = [
    { codigo: "NEG", nombre: "Negro", hex: "#111111", familiaColor: "neutros" },
    { codigo: "CRU", nombre: "Crudo", hex: null, familiaColor: "neutros" },
    { codigo: "PRO", nombre: "Palo Rosa", hex: null, familiaColor: "rosas" },
    { codigo: "VER", nombre: "Verde", hex: "#0a0", familiaColor: "verdes" },
  ];
  const textos = ["", "0", "5", "12", "9999", "10000", "1.5", "abc", "-2", " 7 ", "007"];
  const mezclar = <X,>(r: () => number, xs: readonly X[]) => [...xs].sort(() => r() - 0.5);

  function borradorAlAzar(r: () => number): BorradorModelo {
    const categoria = elegir(r, [BLUSAS, BLUSAS, SIN_TALLAS, null]);
    const tallaIds = mezclar(
      r,
      [...(categoria?.tallas ?? []), { id: "t-ajena" }].filter(() => r() < 0.5).map((t) => t.id)
    );
    const colorCodigos = mezclar(r, [...COLORES.map((c) => c.codigo), "ZZZ"].filter(() => r() < 0.5));
    const b: BorradorModelo = { ...BORRADOR_VACIO, nombre: "Short Sastre", categoria, tallaIds, colorCodigos, precio: "40", cantidades: {} };
    const c = celdasDelBorrador(b, COLORES);
    b.cantidades = Object.fromEntries(c.map((x) => [x.clave, elegir(r, textos)]));
    return b;
  }
  const params = (b: BorradorModelo) =>
    paramsRpcModeloNuevo({ ubicacionId: "u", borrador: b, celdas: celdasDelBorrador(b, COLORES), costos: { tela: "", avios: "", maquila: "" }, fechaEntrega: "", nota: "", confirmoDistinto: false, token: "t" });

  it("las celdas de la tabla SON (misma referencia) las de `celdasDelBorrador`: la tabla y la carga útil no pueden discrepar", () => {
    const r = prng(284);
    for (let i = 0; i < 3000; i++) {
      const b = borradorAlAzar(r);
      const celdas = celdasDelBorrador(b, COLORES);
      const t = tablaDeModeloNuevo({ celdas, categoria: b.categoria, tallaIds: b.tallaIds, colorCodigos: b.colorCodigos, colores: COLORES });
      expect(t.celdas).toBe(celdas);
      expect(t.excluidas.size).toBe(0);
    }
  });

  it("los colores de la tabla son los de las celdas (ni uno más ni uno menos) y van en el orden de los clics; las tallas, en el canónico", () => {
    const r = prng(286);
    for (let i = 0; i < 3000; i++) {
      const b = borradorAlAzar(r);
      const celdas = celdasDelBorrador(b, COLORES);
      const t = tablaDeModeloNuevo({ celdas, categoria: b.categoria, tallaIds: b.tallaIds, colorCodigos: b.colorCodigos, colores: COLORES });
      const deLasCeldas = new Set(celdas.map((c) => c.color).filter((c): c is string => c !== null));
      expect(new Set(t.colores.map((c) => c.codigo))).toEqual(deLasCeldas);
      expect(t.colores.length).toBe(deLasCeldas.size);
      const enClics = b.colorCodigos.filter((cod, k) => COLORES.some((c) => c.codigo === cod) && b.colorCodigos.indexOf(cod) === k);
      expect(t.colores.map((c) => c.codigo)).toEqual(enClics);
      const deLasCeldasTalla = new Set(celdas.map((c) => c.tallaId).filter((x): x is string => x !== null));
      expect(new Set(t.tallas.map((x) => x.id))).toEqual(deLasCeldasTalla);
      const valores = t.tallas.map((x) => x.texto);
      expect(valores).toEqual([...valores].sort(compararTallas));
    }
  });

  it("el total de la tabla es el que ya contaba la orden (`resumenCantidades`), también con celdas inválidas (ambos las cuentan como 0)", () => {
    const r = prng(287);
    for (let i = 0; i < 3000; i++) {
      const b = borradorAlAzar(r);
      const celdas = celdasDelBorrador(b, COLORES);
      const t = tablaDeModeloNuevo({ celdas, categoria: b.categoria, tallaIds: b.tallaIds, colorCodigos: b.colorCodigos, colores: COLORES });
      expect(totalesCantidades(t.celdas, t.excluidas, b.cantidades).total).toBe(resumenCantidades(b, celdas).total);
    }
  });

  it("el orden de los clics (colores y tallas) NO cambia lo que se manda (`p_variantes`, con su orden) ni las celdas", () => {
    const r = prng(288);
    for (let i = 0; i < 1000; i++) {
      const b = borradorAlAzar(r);
      const permutado: BorradorModelo = { ...b, colorCodigos: mezclar(r, b.colorCodigos), tallaIds: mezclar(r, b.tallaIds) };
      expect(params(permutado).p_variantes).toEqual(params(b).p_variantes);
      expect(celdasDelBorrador(permutado, COLORES)).toEqual(celdasDelBorrador(b, COLORES));
    }
  });
});

describe("cantidadesAlCambiarColores (el primer color no pierde lo que ya se escribió)", () => {
  it("de 0 a 1 color: lo escrito en `talla|` pasa a `talla|COD` y el origen se borra", () => {
    const antes = { "t-s|": "4", "t-m|": "6" };
    expect(cantidadesAlCambiarColores(antes, ["t-s", "t-m"], [], ["NEG"])).toEqual({ "t-s|NEG": "4", "t-m|NEG": "6" });
  });

  it("sin tallas la celda única es `|` y pasa a `|COD`", () => {
    expect(cantidadesAlCambiarColores({ "|": "9" }, [], [], ["NEG"])).toEqual({ "|NEG": "9" });
  });

  it("gana lo que se VE: si el destino tenía números ocultos (de un color que se quitó antes), la fila nueva es una copia exacta del origen", () => {
    const antes = { "t-s|": "4", "t-s|NEG": "2", "t-m|NEG": "9" };
    expect(cantidadesAlCambiarColores(antes, ["t-s", "t-m"], [], ["NEG"])).toEqual({ "t-s|NEG": "4" });
  });

  it("si lo que se ve está vacío, los números ocultos del destino tampoco aparecen (nada se mezcla)", () => {
    expect(cantidadesAlCambiarColores({ "t-s|NEG": "2" }, ["t-s"], [], ["NEG"])).toEqual({});
  });

  it("de 1 a 0 colores: la vuelta (lo escrito en `talla|COD` pasa a `talla|`)", () => {
    expect(cantidadesAlCambiarColores({ "t-s|NEG": "4", "t-m|NEG": "6" }, ["t-s", "t-m"], ["NEG"], [])).toEqual({ "t-s|": "4", "t-m|": "6" });
  });

  it("de 1 a 2, de 2 a 1 y de 2 a 3 colores devuelve el MISMO objeto (las celdas ya llevan su color en la clave)", () => {
    const c = { "t-s|NEG": "4" };
    expect(cantidadesAlCambiarColores(c, ["t-s"], ["NEG"], ["NEG", "CRU"])).toBe(c);
    expect(cantidadesAlCambiarColores(c, ["t-s"], ["NEG", "CRU"], ["NEG"])).toBe(c);
    expect(cantidadesAlCambiarColores(c, ["t-s"], ["NEG", "CRU"], ["NEG", "CRU", "PRO"])).toBe(c);
  });

  it("si no hay nada que mover devuelve el mismo objeto (no dispara un cambio de estado de más)", () => {
    const c = { "t-s|": "" };
    expect(cantidadesAlCambiarColores(c, ["t-s"], [], ["NEG"])).toBe(c);
    const d = {};
    expect(cantidadesAlCambiarColores(d, ["t-s"], [], ["NEG"])).toBe(d);
  });

  it("solo mueve las tallas indicadas: lo escrito en una talla que ya no está se queda huérfano", () => {
    const antes = { "t-s|": "4", "t-xl|": "9" };
    expect(cantidadesAlCambiarColores(antes, ["t-s"], [], ["NEG"])).toEqual({ "t-s|NEG": "4", "t-xl|": "9" });
  });

  it("la secuencia que rompía (quitar todos los colores y volver a agregar uno que dejó números ocultos): lo último escrito en «Sin color» es lo que queda en la fila nueva", () => {
    const tallas = ["t-s", "t-m"];
    let c: Record<string, string> = { "t-s|": "5", "t-m|": "3" };
    const dos = (antes: string[], despues: string[]) => (c = cantidadesAlCambiarColores(c, tallas, antes, despues));
    dos([], ["NEG"]); // Negro hereda 5 y 3
    c = { ...c, "t-s|CRU": "7" }; // se agrega Crudo y se escribe 7
    dos(["NEG"], ["NEG", "CRU"]); // (mismo objeto)
    dos(["NEG", "CRU"], ["CRU"]); // se quita Negro: sus 5 y 3 quedan ocultos
    dos(["CRU"], []); // se quita Crudo: su 7 pasa a «Sin color»
    c = { ...c, "t-s|": "9" }; // la persona escribe 9 en «Sin color»
    dos([], ["NEG"]); // se vuelve a agregar Negro
    expect(c).toEqual({ "t-s|NEG": "9" });
  });

  it("el `p_variantes` tras agregar el primer color es el mismo que si se hubieran escrito los números directo en la fila con color", () => {
    const T = (id: string, valor: string) => ({ id, valor, habitual: false });
    const categoria: CategoriaDeModelo = { id: "c", nombre: "Blusas", prefijo: "BLU", familia: "indumentaria", tallas: [T("t-s", "S"), T("t-m", "M")] };
    const colores: ColorDeModelo[] = [{ codigo: "NEG", nombre: "Negro", hex: "#111", familiaColor: "neutros" }];
    const base = { ...BORRADOR_VACIO, nombre: "Short", categoria, tallaIds: ["t-s", "t-m"], precio: "40" };
    const escritoSinColor = { "t-s|": "4", "t-m|": "6" };
    const migradas = cantidadesAlCambiarColores(escritoSinColor, base.tallaIds, [], ["NEG"]);
    const conMigracion: BorradorModelo = { ...base, colorCodigos: ["NEG"], cantidades: migradas };
    const directo: BorradorModelo = { ...base, colorCodigos: ["NEG"], cantidades: { [claveCelda("t-s", "NEG")]: "4", [claveCelda("t-m", "NEG")]: "6" } };
    const p = (b: BorradorModelo) =>
      paramsRpcModeloNuevo({ ubicacionId: "u", borrador: b, celdas: celdasDelBorrador(b, colores), costos: { tela: "", avios: "", maquila: "" }, fechaEntrega: "", nota: "", confirmoDistinto: false, token: "t" }).p_variantes;
    expect(p(conMigracion)).toEqual(p(directo));
    expect(p(conMigracion)).toHaveLength(2);
  });
});
