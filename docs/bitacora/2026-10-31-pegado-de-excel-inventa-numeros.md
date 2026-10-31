# 2026-10-31 — Pegar tres celdas de Excel en una cantidad inventaba un número

**QUÉ HICE.** Hasta hoy, copiar una columna de una hoja de cálculo y pegarla en un campo de cantidad o de plata del
ERP no daba error: lo pegado se convertía en UN número. Tres celdas con 12, 8 y 5 entraban como **1 285 unidades**,
con su lote de saldo inicial de **S/ 642.50**, sin aviso y sin borde rojo. Ahora el campo lo rechaza y dice cómo
escribirlo, y el botón de guardar se apaga. Lo que sí sigue valiendo es el separador de miles: «1 200» son mil
doscientos, como siempre.

**POR QUÉ ASÍ.** Los dos lectores de cifras del ERP empezaban borrando TODO espacio en blanco antes de mirar lo
escrito. Ese borrado estaba puesto a propósito y por una buena razón —para que «1 200» se lea 1200—, pero no
distinguía un separador de miles de un pegado de varias celdas. Antes de escribir una sola línea medí en el
navegador qué llega de verdad al campo: pegar FILAS de una hoja de cálculo deja espacios ordinarios («12 8 5»), o
sea que el salto de línea nunca llega y rechazarlo no habría servido de nada; pegar COLUMNAS deja la tabulación
literal; y un copiado de la web deja el espacio no-rompible, que es un separador de miles de verdad y tenía que
seguir valiendo. Por eso la regla nueva es de **forma** y no de carácter: un espacio adentro solo vale si separa
grupos de **tres** cifras. «1 200» sí; «12 8 5» y «1 20», no. Y vive en un solo lugar
(`apps/web/lib/numero-escrito.ts`), del que ahora dependen los tres lectores, en vez de repetir el mismo borrado
en cada uno.

**QUÉ SE ROMPERÍA SIN ESTO.** Stock y plata inventados que **ningún detector puede ver**. El número que entra es
perfectamente coherente consigo mismo: el lote cuadra con su libro, el saldo cuadra con el lote, y las 26
invariantes de `/chaos` pasan en verde con 1 285 botones fantasma adentro. Solo se descubre contando a mano, meses
después, cuando el valor del inventario no cuadra y nadie sabe de dónde salió. Y un botón mal contado no se queda
en el almacén: entra al costo de la prenda que lo lleva.

---

**Lo encontró `/chaos`** en su segunda corrida sobre «Nuevo avío» (semilla 1496): gravedad 2, «dato malo en
silencio», el primero de ocho hallazgos. Felipe eligió arreglar este primero.

**Verificado**, en este orden (el que pide el protocolo de `/chaos`):

1. **La prueba de regresión primero, y falló** por el bug: con la regla nueva escrita pero los lectores todavía
   sin usarla, los tres —cantidad, monto y costo por unidad— seguían inventando el número.
2. **Después el arreglo**, y la prueba pasó. `lib/numero-escrito.test.ts` cubre las dos direcciones: que el pegado
   no entre y que el separador de miles no se pierda.
3. **El mismo ataque, repetido en el navegador** contra una base privada al día, con login real de líder en el
   Taller:

| | Antes | Ahora |
|---|---|---|
| Pegar «12 ⏎ 8 ⏎ 5» en «¿Ya tienes?» | 1 285 unid. · S/ 642.50, sin aviso | «No se entiende la cantidad: escríbela así, 48.2 o 48,2.», botón apagado y la guía de foco lo lista en «Falta» |
| Forzar el envío quitándole el candado al botón | — | la hoja no se cierra y la base queda en 0 |
| Escribir «1 200» y guardar | 1 200 unid. | 1 200 unid. (`cantidad_ingresada = 1200.000`, verificado en la base) |

Toda la suite de la web en verde: **164 841 pruebas**, 754 archivos. `typecheck`, `knip` y `knip:produccion`
limpios. La base se restauró a su foto («idéntica, 304 tablas, ninguna cambió») y las 26 invariantes quedaron en
verde.

**Lo que NO toqué, a propósito:** los otros dos sitios con el mismo borrado de blancos
(`lib/precio-sede-reglas.ts` y `lib/balance-reglas.ts`, este último el que lee un extracto bancario pegado, donde
un pegado de varias celdas es lo normal y la regla tendría que ser otra). Son precios y dinero de otras pantallas:
quedan anotados en el backlog para que los decidas tú.
