# Pantalla — Existencias (`/inventario`)

> Modo: completo · Fecha: 2026-09-26 · Rol/sede: líder, Tienda Lima (base LOCAL con la siembra estándar) · Dispositivos: celular a 375 px (el ADR-0237 dice que «la mayoría usará el teléfono gran parte del día») y computadora a 1440 px · Datos: **sin SQL** (Felipe eligió seguir sin correr las consultas en producción): las cifras son de la base local y van `[local]`; lo que solo producción puede decir va `[no verificable]`.
> SHA analizado: **`ffa5d52b`, la cabeza del PR #500** (rama `claude/existencias-screen-analysis-1f7b5e`, ADR-0237, abierto y sin fusionar), no `origin/main` (`60d7aadb`). Es a propósito: el #500 reemplaza la pantalla que hoy está en `main`, y analizar la de `main` habría vencido el mismo día (le pasó al análisis anterior con el #445). `git merge-tree --write-tree ffa5d52b origin/main` no da conflictos, pero `main` cambió `AjustarInventarioModal.tsx` (ADR-0235) después de que el #500 se ramificó: ver tarea #2. Si el #500 cambia antes de fusionarse, o si no se fusiona, este análisis está vencido.
> Archivos: `app/(app)/inventario/page.tsx` · `components/InventarioPanel.tsx` · `ExistenciasPorPrenda.tsx` · `DetallePrendaExistencias.tsx` · `EscanerBusqueda.tsx` · `ReponerPisoModal.tsx` · `ApartarModal.tsx` · `AjustarInventarioModal.tsx` · `BajarAlPisoForm.tsx` · `lib/existencias-prendas.ts` · `lib/inventario-v2.ts` · `lib/inventario-reglas.ts` · `lib/bajada-reglas.ts` · `lib/etiquetas-precio.ts` · `lib/politica-operativa-inventario.ts` · `lib/resumen-inventario.ts` · RPC `mover_interno`, `bajar_al_piso`, `apartar_stock`, `registrar_movimiento`, `cargar_stock_inicial` (main), `listar_apartados`, `fn_stock_por_sede_json`, `fn_resumen_variantes_json`, `fn_ritmo_reciente_json` · tablas `stock`, `sububicaciones`, `variantes`, `productos`, `apartados`, `transferencias`, `transferencia_items`, `prendas_danadas`, `roles`, `rol_modulos`
> **Actualización (misma noche):** el #500 se fusionó a `main` a las 20:30 del 2026-09-26 (merge `05939339`), antes de que este análisis terminara de escribirse: vale para `main`. Felipe ordenó la **#2** y la **#4**; las dos están hechas en la rama `claude/ajustar-carga-inicial-sin-bajada` (ver cada tarea). La #2 se hizo **al revés de lo que proponía este archivo**: ver su nota.
> Otra sesión tocándola: **sí.** El PR #500 es de la sesión `existencias-screen-analysis-1f7b5e` (su worktree ya no está en esta Mac). Ninguna de sus tareas pendientes (cifras Por recibir/Apartadas, fila de avisos, Conteo con lista) choca con las de abajo, pero las #2, #3, #4 y #7 tocan archivos del PR: conviene hacerlas en su rama antes del merge o justo después.
> Mapa del código: un subagente de solo lectura; yo repetí las comprobaciones que sostienen las tareas #2, #3 y #4. Etiquetas: `[visto]` recorrido en el navegador · `[código archivo:línea]` · `[local]` consulta de solo lectura a la base local · `[inferido]` · `[no verificable]`.

## 0 · Veredicto
El #500 hace lo que prometía: la lista por prenda, el detalle y la barra de varias funcionan y llevan a Bajar al piso, Mover mercadería y Etiquetas con la lista ya cargada. Pero **abre por el detalle, a un toque de cualquiera que vea Existencias, tres escrituras de stock cuyos candados están solo en la pantalla**. Además, «Ajustar» sigue sin ser todo-o-nada, y al fusionar con `main` va a fallar para quien no tiene «Bajada al piso».
**Cumple su finalidad:** 5/10 (promedio 6.3; tope 5 por el ajuste que puede duplicarse) · **Relevancia:** 7.8/10 — Soporte (en el borde de Núcleo)

