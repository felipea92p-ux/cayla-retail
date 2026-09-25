import { describe, expect, it } from "vitest";
import {
  DIAS_URGENCIA_RECLAMO,
  agruparTablero,
  armarFilas,
  bandaDe,
  chipEstado,
  chipFactura,
  cifrasTablero,
  coincideFactura,
  destinoTexto,
  edadEnDias,
  filtrarFacturas,
  filtrarTablero,
  hace,
  mensajeParaProveedor,
  notaMotivoAyuda,
  parseMontoNota,
  pasosDeNota,
  repartoDestino,
  repartoFifo,
  resaltarFlexible,
  siguientePaso,
  textoDestino,
  tramoUrgencia,
  validarNota,
  type BorradorNota,
  type FacturaParaNota,
  type FilaTablero,
  type MovimientoFavor,
} from "./notas-credito-reglas";

// Mismos datos y mismas cifras que el spike (`docs/maquetas/notas-credito-spike-2026-09/`), donde «hoy»
// es el 18/09/2026: así una cifra que cambie acá se puede comparar contra la maqueta aprobada.
const HOY = "2026-09-18";
const MES = "2026-09";

const RIMAC = "prov-rimac";
const SUR = "prov-sur";
const AVIOS = "prov-avios";

function fila(p: Partial<FilaTablero> & Pick<FilaTablero, "clase" | "id">): FilaTablero {
  // En una fila «pendiente» el monto que se muestra ES lo esperado — lo mismo que hace `mapearFila`
  // al leer `notas_credito_tablero()`.
  const monto = p.monto ?? (p.clase === "pendiente" ? (p.montoEsperado ?? 0) : 0);
  return {
    compraId: "c-" + p.id,
    documento: "F001-000482",
    proveedorId: RIMAC,
    proveedorNombre: "Tejidos Rímac SAC",
    serieNumero: null,
    fecha: HOY,
    aplicado: 0,
    aFavor: 0,
    igv: 0,
    motivo: null,
    nota: null,
    cierreId: null,
    compraTotal: 0,
    compraSaldo: 0,
    compraFechaEmision: "2026-09-02",
    compraEstado: "recibida",
    unidadesCerradas: 0,
    montoEsperado: 0,
    cerradoEn: null,
    creadoEn: "2026-09-10T12:00:00Z",
    resuelto: true,
    ...p,
    monto,
  };
}

function factura(p: Partial<FacturaParaNota> & Pick<FacturaParaNota, "id">): FacturaParaNota {
  return {
    documento: "F001-000482",
    proveedorId: RIMAC,
    proveedorNombre: "Tejidos Rímac SAC",
    fechaEmision: "2026-09-02",
    fechaVencimiento: "2026-10-02",
    total: 5923.6,
    pagado: 2000,
    saldo: 3923.6,
    estado: "vigente",
    tieneNota: false,
    notasMonto: 0,
    ...p,
  };
}

const borrador = (p: Partial<BorradorNota> = {}): BorradorNota => ({
  compraId: "c-1",
  motivo: "faltante",
  serieNumero: "FC01-000018",
  fecha: HOY,
  montoTxt: null,
  destino: "a_favor",
  reembolsoMetodo: "transferencia",
  reembolsoFecha: HOY,
  reembolsoReferencia: "",
  ...p,
});

// ---------------------------------------------------------------------------

describe("antigüedad y urgencia del reclamo (D4: 14 días, una constante del módulo)", () => {
  it("el tramo cambia a los 7 y a los 14 días, no antes", () => {
    expect(tramoUrgencia(0)).toBe("reciente");
    expect(tramoUrgencia(7)).toBe("reciente");
    expect(tramoUrgencia(8)).toBe("medio");
    expect(tramoUrgencia(DIAS_URGENCIA_RECLAMO)).toBe("medio");
    expect(tramoUrgencia(DIAS_URGENCIA_RECLAMO + 1)).toBe("urgente");
  });
  it("una fecha futura no da días negativos: un cierre de hoy es «Hoy»", () => {
    expect(edadEnDias("2026-09-20", HOY)).toBe(0);
    expect(edadEnDias(HOY, HOY)).toBe(0);
    expect(edadEnDias("2026-09-06", HOY)).toBe(12);
  });
  it("se dice en castellano, no en número suelto", () => {
    expect(hace(0)).toBe("Hoy");
    expect(hace(1)).toBe("Ayer");
    expect(hace(19)).toBe("Hace 19 días");
  });
});

