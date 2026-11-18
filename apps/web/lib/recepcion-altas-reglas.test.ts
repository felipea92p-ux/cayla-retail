import { describe, expect, it } from "vitest";
import { validarDocumento } from "@cayla-retail/shared";
import {
  argsProveedorRecepcion,
  avisoProveedorRecepcion,
  camposMarcaRecepcion,
  camposProveedorRecepcion,
  conAltas,
  conMarca,
  conProveedor,
  leerMarcaRegistrada,
  mensajeAltaRecepcion,
  problemaDelNombreDeMarca,
  problemaDelRucOpcional,
  SIN_ALTAS,
} from "./recepcion-altas-reglas";

// Un RUC válido inventado: los diez primeros dígitos fijos y el verificador que lo hace pasar (no es de una empresa real).
const RUC = (() => {
  for (let d = 0; d <= 9; d++) if (validarDocumento("ruc", `2077712345${d}`).valido) return `2077712345${d}`;
  throw new Error("sin verificador");
})();
const RUC_MALO = `${RUC.slice(0, 10)}${(Number(RUC[10]) + 1) % 10}`;

describe("la hoja del proveedor nuevo (razón social y RUC opcional)", () => {
  it("el RUC es opcional: vacío no falta; escrito, tiene que ser un RUC de verdad", () => {
    expect(problemaDelRucOpcional("")).toBeNull();
    expect(problemaDelRucOpcional("   ")).toBeNull();
    expect(problemaDelRucOpcional(RUC)).toBeNull();
    expect(problemaDelRucOpcional("123")).not.toBeNull();
    expect(problemaDelRucOpcional(RUC_MALO)).not.toBeNull();
  });

  it("la guía pide solo la razón social; el RUC cuenta si se escribió", () => {
    const sinNada = camposProveedorRecepcion({ nombre: "", ruc: "" });
    expect(sinNada.filter((c) => c.requerido).map((c) => c.id)).toEqual(["razon-social"]);
    expect(sinNada.find((c) => c.id === "razon-social")?.hecho).toBe(false);

    const soloNombre = camposProveedorRecepcion({ nombre: "Hilos del Sur", ruc: "" });
    expect(soloNombre.every((c) => !c.requerido || c.hecho)).toBe(true);

    const rucMalo = camposProveedorRecepcion({ nombre: "Hilos del Sur", ruc: "123" });
    expect(rucMalo.find((c) => c.id === "ruc")).toMatchObject({ requerido: true, hecho: false });

    expect(camposProveedorRecepcion({ nombre: "Hilos del Sur", ruc: RUC }, { rucYaRegistrado: true }).find((c) => c.id === "ruc")?.hecho).toBe(false);
    expect(camposProveedorRecepcion({ nombre: "Hilos del Sur", ruc: "" }, { preguntaPendiente: true }).find((c) => c.id === "razon-social")?.hecho).toBe(false);
  });

  it("a la base va la razón social sin espacios de más y el RUC solo con dígitos, o null", () => {
    expect(argsProveedorRecepcion({ nombre: "  Hilos   del Sur ", ruc: "" })).toEqual({ p_nombre: "Hilos del Sur", p_ruc: null });
    expect(argsProveedorRecepcion({ nombre: "Hilos del Sur", ruc: `${RUC.slice(0, 5)} ${RUC.slice(5)}` })).toEqual({ p_nombre: "Hilos del Sur", p_ruc: RUC });
  });

  it("si ya estaba, lo dice; y si su ficha no tiene el RUC escrito, también", () => {
    expect(avisoProveedorRecepcion({ nombre: "Hilos del Sur", ruc: null, yaExistia: false }, { nombre: "Hilos del Sur", ruc: "" })).toEqual({ titulo: "«Hilos del Sur» registrado" });
    expect(avisoProveedorRecepcion({ nombre: "Hilos del Sur", ruc: null, yaExistia: true }, { nombre: "x", ruc: RUC }).detalle).toMatch(/no tiene ese RUC/);
    expect(avisoProveedorRecepcion({ nombre: "Hilos del Sur", ruc: RUC, yaExistia: true }, { nombre: "x", ruc: RUC }).detalle).toBeUndefined();
  });
});

