import { describe, it, expect } from "vitest";
import {
  accesosRapidos,
  armarEquipo,
  avisosInicio,
  avisosVisibles,
  corteCelular,
  leerEleccion,
  resumirApartados,
} from "./inicio-avisos";

describe("avisosInicio", () => {
  it("solo arma los avisos cuya fuente se leyó para quien mira", () => {
    expect(avisosInicio({ traslados: 1 }).map((a) => a.clave)).toEqual(["traslados"]);
    expect(avisosInicio({})).toEqual([]);
  });

  it("una cola que no se pudo leer no es «al día»", () => {
    const [a] = avisosInicio({ traslados: null });
    expect(a!.nivel).toBe("sinleer");
    expect(a!.cantidad).toBeNull();
  });

  it("SUNAT y la caja con diferencia son siempre urgentes y no se pueden ocultar", () => {
    const avisos = avisosInicio({ comprobantesAtascados: 2, aperturas: 1 });
    expect(avisos.map((a) => [a.nivel, a.ocultable])).toEqual([["urgente", false], ["urgente", false]]);
  });

  it("un apartado que vence hoy o ya venció es urgente; si vence mañana, solo «por hacer»", () => {
    expect(avisosInicio({ apartados: { vencidos: 0, hoy: 1, manana: 0, primeraClienta: "Rosa" } })[0]!.nivel).toBe("urgente");
    expect(avisosInicio({ apartados: { vencidos: 1, hoy: 0, manana: 0, primeraClienta: null } })[0]!.nivel).toBe("urgente");
    expect(avisosInicio({ apartados: { vencidos: 0, hoy: 0, manana: 2, primeraClienta: null } })[0]!.nivel).toBe("toca");
    expect(avisosInicio({ apartados: { vencidos: 0, hoy: 0, manana: 0, primeraClienta: null } })[0]!.nivel).toBe("aldia");
  });

  it("una factura vencida es urgente; una que vence en la semana, por hacer", () => {
    const vencida = avisosInicio({ porPagar: { vencidas: 2, montoVencido: 3480, semana: 1, montoSemana: 500 } })[0]!;
    expect(vencida.nivel).toBe("urgente");
    expect(vencida.titulo).toBe("Facturas de proveedor vencidas");
    expect(avisosInicio({ porPagar: { vencidas: 0, montoVencido: 0, semana: 1, montoSemana: 500 } })[0]!.nivel).toBe("toca");
  });
});

describe("avisosVisibles (el filtro personal)", () => {
  const avisos = avisosInicio({ traslados: 2, pedidos: 3, devoluciones: 0, apartados: { vencidos: 0, hoy: 1, manana: 0, primeraClienta: null }, comprobantesAtascados: 0 });

  it("ordena urgente → por hacer → informativo y junta lo que está en cero en «Al día»", () => {
    const v = avisosVisibles(avisos, {}, false);
    expect(v.activos.map((a) => a.clave)).toEqual(["apartados", "traslados", "pedidos"]);
    expect(v.alDia.map((a) => a.clave)).toEqual(["sunat", "devoluciones"]);
  });

  it("lo urgente sale aunque la persona lo haya ocultado, marcado como forzado", () => {
    const v = avisosVisibles(avisos, { apartados: false }, false);
    const apartados = v.activos.find((a) => a.clave === "apartados")!;
    expect(apartados.forzado).toBe(true);
  });

  it("lo oculto que no es urgente desaparece, pero se cuenta", () => {
    const v = avisosVisibles(avisos, { traslados: false }, false);
    expect(v.activos.map((a) => a.clave)).not.toContain("traslados");
    expect(v.ocultosConAlgo).toBe(1);
  });

  it("a la líder lo informativo le llega apagado por defecto", () => {
    const v = avisosVisibles(avisos, {}, true);
    expect(v.activos.map((a) => a.clave)).not.toContain("pedidos");
    expect(avisosVisibles(avisos, { pedidos: true }, true).activos.map((a) => a.clave)).toContain("pedidos");
  });
});

describe("corteCelular", () => {
  it("corta en 3, salvo que haya más urgentes: esos nunca quedan detrás de «Ver más»", () => {
    expect(corteCelular([{ nivel: "toca" }, { nivel: "toca" }, { nivel: "info" }, { nivel: "info" }])).toBe(3);
    expect(corteCelular(Array(5).fill({ nivel: "urgente" }))).toBe(5);
    expect(corteCelular([{ nivel: "toca" }])).toBe(1);
  });
});

