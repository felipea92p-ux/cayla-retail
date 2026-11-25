import { describe, expect, it } from "vitest";
import { PAUSA_MISMO_CODIGO_MS, detalleDeLectura, esLecturaRepetida, estadoCorto, keyframesAviso, keyframesVuelo, mensajeEscaneo, normalizarLectura, sePuedeBajar, sonidoDeLecturaCamara, yaEstabaEnElTicket } from "./escaner-reglas";

describe("escaner-reglas", () => {
  it("normaliza la lectura como la dejaría el lector", () => {
    expect(normalizarLectura("  CAY-0012\n")).toBe("CAY-0012");
  });

  it("ignora la misma etiqueta mientras sigue delante de la cámara", () => {
    const ultima = { codigo: "CAY-0012", en: 1_000 };
    expect(esLecturaRepetida("CAY-0012", ultima, 1_000 + PAUSA_MISMO_CODIGO_MS - 1)).toBe(true);
  });

  it("vuelve a contar la misma etiqueta pasada la pausa (segunda unidad)", () => {
    const ultima = { codigo: "CAY-0012", en: 1_000 };
    expect(esLecturaRepetida("CAY-0012", ultima, 1_000 + PAUSA_MISMO_CODIGO_MS)).toBe(false);
  });

  it("una etiqueta distinta nunca espera", () => {
    expect(esLecturaRepetida("CAY-0099", { codigo: "CAY-0012", en: 1_000 }, 1_001)).toBe(false);
    expect(esLecturaRepetida("CAY-0012", null, 0)).toBe(false);
  });

  it("dice qué pasó con cada lectura", () => {
    expect(mensajeEscaneo({ estado: "agregada", codigo: "C1", nombre: "Blusa Emma · M" })).toEqual({ tono: "verde", texto: "Blusa Emma · M · al ticket" });
    expect(mensajeEscaneo({ estado: "agotada", codigo: "C1", nombre: "Blusa Emma · M" }).tono).toBe("ambar");
    // Apartada para una clienta no es agotada: la que escanea no debe creer que no hay ninguna.
    expect(mensajeEscaneo({ estado: "apartada", codigo: "C1", nombre: "Blusa Emma · M" })).toEqual({ tono: "ambar", texto: "Blusa Emma · M no entró: está apartada para un cliente" });
    expect(mensajeEscaneo({ estado: "tope", codigo: "C1", nombre: "Blusa Emma · M" }).texto).toContain("Ya están todas");
    expect(mensajeEscaneo({ estado: "no-encontrada", codigo: "XYZ" }).texto).toBe("No encontramos «XYZ» en esta tienda");
    expect(mensajeEscaneo({ estado: "en_almacen", codigo: "C1", nombre: "Blusa Emma · M", almacen: 2 })).toEqual({
      tono: "ambar",
      texto: "Blusa Emma · M no entró: está en el almacén",
    });
  });

  it("la etiqueta corta de lo que está en el almacén empieza por el NO: no entró al ticket (D-40)", () => {
    expect(estadoCorto({ estado: "agregada", codigo: "C1" })).toBeNull();
    expect(estadoCorto({ estado: "agotada", codigo: "C1" })).toBe("Agotada aquí");
    expect(estadoCorto({ estado: "en_almacen", codigo: "C1", almacen: 2 })).toBe("No entró · en almacén");
    // Apartada tampoco entra: la etiqueta corta dice que NO entró, como la del almacén (no suena a buena noticia).
    expect(estadoCorto({ estado: "apartada", codigo: "C1" })).toBe("No entró · apartada");
    // Todas las del piso ya están en el ticket y hay más en el almacén: la que se escaneó, para el sistema, está ahí.
    expect(estadoCorto({ estado: "tope", codigo: "C1", almacen: 3 })).toBe("No entró · en almacén");
    expect(estadoCorto({ estado: "tope", codigo: "C1", almacen: null })).toBe("Sin más stock");
    expect(estadoCorto({ estado: "no-encontrada", codigo: "XYZ" })).toBe("No es de esta tienda");
  });
});

