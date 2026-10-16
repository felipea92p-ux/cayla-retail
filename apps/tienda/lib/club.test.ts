import { describe, expect, it } from "vitest";
import {
  beneficioAniversario,
  beneficioCumple,
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
  proximoCumple,
  textoAvisoAnotado,
  textoAvisoQuitado,
  textoBotonAvisame,
  textoNovedades,
  tituloNovedades,
  type Aniversario,
  type Cumple,
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

const cumple = (c: Partial<Cumple>): Cumple => ({ estado: "proximo", dia: 3, mes: 5, pct: 10, hasta: null, canjeadoEl: null, ...c });
const aniv = (a: Partial<Aniversario>): Aniversario => ({
  estado: "en_camino",
  valeMonto: null,
  valeVence: null,
  valeCanjeadoEl: null,
  proximo: "2027-05-03",
  anioCuenta: false,
  compras: 2,
  monto: 150.5,
  comprasMeta: 6,
  montoMeta: 600,
  siguienteMonto: 20,
  dias: 60,
  ...a,
});
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

  it("el próximo cumpleaños: este año si no pasó, el que viene si ya pasó", () => {
    expect(proximoCumple(20, 10, HOY)).toBe("20 de octubre");
    expect(proximoCumple(14, 10, HOY)).toBe("14 de octubre");
    expect(proximoCumple(13, 10, HOY)).toBe("13 de octubre de 2027");
    expect(proximoCumple(3, 5, HOY)).toBe("3 de mayo de 2027");
  });

  it("una lista: «Lima», «Lima y Trujillo», «Arequipa, Lima y Trujillo»", () => {
    expect(listaDicha(["Lima"])).toBe("Lima");
    expect(listaDicha(["Lima", "Trujillo"])).toBe("Lima y Trujillo");
    expect(listaDicha(["Arequipa", "Lima", "Trujillo"])).toBe("Arequipa, Lima y Trujillo");
  });
});

describe("el descuento de cumpleaños (la regla de la caja, ADR-0288 D-5)", () => {
  it("disponible: el %, hasta cuándo y que se usa en caja con su DNI", () => {
    const b = beneficioCumple(cumple({ estado: "disponible", mes: 10, hasta: "2026-10-31" }), false, HOY);
    expect(b).toEqual({
      titulo: "Tu descuento de cumpleaños: 10 %",
      texto: "Es tu mes: úsalo en una compra en cualquier tienda CAYLA hasta el 31 de octubre. En caja, con tu DNI.",
      disponible: true,
      avance: null,
    });
  });

  it("canjeado: cuándo lo usó y cuándo vuelve", () => {
    const b = beneficioCumple(cumple({ estado: "canjeado", mes: 10, canjeadoEl: "2026-10-05" }), false, HOY);
    expect(b.titulo).toBe("Descuento de cumpleaños: ya lo usaste este año");
    expect(b.texto).toBe("Lo usaste el 5 de octubre. Vuelve a estar disponible en octubre de 2027.");
    expect(b.disponible).toBe(false);
  });

  it("próximo: WhatsApp solo si lo autorizó (los términos: «solo si lo autorizaste»)", () => {
    expect(beneficioCumple(cumple({}), true, HOY).texto).toBe("10 % en una compra en tienda durante tu mes. Te avisamos por WhatsApp y también lo ves aquí.");
    expect(beneficioCumple(cumple({}), false, HOY).texto).toBe("10 % en una compra en tienda durante tu mes. Lo ves aquí cuando llegue tu mes.");
    expect(beneficioCumple(cumple({}), false, HOY).titulo).toBe("Descuento de cumpleaños: 3 de mayo de 2027");
  });

  it("sin fecha: díselo a la tienda; un % con decimales se dice con uno", () => {
    expect(beneficioCumple(cumple({ estado: "sin_fecha", dia: null, mes: null }), false, HOY).texto).toMatch(/no tiene tu cumpleaños/);
    expect(beneficioCumple(cumple({ estado: "disponible", pct: 12.5 }), false, HOY).titulo).toBe("Tu descuento de cumpleaños: 12.5 %");
  });
});

describe("el vale por aniversario (la regla de la caja, ADR-0288 G-9 y G-13)", () => {
  it("con el vale: el monto y hasta cuándo se usa", () => {
    const b = beneficioAniversario(aniv({ estado: "vale", valeMonto: 20, valeVence: "2026-12-02" }), false, HOY);
    expect(b).toEqual({
      titulo: "Tienes un vale de S/\u00a020",
      texto: "Por tu aniversario con CAYLA. Úsalo en una compra en cualquier tienda CAYLA hasta el 2 de diciembre. En caja, con tu DNI.",
      disponible: true,
      avance: null,
    });
  });

  it("en camino: cuándo, cuánto, el umbral y lo que lleva, con su barra", () => {
    const b = beneficioAniversario(aniv({}), false, HOY);
    // «S/» y la cifra con un espacio que no se parte (ADR-0413): en el celular, «S/» no queda sola al final de un renglón.
    expect(b.texto).toBe("El 3 de mayo de 2027 recibes un vale de S/\u00a020 si este año sumas 6 compras o S/\u00a0600. Llevas 2 compras y S/\u00a0150.50.");
    // La barra es lo que más le acerca: 2 de 6 compras (33 %) gana a S/ 150.50 de S/ 600 (25 %).
    expect(b.avance).toBeCloseTo(2 / 6);
    expect(beneficioAniversario(aniv({ compras: 0, monto: 0 }), false, HOY).texto).toMatch(/Todavía no tienes compras este año\.$/);
    expect(beneficioAniversario(aniv({ compras: 1, monto: 590 }), false, HOY).avance).toBeCloseTo(590 / 600);
  });

  it("el año ya cuenta: recibe su vale en su aniversario (y por WhatsApp solo si lo autorizó)", () => {
    const b = beneficioAniversario(aniv({ anioCuenta: true, compras: 6, monto: 300 }), true, HOY);
    expect(b.titulo).toBe("Vale por tu aniversario: S/\u00a020");
    expect(b.texto).toBe("Este año ya cuenta: el 3 de mayo de 2027 recibes tu vale y te avisamos por WhatsApp.");
    expect(b.avance).toBe(1);
  });

  it("canjeado: dice cuándo usó el de este aniversario y sigue con el próximo", () => {
    const b = beneficioAniversario(aniv({ estado: "canjeado", valeMonto: 30, valeCanjeadoEl: "2026-09-20", siguienteMonto: 40 }), false, HOY);
    expect(b.texto).toMatch(/^Usaste tu vale de S\/\u00a030 el 20 de septiembre\. El 3 de mayo de 2027 recibes un vale de S\/\u00a040/);
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
    const todo = JSON.stringify(MENSAJES_CLUB) + beneficioCumple(cumple({}), true, HOY).texto;
    expect(todo).not.toMatch(/clienta|socia|bienvenida|bienvenido/i);
  });
});
