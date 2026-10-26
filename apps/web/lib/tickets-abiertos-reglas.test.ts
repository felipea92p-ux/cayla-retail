import { describe, expect, it } from "vitest";
import {
  abrirNuevoTicket,
  cabeOtroTicket,
  nombreDelTicketActivo,
  pasarAlTicket,
  pestanasDeTickets,
  posicionDelActivo,
  quitarDeLaEspera,
  siguienteNombreDeCliente,
  TOPE_TICKETS_ABIERTOS,
} from "./tickets-abiertos-reglas";

const prenda = (precio: number, cantidad = 1) => ({ cantidad, precioUnitario: precio, descuentoUnitario: 0 });
const ticket = (id: string, nombre: string | undefined, precio = 100) => ({ id, nombre, creadoEn: "2026-10-25T15:00:00.000Z", carrito: [prenda(precio)] });
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);

describe("nombre automático de un ticket nuevo", () => {
  it("sin nadie, «Cliente 1»", () => {
    expect(siguienteNombreDeCliente([])).toBe("Cliente 1");
  });
  it("toma el primer número libre, aunque haya huecos", () => {
    expect(siguienteNombreDeCliente(["Cliente 1", "Cliente 3"])).toBe("Cliente 2");
  });
  it("no distingue mayúsculas ni espacios de sobra", () => {
    expect(siguienteNombreDeCliente(["  cliente 1 "])).toBe("Cliente 2");
  });
  it("un nombre que no es «Cliente N» no ocupa ningún número", () => {
    expect(siguienteNombreDeCliente(["María", "Probador 1", undefined, null, ""])).toBe("Cliente 1");
  });
  it("el ticket de la caja usa el suyo si lo tiene; si no, el siguiente libre entre los que esperan", () => {
    expect(nombreDelTicketActivo("  María ", [{ nombre: "Cliente 1" }])).toBe("María");
    expect(nombreDelTicketActivo("", [{ nombre: "Cliente 1" }, { nombre: "Cliente 2" }])).toBe("Cliente 3");
  });
});

describe("dónde se dibuja el ticket de la caja", () => {
  it("sin posición, al final", () => {
    expect(posicionDelActivo(null, 3)).toBe(3);
  });
  it("una posición que ya no existe se acomoda dentro de la fila", () => {
    expect(posicionDelActivo(7, 3)).toBe(3);
    expect(posicionDelActivo(-2, 3)).toBe(0);
    expect(posicionDelActivo(1.9, 3)).toBe(1);
  });
});

describe("las pestañas", () => {
  it("siempre hay al menos una: la de la caja, aunque no haya nadie en espera", () => {
    const p = pestanasDeTickets([], null, { nombre: "", carrito: [] });
    expect(p).toEqual([{ id: null, nombre: "Cliente 1", total: 0, prendas: 0, esActivo: true, creadoEn: null }]);
  });
  it("el ticket de la caja va en su hueco, con su monto, y uno viejo sin nombre cae a «Ticket N»", () => {
    const espera = [ticket("a", "Probador 1", 50), ticket("b", undefined, 70)];
    const p = pestanasDeTickets(espera, 1, { nombre: "", carrito: [prenda(40, 2)] });
    expect(p.map((x) => [x.id, x.nombre, x.total, x.esActivo])).toEqual([
      ["a", "Probador 1", 50, false],
      [null, "Cliente 1", 80, true],
      ["b", "Ticket 2", 70, false],
    ]);
    expect(p[1]?.prendas).toBe(2);
  });
});

describe("«+ Nueva cliente»", () => {
  it("el ticket de la caja se queda en su lugar y la caja abre uno nuevo al final", () => {
    const { espera, posActivo } = abrirNuevoTicket([ticket("a", "A"), ticket("b", "B")], 1, ticket("c", "C"));
    expect(ids(espera)).toEqual(["a", "c", "b"]);
    expect(posActivo).toBeNull();
  });
});

