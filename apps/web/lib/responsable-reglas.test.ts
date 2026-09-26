import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  encabezadosResponsable,
  esErrorDeResponsable,
  estadoCombo,
  firmaDeEncabezados,
  firmar,
  LISTA_VACIA,
  listaResponsable,
  mensajeErrorResponsable,
  motivoSinResponsable,
  preguntaResponsable,
  proponeSesion,
  responsableInicial,
  responsableVigente,
  turnoGuardadoVigente,
  type FilaDeTurno,
} from "./responsable-reglas";
import { traducirError } from "./error-escritura";

const fila = (id: string, estado: string, deEstaSede = true): FilaDeTurno => ({
  persona_id: id,
  nombre_corto: `Nombre ${id}`,
  estado_ahora: estado,
  es_de_esta_sede: deEstaSede,
});

describe("listaResponsable — quién se puede elegir", () => {
  it("solo las presentes son elegibles; en pausa se ven aparte; las que salieron solo se cuentan; programada no aparece", () => {
    const l = listaResponsable([fila("ana", "presente"), fila("bea", "en_pausa"), fila("cata", "salio"), fila("dora", "programada"), fila("eli", "salio")]);
    expect(l.elegibles.map((p) => p.personaId)).toEqual(["ana"]);
    expect(l.enPausa.map((p) => p.personaId)).toEqual(["bea"]);
    expect(l.enPausa[0].enPausa).toBe(true);
    expect(l.salieron).toBe(2);
  });

  it("alguien de otra sede que marcó entrada aquí también puede firmar, y se marca", () => {
    const l = listaResponsable([fila("ana", "presente"), fila("eva", "presente", false)]);
    expect(l.elegibles.map((p) => [p.personaId, p.deOtraSede])).toEqual([["ana", false], ["eva", true]]);
  });

  it("si nadie marcó hoy (todas programada) NO se ofrecen las de la sede: se bloquea (cambia la regla del ADR-0163)", () => {
    const l = listaResponsable([fila("ana", "programada"), fila("bea", "programada")]);
    expect(l.elegibles).toEqual([]);
  });
});

describe("responsableVigente — nunca se firma con alguien ausente", () => {
  const l = listaResponsable([fila("ana", "presente"), fila("bea", "en_pausa")]);
  it("sin elegir no hay responsable, aunque haya una sola persona (viene vacío siempre)", () => {
    expect(responsableVigente(l, null)).toBeNull();
  });
  it("la elegida que sigue presente cuenta", () => {
    expect(responsableVigente(l, "ana")).toBe("ana");
  });
  it("si pasó a pausa o salió con el formulario abierto, deja de contar", () => {
    expect(responsableVigente(l, "bea")).toBeNull();
    expect(responsableVigente(l, "zoe")).toBeNull();
  });
});

describe("estadoCombo y su motivo", () => {
  const conAna = listaResponsable([fila("ana", "presente")]);
  it("antes de la primera lectura: cargando; si falló sin lista previa: sin_lectura", () => {
    expect(estadoCombo({ cargo: false, fallo: false, lista: LISTA_VACIA, elegidoId: null })).toBe("cargando");
    expect(estadoCombo({ cargo: false, fallo: true, lista: LISTA_VACIA, elegidoId: null })).toBe("sin_lectura");
  });
  it("sin nadie presente se bloquea, aunque haya gente en pausa", () => {
    const soloPausa = listaResponsable([fila("bea", "en_pausa")]);
    expect(estadoCombo({ cargo: true, fallo: false, lista: soloPausa, elegidoId: null })).toBe("nadie");
  });
  it("con una sola presente igual falta elegir: nunca se elige sola por ser la única", () => {
    expect(estadoCombo({ cargo: true, fallo: false, lista: conAna, elegidoId: null })).toBe("falta");
    expect(estadoCombo({ cargo: true, fallo: false, lista: conAna, elegidoId: "ana" })).toBe("listo");
  });
  it("sin tocar el combo vale el propuesto (la persona de la sesión); tocarlo manda, y en terminal/POS no hay propuesto", () => {
    expect(responsableInicial(undefined, "ana")).toBe("ana");
    expect(responsableInicial("bea", "ana")).toBe("bea");
    expect(responsableInicial(undefined, null)).toBeNull();
    // Propuesta pero sin marcar entrada: no se firma con ella, falta elegir.
    expect(responsableVigente(listaResponsable([fila("bea", "presente")]), responsableInicial(undefined, "ana"))).toBeNull();
    expect(estadoCombo({ cargo: true, fallo: false, lista: conAna, elegidoId: responsableInicial(undefined, "ana") })).toBe("listo");
  });
  it("el Admin no pasa por el candado: ni la lista, ni la lectura, ni la asistencia lo bloquean", () => {
    expect(estadoCombo({ cargo: true, fallo: false, lista: LISTA_VACIA, elegidoId: null, admin: true })).toBe("admin");
    expect(estadoCombo({ cargo: false, fallo: true, lista: LISTA_VACIA, elegidoId: null, admin: true })).toBe("admin");
    expect(motivoSinResponsable("admin", "Tienda TRU")).toBeNull();
  });
  it("solo «listo» (o el Admin) deja de bloquear", () => {
    expect(motivoSinResponsable("listo", "Tienda TRU")).toBeNull();
    expect(motivoSinResponsable("falta", "Tienda TRU")).toBe("Elige quién hace esta operación.");
    expect(motivoSinResponsable("falta", "Tienda TRU", "atencion")).toBe("Elige quién está atendiendo.");
    expect(motivoSinResponsable("nadie", "Tienda TRU")).toMatch(/Nadie de turno en Tienda TRU/);
    expect(motivoSinResponsable("sin_lectura", "Tienda TRU")).toMatch(/Actualizar lista/);
    expect(motivoSinResponsable("cargando", "Tienda TRU")).not.toBeNull();
  });
});

