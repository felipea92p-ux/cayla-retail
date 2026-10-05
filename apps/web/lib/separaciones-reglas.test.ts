import { describe, expect, it } from "vitest";
import {
  adelantoDe,
  AVISO_EFECTIVO_SIN_MONEDA,
  apartadoDeFila,
  cobroDelSaldo,
  coincide,
  enlaceWhatsapp,
  avisadaHoy,
  colaPorAvisar,
  diasEsperaPorAbono,
  encendida,
  presetDe,
  FUNCIONES_APARTADOS,
  mensajeWhatsapp,
  erroresDelApartado,
  estadoVisible,
  moverActivo,
  resultadosDelBuscador,
  pasoDelApartado,
  pagosParaRpcApartado,
  sumarDiasIso,
  textoDevolucion,
  tramosDelPlazo,
  vueltoDelAdelanto,
  type Apartado,
  type FormularioApartado,
  pedidoDeFila,
  paraQuienPedido,
} from "./separaciones-reglas";
import { totalDeLineas } from "./vender-reglas";

const formulario = (extra: Partial<FormularioApartado> = {}): FormularioApartado => ({
  nombres: "Ana",
  apellidos: "Lozano",
  celular: "987 111 222",
  dni: "",
  comprobante: "boleta",
  ruc: "",
  razonSocial: "",
  asesoraId: "p1",
  faltaAsesora: false,
  pagos: [{ metodo: "yape", monto: 90 }],
  devolucionMedio: "yape",
  devolucionNumero: "",
  devolucionCci: "",
  acepta: true,
  ...extra,
});

const apartado = (extra: Partial<Apartado> = {}): Apartado => ({
  id: "s1", codigo: "APT-TRU-0007", estado: "abierta", nombres: "Ana", apellidos: "Lozano Vera", celular: "987111222", dni: "70124598",
  asesora: null, total: 179, adelanto: 90, saldo: 89, venceEl: "2026-09-29", extensiones: 0, creadaEn: "2026-09-22T15:00:00Z",
  devolucionMedio: "yape", devolucionNumero: "987111222", devolucionCciFinal: null, liberadaSola: false,
  comprobanteAnticipo: "B004-000024", comprobanteFinal: null, notaCredito: null, prendas: [], pagos: [], estante: null, ...extra,
});

describe("estadoVisible (D3: 7 días, aviso a 2, 2 de gracia)", () => {
  it("a tiempo, por vencer, vence hoy y vencido con los días para decidir", () => {
    expect(estadoVisible(apartado(), "2026-09-22")).toEqual({ clave: "vigente", texto: "Quedan 7 días" });
    expect(estadoVisible(apartado(), "2026-09-27").clave).toBe("porvencer");
    expect(estadoVisible(apartado(), "2026-09-28").texto).toBe("Vence mañana");
    expect(estadoVisible(apartado(), "2026-09-29").texto).toBe("Vence hoy");
    expect(estadoVisible(apartado(), "2026-09-30")).toEqual({ clave: "vencida", texto: "Vencido · decide en 2 días" });
    expect(estadoVisible(apartado(), "2026-10-01").texto).toBe("Vencido · decide hoy");
  });
  it("liberado pide devolver; entregado y devuelto están cerrados", () => {
    expect(estadoVisible(apartado({ estado: "liberada" }), "2026-09-22")).toEqual({ clave: "devolver", texto: "Devolver S/90.00" });
    expect(estadoVisible(apartado({ estado: "entregada" }), "2026-09-22").clave).toBe("cerrada");
    expect(estadoVisible(apartado({ estado: "devuelta" }), "2026-09-22").clave).toBe("cerrada");
  });
});

describe("tramosDelPlazo", () => {
  it("9 tramos: 7 de plazo y 2 de gracia, marcando el día de hoy", () => {
    const t = tramosDelPlazo("2026-09-22", "2026-09-24");
    expect(t).toHaveLength(9);
    expect(t.filter((x) => x.tipo === "gracia")).toHaveLength(2);
    expect(t.map((x) => x.momento).slice(0, 4)).toEqual(["pasado", "pasado", "hoy", "futuro"]);
  });
});

