import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOTON_COMPROBAR_CUADRE,
  HORAS_DE_VIDA_DEL_BORRADOR_CUADRE,
  MARGEN_ESCANEO_MS,
  RPC_CUADRAR,
  RPC_ESTADO,
  RPC_PREVISUALIZAR,
  VERSION_BORRADOR_CUADRE,
  aGuardado,
  antesYDespues,
  camposGuiaConfirmar,
  camposGuiaEscaneo,
  cifrasDelCuadre,
  claveBorradorCuadre,
  cuentaDeLaPrenda,
  desfaseConServidor,
  deshacerUltima,
  escaneoDesdeAhora,
  fijarCantidadCuadre,
  interpretarErrorDeCuadre,
  leerBorradorCuadre,
  leerCodigoCuadre,
  leerEstadoCuadre,
  leerRespuestaCuadre,
  leerVistaCuadre,
  listasDeLaVista,
  motivoNoConfirmar,
  motivoNoRevisar,
  noCargadasAlEscanear,
  pedirReescaneo,
  quitarLineaCuadre,
  reponerLinea,
  resolverPendiente,
  respuestaResuelveLaMarcaCuadre,
  serializarBorradorCuadre,
  sonidoDeLecturaCuadre,
  sumarLecturaCuadre,
  textoCuadradoEn,
  textoDeBorradorCuadre,
  textoDeEnvioIncierto,
  textoDeResultado,
  totalEscaneado,
  type BorradorCuadre,
  type LineaCuadre,
  type PrendaCuadre,
} from "./cuadre-piso-reglas";
import { siguienteDe, sePuedeConfirmar } from "./guia-campos";

const MIGRACION = readFileSync(join(__dirname, "../../../supabase/migrations/20261004200100_cuadre_piso_funciones.sql"), "utf8");

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";
const prenda = (varianteId: string, sku: string, extra: Partial<PrendaCuadre> = {}): PrendaCuadre => ({
  varianteId,
  sku,
  referencia: "Blusa Emma",
  talla: "M",
  color: "Beige",
  codigosBarras: [`775${sku}`],
  fotoUrl: null,
  activo: true,
  ...extra,
});
const CATALOGO = [prenda(A, "BLU-0001-BEI-M"), prenda(B, "BLU-0001-BEI-L"), prenda(C, "BLU-0001-BEI-S", { activo: false })];

describe("cuentaDeLaPrenda: el espejo de fn_cuadre_piso_calculo", () => {
  it("baja lo que el almacén tiene y nadie escaneó; sube lo escaneado que el sistema creía colgado; lo de más no se carga", () => {
    expect(cuentaDeLaPrenda(5, 1, 2)).toEqual({ alPiso: 3, alAlmacen: 0, noCargadas: 0 });
    expect(cuentaDeLaPrenda(3, 2, 5)).toEqual({ alPiso: 0, alAlmacen: 2, noCargadas: 0 });
    expect(cuentaDeLaPrenda(2, 2, 6)).toEqual({ alPiso: 0, alAlmacen: 2, noCargadas: 2 });
    expect(cuentaDeLaPrenda(0, 0, 1)).toEqual({ alPiso: 0, alAlmacen: 0, noCargadas: 1 });
    expect(cuentaDeLaPrenda(3, 0, 3)).toEqual({ alPiso: 0, alAlmacen: 0, noCargadas: 0 });
    expect(cuentaDeLaPrenda(5, 0, 0)).toEqual({ alPiso: 5, alAlmacen: 0, noCargadas: 0 });
  });

  it("en toda combinación: una sola dirección, el total de la sede no cambia y lo escaneado = lo guardado después + lo no cargado", () => {
    for (let a = 0; a <= 6; a++)
      for (let p = 0; p <= 6; p++)
        for (let s = 0; s <= 14; s++) {
          const c = cuentaDeLaPrenda(a, p, s);
          expect(c.alPiso > 0 && c.alAlmacen > 0).toBe(false);
          const almacenDespues = a - c.alPiso + c.alAlmacen;
          const pisoDespues = p + c.alPiso - c.alAlmacen;
          expect(almacenDespues + pisoDespues).toBe(a + p);
          expect(almacenDespues).toBeGreaterThanOrEqual(0);
          expect(pisoDespues).toBeGreaterThanOrEqual(0);
          expect(almacenDespues + c.noCargadas).toBe(s);
        }
  });

  it("es LA MISMA fórmula que la migración (si alguien cambia una, esta prueba lo nota)", () => {
    expect(MIGRACION).toContain("(case when c.motivo = 'cuadra' then greatest(0, c.a - c.s) else 0 end)::integer");
    expect(MIGRACION).toContain("(case when c.motivo = 'cuadra' then least(greatest(0, c.s - c.a), c.p) else 0 end)::integer");
    expect(MIGRACION).toContain("(case when c.motivo = 'cuadra' then greatest(0, c.s - c.a - c.p) else 0 end)::integer");
  });

  it("los nombres de las RPC son los de la migración, con sus parámetros", () => {
    expect(MIGRACION).toContain(`create or replace function retail.${RPC_CUADRAR}(\n  p_ubicacion_id uuid,\n  p_guardado jsonb,\n  p_escaneo_desde timestamptz,\n  p_nota text default null,\n  p_token uuid default null\n)`);
    expect(MIGRACION).toContain(`create or replace function retail.${RPC_PREVISUALIZAR}(p_ubicacion_id uuid, p_guardado jsonb)`);
    expect(MIGRACION).toContain(`create or replace function retail.${RPC_ESTADO}(p_ubicacion_id uuid)`);
  });
});

