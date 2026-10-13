import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  avisoDeResolucion,
  cobrosGuardados,
  cobrosPorResolver,
  conCobro,
  faseTrasError,
  hayQueRevisar,
  huellaDe,
  leerResolucion,
  marcaPara,
  OPERACIONES_CON_MARCA,
  sinCobro,
  TOPE_ESPERA_MS,
  type CobroEnCurso,
} from "./intento-reglas";

describe("huellaDe", () => {
  it("dos envíos iguales con otro orden de claves dan la misma huella", () => {
    expect(huellaDe({ a: 1, b: [{ y: 2, x: 1 }] })).toBe(huellaDe({ b: [{ x: 1, y: 2 }], a: 1 }));
  });
  it("una clave en undefined es como si no estuviera (así viaja al jsonb de la base)", () => {
    expect(huellaDe({ a: 1, nota: undefined })).toBe(huellaDe({ a: 1 }));
  });
  it("otro contenido u otro orden de una lista da otra huella", () => {
    expect(huellaDe({ items: [1, 2] })).not.toBe(huellaDe({ items: [2, 1] }));
    expect(huellaDe({ monto: 10 })).not.toBe(huellaDe({ monto: 10.01 }));
  });
});

describe("marcaPara", () => {
  let n = 0;
  const nuevo = () => `t${++n}`;
  it("la misma huella conserva la marca; otra huella saca una nueva", () => {
    const a = marcaPara(null, "h1", nuevo);
    expect(marcaPara(a, "h1", nuevo)).toBe(a);
    const b = marcaPara(a, "h2", nuevo);
    expect(b.token).not.toBe(a.token);
    expect(b.huella).toBe("h2");
  });
});

describe("faseTrasError y hayQueRevisar", () => {
  const corte = { message: "TypeError: Failed to fetch" };
  const sinCodigo = { message: "Bad gateway" };
  const veredicto = { message: "Stock insuficiente", code: "P0001" };
  it("sin veredicto de la base (corte o error sin código) queda en duda; con veredicto, libre", () => {
    expect(faseTrasError(corte)).toBe("incierto");
    expect(faseTrasError(sinCodigo)).toBe("incierto");
    expect(faseTrasError(veredicto)).toBe("libre");
  });
  it("un «no» que llega tras un envío en duda se le pregunta a la base antes de soltar el formulario", () => {
    expect(hayQueRevisar("incierto", veredicto)).toBe(true);
    expect(hayQueRevisar("libre", veredicto)).toBe(false);
    expect(hayQueRevisar("incierto", corte)).toBe(false);
  });
});

describe("leerResolucion", () => {
  it("lee hecho y no_llego; lo demás es «no se sabe»", () => {
    expect(leerResolucion({ estado: "hecho", venta_id: "v" })).toEqual({ tipo: "hecho", datos: { estado: "hecho", venta_id: "v" } });
    expect(leerResolucion({ estado: "no_llego" })).toEqual({ tipo: "no_llego" });
    expect(leerResolucion({ estado: "otra" })).toBeNull();
    expect(leerResolucion(null)).toBeNull();
  });
});

