import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MEDIOS_PAGO_WEB,
  MOTIVOS_ANULAR_PAGO,
  avisoTrasPagar,
  ayudaDelMonto,
  completaElPedido,
  despuesDelPago,
  detalleDelPago,
  efectoDeAnular,
  errorDelPago,
  esAdelanto,
  esDigital,
  estadoDelPago,
  faltaLeerLaVenta,
  limpiarOperacion,
  montoDeFabrica,
  pagoParaLaBase,
  porDevolver,
  problemaDeCaja,
  problemaDeOperacion,
  problemaDelMedio,
  problemaDelMonto,
  problemaDelPago,
  problemaParaAnular,
  sePuedeAnular,
  textoDelPago,
  ventaDelPago,
  type MedioPagoWeb,
} from "./pedidos-web-cobro-reglas";
import type { EstadoPedidoWeb, LineaDetalle, PagoDeLista } from "./pedidos-web-reglas";

const MIGRACIONES = join(__dirname, "../../../supabase/migrations");
const COBROS = readFileSync(join(MIGRACIONES, "20261015000000_pedidos_web_cobros.sql"), "utf8");
const VENTA_AL_PAGAR = readFileSync(join(MIGRACIONES, "20261015051000_pedidos_web_venta_al_pagar.sql"), "utf8");
const AHORA = Date.parse("2026-10-14T15:00:00Z");

const linea = (estado: LineaDetalle["estado"]) => ({ estado }) as LineaDetalle;
const pago = (extra: Partial<PagoDeLista>): PagoDeLista => ({
  id: "g",
  origen: "tienda",
  medio: "yape",
  monto: 50,
  estado: "aprobado",
  numeroOperacion: "04812793",
  observacion: null,
  registradoEn: "2026-10-14T13:00:00Z",
  registradoPor: "Rosa",
  enCaja: false,
  anuladoEn: null,
  anuladoPor: null,
  anuladoMotivo: null,
  ...extra,
});

