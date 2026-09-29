# Catálogo: cómo se relacionan producto → variante → vocabularios cerrados, y por qué los candados viven en la tabla y no en la pantalla

> Nivel 3 del protocolo de docencia (skill `/explica`). Fecha: 2026-09-29 · SHA: `38f9d7ce`. Sirve de base conceptual para los cinco análisis de Catálogo (`productos.md`, `productos-ciclo-de-vida.md`, `productos-categorias.md`, `productos-marcas.md`, `atributos.md`) y para `catalogo-plan-de-ataque.md`. Lo que dice de producción viene de consultas de solo lectura del 2026-09-29.
> Vocabulario: «colaboradora», «sede», «líder». Nada de `foo` ni «imagina una caja».

## 1 · EL PROBLEMA QUE EXISTÍA ANTES

Antes de tener un vocabulario cerrado, cada colaboradora escribía la prenda con sus palabras. Una escribía «Azul marino», otra «azul  marino» (con dos espacios), otra «Azúl Marino». Una ponía «Blusas» y otra «Camisas y Blusas». Para una persona son la misma cosa; para el sistema son cuatro colores y dos categorías distintas.

Las consecuencias no se ven el día que se escribe, se ven meses después:
- El reporte «cuánto vendimos en Camisas y Blusas» suma solo una parte.
- El código de la prenda (`CMS-0001-BEI-M`) sale de la categoría: si la categoría cambia de nombre o se duplica, los códigos se parten.
- «A quién pedirle» agrupa por proveedor: «CAYLA SAC» y «Cayla S.A.C.» son dos proveedores.
- La campaña de Black Friday se configura por categoría: si «Blusas» y «Camisas y Blusas» conviven, la mitad de las prendas se quedan sin descuento.

Ya nos pasó: el 21-sep encontramos en producción un producto activo colgando de la categoría desactivada «Blusas», y hoy siguen vivas en producción dos categorías de prueba («dsa», «prueba Lapicero»), dos marcas de prueba y 43 categorías de 44 sin un solo producto.

Hay un segundo problema, más profundo: **quién vigila la regla**. Si la regla «una categoría no se desactiva si tiene productos» vive solo en la pantalla, solo la cumple quien entra por la pantalla. Y en CAYLA ya hay más de una puerta al almacén: la pantalla, el cargador del censo de mañana, el SQL Editor de producción y las funciones (RPC) que llama la caja. Cada puerta nueva es una oportunidad de saltarse la regla.

## 2 · QUÉ HACE LA SOLUCIÓN

Se ordena en tres niveles, como el almacén del Taller:

**Producto → variante → vocabularios.** El **producto** es el modelo («Blusa Emma»). La **variante** es cada combinación concreta que se puede vender, contar y etiquetar: «Blusa Emma · Beige · talla M» (con su código `CMS-0001-BEI-M`, su precio y su stock). Cada dato de la variante **no se escribe: se elige de un cajón etiquetado** (el **vocabulario cerrado**): la categoría del cajón «categorías», el color del cajón «colores», la talla del cajón «tallas», y lo mismo con marca, tejido, patrón, etiqueta y temporada. Como en el almacén: no se guarda una caja sin etiqueta, y la etiqueta se toma de una lista que el encargado mantiene.

**Proponer y aprobar.** Si llega un color nuevo, una colaboradora lo puede proponer, queda **pendiente**, y una líder lo aprueba. Es la nota de pedido del Taller: la operaria pide, la encargada firma.

**El candado va en la puerta, no en el cartel.** Aquí está la idea central. Piensa en dos vendedoras que aparten la última talla M al mismo tiempo: no lo resuelve un cartel que diga «una sola persona a la vez»; lo resuelve el cerrojo del stock, que deja pasar a una. Con el catálogo pasa igual. Hay cuatro tipos de cerrojo y todos viven **en la base de datos**:
1. **Restricción (`CHECK`):** el dato tiene forma. El prefijo de una categoría son tres letras mayúsculas, o no entra (`categorias_prefijo_formato`).
2. **Índice único:** no se repite. Dos categorías con el mismo nombre —aunque cambie una tilde o una mayúscula— no caben (`categorias_nombre_clave_unica`).
3. **Disparador (`trigger`):** una regla entre filas. Una categoría no se desactiva si todavía tiene productos activos (`categorias_vigencia_candados`).
4. **Llave compuesta:** dos cosas van juntas o no van. Un producto no puede tener un proveedor que no trae su marca (`productos_marca_proveedor_fk`).