// ---------------------------------------------------------------------------

describe("qué pasa con el dinero — los tres casos del spike", () => {
  it("factura PENDIENTE: la nota solo baja la deuda y no sobra nada (F001-000482, S/ 847.24 contra S/ 3,923.60)", () => {
    const r = repartoDestino(847.24, 3923.6, "a_favor");
    expect(r).toEqual({ baja: 847.24, devuelve: 0, aFavor: 0, deudaDespues: 3076.36 });
    expect(textoDestino(r, { documento: "F001-000482", proveedor: "Tejidos Rímac SAC", saldo: 3923.6, destino: "a_favor" })).toBe(
      "La nota baja lo que se debe de F001-000482 de S/ 3,923.60 a S/ 3,076.36. No sobra dinero.",
    );
  });

  it("factura PENDIENTE: elegir «reembolso» no cambia nada, porque no hay sobrante que devolver", () => {
    expect(repartoDestino(847.24, 3923.6, "reembolso")).toEqual({ baja: 847.24, devuelve: 0, aFavor: 0, deudaDespues: 3076.36 });
  });

  it("factura PAGADA: todo el monto sobra y el destino decide adónde va (F004-000129, S/ 188.80)", () => {
    expect(repartoDestino(188.8, 0, "a_favor")).toEqual({ baja: 0, devuelve: 0, aFavor: 188.8, deudaDespues: 0 });
    expect(repartoDestino(188.8, 0, "reembolso")).toEqual({ baja: 0, devuelve: 188.8, aFavor: 0, deudaDespues: 0 });
  });

  it("factura PAGADA: el texto dice que la factura ya estaba pagada, no que baja una deuda", () => {
    const r = repartoDestino(188.8, 0, "reembolso");
    expect(textoDestino(r, { documento: "F004-000129", proveedor: "Botones y Avíos Lima", saldo: 0, destino: "reembolso" })).toBe(
      "F004-000129 ya estaba pagado, así que todo el monto es dinero de más. Los S/ 188.80 que sobran te los devuelve Botones y Avíos Lima ahora: se registra el reembolso junto con la nota.",
    );
  });

  it("caso MIXTO: baja lo que se debe y el resto sobra (F001-000401, debe S/ 1,128.00, nota S/ 1,180.00)", () => {
    expect(repartoDestino(1180, 1128, "a_favor")).toEqual({ baja: 1128, devuelve: 0, aFavor: 52, deudaDespues: 0 });
    expect(repartoDestino(1180, 1128, "reembolso")).toEqual({ baja: 1128, devuelve: 52, aFavor: 0, deudaDespues: 0 });
  });

  it("caso MIXTO: el texto cuenta las dos cosas en orden — primero la deuda, después el sobrante", () => {
    const r = repartoDestino(1180, 1128, "a_favor");
    expect(textoDestino(r, { documento: "F001-000401", proveedor: "Tejidos Rímac SAC", saldo: 1128, destino: "a_favor" })).toBe(
      "La nota primero baja lo que se debe de F001-000401 de S/ 1,128.00 a S/ 0.00. Los S/ 52.00 que sobran quedan a tu favor con Tejidos Rímac SAC, para otra compra.",
    );
  });

  it("en pasado la frase cambia de tiempo verbal (el «visto» después de registrar)", () => {
    const r = repartoDestino(188.8, 0, "reembolso");
    expect(textoDestino(r, { documento: "F004-000129", proveedor: "Botones y Avíos Lima", saldo: 0, destino: "reembolso", pasado: true })).toContain("ya volvieron a CAYLA");
  });

  it("bordes: monto 0, saldo negativo y monto enorme nunca dejan un número imposible", () => {
    expect(repartoDestino(0, 3923.6, "a_favor")).toEqual({ baja: 0, devuelve: 0, aFavor: 0, deudaDespues: 3923.6 });
    // Un saldo negativo (ya se pagó de más) cuenta como cero: la nota no puede «bajar» una deuda que no existe.
    expect(repartoDestino(100, -50, "reembolso")).toEqual({ baja: 0, devuelve: 100, aFavor: 0, deudaDespues: 0 });
    expect(repartoDestino(10000, 1128, "a_favor")).toEqual({ baja: 1128, devuelve: 0, aFavor: 8872, deudaDespues: 0 });
  });
});

