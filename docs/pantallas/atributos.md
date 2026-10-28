# Pantalla — Atributos (`/productos/atributos`)

> Modo: completo (re-análisis) · Fecha: 2026-09-29 · Rol/sede: líder y admin, Tienda Lima (local; la pantalla no depende de sede) · Datos: **real** — consultas de solo lectura a producción hechas por el agente en la sesión (no las corrió Felipe; el apéndice de `catalogo-plan-de-ataque.md` las lista para que las confirme) y recorrido visual de las seis pestañas en local (datos de siembra; producción tiene otros números)
> SHA analizado: `38f9d7ce` (origin/main; el código se leyó en `123bb733` y entre los dos solo cambió `alta-producto/ProductoCreado.tsx`). Si cambian `atributos/page.tsx`, `AtributosHub.tsx`, `components/atributos/kit.tsx` o alguna de las seis listas, este análisis está vencido.
> Archivos: `apps/web/app/(app)/productos/atributos/{page,layout}.tsx` · `components/AtributosHub.tsx` · `components/atributos/kit.tsx` · `EtiquetasLista.tsx` · `ColoresLista.tsx` · `TallasLista.tsx` · `TejidosLista.tsx` · `PatronesLista.tsx` · `TemporadasLista.tsx` · `PrendasDeEtiquetaModal.tsx` · `lib/etiqueta-vigencia.ts` · `lib/etiqueta-aprobacion-reglas.ts` · `app/api/productos/{etiquetas,colores,tallas,tejidos,patrones,temporadas}/route.ts` · RPC `actualizar_campana_etiqueta`, `etiquetar_variantes`, `actualizar_variantes_etiquetas`, `campanas_vigentes`, `fn_campanas_por_variante` · tablas `colores`, `tallas`, `tejidos`, `patrones`, `etiquetas`, `etiqueta_categorias`, `variante_etiquetas`, `temporadas`
> Otra sesión tocándola: **no directamente.** Estuvo la de «Atributos uniforme» (ADR-0261, 2026-09-28) y ya está en `main`; `docs/SESIONES-ACTIVAS.md:62` sigue listándola (fila vieja).
> **Re-análisis.** El anterior (`b6b85206`, 2026-09-21) estaba **vencido** (15 commits, +507/−389 líneas; `EtiquetasLista` y `TallasLista` casi rehechas) y no se tomó como base; se leyó solo para marcar qué tareas se cerraron (Historial).
> Etiquetas: `[visto]` captura · `[código archivo:línea]` · `[producción-agente]` consulta de solo lectura del 2026-09-29 · `[inferido]` · `[no verificable]`.

## 0 · Veredicto
Desde el 21-sep se arregló lo de fondo del flujo de aprobación (aprobar una etiqueta con comentario funciona) y las seis pestañas comparten un solo kit visual. **Pero el camino a la plata sigue sin freno**: una campaña con descuento se guarda sin confirmar, sin fechas obligatorias, hasta 100 % y sin rastro de quién la tocó, y hoy las dos campañas con descuento de producción (Aniversario 10 %, Para liquidar 20 %) **no llegan a ninguna prenda**. Además las etiquetas de rotación prometen una medición que no existe («Top ventas», con 4 prendas puestas a mano).
**Cumple su finalidad:** 5,0/10 (promedio 6,6, con tope 5: el descuento de campaña puede tocar el precio en caja sin confirmación ni traza) · **Relevancia:** 5,6/10 — Comodidad (pero es raíz de datos de todo producto y decide qué descuento cobra la caja)

## 1 · Finalidad declarada
"Esta pantalla existe para mantener los seis vocabularios cerrados que describen una prenda (color, talla, tejido, patrón, etiqueta y temporada) y, en Etiquetas, para configurar campañas cuyo descuento cobra sola la caja." Fuente: ADR-0024 (color), ADR-0095 (taxonomía), ADR-0107 y ADR-0108 (etiqueta con descuento que la venta aplica), ADR-0112 (etiquetar en lote), ADR-0246 (temporadas) y ADR-0261 (kit uniforme); **no la captura**. ¿Docs y pantalla coinciden? **Casi.** Los ADR dicen que la campaña llega a caja y es cierto; pero el texto en pantalla («lo puede usar de inmediato») no coincide con el código en 4 de 5 vocabularios, y las notas de las etiquetas prometen una medición automática que no existe. Ninguna decisión D-nn cubre **quién aprueba el vocabulario** ni cuánto descuento puede dar una campaña (ADR-0108 la dejó sin tope a propósito).

