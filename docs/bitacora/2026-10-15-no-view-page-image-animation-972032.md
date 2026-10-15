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
