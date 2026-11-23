# ADR-0690 — El barrido del piso: escanear lo colgado, entre varias, y corregir piso y almacén

**Fecha:** 2026-11-22/23 · **Estado:** aceptado por Felipe (la propuesta B, «que confirme todas las que pueden ver Existencias ya que la
idea es que todo sea ágil», «una al mes», y la lista de 10 actividades de `/construir`: «si, empiexas»).
Construye sobre ADR-0328 (Cuadrar el piso), ADR-0161/0306 (módulos), ADR-0162 (responsable), ADR-0542 (dos dueños en Tienda LIM).

## Contexto

En Trujillo, en hora punta, se bajan prendas del almacén al piso sin registrarlo. El total de la tienda está bien; lo que está mal es
**dónde**: el sistema cuenta en el almacén prendas que cuelgan. Consecuencias: «Reponer» pide bajar lo que ya cuelga, Existencias miente y
Vender tiene que rescatar la prenda al cobrar. Cuadrar el piso (ADR-0328) ya corregía escaneando el **almacén**; Felipe pidió lo contrario,
que es más fácil en tienda: escanear lo **colgado**, cientos de prendas, entre varias personas, y que al final diga y corrija.

## Decisión

1. **Un barrido abierto por sede** (`retail.barridos_piso`, índice único parcial). Lo abre o se suma quien ve **Existencias** (no es un
   módulo nuevo: es una función de Existencias, ADR-0306). Una o varias personas, cada una con su celular, **sin zonas**: pueden entrar y
   salir a mitad; ellas saben de dónde es cada prenda por quién y a qué hora se escaneó.
2. **Cada lectura es una fila** (`barrido_piso_lecturas`: prenda, cantidad, quién, hora de la base y del aparato), con el id elegido en el
   aparato (subir dos veces no duplica). La cola vive en el celular (una clave por pantalla) y sube sola al volver la red. **Nada se borra**:
   quitar una lectura (repetida o un tramo entero) la anula con quién y cuándo, dos toques, solo mientras el barrido está abierto.
3. **Lo que no se puede escanear** (sin etiqueta o con un código que no existe) se aparta con foto (bucket privado `retail-barridos`) o
   nota, en `barrido_piso_hallazgos`, y la prenda va a la caja «Por etiquetar».
4. **Confirmar corrige en los dos sentidos**, con traslados internos (el total no cambia), todo o nada, firmado por el responsable. Por
   prenda, con unidades libres (P piso, A almacén, Ap apartado colgado, S escaneado vigente):
   `al_piso = min(max(0, S−P−Ap), A)` · `al_almacen = max(0, P−S)` · `no_cargadas = max(0, S−P−Ap−A)` (no se crean: quedan «por resolver»).
   No se toca: lo que se movió después de abrir el barrido (`se_movio`), lo archivado, la centinela y lo de prueba, y en Tienda LIM la
   línea cuya fila de origen tiene unidades de CAYLA y de CLAURE (`dos_duenos`: qué dueño se mueve lo decide una persona en Existencias).
   Exige marcar «se escaneó todo lo colgado», al menos una lectura vigente y la **huella** de lo que se revisó: si alguien escaneó o quitó
   algo mientras otra persona revisaba, se rechaza (`barrido_cambio`) y la hoja muestra la cuenta nueva.
5. **Un barrido confirmado es un cuadre** (`cuadres_piso.lado = 'piso'`, `barrido_id`): Frescura, el plan del piso y el historial ya lo
   entienden. **Solo el primer cuadre de cada sede reinicia los relojes** (demanda de Producción, arranque de Análisis y de los conteos):
   un barrido mensual no puede dejar a Producción con un mes de ventas (`fn_ultimo_cuadre_piso`, 20261122194000).
6. **«Por resolver»** (actividad 8): cada no cargada o apartado se cierra una vez, con quién y cuándo (`barrido_piso_resueltos`,
   append-only): «Ya está en el almacén» (se baja al piso), «La encontré» («Encontré prendas» y al piso; rechazada si viene en un traslado)
   o «No era de aquí» (no mueve nada). En Lima se elige el dueño.
7. **La entrada**: el botón «Barrido del piso» en Existencias, el aviso «Barrido en curso · N prendas» con «Sumarme», y «Toca el barrido
   del mes» a los 30 días del último.

