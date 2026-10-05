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

  it("ADR-0328 act. 17: un pedido entre sedes con 48 h sin respuesta es urgente para el líder y sale aunque lo oculte", () => {
    const [a] = avisosInicio({ pedidosSinRespuesta: { tePiden: 1, pediste: 1, detalle: "Tienda Lima te pidió hace 50 h y nadie respondió.", ahora: "Responde 1 pedido de otra sede" } });
    expect(a).toMatchObject({ clave: "pedidosSede", cantidad: 2, nivel: "urgente", href: "/inventario/traslados", ahora: "Responde 1 pedido de otra sede" });
    expect(avisosVisibles([a!], { pedidosSede: false }, true).activos[0]!.forzado).toBe(true);
    expect(avisosInicio({ pedidosSinRespuesta: { tePiden: 0, pediste: 0, detalle: "Ningún pedido…", ahora: "" } })[0]!.nivel).toBe("aldia");
    expect(avisosInicio({ pedidosSinRespuesta: null })[0]!.nivel).toBe("sinleer");
  });

  it("decisión del 2026-10-04: la tienda que pidió para un cliente se entera de lo que llegó y de lo que no va a llegar, y va a Vender", () => {
    const [a] = avisosInicio({ pedidosCliente: { llegaron: 1, noLlegaron: 2, primero: "Ana Lozano" } });
    expect(a).toMatchObject({ clave: "pedidosCliente", cantidad: 3, nivel: "toca", href: "/vender", ahora: "Avisa a 3 clientes cómo terminó su pedido" });
    expect(a!.detalle).toBe("2 no van a llegar · 1 llegó · Ana Lozano: avísales por WhatsApp desde Vender.");
    expect(avisosInicio({ pedidosCliente: { llegaron: 0, noLlegaron: 1, primero: "Ana Lozano" } })[0]!.detalle).toBe("1 no va a llegar · Ana Lozano: avísale por WhatsApp desde Vender.");
    expect(avisosInicio({ pedidosCliente: { llegaron: 0, noLlegaron: 0, primero: null } })[0]!.nivel).toBe("aldia");
    expect(avisosInicio({ pedidosCliente: null })[0]!.nivel).toBe("sinleer");
  });

  it("el número de Traslados dice que suma lo que llega y lo que te piden", () => {
    expect(avisosInicio({ traslados: 3 })[0]!.detalle).toBe("3 esperan a tu sede: recibir lo que llegó o enviar lo que te piden.");
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
    expect(vendedora.map((a) => a.etiqueta)).toEqual(["Stock", "Cambios", "Apartados", "Buscar"]);
    const lider = accesosRapidos({ esLider: true, ubicacionTipo: "tienda", modulos: ["vender", "caja", "apartados", "traslados", "cambios", "existencias"] });
    expect(lider).toHaveLength(4);
    expect(lider.map((a) => a.etiqueta)).not.toContain("Vender");
  });

  it("la terminal administrativa (no vende): lo que su rol ve, como antes en «Ir a»", () => {
    const admin = accesosRapidos({ esLider: false, ubicacionTipo: "tienda", modulos: ["existencias", "conteos", "traslados", "movimientos", "recibir", "productos"] });
    expect(admin.map((a) => a.etiqueta)).toEqual(["Recibir", "Traslados", "Stock", "Conteo"]);
  });

  describe("«Nuevo producto»", () => {
    const integrante = ["vender", "caja", "apartados", "existencias", "cambios", "traslados", "productos"] as const;

    it("a quien puede escribir en el catálogo se lo ofrece en el lugar de Apartados (Felipe, 2026-10-03)", () => {
      const r = accesosRapidos({ esLider: false, ubicacionTipo: "tienda", modulos: integrante, permisos: ["editarCatalogo"] });
      expect(r.map((a) => a.etiqueta)).toEqual(["Stock", "Cambios", "Nuevo producto", "Caja"]);
      expect(r.map((a) => a.etiqueta)).not.toContain("Apartados");
      expect(r.find((a) => a.etiqueta === "Nuevo producto")!.href).toBe("/productos/nuevo");
    });

    it("ver Productos sin poder escribir (rol limitado) no basta: el guardado fallaría al final", () => {
      const r = accesosRapidos({ esLider: false, ubicacionTipo: "tienda", modulos: integrante, permisos: [] });
      expect(r.map((a) => a.etiqueta)).toEqual(["Stock", "Cambios", "Apartados", "Caja"]);
      // Sin la lista de permisos (quien llama no la pasó) se comporta igual: nunca se ofrece por defecto.
      expect(accesosRapidos({ esLider: false, ubicacionTipo: "tienda", modulos: integrante }).map((a) => a.etiqueta)).not.toContain("Nuevo producto");
    });

    it("poder editar por «Categorías y atributos» sin ver Productos no lo muestra: la ruta caería en «Sin acceso»", () => {
      const r = accesosRapidos({ esLider: false, ubicacionTipo: "tienda", modulos: ["apartados", "existencias", "atributos"], permisos: ["editarCatalogo"] });
      expect(r.map((a) => a.etiqueta)).not.toContain("Nuevo producto");
    });

    it("la terminal de almacén (no vende) lo tiene a mano junto a lo que recibe", () => {
      const admin = accesosRapidos({
        esLider: false,
        ubicacionTipo: "tienda",
        modulos: ["existencias", "conteos", "traslados", "movimientos", "recibir", "productos"],
        permisos: ["editarCatalogo"],
      });
      expect(admin.map((a) => a.etiqueta)).toEqual(["Recibir", "Traslados", "Stock", "Nuevo producto"]);
    });

    it("la líder lo tiene en lugar de Apartados; el almacén no cambia", () => {
      const lider = accesosRapidos({ esLider: true, ubicacionTipo: "tienda", modulos: [...integrante], permisos: ["editarCatalogo"] });
      expect(lider.map((a) => a.etiqueta)).toEqual(["Caja", "Nuevo producto", "Traslados", "Cambios"]);
      // Si por algún motivo no puede escribir en el catálogo, no se le ofrece y Apartados recupera su lugar.
      const sinPermiso = accesosRapidos({ esLider: true, ubicacionTipo: "tienda", modulos: [...integrante], permisos: [] });
      expect(sinPermiso.map((a) => a.etiqueta)).toEqual(["Caja", "Traslados", "Cambios", "Stock"]);
      const almacen = accesosRapidos({ esLider: false, ubicacionTipo: "almacen", modulos: ["traslados", "recibir", "productos"], permisos: ["editarCatalogo"] });
      expect(almacen.map((a) => a.etiqueta)).toEqual(["Traslados", "Recibir", "Buscar"]);
    });
  });

  it("la lista sale de lo que hace el rol, no de su nombre: si vende es del mostrador, si no, de la trastienda", () => {
    const mismos = ["existencias", "traslados", "cambios", "apartados", "recibir"] as const;
    expect(accesosRapidos({ esLider: false, ubicacionTipo: "tienda", modulos: [...mismos, "vender"] }).map((a) => a.etiqueta)).toEqual(["Stock", "Cambios", "Apartados", "Traslados"]);
    expect(accesosRapidos({ esLider: false, ubicacionTipo: "tienda", modulos: [...mismos] }).map((a) => a.etiqueta)).toEqual(["Recibir", "Traslados", "Stock", "Buscar"]);
  });

  it("un rol nuevo sin nada que coincida no se queda sin lista: al menos «Buscar»", () => {
    expect(accesosRapidos({ esLider: false, ubicacionTipo: "tienda", modulos: ["analisis"] }).map((a) => a.etiqueta)).toEqual(["Buscar"]);
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

  it("una venta anulada no cuenta como venta ni como última acción de quien la registró", () => {
    const e = armarEquipo(turno, [
      { ocurrio_at: "2026-09-26T22:30:00Z", accion: "venta_anulada", descripcion: "anuló la venta B004-000009 de S/ 100", persona_id: "l", persona_nombre: "Lucía P.", detalle: { total: 100 }, tabla: "ventas", registro_id: "v-anulada" },
      { ocurrio_at: "2026-09-26T22:00:00Z", accion: "venta_registrada", descripcion: "vendió 2 prendas por S/ 189", persona_id: "m", persona_nombre: "Micaela Quispe", detalle: { total: 189 }, tabla: "ventas", registro_id: "v-buena" },
      { ocurrio_at: "2026-09-26T21:00:00Z", accion: "venta_registrada", descripcion: "vendió 1 prenda por S/ 100", persona_id: "m", persona_nombre: "Micaela Quispe", detalle: { total: 100 }, tabla: "ventas", registro_id: "v-anulada" },
    ]);
    const micaela = e.find((m) => m.personaId === "m")!;
    expect([micaela.ventas, micaela.monto, micaela.ultima?.texto]).toEqual([1, 189, "vendió 2 prendas por S/ 189"]);
    // Quien anuló sí muestra que anuló (es una acción suya, no una venta).
    expect(e.find((m) => m.personaId === "l")!.ultima?.texto).toBe("anuló la venta B004-000009 de S/ 100");
  });

  it("una venta de prueba anulada desaparece del todo: ni venta, ni «vendió…», ni «anuló…»", () => {
    const e = armarEquipo(turno, [
      { ocurrio_at: "2026-09-29T16:27:00Z", accion: "venta_anulada", descripcion: "anuló la venta B004-000033 de S/ 59.90", persona_id: "l", persona_nombre: "Lucía P.", detalle: { total: 59.9, es_prueba: true }, tabla: "ventas", registro_id: "v-prueba" },
      // La línea original no lleva `es_prueba`: se marcó después de vender.
      { ocurrio_at: "2026-09-29T15:57:00Z", accion: "venta_registrada", descripcion: "vendió 1 prenda por S/ 59.90 · B004-000033", persona_id: "m", persona_nombre: "Micaela Quispe", detalle: { total: 59.9 }, tabla: "ventas", registro_id: "v-prueba" },
    ]);
    const micaela = e.find((m) => m.personaId === "m")!;
    expect([micaela.ventas, micaela.monto, micaela.ultima]).toEqual([0, 0, null]);
    expect(e.find((m) => m.personaId === "l")!.ultima).toBeNull();
  });

  it("quien solo firmó una venta de prueba no aparece como «sin marcar asistencia»", () => {
    const e = armarEquipo([], [
      { ocurrio_at: "2026-09-29T16:27:00Z", accion: "venta_anulada", descripcion: "anuló la venta", persona_id: "f", persona_nombre: "Felipe Alvarez", detalle: { es_prueba: true }, tabla: "ventas", registro_id: "v-prueba" },
      { ocurrio_at: "2026-09-29T15:57:00Z", accion: "venta_registrada", descripcion: "vendió 1 prenda", persona_id: "x", persona_nombre: "Alguien Más", detalle: { total: 10 }, tabla: "ventas", registro_id: "v-prueba" },
    ]);
    expect(e).toEqual([]);
  });

  it("sin tabla ni registro (filas viejas) no empareja nada: sigue contando como antes", () => {
    const e = armarEquipo(turno, [
      { ocurrio_at: "2026-09-26T22:00:00Z", accion: "venta_registrada", descripcion: "vendió 1 prenda por S/ 50", persona_id: "m", persona_nombre: "Micaela Quispe", detalle: { total: 50 } },
    ]);
    expect(e.find((m) => m.personaId === "m")!.monto).toBe(50);
  });
});
