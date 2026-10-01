import { describe, expect, it } from "vitest";
import type { Parecido } from "../components/alta-producto/AvisoParecidos";
import type { CandidataAlta } from "./parecidas-alta-tipos";
import { rotuloDeTiempo } from "./parecidas-alta-reglas";
import { marcarRevisada } from "./parecidas-alta-vista";
import {
  CASI_IGUAL_FRENA_EN_BASE,
  PARECIDAS_INICIAL,
  armarParecidasDelAlta,
  marcaEfectiva,
  nombreReservado,
  ordenarParaAlta,
  reducirParecidas,
  textoVigente,
  TEXTO_ALTA,
  type BaseComprobada,
  type EntradaEstado,
  type EstadoParecidas,
  type SalidaEstado,
} from "./parecidas-alta-estado";

// ============================================================================
// El pegamento de «Prendas parecidas»: qué frena «Crear», qué se dibuja y qué se manda al crear. Sin red ni navegador.
// Las reglas son las REALES (`ordenarParecidas`): así la prueba comprueba también que «idéntico» y «una letra» dicen lo mismo que la base.
// Datos SINTÉTICOS con la forma de producción (nombres de la maqueta aprobada); ninguno es un registro real.
// ============================================================================

const AHORA = Date.parse("2026-09-30T15:00:00Z");
const rotuloTiempo = (iso: string) => rotuloDeTiempo(iso, AHORA) ?? "";

const M_JIRISH = "m-jirish";
const M_KRISS = "m-krisstell";
const M_FEMME = "m-femme";
const C_JEANS = "c-jeans";
const C_POLOS = "c-polos";
const C_CAMISAS = "c-camisas";

function cand(c: Partial<CandidataAlta> & Pick<CandidataAlta, "id" | "referencia">): CandidataAlta {
  return {
    categoriaId: C_JEANS,
    categoria: "Jeans",
    marcaId: M_JIRISH,
    marca: "Jirish",
    estado: "activo",
    descripcion: null,
    tejido: null,
    patron: null,
    temporada: null,
    creadoEn: "2026-09-30T14:00:00Z",
    fotoUrl: null,
    colores: [],
    tallas: [],
    disponible: { total: 2, porSede: [{ sede: "Tienda TRU", disponible: 2 }] },
    cargadaEn: null,
    ...c,
  };
}

const WIDE = cand({ id: "wide", referencia: "Wide Leg" });
const CORTO = cand({ id: "corto", referencia: "Wide Leg Corto Comfo" });
const POLO44 = cand({ id: "polo44", referencia: "Polo G44", marcaId: M_KRISS, marca: "Krisstell", categoriaId: C_POLOS, categoria: "Polos" });
const POLO55 = cand({ id: "polo55", referencia: "Polo G55", marcaId: M_KRISS, marca: "Krisstell", categoriaId: C_POLOS, categoria: "Polos" });
const LARA = cand({ id: "lara", referencia: "Camisa Lara", marcaId: M_FEMME, marca: "La Femme 21", categoriaId: C_CAMISAS, categoria: "Camisas y Blusas" });

// ---- lo que dice la base (lo mismo que devuelve `useParecidos`) ----
const parecido = (id: string, referencia: string, nivel: Parecido["nivel"], categoria = "Jeans"): Parecido => ({ id, referencia, categoria, nivel });
function baseCon(items: Parecido[], extra: Partial<BaseComprobada> = {}): BaseComprobada {
  return {
    items,
    fallo: false,
    comprobando: false,
    hayIdentico: items.some((p) => p.nivel === "identico"),
    hayUnaLetra: items.some((p) => p.nivel === "una_letra"),
    confirmo: false,
    ...extra,
  };
}
const BASE_VACIA = baseCon([]);

type Escena = {
  candidatas?: CandidataAlta[];
  marcaId?: string | null;
  marca?: string | null;
  categoriaId?: string | null;
  categoria?: string | null;
  nombre?: string;
  nombreVigente?: string;
  base?: BaseComprobada;
  cargando?: boolean;
  falloLectura?: boolean;
  enLinea?: boolean;
  activo?: boolean;
  atrasada?: boolean;
  revisadas?: string[];
  sinResultado?: boolean;
  frenaCasiIgual?: boolean;
};

