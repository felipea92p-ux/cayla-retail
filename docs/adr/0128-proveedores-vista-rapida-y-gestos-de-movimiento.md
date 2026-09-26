# ADR-0128 — Proveedores: vista rápida, mini-tendencias y revisión de la regla de movimiento (la entrada se anima)

- **Fecha:** 2026-09-19
- **Estado:** Aceptado. **Producción:** la migración `20260919150000_proveedores_serie_mensual.sql` (una función
  de solo lectura) está SOLO en el Postgres local; se pega en producción aparte del despliegue, con ok de
  Felipe. La pantalla funciona sin ella (ver D3).
- **Decide:** Felipe (aprobó el spike visual y pidió aplicarlo). Arquitectura: este documento.
- **Diseño:** `docs/maquetas/proveedores-spike-2026-09/` (spike interactivo; parte de las maquetas 08 y 09 de
  `docs/maquetas/compras-2026-09/`, que siguen mandando en cifras, textos y jerarquías).

## Contexto

La lista de Proveedores (ADR-0111) ya decía *cuánto* se le debe a quién, pero obligaba a ir y volver: para
comparar cinco proveedores había que abrir la ficha cinco veces perdiendo orden, filtro y búsqueda. «Facturado
12 m» era un número sin forma (¿sube, cae, fue un solo mes?). Y la pantalla no respondía a lo que la persona
hacía: ordenar redibujaba la tabla, el filtro cambiaba de golpe, desactivar por error obligaba a ir a reactivar.

Felipe pidió «mejor UI/UX con efectos y animaciones». Se construyó primero un spike HTML (2026-09-19) y, aprobado,
se aplicó al ERP.

## Decisiones

**D1 — Vista rápida en vez de salto a la ficha.** Tocar una fila (solo líder) abre un cajón con lo que hace
falta para decidir: la sugerencia del siguiente paso, tres cifras, las barras de los 12 meses y las acciones
(+ Comprobante, Desactivar/Reactivar, «Abrir ficha completa»). ↑ ↓ pasan de un proveedor al siguiente sin
cerrar. La ficha sigue siendo la pantalla de referencia; el cajón no la reemplaza. Un colaborador no tiene
cajón (lo financiero no le llega: `fn_proveedores()` se lo manda en NULL, igual que antes).

**D2 — «Siguiente paso» es una función pura, no texto en el componente.** `siguientePaso()` en
`proveedores-reglas.ts` elige UNA sugerencia por prioridad (vencido > entrega atrasada > saldo a favor >
proveedor dormido > todo al día; un desactivado solo ofrece reactivar). La usan igual la vista rápida y la
ficha (`PasoSugerido`), así que no pueden decir cosas distintas. Se prueba sin base.

**D3 — La serie mensual es una función aparte y OPCIONAL.** `fn_proveedores_serie_12m()` (solo lectura, solo
líder, misma definición de «vigente» que `fn_proveedores`) devuelve una fila por proveedor y mes con compras.
No se agregó una columna a `fn_proveedores()`: tiene 23 columnas que la app lee por nombre y se reescribió
tres veces; una función chica y aparte no puede romperla. Consecuencia buscada (principio 9): si la función
no existe todavía en la base (el código se despliega antes de pegar la migración) o falla,
`getProveedoresSerie()` devuelve `null`, lo registra en el log del servidor y la lista se pinta **sin
tendencias** — nunca cae. La ventana son 12 meses de calendario (mes actual + 11), por eso la suma no coincide
al sol con «Facturado 12 m» (365 días corridos): son dos cortes del mismo dato, cada uno con su rótulo.

**D4 — La regla de movimiento cambia: la LLEGADA a una pantalla también se anima.** `globals.css` decía
«el movimiento responde a una acción de la persona; nada se anima solo al entrar a la pantalla». Al aplicar
el spike, la primera versión respetó esa regla y quedó quieta al abrir; Felipe la vio, esperaba el spike
tal cual y **decidió cambiar la regla** (2026-09-19). Nueva redacción (en `globals.css`, encabezado de
«Capa de movimiento»): el movimiento responde a una acción O acompaña la llegada a una pantalla con varias
piezas, donde el ojo necesita un orden de lectura. Al llegar, lo que aparece entra escalonado (`anim-entra`:
sube 8 px y se asienta, ≤ 450 ms, ≤ 40 ms de desfase entre piezas) y las cifras y trazos se arman **una
vez**. Los límites no cambian: nunca en bucle, nunca decorativo, nunca sobre algo que la persona ya está
usando (buscar o filtrar no re-anima la tabla), sin rebote, y con movimiento reducido todo colapsa a un
instante. **No es obligatoria en cada pantalla**: se usa donde ayuda a leer; Proveedores es la primera.

