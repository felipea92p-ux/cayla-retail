import { describe, expect, it } from "vitest";
import {
  claveEspera,
  detalleEspera,
  etiquetaBotonAvisame,
  etiquetaQuitarAviso,
  estadoEspera,
  fechaDicha,
  leerGuardados,
  leerMiClub,
  leerRespuestaAviso,
  leerRespuestaFavorito,
  leerRespuestaQuitar,
  listaDicha,
  mensajeAviso,
  mensajeFavorito,
  MENSAJES_CLUB,
  ordenarEsperas,
  textoAvisoAnotado,
  textoAvisoQuitado,
  textoBotonAvisame,
  textoNovedades,
  tituloNovedades,
  type Espera,
  type MiClub,
} from "./club";

const HOY = { anio: 2026, mes: 10, dia: 14 };
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Lo que devuelve `retail.tienda_mi_club` (20261015025000), tal cual.
const CRUDO = {
  club: {
    activa: true,
    con_publicidad: false,
    cumple: { estado: "disponible", dia: 3, mes: 10, pct: 10, hasta: "2026-10-31", canjeado_el: null },
    aniversario: {
      estado: "en_camino",
      vale_monto: null,
      vale_vence: null,
      vale_canjeado_el: null,
      proximo: "2027-05-03",
      anio_cuenta: false,
      compras: 2,
      monto: 150.5,
      compras_meta: 6,
      monto_meta: 600,
      siguiente_monto: 20,
      dias: 60,
    },
  },
  novedades: { primera: false, desde: "2026-10-13T10:00:00+00:00", total: 3, productos: [ID(1), ID(2), ID(3)] },
  favoritos: [ID(4)],
  esperas: [
    {
      id: ID(5),
      variante_id: ID(6),
      producto_id: ID(1),
      producto: "Blusa Emma",
      color: { codigo: "NEG", nombre: "Negro", hex: "#111111" },
      talla: "M",
      sede: { id: ID(7), nombre: "Trujillo" },
      creada_en: "2026-10-12T15:00:00+00:00",
      se_ve: true,
      llego: false,
      hay_en: ["Lima"],
    },
  ],
};

const club = (): MiClub => {
  const c = leerMiClub(CRUDO);
  if (!c) throw new Error("no se leyó");
  return c;
};

const espera = (e: Partial<Espera>): Espera => ({ ...club().esperas[0], ...e });

describe("leer lo que devuelve tienda_mi_club", () => {
  it("lee el Club, las novedades, los favoritos y las esperas", () => {
    const c = club();
    expect(c.club.cumple).toEqual({ estado: "disponible", dia: 3, mes: 10, pct: 10, hasta: "2026-10-31", canjeadoEl: null });
    expect(c.club.aniversario.monto).toBe(150.5);
    expect(c.novedades).toEqual({ primera: false, total: 3, productos: [ID(1), ID(2), ID(3)] });
    expect(c.favoritos).toEqual([ID(4)]);
    expect(c.esperas[0]).toMatchObject({ producto: "Blusa Emma", talla: "M", sede: { nombre: "Trujillo" }, hayEn: ["Lima"] });
  });

  it("acepta montos que llegan como texto (numeric de Postgres)", () => {
    const c = leerMiClub({ ...CRUDO, club: { ...CRUDO.club, aniversario: { ...CRUDO.club.aniversario, monto: "150.50", monto_meta: "600.00" } } });
    expect(c?.club.aniversario.monto).toBe(150.5);
    expect(c?.club.aniversario.montoMeta).toBe(600);
  });

  it("una respuesta sin la forma no se muestra a medias; una espera rara se deja fuera sola", () => {
    expect(leerMiClub(null)).toBeNull();
    expect(leerMiClub({ ...CRUDO, club: { ...CRUDO.club, cumple: { ...CRUDO.club.cumple, estado: "otro" } } })).toBeNull();
    const c = leerMiClub({ ...CRUDO, esperas: [{ id: "no-es-un-id" }, ...CRUDO.esperas] });
    expect(c?.esperas).toHaveLength(1);
  });
});

