import { describe, expect, it } from "vitest";
import {
  textoDeError,
  avisoDeBarrido,
  DIAS_ENTRE_BARRIDOS,
  camposGuiaConfirmar,
  dondeLaTiene,
  leerVistaBarrido,
  textoDelResultado,
  camposGuiaApartar,
  leerHallazgos,
  fotoYaEstaba,
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
  POR_RESOLVER_VACIO,
  camposGuiaResolver,
  dondeEstaNoCargada,
  leerPorResolver,
  opcionesDeResolver,
  prendasPorResolver,
  textoDeComo,
  textoDeErrorResolver,
  estadoDelHistorial,
  fechaDelBarrido,
  leerDetalleBarrido,
  leerHistorial,
  porResolverDeLaFila,
  quienDelBarrido,
  fraseDeLaFila,
  memoriaDeLaPersona,
  juntarMemoria,
  textoLlegaronTarde,
  codigoParaMostrar,
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

  it("la foto va en la carpeta del barrido; cada foto nueva, en su propia ruta", () => {
    expect(rutaFotoHallazgo("b1", "h1")).toBe("b1/h1.jpg");
    expect(rutaFotoHallazgo("b1", "h1", 2)).toBe("b1/h1-2.jpg");
  });

  it("reintentar con la misma foto: el bucket dice «ya existe» y se toma como subida", () => {
    expect(fotoYaEstaba({ message: "The resource already exists", statusCode: "409" })).toBe(true);
    expect(fotoYaEstaba({ message: "x", error: "Duplicate" })).toBe(true);
    expect(fotoYaEstaba({ message: "new row violates row-level security policy", statusCode: "403" })).toBe(false);
    expect(fotoYaEstaba(null)).toBe(false);
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

describe("revisar y confirmar (actividad 5)", () => {
  const vista = {
    resumen: { antes: { piso: 9, almacen: 11 }, despues: { piso: 7, almacen: 13 }, total: 20, escaneadas: 9, prendas_al_piso: 2, prendas_al_almacen: 4, prendas_no_cargadas: 1, lineas_se_movieron: 1, aparte: 2 },
    lineas: [
      { variante_id: "va", prenda: "Blusa Emma · M", motivo: "cuadra", escaneadas: 3, piso: 1, almacen: 5, al_piso: 2, al_almacen: 0, no_cargadas: 0, otras_sedes: [], en_camino: 0 },
      { variante_id: "vf", prenda: "Casaca · L", motivo: "cuadra", escaneadas: 1, piso: 0, almacen: 0, al_piso: 0, al_almacen: 0, no_cargadas: 1, otras_sedes: [{ sede: "Tienda Trujillo", cantidad: 2 }], en_camino: 1 },
      { variante_id: "vz", motivo: "raro" },
    ],
    conteo_abierto: null,
    ultima_lectura: "2026-11-22T15:00:00Z",
  };

  it("lee la revisión y descarta lo que no tiene forma", () => {
    const v = leerVistaBarrido(vista);
    expect(v?.resumen).toMatchObject({ prendasAlPiso: 2, prendasAlAlmacen: 4, prendasNoCargadas: 1, lineasSeMovieron: 1, aparte: 2, total: 20 });
    expect(v?.lineas.map((l) => l.varianteId)).toEqual(["va", "vf"]);
    expect(v?.conteoAbierto).toBeNull();
    expect(leerVistaBarrido({ ...vista, conteo_abierto: { numero: 7 } })?.conteoAbierto).toBe("Conteo 7");
    expect(leerVistaBarrido(null)).toBeNull();
  });

  it("dónde tiene el sistema lo que no está en la tienda", () => {
    expect(dondeLaTiene({ otrasSedes: [{ sede: "Tienda Trujillo", cantidad: 2 }], enCamino: 1 })).toBe("Trujillo tiene 2 · 1 en camino a esta tienda");
    expect(dondeLaTiene({ otrasSedes: [], enCamino: 0 })).toBe("No está en ninguna tienda");
  });

  it("confirmar pide quién y que se escaneó todo (lo mismo que la base)", () => {
    expect(camposGuiaConfirmar({ responsableListo: true, todoEscaneado: false }).map((c) => `${c.id}:${c.hecho}:${c.requerido}`)).toEqual(["responsable:true:true", "todo:false:true"]);
  });

  it("el resultado en una línea", () => {
    const r = leerVistaBarrido(vista)!.resumen;
    expect(textoDelResultado(r)).toBe("2 pasaron al piso y 4 volvieron al almacén.");
    expect(textoDelResultado({ ...r, prendasAlPiso: 1, prendasAlAlmacen: 0 })).toBe("1 pasó al piso.");
    expect(textoDelResultado({ ...r, prendasAlPiso: 0, prendasAlAlmacen: 0 })).toBe("El piso ya estaba al día: no hubo que mover nada.");
  });
});

describe("la entrada en Existencias", () => {
  const hace = (dias: number) => new Date(ahora.getTime() - dias * 86_400_000).toISOString();
  const abierto = { id: "b", abiertoEn: hace(0), abiertoPor: "Ana", unidades: 120, lecturas: 118, prendas: 60, porPrenda: {}, aparte: 0,
    personas: [{ personaId: "ana", nombre: "Ana Pérez", unidades: 120, lecturas: 118, ultima: ahora.toISOString() }] };

  it("con un barrido abierto invita a sumarse, con cuánto llevan y quién escanea", () => {
    expect(avisoDeBarrido({ barrido: abierto, cuadradoEn: hace(3), ahora })).toEqual({ tipo: "en_curso", titulo: "Barrido en curso · 120 prendas", detalle: "Ana está escaneando", boton: "Sumarme" });
    expect(avisoDeBarrido({ barrido: { ...abierto, unidades: 1, personas: [] }, cuadradoEn: null, ahora })).toMatchObject({ titulo: "Barrido en curso · 1 prenda", detalle: null });
  });

  it("a los 30 días del último cuadre toca el del mes; antes, nada", () => {
    expect(DIAS_ENTRE_BARRIDOS).toBe(30);
    expect(avisoDeBarrido({ barrido: null, cuadradoEn: hace(29), ahora })).toBeNull();
    expect(avisoDeBarrido({ barrido: null, cuadradoEn: hace(30), ahora })).toEqual({ tipo: "toca", titulo: "Toca el barrido del mes", detalle: "El último fue hace 30 días", boton: "Hacer el barrido" });
    expect(avisoDeBarrido({ barrido: null, cuadradoEn: hace(41), ahora })?.detalle).toBe("El último fue hace 41 días");
  });

  it("una tienda que nunca cuadró no lleva este aviso (tiene el suyo: «el piso nunca se ha cuadrado»)", () => {
    expect(avisoDeBarrido({ barrido: null, cuadradoEn: null, ahora })).toBeNull();
    expect(avisoDeBarrido({ barrido: null, cuadradoEn: "no es fecha", ahora })).toBeNull();
  });
});

describe("lo que se dice cuando algo no se guardó", () => {
  it("la frase del rechazo, «sin conexión» si no hubo respuesta, o el mensaje de la base", () => {
    expect(textoDeError({ code: "P0001", hint: "barrido_cerrado", message: "x" }, "apartar")).toBe("Este barrido ya se cerró. Lo que escaneaste después no se sumó.");
    expect(textoDeError({ message: "TypeError: Failed to fetch" }, "apartar")).toBe("No hay conexión: no se pudo apartar. Vuelve a intentarlo.");
    expect(textoDeError({ code: "23505", hint: null, message: "duplicate key" }, "quitar")).toBe("No se pudo quitar: duplicate key");
  });
});

describe("«Por resolver» (actividad 8)", () => {
  const crudo = {
    no_cargadas: [
      { barrido_id: "b1", confirmado_en: "2026-11-22T15:00:00Z", confirmado_por: "Ana", variante_id: "v1", prenda: "Blusa Emma · M", pendientes: 2,
        otras_sedes: [{ sede: "Tienda Lima", cantidad: 3 }, { sede: "x" }], en_camino: 1 },
      { barrido_id: "b1", variante_id: "v2", pendientes: 0 },
    ],
    apartados: [
      { id: "h1", barrido_id: "b1", tipo: "sin_etiqueta", nota: "polo gris", cantidad: 3, pendientes: 2, por: "Rosa", registrado_en: "2026-11-22T14:00:00Z" },
      { id: "h2", barrido_id: "b1", tipo: "otro", pendientes: 1 },
    ],
  };

  it("lee las dos listas y descarta lo que ya no tiene pendientes o no tiene forma", () => {
    const p = leerPorResolver(crudo);
    expect(p.noCargadas.map((n) => [n.varianteId, n.pendientes, n.enCamino, n.otrasSedes.length])).toEqual([["v1", 2, 1, 1]]);
    expect(p.apartados.map((a) => [a.id, a.pendientes, a.cantidad, a.nota])).toEqual([["h1", 2, 3, "polo gris"]]);
    expect(prendasPorResolver(p)).toBe(4);
    expect(leerPorResolver(null)).toEqual(POR_RESOLVER_VACIO);
  });

  it("dice dónde está una no cargada, primero lo que viene en camino", () => {
    expect(dondeEstaNoCargada({ enCamino: 1, otrasSedes: [{ sede: "Tienda Lima", cantidad: 3 }] })).toBe("1 en camino a esta tienda · Tienda Lima tiene 3");
    expect(dondeEstaNoCargada({ enCamino: 0, otrasSedes: [] })).toBe("No está en ninguna tienda del sistema");
  });

  it("«La encontré» no se ofrece si viene en camino (se contaría dos veces), y cada opción dice lo que hace", () => {
    expect(opcionesDeResolver(0).every((o) => !o.deshabilitada)).toBe(true);
    expect(opcionesDeResolver(2).find((o) => o.valor === "encontrada")?.deshabilitada).toBe(true);
    expect(textoDeComo("", 2)).toMatch(/Traslados/);
    expect(new Set((["colgada", "encontrada", "no_era"] as const).map((c) => textoDeComo(c, 0))).size).toBe(3);
    expect(textoDeComo("", 0)).toBe("");
  });

  it("la guía pide qué pasó y, en lo apartado que no se descarta, qué prenda era", () => {
    expect(camposGuiaResolver({ esApartado: false, como: "", varianteId: "" }).map((c) => c.id)).toEqual(["como"]);
    expect(camposGuiaResolver({ esApartado: true, como: "colgada", varianteId: "" }).map((c) => [c.id, c.hecho])).toEqual([["como", true], ["prenda", false]]);
    expect(camposGuiaResolver({ esApartado: true, como: "no_era", varianteId: "" }).map((c) => c.id)).toEqual(["como"]);
  });

  it("los rechazos con cifra se dicen con el mensaje de la base; los demás, en voz de tienda", () => {
    expect(textoDeErrorResolver({ hint: "barrido_en_camino", message: "Esa prenda viene en un traslado (1 en camino)." })).toMatch(/1 en camino/);
    expect(textoDeErrorResolver({ hint: "barrido_resolver_no_esta", message: "x" })).toBe("Eso ya no está por resolver. Recarga la lista.");
    expect(textoDeErrorResolver({ message: "TypeError: Failed to fetch" })).toMatch(/conexión|resolver/);
  });
});

describe("El historial (actividad 9)", () => {
  const fila = { id: "b1", estado: "confirmado", abierto_en: "2026-11-22T15:00:00Z", abierto_por: "Ana Torres", cerrado_en: "2026-11-22T16:00:00Z", cerrado_por: "Rosa",
    unidades: 9, lecturas: 5, quitadas: 1, personas: 2, aparte: 2, al_piso: 2, al_almacen: 4, no_cargadas: 1 };

  it("lee el historial y descarta lo que no tiene forma; un barrido no confirmado no trae cifras de lo movido", () => {
    const h = leerHistorial({ total: 3, barridos: [fila, { ...fila, id: "b2", estado: "cancelado" }, { id: "x" }] });
    expect(h.total).toBe(3);
    expect(h.barridos.map((b) => [b.id, b.estado, b.alPiso, porResolverDeLaFila(b)])).toEqual([["b1", "confirmado", 2, 3], ["b2", "cancelado", null, null]]);
    expect(leerHistorial(null)).toEqual({ barridos: [], total: 0 });
  });

  it("lee el detalle con lo de cada persona, lo movido y lo no cargado", () => {
    const d = leerDetalleBarrido({ ...fila, sede: "Tienda Lima",
      por_persona: [{ persona_id: "p1", nombre: "Ana Torres", unidades: 7, lecturas: 4, quitadas: 1, desde: "2026-11-22T15:00:00Z", hasta: "2026-11-22T15:40:00Z" }, { persona_id: "p2" }],
      movidas: [{ variante_id: "v1", prenda: "Blusa Emma · M", sentido: "al_piso", cantidad: 2 }, { variante_id: "v2", sentido: "otro" }],
      no_cargado: [{ variante_id: "v3", prenda: "Casaca", no_cargadas: 1 }] });
    expect(d?.sede).toBe("Tienda Lima");
    expect(d?.porPersona.map((p) => [p.nombre, p.unidades])).toEqual([["Ana Torres", 7]]);
    expect(d?.movidas.map((m) => [m.sentido, m.cantidad])).toEqual([["al_piso", 2]]);
    expect(d?.noCargado).toEqual([{ varianteId: "v3", prenda: "Casaca", cantidad: 1 }]);
    expect(leerDetalleBarrido({})).toBeNull();
  });

  it("cada estado se dice con su palabra y la fecha va en hora de Lima", () => {
    expect((["confirmado", "abierto", "cancelado"] as const).map((e) => estadoDelHistorial(e).texto)).toEqual(["Confirmado", "En curso", "Descartado"]);
    const hoy = new Date("2026-11-23T15:00:00Z");
    expect(fechaDelBarrido("2026-11-22T23:05:00Z", hoy)).toMatch(/22 nov, 18:05/);
    expect(fechaDelBarrido("2025-11-22T23:05:00Z", hoy)).toMatch(/22 nov 2025, 18:05/);
  });

  it("quién firmó y cuántas escanearon; la fila dicha en una frase", () => {
    const f = leerHistorial({ barridos: [{ id: "b1", estado: "confirmado", abierto_en: "2026-11-22T15:00:00Z", abierto_por: "Ana", cerrado_por: "Rosa", personas: 3, unidades: 9, al_piso: 2, al_almacen: 4, no_cargadas: 1, aparte: 0 }] }).barridos[0];
    expect(quienDelBarrido(f)).toBe("Rosa · 3 escanearon");
    expect(quienDelBarrido({ ...f, personas: 1 })).toBe("Rosa");
    expect(fraseDeLaFila(f, new Date("2026-11-23T00:00:00Z"))).toMatch(/confirmado, 9 escaneadas, 2 al piso, 4 al almacén, 1 por resolver/);
  });
});

describe("la memoria de la persona (repetidas tras recargar, /formidable 2026-11-23)", () => {
  const l = (id: string, varianteId: string, personaId: string, hhmm: string, anulada = false) => ({
    id,
    varianteId,
    cantidad: 1,
    personaId,
    nombre: personaId,
    escaneadaEn: `2026-11-22T${hhmm}:00-05:00`,
    anuladaEn: anulada ? "2026-11-22T11:00:00-05:00" : null,
    anuladaPor: null,
  });
  const lecturas = [l("1", "m", "ana", "10:01"), l("2", "s", "ana", "10:03"), l("3", "m", "rosa", "10:05"), l("4", "l", "ana", "10:02", true), l("5", "m", "ana", "10:00")];

  it("cuenta solo lo suyo y sin lo quitado, y su última es la más nueva que sigue en pie", () => {
    expect(memoriaDeLaPersona(lecturas, "ana")).toEqual({ porPrenda: { m: 2, s: 1 }, ultima: "s" });
    expect(memoriaDeLaPersona(lecturas, "rosa")).toEqual({ porPrenda: { m: 1 }, ultima: "m" });
  });

  it("sin persona elegida no recuerda nada", () => {
    expect(memoriaDeLaPersona(lecturas, null)).toEqual({ porPrenda: {}, ultima: null });
  });

  it("suma lo suyo que espera en este celular, nunca lo de otra firma", () => {
    expect(juntarMemoria({ m: 2 }, [lectura("a", "m"), lectura("b", "s", ROSA)], "ana", null)).toEqual({ m: 3 });
  });

  it("no baja de lo que el celular ya contaba (una lectura subió entre la pregunta y la respuesta)", () => {
    expect(juntarMemoria({ m: 1 }, [], "ana", { m: 2, s: 1 })).toEqual({ m: 2, s: 1 });
  });

  it("si cambió la persona, empieza de lo de ella", () => {
    expect(juntarMemoria({ s: 1 }, [], "rosa", null)).toEqual({ s: 1 });
  });
});

describe("lo que llegó tarde y el código largo (chaos 2026-11-23)", () => {
  const nombre = (id: string) => ({ a: "Blusa Emma · L", b: "Polo Kai · M" })[id] ?? "Prenda";
  it("nombra las prendas que no entraron", () => {
    expect(textoLlegaronTarde([{ varianteId: "a", cantidad: 1 }], nombre)).toBe(
      "1 lectura de este celular llegó tarde y no entró: Blusa Emma · L. Si están colgadas, revisa en Existencias que sigan en el piso.",
    );
    expect(textoLlegaronTarde([{ varianteId: "a", cantidad: 1 }, { varianteId: "a", cantidad: 2 }, { varianteId: "b", cantidad: 1 }], nombre)).toMatch(/^4 lecturas .*: Blusa Emma · L, Polo Kai · M\./);
  });
  it("sin nada pendiente no dice nada", () => {
    expect(textoLlegaronTarde([], nombre)).toBeNull();
  });
  it("con muchas prendas corta en tres", () => {
    const l = ["1", "2", "3", "4", "5"].map((v) => ({ varianteId: v, cantidad: 1 }));
    expect(textoLlegaronTarde(l, (v) => `P${v}`)).toContain("P1, P2, P3 y 2 más.");
  });
  it("un código larguísimo se muestra corto", () => {
    expect(codigoParaMostrar("Y".repeat(300))).toBe(`${"Y".repeat(40)}…`);
    expect(codigoParaMostrar(" ABC ")).toBe("ABC");
  });
});