| Gesto | Se dispara con | Dónde vive |
|---|---|---|
| **Entrada escalonada**: cabecera, cifras, buscador, tabla, filas | llegar a la pantalla (una vez) | `.anim-entra` + `--i` (ficha incluida) |
| **Cifras que se arman**: cuentan desde 0 | llegar (una vez) y cada vez que el valor **cambia** | `lib/useContar.ts`, `ui/CifraQueCuenta.tsx` (`alMontar`) |
| **Trazos y barras que se arman**: mini-tendencia, barra de saldo, tramos de concentración, gráfico de costo, pista de plazo | llegar (una vez) | `.anim-trazo`, `.anim-crece-x` |
| Cajón (entra desde el borde, sale más corto) | clic en una fila | `.anim-cajon` / `.anim-cajon-salida` |
| FLIP: las filas se deslizan a su lugar | ordenar, filtrar, buscar | `lib/useFlip.ts` (Web Animations, solo `transform`) |
| Pulgar deslizante del filtro | elegir un rubro | `ui/SegmentoDeslizante.tsx` |
| Barras mensuales que crecen | abrir la vista rápida | `.anim-crece-y` |
| Trazo de la mini-tendencia | pasar el mouse por la fila | `.trazo-al-pasar` |
| Destello de fila (2,6 s) | crear, reactivar o desactivar | `.anim-destello-fila` |
| Filo rojo de la fila, flecha que se desliza, flecha de orden que gira | mouse | utilidades Tailwind |
| Guía y punto que crecen en el gráfico de costo | mouse | `ProveedorCostoEvolucion` |
| «Deshacer» 7 s en el aviso de desactivar/reactivar | desactivar | `avisar.exito(..., { accion, duracion })` |

Todos los keyframes nuevos viven en `@layer components` (regla de ADR-0105), terminan sin dejar estado
retenido (`backwards`, no `both`, donde la fila debe poder reaccionar al hover después) y se colapsan a 1 ms
con `prefers-reduced-motion` (`useFlip`/`useContar` además saltan la animación por código). Sin rebote, sin
color nuevo, sin sombra.

**D5 — «Deshacer» es exacto porque desactivar nunca borra.** Desactivar es un estado (`activo=false`) con el
historial intacto (CLAUDE.md: nunca `DELETE`). Deshacer es la operación contraria sobre el mismo proveedor; no
se ofrece deshacer de un deshacer.

**D6 — El RUC repetido se dice al escribir.** `proveedorConRuc()` avisa con el nombre del proveedor con el que
choca. El candado de verdad sigue siendo el índice `proveedores_ruc_unico`; esto solo adelanta el mensaje.

**D7 — El formulario «Registrar / Editar proveedor» se rehízo con el diseño del spike.** La primera versión
dejó el formulario viejo con retoques mínimos, por creer que «el real tiene campos que el spike no» (SUNAT,
teléfono, banco, cuenta): un error de criterio, esos campos justificaban CONSERVARLOS, no no copiar el
diseño. Ahora: carcasa del spike (rótulo «Compras · Proveedores», título serif de 24 px, pie con borde, hoja
inferior en celular); RUC con contador «n/11», hilo verde y ✓ que se dibuja al ser válido, y el RUC repetido
como mensaje rojo del propio campo (nunca «válido» y «repetido» a la vez); plazo de crédito con pulgar
deslizante (Sin definir · 15 · 30 · 45 · 60 · Otro, que abre el campo de días); forma de pago y rubro como
botones a la vista; y un botón que barre mientras guarda, confirma con un ✓ «Listo» y recién ahí cierra con
la salida animada. La consulta a SUNAT sigue siendo el mismo `<ConsultaDocumento>` (una sola copia de la
lógica del padrón); recibió tres props opcionales (`contador`, `problemaExterno`) que Vender y Facturación no
usan. `Campo` ganó el tono `ok` y `Hilo` un modo verde. El orden queda RUC → razón social (no al revés, como en
el spike) porque así se trabaja con SUNAT: el número trae el nombre.

## Qué se probó y qué no

- 26 pruebas de reglas puras (`proveedores-reglas.test.ts`): serie de 12 meses (ceros, ventana, cambio de año),
  reparto de la deuda, «hace cuánto», siguiente paso (prioridades, singular/plural), resaltado sin tildes,
  RUC duplicado. `pnpm test`: 1061 en verde.
- La función SQL, contra el Postgres local: líder ve sus filas con la suma correcta (295 + 354 + 8 496 =
  9 145 en septiembre para un proveedor), colaborador ve 0.