/** Arma la entrada como lo haría el hook: las reglas reales con el nombre de la pausa, y la base con el nombre de ahora. */
function armar(e: Escena = {}): SalidaEstado {
  const marcaId = e.marcaId === undefined ? M_JIRISH : e.marcaId;
  const marca = e.marca === undefined ? "Jirish" : e.marca;
  const categoriaId = e.categoriaId === undefined ? C_JEANS : e.categoriaId;
  const categoria = e.categoria === undefined ? "Jeans" : e.categoria;
  const nombre = e.nombre ?? "";
  const nombreVigente = e.nombreVigente ?? nombre;
  const activo = e.activo ?? true;
  const enLinea = e.enLinea ?? true;
  const resultado =
    activo && enLinea && !e.sinResultado
      ? ordenarParaAlta({ candidatas: e.candidatas ?? [], marcaId, marca, categoriaId, categoria, nombre: nombreVigente, descripcion: "", tejido: null, patron: null, ahora: AHORA })
      : null;
  const entrada: EntradaEstado = {
    activo,
    enLinea,
    base: e.base ?? BASE_VACIA,
    cargando: e.cargando ?? false,
    falloLectura: e.falloLectura ?? false,
    resultado,
    marca,
    categoria,
    nombreVigente,
    atrasada: e.atrasada ?? nombreVigente !== nombre,
    revisadas: e.revisadas ?? [],
    rotuloTiempo,
  };
  return armarParecidasDelAlta(entrada, e.frenaCasiIgual);
}

/** El candado como lo arma el formulario: `nombreSinConfirmar = hayUnaLetra && !confirmo`. */
const sinConfirmar = (s: SalidaEstado) => s.hayUnaLetra && !s.confirmo;

// ============================================================================

describe("marcaEfectiva: «Importado» y sin marca son lo mismo (D5)", () => {
  it("sin marca, con el uuid nulo o sin nombre → sin marca", () => {
    expect(marcaEfectiva("", "")).toEqual({ id: null, nombre: null });
    expect(marcaEfectiva("00000000-0000-0000-0000-000000000000", "Cualquiera")).toEqual({ id: null, nombre: null });
    expect(marcaEfectiva("m-jirish", "")).toEqual({ id: null, nombre: null });
    expect(marcaEfectiva("m-jirish", "   ")).toEqual({ id: null, nombre: null });
  });
  it("«Importado» con tildes, mayúsculas o espacios distintos también", () => {
    for (const n of ["Importado", "IMPORTADO", "  importado ", "Impórtado"]) expect(marcaEfectiva("e0837025", n)).toEqual({ id: null, nombre: null });
  });
  it("una marca de verdad queda con su id y su nombre", () => {
    expect(marcaEfectiva(" m-jirish ", " Jirish ")).toEqual({ id: "m-jirish", nombre: "Jirish" });
  });
});

describe("textoVigente: la pausa solo afecta a lo que se teclea", () => {
  it("vaciar el campo es inmediato; escribir espera lo estable", () => {
    expect(textoVigente("", "Camisa Lara")).toBe("");
    expect(textoVigente("   ", "Camisa Lara")).toBe("");
    expect(textoVigente("Camisa Lar", "Camisa Lara")).toBe("Camisa Lara");
    expect(textoVigente("Camisa Lara", "Camisa Lara")).toBe("Camisa Lara");
  });
});

describe("1. sin categoría o sin red: todo inerte", () => {
  it("sin categoría (activo falso) no hay alerta, ni candado, ni respaldo", () => {
    const s = armar({ activo: false, categoriaId: null, categoria: null, nombre: "Camisa Lara" });
    expect(s.alerta).toBeNull();
    expect(s.avisoNombre).toBeNull();
    expect(s.nombreBloqueado).toBe(false);
    expect(sinConfirmar(s)).toBe(false);
    expect(s.confirmo).toBe(false);
    expect(s.respaldo).toEqual([]);
    expect(s.noSePudoComprobar).toBe(false);
    expect(s.pieRevisa).toBeNull();
    expect(s.resumenAvance).toBeNull();
    expect(s.motivoBloqueo).toBeNull();
  });

  it("11. sin red no hay alerta ni aviso, pero lo que la base ya dijo sigue frenando", () => {
    const base = baseCon([parecido("lara", "Camisa Lara", "identico", "Camisas y Blusas")]);
    const s = armar({ enLinea: false, candidatas: [LARA], base, nombre: "Camisa Lara" });
    expect(s.alerta).toBeNull();
    expect(s.avisoNombre).toBeNull();
    expect(s.nombreBloqueado).toBe(true); // el candado es de la base, con o sin lectura
    expect(s.respaldo.map((p) => p.id)).toEqual(["lara"]); // y sigue habiendo un lugar donde decirlo
  });

  it("11. si la comprobación falló (sin red), se dice y no se inventa «todo bien»", () => {
    const s = armar({ enLinea: false, nombre: "Camisa Lara", base: baseCon([], { fallo: true }) });
    expect(s.noSePudoComprobar).toBe(true);
    expect(s.nombreBloqueado).toBe(false);
    expect(s.alerta).toBeNull();
  });
});

