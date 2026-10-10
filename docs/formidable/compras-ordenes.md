# Formidable · Compras ▸ Órdenes de compra   (`/compras/ordenes`, `/compras/ordenes/nueva`, `/compras/ordenes/editar/[id]`, `/compras/ordenes/ver/[id]` y la hoja «Anular orden»)

- **Fecha / SHA:** 2026-10-10 · `d955d4b2` (rama `claude/purchase-order-redesign-9b0c82`, ADR-0362 fase 1 · actividad 7) · **Dispositivo que manda:**
  escritorio (laptop con el menú abierto); 375 px también cuenta, porque se usa en Gamarra (lo dice el mapa de módulos de ADR-0362, todavía
  propuesta; no está en PL-105).
- **Pregunta que debería resolver (1 frase):** «¿Qué le pedí a cada proveedor, a dónde llega y cuánto es?» · **Protagonista:** el pedido (proveedor,
  a dónde llega, total).
- **Veredicto en una línea:** «Se entiende en 5 s y las dos tareas se completan sin datos mal guardados; pero "Llega a" viene puesto con ✓ y
  "Por repartir" no se entiende (la mercadería puede ir a otra tienda), después de guardar la orden no se ve, y un reintento tras perder la
  señal puede confirmar un total que la base no guardó.»
- **Escala:** 3 agentes (2 ciegos y 1 escéptico, Opus). Medición con `medir-oficio.js` a 1440, 1024 y 375 px y los escáneres que ya existen
  (`pnpm focus`, `pnpm sugerir`, `scripts/rendimiento/ui.mjs`). Todo en un banco aislado (`oc.localhost:3027`, base `cayla-oc`), nunca en la base
  compartida ni en producción.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 6 | [Observado] 2 ciegas: lectura de 5 s correcta y las dos tareas completas; **2 de 2 dudaron si la orden se había guardado** (la lista vuelve filtrada en su sede y la orden no está) · real: sin probar |
| 2 Una pregunta, una respuesta | 8 | [Medido] una sola acción primaria en la lista y en el formulario; [Opinión] en la ventana de la orden no hay primaria y «Editar» va último, lo menos visible |
| 3 Simplicidad profunda | 7 | [Opinión] las tres tarjetas traducen la plata a «pedido a proveedores / llega a tu tienda / por repartir»; la orden se lee como un papel |
| 4 Lenguaje de tienda | 5 | [Observado] «Por repartir» no lo entendieron 2 de 2; «Llega a Lima» (la tienda) choca con «se reparte desde Lima»; «Generada» 1 de 2; «Destino: Llega a Tienda Trujillo» lo dice dos veces |
| 5 Contenido primero | 8 | [Medido] el total es la cifra más grande de cada fila y tarjeta; la orden abre con sus prendas y su total |
| 6 Lo difícil, a un toque | 6 | [Medido] qué es «Por repartir» aparece recién DESPUÉS de elegirlo (NuevaOrdenCompra.tsx:328); el descuento sí muestra su equivalente y anular dice qué pasa antes de confirmar |
| 7 Perdonar antes que preguntar | 8 | [Medido] solo se confirma anular (irreversible), con su motivo; editar es libre mientras está generada; «¿Salir sin guardar?» y «Recargar» si otra persona cambió la orden |
| 8 Quitar antes de agregar | 7 | [Medido] el subtítulo de la ventana repite proveedor y destino, que están justo debajo |
| 9 De punta a punta | 5 | [Medido] el reintento que confirma lo que no se guardó (ver abajo); «Llega a» de fábrica con ✓; al guardar se pierde el filtro elegido; vacíos, errores y celular sí están |
| **Leyes (promedio)** | **6,7** | ninguna ley bajo 5; la 4 y la 9 en 5 |
| **Oficio visual** | **8** | [Medido] de lo propio fallan 2 cosas: el total tachado de una anulada (2,86:1, bajo 4,5) y la ✕ de quitar una línea (32 px, bajo los 44 del dedo a 375 px). Lo demás que el script marca es de piezas del sistema y no baja la nota (ver «Lista aparte») |

