# Finanzas v3 · Gastos, separado por sede (2026-10-23)

Pedido de Felipe (23-oct), sobre Finanzas entero: «todo está muy básico y poco entendible, hay filtros que no funcionan bien,
no hay botones para regresar en ciertas vistas; tiene que estar lo más ordenado posible, siempre dando la opción de separar por
sede». En Gastos lo más urgente: **hoy los gastos salen todos juntos y no hay forma de ver los de cada sede.**

Se abre con `index.html` (selector **A · B · C** arriba, también `#a` `#b` `#c`, y botón de tema). Las cifras son de ejemplo:
la misma historia de octubre de la v2 (jueves 15), repartida por sede. Los totales se calculan solos, así que siempre cuadran.
Nada se guarda. **Felipe elige mirando**; hasta entonces no se toca código de la app, migraciones ni producción.

## 1. Lo que encontré (auditoría del 23-oct)

Recorrí `/finanzas/gastos` en local (escritorio 1440 px y 375 px, cada pestaña, filtro y hoja) y leí el código y la base local.
De más grave a menos:

| # | Gravedad | Hallazgo | Dónde |
|---|---|---|---|
| 1 | Alta | **El reparto por sede ya existe y no se dibuja.** `fn_gastos_panel` devuelve `por_ubicacion` (monto y cantidad por sede) y la web lo lee, pero ningún componente lo usa. En «Todas las tiendas» la respuesta, las cifras y la tabla mezclan todo; lo único que separa es una columna «Unidad», sin filtro ni subtotal. | `apps/web/lib/gastos-reglas.ts:172` y `:258` (se lee); `components/GastosPanel.tsx:427` y `:463` (la columna) |
| 2 | Alta | **Quien ve todo Finanzas sin ser líder no puede elegir sede y ve una sola sin saberlo.** La página decide el selector con `persona.rol === "lider"`, pero la base le da todas las sedes a `fn_ve_finanzas_de_todo()` (líder **o** un rol con Configuración, Cierre de mes o CAYLA Global). Para ese rol, `leerVer` ignora `?ver=` y toma `ubicaciones[0]` (Tienda Lima, la primera por orden): la pantalla dice «Gastos de Tienda Lima» y no hay combo para cambiarla, ni siquiera en CAYLA Global. La pregunta correcta ya existe: `veFinanzasDeTodoDe(persona)`. Toca permisos: **va con tu OK**. | `app/(app)/finanzas/gastos/page.tsx:30`; `lib/gastos-reglas.ts:136-140`; `components/GastosPanel.tsx:156`; `lib/persona-actual.ts:264` |
| 3 | Alta | **El selector de sede no parece un selector de sede.** Es un combo chico rotulado «Ver», a la derecha de la cabecera, junto al botón principal; «De la empresa» está escondido al final de la lista. Parado en una sede, el líder entra a la sede donde trabaja y nada le dice que existen las demás. | `components/GastosPanel.tsx:157-168`; `lib/gastos-reglas.ts:144` |
| 4 | Media | **La misma cifra dos veces.** «Este mes gastaste S/ 86» (la respuesta del camino A) y, justo debajo, la tarjeta «Gastado en el mes S/ 86». | `components/finanzas/GastosPulso.tsx:39`; `components/GastosPanel.tsx:203` |
| 5 | Media | **Los filtros no se ven puestos ni se quitan de a uno.** Búsqueda y categoría viven solo en la pantalla (no en la URL: al recargar o compartir se pierden); filtrada la tabla, lo único que lo dice es «3 de 11 gastos» en el pie. No hay filtro de sede, de comprobante ni de estado dentro de la tabla. | `components/GastosPanel.tsx:375-384`, `:389-398`, `:492` |
| 6 | Media | **La búsqueda distingue tildes y no busca por categoría ni sede.** «bano» no encuentra «Baño»; «movilidad» no encuentra un taxi. | `components/GastosPanel.tsx:378-382` |
| 7 | Media | **Las salidas de caja por clasificar no se filtran por mes ni por sede dentro de la pestaña.** En local, una salida del 28 de septiembre aparece como «te falta 1 cosa» en octubre. Que lo pendiente siga a la vista está bien; lo que falta es decir de qué mes y de qué sede es. | `components/GastosPanel.tsx:264-308`; `lib/gastos.ts:87-93` |
| 8 | Media | **Un error técnico crudo a la vista.** Si una lectura falla, la pantalla pinta el mensaje de Postgres («Could not find the function retail.fn_gastos_igv_perdido(…) in the schema cache») en un párrafo suelto, no en `<Aviso tono="error">` y en palabras de tienda. En local pasó porque falta una migración; en producción pasaría con cualquier corte. | `components/GastosPanel.tsx:186-190` |
| 9 | Baja | **Vueltas escritas a mano.** Dentro de las hojas «Anular gasto» y «Dar de baja», regresar es un botón «Volver» escrito, no la flecha `<Volver>`. «Editar fijos» lleva a Configuración (y «Ver gastos» llega desde Impuestos) sin camino de vuelta a Gastos. La pantalla principal no necesita flecha: es una entrada del menú. | `components/GastosPanel.tsx:545-547`; `components/GastosFijosYActivos.tsx:107`, `:823-825` |
| 10 | Baja | **«Anular…» está en gris.** Es `btn-sutil` y la regla de lo peligroso (`accion.eliminar`) pide `btn-peligro`. | `components/GastosPanel.tsx:614` |
| 11 | Baja | **No ocupa el ancho.** `/finanzas` está en la deuda de `CON_TOPE_DE_ANCHO`: a 1440 px la pantalla usa unos 1024 px y la tabla de 8 columnas va apretada mientras sobra espacio al costado (ADR-0462). | `components/AppShell.tsx:655` |
| 12 | Baja | **A 375 px cada gasto ocupa casi una pantalla**: la tabla pasa a una ficha con sus 8 etiquetas, una debajo de otra. | `components/GastosPanel.tsx:455-482` (`data-l`) |
| 13 | Baja | **El título no dice qué se mira.** Con todas las sedes dice «Gastos de octubre»; con una sede cambia el título y la frase sigue siendo la misma. | `components/GastosPanel.tsx:143`, `:153` |

