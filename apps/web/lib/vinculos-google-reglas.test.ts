import { describe, expect, it } from "vitest";
import {
  correoAMedias,
  enlaceDelAviso,
  leerVinculos,
  ordenarVinculos,
  problemaParaAvisar,
  textoDelAviso,
  type FilaVinculoGoogle,
  type VinculoGoogle,
} from "./vinculos-google-reglas";

const FILA: FilaVinculoGoogle = {
  id: "11111111-1111-4111-8111-111111111111",
  clienta_id: "22222222-2222-4222-8222-222222222222",
  nombre: "ANA LUCÍA PRUEBA VEGA",
  telefono: "987100001",
  nombre_google: "Ana Prueba",
  correo: "ana.prueba@gmail.com",
  creado_en: "2026-10-21T15:00:00Z",
  aviso_estado: "pendiente",
  avisado_en: null,
};

describe("leer las filas de la base", () => {
  it("una fila buena queda lista para pintar", () => {
    expect(leerVinculos([FILA])).toEqual([
      {
        id: FILA.id,
        clientaId: FILA.clienta_id,
        nombre: "ANA LUCÍA PRUEBA VEGA",
        telefono: "987100001",
        nombreGoogle: "Ana Prueba",
        correo: "ana.prueba@gmail.com",
        creadoEn: FILA.creado_en,
        aviso: "pendiente",
        avisadoEn: null,
      },
    ]);
  });

  it("una fila rota, de un estado que esta web no conoce o repetida se ignora", () => {
    expect(leerVinculos([{ ...FILA, aviso_estado: "otro" }])).toEqual([]);
    expect(leerVinculos([{ ...FILA, correo: null }])).toEqual([]);
    expect(leerVinculos([{ ...FILA, id: "" }])).toEqual([]);
    expect(leerVinculos([FILA, FILA])).toHaveLength(1);
  });

  it("sin nombre ni celular no se cae: «Miembro sin nombre» y sin celular", () => {
    const [v] = leerVinculos([{ ...FILA, nombre: null, telefono: null, nombre_google: null }]);
    expect(v).toMatchObject({ nombre: "Miembro sin nombre", telefono: null, nombreGoogle: "—" });
  });
});

describe("el mensaje a la dueña de la ficha", () => {
  const v = { nombre: "ANA LUCÍA PRUEBA VEGA", correo: "ana.prueba@gmail.com" };

  it("la saluda por su primer nombre, dice de qué tienda viene y qué hacer", () => {
    const texto = textoDelAviso(v, "Tienda Lima");
    expect(texto).toContain("Hola Ana, te escribimos de CAYLA (Tienda Lima).");
    expect(texto).toContain("Si fuiste tú, no tienes que hacer nada.");
    expect(texto).toContain("Si no fuiste tú, respóndenos");
  });

  it("no lleva el correo completo ni datos de más, y no es publicidad (no dice «BAJA»)", () => {
    const texto = textoDelAviso(v, "Tienda Lima");
    expect(texto).toContain("an••••@gmail.com");
    expect(texto).not.toContain("ana.prueba");
    expect(texto).not.toMatch(/BAJA/);
  });

  it("sin nombre, saluda igual", () => {
    expect(textoDelAviso({ nombre: "", correo: "a@b.co" }, "Lima")).toMatch(/^Hola, te escribimos/);
  });

  it("el correo a medias deja ver dos letras y el dominio", () => {
    expect(correoAMedias("pedro@correo.pe")).toBe("pe••••@correo.pe");
    expect(correoAMedias("sin-arroba")).toBe("••••");
  });
});

describe("el enlace de WhatsApp y si se puede mandar", () => {
  it("abre el chat de la dueña con el texto escrito", () => {
    const enlace = enlaceDelAviso({ telefono: "987100001" }, "Hola & chau");
    expect(enlace).toBe("https://web.whatsapp.com/send?phone=51987100001&text=Hola%20%26%20chau");
  });

  it("un celular que no se entiende no se adivina", () => {
    expect(enlaceDelAviso({ telefono: "12345" }, "x")).toBeNull();
    expect(enlaceDelAviso({ telefono: null }, "x")).toBeNull();
  });

  it("dice por qué no se puede avisar", () => {
    expect(problemaParaAvisar({ telefono: "987100001", aviso: "pendiente" })).toBeNull();
    expect(problemaParaAvisar({ telefono: null, aviso: "sin_celular" })).toMatch(/celular/);
    expect(problemaParaAvisar({ telefono: "987100001", aviso: "enviado" })).toBe("Ya se le avisó.");
  });
});

describe("el orden de la lista", () => {
  const base: VinculoGoogle = {
    id: "a",
    clientaId: "c",
    nombre: "N",
    telefono: null,
    nombreGoogle: "G",
    correo: "a@b.co",
    creadoEn: "2026-10-20T10:00:00Z",
    aviso: "pendiente",
    avisadoEn: null,
  };

  it("los que faltan avisar van primero, y dentro de cada grupo el más reciente arriba", () => {
    const orden = ordenarVinculos([
      { ...base, id: "enviado-nuevo", aviso: "enviado", creadoEn: "2026-10-21T10:00:00Z" },
      { ...base, id: "pendiente-viejo", creadoEn: "2026-10-19T10:00:00Z" },
      { ...base, id: "pendiente-nuevo", creadoEn: "2026-10-21T09:00:00Z" },
      { ...base, id: "sin-celular", aviso: "sin_celular", creadoEn: "2026-10-20T10:00:00Z" },
    ]).map((x) => x.id);
    expect(orden).toEqual(["pendiente-nuevo", "sin-celular", "pendiente-viejo", "enviado-nuevo"]);
  });
});