## Alternativas descartadas

- **Zonas o áreas por persona**: Felipe lo descartó («puede ser confuso»); quién y a qué hora basta para saber de dónde es lo contado.
- **Tiempo real (Realtime)**: pediría políticas de lectura en las tablas; un sondeo cada 5 s alcanza para 5 personas.
- **Crear el stock de lo escaneado que no está en la tienda**: inventaría stock que el sistema tiene en otra sede o en camino. Se lista con
  dónde está y se resuelve a mano.
- **Elegir solo el dueño en confirmar** (Lima): una decisión de stock por dueño que no se toma a escondidas; la línea se deja quieta.

## Verificación

`scripts/pruebas/barrido_piso.mjs` (37), `barrido_piso_confirmar.mjs` (33: la cuenta, confirmar, candados, idempotencia, relojes, «Por
resolver» y las correcciones de la revisión adversarial), `barrido_piso_concurrencia.mjs` (5 personas a la vez, base desechable), y las de
los vecinos (`cuadrar_piso`, `eliminar_producto`, `fusionar_productos`, `capacidad_piso`, `conteo_firma_arranque`). En el navegador, en
escritorio y a 375 px: escanear con dos celulares, sin red, quitar tramos, apartar con foto, revisar, confirmar y «Por resolver».

## Cómo se pega

En este orden, cada una sola: `20261122190000` (tablas), `191000` (funciones), `193000` (confirmar), `192000` (bucket y sus dos políticas,
al final y sola, ADR-0195) — ya en producción el 2026-11-22 —; `194000` (relojes) y `194500` (correcciones) — 2026-11-23 —; y `195000`
(«Por resolver»), que enciende la sección de su pantalla (sin ella la web la esconde).
— y `196000` (historial), pegada el 2026-11-23.

## Actualización 2026-11-23 — Actividad 10: el barrido pensado para el celular

`/formidable` (≈ 6,3/10), una prueba a ciegas a 375 px y `/chaos` (unos 60 ataques, semilla 690) sobre la pantalla. `/chaos` no encontró ningún
estado imposible. Felipe aprobó los cuatro cambios de mayor impacto, todos de presentación (no cambian qué se mueve):

1. **En el celular, lo que se mira va arriba:** el campo y «Última que escaneaste» quedan en la primera pantalla (antes, a 645 y 1004 px).
   Las cifras pasan a una línea («Equipo 4 · Tú 4 · Todo guardado»), y «Quién escanea» pasa a «Escanea Felipe · Cambiar» una vez elegido. Las
   columnas de escritorio se disuelven bajo `lg` (`max-lg:contents` + `order`), así que el escritorio no cambia. El aviso de un código
   desconocido sale junto al campo, sobre los botones.
2. **Las repetidas y «la última» salen de la base** (`memoriaDeLaPersona`, `juntarMemoria`): de las lecturas de esa persona en el barrido,
   sin las quitadas. Antes vivían solo en la pestaña: al recargar, la misma etiqueta se sumaba sin preguntar.
3. **«Lo escaneado»:** el último tramo de quien tiene el celular sale primero y abierto, con un «Quitar» por prenda. «Quitar todo lo que
   escaneó de HH:MM a HH:MM» baja al pie del tramo (junto al nombre parecía un borrado de un toque).
4. **Textos de tienda:**
   - «Escanea todo lo colgado; quien llegue se suma desde su celular».
   - «Lo que escaneó Ana de 10:15 a 10:16».
   - «Se quedan como están», con el porqué detrás del «?».
   - La nota de admin, como chip de una línea.

De `/chaos`, dos cosas de pantalla, arregladas:
- El aviso de lo que llegó tarde tras confirmar nombra las prendas (`textoLlegaronTarde`).
- Un código de más de 120 letras se recorta al apartarlo (`CODIGO_MAX`); antes, «Apartar» fallaba con un mensaje que no decía por qué.

Lo que es de RPC espera a Felipe (backlog de la rama):
- acotar la hora del aparato;
- el «id reusado» bajo concurrencia;
- traducir la hora fuera de rango (22007);
- avisar cuando la misma persona escanea desde otro aparato.