describe("el vuelo de la tarjeta al ticket", () => {
  const escala = (t: unknown) => Number(/scale\(([\d.]+)\)/.exec(String(t))?.[1]);

  it("sale del visor y termina exactamente en la bolsa", () => {
    const k = keyframesVuelo(-120, 340);
    expect(k[0].transform).toContain("translate3d(0, 10px, 0)");
    expect(k.at(-1)?.transform).toContain("translate3d(-120px, 340px, 0)");
    expect(k.at(-1)?.offset).toBe(1);
  });

  it("no rebota: la tarjeta nunca crece por encima de su tamaño", () => {
    for (const f of [...keyframesVuelo(80, 300), ...keyframesAviso()]) expect(escala(f.transform)).toBeLessThanOrEqual(1);
  });

  it("los tramos van en orden", () => {
    const offsets = keyframesVuelo(0, 0).map((f) => f.offset as number);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });
});

describe("una prenda sin precio que la cámara lee (ADR-0384)", () => {
  it("dice que no entró y por qué, en la bandeja y en la tarjeta", () => {
    const r = { estado: "sin_precio" as const, codigo: "C1", nombre: "Blusa Emma · M" };
    expect(mensajeEscaneo(r)).toEqual({ tono: "ambar", texto: "Blusa Emma · M no entró: no tiene precio en el catálogo" });
    expect(estadoCorto(r)).toBe("No entró · sin precio");
  });
});

describe("la bandeja de la cámara de Vender dice qué pasó con cada lectura (2026-11-25)", () => {
  const prenda = { referencia: "Casaca Luciana", detalle: "Beige · M", precio: 159.9, fotoUrl: null };

  it("la primera de una prenda: color · talla, y el bip agudo", () => {
    const r = { estado: "agregada" as const, codigo: "CAS-0002-BEI-M", prenda, lleva: 1 };
    expect(detalleDeLectura(r)).toBe("Beige · M");
    expect(yaEstabaEnElTicket(r)).toBe(false);
    expect(sonidoDeLecturaCamara("verde", { yaEstaba: yaEstabaEnElTicket(r) })).toBe("suma");
  });

  it("la misma prenda otra vez entra (Vender no pregunta, ADR-0562), pero dice cuántas van y suena como «ya la escaneaste»", () => {
    const r = { estado: "agregada" as const, codigo: "CAS-0002-BEI-M", prenda, lleva: 2 };
    expect(detalleDeLectura(r)).toBe("Beige · M · van 2");
    expect(yaEstabaEnElTicket(r)).toBe(true);
    expect(sonidoDeLecturaCamara("verde", { yaEstaba: true })).toBe("repetida");
  });

  it("lo que no entró suena grave aunque se diga que ya estaba: el ámbar manda", () => {
    expect(sonidoDeLecturaCamara("ambar", { yaEstaba: true })).toBe("desconocida");
    expect(yaEstabaEnElTicket({ estado: "tope", lleva: 3 })).toBe(false);
  });

  it("sin el dato de cuántas van (Apartados), se lee como la primera", () => {
    expect(yaEstabaEnElTicket({ estado: "agregada" })).toBe(false);
  });

  it("ofrece «Agregar» solo si lo frena el almacén de esta tienda", () => {
    expect(sePuedeBajar({ estado: "en_almacen", almacen: 5 })).toBe(true);
    expect(sePuedeBajar({ estado: "tope", almacen: 2 })).toBe(true);
    expect(sePuedeBajar({ estado: "tope", almacen: 0 })).toBe(false);
    for (const estado of ["agregada", "agotada", "apartada", "sin_precio", "no-encontrada"] as const) expect(sePuedeBajar({ estado, almacen: 3 }), estado).toBe(false);
  });

  it("un código que no es de ninguna prenda dice el código", () => {
    expect(detalleDeLectura({ estado: "no-encontrada", codigo: "XYZ-1" })).toBe("Código XYZ-1");
  });
});

describe("la prenda que ya está en el ticket, en la cámara (ADR-0562, act. 2026-11-25)", () => {
  const r = { estado: "repetida" as const, codigo: "CAS-0002-BEI-M", nombre: "Casaca Luciana · M", lleva: 1, tope: 4 };

  it("no entró sola: es una pregunta, no una venta", () => {
    expect(mensajeEscaneo(r)).toEqual({ tono: "ambar", texto: "Casaca Luciana · M ya está en el ticket: ¿sumar otra?" });
    expect(estadoCorto(r)).toBe("Ya está en el ticket");
    expect(yaEstabaEnElTicket(r)).toBe(false);
  });

  it("no ofrece registrar una bajada: lo que la frena es la pregunta, no el almacén", () => {
    expect(sePuedeBajar({ ...r, almacen: 3 })).toBe(false);
  });
});
