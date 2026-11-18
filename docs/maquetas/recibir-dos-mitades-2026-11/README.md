# Maqueta · Recibir mercadería en dos mitades (2026-11-11)

Felipe, mirando las tres direcciones de `recibir-ordenada-2026-11`: «se ve todo muy apretujado». Pidió una maqueta nueva donde **solo haya las
categorías y el contador, del mismo tamaño**, y que **las tallas y los colores se abran en un modal** con espacio; que contemple la mayoría de las
casuísticas que pueden causar las colaboradoras, que se entienda al instante y que nadie tenga que buscar media hora una opción.

Abrir `index.html` desde un servidor local: `http://localhost:3031/recibir-dos-mitades-2026-11/` (configuración `maqueta-referentes` de
`.claude/launch.json`). Sin build. **No guarda nada**: los datos son inventados. Usa el CSS compilado real del ERP, sus fuentes y el marco
capturado que viven en `../recibir-ordenada-2026-11/` (no se duplican: 2,4 MB), así que las dos carpetas van juntas.

**La píldora «Maqueta»** (arriba al centro; se abre al tocarla): la vista (Contar · Revisa y cierra · Cerrado), **16 casos para probar**, Propuesta /
Hoy (la captura de producción), el menú lateral plegado o abierto, y «Por qué así» (las técnicas y los casos, dentro de la pantalla).
Por URL: `?caso=<id>`, `?hoja=tallas`, `?vista=cerrar|cerrado`, `?tema=oscuro`, `?menu=abierto`, `?movimiento=quieto`.

## Cómo está ordenada

Dos mitades iguales con **el mismo esqueleto**: cabeza (qué es), cuerpo que corre (lo que haces) y pie (lo que sigue).

| | Mitad izquierda · Categorías | Mitad derecha · Contador |
|---|---|---|
| **Cabeza** | Cómo va todo el envío: la barra gruesa y «10 de 27 prendas contadas · faltan 3 modelos»; el buscador y, a su lado, el botón **«Filtros»**: los cinco filtros con su número se abren solo al tocarlo, y el que está puesto queda dicho en una línea («Viendo solo: Por contar ✕ · 3 de 4 modelos») | La prenda: foto, nombre, y tres datos (está en el catálogo o es nueva · cuántas dijeron · costo); «Guardado» y «Más» |
| **Cuerpo** | Cada categoría con su barra; cada modelo en una fila con UN chip de estado; «Agregar otro modelo de Tops»; al final, «Llegó algo que no está en la lista» | **1 · ¿Cuántas llegaron?** el Dial y «Llegaron las N» grande. **2 · Tallas y colores**: una tarjeta que dice cómo va y un botón que abre la hoja; con todo repartido, su botón oscuro es **«Llevar al stock ahora»**. **¿Pasó algo con esta prenda?** tres botones con palabra |
| **Pie** | Quién cuenta, la «i» del envío, y **Revisar y cerrar** (si falta algo, dice qué y te lleva). Es el único «Revisar y cerrar» de la pantalla | Anterior · «Después: …» · **Listo, siguiente**. Solo habla de la prenda: en el último modelo lleva al que quedó pendiente («Falta contar: Top Quoy · Ir al que falta»); aquí no se cierra |

**La hoja «Tallas y colores»** (880 px): la tabla con casillas de 44 px, el total de cada color y de cada talla, «7 de 10 · faltan 3» siempre arriba,
«Poner las 3 que faltan en Blanco · M» para no sacar la cuenta, «+ Color» y «+ Talla» con lo que ofrece la carta, las dañadas con qué se hace con
ellas, y flechas / Enter para moverse entre casillas. Al pie: «Cancelar», «Solo guardar» y **«Guardar y llevar N al stock»** (el botón oscuro).

**Ajustes de Felipe al verla (2026-11-11, noche):**

- «El buscador está muy largo y los filtros de abajo son muchos»: los filtros se condensaron en un botón al lado del buscador y se muestran solo cuando se piden.
- «El botón de "Llevar ya a stock" debe estar más visible»: casi siempre llevan la prenda al stock desde el conteo para venderla ya. Dejó de vivir en
  «Más»: es el botón principal al terminar de repartir, se puede llevar una parte («Llevar 7 al stock ya») y la hoja de tallas guarda y lleva en un paso.
  Sigue pasando por su hoja de confirmación (costo, de quién es, quién lo lleva), que viene contestada.
- «Es redundante esos botones de revisar y cerrar»: había uno en cada mitad al llegar al último modelo. Quedó uno solo, en el pie de la lista (la mitad
  del envío), siempre en el mismo lugar; en el celular lo trae la isla de abajo cuando ya está todo contado.

## Las técnicas (por qué se entiende)

