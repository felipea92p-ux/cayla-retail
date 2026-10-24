import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GastoFijoMes } from "./gastos-reglas";
import { bajadaDeLaCola, choqueConElFijo, claveDeFijo, colaDeFijos, fijosDelMesVisibles, fijosQueSeParecen, mesDelFijo, sinRepetidos, textoFechaDeFijo, tituloDeLaCola } from "./fijos-del-mes-reglas";

const F = (p: Partial<GastoFijoMes> & Pick<GastoFijoMes, "id" | "estado" | "fechaEsperada">): GastoFijoMes => ({
  ubicacionId: null, ubicacionNombre: "De la empresa", categoria: "software", categoriaNombre: "Software", descripcion: p.id, proveedorId: null, proveedorNombre: null,
  comprobanteTipo: "sin_comprobante", monto: 100, montoVariable: false, diaDelMes: 15, momento: "dia", gastoId: null, gastoMonto: null, diasAntes: null, fechaPago: null, tocaPagar: false, ...p,
});

describe("colaDeFijos: lo que se lee de arriba abajo", () => {
  const fijos = [
    F({ id: "luz", estado: "por_llegar", fechaEsperada: "2026-10-31", monto: 280, montoVariable: true }),
    F({ id: "alquiler", estado: "por_llegar", fechaEsperada: "2026-10-31", monto: 4200 }),
    F({ id: "celular", estado: "falta", fechaEsperada: "2026-10-15", monto: 30, montoVariable: true }),
    F({ id: "ia", estado: "falta", fechaEsperada: "2026-10-17", monto: 690 }),
    F({ id: "musica", estado: "falta", fechaEsperada: "2026-10-15", monto: 35 }),
    F({ id: "internet", estado: "registrado", fechaEsperada: "2026-10-15", monto: 106, gastoId: "g1", gastoMonto: 110 }),
  ];
  const c = colaDeFijos(fijos);

  it("primero los que ya vencieron, el más atrasado primero y a igual fecha el de más monto", () => {
    expect(c.faltan.map((f) => f.id)).toEqual(["musica", "celular", "ia"]);
  });
  it("después los que vencen este mes: el más próximo primero y a igual fecha el de más monto", () => {
    expect(c.vienen.map((f) => f.id)).toEqual(["alquiler", "luz"]);
  });
  it("entre los que vencen este mes, los que ya «tocan pagar» suben aunque venzan más lejos", () => {
    const c2 = colaDeFijos([
      F({ id: "vence-antes", estado: "por_llegar", fechaEsperada: "2026-10-25", monto: 500 }),
      F({ id: "toca-pagar", estado: "por_llegar", fechaEsperada: "2026-10-31", monto: 100, diasAntes: 10, fechaPago: "2026-10-21", tocaPagar: true }),
    ]);
    expect(c2.vienen.map((f) => f.id)).toEqual(["toca-pagar", "vence-antes"]);
  });
  it("los registrados van aparte y no cuentan como pendientes", () => {
    expect(c.registrados.map((f) => f.id)).toEqual(["internet"]);
    expect(c.pendientes).toBe(5);
    expect(c.total).toBe(6);
    expect(c.montoPendiente).toBe(5235);
  });
  it("la suma es una referencia si algún pendiente es de monto variable", () => {
    expect(c.aproximado).toBe(true);
    expect(colaDeFijos([F({ id: "a", estado: "falta", fechaEsperada: "2026-10-15" })]).aproximado).toBe(false);
  });
  it("no cambia la lista que recibe", () => {
    const antes = fijos.map((f) => f.id);
    colaDeFijos(fijos);
    expect(fijos.map((f) => f.id)).toEqual(antes);
  });
});

