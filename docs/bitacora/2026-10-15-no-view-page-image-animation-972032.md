## 2026-10-15 (Aventurero: el gato del meme en «Sin acceso» y en las pantallas de error)
Qué hice: puse la foto de Aventurero, el gato con las patas en el teclado, arriba de la tarjeta de «Sin acceso» y de las cuatro
barreras de error (la de la app, la de una vista de Facturación y la global), con su texto en letra de meme: «Aventurero decidió que no
puedes ver esto» y «Aventurero lo está dando todo para solucionarlo». Las patas se mueven: en un error teclea apurado; en «Sin acceso» da
dos toques y un Enter decidido. «Sin acceso» de una cuenta que no ve ninguna pantalla ahora lo dice así y su botón es «Ya me lo activaron»
(antes ofrecía «Volver al inicio», y el Inicio la devolvía a la misma pantalla).
Por qué así: el meme acompaña, no reemplaza: lo que hay que hacer (reintentar, a quién pedir el acceso, el código del error) sigue
escrito igual debajo. Las patas son la misma foto recortada por una elipse fija y girada unos grados desde el codo, así el teclado no se
deforma; es una excepción a la regla de movimiento pedida por Felipe (ADR-0136 act. 2026-10-15) y se queda quieto con movimiento reducido.
Felipe se lleva: `components/ui/Aventurero.tsx` y `app/estilos/aventurero.css`, probado en local en claro, oscuro y 375 px; y un
pendiente que el meme destapa: «lo está dando todo» promete que alguien se entera, y hoy nadie recibe un aviso cuando una pantalla se cae.

## 2026-10-15 (Un error de pantalla avisa solo: Sentry, como Dynamic)
Qué hice: conecté el ERP a Sentry (proyecto «cayla-retail» en la misma cuenta que Dynamic): avisan los errores del servidor, los del
navegador y los que no pueden perderse (`capturarError`: Lucode, SUNAT, las tareas programadas). La tarjeta de error ahora dice que a
Felipe le llega el aviso. Lo probé contra un Sentry de mentira en local, provocando cuatro errores, y la prueba encontró que el SDK mandaba la
cookie de sesión de Supabase aunque se le pedía no mandar datos personales: la limpieza pasó a lista blanca y la repetición salió sin fugas.
Por qué así: Felipe eligió Sentry sobre un registro propio porque le escribe un correo apenas aparece un error nuevo, con la línea exacta.
Importado de entrada sumaba 57,6 KB a cada pantalla; ahora se descarga cuando la pantalla ya está lista y cada pantalla suma 2,5 KB.
Felipe se lleva: ADR-0424, con los tres pasos para encenderlo (crear el proyecto, dos variables en Vercel, publicar). Hasta entonces la web
funciona igual que antes.


## 2026-10-15 (Sentry: los mapas del código llegan al armado)
Qué hice: publiqué a mano en producción la fusión de #1115 (a Vercel no le llegó el aviso) y vi que Sentry quedó encendido pero sin mapas: el
armado corre con Turborepo, que no dejaba pasar `SENTRY_AUTH_TOKEN`. Lo declaré en `passThroughEnv` de `build` en `turbo.json`.
Por qué así: `passThroughEnv` le da la llave al armado sin meterla en la huella de la caché; comprobado con el ensayo de Turborepo.
Felipe se lleva: después de fusionar, el log del armado tiene que decir que subió los mapas; desde ahí, cada aviso de Sentry trae la línea exacta.

## 2026-10-15 (Aventurero ocupa la pantalla: foto y mensaje crecen con la ventana)
Qué hice: la tarjeta de «Sin acceso» y de los errores dejó de ser una columna de 448 px en medio de un espacio vacío. En un monitor alto, la
foto y el mensaje van apilados con un mismo ancho, el mayor que cabe sin bajar del pliegue (1.054 px a 1920×1080); en un laptop bajo, van
lado a lado (la foto en 3/5, sobre un paño oscuro); en el celular, a todo el ancho. Pieza común: `PantallaAventurero`.
Por qué así: apilada, en una pantalla baja la foto quedaba angosta porque manda el alto (el error salía de 439 px a 1280×800); lado a lado
usa el ancho que sobra. Medido en seis tamaños, en claro y oscuro: ningún tamaño de escritorio baja del pliegue.
Felipe se lleva: la pantalla pide el ancho completo del <main>, declarado en `lib/ancho-completo.test.ts` por su pedido de que «ocupe todo el espacio».
