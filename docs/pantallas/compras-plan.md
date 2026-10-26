# Pantalla — Plan de campaña (`/compras/plan`, con Resultados e Historial)

> Modo: completo (el mapa del código lo leí yo, sin subagente Explore; el SQL lo corrí yo en solo lectura contra producción) · Fecha: 2026-10-26 · Rol/sede: Líder, «Todas las tiendas» · Datos: **real** (producción, 2026-10-26)
> SHA analizado: `042564c76` (origin/main). La rama va 40 commits detrás, pero `git diff --stat HEAD origin/main` sobre `components/plan-compra`, `lib/plan-compra*` y `app/(app)/compras/plan` **no muestra cambios**: el análisis no está vencido.
> Archivos: `app/(app)/compras/plan/{page,layout,resultados,historial}` · `components/plan-compra/*` (28 archivos, 4.872 líneas) · `lib/plan-compra*.ts` · RPC `fn_plan_compra`, `fn_planes_compra`, `fn_plan_compra_propuesta`, `fn_plan_compra_pedido`, `fn_plan_compra_descuento`, `fn_plan_compra_plazo`, `guardar_plan_compra_linea`, `crear_plan_compra`, `crear_campana_con_plan` · tablas `planes_compra`, `planes_compra_lineas`, `planes_compra_reparto`, `etiquetas`
> Otra sesión tocándola: no hoy (la fila `elegant-bose-201880` de SESIONES-ACTIVAS es del 2026-10-10 y sus arreglos ya están publicados). Esta rama es la continuación de `campaign-plan-improvements-18875c` (ADR-0499).
> Spikes tocables de todo lo que propone: `docs/maquetas/plan-campana-vision-2026-10/index.html`. Investigación externa: `docs/investigacion/2026-10-26-plan-de-campana-*.md`.

## 0 · Veredicto
Responde bien UNA pregunta —«¿cuántas prendas de cada categoría compro para esta campaña?»— con una cuenta sólida (vendedor de diarios, stock, descuento, plazo, tope). No responde las otras tres que el empresario se hace antes de comprar: **¿en cuáles campañas invierto?, ¿de qué colores?, ¿cabe en mi caja?**, ni guarda lo que hace falta para aprender de sus propias propuestas.
**Cumple su finalidad:** 6,8/10 · **Relevancia:** 7,2/10 — Soporte (alto)

### Lo que elegiste mirando los spikes (Felipe, 2026-10-26)
| Pieza | Elección | Qué cambia en las tareas |
|---|---|---|
| Calendario (spike ①) | Pestaña «Calendario»; las dos vistas, **lista por defecto** y línea del año | #7: pestaña propia; sin cajón |
| Avisos (spike ②) | **Flotante, sin palabra.** Lo urgente sigue asomando (el plazo no se esconde), salvo que lo apagues | #4: el ícono lleva solo el número; la palabra «Avisos» queda como opción apagada. **Con barra propia** (lo pediste con tu captura): el panel se ancla bajo el botón, nunca pasa del borde de la ventana, su lista corre sola sin mover la página, y Escape o un clic fuera lo cierran |
| Paso 2 (spike ③) | Colores como en A (parejo / lo que propone / a mano) **y al tocar un color, sus tallas**; el **total del paso 1 editable ahí mismo** con un aviso chico («también cambia en el paso 1; la inversión sube S/ X») que se cierra con ✕ o solo | #9: es A + C integrados; «B · prendas» queda solo para mirar |
| Modelos (spike ⑥) | Pediste ver **primero el producto y la marca, y dentro los colores más vendidos y su talla** (spike ⑥): **elegiste solo el ranking de modelos**, con la marca bajo el nombre y, dentro de cada modelo, los colores y las **tallas editables**. Y que **sumar a una talla suba las prendas de su color** (corregido en los spikes ③ y ⑥: talla → color → modelo → total, con «Subir el total» que congela lo ya elegido) | #9 |
| Enviar a Compras (spike ⑦) | Con el presupuesto conforme, **mandar lo elegido (modelos, colores y tallas) a Compras como «Pendiente de campaña, falta confirmar»**, con la fecha en que piensas pedir o «pedir ya», y **un botón para rectificar** | pedido posterior, §7b |
| Presupuesto (spike ④) | «Todo bien»: plan con tope lado a lado y tú aceptas, con versiones | #5 y #6 sin cambios |
| Finanzas (spike ⑤) | «Adecuado». Quiere ver **dónde** se ve cuándo se pide y cuándo se paga. **Tres estados** (no un sí/no) que mandan en el Resumen **y** en Finanzas; nombre **«Inversión en mercadería»** | #10: sub-pestaña **Presupuesto ▸ Cuándo se pide y se paga** (se edita ahí), la franja del plazo (qué día pedir), Finanzas ▸ Flujo de caja y Escenarios (cuándo sale la plata) y Compras ▸ Por pagar (el pago real) |
| Datos suficientes | **Aprobada tal cual:** Sin base (<10 unidades) · Orientativo (10–29) · Útil (≥30 y ≥2 campañas parecidas) · Sólido (≥100) | #9 |
| IGV | «Hay costos que lo incluyen y otros que no»: **una marca por categoría** («ya incluye el IGV») con **Marcar todas / Quitar todas**; a las que no lo incluyen el sistema les suma 18 % y dice cuánto se paga al proveedor, cuánto es IGV y cuánto sale de caja | #10: columna en la línea del plan (guardada por categoría, como el descuento). Abierto: si en el futuro el dato vive en el producto o el proveedor |
| Orden de construcción | **#1–#3 primero, luego #4–#6**, cada una con tu OK | las de dinero o varios módulos (#5, #9, #10), una por una |
| CyberWow | «Que lo elija el propio empresario dentro del sistema» | #7: una campaña sin fechas abre su hoja para ponérselas y activarla; el sistema no decide por él |
Sin responder: nada bloqueante. La tabla del paso 2 se ensanchó (la hoja pasó de 980 a 1.240 px) porque tu captura la mostraba cortada.

## 1 · Finalidad declarada
«Esta pantalla existe para **mapear qué campañas conviene hacer, proyectar cuánto comprar y asignar recursos**» (ADR-0499, «El problema»; ADR-0349: la decisión del año es diciembre, «cuánto comprar» con tres escenarios).
¿Docs y pantalla coinciden? **A medias.** «Proyectar» está hecho; «asignar recursos» es solo un tope y un simulador escondidos en un cajón; «mapear qué campañas» es el selector, que lista las 14 etiquetas de Insignias sin que nadie decida con cuáles se queda. Manda el código (`PlanCampana.tsx`) y producción.

