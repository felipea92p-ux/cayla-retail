import { describe, expect, it } from "vitest";
import {
  camposGuiaBarrido,
  detalleDePrenda,
  esRechazoQueFrena,
  leerEstadoBarrido,
  leerRespuestaLecturas,
  loteParaLaBase,
  nuevaLectura,
  porPrendaALaVista,
  quienesEscanean,
  siguienteLote,
  sinLasSubidas,
  textoDeRechazo,
  type LecturaBarrido,
} from "./barrido-piso-reglas";

const ANA = { responsableId: "ana", ubicacionId: "tru" };
const ROSA = { responsableId: "rosa", ubicacionId: "tru" };
const ahora = new Date("2026-11-22T15:07:00Z");
const lectura = (id: string, varianteId: string, firma = ANA): LecturaBarrido => nuevaLectura({ id, varianteId, codigo: `C-${varianteId}`, ahora, firma });

describe("leerEstadoBarrido", () => {
  it("lee el barrido abierto con sus prendas y sus personas", () => {
    const e = leerEstadoBarrido({
      separa: true,
      barrido: {
        id: "b1",
        abierto_en: "2026-11-22T14:00:00Z",
        abierto_por: "Ana Pérez",
        unidades: 4,
        lecturas: 3,
        prendas: 2,
        por_prenda: [
          { variante_id: "va", cantidad: 3 },
          { variante_id: "vb", cantidad: 1 },
        ],
        personas: [{ persona_id: "p1", nombre: "Ana Pérez", unidades: 4, lecturas: 3, ultima: "2026-11-22T15:00:00Z" }],
      },
    });
    expect(e.separa).toBe(true);
    expect(e.barrido?.porPrenda).toEqual({ va: 3, vb: 1 });
    expect(e.barrido?.personas[0]).toEqual({ personaId: "p1", nombre: "Ana Pérez", unidades: 4, lecturas: 3, ultima: "2026-11-22T15:00:00Z" });
  });

  it("sin barrido, o con una forma rara, dice «no hay barrido» y no se cae", () => {
    expect(leerEstadoBarrido({ separa: true, barrido: null })).toEqual({ separa: true, barrido: null });
    expect(leerEstadoBarrido(null)).toEqual({ separa: false, barrido: null });
    expect(leerEstadoBarrido({ separa: true, barrido: { unidades: 3 } }).barrido).toBeNull();
    expect(leerEstadoBarrido({ separa: true, barrido: { id: "b", por_prenda: "x", personas: [{}, 3] } }).barrido).toMatchObject({ porPrenda: {}, personas: [] });
  });
});

describe("la cola de este aparato", () => {
  it("cada lectura lleva su id, una unidad, el código y la hora del aparato", () => {
    expect(lectura("l1", "va")).toEqual({ id: "l1", varianteId: "va", cantidad: 1, codigo: "C-va", leidaEnAparato: "2026-11-22T15:07:00.000Z", firma: ANA });
    expect(nuevaLectura({ id: "l2", varianteId: "va", codigo: "   ", ahora, firma: ANA }).codigo).toBeNull();
    expect(nuevaLectura({ id: "l3", varianteId: "va", codigo: "x".repeat(200), ahora, firma: ANA }).codigo).toHaveLength(120);
  });

  it("un lote es de UNA sola firma: lo que leyó Ana sube a nombre de Ana aunque después se elija a Rosa", () => {
    const cola = [lectura("1", "va"), lectura("2", "vb"), lectura("3", "va", ROSA), lectura("4", "vc")];
    expect(siguienteLote(cola).map((l) => l.id)).toEqual(["1", "2"]);
    expect(siguienteLote(sinLasSubidas(cola, siguienteLote(cola))).map((l) => l.id)).toEqual(["3"]);
    expect(siguienteLote([])).toEqual([]);
  });

  it("en una terminal con firma de respaldo (sin firma elegida) las lecturas sin firma van juntas, y no con las firmadas", () => {
    const cola = [lectura("1", "va", null as never), lectura("2", "vb", null as never), lectura("3", "vc")];
    expect(siguienteLote(cola).map((l) => l.id)).toEqual(["1", "2"]);
  });

  it("un lote no pasa del tope de la base", () => {
    const cola = Array.from({ length: 305 }, (_, i) => lectura(String(i), "va"));
    expect(siguienteLote(cola)).toHaveLength(300);
    expect(siguienteLote(cola, 2)).toHaveLength(2);
  });

  it("el lote para la base no lleva la firma (va en los encabezados)", () => {
    expect(loteParaLaBase([lectura("1", "va")])).toEqual([{ id: "1", variante_id: "va", cantidad: 1, codigo: "C-va", leida_en_aparato: "2026-11-22T15:07:00.000Z" }]);
  });

  it("lo que se ve suma lo que dijo la base y lo que falta subir", () => {
    expect(porPrendaALaVista({ va: 3 }, [lectura("1", "va"), lectura("2", "vb")])).toEqual({ va: 4, vb: 1 });
  });
});

