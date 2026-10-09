## 🧵 Producción: modelo nuevo desde la orden (2026-10-07 y 2026-10-09, ADR-0361) — primera parte solo web; segunda parte con migración aditiva; rama `claude/vista-inicial-taller-3c5f9a`

### Primera parte (2026-10-07): ida y vuelta entre la orden y el alta — construida

- [x] Rastreo del historial: lo que Felipe recordaba (costeo con tela y avíos, costo por prenda, semáforo 60/40) vive hoy en «Nueva orden»; lo perdido era crear el modelo desde la orden.
- [x] `lib/modelo-nuevo-orden-reglas.ts` (+ prueba de 14): ida y vuelta por la URL (`?desde=produccion&tipo=…` y `?nueva=<modelo>&tipo=…`), con parámetros rotos sin lanzar.
- [x] Nueva orden: tipo preelegido, margen y semáforo del líder sin depender de la red, aviso de modelo sin precio, pista de la matriz hacia Editar producto.
- [x] Nuevo producto → pantalla de éxito: «Abrir la orden de producción/muestra» como salida principal si venía de una orden (sin tocar `NuevoProductoForm.tsx`).

### Segunda parte (2026-10-09): «Modelo nuevo» dentro de «Nueva orden» — construida (Felipe aprobó el plan: «aprobado el plan, hazlo»)

Decisiones por defecto que Felipe aprobó con el plan: precio obligatorio en una producción y opcional en una muestra; el costo de la variante nace en 0 y el real se pega al cerrar (D-31); el material libre de julio no vuelve (el tejido es vocabulario y lo completa quien edita el catálogo); lo puede crear quien opera el Taller, y el modelo nace `pendiente` si no edita el catálogo.

- [x] `supabase/migrations/20261009120000_abrir_produccion_con_modelo_nuevo.sql`: función `retail.abrir_produccion_con_modelo_nuevo` (aditiva, precedente `censo_crear_variante`): modelo + variantes + orden en una transacción y con un token; tallas y colores validados por conjuntos; llama a `abrir_produccion` sin tocarla.
- [x] `scripts/pruebas/abrir_produccion_con_modelo_nuevo.mjs` (20 casos contra el Postgres local, todos con `ROLLBACK`), `pnpm pruebas:abrir-produccion-modelo-nuevo` y su paso en el CI.
- [x] `lib/modelo-nuevo-reglas.ts` (+ prueba de 40, con dos pruebas de azar con semilla fija y la paridad de nombres con la migración y los tipos generados) y `getVocabularioModeloNuevo`.
- [x] «Modelo nuevo» dentro de «Nueva orden» (`ModeloNuevoCampos.tsx`, guía de foco); un nombre repetido ofrece «Usar ese modelo» y uno casi igual «Es otro modelo, crearlo igual»; el tablero sin modelos ofrece «+ Crear el primer modelo»; el enlace a Productos queda como alta completa con fotos.
- [x] `/focus` y `/sugerir`: «Nueva orden» pasó de `pendiente` a aplicada en el registro de la guía de foco y en la deuda de `/sugerir` (contadores 61 → 60 y 58 → 57); nota de ejemplo según el tipo de orden (`lib/sugerencias-orden-produccion.ts`).
- [x] ADR-0361 reescrito y ajuste del punto 5 del ADR-0051.
- [x] Verificado en una copia de `main`: `tsc` y `eslint` en 0; 387 archivos / 156.458 pruebas del web; en el navegador, con los componentes reales y un servidor simulado: éxito, nombre repetido, casi igual, función ausente, vocabulario caído y sin modelos. El recorrido encontró y corrigió un error real (los botones del aviso reenviaban el formulario: faltaba `type="button"`), con prueba de regresión.

### Pendiente — en este orden

- [ ] **Felipe: pegar la migración `20261009120000` en producción ANTES de fusionar y publicar la web.** Una sola parte (solo una función y sus permisos), idempotente; ensayar antes con `begin; …; rollback;`. Verificar después con `select proname from pg_proc where proname = 'abrir_produccion_con_modelo_nuevo'` (1 fila). Si la web sale antes, «Modelo nuevo» avisa en una frase que aún no está activo y no se cae.
- [ ] **Probarlo contra datos reales en local** (crear un modelo desde la orden como líder y como colaborador del Taller sin permiso de catálogo, volver y abrir la orden): todo el recorrido del navegador se hizo con datos de ejemplo, no con la base.
- [ ] `/chaos`: «Nueva orden» guarda y no se atacó a propósito (doble clic en «Crear modelo y abrir orden», volver con la pestaña vieja abierta, perder la red a mitad). El token cubre el doble envío en la base; falta verlo en el navegador. **Espera el OK de Felipe antes de cambiar nada.**
- [ ] `/formidable` sobre la hoja «Nueva orden» (ahora más larga): **espera el OK de Felipe antes de cambiar nada.**
- [ ] Mirar la hoja y el tablero a 375 px (Producción es de escritorio, no entra en «celular obligatorio»; aun así conviene).
- [ ] **Hueco encontrado:** la web no tiene pantalla para aprobar o rechazar los productos `pendiente` (`revisar_producto_censo` no tiene quien la llame). Los modelos que cree el Taller quedarán `pendientes` hasta entonces. Fuera de esta construcción; conviene una tarea aparte.
- [ ] La rama partió de `main` en `d6acc5ce`; `main` ya avanzó. Al abrir el PR puede pedir ponerse al día; los dos contadores de `lib/guia-de-foco-pantallas.ts` y `lib/sugerir-archivos.ts` son los que más chocan (sumar a mano).
