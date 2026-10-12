## 2026-10-12 (Un PR con SQL ya no se fusiona sin que producción lo tenga — ADR-0251, act. 2026-10-12)
Qué hice: el check obligatorio «SQL pegado» ya no le cree a la casilla. Cuando un PR marca «SQL pegado en producción», el CI aplica cada
migración del PR sobre la base de main y anota qué deja en la base; el check le pide a producción lo mismo y compara archivo por archivo. Si
falta algo, sale rojo nombrando el archivo, y como el check es obligatorio, ni se fusiona ni Vercel publica esa web.
Por qué así: el despliegue de #970 falló en Vercel (GitHub no respondió a tiempo, nada del código) y, al relanzarlo, hubo que confirmar a mano
que las 6 migraciones de #973 estaban en producción. La única red era la revisión diaria, y lleva en rojo desde el 2026-10-03 porque producción
va casi siempre adelantada a main: un aviso que está rojo todos los días ya no avisa. Mirar solo lo que el PR cambia evita ese ruido.
Felipe se lleva: el flujo no cambia (pegas, marcas la casilla, fusionas); si marcas antes de pegar, el check queda rojo diciendo qué archivo
falta y se vuelve a correr con «Re-run». Queda por decidir qué hacer con la revisión diaria que siempre está en rojo (backlog).