// ---------------------------------------------------------------------------

describe("«Aplicada» se deduce: FIFO por proveedor", () => {
  const notas = [
    { id: "n-vieja", proveedorId: SUR, fecha: "2026-09-04", aFavor: 590 },
    { id: "n-nueva", proveedorId: SUR, fecha: "2026-09-11", aFavor: 354 },
    { id: "n-otro", proveedorId: AVIOS, fecha: "2026-09-09", aFavor: 236 },
  ];

  it("sin usos, todo sigue vivo", () => {
    expect(repartoFifo(notas, { [SUR]: 944, [AVIOS]: 236 })).toEqual({ "n-vieja": 590, "n-nueva": 354, "n-otro": 236 });
  });

  it("lo consumido se imputa a la nota MÁS ANTIGUA primero", () => {
    // Del proveedor Sur se usaron 170: salen de la nota del 04/09, no de la del 11/09.
    expect(repartoFifo(notas, { [SUR]: 774, [AVIOS]: 236 })).toMatchObject({ "n-vieja": 420, "n-nueva": 354 });
  });

  it("cuando el consumo se come una nota entera, sigue con la siguiente", () => {
    expect(repartoFifo(notas, { [SUR]: 300, [AVIOS]: 236 })).toMatchObject({ "n-vieja": 0, "n-nueva": 300 });
  });

  it("saldo en cero: ninguna nota queda viva — todas dicen «Aplicada»", () => {
    expect(repartoFifo(notas, { [SUR]: 0, [AVIOS]: 0 })).toEqual({ "n-vieja": 0, "n-nueva": 0, "n-otro": 0 });
  });

  it("un proveedor sin saldo registrado se lee como cero, no como «todo vivo»", () => {
    expect(repartoFifo(notas, {})).toEqual({ "n-vieja": 0, "n-nueva": 0, "n-otro": 0 });
  });

  it("si el saldo supera lo que aportaron las notas (crédito de otro origen), ninguna se da por usada", () => {
    expect(repartoFifo(notas, { [SUR]: 5000, [AVIOS]: 5000 })).toEqual({ "n-vieja": 590, "n-nueva": 354, "n-otro": 236 });
  });

  it("los proveedores no se mezclan: usar el saldo de uno no marca las notas del otro", () => {
    const r = repartoFifo(notas, { [SUR]: 0, [AVIOS]: 236 });
    expect(r["n-otro"]).toBe(236);
  });
});

// ---------------------------------------------------------------------------

