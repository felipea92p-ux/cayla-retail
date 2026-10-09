## 🧵 Producción: modelo nuevo desde la orden (2026-10-07, ADR-0361) — solo web, sin migración; rama `claude/vista-inicial-taller-3c5f9a`

- [x] Rastreo del historial: lo que Felipe recordaba (costeo con tela y avíos, costo por prenda, semáforo 60/40) vive hoy en «Nueva orden»; lo perdido era crear el modelo desde la orden.
- [x] `lib/modelo-nuevo-orden-reglas.ts` (+ prueba de 14): ida y vuelta por la URL (`?desde=produccion&tipo=…` y `?nueva=<modelo>&tipo=…`), con parámetros rotos sin lanzar.
- [x] Nueva orden: enlace «Créalo en Productos y vuelves aquí», tipo preelegido, margen y semáforo del líder sin depender de la red, aviso de modelo sin precio, pista de la matriz hacia Editar producto.
- [x] Nuevo producto → pantalla de éxito: «Abrir la orden de producción/muestra» como salida principal si venía de una orden (sin tocar `NuevoProductoForm.tsx`).
- [x] Tablero sin modelos: «+ Crear el primer modelo» (o a quién pedirlo).
- [x] Verificado en una copia de `main`: `tsc`, `eslint` de lo tocado y las 381 pruebas del web (156 336) en verde; recorrido en el navegador con los componentes reales y datos de ejemplo.
- [ ] **Probarlo contra datos reales en local** (crear un modelo desde la orden, volver y abrir la orden): el recorrido se vio con datos de ejemplo, no con la base.
- [ ] `/chaos`: «Nueva orden» guarda (`abrir_produccion`) y no se atacó a propósito; el alta tampoco cambió, pero el recorrido nuevo (doble clic en el enlace, volver con la pestaña vieja abierta) no se ha probado.
- [ ] `/formidable` y `/focus`: «Nueva orden» sigue `pendiente` en el registro de la guía de foco y en el de `/sugerir` (la deuda de antes de la regla); esta rama no la empeora, pero tampoco la salda.
- [ ] Probar la pantalla de éxito y el tablero a 375 px (Producción es de escritorio, no entra en «celular obligatorio»; aun así conviene mirarlo).
- [ ] Decisión de Felipe, solo si el recorrido de dos pasos resulta lento para el Taller: una RPC atómica «abrir orden con modelo nuevo» (migración en producción). Ver las alternativas del ADR-0361.

### Segunda parte (plan para aprobar con Felipe, 2026-10-09; `/construir` + `/rigor`) — nada de esto está construido

- [ ] **Aprobación del plan por Felipe**, con tres decisiones por defecto: precio obligatorio en Producción y opcional en Muestra; el costo de la variante nace en 0 y el real se pega al cerrar (D-31); el material libre de julio no vuelve (el tejido es vocabulario y lo completa el líder).
- [ ] Función `retail.abrir_produccion_con_modelo_nuevo` (migración aditiva, precedente `censo_crear_variante`): modelo + variantes + orden en una transacción y con un token; tallas y colores validados por conjuntos; llama a `abrir_produccion` sin tocarla. Prueba contra Postgres local.
- [ ] Reglas puras y lectura de tallas y colores en la web (+ pruebas); un nombre repetido selecciona el modelo existente en vez de fallar.
- [ ] «+ Modelo nuevo» dentro de «Nueva orden»; el enlace a Productos queda como «alta completa con fotos».
- [ ] Pasadas obligatorias: `/focus`, `/sugerir`, `/formidable`, `/chaos`.
- [ ] ADR-0361 reescrito y ajuste del punto 5 del ADR-0051.
- [ ] **Hueco encontrado:** la web no tiene pantalla para aprobar o rechazar los productos `pendiente` (`revisar_producto_censo` no tiene quien la llame). Fuera de esta construcción; conviene una tarea aparte.

