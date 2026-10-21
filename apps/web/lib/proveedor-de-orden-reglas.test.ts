import { describe, expect, it } from "vitest";
import {
  argsRegistrarProveedor,
  avisoDelRegistro,
  borradorDesdeLoTipeado,
  camposDeProveedorNuevo,
  leerProveedorRegistrado,
  mensajeDeRegistroProveedor,
  problemaDelCelular,
  problemaDelNombre,
  problemaDelRuc,
  TOPE_NOMBRE_PROVEEDOR,
  type BorradorProveedor,
} from "./proveedor-de-orden-reglas";

// Un RUC con dígito verificador válido (de una empresa, dato público; nunca el de una persona: un RUC 10… lleva su DNI).
const RUC_OK = "20100070970";
const base: BorradorProveedor = { nombre: "Textiles del Sur SAC", ruc: RUC_OK, sinRuc: false, celular: "" };

describe("lo escrito en la hoja", () => {
  it("el nombre: obligatorio y hasta 120 letras", () => {
    expect(problemaDelNombre("")).toBe("Escribe el nombre del proveedor.");
    expect(problemaDelNombre("   ")).toBe("Escribe el nombre del proveedor.");
    expect(problemaDelNombre("x".repeat(TOPE_NOMBRE_PROVEEDOR + 1))).toContain("120");
    expect(problemaDelNombre("x".repeat(TOPE_NOMBRE_PROVEEDOR))).toBeNull();
  });
  it("el RUC: obligatorio salvo «No tiene RUC», y con su dígito verificador", () => {
    expect(problemaDelRuc("", false)).toBe("Escribe el RUC o marca «No tiene RUC».");
    expect(problemaDelRuc("", true)).toBeNull();
    expect(problemaDelRuc("abc", true)).toBeNull(); // con «No tiene RUC» lo que haya escrito no se juzga
    expect(problemaDelRuc("2010007097", false)).not.toBeNull(); // 10 dígitos
    expect(problemaDelRuc("20100070971", false)).not.toBeNull(); // dígito verificador malo
    expect(problemaDelRuc(RUC_OK, false)).toBeNull();
    expect(problemaDelRuc("20 100 070 970", false)).toBeNull(); // con espacios
  });
  it("el celular: opcional; escrito, 9 dígitos que empiezan con 9 (acepta +51 y espacios)", () => {
    expect(problemaDelCelular("")).toBeNull();
    expect(problemaDelCelular("987 654 321")).toBeNull();
    expect(problemaDelCelular("+51 987 654 321")).toBeNull();
    expect(problemaDelCelular("887654321")).toBe("El celular tiene 9 dígitos y empieza con 9.");
    expect(problemaDelCelular("98765")).toBe("El celular tiene 9 dígitos y empieza con 9.");
  });
});

