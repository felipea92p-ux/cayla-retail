import { describe, expect, it } from "vitest";
import { claveDeCookieDeAviso, cookiesDeTallasSobrantes } from "./inicio-aviso";

const USUARIO = "777246e6-6ecd-401a-b1ac-15ac112158b5";
const TALLA_ACTIVA = "llego-777246e6-11111111-2222-3333-4444-555555555555";
const TALLA_AGOTADA = "llego-777246e6-66666666-2222-3333-4444-555555555555";
const TALLA_DE_OTRA = "llego-abcdef12-11111111-2222-3333-4444-555555555555";
const RESPUESTA = "respuesta-777246e6-77777777-2222-3333-4444-555555555555";

describe("las cookies de avisos que ya no están a favor de la cuenta", () => {
  it("reconoce la clave de las tres cookies que trata una persona: leído, visto en el panel y borrado", () => {
    expect(claveDeCookieDeAviso(`tienda-aviso-${TALLA_ACTIVA}`)).toBe(TALLA_ACTIVA);
    expect(claveDeCookieDeAviso(`tienda-panel-visto-${TALLA_ACTIVA}`)).toBe(TALLA_ACTIVA);
    expect(claveDeCookieDeAviso(`tienda-borrado-${TALLA_ACTIVA}`)).toBe(TALLA_ACTIVA);
    expect(claveDeCookieDeAviso("otra-cookie")).toBeNull();
    expect(claveDeCookieDeAviso("tienda-borrado-no-es-clave")).toBeNull();
  });

  it("quita solo las cookies de TALLAS de esta cuenta que ya no están a favor", () => {
    const nombres = [
      `tienda-borrado-${TALLA_ACTIVA}`,
      `tienda-aviso-${TALLA_AGOTADA}`,
      `tienda-panel-visto-${TALLA_AGOTADA}`,
      `tienda-borrado-${TALLA_DE_OTRA}`,
      `tienda-borrado-${RESPUESTA}`,
      "otra-cookie",
    ];
    // La talla activa sigue a favor; la agotada ya no; la de otra persona y la respuesta no se tocan.
    expect(cookiesDeTallasSobrantes(nombres, [TALLA_ACTIVA], USUARIO)).toEqual([
      `tienda-aviso-${TALLA_AGOTADA}`,
      `tienda-panel-visto-${TALLA_AGOTADA}`,
    ]);
  });

  it("sin tallas a favor, quita todas las de la cuenta, pero nunca las respuestas", () => {
    const nombres = [`tienda-borrado-${TALLA_ACTIVA}`, `tienda-borrado-${RESPUESTA}`];
    expect(cookiesDeTallasSobrantes(nombres, [], USUARIO)).toEqual([`tienda-borrado-${TALLA_ACTIVA}`]);
  });
});
