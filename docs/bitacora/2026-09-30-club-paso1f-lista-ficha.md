## 2026-09-30 (Club de clientas, tanda 1f: la lista y la ficha de /clientas como el spike)

Qué hice: la lista de Clientas ahora la arma la base sobre todas las fichas (`fn_clientas_lista`, `fn_cifras_clientas`): su
sede (donde más compró en 12 meses; empate, la de su compra más reciente), última compra y frecuente con compra neta (una venta
devuelta entera no cuenta, un cambio sí). La pantalla quedó como el spike: Exportar, «Más» y «+ Nueva clienta» en una fila
(también a 375 px), cuatro cifras con Frecuentes, buscador que busca al escribir, píldoras con Archivadas, seis columnas con Su
sede y Última compra, y «Pidió BAJA». La ficha suma «Su sede · N de M», las preferencias (Ocasión, Estilo, Evita) y la historia
del permiso. Migración `20260930210000` (una parte) y `pnpm pruebas:club-lista-y-ficha` (47 casos). Ya junta con la 1b final (camino B):
la ficha quedó en el orden del spike y la historia dice «ella misma» cuando confirmó en la página de su QR.

Por qué así: una regla en un solo lugar (qué compra cuenta, su sede, frecuente) que leen la lista, las cifras y la ficha; el
umbral de frecuente lo vigila una prueba contra `lib/clienta-actividad-reglas.ts`. Las preferencias son solo de una socia y un
disparador las borra al anonimizar o unir, sin reescribir las funciones que la 1b todavía cambia.

Felipe se lleva: los valores de las preferencias son de trabajo (los del spike); cambiarlos es apagar uno y agregar otro. Pegar
la migración después de la 1b y fusionar la web después. Capturas lado a lado con el spike en
`docs/capturas/2026-09-30-club-paso1f/`.
