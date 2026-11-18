# Pantalla — Tienda web ▸ Vitrina ▸ Probador (`/tienda-web/vitrina/probador`)

> Modo: **rápido** (sin SQL de producción, sin referentes de ERP, sin inventario) · Fecha: 2026-10-26 · Rol/sede: Admin, Tienda TRU (captura de Felipe) y Tienda Lima en local (medición)
> Datos: producción solo lo que muestran las dos capturas de Felipe (268 prendas, 175 listas, 6 sin largo, 605 colores, 169 fotos pendientes); medición de layout en local con 9 fotos
> SHA analizado: `3718dfa84` (origin/main, la rama va al día: 0 commits de diferencia) — si `ProbadorPantalla.tsx`, `vitrina-probador-reglas.ts` o `globals.css` (`.mov-boton`) cambian después, este análisis está vencido
> Archivos: `app/(app)/tienda-web/vitrina/probador/page.tsx` · `components/vitrina/ProbadorPantalla.tsx` · `PrepararRecortesHoja.tsx` · `RevisarRecorteHoja.tsx` · `ProbadorPrendaHoja.tsx` · `lib/vitrina-probador-reglas.ts` · `lib/recorte-probador*.ts` · RPC `fn_vitrina_probador`, `fn_vitrina_recortes`, `registrar_recorte`
> Otra sesión tocándola: no la pantalla. `docs/SESIONES-ACTIVAS.md` lista la de Looks (`claude/looks-elegir-prendas-por-foto`, misma carpeta `components/vitrina/`, otra pestaña) y la de Resumen/Vitrina (`tienda-vitrina-resumenes`).
> Análisis previo: `docs/formidable/tienda-web-vitrina-probador.md` (2026-10-17, ADR-0434, PR #1164). Esta pasada lo toma como base: sus pendientes se retoman abajo (#9).

## 0 · Veredicto
La pantalla ya hace bien lo difícil (cuenta solo lo que la tienda muestra, dice una palabra por prenda y pone el paso que toca arriba). Lo que falla hoy es la **forma**: la tarjeta de recorte corta la primera letra del color en su esquina de abajo, las tarjetas no miden lo mismo y en una pantalla de 2000 px la lista deja ~900 px vacíos entre el nombre y los datos.
**Cumple su finalidad:** 7,2/10 · **Relevancia:** 5,4/10 — Comodidad (sube a Soporte si «Arma el tuyo» pasa a ser lo que más vende en la web)

## 1 · Finalidad declarada
"Esta pantalla existe para que cada prenda de la web tenga lo que necesita el probador de looks «Arma el tuyo»: un largo y un recorte listo; y para planear las fotos por color que faltan." Fuente: ADR-0434 y el comentario de `page.tsx:11-14` (no la captura). ¿Docs y pantalla coinciden? Sí.

## 2 · Objeción
1. **«Dos columnas» no es la respuesta a todos los anchos.** A 1440 px la tarjeta mide 1091 px y la columna del nombre 431 px, con un texto de ~170 px: sobran ~260 px, no 900. Dos columnas de la fila completa piden ~880 px cada una, así que solo caben desde una tarjeta de ~1800 px (tu monitor de 2000 px sí). Más angosto, la fila partida en dos se aprieta o pierde datos. Por eso la regla va por **ancho medido**, como la Lista de Modelos (`modoDeLista`, `useAnchoDe`), no por columnas fijas. [medido en local a 1440; visto en tu captura de 2000]
2. **Quitar no es solo «mover cosas»:** hay dos listas (prendas y fotos) que cuentan la misma tubería (foto → recorte → largo) con **cuatro unidades distintas** en las cuatro tarjetas (prendas, prendas, colores, fotos). Nadie puede sumarlas de cabeza [visto]. Eso pesa más que cualquier columna.

## 3 · Lo que está bien y no se toca
- La cabecera con el paso que toca («Preparar 96 recortes») y las tarjetas que filtran y dicen que filtran (`ProbadorPantalla.tsx:184-195`, píldora de filtro puesto en `:263`) `[código]`.
- Una palabra por prenda («Lista», «Falta su foto», «Revisa el recorte»…) en el orden en que se arregla: `veredictoDelProbador`, `vitrina-probador-reglas.ts` (coincide con `estaLista` por prueba) `[código]`.
- Solo cuenta lo que la tienda muestra (`soloLoQueEntra`, misma regla de zonas que `apps/tienda`) `[código]`.
- Hojas con «Responsable», «Deshacer» del descarte y pausa del lote sin perder lo hecho `[código; formidable 2026-10-17]`.
- La tarjeta de recorte ya sabe decir «sin recorte» (gris y apagada) sin necesitar texto `[código :464-468]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 6,5 | Primera letra del color cortada y tarjetas de alto desigual; lista con hueco enorme en pantalla ancha. Coherente con los tokens y sin un hex suelto. | `[visto]` capturas 1 y 2 · `[código ProbadorPantalla.tsx:458]` |
| Lógica de negocio | 7,5 | La regla de «sale» es clara y única. «Preparar» no sabe qué hacer con fotos sin fondo transparente (ver #3). | `[código recorte-probador.ts:70]` |
| Arquitectura | 7,5 | Nada toca dinero ni stock: es lectura + escritura de recortes y largos con `for update` y «gana el último». El lote corre en el navegador de quien lo lanza. | `[código]` · formidable «Antes de decir listo» |
| Funciones | 6,5 | Faltan: filtro por «qué le falta», filtro «Descartadas», «Anterior» en Revisar, ver/rehacer recortes desde la prenda. Sobra duplicación de puertas a «Revisar». | `[código :148-160, :308-312]` |
| Utilidad | 7 | Se entiende y se termina sin manual (ciega 2026-10-17). Duda de lectura: «0 de 11 · 5 por foto». | `[visto]` captura 1 · `[código :433-436]` |
| Conexión con el ERP | 8 | Vive en el módulo `vitrina_web`; usa la regla compartida con la tienda; los recortes alimentan «Arma el tuyo». Si la base no responde, dice «No se pudieron leer las fotos». | `[código page.tsx:30-38]` |

### Estética — por qué se corta (causa raíz, medida)
`[visto]` En tu captura 2, la primera letra de «Beige», «Índigo», «Marrón», «Plomo rata» y «Blanco» sale mordida, y el acento de la «Í» aplastado.
`[código]` La tarjeta es un `<button class="mov-boton rounded-xl …">` con **cero relleno** (`ProbadorPantalla.tsx:458`). `.mov-boton` fija `overflow: hidden` (`globals.css:1628-1631`, para que la luz y la onda no se salgan) y la tarjeta tiene esquina de 12 px: el texto de la última línea nace pegado al borde izquierdo, justo donde la **esquina redondeada recorta**. Los spans `line-clamp-1` (también `overflow: hidden`, alto de línea 18 px) cortan arriba el acento.
`[medido en local]` Con el mismo componente y los nombres de color de tu captura, la mordida se reproduce; al darle 6 px de relleno lateral a la tarjeta, «Marrón» sale entera. Texto a 0 px del borde de su tarjeta; `overflow: hidden` en tarjeta y en spans.
`[visto]` Las filas quedan de distinto alto: el chip «Por revisar» baja a su propia línea en algunas tarjetas (`:472-483`) y toda la fila crece por la más alta; de ahí el hueco grande entre la 2.ª y la 3.ª fila de tu captura.

### Funciones — lo que sobra
- Cuatro puertas al mismo «Revisar»: botón de la cabecera, tarjeta «Fotos pendientes», botón «Revisar N» de la franja y la propia foto (`:184`, `:239`, `:308`, `:343`).
- «Colores por fotografiar» (605) no frena el probador (`vitrina-probador-reglas.ts`, comentario inicial) pero ocupa una de las 4 tarjetas y una columna y un filtro. Es un número sin acción en esta pantalla.
- La nota final de 4 líneas (`:356-363`) repite la regla del probador en un párrafo.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 7 | Decide qué prendas salen en «Arma el tuyo» y qué fotos faltan; indirecto: alimenta lo que ve la clienta del probador |
| Dinero y stock que toca | ×1 | 2 | No mueve dinero ni stock; sí el contenido de la web |
| Frecuencia y personas que la usan | ×1 | 5 | Una o dos personas; mucho al inicio y por lotes cuando entra mercadería nueva |
| Qué se detiene si falla | ×1 | 6 | Sin recortes ni largo, la prenda no sale en el probador; la tienda sigue vendiendo |

Relevancia = (2·7 + 2 + 5 + 6) / 5 = **5,4** → Comodidad. (El 9 del formidable de octubre medía otra cosa: cuánto vale arreglar la pantalla; esta fórmula mide cuánto se detiene si no existe.)

## 6 · Conexión con el ERP
- **Aguas arriba:** `fn_vitrina_probador` (prendas publicadas con sus colores, ventas de 90 días y recortes), `fn_vitrina_recortes`, fotos subidas desde Catálogo ▸ «Editar sus fotos».
- **Aguas abajo:** `apps/tienda` («Arma el tuyo»), la guía interactiva `tienda-web.vitrina.probador`.
- **Pájaro dueño y vecinos:** `vitrina_web` (Tienda web). Hermanas: Modelos y Looks, que ya tienen su regla de ancho y su selector de prendas.
- **Externos:** el recortador de MODNet ya no existe (ADR-0442); lo que cae es el almacenamiento de fotos. Se degrada así: el lote se pausa y lo hecho queda guardado.

## 7 · Las 12 tareas, por importancia
### #1 · Corregir — La tarjeta de recorte ya no corta el texto de abajo
- **Dónde:** `ProbadorPantalla.tsx:458` (`CeldaRecorte`), `globals.css:1628` (`.mov-boton`)
- **Por qué en este puesto:** es lo que viste y lo que dijiste; certeza total y esfuerzo mínimo; toda la cuadrícula se ve mal por esto
- **Cómo lo verificas tú:** en el navegador, acerca «Beige», «Índigo», «Plomo rata» con el mouse encima y sin él: la primera letra y el acento salen enteros; la tarjeta que sube 2 px no corta nada
- **Esfuerzo / dependencias:** S · ninguna
- **Cómo:** dar a la tarjeta un relleno interior (`p-2`, que además deja la caja al costado como pediste) y dejar que el nombre y el color usen `truncate`/`line-clamp` con un `pb` de 1–2 px para acentos. Sin tocar `.mov-boton`, que lo usan todos los botones.

### #2 · Corregir — Todas las tarjetas del mismo alto
- **Dónde:** `ProbadorPantalla.tsx:472-483`
- **Por qué:** el chip «Por revisar» baja a una 3.ª línea y estira su fila entera → huecos de hasta 100 px entre filas
- **Cómo lo verificas tú:** con las 40 fotos de la página, todas las filas miden lo mismo (se mide con `getBoundingClientRect`) y ya no hay franjas vacías
- **Esfuerzo / dependencias:** S · junto con #1
- **Cómo:** el estado pasa a una insignia sobre la esquina de la foto (`Por revisar` ámbar, `Descartada` apagada); debajo quedan solo el nombre y el color, a dos líneas fijas. «Sin recorte» ya se ve por el gris y no necesita texto.

### #3 · Corregir — «Preparar» frente a fotos sin fondo transparente
- **Dónde:** `recorte-probador.ts:70` (lanza `SIN_TRANSPARENCIA` y no escribe nada) · `PrepararRecortesHoja.tsx:22-80` (cuenta fallas seguidas y se pausa con «casi siempre es la conexión»)
- **Por qué en este puesto:** `[inferido]` una foto subida como JPG o PNG con fondo nunca llega a tener fila en `foto_recortes`, así que queda «Sin recortar» **para siempre**: cuenta en «Fotos pendientes», mantiene viva la cabecera «Preparar N recortes» y, si hay varias seguidas, la hoja se pausa culpando a la conexión. El paso nunca llega a cero y el aviso miente.
- **Cómo lo verificas tú:** una consulta en producción que cuente las fotos de prendas que entran sin fila en `foto_recortes` y cuya imagen no es PNG (te la preparo si quieres; este análisis no la corrió); después, subir un JPG de prueba en local y ver qué dice «Preparar»
- **Esfuerzo / dependencias:** M · antes de #5 (cambia lo que cuentan las cifras)
- **Estructural.** **DECIDÍ:** separar «sin fondo transparente» de «sin recorte»: se muestran aparte («12 fotos sin fondo transparente: cámbialas en Editar sus fotos») y no entran al lote. **DESCARTÉ:** marcarlas `descartado` en `foto_recortes` porque mezcla «alguien la miró y la rechazó» con «ni se pudo mirar», y toca una tabla que `/chaos` ya vigila. **SE ROMPE SI:** una foto vieja sí es PNG transparente pero la primera descarga falló por red: se clasificaría como «sin fondo» y no se reintentaría hasta recargar la página.

### #4 · Mejorar — La lista en dos columnas solo cuando caben
- **Dónde:** `ProbadorPantalla.tsx:65-74` (`COLUMNAS`, `PLANTILLA` con breakpoints `sm:`/`xl:` de la ventana), `:285-290`, `PRENDAS_POR_PAGINA = 25`; patrón: `modoDeLista` en `vitrina-reglas.ts:220` y `useAnchoDe.ts`
- **Por qué:** en tu captura la tarjeta mide ~1900 px y el nombre termina en ~300: ~900 px vacíos por fila (25 filas de 72 px = ~1800 px de alto). Con dos columnas se ven 24 prendas en la mitad del alto.
- **Cómo lo verificas tú:** a 2000 px dos columnas con su encabezado cada una; a 1440 una columna como hoy; a 1024 y 375 sin cambios; el orden sigue siendo «más vendida primero», leyendo de izquierda a derecha y bajando
- **Esfuerzo / dependencias:** M · después de #1 y #2 (si no, se multiplica el defecto)
- **Estructural.** **DECIDÍ:** dos columnas **de filas completas** cuando la tarjeta mide ≥ ~1800 px (medida con `useAnchoDe`), 24 por página (par), orden fila a fila (no `columns` de CSS, que partiría el ranking). **DESCARTÉ:** `columns` de CSS (la opción B de la spike de Modelos, que Felipe no eligió: el ranking de ventas se lee de arriba abajo de cada columna, no por fila) y una versión compacta a 1440 px (pierde «Largo» o «En el probador», lo que más se mira). **SE ROMPE SI:** el panel lateral se pliega o la ventana cambia de tamaño con una hoja abierta y el modo salta de 2 a 1 columna: hay que conservar la fila abierta y su foco.

### #5 · Mejorar — Un filtro por lo que le falta y la tarjeta «No salen»
- **Dónde:** `vitrina-probador-reglas.ts` (`FiltroPrendas`, `filtrarPrendas`, `veredictoDelProbador`), tarjetas en `ProbadorPantalla.tsx:197-245`
- **Por qué:** hoy solo se filtra por «Listas», «Les falta el largo» y «Colores por fotografiar»; las prendas que **no salen y más venden** (la cola de trabajo real, 93 de 268 en tu captura) solo se ven bajando y leyendo. La lista ya está ordenada por ventas: falta poder decir «solo las que no salen».
- **Cómo lo verificas tú:** `DesplegablePildora` «Qué le falta» con las 5 palabras del veredicto + «No salen»; el número de «No salen» = 268 − 175; la píldora de filtro puesto lo dice
- **Esfuerzo / dependencias:** M · después de #3 (el «sin fondo» pasa a ser uno de los motivos)

### #6 · Mejorar — Que «Colores por fotografiar» sirva para algo
- **Dónde:** tarjeta `:220-232`; columna `Fotos por color` `:70`; filtro `por_fotografiar`
- **Por qué:** 605 colores sin foto, en 168 prendas, es el cuello de botella real (la captura lo dice sola), pero aquí solo es un número. Lo que falta no es la tarjeta sino **la lista para la sesión de fotos**: cada color con stock y sin foto, ordenada por lo más vendido.
- **Cómo lo verificas tú:** un `<BotonDescargar>` «Descargar Excel» que baja prenda · color · stock · vendidas, ordenada por ventas; la tarjeta deja de competir con las que bloquean
- **Esfuerzo / dependencias:** M · independiente. **Decide Felipe** si sale de las 4 tarjetas o se queda.

### #7 · Corregir — Texto de «Fotos por color»
- **Dónde:** `ProbadorPantalla.tsx:433-436` («0 de 11 · 5 por foto»)
- **Por qué:** `[visto]` se lee «5 por foto» como «5 por cada foto»; quiere decir «faltan 5 con stock». Ley 4 de `/formidable` (lenguaje de tienda).
- **Cómo lo verificas tú:** la columna dice «0 de 11 con foto · faltan 5» y no cabe en más de una línea a 1280 px
- **Esfuerzo:** S

### #8 · Mejorar — La hoja de la prenda muestra y rehace sus recortes
- **Dónde:** `ProbadorPrendaHoja.tsx` (hoy solo una línea de cuentas, `:109-111`)
- **Por qué:** conecta las dos listas: de la prenda llegas a sus fotos y puedes usar, descartar o rehacer sin ir a la cuadrícula. Pendiente desde el formidable del 2026-10-17.
- **Cómo lo verificas tú:** abrir una prenda, ver sus fotos con su estado y revisar una sin salir de la hoja
- **Esfuerzo:** L · base de #12

### #9 · Mejorar — Filtro «Descartadas» y «Anterior» en Revisar
- **Dónde:** `FILTROS_FOTOS` `:44-49`, `RevisarRecorteHoja.tsx`
- **Por qué:** un descarte por error hoy se pierde (la fila dice «Sin recorte»), y «Revisar N» avanza pero no retrocede. Pendiente del formidable.
- **Cómo lo verificas tú:** descartar una foto y encontrarla en «Descartadas»; en «Revisar» volver a la anterior
- **Esfuerzo:** S–M

### #10 · Mejorar — Las fotos de una misma prenda, juntas
- **Dónde:** `ProbadorPantalla.tsx:341-345` (orden de `deLaPagina`)
- **Por qué:** `[visto]` «Blusa Mariposa» ×4, «Blusa Emilia» ×2, «Corsets Variados» ×3: el nombre se repite y lo que distingue a cada tarjeta es el color, que va en gris pequeño. Con el color primero (o un título de prenda por grupo) se lee más rápido.
- **Esfuerzo:** M · bajo valor si se hace #8

### #11 · Eliminar/fusionar — La nota larga y la puerta repetida
- **Dónde:** `:356-363` y `:308-312`
- **Por qué:** el párrafo repite la regla del probador; mejor un «¿Qué entra al probador?» a un toque junto al título «Prendas». «Revisar N» de la franja duplica el botón de la cabecera.
- **Esfuerzo:** S · bajo valor / opcional

### #12 · Replantear — ¿Una lista y no dos?
- Ver sección 8. **Pide tu decisión**, no cierra el resto.
- **DECIDÍ:** que Felipe elija entre mantener las dos listas (con #1–#11) o pasar a una cola de prendas con las fotos dentro. **DESCARTÉ:** decidirlo yo porque cambia qué ve cada colaborador y depende de si revisar recortes es una tarea de mirar todo junto o de resolver prenda por prenda. **SE ROMPE SI:** se quita la hoja de contactos y alguien necesita comparar el estilo de 40 recortes de un vistazo (control de calidad visual), cosa que la lista por prenda no da.

## 8 · Estrategia alternativa
**Una sola cola de prendas.** La página queda como «Prendas»: cada fila ya dice qué le falta (#5), al tocarla se abre su hoja con **sus fotos, sus recortes y su largo** (#8). La cuadrícula de «Fotos de la web» sale de la página; «Revisar N» sigue como paso de la cabecera.
- **Ganas:** una pantalla = un camino (prenda → qué falta → arréglalo); las cuatro tarjetas pasan a una sola unidad (prendas); desaparece la mitad de abajo, que es la que se corta, mide distinto y tiene su propia paginación.
- **Pagas:** se pierde la hoja de contactos para mirar todas las fotos de un golpe; la hoja de la prenda se vuelve más pesada (L); hay que repetir la ciega con colaboradoras reales.
- **Mi lectura:** hacer #1–#7 primero (todos chicos) y decidir esto después de ver la pantalla ya limpia; si «Fotos de la web» se sigue usando solo para pulsar «Revisar», entonces sobra.

## 9 · Referentes de ERP y futuro
No se corrieron (modo rápido). Anotado para después: un tablero de «Pendientes de contenido» por prenda, como lo tienen los catálogos de comercio electrónico (no verificado de memoria).

## 10 · Fuera de esta pantalla
**El cuello de botella no son los recortes, son las fotos.** Tu captura dice 605 colores con stock sin foto propia, en 168 de 268 prendas (63 %), contra 96 fotos por recortar. Por decisión del 2026-10-16, un color sin foto se elige igual y la figura muestra **otra foto** de la prenda con un aviso: en la mayoría de las prendas, la clienta que elige «negro» va a ver un recorte de otro color. Esta pantalla está pulida para terminar la parte más chica del trabajo. Lo que mueve la calidad del probador es planear y fotografiar los colores (#6).

## 11 · Líneas propuestas para el backlog
- [ ] `[pantalla:tienda-web-vitrina-probador]` #1 Tarjeta de recorte sin texto cortado — S
- [ ] `[pantalla:tienda-web-vitrina-probador]` #2 Tarjetas de recorte del mismo alto (estado sobre la foto) — S
- [ ] `[pantalla:tienda-web-vitrina-probador]` #3 «Preparar» y fotos sin fondo transparente — M
- [ ] `[pantalla:tienda-web-vitrina-probador]` #4 Lista de prendas en 2 columnas desde ~1800 px — M
- [ ] `[pantalla:tienda-web-vitrina-probador]` #5 Filtro «Qué le falta» y tarjeta «No salen» — M
- [ ] `[pantalla:tienda-web-vitrina-probador]` #6 Lista descargable de colores por fotografiar — M
- [ ] `[pantalla:tienda-web-vitrina-probador]` #7 Texto «0 de 11 con foto · faltan 5» — S
- [ ] `[pantalla:tienda-web-vitrina-probador]` #8 La hoja de la prenda muestra y rehace sus recortes — L
- [ ] `[pantalla:tienda-web-vitrina-probador]` #9 Filtro «Descartadas» y «Anterior» en Revisar — S–M
- [ ] `[pantalla:tienda-web-vitrina-probador]` #10 Fotos de una misma prenda agrupadas — M (bajo valor)
- [ ] `[pantalla:tienda-web-vitrina-probador]` #11 Nota larga a «¿Qué entra?» y quitar «Revisar N» repetido — S (opcional)
- [ ] `[pantalla:tienda-web-vitrina-probador]` #12 Decisión: ¿una cola de prendas en vez de dos listas? — decide Felipe

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-10-26 | rápido | 7,2 | 5,4 | — (primer `/pantalla`; el formidable del 2026-10-17 queda en `docs/formidable/`) |
| 2026-10-26 (después) | — | — | — | **#1, #2 y #7 hechas** (sin commit): tarjeta con relleno `p-2` y el estado sobre la foto (todas miden lo mismo: 224 px a 1440, 217 a 2000, 228 a 375), y «0 de 11 con foto / faltan 5 con stock». Medido en el navegador a 1440, 2000 y 375 px, en claro y oscuro. |
