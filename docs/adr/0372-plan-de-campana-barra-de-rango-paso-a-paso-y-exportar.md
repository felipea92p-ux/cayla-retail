# ADR-0372 — Plan de campaña: barra de rango, paso a paso, aviso de stock y exportar (entrega 1, solo web)

- Fecha: 2026-10-10
- Estado: aceptado y construido. Entrega 1 (solo web) y entrega 2: B1, B2 y B3 **en producción desde el 2026-10-10**; B4 (versión de cada categoría) también, el mismo día (OK de Felipe, una por una, cada una con ensayo en transacción revertida y huella igual a local).
- Continúa a [ADR-0349](0349-plan-de-campana.md). Maqueta aprobada: `docs/maquetas/plan-de-campana-2026-10/` (con su `PROMPT.md`).
- Sin migración: todo sale de lo que `fn_plan_compra` y `fn_motor_demanda_preparacion` ya devuelven, más la tabla `familias`.

## Problema

La pantalla de ADR-0349 era correcta pero no decía por dónde empezar: 42 filas «Sin plan», cifras en cero, y «Empieza por las que más
venden» sobre una tabla que se ordenaba por stock. Quien llenaba los tres escenarios no veía contra qué (cuánto había vendido), no había
cómo llevar la lista al proveedor, y nada avisaba que **«comprar = lo que conviene tener − lo que hay hoy»** sale inflado si el «hay hoy»
está incompleto (a 2026-10-05 AQP tenía 13 unidades y LIM 1). Es el caso «algoritmo sobre stock falso» que ADR-0349 ya nombraba como
trampa, sin que la pantalla lo mostrara.

## Qué se construyó

1. **`BarraRango`** por categoría: verde = ya hay, negro = comprar (sobre la `BarraApilada` del sistema), banda del flojo al bueno y marca
   en el normal; en la campaña, un rombo con lo vendido. Reemplaza «flojo · normal · bueno» en texto, que sigue debajo en números.
2. **Las que más venden primero**: la lista nace ordenada por ventas de 90 días (`vendidoPorTalla` sumado), con puesto 1 a 10. Buscador,
   píldoras (sin plan, con plan, las que más venden, se agotaron), familia y orden; sin plan, stock ni ventas se pliegan en una línea.
3. **Cifras**: la primera filtra; la cuarta dice cuántas de las que más venden faltan (y lleva al paso a paso) o, en la campaña, lo vendido.
   Bajo la frase, el momento: «Faltan 52 días», «Día 15 de 31», «Terminó hace 8 días».
4. **Hoja de una categoría**: referencia («Vendiste N en 90 días, hay N en la red»), «Proponer el normal desde lo vendido», resultado con su
   barra y **«Guardar y seguir con …»**, que pasa a la que más vende y no tiene plan sin cerrar la hoja.
5. **Paso a paso** (`Tabla | Paso a paso`): una categoría a la vez, con avance, «Saltar por ahora» (va al final, no se pierde) y cierre.
6. **Aviso de stock**: por tienda, si el piso se cuadró y el almacén se contó (la lectura del motor, ADR-0346). Incompleto → nombra las
   tiendas y lleva a Conteo; no se pudo leer → «No se pudo verificar» (nunca «confiable» por omisión).
7. **Exportar**: lista de compra por categoría y talla, con total; CSV (el `descargarCsv` de Existencias) o papel (`#lista-compra-print`).

## Decisiones

**DECIDÍ** un solo `FormularioCategoria` para la hoja y el paso a paso, con el pie como parámetro.
**DESCARTÉ** copiar el formulario al paso a paso: la guía de foco, la validación y la cuenta en vivo son el mismo contrato (`camposDelPlan`
↔ `problemasDelBorrador` ↔ la base) y dos copias se separan en cuanto alguien toca una.
**SE ROMPE SI** el paso a paso necesita campos que la hoja no tiene (hoy no).

**DECIDÍ** que «Proponer» rellene **solo el escenario normal**: un diciembre normal = 3 meses normales (R-19), y un mes normal = ventas
de 90 días ÷ 3, o sea lo vendido en esos 90 días.
**DESCARTÉ** el ×2 del flojo y el ×4,5 del bueno que traía la maqueta: no tienen un dato detrás y alguien los tomaría como regla.
**SE ROMPE SI** la categoría es de temporada y esos 90 días (hoy, julio a setiembre) no dicen nada de diciembre: una chompa vende en
invierno, no en la gratificación. La propuesta es un punto de partida que la persona corrige; por eso nunca llena los tres a la vez.