La pantalla y las funciones (RPC) ponen la **comodidad** encima: un mensaje claro, un botón apagado, un aviso «¿no será una marca que ya existe?». Pero cuando la pantalla y la base discrepan, gana la base.

**Cómo se ve mal hecho.** Cuando la regla vive solo en la pantalla. Señales: el botón «Desactivar» está prendido y el error solo aparece después de pulsarlo; una prenda de precio 0 no la permite el formulario pero la acepta la función que usará el censo; «Levis» y «Levi's» son dos marcas legales. Esas tres cosas existen hoy en Catálogo.

## 3 · CÓMO LO HACEN SISTEMAS DE TALLA MUNDIAL

*(Lo de otros sistemas viene de memoria y no está verificado contra su documentación; léelo como orientación, no como cita.)*

- **Shopify:** el producto tiene «opciones» (talla, color) y cada combinación es una variante. Los valores de esas opciones son **texto libre por producto**, y «vendor» (la marca) también. Es flexible y por eso las tiendas Shopify tienen «Azul» y «azul» en el mismo catálogo. Para paliarlo publicó una taxonomía estándar de categorías y atributos con valores fijos, pero encima del texto libre. CAYLA hace lo contrario: **cerrado desde la base**.
- **Odoo:** el producto («plantilla») genera variantes a partir de **atributos con lista fija de valores** (Color: Azul, Rojo…). Es el modelo más parecido al nuestro: la lista es cerrada, y la variante nace de la combinación. Lo que CAYLA añade es el flujo proponer/aprobar y los candados de tabla por vocabulario.
- **Stripe:** el producto y sus precios son objetos distintos, y **un precio no se edita: se crea uno nuevo y se archiva el anterior**. Se parece a lo que hace CAYLA con la identidad de una variante: color, talla y código no se cambian «a la ligera» (`variantes_identidad_solo_por_funcion`) y el costo solo se corrige hasta la primera compra.

**En qué nos parecemos y en qué no.** Los tres sistemas ponen una capa de servidor (una API) entre el navegador y la base: la regla vive en esa capa, y por eso se puede decir «la pantalla valida». **CAYLA no tiene esa capa.** Es Next.js más Supabase con seguridad por filas (RLS), y el navegador habla casi directo con la base (`CLAUDE.md`, nota de arquitectura del 2026-07-16). Aquí **la base es el servidor**: si un candado no está en la base, no está en ningún lado. Por eso los candados van en la tabla y no en la pantalla, y por eso un `CHECK` vale más que diez validaciones en el formulario.

## 4 · QUÉ DESCARTAMOS AQUÍ Y POR QUÉ

| Alternativa | Por qué no | Costo real |
|---|---|---|
| **Texto libre por producto** (como Shopify) | Ya lo vivimos en V1 | Reportes que no suman; «Levis» ≠ «Levi's»; una campaña por categoría que deja prendas afuera |
| **Validar solo en la pantalla o en una ruta `/api`** | Hay otras puertas (cargador del censo, SQL Editor, RPC) | El 21-sep: «Blusas» desactivada con un producto activo; hoy: precio 0 posible por la RPC |
| **`enum` de Postgres para cada vocabulario** | Agregar un color exigiría una migración y desplegar | La colaboradora no podría proponer un color nuevo; cada cambio pasa por Felipe |
| **Una sola tabla de atributos** (valor genérico, tipo genérico) | No permite un `CHECK` por vocabulario | No se podría exigir que el hex de un color sea `#RRGGBB`, ni que un descuento esté entre 0 y 100 |
| **Borrar valores viejos** | CLAUDE.md: nunca `DELETE` en catálogos con historial | Se rompería la trazabilidad de una prenda vendida; se desactiva, no se borra (única excepción: una marca sin productos, ADR-0217) |
| **Cambiar `fn_clave_texto` para que ignore puntuación** | La usan categorías, colores, tallas, tejidos, patrones, familias y proveedores | Recalcular ocho índices únicos a la vez; un valor válido de hoy podría chocar mañana |
| **NestJS + Prisma + `tenant_id`** | Decisión de Felipe del 2026-07-16 (nota de arquitectura) | Reconstruir el núcleo ya verificado; queda como visión para vender el sistema a otra marca |

