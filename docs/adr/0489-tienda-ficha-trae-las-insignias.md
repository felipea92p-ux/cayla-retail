# ADR-0489 — La ficha de la tienda muestra las insignias asignadas en Catálogo ▸ Insignias

- **Fecha:** 2026-10-23 · **Estado:** aceptado (Felipe lo pidió el 2026-10-23). Código en la rama `claude/cayla-product-badges-display-6dc77a`.
  **La migración `20261023182000_tienda_ficha_trae_las_insignias.sql` NO está en producción** hasta que Felipe la apruebe y se pegue; la
  tienda que la lee se puede publicar antes o después (ver «Orden»).
- **Relacionados:** ADR-0481 (Catálogo ▸ Insignias), ADR-0408 (la tienda online y su puerta `retail.tienda_*`), ADR-0403 y ADR-0486 (el
  descuento de campaña y las sedes donde rige), ADR-0293 (descuento por etiqueta), ADR-0195 (políticas y deadlocks), ADR-0370 (reemplazos
  anclados).

## El problema

Felipe, mirando la ficha de «Guantes Encaje» en la tienda: «si le asigno una insignia a una prenda, en la web de tienda no se muestra».
Era cierto. Sobre el nombre la ficha dibujaba tres cosas, ninguna de ellas la insignia asignada:

1. «Nuevo · llegó hace 3 días», que la tienda calcula por la primera llegada al piso (`fn_tienda_lo_nuevo`), **no** por la insignia «Nuevo»
   del ERP (en producción, 16 modelos la llevan marcada a mano).
2. «N.º 3 en más vendidos», que calcula la tienda.
3. El chip rojo del descuento («−30 % · Aniversario CAYLA»), que sale de la campaña que cobra la caja.

La tienda solo habla con la base por funciones `retail.tienda_*` y `tienda_ficha` no entregaba las insignias de la prenda: no había forma de
que las viera. Datos de producción del 2026-10-23: Halloween (15-sep al 31-oct, 34 modelos y toda la categoría Maquillaje), Top ventas,
Reedición, Últimas unidades, Estreno… asignadas, y ningún cliente las veía.

## Lo que se decidió

1. **La ficha trae `prenda.insignias = [{id, nombre}]`** (`retail.fn_tienda_insignias(modelo, tienda)`, interna; `tienda_ficha` la llama).
   Una insignia se ve si está **aprobada y activa**, **vigente hoy** (Lima; sin fechas, siempre; los dos extremos cuentan), **alcanza al
   modelo como lo dice la pantalla de Insignias** (marcada a mano en alguna de sus variantes que se ofrecen, o de TODA su categoría) y
   **rige en la tienda elegida** (`sedes_permitidas`; con «Todas», si es de alguna tienda de la web). Salen por grupo (Rotación, Artesanal,
   Campaña, General) y por nombre.
2. **Con descuento no se dibuja aparte.** Una insignia con `descuento_pct` no sale en la lista: su descuento ya es el chip rojo de la
   ficha, y ese chip es el de la campaña que mejor le conviene al cliente (`fn_tienda_precio_talla` elige por variante el mayor %, y
   `fn_tienda_precios` la que deja el menor precio). Con 3 insignias de 10, 20 y 30 %: se ve **una**, la de 30 %, y es exactamente la que
   baja el precio. Una campaña cuyo descuento no rige en esa tienda (`campana_sedes`) tampoco aparece sin su descuento.
3. **La cara es la de «Nuevo»** (Felipe: «el diseño predeterminado de las insignias»): el mismo chip de tinta con su destello
   (`.t-chip.insignia` comparte la regla de `.t-chip.nuevo`). Una sola cara para «lo que CAYLA le marcó a la prenda»; el chip rojo queda
   para el descuento.
4. **Lo que la tienda ya dice por sí sola no se repite:** la insignia «Nuevo» no sale si ya dice «Nuevo · llegó hace…» y «Top ventas» no
   sale si ya dice «N.º 3 en más vendidos» (`chipsDelCatalogo`: el nombre normalizado, sin tildes). Si la tienda no lo dice (llegó hace
   más de 30 días, o no está en el ranking), la insignia asignada se ve igual: es lo que la encargada marcó.
5. **Solo el detalle de la prenda** (lo que Felipe pidió): ni las tarjetas ni el catálogo cambian. Van entre «Nuevo» y «N.º … en más vendidos».

## DECIDÍ / DESCARTÉ / SE ROMPE SI