describe("2. el idéntico: frena siempre y no se puede destrabar respondiendo", () => {
  const base = baseCon([parecido("lara", "Camisa Lara", "identico", "Camisas y Blusas")]);
  const escena: Escena = { marcaId: M_FEMME, marca: "La Femme 21", categoriaId: C_CAMISAS, categoria: "Camisas y Blusas", nombre: "Camisa Lara", candidatas: [LARA], base };

  it("frena, dibuja la alerta roja y el aviso bajo el nombre; no hay respaldo ni «Revisa»", () => {
    const s = armar(escena);
    expect(s.nombreBloqueado).toBe(true);
    expect(s.alerta?.tipo).toBe("identico");
    expect(s.alerta?.bloqueaCrear).toBe(true);
    expect(s.avisoNombre).not.toBeNull();
    expect(s.avisoNombre?.accion.tipo).toBe("comparar"); // es de su marca y categoría: tiene tarjeta en la hoja
    expect(s.respaldo).toEqual([]);
    expect(s.pieRevisa).toBeNull();
    expect(s.motivoBloqueo).toContain("Camisa Lara");
    expect(s.resumenAvance).toBe("Ese nombre ya existe: no se puede crear igual.");
  });

  it("responder «No, es otro diseño» a un idéntico no cambia nada (el reductor lo rechaza)", () => {
    const r = ordenarParaAlta({ candidatas: [LARA], marcaId: M_FEMME, marca: "La Femme 21", categoriaId: C_CAMISAS, categoria: "Camisas y Blusas", nombre: "Camisa Lara", descripcion: "", tejido: null, patron: null, ahora: AHORA });
    const tras = reducirParecidas(PARECIDAS_INICIAL, { tipo: "revisada", id: "lara", resultado: r });
    expect(tras).toBe(PARECIDAS_INICIAL);
    const s = armar({ ...escena, revisadas: ["lara"] }); // aunque llegara una respuesta a mano, sigue frenando
    expect(s.nombreBloqueado).toBe(true);
  });

  it("el idéntico de OTRA marca frena igual y lleva a su ficha (no tiene tarjeta en la hoja)", () => {
    const pilar = cand({ id: "wide-pilar", referencia: "Wide Leg", marcaId: "m-pilar", marca: "Pilar" });
    // Jirish todavía no tiene «Wide Leg» (solo la de Pilar): el idéntico es de otra marca.
    const s = armar({ candidatas: [CORTO, pilar], nombre: "Wide Leg", base: baseCon([parecido("wide-pilar", "Wide Leg", "identico")]) });
    expect(s.nombreBloqueado).toBe(true);
    expect(s.avisoNombre?.accion.tipo).toBe("ver_ficha");
  });
});

describe("3. el idéntico con la lectura cargando, caída o sin esa prenda: el candado no cambia y hay dónde decirlo", () => {
  const base = baseCon([parecido("lara", "Camisa Lara", "identico", "Camisas y Blusas")]);
  const escena: Escena = { marcaId: M_FEMME, marca: "La Femme 21", categoriaId: C_CAMISAS, categoria: "Camisas y Blusas", nombre: "Camisa Lara", base };

  it("cargando", () => {
    const s = armar({ ...escena, candidatas: [], cargando: true });
    expect(s.nombreBloqueado).toBe(true);
    expect(s.avisoNombre).toBeNull();
    expect(s.respaldo.map((p) => p.id)).toEqual(["lara"]);
  });
  it("la lectura falló", () => {
    const s = armar({ ...escena, candidatas: [], falloLectura: true });
    expect(s.nombreBloqueado).toBe(true);
    expect(s.respaldo.map((p) => p.id)).toEqual(["lara"]);
    expect(s.alerta?.tipo).toBe("fallo");
  });
  it("la lectura terminó pero no trajo esa prenda", () => {
    const s = armar({ ...escena, candidatas: [WIDE] });
    expect(s.nombreBloqueado).toBe(true);
    expect(s.avisoNombre).toBeNull();
    expect(s.respaldo.map((p) => p.id)).toEqual(["lara"]);
  });
  it("con la alerta atrasada (la pausa de 0,6 s corre) todavía no se muestra el respaldo: no parpadea", () => {
    const s = armar({ ...escena, candidatas: [], cargando: false, nombre: "Camisa Lara", nombreVigente: "Camisa Lar", atrasada: true });
    expect(s.nombreBloqueado).toBe(true);
    expect(s.respaldo).toEqual([]);
  });
});