describe("erroresDelApartado", () => {
  it("un formulario completo no tiene errores y está en el último paso", () => {
    const e = erroresDelApartado(formulario(), 179);
    expect(e).toEqual({});
    expect(pasoDelApartado(e)).toBe(2);
  });
  it("celular, DNI, falta de quién atendió y aceptación", () => {
    const e = erroresDelApartado(formulario({ celular: "98711122", dni: "123", faltaAsesora: true, acepta: false }), 179);
    expect(Object.keys(e).sort()).toEqual(["acepta", "asesora", "celular", "dni"]);
    expect(pasoDelApartado(e)).toBe(0);
  });
  it("celular y número de Yape: 9 dígitos que empiezan en 9", () => {
    expect(erroresDelApartado(formulario({ celular: "333 333 333" }), 179).celular).toMatch(/empieza en 9/);
    expect(erroresDelApartado(formulario({ celular: "987-111-222" }), 179).celular).toBeUndefined();
    expect(erroresDelApartado(formulario({ devolucionNumero: "333333333" }), 179).devolucion).toMatch(/empieza en 9/);
    expect(erroresDelApartado(formulario({ dni: "333333333" }), 179).dni).toMatch(/8 dígitos/);
  });
  it("más de S/700 en boleta exige DNI; factura exige RUC y razón social", () => {
    expect(erroresDelApartado(formulario(), 701).dni).toMatch(/DNI/);
    const f = erroresDelApartado(formulario({ comprobante: "factura", ruc: "123" }), 179);
    expect(f.ruc).toBeDefined();
    expect(f.razonSocial).toBeDefined();
  });
  it("adelanto: sin medio, en cero, de más o con efectivo que no alcanza", () => {
    expect(erroresDelApartado(formulario({ pagos: [] }), 179).pago).toMatch(/Elige/);
    expect(erroresDelApartado(formulario({ pagos: [{ metodo: "yape", monto: 0 }] }), 179).pago).toMatch(/mayor a cero/);
    expect(erroresDelApartado(formulario({ pagos: [{ metodo: "yape", monto: 200 }] }), 179).pago).toMatch(/pasar el total/);
    expect(erroresDelApartado(formulario({ pagos: [{ metodo: "efectivo", monto: 50, recibido: 40 }] }), 179).pago).toMatch(/no alcanza/);
    expect(pasoDelApartado(erroresDelApartado(formulario({ pagos: [] }), 179))).toBe(1);
  });
  it("«Todo» en efectivo justo pasa aunque el total salga de un descuento con céntimos (99.90 − 14.99 = 84.91)", () => {
    const total = totalDeLineas([{ cantidad: 1, precioUnitario: 99.9, descuentoUnitario: 14.99 }]);
    expect(erroresDelApartado(formulario({ pagos: [{ metodo: "efectivo", monto: total, recibido: 84.91 }] }), total).pago).toBeUndefined();
  });
  it("devolución: transferencia pide CCI de 20; Yape vacío usa el celular", () => {
    expect(erroresDelApartado(formulario({ devolucionMedio: "transferencia" }), 179).devolucion).toMatch(/CCI/);
    expect(erroresDelApartado(formulario({ devolucionMedio: "transferencia", devolucionCci: "002-193-00123456789012" }), 179).devolucion).toBeUndefined();
    expect(erroresDelApartado(formulario({ devolucionNumero: "" }), 179).devolucion).toBeUndefined();
    expect(erroresDelApartado(formulario({ devolucionNumero: "1234" }), 179).devolucion).toBeDefined();
  });
});