describe("Lo que se escribe: las mismas reglas que registrar_pago_pedido_web", () => {
  it("el monto como lo escribe una persona: con coma, con «S/», con hasta dos decimales y más de cero", () => {
    expect(problemaDelMonto("", 100)).toBe("Escribe el monto.");
    expect(problemaDelMonto("  ", 100)).toBe("Escribe el monto.");
    for (const bien of ["12,50", "12.50", "S/ 12.50", "s/12,5", "100", "100.00", " 7 "]) expect(problemaDelMonto(bien, 100), bien).toBeNull();
    for (const mal of ["0", "0.00", "-5", "5.001", "abc", "1,950.50", "12,5,0", "NaN", "Infinity", "1e3"])
      expect(problemaDelMonto(mal, 5000), mal).toMatch(/más de S\/ 0, con hasta dos decimales/);
  });

  it("nunca más de lo que falta (lo justo sí; un céntimo más, no)", () => {
    expect(problemaDelMonto("58.30", 58.3)).toBeNull();
    expect(problemaDelMonto("58.31", 58.3)).toBe("Es más de lo que falta (S/ 58.30).");
  });

  it("el medio: hay que elegirlo; el efectivo pide la caja abierta (sin saberlo, no se bloquea: decide la base)", () => {
    expect(problemaDelMedio(null, true, "Tienda Trujillo")).toBe("Elige cómo pagó.");
    expect(problemaDelMedio("efectivo", false, "Tienda Trujillo")).toBe("No hay una caja abierta en Tienda Trujillo: ábrela en Caja o elige otro medio.");
    expect(problemaDelMedio("efectivo", null, "Tienda Trujillo")).toBeNull();
    expect(problemaDelMedio("efectivo", true, "Tienda Trujillo")).toBeNull();
    expect(problemaDelMedio("yape", false, "Tienda Trujillo")).toBeNull();
  });

  it("el n.º de operación: solo dígitos (los espacios y guiones de la app se quitan), de 6 a 12, y solo si es digital", () => {
    expect(limpiarOperacion("0481 2793")).toBe("04812793");
    expect(limpiarOperacion("op: 12-34-56-78-90-12-34")).toBe("123456789012");
    expect(problemaDeOperacion("efectivo", "")).toBeNull();
    expect(problemaDeOperacion(null, "")).toBeNull();
    expect(problemaDeOperacion("yape", "")).toMatch(/Escribe el n\.º de operación/);
    expect(problemaDeOperacion("plin", "12345")).toBe("El n.º de operación tiene de 6 a 12 dígitos.");
    expect(problemaDeOperacion("transferencia", "123456")).toBeNull();
    expect(problemaDeOperacion("yape", "1234567890123")).toBe("El n.º de operación tiene de 6 a 12 dígitos.");
    expect([esDigital("yape"), esDigital("plin"), esDigital("transferencia"), esDigital("efectivo"), esDigital(null)]).toEqual([true, true, true, false, false]);
  });

  it("lo que se manda a la base: el monto leído, el medio y el n.º solo si es digital; nada si todavía no se puede", () => {
    expect(pagoParaLaBase("p", { monto: "12,50", medio: "yape", operacion: "04812793" }, 100, true, "T")).toEqual({
      p_pedido_id: "p",
      p_monto: 12.5,
      p_medio: "yape",
      p_numero_operacion: "04812793",
    });
    expect(pagoParaLaBase("p", { monto: "20", medio: "efectivo", operacion: "123456" }, 100, true, "T")).toMatchObject({ p_medio: "efectivo", p_numero_operacion: null });
    expect(pagoParaLaBase("p", { monto: "20", medio: "efectivo", operacion: "" }, 100, false, "T")).toBeNull();
    expect(pagoParaLaBase("p", { monto: "200", medio: "yape", operacion: "04812793" }, 100, true, "T")).toBeNull();
    expect(pagoParaLaBase("p", { monto: "20", medio: "plin", operacion: "123" }, 100, true, "T")).toBeNull();
  });

  it("el primer reparo va en el orden de la hoja: monto, medio, n.º de operación", () => {
    expect(problemaDelPago({ monto: "", medio: null, operacion: "" }, 100, true, "T")).toBe("Escribe el monto.");
    expect(problemaDelPago({ monto: "10", medio: null, operacion: "" }, 100, true, "T")).toBe("Elige cómo pagó.");
    expect(problemaDelPago({ monto: "10", medio: "yape", operacion: "" }, 100, true, "T")).toMatch(/n\.º de operación/);
    expect(problemaDelPago({ monto: "10", medio: "yape", operacion: "04812793" }, 100, true, "T")).toBeNull();
  });

  it("los medios y los motivos son exactamente los que acepta la base", () => {
    const medios = COBROS.match(/p_medio not in \(([^)]*)\)/)?.[1].split(",").map((x) => x.trim().replace(/'/g, "")) ?? [];
    expect(MEDIOS_PAGO_WEB.map((m) => m.clave).sort()).toEqual([...medios].sort());
    const motivos = COBROS.match(/p_motivo not in \(([^)]*)\)/)?.[1].split(",").map((x) => x.trim().replace(/'/g, "")) ?? [];
    expect(MOTIVOS_ANULAR_PAGO.map((m) => m.clave).sort()).toEqual([...motivos].sort());
  });
});

describe("El adelanto de lo que se consigue (Felipe: cuánto, lo decide la tienda)", () => {
  it("es adelanto si algo está por conseguir y todavía no paga nada: el monto no viene puesto", () => {
    const conEncargo = { lineas: [linea("reservada"), linea("por_conseguir")], pagado: 0, falta: 200 };
    expect(esAdelanto(conEncargo)).toBe(true);
    expect(montoDeFabrica(conEncargo)).toBe("");
    expect(ayudaDelMonto(conEncargo)).toBe("Adelanto: tú decides cuánto. El resto se cobra al recoger.");
  });
  it("con un pago ya hecho, o sin nada por conseguir, viene puesto lo que falta", () => {
    expect(montoDeFabrica({ lineas: [linea("por_conseguir")], pagado: 50, falta: 150 })).toBe("150.00");
    expect(montoDeFabrica({ lineas: [linea("reservada")], pagado: 0, falta: 99.9 })).toBe("99.90");
    expect(ayudaDelMonto({ lineas: [linea("reservada")], pagado: 0 })).toBe("Puede ser una parte: el resto se registra después.");
  });
  it("lo que queda después del pago, y el aviso al registrarlo", () => {
    expect(despuesDelPago(100, "100")).toBe("Con este pago queda pagado completo y sale su boleta.");
    expect(despuesDelPago(100, "30,5")).toBe("Después de este pago faltan S/ 69.50.");
    expect(despuesDelPago(100, "")).toBeNull();
    expect(despuesDelPago(100, "101")).toBeNull();
    expect(avisoTrasPagar(30, "efectivo", { falta: 70, estado_pedido: "confirmado" })).toEqual({ titulo: "Pago de S/ 30.00 registrado", detalle: "Faltan S/ 70.00. Entró a la caja." });
    expect(avisoTrasPagar(70, "yape", { falta: 0, estado_pedido: "pagado" })).toEqual({ titulo: "Pago de S/ 70.00 registrado", detalle: "El pedido quedó pagado completo." });
    expect(avisoTrasPagar(10, "plin", null).detalle).toBe("Todavía falta una parte.");
  });
});

describe("El pago que completa el total: nace la venta con su boleta (actividad 10)", () => {
  it("completa el pedido el monto que es exactamente lo que falta (como lo escribe una persona)", () => {
    expect(completaElPedido("100", 100)).toBe(true);
    expect(completaElPedido("S/ 99,90", 99.9)).toBe(true);
    expect(completaElPedido("99.89", 99.9)).toBe(false);
    expect(completaElPedido("", 100)).toBe(false);
    expect(completaElPedido("100", 0)).toBe(false);
  });
  it("ese pago pide la caja abierta aunque sea por Yape; uno parcial, no; sin saber de la caja, decide la base", () => {
    expect(problemaDeCaja({ monto: "100" }, 100, false, "Tienda Lima")).toBe(
      "Con este pago queda pagado completo y sale su boleta, que va en la caja del día: abre la caja de Tienda Lima.",
    );
    expect(problemaDeCaja({ monto: "30" }, 100, false, "T")).toBeNull();
    expect(problemaDeCaja({ monto: "100" }, 100, true, "T")).toBeNull();
    expect(problemaDeCaja({ monto: "100" }, 100, null, "T")).toBeNull();
    expect(problemaDelPago({ monto: "100", medio: "yape", operacion: "04812793" }, 100, false, "T")).toMatch(/abre la caja de T/);
    expect(problemaDelPago({ monto: "40", medio: "yape", operacion: "04812793" }, 100, false, "T")).toBeNull();
  });
  it("es la misma regla de la base: registrar_pago_pedido_web la exige ANTES de anotar, cuando el monto es lo que falta", () => {
    expect(VENTA_AL_PAGAR).toContain("if p_monto = p.total - p.pagado\n     and not exists (select 1 from retail.cajas cj where cj.ubicacion_id = p.ubicacion_id and cj.estado = 'abierta') then");
  });
  it("el aviso nombra la boleta que salió, y la venta se manda a SUNAT solo si quedó pagado completo", () => {
    expect(avisoTrasPagar(70, "yape", { falta: 0, estado_pedido: "pagado", boleta: "B002-000003" }).detalle).toBe(
      "El pedido quedó pagado completo. Salió su boleta B002-000003.",
    );
    expect(avisoTrasPagar(70, "efectivo", { falta: 0, estado_pedido: "pagado", boleta: "B002-000003" }).detalle).toBe(
      "El pedido quedó pagado completo. Salió su boleta B002-000003. Entró a la caja.",
    );
    expect(ventaDelPago({ estado_pedido: "pagado", venta_id: "v-1" })).toBe("v-1");
    expect(ventaDelPago({ estado_pedido: "confirmado", venta_id: null })).toBeNull();
    expect(ventaDelPago({ estado_pedido: "pagado", venta_id: "" })).toBeNull();
    expect(ventaDelPago(null)).toBeNull();
  });

  // /chaos 2026-10-15 (RS-03): con la respuesta perdida, «Revisar si se guardó» devuelve el pago sin su venta; la boleta quedaba
  // esperando a la cola en vez de salir ya.
  it("revisar un pago que completó el pedido pide leer su venta para mandar la boleta; con la venta a mano o sin completar, no", () => {
    expect(faltaLeerLaVenta({ estado_pedido: "pagado" })).toBe(true);
    expect(faltaLeerLaVenta({ estado_pedido: "pagado", venta_id: null })).toBe(true);
    expect(faltaLeerLaVenta({ estado_pedido: "pagado", venta_id: "v-1" })).toBe(false);
    expect(faltaLeerLaVenta({ estado_pedido: "confirmado" })).toBe(false);
    expect(faltaLeerLaVenta(null)).toBe(false);
  });
});

describe("Anular o devolver un pago", () => {
  const ESTADOS: EstadoPedidoWeb[] = ["por_confirmar", "confirmado", "pagado", "entregado", "vencido", "anulado"];
  it("se ofrece solo para un pago de la tienda, vivo, de un pedido confirmado o anulado (la misma regla de anular_pago_pedido_web)", () => {
    for (const e of ESTADOS) {
      expect(sePuedeAnular(pago({}), e), e).toBe(e === "confirmado" || e === "anulado");
      expect(sePuedeAnular(pago({ estado: "anulado" }), e), e).toBe(false);
      expect(sePuedeAnular(pago({ origen: "pasarela" }), e), e).toBe(false);
    }
  });
  it("pide el motivo y, si es efectivo, la caja abierta (de ella sale la plata)", () => {
    expect(problemaParaAnular(pago({}), null, true, "T")).toBe("Elige por qué se anula.");
    expect(problemaParaAnular(pago({ medio: "efectivo" }), "devuelto_al_cliente", false, "Tienda Lima")).toBe(
      "No hay una caja abierta en Tienda Lima: el efectivo sale de la caja de hoy.",
    );
    expect(problemaParaAnular(pago({ medio: "efectivo" }), "devuelto_al_cliente", true, "T")).toBeNull();
    expect(problemaParaAnular(pago({ medio: "yape" }), "error_al_anotar", false, "T")).toBeNull();
  });
  it("dice qué pasa con la plata: el efectivo sale de la caja de HOY; lo digital no mueve la caja", () => {
    expect(efectoDeAnular(pago({ medio: "efectivo", monto: 30 }), null, "Tienda Trujillo")).toMatch(/^Salen S\/ 30\.00 de la caja abierta de Tienda Trujillo, la de hoy/);
    expect(efectoDeAnular(pago({ medio: "yape" }), "error_al_anotar", "T")).toBe("No mueve la caja: solo deja de contar como pagado.");
    expect(efectoDeAnular(pago({ medio: "plin" }), "devuelto_al_cliente", "T")).toBe("No mueve la caja: devuélveselo por Plin o por transferencia y avísale por WhatsApp.");
    expect(efectoDeAnular(pago({ medio: "transferencia" }), null, "T")).toBe("No mueve la caja: devuélveselo por transferencia y avísale por WhatsApp.");
  });
  it("lo que queda por devolver es lo pagado de un pedido anulado", () => {
    expect(porDevolver({ estado: "anulado", pagado: 40 })).toBe(40);
    expect(porDevolver({ estado: "confirmado", pagado: 40 })).toBe(0);
  });
});

describe("Cómo se lee un pago", () => {
  it("el monto, el medio y el n.º; cuándo, quién y si entró a la caja", () => {
    expect(textoDelPago(pago({}))).toBe("S/ 50.00 · Yape · op. 04812793");
    expect(textoDelPago(pago({ medio: "efectivo", numeroOperacion: null, monto: 20 }))).toBe("S/ 20.00 · Efectivo");
    expect(detalleDelPago(pago({}), AHORA, "Tienda Trujillo")).toBe("hace 2 h · por Rosa");
    expect(detalleDelPago(pago({ medio: "efectivo", enCaja: true }), AHORA, "Tienda Trujillo")).toBe("hace 2 h · por Rosa · entró a la caja de Tienda Trujillo");
  });
  it("anulado: cuándo, quién, por qué y, si era efectivo, que salió de la caja", () => {
    const anulado = pago({ medio: "efectivo", estado: "anulado", anuladoEn: "2026-10-14T14:30:00Z", anuladoPor: "Kiara", anuladoMotivo: "devuelto_al_cliente" });
    expect(detalleDelPago(anulado, AHORA, "Tienda Lima")).toBe("Anulado hace 30 min · por Kiara · se le devolvió al cliente · salió de la caja de Tienda Lima");
  });
  it("uno de la pasarela que no cupo dice por qué (su observación)", () => {
    expect(detalleDelPago(pago({ origen: "pasarela", estado: "por_revisar", observacion: "La pasarela cobró S/ 50.00…" }), AHORA, "T")).toBe("La pasarela cobró S/ 50.00…");
  });
  it("la insignia: nada si es lo normal; anulado, por revisar, pendiente o rechazado; y en un pedido anulado, por devolver", () => {
    expect(estadoDelPago(pago({}), "confirmado")).toBeNull();
    expect(estadoDelPago(pago({}), "anulado")).toEqual({ texto: "Por devolver", tono: "rojo" });
    expect(estadoDelPago(pago({ estado: "anulado" }), "anulado")).toEqual({ texto: "Anulado", tono: "apagado" });
    expect(estadoDelPago(pago({ estado: "por_revisar" }), "confirmado")?.texto).toBe("Por revisar");
    expect(estadoDelPago(pago({ estado: "pendiente" }), "confirmado")?.texto).toBe("Pendiente");
    expect(estadoDelPago(pago({ estado: "rechazado" }), "confirmado")?.texto).toBe("Rechazado");
  });
});

describe("Los errores de la base, en el campo que los causó", () => {
  it("cada hint va a su campo; lo que cambió el pedido se relee; lo que no es de cobrar no se toma", () => {
    const e = (hint: string) => errorDelPago({ hint, message: "msg", code: "P0001" });
    expect([e("pedido_web_monto")?.campo, e("pedido_web_pasa_el_total")?.campo]).toEqual(["monto", "monto"]);
    expect([e("pedido_web_medio")?.campo, e("pedido_web_sin_caja")?.campo]).toEqual(["medio", "medio"]);
    expect([e("pedido_web_operacion")?.campo, e("pedido_web_operacion_repetida")?.campo]).toEqual(["operacion", "operacion"]);
    expect(e("pedido_web_operacion_repetida")?.detalle).toBe("msg");
    for (const h of ["pedido_web_no_cobrable", "pedido_web_pagado", "pedido_web_estado"]) expect(e(h)?.releer, h).toBe(true);
    expect(e("efectivo_insuficiente")).toMatchObject({ campo: null, releer: false, titulo: "No hay tanto efectivo en la caja" });
    expect(e("token_reusado")).toBeNull();
    expect(errorDelPago(null)).toBeNull();
  });
  it("los hints que se esperan existen en la base (si la base los cambia, esta prueba lo dice)", () => {
    const todo = readFileSync(join(MIGRACIONES, "20261014235000_pedidos_web_modelo.sql"), "utf8") + COBROS;
    for (const h of ["pedido_web_monto", "pedido_web_pasa_el_total", "pedido_web_medio", "pedido_web_sin_caja", "pedido_web_operacion", "pedido_web_operacion_repetida", "pedido_web_no_cobrable", "pedido_web_pagado", "pedido_web_estado", "pedido_web_motivo", "pedido_web_pago_pasarela"])
      expect(todo.includes(`hint = '${h}'`), h).toBe(true);
    const caja = readFileSync(join(MIGRACIONES, "20261013202000_efectivo_de_caja_no_negativo_parte1.sql"), "utf8");
    expect(caja.includes("hint = 'efectivo_insuficiente'")).toBe(true);
  });
});

describe("Las fichas de medio", () => {
  it("son las de Vender: cada medio que anota la tienda es un medio de venta con su ícono y su color", () => {
    const deVenta: MedioPagoWeb[] = ["efectivo", "yape", "plin", "transferencia"];
    expect(MEDIOS_PAGO_WEB.map((m) => m.clave).every((m) => deVenta.includes(m))).toBe(true);
    expect(MEDIOS_PAGO_WEB.map((m) => m.etiqueta)).toEqual(["Yape", "Plin", "Transferencia", "Efectivo"]);
  });
});
