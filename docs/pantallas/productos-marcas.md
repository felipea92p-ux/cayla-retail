# Pantalla — Marcas (`/productos/marcas`)

> Modo: completo · Fecha: 2026-09-29 · Rol/sede: líder y admin, Tienda Lima (local; la pantalla no depende de sede) · Datos: **real** — consultas de solo lectura a producción hechas por el agente en la sesión (no las corrió Felipe; el apéndice del plan las lista para que las confirme), más recorrido visual en local (1 marca de siembra, no las 85 de producción)
> SHA analizado: `38f9d7ce` (origin/main; el código se leyó en `123bb733`, y entre los dos solo cambió `alta-producto/ProductoCreado.tsx`). Si cambian `marcas/page.tsx`, `MarcasLista.tsx`, `EditarMarcaModal.tsx`, `NuevaMarcaForm.tsx` o `lib/marcas.ts`, este análisis está vencido.
> Archivos: `apps/web/app/(app)/productos/marcas/{page,layout}.tsx` · `components/MarcasLista.tsx` · `components/EditarMarcaModal.tsx` · `components/alta-producto/NuevaMarcaForm.tsx` · `lib/marcas.ts` · `lib/nombres-parecidos.ts` · `lib/marca-proveedor-reglas.ts` · RPC `crear_marca`, `editar_marca`, `eliminar_marca`, `fn_validar_marca_proveedor` · disparador `fn_marcas_desactivar_candado` · tablas `marcas`, `marca_proveedores`, `proveedores`, `productos`
> Otra sesión tocándola: **no directamente.** `docs/SESIONES-ACTIVAS.md` no lista Marcas. Rozan el terreno la fila de `product-variant-editing` (ficha y editor de producto) y la de la auditoría de TRU (cargador del censo, que necesita una marca para cada prenda).
> **Primer análisis de esta pantalla:** no existía `docs/pantallas/marcas.md`. Lo más cercano era `productos-categorias.md` #11, que decidió dejarla separada de Categorías/Familias/Atributos.
> Etiquetas: `[visto]` captura · `[código archivo:línea]` · `[producción-agente]` consulta de solo lectura del 2026-09-29 · `[inferido]` · `[no verificable]`.

## 0 · Veredicto
Es una pantalla sana por debajo (la base impide duplicar nombres, marcas sin proveedor y desactivar con productos), pero **habla de dos cosas que no coinciden con lo que hay en producción**: las 85 marcas se ven como 85 tarjetas casi todas vacías (83 sin un solo producto), y la cifra «N productos activos» cuenta una prenda que Productos esconde. Además **la carga por censo de mañana no tiene dónde poner una prenda de marca desconocida**: no existe una marca «Por identificar» y hoy «CAYLA» hace de comodín.
**Cumple su finalidad:** 6,3/10 · **Relevancia:** 4,4/10 — Comodidad (pero es raíz de dato: `productos.marca_id` es NOT NULL, así que sin marca no se da de alta ninguna prenda)

## 1 · Finalidad declarada
"Esta pantalla existe para mantener el vocabulario cerrado de marcas (de quién es cada prenda) y qué proveedores la traen, porque todo producto exige una pareja marca-proveedor válida y de ella sale «A quién pedirle»." Fuente: ADR-0109 (marca y proveedor en el alta), ADR-0217 (eliminar solo si no tiene productos) y el comentario de cabecera de `page.tsx:7-11`; **no la captura**. ¿Docs y pantalla coinciden? **Casi, con tres desalineaciones:** (1) ADR-0109 dice «Marcas no tiene fila propia en el menú» y hoy sí la tiene (`lib/menu.ts:330`); (2) ADR-0217 dice que «ninguna pantalla resuelve» el uuid de una marca borrada y sí lo resuelve el historial (`lib/historial-producto.ts:78`); (3) el commit `98aa6777` cita «ADR-0216», que es otro documento (inventario sin fotos). Ninguna decisión D-nn cubre marcas: mandan los ADR.