describe("dinero", () => {
  it("adelanto y vuelto: solo el efectivo da vuelto", () => {
    const pagos = [{ metodo: "yape" as const, monto: 30 }, { metodo: "efectivo" as const, monto: 20, recibido: 50 }];
    expect(adelantoDe(pagos)).toBe(50);
    expect(vueltoDelAdelanto(pagos)).toBe(30);
    expect(pagosParaRpcApartado(pagos)).toEqual([{ metodo: "yape", monto: 30 }, { metodo: "efectivo", monto: 20, recibido: 50 }]);
    expect(pagosParaRpcApartado([{ metodo: "efectivo", monto: 20, recibido: 20 }])).toEqual([{ metodo: "efectivo", monto: 20 }]);
  });
  it("cobro del saldo: falta, vuelto y exceso sin efectivo", () => {
    expect(cobroDelSaldo([], 89)).toMatchObject({ falta: 89, listo: false });
    expect(cobroDelSaldo([{ metodo: "efectivo", monto: 89, recibido: 100 }], 89)).toMatchObject({ falta: 0, vuelto: 11, listo: true });
    expect(cobroDelSaldo([{ metodo: "yape", monto: 100 }], 89)).toMatchObject({ excede: true, listo: false });
    expect(cobroDelSaldo([], 0).listo).toBe(true);
  });
});

describe("redondeo del efectivo al entregar el saldo (ADR-0311)", () => {
  const efectivo = (monto: number, recibido?: number) => ({ metodo: "efectivo" as const, monto, ...(recibido !== undefined ? { recibido } : {}) });

  it("el saldo de 29.88 en efectivo se cobra 29.80 y viaja la fila de redondeo de 0.08", () => {
    expect(pagosParaRpcApartado([efectivo(29.88, 30)], true)).toEqual([{ metodo: "efectivo", monto: 29.8, recibido: 30 }, { metodo: "redondeo", monto: 0.08 }]);
  });
  it("solo el efectivo se redondea: el Yape del mismo saldo va exacto", () => {
    expect(pagosParaRpcApartado([{ metodo: "yape", monto: 10 }, efectivo(19.88)], true)).toEqual([
      { metodo: "yape", monto: 10 },
      { metodo: "efectivo", monto: 19.8 },
      { metodo: "redondeo", monto: 0.08 },
    ]);
  });
  it("un saldo que ya es múltiplo de 0.10 no lleva fila de redondeo", () => {
    expect(pagosParaRpcApartado([efectivo(29.9)], true)).toEqual([{ metodo: "efectivo", monto: 29.9 }]);
  });
  it("sin el redondeo activo (la base todavía no lo acepta) los pagos viajan exactos, como siempre", () => {
    expect(pagosParaRpcApartado([efectivo(29.88, 30)])).toEqual([{ metodo: "efectivo", monto: 29.88, recibido: 30 }]);
    expect(pagosParaRpcApartado([efectivo(29.88, 30)], false)).toEqual([{ metodo: "efectivo", monto: 29.88, recibido: 30 }]);
  });
  it("lo recibido solo viaja si supera lo que se cobra en monedas (la base rechaza un recibido menor)", () => {
    expect(pagosParaRpcApartado([efectivo(29.88, 29.8)], true)).toEqual([{ metodo: "efectivo", monto: 29.8 }, { metodo: "redondeo", monto: 0.08 }]);
  });
  it("el vuelto sale de las monedas que se cobran, no de la deuda exacta: 29.88 con 30 → vuelto 0.20", () => {
    expect(cobroDelSaldo([efectivo(29.88, 30)], 29.88, true)).toMatchObject({ falta: 0, vuelto: 0.2, listo: true, sinMoneda: false, noAlcanza: false });
    expect(cobroDelSaldo([efectivo(29.88, 30)], 29.88, true).efectivo).toEqual({ deuda: 29.88, aCobrar: 29.8, redondeo: 0.08 });
    // sin redondeo, el mismo caso da el vuelto de siempre
    expect(cobroDelSaldo([efectivo(29.88, 30)], 29.88)).toMatchObject({ vuelto: 0.12, listo: true });
  });
  it("30 en la mano para un efectivo de 29.88 alcanza (29.80); 29.70 no", () => {
    expect(cobroDelSaldo([efectivo(29.88, 29.8)], 29.88, true).noAlcanza).toBe(false);
    expect(cobroDelSaldo([efectivo(29.88, 29.7)], 29.88, true).noAlcanza).toBe(true);
  });
  it("un efectivo menor de S/ 0.10 no se puede entregar (no hay moneda): hay que cobrarlo con otro medio", () => {
    const c = cobroDelSaldo([{ metodo: "yape", monto: 29.81 }, efectivo(0.07)], 29.88, true);
    expect(c).toMatchObject({ sinMoneda: true, listo: false, falta: 0 });
    expect(AVISO_EFECTIVO_SIN_MONEDA).toContain("S/ 0.10");
    // sin el redondeo activo, el mismo cobro se entrega como siempre
    expect(cobroDelSaldo([{ metodo: "yape", monto: 29.81 }, efectivo(0.07)], 29.88).listo).toBe(true);
  });
  it("un efectivo sin otro medio que cubra el saldo sigue faltando lo que falta", () => {
    expect(cobroDelSaldo([efectivo(10)], 29.88, true)).toMatchObject({ falta: 19.88, listo: false });
  });
  it("PROPIEDAD: en los 29 999 saldos de S/ 0.01 a S/ 299.99 la suma de lo que viaja es el saldo exacto y el efectivo es múltiplo de 0.10", () => {
    for (let c = 1; c < 30000; c++) {
      const saldo = c / 100;
      const filas = pagosParaRpcApartado([efectivo(saldo)], true);
      const suma = filas.reduce((a, f) => a + Math.round(f.monto * 100), 0);
      const ef = filas.find((f) => f.metodo === "efectivo");
      const red = filas.find((f) => f.metodo === "redondeo");
      expect(suma).toBe(c);
      expect(ef === undefined || Math.round(ef.monto * 100) % 10 === 0).toBe(true);
      expect(red === undefined || (red.monto > 0 && red.monto < 0.1)).toBe(true);
    }
  });
});