DECIDÍ: por **modelo**, no por talla: la ficha muestra una insignia si CUALQUIERA de las variantes que se ofrecen la lleva (o si es de su
categoría).
DESCARTÉ: entregar las insignias por variante y filtrarlas por la talla elegida. En el ERP se marca por modelo (con excepciones por
variante) y un chip que aparece y desaparece al elegir talla mueve el nombre de lugar; además, más bytes por ficha. Costo de lo elegido:
«Últimas unidades» marcada solo en una talla se lee en todo el modelo. Se puede sumar después sin romper este contrato (sería otro campo).
SE ROMPE SI: alguien reescribe `tienda_ficha` con el texto de antes de la migración (la ficha vuelve a no traer insignias, sin error: la
tienda tolera que falten; `pnpm pruebas:tienda-insignias` lo vigila), o si una insignia con descuento deja de ser la que cobra la tienda
(el chip rojo y la insignia dirían cosas distintas).

DECIDÍ: reemplazo **anclado** de una línea en `tienda_ficha` (el patrón de ADR-0370), con la lógica en una función nueva.
DESCARTÉ: reescribir `tienda_ficha` entera: ya la parcharon otras migraciones y producción puede tener una versión más nueva; el reemplazo
solo toca su línea y se detiene sin tocar nada si no la encuentra.
DESCARTÉ: sumar las insignias a `tienda_catalogo`: serían N insignias por tarjeta en cada lista, para un dato que solo se lee en la ficha.

DECIDÍ: dejar el chip rojo del descuento como estaba (Felipe no pidió cambiarlo y ya era el «mejor para el cliente»).
SE ROMPE SI: Felipe esperaba que el descuento también salga con la cara de «Nuevo»: es un cambio de CSS y de `FichaPrenda.tsx`, no de base.

## Qué se probó

- **Postgres** (`pnpm pruebas:tienda-insignias`, 20/20, cada escenario en su transacción con ROLLBACK): a mano en una variante, por
  categoría, la que no alcanza al modelo, desactivada, pendiente (propuesta por una integrante), vigencia (terminó, empieza mañana, los dos
  extremos), variante que ya no se ofrece, con descuento (no sale aparte; con 10, 20 y 30 % la ficha trae la de 30 % y ninguna como
  insignia), de ciertas tiendas (la 1, la 2, «Todas», una fuera de la web), orden por grupo, la ficha trae `{id, nombre}` también como
  `tienda_web`, ese rol **no** llama a la función interna, y la migración se pega dos veces.
- **`pruebas:tienda-ficha`:** su candado «nada del ERP en la ficha» (la lista exacta de claves) se actualizó con `insignias`; el resto da lo
  mismo con y sin la migración. **`pruebas:tienda-puerta` 36/36**, `pruebas:una-sola-firma`, `migraciones:versiones`,
  `migraciones:sin-drop-trigger`, `knip` y `knip:produccion`.
- **Tienda** (`apps/tienda`): 840 pruebas, `eslint` limpio (el `tsc` solo se queja de un archivo viejo de `.next/` de otra rama).
  Pruebas nuevas en `lib/ficha.test.ts`: leer las insignias (sin el campo, raras, repetidas), el orden de los chips y las dos deduplicaciones.
- **En el navegador, con la base local** (Postgres con la migración aplicada y datos de prueba borrados al terminar): Blusa Emma con
  Para liquidar, Hecho a mano, Reedición y Halloween (y «Top ventas» escondida porque la tienda ya dice «N.º 2 en más vendidos»); Casaca
  Ximena con dos campañas de 10 y 30 %: solo «−30 % · …» a S/ 125.90 (antes S/ 179.90) y «Hecho a mano», sin rastro del 10 %. A 1024 y
  a 375 px los chips bajan de línea sin desbordar.

## Sin verificar

Producción: la migración no está pegada. El CI completo de Postgres (en la base local compartida, `pruebas:tienda-ficha` ya tenía 12
fallos antes de esta migración, por datos de otras sesiones —tallas XS/XL de más, un precio propio de 81.00—, y quedan idénticos). Un
teléfono real. La ficha de una prenda con insignia «Nuevo» y con la llegada de hace más de 30 días se ve «Nuevo» sin «llegó hace…» (es lo
que se asignó); no hay una regla del negocio que diga lo contrario, pero tampoco se miró con Felipe.

## Orden al desplegar

