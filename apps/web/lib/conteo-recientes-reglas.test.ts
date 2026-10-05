import { describe, expect, it } from "vitest";
import {
  agruparPorDia,
  diaLimaDe,
  diaValido,
  horaLimaDe,
  apoyoDeResultado,
  cifraDeConteo,
  hrefRecientes,
  responsablesDeConteo,
  textoAperturaCierre,
  textoCierre,
  textoDiaLargo,
  textoPieRecientes,
  textoTotalRecientes,
  vistaDeRecientes,
} from "./conteo-recientes-reglas";
import type { ConteoResumen } from "./conteo-reglas";

// Lima va 5 horas detrás de UTC: 2026-09-30T16:58Z es 11:58 del 30/09 en Lima; 2026-10-01T03:30Z es 22:30 del 30/09.
function conteo(numero: number, creadoEn: string, extra: Partial<ConteoResumen> = {}): ConteoResumen {
  return {
    id: `c${numero}`,
    numero,
    estado: "cerrado",
    creadoEn,
    cerradoEn: creadoEn,
    sububicacionId: "s1",
    sububicacionNombre: "Almacén de tienda",
    sububicacionTipo: "almacen_tienda",
    alcance: "todo",
    alcanceCategoriaNombre: null,
    abiertoPorNombre: "Angie Chavez",
    cerradoPorNombre: "—",
    lineas: 2,
    lineasConDiferencia: 0,
    sistema: 2,
    contado: 2,
    diferencia: 0,
    pendientes: 0,
    parcial: false,
    variantes: 2,
    sinContar: 0,
    esArranque: false,
    ...extra,
  };
}

// Del más reciente al más antiguo, como los entrega la base. Hoy (Lima) = 2026-09-30.
const HOY = "2026-09-30";
const TODOS = [
  conteo(27, "2026-09-30T16:58:00Z"), // 11:58 del 30
  conteo(26, "2026-09-30T14:10:00Z"), // 09:10 del 30
  conteo(25, "2026-10-01T03:30:00Z"), // 22:30 del 30 (ya es 1/10 en UTC, sigue siendo 30/09 en Lima)
  conteo(11, "2026-09-29T22:40:00Z"), // 17:40 del 29
  conteo(10, "2026-09-29T21:05:00Z"), // 16:05 del 29
  conteo(5, "2026-09-24T19:10:00Z"), // 14:10 del 24
].sort((a, b) => Date.parse(b.creadoEn) - Date.parse(a.creadoEn));

describe("el día y la hora son los de Lima, no los de UTC", () => {
  it("un conteo de las 10:30 pm de Lima sigue siendo del mismo día aunque en UTC ya sea el siguiente", () => {
    expect(diaLimaDe("2026-10-01T03:30:00Z")).toBe("2026-09-30");
    expect(horaLimaDe("2026-10-01T03:30:00Z")).toBe("22:30");
    expect(diaLimaDe("2026-09-30T16:58:00Z")).toBe("2026-09-30");
    expect(horaLimaDe("2026-09-30T16:58:00Z")).toBe("11:58");
  });
  it("una hora de madrugada de Lima (00:30) es del día de Lima, no del anterior", () => {
    expect(diaLimaDe("2026-09-30T05:30:00Z")).toBe("2026-09-30");
    expect(horaLimaDe("2026-09-30T05:30:00Z")).toBe("00:30");
  });
});

describe("diaValido: solo una fecha real sale de la URL", () => {
  it("acepta aaaa-mm-dd reales", () => {
    expect(diaValido("2026-09-25")).toBe("2026-09-25");
    expect(diaValido(["2026-09-25", "2026-09-26"])).toBe("2026-09-25");
    expect(diaValido("2028-02-29")).toBe("2028-02-29"); // bisiesto
  });
  it("ignora lo que no es una fecha: la pantalla sale en «Todos» en vez de quedar en blanco", () => {
    expect(diaValido(undefined)).toBeNull();
    expect(diaValido("")).toBeNull();
    expect(diaValido("hoy")).toBeNull();
    expect(diaValido("25/09/2026")).toBeNull();
    expect(diaValido("2026-02-31")).toBeNull();
    expect(diaValido("2026-13-01")).toBeNull();
    expect(diaValido("2027-02-29")).toBeNull();
  });
});