describe("búsqueda y textos", () => {
  it("encuentra por nombre, código, boleta, DNI y celular", () => {
    const a = apartado();
    for (const t of ["lozano", "APT-TRU-0007", "b004-000024", "70124598", "987 111 222"]) expect(coincide(a, t)).toBe(true);
    expect(coincide(a, "rosa")).toBe(false);
  });
  it("la devolución por transferencia nunca muestra el CCI completo", () => {
    expect(textoDevolucion(apartado())).toBe("Yape 987 111 222");
    expect(textoDevolucion(apartado({ devolucionMedio: "transferencia", devolucionCciFinal: "9012" }))).toBe("transferencia · CCI …9012");
  });
  it("WhatsApp con prefijo de Perú y el mensaje codificado", () => {
    expect(enlaceWhatsapp("987 111 222", "Hola Ana")).toBe("https://wa.me/51987111222?text=Hola%20Ana");
  });
  it("sumarDiasIso cruza de mes", () => {
    expect(sumarDiasIso("2026-09-28", 7)).toBe("2026-10-05");
  });
  it("apartadoDeFila convierte los numeric que llegan como texto", () => {
    const a = apartadoDeFila({ id: "x", codigo: "APT-TRU-0001", estado: "abierta", total: "179.00", adelanto: "90.00", saldo: "89.00", vence_el: "2026-09-29", items: [{ variante_id: "v", cantidad: 1, precio_unitario: "179.00", descuento_unitario: "0" }], pagos: [] });
    expect(a.total).toBe(179);
    expect(a.prendas[0].precioUnitario).toBe(179);
  });
});

