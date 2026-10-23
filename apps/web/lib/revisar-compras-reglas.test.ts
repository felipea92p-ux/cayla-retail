import { describe, expect, it } from "vitest";
import {
  textoPagoPapel,
  diaYRonda,
  PAPELES_GASTO,
  botonCierre,
  camposRevisarGasto,
  ejemploSerieNumero,
  fraseRevisarGasto,
  papelSugerido,
  papelesParaGasto,
  problemaRuc,
  camposCierre,
  camposCompletar,
  ejemploSerie,
  fraseCompletar,
  bandejaInicial,
  chipPapel,
  elegidoDeBandeja,
  filaCierre,
  filaGasto,
  filaPapel,
  filaPlata,
  llegadaDePapel,
  siguienteDeBandeja,
  fraseVeredicto,
  leerRevisarCompras,
  problemaNumero,
  problemaSerie,
  textoFaltan,
  textoLlegada,
  veredictoPapel,
  type LineaPapel,
} from "./revisar-compras-reglas";
import { TIPOS_PAPEL, type TipoPapel } from "./compra-rapida-reglas";
import { CONCEPTOS_GASTO, type ConceptoGasto } from "./mi-plata-reglas";

const linea = (o: Partial<LineaPapel> = {}): LineaPapel => ({
  id: "l1",
  nombre: "Polo",
  cantidad: 6,
  costo: 40,
  subtotal: 240,
  destino: "Tienda Trujillo",
  mandadas: 6,
  faltan: [],
  sobran: 0,
  ...o,
});
const PERSONA = { esPersona: true, listo: true, motivo: null };

describe("leerRevisarCompras", () => {
  it("lee papeles, cierres y proveedores, y descarta lo ilegible sin caerse", () => {
    const r = leerRevisarCompras({
      papeles: [
        {
          id: "p1", persona_id: "x", persona: "Marisol Quispe", es_mia: false, proveedor_id: "pr", proveedor: "Confecciones Lupe",
          tipo: "boleta", monto: "330.00", foto_ruta: "papeles/a.jpg", fecha: "2026-10-23", llego: true,
          lineas: [{ id: "i1", nombre: "Polo", cantidad: 6, costo: 40, subtotal: 240, destino: "Tienda Trujillo", mandadas: 6,
                     faltan: [{ cantidad: 1, causa: "no_vino" }, { cantidad: 1, causa: "inventada" }], sobran: 0 }, { id: null }],
          envios: [{ id: "e1", numero: 179, estado: "cerrado" }, { id: "e2", numero: 1, estado: "anulado" }],
        },
        { id: "p2", tipo: "papiro", monto: 1, proveedor_id: "pr" },
      ],
      gastos: [{ id: "g1", persona: "Marisol", concepto: "taxi", monto: "15", fecha: "2026-10-23", tiene_compra: true }, { id: "g2", concepto: "avion", monto: 1 }],
      cierres: [{ id: "k1", persona: "Marisol", decision: "devuelve", monto: 200, plata_por_confirmar: 0 }, { id: "k2", decision: "se_queda", monto: 1 }],
      proveedores: [{ id: "pr", nombre: "Confecciones Lupe", ruc: null }, { nombre: "sin id" }],
    });
    expect(r?.papeles).toHaveLength(1);
    expect(r?.papeles[0].monto).toBe(330);
    expect(r?.papeles[0].lineas).toHaveLength(1);
    expect(r?.papeles[0].lineas[0].faltan).toEqual([{ cantidad: 1, causa: "no_vino" }]);
    expect(r?.papeles[0].envios).toEqual([{ id: "e1", numero: 179, estado: "cerrado" }]);
    expect(r?.cierres.map((c) => c.id)).toEqual(["k1"]);
    expect(r?.gastos.map((g) => `${g.id}:${g.monto}:${g.tieneCompra}`)).toEqual(["g1:15:true"]);
    expect(r?.proveedores).toEqual([{ id: "pr", nombre: "Confecciones Lupe", ruc: null }]);
  });

  it("una respuesta que no es la esperada es null (la base sin la migración)", () => {
    expect(leerRevisarCompras(null)).toBeNull();
    expect(leerRevisarCompras({ papeles: [] })).toBeNull();
    expect(leerRevisarCompras([])).toBeNull();
  });
});