describe("el título y la bajada", () => {
  it("el título dice el mes", () => {
    expect(tituloDeLaCola("2026-10")).toBe("Fijos de octubre 2026");
  });
  it("con pendientes: cuántos, cuánto suman y cuántos van", () => {
    const c = colaDeFijos([F({ id: "a", estado: "falta", fechaEsperada: "2026-10-15", monto: 30, montoVariable: true }), F({ id: "b", estado: "falta", fechaEsperada: "2026-10-15", monto: 37 }), F({ id: "c", estado: "registrado", fechaEsperada: "2026-10-15" })]);
    expect(bajadaDeLaCola(c, "2026-10")).toBe("2 por confirmar (~S/ 67) · 1 de 3 ya registrados.");
  });
  it("sin monto variable no lleva «~»", () => {
    expect(bajadaDeLaCola(colaDeFijos([F({ id: "a", estado: "por_llegar", fechaEsperada: "2026-10-31", monto: 4200 })]), "2026-10")).toBe("1 por confirmar (S/ 4,200) · 0 de 1 ya registrados.");
  });
  it("con todos registrados, lo dice; sin fijos, nada", () => {
    expect(bajadaDeLaCola(colaDeFijos([F({ id: "a", estado: "registrado", fechaEsperada: "2026-10-15" })]), "2026-10")).toBe("El fijo de octubre 2026 ya está registrado.");
    expect(bajadaDeLaCola(colaDeFijos([F({ id: "a", estado: "registrado", fechaEsperada: "2026-10-15" }), F({ id: "b", estado: "registrado", fechaEsperada: "2026-10-15" })]), "2026-10")).toBe("Los 2 fijos de octubre 2026 ya están registrados.");
    expect(bajadaDeLaCola(colaDeFijos([]), "2026-10")).toBe("");
  });
});

describe("textoFechaDeFijo: cuándo venció o cuándo vence", () => {
  const HOY = "2026-10-22";
  it("un fijo que ya venció dice su fecha y los días de atraso, en singular si es uno", () => {
    expect(textoFechaDeFijo(F({ id: "a", estado: "falta", fechaEsperada: "2026-10-15" }), HOY)).toBe("venció el 15 oct · hace 7 días");
    expect(textoFechaDeFijo(F({ id: "a", estado: "falta", fechaEsperada: "2026-10-21" }), HOY)).toBe("venció el 21 oct · hace 1 día");
  });
  it("cuenta bien los días al cruzar de mes", () => {
    expect(textoFechaDeFijo(F({ id: "a", estado: "falta", fechaEsperada: "2026-09-30" }), "2026-10-02")).toBe("venció el 30 sep · hace 2 días");
  });
  it("uno que vence: hoy, mañana, o la fecha y los días que faltan", () => {
    expect(textoFechaDeFijo(F({ id: "a", estado: "por_llegar", fechaEsperada: "2026-10-22" }), HOY)).toBe("vence hoy");
    expect(textoFechaDeFijo(F({ id: "a", estado: "por_llegar", fechaEsperada: "2026-10-23" }), HOY)).toBe("vence mañana");
    expect(textoFechaDeFijo(F({ id: "a", estado: "por_llegar", fechaEsperada: "2026-10-31" }), HOY)).toBe("vence el 31 oct · en 9 días");
  });
  it("uno ya registrado dice cuándo vence cada mes, como siempre", () => {
    expect(textoFechaDeFijo(F({ id: "a", estado: "registrado", fechaEsperada: "2026-10-15", momento: "quincena" }), HOY)).toBe("vence la quincena");
  });
  it("una fecha que no se lee no rompe la fila: cae a «cuándo vence»", () => {
    expect(textoFechaDeFijo(F({ id: "a", estado: "falta", fechaEsperada: "undefined", momento: "fin_de_mes" }), HOY)).toBe("vence a fin de mes");
  });
  // ADR-0487: un fijo que se paga con días de anticipo dice desde cuándo; uno ya vencido solo cuenta su atraso.
  it("si se paga con días de anticipo, dice desde cuándo se paga (también el que vence hoy y el ya registrado)", () => {
    const con = { diasAntes: 3, fechaPago: "2026-10-28" };
    expect(textoFechaDeFijo(F({ id: "a", estado: "por_llegar", fechaEsperada: "2026-10-31", ...con }), HOY)).toBe("vence el 31 oct · en 9 días · pagar desde el 28 oct");
    expect(textoFechaDeFijo(F({ id: "a", estado: "por_llegar", fechaEsperada: "2026-10-23", ...con }), HOY)).toBe("vence mañana · pagar desde el 28 oct");
    expect(textoFechaDeFijo(F({ id: "a", estado: "registrado", fechaEsperada: "2026-10-31", momento: "fin_de_mes", ...con }), HOY)).toBe("vence a fin de mes · pagar desde el 28 oct");
  });
  it("con 0 días de anticipo o sin la fecha de pago no agrega nada; el ya vencido solo cuenta su atraso", () => {
    expect(textoFechaDeFijo(F({ id: "a", estado: "por_llegar", fechaEsperada: "2026-10-31", diasAntes: 0, fechaPago: "2026-10-31" }), HOY)).toBe("vence el 31 oct · en 9 días");
    expect(textoFechaDeFijo(F({ id: "a", estado: "por_llegar", fechaEsperada: "2026-10-31", diasAntes: 3, fechaPago: null }), HOY)).toBe("vence el 31 oct · en 9 días");
    expect(textoFechaDeFijo(F({ id: "a", estado: "falta", fechaEsperada: "2026-10-15", diasAntes: 3, fechaPago: "2026-10-12" }), HOY)).toBe("venció el 15 oct · hace 7 días");
  });
});

