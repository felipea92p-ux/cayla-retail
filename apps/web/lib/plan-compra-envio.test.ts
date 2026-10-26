import { describe, expect, it } from "vitest";
import {
  MOTIVOS_DE_RECTIFICACION,
  PEDIR_YA,
  argsEnviar,
  argsRectificar,
  bloqueoDelGrupo,
  conCuando,
  delTaller,
  estadoDeLosGrupos,
  fechaSugerida,
  fraseDeCuando,
  frasesDeEnCompras,
  leerEnvio,
  leerEnvios,
  llegaTarde,
  paso2PorRevisar,
  porEnviar,
  problemaDeLaFecha,
  queNoSeEnvia,
  resumenParaLaFila,
  type BaseDeEnvio,
  type GrupoDeEnvio,
  type PedidoEnviado,
} from "./plan-compra-envio";

// Lo que devuelve la base, con la forma de verdad (ver `fn_plan_compra_envio`).
const linea = (modelo: string, color: string, colorNombre: string, talla: string | null, n: number) => ({
  producto_id: `p-${modelo}`,
  modelo,
  marca_id: "m1",
  marca: "Marca 1",
  color,
  color_nombre: colorNombre,
  talla_id: talla ? `t-${talla}` : null,
  talla,
  n,
});
const grupoCrudo = (proveedorId: string, proveedor: string, extra: Record<string, unknown> = {}) => ({
  proveedor_id: proveedorId,
  proveedor,
  proveedor_activo: true,
  es_taller: false,
  marcas: ["Marca 1"],
  marcas_inactivas: null,
  modelos: 2,
  unidades: 14,
  lineas: [linea("Uno", "NEG", "Negro", "S", 5), linea("Uno", "NEG", "Negro", "M", 3), linea("Dos", "ROS", "Rosado", "L", 6)],
  ...extra,
});
const respuesta = (extra: Record<string, unknown> = {}) => ({
  soportado: true,
  base: {
    paso_2: { version: 3, total: 40, unidades: 32, por: "Felipe", en: "2026-10-26T15:00:00Z" },
    costo: 40,
    grupos: [grupoCrudo("pa", "Prov A"), grupoCrudo("pb", "Prov B", { modelos: 1, unidades: 6 }), grupoCrudo("pt", "CAYLA SAC", { es_taller: true, unidades: 7 })],
    confirmadas: 0,
    sin_proveedor: 2,
    sin_marca: 3,
    modelos_nuevos: 8,
  },
  pedidos: [],
  ...extra,
});

