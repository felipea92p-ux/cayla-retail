import { describe, expect, it } from "vitest";
import {
  AVISO_TEXTO_CAMBIO,
  ERROR_AL_GUARDAR,
  bajadaVigente,
  estadoInicial,
  etiquetaClub,
  mensajeDeEstado,
  puedeConfirmar,
  responsableDelTratamiento,
  resultadoConfirmacion,
  saludo,
  trasConfirmar,
  vistaDeInvitacion,
  type FilaInvitacionClub,
  type InvitacionVigente,
  type Trozo,
  type VistaSinFormulario,
} from "./club-pagina-reglas";

const plano = (trozos: readonly Trozo[]) => trozos.map((t) => (typeof t === "string" ? t : t.fuerte)).join("");

const FILA: FilaInvitacionClub = {
  estado: "vigente",
  nombre_corto: "Lucía",
  celular_enmascarado: "987 *** 321",
  codigo_club: "c-0142",
  texto:
    "Quiero recibir por WhatsApp de CAYLA novedades, rebajas y mi saludo de cumpleaños al {celular}. Sé que puedo darme de baja cuando quiera escribiendo BAJA.",
  texto_version: 1,
  tienda: "Tienda TRU",
  razon_social: "CAYLA S.A.C.",
  ruc: "20601234567",
};

const VIGENTE = vistaDeInvitacion(FILA) as InvitacionVigente;

