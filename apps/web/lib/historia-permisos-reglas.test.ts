import { describe, expect, it } from "vitest";
import { MEDIO_LEGIBLE, eventoLegible, type FilaPermiso } from "./historia-permisos-reglas";

const fecha = (iso: string) => iso.slice(0, 10);
const BASE: FilaPermiso = {
  id: "e1",
  finalidad: "club",
  accion: "otorga",
  medio: "caja_palabra",
  texto_tipo: "club",
  texto_version: 2,
  sede: "Tienda Lima",
  registrado_por: "Micaela R.",
  nota: null,
  created_at: "2026-09-30T15:00:00+00:00",
  de_otra_ficha: false,
};
const ev = (c: Partial<FilaPermiso>) => eventoLegible({ ...BASE, ...c }, fecha);

describe("historia del permiso (CL-26)", () => {
  it("el «sí» al club: qué, cuándo, cómo, dónde, quién y el texto (como el spike)", () => {
    expect(ev({})).toEqual({
      id: "e1",
      titulo: "Se unió al club",
      detalle: "2026-09-30 · de palabra, en caja · Tienda Lima · Micaela R. · texto v2",
      punto: "taupe",
      deOtraFicha: false,
    });
  });

  it("la publicidad: la pide ella (verde); la BAJA o el cambio de celular se la quitan (ámbar)", () => {
    expect(ev({ finalidad: "publicidad_whatsapp", medio: "qr_web", registrado_por: "ella misma", texto_tipo: "pagina_publicidad", texto_version: 1 })).toMatchObject({
      titulo: "Pidió la publicidad por WhatsApp",
      detalle: "2026-09-30 · desde la página de su QR · Tienda Lima · ella misma · texto v1",
      punto: "verde",
    });
    expect(ev({ finalidad: "publicidad_whatsapp", accion: "revoca", medio: "baja_whatsapp", texto_tipo: null, texto_version: null })).toMatchObject({
      titulo: "Pidió BAJA de la publicidad",
      detalle: "2026-09-30 · escribió BAJA · Tienda Lima · Micaela R.",
      punto: "ambar",
    });
    expect(ev({ finalidad: "publicidad_whatsapp", accion: "revoca", medio: "cambio_celular", texto_tipo: null, texto_version: null }).titulo).toBe(
      "Dejó la publicidad al cambiar de celular",
    );
  });

  it("una miembro que vuelve a aceptar textos nuevos no «se une» otra vez (20261003235000)", () => {
    expect(ev({ medio: "pagina_cartel", registrado_por: null, texto_tipo: "terminos", texto_version: 3, nota: "volvió a aceptar los textos nuevos · privacidad v2" })).toMatchObject({
      titulo: "Volvió a aceptar los textos del club",
      punto: "taupe",
    });
    expect(
      ev({ finalidad: "publicidad_whatsapp", medio: "pagina_cartel", registrado_por: null, texto_tipo: "casilla_publicidad", texto_version: 3, nota: "volvió a aceptar el texto nuevo" }),
    ).toMatchObject({ titulo: "Volvió a aceptar el texto de la publicidad", punto: "verde" });
    // La unión de verdad, con su nota de siempre, y una revocación aunque su nota diga lo mismo, no cambian.
    expect(ev({ medio: "pagina_cartel", registrado_por: null, nota: "aceptó también la privacidad v2" }).titulo).toBe("Se unió al club");
    expect(ev({ accion: "revoca", medio: "anonimizar", nota: "volvió a aceptar" }).titulo).toBe("Salió del club");
  });

  it("anonimizar y el legado; los eventos de otra ficha lo dicen", () => {
    expect(ev({ accion: "revoca", medio: "anonimizar", texto_tipo: null, texto_version: null }).titulo).toBe("Salió del club");
    expect(ev({ medio: "legado", registrado_por: null, sede: null, texto_tipo: null, texto_version: null }).detalle).toBe("2026-09-30 · marcado en caja antes del club");
    expect(ev({ de_otra_ficha: true })).toMatchObject({ deOtraFicha: true, detalle: expect.stringContaining("de una ficha que se unió a esta") });
  });

  it("todos los medios del esquema tienen palabras; uno desconocido se dice tal cual (nunca se esconde)", () => {
    for (const m of ["caja_palabra", "ficha", "whatsapp_propio", "baja_whatsapp", "cambio_celular", "anonimizar", "legado", "qr_web", "pagina_cartel"]) {
      expect(MEDIO_LEGIBLE[m]).toBeTruthy();
    }
    expect(ev({ medio: "bot" }).detalle).toContain("bot");
  });
});
