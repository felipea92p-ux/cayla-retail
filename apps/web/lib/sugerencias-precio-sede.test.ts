import { describe, expect, it } from "vitest";
import { MOTIVO_NEUTRO, nombreCorto, sugerirMotivo } from "./sugerencias-precio-sede";

const SEDES = ["Tienda Arequipa", "Tienda Trujillo", "Tienda Lima"];
const MONTOS = ["", "0", "abc", "119.90", "129.90", "99"];

describe("el ejemplo de «Por qué» sigue la tienda y el precio", () => {
  it("es total: toda tienda y todo monto dan un texto que cabe a 375 px", () => {
    for (const sede of [...SEDES, null])
      for (const monto of MONTOS) {
        const s = sugerirMotivo({ sede, monto, general: 119.9 });
        expect(s.texto.length).toBeGreaterThan(0);
        expect(s.texto.length).toBeLessThanOrEqual(38);
      }
  });
  it("sin precio distinto del general, el neutro (no promete nada)", () => {
    for (const monto of ["", "0", "abc", "119.90"]) expect(sugerirMotivo({ sede: "Tienda Arequipa", monto, general: 119.9 }).texto).toBe(MOTIVO_NEUTRO);
    expect(sugerirMotivo({ sede: null, monto: "129.90", general: 119.9 }).origen).toBe("neutro");
    expect(sugerirMotivo({ sede: "Tienda Arequipa", monto: "129.90", general: null }).origen).toBe("neutro");
  });
  it("nombra la tienda elegida y el sentido del precio, sin contradecirse", () => {
    expect(sugerirMotivo({ sede: "Tienda Arequipa", monto: "129.90", general: 119.9 }).texto).toBe("Ej. En Arequipa se vende a más");
    expect(sugerirMotivo({ sede: "Tienda Arequipa", monto: "99", general: 119.9 }).texto).toBe("Ej. En Arequipa sale mejor a menos");
    for (const sede of SEDES) {
      const corto = nombreCorto(sede);
      expect(sugerirMotivo({ sede, monto: "129.90", general: 119.9 }).texto).toContain(corto);
      for (const otra of SEDES.filter((s) => s !== sede)) expect(sugerirMotivo({ sede, monto: "129.90", general: 119.9 }).texto).not.toContain(nombreCorto(otra));
    }
  });
  it("sigue al control: A → B → A da lo mismo que A", () => {
    const a = sugerirMotivo({ sede: "Tienda Arequipa", monto: "129.90", general: 119.9 });
    sugerirMotivo({ sede: "Tienda Lima", monto: "99", general: 119.9 });
    expect(sugerirMotivo({ sede: "Tienda Arequipa", monto: "129.90", general: 119.9 })).toEqual(a);
  });
});