describe("4. una letra de diferencia sin responder: «Crear» espera", () => {
  const base = baseCon([parecido("polo44", "Polo G44", "una_letra", "Polos")]);
  const escena: Escena = { marcaId: M_KRISS, marca: "Krisstell", categoriaId: C_POLOS, categoria: "Polos", nombre: "Polo G45", candidatas: [POLO44], base };

  it("la base marcó una letra y nadie respondió → hayUnaLetra y no confirmo", () => {
    const s = armar(escena);
    expect(CASI_IGUAL_FRENA_EN_BASE).toBe(true);
    expect(s.nombreBloqueado).toBe(false);
    expect(s.hayUnaLetra).toBe(true);
    expect(s.confirmo).toBe(false);
    expect(sinConfirmar(s)).toBe(true);
    expect(s.pendientes).toEqual(["polo44"]);
    expect(s.alerta?.tipo).toBe("casi_igual");
    expect(s.alerta?.bloqueaCrear).toBe(false); // la alerta avisa; el candado es de la base
    expect(s.pieRevisa).toBe("Revisa: 1 parecida");
    expect(s.motivoBloqueo).toBe("Se escribe casi igual que «Polo G44»: mírala en «Ver y comparar» y di si es otro diseño.");
    expect(s.resumenAvance).toBe("Se escribe casi igual: míralo");
    expect(s.respaldo).toEqual([]); // la pantalla nueva SÍ puede hablar de esa prenda
    expect(s.avisoNombre).toBeNull(); // el rojo bajo el nombre es solo del idéntico
    // El motivo también se dice junto al campo (ámbar, con «Ver y comparar»): «Nombre» está en «Faltan:» con el campo lleno y hay que saber por qué.
    expect(s.avisoUnaLetra).toEqual({ id: "polo44", texto: TEXTO_ALTA.unaLetraEspera("Polo G44") });
  });

  it("el aviso bajo el nombre se va al responder, y no sale mientras la alerta va atrasada ni cuando la pantalla nueva no puede hablar de esa prenda", () => {
    expect(armar({ ...escena, revisadas: ["polo44"] }).avisoUnaLetra).toBeNull();
    expect(armar({ ...escena, nombreVigente: "Polo G4" }).avisoUnaLetra).toBeNull(); // atrasada: la pausa de 0,6 s corre
    expect(armar({ ...escena, cargando: true }).avisoUnaLetra).toBeNull(); // lectura en curso: manda la casilla de siempre
    expect(armar({ ...escena, falloLectura: true }).avisoUnaLetra).toBeNull();
    expect(armar({ ...escena, candidatas: [] }).avisoUnaLetra).toBeNull(); // la lectura no trajo esa prenda
  });

  it("con un idéntico además de la «casi igual», el aviso bajo el nombre es solo el del idéntico (no salen dos a la vez)", () => {
    const g45 = cand({ id: "polo45", referencia: "Polo G45", marcaId: M_KRISS, marca: "Krisstell", categoriaId: C_POLOS, categoria: "Polos" });
    const dos = baseCon([parecido("polo45", "Polo G45", "identico", "Polos"), parecido("polo44", "Polo G44", "una_letra", "Polos")]);
    const s = armar({ ...escena, candidatas: [POLO44, g45], base: dos });
    expect(s.nombreBloqueado).toBe(true);
    expect(s.avisoNombre).not.toBeNull();
    expect(s.avisoUnaLetra).toBeNull();
  });

  it("con la lectura caída la alerta no promete «puedes seguir» si la base marcó algo que frena; sin nada que frene, sí", () => {
    const frena = armar({ ...escena, falloLectura: true });
    expect(frena.alerta?.tipo).toBe("fallo");
    expect(frena.alerta?.texto).toBe(TEXTO_ALTA.noPudeVerConAviso);
    expect(frena.alerta?.texto).not.toMatch(/puedes seguir/i);
    const libre = armar({ ...escena, falloLectura: true, base: BASE_VACIA, nombre: "Polo Nuevo" });
    expect(libre.alerta?.tipo).toBe("fallo");
    expect(libre.alerta?.texto).toMatch(/puedes seguir/i);
    // Ya respondida («No, es otro diseño»), «Crear» no espera y el texto vuelve a ser el de siempre.
    expect(armar({ ...escena, falloLectura: true, revisadas: ["polo44"] }).alerta?.texto).toMatch(/puedes seguir/i);
  });

  it("con «una letra» que solo avisa (`frenaCasiIgual` apagado) «Crear» no espera y `confirmo` sale en «sí»; sin una letra, la bandera no cambia nada", () => {
    const s = armar({ ...escena, frenaCasiIgual: false });
    expect(s.hayUnaLetra).toBe(false);
    expect(s.confirmo).toBe(true);
    expect(s.avisoUnaLetra).toBeNull();
    expect(s.motivoBloqueo).toBeNull();
    expect(s.alerta?.tipo).toBe("casi_igual");
    expect(armar({ marcaId: M_KRISS, marca: "Krisstell", categoriaId: C_POLOS, categoria: "Polos", nombre: "Polo Nuevo", candidatas: [POLO44], frenaCasiIgual: false }).confirmo).toBe(false);
  });

  it("5. respondida «No, es otro diseño» → confirmo (viaja como p_confirmo_distinto) y ya no espera", () => {
    const s = armar({ ...escena, revisadas: ["polo44"] });
    expect(s.hayUnaLetra).toBe(true);
    expect(s.confirmo).toBe(true);
    expect(sinConfirmar(s)).toBe(false);
    expect(s.pendientes).toEqual([]);
    expect(s.motivoBloqueo).toBeNull();
    expect(s.pieRevisa).toBeNull();
  });

  it("6. con dos a una letra sigue esperando hasta que estén las dos; «Ninguna es mi prenda» las marca todas", () => {
    const dos = baseCon([parecido("polo44", "Polo G44", "una_letra", "Polos"), parecido("polo55", "Polo G55", "una_letra", "Polos")]);
    const e2: Escena = { ...escena, candidatas: [POLO44, POLO55], base: dos };
    expect(sinConfirmar(armar(e2))).toBe(true);
    expect(sinConfirmar(armar({ ...e2, revisadas: ["polo44"] }))).toBe(true);
    expect(armar({ ...e2, revisadas: ["polo44"] }).pendientes).toEqual(["polo55"]);
    expect(sinConfirmar(armar({ ...e2, revisadas: ["polo44", "polo55"] }))).toBe(false);
    // «Ninguna es mi prenda»: los ids que la hoja entrega vienen de `armarHoja.idsNinguna` (todas las que frenan, nunca un idéntico).
    const tras = reducirParecidas(PARECIDAS_INICIAL, { tipo: "ninguna", ids: ["polo44", "polo55"] });
    expect(sinConfirmar(armar({ ...e2, revisadas: tras.revisadas }))).toBe(false);
  });

  it("12. una respuesta a una prenda que ya no está a una letra no cuenta para confirmar las que sí lo están", () => {
    const s = armar({ ...escena, revisadas: ["otra-cosa", "wide"] });
    expect(s.confirmo).toBe(false);
    expect(s.pendientes).toEqual(["polo44"]);
  });

  it("al cambiar el nombre, lo respondido se queda (son respuestas por prenda, no por texto)", () => {
    const s = armar({ ...escena, nombre: "Polo G 45", revisadas: ["polo44"] });
    expect(s.confirmo).toBe(true);
  });
});

