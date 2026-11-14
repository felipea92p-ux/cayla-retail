import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  borradorDeLaCapacidad,
  camposDelPiso,
  capacidadDelBorrador,
  capacidadDe,
  CONTEO_DESDE,
  DENSIDAD_MAXIMA,
  diferenciaDeCapacidad,
  esLoMismo,
  leerDelPiso,
  M2_MAXIMO,
  type BorradorDelPiso,
} from "./capacidad-piso-config";
import type { CapacidadPiso } from "./capacidad-piso";

const HOY = "2026-11-14";
const base: BorradorDelPiso = { m2: "16", densidad: "30", contadaEl: "2026-11-10", sinContar: false };
const TRU: CapacidadPiso = { m2Sala: 16, densidad: 30, capacidad: 480, provisional: false, contadaEl: "2026-09-30", version: 3, cuadradoEn: null };

function ok(b: Partial<BorradorDelPiso>) {
  const r = leerDelPiso({ ...base, ...b }, HOY);
  if (!r.ok) throw new Error(`se esperaba una lectura válida y salió: ${JSON.stringify(r.problemas)}`);
  return r;
}
function problemas(b: Partial<BorradorDelPiso>) {
  const r = leerDelPiso({ ...base, ...b }, HOY);
  if (r.ok) throw new Error("se esperaba un problema y se leyó bien");
  return r.problemas;
}

describe("la hoja «Configurar el piso» lee lo tecleado", () => {
  it("TRU de hoy: 16 m² × 30 = 480, contada el 10 de noviembre", () => {
    expect(ok({})).toEqual({ ok: true, m2: 16, densidad: 30, capacidad: 480, contadaEl: "2026-11-10" });
  });

  it("acepta coma o punto y hasta 2 decimales, y espacios que separan miles", () => {
    expect(ok({ m2: "12,5" }).capacidad).toBe(375);
    expect(ok({ m2: "12.50" }).m2).toBe(12.5);
    expect(ok({ m2: " 1 200 ", densidad: "1,5" }).capacidad).toBe(1800);
  });

  it("«Aún no lo conté» deja la fecha en null y NO pide el día aunque la caja tenga algo viejo o roto", () => {
    expect(ok({ sinContar: true, contadaEl: "" }).contadaEl).toBeNull();
    expect(ok({ sinContar: true, contadaEl: "no es fecha" }).contadaEl).toBeNull();
  });

  it("la capacidad se redondea hacia abajo, como la base (floor), y sin errores de coma flotante", () => {
    expect(capacidadDe(12.34, 30)).toBe(370); // 370,2
    expect(capacidadDe(0.1, 3)).toBe(0); // 0,1 × 3 en coma flotante da 0,30000000000000004; es 0,3: no cabe una
    expect(capacidadDe(0.7, 30)).toBe(21); // 0,7 × 30 = 21 justo; en flotante 0,7*100 = 70.00000000000001
    expect(capacidadDe(2000, 150)).toBe(300000);
    expect(capacidadDe(0.01, 100)).toBe(1);
  });
});

