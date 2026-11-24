## 📦 Recibir: cada modelo sale al stock desde el contador (2026-11-24) — plan, sin construir; rama `claude/mejora-recepcion-mercaderia-2c864b`

Felipe pidió que Recibir ▸ Contar sea más rápido y que nadie tenga que volver a «Por terminar» para acabar de recibir. Maqueta tocable
aprobada en su dirección: `docs/maquetas/recibir-terminar-en-el-contador/index.html` (publicada privada, versión 4). La lista va
**por categoría** (Felipe 2026-11-24: «me gusta más de esta forma»), cada categoría se contrae y su cabecera dice cómo va (dijeron,
a la venta, una barrita); adentro, cada modelo con su foto. «Contraer todo / Expandir todo» arriba, y la categoría del modelo que se
está trabajando se abre sola.

**Decisión de Felipe (2026-11-24):** para saber si una prenda ya existe, primero la galería de la misma categoría y marca, y un enlace
al catálogo en otra pestaña. La comparación por foto con IA llega después y solo como sugerencia: nunca decide sola.

### Lo que ya existe y se reusa (leído en el código, no en los .md)
- Crear la prenda al recibir con las piezas de Nuevo producto: tejido, patrón, «Fotos y colores» con Catálogo con IA, precio de Compras e
  «Igual que la anterior» (`components/recepcion-envio/HojaPrenda.tsx:71-89`).
- «¿Ya existe?» antes de crear, por categoría, marca y nombre; sin coincidencia por nombre ya muestra las prendas de la categoría con su foto (`components/recepcion-conteo/YaExisteLaPrenda.tsx:15`, visto en local el 2026-11-24).
- «Llevar al stock ahora» con «Llevar e imprimir», sin cerrar el envío (`components/recepcion-conteo/LlevarAlStock.tsx:37`).

### Actividades (cada una, un corte que se prueba en el navegador)
- [x] **1 · Los pasos del modelo a la vista (ADR-0699).** Cuántas → Crear (solo nueva) → Tallas → Llevar, con los puntos de Nuevo producto;
  una nueva contada pide «Crear la prenda» como botón principal; la línea del envío dice «N ya a la venta». Verificado en local a 1440 claro.
  «Qué es» entra en la actividad 2, con la foto.
- [ ] **1b · Sin verificar:** oscuro, 1024 y 375 px; `/milimetro auditar /recibir/envio/[id]`, `/formidable`, `/focus`, `/chaos`.
- [ ] **1c · Hallazgo:** poner en cero un modelo ligado a una prenda existente le quita el vínculo (vuelve a «por crear»). Misma raíz que
  el «No llegó falso»; pide decisión de Felipe.
- [x] **2 · La foto primero (ADR-0699).** «Tomar foto» en la placa de un modelo nuevo sin prenda; la foto se ve en la lista y en la placa y
  entra sola a «Fotos y colores» al crear. No es un paso obligatorio. Tipos y pruebas en verde.
- [x] **2b · Probado en local** (Playwright sin ventana, 1440 × 900, claro), en un envío sin aviso de prueba (ENV-000717, anulado al
  terminar con «Se abrió por error»): «Tomar foto» → la foto en la lista y en la placa, «Cambiar foto»; «Crear la prenda» → «Fotos y
  colores» ya trae la foto y lee su color (Terracota). No se creó ninguna prenda.
- [ ] **2c · La foto con el celular por QR (Felipe 2026-11-24: «me parece una idea acertada»).** Necesita guardar la foto en algún lado
  entre el celular y la computadora: es una migración, espera la decisión de Felipe sobre cómo entra el celular.
- [ ] **Igual a la maqueta, con las piezas del ERP (Felipe 2026-11-24).** Lo que falta para que se vea como la maqueta: la cabecera de
  categoría delgada (5a), la lista con la foto de cada modelo más grande, la galería «¿ya la tenemos?» (3) y el aviso de Admin como chapa
  (5). Los pasos del modelo se quedan con los puntos de Nuevo producto: las cajitas de la maqueta serían una segunda pieza para lo mismo.
- [ ] **3 · La galería «¿Ya la tenemos?» con fotos.** `YaExisteLaPrenda` muestra la foto de cada prenda de la misma categoría y marca,
  y el enlace «Ver todo el catálogo» se abre en otra pestaña, ya filtrado. Hay que ver si `buscarPrendasParaRecibir` ya trae la foto.
- [ ] **4 · Temporada y etiquetas al crear.** Va contra lo decidido el 2026-11-03 («se ponen después en Productos»): Felipe lo pide
  ahora. `preparar_prenda_al_recibir` no las recibe (14 parámetros, `20261013002000_recepcion_de_envio.sql:435`): pide una migración
  o una segunda escritura con las funciones de Editar producto. Se decide al llegar.
- [ ] **5a · La cabecera de categoría, delgada (Felipe 2026-11-24, con captura):** una línea —flecha, nombre, «dijeron 17» o «12 de 17 a
  la venta» a la derecha— y el avance como un filo de 2 px abajo, sin sumar alto. Adentro, los modelos como en la maqueta (versión 5).
  En la app es la cabecera de `CategoriasAcordeon`.
- [ ] **5 · Lo que sobra.** El aviso de Admin pasa a una chapa con «?»; la barra de etapas deja de mostrar «Por terminar» como paso
  normal; «Para después» se ve en ámbar en la lista.

### Después (no entra en este trabajo)
- [ ] La comparación por foto con IA, como sugerencia (huella de cada foto del catálogo; qué pasa si el servicio no responde).
- [ ] La foto desde el celular con un QR mientras la computadora cuenta.
- [ ] Tallas sugeridas según la última compra de esa marca.
- [ ] Aviso al encargado de sede si algo lleva más de 7 días en «Para después».
- [ ] Qué pasa con los envíos que ya están en «Por terminar» al publicar (propuesta: se terminan como hoy).

### Antes de construir
- `pnpm sesiones` y los PR abiertos: `ContarEnvio.tsx` y la huella `lib/guias/huellas/recibir.envio.id.json` son el punto de choque de
  todo Recibir ▸ Contar.
- `/milimetro diseñar` de la placa con pasos; al terminar, `/formidable`, `/focus`, `/guia` y `/chaos` (la pantalla guarda stock).
- ADR del cambio de flujo (actualiza ADR-0393: «Por terminar» deja de ser el camino normal), con su número reservado.
