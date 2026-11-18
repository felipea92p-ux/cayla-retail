import { describe, expect, it } from "vitest";
import { abreAlElegir, atajosDelDial, conservaLaCifra, cortesDelDial, esPedidoNuevo, estadoDelDial, MAX_CORTES } from "./recepcion-dial-reglas";

describe("cortesDelDial", () => {
  it("un corte por prenda, repartidos desde las 3 en punto, cruzando el aro", () => {
    const cortes = cortesDelDial(4, 145, 105, 11);
    expect(cortes).toHaveLength(4);
    expect(cortes[0]).toEqual({ x1: 239, y1: 145, x2: 261, y2: 145 });
    expect(cortes[1]).toEqual({ x1: 145, y1: 239, x2: 145, y2: 261 });
    expect(cortes[2]).toEqual({ x1: 51, y1: 145, x2: 29, y2: 145 });
    expect(cortes[3]).toEqual({ x1: 145, y1: 51, x2: 145, y2: 29 });
    expect(cortesDelDial(0, 145, 105, 11)).toEqual([]);
  });

  it("a centésimas: el servidor y el navegador escriben el mismo número aunque el seno difiera en el último decimal", () => {
    for (let n = 1; n <= MAX_CORTES; n++) {
      for (const c of cortesDelDial(n, 145, 105, 11)) {
        for (const v of [c.x1, c.y1, c.x2, c.y2]) expect(Number.isInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6).toBe(true);
      }
    }
    // El caso que avisaba (6 prendas, el corte 4): 63.593612044262784 en un lado y 63.5936120442628 en el otro.
    expect(cortesDelDial(6, 145, 105, 11)[4]!.y1).toBe(63.59);
  });
});

describe("estadoDelDial", () => {
  it("sin contar todavía, dice lo que dijeron y el aro está vacío", () => {
    expect(estadoDelDial(0, 4, false)).toMatchObject({ lleno: 0, exceso: 0, tono: "neutro", texto: "dijeron 4", cortes: 4, angulo: 0 });
  });

  it("faltar no es un error: el aro se llena a medias y queda en tinta", () => {
    expect(estadoDelDial(2, 4, true)).toMatchObject({ lleno: 50, tono: "neutro", texto: "faltan 2 de 4", angulo: 180 });
  });

  it("cuadra cuando lo contado es lo que dijeron", () => {
    expect(estadoDelDial(4, 4, true)).toMatchObject({ lleno: 100, exceso: 0, tono: "cuadra", texto: "cuadra · 4", angulo: 360 });
  });

  it("pasarse llena el aro y suma el arco de fuera, que no pasa del doble", () => {
    expect(estadoDelDial(5, 4, true)).toMatchObject({ lleno: 100, exceso: 25, tono: "sobra", texto: "sobran 1" });
    expect(estadoDelDial(20, 4, true).exceso).toBe(100);
  });

  it("un 0 escrito a propósito no es «por contar»", () => {
    expect(estadoDelDial(0, 4, true)).toMatchObject({ lleno: 0, texto: "faltan 4 de 4" });
    expect(estadoDelDial(0, null, true)).toMatchObject({ lleno: 0, texto: "contadas" });
  });

  it("sin aviso no hay con qué comparar: el aro se llena con la primera prenda y nunca dice cuadra ni sobra", () => {
    expect(estadoDelDial(0, null, false)).toMatchObject({ lleno: 0, tono: "neutro", texto: "por contar", cortes: 0 });
    expect(estadoDelDial(1, null, true)).toMatchObject({ lleno: 100, tono: "neutro", texto: "contada", angulo: 360 });
    expect(estadoDelDial(7, 0, true)).toMatchObject({ tono: "neutro", texto: "contadas", cortes: 0 });
  });

  it("con muchas prendas esperadas el aro va liso", () => {
    expect(estadoDelDial(0, MAX_CORTES, false).cortes).toBe(MAX_CORTES);
    expect(estadoDelDial(0, MAX_CORTES + 1, false).cortes).toBe(0);
  });
});