describe("7. una letra que la pantalla nueva no puede decir: vuelve la casilla de siempre", () => {
  const base = baseCon([parecido("polo44", "Polo G44", "una_letra", "Polos")]);
  const escena: Escena = { marcaId: M_KRISS, marca: "Krisstell", categoriaId: C_POLOS, categoria: "Polos", nombre: "Polo G45", base };

  it("lectura cargando: respaldo con la prenda y confirmo = la casilla", () => {
    const sin = armar({ ...escena, candidatas: [], cargando: true });
    expect(sin.respaldo.map((p) => p.id)).toEqual(["polo44"]);
    expect(sin.confirmo).toBe(false);
    expect(sinConfirmar(sin)).toBe(true);
    const marcada = armar({ ...escena, candidatas: [], cargando: true, base: baseCon(base.items as Parecido[], { confirmo: true }) });
    expect(marcada.confirmo).toBe(true);
    expect(sinConfirmar(marcada)).toBe(false);
  });

  it("lo que lee el lector de pantalla no promete «Ver y comparar» cuando no hay hoja: manda a la casilla", () => {
    const base = baseCon([parecido("polo44", "Polo G44", "una_letra", "Polos")]);
    const escena: Escena = { marcaId: M_KRISS, marca: "Krisstell", categoriaId: C_POLOS, categoria: "Polos", nombre: "Polo G45", candidatas: [POLO44], base };
    expect(armar({ ...escena, falloLectura: true }).motivoBloqueo).toBe(TEXTO_ALTA.unaLetraCasilla("Polo G44"));
    expect(armar({ ...escena, cargando: true }).motivoBloqueo).toBe(TEXTO_ALTA.unaLetraCasilla("Polo G44"));
    expect(armar(escena).motivoBloqueo).toBe(TEXTO_ALTA.unaLetraEspera("Polo G44"));
    expect(TEXTO_ALTA.unaLetraCasilla("Polo G44")).not.toMatch(/ver y comparar/i);
  });

  it("lectura caída: lo mismo, y lo parecido que la base ya vio sigue a la vista", () => {
    const conParecido = baseCon([parecido("polo44", "Polo G44", "una_letra", "Polos"), parecido("x", "Polo Lara", "parecido", "Polos")]);
    const s = armar({ ...escena, candidatas: [], falloLectura: true, base: conParecido });
    expect(s.respaldo.map((p) => p.id)).toEqual(["polo44", "x"]);
    expect(s.alerta?.tipo).toBe("fallo");
    expect(s.confirmo).toBe(false);
  });

  it("la lectura terminó y no trajo esa prenda: casilla, y la casilla destraba", () => {
    const s = armar({ ...escena, candidatas: [POLO55], base: baseCon(base.items as Parecido[], { confirmo: true }) });
    expect(s.respaldo.map((p) => p.id)).toEqual(["polo44"]);
    expect(s.confirmo).toBe(true);
  });

  it("si la persona ya respondió esa prenda en la hoja, no pide casilla", () => {
    const s = armar({ ...escena, candidatas: [], cargando: true, revisadas: ["polo44"] });
    expect(s.respaldo).toEqual([]);
    expect(s.confirmo).toBe(true);
  });

  it("mezcla: una con tarjeta sin responder y otra sin tarjeta → no se confirma ni con la casilla", () => {
    const dos = baseCon([parecido("polo44", "Polo G44", "una_letra", "Polos"), parecido("fantasma", "Polo G46", "una_letra", "Polos")]);
    const s = armar({ ...escena, candidatas: [POLO44], base: { ...dos, confirmo: true } });
    expect(s.respaldo.map((p) => p.id)).toEqual(["fantasma"]);
    expect(s.confirmo).toBe(false); // POLO44 sigue pendiente en la hoja
    const respondida = armar({ ...escena, candidatas: [POLO44], base: { ...dos, confirmo: true }, revisadas: ["polo44"] });
    expect(respondida.confirmo).toBe(true);
  });

  it("con la alerta atrasada todavía no hay respaldo y «Crear» espera (no se abre por ir atrasada)", () => {
    const s = armar({ ...escena, candidatas: [], nombre: "Polo G45", nombreVigente: "Polo G4", atrasada: true });
    expect(s.respaldo).toEqual([]);
    expect(s.confirmo).toBe(false);
    expect(sinConfirmar(s)).toBe(true);
  });
});

