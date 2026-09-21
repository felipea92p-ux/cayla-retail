# Pantalla — Inicio (`/`, `app/(app)/page.tsx`)

> Modo: completo · Fecha: 2026-09-21 · Rol/sede: líder · Tienda TRU · Datos: real (producción, **parcial**: ver «Qué quedó sin datos reales»)
> SHA analizado: `f0f66b73` (`origin/main`, la rama iba al día 0/0) — si `page.tsx`, `AppShell.tsx` o `movimientos-v2.ts` cambian después, este análisis está vencido
> Archivos: `apps/web/app/(app)/page.tsx` · `lib/persona-actual.ts` · `lib/movimientos-v2.ts` · `lib/movimientos-reglas.ts` · `lib/cargo-especial.ts` · `components/AppShell.tsx` (menú y badge) · `lib/traslados.ts` · RPC `fn_movimientos`, `fn_persona_actual_resumen` · tablas `productos`, `variantes`, `stock`, `movimientos`
> **Estado posterior al análisis (2026-09-21):** casi todas las tareas ya están implementadas; ver [inicio-traspaso.md](inicio-traspaso.md) para qué quedó hecho y qué falta. Este análisis describe la pantalla ANTES de esos cambios.
> Otra sesión tocándola: no (la fila de `SESIONES-ACTIVAS.md` sobre `/buscar` ya está mergeada: commit `00d64aff`, #85)

## 0 · Veredicto
Inicio es honesto pero casi vacío: cuenta cosas de catálogo y lista los últimos 8 movimientos, y no dice cómo va el día ni qué hay que atender. Es la pantalla más vista del sistema (todos aterrizan aquí) y hoy es la que menos ayuda a decidir.
**Cumple su finalidad:** 5.1/10 · **Relevancia:** 4.2/10 — Comodidad (por contenido; por frecuencia sería Núcleo, y esa es la oportunidad)

## 1 · Finalidad declarada
"Esta pantalla existe para que quien abre sesión vea, en 5 segundos, cómo está su sede hoy y qué le toca atender, y llegue en un clic a lo que va a hacer."
Fuente: **inferida**, porque ningún doc la escribe para el Inicio V2. Sale de `docs/datos/11-KPIS.md:146` (Inicio = «hoy por sede + tendencia de 14 días»), del BACKLOG (`lib/pendientes.ts` = «la bandeja del Inicio», línea ~4554) y de `docs/datos/modulos/13-inteligencia-y-reportes.md`. El comentario de `page.tsx:8-15` dice lo contrario: esta versión «solo muestra lo que V2 puede probar hoy».
¿Docs y pantalla coinciden? **No.** Los docs describen el Inicio V1 (`getPanelInicio` en `lib/panel.ts`, bandeja en `lib/pendientes.ts`); ninguno de los dos archivos existe ya (`ls` → no such file; borrados en `0af2f1b5`). Manda el código. Felipe corrige la finalidad si falla.

## 2 · Objeción
**Inicio no responde ninguna de las preguntas con las que una colaboradora o la líder abre el sistema: ¿cuánto vendí hoy?, ¿está abierta la caja?, ¿qué llegó o tengo que recibir?** Y lo poco que muestra se equivoca en su rótulo: «Productos activos» cuenta todos los productos, «Variantes (SKU)» cuenta la variante centinela «Cargo especial» y las inactivas (`page.tsx:20-21`). Es un número dicho con seguridad que no significa lo que dice, en la primera pantalla de todos.
Trade-off honesto: el recorte fue deliberado (`page.tsx:8-15`, Fase UI 1, 2026-09-11: se prefirió mostrar poco y cierto que mucho y de otro esquema). Fue correcto entonces. Diez días después, con `fn_ventas_del_dia`, `getTrasladosPorAtender` y `caja` ya vivos en V2, la excusa desapareció y el recorte se volvió deuda.

## 3 · Lo que está bien y no se toca
- **Cero silencios:** `exigir()` en las tres lecturas y en la lista (`page.tsx:34-37`): una consulta caída no dibuja «0 unidades», cae al `error.tsx` de `(app)` con «reintentar» y el menú lateral sigue de pie. `[código page.tsx:34-37, (app)/error.tsx]`
- **Excluye la centinela del stock** (`.neq("variante_id", ID_CARGO_ESPECIAL)`, `page.tsx:28`): sin eso «Unidades» mostraría ~1.000.000 de prendas ficticias. `[código]`
- **Lee el ledger real, no una copia:** «Actividad reciente» sale de `fn_movimientos`, la misma fuente que Movimientos (principio 4). Fecha en hora de Lima resuelta en SQL. `[código movimientos-v2.ts:170-191]`
- **La ubicación es perspectiva, no permiso:** la cookie de sede solo cambia lo que se mira; la RLS de `stock`/`movimientos` sigue acotando a un integrante a su sede vía `fn_puede_operar_ubicacion`. `[código persona-actual.ts:63-79]` `[producción D3]` las 5 funciones existen y todas traen `search_path` fijo; cuatro son `security definer` y `fn_puede_operar_ubicacion` es invoker (llama a las otras, no necesita elevar).
- **Índices donde pega la consulta:** `movimientos_ubicacion_fecha_idx`, `movimientos_destino_fecha_idx`, `movimientos_created_at_idx`. `[producción A3]`
- **Coincide con la realidad:** las 6 salidas del 21/09 de la captura = las 6 filas de `movimientos` de ese día en producción (B2). `[visto]` `[producción B2]`
- **Estructura visual:** crema, tinta, tarjetas `card-cayla`, tipografía de display en las cifras, hover en rojo (no hay rojo en reposo, tope de 2 respetado). `[visto]`

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 6 | Coherente con la marca, pero con una celda gris vacía, jerarquía plana y jerga «V2» | `[visto]` `[código page.tsx:42,54]` |
| Lógica de negocio | 4 | Rótulos que no dicen lo que cuentan; ninguna decisión escrita define qué debe mostrar Inicio | `[código page.tsx:20-21]` |
| Arquitectura | 7 | Sólida y segura; un tope silencioso de 1.000 filas y todo-o-nada por una consulta | `[código]` `[producción]` |
| Funciones | 4 | 0 fantasmas, pero 3 tarjetas de baja utilidad y faltan ventas de hoy, caja y pendientes | `[código]` `[visto]` |
| Utilidad | 4.5 | La primera pantalla no lleva a vender ni dice qué hacer | `[visto]` `[inferido]` |
| Conexión con el ERP | 5 | Bien conectada al ledger; desconectada de ventas, caja, compras, SUNAT y Taller | `[código]` |

**Cumple su finalidad = (6 + 4 + 7 + 4 + 4.5 + 5) / 6 = 5.1.** Sin tope: la pantalla es de solo lectura y no puede dañar dinero ni stock.

### Estética — 6
- (a) Coherencia: usa `card-cayla`, `label-cayla`, `font-display`, `tinta/65` (5.14:1 según ADR-0012), crema, sin blanco ni negro puros. `[código]` Rojo: 0 en reposo (solo hover). `[visto]` Comparación con 2–3 hermanas: `[no verificable]` sin capturas de ellas; comparte con Movimientos `ETIQUETA_CATEGORIA` y `textoDelta`.
- **Defecto visible:** cinco tarjetas en una grilla de 2 columnas dejan la sexta celda como bloque gris (el fondo `bg-tinta/12` del truco de líneas de 1 px queda a la vista). `[visto]` `[código page.tsx:54]`
- (b) Marca y tono: «CAYLA V2 · TIENDA TRU» expone «V2», jerga interna, a una colaboradora. La sede aparece **tres veces** (cabecera, sobretítulo, tarjeta «Unidades en TIENDA TRU»). El saludo por nombre y «Donde el estilo transforma» están bien. `[visto]`
- (c) Heurísticas: jerarquía plana (tres cifras grandes del mismo peso: la que más importa, si la hubiera, no destaca); reconocimiento sobre recuerdo bien resuelto con descripciones bajo cada acción; tamaño táctil de las tarjetas correcto (~88 px). `[visto]` Tres cifras enormes ocupan el lugar donde iría lo accionable.

### Lógica de negocio — 4
- «Productos activos» = `count` sin filtro sobre `productos` (`page.tsx:20`). El modelo tiene `productos.estado` (`activo`/`descontinuado`) y `estado_alta` (`pendiente`/`aprobado`/`rechazado`, `20260918020000_censo_alta_al_vuelo.sql:25`). `[código]` Cuánto se equivoca en producción: `[no verificable]` (C1 y C3 sin resultado).
- «Variantes (SKU)»: incluye `variantes.activo = false` y la centinela «Cargo especial» (`page.tsx:21`; `cargo-especial.ts` la excluye en stock y movimientos pero no aquí). `[código]` `[visto]` 164 en pantalla.
- «Unidades en TIENDA TRU» = suma de `stock.cantidad` en todas las sububicaciones (piso + almacén + racks), incluyendo variantes inactivas y de productos descontinuados. Es stock **físico total**, no «lo que puedo vender»: `[producción C4]` `stock.cantidad_apartada` **no existe en producción todavía** (error 42703), así que hoy «físico» y «disponible» coinciden; el día que se aplique la migración de apartados (ADR-0141), las dos cifras se separarán y esta tarjeta seguirá diciendo «unidades» sin aclarar cuál.
- Ninguna D-nn de `DECISIONES-2026-09-12.md` cubre qué debe mostrar Inicio ni qué significa «activo». Es un hueco de definición, no un candado roto.
- Referente (de memoria, **no verificado**): el inicio de Shopify POS y de Odoo prioriza «ventas de hoy» y lo pendiente sobre conteos de catálogo. Pasa el filtro «¿le sirve a 3 tiendas y 1 taller?»: sí, ventas de hoy y por atender; no pasa: gráficos de tendencia y comparativos entre sedes (van a «Futuro»).

### Arquitectura — 7
- Cadena: `page.tsx` → `requirePersonaActualV2` → `fn_persona_actual_resumen` (+ cookie) → 3 lecturas directas por RLS (`productos`, `variantes`, `stock`) + `fn_movimientos` → `exigir`. `[código]`
- **Estados imposibles:** no aplica (solo lectura). Los candados que sostienen lo que se lee (`stock_cantidad_no_negativa`, ledger append-only) son de otros módulos.
- **Concurrencia:** no aplica a la lectura; lo leído puede quedar viejo en segundos (sin refresco), aceptable.
- **Caída externa:** Inicio no depende de SUNAT/Culqi/Nubefact. Se degrada así: si cae una consulta, todo Inicio cae a `error.tsx` con «reintentar» y la barra lateral sigue viva; **no pierde ningún dato** porque no escribe. Pero es todo-o-nada: una sola consulta secundaria (lista de actividad) tumba las tres tarjetas y las acciones. `[código page.tsx:34-37]` (el BACKLOG lo eligió a propósito para las tarjetas; para la lista secundaria es caro).
- **Tope silencioso:** `stock.select("cantidad").eq(ubicacion)` trae las filas al servidor y las suma en JS (`page.tsx:23-37`). PostgREST corta en 1.000 filas por defecto; la suma quedaría **más baja sin avisar**. Hoy: 164 variantes (`[visto]`), con varias sububicaciones ≈ hasta 500 filas `[inferido]`; el tope se alcanza al duplicarse el catálogo. Contradice el espíritu de `exigir()`.
- **Volumen con números:** `[producción B2]` últimos 14 días: 6, 10, 13, 93, 164, 1, 85, 108 movimientos por día (máx. 164/día; ~48 de promedio los días con actividad). Extrapolado a 3 años ≈ 50.000–180.000 filas `[inferido]`, cubiertas por índices `[producción A3]`; la consulta pide 8 filas. Sin problema de rendimiento. Total y crecimiento de tablas (B1): `[no verificable]`.
- **Seguridad (lente RLS):** `productos`/`variantes` son legibles por cualquier autenticado (`0004_rls.sql:29,39`) `[código]`; `stock` y `movimientos` acotados por `fn_puede_operar_ubicacion`. Ok para «catálogo abierto, stock acotado». Políticas reales en producción: `[no verificable]` (D1/D2 sin resultado).
- **Tests:** ninguna prueba cubre Inicio; las reglas de conteo están dentro del componente, no en `lib/`, contra la convención del repo (CLAUDE.md, «Server Components»). `[código]`

### Funciones — 4
- **Funcionan (0 fantasmas):** las 5 tarjetas apuntan a rutas con `page.tsx` real (`/buscar`, `/recibir`, `/inventario`, `/productos`, `/inventario/movimientos`). `[código]` La actividad reciente funciona.
- **Sobran o duplican:** Inventario, Productos, Movimientos y Recibir mercadería ya están en la barra lateral (`AppShell.tsx:869-1013`); la única puerta que solo existe aquí es **Buscar**. Las tres tarjetas de conteo son curiosidad: ninguna decisión de la sede depende de «45 productos». `[visto]`
- **Faltan para cumplir la finalidad:** ventas de hoy; estado de la caja (abierta/cerrada); lo que hay que atender (traslados por recibir, hoy solo el badge «2» del menú; comprobantes SUNAT pendientes); un camino directo a **vender**.
- **Actividad reciente muestra «SALIDA» pelado:** el catálogo ya trae `etiquetaMovimiento`/`etiquetaProceso` (`movimientos-reglas.ts:125-134`) que distinguen venta, merma, traslado; Inicio usa la etiqueta gruesa `ETIQUETA_CATEGORIA` (`page.tsx:79`). `[código]` Una salida por venta y una por merma se ven idénticas. `[visto]`

### Utilidad — 4.5
Escenario: colaboradora nueva, primer día, hora pico (las 19:00), quiere cobrar. Abre el sistema → aterriza en Inicio → ve tres números, 5 tarjetas de inventario y catálogo, y ninguna dice «Vender». Tiene que mirar el menú: *Ventas* (desplegado en la captura) → *Punto de Venta*. Duda entre «Buscar», «Inventario» y «Productos». `[visto]` `[inferido]` En celular la barra inferior sí trae Punto de Venta y Caja (`AppShell.tsx:1013-1025`), así que el problema es sobre todo de escritorio/tablet. Si se equivoca, el fallo es del diseño: la primera pantalla no le dice cuál es su primer paso.
Segundo escenario: la líder abre para saber cómo va la sede. Ve 315 unidades y 45 productos; ninguna cifra de dinero. Tiene que ir a Caja, luego a Comercial o Finanzas. `[inferido]`

### Conexión con el ERP — 5
- **Aguas arriba:** `productos`/`variantes`/`stock`/`movimientos`. Todo lo que hace cambiar `stock` (venta, recepción, traslado, conteo, ajuste) aparece aquí vía `movimientos`. Bien. `[código]`
- **Aguas abajo:** ninguna. Inicio no crea datos, solo enlaza; no alimenta nada.
- **Pájaro dueño y vecinos:** `[no verificable]` sin abrir `AVIARIO.md`. Vecinos por el código: Movimientos (misma fuente), Inventario/Existencias, Buscar, Recibir.
- **Desconectada de:** Caja (`lib/caja.ts`, `fn_ventas_del_dia`), Facturación/SUNAT, Compras por pagar (`resumen_compras`), Producción del Taller. Un líder no se entera desde Inicio de un comprobante SUNAT rechazado.
- **Externos y caídas:** ninguno directo; cuando se conecte con SUNAT/Nubefact, debe mostrar «pendiente» sin tumbar la pantalla (principio 9).

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 3 | No sostiene ninguna decisión hoy; tampoco captura datos de los que otras pantallas dependan |
| Dinero y stock que toca | ×1 | 2 | Solo lectura, no mueve ni una unidad ni un sol |
| Frecuencia y personas que la usan | ×1 | 10 | Es la pantalla de aterrizaje de todos los roles y sedes en cada sesión |
| Qué se detiene si falla | ×1 | 3 | Nada operativo: el menú sigue y todo se alcanza por él (`error.tsx` bajo el layout) |

Relevancia = (2·3 + 2 + 10 + 3) / 5 = **4.2** → Comodidad.
Lectura: la paradoja es que la pantalla más frecuente es la de menor contenido. Con «Hoy» y «Por atender» (tareas #2–#3), Gestión pasaría a 8 y la relevancia a ≈ 6.4 (Soporte); es un cálculo mío, no una medición.

## 6 · Conexión con el ERP
- **Aguas arriba:** ledger `movimientos` (fuente única), `stock` derivado, catálogo.
- **Aguas abajo:** ninguno (solo navega).
- **Pájaro dueño y vecinos:** `[no verificable]` (`AVIARIO.md` sin abrir). Comparte fuente con Movimientos y Existencias.
- **Externos, y qué pasa si caen:** no tiene ninguno hoy. Si la base falla, `error.tsx` con reintentar.

## 7 · Las 12 tareas, por importancia

### #1 · [Corregir] Que las tarjetas digan lo que cuentan
- **Dónde:** `page.tsx:20-21` (filtros), `:47-49` (rótulos), `lib/cargo-especial.ts`. Productos: `.eq("estado","activo")` (y decidir qué hacer con `estado_alta` pendiente); Variantes: `.eq("activo", true).neq("id", ID_CARGO_ESPECIAL)`; «Unidades» aclarar que es stock físico.
- **Por qué en este puesto:** es un número falso con cara de verdad en la pantalla que todos ven; cuesta 3 líneas y protege la confianza en todo lo demás. No daña dinero ni stock, por eso no va más arriba.
- **Cómo lo verificas tú:** corres C1–C3 (`select estado, count(*) from retail.productos group by 1;` etc.); las dos tarjetas deben coincidir con `estado='activo'` y `activo=true` sin la centinela. Hoy la pantalla dice 45 y 164.
- **Esfuerzo / dependencias:** S · ninguna. Va antes de la #2 para no construir encima de cifras dudosas.

### #2 · [Reconstruir] Bloque «Hoy»: ventas del día y estado de la caja
- **Dónde:** `page.tsx` (bloque nuevo), `lib/inicio-reglas.ts` (nuevo, puro), RPC `fn_ventas_del_dia` (ya usada en `caja/page.tsx:73` y `vender/page.tsx:115`, con filtro por rol incorporado), `lib/caja.ts`.
- **Por qué en este puesto:** es lo que la líder y la colaboradora quieren ver primero; sube Gestión de 3 a ~8. No exige tablas ni migración: las lecturas ya existen. Riesgo bajo (solo lectura), pero toca dinero visible, así que debe cuadrar con Caja.
- **Cómo lo verificas tú:** el total de «Hoy» en Inicio coincide con el de `/caja` y con la suma de `fn_ventas_del_dia` para esa sede; con la caja cerrada muestra «Caja cerrada» y un botón para abrirla.
- **Esfuerzo / dependencias:** M · después de la #1.
- **DECIDÍ:** que Inicio muestre solo **hoy** (importe, n.º de ventas, caja abierta/cerrada) con la fuente única `fn_ventas_del_dia`, sin serie de tendencia. **DESCARTÉ:** recrear `getPanelInicio` del V1 con la tendencia de 14 días, porque son cálculos aparte sobre `ventas.monto_total` que ya divergieron de Comercial (`11-KPIS.md`, «Qué lo rompe» a) y duplicarían la lógica de Caja. **SE ROMPE SI:** dos definiciones de «hoy» conviven: p. ej. Inicio suma por `created_at` y Caja por turno, y a las 11 p. m. en Trujillo las cifras discrepan; por eso usa `fn_ventas_del_dia`, que ya resuelve hora de Lima.

### #3 · [Mejorar] Bloque «Por atender»: lo que espera a esta sede
- **Dónde:** `page.tsx`; reutiliza `getTrasladosPorAtender` (`lib/traslados.ts:222-248`, que hoy solo alimenta el badge del menú, `(app)/layout.tsx:19`), comprobantes SUNAT pendientes (`lib/comprobantes.ts`) y compras por pagar (`resumen_compras`, solo líder).
- **Por qué en este puesto:** convierte la pantalla en cola de trabajo. Tiene la trampa que ya documentó el BACKLOG con `pendientes.ts`: un bloque que se esconde cuando no hay nada miente si la consulta falla. Debe mostrar «no pude leer esto» como pendiente, nunca callar.
- **Cómo lo verificas tú:** con un traslado `en_transito` hacia la sede el bloque lo muestra y coincide con el «2» de Inventario; desconectando la consulta (o forzando un error) aparece «Esta lista está incompleta», no un bloque vacío.
- **Esfuerzo / dependencias:** M · después de la #2 (misma zona de la pantalla) y de la #8 (tolerancia por bloque).

### #4 · [Replantear] Decidir si Inicio pasa a ser distinto por rol y por ubicación
- **Dónde:** sección 8 de este archivo; hoy `page.tsx` renderiza lo mismo para líder, integrante y taller (`persona.rol`, `persona.ubicacionTipo` no se usan).
- **Por qué en este puesto:** condiciona las #5 y #6. Un Inicio del Taller que muestra «315 unidades en tienda» no sirve a nadie; una colaboradora no necesita el mismo tablero que la líder.
- **Cómo lo verificas tú:** decides A/B/C en la sección 8; después de ejecutarlo, entras como integrante, líder y desde el Taller y ves tres Inicios distintos.
- **Esfuerzo / dependencias:** M–L · decide Felipe antes de #5 y #6.
- **DECIDÍ:** proponer un solo `page.tsx` con bloques condicionados por `persona.rol` y `ubicacionTipo` (opción B). **DESCARTÉ:** una ruta distinta por rol (`/inicio-lider`, `/inicio-taller`), porque triplica el mantenimiento y CAYLA tiene 3 tiendas y 1 taller, no 40. **SE ROMPE SI:** se crea una tercera variante de rol (supervisor de sede) sin regla común y los bloques condicionales se vuelven un árbol de `if`; por eso la regla vive en `lib/inicio-reglas.ts`, no en el JSX.

### #5 · [Eliminar/fusionar] Sacar de «Acciones» lo que ya está en la barra lateral y arreglar la celda gris
- **Dónde:** `page.tsx:55-61` (5 tarjetas), `:54` (grilla).
- **Por qué en este puesto:** Inventario, Productos, Movimientos y Recibir mercadería están duplicados en el menú (`AppShell.tsx:869-1013`); solo Buscar es único. «Antes de agregar, se borra». La celda gris desaparece con 4 o 6 tarjetas.
- **Cómo lo verificas tú:** Inicio queda con Buscar + acciones distintas del menú y ninguna celda vacía; todas las rutas siguen alcanzables por el menú.
- **Esfuerzo / dependencias:** S · después de decidir la #4.

### #6 · [Mejorar] Acciones por rol y ubicación: Vender y Caja primero; Producción en el Taller
- **Dónde:** `page.tsx:55-61`; reglas de menú en `lib/produccion-menu.ts` (reutilizar para no divergir del menú).
- **Por qué en este puesto:** cierra el escenario de la colaboradora que no encuentra dónde cobrar. Sin esto, la #2 muestra el dinero pero no el camino.
- **Cómo lo verificas tú:** como integrante de tienda, el primer botón es «Vender» y va a `/vender`; como Taller, aparece Producción y no «Vender».
- **Esfuerzo / dependencias:** S–M · no antes de la #4 ni de la #5.

### #7 · [Mejorar] Actividad reciente legible: motivo, no solo «SALIDA»
- **Dónde:** `page.tsx:79` (`ETIQUETA_CATEGORIA[m.categoria]` → `etiquetaMovimiento(m)` de `movimientos-reglas.ts:134`).
- **Por qué en este puesto:** hoy una venta y una merma se leen igual (`[visto]` ocho «SALIDA»); la función que las distingue ya existe.
- **Cómo lo verificas tú:** las salidas del 21/09 de la captura pasan a decir «Venta»; un traslado entrante dice «llegada» y no «Salida».
- **Esfuerzo / dependencias:** S · ninguna.

### #8 · [Mejorar] Degradar por bloque, no todo o nada
- **Dónde:** `page.tsx:20-37` (`Promise.all` + `exigir`). Separar lo esencial (tarjetas/«Hoy») de lo secundario (actividad) con `Promise.allSettled` y un aviso «No pude leer la actividad reciente» que jamás se dibuje como cero.
- **Por qué en este puesto:** principio 9 («todo puede fallar»). Hoy una lista secundaria tumba la pantalla de aterrizaje. Precedente: la solución de `pendientes.ts` en el BACKLOG (~línea 4562).
- **Cómo lo verificas tú:** en local, hacer fallar `fn_movimientos` → Inicio sigue mostrando tarjetas y acciones con el aviso.
- **Esfuerzo / dependencias:** S · antes de la #3.

### #9 · [Corregir] La suma de unidades no debe tener un tope silencioso de 1.000 filas
- **Dónde:** `page.tsx:23-37`. Pasar la suma a la base (agregado o función), o paginar; no traer filas para sumar en JS.
- **Por qué en este puesto:** hoy 164 variantes no llegan al tope; con más sububicaciones y catálogo, sí, y la cifra bajaría sin avisar. Bajo riesgo hoy.
- **Cómo lo verificas tú:** consulta `select count(*) from retail.stock where ubicacion_id = '<TRU>'` y compárala con 1.000 (B1 y C4 lo dan); la tarjeta coincide con `sum(cantidad)` de la base.
- **Esfuerzo / dependencias:** S–M · junto con la #1 (mismos datos).

### #10 · [Corregir] Rótulos: sacar «V2» y la sede repetida (bajo valor)
- **Dónde:** `page.tsx:42` («CAYLA V2 · …»), `:49` («Unidades en {ubicación}»), `:43` (`persona.nombre.split(" ")[0]` con nombre vacío daría «Hola, »).
- **Por qué en este puesto:** cosmético; «V2» es jerga interna y rompe el vocabulario de la marca, pero no confunde a nadie.
- **Cómo lo verificas tú:** el sobretítulo no dice «V2» y la sede aparece una sola vez por pantalla.
- **Esfuerzo / dependencias:** S · ninguna.

### #11 · [Mejorar] Sacar las reglas a `lib/inicio-reglas.ts` con prueba (bajo valor / opcional)
- **Dónde:** `page.tsx` → `lib/inicio-reglas.ts` + `lib/inicio-reglas.test.ts`.
- **Por qué en este puesto:** hoy Inicio no tiene una sola prueba; solo importa si se ejecutan #1–#3 (es donde vive la lógica nueva). Sin ellas no hace falta.
- **Cómo lo verificas tú:** `pnpm --filter web test` corre las pruebas nuevas y pasan.
- **Esfuerzo / dependencias:** S · junto con la #2.

### #12 · [Corregir] Actualizar los docs que describen un Inicio que ya no existe (bajo valor, pero es principio 8)
- **Dónde:** `docs/datos/11-KPIS.md:146` (`getPanelInicio` en `lib/panel.ts`, archivo inexistente), BACKLOG (~línea 4554, `lib/pendientes.ts`), y el comentario obsoleto `(app)/layout.tsx:15` («no tiene `error.tsx`»: falso, existe `(app)/error.tsx`).
- **Por qué en este puesto:** docs y pantalla no coinciden y este análisis tuvo que deducir la finalidad de docs viejos; bajo riesgo, pero una sesión futura repetirá el error.
- **Cómo lo verificas tú:** `grep -rn "getPanelInicio\|lib/panel.ts" docs apps` no devuelve referencias vigentes.
- **Esfuerzo / dependencias:** S · después de cerrar las #2–#3 para no reescribir el doc dos veces.

## 8 · Estrategia alternativa
**Inicio como tablero del día, distinto por rol y por sede** (lo que pide la tarea #4).

| Opción | Ganas | Pagas |
|---|---|---|
| **A · Dejar el Inicio único y solo arreglarlo** (#1, #5, #7, #10) | Cambio chico, sin riesgo, sin lógica nueva | Sigue sin decir cómo va el día; la líder y la colaboradora ven lo mismo |
| **B · Un solo Inicio con bloques según `rol` y `ubicacionTipo`** *(recomendada)* | Colaboradora: Vender, Caja, «Por recibir». Líder: Hoy, Por atender, por pagar. Taller: órdenes. Un `page.tsx` y una regla en `lib/` | Lógica de visibilidad que probar; hay que decidir qué ve cada rol (decisión tuya) |
| **C · Inicios separados por rol** | Cada uno totalmente a medida | Triplica el mantenimiento por 3 tiendas + 1 taller; se desalinean |

Decide Felipe. Esta sección no reordena las 12: las #5 y #6 esperan tu respuesta.

## 9 · Referentes de ERP y futuro
*(de memoria, no verificado en el producto ajeno)*
- Shopify POS y Odoo abren en «ventas de hoy» y en lo pendiente; ese es el patrón de las #2 y #3.
- **Futuro, no cuenta en las 12:** tendencia de 14 días y comparativo por sede (`11-KPIS.md`), alertas de reposición desde el Inicio, favoritos personalizables. No le sirven a 3 tiendas y 1 taller hasta que las cifras de «Hoy» sean confiables.

## 10 · Fuera de esta pantalla
**La web de `main` no puede desplegarse hasta pegar `20260920160000_apartar_stock.sql` en producción.** `[producción C4]`: `stock.cantidad_apartada` no existe hoy (error 42703 al consultarla). `inventario-v2.ts`, `ApartarModal.tsx` y `apartados.ts` ya la leen (`[código]`), y el BACKLOG lo anota (línea 59, «ANTES de desplegar la web»). Inicio no se rompe (solo lee `cantidad`), pero Existencias y Apartar sí. Está anotado; lo que no está anotado es una comprobación automática: `datos:comparar` solo marca las funciones, no las columnas.

## 11 · Líneas propuestas para BACKLOG.md
- [ ] `[pantalla:inicio]` #1 Corregir: rótulos y filtros de las tarjetas (Productos activos / Variantes sin centinela) — S
- [ ] `[pantalla:inicio]` #2 Reconstruir: bloque «Hoy» (ventas del día y caja) con `fn_ventas_del_dia` — M
- [ ] `[pantalla:inicio]` #3 Mejorar: bloque «Por atender» (traslados, SUNAT, por pagar) sin esconderse si falla — M
- [ ] `[pantalla:inicio]` #4 Replantear: **decidir** Inicio por rol y ubicación (opción B de docs/pantallas/inicio.md §8) — M–L
- [ ] `[pantalla:inicio]` #5 Eliminar/fusionar: tarjetas duplicadas con el menú y celda gris — S
- [ ] `[pantalla:inicio]` #6 Mejorar: acciones por rol y ubicación (Vender primero; Producción en el Taller) — S–M
- [ ] `[pantalla:inicio]` #7 Mejorar: actividad reciente con `etiquetaMovimiento` — S
- [ ] `[pantalla:inicio]` #8 Mejorar: degradar por bloque (`allSettled`) — S
- [ ] `[pantalla:inicio]` #9 Corregir: suma de unidades sin tope de 1.000 filas — S–M
- [ ] `[pantalla:inicio]` #10 Corregir: sacar «V2» y la sede repetida (bajo valor) — S
- [ ] `[pantalla:inicio]` #11 Mejorar: `lib/inicio-reglas.ts` + prueba (opcional) — S
- [ ] `[pantalla:inicio]` #12 Corregir docs: `11-KPIS.md:146`, BACKLOG ~4554, comentario de `(app)/layout.tsx:15` — S

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Sobretítulo «CAYLA V2 · TIENDA TRU» | Marca + sede | ajustar (jerga «V2», sede repetida) | `[visto]` `page.tsx:42` |
| Cabecera | «Hola, [colaborador]» | Saludo por primer nombre | bien | `[visto]` `page.tsx:43` |
| Cabecera global | Selector de sede | Cambia la ubicación mirada (cookie), líder | bien | `[código AppShell.tsx:1208]` |
| Tarjetas | Productos activos | Conteo de `productos` sin filtro | ajustar (miente el rótulo) | `[código page.tsx:20]` |
| Tarjetas | Variantes (SKU) | Conteo de `variantes` con centinela e inactivas | ajustar | `[código page.tsx:21]` |
| Tarjetas | Unidades en {sede} | Suma de `stock.cantidad` | ajustar (tope 1.000, físico vs disponible) | `[código page.tsx:23-37]` |
| Acciones | Buscar | `/buscar` | bien (única puerta) | `[código]` |
| Acciones | Recibir mercadería | `/recibir` | sobra (duplica menú) | `[visto]` `AppShell` |
| Acciones | Inventario | `/inventario` | sobra | `[visto]` |
| Acciones | Productos | `/productos` | sobra | `[visto]` |
| Acciones | Movimientos | `/inventario/movimientos` | sobra | `[visto]` |
| Acciones | Celda gris | Hueco de la grilla | ajustar (defecto) | `[visto]` `page.tsx:54` |
| Actividad | 8 últimos movimientos | `fn_movimientos`, sin período | ajustar (etiqueta gruesa) | `[código page.tsx:71-87]` |
| Falta | Ventas de hoy / caja | — | falta | `[código]` `fn_ventas_del_dia` existe, sin usar |
| Falta | Por atender | — | falta | `[código]` `getTrasladosPorAtender` solo en el menú |
| Falta | Vender | — | falta | `[visto]` |
| Menú lateral | Badge «2» de Inventario | Traslados por atender de la sede activa | bien (pero se apaga si la consulta falla) | `[código traslados.ts:222-248]` |

## Qué quedó sin datos reales
Del SQL pegado llegaron: A3 (índices), B2 (movimientos por día), el intento de C4 (falló: sin `cantidad_apartada`) y D3 (cinco funciones). **Sin resultado:** A1, A2, B1, C1–C3, C5, C6, D1, D2, E1, E3, E4 (el editor de Supabase muestra solo el último resultado de cada pegado). Lo más útil para cerrar es C1–C3 (cuánto se equivoca cada tarjeta) y D1/D2 (RLS real); ejecutados de a uno, sin la parte de C4 que menciona `cantidad_apartada`.

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-21 | completo (SQL parcial) | 5.1 | 4.2 | — (primer análisis) |