describe("textos del día", () => {
  it("«miércoles 30 de setiembre»: con el mes como se dice en Perú", () => {
    expect(textoDiaLargo("2026-09-30")).toBe("miércoles 30 de setiembre");
    expect(textoDiaLargo("2026-09-17")).toBe("jueves 17 de setiembre");
  });
  it("con un año distinto al de hoy, lo dice", () => {
    expect(textoDiaLargo("2025-12-31", HOY)).toBe("miércoles 31 de diciembre de 2025");
    expect(textoDiaLargo("2026-09-30", HOY)).toBe("miércoles 30 de setiembre");
  });
});

describe("agruparPorDia: un grupo por día, en el orden de la base", () => {
  it("junta los del mismo día y deja a cada uno en su banda", () => {
    const g = agruparPorDia(TODOS);
    expect(g.map((x) => [x.dia, x.conteos.map((c) => c.numero)])).toEqual([
      ["2026-09-30", [25, 27, 26]],
      ["2026-09-29", [11, 10]],
      ["2026-09-24", [5]],
    ]);
  });
  it("sin conteos no hay bandas", () => {
    expect(agruparPorDia([])).toEqual([]);
  });
});

describe("vistaDeRecientes", () => {
  it("sin día: los más recientes hasta el tope, y los botones Hoy/Ayer cuentan de toda la lista", () => {
    const v = vistaDeRecientes(TODOS, HOY, null, 3);
    expect(v.mostrados).toHaveLength(3);
    expect(v.dia).toBeNull();
    expect(v.deHoy).toBe(3);
    expect(v.deAyer).toBe(2);
    expect(v.diasConConteos).toEqual(["2026-09-30", "2026-09-29", "2026-09-24"]);
    expect(v.anterior).toBeNull();
  });
  it("con día: solo los de ese día, aunque queden fuera del tope", () => {
    const v = vistaDeRecientes(TODOS, HOY, "2026-09-24", 3);
    expect(v.mostrados.map((c) => c.numero)).toEqual([5]);
  });
  it("«Hoy» trae los 3 de hoy y «Ayer» los 2 de ayer", () => {
    expect(vistaDeRecientes(TODOS, HOY, HOY).mostrados).toHaveLength(3);
    expect(vistaDeRecientes(TODOS, HOY, "2026-09-29").mostrados.map((c) => c.numero).sort((a, b) => a - b)).toEqual([10, 11]);
  });
  it("un día sin conteos: no hay filas y dice cuál fue el conteo anterior", () => {
    const v = vistaDeRecientes(TODOS, HOY, "2026-09-25");
    expect(v.mostrados).toEqual([]);
    expect(v.anterior).toEqual({ dia: "2026-09-24", numero: 5 });
  });
  it("un día anterior a todos los conteos: sin filas y sin «anterior»", () => {
    const v = vistaDeRecientes(TODOS, HOY, "2026-01-10");
    expect(v.mostrados).toEqual([]);
    expect(v.anterior).toBeNull();
  });
  it("un día de hoy sin conteos no rompe: cero en el botón y sin filas", () => {
    const v = vistaDeRecientes([conteo(5, "2026-09-24T19:10:00Z")], HOY, HOY);
    expect(v.deHoy).toBe(0);
    expect(v.mostrados).toEqual([]);
    expect(v.anterior).toEqual({ dia: "2026-09-24", numero: 5 });
  });
  it("una sede sin ningún conteo", () => {
    const v = vistaDeRecientes([], HOY, null);
    expect(v.mostrados).toEqual([]);
    expect(v.diasConConteos).toEqual([]);
  });
});