describe("8. desfase: lo que dicen las reglas y la base no dice no frena nada", () => {
  it("una letra solo en las reglas (la base no la marcó): avisa pero no frena ni pide respuesta", () => {
    const s = armar({ marcaId: M_KRISS, marca: "Krisstell", categoriaId: C_POLOS, categoria: "Polos", nombre: "Polo G45", candidatas: [POLO44], base: BASE_VACIA });
    expect(s.alerta?.tipo).toBe("casi_igual");
    expect(s.hayUnaLetra).toBe(false);
    expect(sinConfirmar(s)).toBe(false);
    expect(s.nombreBloqueado).toBe(false);
    expect(s.motivoBloqueo).toBeNull();
    expect(s.pendientes).toEqual([]);
  });
  it("un idéntico solo en las reglas (la base no lo marcó): no frena", () => {
    const s = armar({ marcaId: M_FEMME, marca: "La Femme 21", categoriaId: C_CAMISAS, categoria: "Camisas y Blusas", nombre: "Camisa Lara", candidatas: [LARA], base: BASE_VACIA });
    expect(s.alerta?.tipo).toBe("identico");
    expect(s.nombreBloqueado).toBe(false);
    expect(s.motivoBloqueo).toBeNull();
  });
  it("mientras la base comprueba (items vacíos) no frena, y `comprobando` lo dice quien arma el candado", () => {
    const s = armar({ nombre: "Wide Leg Corto", candidatas: [WIDE, CORTO], base: baseCon([], { comprobando: true }) });
    expect(s.nombreBloqueado).toBe(false);
    expect(s.hayUnaLetra).toBe(false);
  });
});

describe("9. lo parecido y lo informativo nunca frenan, tenga o no marca", () => {
  it("con marca: «Wide Leg Corto» se parece a «Wide Leg Corto Comfo» y solo avisa", () => {
    const s = armar({ nombre: "Wide Leg Corto", candidatas: [WIDE, CORTO] });
    expect(s.alerta?.tipo).toBe("parecida");
    expect(s.alerta?.bloqueaCrear).toBe(false);
    expect(s.nombreBloqueado).toBe(false);
    expect(sinConfirmar(s)).toBe(false);
    expect(s.motivoBloqueo).toBeNull();
    expect(s.pieRevisa).toMatch(/^Revisa: \d+ parecidas?$/);
    expect(s.resumenAvance).toMatch(/^Hay \d+ parecidas?: míralas?$/);
  });
  it("solo la marca elegida: informativa, sin candado", () => {
    const s = armar({ nombre: "", candidatas: [WIDE, CORTO] });
    expect(s.alerta?.tipo).toBe("lista_de_marca");
    expect(s.nombreBloqueado).toBe(false);
    expect(sinConfirmar(s)).toBe(false);
    expect(s.pieRevisa).not.toBeNull();
  });
  it("sin marca y con nombre: la lista de la categoría (D5), sin candado", () => {
    const s = armar({ marcaId: null, marca: null, nombre: "Wide Leg Corto", candidatas: [WIDE, CORTO] });
    expect(s.alerta?.tipo).toBe("sin_marca");
    expect(s.nombreBloqueado).toBe(false);
    expect(sinConfirmar(s)).toBe(false);
    expect(s.pieRevisa).toBeNull();
  });
  it("todas revisadas: «Revisaste N ✓» y deja hablar a «Faltan: …» en Avance", () => {
    const s = armar({ candidatas: [WIDE, CORTO], revisadas: ["wide", "corto"] });
    expect(s.alerta?.tipo).toBe("revisadas");
    expect(s.pieRevisa).toBeNull();
    expect(s.resumenAvance).toBeNull();
  });
});

