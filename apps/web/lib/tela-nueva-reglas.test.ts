import { describe, expect, it } from "vitest";
import { estadosDe, faltanDe, sePuedeConfirmar } from "./guia-campos";
import {
  camposDeTelaNueva,
  codigoDeVistaPrevia,
  costoTotalDeFila,
  metrosDeFila,
  payloadDeTelaNueva,
  prefijoDeTela,
  problemasDeTelaNueva,
  rindeEscrito,
  telaParecida,
  tieneSaldo,
  type EntradaTelaNueva,
  type FilaDeColor,
} from "./tela-nueva-reglas";

// «Nueva tela» (ADR-0554, actividad 2): la guía dice lo mismo que la hoja —se puede guardar exactamente cuando `problemasDeTelaNueva` no encuentra nada y alguien firma—, y lo que se manda a la base
// es lo que la base espera: la merma como fracción, el saldo en METROS con su costo total.

const fila = (color: string, extra: Partial<FilaDeColor> = {}): FilaDeColor => ({ color, ya: "", costo: "", minimo: "", ...extra });
const base: EntradaTelaNueva = {
  nombre: "Milano Melange",
  tejidoId: "",
  composicion: "",
  compra: "metro",
  ancho: "",
  gramaje: "",
  metrosPorRollo: "",
  merma: "",
  filas: [fila("ARN")],
  puedeSaldo: true,
  responsableListo: true,
};
const kilo: EntradaTelaNueva = { ...base, compra: "kilo", ancho: "160", gramaje: "180" };

describe("el rinde: metros que salen de un kilo", () => {
  it("1000 ÷ (gramaje × ancho en metros): 180 g/m² a 1,60 m rinden 3,47 m por kilo", () => {
    expect(rindeEscrito(kilo)).toBeCloseTo(3.4722, 3);
  });
  it("con la coma decimal también, y sin ancho o sin gramaje no hay rinde", () => {
    expect(rindeEscrito({ ancho: "160,5", gramaje: "180" })).toBeCloseTo(1000 / (180 * 1.605), 3);
    expect(rindeEscrito({ ancho: "", gramaje: "180" })).toBeNull();
    expect(rindeEscrito({ ancho: "160", gramaje: "0" })).toBeNull();
    expect(rindeEscrito({ ancho: "abc", gramaje: "180" })).toBeNull();
  });
});

describe("cuántos metros entran por una fila", () => {
  it("por metro: lo escrito; por kilo: los kilos por el rinde; por rollo: los rollos por los metros de un rollo", () => {
    expect(metrosDeFila(base, fila("ARN", { ya: "9" }))).toBe(9);
    expect(metrosDeFila(kilo, fila("ARN", { ya: "48,2" }))).toBeCloseTo(48.2 * 3.4722, 2);
    expect(metrosDeFila({ ...base, compra: "rollo", metrosPorRollo: "80" }, fila("ARN", { ya: "3" }))).toBe(240);
  });
  it("lo que no se puede convertir o no se entiende es null, nunca 0", () => {
    expect(metrosDeFila({ ...base, compra: "kilo" }, fila("ARN", { ya: "5" }))).toBeNull();
    expect(metrosDeFila({ ...base, compra: "rollo" }, fila("ARN", { ya: "2" }))).toBeNull();
    expect(metrosDeFila(base, fila("ARN", { ya: "1.200" }))).toBeNull();
    expect(metrosDeFila(base, fila("ARN"))).toBeNull();
  });
  it("una fila tiene saldo solo si lo escrito es mayor que cero", () => {
    expect(tieneSaldo(fila("ARN", { ya: "9" }))).toBe(true);
    expect(tieneSaldo(fila("ARN", { ya: "0" }))).toBe(false);
    expect(tieneSaldo(fila("ARN"))).toBe(false);
    expect(tieneSaldo(fila("ARN", { ya: "x" }))).toBe(false);
  });
});

describe("cuánto vale lo que ya hay", () => {
  it("cantidad × costo, a céntimos, con la coma decimal", () => {
    expect(costoTotalDeFila(fila("ARN", { ya: "9", costo: "10" }))).toBe(90);
    expect(costoTotalDeFila(fila("ARN", { ya: "48,2", costo: "2,5" }))).toBe(120.5);
    expect(costoTotalDeFila(fila("ARN", { ya: "3", costo: "0,33" }))).toBe(0.99);
  });
  it("un costo vacío o que no se entiende NO es cero; un 0 escrito sí lo es (un regalo)", () => {
    expect(costoTotalDeFila(fila("ARN", { ya: "9", costo: "" }))).toBeNull();
    expect(costoTotalDeFila(fila("ARN", { ya: "9", costo: "abc" }))).toBeNull();
    expect(costoTotalDeFila(fila("ARN", { ya: "9", costo: "0" }))).toBe(0);
  });
});

