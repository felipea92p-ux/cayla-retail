---
paths:
  - "apps/**/*.ts"
  - "apps/**/*.tsx"
---

## Server Components y archivos "use client" (salió de «Movimiento y modales»)

**Server Components y archivos `"use client"`:** un Server Component solo puede *renderizar* componentes cliente o pasarles
props serializables; NUNCA llames desde el servidor a una función exportada por un archivo `"use client"` (Next lanza
«Attempted to call X() from the server but X is on the client» y la pantalla se cae). La lógica pura va en `lib/*.ts` y se
importa desde ambos lados.

## Leer antes de declarar (regla — 2026-11-26, Sentry CAYLA-RETAIL-1G)

**Un `const` o un `let` no se lee, en el momento, antes de la línea que lo declara.** «Cerrar caja» se cayó en Lima porque
`CerrarCajaModalV2` hacía `cierresAliadas?.find((c) => … destino …)` antes de `const [destino] = useState(…)` (PR #2038): JavaScript lanza
«Cannot access 'X' before initialization» y la pantalla entera se cae. TypeScript solo lo ve si la lectura es directa; dentro de una
función (`.find`, `.map`, `useMemo`, el valor inicial de `useState`) se calla. Lo que corre después (`useEffect`, `useCallback`, un
`onClick`) no hace daño. Lo vigila `lib/antes-de-declarar.test.ts` con el escáner `scripts/antes-de-declarar/escanear.mjs` (definición
única; `node scripts/antes-de-declarar/escanear.mjs` lista los casos). Sin deuda: exige cero. Se arregla moviendo la declaración más
arriba; una lectura que de verdad no corre en el momento se marca en su línea: `// antes-de-declarar: <por qué>`. No se usa
`no-use-before-define` de ESLint: en este repo da 237 avisos, casi todos por lecturas que corren después.
