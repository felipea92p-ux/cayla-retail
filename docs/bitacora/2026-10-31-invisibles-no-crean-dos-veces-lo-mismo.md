# 2026-10-31 — Un carácter que no se ve ya no crea dos veces la misma cosa

**QUÉ HICE.** Copiar un nombre de una página web, de un WhatsApp o de un PDF arrastra caracteres que no se ven. La
clave con la que la base decide si dos nombres son EL MISMO no los quitaba, así que «Botón ZW» y «Botón ZW» —el
segundo con un espacio de ancho cero adentro— entraban como **dos fichas del mismo botón**, con el stock partido, y
el candado no decía nada. Ahora la base los trata como el mismo nombre y rechaza el segundo. Vale para TODO el
vocabulario del catálogo: colores, tallas, marcas, categorías, familias, tejidos, patrones, etiquetas, proveedores,
materiales, insumos, clases de avío, los looks de la vitrina y el calendario del plan.

**POR QUÉ ASÍ.** Porque era **una causa y dos pantallas**: `/chaos` lo encontró el 30-oct en Catálogo ▸ Atributos y
el 31-oct en «Nuevo avío». Arreglarlo pantalla por pantalla habría dejado abierta la tercera. Se arregló donde nace:
en `retail.fn_clave_texto` y en su espejo de la web (`claveTexto`), que existen justamente para decir lo mismo. Los
invisibles se quitan **antes** de juntar los espacios, porque uno metido entre dos dejaría un espacio doble si se
quitara después.

**QUÉ SE ROMPERÍA SIN ESTO.** Stock partido en dos fichas que a la vista son la misma, y nadie lo nota: las dos se
ven idénticas en la lista. Se descubre contando a mano, cuando el sistema dice que hay 40 botones y en el cajón hay
80 repartidos entre dos códigos. Y la promesa de ADR-0576 —«el nombre igual lo frena la base»— era falsa: bastaba un
carácter invisible para pasar por encima del candado.

---

## Lo que costó, y es lo que hay que recordar

Cambiar una función `IMMUTABLE` obliga a **rehacer los 16 índices únicos** que cuelgan de ella: Postgres guarda en el
índice el valor que la función devolvía al escribir cada fila, así que si solo se cambia la función, los índices se
quedan con las claves viejas y el candado deja de frenar lo que debería — **sin un solo error a la vista**.

El primer intento usó `reindex`, y por poco sale mal. Medido:

| Cómo se corre | Qué hace `reindex` |
|---|---|
| En **una misma transacción** (el SQL Editor de producción, y como el CI aplica cada migración) | reconstruye con la función **cacheada**, o sea la vieja: pasa en verde sin hacer nada, y **no avisa** si quedan dos claves iguales |
| En una sesión aparte | usa la función nueva y falla correctamente: `could not create unique index … is duplicated` |

O sea: pegada en el SQL Editor, la versión con `reindex` habría dejado la función nueva y los 16 índices con las
claves viejas, en silencio. La migración usa **`drop index` + `create index`**, que se planifica desde cero y evalúa
la función de verdad en los dos casos. Los 16 son índices sueltos: ninguno respalda una constraint (comprobado, y la
migración se detiene si algún día alguno lo hiciera).

## Cómo se verificó

Primero las pruebas, y fallaron por el bug: la de la web (8 invisibles × 4 posiciones) y la de la base
(`pruebas:clave-texto-invisibles`, **2 de 15 en verde** contra la versión vieja). Después el arreglo, y las dos en
verde. Lo que prueba el caso que importa no es la función sino el candado: **la base RECHAZA un segundo color cuyo
nombre solo se diferencia por un invisible** — antes lo aceptaba, medido en las dos direcciones.

En una base al día, con la migración:

| Ensayo | Resultado |
|---|---|
| Una sola corrida (como el CI y el SQL Editor) | 16 índices rehechos · 15/15 |
| Otra vez encima (idempotente) | 16 rehechos · 15/15 |
| Con dos filas que solo se diferencian por un invisible | se niega nombrando el índice, **no aplica nada**, los datos quedan intactos |
| Sin ningún índice sobre la clave | se niega: «algo no cuadra» |

**165 183 pruebas** de la web en verde, `typecheck`, `knip`, `knip:produccion`, `lint`, `migraciones:versiones` (la
reserva `20261031200000` es de esta rama) y `adr:numeros`.

## En producción desde el 2026-10-31

Felipe la pegó el mismo día y la comprobación dio lo esperado: `los_junta: true · indices: 16`. **Y el solo hecho de
que entrara prueba algo que no se podía saber antes:** la migración se niega si encuentra dos filas que solo se
diferencian por un carácter invisible, así que **en producción no había ningún duplicado de ese tipo guardado**. No
hubo que decidir nada sobre datos existentes, que era el único punto que podía frenar esto.

## Lo que NO hace, dicho sin adornos

- **No corrige lo que ya existe.** Si hoy hubiera dos filas que solo se diferencian por un invisible, la migración se
  niega y dice en qué índice: cuál de las dos se queda es una decisión del negocio, no técnica. La **sonda de solo
  lectura** que lo averigua antes está en el PR (probada con datos sucios: no está ciega).
- **No toca el «casi igual».** Blanco y Crudo siguen siendo dos colores, y «Verde olivo» / «Verde oliva» siguen
  resolviéndose con la pregunta de ADR-0576, que no bloquea. Eso es a propósito.
- **No pude leer producción:** el conector lo niega desde el 28-oct. Por eso la sonda la corre Felipe.
