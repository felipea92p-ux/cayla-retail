import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FORMAS_DE_PAGO } from "./gasto-fijo-ficha-reglas";
import { formasParaElegir, pideVence, sugerirFicha, SUGERENCIA_NEUTRA, SUGERENCIAS_POR_CATEGORIA, type SugerenciaFicha } from "./sugerencias-gasto-fijo";

// Las categorías que trae el sistema desde el principio, tal como las siembra la migración (la fuente real de los códigos).
const SEMILLA = readFileSync(join(__dirname, "../../../supabase/migrations/20260924235000_finanzas_plan_de_cuentas_y_categorias_gasto.sql"), "utf8");
const CODIGOS = [...(SEMILLA.split("insert into retail.categorias_gasto")[1] ?? "").matchAll(/^\s*\('([a-z_]+)',\s+'/gm)].map((m) => m[1]);

// Las categorías que crea la migración de Luz, Agua, Internet, Telefonía y Software (ADR-0477): sus códigos salen del archivo, no de memoria.
const MIGRACION_SERVICIOS = readFileSync(join(__dirname, "../../../supabase/migrations/20261022205000_categorias_gasto_luz_agua_internet_telefonia.sql"), "utf8");
const CODIGOS_NUEVOS = [...(MIGRACION_SERVICIOS.split("insert into retail.categorias_gasto")[1] ?? "").split(/on conflict/i)[0].matchAll(/^\s*\('([a-z_]+)',\s+'/gm)].map((m) => m[1]);
const TODOS_LOS_CODIGOS = [...CODIGOS, ...CODIGOS_NUEVOS];

/** Todo lo que la ficha le dice a la persona en una categoría, junto, para buscar en ello. */
const textosDe = (s: SugerenciaFicha): string =>
  [s.tituloBeneficiario, s.beneficiario, s.codigo, s.recibo, s.tituloCodigo, s.ayudaCodigo, s.tituloRecibo, s.vence?.titulo ?? "", s.vence?.ayuda ?? ""].join(" | ");

const TODAS: SugerenciaFicha[] = [SUGERENCIA_NEUTRA, ...Object.values(SUGERENCIAS_POR_CATEGORIA)];

describe("los ejemplos de la ficha siguen a la categoría (ADR-0290)", () => {
  it("la siembra trae las 10 categorías de siempre", () => {
    expect(CODIGOS).toHaveLength(10);
  });
  it("totalidad: toda categoría del sistema (las de siempre y las que crea la migración de servicios) tiene su ejemplo propio, completo y distinto del neutro", () => {
    for (const c of TODOS_LOS_CODIGOS) {
      const s = SUGERENCIAS_POR_CATEGORIA[c];
      expect(s, c).toBeDefined();
      expect(s.beneficiario.trim(), c).not.toBe("");
      expect(s.codigo.trim(), c).not.toBe("");
      expect(s.recibo.trim(), c).not.toBe("");
      expect(s.beneficiario, c).not.toBe(SUGERENCIA_NEUTRA.beneficiario);
    }
    expect(Object.keys(SUGERENCIAS_POR_CATEGORIA).sort()).toEqual([...TODOS_LOS_CODIGOS].sort());
  });
  it("sin contradicción: el alquiler no habla de luz ni la luz de contratos de local", () => {
    expect(sugerirFicha("alquileres").beneficiario).toMatch(/propietario/i);
    expect(sugerirFicha("alquileres").codigo).not.toMatch(/suministro|póliza/i);
    expect(sugerirFicha("luz").codigo).toMatch(/suministro/i);
    expect(sugerirFicha("seguros").tituloCodigo).toMatch(/póliza/i);
    expect(sugerirFicha("alquileres").tituloCodigo).not.toMatch(/suministro|póliza/i);
    expect(sugerirFicha("servicios_basicos").beneficiario).not.toMatch(/propietario/i);
  });
  it("sin categoría, o con una que un líder creó después, el ejemplo es el neutro (nunca el de otra)", () => {
    expect(sugerirFicha("")).toEqual(SUGERENCIA_NEUTRA);
    expect(sugerirFicha("atencion_al_personal")).toEqual(SUGERENCIA_NEUTRA);
    expect(sugerirFicha("categoria_nueva_de_un_lider")).toEqual(SUGERENCIA_NEUTRA);
  });
  it("sigue al control y es estable: A → B → A da lo mismo, sin azar", () => {
    const a1 = sugerirFicha("alquileres");
    sugerirFicha("seguros");
    expect(sugerirFicha("alquileres")).toEqual(a1);
  });
  it("cabe a 375 px: ningún ejemplo pasa de 48 letras (un placeholder largo se corta a media palabra)", () => {
    for (const s of TODAS) {
      for (const t of [s.beneficiario, s.codigo, s.recibo]) expect(t.length, t).toBeLessThanOrEqual(48);
    }
  });
});

describe("los títulos, las ayudas y los campos de la ficha siguen a la categoría (ADR-0452, act. 2026-10-22)", () => {
  it("totalidad: toda categoría trae título de cada caja, y un título es corto y no repite al ejemplo en gris", () => {
    for (const c of TODOS_LOS_CODIGOS) {
      const s = SUGERENCIAS_POR_CATEGORIA[c];
      for (const t of [s.tituloBeneficiario, s.tituloCodigo, s.tituloRecibo, s.vence?.titulo ?? "x"]) {
        expect(t.trim(), c).not.toBe("");
        expect(t.length, `${c}: «${t}» no cabe en una línea a 375 px`).toBeLessThanOrEqual(40);
      }
      expect(s.ayudaCodigo.trim(), c).not.toBe("");
      expect(s.ayudaCodigo.length, c).toBeLessThanOrEqual(120);
      if (s.vence?.ayuda) expect(s.vence.ayuda.length, c).toBeLessThanOrEqual(130);
      expect(s.tituloBeneficiario, c).not.toBe(s.beneficiario);
      expect(s.tituloCodigo, c).not.toBe(s.codigo);
      expect(s.tituloRecibo, c).not.toBe(s.recibo);
    }
  });

  it("un alquiler no tiene «recibo» ni «servicio»: pide el contrato, y su vencimiento va primero", () => {
    const a = sugerirFicha("alquileres");
    expect(a.tituloBeneficiario).toBe("Propietario");
    expect(a.tituloCodigo).toBe("N.º de contrato");
    expect(a.tituloCodigo).not.toMatch(/servicio/i);
    expect(a.ayudaCodigo).not.toMatch(/recibo|suministro|cliente/i);
    expect(a.tituloRecibo).toMatch(/avisa que toca pagar/i);
    expect(a.tituloRecibo).not.toMatch(/recibo/i);
    expect(a.vence?.titulo).toBe("Vence el contrato");
    expect(a.vencePrimero).toBe(true);
    expect(a.formasOcultas).toEqual(["recibo"]);
  });

  it("la luz y el agua piden el N.º de suministro, dicen dónde sale en el recibo y no piden fecha de vencimiento", () => {
    for (const c of ["luz", "agua"]) {
      const s = sugerirFicha(c);
      expect(s.tituloCodigo, c).toBe("N.º de suministro");
      expect(s.codigo, c).toMatch(/suministro/i);
      expect(s.ayudaCodigo, c).toMatch(/recibo/i);
      expect(s.ayudaCodigo, c).toMatch(/suministro/i);
      expect(s.vence, c).toBeNull();
      expect(pideVence(s, ""), c).toBe(false);
      expect(s.vencePrimero, c).toBe(false);
      expect(s.formasOcultas, c).toEqual([]);
    }
    expect(sugerirFicha("luz").tituloBeneficiario).toMatch(/luz/i);
    expect(sugerirFicha("agua").tituloBeneficiario).toMatch(/agua/i);
  });

  it("el internet pide el cliente o contrato, y el celular, el número de la línea; los dos con la fecha solo si el plan tiene permanencia", () => {
    const i = sugerirFicha("internet");
    expect(i.tituloCodigo).toBe("N.º de cliente o de contrato");
    expect(i.tituloBeneficiario).toMatch(/internet/i);
    const t = sugerirFicha("telefonia");
    expect(t.tituloCodigo).toBe("Número de la línea");
    expect(t.ayudaCodigo).toMatch(/celular|plan/i);
    for (const s of [i, t]) {
      expect(s.vence?.titulo).toBe("Vence el contrato");
      expect(s.vence?.ayuda).toMatch(/permanencia/i);
      expect(s.vencePrimero).toBe(false);
      expect(pideVence(s, "")).toBe(true);
    }
  });

  it("«Servicios básicos» (servicios_basicos) ya no promete luz, agua, internet ni teléfono: es el baño, el gas y la vigilancia", () => {
    const o = sugerirFicha("servicios_basicos");
    expect(textosDe(o)).not.toMatch(/\bluz\b|\bagua\b|internet|tel[eé]fono|celular|suministro|l[ií]nea/i);
    expect(o.beneficiario).toMatch(/gas|vigilancia|baño/i);
    expect(o.tituloBeneficiario).toBe("Empresa o persona");
    expect(o.tituloRecibo).toBe("Cómo llega el cobro");
    expect(pideVence(o, "")).toBe(true);
    expect(o.formasOcultas).toEqual([]);
  });

  it("«Software y suscripciones» habla de la cuenta y la renovación, no de un servicio del local, y nunca pide la clave de acceso", () => {
    const s = sugerirFicha("software");
    expect(s).not.toEqual(SUGERENCIA_NEUTRA);
    expect(s.tituloCodigo).toMatch(/ID|cuenta|plan/i);
    expect(s.vence?.titulo).toMatch(/renueva/i);
    expect(pideVence(s, "")).toBe(true);
    expect(textosDe(s)).not.toMatch(/\bluz\b|\bagua\b|suministro|l[ií]nea|celular|el[eé]ctric|tel[eé]fono|propietario|alquiler/i);
    expect(s.ayudaCodigo).toMatch(/nunca[^.]*clave/i);
  });

  it("los cuatro servicios separados no se mezclan: ningún texto de uno menciona el servicio de otro", () => {
    const AJENO: Record<string, RegExp> = {
      luz: /\bagua\b|internet|tel[eé]fono|celular|l[ií]nea|m[oó]vil|sedapal|sedalib|sedapar/i,
      agua: /\bluz\b|el[eé]ctric|internet|tel[eé]fono|celular|l[ií]nea|m[oó]vil|hidrandina|seal|enel/i,
      internet: /\bluz\b|el[eé]ctric|\bagua\b|tel[eé]fono|celular|l[ií]nea|m[oó]vil|suministro/i,
      telefonia: /\bluz\b|el[eé]ctric|\bagua\b|internet|suministro/i,
    };
    for (const [c, ajeno] of Object.entries(AJENO)) {
      const texto = textosDe(sugerirFicha(c));
      expect(texto, c).not.toMatch(ajeno);
    }
  });

  it("ninguna de las cuatro categorías nuevas pide ni menciona el número de cuenta bancaria (es solo de líder y admin, ADR-0452)", () => {
    for (const c of [...CODIGOS_NUEVOS, "servicios_basicos"]) {
      expect(textosDe(sugerirFicha(c)), c).not.toMatch(/n\.?\s?º\s+de\s+cuenta|n[uú]mero\s+de\s+(la\s+)?cuenta|cuenta\s+(bancaria|corriente|de\s+ahorros)|\bcci\b|\biban\b/i);
    }
  });

  it("la migración de servicios crea exactamente luz, agua, internet, telefonía y software, y cada código que crea tiene su ficha propia (no cae a la neutra)", () => {
    expect([...CODIGOS_NUEVOS].sort()).toEqual(["agua", "internet", "luz", "software", "telefonia"]);
    for (const c of CODIGOS_NUEVOS) {
      expect(SUGERENCIAS_POR_CATEGORIA[c], `${c}: la migración la crea pero la ficha no la conoce`).toBeDefined();
      expect(sugerirFicha(c), c).not.toEqual(SUGERENCIA_NEUTRA);
    }
    // Las cuatro de servicios, en la misma cuenta que «Servicios básicos» (636); el software, en la 639; y «servicios_basicos» conserva su código.
    expect((MIGRACION_SERVICIOS.match(/'636'/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((MIGRACION_SERVICIOS.match(/'639'/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(SUGERENCIAS_POR_CATEGORIA.servicios_basicos).toBeDefined();
  });

  it("el neutro es lo de siempre y lo pide todo: una categoría desconocida no pierde ninguna caja", () => {
    expect(SUGERENCIA_NEUTRA.tituloCodigo).toBe("Código del servicio");
    expect(SUGERENCIA_NEUTRA.tituloRecibo).toBe("Cómo llega el recibo");
    expect(SUGERENCIA_NEUTRA.tituloBeneficiario).toBe("Propietario o empresa");
    expect(SUGERENCIA_NEUTRA.vence?.titulo).toBe("Vence el contrato");
    expect(SUGERENCIA_NEUTRA.formasOcultas).toEqual([]);
    expect(pideVence(sugerirFicha("categoria_nueva_de_un_lider"), "")).toBe(true);
  });

  it("«Vence…» no se pide donde casi nunca existe (transporte, suministros, comisiones del banco) y se pide donde sí (póliza, licencia, alquiler)", () => {
    for (const c of ["transporte", "suministros", "gastos_bancarios"]) expect(pideVence(sugerirFicha(c), ""), c).toBe(false);
    for (const c of ["luz", "agua"]) expect(pideVence(sugerirFicha(c), ""), c).toBe(false);
    for (const c of ["alquileres", "internet", "telefonia", "software", "servicios_basicos", "mantenimiento", "publicidad", "asesoria", "tributos", "seguros"]) expect(pideVence(sugerirFicha(c), ""), c).toBe(true);
    expect(sugerirFicha("seguros").vence?.titulo).toMatch(/póliza/i);
    expect(sugerirFicha("tributos").vence?.titulo).toMatch(/licencia/i);
  });

  it("nunca se esconde un dato ya cargado: una fecha guardada en una categoría que no la pide se sigue mostrando", () => {
    expect(pideVence(sugerirFicha("transporte"), "2027-03-31")).toBe(true);
    expect(pideVence(sugerirFicha("gastos_bancarios"), "2027-03-31")).toBe(true);
    // La luz y el agua tampoco la piden, pero un fijo que ya traía una fecha la sigue mostrando.
    expect(pideVence(sugerirFicha("luz"), "2027-03-31")).toBe(true);
    expect(pideVence(sugerirFicha("agua"), "2027-03-31")).toBe(true);
  });

  it("la forma «se paga el recibo» no se ofrece en un alquiler, salvo que ya sea la elegida; en las demás categorías están todas", () => {
    expect(formasParaElegir(sugerirFicha("alquileres"), FORMAS_DE_PAGO, "")).not.toContain("recibo");
    expect(formasParaElegir(sugerirFicha("alquileres"), FORMAS_DE_PAGO, "transferencia")).not.toContain("recibo");
    expect(formasParaElegir(sugerirFicha("alquileres"), FORMAS_DE_PAGO, "recibo")).toContain("recibo");
    expect(formasParaElegir(sugerirFicha("alquileres"), FORMAS_DE_PAGO, "").length).toBe(FORMAS_DE_PAGO.length - 1);
    for (const c of TODOS_LOS_CODIGOS.filter((x) => x !== "alquileres")) expect(formasParaElegir(sugerirFicha(c), FORMAS_DE_PAGO, ""), c).toEqual([...FORMAS_DE_PAGO]);
    expect(formasParaElegir(sugerirFicha("categoria_nueva_de_un_lider"), FORMAS_DE_PAGO, "")).toEqual([...FORMAS_DE_PAGO]);
  });

  it("las comisiones del banco no piden el número de cuenta en el código (la cuenta es solo de líder y admin, y el código lo ve cualquiera)", () => {
    const b = sugerirFicha("gastos_bancarios");
    expect(b.tituloCodigo).not.toMatch(/cuenta/i);
    expect(b.codigo).not.toMatch(/cuenta/i);
    expect(b.ayudaCodigo).toMatch(/no pongas aquí el número de cuenta/i);
  });
});