describe("camposDeProveedorNuevo: la guía de la hoja", () => {
  it("con RUC: UN campo «RUC y nombre» (la consulta los pinta juntos) y el WhatsApp solo si se escribió", () => {
    const campos = camposDeProveedorNuevo(base);
    expect(campos.map((c) => c.id)).toEqual(["ruc", "celular"]);
    expect(campos[0]!.hecho).toBe(true);
    const celular = campos.find((c) => c.id === "celular")!;
    expect(celular.requerido).toBe(false); // opcional vacío: no se lista como «falta» ni lleva ✓
    expect(celular.hecho).toBe(false);
  });
  it("«RUC y nombre» dice lo primero que falta: el RUC, y recién ahí el nombre", () => {
    expect(camposDeProveedorNuevo({ ...base, ruc: "" })[0]!.pendiente).toBe("Escribe el RUC o marca «No tiene RUC».");
    expect(camposDeProveedorNuevo({ ...base, nombre: "" })[0]).toMatchObject({ hecho: false, pendiente: "Escribe el nombre del proveedor." });
  });
  it("con «No tiene RUC» el campo es solo el nombre", () => {
    const campos = camposDeProveedorNuevo({ ...base, ruc: "", sinRuc: true });
    expect(campos.map((c) => c.id)).toEqual(["nombre", "celular"]);
    expect(campos[0]!.hecho).toBe(true);
  });
  it("un RUC que ya es de otro proveedor no cuenta como hecho y dice qué hacer", () => {
    const ruc = camposDeProveedorNuevo(base, { rucYaRegistrado: true })[0]!;
    expect(ruc.hecho).toBe(false);
    expect(ruc.pendiente).toBe("Ese RUC ya está registrado: elige a ese proveedor.");
  });
  it("una pregunta «¿no será uno que ya tienes?» sin contestar bloquea, con o sin RUC", () => {
    expect(camposDeProveedorNuevo(base, { preguntaPendiente: true })[0]).toMatchObject({ hecho: false, pendiente: "Contesta si es uno que ya tienes." });
    expect(camposDeProveedorNuevo({ ...base, ruc: "", sinRuc: true }, { preguntaPendiente: true })[0]).toMatchObject({ hecho: false, pendiente: "Contesta si es uno que ya tienes." });
  });
  it("un celular mal escrito bloquea (se vuelve requerido); bien escrito lleva ✓", () => {
    const mal = camposDeProveedorNuevo({ ...base, celular: "123" }).find((c) => c.id === "celular")!;
    expect(mal.requerido).toBe(true);
    expect(mal.hecho).toBe(false);
    const bien = camposDeProveedorNuevo({ ...base, celular: "987654321" }).find((c) => c.id === "celular")!;
    expect(bien.hecho).toBe(true);
  });
  it("coincide con lo que la función de la base acepta: lo que la guía da por hecho, la base lo deja pasar", () => {
    // La base exige: nombre, RUC de 11 dígitos o «sin RUC» (nunca los dos), celular de 9 dígitos que empieza con 9.
    const casos: BorradorProveedor[] = [
      base,
      { ...base, ruc: "", sinRuc: true },
      { ...base, celular: "+51 987 654 321" },
      { ...base, nombre: " " },
      { ...base, ruc: "" },
      { ...base, celular: "12" },
    ];
    for (const c of casos) {
      const listo = camposDeProveedorNuevo(c).every((x) => !x.requerido || x.hecho);
      const args = argsRegistrarProveedor(c);
      const baseAcepta =
        args.p_nombre.length > 0 &&
        args.p_nombre.length <= 120 &&
        (args.p_sin_ruc ? args.p_ruc === null : args.p_ruc !== null && /^\d{11}$/.test(args.p_ruc)) &&
        (args.p_celular === null || /^9\d{8}$/.test(args.p_celular));
      if (listo) expect(baseAcepta, JSON.stringify(c)).toBe(true);
    }
  });
});

describe("argsRegistrarProveedor", () => {
  it("limpia el nombre, deja el RUC con dígitos y normaliza el celular", () => {
    expect(argsRegistrarProveedor({ nombre: "  Textiles   del  Sur ", ruc: "20 100 070 970", sinRuc: false, celular: "+51 987 654 321" })).toEqual({
      p_nombre: "Textiles del Sur",
      p_ruc: RUC_OK,
      p_sin_ruc: false,
      p_celular: "987654321",
    });
  });
  it("con «No tiene RUC» manda el RUC en null aunque haya algo escrito; sin celular, null", () => {
    expect(argsRegistrarProveedor({ nombre: "Puesto 14", ruc: "20100070970", sinRuc: true, celular: "  " })).toEqual({
      p_nombre: "Puesto 14",
      p_ruc: null,
      p_sin_ruc: true,
      p_celular: null,
    });
  });
});