describe("la lectura de la pistola o la cámara", () => {
  it("una prenda del catálogo suma (nueva la primera vez); un código desconocido o una talla archivada no", () => {
    expect(leerCodigoCuadre("BLU-0001-BEI-M", CATALOGO, [])).toEqual({ tipo: "suma", prenda: CATALOGO[0], nueva: true });
    expect(leerCodigoCuadre("775BLU-0001-BEI-M", CATALOGO, [{ varianteId: A, cantidad: 2 }])).toEqual({ tipo: "suma", prenda: CATALOGO[0], nueva: false });
    expect(leerCodigoCuadre("  XYZ-999 ", CATALOGO, [])).toEqual({ tipo: "desconocido", codigo: "XYZ-999" });
    expect(leerCodigoCuadre("BLU-0001-BEI-S", CATALOGO, [])).toEqual({ tipo: "archivada", prenda: CATALOGO[2] });
  });

  it("lee el apóstrofo de la pistola en una Mac como guion", () => {
    expect(leerCodigoCuadre("BLU'0001'BEI'L", CATALOGO, []).tipo).toBe("suma");
  });

  it("suena agudo lo que suma y grave lo que no (mira la pantalla)", () => {
    expect(sonidoDeLecturaCuadre({ tipo: "suma", prenda: CATALOGO[0], nueva: true })).toBe("nueva");
    expect(sonidoDeLecturaCuadre({ tipo: "suma", prenda: CATALOGO[0], nueva: false })).toBe("suma");
    expect(sonidoDeLecturaCuadre({ tipo: "desconocido", codigo: "X" })).toBe("desconocida");
    expect(sonidoDeLecturaCuadre({ tipo: "archivada", prenda: CATALOGO[2] })).toBe("desconocida");
  });
});

