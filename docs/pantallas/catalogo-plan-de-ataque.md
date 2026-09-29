# Plan de ataque — Catálogo (Productos, Categorías, Marcas, Atributos)

> Fecha: 2026-09-29 · SHA: `38f9d7ce` (origin/main) · Autor: análisis con `/pantalla` y `/explica` sobre las cuatro pantallas de Catálogo y el ciclo de vida del producto · **Solo propone: no se tocó código, migraciones ni BACKLOG.** Ejecutar es un paso aparte que ordena Felipe («haz la Ola 0», «haz de la #1 a la #4 de Marcas»).
> Lectura en este orden: (1) `catalogo-base-conceptual.md` (por qué los candados van en la base), (2) este plan, (3) el análisis de la pantalla que se vaya a trabajar.
> Datos: código leído en `123bb733` (origen/main solo avanzó en `ProductoCreado.tsx`); producción consultada con `SELECT`s de solo lectura hechos por el agente en la sesión, **no por Felipe** — el apéndice los lista para que los confirme; recorrido visual en local.

## 0 · Las cinco pantallas de un vistazo

| Pantalla | Archivo | Cumple su finalidad | Relevancia | Lo peor, en una línea |
|---|---|---|---|---|
| Productos (listado) | `productos.md` | 6,9 | 6,8 · Soporte | «Cuánto hay» aún sale de tres caminos; «A quién pedirle» subcuenta y puede tumbar la pantalla |
| Alta, edición, historial y eliminación | `productos-ciclo-de-vida.md` | **5,0** (tope) | 7,8 · Soporte | Precio 0 solo se impide en el formulario, y el censo de mañana no usa el formulario |
| Categorías (y Familias) | `productos-categorias.md` | 7,1 | 5,8 · Comodidad | «Exige tejido y patrón» solo se cambia con SQL; guardar categoría son dos llamadas |
| Marcas | `productos-marcas.md` | 6,3 | 4,4 · Comodidad | No hay marca «Por identificar» para la carga de mañana; «CAYLA» hace de comodín |
| Atributos (6 pestañas) | `atributos.md` | **5,0** (tope) | 5,6 · Comodidad | Una campaña con descuento se guarda sin confirmar, sin fechas y sin rastro; hoy las dos que hay no llegan a nadie |

Los análisis previos de Productos, Categorías y Atributos (21-sep) estaban **vencidos** y se reescribieron; Marcas y el ciclo de vida son **primeros análisis**. Cada archivo conserva su historial y marca qué se cerró de las 12 tareas anteriores.

## 1 · Lo que cambió el terreno hoy (y por qué manda el orden)

- **TRU abre mañana** y su catálogo entra por **censo físico en lotes** (auditoría del 29-sep, decisión D2): no por el formulario de cuatro pasos, sino llamando a `crear_producto_con_stock_inicial`. Toda regla que solo cuida el formulario deja de valer.
- **Producción hoy tiene 2 productos** (uno es el centinela «Prenda sin registrar») y, en cambio, **85 marcas** (83 sin productos), **44 categorías activas** (43 sin productos), 77 colores (4 en uso) y 30 tallas (1 en uso). Lo que se ve en local (10 productos, 1 marca) **no** es lo que se verá.
- **Decisiones abiertas de la auditoría** que las pantallas necesitan: D4 (tejido vacío en lo sin dato) y D5 (marca desconocida → «Por identificar»).
- **Ya cerrado desde el 21-sep:** los candados de tabla de Categorías (`categorias_vigencia_candados`) y de Marcas, la identidad de variantes, ADR-0270 (una sola cifra de stock, en producción desde el 28-sep) y el aprobar de etiquetas con comentario.
- **Hay 1 497 commits en `main` desde el 21-sep** y varias filas de `docs/SESIONES-ACTIVAS.md` son de ramas ya fusionadas: antes de empezar cualquier paquete hay que volver a mirar el tablero.

## 2 · Las ocho raíces: un defecto en varias pantallas es una sola tarea

Regla del skill: el mismo defecto en 3 o más pantallas es **una** tarea raíz. Se resuelven una vez y las tareas de cada pantalla que las nombran quedan cubiertas.

| Raíz | Qué es | Dónde aparece | Decisión que la cierra |
|---|---|---|---|
| **R1 · Historial del catálogo** | Nadie guarda quién cambió una marca, un descuento o el nombre de un producto | Marcas #4, Atributos #4, Ciclo #7 | **DECIDÍ:** una sola tabla de historial de vocabulario (campo, valor anterior, valor nuevo, responsable, hora) escrita por las RPC. **DESCARTÉ:** una tabla por pantalla (marcas, etiquetas, categorías…): ocho tablas de la misma forma y dos formas de leerlas. **SE ROMPE SI:** una migración futura vuelve a editar por `UPDATE` directo y se salta el historial: el `UPDATE` directo debe quedar sin permiso, solo por RPC. |
| **R2 · Palabras que prometen lo que la base no cumple** | Textos que afirman algo falso o viejo | Atributos #2 y #3 («de inmediato», «Top ventas medido»), Ciclo #8 («queda a su nombre», costo «Opcional» → 0), Marcas #8 y Categorías (comentarios y mensajes «Solo un Líder») | Reescribir cada texto con lo que hace el código; revisar los nombres de políticas `*_write_lider` que hoy usan `fn_puede_editar_catalogo()`. |
| **R3 · El candado vive en la pantalla y debería vivir en la tabla** | Reglas cuidadas solo por el formulario o la API | Ciclo #1 (precio 0), Marcas #3 (clave de marca sin puntuación), Categorías #3 (INSERT, padre e hijas), Atributos #1 y #8 (fechas de campaña, nombre vacío) | Un candado de tabla por cada uno (ver `catalogo-base-conceptual.md`). |
| **R4 · Dos números para lo mismo** | Dos cifras que dicen algo distinto de la misma cosa | Productos #1 (stock) y #7 (margen: 30 / 45 / 40–60 %), Marcas #2 (cuenta el centinela), Categorías #4 (cabecera vs tarjetas) | Una sola función/regla por cifra, con la guardia de `stock-una-sola-cifra.test.ts` extendida. |
| **R5 · Un botón se ofrece y la base lo rechaza** | La persona pulsa y recién ahí sabe | Marcas #5 («Desactivar»), Categorías #5 y #9, Productos #4 («Editar») | Preguntar a la base antes de ofrecer, como ya hace `EliminarProductoModal` (el modelo a copiar). |
| **R6 · Dos caminos para lo mismo** | Dos implementaciones de una misma tarea | Marcas (supabase-js directo vs. rutas `/api`), Categorías #8 y el alta (dos editores de ejes), Atributos #6 y #12 (`Tejidos ≈ Patrones`), Productos #9 (dos fichas), Ciclo #2 y #10 (tres caminos de alta, tres matrices) | Elegir uno y borrar el otro; una de las dos está mal aunque funcionen. |
| **R7 · Higiene del vocabulario de producción** | Restos de prueba y comodines sin definir | Categorías #7 («dsa», «prueba Lapicero»), Marcas #1 y marcas «Prueba», «prueba marca1», decisión D4 | Desactivar (no borrar) lo de prueba; crear «Por identificar» con criterio único. |
| **R8 · Una sola fuente legible del SQL vivo** | Cinco capas de parches sobre una función; nombres de políticas que mienten | Ciclo #3 y #4, Categorías #3, Marcas #3 | Es la **C1 de la auditoría del 29-sep**; va antes de tocar `catalogo_actualizar_producto`. |

## 3 · Orden de ataque, por olas

Esfuerzo: **S** ≈ 30–60 min · **M** ≈ 2–4 h · **L** ≈ 1–2 días. Cada tarea ya trae en su análisis «cómo lo verificas tú».

### Ola 0 — Antes de abrir caja en TRU (mínimo recomendado: unas 4–5 h)
Es lo que puede **frenar o contaminar** el censo. Nada de esto es cosmética.

| # | Tarea | Esfuerzo | Necesita |
|---|---|---|---|
| 0.1 | **Marcas #1** — marca y proveedor «Por identificar» | S | Decisión D5 |
| 0.2 | **Categorías #7** — desactivar «dsa», «prueba Lapicero» (y marcas «Prueba», «prueba marca1») y avisar del prefijo permanente | S | Ok de Felipe (dato de producción) |
| 0.3 | **Ciclo #1** — `CHECK (precio > 0 or not activo)` + rechazo en las tres RPC de alta | M | Ok de Felipe antes de pegar (migración) |
| 0.4 | **Categorías #1** — interruptor «Exige tejido y patrón» en Familias | S–M | Decisión D4 (solo si se elige apagar la regla) |
| 0.5 | *Opcional:* **Marcas #3** — `fn_clave_marca` + índice único (hoy 0 colisiones entre las 85) | M | Ok de Felipe antes de pegar |

Regla: **ninguna migración se pega en producción sin el ok puntual de Felipe** (memoria del proyecto: «confirmar antes de migrar producción»). Se prepara y se ensaya en local; se pega por partes.

### Ola 1 — Semana 1, con el catálogo real ya cargado
Correcciones chicas de alto retorno, casi todas solo de web.

- **Productos:** #1 y #9 (un solo «cuánto hay» y una sola ficha, van juntos) · #4 («Editar» solo a quien puede) · #5 (sin foto: ni «MUESTRA» ni pared de perchas) · #3 · #8.
- **Marcas:** #2 (cifra y enlace) · #5 · #6 · #10.
- **Categorías:** #3 (candados que faltan) + #6 (su prueba en CI) · #4 · #5 · #9.
- **Atributos:** #1 (freno del descuento; **antes del 2026-10-01** si Felipe quiere que las campañas funcionen) · #2 (datos) · #3 (copy) · #5 · #10.
- **Ciclo de vida:** #2 (tres caminos, mismas reglas) · #5 · #8 · #9.

### Ola 2 — Semanas 2 y 3: lo estructural
- **R8 (C1 de la auditoría)** primero. Después:
- **R1 · Historial único:** Marcas #4, Atributos #4, Ciclo #7 (una migración, tres pantallas).
- **Ciclo #3 y #4** (editar sin «reemplaza todo», versión obligatoria, una transacción) y **#6** (fotos).
- **Categorías #2** (guardar datos y ejes de una vez) y **#8** (un solo editor de ejes).
- **Atributos #6 y #7** (un solo comportamiento entre pestañas; bandeja «Por aprobar») y **#8** (candados de nombre).
- **Marcas #7** (fusionar) y **#11**; **Productos #2** y **#6**; **Productos #7** cuando Felipe decida el margen; **Ciclo #10**.

### Ola 3 — Decisiones de Felipe y bajo valor
- Los cinco **«Replantear»** (cada uno pide una decisión, no un cambio): Marcas #9, Categorías #10, Atributos #9, Productos #11, Ciclo #11.
- Las tareas rotuladas «bajo valor / opcional» de cada pantalla.

## 4 · Cómo se trabaja cada pantalla (paquetes de trabajo)

Un paquete = un PR pequeño y verificable (principio 7). Se hace en una rama nueva `claude/catalogo-<paquete>` desde `origin/main`.

### Marcas (`productos-marcas.md`)
| Paquete | Tareas | Tipo | Antes de empezar |
|---|---|---|---|
| **M1 · Comodín** | #1 | Dato + prueba local | D5 |
| **M2 · Honestidad de la pantalla** | #2, #5, #6, #8, #10 | Web | Nada |
| **M3 · Clave de marca** | #3 | Migración (una parte) | ok Felipe; comprobar 0 colisiones justo antes |
| **M4 · Historial y fusión** | #4, #7, #11 | Migración + RPC + web | R1 y R8 |
| **Decidir** | #9 (¿marca como dimensión de análisis?) | Pregunta | Catálogo real cargado |

### Categorías y Familias (`productos-categorias.md`)
| Paquete | Tareas | Tipo | Antes de empezar |
|---|---|---|---|
| **C1 · Antes del censo** | #7, #1 | Dato + web S | D4 |
| **C2 · Candados de tabla** | #3, #6 | Migración (disparadores, sin políticas) + CI | ok Felipe; R8 |
| **C3 · Honestidad de la pantalla** | #4, #5, #9 | Web | Nada |
| **C4 · Guardar bien** | #2, #8 | RPC + web | C2 |
| **Decidir** | #10 → #11 → #12 | Pregunta y web | Nada |

### Atributos (`atributos.md`)
| Paquete | Tareas | Tipo | Antes de empezar |
|---|---|---|---|
| **A1 · Campañas con freno** | #1, #2 | Migración (`CHECK`) + RPC + web + dato | ok Felipe; **fecha: 2026-10-01** |
| **A2 · Palabras y bordes** | #3, #5, #10 | Web | Nada |
| **A3 · Candados y rastro** | #8, #4 | Migración | R1 (para #4) |
| **A4 · Un solo comportamiento** | #6, #7, #12 | Web (grande) | A2 |
| **Decidir** | #9 (etiquetas calculadas o manuales) | Pregunta | Nada |

### Productos, listado (`productos.md`)
| Paquete | Tareas | Tipo | Antes de empezar |
|---|---|---|---|
| **P1 · Un solo «cuánto hay»** | #1, #9, #4 | Web | Nada |
| **P2 · Catálogo nuevo se ve bien** | #5, #8, #3, #10 | Web | Nada |
| **P3 · Bloque coherente** | #6, #7 | Web | Decisión de margen (#7) |
| **P4 · Reposición** | #2 | RPC + web | Decisión #11 |
| **Decidir** | #11 (¿«A quién pedirle» en Productos o en Compras?) | Pregunta | Nada |

### Ciclo de vida del producto (`productos-ciclo-de-vida.md`)
| Paquete | Tareas | Tipo | Antes de empezar |
|---|---|---|---|
| **V1 · Precio en la base** | #1, #2 | Migración + RPC | ok Felipe; **antes del censo** |
| **V2 · Alta y editor honestos** | #5, #8, #9 | Web | Nada |
| **V3 · Editar sin sorpresas** | #3, #4, #6 | RPC (varias capas) + web | R8 (C1) |
| **V4 · Historial y limpieza** | #7, #10, #12 | Migración + web | R1 |
| **Decidir** | #11 (¿ficha de solo lectura?) | Pregunta | Catálogo real y ventas |

## 5 · Cómo se hace cada paquete (pasos verificables)

1. **Terreno:** `git fetch origin`; leer `docs/SESIONES-ACTIVAS.md` y agregar la fila del paquete; comprobar los números de ADR y migración contra los **PR abiertos** (memoria: en este repo dos sesiones ya tomaron el mismo número). Un solo paquete por rama.
2. **Si toca la base:** migración con prefijo `retail.` y `set search_path`; partes separadas si mezcla `alter` de tablas en uso con políticas (`CLAUDE.md`, «Políticas y deadlocks»; los disparadores se crean con `create or replace trigger`); prueba SQL en `scripts/pruebas/` con su paso en el CI; **ensayo revertible en local**; pedir el ok puntual de Felipe; pegar; verificar por huella (`md5` del `prosrc`) y refrescar el diccionario con `pnpm datos:generar:produccion`. Una migración no está terminada hasta que su tabla está en el diccionario.
3. **Web:** cambio mínimo con las piezas que ya existen (`<Modal>`, el kit de Atributos, `<EncabezadoPagina>`); nada de hex sueltos, nada de otro loader.
4. **Verificar como lo haría Felipe:** navegador integrado a **1073 px** (y a **375 px** solo si toca Vender, Cambios o Devoluciones), con captura; para correr un servidor propio hace falta copiar `apps/web/.env.local` a este worktree (lo corre Felipe, no yo). Cada tarea trae en su análisis el «cómo lo verificas tú».
5. **Cerrar:** entrada en `docs/bitacora/AAAA-MM-DD-<tema>.md` y sección en `docs/backlog/AAAA-MM-DD-<tema>.md` (ADR-0259: una entrada, un archivo); ADR el mismo día si hubo decisión estructural; commit `feat(catalogo): …` o `fix(catalogo): …`; PR. **Fusionar a `main` en este repo es publicar**: lo decide Felipe.

## 6 · Decisiones que necesito de Felipe (por orden de urgencia)

**Regla:** tu informe de triage de la auditoría del 29-sep ya trae una opción recomendada para D4 y D5. Si la mía difiere de esa, **gana la tuya**.

### Decisión 1 — D5: una prenda cuya marca nadie conoce
| Opción | Ganas | Pagas |
|---|---|---|
| **A · Marca y proveedor «Por identificar» (recomendada)** | Es visible y se puede filtrar (`/productos?marca=`) para regularizar; no ensucia «CAYLA» | Aparece en el selector para todas; hay que regularizar después |
| B · Seguir usando «CAYLA» | Cero trabajo | La marca propia se mezcla con lo desconocido; ya pasa con el centinela y la cifra de la marca sale falsa |
| C · Dejar `marca_id` nulo | Honesto | Rompe la llave compuesta y «A quién pedirle»; un `if` en cada reporte |

**Si no respondes:** preparo la opción A en local (dato y ensayo), sin pegarla en producción.

### Decisión 2 — D4: tejido y patrón de lo que no se sabe (Indumentaria los exige)
| Opción | Ganas | Pagas |
|---|---|---|
| **A · Valores «Por identificar» en tejido y patrón, regla encendida (recomendada, coherente con la Decisión 1)** | Nada se relaja; queda una cola visible para regularizar | Dos valores más en los selectores |
| B · Apagar «Exige tejido y patrón» durante el censo (interruptor en Familias) y volver a encenderlo | Cero valores falsos | Todo lo cargado en ese lapso queda sin tejido salvo que se regularice |
| C · Mantenerlo obligatorio y pedir el tejido en el censo | Dato completo | Frena la carga: quien cuenta no siempre lo sabe |

**Si no respondes:** preparo el interruptor de Categorías #1 en local, pero la regla sigue encendida en producción y no cambio ningún dato.

### Decisión 3 — Las dos campañas de hoy no llegan a ninguna prenda
«Aniversario CAYLA» (10 %, del 1 al 14 de octubre) y «Para liquidar» (20 %, hasta el 1 de octubre) tienen 0 prendas etiquetadas y 0 categorías alcanzadas. ¿**A qué categorías o prendas deben llegar?** (A) elegirlas hoy desde Atributos ▸ Configurar campaña (no requiere código), (B) dejarlas sin efecto y ajustar fechas, (C) desactivarlas. **Si no respondes:** no toco ninguna campaña (es dinero en caja); dejo el freno de la #1 de Atributos para la Ola 1.

### Decisión 4 — ¿Empiezo por la Ola 0?
**Recomiendo:** sí, en este orden: **0.1 → 0.2 → 0.3** (y 0.4 solo si eliges B en la Decisión 2). **Si no respondes:** empiezo por lo único que no depende de nadie y no toca producción: **preparar en local el paquete V1** (candado de precio 0 con su prueba, sin pegarlo).

Las decisiones «Replantear» y la del margen sano (30 / 45 / 40–60 %) **no urgen**: van en la Ola 2–3.

## 7 · Lo que no pediste y pesa más (una sola cosa)

**La carga de mañana no pasa por ninguna de estas pantallas.** Las cinco pantallas están bien vigiladas por dentro; el censo llama directamente a `crear_producto_con_stock_inicial`, que acepta precio 0, cualquier marca activa y exige tejido y patrón en Indumentaria. Por eso la Ola 0 son candados de base y decisiones de comodín, no mejoras de pantalla. Lo demás puede esperar; esto no.

## 8 · Fuera de las pantallas: un hallazgo que no está en el repo

Un hallazgo de acceso a datos del historial de producto se entregó a Felipe **en el chat** y **no se escribe en ningún archivo del repo** mientras el repo sea público (misma regla que usa la auditoría del 29-sep para su informe de seguridad). Cuando se cierre, se documenta.

## 9 · Líneas propuestas para el backlog (raíces)

Las líneas de cada tarea están al final de cada análisis, con la etiqueta `[pantalla:<slug>]`. Felipe aprueba antes de pasarlas a un archivo de `docs/backlog/` (ADR-0259).
- [ ] `[plan:catalogo]` R1 Historial único del catálogo — M
- [ ] `[plan:catalogo]` R2 Reescribir las palabras que prometen lo que la base no cumple — S
- [ ] `[plan:catalogo]` R3 Candados de tabla: precio 0, clave de marca, categorías, campañas, nombres — M (varias migraciones)
- [ ] `[plan:catalogo]` R4 Una regla por cifra (stock, margen, cuenta de marcas, cabecera de categorías) — M
- [ ] `[plan:catalogo]` R5 Preguntar a la base antes de ofrecer el botón — S
- [ ] `[plan:catalogo]` R6 Un solo camino para cada tarea (ejes, fichas, matrices, altas) — L
- [ ] `[plan:catalogo]` R7 Higiene del vocabulario de producción — S
- [ ] `[plan:catalogo]` R8 Una sola fuente legible del SQL vivo (= C1 de la auditoría) — L

## Apéndice · Consultas de solo lectura ejecutadas en producción (2026-09-29)

Proyecto `cayla-dynamic` (id en la memoria del proyecto), schema `retail`. **Solo `SELECT`.** Felipe puede repetirlas en el SQL Editor para confirmar cada cifra. Ninguna toca datos personales (no leen `comprobantes`, `proformas` ni `public.personas`).

1. **Volumen** — conteos de `productos`, `variantes`, `categorias`, `familias`, `marcas`, `marca_proveedores`, `proveedores`, `colores`, `tallas`, `tejidos`, `patrones`, `etiquetas`, `variante_etiquetas`, `etiqueta_categorias`.
2. **Los productos que hay** — `referencia`, `estado`, `es_prueba`, fecha, variantes, stock y movimientos de cada producto.
3. **RLS y disparadores** — `pg_class.relrowsecurity` y conteo de `pg_policies`; `pg_trigger` de las tablas de Catálogo.
4. **Restricciones e índices únicos** — `pg_constraint` (`CHECK` y `UNIQUE`) y `pg_indexes` (`unique`) de las tablas de Catálogo.
5. **Marcas** — total, activas, con 0 productos (83 de 85), sin proveedor, con más de un proveedor, y claves duplicadas tras normalizar la puntuación (0); marcas con productos; marcas de nombre comodín (0); proveedores que comparten nombre con una marca (12).
6. **Categorías** — total, activas, sin productos (43 de 44), productos activos colgando de una desactivada (0), activas sin familia o prefijo (0), sin tallas (2: «dsa» y «prueba Lapicero»), sin tejidos por familia, subcategorías (2).
7. **Atributos** — colores/tallas totales, activos y usados; tejidos y patrones; etiquetas por estado, con descuento (2) y vigencia; `variante_etiquetas`; temporadas; el texto de las `notas` de las etiquetas de rotación.
8. **Etiquetas con descuento** — nombre, estilo, `descuento_pct`, fechas, variantes etiquetadas y categorías alcanzadas.
9. **Restos de prueba** — nombres sospechosos en categorías, marcas, colores, tejidos, patrones, tallas, etiquetas y proveedores.
10. **Auditoría** — tablas de historial existentes (`roles_historial`, `configuracion_historial`, `colaboradores_historial`, `costo_historial`, `historial_producto_cambios`…), columnas de autoría de `etiquetas`, políticas de `marcas`, cuerpo de `fn_clave_texto`.
11. **Cola de aprobación** — `estado` de colores, tallas, tejidos, patrones, etiquetas y `estado_alta` de productos (todo `aprobado`).
12. **Una consulta de permisos** cuyo resultado se entregó a Felipe en el chat (ver §8); no se leyó ningún costo real.