- **No cubierto por pruebas automáticas:** el movimiento (entrada, FLIP, cajón, destello) — se verificó a mano
  en el navegador con sesión de líder, y esa verificación encontró tres defectos que se corrigieron: la tabla
  decidía sus columnas por el ancho de la ventana (con el menú lateral el nombre quedaba en «C…»; ahora usa
  container queries sobre la propia tabla), `useFlip` medía con `offsetTop` y las filas se deslizaban
  distancias distintas, y `useContar` dejaba la cifra clavada en 0 en desarrollo (React repite los efectos).

## Consecuencias

- La barra de «Concentración» ya no es un enlace a Por pagar: sus tramos son botones (apuntar enciende la
  fila, tocar abre la vista rápida). El enlace a Por pagar vive en el cajón y en el saldo de cada fila.
- La columna «Última compra» muestra «hace N d» (la fecha exacta queda en el `title`), y la tabla de líder
  pierde columnas por ancho en vez de desbordar: RUC y «Última compra» bajo 1280 px, «A favor» y «Entregas»
  bajo 1024 px. Están en la vista rápida y en la ficha.
- Falta pegar `20260919150000` en producción (ver BACKLOG). Hasta entonces la lista se ve igual, sin
  mini-tendencias ni barras mensuales.

## Actualización 2026-09-26 — ↑ ↓ del cajón: solo las teclas que nacen en el cajón

**El problema.** D1 dijo que ↑ ↓ pasan de un registro al siguiente sin cerrar el cajón, y las cuatro vistas rápidas
(Proveedores, Recibidas, Notas de crédito y Por pagar) lo cumplían escuchando las flechas en todo su
`Dialog.Content`. En Por pagar, «Pagar» abre «Registrar pago»: un `<Modal>` que en la página vive en otro portal
pero que en el árbol de React está DENTRO del cajón, y React hace subir los eventos de un portal por sus ancestros
de React. Un ↓ en el monto, en una ficha de medio de pago o en un combo del pago llegaba al cajón, que pasaba al
comprobante siguiente: el contenido del cajón se vuelve a montar (`key={c.id}`), el pago se desmontaba con lo
escrito y el cajón quedaba en la factura de OTRO proveedor, con su botón «Pagar» listo. Reproducido el 2026-09-26
en la pantalla real: con «100» escrito para Textiles Andina, ↓ dejó el cajón en Confecciones del Sur.

**La decisión.** `lib/vista-rapida-reglas.ts` (`pasoConFlecha`, pura y con pruebas) decide si la tecla es del cajón,
y `components/ui/useFlechasDelCajon.ts`, el gemelo de `useEscapeLibre`, la traduce desde el evento en el `onKeyDown`
de cada cajón. El cajón se queda con la flecha solo si (a) nació dentro de su propio DOM
(`e.currentTarget.contains(e.target)`; lo que sube desde un modal tiene su destino en otro portal), (b) ningún
control la usó antes (`e.defaultPrevented`: combos, fecha, fichas de `LineasPago`, que ya llaman a
`preventDefault`), (c) no viene de un campo (`input`, `textarea`, `select`, `contenteditable`), donde mueve el
cursor o cambia el valor, y (d) va sin Ctrl, ⌘ ni Alt. La regla (a) es la que arregla Por pagar: las fichas de
medio de pago no usan flechas, así que ni (b) ni (c) habrían detenido su ↓. `lib/vista-rapida-reglas.test.ts`
hace fallar el CI si una hoja con `<Dialog.Content` vuelve a leer `"ArrowDown"`/`"ArrowUp"` a mano.

**Descartado.** (1) Sacar el modal de pago del árbol del cajón (que la lista lo abra): arreglaba solo Por pagar, y el
próximo modal que se abra desde un cajón traería el bug de vuelta. (2) Cortar la propagación de las flechas en
`<Modal>`: toca todos los modales del ERP para arreglar un cajón, deja pasar las demás teclas y los clics, y
cortarla en el `document` le quita a `window` la señal de la que depende `useEscapeLibre`.

**Se rompe si** un control dentro de un cajón usa una flecha sin llamar a `preventDefault` (el cajón pasaría de
registro a la vez), o si un modal se monta con `container` DENTRO del DOM del cajón (entonces su tecla sí «nace» en
el cajón). Hoy no hay ninguno de los dos.

**Cómo se verifica.** Por pagar, con sesión: abrir la vista rápida de un comprobante con saldo → «Pagar» → escribir
un monto → ↓ en el monto, en una ficha de medio de pago, en la fecha (abre el calendario) y en «Sale de» (abre la
lista): el cajón sigue en el mismo comprobante y el pago abierto con lo escrito. Cerrado el pago, con el foco en el
cajón, ↑ ↓ siguen pasando de comprobante. Verificado el 2026-09-26 en escritorio y a 375 px, además de Proveedores y
Recibidas (Notas de crédito no tenía notas en la base local), y en un banco temporal con un campo, un área de texto y
un combo DENTRO del cajón.