describe("la lista de lo escaneado", () => {
  const base: LineaCuadre[] = [
    { varianteId: A, cantidad: 2 },
    { varianteId: B, cantidad: 1 },
  ];

  it("cada lectura suma 1 y sube la prenda al principio, sin tope", () => {
    expect(sumarLecturaCuadre(base, B)).toEqual([{ varianteId: B, cantidad: 2 }, { varianteId: A, cantidad: 2 }]);
    let l: LineaCuadre[] = [];
    for (let i = 0; i < 500; i++) l = sumarLecturaCuadre(l, C);
    expect(l).toEqual([{ varianteId: C, cantidad: 500 }]);
  });

  it("«Deshacer la última» resta 1 a la de arriba y, en 0, la saca", () => {
    expect(deshacerUltima(base)).toEqual({ lineas: [{ varianteId: A, cantidad: 1 }, { varianteId: B, cantidad: 1 }], varianteId: A });
    expect(deshacerUltima([{ varianteId: B, cantidad: 1 }, { varianteId: A, cantidad: 2 }])).toEqual({ lineas: [{ varianteId: A, cantidad: 2 }], varianteId: B });
    expect(deshacerUltima([])).toEqual({ lineas: [], varianteId: null });
  });

  it("el número a mano: sin tope (hasta 99999), 0 o menos la quita; quitar y volver a poner en su lugar", () => {
    expect(fijarCantidadCuadre(base, A, 12)).toEqual([{ varianteId: A, cantidad: 12 }, { varianteId: B, cantidad: 1 }]);
    expect(fijarCantidadCuadre(base, A, 1e9)[0].cantidad).toBe(99999);
    expect(fijarCantidadCuadre(base, A, 0)).toEqual([{ varianteId: B, cantidad: 1 }]);
    expect(fijarCantidadCuadre(base, A, Number.NaN)).toEqual([{ varianteId: B, cantidad: 1 }]);
    const sin = quitarLineaCuadre(base, A);
    expect(reponerLinea(sin, base[0], 0)).toEqual(base);
    expect(reponerLinea(base, base[0], 1)).toEqual(base);
    expect(reponerLinea([], base[1], 7)).toEqual([base[1]]);
  });

  it("a la base va sin ceros, sumado y en orden de prenda (la huella no depende del orden del escaneo)", () => {
    const l: LineaCuadre[] = [
      { varianteId: C, cantidad: 1 },
      { varianteId: A, cantidad: 2 },
      { varianteId: A, cantidad: 1 },
      { varianteId: B, cantidad: 0 },
    ];
    expect(aGuardado(l)).toEqual([
      { variante_id: A, cantidad: 3 },
      { variante_id: C, cantidad: 1 },
    ]);
    expect(totalEscaneado(l)).toBe(4);
  });

  it("avisa «no cargada» cuando lo escaneado pasa lo que el sistema tiene libre en la sede", () => {
    expect(noCargadasAlEscanear({ almacen: 2, piso: 2 }, 6)).toBe(2);
    expect(noCargadasAlEscanear({ almacen: 2, piso: 2 }, 4)).toBe(0);
    expect(noCargadasAlEscanear(undefined, 1)).toBe(1);
  });

  it("lo que cambió en el almacén sale de la lista y queda por volver a escanear; escanearla lo resuelve", () => {
    const r = pedirReescaneo(base, [C], [A, C]);
    expect(r.lineas).toEqual([{ varianteId: B, cantidad: 1 }]);
    expect(r.pendientes.sort()).toEqual([A, C].sort());
    expect(resolverPendiente(r.pendientes, A)).toEqual([C]);
  });
});

describe("la hora del escaneo es la del servidor", () => {
  it("con el aparato 2 minutos atrasado, la hora sale en el reloj del servidor, un minuto antes", () => {
    const local = Date.parse("2026-10-04T13:00:00.000Z");
    const desfase = desfaseConServidor("2026-10-04T13:02:00.000Z", local);
    expect(desfase).toBe(120_000);
    expect(escaneoDesdeAhora(local, desfase)).toBe(new Date(local + 120_000 - MARGEN_ESCANEO_MS).toISOString());
    expect(desfaseConServidor("no es fecha", local)).toBe(0);
  });
});