1. **Mismo esqueleto en las dos mitades**: se aprende una y ya se sabe la otra.
2. **Una sola acción principal por mitad** (ley de Hick): en cada momento hay UN botón oscuro —«Repartir ahora», «Llevar al stock ahora», «Listo, siguiente» o «Revisar y cerrar»—.
3. **Cada acción vive en un solo lugar**: «Revisar y cerrar» está solo en el pie de la lista; el pie del contador solo habla de la prenda. Dos botones iguales hacen dudar cuál toca.
4. **Lo que más se toca es lo más grande y está más cerca** (ley de Fitts): «Llegaron las N» mide 56 px y está al lado del número; + y − son de 48 px.
5. **Revelar de a poco**: las tallas viven en la hoja y los filtros en un botón al lado del buscador; lo raro (corregir lo que entró al stock, quitar un modelo) vive en «Más».
6. **Lo que más se hace, a un toque**: llevar al stock desde el conteo es el botón principal al terminar de repartir, y la hoja que confirma viene contestada.
7. **El estado siempre a la vista**: arriba de la lista, en cada fila (un solo chip) y arriba de la hoja mientras se escribe.
8. **El color solo dice el estado**: verde listo · ámbar mira esto · gris azulado para después · negro lo que toca.
9. **Botones con palabras** (reconocer, no recordar): «Agregar otro modelo de Tops», «Llegó dañada», «Es otra prenda», «Anotar algo».
10. **Perdonar antes que preguntar**: lo que borra o pisa trae «Deshacer» 7 segundos; solo se pregunta lo irreversible.
11. **Prevenir el error típico**: un número muy por encima de lo que dijeron se pregunta; repartir de más se dice y se ofrece la salida.
12. **Valores de fábrica**: prenda del catálogo → «repartir ahora»; prenda nueva → «para después». El ejemplo del nombre sigue a la categoría (ADR-0290).
13. **Vacíos que dicen qué hacer**: un filtro sin resultados explica por qué y trae «Ver todos los modelos».
14. **«Sigue aquí»** (ADR-0284): un solo lugar encendido a la vez —el modelo que sigue, el paso que toca, el campo que falta—.

## Las casuísticas (cada una se abre desde «Casos para probar»)

| Qué hace la colaboradora | Qué responde la pantalla | Caso |
|---|---|---|
| Abre un envío y no sabe por dónde empezar | El primer modelo ya está abierto, el paso 1 dice «Sigue aquí» y la pista explica los dos caminos (botón verde o escribir) | `abierto` |
| Llegaron menos de las que dijeron | Chip «Faltan 2», el aro en ámbar, y «al cerrar dices qué pasó» | `faltan` |
| Llegaron más | «Sobran 2: entran igual y Compras lo ve» | `sobran` |
| No llegó ninguna | «No llegó», con «Deshacer»; el paso 2 se apaga: no hay nada que repartir | `nollego` |
| Escribe 40 donde dijeron 4 (o 100 por 10) | «¿Seguro que llegaron 40? Dijeron 4» → «Sí, son 40» o «Corregir». No se da por bueno ni deja cerrar hasta contestar | `raro` |
| Toca «Poner en cero» o «Llegaron las N» sin querer | Aviso con «Deshacer» | cualquiera |
| Reparte a medias y se tiene que ir | «Solo guardar»: queda como «Faltan tallas» y se retoma con «Seguir repartiendo» | `medias` |
| Repartió una parte y quiere ir vendiendo esas | «Guardar y llevar 7 al stock» en la hoja, o «Llevar 7 al stock ya» en la tarjeta; las otras 3 se reparten después | `medias` |
| Terminó de repartir y quiere venderlas hoy | «Llevar al stock ahora» es el botón oscuro del contador; la hoja confirma costo, de quién es y quién lo lleva (ya contestados). Después: «Las 10 ya están en el stock», con «Imprimir 10 etiquetas» y «Bajar al piso» | `llevar` |
| Quiere ver qué le falta llevar al stock | Filtro «Por llevar al stock» (dentro de «Filtros») | `llevar` |
| Reparte más de lo que contó | «Repartiste 12 y contaste 10» → bajar una cantidad, o «Sí, llegaron 12» (sube lo contado) | `demas` |
| No quiere sacar la cuenta de lo que falta | «Poner las 3 que faltan en Blanco · M» | `medias` + hoja |
| Llegó un color o una talla que la prenda no tenía | «+ Color» / «+ Talla» con lo que ofrece la carta; «¿No está?» dice quién lo habilita | hoja |
| Quita un color o una talla que ya tenía cantidades, o vacía la tabla | Aviso con «Deshacer» | hoja |
| Cierra la hoja sin guardar | «¿Salir sin guardar?» (solo si cambió algo) | hoja |
| Llegó algo dañado | «Llegó dañada»: cuántas y qué se hace (se devuelve · se arregla · se da de baja). Siguen contando como llegadas | `danado` |
| Dijeron una prenda y llegó otra | «Es otra prenda»: la busca en el catálogo o dice que es nueva; lo contado no se pierde | cualquiera |
| Quiere avisar algo a Compras | «Anotar algo»: lo más común en un toque, o con sus palabras | cualquiera |
| Llegó algo que no está en la lista | «Llegó algo que no está en la lista»: categoría, nombre (o «Top 1» provisional) y cuántas; avisa si se parece a algo del catálogo | `agregado` |
| Agregó un modelo por error | «Quitar este modelo» en «Más», con «Deshacer» | `agregado` |
| No sabe el nombre de una prenda nueva | Queda «Top 1» con «Ponle nombre»; no deja cerrar hasta ponérselo | `agregado` |
| Es una prenda nueva y la tiene a la mano | «Crear la prenda»: nombre, precio, tallas y colores que llegaron; pasa directo a repartir | `abierto` → Top Quoy |
| Una parte ya entró al stock | «4 ya entraron al stock: lo contado no baja de ahí» (el − se apaga en 4) | `stock` |
| Se cae el internet | Franja «Sin conexión: sigue contando… (2 por enviar)» y «Por enviar» en la prenda; al volver, «Se enviaron los 2 conteos» | `offline` |
| Otra persona contó el mismo modelo | «Lucía también contó este modelo: puso 5. Ahora quedó lo tuyo: 7» → dejar el suyo o el de ella | `otra` |
| Quiere cerrar y falta algo | «Revisar y cerrar» (uno solo, en el pie de la lista) abre lo que falta, tocable; «Revisar igual» si de verdad no llegó | cualquiera |
| Llega al último modelo y le quedaron otros sin contar | El pie del contador dice «Falta contar: Top Quoy» y su botón es «Ir al que falta» | `abierto` → último modelo |
| Todo contado | «Revisar y cerrar» pasa a ser el único botón oscuro de la lista y se enciende una vez; «Listo, siguiente» queda claro. En el celular lo trae la isla de abajo | `todo` |
| Un envío de 36 modelos | Categorías plegadas salvo la del modelo abierto, buscador por modelo o categoría (sin tildes), el botón «Filtros» con sus números, «Sigue» en la fila que toca | `grande` |
| Busca o filtra y no hay nada | Vacío con el motivo y «Ver todos los modelos» | cualquiera |
| Nadie lo despachó desde el sistema | Sin «dijeron», sin «Con diferencia»; el Dial dice «escribe cuántas» | `sinaviso` |
| No llegó nada del envío | En la «i»: «No llegó nada: cancelar», con confirmación (es lo único irreversible) | cualquiera |
| Cambia de turno a medio conteo | «Cuenta Felipe ▾» en el pie de la lista; la «i» recuerda que se guarda solo y se puede seguir después | cualquiera |