describe("resultadosDelBuscador", () => {
  const prenda = (referencia: string, color: string, talla: string, stockAqui: number) => ({
    varianteId: `${referencia}-${color}-${talla}`,
    sku: `${referencia.slice(0, 3).toUpperCase()}-${color.slice(0, 3).toUpperCase()}-${talla}`,
    referencia,
    color,
    talla,
    codigosBarras: [],
    stockAqui,
  });
  const catalogo = [
    prenda("Blusa Camila", "Blanco", "S", 0),
    prenda("Blusa Camila", "Blanco", "M", 0),
    prenda("Blusa Regina", "Rosado", "L", 2),
    prenda("Blusa Regina", "Rosado", "S", 0),
    prenda("Blusa Emma", "Negro", "M", 5),
    prenda("Casaca Biker", "Negro", "M", 1),
  ];

  it("pone primero lo que se puede apartar y deja las agotadas al final", () => {
    const r = resultadosDelBuscador("blusa", catalogo);
    expect(r.disponibles.map((p) => p.varianteId)).toEqual(["Blusa Regina-Rosado-L", "Blusa Emma-Negro-M"]);
    expect(r.agotadas.map((p) => p.varianteId)).toEqual(["Blusa Camila-Blanco-S", "Blusa Camila-Blanco-M", "Blusa Regina-Rosado-S"]);
  });

  it("busca por color como el Punto de venta", () => {
    expect(resultadosDelBuscador("negro", catalogo).disponibles.map((p) => p.referencia)).toEqual(["Blusa Emma", "Casaca Biker"]);
  });

  it("las agotadas nunca desplazan a una disponible del tope", () => {
    const muchas = [...Array.from({ length: 10 }, (_, i) => prenda("Blusa Agotada", "Blanco", String(i), 0)), ...Array.from({ length: 12 }, (_, i) => prenda("Blusa Lista", "Negro", String(i), 1))];
    const r = resultadosDelBuscador("blusa", muchas);
    expect(r.disponibles).toHaveLength(12);
    expect(r.agotadas).toHaveLength(0);
  });

  it("sin texto no muestra nada", () => {
    expect(resultadosDelBuscador("   ", catalogo)).toEqual({ disponibles: [], agotadas: [] });
  });
});

describe("moverActivo", () => {
  it("baja y sube sin salirse de la lista", () => {
    expect(moverActivo(0, 1, 3)).toBe(1);
    expect(moverActivo(2, 1, 3)).toBe(2);
    expect(moverActivo(0, -1, 3)).toBe(0);
    expect(moverActivo(5, -1, 0)).toBe(0);
  });
});

describe("recordar en lote", () => {
  const hoy = "2026-09-26";
  const a = (id: string, venceEl: string, estado: Apartado["estado"] = "abierta") => apartado({ id, codigo: `APT-TRU-${id}`, venceEl, estado });
  const lista = [a("1", "2026-10-03"), a("2", "2026-09-28"), a("3", "2026-09-25"), a("4", "2026-09-27"), a("5", "2026-09-27", "entregada"), a("6", "2026-09-20", "liberada")];

  it("entran los que vencen en 2 días o menos y los vencidos en gracia; el que vence antes, primero", () => {
    const { porAvisar, avisadasHoy } = colaPorAvisar(lista, {}, hoy);
    expect(porAvisar.map((x) => x.id)).toEqual(["3", "4", "2"]);
    expect(avisadasHoy).toEqual([]);
  });
  it("quien ya recibió un aviso HOY (en hora de Lima) sale de la cola; uno de ayer vuelve a entrar", () => {
    const avisos = {
      "4": { avisos: 1, ultimoEn: "2026-09-26T14:00:00Z", ultimoPor: "Rosa" },
      // 22:00 del 25 en Lima = 03:00 UTC del 26: es de AYER para la tienda
      "2": { avisos: 1, ultimoEn: "2026-09-26T03:00:00Z", ultimoPor: "Rosa" },
    };
    const { porAvisar, avisadasHoy } = colaPorAvisar(lista, avisos, hoy);
    expect(porAvisar.map((x) => x.id)).toEqual(["3", "2"]);
    expect(avisadasHoy.map((x) => x.id)).toEqual(["4"]);
    expect(avisadaHoy(avisos["2"], hoy)).toBe(false);
  });
  it("el mensaje de un vencido no promete una fecha pasada: dice hasta cuándo se guarda", () => {
    const vencido = apartado({ nombres: "Lucía", codigo: "APT-TRU-0003", venceEl: "2026-09-25", saldo: 99 });
    expect(mensajeWhatsapp(vencido, "Tienda TRU", hoy)).toBe(
      "Hola Lucía, tu apartado APT-TRU-0003 en CAYLA Tienda TRU venció el 25/09/2026. Aún te lo guardamos hasta el 27/09/2026. Saldo por pagar: S/99.00.",
    );
    expect(mensajeWhatsapp(vencido, "Tienda TRU")).toMatch(/te espera .* hasta el 25\/09\/2026/);
  });
});

