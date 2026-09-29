## 2026-09-29 (La pistola ya no rompe los códigos: el apóstrofo se lee como guion)

Qué hice: en Tienda TRU, al escanear una etiqueta, Vender escribía «CMS'0011'ROS'STD» en vez de
«CMS-0011-ROS-STD» y respondía «No encontramos…». La causa no es del ERP ni de la etiqueta: la pistola
se hace pasar por un teclado y manda la POSICIÓN de la tecla del guion de un teclado US; la Mac tiene
puesta la distribución en español, y en esa posición hay un apóstrofo. Letras y números coinciden en las
dos distribuciones, por eso solo se rompe el guion — justo lo que separa referencia, color y talla.
Ahora el ERP lee el apóstrofo como guion al comparar un código (`lib/escaner-guion.ts`), en cuatro
lugares: Vender/Apartados/Envío/Bajada/Proformas (`resolverCodigoV2` y la lista que se despliega),
Conteo (la lista bajo la caja de escanear y el alta al vuelo) y Existencias (`tallaPorCodigo`).

Por qué así: ningún código de CAYLA lleva un apóstrofo de verdad (letras, números y guiones; los de
fábrica, solo dígitos), así que cambiarlo no confunde una prenda con otra. Se aplica a lo escaneado Y a
lo guardado (simétrico), para que un nombre como «O'Neil» siga encontrándose. En Conteo importaba más
que en Vender: sin esto, el código roto ofrecía «Dar de alta esta prenda» y podía guardar un código de
barras con apóstrofos en el catálogo. Sin migración: es solo la web.

Felipe se lleva: el arreglo de raíz sigue siendo del equipo (pistola en modo «teclado español», o la Mac
en distribución US mientras se escanea); esto hace que no dependa de que cada sede lo tenga bien. Queda
sin cubrir a propósito otra distribución de teclado (ej. francesa): si aparece un carácter raro distinto
en otra sede, se suma a `guionDeLaPistola`. Verificar en la tienda: escanear una etiqueta en Vender, en
Conteo y en Existencias y comprobar que la prenda se abre aunque el campo muestre apóstrofos.
