## 🧹 Lo que quedó del Análisis viejo, borrado (2026-10-06, sigue a ADR-0357) — solo web, sin migración; rama `claude/happy-zhukovsky-325b9f`

- [x] **Borradas enteras, con sus pruebas:** `lib/analisis-que-hacer.ts`, `resumen-desempeno.ts`, `resumen-comparacion.ts`, `resumen-lectura.ts`,
      `rotacion.ts`, `resumen-armado.ts`, `resumen-filtros.ts`, `resumen-busqueda.ts`, `resumen-acciones.ts`, `inventario-calidad.ts`,
      `conteo-varianza.ts` y `curva-variantes.ts` (su único lector eran las curvas rotas de `resumen-reglas.ts`), más `resumen-fixtures.ts`
      (fixtures de prueba que ya no usaba ninguna).
- [x] **Podadas, queda lo que usan otras pantallas:** `resumen-inventario.ts` (quedan `getFilasRecientesDeSede`, `getFilasSemanaDeSede` y
      `getVentasDelMesDeSede`; `getFilasVariantes` deja de aceptar la ventana comparada, que nadie pedía: el cuerpo que llega a la base es el
      mismo), `resumen-reglas.ts` (quedan la velocidad y las bandas de cobertura), `resumen-formato.ts`, `resumen-periodo.ts` (fechas de Lima),
      `inventario-exposicion.ts` (queda `historiaDeCohortes`), `inventario-reglas.ts` (salen 21 umbrales del Análisis viejo) y
      `ui/PrendaCelda.tsx` (quedan `SinFoto` y `MiniaturaPrenda`; salen `PrendaCelda` y `ProductoVarianteCelda`, que ya nadie dibujaba).
      Pruebas podadas en `resumen-reglas`, `resumen-formato`, `resumen-periodo` e `inventario-exposicion`; la propiedad de las cohortes se
      conserva, sin la comparación con `armarCohortes`.
- [x] **Nada que mover:** `StockActualPisoAlmacen` (de `resumen-comparacion.ts`) y las constantes de `rotacion.ts` solo las usaban funciones
      de `resumen-formato.ts` que también estaban muertas.
- [x] **Cuentas exactas:** `DEUDA_DE_ANALISIS` de `piso-plan-umbral.test.ts` quedó vacía; `reglas-sin-uso` y `foco-comun` no cambian.
- [x] **Verificado:** `npx tsc --noEmit` sin errores; `vitest run` con 373 archivos y 156.208 pruebas en verde (12 archivos y 460 pruebas
      menos, todas de lo borrado); `eslint` limpio en lo tocado; el grafo por declaración ya no encuentra nada que borrar en estas libs
      (símbolos muertos en `apps/web`: 410 antes de la v4, 701 después, 312 con esta limpieza). En el navegador, con el servidor de este
      worktree (Tienda Lima, líder): Existencias y el panel de una talla, Inicio con el Observatorio y Análisis v4, sin errores de consola
      ni del servidor; `/api/existencias/ventas-del-mes` y `/api/observatorio` responden 200.
- [x] **Docs:** `ARQUITECTURA.md` (Existencias, Conteo, Análisis, «Miniatura + color» y la fila de `fn_resumen_comparacion`), la R-20 de
      `docs/datos/15-COMO-OPERA-CAYLA.md`, una nota en `docs/datos/modulos/13-inteligencia-y-reportes.md` y el pendiente de
      `docs/backlog/2026-10-06-erp-analysis-module-design-c1a525.md`, marcado hecho.
- [ ] **Siguen muertos a propósito** (los nombra código de fuera de este alcance): ~~`formatoSolesCompacto`, que nombra
      `components/DisponibleTotalOverlay.tsx`, también muerto desde antes~~ (borrados los dos el 2026-10-06, rama
      `claude/determined-thompson-f7b8d8`), y `nombreCorto`, que nombra `textoDeSeriesFaltantes`, tolerada en
      `reglas-sin-uso`: queda con la deuda de `SIN_USO_CONOCIDAS` (ver `docs/backlog/2026-10-06-determined-thompson-f7b8d8.md`).
- [ ] **Comentario desactualizado de la v4** (no lo toqué: es de `lib/analisis-*`): `lib/analisis-rinde.ts` dice «La fuente es la que ya usan
      Desempeño y Comparar»; esas pantallas ya no existen.
- [ ] **#808 (Colgar en el piso)** cambia textos dentro de código que esta rama borra (`planDeReposicion`, `ayudaChip`, el comentario de
      `getRedPorVariante` y la deuda de `piso-plan-umbral.test.ts`): si se fusiona después, sus conflictos se resuelven quedándose con el
      borrado.