## 5 · DÓNDE VERLO EN ESTE REPO

Las reglas viven en migraciones (`supabase/migrations/`); la pantalla las usa desde `apps/web`.

- **La clave que decide «es el mismo nombre»:** `supabase/migrations/20260912235500_vocabulario_cerrado.sql:39-46` (`fn_clave_texto`: minúsculas, sin tildes, espacios repetidos como uno; **no quita la puntuación**).
- **Forma del prefijo:** `20260912235500_vocabulario_cerrado.sql:105` (`categorias_prefijo_formato`, `^[A-Z]{3}$`) y `:106` (`categorias_prefijo_unico`).
- **Nombre único de categoría sin importar tildes:** `20260915160001_categorias_editar_desactivar.sql:26` (`categorias_nombre_clave_unica`).
- **Candado de tabla que antes vivía solo en la RPC:** `20260927200000_categorias_candados_en_la_tabla.sql:120` (`categorias_vigencia_candados`; la explicación de por qué, `:17-37`).
- **Marca: nombre único, no desactivar con productos, pareja marca-proveedor:** `20260918231000_marcas_y_proveedor_en_productos.sql:51` (`marcas_nombre_unico`), `:85-100` (`fn_marcas_desactivar_candado`), `:133-135` (`productos_marca_proveedor_fk`).
- **Identidad de una variante:** `20260916190000_variantes_identidad_unica.sql:38-40` (producto + talla + color, sin repetir aunque falte el color); y en `20260929045000_corregir_siempre_color_y_talla_de_variantes.sql:49-61` el candado que la deja cambiar solo por función.
- **Una talla con prendas no se retira:** `20260929030000_talla_con_prendas_no_se_retira.sql:80-84`.
- **Un descuento solo en una etiqueta aprobada:** `20260918160000_etiquetas_descuento_y_categorias.sql:58-59` (`etiquetas_descuento_solo_aprobada`).
- **El ejemplo de una regla en el lugar equivocado:** `apps/web/lib/alta-producto.ts:221-222` (precio > 0, solo aquí) frente a `variantes_precio_check` en producción (`precio >= 0`); y `apps/web/lib/marcas.ts:46` (el aviso de marcas parecidas, solo en la pantalla).
- **Qué candados existen HOY en producción:** consulta a `pg_trigger` y `pg_indexes` de las tablas de Catálogo (apéndice de `catalogo-plan-de-ataque.md`).

## 6 · LA PREGUNTA QUE FELIPE DEBERÍA PODER HACERME

> **«Si los candados de verdad viven en la base, ¿por qué un precio de S/0 sí puede entrar mañana con el censo? ¿Qué puertas al almacén tiene mi sistema y cuáles tienen cerrojo?»**

La respuesta, para que la compruebes: porque la regla «precio mayor que cero» se escribió en el formulario del alta (`alta-producto.ts:221`) y no en la tabla; la tabla solo pide «cero o más» (`variantes_precio_check`), a propósito, porque el producto centinela y «Monto manual» tienen precio 0. El censo de mañana entra por la función `crear_producto_con_stock_inicial`, no por el formulario. La solución que propongo (`productos-ciclo-de-vida.md` #1) es un candado que distinga: `precio > 0 o la variante está inactiva`.

**Comprobación de que quedó claro.** Si puedes decirme, con tus palabras, *cuántas puertas tiene el catálogo y cuáles tienen cerrojo* (la pantalla del alta, el censo en lotes, el SQL Editor de producción, la caja), y por qué «el cartel» y «el cerrojo» no son lo mismo, entonces se explicó bien. Si no, lo repito con otra analogía —la del **tabique de la sala de corte**: cuando el Taller pone un tabique con puerta y cerradura, no importa quién entre ni por dónde; cuando solo cuelga un letrero, pasa quien no lo lee.
