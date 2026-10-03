# Pantalla — Existencias (`/inventario`)

> Modo: completo · Fecha: 2026-10-03 · Rol/sede: líder, Tienda TRU (la captura es de producción; se contrastó con AQP) · Dispositivo: escritorio a 2000 px (la captura). Celular a 375 px: **no evaluado** `[no verificable]` · Datos: **real** — producción (proyecto cayla-dynamic, schema `retail`), consultas de solo lectura hechas hoy, sin datos personales.
> SHA analizado: `b4cb05c3` = `origin/main` (rama `claude/inventory-module-redesign-68fd65`, al día 0/0). El análisis del 2026-09-26 (SHA `ffa5d52b`) **queda vencido**: desde entonces `InventarioPanel.tsx` cambió 1.284 líneas, `DetallePrendaExistencias.tsx` desapareció (lo reemplazó un cajón lateral) y se rehízo la cabecera de «Prioridades de hoy». No se tomó como base; solo se marcó qué tareas suyas siguen vivas (ver Historial).
> Archivos: `app/(app)/inventario/page.tsx` · `components/InventarioPanel.tsx` · `ExistenciasTarjetas.tsx` · `TarjetaReponerAPiso.tsx` · `CajonPrendaExistencias.tsx` · `ExistenciasPorPrenda.tsx` · `ReponerPrendaModal.tsx` · `AjustarInventarioModal.tsx` · `ResolverDanadosModal.tsx` · `lib/inventario-v2.ts` · `lib/inventario-reglas.ts` · `lib/existencias-prendas.ts` · `lib/existencias-recomendaciones.ts` · `lib/politica-operativa-inventario.ts` · RPC `bajar_al_piso`, `mover_entre_piso_y_almacen`, `retirar_del_piso`, `ajustar_inventario`, `fn_stock_por_sede_json`, `fn_ritmo_reciente_json`, `fn_resumen_variantes_json`, `listar_apartados` · tablas `stock`, `movimientos`, `sububicaciones`, `transferencias`, `prendas_danadas`, `bajadas_piso`, `prendas_por_regularizar`, `producto_fotos`.
> Otra sesión tocándola: **no** sobre estos archivos. Cercanas: `claude/prenda-no-registrada-piso-cbbfbf` (Vender registra la bajada olvidada, ADR-0321; toca `PuntoDeVenta.tsx`, no esta pantalla) y `claude/search-by-exact-garment-0f2248` (Conteo «por prenda» reutiliza el buscador de Existencias). Las tareas #1, #3, #5 y #6 tocan `page.tsx` e `InventarioPanel.tsx`: conviene hacerlas en una sola rama.
> Método: mapa del código por un subagente de solo lectura; **4 auditores en paralelo** (un bloque cada uno) y **1 escéptico** que intentó refutar sus 32 hallazgos: **24 confirmados, 8 matizados, 0 refutados** (los matices bajaron la severidad de A-1, A-2, A-5, B-5, D-1, D-4, D-6 y marcaron que C-1 revierte decisiones escritas). Etiquetas: `[visto]` captura · `[código archivo:línea]` · `[producción]` consulta de hoy · `[inferido]` · `[no verificable]`.
> **Corrección de un dato propio (transparencia):** en una primera lectura atribuí a TRU el 87 % de ventas «sin registrar». Era la suma de dos sedes. Separadas: **TRU 65 %, AQP 99,3 %** (sección 2). Los auditores lo detectaron y lo re-verifiqué en vivo.

## 0 · Veredicto
Existencias es el núcleo del día del encargado y su **base está sana** (el stock cuadra con el libro de movimientos en 705 claves, las escrituras son todo-o-nada). La **cara no cumple su promesa**: pregunta «qué deberías reponer hoy» y responde «todo» (533 de 533 tallas, 85 de 96 productos) en un orden alfabético, y «Incidencias» dice 0 mientras 199 prendas vendidas esperan regularizarse.
**Cumple su finalidad:** 4,5/10 (promedio de las 6 dimensiones; ya queda bajo el tope de 5, que no hizo falta) · **Relevancia:** 8,0/10 — **Núcleo**.

**Veredicto por bloque** (sirve / mejorar / sacar; ningún bloque entero se saca, pero hay piezas que sí):

| Bloque | Veredicto | Estét. | Lóg. | Arq. | Func. | Util. | Conex. | Bien | Ajustar | Sobra | Falta |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **A · Cabecera y 5 botones** | **mejorar** | 6 | 4 | 6 | 5 | 4 | 4 | 1 | 6 | 2 | 2 |
| **B · Prioridades de hoy (4 tarjetas)** | **mejorar** | 7 | 3 | 5 | 4 | 3 | 3 | 2 | 9 | 2 | 2 |
| **C · Filtros, búsqueda, Ver detalle y Ordenar** | **mejorar** | 6 | 4 | 5 | 5 | 4 | 4 | 4 | 10 | 2 | 2 |
| **D · Tarjeta de producto y cajón** | **mejorar** | 4 | 3 | 6 | 5 | 3 | 6 | 11 | 13 | 3 | 2 |