describe("problemasDeTelaNueva", () => {
  it("una tela con nombre y un color se puede guardar, aunque el color no traiga nada más", () => {
    expect(problemasDeTelaNueva(base)).toEqual([]);
  });
  it("sin nombre, sin colores y con la merma fuera de rango se dice, en ese orden", () => {
    expect(problemasDeTelaNueva({ ...base, nombre: "  " })).toEqual(["Ponle un nombre a la tela."]);
    expect(problemasDeTelaNueva({ ...base, filas: [] })).toEqual(["Elige al menos un color."]);
    for (const m of ["50", "75", "-1", "abc"]) expect(problemasDeTelaNueva({ ...base, merma: m }), m).toEqual(["La merma va de 0 % a menos de 50 %."]);
    for (const m of ["0", "5", "2,5", "49,9"]) expect(problemasDeTelaNueva({ ...base, merma: m }), m).toEqual([]);
  });
  it("por kilo pide el ancho y el gramaje; por rollo, los metros de un rollo", () => {
    expect(problemasDeTelaNueva({ ...base, compra: "kilo" })).toEqual(["Para pasar los kilos a metros hace falta el ancho y el gramaje de la tela."]);
    expect(problemasDeTelaNueva(kilo)).toEqual([]);
    expect(problemasDeTelaNueva({ ...base, compra: "rollo" })).toEqual(["Di cuántos metros trae un rollo (lo habitual)."]);
    expect(problemasDeTelaNueva({ ...base, compra: "rollo", metrosPorRollo: "80" })).toEqual([]);
  });
  it("un saldo pide su costo; un número que no se entiende no pasa como cero", () => {
    expect(problemasDeTelaNueva({ ...base, filas: [fila("ARN", { ya: "9" })] })).toEqual(["Un color con saldo necesita su costo (escribe 0 si no lo sabes)."]);
    expect(problemasDeTelaNueva({ ...base, filas: [fila("ARN", { ya: "9", costo: "0" })] })).toEqual([]);
    expect(problemasDeTelaNueva({ ...base, filas: [fila("ARN", { ya: "1.200", costo: "5" })] })).toEqual(["No se entiende la cantidad: escríbela así, 48.2 o 48,2."]);
    expect(problemasDeTelaNueva({ ...base, filas: [fila("ARN", { ya: "9", costo: "2,5,5" })] })).toEqual(["No se entiende el monto: escríbelo así, 1299.50 o 1299,50."]);
  });
  it("quien no es líder no anota saldo (dinero)", () => {
    expect(problemasDeTelaNueva({ ...base, puedeSaldo: false, filas: [fila("ARN", { ya: "9", costo: "10" })] })).toEqual(["El saldo inicial, con su costo, lo anota el líder."]);
    expect(problemasDeTelaNueva({ ...base, puedeSaldo: false })).toEqual([]);
  });
});

describe("la guía de «Nueva tela»", () => {
  const casos: [string, Partial<EntradaTelaNueva>][] = [
    ["completa", {}],
    ["sin nombre", { nombre: "" }],
    ["sin colores", { filas: [] }],
    ["merma buena", { merma: "5" }],
    ["merma rota", { merma: "80" }],
    ["por kilo, completa", { compra: "kilo", ancho: "160", gramaje: "180" }],
    ["por kilo, sin medidas", { compra: "kilo" }],
    ["por rollo, completa", { compra: "rollo", metrosPorRollo: "80" }],
    ["por rollo, sin metros", { compra: "rollo" }],
    ["con saldo y costo", { filas: [fila("ARN", { ya: "9", costo: "10" })] }],
    ["con saldo sin costo", { filas: [fila("ARN", { ya: "9" })] }],
    ["con número roto", { filas: [fila("ARN", { ya: "x" })] }],
    ["saldo de quien no es líder", { puedeSaldo: false, filas: [fila("ARN", { ya: "9", costo: "10" })] }],
  ];
  for (const [nombre, cambio] of casos) {
    for (const firma of [true, false]) {
      it(`${nombre}${firma ? "" : " · sin responsable"}: el botón se enciende justo cuando la hoja lo aceptaría`, () => {
        const e = { ...base, ...cambio, responsableListo: firma };
        expect(sePuedeConfirmar(camposDeTelaNueva(e))).toBe(problemasDeTelaNueva(e).length === 0 && firma);
      });
    }
  }
  it("el tejido y la composición se SUGIEREN (salen en «falta») pero nunca bloquean", () => {
    const campos = camposDeTelaNueva(base);
    expect(faltanDe(campos).map((c) => c.id)).toEqual(["tejido", "composicion"]);
    expect(sePuedeConfirmar(campos)).toBe(true);
  });
  it("lo que sigue es lo primero que falta, en el orden de la hoja", () => {
    expect(estadosDe(camposDeTelaNueva({ ...base, nombre: "", filas: [], responsableListo: false }))).toMatchObject({ nombre: "ahora", colores: "falta", quien: "falta" });
  });
});