describe("los atajos del Dial", () => {
  it("van a la escala de lo que se cuenta", () => {
    expect(atajosDelDial(48, 0)).toEqual([5, 10]);
    expect(atajosDelDial(600, 0)).toEqual([10, 50]);
    expect(atajosDelDial(2400, 0)).toEqual([50, 100]);
    expect(atajosDelDial(12000, 0)).toEqual([100, 500]);
  });
  it("sin lo que dijeron, la escala la da lo contado", () => {
    expect(atajosDelDial(null, 0)).toEqual([5, 10]);
    expect(atajosDelDial(null, 1500)).toEqual([50, 100]);
  });
  it("las frases del aro separan los miles", () => {
    expect(estadoDelDial(9000, 12000, true).texto).toBe("faltan 3,000 de 12,000");
    expect(estadoDelDial(12000, 12000, true).texto).toBe("cuadra · 12,000");
    expect(estadoDelDial(14000, 12000, true).texto).toBe("sobran 2,000");
  });
});

describe("cuándo se abre el número del Dial (tarea 4 de las 30 de Recibir, 2026-11-14)", () => {
  it("elegir en la lista algo sin contar lo abre con mouse; lo contado no, y con el dedo no se abre solo", () => {
    expect(abreAlElegir({ pidio: false, contada: false, conMouse: true })).toBe(true);
    expect(abreAlElegir({ pidio: false, contada: true, conMouse: true })).toBe(false);
    expect(abreAlElegir({ pidio: false, contada: false, conMouse: false })).toBe(false);
    expect(abreAlElegir({ pidio: false, contada: true, conMouse: false })).toBe(false);
  });

  it("lo que se pidió abrir a propósito se abre siempre", () => {
    expect(abreAlElegir({ pidio: true, contada: true, conMouse: false })).toBe(true);
    expect(abreAlElegir({ pidio: true, contada: false, conMouse: true })).toBe(true);
  });

  it("cada pedido nuevo abre, también el segundo para el mismo modelo; el que ya se vio y el «ninguno» no", () => {
    // El número llegó abierto (pedido 3), se cerró con Escape y la persona vuelve a tocar la fila: llega el pedido 4.
    expect(esPedidoNuevo(3, 4)).toBe(true);
    // Volver a dibujar sin pedido nuevo no lo reabre.
    expect(esPedidoNuevo(4, 4)).toBe(false);
    // Elegir algo contado manda «ninguno»: no abre.
    expect(esPedidoNuevo(4, 0)).toBe(false);
    // Después de un «ninguno», un pedido vuelve a abrir.
    expect(esPedidoNuevo(0, 5)).toBe(true);
  });
});

describe("conservaLaCifra: tocar la fila del modelo que estás contando no corta la cifra (Felipe 2026-11-14)", () => {
  // Con «4» a medio escribir, el clic en su propia fila le quitaba el cursor a la caja: se guardaba 4 y el «7» que seguía no entraba en ningún lado.
  it("la fila del modelo activo, con el botón principal y el número abierto, se queda con la caja", () => {
    expect(conservaLaCifra({ filaActiva: true, numeroAbierto: true, botonPrincipal: true })).toBe(true);
  });
  it("la fila de otro modelo sí deja el número: salir de la caja lo guarda, como siempre", () => {
    expect(conservaLaCifra({ filaActiva: false, numeroAbierto: true, botonPrincipal: true })).toBe(false);
  });
  it("con el número cerrado no hay cifra que cuidar: la fila se elige como siempre", () => {
    expect(conservaLaCifra({ filaActiva: true, numeroAbierto: false, botonPrincipal: true })).toBe(false);
  });
  it("el botón del medio o el derecho no cambian nada", () => {
    expect(conservaLaCifra({ filaActiva: true, numeroAbierto: true, botonPrincipal: false })).toBe(false);
  });
});