describe("armarFilas: el estado que se ve", () => {
  const filas: FilaTablero[] = [
    fila({ clase: "pendiente", id: "p1", documento: "F002-000087", proveedorId: SUR, proveedorNombre: "Confecciones Sur Andino", montoEsperado: 330.4, unidadesCerradas: 10, cerradoEn: "2026-08-30T10:00:00Z", fecha: "2026-08-30" }),
    fila({ clase: "pendiente", id: "p2", documento: "F001-000455", montoEsperado: 217.12, unidadesCerradas: 2, resuelto: false, cerradoEn: "2026-09-13T10:00:00Z", fecha: "2026-09-13" }),
    fila({ clase: "nota", id: "n1", serieNumero: "FC02-000009", proveedorId: SUR, proveedorNombre: "Confecciones Sur Andino", documento: "F002-000080", fecha: "2026-09-11", monto: 354, aplicado: 0, aFavor: 354, motivo: "devolucion" }),
    fila({ clase: "nota", id: "n2", serieNumero: "FC01-000029", documento: "F001-000377", fecha: "2026-08-27", monto: 354, aplicado: 354, aFavor: 0, motivo: "faltante" }),
  ];
  const movimientos: MovimientoFavor[] = [
    { id: "m1", proveedorId: SUR, tipo: "reembolso", monto: 354, fecha: "2026-09-11", documento: null, notaSerieNumero: "FC02-000009", metodo: "transferencia", referencia: "Op. 00881230", nota: null },
  ];
  const armadas = armarFilas(filas, { hoy: HOY, saldoPorProveedor: { [SUR]: 0, [RIMAC]: 0 }, movimientos });
  const por = (id: string) => armadas.find((f) => f.id === id)!;

  it("una pendiente es «por reclamar» y trae su antigüedad desde el cierre", () => {
    expect(por("p1").estado).toBe("por_reclamar");
    expect(por("p1").edadDias).toBe(19);
    expect(por("p1").tramo).toBe("urgente");
    expect(chipEstado(por("p1"))).toEqual({ tono: "ambar", texto: "Por reclamar" });
  });

  it("una pendiente de un comprobante que todavía no está completo está BLOQUEADA", () => {
    expect(por("p2").bloqueada).toBe(true);
    expect(chipEstado(por("p2"))).toEqual({ tono: "neutro", texto: "Falta cerrar" });
    expect(siguientePaso(por("p2")).tono).toBe("espera");
  });

  it("una nota cuyo sobrante volvió a CAYLA dice «Devuelta», no «Aplicada»", () => {
    expect(por("n1").devuelto).toMatchObject({ monto: 354, metodo: "transferencia" });
    expect(chipEstado(por("n1"))).toEqual({ tono: "verde", texto: "Devuelta" });
    expect(destinoTexto(por("n1"))).toBe("Devuelto el 11/09");
  });

  it("una nota que solo bajó deuda dice «Aplicada» y lo explica", () => {
    expect(chipEstado(por("n2"))).toEqual({ tono: "neutro", texto: "Aplicada" });
    expect(destinoTexto(por("n2"))).toBe("bajó la deuda");
    expect(siguientePaso(por("n2")).texto).toContain("bajó la deuda de F001-000377 en S/ 354.00");
  });

  it("una nota con saldo vivo es «Emitida» y dice cuánto queda", () => {
    const conSaldo = armarFilas([filas[2]], { hoy: HOY, saldoPorProveedor: { [SUR]: 354 }, movimientos: [] })[0];
    expect(chipEstado(conSaldo)).toEqual({ tono: "verde", texto: "Emitida" });
    expect(destinoTexto(conSaldo)).toBe("A favor S/ 354.00");
  });

  it("el reclamo más viejo pide llamar, no escribir otra vez", () => {
    expect(siguientePaso(por("p1")).tono).toBe("actuar");
    expect(siguientePaso(por("p1")).texto).toContain("conviene llamar");
  });

  it("la línea de tiempo de una pendiente no inventa el paso «reclamada» (todavía no hay dónde guardarlo)", () => {
    expect(pasosDeNota(por("p1")).map((x) => x.clave)).toEqual(["Faltante", "Nota recibida", "Aplicada"]);
  });

  it("la línea de tiempo de una nota devuelta suma el paso «Dinero devuelto»", () => {
    expect(pasosDeNota(por("n1")).map((x) => x.clave)).toContain("Devuelto");
  });

  it("el mensaje para el proveedor lleva el comprobante, las unidades y la base con su IGV", () => {
    const m = mensajeParaProveedor(por("p1"));
    expect(m).toContain("F002-000087");
    expect(m).toContain("10 unidades");
    expect(m).toContain("S/ 330.40");
  });
});

// ---------------------------------------------------------------------------

describe("pestañas, bandas, búsqueda y agrupación", () => {
  const filas = armarFilas(
    [
      fila({ clase: "pendiente", id: "p1", documento: "F002-000087", proveedorId: SUR, proveedorNombre: "Confecciones Sur Andino", montoEsperado: 330.4, fecha: "2026-08-30", cerradoEn: "2026-08-30T10:00:00Z" }),
      fila({ clase: "pendiente", id: "p2", documento: "F001-000482", montoEsperado: 847.24, fecha: "2026-09-10", cerradoEn: "2026-09-10T10:00:00Z" }),
      fila({ clase: "nota", id: "n1", serieNumero: "FC01-000036", documento: "F001-000401", fecha: "2026-09-03", monto: 472, aplicado: 472, aFavor: 0 }),
    ],
    { hoy: HOY, saldoPorProveedor: {}, movimientos: [] },
  );

  it("la pestaña «Por reclamar» deja solo lo que falta llegar", () => {
    expect(filtrarTablero(filas, { pestana: "por_reclamar", banda: null, busqueda: "" }).map((f) => f.id)).toEqual(["p1", "p2"]);
  });
  it("«Todas» no filtra nada", () => {
    expect(filtrarTablero(filas, { pestana: "todas", banda: null, busqueda: "" })).toHaveLength(3);
  });
  it("la banda de antigüedad recorta dentro de lo pendiente", () => {
    expect(bandaDe(filas[0])).toBe("urgente");
    expect(bandaDe(filas[1])).toBe("medio");
    expect(filtrarTablero(filas, { pestana: "todas", banda: "urgente", busqueda: "" }).map((f) => f.id)).toEqual(["p1"]);
  });
  it("busca por proveedor, por comprobante de origen y por número de nota, sin tildes ni mayúsculas", () => {
    expect(filtrarTablero(filas, { pestana: "todas", banda: null, busqueda: "SUR andino" }).map((f) => f.id)).toEqual(["p1"]);
    expect(filtrarTablero(filas, { pestana: "todas", banda: null, busqueda: "f001-0004" }).map((f) => f.id)).toEqual(["p2", "n1"]);
    expect(filtrarTablero(filas, { pestana: "todas", banda: null, busqueda: "fc01-000036" }).map((f) => f.id)).toEqual(["n1"]);
  });
  it("agrupada por urgencia, lo más urgente va primero y cada banda dice cuánto suma", () => {
    const g = agruparTablero(filas, "urgencia");
    expect(g.map((x) => x.clave)).toEqual(["banda:urgente", "banda:medio", "banda:aplicadas"]);
    expect(g[0].total).toBe("1 nota · S/ 330.40");
  });
  it("agrupada por proveedor, el que más tiene por reclamar va primero", () => {
    const g = agruparTablero(filas, "proveedor");
    expect(g[0].titulo).toBe("Tejidos Rímac SAC"); // S/ 847.24 por reclamar, contra S/ 330.40 del otro
    expect(g[0].total).toContain("por reclamar");
  });
});