describe("el borrador, por sede", () => {
  const ahora = new Date("2026-10-04T14:00:00.000Z");
  const b: BorradorCuadre = {
    v: VERSION_BORRADOR_CUADRE,
    token: "11111111-2222-4333-8444-555555555555",
    escaneoDesde: "2026-10-04T13:00:00.000Z",
    lineas: [{ varianteId: A, cantidad: 3 }],
    pendientes: [B],
    confirmoVacio: false,
    nota: "",
    creadoEn: "2026-10-04T13:00:00.000Z",
  };

  it("la clave es de la SEDE (no de la cuenta): escanea Almacén y confirma un líder en el mismo navegador", () => {
    expect(claveBorradorCuadre("sede-1")).toBe("cayla:cuadre:sede-1:borrador");
  });

  it("ida y vuelta; conserva las prendas aunque no estén en la sede (una no cargada no se pierde en silencio)", () => {
    expect(leerBorradorCuadre(serializarBorradorCuadre(b), ahora)).toEqual(b);
    const enviado = { ...b, enviadoEn: "2026-10-04T13:30:00.000Z" };
    expect(leerBorradorCuadre(serializarBorradorCuadre(enviado), ahora)?.enviadoEn).toBe(enviado.enviadoEn);
  });

  it(`vence a las ${HORAS_DE_VIDA_DEL_BORRADOR_CUADRE} horas; uno roto o de otra versión no se lee`, () => {
    expect(leerBorradorCuadre(serializarBorradorCuadre(b), new Date("2026-10-05T01:00:01.000Z"))).toBeNull();
    expect(leerBorradorCuadre("{roto", ahora)).toBeNull();
    expect(leerBorradorCuadre(null, ahora)).toBeNull();
    expect(leerBorradorCuadre(JSON.stringify({ ...b, v: 2 }), ahora)).toBeNull();
    expect(leerBorradorCuadre(JSON.stringify({ ...b, lineas: [{ varianteId: A, cantidad: 0 }] }), ahora)).toBeNull();
    expect(leerBorradorCuadre(JSON.stringify({ ...b, token: "x" }), ahora)).toBeNull();
    expect(leerBorradorCuadre(JSON.stringify({ ...b, escaneoDesde: "ayer" }), ahora)).toBeNull();
  });

  it("la tarjeta dice cuándo empezó y cuánto lleva", () => {
    expect(textoDeBorradorCuadre(b)).toBe("Tienes un cuadre a medias en este equipo, empezado el 04/10 a las 08:00, con 3 prendas escaneadas.");
    expect(textoDeBorradorCuadre({ ...b, lineas: [] })).toContain("sin prendas escaneadas todavía");
  });
});

// La forma real de la base (salida de pruebas:cuadrar-piso, C4).
const RESUMEN_BASE = {
  antes: { piso: 7, almacen: 13 },
  total: 20,
  danadas: 1,
  despues: { piso: 4, almacen: 16 },
  apartadas: 2,
  archivadas: { piso: 0, lineas: 1, almacen: 2 },
  lineas_al_piso: 1,
  prendas_al_piso: 3,
  escaneadas_fuera: 1,
  lineas_al_almacen: 3,
  lineas_no_cargadas: 3,
  prendas_al_almacen: 6,
  prendas_escaneadas: 21,
  prendas_no_cargadas: 4,
};
const RESPUESTA_BASE = {
  ...RESUMEN_BASE,
  por: "Felipe Alvarez",
  nota: null,
  cuadre_id: "5728776a-d2a6-4703-a02a-f6da6c4bef7c",
  no_cargado: [{ piso: 2, prenda: "Blusa Cuadre Prueba · 32 · Amarillo", almacen: 2, escaneadas: 6, no_cargadas: 2, variante_id: A }],
  cuadrado_en: "2026-10-04T14:33:08.84661-05:00",
  ubicacion_id: "cb4bb9c6-876c-4e5f-b23e-cb541851ae1d",
  ya_registrado: false,
};

