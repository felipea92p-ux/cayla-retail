import { describe, expect, it } from "vitest";
import { escalaDelAve, poseDelAve, ritmoDelVuelo, saludoDelDia, trazoDelVuelo } from "./login-vuelo";

describe("trazoDelVuelo", () => {
  const medidas = {
    ancho: 756,
    alto: 900,
    sedes: [
      { x: 64, y: 790 },
      { x: 262, y: 790 },
      { x: 436, y: 790 },
    ],
    destino: { x: 455, y: 286 },
  };

  it("sale de la primera sede y termina justo en la cola del ave", () => {
    const d = trazoDelVuelo(medidas);
    expect(d.startsWith("M64,790 ")).toBe(true);
    expect(d.endsWith(" 455,286")).toBe(true);
  });

  it("pasa en línea recta por las tres sedes antes de subir", () => {
    const tramoRecto = trazoDelVuelo(medidas).split(" C")[0];
    expect(tramoRecto).toMatch(/^M64,790 L\d+(\.\d)?,790$/);
    const fin = Number(tramoRecto.split("L")[1].split(",")[0]);
    expect(fin).toBeGreaterThan(436);
  });

  it("no da números con decimales infinitos", () => {
    const d = trazoDelVuelo({ ...medidas, ancho: 733.3333, alto: 811.7777 });
    expect(d).not.toMatch(/\.\d{2,}/);
  });
});

describe("ritmoDelVuelo", () => {
  it("empieza en 0, termina en 1 y nunca se pasa ni retrocede (sin rebote)", () => {
    expect(ritmoDelVuelo(0)).toBe(0);
    expect(ritmoDelVuelo(1)).toBe(1);
    let previo = 0;
    for (let i = 1; i <= 100; i++) {
      const v = ritmoDelVuelo(i / 100);
      expect(v).toBeGreaterThanOrEqual(previo);
      expect(v).toBeLessThanOrEqual(1);
      previo = v;
    }
  });

  it("acota lo que llega fuera de rango", () => {
    expect(ritmoDelVuelo(-1)).toBe(0);
    expect(ritmoDelVuelo(2)).toBe(1);
  });
});

describe("poseDelAve", () => {
  it("se voltea poco a poco cuando vuela hacia la izquierda", () => {
    let pose = { giro: 1, inclinacion: 0 };
    pose = poseDelAve(pose, { dx: -2, dy: 0 }, 0.5);
    expect(pose.giro).toBeLessThan(1);
    expect(pose.giro).toBeGreaterThan(-1);
    for (let i = 0; i < 60; i++) pose = poseDelAve(pose, { dx: -2, dy: 0 }, 0.5);
    expect(pose.giro).toBeCloseTo(-1, 2);
  });

  it("nunca se inclina más de 22°", () => {
    let pose = { giro: 1, inclinacion: 0 };
    for (let i = 0; i < 200; i++) pose = poseDelAve(pose, { dx: 0.01, dy: -5 }, 0);
    expect(Math.abs(pose.inclinacion)).toBeLessThanOrEqual(22);
  });

  it("al llegar busca quedar derecha", () => {
    let pose = { giro: 1, inclinacion: 18 };
    for (let i = 0; i < 80; i++) pose = poseDelAve(pose, { dx: 1, dy: -1 }, 1);
    expect(pose.inclinacion).toBeCloseTo(0, 1);
  });
});

describe("escalaDelAve", () => {
  it("sale chiquita y llega con su tamaño", () => {
    expect(escalaDelAve(0)).toBeCloseTo(0.3);
    expect(escalaDelAve(1)).toBe(1);
  });
});

describe("saludoDelDia", () => {
  // Perú es UTC-5 todo el año (sin horario de verano).
  const en = (horaLima: number) => new Date(Date.UTC(2026, 9, 13, horaLima + 5, 30));

  it("saluda según la hora de Perú", () => {
    expect(saludoDelDia(en(7))).toMatch(/^Buenos días · /);
    expect(saludoDelDia(en(12))).toMatch(/^Buenas tardes · /);
    expect(saludoDelDia(en(18))).toMatch(/^Buenas tardes · /);
    expect(saludoDelDia(en(19))).toMatch(/^Buenas noches · /);
    // 1 a. m. del miércoles en Lima: en UTC ya son las 6 de la mañana, pero manda la hora de Perú.
    expect(saludoDelDia(new Date(Date.UTC(2026, 9, 14, 6, 0)))).toBe("Buenas noches · miércoles 14 de octubre");
  });

  it("dice el día y la fecha en palabras", () => {
    expect(saludoDelDia(en(9))).toBe("Buenos días · martes 13 de octubre");
  });
});