## Lo que no pediste y importa más: el reintento que confirma lo que no se guardó
**CONFIRMADO en el código** (escéptico, y revisado otra vez; no se reprodujo porque escribe). Gravedad 2 de `/chaos` (dato malo en silencio), sobre montos:
1. La pantalla crea el id de la orden una sola vez y lo reusa en cada intento (NuevaOrdenCompra.tsx:205), para que un doble clic no cree dos.
2. Si la señal se corta DESPUÉS de que la base guardó, la pantalla dice «No se guardó nada — revisa el internet y vuelve a intentar» (falso).
3. Si la persona corrige algo (cantidad, precio, destino) y vuelve a guardar, `crear_orden_compra` devuelve la orden ya guardada **tal cual, sin
   comparar** (supabase/migrations/20261010235000_ordenes_compra_editar.sql, rama «Doble clic o reintento»), y el aviso dice «OC-X guardada ·
   <total nuevo>», armado con el formulario. La base se queda con lo de antes.
4. Al editar, el mismo caso termina en «Otra persona cambió esta orden», aunque fue la misma persona: no pierde datos, pero el texto miente.

**Propuesta (toca una función de la base: decide Felipe):** `crear_orden_compra` compara lo pedido con lo guardado (las huellas que ya existen
para editar): si es lo mismo, devuelve la orden; si cambió, dice «Esta orden ya se guardó como OC-X con lo de antes: ábrela y corrígela ahí».
El corte de señal dice la verdad («puede que sí se haya guardado: vuelve a pulsar Guardar; si ya estaba, no se crea otra»). Al editar, si el
último cambio fue de la misma persona: «Tu cambio anterior sí se guardó. Recarga para ver cómo quedó». Con su prueba en
`pnpm pruebas:ordenes-compra`.

## Los 3 cambios de mayor impacto (esperan tu OK; presentación, no tocan plata, stock, permisos ni SUNAT)
1. **«Llega a» se revisa y se entiende.** Antes: viene con tu tienda y un ✓ verde sin tocarlo; «Por repartir» no dice qué es hasta elegirlo; la
   tarjeta dice «Llega a Lima» junto a «se reparte desde Lima». Después: «Llega a» pasa por la guía como «sugerido» y lleva ✓ solo cuando la
   persona elige (regla de ADR-0284, act. h); la lista abierta separa «Directo a la tienda» de «Llega a Lima para repartir» (`Opcion.grupo`,
   recupera el «(llega a Lima)» que aprobaste, ADR-0362:81); la tarjeta y la píldora dicen «Tienda Lima». **Leyes 1 y 4.** Va primero porque es lo
   único de la lista que puede dejar un dato mal guardado: la mercadería a otra tienda. Verifica: `[data-campo=destino]` sin ✓ al abrir, la
   prueba de `lib/orden-compra-alta.test.ts` y una ciega repetida. Esfuerzo S. Decide: Felipe.
2. **Al guardar, la orden se ve.** Antes: vuelve a la lista filtrada en tu sede (y pierde el filtro que tenías): la orden de otra tienda no está.
   Después: vuelve a la lista en la tienda de la orden, con la orden marcada, y el aviso dice a dónde llega. **Leyes 9 y 1.** Verifica: crear
   para Trujillo desde Lima y ver la fila marcada; editar desde «Todas las sedes». Esfuerzo S. Decide: Felipe (alternativa: abrir la orden guardada).
3. **La orden abierta se lee sola.** Antes: la nota es una barra gris sin rótulo; el subtítulo repite proveedor y destino; «Destino: Llega a
   Tienda Trujillo». Después: «Nota: …» como en el papel, sin subtítulo repetido y «Llega a: Tienda Trujillo». **Leyes 8 y 4.** Verifica:
   `medir-oficio` y la lectura de la ventana. Esfuerzo S. Decide: Felipe.

## Lo que sobra (ley 8)
- El subtítulo de la ventana de la orden: repite el proveedor y el destino que están justo debajo (se quita en el cambio 3).

