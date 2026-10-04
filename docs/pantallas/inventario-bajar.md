# Pantalla — Bajar prendas al piso (`/inventario/bajar`)

> Modo: completo, sin agentes en paralelo · Fecha: 2026-10-03 · Rol/sede: líder o integrante con Existencias, Tienda TRU, escritorio ~2000 px (captura del sábado 3-oct, 16:46)
> Datos: **sin SQL** — lo que depende de producción queda marcado `[no verificable]`; la consulta para cerrarlo está en el apéndice.
> SHA analizado: `b4cb05c3` (= `origin/main`, la rama va 0/0) — si `BajarAlPisoForm.tsx`, `bajada-reglas.ts` o `bajar_al_piso` cambian, este análisis está vencido.
> Archivos: `app/(app)/inventario/bajar/{page,layout}.tsx` · `components/BajarAlPisoForm.tsx` (763 líneas) · `lib/bajada-reglas.ts` (598) · `lib/buscar-prenda-v2.ts` · RPC `bajar_al_piso` (`20260926000200`, parchada por `20261002120000` y `20261004000000`) · tablas `bajadas_piso`, `bajada_piso_items`, `movimientos`, `stock`
> Otra sesión tocándola: **no** esta pantalla. Vecina: `prenda-no-registrada-piso-cbbfbf` (ADR-0321, Vender registra la bajada; ya está en `main`: `lib/bajada-desde-vender.ts`).

## 0 · Veredicto
La escritura es de las mejores del repo (todo o nada, marca anti-duplicado, lista congelada si se corta la red). Lo que falla está del lado de quien la usa: la pistola mira la prenda, no la pantalla, y la pantalla solo sabe avisar con los ojos, solo entiende códigos exactos y no tiene cámara — tres cosas que Conteo, Vender y Cambios ya resolvieron.
**Cumple su finalidad:** 6.7/10 · **Relevancia:** 6.4/10 — Soporte (la frecuencia real está sin medir; ver §5)

## 1 · Finalidad declarada
"Esta pantalla existe para que cada prenda que se cuelga quede registrada **cuando se cuelga** — no cuando se cobra — porque Frescura del piso solo mide algo si la bajada se registra a tiempo." Fuente: `ADR-0208` («Frescura del piso», decisión del bloque 1) y el encabezado de `lib/bajada-reglas.ts:1-10` y de `20260926000200_bajada_piso_funciones.sql`. **Docs y pantalla coinciden: sí.** La captura no aporta finalidad.

## 2 · Objeción
1. **La pantalla protege el dato con candados de banco y lo deja sin salida cuando la lectura falla.** Toda la ingeniería está en que lo escaneado se guarde bien; casi ninguna en que lo escaneado *se pueda* escanear. Etiqueta rasgada → «Escríbelo a mano (es el SKU)» `[código bajada-reglas.ts:471]`, que nadie sabe de memoria. Prenda con 0 en almacén → «avisa al líder» `[código bajada-reglas.ts:478]`. En ambos casos la persona **cuelga la prenda igual y sin registrar**, que es exactamente lo que la pantalla existe para impedir. Trade-off: arreglarlo agrega superficie (búsqueda, cámara, sonido) a una pantalla que hoy es austera; se paga porque las piezas ya existen en el repo.
2. **Cuatro pantallas leen prendas con la misma pistola y resuelven lo mismo de cuatro maneras** (Brooks, integridad conceptual). Conteo: sonido + cámara. Vender: cámara + búsqueda por nombre. Cambios: cámara + búsqueda. Bajar: ninguna de las tres `[código sonido-conteo.ts · PuntoDeVenta.tsx:428-435 · EscanerBusqueda.tsx]`. Una de las cuatro está mal, y es esta.
3. **No hay ninguna decisión escrita (D-nn) sobre qué hace Bajar cuando el sistema no tiene la prenda** (almacén en 0). Vender sí la tiene (D-40, ADR-0321); aquí se dejó al texto de un aviso.

