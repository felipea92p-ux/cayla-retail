import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  avisoDeResolucion,
  avisoDeTraslado,
  cobrosGuardados,
  cobrosPorResolver,
  conCobro,
  faseTrasError,
  hayQueRevisar,
  huellaDe,
  leerResolucion,
  marcaPara,
  OPERACIONES_CON_MARCA,
  proximaRevision,
  REINTENTO_RESOLVER_MS,
  sinCobro,
  TOPE_ESPERA_MS,
  trasladosGuardados,
  type CobroEnCurso,
  type TrasladoEnCurso,
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
    expect(avisoDeResolucion({ tipo: "no_llego" }, cobro)).toMatchObject({ tono: "info", titulo: "El cobro de S/\u00a0149.90 no se registró" });
    const hecho = avisoDeResolucion({ tipo: "hecho", datos: { total: 149.9, comprobante: { tipo: "boleta", serie: "B001", numero: 2 } } }, cobro);
    expect(hecho).toMatchObject({ tono: "exito", titulo: "Tu venta de S/\u00a0149.90 sí se registró" });
    expect(hecho.detalle).toContain("Boleta B001-2");
  });
});

describe("proximaRevision (cuándo volver a preguntar por un envío en el aire)", () => {
  const ahora = Date.parse("2026-10-14T10:00:30Z");
  it("sin jóvenes ni fallas, no se programa nada", () => {
    expect(proximaRevision([], false, ahora)).toBeNull();
  });
  it("un envío joven se revisa cuando cumple el tope", () => {
    expect(proximaRevision(["2026-10-14T10:00:25Z"], false, ahora)).toBe(TOPE_ESPERA_MS - 5000 + 500);
  });
  it("si una pregunta falló (la sesión aún no estaba lista al montar: 401), se vuelve a preguntar pronto, sin esperar a `online`", () => {
    expect(proximaRevision([], true, ahora)).toBe(REINTENTO_RESOLVER_MS);
    expect(proximaRevision(["2026-10-14T10:00:25Z"], true, ahora)).toBe(REINTENTO_RESOLVER_MS);
  });
  it("nunca antes de un segundo, y una fecha rota no rompe la cuenta", () => {
    expect(proximaRevision(["2026-10-14T10:00:10Z"], false, ahora)).toBe(1000);
    expect(proximaRevision(["no es fecha"], false, ahora)).toBeNull();
  });
});

