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
caracteres; un permiso inventado no pasa; un texto con nombre `.jpg` se rechaza («Eso no es una foto»); recoger sin sesión da 401. Sin
`SUPABASE_SERVICE_ROLE_KEY` la ruta respondió como debe («No se pudo subir la foto»). **Con la llave (Felipe la agregó al `.env.local`
desde el contenedor de Studio), la subida completa:** el celular dice «Listo: ya está en la computadora · Puedes subir 2 de 3», la hoja del
QR se cierra sola, la foto queda en la lista y en la placa, entra a «Fotos y colores» al crear la prenda, y el almacén queda vacío (la foto
se borra al recogerla). Los envíos de prueba ENV-000717 a 720 quedaron anulados; no se creó ninguna prenda. **Migración `20261124161000` solo en local**: producción
espera el OK de Felipe.

## 2026-11-24 · Recibir se ve como la maqueta (ADR-0699, actividades 3, 5 y 5a)

- **Qué hice:** la cabecera de categoría en una línea con el avance como filo; la foto de cada modelo más grande; «¿Esta prenda ya existe?»
  muestra la galería entera cuando el nombre no coincide, con tu foto arriba y el catálogo en otra pestaña; la franja de Admin pasó al «?»;
  «Por terminar» ya no es una parada del camino.
- **Por qué así:** Felipe quiere la maqueta con las piezas del ERP. Lo que identifica es la foto, no el nombre que anotó Compras.
- **Qué se rompería sin esto:** con el nombre de Compras, la hoja decía «No hay…» y la persona creaba una prenda repetida sin ver las que ya
  existen.

**Probado en local** (Playwright sin ventana, 1440 × 900, claro), con envíos sin aviso de prueba (ENV-000721 a 723, anulados). Pruebas de
Recibir, guías y huella en verde. **Toca `app/estilos/vidrio/recibir-mesa.css`:** está en la lista de «se miran» de Dynamic; Dynamic no
tiene Recibir, así que queda como aviso, sin tarea. **Sin probar:** oscuro y 375 px.

## 2026-11-24 · Recibir: temporada y etiquetas al crear la prenda (ADR-0699, actividad 4)

- **Qué hice:** «Crear la prenda» desde Recibir ofrece «Temporada y etiquetas», como Nuevo producto. Lo elegido se guarda en la misma
  transacción que crea la prenda (`preparar_prenda_al_recibir_con_ficha`, migración `20261124165000`).
- **Por qué así:** Felipe eligió la migración. La primera versión ampliaba la función de siempre y rompía las suites de Postgres; la nueva
  función la envuelve sin tocarla.
- **Qué se rompería sin esto:** la prenda creada al recibir quedaba sin temporada ni etiquetas, y había que ir a Productos a terminarla.

**Probado:** suite `envio_sin_aviso` 46/46, con W6 (nace con temporada y etiqueta) y W7 (una temporada fuera de la lista no crea nada).
En la pantalla (Playwright sin ventana): la hoja manda `p_temporada` y `p_etiqueta_ids` a la función nueva; esa llamada se cortó en la
prueba, así que no se creó ninguna prenda. **Envíos de prueba de la sesión: ENV-000717 a 723 y 888 a 892, todos anulados.**
**Migraciones `20261124161000` y `20261124165000` solo en local.**

## 2026-11-24 · Las dos migraciones, en producción (OK de Felipe)

- `20261124161000_foto_por_qr.sql` y `20261124165000_prenda_al_recibir_con_temporada_y_etiquetas.sql` aplicadas con la integración de
  Supabase en `cayla-dynamic`, después de comprobar sus requisitos con consultas de lectura. Verificado en producción: tablas con RLS y sin
  políticas, `authenticated` no lee la tabla ni llama a `usar_foto_por_qr`, `anon` no crea permisos, almacén `retail-fotos-por-qr` privado
  con tope de 10 MB; `crear_foto_por_qr`, `usar_foto_por_qr` y `preparar_prenda_al_recibir_con_ficha` con el MISMO md5 que en local.
- Vercel tiene `SUPABASE_SERVICE_ROLE_KEY` en producción (la usan las terminales): el QR funciona al publicar.
- Las versiones en `supabase_migrations.schema_migrations` quedaron con la hora de aplicación, no con la del archivo (así registra la
  herramienta); no se alinearon.

## 2026-11-24 · Los pasos uno bajo otro, con foco al pasar de paso (ADR-0699, forma A)

- **Qué hice:** los pasos del modelo dejaron de ser una tira arriba: son el cuerpo de la placa, uno bajo otro. Al pasar de paso, la placa lo
  centra, lo enciende y deja el cursor en su botón.
- **Por qué así:** Felipe eligió la forma A mirando la maqueta: arriba, como opción, se pasaba por alto.
- **Qué se rompería sin esto:** la colaboradora contaba y seguía con el siguiente modelo sin ver que a este le faltaba crearse.

**Probado en local** (Playwright sin ventana, ENV-000934 de prueba, anulado): tras «+5», «Cuántas» queda en su línea, «Crear la prenda» se
abre, la luz se enciende en él y el foco queda en su botón; «Cambiar» vuelve a abrir el número. `tema:auditar`: 0 hallazgos solo en oscuro.
Pruebas de `lib` 169 066 en verde; huella de la guía aceptada.

## Diccionario de datos al día con producción (2026-11-24)

- **Qué hice:** refresqué el volcado de producción (`docs/datos/generado/`): 122 grupos nuevos o cambiados, ninguno quitado; las 2334
  huellas coinciden con producción (foto 17:43 UTC: 367 relaciones, 2271 funciones). Les di dueño en el aviario a las 11 tablas nuevas
  (`fotos_por_qr` y su archivo, del ADR-0699; y otras 9 que trajeron otras ramas: barrido del piso, libro de reclamaciones, feriados,
  tallas sueltas de una oferta, reparto de gastos de aliadas).
- **Por qué así:** la regla dice que una migración no está terminada hasta que su tabla está en el diccionario. La consulta se corrió por
  partes (huellas por grupo y solo las líneas nuevas), en solo lectura.
- **Qué se rompería sin esto:** `datos:comparar` diría que `crear_foto_por_qr` o `preparar_prenda_al_recibir_con_ficha` no existen en
  producción, y alguien podría volver a pegarlas. Hoy: ninguna pantalla llama a una función con parámetros que producción no acepte.
