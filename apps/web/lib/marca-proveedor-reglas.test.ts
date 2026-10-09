import { describe, expect, it } from "vitest";
import {
  alElegirMarca,
  alElegirProveedor,
  opcionesDeMarca,
  opcionesDeProveedor,
  ordenarPorNombre,
  parejaYaExiste,
  pideDejarVacio,
  queVaciar,
  problemaAlEditar,
  registroListo,
  textoLoQueFalta,
  textoQuienLaTrae,
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

// ---------- marca y proveedor por separado (ADR-0283) ----------

describe("alElegirMarca / alElegirProveedor", () => {
  const nada = { marcaId: "", proveedorId: "" };

  it("una marca que trae un solo proveedor lo pone sola", () => {
    const r = alElegirMarca(nada, "m-kris", vinculos.filter((v) => v.proveedorId !== "p-baja"));
    expect(r).toEqual({ pareja: { marcaId: "m-kris", proveedorId: "p-jacard" }, solto: null, puestoSolo: "proveedor" });
  });

  it("una marca con varios proveedores NO elige ninguno: es de la persona", () => {
    const r = alElegirMarca(nada, "m-cayla", vinculos);
    expect(r.pareja).toEqual({ marcaId: "m-cayla", proveedorId: "" });
    expect(r.puestoSolo).toBeNull();
  });

  it("una marca sin nadie que la traiga queda sola, sin proveedor", () => {
    expect(alElegirMarca(nada, "m-sola", vinculos).pareja).toEqual({ marcaId: "m-sola", proveedorId: "" });
  });

  it("un proveedor que trae una sola marca la pone sola; con varias, no", () => {
    expect(alElegirProveedor(nada, "p-taller", vinculos.filter((v) => v.marcaId !== "m-cayla")).pareja).toEqual({ marcaId: "m-aurora", proveedorId: "p-taller" });
    const varias = alElegirProveedor(nada, "p-jacard", vinculos);
    expect(varias.pareja).toEqual({ marcaId: "", proveedorId: "p-jacard" });
    expect(varias.puestoSolo).toBeNull();
  });

  it("elegir una marca que el proveedor de hoy no trae SUELTA el proveedor (nunca una pareja imposible)", () => {
    const r = alElegirMarca({ marcaId: "", proveedorId: "p-jacard" }, "m-aurora", vinculos);
    expect(r.solto).toBe("proveedor");
    // Ábaco la trae Taller Lima (uno solo): se pone ese, y se dice que fue solo.
    expect(r.pareja).toEqual({ marcaId: "m-aurora", proveedorId: "p-taller" });
    expect(r.puestoSolo).toBe("proveedor");
  });

  it("elegir una marca que el proveedor de hoy SÍ trae no lo toca", () => {
    const r = alElegirMarca({ marcaId: "", proveedorId: "p-jacard" }, "m-cayla", vinculos);
    expect(r).toEqual({ pareja: { marcaId: "m-cayla", proveedorId: "p-jacard" }, solto: null, puestoSolo: null });
  });

  it("quitar un campo no toca el otro", () => {
    const los2 = { marcaId: "m-cayla", proveedorId: "p-jacard" };
    expect(alElegirMarca(los2, "", vinculos).pareja).toEqual({ marcaId: "", proveedorId: "p-jacard" });
    expect(alElegirProveedor(los2, "", vinculos).pareja).toEqual({ marcaId: "m-cayla", proveedorId: "" });
  });

  it("el proveedor elegido que no trae la marca de hoy suelta la marca", () => {
    const r = alElegirProveedor({ marcaId: "m-aurora", proveedorId: "" }, "p-jacard", vinculos);
    expect(r.solto).toBe("marca");
    expect(r.pareja.proveedorId).toBe("p-jacard");
  });
});

describe("opcionesDeMarca / opcionesDeProveedor", () => {
  it("sin nada elegido ofrecen todo, A-Z, y dicen quién la trae / qué trae", () => {
    const marcasOp = opcionesDeMarca(marcas, proveedores, vinculos, "");
    expect(marcasOp.map((o) => o.texto)).toEqual(["Ábaco", "CAYLA", "Krisstell", "Sin nadie"]);
    expect(marcasOp.find((o) => o.texto === "CAYLA")?.detalle).toBe("la trae Taller Lima, Jacard");
    expect(marcasOp.find((o) => o.texto === "Sin nadie")?.detalle).toBeUndefined();
    const provOp = opcionesDeProveedor(marcas, proveedores, vinculos, "");
    expect(provOp.map((o) => o.texto)).toEqual(["Jacard", "Taller Lima"]);
    expect(provOp.find((o) => o.texto === "Jacard")?.detalle).toBe("trae Krisstell, CAYLA");
  });

  it("con proveedor elegido, primero las marcas que él trae y después las demás; con marca elegida, primero quienes la traen", () => {
    expect(opcionesDeMarca(marcas, proveedores, vinculos, "p-taller").map((o) => o.texto)).toEqual(["Ábaco", "CAYLA", "Krisstell", "Sin nadie"]);
    expect(opcionesDeProveedor(marcas, proveedores, vinculos, "m-kris").map((o) => o.texto)).toEqual(["Jacard", "Taller Lima"]);
  });

  it("con los dos ya guardados se puede pasar a otra pareja sin nada en común (2026-10-09, «SIN PROVEEDOR» · «-»)", () => {
    const ms = [...marcas, { id: "m-sinprov", nombre: "SIN PROVEEDOR" }];
    const ps = [...proveedores, { id: "p-guion", nombre: "-" }];
    const vs = [...vinculos, { marcaId: "m-sinprov", proveedorId: "p-guion" }];
    const guardado = { marcaId: "m-sinprov", proveedorId: "p-guion" };
    // Las dos listas ofrecen lo que no tiene que ver con lo guardado…
    expect(opcionesDeMarca(ms, ps, vs, guardado.proveedorId).map((o) => o.valor)).toContain("m-kris");
    expect(opcionesDeProveedor(ms, ps, vs, guardado.marcaId).map((o) => o.valor)).toContain("p-jacard");
    // …y elegirla suelta el otro campo y lo completa solo si queda uno: la pareja queda válida y se puede guardar.
    const r = alElegirMarca(guardado, "m-aurora", vs);
    expect(r).toEqual({ pareja: { marcaId: "m-aurora", proveedorId: "p-taller" }, solto: "proveedor", puestoSolo: "proveedor" });
    expect(problemaAlEditar(guardado, r.pareja)).toBeNull();
  });

  it("conserva lo ya guardado aunque hoy no venga en las listas activas (una marca desactivada)", () => {
    const op = opcionesDeMarca(marcas, proveedores, vinculos, "", { id: "m-vieja", nombre: "Vieja" });
    expect(op.some((o) => o.valor === "m-vieja")).toBe(true);
  });

  it("recorta a «+N» cuando una marca la traen muchos", () => {
    const muchos = [
      { id: "p1", nombre: "A" },
      { id: "p2", nombre: "B" },
      { id: "p3", nombre: "C" },
    ];
    const v = muchos.map((p) => ({ marcaId: "m-cayla", proveedorId: p.id }));
    expect(opcionesDeMarca(marcas, muchos, v, "").find((o) => o.texto === "CAYLA")?.detalle).toBe("la trae A, B +1");
  });
});

describe("problemaAlEditar (regla «no empeora»)", () => {
  const vacio = { marcaId: "", proveedorId: "" };
  it("completar lo que faltaba se puede", () => {
    expect(problemaAlEditar(vacio, { marcaId: "m-cayla", proveedorId: "" })).toBeNull();
    expect(problemaAlEditar(vacio, vacio)).toBeNull();
  });
  it("cambiar por otro se puede", () => {
    expect(problemaAlEditar({ marcaId: "a", proveedorId: "b" }, { marcaId: "c", proveedorId: "d" })).toBeNull();
  });
  it("dejar en blanco lo que ya había no se puede, y el mensaje dice qué", () => {
    expect(problemaAlEditar({ marcaId: "a", proveedorId: "b" }, { marcaId: "", proveedorId: "b" })).toMatch(/tenía marca/);
    expect(problemaAlEditar({ marcaId: "a", proveedorId: "b" }, { marcaId: "a", proveedorId: "" })).toMatch(/tenía proveedor/);
    expect(problemaAlEditar({ marcaId: "a", proveedorId: "b" }, vacio)).toMatch(/marca y proveedor/);
  });
});

describe("textoLoQueFalta", () => {
  it("dice exactamente qué falta, y nada si está completo", () => {
    expect(textoLoQueFalta(null, null)).toBe("Sin marca ni proveedor");
    expect(textoLoQueFalta(null, "Jacard")).toBe("Sin marca");
    expect(textoLoQueFalta("CAYLA", "")).toBe("Sin proveedor");
    expect(textoLoQueFalta("CAYLA", "Jacard")).toBeNull();
  });
});

describe("pideDejarVacio («sin proveedor» no es un nombre, 2026-10-09)", () => {
  it("reconoce las formas de decir «no hay»", () => {
    for (const t of ["SIN PROVEEDOR", "sin marca", "Sin marca ni proveedor", "  sin  ", "-", "--", ".", "?", "x", "s/m", "S/P", "N/A", "na", "ninguno", "Ninguna", "Ningún proveedor", "nada", "no tiene", "no sé", "vacío", "por definir", "desconocido"])
      expect(pideDejarVacio(t), t).toBe(true);
  });
  it("no toca nombres de verdad (los del catálogo de producción incluidos)", () => {
    for (const t of ["", "CAYLA", "Sin Límites", "Sinfonía", "Nada Igual Store", "Xiomara", "3.20 Store", "y.j.j", "Y.J.J", "Ivanana", "Sol y Luna", "Moda Mia", "Novata Brand", "Industrias GC SAC", "NA-KD"])
      expect(pideDejarVacio(t), t).toBe(false);
  });
  it("registroListo no deja registrar una marca o un proveedor así", () => {
    expect(registroListo({ nombre: "SIN PROVEEDOR", existe: false }, { tipo: "existente", nombre: "Jacard" })).toBe(false);
    expect(registroListo({ nombre: "Aurora", existe: false }, { tipo: "nuevo", razonSocial: "-" })).toBe(false);
    expect(registroListo({ nombre: "Aurora", existe: false }, { tipo: "nuevo", razonSocial: "Textil Andina SAC" })).toBe(true);
  });
});

describe("queVaciar («Dejar sin …», 2026-10-09)", () => {
  const vacio = { marcaId: "", proveedorId: "" };
  it("nada si lo escrito es un nombre", () => {
    expect(queVaciar("Kysem", "marca", vacio)).toBeNull();
  });
  it("vacía el campo donde se escribió", () => {
    expect(queVaciar("ninguno", "proveedor", vacio)).toMatchObject({ marca: false, proveedor: true, texto: "Dejar sin proveedor", bloqueado: [] });
    expect(queVaciar("-", "marca", vacio)).toMatchObject({ marca: true, proveedor: false, texto: "Dejar sin marca" });
  });
  it("«sin proveedor» escrito en Marca (lo que pasó) o «sin marca ni proveedor» vacían los dos", () => {
    expect(queVaciar("SIN PROVEEDOR", "marca", vacio)).toMatchObject({ marca: true, proveedor: true, texto: "Dejar sin marca ni proveedor" });
    expect(queVaciar("sin marca ni proveedor", "proveedor", vacio)).toMatchObject({ marca: true, proveedor: true });
    expect(queVaciar("s/m", "proveedor", vacio)).toMatchObject({ marca: true, proveedor: true });
  });
  it("al editar, lo ya guardado no se vacía y la opción lo dice", () => {
    const guardado = { marcaId: "m-x", proveedorId: "p-x" };
    expect(queVaciar("sin proveedor", "marca", guardado)).toMatchObject({ marca: false, proveedor: false, bloqueado: ["marca", "proveedor"], texto: "No se puede dejar sin marca ni proveedor" });
    expect(queVaciar("sin proveedor", "marca", { marcaId: "m-x", proveedorId: "" })).toMatchObject({ marca: false, proveedor: true, texto: "Dejar sin proveedor", detalle: "la marca ya estaba guardada y se queda" });
  });
});