## 3 · Lo que está bien y no se toca
- **Todo o nada con marca de intento:** `bajar_al_piso` toma la marca, bloquea el stock en orden de prenda (`fn_bloquear_en_orden`), valida TODAS las líneas bajo candado y recién entonces escribe; con un rechazo no se baja nada y el mensaje nombra cada prenda `[código 20260926000200:169-262]`.
- **Un corte de red no duplica ni pierde:** la lista se congela y el único botón reenvía lo mismo con el mismo token; el borrador guarda que ya se envió `[código BajarAlPisoForm.tsx:396-423, 178-201 · bajada-reglas.ts:340]`.
- **Lo «por escanear» (en 0) no baja nada**: lo registrado es lo que se leyó, no lo que se marcó en Existencias `[código bajada-reglas.ts:216-227]`.
- **Lo apartado no se mueve** (aunque esté en el almacén) `[código bajada-reglas.ts:155, 180]`.
- **La pistola nunca confirma sola** (sin `<form>`, botón `type="button"`) y lo que dispara mientras guarda va a un búfer `[código BajarAlPisoForm.tsx:207-246, 336-352]`.
- **La lista de prendas no se corta a 1.000:** lectura paginada, TRU pasa de 2.300 filas `[código inventario-v2.ts:82-110]`. (Lo verifiqué porque era la duda más grave: no es un problema.)
- **Candado en tres capas** (layout, page, base): `exigirModulo("existencias")` y `fn_ve_modulo('existencias')` `[código layout.tsx:5-8 · page.tsx:23 · ADR-0306]`.
- **Borrador por tienda**, 12 h, a prueba de `localStorage` caído; aviso nativo al cerrar con lo escaneado sin confirmar `[código BajarAlPisoForm.tsx:79-100, 251-259]`.
- **Copy y orden de la captura:** cabecera del módulo (ADR-0220), título «Bajar prendas al piso», frase que dice el flujo en una línea, «← Existencias», razón visible del botón apagado («Escanea al menos una prenda») `[visto]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7 | Coherente con CAYLA; el combo «Responsable» corta su pregunta; «En almacén» dice una cosa y mide otra | `[visto]` `[código]` |
| Lógica de negocio | 7 | Protege bien lo escaneado; callejón cuando el sistema dice 0 y sin D-nn que lo cubra | `[código]` |
| Arquitectura | 8 | Atómica, idempotente, sin ciclos de candado; pero ~60 líneas de búfer existen para sortear un loader | `[código]` |
| Funciones | 5 | Faltan sonido, búsqueda por nombre, cámara, deshacer y revisar lo bajado | `[código]` |
| Utilidad | 5 | Persona sin contexto: se pierde con la primera etiqueta rota o el primer aviso no visto | `[inferido]` |
| Conexión con el ERP | 8 | Bien conectada (Movimientos, Frescura, Actividad, Vender); entrada escondida | `[código]` |

**Estética** `[visto]` Tokens crema/papel/hueso/tinta, título serif, rojo ≤ 2 (asterisco y borde punteado del combo). Cabecera igual a Existencias/Vender. Dos defectos: «¿Quién hace esta oper…» se corta (`BajarAlPisoForm.tsx:735`, `sm:w-64`); a 2000 px el campo de escaneo se estira ~1.470 px (no estorba, no es tarea). Heurística de Nielsen #1 (visibilidad del estado): **un rechazo solo se ve** en un aviso ámbar bajo el campo `[código :575-580]`.

**Lógica** El candado de negocio («no se baja lo apartado», «solo lo que hay») está en la base, no en la pantalla ✓. Hueco: con `sin_almacen`/`todo_apartado` la salida es un texto `[código bajada-reglas.ts:474-483]`. Ninguna D-nn cubre qué hace Bajar si el sistema no tiene la prenda. `DECISIONES-2026-09-12.md:146` nombra `bajar_a_piso` (nombre viejo): el doc envejeció, manda el código.

**Arquitectura**
- *Estados imposibles:* una bajada sin líneas o con línea que no es almacén→piso de su tienda la detecta `fn_verificar_bajadas()` (debe dar 0 filas) `[código 20260926000200:289-320]`; la marca `token_cliente` es única.
- *Transacción:* empieza en la marca (`pg_advisory_xact_lock`) y termina tras la última `mover_interno`; las 300 líneas máximo acotan cuánto retiene el stock.
- *Concurrencia:* dos personas con la misma prenda → la segunda ve «pides 3 y en el almacén hay 1» y no se baja nada `[código 20260926000200:211-250]`. Dos pestañas del mismo aparato comparten borrador pero la base responde `bajada_token_reusado` y la pantalla resta lo guardado ✓.
- *Caída:* **sin red se puede seguir escaneando** (la lista de prendas ya está en el navegador); al confirmar sin red la lista se congela y se reenvía con el mismo token; nada se guarda dos veces. Mientras está congelada no se puede escanear más (a propósito). Se degrada así: no pierde la lista (12 h) ni baja dos veces.
- *Volumen:* `[producción vía backlog, 2026-09-30]` Trujillo tenía **3 bajadas en toda su historia** (`docs/backlog/2026-09-29-frescura-registro-discipline-signal-0cd4b5.md:26`). Cada carga y **cada confirmación** (`refrescar()`, `:295-298`) relee el stock de la sede: TRU > 2.300 filas = ≥3 consultas con embeds `[código inventario-v2.ts:82]`. Cuánto tarda `[no verificable]`; sin número no hay opinión (tarea #8).
- *Complejidad que sobra:* el búfer de la pistola (`:134-137, 207-231, 336-352`) existe porque el loader global deja la pantalla `inert` mientras se relee todo `[código :207-208]`. Es síntoma, no causa.

**Funciones** Existen y funcionan: escanear (SKU o código de barras), ± y número a mano, quitar, borrador, confirmar, tarjeta de éxito, lista congelada, llegada desde Existencias con `?lineas=` (4 entradas: `inventario/page.tsx:179`, `existencias-prendas.ts:145`, `movimientos-atajos.ts:81`, `analisis-que-hacer.ts:316`). Fantasma: ninguna. **Faltan:** sonido/vibración por lectura · buscar por nombre · cámara · deshacer «Quitar» · ver/corregir lo recién bajado · salida clara cuando el sistema dice 0. Sobran: nada.

**Utilidad** Escenario: una colaboradora nueva, sábado a las 16:46, abre un fardo de 14 prendas y dos etiquetas están rasgadas.
1. Llega a la pantalla: no está en el menú izquierdo; solo por el botón «Bajar al piso» de Existencias `[código inventario/page.tsx:125,179]`. Es decisión escrita de Felipe (2026-09-25); no se reabre, pero cuenta para la frecuencia.
2. Escanea 12: destello en la fila ✓.
3. Etiqueta rasgada → teclea «blusa» → «No encuentro «blusa»… Escríbelo a mano (es el SKU)». No sabe el SKU. **Cuelga la prenda sin registrar.**
4. Una prenda tiene 0 en almacén → el aviso ámbar sale bajo el campo; ella mira la prenda y la pistola ya pitó «leído» `[inferido]`. **No lo ve.**
5. Confirma → «Se bajaron 12 prendas · 10:32». La lista desaparece; si una de las 12 estaba mal, no hay dónde verlo.
Cada paso donde se pierde es diseño, no capacitación.

**Conexión con el ERP** ver §6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 8 | Es la captura raíz de Frescura (ADR-0208): sin bajada a tiempo no hay «edad del piso» ni decisión de liquidar |
| Dinero y stock que toca | ×1 | 7 | Mueve stock almacén→piso, que es lo que Vender puede vender; no toca dinero directo |
| Frecuencia y personas que la usan | ×1 | 4 | `[producción vía backlog]` 3 bajadas en toda la historia de Trujillo al 30-sep; **provisional hasta el SQL** |
| Qué se detiene si falla | ×1 | 5 | Con ADR-0321 Vender ya no se frena por una prenda sin bajar; se pierde el dato de Frescura |

Relevancia = (2·8 + 7 + 4 + 5) / 5 = **6.4 — Soporte.** Si el SQL muestra uso diario real, la frecuencia sube y pasa a Núcleo (≥ 8 no, pero ~7).
**Cumple su finalidad:** promedio de las seis = (7+7+8+5+5+8)/6 = **6.7**. Sin tope: no hay candado roto; el daño posible (prendas colgadas sin registrar) no corrompe datos, los deja incompletos.

## 6 · Conexión con el ERP
- **Aguas arriba:** Recibir mercadería deja la prenda en el almacén de la tienda; Existencias, Movimientos y Análisis arman la lista con `?lineas=`; la carga inicial «al piso» (`20261004000000`) salta este paso a propósito. El stock sale de `getStockPorUbicacion` (`inventario-v2.ts:74`).
- **Aguas abajo:** una fila de `movimientos` por línea (traslado interno almacén→piso, `mover_interno`) + `bajadas_piso`/`bajada_piso_items`. Lo consumen: Vender (el piso es lo que se puede cobrar), Frescura (`fn_bajadas_del_piso_nucleo` marca «tardía» si se vendió antes de 10 min), Movimientos y Actividad (`20261002233000`).
- **Pájaro dueño y vecinos:** Halcón (05, Inventario y movimientos) `[AVIARIO.md:17]`. Vecinos: Frescura, Vender (`bajar_al_piso_desde_vender`, otra RPC por diseño: ADR-0321 descartó abrir esta a Vender), Retirar del piso, Ajustar stock.
- **Tres puertas, un hecho:** esta pantalla y el modal «Reponer» (`ReponerPrendaModal.tsx:137`) usan la misma RPC y `argumentosDeBajada` ✓; Vender usa la suya, con otra nota. Consistente: no es tarea.
- **Externos:** ninguno (ni SUNAT ni pasarela). Si la base no responde: lista congelada y reintento seguro (§4).

## 7 · Las 12 tareas, por importancia

### #1 · Mejorar — Cada lectura suena y vibra
- **Dónde:** `BajarAlPisoForm.tsx:314-334` (`leerEscaneo`) y el vaciado del búfer `:336-348`; reutilizar `avisarLectura` (`lib/sonido-conteo.ts:30-60`) y `sonidoDeLectura`/`PATRON_SONIDO` (`lib/conteo-conectado.ts:41-54`): línea nueva → «nueva», línea que ya existía → «suma», cualquier rechazo (`desconocido`, `sin_almacen`, `todo_apartado`, `tope`) → «desconocida» (grave y largo). Mover `PATRON_SONIDO` a un módulo neutro en el mismo cambio, para que Bajar no importe de Conteo.
- **Por qué en este puesto:** la pantalla existe para que nada se cuelgue sin registrar y hoy un rechazo solo se ve; la pistola pita «leído» aunque la app rechace `[inferido]`. Conteo ya lo resolvió con la misma pistola (`sonido-conteo.ts:2-3`: «se mira el rack, no la pantalla»). Costo: casi nulo. Si no se hace: el primer sábado con prisa, prendas colgadas sin registro.
- **Cómo lo verificas tú:** con el cursor en el campo, un SKU válido + Enter → tono corto y agudo; un código inventado + Enter → tono grave y largo **y** el aviso; con el sonido del equipo apagado la pantalla se comporta igual que hoy.
- **Esfuerzo / dependencias:** S · ninguna. Nota: el audio nace suspendido hasta la primera tecla o toque (`sonido-conteo.ts:16-17`); la primera lectura con pistola ya cuenta como tecla.

### #2 · Mejorar — Buscar por nombre cuando la etiqueta no lee
- **Dónde:** `bajada-reglas.ts:174-184` (`leerCodigo`, hoy solo `resolverCodigoV2`) y el mensaje `:471`; `filtrarPrendasV2` (`buscar-prenda-v2.ts:52-58`) ya filtra por SKU, referencia, talla, color, marca y barras, y lo usa Vender (`vender-buscador-reglas.ts`). UI: hasta 6 coincidencias bajo el campo; tocar una = +1, con la misma `sumarLectura` y los mismos topes.
- **Por qué en este puesto:** etiqueta rasgada o ilegible es lo normal en ropa `[inferido]`; hoy el mensaje manda a escribir un SKU que nadie recuerda y la prenda se cuelga sin registrar. Existencias y Vender ya ofrecen este camino.
- **Cuidado de diseño:** la pistola teclea rápido y remata con Enter. Las sugerencias solo salen si no hay código exacto y tras una pausa (≥250 ms); Enter con código exacto sigue sumando como hoy.
- **Cómo lo verificas tú:** teclea «blusa lino» → salen las prendas con almacén > 0 → tocas una → la línea sube 1. Una ráfaga de pistola (SKU completo + Enter) suma sin que aparezca la lista.
- **Esfuerzo / dependencias:** M · después de la #1. **Pregunta a Felipe:** ADR-0237 dice «lo registrado es lo que se escaneó»; tocar una prenda de la lista equivale a teclear su SKU (ya permitido), ¿se acepta?

### #3 · Conectar — Lo recién bajado se puede revisar y corregir
- **Dónde:** `BajarAlPisoForm.tsx:482` (`cambiarLineas(loQueFalta(...))` vacía la lista) y la tarjeta `:614-634`; `textoDeExito` (`bajada-reglas.ts:519-524`).
- **Por qué en este puesto:** tras confirmar solo queda «Se bajaron 12 prendas · 10:32 · [colaborador]»; no se ve cuáles. Una prenda escaneada de más queda en el piso del sistema sin estar ahí → Vender puede cobrar una unidad fantasma y Frescura mide mal. La corrección existe («Retirar del piso», `20261001150000`, que Frescura netea: `20260928120200`) y la pantalla no la nombra.
- **Qué:** la tarjeta conserva las líneas enviadas (`enviadas`, `:386`) en un «Ver lo que bajaste» plegable, y un enlace «¿Te equivocaste en una? Retírala en Existencias».
- **Cómo lo verificas tú:** confirmar 3 prendas → la tarjeta lista las 3 con su cantidad; el enlace abre Existencias.
- **Esfuerzo / dependencias:** S–M · ninguna.

### #4 · Mejorar — Cámara del teléfono o la tablet (sin pistola)
- **Dónde:** `BajarAlPisoForm.tsx:542-584` (tarjeta de escaneo); `EscanerCamara`/`crearLector` ya en `PuntoDeVenta.tsx:60, 428-435` y `EscanerConteo.tsx:6`; misma `leerEscaneo`.
- **Por qué en este puesto:** es la cuarta pantalla que lee prendas y la única sin cámara. Sin pistola, hoy es solo teclear. El pie pegajoso ya trae `safe-area` para celular (`:724`): alguien pensó en el teléfono y faltó el lector.
- **Condición:** `[no verificable]` si cada tienda tiene pistola. Si la tiene, baja de puesto.
- **Cómo lo verificas tú:** a 375 px (`resize_window` mobile) aparece el botón «Cámara»; en el teléfono real una etiqueta suma 1 y suena (#1).
- **Esfuerzo / dependencias:** M · después de la #1.

### #5 · Corregir — Salida del callejón «el sistema dice 0 en el almacén»
- **Dónde:** `bajada-reglas.ts:474-483` (`sin_almacen`, `todo_apartado`).
- **Por qué en este puesto:** quien tiene la prenda en la mano recibe «revisa que el fardo esté recibido… o avisa al líder»: si el fardo no vino por Recibir (carga inicial, traspaso), o si no hay a quién avisar un sábado, no hay salida. Vender ya resuelve su versión («la caja no se frena por un trámite», D-40 / ADR-0321). ADR-0306 dejó «Ajustar stock» como función de Existencias: quien llega aquí ya puede usarlo.
- **Qué:** el aviso nombra la salida real y la lleva a un toque. **Decide Felipe** (negocio, no técnica): ¿corregir el almacén con un ajuste (queda en `movimientos` con motivo) o exigir Recibir mercadería? Ninguna D-nn escrita lo cubre.
- **Cómo lo verificas tú:** escanear una prenda con almacén 0 → el aviso dice qué hacer y adónde ir, en un toque.
- **Esfuerzo / dependencias:** S (texto) · M (si hay botón) · decisión de Felipe primero.

### #6 · Replantear — ¿Dos pasos (recibir y luego bajar) o uno solo?
- **Dónde:** el flujo completo: Recibir mercadería (almacén) → Bajar al piso (piso). Sección 8.
- **Por qué en este puesto:** el dato que hay (3 bajadas en toda la historia de Trujillo) y el ADR-0321 (se baja sin registrar «a veces») sugieren que el segundo paso se omite. Esta tarea no cambia nada: pide que **Felipe decida sobre la sección 8** con el SQL del apéndice en la mano.
- **Cómo lo verificas tú:** con las cifras B1–B3 del apéndice sabes si el paso se hace, por qué puerta, y si el stock vive en el almacén o ya nace en el piso.
- **Esfuerzo / dependencias:** decisión · después del SQL.
- **DECIDÍ:** (propuesta, no decidida) seguir con A —mejorar esta pantalla con #1–#5— y medir antes de tocar el modelo.
- **DESCARTÉ:** B («Recibir y colgar» en un paso) por ahora porque cambia otro módulo (Recibir mercadería, ADR-0299) y agrega un estado a Frescura; y C (que Vender sea la puerta oficial) porque Frescura mediría «tardía» siempre, y su pregunta es cuándo se colgó.
- **SE ROMPE SI:** TRU recibe cada fardo y lo cuelga el mismo día (el almacén queda en 0 casi siempre): el segundo paso es puro trámite y B gana.

### #7 · Corregir — «Quitar» sin deshacer
- **Dónde:** `BajarAlPisoForm.tsx:704-706` (`quitar` → `quitarLinea`) y `guardarBorrador` (`:265-280`, que lo reescribe: tampoco se recupera). «Quitar» está a 4 px del «+» (`ml-1`, ambos `h-11`).
- **Por qué en este puesto:** una línea con 12 lecturas se pierde de un toque. Es trabajo perdido, no stock dañado.
- **Qué:** `avisar.aviso("Quitaste X", { accion: «Deshacer» })`; el patrón ya existe (`Avisos.tsx:68, 110`, ADR-0321 lo usa).
- **Cómo lo verificas tú:** escanear 5 → «Quitar» → aparece «Deshacer» → la línea vuelve con sus 5.
- **Esfuerzo / dependencias:** S · ninguna.

### #8 · Eliminar — El refresco completo tras confirmar (medir primero)
- **Dónde:** `refrescar()` `BajarAlPisoForm.tsx:295-298`, llamado en `:451` y `:492`; `page.tsx:22` → `getStockPorUbicacion` (`inventario-v2.ts:74-110`).
- **Por qué en este puesto:** cada confirmación relee el stock entero de la sede y enciende el loader global; el búfer existe para no perder lecturas durante él. La respuesta de la base ya dice qué se movió: se puede bajar `almacenDisponible` y subir `piso` en el estado local y releer en segundo plano (`x-espera: no`, ADR-0149). **Sin número no hay decisión:** primero se mide cuánto tarda confirmar → lista lista (`edge_logs`, receta en `memory/medir-pantallas-con-logs-de-supabase`). Si es < 300 ms, no se toca.
- **Cómo lo verificas tú:** tiempo antes/después con producción; escanear durante la confirmación no pierde ninguna lectura.
- **Esfuerzo / dependencias:** M · **no antes de medir**.

### #9 · Corregir — Guía de foco: aplicar o declarar «no aplica»
- **Dónde:** `lib/guia-de-foco-pantallas.ts:92` (`"/inventario/bajar": PENDIENTE`); regla en CLAUDE.md «Guía de foco», ADR-0284.
- **Por qué en este puesto:** editar la pantalla (#1–#5) obliga a correr `pnpm focus` antes de darla por terminada. La pantalla ya dice qué falta en el pie («Escanea al menos una prenda», «Obligatorio para guardar», `:166-173, 728-732`), pero no enciende el campo que sigue (escanear → quién → confirmar). Qué cuenta como «falta» lo decide Felipe.
- **Cómo lo verificas tú:** `pnpm focus` y `lib/guia-de-foco.test.ts` pasan con la fila actualizada y el contador `PENDIENTES_HOY` bajado.
- **Esfuerzo / dependencias:** S–M · en el **mismo PR** que la primera de #1–#5.

### #10 · Corregir — «En almacén: N» dice el disponible, no el total
- **Dónde:** `BajarAlPisoForm.tsx:644` (`tope = almacenDisponible`) y `:660`.
- **Por qué en este puesto:** con 5 en el almacén y 2 apartadas, la línea dice «En almacén: 3». Quien cuenta el estante ve 5.
- **Qué:** «Disponibles: 3» y, si `apartadasEnAlmacen(p) > 0` (`bajada-reglas.ts:155`), «· 2 apartadas».
- **Cómo lo verificas tú:** apartar 2 de una prenda con 5 en el almacén → la línea dice «Disponibles: 3 · 2 apartadas».
- **Esfuerzo / dependencias:** S · ninguna.

### #11 · Corregir (bajo valor) — «¿Quién hace esta oper…» cortado
- **Dónde:** `[visto]` captura; `BajarAlPisoForm.tsx:735` (`className="sm:w-64"`). El texto sale de `ComboResponsable` (compartido por 28 acciones): no se toca; solo el ancho aquí (`sm:w-72`).
- **Por qué bajo valor:** se entiende igual; es pulido.
- **Cómo lo verificas tú:** la pregunta completa se lee a 1024 px y a 375 px.
- **Esfuerzo / dependencias:** S · ninguna.

### #12 · Mejorar (bajo valor / opcional) — Mostrar el piso «ahora» en cada línea
- **Dónde:** `BajarAlPisoForm.tsx:656-663`; `prenda.piso` ya viaja en `PrendaBajable` (`bajada-reglas.ts:55`).
- **Por qué bajo valor:** ayuda a notar un desfase (ella cuenta 3 colgadas y el sistema dice 0), pero no cambia ninguna decisión del flujo. Opcional hasta ver cuántos desfases hay (SQL B3).
- **Cómo lo verificas tú:** una prenda con piso 2 muestra «En piso: 2» en su línea.
- **Esfuerzo / dependencias:** S · después de la #10 (misma fila).

## 8 · Estrategia alternativa
La pantalla actual (A) asume que el almacén es una estación obligada: se recibe, y después otra persona **se acuerda** de registrar el segundo paso. Si el dato real dice que ese segundo paso casi no ocurre, el problema no es la pantalla.

| | Ganas | Pagas |
|---|---|---|
| **A · Mejorar esta pantalla (#1–#5)** | No toca ningún otro módulo; Frescura sigue midiendo «cuándo se colgó»; todo el trabajo es de una pantalla. | Sigue dependiendo de que alguien se acuerde del segundo paso. |
| **B · «Recibir y colgar» en un paso** (al recibir un fardo se dice cuántas van al piso) | El paso no se puede olvidar: queda en el mismo escaneo que la recepción. | Cambia Recibir mercadería (ADR-0299) y agrega un estado a Frescura («recibida directo al piso»); más superficie. |
| **C · Vender como puerta oficial** (la primera venta registra la bajada, ADR-0321) | Cero trámite; la caja nunca se frena. | Frescura mediría «tardía» siempre: pierde su pregunta. |

**Recomendación:** A ahora; correr el SQL; si B1 muestra que casi no se usa y B3 que el almacén de TRU está casi en 0, pasar a B. **Decide Felipe.**

## 9 · Referentes de ERP y futuro
Filtro «¿le sirve a 3 tiendas y 1 taller hoy?»: lo de arriba pasa; esto no (futuro). Todo es de memoria y **no está verificado**:
- Reglas de ubicación al recibir («put-away», Odoo/NetSuite): al recibir la mercadería se sugiere su destino (piso o almacén). `[no verificable]` Es la opción B, formalizada.
- Capacidad de exhibición por categoría y sede: ya diseñada en ADR-0208 (bloque 6), sin construir.
- Hora real de la operación sin conexión: hoy una caída de internet parece «tardía» toda la jornada (`backlog 2026-09-29-frescura-registro-discipline-signal-0cd4b5`, punto d).

## 10 · Fuera de esta pantalla
**Frescura mide sobre un hábito de registro que casi no existe, y el ADR-0321 va a mover ese registro a la caja.** Con 3 bajadas en la historia de Trujillo `[producción vía backlog, 30-sep]`, la «edad del piso» y la señal de disciplina (diseñada, esperando a Felipe) leen ruido; y cuando la web del ADR-0321 se publique, la mayoría de las bajadas pasarán por Vender, donde Frescura las cuenta como «probable registro tardío» (efecto aceptado en el propio ADR). Antes de construir la señal de disciplina o confiar en «Edad del piso», hay que decidir **cuál puerta es la oficial** (§8).

## 11 · Líneas propuestas para el backlog
- [ ] `[pantalla:inventario-bajar]` #1 Cada lectura suena y vibra (reusar `avisarLectura`) — S
- [ ] `[pantalla:inventario-bajar]` #2 Buscar por nombre cuando la etiqueta no lee — M
- [ ] `[pantalla:inventario-bajar]` #3 Lo recién bajado se puede revisar y corregir — S–M
- [ ] `[pantalla:inventario-bajar]` #4 Cámara del teléfono/tablet (confirmar si hay pistola) — M
- [ ] `[pantalla:inventario-bajar]` #5 Salida del callejón «el sistema dice 0 en el almacén» (decide Felipe) — S/M
- [ ] `[pantalla:inventario-bajar]` #6 Replantear: ¿recibir y colgar en un paso? (decide Felipe tras el SQL) — decisión
- [ ] `[pantalla:inventario-bajar]` #7 «Quitar» con «Deshacer» — S
- [ ] `[pantalla:inventario-bajar]` #8 Medir y, si pesa, quitar el refresco completo tras confirmar — M
- [ ] `[pantalla:inventario-bajar]` #9 Guía de foco: aplicar o declarar «no aplica» (mismo PR que #1–#5) — S–M
- [ ] `[pantalla:inventario-bajar]` #10 «En almacén» → «Disponibles · N apartadas» — S
- [ ] `[pantalla:inventario-bajar]` #11 (bajo valor) Combo «Responsable» cortado — S
- [ ] `[pantalla:inventario-bajar]` #12 (bajo valor) Piso «ahora» en cada línea — S

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Sede · fecha · título · frase | Orienta; dice el flujo en una línea | bien | `[visto]` `page.tsx:28-37` |
| Cabecera | «← Existencias» | Vuelta común, solo si ve Existencias | bien | `[código page.tsx:35]` |
| Escaneo | Campo «Escanear prenda» | Suma 1 por lectura; `autoFocus`; Enter lee | bien; falta sonido (#1) y nombre (#2) | `[visto]` `:548-570` |
| Escaneo | Ayuda «Cada lectura suma 1…» | Explica el atajo del número | bien | `[visto]` `:572` |
| Escaneo | Aviso ámbar | Dice por qué una lectura no sumó | ajustar: solo visual (#1) | `[código :575-580]` |
| Lista | «Aún no escaneaste nada.» | Estado vacío | bien | `[visto]` `:639` |
| Lista | Fila (foto, nombre, SKU, «En almacén», ± y número, «Quitar») | Una línea por prenda | ajustar (#7, #10) | `[código :641-711]` |
| Lista | Chip «Por escanear» | Lo marcado en Existencias en 0 | bien | `[código :662]` |
| Pie | «0 prendas · 0 modelos» + motivo | Resumen y razón del botón apagado | bien | `[visto]` `:727-732` |
| Pie | Combo «Responsable» | Firma la bajada | ajustar (#11) | `[visto]` `:735` |
| Pie | «Confirmar bajada» | Una sola escritura, todo o nada | bien | `[código :736-755]` |
| Tras confirmar | Tarjeta «Se bajaron N…» + «Bajar otro fardo» | Cierra el ciclo | ajustar (#3) | `[código :614-634]` |
| Avisos | Borrador / «Comprobar» / «Confirmar de nuevo» | Recuperación tras corte | bien | `[código :521-540, 587-603]` |
| Navegación | Entrada solo desde Existencias | Decisión de Felipe, 2026-09-25 | bien (frecuencia: ver §10) | `[código inventario/page.tsx:125]` |

## Apéndice · Consulta para producción (solo lectura, sin datos personales)
Proyecto cayla-dynamic, schema `retail`. Pegar en el SQL Editor y devolver el resultado de cada bloque. Si `movimientos.nota` no existe, quitar el filtro `ilike` del B2.

```sql
-- B1. Uso real por sede
select u.nombre as sede,
       count(distinct b.id) as bajadas_total,
       count(distinct b.id) filter (where b.created_at > now() - interval '30 days') as bajadas_30d,
       coalesce(sum(i.cantidad), 0) as prendas_total,
       min(b.created_at)::date as primera, max(b.created_at)::date as ultima
  from retail.bajadas_piso b
  join retail.ubicaciones u on u.id = b.ubicacion_id
  left join retail.bajada_piso_items i on i.bajada_id = b.id
 group by u.nombre order by 2 desc;