describe("leerEnvio", () => {
  it("lee lo que manda la base", () => {
    const r = leerEnvio(respuesta())!;
    expect(r.base).toMatchObject({ version: 3, total: 40, confirmadas: 0, unidades: 32, costo: 40, sinProveedor: 2, sinMarca: 3, modelosNuevos: 8, por: "Felipe" });
    expect(r.base!.grupos.map((g) => [g.proveedor, g.esTaller, g.unidades])).toEqual([
      ["Prov A", false, 14],
      ["Prov B", false, 6],
      ["CAYLA SAC", true, 7],
    ]);
    expect(r.base!.grupos[0].lineas[0]).toMatchObject({ modelo: "Uno", colorNombre: "Negro", talla: "S", n: 5 });
    expect(r.pedidos).toEqual([]);
  });

  it("sin la marca «soportado» (la web se publicó antes que la migración) o con basura, no hay lectura", () => {
    expect(leerEnvio(null)).toBeNull();
    expect(leerEnvio("hola")).toBeNull();
    expect(leerEnvio([])).toBeNull();
    expect(leerEnvio({ base: null, pedidos: [] })).toBeNull();
    expect(leerEnvio({ soportado: false, base: null, pedidos: [] })).toBeNull();
  });

  it("una categoría sin paso 2 guardado trae la base en null (no inventa un reparto)", () => {
    expect(leerEnvio({ soportado: true, base: null, pedidos: [] })).toEqual({ base: null, pedidos: [] });
    // Un paso 2 sin versión tampoco se entiende.
    expect(leerEnvio(respuesta({ base: { paso_2: { total: 1 }, grupos: [] } }))!.base).toBeNull();
  });

  it("descarta lo que no calza: un grupo sin proveedor, una línea sin color o sin prendas", () => {
    const r = leerEnvio(
      respuesta({
        base: {
          paso_2: { version: 1, total: 10, unidades: 5 },
          costo: "40.00",
          grupos: [{ proveedor: "Sin id" }, grupoCrudo("pa", "Prov A", { lineas: [linea("Uno", "NEG", "Negro", "S", 5), { ...linea("Dos", "NEG", "Negro", "M", 0) }, { ...linea("Tres", "", "", "M", 2) }] })],
          sin_proveedor: "x",
        },
      }),
    )!;
    expect(r.base!.grupos).toHaveLength(1);
    expect(r.base!.grupos[0].lineas).toHaveLength(1);
    // El costo puede llegar como texto numérico; un número que no lo es, no.
    expect(r.base!.costo).toBe(40);
    expect(r.base!.sinProveedor).toBe(0);
    expect(leerEnvio(respuesta({ base: { paso_2: { version: 1 }, costo: "caro", grupos: [] } }))!.base!.costo).toBeNull();
  });

  it("lee los pedidos con su estado, su cuándo, su orden y su motivo; descarta los que no se entienden", () => {
    const r = leerEnvio(
      respuesta({
        pedidos: [
          { id: "1", proveedor_id: "pa", estado: "pendiente", cuando: "fecha", fecha_prevista: "2026-11-12", paso_2_version: 3, unidades: 14, enviado_por: "Felipe", enviado_en: "2026-10-26T15:00:00Z", orden_numero: null },
          { id: "2", proveedor_id: "pb", estado: "pedido", cuando: "ya", fecha_prevista: null, paso_2_version: 3, unidades: 6, orden_numero: 1200, orden_texto: "OC-001200" },
          { id: "3", proveedor_id: "pa", estado: "rectificado", cuando: "ya", paso_2_version: 2, unidades: 14, motivo: "Cambié de idea", rectificado_en: "2026-10-25T10:00:00Z" },
          { id: "4", proveedor_id: "pa", estado: "raro", cuando: "ya", paso_2_version: 1, unidades: 1 },
          { id: "5", proveedor_id: "pa", estado: "pendiente", cuando: "mañana", paso_2_version: 1, unidades: 1 },
          { proveedor_id: "pa", estado: "pendiente", cuando: "ya", paso_2_version: 1, unidades: 1 },
          { id: "7", proveedor_id: "pa", estado: "pendiente", cuando: "ya", unidades: 1 },
        ],
      }),
    )!;
    expect(r.pedidos.map((p) => [p.id, p.estado, p.cuando, p.fechaPrevista, p.ordenNumero, p.ordenTexto, p.motivo])).toEqual([
      ["1", "pendiente", "fecha", "2026-11-12", null, null, null],
      ["2", "pedido", "ya", null, 1200, "OC-001200", null],
      ["3", "rectificado", "ya", null, null, null, "Cambié de idea"],
    ]);
  });
});

describe("leerEnvios", () => {
  it("lee el resumen por categoría", () => {
    expect(
      leerEnvios({ soportado: true, categorias: [{ categoria_id: "c1", pendientes: 2, pedidos: 1, rectificados: 0, desactualizado: true, confirmadas: 9 }, { pendientes: 1 }] }),
    ).toEqual([{ categoriaId: "c1", pendientes: 2, pedidos: 1, rectificados: 0, desactualizado: true, confirmadas: 9 }]);
  });
  it("sin soporte o con basura, null; sin categorías, vacío", () => {
    expect(leerEnvios(null)).toBeNull();
    expect(leerEnvios({ categorias: [] })).toBeNull();
    expect(leerEnvios({ soportado: true, categorias: [] })).toEqual([]);
    expect(leerEnvios({ soportado: true })).toEqual([]);
  });
});