describe("la hoja de la marca nueva", () => {
  it("el nombre va de 2 a 60 letras, sin contar espacios de más", () => {
    expect(problemaDelNombreDeMarca(" a ")).not.toBeNull();
    expect(problemaDelNombreDeMarca("Mora")).toBeNull();
    expect(problemaDelNombreDeMarca("x".repeat(61))).not.toBeNull();
  });

  it("la guía pide el nombre y quién la trae; la pregunta sin contestar también falta", () => {
    expect(camposMarcaRecepcion("Mora", "").find((c) => c.id === "marca-proveedor")?.hecho).toBe(false);
    expect(camposMarcaRecepcion("Mora", "p1").every((c) => c.hecho)).toBe(true);
    expect(camposMarcaRecepcion("Mora", "p1", { preguntaPendiente: true }).find((c) => c.id === "marca-nombre")?.hecho).toBe(false);
  });

  it("lee lo que devuelve la base, o null si no tiene forma", () => {
    expect(leerMarcaRegistrada({ id: "m1", nombre: "Mora", nueva: true })).toEqual({ id: "m1", nombre: "Mora", nueva: true });
    expect(leerMarcaRegistrada({ id: "m1" })).toBeNull();
    expect(leerMarcaRegistrada(null)).toBeNull();
  });
});

describe("lo creado en la visita entra a las listas", () => {
  const catalogo = { otro: 1, marcas: [{ id: "b", nombre: "Brisa" }], vinculos: [{ marcaId: "b", proveedorId: "p1" }] };

  it("sin altas, el catálogo es el mismo (y null sigue null)", () => {
    expect(conAltas(catalogo, SIN_ALTAS)).toBe(catalogo);
    expect(conAltas(null, conMarca(SIN_ALTAS, { marca: { id: "m", nombre: "Mora" }, proveedor: { id: "p2", nombre: "Hilos" } }))).toBeNull();
  });

  it("la marca nueva entra en orden, con su vínculo una sola vez, y su proveedor a la lista", () => {
    const r = { marca: { id: "a", nombre: "Aurora" }, proveedor: { id: "p2", nombre: "Hilos del Sur" } };
    const altas = conMarca(conMarca(SIN_ALTAS, r), r);
    expect(altas.vinculos).toEqual([{ marcaId: "a", proveedorId: "p2" }]);
    expect(altas.proveedores.map((p) => p.id)).toEqual(["p2"]);
    const vivo = conAltas(catalogo, altas)!;
    expect(vivo.marcas.map((m) => m.nombre)).toEqual(["Aurora", "Brisa"]);
    expect(vivo.vinculos).toHaveLength(2);
    expect(vivo.otro).toBe(1);
  });

  it("a una marca que ya estaba solo se le suma el vínculo nuevo", () => {
    const vivo = conAltas(catalogo, conMarca(SIN_ALTAS, { marca: { id: "b", nombre: "Brisa" }, proveedor: { id: "p2", nombre: "Hilos" } }))!;
    expect(vivo.marcas).toHaveLength(1);
    expect(vivo.vinculos).toEqual([{ marcaId: "b", proveedorId: "p1" }, { marcaId: "b", proveedorId: "p2" }]);
  });

  it("un proveedor no se repite", () => {
    expect(conProveedor(conProveedor(SIN_ALTAS, { id: "p2", nombre: "Hilos" }), { id: "p2", nombre: "Hilos" }).proveedores).toHaveLength(1);
  });
});

describe("lo que se dice cuando no se pudo", () => {
  it("la web antes que la migración, sin el módulo, sin quién recibe y los rechazos con su frase", () => {
    expect(mensajeAltaRecepcion({ code: "PGRST202", message: "" }, "el proveedor")).toMatch(/todavía no está disponible/);
    expect(mensajeAltaRecepcion({ message: "x", hint: "recibir_sin_modulo" }, "la marca")).toMatch(/Tu rol no puede crear la marca/);
    expect(mensajeAltaRecepcion({ message: "x", hint: "responsable_requerido" }, "la marca")).toMatch(/quién recibe/);
    expect(mensajeAltaRecepcion({ message: "El RUC tiene 11 dígitos.", hint: "proveedor_ruc_invalido" }, "el proveedor")).toBe("El RUC tiene 11 dígitos.");
    expect(mensajeAltaRecepcion({ message: "Escribe…", hint: "marca_nombre" }, "la marca")).toBe("Escribe…");
  });
});