## 2 · Objeción
1. **La carga de mañana se atasca o contamina «CAYLA».** El censo de TRU entra por lotes (auditoría 2026-09-29, D2) y `productos.marca_id` + `proveedor_id` son NOT NULL con llave compuesta. Producción no tiene ninguna marca comodín `[producción-agente]` (búsqueda por «identificar/desconocid/sin marca/otros»: 0). Sin ella, una prenda cuya marca nadie conoce tiene dos salidas malas: la colaboradora sin permiso ve solo «Pídele a un Líder que la agregue» (`ElegirMarcaProveedor.tsx:196-203`) y el alta se detiene, o el cargador la deja bajo «CAYLA», que es la marca propia. **Ya pasa con el producto centinela:** «Prenda sin registrar» vive bajo marca CAYLA / proveedor CAYLA SAC (`20260923161700_prendas_por_regularizar.sql:44-48`). La decisión D5 de la auditoría («marca desconocida → Por identificar») sigue sin responder.
2. **La cifra de la tarjeta no es la de Productos.** `page.tsx:20,33-38` cuenta todo producto con `estado = 'activo'`, incluido el centinela; `fn_productos` lo excluye por uuid (`20260929020000…sql:69,98`). Resultado en producción: Marcas dice «CAYLA · 1 producto activo» `[producción-agente]` y Productos, al filtrar por esa marca, no muestra ninguno. En local se ve como «11 productos activos» frente a 10 en la grilla `[visto]`. Es el mismo defecto que ADR-0270 corrigió para el stock: dos pantallas, dos universos.
3. **La base no distingue «Levis» de «Levi's».** `marcas_nombre_unico` usa `fn_clave_texto`, que quita tildes y espacios repetidos pero **no la puntuación** `[producción-agente: cuerpo de la función]`. Hoy no hay duplicados por puntuación entre las 85 marcas `[producción-agente]`, así que crear el candado **ahora** es gratis; después de la carga masiva puede ser imposible sin fusionar a mano. El aviso «¿no será una marca que ya existe?» (`lib/marcas.ts:46`) lo compensa solo al **crear** y solo contra marcas activas, y no existe forma de fusionar dos marcas (`NuevaMarcaForm.tsx:57` lo dice: «la base no sabe fusionar marcas»).
4. **El «Responsable» es decorativo.** Editar y eliminar exigen elegir responsable (`fn_actor_persona_id(true)`), crear y desactivar ni lo leen, y ninguna guarda quién ni cuándo: `marcas` solo tiene `id, nombre, activo, created_at` `[producción-agente]`. La pantalla hace una pregunta cuya respuesta se descarta.
5. Trade-off: no toques el diseño de las tarjetas ni el formulario de alta (funcionan y ya están en el flujo de Nuevo producto). Antes de la carga, lo urgente son #1 y #3; el resto puede esperar a la semana 1.