describe("el cobro en curso de Vender", () => {
  const c = (token: string, enviadoEn: string): CobroEnCurso => ({ token, total: 149.9, prendas: 2, enviadoEn });
  it("lo guardado se valida: lo roto se descarta sin romper Vender", () => {
    expect(cobrosGuardados("basura")).toEqual([]);
    expect(cobrosGuardados([c("a", "2026-10-13T10:00:00Z"), { token: 1 }, null])).toEqual([c("a", "2026-10-13T10:00:00Z")]);
  });
  it("con y sin un cobro, por token", () => {
    const lista = conCobro(conCobro([], c("a", "x")), c("b", "y"));
    expect(conCobro(lista, c("a", "z")).map((x) => x.token)).toEqual(["b", "a"]);
    expect(sinCobro(lista, "a").map((x) => x.token)).toEqual(["b"]);
  });
  it("solo se pregunta por un cobro que salió hace más del tope (otra pestaña puede estar mandándolo)", () => {
    const ahora = Date.parse("2026-10-13T10:00:30Z");
    const lista = [c("viejo", "2026-10-13T09:59:00Z"), c("nuevo", "2026-10-13T10:00:25Z"), c("roto", "no es fecha")];
    expect(cobrosPorResolver(lista, ahora).map((x) => x.token)).toEqual(["viejo", "roto"]);
    expect(cobrosPorResolver(lista, ahora + TOPE_ESPERA_MS).map((x) => x.token)).toEqual(["viejo", "nuevo", "roto"]);
  });
  it("el aviso dice lo que pasó, con el comprobante si lo hay", () => {
    const cobro = c("a", "x");
    expect(avisoDeResolucion({ tipo: "no_llego" }, cobro)).toMatchObject({ tono: "info", titulo: "El cobro de S/ 149.90 no se registró" });
    const hecho = avisoDeResolucion({ tipo: "hecho", datos: { total: 149.9, comprobante: { tipo: "boleta", serie: "B001", numero: 2 } } }, cobro);
    expect(hecho).toMatchObject({ tono: "exito", titulo: "Tu venta de S/ 149.90 sí se registró" });
    expect(hecho.detalle).toContain("Boleta B001-2");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Las guardianas: la lista de la web es la de la base, y ninguna pantalla que llama a esas funciones deja el token fijo.
// ---------------------------------------------------------------------------------------------------------------------
const RAIZ_WEB = join(__dirname, "..");
const PARTE1 = readFileSync(join(RAIZ_WEB, "../../supabase/migrations/20261013200000_token_sigue_al_contenido_parte1.sql"), "utf8");
const PARTE2 = readFileSync(join(RAIZ_WEB, "../../supabase/migrations/20261013201000_token_sigue_al_contenido_parte2.sql"), "utf8");

describe("la lista de operaciones es la de la base", () => {
  it("OPERACIONES_CON_MARCA = las que `fn_resolver_intento` sabe revisar = las que la parte 2 parcha", () => {
    const delResolver = PARTE1.match(/if p_operacion not in \(([^)]*)\)/)?.[1].match(/'([a-z_]+)'/g)?.map((x) => x.slice(1, -1)) ?? [];
    const parchadas = [...PARTE2.matchAll(/fn_intento_con_huella\('([a-z_]+)'\$v\$/g)].map((m) => m[1]);
    expect([...delResolver].sort()).toEqual([...OPERACIONES_CON_MARCA].sort());
    expect([...parchadas].sort()).toEqual([...OPERACIONES_CON_MARCA].sort());
  });
});

/**
 * Los archivos que llaman a una de esas funciones SIN `useIntento` (la marca atada al contenido). Es deuda de otro módulo
 * (se cierra con su /chaos), nunca un archivo nuevo: la prueba falla si uno aparece, y si uno de la lista ya no lo necesita.
 */
const SIN_INTENTO_TODAVIA: Record<string, string> = {
  "components/GastosPanel.tsx": "Finanzas: registra cada gasto con un token nuevo por llamada; va con el /chaos de Finanzas.",
  "components/traslados-pases/PasePedido.tsx": "Traslados: un token por pase abierto (cambiar la fecha tras un corte da token_reusado); va con el /chaos de Inventario.",
};

function archivos(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(RAIZ_WEB, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "node_modules") archivos(rel, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(rel);
  }
  return out;
}

describe("ninguna pantalla deja fijo el token de una operación con marca", () => {
  const llamadores = [...archivos("components"), ...archivos("app")].filter((f) => {
    const texto = readFileSync(join(RAIZ_WEB, f), "utf8");
    return OPERACIONES_CON_MARCA.some((op) => new RegExp(`rpc\\(\\s*["'\`]${op}["'\`]`).test(texto));
  });
  it("cada archivo que llama a una de ellas usa `useIntento` (o está en la deuda con su motivo)", () => {
    const sinIntento = llamadores.filter((f) => !readFileSync(join(RAIZ_WEB, f), "utf8").includes("useIntento(") && !(f in SIN_INTENTO_TODAVIA));
    expect(sinIntento, "Usa `useIntento` (lib/useIntento.ts): la marca de un envío tiene que seguir a lo que se manda.").toEqual([]);
  });
  it("la deuda solo baja: un archivo de la lista que ya usa `useIntento`, o que ya no llama a ninguna, sale de la lista", () => {
    const sobran = Object.keys(SIN_INTENTO_TODAVIA).filter(
      (f) => !llamadores.includes(f) || readFileSync(join(RAIZ_WEB, f), "utf8").includes("useIntento("),
    );
    expect(sobran).toEqual([]);
  });
  it("quien usa `useIntento` no guarda además un token fijo por apertura", () => {
    const conTokenFijo = llamadores.filter((f) => {
      const texto = readFileSync(join(RAIZ_WEB, f), "utf8");
      return texto.includes("useIntento(") && /useRef<string>\(crypto\.randomUUID\(\)\)|useState\(\(\) => crypto\.randomUUID\(\)\)/.test(texto);
    });
    expect(conTokenFijo).toEqual([]);
  });
});