describe("veredictoPapel: los cuatro casos", () => {
  const dos = [linea(), linea({ id: "l2", cantidad: 2, costo: 10, subtotal: 20, mandadas: 2 })];
  it("cuadra todo: el papel dice lo que suman las prendas y no faltó nada", () => {
    expect(veredictoPapel({ monto: 260, lineas: dos })).toMatchObject({ caso: "cuadra", anotado: 260, unidades: 8, faltan: 0 });
  });
  it("la plata no cuadra: el papel dice otra cosa", () => {
    expect(veredictoPapel({ monto: 250, lineas: dos }).caso).toBe("plata");
  });
  it("faltan prendas: la plata cuadra pero la tienda dijo que algo faltó", () => {
    const faltan = [dos[0], { ...dos[1], faltan: [{ cantidad: 1, causa: "no_vino" as const }] }];
    expect(veredictoPapel({ monto: 260, lineas: faltan })).toMatchObject({ caso: "faltan", faltan: 1 });
    expect(veredictoPapel({ monto: 250, lineas: faltan }).caso).toBe("nada");
  });
  it("con el monto que corrige Compras, el veredicto se mueve", () => {
    expect(veredictoPapel({ monto: 250, lineas: dos }, 260).caso).toBe("cuadra");
  });
  it("un medio céntimo de redondeo no descuadra", () => {
    expect(veredictoPapel({ monto: 100, lineas: [linea({ cantidad: 3, costo: 33.33, subtotal: 99.999 })] }).caso).toBe("cuadra");
  });
});

describe("textos del veredicto y de la llegada", () => {
  it("manda el papel: dice qué queda en el comprobante, con IGV en factura", () => {
    const v = veredictoPapel({ monto: 250, lineas: [linea({ cantidad: 1, costo: 260, subtotal: 260 })] });
    expect(fraseVeredicto(v, "boleta")).toMatch(/El papel dice S\/\s250\.00 y las prendas anotadas suman S\/\s260\.00: el comprobante queda por lo del papel\./);
    expect(fraseVeredicto(v, "factura")).toMatch(/\(con su IGV\)/);
  });
  it("lo que faltó lo dijo la tienda", () => {
    const l = linea({ faltan: [{ cantidad: 2, causa: "no_vino" }, { cantidad: 1, causa: "se_perdio" }] });
    expect(textoFaltan(l)).toBe("2 no vino: está en «Nos debe» del proveedor · 1 se perdió: lo asume CAYLA");
    expect(textoFaltan(linea())).toBeNull();
  });
  it("dónde está una compra que no llegó", () => {
    expect(textoLlegada({ llego: true, lineas: [], envios: [] })).toBe("Llegó a la tienda");
    expect(textoLlegada({ llego: false, lineas: [linea({ mandadas: 2 })], envios: [] })).toBe("Falta mandarla a la tienda");
    expect(textoLlegada({ llego: false, lineas: [linea()], envios: [{ id: "e", numero: 1, estado: "abierto" }] })).toBe("La tienda la está contando");
    expect(textoLlegada({ llego: false, lineas: [linea()], envios: [{ id: "e", numero: 1, estado: "en_camino" }] })).toBe("En camino a la tienda");
  });
});

describe("completar el papel: lo mismo que rechaza la base", () => {
  it("serie: letras y números, hasta 8; número: solo números, hasta 12 (en nota de venta, opcional)", () => {
    expect(problemaSerie("f001")).toBeNull();
    expect(problemaSerie("")).toMatch(/Copia la serie/);
    expect(problemaSerie("F-001")).toMatch(/hasta 8/);
    expect(problemaNumero("00012345", "boleta")).toBeNull();
    expect(problemaNumero("12a", "factura")).toMatch(/solo números/);
    expect(problemaNumero("", "boleta")).toMatch(/Copia el número/);
    expect(problemaNumero("", "nota_venta")).toBeNull();
    expect(problemaNumero("NV-12", "nota_venta")).toBeNull();
  });

  it("los campos siguen al papel, para todos los tipos", () => {
    const vacio = { serie: "", numero: "", cambiaMonto: false, monto: "" };
    const ids = (t: TipoPapel) => camposCompletar(vacio, t, PERSONA).map((c) => `${c.id}:${c.requerido}`);
    expect(ids("factura")).toEqual(["serie:true", "numero:true"]);
    expect(ids("boleta")).toEqual(["serie:true", "numero:true"]);
    expect(ids("nota_venta")).toEqual(["numero:false"]);
    expect(ids("sin_comprobante")).toEqual([]);
    for (const t of Object.keys(TIPOS_PAPEL) as TipoPapel[]) expect(ejemploSerie(t)).toMatch(/^Ej\. [FB]001$/);
  });

  it("cambiar el monto lo vuelve un campo, y desde una terminal se pide quién completa", () => {
    const c = camposCompletar({ serie: "B001", numero: "1", cambiaMonto: true, monto: "" }, "boleta", { esPersona: false, listo: false, motivo: null });
    expect(c.map((x) => `${x.id}:${x.hecho}`)).toEqual(["serie:true", "numero:true", "monto:false", "responsable:false"]);
  });

  it("el botón dice qué se guarda", () => {
    expect(fraseCompletar()).toBe("Completar y pasar a los libros");
  });
});

