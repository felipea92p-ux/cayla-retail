## 2026-09-29 (Escanear en Vender ya no pide Enter: la lectura pasa sola al ticket)

Qué hice: la pistola de la tienda no remata con Enter, y Vender solo resolvía el código al recibir ese Enter: el
código se quedaba escrito esperando. Ahora Vender reconoce la lectura por su RITMO (`lib/lectura-pistola.ts`): una
persona separa cada tecla por 100–250 ms y una pistola por menos de 30. Si lo último que entró al campo fueron 8 o
más teclas seguidas con menos de 50 ms entre una y otra, sin espacios, y el campo lleva 150 ms quieto, esa ráfaga es
una lectura y se resuelve como su Enter: entra al ticket si hay en el piso; si no hay, avisa por qué; si no es de
ninguna prenda, dice «No encontramos «X»»; en los tres casos el campo queda vacío.

Por qué así: no se puede pedir que cada sede reprograme su pistola, y esperar un Enter que no llega deja el código
escrito para siempre. El ritmo mide lo que sí distingue a una pistola de una persona; se mide con la hora de cada
tecla (`timeStamp` del evento), no con lo que tarde el navegador en pintar, y solo cuenta la ráfaga: lo que la persona
hubiera dejado escrito antes no se pega delante del código. Un texto pegado o completado de golpe, una frase con
espacios o una palabra corta tecleada rápido NO cuentan como lectura. Tecleado a mano no cambia nada: sigue el Enter y
la fila resaltada. Si la pistola SÍ manda Enter, el Enter resuelve primero y el temporizador se cancela (no entra dos
veces). Y un código leído por pistola con Enter ahora es «exacto o nada»: antes, uno que no era de ninguna prenda pero se
parecía a otra entraba con la fila resaltada de la lista.

Felipe se lleva: probar en tienda escaneando SIN tocar Enter: (1) prenda con stock → entra sola y el campo queda vacío,
(2) sin stock → aviso ámbar, no entra, campo vacío, (3) código ajeno → «No encontramos…», campo vacío; y teclear un
código a mano despacio: no debe entrar solo hasta dar Enter. No se verificó en el navegador (el inicio de sesión de
desarrollo no se pudo automatizar): lo cubren las pruebas de `lectura-pistola.test.ts` (ritmo de pistola y de persona,
texto previo, pegado). Si una pistola de otra sede es más lenta que 50 ms por tecla, se sube `MAX_MS_ENTRE_TECLAS`.