1. Pegar `20261023182000_tienda_ficha_trae_las_insignias.sql` en el SQL Editor de producción, tal cual, de una vez (idempotente,
   `lock_timeout` 3 s, sin políticas ni `drop trigger`; si `tienda_ficha` no es la revisada, se detiene sin tocar nada).
2. Publicar la tienda. El orden entre las dos no importa: la tienda vieja ignora el campo nuevo y la nueva tolera que falte (la lectura de la
   ficha se comparte 30 s entre visitas, así que una insignia nueva tarda hasta 30 s en verse).
3. Comprobar en producción: `select retail.tienda_ficha('<un modelo con Halloween>'::uuid, null) -> 'prenda' -> 'insignias'` (como el rol
   de la tienda) y abrir la ficha de ese modelo.

## Lo que queda abierto

- **Insignia «Sorteo» al 100 %** (en producción, sin fechas, en 1 variante de «Blusa con Lazo», hoy sin publicar): si ese modelo se
  publica, la regla de precio que ya existía mostraría «−100 % · Sorteo». No es de esta decisión, pero «el descuento que más beneficia al
  cliente» la elegiría siempre. Conviene fijarle fecha o sacarla de las prendas que se publican.
- **Insignias por talla** (ver el primer DESCARTÉ): se puede sumar si «Últimas unidades» debe seguir la talla elegida.

## Actualización 2026-10-23 (b) — cada insignia lleva su dibujo, el mismo del ERP

Felipe, mirando el pase de Halloween en Catálogo ▸ Insignias (la calabaza dentro del sello): «aparte del nombre quiero que aparezca también su
imagen, por ejemplo en la insignia de Halloween, además de decir Halloween ponga también la calabaza, tal y como se configura en el retail».

- **Qué se ve.** Cada chip de la ficha lleva a la izquierda el dibujo de su insignia: la calabaza de Halloween, el pastel de Aniversario, el gato,
  las flechas de Reedición, la aguja de Hecho a mano, la etiqueta con «%» de Para liquidar… Una insignia cuyo nombre no es de ninguna familia
  (Estreno) lleva el dibujo genérico de una etiqueta, como en el ERP. También lo lleva el chip rojo del descuento (el pastel en «−30 % ·
  Aniversario CAYLA») y «Nuevo · llegó hace…» (el destello del ERP en vez del contorno que tenía la tienda). Trazo y relleno son del color del chip y
  lo «recortado» (la cara de la calabaza) es el fondo del chip, en claro y en oscuro.
- **No hay un «ícono configurado» por insignia.** En el ERP el dibujo sale del NOMBRE (`iconoDeEtiqueta`: una familia por concepto; un nombre
  que no se reconoce cae en el genérico): no hay una columna ni una pantalla donde se elija. Una insignia nueva con el nombre «Día del Padre» se
  ve con la etiqueta genérica en el ERP y en la tienda hasta que alguien le agregue su familia (ver «Lo que queda abierto»).

DECIDÍ: mover el vocabulario y los dibujos a `packages/shared/src/insignias-visual.ts`, como DATOS (no React), y que el ERP y la tienda los
pinten cada uno en su marco. Es el mismo patrón del logo (`marca.ts`, ADR-0446). La tienda no puede importar de `apps/web`.
DESCARTÉ: copiar los 21 dibujos a la tienda. Dos copias se separan sin avisar: el día que alguien retoque la calabaza en el ERP, la tienda
quedaría con la vieja; es exactamente «dos partes que resuelven lo mismo de dos formas».
DESCARTÉ: que la base entregue el nombre del dibujo (`icono` dentro de `fn_tienda_insignias`): sería una tercera copia de las reglas por nombre, en SQL.
DESCARTÉ: un ícono de la tienda dibujado por ella (como el `chispa` de antes): no sería «tal y como se ve en el retail».
SE ROMPE SI: alguien agrega una familia en `REGLAS` y no en `DIBUJOS_DE_INSIGNIA` (TypeScript lo impide: el `Record` es total); un dibujo
nuevo trae un color suelto (`lib/insignias-dibujos.test.ts` lo rechaza: hex, rgb, hsl o var); o el ERP y la tienda dejan de pintar los
atributos en el mismo orden (el pintor de cada app lo respeta; ver abajo).