## Lista aparte (no se ejecuta)
Propio de esta pantalla:
- El total tachado de una anulada (`text-tinta/45`, page.tsx:230) mide 2,86:1: subirlo a ≥ 4,5:1 sin perder el tachado.
- En el pie de la orden, «Editar» va último y es lo menos visible; es lo que más se busca después de imprimir.
- «Precio u.» en el formulario y en la orden, contra «Precio por unidad» en la tarjeta de celular.
- «Generada»: 1 de 2 dudó si significa «ya se le mandó al proveedor»; el sistema no registra el envío. Vocabulario para decidir.
- La ✕ de quitar una línea mide 32 px: a 375 px con dedo pide 44.
- `page.tsx:72→73→78`: tres lecturas en serie; la tercera depende de las dos primeras. Candidata, no defecto.
Piezas del sistema (se deciden para todo el ERP, no aquí):
- «Cancelar» junto a «Anular orden»: en el Perú «cancelar un pedido» es anularlo. «Cancelar» es la pareja estándar de toda hoja.
- «trae» / «la trae…» (marca y proveedor): vocabulario de Marcas y Nuevo producto; el texto es cierto. 1 de 2 no lo entendió.
- Lo «sugerido» sale bajo «Faltan» y con «Sigue aquí» antes que lo obligatorio (`FaltanDelPaso`, `siguienteDe`).
- `Boton` mide 43,75 px y `BotonEnlace` 40 en la misma fila (`campos.tsx:971`, el `<span class="relative">` queda como bloque).
- El botón del calendario de `CampoFecha` mide 20×20 (bajo 24); las fichas de «Falta» 28,8 px.
- A 375 px, la caja estándar (40 px), «Nueva orden de compra» (40) y el buscador (38) quedan bajo los 44 del dedo.
- `scripts/rendimiento/ui.mjs` no imprime nada cuando la ruta del repo tiene un espacio (compara `import.meta.url` con `argv`).

## Refutados
- A7 · el «%» elegido del descuento: 15,36:1 sobre su pulgar oscuro; el 1,07 era medirlo sin el pulgar.
- B8 y C3 · «Guardar cambios» que abría la lista de «Llega a» (7 veces), el calendario que no abría, la fila que abría el menú: **entorno**. El
  tamaño de la ventana de prueba se borró a mitad de la prueba y siguió tocando con coordenadas viejas; por su referencia, un solo clic guardó
  («ya decía eso») y la versión no cambió.
- C5 · «Sigue aquí» sobre el motivo de anular: lo leyó como «escribe aquí ahora», que es justo lo que significa.
- C9 · el texto «<script>…» de una descripción: dato de prueba hostil, se muestra como texto y no se ejecuta.
- C10 y la nota «Cambio de otra persona»: datos que dejó una prueba anterior con la cuenta de Felipe.

## Prueba ciega
Las dos corrieron en una pestaña en segundo plano: ahí el navegador no anima, no termina de mostrar lo que llega por partes y muchos clics no
llegan (el teclado sí). Lo que solo se explica por eso se separó como **entorno** y no cuenta contra la pantalla.

| Prueba | Lectura de 5 s | Primer intento | Pasos | Dudas | Palabras no entendidas | Errores evitables |
|---|---|---|---|---|---|---|
| 1 · «Haz un pedido de 30 chompas CAYLA a S/ 42 a Textiles Andina para Trujillo; encuéntralo y di el total» | Correcta («la lista de los pedidos a los proveedores; el botón negro arma uno») | Sí: OC-000352, S/ 1,260.00, correcta | 38 (mínimo ~12; los de más, casi todos del entorno) | 11 | «trae», «Por repartir», «Generada» | 0 datos mal; 15 toques que no respondieron (entorno) |
| 2 · «Corrige la OC-000130 de 18 a 20 vestidos y cancela la OC-000029: el proveedor no tenía la tela» | Correcta («para corregir uno quito el filtro “Lima” y abro su fila») | Corregir: no (entorno: 8 «Guardar cambios»; con el teclado guardó al primer intento) · Anular: sí, 5 toques | 60 (mínimo 11) | 13 | «Por repartir», «Llega a Lima» (la tarjeta) | 0 datos mal (verificado en la base); 24 toques perdidos (entorno) |

Dudas textuales que se repiten en las dos: **«Lima 2» marcado y mi pedido no está: ¿se guardó?** (1 y 9 en la primera; 1 y 13 en la segunda) y
**«Por repartir»: ¿qué se reparte y a quién?** (las dos).

## Antes de decir «listo»
- **Concurrencia:** dos personas editan la misma orden: la segunda recibe «Otra persona cambió esta orden mientras la editabas» con «Recargar», y
  no se escribe nada (`PT409`, ADR-0193; casos E de `pnpm pruebas:ordenes-compra`). Un doble clic con lo mismo no choca: la base devuelve la orden
  como está. Dos órdenes creadas a la vez toman números seguidos y se avisa del número que tocó. Anular dos veces con el mismo motivo no repite nada.
