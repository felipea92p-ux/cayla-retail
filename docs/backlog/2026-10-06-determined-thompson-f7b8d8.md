## 🧹 El código de `apps/web` que ninguna pantalla usaba, borrado (2026-10-06) — solo web, sin migración ni RPC; rama `claude/determined-thompson-f7b8d8`

- [x] **Archivos borrados (19 + 3 pruebas):** `components/` `AnclarVocabulario`, `ApartarModal`, `BuscarPorComprobante`, `Codigo128`,
      `ComprobanteConfirmacion`, `DisponibleTotalOverlay`, `MovimientoDetalle`, `ResumenVisualizaciones`, `SelectorUbicacion`,
      `alta-producto/ElegirTejido`, `ficha-producto/AjusteDeStock`, `ui/DonaMetodos`, `ui/RevelarAlScroll`, `ui/toggle`; `lib/`
      `facturacion-resumen-graficos` (+ prueba), `ventas-comparativo`, `dona-geometria` (+ prueba), `etiqueta-sede` (+ prueba), `utils`.
      `FinanzasNav`, `ui/TarjetaIndicador` y `ui/TarjetaSenal`, que estaban en la lista, ya los había borrado #851.
- [x] **Lo que solo usaban ellos (22 exportaciones de 9 libs vivas, con sus pruebas):** `apartados-reglas` (`validarApartar`, `sumarDias`,
      `MAX_DIAS_APARTADO`, `DIAS_SUGERIDOS_APARTADO`, `ErroresApartar`), `facturacion-resumen-reglas` (`ventanaDelDiaLima`,
      `ventanaHastaEstaHora`, `horaDeLima`, `VentanaISO`), `movimientos-reglas` (`verboDelResponsable`, `etiquetaEstadoComprobante`,
      `ETIQUETA_ESTADO_DEVOLUCION`), `movimientos-atajos` (`textoEstadoApartado`), `movimientos-saldo` (`textoQuedaron`),
      `existencias-categorias` (`agruparPorCategoria`, `variantesDeCategoria`, `CategoriaResumen`, `VarianteCategoria`, `recortarFilaSemana`;
      queda `deltaDisponibleSede`), `comprobantes-reglas` (`ESTADO_ESTILO`), `resumen-formato` (`formatoSolesCompacto`) y `alta-producto`
      (`fueraDeLaCategoria`). En `globals.css`, la dona (`anim-dona-*` y sus `@keyframes`) y las gráficas viejas del Resumen de Facturación
      (`kpi-viz`, `kpi-spark*`, `kpi-eje`, `kpi-progreso`, `kpi-barras`, `kpi-trazo`, `kpi-llena`).
- [x] **Cuentas exactas:** `MODALES_PENDIENTES_HOY` 60 → 59 y `PENDIENTES_HOY` de sugerir 62 → 61 (los dos por `ApartarModal`),
      `foco-comun` 51 → 50 (el anillo rojo de `AjusteDeStock`); la entrada de `Codigo128` sale de `tema-colores-archivos`.
- [x] **Se quedan a propósito:** `lib/registro-contable.ts` (Análisis v4 importa `IGV_TASA` en `lib/analisis-rinde.ts`), `lib/codigo128.ts`
      (lo importa `scripts/etiquetas/hoja-de-prueba.mjs`, fuera de `apps/web`) y los registros que leen las pruebas
      (`guia-de-foco-pantallas`, `sugerir-archivos`, `tema-colores-archivos`, `piso-plan-fixtures`).
- [x] **Verificado:** el grafo de imports, rehecho sobre `main` (después de #850, #851 y #852), deja huérfanos solo `codigo128` y los cuatro
      registros. Cada PR abierto se fusionó de prueba y se buscó en sus líneas nuevas cada nombre borrado: ninguno los vuelve a usar.
      `tsc` limpio, eslint limpio en lo tocado, `vitest` entero en verde y `pruebas:roles-cobertura` 32/32 contra el Postgres local (el módulo
      «Apartados» no pierde guardián al irse la única llamada a `apartar_prenda`). El CSS compilado por Tailwind, antes y después, solo pierde
      reglas que nombraban los archivos borrados; ninguna pantalla viva arma esas clases por partes.
- [x] **Docs:** `ARQUITECTURA.md` (el overlay de Existencias y quién abre «Ajustar stock» en Editar producto), `docs/datos/00-MAPA.md`,
      `11-KPIS.md` y `modulos/01-identidad-y-acceso.md` (ya no apuntan a `etiqueta-sede.ts`), nota en ADR-0045 (salen `RevelarAlScroll`,
      `toggle` y `lib/utils`; `components.json` no cambia). Pendientes resueltos tachados en `BACKLOG.md` (`etiquetaSede`, la dona) y en los
      backlogs del 2026-09-29, 2026-10-01 (×2), 2026-10-02 y 2026-10-06 (`formatoSolesCompacto`).
- [ ] **Decisión de Felipe — el destello de «comprobante saldado»:** `lanzarChispas` y `BotonConfirmar`
      (`components/ComprobanteBotonConfirmar.tsx`, con `chispasDe` y el CSS `cd-chispa`) no se ven en ninguna pantalla desde el 2026-09-19:
      las fusiones paralelas de Comprobantes y Por pagar (#187, #189, #193) dejaron los modales de pago sin `useConfirmacionPago`, que es
      lo que los encendía. No los borré: o vuelven a los modales de pago (ADR-0136 los diseñó así) o se borran en otra limpieza.
- [ ] **Decisión de Felipe — `apartar_prenda`:** la RPC ya no tiene quién la llame desde la web (la llamaba solo `ApartarModal`; hoy se aparta
      desde el módulo Apartados con otras funciones). Su clave sigue en `retail.acciones_sin_responsable` y en el espejo
      `lib/responsable-omitido.ts`. Quitarla de las dos es una migración: no entra aquí.
- [ ] **Código muerto que queda, ya registrado:** las 22 funciones de `SIN_USO_CONOCIDAS` (`lib/reglas-sin-uso.test.ts`), más
      `nombreCorto` (`lib/resumen-formato.ts`), que solo nombra una de ellas (`textoDeSeriesFaltantes`). Otra limpieza, con su propio PR.
- [ ] **#808 (Colgar en el piso)** choca con este PR en `MovimientoDetalle.tsx` (aquí se borra, allá se cambia un comentario) y en la línea
      vecina a `ApartarModal` en `guia-de-foco-pantallas.ts`: se resuelve quedándose con el borrado.