describe("lo que devuelve registrar_lecturas_barrido", () => {
  it("se lee, y una forma rara no se toma como respuesta", () => {
    expect(leerRespuestaLecturas({ guardadas: 2, ya_estaban: 1, unidades: 9, por_prenda: [{ variante_id: "va", cantidad: 4 }] })).toEqual({
      guardadas: 2,
      yaEstaban: 1,
      unidades: 9,
      porPrenda: { va: 4 },
    });
    expect(leerRespuestaLecturas("ok")).toBeNull();
  });
});

describe("palabras de tienda", () => {
  it("talla, color y marca, lo que haya", () => {
    expect(detalleDePrenda({ talla: "M", color: "Rojo", marca: "CAYLA" })).toBe("M · Rojo · CAYLA");
    expect(detalleDePrenda({ talla: null, color: "Rojo", marca: " " })).toBe("Rojo");
  });

  it("quién está escaneando: solo quien leyó hace poco, por su primer nombre", () => {
    const p = (nombre: string, minutosAtras: number) => ({ personaId: nombre, nombre, unidades: 1, lecturas: 1, ultima: new Date(ahora.getTime() - minutosAtras * 60_000).toISOString() });
    expect(quienesEscanean([p("Ana Pérez", 1)], ahora)).toBe("Ana está escaneando");
    expect(quienesEscanean([p("Ana Pérez", 1), p("Rosa Díaz", 2)], ahora)).toBe("Ana y Rosa están escaneando");
    expect(quienesEscanean([p("Ana", 1), p("Rosa", 2), p("Luz", 3), p("Eva", 4)], ahora)).toBe("Ana, Rosa y 2 más están escaneando");
    expect(quienesEscanean([p("Ana", 30)], ahora)).toBeNull();
  });

  it("cada rechazo conocido de la base tiene su frase y frena la cola; uno desconocido (la red) no", () => {
    for (const hint of ["barrido_cerrado", "barrido_no_existe", "barrido_sin_modulo", "barrido_sin_tienda", "barrido_sin_permiso", "barrido_tienda_sin_piso", "responsable_requerido", "barrido_prenda_desconocida"]) {
      expect(textoDeRechazo(hint), hint).toBeTruthy();
      expect(esRechazoQueFrena(hint)).toBe(true);
    }
    expect(textoDeRechazo(null)).toBeNull();
    expect(esRechazoQueFrena(undefined)).toBe(false);
  });
});

describe("la guía de foco", () => {
  it("primero quién escanea, después lo colgado; los dos los exige la base", () => {
    const g = (responsableListo: boolean, escaneadas: number) => camposGuiaBarrido({ responsableListo, escaneadas, abierto: true }).map((c) => `${c.id}:${c.hecho}`);
    expect(g(false, 0)).toEqual(["responsable:false", "colgado:false"]);
    expect(g(true, 0)).toEqual(["responsable:true", "colgado:false"]);
    expect(g(true, 3)).toEqual(["responsable:true", "colgado:true"]);
    expect(camposGuiaBarrido({ responsableListo: false, escaneadas: 0, abierto: true }).every((c) => c.requerido)).toBe(true);
  });

  it("antes de empezar solo cuenta quién: «Empezar el barrido» no pide prendas", () => {
    expect(camposGuiaBarrido({ responsableListo: false, escaneadas: 0, abierto: false }).map((c) => c.id)).toEqual(["responsable"]);
  });
});
