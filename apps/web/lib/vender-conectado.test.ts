import { describe, expect, it } from "vitest";
import { ACCESOS_VENTA, accesosVisibles, repartirAccesos } from "./vender-accesos";
import { buscarVendiblePrimero, grupoDeResultado } from "./vender-buscador-reglas";
import { hrefApartarDesdeTicket, leerPrendasDeUrl, lineasApartables } from "./apartar-desde-ticket";
import { dniEnmascarado, lineaDeClienta, terminoBuscable } from "./clienta-ticket-reglas";
import { precioEscribible } from "./prenda-sin-registrar-reglas";
import { anchoBarraMeta, nombreDeEspera, resumenDeHoy } from "./vender-hoy-reglas";

const prenda = (id: string, referencia: string, stockAqui: number, almacenAqui: number | null = 0) => ({
  varianteId: id,
  sku: id.toUpperCase(),
  referencia,
  talla: "M",
  color: "Blanco",
  marca: null,
  codigosBarras: [],
  stockAqui,
  almacenAqui,
});

describe("accesos del Punto de venta", () => {
  it("solo ofrece lo que el rol de la cuenta ve", () => {
    const visibles = accesosVisibles(["vender", "caja", "cambios"]);
    expect(visibles.map((a) => a.texto)).toEqual(["Caja", "Cambios"]);
  });

  it("con todos los módulos: cuatro a la vista y dos en «Más»", () => {
    const { aLaVista, enMas } = repartirAccesos(accesosVisibles(ACCESOS_VENTA.map((a) => a.modulo)));
    expect(aLaVista.map((a) => a.texto)).toEqual(["Caja", "Apartados", "Cambios", "Devoluciones"]);
    expect(enMas.map((a) => a.texto)).toEqual(["Historial", "Proformas"]);
  });

  it("un «Más» de una sola opción no existe: esa opción va a la vista", () => {
    const { aLaVista, enMas } = repartirAccesos(accesosVisibles(["caja", "historial"]));
    expect(aLaVista.map((a) => a.texto)).toEqual(["Caja", "Historial"]);
    expect(enMas).toEqual([]);
  });

  it("sin ningún módulo de ventas, nada", () => {
    expect(accesosVisibles(["existencias"])).toEqual([]);
  });
});

describe("buscador: lo vendible primero", () => {
  const catalogo = [
    prenda("a", "Polo Básico", 0, 0),
    prenda("b", "Polo Cayla", 0, 3),
    prenda("c", "Polo Top", 2),
    prenda("d", "Polo Lino", 0, 0),
    prenda("e", "Polo Sol", 1),
  ];

  it("aquí → almacén → sin stock, respetando el orden del catálogo dentro de cada grupo", () => {
    expect(buscarVendiblePrimero("polo", catalogo, 10).map((v) => v.varianteId)).toEqual(["c", "e", "b", "a", "d"]);
  });

  it("filtra todo antes de cortar: una vendible del fondo del catálogo entra en los primeros", () => {
    const muchos = [...Array.from({ length: 8 }, (_, i) => prenda(`x${i}`, "Polo Agotado", 0, 0)), prenda("z", "Polo Vendible", 1)];
    expect(buscarVendiblePrimero("polo", muchos, 6)[0].varianteId).toBe("z");
  });

  it("sin texto no busca", () => {
    expect(buscarVendiblePrimero("  ", catalogo, 6)).toEqual([]);
  });

  it("clasifica cada prenda en su grupo", () => {
    expect(grupoDeResultado({ stockAqui: 1 })).toBe("aqui");
    expect(grupoDeResultado({ stockAqui: 0, almacenAqui: 2 })).toBe("guardada");
    expect(grupoDeResultado({ stockAqui: 0, almacenAqui: null })).toBe("sin_stock");
  });
});