describe("lo que devuelve la base", () => {
  it("la respuesta del cuadre", () => {
    const r = leerRespuestaCuadre(RESPUESTA_BASE)!;
    expect(r.prendasAlPiso).toBe(3);
    expect(r.antes).toEqual({ piso: 7, almacen: 13 });
    expect(r.despues).toEqual({ piso: 4, almacen: 16 });
    expect(r.noCargado).toEqual([{ varianteId: A, prenda: "Blusa Cuadre Prueba · 32 · Amarillo", escaneadas: 6, almacen: 2, piso: 2, noCargadas: 2 }]);
    expect(r.por).toBe("Felipe Alvarez");
    expect(r.yaRegistrado).toBe(false);
    expect(leerRespuestaCuadre({ ...RESPUESTA_BASE, ya_registrado: true })?.yaRegistrado).toBe(true);
    expect(leerRespuestaCuadre({ ...RESPUESTA_BASE, cuadre_id: undefined })).toBeNull();
    expect(leerRespuestaCuadre({ ...RESPUESTA_BASE, antes: null })).toBeNull();
    expect(leerRespuestaCuadre("no")).toBeNull();
  });

  it("la previsualización, con sus líneas y el último cuadre", () => {
    const linea = { variante_id: A, prenda: "Blusa Emma · M · Beige", motivo: "cuadra", almacen: 5, piso: 1, apartadas: 0, escaneadas: 2, al_piso: 3, al_almacen: 0, no_cargadas: 0 };
    const v = leerVistaCuadre({ resumen: RESUMEN_BASE, lineas: [linea], ultimo_cuadre: null, revisado_en: "2026-10-04T14:00:00Z" })!;
    expect(v.lineas[0]).toEqual({ varianteId: A, prenda: "Blusa Emma · M · Beige", motivo: "cuadra", almacen: 5, piso: 1, apartadas: 0, escaneadas: 2, alPiso: 3, alAlmacen: 0, noCargadas: 0 });
    expect(v.ultimoCuadre).toBeNull();
    expect(leerVistaCuadre({ resumen: RESUMEN_BASE, lineas: [linea], ultimo_cuadre: RESPUESTA_BASE })?.ultimoCuadre?.cuadreId).toBe(RESPUESTA_BASE.cuadre_id);
    expect(leerVistaCuadre({ resumen: RESUMEN_BASE, lineas: [{ ...linea, motivo: "otro" }] })).toBeNull();
    expect(leerVistaCuadre({ resumen: {}, lineas: [] })).toBeNull();
  });

  it("el estado de la sede: sin cuadre y con cuadre", () => {
    expect(leerEstadoCuadre({ cuadrado_en: null, por: null, prendas_al_piso: 0, prendas_al_almacen: 0, cuadres: 0 })).toEqual({ cuadradoEn: null, por: null, prendasAlPiso: 0, prendasAlAlmacen: 0, cuadres: 0 });
    expect(leerEstadoCuadre({ cuadrado_en: "2026-10-04T14:33:08-05:00", por: "Ana", prendas_al_piso: 435, prendas_al_almacen: 12, cuadres: 1 })?.prendasAlPiso).toBe(435);
    expect(leerEstadoCuadre(null)).toBeNull();
  });

  it("las listas de «Revisar» y el antes → después de cada línea salen de la cuenta de la base", () => {
    const l = (id: string, motivo: "cuadra" | "archivada" | "no_es_inventario", alPiso: number, alAlmacen: number, noCargadas: number, prenda: string) => ({
      varianteId: id, prenda, motivo, almacen: 5, piso: 1, apartadas: 0, escaneadas: 2, alPiso, alAlmacen, noCargadas,
    });
    const listas = listasDeLaVista([l(A, "cuadra", 3, 0, 0, "Zeta"), l(B, "cuadra", 0, 1, 2, "Alfa"), l(C, "archivada", 0, 0, 0, "Beta")]);
    expect(listas.alPiso.map((x) => x.varianteId)).toEqual([A]);
    expect(listas.alAlmacen.map((x) => x.varianteId)).toEqual([B]);
    expect(listas.noCargadas.map((x) => x.varianteId)).toEqual([B]);
    expect(listas.fuera.map((x) => x.varianteId)).toEqual([C]);
    expect(antesYDespues(listas.alPiso[0])).toEqual({ almacen: [5, 2], piso: [1, 4] });
    expect(antesYDespues(listas.alAlmacen[0])).toEqual({ almacen: [5, 6], piso: [1, 0] });
  });
});