describe("página pública del club (ADR-0288 act. c): qué ve ella según su enlace", () => {
  it("vigente: su nombre, su código legible, el texto con su celular a medias y la versión que acepta", () => {
    expect(VIGENTE).toEqual({
      estado: "vigente",
      nombreCorto: "Lucía",
      codigoClub: "C-0142",
      texto:
        "Quiero recibir por WhatsApp de CAYLA novedades, rebajas y mi saludo de cumpleaños al 987 *** 321. Sé que puedo darme de baja cuando quiera escribiendo BAJA.",
      textoVersion: 1,
      tienda: "Tienda TRU",
      razonSocial: "CAYLA S.A.C.",
      ruc: "20601234567",
    });
  });

  it("sin fila o con un estado desconocido: «no es válido»; vencida y usada, tal cual (usada con su tienda)", () => {
    expect(vistaDeInvitacion(null)).toEqual({ estado: "no_existe" });
    expect(vistaDeInvitacion(undefined)).toEqual({ estado: "no_existe" });
    expect(vistaDeInvitacion({ ...FILA, estado: "rarisimo" })).toEqual({ estado: "no_existe" });
    expect(vistaDeInvitacion({ ...FILA, estado: "no_existe" })).toEqual({ estado: "no_existe" });
    expect(vistaDeInvitacion({ ...FILA, estado: "vencida" })).toEqual({ estado: "vencida" });
    expect(vistaDeInvitacion({ ...FILA, estado: "usada" })).toEqual({ estado: "usada", tienda: "Tienda TRU" });
    expect(vistaDeInvitacion({ ...FILA, estado: "usada", tienda: null })).toEqual({ estado: "usada", tienda: null });
  });

  it("vigente sin texto o sin versión: no se acepta a ciegas («no disponible», nunca una casilla sin texto)", () => {
    expect(vistaDeInvitacion({ ...FILA, texto: null })).toEqual({ estado: "no_disponible" });
    expect(vistaDeInvitacion({ ...FILA, texto: "   " })).toEqual({ estado: "no_disponible" });
    expect(vistaDeInvitacion({ ...FILA, texto_version: null })).toEqual({ estado: "no_disponible" });
    expect(vistaDeInvitacion({ ...FILA, texto_version: 0 })).toEqual({ estado: "no_disponible" });
  });

  it("vigente con datos a medias: nada dice «null»", () => {
    const v = vistaDeInvitacion({ ...FILA, nombre_corto: " ", codigo_club: null, celular_enmascarado: null, tienda: null }) as InvitacionVigente;
    expect(saludo(v.nombreCorto)).toBe("Hola.");
    expect(etiquetaClub(v.tienda)).toBe("Club CAYLA");
    expect(plano(bajadaVigente(v.codigoClub))).toBe("Ya eres del Club CAYLA. Esto es aparte y es opcional: tú decides si quieres que la tienda te escriba.");
    expect(v.texto).toContain("al tu celular");
    expect(v.texto).not.toContain("null");
  });

  it("cabecera del formulario: rótulo con la tienda, saludo y su código en negrita", () => {
    expect(etiquetaClub("Tienda TRU")).toBe("Club CAYLA · Tienda TRU");
    expect(saludo("Lucía")).toBe("Hola, Lucía.");
    expect(bajadaVigente("C-0142")).toEqual([
      "Ya eres del Club CAYLA con el código ",
      { fuerte: "C-0142" },
      ". Esto es aparte y es opcional: tú decides si quieres que la tienda te escriba.",
    ]);
  });

  it("el responsable del tratamiento: razón social y RUC; sin ellos, CAYLA (nunca vacío)", () => {
    expect(responsableDelTratamiento("CAYLA S.A.C.", "20601234567")).toBe("CAYLA S.A.C. · RUC 20601234567 trata tus datos según la Ley 29733");
    expect(responsableDelTratamiento("CAYLA S.A.C.", null)).toBe("CAYLA S.A.C. trata tus datos según la Ley 29733");
    expect(responsableDelTratamiento(null, null)).toBe("CAYLA trata tus datos según la Ley 29733");
    expect(responsableDelTratamiento("  ", "20601234567")).toBe("CAYLA · RUC 20601234567 trata tus datos según la Ley 29733");
  });

  it("la casilla nace SIEMPRE sin marcar y «Confirmar» está apagado hasta que ella la marca", () => {
    for (const vista of [VIGENTE, { estado: "usada", tienda: null } as const, { estado: "vencida" } as const]) {
      expect(estadoInicial(vista)).toEqual({ vista, marcada: false, aviso: null, error: null });
    }
    expect(puedeConfirmar({ marcada: false, enviando: false })).toBe(false);
    expect(puedeConfirmar({ marcada: true, enviando: false })).toBe(true);
    // Mientras la base responde, no se confirma dos veces.
    expect(puedeConfirmar({ marcada: true, enviando: true })).toBe(false);
  });

  it("cada estado que no es el formulario tiene título y párrafo (textos de ADR-0288 act. c)", () => {
    const m = (v: VistaSinFormulario) => {
      const { titulo, parrafo } = mensajeDeEstado(v);
      return `${titulo} | ${plano(parrafo)}`;
    };
    expect(m({ estado: "usada", tienda: "Tienda TRU" })).toBe(
      "Ya lo confirmaste | Te escribiremos desde el WhatsApp de Tienda TRU. Para dejar de recibir mensajes, escribe BAJA a ese mismo WhatsApp cuando quieras.",
    );
    expect(m({ estado: "usada", tienda: null })).toContain("desde el WhatsApp de la tienda.");
    expect(m({ estado: "vencida" })).toBe("Este enlace venció | Pide otro en la tienda y lo escaneas otra vez.");
    expect(m({ estado: "no_existe" })).toMatch(/^Este enlace no es válido \| /);
    expect(m({ estado: "no_disponible" })).toMatch(/^No pudimos abrir esta página \| /);
    expect(m({ estado: "listo", nombreCorto: "Lucía", tienda: "Tienda TRU" })).toBe(
      "Listo, Lucía. | Ya estás en la lista de novedades de CAYLA. Para dejar de recibir mensajes, escribe BAJA al WhatsApp de Tienda TRU cuando quieras.",
    );
    expect(m({ estado: "listo", nombreCorto: null, tienda: null })).toMatch(/^Listo\. \| Ya estás en la lista de novedades de CAYLA\./);
    // BAJA va en negrita en los dos que la mencionan.
    expect(mensajeDeEstado({ estado: "listo", nombreCorto: null, tienda: null }).parrafo).toContainEqual({ fuerte: "BAJA" });
    expect(mensajeDeEstado({ estado: "usada", tienda: null }).parrafo).toContainEqual({ fuerte: "BAJA" });
  });

  it("respuesta de la base al confirmar: solo es «listo» si la base lo dice", () => {
    const r = (estado: string | null, hint: string | null = null, hayError = false) => resultadoConfirmacion({ estado, hint, hayError });
    expect(r("usada")).toBe("listo");
    expect(r("confirmada")).toBe("listo");
    expect(r("vencida")).toBe("vencida");
    expect(r("no_existe")).toBe("no_existe");
    expect(r(null, "club_texto_cambio", true)).toBe("texto_cambio");
    expect(r(null, null, true)).toBe("error");
    expect(r(null, "clienta_anonimizada", true)).toBe("error");
    expect(r(null)).toBe("error");
    expect(r("vigente")).toBe("error");
    expect(r("otra-cosa")).toBe("error");
  });

  it("tras confirmar: listo, vencida, texto nuevo sin marcar, o error con la casilla como estaba", () => {
    expect(trasConfirmar(VIGENTE, true, { resultado: "listo" })).toEqual({
      vista: { estado: "listo", nombreCorto: "Lucía", tienda: "Tienda TRU" },
      marcada: false,
      aviso: null,
      error: null,
    });
    expect(trasConfirmar(VIGENTE, true, { resultado: "vencida" }).vista).toEqual({ estado: "vencida" });
    expect(trasConfirmar(VIGENTE, true, { resultado: "no_existe" }).vista).toEqual({ estado: "no_existe" });

    // El texto cambió: se muestra el nuevo y la casilla vuelve a estar SIN marcar (aceptarlo es otro toque de ella).
    const nuevo: InvitacionVigente = { ...VIGENTE, texto: "Texto v2", textoVersion: 2 };
    expect(trasConfirmar(VIGENTE, true, { resultado: "texto_cambio", vista: nuevo })).toEqual({
      vista: nuevo,
      marcada: false,
      aviso: AVISO_TEXTO_CAMBIO,
      error: null,
    });
    // …y si al releer ya no está vigente, se muestra lo que haya.
    expect(trasConfirmar(VIGENTE, true, { resultado: "texto_cambio", vista: { estado: "usada", tienda: null } }).vista).toEqual({
      estado: "usada",
      tienda: null,
    });

    // Error: nada se pierde; la casilla sigue marcada para reintentar.
    expect(trasConfirmar(VIGENTE, true, { resultado: "error" })).toEqual({ vista: VIGENTE, marcada: true, aviso: null, error: ERROR_AL_GUARDAR });
    expect(ERROR_AL_GUARDAR).toBe("No se pudo guardar; inténtalo de nuevo.");
  });
});