describe("10. sin marca y sin nombre no dice nada; «Importado» cuenta como sin marca", () => {
  it("sin marca y nombre vacío: alerta nula aunque la lectura de la categoría ya llegó", () => {
    const s = armar({ marcaId: null, marca: null, nombre: "", candidatas: [WIDE, CORTO] });
    expect(s.alerta).toBeNull();
    expect(s.pieRevisa).toBeNull();
  });
  it("sin marca y lectura cargando: nada todavía", () => {
    const s = armar({ marcaId: null, marca: null, nombre: "", candidatas: [], cargando: true });
    expect(s.alerta).toBeNull();
  });
  it("«Importado» se neutraliza antes de las reglas: cae a la categoría", () => {
    const m = marcaEfectiva("e0837025", "Importado");
    const s = armar({ marcaId: m.id, marca: m.nombre, nombre: "Wide Leg Corto", candidatas: [WIDE, CORTO] });
    expect(s.alerta?.tipo).toBe("sin_marca");
  });
});

describe("Hoy la base rechaza el idéntico aunque sea de otra marca (D1 es una fase posterior)", () => {
  it("el mismo nombre en otra marca frena y dice qué cambiar", () => {
    const pilar = cand({ id: "wide-pilar", referencia: "Wide Leg", marcaId: "m-pilar", marca: "Pilar" });
    const s = armar({ nombre: "Wide Leg", candidatas: [CORTO, pilar], base: baseCon([parecido("wide-pilar", "Wide Leg", "identico")]) });
    expect(s.alerta?.tipo).toBe("identico");
    expect(s.motivoBloqueo).toContain("agrégale el modelo o la marca");
  });
});

describe("13. reducirParecidas: la hoja y las respuestas", () => {
  const r = ordenarParaAlta({ candidatas: [WIDE, CORTO], marcaId: M_JIRISH, marca: "Jirish", categoriaId: C_JEANS, categoria: "Jeans", nombre: "Wide Leg Corto", descripcion: "", tejido: null, patron: null, ahora: AHORA });

  it("abrir (con y sin prenda, con alcance de marca) y cerrar", () => {
    const a = reducirParecidas(PARECIDAS_INICIAL, { tipo: "abrir" });
    expect(a.hoja).toEqual({ alcance: "lista", id: null });
    const b = reducirParecidas(a, { tipo: "abrir", id: "corto" });
    expect(b.hoja).toEqual({ alcance: "lista", id: "corto" });
    const c = reducirParecidas(b, { tipo: "abrir", alcance: "marca" });
    expect(c.hoja).toEqual({ alcance: "marca", id: null });
    expect(reducirParecidas(c, { tipo: "cerrar" }).hoja).toBeNull();
  });
  it("abrir lo mismo dos veces y cerrar lo ya cerrado no cambian el estado (React no redibuja)", () => {
    const a = reducirParecidas(PARECIDAS_INICIAL, { tipo: "abrir", id: "x" });
    expect(reducirParecidas(a, { tipo: "abrir", id: "x" })).toBe(a);
    expect(reducirParecidas(PARECIDAS_INICIAL, { tipo: "cerrar" })).toBe(PARECIDAS_INICIAL);
  });
  it("responder, repetir, deshacer y «ninguna»", () => {
    const a = reducirParecidas(PARECIDAS_INICIAL, { tipo: "revisada", id: "wide", resultado: r });
    expect(a.revisadas).toEqual(["wide"]);
    expect(reducirParecidas(a, { tipo: "revisada", id: "wide", resultado: r })).toBe(a);
    const b = reducirParecidas(a, { tipo: "ninguna", ids: ["wide", "corto"] });
    expect(b.revisadas).toEqual(["wide", "corto"]);
    expect(reducirParecidas(b, { tipo: "ninguna", ids: ["wide"] })).toBe(b);
    expect(reducirParecidas(b, { tipo: "ninguna", ids: [] })).toBe(b);
    const c = reducirParecidas(b, { tipo: "deshacer", id: "wide" });
    expect(c.revisadas).toEqual(["corto"]);
    expect(reducirParecidas(c, { tipo: "deshacer", id: "wide" })).toBe(c);
  });
  it("reiniciar («Crear otro parecido») limpia respuestas y hoja; sobre lo ya limpio no cambia nada", () => {
    const sucio: EstadoParecidas = { revisadas: ["a", "b"], hoja: { alcance: "marca", id: "x" } };
    expect(reducirParecidas(sucio, { tipo: "reiniciar" })).toEqual({ revisadas: [], hoja: null });
    expect(reducirParecidas(PARECIDAS_INICIAL, { tipo: "reiniciar" })).toBe(PARECIDAS_INICIAL);
  });
  it("una respuesta la valida `marcarRevisada` (nunca un idéntico)", () => {
    const pilar = cand({ id: "wide-pilar", referencia: "Wide Leg", marcaId: "m-pilar", marca: "Pilar" });
    const rr = ordenarParaAlta({ candidatas: [WIDE, pilar], marcaId: M_JIRISH, marca: "Jirish", categoriaId: C_JEANS, categoria: "Jeans", nombre: "Wide Leg", descripcion: "", tejido: null, patron: null, ahora: AHORA });
    expect(marcarRevisada([], "wide", rr)).toBeNull();
    expect(reducirParecidas(PARECIDAS_INICIAL, { tipo: "revisada", id: "wide", resultado: rr })).toBe(PARECIDAS_INICIAL);
  });
});

