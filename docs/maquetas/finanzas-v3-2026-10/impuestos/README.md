# Finanzas v3 · Impuestos (2026-10-23)

Felipe pidió (23 de octubre) rediseñar Finanzas submódulo por submódulo: «todo está muy básico y poco entendible, hay filtros que
no funcionan bien, no hay botones para regresar en ciertas vistas; tiene que estar lo más ordenado posible, siempre dando la
opción de separar por sede». Esta carpeta es la de **Impuestos**. Parte de la v2, camino A («La respuesta», elegido el 15 de
octubre: `docs/maquetas/finanzas-v2-2026-10/`).

- **Maqueta:** `index.html`, con tres direcciones (selector **A · B · C**, también `#a` `#b` `#c`) y tema claro u oscuro. El mes
  y la sede viven en la URL (`?mes=2026-08&sede=lim`). Nada se guarda.
- **Cifras de ejemplo:** las de la historia de la v2 (hoy es jueves 15 de octubre de 2026, se declara septiembre y vence el martes
  20), ahora **repartidas por lugar**. Los totales salen siempre de sumar los lugares, así ninguna cifra contradice a otra.
- **Felipe elige mirando.** No se tocó código de la app, migraciones, SUNAT/Lucode ni producción.

## 1. Auditoría de la pantalla de hoy

La recorrí en local (`localhost`, cuenta de Felipe del seed) a 1440 px y a 375 px, en claro y en oscuro: `/finanzas/impuestos`,
el «¿Por qué?», cada fila de la tabla, el combo «Otro mes» y `?mes=` a mano. Las descargas no las bajé (solo leen). La base local
tiene pocos datos: septiembre tiene 1 comprobante, 2 ventas sin comprobante y saldo a favor.

### Hallazgos, de más grave a menos grave

**Graves (rompen algo o dicen algo falso)**

1. **Los «Ir» de «Antes de declarar» llevan a una página que no existe.** Las tres cosas de comprobantes apuntan a
   `/ventas/comprobantes` (`lib/impuestos-pulso-reglas.ts:59`, `:60` y `:61`), pero la ruta es `/vender/comprobantes`. La otra lista
   de la misma pantalla sí la usa bien (`components/ImpuestosPanel.tsx:390` y `:398`). Hoy dan 404.
2. **Un mes sin movimiento dice «te queda a favor S/ 0.00».** Con `?mes=2025-08` sale «Agosto te dejó S/ 0 de IGV a favor». El estado
   se decide con `igv > 0 ? "a_pagar" : "a_favor"` (`lib/impuestos-pulso-reglas.ts:42`): sin IGV ni saldo debería decir «sin
   movimiento» o «antes de que CAYLA usara el sistema». En ese mismo mes, «Antes de declarar» dice «Al día, nada pendiente»
   (`components/finanzas/ImpuestosPulso.tsx:73-74`) y la renta pide «Configurarla» para 2025.
3. **El «¿Por qué?» con saldo a favor no cierra la cuenta.** Muestra «Te queda a favor S/ 8,043» y debajo «+S/ 1» de renta, sin total
   (`lib/impuestos-pulso-reglas.ts:54-55`: el «Total a SUNAT» solo se agrega si hay IGV a pagar). No queda claro si ese S/ 1 se paga.
   La frase de arriba sí lo dice. Hay que repetirlo en la cuenta.
4. **A 375 px la tabla de meses se corta por la derecha.** Las filas pasan a tarjetas, pero la tabla conserva `style={{ minWidth: 560 }}`
   (`components/ImpuestosPanel.tsx:200`) dentro de una caja de 341 px. «Cobrado», «A pagar» y «a favor S/ …» quedan fuera y se ven
   con un scroll lateral escondido.

**Moderados (confunden o no filtran bien)**

5. **Dos listas dicen lo mismo.** «Antes de declarar», arriba (`ImpuestosPulso`, montada en `ImpuestosPanel.tsx:139`), y «Para
   revisar antes de declarar», abajo (`ImpuestosPanel.tsx:181`, función `ParaRevisar` en `:365`), repiten las mismas cosas con
   textos distintos, enlaces distintos (uno roto, el 1) y botones distintos («Ir» contra «Ver en Facturación»).
6. **Cambiar de mes no se nota.** Tocar una fila o elegir en «Otro mes» navega con `scroll: false` (`ImpuestosPanel.tsx:71`): la
   respuesta grande y las cifras cambian **arriba, fuera de la vista**. Abajo solo se mueve la raya de la fila.
7. **El selector de mes está al fondo y no cuadra con la tabla.** El mes que manda en toda la pantalla se elige en «Otro mes», junto a
   la tabla (`ImpuestosPanel.tsx:190-196`), y ofrece 24 meses. La tabla, en cambio, muestra siempre los 6 últimos desde hoy
   (`:211`). Con `?mes=2025-08`, la tabla sigue en «May…Oct» de 2026, sin fila marcada, y su «Ago» parece agosto de 2025.
