## 2026-11-24 · Recibir: los pasos del modelo y «Crear la prenda» como lo que toca (ADR-0699, actividad 1)

- **Qué hice:** arriba de cada modelo, en Recibir ▸ Contar, ahora se ven los pasos que le faltan para venderse: Cuántas → Crear → Tallas →
  Llevar. Una prenda nueva ya contada tiene como botón principal «Crear la prenda» (antes quedaba para después sin que nadie lo decidiera),
  y la línea del envío dice cuántas prendas ya están a la venta.
- **Por qué así:** lo nuevo era lo que llenaba «Por terminar» y obligaba a volver a recibir otro día. Se reusó la pieza de los puntos de
  Nuevo producto, sin dibujar una segunda.
- **Qué se rompería sin esto:** un envío con cinco modelos nuevos se cerraría con 20 prendas en el almacén que Vender no ve, hasta que
  alguien se acuerde de «Por terminar».

**Verificado en local** (ENV-000644, 1440 × 900, claro): la tira en una reposición y en una nueva, «Crear la prenda» abre «¿Esta prenda ya
existe?», «Dejar para después» cambia la tarjeta y avisa. Pruebas de reglas, tipos, knip y la guía interactiva, en verde.
**Sin verificar:** oscuro, 1024 y 375 px; `/milimetro auditar`, `/formidable`, `/focus` y `/chaos`.

**Hallazgo, sin arreglar:** en ENV-000644, poner en cero un modelo ligado a una prenda existente («Vestido Mimosa») le quitó el vínculo, y
volvió a su nombre anotado («Vestido Lirio NOLLEGO», por crear). Es la misma raíz del «No llegó falso» (`recepcion-modelos-reglas.ts`: el 0
de un anotado no deja marca por modelo). En la base local quedó así.

## 2026-11-24 · Recibir: la foto del modelo nuevo, tomada al contar (ADR-0699, actividad 2)

- **Qué hice:** un modelo nuevo sin prenda tiene «Tomar foto» en su placa (en el celular, la cámara). La foto aparece en la lista y en la
  placa, y al crear la prenda ya está en «Fotos y colores», donde se lee su color.
- **Por qué así:** la foto sirve para distinguir modelos parecidos mientras se cuenta, y no frena el conteo: no es un paso obligatorio.
- **Qué se rompería sin esto:** dos vestidos anotados por nombre («Vestido 1», «Vestido 2») se confunden en la lista, y la foto se toma dos
  veces: una para reconocerlos y otra al crear.

**Verificado:** tipos, 908 pruebas de Recibir y guías, la huella de la guía. En el navegador, con Playwright sin ventana para no tocar el
panel, que Felipe estaba usando en ENV-000644: un envío sin aviso de prueba (ENV-000717), un modelo nuevo, la foto en la lista y en la
placa, y al crear la prenda la foto ya en «Fotos y colores» con su color leído. ENV-000717 quedó anulado; no se creó ninguna prenda. Trampa encontrada: el escáner de guías lee `accept="image/*"` como el inicio de un comentario y se traga el control siguiente; se
escribió la lista de formatos.

## 2026-11-24 · Recibir: la foto con el celular, por QR y sin sesión (ADR-0699, 2c)

- **Qué hice:** «Con el celular» en la placa de un modelo nuevo muestra un QR. Quien lo escanea toma la foto sin entrar al ERP, y la foto
  llega sola a ese modelo en la computadora. Vale 10 minutos y hasta 3 fotos.
- **Por qué así:** Felipe eligió «sin sesión». La puerta es una sola ruta del servidor, que mira el permiso y que el archivo sea una foto de
  verdad; la base solo guarda la huella del permiso y el almacén no tiene políticas.
- **Qué se rompería sin esto:** la foto se toma con la cámara de la computadora o se pasa a mano del celular, y en el almacén eso no pasa.

**Probado en local** (Playwright sin ventana: una computadora con sesión y un «celular» sin cookies): el QR aparece y trae un permiso de 32
caracteres; un permiso inventado no pasa; un texto con nombre `.jpg` se rechaza («Eso no es una foto»); recoger sin sesión da 401. **Sin
probar la subida completa:** el entorno local no tiene `SUPABASE_SERVICE_ROLE_KEY`, y la ruta respondió como debe sin ella («No se pudo
subir la foto»). Los envíos de prueba ENV-000717, 718 y 719 quedaron anulados. **Migración `20261124161000` solo en local**: producción
espera el OK de Felipe.