// ---------------------------------------------------------------------------

describe("cifras del tablero", () => {
  const filas = armarFilas(
    [
      fila({ clase: "pendiente", id: "p1", montoEsperado: 330.4, fecha: "2026-08-30", cerradoEn: "2026-08-30T10:00:00Z" }),
      fila({ clase: "pendiente", id: "p2", montoEsperado: 847.24, fecha: "2026-09-10", cerradoEn: "2026-09-10T10:00:00Z" }),
      fila({ clase: "nota", id: "n1", serieNumero: "FC01-000036", fecha: "2026-09-03", monto: 472, aplicado: 472, aFavor: 0 }),
      fila({ clase: "nota", id: "n2", serieNumero: "FC04-000007", proveedorId: AVIOS, proveedorNombre: "Botones y Avíos Lima", fecha: "2026-09-09", monto: 236, aplicado: 0, aFavor: 236 }),
    ],
    { hoy: HOY, saldoPorProveedor: { [AVIOS]: 236 }, movimientos: [] },
  );
  const c = cifrasTablero(filas, { mes: MES, saldoPorProveedor: { [AVIOS]: 236 }, movimientos: [] });

  it("«Por reclamar» suma lo esperado y dice cuál es la más antigua", () => {
    expect(c.porReclamar).toMatchObject({ monto: 1177.64, cantidad: 2, masVieja: 19 });
    expect(c.porReclamar.tramos).toEqual({ urgente: 1, medio: 1, reciente: 0 });
  });
  it("«Emitidas este mes» separa lo que bajó deuda de lo que quedó a favor", () => {
    expect(c.emitidasMes).toMatchObject({ monto: 708, cantidad: 2, bajaronDeuda: 472, devueltos: 0, aFavor: 236 });
  });
  it("«Saldo a favor total» es la suma de los saldos de la base, no de las notas", () => {
    expect(c.saldoFavorTotal).toBe(236);
  });
  it("«Aplicado este mes» suma lo que bajó de deuda y lo que se usó del libro", () => {
    const conUsos = cifrasTablero(filas, {
      mes: MES,
      saldoPorProveedor: { [AVIOS]: 236 },
      movimientos: [{ id: "m", proveedorId: AVIOS, tipo: "aplicacion", monto: 170, fecha: "2026-09-08", documento: "F002-000080", notaSerieNumero: null, metodo: null, referencia: null, nota: null }],
    });
    expect(conUsos.aplicadoMes.total).toBe(642);
  });
});

// ---------------------------------------------------------------------------

