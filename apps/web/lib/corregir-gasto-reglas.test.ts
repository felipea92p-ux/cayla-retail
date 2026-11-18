import { describe, expect, it } from "vitest";
import {
  argumentosParaCorregir,
  borradorDelGasto,
  cambioDeLaPlata,
  cambiosDelGasto,
  fraseCorregirGasto,
  leerGastoParaCorregir,
  textoDeCambioGasto,
  textoDeLaPlataDelGasto,
  textoMotivoGasto,
} from "./corregir-gasto-reglas";
import { leerCorrecciones } from "./corregir-compra-reglas";
import { soles } from "./compras-reglas";

const respuesta = (extra: Record<string, unknown> = {}, gasto: Record<string, unknown> = {}) => ({
  gasto: { id: "g1", concepto: "comida", nota: null, monto: "4.00", con_foto: false, fecha: "2026-10-29", ...gasto },
  se_puede: true,
  motivo: null,
  ...extra,
});

describe("leerGastoParaCorregir", () => {
  it("lee el gasto y si se puede corregir", () => {
    expect(leerGastoParaCorregir(respuesta())).toEqual({
      id: "g1",
      concepto: "comida",
      nota: null,
      monto: 4,
      conFoto: false,
      fecha: "2026-10-29",
      sePuede: true,
      motivo: null,
    });
  });
  it("acepta el monto como número y como texto, y lo que dice la base cuando no se puede", () => {
    expect(leerGastoParaCorregir(respuesta({ se_puede: false, motivo: "revisado" }, { monto: 3 }))).toMatchObject({ monto: 3, sePuede: false, motivo: "revisado" });
  });
  it("lo que no se entiende es null, nunca un gasto a medias", () => {
    expect(leerGastoParaCorregir(null)).toBeNull();
    expect(leerGastoParaCorregir({})).toBeNull();
    expect(leerGastoParaCorregir(respuesta({}, { concepto: "zapatos" }))).toBeNull();
    expect(leerGastoParaCorregir(respuesta({}, { monto: "abc" }))).toBeNull();
    expect(leerGastoParaCorregir(respuesta({}, { id: "" }))).toBeNull();
  });
});

describe("textoMotivoGasto", () => {
  it("dice cada motivo de la base y tiene un respaldo", () => {
    for (const m of ["revisado", "ronda_cerrada", "sin_ronda", "anulado", "otro_motivo", null]) expect(textoMotivoGasto(m).length).toBeGreaterThan(10);
    expect(textoMotivoGasto("revisado")).toContain("Avísale a Compras");
    expect(textoMotivoGasto("ronda_cerrada")).toContain("Reábrela");
  });
});

