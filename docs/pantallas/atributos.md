# Pantalla — Atributos (`/productos/atributos`)

> Modo: completo · Fecha: 2026-09-21 · Rol/sede: líder, Tienda TRU · Datos: real parcial (SQL de producción: A1, A2, B1, C1, C2, C3, D2; **sin** A3, D1, D3, E1–E3)
> SHA analizado: `b6b85206` (= origin/main; rama al día, `0 0`) — si esos archivos cambian después, este análisis está vencido
> Archivos: `apps/web/app/(app)/productos/atributos/page.tsx` · `apps/web/components/AtributosHub.tsx` · `EtiquetasLista.tsx` · `ColoresLista.tsx` · `TallasLista.tsx` · `TejidosLista.tsx` · `PatronesLista.tsx` · `PrendasDeEtiquetaModal.tsx` · `lib/etiqueta-vigencia.ts` · `lib/etiqueta-visual.ts` · `app/api/productos/{etiquetas,colores,tallas,tejidos,patrones}/route.ts` · RPC `actualizar_campana_etiqueta`, `etiquetar_variantes`, `actualizar_variantes_etiquetas`, `campanas_vigentes`, `fn_campanas_por_variante` · tablas `colores`, `tallas`, `tejidos`, `patrones`, `etiquetas`, `etiqueta_categorias`, `variante_etiquetas`
> Otra sesión tocándola: **no directamente**. `SESIONES-ACTIVAS.md` línea 48 (rediseño de Categorías + consolidación de Atributos, PR #119, 2026-09-18) y línea 24 (crear producto como árbol de decisión, ADR-0109) rozan el mismo terreno: si ese PR sigue abierto, la #10 y la #11 pueden chocar con él.

## 0 · Veredicto
Pantalla bien construida en lo que no se ve —candados de estado y de descuento en la base, RLS en las 7 tablas, un solo lugar para los cinco vocabularios— y con un problema de fondo: **el módulo que más se ve, Etiquetas, hoy no toca ni una prenda ni un sol**. Producción tiene 24 etiquetas, 0 prendas etiquetadas, 0 categorías cubiertas y 0 descuentos configurados, mientras Black Friday empieza en 49 días.
**Cumple su finalidad:** 6,1/10 · **Relevancia:** 5,8/10 — Comodidad (pero es raíz de datos: color y talla están en las 127 variantes; tejido y patrón, en ningún producto).

## 1 · Finalidad declarada
"Esta pantalla existe para mantener los cinco vocabularios cerrados que describen una prenda (color, talla, tejido, patrón y etiqueta) y, en Etiquetas, para configurar campañas cuyo descuento cobra sola la caja."
Fuente: ADR-0024 (vocabulario de color), ADR-0095 (taxonomía de tallas, tejidos, patrones y etiquetas), ADR-0107 y ADR-0108 (la etiqueta de campaña guarda el descuento y la venta lo aplica); `docs/datos/modulos/02-catalogo-y-vocabulario.md` (avisa que describe V1, así que no lo cito como vigente). La captura no se usó para esto.
¿Docs y pantalla coinciden? **Casi.** Los ADR dicen que la etiqueta con campaña llega a caja; la pantalla lo cumple. Pero el texto en pantalla («lo puede usar de inmediato») no coincide con el código para 4 de los 5 vocabularios (ver #5). Ninguna decisión escrita cubre **quién aprueba el vocabulario**: D-13 lista lo que un Líder puede que un Integrante no, y no incluye aprobar valores.

## 2 · Objeción
1. **Etiquetas es una vitrina sin mercadería.** `[producción B1, C1]` 24 etiquetas, `variante_etiquetas` = 0 filas, `etiqueta_categorias` = 0, `descuento_pct` NULL en las 24. Las 127 variantes y los 39 productos activos no llevan ninguna. Cuatro de las etiquetas prometen medición automática que no existe (`Nuevo`, `Últimas unidades`, `Top ventas`, `Para liquidar`): no hay cron ni trigger que las ponga `[código, revisión del mapa]`. Quien mira la pantalla cree que hay un sistema de rotación funcionando; no lo hay.
2. **El camino a la plata no tiene freno humano.** Una campaña con «Configurar campaña» aplica descuento automático en Vender a todas las prendas de las categorías elegidas, sin código, sin motivo y sin tope (ADR-0108, decisión de Felipe). El modal avisa «por debajo del costo» pero no confirma un 50 % ni dice a cuántas prendas llega `[código EtiquetasLista.tsx:617-784]`. Un 5 escrito como 50 pasa en silencio. Y cambiar `descuento_pct` no deja rastro de quién lo hizo `[inferido: la auditoría de cambios solo cubre productos y variantes]`.
3. **El botón «Aprobar» de una etiqueta propuesta falla.** `[código EtiquetasLista.tsx:278-284]` manda `{id, estado:"aprobado"}` sin comentario; el trigger exige comentario no vacío `[código 20260917230000:92-95]` y el alta (`etiquetas/route.ts:21`) solo guarda el nombre, así que toda propuesta nace sin nota. Hoy no se ve porque **nunca ha habido una propuesta**: `[producción C2]` todo está `aprobado`, cero `pendiente`, cero `rechazado`. No confirmado con D3 (cuerpo de la función en producción); el BACKLOG dice que etiquetas coincide por huella con el repo.
4. Trade-off: no toques el diseño de las tarjetas (funciona y es lo mejor de la pantalla); arregla el alcance y el freno del descuento **antes del 2026-11-09**, y decide con Felipe el rumbo de Etiquetas (#6) antes de invertir más en ellas.

## 3 · Lo que está bien y no se toca
- **Candados en la base, no en la pantalla.** `[producción A2]` `etiquetas_estado_check`, `etiquetas_rechazado_no_activo`, `etiquetas_descuento_rango`, `etiquetas_descuento_solo_aprobada` (una colaboradora no puede proponer una etiqueta ya con «100 %»), `etiquetas_vigencia_coherente`, `etiquetas_estilo_valido`; lo mismo para los otros cuatro vocabularios.
- **RLS activo en las 7 tablas** `[producción D2]`. Insert para cualquier sesión, update solo Líder `[código migraciones]`; la API repite el 403 (`etiquetas/route.ts:31-34`).
- **Nada se borra:** desactivar/reactivar con sección aparte, y desactivar se bloquea si el valor está en uso (409) `[código etiquetas/route.ts:103-116, colores/route.ts:161-181]`. Un nombre no se duplica por mayúsculas o espacios (`*_clave_unica`, ADR-0024) `[código]`.
- **Vigencia calculada al leer, con fecha de Lima** (no `current_date` UTC) `[código lib/etiqueta-vigencia.ts:25-30, ADR-0108]`: sin cron que se caiga.
- **Ilustraciones que no mienten:** un tejido o patrón nuevo sin dibujo muestra «Sin muestra», no un dibujo equivocado `[código MuestraTejido.tsx:356-370]`; la talla es el propio texto. `[visto]` Tallas y Patrones se leen mejor que casi cualquier ERP.
- **Aviso de costo solo para Líder:** el costo no viaja a otros roles `[código page.tsx:47-49]`.
- **Prendas etiquetadas por lote con vista previa** (`etiquetar_variantes`, tope 50 cambios, ADR-0112) `[código PrendasDeEtiquetaModal.tsx:145]`.
- Modales con `<Modal>` del sistema (ADR-0136) `[visto]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7 | Coherente y con carácter propio; tres patrones de acción distintos entre pestañas, texto de 10 px y una nota interna con «Patrón Bershka» visible al público | `[visto]` `[código Chip.tsx:52, EtiquetasLista.tsx:488]` |
| Lógica de negocio | 5 | El aprobar falla, el texto promete lo que no ocurre, las etiquetas no se aplican solas y las campañas quedan fechadas en 2026 | `[código]` `[producción C1, C3]` |
| Arquitectura | 6,5 | Candados y RLS sólidos; sin auditoría de cambios de descuento; consulta de variantes con costo sin paginar | `[producción A2, D2]` `[código page.tsx:47-49]` |
| Funciones | 5,5 | Las esenciales funcionan; hay fantasmas y faltan editar nombre/nota/estilo y ver «cuántas prendas usan esto» | `[código]` |
| Utilidad | 5,5 | Una colaboradora nueva propone y no ve su propuesta; la Líder aprueba y falla | `[código]` `[inferido]` |
| Conexión con el ERP | 7 | Alimenta el alta de producto, la variante y, por campaña, `registrar_venta`; sin integraciones externas | `[código]` |

**Estética.**
- (a) Coherencia con CAYLA: crema y tinta, esquinas suaves, rojo casi ausente (máx. 2 se cumple) `[visto]`. Las tarjetas de ilustración son coherentes con Categorías y con Productos.
- Falla: chips, «Prendas», «Configurar campaña» y «Desactivar» a 10 px `[código EtiquetasLista.tsx:141,144,488,495,504]`; el «!» mide 20×20 (`Ayuda.tsx:105`), lejos de un objetivo táctil de 44 px. En la captura, «DESACTIVAR» solo aparece al pasar el mouse y en gris casi invisible `[visto, imagen 1]`. `ADR-0012` fija el piso de contraste: ya lo violan Categorías (`CategoriasLista.tsx:670`, 9 px) y Colaboradores (`:139`) → es un defecto de tres pantallas, una sola tarea raíz (#11).
- Inconsistencia entre pestañas `[visto]`: Etiquetas y Tallas tienen buscador, chips de grupo y conteos; Colores, Tejidos y Patrones no. Acciones por tarjeta: Etiquetas (enlaces de 10 px), Colores («Editar» + doble clic para desactivar), Tejidos y Patrones (botón «Desactivar» a todo el ancho en cada tarjeta, 17 y 7 veces).
- (b) Marca y tono: el «!» de «Nuevo» dice «Patrón Bershka: llegadas frecuentes como gancho de retorno» `[visto, imagen 2]`. Es una nota de investigación de mercado; no es para la boutique. Viene de la siembra `[código 20260917230100:61]`; «Top ventas» cita a «Zara… RFID» (`:67`).
- (c) Nielsen: el mismo botón «Configurar campaña» aparece en «Pieza única», «Hecho a mano» y «Reedición» `[visto]`, que no son campañas (visibilidad y control: la pantalla ofrece una acción que no aplica).
- Sidebar `[visto, imágenes 6 y 8]`: «Colaboradores» aparece resaltado a la vez que «Atributos». `[no verificable]`: probablemente el mouse encima; sin captura del estado de reposo no lo cuento como defecto.

**Lógica de negocio.**
- Regla violada 1: la promesa «Cualquiera con sesión propone un valor nuevo y lo puede usar de inmediato» (`page.tsx:128-129`, `EtiquetasLista.tsx:266-267`, `TallasLista.tsx:141-142`) es falsa para talla, tejido, patrón y etiqueta: el alta y la edición de producto los filtran por `estado='aprobado'` `[código alta-producto-datos.ts:67-74, catalogo-v2.ts:494-502]`. Solo el color pendiente sí se ofrece (`alta-producto-datos.ts:59`). Ninguna D-nn cubre el punto.
- Regla violada 2 (principio 4, «una sola fuente de verdad»): «Top ventas» y «Últimas unidades» dicen medirse solas y son manuales. Además `[producción C1]` con solo `prendas_a_mano = 0`, el conteo «Sin prendas etiquetadas» de la tarjeta **tampoco** mira las categorías: una campaña por categoría cubriría decenas de prendas y la tarjeta diría «Sin prendas etiquetadas» `[código EtiquetasLista.tsx:162-166, page.tsx:109-112]`.
- Vigencia: `[producción C1]` 12 campañas con fechas de 2026 (p. ej. Día de la Madre 2026-04-26 → 05-10, Fiestas Patrias 07-14 → 07-29). Siete ya pasaron y siguen `activo=true` con chip «Fuera de temporada». Después del 25-dic-2026 quedan todas caducas; no hay «repetir cada año». «CyberWow» no tiene fechas.
- Vocabularios que se pisan `[producción C3]` `[inferido]`: «Animal print» y «Estampado» existen como **color** y como **patrón** (0 usos como color); hay «Multicolor» como color; hay tallas «Estándar» (15 usos) y «Única» (0 usos); un color se llama «Arena (retirado)» (el estado escrito en el nombre, cuando ya existe `activo`).
- Uso `[producción C3]`: **los 17 tejidos y los 7 patrones tienen 0 productos**; 39 productos activos, ninguno con tejido ni patrón (el BACKLOG ya lo sabe: «completar tejido y patrón de los 38 productos activos»). Tallas: solo S, M, L, Estándar y 28/30/32 tienen uso; XS, XL, XXL, 6–9, 26, 34–42 y Única, 0.
- Cualquiera propone: hoy `[producción C2]` nadie lo ha hecho (cero pendientes). El flujo de aprobación existe y jamás se ha ejercitado.

**Arquitectura.**
- Estados imposibles: `rechazado_no_activo`, `descuento_solo_aprobada` y `vigencia_coherente` los impiden en la base `[producción A2]`. Los triggers deciden `pendiente` o `aprobado` por `fn_es_lider()` en el insert, no la API `[código 20260917230000:62-77]`.
- Transacción: `actualizar_campana_etiqueta` hace delete + insert de `etiqueta_categorias` dentro de la función `[código 20260918160000:97-142]`: es atómico. Bien.
- Concurrencia: dos Líderes que editan la misma campaña: gana el último; sin control de versión ni registro de quién `[inferido]`. Hoy hay un solo admin `[código 01-INVARIANTES.md:175, puede estar viejo]`, así que el riesgo real es bajo.
- Caída externa: no aplica; no hay SUNAT ni Culqi aquí. Se degrada así: si `campanas_vigentes` falla, la caja vende sin descuento de campaña y no pierde la venta (`registrar_venta` solo exige lo vigente hoy, con 3 días de tolerancia offline, ADR-0108). Lo que **sí** puede pasar es un despliegue que llegue antes que el SQL: la pantalla lo cubre pidiendo las tablas de etiquetas solo en esa pestaña (`page.tsx:31-33`).
- Volumen `[producción B1]`: 35 colores, 25 tallas, 17 tejidos, 7 patrones, 24 etiquetas → los listados no son un problema hoy ni a tres años. **Riesgo real:** `page.tsx:47-49` pide todas las variantes activas con costo (127 hoy). El módulo 02 habla de ~900 prendas × tallas ≈ 2 700 variantes; PostgREST corta en 1 000 filas por defecto `[no verificable: es el valor de fábrica de Supabase, no lo vi en la configuración]`; el aviso «por debajo del costo» contaría de menos sin error.
- Auditoría: solo `propuesto_por`, `aprobado_por`, `aprobado_en`. Cambiar hex, nombre o `descuento_pct` no deja historial; `historial_producto_cambios` solo cubre productos y variantes `[código 20260915204541:40-108]`. Las filas sembradas tienen esos campos en NULL.
- Tests: hay de las reglas puras (`etiqueta-campana.test.ts`, `etiqueta-vigencia.test.ts`, `tallas.test.ts`…); **no hay** de las 5 rutas API ni de los RPC. El bug de #4 pasó por ahí.
- Datos personales: ninguno (vocabularios). Lente de dinero: el descuento de campaña.

**Funciones.**
- Existen y funcionan (`[código]`, salvo lo que marca #4): agregar en las 5 pestañas, aprobar/rechazar/desactivar/reactivar, editar color, etiquetar prendas en lote, configurar campaña, buscador y filtros de Etiquetas y Tallas.
- Fantasma: (1) **Aprobar etiqueta** sin campo de comentario (falla); (2) `sedes_permitidas` de etiquetas sin ninguna UI (`EtiquetasLista.tsx:23-28`), y cuatro etiquetas «Para liquidar — sede» desactivadas por eso `[visto, imagen 3]`; (3) `DESCUENTO_YA_SE_APLICA = true`, un interruptor fijo (`EtiquetasLista.tsx:89`) que apaga un aviso ya inútil; (4) `imagen_muestra_url` en tejidos y patrones `[producción A1]` sin UI que la lea ni la suba; (5) «Top ventas» y «Últimas unidades» como promesa de medición.
- Faltan: editar nombre, nota o estilo de una etiqueta, talla, tejido o patrón (solo Colores tiene «Editar»; una etiqueta nueva nace `neutral` y no hay cómo cambiarlo) · ver cuántas prendas usan cada valor · alcance real de una campaña · renovar campañas al año siguiente · fusionar duplicados.
- Sobran: el botón «Configurar campaña» en etiquetas que no son campaña (decisión de #6), los dos «!» globales que repiten lo mismo (título y texto fijo por pestaña).

**Utilidad (persona sin contexto).** Escenario 1, colaboradora nueva, un martes de tienda: quiere marcar unas blusas como «Oferta verano». Abre Atributos → Etiquetas → «Agregar etiqueta». El modal dice «Queda disponible de inmediato para cualquier variante» `[visto, imagen 4]`. Guarda y la etiqueta no aparece al editar el producto (queda `pendiente`). No hay mensaje que diga «espera a que te la apruebe la Líder». Duda, la crea otra vez con otro nombre; ahora hay dos (la clave única solo frena mayúsculas). Escenario 2, Líder: ve «Pendiente», presiona Aprobar y recibe «exige un comentario breve» sin campo dónde escribirlo. Escenario 3, Líder preparando Black Friday: configura 30 % por categoría, vuelve a la lista y la tarjeta dice «Sin prendas etiquetadas»: cree que no funcionó. Los tres fallos son de diseño, no de capacitación.

**Conexión con el ERP.** Ver §6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 7 | Indirecto alto: color y talla son la base de cada reporte; directo bajo, la pantalla no ayuda a decidir |
| Dinero y stock que toca | ×1 | 5 | Sin campañas configuradas hoy, pero el descuento sale de aquí y llega a caja; 0 stock |
| Frecuencia y personas que la usan | ×1 | 3 | Vocabularios casi estáticos: cero propuestas registradas, un Líder |
| Qué se detiene si falla | ×1 | 7 | Sin colores ni tallas aprobados no se puede dar de alta un producto |

Relevancia = (2·7 + 5 + 3 + 7) / 5 = **5,8** → Comodidad.

## 6 · Conexión con el ERP
- **Aguas arriba:** el alta de producto y el censo proponen valores nuevos (`ProponerValor.tsx`, `lib/alta-producto-ejes.ts:39`); las siembras vienen de migraciones (`20260917230100`, `20260918140000_tejidos_seed`, `20260918154730_colores_audit…`).
- **Aguas abajo:** `variantes.color_codigo` y `talla_id`, `productos.tejido_id` y `patron_id`, `variante_etiquetas`, `categoria_tallas/tejidos/patrones`; 19 archivos leen colores y 20 leen tallas `[código, mapa]`. Y **el único camino a dinero real**: `campanas_vigentes()` → `PuntoDeVenta` → `registrar_venta` `[código vender/page.tsx:57, 20260918170000:137-264]`. No encontré uso de etiquetas en tienda online, precios base ni inventario `[no verificable: no busqué en integraciones externas]`.
- **Pájaro dueño y vecinos:** LORO (catálogo y vocabulario, módulo 02) según `docs/datos/modulos/02-catalogo-y-vocabulario.md`; vecinos: Vender (campañas), Nuevo producto y Editar producto, Categorías (`categoria_tallas`, `categoria_tejidos`, `categoria_patrones`), censo. No consulté `AVIARIO.md`.
- **Externos:** ninguno. Si SUNAT o Nubefact caen, esta pantalla no se entera; el comprobante guarda el descuento ya aplicado a cada línea.

## 7 · Las 12 tareas, por importancia
Orden: primero lo que toca dinero y tiene fecha (Black Friday, 2026-11-09), después el flujo de aprobación, después el rumbo de Etiquetas, al final lo cosmético.

### #1 · Corregir — Que «Prendas etiquetadas» y el alcance de una campaña digan la verdad
- **Dónde:** `page.tsx:47-52,109-112` y `EtiquetasLista.tsx:162-166`; nueva RPC de solo lectura `resumen_alcance_etiquetas()` (prefijo `resumen_`, así el loader no bloquea, ver `espera-reglas.ts`) que cuenta, por etiqueta, variantes manuales ∪ variantes de las categorías cubiertas.
- **Por qué en este puesto:** es lo que la Líder mira al armar Black Friday. Hoy una campaña por categoría aparece como «Sin prendas etiquetadas». Además `page.tsx:47-49` trae toda `variantes` con costo y se topa con el límite de 1 000 filas hacia las ~2 700 variantes previstas (el aviso «por debajo del costo» contaría de menos sin error). Mover el conteo a la base arregla las dos cosas.
- **Cómo lo verificas tú:** en Etiquetas, configura una campaña de prueba con una categoría que tenga productos; la tarjeta debe decir «Alcanza N prendas». Con SQL: `select count(*) from retail.variantes v join retail.productos p on p.id=v.producto_id where p.categoria_id = '<id>' and v.activo` debe dar el mismo N.
- **Esfuerzo / dependencias:** M · migración nueva; cambio de esquema en producción → confirma Felipe.

### #2 · Corregir — Freno humano antes de guardar un descuento de campaña
- **Dónde:** `CampanaModal` `EtiquetasLista.tsx:617-784` (`guardar` :658).
- **Por qué en este puesto:** hoy ningún paso pide confirmar un 50 % o un 100 %, y el descuento entra en caja solo (ADR-0108). No se pone un límite (Felipe lo decidió: se puede vender bajo costo en liquidación); se pone una **confirmación**: «Esto pondrá 60 % a N prendas de 3 categorías del 09-nov al 30-nov. ¿Confirmas?». Sin esto, un error de tecleo llega al mostrador.
- **Cómo lo verificas tú:** en el modal escribe 50, presiona guardar → aparece el resumen con el N de #1 y un botón «Confirmar»; escribe 10 → guarda directo.
- **Esfuerzo / dependencias:** S · no antes de la #1 (usa su conteo).

### #3 · Mejorar — Dejar rastro de quién cambió un descuento o una vigencia
- **Dónde:** trigger nuevo sobre `retail.etiquetas` (columnas `descuento_pct`, `vigente_desde`, `vigente_hasta`, `activo`) hacia una tabla `etiquetas_historial` append-only; modelo idéntico a `historial_producto_cambios` (`20260915204541:40-108`).
- **Por qué en este puesto:** el descuento mueve dinero y hoy no queda quién lo tocó ni el valor anterior. Con un solo admin el riesgo es bajo; con un segundo Líder (D-14) sube. No borres nunca: la tabla solo recibe inserciones.
- **Cómo lo verificas tú:** cambia el % de una etiqueta de prueba y consulta `select * from retail.etiquetas_historial order by created_at desc limit 3`; debe verse el valor viejo, el nuevo, quién y cuándo.
- **Esfuerzo / dependencias:** M · migración; confirma Felipe (esquema en producción).

### #4 · Corregir — «Aprobar» y «Reactivar» una etiqueta exigen un comentario que la pantalla no pide
- **Dónde:** `EtiquetasLista.tsx:278-298` (`aprobar`) y `:324-344` (`reactivar`); modelo de referencia `TallasLista.tsx:405-430`; trigger `20260917230000:92-95`; alta `etiquetas/route.ts:21`.
- **Por qué en este puesto:** cierto por código, no confirmado en producción (falta D3). Cero propuestas hoy (`[producción C2]`), por eso no ha dolido; en cuanto una colaboradora proponga una etiqueta, la Líder no podrá aprobarla. Se corrige copiando Tallas (modal de comentario al aprobar) y, mejor, pidiendo «¿para qué sirve?» al proponer.
- **Cómo lo verificas tú:** entra como Integrante, propón «Prueba»; entra como Líder, presiona Aprobar: debe abrir el modal, pedir el comentario y dejar la etiqueta `aprobada`. Sin el arreglo hoy debe salir el error «Aprobar una etiqueta exige un comentario breve».
- **Esfuerzo / dependencias:** S · ninguna.

### #5 · Corregir — Decir la verdad sobre lo que pasa con una propuesta
- **Dónde:** `page.tsx:128-129`, `EtiquetasLista.tsx:266-267`, `TallasLista.tsx:141-142`, y el modal «Nueva etiqueta» `[visto, imagen 4]`.
- **Por qué en este puesto:** el texto actual provoca duplicados (escenario 1 de §4). Cambia a «Tu propuesta queda pendiente hasta que un Líder la apruebe; mientras tanto no aparece al crear productos». Alternativa descartada: hacer que el pendiente se ofrezca de verdad; abriría el vocabulario cerrado que ADR-0024 protege.
- **Cómo lo verificas tú:** como Integrante, guarda una etiqueta: el aviso dice que está pendiente y la tarjeta muestra «Pendiente».
- **Esfuerzo / dependencias:** S · ninguna.

### #6 · Replantear — Etiquetas de rotación calculadas; etiquetas de campaña manuales
- **Dónde:** `etiquetas.estilo` (`neutral/urgencia/positivo/campana`), `20260917230100`, `lib/inteligencia.ts`, `variante_etiquetas`, `EtiquetasLista.tsx`.
- **Por qué en este puesto:** es una decisión de Felipe y condiciona la #7 y #12 (ver §8). `DECIDÍ:` proponer, no imponer, separar tres familias: rotación calculada (Nuevo, Últimas unidades), campaña manual (las 12 de temporada y Para liquidar) y atributo de producto (Hecho a mano, Pieza única, Reedición). `DESCARTÉ:` seguir con todo manual, porque cuesta 127 variantes etiquetadas a mano hoy y un olvido por cada ingreso mañana. `SE ROMPE SI:` se calcula «Top ventas» con las 9 ventas que tiene producción hoy (BACKLOG, 2026-09-19): saldría ruido, no señal.
- **Cómo lo verificas tú:** decisión de Felipe en chat; el entregable es un ADR. Cuando se implemente, «Nuevo» debe aparecer solo en las prendas ingresadas en los últimos N días, sin que nadie las marque.
- **Esfuerzo / dependencias:** L · decide Felipe; no antes de las #1–#4.

### #7 · Corregir — Reescribir las notas «!» en el idioma de CAYLA
- **Dónde:** `retail.etiquetas.notas` de las 24 filas (siembra `20260917230100:59-67`); migración nueva de `update`, sin borrar nada.
- **Por qué en este puesto:** el texto se muestra a toda la boutique y cita «Patrón Bershka» y «Zara… RFID». Para «Top ventas» y «Últimas unidades» además promete medición que no existe. Una nota por etiqueta: qué es, cuándo se usa, quién la pone.
- **Cómo lo verificas tú:** pasa el mouse sobre el «!» de «Nuevo»: no debe nombrar a ninguna marca ajena.
- **Esfuerzo / dependencias:** S · no antes de decidir la #6 (la nota debe decir si es automática o manual).

### #8 · Mejorar — Renovar una campaña para el año siguiente
- **Dónde:** `CampanaModal` (`EtiquetasLista.tsx:617-784`), `lib/etiqueta-vigencia.ts`.
- **Por qué en este puesto:** `[producción C1]` las 12 campañas de temporada tienen fecha de 2026; siete ya pasaron. En enero, la Líder edita 12 modales a mano o las olvida y el Día de la Madre de 2027 no tiene campaña. Un botón «Renovar para 2027» que sume 12 meses a las dos fechas (la restricción `vigencia_coherente` sigue mandando).
- **Cómo lo verificas tú:** en «Día de la Madre» (2026-04-26 → 05-10), presiona Renovar: debe leer 2027-04-26 → 05-10; el chip pasa de «Fuera de temporada» a «En N días».
- **Esfuerzo / dependencias:** S · ninguna.

### #9 · Eliminar/fusionar/conectar — Duplicados entre vocabularios
- **Dónde:** `colores` («Animal print», «Estampado», «Multicolor», «Arena (retirado)»), `patrones` (los mismos dos nombres), `tallas` («Estándar» 15 usos y «Única» 0).
- **Por qué en este puesto:** dos formas de decir lo mismo ensucian los reportes por color, patrón y talla (`colores.tipo = 'estampado'` ya existe). Regla: nada se borra; se desactiva el sobrante (`activo=false`) y, si hace falta, se reasignan las variantes con SQL revisado por Felipe.
- **Cómo lo verificas tú:** `select valor, count(*) from retail.tallas t left join retail.variantes v on v.talla_id=t.id where t.activo group by 1` debe listar una sola de «Estándar»/«Única».
- **Esfuerzo / dependencias:** M · confirma Felipe (datos de producción); conviene antes de la #10.

### #10 · Mejorar — Las cinco pestañas con el mismo vocabulario de uso, y «cuántas prendas lo usan»
- **Dónde:** `AtributosHub.tsx`, `ColoresLista.tsx`, `TejidosLista.tsx`, `PatronesLista.tsx` (sin buscador ni filtros), `page.tsx:18` (orden de pestañas: `etiquetas` es la primera, aunque colores y tallas son lo que usan las 127 variantes).
- **Por qué en este puesto:** hoy hay tres patrones de acción por tarjeta, y nadie ve que 17 tejidos y 7 patrones tienen 0 uso `[producción C3]`. Un conteo «N prendas» por tarjeta (una consulta agregada, mismo estilo que #1) le dice a la Líder qué sobra; con «Desactivar» solo tras un menú, no a todo el ancho en cada tarjeta.
- **Cómo lo verificas tú:** en Tejidos, cada tarjeta muestra «0 productos» y el buscador filtra «alg» → Algodón y Algodón pima.
- **Esfuerzo / dependencias:** M · no antes de la #9.

### #11 · Corregir — Piso tipográfico y de contraste (tarea raíz en tres pantallas)
- **Dónde:** `components/ui/Chip.tsx:52` (10 px), `EtiquetasLista.tsx:141,144,488,495,504`, `TallasLista.tsx:75,78,353`, `ColoresLista.tsx:329,441`, `TejidosLista.tsx:187,270`, `PatronesLista.tsx:187,270`, `AtributosHub.tsx:111`, `Ayuda.tsx:105` (20 px de alto), modales sin `alCerrarEnfocar` (`Modal.tsx:20-22`).
- **Por qué en este puesto:** ADR-0012 fija el piso. La misma falla está en Categorías (`CategoriasLista.tsx:670`) y en Colaboradores (`:139`): **una** tarea raíz que se resuelve en `Chip` y en un token compartido, no pantalla por pantalla. Incluye: `role="tablist"` en las pestañas, `aria-expanded` en el «!», «Desactivar» visible sin hover.
- **Cómo lo verificas tú:** inspecciona un chip «Pendiente»: `font-size` ≥ 11 px; el foco vuelve al botón que abrió el modal al cerrarlo.
- **Esfuerzo / dependencias:** M · coordinar con la sesión de la línea 48 de `SESIONES-ACTIVAS.md`.

### #12 · Eliminar/fusionar/conectar — Retirar lo dormido · *bajo valor / opcional*
- **Dónde:** `etiquetas.sedes_permitidas` y las 4 etiquetas «Para liquidar — sede» desactivadas (`EtiquetasLista.tsx:23-28`), `DESCUENTO_YA_SE_APLICA` (`:89`), `imagen_muestra_url` de tejidos y patrones, «Galentine's Day» desactivada.
- **Por qué en este puesto:** no daña nada; solo lee ruido. Se retira el código muerto (no las columnas: nunca se borra) y se deja una línea en el ADR de la #6.
- **Cómo lo verificas tú:** `grep -rn "sedes_permitidas\|DESCUENTO_YA_SE_APLICA" apps/web` devuelve solo la migración.
- **Esfuerzo / dependencias:** S · después de la #6.

## 8 · Estrategia alternativa
Existe una que apoya mejor la gestión, y es la de la tarea #6. **Decide Felipe.**

| | Hoy: todas manuales | Alternativa: tres familias |
|---|---|---|
| **Ganas** | Nada que construir; ya funciona el camino a caja | «Nuevo» y «Últimas unidades» dicen la verdad sin que nadie los mantenga; nadie etiqueta 127 variantes a mano; menos botones que no aplican |
| **Pagas** | Etiquetas que nadie pone: 0 de 127 hoy; notas que prometen automatismo; cada ingreso pide una marca manual | Definir umbrales con Felipe (¿«Nuevo» = 30 días?, ¿«Últimas» = 3 unidades?), una función de lectura, y no calcular «Top ventas» hasta tener ventas suficientes |

## 9 · Referentes de ERP y futuro
Filtro «¿le sirve a 3 tiendas y 1 taller hoy?»:
- **Odoo (etiquetas de producto):** viene de memoria, no verificado. Una etiqueta se aplica al producto, no se calcula. CAYLA ya es más fina: descuento y vigencia en la propia etiqueta.
- **Shopify (colecciones automáticas por regla):** viene de memoria, no verificado. Inspira la alternativa de #6 (regla → etiqueta), sin copiarla.
- **Futuro, no cuenta entre las 12:** sedes en las etiquetas de campaña (`sedes_permitidas`) cuando haya promociones distintas por tienda; tallas por rango de calzado (hoy «numeración» mezcla 6–9, 26 y 28–42 en un grupo `[código lib/tallas.ts:182-215]`).

## 10 · Fuera de esta pantalla
**Dos de los cinco vocabularios no alimentan ni un dato.** `[producción C3]` 17 tejidos y 7 patrones aprobados, con 0 de 39 productos activos que los usen. Todo reporte por tejido o patrón sale vacío, y esta pantalla los presenta como si fueran datos vivos. El BACKLOG ya lo tiene como pendiente (completar tejido y patrón de los 38 productos activos); es más urgente que cualquier tarea de arriba si Felipe quiere análisis por material antes de la próxima compra.

## 11 · Líneas propuestas para BACKLOG.md
- [ ] `[pantalla:atributos]` #1 Alcance real de una campaña (manual ∪ categoría) con RPC `resumen_alcance_etiquetas`; corrige el límite de 1 000 filas — M
- [ ] `[pantalla:atributos]` #2 Confirmación antes de guardar un descuento de campaña (sin límite, con resumen) — S
- [ ] `[pantalla:atributos]` #3 Historial de cambios de `descuento_pct` y vigencias (`etiquetas_historial`, append-only) — M
- [ ] `[pantalla:atributos]` #4 Aprobar/reactivar etiqueta con comentario (hoy falla en el trigger) — S
- [ ] `[pantalla:atributos]` #5 Texto que diga que la propuesta queda pendiente hasta que un Líder la apruebe — S
- [ ] `[pantalla:atributos]` #6 Decidir: rotación calculada vs. campaña manual vs. atributo de producto — L (decide Felipe)
- [ ] `[pantalla:atributos]` #7 Reescribir las 24 notas «!» sin «Bershka»/«Zara» — S
- [ ] `[pantalla:atributos]` #8 Botón «Renovar para el año siguiente» en campañas de temporada — S
- [ ] `[pantalla:atributos]` #9 Desactivar duplicados entre vocabularios (Animal print/Estampado, Estándar/Única) — M
- [ ] `[pantalla:atributos]` #10 Pestañas uniformes con buscador, filtros y «N prendas lo usan» — M
- [ ] `[pantalla:atributos]` #11 Piso tipográfico y de contraste compartido en `Chip` y `Ayuda` (raíz: Atributos, Categorías, Colaboradores) — M
- [ ] `[pantalla:atributos]` #12 Retirar código dormido (`sedes_permitidas`, flag fijo) — S (bajo valor)

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Título «Atributos» + «!» | Explica los 5 vocabularios | ajustar (promete «de inmediato») | `page.tsx:126-130` |
| Pestañas | Etiquetas · Colores · Tallas · Tejidos · Patrones | Cambia `?tipo=` | ajustar (sin `role=tablist`; orden por uso) | `AtributosHub.tsx:106-118` |
| Etiquetas | Chips de grupo + conteo | Filtra por estilo | bien | `EtiquetasLista.tsx:371-398` |
| Etiquetas | Buscador | Filtra por nombre, sin tildes | bien | `:401-424` |
| Etiquetas | «+ Agregar etiqueta» | Propone o crea | ajustar (#5) | `:425-431` |
| Etiquetas | Tarjeta con ilustración | Muestra icono y estilo | bien | `MuestraEtiqueta.tsx:19-282` |
| Etiquetas | «!» por tarjeta | Muestra `notas` | ajustar (#7) | `:138`, `Ayuda.tsx` |
| Etiquetas | Chip de vigencia | «En N días», «Vigente», «Fuera de temporada» | bien | `:105-110`, `lib/etiqueta-vigencia.ts:25-30` |
| Etiquetas | «Sin prendas etiquetadas» | Cuenta prendas manuales | ajustar (#1) | `:162-166` |
| Etiquetas | «Prendas» | Etiqueta prendas en lote | bien | `PrendasDeEtiquetaModal.tsx:145` |
| Etiquetas | «Configurar campaña» | % + fechas + categorías | ajustar (#2, #3, #8) | `CampanaModal :617-784` |
| Etiquetas | «Aprobar» | Cambia a `aprobado` | ajustar (falla, #4) | `:278-298` |
| Etiquetas | «Desactivar» / «Reactivar» | Baja y alta lógica | ajustar (visibilidad, #11) | `:346`, `:324` |
| Etiquetas | Sección «Desactivadas» | Lista las inactivas | bien | `[visto, imagen 3]` |
| Colores | «+ Agregar color» / «Editar» | Alta y edición con código, familia, hex | bien | `ColoresLista.tsx:306, 359` |
| Colores | Agrupado por familia | Neutro, azul… | bien | `:53` |
| Tallas | Chips Letras / Numeración / Única y estándar | Agrupa | ajustar (calzado) | `lib/tallas.ts:182-215` |
| Tallas | Modal de aprobar con comentario | Exige nota | bien | `TallasLista.tsx:405-430` |
| Tejidos / Patrones | Tarjeta con muestra + «Desactivar» | Baja lógica | ajustar (#10) | `TejidosLista.tsx:190-214` |
| Tejidos / Patrones | (sin buscador, sin editar) | — | falta | `[visto, imágenes 7 y 8]` |
| Todas | Modales | Radix Dialog con foco atrapado | ajustar (`alCerrarEnfocar`) | `Modal.tsx:20-22, 60-113` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-21 | completo | 6,1 | 5,8 | — (primer análisis) |
