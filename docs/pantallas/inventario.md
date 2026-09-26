# Pantalla — Existencias (`/inventario`)

> Modo: completo · Fecha: 2026-09-26 · Rol/sede: líder, Tienda TRU (escritorio, ~1.490 px; la operación de piso también se hace desde tablet y celular) · Datos: **real** — las consultas de producción las corrió un agente en solo lectura con la herramienta MCP (proyecto `cayla-dynamic`, schema `retail`); **no las pegó Felipe**. Repetí yo las que sostienen las conclusiones (45 filas y 5 marcas visibles; 4/41/0/0 por estado; argumentos de las 4 RPC de escritura; `fn_resumen_variantes` sin `es_prueba`; `cantidad_apartada` existe). Felipe puede confirmarlas con las consultas del apéndice, al final.
> SHA analizado: `306a30f9` (origin/main del análisis) **más el PR #461** (`bd01a83e`, «código de etiqueta en vez de sku vacío»), presente en la rama `claude/existencias-busqueda-marca`. Al escribir este archivo `origin/main` ya es `7f95666a` y `git diff HEAD origin/main` sobre `page.tsx`, `InventarioPanel.tsx`, `inventario-v2.ts`, `filtro-busqueda-especial.ts` y `PrendaCelda.tsx` está vacío. Si esos archivos cambian después, este análisis está vencido.
> Archivos: `apps/web/app/(app)/inventario/page.tsx` · `components/InventarioPanel.tsx` · `components/ui/PrendaCelda.tsx` · `components/ReponerPisoModal.tsx` · `AjustarInventarioModal.tsx` · `ApartarModal.tsx` · `ResolverDanadosModal.tsx` · `DisponibleTotalOverlay.tsx` · `AnalisisCoberturaOverlay.tsx` · `RecomendacionesOverlay.tsx` · `lib/inventario-v2.ts` · `lib/inventario-reglas.ts` · `lib/filtro-busqueda-especial.ts` · `lib/existencias-categorias.ts` · `lib/existencias-recomendaciones.ts` · `lib/resumen-inventario.ts` · RPC `mover_interno`, `registrar_movimiento`, `apartar_stock`, `liberar_apartado`, `listar_apartados`, `resolver_prenda_danada`, `liquidar_prenda_danada`, `fn_stock_por_sede_json`, `fn_resumen_variantes_json` · tablas `stock`, `movimientos`, `variantes`, `productos`, `marcas`, `categorias`, `sububicaciones`, `transferencia_items`, `prendas_danadas`, `apartados`
> Otra sesión tocándola: **sí** — PR #445 «reestructura Existencias para operación de piso» (rama `claude/inventario-comportamiento-piso-almacen`, abierto el 2026-09-26, `CONFLICTING`, 24 archivos, +1.783/−491) reescribe `page.tsx`, `InventarioPanel.tsx`, `inventario-v2.ts`, `inventario-reglas.ts` y `existencias-recomendaciones.ts`. Últimos commits sobre la pantalla: `07c2ae66` (cabecera común), `ec447684` (otra sede: nada que escriba), `86d16bd4` (modal de piso), `60d5aa4d` (#440, «Retirar del piso»). El PR #464 (eliminar una marca sin productos) no toca la pantalla pero sí el ciclo de vida de la marca que ella mostraría. `docs/SESIONES-ACTIVAS.md` no trae ninguna fila vigente sobre esta ruta (las de Inventario son del 19 al 22 de septiembre).
> **Ejecución (2026-09-26):** Felipe pidió arreglar «la búsqueda por marca». Se construyeron las tareas **#3** (motor con marca y categoría, con relevancia), **#4** (filtro «Marca», marca en la fila y en el CSV) y **#5** (estado vacío que explica), en la rama `claude/existencias-busqueda-marca` (PR aparte). Pasaron una revisión adversarial de cuatro lentes cuyos hallazgos están corregidos: la lectura de catálogo que habría fallado en producción para toda cuenta (`variantes!inner(count)` exige leer `costo`, que `authenticated` no puede), un color («dorada») que traía toda la marca «Doradas Chic», separadores de marca y categoría («/», «-»), el layout de filtros a 1440–1490 px, el foco del teclado y el orden del vacío. **Quedan sin ejecutar** la #1 (Ajustar con token), #2 (decidir el PR #445), #6 a #12, y el SQL espejo de Movimientos (`fn_movimientos_variantes` todavía no busca por marca ni categoría).
> **Verificación:** la Estética viene de un análisis parcial del flujo; Lógica, Arquitectura, Funciones, Utilidad y Conexión las armé yo con el mapa del código, la lectura de producción y mis propias comprobaciones, sin verificador independiente. Lo que no pude comprobar va `[inferido]` o `[no verificable]`.
> Etiquetas: `[visto]` captura · `[código archivo:línea]` · `[producción]` consulta de solo lectura · `[inferido]` · `[no verificable]`.

## 0 · Veredicto
Es una pantalla sana por debajo (el stock guardado cuadra al 100 % con `movimientos` y las escrituras de piso llevan token) pero tiene tres problemas: **no encuentra por marca ni por categoría y, cuando no encuentra, calla**; **el semáforo marca «Stock bajo» en 41 de 45 prendas**, así que no distingue nada; y **«Ajustar» es la única escritura sin token ni transacción única**, con lo que un corte de red puede duplicar un ajuste.
**Cumple su finalidad:** 5/10 (promedio 6.0, con tope 5: «Ajustar» puede dejar el stock mal sin dejar rastro anómalo) · **Relevancia:** 7.4/10 — Soporte

## 1 · Finalidad declarada
"Esta pantalla existe para que la encargada de una sede sepa qué hay en piso y en almacén, qué viene en camino y qué debería reponer hoy, y pueda mover, ajustar, apartar y resolver lo dañado sin salir de ahí." Fuente: `docs/ARQUITECTURA.md` (sección «Inventario V2»), `docs/datos/generado/AVIARIO.md:17` (pájaro HALCÓN: `stock`, `movimientos`, `sububicaciones`, `prendas_danadas`), D-39 y D-42 de `docs/datos/DECISIONES-2026-09-12.md` y ADR-0208 (frescura del piso). `docs/datos/modulos/05-inventario-y-movimientos.md` **avisa que su cuerpo describe V1**: no lo cito como vigente. ¿Docs y pantalla coinciden? En lo esencial sí. Dos desajustes: `docs/ARQUITECTURA.md` (línea ~174) todavía dice que `/inventario` sale de `lib/inteligencia.ts` y `InventarioAgrupado.tsx`, que no existen desde el 2026-09-12 `[código]`; y R-48 («cada líder ve solo su sede») no se cumple aquí: el líder elige sede con `?ubicacion=` (`page.tsx:36-40`) y `fn_es_lider()` es global (8 de 25 colaboradores, `[producción]`). Manda el código y producción.