describe("cambios y plata", () => {
  const g = leerGastoParaCorregir(respuesta())!;
  it("sin tocar nada no hay cambios y la plata no se mueve", () => {
    const b = borradorDelGasto(g);
    expect(b).toEqual({ concepto: "comida", nota: "", monto: "4.00" });
    expect(cambiosDelGasto(g, b, false)).toEqual([]);
    expect(cambioDeLaPlata(g, b)).toBe(0);
    expect(textoDeLaPlataDelGasto(0)).toBe("Tu plata para comprar no cambia");
  });
  it("cambiar el monto: lo gastado de más baja su plata, lo de menos la sube", () => {
    expect(cambiosDelGasto(g, { ...borradorDelGasto(g), monto: "14" }, false)).toEqual([{ campo: "monto", titulo: "Cuánto fue", antes: soles(4), ahora: soles(14) }]);
    expect(cambioDeLaPlata(g, { monto: "14" })).toBe(-10);
    expect(textoDeLaPlataDelGasto(-10)).toBe(`Tu plata baja ${soles(10)}`);
    expect(cambioDeLaPlata(g, { monto: "2,50" })).toBe(1.5);
    expect(textoDeLaPlataDelGasto(1.5)).toBe(`Tu plata sube ${soles(1.5)}`);
  });
  it("un monto que no se entiende no cuenta como cambio ni mueve la plata", () => {
    expect(cambiosDelGasto(g, { ...borradorDelGasto(g), monto: "abc" }, false)).toEqual([]);
    expect(cambioDeLaPlata(g, { monto: "abc" })).toBe(0);
  });
  it("cambiar a «Otro» con su nota cuenta dos datos; con otro concepto la nota escrita no cuenta", () => {
    const otro = { concepto: "otro" as const, nota: " Saco de piñata ", monto: "4.00" };
    expect(cambiosDelGasto(g, otro, false).map((c) => c.campo)).toEqual(["concepto", "nota"]);
    const taxiConNota = { concepto: "taxi" as const, nota: "algo que quedó escrito", monto: "4.00" };
    expect(cambiosDelGasto(g, taxiConNota, false).map((c) => c.campo)).toEqual(["concepto"]);
    expect(argumentosParaCorregir(g, taxiConNota, "l1", null).p_nota).toBeNull();
    expect(argumentosParaCorregir(g, otro, "l1", null).p_nota).toBe("Saco de piñata");
  });
  it("de «Otro» a otro concepto, la nota se va", () => {
    const otro = leerGastoParaCorregir(respuesta({}, { concepto: "otro", nota: "Saco Piñata", monto: "3.00" }))!;
    const b = { ...borradorDelGasto(otro), concepto: "comida" as const };
    expect(cambiosDelGasto(otro, b, false).map((c) => [c.campo, c.antes, c.ahora])).toEqual([
      ["concepto", "Otro", "Comida"],
      ["nota", "Saco Piñata", "nada"],
    ]);
  });
  it("la foto: sumar una a un gasto sin foto, o cambiar la que tenía", () => {
    expect(cambiosDelGasto(g, borradorDelGasto(g), true)).toEqual([{ campo: "foto", titulo: "Foto del papel", antes: "sin foto", ahora: "con foto" }]);
    const conFoto = leerGastoParaCorregir(respuesta({}, { con_foto: true }))!;
    expect(cambiosDelGasto(conFoto, borradorDelGasto(conFoto), true)[0]).toMatchObject({ antes: "con foto", ahora: "otra foto" });
  });
  it("el botón dice cuántos cambios guarda", () => {
    expect(fraseCorregirGasto(0)).toBe("Guardar cambios");
    expect(fraseCorregirGasto(1)).toBe("Guardar 1 cambio");
    expect(fraseCorregirGasto(3)).toBe("Guardar 3 cambios");
  });
  it("arma lo que se manda, con la foto solo si es nueva", () => {
    expect(argumentosParaCorregir(g, { concepto: "comida", nota: "", monto: "14" }, "lote", "gastos/x.jpg")).toEqual({
      p_gasto_id: "g1",
      p_lote: "lote",
      p_concepto: "comida",
      p_nota: null,
      p_monto: 14,
      p_foto_ruta: "gastos/x.jpg",
    });
    expect(argumentosParaCorregir(g, borradorDelGasto(g), "lote", null).p_foto_ruta).toBeNull();
  });
});

describe("el rastro del gasto", () => {
  it("se lee con el mismo formato que el de las compras y cada dato se dice en una frase", () => {
    const lista = leerCorrecciones([
      {
        lote: "l1",
        cuando: "2026-10-29T16:00:00Z",
        quien: "Micaela",
        cambios: [
          { campo: "monto", antes: "4.00", despues: "14.00", prenda: null },
          { campo: "concepto", antes: "comida", despues: "otro", prenda: null },
          { campo: "nota", antes: null, despues: "Saco de piñata", prenda: null },
          { campo: "foto", antes: null, despues: "foto", prenda: null },
        ],
      },
    ]);
    expect(lista).toHaveLength(1);
    expect(lista[0]!.cambios.map(textoDeCambioGasto)).toEqual([
      `cuánto fue: ${soles(4)} → ${soles(14)}`,
      "en qué gastó: Comida → Otro",
      "qué fue: nada → Saco de piñata",
      "foto del papel: sin foto → con foto",
    ]);
  });
});
