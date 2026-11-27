# Pantalla — Existencias (`/inventario`)

> Modo: completo, **sin SQL** (la consulta de solo lectura a producción no se pudo correr desde esta sesión: va en el Anexo para que la corra Felipe) · Fecha: 2026-11-26 · Rol/sede: líder, Tienda TRU (captura de Felipe, 17:09 Lima) · Dispositivo: escritorio (la captura, ~1600 × 680 px) · Datos: las cifras de la captura `[visto]`; ninguna verificada contra la base.
> SHA analizado: `5192595cb` = `origin/main` (esta rama no va atrás). El análisis del 2026-10-04 (SHA `e6fde14d`) **queda vencido**: desde entonces `InventarioPanel.tsx` cambió +/−1.296 líneas y `FiltrosExistencias.tsx` +/−474; llegaron el barrido (ADR-0690), el anillo (ADR-0344 §16), los atajos (ADR-0344), las cifras que filtran (ADR-0391), el valor a costo (ADR-0557) y la capacidad (ADR-0329).
> Archivos: `app/(app)/inventario/page.tsx` · `components/InventarioPanel.tsx` · `FiltrosExistencias.tsx` · `existencias/{BotonAjustarStock,BotonBarrido,CifrasExistencias,ValorInventarioExistencias,AnilloMision,FiltrosRapidos,AvisosExistencias}.tsx` · `ui/EncabezadoPagina.tsx` · `lib/{barrido-piso-reglas,capacidad-piso,existencias-rapidos,existencias-filtros,existencias-tarjetas,existencias-hoy,existencias-mision,existencias-para-hoy,sonido-confirmar}.ts` · RPC `fn_capacidad_piso`, `fn_valor_inventario_existencias`, `fn_tallas_sin_costo`, `confirmar_barrido_piso`, `cuadrar_piso` · tablas `capacidad_piso`, `cuadres_piso`, `barridos_piso`, `barrido_piso_lecturas`, `stock`.
> Otra sesión tocándola: **sí, en parte** — `claude/existencias-modal-liviano` (worktree `login-infinite-load-bug-552ccb`, hace 2 días, 43 archivos sin commit, casi todo maquetas del **modal** de la prenda). Ninguna de las 12 de abajo toca ese modal.
> Pedido de Felipe: «revisar si todo lo que muestra sirve de algo o solo hay cosas que estorban». Por eso este análisis pesa más el **Inventario de elementos** (al final), elemento por elemento.

## 0 · Veredicto
Casi todo lo que se ve sirve, pero **un mismo hecho se dice cinco veces y dos destinos tienen dos puertas cada uno**: en 680 px de alto no aparece ni una prenda. Lo que estorba no son las piezas sino sus repeticiones, más dos cifras que se contradicen a la vista («691 de 480», «918» contra «386 productos»).
**Cumple su finalidad:** 6,2/10 (promedio de las 6; sin tope: nada de lo hallado mueve dinero ni stock) · **Relevancia:** 8,2/10 — **Núcleo**.

## 1 · Finalidad declarada
«Existencias existe para que la sede sepa **cuántas prendas tiene y dónde están** (colgadas, guardadas, apartadas, dañadas, en camino) **y qué toca hacer hoy con ellas**, sin salir.» Fuente: `docs/datos/modulos/05-inventario-y-movimientos.md` («Para qué existe»), ADR-0231/0237 y ADR-0328 (el piso). No se usó la captura.
**¿Docs y pantalla coinciden?** En qué guarda, sí. En el orden, no: la finalidad pone **las prendas** primero, y la captura no muestra ninguna sin desplazarse `[visto]`.

## 2 · Objeción
1. **El piso sin cuadrar se dice cinco veces, en tres colores y con dos salidas distintas.** «· por cuadrar» en la cifra (`lib/capacidad-piso.ts:59-63`), el ícono de pausa en el chip «Por colgar» (`existencias/FiltrosRapidos.tsx:82,109-112`), la franja ámbar «nunca se ha cuadrado» (`InventarioPanel.tsx:128-144,1177`), la tarea «N tallas esperan el cuadre» dentro del anillo (`lib/existencias-para-hoy.ts:167-174`) y la banda azul «Barrido en curso» — porque **un barrido confirmado ES un cuadre** (ADR-0690 §5, `20261122193000_barrido_piso_confirmar.sql:60-61`). Y las salidas no coinciden: la banda dice «Sumarme» (→ `/inventario/barrido`, se escanea lo colgado) y la franja dice «Cuadrar el piso» (→ `/inventario/cuadrar`, se escanea lo guardado) `[código]`. Una asesora que ve las dos no sabe si son dos tareas o una. El comentario del propio código dice que la franja «lleva al barrido» (`lib/barrido-piso-reglas.ts:759`) y no es así: el documento y el código ya se separaron.
2. **«691 de 480» se lee como un error.** 480 es la capacidad del riel (`retail.capacidad_piso`, `fn_capacidad_piso`); ninguna regla dice qué significa pasarse (no hay ADR que lo trate) `[código]`. Mientras el piso está «por cuadrar», **ninguna** de las dos cifras es confiable (ADR-0328 dec. 5), así que la comparación no informa: confunde. Además la migración trae 600 para TRU (20 m² × 30) y la pantalla dice 480: alguien lo cambió después con `fijar_capacidad_piso` `[código]` `[no verificable sin SQL]`.
3. **Las cifras de los chips no se suman con la de la lista.** «386 productos» cuenta modelos; «Sin stock atrás 918» cuenta **modelo + color** (`lib/existencias-filtros.ts:287`, `lib/existencias-tarjetas.ts:25`) `[código]`. Un filtro que trae más de lo que dice tener la lista entera parece roto. Y, aunque fuera de la misma unidad, 918 cosas «por traer de otra sede» no son una tarea: es el mismo defecto de «reponer 538 de 538» del análisis anterior, con otro nombre.
4. **Trade-off que asumo:** varias de estas repeticiones son **a propósito** (ADR-0344: los atajos duplican las píldoras para no abrir el panel; ADR-0391: la franja no se pierde de vista). Quitarlas obliga a que la que queda sea imposible de no ver. Por eso las tareas no borran el aviso: lo **funden en uno**.