**El cambio en el ERP no cambia nada de lo que se ve.** `components/MuestraEtiqueta.tsx` ya no trae los 21 dibujos: los lee de `shared` y los
pinta (`pintar`). `lib/etiqueta-visual.ts` conserva `iconoDeEtiqueta` y `IconoEtiqueta` (ahora vienen de `shared`) y su `rotuloDeEtiqueta` del papel
de la etiqueta de precio: los demás archivos que los importan (el sello de tinta, el papel de la etiqueta de precio…) no se tocaron. **Verificado byte a byte:** antes de mover nada se guardó el SVG que
dibujaba cada familia (21 nombres × 3 colores = 63 dibujos) y después de moverlo es idéntico carácter por carácter, con la comparación probada
para que falle ante un cambio de una décima (`rx` de 12.5 a 12.4). Esa comparación fue de una sola vez (archivos temporales, ya borrados); la que
queda en el repo es el candado de colores sueltos y `lib/etiqueta-visual.test.ts` (el reconocimiento por nombre, que ahora corre sobre `shared`).

**Tienda:** `components/IconoInsignia.tsx` pinta el dibujo (`currentColor` y `var(--ins-hueco)`), `lib/ficha.ts` decide cuál (`dibujoDeLaInsignia`, el
mismo reconocimiento por nombre del ERP) y `app/estilos/ficha.css` da a cada cara de chip su `--ins-hueco` (el fondo del chip: tinta, hueso, o el
tinte rojo del descuento sobre el muro).

Verificado en el navegador (local, claro y oscuro, 1024 y 375 px): Blusa Emma con Para liquidar, Hecho a mano, Reedición y Halloween (la calabaza
con su cara recortada); Casaca Ximena con «−30 % · ZZ Aniversario prueba» con el pastel; sin desbordar a 375 px. Suite del ERP (592 archivos),
`tsc` del ERP, la tienda y `shared`, `eslint`, `knip` y `knip:produccion` en verde. Sin mirar: un teléfono real.

### Lo que queda abierto (de esta actualización)

- **Una insignia nueva no tiene dibujo propio:** las familias están escritas en `shared` (20 + la genérica). Que un Líder pueda elegir el dibujo
  de una insignia al crearla sería una columna en `retail.etiquetas` y un selector en «Nueva insignia»: no se hizo (Felipe no lo pidió y toca el
  modelo de datos). Mientras, para que «Día del Padre» tenga su dibujo hay que agregar la familia en `insignias-visual.ts`.

## Actualización 2026-10-23 (c) — las tarjetas del catálogo también las muestran: hasta 3 y un «+N»

Felipe, con la ficha ya publicada: «ahora también quiero implementarlo en las tarjetas del catálogo, pero para no llenarlas, como máximo 3 insignias (todas
en la parte superior) y, si tienen más, un cuadro que diga cuántas más, por ejemplo +2; en Lima, las insignias de CAYLA y Claurè no cuentan para el
máximo. El resultado es el de la imagen, ajustando el diseño al de las demás insignias» (la imagen: la columna NUEVO / CAYLA a la izquierda y, a su
derecha, «INSIGNIA», «INSIGNIA» y «+2»).

- **Qué se ve.** Arriba de la foto, UNA sola fila con todo: el descuento, «Nuevo», el puesto en Más vendidos, las insignias asignadas en Catálogo ▸ Insignias
  (con la misma cara de las demás: versalitas chicas sobre papel, sin ícono) y al final el «+N» con las que no caben (al pasar el mouse dice cuáles). **Solo la
  empresa (CAYLA o Claurè, en Lima) baja: va sola, debajo de la fila.** El nombre de la prenda las dice todas para el lector de pantalla.
- **El tope es 3 EN TOTAL, y solo la empresa queda fuera.** El descuento, «Nuevo» y el puesto cuentan igual que las asignadas: así la imagen de Felipe
  (NUEVO + 2 insignias + «+2») es exactamente 3 contadas. Si lo propio de la tarjeta ya llena el tope, ninguna asignada se dibuja y todas van al «+N».
  Lo que la tienda ya dice por sí sola no ocupa lugar (la insignia «Nuevo» si la prenda ya es nueva; «Top ventas» si la tarjeta ya dice su puesto).
  El tope vive en un solo número (`TOPE_DE_INSIGNIAS_EN_LA_TARJETA`).
