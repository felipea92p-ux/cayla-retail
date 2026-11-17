import { describe, expect, it } from "vitest";
import { entradasQueSeVen, fotosDelLook, fotosQueSeMiden, queEspera, zonasQueCambian } from "./fotos-de-la-figura";
import { cajaDe, cajaVecina, indizar, LOOK_VACIO, tamanoEnLaFigura, type ColorDelProbador, type Look, type PrendaDelProbador, type Zona } from "./probador";

const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const URL_FOTO = (n: string) => `https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/recortes/${n}.png`;

function color(codigo: string, proporcion = 0.8): ColorDelProbador {
  return { codigo, nombre: codigo, hex: "#000000", precio: 50, precioFinal: 50, desde: false, pct: null, hay: true, nota: null, solo: null, foto: { url: URL_FOTO(codigo), proporcion, optimizar: true, propia: true, de: null } };
}
function prenda(n: number, zona: Zona, colores: ColorDelProbador[], largo = 60): PrendaDelProbador {
  return { id: id(n), codigo: `P-${n}`, nombre: `Prenda ${n}`, categoria: null, zona, metida: false, largo, colores };
}

const POLO = prenda(1, "arriba", [color("PER", 0.804), color("NEG", 0.804)], 45);
const BLUSA = prenda(2, "arriba", [color("ROS")]);
const PANTALON = prenda(3, "abajo", [color("CHO", 0.527)], 100);
const INDICE = indizar([POLO, BLUSA, PANTALON]);
const LOOK: Look = { ...LOOK_VACIO, arriba: { id: POLO.id, color: "PER" }, abajo: { id: PANTALON.id, color: "CHO" } };

describe("el tamaño con que se pide una foto para la figura", () => {
  it("sale de la caja por su largo, con holgura, y distingue la computadora (560 px) del celular (440 px o el ancho de la pantalla)", () => {
    // El Polo Hilo de producción: 45 cm y 0,804 de proporción → 91 px del lienzo de 390.
    expect(cajaDe("arriba", 45, 0.804).w).toBe(91);
    expect(tamanoEnLaFigura(cajaDe("arriba", 45, 0.804))).toBe("(min-width: 960px) 157px, (min-width: 440px) 123px, 28vw");
  });
  it("la que asoma a un lado pide lo mismo que cuando está puesta: su foto ya queda bajada para cuando se pase a ella", () => {
    const porLargo = cajaDe("abajo", 100, 0.527);
    // El pedido no mira la caja achicada con que asoma (62 %), sino la de la prenda.
    expect(cajaVecina(porLargo, 1).w).toBeLessThan(porLargo.w);
    expect(fotosDelLook(LOOK, INDICE)[1].tamanos).toBe(tamanoEnLaFigura(porLargo));
  });
});

describe("las fotos que pide un outfit", () => {
  it("una por prenda puesta, en su color, de arriba abajo", () => {
    expect(fotosDelLook(LOOK, INDICE).map((f) => f.url)).toEqual([URL_FOTO("PER"), URL_FOTO("CHO")]);
    expect(fotosDelLook({ ...LOOK, arriba: { id: POLO.id, color: "NEG" } }, INDICE)[0].url).toBe(URL_FOTO("NEG"));
  });
  it("una prenda que ya no está en el catálogo no pide nada (no se espera lo que no va a llegar)", () => {
    expect(fotosDelLook({ ...LOOK, arriba: { id: id(99), color: "X" } }, INDICE).map((f) => f.url)).toEqual([URL_FOTO("CHO")]);
    expect(fotosDelLook(LOOK_VACIO, INDICE)).toEqual([]);
  });
});

describe("las medidas que se esperan junto con las fotos (para que la prenda entre ya unida)", () => {
  it("la de arriba y la de abajo, de arriba abajo", () => {
    expect(fotosQueSeMiden(fotosDelLook(LOOK, INDICE)).map((f) => f.z)).toEqual(["arriba", "abajo"]);
  });
  it("sin nada arriba no hay unión: no se espera ninguna medida", () => {
    expect(fotosQueSeMiden(fotosDelLook({ ...LOOK, arriba: null }, INDICE))).toEqual([]);
    expect(fotosQueSeMiden([])).toEqual([]);
  });
  it("solo con lo de arriba, la suya (se ajusta a su forma aunque vaya sola)", () => {
    expect(fotosQueSeMiden(fotosDelLook({ ...LOOK, abajo: null }, INDICE)).map((f) => f.z)).toEqual(["arriba"]);
  });
});

