import { describe, expect, it } from "vitest";
import {
  ESPERA_PDF_MS,
  envioDeLaBoleta,
  mensajeDelComprobante,
  pdfUrlDeRespuesta,
  type EntradaEnvio,
} from "./comprobante-whatsapp-reglas";

const PDF = "https://lucode.example/pdf/B001-000123.pdf";
const BASE: EntradaEnvio = {
  celular: "987654321",
  comprobante: { tipo: "boleta", serie: "B001", numero: 123 },
  estado: "aceptado",
  entorno: "produccion",
  pdfUrl: PDF,
  esperadoMs: 0,
};

describe("el mensaje de un comprobante: uno solo para las tres pantallas", () => {
  it("dice qué es, su número de 6 dígitos y el enlace; sin nombre (el padrón trae el apellido primero)", () => {
    expect(mensajeDelComprobante({ tipo: "boleta", serie: "B001", numero: 123, pdfUrl: PDF })).toBe(
      `Hola, gracias por tu compra en CAYLA. Aquí está tu boleta B001-000123: ${PDF}`,
    );
  });

  it("una factura se llama factura, y el número ya con ceros no se vuelve a rellenar", () => {
    expect(mensajeDelComprobante({ tipo: "factura", serie: "F001", numero: "000045", pdfUrl: PDF })).toContain("tu factura F001-000045:");
  });
});

describe("pdfUrlDeRespuesta: solo un https entra a un mensaje", () => {
  it("acepta un https, recortado", () => {
    expect(pdfUrlDeRespuesta(`  ${PDF} `)).toBe(PDF);
  });

  it("descarta lo que no es un enlace seguro, un texto con espacios, o lo que no es texto", () => {
    expect(pdfUrlDeRespuesta("http://lucode.example/x.pdf")).toBeNull();
    expect(pdfUrlDeRespuesta("javascript:alert(1)")).toBeNull();
    expect(pdfUrlDeRespuesta("https://a.com/x y")).toBeNull();
    expect(pdfUrlDeRespuesta("")).toBeNull();
    expect(pdfUrlDeRespuesta(null)).toBeNull();
    expect(pdfUrlDeRespuesta({ pdfUrl: PDF })).toBeNull();
  });
});

describe("envioDeLaBoleta: qué se le ofrece a la cajera tras cobrar", () => {
  it("con celular, PDF y comprobante de producción: se puede mandar, al chat de ESE celular con el mensaje escrito", () => {
    const r = envioDeLaBoleta(BASE);
    expect(r.fase).toBe("listo");
    if (r.fase !== "listo") return;
    expect(r.celular).toBe("987 654 321");
    expect(r.href).toBe(`https://wa.me/51987654321?text=${encodeURIComponent(mensajeDelComprobante({ ...BASE.comprobante, pdfUrl: PDF }))}`);
  });

  it("acepta el celular con +51 o con espacios, como lo deja la ficha o la caja", () => {
    for (const celular of ["987 654 321", "+51 987 654 321", "51987654321"]) {
      const r = envioDeLaBoleta({ ...BASE, celular });
      expect(r.fase, celular).toBe("listo");
    }
  });

  it("sin celular, con uno que no se entiende, o en un documento que no es boleta ni factura, no se ofrece nada", () => {
    expect(envioDeLaBoleta({ ...BASE, celular: null })).toEqual({ fase: "nada" });
    expect(envioDeLaBoleta({ ...BASE, celular: "" })).toEqual({ fase: "nada" });
    expect(envioDeLaBoleta({ ...BASE, celular: "12345" })).toEqual({ fase: "nada" });
    expect(envioDeLaBoleta({ ...BASE, comprobante: { tipo: "nota_venta", serie: "NV01", numero: 7 }, estado: "interna", pdfUrl: null })).toEqual({ fase: "nada" });
    expect(envioDeLaBoleta({ ...BASE, comprobante: { tipo: "nota_credito", serie: "BC01", numero: 7 } })).toEqual({ fase: "nada" });
  });

  it("mientras Lucode no entrega el PDF se espera; pasados los 20 s se dice que se enviará desde Comprobantes (SUNAT caído no frena la venta)", () => {
    const sinPdf = { ...BASE, pdfUrl: null, estado: "pendiente" as const, entorno: null };
    expect(envioDeLaBoleta({ ...sinPdf, esperadoMs: 0 })).toEqual({ fase: "esperando", celular: "987 654 321" });
    expect(envioDeLaBoleta({ ...sinPdf, esperadoMs: ESPERA_PDF_MS - 1 }).fase).toBe("esperando");
    const tarde = envioDeLaBoleta({ ...sinPdf, esperadoMs: ESPERA_PDF_MS });
    expect(tarde.fase).toBe("sin_pdf");
    if (tarde.fase === "sin_pdf") expect(tarde.motivo).toMatch(/Comprobantes/);
  });

  it("un comprobante rechazado, anulado, no emitido o interno no espera: no habrá PDF (aunque traiga un enlace viejo)", () => {
    for (const estado of ["rechazado", "anulado", "no_emitido", "interna"] as const) {
      const r = envioDeLaBoleta({ ...BASE, estado, esperadoMs: 0 });
      expect(r.fase, estado).toBe("sin_pdf");
    }
    expect(envioDeLaBoleta({ ...BASE, estado: "rechazado", pdfUrl: null })).toMatchObject({ fase: "sin_pdf", motivo: expect.stringMatching(/SUNAT no la aceptó/) });
  });

  it("un PDF del sandbox (o de un entorno que no se conoce) NO se manda: la boleta de pruebas no vale ante SUNAT", () => {
    for (const entorno of ["sandbox", null] as const) {
      const r = envioDeLaBoleta({ ...BASE, entorno });
      expect(r.fase, String(entorno)).toBe("sin_pdf");
      if (r.fase === "sin_pdf") expect(r.motivo).toMatch(/pruebas/);
    }
  });

  it("una boleta ya enviada a SUNAT, con su PDF, se puede mandar sin esperar la aceptación", () => {
    expect(envioDeLaBoleta({ ...BASE, estado: "enviado" }).fase).toBe("listo");
  });
});
