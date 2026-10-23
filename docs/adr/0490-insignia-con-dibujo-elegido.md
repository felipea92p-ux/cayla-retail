# ADR-0490 — Una insignia puede llevar el dibujo que se elija al crearla (y cambiarlo después)

- **Fecha:** 2026-10-23 · **Estado:** aceptado (Felipe lo pidió el 2026-10-23, al cerrar ADR-0489). Código en la rama
  `claude/insignia-icono-elegible-6dc77a`. **La migración `20261023203000_insignia_con_dibujo_elegido.sql` NO está en producción** hasta que
  Felipe la apruebe y se pegue: **va ANTES de publicar la web** (la pantalla de Insignias lee la columna nueva).
- **Relacionados:** ADR-0489 (la ficha de la tienda muestra las insignias y su dibujo), ADR-0481 (Catálogo ▸ Insignias), ADR-0476 (la llave de las
  campañas), ADR-0161 (módulos y roles; el combo «Responsable»), ADR-0284 (guía de foco), ADR-0389 (guías interactivas), ADR-0195 (políticas y
  deadlocks), ADR-0446 (el logo en `packages/shared`: el patrón de dibujos compartidos).

## El problema

ADR-0489 llevó el dibujo de cada insignia a la tienda (la calabaza de Halloween en la ficha de la prenda). Pero en el ERP el dibujo sale **solo del
nombre** (`iconoDeInsignia`): hay una familia por concepto (calabaza, pastel, gato…) y todo nombre que no se reconoce cae en una etiqueta genérica.
Una campaña nueva —«Día del Padre»— se veía con la etiqueta en el ERP y en la tienda hasta que alguien tocara el código, y quien la creaba no tenía
cómo decir «quiero el pastel». Felipe: «implementa en el retail lo de poder elegir el ícono de una insignia al crearla».

## Lo que se decidió

1. **Una columna en la fila de la insignia:** `retail.etiquetas.icono` (texto, vacío = «según el nombre»). Todas las insignias que ya existen nacen con
   el vacío: **ninguna cambia de dibujo**. Elegir uno **manda sobre el nombre**; si el que se eligió ya no existe en el código, se dibuja por el
   nombre; y si el nombre tampoco se reconoce, la etiqueta (`dibujoDeInsignia`, en `packages/shared`, UNA regla para el ERP y la tienda).
2. **Se elige al crear y se cambia después.** «Nueva insignia» / «Nueva campaña» (Catálogo ▸ Insignias) trae el campo «Dibujo»: «Según el nombre»
   (que muestra lo que saldría con lo escrito: escribes «Halloween» y dice «Calabaza») y los 21 dibujos, en una cuadrícula (flechas del teclado,
   Espacio o Enter para elegir). El pase de cada insignia o campaña trae un botón **«Dibujo»** que abre el mismo selector con la firma del combo
   «Responsable». Sin él, un dibujo mal elegido sería permanente: Felipe pidió «al crearla», pero un error de un clic no se arregla con una
   migración.
3. **Una sola puerta para cambiarlo:** `retail.fijar_icono_etiqueta(p_etiqueta_id, p_icono)` (security definer, con la llave de cada etiqueta,
   `fn_puede_tocar_etiqueta`: una campaña, Campañas / Campañas de la tienda web / Insignias; otra insignia, Insignias). Quitar el dibujo es mandar
   `null`. Crear una insignia suelta con su dibujo es el alta directa de siempre (`insert`, atómica); una campaña se crea por `crear_campana`
   (que no cambia de firma) y su dibujo se fija enseguida por la misma función.
4. **La tienda recibe el dibujo elegido.** `fn_tienda_insignias` trae `{id, nombre, icono, descuento}`. Las insignias **con descuento** ahora vienen
   en la lista, marcadas `descuento: true`: la ficha **no las dibuja aparte** (su descuento sigue siendo el chip rojo, el de mayor %), pero el chip
   toma de ahí el dibujo que se eligió para ESA campaña (`dibujoDeLaCampana`). Sin esto, una campaña con descuento se vería con el dibujo de su
   nombre en la tienda y con el elegido en el ERP.