## 3 · Lo que está bien y no se toca
- **El barrido no puede mover de más.** Lo que tuvo cualquier movimiento después de abrir el barrido se salta (`se_movio`) y todo se confirma todo-o-nada (`confirmar_barrido_piso`, `20261122193000_barrido_piso_confirmar.sql`, encabezado) `[código]`. Hacer «Cuadrar el piso» con un barrido abierto no descuadra el stock: solo desperdicia el trabajo.
- **La pausa no miente.** Con el piso sin cuadrar, «Por colgar» no dice 0 («todo listo») sino pausa (`lib/existencias-hoy.ts:63-68`) `[código]`. El principio se queda aunque la tarea #5 cambie la forma.
- **Las cifras filtran** (tocar 691 → solo colgadas; `CifrasExistencias.tsx:48-51`) y **los filtros viven en la URL** (ADR-0326/0391) `[código]`.
- **El panel de filtros viene cerrado de fábrica** y solo se abre porque este equipo lo dejó abierto (cookie, `FiltrosExistencias.tsx:164-170`, `page.tsx:289`) `[código]`. No es un defecto de la pantalla.
- **«Ver el valor a costo» solo lo ve quien puede ver dinero** (`page.tsx:165`) y se despliega en el lugar, sin pedirlo de entrada `[código]`.
- **«Ajustar stock» exige su permiso y la sede propia** (`BotonAjustarStock.tsx:32-41`, ADR-0494) `[código]`.
- **La línea de arriba dice sede y la hora de la foto** («vista de las 17:09», ADR-0220): necesaria, porque la pantalla no se actualiza sola `[código page.tsx:283,405]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 6 | Vidrio Serena bien aplicado; pero tres bandas, un enlace suelto y el panel abierto empujan las prendas fuera de la vista | `[visto]` |
| Lógica de negocio | 5 | «691 de 480» sin regla; chips en otra unidad que la lista; «Sin stock atrás 918» no se puede hacer en un día | `[código capacidad-piso.ts:59-63, existencias-filtros.ts:287]` |
| Arquitectura | 8 | Barrido y cuadre todo-o-nada con `se_movio`; dos flujos distintos escriben el mismo `cuadres_piso` | `[código 20261122193000:60-61]` |
| Funciones | 6 | Todo funciona; sobran puertas dobles: barrido ×2, piso sin cuadrar ×5, Hoy/Condición ×2, colgadas/guardadas ×2 | §2, Inventario |
| Utilidad | 5 | La asesora nueva ve «Sumarme» y «Cuadrar el piso» y no sabe cuál; «0 de 74 hoy» no dice 74 qué | `[visto]`, §4.5 |
| Conexión con el ERP | 7 | Barrido, cuadre, plan del piso y Frescura leen la misma tabla; la red de otras sedes alimenta el anillo | `[código]` |

### 4.1 Estética (6)
(a) Tokens y vidrio en orden; ámbar para lo pendiente, sin rojo en la parte visible `[visto]`. (b) Tono de tienda. (c) Nielsen «estética minimalista»: cada elemento repetido compite con el que importa; en la captura hay **cinco** llamados a la acción visibles (Ajustar stock, Barrido, Sumarme, Cuadrar el piso, el anillo) y ninguna prenda. Los «·» como separador («TIENDA TRU · JUEVES…», «Barrido en curso · 1 prenda», «de 480 · por cuadrar») son lo que Felipe rechazó el 2026-11-24 para maquetas y la tienda; en el ERP es decisión aparte (tarea #12).

### 4.2 Lógica de negocio (5)
- «Colgadas de lo que cabe» es la cifra que Felipe pidió el 2026-10-04 y está bien pensada. Lo que falla es mostrar la comparación **antes** del cuadre, cuando ADR-0328 dec. 5 dice que no se afirma nada del piso sin cuadrar.
- Ninguna decisión escrita cubre qué hacer con **colgadas > capacidad** (¿riel sobrecargado? ¿capacidad mal medida?).
- «Sin stock atrás» = falta en el piso y el almacén está vacío (`lib/existencias-rapidos.ts:35`). Con 918 combinaciones, incluye colores que la tienda no vende hace meses `[inferido: el motor del piso no filtra por venta reciente en ese caso; no verificado con SQL]`.
- El rótulo «RECOMENDADOS» sobre «Se acaban / Sin ventas» se lee «te recomendamos estas prendas»; son condiciones del ritmo de venta, no recomendaciones.

### 4.3 Arquitectura (8)
Libro de movimientos intacto; ninguna pieza de la cabecera escribe. El barrido guarda su cuenta bajo candado y no corrige lo que se movió. El punto débil es de producto, no de base: **dos rutas (cuadrar y barrido) llegan al mismo estado** y la pantalla ofrece las dos a la vez. Un barrido abierto que nadie termina (hoy: 1 prenda) se vuelve cada día menos útil, porque cada venta lo deja con más prendas «se movió» `[inferido del código]`.

### 4.4 Funciones (6)
- **Funcionan:** todas las de la captura `[código]`.
- **Fantasma:** ninguna.
- **Sobran (puertas dobles):** botón «Barrido en curso» = banda «Sumarme»; fila GESTIÓN del panel = chips + cifras; «Cuadrar el piso» mientras hay barrido abierto; chip «Por colgar» en pausa = franja; «386 productos» se repite en el pie de la lista (`InventarioPanel.tsx:1210`).
- **Fuera de lugar:** «Sonido al confirmar» es un ajuste del equipo, no un filtro (`FiltrosExistencias.tsx:344`); solo suena en las hojas de la talla y en Ajustar.

### 4.5 Utilidad (5) — una asesora nueva, TRU, jueves 17:09
1. Entra para ver si hay una blusa en M. Ve arriba «Barrido en curso» (botón), abajo «Barrido en curso · 1 prenda — Sumarme» (banda) y más abajo «Cuadrar el piso» (franja). **Duda:** ¿tiene que hacer algo antes de buscar? 
2. Mira la cifra: «691 de 480 · por cuadrar». **Se equivoca:** entiende que hay 211 prendas de más en el piso y que tiene que guardarlas.
3. Ve «0 de 74 hoy» con el anillo ámbar. **Duda:** ¿74 qué? (son 74 tallas agotadas que otra sede puede enviar, `lib/existencias-mision.ts:24-27`).
4. Toca «Sin stock atrás 918» y la lista muestra más tarjetas de las que había en «386 productos». **Duda:** ¿se rompió?
5. Recién usa el buscador, que estaba ahí desde el principio.
Ninguna de esas dudas es de capacitación: son del diseño.

### 4.6 Conexión con el ERP (7)
Ver §6. El anillo depende de la red de stock de otras sedes; si no responde, el anillo cuenta solo lo propio `[código]`.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 8 | La sede decide qué colgar, pedir y liquidar aquí; el cuadre que dispara alimenta el plan del piso y Frescura |
| Dinero y stock que toca | ×1 | 9 | Ajustar, bajar, subir, dañadas y el barrido mueven stock |
| Frecuencia y personas que la usan | ×1 | 9 | Varias veces al día, encargado, asesora y Almacén |
| Qué se detiene si falla | ×1 | 7 | Se puede vender sin ella; no se puede cuadrar ni reponer |

Relevancia = (2·8 + 9 + 9 + 7) / 5 = **8,2** — Núcleo.

## 6 · Conexión con el ERP
- **Aguas arriba:** `stock` (foto de `movimientos`), `capacidad_piso`, `cuadres_piso`, `barridos_piso`, el ritmo de venta (`fn_ritmo_reciente_json`), apartados, dañadas, red de stock de otras sedes.
- **Aguas abajo:** bajar/subir al piso, Ajustar (`ajustar_inventario`), el barrido y el cuadre (`cuadres_piso` → plan del piso, Frescura, historial), pedidos a otra sede desde «Pendientes».
- **Pájaro dueño y vecinos:** Inventario; vecinos Movimientos, Traslados, Análisis («Qué pedir»), Plan del piso.
- **Externos, y qué pasa si caen:** ninguno. Si la base no responde, `/sin-base` (ADR-0450).

## 7 · Las 12 tareas, por importancia

### #1 · Eliminar/fusionar/conectar — Un solo aviso del piso, con una sola salida
- **Dónde:** `page.tsx:435-448` (banda del barrido) · `InventarioPanel.tsx:128-144,1177` (franja) · `existencias/AvisosExistencias.tsx:13-18` · `lib/barrido-piso-reglas.ts:762-773` (`avisoDeBarrido`).
- **Por qué en este puesto:** es la mayor fuente de ruido y la única que puede mandar a dos personas a dos trabajos distintos para lo mismo. Con barrido abierto: **una** banda «Barrido en curso — al terminarlo queda cuadrado el piso · [Sumarme]» y la franja «nunca se ha cuadrado» no se dibuja. Sin barrido y sin cuadre: la franja sola, y su botón lleva al barrido (como ya dice el comentario de `barrido-piso-reglas.ts:760`).
- **Cómo lo verificas tú:** en TRU, con el barrido abierto, ves una sola banda y ningún «Cuadrar el piso»; cancela el barrido en local y vuelve la franja, con un solo botón.
- **Esfuerzo / dependencias:** S · depende de #11 (qué flujo es el de la tienda); si #11 no se decide, la banda manda al barrido y la franja se oculta mientras haya uno abierto.

### #2 · Eliminar/fusionar/conectar — El botón «Barrido en curso» se va cuando la banda está
- **Dónde:** `existencias/BotonBarrido.tsx:12-19`, `page.tsx:416`.
- **Por qué:** dos puertas al mismo lugar, una debajo de la otra. La banda explica (cuántas lleva, quiénes escanean); el botón no. Sin barrido abierto el botón «Barrido del piso» se queda: es la entrada de todos los días.
- **Cómo lo verificas tú:** con barrido abierto la cabecera muestra solo «Ajustar stock».
- **Esfuerzo / dependencias:** S · con #1.

### #3 · Corregir — «691 de 480» no se muestra mientras el piso está por cuadrar
- **Dónde:** `lib/capacidad-piso.ts:59-63` (`notaCapacidadPiso`), `existencias/CifrasExistencias.tsx:54-72`.
- **Por qué:** sin cuadre ninguna de las dos cifras es confiable (ADR-0328 dec. 5) y la comparación se lee como «211 de más». Sin cuadre: «691 colgadas, según el sistema». Con cuadre y colgadas > capacidad: decirlo en palabras («211 más de las que caben»), no con «de». Antes, confirmar con la consulta del Anexo por qué TRU tiene 480 y no los 600 de la migración.
- **Cómo lo verificas tú:** TRU muestra «691» sin «de 480»; en una sede cuadrada aparece «de N».
- **Esfuerzo / dependencias:** S.

### #4 · Eliminar/fusionar/conectar — Fuera la fila GESTIÓN del panel de filtros
- **Dónde:** `FiltrosExistencias.tsx:271-304` (Hoy y Condición).
- **Por qué:** escribe los mismos parámetros que los chips (`lib/existencias-rapidos.ts:30-39`) y que las cifras (colgadas/guardadas). Lo único que agrega es «Mantener» y combinar «Hoy» + «Condición», que nadie pide en el piso `[inferido]`. Es una fila de 50 px que repite lo que está 60 px más arriba. ADR-0344 la dejó a propósito: esta tarea propone actualizarlo (en el celular la hoja de filtros puede conservarla, porque ahí los chips se desplazan).
- **Cómo lo verificas tú:** el panel abierto tiene dos filas (PRENDA, VISTA); los siete chips y las dos cifras siguen filtrando igual; enlaces viejos con `?hoy=mantener` siguen funcionando.
- **Esfuerzo / dependencias:** M (pruebas de `existencias-filtros`, guía de la pantalla).

### #5 · Corregir — El chip «Por colgar» no se dibuja mientras el piso está en pausa
- **Dónde:** `existencias/FiltrosRapidos.tsx:82,109-112`.
- **Por qué:** un chip con un ícono de pausa no se puede usar (no filtra nada) y repite la franja. Cuando el piso se cuadre vuelve con su número. El principio «no poner un 0 que diga todo listo» se cumple igual: no se pone nada.
- **Cómo lo verificas tú:** TRU muestra Todo · Sin stock atrás · Apartadas · Dañadas · Se acaban · Sin ventas.
- **Esfuerzo / dependencias:** S.

### #6 · Corregir — Chips y lista en la misma unidad
- **Dónde:** `lib/existencias-filtros.ts:287` (`conteosDeFiltros`), `lib/existencias-tarjetas.ts:25,107`.
- **Por qué:** «918» al lado de «386 productos» parece un error. Dos salidas: (a) el chip cuenta productos (modelos) como la lista; (b) el conteo de la lista pasa a «prendas» cuando hay un chip «Hoy». Recomiendo (a): la persona compara el chip con el total que tiene delante.
- **Cómo lo verificas tú:** ningún chip muestra un número mayor que «N productos» con «Todo».
- **Esfuerzo / dependencias:** M.

### #7 · Corregir — «Sin stock atrás» solo cuenta lo que vale la pena traer
- **Dónde:** el motor del piso (`lib/piso-plan.ts`, acción `sin_atras`) y `lib/existencias-hoy.ts:45-50`.
- **Por qué:** 918 cosas que traer no son una lista de trabajo. Con la regla que Felipe ya fijó para colgar (tallas centrales, o vendida ayer/hoy: `AYUDA_HOY.por_colgar`), «sin stock atrás» debería usar el mismo corte; lo demás no falta, simplemente no está. Confirmar con la consulta B del Anexo cuántas de las 918 vendieron en 30 días.
- **Cómo lo verificas tú:** el número baja a lo que una persona revisa en una mañana y coincide con lo que el anillo pide traer.
- **Esfuerzo / dependencias:** M · después de #6.

### #8 · Eliminar/fusionar/conectar — Fuera el anillo «0 de 74 hoy» y su ventana «Pendientes de hoy» (Felipe, 2026-11-26)
- **Dónde:** `existencias/AnilloMision.tsx`, `InventarioPanel.tsx:1015-1033` (el anillo y el botón «Pendientes» del Taller), `:1691` (la ventana), `existencias/ParaHoy.tsx`, `lib/existencias-para-hoy.ts`, `lib/existencias-mision.ts`.
- **Por qué:** Felipe: «no sirve». Revisado: todo lo que lista ya está en otro lado. El piso en pausa, las dañadas, lo que viene en camino y «sin stock atrás» se ven en esta misma pantalla; las ventas sin registrar (vencidas), los apartados vencidos y los traslados atrasados los avisa Inicio (`lib/inicio-avisos.ts`). Lo único que se pierde: las ventas sin registrar que todavía no vencieron dejan de avisarse aquí (siguen en `/inventario/por-regularizar`).
- **Cómo lo verificas tú:** la barra queda buscador · escáner · Filtros · «N productos»; Inicio sigue avisando las ventas sin registrar vencidas.
- **Esfuerzo / dependencias:** M (la guía interactiva y Knip: la foto del día en `localStorage` y sus pruebas quedan sin uso y se borran).

### #9 · Mejorar — «Sonido al confirmar» sale del panel de filtros
- **Dónde:** `FiltrosExistencias.tsx:344`, `lib/sonido-confirmar.ts`.
- **Por qué:** es un ajuste del equipo (se guarda en `localStorage`), no un filtro de prendas; se pone una vez. Va dentro de la hoja de la talla, junto a lo que suena, o en el menú «Más».
- **Cómo lo verificas tú:** la fila VISTA solo tiene «Ver como» y «Ordenar por»; el sonido se cambia desde la hoja de la talla.
- **Esfuerzo / dependencias:** S.

### #10 · Mejorar — «Ver el valor a costo» entra a la tarjeta de cifras
- **Dónde:** `page.tsx:452-456`, `existencias/ValorInventarioExistencias.tsx:61-65`.
- **Por qué:** hoy es una línea sola entre dos bandas (~40 px); dentro de la tarjeta de cifras, como tercera cifra plegada, se lee junto a «colgadas» y «guardadas», que es donde se busca.
- **Cómo lo verificas tú:** para el líder aparece en la tarjeta; para la asesora la tarjeta no cambia.
- **Esfuerzo / dependencias:** S.

### #11 · Replantear — ¿Cuál es «el» cuadre de la tienda: barrido o cuadrar?
- **Dónde:** `/inventario/barrido` (ADR-0690) y `/inventario/cuadrar` (ADR-0328); ver §8.
- **Por qué:** la pantalla ofrece las dos y las dos terminan en `cuadres_piso`. Decide Felipe.
- **DECIDÍ:** recomiendo que en la tienda el barrido sea la única entrada visible (escanear lo colgado, que es lo que se ve, con varias personas a la vez y con la tienda abierta) y que «Cuadrar el piso» quede como camino de respaldo, sin botón en Existencias.
- **DESCARTÉ:** dejar las dos visibles «para que cada uno elija»: dos personas pueden empezar las dos el mismo día y una de ellas tira su trabajo (la otra corrección deja todo como «se movió»).
- **SE ROMPE SI:** una sede tiene tanta ropa colgada que barrer el piso entero no se termina en un día; ahí el cuadre por almacén (lo guardado suele ser menos) es más corto. Para TRU hoy son ~691 colgadas contra 1150 guardadas `[visto]`: el barrido es más corto.
- **Esfuerzo / dependencias:** S (es una decisión) · antes de #1.

### #12 · Eliminar/fusionar/conectar — Fuera «Se acaban» y «Sin ventas» (Felipe, 2026-11-26)
- **Dónde:** `lib/existencias-rapidos.ts:37-42` (los dos atajos y `CLAVES_RECOMENDADAS`), `existencias/FiltrosRapidos.tsx:31-43,86-91` (íconos, tonos y el rótulo «Recomendados»); la opción de la píldora Condición que los repite (`lib/existencias-filtros.ts`).
- **Por qué:** Felipe: cómo se vende cada prenda ya se mira en Gestión ▸ Análisis. En Existencias eran dos chips más y un rótulo que se leía como «te recomendamos».
- **Cómo lo verificas tú:** la fila de chips queda Todo · Sin stock atrás · Apartadas · Dañadas (más «Por colgar» cuando el piso esté cuadrado); un enlace viejo con `?condicion=se_acaban` abre la lista sin filtro, sin error.
- **Esfuerzo / dependencias:** S. El total repetido en el pie y los «·» quedan fuera (bajo valor).

## 8 · Estrategia alternativa — Existencias en dos tiempos: «qué hacer» se pliega en una sola fila
Hoy la cabecera junta tres cosas: avisos (barrido, piso), trabajo del día (anillo, chips «Hoy») e inventario (cifras, buscador, lista). La alternativa: **una sola fila de trabajo** arriba («Hoy: termina el barrido · 74 por pedir · 6 apartadas por vencer», cada una un toque) y debajo, sin más, cifras + buscador + prendas.
- **Ganas:** la primera prenda aparece en la primera pantalla; un solo lugar para lo que hay que hacer; desaparecen la banda, la franja y el anillo como piezas separadas.
- **Pagas:** se reescribe la cabecera que acaba de unificarse (ADR-0344/0391), la guía interactiva y la versión de celular (donde los avisos ya subieron a un ícono, 2026-11-17). Las tareas #1–#10 consiguen ~70 % del efecto sin eso `[inferido]`.
Decide Felipe; mi recomendación es hacer #1–#6 primero y mirar de nuevo.

## 9 · Referentes de ERP y futuro
- Shopify POS y Lightspeed muestran inventario como **lista primero** con filtros arriba y alertas en una campana aparte `[de memoria, no verificado]`. Pasa el filtro: es la estrategia del §8.
- Conteo cíclico (Odoo/NetSuite: contar una parte del piso cada día en vez de todo una vez al mes) `[de memoria, no verificado]`: **futuro**; hoy con 3 tiendas un barrido mensual alcanza.

## 10 · Fuera de esta pantalla
**TRU nunca cuadró su piso y el barrido que lo haría está abierto con 1 prenda.** Mientras no se termine, el plan del piso, «Por colgar», la capacidad y la mitad de «Pendientes» están en pausa para TRU (son cuatro de las cinco señales de §2). Y un barrido abierto envejece: cada venta deja una prenda más como «se movió» que no se corregirá `[código]`. Terminar ese barrido (o cancelarlo y empezar uno nuevo en una hora tranquila) vale más que cualquiera de las 12 tareas.

## 11 · Líneas propuestas para el backlog
- [ ] `[pantalla:inventario]` #1 Un solo aviso del piso con una sola salida — S
- [ ] `[pantalla:inventario]` #2 Botón de barrido oculto cuando la banda está — S
- [ ] `[pantalla:inventario]` #3 «de 480» solo con el piso cuadrado — S
- [ ] `[pantalla:inventario]` #4 Fuera la fila GESTIÓN del panel de filtros (escritorio) — M
- [ ] `[pantalla:inventario]` #5 Chip «Por colgar» oculto en pausa — S
- [ ] `[pantalla:inventario]` #6 Chips y lista en la misma unidad — M
- [ ] `[pantalla:inventario]` #7 «Sin stock atrás» con el corte de tallas centrales/vendidas — M
- [ ] `[pantalla:inventario]` #8 Fuera el anillo y «Pendientes de hoy» — M
- [ ] `[pantalla:inventario]` #9 Sonido al confirmar fuera del panel de filtros — S
- [ ] `[pantalla:inventario]` #10 Valor a costo dentro de la tarjeta de cifras — S
- [ ] `[pantalla:inventario]` #11 Decidir barrido vs cuadrar como entrada de la tienda — S
- [ ] `[pantalla:inventario]` #12 Fuera «Se acaban» y «Sin ventas» — S

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | «TIENDA TRU · JUEVES… · VISTA DE LAS 17:09» | Sede y hora de la foto | **bien** (los «·», #12) | `EncabezadoPagina.tsx:79-80` |
| Cabecera | «?» junto al título | Explica la pantalla en un globo | **bien** | `EncabezadoPagina.tsx:87` |
| Cabecera | «Ajustar stock» | Abre el buscador «¿qué prenda vas a ajustar?» | **bien** | `BotonAjustarStock.tsx:32-41` |
| Cabecera | «Barrido en curso» | Va a `/inventario/barrido` | **sobra** con la banda (#2) | `BotonBarrido.tsx:12-19` |
| Cabecera | Cifra «691 de 480 · por cuadrar / + 61 accesorios» | Colgadas libres; toca → filtra colgadas | **ajustar** (#3) | `CifrasExistencias.tsx:54-72` |
| Cabecera | Cifra «1150 guardadas» | Almacén libre; toca → filtra guardadas | **bien** | `page.tsx:299` |
| Banda | «Barrido en curso · 1 prenda — Sumarme» | Va al barrido abierto | **bien**, absorbe la franja (#1) | `page.tsx:435-448` |
| Suelto | «Ver el valor a costo» | Despliega el valor de la sede (solo dinero) | **ajustar lugar** (#10) | `ValorInventarioExistencias.tsx` |
| Barra | Buscador con «/» | Busca prenda, marca o código; código exacto abre la talla | **bien**, es lo principal | `FiltrosExistencias.tsx:387-404` |
| Barra | Escáner | Abre la cámara | **bien** (la pistola usa el buscador) | `FiltrosExistencias.tsx:406-417` |
| Barra | «Filtros» | Abre/cierra el panel; recuerda por cookie | **bien** | `FiltrosExistencias.tsx:421-428` |
| Barra | Anillo «0 de 74 hoy» | Abre «Pendientes de hoy» | **sobra** (#8, Felipe) | `AnilloMision.tsx` |
| Barra | «386 productos» | Total de la lista | **bien** (unidad, #6) | `FiltrosExistencias.tsx:437-441` |
| Chips | Todo | Quita atajos | **bien** | `existencias-rapidos.ts:31` |
| Chips | Por colgar (pausa) | No filtra mientras el piso está en pausa | **sobra en pausa** (#5) | `FiltrosRapidos.tsx:82,109` |
| Chips | Sin stock atrás 918 | Falta en piso y almacén vacío | **ajustar** (#6, #7) | `existencias-rapidos.ts:35` |
| Chips | Apartadas 6 | Separadas para un cliente | **bien** | `existencias-rapidos.ts:36` |
| Chips | Dañadas 20 | En cuarentena | **bien** (ojo: «Pendientes» usa otra fuente) | `existencias-rapidos.ts:37` |
| Chips | RECOMENDADOS: Se acaban 27 · Sin ventas 203 | Ritmo de venta | **sobra** (#12, Felipe: está en Análisis) | `existencias-rapidos.ts:39-40` |
| Panel | PRENDA: Categoría, Talla, Color, Marca | Filtros de la prenda | **bien** | `FiltrosExistencias.tsx:204-268` |
| Panel | GESTIÓN: Hoy, Condición | Lo mismo que chips y cifras | **sobra** (#4) | `FiltrosExistencias.tsx:271-304` |
| Panel | VISTA: Ver como, Ordenar por | Tarjetas/Tabla/Por talla; orden | **bien** | `FiltrosExistencias.tsx:306-343` |
| Panel | «Sonido al confirmar: Sí» | Ajuste del equipo | **fuera de lugar** (#9) | `FiltrosExistencias.tsx:344` |
| Franja | «El piso nunca se ha cuadrado — Cuadrar el piso» | Va a `/inventario/cuadrar` | **sobra con barrido abierto** (#1, #11) | `InventarioPanel.tsx:128-144` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-26 | completo | 5/10 (promedio 6.0, con tope 5) | 7.4 — Soporte | primer análisis (pantalla anterior al #445) |
| 2026-09-26 (tarde) | completo, sin SQL | 5/10 (promedio 6.3, con tope 5) | 7.8 — Soporte | Sobre el PR #500 (`ffa5d52b`). **Cerradas:** #2 (el #445 se fusionó), #3, #4 y #5 (buscador con marca, filtro Marca y vacío que explica: están en el código). **Superadas por el rediseño:** #8 (el semáforo de 4 estados ya no existe, pero su defecto reaparece como «todo pide reponer»: nueva #5) y #11 (la tabla por talla dejó de ser la vista principal). **Siguen abiertas:** #1 (Ajustar, nueva #1), #10 (candado de módulo, nueva #3), #6 (estrategia alternativa: ahora sección 8), #7 (motor único de búsqueda), #9 (`es_prueba`: la lista lo excluye, `fn_resumen_variantes` sin verificar) y #12. |
| 2026-10-03 (17:38 Lima) | **rápido**, sin SQL (PR #770, sesión `vista-informativa-ux`; no comparable con filas completas) | 6.7/10 (sin tope: escrituras sin revisar) | 7.2 — Soporte | Mismo día, mismo diagnóstico de fondo («Reponer» no dice cuántas son ni desempata por venta). **Este análisis completo lo reemplaza:** suma SQL de producción, las escrituras, «Incidencias» y la cola por regularizar. Sus tareas #1 (ponerle número a Reponer), #4 (desempatar), #9 (tarjetas en cero) y #5 (capa comercial) están absorbidas en #3, #7 y la sección 8. |
| 2026-10-03 | completo, con SQL de solo lectura | 4,5/10 (promedio de 6; el tope 5 no hizo falta) | 8,0 — Núcleo | **Análisis anterior vencido** (la pantalla se rehízo: −1.284 líneas en `InventarioPanel.tsx`). Once de las 12 del 26-sep figuraban ✅ hechas (la #12 era de bajo valor); de ellas **siguen vivas en otra forma** `[inferido: comparé sus títulos con lo que hoy muestra el código]`: #5 (el umbral quedó abierto: hoy 533/533 → nueva #2/#3), #10 (un solo vocabulario: hoy tres verbos → nueva #9) y #11 (pruebas: `resumirExistencias` y `ordenarModelos` siguen sin prueba → #12). Nuevas: #1 (cola por regularizar), #4 (Eliminar en el cajón) y #5–#7 (tarjeta). |
| 2026-10-04 | completo, con SQL de solo lectura (13:56 Lima) | 4,5/10 (promedio de 6; sin tope) | 8,2 — Núcleo | **Análisis anterior vencido** (18 archivos cambiaron desde `b4cb05c3`). De sus 12: **cerrada** #10 (filtros con conteos y en la URL: ADR-0326, #774). **Cerrada en parte** #5 (la tarjeta avisa «Solo M · L (de 4 tallas)», `c5fa30bb`; el total del modelo sigue abierto). **Siguen vivas en otra forma:** #1 → nueva #1; #2 (una regla por talla: `hoyDeTalla` existe, pero `estadoTalla` sigue en paralelo) → nueva #7; #3 → nuevas #2 y #3; #6 → nueva #6; #7 → nueva #5; #8 → nueva #4; #9 (un solo verbo para bajar) sigue abierta, sin tarea propia aquí; #12 → nuevas #11 y #12. **Sigue abierta y fuera de las 12:** #4 (D4, «Eliminar el producto» en el cajón: `CajonPrendaExistencias.tsx:291`) y #11 (foto por color). Nuevo: el tope de rojo no lo hace cumplir ningún código; el mínimo de 1 por talla y color cabe en TRU (539 de 600), así que «por colgar» es casi todo error de registro. |
| 2026-11-26 | completo, **sin SQL** (la consulta no se pudo correr desde la sesión; queda en el Anexo) | 6,2/10 (promedio de 6; sin tope) | 8,2 — Núcleo | **Análisis anterior vencido** (`InventarioPanel.tsx` ±1.296 líneas desde `e6fde14d`). De sus 12, verificadas en el código: **cerrada** #2 (mínimo de 1 colgada por talla y color: `AYUDA_HOY.por_colgar`); **cerrada en otra forma** #3 («Para hoy» es el anillo + «Pendientes de hoy», ADR-0344 §16) y #8 (el panel de filtros viene cerrado y se recuerda por equipo). **No verificadas en esta pasada:** #1 (cola por regularizar), #4–#7, #9–#12. Nuevo, a pedido de Felipe («¿sirve o estorba?»): el piso sin cuadrar se dice cinco veces con dos salidas distintas (barrido y cuadrar), dos puertas al barrido, la fila GESTIÓN repite los chips, «691 de 480» sin regla, chips en otra unidad que la lista. |

## Anexo · consulta de solo lectura para Felipe (producción, proyecto `cayla-dynamic`, schema `retail`)
No se corrió: el permiso de esta sesión la frenó. Sin datos personales; pegar en el SQL Editor y devolver el resultado de cada bloque.

```sql
-- A. TRU: capacidad, cuadres y barridos (¿por qué 480 y no 600? ¿desde cuándo está abierto el barrido?)
with tru as (select id from retail.ubicaciones where nombre ilike '%TRU%' limit 1)
select
  (select row_to_json(c) from (select m2_sala, densidad, provisional, updated_at from retail.capacidad_piso
                               where ubicacion_id = (select id from tru)) c)                       as capacidad,
  (select count(*) from retail.cuadres_piso where ubicacion_id = (select id from tru))             as cuadres_tru,
  (select json_agg(json_build_object('estado', b.estado, 'abierto_el', b.created_at))
     from retail.barridos_piso b where b.ubicacion_id = (select id from tru))                      as barridos_tru;