describe("validarNota: el espejo de lo que exige la base", () => {
  it("sin factura elegida, lo único que pide es la factura", () => {
    const v = validarNota({ borrador: borrador({ compraId: null }), factura: null, pendiente: null, yaTieneNotaFaltante: false, seriesUsadas: [], hoy: HOY });
    expect(v.errores.factura).toBeTruthy();
    expect(v.reparto).toBeNull();
  });

  it("con un faltante disponible, el monto viene puesto y el tope admite S/ 1 de redondeo", () => {
    const v = validarNota({
      borrador: borrador(),
      factura: factura({ id: "c-1" }),
      pendiente: { montoEsperado: 847.24, unidadesCerradas: 4, bloqueada: false, cierreId: "ci-1" },
      yaTieneNotaFaltante: false,
      seriesUsadas: [],
      hoy: HOY,
    });
    expect(v.sugerido).toBe(847.24);
    expect(v.montoMostrado).toBe("847.24");
    expect(v.tope).toBe(848.24);
    expect(v.errores).toEqual({});
    expect(v.reparto).toEqual({ baja: 847.24, devuelve: 0, aFavor: 0, deudaDespues: 3076.36 });
    expect(v.haySobrante).toBe(false);
    expect(v.destino).toBeNull();
  });

  it("un monto de MÁS se explica con el número exacto para el botón «Usar S/ …»", () => {
    const v = validarNota({
      borrador: borrador({ montoTxt: "1200" }),
      factura: factura({ id: "c-1" }),
      pendiente: { montoEsperado: 847.24, unidadesCerradas: 4, bloqueada: false, cierreId: "ci-1" },
      yaTieneNotaFaltante: false,
      seriesUsadas: [],
      hoy: HOY,
    });
    expect(v.errores.monto).toBe("No puede pasar de S/ 848.24.");
    expect(v.topeSugerido).toBe(847.24);
    expect(v.explicacionMonto).toContain("S/ 847.24");
    expect(v.reparto).toBeNull();
  });

  it("sin faltante, el tope es lo que queda por acreditar del comprobante", () => {
    const v = validarNota({
      borrador: borrador({ motivo: "devolucion", montoTxt: "6000" }),
      factura: factura({ id: "c-1", total: 5923.6, notasMonto: 500 }),
      pendiente: null,
      yaTieneNotaFaltante: false,
      seriesUsadas: [],
      hoy: HOY,
    });
    expect(v.tope).toBe(5423.6);
    expect(v.errores.monto).toBe("Como máximo S/ 5,423.60.");
    expect(v.explicacionMonto).toContain("más que el comprobante");
  });

  it("monto 0, vacío o con tres decimales no pasa", () => {
    const con = (txt: string) =>
      validarNota({ borrador: borrador({ motivo: "otro", montoTxt: txt }), factura: factura({ id: "c-1" }), pendiente: null, yaTieneNotaFaltante: false, seriesUsadas: [], hoy: HOY }).errores.monto;
    expect(con("")).toBe("Escribe el monto de la nota.");
    expect(con("0")).toContain("mayor a cero");
    expect(con("-5")).toContain("mayor a cero");
    expect(con("10.005")).toContain("2 decimales");
    expect(parseMontoNota("1.234,50")).toBeNaN();
    expect(parseMontoNota("1180,50")).toBe(1180.5);
  });

  it("FACTURA SIN SALDO (ya pagada): todo el monto sobra y las dos fichas de destino se pueden elegir", () => {
    const v = validarNota({
      borrador: borrador({ motivo: "devolucion", montoTxt: "188.80", destino: "reembolso" }),
      factura: factura({ id: "c-9", documento: "F004-000129", total: 590, pagado: 590, saldo: 0 }),
      pendiente: null,
      yaTieneNotaFaltante: false,
      seriesUsadas: [],
      hoy: HOY,
    });
    expect(v.haySobrante).toBe(true);
    expect(v.destino).toBe("reembolso");
    expect(v.reparto).toEqual({ baja: 0, devuelve: 188.8, aFavor: 0, deudaDespues: 0 });
  });

  it("con «reembolso» la fecha de la devolución no puede ser futura", () => {
    const v = validarNota({
      borrador: borrador({ motivo: "devolucion", montoTxt: "188.80", destino: "reembolso", reembolsoFecha: "2026-09-30" }),
      factura: factura({ id: "c-9", total: 590, pagado: 590, saldo: 0 }),
      pendiente: null,
      yaTieneNotaFaltante: false,
      seriesUsadas: [],
      hoy: HOY,
    });
    expect(v.errores.reembolsoFecha).toBeTruthy();
  });

  it("la serie no se repite en el mismo comprobante y la fecha no es anterior a la emisión", () => {
    const v = validarNota({
      borrador: borrador({ motivo: "otro", montoTxt: "100", serieNumero: "fc01-000018", fecha: "2026-08-01" }),
      factura: factura({ id: "c-1" }),
      pendiente: null,
      yaTieneNotaFaltante: false,
      seriesUsadas: ["FC01-000018"],
      hoy: HOY,
    });
    expect(v.errores.serie).toContain("ya está registrada");
    expect(v.errores.fecha).toContain("anterior al comprobante");
  });

  it("«Faltante» bloqueado dice POR QUÉ, en vez de dejar que el error llegue después", () => {
    const v = validarNota({
      borrador: borrador(),
      factura: factura({ id: "c-1" }),
      pendiente: { montoEsperado: 217.12, unidadesCerradas: 2, bloqueada: true, cierreId: null },
      yaTieneNotaFaltante: false,
      seriesUsadas: [],
      hoy: HOY,
    });
    expect(v.errores.motivo).toBeTruthy();
    expect(notaMotivoAyuda({ motivo: "faltante", pendiente: { bloqueada: true }, yaTieneNotaFaltante: false })).toContain("quedan unidades sin recibir");
    expect(notaMotivoAyuda({ motivo: "faltante", pendiente: null, yaTieneNotaFaltante: true })).toContain("ya tiene su nota por faltante");
  });
});

