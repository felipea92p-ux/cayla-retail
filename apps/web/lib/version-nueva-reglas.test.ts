import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/version/route";
import { clasificarPeticion, type PeticionEspera } from "./espera-reglas";
import { esRutaPublica } from "./rutas-publicas";
import { MIN_MS_ENTRE_PREGUNTAS, MS_SALIDA, VERSION_SIN_DATO, hayVersionNueva, leerVersion, tocaPreguntar } from "./version-nueva-reglas";

const A = "98b9137f3a1c";
const B = "11e335504d77";

describe("leerVersion (ADR-0422): solo se cree una respuesta con la forma esperada", () => {
  it("el id de `/api/version`", () => {
    expect(leerVersion({ id: A })).toBe(A);
    expect(leerVersion({ id: `  ${A}\n` })).toBe(A);
    expect(leerVersion({ id: "dpl_7qdfGVsrAMqZm9HzPdWrWX1UE7Xf" })).toBe("dpl_7qdfGVsrAMqZm9HzPdWrWX1UE7Xf");
  });

  it("una página de login, un error o un cuerpo raro NO son una versión: no saber nunca se vuelve aviso", () => {
    for (const cuerpo of [null, undefined, "", "<html>login</html>", 42, [], {}, { id: 7 }, { id: "" }, { id: "   " }, { error: "Sesión vencida. Vuelve a entrar." }, { id: "con espacios" }, { id: "<script>" }, { id: "x".repeat(81) }]) {
      expect(leerVersion(cuerpo)).toBeNull();
    }
  });
});

describe("hayVersionNueva: ¿la de producción es otra que la de esta pestaña?", () => {
  it("coinciden → al día; difieren → versión nueva", () => {
    expect(hayVersionNueva(A, A)).toBe(false);
    expect(hayVersionNueva(A, B)).toBe(true);
  });

  it("también al volver atrás (rollback): «otra», no «más nueva»", () => {
    expect(hayVersionNueva(B, A)).toBe(true);
  });

  it("sin dato de un lado, nunca avisa: la red caída o la sesión vencida no son una versión nueva", () => {
    expect(hayVersionNueva(A, null)).toBe(false);
    expect(hayVersionNueva("", B)).toBe(false);
    expect(hayVersionNueva("", null)).toBe(false);
  });

  it("en desarrollo (sin commit de Vercel) no se compara con nada", () => {
    expect(hayVersionNueva(VERSION_SIN_DATO, B)).toBe(false);
    expect(hayVersionNueva(A, VERSION_SIN_DATO)).toBe(false);
    expect(hayVersionNueva(VERSION_SIN_DATO, VERSION_SIN_DATO)).toBe(false);
  });
});

describe("tocaPreguntar: al volver a la pestaña se pregunta enseguida, pero no más de una vez por minuto", () => {
  it("la primera vez, sí", () => {
    expect(tocaPreguntar(1_000_000, null)).toBe(true);
  });
  it("tres cambios de pestaña en 10 s no hacen tres preguntas", () => {
    expect(tocaPreguntar(1_010_000, 1_000_000)).toBe(false);
    expect(tocaPreguntar(1_000_000 + MIN_MS_ENTRE_PREGUNTAS - 1, 1_000_000)).toBe(false);
  });
  it("pasado el minuto, sí", () => {
    expect(tocaPreguntar(1_000_000 + MIN_MS_ENTRE_PREGUNTAS, 1_000_000)).toBe(true);
  });
});

describe("la pregunta no abre el loader de pantalla completa (ADR-0149)", () => {
  const ORIGEN = "https://retail.cayla.pe";
  const pet = (url: string): PeticionEspera => ({ url: new URL(url), metodo: "GET", cabecera: () => null, origen: ORIGEN, hostSupabase: "abc.supabase.co" });

  it("un GET a /api/version, cada pocos minutos, no bloquea la pantalla de quien está cobrando", () => {
    expect(clasificarPeticion(pet(`${ORIGEN}/api/version`))).toBeNull();
  });
});