-- B. Las 918 de «Sin stock atrás»: ¿cuántas combinaciones modelo+color sin nada en TRU vendieron algo en 30 días?
--    (aproximación por stock = 0 en la sede; el motor exacto vive en lib/piso-plan.ts)
with tru as (select id from retail.ubicaciones where nombre ilike '%TRU%' limit 1)
select count(*) as sin_nada_en_tru,
       count(*) filter (where vendio_30d) as de_ellas_vendieron_30d
from (
  select v.producto_id, v.color,
         coalesce(sum(s.cantidad), 0) as en_tru,
         exists (select 1 from retail.movimientos m
                 join retail.variantes v2 on v2.id = m.variante_id
                 where v2.producto_id = v.producto_id and v2.color is not distinct from v.color
                   and m.tipo = 'venta' and m.created_at > now() - interval '30 days') as vendio_30d
  from retail.variantes v
  left join retail.stock s on s.variante_id = v.id
       and s.ubicacion_id in (select id from tru union select id from retail.sububicaciones where ubicacion_id = (select id from tru))
  group by v.producto_id, v.color
) x
where en_tru = 0;
```
(Los nombres de columnas de B — `color`, `tipo`, la relación sede↔sububicación — son de memoria del esquema: si alguno falla, revisar `docs/datos/generado/retail_columnas.json`.)