describe("el traslado en curso de Nuevo traslado", () => {
  const t: TrasladoEnCurso = { token: "a", destino: "Tienda Trujillo", prendas: 3, enviadoEn: "2026-10-14T10:00:00Z" };
  it("lo guardado se valida: lo roto (o un cobro de Vender) se descarta", () => {
    expect(trasladosGuardados([t, { token: "b", enviadoEn: "x", total: 1, prendas: 1 }, null, "x"])).toEqual([t]);
    expect(trasladosGuardados({})).toEqual([]);
  });
  it("el aviso dice si salió, con su número y lo que de verdad guardó la base", () => {
    expect(avisoDeTraslado({ tipo: "no_llego" }, t)).toMatchObject({ tono: "info", titulo: "El traslado a Tienda Trujillo no se envió" });
    const hecho = avisoDeTraslado({ tipo: "hecho", datos: { numero: 246, prendas: 2 } }, t);
    expect(hecho).toMatchObject({ tono: "exito", titulo: "Tu traslado a Tienda Trujillo sí se envió" });
    // La base dice 2 aunque la pantalla anotó 3: manda lo guardado.
    expect(hecho.detalle).toContain("Traslado 246 · 2 prendas");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Las guardianas: la lista de la web es la de la base, y ninguna pantalla que llama a esas funciones deja el token fijo.
// ---------------------------------------------------------------------------------------------------------------------
const RAIZ_WEB = join(__dirname, "..");
const MIGRACIONES = join(RAIZ_WEB, "../../supabase/migrations");
const TODAS = readdirSync(MIGRACIONES).filter((f) => /^\d+_.*\.sql$/.test(f)).sort().map((f) => readFileSync(join(MIGRACIONES, f), "utf8"));

describe("la lista de operaciones es la de la base", () => {
  it("OPERACIONES_CON_MARCA = las que la ÚLTIMA versión de `fn_resolver_intento` sabe revisar (con lo que le suman después los reemplazos anclados)", () => {
    const i = TODAS.map((m) => m.includes("create or replace function retail.fn_resolver_intento")).lastIndexOf(true);
    const delResolver = TODAS[i]?.match(/if p_operacion not in \(([^)]*)\)/)?.[1].match(/'([a-z_]+)'/g)?.map((x) => x.slice(1, -1)) ?? [];
    // Una migración posterior que no reescribe la función entera le suma operaciones con un reemplazo anclado SOBRE LA LISTA
    // (`…'separar_pedido_para_apartar'` → la misma línea más las nuevas, como los fondos en 20261014194000): cuentan las que trae el
    // texto nuevo y no el viejo.
    const sumadas = TODAS.slice(i + 1).flatMap((m) =>
      [...m.matchAll(/pg_temp\.reemplazar\('retail\.fn_resolver_intento\(text, uuid\)',\s*\$v\$([^$]*)\$v\$,\s*\$n\$([^$]*)\$n\$/g)]
        // La plata anotada (ADR-0480, 20261022235000) ancla en la última línea de la lista, la que termina en `…') then`.
        .filter(([, viejo]) => viejo.includes("'separar_pedido_para_apartar'") || viejo.includes("'enviar_pedido_a_otra_sede') then"))
        .flatMap(([, viejo, nuevo]) => (nuevo.match(/'([a-z_]+)'/g) ?? []).map((x) => x.slice(1, -1)).filter((op) => !viejo.includes(`'${op}'`))),
    );
    expect([...new Set([...delResolver, ...sumadas])].sort()).toEqual([...OPERACIONES_CON_MARCA].sort());
  });
  it("y cada una tiene su llamada a `fn_intento_con_huella` en alguna migración (la base rechaza el token con otro contenido)", () => {
    // La marca de `insertar_antes` (`fn_intento_con_huella('op'$v$`) o la llamada insertada con un reemplazo (`…('op', p_token`).
    const parchadas = new Set(TODAS.flatMap((m) => [...m.matchAll(/fn_intento_con_huella\('([a-z_]+)'(?:\$v\$|, p_token)/g)].map((x) => x[1])));
    expect(OPERACIONES_CON_MARCA.filter((op) => !parchadas.has(op))).toEqual([]);
  });
});

/**
 * Los archivos que llaman a una de esas funciones SIN `useIntento` (la marca atada al contenido). Es deuda de otro módulo
 * (se cierra con su /chaos), nunca un archivo nuevo: la prueba falla si uno aparece, y si uno de la lista ya no lo necesita.
 */
const SIN_INTENTO_TODAVIA: Record<string, string> = {
  "components/GastosPanel.tsx": "Finanzas: registra cada gasto con un token nuevo por llamada; va con el /chaos de Finanzas.",
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

/**
 * Una pantalla que usa `useIntento` para una operación y guarda OTRA con una marca por apertura (que la base todavía no compara por
 * contenido). Deuda de otro módulo, con su motivo; solo baja.
 */
const TOKEN_FIJO_TODAVIA: Record<string, string> = {
  "components/RegistrarGastoModal.tsx":
    "El gasto ya va con useIntento; el activo fijo (`registrar_activo`, solo Finanzas) sigue con una marca por apertura porque la base aún no compara su contenido. Va con el /chaos de Finanzas.",
};

const TOKEN_FIJO = /useRef<string>\(crypto\.randomUUID\(\)\)|useState\(\(\) => crypto\.randomUUID\(\)\)/;

/** El código sin comentarios: una operación nombrada en un comentario no es una llamada. */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/**
 * ¿El archivo llama a una operación con marca? Cuenta también la llamada indirecta (el nombre elegido con un ternario,
 * `rpc((esActivo ? "registrar_activo" : "registrar_gasto") as never, …)`): leer solo `rpc("registrar_gasto"` dejó afuera
 * Registrar gasto hasta el 2026-10-13.
 */
function llamaAOperacionConMarca(texto: string): boolean {
  const codigo = sinComentarios(texto);
  return /\brpc\s*\(/.test(codigo) && OPERACIONES_CON_MARCA.some((op) => new RegExp(`["'\`]${op}["'\`]`).test(codigo));
}

describe("el detector de llamadas", () => {
  it("ve la llamada directa y la que elige el nombre con un ternario", () => {
    expect(llamaAOperacionConMarca(`supabase.rpc("registrar_gasto", { p_token: t })`)).toBe(true);
    expect(llamaAOperacionConMarca(`createClient().rpc((esActivo ? "registrar_activo" : "registrar_gasto") as never, v)`)).toBe(true);
  });
  it("no confunde una mención en un comentario con una llamada", () => {
    expect(llamaAOperacionConMarca(`// lo valida \`registrar_venta\`\nsupabase.rpc("fn_otra")`)).toBe(false);
    expect(llamaAOperacionConMarca(`/* \`registrar_cambio\` */ supabase.rpc("fn_otra")`)).toBe(false);
  });
  it("sin ninguna llamada a la base, nombrar la operación no cuenta", () => {
    expect(llamaAOperacionConMarca(`const que = "registrar_venta";`)).toBe(false);
  });
});

describe("ninguna pantalla deja fijo el token de una operación con marca", () => {
  const llamadores = [...archivos("components"), ...archivos("app")].filter((f) => llamaAOperacionConMarca(readFileSync(join(RAIZ_WEB, f), "utf8")));
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
  it("quien usa `useIntento` no guarda además un token fijo por apertura (o está en la deuda con su motivo)", () => {
    const conTokenFijo = llamadores.filter((f) => {
      const texto = readFileSync(join(RAIZ_WEB, f), "utf8");
      return texto.includes("useIntento(") && TOKEN_FIJO.test(texto) && !(f in TOKEN_FIJO_TODAVIA);
    });
    expect(conTokenFijo).toEqual([]);
  });
  it("esa deuda también solo baja", () => {
    const sobran = Object.keys(TOKEN_FIJO_TODAVIA).filter((f) => !llamadores.includes(f) || !TOKEN_FIJO.test(readFileSync(join(RAIZ_WEB, f), "utf8")));
    expect(sobran).toEqual([]);
  });
});
