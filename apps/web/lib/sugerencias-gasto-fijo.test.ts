import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FORMAS_DE_PAGO } from "./gasto-fijo-ficha-reglas";
import { formasParaElegir, pideVence, sugerirFicha, SUGERENCIA_NEUTRA, SUGERENCIAS_POR_CATEGORIA, type SugerenciaFicha } from "./sugerencias-gasto-fijo";

// Las categorías que trae el sistema, tal como las siembra la migración (la fuente real de los códigos).
const SEMILLA = readFileSync(join(__dirname, "../../../supabase/migrations/20260924235000_finanzas_plan_de_cuentas_y_categorias_gasto.sql"), "utf8");
const CODIGOS = [...(SEMILLA.split("insert into retail.categorias_gasto")[1] ?? "").matchAll(/^\s*\('([a-z_]+)',\s+'/gm)].map((m) => m[1]);

const TODAS: SugerenciaFicha[] = [SUGERENCIA_NEUTRA, ...Object.values(SUGERENCIAS_POR_CATEGORIA)];

describe("los ejemplos de la ficha siguen a la categoría (ADR-0290)", () => {
  it("la siembra trae las 10 categorías de siempre", () => {
    expect(CODIGOS).toHaveLength(10);
  });
  it("totalidad: toda categoría del sistema tiene su ejemplo propio, completo y distinto del neutro", () => {
    for (const c of CODIGOS) {
      const s = SUGERENCIAS_POR_CATEGORIA[c];
      expect(s, c).toBeDefined();
      expect(s.beneficiario.trim(), c).not.toBe("");
      expect(s.codigo.trim(), c).not.toBe("");
      expect(s.recibo.trim(), c).not.toBe("");
      expect(s.beneficiario, c).not.toBe(SUGERENCIA_NEUTRA.beneficiario);
    }
    expect(Object.keys(SUGERENCIAS_POR_CATEGORIA).sort()).toEqual([...CODIGOS].sort());
  });
  it("sin contradicción: el alquiler no habla de luz ni la luz de contratos de local", () => {
    expect(sugerirFicha("alquileres").beneficiario).toMatch(/propietario/i);
    expect(sugerirFicha("alquileres").codigo).not.toMatch(/suministro|póliza/i);
    expect(sugerirFicha("servicios_basicos").codigo).toMatch(/suministro/i);
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
    for (const c of CODIGOS) {
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

  it("la luz, el agua y el internet siguen con su «Código del servicio» y su recibo, y su contrato va después", () => {
    const s = sugerirFicha("servicios_basicos");
    expect(s.tituloBeneficiario).toBe("Empresa");
    expect(s.tituloCodigo).toBe("Código del servicio");
    expect(s.tituloRecibo).toBe("Cómo llega el recibo");
    expect(s.vencePrimero).toBe(false);
    expect(s.formasOcultas).toEqual([]);
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
    for (const c of ["alquileres", "servicios_basicos", "mantenimiento", "publicidad", "asesoria", "tributos", "seguros"]) expect(pideVence(sugerirFicha(c), ""), c).toBe(true);
    expect(sugerirFicha("seguros").vence?.titulo).toMatch(/póliza/i);
    expect(sugerirFicha("tributos").vence?.titulo).toMatch(/licencia/i);
  });

  it("nunca se esconde un dato ya cargado: una fecha guardada en una categoría que no la pide se sigue mostrando", () => {
    expect(pideVence(sugerirFicha("transporte"), "2027-03-31")).toBe(true);
    expect(pideVence(sugerirFicha("gastos_bancarios"), "2027-03-31")).toBe(true);
  });

  it("la forma «se paga el recibo» no se ofrece en un alquiler, salvo que ya sea la elegida; en las demás categorías están todas", () => {
    expect(formasParaElegir(sugerirFicha("alquileres"), FORMAS_DE_PAGO, "")).not.toContain("recibo");
    expect(formasParaElegir(sugerirFicha("alquileres"), FORMAS_DE_PAGO, "transferencia")).not.toContain("recibo");
    expect(formasParaElegir(sugerirFicha("alquileres"), FORMAS_DE_PAGO, "recibo")).toContain("recibo");
    expect(formasParaElegir(sugerirFicha("alquileres"), FORMAS_DE_PAGO, "").length).toBe(FORMAS_DE_PAGO.length - 1);
    for (const c of CODIGOS.filter((x) => x !== "alquileres")) expect(formasParaElegir(sugerirFicha(c), FORMAS_DE_PAGO, ""), c).toEqual([...FORMAS_DE_PAGO]);
    expect(formasParaElegir(sugerirFicha("categoria_nueva_de_un_lider"), FORMAS_DE_PAGO, "")).toEqual([...FORMAS_DE_PAGO]);
  });

  it("las comisiones del banco no piden el número de cuenta en el código (la cuenta es solo de líder y admin, y el código lo ve cualquiera)", () => {
    const b = sugerirFicha("gastos_bancarios");
    expect(b.tituloCodigo).not.toMatch(/cuenta/i);
    expect(b.codigo).not.toMatch(/cuenta/i);
    expect(b.ayudaCodigo).toMatch(/no pongas aquí el número de cuenta/i);
  });
});