describe("los textos", () => {
  it("las cifras de arriba, en singular y plural", () => {
    const r = leerRespuestaCuadre(RESPUESTA_BASE)!;
    expect(cifrasDelCuadre(r, "TRU")).toEqual({ alPiso: "3 pasan al piso", alAlmacen: "6 suben al almacén", noCargadas: "4 no cargadas", total: "el total de TRU no cambia: 20" });
    expect(cifrasDelCuadre({ ...r, prendasAlPiso: 1, prendasAlAlmacen: 1, prendasNoCargadas: 1, total: 773 }, "TRU")).toEqual({
      alPiso: "1 pasa al piso",
      alAlmacen: "1 sube al almacén",
      noCargadas: "1 no cargada",
      total: "el total de TRU no cambia: 773",
    });
  });

  it("el envío sin respuesta dice a qué hora se envió y qué hacer", () => {
    expect(textoDeEnvioIncierto("2026-10-04T13:05:00Z")).toBe(
      `Enviaste el cuadre a las 08:05 y no supimos si se guardó. Pulsa «${BOTON_COMPROBAR_CUADRE}»: si ya se había guardado, no se repite.`,
    );
  });

  it("la fecha del cuadre en hora de Lima, y el resultado", () => {
    expect(textoCuadradoEn("2026-10-04T23:32:00Z", "Ana Torres")).toBe("el 04/10 a las 18:32 · Ana Torres");
    const r = leerRespuestaCuadre(RESPUESTA_BASE)!;
    expect(textoDeResultado(r, "TRU").titulo).toBe("Piso de TRU cuadrado");
    expect(textoDeResultado({ ...r, yaRegistrado: true }, "TRU").titulo).toBe("El piso de TRU ya estaba cuadrado");
    expect(textoDeResultado(r, "TRU").detalle).toBe("el 04/10 a las 14:33 · Felipe Alvarez · 3 pasan al piso · 6 suben al almacén · 4 no cargadas");
  });
});

describe("los rechazos de la base", () => {
  it("sin respuesta (o sin código de Postgres) no se sabe si se guardó: «Comprobar»", () => {
    expect(interpretarErrorDeCuadre({ message: "Failed to fetch" })).toEqual({ tipo: "red", mensaje: expect.stringContaining(BOTON_COMPROBAR_CUADRE) });
    expect(interpretarErrorDeCuadre({ message: "Bad Gateway", code: null }).tipo).toBe("red");
  });

  it("el almacén se movió: qué prendas y desde cuándo volver a escanear", () => {
    const e = interpretarErrorDeCuadre({
      message: "Mientras escaneabas se movieron 2 prendas en el almacén.",
      code: "P0001",
      hint: "cuadre_almacen_movido",
      details: JSON.stringify({ revisado_hasta: "2026-10-04T14:44:44.272656-05:00", prendas: [{ variante_id: A, prenda: "Blusa Emma · M" }, { variante_id: B, prenda: "Blusa Emma · L" }] }),
    });
    expect(e).toEqual({
      tipo: "almacen_movido",
      mensaje: "Mientras escaneabas se movieron 2 prendas en el almacén.",
      prendas: [{ varianteId: A, prenda: "Blusa Emma · M" }, { varianteId: B, prenda: "Blusa Emma · L" }],
      revisadoHasta: "2026-10-04T14:44:44.272656-05:00",
    });
    expect(interpretarErrorDeCuadre({ message: "x", code: "P0001", hint: "cuadre_almacen_movido", details: "{roto" })).toMatchObject({ tipo: "almacen_movido", prendas: [], revisadoHasta: null });
  });

  it("ya se cuadró: trae el cuadre de la otra persona; y los demás por su pista", () => {
    const e = interpretarErrorDeCuadre({ message: "El piso de esta sede ya se cuadró", code: "P0001", hint: "cuadre_ya_hecho", details: JSON.stringify(RESPUESTA_BASE) });
    expect(e.tipo === "ya_hecho" && e.respuesta?.cuadreId).toBe(RESPUESTA_BASE.cuadre_id);
    expect(interpretarErrorDeCuadre({ message: "m", code: "P0001", hint: "cuadre_token_reusado" }).tipo).toBe("token_reusado");
    expect(interpretarErrorDeCuadre({ message: "m", code: "P0001", hint: "cuadre_nota_requerida" }).tipo).toBe("nota_requerida");
    expect(interpretarErrorDeCuadre({ message: "m", code: "P0001", hint: "cuadre_solo_lider" }).tipo).toBe("solo_lider");
    expect(interpretarErrorDeCuadre({ message: "m", code: "P0001", hint: "cuadre_lista_invalida" })).toEqual({ tipo: "otro", mensaje: "m" });
    expect(interpretarErrorDeCuadre(null).tipo).toBe("otro");
  });

  it("en un reenvío, solo lo que la base respondió DESPUÉS de mirar la marca suelta la lista congelada", () => {
    expect(respuestaResuelveLaMarcaCuadre(null)).toBe(true);
    expect(respuestaResuelveLaMarcaCuadre({ message: "Failed to fetch" })).toBe(false);
    expect(respuestaResuelveLaMarcaCuadre({ message: "m", code: "40P01" })).toBe(true);
    for (const hint of ["cuadre_token_reusado", "cuadre_ya_hecho", "cuadre_almacen_movido", "cuadre_nota_requerida", "responsable_no_presente"]) {
      expect(respuestaResuelveLaMarcaCuadre({ message: "m", code: "P0001", hint })).toBe(true);
    }
    for (const hint of ["cuadre_solo_lider", "cuadre_sin_tienda", "cuadre_lista_invalida", "cuadre_escaneo_invalido", "cuadre_sin_token"]) {
      expect(respuestaResuelveLaMarcaCuadre({ message: "m", code: "P0001", hint })).toBe(false);
    }
  });

  it("cada pista que levanta la migración y que la pantalla distingue existe en la migración", () => {
    for (const hint of ["cuadre_almacen_movido", "cuadre_ya_hecho", "cuadre_token_reusado", "cuadre_solo_lider", "cuadre_tienda_sin_piso", "cuadre_escaneo_invalido", "cuadre_lista_invalida", "cuadre_sin_token"]) {
      expect(MIGRACION).toContain(`hint = '${hint}'`);
    }
  });
});