## 2 · Objeción
1. **Un descuento de campaña se guarda sin freno y hoy no llega a nadie.** `EtiquetasLista.tsx:652-694` guarda el % sin confirmar y sin decir a cuántas prendas llega; no exige fechas (`valido` no las pide: con `vigente_desde/hasta` nulos `fn_campanas_por_variante` rige **siempre**); la tabla permite hasta 100 % (`etiquetas_descuento_rango`). No queda quién lo cambió: `etiquetas` solo tiene `propuesto_por`, `aprobado_por` y `aprobado_en`, y no existe una tabla `etiquetas_historial` `[producción-agente]`. En producción: «Aniversario CAYLA» (10 %, 1–14 oct, empieza en 2 días) y «Para liquidar» (20 %, 23 sep–1 oct, vence en 2 días) tienen **0 prendas etiquetadas y 0 categorías alcanzadas** `[producción-agente]`: la tarjeta dice «vigente» y no rebaja nada.
2. **Las etiquetas de rotación prometen algo que no existe.** La nota de «Top ventas» dice «se aplica según rotación real medida por el sistema, nunca a criterio manual», y producción tiene **4 prendas con esa etiqueta puesta a mano** `[producción-agente]`. No hay cron ni trigger que mida nada: solo tres caminos manuales escriben `variante_etiquetas` `[código]`. Las notas, además, están escritas en jerga interna («Patrón Bershka», «`lib/inteligencia.ts`», «`fn_etiquetas_estado_trigger`») y se muestran en el «!» de cada tarjeta (`kit.tsx:181`).
3. **«Lo puede usar de inmediato» es falso para tallas, tejidos, patrones y etiquetas.** El texto sigue en `page.tsx:234-236` y en los subtítulos de los modales (`TallasLista.tsx:325`, `TejidosLista.tsx:337`, `PatronesLista.tsx`, `EtiquetasLista.tsx:506`); solo Color se filtra por `activo` (`alta-producto-datos.ts:76`). Los demás exigen `estado = 'aprobado'` (`:84-91`) y, aun aprobado, un tejido, talla o patrón nuevo **no sirve en una categoría hasta habilitarlo en Categorías** (`20260918231100:171-175`); ninguna pantalla lo dice.
4. **Las seis pestañas se ven iguales y se comportan distinto** (integridad conceptual): aprobar exige comentario en Tallas y Etiquetas y un clic en Colores, Tejidos y Patrones; desactivar vive dentro de «Editar» solo en Colores; editar existe solo en Colores; el estado vacío existe solo en Tejidos y Patrones; las notas (motivo de rechazo) no se muestran en Tejidos y Patrones; dos normalizadores de búsqueda; y tres criterios de «en uso» para bloquear desactivar.
5. Trade-off: no toques el kit visual ni las tarjetas de Tallas y Patrones (son lo mejor de la pantalla). Arregla el freno del descuento y las promesas de las etiquetas **antes del 2026-10-01**, y decide con Felipe el rumbo de las etiquetas de rotación (#9) antes de invertir más en ellas.

## 3 · Lo que está bien y no se toca
- **Candados de tabla:** unicidad de nombre sin mayúsculas/tildes/espacios en las cinco tablas (`*_clave_unica` sobre `fn_clave_texto`); `estado` ∈ {pendiente, aprobado, rechazado} y «rechazado ⇒ inactivo»; en etiquetas, `etiquetas_descuento_rango`, `etiquetas_descuento_solo_aprobada` (una propuesta no nace con «100 %»), `etiquetas_vigencia_coherente` y `etiquetas_estilo_valido`; en colores, formato de hex y de Pantone (único) `[producción-agente A2, A3]`.
- **RLS activo en todas las tablas** (`temporadas` con RLS y 0 políticas, sin `GRANT` a `authenticated`: solo se lee por función, la convención de CLAUDE.md) `[producción-agente D2]`.
- **Aprobar una etiqueta ya funciona:** `lib/etiqueta-aprobacion-reglas.ts:23` arma el cuerpo con el comentario y no deja enviarlo vacío; prueba `pnpm pruebas:etiquetas-aprobar` (commit `2f17bc2d`, 2026-09-26). Cerró el fallo que el análisis del 21-sep predijo.
- **Nada se borra:** desactivar/reactivar con sección aparte; desactivar se bloquea si el valor está en uso (409) `[código *route.ts]`.
- **Vigencia calculada al leer, con fecha de Lima** (`fn_hoy_lima`, `etiqueta-vigencia.ts:17-30`), sin cron que se caiga; tolerancia de 3 días para ventas sin red (`20260922150000:351,460`).
- **La venta guarda la campaña** (`descuento_etiqueta_id`, `20260918170000`): el rastro del lado de la caja existe aunque el del cambio no.
- **`registrar_venta` verifica la campaña** y rechaza lo que no cuadre (`venta_campana_no_vigente`).
- **Las ilustraciones no mienten:** un tejido o patrón sin dibujo muestra «Sin muestra» (`MuestraTejido.tsx`); la talla es el propio texto `[visto]`.
- **El kit de ADR-0261 se usa en las seis pestañas:** misma barra de píldoras, buscador y tarjeta `[visto]`.
- **Aviso de costo solo para Líder:** el costo no viaja a otros roles (`page.tsx`).

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7,5 | Kit uniforme y limpio; desborda a 1024 px y el «!» muestra jerga interna | `[visto]` `[producción-agente]` |
| Lógica de negocio | 6 | Descuento sin freno, sin fechas obligatorias, hoy sin alcance; rotación prometida y no medida | `[código EtiquetasLista.tsx:652-694]` `[producción-agente]` |
| Arquitectura | 6,5 | Buenos candados de tabla; «en uso» es un chequeo previo no atómico; sin auditoría de descuento | `[código]` `[producción-agente]` |
| Funciones | 6 | Editar solo en Colores; «Configurar campaña» en todas; etiqueta nueva no se puede editar | `[código]` |
| Utilidad | 6 | «Llega una temporada nueva» = tres pantallas y tres dudas | `[código]` `[inferido]` |
| Conexión con el ERP | 7,5 | Alimenta alta, edición, Vender, etiquetas de precio y Frescura | `[código]` |

### Estética (7,5)
- `[visto]` Encabezado corto, seis píldoras (Etiquetas, Colores, Tallas, Tejidos, Patrones, Temporadas), un texto de ayuda por pestaña, filtros en píldoras, buscador y «+ Agregar X» a la derecha. Las tarjetas de Colores (con muestra, código Pantone) y Patrones (con dibujo) son de lo mejor del ERP.
- `[visto]` **A 1024 px de ancho la página desborda 10 px en horizontal** y el pie de las tarjetas de Etiquetas corta «CONFIGURAR CAMPAÑA» (contenedor de 657 px con contenido de 707 px; tarjeta de 120 px con contenido de 155 px). En escritorio grande no se ve; en tablet horizontal sí.
- `[producción-agente]` Las notas que salen en el «!» de las etiquetas usan lenguaje de desarrollo («Patrón Bershka», «`lib/inteligencia.ts`»): una colaboradora no debería leerlo.
- Rojo dentro de norma `[visto]`. Cabecera simple de Catálogo, no `<EncabezadoPagina>`: **sin decidir** por CLAUDE.md, es pregunta a Felipe.

### Lógica de negocio (6)
- Regla violada #1: CLAUDE.md principio 2 (cero estados inconsistentes): un descuento sin fechas es permanente y sin dueño, un estado que el esquema debería impedir; ninguna decisión escrita cubre esto (ADR-0108 dejó «sin tope» a propósito, pero no «sin fechas, sin confirmar y sin rastro»).
- Regla violada #2: el error es del diseño, no de la persona (criterio global, exigencia 12): la nota de «Top ventas» promete lo que el sistema no hace, y el copy de «de inmediato» promete lo que la base contradice.
- **Solape de campañas:** gana el mayor porcentaje, no se suman, y la pantalla no avisa cuando dos se pisan (`fn_campanas_por_variante`, `20260918170000:75`).
- **Aprobar puede ser autoaprobarse:** el trigger no lo impide (`[código agente]`); con pocos líderes es aceptable, pero queda sin traza.
- **Desactivar una campaña o cambiar su % con la caja abierta** hace que esa caja reciba `venta_campana_no_vigente` hasta recargar: el cajero ve un rechazo sin explicación.

### Arquitectura (6,5)
- **Transacción:** cada alta, aprobación y campaña es una llamada a su ruta `/api` o RPC; guardar campaña es `actualizar_campana_etiqueta` (una transacción). No hay escritura a medias.
- **Concurrencia:** «en uso» al desactivar es un chequeo previo, no atómico (el comentario de la siembra `20260917230100:75` lo atribuye al trigger, erróneamente): dos personas, una desactiva un color mientras la otra lo usa en una prenda nueva → puede quedar un color inactivo en uso; el disparador de estado no lo evita. `[no verificable]` con carga real.
- **Volumen:** 77 colores, 30 tallas, 26 tejidos, 10 patrones, 24 etiquetas, 9 temporadas `[producción-agente]`: la pantalla carga todo en servidor sin problema; un cambio de pestaña es una recarga de servidor (`AtributosHub.tsx:149-160`).
- **Caída externa:** ninguna dependencia externa. Se degrada así: si una lectura falla sale la pantalla de error general; no se pierde ningún dato.
- **Auditoría:** ninguna tabla de historial para etiquetas ni para el vocabulario; sí existen `roles_historial`, `configuracion_historial` y `colaboradores_historial` `[producción-agente]`: el patrón está.
- **Duplicación:** `TejidosLista` y `PatronesLista` son casi idénticas (439 líneas cada una, ~126 de diferencia); los `try/fetch/catch` de las seis son casi el mismo bloque.
- **Candados solo en API o pantalla:** código de color de 3 letras y hex obligatorios (la tabla acepta NULL); nombre no vacío y sin largo máximo (Marcas sí tiene `btrim <> ''`); fechas de una campaña con descuento; el trigger no bloquea «aprobado → pendiente» por `UPDATE` directo.

### Funciones (6)
- **Existen y funcionan:** proponer/aprobar/rechazar/desactivar/reactivar en las seis; buscador; segmentación por píldoras; «Prendas» con vista previa y tope de 50 cambios (ADR-0112); vigencia en chip; «Imprimir etiquetas de precio» / «Volver al precio normal»; cuatro vistas de Temporadas.
- **Engañosas:** «Configurar campaña» sale en todas las etiquetas, incluida «Pieza única» y «Hecho a mano»; «Desactivar» dice «Deja de aparecer al etiquetar» y no que la campaña **deja de cobrarse** en Vender; la tarjeta dice «Sin prendas etiquetadas» aunque una campaña cubra categorías (`EtiquetasLista.tsx:148-152`).
- **Faltan:** editar nombre, nota y estilo de una etiqueta (las nuevas nacen «General»); editar en Tallas, Tejidos y Patrones (la API de tejidos/patrones ya acepta `nombre`); ver cuántas prendas usan un color o una talla; confirmar antes de guardar un descuento; bandeja única de pendientes.
- **Sobran:** código muerto: `DESCUENTO_YA_SE_APLICA = true` (`EtiquetasLista.tsx:91`), comentarios que ya no describen la pantalla (`ColoresLista.tsx:166, 264`, «aún sin construir» en `:619`).

### Utilidad — persona sin contexto (6)
Escenario real: *llega una temporada nueva con un color y un tejido que no existen.*
1. Colores ▸ «+ Agregar color»: la colaboradora debe elegir un hex y un código de 3 letras. Un integrante lo deja **pendiente**, pero el alta sí lo ofrece (Color se filtra por `activo`).
2. Tejidos ▸ «+ Agregar tejido»: el modal dice «Queda disponible de inmediato» y es falso: está pendiente y el alta lo filtra por aprobado.
3. **Duda 1:** tras aprobarlo, tampoco aparece en su categoría hasta habilitarlo en Categorías; nada en Atributos lo dice, la tarjeta solo dice «Sin prendas».
4. **Duda 2:** si se equivoca al escribir el nombre de un tejido, **no puede renombrarlo**.
5. **Duda 3:** si un color pendiente ya se usó en una prenda, no se puede rechazar ni desactivar; queda aprobar y corregir la prenda.
6. La líder aprueba: comentario obligatorio en Tallas y Etiquetas, un clic en Colores, Tejidos y Patrones.
7. Temporadas: asignar las prendas nuevas en «Por completar» (hasta 500) o fijar la temporada por categoría.
8. Campaña de temporada: el modal deja guardar % sin fechas y sin confirmar alcance.

### Conexión con el ERP (7,5) — ver §6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 6 | Raíz de los datos de toda prenda y decide campañas; pero hoy hay 4 prendas etiquetadas y 2 campañas sin alcance |
| Dinero y stock que toca | ×1 | 6 | El descuento de una campaña llega a caja; no mueve stock |
| Frecuencia y personas que la usan | ×1 | 4 | Pocas veces por semana; más al abrir temporada o cargar el censo |
| Qué se detiene si falla | ×1 | 6 | Sin valores aprobados (talla, tejido, patrón) no se da de alta una prenda; color sí |

Relevancia = (2·6 + 6 + 4 + 6) / 5 = **5,6** — Comodidad.

## 6 · Conexión con el ERP
- **Aguas arriba:** Categorías (habilita tallas, tejidos y patrones por categoría); Nuevo producto y Censo (proponen valores «al vuelo»).
- **Aguas abajo:** Nuevo producto y Editar (`alta-producto-datos.ts`, `[id]/editar/page.tsx`); temporada por color en la ficha (`catalogo-v2.ts:600-660`); Vender (`vender/page.tsx:68`, campañas; `descuentoDeCampana`, exacto al céntimo, ADR-0302); Etiquetas de precio (`lib/etiquetas-precio.ts`, misma regla de la caja); Conteo y Productos (colores); Frescura (temporadas, `lib/frescura.ts:68`); historial de producto (ids de color y talla). Buscar-prenda **no** usa los sinónimos de color.
- **Pájaro dueño y vecinos:** 02 Loro (catálogo). Vecinos: Ventas (campañas) y Frescura (temporadas).
- **Externos, y qué pasa si caen:** ninguno. Se degrada así: nada externo de qué depender; si Supabase no responde la pantalla no carga y no se pierde ningún dato. La caja, en cambio, puede rechazar ventas con campaña recién cambiada hasta recargar.
- **¿Renombrar o desactivar rompe algo?** Desactivar un color se bloquea con variantes activas; renombrar cambia el nombre en todas las pantallas sin reescribir ventas; renombrar una talla por API no recalcula los códigos ya asignados (`variantes.codigo` se calcula una vez).

## 7 · Las 12 tareas, por importancia

### #1 · Reconstruir — Freno humano y alcance real antes de guardar un descuento de campaña
- **Dónde:** `EtiquetasLista.tsx:652-694` (confirmación con «N % a M prendas de K categorías»; exigir fechas; avisar 100 % y bajo costo); `actualizar_campana_etiqueta` (devolver el alcance); `CHECK` nuevo `etiquetas_descuento_con_fechas` en la tabla.
- **Por qué en este puesto:** es dinero en caja. Y hoy mismo: «Aniversario CAYLA» empieza en 2 días y «Para liquidar» vence en 2, y ninguna llega a una sola prenda; nadie lo ve porque la tarjeta dice «vigente».
- **Cómo lo verificas tú:** al guardar «Aniversario CAYLA» el modal dice «Llegará a 0 prendas» y no deja confirmar; guardar un % sin fechas falla con mensaje claro; un 100 % pide una segunda confirmación.
- **Esfuerzo / dependencias:** M · migración con `retail.` (las dos filas actuales ya tienen fechas: el `CHECK` no rompe nada) y **confirmación de Felipe antes de pegarla**.
- **DECIDÍ:** confirmar en pantalla, exigir fechas en la tabla y que la RPC devuelva el alcance. **DESCARTÉ:** imponer un tope de porcentaje, porque ADR-0108 lo dejó sin tope a propósito (decisión de Felipe) y un tope rígido frenaría una liquidación real. **SE ROMPE SI:** se programa una campaña «Todo el año» sin vencimiento a propósito (ej. «Colaboradores»): habrá que permitirla con una fecha lejana explícita, no con NULL.

### #2 · Corregir — Que las etiquetas de rotación digan la verdad
- **Dónde:** `etiquetas.notas` de «Top ventas», «Nuevo», «Últimas unidades», «Para liquidar» y las artesanales (dato); `kit.tsx:181` (el «!»); `EtiquetasLista.tsx:148-152` («Sin prendas etiquetadas»).
- **Por qué en este puesto:** las notas afirman una medición inexistente, hay 4 prendas «Top ventas» a mano, y la jerga interna se ve en pantalla. Bajo daño hoy, alto en confianza cuando alguien decida por esa etiqueta.
- **Cómo lo verificas tú:** el «!» de «Top ventas» dice «Por ahora se marca a mano»; ninguna nota nombra un archivo, un trigger ni una marca ajena.
- **Esfuerzo / dependencias:** S · ninguna (`UPDATE` de 7 filas, no de esquema).

### #3 · Corregir — «Lo puede usar de inmediato» y el puente a Categorías
- **Dónde:** `page.tsx:234-236`, `TallasLista.tsx:325` y `:141-142`, `TejidosLista.tsx:337`, `PatronesLista.tsx`, `EtiquetasLista.tsx:506`.
- **Por qué en este puesto:** el mismo texto falso en cinco lugares es una sola tarea raíz; hace que la colaboradora crea que un tejido «ya sirve» y el alta lo rechace. Es el mismo defecto que aparece como «Fuera de esta pantalla» en Categorías.
- **Cómo lo verificas tú:** proponer un tejido dice «Queda pendiente hasta que un líder lo apruebe; después habilítalo en Categorías» con un enlace a esa categoría.
- **Esfuerzo / dependencias:** S · ninguna.

### #4 · Reconstruir — Rastro de quién cambia el vocabulario y los descuentos
- **Dónde:** una tabla de historial del catálogo escrita por las RPC y rutas (`etiquetas`, y las demás), igual al patrón de `configuracion_historial`; `actualizar_campana_etiqueta`.
- **Por qué en este puesto:** el descuento es la única cosa de esta pantalla que cambia precios sin que se sepa quién, y la misma falta aparece en Marcas (#4 de `productos-marcas.md`): es una **raíz compartida**, no dos tareas.
- **Cómo lo verificas tú:** cambiar el % de «Aniversario CAYLA» y ver en el historial «de 10 a 15 %, [responsable], hoy 14:05».
- **Esfuerzo / dependencias:** M · **no antes de decidir el diseño único en `catalogo-plan-de-ataque.md`** (una tabla genérica o una por dominio).
- **DECIDÍ:** una sola tabla de historial de vocabulario para todo Catálogo. **DESCARTÉ:** una tabla por pantalla (marcas, etiquetas, categorías…), porque son ocho tablas con la misma forma y dos formas de leerlas. **SE ROMPE SI:** se guarda el «antes» y «después» como texto libre y luego alguien quiere filtrar por porcentaje: guardar campo, valor anterior y valor nuevo por separado.

### #5 · Corregir — Desactivar una campaña con la caja abierta, y la etiqueta que no se deja quitar
- **Dónde:** `EtiquetasLista.tsx:379-394` (el texto de «Desactivar»); `fn_campanas_por_variante` (exige `activo`); `PrendasDeEtiquetaModal.tsx:90,106` (solo carga variantes activas).
- **Por qué en este puesto:** en hora pico, apagar una campaña hace que la caja rechace ventas con `venta_campana_no_vigente` hasta recargar, y nadie se lo dijo a quien la apagó; y una etiqueta con filas en variantes inactivas no se puede desactivar ni quitar desde «Prendas» (`[no confirmado de punta a punta]`).
- **Cómo lo verificas tú:** «Desactivar» en una campaña con prendas dice «Deja de cobrarse en Vender; las cajas abiertas se actualizan al recargar»; una etiqueta con variantes inactivas ofrece quitarlas.
- **Esfuerzo / dependencias:** S–M · ninguna.

### #6 · Eliminar/fusionar — Un solo comportamiento entre las seis pestañas
- **Dónde:** `ColoresLista.tsx`, `TallasLista.tsx`, `TejidosLista.tsx`, `PatronesLista.tsx`, `EtiquetasLista.tsx`, `kit.tsx`; `atributos-buscar.ts` y `patron-visual` (dos normalizadores).
- **Por qué en este puesto:** cinco decisiones iguales tomadas de cinco formas (aprobar, desactivar, editar, estado vacío, notas visibles): una está mal aunque todas «funcionen» (Brooks). Con el censo, las cinco se usarán más.
- **Cómo lo verificas tú:** en cualquier pestaña, aprobar pide el mismo comentario, desactivar está en el mismo sitio, «Editar» existe y el rechazo deja ver su motivo.
- **Esfuerzo / dependencias:** L · después de la #3 (copys) y de decidir si aprobar exige comentario en todas o solo donde el trigger lo pide.

### #7 · Mejorar — Una bandeja única «Por aprobar»
- **Dónde:** `AtributosHub.tsx` (contador por pestaña); `lib/useColaProductos.ts` (la cola de productos por revisar ya existe).
- **Por qué en este puesto:** producción hoy no tiene nada pendiente `[producción-agente]`, pero el censo creará colores, tallas y productos «al vuelo»; la líder tendrá que abrir cada pestaña y la ficha de cada producto para encontrarlos `[inferido]`.
- **Cómo lo verificas tú:** tras proponer un color y una talla, un contador «2 por aprobar» aparece en el menú y lleva a una lista única.
- **Esfuerzo / dependencias:** M · después de la #6.

### #8 · Mejorar — Candados de nombre y poder renombrar
- **Dónde:** `CHECK (btrim(nombre) <> '' and length(nombre) <= 60)` en las cinco tablas (Marcas ya lo tiene); `TejidosLista`, `PatronesLista`, `TallasLista`, `EtiquetasLista` (renombrar; la API de tejidos y patrones ya acepta `nombre`).
- **Por qué en este puesto:** hoy un nombre vacío o de 300 letras pasa la base, y una errata en un tejido no tiene arreglo.
- **Cómo lo verificas tú:** crear un tejido con solo espacios falla; renombrar «Algodon» a «Algodón» funciona y el nombre cambia en todas las prendas.
- **Esfuerzo / dependencias:** M · una migración de varias tablas con `CHECK`; cuidado con los valores actuales (comprobar que ninguno viola antes de pegar).

### #9 · Replantear — ¿Etiquetas calculadas (rotación) y etiquetas manuales (campaña) en una misma pantalla?
- **Dónde:** las 24 etiquetas (`etiquetas`, `variante_etiquetas`, `etiqueta_categorias`) y `kit.tsx`.
- **Por qué en este puesto:** la mitad de las etiquetas promete una medición que nadie construyó, y hay 4 prendas etiquetadas de 24; no es un defecto, es una decisión de rumbo (ya estaba como #6 del análisis del 21-sep, sin resolver).
- **Cómo lo verificas tú:** — (pide una decisión).
- **Esfuerzo / dependencias:** M–L según la respuesta · después de la #2.
- **DECIDÍ:** proponerle a Felipe separar dos familias: **campañas** (manuales, con fechas y descuento) y **rotación** (calculadas por el sistema, sin que nadie las ponga). **DESCARTÉ:** dejarlo todo manual y quitar la promesa (la #2 ya lo hace de forma provisional), porque el valor de «Últimas unidades» o «Top ventas» es justamente que nadie decida a criterio. **SE ROMPE SI:** se calcula «Top ventas» con ventas de una sola tienda o de pocos días y se etiqueta una prenda por azar: con 3 tiendas y catálogo nuevo, las ventas no alcanzan para medir.

### #10 · Corregir — Desborde a 1024 px y contraste
- **Dónde:** `EtiquetasLista.tsx` (pie de tarjeta), contenedores de 657 px con contenido de 707 px; piso tipográfico de ADR-0012 (`docs/adr/0012-piso-de-contraste-y-esquinas-suaves.md`).
- **Por qué en este puesto:** solo se ve en tablet horizontal; en escritorio no. Es la misma tarea raíz de piso tipográfico que en otras pantallas.
- **Cómo lo verificas tú:** a 1024 px `documentElement.scrollWidth` es igual a `clientWidth` y «CONFIGURAR CAMPAÑA» se lee entero.
- **Esfuerzo / dependencias:** S.

### #11 · Mejorar — Renovar una campaña de un año al siguiente *(bajo valor / opcional)*
- **Dónde:** `EtiquetasLista.tsx:621` (modal de campaña); las 13 campañas de calendario (fechas de 2026 sin año visible).
- **Por qué en este puesto:** después de Black Friday las fechas quedan del año pasado y hay que reescribirlas a mano; ahorra minutos una vez al año.
- **Cómo lo verificas tú:** «Renovar para 2027» copia el % y las categorías con las fechas del año siguiente.
- **Esfuerzo / dependencias:** S · después de la #1.

### #12 · Eliminar/fusionar — Código muerto y duplicado · *bajo valor / opcional*
- **Dónde:** `DESCUENTO_YA_SE_APLICA` (`EtiquetasLista.tsx:91`), comentarios viejos (`ColoresLista.tsx:166, 264`; `AtributosHub.tsx` encabezado), `page.tsx` (tipo de `estado` de color); `TejidosLista` ≈ `PatronesLista`.
- **Por qué en este puesto:** no dañan datos; ahorran lectura a la próxima persona y evitan que un cambio en uno olvide al otro.
- **Cómo lo verificas tú:** `TejidosLista` y `PatronesLista` comparten un solo componente; `grep DESCUENTO_YA_SE_APLICA` da 0.
- **Esfuerzo / dependencias:** M · después de la #6.

## 8 · Estrategia alternativa
La de la #9. **Ganas:** las etiquetas dejan de mentir y la caja solo cobra descuento de campañas hechas por personas con fechas; lo calculado se hace bien una vez. **Pagas:** construir la medición (ventas por prenda y ventana de días) o vivir sin esas etiquetas. **No cambia** las seis pestañas ni el kit. Decide Felipe.

## 9 · Referentes de ERP y futuro
- *(De memoria, no verificado)* Shopify y Odoo ligan un descuento a una regla con fechas y alcance visible antes de activarla; la vista previa del alcance es estándar. Odoo maneja «etiquetas» como campo libre sin flujo de aprobación; el flujo proponer/aprobar de CAYLA es más estricto y con 3 tiendas y un taller es razonable.
- **Futuro (no cuenta entre las 12):** vigencia por sede; campañas que se apilen con reglas; sinónimos de color también en Buscar-prenda.

## 10 · Fuera de esta pantalla
**Categorías decide qué tejidos, tallas y patrones puede usar una prenda, y Atributos lo promete al revés**: aprobar un valor aquí no lo hace disponible en la categoría. La persona sigue el texto de Atributos y el alta la contradice.

## 11 · Líneas propuestas para el backlog
- [ ] `[pantalla:atributos]` #1 Confirmar alcance, fechas obligatorias y aviso de 100 % en campañas — M (antes del 2026-10-01)
- [ ] `[pantalla:atributos]` #2 Etiquetas de rotación: notas y «!» sin promesas falsas ni jerga — S
- [ ] `[pantalla:atributos]` #3 «Lo puede usar de inmediato» + puente a Categorías (5 sitios) — S
- [ ] `[pantalla:atributos]` #4 Historial único del vocabulario y de los descuentos (raíz con Marcas #4) — M
- [ ] `[pantalla:atributos]` #5 Desactivar campaña con caja abierta y etiqueta en uso — S–M
- [ ] `[pantalla:atributos]` #6 Un solo comportamiento entre las seis pestañas — L
- [ ] `[pantalla:atributos]` #7 Bandeja única «Por aprobar» — M
- [ ] `[pantalla:atributos]` #8 Candados de nombre + renombrar — M
- [ ] `[pantalla:atributos]` #9 Decidir: etiquetas calculadas vs. manuales — M–L
- [ ] `[pantalla:atributos]` #10 Desborde a 1024 px y contraste — S
- [ ] `[pantalla:atributos]` #11 Renovar campaña de un año al siguiente — S (bajo valor)
- [ ] `[pantalla:atributos]` #12 Código muerto y duplicado (Tejidos ≈ Patrones) — M (bajo valor)

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Título + «!» + seis pestañas | Recarga de servidor por pestaña | bien | `[visto]` `[código AtributosHub.tsx:149-160]` |
| Etiquetas | Píldoras por estilo + «Vigentes hoy» | Filtra | bien | `[visto]` |
| Etiquetas | «!» de cada tarjeta | Muestra `notas` | **ajustar** (jerga y promesa falsa) | `[producción-agente]` `[código kit.tsx:181]` |
| Etiquetas | «Configurar campaña» | Guarda % y fechas | **ajustar** (sin confirmar ni fechas obligatorias) | `[código EtiquetasLista.tsx:652-694]` |
| Etiquetas | «Prendas» | Vista previa y lote (tope 50) | bien | `[código PrendasDeEtiquetaModal.tsx:145]` |
| Etiquetas | «Desactivar» | Apaga y deja de cobrar | ajustar (no lo dice) | `[código :379-394]` |
| Colores | Tarjeta con muestra y Pantone | Editar completo | bien | `[visto]` |
| Tallas | Tarjeta y aviso del equipo | Sin editar ni ver uso; jerga interna | ajustar | `[código AtributosHub.tsx:68]` |
| Tejidos / Patrones | «En uso / Sin prendas» + detalle | Foto, dibujo y prendas; notas invisibles | ajustar (notas) | `[código kit.tsx:180]` |
| Temporadas | Grilla, completar, por categoría, calendario | Asigna y fija fechas (solo líder) | bien | `[código TemporadasLista.tsx]` |
| — | Bandeja de pendientes / historial del vocabulario | No existen | falta | `[producción-agente]` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-21 | completo | 6,1 | 5,8 | — (primer análisis) |
| 2026-09-29 | completo, re-análisis (código + producción por agente + recorrido visual) | 5,0 (tope) | 5,6 (Comodidad) | Del análisis del 21-sep, **cerradas 2 de 12**: #4 «Aprobar exige comentario» (commit `2f17bc2d`) y #5 «la verdad sobre una propuesta» en parte (Etiquetas corrigió su aviso). **Siguen abiertas** #1 (alcance verdadero), #2 (freno del descuento), #3 (rastro), #6 (Replantear rotación), #7 (jerga de los «!»), #8, #9, #10, #11 y #12. Baja de 6,1 a 5,0 por el tope de dinero, no por regresión: el descuento nunca tuvo freno |
