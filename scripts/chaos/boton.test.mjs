// Pruebas de `scripts/chaos/boton.mjs`: la lectura del código que da las pistas de la familia «El botón que no hace lo que dice»
// (ADR-0693). Cada pista recibe código MALO conocido (debe marcarlo) y BUENO conocido (debe callar): un lector que marca todo no
// guía a nadie. Lee el AST con TypeScript, así que en el CI corre después de la instalación.
// `node --test scripts/chaos/boton.test.mjs`
import assert from "node:assert/strict";
import { test } from "node:test";
import { pistasDeArchivo, PISTAS } from "./boton.mjs";
import { ATAQUES } from "./catalogo.mjs";

const tipos = (src) => pistasDeArchivo(src, "x.tsx").map((p) => p.tipo);
const cuantas = (src, tipo) => tipos(src).filter((t) => t === tipo).length;

test("cada pista apunta a un ataque de la familia «boton» que existe y le corresponde", () => {
  for (const [tipo, p] of Object.entries(PISTAS)) {
    const a = ATAQUES.find((x) => x.id === p.ataque);
    assert.ok(a, `${tipo} apunta a ${p.ataque}, que no existe`);
    assert.equal(a.familia, "boton", `${tipo} → ${p.ataque} no es de la familia boton`);
    assert.ok(p.que.length >= 30, `${tipo}: «que» explica la pista`);
  }
});

// ───────────── efecto-que-pisa (BOT-03) ─────────────
test("efecto-que-pisa: un `useEffect` que vuelve a poner un estado cuando cambia una prop", () => {
  assert.equal(cuantas(`function F({ prop }) { const [v, setValor] = useState(prop); useEffect(() => { setValor(prop); }, [prop]); return null; }`, "efecto-que-pisa"), 1);
  assert.equal(cuantas(`function F({ fila }) { const [a, setAbierto] = useState(false); useEffect(() => setAbierto(false), [fila]); return null; }`, "efecto-que-pisa"), 1);
  // Dentro de un `if` sigue siendo del cuerpo del efecto: corre en cada cambio.
  assert.equal(cuantas(`function F({ p }) { useEffect(() => { if (p) setX(p.total); }, [p]); return null; }`, "efecto-que-pisa"), 1);
  const [pista] = pistasDeArchivo(`function F({ prop }) {\n  useEffect(() => {\n    setValor(prop);\n  }, [prop]);\n}`, "x.tsx");
  assert.equal(pista.linea, 2);
  assert.match(pista.detalle, /setValor ← \[prop\]/);
});

test("efecto-que-pisa: NO marca el efecto de montaje, el que no pone estado ni el que lo pone dentro de un oyente o un temporizador", () => {
  assert.equal(cuantas(`function F() { useEffect(() => { setListo(true); }, []); return null; }`, "efecto-que-pisa"), 0);
  assert.equal(cuantas(`function F({ x }) { useEffect(() => { document.title = x; }, [x]); return null; }`, "efecto-que-pisa"), 0);
  assert.equal(cuantas(`function F({ a }) { useEffect(() => { const t = setTimeout(() => setX(1), 10); return () => clearTimeout(t); }, [a]); return null; }`, "efecto-que-pisa"), 0);
  assert.equal(cuantas(`function F({ a }) { useEffect(() => { const f = () => setAncho(window.innerWidth); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, [a]); return null; }`, "efecto-que-pisa"), 0);
});

// ───────────── refresco-tras-guardar (BOT-02) ─────────────
test("refresco-tras-guardar: `router.refresh()` o `push` después de un `await` (o en su `.then`)", () => {
  assert.equal(cuantas(`function F() { const router = useRouter(); async function guardar() { const { error } = await supabase.rpc("x"); if (!error) router.refresh(); } return null; }`, "refresco-tras-guardar"), 1);
  assert.equal(cuantas(`function F() { const r = useRouter(); const onClick = async () => { await fetch("/api/x", { method: "POST" }); r.push("/y"); }; return null; }`, "refresco-tras-guardar"), 1);
  assert.equal(cuantas(`function F() { const router = useRouter(); const g = () => guardar().then(() => router.replace("/z")); return null; }`, "refresco-tras-guardar"), 1);
  // En una Server Action, `revalidatePath` hace lo mismo: la pantalla vuelve a pintarse con props nuevas.
  assert.equal(cuantas(`"use server";\nexport async function a() { await supabase.rpc("x"); revalidatePath("/caja"); }`, "refresco-tras-guardar"), 1);
});

test("refresco-tras-guardar: NO marca navegar sin guardar ni un `refresh` de un objeto que no es el router", () => {
  assert.equal(cuantas(`function F() { const router = useRouter(); function ir() { router.push("/y"); } return null; }`, "refresco-tras-guardar"), 0);
  assert.equal(cuantas(`function F() { async function f() { await leer(); tabla.refresh(); } return null; }`, "refresco-tras-guardar"), 0);
  // El `await` de OTRA función (anidada) no cuenta: el refresco no viene después de guardar.
  assert.equal(cuantas(`function F() { const router = useRouter(); function ir() { const x = async () => { await a(); }; router.refresh(); } return null; }`, "refresco-tras-guardar"), 0);
});

test("refresco + efecto en el mismo archivo: la combinación se avisa (las props nuevas vuelven a poner el estado encima)", () => {
  const src = `function F({ total }) { const router = useRouter(); const [t, setTotal] = useState(total); useEffect(() => { setTotal(total); }, [total]);
    async function guardar() { await supabase.rpc("x"); router.refresh(); } return null; }`;
  const p = pistasDeArchivo(src, "x.tsx");
  assert.ok(p.some((x) => x.tipo === "refresco-tras-guardar" && /junto a un efecto que vuelve a poner/.test(x.detalle)));
});

// ───────────── efecto-sin-guardia (BOT-04) ─────────────
test("efecto-sin-guardia: un efecto que lee algo y pone el resultado sin descartar la respuesta vieja", () => {
  assert.equal(cuantas(`function F({ q }) { useEffect(() => { fetch("/api/x?q=" + q).then((r) => r.json()).then((d) => setLista(d)); }, [q]); return null; }`, "efecto-sin-guardia"), 1);
  assert.equal(cuantas(`function F({ q }) { useEffect(() => { (async () => { const d = await leer(q); setLista(d); })(); }, [q]); return null; }`, "efecto-sin-guardia"), 1);
});

test("efecto-sin-guardia: NO marca el que limpia al salir (bandera o AbortController) ni el de montaje", () => {
  assert.equal(cuantas(`function F({ q }) { useEffect(() => { let vigente = true; leer(q).then((d) => { if (vigente) setLista(d); }); return () => { vigente = false; }; }, [q]); return null; }`, "efecto-sin-guardia"), 0);
  assert.equal(cuantas(`function F({ q }) { useEffect(() => { const c = new AbortController(); fetch("/x", { signal: c.signal }).then((r) => r.json()).then(setLista); return () => c.abort(); }, [q]); return null; }`, "efecto-sin-guardia"), 0);
  assert.equal(cuantas(`function F() { useEffect(() => { leer().then((d) => setLista(d)); }, []); return null; }`, "efecto-sin-guardia"), 0);
});

test("un componente sin nada raro no da pistas", () => {
  assert.deepEqual(tipos(`export function F({ items }) { const [abierto, setAbierto] = useState(false); return <button onClick={() => setAbierto(!abierto)}>{items.length}</button>; }`), []);
});