**Piezas que sobran o faltan (por elemento).** Ojo: «Contar» y «Apartados» figuran como *sobra* porque repiten el menú lateral, pero el escéptico lo bajó a *bajo-medio* y la decisión es tuya (D6, ADR-0237 #6); «Acción» y «Estado» figuran como *sobra* hasta que se decida la regla (#2).
- **A · sobra:** Botón «Contar» — Destino: /inventario/conteo. Candado: sede propia + veModulo(conteos); la página usa exigirModulo(conteos). L…
- **A · sobra:** Botón «Apartados» — Destino: /vender/apartados (pantalla de Ventas). Candado: sede propia + tienda + veModulo(apartados); ruta co…
- **A · falta:** Edad de la foto y botón «Actualizar» — No existe. Hoy solo hay «vista de las HH:MM» sin referencia ni forma de renovar.
- **A · falta:** Señal de confianza del piso (prendas por regularizar) — No existe en Existencias. La cola está en /recibir, Inicio y Finanzas.
- **B · sobra:** Fondo rosado y color rojo de la tarjeta Reponer — Señal de urgencia cuando hay al menos una prenda en la lista.
- **B · falta:** Cifra total de lo que hay por colgar (396 tallas, 604 uds, 291 prendas) — No existe en la tarjeta; ya está calculada en el panel (cuentaPorColgar) y no se muestra.
- **B · falta:** Cola «Por regularizar» (52 en TRU, 147 en AQP al cierre) — No aparece en Existencias; vive en Recibir, el Inicio del líder (solo > 2 días) y Finanzas.
- **B · sobra:** Prop urgente de TarjetaPrioridad (estilo rojo) — Pinta una tarjeta de urgente; ningún llamador la usa.
- **C · sobra:** Combo «Acción: todas» (Reponer a piso · Mantener) — Filtra por calcularAccionHoy: piso libre ≤ 4 → «Reponer a piso», si no «Mantener».
- **C · sobra:** Combo «Estado ▸ Dañado / cuarentena» — Muestra las tallas con unidades en cuarentena.
- **C · falta:** Falta: «Por colgar» de un clic con su número — No existe: ni píldora ni cifra en la tarjeta.
- **C · falta:** Falta: filtros en la URL — No existe: búsqueda, filtros, orden y vista son useState.
- **D · falta:** Tarjeta como zona clicable (abrir el cajón de la prenda) — Hoy no existe: el article no tiene onClick y el cajón solo se abre desde la tabla.
- **D · falta:** Total del modelo (piso, almacén, colores) — No existe en ninguna parte de la tarjeta ni del cajón.
- **D · sobra:** Botón 'Subir prenda' — Abre la ventana de subir del piso al almacén (RPC retirar_del_piso).
- **D · sobra:** Botón 'Ajustar' — Abre 'Ajustar inventario' para el color elegido (motivo, cantidades, Responsable).
- **D · sobra:** Cajón: Eliminar el producto — Abre la ventana que borra el producto entero, con su stock en todas las sedes, con respaldo.

Lectura corta por bloque: **A · Cabecera** sirve de forma, no de contenido (jerarquía invertida, no dice qué tan confiable es el piso). **B · Prioridades** es el bloque más débil: la mitad son datos o ceros, la que sí prioriza no prioriza y la que se llama «Incidencias» calla la incidencia real. **C · Filtros** tiene dos combos (Acción, Estado) que no separan nada y un «Más relevantes» que no ordena por relevancia. **D · Tarjeta** es de un color, no del producto, no se puede tocar, y gasta un tercio de su ancho en una foto que el 90 % de los productos no tiene.

## 1 · Finalidad declarada
«Existencias existe para que la sede sepa **qué tiene, dónde está** (piso, almacén, en camino, dañado) **y qué debe reponer hoy**, y actúe sobre eso sin salir.» Fuente: `page.tsx:159`, `docs/ARQUITECTURA.md` §`/inventario`, ADR-0231 (una regla de piso), ADR-0237 (conectada por prenda) y ADR-0220 (cabecera). La captura no se usó como fuente.
**¿Docs y pantalla coinciden?** En lo esencial sí. La parte «qué debe reponer hoy» **no se cumple en la práctica**: la regla del ADR-0231 (piso ≤ 4) hoy no discrimina. Y el ADR-0231 mismo lo preveía como abierto («si el 4 se confirma… o vuelve a 7»). Ninguna decisión escrita cubre «qué hacer cuando la regla marca todo».

## 2 · Objeción
**La pantalla pregunta «qué repones hoy» y responde «todo».** Esa es la objeción de fondo, con tres caras:

1. **No prioriza, aunque se llama «Prioridades de hoy».** En TRU, 533 de 533 tallas con piso ≤ 4 (el máximo es 3) `[producción]`; 415–417 están en cero; el filtro «Acción» da «Reponer» en el 100 % y «Mantener» en 0. De ellas, 396 tallas (604 uds, 85 de 96 productos) tienen algo atrás para colgar y 105 piden reponer sin nada atrás `[producción]`. Las 3 prendas de la tarjeta (Body Bonita, Body Lavie, Body Leonor) son **las tres primeras del abecedario entre 23 empatadas** `[producción + código existencias-prendas.ts:217-222, inventario-v2.ts:345]`, y «Más relevantes» **no ordena por relevancia** (`default: return copia`, `ExistenciasTarjetas.tsx:59-60,80-81`). El defecto no es nuevo: el análisis del 26-sep ya lo anotó («todo pide reponer», #5 «el umbral sigue abierto»). Una semana después sigue en 100 %.
   *Reserva honesta:* parte es transitoria (TRU está en su primera semana de carga; el piso tiene 16 % del stock). Pero no se arregla sola: una nota del 30-sep (capacidad del piso, ADR-0208 bloque 6) habla de 600–750 prendas colgadas en 20 m², y a piso lleno la regla seguiría marcando casi todo `[no re-verificado por mí; citado por el escéptico]`.
2. **Afirma lo que no sabe.** «Incidencias: 0 prendas · Ninguna prenda dañada pendiente» y «778 uds» conviven con **199 prendas vendidas sin pasar por el libro y todavía sin regularizar: TRU 52 (S/ 2.842) y AQP 147 (S/ 6.683), 0 regularizadas en 4 días** `[producción]`. Desde el 30-sep, **TRU vendió 52 de sus 80 unidades como «Prenda sin Registrar» (65 %) y AQP 147 de 148 (99,3 %)**, todas con costo S/ 0 `[producción]`. Ningún archivo de la pantalla menciona «regulariz» (`grep` = 0, `[código]`), y la tarjeta Incidencias solo cuenta `prendas_danadas` (0 filas). El 778 puede incluir prendas ya vendidas: hasta 52 en TRU; el cruce por categoría+talla+color sugiere ~27 (27 de las 52 tienen una variante equivalente en stock) `[producción]`.
   *Precisión:* esto **no es un bug de Existencias ni de Vender**: es el mecanismo de la carga inicial (ADR-0179, ADR-0321). Lo que es defecto **de esta pantalla** es no mostrarlo.
3. **La tarjeta lee un color como si fuera el producto.** «Body Bonita · Piso 0 · Almacén 4» es solo Marrón; el producto tiene 8 colores, 14 variantes y 19 uds en almacén. En 74 de 96 modelos hay más almacén del que se ve, y el 90 % de las tarjetas gasta un tercio de su ancho en un placeholder (10 de 98 productos tienen foto) `[producción + código ExistenciasTarjetas.tsx:171]`.

**Trade-off.** Arreglar (1) obliga a elegir **una** regla de estado por talla: los auditores propusieron tres rediseños incompatibles (B-3, C-1, D-2) y alguno revierte decisiones que Felipe aprobó (el «Diseño aprobado 2026-09-28… sin píldora Por colgar», `InventarioPanel.tsx:804`, y la quita de la cifra del 29-sep). Por eso la decisión es suya y está en la tarea #2. Arreglar (2) no necesita decisión: es lectura y no revierte nada.

## 3 · Lo que está bien y no se toca
- **El stock cuadra con el libro.** Reconciliación de `stock` contra `movimientos` (entrada +, ajuste ±, salida −, traslado −origen/+destino): **705 claves, 0 diferencias, 0 filas sin sububicación** `[producción]`. Es el principio 4 de CAYLA cumplido y la razón por la que esta crítica es de la cara, no del núcleo.
- **Las escrituras son todo-o-nada.** `bajar_al_piso` toma el token anti-duplicado con candado de transacción, bloquea las filas en orden fijo y valida todas las líneas antes de escribir `[código 20260926000200_bajada_piso_funciones.sql:109-260]`. `bajar_al_piso`, `mover_interno`, `retirar_del_piso` y `ajustar_inventario` usan `p_token` `[producción]`. La web congela las cifras tras un corte de red y reenvía solo lo mismo `[código ReponerPrendaModal.tsx:80-166]`.
- **Candados de pantalla y de base dicen lo mismo y están probados** (ADR-0306: `fn_ve_modulo('existencias')`; `fn_puede_ajustar_stock`). Un botón no se dibuja si terminaría en «Sin acceso» `[código existencias-permisos.ts:52-64 + test]`.
- **La fórmula del 778 es correcta** (disponible = total − apartado, sin cuarentena, inactivas, «Monto manual» ni pruebas; ADR-0270). 126 piso + 651 almacén = 777 hoy; la captura decía 778 (una venta de por medio) `[producción + código inventario-reglas.ts:253-291]`.
- **La búsqueda especial no se toca:** términos en cualquier orden, talla y color reconocidos contra la sede, sin tildes, códigos pegados `[código filtro-busqueda-especial.ts]`. Escanear abre solo el código exacto; 725 de 725 variantes tienen etiqueta y barras, 0 repetidos `[producción]`.
- **El estado vacío explica en vez de callar** (qué se leyó, qué se vería quitando una cosa, «¿quisiste decir…?») `[código existencias-vacio.ts]`.
- **Filtrar en el navegador es correcto a este volumen:** 533 filas ≈ 0,5 MB, 15 elementos pintados por página. `edge_logs` del 3-oct: `stock` 146/284 ms, `fn_stock_por_sede_json` 58/122 ms, `fn_ritmo_reciente_json` 39/59 ms `[producción, cifras del auditor; no las re-medí]`. **No hay un problema de velocidad medible hoy.**
- **La ventana de Reponer/Subir** (matriz color × talla con «hay N», celdas rayadas donde no hay nada, cifras que arrancan en cero) es la mejor pieza del bloque `[código MatrizMover.tsx, ReponerPrendaModal.tsx]`.
- **La degradación está pensada:** stock, red y tránsito se exigen (un número equivocado es una decisión equivocada); marca, ritmo y semana se toleran con aviso en el lugar `[código lib/resultado.ts:1-36]`.
- **Cabecera:** misma pieza que Ventas (`EncabezadoPagina`), y «vista de las HH:MM» en vez de un reloj vivo es honesto (ADR-0220). Falta la edad, no quitarla.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 5,8 | El rojo es decoración permanente: la primera página supera con creces el máximo de 2 por pantalla | `[código]` `[visto]` |
| Lógica de negocio | 3,5 | La regla «reponer» marca el 100 % y tres predicados distintos conviven; «relevancia» y «prioridad» son alfabéticos | `[producción]` `[código]` |
| Arquitectura | 5,5 | Núcleo sano; la carga paga lecturas que la vista de entrada no usa y todo viaja al navegador (bien a este volumen) | `[producción]` `[código]` |
| Funciones | 4,8 | Tarjeta no clicable, celdas fantasma, «Ver detalle» con dos significados, cajón solo en la tabla | `[código]` |
| Utilidad | 3,5 | El encargado nuevo no sabe cuántas prendas faltan ni por cuál seguir | `[visto]` `[código]` |
| Conexión con el ERP | 4,3 | Existencias no ve la cola por regularizar (de otro pájaro); costo 0 aguas abajo | `[producción]` `[código]` |

**Estética.**
- (a) Coherencia con CAYLA: el cuadro «Piso» es rosado siempre (`ExistenciasTarjetas.tsx:227-229`) y la primera página de tarjetas lleva ≥ 30 elementos con rojo, contra `MAX_ROJO_POR_PANTALLA = 2` (`design-tokens.ts:73`) `[código; conteo del auditor, no medido en navegador]`. Hay un hex suelto duplicado (`ExistenciasTarjetas.tsx:217` y `MuestraColor.tsx:18`) y letra de 10–11 px (`text-[10px]/[11px]`) `[código]`. La cabecera es la de su módulo (ADR-0220).
- (b) Marca y tono: un mismo acto con tres verbos. La frase dice «reponer», el botón «bajar», y el libro llama «reposición» a lo contrario (17 ajustes que **meten** +25 uds al almacén) `[código page.tsx:159] [producción]`.
- (c) Heurísticas: un rojo que suena todo el día deja de informar (Nielsen: visibilidad del estado). Los puntos de color claros (Blanco, Crudo, Beige) casi desaparecen contra el papel y son el único modo de cambiar de color `[inferido; el contraste no se re-calculó]`.

**Lógica de negocio.**
- La regla `calcularAccionHoy` (piso ≤ 4) marca 533/533 tallas; `porColgar` (piso ≤ 0 con almacén) marca 396; `queHacerPrenda` (piso ≤ 0) marca 415–417. **Tres criterios para «falta piso»** (`existencias-recomendaciones.ts:135`, `inventario-reglas.ts:56`, `existencias-prendas.ts:199`): Brooks. En pantalla: de 408 prendas-color, 21 salen rojas, 286 ámbar «sin stock en piso», 101 ámbar «por reponer» y 0 «Mantener» `[producción]`.
- Desempate alfabético: ningún dato de venta entra al orden (ADR-0231 dice que el motor no usa ritmo). **Pero la señal existe:** `prendas_por_regularizar` guarda categoría, talla, color y hora de cada prenda que salió sin registrar; hoy es la única «qué se vendió ayer» del 65–99 % de las ventas (ver #3).
- La tarjeta «En camino» cuenta «N traslados» (en_transito + recibido_con_diferencia) pero «unidades» solo en_transito: puede decir «0 unidades · 1 traslado» `[código traslados.ts:153 vs inventario-v2.ts:275-279]`. «Incidencias» cuenta filas, no unidades (`inventario-v2.ts:401`).
- Regla violada: ninguna decisión escrita cubre «qué hacer cuando la regla marca todo»; ADR-0237 #5 («un solo botón negro») ya lo rompió ADR-0320.

**Arquitectura.**
- *Estados imposibles:* el esquema ya los impide (0 diferencias libro/foto, 0 stock sin sububicación) `[producción]`. Lo que la pantalla muestra sí puede ser un estado engañoso: 778 con prendas ya vendidas (sección 2).
- *Transacción y concurrencia:* una bajada es una sola transacción con token y bloqueo en orden fijo; dos encargados que bajan la última unidad a la vez: gana el primero, el segundo recibe error claro, no hay stock negativo `[código bajada_piso_funciones.sql:109-260]`.
- *Caída externa:* Existencias no llama a nada externo (solo Supabase). Si falla una lectura secundaria (marca, semana, ritmo) sigue y lo dice; si fallan stock/red/tránsito/sububicaciones/traslados/dañadas/apartados, cae a `error.tsx` «Esta pantalla no está mostrando datos» con reintentar. Se degrada así, no pierde datos: es solo lectura `[código page.tsx:51-93, lib/resultado.ts:40]`.
- *Volumen con números:* hoy 676 filas de stock en TRU (533 tallas, 96 modelos); horizonte 800–2.500 variantes por sede. A 2.500 el documento pesa ≈ 2,4 MB por carga y por `router.refresh()` `[inferido del auditor]`: recién ahí conviene paginar en el servidor. **18 peticiones por carga** (16 en paralelo + persona/ubicaciones + el ritmo en serie al final) y 3 lecturas de `transferencias` por carga `[código]`. Dos de ellas no las usa la vista de entrada: `fn_resumen_variantes_json` (≈ 330–420 ms, solo alimenta la frase del Taller) y `fn_ritmo_reciente_json` (solo «Por talla» y el CSV). Ganancia real: 2 peticiones y ≈ 220 ms. No es urgente.

**Funciones.** *Existen y funcionan:* búsqueda, filtros, escaneo, Reponer, Subir, Ajustar, Trasladar, Etiquetas, Historial, Exportar CSV. *Fantasma:* las celdas S/M/L de la tarjeta (`div` con `title`); el «círculo» del chip es decorativo. *Duplicadas:* «Ver detalle» (cabecera = alterna la vista; tarjeta = filtra la tabla por nombre) y tres puertas a `bajar_al_piso`. *Faltan:* ver la cola por regularizar, saber cuánto trabajo hay (la cifra «396 tallas · 604 uds» existe en el código y solo se dibuja con Estado = Por colgar, `InventarioPanel.tsx:465,920-933`). *Sobran:* `ApartarModal.tsx` (0 importadores), `DisponibleTotalOverlay.tsx`, `getCoberturaPorVariante`, `recomendacionesDeSede`, `resumen.requierenReposicion`, `accionHoy.motivo` que viaja y nadie lee `[código]`.

**Utilidad (persona sin contexto).** Un encargado nuevo abre TRU a las 08:30. Ve «778 uds», cuatro tarjetas y tres nombres en «Reponer». Toca «Body Bonita»: el buscador se llena con el nombre y baja a la tarjeta, que dice «Piso 0 · Almacén 4» (solo Marrón). Para bajar una prenda tiene dos puertas: «Bajar al piso» de la cabecera le exige **escanear la etiqueta** (no se elige por nombre, `bajada-reglas.ts:174`) y 2 pantallas con loader; «Reponer prenda» de la tarjeta son 3 clics. No sabe que faltan 396 tallas ni cuál sigue tras las 3 del tablero; para descubrirlo debe adivinar que existe el filtro «Estado = Por colgar». **Si se equivoca o duda, el fallo es del diseño, no de la capacitación.** Dato de producción: de 98 bajadas con líneas, 85 (87 %) son de **una** prenda y una unidad `[producción]`: la pantalla de escaneo con lista se pensó para un fardo de 300 prendas y casi no se usa así.

**Conexión con el ERP.** Ver sección 6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 9 | Decide qué se baja al piso hoy y es la única vista de stock por sede; de su verdad dependen Vender, Catálogo, Análisis y Finanzas |
| Dinero y stock que toca | ×1 | 8 | Muestra 777 uds y escribe stock por 4 caminos (bajar, subir, ajustar, eliminar) |
| Frecuencia y personas que la usan | ×1 | 8 | 57 bajadas solo el 3-oct en TRU, 50 entre 08:00 y 10:59, por 3 personas distintas `[producción]` |
| Qué se detiene si falla | ×1 | 6 | Vender sigue (usa su propia lectura de piso), pero el encargado pierde su plan de apertura y el aviso de piso vacío |

Relevancia = (2·9 + 8 + 8 + 6) / 5 = **8,0** → **Núcleo** (en el borde: el análisis anterior le dio 7,8).

## 6 · Conexión con el ERP
- **Aguas arriba:** `stock` ← `movimientos` (el libro); entradas: **100 % «carga inicial» sin documento** (550 mov., 766 uds) y 2 por anulación de venta; **0 entradas desde Compras o Producción** `[producción]`, así que el cruce Compras→Existencias **no se puede probar con datos reales todavía**. Salidas: 31, todas por venta y todas desde el piso `[producción]`: solo las unidades vendidas *con* registro bajan stock.
- **Aguas abajo:** Vender descuenta del piso; Catálogo lee la misma cifra (ADR-0270, aunque `inventario-v2.ts` sigue en la lista LEGADO de `stock-una-sola-cifra.test.ts`: Existencias suma en TS lo que Catálogo lee de `fn_existencias_productos`); Análisis y Finanzas consumen costo y rotación.
- **Pájaro dueño y vecinos:** Existencias es de **Halcón (05, Inventario y movimientos)**. La cola `prendas_por_regularizar` es de **Colibrí (07, Ventas y caja)**. Quien necesita saber que el stock puede estar inflado (Halcón) no es dueño de la tabla que lo dice (Colibrí): ahí nace el hueco de la sección 2.
- **Cruces que preguntabas (estado hoy):**

| Cruce | Estado hoy | Evidencia |
|---|---|---|
| Ventas → Existencias | Lo registrado baja bien; lo no registrado no baja nada | TRU 35 % registrado / AQP 0,7 % `[producción]` |
| Catálogo ↔ Existencias | Una sola cifra (ADR-0270); la foto del producto no cambia con el color; 90 % sin foto | `[código]` `[producción]` |
| Compras → Existencias | Sin datos reales: 0 entradas desde Compras | `[producción]` |
| Finanzas ← Existencias/Ventas | Las líneas sin registrar llevan costo S/ 0: costo de ventas y margen quedan mal hasta regularizar | `[producción]` (ver sección 10) |

- **Externos, y qué pasa si caen:** Existencias no llama a SUNAT, Lucode ni apis.net.pe. Depende solo de Supabase; si cae, la pantalla muestra «no está mostrando datos» y no pierde nada.

## 7 · Las 12 tareas, por importancia
Orden por impacto en el negocio + riesgo (lo que afirma algo falso sobre stock o dinero, arriba). **Decisiones de Felipe que las desbloquean** (cada una con mi recomendación por defecto):

| # | Decisión | Opciones | Recomiendo | Bloquea |
|---|---|---|---|---|
| D1 | ¿Qué regla de «reponer»? | A) lista = `porColgar`, umbral 4 solo en la columna · **B) una función de 4 estados + filtro «Qué hacer»** · C) no tocar la regla, solo colores y orden | **B** | #2, #3, #7 |
| D2 | ¿Vuelve la cifra «396 tallas por colgar» y el «Ver todas» que se quitaron el 29-sep? | Sí / No | **Sí** (es lo que dice cuánto trabajo hay) | #3 |
| D3 | ¿Quién es el botón oscuro de la cabecera? | «+ Nuevo traslado» (hoy, ADR-0237 #5) / «Bajar al piso» en tienda | **«Bajar al piso» en tienda**, traslado en el Taller | #8 |
| D4 | ¿«Eliminar el producto» queda en el cajón de Existencias? | Sí / No (solo Catálogo) | **No** | #4 |
| D5 | ¿La tarjeta suma el modelo o se vuelve matriz color × talla? | Total del modelo / matriz | **Total del modelo primero** | #5 |

Si no respondes, ejecuto las tareas que **no** dependen de decisión (#1, #4 en su versión mínima y #12) y espero tu respuesta para las demás.

### #1 · Eliminar/fusionar/conectar — «Incidencias» muestra lo que de verdad hay por resolver: la cola «por regularizar»
- **Dónde:** `page.tsx` (lectura tolerante con `tolerar()` y conteo `head:true` sobre `retail.prendas_por_regularizar`, estado `pendiente`, sede activa) · `InventarioPanel.tsx:780-791` (valor y enlace a Recibir ▸ por regularizar) · nota «hasta N de las 778 pueden estar ya vendidas» en «Resumen disponible».
- **Por qué en este puesto:** es el único hallazgo donde la pantalla **afirma algo falso sobre stock y dinero** («0 incidencias», 778). Es lectura, no escritura; no revierte ninguna decisión; es independiente. Hoy: TRU 52, AQP 147; 0 regularizadas; entran ≈ 60 por día. Sin esto el encargado cree que todo está en orden sobre un stock sin confirmar.
- **Cómo lo verificas tú:** abre `/inventario` en TRU: la tarjeta dice 52 (o la cifra del momento) y coincide con `select count(*) from retail.prendas_por_regularizar where estado='pendiente' and ubicacion_id=(select id from retail.ubicaciones where nombre='Tienda TRU')`. Regulariza una en Recibir y baja a 51. Con la lectura caída dice «no se pudo leer», no «0». Un rol sin Recibir no ve el enlace.
- **Esfuerzo / dependencias:** S–M · ninguna. Una sola implementación: A-3 (cabecera) y B-4 (tarjeta) son la misma tarea; va en la tarjeta, no en las dos.

### #2 · Replantear — Una sola regla de estado por talla (y decidir qué responde la pantalla al abrir)
- **Dónde:** `lib/existencias-prendas.ts:36-41,198-222` · `lib/existencias-recomendaciones.ts:131-137` · `lib/inventario-reglas.ts:56` · `lib/politica-operativa-inventario.ts:41` · filtros `InventarioPanel.tsx:363-364,867-891`.
- **Por qué en este puesto:** es la raíz de B-3, C-1, D-2 y de parte de B-7: tres rediseños incompatibles (el escéptico los marcó como contradicción). Sin decidirla, #3, #5, #7 y #10 se pisan. **Es decisión de Felipe** (toca ADR-0231 y el «Diseño aprobado 2026-09-28»). Su único trabajo aquí es pedírtela (D1) y, con ella, decidir la sección 8.
- **Cómo lo verificas tú:** tras el cambio, «Acción = Reponer» deja de devolver 533/533; las 408 prendas-color reparten sus pastillas en ≥ 3 tipos; los grupos del nuevo filtro suman 533 (hoy 396 «por colgar» + 32 «poco en piso, hay atrás» + 105 «sin nada atrás») y «Mantener» no aparece mientras valga 0. Control SQL: tallas de TRU con piso ≤ umbral / total.
- **Esfuerzo / dependencias:** M · primero tu decisión.
- **DECIDÍ:** una función de estado por talla con cuatro valores (`sin_nada`, `por_colgar`, `poco`, `bien`) en `lib/existencias-prendas.ts`, de la que lean tarjeta, cajón, lista, orden y filtro «Qué hacer» (grupos excluyentes, con conteo y ocultos si valen 0). `calcularAccionHoy` se reduce a leerla; el umbral 4 se recalibra cuando exista el tope de capacidad (ADR-0208 bloque 6).
- **DESCARTÉ:** (a) la opción mínima (lista = `porColgar`, umbral 4 solo en la columna): deja **tres predicados vivos** y el chip y la lista seguirían contradiciéndose; (b) bajar el umbral a 0: se pierde el aviso temprano de piso 1–3 con algo atrás (32 tallas hoy), que el ADR-0231 quiso conservar; (c) subirlo o bajarlo sin más: con máximo 3 en piso, ningún valor de 1 a 7 separa algo hoy; (d) ordenar por ritmo de venta: solo ~35 % de las unidades de TRU tiene venta registrada.
- **SE ROMPE SI:** la encargada cuelga 1 ud de cada talla y deja 17 atrás (Camisa Oxford Azul claro): la talla pasa de `por_colgar` a `poco`, no a `bien`, y el escalón `poco` conserva el aviso; pero si el piso sube a ≥ 5 por talla (fin de la carga) `bien` reaparece y el umbral vuelve a discriminar. También se rompe si una sede vende por unidad suelta sin tallas.

### #3 · Mejorar — «Reponer a piso hoy» y «Más relevantes» priorizan de verdad
- **Dónde:** `TarjetaReponerAPiso.tsx:57-61` (no ofrecer prendas sin nada atrás; cifra en el encabezado; el clic aplica el filtro) · `existencias-prendas.ts:208-222` (3.er criterio: unidades libres en almacén de las tallas por colgar, antes del nombre) · `ExistenciasTarjetas.tsx:25-43` (rótulo «Lo que más falta en el piso») · `InventarioPanel.tsx:764-771` (`onVerPrenda` → limpiar Color/Talla y filtrar «Por colgar»).
- **Por qué en este puesto:** es lo primero que lee el encargado y hoy el orden es un accidente del abecedario que se lee como prioridad. Tres pasos: **(a)** sin decisión nueva: desempatar por unidades atrás, mostrar «396 tallas · 604 uds por bajar» y que el clic filtre; **(b)** después, ordenar por la señal de venta que ya existe en la cola (23 de las 52 pendientes de TRU tienen una variante equivalente con piso 0 y almacén `[producción]`). *Revierte* la quita de la cifra del 29-sep: D2 es tuya.
- **Cómo lo verificas tú:** hoy la tarjeta muestra Body Bonita, Lavie y Leonor; tras (a) muestra las empatadas con más unidades en almacén (el auditor midió: Camisa Oxford Azul claro 17, Azul medio 13, Pantalón Oxford Azul claro 9). La cifra de la tarjeta y la del chip del filtro son la misma. Con un Color elegido, el clic en una de las 3 deja esa prenda sola.
- **Esfuerzo / dependencias:** S (a) · M (b) · (a) puede ir antes que #2; el clic usa el grupo «Por colgar» de #2. Bloqueado para ordenar por *ventas reales* hasta regularizar la cola.

### #4 · Eliminar/fusionar/conectar — «Eliminar el producto» sale del cajón de Existencias
- **Dónde:** `CajonPrendaExistencias.tsx:289` · `InventarioPanel.tsx:1446-1451,1477-1481` · `existencias-permisos.ts:62`.
- **Por qué en este puesto:** es la única acción **destructiva** a un gesto de dos acciones diarias (Ajustar, Imprimir etiquetas), visible para las 12 cuentas Integrante; ~78–80 de los 96 productos de TRU pasan hoy la comprobación de la base `[producción]`. La ventana pregunta a la base, firma el responsable y deja respaldo (eso está bien), pero el principio de CAYLA es mover a estado, no borrar. El escéptico lo bajó a **medio**: quitarlo es cambiar el lugar, no el permiso (ADR-0252, decisión tuya del 3-oct). El tema de fondo es si un Integrante o un Terminal de ventas debe poder borrar un producto con su stock.
- **Cómo lo verificas tú:** con una cuenta Integrante en TRU, abre cualquier prenda en el cajón: el grupo «Gestión» solo tiene Ajustar stock e Imprimir etiquetas. En Catálogo ▸ Productos la tarjeta del mismo producto sigue ofreciendo Eliminar.
- **Esfuerzo / dependencias:** S · D4 (tuya).

### #5 · Corregir — La tarjeta dice de qué color son sus cifras, suma el modelo y no cambia con un filtro
- **Dónde:** `ExistenciasTarjetas.tsx:170-295` · `InventarioPanel.tsx:445-461,485-494` · `existencias-prendas.ts` (función pura `resumirModelo` con prueba).
- **Por qué en este puesto:** hoy «Piso 0 · Almacén 4» es un color; «Más en el piso» suma todos los colores mientras la tarjeta enseña uno; y con un filtro puesto las cifras suman solo las tallas que pasan, sin decirlo. Un encargado puede dejar de bajar un producto que sí tiene almacén en otro color. El escéptico advirtió que reconstruir a matriz (L) es desproporcionado y choca con #6; por eso va primero el total.
- **Cómo lo verificas tú:** busca «Body Bonita»: la tarjeta dice «Piso 0 · Almacén 19 · 8 colores» (control: `sum(cantidad)` del producto en `almacen_tienda` de TRU = 19). Con Estado = Por colgar, abre una prenda mixta: la caja Piso es la de la prenda entera, las tallas que no cumplen se ven atenuadas y el pie dice «N de M tallas».
- **Esfuerzo / dependencias:** M · después de #2 · D5 (tuya).
- *Alternativa descartada por ahora:* tarjeta con matriz color × talla (hallazgo D-1 original, L). Se rompe si más de la mitad de los modelos supera 6 colores: hoy 84 de 96 son multicolor (promedio 4,25, máximo 13); entonces conviene una fila por modelo con una celda por color.

### #6 · Mejorar — La tarjeta abre el cajón; «Ver detalle» deja de significar dos cosas; «Reponer» recuerda el color
- **Dónde:** `ExistenciasTarjetas.tsx:181-345` (zona clicable con `role="button"`, como `ExistenciasPorPrenda.tsx:130-150`) · `InventarioPanel.tsx:944-958,1060-1087,370-382` · `existencias-prendas.ts:112-114` (`coloresDelModelo` con el color visto primero).
- **Por qué en este puesto:** las acciones del cajón (Trasladar, Etiquetas, Historial, Ajustar) hoy cuestan 3 clics y un desvío por la tabla; las celdas S/M/L son `div` sin acción; «Reponer prenda» abre la matriz sin el color que la persona miraba (entre hasta 13 filas). «Subir prenda» está apagado en 62 de 96 modelos y «Reponer» en 9 `[producción]`. La maqueta dejó «los dos Ver detalle» como decisión pendiente tuya.
- **Cómo lo verificas tú:** un clic en una zona libre de la tarjeta de Body Bonita abre el cajón en Marrón; un clic en la celda M lo abre parado en M; Escape lo cierra y la lista sigue con 96 productos y el buscador vacío. Con el punto Negro elegido, «Reponer prenda» abre con la fila Negro primera y resaltada (3 clics hasta bajar 1).
- **Esfuerzo / dependencias:** M · después de #5.

### #7 · Corregir — El rojo vuelve a ser señal; las tarjetas sin trabajo se pliegan
- **Dónde:** `ExistenciasTarjetas.tsx:114,124,207-219,227-229,264` · `TarjetaReponerAPiso.tsx:23-28,78-83` · `InventarioPanel.tsx:728-793,1106` (la prop `urgente` de `TarjetaPrioridad` nadie la pasa) · `MuestraColor`.
- **Por qué en este puesto:** `MAX_ROJO_POR_PANTALLA = 2` y la primera página lleva ≥ 30; el cuadro Piso es rosado aunque tenga 12 uds; en TRU dos de las cuatro tarjetas dicen «nada» y ocupan el 50 % de la fila. Un tablero que dice «nada» dos veces entrena a ignorarlo.
- **Cómo lo verificas tú:** a 1440 px, cuenta con el inspector los elementos con clases `rojo` en la primera página: ≤ 2 en condiciones normales. Con En camino = 0 e Incidencias = 0, esas dos se ven como una línea de estado y las que tienen trabajo ganan el ancho.
- **Esfuerzo / dependencias:** S–M · después de #2 (qué estados llevan rojo) y #1 (qué ocupa el espacio).

### #8 · Corregir — Cabecera honesta por tipo de sede
- **Dónde:** `page.tsx:129,162-163,177-188` (primario por `vende`; «Bajar al piso» apagado con motivo si el almacén libre es 0; «+ Nuevo traslado» solo si `enSuSede`; «vista hace N min» + botón «Actualizar» manual, compatible con ADR-0220).
- **Por qué en este puesto:** en tienda el único botón oscuro es el traslado (4 traslados en toda la base, todos de prueba) mientras TRU hizo 57 bajadas el 3-oct `[producción]`; en AQP «Bajar al piso» lleva a una pantalla vacía (almacén 0). El escéptico lo bajó a **medio**: el orden actual es decisión tuya (ADR-0237 #5) y 0 traslados reales se explica porque Taller/AQP aún no operan, no por desuso.
- **Cómo lo verificas tú:** en TRU el único botón oscuro dice «Bajar al piso»; en el Taller, «+ Nuevo traslado»; en AQP «Bajar al piso» sale apagado con «No hay nada libre en el almacén»; la foto dice «vista hace 6 min» y «Actualizar» cambia el Piso de una prenda bajada por otra cuenta.
- **Esfuerzo / dependencias:** S · D3 (tuya).

### #9 · Mejorar — Tres puertas a «bajar»: medir antes de borrar una, y un solo verbo
- **Dónde:** RPC `retail.bajar_al_piso` (parámetro opcional `p_origen text default null` guardado en `bajadas_piso`) · `BajarAlPisoForm.tsx` · `ReponerPrendaModal.tsx` · `bajar_al_piso_desde_vender` · textos: `page.tsx:159`, `TarjetaReponerAPiso.tsx`, `ExistenciasTarjetas.tsx:306`, título del modal.
- **Por qué en este puesto:** hoy borrar cualquiera de las dos puertas de Existencias es apostar: `bajadas_piso` no guarda por cuál entró. La puerta de Vender sí se distingue (escribe una nota). Pero el escaneo con lista se diseñó para un fardo de 300 prendas y el 87 % de las bajadas es de una. El escéptico lo bajó a **medio** (no hay estado inválido, es medir). El mismo acto con tres verbos («reponer», «bajar», «reposición» = entrada al almacén) es parte de la tarea.
- **Cómo lo verificas tú:** a los 14 días, `select origen, count(*), round(avg(uds),1) from retail.bajadas_piso group by 1` dice cuántas bajadas entran por escaneo, modal y Vender; buscando «repon» en la pantalla ninguna aparición describe almacén → piso.
- **Esfuerzo / dependencias:** M · **migración en producción: no se pega sin tu confirmación** (`create or replace` con guarda del md5 del cuerpo vivo y la firma anterior aceptada).
- **DECIDÍ:** una sola escritura (ya lo es) y medir antes de borrar una puerta; entre tanto, el modal queda como puerta de una prenda y el escaneo como pantalla de lista.
- **DESCARTÉ:** quitar el modal ya (ADR-0320 es de hace pocos días y el 87 % de las bajadas pasaría a pagar dos cargas de pantalla y exigir la etiqueta en la mano); quitar el botón de cabecera (es la única entrada a la pantalla de escaneo).
- **SE ROMPE SI:** llega un fardo de cientos de prendas de golpe (ahí solo el escaneo con lista aguanta), o una versión vieja de la web llama a la RPC sin el parámetro nuevo (la firma debe seguir aceptando la llamada anterior). Ojo: `MAX_LINEAS_BAJADA = 300` frente a 396 tallas por colgar.

### #10 · Mejorar — Filtros acotados con conteos y estado en la URL
- **Dónde:** `InventarioPanel.tsx:413-428,424,240-261,844-866,355-364,392-398` · nuevos `lib/existencias-facetas.ts` y `lib/existencias-url.ts` (puros, con pruebas) · `page.tsx:32-40`.
- **Por qué en este puesto:** los combos ofrecen opciones que llevan a 0 (Color: 51 opciones, 179 de 816 pares categoría×color con stock `[producción]`), el valor elegido no dice de qué filtro es, Talla se ordena como texto («XL» antes de «M»), y nada sobrevive a un F5 ni se puede enlazar desde Inicio. Productos ya decidió esto (ADR-0308: la URL es la única fuente); aquí está resuelto de otra forma (Brooks). No unificar las dos barras.
- **Cómo lo verificas tú:** elegir una categoría deja en Color solo los colores con stock en ella, cada uno con su (n); ninguna opción lleva a «0 productos»; «Talla» lista XS, S, M, L, XL, 26…34; con «Por colgar» elegido, F5 lo mantiene y el aviso de Inicio abre Existencias ya en «Por colgar».
- **Esfuerzo / dependencias:** M · después de #2 (qué filtros existen).

### #11 · Mejorar — *bajo valor / opcional:* foto por color y mosaico en vez del colibrí
- **Dónde:** `inventario-v2.ts:87-93,271` · `ExistenciasTarjetas.tsx:187-188` · `MosaicoPrenda`/`fotoDeVariante`.
- **Por qué en este puesto:** hoy la foto es la del producto, no la del color elegido, y el 90 % no tiene foto: un colibrí al 30 % ocupa un tercio de la tarjeta. Reusa piezas que ya existen. Va al final porque no cambia ninguna decisión del encargado.
- **Cómo lo verificas tú:** en un producto de los 10 con foto y varios colores, tocar cada punto cambia la foto o muestra el mosaico de ese color, nunca la foto de otro color; un producto sin foto muestra el ícono de su categoría sobre su color.
- **Esfuerzo / dependencias:** M · ninguna.

### #12 · Eliminar/fusionar/conectar — *bajo valor / opcional:* limpieza, pruebas y dos lecturas fuera de la carga
- **Dónde:** borrar `ApartarModal.tsx` (y sus contadores en `guia-de-foco-pantallas.ts:165`, `sugerir-archivos.ts:27`) · `existencias-permisos.ts:55-63` (banderas que nadie lee) · cita «ADR-0317» → «ADR-0320» en 7 sitios · pruebas de `resumirExistencias`, `ordenarModelos`, `agruparPorModelo` · singular/plural («1 unidades»), «En camino» con permiso, Incidencias sin ventana vacía · sacar de la carga de tiendas `fn_resumen_variantes_json` y el ritmo en serie · tolerar `fn_stock_por_sede_json` · no enviar `accionHoy.motivo`.
- **Por qué en este puesto:** lo que no existe no tiene bugs (Carmack) y las cifras que el encargado lee primero (778/127/651) son las únicas sin prueba. Pero **no hay un problema de velocidad medible hoy**: la ganancia es 2 peticiones y ≈ 220 ms. Por eso va al final.
- **Cómo lo verificas tú:** `grep -rn 'ApartarModal' apps/web` no devuelve nada; `pnpm typecheck` y `pnpm test` pasan con los contadores bajados; en Network, `/inventario` no pide `fn_resumen_variantes_json` ni `fn_ritmo_reciente_json` hasta tocar «Por talla» o «Exportar CSV».
- **Esfuerzo / dependencias:** S–M · independiente (la prueba de `ordenarModelos` se reescribe si se hace #5).

**Qué hallazgos no se volvieron tarea (y por qué):** A-5 (4 de 5 botones repiten el lateral; a 1366 px la cabecera subiría a ≈ 240 px `[inferido, no medido]`) y B-6 («Resumen disponible» con el 778 de titular en vez de lo que se puede cobrar hoy, 127) son **decisiones tuyas** (D6 y D7 abajo), no defectos; los cinco accesos los eligió Felipe en ADR-0237 #6. Se miden con `/multi-view-responsive` antes de decidir.

## Trazabilidad · de los 32 hallazgos a las 12 tareas
| Hallazgo | Título | Severidad (auditor) | Escéptico | Ajuste del escéptico | Tarea |
|---|---|---|---|---|---|
| A-1 | El botón oscuro es «+ Nuevo traslado»; el trabajo de la apertura es bajar al piso | alto | MATIZADO | Severidad medio, no alto | #8 |
| A-2 | Bajar una prenda tiene tres puertas con rigor distinto y la base no guarda por cuál entró | alto | MATIZADO | Severidad medio | #9 |
| A-3 | Nada en la cabecera dice qué tan confiable es el piso: la cola de prendas vendidas sin registrar no aparece en Existenc… | alto | CONFIRMADO |  | #1 |
| A-4 | «vista de las 16:33» no dice cuánto hace de eso y no hay forma de actualizar sin recargar el navegador | medio | CONFIRMADO |  | #8 |
| A-5 | Cuatro de los cinco botones repiten el menú lateral (mismo módulo, mismo destino) y con cinco ya no caben en una fila a… | medio | MATIZADO | Severidad bajo-medio | D6 (sin tarea) |
| A-6 | Un solo acto, tres verbos: la frase dice «reponer», el botón dice «bajar» y el libro llama «reposición» a lo contrario | medio | CONFIRMADO |  | #9 |
| A-7 | «Bajar al piso» se ofrece aunque el almacén esté en cero (AQP) | medio | CONFIRMADO |  | #8 |
| A-8 | «+ Nuevo traslado» ignora la sede que se mira cuando la URL trae ?ubicacion= | bajo | CONFIRMADO |  | #8 |
| B-1 | «Reponer a piso hoy» no prioriza: sus 3 prendas son las primeras del abecedario entre 23 empatadas | alto | CONFIRMADO |  | #3 |
| B-2 | La tarjeta no dice cuánto trabajo hay: 396 tallas / 604 uds por colgar, y solo muestra 3 prendas | alto | CONFIRMADO |  | #3 |
| B-3 | La regla piso ≤ 4 marca el 100 % de las tallas de TRU y a capacidad llena seguiría marcándolas: el rosado es una alarma… | alto | CONFIRMADO |  | #2 |
| B-4 | «Incidencias» solo mira prendas dañadas y calla las 47 prendas vendidas sin registrar de TRU; el 778 puede estar inflad… | alto | CONFIRMADO |  | #1 |
| B-5 | Los clics de las tarjetas no cierran el ciclo: En camino ignora el permiso, Incidencias con 0 abre una ventana vacía, R… | medio | MATIZADO | Severidad bajo | #12 |
| B-6 | «Resumen disponible»: el titular (778) es lo que hay en la tienda, no lo que se puede cobrar hoy (127); y su ventana su… | medio | CONFIRMADO |  | D7 (sin tarea) |
| B-7 | El bloque se llama «Prioridades de hoy» pero la mitad son datos o ceros: en TRU dos tarjetas dicen «nada» y ocupan 50 %… | medio | CONFIRMADO |  | #7 |
| B-8 | Cifras sin prueba y textos que se contradicen: «1 unidades», «0 unidades · 1 traslado», dañadas contadas por fila | bajo | CONFIRMADO |  | #12 |
| C-1 | «Acción» y «Estado» no filtran nada útil: la regla piso ≤ 4 marca el 100 % de las tallas de TRU | alto | MATIZADO | Severidad alto aceptable para el diagnóstico, pero la soluc… | #2 |
| C-2 | «Más relevantes» no ordena por relevancia: es «más tallas por colgar» y, empatadas, A–Z; así se eligen las 3 prendas de… | alto | CONFIRMADO |  | #3 |
| C-3 | «Reponer a piso hoy» escribe un nombre en el buscador y la pantalla nunca dice cuánto trabajo hay | alto | CONFIRMADO |  | #3 |
| C-4 | Los combos ofrecen opciones que llevan a 0, el valor elegido no dice de qué filtro es y Talla se ordena como texto: Exi… | medio | CONFIRMADO |  | #10 |
| C-5 | Con un filtro puesto, las cifras de la tarjeta (Piso, Almacén, matriz y chip) suman solo las tallas que pasan, sin deci… | medio | CONFIRMADO |  | #5 |
| C-6 | «Ver detalle» es un modo escondido con dos significados y deja las acciones del cajón detrás de una tabla | medio | CONFIRMADO |  | #6 |
| C-7 | Búsqueda, filtros, orden y vista viven en la memoria del navegador, no en la URL: no sobreviven a un F5 y Inicio no pue… | medio | CONFIRMADO |  | #10 |
| C-8 | La carga paga dos lecturas que la vista de entrada no usa, un campo que nadie lee, y cada «Reponer» repite todo | medio | CONFIRMADO |  | #12 |
| D-1 | La tarjeta es de un modelo pero sus cifras son de un solo color: 3 de cada 4 prendas-color no se ven | alto | MATIZADO | Severidad medio, esfuerzo L es desproporcionado | #5 |
| D-2 | La señal 'falta piso' está saturada (100 % de las tallas) y se calcula con tres predicados distintos; el orden de las p… | alto | CONFIRMADO |  | #2 |
| D-3 | El rojo es decoración permanente, no señal: el cuadro 'Piso' es rosado siempre y la página supera 20 veces el máximo de… | medio | CONFIRMADO |  | #7 |
| D-4 | La tarjeta no es clicable: el cajón solo existe en la tabla, las celdas de talla son fantasmas y 'Ver detalle' saca de… | alto | MATIZADO | Severidad medio | #6 |
| D-5 | La foto no cambia con el color elegido (Existencias es la única pantalla que usa la foto del producto), el 90 % no tien… | medio | CONFIRMADO |  | #11 |
| D-6 | 'Eliminar el producto' está en el cajón de Existencias a un gesto de Ajustar e Imprimir etiquetas, visible para las 12… | alto | MATIZADO | Severidad medio | #4 |
| D-7 | 'Reponer prenda' abre la matriz sin el color que la persona estaba mirando y la tarjeta y el cajón no siempre ofrecen l… | medio | CONFIRMADO |  | #6 |
| D-8 | Se borra primero: ApartarModal sin importadores, banderas que nadie lee y citas a un ADR equivocado | bajo | CONFIRMADO |  | #12 |

*Las cifras de la cola en algunos títulos y elementos (47–50 en TRU) son las del momento en que cada auditor consultó; al cierre son **52 en TRU y 147 en AQP** y siguen subiendo.*

**Duplicados que el escéptico fusionó:** A-3+B-4 → La cola de prendas vendidas sin registrar no aparece en Existencias; B-3+C-1+D-2 → La señal 'reponer a piso' marca el 100 % de las tallas y se calcula con tres predicados; B-1+C-2+D-2 → El orden 'Más relevantes' y las 3 prendas de la tarjeta son alfabéticos; B-2+C-3+B-5 → La tarjeta 'Reponer a piso hoy' no dice cuánto trabajo hay y su clic solo escribe un nomb…; C-6+D-4 → La tarjeta no abre el cajón y 'Ver detalle' significa dos cosas; D-1+C-5 → Las cifras de la tarjeta son de un subconjunto (un color, o solo las tallas que pasan el…; B-3+B-7+D-3 → El rosado/rojo es permanente y no señala nada; A-6+D-7 → Nombres distintos para el mismo acto o botón (reponer/bajar; Ajustar/Ajustar stock/Ajusta….

**Contradicciones entre auditores que obligan a decidir antes de construir:** (1) B-3, C-1 y D-2 proponen tres rediseños incompatibles de la misma regla → #2/D1; (2) D-1 (matriz) elimina el supuesto de D-4, D-5 y D-7 → D5; (3) B-2, C-1 y C-3 revierten el «Diseño aprobado 2026-09-28… sin píldora Por colgar» → D2; (4) A-3, A-5, B-4 y B-7 ponen la misma cola en tres sitios → #1 la deja en uno.

## 8 · Estrategia alternativa — de catálogo con alarma a «lista de trabajo del encargado»
Las 12 tareas mejoran la pantalla actual: **tablero de 4 tarjetas + catálogo de 96 productos en tarjetas por color + 6 filtros**. La alternativa responde la pregunta de la finalidad en vez de mostrar el inventario:

**«Hoy te toca»**: una lista de trabajo ordenada (una fila por prenda por colgar: tallas, unidades atrás, señal «se vendió algo así»), con la cifra de **avance** («126 de 777 en piso · 396 tallas por colgar»), un botón «Bajar» por fila, y el catálogo con sus filtros pasa a una segunda pestaña «Todas las prendas».

| | Ganas | Pagas |
|---|---|---|
| **Lista de trabajo** | La pantalla contesta «qué repongo» con un orden y un progreso que avanza al bajar mercadería; reduce 4 tarjetas + 6 filtros a 1 lista + 1 pestaña; usa la señal de venta que ya existe | Reescribe el bloque central (L); revierte decisiones aprobadas (2026-09-28/29, maqueta `existencias-tarjetas`); la señal de venta es parcial (solo 35 % de TRU registrado + la cola); no está probada con encargados |
| **Mejorar la actual (#1–#7)** | Cambios chicos y reversibles, cada uno verificable; conserva lo que ya aprobaste | La grilla de catálogo sigue siendo la puerta de entrada |

**Mi recomendación:** no reconstruir ahora. #1–#3 vuelven honesta y priorizada la lista de arranque; con eso, **probar con un encargado de TRU durante dos semanas** y recién ahí decidir si hace falta «Hoy te toca». **Decide Felipe**: es la parte de #2 que le pide una decisión. *Se rompe si* el encargado, aun con #1–#3, sigue abriendo la pestaña de filtros para saber qué bajar.

## 9 · Referentes de ERP y futuro
Pasaron el filtro «¿le sirve a 3 tiendas y 1 taller hoy?» pero son futuro:
- Tope de capacidad del piso por sede y categoría (ADR-0208 bloque 6): ya diseñado con m², sin construir; la regla de #2 lo necesita.
- Umbral por sede (`OVERRIDES_POR_SEDE`, hoy vacío) cuando AQP y LIM tengan su stock cargado (hoy 13 y 1 uds).
- Ordenar por rotación real por variante: bloqueado hasta regularizar la cola y juntar semanas de venta.
- Filtrar y paginar en el servidor con facetas en una RPC: recién a 800–2.500 variantes (≈ 2,4 MB por carga).
- Reglas de reposición mínimo/máximo por producto al estilo de los ERP grandes (Odoo, Shopify POS, Lightspeed) `[inferido de memoria, no verificado]`: no se necesita con 3 tiendas.
- Realtime para el stock de Existencias: ADR-0018 dejó la publicación en 0 tablas y activarla toca el proyecto compartido con Dynamic.

## 10 · Fuera de esta pantalla
**La cola por regularizar crece más rápido de lo que se vacía y nadie es su dueño.** 199 prendas pendientes, S/ 9.525, **0 regularizadas en 4 días**; entran ≈ 60 por día (AQP 48 y 35 los días 2 y 3-oct, TRU 15 y 29) `[producción]`. Cada una lleva **costo S/ 0**: el costo real solo se asigna al regularizar (ADR-0179). Mientras tanto, margen, costo de ventas y rotación de Finanzas y Análisis salen mal, y quien cierre el mes hereda el hueco (`CierreMes.tsx` menciona la cola; no verifiqué si bloquea el cierre). La tabla es de Colibrí (Ventas) y el stock que corrompe es de Halcón (Inventario): por eso no hay dueño. En AQP el efecto es total: vende ≈ 148 uds con 13 en inventario, así que Existencias de AQP hoy no dice nada. Esta es la decisión de operación más cara de la semana, y no está en ningún módulo.

## 11 · Líneas propuestas para el backlog
(No se editó `BACKLOG.md`: Felipe aprueba antes de pasarlas a `docs/backlog/`, ADR-0259.)
- [ ] `[pantalla:inventario]` #1 Incidencias muestra la cola «por regularizar» — S–M
- [ ] `[pantalla:inventario]` #2 Una sola regla de estado por talla y decidir qué responde la pantalla al abrir (D1) — M
- [ ] `[pantalla:inventario]` #3 «Reponer a piso hoy» y «Más relevantes» priorizan de verdad (cifra, desempate, clic que filtra) — S/M
- [ ] `[pantalla:inventario]` #4 «Eliminar el producto» sale del cajón de Existencias — S
- [ ] `[pantalla:inventario]` #5 La tarjeta dice de qué color son sus cifras, suma el modelo y no cambia con un filtro — M
- [ ] `[pantalla:inventario]` #6 La tarjeta abre el cajón; un solo «Ver detalle»; «Reponer» recuerda el color — M
- [ ] `[pantalla:inventario]` #7 El rojo vuelve a ser señal; tarjetas sin trabajo plegadas — S–M
- [ ] `[pantalla:inventario]` #8 Cabecera honesta por tipo de sede (primario, almacén en 0, sede mirada, edad de la foto) — S
- [ ] `[pantalla:inventario]` #9 Medir por qué puerta entra cada bajada (`p_origen`) y un solo verbo — M (migración, confirmar)
- [ ] `[pantalla:inventario]` #10 Filtros acotados con conteos y estado en la URL — M
- [ ] `[pantalla:inventario]` #11 Foto por color y mosaico en vez del colibrí — M (bajo valor / opcional)
- [ ] `[pantalla:inventario]` #12 Limpieza, pruebas y dos lecturas fuera de la carga — S–M (bajo valor / opcional)
- [ ] `[fuera de pantalla]` Dueño y plazo para la cola «por regularizar» (199 prendas, costo S/ 0) — decisión de Felipe

**Decisiones menores sin tarea (D6, D7):** D6 ¿qué atajos de la cabecera sobran (A-5)? Medir con `/multi-view-responsive`. D7 ¿el titular de «Resumen disponible» es 778 (tienda) o 127 (lo que se puede cobrar hoy) (B-6)?

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| A | Línea de arriba: «TIENDA TRU · SÁBADO, 3 DE OCTUBRE · VISTA DE LAS 16:33» | Dice la sede que se mira, el día (sin reloj vivo) y la hora en que el servidor armó la pantalla. Texto de 11 px en versalitas tau… | ajustar | [código page.tsx:157,162-163; EncabezadoPagina.tsx:46-52; FechaHoraLima.tsx:20-27] Falta la edad de la foto y el botón de actuali… |
| A | Título «Existencias» (46 px) | Nombre de la pantalla tal como lo dice el menú; la sede va arriba, nunca de título. | bien | [código EncabezadoPagina.tsx:53; menu.ts:307; ADR-0220] Igual a Ventas y Productos. |
| A | Frase «Qué hay en piso y almacén, qué viene en camino y qué deberías reponer ho… | Describe en 75 caracteres las tres tarjetas de abajo; ocupa dos líneas (max-w-md = 448 px). | ajustar | [código page.tsx:159; EncabezadoPagina.tsx:54] Usa «reponer» mientras el botón dice «bajar» (A-6) y 20 px más abajo «Prioridades… |
| A | Contenedor de acciones (dos filas a la derecha) | Fila 1: Bajar al piso y + Nuevo traslado. Fila 2: tres botones chicos con icono. En celular, una sola fila deslizable. | ajustar | [código page.tsx:176-214] Con cinco botones la columna derecha pide ≈930 px de contenido: a 1366 px la cabecera pasaría a ≈240 px… |
| A | Botón «Bajar al piso» | Destino: /inventario/bajar (pantalla de escaneo, RPC bajar_al_piso). Candado: veModulo(existencias) + sede propia + sububicacione… | ajustar | [código page.tsx:128-129,178-182; bajar/layout.tsx:4-8; bajar/page.tsx:24-30] Debe ser el principal en tienda (A-1), apagarse si… |
| A | Botón «+ Nuevo traslado» | Destino: /inventario/mover (formulario de traslado, origen = persona o líder con ?origen). Candado: veModulo(traslados), sin exig… | ajustar | [código page.tsx:183-187; mover/layout.tsx; mover/page.tsx:53-56; menu.ts:310; traslados/page.tsx:51] Principal solo en el Taller… |
| A | Botón «Recibir mercadería» | Destino: /recibir (recepción de lo que llega de PROVEEDORES; lo de otras sedes se recibe en Traslados, ADR-0299). Candado: sede p… | ajustar | [código page.tsx:191-196; recibir/layout.tsx; menu.ts:320,357; AvisoTrasladosEnCamino.tsx:3-8] Como atajo sobra; su destino aloja… |
| A | Botón «Contar» | Destino: /inventario/conteo. Candado: sede propia + veModulo(conteos); la página usa exigirModulo(conteos). Lateral: SÍ, Inventar… | sobra | [código page.tsx:197-202; inventario/conteo/page.tsx:15; menu.ts:311] Duplicado exacto del lateral y sin estado (no dice si hay u… |
| A | Botón «Apartados» | Destino: /vender/apartados (pantalla de Ventas). Candado: sede propia + tienda + veModulo(apartados); ruta con exigirModulo(apart… | sobra | [código page.tsx:203-211; vender/apartados/layout.tsx; menu.ts:285; InventarioPanel.tsx:737-742,1457] Dos puertas a lo mismo con… |
| A | Edad de la foto y botón «Actualizar» | No existe. Hoy solo hay «vista de las HH:MM» sin referencia ni forma de renovar. | falta | [código page.tsx:162-163; FechaHoraLima.tsx:20-27] Precedente en el mismo módulo: TrasladosPanel.tsx:97-115 (A-4). |
| A | Señal de confianza del piso (prendas por regularizar) | No existe en Existencias. La cola está en /recibir, Inicio y Finanzas. | falta | [producción] TRU 48 pendientes (5 vencidas), AQP 144 (38 vencidas); [código inicio-avisos.ts:205-221] (A-3). |
| B | Título «Prioridades de hoy» y bajada «Acciones clave para mantener el piso comp… | Rotula el bloque y promete acciones y operación al día. | ajustar | [visto] + [código InventarioPanel.tsx:731-732]. Una de las cuatro tarjetas es un dato, dos están en 0 en TRU y la cola real de re… |
| B | Tarjeta «Resumen disponible» | Muestra el stock libre de la sede y abre el resumen por categoría y ventas del mes. | ajustar | [código InventarioPanel.tsx:752-762]. Es un dato, no una prioridad; el titular no es lo cobrable hoy (B-6). |
| B | Cifra «778 uds» | Σ disponible = Σ (total - apartado) de las tallas de la sede. | bien | [código inventario-v2.ts:188-198] [producción] 777 al revisar tras una venta de 1 ud; cuadra con el libro. Posible sobreconteo de… |
| B | Línea «127 en piso · 651 en almacén» | Reparte lo libre por lugar (Σ pisoDisponible, Σ almacenDisponible). | ajustar | [código InventarioPanel.tsx:605-608,755-756]. Cuadra con 778, pero está en letra chica, hidden bajo 640 px y sin prueba (B-6, B-8… |
| B | Ventana del Resumen (título «Resumen del stock», tarjeta «Hay en la tienda», «V… | Stock por categoría y ventas del mes desde fn_resumen_variantes. | ajustar | [código ResumenStockOverlay.tsx:116-121] [producción] cuenta 25 vendidas en TRU; con 42 sin registrar la cifra real es ~67 (B-6). |
| B | Tarjeta «Reponer a piso hoy» (fondo rosado) | Lista hasta 3 prendas con alguna talla que pide piso, ordenadas por urgencia. | ajustar | [código TarjetaReponerAPiso.tsx:57-68]. La intención (acción primero) es correcta; la ejecución no prioriza ni cuenta (B-1, B-2,… |
| B | Fondo rosado y color rojo de la tarjeta Reponer | Señal de urgencia cuando hay al menos una prenda en la lista. | sobra | [código TarjetaReponerAPiso.tsx:62-68] [producción] 408 de 408 prendas cumplen: siempre encendido, no distingue nada (B-3). |
| B | Texto «Empieza por estas prendas» | Introduce las tres filas. | ajustar | [código TarjetaReponerAPiso.tsx:80]. Promete un orden que hoy es alfabético entre 23 empatadas (B-1). |
| B | Filas Body Bonita · Marrón, Body Lavie · Marrón, Body Leonor · Gris piedra con… | Cada fila filtra la lista por el nombre del modelo y se desplaza a ella. | ajustar | [visto] [producción] son las 3 primeras por nombre entre 23 empatadas; chips correctos (3 tallas por colgar). Clic: InventarioPan… |
| B | Cifra total de lo que hay por colgar (396 tallas, 604 uds, 291 prendas) | No existe en la tarjeta; ya está calculada en el panel (cuentaPorColgar) y no se muestra. | falta | [código InventarioPanel.tsx:465] [producción] piso=0 con almacén: 396 tallas, 604 uds (B-2). |
| B | Tarjeta «En camino hacia acá» · «0 unidades» · «Ningún traslado en camino» | Suma unidades de traslados en_transito hacia la sede; enlaza a Traslados. | ajustar | [código InventarioPanel.tsx:773-779]. Correcta con datos, pero enlace sin veTraslados, «1 unidades», traslados y unidades con bas… |
| B | Tarjeta «Incidencias» · «0 prendas» · «Ninguna prenda dañada pendiente» | Cuenta filas de prendas_danadas en cuarentena y abre la cola de dañadas. | ajustar | [código InventarioPanel.tsx:780-791] [producción] 0 dañadas, pero 47 prendas por regularizar en TRU (B-4). |
| B | Cola «Por regularizar» (52 en TRU, 147 en AQP al cierre) | No aparece en Existencias; vive en Recibir, el Inicio del líder (solo > 2 días) y Finanzas. | falta | [producción] 47/144 pendientes; [código] inicio-avisos.ts:205-220, page.tsx:75 (B-4). |
| B | Aviso «N apartadas para clientes» (junto al título, solo si hay) | Abre la lista de apartados de la sede cuando existen. | bien | [código InventarioPanel.tsx:735-744]; no se ve en la captura (0 apartados en producción). |
| B | Prop urgente de TarjetaPrioridad (estilo rojo) | Pinta una tarjeta de urgente; ningún llamador la usa. | sobra | [código InventarioPanel.tsx:184-216; grep: sin llamadores] (B-7). |
| C | Buscador «Buscar prenda, marca, código, color o talla…» | Filtra en el navegador por nombre, marca, categoría, código, color y talla en cualquier orden; Enter con un código exacto abre es… | bien | [código InventarioPanel.tsx:812-829; filtro-busqueda-especial.ts] [producción: 725/725 con código]. Menores: en escritorio solo r… |
| C | Combo «Marca: todas» (25 opciones) | Filtra por la marca del producto; solo aparece con 2 o más marcas en la sede. | ajustar | [código InventarioPanel.tsx:419-423, 835-843] [producción: 25 marcas; 45 de 400 pares Marca×Categoría tienen stock]. Sin conteos… |
| C | Combo «Categoría: todas» (16 opciones) | Filtra por categoría del producto. | ajustar | [código InventarioPanel.tsx:413-416, 844-850] [producción: 179 de 816 pares Categoría×Color con stock]. Ver C-4. |
| C | Combo «Talla: todas» (13 opciones) | Filtra por talla; el texto escrito manda sobre él («Se usa lo que escribiste»). | ajustar | [código InventarioPanel.tsx:424, 851-858] ordena como texto (26…34, Estándar, L, M, S, S/M, XL, XS, Única) aunque compararTallas… |
| C | Combo «Color: todos» (51 opciones) | Filtra por color; el texto escrito manda sobre él. | ajustar | [código InventarioPanel.tsx:425-428, 859-866] [producción: 51 colores; el buscador ya entiende «negro» o «blanca»]. Útil para qui… |
| C | Combo «Acción: todas» (Reponer a piso · Mantener) | Filtra por calcularAccionHoy: piso libre ≤ 4 → «Reponer a piso», si no «Mantener». | sobra | [producción] Reponer = 533 de 533 tallas (96 de 96 productos), Mantener = 0, también en AQP y LIM; [código existencias-filtros.ts… |
| C | Combo «Estado ▸ Dañado / cuarentena» | Muestra las tallas con unidades en cuarentena. | sobra | [producción] 0 tallas con cuarentena y 0 filas en prendas_danadas; [código InventarioPanel.tsx:879-891]. La cola ya se abre desde… |
| C | Combo «Estado ▸ Por colgar» | Muestra las tallas con piso libre en 0 y algo libre en almacén, ordenadas por percha. | ajustar | [producción] 396 tallas, 604 uds, 85 productos; es el único filtro que responde «qué repongo» y vive tercero dentro de un combo,… |
| C | Falta: «Por colgar» de un clic con su número | No existe: ni píldora ni cifra en la tarjeta. | falta | [código InventarioPanel.tsx:465, 920-933; TarjetaReponerAPiso.tsx:57-61] cuentaPorColgar se calcula y no se dibuja en la apertura… |
| C | Falta: filtros en la URL | No existe: búsqueda, filtros, orden y vista son useState. | falta | [código InventarioPanel.tsx:355-364, 392-398; page.tsx:32-40; inicio-avisos.ts:273]. Ver C-7. |
| C | Texto «96 productos · Vista de piso y almacén» | Cuenta modelos (productoId) tras filtros y búsqueda y agrega un rótulo fijo. | ajustar | [código InventarioPanel.tsx:911-913] [producción: 96 modelos con fila de stock en TRU, todos con stock; el 97.º del catálogo con… |
| C | Botón «Ver detalle» (cabecera) | Alterna tarjetas ↔ tabla; el rótulo cambia a «Ver tarjetas» y cierra el cajón al volver. | ajustar | [código InventarioPanel.tsx:944-958]. Modo escondido con rótulo que cambia; ver C-6. |
| C | Botón «Ver detalle» (ícono en cada tarjeta) | Escribe el nombre del producto en el buscador y pasa a la tabla. | ajustar | [código InventarioPanel.tsx:1082-1086; ExistenciasTarjetas.tsx:330-342] la maqueta decía que abría el cajón de la prenda (README… |
| C | «Ordenar por: Más relevantes» | Cinco criterios en tiendas (relevancia, nombre, más/menos piso, más almacén); «relevancia» es el orden que ya trae la lista. | ajustar | [código ExistenciasTarjetas.tsx:25-43, 59-83] sin texto es urgencia con desempate A–Z, con texto es coincidencia; solo ordena tar… |
| C | Vista «Por prenda / Por talla» y paginación de 15 | En la tabla, una fila por prenda (curva de tallas) o por talla (cobertura, ritmo, en la red); 15 por página; el cajón se abre des… | ajustar | [código InventarioPanel.tsx:959-984, 1113-1193] [producción: 28 páginas por prenda, 36 por talla, 7 de tarjetas]. «Por talla» es… |
| C | «Limpiar filtros» | Aparece con algún filtro o texto puesto y los quita todos, menos el orden. | bien | [código InventarioPanel.tsx:513-516, 529-533, 935-942] |
| C | Botón «Filtros · N» (celular) | Pliega los combos tras un botón que dice cuántos hay puestos. | bien | [código InventarioPanel.tsx:401, 833, 896-908; ADR-0237 act. 2026-09-26 noche 2 #6]. No verificado a 375 px en esta ronda [no ver… |
| C | Estado vacío explicativo (ExistenciasVacio) | Cuando los filtros dejan 0, explica por qué y ofrece quitar de a uno con el número de prendas que se verían. | bien | [código InventarioPanel.tsx:686-705, 1032-1059; lib/existencias-vacio.ts] |
| D | Tarjeta como zona clicable (abrir el cajón de la prenda) | Hoy no existe: el article no tiene onClick y el cajón solo se abre desde la tabla. | falta | [código ExistenciasTarjetas.tsx:181-185; InventarioPanel.tsx:1060-1087, 1469] [docs] la maqueta decía que 'Ver detalle' de la tar… |
| D | Foto / placeholder (96×128 px) | Muestra la foto principal del producto o el isotipo al 30 % sin el color de la prenda. | ajustar | [código ExistenciasTarjetas.tsx:187-188] [producción] 10 de 98 productos con foto; 8 de esos 10 tienen varios colores y la foto n… |
| D | Nombre del modelo (h3) | Muestra la referencia truncada, con title completo. | bien | [código ExistenciasTarjetas.tsx:195-197] |
| D | Marca · Color del color elegido | Pone la marca tenue (solo con 2 o más marcas) y el color en fuerte. | bien | [código ExistenciasTarjetas.tsx:199-202; InventarioPanel.tsx:419-420] |
| D | Círculos de color (selector) | Un botón de 22 px por color que cambia el color mostrado en la tarjeta, sin URL. | ajustar | [código ExistenciasTarjetas.tsx:203-221] 8 colores = 8 clics, sin ver las cifras juntas; Blanco/Crudo casi invisibles (1,06:1 y 1… |
| D | Caja Piso (fondo rosado) | Muestra las unidades libres en piso del color elegido; siempre en rojo. | ajustar | [código ExistenciasTarjetas.tsx:227-231] rojo fijo sea cual sea el valor; solo cuenta un color (D-1, D-3). |
| D | Caja Almacén | Muestra las unidades libres en almacén del color elegido. | ajustar | [código ExistenciasTarjetas.tsx:232-236] [producción] Body Bonita: 4 mostradas de 19 del modelo; 74 de 96 tarjetas muestran menos… |
| D | Total del modelo (piso, almacén, colores) | No existe en ninguna parte de la tarjeta ni del cajón. | falta | [código ExistenciasTarjetas.tsx entero; CajonPrendaExistencias.tsx:209-247] [producción] 84 de 96 modelos con más de un color. |
| D | Rótulos Piso / Almacén con ícono (10 px) | Rotulan las dos filas de la matriz una vez por renglón. | ajustar | [código ExistenciasTarjetas.tsx:111-132] text-[10px], tinta/60 = 4,48:1; ícono de Piso en rojo (D-3). |
| D | Celdas de talla S/M/L (matriz piso · almacén) | Cuadro con las dos cifras de cada talla del color elegido; rojo si no hay nada en ningún lado. | ajustar | [código ExistenciasTarjetas.tsx:250-279] div con title, sin acción ni teclado; hasta 4 tallas por renglón; 19 de 533 tallas en ro… |
| D | Pastilla '«N» tallas sin stock en piso / por reponer / Mantener' | Diagnóstico del color elegido (queHacerPrenda), en ámbar, rojo o verde. | ajustar | [código ExistenciasTarjetas.tsx:92-107; existencias-prendas.ts:198-204] [producción] 19 roja, 286 y 103 ámbar, 0 verde de 408; el… |
| D | Chips 'N dañadas' y 'Apartado · N' | Muestran otros dos ejes (cuarentena y reservas) del color elegido. | bien | [código ExistenciasTarjetas.tsx:282-291] [producción] hoy 0 dañadas y 0 apartadas, el espacio está vacío y no estorba. |
| D | Botón 'Reponer prenda' (primario oscuro) | Abre la ventana de bajar del almacén al piso, de todos los colores del modelo (RPC bajar_al_piso, todo o nada). | ajustar | [código ExistenciasTarjetas.tsx:300-311; ReponerPrendaModal.tsx:223-285] 3 clics con persona presente, 5 en terminal; abre sin el… |
| D | Botón 'Subir prenda' | Abre la ventana de subir del piso al almacén (RPC retirar_del_piso). | sobra | [código ExistenciasTarjetas.tsx:312-323] [producción] deshabilitado en 62 de 96 modelos (piso total 0); es el botón más ancho del… |
| D | Botón 'Ajustar' | Abre 'Ajustar inventario' para el color elegido (motivo, cantidades, Responsable). | sobra | [código ExistenciasTarjetas.tsx:324-329; AjustarInventarioModal.tsx:393] corrige el libro; ya vive en el cajón como 'Ajustar stoc… |
| D | Botón de ícono 'Ver detalle' | Escribe el nombre del modelo en el buscador y cambia a la tabla. | ajustar | [código ExistenciasTarjetas.tsx:330-342; InventarioPanel.tsx:1082-1086] el mismo rótulo que el botón de la cabecera, que hace otr… |
| D | Orden de las tarjetas ('Más relevantes') | Mantiene el orden de ordenarPorUrgencia; 'Más en el piso' etc. suman todos los colores. | ajustar | [código ExistenciasTarjetas.tsx:28-83; existencias-prendas.ts:217-222] [producción] desempate alfabético entre 23 prendas; 'relev… |
| D | Botones ocultos por permiso o por mirar otra sede | Reponer, Subir y Ajustar desaparecen sin decir por qué; solo queda 'Ver detalle'. | ajustar | [código ExistenciasTarjetas.tsx:300,312,324; CajonPrendaExistencias.tsx:104-105,299] el cajón explica solo lo de etiquetas e hist… |
| D | Cajón lateral (contenedor) | Panel derecho sin velo con la prenda y sus acciones; se cierra con la X o Escape. | ajustar | [código CajonPrendaExistencias.tsx:145-153; InventarioPanel.tsx:1469-1496] solo se abre desde la tabla, el escaneo o ?variante= (… |
| D | Cajón: encabezado (foto, nombre, color) | Muestra foto o isotipo, referencia y color de la prenda abierta. | bien | [código CajonPrendaExistencias.tsx:167-202] con la salvedad de la foto por color (D-5). |
| D | Cajón: resumen (Piso · Almacén, N tallas, diagnóstico) | Tres celdas con las cifras del color y su diagnóstico en rojo, ámbar o neutro. | ajustar | [código CajonPrendaExistencias.tsx:209-247] rojo para todo 'faltan tallas' mientras la tarjeta lo pinta ámbar; tres redacciones d… |
| D | Cajón: Disponibilidad por talla | Cuadrícula de 4 columnas con piso · almacén por talla del color. | bien | [código CajonPrendaExistencias.tsx:250-269] |
| D | Cajón: Reponer prenda (principal) | Abre la ventana de bajar del almacén al piso; se ofrece solo si ese color tiene algo que bajar y la persona puede. | bien | [código CajonPrendaExistencias.tsx:274] [producción] candado fn_ve_modulo('existencias'); criterio distinto del de la tarjeta (D-… |
| D | Cajón: Subir prenda | Abre la ventana de subir del piso al almacén. | bien | [código CajonPrendaExistencias.tsx:275, 137] se ofrece si alguna talla tiene algo libre en el piso. |
| D | Cajón: Trasladar | Enlaza a Mover mercadería con una unidad por talla que tenga almacén (tope 100); sale de la pantalla. | bien | [código CajonPrendaExistencias.tsx:276; existencias-prendas.ts:132-152] solo si el rol ve Traslados. |
| D | Cajón: Ajustar stock | Abre 'Ajustar inventario' en la primera talla del color; exige motivo y Responsable. | bien | [código CajonPrendaExistencias.tsx:284; AjustarInventarioModal.tsx:70-75, 433-440] [producción] fn_puede_ajustar_stock = líder o… |
| D | Cajón: Imprimir etiquetas | Enlaza a etiquetas de precio de exactamente las tallas del color. | bien | [código CajonPrendaExistencias.tsx:285; existencias-prendas.ts:154-160] |
| D | Cajón: Eliminar el producto | Abre la ventana que borra el producto entero, con su stock en todas las sedes, con respaldo. | sobra | [código CajonPrendaExistencias.tsx:289; existencias-permisos.ts:62] [producción] 12 cuentas Integrante lo ven; 80 de 96 productos… |
| D | Cajón: Ver historial | Enlaza al historial del producto en la sede activa. | bien | [código CajonPrendaExistencias.tsx:294-297] |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-26 | completo | 5/10 (promedio 6.0, con tope 5) | 7.4 — Soporte | primer análisis (pantalla anterior al #445) |
| 2026-09-26 (tarde) | completo, sin SQL | 5/10 (promedio 6.3, con tope 5) | 7.8 — Soporte | Sobre el PR #500 (`ffa5d52b`). **Cerradas:** #2 (el #445 se fusionó), #3, #4 y #5 (buscador con marca, filtro Marca y vacío que explica: están en el código). **Superadas por el rediseño:** #8 (el semáforo de 4 estados ya no existe, pero su defecto reaparece como «todo pide reponer»: nueva #5) y #11 (la tabla por talla dejó de ser la vista principal). **Siguen abiertas:** #1 (Ajustar, nueva #1), #10 (candado de módulo, nueva #3), #6 (estrategia alternativa: ahora sección 8), #7 (motor único de búsqueda), #9 (`es_prueba`: la lista lo excluye, `fn_resumen_variantes` sin verificar) y #12. |
| 2026-10-03 | completo, con SQL de solo lectura | 4,5/10 (promedio de 6; el tope 5 no hizo falta) | 8,0 — Núcleo | **Análisis anterior vencido** (la pantalla se rehízo: −1.284 líneas en `InventarioPanel.tsx`). Once de las 12 del 26-sep figuraban ✅ hechas (la #12 era de bajo valor); de ellas **siguen vivas en otra forma** `[inferido: comparé sus títulos con lo que hoy muestra el código]`: #5 (el umbral quedó abierto: hoy 533/533 → nueva #2/#3), #10 (un solo vocabulario: hoy tres verbos → nueva #9) y #11 (pruebas: `resumirExistencias` y `ordenarModelos` siguen sin prueba → #12). Nuevas: #1 (cola por regularizar), #4 (Eliminar en el cajón) y #5–#7 (tarjeta). |

## Anexo · consultas de solo lectura usadas (producción, proyecto `cayla-dynamic`, schema `retail`)
Todas son `SELECT`, sin datos personales. Se corrieron el 2026-10-03 (≈ 17:00–18:00, hora de Lima).
```sql
-- Q1 · libro vs foto (0 diferencias en 705 claves)
with delta as (
  select variante_id, ubicacion_id, sububicacion_id,
         case tipo when 'entrada' then cantidad when 'ajuste' then cantidad when 'salida' then -cantidad when 'traslado' then -cantidad end as d
  from retail.movimientos
  union all select variante_id, ubicacion_destino_id, sububicacion_destino_id, cantidad from retail.movimientos where tipo='traslado'
), libro as (select variante_id, ubicacion_id, sububicacion_id, sum(d)::int as esperado from delta group by 1,2,3)
select count(*) as claves, count(*) filter (where coalesce(l.esperado,0) <> coalesce(s.cantidad,0)) as no_cuadran
from libro l full join retail.stock s on s.variante_id=l.variante_id and s.ubicacion_id=l.ubicacion_id and s.sububicacion_id is not distinct from l.sububicacion_id;

-- Q2 · ventas reales por sede: cuánto salió como «Prenda sin Registrar»
select u.nombre as sede, sum(vi.cantidad) as unidades,
       sum(vi.cantidad) filter (where va.sku='CARGO-ESPECIAL-01') as sin_registrar
from retail.ventas v join retail.venta_items vi on vi.venta_id=v.id
join retail.variantes va on va.id=vi.variante_id join retail.ubicaciones u on u.id=v.ubicacion_id
where v.estado='completada' and not v.es_prueba group by 1;

-- Q3 · cola por regularizar por sede
select u.nombre, p.estado, count(*), round(sum(p.precio_cobrado),2)
from retail.prendas_por_regularizar p join retail.ubicaciones u on u.id=p.ubicacion_id group by 1,2;

-- Q4 · TRU: tallas por nivel de piso (533 de 533 con piso ≤ 4; 396 con piso 0 y almacén)
with v as (
  select va.id, va.producto_id,
         coalesce(sum(st.cantidad) filter (where su.tipo='piso_venta'),0)::int as piso,
         coalesce(sum(st.cantidad) filter (where su.tipo='almacen_tienda'),0)::int as almacen
  from retail.variantes va join retail.stock st on st.variante_id=va.id
  join retail.ubicaciones u on u.id=st.ubicacion_id and u.nombre='Tienda TRU'
  left join retail.sububicaciones su on su.id=st.sububicacion_id where va.activo group by 1,2)
select count(*), max(piso), count(*) filter (where piso<=4), count(*) filter (where piso=0 and almacen>0), sum(almacen) filter (where piso=0 and almacen>0)
from v;

-- Q5 · cruce cola ↔ stock (¿existe en TRU una variante equivalente? ¿con piso 0 y almacén?)
-- (misma categoría + talla + color; 52 pendientes de TRU → 27 con equivalente → 23 con piso 0 y almacén)
```