describe("los cierres del día", () => {
  it("lo que espera a Compras y su botón", () => {
    expect(botonCierre({ decision: "devuelve", persona: "Marisol Quispe" }, 200)).toMatch(/^Recibir S\/\s200\.00$/);
    expect(botonCierre({ decision: "le_deben", persona: "Marisol Quispe" }, 50)).toMatch(/^Pagarle S\/\s50\.00 a Marisol$/);
  });

  it("pide la cuenta y el monto", () => {
    const cuentas = [{ id: "b", nombre: "BCP", tipo: "banco" as const, sede: null }];
    expect(camposCierre({ cuentaId: "", monto: "200" }, "devuelve", cuentas, PERSONA).map((c) => `${c.nombre}:${c.hecho}`)).toEqual([
      "A dónde vuelve:false",
      "Cuánto:true",
    ]);
    expect(camposCierre({ cuentaId: "b", monto: "" }, "le_deben", cuentas, PERSONA)[0].nombre).toBe("De dónde sale");
  });
});

describe("los gastos que no son ropa", () => {
  const conceptos = Object.keys(CONCEPTOS_GASTO) as ConceptoGasto[];

  it("sin papel solo pasan el taxi y el cargador (planilla de movilidad); todos aceptan boleta, factura y ticket", () => {
    for (const c of conceptos) {
      const papeles = papelesParaGasto(c);
      expect(papeles.slice(0, 3)).toEqual(["boleta", "factura", "ticket"]);
      expect(papeles.includes("planilla_movilidad")).toBe(c === "taxi" || c === "cargador");
    }
  });

  it("el papel que llega elegido: sin foto, el taxi y el cargador van en la planilla; con foto o lo demás, lo elige quien revisa", () => {
    expect(papelSugerido({ concepto: "taxi", fotoRuta: null })).toBe("planilla_movilidad");
    expect(papelSugerido({ concepto: "cargador", fotoRuta: null })).toBe("planilla_movilidad");
    expect(papelSugerido({ concepto: "taxi", fotoRuta: "gastos/a.jpg" })).toBeNull();
    expect(papelSugerido({ concepto: "comida", fotoRuta: null })).toBeNull();
  });

  it("el ejemplo de la serie sigue al papel, para todos los papeles", () => {
    expect(ejemploSerieNumero("factura")).toBe("Ej. F001-123");
    expect(ejemploSerieNumero("boleta")).toBe("Ej. B001-123");
    for (const p of [null, "ticket", "planilla_movilidad"] as const) expect(ejemploSerieNumero(p)).toBe("Como dice el papel");
    expect(Object.keys(PAPELES_GASTO)).toHaveLength(4);
  });

  it("los campos: el papel es obligatorio; serie y RUC opcionales (el RUC, sugerido en factura); sin papel no hay número", () => {
    const ids = (papel: Parameters<typeof camposRevisarGasto>[0]["papel"], c: ConceptoGasto = "taxi") =>
      camposRevisarGasto({ papel, serieNumero: "", ruc: "" }, c, PERSONA).map((x) => `${x.id}:${x.requerido}${x.sugerido ? ":sugerido" : ""}`);
    expect(ids(null)).toEqual(["papel:true"]);
    expect(ids("planilla_movilidad")).toEqual(["papel:true"]);
    expect(ids("factura")).toEqual(["papel:true", "serie:false", "ruc:false:sugerido"]);
    expect(ids("planilla_movilidad", "comida")).toEqual(["papel:true"]);
    expect(camposRevisarGasto({ papel: "planilla_movilidad", serieNumero: "", ruc: "" }, "comida", PERSONA)[0].hecho).toBe(false);
    expect(problemaRuc("2060")).toMatch(/11 números/);
    expect(problemaRuc("20601234567")).toBeNull();
    expect(problemaRuc("")).toBeNull();
    expect(fraseRevisarGasto(15)).toMatch(/^Pasar S\/\s15\.00 a los gastos$/);
  });
});

