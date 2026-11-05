import { describe, expect, it } from "vitest";
import {
  crearJuntador,
  filtroDeUbicacion,
  queHacerConUnCambio,
  sePuedeEscuchar,
  VUELTAS_DE_RESPALDO_CONECTADO,
  vueltasPorLectura,
  type Temporizador,
} from "./cambios-en-vivo-reglas";

const UUID = "3f2b8c1e-9d4a-4e7b-8a10-5c6d7e8f9a0b";

/** Un reloj de mentira: las acciones corren cuando la prueba lo manda. */
function relojFalso() {
  const pendientes = new Map<number, () => void>();
  let siguiente = 1;
  const reloj: Temporizador = {
    poner: (a) => {
      pendientes.set(siguiente, a);
      return siguiente++;
    },
    quitar: (id) => void pendientes.delete(id as number),
  };
  const disparar = () => {
    const acciones = [...pendientes.values()];
    pendientes.clear();
    acciones.forEach((a) => a());
  };
  return { reloj, hay: () => pendientes.size, disparar };
}

describe("crearJuntador (una ráfaga de cambios = un aviso)", () => {
  it("cinco avisos seguidos llaman la acción una sola vez", () => {
    const f = relojFalso();
    let veces = 0;
    const j = crearJuntador(800, () => veces++, f.reloj);
    for (let i = 0; i < 5; i++) j.avisar();
    expect(f.hay()).toBe(1);
    f.disparar();
    expect(veces).toBe(1);
  });

  it("después de avisar abre una ventana nueva: el siguiente cambio vuelve a llamar", () => {
    const f = relojFalso();
    let veces = 0;
    const j = crearJuntador(800, () => veces++, f.reloj);
    j.avisar();
    f.disparar();
    j.avisar();
    f.disparar();
    expect(veces).toBe(2);
  });

  it("cancelar al salir de la pantalla evita que avise después", () => {
    const f = relojFalso();
    let veces = 0;
    const j = crearJuntador(800, () => veces++, f.reloj);
    j.avisar();
    j.cancelar();
    f.disparar();
    expect(f.hay()).toBe(0);
    expect(veces).toBe(0);
  });
});

describe("filtroDeUbicacion", () => {
  it("arma el filtro de la sede", () => {
    expect(filtroDeUbicacion(UUID)).toBe(`ubicacion_id=eq.${UUID}`);
  });
  it("sin sede no filtra (la RLS ya acota lo que la cuenta ve)", () => {
    expect(filtroDeUbicacion(null)).toBeNull();
    expect(filtroDeUbicacion(undefined)).toBeNull();
    expect(filtroDeUbicacion("")).toBeNull();
  });
  it("un id que no es uuid nunca entra al filtro", () => {
    expect(filtroDeUbicacion("x,ubicacion_id=neq.1")).toBeNull();
    expect(sePuedeEscuchar("x,ubicacion_id=neq.1")).toBe(false);
  });
  it("sin sede sí se puede escuchar; con uuid también", () => {
    expect(sePuedeEscuchar(null)).toBe(true);
    expect(sePuedeEscuchar(UUID)).toBe(true);
  });
});

describe("vueltasPorLectura (el sondeo de respaldo)", () => {
  it("sin socket sondea en cada vuelta, como antes", () => {
    expect(vueltasPorLectura(false)).toBe(1);
  });
  it("con socket solo una de cada seis", () => {
    expect(vueltasPorLectura(true)).toBe(VUELTAS_DE_RESPALDO_CONECTADO);
  });
});

describe("queHacerConUnCambio (Existencias)", () => {
  it("pestaña oculta: guarda el aviso para cuando vuelva", () => {
    expect(queHacerConUnCambio({ oculta: true, hojaAbierta: false })).toBe("guardar-para-despues");
    expect(queHacerConUnCambio({ oculta: true, hojaAbierta: true })).toBe("guardar-para-despues");
  });
  it("con una hoja abierta no le cambia las cifras a quien cuenta: reintenta", () => {
    expect(queHacerConUnCambio({ oculta: false, hojaAbierta: true })).toBe("reintentar");
  });
  it("a la vista y sin hojas: refresca", () => {
    expect(queHacerConUnCambio({ oculta: false, hojaAbierta: false })).toBe("refrescar");
  });
});
