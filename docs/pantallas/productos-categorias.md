# Pantalla — Categorías (`/productos/categorias`) y Familias (`/productos/familias`)

> Modo: completo (re-análisis) · Fecha: 2026-09-29 · Rol/sede: líder y admin, Tienda Lima (la pantalla no depende de sede) · Datos: **real** — consultas de solo lectura a producción hechas por el agente en la sesión (no las corrió Felipe; el apéndice de `catalogo-plan-de-ataque.md` las lista para que las confirme) y recorrido visual en local (42 categorías activas de siembra; producción tiene 44)
> SHA analizado: `38f9d7ce` (origin/main; el código se leyó en `123bb733` y entre los dos solo cambió `alta-producto/ProductoCreado.tsx`). Si cambian `categorias/page.tsx`, `CategoriasLista.tsx`, `FamiliasLista.tsx`, `api/productos/categorias/*` o las migraciones `20260927200000`, este análisis está vencido.
> Archivos: `apps/web/app/(app)/productos/categorias/{page,layout}.tsx` · `components/CategoriasLista.tsx` · `components/IconoFamilia.tsx` · `app/(app)/productos/familias/page.tsx` + `components/FamiliasLista.tsx` · `lib/categorias-reglas.ts` · `lib/catalogo-v2.ts` (`getEjesPorCategoria`) · `app/api/productos/categorias/route.ts` y `/ejes/route.ts` · RPC `actualizar_categoria`, `desactivar_categoria`, `reactivar_categoria`, `actualizar_categoria_ejes`, `fn_productos_por_categoria` · disparadores `categorias_valida_subcategoria`, `categorias_vigencia_candados` · tablas `categorias`, `familias`, `categoria_tallas`, `categoria_tejidos`, `categoria_patrones`, `productos`
> Otra sesión tocándola: **no directamente** (`docs/SESIONES-ACTIVAS.md` no lista Categorías). Rozan: la del alta con stock inicial (`crear_producto_con_variantes` exige tejidos y patrones de la categoría) y la auditoría de TRU (D4 «tejido vacío en lo sin dato»).
> **Re-análisis.** El anterior (`b6b85206`, 2026-09-21) estaba **vencido** (11 commits sobre `categorias/` y `CategoriasLista.tsx`, +270 líneas) y no se tomó como base; se leyó solo para marcar qué tareas se cerraron (Historial). Familias se analiza aquí porque es la mitad escondida del mismo vocabulario.
> Etiquetas: `[visto]` captura · `[código archivo:línea]` · `[producción-agente]` consulta de solo lectura del 2026-09-29 · `[inferido]` · `[no verificable]`.

## 0 · Veredicto
La pantalla mejoró de verdad desde el 21-sep: los candados que vivían solo en la pantalla ya están **en la tabla** (disparador `categorias_vigencia_candados`) y en producción hoy no hay ningún estado imposible. Lo que queda es (1) una decisión pendiente que **puede frenar la carga de mañana** —la familia Indumentaria exige tejido y patrón en cada prenda y cambiar eso solo se puede con SQL—, (2) que **guardar una categoría son dos llamadas** y quitar un tejido o un patrón puede dejar productos que ya no se pueden guardar sin avisar, y (3) un vocabulario de 44 categorías de las que solo 1 se usa, con dos de prueba («dsa», «prueba Lapicero») vivas en producción.
**Cumple su finalidad:** 7,1/10 · **Relevancia:** 5,8/10 — Comodidad (pero es raíz del código de cada prenda, de la curva de tallas y de qué campañas llegan a qué categorías)

## 1 · Finalidad declarada
"Esta pantalla existe para mantener el vocabulario cerrado de categorías (familia + prefijo de 3 letras + qué tallas, tejidos y patrones ofrece cada una), del que dependen el código de cada prenda, la curva habitual de tallas al crear un producto y el alcance de las campañas de descuento." Fuente: ADR-0062 (un solo nivel), ADR-0095 y ADR-0096 (taxonomía y familias), ADR-0103 (familias como tabla), ADR-0109 (curva habitual) y `page.tsx`; **no la captura**. ¿Docs y pantalla coinciden? **Sí**, con dos comentarios viejos: `api/productos/categorias/route.ts:9` dice «6 familias fijas» (ya es una tabla) y `page.tsx:37-39` promete un «candado visual» de desactivar que no existe en la pantalla. Ninguna decisión D-nn cubre categorías: mandan los ADR.

