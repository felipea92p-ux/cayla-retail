import { describe, expect, it } from "vitest";
// El escáner es la ÚNICA definición de «leer antes de declarar»: la prueba lo importa en vez de copiarlo, como
// `lib/relleno-silencioso.test.ts` con el suyo.
import { analizarArchivo, fuentes, lecturasAntesDeDeclarar } from "../../../scripts/antes-de-declarar/escanear.mjs";

// REGLA (2026-11-26, a raíz de Sentry CAYLA-RETAIL-1G): un `const` o un `let` no se lee, en el momento, antes de la línea que lo
// declara. «Cerrar caja» se cayó en Lima porque `CerrarCajaModalV2` hacía `cierresAliadas?.find((c) => … destino …)` antes de
// `const [destino] = useState(…)`: JavaScript lanza «Cannot access 'W' before initialization» y la pantalla entera se cae.
// TypeScript no lo ve cuando la lectura va dentro de una función (el `.find`), y ESLint (`no-use-before-define`) grita 237 veces
// en este repo por lecturas que corren después y no hacen daño. El escáner solo cuenta las que corren en el momento.
// No hay lista de deuda: el día que nació la regla había CERO (la de Cerrar caja ya estaba arreglada).

type Hallazgo = { nombre: string; linea: number; declarada: number };
const nombres = (codigo: string) => (analizarArchivo(codigo, "x.tsx") as Hallazgo[]).map((h) => h.nombre);

describe("leer antes de declarar — lo que hace caer una pantalla", () => {
  it("ve lo que se lee en el momento antes de su línea", () => {
    // El caso de Cerrar caja, tal cual era.
    expect(nombres(`function C() { const x = lista?.find((c) => destino === c); const [destino] = useState("caja"); return x; }`)).toEqual(["destino"]);
    expect(nombres(`function C() { const r = useMemo(() => d, []); const d = 1; return r; }`)).toEqual(["d"]);
    expect(nombres(`function C() { const [s] = useState(() => d); const d = 1; return s; }`)).toEqual(["d"]);
    expect(nombres(`function C() { const r = [1].map(() => ({ d })); const d = 2; return r; }`)).toEqual(["d"]);
    expect(nombres(`function C() { const r = (() => d)(); const d = 1; return r; }`)).toEqual(["d"]);
    expect(nombres(`function C(x: boolean) { if (x) return <V />; const V = () => null; return null; }`)).toEqual(["V"]);
    expect(nombres(`const A = [1].map(() => B); const B = 2;`)).toEqual(["B"]);
  });

  it("no grita por lo que corre después, por los tipos ni por otro nombre igual", () => {
    expect(nombres(`function C() { useEffect(() => { d; }); const d = 1; }`)).toEqual([]);
    expect(nombres(`function C() { const f = useCallback(() => d, []); const d = 1; return <b onClick={() => d}>{f()}</b>; }`)).toEqual([]);
    expect(nombres(`function C() { return X; } const X = 1;`)).toEqual([]);
    expect(nombres(`function C(xs: number[]) { const r = xs.map((d) => d); const d = 1; return r; }`)).toEqual([]);
    expect(nombres(`function C() { let a: typeof d; const d = 1; }`)).toEqual([]);
    expect(nombres(`function C() { const r = { d: 1 }.d; const d = 2; return r; }`)).toEqual([]);
    expect(nombres(`function C() { const r = [1].find(() => d); // antes-de-declarar: ejemplo de la prueba del escáner\n const d = 1; return r; }`)).toEqual([]);
  });

  it("el escáner mira el repo de verdad (no una carpeta vacía)", () => {
    expect(fuentes().length).toBeGreaterThan(500);
  });

  it("ningún archivo lee un const o un let antes de declararlo", () => {
    const hoy = lecturasAntesDeDeclarar() as Record<string, Hallazgo[]>;
    const lista = Object.entries(hoy).flatMap(([a, hs]) => hs.map((h) => `${a}:${h.linea} «${h.nombre}» (se declara en la línea ${h.declarada})`));
    expect(
      lista,
      `Se lee antes de declarar: ${lista.join(" · ")}. Mueve la declaración arriba de donde se lee. Si de verdad no corre en el momento, ` +
        "dilo en su línea: «// antes-de-declarar: <por qué, 10 caracteres o más>». Detalle: scripts/antes-de-declarar/escanear.mjs.",
    ).toEqual([]);
  }, 60_000); // recorre ~1.000 archivos con el analizador de TypeScript: unos 6 s en una Mac, más en el CI
});