describe("cuándo se piensa pedir", () => {
  it("«Pedir el…» arranca en el último día para pedir; si ya pasó o la campaña empezó, en hoy", () => {
    expect(fechaSugerida("2026-10-26", "2026-11-17")).toBe("2026-11-17");
    expect(fechaSugerida("2026-10-26", "2026-10-26")).toBe("2026-10-26");
    expect(fechaSugerida("2026-10-26", "2026-10-20")).toBe("2026-10-26");
    expect(fechaSugerida("2026-10-26", null)).toBe("2026-10-26");
  });

  it("cambiar entre «ya» y una fecha conserva la fecha que ya se había puesto", () => {
    const hoy = "2026-10-26";
    const f = conCuando(PEDIR_YA, "fecha", hoy, "2026-11-17");
    expect(f).toEqual({ cuando: "fecha", fecha: "2026-11-17" });
    const editada = { cuando: "fecha" as const, fecha: "2026-11-05" };
    expect(conCuando(conCuando(editada, "ya", hoy, "2026-11-17"), "fecha", hoy, "2026-11-17")).toEqual({ cuando: "fecha", fecha: "2026-11-17" });
    expect(conCuando(editada, "fecha", hoy, "2026-11-17")).toEqual(editada);
    expect(conCuando(editada, "ya", hoy, "2026-11-17")).toEqual({ cuando: "ya", fecha: "" });
  });

  it("llega tarde solo una fecha posterior al límite; «ya» y una fecha en el límite, no", () => {
    expect(llegaTarde({ cuando: "fecha", fecha: "2026-11-18" }, "2026-11-17")).toBe(true);
    expect(llegaTarde({ cuando: "fecha", fecha: "2026-11-17" }, "2026-11-17")).toBe(false);
    expect(llegaTarde({ cuando: "fecha", fecha: "2026-11-01" }, "2026-11-17")).toBe(false);
    expect(llegaTarde(PEDIR_YA, "2026-11-17")).toBe(false);
    // La campaña ya empezó: no hay un «antes de» que se pase.
    expect(llegaTarde({ cuando: "fecha", fecha: "2026-12-30" }, null)).toBe(false);
    expect(llegaTarde({ cuando: "fecha", fecha: "" }, "2026-11-17")).toBe(false);
  });

  it("dice lo que la base rechazaría de una fecha, antes de enviar", () => {
    const hoy = "2026-10-26";
    expect(problemaDeLaFecha(PEDIR_YA, hoy)).toBeNull();
    expect(problemaDeLaFecha({ cuando: "fecha", fecha: "" }, hoy)).toMatch(/Elige la fecha/);
    expect(problemaDeLaFecha({ cuando: "fecha", fecha: "12/11/2026" }, hoy)).toMatch(/no se entiende/);
    expect(problemaDeLaFecha({ cuando: "fecha", fecha: "2026-10-25" }, hoy)).toMatch(/ya pasó/);
    expect(problemaDeLaFecha({ cuando: "fecha", fecha: "2026-10-26" }, hoy)).toBeNull();
    expect(problemaDeLaFecha({ cuando: "fecha", fecha: "2027-10-26" }, hoy)).toBeNull();
    expect(problemaDeLaFecha({ cuando: "fecha", fecha: "2027-10-27" }, hoy)).toMatch(/un año/);
  });

  it("la frase: «Pedir ya» o «Pedir el 12 nov»", () => {
    expect(fraseDeCuando("ya", null)).toBe("Pedir ya");
    expect(fraseDeCuando("ya", "2026-11-12")).toBe("Pedir ya");
    expect(fraseDeCuando("fecha", "2026-11-12")).toBe("Pedir el 12 nov");
    expect(fraseDeCuando("fecha", null)).toBe("Pedir ya");
  });
});