describe("frases al pie", () => {
  it("sin filtro dice que son los más recientes y cómo ver otro día; con filtro, qué día se ve", () => {
    const sin = vistaDeRecientes(TODOS, HOY, null, 3);
    expect(textoPieRecientes(sin)).toBe("Se muestran los 3 conteos más recientes. Para ver otro día, elige una fecha.");
    expect(textoTotalRecientes(sin)).toBe("Los 3 conteos más recientes");
    const con = vistaDeRecientes(TODOS, HOY, "2026-09-24");
    expect(textoPieRecientes(con)).toBe("Mostrando solo jueves 24 de setiembre.");
    expect(textoTotalRecientes(con)).toBe("1 conteo");
  });
  it("con menos conteos que el tope no dice «los más recientes»", () => {
    expect(textoTotalRecientes(vistaDeRecientes(TODOS, HOY, null, 20))).toBe("6 conteos");
  });
});

describe("hrefRecientes: el enlace conserva «Contar esta prenda»", () => {
  it("sin día ni prendas es la pantalla de siempre", () => {
    expect(hrefRecientes(null)).toBe("/inventario/conteo");
  });
  it("con día", () => {
    expect(hrefRecientes("2026-09-25")).toBe("/inventario/conteo?dia=2026-09-25");
  });
  it("cambiar de día no hace olvidar las prendas pedidas, ni al volver a «Todos»", () => {
    expect(hrefRecientes("2026-09-25", ["a", "b"])).toBe("/inventario/conteo?dia=2026-09-25&variantes=a,b");
    expect(hrefRecientes(null, ["a"])).toBe("/inventario/conteo?variantes=a");
  });
});

describe("textoAperturaCierre", () => {
  it("un conteo cerrado el mismo día: las dos horas", () => {
    expect(textoAperturaCierre({ estado: "cerrado", creadoEn: "2026-09-30T16:43:00Z", cerradoEn: "2026-09-30T16:52:00Z" })).toBe("Abierto 11:43 · cerrado 11:52");
  });
  it("cerrado otro día: dice cuál", () => {
    expect(textoAperturaCierre({ estado: "cerrado", creadoEn: "2026-09-30T23:40:00Z", cerradoEn: "2026-10-01T14:05:00Z" })).toBe("Abierto 18:40 · cerrado 01/10 09:05");
  });
  it("en curso o cancelado: solo la hora de apertura", () => {
    expect(textoAperturaCierre({ estado: "abierto", creadoEn: "2026-09-30T16:43:00Z", cerradoEn: null })).toBe("Abierto 11:43");
    expect(textoAperturaCierre({ estado: "anulado", creadoEn: "2026-09-30T16:43:00Z", cerradoEn: null })).toBe("Abierto 11:43");
  });
});

describe("responsablesDeConteo: la fila dice un nombre, y el de quien cerró solo si se sabe y es otra persona", () => {
  const base = { estado: "cerrado", abiertoPorNombre: "Angie Chavez", cerradoPorNombre: "—" };

  it("cerrado con la cuenta de tienda (sin nombre de quien cerró): solo quien abrió, nada de «Cerró —»", () => {
    expect(responsablesDeConteo(base)).toEqual({ abrio: "Angie Chavez", cerro: null });
  });
  it("cerrado por otra persona con nombre: se dicen las dos", () => {
    expect(responsablesDeConteo({ ...base, cerradoPorNombre: "Diana Palacios" })).toEqual({ abrio: "Angie Chavez", cerro: "Diana Palacios" });
  });
  it("cerrado por la misma persona: una sola vez", () => {
    expect(responsablesDeConteo({ ...base, cerradoPorNombre: "Angie Chavez" })).toEqual({ abrio: "Angie Chavez", cerro: null });
  });
  it("en curso o cancelado: nunca hay quien cerró, aunque el dato traiga un nombre", () => {
    expect(responsablesDeConteo({ ...base, estado: "abierto", cerradoPorNombre: "Diana Palacios" }).cerro).toBeNull();
    expect(responsablesDeConteo({ ...base, estado: "anulado", cerradoPorNombre: "Diana Palacios" }).cerro).toBeNull();
  });
  it("sin nombre de quien abrió («—» o vacío): null, no un guion", () => {
    expect(responsablesDeConteo({ ...base, abiertoPorNombre: "—" }).abrio).toBeNull();
    expect(responsablesDeConteo({ ...base, abiertoPorNombre: "  " }).abrio).toBeNull();
  });
});