describe("GET /api/version: dice la versión grabada al compilar, y nunca se guarda en caché", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("devuelve el id grabado en esta compilación", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_ID", A);
    const respuesta = GET();
    expect(respuesta.status).toBe(200);
    expect(leerVersion(await respuesta.json())).toBe(A);
  });

  it("sin id grabado (fuera de Vercel) dice «desarrollo», que la pestaña no compara con nada", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_ID", undefined);
    const id = leerVersion(await GET().json());
    expect(id).toBe(VERSION_SIN_DATO);
    expect(hayVersionNueva(A, id)).toBe(false);
  });

  it("lleva `no-store`: una respuesta repetida le diría «estás al día» a una pestaña vieja", () => {
    expect(GET().headers.get("cache-control")).toContain("no-store");
  });
});

describe("la ruta de la versión NO es pública: nada se abre a internet por esto", () => {
  it("sin sesión, el proxy la trata como cualquier otra API (401)", () => {
    expect(esRutaPublica("/api/version")).toBe(false);
  });
});

describe("las tres piezas hablan del mismo nombre: si una lo cambia, el aviso se apaga en silencio", () => {
  // `process.env.NEXT_PUBLIC_*` se reemplaza al compilar solo si el nombre está escrito tal cual: no se puede compartir en una constante.
  const leer = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8");

  it("next.config.ts lo graba, la ruta lo dice y el componente lo compara", () => {
    expect(leer("next.config.ts")).toMatch(/env:\s*\{\s*NEXT_PUBLIC_BUILD_ID:/);
    expect(leer("app/api/version/route.ts")).toContain("process.env.NEXT_PUBLIC_BUILD_ID");
    expect(leer("components/VersionNueva.tsx")).toContain("process.env.NEXT_PUBLIC_BUILD_ID");
  });

  it("la ruta nunca se guarda en caché", () => {
    const ruta = leer("app/api/version/route.ts");
    expect(ruta).toContain('export const dynamic = "force-dynamic"');
    expect(ruta).toMatch(/Cache-Control.*no-store/);
  });

  it("el componente pregunta sin marcas de Next y sin caché, y está montado una vez en el layout de la app", () => {
    // Los comentarios explican justo esas marcas: se mira el código, no lo que dicen.
    const componente = leer("components/VersionNueva.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(componente).toContain('cache: "no-store"');
    expect(componente).not.toMatch(/x-deployment-id|dpl=/i);
    expect(leer("app/(app)/layout.tsx")).toContain("<VersionNueva />");
  });

  it("nunca recarga sola: la única recarga cuelga de un clic", () => {
    const componente = leer("components/VersionNueva.tsx");
    const recargas = componente.match(/location\.reload\(/g) ?? [];
    expect(recargas).toHaveLength(1);
    expect(componente).toMatch(/onClick=\{\(\) => window\.location\.reload\(\)\}/);
  });
});

describe("la gota del aviso (ADR-0136, act. 2026-10-28): entra y sale con su movimiento, y se apaga con «reducir movimiento»", () => {
  const leer = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8");
  const css = leer("app/estilos/avisos.css");

  it("el componente y el CSS hablan del mismo filtro y de la misma salida", () => {
    expect(leer("components/VersionNueva.tsx")).toContain('id="liquido"');
    expect(css).toContain("filter: url(#liquido)");
    expect(leer("components/VersionNueva.tsx")).toContain("cayla-version-cae-sale");
    expect(css).toMatch(/@keyframes cayla-version-cae-sale/);
  });

  it("la salida dura lo que dice `MS_SALIDA`: 950 ms de recogerse y 500 ms de caer", () => {
    expect(css).toMatch(/cayla-version-cae-sale 500ms [^;]* 950ms both/);
    expect(MS_SALIDA).toBe(950 + 500);
  });

  it("con `prefers-reduced-motion` no hay gota ni salida animada", () => {
    const bloque = css.slice(css.indexOf("/* ---- La salida"));
    expect(bloque).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.version-nueva \{ animation: none;/);
    expect(bloque).toMatch(/\.version-nueva-agua \{ display: none; \}/);
  });

  it("el único rebote es el de la gota de entrada, una vez y sin bucle: nada de `infinite` en la píldora", () => {
    const pildora = css.slice(css.indexOf("«Hay una versión nueva de CAYLA» — la píldora flotante"));
    expect(pildora).not.toMatch(/infinite/);
  });
});