const grupo = (id: string, extra: Partial<GrupoDeEnvio> = {}): GrupoDeEnvio => ({
  proveedorId: id,
  proveedor: `Prov ${id}`,
  esTaller: false,
  proveedorActivo: true,
  marcas: [],
  marcasInactivas: [],
  modelos: 1,
  unidades: 5,
  lineas: [],
  ...extra,
});
const base = (grupos: GrupoDeEnvio[], extra: Partial<BaseDeEnvio> = {}): BaseDeEnvio => ({
  version: 1,
  total: 20,
  confirmadas: 0,
  unidades: 15,
  por: null,
  en: null,
  costo: 40,
  grupos,
  sinProveedor: 0,
  sinMarca: 0,
  modelosNuevos: 0,
  ...extra,
});
const pedido = (id: string, proveedorId: string, estado: PedidoEnviado["estado"]): PedidoEnviado => ({
  id,
  proveedorId,
  estado,
  cuando: "ya",
  fechaPrevista: null,
  version: 1,
  unidades: 5,
  enviadoPor: null,
  enviadoEn: null,
  ordenNumero: null,
  ordenTexto: null,
  motivo: null,
  rectificadoEn: null,
});

describe("el estado de cada grupo", () => {
  it("el Taller no entra: su pedido no es una compra", () => {
    const b = base([grupo("a"), grupo("t", { esTaller: true })]);
    expect(estadoDeLosGrupos(b, []).map((e) => e.grupo.proveedorId)).toEqual(["a"]);
    expect(delTaller(b)?.proveedorId).toBe("t");
    expect(delTaller(base([grupo("a")]))).toBeNull();
  });

  it("separa el pedido vigente del rectificado: el rectificado es historia y no impide volver a enviar", () => {
    const b = base([grupo("a"), grupo("b"), grupo("c")]);
    const e = estadoDeLosGrupos(b, [pedido("1", "a", "pendiente"), pedido("2", "b", "rectificado"), pedido("3", "c", "pedido"), pedido("4", "c", "rectificado")]);
    expect(e.map((x) => [x.grupo.proveedorId, x.vigente?.id ?? null, x.rectificado?.id ?? null])).toEqual([
      ["a", "1", null],
      ["b", null, "2"],
      ["c", "3", "4"],
    ]);
    // Se pueden enviar los que no tienen pedido vigente: solo «b».
    expect(porEnviar(e).map((x) => x.grupo.proveedorId)).toEqual(["b"]);
  });

  it("un proveedor o una marca inactivos bloquean el envío con su razón", () => {
    expect(bloqueoDelGrupo(grupo("a"))).toBeNull();
    expect(bloqueoDelGrupo(grupo("a", { proveedorActivo: false }))).toMatch(/proveedor está inactivo/);
    expect(bloqueoDelGrupo(grupo("a", { marcasInactivas: ["Vieja"] }))).toMatch(/marca «Vieja» está inactiva/);
    const e = estadoDeLosGrupos(base([grupo("a", { proveedorActivo: false }), grupo("b")]), []);
    expect(e[0].bloqueo).not.toBeNull();
    expect(porEnviar(e).map((x) => x.grupo.proveedorId)).toEqual(["b"]);
    // Un grupo ya enviado no se bloquea: ya está en Compras.
    expect(estadoDeLosGrupos(base([grupo("a", { proveedorActivo: false })]), [pedido("1", "a", "pendiente")])[0].bloqueo).toBeNull();
  });
});

describe("lo que no se envía todavía", () => {
  it("sin nada que decir, no hay líneas", () => {
    expect(queNoSeEnvia(base([grupo("a")]))).toEqual([]);
  });

  it("dice cada cosa con su cantidad, en singular o plural, y a dónde va", () => {
    const l = queNoSeEnvia(base([grupo("a"), grupo("t", { esTaller: true, unidades: 7 })], { sinMarca: 1, sinProveedor: 2, modelosNuevos: 1200 }));
    expect(l).toHaveLength(4);
    expect(l[0]).toMatch(/^Sin marca: 1 prenda\./);
    expect(l[1]).toMatch(/^Sin proveedor: 2 prendas\./);
    expect(l[2]).toMatch(/^Del Taller: 7 prendas\..*Producción/);
    expect(l[3]).toMatch(/^Modelos nuevos por elegir: 1[.,   ]?200 prendas\./);
  });
});