describe("lo que está mal lo dice EN su campo, con las reglas de la base", () => {
  it("campos vacíos o con letras", () => {
    expect(problemas({ m2: "" }).m2).toMatch(/Escribe los m²/);
    expect(problemas({ densidad: "  " }).densidad).toMatch(/cuántas prendas/);
    for (const mal of ["abc", "12,", ",5", "-3", "1e3", "12,345", "12;5", "∞"]) {
      expect(problemas({ m2: mal }).m2, mal).toBeDefined();
    }
  });

  it("un pegado de varias celdas no se adivina (12 · 8 · 5 no es 1285)", () => {
    expect(problemas({ m2: "12 8 5" }).m2).toBeDefined();
    expect(problemas({ m2: "12\t8" }).m2).toBeDefined();
    expect(problemas({ densidad: "30 25" }).densidad).toBeDefined();
  });

  it("rangos: 0 no, el tope sí, un poco más no", () => {
    expect(problemas({ m2: "0" }).m2).toBeDefined();
    expect(ok({ m2: String(M2_MAXIMO) }).m2).toBe(M2_MAXIMO);
    expect(problemas({ m2: String(M2_MAXIMO + 1) }).m2).toBeDefined();
    expect(problemas({ m2: "2000,01" }).m2).toBeDefined();
    expect(problemas({ densidad: "0" }).densidad).toBeDefined();
    expect(ok({ densidad: String(DENSIDAD_MAXIMA) }).densidad).toBe(DENSIDAD_MAXIMA);
    expect(problemas({ densidad: String(DENSIDAD_MAXIMA + 1) }).densidad).toBeDefined();
    // La tecla de más de la que avisa la migración: 300 por m², 2.000 m².
    expect(problemas({ densidad: "300" }).densidad).toBeDefined();
  });

  it("que no quepa ni una prenda (0,01 m² × 1 por m²) se dice en las prendas por m²", () => {
    expect(problemas({ m2: "0,01", densidad: "1" }).densidad).toMatch(/ni una prenda/);
    expect(ok({ m2: "0,01", densidad: "100" }).capacidad).toBe(1);
  });

  it("la fecha: pide el día, existe, no es futura y es de 2026 en adelante", () => {
    expect(problemas({ contadaEl: "" }).contadaEl).toMatch(/Elige el día/);
    expect(problemas({ contadaEl: "2026-02-30" }).contadaEl).toMatch(/no existe/);
    expect(problemas({ contadaEl: "10/11/2026" }).contadaEl).toMatch(/no existe/);
    expect(problemas({ contadaEl: "2026-11-15" }).contadaEl).toMatch(/no llegó/);
    expect(ok({ contadaEl: HOY }).contadaEl).toBe(HOY); // hoy sí (la base: hoy en Lima sí, mañana no)
    expect(problemas({ contadaEl: "2025-12-31" }).contadaEl).toMatch(/2026 en adelante/);
    expect(ok({ contadaEl: CONTEO_DESDE }).contadaEl).toBe(CONTEO_DESDE);
  });

  it("varios problemas a la vez salen todos, cada uno en su campo", () => {
    expect(Object.keys(problemas({ m2: "", densidad: "x", contadaEl: "" })).sort()).toEqual(["contadaEl", "densidad", "m2"]);
  });
});

describe("las cajas parten de lo guardado, y guardar lo mismo no hace nada", () => {
  it("el borrador de TRU trae sus números con coma y su fecha", () => {
    expect(borradorDeLaCapacidad(TRU)).toEqual({ m2: "16", densidad: "30", contadaEl: "2026-09-30", sinContar: false });
    expect(borradorDeLaCapacidad({ ...TRU, m2Sala: 12.5, contadaEl: null })).toEqual({ m2: "12,5", densidad: "30", contadaEl: "", sinContar: true });
  });

  it("una sede sin capacidad parte vacía y pide el día del conteo (no se da por «sin contar» sin que lo diga la persona)", () => {
    const b = borradorDeLaCapacidad(null);
    expect(b).toEqual({ m2: "", densidad: "", contadaEl: "", sinContar: false });
    expect(leerDelPiso(b, HOY).ok).toBe(false);
  });

  it("ida y vuelta: lo guardado, puesto en las cajas y leído, vuelve a ser lo guardado", () => {
    for (const c of [TRU, { ...TRU, m2Sala: 12.5, capacidad: 375 }, { ...TRU, contadaEl: null, provisional: true }]) {
      const l = leerDelPiso(borradorDeLaCapacidad(c), HOY);
      expect(l.ok).toBe(true);
      if (l.ok) {
        expect(esLoMismo(c, l)).toBe(true);
        expect(l.capacidad).toBe(c.capacidad);
      }
    }
  });

  it("cambiar un solo dato ya no es lo mismo; sin capacidad previa nunca es lo mismo", () => {
    const l = ok({ m2: "20", contadaEl: "2026-09-30" });
    expect(esLoMismo(TRU, l)).toBe(false);
    expect(esLoMismo(null, ok({}))).toBe(false);
  });

  it("la diferencia de capacidad: más o menos prendas, o nada si no cambió o no había", () => {
    expect(diferenciaDeCapacidad(TRU, 600)).toBe(120);
    expect(diferenciaDeCapacidad(TRU, 384)).toBe(-96);
    expect(diferenciaDeCapacidad(TRU, 480)).toBeNull();
    expect(diferenciaDeCapacidad(null, 480)).toBeNull();
  });
});