**DECIDÍ** medir la confianza del stock con dos condiciones del motor (piso cuadrado y almacén contado) y no con la tercera (venta
identificada). **DESCARTÉ** usar `puedeHablar`: mide si las ventas dicen qué prenda fue, que es otro problema y llegaría tarde para diciembre.
**SE ROMPE SI** el stock que falta está en el Taller: el «Hay hoy» lo cuenta y el motor solo mira tiendas. Queda dicho en el código.

**DECIDÍ** que «Exportar» solo aparezca cuando hay al menos una categoría con plan (quitar antes de agregar). **DESCARTÉ** un botón
apagado sin motivo a la vista.

## Lo que se apartó de la maqueta, a propósito

- La cifra «Categorías con plan» no lleva barra de avance: la `TarjetaCifra` solo trae el relleno en rojo o ámbar (urgencia), y el avance es
  verde. El avance vive en el paso a paso.
- El «Hay hoy» por sede, el precio y el costo del catálogo, «vendiste N en 30 días», el tope de inversión, el selector de campañas y «Finanzas
  dice…» **no están**: piden migración (o tocan dos módulos) y esperan el OK de Felipe (`PROMPT.md`, entrega 2).

## Cómo se verificó

- `plan-compra-reglas.test.ts`: 84 pruebas (45 de la cuenta de ADR-0349, intactas; el resto, de lo nuevo). Suite completa: 395 archivos en verde.
- Navegador local, con datos del seed: la tabla, filtros y buscador; la hoja (proponer, guardar y seguir); el paso a paso completo con una
  saltada hasta el cierre; el aviso con Lima y Trujillo sin cuadrar; «Durante»; la lista, el CSV real (BOM, total 443 y S/ 12,508.00) y la hoja
  impresa (simulando `@media print`). Modo oscuro con contraste medido (5,2:1 a 15:1).
- **No se hizo**: `tema:auditar` (a Playwright le falta descargar su navegador), abrir el CSV en Excel, `/formidable` ni `/chaos`.
- Aprendido: Turbopack no recogió un `@import` nuevo en `globals.css` hasta borrar `apps/web/.next`.

## Actualización 2026-10-10 — entrega 2 (migraciones B1, B2 y B3)

Migraciones `20261010190000` (B1), `20261010191000` (B2) y `20261010192000` (B3); `pnpm pruebas:plan-compra`: 16 casos (de 6).

- **B1, lectura ampliada.** `fn_plan_compra` SUMA `catalogo` (precio y costo promedio, solo activos y sin pruebas; un 0 es «sin dato»), `stock_sedes` y
  `vendido_30`. No cambia ninguna clave de antes. La hoja precarga el precio y el costo («Del catálogo · revísalo»), dice dónde está el stock y cuánto se
  vendió en 30 días. **En producción** (versión registrada `20261010174829`, huella de la función `9315c4b2…`, igual a local).
- **B2, tope de inversión.** `planes_compra.tope_inversion` con autor y hora (CHECK: positivo, y nunca sin autor), `guardar_plan_compra_tope` (módulo **y**
  líder; firma con el responsable; NULL lo quita) y `plan.tope_inversion` en la lectura. El tope **avisa, no bloquea**. La cifra de Inversión lleva su
  barra (`BarraApilada total=`, top 5 + «Otras») y «Poner / Editar el tope» (solo líder). **En producción** (`20261010175004`, huellas `73df8d9b…` de
  `fn_plan_compra` y `e16562ef…` de `guardar_plan_compra_tope`, iguales a local). Antes se ensayó en transacción con rollback.
- **B3, varias campañas.** Felipe eligió que la campaña nazca de una etiqueta (Catálogo ▸ Etiquetas) y que el selector pase entre las existentes.
  **DECIDÍ** `planes_compra.etiqueta_id` (única por etiqueta) + `crear_plan_compra(etiqueta, nombre, desde, hasta)` (módulo y líder) + `fn_planes_compra()` para el selector.
  **En producción** (versión registrada `20261010175916`, huellas `f91bef63…` de `fn_planes_compra` y `85863d6c…` de `crear_plan_compra`, iguales a local).
  **DESCARTÉ** la fecha única literal: «Navidad» en Etiquetas es del 11 al 25 de diciembre (campaña de venta con descuento) y «Diciembre 2026» es del 1 al 31
  (ventana de compra, a propósito: diciembre triplica un mes entero); atarla a la etiqueta movería el plan ya sembrado. El plan arranca con las fechas de la
  etiqueta y se pueden ajustar; si difieren, la hoja lo dice. «Diciembre 2026» queda sin etiqueta.
  **DESCARTÉ** copiar precios y costos de otra campaña (lo que traía la maqueta): una línea exige sus tres escenarios (CHECK), no se guarda a medias; el
  catálogo (B1) ya lo resuelve.
  **SE ROMPE SI** alguien crea en Etiquetas una campaña con las mismas fechas de otra y espera dos planes: el índice único es por etiqueta, no por fechas.