describe("fijosQueSeParecen: un gasto suelto que parece un fijo pendiente", () => {
  const fijos = [
    F({ id: "alq-tru", estado: "por_llegar", fechaEsperada: "2026-10-31", categoria: "alquileres", ubicacionId: "tru", monto: 4200 }),
    F({ id: "alq-alm", estado: "por_llegar", fechaEsperada: "2026-10-31", categoria: "alquileres", ubicacionId: "tru", monto: 1300 }),
    F({ id: "alq-aqp", estado: "por_llegar", fechaEsperada: "2026-10-31", categoria: "alquileres", ubicacionId: "aqp", monto: 3300 }),
    F({ id: "sw", estado: "falta", fechaEsperada: "2026-10-15", categoria: "software", ubicacionId: null, monto: 37 }),
    F({ id: "luz-ya", estado: "registrado", fechaEsperada: "2026-10-15", categoria: "luz", ubicacionId: "tru", monto: 280 }),
  ];
  const g = (p: Partial<{ ubicacion: string; categoria: string; fecha: string; monto: number | null; proveedorId: string }> = {}) => ({ ubicacion: "tru", categoria: "alquileres", fecha: "2026-10-22", monto: null, ...p });
  const ids = (l: readonly GastoFijoMes[]) => l.map((f) => f.id);

  it("misma tienda, misma categoría y mismo mes: los fijos que aún no están registrados", () => {
    expect(ids(fijosQueSeParecen(fijos, g())).sort()).toEqual(["alq-alm", "alq-tru"]);
  });
  it("con el monto, el más cercano primero; el monto no descarta a ninguno (un fijo variable es solo una referencia)", () => {
    expect(ids(fijosQueSeParecen(fijos, g({ monto: 1250 })))).toEqual(["alq-alm", "alq-tru"]);
    expect(ids(fijosQueSeParecen(fijos, g({ monto: 4000 })))).toEqual(["alq-tru", "alq-alm"]);
    expect(fijosQueSeParecen(fijos, g({ monto: 9 }))).toHaveLength(2);
  });
  it("otra tienda, otra categoría o un fijo ya registrado no se parecen", () => {
    expect(fijosQueSeParecen(fijos, g({ ubicacion: "lim" }))).toEqual([]);
    expect(fijosQueSeParecen(fijos, g({ categoria: "internet" }))).toEqual([]);
    expect(fijosQueSeParecen(fijos, g({ categoria: "luz" }))).toEqual([]);
  });
  it("un fijo de la empresa se parece a un gasto «de la empresa», no al de una tienda", () => {
    expect(ids(fijosQueSeParecen(fijos, g({ ubicacion: "empresa", categoria: "software" })))).toEqual(["sw"]);
    expect(fijosQueSeParecen(fijos, g({ ubicacion: "tru", categoria: "software" }))).toEqual([]);
  });
  it("sin categoría todavía no hay nada que preguntar", () => {
    expect(fijosQueSeParecen(fijos, g({ categoria: "" }))).toEqual([]);
  });

  describe("el mes es el de CADA fijo, no el de la vista", () => {
    const dosMeses = [
      F({ id: "alq", estado: "falta", fechaEsperada: "2026-09-30", categoria: "alquileres", ubicacionId: "tru", monto: 4200 }),
      F({ id: "alq", estado: "por_llegar", fechaEsperada: "2026-10-31", categoria: "alquileres", ubicacionId: "tru", monto: 4200 }),
    ];
    it("un gasto de octubre solo se parece al fijo de octubre, y uno de septiembre al de septiembre (la base cuenta un gasto por fijo y por mes de la fecha del gasto)", () => {
      expect(fijosQueSeParecen(dosMeses, g({ fecha: "2026-10-22" })).map(mesDelFijo)).toEqual(["2026-10"]);
      expect(fijosQueSeParecen(dosMeses, g({ fecha: "2026-09-30" })).map(mesDelFijo)).toEqual(["2026-09"]);
      expect(fijosQueSeParecen(dosMeses, g({ fecha: "2026-11-02" }))).toEqual([]);
    });
    it("«No, es otro gasto» se contesta por mes: descartar octubre no descarta septiembre", () => {
      const sept = dosMeses[0]!;
      const oct = dosMeses[1]!;
      expect(fijosQueSeParecen(dosMeses, g({ fecha: "2026-10-22" }), new Set([claveDeFijo(oct)]))).toEqual([]);
      expect(fijosQueSeParecen(dosMeses, g({ fecha: "2026-09-30" }), new Set([claveDeFijo(oct)])).map(mesDelFijo)).toEqual(["2026-09"]);
      expect(claveDeFijo(sept)).not.toBe(claveDeFijo(oct));
    });
    it("sinRepetidos une dos lecturas sin repetir la fila de un fijo en un mismo mes", () => {
      const unidos = sinRepetidos([...dosMeses, ...dosMeses, F({ id: "otro", estado: "falta", fechaEsperada: "2026-10-15" })]);
      expect(unidos.map(claveDeFijo)).toEqual(["alq|2026-09", "alq|2026-10", "otro|2026-10"]);
    });
  });

  describe("quitar los descartados ANTES de recortar: ningún fijo queda escondido", () => {
    const cuatro = ["luz", "agua", "internet", "telefonia"].map((n, i) =>
      F({ id: n, estado: "por_llegar", fechaEsperada: "2026-10-31", categoria: "servicios_basicos", ubicacionId: "lim", monto: [300, 80, 120, 60][i]!, montoVariable: n === "luz" || n === "agua" }),
    );
    const sb = { ubicacion: "lim", categoria: "servicios_basicos", fecha: "2026-10-22" };
    it("con cuatro candidatos salen los cuatro; el de monto lejano (la luz variable) no se esconde", () => {
      expect(fijosQueSeParecen(cuatro, { ...sb, monto: 95 })).toHaveLength(4);
      expect(ids(fijosQueSeParecen(cuatro, { ...sb, monto: 95 }))).toContain("luz");
    });
    it("contestar «No» a algunos deja ver los demás", () => {
      const sin = new Set([claveDeFijo(cuatro[1]!), claveDeFijo(cuatro[2]!), claveDeFijo(cuatro[3]!)]);
      expect(ids(fijosQueSeParecen(cuatro, { ...sb, monto: 95 }, sin))).toEqual(["luz"]);
    });
  });

  describe("el proveedor", () => {
    const hidr = F({ id: "luz-h", estado: "por_llegar", fechaEsperada: "2026-10-31", categoria: "luz", ubicacionId: "tru", monto: 280, proveedorId: "hidrandina" });
    const sed = F({ id: "agua-s", estado: "por_llegar", fechaEsperada: "2026-10-31", categoria: "luz", ubicacionId: "tru", monto: 90, proveedorId: "sedalib" });
    const sinProv = F({ id: "luz-x", estado: "por_llegar", fechaEsperada: "2026-10-31", categoria: "luz", ubicacionId: "tru", monto: 100 });
    const base = { ubicacion: "tru", categoria: "luz", fecha: "2026-10-22", monto: null };
    it("un fijo con otro proveedor no se parece; el del mismo proveedor sube", () => {
      expect(ids(fijosQueSeParecen([hidr, sed, sinProv], { ...base, proveedorId: "hidrandina" }))).toEqual(["luz-h", "luz-x"]);
    });
    it("sin proveedor elegido todavía, no descarta a nadie", () => {
      expect(fijosQueSeParecen([hidr, sed, sinProv], base)).toHaveLength(3);
    });
  });
});