describe("resumen de hoy", () => {
  it("suma las ventas y calcula el % de la meta (hacia abajo: 99,9 % no es 100 %)", () => {
    expect(resumenDeHoy([{ total: 189.9 }, { total: "144.90" }, { total: 664.99 }], 1000)).toEqual({ ventas: 3, total: 999.79, pctMeta: 99 });
  });

  it("sin meta, sin porcentaje", () => {
    expect(resumenDeHoy([{ total: 50 }], null).pctMeta).toBeNull();
    expect(resumenDeHoy([{ total: 50 }], 0).pctMeta).toBeNull();
  });

  it("sin ventas: cero, no error", () => {
    expect(resumenDeHoy([], 500)).toEqual({ ventas: 0, total: 0, pctMeta: 0 });
  });

  it("la barrita se queda llena pasada la meta", () => {
    expect(anchoBarraMeta(140)).toBe(100);
    expect(anchoBarraMeta(62)).toBe(62);
    expect(anchoBarraMeta(null)).toBe(0);
  });
});

describe("nombre de un ticket en espera", () => {
  it("usa el que se escribió, sin espacios de sobra", () => {
    expect(nombreDeEspera("  Probador 2 ", 0)).toBe("Probador 2");
  });
  it("sin nombre, su lugar en la fila", () => {
    expect(nombreDeEspera("", 1)).toBe("Ticket 2");
    expect(nombreDeEspera(undefined, 0)).toBe("Ticket 1");
  });
});


describe("apartar desde el ticket", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  it("junta las líneas de la misma prenda y vuelve a leerse igual", () => {
    const href = hrefApartarDesdeTicket([{ varianteId: A, cantidad: 1 }, { varianteId: B, cantidad: 2 }, { varianteId: A, cantidad: 1 }]);
    const valor = decodeURIComponent(href.split("prendas=")[1]);
    expect(leerPrendasDeUrl(valor)).toEqual([{ varianteId: A, cantidad: 2 }, { varianteId: B, cantidad: 2 }]);
  });

  it("descarta lo que no tiene forma: id raro, cantidad 0, decimal o repetida", () => {
    expect(leerPrendasDeUrl(`x:1,${A}:0,${A}:1.5,${B}:1,${B}:3,${A}:2`)).toEqual([{ varianteId: B, cantidad: 1 }, { varianteId: A, cantidad: 2 }]);
    expect(leerPrendasDeUrl(null)).toEqual([]);
  });

  it("topa por lo disponible y dice qué no entró", () => {
    const disp = new Map([[A, { stockAqui: 1, nombre: "Blusa Carlita · XS" }], [B, { stockAqui: 0, nombre: "Top Aurora · M" }]]);
    expect(lineasApartables([{ varianteId: A, cantidad: 2 }, { varianteId: B, cantidad: 1 }], disp)).toEqual({
      lineas: [{ varianteId: A, cantidad: 1 }],
      noEntraron: ["Blusa Carlita · XS", "Top Aurora · M"],
    });
  });
});

describe("clienta del ticket", () => {
  it("enmascara el DNI en pantalla", () => {
    expect(dniEnmascarado("71234482")).toBe("71•••482");
    expect(dniEnmascarado(null)).toBeNull();
  });
  it("sin nombre en la ficha, se muestra el documento", () => {
    expect(lineaDeClienta({ id: "1", nombre: null, dni: "71234482", celular: null }).titulo).toBe("DNI 71•••482");
    expect(lineaDeClienta({ id: "1", nombre: "María Quispe", dni: "71234482", celular: "987654321" })).toEqual({
      titulo: "María Quispe",
      detalle: "DNI 71•••482 · Cel. 987654321",
    });
  });
  it("no busca con menos de 3 caracteres", () => {
    expect(terminoBuscable(" 71 ")).toBeNull();
    expect(terminoBuscable("714")).toBe("714");
  });
});

describe("precio de la prenda sin registrar", () => {
  it("acepta coma del celular, un solo punto y dos decimales", () => {
    expect(precioEscribible("45,5")).toBe("45.5");
    expect(precioEscribible("45.999")).toBe("45.99");
    expect(precioEscribible("4.5.6")).toBe("4.56");
    expect(precioEscribible("S/ 39")).toBe("39");
    expect(precioEscribible("")).toBe("");
  });
});
