import { describe, expect, it } from "vitest";
import { sistemaDelEquipo } from "./guia-impresion-reglas";

const CHROME_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("sistemaDelEquipo", () => {
  it("reconoce la computadora de la tienda (Windows) y la Mac", () => {
    expect(sistemaDelEquipo(CHROME_WINDOWS, "Win32")).toBe("windows");
    expect(sistemaDelEquipo(CHROME_MAC, "MacIntel")).toBe("mac");
  });

  it("basta con uno de los dos datos", () => {
    expect(sistemaDelEquipo(CHROME_MAC)).toBe("mac");
    expect(sistemaDelEquipo("", "MacIntel")).toBe("mac");
  });

  it("un iPad dice «like Mac OS X» pero no abre la pestaña de Mac", () => {
    expect(sistemaDelEquipo(IPAD, "iPad")).toBe("windows");
  });

  it("sin datos (servidor, primer pintado) cae en Windows, lo que tienen las sedes", () => {
    expect(sistemaDelEquipo(undefined)).toBe("windows");
    expect(sistemaDelEquipo(null, null)).toBe("windows");
  });
});