## 3 · Lo que está bien y no se toca
- **Nombre único en la tabla, sin mayúsculas/tildes/espacios:** `marcas_nombre_unico` sobre `fn_clave_texto(nombre)` `[producción-agente A3]`. Ninguna colaboradora puede duplicarlo saltándose la pantalla.
- **Marca y proveedor siempre en pareja válida:** `productos.marca_id` NOT NULL más `productos_marca_proveedor_fk` a `marca_proveedores` `[código 20260918231000:130-135]`. No existe un producto con un proveedor que no trae esa marca. Producción: 0 marcas sin proveedor `[producción-agente]`.
- **No se desactiva una marca con productos activos:** disparador `marcas_desactivar_candado_bu` en la tabla `[producción-agente]`, no solo en la RPC.
- **Eliminar es seguro:** `eliminar_marca` toma la fila `for update`, cuenta productos de cualquier estado y las llaves impiden el borrado si queda uno (`20260926213000:54-69`). Solo aparece el botón si no hay productos (`lib/marcas.ts:221`).
- **RLS activo y permiso real alineado con la pantalla:** `marcas_write_lider` y `marca_proveedores_write_lider` usan `fn_puede_editar_catalogo()`; lectura solo a autenticados `[producción-agente D1]`. (El nombre `_lider` engaña, ver #8.)
- **Renombrar es seguro:** los productos apuntan por `id`; el nombre cambia en todos y `catalogo_version` sube para que la caja se refresque (`20260923184300:45`).
- **Editar es atómico:** `editar_marca` renombra y suma/quita proveedores en una sola transacción, y un proveedor solo se quita si ningún producto lo usa.
- **Pruebas:** `marcas.test.ts`, `marca-proveedor-reglas.test.ts` y las RPC de editar/eliminar están en CI.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7 | Coherente con Categorías y Atributos; «Editar/Desactivar» son enlaces de texto diminutos y la ayuda queda escondida en un «!» | `[visto]` |
| Lógica de negocio | 6,5 | Candados de tabla bien; sin comodín de marca, sin fusión, sin distinguir propia de tercera | `[producción-agente]` `[código]` |
| Arquitectura | 6 | Escribe con supabase-js directo, a diferencia de los otros vocabularios (rutas `/api`); alta en dos escrituras; sin autoría | `[código]` |
| Funciones | 5,5 | Cubre lo básico; faltan fusionar, ver sus productos, ordenar por uso; «Desactivar» se ofrece aunque va a fallar | `[código MarcasLista.tsx:218-225]` |
| Utilidad | 6 | Con 85 marcas, 83 vacías, hay que recorrerlas todas para hallar las 2 que importan | `[producción-agente]` `[inferido]` |
| Conexión con el ERP | 6,5 | Alimenta alta, edición, filtros y búsqueda; **ningún reporte de decisión usa marca** | `[código]` |

### Estética (7)
- `[visto]` Mismo encabezado corto que Categorías y Atributos («PRODUCTOS · CATÁLOGO», título, «!»); no usa `<EncabezadoPagina>`, y según CLAUDE.md la cabecera de Catálogo salvo Productos está **sin decidir**: no es defecto, es pregunta a Felipe.
- `[visto]` «EDITAR» y «DESACTIVAR» son enlaces de texto de ~11 px: por debajo del objetivo táctil útil (WCAG 2.5.8, 24×24 px). En escritorio pasa; en tablet de mostrador, no.
- `[visto]` Con 1 marca la pantalla queda casi vacía. `[no verificable]` cómo se ve con 85 (no hay 85 en local); `[inferido]` una cuadrícula uniforme donde 83 tarjetas dicen «Sin productos todavía».
- No hay uso de rojo fuera de lo permitido `[visto]`.

### Lógica de negocio (6,5)
- Regla violada #1: ninguna decisión escrita cubre «marca desconocida» (D5 abierta) — ninguna D-nn cubre esto.
- CLAUDE.md, principio 2 (cero estados inconsistentes): «Levis»/«Levi's» son legales en la tabla `[producción-agente]`.
- CLAUDE.md, «Módulos y roles» punto 3 (funciones que guardan firman con `fn_actor_persona_id(true)`): aquí se valida la presencia y no se guarda a quién (#4 de la objeción).
- «Marca propia vs. de terceros» **no existe** como dato (`marcas` no tiene columna). CAYLA fabrica y revende: lo propio está en la marca sembrada «CAYLA» y nada más `[código 20260918231000:109-117]`. Si Producción o el costeo lo necesitan es decisión de negocio (tarea #9).

### Arquitectura (6)
- **Dos patrones para lo mismo (Brooks):** Familias, Categorías, Colores, Tallas, Tejidos, Patrones, Etiquetas y Temporadas escriben por rutas `app/api/productos/*`; Marcas escribe desde el navegador con supabase-js y tres RPC, y desactivar/reactivar es un `UPDATE marcas.activo` directo protegido por RLS+disparador `[código MarcasLista.tsx:124-133]`. Una de las dos está de más.
- **Transacción del alta:** «Registrar y elegir» es proveedor primero y marca después (`NuevaMarcaForm.tsx:220-241`). Si la segunda falla, queda un proveedor sin marca. Se degrada así: el proveedor queda registrado y se puede reintentar, no se pierde nada, pero es un estado a medias que el diseño no debería permitir.
- **Concurrencia:** dos colaboradoras crean «Miramhe» a la vez → el índice único hace fallar la segunda; `[no verificable]` que el mensaje sea claro (no se probó en navegador).
- **Volumen:** hoy 85 marcas, 86 vínculos, 80 proveedores `[producción-agente]`; en 3 años, del orden de 150–300 marcas: no es problema de rendimiento. **Sí es problema `page.tsx:20`:** lee `productos` sin paginar contra el tope de 1000 filas de PostgREST (ADR-0192, existe `leerTodas`). Hoy son 2 modelos; tras el censo, `[no verificable]` cuántos modelos entran. Pasado el tope, los contadores y el botón «Eliminar» mienten (la base sigue protegiendo).
- **Caída externa:** no hay servicio externo. Si falla la lectura, `exigir` lanza y sale la pantalla de error general; no se pierde ningún dato.
- **RLS/permiso:** ver #8. Una API dice «Solo un Líder» aunque el permiso real ya es `fn_puede_editar_catalogo()` (líder o rol con Productos/Atributos completo).

### Funciones (5,5)
- **Existen y funcionan:** crear (con proveedor nuevo o existente), editar, desactivar, reactivar, eliminar sin productos, buscar por marca o proveedor (sin tildes).
- **Engañosas:** «Desactivar» se ofrece con productos activos y entonces falla; el error de `editar_marca` por nombre duplicado sugiere «desactiva la que sobra», que también falla si esa marca tiene productos.
- **Faltan:** fusionar; enlace tarjeta → sus productos (`/productos?marca=` ya existe); ordenar/filtrar «con productos»; autoría; aviso de parecidas al renombrar y contra desactivadas.
- **Sobran:** nada.

### Utilidad — persona sin contexto (6)
Escenario real: *llegó una marca nueva de un proveedor nuevo y hay que dar de alta 12 prendas.*
1. La colaboradora ya está en Nuevo producto, fila «Marca y proveedor» → «Registrar «X» como marca nueva» → mini-formulario (proveedor, RUC opcional, aviso de parecidas, «Responsable»). Funciona.
2. **Duda:** ¿crear antes en Catálogo ▸ Marcas o durante el alta? Es el mismo formulario y nada lo dice.
3. Si abandona el alta, queda una marca sin productos; existe «Eliminar», pero nadie le avisa.
4. Si contesta «No, es otra marca» al aviso de parecidas, queda un duplicado real y **no hay cómo fusionarlo**: la salida es editar producto por producto.
5. Sin permiso: solo lee «Pídele a un Líder». Con 12 prendas y el líder en otra sede, la carga se detiene.

### Conexión con el ERP (6,5) — ver §6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 5 | Dato raíz de todo producto y de «A quién pedirle» (vía proveedor), pero Análisis no lo usa: no ayuda a decidir |
| Dinero y stock que toca | ×1 | 2 | No mueve stock ni dinero; solo etiqueta |
| Frecuencia y personas que la usan | ×1 | 3 | Pocas veces por semana, casi todo dentro del alta de producto |
| Qué se detiene si falla | ×1 | 7 | Sin marca válida no se da de alta ninguna prenda (NOT NULL): frena la carga de TRU |

Relevancia = (2·5 + 2 + 3 + 7) / 5 = **4,4** — Comodidad.

## 6 · Conexión con el ERP
- **Aguas arriba:** Compras ▸ Proveedores (`proveedores`, `registrar_proveedor`, permiso distinto: módulo `proveedores`); el vocabulario `fn_clave_texto` compartido con Categorías, Colores, Tallas, Familias.
- **Aguas abajo:** Nuevo producto, Censo y Editar producto (validan con `fn_validar_marca_proveedor`); Productos (filtro y tarjeta); Vender (solo busca por marca, `catalogo-v2.ts:127-156`); Existencias (filtro «Marca», `existencias-catalogo.ts:30`); Compras (marcas de cada proveedor, `proveedores.ts:116-129`); historial de producto. **No la usan:** Análisis (SQL sin `marca_id`), etiquetas de precio, Finanzas.
- **Pájaro dueño y vecinos:** 02 Loro (catálogo). Vecinos: Compras (proveedores) y Existencias.
- **Externos, y qué pasa si caen:** ninguno. Se degrada así: nada externo de qué depender; si Supabase no responde la pantalla no carga y no se pierde ningún dato.

## 7 · Las 12 tareas, por importancia

### #1 · Corregir — Una marca «Por identificar» antes de la carga por censo

> **Superada el 2026-09-29 por ADR-0283:** Felipe eligió vacío real (`marca_id` / `proveedor_id` admiten `NULL`) en vez de una marca comodín; el producto se crea sin marca y se completa al editar. Queda pendiente el censo de Conteo (`AltaAlVuelo.tsx`).
- **Dónde:** dato en `marcas` (y su pareja en `proveedores`/`marca_proveedores`); `ElegirMarcaProveedor.tsx:196-203`; el cargador (`crear_producto_con_stock_inicial`, sin cambiar su firma).
- **Por qué en este puesto:** mañana abre TRU y el catálogo entra por lotes. Sin comodín, la prenda de marca desconocida se detiene (sin permiso) o cae en «CAYLA» y ensucia la marca propia y sus cifras. Es lo único de esta lista con fecha.
- **Cómo lo verificas tú:** `select nombre from retail.marcas where nombre ilike '%identificar%'` devuelve 1 fila, y `/productos?marca=<id>` lista las prendas que faltan por regularizar.
- **Esfuerzo / dependencias:** S · **antes** de cargar el censo · depende de que Felipe responda D5.
- **DECIDÍ:** una marca comodín visible, no una marca NULL. **DESCARTÉ:** `marca_id` nullable, porque obliga a un `if marca_id is null` en cada reporte y rompe la llave compuesta que hoy garantiza «A quién pedirle». **SE ROMPE SI:** el comodín se queda como destino permanente y nadie regulariza: por eso debe verse como cola («N prendas por identificar») y no como una marca más.

### #2 · Corregir — La cifra de la tarjeta cuenta lo mismo que Productos, y la tarjeta enlaza a sus productos
- **Dónde:** `marcas/page.tsx:20,33-38` (excluir el uuid centinela y `es_prueba`, o contar con la misma función que Productos); `MarcasLista.tsx:206-207` (nombre → `/productos?marca=<id>`).
- **Por qué en este puesto:** dos números distintos para lo mismo es lo que ADR-0270 vino a eliminar; aquí impide desactivar «CAYLA» por un producto que nadie ve.
- **Cómo lo verificas tú:** producción, marca CAYLA: hoy dice «1 producto activo» y `/productos?marca=` muestra 0; tras el cambio, ambos dicen 0 y el clic en la tarjeta lleva al listado.
- **Esfuerzo / dependencias:** S · ninguna.

### #3 · Reconstruir — Clave de marca que ignore puntuación, creada antes de la carga
- **Dónde:** nueva `fn_clave_marca` (mismo criterio que `fn_clave_referencia` de productos) + índice único nuevo sobre `marcas`; `editar_marca` y `crear_marca` la usan.
- **Por qué en este puesto:** hoy es gratis (0 colisiones entre las 85 marcas) y después de la carga puede no serlo; sin ella «Levis» y «Levi's» conviven y ningún reporte por marca cuadra.
- **Cómo lo verificas tú:** intentar crear «Levi's» teniendo «Levis» debe fallar con el mismo mensaje de «ya existe».
- **Esfuerzo / dependencias:** M · migración de producción con `retail.` y una sola parte; confirmar con Felipe antes de pegarla.
- **DECIDÍ:** una clave propia de marcas, que además de lo de `fn_clave_texto` quita puntuación. **DESCARTÉ:** cambiar `fn_clave_texto`, porque la usan categorías, colores, tallas, tejidos, patrones, familias y proveedores: recalcular ocho índices únicos a la vez es un riesgo mayor que el problema. **SE ROMPE SI:** ya existen dos marcas cuyo nombre solo difiere en puntuación cuando se crea el índice (hoy 0; comprobar de nuevo justo antes de pegar).

### #4 · Reconstruir — Que el «Responsable» se guarde (historial de marcas)
- **Dónde:** `crear_marca`, `editar_marca`, `eliminar_marca`, desactivar/reactivar (hoy `UPDATE` directo, `MarcasLista.tsx:124-133`); tabla nueva `marcas_historial` con el mismo patrón que `roles_historial` / `configuracion_historial` `[producción-agente]`.
- **Por qué en este puesto:** la pantalla pregunta quién y descarta la respuesta; CLAUDE.md pide firmar con `fn_actor_persona_id(true)` y aquí la firma no llega a ningún lado. Es la única marca de las 8 pantallas de Catálogo que ni siquiera guarda cuándo.
- **Cómo lo verificas tú:** renombrar una marca eligiendo un responsable y ver la fila en el historial con su nombre y la hora.
- **Esfuerzo / dependencias:** M · después de la #3 (comparten migración de marcas).
- **DECIDÍ:** historial en tabla aparte, escrito por las RPC (y desactivar/reactivar pasan a RPC). **DESCARTÉ:** dejar de pedir el responsable, porque la regla de CLAUDE.md es que toda función que guarda firma y la pantalla lo usa en todos los módulos. **SE ROMPE SI:** una migración futura vuelve a editar `marcas` por `UPDATE` directo y se salta el historial.

### #5 · Corregir — «Desactivar» solo si se puede, y mensajes que no empujen a un error
- **Dónde:** `MarcasLista.tsx:218-225` (ocultar o deshabilitar con motivo cuando hay productos activos); `editar_marca` (mensaje «desactiva la que sobra»).
- **Por qué en este puesto:** ofrecer un botón que la base va a rechazar es culpa del diseño (Norman); y el mensaje de nombre duplicado manda a hacer algo que falla.
- **Cómo lo verificas tú:** con una marca con productos, «Desactivar» aparece apagado y dice cuántos lo impiden; renombrar a un nombre existente ya no sugiere desactivar.
- **Esfuerzo / dependencias:** S · ninguna.

### #6 · Mejorar — Ordenar por uso y colapsar lo vacío
- **Dónde:** `MarcasLista.tsx` (secciones «Con productos» / «Sin productos todavía» colapsada, como ya hace «Desactivadas»).
- **Por qué en este puesto:** hoy 83 de 85 tarjetas dicen lo mismo; la persona recorre todo para hallar las 2 relevantes.
- **Cómo lo verificas tú:** en producción, «Con productos» muestra 2 tarjetas y la sección de vacías empieza cerrada con «83».
- **Esfuerzo / dependencias:** S · mejor después de la #2 (la cifra debe ser la buena).

### #7 · Mejorar — Fusionar dos marcas en una sola acción
- **Dónde:** RPC nueva `fusionar_marcas(origen, destino)` + botón en `EditarMarcaModal.tsx`.
- **Por qué en este puesto:** tras la carga aparecerán duplicados reales; hoy la salida es editar producto por producto (`ProductoForm.tsx:591`, sin cambio en bloque), sumar el proveedor a mano y borrar la sobrante.
- **Cómo lo verificas tú:** crear dos marcas de prueba con productos, fusionarlas, y ver que los productos siguen en pie, la marca sobrante ya no está y cada producto tiene su fila en «Historial».
- **Esfuerzo / dependencias:** L · después de la #3 y la #4.
- **DECIDÍ:** fusión atómica que mueve productos y proveedores y deja historial por producto. **DESCARTÉ:** un cambio de marca en bloque desde Productos, porque deja las dos marcas vivas y sin regla de qué se conserva; ADR-0217 descartó «mover productos» por reescribir a qué marca cuentan las ventas viejas, pero eso es cierto entre marcas distintas, no al unir duplicados de la misma. **SE ROMPE SI:** se fusiona por error una marca en otra distinta (p. ej. «Kero» en «Kero Jeans»): no hay «deshacer», solo el rastro del historial.

### #8 · Corregir — Permisos: mensajes verdaderos y botones que no fallan
- **Dónde:** `page.tsx:8-10` (dice «solo un Líder»); textos de error de las RPC («Solo un Líder puede agregar marcas»); nombres `marcas_write_lider`; el botón «+ Proveedor nuevo» exige `fn_puede_gestionar_proveedores` (módulo `proveedores`) mientras Marcas solo pide `editarCatalogo`.
- **Por qué en este puesto:** un rol con Atributos y sin Proveedores ve el botón y falla al pulsarlo; el mensaje afirma una regla que ya no rige.
- **Cómo lo verificas tú:** entrar con un rol que ve Atributos y no Proveedores: «+ Proveedor nuevo» no aparece o dice por qué.
- **Esfuerzo / dependencias:** S · `[no verificable]` con roles reales (no se probó).

### #9 · Replantear — ¿Marca solo como catálogo, o también como dimensión de decisión?
- **Dónde:** `marcas` (sin columna de tipo) y Análisis (sin `marca_id` en su SQL).
- **Por qué en este puesto:** hoy se captura marca en cada prenda y ningún reporte pregunta «qué marca rota más y deja más margen»; la pregunta que sí puede responder con 3 tiendas y 1 taller es a quién comprarle más.
- **Cómo lo verificas tú:** — (pide una decisión, no un cambio).
- **Esfuerzo / dependencias:** M–L según la respuesta · **no antes de la #1 y de que exista catálogo real** (con 2 productos no hay nada que medir).
- **DECIDÍ:** proponerle a Felipe mantener la relación N:N marca–proveedor tal como está y decidir dos cosas: (a) si Análisis debe agrupar por marca, (b) si hace falta «propia vs. de terceros». **DESCARTÉ:** absorber Marcas dentro de Proveedores, porque en producción una marca llega por más de un proveedor (1 caso) y 12 de las 85 comparten nombre con un proveedor: se parecen, pero no son lo mismo. **SE ROMPE SI:** se agrega «propia vs. de terceros» sin que ningún reporte la use: quedaría un campo vacío más.

### #10 · Mejorar — El aviso de parecidas también al renombrar y contra desactivadas
- **Dónde:** `lib/nombres-parecidos.ts:78-114`, `EditarMarcaModal.tsx`.
- **Por qué en este puesto:** renombrar hoy solo choca con el nombre exacto; una marca desactivada ni aparece en el aviso y `crear_marca` responde «existe pero está desactivada».
- **Cómo lo verificas tú:** renombrar «Kero» a «Keró» avisa; crear una marca cuyo nombre está desactivado ofrece reactivarla.
- **Esfuerzo / dependencias:** S · después de la #3.

### #11 · Mejorar — Crear marca y proveedor en una sola operación
- **Dónde:** `NuevaMarcaForm.tsx:220-241` → una RPC `crear_marca_con_proveedor`; prueba propia de `crear_marca` (hoy solo aparece como apoyo en otros scripts).
- **Por qué en este puesto:** cierra el estado a medias «proveedor sin marca» y da la prueba que falta. Bajo daño hoy: es recuperable.
- **Cómo lo verificas tú:** forzar un error en la marca y comprobar que el proveedor no queda registrado.
- **Esfuerzo / dependencias:** M · después de la #4.

### #12 · Eliminar/fusionar — Contadores sin tope de filas y documentos alineados · *bajo valor / opcional*
- **Dónde:** `marcas/page.tsx:20` (usar `leerTodas` o un conteo en SQL, ADR-0192); ADR-0109 («Marcas sin fila en el menú»), ADR-0217 («ninguna pantalla resuelve el uuid»), comentario del commit y `page.tsx:8-10`.
- **Por qué en este puesto:** el tope solo importa cuando haya más de 1000 modelos (hoy 2) y los documentos viejos no dañan datos; pero mienten a la próxima persona que los lea.
- **Cómo lo verificas tú:** con >1000 productos de prueba, las cifras de las tarjetas siguen sumando.
- **Esfuerzo / dependencias:** S.

## 8 · Estrategia alternativa
Solo se justifica la de la #9. **Ganas:** Marcas deja de ser un directorio y pasa a servir para decidir qué se compra (rotación y margen por marca). **Pagas:** una dimensión más en Análisis y, si se quiere, una columna `es_propia`; hoy no hay volumen de ventas para que el reporte diga algo. **No cambia** la pantalla actual: la complementa. Decide Felipe.

## 9 · Referentes de ERP y futuro
- *(De memoria, no verificado)* Shopify guarda el «vendor» de un producto como texto libre; Odoo trata la marca como atributo. Ninguno impone una llave marca-proveedor como la de CAYLA: aquí la llave es mejor para «A quién pedirle».
- **Futuro (no cuenta entre las 12):** logo de la marca; condiciones de compra por marca (plazo, mínimo); una página por marca con sus ventas y su margen.

## 10 · Fuera de esta pantalla
**Análisis no puede agrupar por marca**, aunque cada prenda ya lleva una (NOT NULL): el SQL de análisis no tiene `marca_id`. Es donde Marcas dejaría de ser un directorio para ayudar a decidir, y hoy nadie lo pidió.

## 11 · Líneas propuestas para el backlog
- [ ] `[pantalla:productos-marcas]` #1 Marca «Por identificar» antes del censo — S (decide D5)
- [ ] `[pantalla:productos-marcas]` #2 Cifra de la tarjeta = la de Productos, y tarjeta enlaza a sus productos — S
- [ ] `[pantalla:productos-marcas]` #3 `fn_clave_marca` sin puntuación + índice único — M
- [ ] `[pantalla:productos-marcas]` #4 Historial de marcas y firma real del responsable — M
- [ ] `[pantalla:productos-marcas]` #5 «Desactivar» solo si se puede; mensajes verdaderos — S
- [ ] `[pantalla:productos-marcas]` #6 «Con productos» primero, vacías colapsadas — S
- [ ] `[pantalla:productos-marcas]` #7 Fusionar marcas — L
- [ ] `[pantalla:productos-marcas]` #8 Permisos: mensajes y botón de proveedor — S
- [ ] `[pantalla:productos-marcas]` #9 Decidir marca como dimensión de análisis / propia vs. tercera — M–L
- [ ] `[pantalla:productos-marcas]` #10 Aviso de parecidas al renombrar y contra desactivadas — S
- [ ] `[pantalla:productos-marcas]` #11 `crear_marca_con_proveedor` atómico — M
- [ ] `[pantalla:productos-marcas]` #12 Contadores sin tope y ADR alineados — S

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Título + «!» | Ayuda larga | ajustar (ayuda escondida) | `[visto]` `page.tsx:62-68` |
| Cabecera | «N marcas activas» | Única cifra | ajustar (no dice cuántas sin productos) | `[código MarcasLista.tsx:148-152]` |
| Barra | Buscador marca/proveedor | Filtra sin tildes | bien | `[código lib/marcas.ts:184]` |
| Barra | «+ Nueva marca» | Formulario compartido con el alta | bien | `[código MarcasLista.tsx:178-188]` |
| Tarjeta | Nombre + «N productos activos» | Cuenta modelos | **ajustar** (cuenta el centinela; sin enlace) | `[código page.tsx:33-38]` |
| Tarjeta | Editar | Renombra y cambia proveedores en una transacción | bien | `[código editar_marca]` |
| Tarjeta | Desactivar | UPDATE directo | **ajustar** (se ofrece aunque falla) | `[código :218-225]` |
| Tarjeta | Eliminar | Solo sin productos | bien | `[código lib/marcas.ts:221]` |
| Tarjeta | «La trae» + chips | Parejas marca-proveedor | bien | `[visto]` |
| Pie | «Desactivadas» + Reactivar | Sección aparte | bien | `[código :256-287]` |
| Alta | Aviso «¿no será una que ya existe?» | Compara con activas | ajustar (no cubre renombrar ni desactivadas) | `[código NuevaMarcaForm.tsx:318-331]` |
| Alta | Combo «Responsable» | Se pide, no se guarda | **ajustar** | `[producción-agente]` |
| — | Fusionar / autoría / marca comodín | No existen | falta | `[código]` `[producción-agente]` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-29 | completo (código + producción por agente + recorrido visual en local) | 6,3 | 4,4 (Comodidad) | — (primer análisis de Marcas) |