## 2 · Objeción
1. **«Ajustar inventario» es la única escritura de esta pantalla sin token ni transacción única.** `AjustarInventarioModal.tsx:176-206` hace un `await supabase.rpc("registrar_movimiento")` **por cada variante con cambio**, en fila. `registrar_movimiento` no tiene `p_token` (sus argumentos, `[producción]`: `p_variante_id, p_ubicacion_id, p_tipo, p_cantidad, p_motivo, p_nota, p_sububicacion_id`), mientras que `mover_interno`, `apartar_stock` y `bajar_al_piso` sí lo llevan y `bajar_al_piso` ya recibe `p_items jsonb`. Dos daños posibles: (a) si la red se corta **después** de que la base guardó y **antes** de que llegue la respuesta, el modal muestra error, la líder reintenta y el ajuste entra dos veces; (b) en un ajuste de varias tallas, si falla la 3.ª, la 1.ª y la 2.ª ya quedaron aplicadas y el modal solo muestra el error de la 3.ª (`:186-202`). El stock sigue «consistente» (cada movimiento es válido y `recalcular_stock` cuadra), por eso ni la conciliación ni nada lo avisa hasta que alguien cuente. Probabilidad baja (ajusta solo el líder o quien tenga Existencias/Conteos/Traslados, candado D-13; en producción hay 15 ajustes de conteo físico), costo silencioso. Trade-off: arreglarlo es una función nueva y tocar el modal; no arreglarlo es aceptar que la única puerta de corrección manual del stock es la que menos se protege.
2. **El arreglo de 5 líneas para «la marca» no alcanza.** Lo que Felipe vio [visto: captura 4] es el comportamiento diseñado: el índice solo tiene nombre, código, códigos de barras, color y talla (`InventarioPanel.tsx:296-299`, `filtro-busqueda-especial.ts`), y `BACKLOG.md:37` lo registraba como «Sin tocar, por decisión de Felipe» (esa línea hoy queda obsoleta). Pero **indexar la marca no devolvería lo que él espera**: `[producción]` hoy TRU tiene 5 productos y 5 marcas visibles (Artemisa, Cayla 2, Doradas Chic, Miramhe, Wayi) y «CAYLA» daría 8 filas de Top Aurora (marca «Cayla 2»), no los dos pantalones de marca CAYLA. Esos pantalones tienen **41 variantes y 0 filas de stock en toda la red**, y Existencias solo lista lo que tiene una fila en `stock` (`inventario-v2.ts:85-111`, `:161`): **69 de 126 variantes activas (55 %) y 6 de 11 productos reales no existen en esta pantalla**, ni siquiera como «Sin stock». Sin un vacío que lo diga, Felipe escribirá «CAYLA», verá Top Aurora, y dirá «sigue sin ser inteligente». La corrección tiene tres piezas (marca en el buscador, filtro «Marca», vacío que explica) y la tercera es la que contesta lo que él vio. Y la premisa «hoy hay una sola marca» es falsa: son 5 en TRU y 80 en la tabla, 8 con producto.
3. **El semáforo ya no informa: 41 de 45 prendas están en «Stock bajo» (rojo), 4 en «Sin stock», 0 en «Reponer piso», 0 en «Normal».** `[producción]` con la misma regla de `calcularEstado` (`inventario-reglas.ts:54-59`: almacén ≤ 10 ⇒ «Stock bajo»). Efectos: cualquier página de 15 filas trae al menos 11 chips rojos (contando el peor caso de 4 «Sin stock» en esa página) más los 2 rojos de la cabecera, contra `MAX_ROJO_POR_PANTALLA = 2` (`packages/shared/src/design-tokens.ts:73`); y la acción de esa etiqueta es «Pedir traslado de otra sede» (`inventario-reglas.ts:207`) cuando AQP, LIM y el Taller tienen **0 filas de stock** `[producción]`: no hay de dónde traer. El umbral de 10 lo decidió Felipe el 2026-09-17 (comentario `inventario-reglas.ts:19-35`; ninguna D-nn escrita lo cubre) y con lotes de 2 a 14 unidades por variante deja todo en alarma. El PR #445 lo reemplaza por «Acción/Estado» pero no está validado en navegador.

Descartado tras verificar (enseña algo): «la búsqueda es lenta» no es problema (1,4 ms para 79 filas en base; filtrar en memoria 4.000 filas × 4 términos ≈ 5–10 ms `[inferido]`); «Conteo compara con el `sku` vacío y ofrece “Dar de alta” una prenda que existe» venía en el paquete de entrada, pero ya lo corrigió `cba4db7a` en esta misma rama (`conteo/page.tsx:69-71` pasa por `codigosDeConteo`).