-- B2. Por qué puerta baja el piso (90 días): pantalla/Reponer · Vender · otras
select date_trunc('week', m.created_at)::date as semana,
       count(*) filter (where i.movimiento_id is not null) as por_bajar_o_reponer,
       count(*) filter (where i.movimiento_id is null and m.nota ilike '%desde Vender%') as desde_vender,
       count(*) filter (where i.movimiento_id is null and coalesce(m.nota, '') not ilike '%desde Vender%') as otras
  from retail.movimientos m
  join retail.sububicaciones so on so.id = m.sububicacion_id and so.tipo = 'almacen_tienda'
  join retail.sububicaciones sd on sd.id = m.sububicacion_destino_id and sd.tipo = 'piso_venta'
  left join retail.bajada_piso_items i on i.movimiento_id = m.id
 where m.created_at > now() - interval '90 days'
   and retail.fn_es_traslado_interno(m.tipo, m.ubicacion_id, m.ubicacion_destino_id)
 group by 1 order by 1 desc;

-- B3. Dónde vive el stock de cada sede (¿hay algo que bajar?)
select u.nombre as sede, s.tipo,
       count(*) filter (where st.cantidad > 0) as variantes_con_stock,
       coalesce(sum(st.cantidad), 0) as unidades
  from retail.stock st
  join retail.sububicaciones s on s.id = st.sububicacion_id
  join retail.ubicaciones u on u.id = st.ubicacion_id
 where st.variante_id <> '22222222-2222-4222-8222-222222222222'
 group by 1, 2 order by 1, 2;

-- B4. ¿Qué parte de las bajadas de los últimos 30 días se registró «tardía»?
select u.nombre as sede, b.estado, count(*) as bajadas, sum(b.cantidad) as unidades
  from retail.ubicaciones u
 cross join lateral retail.fn_bajadas_del_piso_nucleo(u.id, now() - interval '30 days', now(), 10) b
 where u.activo
 group by 1, 2 order by 1, 2;

-- D3. ¿Producción corre lo mismo que el repo? (huella, no el cuerpo)
select p.proname, pg_get_function_identity_arguments(p.oid) as firma, p.prosecdef, p.proconfig, md5(p.prosrc) as md5
  from pg_proc p
 where p.pronamespace = 'retail'::regnamespace
   and p.proname in ('bajar_al_piso', 'bajar_al_piso_desde_vender', 'mover_interno', 'retirar_del_piso')
 order by 1, 2;

-- E1. Debe salir vacío (la lista de prendas con defectos de integridad)
select * from retail.fn_verificar_bajadas();
```

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-10-03 | completo, sin SQL | 6.7 | 6.4 (frecuencia provisional) | — (primer análisis) |