describe("abonos y opciones", () => {
  it("esperarla: 2 días, o 3 si el abono cubre la mitad o más de lo que faltaba", () => {
    expect(diasEsperaPorAbono(10, 100)).toBe(2);
    expect(diasEsperaPorAbono(50, 100)).toBe(3);
    expect(diasEsperaPorAbono(100, 100)).toBe(3);
  });
  it("una tienda sin opciones guardadas está en Completo; apagar abonos ya es una mezcla propia", () => {
    expect(presetDe([])).toBe("completo");
    expect(encendida([], "abonos")).toBe(true);
    expect(encendida(["abonos"], "abonos")).toBe(false);
    expect(presetDe(["abonos"])).toBe(null);
    expect(presetDe(["editar", "otra_sede"])).toBe("recomendado");
    expect(presetDe(FUNCIONES_APARTADOS.map((f) => f.clave))).toBe("esencial");
  });
  it("una fila sin id ni estante (base vieja) se lee igual", () => {
    const a = apartadoDeFila({ id: "x", codigo: "APT", estado: "abierta", items: [{ variante_id: "v" }], pagos: [{ metodo: "yape", monto: "10" }] });
    expect(a.estante).toBe(null);
    expect(a.prendas[0].itemId).toBe("");
    expect(a.pagos[0]).toEqual({ metodo: "yape", monto: 10, fecha: null, abono: false });
  });
});

describe("pedidoDeFila — Apartados lee los pedidos con dónde quedó la prenda (ADR-0328 act. 17)", () => {
  const base = { id: "p1", direccion: "me_piden", otra_sede: "Tienda Lima", variante_id: "v1", cantidad: 1, nota: null, estado: "pedido", created_at: "2026-10-04T15:00:00Z", guardada_hasta: null, traslado_numero: null, cancelado_motivo: null };
  it("lee fn_pedidos_con_cliente (cliente_*) y su reserva en el origen", () => {
    const p = pedidoDeFila({ ...base, cliente_nombres: "Ana", cliente_apellidos: "Lozano", cliente_celular: "987111222", reserva_en: "piso" });
    expect(p).toMatchObject({ nombres: "Ana", apellidos: "Lozano", celular: "987111222", reservaEn: "piso", direccion: "me_piden" });
  });
  it("una reserva que no conoce, o la fila vieja sin reserva (clienta_*), queda en null", () => {
    expect(pedidoDeFila({ ...base, cliente_nombres: "Ana", reserva_en: "otra" }).reservaEn).toBeNull();
    expect(pedidoDeFila({ ...base, clienta_nombres: "Ana", clienta_apellidos: "Lozano" })).toMatchObject({ nombres: "Ana", apellidos: "Lozano", reservaEn: null });
  });
  it("privacidad (decisión del 2026-10-04): la sede que tiene la prenda no recibe al cliente y lo ve como «Pedido de …»", () => {
    const p = pedidoDeFila({ ...base, cliente_nombres: null, cliente_apellidos: null, cliente_celular: null, reserva_en: "almacen" });
    expect(p).toMatchObject({ nombres: "", apellidos: "", celular: "" });
    expect(paraQuienPedido(p)).toBe("Pedido de Tienda Lima para un cliente");
    expect(paraQuienPedido({ ...p, nombres: "Ana", apellidos: "Lozano" })).toBe("Pedido de Tienda Lima para un cliente");
    expect(paraQuienPedido({ ...p, direccion: "pedi", nombres: "Ana", apellidos: "Lozano" })).toBe("Para Ana Lozano");
  });
});