## Lo que hay que decidir antes de pasarla a local

1. **El aviso del número raro**: el umbral de la maqueta es «más del doble de lo que dijeron, o 10 más». Es regla de negocio.
2. **Guardar tallas a medias** desde la hoja (hoy la tabla guarda sola, casilla por casilla; aquí la hoja tiene «Guardar» y «Cancelar»).
3. **«Es otra prenda»** y **«Llegó dañada»** a la vista (hoy están en «Cambiar de prenda» y en «¿Llegó algo dañado?» dentro de la tabla).
4. **Crear la prenda desde aquí** con cuatro datos (nombre, precio, tallas, colores); la foto y lo demás, en Catálogo.
5. **El conflicto entre dos personas**: hoy gana el último con aviso; aquí se ofrece volver al valor de la otra persona.
6. El paso 2 contestado por tipo (ya aprobado el 2026-11-11) y la guía de foco / guía interactiva, que se reescriben.
7. **«Llevar al stock ahora» como botón principal** al terminar de repartir, y poder llevar una parte desde la hoja de tallas. Es el mismo flujo de hoy
   (ADR-0393: entra al almacén, el envío sigue abierto, se vende cuando se baja al piso); cambia dónde está y cuánto pesa. Es stock: lo confirma Felipe.

## Si se pasa a local

Sin migración ni RPC nuevas para lo principal (todo sale de `fn_envio_conteos` y se guarda con `guardar_conteo_envio`). `ResumenDelEnvio` y `TiposDelEnvio`
se van de Contar; `TallasDeLaPlaca` pasa a una `<Modal tamano>` con ancho propio; `LlevarAlStock` se queda como está y solo cambia desde dónde se abre; lo demás es `ContarEnvio`, `PlacaDelModelo`, `CategoriasAcordeon` y
`vidrio/recibir-mesa.css`. El aviso del número raro y el «Deshacer» del conteo son de la web. Los `rd-*` de `dos.css` son el CSS que iría ahí.

## Lo que no cubre

La puerta `/recibir`, reabrir un envío, las fotos de la guía, la carta completa de colores y el alta completa de un producto (avisan, no se abren).