// ---------------------------------------------------------------------------

describe("buscador de facturas: documento, proveedor y MONTO", () => {
  const facturas = [
    factura({ id: "a", documento: "F003-000771", proveedorNombre: "Hilados del Norte", total: 2360, pagado: 0, saldo: 2360, fechaVencimiento: "2026-10-09" }),
    factura({ id: "b", documento: "F001-000401", total: 3540, pagado: 1940, saldo: 1600, fechaVencimiento: "2026-09-17" }),
    factura({ id: "c", documento: "F004-000129", proveedorId: AVIOS, proveedorNombre: "Botones y Avíos Lima", total: 590, pagado: 590, saldo: 0, fechaVencimiento: "2026-09-12" }),
  ];

  it("encuentra por monto aunque se escriba sin comas ni «S/»", () => {
    expect(coincideFactura(facturas[0], "2360")).toBe(true);
    expect(coincideFactura(facturas[0], "2,360.00")).toBe(true);
    expect(coincideFactura(facturas[0], "S/ 2360")).toBe(true);
    expect(coincideFactura(facturas[1], "2360")).toBe(false);
  });
  it("encuentra por documento con o sin guión, y por proveedor sin tildes", () => {
    expect(coincideFactura(facturas[0], "f003000771")).toBe(true);
    expect(coincideFactura(facturas[0], "F003-0007")).toBe(true);
    expect(coincideFactura(facturas[2], "avios")).toBe(true);
  });
  it("los filtros rápidos separan pagadas de las que tienen saldo", () => {
    expect(filtrarFacturas(facturas, { texto: "", filtro: "pagadas", proveedorId: null }).map((f) => f.id)).toEqual(["c"]);
    expect(filtrarFacturas(facturas, { texto: "", filtro: "con_saldo", proveedorId: null }).map((f) => f.id)).toEqual(["a", "b"]);
    expect(filtrarFacturas(facturas, { texto: "", filtro: "todas", proveedorId: AVIOS }).map((f) => f.id)).toEqual(["c"]);
  });
  it("resalta la coincidencia sobre el texto ORIGINAL, con sus comas y su guión", () => {
    expect(resaltarFlexible("S/ 2,360.00", "2360")).toEqual([
      { texto: "S/ ", coincide: false },
      { texto: "2,360", coincide: true },
      { texto: ".00", coincide: false },
    ]);
    expect(resaltarFlexible("F003-000771", "f003000771")).toEqual([{ texto: "F003-000771", coincide: true }]);
    expect(resaltarFlexible("F003-000771", "zzz")).toEqual([{ texto: "F003-000771", coincide: false }]);
  });
  it("el chip de cada factura sale del saldo y del vencimiento", () => {
    expect(chipFactura(facturas[0], HOY)).toEqual({ tono: "neutro", texto: "Pendiente" });
    expect(chipFactura(facturas[1], HOY)).toEqual({ tono: "rojo", texto: "Vencida" });
    expect(chipFactura(facturas[2], HOY)).toEqual({ tono: "verde", texto: "Pagada" });
  });
});