describe("lo que se manda a la base", () => {
  it("enviar lleva la versión que se vio y, por proveedor, «ya» o su fecha (nunca una fecha con «ya»)", () => {
    expect(
      argsEnviar("plan", "cat", 3, [
        { proveedorId: "pa", elegido: PEDIR_YA },
        { proveedorId: "pb", elegido: { cuando: "fecha", fecha: "2026-11-12" } },
        { proveedorId: "pc", elegido: { cuando: "ya", fecha: "2026-11-30" } },
      ]),
    ).toEqual({
      p_plan_id: "plan",
      p_categoria_id: "cat",
      p_paso_2_version: 3,
      p_envios: [
        { proveedor_id: "pa", cuando: "ya", fecha: null },
        { proveedor_id: "pb", cuando: "fecha", fecha: "2026-11-12" },
        { proveedor_id: "pc", cuando: "ya", fecha: null },
      ],
    });
  });

  it("rectificar lleva el pedido y la razón", () => {
    expect(argsRectificar("p1", "Cambié de idea")).toEqual({ p_pedido_id: "p1", p_motivo: "Cambié de idea" });
  });

  it("las razones de rectificar caben en lo que la base pide (de 3 a 200 letras)", () => {
    expect(MOTIVOS_DE_RECTIFICACION.length).toBeGreaterThan(0);
    for (const m of MOTIVOS_DE_RECTIFICACION) {
      expect(m.length).toBeGreaterThanOrEqual(3);
      expect(m.length).toBeLessThanOrEqual(200);
    }
  });
});

describe("el paso 2 «por revisar»", () => {
  it("sin órdenes, el paso 2 vale mientras lo que falta comprar sea el total con que se guardó", () => {
    expect(paso2PorRevisar(30, 30, 0)).toBe(false);
    expect(paso2PorRevisar(30, 21, 0)).toBe(true);
  });
  it("confirmar un pedido de campaña baja «Comprar» pero no cambia el plan: lo confirmado se suma", () => {
    expect(paso2PorRevisar(30, 21, 9)).toBe(false);
    expect(paso2PorRevisar(30, 0, 30)).toBe(false);
  });
  it("si además se tocó el plan (otro total) o entró otra orden a mano, sí hay que revisarlo", () => {
    expect(paso2PorRevisar(30, 25, 9)).toBe(true);
    expect(paso2PorRevisar(30, 10, 9)).toBe(true);
  });
});

describe("lo que dice la lista del Plan", () => {
  const resumenes = [
    { categoriaId: "c1", pendientes: 2, pedidos: 0, rectificados: 0, desactualizado: false, confirmadas: 0 },
    { categoriaId: "c2", pendientes: 0, pedidos: 0, rectificados: 3, desactualizado: false, confirmadas: 0 },
    { categoriaId: "c3", pendientes: 1, pedidos: 1, rectificados: 0, desactualizado: true, confirmadas: 14 },
  ];
  it("una categoría con algo pendiente o ya pedido tiene resumen; una con solo rectificados (historia) o sin nada, no", () => {
    expect(resumenParaLaFila(resumenes, "c1")?.pendientes).toBe(2);
    expect(resumenParaLaFila(resumenes, "c2")).toBeNull();
    expect(resumenParaLaFila(resumenes, "c9")).toBeNull();
    expect(resumenParaLaFila(null, "c1")).toBeNull();
    expect(resumenParaLaFila(undefined, "c1")).toBeNull();
  });

  it("las frases, en singular y plural", () => {
    expect(frasesDeEnCompras(resumenes[0])).toEqual({ pendientes: "2 pendientes en Compras", pedidos: null, cambio: null });
    expect(frasesDeEnCompras(resumenes[2])).toEqual({ pendientes: "1 pendiente en Compras", pedidos: "1 pedido", cambio: "El plan cambió después de enviar" });
  });
});
