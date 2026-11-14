# Innovar · Recibir ▸ imprimir la tanda de etiquetas — 2026-11-14

> **Pasada rápida — sin escéptico, puede traer ideas que no aguantan.** La pregunta «¿ya existe?» se hizo idea por idea, con `grep` en el código, en
> `docs/adr/` y contra las 30 tareas de Recibir (`docs/backlog/2026-11-13-merchandise-receipt-diagram-398372.md`).

- **Alcance:** lo que trae la rama `claude/recibir-imprimir-tanda-594af7` (PR #1864): la hoja «ya están en el stock» que imprime la tanda y el orden del rollo · **Modo:** rápido (sin agentes y sin web; la fuente es el radar)
- **SHA analizado:** `726d8066e` (`origin/main`) + la rama · **Radar usado:** 2026-11-13
- **Corrieron:** el coordinador solo, con el radar · sin escéptico
- **Resultado:** 6 propuestas (3 Ahora · 3 Visión) · 4 descartadas · 3 derivadas
- **Decidido por Felipe (2026-11-14):** construir **tanda#1**. Hecha en el PR #1864: el botón quedó como «Llevar e imprimir», con «Solo llevar» al lado. Las demás siguen como propuesta.

## Qué es y qué problema resuelve hoy

Cuando llega mercadería, la tienda cuenta cada modelo, lo reparte por color y talla y lo lleva al stock sin cerrar el envío, para venderlo el mismo
día. Cada prenda necesita su etiqueta de precio con el código que lee la pistola de la caja. Desde el PR #1864 la hoja que sale después de «Llevar al
stock» imprime esas etiquetas ahí mismo, de un toque, y el rollo sale en el orden de las pilas (categoría, modelo, color, talla). Lo que queda sin
resolver: la hoja es la única puerta para imprimir esa tanda desde Recibir, nada recuerda si una tanda se etiquetó, y solo imprime la computadora que
tiene la Brother conectada (hoy 3 Macs con el ayudante, ADR-0304).

## Ahora — lo que se construye con el stack de hoy

| # | Propuesta | Para quién | Referente | Impacto | Esfuerzo | Confianza | Puntaje |
|---|---|---|---|---|---|---|---|
| tanda#1 | «Llevar al stock e imprimir»: un solo toque, sin la hoja de en medio | quien recibe | Superhuman (deshacer en vez de preguntar) | 3 | S | Alta | 3,0 |
| tanda#2 | Reimprimir una tanda desde «Ya en stock», en la lista del envío | quien recibe | Stripe Workbench (el registro trae sus acciones) | 2 | S | Alta | 2,0 |
| tanda#3 | El envío sabe qué falta etiquetar y lo imprime de una vez | encargada, quien recibe | Superhuman (lo pendiente vuelve solo) | 3 | M | Media | 1,05 |

## Visión — las apuestas grandes

| # | Propuesta | Para quién | Referente | Impacto | Esfuerzo | Confianza | Puntaje |
|---|---|---|---|---|---|---|---|
| tanda#4 | La cola de impresión de la sede: imprimir desde el celular con que se cuenta | quien recibe | Supabase Queues + Realtime (radar) | 3 | L | Media | 0,70 |
| tanda#5 | La etiqueta sale al contar: una por prenda, con la prenda en la mano | quien recibe | sin fuente verificada | 4 | L | Baja | 0,53 |
| tanda#6 | El navegador le habla directo a la Brother, sin ayudante que instalar | Felipe (soporte), quien recibe | WebUSB / Web Serial (radar) | 2 | L | Baja | 0,27 |

## Detalle de cada propuesta

### tanda#1 · «Llevar al stock e imprimir»: un solo toque  ·  Ahora · impacto 3 · esfuerzo S · confianza Alta
- **Hoy:** se toca «Llevar al stock» (`components/recepcion-conteo/LlevarAlStock.tsx:302`), sale la hoja `SalidaHecha` (`LlevarAlStock.tsx:349`) y ahí se
  toca «Imprimir N etiquetas» (`:447`). Son 2 toques y una hoja en medio cuya respuesta casi siempre es la misma: imprimir.
- **Propuesta:** en la hoja de confirmar, el botón principal pasa a ser «Llevar al stock e imprimir» y «Solo llevar» queda de secundario. Si entra y
  las etiquetas salen, no hay hoja: un aviso «3 de Blusa Emma en el stock · etiquetas enviadas». Si la impresión falla o no se sabe si salió (diálogo
  del navegador), se abre la hoja de hoy, que ya sabe reintentar.
- **El momento que mejora:** Trujillo lleva cada modelo al stock apenas lo reparte. En un envío de 12 modelos son 12 toques y 12 hojas menos.
- **Cómo lo hacen los mejores:** Superhuman — en vez de preguntar antes, actúa y deja deshacer o repetir
  ([fuente](https://download.superhuman.com/Superhuman%20Keyboard%20Shortcuts.pdf), v8; radar n.º 39, ADOPTAR, consultado 2026-11-13).
- **Lo que lo habilita:** nada nuevo: `useEtiquetasDeLaTanda` e `imprimirYSaber`, que ya están en la rama.
- **DECIDÍ** pedir las etiquetas cuando la base ya respondió, porque las variantes y cantidades salen de ese resultado y el precio puede haberse
  cambiado en la misma hoja · **DESCARTÉ** imprimir antes de que la base confirme: saldría papel de algo que no entró · **SE ROMPE SI** el botón no
  dice «imprimir» con todas sus letras: ADR-0180 pide que imprimir sea un clic consciente de la persona.
- **Primer paso:** el botón con sus dos caminos y la hoja de hoy como respaldo; medir los toques con la tarea 1 del tablero de Recibir.
- **Cómo quedó construida:** la hoja «ya están en el stock» sí aparece, ya imprimiendo, y se cierra sola cuando las etiquetas salen. Así hay un solo
  camino de impresión y, si algo falla, la persona ya está donde se reintenta. No se hizo el aviso sin hoja.
- ⚠ No cambia qué entra al stock ni cuándo (llama a la misma `llevar_al_stock_ahora`), pero vive en el botón que mete stock: espera el OK de Felipe.
- **Veredicto del escéptico:** sin escéptico (pasada rápida).

### tanda#2 · Reimprimir una tanda desde «Ya en stock»  ·  Ahora · impacto 2 · esfuerzo S · confianza Alta
- **Hoy:** en la lista del envío, un modelo que ya entró solo ofrece «Corregir N» (`components/recepcion-conteo/CategoriasAcordeon.tsx:257`). Si la
  hoja se cerró sin imprimir, se canceló el diálogo o se atascó el rollo, pasados los 7 segundos del aviso la tanda ya no se imprime desde Recibir:
  hay que ir a Existencias, marcar las tallas y abrir Etiquetas.
- **Propuesta:** junto a «Corregir», un enlace «Etiquetas» que abre la misma hoja `SalidaHecha` con esa tanda. La lista ya trae las líneas de cada
  tanda (`fn_salidas_del_envio`, `lib/recepcion-salida-reglas.ts:8` y `:12`). No pide nada nuevo de la base.
- **El momento que mejora:** el rollo se acaba a mitad de una tanda, o alguien cierra la hoja por error. Hoy eso cuesta salir de Recibir.
- **Cómo lo hacen los mejores:** Stripe Workbench — cada registro se abre con lo que le pasó y lo que se puede hacer con él
  ([fuente](https://docs.stripe.com/workbench/overview), sin fecha; radar n.º 44, PROBAR, consultado 2026-11-13). Es un referente de patrón, no de retail.
- **DECIDÍ** reusar la hoja tal cual, para que haya una sola manera de imprimir una tanda · **DESCARTÉ** un botón que imprima directo desde la fila:
  sin la hoja no hay dónde decir que falló · **SE ROMPE SI** el modelo tuvo varias tandas: la lista solo guarda la última (`ultimaSalidaDe`), así que
  el enlace imprimiría esa y no las anteriores; hay que decidir si ofrece cada tanda o todas juntas.
- **Primer paso:** el enlace en `FilaYaEnStock`, con su paso en la guía de Recibir y la huella al día.
- **Veredicto del escéptico:** sin escéptico (pasada rápida).

### tanda#3 · El envío sabe qué falta etiquetar  ·  Ahora · impacto 3 · esfuerzo M · confianza Media
- **Hoy:** nada guarda si una tanda se imprimió. `retail.despacho_salidas` (`supabase/migrations/20261104005000_salida_anticipada_de_un_modelo.sql:65`)
  sabe quién la llevó y cuándo, no si se etiquetó. Una prenda en el stock sin etiqueta no se puede escanear en Vender.
- **Propuesta:** la tanda guarda cuándo se mandaron a imprimir sus etiquetas y quién lo hizo. La lista dice «2 modelos sin etiqueta» y un botón
  imprime lo que falta de una vez, en el orden de las pilas. «Revisar y cerrar» lo avisa, sin bloquear.
- **El momento que mejora:** al final del día, la encargada ve de un vistazo que no quedó nada en el almacén sin etiqueta.
- **Cómo lo hacen los mejores:** Superhuman — lo que quedó pendiente vuelve solo arriba, con el siguiente paso listo
  ([fuente](https://blog.superhuman.com/the-next-superhuman-ai/), sin fecha; radar n.º 48, PROBAR, consultado 2026-11-13).
- **DECIDÍ** guardar «se mandó a imprimir», nunca «se imprimió»: por el diálogo del navegador no se sabe si salió papel · **DESCARTÉ** bloquear el
  cierre del envío por etiquetas: el papel pudo salir desde la pantalla de Etiquetas · **SE ROMPE SI** se imprime por «Ajustar antes de imprimir» y esa
  pantalla no marca la tanda: el contador mentiría. Hay que marcar también allí cuando llega con `?envio=`.
- **Primer paso:** la columna, la marca al imprimir desde la hoja y el número en la lista.
- ⚠ Es un cambio de esquema en producción y es la decisión que Felipe reservó al encargar la tarea 6: espera su OK.
- **Veredicto del escéptico:** sin escéptico (pasada rápida).

### tanda#4 · La cola de impresión de la sede  ·  Visión · impacto 3 · esfuerzo L · confianza Media
- **Hoy:** solo imprime la computadora que tiene la Brother: el ayudante escucha en esa misma máquina (`lib/mac-etiquetas.ts:15`). Quien cuenta desde
  el celular (`components/recepcion-conteo/ListaEnElCelular.tsx`) puede llevar al stock, pero «Imprimir» le abre el diálogo de su teléfono.
- **Propuesta:** una cola de impresión por sede en la base. El celular o la tablet encola la tanda y el ayudante de la Mac de la tienda la saca por la
  Brother. La hoja dice «en cola» y después «enviada».
- **El momento que mejora:** dos personas reciben el mismo fardo (tarea 29 del tablero de Recibir): una cuenta con el celular junto a las bolsas y las
  etiquetas salen en el mostrador.
- **Cómo lo hacen los mejores:** no hay un referente de retail en el radar. **Lo que lo habilita:** Supabase Queues (pgmq), PROBAR
  ([fuente](https://supabase.com/changelog), entradas 2024-12-10 y 2025-10-08) y Realtime Broadcast from Database, PROBAR
  ([fuente](https://supabase.com/changelog), entradas 2025-04-08 y 2026-06-11), consultados 2026-11-13.
- **DECIDÍ** que saque la cola el ayudante que ya existe, no un servicio nuevo · **DESCARTÉ** imprimir por la red directo a la Brother desde el
  navegador: una página no puede · **SE ROMPE SI** la Mac de la tienda está apagada (la tanda queda en cola y hay que decirlo) o si la cola deja
  imprimir en una sede que la cuenta no opera (pide su regla por fila).
- **Primer paso:** medir cuántos envíos se cuentan hoy desde un celular; sin ese dato el impacto es una suposición.
- **Veredicto del escéptico:** sin escéptico (pasada rápida).

### tanda#5 · La etiqueta sale al contar  ·  Visión · impacto 4 · esfuerzo L · confianza Baja
- **Hoy:** se cuenta y se reparte todo el modelo, después sale el rollo y cada etiqueta se empareja con su prenda. Por eso importa el orden del rollo.
- **Propuesta:** un modo «etiqueta en mano»: en la tabla de tallas, cada «+» (`components/recepcion-conteo/TallasDeLaPlaca.tsx:360`) imprime la
  etiqueta de esa prenda y se pega antes de soltarla. Ya no hay rollo que emparejar con pilas.
- **El momento que mejora:** modelos de muchos colores (4,6 colores por modelo, medido el 2026-11-13), donde buscar la etiqueta de cada prenda es lo lento.
- **Cómo lo hacen los mejores:** sin fuente verificada. Es práctica de almacén (etiquetar pieza por pieza al recibir), no una entrada del radar.
- **DECIDÍ** dejarla en Visión · **DESCARTÉ** proponerla para hoy por dos frenos reales · **SE ROMPE SI** (1) el precio se decide después de contar,
  en la hoja «Llevar al stock»: la etiqueta saldría con el precio de antes; (2) imprimir una por una es lento con el ayudante de hoy, que arma un PDF
  por cada trabajo; (3) cada «−» deja una etiqueta impresa de más.
- **Primer paso:** cronometrar en una tienda cuánto toma emparejar un rollo de 12 etiquetas con sus prendas. Si es poco, esta idea no vale.
- **Veredicto del escéptico:** sin escéptico (pasada rápida).

### tanda#6 · El navegador le habla directo a la Brother  ·  Visión · impacto 2 · esfuerzo L · confianza Baja
- **Hoy:** cada Mac que imprime necesita el ayudante instalado desde Terminal (ADR-0304; hoy 3 Macs). Sin él, la etiqueta sale larga por el diálogo de Chrome.
- **Propuesta:** que la página le mande el trabajo a la Brother por USB, con permiso de la persona, sin ayudante ni diálogo, y que sepa antes de
  mandar si la impresora está lista.
- **El momento que mejora:** una Mac nueva en una tienda imprime sin que nadie abra Terminal.
- **Lo que lo habilita:** WebUSB / Web Serial, PROBAR en el radar, pensado para la térmica de tickets
  ([fuente](https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API), consultado 2026-11-13).
- **DECIDÍ** ponerla última: el ayudante ya funciona y ya dice por qué falla · **DESCARTÉ** proponerla como reemplazo: amarra la sede a Chrome y la
  Brother QL habla su propio lenguaje, que habría que escribir · **SE ROMPE SI** el sistema operativo ya tomó la impresora con su driver.
- **Primer paso:** ninguno por ahora. Vale reabrirla si se suma una cuarta o quinta computadora que imprima.
- **Veredicto del escéptico:** sin escéptico (pasada rápida).

## Para otras skills
- `/chaos`: doble clic en «Imprimir», cerrar la hoja con la impresión en camino y dos pestañas imprimiendo la misma tanda. No descuadra la base, pero saca papel dos veces.
- `/formidable`: la hoja dice «1 de X ya **están** en el stock» con una sola prenda, y cuando el aviso de error se va los botones suben y un segundo clic puede caer en «Bajar al piso».
- `skill-evaluacion-observabilidad`: un fallo del ayudante solo lo ve quien imprime. No queda registro de cuántas impresiones fallan por sede.

## Descartadas (para que nadie las vuelva a proponer)
| Propuesta | Por qué no |
|---|---|
| «Bajar al piso» desde la misma hoja, sin ir a su pantalla | Choca con ADR-0208 y ADR-0237: la bajada se registra escaneando cada prenda al colgarla, y Frescura del piso mide desde ese momento. Sería un cambio de regla, no una mejora. |
| Impresión silenciosa en Windows (sin el diálogo de Chrome) | ADR-0304: Felipe descartó imprimir desde Windows; las tiendas imprimen desde Mac con el ayudante. |
| RFID por prenda | El radar lo tiene en ESPERAR: costo por etiqueta y lectores frente a 3 tiendas. |
| Imprimir las etiquetas con lo que anunció Compras, antes de contar | Hasta donde leí, el aviso de Compras trae cuántas prendas por modelo, no su color ni su talla: eso se reparte al recibir, así que todavía no hay qué imprimir. |

## Lo que no se miró
- La base y la operación a fondo (miradas C y D): esta pasada no leyó `llevar_al_stock_ahora` ni midió nada en producción.
- La web: ningún referente de retail se buscó fuera del radar. Dos propuestas (tanda#4 y tanda#5) no tienen un referente de retail con fuente.
- El papel real: el PR #1864 se probó con la impresión simulada.
- Cuánto se cuenta desde el celular y cuánto toma emparejar el rollo con las prendas. De esos dos números dependen tanda#4 y tanda#5.