8. **No hay forma de ver una sede.** «CAYLA entera» es un chip que no se toca (`ImpuestosPanel.tsx:122`). El IGV se declara junto (un
   RUC), pero no se ve qué pone Trujillo, qué baja Lima con lo que compró para abrir ni qué pesa el Taller.
9. **No hay vuelta en la vista interna.** `?mes=…` es una vista de otro mes, pero no tiene `<Volver>` ni un «volver al mes que se
   declara». El título cambia a «IGV de agosto» y no hay cómo volver, salvo el menú.
10. **El título no es el del menú.** Dice «IGV de septiembre» (`ImpuestosPanel.tsx:117`), y el menú dice «Impuestos». La regla de
    cabecera (ADR-0220) pide el nombre del menú; el mes va como dato aparte.

**Leves**

11. **«Sin movimiento» se ve tachado**, como algo anulado (tono `apagado` de `Chip`, `lib/impuestos-reglas.ts:203`).
12. **El límite de 300 UIT dice «Esta cifra aparece cuando la base de datos esté al día»** (`ImpuestosPanel.tsx:298`). Es la base local
    atrasada, no un error de la pantalla, pero el mensaje no dice qué hacer ni a quién avisar.
13. **A 375 px las tres descargas ocupan tres filas antes de la respuesta.** La pantalla mide 4,6 alturas de teléfono.
14. **La cifra grande lleva centavos** («S/ 8,043.00») y las tarjetas no («S/ 8,043»).
15. **Lo mismo se dice tres veces:** la respuesta grande, la tarjeta «Saldo a favor para octubre» y la columna de la tabla.

### ¿Qué ya trae sede en la base local? (solo lectura, sin migraciones)

`fn_impuestos_panel` arma el IGV con `fn_impuestos_ventas` (comprobantes y ventas) y `fn_impuestos_compras` (`compras`,
`compra_notas_credito` y `comprobantes_produccion`). Ninguna devuelve sede **hoy**, pero casi todo lo necesario ya está guardado:

| De dónde sale | ¿Tiene sede? | Cómo |
|---|---|---|
| IGV de las ventas | **Sí** | `comprobantes.ubicacion_id` y `ventas.ubicacion_id` (local: 3 de 3 con sede) |
| IGV de las facturas de mercadería | **Sí, repartido** | La vista `compra_parte_por_tienda` ya reparte el subtotal **y el IGV** de cada factura por la tienda a la que llegó cada prenda (`compra_item_destinos`) |
| Notas de crédito de proveedor | Sí, por su factura | `compra_notas_credito.compra_id` → el mismo reparto |
| Gastos con factura | **Sí, o «toda la empresa»** | `gastos.ubicacion_id` (puede ser nulo: contador, publicidad, oficina) |
| Facturas del Taller (`comprobantes_produccion`) | No tiene columna | Son del Taller por naturaleza: se pueden atribuir al Taller sin guardar nada nuevo |
| Saldo a favor y renta a cuenta | **No aplica** | Son de CAYLA entera (un RUC). La renta por sede es solo una lectura: el 1 % de lo que vendió cada una |
| Límite de 300 UIT | Sí, por las ventas | Es de CAYLA entera; el reparto solo dice quién aporta cuánto |

**Conclusión:** separar por sede **no pide columnas nuevas**, sino una función de lectura nueva («IGV del mes por lugar») que junte esas
cuatro fuentes con su sede. Es trabajo de base y le toca decidirlo a Felipe (ver §3). Además, otra sesión trabaja la base de Finanzas
(ADR-0433, con el alcance `fn_ve_finanzas_de_todo`): hay que hacerlo con ella.

## 2. Las tres direcciones

Las tres comparten lo que pidió Felipe y lo que exige el ERP:
- **Selector de sede siempre a la vista:** «Todas las sedes» + Trujillo · Arequipa · Lima · Taller · Toda la empresa, cada una con
  lo que **pone** en el pago (o lo que lo **baja** con sus compras). Una sede elegida filtra toda la pantalla y queda en la URL.
- **Filtros que se ven puestos y se quitan:** «Sede: Lima ×», «Solo lo que mueve el IGV ×», «Sin pago registrado ×» y «Limpiar todo».
- **La flecha de vuelta en toda vista interna** (una sede, un mes abierto, un lugar), en la línea de sede de la cabecera.
- **Selector de mes arriba,** «‹ Septiembre 2026 ›», y al tocar el nombre se vuelve al mes que se declara. Cambiar de mes sube a la
  respuesta.