## 3 · Lo que está bien y no se toca
- **El stock guardado cuadra con el libro:** derivado de `movimientos` con la lógica de `recalcular_stock` da 59 filas y 363 uds, igual que `stock`; 0 negativos, 0 apartadas mayores que la cantidad, 0 huérfanas, 0 uds en variantes inactivas. `[producción]`
- **Candados de esquema en `stock`:** `cantidad >= 0`, `cantidad_apartada <= cantidad`, unicidad `(variante, ubicación, sububicación)` y FK compuesta que obliga a que la sububicación sea de esa ubicación. `[producción]`
- **Escrituras solo por RPC:** `stock` y `movimientos` son solo SELECT para `authenticated`; `recalcular_stock` y `fn_aplicar_movimiento` no son ejecutables por ningún rol de la app; `fn_aplicar_movimiento` toma `for update` y en traslados bloquea origen y destino en orden fijo. `[producción]`
- **Idempotencia bien hecha donde existe:** `mover_interno`, `apartar_stock` y `bajar_al_piso` con `p_token` y `pg_advisory_xact_lock`; `ReponerPisoModal.tsx:120-129` lo usa. Es el patrón que #1 copia. `[producción]` `[código]`
- **Lectura barata y tolerante:** `EXPLAIN (ANALYZE)` 1,4 ms para 79 filas por `stock_ubicacion_idx`; si falla la cobertura, la tabla muestra «N/D» y un aviso ámbar y el stock no se cae (`resumen-inventario.ts:83-92`, `InventarioPanel.tsx:650`); si falla la lectura de `es_prueba`, se muestran todos (`inventario-v2.ts:269`). `[producción]` `[código]`
- **Datos de prueba fuera por defecto (D-54, ADR-0159):** Producto de Prueba (`POL-0004`, 160 uds) ya está `es_prueba = true` y la tabla y la tarjeta dan 203 = 158 piso + 45 almacén. `[producción]` `[visto captura 4]`
- **El motor de búsqueda actual está bien pensado:** ignora tildes y mayúsculas, entiende plural, género de color, talla exacta y varias palabras en cualquier orden, y avisa «Se usa lo que escribiste» cuando el texto pisa un filtro (`filtro-busqueda-especial.ts`, `InventarioPanel.tsx:569`). Tiene 110 casos compartidos con su espejo SQL (94 + 16 en `filtro-busqueda-especial.casos.json`). `[código]` No se reemplaza: se le agregan dos campos.
- **Código de etiqueta en la celda (#461):** `codigoDeEtiqueta` (`prenda-reglas.ts:25-27`) evita el hueco de `variantes.sku` (NULL en 128 de 130, ADR-0058). `[código inventario-v2.ts:145]` `[producción]`
- **RLS activa** en `stock`, `variantes`, `productos`, `marcas`, `categorias` y compañía; `variantes.costo` no es legible para `authenticated`. `[producción]`
- **La píldora dice la verdad:** «Por colgar · 9 tallas · 20 uds» cuenta toda la sede, no lo filtrado, y coincide con la consulta (9 variantes con piso 0 y almacén > 0). `[visto captura 4]` `[producción]`

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 5.5 | Vacía cumple los 2 rojos; con los datos reales de TRU el semáforo satura, la tabla pide ~1.100 px de columnas y esconde las acciones, y la herramienta que más se usa (buscar y filtrar) queda al fondo, sin Marca y sin diagnóstico | `[visto capturas 3 y 4]` `[código InventarioPanel.tsx:51-55,411-413]` `[producción]` |
| Lógica de negocio | 6 | Stock íntegro; pero el universo (55 % del catálogo invisible), el umbral (91 % en alarma) y dos reglas de «cuánto hay» no cuadran | `[producción]` `[código inventario-reglas.ts:54-59]` |
| Arquitectura | 6.5 | Base sólida y lectura barata; «Ajustar» sin token, 8 lecturas + 2 RPC por carga, cifras que salen de otro universo | `[producción]` `[código AjustarInventarioModal.tsx:176-206, page.tsx:44-62]` |
| Funciones | 6.5 | Reponer, retirar, ajustar, apartar, dañadas y CSV funcionan; faltan marca y un vacío útil; «recarga para ver lo último» sin botón | `[código]` `[visto captura 4]` |
| Utilidad | 5 | Quien escribe la marca no encuentra nada y no sabe por qué; quien mira la tabla ve todo en rojo | `[visto captura 4]` `[producción]` |
| Conexión con el ERP | 6.5 | Bien conectada a Vender, Traslados, Conteo y Producción; cinco buscadores distintos en el ERP y cifras de Existencias que salen de un universo distinto al de su tabla | `[código]` `[producción]` |

Cumple su finalidad = (5.5 + 6 + 6.5 + 6.5 + 5 + 6.5) / 6 = **6.0 → tope 5** por el defecto de la objeción 1 (verificado en producción: `registrar_movimiento` sin `p_token`; verificado en el código: una RPC por variante).

### Estética — 5.5
- `[visto captura 4]` Alineada con las hermanas: crema, títulos serif, `CabeceraPantalla` (sobretítulo rojo → título → bajada taupe), tarjetas `card-cayla`. Con la tabla vacía cumple el máximo: sus 2 rojos propios son el sobretítulo y «VER RECOMENDACIONES (25)». Cero hex sueltos en `InventarioPanel.tsx` y `PrendaCelda.tsx`. `[código]`
- `[producción]` + `[código InventarioPanel.tsx:51-55]` Con la tabla real el rojo se rompe: `stock_bajo` pinta un chip **rojo** y hoy son 41 de 45 prendas (objeción 3). Hay además 4 chips ámbar «Por colgar» por página y el punto rojo de la leyenda (`:57-62`, `:899-909`).
- `[visto captura 3]` `[código :411-413]` Las 9 columnas suman ≈ 1.100 px solo en anchos mínimos (13,5 + 6,5 + 4,5 + 6 + 7 + 11 + 5 + 9 + 6 rem ≈ 69 rem = ~1.100 px), más márgenes y separaciones; el propio comentario admite que «se desplaza». En la captura la cabecera se corta en «En l…» y los botones Apartar, Ajustar y «⋯» quedan fuera de vista, con «Reponer» apilado debajo de los chips.
- `[código]` Existencias conserva su copia local `TarjetaPrioridad` (`InventarioPanel.tsx:131-189`) cuando Conteo, Producción y Finanzas ya usan `ui/TarjetaCifra`, cuyo encabezado documenta que se extrajo justamente para no repetir copias (regla de orden de pantalla, ADR-0169).
- `[visto captura 4]` El campo «CAYLA» sale subrayado por el corrector del navegador: el input no lleva `spellCheck={false}` (otros cinco componentes del repo sí lo hacen). Contraste medido en el navegador: `[no verificable]` desde aquí.

### Lógica de negocio — 6
- D-39 («las alertas cuentan piso y almacén y avisan cuántas hay guardadas»): se cumple, la celda «Piso · Almacén» y el chip «Por colgar · N uds» lo dicen. D-42 («la mercadería nueva entra al almacén y de ahí se baja al piso»): coherente con la píldora «Por colgar».
- **Universo:** la lista nace de filas de `stock` (`inventario-v2.ts:85-111`). Una prenda del catálogo que la sede nunca recibió no existe aquí: 69 de 126 variantes activas. Ninguna decisión escrita dice si «no recibida» debe verse. `[producción]`
- **Umbral:** ninguna D-nn cubre el «≤ 10 en almacén»; vive en un comentario del 2026-09-17. Con 41 de 45 en alarma, la regla no discrimina.
- **Dos reglas de «cuánto hay»:** `sumarCantidades` (`inventario-reglas.ts:389-405`) saca la cuarentena del total; `fn_stock_por_sede` (la columna «En la red», Vender, Cambios) la suma y tampoco filtra `es_prueba` ni variante inactiva. Hoy no muerde (cuarentena = 0). `[producción]`
- R-48 vs `?ubicacion=`: ver sección 1. `[producción]`

### Arquitectura — 6.5
- **Cadena:** `page.tsx` → `getExistencias` (`inventario-v2.ts:235`, 4 lecturas en paralelo) → `getStockPorUbicacion` (`leerTodas`, páginas de 1.000) → RLS `stock_select` (`fn_es_lider() or ubicacion_id = fn_ubicacion_actual_persona()`). La página hace 8 lecturas y 2 llamadas a `fn_resumen_variantes_json` por carga (`page.tsx:44-62`). `[código]` `[producción]`
- **Estados imposibles:** los cierra el esquema (sección 3). El único hueco de esta pantalla es de operación, no de esquema: un ajuste sin token (objeción 1).
- **Transacción:** `mover_interno`, `apartar_stock` y `bajar_al_piso` son todo-o-nada con token. `registrar_movimiento` es todo-o-nada **por variante**; el modal lo repite N veces. La unidad debería ser el ajuste completo (Jim Gray).
- **Concurrencia:** dos sedes o dos líderes sobre la misma fila se serializan con `for update` en `fn_aplicar_movimiento`. Dos pestañas con el mismo ajuste y sin token: dos movimientos. `[producción]` `[inferido]`
- **Caída externa:** no toca API externa. Se degrada así: Supabase caído → `app/(app)/error.tsx`, sin pérdida de datos porque la pantalla lee; cobertura caída → «N/D» y aviso; `es_prueba` ilegible → se ven todos. Un guardado cortado a medio camino: seguro en Reponer/Apartar (token), **no seguro en Ajustar**.
- **Volumen (números):** hoy 45 variantes visibles, 79 filas de `stock`, 655 B por fila con el `select` de la pantalla = 51,8 KB. A 3 años, con el supuesto de 300 modelos × 5 tallas × 4 colores = 6.000 variantes y 1,39 filas de stock por variante: 8.340 filas por tienda × 655 B ≈ 5,5 MB por carga en 9 páginas de 1.000 (3 rondas), más `fn_stock_por_sede_json` ≈ 24.000 filas × 126 B ≈ 3 MB en una sola fila jsonb (`[inferido]`, cuentas del agente). El límite es la descarga (incómoda hacia ~6.000 variantes, sobre todo en celular), no la base ni el filtro en memoria. Con 3.000 variantes (la densidad actual) serían 2,7 + 1,5 MB.
- **Duplicación temporal:** `getStockPorUbicacion` trae dos copias del mismo `select` (`inventario-v2.ts:85-111` y `:116-134`) por un reintento «TEMPORAL» sin `cantidad_apartada`; la columna ya existe en producción (`information_schema`), así que el reintento es código muerto. `[código]` `[producción]`
- **Seguridad:** `mover_interno` y `apartar_stock` (SECURITY DEFINER) validan solo `fn_puede_operar_ubicacion` y no llaman a `fn_ve_modulo`; `bajar_al_piso` sí, y `registrar_movimiento` lo hace vía `fn_puede_ajustar_inventario()`. Regla de ADR-0161 aplicada a medias. `[producción]`
- **Datos personales:** la pantalla no muestra ninguno; `apartar_stock` recibe nombre y contacto de la clienta (`p_clienta_nombre`, `p_clienta_contacto`) y los guarda en `apartados` (0 filas hoy). `[producción]`

### Funciones — 6.5
- **Existen y funcionan:** buscar, filtrar por Categoría/Talla/Color/Estado, píldora «Por colgar», Reponer y Retirar del piso (`mover_interno`), Ajustar, Apartar/Liberar, Dañadas (Se botó/Donada/Liquidada), ver historial del producto, exportar CSV, «Bajar al piso», «+ Nuevo traslado», «Dónde más hay», cobertura y recomendaciones. `[código]`
- **Fantasma o a medias:** «Vista cargada a las 01:26 — recarga para ver lo último» pide una acción que la pantalla no ofrece (`page.tsx:117`, es un párrafo). La tarjeta «Reponer a piso hoy · 0» es un botón que, con 0, deja la tabla vacía y manda a mirar «Por colgar» (`InventarioPanel.tsx:443-462`; `[visto captura 4]`).
- **Faltan:** buscar y filtrar por Marca y por Categoría escrita; un vacío que explique; distinguir «no existe» de «esta sede no lo ha recibido»; columna Marca en el CSV.
- **Sobran:** el reintento sin `cantidad_apartada` (código muerto); el texto estático «Enfócate en tener los productos clave en piso…» (`:536`) no es un dato. Nada más que borrar.

### Utilidad (persona sin contexto) — 5
Escenario: una colaboradora nueva un sábado en hora pico; una clienta pregunta si hay algo de «Cayla».
1. Escribe «CAYLA» en «Buscar». Sale «Ningún producto coincide con la búsqueda.» y nada más. ¿No hay? ¿Escribió mal? ¿Es de otra sede? Duda. `[visto captura 4]`
2. Abre los filtros para buscar por marca: no hay Marca. Prueba con Categoría y no sabe cuál. `[visto captura 4]`
3. Quita el texto y ve la tabla: casi todo con «Stock bajo» en rojo. No sabe qué es urgente. `[producción]`
4. En una pantalla de 1.280 px las acciones de la fila no están a la vista. `[visto captura 3]` `[código]`
El fallo es del diseño, no de la capacitación: el sistema calla justo cuando debería explicar.

### Conexión con el ERP — 6.5
Ver sección 6. Bien conectada aguas abajo; el problema es de coherencia: la misma prenda se busca de cinco formas distintas en el ERP y las cifras de arriba (Disponible total, recomendaciones) salen de un universo distinto al de la tabla.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 8 | Aquí la encargada decide qué reponer y el líder qué pedir a otra sede; sus cifras alimentan traslados, recomendaciones y Producción |
| Dinero y stock que toca | ×1 | 8 | Escribe `movimientos` (reponer, ajustar, apartar, dañadas, liquidar) sobre el stock que la clienta compra |
| Frecuencia y personas que la usan | ×1 | 7 | Uso diario de cada sede, pero hoy solo TRU tiene stock (79 filas, AQP/LIM/Taller en 0) y 17 colaboradores no líderes |
| Qué se detiene si falla | ×1 | 6 | Vender sigue por la caja (lee el stock por su cuenta); se detienen reposición, ajuste y apartar |

Relevancia = (2·8 + 8 + 7 + 6) / 5 = **7.4** → **Soporte**.
Tope de 5 en «cumple su finalidad»: **aplicado**, por la objeción 1.

## 6 · Conexión con el ERP
- **Aguas arriba:** `stock` es un snapshot derivado de `movimientos` (`fn_aplicar_movimiento`, `recalcular_stock`); lo alimentan Vender (25 salidas por venta), Compras/recepciones (3 entradas de recepción), traslados, conteos (15 ajustes de conteo físico) y la carga inicial (12 entradas, 160 uds). El catálogo (`productos`, `variantes`, `marcas`, `categorias`, `producto_fotos`, `codigos_barras`) le da el nombre; «en camino» sale de `transferencia_items`. `[producción]`
- **Aguas abajo:** `getStockPorUbicacion` la **comparten** Vender, Cambios y Traslados (`/inventario/mover`, `/inventario/bajar`): tocar su `select` toca la caja. `fn_resumen_variantes` alimenta Análisis, la cobertura, el ritmo de 7 días, «Disponible total» y «Ver recomendaciones»; `planDeReposicion` lo reutiliza Producción. Conteo y Movimientos leen y escriben el mismo libro.
- **Pájaro dueño y vecinos:** HALCÓN (`AVIARIO.md:17`); vecinos LORO (catálogo y vocabulario: marcas, categorías), Vender (caja), Compras y Producción.
- **Externos, y qué pasa si caen:** ninguno directo (ni SUNAT ni pasarela). Se degrada así: Supabase caído → `error.tsx`, no se pierde ningún dato porque la pantalla lee; los guardados de piso son idempotentes; el ajuste, no (tarea #1).

## 7 · Las 12 tareas, por importancia

### #1 · Corregir — «Ajustar inventario»: un solo envío, con token, todo-o-nada
- **Dónde:** `AjustarInventarioModal.tsx:176-206` (bucle de `registrar_movimiento`, una llamada por variante, sin token); `retail.registrar_movimiento(p_variante_id, p_ubicacion_id, p_tipo, p_cantidad, p_motivo, p_nota, p_sububicacion_id)` sin `p_token` `[producción]`. Diseño: función nueva `retail.ajustar_inventario(p_ubicacion_id, p_items jsonb, p_motivo, p_nota, p_token)` copiada del patrón de `bajar_al_piso(p_ubicacion_id, p_items jsonb, p_token)` y de la tabla de intentos de `20260926200000_mover_interno_intentos_tabla.sql`: exige `fn_puede_ajustar_inventario()`, firma con `fn_actor_persona_id(true)` y recorre `registrar_movimiento` **dentro de la misma transacción**. El modal manda un solo `rpc` con un token que nace al abrir y se conserva al reintentar (`useRef`, como `ReponerPisoModal.tsx:120-129`). No se toca `registrar_movimiento` (lo usan otros módulos y tiene parches vivos: buscar sus `reemplazar_vivo` antes de recrearla).
- **Por qué en este puesto:** es la única puerta de corrección manual del stock y la única sin protección de reintento; el daño es silencioso porque cada movimiento es válido. Va antes que el buscador porque puede dañar stock, no porque Felipe lo haya pedido; no bloquea la búsqueda (archivos distintos).
- **Cómo lo verificas tú:** en la base local, la prueba de RPC con el mismo token dos veces deja **un** movimiento por variante y el stock sube una vez; un ajuste de 3 tallas con la 3.ª inválida no aplica ninguna (hoy aplica 2). En el navegador contra la base local: DevTools ▸ Network ▸ «Offline» justo después de «Guardar», reintenta: el stock cambia una sola vez. **No se ensaya escribiendo en producción** (lote único que termina en excepción a propósito).
- **Esfuerzo / dependencias:** M. Ninguna. El SQL se aplica antes que la web (la web nueva llama a una función que producción aún no tiene).

### #2 · Eliminar/fusionar/conectar — Decidir el destino del PR #445 antes de cablear nada en `InventarioPanel.tsx`
- **Dónde:** PR #445 (`claude/inventario-comportamiento-piso-almacen`, `CONFLICTING`): reescribe `InventarioPanel.tsx`, `page.tsx`, `inventario-v2.ts`, `inventario-reglas.ts`, `existencias-recomendaciones.ts`; quita `EstadoStock`, `calcularEstado`, `necesitaReponerPiso` y la columna Disponible; separa filtros «Acción» y «Estado»; su migración `20260925170551_existencias_ritmo_reciente.sql` (`fn_ritmo_reciente_json`) solo se probó en local; su descripción admite que la validación en navegador no se ejecutó; no agrega marca ni toca el motor de búsqueda.
- **Por qué en este puesto:** las tareas #3, #4, #5, #8, #11 y #12 editan las mismas líneas (`InventarioPanel.tsx:296-315`, `:411-413`, `:550-594`, `:651-659`; `inventario-v2.ts:85-134`). Dos ramas sobre el mismo archivo es un conflicto de fusión garantizado y trabajo doble.
- **Cómo lo verificas tú:** la decisión queda escrita en `docs/BACKLOG.md` y `gh pr view 445` deja de decir `CONFLICTING` (fusionado, cerrado o rebasado).
- **Esfuerzo / dependencias:** S para decidir, M para rebasar. Ninguna; **bloquea el cableado en pantalla** de #3, #4, #5, #8, #11 y #12. La lógica de `lib/filtro-busqueda-especial.ts` de la #3 sí puede adelantarse: ese archivo no está en el PR.
- Opciones para decidir: **A)** fusionar #445 primero — Ganas: ya resuelve Acción/Estado y la columna Disponible; Pagas: 24 archivos y una migración sin aplicar, validación en navegador pendiente, y el buscador espera. **B)** parchar `main` con #3–#5 ahora y rebasar #445 después — Ganas: Felipe ve la marca ya y los conflictos quedan acotados a `:296-315` y `:550-594`; Pagas: #445 hereda esos choques. **C)** cerrar #445 y rehacer sus mejores partes en tareas chicas — Ganas: pasos verificables (principio 7); Pagas: se pierden 1.783 líneas escritas. Recomiendo **B**. Si no respondes, ejecuto B.

### #3 · Reconstruir — Un buscador que entienda marca y categoría, con relevancia
- **Dónde:**
  - *Commit 0 (solo renombre, sin cambio de comportamiento):* en `PrendaCelda.tsx` la prop `marca` de `ProductoVarianteCelda` no es la marca comercial sino una **señal** (`ReactNode`, el «≈» de Análisis); pasa a `senal` en sus 4 llamadas (`ResumenComportamiento.tsx:69`, `ResumenComparacionDetalle.tsx:103`, `TrasladoDetallePanel.tsx:338` y `:385`) para dejar libre `marca` = marca comercial. «Marca» ya significa cuatro cosas en el repo (comercial, token de `mover_interno`, esa prop, la «marca de retirada» futura de ADR-0208).
  - `inventario-v2.ts`: `FilaExistencias` (`:212-223`) suma `marca: string | null`; en `getExistencias` (`:235-326`) la consulta de `:269` (`productos.select("id").eq("es_prueba", true)`) pasa a una lectura paginada con `leerTodas` de `id, referencia, codigo, es_prueba, marca:marcas!productos_marca_fk(nombre), categoria:categorias(nombre)`, tolerante (error → sin marca, como hoy con `42703`); asigna `marca` en los **dos** sitios que arman filas (`:278-285` y `:300-323`) y devuelve además `sinStock` (productos no `es_prueba` sin fila en la sede), que usa la #5. **No se toca el `select` de `stock` (`:85-111`)**: lo comparte la caja.
  - `lib/filtro-busqueda-especial.ts`: `CamposBuscables` (`:47-55`) y `CamposNormalizados` (`:58-67`) ganan `marca` y `categoria` (opcionales); se comparan con `empiezaPalabra` (inicio de palabra, sin tildes); `filtrarConBusquedaEspecial` (`:214-229`) acepta `{ ordenar: "relevancia", grupo: (f) => f.productoId }`. La marca **no** es una «dimensión» (no pisa los filtros visuales). Relevancia por término: código completo 100 > nombre desde inicio de palabra 60 = marca completa 60 > marca desde inicio 50 > nombre en medio 40 = categoría 40 > color o talla 30 > código parcial 10; suma por término; el grupo (producto) toma el máximo de sus variantes; solo con texto escrito y sin «Por colgar».
  - `InventarioPanel.tsx:296-299`: la lambda del índice pasa `marca` y `categoria`; `:553` placeholder «Prenda, marca, código, color, talla…», `spellCheck={false}`, `autoComplete="off"`.
  - Análisis (`resumen-busqueda.ts:25-35`, hoy pega la categoría al nombre) y Movimientos pasan `marca` y `categoria` como campos, no concatenados.
  - SQL espejo en commit y migración aparte: `20260927100000_movimientos_busqueda_marca_categoria.sql` (`create or replace function retail.fn_movimientos_variantes` con `left join retail.marcas` y `retail.categorias`; `set search_path = retail, public, extensions;`, `set lock_timeout = '3s'`; sin políticas ni `alter`, una sola parte), el escenario «marca y categoría» en `filtro-busqueda-especial.casos.json`, y `scripts/pruebas/fn_movimientos_busqueda_especial.mjs` (hoy siembra «la primera pareja marca/proveedor», `:92-94`). También `FiltrosMovimientos.tsx:175`: su placeholder sigue prometiendo solo «Prenda, código, barras o referencia…» cuando la función ya entiende color, talla y plural.
- **Por qué en este puesto:** es lo que Felipe pidió, es la forma más rápida de buscar en tienda, y la marca ya se busca en la caja (`buscar-prenda-v2.ts:47`) y se filtra en Productos: Existencias es la única pantalla de stock sin ella.
- **Cómo lo verificas tú:** en Tienda TRU, «CAYLA» (hoy 0 filas `[visto]`) → 8 filas de Top Aurora (marca «Cayla 2», 65 uds); «miramhe» → 8 (hoy 0); «doradas» → 20 (Blusa Carlita); «blazers» → 3 (Blusa Xd, categoría Blazers); «camisas» → 20 (categoría «Camisas y Blusas», ningún nombre lo dice); «polos» → 8; «wayi jean» → 6; «blusa» → 23 y «blusa l» → 5 (sin cambio); «pol-0004» → 0 (la prueba sigue oculta); «pol-0002» → 8; «plomo» sigue en 0 hasta la fase de sinónimos (#7). Pruebas: escenario nuevo en `casos.json` (`«cayla» → filas de nombre o marca`, `«tica» → []` porque la marca se busca desde inicio de palabra, `«yjj» → []` como límite documentado, `«polo blanco m» → []`) y `pnpm pruebas:fn-movimientos-busqueda-especial` para el SQL. Con 4.000 filas sintéticas una tecla debe tardar menos de 16 ms.
- **Esfuerzo / dependencias:** M. La parte de `lib/` no espera; el cableado en `InventarioPanel.tsx` va después de la #2. La migración se pega **después** o **con** la web: la web no depende del SQL.
- **DECIDÍ:** la marca es un dato de la fila (una lectura ligera aparte a `productos` dentro del `Promise.all` que ya existe) y el motor compartido gana dos campos opcionales con relevancia solo en pantalla; el SQL de Movimientos se alinea en commit aparte. Números: 45 filas hoy y ~4.000 por sede a 3 años; una tecla ≈ 110.000 comparaciones de texto ≈ 5–10 ms `[inferido]`; la lectura extra son ~13 filas de `productos` hoy (unas 500–600 y ~60 KB a 3 años), en paralelo a las que ya se hacen.
- **DESCARTÉ:** (a) el parche de 5 líneas (pasar `marca` a la lambda), porque deja tres formas de leer una fila (Análisis pega la categoría al nombre, Existencias una lambda, Movimientos el SQL) y repite lo que ADR-0121 ya documentó: dos motores respondiendo distinto sobre la misma prenda; (b) búsqueda difusa siempre encendida (Levenshtein o `pg_trgm`), porque en inventario un falso positivo («Cayla» ↔ «Cala») termina en reponer o ajustar la prenda equivocada y `pg_trgm` corre en el servidor: habría que viajar a la base en cada tecla por 45 filas que ya están en el navegador (la tolerancia a errores de tipeo queda solo como sugerencia en el vacío, #5); (c) la marca dentro del `select` de `stock`, porque agrega un join a una lectura que comparte la caja y, si el embed falla, se cae Vender; (d) tratar la marca como «dimensión» (que el texto pise el filtro, como talla y color), porque choca con «Pantalon Cayla» (nombre) frente a marca CAYLA y con «Doradas Chic» (marca) frente al color Dorado; (e) ranking en el servidor (`ts_rank`), porque agrega un viaje por tecla sin ganancia a este volumen.
- **SE ROMPE SI:** (1) el SQL de Movimientos se pega después de la web y alguien busca «cayla» en las dos pantallas: Existencias trae Top Aurora y Movimientos nada hasta que se pegue la migración; (2) la lectura de `productos` falla: todas las filas quedan con `marca = null`, el filtro de la #4 no se pinta y el buscador queda como hoy (previsto, no es un error); (3) entra un color «Dorado» a la sede: «doradas» se lee como color, el filtro Color se ignora con «Se usa lo que escribiste» y la marca «Doradas Chic» se mezcla con él (hoy TRU no tiene ese color); (4) el motor se llama sin `grupo` con texto escrito: las variantes de un mismo producto se separan por relevancia y la tabla, que se lee por producto, se ve desordenada; (5) alguien vuelve a pasar `marca` (señal) a la celda sin haber hecho el commit 0: el aviso se pintaría como si fuera la marca; (6) Felipe decide que la caja busque como Existencias: se reabre `buscar-prenda-v2.test.ts:32` (ver #7).

### #4 · Mejorar — Filtro «Marca» y la marca a la vista (fila y CSV)
- **Dónde:** `InventarioPanel.tsx`: estado `marca` (`:250-254`); lista `marcas` derivada de `stock` (`:276-284`; opciones de la **sede**, no las 80 de la tabla) con `mostrarMarca = marcas.length >= 2`; `otros` (`:304-310`) suma `if (marca !== TODAS && f.marca !== marca) return false` (el texto nunca lo ignora, igual que Categoría); `firmaFiltros` (`:325`), `hayFiltrosActivos` (`:343`) y `quitarFiltrosMenosEstado` (`:346-351`) lo incluyen; `CampoSelect` «Marca: todas» justo tras el buscador, ADR-0209 (buscador dentro del combo desde 9 opciones), y la grilla `:552` pasa a `sm:grid-cols-3 xl:grid-cols-[1.4fr_repeat(5,1fr)]` para que quepan 5 filtros sin scroll horizontal; CSV (`:386-402`) agrega la columna «Marca»; `PrendaCelda.tsx` suma `marca?: string | null` (texto taupe pequeño tras el nombre, oculto con una sola marca).
- **Por qué en este puesto:** Felipe lo pidió («en los filtros tampoco figura marca, que es la forma más rápida»). Si el buscador encuentra Top Aurora por «cayla» y la fila no dice «Cayla 2», la colaboradora cree que es un error.
- **Cómo lo verificas tú:** en TRU el combo lista Artemisa, Cayla 2, Doradas Chic, Miramhe y Wayi; Marca = Miramhe → 8 filas; con Marca = Miramhe y texto «wayi» el vacío dice «Filtro activo: Marca Miramhe» y ofrece quitarlo; «Limpiar filtros» también lo limpia; con una sola marca (o si falla la lectura) el filtro no se pinta y la grilla vuelve a 5 columnas sin salto; a 1.280 y 1.024 px caben sin scroll horizontal de página; el CSV trae «Marca».
- **Esfuerzo / dependencias:** M. No antes de la #3 (necesita el dato) ni de la #2 (mismas líneas). No agrega Proveedor ni Precio (Existencias no los muestra); los filtros en cascada con conteos («Miramhe · 8») se posponen: con 5 marcas y 45 filas no aportan.

### #5 · Corregir — Estado vacío que dice qué se buscó, cómo salir y si la prenda «existe pero esta sede no la ha recibido»
- **Dónde:** `InventarioPanel.tsx:651-659` (una sola frase para cualquier vacío); nuevos `lib/existencias-vacio.ts` (puro, con prueba: `explicarVacio({ terminos, filtros, filas, indice, catalogoSinStock })`) y `components/ExistenciasVacio.tsx` (tokens ADR-0169, patrón visual de `SinCoincidencias.tsx`, que no se reutiliza porque lee el contexto de Facturación; `role="status"`, sin animación propia). Contenido: (1) título «Nada coincide con «cayla polo» en Tienda TRU»; (2) una línea de cómo se leyó («polo» texto · «blanco» color · «m» talla); (3) filtros activos con × que los quitan; (4) hasta 3 botones «Quitar «polo» · 8 prendas» calculados relajando de a una condición con el mismo motor, ordenados por cantidad y sin ofrecer los que dan 0; (5) «¿Quisiste decir «Cayla»?» solo si ninguna relajación devuelve filas (distancia ≤ 1, ≤ 2 desde 7 letras, contra nombres, marcas, categorías y colores de la sede) y sin filtrar por sí mismo; (6) bloque «En el catálogo, sin stock en esta sede» con los productos de `sinStock` que coinciden («Pantalon Cayla y Pantalon Sastre (marca CAYLA) están en el catálogo, pero Tienda TRU no los ha recibido», con «Ver en Productos»); (7) botón «Limpiar búsqueda y filtros». Se conservan los dos mensajes actuales de `stock.length === 0` y «Nada por colgar». No se revela la existencia de datos de prueba ocultos (ADR-0159).
- **Por qué en este puesto:** es la pieza que le habría contestado a Felipe en la captura 4; sin ella, la marca indexada sigue dejando a la colaboradora sin saber si escribió mal o si la prenda no está.
- **Cómo lo verificas tú:** en TRU «cayla polo» → título con lo buscado y los botones «Quitar «polo» · 8 prendas» y «Quitar «cayla» · 8 prendas»; «pantalon cayla» → «Pantalon Cayla está en el catálogo, pero Tienda TRU no lo ha recibido»; «polo blanco m» → dice que «m» se leyó como talla y ofrece «Quitar «m» · 1 prenda»; «cayls» → «¿Quisiste decir «Cayla»?»; «pol-0004» → no revela el Producto de Prueba; sin texto ni filtros el vacío no aparece.
- **Esfuerzo / dependencias:** M. No antes de la #3 ni de la #2; el bloque del catálogo usa la lectura a `productos` de la #3.

### #6 · Replantear — Decidir la «Estrategia alternativa» (sección 8)
- **Dónde:** sección 8 de este archivo; toca `getExistencias` (`inventario-v2.ts:235`), `page.tsx` y la lectura compartida `getStockPorUbicacion`.
- **Por qué en este puesto:** define hasta dónde llega la #5 (¿basta el bloque «sin stock en esta sede» o Existencias debe partir del catálogo?) y qué pasa cuando abran AQP y LIM, que hoy tienen 0 filas de stock. No bloquea #3 ni #4.
- **Cómo lo verificas tú:** Felipe contesta A, B o C en chat y queda escrito en `BACKLOG.md`; si elige B o C, esta tarea se cierra abriendo su ADR.
- **Esfuerzo / dependencias:** S (decidir). Ninguna. Si no respondes, ejecuto A.
- **DECIDÍ:** proponer **A** (mejorar la pantalla actual con #3–#5) e incorporar la mitad barata de B, el bloque «en el catálogo, sin stock aquí».
- **DESCARTÉ:** B como reemplazo completo hoy, porque llenaría Tienda TRU de 69 filas «Sin stock» en rojo (con el semáforo actual, #8) y obligaría a una lectura nueva mientras la actual la comparten la caja, Cambios y Traslados.
- **SE ROMPE SI:** AQP abre con 0 filas de stock y la colaboradora nueva ve «Esta ubicación no tiene stock todavía.» (`InventarioPanel.tsx:652`) sin saber si es un error de carga o que aún no llega mercadería: ahí A se queda corta y B o C valen su costo.

### #7 · Eliminar/fusionar/conectar — Tarea raíz: un solo motor de búsqueda de prendas para el ERP
- **Dónde:** el mismo defecto (la misma prenda se busca con reglas distintas) está en más de 8 lugares, con **cinco motores**: (1) `filtro-busqueda-especial.ts` (Existencias, Análisis, Movimientos): varias palabras, tildes, plural, sin marca; (2) `buscar-prenda-v2.ts:43-50` `filtrarPrendasV2` (caja, Apartados, Proformas): con marca pero la frase entera en orden fijo, y `buscar-prenda-v2.test.ts:32` lo fija («negro m» → 0); (3) `fn_productos_buscar` (Productos): un `ILIKE` de la frase, sin tildes ni plural (`«pantalón» → 0`, `«pantalon» → 2`, `«blusas» → 0` `[producción]` según el agente de lectura); (4) `coincidenciaCombo` (`combo-reglas.ts`, todos los combos): frase entera; (5) `coincide` de Facturación. Más los sueltos de Traslados (`traslados-reglas.ts:461`), Recibir (`RecepcionEnvio.tsx:311`), Producción (`NuevaOrdenProduccionForm.tsx:184`, solo nombre) y Compras/prenda (`CompraFormV2.tsx:151`, solo nombre). Sinónimos de color con **tres fuentes**: `ALIAS_DE_COLOR` (`filtro-busqueda-especial.ts:107-111`, 3 alias), su copia en SQL y `colores.sinonimos` (29 de 75 colores; «plomo»→Gris, «guinda»→Vino) que el buscador no lee: hoy «plomo» da 0 en TRU aunque hay 6 filas grises. Y el hueco del código de etiqueta (`variantes.sku` NULL en 128 de 130): `cba4db7a` ya lo cerró en Conteo, Compras y Producción; quedan `fn_prioridad_conteo`, `censo_crear_variante`, `previsualizar_cierre_conteo`, `fn_traslado_lineas`, `fn_movimientos` (solo devuelve `sku`) y Traslados/Mover, que piden SQL (`docs/BACKLOG.md:36`). Otras pantallas analizadas que ya rozan esto: `docs/pantallas/productos.md` (fila «Búsqueda»: «bien; `ilike` sin escapar»), `docs/pantallas/vender.md` (#6, buscador con miles de prendas), `cambios.md` y `devoluciones.md` (`BuscadorVentas`, buscador de comprobantes: otro problema).
- **Por qué en este puesto:** Felipe lo dijo: la marca es la forma más rápida de buscar, y en la caja (donde la clienta espera) la frase entera en orden fijo rompe con «cayla negro m». Una sola regla evita que cada pantalla nueva invente la suya (Brooks: dos partes resuelven lo mismo de dos formas, una está mal). Va después de #3–#5 porque ese motor es el que se adopta.
- **Cómo lo verificas tú:** la misma frase («cayla negro m») devuelve el mismo conjunto de prendas en Existencias, Movimientos, Análisis, Productos y la caja; «pantalón» = «pantalon» en Productos; «plomo» encuentra las 6 filas grises de TRU.
- **Esfuerzo / dependencias:** L, en cortes: (i) Movimientos por SQL (ya en la #3); (ii) Productos con `retail.fn_clave_texto` (ya existe, IMMUTABLE, la usa el índice único de marcas; `unaccent` no está instalada); (iii) sinónimos desde `colores.sinonimos`; (iv) la caja con varias palabras, **decisión de Felipe** (reabre `buscar-prenda-v2.test.ts:32`). No antes de la #3.

### #8 · Corregir — El semáforo de estado no distingue: 41 de 45 prendas en «Stock bajo» (rojo)
- **Dónde:** `inventario-reglas.ts:19,35,54-59` (`UMBRAL_STOCK_BAJO_ALMACEN = 10`, decisión del 2026-09-17 que el propio comentario dice haber bajado de 20 porque «casi todo caía en Stock bajo»), `ACCION_ESTADO_STOCK.stock_bajo` = «Pedir traslado de otra sede» (`:207`), `InventarioPanel.tsx:51-55` (`stock_bajo` = tono rojo), chips `:746-761`, leyenda `:57-62,:899-909`.
- **Por qué en este puesto:** una señal encendida en el 91 % de la tabla no informa (y rompe `MAX_ROJO_POR_PANTALLA`). Además recomienda una acción imposible hoy: AQP, LIM y Taller tienen 0 filas de stock `[producción]`. La cobertura que corregiría el criterio (`Cobertura` «N/D») todavía no existe porque la base tiene ventas desde el 2026-09-22 (25 salidas de venta en total).
- **Cómo lo verificas tú:** con los mismos 45 datos, la consulta del apéndice (Q2) deja de dar 41 en una sola categoría y `document.querySelectorAll` de elementos rojos en la página cuenta ≤ 2 (con el inspector, como en `productos.md` #4).
- **Esfuerzo / dependencias:** S–M. No antes de la #2: si el PR #445 se fusiona, sus filtros «Acción/Estado» reemplazan esta regla y la tarea se reduce a comprobar con los 45 datos reales que el nuevo estado no marque el 91 %. Decisión de negocio de Felipe (no del código): qué significa «Stock bajo» cuando cada lote es de 2 a 14 unidades y aún no hay historial de ventas; recomiendo chip ámbar «Reserva baja» y rojo solo para «sin nada y con demanda».

### #9 · Corregir — Un solo universo de variantes para «Disponible total», recomendaciones y ritmo
- **Dónde:** `fn_resumen_variantes` recorre las 126 variantes activas y **no menciona `es_prueba`** `[producción]` (comprobado), por lo que `filasSemana`/`filasRecientes` (`page.tsx:58-61`) traen la prueba (12 variantes, 160 uds) y las 69 variantes que la sede nunca recibió; de ahí salen `DisponibleTotalOverlay` (`existencias-categorias.ts:78-114`, `deltaDisponibleSede` `:138-142`) y «Ver recomendaciones (25)» (`page.tsx:91-92`, `existencias-recomendaciones.ts:31-36`). Corrección: en `page.tsx`, filtrar ambas listas por los `varianteId` de `stock` (el universo de la tabla); **no** recrear la RPC, que comparte Análisis y tiene parches vivos (buscar sus `reemplazar_vivo` antes).
- **Por qué en este puesto:** la tarjeta dice 203 y el desglose, que sale de otro universo, puede sumar otra cifra; y las recomendaciones alimentan traslados y órdenes de Producción. El efecto exacto del «25» `[inferido]`: no se puede medir sin una sesión de usuario (la RPC devuelve 0 filas sin `auth.uid()`).
- **Cómo lo verificas tú:** abre «Disponible total»: la suma por categoría iguala la tarjeta (203); busca en la tabla cada prenda de «Ver recomendaciones»: todas aparecen; compara el número «(25)» antes y después.
- **Esfuerzo / dependencias:** S. Ninguna. Si el efecto se confirma con una sesión real, esta tarea sube y el tope de 5 se justifica dos veces.

### #10 · Corregir — Candado de módulo en `mover_interno` y `apartar_stock`
- **Dónde:** `retail.mover_interno` y `retail.apartar_stock` (SECURITY DEFINER): validan `fn_puede_operar_ubicacion` y firman con `fn_actor_persona_id(true)`, pero **no llaman a `fn_ve_modulo`** `[producción]`; `bajar_al_piso` sí lo hace y `registrar_movimiento` lo hace vía `fn_puede_ajustar_inventario()`. ADR-0161: lo que ve una cuenta lo decide su rol módulo por módulo.
- **Por qué en este puesto:** un colaborador de la sede cuyo rol no ve Existencias puede mover piso y almacén o reservar unidades llamando a la RPC directamente; el daño es acotado (misma sede, sin alterar el total) pero contradice la regla que Felipe fijó y deja tres funciones con tres criterios. Decisión previa: qué módulo manda en `apartar_stock` (Existencias o el de apartados de Vender), para no romper `/vender/apartados`. `[no verificable]` cuál usa cada llamador sin leer `ApartarModal` y la caja.
- **Cómo lo verificas tú:** con una cuenta de prueba cuyo rol no ve Existencias, `select retail.mover_interno(...)` responde error de permiso; con un rol que sí lo ve y con el líder, pasa. Solo en base local o en un lote de producción que termina en excepción a propósito.
- **Esfuerzo / dependencias:** M. Ninguna. Antes de recrear cualquiera de las dos, buscar sus parches vivos (`reemplazar_vivo`): el PR #397 rompió Análisis en producción por olvidarlos.

### #11 · Mejorar — La tabla cabe en 1.280 px con sus acciones a la vista, y «recarga» se vuelve un botón
- **Dónde:** `InventarioPanel.tsx:411-413` (9 columnas ≈ 1.100 px de mínimos) y `:746-777` («Reponer» apilado bajo los chips; Apartar, Ajustar y «⋯» en la última columna); `page.tsx:117` («recarga para ver lo último» es un párrafo).
- **Por qué en este puesto:** `[visto captura 3]` la cabecera se corta en «En l…» y las acciones quedan fuera de vista en una laptop; la operación de piso también se hace en tablet. La tabla admite que «se desplaza» (comentario `:405-410`).
- **Cómo lo verificas tú:** a 1.440 y a 1.280 px todas las acciones de la fila se ven sin scroll horizontal; un botón «Recargar» junto a la hora cambia «Vista cargada a las…» al pulsarlo (`router.refresh()`).
- **Esfuerzo / dependencias:** M. No antes de la #2 (el PR #445 quita la columna Disponible y cambia estos anchos). Propuesta de partida: fusionar «En camino» y «En la red» en una sola columna hasta `xl`, y dejar las acciones pegadas a la derecha.

### #12 · Mejorar — bajo valor / opcional / futuro: cuatro pendientes chicos
- **Dónde y por qué es bajo valor:** (a) *Tallas en curva:* `InventarioPanel.tsx:280` usa `.sort()`, que da 28, 30, 32, Estándar, L, M, S, XL, XS; existe `compararTallas` (`lib/tallas.ts:35`) — es incomodidad, no riesgo. (b) *Borrar el reintento sin `cantidad_apartada`:* `inventario-v2.ts:113-136`, la columna existe en producción, son ~22 líneas de `select` duplicado (Carmack: antes de agregar, borra). (c) *Tarjeta «Reponer a piso hoy · 0»:* `InventarioPanel.tsx:443-462` deshabilitada cuando vale 0, como ya hace la píldora «Por colgar» (`[visto captura 4]`: hoy el clic deja la tabla vacía). (d) *Futuro:* llevar búsqueda y filtros a la URL (`?q=&marca=`) como Movimientos y Productos; hoy `useState` (`:250-254`) los pierde al salir.
- **Cómo lo verificas tú:** (a) el combo Talla muestra XS, S, M, L, XL, 28, 30, 32, Estándar (curva primero); (b) `pnpm typecheck` verde y la pantalla igual; (c) con «Reponer a piso hoy · 0» la tarjeta no responde al clic; (d) al volver de otra pantalla, la búsqueda sigue en el campo.
- **Esfuerzo / dependencias:** S cada una. No antes de la #2; (d) además después de la #4.

## 8 · Estrategia alternativa
**Existencias parte del stock (hoy) o parte del catálogo.** Decide Felipe.

| | Ganas | Pagas |
|---|---|---|
| **A · Mejorar la pantalla actual** (tareas #3, #4, #5, con el bloque «en el catálogo, sin stock aquí») — *recomendada* | Es M, no cambia la lectura ni los permisos, y contesta lo que Felipe vio; lo que la sede no ha recibido se avisa cuando se busca | 69 de 126 variantes siguen fuera de la tabla; AQP, LIM y el Taller siguen mostrando «no tiene stock todavía» |
| **B · Existencias parte del catálogo × sede** (todas las variantes activas con su cifra en esta sede, 0 si no hay fila, con «Solo lo que esta sede tiene» activo por defecto) | Nunca dice «no coincide» para algo que existe; una sede nueva arranca viendo qué le falta y puede pedir el traslado desde la propia fila | Lectura nueva (la de `stock` la comparten la caja, Cambios y Traslados, no se toca); 126 filas donde hoy hay 45 y hasta 6.000 a 3 años (≈ 3,9 MB, cuenta mía sobre 655 B por fila `[inferido]`); llena el semáforo de «Sin stock» hasta resolver la #8 |
| **C · Una lupa global de prenda** (una caja: escribes «cayla» y ves marca, categoría y prenda con stock por sede y «pedir traslado») | Es cómo se busca en el mostrador y resuelve la tarea raíz #7 por diseño | Pantalla nueva (L); reabre R-48 porque `fn_stock_por_sede` ya da cifras de toda la red a cualquier colaborador; convive con la lupa del menú móvil `[no verificable]` |

**Recomendación:** A ahora; decidir B o C cuando abra AQP o LIM, que hoy tienen 0 filas de stock `[producción]`. **Si no respondes, ejecuto A.**

## 9 · Referentes de ERP y futuro
Todo lo que sigue viene de memoria y **no está verificado** `[no verificable]`.
- **Odoo (Inventario):** su barra de búsqueda deja elegir el campo por el que se busca y filtrar y agrupar por categoría; la marca suele ir como atributo. **Shopify (inventario):** filtros por proveedor («vendor», su nombre para marca) y tipo de producto. **NetSuite:** listas guardadas.
- **Filtro «¿le sirve a 3 tiendas y 1 taller hoy?»:** *pasa* — buscar y filtrar por marca y categoría (5 marcas hoy en TRU), el vacío que explica, el bloque «sin stock en esta sede» y el ajuste con token. *No pasa todavía (futuro)* — filtros en cascada con conteos («Miramhe · 8»: con 5 marcas y 45 filas no aporta), vistas guardadas, búsqueda global entre sedes (opción C), valorización del inventario por marca, y paginar en el servidor (recién con más de ~10.000 filas de stock por sede: hoy 79, a 3 años ~8.300).

## 10 · Fuera de esta pantalla
**La caja de Vender busca la frase entera en un orden fijo** (`buscar-prenda-v2.ts:43-50`, fijado por `buscar-prenda-v2.test.ts:32`): «negro m» o «blusa negro» no encuentran nada aunque «blusa» sí. Es la búsqueda con clienta esperando, la de más frecuencia del ERP `[inferido]`, y hoy la marca sí se busca ahí pero no con varias palabras. Felipe dijo que buscar por marca es lo más rápido; en la caja, «cayla negro m» falla. `docs/BACKLOG.md:1041` la dejó como decisión aparte: conviene decidirla junto con la #7.

## 11 · Líneas propuestas para BACKLOG.md
- [ ] `[pantalla:inventario]` #1 Ajustar inventario: un solo envío con token, todo-o-nada (`ajustar_inventario`) — M
- [ ] `[pantalla:inventario]` #2 Decidir el destino del PR #445 antes de cablear en `InventarioPanel.tsx` — S/M
- [ ] `[pantalla:inventario]` #3 Buscador con marca y categoría y relevancia (motor + `getExistencias` + SQL de Movimientos); renombrar la prop `marca` de la celda a `senal` primero — M
- [ ] `[pantalla:inventario]` #4 Filtro «Marca» y marca en la fila y el CSV — M
- [ ] `[pantalla:inventario]` #5 Estado vacío que explica y separa «no existe» de «esta sede no lo ha recibido» — M
- [ ] `[pantalla:inventario]` #6 Decidir la estrategia alternativa (A/B/C, sección 8 de `docs/pantallas/inventario.md`) — S
- [ ] `[pantalla:inventario]` #7 Un solo motor de búsqueda de prendas para el ERP (caja, Productos, sinónimos de color, restos del código de etiqueta) — L
- [ ] `[pantalla:inventario]` #8 Semáforo de estado: 41 de 45 en «Stock bajo» rojo; decidir el umbral — S/M
- [ ] `[pantalla:inventario]` #9 «Disponible total», recomendaciones y ritmo del mismo universo que la tabla — S
- [ ] `[pantalla:inventario]` #10 Candado de módulo en `mover_interno` y `apartar_stock` (ADR-0161) — M
- [ ] `[pantalla:inventario]` #11 La tabla cabe en 1.280 px con acciones a la vista; botón «Recargar» — M
- [ ] `[pantalla:inventario]` #12 (bajo valor) Tallas en curva, borrar el reintento sin `cantidad_apartada`, tarjeta «Reponer a piso hoy · 0», filtros a la URL — S
- [ ] `[pantalla:inventario]` Reescribir `BACKLOG.md:37` («Sin tocar, por decisión de Felipe: buscar “CAYLA”…»): Felipe pidió lo contrario el 2026-09-26.

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Selector «TIENDA TRU» | Cambia la sede de toda la app; el `key` de `InventarioPanel` reinicia filtros | bien | `[código page.tsx:124]` |
| Cabecera | «Vista cargada a las 01:26 — recarga para ver lo último» | Solo texto; pide una acción que no tiene control | ajustar (#11) | `[código page.tsx:117]` `[visto captura 4]` |
| Cabecera | «Bajar al piso» | Enlace a `/inventario/bajar`, solo si el rol ve `bajada_piso` y es su sede | bien | `[código page.tsx:106-110]` |
| Cabecera | «+ Nuevo traslado» | Enlace a `/inventario/mover`, siempre visible | bien (candado no revisado) | `[código page.tsx:111-113]` `[no verificable]` |
| Prioridades | «VER RECOMENDACIONES (25)» | Abre `RecomendacionesOverlay`, solo lectura; cifra de otro universo | ajustar (#9) | `[código InventarioPanel.tsx:428-439]` `[visto captura 4]` |
| Prioridades | «REPONER A PISO HOY · 0» | Alterna `estado`; con 0 deja la tabla vacía y manda a «Por colgar» | ajustar (#12) | `[código :443-462]` `[visto captura 4]` |
| Prioridades | «DISPONIBLE TOTAL · 203» | Abre el desglose por categoría (universo de `filasSemana`) | ajustar (#9) | `[código :464-473]` `[visto captura 4]` |
| Prioridades | «EN CAMINO HACIA ACÁ · 0» | Enlace a `/inventario/traslados` | bien | `[código :474-480]` |
| Prioridades | «DAÑADO / CUARENTENA · 0» | Abre `ResolverDanadosModal` | bien | `[código :481-493]` |
| Distribución | Barra 78 % piso / 22 % almacén | Cifras de `resumen`; «apartado» es botón solo si hay | bien | `[código :500-534]` `[visto captura 4]` |
| Distribución | «Ver análisis de cobertura» | Abre `AnalisisCoberturaOverlay` | bien | `[código :537-543]` |
| Filtros | Caja «Buscar» | Filtra en memoria con el motor especial; no indexa marca ni categoría; sin `spellCheck` | falta (#3) | `[código :296-315,:553]` `[visto captura 4]` |
| Filtros | «Categoría: todas» | Igualdad exacta sobre las categorías de la sede | bien | `[código :554-561]` |
| Filtros | «Marca» | No existe | falta (#4) | `[visto captura 4]` |
| Filtros | «Talla: todas» | Opciones con `.sort()` alfabético | ajustar (#12) | `[código :280,:562-570]` |
| Filtros | «Color: todos» | Opciones de la sede; sin sinónimos de la base | ajustar (#7) | `[código :571-579]` `[producción]` |
| Filtros | «Estado: todos» | Mezcla Dañado, Por colgar y el semáforo de 4 estados | ajustar (#8, #2) | `[código :580-594]` |
| Filtros | Píldora «Por colgar · 9 tallas · 20 uds» | Alterna el mismo filtro; cuenta toda la sede | bien | `[código :600-616]` `[visto captura 4]` `[producción]` |
| Filtros | «LIMPIAR FILTROS» | Borra búsqueda y los cuatro filtros | bien (incluirá Marca) | `[código :352-355,:640]` |
| Vacío | «Ningún producto coincide con la búsqueda.» | Una frase para cualquier vacío | ajustar (#5) | `[código :653-659]` `[visto captura 4]` |
| Tabla | Cabecera de 9 columnas | Producto, Piso·Almacén, Disponible, Cobertura, Ritmo, Prioridad/Estado, En camino, En la red, acciones | ajustar (#11) | `[código :665-689]` `[visto captura 3]` |
| Tabla | Chips «Por colgar» y «Stock bajo» | Informan; «Stock bajo» en rojo en el 91 % | ajustar (#8) | `[código :746-761]` `[visto captura 3]` `[producción]` |
| Tabla | «Reponer» | `mover_interno` con token (bajar del almacén al piso) | bien | `[código :767-777]` `[producción]` |
| Tabla | «Apartar» | `apartar_stock` con token; falta candado de módulo | ajustar (#10) | `[código :826-834]` `[producción]` |
| Tabla | «Ajustar» | `registrar_movimiento` por variante, sin token | ajustar (#1) | `[código :836-844]` `[producción]` |
| Tabla | «⋯» Retirar del piso / Ver historial | `mover_interno` al almacén; `router.push` al historial | bien | `[código :863-880]` |
| Pie | «Exportar CSV» | Descarga todas las páginas filtradas; sin Marca | ajustar (#4) | `[código :387-404,:891-897]` |
| Pie | Paginador «Mostrando 1–15 de N prendas» | 15 filas; «prendas» cuenta variantes | bien | `[código :324-334,:889-890]` |
| Pie | Leyenda de estados | Puntos y acciones por estado | ajustar (#8) | `[código :899-909]` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-26 | completo | 5/10 (promedio 6.0, con tope 5) | 7.4 — Soporte | primer análisis |

## Apéndice · consultas para confirmar (solo lectura, proyecto `cayla-dynamic`, schema `retail`)
Q1 · ¿Cuántas variantes y marcas ve Existencias en TRU? (esperado: 45 variantes, 5 marcas, 203 uds)
```sql
select count(distinct v.id) as variantes, count(distinct m.nombre) as marcas
from retail.stock s
join retail.variantes v on v.id = s.variante_id and v.activo
join retail.productos p on p.id = v.producto_id and not p.es_prueba
join retail.marcas m on m.id = p.marca_id
where s.ubicacion_id = (select id from retail.ubicaciones where nombre ilike '%TRU%' limit 1);
```
Q2 · Estado de las 45 prendas con la regla de `calcularEstado` (esperado: 4 sin stock, 41 stock bajo, 0 reponer piso, 0 normal, 9 por colgar)
```sql
with por_var as (
  select s.variante_id,
    sum(s.cantidad) filter (where ss.tipo = 'piso_venta') as piso,
    sum(s.cantidad) filter (where ss.tipo = 'almacen_tienda') as alm
  from retail.stock s
  join retail.sububicaciones ss on ss.id = s.sububicacion_id
  join retail.variantes v on v.id = s.variante_id and v.activo
  join retail.productos p on p.id = v.producto_id and not p.es_prueba
  where s.ubicacion_id = (select id from retail.ubicaciones where nombre ilike '%TRU%' limit 1)
  group by 1)
select count(*) filter (where coalesce(piso,0) <= 0 and coalesce(alm,0) <= 0) as sin_stock,
       count(*) filter (where not (coalesce(piso,0) <= 0 and coalesce(alm,0) <= 0) and coalesce(alm,0) <= 10) as stock_bajo,
       count(*) filter (where coalesce(alm,0) > 10 and coalesce(piso,0) <= 7) as reponer_piso,
       count(*) filter (where coalesce(alm,0) > 10 and coalesce(piso,0) > 7) as normal,
       count(*) filter (where coalesce(piso,0) <= 0 and coalesce(alm,0) > 0) as por_colgar
from por_var;
```
Q3 · ¿Qué escrituras llevan token y cuáles llaman a `fn_ve_modulo`? (esperado: `registrar_movimiento` sin `p_token`; `mover_interno` y `apartar_stock` sin `fn_ve_modulo`)
```sql
select p.proname, pg_get_function_arguments(p.oid) as argumentos,
       (p.prosrc ~* 'fn_ve_modulo') as llama_fn_ve_modulo
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'retail' and p.proname in ('registrar_movimiento','mover_interno','apartar_stock','bajar_al_piso')
order by 1;
```
Q4 · ¿`fn_resumen_variantes` mira `es_prueba`? (esperado: 0)
```sql
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'retail' and p.proname = 'fn_resumen_variantes' and p.prosrc ~* 'es_prueba';
```