describe("turnoGuardadoVigente — la lista de turno que recuerda el navegador (ADR-0210)", () => {
  const ahora = new Date("2026-09-25T20:00:00.000Z");
  const fila: FilaDeTurno = { persona_id: "p1", nombre_corto: "Ana", estado_ahora: "presente", es_de_esta_sede: true };

  it("sirve si tiene menos de 12 horas", () => {
    expect(turnoGuardadoVigente({ filas: [fila], leidoEn: "2026-09-25T09:00:00.000Z" }, ahora)).toBe(true);
  });

  it("de hace más de 12 horas ya no dice quién está hoy", () => {
    expect(turnoGuardadoVigente({ filas: [fila], leidoEn: "2026-09-25T07:59:00.000Z" }, ahora)).toBe(false);
  });

  it("una hora del futuro (reloj movido) o algo roto no sirve", () => {
    expect(turnoGuardadoVigente({ filas: [fila], leidoEn: "2026-09-25T21:00:00.000Z" }, ahora)).toBe(false);
    expect(turnoGuardadoVigente({ filas: [fila], leidoEn: "no es fecha" }, ahora)).toBe(false);
    expect(turnoGuardadoVigente(null, ahora)).toBe(false);
    expect(turnoGuardadoVigente({ filas: "x" } as never, ahora)).toBe(false);
  });
});

describe("encabezados", () => {
  it("manda responsable y tienda; el momento solo si lo hay (venta sin conexión)", () => {
    expect(encabezadosResponsable({ responsableId: "p1", ubicacionId: "u1" })).toEqual({ "x-responsable": "p1", "x-ubicacion": "u1" });
    expect(encabezadosResponsable({ responsableId: "p1", ubicacionId: "u1", momento: "2026-09-22T15:00:00.000Z" })).toEqual({
      "x-responsable": "p1",
      "x-ubicacion": "u1",
      "x-momento": "2026-09-22T15:00:00.000Z",
    });
  });

  it("firmar pone cada encabezado con setHeader; sin firma deja la consulta intacta", () => {
    const puestos: [string, string][] = [];
    const consulta = {
      setHeader(n: string, v: string) {
        puestos.push([n, v]);
        return consulta;
      },
    };
    expect(firmar(consulta, null)).toBe(consulta);
    expect(puestos).toEqual([]);
    expect(firmar(consulta, { responsableId: "p1", ubicacionId: "u1", momento: "m" })).toBe(consulta);
    expect(puestos).toEqual([["x-responsable", "p1"], ["x-ubicacion", "u1"], ["x-momento", "m"]]);
  });

  it("una ruta del servidor recupera la firma del fetch, o nada si vino incompleta", () => {
    expect(firmaDeEncabezados(new Headers({ "x-responsable": "p1", "x-ubicacion": "u1" }))).toEqual({ responsableId: "p1", ubicacionId: "u1", momento: null });
    expect(firmaDeEncabezados(new Headers({ "x-responsable": "p1" }))).toBeNull();
    expect(firmaDeEncabezados(new Headers())).toBeNull();
  });
});

