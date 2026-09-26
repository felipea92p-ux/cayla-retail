import { describe, expect, it } from "vitest";
import {
  adelantoDe,
  apartadoDeFila,
  cobroDelSaldo,
  coincide,
  enlaceWhatsapp,
  avisadaHoy,
  colaPorAvisar,
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
} from "./separaciones-reglas";

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
  comprobanteAnticipo: "B004-000024", comprobanteFinal: null, notaCredito: null, prendas: [], pagos: [], ...extra,
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

