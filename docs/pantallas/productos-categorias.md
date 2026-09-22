# Pantalla — Categorías (`/productos/categorias`)

> Modo: **completo** · Fecha: 2026-09-21 · Rol/sede: líder, Tienda TRU (la pantalla no depende de sede) · Datos: real (producción, SQL A–E pegado por Felipe; E3/E4/E6 sin resultado visible)
> SHA analizado: `b6b85206` (= origin/main, rama al día `0 0`) — si `page.tsx` o `CategoriasLista.tsx` cambian después, este análisis está vencido
> Archivos: `apps/web/app/(app)/productos/categorias/page.tsx` · `apps/web/components/CategoriasLista.tsx` · `apps/web/components/IconoFamilia.tsx` · `apps/web/lib/catalogo-v2.ts` (`getEjesPorCategoria`) · `app/api/productos/categorias/route.ts` (+ `/ejes`) · RPC `actualizar_categoria`, `desactivar_categoria`, `reactivar_categoria`, `actualizar_categoria_ejes`, `fn_productos_por_categoria` · tablas `categorias`, `familias`, `categoria_tallas`, `categoria_tejidos`, `categoria_patrones`, `productos`
> Otra sesión tocándola: **sí** — `SESIONES-ACTIVAS.md:24` (rama `product-creation-decision-tree-0afe63`, ADR-0109, «Categorías (curva)»). La fila de `:48` (PR #119, rediseño de tarjetas) está **desactualizada**: el commit `3a9cc2d8 … (#119)` ya está en `main`.
> Reemplaza al análisis rápido de `17bdb269` (vencido: `page.tsx` y `CategoriasLista.tsx` cambiaron desde entonces). Algunas de sus afirmaciones eran incorrectas; se corrigen abajo.

## 0 · Veredicto
Pantalla sana en lo visible, pero con **un estado imposible ya vivo en producción**: hay 1 producto activo colgando de la categoría desactivada «Blusas», y por eso la cabecera dice 38 productos mientras las tarjetas suman 37. La causa es de fondo: los candados de desactivar y de fijar el prefijo viven solo dentro de las RPC, no en la tabla.
**Cumple su finalidad:** 6.5/10 · **Relevancia:** 5.8/10 — Comodidad (pero es raíz del código de cada prenda y de todo reporte por categoría)

## 1 · Finalidad declarada
"Esta pantalla existe para mantener el vocabulario cerrado de categorías (familia + prefijo de 3 letras + qué tallas, tejidos y patrones ofrece cada una), del que depende el código de cada prenda y la curva habitual de tallas al crear un producto." Fuente: ADR-0095, ADR-0096, ADR-0109 y el comentario de `page.tsx`, **no la captura**. ¿Docs y pantalla coinciden? Sí. `docs/datos/DECISIONES-2026-09-12.md` no tiene ninguna D-nn sobre categorías: mandan los ADR.

## 2 · Objeción
1. **Un candado que la pantalla promete no existe en la tabla.** `desactivar_categoria` bloquea si hay productos activos, pero ese bloqueo solo vive en la RPC. En producción, «Blusas» está desactivada y tiene 1 producto activo `[producción C1, E5]`. Fue una migración (ADR-0096, `20260917110000`) quien la desactivó sin mover el producto. El único trigger de `categorias` en producción es el de subcategorías `[producción D4]`; ninguno protege `activo` ni `prefijo`. Un líder con un `UPDATE` directo, o la próxima migración, repite el problema.
2. **La cabecera vuelve a no cuadrar, por 1.** Dice «38 productos activos clasificados» `[visto]`; las tarjetas suman 37 (Blazers 1, Camisas 4, Casacas 2, Chompas 8, Faldas 3, Jeans 1, Pantalones 2, Polos 1, Shorts 2, Tops 10, Vestidos 3) `[visto]`. El dato faltante es el producto de «Blusas», que sí cuenta en `fn_productos_por_categoria` pero no tiene tarjeta `[código page.tsx:90-95]` `[inferido]`. La tarea #1 del análisis anterior quedó a medias.
3. **Reactivar sin validar.** `reactivar_categoria` solo hace `set activo = true` `[código 20260915160001:95-107]`. En «Desactivadas» hay una fila con `familia` y `prefijo` en NULL que dice «Polos (huérfana sin familia — fusionada…)» `[visto]` `[producción C1]`. Un clic en REACTIVAR la deja activa, sin familia y sin prefijo, invisible en las secciones (`familias.map`, `CategoriasLista.tsx:313`) pero contada en la cabecera. `[código]` `[inferido]`: no ejecuté el clic.
4. Trade-off: arreglar el candado en la tabla obliga a que toda migración futura que fusione categorías mueva primero los productos. Es lo correcto (principio 2: se corrige el esquema, no se parcha).

## 3 · Lo que está bien y no se toca
- RLS activo en las 5 tablas `[producción D2]`, y ninguna RPC `security definer` sin `search_path` fijo `[producción E2, 0 filas]`.
- Prefijo protegido por formato y unicidad **en la tabla**: `categorias_prefijo_formato` y `categorias_prefijo_unico`; nombre único sin importar mayúsculas ni tildes `[producción A2, A3]`.
- La jerarquía (un solo nivel, sin ciclos, familia heredada) sí la impone un trigger de tabla `[producción D4]`. Es el modelo a copiar para los otros dos candados.
- Familia validada por FK a `familias(codigo)` `[producción A2]`.
- Nunca se borra: desactivar/reactivar con sección aparte `[visto]`.
- Los tres ejes (tallas, tejidos, patrones) son tablas puente con PK compuesta y FK; borrar la categoría arrastra su puente `[producción A2]`.
- Vista rápida de solo lectura para cualquier rol, con la curva habitual marcada con ✓ `[visto]`.
- Usa `<Modal>` (ADR-0136) y el mismo lenguaje que Productos `[visto]`.
- El conteo de tarjetas ya lo hace la base (`fn_productos_por_categoria` existe en producción, invoker, `search_path` fijo) `[producción D3]`. Cierra la tarea #2 anterior; el comentario «solo local hasta que Felipe la pegue» está viejo.
- Ninguna de las 42 categorías activas visibles está sin tallas `[producción C1]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7 | Coherente con CAYLA y con Productos. Fallas: orden de tallas alfabético, ícono de Accesorios que parece candado, texto chico y pálido, placeholder que ejemplifica algo que ya existe | `[visto]` `[código]` |
| Lógica de negocio | 5 | Estado imposible en producción (producto activo en categoría inactiva); reactivar sin validar; el prefijo se bloquea por productos de cualquier estado pero la tarjeta cuenta solo los activos | `[producción]` `[código]` |
| Arquitectura | 6 | Cadena correcta y RLS sana, pero los candados están en las RPC y no en la tabla; guardar una categoría son dos llamadas sin transacción; sin tests ni Zod | `[producción D4]` `[código]` |
| Funciones | 7 | Todo lo que se ve funciona. Faltan buscador y forma de mover productos al fusionar. No hay fantasmas | `[visto]` `[código]` |
| Utilidad | 6 | Vista rápida clara; el modal Editar es una pared de 40+ chips con el Guardar fuera de la vista | `[visto]` |
| Conexión con el ERP | 8 | Aguas abajo fuerte: prefijo → código de producto, curva → Nuevo producto, filtros de Productos. Sin integración externa | `[código]` |

### Estética (7)
- **(a) Coherencia CAYLA.** Crema y tinta, esquinas suaves, tipografía display en los títulos `[visto]`.
  - En Editar categoría hay ~20 chips seleccionados con tinte rojo a la vez (tallas, curva, tejidos, patrones) `[visto captura 3]`, frente al máximo de 2 de `MAX_ROJO_POR_PANTALLA` (`packages/shared/src/design-tokens.ts:73`). No leí `SelectorMultiple`, así que no sé si esa regla cuenta chips seleccionados. `[no verificable]` — decisión de Felipe.
  - Texto en `tinta/55` y `/60`: la cabecera (`page.tsx:~118`), las ayudas del modal (`CategoriasLista.tsx:540,578`) y «Ver en Productos» a 10 px (`:733`). ADR-0012 midió 2.57:1 para `/45`, con mínimo AA de 4.5:1; `/55` queda por debajo `[inferido, no medí]`.
  - «SIN PRODUCTOS» ya está a 11 px y `/65` (`:670`): la tarea #3 anterior está cerrada.
- **(b) Marca y tono.** Vocabulario correcto. El nombre de la huérfana con una nota interna incrustada («…fusionada con Polos/Camisetas el 2026-09-17») en el chip de Desactivadas rompe el tono `[visto captura 5]`.
- **(c) Heurísticas.**
  - El orden de tallas en Editar es `Estándar, L, M, S, XL, XS, XXL` y `26 … 42, 6, 7, 8, 9`, alfabético `[visto captura 3]`; la Vista rápida sí las muestra bien (`Estándar XS S M L XL XXL`) `[visto captura 2]`. Causa: `.order("valor")` sobre texto (`page.tsx:31`).
  - El ícono de Accesorios es una bolsa con asa (`IconoFamilia.tsx:38`) y a 16 px se lee como candado `[visto captura 5]`.
  - El placeholder «Ej. Chalecos» ejemplifica una categoría que ya existe (CHA) `[visto captura 4]`.

### Lógica de negocio (5)
- Viola la promesa de `desactivar_categoria` (no desactivar con productos activos): Blusas `[producción E5]`. Ninguna D-nn escrita cubre esto.
- El prefijo se congela con productos de **cualquier** estado (`actualizar_categoria`, `20260915224501:123-126`), pero la tarjeta cuenta solo activos `[código]`. En producción hay 5 categorías donde el total supera a los activos (Camisas y Blusas 5/4, Chompas 9/8, Pantalones 3/2, Polos 2/1, Vestidos 4/3) `[producción C1]`: muestran «N productos» y el prefijo ya no cambia.
- El input del prefijo no se deshabilita aunque el subtítulo diga que no se puede cambiar (`:426-433`); el rechazo llega recién al guardar `[código]`.
- Vocabulario: prefijos poco mnemónicos («Colores» = `UTC`, «Pañuelos» = `BUF`, «Poleras» = `SUD`) `[visto]`. Se decidieron a mano (ADR-0096); anotado, no es defecto.
- Referente de ERP (de memoria, **no verificado**): Odoo y Shopify guardan la categoría con historial y piden mover los productos antes de archivarla. Aplica hoy: es exactamente el hueco de Blusas.

### Arquitectura (6)
- **Estados imposibles.** Lo que la tabla sí impide: prefijo duplicado o mal formado, nombre duplicado, ciclos y profundidad >1, familia inexistente `[producción A2, A3, D4]`. Lo que **no** impide: desactivar con productos activos y cambiar el prefijo con productos; ambos solo dentro de la RPC `[producción D4]`, con RLS `for all` para el líder `[código]`.
- **Transacción.** Guardar = `PUT /categorias` (RPC) y después `PUT /categorias/ejes` (otra RPC) `[código CategoriasLista.tsx:165, 204-209]`. Si la segunda falla, la categoría queda guardada y los ejes no; la UI avisa (`:212-214`), pero el estado a medias existe.
- **Concurrencia.** Dos líderes editando la misma categoría: gana el último y no hay versión ni aviso. Con 1 líder real y escritura esporádica el riesgo es bajo `[inferido]`.
- **Caída externa.** No hay API externa. Si la base no responde, `exigir()` corta la página con error; no se pierde ningún dato.
- **Volumen.** 45 categorías, 45 productos, 216 + 139 + 133 filas de puente `[producción B1]`. En 3 años no pasará de unos cientos; el rendimiento no es un tema.
- **Lentes.** RLS sana `[producción D2, E2]`. `PUT /ejes` no verifica el rol en la ruta y depende de `fn_es_lider` dentro de la RPC (`ejes/route.ts:14`): es defensa en una sola capa. No hay Zod: validación manual con regex, contra el principio 11. Sin tests de pantalla, API ni RPC `[código]`.

### Funciones (7)
- **Existen y funcionan:** agregar categoría, editar, subcategorías, tallas/curva/tejidos/patrones, vista rápida, ver en Productos, desactivar y reactivar.
- **Fantasma:** ninguna. La ayuda «!» es un globo real (`Ayuda.tsx`); el análisis rápido anterior la marcó mal.
- **Faltan:** buscador; ver o mover los productos de una categoría antes de desactivarla o fusionarla; orden de tallas humano.
- **Sobran:** nada que borrar. El campo de notas no tiene uso visible todavía `[no verificable]`.

### Utilidad (6)
Escenario: una colaboradora nueva de Tienda TRU abre Categorías para saber dónde poner un blazer.
- Ve la tarjeta «Blazers · BLZ · 1 producto» y abre la Vista rápida. Entiende la curva porque el ✓ está explicado en el título `[visto]`.
- Es de solo lectura para ella: no se puede equivocar.
- Para el líder, «Editar» abre una hoja de ~40 chips con el «Guardar cambios» fuera de la vista `[visto captura 3]`. Es fácil tocar un chip por error al hacer scroll.
- Una categoría nueva se crea con el prefijo mal (`Ej. Chalecos` ya existe) hasta que el índice único lo rechaza. La equivocación es del diseño, no de la capacitación.

### Conexión con el ERP (8)
Ver sección 6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 8 | Directa baja; indirecta alta: toda analítica por categoría, el prefijo del código y la curva nacen aquí |
| Dinero y stock que toca | ×1 | 3 | No mueve stock ni dinero; sí el código de prenda y, indirectamente, dónde se busca el stock |
| Frecuencia y personas | ×1 | 3 | Solo líder, esporádica; lectura para el resto |
| Qué se detiene si falla | ×1 | 7 | Sin categoría activa válida no se puede crear producto |

Relevancia = (2·8 + 3 + 3 + 7) / 5 = **5.8** → Comodidad.
Cumple su finalidad = (7+5+6+7+6+8)/6 = **6.5**. Sin tope: el estado imposible de Blusas no mueve dinero ni stock; sí deja un producto fuera de los filtros por categoría.

## 6 · Conexión con el ERP
- **Aguas arriba:** `familias` (ADR-0103) y los vocabularios aprobados `tallas`, `tejidos`, `patrones`.
- **Aguas abajo:**
  - `fn_asignar_codigo_producto` toma `prefijo` y arma `PREFIJO-NNNN`.
  - Nuevo/Editar producto exige categoría activa y marca las tallas de la curva habitual.
  - Filtros de Productos (`?cat=`) solo listan categorías activas: **el producto de Blusas no se puede filtrar por categoría**.
  - Reportes por categoría.
- **Pájaro dueño y vecinos:** Loro (catálogo y vocabulario, `AVIARIO.md:41`); vecinos Atributos, Familias y Marcas.
- **Externos, y qué pasa si caen:** ninguno. Se degrada así: si la base cae, la página falla entera sin escribir nada.

## 7 · Las 12 tareas, por importancia

### #1 · Corregir — Mover el producto activo de «Blusas» a «Camisas y Blusas»
- **Dónde:** `retail.productos` (1 fila con `categoria_id` = «Blusas») · RPC `catalogo_actualizar_producto`, que se usa desde Editar producto (no toques la tabla a mano).
- **Por qué en este puesto:** es el estado imposible ya vivo; deja un producto fuera de los filtros por categoría y de la cabecera correcta. Se arregla en un minuto.
- **Cómo lo verificas tú:** recargas Categorías: la cabecera y las tarjetas suman lo mismo (38). Sale «Blusas» del E5.
- **Esfuerzo / dependencias:** S · antes de la #2 y la #3.

### #2 · Reconstruir — Candado de tabla para desactivar y para el prefijo
- **Dónde:** migración nueva con trigger `BEFORE UPDATE OF activo, prefijo ON categorias`, junto a `categorias_valida_subcategoria`. Se prueba local; nada en producción sin la confirmación de Felipe (esquema).
- **Por qué en este puesto:** es la raíz de la objeción 1; sin él cada migración o `UPDATE` directo puede repetir Blusas.
- **Cómo lo verificas tú:** `update retail.categorias set activo=false where id=<Blazers>` falla con el mensaje del conteo; lo mismo al cambiar el prefijo de una con productos.
- **Esfuerzo / dependencias:** M · no antes de la #1 (si no, el dato malo sigue ahí).
- **DECIDÍ:** trigger de tabla que reproduce la regla de las RPC, contando productos de cualquier estado para el prefijo y solo activos para desactivar.
- **DESCARTÉ:** mantenerlo solo en las RPC, porque la RLS `for all` del líder y las migraciones ya lo saltaron una vez.
- **SE ROMPE SI:** una migración futura que fusiona categorías (como la de ADR-0096) no mueve los productos antes de desactivar la origen: el trigger la aborta.

### #3 · Corregir — La cabecera cuenta solo productos de categorías activas
- **Dónde:** `page.tsx:~95` (`totalProductos`) o `fn_productos_por_categoria` (agregar `join` con `categorias.activo`).
- **Por qué en este puesto:** un número que no cuadra con lo que se ve destruye la confianza en el resto.
- **Cómo lo verificas tú:** suma las tarjetas y coincide con la cabecera aun con una categoría desactivada que tenga productos.
- **Esfuerzo / dependencias:** S · se prueba con la #1 sin aplicar.

### #4 · Corregir — `reactivar_categoria` valida familia, prefijo y padre; limpiar la huérfana
- **Dónde:** `20260915160001:95-107` (RPC nueva en migración) · `retail.categorias` fila «Polos (huérfana…)»: pasar la nota a `notas` y dejar un nombre corto.
- **Por qué en este puesto:** un clic hoy crea una categoría activa que nadie ve y sin código.
- **Cómo lo verificas tú:** REACTIVAR sobre la huérfana muestra un mensaje claro y no la activa. El chip ya no lleva la fecha dentro del nombre.
- **Esfuerzo / dependencias:** S–M · no requiere la #2.

### #5 · Corregir — Orden humano de tallas (XS S M L XL XXL, y números como números)
- **Dónde:** `page.tsx:31` (`.order("valor")`) y `catalogo-v2.ts` (`agrupar`), con una función pura en `lib/` compartida. Verificar antes si `tallas` ya tiene una columna de orden `[no verificable]`.
- **Por qué en este puesto:** es la pantalla donde el líder arma la curva; hoy elige entre «Estándar, L, M, S, XL, XS, XXL».
- **Cómo lo verificas tú:** abre Editar → las tallas salen en el mismo orden que en la Vista rápida.
- **Esfuerzo / dependencias:** S.

### #6 · Mejorar — Mostrar por qué el prefijo está bloqueado
- **Dónde:** `CategoriasLista.tsx:426-433` (`disabled` + leyenda «usado por N productos»); `fn_productos_por_categoria` debería devolver también el total.
- **Por qué en este puesto:** hoy hay 5 categorías donde la tarjeta cuenta menos que la base, y el rechazo llega recién al guardar.
- **Cómo lo verificas tú:** Editar «Camisas y Blusas» → el prefijo sale bloqueado con la leyenda «5 productos».
- **Esfuerzo / dependencias:** S–M.

### #7 · Mejorar — Editar categoría en tres pasos (Datos · Subcategorías · Tallas y ejes) con el pie fijo
- **Dónde:** `CategoriasLista.tsx:373-610`.
- **Por qué en este puesto:** es donde la líder se equivoca sin darse cuenta; 40+ chips y el «Guardar» fuera de la vista.
- **Cómo lo verificas tú:** Editar en una pantalla de 768 px de alto: «Guardar cambios» siempre visible.
- **Esfuerzo / dependencias:** M · **choca con la sesión ADR-0109** (`SESIONES-ACTIVAS.md:24`, toca «Categorías (curva)»): coordinar antes.

### #8 · Mejorar — Guardar datos y ejes en una sola RPC
- **Dónde:** `CategoriasLista.tsx:165, 204-209` · `route.ts` y `ejes/route.ts` · una RPC que envuelva `actualizar_categoria` + `actualizar_categoria_ejes`.
- **Por qué en este puesto:** hoy un fallo de red en medio deja el nombre nuevo y los ejes viejos.
- **Cómo lo verificas tú:** cortas la red al guardar → o cambia todo o no cambia nada.
- **Esfuerzo / dependencias:** M · no antes de la #7.

### #9 · Mejorar — Pruebas de las RPC y la API de categorías
- **Dónde:** no existe `supabase/tests`; lo lateral es `alta-producto.test.ts`. Cubrir: prefijo bloqueado, desactivar con productos, reactivar huérfana, jerarquía.
- **Por qué en este puesto:** cada regla de esta pantalla vive en una RPC sin una sola prueba.
- **Cómo lo verificas tú:** `pnpm test` incluye los casos y fallan si quitas el `if` de la RPC.
- **Esfuerzo / dependencias:** M · después de la #2.

### #10 · Mejorar — Pulido visual (contraste, ícono, placeholder, rojo)
- **Dónde:** `page.tsx:~118` y `CategoriasLista.tsx:540,578,733` (subir a `/65`, ≥11 px) · `IconoFamilia.tsx:38` (una bolsa que no parezca candado) · placeholder de nombre «Ej. Chalecos» por un ejemplo que no exista · decidir si los chips seleccionados cuentan para `MAX_ROJO_POR_PANTALLA`.
- **Por qué en este puesto:** bajo riesgo, se ve en toda la pantalla.
- **Cómo lo verificas tú:** zoom a la cabecera y a la tarjeta de Accesorios; nadie confunde la bolsa con un candado.
- **Esfuerzo / dependencias:** S.

### #11 · Replantear — ¿Categorías, Familias, Marcas y Atributos como un solo «Vocabulario del catálogo»?
- **Dónde:** rutas `/productos/categorias`, `/familias`, `/marcas`, `/atributos`.
- **Por qué en este puesto:** su único trabajo es pedirle a Felipe que decida; no cambia las otras 11.
- **Cómo lo verificas tú:** no aplica: es una decisión.
- **Esfuerzo / dependencias:** L si se hace · nada depende de esto.
- **DECIDÍ:** dejarlas separadas hasta que el líder real las use; cada una tiene su ritmo (Categorías cambia rara vez, Atributos a diario).
- **DESCARTÉ:** unirlas ahora en un hub con pestañas, porque ya se hizo con Colores/Tallas/Tejidos y costó 5 redirects y un conflicto de merge con dos sesiones.
- **SE ROMPE SI:** una colaboradora nueva no encuentra dónde crear una talla nueva desde Categorías y termina en un callejón.
- **Decide Felipe.**

### #12 · Mejorar *(bajo valor / opcional)* — Buscador y familias vacías colapsadas
- **Dónde:** `CategoriasLista.tsx` sobre las secciones.
- **Por qué al final:** hoy hay 42 tarjetas y 31 están vacías `[producción C1]`; se lee sin buscar. Sirve cuando pase de ~80.
- **Cómo lo verificas tú:** escribes «BLZ» y queda solo Blazers.
- **Esfuerzo / dependencias:** S · sin dependencias.

## 8 · Estrategia alternativa
Es la de la #11. **Ganas:** un solo lugar y un solo patrón para todo el vocabulario. **Pagas:** un hub grande que mezcla frecuencias distintas, migración de rutas y coordinar con la sesión de ADR-0109. Decide Felipe.

## 9 · Referentes de ERP y futuro
Todo de memoria, **no verificado**:
- Odoo: categorías con ruta jerárquica y reglas contables por categoría; Shopify: colecciones manuales vs automáticas.
- Futuro: reglas por categoría (margen mínimo, reorder point por categoría) cuando existan ventas reales. Con 38 productos serían cifras inventadas.
- Futuro: fusionar categorías desde la pantalla con un asistente «mover productos». Para 3 tiendas hoy basta la #1.

## 10 · Fuera de esta pantalla
`page.tsx:123` habilita «Agregar» y «Editar» con `persona.rol === "lider"`, pero en producción `fn_es_lider()` es `admin` (`docs/datos/01-INVARIANTES.md:175`) y `supervisor_sede` no pasa ningún candado de `retail` `[inferido: no probé con una cuenta de líder de sede que no sea admin]`. Un líder de sede vería los botones y recibiría «Solo un Líder puede…» al guardar. Es el mismo patrón en todo el catálogo (productos, colores, marcas): es una tarea raíz de permisos, no una por pantalla. Además, 2 de los 45 productos no aparecen en ninguna tarjeta ni en Blusas (43 vistos; Faldas tenía una fila que no quedó en la captura), y no sé si tienen `categoria_id` nulo `[no verificable]`.

## 11 · Líneas propuestas para BACKLOG.md
*(pendientes de aprobación de Felipe; no anexadas)*
- [ ] `[pantalla:productos-categorias]` #1 Mover el producto activo de «Blusas» a «Camisas y Blusas» — S
- [ ] `[pantalla:productos-categorias]` #2 Trigger de tabla: no desactivar con productos activos ni cambiar prefijo con productos — M
- [ ] `[pantalla:productos-categorias]` #3 Cabecera cuenta solo productos de categorías activas — S
- [ ] `[pantalla:productos-categorias]` #4 `reactivar_categoria` valida familia/prefijo/padre + limpiar la huérfana — S–M
- [ ] `[pantalla:productos-categorias]` #5 Orden humano de tallas — S
- [ ] `[pantalla:productos-categorias]` #6 Mostrar por qué el prefijo está bloqueado — S–M
- [ ] `[pantalla:productos-categorias]` #7 Editar categoría en pasos con pie fijo — M (coordinar ADR-0109)
- [ ] `[pantalla:productos-categorias]` #8 Guardar categoría + ejes en una sola RPC — M
- [ ] `[pantalla:productos-categorias]` #9 Pruebas de RPC/API de categorías — M
- [ ] `[pantalla:productos-categorias]` #10 Pulido visual (contraste, ícono, placeholder, rojo) — S
- [ ] `[pantalla:productos-categorias]` #11 Decidir: ¿un solo «Vocabulario del catálogo»? — Felipe
- [ ] `[pantalla:productos-categorias]` #12 Buscador y familias vacías colapsadas — S (opcional)
- [ ] `[pantalla:catalogo]` Permisos: `persona.rol === "lider"` (UI) vs `fn_es_lider()` = admin (BD) — tarea raíz, todo el catálogo

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Título + globo «!» | Ayuda con enlaces a Familias y Marcas | bien | `[código Ayuda.tsx]` |
| Cabecera | «42 categorías activas · 38 productos…» | Resumen | ajustar (no cuadra con 37) | `[visto]` `[producción]` |
| Cabecera | «+ Agregar categoría» | Abre Nueva categoría (solo líder) | bien | `[visto]` `[código :301]` |
| Sección familia | Encabezado + «N categorías» | Agrupa por familia activa | bien | `[visto]` |
| Sección familia | Ícono de Accesorios | Bolsa que parece candado | ajustar | `[visto captura 5]` |
| Tarjeta | Prefijo, nombre, conteo | Abre Vista rápida | bien | `[visto]` |
| Vista rápida | Tallas con ✓, tejidos, patrones | Solo lectura | bien | `[visto captura 2]` |
| Vista rápida | «Ver en Productos →» | Filtra por categoría | bien; texto a 10 px | `[código :733]` |
| Nueva categoría | Padre, familia, nombre, prefijo, notas | POST directo a `categorias` | ajustar (placeholder) | `[visto captura 4]` |
| Editar | Tallas/curva/tejidos/patrones | Reemplaza los ejes | ajustar (orden, largo, rojo) | `[visto captura 3]` |
| Editar | Subcategorías con prefijo | Crea hijas de un nivel | bien | `[código :448-508]` |
| Editar | «Desactivar categoría» | RPC con candado | ajustar (candado solo en RPC) | `[código :583-594]` |
| Desactivadas | Chips + REACTIVAR | RPC sin validar | ajustar | `[visto captura 5]` |

## Historial
| Fecha | Modo | SHA | Puntajes | Nota |
|---|---|---|---|---|
| 2026-09-21 | rápido | `17bdb269` | 7.5 / 5.8 | Primer análisis, sin SQL. **Vencido.** Tareas: #1 cabecera **cerrada a medias** (separa subcategorías, aún 38≠37); #2 conteo en la base **cerrada** (RPC en producción); #3 contraste de «SIN PRODUCTOS» **cerrada**; #4 buscador → pasó a #12; #5 «sin ejes» abierta sin evidencia (0 de 42 sin tallas); #6 «!» **retirada**: es un globo real; #7 estado vacío accionable, descartada por ADR-0109; #8/#9 coordinar sesiones: obsoletas (ADR-0109 aplicado: curva habitual funciona en producción); #10 → #11; #11/#12 sin tocar |
| 2026-09-21 | completo | `b6b85206` | 6.5 / 5.8 | Con SQL de producción. Baja de 7.5 a 6.5 no por regresión sino por lo que la base reveló (Blusas). No comparable con la fila rápida |