5. **Donde más se ve el dibujo, se ve el elegido:** el sello de tinta de cada pase (Catálogo ▸ Insignias), las tarjetas al elegir las insignias de una
   prenda (Nuevo producto y Editar producto) y la ficha de la tienda. Lo demás sigue por el nombre (ver «Lo que no hace»).

## DECIDÍ / DESCARTÉ / SE ROMPE SI

DECIDÍ: la clave del dibujo vive en la fila de la insignia, vacía por defecto; el vocabulario de claves vive en `packages/shared`
(`DIBUJOS_ELEGIBLES`, `NOMBRE_DEL_DIBUJO`, `dibujoElegido`).
DESCARTÉ: una tabla aparte «insignia_dibujos»: un join en cada lectura de insignias para un dato de 1 a 1 y sin historia propia.
DESCARTÉ: un CHECK con la lista de las 21 claves. Cada dibujo nuevo exigiría una migración (un `alter` sobre una tabla en uso) y la lista ya está
escrita, tipada y probada en `shared`. Con solo la FORMA (`^[a-z]{3,20}$`), lo peor que puede quedar guardado es una clave que el código ya no
conoce, y eso se dibuja por el nombre sin error. Costo: la base no impide una clave bien formada pero inexistente; la regla de la lista la exigen la
ruta (`dibujoElegido`) y la función de la tienda la ignora al leer.
DESCARTÉ: agregar `p_icono` a `crear_campana`: una sobrecarga más (la regla de una sola firma por función lo impide) o borrar y recrear la función con
otra firma para que la use una sola pantalla. Costo: crear una campaña con dibujo son DOS escrituras; si la segunda falla, la campaña existe y se
ve por su nombre, y la pantalla lo dice («El dibujo no se guardó»).
DESCARTÉ: que la base entregue a la tienda solo el dibujo de las insignias sin descuento y que el chip del descuento use siempre el nombre: dejaría el
dibujo del ERP y el de la tienda distintos en las campañas con descuento, que son las que más se miran.
SE ROMPE SI: se retira un dibujo de `shared` y quedan insignias con su clave (se ven por el nombre); o alguien agrega una familia a `REGLAS` sin su
dibujo (TypeScript lo impide: `DIBUJOS_DE_INSIGNIA` es un `Record` total) o a `DIBUJOS_ELEGIBLES` sin nombre o repetida (`lib/insignias-dibujos.test.ts`
lo rechaza); o se publica la web antes de pegar el SQL (la pantalla de Insignias no carga: el check «SQL pegado» exige pegar antes de fusionar).

## Cómo se hizo

- **Base** (`20261023203000`, una sola parte, idempotente): `alter table retail.etiquetas add column icono` + el CHECK de la forma; `fijar_icono_etiqueta`;
  `fn_tienda_insignias` escrita entera con `icono` y `descuento`. Sin políticas ni `drop trigger` (ADR-0195), `lock_timeout` 3 s. La tabla ya da
  INSERT y UPDATE a `authenticated` en todas sus columnas, así que la columna nace con ellos y **ningún permiso cambia**.
- **Retail:** `components/sellos/ElegirDibujoDeInsignia.tsx` (el selector: grupo de opciones de radio con teclado, tokens de color, claro y oscuro, 44 px de
  alto de toque), `DibujoInsignia.tsx` (el dibujo con `currentColor` y la superficie como «hueco»), `CambiarDibujoModal.tsx` (la hoja del pase), el campo en
  `NuevaEtiquetaModal`, el botón «Dibujo» y la ruta `POST/PATCH /api/productos/etiquetas` (que valida la clave y llama a la función). La guía de foco del
  modal nuevo, declarada; la guía interactiva de Insignias con su paso «Su dibujo» y su huella aceptada.
- **Tienda:** `lib/ficha.ts` lee `icono` y `descuento` (sin ellos —la base todavía sin la migración— todo sigue como antes) y `dibujoDeLaCampana`.
- **Tipos:** `packages/database/src/types.ts` con la columna y la función.

## Lo que no hace