describe("la guía de foco", () => {
  it("escanear: falta lo guardado hasta escanear algo o decir que no hay nada; las que cambiaron bloquean", () => {
    expect(siguienteDe(camposGuiaEscaneo({ lineas: 0, confirmoVacio: false, pendientes: 0 }))?.id).toBe("guardado");
    expect(sePuedeConfirmar(camposGuiaEscaneo({ lineas: 3, confirmoVacio: false, pendientes: 0 }))).toBe(true);
    expect(sePuedeConfirmar(camposGuiaEscaneo({ lineas: 0, confirmoVacio: true, pendientes: 0 }))).toBe(true);
    expect(siguienteDe(camposGuiaEscaneo({ lineas: 3, confirmoVacio: false, pendientes: 2 }))?.id).toBe("reescanear");
  });

  it("la guía coincide con el botón «Revisar» en todos los casos", () => {
    for (const lineas of [0, 2])
      for (const confirmoVacio of [false, true])
        for (const pendientes of [0, 1]) {
          const x = { lineas, confirmoVacio, pendientes };
          expect(sePuedeConfirmar(camposGuiaEscaneo(x))).toBe(motivoNoRevisar(x) === null);
        }
  });

  it("confirmar: quién cuadra siempre; la nota, solo si la sede ya se cuadró (lo exige la base); coincide con el botón", () => {
    expect(camposGuiaConfirmar({ responsableListo: false, notaRequerida: false, nota: "" }).find((c) => c.id === "nota")?.requerido).toBe(false);
    expect(camposGuiaConfirmar({ responsableListo: true, notaRequerida: true, nota: "" }).find((c) => c.id === "nota")?.requerido).toBe(true);
    for (const responsableListo of [false, true])
      for (const notaRequerida of [false, true])
        for (const nota of ["", "faltaba el estante del fondo"]) {
          const guia = sePuedeConfirmar(camposGuiaConfirmar({ responsableListo, notaRequerida, nota }));
          const boton = motivoNoConfirmar({ esLider: true, responsableMotivo: responsableListo ? null : "Elige quién", notaRequerida, nota }) === null;
          expect(guia).toBe(boton);
        }
  });

  it("sin ser líder el botón no desaparece: se apaga y dice quién sí puede", () => {
    expect(motivoNoConfirmar({ esLider: false, responsableMotivo: null, notaRequerida: false, nota: "" })).toMatch(/^Solo un líder confirma el cuadre/);
    expect(motivoNoConfirmar({ esLider: true, responsableMotivo: null, notaRequerida: false, nota: "x".repeat(301) })).toMatch(/hasta 300/);
  });
});