## 1 · Finalidad declarada
«Existencias existe para que la tienda sepa qué tiene, dónde está (piso, almacén, en camino, dañado) y qué debe reponer hoy, y actúe sobre eso sin salir.» Fuentes: `docs/ARQUITECTURA.md` (§`/inventario`, ADR-0071 unificó piso y almacén aquí), ADR-0231 («Acción hoy»: una sola regla de piso) y ADR-0237 (el «sin salir» es el aporte del #500). `docs/datos/modulos/05-inventario-y-movimientos.md` avisa en su encabezado que describe V1: no se usó como vigente.
**¿Docs y pantalla coinciden?** En lo esencial sí. La diferencia está en el alcance: el ADR-0237 promete que «cada acceso solo [aparece] si el rol ve ese módulo», y en el detalle de la prenda eso no se cumple (tarea #3).

## 2 · Objeción
**Hay dos puertas para la misma escritura de stock, y solo una tiene candado.**
- Bajar prendas del almacén al piso:
  - El botón «Bajar al piso» de la cabecera exige el módulo «Bajada al piso» `[código page.tsx:163]`, y la base también lo exige `[código 20260926000200_bajada_piso_funciones.sql:138]`.
  - «Reponer al piso» y «Retirar del piso» del detalle hacen el mismo movimiento con `mover_interno`, y ahí no pregunta nadie: ni la pantalla (`puedeReponer = separaConSububicaciones && enSedeActiva`) `[código InventarioPanel.tsx:471-472]` ni la base `[código 20260926200100_mover_interno_con_marca.sql, sin fn_ve_modulo]`.
- Apartar: con `apartar_stock` pasa lo mismo `[código ApartarModal.tsx:66; 20260920160000_apartar_stock.sql:317]`.
- En la base local, el rol **integrante** ve Existencias y NO tiene «Bajada al piso» ni «Apartados» `[local: roles × rol_modulos]`. O sea: el sistema dice que ese rol no baja ni aparta, y la pantalla le deja hacer las dos cosas.
- El hueco ya existía antes del #500, en el menú «⋯» de cada fila (tarea #10 del análisis anterior). El #500 lo pone al frente: es el primer botón del detalle.

**Trade-off.** Cerrar la puerta de atrás obliga a decidir qué módulo es dueño de «mover piso ↔ almacén». Mientras nadie lo decida, las dos puertas seguirán diciendo cosas distintas (tarea #3).

Segunda objeción, menos visible:
- **La bajada que llega desde Existencias viene armada con 1 unidad por talla y se confirma sin escanear nada** `[visto: 4 tallas de 2 prendas llegaron a «Bajar prendas al piso» con 1 c/u y «Confirmar bajada · 4 prendas» activo]`.
- La pantalla de bajada está pensada para lo contrario: «Cada lectura suma 1» `[código BajarAlPisoForm.tsx:561]`. Lo que queda registrado es lo que se escaneó al colgar.
- Precargada, registra lo que el sistema sugirió, no lo que la vendedora colgó.
- Si las dos cosas no coinciden, el piso del sistema deja de ser el piso real. La venta descuenta del piso, así que el error aparece después en la caja (tarea #4).

## 3 · Lo que está bien y no se toca
- **Una sola regla decide «reponer»**:
  - La curva, el borde ámbar, «Reponer N tallas», la tarjeta y el filtro leen el mismo `accionHoy` de ADR-0231 `[código existencias-prendas.ts:35-45]`.
  - El #500 no inventó un umbral propio.
- **Llevar con la lista cargada, sin hacer el trabajo aquí**:
  - La barra lleva a las pantallas que ya validan y escriben con candado: `bajar_al_piso` es todo-o-nada, con token y `fn_bloquear_en_orden` `[código bajada_piso_funciones.sql:109-235]`.
  - Existencias no duplica esa lógica: patrón correcto (Carmack).
- **`mover_interno` y `apartar_stock` son atómicos**:
  - Llevan token de reintento y bloqueo de fila `[código mover_interno_con_marca.sql:88-103; apartar_stock.sql:101-200]`.
  - Lo que les falta es el candado de módulo, no la integridad.
- **La pistola y la cámara abren solo el código exacto, y solo entre las prendas de esta sede** `[código existencias-prendas.ts:161-165]`: un pedazo de código nunca abre otra talla por parecerse.
- **El detalle es claro para alguien sin contexto** `[visto]`:
  - Cada acción es verbo + qué pasa («Llega a «Mover mercadería» con la prenda ya cargada; ahí eliges destino y cantidad»).
  - Tocar una talla muestra solo lo que se puede hacer con ella: sin almacén no aparece «Reponer»; sin piso no aparece «Retirar».
- **Paleta**: tokens de `globals.css` y ningún rojo de marca en superficie, salvo el punto del chip «Dañado» `[visto + medición de colores calculados]`.
- **Borrador de bajada**: si hay una bajada a medias en el aparato, gana el borrador `[código BajarAlPisoForm.tsx:176-184]`. Lo ya escaneado no se pisa.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7 | Coherente con CAYLA, pero cada fila lleva un botón negro «Reponer N tallas» (11 de 11 en Lima local): el primario deja de jerarquizar | `[visto]` |
| Lógica de negocio | 5 | La bajada precargada rompe «lo registrado es lo que se colgó»; «Etiquetas» imprime todos los colores; apartados en filas en la cabecera y en unidades en el panel | `[visto]` `[código]` |
| Arquitectura | 5 | Candados de módulo solo en la pantalla; «Ajustar» sin token ni transacción; una lectura secundaria tumba la pantalla entera | `[código]` `[local]` |
| Funciones | 7 | Todo lo visible está cableado; dos promesas del ADR no se cumplen (aviso de más de 100, accesos por módulo) | `[visto]` `[código]` |
| Utilidad | 6 | En el celular la primera prenda aparece a unas 2,5 pantallas de scroll; la notación «0·6» se explica con una leyenda que está abajo del todo | `[visto]` |
| Conexión con el ERP | 8 | La pantalla que mejor conecta Inventario hoy; faltan «pedir traslado» y «contar esta prenda» | `[visto]` `[código]` |

### Estética — 7
- (a) Coherencia con CAYLA:
  - Crema, papel, tinta, hueso y ámbar para «por colgar» `[visto]`.
  - La medición de colores calculados en `/inventario` no encontró `--color-rojo` ni `--color-rojo-profundo` en superficie, salvo el punto del chip «Dañado · 1» (dentro del límite de 2).
  - Las tarjetas son `TarjetaPrioridad`, no `TarjetaCifra` `[código InventarioPanel.tsx:171]`. ADR-0169 pide `TarjetaCifra`; es una diferencia que ya venía del #445.
- (b) Jerarquía:
  - En Lima local, las 11 prendas llevan el botón negro «Reponer N tallas» `[visto]`: es el mismo peso visual que «+ Nuevo traslado», el primario de la cabecera.
  - Cuando todo es urgente, nada lo es.
- (c) Heurísticas:
  - La curva `0·6` necesita leyenda. Existe, pero en computadora queda al pie de la tabla y en el celular no se ve cerca de la curva `[visto]`.
  - Los objetivos táctiles de la curva miden ~38 px a 375 px `[visto]`: aceptable, bajo los 44 px recomendados.

### Lógica de negocio — 5
- **Bajada precargada**:
  - `urlBajarAlPiso` arma 1 unidad por talla `[código existencias-prendas.ts:119-137]`.
  - `lineasIniciales` la deja lista para confirmar `[código bajada-reglas.ts:213-224]`.
  - ADR-0231 dice que «CAYLA no sugiere cuánto reponer» y ADR-0237 lo cumple a medias: no sugiere una cantidad, pero precarga una (1) que se confirma sin tocar.
  - Ninguna decisión escrita (D-nn) cubre si la bajada debe ser escaneada. El diseño de `BajarAlPisoForm` («cada lectura suma 1») lo da por hecho.
- **Etiquetas del detalle**:
  - El detalle dice «Todas sus tallas en esta tienda», pero `urlEtiquetas` manda `?producto=` cuando las tallas son de un solo producto `[código existencias-prendas.ts:147-151]`.
  - Resultado: desde la Casaca Ximena Azul marino se imprimen también las etiquetas de la Negra.
  - Además `stockEnTienda` cuenta lo físico (`cantidad > 0`, incluye apartado y cuarentena) `[código etiquetas-precio.ts:141]`.
- **Apartados**:
  - La cabecera muestra cuántos apartados hay abiertos (`apartados.length`) `[código page.tsx:192]`.
  - El panel muestra unidades apartadas (`stock.cantidad_apartada`) `[código InventarioPanel.tsx:652-660]`.
  - Son dos números para «apartados», uno junto al otro.
- **Umbral 4** (ADR-0231):
  - En Lima local, 33 de 33 tallas piden reponer `[local Q7]`.
  - En producción no se midió `[no verificable]`. ADR-0071 lo había subido a 7 porque «con 4 el aviso llegaba tarde».
  - Con la siembra local, la señal no distingue nada. Es la misma enfermedad que el «Stock bajo en 41 de 45» del análisis anterior, con otra cara.
- Referente (de memoria, no verificado): Shopify POS y Lightspeed muestran el disponible por talla en una grilla talla × ubicación y dejan «transferir» desde la misma ficha. El #500 ya se parece a eso. Lo que no tienen es la separación piso/almacén dentro de la tienda, que en CAYLA es real y es la razón de esta pantalla.

### Arquitectura — 5
- **Candados**:
  - Ver Objeción. `fn_puede_operar_ubicacion` sí protege la sede. Lo que falta es el módulo.
- **Transacción de «Ajustar»**:
  - El modal hace una llamada `registrar_movimiento` por línea, sin token `[código AjustarInventarioModal.tsx:176-206]`.
  - Si la red se corta a mitad, quedan líneas aplicadas y otras no, y un reintento duplica las aplicadas.
  - Es la tarea #1 del análisis anterior, todavía abierta. El #500 la pone a un toque en el detalle.
- **Tras fusionar con `main`**:
  - `cargar_stock_inicial` (ADR-0235) llama a `bajar_al_piso` cuando la carga va al piso `[código origin/main:20260927153100:63]`.
  - `bajar_al_piso` exige `fn_ve_modulo('bajada_piso')` `[código bajada_piso_funciones.sql:138]`.
  - `cargar_stock_inicial` se deja pasar con `fn_puede_ajustar_inventario()`, que acepta a quien ve Existencias, Conteos o Traslados.
  - Resultado: un integrante que puede ajustar y no tiene «Bajada al piso» recibe un error al cargar al piso una prenda que la tienda nunca tuvo `[inferido del código; en local el rol integrante está en ese caso]`.
- **Caída parcial**:
  - Si falla `fn_resumen_variantes_json`, cae toda la pantalla, porque usa `exigir` `[código resumen-inventario.ts:44]`, aunque solo alimenta el «% vs hace 7 días» de una tarjeta.
  - Catálogo, ritmo y `es_prueba` sí se degradan con gracia.
  - Frase que falta escribir: «si el resumen no responde, la tarjeta dice "sin comparación" y el resto de la pantalla sigue».
- **Volumen**:
  - `transferencia_items` se lee sin paginar `[código inventario-v2.ts:257]`: PostgREST corta en 1.000 filas sin avisar.
  - Con 3 tiendas y 1 taller, a ~40 ítems por traslado y ~5 traslados por semana, son unas 10.000 filas por año `[inferido]`. Pasa el tope en el primer trimestre.
  - Hoy filtra por estado, así que el riesgo real depende de cuántos ítems haya «en tránsito» a la vez `[no verificable sin SQL]`.
- **Concurrencia**: dos vendedoras reponen la misma talla en el mismo segundo. `mover_interno` bloquea la fila y la segunda falla con «stock insuficiente» si ya no queda. Bien. No se puede apartar la última unidad dos veces (bloqueo en `fn_aplicar_movimiento`). Bien.

### Funciones — 7
- **Existen y funcionan** `[visto]`:
  - lista por prenda con curva;
  - detalle con talla elegida → «Reponer al piso» abre el modal de siempre (comprobado con un clic directo);
  - barra de varias → «Bajar al piso» llega con 4 líneas;
  - accesos de la cabecera;
  - vista «Por talla».
- **Fantasmas o a medias**:
  - «Reponer N tallas» abre el detalle en la primera talla por colgar **o** que pide reponer `[código ExistenciasPorPrenda.tsx:158]`. Si esa talla no tiene almacén, el detalle no muestra «Reponer».
  - Con más de 100 tallas marcadas, los botones de la barra desaparecen sin aviso, aunque el comentario dice «la barra avisa» `[código existencias-prendas.ts:130-131]`.
- **Faltan**:
  - «Pedir traslado» desde «Dónde más hay» (se muestra dónde hay, sin botón; decisión abierta de ADR-0231/0237).
  - «Contar esta prenda» (Conteo no acepta lista).
- **Sobran**: el chip «Por colgar · 28 tallas · 164 uds» junto a la tarjeta «Reponer a piso hoy · 33 variantes» `[visto]`. Son dos conteos vecinos para casi lo mismo; una persona sin contexto no sabe cuál manda.

### Utilidad (persona sin contexto) — 6
Escenario: una vendedora nueva en Lima, sábado 4 p. m., con el celular. Una clienta pregunta si hay la Casaca Ximena azul en M.
1. Abre Existencias. Ve la cabecera con 5 botones apilados, «Prioridades de hoy» y 4 tarjetas, una debajo de otra `[visto a 375 px]`. **La primera prenda está a unas 2,5 pantallas de scroll.**
2. Opción rápida: «Escanear prenda» está fijo abajo. Si tiene una etiqueta en la mano, bien. Si solo tiene el nombre, tiene que bajar hasta el buscador.
3. En el buscador escribe «ximena». Aparecen dos filas con curvas `0·6`. **¿Qué es «0·6»?** La leyenda está al pie de la lista. Duda.
4. Toca la fila → el detalle dice «Libre en piso 0 · almacén 18». Toca M → «Talla M · Piso 0 · Almacén 6». Entiende: hay, pero está en el almacén. Bien.
5. Toca «Reponer al piso» → modal, confirma. Si su rol no tiene «Bajada al piso», el sistema la deja igual (Objeción). Ella no se equivoca: el sistema se contradice.

Escenario 2: una líder en TRU mira AQP (`?ubicacion=`) y toca «Imprimir etiquetas» en el detalle. Imprime las de **TRU**, la sede activa, no las de AQP, que es la que está mirando `[código DetallePrendaExistencias.tsx:107,212; etiquetas-de-precio/page.tsx:35-39]`. «Ver historial» también muestra la sede activa.

### Conexión con el ERP — 8
Ver sección 6. Es la pantalla que más conecta el módulo de Inventario hoy.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 8 | Decide qué colgar hoy y dónde está cada talla; indirecto: la separación piso/almacén que la caja usa al vender sale de lo que aquí se mueve |
| Dinero y stock que toca | ×1 | 8 | Mueve stock (reponer, retirar), lo reserva (apartar) y lo corrige (ajustar) |
| Frecuencia y personas que la usan | ×1 | 9 | Todas las vendedoras, todos los días, sobre todo en el teléfono (ADR-0237) |
| Qué se detiene si falla | ×1 | 6 | Vender sigue funcionando; se detiene reponer y apartar desde el piso (Bajar al piso tiene su propia pantalla) |

Relevancia = (2·8 + 8 + 9 + 6) / 5 = **7.8** — Soporte, en el borde de Núcleo.

## 6 · Conexión con el ERP
- **Aguas arriba:**
  - `stock` (snapshot derivado de `movimientos`, principio 4);
  - `fn_stock_por_sede_json` («Dónde más hay»);
  - `transferencia_items` («En camino»);
  - `prendas_danadas`;
  - `listar_apartados`;
  - el ritmo de `fn_ritmo_reciente_json`;
  - el catálogo (`productos`, `variantes`, `marcas`).
- **Aguas abajo:**
  - Directo, a través de sus modales: `mover_interno`, `apartar_stock` y `registrar_movimiento`.
  - A través de las pantallas vecinas: `/inventario/bajar` (`bajar_al_piso`), `/inventario/mover` (traslados) y `/etiquetas-de-precio`.
  - Vender descuenta del `piso_venta`: todo lo que desincronice piso y almacén aquí se ve después en la caja.
- **Pájaro dueño y vecinos:** HALCÓN (inventario y movimientos). Vecinos: Traslados, Conteo, Apartados (ventas), Etiquetas (catálogo).
- **Externos, y qué pasa si caen:** ninguno directo; SUNAT no interviene. Si cae Supabase, no hay pantalla: se degrada a «no se puede ver ni mover». No se pierde un movimiento a medias, porque las escrituras son atómicas, salvo «Ajustar» (tarea #1).

## 7 · Las 12 tareas, por importancia

### #1 · Corregir — «Ajustar inventario»: un solo envío, con token, todo-o-nada — ✅ hecha (2026-09-26, ADR-0240; sin pegar en producción)
- **Dónde:** `components/AjustarInventarioModal.tsx:176-206` (loop por línea) · RPC `registrar_movimiento` (sin `p_token`) · nueva RPC de lote en una migración propia.
- **Por qué en este puesto:**
  - Es el único camino desde Existencias que puede dejar el stock a medias o duplicado.
  - Un corte de red a mitad de un ajuste de 6 líneas aplica 3; el reintento aplica 6 más.
  - Ya era la #1 del análisis anterior; el #500 la deja a un toque en el detalle.
- **Cómo lo verificas tú:** en Ajustar, carga 3 líneas, pon el navegador en «sin conexión» después de tocar Guardar y vuelve a guardar al reconectar. En Movimientos debe haber **un** ajuste con 3 líneas, no 6 ni 2.
- **Esfuerzo / dependencias:** M · después de fusionar el #500 con `main` (el modal cambió con ADR-0235: partir de esa versión).

### #2 · Corregir — Al fusionar con `main`, «Ajustar» al piso falla para quien no tiene «Bajada al piso» — ✅ hecha (2026-09-26)
- **Hecha, pero al revés de lo propuesto abajo.** ADR-0212 ya había decidido para «Nuevo producto» que «colgadas en el piso» es una bajada y pide su módulo, y que la pantalla lo apaga con su explicación. Quitarle el requisito a `cargar_stock_inicial` habría dejado dos reglas para la misma operación. Se hizo lo que ya hace el alta: sin «Bajada al piso», lo nuevo entra al almacén y la fila lo dice (`cargaInicialAlPiso`, `textoPrendaNueva` en `lib/ajuste-reglas.ts`). La base no cambia. Detalle: ADR-0235, «Actualización 2026-09-26 (noche)». Error de este análisis: no buscó la decisión escrita antes de proponer.
- **Dónde:** `origin/main:supabase/migrations/20260927153100_cargar_stock_inicial_de_prenda_existente.sql:49,63` → `bajar_al_piso` (`20260926000200_bajada_piso_funciones.sql:138`, `fn_ve_modulo('bajada_piso')`).
- **Por qué en este puesto:**
  - Rompe un flujo real el día del merge, sin conflicto de git que lo avise.
  - La carga inicial se autoriza con `fn_puede_ajustar_inventario()`, pero por dentro llama a una función que exige otro módulo.
  - Además, las tres migraciones del #496 no están aplicadas en producción (memoria de la sesión de Movimientos, 2026-09-26) `[no verificable sin SQL]`.
  - Arreglo propuesto: que `cargar_stock_inicial` baje al piso con el mismo cuerpo interno (`fn_aplicar_movimiento`) sin pasar por la puerta pública de `bajar_al_piso`. O, si Felipe decide que cargar al piso ES bajar al piso, que la pantalla lo diga antes de guardar.
- **Cómo lo verificas tú:** con una cuenta **integrante** (en local no tiene «Bajada al piso»), en una prenda que Lima nunca tuvo: Ajustar → Piso → +3 → Guardar. Hoy (tras el merge): error. Arreglado: queda en el piso, y Movimientos muestra la carga.
- **Esfuerzo / dependencias:** S · se hace en `main` (es del #496), antes o junto con aplicar sus migraciones en producción.

### #3 · Corregir — Una sola puerta por escritura: mismo candado en el botón y en la base — ✅ hecha con la opción A (2026-09-26, ADR-0240; sin pegar en producción)
- **Hecha:** las puertas se llaman `mover_entre_piso_y_almacen` y `apartar_prenda`. El candado NO va dentro de `mover_interno` ni de `apartar_stock`, porque las usan otras funciones por dentro (recibir un traslado aparta sola la prenda de un pedido). **Antes de publicar**, hay que encender los módulos en los roles que hoy reponen (ADR-0240, «Se rompe si»).
- **Dónde:** `InventarioPanel.tsx:471-472` (`puedeReponer`, `puedeApartar`) · `DetallePrendaExistencias.tsx:178-191` · `ExistenciasPorPrenda.tsx:158` («Reponer N tallas») · RPC `mover_interno` y `apartar_stock` (agregar `fn_ve_modulo`).
- **Por qué en este puesto:**
  - Hoy «Bajar al piso» (cabecera) y «Reponer al piso» (detalle) son la misma escritura con dos candados distintos (Brooks: una de las dos está mal).
  - En local, integrante ve Existencias sin «Bajada al piso» ni «Apartados» `[local]`, y el detalle le deja hacer las dos cosas.
  - ADR-0161 dice que el rol decide qué hace cada cuenta, y aquí la pantalla pasa por encima de eso.
  - **Decide Felipe cuál candado manda**:
    - (A) mover piso ↔ almacén es de «Bajada al piso», y Apartar es de «Apartados»: se cierran el detalle y la base;
    - (B) reponer una talla es parte de «Existencias»: se abre el botón de la cabecera.
    - Recomiendo A: es lo que ya dice Roles y accesos.
- **Cómo lo verificas tú:** con una cuenta integrante sin «Bajada al piso», abre una prenda por colgar → no aparece «Reponer al piso». Y desde la consola del navegador, `supabase.rpc('mover_interno', …)` con esa cuenta responde «sin acceso».
- **Esfuerzo / dependencias:** M (migración + pantalla) · decisión A/B de Felipe primero.

### #4 · Corregir — La bajada que llega desde Existencias se escanea, no se confirma a ciegas — ✅ hecha (2026-09-26)
- **Hecha:** lo marcado llega en 0, «Por escanear»; cada lectura lo llena; confirmar sin escanear está apagado. ADR-0237, «Actualización 2026-09-26 (noche)».
- **Dónde:** `lib/existencias-prendas.ts:119-137` (`urlBajarAlPiso`, 1 u por talla) · `lib/bajada-reglas.ts:213-224` (`lineasIniciales`) · `components/BajarAlPisoForm.tsx:176-184, 561`.
- **Por qué en este puesto:**
  - La venta descuenta del piso. Si se «baja» en el sistema lo que no se colgó, la caja dice «stock insuficiente» con la prenda en la mano, o al revés.
  - La pantalla de bajada se diseñó para escanear lo que se cuelga, y la precarga la convierte en un formulario de confirmación.
  - Propuesta: que la lista llegue como **«lo que buscas»** (con cantidad 0 y su almacén a la vista) y que cada lectura la vaya llenando; «Confirmar» solo cuenta lo escaneado.
- **Cómo lo verificas tú:** marca 2 prendas → «Bajar al piso». Sin escanear nada, «Confirmar bajada» debe decir «0 prendas» (o estar apagado). Escanea una talla → sube a 1.
- **Esfuerzo / dependencias:** S–M · no depende de otras.

### #5 · Mejorar — Que «Reponer» distinga: ordenar por urgencia y un solo primario por pantalla — ✅ hecha (2026-09-26; el umbral sigue abierto)
- **Dónde:** `lib/politica-operativa-inventario.ts:14-36` (umbral 4) · `components/ExistenciasPorPrenda.tsx` (botón negro por fila) · orden de `agruparPorPrenda` (`existencias-prendas.ts:77-107`).
- **Por qué en este puesto:**
  - En Lima local, 11 de 11 prendas y 33 de 33 tallas piden reponer `[visto][local]`. Una señal que marca todo no ayuda a decidir.
  - Propuesta:
    - las prendas con piso libre 0 van arriba («por colgar», lo que de verdad falta en el piso);
    - el botón de fila pasa a secundario;
    - el umbral se confirma en producción (decisión abierta de ADR-0231).
- **Cómo lo verificas tú:** en Lima, las primeras filas son las que tienen el piso en 0, y en la pantalla hay un solo botón negro (el de la cabecera). En producción: la consulta Q7 del anexo cuenta cuántas tallas piden reponer por sede.
- **Esfuerzo / dependencias:** S · el umbral espera a Felipe; el orden y el botón no.

### #6 · Mejorar — Celular: la primera prenda en la primera pantalla — ✅ hecha (2026-09-26: de ~1.900 px a 764 px; queda bajo el botón «Escanear»)
- **Dónde:** `app/(app)/inventario/page.tsx:160-195` (5 accesos apilados) · `InventarioPanel.tsx:664` (tarjetas en una columna) · fila de filtros (5 combos a ancho completo).
- **Por qué en este puesto:**
  - El #500 existe para el teléfono (ADR-0237), y a 375 px la lista empieza a unas 2,5 pantallas de scroll `[visto]`.
  - Propuesta para menos de `sm`:
    - accesos en una fila de iconos o en un menú «Más»;
    - cifras en una tira horizontal de 2 × 2 compacta;
    - filtros tras un botón «Filtros (n)», dejando el buscador a la vista.
  - Casillero PL-105: todo PR que toque piso se prueba a 375 px.
- **Cómo lo verificas tú:** a 375 px, al entrar se ve el buscador y al menos la primera prenda sin hacer scroll.
- **Esfuerzo / dependencias:** M · ninguna.

### #7 · Corregir — La letra chica del detalle: que cada acción haga lo que dice — ✅ hecha (2026-09-26, ADR-0237 act.)
- **Dónde:**
  - `existencias-prendas.ts:147-151`: «Etiquetas» manda `?producto=`, que imprime todos los colores; debe mandar las `variantes` de esta prenda.
  - `DetallePrendaExistencias.tsx:107,212,215`: Etiquetas e Historial con un líder que mira otra sede actúan sobre la sede activa. Ocultarlos fuera de la sede activa, igual que Reponer.
  - `page.tsx:192` frente a `InventarioPanel.tsx:652-660`: Apartados en filas frente a unidades. Un solo número, con su unidad escrita.
  - `existencias-prendas.ts:130-131`: más de 100 tallas marcadas, avisar en vez de esconder los botones.
  - `ExistenciasPorPrenda.tsx:158`: «Reponer N tallas» debe abrir una talla que se pueda bajar.
- **Por qué en este puesto:** ninguna daña stock, pero cada una le enseña a la vendedora que la pantalla no es de fiar. La de etiquetas imprime papel de más cada vez.
- **Cómo lo verificas tú:** desde la Casaca Ximena Azul marino, «Imprimir etiquetas» muestra solo etiquetas azul marino. Con `?ubicacion=` de otra sede, el detalle no ofrece Etiquetas ni Historial.
- **Esfuerzo / dependencias:** S · ninguna.

### #8 · Corregir — Que una lectura secundaria no tumbe la pantalla ni recorte en silencio — ✅ hecha (2026-09-26; traslados en curso sin paginar a propósito)
- **Dónde:** `lib/resumen-inventario.ts:44` (`exigir` → tolerante) · `lib/inventario-v2.ts:257` (`transferencia_items` sin `leerTodas`) · `traslados.ts:122` y `prendas_danadas` sin límite.
- **Por qué en este puesto:**
  - Si falla el resumen de 7 días, la tienda se queda sin ver su stock.
  - Con más de 1.000 ítems en tránsito, «En camino» miente sin avisar.
- **Cómo lo verificas tú:** renombra temporalmente `fn_resumen_variantes_json` en la base local. Existencias carga, y la tarjeta dice «sin comparación».
- **Esfuerzo / dependencias:** S · ninguna.

### #9 · Replantear — ¿Dónde y cómo pide la tienda un traslado? (sección 8)
- **Dónde:** «Dónde más hay la S» del detalle (`DetallePrendaExistencias.tsx:219-240`, sin botón) · `/inventario/mover` (solo el líder elige el origen).
- **Por qué en este puesto:**
  - Con el #445 se fue «Stock bajo · pedir traslado», y el #500 muestra dónde hay sin dejar pedirlo.
  - Hoy una vendedora que ve «hay 4 en AQP» tiene que salir del ERP (WhatsApp) para pedirlo.
  - Es la pregunta abierta de ADR-0231 y ADR-0237. Esta tarea solo le pide a Felipe que decida la sección 8.
- **DECIDÍ:** proponer una **solicitud de traslado** («Pedir a AQP»): la tienda que necesita pide; la que tiene ve la solicitud en Traslados y la convierte en traslado con un toque.
- **DESCARTÉ:** que la vendedora arme el traslado desde el origen equivocado. «Mover mercadería» es de quien envía, y dejar que quien recibe elija el origen le mueve stock ajeno sin que el origen lo sepa.
- **SE ROMPE SI:** dos tiendas piden la misma última unidad de AQP en la misma hora. La solicitud no reserva, y la segunda recibe «ya no hay» recién cuando AQP intenta enviar. Por eso la solicitud no debe prometer stock, solo pedirlo.
- **Esfuerzo / dependencias:** L (tabla nueva + pantalla en Traslados) · decisión de Felipe.

### #10 · Mejorar — Un solo vocabulario y un solo conteo para «lo que falta en el piso»
- **Dónde:** tarjeta «Reponer a piso hoy · 33 **variantes**» (`InventarioPanel.tsx:664-718`) · chip «Por colgar · 28 **tallas**» · filas «3 tallas por colgar» + «Reponer 3 tallas».
- **Por qué en este puesto:** «variante» es palabra de sistema; la tienda dice «talla». Y dos cifras vecinas (33 y 28) para casi lo mismo obligan a adivinar cuál manda.
- **Cómo lo verificas tú:** en toda la pantalla solo aparece «tallas», y la tarjeta y el chip o dicen lo mismo o dicen en una línea en qué se diferencian.
- **Esfuerzo / dependencias:** S · junto con la #5.

### #11 · Mejorar — Pruebas de lo que el #500 no probó
- **Dónde:** falta una prueba del panel para:
  - los permisos del detalle por módulo y sede (vigila la #3);
  - la selección con filtros;
  - el borrador frente a `lineasIniciales`;
  - `abrirPorCodigo` con códigos repetidos.
- **Por qué en este puesto:** las pruebas del PR cubren las reglas puras, no la pantalla. La #3 y la #7 son justo lo que una prueba de permisos habría atrapado.
- **Cómo lo verificas tú:** `pnpm test` incluye un archivo nuevo que falla si «Reponer al piso» aparece para un rol sin «Bajada al piso».
- **Esfuerzo / dependencias:** M · después de la #3.

### #12 · Mejorar — bajo valor / opcional / futuro: cuatro pendientes chicos
- Leyenda de la curva `piso·almacén` junto a la curva en el celular, no al pie.
- Conteo que arranca con una lista (`?variantes=`), para «Contar esta prenda» (BACKLOG del #500).
- SQL espejo: `fn_movimientos_variantes` todavía no busca por marca ni categoría (del análisis anterior).
- Prueba de datos con un PostgREST y el rol `authenticated` (del análisis anterior).
- **Por qué al final:** ninguno cambia una decisión ni protege stock hoy.

## 8 · Estrategia alternativa — pedir traslado desde la tienda
| | Ganas | Pagas |
|---|---|---|
| **A. Solicitud de traslado** (recomendada) | La tienda pide sin salir del ERP; queda rastro de quién pidió y cuándo; el origen decide con su stock a la vista | Tabla y pantalla nuevas (Traslados: «Solicitudes»), un estado más que atender; no reserva stock |
| **B. Solo mostrar dónde hay** (lo de hoy) | Cero construcción | El pedido vive en WhatsApp: no hay rastro, y el ERP no sabe que algo se pidió y nunca llegó |
| **C. Que el líder arme todo desde Análisis** (`planDeReposicion`) | Ya existe el motor | La tienda depende de que el líder mire Análisis; no responde a «la clienta está aquí y lo quiere ahora» |

Decide Felipe (tarea #9).

## 9 · Referentes de ERP y futuro
- (De memoria, no verificado) Lightspeed y Shopify POS: transferencia pedida desde la ficha del producto, con estados «pedida → enviada → recibida». Pasa el filtro de 3 tiendas y 1 taller: es la opción A de la sección 8.
- Futuro, no ahora: sugerencia automática de traslados entre sedes por ritmo. ADR-0231 decidió que CAYLA no sugiere cantidades, y con 3 tiendas un humano decide mejor que un motor.

## 10 · Fuera de esta pantalla
**Avisar a las tiendas una sola vez, después de fusionar el #500, no antes.**
- El #445 cambió Existencias hoy a las 13:03 y nadie avisó (BACKLOG, sección ADR-0231).
- El #500 la cambia otra vez: de filas por talla a filas por prenda.
- Si se fusiona sin aviso, la vendedora va a ver dos pantallas distintas en un mismo día y va a concluir que el sistema está roto. Un mensaje corto, con una captura, tras el merge.

## 11 · Líneas propuestas para BACKLOG.md
- [x] `[pantalla:inventario]` #1 Ajustar inventario: un solo envío con token, todo-o-nada (ADR-0240) — M
- [x] `[pantalla:inventario]` #2 Ajustar sin «Bajada al piso»: lo nuevo entra al almacén y la fila lo dice (ADR-0212/0235) — S
- [x] `[pantalla:inventario]` #3 Un solo candado por escritura, opción A (ADR-0240) — M
- [x] `[pantalla:inventario]` #4 La bajada desde Existencias llega en 0 y se llena escaneando (ADR-0237 act.) — S–M
- [x] `[pantalla:inventario]` #5 «Reponer» ordenado por urgencia y un solo primario (ADR-0237 act.) — S
- [x] `[pantalla:inventario]` #6 Celular: primera prenda en la primera pantalla (ADR-0237 act.) — M
- [x] `[pantalla:inventario]` #7 Letra chica del detalle (etiquetas por color, otra sede, apartados, >100, «Reponer N») — S
- [x] `[pantalla:inventario]` #8 Lecturas tolerantes y sin tope silencioso — S
- [ ] `[pantalla:inventario]` #9 Decidir la solicitud de traslado (sección 8) — L
- [ ] `[pantalla:inventario]` #10 Un vocabulario («tallas») y un conteo — S
- [ ] `[pantalla:inventario]` #11 Pruebas del panel (permisos, selección, borrador) — M
- [ ] `[pantalla:inventario]` #12 Pendientes chicos (leyenda, Conteo con lista, SQL espejo, prueba PostgREST) — S c/u

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Bajar al piso | Va a `/inventario/bajar`; exige módulo, sede propia y piso+almacén | bien | `[código page.tsx:163]` |
| Cabecera | + Nuevo traslado | Va a `/inventario/mover`; exige el módulo; **no** exige sede propia (el ADR dice que sí) | ajustar | `[código page.tsx:168]` |
| Cabecera | Recibir / Contar / Apartados | Accesos por módulo, solo en sede propia; Apartados con número de apartados | ajustar (número) | `[código page.tsx:174-194]` |
| Cifras | Reponer a piso hoy | Tallas con `accionHoy` = reponer | ajustar (vocabulario) | `[visto]` |
| Cifras | Disponible total | Total − apartado, con % vs 7 días | bien (ver #8) | `[código inventario-v2.ts:188]` |
| Cifras | En camino / Dañado | Ítems en tránsito / prendas dañadas pendientes | bien | `[visto]` |
| Filtros | Buscador + 5 combos + chip «Por colgar» | Filtran la lista | ajustar (celular, chip duplicado) | `[visto]` |
| Lista | Fila por prenda con curva `piso·almacén` | Agrupa modelo+color | bien | `[visto]` |
| Lista | «Reponer N tallas» | Abre el detalle en una talla | ajustar (#5, #7) | `[código ExistenciasPorPrenda.tsx:158]` |
| Lista | Casillas + barra (Bajar / Trasladar / Etiquetas) | Llevan a la pantalla vecina con la lista cargada | ajustar (#4) | `[visto]` |
| Detalle | Tallas, Reponer, Apartar, Retirar | Modales de siempre | ajustar (#3) | `[visto][código]` |
| Detalle | Trasladar, Etiquetas, Ajustar, Historial | Enlaces y modal | ajustar (#1, #7) | `[código]` |
| Detalle | Dónde más hay | Stock de la talla en otras sedes, sin acción | falta acción (#9) | `[visto]` |
| Celular | «Escanear prenda» fijo | Cámara → talla exacta | bien | `[visto]` |
| Pie | Mostrando N prendas · CSV · leyenda | | ajustar (leyenda en celular) | `[visto]` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-26 | completo | 5/10 (promedio 6.0, con tope 5) | 7.4 — Soporte | primer análisis (pantalla anterior al #445) |
| 2026-09-26 (tarde) | completo, sin SQL | 5/10 (promedio 6.3, con tope 5) | 7.8 — Soporte | Sobre el PR #500 (`ffa5d52b`). **Cerradas:** #2 (el #445 se fusionó), #3, #4 y #5 (buscador con marca, filtro Marca y vacío que explica: están en el código). **Superadas por el rediseño:** #8 (el semáforo de 4 estados ya no existe, pero su defecto reaparece como «todo pide reponer»: nueva #5) y #11 (la tabla por talla dejó de ser la vista principal). **Siguen abiertas:** #1 (Ajustar, nueva #1), #10 (candado de módulo, nueva #3), #6 (estrategia alternativa: ahora sección 8), #7 (motor único de búsqueda), #9 (`es_prueba`: la lista lo excluye, `fn_resumen_variantes` sin verificar) y #12. |

## Anexo · consultas de solo lectura para confirmar en producción (proyecto `cayla-dynamic`, schema `retail`)
Felipe eligió seguir sin SQL. Estas consultas convierten en `[producción]` lo que arriba va `[local]` o `[no verificable]`; se probaron contra la base local.
- **Q2** (tarea #3): qué roles ven Existencias sin «Bajada al piso», «Apartados» o «Traslados», y cuántas cuentas activas tiene cada uno.
- **Q3** (tarea #2): si `cargar_stock_inicial` ya existe en producción, y qué funciones preguntan el módulo.
- **Q7** (tarea #5): cuántas tallas piden reponer por sede con el umbral 4, y cuántas no tienen almacén para bajar.

```sql
-- Q2
select r.clave as rol,
       bool_or(rm.modulo = 'existencias') as existencias, bool_or(rm.modulo = 'bajada_piso') as bajada_piso,
       bool_or(rm.modulo = 'apartados') as apartados, bool_or(rm.modulo = 'traslados') as traslados,
       (select count(*) from retail.colaboradores c where c.rol_id = r.id and c.estado = 'activo') as cuentas_activas
from retail.roles r left join retail.rol_modulos rm on rm.rol_id = r.id
where r.archivado_at is null group by r.id, r.clave order by 1;

-- Q3
select p.proname, pg_get_function_identity_arguments(p.oid) as argumentos,
       p.prosrc ~* 'fn_ve_modulo' as pregunta_modulo, p.prosrc ~* 'bajar_al_piso' as llama_bajar_al_piso
from pg_proc p
where p.pronamespace = 'retail'::regnamespace
  and p.proname in ('mover_interno','bajar_al_piso','apartar_stock','registrar_movimiento','cargar_stock_inicial')
order by 1;

-- Q7
with por_var as (
  select s.ubicacion_id, s.variante_id,
    sum(s.cantidad - s.cantidad_apartada) filter (where ss.tipo = 'piso_venta') as piso_libre,
    sum(s.cantidad - s.cantidad_apartada) filter (where ss.tipo = 'almacen_tienda') as alm_libre
  from retail.stock s
  join retail.sububicaciones ss on ss.id = s.sububicacion_id
  join retail.variantes v on v.id = s.variante_id and v.activo
  join retail.productos p on p.id = v.producto_id and not coalesce(p.es_prueba, false)
  group by 1, 2)
select u.nombre as sede,
       count(*) as tallas,
       count(*) filter (where coalesce(piso_libre,0) <= 4) as piden_reponer,
       count(*) filter (where coalesce(piso_libre,0) <= 4 and coalesce(alm_libre,0) <= 0) as sin_almacen_para_bajar
from por_var join retail.ubicaciones u on u.id = por_var.ubicacion_id
group by 1 order by 1;
```
