## 🗓️ Comparar períodos: la misma tarjeta «PERÍODO ANALIZADO» que Desempeño, y A/B que se recuerdan (2026-09-29, ADR-0277) — solo web, sin migración; rama `claude/periodo-analizado-comparar-c55892`

- [x] **Una sola tarjeta para las dos pestañas:** `MarcoPeriodoAnalizado` + `BloquePeriodo` en `ResumenControles.tsx`
      (contenedor, etiqueta, medidas y buscador compartidos). El HTML de la tarjeta de Desempeño es idéntico al de antes
      (SHA-256); las dos miden 147,5 px a ≥ 1280 px.
- [x] **Comparar:** dos píldoras `pildora-cayla` «Período A/B: fecha → fecha» que abren el mismo `PopoverRango`; buscador
      (`BuscadorDebounced`, mismo `alcance.q`); **sin atajos y sin Categoría** (`leerVistaComparacion` ignora `cat`,
      `ComparacionParaPantalla.categorias` eliminado, «Limpiar filtros» ya no toca `cat`).
- [x] **Avisos dentro de la tarjeta y solo si hay**, todos desde `armarComparacion`: `avisoDelPeriodoA` (nuevo: antes un A
      inválido se sustituía en silencio), `avisoDelPeriodoB` (la advertencia de B con su letra), duración/superposición
      e historial.
- [x] **B con URL propia** (`bdesde`/`bhasta`, `paramsDeComparar`); por defecto B = últimos 30 días y A = los 30 anteriores,
      con el «hoy» de Lima.
- [x] **Persistencia:** `lib/resumen-periodos-guardados.ts` (por sede y persona, sobre `almacen-local`) siembra la URL en el
      clic de la pestaña y al montar Comparar; la URL, si trae fechas, manda. 20 pruebas nuevas en
      `resumen-periodos-guardados.test.ts` y 19 más en `resumen-comparacion` y `resumen-periodo`.
- [x] Verificado en el navegador (base local, `:3030`): medidas a 5 anchos, persistencia (pestañas, menú, enlace directo, F5,
      cambio de sede), búsqueda, categoría ignorada, avisos. `pnpm typecheck`, ESLint y 230 suites (152.779 casos) en verde.
      `.env.local`, `apps/web/.next` y la entrada temporal de `.claude/launch.json` se quitaron al cerrar.
- [ ] **Decisión de Felipe — ¿B hereda el período de Desempeño?** Hoy sí, hasta que se elige B en Comparar (ADR-0138). Si no
      debe heredar nunca: `paramsDeComparar` (una línea) y el traspaso de «7 días → Comparar» deja de existir.
- [ ] **Defecto previo, sin tocar — el selector de fechas no enfoca «Desde» al abrirse** (`PopoverRango`: su `useEffect([])` corre
      antes de que exista el formulario, porque `usePosicionAnclada` mide en `useLayoutEffect` y el primer render devuelve
      `null`). Arreglo: que el efecto dependa de `pos !== null`. Ojo: en el celular abriría el teclado al tocar «Personalizado»,
      «Período A» o «Período B»; hay que decidir si se quiere.
- [ ] **Sin probar:** en una tablet real a 375 px con el teclado del celular (se verificó con el viewport emulado). Y a ≤ 1024 px
      Desempeño queda más alto que Comparar porque su Categoría baja de línea (propio de Desempeño; Comparar ya no tiene esa fila).
- [ ] **Análisis no está en el «Responsive Quality Gate»** (`apps/web/responsive/pantallas/registro.mjs`: solo Existencias,
      Traslados y Vender). Registrarlo daría esta verificación a cualquiera.
