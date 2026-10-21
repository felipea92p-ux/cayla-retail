import { describe, expect, it } from "vitest";
import {
  conCambio,
  lecturaDePistola,
  MAX_MS_ENTRE_TECLAS,
  MAX_MS_DE_TROPIEZO,
  PAUSA_FIN_LECTURA_MS,
  TECLAS_MIN_LECTURA,
  TECLAS_PARA_PERDONAR,
  type Rafaga,
} from "./lectura-pistola";
import { resolverCodigoV2, type PrendaBuscableV2 } from "./buscar-prenda-v2";

/** Escribe `texto` al final de `antes`, una tecla cada `cadaMs`, empezando en `desde`; devuelve el campo, la ráfaga y la
 *  hora de la última tecla. */
function teclear(antes: { valor: string; rafaga: Rafaga | null; t: number }, texto: string, cadaMs: number, desde: number) {
  let { valor, rafaga } = antes;
  let t = desde;
  for (const c of texto) {
    rafaga = conCambio(rafaga, valor, valor + c, t);
    valor += c;
    t += cadaMs;
  }
  return { valor, rafaga, t: t - cadaMs };
}
const vacio = { valor: "", rafaga: null as Rafaga | null, t: 0 };

const CODIGO = "CMS-0011-ROS-STD";

describe("una pistola sin Enter (lecturaDePistola)", () => {
  it("un código escrito a ritmo de pistola es una lectura", () => {
    const c = teclear(vacio, CODIGO, 5, 1000);
    expect(lecturaDePistola(c.valor, c.rafaga)).toBe(CODIGO);
  });

  it("también una pistola lenta, hasta el límite del ritmo", () => {
    const c = teclear(vacio, CODIGO, MAX_MS_ENTRE_TECLAS, 1000);
    expect(lecturaDePistola(c.valor, c.rafaga)).toBe(CODIGO);
  });

  it("una persona tecleando el mismo código NO es una lectura", () => {
    const c = teclear(vacio, CODIGO, 140, 1000);
    expect(lecturaDePistola(c.valor, c.rafaga)).toBeNull();
  });

  it("un poco más lento que el límite ya se toma por una persona", () => {
    const c = teclear(vacio, CODIGO, MAX_MS_ENTRE_TECLAS + 1, 1000);
    expect(lecturaDePistola(c.valor, c.rafaga)).toBeNull();
  });

  it("una palabra tecleada rápido, corta, no cuenta", () => {
    const c = teclear(vacio, "camisa", 30, 1000);
    expect(lecturaDePistola(c.valor, c.rafaga)).toBeNull();
  });

  it("pocas teclas, aunque rápidas, tampoco", () => {
    const c = teclear(vacio, "x".repeat(TECLAS_MIN_LECTURA - 1), 5, 1000);
    expect(lecturaDePistola(c.valor, c.rafaga)).toBeNull();
  });

  it("texto pegado o completado de golpe (un solo cambio) no es una pistola", () => {
    const r = conCambio(null, "", CODIGO, 1000);
    expect(lecturaDePistola(CODIGO, r)).toBeNull();
  });

  it("una frase con espacios, aunque llegue rápida, no es un código", () => {
    const c = teclear(vacio, "camisa lara rosada", 5, 1000);
    expect(lecturaDePistola(c.valor, c.rafaga)).toBeNull();
  });

  it("borrar o editar en medio pierde la ráfaga", () => {
    const c = teclear(vacio, CODIGO, 5, 1000);
    expect(conCambio(c.rafaga, c.valor, c.valor.slice(0, -1), c.t + 5)).toBeNull();
    expect(conCambio(c.rafaga, c.valor, "X" + c.valor.slice(1) + "Y", c.t + 5)).toBeNull();
  });
});

describe("lo que había escrito antes no se pega delante del código", () => {
  it("texto suelto de una persona + una lectura: solo cuenta el código", () => {
    const antes = teclear(vacio, "cam", 180, 1000); // una persona, despacio
    const c = teclear(antes, CODIGO, 5, antes.t + 2000); // pasa el tiempo y llega la pistola
    expect(c.valor).toBe("cam" + CODIGO);
    expect(lecturaDePistola(c.valor, c.rafaga)).toBe(CODIGO);
  });

  it("una lectura que no se reconoció y se quedó escrita no estorba a la siguiente", () => {
    const primera = teclear(vacio, "ZZZ-9999-XXX-STD", 5, 1000);
    const segunda = teclear(primera, CODIGO, 5, primera.t + 1500);
    expect(lecturaDePistola(segunda.valor, segunda.rafaga)).toBe(CODIGO);
  });

  it("dos lecturas seguidas pero separadas por un rato son dos ráfagas, no una larga", () => {
    const primera = teclear(vacio, CODIGO, 5, 1000);
    const segunda = teclear(primera, "CMS-0011-BEI-STD", 5, primera.t + PAUSA_FIN_LECTURA_MS + 300);
    expect(lecturaDePistola(segunda.valor, segunda.rafaga)).toBe("CMS-0011-BEI-STD");
  });

  it("con el campo vaciado, la ráfaga vieja no se arrastra aunque la tecla llegue enseguida", () => {
    const primera = teclear(vacio, CODIGO, 5, 1000);
    // el campo se vació por otro lado (Enter, ×) y la siguiente tecla llega a los 10 ms: es ráfaga NUEVA
    const r = conCambio(primera.rafaga, "", "C", primera.t + 10);
    expect(r).toEqual({ desde: 0, teclas: 1, ultima: primera.t + 10 });
  });
});