**Lo que sí funciona** (lo probé): el filtro de categoría y el de mes filtran bien, el combo «Ver» del líder cambia de sede
(`?ver=`), la hoja de un gasto se abre y se cierra con la × y con Escape, y Activos fijos ya muestra un resumen por sede
(`ResumenActivosPorSede`). Ese resumen es el precedente de lo que pide Felipe para los gastos.

**¿Hace falta base para separar por sede? No.** Cada gasto ya guarda su sede: `retail.gastos.ubicacion_id`, y nulo significa
«de la empresa». `fn_gastos_lista`, `fn_gastos_panel` y `fn_gastos_fijos_mes` ya reciben `p_ubicacion_id` y `p_solo_empresa`,
y el panel ya devuelve `por_ubicacion`. Las tres maquetas se construyen con lo que hay. En la base local solo existen Tienda
Lima, Tienda Trujillo y Taller (no hay Arequipa), y los 11 gastos de prueba son todos de Lima.

## 2. Las tres direcciones

Las tres parten del camino A (v2, elegido el 15-oct) y comparten lo que Felipe pidió siempre, para que lo que cambie entre ellas
sea solo **cómo se muestra el reparto**:

- **La fila de sedes bajo la cabecera, antes de las cifras**: «Todas las sedes» + Trujillo · Arequipa · Lima · Taller · De la
  empresa, cada una con su monto. A 375 px se parte en dos líneas (sin scroll lateral). Es la misma propuesta que dejó la sesión
  de Cierre de mes, para que Finanzas no tenga seis selectores distintos.
- **La sede vive en la URL** (`?sede=tru`): «atrás», recargar y compartir la conservan.
- **Elegir una sede pone la flecha de vuelta** (`<Volver a="Volver a todas las sedes">`) en la línea de sede, y el título pasa a
  «Gastos de Trujillo» / «del Taller» / «de la empresa».
- **Orden del ERP**: cabecera → cifras → filtros y tabla en UNA tarjeta → nota en hueso.
- **Filtros a la vista**: buscador que filtra mientras se escribe (sin tildes; también por categoría y sede), píldoras Sede ·
  Categoría · Comprobante, el mes «‹ Octubre 2026 ›». Cada filtro puesto sale como píldora con ✕, y «Limpiar todo» cuando hay
  dos o más, junto a cuántos gastos y cuánta plata quedan.
- **La tabla separa por sede** (interruptor «Separar por sede», prendido de fábrica en «Todas»): un título por sede con su
  cantidad y subtotal. A 375 px cada gasto ocupa tres líneas, no una pantalla.