describe("lo que la figura espera antes de cambiar de prenda", () => {
  const fotos = fotosDelLook(LOOK, INDICE);
  it("solo las fotos que todavía no bajaron", () => {
    expect(queEspera(fotos, new Set()).map((f) => f.url)).toEqual([URL_FOTO("PER"), URL_FOTO("CHO")]);
    expect(queEspera(fotos, new Set([URL_FOTO("CHO")])).map((f) => f.url)).toEqual([URL_FOTO("PER")]);
    // Con todo bajado no se espera nada: el cambio es inmediato, como siempre.
    expect(queEspera(fotos, new Set([URL_FOTO("PER"), URL_FOTO("CHO")]))).toEqual([]);
  });
  it("la misma foto pedida dos veces se baja una sola", () => {
    expect(queEspera([...fotos, ...fotos], new Set())).toHaveLength(2);
  });
});

describe("la animación de entrada, aunque la figura se salte cambios mientras espera", () => {
  const clase = (e: { tipo: string; vuelta: number } | undefined) => (e ? `${e.tipo}-${e.vuelta % 2 ? "a" : "b"}` : "");
  it("cada entrada que se ve cambia de clase, aunque lo pedido haya saltado dos vueltas (dos toques seguidos)", () => {
    const una = entradasQueSeVen({}, { arriba: { tipo: "der", vuelta: 1 } });
    // Dos toques mientras bajaba la foto: lo pedido pasó de la vuelta 1 a la 3. Con la vuelta pedida la clase sería la misma («der-a») y no se animaría.
    const tres = entradasQueSeVen(una, { arriba: { tipo: "der", vuelta: 3 } });
    expect(clase({ tipo: "der", vuelta: 1 })).toBe(clase({ tipo: "der", vuelta: 3 }));
    expect(clase(tres.arriba)).not.toBe(clase(una.arriba));
  });
  it("la zona que no cambió conserva su entrada (no se vuelve a animar) y la que cambió, sí cambia", () => {
    const antes = entradasQueSeVen({}, { arriba: { tipo: "der", vuelta: 1 }, abajo: { tipo: "asoma", vuelta: 1 } });
    const despues = entradasQueSeVen(antes, { arriba: { tipo: "izq", vuelta: 2 }, abajo: { tipo: "asoma", vuelta: 1 } });
    expect(despues.abajo).toBe(antes.abajo);
    expect(despues.arriba).toEqual({ tipo: "izq", vuelta: 2, de: 2 });
  });
  it("una zona sin entrada pedida no tiene entrada", () => {
    expect(entradasQueSeVen({ arriba: { tipo: "der", vuelta: 1, de: 1 } }, {})).toEqual({});
  });
});

describe("las prendas que se atenúan mientras llega la foto", () => {
  it("solo las zonas que cambian de prenda o de color", () => {
    expect(zonasQueCambian(LOOK, LOOK)).toEqual([]);
    expect(zonasQueCambian(LOOK, { ...LOOK, arriba: { id: BLUSA.id, color: "ROS" } })).toEqual(["arriba"]);
    expect(zonasQueCambian(LOOK, { ...LOOK, arriba: { id: POLO.id, color: "NEG" } })).toEqual(["arriba"]);
  });
  it("Sorpréndeme cambia varias a la vez; una zona que se llena o se vacía también cuenta", () => {
    const otro: Look = { ...LOOK_VACIO, arriba: { id: BLUSA.id, color: "ROS" } };
    expect(zonasQueCambian(LOOK, otro).sort()).toEqual(["abajo", "arriba"]);
    expect(zonasQueCambian(otro, LOOK).sort()).toEqual(["abajo", "arriba"]);
  });
});