describe("choqueConElFijo: por qué un gasto no puede cerrar un fijo", () => {
  const alquiler = F({ id: "alquiler", descripcion: "Alquiler Lima", estado: "falta", fechaEsperada: "2026-10-31", categoria: "alquileres", categoriaNombre: "Alquileres" });
  const gasto = (fecha: string, categoria = alquiler.categoria) => ({ fecha, categoria });

  it("un gasto de su categoría y de su mes puede cerrarlo, cualquiera sea el día", () => {
    for (const fecha of ["2026-10-01", "2026-10-15", "2026-10-31"]) expect(choqueConElFijo(alquiler, gasto(fecha))).toBeNull();
  });

  describe("el mes", () => {
    it("un gasto de otro mes cerraría el mes equivocado: dice de qué mes tiene que ser y cuál fijo es", () => {
      const c = choqueConElFijo(alquiler, gasto("2026-09-30"));
      expect(c?.campo).toBe("fecha");
      expect(c?.mensaje).toBe("La fecha tiene que ser de octubre 2026 para cerrar «Alquiler Lima». Cámbiala, o registra el gasto aparte.");
    });
    it("el mes se mira por la fecha esperada del fijo, no por el mes de hoy: un fijo de septiembre pide septiembre", () => {
      const sept = F({ id: "luz", descripcion: "Luz Lima", estado: "falta", fechaEsperada: "2026-09-30" });
      expect(choqueConElFijo(sept, { fecha: "2026-09-12", categoria: sept.categoria })).toBeNull();
      expect(choqueConElFijo(sept, { fecha: "2026-10-01", categoria: sept.categoria })?.campo).toBe("fecha");
    });
    it("el mismo mes de otro año tampoco vale", () => {
      expect(choqueConElFijo(alquiler, gasto("2025-10-15"))?.campo).toBe("fecha");
    });
  });

  // /chaos del 22-oct (semilla 1023, FIJO-03): un mototaxi de S/ 12.50 enviado con el fijo del alquiler lo dejó «registrado» y nadie lo vio
  // más como pendiente. Se llega desde la pantalla: se abre la hoja con «Registrar» de la fila del fijo y se cambia la categoría.
  describe("la categoría", () => {
    it("un gasto de otra categoría no es ese fijo: dice cuál es la del fijo y que se registre aparte", () => {
      const c = choqueConElFijo(alquiler, gasto("2026-10-12", "transporte"));
      expect(c?.campo).toBe("categoria");
      expect(c?.mensaje).toBe("«Alquiler Lima» es de la categoría Alquileres: un gasto de otra categoría no puede cerrarlo. Registra el gasto aparte.");
    });
    it("sin categoría elegida tampoco es ese fijo", () => {
      expect(choqueConElFijo(alquiler, gasto("2026-10-12", ""))?.campo).toBe("categoria");
    });
    it("con la categoría mal y el mes mal, lo primero es la categoría: corregir solo la fecha no lo dejaría cerrar nada", () => {
      expect(choqueConElFijo(alquiler, gasto("2026-09-12", "transporte"))?.campo).toBe("categoria");
    });
    it("recorre todas las parejas de categorías: solo la misma categoría pasa", () => {
      const codigos = ["alquileres", "servicios_basicos", "software", "transporte", "suministros"];
      for (const delFijo of codigos) {
        const fijo = F({ id: `f-${delFijo}`, estado: "falta", fechaEsperada: "2026-10-31", categoria: delFijo, categoriaNombre: delFijo });
        for (const delGasto of codigos) {
          const c = choqueConElFijo(fijo, gasto("2026-10-12", delGasto));
          expect(c === null, `fijo ${delFijo} con gasto ${delGasto}`).toBe(delFijo === delGasto);
        }
      }
    });
  });
});