describe("leerEleccion", () => {
  it("ignora lo que no es un objeto de booleanos", () => {
    expect(leerEleccion(undefined)).toEqual({});
    expect(leerEleccion("no-es-json")).toEqual({});
    expect(leerEleccion("[1,2]")).toEqual({});
    expect(leerEleccion('{"traslados":false,"pedidos":"si"}')).toEqual({ traslados: false });
  });
});

describe("resumirApartados", () => {
  it("cuenta vencidos, de hoy y de mañana; lo que vence después no es aviso", () => {
    const r = resumirApartados(
      [
        { venceEl: "2026-09-30", clienta: "Lejos" },
        { venceEl: "2026-09-27", clienta: "Carla" },
        { venceEl: "2026-09-26", clienta: "Rosa" },
        { venceEl: "2026-09-25", clienta: "Ana" },
      ],
      "2026-09-26"
    );
    expect(r).toEqual({ vencidos: 1, hoy: 1, manana: 1, primeraClienta: "Ana" });
  });

  it("cruza el fin de mes", () => {
    expect(resumirApartados([{ venceEl: "2026-10-01", clienta: "X" }], "2026-09-30").manana).toBe(1);
  });
});

describe("accesosRapidos", () => {
  it("solo de módulos que ve, sin «Vender», máximo 4", () => {
    const vendedora = accesosRapidos({ esLider: false, ubicacionTipo: "tienda", modulos: ["vender", "apartados", "existencias", "cambios"] });
    expect(vendedora.map((a) => a.etiqueta)).toEqual(["Apartados", "Stock", "Cambios", "Buscar"]);
    const lider = accesosRapidos({ esLider: true, ubicacionTipo: "tienda", modulos: ["vender", "caja", "apartados", "traslados", "cambios", "existencias"] });
    expect(lider).toHaveLength(4);
    expect(lider.map((a) => a.etiqueta)).not.toContain("Vender");
  });

  it("la terminal administrativa (no vende): lo que su rol ve, como antes en «Ir a»", () => {
    const admin = accesosRapidos({ esLider: false, ubicacionTipo: "tienda", modulos: ["existencias", "conteos", "traslados", "movimientos", "recibir", "productos"] });
    expect(admin.map((a) => a.etiqueta)).toEqual(["Stock", "Traslados", "Recibir", "Buscar"]);
  });

  it("sin módulos, al menos «Buscar»", () => {
    expect(accesosRapidos({ esLider: false, ubicacionTipo: "tienda", modulos: [] }).map((a) => a.etiqueta)).toEqual(["Buscar"]);
  });
});

describe("armarEquipo", () => {
  const turno = [
    { persona_id: "m", nombre_corto: "Micaela Q.", estado_ahora: "presente", es_de_esta_sede: true },
    { persona_id: "l", nombre_corto: "Lucía P.", estado_ahora: "en_pausa", es_de_esta_sede: true },
    { persona_id: "o", nombre_corto: "Otra", estado_ahora: "presente", es_de_esta_sede: false },
    { persona_id: "p", nombre_corto: "Programada", estado_ahora: "programada", es_de_esta_sede: true },
  ];

  it("sin actividad: solo quién está, sin cifras", () => {
    const e = armarEquipo(turno, null);
    expect(e.map((m) => m.nombre)).toEqual(["Micaela Q.", "Lucía P."]);
    expect(e[0]!.monto).toBeNull();
  });

  it("con actividad: suma ventas, toma la última acción y suma a quien firmó sin marcar asistencia", () => {
    const e = armarEquipo(turno, [
      { ocurrio_at: "2026-09-26T22:00:00Z", accion: "venta_registrada", descripcion: "vendió 2 prendas por S/ 189", persona_id: "m", persona_nombre: "Micaela Quispe", detalle: { total: 189 } },
      { ocurrio_at: "2026-09-26T20:00:00Z", accion: "venta_registrada", descripcion: "vendió 1 prenda por S/ 100", persona_id: "m", persona_nombre: "Micaela Quispe", detalle: { total: 100 } },
      { ocurrio_at: "2026-09-26T15:00:00Z", accion: "caja_abierta", descripcion: "abrió la caja", persona_id: "f", persona_nombre: "Felipe Alvarez", detalle: {} },
    ]);
    const micaela = e.find((m) => m.personaId === "m")!;
    expect([micaela.ventas, micaela.monto, micaela.ultima?.texto]).toEqual([2, 289, "vendió 2 prendas por S/ 189"]);
    const felipe = e.find((m) => m.personaId === "f")!;
    expect([felipe.nombre, felipe.estado]).toEqual(["Felipe A.", null]);
  });
});
