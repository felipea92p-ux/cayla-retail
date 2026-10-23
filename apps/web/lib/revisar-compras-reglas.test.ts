import { describe, expect, it } from "vitest";
import {
  botonCierre,
  camposCierre,
  camposCompletar,
  ejemploSerie,
  fraseCompletar,
  fraseVeredicto,
  leerRevisarCompras,
  problemaNumero,
  problemaSerie,
  textoCierrePorRecibir,
  textoFaltan,
  textoLlegada,
  veredictoPapel,
  type LineaPapel,
} from "./revisar-compras-reglas";
import { TIPOS_PAPEL, type TipoPapel } from "./compra-rapida-reglas";

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
      cierres: [{ id: "k1", persona: "Marisol", decision: "devuelve", monto: 200, plata_por_confirmar: 0 }, { id: "k2", decision: "se_queda", monto: 1 }],
      proveedores: [{ id: "pr", nombre: "Confecciones Lupe", ruc: null }, { nombre: "sin id" }],
    });
    expect(r?.papeles).toHaveLength(1);
    expect(r?.papeles[0].monto).toBe(330);
    expect(r?.papeles[0].lineas).toHaveLength(1);
    expect(r?.papeles[0].lineas[0].faltan).toEqual([{ cantidad: 1, causa: "no_vino" }]);
    expect(r?.papeles[0].envios).toEqual([{ id: "e1", numero: 179, estado: "cerrado" }]);
    expect(r?.cierres.map((c) => c.id)).toEqual(["k1"]);
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
    expect(fraseCompletar("boleta", 330)).toMatch(/^Guardar la boleta de S\/\s330\.00$/);
    expect(fraseCompletar("sin_comprobante", null)).toBe("Guardar la compra");
  });
});

describe("los cierres del día", () => {
  it("lo que espera a Compras y su botón", () => {
    expect(textoCierrePorRecibir({ decision: "devuelve", monto: 200 })).toMatch(/^Devuelve S\/\s200\.00$/);
    expect(textoCierrePorRecibir({ decision: "le_deben", monto: 50 })).toMatch(/^Le debemos S\/\s50\.00$/);
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