- **El papel de la etiqueta de precio sigue por el nombre** (`IconoEtiquetaPapel`, `etiqueta-precio-reglas`): tiene sus propios dibujos de 34 mm y su
  palabra corta por familia; un dibujo elegido llevaría la palabra de otra familia. Si Felipe quiere que el papel lo siga, es otro cambio.
- **El alta al vuelo dentro de Nuevo producto** (la insignia que se propone mientras se llena una prenda) **no ofrece el dibujo**: nace por el nombre y se
  puede cambiar después desde su pase. Es otro flujo, con su propia hoja y su firma de mitad de alta.
- Nada sobre «Sorteo» al 100 % ni sobre insignias por talla (ADR-0489, siguen abiertas).

## Verificado

- **Postgres** (`pnpm pruebas:insignia-icono`, 24/24, cada escenario con ROLLBACK): la columna nace vacía y solo exige su forma; fijar, cambiar y quitar (null o
  vacío); forma inválida (`icono_no_valido`) y etiqueta que no existe; fijar lo mismo no escribe de nuevo; la llave (sin módulo ninguna de las dos;
  con Insignias, las dos; con Campañas, solo la campaña; `tienda_web` y `anon` no la llaman); crear una insignia con su dibujo nace aprobada; la ficha trae
  `{id, nombre, icono, descuento}` también como `tienda_web`, y una campaña con descuento viene marcada y con su dibujo; la migración se pega dos veces.
  `pruebas:tienda-insignias` (20/20) se ajustó al contrato nuevo.
- **Tienda y shared** (`lib/insignias-dibujos.test.ts`, `lib/ficha.test.ts`): lo elegido manda sobre el nombre, una clave desconocida, vacía o rara
  (`"toString"`, `"__proto__"`, números) cae al nombre, la lista de dibujos es total y sin repetidos, el chip del descuento toma el dibujo de su campaña.
- **Retail:** suite completa (593 archivos), `tsc`, candados de guía de foco, guías, colores, unificar y modo oscuro, `knip` y `knip:produccion`.
- **En el navegador, de punta a punta** (base local): crear una campaña llamada «Halloween» con el gato → se guarda `gato` y su sello es el gato (no la calabaza);
  «Dibujo» ▸ Calabaza → se guarda `halloween` y el sello cambia; con el teclado (flecha derecha, izquierda, la elección y el foco se mueven juntos; una sola
  opción entra con Tab); en la tienda, una insignia llamada «ZZ Halloween prueba» con el pastel elegido se ve con el pastel (no con la calabaza de su nombre) y
  una campaña con descuento y el gato elegido muestra el gato en el chip rojo. 375 px, claro y oscuro, sin desbordar; las baldosas de 44 px.

## Sin verificar

Producción (la migración no está pegada). `guias:recorrer` (esta Mac no tiene el navegador de Playwright) y `/chaos` sobre las dos hojas que guardan. Un teléfono real.
`pruebas:tienda-ficha`, `vitrina-looks` y `vitrina-web` ya tenían fallos por datos de la base local compartida (ADR-0489); no cambian con esto.

## Orden al desplegar

1. Pegar `20261023203000_insignia_con_dibujo_elegido.sql` en el SQL Editor, tal cual, de una vez (requiere `20261022203000` y `20261023182000`, ya en producción).
2. Verificar: `select icono from retail.etiquetas limit 1;` (la columna existe), y
   `select retail.fn_tienda_insignias('<un modelo con Halloween>'::uuid, null);` trae `icono` y `descuento` en cada insignia.
3. **Recién entonces** publicar la web (fusionar el PR). Con la web nueva y sin la columna, Catálogo ▸ Insignias, Nuevo producto y Editar producto no cargan.

## Lo que queda abierto

- **Insignias que ya existen:** todas siguen por el nombre; si Felipe quiere que «Estreno» lleve otro dibujo, lo cambia desde su pase.
- **Más dibujos:** agregar uno es escribirlo en `packages/shared/src/insignias-visual.ts` (su familia en `REGLAS` si debe reconocerse por nombre, el dibujo, su nombre y su
  lugar en `DIBUJOS_ELEGIBLES`); no pide migración.