- **«Gastado» una sola vez** (arregla el #4), «Anular gasto» en rojo (#10) y la hoja con una sola salida, la ×.
- **Todo el ancho** (ADR-0462): la tabla con una columna al costado.

| | Camino | Cómo separa por sede | Resuelve |
|---|---|---|---|
| **A** | **La respuesta, por sede** | La v2 con la sede a la vista: la respuesta grande («Este mes gastaste S/ 17,750») con una **barra apilada por sede que se toca**; las cifras, la bandeja de a una, las pestañas y la tabla siguen la sede elegida. Al costado de la tabla, «En qué» por categoría (tocar filtra). | 1, 3, 4, 5, 6, 9, 11, 12, 13. Es el más cercano a lo que ya está construido. |
| **B** | **La mesa: categoría × sede** | Una tabla de doble entrada: categorías en filas, sedes en columnas, total y **diferencia contra septiembre**; cuanto más plata, más oscura la celda. Tocar una celda filtra la lista de abajo por las dos cosas. Interruptor «Sin alquileres». Abrir un gasto es una **vista propia con su flecha** «Volver a Gastos». | 1, 3, 4, 5, 6, 9, 11, 12, 13. Para comparar sedes y para el contador. |
| **C** | **Una tarjeta por sede** | Primero los lugares: una tarjeta por sede (cuánto, % de CAYLA, sus 3 categorías mayores, contra septiembre, «1 por revisar» o «Al día»). Tocarla entra a la **vista de esa sede**, con flecha de vuelta, sus cifras y su tabla. «Sin alquileres» muestra lo que sí se decide día a día. | 1, 3, 4, 5, 6, 9, 11, 12, 13. La que más se parece a «quiero ver Arequipa». |

El #2 (quien ve todo Finanzas sin ser líder) y el #8 (el error crudo) no son de diseño: se arreglan igual en cualquiera de las
tres, y el #2 espera tu OK porque toca permisos.

## 3. Lo que necesitaría base, y es decisión de Felipe

Nada de esto bloquea la maqueta que elijas; son decisiones para cuando se construya.

1. **Permisos (#2):** que la pantalla pregunte `veFinanzasDeTodoDe(persona)` en vez de `rol === "lider"`. No lleva migración
   (la base ya responde bien), pero cambia lo que ve un rol con Configuración, Cierre de mes o CAYLA Global: hoy ve una sede y
   después vería todas. ¿Lo hago?
2. **La matriz de B y el «vs septiembre» de B y C:** se pueden armar en la pantalla con `fn_gastos_lista` (dos meses). Pero esa
   función corta en 500 gastos por mes: si algún mes pasa de 500, la matriz saldría incompleta sin avisar. Lo sólido es una
   función de solo lectura que sume en la base (`fn_gastos_por_sede_y_categoria(p_desde, p_hasta)`, una migración chica, sin
   tocar tablas). La recomiendo si eliges B o C.
3. **La bandeja con facturas de SUNAT y movimientos del banco:** la maqueta muestra «Factura que SUNAT ya trae» y «Movimiento del
   banco sin explicar», como la v2. La bandeja de hoy solo junta salidas de caja y gastos fijos (`lib/gastos-pulso-reglas.ts`);
   las otras dos salen de Impuestos (SIRE) y de la conciliación de Cuentas y dinero, que trabaja otra sesión. ¿Entran a la bandeja
   de Gastos o se quedan en su módulo?
4. **Lo de la empresa no se reparte entre sedes** en Gastos (contador y publicidad quedan como «De la empresa»), igual que hoy;
   el Resumen es el que dice qué deja cada lugar. Si quieres que Gastos lo reparta (por ventas o en partes iguales), eso es
   una regla de negocio tuya.
5. **El nombre del parámetro:** la maqueta usa `?sede=` como Cierre. Hoy Gastos usa `?ver=`, y Caja e Impuestos enlazan con
   `?ver=todas`. Al construir, `?ver=` se seguiría leyendo para no romper esos enlaces.

## Archivos

- `index.html`: los tres caminos, con datos que se calculan.
- `base.css`, `base.js`: copia de `finanzas-v2-2026-10/` (no se comparten entre submódulos). `base.js` tiene un cambio: el hash
  puede llevar filtros (`#a?sede=tru`), así que el camino es lo que va antes del «?».