## 2 · Objeción
1. **«Probabilidad por prenda y color» no se puede; por modelo sí, y por color y talla dentro de un modelo, con reservas.** Corrección del 2026-10-26, después de que preguntaste «¿cómo sé qué modelo compro?» y lo medí en producción `[producción]`: en **Polos**, 35 modelos vendieron en 26 días y **19 vendieron 5 o más** (el mayor, 26): por **modelo** hay señal para decir «repite este». En cambio, por **variante** (modelo × color × talla) de todo el catálogo, de las 782 vendidas **580 (74 %) vendieron una sola unidad**: ahí un número sería precisión falsa. Mi frase anterior («los modelos no se repiten», `lib/demanda-reglas.ts:4`) venía de un comentario del 2026-10-05, con seis días de datos, y hoy no se sostiene para modelos de mucha venta. Lo que sigue sin respaldo es decir cuánto comprar de cada color o talla de un modelo con tan pocas ventas: por eso cada fila lleva su etiqueta de confianza. Ya lo decidiste el 2026-10-05: las compras por campaña con cantidad fina esperan una temporada completa de datos limpios (`docs/investigacion/2026-10-05-algoritmo-de-inventario.md` §5 y §6.2). Y un dato de higiene: 10 de los 47 Polos activos no tienen marca ni proveedor, y 7 de los 35 que vendieron (38 unidades) tampoco: el nivel «marca» no es completo.
2. **«Eliminar permanentemente» una campaña choca con una regla del repo** («nunca borres datos con historial»). Hoy ya es así: se borra si está vacía y se archiva si tiene algo (`quitarBorra`, `plan-compra-reglas.ts:1095`). Propongo mantenerlo: quitar = archivar, borrar solo lo que nunca se usó.
3. **«Gasto» no es la palabra para una compra de mercadería.** Es inventario, y el costo se reconoce al vender (NIC 2; cuentas 20 → 69). En Finanzas debe verse como **inversión en mercadería** (nombre que elegiste; en lenguaje contable, un compromiso de compra / salida de caja proyectada), no en Gastos ni en el Estado de resultados (§4.6, spike ⑤).

## 3 · Lo que está bien y no se toca
- **La cuenta:** cuantil crítico + triangular + stock libre + órdenes por llegar (`plan-compra-reglas.ts:215-294`), probada con 342 pruebas `[código]`. El multiplicador del «bueno» y el «normal» comparten la misma base reciente (últimos 90 días / 60 días antes), así que el producto es coherente aunque la base sea corta (`plan-compra-historial.ts:20,157`).
- **Estados imposibles cerrados en la base:** flojo ≤ normal ≤ bueno, costo < precio, curva suma 100, `descuento_pct` entre 0 y 100, plazo con autor (CHECK) `[código 20261005220000, 20261024215000/220000]`. Todo se escribe por RPC firmada con `fn_actor_persona_id(true)`.
- **Degradación honesta:** si falla propuesta, descuento, plazo o pedido, el plan se ve igual y lo dice (`lib/plan-compra.ts:73-125`).
- **La pantalla cambia la pregunta según el momento** (antes / durante sin plan / con plan) y la franja del plazo (ADR-0349 act. 2026-10-13, ADR-0499).
- **Editar, quitar y restaurar campañas ya existen** (`EditarCampanaModal`, `CampanasArchivadasModal`, `quitar_plan_compra`), con borrar-si-está-vacía.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 8 | Coherente con tokens y piezas únicas; el ruido son las franjas apiladas y un botón-ícono sin texto con un número | `[visto]` capturas 1–2; Formidable 2026-10-24: oficio 9 |
| Lógica de negocio | 7 | Cuenta sólida; pero dice «en 90 días» con 26 y no guarda lo que propuso el sistema | `[código FilaCategoria.tsx:79; FormularioCategoria.tsx:238]` `[producción]` |
| Arquitectura | 8 | Muy buena; faltan dos tablas: historial de líneas y decisión de campaña | `[código]` `planes_compra_lineas` solo guarda `version` |
| Funciones | 6 | Faltan: elegir campañas, color, presupuesto con alternativas, versiones, caja | `[código]` |
| Utilidad | 6 | Una persona sin contexto entiende «cuánto compro»; no entiende por qué «Hay hoy» no es confiable ni cuánto creerle a la propuesta | `[visto]` aviso «3 tiendas sin stock al día»; ciega 2026-10-24 |
| Conexión con el ERP | 6 | Lee Insignias, Compras (órdenes) y el motor de demanda; no habla con Finanzas ni con Producción | `[código]` |