- **Fuera:** «Finanzas dice…» (toca dos módulos).
- **Verificado:** SQL 16/16; 102 pruebas de reglas y suite completa; navegador local: tope (poner, quitar, firma en la base), hoja con stock por sede y
  ventas de 30 días, crear «Navidad 2026» desde su etiqueta y volver con el selector. La precarga del catálogo se probó con pruebas unitarias y SQL (en la base
  local las únicas categorías con catálogo ya tenían plan de otra persona).

## Actualización 2026-10-10 (b) — /chaos y /formidable, y lo que se arregló

Corridas sobre lo ya publicado (PR #931): `/chaos` con semilla 931 (informe local `.chaos/informes/plan-campana-2026-10-10.md`) y `/formidable`
(`docs/formidable/compras-plan.md`: leyes 5,1, oficio 7, con prueba ciega y escéptico). Felipe dio el OK a todo («Termina lo que te falta e implementa»).

- **Dos personas guardando la misma categoría (chaos NAV-05, gravedad 2).** **DECIDÍ** el control de versión de ADR-0193 en `planes_compra_lineas`
  (migración `20261010200000`, B4): columna `version` con el disparador de siempre (`fn_subir_version`), `p_version_esperada` en
  `guardar_plan_compra_linea` (0 = la hoja abrió sin plan) y PT409 `version_cambiada` con quién y a qué hora guardó. Una diferencia con ADR-0193: si lo
  que se manda es IGUAL a lo guardado, no hay conflicto (un reintento después de que se perdió la respuesta no debe chocar consigo mismo).
  **DESCARTÉ** usar `updated_at` como versión (ya viajaba en la lectura y no pedía columna): sería el mismo problema resuelto de dos formas en el ERP
  (integridad conceptual). **DESCARTÉ** bloquear la hoja mientras alguien la edita: un candado que se queda puesto cuando alguien cierra la pestaña.
  **SE ROMPE SI** alguien escribe `planes_compra_lineas` sin pasar por la función (hoy nadie: RLS sin políticas) o si dos personas guardan exactamente
  lo mismo (no es un conflicto, y no se avisa). La web es retrocompatible: manda la versión solo si la lectura trae `con_version` (orden de pegado libre).
- **«¿Salir sin guardar?» antes de que la hoja se vaya.** `<Modal>` suma `antesDeCerrar(cerrar)`: Escape, el velo y la ✕ preguntan con la hoja todavía
  a la vista. Pasado por `onClose`, la pregunta llegaba después de animar la salida y, con «Seguir editando», la hoja quedaba invisible.
  **DESCARTÉ** `bloqueado` mientras hay cambios: Escape dejaría de responder sin decir por qué.
- **La vista «Paso a paso» en la URL (`?vista=paso`, con `history.pushState`):** «Atrás» vuelve a la tabla en vez de salir de la pantalla; volver con
  el botón retira esa entrada (marca `__planVistaPaso`) en vez de apilar otra. **DESCARTÉ** `router.push`: vuelve a pedir la página al servidor (con el
  loader) solo para cambiar de pestaña.
- **Una campaña de la URL que no existe** muestra la más reciente y lo dice (`planPedidoNoExiste`); un id que no es uuid no se le manda a la base.
- **Lo que no cambió de regla:** el cálculo, las validaciones de la base y quién puede qué. Los topes nuevos de la hoja (100 000 prendas, S/ 100 000 por
  prenda) son contra un error de tipeo, no reglas de negocio.
- **B4 en producción desde el 2026-10-10** (OK de Felipe; ensayo revertido; versión registrada `20261010204108`, huellas `f283d296` de `fn_plan_compra` y
  `006bd08e` de `guardar_plan_compra_linea`, iguales a local). El candado actúa cuando se publica la web que manda la versión.
- **Pendiente de Felipe:** el número que más mueve la compra, «Lo que sobra», sigue escribiéndose por categoría:
  con el margen de CAYLA, desde un 39 % el sistema compra para el diciembre bueno. Propuesta: un solo % de CAYLA, fijado por un líder.

## Actualización 2026-10-10 (c) — editar, quitar y restaurar una campaña (B5)

Una campaña nacía con su nombre y sus fechas y nunca más se podía tocar. En producción, el mismo día, había tres: «San Valentín 2026» (ya pasada,
creada por error), «Diciembre 2026» y «Navidad 2026», que se superpone con Diciembre. Felipe eligió (2026-10-10): **borrar si está vacía, archivar si
no**, y que se editen **nombre y fechas**.

- **DECIDÍ** `quitar_plan_compra`: vacía (ninguna categoría armada y sin tope) → se borra; con algo → se archiva (`planes_compra.archivado_por/en`,
  sale del selector, conserva todo, `restaurar_plan_compra` la devuelve). La base decide, no la pantalla: bloquea la fila antes de mirar, y la
  clave foránea de las categorías (sin cascada) hace imposible borrar una campaña con alguna. `editar_plan_compra` cambia nombre y fechas; la etiqueta
  no cambia (si se eligió mal, se quita y se crea otra). Todo pide el módulo y ser líder, y firma el responsable del combo (también restaurar, que
  queda como la última edición).
  **DESCARTÉ** archivar siempre (lo que recomendé): Felipe prefirió que una campaña creada por error y vacía no quede guardada para siempre; borrar algo
  sin historia no pierde nada. **DESCARTÉ** cambiar la etiqueta al editar: el plan podía quedar con fechas de una campaña y nombre de otra.
  **SE ROMPE SI** alguien quiere recuperar una campaña vacía borrada (no se puede: por eso el botón dice «Borrar» y se confirma con el resumen), o si se
  archiva una campaña y se intenta crear otra desde la misma etiqueta (la archivada sigue siendo dueña de su etiqueta: hay que restaurarla).
- **Pantalla:** el selector suma «Editar o quitar esta campaña…» y «Campañas archivadas (N)…» (solo líder; se esconden si la base no tiene B5). La hoja
  de edición dice antes qué va a pasar: «Borrar campaña» (se confirma: es irreversible) o «Archivar campaña» (sin confirmar; el aviso trae «Deshacer»).
  Una campaña archivada abierta por su enlace se ve tal como quedó, con un aviso y «Restaurar…».
- **Verificado:** pruebas SQL 23/23 (E1–E4 nuevas); reglas 115; navegador local: borrar una vacía, editar el nombre, archivar una con 5 categorías,
  «Deshacer», «Campañas archivadas» → «Restaurar», y el vacío «No hay campañas activas». Migración `20261012120000`: `fn_planes_compra` y `fn_plan_compra` se cambian con
  reemplazos ANCLADOS sobre su definición viva (no se copian), porque `fn_plan_compra` ya tiene el filtro de familias apagadas de `20261010232000`.
  **En producción desde el 2026-10-12** (OK de Felipe; ensayo revertido; versión registrada `20261012134639`; huellas iguales a local salvo `fn_plan_compra`,
  que conserva sus 10 filtros de familias).

## Actualización 2026-10-12 — la historia: Sinatra, el Historial, la propuesta de tres escenarios, lo que sobra y los Resultados (C1–C6)

Felipe pidió «datos reales o precisos» para predecir cuánto se vende en una campaña, con los documentos Sinatra (los Excel de Finanzas) y una
pestaña para ver y comparar las campañas anteriores. Plan aprobado (C1–C6) y decisiones suyas del 2026-10-12:

- **C1, la lista de campañas.** El selector agrupa «En curso», «Por venir · año» y «Terminadas» (las del último año; las más viejas, en el Historial) y
  trae buscador siempre (`Desplegable conBuscador`). Sin `?plan=` abre la que toca hoy (`campanaQueAbre`): en curso, si no la próxima, si no la última
  terminada. Antes abría la de inicio más lejano: con «Día de la Madre 2027» creada, en diciembre se abría mayo. La lista de un desplegable de cabecera
  ya no se sale por la izquierda (se pega al borde izquierdo del control si no cabe).
- **C2, Sinatra.** `retail.ventas_historicas (ubicacion_id, fecha, soles, fuente)`: solo soles por tienda y día (Sinatra no sabe de categorías ni
  unidades). Se carga una vez con `scripts/plan-compra/sinatra-a-sql.py` (los datos nunca entran al repo). Hasta 2023 el único «Diario» es Trujillo;
  Arequipa desde feb-2024. Fuera: KIDS y «Sodalita 2023» (la línea de niños: Sodalita es el diario de KIDS con S/ 300 más por día), «CAYLA PET 2022»
  (copia de 2022) y Lima 2026 (su hoja «Ingresos» son 20 registros sueltos, no un diario). Cada archivo aporta solo los días de su año.
  **DECIDÍ** una tabla aparte. **DESCARTÉ** meterla en `ventas` (ventas sin prenda, pagos ni comprobante rompen caja y SUNAT) y cargar las compras por
  categoría de Sinatra (53 nombres distintos y la mitad sin categoría en 2025: traducirlas sería adivinar). **SE ROMPE SI** alguien corrige un día en el
  Excel después de la carga: es una foto; por eso cada fila guarda su archivo y la carga es un upsert.
- **C3, Historial** (`/compras/plan/historial`): un año a la vez; una fila por campaña de Etiquetas llevada a ese año (mismo día y mes; Día de la Madre
  con su segundo domingo de mayo) más «Diciembre»; por tienda, soles, «×N un día normal» (soles por día ÷ los de los 60 días de antes) y el crecimiento
  contra el año anterior. Antes de la primera venta de una tienda en el ERP manda Sinatra; desde ella, el ERP (`fn_historial_ventas`).
- **C4, proponer los tres escenarios** (`fn_plan_compra_propuesta` da los hechos; `lib/plan-compra-propuesta.ts`, la regla): normal = un mes estándar
  (90 días con ERP llevados a 30, y a los días de la campaña); flojo = el mes más bajo de los últimos 6 (ventanas de 30 días completas; si una tienda no
  tiene ninguna, no se propone); bueno = normal × 3 mientras no haya la misma campaña del año anterior en el ERP, y después el punto medio entre «normal ×
  multiplicador real de la tienda» y lo vendido en esa campaña, **salvo que la categoría se haya agotado** (entonces solo normal × multiplicador: lo
  vendido quedó corto por stock, no por clientes). Por tienda y sumado; enteros por tienda antes de multiplicar («normal 3 × 3 = 9», nunca 8).
  **Esto reemplaza R-19 en la propuesta**: antes el normal era 3 meses (diciembre = 3 × un mes); ahora el normal es un mes estándar y el × 3 va en el bueno.
- **C5, lo que sobra de CAYLA.** `planes_compra.recupero_defecto_pct` (con su autor) y `guardar_plan_compra_recupero` (solo líder, firmado): el % con que
  arranca cada categoría nueva; cada una puede cambiarlo. Una campaña sin el suyo hereda el de la anterior más reciente.
- **C6, Resultados** (`/compras/plan/resultados`, `fn_plan_compra_resultados`): por tienda (unidades, soles, multiplicador real), por categoría (contra
  el plan, «Se agotó en…», lo que sobró = lo cobrado en los 60 días después ÷ su precio de etiqueta), las prendas y los colores que más vendieron.
- **Una sola definición de «lo vendido»** para la propuesta y los resultados: `fn_unidades_vendidas` (con su prenda o anotado sin registrar; solo
  familias que cuentan en los motores, ADR-0377). «Agotada» sale de `fn_stock_categoria_al` (el stock de hoy menos lo movido después, sin Cuarentena;
  sin fila de stock = cero). Las dos son internas (sin permiso para la web).
- **Verificado:** reglas (historial 16, propuesta 13, resultados 11, plan 121); pruebas SQL `pnpm pruebas:plan-compra-historia` 10/10; navegador local
  con la historia real de Trujillo (2025: S/ 1 649 544, +9 %; Navidad ×2.0, Diciembre ×1.8). **Migraciones `20261012160000` y `20261012161000` EN PRODUCCIÓN
  desde el 2026-10-12** (orden de Felipe; ensayo revertido antes; verificado como líder: las 6 funciones responden, las internas no se exponen y
  anon no lee). Falta la carga de Sinatra (`carga-sinatra.sql`, fuera del repo).
- **Las tiendas activas salen siempre** (Felipe: «quiero ver Arequipa, Lima y Trujillo, que son mis tiendas activas»): migración
  `20261012162000` (reemplazos anclados en `fn_historial_ventas` y `fn_plan_compra_resultados`), **en producción desde el 2026-10-12**. Antes solo
  salían las tiendas con algún dato y Lima desaparecía (no vende aún en el ERP y su Sinatra 2026 no es un diario); ahora sale con «Sin dato» o 0.
  La historia de Sinatra en producción quedó cargada: 3 085 días de TRU y 816 de AQP (3 901).
- **El detalle de una fila del Historial** (Felipe: «al darle clic a una fila, los detalles»): `DetalleCampanaHistorial.tsx`, el día a día de la
  campaña contra un día normal (mejor y peor día) y la misma campaña año por año (una lectura chica por año). Sinatra no sabe de prendas: el
  detalle de prendas y colores está en Resultados, y la hoja lleva ahí si la campaña tiene su plan en el ERP.

## Actualización 2026-10-12 (b) — durante y después de la campaña, cuánto le toca a cada tienda, y buscar en las tablas

- **Lo rescatado de los referentes** (WSSI de los compradores de moda; maqueta `docs/maquetas/plan-campana-ubicacion-2026-10/`): en el Plan, el
  simulador (supuestos que se mueven sin guardar) y «Te quedan S/ X»; en Resultados, «¿Cómo va?» (lo vendido contra lo que el plan esperaba a hoy,
  con la forma de los días de la misma campaña el año pasado) como **primera tarjeta de cifras**, «Pedir más o impulsar» solo si alguna categoría lo
  pide, y al terminar el cierre con sell-through (precio lleno · rebaja · sobra). Lo que Análisis ya hace por prenda y tienda no se repite: un acceso,
  solo para quien ve ese módulo. Migración `20261012163000` (`por_dia`, `filas[].rebajadas`, `stock` en `fn_plan_compra_resultados`).
- **Cuánto le toca a cada tienda** (Felipe: «de manera global debemos comprar tanto, pero cada sede es única»). Decisiones suyas: se reparte según
  lo que vendió cada tienda en 90 días (su ritmo por día), se manda todo al inicio, y una tienda que casi no vende (Lima) recibe un mínimo que fija un
  líder. Regla en `lib/plan-compra-reparto.ts` (redondeo por restos mayores; el mínimo es un piso, no un extra). Migración `20261012164000`:
  `planes_compra_reparto (plan_id, ubicacion_id, minimo_pct 1–90)` + `guardar_plan_compra_minimo` (solo líder, firmado; la suma de una campaña no
  pasa de 100 %; solo tiendas activas) + `tiendas_activas` y `minimos` en la propuesta.
  **DECIDÍ** guardar solo el mínimo y calcular el reparto al leer. **DESCARTÉ** guardar el reparto de cada categoría por tienda (cada venta lo dejaría
  viejo y habría que recalcularlo en otro lado: dos verdades). **SE ROMPE SI** una tienda abre a mitad de campaña: no tiene 90 días y le toca solo su
  mínimo hasta que venda.
- **Compacto por defecto** (Felipe: «para visualizar más rápido la tabla»): el resumen del Plan es una fila de cifras («Toda CAYLA», con su «!» que
  dice qué tiendas suma) y «Ver detalle» abre lo que sobra, el reparto, las tarjetas y el simulador. La fila se decide por el ancho de la TARJETA
  (consulta de contenedor), no de la ventana: con el menú abierto, un laptop de 1200 px deja 940 para el resumen.
- **Buscar y ordenar** en Historial y Resultados (como el Plan). En Resultados **toda fila abre su detalle**, también la que aún no vende: contra lo
  esperado (siempre toda CAYLA: el plan es de todas) y contra la misma campaña del año anterior, por categoría (sale de la propuesta, que ya lo lee).
  Sin dato lo dice: antes del ERP, Sinatra solo tiene soles por tienda. La comparación es por `categoria_id`: una categoría rehecha entre campañas
  diría «0» en vez de «sin dato» (en el backlog).
- **Verificado:** reglas (resultados 30, historial 23, reparto y propuesta), pruebas SQL `pnpm pruebas:plan-compra-historia` 13/13, guías
  interactivas recorridas en local (Plan 22 pasos, Resultados 12, Historial 11; la demo no escribió en la base). **Migraciones `20261012163000` y
  `20261012164000` EN PRODUCCIÓN desde el 2026-10-12** (ensayadas y deshechas antes; las pegó Felipe; verificadas como líder: Aniversario CAYLA 2026
  trae 11 días, 34 categorías con stock y las tres tiendas activas; la tabla nueva con RLS y sin políticas, no la lee la web).