describe("leerProveedorRegistrado", () => {
  it("lee la fila que devuelve la función", () => {
    expect(leerProveedorRegistrado([{ proveedor_id: "p1", proveedor_nombre: "X", proveedor_ruc: RUC_OK, ya_existia: false }])).toEqual({ id: "p1", nombre: "X", ruc: RUC_OK, yaExistia: false });
    expect(leerProveedorRegistrado([{ proveedor_id: "p1", proveedor_nombre: "X", proveedor_ruc: null, ya_existia: true }])).toEqual({ id: "p1", nombre: "X", ruc: null, yaExistia: true });
  });
  it("una respuesta que no tiene esa forma es null (no se inventa un proveedor)", () => {
    for (const mala of [null, undefined, [], {}, [{}], [{ proveedor_id: 3 }], "x"]) expect(leerProveedorRegistrado(mala)).toBeNull();
  });
});

describe("mensajeDeRegistroProveedor", () => {
  it("la web antes que la migración: dice que todavía no está disponible", () => {
    expect(mensajeDeRegistroProveedor({ code: "PGRST202", message: "x" })).toContain("todavía no está disponible");
  });
  it("sin el módulo, lo dice con su camino", () => {
    expect(mensajeDeRegistroProveedor({ code: "42501", hint: "ordenes_compra_sin_modulo", message: "x" })).toContain("Tu rol no puede registrar proveedores");
  });
  it("los rechazos de la función ya traen su frase y se muestran tal cual", () => {
    for (const hint of ["proveedor_nombre_en_uso", "proveedor_desactivado", "proveedor_ruc_invalido", "proveedor_celular_invalido"]) {
      expect(mensajeDeRegistroProveedor({ code: "P0001", hint, message: `frase de ${hint}` })).toBe(`frase de ${hint}`);
    }
  });
  it("un corte de señal no asusta: reintentar no duplica", () => {
    expect(mensajeDeRegistroProveedor({ code: "", message: "Failed to fetch" })).toContain("no se duplica");
  });
});

describe("avisoDelRegistro", () => {
  it("uno nuevo: dice que quedó con lo básico", () => {
    const a = avisoDelRegistro({ id: "p", nombre: "Textiles del Sur SAC", ruc: RUC_OK, yaExistia: false }, base);
    expect(a.titulo).toBe("«Textiles del Sur SAC» registrado");
    expect(a.detalle).toContain("datos de pago");
  });
  it("uno que ya estaba: lo dice y lo elige, sin detalle si el RUC coincide", () => {
    const a = avisoDelRegistro({ id: "p", nombre: "Textiles del Sur SAC", ruc: RUC_OK, yaExistia: true }, base);
    expect(a.titulo).toContain("ya estaba registrado");
    expect(a.detalle).toBeUndefined();
  });
  it("uno que ya estaba SIN el RUC que se escribió: no se descarta en silencio", () => {
    const a = avisoDelRegistro({ id: "p", nombre: "Textiles del Sur SAC", ruc: null, yaExistia: true }, base);
    expect(a.detalle).toContain("no tiene tu RUC");
  });
  it("con «No tiene RUC» no se compara el RUC", () => {
    expect(avisoDelRegistro({ id: "p", nombre: "Puesto 14", ruc: null, yaExistia: true }, { ...base, ruc: "", sinRuc: true }).detalle).toBeUndefined();
  });
});

describe("borradorDesdeLoTipeado", () => {
  it("un RUC de 11 dígitos abre la hoja con el RUC puesto y sin nombre", () => {
    expect(borradorDesdeLoTipeado(RUC_OK)).toMatchObject({ ruc: RUC_OK, nombre: "" });
    expect(borradorDesdeLoTipeado(" 20100070970 ")).toMatchObject({ ruc: RUC_OK, nombre: "" });
  });
  it("cualquier otra cosa abre la hoja con el nombre puesto", () => {
    expect(borradorDesdeLoTipeado("Textiles del Sur")).toMatchObject({ ruc: "", nombre: "Textiles del Sur" });
    expect(borradorDesdeLoTipeado("Puesto 2010007097")).toMatchObject({ ruc: "", nombre: "Puesto 2010007097" });
    expect(borradorDesdeLoTipeado("")).toMatchObject({ ruc: "", nombre: "" });
  });
});