describe("lo que se manda a la base", () => {
  it("la merma va como fracción y la tela, siempre como tela", () => {
    const p = payloadDeTelaNueva({ ...base, merma: "5", tejidoId: "t1", composicion: " 100 % algodón " });
    expect(p.material).toMatchObject({ nombre: "Milano Melange", tipo: "tela", tejido_id: "t1", composicion: "100 % algodón", unidad_compra: "metro", merma_pct: 0.05 });
    expect(p.material).not.toHaveProperty("ancho_cm");
  });
  it("por kilo manda el ancho y el gramaje; por rollo, los metros de un rollo", () => {
    expect(payloadDeTelaNueva(kilo).material).toMatchObject({ unidad_compra: "kilo", ancho_cm: 160, gramaje_gm2: 180 });
    expect(payloadDeTelaNueva({ ...base, compra: "rollo", metrosPorRollo: "80" }).material).toMatchObject({ unidad_compra: "rollo", metros_por_rollo: 80 });
  });
  it("el saldo viaja en METROS con su costo total; sin saldo no viaja nada", () => {
    const p = payloadDeTelaNueva({ ...kilo, filas: [fila("ARN", { ya: "48,2", costo: "25" }), fila("NEG"), fila("MAR", { minimo: "30" })] });
    expect(p.colores[0]).toMatchObject({ color_codigo: "ARN", stock_minimo: null, saldo_inicial: { cantidad: 167.361, costo_total: 1205 } });
    expect(p.colores[1]).toEqual({ color_codigo: "NEG", stock_minimo: null });
    expect(p.colores[2]).toEqual({ color_codigo: "MAR", stock_minimo: 30 });
  });
});

describe("el código se arma solo", () => {
  it("el prefijo son las 3 primeras letras de la primera palabra; sin letras, TEL", () => {
    expect(prefijoDeTela("Milano Melange")).toBe("MIL");
    expect(prefijoDeTela("  Jersey pima")).toBe("JER");
    expect(prefijoDeTela("Té")).toBe("TE");
    expect(prefijoDeTela("30/1 algodón")).toBe("TEL");
    expect(prefijoDeTela("")).toBe("TEL");
  });
  it("la vista previa toma el siguiente número de ese prefijo y deja en paz los demás", () => {
    expect(codigoDeVistaPrevia("Milano Melange", [])).toBe("MIL-01");
    expect(codigoDeVistaPrevia("Milano Melange", [{ codigo: "MIL-01" }, { codigo: "LIN-07" }])).toBe("MIL-02");
    expect(codigoDeVistaPrevia("Milano Otro", [{ codigo: "MIL-01" }, { codigo: "MIL-04" }])).toBe("MIL-05");
  });
});

describe("¿ya hay una tela así?", () => {
  const telas = [
    { nombre: "Milano Melange", tipo: "tela" as const },
    { nombre: "Botón nácar", tipo: "avio" as const },
  ];
  it("el mismo nombre (aunque cambien mayúsculas, tildes o espacios) es la misma tela", () => {
    expect(telaParecida("  milano   MELANGE ", telas)).toMatchObject({ igual: true, tela: { nombre: "Milano Melange" } });
  });
  it("un nombre contenido o con una letra de más es parecido, no igual", () => {
    expect(telaParecida("Milano", telas)).toMatchObject({ igual: false });
    expect(telaParecida("Milano Melanje", telas)).toMatchObject({ igual: false });
  });
  it("lo que nada tiene que ver, y los avíos, no avisan", () => {
    expect(telaParecida("Jersey pima", telas)).toBeNull();
    expect(telaParecida("Botón nácar", telas)).toBeNull();
    expect(telaParecida("", telas)).toBeNull();
  });
});