describe("errores de la base — qué se le dice a la persona", () => {
  const e42501 = (hint: string) => ({ code: "42501", hint, message: "texto de la base" });

  it("cada hint de fn_actor_persona_id tiene su frase accionable", () => {
    expect(mensajeErrorResponsable(e42501("responsable_requerido"))).toMatch(/Falta elegir/);
    expect(mensajeErrorResponsable(e42501("responsable_no_presente"))).toMatch(/ya no figura de turno/);
    expect(mensajeErrorResponsable(e42501("responsable_sin_acceso"))).toMatch(/no tiene acceso a retail/);
    expect(mensajeErrorResponsable(e42501("ubicacion_requerida"))).toMatch(/tienda de esta operación/);
  });

  it("un 42501 cualquiera (otro permiso) no es del responsable", () => {
    expect(mensajeErrorResponsable({ code: "42501", hint: null, message: "Solo un líder puede…" })).toBeNull();
    expect(esErrorDeResponsable({ code: "42501", hint: null, message: "Solo un líder puede…" })).toBe(false);
    expect(esErrorDeResponsable(null)).toBe(false);
  });

  it("la hora fuera de rango de una venta sin conexión también se explica", () => {
    expect(mensajeErrorResponsable({ code: "22007", message: "La hora de la operación está fuera de rango" })).toMatch(/sin conexión/);
  });

  it("traducirError usa estas frases en todas las pantallas", () => {
    expect(traducirError(e42501("responsable_no_presente"), "cerrar la caja")).toMatch(/ya no figura de turno/);
  });
});

describe("dos modos: atender a la clienta u otra operación (Felipe, 2026-09-23)", () => {
  it("el combo vacío y su aviso dicen lo mismo en cada modo", () => {
    expect(preguntaResponsable("atencion")).toBe("¿Quién está atendiendo?");
    expect(preguntaResponsable("operacion")).toBe("¿Quién hace esta operación?");
    expect(motivoSinResponsable("falta", "Tienda TRU", "atencion")).toBe("Elige quién está atendiendo.");
    expect(motivoSinResponsable("falta", "Tienda TRU", "operacion")).toBe("Elige quién hace esta operación.");
  });
  it("solo fuera de la atención a la clienta se propone a quien inició sesión", () => {
    expect(proponeSesion("operacion")).toBe(true);
    expect(proponeSesion("atencion")).toBe(false);
  });

  // Qué pantallas atienden a la clienta: Punto de venta (venta y sus apartados), Cambios y Devoluciones. El resto
  // pregunta «¿Quién hace esta operación?». Si alguien agrega el combo a una pantalla nueva de atención, se suma aquí.
  const COMPONENTES = new URL("../components/", import.meta.url);
  const ATENCION = [
    "PuntoDeVenta.tsx",
    "CambiosFlujo.tsx",
    "DevolucionesFlujo.tsx",
    "apartados/ApartarVista.tsx",
    "apartados/EntregarVista.tsx",
    "apartados/ModalesApartado.tsx",
  ];
  const conCombo = (readdirSync(COMPONENTES, { recursive: true }) as string[])
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({ archivo: f.split("\\").join("/"), fuente: readFileSync(new URL(f, COMPONENTES), "utf8") }))
    .filter((c) => /useResponsable\(/.test(c.fuente));

  it("cada pantalla de atención a la clienta usa el modo «atencion» en todos sus combos", () => {
    for (const archivo of ATENCION) {
      const c = conCombo.find((x) => x.archivo === archivo);
      expect(c, archivo).toBeDefined();
      const usos = c!.fuente.match(/useResponsable\([^;]*\);/g) ?? [];
      expect(usos.length, archivo).toBeGreaterThan(0);
      for (const uso of usos) expect(uso, archivo).toContain('modo: "atencion"');
    }
  });
  it("ninguna otra pantalla usa el modo «atencion»", () => {
    const fuera = conCombo.filter((c) => !ATENCION.includes(c.archivo) && c.fuente.includes('modo: "atencion"')).map((c) => c.archivo);
    expect(fuera).toEqual([]);
  });
});