describe("15. cambiar nombre, marca o categoría no toca lo respondido (solo `reiniciar` lo borra)", () => {
  it("el reductor no sabe de nombre, marca ni categoría: lo respondido solo cambia con sus propias acciones", () => {
    const a = reducirParecidas(PARECIDAS_INICIAL, { tipo: "ninguna", ids: ["wide"] });
    // Las acciones que el hook despacha al cambiar marca/nombre/categoría: ninguna. Lo que sigue es lo único que puede vaciar.
    expect(a.revisadas).toEqual(["wide"]);
    expect(reducirParecidas(a, { tipo: "cerrar" }).revisadas).toEqual(["wide"]);
    expect(reducirParecidas(a, { tipo: "abrir" }).revisadas).toEqual(["wide"]);
    expect(reducirParecidas(a, { tipo: "reiniciar" }).revisadas).toEqual([]);
  });
});

describe("14. precio y costo: ninguna salida los lleva", () => {
  function llaves(valor: unknown, vistos = new Set<unknown>(), salida: string[] = []): string[] {
    if (valor === null || typeof valor !== "object" || vistos.has(valor)) return salida;
    vistos.add(valor);
    for (const [k, v] of Object.entries(valor)) {
      salida.push(k);
      llaves(v, vistos, salida);
    }
    return salida;
  }
  it("recorrida en profundidad, en los casos que más dibujan", () => {
    const casos: SalidaEstado[] = [
      armar({ nombre: "Wide Leg Corto", candidatas: [WIDE, CORTO] }),
      armar({ marcaId: M_KRISS, marca: "Krisstell", categoriaId: C_POLOS, categoria: "Polos", nombre: "Polo G45", candidatas: [POLO44], base: baseCon([parecido("polo44", "Polo G44", "una_letra", "Polos")]) }),
      armar({ marcaId: M_FEMME, marca: "La Femme 21", categoriaId: C_CAMISAS, categoria: "Camisas y Blusas", nombre: "Camisa Lara", candidatas: [LARA], base: baseCon([parecido("lara", "Camisa Lara", "identico", "Camisas y Blusas")]) }),
    ];
    for (const s of casos) {
      const texto = JSON.stringify(s);
      expect(llaves(s).filter((k) => /precio|costo|price|cost/i.test(k))).toEqual([]);
      expect(texto).not.toMatch(/S\/\s?\d/);
    }
  });
});

describe("nombreReservado: «Prenda sin Registrar» lo usa el sistema y la base no lo ve como «ya existe»", () => {
  it("reconoce el nombre aunque cambien mayúsculas, tildes, espacios o puntuación (la misma clave que el índice único)", () => {
    for (const n of ["Prenda sin Registrar", "prenda sin registrar", "PRENDA SIN REGISTRAR", "Prenda  sin  Registrar.", "Prenda-sin-Registrar", "Prenda sin Registrár"]) {
      expect(nombreReservado(n), n).toBe("Prenda sin Registrar");
    }
  });
  it("lo que tiene otra clave no se reserva (la base lo acepta): otro número, otra palabra, vacío o solo signos", () => {
    for (const n of ["Prenda sin Registrar 2", "Prenda Registrada", "Prenda", "Sin Registrar", "", "   ", "...", "✨"]) expect(nombreReservado(n), n).toBeNull();
  });
  it("su frase es de tienda, sin veredicto ni jerga, y nombra el nombre que se escribió", () => {
    const t = TEXTO_ALTA.nombreReservado("Prenda sin Registrar");
    expect(t).toContain("Prenda sin Registrar");
    expect(t.toLowerCase()).not.toMatch(/duplicad|umbral|coincidencia|la base|es la misma|son distintas/);
  });
});

describe("16. el texto de las prendas viaja sin inventar veredictos ni jerga", () => {
  it("lo que dice el candado no usa «duplicado», «umbral», «coincidencia» ni «la base»", () => {
    const s = armar({ marcaId: M_KRISS, marca: "Krisstell", categoriaId: C_POLOS, categoria: "Polos", nombre: "Polo G45", candidatas: [POLO44], base: baseCon([parecido("polo44", "Polo G44", "una_letra", "Polos")]) });
    const t = `${s.motivoBloqueo} ${s.pieRevisa} ${s.resumenAvance} ${s.avisoUnaLetra?.texto} ${TEXTO_ALTA.noPudeVerConAviso}`.toLowerCase();
    for (const prohibida of ["duplicado", "umbral", "coincidencia", "la base", "es la misma", "son distintas"]) expect(t).not.toContain(prohibida);
  });
});
