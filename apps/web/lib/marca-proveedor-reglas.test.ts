import { describe, expect, it } from "vitest";
import {
  cuantasMarcas,
  opcionesDeParejas,
  ordenarPorNombre,
  parejaYaExiste,
  registroListo,
  separarPareja,
  textoQuienLaTrae,
  valorPareja,
} from "./marca-proveedor-reglas";

const marcas = [
  { id: "m-cayla", nombre: "CAYLA" },
  { id: "m-aurora", nombre: "Ábaco" },
  { id: "m-kris", nombre: "Krisstell" },
  { id: "m-sola", nombre: "Sin nadie" },
];
const proveedores = [
  { id: "p-taller", nombre: "Taller Lima" },
  { id: "p-jacard", nombre: "Jacard" },
];
const vinculos = [
  { marcaId: "m-kris", proveedorId: "p-jacard" },
  { marcaId: "m-cayla", proveedorId: "p-taller" },
  { marcaId: "m-cayla", proveedorId: "p-jacard" },
  { marcaId: "m-aurora", proveedorId: "p-taller" },
  // Proveedor desactivado (no viene en la lista): la pareja no se ofrece.
  { marcaId: "m-kris", proveedorId: "p-baja" },
];

describe("opcionesDeParejas", () => {
  it("una fila por pareja, A-Z por marca (sin distinguir tildes) y luego por proveedor", () => {
    const ops = opcionesDeParejas(marcas, proveedores, vinculos);
    expect(ops.map((o) => `${o.texto} · ${o.detalle}`)).toEqual([
      "Ábaco · la trae Taller Lima",
      "CAYLA · la trae Jacard",
      "CAYLA · la trae Taller Lima",
      "Krisstell · la trae Jacard",
    ]);
  });

  it("no ofrece parejas con marca o proveedor fuera de las listas, ni repite una pareja", () => {
    const ops = opcionesDeParejas(marcas, proveedores, [...vinculos, { marcaId: "m-cayla", proveedorId: "p-taller" }]);
    expect(ops).toHaveLength(4);
    expect(ops.some((o) => o.valor.includes("p-baja"))).toBe(false);
  });

  it("el valor se separa en los dos ids", () => {
    expect(separarPareja(valorPareja("m-1", "p-2"))).toEqual({ marcaId: "m-1", proveedorId: "p-2" });
  });

  it("cuenta marcas distintas, no parejas", () => {
    expect(cuantasMarcas(opcionesDeParejas(marcas, proveedores, vinculos))).toBe(3);
  });
});

describe("ordenarPorNombre", () => {
  it("ordena como se lee en castellano", () => {
    expect(ordenarPorNombre(marcas).map((m) => m.nombre)).toEqual(["Ábaco", "CAYLA", "Krisstell", "Sin nadie"]);
  });
});

describe("textoQuienLaTrae", () => {
  it("singular, plural y nadie", () => {
    expect(textoQuienLaTrae(["Taller Lima"])).toBe("Hoy la trae Taller Lima");
    expect(textoQuienLaTrae(["Taller Lima", "Jacard"])).toBe("Hoy la traen Taller Lima, Jacard");
    expect(textoQuienLaTrae([])).toBe("Todavía no la trae nadie");
  });
});

describe("registrar marca o proveedor: cuándo se puede", () => {
  const cayla = { nombre: "CAYLA", existe: true as const, proveedores: ["Taller Lima"] };
  const nueva = { nombre: "Luna Azul", existe: false as const };

  it("marca nueva + proveedor que existe", () => {
    expect(registroListo(nueva, { tipo: "existente", nombre: "Jacard" })).toBe(true);
  });

  it("marca nueva + proveedor nuevo: hace falta la razón social", () => {
    expect(registroListo(nueva, { tipo: "nuevo", razonSocial: "  " })).toBe(false);
    expect(registroListo(nueva, { tipo: "nuevo", razonSocial: "Textil Andina SAC" })).toBe(true);
  });

  it("marca que existe + un proveedor más", () => {
    expect(registroListo(cayla, { tipo: "existente", nombre: "Jacard" })).toBe(true);
    expect(registroListo(cayla, { tipo: "nuevo", razonSocial: "Textil Andina SAC" })).toBe(true);
  });

  it("marca que existe + un proveedor que YA la trae: repetida, no se registra", () => {
    const quien = { tipo: "existente" as const, nombre: "Taller Lima" };
    expect(parejaYaExiste(cayla, quien)).toBe(true);
    expect(registroListo(cayla, quien)).toBe(false);
    // Una marca nueva nunca está repetida.
    expect(parejaYaExiste(nueva, quien)).toBe(false);
  });

  it("sin marca, sin proveedor o con una pregunta pendiente, no", () => {
    expect(registroListo(null, { tipo: "existente", nombre: "Jacard" })).toBe(false);
    expect(registroListo(nueva, null)).toBe(false);
    expect(registroListo(nueva, { tipo: "existente", nombre: "Jacard" }, 1)).toBe(false);
  });
});