describe("la capacidad se ve apenas están los m² y las prendas por m², con o sin día de conteo", () => {
  it("la fecha vacía, rota o futura no la esconde", () => {
    for (const contadaEl of ["", "x", "2099-01-01"]) expect(capacidadDelBorrador({ ...base, contadaEl })).toBe(480);
    expect(capacidadDelBorrador({ ...base, sinContar: true })).toBe(480);
  });

  it("sin m² o sin prendas por m² legibles, nada (nunca un número inventado)", () => {
    expect(capacidadDelBorrador({ ...base, m2: "" })).toBeNull();
    expect(capacidadDelBorrador({ ...base, densidad: "abc" })).toBeNull();
    expect(capacidadDelBorrador({ ...base, m2: "0" })).toBeNull();
    expect(capacidadDelBorrador({ ...base, m2: "0,01", densidad: "1" })).toBeNull();
  });
});

describe("la guía de foco cuenta lo mismo que bloquea el guardado", () => {
  const faltan = (b: Partial<BorradorDelPiso>, responsableListo = true) => {
    const bb = { ...base, ...b };
    return camposDelPiso(leerDelPiso(bb, HOY), bb, { listo: responsableListo }).filter((c) => c.requerido && !c.hecho).map((c) => c.id);
  };

  it("todo bien: no falta nada", () => {
    expect(faltan({})).toEqual([]);
  });

  it("cada campo mal o vacío es lo que falta, y sin responsable también", () => {
    expect(faltan({ m2: "" })).toEqual(["m2"]);
    expect(faltan({ densidad: "x" })).toEqual(["densidad"]);
    expect(faltan({ contadaEl: "" })).toEqual(["contadaEl"]);
    expect(faltan({}, false)).toEqual(["responsable"]);
    expect(faltan({ m2: "", densidad: "", contadaEl: "" }, false)).toEqual(["m2", "densidad", "contadaEl", "responsable"]);
  });

  it("«Aún no lo conté» saca el día de lo que falta", () => {
    expect(faltan({ contadaEl: "", sinContar: true })).toEqual([]);
  });

  it("coincide con leerDelPiso: hay algo que falta si y solo si la lectura no sale (para cada caso de la tabla)", () => {
    const casos: Partial<BorradorDelPiso>[] = [{}, { m2: "" }, { m2: "0" }, { m2: "2001" }, { densidad: "151" }, { m2: "0,01", densidad: "1" }, { contadaEl: "2027-01-01" }, { contadaEl: "2025-01-01" }, { sinContar: true, contadaEl: "x" }];
    for (const caso of casos) {
      const bb = { ...base, ...caso };
      expect(faltan(caso).length > 0, JSON.stringify(caso)).toBe(!leerDelPiso(bb, HOY).ok);
    }
  });
});

// Los topes y los mensajes de la base son la fuente: si alguien los cambia en una migración nueva, esta prueba avisa antes de que la
// hoja prometa un rango que la función ya no acepta (o rechace un valor que ahora sí cabe).
describe("los topes de la hoja son los de la base", () => {
  const sql = readFileSync(join(__dirname, "../../../supabase/migrations/20261005103000_capacidad_del_piso_por_sede.sql"), "utf8");

  it("m² hasta 2000, prendas por m² hasta 150, al menos 1 prenda, conteo desde 2026-01-01", () => {
    expect(sql).toContain(`m2_sala > 0 and m2_sala <= ${M2_MAXIMO}`);
    expect(sql).toContain(`densidad > 0 and densidad <= ${DENSIDAD_MAXIMA}`);
    expect(sql).toContain("m2_sala * densidad >= 1");
    expect(sql).toContain(`p_contada_el < date '${CONTEO_DESDE}'`);
    expect(sql).toContain(`v_m2 > ${M2_MAXIMO}`);
    expect(sql).toContain(`v_densidad > ${DENSIDAD_MAXIMA}`);
  });

  it("la base redondea los m² y las prendas por m² a 2 decimales y la capacidad hacia abajo", () => {
    expect(sql).toContain("round(p_m2_sala, 2)");
    expect(sql).toContain("round(p_densidad, 2)");
    expect(sql).toContain("floor(m2_sala * densidad)");
  });
});