## 2 · Objeción
1. **Cambiar una regla de la familia solo se puede con SQL, y mañana puede hacer falta.** `familias.exige_tejido_patron` es `true` para Indumentaria (19 categorías activas) `[producción-agente]`, y `crear_producto_con_variantes` exige tejido y patrón dentro de los habilitados de la categoría (`20260918231100:171-175`). El censo de TRU entra por esa RPC. La decisión D4 de la auditoría («tejido vacío en lo sin dato») sigue abierta: si Felipe decide permitir vacío, la pantalla **no tiene dónde** cambiarlo. `/productos/familias` existe pero está escondida (solo la enlaza la Ayuda de Categorías, `page.tsx:127`), y no edita `exige_tejido_patron`, ni el orden, ni el ícono (`FamiliasLista.tsx`). En producción hoy las 19 categorías de Indumentaria sí tienen tejidos y patrones habilitados, así que el alta no se atasca por eso; el riesgo es la decisión, no el dato.
2. **Guardar una categoría son dos escrituras sin transacción, y quitar un eje puede romper productos existentes sin avisar.** `CategoriasLista.tsx:216-268` llama a `PUT /api/productos/categorias` (datos) y después a `PUT …/ejes` (tallas, tejidos, patrones). Si la segunda falla, la categoría queda con datos nuevos y ejes viejos. Y **desmarcar un tejido o un patrón que productos ya usan no avisa**: `catalogo_actualizar_producto` después rechaza guardar esos productos (`20260918231100:508-517`). Además, los valores luego desactivados o pendientes no se ven en el editor (`catalogo-v2.ts:712-720`) y el guardado los borra en silencio.
3. **Todavía hay cuatro estados imposibles posibles en la tabla.** El disparador nuevo solo corre en `UPDATE`: un `INSERT` directo puede crear una categoría activa sin familia ni prefijo (las columnas son nullable); cambiar la familia de un padre no baja a sus hijas; desactivar un padre con hijas activas no se bloquea; y un `UPDATE` directo en `productos` puede apuntar a una categoría inactiva (`BACKLOG.md:372`). Hoy: 0 casos `[producción-agente]`. Es prevención, no incendio.
4. **La cabecera y las tarjetas cuentan universos distintos.** `page.tsx:109-113` suma todo lo que devuelve `fn_productos_por_categoria`, incluidas categorías inactivas y subcategorías; la tarjeta de un padre no suma las de sus hijas (`CategoriasLista.tsx:445`). «Cuadra» solo porque hoy hay 2 subcategorías y 0 productos en inactivas.
5. **Producción tiene 44 categorías activas y 43 no tienen un solo producto**, y dos son restos de prueba activos: «dsa» (`DSA`, Indumentaria) y «prueba Lapicero» (`PLP`, Papelería), sin tallas `[producción-agente]`. Mañana aparecen en el selector de Nuevo producto.
6. Trade-off: no reordenes el modelo (familia → categoría → subcategoría, un nivel) ni el diseño de las tarjetas: funcionan y son el mejor punto de la pantalla. Arregla lo que **duele mañana** (#1 y #7) y lo que puede corromper (#2 y #3) antes de pulir.

## 3 · Lo que está bien y no se toca
- **Los candados de tabla ya existen:** `categorias_vigencia_candados` (prefijo fijo con productos de cualquier estado; no desactivar con productos activos; una activa exige familia, prefijo y familia activa) `[producción-agente A—triggers]`; `categorias_valida_subcategoria` (un nivel, familia heredada); `categorias_prefijo_formato` (`^[A-Z]{3}$`), `categorias_prefijo_unico` y `categorias_nombre_clave_unica`; la FK de `productos.categoria_id` (sin cascade) impide borrar una categoría con productos `[producción-agente]`. Migración `20260927200000_categorias_candados_en_la_tabla.sql:120`.
- **Cero productos activos colgando de una categoría desactivada** y cero categorías activas sin familia o prefijo `[producción-agente]`: el estado imposible que el 21-sep estaba vivo («Blusas») ya no existe.
- **Reactivar ya no puede dejar una categoría huérfana:** regla (c) del disparador y `CategoriasLista.tsx:788-794` (oculta «Reactivar» si falta familia o prefijo); la «Polos» huérfana quedó renombrada «Polos (V1, retirada)» y desactivada `[producción-agente]`.
- **Nada se borra:** desactivar/reactivar con sección aparte `[visto]`.
- **RLS activo en las cinco tablas del vocabulario** `[producción-agente D2]`; escritura por `fn_puede_editar_catalogo()`; y la pantalla usa `puede(persona,"editarCatalogo")` en vez de comparar el rol (`page.tsx:146`, ADR-0161).
- **Curva habitual:** la marca ✓ de talla habitual la consume `NuevoProductoForm.tsx:267` y ya no depende de que una colaboradora recuerde la curva.
- **Cerrado desde el 21-sep, no reabrir:** orden humano de tallas (`compararTallas`), prefijo bloqueado con motivo (`prefijoFijo`), ícono de Accesorios, ejemplo por familia, buscador (`categorias-reglas.ts:14`).

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7,5 | Tarjetas por familia limpias y coherentes; 43 de 44 dicen «Sin productos» | `[visto]` |
| Lógica de negocio | 7,5 | Candados bien y ya en la tabla; el prefijo se congela sin avisar al crear | `[código CategoriasLista.tsx:497]` |
| Arquitectura | 7 | Trigger de tabla correcto; guardar en dos llamadas; cuatro estados posibles restantes | `[código CategoriasLista.tsx:216-268]` |
| Funciones | 6,5 | Falta crear con ejes, ver el efecto de quitar un eje y editar la familia | `[código CategoriasLista.tsx:683]` |
| Utilidad | 6,5 | «CAYLA vende pijamas» = 3 pantallas y 4 gestos; el paso que se olvida rompe el alta | `[código]` `[inferido]` |
| Conexión con el ERP | 7,5 | Alimenta código, curva, campañas y reportes; la temporada se ve aquí pero se cambia en Atributos | `[código]` |

### Estética (7,5)
- `[visto]` Cabecera corta «PRODUCTOS · CATÁLOGO», título, «!» y cifra «42 categorías activas · 10 productos activos clasificados»; buscador y «+ AGREGAR CATEGORÍA»; secciones por familia con ícono; tarjeta con prefijo en placa, nombre y «SIN PRODUCTOS». Mismo lenguaje que Marcas y Atributos.
- `[visto]` Con datos de producción (44 categorías, 43 vacías) casi todas las tarjetas repiten «SIN PRODUCTOS»: ruido que esconde la única con dato.
- `[código IconoFamilia.tsx:21-78]` seis códigos de familia fijos: una familia nueva sale como círculo.
- Sin rojo fuera de norma `[visto]`. La cabecera es la simple de Catálogo: en Catálogo solo Productos tiene `<EncabezadoPagina>` y el resto está **sin decidir** (pregunta a Felipe, no defecto).

### Lógica de negocio (7,5)
- Regla violada #1: CLAUDE.md, principio 2 (cero estados inconsistentes) — cuatro estados aún posibles en la tabla (objeción 3).
- Regla violada #2: D4 de la auditoría del 29-sep (tejido vacío en lo sin dato) está abierta y la familia lo fuerza: ninguna decisión escrita cubre esto.
- El **prefijo es permanente**: se asigna una vez (`fn_asignar_codigo_producto`, `20260912235500:176-190`) y el subtítulo del formulario (`CategoriasLista.tsx:497`) no avisa de que se congela con el primer producto.
- Desactivar con productos solo descontinuados **se permite**, y esos productos siguen apuntando a la categoría inactiva; el prefijo queda reservado para siempre `[código]`.

### Arquitectura (7)
- **Dos escrituras sin transacción** (datos y ejes): si falla la segunda, categoría a medias. Se degrada así: la base no queda inválida (los candados de tabla lo impiden) pero la categoría queda con ejes viejos y la persona ve «guardado».
- **Concurrencia:** dos líderes editan los ejes de la misma categoría; gana el último (sin control de versión); `[no verificable]` que lo noten. Baja probabilidad: pocas personas editan categorías.
- **Volumen:** 47 categorías, 6 familias, ~100 filas en las tres tablas puente; en 3 años cientos, no miles: no hay problema de rendimiento; la pantalla carga todo en servidor.
- **Caída externa:** ninguna dependencia externa; si falla una lectura, `exigir` lanza la pantalla de error general; no se pierde ningún dato.
- **Permisos:** `PUT …/ejes` no llama a `puede()` (`ejes/route.ts:17`); la RPC lo cubre, así que no es un hueco, pero es asimetría con las otras rutas. Los mensajes dicen «Solo un Líder» aunque el permiso ya lo tiene un rol con Productos o Atributos completo.
- **Prueba:** `scripts/pruebas/categorias_candados.mjs` existe pero **no corre en CI** (`ci-paridad.test.ts:33`).

### Funciones (6,5)
- **Existen y funcionan:** crear (INSERT vía API), editar (nombre, familia, prefijo mientras sea libre), desactivar/reactivar, subcategoría, editor de tallas/tejidos/patrones, curva habitual, vista rápida, buscador.
- **Engañosas:** «Desactivar» siempre activo (rechaza la base, no la pantalla) y sin confirmación, a diferencia de «Reactivar»; «Ver en Productos» de la vista rápida abre `/productos?cat=` y sin módulo Productos cae en «Sin acceso» (`CategoriasLista.tsx:913`).
- **Faltan:** elegir ejes al crear (`:683` exige estar editando), avisar cuántos productos dejan de poder guardarse al quitar un eje, editar `exige_tejido_patron` (solo por SQL), ver qué categorías nunca se usaron.
- **Sobran:** nada.

### Utilidad — persona sin contexto (6,5)
Escenario real: *CAYLA empieza a vender pijamas.*
1. Atributos: revisar o crear tallas, tejidos (satén, algodón) y patrones que falten (Categorías no tiene «+ nuevo valor»).
2. Categorías ▸ «+ Agregar categoría» (Pijamas, `PIJ`, Indumentaria) ▸ Guardar.
3. Tarjeta ▸ Editar ▸ marcar tallas, curva, tejidos y patrones ▸ Guardar.
4. Nuevo producto.
- **Dónde se equivoca:** saltarse el 3. Con Indumentaria, Nuevo producto falla con `categoria_sin_tejidos` (`20260918230100:203-210`); el alta tiene un panel de rescate (`ConfigurarCategoria.tsx`), así que la persona no se queda sin salida, pero ese panel y la pantalla de Categorías **editan los mismos ejes y se pisan** (`BACKLOG.md:330`).
- Acepta el prefijo sugerido sin saber que es permanente.
- El formulario solo detecta nombre o prefijo idénticos, no que «Conjuntos» o «Lencería» ya cubren parte del rubro.

### Conexión con el ERP (7,5) — ver §6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 7 | Raíz de todo reporte por categoría, del código de prenda y de la curva; pocas decisiones se toman aquí |
| Dinero y stock que toca | ×1 | 4 | No mueve stock; pero `etiqueta_categorias` decide a qué categorías llega un descuento en caja |
| Frecuencia y personas que la usan | ×1 | 3 | Se edita pocas veces; muchas lecturas indirectas desde el alta |
| Qué se detiene si falla | ×1 | 8 | Sin categoría activa y con ejes no se crea ningún producto: frena el censo y el alta |

Relevancia = (2·7 + 4 + 3 + 8) / 5 = **5,8** — Comodidad.

## 6 · Conexión con el ERP
- **Aguas arriba:** Familias (`familias`, y las 6 iniciales de ADR-0096); Atributos (los valores de tallas, tejidos y patrones que Categorías habilita).
- **Aguas abajo:** Nuevo producto (`alta-producto-datos.ts:74-87`: familias, categorías activas y ejes; `NuevoProductoForm.tsx:223-228, 267`: ejes y curva); `crear_producto_con_variantes` (exige categoría activa y valores dentro de los ejes); Editar producto, Productos, Vender y Conteo (solo ofrecen categorías activas); Etiquetas de campaña (`etiqueta_categorias`, categoría exacta: no sube al padre); Análisis, Inventario y Existencias (`left join categorias`, agrupan por la categoría exacta, incluidas las inactivas); `categorias.temporada`; `cotizaciones-maquila.ts:55` (`familia = 'indumentaria'` fija).
- **Pájaro dueño y vecinos:** 02 Loro (catálogo). Vecinos: Producción (cotizaciones de maquila), Frescura (temporadas) y Ventas (campañas).
- **Externos, y qué pasa si caen:** ninguno. Se degrada así: nada externo de qué depender; si Supabase no responde la pantalla no carga y no se pierde ningún dato.
- **¿Cambiar una categoría rompe algo?** Renombrar solo cambia el texto; cambiar el prefijo está bloqueado con productos; **cambiar la familia altera las exigencias de tejido y patrón y las cotizaciones de maquila** (sin aviso); quitar un tejido o patrón deja sin poder guardar los productos que lo usan (#2).

## 7 · Las 12 tareas, por importancia

### #1 · Corregir — Poder cambiar «exige tejido y patrón» sin SQL, y decidir D4 antes del censo
- **Dónde:** `familias.exige_tejido_patron`; `FamiliasLista.tsx` (226 líneas, sin ese campo); `api/productos/familias/route.ts` (POST/PUT/PATCH); `crear_producto_con_variantes` (`20260918231100:171-175`).
- **Por qué en este puesto:** mañana abre TRU con el catálogo entrando por lotes. La familia Indumentaria (19 categorías) exige tejido y patrón; si Felipe decide D4 = «permitir vacío», hoy solo se logra con un `UPDATE` a mano en producción. Es lo único de esta lista con fecha.
- **Cómo lo verificas tú:** en `/productos/familias`, Indumentaria muestra un interruptor «Exige tejido y patrón»; apagarlo permite crear una prenda de Indumentaria sin tejido ni patrón desde Nuevo producto.
- **Esfuerzo / dependencias:** S · **antes** del censo · depende de que Felipe responda D4.

### #2 · Reconstruir — Guardar categoría y ejes de una vez, y avisar qué productos se rompen al quitar un eje
- **Dónde:** `CategoriasLista.tsx:216-268` (dos `PUT`), `ejes/route.ts`, RPC nueva `actualizar_categoria_completa`; conteo previo sobre `productos` (tejido/patrón no habilitado tras el cambio) y sobre `categoria_tallas`.
- **Por qué en este puesto:** es el único camino que deja productos ya creados **sin poder guardarse** (`catalogo_actualizar_producto` rechaza) y sin decírselo a nadie; además guardar en dos pasos puede dejar la categoría a medias.
- **Cómo lo verificas tú:** desmarcar «Algodón» en una categoría cuyo producto lo usa muestra «2 prendas usan Algodón: no podrás guardarlas hasta cambiarlas» antes de confirmar; forzar un error en los ejes no cambia el nombre de la categoría.
- **Esfuerzo / dependencias:** M · ninguna.
- **DECIDÍ:** una sola RPC transaccional (datos + ejes) con conteo de productos afectados devuelto antes de aplicar. **DESCARTÉ:** dejar el aviso solo en pantalla, porque otra ruta (el panel del alta) edita los mismos ejes y no pasaría por él; el candado tiene que estar donde se escribe. **SE ROMPE SI:** dos líderes guardan a la vez los ejes de la misma categoría: sin control de versión gana el último en silencio (aceptable con este volumen, a vigilar).

### #3 · Reconstruir — Cerrar en la tabla los cuatro estados imposibles que quedan
- **Dónde:** `fn_categorias_vigencia_candados` (extender a `INSERT`); nuevo disparador en `productos` (`categoria_id` a una categoría inactiva); disparador de padre/hijas en `categorias`.
- **Por qué en este puesto:** el 21-sep ya vimos un estado imposible en producción («Blusas»); hoy está limpio y conviene que siga así cuando entren cientos de prendas por lotes.
- **Cómo lo verificas tú:** con la prueba SQL: `insert into retail.categorias(...) activo=true` sin familia falla; desactivar un padre con hijas activas falla; `update retail.productos set categoria_id = <inactiva>` falla.
- **Esfuerzo / dependencias:** M · migración de producción en partes (los disparadores, sin políticas) y **con la confirmación de Felipe antes de pegarla**.
- **DECIDÍ:** ampliar el disparador existente y agregar uno en `productos`. **DESCARTÉ:** validar solo en la RPC, porque es exactamente lo que falló el 21-sep (candado en la RPC, no en la tabla). **SE ROMPE SI:** una migración futura mueve productos de categoría con `UPDATE` masivo dentro de una transacción larga y el nuevo disparador la aborta a medias: la migración debe mover primero y desactivar después.

### #4 · Corregir — La cabecera y las tarjetas cuentan el mismo universo
- **Dónde:** `page.tsx:109-113` (excluir inactivas y contar subcategorías aparte); `CategoriasLista.tsx:445` (la tarjeta del padre suma o rotula «+N en subcategorías»); prefijo fijo usa `n_total` mientras la tarjeta usa `n`.
- **Por qué en este puesto:** mismo defecto que ADR-0270 corrigió para el stock: dos cifras para lo mismo. Hoy no se ve; se verá con la primera subcategoría con productos.
- **Cómo lo verificas tú:** crear una subcategoría con un producto: la cabecera y la suma de tarjetas coinciden y el padre muestra «1 en subcategorías».
- **Esfuerzo / dependencias:** S · ninguna.

### #5 · Corregir — «Desactivar» con motivo, confirmación y efecto sobre las hijas
- **Dónde:** `CategoriasLista.tsx:747-759` (botón siempre activo), `cambiarEstado :329`; promesa rota de `page.tsx:37-39`.
- **Por qué en este puesto:** ofrecer un botón que la base va a rechazar es culpa del diseño (Norman); y desactivar un padre con hijas activas hoy nada lo frena.
- **Cómo lo verificas tú:** en una categoría con productos, «Desactivar» aparece apagado y dice cuántos productos lo impiden; al desactivar una sin productos pide confirmar, igual que «Reactivar».
- **Esfuerzo / dependencias:** S · junto con la #3 (el padre con hijas).

### #6 · Corregir — La prueba de candados corre en CI
- **Dónde:** `scripts/pruebas/categorias_candados.mjs`, `ci-paridad.test.ts:33`, `.github/workflows/ci.yml`.
- **Por qué en este puesto:** el candado que arregló «Blusas» es exactamente el que una migración futura podría romper; hoy nada lo vigila.
- **Cómo lo verificas tú:** un PR que quite el disparador falla el CI.
- **Esfuerzo / dependencias:** S · antes de la #3 (para probar también los nuevos).

### #7 · Mejorar — Restos de prueba fuera del vocabulario, y avisar del prefijo permanente
- **Dónde:** categorías «dsa» y «prueba Lapicero» (y, en el mismo criterio, las marcas «Prueba» y «prueba marca1»); `CategoriasLista.tsx:497` (aviso en el formulario).
- **Por qué en este puesto:** mañana la colaboradora de TRU ve «dsa» al elegir la categoría de una prenda real; y el prefijo `DSA` queda reservado para siempre aunque se desactive.
- **Cómo lo verificas tú:** en Nuevo producto ya no aparecen «dsa» ni «prueba Lapicero»; el formulario dice «El prefijo no se podrá cambiar cuando la primera prenda lo use».
- **Esfuerzo / dependencias:** S · **antes** del censo · desactivar (no borrar), por CLAUDE.md.

### #8 · Eliminar/fusionar — Un solo editor de ejes (Categorías y el alta se pisan)
- **Dónde:** `CategoriasLista.tsx:683-743` y `alta-producto/ConfigurarCategoria.tsx` + `alta-producto-ejes.ts` (`BACKLOG.md:330`).
- **Por qué en este puesto:** dos pantallas que resuelven lo mismo de dos formas: una está mal aunque las dos «funcionen» (Brooks). Hoy pueden reemplazarse una a la otra.
- **Cómo lo verificas tú:** habilitar un tejido desde el alta y verlo marcado en Categorías, y al revés, sin que uno borre al otro.
- **Esfuerzo / dependencias:** M · **no antes de la #2** (la RPC única).

### #9 · Corregir — «Ver en Productos» de la vista rápida no cae en «Sin acceso»
- **Dónde:** `CategoriasLista.tsx:913`, `productos/page.tsx` (módulo `productos`).
- **Por qué en este puesto:** un enlace que termina en un muro es un error de diseño; y no filtra por estado.
- **Cómo lo verificas tú:** con un rol sin Productos, el enlace se oculta o lleva a una vista con motivo.
- **Esfuerzo / dependencias:** S · ninguna.

### #10 · Replantear — ¿44 categorías cargadas de golpe o solo las que se usan?
- **Dónde:** el sembrado de `categorias` (44 activas, 43 sin productos) y la sección por familia.
- **Por qué en este puesto:** el vocabulario cerrado se pensó para no permitir categorías inventadas (ADR-0096), pero hoy es una pared de tarjetas vacías; no es un defecto, es una decisión de negocio.
- **Cómo lo verificas tú:** — (pide una decisión).
- **Esfuerzo / dependencias:** M según la respuesta · antes de la #11.
- **DECIDÍ:** proponerle a Felipe mantener las 44 y **mostrar primero las que se usan** (sin cambiar el modelo). **DESCARTÉ:** sembrar solo las usadas y crear el resto a demanda con aprobación, porque cada categoría nueva reserva un prefijo para siempre y la aprobación sería un paso más para la colaboradora en hora pico. **SE ROMPE SI:** la tienda vende un rubro que las 44 no cubren y nadie quiere pedir la categoría a un líder: se vuelve «GEN» (el código de sin categoría, `20260912235500:176-190`) y el rubro no se puede analizar.

### #11 · Mejorar — Categorías en uso primero, las vacías colapsadas
- **Dónde:** `CategoriasLista.tsx:424-458` (secciones por familia).
- **Por qué en este puesto:** 43 de 44 tarjetas dicen «SIN PRODUCTOS»; con la #10 resuelta deja de ser ruido.
- **Cómo lo verificas tú:** en producción, «En uso» muestra 1 tarjeta y las 43 restantes empiezan cerradas bajo «Sin productos todavía».
- **Esfuerzo / dependencias:** S · **no antes de la #10**.

### #12 · Eliminar/fusionar — Familias visible, ícono genérico y comentarios viejos · *bajo valor / opcional*
- **Dónde:** `lib/menu.ts:329` (sin fila de Familias); `IconoFamilia.tsx:21-78` (6 códigos fijos); `route.ts:9` («6 familias fijas»); `page.tsx:37-39` (candado visual que no existe); residual: reactivar una hija con padre inactivo no se valida.
- **Por qué en este puesto:** cosmético o de documentación; solo importa si Felipe crea una familia nueva. **Si la #1 se hace, Familias necesita una entrada visible**: entonces sube.
- **Cómo lo verificas tú:** una familia nueva muestra su ícono por defecto, no un círculo; la Ayuda dice lo que hace la pantalla.
- **Esfuerzo / dependencias:** S.

## 8 · Estrategia alternativa
Solo se justifica la de la #10. **Ganas:** una pantalla que abre en lo que se usa, en vez de 44 tarjetas idénticas. **Pagas:** una decisión sobre quién puede crear categorías nuevas y en qué momento. **No cambia** el modelo ni los candados. Decide Felipe.

## 9 · Referentes de ERP y futuro
- *(De memoria, no verificado)* Odoo y Shopify manejan jerarquías de categorías de varios niveles; el árbol de un solo nivel de CAYLA (ADR-0062) es a propósito más simple, y con 3 tiendas y 1 taller es lo correcto.
- **Futuro (no cuenta entre las 12):** herencia de ejes de padre a hija; fusionar dos categorías moviendo productos; margen objetivo por categoría.

## 10 · Fuera de esta pantalla
**El alta y el censo rechazan valores que Atributos dice que «puede usar de inmediato»**: un tejido, talla o patrón nuevo, aun aprobado, no sirve en una categoría hasta habilitarlo aquí (`20260918231100:171-175`). Es el mismo defecto de copy que el análisis de Atributos (#5): la persona sigue el texto, y la base la contradice.

## 11 · Líneas propuestas para el backlog
- [ ] `[pantalla:productos-categorias]` #1 `exige_tejido_patron` editable en Familias + decidir D4 — S (antes del censo)
- [ ] `[pantalla:productos-categorias]` #2 Guardar categoría + ejes en una transacción y avisar qué productos se rompen — M
- [ ] `[pantalla:productos-categorias]` #3 Cerrar en la tabla los 4 estados imposibles que quedan — M
- [ ] `[pantalla:productos-categorias]` #4 Cabecera y tarjetas cuentan el mismo universo — S
- [ ] `[pantalla:productos-categorias]` #5 «Desactivar» con motivo, confirmación y efecto sobre hijas — S
- [ ] `[pantalla:productos-categorias]` #6 `categorias_candados.mjs` en CI — S
- [ ] `[pantalla:productos-categorias]` #7 Desactivar categorías de prueba y avisar del prefijo permanente — S (antes del censo)
- [ ] `[pantalla:productos-categorias]` #8 Un solo editor de ejes (Categorías + alta) — M
- [ ] `[pantalla:productos-categorias]` #9 «Ver en Productos» sin caer en «Sin acceso» — S
- [ ] `[pantalla:productos-categorias]` #10 Decidir: ¿44 categorías de golpe o solo las que se usan? — M
- [ ] `[pantalla:productos-categorias]` #11 Categorías en uso primero, vacías colapsadas — S
- [ ] `[pantalla:productos-categorias]` #12 Familias visible, ícono genérico, comentarios viejos — S (bajo valor)

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Título + «!» + cifras | Ayuda y dos números | ajustar (cifra mezcla universos) | `[visto]` `[código page.tsx:109-113]` |
| Barra | Buscador | Filtra en el cliente | bien | `[código categorias-reglas.ts:14]` |
| Barra | «+ Agregar categoría» | INSERT vía API | ajustar (sin ejes al crear; sin aviso del prefijo) | `[código CategoriasLista.tsx:683, :497]` |
| Sección | Familias con ícono | Agrupa categorías | bien | `[visto]` |
| Tarjeta | Prefijo + nombre + «SIN PRODUCTOS» | Vista rápida al pulsar | bien / ajustar (43 vacías) | `[visto]` |
| Vista rápida | «Ver en Productos» | Abre `/productos?cat=` | **ajustar** (puede caer en «Sin acceso») | `[código :913]` |
| Editor | Datos + subcategorías + ejes + curva | Dos `PUT` | **ajustar** (sin transacción) | `[código :216-268]` |
| Editor | Desactivar | Botón siempre activo | **ajustar** | `[código :747-759]` |
| Pie | Desactivadas + Reactivar | Sección aparte | bien | `[visto]` `[código :788-794]` |
| Familias | `/productos/familias` | Alta y edición de nombre | ajustar (escondida; sin `exige_tejido_patron`) | `[código FamiliasLista.tsx]` |

## Historial
| Fecha | Modo | SHA | Puntajes | Nota |
|---|---|---|---|---|
| 2026-09-21 | rápido | `17bdb269` | 7.5 / 5.8 | Primer análisis, sin SQL. **Vencido.** Tareas: #1 cabecera **cerrada a medias** (separa subcategorías, aún 38≠37); #2 conteo en la base **cerrada** (RPC en producción); #3 contraste de «SIN PRODUCTOS» **cerrada**; #4 buscador → pasó a #12; #5 «sin ejes» abierta sin evidencia (0 de 42 sin tallas); #6 «!» **retirada**: es un globo real; #7 estado vacío accionable, descartada por ADR-0109; #8/#9 coordinar sesiones: obsoletas (ADR-0109 aplicado: curva habitual funciona en producción); #10 → #11; #11/#12 sin tocar |
| 2026-09-21 | completo | `b6b85206` | 6.5 / 5.8 | Con SQL de producción. Baja de 7.5 a 6.5 no por regresión sino por lo que la base reveló (Blusas). No comparable con la fila rápida |
| 2026-09-26 | cambios (no es análisis) | rama `claude/categorias-mejoras` | — | Hechas **#2** (disparador `categorias_vigencia_candados`, migración `20260927200000`), **#4** (lo cubre el disparador; huérfana renombrada «Polos (V1, retirada)», sin botón «Reactivar»), **#5** (tallas con `compararTallas`), **#6** (prefijo deshabilitado con `n_total`) y parte de **#10** (ícono de Accesorios, ejemplo «Kimonos / KIM»). **#1** ya no se ve: la captura del 26-09 cuadra 16 = 16. Siguen abiertas #3, #7–#9, resto de #10, #11 y #12. Este análisis queda vencido para `page.tsx` y `CategoriasLista.tsx` |
| 2026-09-29 | completo, re-análisis (código + producción por agente + recorrido visual) | `38f9d7ce` | 7.1 / 5.8 (Comodidad) | Sube de 6.5 a 7.1 porque los candados de tabla ya existen y producción no tiene estados imposibles. **Del análisis del 21-sep se cerraron 7 de 12** (#1 «Blusas» —0 colgando—, #2 candado de tabla, #4 reactivar valida, #5 orden de tallas, #6 prefijo fijo visible, #10 pulido, #12 buscador); **#9** parcial (la prueba existe pero no corre en CI); **#3** (cabecera) y **#7/#8** (editar en tres pasos / una sola RPC) siguen abiertas; **#11** Replantear decidió dejar Categorías, Marcas y Atributos separadas. Este re-análisis trae 12 tareas nuevas |
