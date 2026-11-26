## 2026-11-26 (En Crear cuenta, la casilla de aceptar y Google van al final)
Qué hice: Felipe vio la casilla de aceptar arriba de todo en Crear cuenta y pidió bajarla; eligió llevar también Google abajo, como en Entrar. Ahora el orden es correo, nombre, contraseña, la casilla, «Crear mi cuenta», la raya «o» y «Crear mi cuenta con Google» (`components/cuenta/FormularioRegistro.tsx`).
Por qué así: Google se va de la página apenas se toca, así que la casilla tiene que estar antes que su botón; con Google al final, la casilla queda junto a los dos botones y se lee al terminar. Google sigue sin ir sin la casilla: avisa y lleva el cursor a ella.
Felipe se lleva: verlo en producción tras fusionar.