describe("el código leído se resuelve como si hubiera llegado su Enter", () => {
  const prenda = (p: Partial<PrendaBuscableV2>): PrendaBuscableV2 => ({ varianteId: "v", sku: "SKU", referencia: "Camisa Lara", talla: "STD", color: "Rosado", codigosBarras: [], ...p });
  const catalogo = [prenda({ varianteId: "ros", sku: CODIGO })];

  it("con el guion escrito como apóstrofo (teclado en español), la misma prenda", () => {
    const c = teclear(vacio, "CMS'0011'ROS'STD", 5, 1000);
    const leido = lecturaDePistola(c.valor, c.rafaga);
    expect(leido).toBe("CMS'0011'ROS'STD");
    expect(resolverCodigoV2(leido!, catalogo)?.varianteId).toBe("ros");
  });

  it("un código que no es de ninguna prenda no resuelve nada", () => {
    const c = teclear(vacio, "CMS-9999-XXX-STD", 5, 1000);
    expect(resolverCodigoV2(lecturaDePistola(c.valor, c.rafaga)!, catalogo)).toBeNull();
  });
});

describe("el silencio que da por terminada la lectura", () => {
  it("es más largo que el ritmo de una ráfaga: si no, cortaría la lectura a la mitad", () => {
    expect(PAUSA_FIN_LECTURA_MS).toBeGreaterThan(MAX_MS_ENTRE_TECLAS);
  });
});

/** Escribe `texto` con una pausa de `pausaMs` justo antes de la tecla número `enTecla` (1 = la primera). */
function teclearConTropiezo(antes: { valor: string; rafaga: Rafaga | null; t: number }, texto: string, cadaMs: number, desde: number, enTecla: number, pausaMs: number) {
  let { valor, rafaga } = antes;
  let t = desde;
  let n = 0;
  for (const c of texto) {
    n += 1;
    if (n === enTecla) t += pausaMs - cadaMs;
    rafaga = conCambio(rafaga, valor, valor + c, t);
    valor += c;
    t += cadaMs;
  }
  return { valor, rafaga, t: t - cadaMs };
}

describe("una pistola que se atrasa un instante a mitad del código sigue siendo una pistola", () => {
  it("un tropiezo corto en medio de la lectura no la parte en dos", () => {
    const c = teclearConTropiezo(vacio, CODIGO, 5, 1000, 9, 90);
    expect(lecturaDePistola(c.valor, c.rafaga)).toBe(CODIGO);
  });

  it("el tropiezo más largo que se perdona", () => {
    const c = teclearConTropiezo(vacio, CODIGO, 5, 1000, 9, MAX_MS_DE_TROPIEZO);
    expect(lecturaDePistola(c.valor, c.rafaga)).toBe(CODIGO);
  });

  it("una pausa mayor ya es otra cosa: la ráfaga se corta y solo cuenta lo que vino después", () => {
    const c = teclearConTropiezo(vacio, CODIGO, 5, 1000, 9, MAX_MS_DE_TROPIEZO + 1);
    expect(lecturaDePistola(c.valor, c.rafaga)).not.toBe(CODIGO);
  });

  it("no se perdona antes de que se note que es una máquina", () => {
    // Pausa tras solo (TECLAS_PARA_PERDONAR - 1) teclas rápidas: todavía puede ser una persona.
    const c = teclearConTropiezo(vacio, CODIGO, 5, 1000, TECLAS_PARA_PERDONAR, 90);
    expect(lecturaDePistola(c.valor, c.rafaga)).not.toBe(CODIGO);
  });

  it("una persona tecleando a su ritmo sigue sin ser lectura, aunque un par de teclas le salgan seguidas", () => {
    const c = teclearConTropiezo(vacio, CODIGO, 90, 1000, 3, 90);
    expect(lecturaDePistola(c.valor, c.rafaga)).toBeNull();
  });

  it("con un código a medias en el campo, la lectura con tropiezo lo reemplaza y no se le pega", () => {
    const resto = teclear(vacio, "CMS-00", 5, 1000); // una lectura que se cortó y quedó escrita
    const c = teclearConTropiezo(resto, CODIGO, 5, resto.t + 1500, 9, 90);
    expect(c.valor).toBe("CMS-00" + CODIGO);
    expect(lecturaDePistola(c.valor, c.rafaga)).toBe(CODIGO);
  });

  it("el tropiezo que se perdona es menor que el silencio que cierra la lectura", () => {
    expect(MAX_MS_DE_TROPIEZO).toBeGreaterThan(MAX_MS_ENTRE_TECLAS);
    expect(MAX_MS_DE_TROPIEZO).toBeLessThan(PAUSA_FIN_LECTURA_MS);
  });
});