describe("las fechas, como se dicen", () => {
  it("de este año sin el año; de otro, con el año", () => {
    expect(fechaDicha("2026-10-31", HOY)).toBe("31 de octubre");
    expect(fechaDicha("2027-05-03", HOY)).toBe("3 de mayo de 2027");
    expect(fechaDicha("2026-02-01T05:00:00+00:00", HOY)).toBe("1 de febrero");
  });

  it("una lista: «Lima», «Lima y Trujillo», «Arequipa, Lima y Trujillo»", () => {
    expect(listaDicha(["Lima"])).toBe("Lima");
    expect(listaDicha(["Lima", "Trujillo"])).toBe("Lima y Trujillo");
    expect(listaDicha(["Arequipa", "Lima", "Trujillo"])).toBe("Arequipa, Lima y Trujillo");
  });
});

describe("Novedades para ti (propuesta i)", () => {
  it("desde la última visita, la primera vez «esta semana», y en singular", () => {
    expect(tituloNovedades({ primera: false, total: 3, productos: [] })).toBe("Llegaron 3 prendas desde tu última visita.");
    expect(tituloNovedades({ primera: true, total: 1, productos: [] })).toBe("Llegó 1 prenda esta semana.");
    expect(tituloNovedades({ primera: false, total: 0, productos: [] })).toBe("Desde tu última visita no llegó nada nuevo.");
    expect(tituloNovedades({ primera: true, total: 0, productos: [] })).toBe("Esta semana no llegó nada nuevo.");
    expect(textoNovedades({ primera: true, total: 2, productos: [] })).toBe("Sin mensajes de publicidad: las novedades las ves aquí.");
  });
});

describe("Te avisamos cuando llegue", () => {
  it("dice el color, la talla y la tienda (o cualquiera)", () => {
    expect(detalleEspera(espera({}))).toBe("Negro · Talla M · en Trujillo");
    expect(detalleEspera(espera({ sede: null }))).toBe("Negro · Talla M · en cualquier tienda");
    expect(detalleEspera(espera({ color: null, talla: null }))).toBe("en Trujillo");
  });

  it("llegó a su tienda, llegó a alguna (cualquier tienda), ya no está en la web, o sigue esperando (y dónde hay)", () => {
    expect(estadoEspera(espera({ llego: true }))).toEqual({ tono: "llego", texto: "¡Llegó! Hay en Trujillo." });
    expect(estadoEspera(espera({ sede: null, llego: true, hayEn: ["Lima", "Trujillo"] }))).toEqual({ tono: "llego", texto: "¡Llegó! Hay en Lima y Trujillo." });
    expect(estadoEspera(espera({ seVe: false, llego: true }))).toEqual({ tono: "fuera", texto: "Ya no está en la tienda online." });
    expect(estadoEspera(espera({}))).toEqual({ tono: "espera", texto: "Te avisamos aquí apenas llegue. Ahora hay en Lima." });
    expect(estadoEspera(espera({ hayEn: [] }))).toEqual({ tono: "espera", texto: "Te avisamos aquí apenas llegue." });
  });
});

describe("el orden de «Te avisamos cuando llegue»", () => {
  it("primero lo que llegó, después lo que espera y al final lo que ya no está en la web; si no, como viene", () => {
    const a = espera({ id: ID(11) });
    const b = espera({ id: ID(12), llego: true });
    const c = espera({ id: ID(13), seVe: false });
    const d = espera({ id: ID(14) });
    expect(ordenarEsperas([c, a, b, d]).map((e) => e.id)).toEqual([ID(12), ID(11), ID(14), ID(13)]);
  });
});