- **Caída externa:** si la lista no responde, la pantalla lo dice («No se pudieron leer las órdenes de compra») y, si el resumen falla, las
  píldoras salen sin número. **Falla un caso:** si la señal se corta después de que la base guardó, hoy la pantalla dice «No se guardó nada», y un
  reintento con cambios confirma un total que no se guardó (ver arriba).
- **Persona sin contexto:** dos ciegas ✓ (agentes) · colaboradora real: sin probar.

## Después del OK (2026-10-10, la misma tarde)
Felipe aprobó arreglar primero el reintento y después los 3 cambios, con «la lista con la orden marcada» para el cambio 2. Hechos y medidos en
el banco (`oc.localhost:3027`):
- **El reintento ya no miente: hecho.** `crear_orden_compra` compara lo pedido con lo guardado (`fn_orden_compra_exigir_mismo_pedido`, con las
  huellas de editar): igual devuelve la orden, distinto avisa «Esta orden ya se guardó como OC-… con lo que tenía antes de tu cambio» y no
  cambia nada; la pantalla ofrece «Corregirla». El corte de señal dice «no sabemos si llegó… vuelve a pulsar sin cambiar nada» (crear, editar
  y anular, `avisoDeCorte`). El choque al editar dice qué pasó (anulada / tu cambio anterior / otra persona). [Medido] `pnpm
  pruebas:ordenes-compra` 40/40, y las dos pruebas nuevas (CR2b, E2b) **fallaban con la versión anterior**. No se simuló el corte en el
  navegador: el cliente de la base guarda la conexión con la que nació y cortarla pide un proxy; lo cubren la prueba de la base y la del
  aviso.
- **Cambio 1, «Llega a» se revisa y se entiende: hecho.** [Medido] al abrir, `[data-campo=destino]` está en «falta» (no ✓) y el pie dice
  «Faltan: Proveedor · Llega a · …»; al elegir (aunque sea la misma tienda) pasa a ✓. La lista abierta dice «DIRECTO A LA TIENDA» (Tienda
  Lima, Tienda Trujillo) y «LLEGA A LIMA PARA REPARTIR» (Por repartir). La tarjeta dice «Llega a Tienda Lima» y las píldoras el nombre
  completo (en producción: «Tienda LIM / TRU / AQP»).
- **Cambio 2, al guardar la orden se ve: hecho.** [Medido] crear una orden para Trujillo desde Lima volvió a
  `/compras/ordenes?destino=<Trujillo>&recien=<id>` con la OC-000465 arriba y marcada «Recién guardada»; editar la OC-000130 sin cambios
  volvió igual, con ella marcada (4.ª fila). La marca le gana al rayado de la tabla en las filas pares (se vio y se corrigió en la medición).
  «Recién guardada» se lee a 5,93:1 en claro y 7,74:1 en oscuro.
- **Cambio 3, la orden abierta se lee sola: hecho.** [Medido] la ventana dice «OC-000130» sin subtítulo, «Llega a: Tienda Trujillo» y «Nota:
  Cambio de otra persona»; la página completa dice qué es («Lo que se le pidió a un proveedor.») y el papel, «LLEGA A: Tienda TRU».
- Verificado además: `tsc` y eslint limpios; vitest completo (395 archivos); `pnpm focus` (guía aplicada en nueva/editar y la hoja de anular)
  y `pnpm sugerir` (0 ejemplos por revisar).

**Notas después [Opinión, sin nueva ciega]:** ley 1 → 7 (lo que hizo dudar a las dos pruebas ya no pasa, falta repetir la ciega); ley 4 → 6
(quedan «Generada», «trae» y «Cancelar», que son vocabulario para decidir); ley 6 → 7; ley 8 → 8; ley 9 → 7. Promedio **7,3 (provisional)**.
Oficio sigue en **8** (lo propio que falla, igual: el total tachado de una anulada y la ✕ a 375 px).

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-10 (antes) | d955d4b2 | 6,7 | 8 | — (el reintento y los 3 cambios esperan tu OK) |
| 2026-10-10 (después) | — | 7,3 (provisional) | 8 | el reintento (CR2b, E2b) y los 3 cambios, medidos en el banco [Medido]; falta repetir la ciega |
