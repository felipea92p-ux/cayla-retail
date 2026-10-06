import { describe, expect, it } from "vitest";
import type { PrendaAnalisis } from "./analisis-tipos";
import { LIQUIDAR_DEFECTO, LIQUIDAR_MAX, LIQUIDAR_MIN } from "./analisis-reglas";
import {
  avisoLiquidarGuardado,
  cifraPrendas,
  efectoDeLiquidar,
  errorAlGuardarLiquidar,
  FALLA_LEER_LIQUIDAR,
} from "./analisis-liquidar-reglas";

// Datos inventados para la prueba (no son de producción).
function prenda(parcial: Partial<PrendaAnalisis>): PrendaAnalisis {
  return {
    varianteId: "v1",
    productoId: "p1",
    nombre: "Polo Prueba",
    color: "Gris",
    colorHex: null,
    talla: "M",
    categoria: "Polos",
    categoriaPrefijo: "POL",
    categoriaFamilia: null,
    fotoUrl: null,
    precio: 50,
    costo: 20,
    origen: "taller",
    proveedorId: null,
    piso: 2,
    almacen: 1,
    vendidas30: 0,
    semanas: [0, 0, 0, 0, 0, 0, 0, 0],
    diasSinVender: null,
    llegaron30: 0,
    vendidasDeLasQueLlegaron30: 0,
    otras: [],
    llega: [],
    ...parcial,
  };
}

// Una tienda inventada: quietas de 35, 50, 62, 70 y 100 días; una que se vende; una quieta de 70 días que otra tienda sí vende.
const prendas: PrendaAnalisis[] = [
  prenda({ varianteId: "a", diasSinVender: 35 }),
  prenda({ varianteId: "b", diasSinVender: 50 }),
  prenda({ varianteId: "c", diasSinVender: 62 }),
  prenda({ varianteId: "d", diasSinVender: 70 }),
  prenda({ varianteId: "e", diasSinVender: 100 }),
  prenda({ varianteId: "f", diasSinVender: 3, vendidas30: 4, piso: 9 }),
  prenda({ varianteId: "g", diasSinVender: 70, otras: [{ sedeId: "otra", stock: 1, vendidas30: 5 }] }),
];

describe("qué cambia al guardar «Liquidar desde»", () => {
  it("cuenta las prendas de MI tienda que caen en «Liquidar» con el número nuevo y con el que rige", () => {
    const e = efectoDeLiquidar(prendas, 64, 60);
    expect(e).toEqual({ dias: 64, guardado: 60, cambia: true, enLiquidar: 2, enLiquidarHoy: 3 });
  });
  it("lo que otra tienda sí vende va a «Mándalas», no a «Liquidar», con cualquier número", () => {
    expect(efectoDeLiquidar(prendas, 30, 60).enLiquidar).toBe(5);
    expect(efectoDeLiquidar(prendas, 85, 60).enLiquidar).toBe(1);
  });
  it("mismo número: nada que guardar", () => {
    const e = efectoDeLiquidar(prendas, LIQUIDAR_DEFECTO, LIQUIDAR_DEFECTO);
    expect(e.cambia).toBe(false);
    expect(e.enLiquidar).toBe(e.enLiquidarHoy);
  });
  it("fuera de sus topes se lleva al borde (como la lectura y como la base)", () => {
    expect(efectoDeLiquidar(prendas, 10, 60).dias).toBe(LIQUIDAR_MIN);
    expect(efectoDeLiquidar(prendas, 200, 60).dias).toBe(LIQUIDAR_MAX);
    expect(efectoDeLiquidar(prendas, 64.4, 60).dias).toBe(64);
    expect(efectoDeLiquidar(prendas, 60, Number.NaN).guardado).toBe(LIQUIDAR_DEFECTO);
  });
  it("sin prendas, no hay nada que liquidar", () => {
    expect(efectoDeLiquidar([], 45, 60)).toEqual({ dias: 45, guardado: 60, cambia: true, enLiquidar: 0, enLiquidarHoy: 0 });
  });
});

describe("palabras de la hoja", () => {
  it("la cifra de prendas: «Ninguna», «1 prenda», «12 prendas»", () => {
    expect(cifraPrendas(0)).toBe("Ninguna");
    expect(cifraPrendas(1)).toBe("1 prenda");
    expect(cifraPrendas(12)).toBe("12 prendas");
  });
  it("el aviso de éxito dice el número y el alcance", () => {
    expect(avisoLiquidarGuardado(64)).toEqual({ texto: "Liquidar desde 64 días", detalle: "Para todas las tiendas" });
  });
  it("la nota cuando la base no respondió dice con cuántos días sigue", () => {
    expect(FALLA_LEER_LIQUIDAR).toContain(`${LIQUIDAR_DEFECTO} días`);
  });
});

describe("el error al guardar, en tres líneas", () => {
  const efecto = { dias: 64, guardado: 60 };
  it("sin respuesta (corte de red o tope de espera): no se sabe si se guardó, y se puede volver a tocar", () => {
    const e = errorAlGuardarLiquidar({ message: "TypeError: Failed to fetch", code: "" }, efecto);
    expect(e.que).toBe("No se pudo confirmar si se guardó.");
    expect(e.queda).toContain("64 días");
    expect(e.sigue).toContain("Guardar para todos");
    expect(errorAlGuardarLiquidar({ message: "AbortError: signal is aborted without reason", code: null }, efecto).que).toBe("No se pudo confirmar si se guardó.");
  });
  it("la base dijo que no: todo sigue como estaba y la tercera línea es su motivo", () => {
    const fuera = errorAlGuardarLiquidar({ message: "«Liquidar desde» va de 30 a 85 días.", code: "P0001", hint: "liquidar_desde_fuera_de_rango" }, efecto);
    expect(fuera).toEqual({ que: "No se guardó.", queda: "Todas las tiendas siguen con 60 días.", sigue: "«Liquidar desde» va de 30 a 85 días." });
    const sinModulo = errorAlGuardarLiquidar(
      { message: "Para cambiar desde cuándo se liquida necesitas Análisis en tu rol.", code: "42501", hint: "analisis_sin_modulo" },
      efecto,
    );
    expect(sinModulo.sigue).toBe("Para cambiar desde cuándo se liquida necesitas Análisis en tu rol.");
  });
  it("el responsable que ya no está de turno: dice qué hacer", () => {
    const e = errorAlGuardarLiquidar(
      { message: "Esa persona no está de turno en esta tienda: tiene que marcar su entrada", code: "42501", hint: "responsable_no_presente" },
      efecto,
    );
    expect(e.que).toBe("No se guardó.");
    // Su frase sola: la primera línea ya dice que no se guardó.
    expect(e.sigue).toMatch(/^Esa persona ya no figura de turno/);
    const sinElegir = errorAlGuardarLiquidar({ message: "Elige quién hace esta operación", code: "42501", hint: "responsable_requerido" }, efecto);
    expect(sinElegir.sigue).toMatch(/^Falta elegir al responsable/);
  });
  it("la función todavía no está en la base: se avisa a Felipe, sin código", () => {
    const e = errorAlGuardarLiquidar({ message: "Could not find the function retail.guardar_liquidar_desde(p_dias)", code: "PGRST202" }, efecto);
    expect(e.sigue).toBe("Guardar para todos todavía no está listo: avisa a Felipe.");
    expect(e.queda).toBe("Todas las tiendas siguen con 60 días.");
  });
});