describe("los botones: corazón y «Avísame»", () => {
  it("el botón dice la talla (la tienda, solo para el lector); una talla sin nombre no se nombra", () => {
    expect(textoBotonAvisame("M")).toBe("Avísame cuando llegue la M");
    expect(textoBotonAvisame("Única")).toBe("Avísame cuando llegue");
    expect(etiquetaBotonAvisame("28", "Trujillo")).toBe("Avísame cuando llegue la 28 a Trujillo");
    expect(etiquetaBotonAvisame("M", null)).toBe("Avísame cuando llegue la M");
    expect(textoAvisoAnotado("M", null)).toBe("Te avisaremos en tu cuenta cuando llegue la talla M.");
    expect(textoAvisoAnotado("Estándar", "Lima")).toBe("Te avisaremos en tu cuenta cuando llegue a Lima.");
  });

  it("ya pedido, el mismo botón lo quita: el lector oye qué aviso se quita y el aviso de abajo dice que se puede volver a pedir", () => {
    expect(etiquetaQuitarAviso("M", "Trujillo")).toBe("Quitar el aviso de la talla M a Trujillo");
    expect(etiquetaQuitarAviso("Única", null)).toBe("Quitar el aviso");
    expect(textoAvisoQuitado("M")).toBe("Quitamos el aviso de la talla M. Puedes volver a pedirlo cuando quieras.");
    expect(textoAvisoQuitado("Estándar")).toBe("Quitamos el aviso. Puedes volver a pedirlo cuando quieras.");
  });

  it("la clave de una espera: la prenda y la tienda, o «todas»", () => {
    expect(claveEspera(ID(6), ID(7))).toBe(`${ID(6)}|${ID(7)}`);
    expect(claveEspera(ID(6), null)).toBe(`${ID(6)}|todas`);
  });

  it("lee las respuestas de la base; lo que no entiende es «sin respuesta»", () => {
    expect(leerRespuestaFavorito({ estado: "guardado" })).toBe("guardado");
    expect(leerRespuestaFavorito({ estado: "sin_cuenta" })).toBe("sin_respuesta");
    expect(leerRespuestaFavorito(null)).toBe("sin_respuesta");
    expect(leerRespuestaAviso({ estado: "anotada", id: ID(9), sede: null, nueva: true })).toEqual({ estado: "anotada", esperaId: ID(9) });
    expect(leerRespuestaAviso({ estado: "anotada" })).toEqual({ estado: "sin_respuesta", esperaId: null });
    expect(leerRespuestaAviso({ estado: "hay", sede: null })).toEqual({ estado: "hay", esperaId: null });
    expect(leerRespuestaQuitar({ estado: "no_esta" })).toBe("no_esta");
    expect(leerRespuestaQuitar({ estado: "invalido" })).toBe("sin_respuesta");
  });

  it("lo guardado de una cuenta: los favoritos y las esperas por su clave", () => {
    const g = leerGuardados({ favoritos: [ID(1)], esperas: [{ id: ID(5), variante_id: ID(6), sede: null }] });
    expect(g?.favoritos.has(ID(1))).toBe(true);
    expect(g?.esperas.get(claveEspera(ID(6), null))).toBe(ID(5));
    expect(leerGuardados(null)).toBeNull();
  });

  it("los mensajes de lo que no se pudo: cada estado con su palabra, y nada si salió bien", () => {
    expect(mensajeFavorito("guardado")).toBeNull();
    expect(mensajeFavorito("quitado")).toBeNull();
    expect(mensajeFavorito("tope")).toBe(MENSAJES_CLUB.favoritoTope);
    expect(mensajeFavorito("sin_respuesta")).toBe(MENSAJES_CLUB.sinRespuesta);
    expect(mensajeAviso("hay")).toBe(MENSAJES_CLUB.hay);
    expect(mensajeAviso("tope")).toBe(MENSAJES_CLUB.avisoTope);
    expect(mensajeAviso("cuenta_inactiva")).toBe(MENSAJES_CLUB.cuentaInactiva);
  });

  it("textos sin género: ni «clienta», ni «socia», ni «bienvenida»", () => {
    const todo = JSON.stringify(MENSAJES_CLUB);
    expect(todo).not.toMatch(/clienta|socia|bienvenida|bienvenido/i);
  });
});