describe("pasar a otra pestaña", () => {
  const espera = [ticket("a", "A"), ticket("b", "B"), ticket("c", "C")];

  it("intercambia el de la caja con el elegido y no mueve a nadie más", () => {
    // Fila vista: [a, b, CAJA(x), c]. Se elige «c».
    const r = pasarAlTicket(espera, 2, ticket("x", "X"), "c");
    expect(r).not.toBeNull();
    expect(ids(r!.espera)).toEqual(["a", "b", "x"]);
    expect(r!.posActivo).toBe(3);
    expect(r!.objetivo.id).toBe("c");
  });

  it("elegir uno de más a la izquierda también deja a los demás donde estaban", () => {
    // Fila vista: [a, b, CAJA(x), c]. Se elige «a»: queda [CAJA(a), b, x, c].
    const r = pasarAlTicket(espera, 2, ticket("x", "X"), "a");
    expect(ids(r!.espera)).toEqual(["b", "x", "c"]);
    expect(r!.posActivo).toBe(0);
  });

  it("un ticket vacío en la caja no se guarda: su pestaña desaparece", () => {
    // Fila vista: [a, b, CAJA(vacío), c]. Se elige «c»: queda [a, b, CAJA(c)].
    const r = pasarAlTicket(espera, 2, null, "c");
    expect(ids(r!.espera)).toEqual(["a", "b"]);
    expect(r!.posActivo).toBe(2);
  });

  it("con la caja al final (recién abierto un ticket nuevo) también intercambia bien", () => {
    const r = pasarAlTicket(espera, null, ticket("x", "X"), "b");
    // Fila vista: [a, b, c, CAJA(x)] → [a, CAJA(b), c, x].
    expect(ids(r!.espera)).toEqual(["a", "c", "x"]);
    expect(r!.posActivo).toBe(1);
  });

  it("un id que ya no está en la espera no hace nada", () => {
    expect(pasarAlTicket(espera, null, ticket("x", "X"), "no-existe")).toBeNull();
  });

  it("nunca pierde ni duplica un ticket: antes y después hay los mismos (salvo el vacío)", () => {
    for (const pos of [null, 0, 1, 2, 3]) {
      for (const objetivo of ["a", "b", "c"]) {
        const r = pasarAlTicket(espera, pos, ticket("x", "X"), objetivo)!;
        expect([...ids(r.espera), objetivo].sort()).toEqual(["a", "b", "c", "x"]);
      }
    }
  });
});

describe("descartar uno que espera", () => {
  const espera = [ticket("a", "A"), ticket("b", "B"), ticket("c", "C")];
  it("la caja conserva su hueco: si se descarta uno a su izquierda, la posición baja uno", () => {
    expect(quitarDeLaEspera(espera, 2, "a")).toEqual({ espera: [espera[1], espera[2]], posActivo: 1 });
  });
  it("si se descarta uno a su derecha, la posición no cambia", () => {
    expect(quitarDeLaEspera(espera, 1, "c")).toEqual({ espera: [espera[0], espera[1]], posActivo: 1 });
  });
  it("con la caja al final se queda al final", () => {
    expect(quitarDeLaEspera(espera, null, "b").posActivo).toBeNull();
  });
  it("un id que no está no cambia nada", () => {
    expect(quitarDeLaEspera(espera, 1, "z")).toEqual({ espera, posActivo: 1 });
  });
});

describe("el tope de tickets abiertos", () => {
  it("son 9 en total, contando el de la caja (Felipe, 2026-10-25)", () => {
    expect(TOPE_TICKETS_ABIERTOS).toBe(9);
  });
  it("con 7 en espera cabe uno más; con 8 (9 abiertos contando la caja) ya no", () => {
    expect(cabeOtroTicket(7)).toBe(true);
    expect(cabeOtroTicket(8)).toBe(false);
  });
});