describe("la bandeja de Revisar compras (rediseño)", () => {
  const linea = (cantidad: number, faltan = 0) => ({ id: "l", nombre: "x", cantidad, costo: 1, subtotal: cantidad, destino: "AQP", mandadas: cantidad, faltan: faltan ? [{ cantidad: faltan, causa: "no_vino" as const }] : [], sobran: 0 });
  it("lo que llegó: todo, o cuántos faltaron; antes de llegar, dónde está", () => {
    expect(llegadaDePapel({ llego: true, lineas: [linea(20), linea(15)] })).toEqual({ llegaron: 35, total: 35, completa: true });
    expect(llegadaDePapel({ llego: true, lineas: [linea(14, 2)] })).toEqual({ llegaron: 12, total: 14, completa: false });
    expect(llegadaDePapel({ llego: false, lineas: [linea(14)] })).toBeNull();
    expect(chipPapel({ llego: true, lineas: [linea(14, 2)], envios: [] })).toEqual({ tono: "ambar", texto: "Faltaron 2" });
    expect(chipPapel({ llego: true, lineas: [linea(3, 1)], envios: [] })).toEqual({ tono: "ambar", texto: "Faltó 1" });
    expect(chipPapel({ llego: true, lineas: [linea(3)], envios: [] })).toEqual({ tono: "verde", texto: "Llegó todo" });
    expect(chipPapel({ llego: false, lineas: [linea(3)], envios: [{ id: "e", numero: 1, estado: "en_camino" }] })).toEqual({ tono: "pizarra", texto: "En camino" });
    expect(chipPapel({ llego: false, lineas: [{ ...linea(3), mandadas: 1 }], envios: [] }).texto).toBe("Sin mandar");
    expect(chipPapel({ llego: false, lineas: [linea(3)], envios: [{ id: "e", numero: 1, estado: "abierto" }] }).texto).toBe("La tienda cuenta");
  });
  it("cada fila dice qué es, de quién y su estado", () => {
    expect(filaPlata({ id: "a", persona: "Marisol", medio: "yape_plin", monto: 500, fecha: "2026-10-23", fotoRuta: "plata/x.jpg" })).toMatchObject({ titulo: "Yape o Plin · con foto", cuando: "23/10", chip: { texto: "Por confirmar" } });
    expect(filaPlata({ id: "a", persona: "M", medio: "ya_tenia", monto: 1, fecha: "", fotoRuta: null }).titulo).toBe("Ya tenía de antes");
    expect(filaPapel({ id: "p", persona: "M", proveedor: "Textiles Rosa", tipo: "factura", monto: 525, fecha: "2026-10-22", ronda: "RC-000003", llego: true, lineas: [linea(35)], envios: [] })).toMatchObject({ titulo: "Textiles Rosa · Factura", cuando: "22/10 · RC-000003", chip: { tono: "verde" } });
    expect(filaGasto({ id: "g", persona: "M", concepto: "taxi", nota: null, monto: 12, fecha: "2026-10-23", ronda: null, fotoRuta: null }).titulo).toBe("Taxi · sin papel");
    expect(filaCierre({ id: "c", persona: "L", decision: "le_deben", monto: 20, fecha: "2026-10-22", ronda: "RC-000002" }).chip).toEqual({ tono: "ambar", texto: "Le debemos" });
    // Lo de antes de las rondas, solo el día.
    expect(diaYRonda("2026-10-22", null)).toBe("22/10");
    expect(diaYRonda("", "RC-000002")).toBe("RC-000002");
  });
  it("al entrar se abre la primera lista con algo; el detalle es el elegido o el primero, y «Más tarde» pasa al siguiente", () => {
    expect(bandejaInicial({ plata: 0, papel: 2, gasto: 3, cierre: 0 })).toBe("papel");
    expect(bandejaInicial({ plata: 0, papel: 0, gasto: 0, cierre: 0 })).toBe("plata");
    const l = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(elegidoDeBandeja(l, "b")?.id).toBe("b");
    expect(elegidoDeBandeja(l, "z")?.id).toBe("a");
    expect(elegidoDeBandeja([], "a")).toBeNull();
    expect(siguienteDeBandeja(l, "b")).toBe("c");
    expect(siguienteDeBandeja(l, "c")).toBe("a");
    expect(siguienteDeBandeja([], "a")).toBeNull();
  });
});

describe("cómo se le pagó al proveedor (20261023181000)", () => {
  const P = { monto: 300, persona: "Sandra Ríos" };
  const plano = (x: string) => x.replace(/\u00a0/g, " ");
  it("todo, una parte o nada", () => {
    expect(textoPagoPapel({ ...P, pagado: 300, medioPago: "yape" })).toBe("Sandra le pagó todo con Yape.");
    expect(plano(textoPagoPapel({ ...P, pagado: 100, medioPago: "efectivo" }))).toBe("Sandra le pagó S/ 100.00 con efectivo. Compras le paga lo que falta, S/ 200.00, desde Por pagar.");
    expect(plano(textoPagoPapel({ ...P, pagado: 0, medioPago: null }))).toBe("Sandra no le pagó al proveedor: Compras le paga los S/ 300.00 desde Por pagar.");
  });
});