// El formulario tiene que usar el chequeo y no dejar elegir otra categoría cuando la hoja nace de un fijo (como ya hace con la tienda). Sin
// esta prueba, alguien puede quitar la llamada en una limpieza y la función sigue verde mientras la pantalla vuelve a dejar pasar el error.
// Se lee el código sin comentarios: una llamada comentada no cuenta.
describe("RegistrarGastoModal usa el chequeo con el fijo", () => {
  const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const fuente = sinComentarios(readFileSync(new URL("../components/RegistrarGastoModal.tsx", import.meta.url), "utf8"));
  const cuerpo = fuente.slice(fuente.indexOf("async function guardar()"));

  it("guardar() mira el gasto contra su fijo (categoría y fecha del formulario) y se detiene antes de mandarlo", () => {
    expect(cuerpo).toMatch(/const choque = fijoDelGasto \? choqueConElFijo\(fijoDelGasto, \{ categoria: b\.categoria, fecha: b\.fecha \}\) : null;\s*if \(choque\) return avisar\.error\(choque\.mensaje/);
    expect(cuerpo.indexOf("choqueConElFijo(")).toBeLessThan(cuerpo.indexOf("intento.enviar("));
  });
  it("la categoría queda fija cuando la hoja nace de un fijo, igual que la tienda", () => {
    const desde = fuente.indexOf('id="gasto-categoria"');
    expect(desde).toBeGreaterThan(0);
    expect(fuente.slice(desde, desde + 400)).toMatch(/deshabilitado=\{!!fijo\}/);
  });
});

describe("fijosDelMesVisibles: antes del inicio de Finanzas no hay fijos que confirmar", () => {
  const fijos = [F({ id: "a", estado: "falta", fechaEsperada: "2026-09-15" }), F({ id: "b", estado: "por_llegar", fechaEsperada: "2026-09-30" })];
  it("un mes anterior al inicio no muestra ninguno", () => {
    expect(fijosDelMesVisibles(fijos, "2026-09", "2026-10-01")).toEqual([]);
  });
  it("el mes del inicio, y los posteriores, los muestran todos", () => {
    expect(fijosDelMesVisibles(fijos, "2026-10", "2026-10-01")).toHaveLength(2);
    expect(fijosDelMesVisibles(fijos, "2026-11", "2026-10-01")).toHaveLength(2);
  });
  it("sin inicio elegido se muestran todos, aun en un mes viejo", () => {
    expect(fijosDelMesVisibles(fijos, "2025-01", null)).toHaveLength(2);
  });
});