- **Una sola fila, y solo lo que cabe entero.** Felipe pidió «todas las insignias ajustadas a una sola fila» (la primera versión las dejaba envolver en dos
  filas y, en el celular, bajar debajo de la columna propia). Sobre una foto de 165 px (el celular a 2 columnas) no caben tres nombres, y una insignia cortada a
  la mitad («P…») no dice nada; por eso cada tarjeta muestra las insignias que caben ENTERAS en su ancho y cuenta el resto en el «+N» (`FilaDeInsignias`: mide en el
  navegador una copia invisible de la fila y se vuelve a medir si la tarjeta cambia de ancho; `cuantasCaben`, `lib/insignias.ts`, es la parte pura con su prueba).
  En tarjetas de menos de 380 px la letra de la fila es más chica (consulta de contenedor). Resultado medido: 409 px (escritorio) caben las 3 y el «+N»; 289 px
  (1024 de ancho) y 216 px (tablet) caben casi siempre dos o tres; 165 px (celular) caben «Nuevo» y el «+N», o «Nuevo» y una insignia corta. Antes de medir (el HTML del
  servidor, o sin JavaScript) se ven las 3 del tope y el CSS achica con «…» lo que no cabe.
- **La base** (`20261023205000`): el catálogo trae `insignias` en cada prenda (`[]` si no tiene). La regla sigue siendo UNA —la de este ADR— pero ahora
  escrita POR LOTE (`fn_tienda_insignias_de`: una pasada para todo el catálogo) y la de la ficha (`fn_tienda_insignias`) la llama con un solo modelo.
  El catálogo le pasa las tiendas de la web que ya conoce: una prueba vieja (`20261015215000`) exige que se pregunte por ellas una sola vez por carga.

DECIDÍ: una función por lote que llaman el catálogo y la ficha. DESCARTÉ: llamar la de un modelo por cada prenda del catálogo (N consultas por carga;
`20261017173000` reescribió el catálogo para que nada se calcule por prenda) y dejar la regla escrita dos veces (el catálogo y la ficha dirían cosas
distintas de la misma prenda). DESCARTÉ: que la base corte en «3 y +N»: depende de lo que la tarjeta ya dice, que solo sabe la tienda.
SE ROMPE SI: se reescribe `tienda_catalogo` con el texto de antes (el catálogo vuelve a no traer insignias, sin error), si la tarjeta dibuja un tipo
nuevo de insignia propia y no la cuenta en `insigniasDeTarjeta` (el tope dejaría de ser 3), o si una chip nueva de la fila no lleva la clase `t-insignia` (la
copia con que se mide no la vería y la fila se pasaría del ancho).

**Interpretación a confirmar.** «Máximo 3 insignias» lo leí como 3 de TODO lo que dice la foto salvo la empresa (descuento, Nuevo, puesto y asignadas), que
es lo que muestra la imagen y lo que evita llenar la tarjeta. Si Felipe quiso 3 solo de las asignadas, es cambiar `propias` a 0 en
`insigniasAsignadasDeTarjeta`.

Cuatro pruebas vecinas de base se actualizaron porque el catálogo ganó una clave y una unión: `tienda-inicio` (la lista de claves y la cuenta de
«tiendas de la web, una vez por carga») y `tienda-rapida` (el JSON «de antes» ya no cuenta `insignias`, y el segundo pegado de `20261017173000` parte
de la función sin esta pieza). Verificado: `pnpm pruebas:tienda-insignias` 34/34 (con el lote contra la regla de antes copiada como ORÁCULO, en
2 prendas × 3 tiendas), `tienda-inicio` 21/21, `tienda-rapida` 15/15, `tienda-puerta`, `tienda-club`, `tienda-empresas`, `tienda-bolsa` y
`una-sola-firma`; la tienda: 868 pruebas, `tsc`, `eslint` y `knip`. En el navegador (local, 1440, 1024, 768 y 375 px; Lima y Trujillo): prendas con 0, 1, 2 y 5 insignias,
con descuento, con «Nuevo», con CAYLA (Lima) y un nombre largo: en todos una sola fila, ninguna cortada a la mitad y la empresa sola debajo. Sin mirar: un teléfono real, y la lista «Más vendidos» con puesto (cubierta por prueba
unitaria).

### Orden al desplegar (la migración del catálogo)

Pegar `20261023205000_tienda_catalogo_trae_las_insignias.sql` en producción DESPUÉS de `20261023182000` (ya está); una sola parte, idempotente. La tienda
funciona antes o después. Comprobación: `select retail.tienda_catalogo(null) -> 'prendas' -> 0 ? 'insignias'` (debe dar `true`) y abrir el catálogo.
