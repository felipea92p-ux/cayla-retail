# 2026-11-26 — Candado contra leer un `const` antes de declararlo

- **Qué:** escáner `scripts/antes-de-declarar/escanear.mjs` + prueba `apps/web/lib/antes-de-declarar.test.ts` (regla en
  `.claude/rules/nextjs.md`). Cuenta solo las lecturas que corren en el momento antes de su declaración (directas, `.find`/`.map`/
  `.filter`…, `useMemo`, valor inicial de `useState`/`useReducer`, función que se llama ahí mismo); ignora `useEffect`,
  `useCallback`, `onClick` y los tipos. Nació de «Cerrar caja» caído en Lima (Sentry CAYLA-RETAIL-1G, PR #2038); trae ese mismo
  arreglo para que la prueba pase sola.
- **Por qué no ESLint:** `@typescript-eslint/no-use-before-define` da 237 avisos en `apps/web`; revisados a mano (LlegoMercaderia,
  RecepcionEnvio, PuntoDeVenta, AppShell, CategoriasLista…), todos corren después. El escáner da 0 en las dos apps y `packages/shared`,
  y sin el arreglo marca exactamente `CerrarCajaModalV2.tsx:88`. Sin lista de deuda: exige cero.
- **Límite:** no sigue una función guardada en una variable y llamada antes de declarar (`const f = () => x; f(); const x = …`);
  escrito en el encabezado del escáner.