- **Una sola lista «Antes de declarar»** (arregla el 5): cada cosa con su lugar, la plata en juego y un solo botón que lleva a donde
  se arregla.
- **La cuenta siempre cierra:** IGV que cobraste − el de tus compras + 1 % de renta = lo que pagas, también con saldo a favor
  (arregla el 3).
- **El mes dice si está pagado** según lo registrado en Cuentas y dinero («Pagado el 19 de septiembre» o «Sin pago registrado»), sin
  afirmar lo que el sistema no sabe.
- **Orden del ERP:** cabecera → cifras → filtros y tabla en una tarjeta → nota en hueso. Todo el ancho (ADR-0462), y a 375 px sin
  scroll lateral (verificado). Las tablas pasan a tarjetas sin ancho mínimo (arregla el 4).
- **Solo tokens**, modo oscuro y movimiento de ADR-0136 (una vez, sin rebote; el único bucle es el punto de «faltan 5 días»).

| | Dirección | La idea | Para quién brilla |
|---|---|---|---|
| **A** | **La respuesta, por sede** | La v2 A mejorada: «El martes 20 le pagas S/ 9,290», con la cuenta al lado, y debajo **«¿Quién pone cuánto?»**, una barra que sale del cero (Trujillo y Arequipa hacia un lado; Lima, el Taller y la empresa hacia el otro). Al tocar una sede, la respuesta cambia a «Lima baja el pago en S/ 1,250». | El dueño cada mañana: se entiende en 5 segundos |
| **B** | **Mes por mes** | La pantalla abre con los 7 meses como tarjetas (pagado, sin pago registrado, por pagar o en curso). Al abrir uno sale su **expediente**: cuatro cifras, la cuenta y la tabla «Quién puso cuánto», con una fila por lugar y el total que se declara al pie. Volver lleva a los meses. | Quien lleva el orden y conversa con el contador |
| **C** | **Cada lugar, su cuenta** | Cinco «talones», uno por lugar, cada uno con su suma (cobró − descontó + renta = pone o baja), y abajo la raya y el total **= S/ 9,290**. Arriba se elige qué se suma: IGV y renta, solo IGV o solo renta. Al abrir un talón sale la vista del lugar: de dónde sale lo que descontó (por proveedor) y lo que puso mes a mes. | Quien quiere entender por qué Lima o el Taller bajan el pago |

**Lo que se aparta de la regla a propósito** (lo decide Felipe al elegir):
- La pieza única de mes (`<SelectorMes>`) deja fuera a Finanzas, que usa su combo. Aquí propongo `‹ mes ›` en la cabecera, porque el
  mes manda en toda la pantalla y hoy se elige al fondo (hallazgo 7).
- El título vuelve a «Impuestos», como el menú, y el mes pasa al selector (hallazgo 10).
- Las descargas: un solo botón primario, «Descargar paquete», y los dos registros en «Más», que aclara que **siempre son de CAYLA
  entera** (SUNAT recibe uno por RUC).

## 3. Lo que necesita base: decisiones de Felipe

1. **Una función de lectura «IGV del mes por lugar».** Junta `comprobantes.ubicacion_id`, `compra_parte_por_tienda`, `gastos.ubicacion_id`
   (nulo = toda la empresa) y `comprobantes_produccion` (= Taller). No cambia ninguna tabla ni ningún cálculo del IGV que se declara,
   y el total por lugar tiene que dar exactamente lo de `fn_impuestos_panel`, con una prueba que lo exija. **Se coordina con la sesión
   de ADR-0433** (no toco `fn_impuestos_igv_meses`).
2. **¿Quién ve la sede?** Hoy Impuestos es de CAYLA entera para quien tiene el módulo. ¿Una encargada de sede vería solo lo de su
   tienda (como Compras) o Impuestos sigue siendo solo de CAYLA entera? Afecta el alcance (`fn_ve_finanzas_de_todo`).
3. **El estado «pagado» de cada mes** sale del pago a SUNAT registrado en Cuentas y dinero. Para decir «Pagado el 19 de septiembre»
   hay que leer ese pago por mes declarado. Hoy la pantalla solo dice «sin pago registrado». Se coordina con la sesión de Cuentas y
   dinero.
4. **Lo que no existe y aparece en la maqueta como idea:** la detracción del alquiler, el estado del SIRE de compras y la fecha de pago
   por el último dígito del RUC. Venían de la v2. Hoy la base no los tiene: cada uno sería un paso aparte, y Felipe decide si entran.

## 4. Arreglos que no esperan al rediseño

Los graves (1 a 4) se arreglan sin base: el enlace, el estado «sin movimiento», el total en la cuenta y el ancho mínimo de la tabla.
Se pueden hacer apenas Felipe dé el OK, aunque elija otra dirección.
