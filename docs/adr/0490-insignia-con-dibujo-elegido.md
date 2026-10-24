# ADR-0490 — Una insignia puede llevar el dibujo que se elija, o una imagen propia (al crearla y después)

- **Fecha:** 2026-10-23 · **Estado:** aceptado (Felipe lo pidió el 2026-10-23, al cerrar ADR-0489; el mismo día pidió quitar «Según el nombre» y permitir
  subir una imagen propia). Código en la rama `claude/insignia-icono-elegible-6dc77a` (PR #1300). **Las dos migraciones —`20261023203000_insignia_con_dibujo_elegido.sql`
  y `20261023213000_insignias_almacen_de_imagenes.sql`— están en producción desde el 2026-10-23** (pegadas a pedido de Felipe y verificadas, ver «Orden al
  desplegar»): iban ANTES de publicar la web porque la pantalla de Insignias lee las columnas nuevas y sube al almacén nuevo.
- **Relacionados:** ADR-0489 (la ficha de la tienda muestra las insignias y su dibujo), ADR-0481 (Catálogo ▸ Insignias), ADR-0476 (la llave de las
  campañas), ADR-0161 (módulos y roles; el combo «Responsable»), ADR-0284 (guía de foco), ADR-0389 (guías interactivas), ADR-0195 (políticas y
  deadlocks), ADR-0446 (el logo en `packages/shared`: el patrón de dibujos compartidos), el camino de las imágenes de las campañas (`campana-imagen.ts`).

## El problema

ADR-0489 llevó el dibujo de cada insignia a la tienda (la calabaza de Halloween en la ficha de la prenda). Pero en el ERP el dibujo sale **solo del
nombre** (`iconoDeInsignia`): hay una familia por concepto (calabaza, pastel, gato…) y todo nombre que no se reconoce cae en una etiqueta genérica.
Una campaña nueva —«Día del Padre»— se veía con la etiqueta en el ERP y en la tienda hasta que alguien tocara el código, y quien la creaba no tenía
cómo decir «quiero el pastel». Felipe: «implementa en el retail lo de poder elegir el ícono de una insignia al crearla». Y, al ver el selector: los
21 dibujos son código (vectores en `packages/shared`), no archivos; si ninguno sirve, **quien crea la insignia tiene que poder subir el suyo**.

## Lo que se decidió

1. **Dos columnas en la fila de la insignia, y nunca las dos a la vez:** `retail.etiquetas.icono` (la clave de uno de los dibujos de la lista) e
   `icono_imagen` (la RUTA de una imagen propia en el almacén). Todas las insignias que ya existen nacen con las dos vacías: **ninguna cambia**, siguen
   por su nombre. Manda, en este orden: la imagen propia → el dibujo elegido → el del nombre → la etiqueta genérica (`dibujoResuelto`, en
   `packages/shared/src/insignia-imagen.ts`: UNA regla para el ERP y la tienda). Un dato raro nunca rompe: cae al siguiente.
2. **No hay «Según el nombre».** Felipe lo quitó: era un botón que confundía («¿de dónde salen esos íconos?»). El selector ya trae **marcado** el dibujo que
   sugiere el nombre mientras se escribe («Halloween» marca la calabaza; con «Día del Padre» marca la etiqueta) y dice «Sugerido por el nombre: …»; la persona
   elige otro o sube el suyo. Una insignia que ya existía y nunca eligió se abre en su pase con el dibujo de su nombre marcado.
3. **Se elige al crear y se cambia después.** «Nueva insignia» / «Nueva campaña» (Catálogo ▸ Insignias) traen el campo «Dibujo»: los 21 dibujos en una
   cuadrícula (flechas del teclado, Espacio o Enter), y debajo **«Subir tu imagen»**. El pase de cada insignia o campaña trae un botón **«Dibujo»** que abre
   el mismo selector con la firma del combo «Responsable»; sin él, una imagen o un dibujo mal elegido sería permanente.
4. **La imagen se reduce en el navegador y va directo al almacén**, como las imágenes de las campañas: PNG, JPG o WebP de hasta 15 MB de entrada (**sin
   SVG a propósito**: puede traer código y no se adapta al tema) → un WebP cuadrado de 256 × 256 px y 100 KB o menos, entera (nada se recorta; si no es
   cuadrada, queda con margen transparente y se avisa), en el almacén público `retail-insignias`. La base guarda solo la ruta
   `insignias/<insignia>/<archivo>.webp`; cada archivo tiene un nombre nuevo (nunca se pisa uno).
5. **Una sola puerta para fijar el dibujo:** `retail.fijar_icono_etiqueta(p_etiqueta_id, p_icono, p_imagen)` (security definer, con la llave de cada etiqueta,
   `fn_puede_tocar_etiqueta`: una campaña, Campañas / Campañas de la tienda web / Insignias; otra insignia, Insignias). Fijar uno **borra el otro**;
   mandar los dos vacíos es volver al nombre. Crear una insignia suelta con su dibujo es el alta directa de siempre (`insert`, atómica). **Una imagen propia
   necesita que la insignia ya exista** (su ruta lleva su id), así que el orden es: crear → subir → fijar la ruta. Una campaña se crea por `crear_campana`
   (que no cambia de firma) y su dibujo o imagen se fija enseguida por la misma función.
6. **Quién puede subir:** el almacén `retail-insignias` acepta la subida de quien pasa `fn_puede_campanas()` (el módulo Insignias o Campañas, o el líder),
   la misma regla que el de las campañas.
7. **La tienda recibe lo elegido.** `fn_tienda_insignias` trae `{id, nombre, icono, imagen, descuento}`. Las insignias **con descuento** vienen en la lista
   marcadas `descuento: true`: la ficha **no las dibuja aparte** (su descuento sigue siendo el chip rojo, el de mayor %), pero el chip toma de ahí el dibujo o
   la imagen de ESA campaña. La imagen se dibuja como `<img>` de 18 px sobre una baldosa crema (la imagen trae sus colores y puede ser oscura o transparente).
8. **Donde más se ve, se ve lo elegido:** el sello de tinta de cada pase y la tarjeta de la campaña (Catálogo ▸ Insignias y Tienda web ▸ Campañas), las tarjetas al
   elegir las insignias de una prenda (Nuevo producto y Editar producto) y la ficha de la tienda. Lo demás sigue por el nombre (ver «Lo que no hace»).

## DECIDÍ / DESCARTÉ / SE ROMPE SI

DECIDÍ: dos columnas excluyentes (clave de dibujo / ruta de imagen) en la fila de la insignia; el vocabulario de claves y la regla de qué manda viven en
`packages/shared`; la imagen, como la de las campañas: reducida en el navegador, directa al almacén público, solo la ruta en la base.
DESCARTÉ: una tabla aparte «insignia_dibujos»: un join en cada lectura para un dato de 1 a 1 y sin historia propia.
DESCARTÉ: un CHECK con la lista de las 21 claves. Cada dibujo nuevo exigiría una migración (un `alter` sobre una tabla en uso) y la lista ya está escrita,
tipada y probada en `shared`. Con solo la FORMA (`^[a-z]{3,20}$`), lo peor que puede quedar guardado es una clave que el código ya no conoce, y eso se
dibuja por el nombre sin error. En cambio **la ruta de la imagen sí lleva candados** (su forma, que sea de ESA insignia y que no convivan con un dibujo): una
ruta suelta apuntaría la imagen de una insignia a la de otra o fuera del almacén.
DESCARTÉ: no construir la subida (la recomendación inicial: 21 dibujos y pedir uno nuevo a quien programa). Felipe eligió lo contrario: quien crea una campaña
tiene que poder usar su propia imagen sin esperar un despliegue. Costo: un almacén nuevo, una política más y los archivos que quedan sin dueño.
DESCARTÉ: aceptar SVG como imagen propia: un SVG puede traer scripts, y como imagen no se adapta al modo oscuro. Costo: quien tiene su logo en vector lo
exporta a PNG.
DESCARTÉ: agregar `p_icono` a `crear_campana`: una sobrecarga más (la regla de una sola firma por función lo impide) o borrar y recrear la función con otra
firma para que la use una sola pantalla. Costo: crear una campaña con dibujo son DOS escrituras (y con imagen, tres); si una falla, la campaña existe y se ve por su
nombre, y la pantalla lo dice («El dibujo no se guardó» / «La imagen no se guardó»).
DESCARTÉ: borrar el archivo anterior al cambiar la imagen. Exigiría una función de borrado con su propia política y un fallo a medias dejaría la insignia sin
imagen. Costo: cada cambio deja un archivo de ≤ 100 KB sin dueño en el almacén; limpiarlos es una tarea de mantenimiento, no de cada guardado.
DESCARTÉ: que la base entregue a la tienda solo el dibujo de las insignias sin descuento y que el chip del descuento use siempre el nombre: dejaría el dibujo
del ERP y el de la tienda distintos en las campañas con descuento, que son las que más se miran.
SE ROMPE SI: se retira un dibujo de `shared` y quedan insignias con su clave (se ven por el nombre); o alguien agrega una familia a `REGLAS` sin su dibujo
(TypeScript lo impide: `DIBUJOS_DE_INSIGNIA` es un `Record` total) o a `DIBUJOS_ELEGIBLES` sin nombre o repetida (`lib/insignias-dibujos.test.ts` lo rechaza); o
se publica la web antes de pegar el SQL (la pantalla de Insignias no carga y la subida pide un almacén que no existe: el check «SQL pegado» exige pegar antes de
fusionar); o el proyecto de producción no tiene el Storage activo (la política y el bucket de `213000` fallan); o la tienda se despliega sin `TIENDA_FOTOS_ORIGEN`
(los chips con imagen caen al dibujo del nombre, sin error).

## Cómo se hizo

- **Base** (`20261023203000`, una sola parte, idempotente): `alter table retail.etiquetas add column icono` e `icono_imagen` + los CHECK (forma de la clave, forma
  de la ruta, la imagen es de la propia insignia, o dibujo o imagen); `fijar_icono_etiqueta`; `fn_tienda_insignias` escrita entera con `icono`, `imagen` y
  `descuento`. Sin `drop trigger` (ADR-0195), `lock_timeout` 3 s. La tabla ya da INSERT y UPDATE a `authenticated` en todas sus columnas, así que las columnas
  nacen con ellos y **ningún permiso cambia**.
- **Almacén** (`20261023213000`, DOS partes que se pegan por separado, ADR-0195): el bucket público `retail-insignias` (100 KB, solo `image/webp`) y su política de
  subida por `fn_puede_campanas()`.
- **Retail:** `components/sellos/ElegirDibujoDeInsignia.tsx` (el selector: grupo de opciones de radio con teclado, baldosas de 44 px, «Subir tu imagen», tokens de
  color, claro y oscuro), `DibujoInsignia.tsx`, `CambiarDibujoModal.tsx` (la hoja del pase), el campo en `NuevaEtiquetaModal`, el botón «Dibujo» y la ruta
  `POST/PATCH /api/productos/etiquetas` (que valida la clave o la ruta y llama a la función). Lógica pura en `lib/eleccion-de-dibujo.ts` y
  `lib/imagen-de-insignia-reglas.ts`; el navegador la usa en `lib/imagen-de-insignia.ts` (reducir y subir). La guía de foco del modal nuevo, declarada; la guía
  interactiva de Insignias con su paso «Su dibujo» y sus dos huellas aceptadas.
- **Tienda:** `lib/ficha.ts` lee `icono`, `imagen` y `descuento` (sin ellos —la base todavía sin la migración— todo sigue como antes), `dibujoDeLaCampana` e
  `imagenDeLaCampana`; `components/IconoInsignia.tsx` dibuja la imagen cuando hay ruta y origen del almacén, y el dibujo si no.
- **Tipos:** `packages/database/src/types.ts` con las columnas y la función.

## Lo que no hace

- **El papel de la etiqueta de precio sigue por el nombre** (`IconoEtiquetaPapel`, `etiqueta-precio-reglas`): tiene sus propios dibujos de 34 mm y su palabra corta
  por familia; un dibujo o una imagen elegidos llevarían la palabra de otra familia. Si Felipe quiere que el papel lo siga, es otro cambio.
- **El alta al vuelo dentro de Nuevo producto** (la insignia que se propone mientras se llena una prenda) **no ofrece el dibujo ni la imagen**: nace por el nombre y se
  puede cambiar después desde su pase. Es otro flujo, con su propia hoja y su firma de mitad de alta.
- **Una imagen propia no cambia con el modo oscuro** (es lo que se subió): un PNG de trazo oscuro y fondo transparente se ve poco sobre el fondo oscuro del ERP. En la
  tienda va sobre una baldosa crema y se lee siempre.
- **No borra archivos viejos** (ver DESCARTÉ). Nada sobre «Sorteo» al 100 % ni sobre insignias por talla (ADR-0489, siguen abiertas).

## Verificado

- **Postgres** (`pnpm pruebas:insignia-icono`, 40/40, cada escenario con ROLLBACK): las columnas nacen vacías y solo exigen su forma; fijar, cambiar y quitar; fijar
  un dibujo borra la imagen y al revés; forma inválida de la clave y de la ruta (`icono_no_valido`, `imagen_no_valida`); la imagen de otra insignia se rechaza; fijar
  lo mismo no escribe de nuevo; la llave (sin módulo ninguna de las dos; con Insignias, las dos; con Campañas, solo la campaña; `tienda_web` y `anon` no la llaman);
  la ficha trae `{id, nombre, icono, imagen, descuento}` también como `tienda_web`, y una campaña con descuento viene marcada con su dibujo o imagen; la política
  del almacén (el líder sube, quien no tiene módulo no, Insignias y Campañas sí, y otro almacén sigue pidiendo lo suyo); las migraciones se pegan dos veces.
  `pruebas:tienda-insignias` (20/20) se ajustó al contrato nuevo.
- **Tienda y shared** (`lib/insignias-dibujos.test.ts`, `lib/ficha.test.ts`): lo elegido manda sobre el nombre; una clave desconocida, vacía o rara (`"toString"`,
  `"__proto__"`, números) cae al nombre; una ruta que no es del almacén (`https://…`, `insignias/../x.webp`) es «sin imagen»; el chip lleva la ruta y el del
  descuento toma la imagen de su campaña.
- **Retail:** suite completa (597 archivos), `tsc` en las dos apps, candados de guía de foco, guías, colores, unificar y modo oscuro, `knip` y `knip:produccion`.
  Pruebas puras nuevas: `eleccion-de-dibujo.test.ts` y `imagen-de-insignia-reglas.test.ts` (medidas, tipos aceptados, rutas, qué manda).
- **En el navegador, de punta a punta** (base local, con la subida de verdad al almacén local): crear una campaña «ZZ Imagen prueba» con una imagen apaisada →
  avisa que no es cuadrada, el archivo queda en `retail-insignias` (4 KB, `image/webp`) y su ruta en `icono_imagen`; el sello de su pase la dibuja; «Dibujo» ▸ Gato
  → `icono = gato` e `icono_imagen` vacío; «Dibujo» ▸ nueva imagen → al revés; en la tienda, el chip de la insignia lleva la imagen (256 px natural, 200
  `image/webp`) sobre su baldosa. 375 px sin desbordar (baldosas de 49 px, botón de 44) y modo oscuro.

## Sin verificar

La web nueva en producción (el PR no está fusionado). `guias:recorrer` (esta Mac no tiene el navegador de Playwright) y `/chaos` sobre las dos hojas que guardan; un
teléfono real (la subida desde la galería de un iPhone: HEIC se pide convertir). El chip rojo del descuento con imagen en el navegador (cubierto por prueba de
datos, no mirado). `pruebas:tienda-ficha`, `vitrina-looks` y `vitrina-web` ya tenían fallos por datos de la base local compartida (ADR-0489); no cambian con esto.

## Orden al desplegar

1. Pegar `20261023203000_insignia_con_dibujo_elegido.sql` en el SQL Editor, tal cual, de una vez (requiere `20261022203000` y `20261023182000`, ya en producción).
2. Pegar `20261023213000_insignias_almacen_de_imagenes.sql` en **DOS pegados, uno por PARTE** (la segunda tiene la política: ADR-0195).
3. Verificar: `select icono, icono_imagen from retail.etiquetas limit 1;` (las columnas existen), `select id from storage.buckets where id = 'retail-insignias';` y
   `select retail.fn_tienda_insignias('<un modelo con Halloween>'::uuid, null);` (trae `icono`, `imagen` y `descuento` en cada insignia).
4. **Recién entonces** publicar la web (fusionar el PR). Con la web nueva y sin las columnas, Catálogo ▸ Insignias, Nuevo producto y Editar producto no cargan.

**Hecho el 2026-10-23** (los pasos 1 a 3, a pedido de Felipe): la 1.ª de una vez y la 2.ª en dos pegados, por `execute_sql` con el texto del archivo. Verificado contra
producción: columnas `icono` e `icono_imagen`; los 4 candados `etiquetas_icono%`; `fijar_icono_etiqueta(uuid, text, text)` con una sola firma, solo para `authenticated`;
`md5(prosrc)` de `fijar_icono_etiqueta` = `f62b1c0576bf0a48229a3f73bd734d9f` y de `fn_tienda_insignias` = `861f74e4e39ff08c59e02cb36ef070a6` (iguales a los del archivo, calculados
sobre la base local); `fn_tienda_insignias` sigue cerrada a `anon`, `authenticated` y `tienda_web`; bucket `retail-insignias` (público, 102400 bytes, `image/webp`) y la política
`retail_insignias_insert` (INSERT, `authenticated`, `fn_puede_campanas()`), una sola. Ninguna insignia tiene todavía dibujo elegido. Solo falta el paso 4.

## Lo que queda abierto

- **Insignias que ya existen:** todas siguen por el nombre; si Felipe quiere que «Estreno» lleve otro dibujo o su imagen, lo cambia desde su pase.
- **Archivos sin dueño:** cada cambio de imagen deja el anterior en el almacén (≤ 100 KB). Si crece, un mantenimiento que borre los que ninguna fila nombra.
- **Más dibujos:** agregar uno es escribirlo en `packages/shared/src/insignias-visual.ts` (su familia en `REGLAS` si debe reconocerse por nombre, el dibujo, su
  nombre y su lugar en `DIBUJOS_ELEGIBLES`); no pide migración.