describe("textoCierre y apoyoDeResultado: la línea bajo el resultado", () => {
  const cerrado = { estado: "cerrado", creadoEn: "2026-09-30T16:43:00Z", cerradoEn: "2026-09-30T16:52:00Z", lineas: 4, lineasConDiferencia: 0, parcial: false, variantes: 4 };

  it("cerrado el mismo día: la hora; otro día: la fecha y la hora", () => {
    expect(textoCierre(cerrado)).toBe("Cerrado 11:52");
    expect(textoCierre({ ...cerrado, creadoEn: "2026-09-30T23:40:00Z", cerradoEn: "2026-10-01T14:05:00Z" })).toBe("Cerrado 01/10 09:05");
  });
  it("en curso o cancelado no cerraron", () => {
    expect(textoCierre({ ...cerrado, estado: "abierto", cerradoEn: null })).toBeNull();
    expect(textoCierre({ ...cerrado, estado: "anulado", cerradoEn: null })).toBeNull();
  });
  it("el apoyo: cuándo cerró; «Sigue abierto» si está en curso; nada si se canceló", () => {
    expect(apoyoDeResultado(cerrado)).toBe("Cerrado 11:52");
    expect(apoyoDeResultado({ ...cerrado, estado: "abierto", cerradoEn: null, lineas: 3, variantes: 9 })).toBe("Sigue abierto");
    expect(apoyoDeResultado({ ...cerrado, estado: "anulado", cerradoEn: null, lineas: 0, variantes: 0 })).toBeNull();
  });
  it("ADR-0328: un terminado dice si fue el de arranque y cuántas se aplicaron sin contar; uno cancelado no dice nada de eso", () => {
    expect(apoyoDeResultado({ ...cerrado, esArranque: true })).toBe("Cerrado 11:52 · De arranque");
    expect(apoyoDeResultado({ ...cerrado, lineas: 52, variantes: 52, sinContar: 40 })).toBe("Cerrado 11:52 · 40 sin contar");
    expect(apoyoDeResultado({ ...cerrado, esArranque: true, sinContar: 2 })).toBe("Cerrado 11:52 · De arranque · 2 sin contar");
    expect(apoyoDeResultado({ ...cerrado, sinContar: 0, esArranque: false })).toBe("Cerrado 11:52");
    expect(apoyoDeResultado({ ...cerrado, estado: "abierto", cerradoEn: null, sinContar: 3 })).toBe("Sigue abierto");
    expect(apoyoDeResultado({ ...cerrado, estado: "anulado", cerradoEn: null, lineas: 0, variantes: 0, esArranque: true })).toBeNull();
  });
});

describe("cifraDeConteo: cuántas variantes, a la derecha de la fila", () => {
  const base = { estado: "cerrado", lineas: 15, lineasConDiferencia: 0, parcial: false, variantes: 15 };

  it("un conteo terminado dice cuántas variantes verificó", () => {
    expect(cifraDeConteo(base)).toEqual({ cifra: "15", unidad: "variantes" });
    expect(cifraDeConteo({ ...base, lineas: 1, variantes: 1 })).toEqual({ cifra: "1", unidad: "variante" });
  });
  it("con diferencias cuenta igual: las diferencias las dice el resultado, no la cifra", () => {
    expect(cifraDeConteo({ ...base, lineasConDiferencia: 3 })).toEqual({ cifra: "15", unidad: "variantes" });
  });
  it("uno en curso o parcial dice «X de Y»: no terminó de verificar todo", () => {
    expect(cifraDeConteo({ ...base, estado: "abierto", lineas: 18, variantes: 37 })).toEqual({ cifra: "18 de 37", unidad: "variantes" });
    expect(cifraDeConteo({ ...base, lineas: 20, variantes: 37, parcial: true })).toEqual({ cifra: "20 de 37", unidad: "variantes" });
  });
  it("uno cancelado no tiene cifra: lo contado se perdió", () => {
    expect(cifraDeConteo({ ...base, estado: "anulado", lineas: 0, variantes: 0 })).toBeNull();
    expect(cifraDeConteo({ ...base, lineas: 0, variantes: 0 })).toBeNull(); // cerrado sin ninguna variante verificada = Cancelado
  });
});