### 4.1 Calendario de campañas (pedido 1) — «¿con cuáles me quedo?»
- **Cómo funciona hoy `[código]`:** el selector ES el calendario de Catálogo ▸ Insignias: cada etiqueta de estilo campaña con fechas, este año y el que viene, sin plan (`ranurasSinPlan`, `plan-compra-reglas.ts:998-1009`). No hay concepto de «esta sí / esta no», ni de «cada año / solo este», ni de pausa. «Quitar» una campaña archiva su plan de ese año; al año siguiente vuelve a ofrecerse (`tienePlanEn` incluye archivados, `:991`).
- **El ruido es real `[producción]`:** hay 14 etiquetas de campaña; 4 con plan (San Valentín, Halloween, Aniversario CAYLA, Navidad); 4 son de marketing (Día del Perro, del Gato, de la Tierra, Galentine's), una sin fechas (CyberWow) y falta Día del Padre.
- **Editar nombre y días de la campaña SÍ existe** (`EditarCampanaModal.tsx`); crear una que no está también, **pero solo un líder y crea una insignia en la tienda** (`crear_campana_con_plan` escribe en Etiquetas; `NuevaCampanaModal.tsx:99,142-152`): comprar para una fecha no debería publicar una insignia.
- **Tu intuición está respaldada por tus ventas `[producción, Sinatra TRU 2018–2025]`:** cuánto sube un día de la campaña frente a un día normal del año: **Navidad ×2,0** (1,9–2,7; 7,8 % de las ventas del año en 15 días) · Fiestas Patrias ×1,2 · Día de la Madre ×1,1 · Día del Padre ×1,0 · Día de la Mujer ×1,0 · San Valentín ×0,9 · Black Friday ×0,9 · Halloween ×0,85. En Arequipa (solo 2025) Navidad ×1,3. Es el total de soles de la tienda, no una categoría; una campaña con descuento vende más prendas por menos soles.
- **Spike ①:** pestaña «Calendario» o cajón desde el selector; lista o línea del año; interruptor «en mi plan», cada año / solo este año, pausa (1 mes, 3 meses, hasta fin de año, 1 año, hasta que la reactive), quitar (archiva o borra), campaña nueva sin crear insignia, y tu historia al lado.

### 4.2 Avisos (pedido 2)
- **Hoy hay cinco lugares donde avisa `[código PlanCampana.tsx]`:** franja del plazo (`:378-401`), campaña archivada (`:403`), «empezó sin plan» (`:420`), «no encontramos esa campaña» (`:448`), el aviso de stock sobre la tabla y su detalle en el cajón (`:458-539`). **El número del ícono (`:284`, `avisosDelResumen`) cuenta solo las tiendas sin stock al día**: el plazo para pedir, que es lo que cuesta dinero si se ignora, no suma.
- **La investigación avisa de un riesgo `[VERIFICADO, NN/g; PatternFly]`:** esconder un aviso crítico tras un contador baja su descubrimiento, y el plazo «justo» o «tarde» es el único aviso cuyo costo de ignorarlo es dinero perdido. Por eso el spike ② lo deja compacto como pides, pero **lo urgente asoma una línea aunque esté cerrado** y el ícono se pone rojo; «Ya lo vi» deja de contar un aviso hasta que el dato cambie; lo que no es un pendiente («campaña archivada») se queda en su lugar. También: un ícono con número y sin palabra es lo que NN/g desaconseja; el spike deja elegir con o sin «Avisos».
- **Elegiste flotante** (ADR-0185: la página no salta bajo el mouse), sin palabra junto al ícono.

### 4.3 Paso 2: de la categoría a colores y prendas (pedido 3)
- **Hoy `[código]`:** el plan llega a la categoría y a la curva de tallas (`comprarPorTalla`, `K_CURVA = 10`); no baja a color. Lo prenda por prenda vive en Análisis ▸ Qué pedir, que **no decide cantidades** (ADR-0231).
- **Lo que pides sí tiene respaldo en la industria `[VERIFICADO]`:** plan de dos pasos conciliados (la suma de abajo = la meta de arriba; Oracle MFP/Assortment, Blue Yonder), necesidad neta restando lo que ya hay y lo que ya viene, y que la persona apruebe o cambie lo que el sistema propone.
- **Lo que hay que hacer distinto (y como lo elegiste):** repartir por **familia de color** y no por variante (§2); con el stock de ese color; con una etiqueta de confianza por fila («Con base / Poco dato / Sin dato: reparto parejo»); al tocar un color se eligen sus **tallas** (parejo / lo que propone con la curva del paso 1 / a mano), y arriba se dice «elegimos N prendas para este color». El **total** se puede cambiar en el mismo paso 2: un aviso chico dice que también cambia en el paso 1 y cuánto sube la inversión, y se va con la ✕ o a los 9 s. Guardar con un total distinto crea una **versión nueva** (se ve en Presupuesto). **Después, al preguntar «¿cómo sé qué modelo compro?», el paso 2 sube un nivel (spike ⑥): marca → modelo → colores y tallas, con un cupo de «modelos nuevos por elegir» (ver #9).**
- **Datos suficientes (regla propuesta, necesita tu OK):** por categoría × familia de color: **Sin base** (<10 unidades), **Orientativo** (10–29), **Útil** (≥30 y ≥2 campañas parecidas), **Sólido** (≥100). Con 30 ventas el error típico ronda ±30 % y con 100, ±16 % (cálculo de Poisson del agente, `docs/investigacion/…planificacion-de-compra.md` §3.3). Fechas: hoy 26 días y 0 campañas; **~29 dic 2026** 90 días; **ene 2027** Navidad medida (primera campaña completa); **oct–dic 2027** Halloween y Navidad contra el año anterior: ahí recién hay probabilidad por campaña.
- **Lo que no está resuelto `[producción]`:** 3 tiendas con el stock sin cuadrar (el aviso del `3`) → «Hay hoy» infla la compra; y el repo no sabe si todos los colores tienen `familia_color` `[no verificable]`.

### 4.4 Costos, presupuesto y versiones (pedido 4)
- **Ya existe `[código]`:** inversión al costo por categoría, un tope único por campaña (`TopeModal`), barra del tope, «Te quedan S/ X» y un simulador global que mueve el «bueno» y «lo que sobra» (`SimuladorPlan.tsx`). Está en un cajón cerrado por defecto.
- **Falta:** (a) el costo por categoría **con** lo que se espera ganar por cada sol; (b) un plan que se corrija solo para caber en el tope, **comparado lado a lado**; (c) historia del plan: `planes_compra_lineas` guarda `version` y `updated_at`, **pero no hay tabla de historial** `[código]`: no se puede volver atrás ni saber qué cambió.
- **Spike ④:** el recorte usa un solo «precio de la plata» (multiplicador de Lagrange / Hadley–Whitin) que baja la cobertura de todas las categorías, más donde cada sol rinde menos: con los datos de ejemplo del spike (tope de S/ 28.000 sobre un plan de S/ 33.482) recorta 17 % de lo que gastas y deja de ganar 4 %. Versiones: «Volver a esta» **crea una versión nueva**, no borra (Google Sheets avisa que restaurar borra historial fino). Con holgura sugiere subir donde más rinde, y dice cuándo ya cubres el «bueno» en todo.
- **Cuidado de la investigación `[VERIFICADO]`:** en 60.000 pronósticos, los ajustes pequeños de la gente suelen empeorarlos y los al alza son los peores. Dejar editar sube la adopción, pero **hay que guardar lo que propuso el sistema** para poder medirlo (tarea #1).

### 4.5 La fecha límite, el descuento y la «verdad» del dato
- **«Vendiste 366 en 90 días»** (`FilaCategoria.tsx:79`, `FormularioCategoria.tsx:238`): el ERP vende desde el **30-sep** (26 días); el número es correcto, el rótulo no. Y `propuestaDeNormal` (`plan-compra-reglas.ts:744-752`, solo si la base no manda la propuesta) divide por 90: subestimaría el normal 3,5 veces. En producción la propuesta sí llega, pero es una trampa latente `[código]`.
- **Aviso de deriva del descuento** (ADR-0499, paso 4): sigue pendiente; cabe como un aviso más del centro.
- **Los 3 cambios de Formidable del 2026-10-24** siguen esperando tu OK (docs/formidable/compras-plan.md).

### 4.6 Finanzas (pedido 5)
- **Hoy no hay conexión `[código]`:** Finanzas ▸ Flujo de caja ya proyecta 12 semanas (`fn_flujo_caja_proyeccion`: vencimientos, fijos, planilla, impuestos y un tipo `nuevo` para Escenarios, `flujo-caja-reglas.ts:215-260`), pero **no sabe lo que el Plan va a comprar**.
- **Cómo se llama y dónde va `[VERIFICADO, NIC 2; NetSuite; Oracle]`:** **«Inversión en mercadería»** (tu elección del 2026-10-26); **no** en Gastos y **no** en el Estado de resultados (el costo entra al vender). Con **tres estados que mandan en el Resumen y en todo Finanzas** (los elegiste, no un sí/no): **Se hará** = sale en el Resumen, en el flujo de caja y en Escenarios, para que el empresario sepa qué movimientos vienen, guarde o se anticipe; **Solo en Escenarios** = es una idea, solo en el «¿y si compro esto?»; **No mostrarla** = Finanzas no la ve. Al registrar la factura u orden, la real reemplaza a la planeada: nunca se cuenta dos veces.
- **IGV:** la caja sale con 18 % más. Hay que saber si el costo del producto en CAYLA ya lo incluye `[no verificable]`; el spike lo deja prender y apagar.
- **Dónde se ve (lo que preguntaste):** se edita en **Plan ▸ Presupuesto ▸ Cuándo se pide y se paga**; la franja de arriba del Plan dice hasta qué día pedir; Finanzas ▸ Flujo de caja y Escenarios muestran cuándo sale la plata; y en Compras ▸ Por pagar aparece el pago real cuando registras la factura (reemplaza al planeado).
- **Ya existe el plazo de pago por proveedor `[producción]`:** `proveedores.plazo_credito_dias` y `forma_pago_preferida`. El «cómo se paga» de cada tanda puede salir de ahí por defecto, en vez de escribirse a mano.
- **Pagos:** tandas de compra (1–3), semana del pedido, cómo se paga (contado, 30, 60, anticipo + saldo). Un proveedor MYPE cobra a 30 días salvo pacto escrito (Ley 31362, agente: no verificó cambios después de 2022). El spike avisa cuando una tanda se pide después de la fecha límite y cuando el saldo cae bajo el mínimo de caja.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 9 | Decide la compra más grande de cada campaña y deja el dato (propuesta vs real) del que dependerá el motor de demanda |
| Dinero y stock que toca | ×1 | 8 | Compra a costo de decenas de miles de soles por campaña; no mueve stock ni caja por sí sola |
| Frecuencia y personas que la usan | ×1 | 4 | ~6 campañas al año, 1–3 personas |
| Qué se detiene si falla | ×1 | 6 | Nada físico: se compra a ojo o en Excel, que es justo lo que ADR-0349 quiso evitar |

Relevancia = (2·9 + 8 + 4 + 6) / 5 = **7,2** → Soporte (alto).

## 6 · Conexión con el ERP
- **Aguas arriba:** `etiquetas` (calendario de campañas, descuento), `ventas`/`venta_items` (ventas 90 días y por campaña), `ventas_historicas` (Sinatra, soles por tienda y día), `stock`, órdenes de compra (lo ya pedido), motor de demanda (confianza del stock).
- **Aguas abajo:** Compras ▸ Órdenes (ya pedido), Resultados e Historial. **No** alimenta Finanzas ni Producción.
- **Pájaro dueño y vecinos:** `planes_compra*` son del módulo `plan_compra` (ADR-0161/0387); lo vecino que no debe romper es la meta de caja por campaña (`campana_efecto_caja`, cuelga de `etiquetas`): **por eso el calendario del Plan no puede vivir como columnas de `etiquetas`**.
- **Externos:** ninguno. «Se degrada así: si falla una lectura de ayuda, el plan se ve igual y lo dice; no pierde datos» (`lib/plan-compra.ts`).

## 7 · Las 12 tareas, por importancia
Cada tarea lleva su clase —**Urgente** (pierde algo cada día o vence pronto), **Importante** (cambia decisiones de dinero), **Estético** (se ve o se entiende mejor)— y esperan tu OK; ninguna toca producción sin tu confirmación.

### #1 · [Corregir · **Urgente**] Guardar lo que propone el sistema junto a lo que se guarda
- **Dónde:** nueva tabla `retail.planes_compra_lineas_historial` escrita **dentro** de `guardar_plan_compra_linea` (misma transacción) · `lib/plan-compra-propuesta.ts` (qué propuso).
- **Por qué en este puesto:** Navidad 2026 es la primera campaña completa en el ERP. La propuesta depende del día (cambian las ventas de 90 días): si hoy no se guarda, **no se puede reconstruir** después, y es el único dato que permite medir si el sistema acierta mejor que la persona.
- **Cómo lo verificas tú:** arma Tops dos veces con distinto normal; la base muestra dos filas con lo propuesto, lo guardado, quién y cuándo; una prueba SQL cubre el doble clic.
- **Esfuerzo / dependencias:** M · sin dependencias; base de #6.
- **Estado (2026-10-26):** construida y probada en local con `/construir` (A2–A4, ADR-0520, migración `20261026171000`, 22 casos + concurrencia real con dos sesiones); **falta pegar la migración en producción (OK de Felipe)** y que algo lea el historial (#6).
- **DECIDÍ:** historial append-only, una fila por guardado, con la propuesta en ese instante. **DESCARTÉ:** reconstruir la propuesta con las ventas de después: da otro número. Y descarté guardar solo `version`: ya existe y no dice qué había antes. **SE ROMPE SI:** el historial se escribe desde la web y no desde la RPC (dos pestañas guardan a la vez y falta una fila).

### #2 · [Corregir · **Urgente**] Cuadrar el stock de las 3 tiendas antes de fijar compras
- **Dónde:** Inventario ▸ Conteo (operativo; el aviso ya existe: `AvisoStockEnLinea`).
- **Por qué:** «Hay hoy» incompleto infla «Comprar»; el paso 2 y el presupuesto heredarían el error. Vence la fecha límite para pedir Navidad: **17 de noviembre**.
- **Cómo lo verificas tú:** el aviso del `3` desaparece y el centro de avisos queda sin «stock sin cuadrar».
- **Esfuerzo / dependencias:** S (de las tiendas) · antes de #9.
- **Estado (2026-10-26):** el aviso ya dice hasta cuándo contarlo (A1: «Cuéntalo antes del 27/11: es el último día para pedir»). Cuadrar el stock sigue siendo trabajo de las tiendas.

### #3 · [Corregir · **Urgente**] Decir «en 26 días» y cuánto creerle a los números
- **Dónde:** `FilaCategoria.tsx:79`, `FormularioCategoria.tsx:238,263,318,471`, `plan-compra-reglas.ts:744-752` (arreglar el fallback).
- **Por qué:** hoy dice 90 con 26 días de datos. Sin esto, la gente cree que la propuesta tiene tres meses detrás. Con el mensaje chico y el rango (spike ③).
- **Cómo lo verificas tú:** la fila de Polos dice «Vendiste 366 en los 26 días que lleva el ERP»; una prueba cubre `propuestaDeNormal` con menos de 90 días.
- **Esfuerzo / dependencias:** S · ninguna.
- **Estado (2026-10-26):** hecha (A5–A6): «Vendiste 3 en los 30 días que lleva el ERP» y una línea en la hoja con cuánto creerle a los números. **Corrección a lo que escribí arriba:** `propuestaDeNormal` solo corre con una base sin la propuesta de C4 (producción la tiene), así que la cuenta que mueve plata ya dividía por los días reales de cada tienda (`dias_90`); lo que decía «90 días» era el texto. Se corrigieron las dos cosas.

### #4 · [Mejorar · Importante] Centro de avisos compacto
- **Dónde:** `PlanCampana.tsx:284,313-338,378-446`, `AvisoStock.tsx`, nuevo `CentroDeAvisos.tsx`; lógica pura `lib/plan-compra-avisos.ts` con su prueba (qué es urgente, qué cuenta).
- **Por qué:** hoy el número no cuenta el plazo y hay cinco franjas; el aviso de deriva del descuento tiene que vivir en algún sitio (ADR-0499, paso 4).
- **Cómo lo verificas tú:** con la campaña en «plazo justo» el ícono es rojo y asoma una línea aunque esté cerrado; con todo en orden, el número es 0.
- **Esfuerzo / dependencias:** M · pieza nueva de `/unificar` (la eliges mirando: spike ②); `/focus` no aplica (no guarda), `/guia` sí.
- **Estado (2026-10-26):** construida y probada en local (B1–B4, ADR-0522, sin migración). Se ve **tal cual la maqueta** (Felipe lo pidió así): campana con su número dentro, línea roja que asoma, panel flotante con su barra, avisos con su etiqueta y botones a la derecha. Entra el **aviso de deriva del descuento** (ADR-0499, paso 4); salen la franja del plazo y la línea del stock sobre la tabla; el cajón pasa a «Resumen». A pedido de Felipe, «Descargar la lista» pasó a ser solo el ícono con su nombre al pasar el mouse. **Costo conocido:** el stock sin cuadrar ya no tiene su línea sobre la tabla; solo lo urgente asoma.

### #5 · [Mejorar · Importante] Pestaña «Presupuesto» y plan con tope
- **Dónde:** nueva ruta `compras/plan/presupuesto`, `lib/plan-compra-tope.ts` (el recorte, con su prueba contra `calcular`), mueve a ella las cifras, el simulador y los supuestos del cajón.
- **Por qué:** es la respuesta a «¿cabe en mi tope?», hoy escondida; el recorte parejo es peor que uno por rendimiento.
- **Cómo lo verificas tú:** con tope de S/ 28.000 y plan de S/ 33.482, el plan con tope cuesta ≤ S/ 28.000 y la suma por categoría cuadra; con tope mayor, no pasa del plan que cubre el «bueno».
- **Esfuerzo / dependencias:** M · **dinero: necesita tu OK al método** · sin migración.
- **DECIDÍ:** un solo precio de la plata (λ) para todas las categorías. **DESCARTÉ:** recortar X % parejo: quita igual donde cada sol rinde S/ 0,68 y donde rinde S/ 0,14 (cifras del ejemplo del spike). **SE ROMPE SI:** una categoría con el precio de campaña por debajo del costo (su margen es 0: λ no la baja más) o el costo de la ficha está viejo (el rendimiento sale falso).
- **Estado (2026-10-26):** construida y probada en local (C1, ADR-0523, **sin migración**): la pestaña Presupuesto con cifras, «Dónde se va la plata», el plan con tope (deslizador, plan que cabe, lo que dejas de ganar por sol ahorrado), la tabla de costos con «Gana por cada S/ 1» y «Datos», y los supuestos (lo que sobra, descuento, lo ya pedido, días, reparto) y el simulador **mudados del cajón «Resumen»**. La cuenta (`lib/plan-compra-tope.ts`) coincide con la de la maqueta en prendas, inversión y ganancia, y nunca se pasa del tope por redondear (la maqueta a veces sí). **Falta** guardar el plan con tope y sus versiones (#6, con migración): hasta entonces «Usar el plan con tope» no se ofrece.

### #6 · [Mejorar · Importante] Versiones del plan y «volver a esta versión»
- **Dónde:** UI sobre la tabla de #1 (`components/plan-compra/Versiones.tsx`) y RPC `restaurar_version_plan_compra` que **crea** una versión nueva.
- **Por qué:** guardar sin querer hoy no se deshace (solo `version` +1).
- **Cómo lo verificas tú:** vuelves a la versión 2: aparece la versión 6 con lo mismo que la 2 y las demás siguen.
- **Esfuerzo / dependencias:** M · después de #1.
- **Estado (2026-10-26):** construida y probada en local (C2, ADR-0523, **migración `20261026184000` solo en local**; falta el OK de Felipe para producción). Además de lo que decía aquí: el λ del plan con tope se guarda en el plan
  (`planes_compra.precio_de_la_plata`) y todas las cuentas del Plan lo aplican; la versión es una foto con su huella (así «La de hoy» se sabe, y si el plan tiene cambios sin versión la lista lo dice); y antes de usar el plan con tope o de volver, lo que ninguna versión
  recordaba se guarda solo como versión automática. «Volver» crea una versión NUEVA, no borra las de después ni las categorías armadas después. Probada con 45 casos, incluidas cuatro personas a la vez.

### #7 · [Reconstruir · Importante] Calendario del plan: con cuáles campañas me quedo
- **Dónde:** nueva tabla `retail.plan_calendario`, RPC de lectura/escritura, `SelectorCampana.tsx`, `NuevaCampanaModal.tsx` (que deja de crear una insignia salvo que lo marques).
- **Por qué:** tus ventas dicen que solo Navidad duplica; el selector las trata todas igual y reaparece lo que ya descartaste.
- **Cómo lo verificas tú:** pausa San Valentín hasta feb 2027 → no se ofrece; en esa fecha vuelve sola; quítala con plan → «Quitadas», restaurable.
- **Esfuerzo / dependencias:** L · migración (con tu OK) · pieza nueva de `/unificar`.
- **DECIDÍ:** tabla propia con estado (activa / pausada / archivada), «cada año / un año» y `pausa_hasta`; sin fechas propias para las que vienen de Insignias. **DESCARTÉ:** columnas en `etiquetas`: Tienda web, Insignias y la meta de caja las leen; pausar una compra apagaría un banner o la meta del día. **SE ROMPE SI:** el programa guarda una copia de fechas y la etiqueta cambia las suyas (dos fuentes). Por eso solo las campañas que no existen en Insignias tienen fechas propias.

- **Estado (2026-10-26):** construida y probada en local (C3, ADR-0525, **migración `20261026190000` solo en local**; falta el OK de Felipe para producción). Se hizo como la tabla `plan_compra_calendario` (no `plan_calendario`; el nombre
  lleva el módulo) con `uso` activa · pausada · no (la «archivada» es `quitada_en`: nada se borra), cada año / solo un año, `pausa_hasta`, fechas propias en «mes-día» y campañas **propias** sin insignia (`planes_compra.calendario_id`).
  Pestaña «Calendario» con lista y «La línea del año»; el selector, las ranuras «por armar», los avisos y Resultados leen la decisión. Cambia algo al pegarla: las campañas de Insignias que nunca tuvieron plan dejan de ofrecerse solas.
  Probada con 32 casos de base (incluye cuatro interruptores a la vez) y 60 pruebas de la lógica.

### #8 · [Mejorar · Importante] Medir cada campaña con tu historia y dar un veredicto al cerrar
- **Estado (2026-10-26):** construida y probada en local, **sin migración** (ADR-0525 y su «Actualización (b)»). En el Calendario: «Qué dice tu historia» por campaña con la misma vara del Historial, en la tienda con más historia y con
  la mediana de los años que se pudieron medir (veredictos «Pico claro», «Sube un poco», «No se nota», «No sube», «Sin historia propia»; «poca historia» con menos de tres años). En Resultados, al terminar la campaña, la tarjeta
  **«¿Subió la venta?»** compara esta vez con la mediana de los otros años («más / lo de siempre / menos que de costumbre») y lleva a la hoja de la campaña en el Calendario. Lo que no hace, y la tarjeta lo dice: no mide ganancia ni lo que sobró.
- **Dónde:** columna «qué dice tu historia» en el calendario (reusa `fn_historial_ventas` y `medir`) y un veredicto en Resultados («valió la pena / no se nota»).
- **Por qué:** es lo que te permite decidir #7 con datos.
- **Cómo lo verificas tú:** Navidad dice ×2,0; Halloween ×0,85 «no sube»; AQP dice «1 año: poca historia».
- **Esfuerzo / dependencias:** M · mide por tienda y total de soles, no por categoría: lo dice la pantalla.

### #9 · [Reconstruir · Importante] Paso 2: qué modelos (marca → modelo → colores y tallas), con stock
- **Dónde:** `fn_plan_compra_colores` (lectura: ventas por categoría × familia de color × tienda y stock por color), `lib/plan-compra-colores.ts` (peso n/(n+10) por celda, ya el de la curva de tallas), `PasoColores.tsx`; el total sale del paso 1.
- **Por qué:** cierra «de qué colores», lo que más se pierde si la plata se va en un color que no sale.
- **Cómo lo verificas tú:** Polos reparte 414 entre 8 familias, la suma cuadra; un color con 5 ventas dice «Sin dato» y no manda; con stock de sobra no propone comprar.
- **Esfuerzo / dependencias:** L · después de #1, #2 y #3; datos de color completos `[no verificable]`.
- **Lo que pediste (spike ⑥, 2026-10-26):** ver primero marca y modelo, y dentro de cada modelo sus colores más vendidos y sus tallas. Para el total que ya decidió el paso 1: un **%** a repetir modelos que ya vendieron (el sistema propone un valor desde lo que falta de cada uno; tú lo cambias) y el resto queda como **«modelos nuevos por elegir»**, con una guía de colores y tallas de la categoría, porque el sistema solo puede nombrar modelos que ya existen. El total siempre cuadra con el paso 1. Las tallas suman al color y el color al total (con el aviso chico de «Subir el total»).
- **DECIDÍ:** repartir el total del paso 1 en modelos que ya vendieron (candidatos a repetir, con su marca) y un cupo de modelos nuevos, y dentro de cada modelo por color y talla con peso por celda, restando lo que ya hay; nunca cambia el total. **DESCARTÉ:** una cantidad por **variante** (modelo × color × talla) dicha como cifra firme (74 % vendieron 1 unidad) y repartir todo en modelos que ya existen (los hay con 1 sola venta y el sistema no conoce los nuevos). **SE ROMPE SI:** un color o talla con menos de 10 ventas recibe unidades «parejas» y se compra algo que no sale; o el modelo no tiene marca (7 de 35 Polos vendidos), y el pedido por proveedor queda incompleto.

- **Estado (2026-10-26):** construida y probada en local (C5, ADR-0526, **migración `20261026204000` solo en local**; falta el OK de Felipe para producción). Es la hoja de la categoría con sus dos pasos (spike ③) y el ranking de
  modelos con sus colores y tallas (spike ⑥), no el reparto por familia de color: `colores.familia_color` junta negro, blanco y gris en «neutro». Se guarda por versión (`planes_compra_paso_2`, solo se agrega), la lista marca
  «Paso 2 hecho / por hacer / por revisar» y el Resumen cuenta. **No hace el «Subir el total»** de las maquetas (objeción abierta en el ADR). Probada con 21 casos de base (incluidas cuatro personas a la vez) y 25 de la lógica.

### #10 · [Conectar · Importante] Inversión en mercadería en Finanzas: tandas, pagos, IGV y estado
- **Dónde:** `fn_flujo_caja_proyeccion` (tipo `compra_planeada`), `FlujoCajaPanel`/`EscenariosPanel`, tabla de tandas del plan.
- **Por qué:** es lo que dice si el plan cabe en tu **caja**, no solo en tu tope.
- **IGV (lo que respondiste):** marca por categoría + «Marcar todas / Quitar todas»; al plan se le suma 18 % solo donde el costo no lo incluye; se muestra «al proveedor / IGV / sale de caja». El IGV de una compra baja después lo que se paga a SUNAT (crédito fiscal): confirmarlo con el contador.
- **Contrato con la sesión «Finanzas ▸ Resumen» (rama `claude/finance-summary-improvements-b60347`):** una sola columna de visibilidad con tres valores (`todo` / `escenarios` / `nada`; el Resumen lee solo `todo`), la lista de pagos (fecha, %) con autor y hora y la base exigiendo 100 %, y por campaña valor sin IGV, IGV y lo que sale de caja ya calculados por el plan (no los recalcula Finanzas). Esa sesión había entendido un sí/no; **Felipe le confirmó después los tres estados** y aceptó el nombre de columna `visibilidad_finanzas` (**contrato aprobado por Felipe el 2026-10-26; construir #10 sigue esperando su OK**) (texto: `todo` / `escenarios` / `nada`, por defecto `todo`). Su lector (`seVeEnElResumen`, PR #1342) solo ve `todo`. **Lo que debe devolver la función de lectura del plan, por campaña:** valor sin IGV, IGV y lo que sale de caja; **separados en «falta pedir» y «pedido»** (lo ya pedido sale por Por pagar; el flujo de caja y el Resumen solo suman lo que falta pedir, para no contar dos veces); la lista de pagos (fecha, %); y `visibilidad_finanzas`. Hoy `fn_flujo_caja_proyeccion` no suma la compra del plan: si `todo` entra al flujo de Reportes, es un cambio de esa función (otra sesión la usa). Cuando exista la función de lectura hay que avisarle a esa sesión. **Dos datos opcionales que pidió esa sesión (2026-10-26, noche; no bloquean nada; sin decidir con Felipe):** `historia` por campaña (campaña anterior, cuántas previas y, por categoría, compradas, vendidas, día en que se agotó y lo que el sistema sugería como mínimo / típico / máximo, que es el flojo / normal / bueno del plan) y `costos` (por categoría, ventas esperadas, costo de lo vendido, publicidad y comisión; todo **sin IGV**). Su Resumen dibuja «Lo que dice la historia» y «Cuánto cuesta» solo si vienen. Ojo: «publicidad» y «comisión» no existen en el plan hoy, y la historia se solapa con Resultados. **Felipe (2026-10-26): «podríamos tomarlo en cuenta»**: se considera al diseñar #10, sin comprometer alcance; falta decidir de dónde saldrían publicidad y comisión y cuál es la fuente de la historia (Resultados o esta lectura).
- **Cómo lo verificas tú:** con el estado en «No mostrarla» Finanzas queda igual que hoy; al registrar la factura, la planeada desaparece; con «Quitar todas» la salida de caja sube 18 %.
- **Esfuerzo / dependencias:** L · **varios módulos: pide tu OK** (decisión de Felipe, CLAUDE.md) · después de #5.

- **Estado (2026-10-26):** construida y probada en local (C8, ADR-0527, **migración `20261026212000` solo en local**; falta el OK de Felipe para producción). Es «Presupuesto ▸ Cuándo se paga» (spike ⑤): tandas de
  pedido (1 a 3) con su semana y su forma de pago, mes a mes, «llega tarde», IGV por categoría y los tres estados de visibilidad; se guardan los **pagos** (fecha, %) como fotos que solo se agregan, con la base exigiendo
  100 %. **Finanzas ▸ Resumen ya lee la inversión** (`getInversionMercaderia`, con las mismas cuentas del Plan). **Todavía no:** el flujo de caja de Reportes y Escenarios no leen la compra (`fn_flujo_caja_proyeccion` es de
  Finanzas), la gráfica de la caja de las 12 semanas y el recomendador (#13). Cuatro objeciones abiertas en el ADR (el tope mide cosas distintas en las dos pantallas, sus unidades con IGV, el módulo «Plan de campaña» para
  quien mira el Resumen y el flujo sin conectar). Probada con 27 casos de base (incluidas cuatro personas a la vez) y 70 de la lógica.

### #11 · [Eliminar/fusionar · Estético] Pulido pendiente
- **Dónde:** los 3 cambios de Formidable del 2026-10-24 (fecha que resulta en la hoja del plazo y los días una sola vez, margen apenas hay descuento, «Quitar el plazo» que dice qué pasa) y `<PieAcciones izquierda>` en `TopeModal`/`RecuperoModal`.
- **Por qué:** ya están medidos; no cambian ningún cálculo.
- **Esfuerzo / dependencias:** S · tu OK.

### #12 · [Replantear] De «pantalla de una campaña» a «programa del año»
- **Dónde:** el módulo entero (IA de pestañas: Plan · Presupuesto · Calendario · Resultados · Historial).
- **Por qué:** pedirle a Felipe que decida (ver §8).
- **DECIDÍ (propuesta):** el calendario pasa a ser la puerta: eliges las campañas del año y cada una abre su plan. **DESCARTÉ:** seguir sumando piezas a la pantalla actual: ya tiene 28 componentes y cinco lugares de avisos. **SE ROMPE SI:** un líder arma el plan de una campaña sin pasar por el calendario (la pestaña Plan debe seguir abriendo la campaña en curso).

### 7b · Pedido posterior (2026-10-26) · Enviar a Compras como «Pendiente de campaña»
- **Qué pediste:** con el presupuesto conforme, mandar las prendas, colores y tallas elegidas y confirmadas al módulo donde se pide la mercadería; que queden **pendientes de campaña, falta confirmar**, con la **fecha en que piensas pedir o «pedir ya»**, y **un botón para rectificar** la decisión.
- **Lo que existe hoy `[código]`:** una orden de compra solo es `generada` o `anulada` (`ordenes_compra_estado`, migración `20261010214500:47,59`): **no existe un pendiente**. Producción tampoco guarda borradores en la base (ADR-0509: viven en el navegador).
- **Spike ⑦:** en el Plan, «Enviar a Compras…» agrupa por quién lo surte (Pima Norte, Hilados Andinos, Lino & Co, Taller), pide para cada grupo «pedir ya» o «pedir el…», avisa si la fecha llega tarde (después del 17-nov) y dice qué **no** se envía (sin marca: sin proveedor; modelos nuevos: no hay producto que pedir). En Compras ▸ Órdenes aparecen como tarjetas «Pendiente de campaña · falta confirmar» con: **Confirmar y pedir** (crea la orden), **Cambiar fecha** y **Rectificar** (con motivo; no pide nada y vuelve al Plan como «por enviar»). Lo del Taller va a **Producción ▸ Órdenes**, no a Compras. Un pedido ya confirmado **no se rectifica desde el Plan**: se anula en Órdenes. «Rectificar el envío» vive en el Plan y en Compras.
- **Esfuerzo / dependencias:** L · después de #9 y #10 · **toca varios módulos (Plan, Compras, Producción, Finanzas): pide tu OK** y migración propia.
- **DECIDÍ:** una tabla propia de pedidos de campaña (líneas modelo × color × talla; fecha prevista o «pedir ya»; autor y hora; estados `pendiente → pedido | rectificado`); «Confirmar y pedir» llama a `crear_orden_compra` y guarda el `orden_compra_id`. **DESCARTÉ:** sumarle el estado «pendiente» a `ordenes_compra`: rompería la numeración, el PDF y el envío al proveedor, y `fn_plan_compra_pedido` (que solo cuenta las generadas); además toca una tabla central de Compras. **SE ROMPE SI:** el plan cambia después de enviar y nadie reenvía (el pedido sale con lo de antes): se guarda la versión del plan al enviar y la pantalla avisa «el plan cambió»; o dos personas confirman el mismo pendiente a la vez (candado de fila y un CHECK: un `pedido` exige `orden_compra_id`).
- **Estados imposibles que la base debe cerrar:** un `pedido` sin orden; un `rectificado` de algo ya pedido; dos envíos activos de la misma línea del plan.
- **Con Finanzas:** lo pendiente sigue siendo «falta pedir»; al confirmar pasa a «pedido sin pagar» (la regla de una sola etapa por sol, de la sesión del Resumen).

### 7c · Pedido posterior (2026-10-26) · #13 Recomendar cómo pagar la campaña (todo de una, en cuotas, desde qué mes)
- **Qué pediste:** una recomendación de cómo pagarla —todo de una o en meses, y desde qué mes— basada en tus ganancias y en cómo te fue otros años, como «inteligencia de predicción, análisis, estadística y probabilidad» con los datos de Sinatra y lo que se vende en el sistema.
- **Lo que los datos sostienen hoy `[producción, 2026-10-26]`:** Sinatra (`retail.ventas_historicas`) trae **solo `soles` por día y sede** (`ubicacion_id, fecha, soles, fuente`): **no trae costo ni margen**, así que «tus ganancias de otros años» no existe; el costo y el margen del ERP empiezan el 30-sep. Lo que sí dice es **cuándo entra la plata**. Tienda Trujillo, 6 años completos (2018, 2019 y 2022–2025; sin 2017 incompleto ni 2020–21): diciembre pesa **13,4 a 18,5 % del año (mediana 14,2)**, octubre y noviembre 5,3 a 8,0 %, enero 4,7 a 7,8 %. Arequipa tiene solo 2 años (diciembre ≈10 %). Lima no tiene historia. **De 119 proveedores, 0 tiene cargado el plazo de crédito** (`proveedores.plazo_credito_dias` vacío): hoy el sistema no sabe si «en meses» es posible.
- **Objeción:** una recomendación «de predicción» sobre ganancias sería inventar precisión: 6 puntos por mes y ningún costo. Lo honesto es **comparar calendarios de pago contra un rango de entradas** (flojo / normal / bueno sacado de esos 6 años, encogido hacia lo parejo por tener tan pocos), decir «basado en 6 años de Trujillo» y no prometer una probabilidad. Y casi todo el valor está en el crédito del proveedor, que es un dato que el empresario sabe y el sistema no.
- **Cómo funcionaría (después de #10):** al enviar a Compras (spike ⑦) cada grupo de proveedor pregunta una vez «¿te da crédito? ¿a cuántos días?» (se guarda en el proveedor). El Plan arma 2 o 3 calendarios posibles (todo antes del 17-nov / mitad y mitad / según el crédito) y para cada uno dibuja la caja mes a mes con el rango de ventas de la sede, junto con lo demás que sale (el flujo de Finanzas). Recomienda **el más barato que no baja de un colchón que tú escribes** (no se adivina), y dice el mes más apretado: «Pagar 50 % antes del 17-nov y 50 % en enero: en el caso flojo tu caja más baja es S/ X en diciembre». Sin crédito cargado dice «solo se puede pagar de una» y no inventa cuotas.
- **Cómo lo verificas tú:** con un crédito de 30/60 días y ventas «flojas» la recomendación cambia a cuotas; sin crédito cargado solo ofrece «de una»; la sede sin historia (Lima) lo dice en vez de usar la curva de otra.
- **Esfuerzo / dependencias:** M · **después de #10** (necesita las tandas y el flujo de Finanzas) · toca varios módulos (Plan, Proveedores, Finanzas): pide tu OK.
- **DECIDÍ:** comparar calendarios de pago contra un rango de entradas por sede sacado de Sinatra, con el colchón escrito por el empresario. **DESCARTÉ:** predecir ganancias por campaña con un modelo ajustado (no hay costo histórico y son 6 puntos por mes: el modelo sería ruido con cara de ciencia). **SE ROMPE SI:** la sede no tiene historia propia y se usa la curva de otra (Lima con la de Trujillo); o el rango sale de los 26 días del ERP en vez de los 6 años de Sinatra; o un proveedor figura con crédito que en realidad no da y el calendario recomendado deja un pago vencido.
- **Lo que esto toca de IGV:** el IGV de la factura de compra baja lo que se paga a SUNAT el mes siguiente (crédito fiscal): mueve la caja de enero, no la de diciembre. Confirmarlo con el contador antes de que el calendario lo cuente.

- **Estado (2026-10-26, noche):** construida y probada en local (C9, ADR-0527 «actualización: la caja», **sin migración nueva**). Dos piezas en «Presupuesto ▸ Cuándo se paga»: **«Así quedaría tu caja»** (la caja de 12 semanas de Finanzas con
  los pagos de la compra, el mínimo y el último día para pedir) y **«Cómo pagarla»** (cinco formas de pagar las mismas tandas contra esa caja, con lo esperado y con 20 % menos de cobros). **No predice** (Sinatra solo trae soles
  por día; sin costo ni margen): compara contra la caja que Finanzas ya proyecta, y **ninguna forma con crédito se recomienda sola** (hoy 0 de 119 proveedores tienen su crédito cargado). El crédito del proveedor «al Enviar a Compras»
  (7b) sigue pendiente. Solo un líder de equipo ve la caja (la base se la da solo a él).

## 8 · Estrategia alternativa
| | Pantalla por campaña (hoy + parches) | Programa del año (propuesta) |
|---|---|---|
| Ganas | Cero rediseño; lo construido sigue | Decides con cuáles campañas inviertes; el año se ve junto; presupuesto, colores y caja cuelgan de la misma campaña |
| Pagas | Cada pedido nuevo suma otra pieza; el selector sigue sin decidir | Migración + 2 piezas nuevas + una mudanza de pestañas; hay que enseñar el cambio |
Recomiendo el programa, pero **en orden**: #1–#3 ya, luego #4–#6 (sin tocar el modelo), recién después #7 y #9. Decide Felipe.

## 9 · Referentes y futuro
- **Referentes `[VERIFICADO salvo nota]`:** plan en dos pasos (Oracle MFP→Assortment, Blue Yonder, Nextail), necesidad neta (Lightspeed), aprobar o cambiar la propuesta (Oracle RDF), versiones lado a lado (Toolio, Oracle; Google Sheets para restaurar), incertidumbre como rango + etiqueta + «basado en N» (Cambridge Winton, Google PAIR). Detalle y fuentes: `docs/investigacion/2026-10-26-plan-de-campana-planificacion-de-compra.md` y `…calendario-avisos-y-finanzas.md`. El «≈20 % temprano» de Fisher–Raman era un resumen secundario: las láminas del MIT dicen «Commit 40 %».
- **Futuro (no cuenta entre las 12):** comprar vs producir en el Taller con plazo propio por proveedor; probabilidad por campaña cuando haya un año; MOQ del Taller (pregúntaselo: ninguna fuente web lo da); calendario 4-5-4 para comparar la campaña contra su par del año pasado.

## 10 · Fuera de esta pantalla
**Solo Navidad duplica la venta de Trujillo** (×2,0; 7,8 % del año en 15 días): las otras siete campañas que medí están entre ×0,85 y ×1,2. Ningún lugar del ERP lo dice cuando se decide cuánta plata inmovilizar en cada campaña; el Plan trata a todas con el mismo cuidado. Esto no es un fallo de la pantalla sino de dónde se pone el capital: #7 y #8 lo vuelven visible. (Con la reserva honesta: es el total de soles de la tienda, no de una categoría.)

## 11 · Líneas propuestas para el backlog
- [ ] `[pantalla:compras-plan]` #1 Guardar la propuesta del sistema junto a lo guardado (historial de líneas) — M
- [ ] `[pantalla:compras-plan]` #2 Cuadrar el stock de AQP, LIM y TRU antes del 17-nov — S
- [ ] `[pantalla:compras-plan]` #3 «En N días» y la exactitud de los números — S
- [ ] `[pantalla:compras-plan]` #4 Centro de avisos compacto (con aviso de deriva) — M
- [ ] `[pantalla:compras-plan]` #5 Pestaña Presupuesto y plan con tope — M
- [ ] `[pantalla:compras-plan]` #6 Versiones del plan y volver atrás — M
- [ ] `[pantalla:compras-plan]` #7 Calendario del plan (activa/pausada/cada año) — L
- [ ] `[pantalla:compras-plan]` #8 Historia por campaña y veredicto al cerrar — M
- [ ] `[pantalla:compras-plan]` #9 Paso 2 por familia de color con stock — L
- [ ] `[pantalla:compras-plan]` #10 Inversión en mercadería en Finanzas — L
- [ ] `[pantalla:compras-plan]` #11 Pulido de Formidable pendiente — S
- [ ] `[pantalla:compras-plan]` #12 Decidir: programa del año — decisión
- [ ] `[pantalla:compras-plan]` 7b Enviar lo elegido a Compras como «Pendiente de campaña» (con fecha y rectificar) — L
- [ ] `[pantalla:compras-plan]` 7c #13 Recomendar cómo pagar la campaña (calendarios de pago contra un rango de entradas de Sinatra; crédito del proveedor y colchón escritos por el empresario) — M, después de #10

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-10-26 | completo | 6,8 | 7,2 | — (primer análisis de `/pantalla` sobre esta ruta; antes: `docs/pantallas/compras-plan-prompt-maestro.md`, 2026-10-13, con 12 hipótesis de las que se cerraron S1–S6, V1, V3, V5) |
| 2026-10-26 (tarde) | construcción | — | — | #1 (en local), #2 (el aviso con fecha) y #3 hechas con `/construir`; ver `docs/backlog/2026-10-26-campaign-plan-audit-652032.md` |
| 2026-10-26 (noche) | construcción | — | — | #4–#9 y #10 (la parte del Plan y de lo que lee el Resumen) hechas con `/construir`; ver `docs/backlog/2026-10-26-campaign-plan-audit-652032.md` |
