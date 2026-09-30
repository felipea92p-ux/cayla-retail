import { describe, expect, it } from "vitest";
import {
  ajustarCelular,
  celularValido,
  codigoClubLegible,
  codigoEnTexto,
  enlaceQrClub,
  estadoClub,
  mensajePersonal,
  textoVigente,
  enlacePaginaClub,
  estadoInvitacion,
  textoPaginaPublicidad,
  tokenValido,
  type TextoClub,
} from "./club-reglas";

describe("club de clientas (ADR-0288 tanda 1b): dos permisos, código y QR", () => {
  it("estado frente al club: la publicidad solo existe sobre una socia", () => {
    expect(estadoClub({ clubDesde: null, publicidadDesde: null })).toBe("no_socia");
    expect(estadoClub({ clubDesde: "2026-09-30", publicidadDesde: null })).toBe("socia");
    expect(estadoClub({ clubDesde: "2026-09-30", publicidadDesde: "2026-09-30" })).toBe("socia_con_publicidad");
  });

  it("el celular: 9 dígitos que empiezan en 9; se limpia al pegarlo con +51 y espacios", () => {
    expect(celularValido("987654321")).toBe(true);
    expect(celularValido("887654321")).toBe(false);
    expect(celularValido("98765432")).toBe(false);
    expect(celularValido(null)).toBe(false);
    expect(ajustarCelular("+51 987 654 321")).toBe("987654321");
    expect(ajustarCelular("987-654-3219")).toBe("987654321");
  });

  it("el texto vigente de cada tipo es su versión más alta; sin texto, null", () => {
    const textos: TextoClub[] = [
      { tipo: "club", version: 2, texto: "v2" },
      { tipo: "club", version: 3, texto: "v3" },
      { tipo: "mensaje_personal", version: 2, texto: "Hola (Club {codigo})" },
    ];
    expect(textoVigente(textos, "club")?.texto).toBe("v3");
    expect(textoVigente(textos, "mensaje_generico")).toBeNull();
  });

  it("el mensaje personal lleva su código de socia", () => {
    expect(mensajePersonal("Hola CAYLA. (Club {codigo})", "C-0142")).toBe("Hola CAYLA. (Club C-0142)");
  });

  it("el QR abre el WhatsApp DE LA TIENDA con el texto listo; sin número de tienda no hay QR", () => {
    expect(enlaceQrClub("987654321", "Hola CAYLA")).toBe("https://wa.me/51987654321?text=Hola%20CAYLA");
    expect(enlaceQrClub(null, "Hola")).toBeNull();
    expect(enlaceQrClub("12345", "Hola")).toBeNull();
  });

  it("el código de socia se reconoce en lo que llega por WhatsApp, escrito como sea", () => {
    expect(codigoEnTexto("Hola CAYLA, quiero recibir novedades. (Club C-0142)")).toBe("C-0142");
    expect(codigoEnTexto("club c-142")).toBe("C-0142");
    expect(codigoEnTexto("C0142")).toBe("C-0142");
    expect(codigoEnTexto("quiero unirme al club")).toBeNull();
    expect(codigoClubLegible("c-0142")).toBe("C-0142");
  });
});

describe("camino B (ADR-0288 act. c): la página pública donde ella confirma", () => {
  it("el enlace de la página vive en el mismo dominio del ERP", () => {
    expect(enlacePaginaClub("https://retail.cayla.pe/", "Ab3_x-9QzLm2Pq7R")).toBe("https://retail.cayla.pe/club/Ab3_x-9QzLm2Pq7R");
  });
  it("un estado desconocido es «no existe»", () => {
    expect(estadoInvitacion("vigente")).toBe("vigente");
    expect(estadoInvitacion("usada")).toBe("usada");
    expect(estadoInvitacion("otra cosa")).toBe("no_existe");
    expect(estadoInvitacion(null)).toBe("no_existe");
  });
  it("el texto lleva su celular a medias", () => {
    expect(textoPaginaPublicidad("Quiero recibir al {celular}.", "98•••333")).toBe("Quiero recibir al 98•••333.");
  });
  it("solo un token de 16 caracteres seguros llega a la base", () => {
    expect(tokenValido("Ab3_x-9QzLm2Pq7R")).toBe(true);
    expect(tokenValido("corto")).toBe(false);
    expect(tokenValido("Ab3_x-9QzLm2Pq7R'; drop")).toBe(false);
  });
});

