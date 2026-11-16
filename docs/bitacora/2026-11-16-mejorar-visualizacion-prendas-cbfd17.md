## 2026-11-16 (Una foto que no se puede abrir ya no deja una tarjeta rota en inglés)
Qué hice: toda foto de prenda que se elige o se suelta (Nuevo producto, Recibir, Editar producto, la hoja de «Catálogo con IA» y el
laboratorio) pasa por UNA puerta (`lib/foto-elegida-cliente.ts`): se lee y se abre apenas llega, queda copiada en memoria, y la que no abre se
dice en palabras de tienda («Está en Google Drive o iCloud sin descargar. Ábrela una vez en tu Mac y súbela de nuevo.»: casi siempre es eso, medido con una foto de Google Drive que ocupaba 0 bytes en el disco), sin tarjeta rota. La tarjeta nace en el
mismo clic, «Abriendo la foto…», y cuenta como pendiente: «Listo» y «Crear producto» la esperan. Las fotos HEIC del iPhone que el navegador
abre se pasan a JPG achicadas (lado de 4000 px, la compresión de campañas y tiendas). `motivoDeFalla` ya no deja pasar el texto de un error del
navegador. A Sentry va qué falló, el tipo y el peso, nunca el nombre del archivo.
Por qué así: el «Chaleco Dad» mostró «An error occured reading the Blob argument to createImageBitmap»: Safari no pudo LEER el archivo
(arrastrado desde un lugar pasajero: Fotos, WhatsApp, una captura sin guardar, iCloud). Solo se miraba lo que el archivo decía ser. Una
revisión con 4 revisores y escépticos (42 agentes) encontró que, sin tarjeta mientras se abría, apretar «Listo» perdía la foto en silencio, y
que una HEIC de 24 MP se habría rechazado por pesada: los dos quedaron arreglados.
Felipe se lleva: `lib/foto-elegida-reglas.test.ts` descubre solo todo archivo que recibe archivos y falla si uno nuevo no está decidido
(foto de prenda → por la puerta; otra subida → aparte, con su motivo). La fase 2 (el pantalón que la IA dibuja como buzo) está en
`docs/backlog/2026-11-16-mejorar-visualizacion-prendas-cbfd17.md`.

## 2026-11-16 (Encender «Catálogo con IA» con fotos ya subidas las prepara, sin quitarlas)
Qué hice: al encender «Catálogo con IA» en Nuevo producto o en Recibir ▸ «Crear la prenda que llegó», las fotos que ya estaban (en su color o
esperando una respuesta) se preparan solas, cada una en su tarjeta con «Arreglando la foto con IA…». La regla de cuáles es una sola
(`fotosParaLaIAAlEncender`): no se paga dos veces la misma (ni la que ya tiene su versión de IA, ni la que ya se está preparando), y «Crear
producto» espera a que terminen. Una foto que termina de abrirse o de leerse sigue lo que dice HOY el interruptor, y una versión de IA ya
llegada no se borra al terminar de leer los colores.
Por qué así: Felipe tenía que quitar y volver a subir cada foto (y un compañero creía que el error de la foto era por tener la IA apagada:
la captura con la IA encendida mostró que no, era el archivo). Apagar la IA no deshace lo ya preparado: se elige foto por foto con «Usar mi foto».
Felipe se lleva: Editar producto no cambió (sus fotos ya están subidas y tienen su propio «Usar la de IA»). Tres rondas de revisión con
escépticos (48 agentes) dejaron: solo se prepara la de frente de cada color (la espalda no se paga); las que esperan su color vuelven a pasar
por la IA y se les leen de nuevo los colores sobre la foto limpia (salvo la que se está contestando en una hoja o ya tiene su respuesta); UN
aviso por tanda dice cuántas y cuáles fallaron, con «Volver a intentar» que repite solo lo que falta sin tocar el interruptor; apagar a
mitad deja tu foto a la vista; mientras se crea no se pide ninguna IA; una foto quitada no vuelve; y «Crear» sube el par aunque la IA llegue
mientras espera. Queda un caso raro sin cubrir: una foto ya contestada y en la cola justo en el instante de encender se asienta sin IA
(se arregla volviendo a encender). La foto del Enterizo que «no se pudo abrir» estaba en Google Drive sin descargar (`dataless`, 0 bytes en
el disco): ningún navegador puede leerla; abrirla una vez en el Mac la baja.
