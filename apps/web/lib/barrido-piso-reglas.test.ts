import { describe, expect, it } from "vitest";
import {
  camposGuiaApartar,
  leerHallazgos,
  rutaFotoHallazgo,
  sugerirPorNombre,
  agruparEnTramos,
  leerLecturasDelBarrido,
  textoDeTramo,
  camposGuiaBarrido,
  claveColaBarrido,
  haceCuanto,
  leerColaGuardada,
  personasDelBarrido,
  serializarCola,
  textoDeSubida,
  unidadesDe,
  detalleDePrenda,
  clasificarError,
  juntarColas,
  LECTURA_MAX,
  momentoDelLote,
  prefijoColaBarrido,
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
      personas: null,
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

  it("cada rechazo conocido de la base tiene su frase", () => {
    for (const hint of [
      "barrido_cerrado", "barrido_no_existe", "barrido_sin_modulo", "barrido_sin_tienda", "barrido_sin_permiso", "barrido_tienda_sin_piso",
      "responsable_requerido", "barrido_prenda_desconocida", "responsable_no_presente", "responsable_sin_acceso", "ubicacion_requerida",
      "barrido_lecturas_invalidas", "barrido_lectura_reusada", "barrido_no_es_inventario", "barrido_lectura_ajena", "barrido_anular_invalido",
    ]) expect(textoDeRechazo(hint), hint).toBeTruthy();
    expect(textoDeRechazo(null)).toBeNull();
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

describe("varias personas a la vez", () => {
  const B = "barrido-1";
  it("la cola se guarda y vuelve igual, solo para el MISMO barrido y si no venció", () => {
    const cola = [lectura("1", "va"), lectura("2", "vb", null as never)];
    const apartadas = [{ ...lectura("3", "vc"), motivo: "No estaba de turno" }];
    const texto = serializarCola(B, { cola, apartadas }, ahora);
    expect(leerColaGuardada(texto, B, ahora)).toEqual({ cola, apartadas });
    expect(leerColaGuardada(texto, "otro-barrido", ahora)).toEqual({ cola: [], apartadas: [] });
    expect(leerColaGuardada(texto, B, new Date(ahora.getTime() + 25 * 3_600_000))).toEqual({ cola: [], apartadas: [] });
  });

  it("una cola rota, de otra versión o con una cantidad que la base rechazaría no se reenvía, y no lanza", () => {
    const vacia = { cola: [], apartadas: [] };
    expect(leerColaGuardada(null, B, ahora)).toEqual(vacia);
    expect(leerColaGuardada("{no es json", B, ahora)).toEqual(vacia);
    expect(leerColaGuardada(JSON.stringify({ v: 1, barridoId: B, guardadaEn: ahora.toISOString(), cola: [lectura("1", "va")] }), B, ahora)).toEqual(vacia);
    const conBasura = JSON.stringify({
      v: 2,
      barridoId: B,
      guardadaEn: ahora.toISOString(),
      cola: [lectura("1", "va"), { id: 3 }, { ...lectura("2", "vb"), cantidad: 0 }, { ...lectura("4", "vb"), cantidad: LECTURA_MAX + 1 }],
      apartadas: [lectura("5", "va")],
    });
    expect(leerColaGuardada(conBasura, B, ahora)).toEqual({ cola: [lectura("1", "va")], apartadas: [] });
  });

  it("una clave por pantalla abierta, todas con el prefijo de su sede: dos pestañas no se pisan", () => {
    expect(claveColaBarrido("tru", "a")).not.toBe(claveColaBarrido("tru", "b"));
    expect(claveColaBarrido("tru", "a").startsWith(prefijoColaBarrido("tru"))).toBe(true);
    expect(claveColaBarrido("aqp", "a").startsWith(prefijoColaBarrido("tru"))).toBe(false);
  });

  it("juntar las colas de dos pestañas no repite ninguna lectura", () => {
    const a = { cola: [lectura("1", "va"), lectura("2", "vb")], apartadas: [] };
    const b = { cola: [lectura("2", "vb"), lectura("3", "vc")], apartadas: [{ ...lectura("4", "va"), motivo: "x" }] };
    const j = juntarColas(a, b);
    expect(j.cola.map((l) => l.id)).toEqual(["1", "2", "3"]);
    expect(j.apartadas.map((l) => l.id)).toEqual(["4"]);
  });

  it("«escaneaste tú» = lo de esa persona en la base + lo suyo que falta subir (no lo de otra)", () => {
    const personas = [{ personaId: "ana", nombre: "Ana", unidades: 10, lecturas: 9, ultima: ahora.toISOString() }];
    const cola = [lectura("1", "va"), lectura("2", "vb", ROSA)];
    expect(unidadesDe("ana", personas, cola)).toBe(11);
    expect(unidadesDe("rosa", personas, cola)).toBe(1);
    expect(unidadesDe(null, personas, cola)).toBe(0);
  });

  it("la línea de lo que sube dice si guarda, si espera sin conexión o si está todo", () => {
    expect(textoDeSubida({ enCola: 0, enLinea: true, frenada: null })).toBe("Todo guardado");
    expect(textoDeSubida({ enCola: 3, enLinea: true, frenada: null })).toBe("Guardando 3…");
    expect(textoDeSubida({ enCola: 12, enLinea: false, frenada: null })).toBe("Sin conexión: 12 esperan en este celular");
    expect(textoDeSubida({ enCola: 1, enLinea: false, frenada: null })).toBe("Sin conexión: 1 espera en este celular");
    expect(textoDeSubida({ enCola: 3, enLinea: true, frenada: "x" })).toBe("No se pudo guardar: mira el aviso");
  });

  it("las personas, de la última que leyó a la primera, con cuánto hace y si sigue", () => {
    const p = (personaId: string, min: number, unidades: number) => ({ personaId, nombre: `${personaId} Apellido`, unidades, lecturas: unidades, ultima: new Date(ahora.getTime() - min * 60_000).toISOString() });
    expect(personasDelBarrido([p("Luz", 30, 5), p("Ana", 0, 40), p("Rosa", 3, 12)], ahora)).toEqual([
      { personaId: "Ana", nombre: "Ana", unidades: 40, hace: "ahora", activa: true },
      { personaId: "Rosa", nombre: "Rosa", unidades: 12, hace: "hace 3 min", activa: true },
      { personaId: "Luz", nombre: "Luz", unidades: 5, hace: "hace 30 min", activa: false },
    ]);
    expect(haceCuanto(new Date(ahora.getTime() - 125 * 60_000).toISOString(), ahora)).toBe("hace 2 h");
  });
});

describe("lo que la base rechaza no traba la cola (revisión adversarial de la actividad 2)", () => {
  it("solo se reintenta lo que no tuvo respuesta; un «no» de la base se aparta; el barrido cerrado frena todo", () => {
    expect(clasificarError(null)).toBe("red");
    expect(clasificarError({ code: "", hint: null })).toBe("red"); // sin red: supabase-js no trae código
    expect(clasificarError({ code: "PGRST301", hint: null })).toBe("red");
    expect(clasificarError({ code: "57014", hint: null })).toBe("red"); // la base tardó demasiado
    expect(clasificarError({ code: "08006", hint: null })).toBe("red");
    expect(clasificarError({ code: "40P01", hint: null })).toBe("red");
    expect(clasificarError({ code: "42501", hint: "responsable_no_presente" })).toBe("aparta");
    expect(clasificarError({ code: "22023", hint: "barrido_lecturas_invalidas" })).toBe("aparta");
    expect(clasificarError({ code: "P0001", hint: "barrido_prenda_desconocida" })).toBe("aparta");
    expect(clasificarError({ code: "P0001", hint: "algo_nuevo_que_la_pantalla_no_conoce" })).toBe("aparta");
    expect(clasificarError({ code: "P0001", hint: "barrido_cerrado" })).toBe("frena_todo");
    expect(clasificarError({ code: "42501", hint: "barrido_sin_modulo" })).toBe("frena_todo");
  });

  it("una lectura de un lote rechazado sube sola, para encontrar la mala sin perder las buenas", () => {
    const cola = [lectura("1", "va"), lectura("2", "vb"), lectura("3", "vc")];
    expect(siguienteLote(cola, 300, new Set(["1"])).map((l) => l.id)).toEqual(["1"]);
    expect(siguienteLote(cola, 300, new Set(["2"])).map((l) => l.id)).toEqual(["1"]);
    expect(siguienteLote(cola.slice(1), 300, new Set(["2"])).map((l) => l.id)).toEqual(["2"]);
  });

  it("el lote viaja con la hora en que se escaneó, nunca en el futuro", () => {
    const l = lectura("1", "va"); // 15:07
    expect(momentoDelLote([l], new Date("2026-11-22T18:00:00Z"))).toBe("2026-11-22T15:07:00.000Z");
    expect(momentoDelLote([l], new Date("2026-11-22T15:00:00Z"))).toBe("2026-11-22T15:00:00.000Z"); // reloj del aparato adelantado
    expect(momentoDelLote([], ahora)).toBeNull();
  });

  it("el tope de una lectura es el de la base (cantidad between 1 and 500)", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync(new URL("../../../supabase/migrations/20261122190000_barrido_piso_tablas.sql", import.meta.url), "utf8");
    expect(sql).toContain(`check (cantidad between 1 and ${LECTURA_MAX})`);
  });

  it("la respuesta de cada lote trae lo de cada persona", () => {
    const r = leerRespuestaLecturas({ guardadas: 1, ya_estaban: 0, unidades: 1, por_prenda: [], personas: [{ persona_id: "ana", nombre: "Ana", unidades: 1, lecturas: 1, ultima: "x" }] });
    expect(r?.personas).toEqual([{ personaId: "ana", nombre: "Ana", unidades: 1, lecturas: 1, ultima: "x" }]);
    expect(leerRespuestaLecturas({ guardadas: 1 })?.personas).toBeNull();
  });
});

describe("ver lo escaneado en tramos (actividad 3)", () => {
  const l = (id: string, personaId: string, hhmm: string, anulada = false) => ({
    id,
    varianteId: "va",
    cantidad: 1,
    personaId,
    nombre: personaId === "ana" ? "Ana Pérez" : "Rosa Díaz",
    escaneadaEn: `2026-11-22T${hhmm}:00-05:00`,
    anuladaEn: anulada ? "2026-11-22T11:00:00-05:00" : null,
    anuladaPor: anulada ? "Rosa Díaz" : null,
  });

  it("lee lo que devuelve la base y descarta lo que no tiene forma", () => {
    const r = leerLecturasDelBarrido({
      total: 2,
      tope: 5000,
      lecturas: [
        { id: "1", variante_id: "va", cantidad: 1, persona_id: "ana", nombre: "Ana", escaneada_en: "2026-11-22T15:00:00Z", anulada_en: null, anulada_por: null },
        { id: "2" },
      ],
    });
    expect(r.lecturas).toHaveLength(1);
    expect(r.lecturas[0]).toMatchObject({ id: "1", anuladaEn: null });
    expect(leerLecturasDelBarrido(null)).toEqual({ lecturas: [], total: 0, tope: 0 });
  });

  it("un tramo es lo que una persona escaneó seguido; una pausa de más de 3 min empieza otro; dos personas a la vez no se mezclan", () => {
    const tramos = agruparEnTramos([l("1", "ana", "10:05"), l("2", "rosa", "10:06"), l("3", "ana", "10:07"), l("4", "ana", "10:12"), l("5", "rosa", "10:08")]);
    expect(tramos.map((t) => `${t.personaId}:${t.lecturas.map((x) => x.id).join("")}`)).toEqual(["ana:4", "rosa:52", "ana:31"]);
    expect(tramos[2]).toMatchObject({ desde: "2026-11-22T10:05:00-05:00", hasta: "2026-11-22T10:07:00-05:00", unidades: 2, vivas: ["1", "3"] });
  });

  it("lo quitado sigue en su tramo pero no suma ni se puede volver a quitar", () => {
    const [t] = agruparEnTramos([l("1", "ana", "10:05"), l("2", "ana", "10:06", true)]);
    expect(t.lecturas.map((x) => x.id)).toEqual(["2", "1"]);
    expect(t.unidades).toBe(1);
    expect(t.vivas).toEqual(["1"]);
  });

  it("la hora del tramo, en Lima", () => {
    expect(textoDeTramo("2026-11-22T15:05:00Z", "2026-11-22T15:12:00Z")).toBe("10:05 a 10:12");
    expect(textoDeTramo("2026-11-22T15:05:00Z", "2026-11-22T15:05:30Z")).toBe("10:05");
  });
});

describe("lo que no se puede escanear (actividad 4)", () => {
  const p = (varianteId: string, referencia: string, talla: string, color: string, marca = "CAYLA") =>
    ({ varianteId, referencia, talla, color, marca, sku: `${referencia.slice(0, 3).toUpperCase()}-${talla}`, codigosBarras: [] }) as never;
  const prendas = [p("1", "Blusa Emma", "M", "Beige"), p("2", "Blusa Emma", "S", "Beige"), p("3", "Casaca Ximena", "M", "Azul marino"), p("4", "Vestido Sofía", "L", "Negro")];

  it("busca por nombre: cada palabra, en cualquier orden, sin tildes ni mayúsculas", () => {
    expect(sugerirPorNombre("emma blusa", prendas).map((x: { varianteId: string }) => x.varianteId)).toEqual(["1", "2"]);
    expect(sugerirPorNombre("BLUSA m", prendas).map((x: { varianteId: string }) => x.varianteId)).toEqual(["1"]);
    expect(sugerirPorNombre("sofia", prendas).map((x: { varianteId: string }) => x.varianteId)).toEqual(["4"]);
    expect(sugerirPorNombre("azul marino", prendas).map((x: { varianteId: string }) => x.varianteId)).toEqual(["3"]);
    expect(sugerirPorNombre("b", prendas)).toEqual([]);
    expect(sugerirPorNombre("pantalon", prendas)).toEqual([]);
    expect(sugerirPorNombre("blusa", prendas, 1)).toHaveLength(1);
  });

  it("la foto va en la carpeta del barrido", () => {
    expect(rutaFotoHallazgo("b1", "h1")).toBe("b1/h1.jpg");
  });

  it("lee lo apartado y descarta lo que no tiene forma", () => {
    const h = leerHallazgos([
      { id: "h1", tipo: "sin_etiqueta", cantidad: 2, nota: null, foto_ruta: "b/h1.jpg", nombre: "Ana", registrado_en: "2026-11-22T15:00:00Z", anulada_en: null },
      { id: "h2", tipo: "otro", registrado_en: "x" },
    ]);
    expect(h).toEqual([{ id: "h1", tipo: "sin_etiqueta", codigo: null, cantidad: 2, nota: null, fotoRuta: "b/h1.jpg", nombre: "Ana", registradoEn: "2026-11-22T15:00:00Z", anuladaEn: null, anuladaPor: null }]);
    expect(leerHallazgos(null)).toEqual([]);
  });

  it("apartar pide lo mismo que la base: algo para reconocerla (foto o nota); con código, la foto es sugerida", () => {
    expect(camposGuiaApartar({ tipo: "sin_etiqueta", conFoto: false, nota: " " })[0]).toMatchObject({ requerido: true, hecho: false });
    expect(camposGuiaApartar({ tipo: "sin_etiqueta", conFoto: false, nota: "polo gris" })[0]).toMatchObject({ hecho: true });
    expect(camposGuiaApartar({ tipo: "sin_etiqueta", conFoto: true, nota: "" })[0]).toMatchObject({ hecho: true });
    expect(camposGuiaApartar({ tipo: "codigo_desconocido", conFoto: false, nota: "" })[0]).toMatchObject({ requerido: false, sugerido: true });
  });
});
