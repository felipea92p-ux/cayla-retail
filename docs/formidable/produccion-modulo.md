# Formidable · Producción ▸ el módulo entero, 11 pantallas   (`/produccion/*` y `/ordenes-insumos`)

- **Fecha / SHA:** 2026-10-13/14 · `d4533724e` · **Dispositivo que manda:** escritorio (el Mac mini del Taller); tablet y 375 px se adaptan, no mandan en Producción.
- **Pregunta que debería resolver (1 frase):** «¿Qué está haciendo el Taller con cada orden, qué le falta (tela, avíos, quien cose afuera) y qué me toca decidir hoy?» · **Protagonista:** la prenda, y con ella la tela que la hace (en el Taller son las dos caras de la misma orden).
- **Veredicto en una línea:** «Se entiende qué es en 5 s (los dos ciegos leyeron el Resumen bien) y las dos tareas se terminaron, pero nadie pudo decir que la costura va afuera ni a quién, la prenda no se ve en Órdenes y la etapa es un bit.» **Hay leyes en 2 y en 3 en pantallas sueltas:** la ley 5 de Órdenes está en 2; la ley 4 de Eficiencia, la ley 5 de Insumos, de Recibir y de Órdenes de insumos, y la ley 6 de Órdenes están en 3.
- **Qué es este informe: la LÍNEA BASE «antes».** Felipe decidió el 2026-10-13 rediseñar el módulo completo («la estética y las funcionalidades no me convencen para nada»; ADR-0400, reservado; la investigación está en `docs/investigacion/2026-10-13-produccion-rediseno/README.md`). Aquí no se propone el rediseño ni se adivina lo que hará: se deja medido cómo está hoy, al mismo ancho y con la misma semilla, para comparar el «después» contra estos números.
- **Escala (Felipe eligió «medio»):** ① medidor (Playwright: 27 vistas + 5 hojas a 1440 × 900 y 1024 × 768, claro y oscuro; JSON y capturas en el scratchpad de la sesión, `formidable-produccion/medidas/` y `antes/`) · ② **dos** ciegos (modelo de la sesión; Opus cayó por el falso positivo `reasoning_extraction`) · ③ revisor de leyes (código, sin navegador) · ④ escéptico (código y base local; reprodujo dos veces el Deshacer que falló).
- **Ciega: pasa con salvedades · real: sin probar.** Los dos ciegos entraron como `felipe@cayla.local` (líder y Admin) parados en el Taller: no es una colaboradora sin permisos, así que la ley 1 no puede pasar de 8 y vieron cosas que una colaboradora no ve («Eres admin…», «Cerrar al inventario», «Anular»).
- **Nueva orden ya tiene su informe** (`produccion-nueva-orden.md`, 2026-10-10, 5,4): aquí es un **re-análisis** por código, **6,0 provisional** tras A1–A3 de ADR-0396 (el modelo primero, la tabla única, la hoja ancha con ficha viva); sin ciega nueva sobre la hoja (el ciego 1 la usó de paso, como parte de su tarea).
- **Datos:** semilla «ZZ Prueba» en la base local compartida (`semilla.md`: 3 modelos, 5 órdenes, 2 proveedores, 2 insumos, 3 comprobantes, 2 cotizaciones, 1 traslado; foto previa `formidable-produccion-2026-10-13`). En producción real `producciones`, `insumos`, `comprobantes_produccion*`, `proveedores_produccion` y `cotizaciones_maquila` tienen **0 filas** (investigación del 13-oct): el Taller nunca abrió una orden real. Los ciegos dejaron la orden 6 y la OI-000002: la limpieza está escrita en `semilla.md` y no se hizo todavía.

## Notas (0–10)

| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | **5** (provisional; tope 8 sin colaboradora real) | [Observado] ciego 1 («50 blusas Marina, corte en casa, costura afuera; después el paso y la fecha del pantalón»): 5 s bien; el pedido quedó (orden 6, 50 prendas) en 23 clics, 4 pantallas + 3 hojas, 2 retrocesos; **la costura afuera solo pudo escribirla en la Nota**: no encontró dónde marcar la etapa ni a quién (la caja «Maquila S/» pide un monto); «Enviar a maquila» se aplicó al corte sin preguntar etapa ni taller; **«DESHACER» no revirtió**; el paso y la fecha del pantalón sí (la fecha sin año); 14 palabras no entendidas. · ciego 2 («¿alcanza el lino?, pedir si falta, ¿a quién le debe el Taller?»): 5 s bien; las tres respuestas sí (la deuda al 2.º intento: fue a Proveedores y la fila abrió la edición) en 20 clics, 6 pantallas + 2 hojas, 3 retrocesos; **el Resumen siguió diciendo «Faltan 32.3 m» después de pedir**; 11 palabras no entendidas. · **real: sin probar.** |
| 2 Una pregunta, una respuesta | **6,1** | [Medido, DOM] una sola acción primaria en 7 vistas; **2 en la cabecera de Insumos y de Facturas**; **3 dentro del cajón de la orden**; 0 en Eficiencia y en Cotizaciones. [Observado] los dos ciegos: «Producción» en el menú solo despliega; «+ Nueva orden» desde el Resumen cambia de pantalla. [Medido, código] el Resumen junta cuatro cifras, «Para decidir», «¿Qué producir?» y «¿Alcanza la tela?» (261 palabras sobre el pliegue). |
| 3 Simplicidad profunda | **6,1** | [Observado] «¿Alcanza la tela?» da un veredicto que no cuenta las órdenes de insumos ya generadas (ciego 2; escéptico #3 CONFIRMADO, gravedad 2). [Medido, código] «Corte hecho» no mira si la tela se descontó (H-B3 CONFIRMADO, gravedad 2); Eficiencia muestra la fórmula cruda (H-J2); «Cubrir 30 días», «Al filo 46 %», «Gana 81 %», «Margen promedio» pasaron de largo para el ciego 1. Lo que sí traduce: los chips «Gana / Margen bajo» (desde el 10-oct) y «Para decidir · 2 asuntos». |
| 4 Lenguaje de tienda | **5,5** | [Observado] 14 + 11 palabras no entendidas, textuales en «Prueba ciega». [Medido, código] el escéptico confirmó **10 de 11** términos del revisor (#13; «Precio a tienda (c/u)» vive en una pieza compartida, `ModeloNuevoCampos.tsx:118`); Eficiencia escribe el nombre de una migración SQL y «Dynamic/admin» (H-J1 MATIZADO: sale ante cualquier error de `planilla_por_sede`, `lib/eficiencia.ts:28`); «(D-31)» en la bajada de Cotizaciones; «Eres admin…» en el cajón. Cuatro pantallas en 3 (Insumos, Recibir, Órdenes de insumos, Eficiencia). |
| 5 Contenido primero | **4,5** | [Medido, DOM] `prendaVisible = false` en las 10 pantallas a 1440 y a 1024; solo la hoja Nueva orden la muestra (7 mosaicos). El primer dato aparece a 200–293 px (470 en Eficiencia, 460 en el cajón; 345 en el Resumen a 1024). [Medido, código] la tarjeta de Órdenes no tiene foto ni mosaico (`OrdenTarjeta.tsx:74`), el color es un punto de 10 px (`MatrizOrden.tsx:57`); escéptico #12 CONFIRMADO. La tela no tiene cara en ninguna pantalla (H-A3/H-D2, sin veredicto del escéptico). Órdenes en 2; Insumos, Recibir y Órdenes de insumos en 3. |
| 6 Lo difícil, a un toque | **4,6** | [Medido, código] el nombre de la etapa solo sale al pasar el mouse (`OrdenTarjeta.tsx:93`, CONFIRMADO en #12); el Resumen no tiene «¿Por qué?» como toque (H-A1, sin veredicto del escéptico); el lote PEPS solo en hover (H-D3, sin veredicto); la leyenda «Piden se calcula con el consumo real medido…» siempre abierta (ciego 2 no la entendió). Órdenes en 3. |
| 7 Perdonar antes que preguntar | **6,7** | [Observado] «DESHACER» no revirtió «Enviar a maquila» (ciego 1); escéptico #1 **CONFIRMADO con otra causa**: el aviso dura 4 s y se monta ~0,9 s tarde (`Avisos.tsx:78,225-229`); con el cajón abierto (Dialog modal, `body` sin `pointer-events`) cualquier clic sobre el aviso cierra el cajón y solo deshace si cae dentro de la caja real del botón (`avisos.css:68-69`); reproducido 2 veces; **es de las piezas del sistema, no lo absorbe el rediseño**. [Medido, base] `set_etapa_produccion` acepta `acabado = hecho` con `corte = pendiente` y no valida consumos (#4). A favor: Nueva orden pregunta «¿Salir sin guardar?» (arreglado el 13-oct) y guarda con token idempotente; «Traer de vuelta» sí funcionó. Modales sin `useSalidaSinGuardar`: visto por grep, no en el navegador. |
| 8 Quitar antes de agregar | **5,5** | [Medido, DOM] 313 palabras sobre el pliegue en Insumos (alto 1 157 px; 1 600 a 1024), 261 en el Resumen, 217 en Eficiencia; 13 tamaños de texto en Por pagar y en la hoja Nueva orden. [Medido, código] lo que se duplica está en «Lo que sobra». Resumen en 4. |
| 9 De punta a punta | **6,2** | [Medido, código] el vacío de Órdenes dice «ya se cerró» en el primer uso (H-B4 CONFIRMADO); Recibir dice «Todo lo facturado ya llegó» sin haber facturado nada (H-H1 CONFIRMADO); quien no es líder es redirigido sin explicación (H-A2 CONFIRMADO); Cotizaciones es huérfana: sin menú y sin lector (#5); «Faltan N m» lleva a «Registrar el comprobante» y nada lleva a `/ordenes-insumos/nueva` (#7); el tablero a 1024 scrollea de lado con la 3.ª columna cortada (#10, por diseño). [Medido] 0 HTTP ≥ 400 y 0 `pageerror` en 29 vistas; el oscuro sale bien (la «hoja clara» fue refutada). 375 px: sin medir (no manda aquí). Cotizaciones en 4. |
| **Leyes (promedio)** | **5,5** | Aritmético **5,6** (50,2 / 9); **5,5** con el ajuste de conjunto del revisor, porque los cortes ENTRE pantallas no viven en la nota de ninguna: tela ↔ orden («Corte hecho» no mira el consumo), maquila ↔ Abastecimiento («Enviar a maquila» solo cambia un estado; la factura entra como texto), Resumen → pedir (nunca va a Órdenes de insumos), muestra → lote (sin «Producir este modelo»), Movimientos no muestra «Orden N». No se redondea hacia arriba: hay leyes en 2 y en 3 (ver la primera línea). La ley 1 es provisional. |
| **Oficio visual** | **5,6** (código) | [Medido, código] promedio de las 11 pantallas del revisor (de 4 a 8). [Medido, navegador] el script dice que fallan **de 6 a 8 de 8** comprobaciones por vista; **sin el chrome global** («Salir» 37 × 16,5, «Buscar…» 4,15:1, Ctrl/K 3,32:1 y 10 px, el borde de «Felipe Alvarez») quedan **de 3 a 8** (tabla por pantalla). «Texto chico» (las versalitas de 11 px, decididas) y «radios» (`rounded-full` cuenta como 999 px y 3,3e7) fallan en las 29 vistas y ninguna pantalla puede bajarlas: **el piso del script es 2**. Lo que sí es de las pantallas: «Reabrir» 37,8 × 17,3 y «Devolver al estante» 116,7 × 19,5 en el cajón (MATIZADO: pasan WCAG 2.5.8, fallan el objetivo de la casa de 32 px); «Terminadas (1) ▸» 115 × 16,5; los contadores «· 1» a 2,78:1 (pieza del sistema, `titulo-grupo-cuenta`); «—» a 2,80–2,85:1 en Proveedores, Facturas y Eficiencia; `text-xs` a 4,45:1 en Eficiencia (19 contrastes); «S/» 3,60:1 en la hoja; huecos de 27 px × 4 en el tablero; montos sin alinear y 13 tamaños en Por pagar; 3 rojos en el cajón. |

## Por pantalla (las 11)

Leyes 2 a 9 del revisor, corregidas con el escéptico (lo que cambió: Órdenes ley 7 de 7 a 5 por el Deshacer; Resumen ley 3 de 6 a 5 por el veredicto de tela; Proveedores ley 9 de 7 a 6 por el saldo prometido). La ley 1 es del módulo (dos ciegos), no de cada pantalla. **Oficio (código)** es la nota del revisor; **fallas de 8** es el script a 1440 × 900: medidor → sin chrome (entre paréntesis, el escéptico: lo que queda si además se descuenta lo que es pieza decidida del sistema; † = mi recuento sobre `medidas/*.json` con la misma regla, en las vistas que el escéptico no recontó). **Total** = (leyes 2–9 + oficio código) / 2.

| Pantalla (ruta) | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | Leyes 2–9 | Oficio (código) | Fallas de 8 a 1440 | Total | Lo que pesa |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A · Resumen (`/produccion`) | 6 | 5 | 5 | 6 | 4 | 8 | 4 | 6 | 5,5 | 5 | 6 → 5 (4) | **5,3** | «¿Alcanza la tela?» no cuenta lo pedido; «Faltan N m» lleva a Facturas; sin «¿Por qué?»; 261 palabras; el h1 recién a 187 px (las pestañas van arriba); «¿Qué producir?» sale vacío con modelos `es_prueba` (ADR-0377). |
| B · Órdenes: tablero y cajón (`/produccion/ordenes`, `?orden=`) | 5 | 6 | 5 | **2** | **3** | 5 | 5 | 6 | **4,6** | 4 | tablero 7 → 7 (5) · cajón 8 → 8 (7) | **4,3** | La prenda no está; la etapa es un bit; el nombre de la etapa solo en hover; Deshacer no deshace desde el cajón; 3 primarias en el cajón; «Reabrir» 37,8 × 17,3; 3 rojos; a 1024 scroll de lado con la 3.ª columna cortada; «Eres admin…» en 2 líneas. |
| C · Nueva orden, hoja (re-análisis) | 6 | 6 | 6 | 6 | 6 | 7 | 5 | 6 | 6,0 | 5 | 7 → 7 (6) | **5,5** | La única vista con la prenda (7 mosaicos); no pregunta tela, etapa afuera ni proveedor (ADR-0396 lo dejó abierto); dos consejos a la vez; «S/» 3,60:1; 13 tamaños; 9 bordes casi alineados (`sr-only` y títulos). |
| D · Insumos (`/produccion/insumos`) | 5 | 6 | 5 | **3** | 4 | 6 | 6 | 7 | 5,3 | 6 | 6 → 5 (4) | **5,6** | Dos verbos de alta (catálogo vs lote); la tela sin cara; el lote PEPS solo en hover; 2 primarias en la cabecera; alto 1 157 px (1 600 a 1024, con 4 filas desiguales); la oferta de la guía tapa el libro. |
| E · Órdenes de insumos (`/ordenes-insumos`) | 7 | 7 | 7 | **3** | 5 | 8 | 6 | 8 | 6,4 | 8 | 6 → 5 † | **7,2** | La única con `<EncabezadoPagina>` (otra cabecera que las demás diez); el ciego 2 pidió aquí sin ayuda; el precio sale «0.00» (placeholder, MATIZADO) y no se precarga del último lote; «Generada» sin un «Enviar al proveedor». |
| F · Proveedores (`/produccion/proveedores`) | 6 | 6 | 6 | 5 | 5 | 7 | 6 | 6 | 5,9 | 6 | 6 → 5 † | **5,9** | La fila abre la ficha de edición (el ciego 2 buscaba la deuda; MATIZADO); la nota `:182` promete un saldo que nunca calcula; «—» 2,85:1 × 3; 6 blancos < 32; el rubro «maquila» existe y ninguna etapa lo usa. |
| G · Facturas de insumos (`/produccion/comprobantes`) | 6 | 6 | 5 | 5 | 5 | 6 | 5 | 6 | 5,5 | 5 | 6 → 5 † | **5,3** | La maquila entra como «Otro concepto» tecleado, sin vínculo factura ↔ orden ↔ etapa; 2 primarias y 10 botones; sin guía de foco (pendiente del tablero). |
| H · Recibir (`/produccion/recibir`) | 7 | 7 | 6 | **3** | 5 | 6 | 7 | 7 | 6,0 | 6 | 6 → 4 (3) | **6,0** | «Todo lo facturado ya llegó» es falso en el primer uso; hay dos «Recibir» (decisión escrita de Felipe del 2026-10-03: MATIZADO, no sobra); un solo botón; «de 200 m» 4,45:1. |
| I · Por pagar (`/produccion/por-pagar`) | 6 | 7 | 6 | 6 | 5 | 7 | 5 | 7 | 6,1 | 5 | 6 → 5 (4) | **5,6** | La deuda total de CAYLA y el IGV dentro del Por pagar del Taller; 13 tamaños de texto; montos sin alinear (`− S/ 0.00` a 1 311 vs 1 313 px); alto 1 290 px; sin guía de foco (pendiente). |
| J · Eficiencia (`/produccion/eficiencia`) | 6 | 5 | **3** | 5 | 4 | 8 | 5 | 5 | 5,1 | 6 | 6 → 5 † | **5,6** | El nombre de una migración y «Dynamic/admin» en pantalla (MATIZADO); la fórmula cruda; 19 contrastes (`text-xs` 4,45:1, «—» 2,80:1); 0 primarias; el primer dato a 470 px (494 a 1024). |
| K · Cotizaciones de maquila (`/produccion/cotizaciones-maquila`) | 7 | 6 | 6 | 5 | 5 | 6 | 7 | **4** | 5,8 | 6 | 6 → 3 (2) | **5,9** | Huérfana: fuera del menú a propósito y sin lector (`fn_cotizacion_maquila_vigente` sin llamadores), 0 filas en producción; sin h1 ni cabecera del módulo; «(D-31)» en la bajada. Es la vista más limpia del script porque casi no tiene nada. |

[Medido] a 1024 × 768 los conteos son iguales o peores en todas (Facturas 7 → 6 †; Insumos y Por pagar bajan a 4 porque la nota de la guía deja de verse). En oscuro (Resumen, Órdenes y la hoja) los conteos son los mismos que en claro salvo contrastes que mejoran (Resumen 4 → 1, Órdenes 7 → 4, hoja 12 → 5).

## Los 3 cambios de mayor impacto

Son los tres que más suben las leyes que están en 2 y 3, y los tres se pueden verificar con el mismo script y los mismos ciegos en el «después». El rediseño (ADR-0400) es el vehículo natural; aquí no se dice cómo lo hará, solo qué tiene que medir distinto. **Ninguno se hace sin el OK de Felipe.**

1. **La prenda y su tela, a la vista en Órdenes y en el cajón.**
   **Antes →** la tarjeta de la orden es texto (`OrdenTarjeta.tsx:74`), el color es un punto de 10 px (`MatrizOrden.tsx:57`), la tela nunca tiene cara; `prendaVisible = false` en 10 de 11 vistas. **Después →** cada orden empieza por `<MiniaturaPrenda>` / `<FotoDePrenda>` de 48 px o más con `colorHex` y `{...categoriaDe(fila)}` (ADR-0333), y la tela con una muestra al lado; el texto solo confirma. **Leyes:** 5 (Órdenes de 2), 1, 2. **Cómo se verifica:** `prendaVisible = true` y `prendaEnViewport ≥ 1` en `/produccion/ordenes` y en `?orden=` a 1440 y 1024; el ciego nombra el modelo de una tarjeta sin leerla. **Esfuerzo:** M. **Quién decide:** Felipe (presentación). No toca dinero, stock, permisos ni SUNAT. [Opinión del revisor, confirmada en el código por el escéptico #12]
2. **El veredicto arriba, el cálculo bajo «¿Por qué?», y que el veredicto de tela cuente lo que ya se pidió.**
   **Antes →** el Resumen dice «Faltan 32.3 m» aunque OI-000001 y OI-000002 ya piden 155 m (`produccion-decisiones.ts:450-479`, `:523-531`; ADR-0362 f7 «sin construir»); su botón lleva a «Registrar el comprobante» (`:478`) y nada lleva a `/ordenes-insumos/nueva`; el nombre de la etapa y el lote PEPS viven en hover; Eficiencia muestra la fórmula. **Después →** cada cifra o asunto tiene su «¿Por qué?» a un toque (nunca solo con hover, nunca en `title`), el asunto «Falta lino» dice «pedido en camino: 155 m, llegan el 21/10» y su botón lleva a pedir. **Leyes:** 3, 6 (Órdenes de 3), 9. **Cómo se verifica:** `grep` sin `title=` que explique en `components/*Produccion*` y `components/orden-produccion/`; el ciego 2 repetido ve el Resumen cambiar después de guardar la orden de insumos. **Esfuerzo:** M. **Quién decide:** qué cuenta como «por llegar» (una orden «Generada», una recibida en parte) es **regla de stock e insumos: OK obligatorio de Felipe**; el «¿Por qué?» es presentación. [Observado por el ciego 2; CONFIRMADO por el escéptico #3 y #7]
3. **El vocabulario del Taller, escrito una vez y vigilado con una prueba.**
   **Antes →** 25 palabras que los dos ciegos no entendieron (lista textual abajo), 10 de 11 términos del revisor confirmados; una migración SQL con nombre en pantalla; «(D-31)» en una bajada. **Después →** una lista corta de palabras de tienda por concepto (lo que hoy se llama maquila, corrida, avíos, insumos, comprobante, Generada, Capital en insumos, Valor en proceso) que Felipe aprueba, en `lib/produccion-vocabulario.ts`, y una prueba que falla si un componente de Producción vuelve a mostrar una palabra de la lista de jerga (como hace `lib/sin-foto.test.ts` con el isotipo); el aviso técnico de Eficiencia pasa a tres líneas de tienda. **Leyes:** 4 (Eficiencia de 3), 1, 9. **Cómo se verifica:** la prueba en el CI; el ciego repite cada texto con sus palabras y la columna «Palabras no entendidas» baja a 0. **Esfuerzo:** M (texto) + S (prueba). **Quién decide:** Felipe elige las palabras (lenguaje); la investigación anota que en Lima el oficio dice «servicio», no «maquila» [externo, sin verificar]. [Opinión, sobre lo Observado en las dos ciegas]

## Lo que sobra (ley 8)

Se propone esconder o quitar de la vista; nunca borrar datos. Lo que es decisión escrita de Felipe se anota y no se toca.
- **Dos cabeceras:** Órdenes de insumos usa `<EncabezadoPagina>` (h1 de 46 px) y las otras diez una cabecera a mano (H-E1 CONFIRMADO). Una sola.
- **Dos consejos a la vez** en la hoja Nueva orden (H-C3, sin veredicto del escéptico).
- **El mismo costo en tres lugares** (la barra de la hoja, el cajón, el cierre) y el **chip de margen junto al medidor con leyenda**: una sola lectura del margen.
- **«Capital en insumos» dos veces** (Resumen e Insumos).
- **Terminadas plegadas y Anuladas abiertas** en el tablero: lo que menos importa está a la vista.
- **La deuda total de CAYLA y el IGV** dentro del Por pagar del Taller (H-I1 CONFIRMADO, gravedad 4): es de dirección, no del Taller; su lugar es Finanzas.
- **Cotizaciones de maquila**: sin menú, sin lector, 0 filas (H-K1 CONFIRMADO). Hoy no ayuda a decidir nada.
- **Las bajadas que explican D-H** («directorio aparte del de Compras») en cinco pantallas: explican una decisión interna a quien solo quiere pedir tela.
- **Dos acciones primarias** en la cabecera de Insumos y de Facturas [Medido]; **tres** en el cajón de la orden [Medido].
- **«Eres admin…»** en dos líneas dentro del cajón [Medido]: un aviso de permiso donde debería estar la prenda.
- *No sobra, aunque se parezca:* los dos «Recibir» (Ingresar insumo sin papel y Recibir contra factura) son una decisión de Felipe del 2026-10-03 (H-H2 MATIZADO).

## Lo que no pediste y importa más

**La etapa es un bit.** `etapas` es un `jsonb` `{etapa: pendiente | hecho | tercerizado}` con tres etapas fijas escritas en el código (`produccion-reglas.ts:28`) y en el `if` de `set_etapa_produccion`; «tercerizado» es una palabra: no sabe a quién, cuántas prendas, desde cuándo ni a cuánto, y la base acepta `acabado = hecho` con `corte = pendiente` y sin tela descontada (escéptico #4 y #12, CONFIRMADOS, gravedad 2; «el candado debe vivir en la base»). Por eso el ciego 1 no pudo decir «la costura la hace Confecciones del Norte» en ningún lado y lo escribió en la Nota. **Todo lo que Felipe pidió el 13-oct (elegir tela, colores y tallas, tercerizar el corte o la costura al abrir, ver el avance) cuelga de que la etapa sea un registro qué · cuánto · quién · cuándo · a cuánto: es modelo de datos del núcleo del Taller y es de Felipe.** [Medido, código y base]
*(Segundo, también de Felipe porque es dinero: el costo que se teclea al abrir se vuelve el costo real de la prenda si nadie lo corrige al cerrar, `cerrar_produccion` hace `coalesce`; el estimado y el real son la misma columna.)*

## Lista aparte (no se ejecuta)

Ordenada por gravedad (1 estado imposible · 2 dato malo en silencio · 3 pantalla o camino roto · 4 feo pero seguro), cada una con el veredicto del escéptico. No se hace nada de aquí sin que Felipe lo mande.

**Confirmados y matizados**
1. **Deshacer no deshace desde un cajón** (ciego 1). CONFIRMADO con otra causa, gravedad 3: el aviso dura 4 s y se monta ~0,9 s tarde (`Avisos.tsx:78,225-229`); con un `Dialog` modal abierto cualquier clic sobre el aviso cierra el cajón y solo deshace si cae dentro de la caja real del botón (`avisos.css:68-69`). **Pieza del sistema (Avisos + cajón Radix): se arregla hoy, no lo absorbe el rediseño**, y afecta a todo Deshacer disparado desde un cajón o una hoja en el ERP.
2. **«¿Alcanza la tela?» no cuenta las órdenes de insumos generadas** (ciego 2). CONFIRMADO, gravedad 2, hueco no decidido (`produccion-decisiones.ts:450-479`, `:523-531`; ADR-0362 f7).
3. **«Corte hecho» sin tela descontada** (H-B3). CONFIRMADO en la web (`OrdenPanel.tsx:103-144`) y en la base (`set_etapa_produccion` no valida consumos ni el orden entre etapas), gravedad 2.
4. **La prenda ausente en Órdenes; la etapa es un bit; el nombre de la etapa solo en hover** (H-B1, H-B2, H-B5). CONFIRMADO, gravedad 2/3 (`produccion-reglas.ts:28`, `OrdenTarjeta.tsx:74,93`, `MatrizOrden.tsx:57`).
5. **«Faltan N m» lleva a «Registrar el comprobante»** y nada lleva a `/ordenes-insumos/nueva` (ciego 2). CONFIRMADO, gravedad 3 (`produccion-decisiones.ts:478`).
6. **Cotizaciones de maquila huérfana** (H-K1). CONFIRMADO, gravedad 3: 0 llamadores de `fn_cotizacion_maquila_vigente`, fuera del menú a propósito, 0 filas.
7. **Quien no es líder es redirigido sin explicación** en el Resumen (H-A2). CONFIRMADO, gravedad 3.
8. **El vacío de Órdenes dice «ya se cerró» en el primer uso** (H-B4, `OrdenesTablero.tsx:156-165`). CONFIRMADO, gravedad 3.
9. **Dos acciones primarias compiten en el cajón** (H-B6). CONFIRMADO, gravedad 3 ([Medido] el script cuenta 3).
10. **Dos verbos de alta en Insumos** (catálogo vs lote, H-D1). CONFIRMADO, gravedad 3.
11. **Otra cabecera en Órdenes de insumos** (H-E1). CONFIRMADO, gravedad 3.
12. **El rubro «maquila» del proveedor existe y ninguna etapa lo usa** (H-F1). CONFIRMADO, gravedad 3.
13. **La maquila entra como «Otro concepto» tecleado**, sin vínculo factura ↔ orden ↔ etapa (H-G1). CONFIRMADO, gravedad 3.
14. **«Todo lo facturado ya llegó» es falso en el primer uso** (H-H1). CONFIRMADO, gravedad 3.
15. **Vocabulario fuera de tienda**: CONFIRMADO 10 de 11 (#13); «Precio a tienda (c/u)» está en `ModeloNuevoCampos.tsx:118`, pieza compartida con Nuevo producto (MATIZADO).
16. **La fila de Proveedores abre la edición y no muestra deuda** (ciego 2). MATIZADO, gravedad 4: la deuda por proveedor sí existe en Por pagar y Facturas filtra; agravante: `ProveedoresProduccionPanel.tsx:182` promete un saldo que nunca calcula.
17. **El precio de la orden de insumos sale «0.00»** (ciego 2). MATIZADO, gravedad 4: es un placeholder; cierto que no se precarga del último lote o pedido.
18. **El tablero a 1024 scrollea de lado con la 3.ª columna cortada.** CONFIRMADO por diseño, gravedad 4 (`grid-flow-col overflow-x-auto`; `min-[1240px]:grid-cols-4`).
19. **Blancos menores de 24 px en el cajón** («Reabrir» 37,8 × 17,3; «Devolver al estante» 116,7 × 19,5 × 2). MATIZADO, gravedad 4: botones sueltos sin otro objetivo a 12 px, pasan WCAG 2.5.8 y fallan el objetivo de la casa (32 px).
20. **El nombre de una migración SQL y «Dynamic/admin» en Eficiencia** (H-J1, `EficienciaTallerPanel.tsx:73,78`). MATIZADO, gravedad 4: sale ante cualquier error de `planilla_por_sede` (`lib/eficiencia.ts:28`), y la vista ya está en producción.
21. **La deuda total de CAYLA y el IGV dentro del Por pagar del Taller** (H-I1). CONFIRMADO, gravedad 4.
22. **Dos «Recibir»** (H-H2). MATIZADO, gravedad 4: decisión escrita de Felipe del 2026-10-03; se anota, no se cambia.

**Lo que nadie vio (lo trajo el escéptico)**
- Un «Deshacer» viejo resucita con reloj nuevo en cada guardado (`Avisos.tsx:225-229`): dos DESHACER a la vez y el primero vuelve a aplicar un estado viejo. [Medido, código]
- Cualquier clic en un aviso cierra un cajón abierto: afecta a todo Deshacer desde cajón u hoja, en todo el ERP. [Medido, reproducido]
- `set_etapa_produccion` no impone orden entre etapas: el candado debe vivir en la base, no en la pantalla. [Medido, base]
- `ProveedoresProduccionPanel.tsx:182` promete un saldo que nunca calcula. [Medido, código]
- Nueva orden ya tenía informe Formidable (10-oct): por eso aquí es re-análisis y no una nota nueva.

**Sin veredicto del escéptico (quedan como Opinión del revisor, con su archivo)**
- H-A1 (2) el Resumen no tiene «¿Por qué?» como toque · H-A3 / H-D2 (3) la tela no tiene cara · H-A4 (4) cabecera, tabla y vacíos a mano en el Resumen · H-B7 (4) cajón, tabla y cabecera a mano en Órdenes, con 4 rojos o más · H-C1 (3) la hoja no pregunta tela, etapa afuera ni proveedor (lo respalda ADR-0396, que lo dejó «abierto») · H-C3 (4) dos consejos a la vez · H-D3 (4) el lote PEPS solo en hover · H-E2 (4) `<table>` a mano en Órdenes de insumos · H-J2 (4) la fórmula cruda en Eficiencia.

**Del tablero de las otras skills (no se repiten aquí):** `/focus`: guía de foco solo en `/produccion/ordenes` y `NuevaOrdenProduccionForm`; pendientes con campos `/comprobantes` y `/por-pagar`; 9 modales sin guía (`InsumoModales` 18 controles, `ProveedorProduccionModal` 13, `ComprobanteProduccionForm` 13…). `/sugerir`: 22 ejemplos estáticos (`InsumoModales` 4, `ProveedorProduccionModal` 7…). Rendimiento: 9 pantallas sin streaming; `/ordenes` carga 15 archivos y 3 643 líneas de cliente con los modales siempre montados. [Medido, escáneres]

## Refutados (con la razón)

- **`?nueva=auto` muerto** (H-A5 / H-C2, gravedad 4 del revisor). REFUTADO: la hoja sí se abre (`page.tsx:80`, `OrdenesTablero.tsx:69`); solo el comentario de `:56` quedó viejo. Sale de las notas de Resumen y de Nueva orden.
- **«La hoja Nueva orden sale clara sobre la pantalla oscura»** (medidor). REFUTADO: la captura `produccion-ordenes-nueva-orden-1440-oscuro-viewport.png` es oscura (papel oscuro, texto claro; lo miré yo también); los 5 contrastes que quedan en oscuro son los contadores `titulo-grupo-cuenta` del sistema. No hay que correr `tema:auditar` por esto.
- **«6 de 8 fallan» en todas las vistas** (medidor). REFUTADO como cifra de las pantallas: están infladas por el chrome global y por dos comprobaciones que el script no puede aprobar nunca (radios con `rounded-full`, versalitas de 11 px). La tabla por pantalla trae el recuento sin chrome.

## Prueba ciega

Dos ciegos, el modelo de la sesión (Opus cayó por el falso positivo `reasoning_extraction`), sobre la base local con la semilla «ZZ Prueba», entrando como líder y Admin en el Taller. *Herramientas declaradas:* solo el navegador. **Real: sin probar** (3 a 5 colaboradoras del Taller, en su equipo).

**Ciego 1 · «Que el Taller haga 50 blusas Marina en blanco y negro, S-M-L; el corte en casa y la costura afuera, con Confecciones del Norte. Después, ¿en qué paso va el pantalón y para cuándo?»**

| Medida | Resultado | ¿Pasa? |
|---|---|---|
| Lectura de 5 s | «pantalla de avisos del Taller: qué falta o está pendiente; para registrar un pedido hay que apretar Nueva orden» (en el Resumen). No entendió de inmediato que «orden» = «pedido» | **sí**, con esa duda |
| Primer intento | el pedido quedó (orden 6, 50 prendas, Por cortar) · la costura afuera **solo como texto en la Nota** (1 intento: no hay dónde marcar la etapa ni el taller) · el paso del pantalón sí (Corte ✓, Confección «Con maquila externa», Acabados pendiente) · la fecha sí (23/10, sin año) | **a medias** |
| Pasos | 23 clics · 4 pantallas + 3 hojas · 2 retrocesos | no se midió el mínimo |
| Dudas (palabra textual) | «Blusa Marina» vs «Zz Prueba Blusa Marina» (eligió el existente) · el reparto de 50 (inventó 8-9-8) · la fila Arena en 0 · «dónde anotar costura afuera» (la caja «Maquila S/» pide un monto → usó la Nota) · fecha, Tela y Avíos vacíos · «¿Enviar a maquila es la forma?» · «Eres admin» con Cerrar al inventario y Anular a la vista | no |
| Palabras no entendidas | maquila / Enviar a maquila / Maquila externa · corrida · avíos · Lote vs Muestra · insumos / Sin insumos / Insumos descontados / Descontar al cortar · Curva sugerida por la red · motor de demanda · Cubrir 30 días · Al filo 46 % · Gana 81 % · Margen promedio (pasó de largo) · «Abrir orden» = guardar · «Zz Prueba» | no (la tabla pide cero) |
| Errores evitables | 1: marcó «Enviar a maquila» en el corte (la etapa equivocada: el botón está bajo Corte y no pregunta etapa ni taller) y tuvo que «Traer de vuelta» | no |

Cosas que tocó y no hicieron lo esperado: «Producción» en el menú solo despliega; «Enviar a maquila» no pregunta etapa ni taller; «DESHACER» del aviso no revirtió (Corte siguió «Con maquila externa»); «+ Nueva orden» desde el Resumen cambia de pantalla. Antes de empezar tuvo que cambiar de sede al Taller: Producción no estaba en el menú. Efecto en la base: la orden 6 (sumar a la limpieza).

**Ciego 2 · «¿Alcanza el lino para esta semana? Si falta, pídelo al proveedor. Y ¿a quién le debe el Taller y cuánto?»**

| Medida | Resultado | ¿Pasa? |
|---|---|---|
| Lectura de 5 s | «tablero del Taller que me dice qué tengo que resolver hoy»; vio las 4 cifras y «Para decidir · 2 asuntos: Faltan 32.3 m de lino…»; entendió que las tarjetas llevan a resolver cada asunto | **sí** |
| Primer intento | alcanza: sí (no alcanza) · pedir: sí (OI-000002, 35 m, S/ 700) · deudas: sí, **al 2.º intento** (S/ 4 160: Confecciones del Norte 1 350 + Textiles Andinos 2 810; primero fue a Proveedores, que no la muestra) | **sí**, el tercero al 2.º intento |
| Pasos | 20 clics · 6 pantallas + 2 hojas · 3 retrocesos | no se midió el mínimo |
| Dudas (palabra textual) | «Registrar el comprobante» en la tarjeta «Faltan lino» (no lo tocó: «suena a factura, no a pedido») · Órdenes de insumos vs Proveedores · si los 120 m de OI-000001 ya cuentan · cuál proveedor vende lino (el combo no dice el rubro) · cantidad y precio (inventó 35 y 20) · «esta semana» vs «órdenes abiertas» · a quién se debe: Proveedores (no) → Facturas (sí) · el estado «Generada» sin un «Enviar al proveedor» | no |
| Palabras no entendidas | insumos · comprobante · facturado / facturados por recibir · Generada · Capital en insumos · Valor en proceso · maquila · Lotes recibidos · IGV incluido / sin IGV (usó «Saldo») · «Parcial · vence en 18 d» · «Piden se calcula con el consumo real medido…» | no (la tabla pide cero) |
| Errores evitables | 1: buscó la deuda en Proveedores y la fila le abrió la ficha de edición (salió con Escape) | no |

Cosas que tocó y no hicieron lo esperado: la fila de Proveedores abre la edición (esperaba el saldo); el Resumen no cambia después de pedir (esperaba «pedido en camino»; siguió «Faltan 32.3 m» aunque ya había 155 m pedidos); el precio por metro no se precarga del pedido anterior. Efecto en la base: la orden de insumos OI-000002 (sumar a la limpieza).

## Antes de decir «listo»

- **Concurrencia:** en esta corrida no se atacó. Lo heredado de `/chaos` del 2026-10-10 sobre Nueva orden: con dos sesiones y el mismo nombre la segunda espera y recibe «Ya existe» (1 modelo, 1 orden; NAV-05); un reintento con el mismo token devuelve la misma orden; los 8 hallazgos de esa pantalla están cerrados y queda 1 de gravedad 2 del núcleo (un costo `NaN` directo a `abrir_produccion` y los CHECK `>= 0`: es de Felipe). Órdenes de insumos tuvo su caos chico (doble clic con el mismo id y dos sesiones editando a la vez, `pruebas:ordenes-insumo`, sin hallazgos). **Nuevo, sin probar con dos cuentas:** `set_etapa_produccion` no impone orden entre etapas ni mira la tela (#4), y dos «Deshacer» pueden quedar vivos a la vez (Avisos). Las otras nueve pantallas que guardan no tienen `/chaos`.
- **Caída externa:** **no probada** en esta corrida (sin red, sin base). Heredado de `/chaos` RS-01 y RS-03 en Nueva orden: sin red conserva lo escrito y no duplica; el mensaje «No se guardó nada» es falso cuando la base sí guardó (`error-escritura.ts:661`, traductor compartido). Producción no habla con SUNAT ni con Lucode.
- **Persona sin contexto:** dos ciegos ✓ (con las salvedades de arriba: líder y Admin, modelo de la sesión) · **colaboradora real del Taller: sin probar.**

## Lo que sigue

Este informe es el «antes». El módulo entra a rediseño por decisión de Felipe del 2026-10-13 (ADR-0400, reservado; preguntas abiertas en la investigación). Cuando el rediseño tenga una pantalla, se mide contra esta línea base **al mismo ancho (1440 × 900 y 1024 × 768), con la misma semilla y las mismas dos tareas de los ciegos**, y se agrega una fila al historial; los 3 cambios de arriba son lo primero que el «después» tiene que mostrar distinto. Lo que no espera al rediseño porque es del sistema: el Deshacer desde un cajón (lista aparte, #1). Lo que es de Felipe porque es modelo de datos o dinero: la etapa como registro y el costo estimado que se vuelve real.

## El «después» · 2026-10-15 · SHA `954e8c3c0` (rama `claude/production-module-redesign-136cca`, ADR-0400)

- **Veredicto en una línea:** «Sube, pero no llega a lo prometido: Órdenes y La orden son otra cosa (7,4 contra 4,6 del cajón), la costura afuera por fin se marca con su proveedor y su tarifa, y el Resumen sigue diciendo "Faltan 146.5 m" junto a 155 m pedidos, tanto que la ciega 2 no se atrevió a guardar el pedido.» La ADR-0400 pedía el módulo por encima de 7,5 y las leyes 5 y 6 por encima de 7: **no se cumplió**.
- **⚠ Corrección del 2026-10-16: esta medición es de una rama a 758 commits de `main`.** Al preparar los arreglos se vio que `main` ya cambió dos cosas de las que depende este informe: (1) **la recepción de las órdenes de insumos** (ADR-0362, ya en producción): H1 asumía que una orden de insumos no se liga a lo recibido, y ahora sí se liga, así que el cambio 1 ya no es «cambiar el texto» sino calcular lo que de verdad viene en camino; (2) **los candados `*_montos_finitos` de las tablas** (ADR-0409, ya en producción): el `NaN` del /chaos queda cubierto y no hace falta migración. Las notas de arriba valen para el SHA medido; el «después» sobre la rama ya fusionada con `main` se midió el 2026-10-16 (sección «Cambios aplicados» más abajo).
- **Escala (Felipe eligió «medio», 4 agentes):** ① medidor (Playwright, 13 vistas × 2 anchos, `medidas.json`) · ② **dos ciegos con Haiku** (Sonnet 5.5 cayó 3 veces por el filtro `reasoning_extraction`) · ③ revisor de leyes (código y capturas) · ④ escéptico (código, capturas y base local, solo lectura). **Salvedad de los ciegos:** su contexto traía CLAUDE.md y la memoria (se adjuntan solos a todo subagente) y entraron como líder y Admin, así que son **Observado de capacidad y de texto**, no una colaboradora real. **Ciega: pasa con salvedades · real: sin probar.**
- **Datos:** la misma semilla «ZZ Prueba». Ojo: 5 de las 8 filas de Órdenes son **órdenes de antes de las fases** (OP-1, 3, 4, 5, 6) y los ciegos anteriores dejaron la OI-2 (35 m) y un pedido; eso infla el «155 m» y el «cortado a media palabra» de la lista. `producto_fotos` tiene 0 filas: ninguna pantalla puede mostrar una foto aquí.

### Notas

| Eje | Antes | Después | Evidencia |
|---|---|---|---|
| Leyes 2–9 (las mismas 10 pantallas) | 5,6 | **6,1** | [Medido, código y capturas] el salto lo dan dos pantallas nuevas (Órdenes 7,4 y La orden 7,4, contra 4,6 del cajón); de las otras ocho solo Insumos sube de verdad (+1,0). Cotizaciones no se repuntuó. |
| 1 Sin manual | 5 | **5** (provisional; sin cambio) | [Observado] el ciego 1 terminó lo que antes no podía (costura afuera con proveedor y tarifa) en 14 clics y 0 retrocesos; el ciego 2 **no cerró** la tarea de pedir. Nadie llegó a cero dudas (cada uno anotó más de 12). Los clics 23→14 y 20→13 **no se comparan**: otro modelo, n = 1, otra base. |
| 5 Contenido primero | 4,4 | **5,0** | [Medido] la prenda sigue sin foto en Órdenes y en La orden (`fotoUrl={null}`); la tela, sin cara fuera de Insumos. |
| 6 Lo difícil, a un toque | 4,6 | **5,3** | [Medido] «¿Por qué?» ya es un toque en Órdenes y La orden; el Resumen sigue con su fórmula abierta. |
| **Oficio visual** | 4,4 | **4,8** | [Medido] 10 × comprobaciones que pasan / 6, descontando el chrome global y 2 que ninguna pantalla puede pasar. **Todo el +0,4 viene de Órdenes y La orden; las otras nueve van de 4,82 a 4,82.** No es comparable con el 5,6 «(código)» del Historial (otra escala). El medidor da por falso el texto crema sobre su píldora de pestaña (1,05–1,10:1, en 6 de 13 vistas): está descontado y escrito aquí. |

**Dos leyes bajaron:** Resumen ley 5 (6 → 5) y Nueva orden ley 8 (5 → 4). Los 3 cambios de la línea base quedaron **parciales los tres**: (1) la prenda tiene mosaico pero no foto y la tela sigue sin cara; (2) veredicto y «¿Por qué?» en Órdenes y La orden sí, en el Resumen no; (3) el vocabulario vigilado cubre solo 6 frases y «maquila», «ADR-0117», «Capital en insumos» siguen en pantalla.

| Pantalla | Leyes antes → después | Oficio (fallan de 6 · nota) |
|---|---|---|
| A Resumen | 5,5 → 5,5 | 3 · 5,0 (igual) |
| B1 Órdenes (lista) | 4,6 → **7,4** | 3 · 5,0 (antes, tablero: 5 · 1,7) |
| B2 La orden (página) | 4,6 → **7,4** | OP-343: 5 · OP-364: 3 → 3,3 (antes, cajón: 6 · 0) |
| C Nueva orden (hoja) | 6,0 → 6,1 | 5 · 1,7 (igual) |
| D Insumos | 5,3 → **6,3** | 4 · 3,3 (antes 3 · 5,0) |
| E Órdenes de insumos | 6,4 → 6,4 | 3 · 5,0 (igual) |
| F Proveedores + Servicios y tarifas | 5,9 → 6,1 | 3 · 5,0 (igual) |
| G Facturas | 5,5 → 5,6 | 3 · 5,0 (igual) |
| H Recibir | 6,0 → 6,1 | 2 · 6,7 (igual) |
| I Por pagar | 6,1 → 6,1 | 2 · 6,7 (antes 3 · 5,0) |
| J Eficiencia | 5,1 → 5,4 | 3 · 5,0 (igual) |

### Lo que cerró de verdad
La etapa ya no es un bit (fases con su quién); la cabecera es una sola (`EncabezadoPagina`); el vacío de Órdenes dice la verdad en el primer uso; quien no ve Producción recibe una frase y no un redirect mudo; dos primarias menos (Insumos y Facturas); «Faltan N m» ya no lleva a registrar una factura sino a «Ver los pedidos»; Recibir no dice «Todo lo facturado ya llegó» sin haber facturado; sin scroll de lado a 1024 px en las pantallas nuevas.

### Lo que dijo el escéptico (cada hallazgo, con prueba)

| # | Hallazgo | Veredicto | Grav. | Lo que queda |
|---|---|---|---|---|
| H1 | «Faltan 146.5 m» contradice los 155 m pedidos | **MATIZADO** | 3 | No es una contradicción lógica: 146.5 = necesita − estante − facturado, y 155 son pedidos de 60 días sin vínculo con la recepción (no existe columna orden de insumos ↔ lote; sumarlos contaría doble: ADR-0400 (g)). **Es un defecto de texto**, y el ciego 2 lo sufrió: su única guía, «Si ya llegaron, anótalos en Recibir», choca con los datos (OI-1 dice «llega el 21 oct»; el último lote de lino entró el 13-oct, antes de ambos pedidos). |
| H2 | Un lote entra al stock con costo sin tela | **CONFIRMADO, reproducido en la base** | 2 | OP-343 se cerró con la tela sin anotar: las 6 variantes entraron a **S/ 4.50 (solo la costura afuera)**, sin aviso de costo atípico. `revertir` devolvió el stock pero **`variantes.costo` se quedó en 4.50**, y el siguiente cierre honesto (S/ 22.38) saltará como atípico. Matices: «Terminé» precarga la tela (no es el camino por defecto), y el costo 0 sí lo frena `fn_costo_fuera_de_banda`; lo que no frena es el primer lote de cada modelo. Dinero, todas las sedes: **de Felipe**. |
| H3 | «La tela no alcanza» en rojo con las 3 fases hechas | **CONFIRMADO (falso positivo)**, otra causa | 3 | No falta anotar: la tela sí estaba anotada (plan 75.6 m, usado 44 m, corte 48/48); sobra plan. `filasDeTela` usa `max(plan − usado, 0)` sin mirar las fases (`orden-pagina-reglas.ts:667`, `:773`). Se propaga a «Piden algo 1», «1 sin tela» y al «1 pide algo» del Resumen: **la única orden en rojo del Taller es falsa**. Regla correcta: tela cortada = nada por usar (los avíos sí pueden faltar). |
| H4 | La tabla de Servicios y tarifas se rompe a 1024 px | **CONFIRMADO y peor** | 3 | El servicio recibe 80 px a 1280, 166 a 1366 y 240 a 1440. Causa: `sm:` en vez de `@min-[…]` (`ServiciosYTarifas.tsx:19-21`). |
| H5 | Nueva orden pone el consejo de la red antes de Fases | **CONFIRMADO, alcance menor** | 4 | Solo líder (`page.tsx:87`), solo con modelo existente, y en la captura está vacío («Nada que fabricar») ocupando ~290 px. Reordenar no es la cura: la sugerencia alimenta «Cuántas» y los metros de la tela dependen del total. |
| H6 | Sin foto de la prenda ni muestra de tela | **MATIZADO** | 3 (en producción) | Hueco real (`FilaDeOrden.tsx:39`, `FichaDeLaOrden.tsx:18`), no contradice ninguna decisión (ADR-0333 solo dice cómo se dibuja SIN foto) y **no es observable aquí**: 0 filas en `producto_fotos`. La ganancia «ley 5 a ~6,5» era una cifra inventada. |
| H7 | «Hoy en el Taller» duplica Órdenes; el capital no pide decisión | **MATIZADO: decisión escrita** | 4 | Está en ADR-0400 §Pantallas 5 y act. (g), en la investigación y en la elección de Felipe («A · Lista con Hoy en el Taller»). No se corrige: se pregunta. |
| H8 | El cajón viejo (~1 270 líneas) se puede retirar | **MATIZADO** | 4 | Solo `OrdenesLista.tsx:7,293` lo abre y únicamente para órdenes sin fases (5 en la base local). Sin él, esas órdenes quedan en un círculo sin salida (`RutaDeFases.tsx:49`). **Producción: `retail.producciones` tiene 0 filas (consulta de solo lectura del 2026-10-15)**, así que al desplegar no hay nadie que lo necesite; va en un PR aparte, después del despliegue y volviendo a contar. |
| H9 | Las pruebas ciegas valen | **MATIZADO** | — | Valen para los 5 s, la costura afuera marcable y la parálisis del ciego 2. No valen para la nota de la ley 1, para comparar clics, ni para medir jerga (Haiku con CLAUDE.md sobre-reporta «IGV», «lote»). |
| H10 | Oficio 4,4 → 4,8 | **MATIZADO** | — | Recalculado: 4,76 contra 4,40, consistente con `oficio-visual.md`; seis comprobaciones, cada falla vale 1,67 puntos. |
| H11 | Blancos < 24 px y contrastes bajos | **MATIZADO** | 4 | Nuevos de esta rama: «¿Por qué?», «Deshacer», «Anular», «Cambiar quién», «Cambiar», «Ver el capital» y tres textos tenues («Sin color» 3,82:1, «Sin fijo» 2,85:1, «Sin ventas medidas…» 4,35:1). Heredados: `EnlaceVer`, `Ayuda`, «Salir» y los ocho «—» a 2,8:1. La raíz de los blancos es `.btn-enlace` con `padding: 0` (`globals.css:487`): una pieza compartida. |

**Hallazgos nuevos del escéptico:** (1) el estimado de costo se hunde cuando se gasta la tela (`20261015160000…sql:476-492`: tela estimada = plan × costo del lote con saldo, y sin saldo vale 0), por eso OP-343 dice «S/ 1,074.00 de S/ 216.00»; (2) `revertir_produccion` deja contaminado `variantes.costo`; (3) «Pedir 31.6 m» promete una cantidad que el enlace no lleva; (4) «Anular» en la línea de tiempo es un enlace neutro mientras la tabla de piezas manda `btn-peligro` para anular; (5) `/ordenes-insumos` está fuera de `SIN_TOPE_DE_ANCHO` (`AppShell.tsx:663`); (6) la guía de «Nueva orden de insumos» lista «Faltan: … Entrega estimada» y luego dice «puedes seguir así» (rompe la regla 5 de ADR-0284).

### Prueba ciega del «después»

| | Ciego 1 · 50 blusas Marina, corte en casa, costura afuera; después, el paso del pantalón | Ciego 2 · ¿alcanza el lino?, pedirlo si falta, ¿a quién le debe el Taller? |
|---|---|---|
| 5 s | «Resumen del Taller; para hacer una orden toco NUEVA ORDEN» ✓ | «Resumen: Para decidir con 2 asuntos, cada uno con su botón» ✓ |
| Resultado | **Terminó**: Corte en el Taller, **Costura Afuera con Confecciones del Norte a S/ 4.50 de su lista**, Acabado en el Taller. 14 clics, 0 retrocesos (antes 23 y 2). El pantalón lo contestó con OP-5, una orden **de antes de las fases** | **Alcanza: sí (no alcanza). Deudas: sí (S/ 4 160, comprobó la suma). Pedir: armó el pedido (146.5 m, S/ 2 930) y NO lo guardó**, por el «155 m» de al lado. 13 clics, 0 retrocesos (antes 20 y 3) |
| Lo que no entendió | «Curva sugerida por la red», «motor de demanda», «Cubrir 30 días»; la tarifa que se llena sola en gris parece bloqueada; «Fijo por orden (ponchado, matriz)» | «Si ya llegaron, anótalos en Recibir» (qué es Recibir); «Faltan: … Entrega estimada» y luego «puedes seguir así»; escribió sin campo enfocado |

Pendiente de la línea base **sin verificar**: que el Resumen cambie después de pedir (el ciego 2 no guardó).

## Los 3 cambios de mayor impacto (versión final, con lo que corrigió el escéptico)

El revisor propuso (1) foto y muestra, (2) el Resumen con su porqué, (3) Nueva orden con Fases antes del consejo. El escéptico dejó el 2 con la evidencia más fuerte, el 3 con evidencia media y el 1 con la más débil, y propuso cambiarlo. Esta es la lista que queda:

1. **Resumen: la tela dice la verdad sobre lo pedido y su porqué cabe en un toque.** *Antes →* «Faltan 146.5 m» y debajo «Ya hay pedidos: OI-2 35 m · OI-1 120 m». *Después →* «Faltan 146.5 m. Ya pediste 155 m (OI-2 y OI-1, llegan el 21 oct): si siguen en camino alcanzan; si ya llegaron, anótalos en Recibir y este número baja», y el párrafo de fórmula de abajo pasa a un «¿Por qué?» (el patrón de `PideAtencion.tsx`). *Leyes:* 3, 4, 6. *Verifica:* la ciega 2 repetida guarda el pedido o dice con otras palabras por qué no. **Presentación.** No toca «Hoy en el Taller» ni el capital (decisiones de Felipe). Una regla mejor («pedido emitido después del último ingreso = en camino») es de stock: **Felipe**.
2. **Tela y costo honestos** (sustituye al «foto y muestra»). (a) *Tela cortada = nada por usar:* `rojoDeLaOrden` y `filasDeTela` dejan de marcar «la tela no alcanza» cuando Corte ya terminó (H3: tres pantallas con un rojo falso). Es presentación, esfuerzo S. (b) *Un aviso antes de «Pasar al stock» si la tela usada es 0 y el plan pide metros:* «Todavía no anotaste la tela de este lote: el costo por prenda saldría sin tela», con «Anotarla ahora», sin bloquear (H2). **Toca costo: OK de Felipe.** *Leyes:* 3, 7. *Verifica:* OP-343 deja de salir en rojo; el cierre sin tela muestra el aviso.
3. **Nueva orden: el consejo de la red se pliega a una línea cuando no sugiere nada.** *Antes →* ~290 px de «Nada que fabricar» y «Todavía no recomienda» antes de Fases. *Después →* una línea («La red no sugiere nada ahora · ¿Por qué?»), y con sugerencia, «La red sugiere 40 prendas · Usarla · ¿Por qué?» con la curva, «Cubrir» y el motor bajo ese toque. **Sin reordenar** (la sugerencia alimenta «Cuántas» y los metros de tela dependen del total). *Leyes:* 2, 6, 8. *Verifica:* «Fases» a la vista sin scroll a 1440 × 900. **Presentación.**

## Lo que no pediste y importa más
**El sistema grita donde no hace falta y calla donde importa.** Grita «la tela no alcanza» en una orden con el corte hecho (H3) y calla cuando un lote entra al stock a S/ 4.50 por prenda en vez de S/ 22.38 porque nadie anotó la tela (H2, reproducido). Ese costo alimenta el promedio ponderado de la prenda en todas las sedes, y revertir la orden no lo devuelve. Es dinero: **la decisión es de Felipe** (aviso, bloqueo, o que `revertir` restaure el costo).

## Lo que sobra (ley 8)
- Resumen: «Capital en insumos» y «Valor en proceso» arriba (decisión escrita: se pregunta); el párrafo de pie con la fórmula.
- Órdenes: las píldoras «Afuera / Piden algo / Listas» (las tarjetas ya filtran) y la nota fija de las tres causas.
- **El cajón viejo** (`OrdenPanel`, `OrdenInsumos`, `OrdenCierre`, `OrdenModales`, `MatrizOrden`, `OrdenTarjeta`, ~1 270 líneas) y `conEtapasDeAntes`: producción tiene 0 órdenes (2026-10-15). Va en un PR aparte, después del despliegue.
- Servicios y tarifas: las 3 cifras sobre una sola fila. La orden: el costo dos veces. «Directorio / libro aparte del de Compras» en Proveedores y Facturas.

## Lista aparte (no se ejecuta)
Baratas (S), sin decisión de negocio: la tabla de Servicios y tarifas a `@container` (H4) · `/ordenes-insumos` en `SIN_TOPE_DE_ANCHO` (`AppShell.tsx:663`) · contrastes nuevos («Sin color», «Sin fijo», «Sin ventas medidas…») · «Pedir N m» que lleve la cantidad (`TelaDeLaOrdenVista.tsx:59`) · la guía de «Nueva orden de insumos» (regla 5 de ADR-0284) · autofoco al abrir esa hoja · «8 órdenes abiertas» contra «7 en curso» · ampliar `produccion-vocabulario.test.ts` a «maquila», «ADR-» y «Orden de antes de las fases».
Pieza compartida, avisar a Felipe: `.btn-enlace` con `padding-block: .3125rem; margin-block: -.3125rem` y un `min-height` en `EnlaceVer` y `Ayuda` (sin cambio visual; arregla de una vez los 6 blancos < 24 px).
**Del dinero, de Felipe:** el texto «pasó el estimado» en la cabecera de La orden **no se hace todavía** (el estimado se hunde al gastar la tela y rotularía un falso exceso); `variantes.costo` tras revertir.
**Foto de la prenda y muestra de la tela:** vuelven a la lista; no se pueden probar con 0 fotos en la base local y nadie tropezó con ellas. Se retoman cuando haya fotos reales.
Sin medir: 375 px, modo oscuro de las pantallas nuevas con la auditoría, teclado y foco.

## Cambios aplicados el 2026-10-16 (con el OK de Felipe) y lo que se midió después

Felipe aprobó los cuatro bloques de la lista (pregunta con opciones, 2026-10-16). Cada uno quedó con su prueba; lo visto en el navegador está en `.chaos/formidable/despues2/` (fuera de git).

| Bloque | Qué se hizo | Evidencia |
|---|---|---|
| **Resumen: la tela dice la verdad** | Con la recepción de `main` (ADR-0362) se pudo hacer más que cambiar el texto: la tela que viene en camino **cuenta** y es lo que falta recibir de cada pedido, **salvo los atrasados** (regla de Felipe, 2026-10-16). El caso de la ciega 2 dice ahora «Faltan 146.5 m de lino hoy, pero ya vienen 155 m en camino» y su cuenta está bajo un «¿Por qué?» a un toque, también el pie de la tabla. | 14 y 15 casos de base con recepciones reales y pedidos atrasados; `veredictoTela`, las decisiones del Resumen y la página de la orden con sus pruebas; capturas del Resumen en claro, oscuro y 375 px. |
| **Tela y costo honestos** | (a) Con el corte terminado, la tela que sobra del plan ya no se va a usar: **la OP-343 ya no sale en rojo**. (b) «Pasar al stock» avisa, sin bloquear, si la tela del lote no se anotó («el costo por prenda saldría sin tela») y «Anotarla ahora» lleva a anotarla. Una muestra no avisa. | Captura de la OP-343 sin «Pide atención»; 12 pruebas del aviso (también con tela en dos colores y con avíos); la hoja vista a 1440 y a 375 px. |
| **Nueva orden: el consejo plegado** | De ~290 px a una línea («La red no sugiere nada ahora · ¿Por qué?» o «La red sugiere 40 prendas · Usarla · ¿Por qué?»); «curva», «cubrir» y «motor de demanda» quedan dentro del «¿Por qué?». Sin reordenar la hoja. | Medido 58 px cerrado y 345 abierto a 1440 × 900; «Fases» a la vista sin desplazarse. |
| **Arreglos baratos** | La tabla de Servicios y tarifas se apila bajo el ancho de su tarjeta (el servicio nunca mide 0: a 1024 px se ve su nombre); `/ordenes-insumos` deja de saltar 32 px; «Sin color», «Sin fijo» y «Sin ventas medidas…» suben de contraste; «Pedir N m» lleva la cantidad y la hoja la precarga; la guía de Nueva orden de insumos ya no lista como «falta» la entrega opcional y la hoja abre con el cursor puesto. | Captura de tarifas a 1024; pruebas de las URL hostiles (cantidad «abc», «1e9», «-5», id inexistente). |

**No se aplicó (no es de esta lista):** `.btn-enlace` con `padding: 0` (los seis enlaces de ~16 px de alto; es una pieza compartida del sistema: de Felipe) y la ampliación del vocabulario vigilado («maquila», «ADR-»; son palabras de Felipe).

**Medido después (el mismo medidor, 26 vistas):** las comprobaciones que fallan pasaron de 164 a 152. Hay que leerlo con cuidado: **casi todo el contraste que mejoró (Eficiencia de 19 a 1, Por pagar de 3 a 0) viene del piso global de textos tenues que trajo `main`**, no de un arreglo de esta tanda; lo propio son los textos tenues de Nueva orden (17 a 6), Insumos y Servicios y tarifas. **Dos cosas empeoraron y están dichas (la primera ya se corrigió):** el Resumen pasó de 2 a 5 blancos bajo 24 px (los tres «¿Por qué?» nuevos eran enlaces de ~16 px) — **se les puso `min-h-6` y al volver a medir, sobre la compilación de producción, el Resumen quedó otra vez en 2**; y la OP-364 tiene tres rojos (los botones de peligro de las hojas, ya con la pieza única). Tarifas a 1024 trae un hueco fuera de escala nuevo (la fila apilada).

**Las guías interactivas de Producción** (Resumen, Órdenes y la orden, con los pasos nuevos de «¿Por qué?») corren completas sobre la compilación de producción (12, 21 y 25 pasos) y se miraron las capturas a 1440 px y a 375 px en oscuro. En el servidor de desarrollo no arrancan, en ninguna pantalla del ERP, no solo en estas: es del entorno (Next 16.4 en desarrollo), no de esta rama.

**Lo que sigue sin medirse:** una colaboradora real del Taller; 375 px de las pantallas que no son Vender, Cambios ni Devoluciones; teclado y foco.

## Antes de decir «listo» (el «después»)
- **Concurrencia:** `/chaos` del 2026-10-15 (182 casos en la base y 14 ataques en el navegador sobre lo que guarda dinero o stock): las hojas nuevas resisten el doble y el triple clic; los hallazgos abiertos están en `docs/chaos/README.md` y esperan el OK de Felipe. Dos cuentas a la vez desde el navegador: no cubierto (cubierto en la base).
- **Caída externa:** sin red conserva lo escrito y no duplica (RS-01, RS-03); el mensaje «No se guardó nada» miente cuando la base sí guardó. Producción no habla con SUNAT ni con Lucode.
- **Persona sin contexto:** dos ciegos ✓ con las salvedades de arriba · **colaboradora real del Taller: sin probar.**

## Historial

| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-13/14 | `d4533724e` | **5,5** (aritmético 5,6; ley 1: 5 provisional; ley 5: 4,5; ley 6: 4,6; Órdenes ley 5 en 2) | **5,6** (código) · medido sin chrome: de 3 a 8 fallas de 8 según la vista (piso del script: 2) | línea base antes del rediseño ADR-0400; ninguno aplicado: los 3 cambios esperan el OK de Felipe |
| 2026-10-15 | `954e8c3c0` | **6,1** en las mismas 10 pantallas (antes 5,6) · ley 1: 5 (provisional, sin cambio) · ley 5: 5,0 (antes 4,4) · ley 6: 5,3 (antes 4,6) · Órdenes y La orden 7,4 | **4,8** medido (antes 4,4 con la misma fórmula; no comparable con el 5,6 «código») | rediseño ADR-0400 medido: la etapa ya no es un bit, la costura afuera se marca con proveedor y tarifa, «¿Por qué?» a un toque en Órdenes y La orden; los 3 cambios de la línea base quedaron parciales; los 3 nuevos (tela dicha con verdad en el Resumen, tela y costo honestos, consejo plegado en Nueva orden) y los arreglos baratos **se aplicaron el 2026-10-16 con el OK de Felipe**; medido después: 152 comprobaciones fallan de 164 (la mejora de contraste es casi toda del piso global de `main`) |
