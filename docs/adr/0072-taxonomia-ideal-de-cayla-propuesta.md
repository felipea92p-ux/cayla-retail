# ADR-0072 (PROPUESTA) — Taxonomía ideal de CAYLA Retail

**Estado:** Propuesto. Borrador de investigación, **no aprobado**. No se aplica nada.
**Fecha:** 2026-09-16
**Numeración:** ADR-0072. ADR-0070 es "colores: cualquiera propone, un Líder aprueba" (PR #59) y
ADR-0071 es el candado completo del historial (PR #56).
**Acompaña a:** `docs/datos/investigacion/taxonomia-ideal-2026-09-16/migracion-borrador.sql` (NO está en `supabase/migrations/`: no corre en ningún `db reset`). Ese archivo compila
sobre un Postgres 17 vacío con `btree_gist`. `docs/datos/investigacion/taxonomia-ideal-2026-09-16/prueba-estados-imposibles.sql` corre **102
casos** y se verifica sola: cada caso anota "ok" o "FALLO" y al final imprime el resumen. Tres
de esos casos usan dos sesiones reales (con `dblink`) para probar concurrencia. Resultado del
2026-09-16 en un Postgres 17.10 desechable, no contra la base local ni contra producción:
**102 ok, 0 fallidos**. En una segunda corrida, con los roles `authenticated`, `anon` y
`service_role` creados, se comprobó que los permisos quedan retirados y que los 52
disparadores quedan en `enable always`.
**Lecturas de producción:** los conteos de §7 son de la sesión del 2026-09-16. Las consultas M1
a M5 (sección 11 del SQL) se corrieron en solo lectura el mismo día, al integrar el borrador al
repo; resultados en §7.
**Alcance:** modelo ideal solo para CAYLA (moda peruana, 3 tiendas y un taller, 5 a 10 sedes a
3 años). No es multi-marca. Migrar después es aceptable.

---

## 0 · Antes de leer: tres cosas que cambian el punto de partida

1. **Los módulos 02 a 05 describen V1.** Lo que corre en producción es V2
   (`docs/datos/generado/DICCIONARIO-RETAIL.md`, más las migraciones 2026-09-12 a 2026-09-16).
   Este ADR se contrastó contra V2 y contra producción en solo lectura.
2. **La "taxonomía universal" no existe en V2.** Consultado a producción el 2026-09-16:
   `retail` tiene 45 tablas y ninguna se llama `taxonomia_*` ni `producto_atributos`. En
   `supabase/migrations/` tampoco hay migración que las cree: solo aparecen en
   `scripts/taxonomia/cargar.mjs`. El módulo 03 (Tucán) documenta tablas que el corte a V2
   (`0af2f1b`) se llevó, junto con el importador con IA.
3. **Hoy migrar cuesta casi nada.** Producción tiene **7 productos, 37 variantes, 2 códigos de
   barras, 200 movimientos y 13 líneas de venta**, y según ADR-0069 las variantes viejas son
   de prueba. Cada decisión de identidad que se tome después del censo de más de 1.000
   prendas se paga con etiquetas reimpresas en tres sedes.

---

## 1 · El problema: lo que falla hoy en tienda

La vara es el compromiso 5 de Felipe: **"el sistema avisa qué talla se está quedando antes de
que alguien lo pregunte"**. Hoy el modelo no puede cumplirlo, y no por falta de pantalla: faltan
datos que ninguna pantalla puede inventar.

**Loro (02, catálogo) en V2 real:**
- `variantes.talla` es texto libre, sugerido por `categorias.tallas_sugeridas` sin candado. La
  base no sabe que S va antes que M. `lib/tallas.ts` y `lib/catalogo-grupos.ts` ordenan distinto
  (una conoce 2XL y la otra no). Sin orden ni escala en la base, "la M se está quedando en
  Arequipa" no se puede calcular sumando la M de todas las blusas.
- ADR-0069 reemplazó el índice viejo `unique (producto_id, talla, color_codigo)` por
  `variantes_identidad_unica` sobre `fn_token_talla` con `nulls not distinct`, y Felipe lo pegó
  en producción el 2026-09-16. Aun corregido, sigue sin orden, sin escala y sin tallas clave.
- El código corto (`BLU-0042-AZM-M`) promete ser inmutable (ADR-0025) y nada lo hace cumplir
  (hueco 3). La policy `variantes_write_lider for all` permite un UPDATE directo de `talla`,
  `color_codigo` o `codigo`. Si una encargada "corrige" una M a S en una variante con ventas,
  la curva de tallas de la temporada cambia hacia atrás sin rastro.
- "Estampado", "Multicolor" y "Animal print" son colores (`EST`, `MUL`, `ANI`,
  `20260912235500_vocabulario_cerrado.sql:92-94`), y el concepto vive en dos columnas
  (`familia_color='estampado'` y `colores.tipo='estampado'`, ADR-0061). Dos estampados
  distintos del mismo modelo en la misma talla chocan en la identidad, y un "Floral
  azul/blanco" desaparece del análisis del azul.
- El precio se sobrescribe (`variantes.precio`) y ADR-0059 guarda el antes y el después como
  texto. No se sabe si 59.90 fue rebaja o precio nuevo.
- `productos.temporada` es texto libre (ADR-0060) y `productos.categoria_id` acepta vacío.

**Tucán (03, taxonomía):** además de no existir en V2, el diseño documentado tenía tres
huecos: la versión "fijada" era una etiqueta (hueco 4: `on conflict (id) do update` pisa
nombres y no guarda versión), un color podía quedar anclado a "Algodón" (hueco 3), y la IA
nunca se midió (hueco 6). Shopify retiró 108 ids entre sus releases 2025-12 y 2026-02, y 101
eran de ropa: el supuesto "id estable entre releases" del módulo 03 es falso.

**Golondrina (04, importación):** `producto_atributos` existía y nadie la escribía (hueco 1).
Tejido y estampado se mapeaban y se tiraban. Deshacer una importación y reintentar duplicaba el
catálogo con otros códigos (hueco 6).

**Halcón (05, inventario):**
- `movimientos.motivo` es texto libre. Producción tiene hoy 7 motivos escritos a mano y solo
  el literal `'venta'` tiene efecto (hueco 4).
- Vender lo que está en el almacén no se puede (D-40 incumplida, hueco 5), y las alertas no
  miran el almacén (D-39, hueco 6).
- El punto de reorden nuevo (`20260916100000_punto_reorden.sql`) es **global por producto**:
  suma todas las sedes y todas las tallas, y es así a propósito. Responde "cuándo comprarle al
  proveedor", que es una decisión de empresa. Lo eligió Felipe y usa el `stock_minimo` que él
  fijó el 15-sep. No responde "se acabó la M en AQP mientras sobran 6 en TRU", porque esa es
  otra pregunta: la de la sede.
- `devolucion_items.condicion` distingue vendible de dañada, pero la prenda dañada no tiene
  lugar propio en el stock. `devoluciones.motivo` es texto libre y está en la cabecera, no por
  prenda: "le quedó chica" no llega a ningún análisis.

**Línea de cobro:** `venta_items` congela precio, descuento y costo, pero no qué se vendió
(descripción, talla, color, categoría, temporada, código SUNAT). Si mañana "Blusas" se parte en
subcategorías (ADR-0062), las ventas de 2026 por categoría cambian hacia atrás. `lucode.ts`
manda `NIU` y afectación `'10'` fijos para toda línea, incluido el "Cargo especial", que es una
variante centinela falsa (`20260912234726_cargo_especial_pos.sql`).

---

## 2 · Principios que salen de la investigación (7)

1. **Solo dos ejes crean variante, cerrados y nunca vacíos; todo lo demás describe.**
   Shopify separa opciones (máximo 3, la base rechaza una variante sin valor o repetida) de
   atributos de categoría que no crean stock (SH-01). Odoo tiene modos de atributo y congela el
   modo cuando se usa (ODO-01). Square usa vocabulario compartido con `ordinal` (SQ-01).
   QuickBooks es el antiejemplo: aplanó las variantes y las retiró el 1-jun-2026 (QBO-02).
2. **El modelo en un color es un objeto real, entre el modelo y la talla.** Salesforce B2C lo
   llama *variation group* (H1), Infor PLM lo llama *colorway* con drop, precio y estado
   propios (H2), Oracle y Zara planifican a nivel estilo-color (ORA-10, INT-01).
3. **La identidad no se edita; los códigos se acuñan una vez; los vocabularios se retiran, no
   se reescriben.** Stripe no deja cambiar el monto de un Price usado (STR-02). ERPNext tuvo
   que parchar un renombrado en cascada porque su código es la llave (EN-03, H8). Shopify
   retira ids de taxonomía y publica mapeos (SH-05, H10). GS1 prohíbe reutilizar un GTIN
   publicado (GS1-03). Google pierde el historial de un id cambiado (G5).
4. **La línea de venta congela lo que se cobró y lo que se declaró; el análisis elige a
   propósito "como era" o "como es".** Shopify LineItem (SH-08, H1), ERPNext Sales Invoice
   Item (EN-10, H7), Kimball Type 7 (H9). Odoo es el antiejemplo: su reporte une en vivo con
   la categoría actual (H6).
5. **Un estado imposible se hace imposible en la base, no en la aplicación.** Odoo valida
   códigos de barras en Python y fusiona saldos duplicados después (ODO-04, ODO-07).
   commercetools declara la unicidad de variante en la definición y solo deja aflojarla, nunca
   endurecerla (h1). Square valida el UPC solo en sus pantallas (SQ-11).
6. **Lo vendible se cuenta por sede; el piso y el almacén son el detalle; lo que viaja y lo
   que no se puede vender se ven aparte.** Shopify decide la disponibilidad a nivel tienda y
   usa bins solo para repartir lo físico (SH-07, H2 de stock). Dynamics 365 Commerce descuenta
   de la ubicación por defecto de la tienda y separa "Damaged" y "Returns" (H3, H4). ERPNext y
   Square hacen el traslado en dos pasos con tránsito (EN-08, SQ-06).
7. **La talla que se queda se mide con la talla a la vista y con curvas agrupadas, no con
   ventas crudas por SKU.** Zara descensura la demanda por días exhibidos y define tallas clave
   (INT-01). Oracle escala la curva por jerarquía (ORA-10, con umbrales históricos). Toolio
   calcula solo con "semanas buenas" (INT-08). ERPNext es el antiejemplo: promedio por día
   calendario de toda la empresa (EN-09).

---

## 3 · El modelo ideal

### 3.1 Dónde vive cada dato

| Nivel | Qué vive ahí | Qué NO vive ahí |
|---|---|---|
| **Categoría** (familia fija > categoría > subcategoría de un nivel) | familia, prefijo del código, escala de tallas por defecto, si lleva etiqueta textil (decidido por categoría, no por familia), atributos que aplican (`categoria_atributos`), mapeo al código SUNAT por público | precio, costo, cuentas contables, tipo de existencia |
| **Producto** (el modelo: "Vestido Aurora") | código `VES-0042` (prefijo de su categoría al nacer), referencia, categoría hoja, escala de tallas, público, marca, origen (taller propio, encargo, compra nacional, importación), tipo de surtido (básico o temporada), temporada de lanzamiento, país de origen, excepción SUNAT, `stock_minimo` (piso del punto de reorden de compra, decisión del 15-sep), atributos descriptivos de nivel modelo, composición textil por defecto | talla, color, precio, stock |
| **Producto-color** (la opción: "Vestido Aurora, Flores vino") | código de 3 letras dentro del modelo, nombre comercial, color principal + hasta 2 secundarios + estampado, ciclo de vida (vigente, salida), fotos del color, atributos de nivel color, composición si el taller usó otra tela | talla, stock, "en liquidación" (eso sale del precio) |
| **Variante** (lo que se escanea y se cuenta: "…, M") | talla (FK a la escala del modelo), código `VES-0042-FLV-M` compuesto por la base, activo, `costo` como promedio ponderado derivado (ADR-0067) | categoría, temporada, precio fijo, un costo que alguien teclea |
| **Código de barras** | todo lo que la pistola lee: código corto (igual letra por letra al de la variante), SKU legado, EAN/UPC de fábrica, GTIN propio futuro; tipo; GTIN normalizado a 14 dígitos; principal; retirado | identidad de la prenda |
| **Precio** | monto por variante con tipo y vigencia. El regular es nacional; la rebaja y la liquidación son nacionales o de una sede | nada más: no se edita, se cierra desde hoy |
| **Ubicación** (lugar que guarda stock) y **sububicación** (piso, almacén de tienda, general del taller, no vendible) | tipo (tienda, taller, almacén central), vínculo `sede_dynamic_id` a la sede de Dynamic; cantidad **solo en la hoja** | código de sede propio (se **lee** de Dynamic: `TRU`, `AQP`, `003` = tienda de Lima, `LIM` = **Taller**, `CCO` = corporativo); "stock total de la sede" guardado (es una suma) |
| **Surtido** (producto-color × sede) | si se espera en esa sede, fecha de lanzamiento ahí (fija una vez puesta), estado local (vigente o retirado), mínimo de presentación; cada cambio queda en `surtido_eventos` | cantidades, liquidación |
| **Movimiento** | variante, sububicación, tipo, cantidad, motivo cerrado (con el documento que exige), fecha en que ocurrió, a qué corrige, un solo origen | nada editable; el costo de la capa (vive en `costo_historial`, ADR-0067) |
| **Línea de venta** | referencia viva (variante) + copia congelada **escrita por la base** desde el catálogo y el precio vivos: descripción impresa, código, código escaneado, opción, escala, talla, categoría hoja, su padre y su familia ese día, temporada, público, precio regular, precio aplicado, tipo de precio, descuento, costo, unidad SUNAT, afectación IGV, base, IGV, código SUNAT, GTIN con su esquema | atributos descriptivos (tejido, silueta): se leen "como son" para que una corrección mejore el histórico |
| **Insumo del Taller** (tela, avío) | unidad de medida, cantidad decimal, libro propio (`insumo_movimientos`) enlazado a la orden de producción | talla, opción, POS, conteos de tienda (ver D30) |

### 3.2 Atributos vs variantes

**D1. Dos ejes fijos: opción (producto-color) y talla.**
- **DECIDÍ:** la variante es `producto_color_id × talla_id`, las dos columnas NOT NULL, con
  `unique (producto_color_id, talla_id)`. "Sin color" es una opción real (`UNC`) y "talla
  única" es una talla real (`U` en la escala `UNICA`). Así ya no queda ningún vacío por el que
  se cuele un duplicado (SH-01, ODO-02, SQ-01).
- **DESCARTÉ:** ejes genéricos nombre/valor al estilo Shopify u Odoo (hasta 3 o 6 ejes).
  Costo: la unicidad pasa al código de la aplicación, que es el agujero de Odoo (ODO-02) y de
  ERPNext (EN-01), y cada consulta de inteligencia por talla tiene que pivotear. CAYLA vende
  moda: tiene dos ejes, no seis.
- **SE ROMPE SI:** el taller empieza a hacer jeans con cintura y largo de pierna como dos
  decisiones separadas (28/30, 28/32). Se resuelve con una escala `cintura_largo` cuyo código
  es "2830" dentro del mismo eje, pero si la encargada necesita reponer "todo el largo 32"
  sin importar la cintura, ahí sí hace falta un tercer eje.

**D2. La talla pasa a ser vocabulario cerrado, ordenado, por escala, con tallas clave.**
- **DECIDÍ:**
  - Las tablas `escalas_talla` y `tallas` (código, etiqueta, `orden` único por escala,
    `es_clave`). La categoría trae la escala por defecto, el producto la fija y dos FK
    compuestas obligan a que la talla de la variante sea de la escala del modelo (SH-04,
    INT-01, INT-05, SQ-01, G7).
  - **Qué familia usa qué sistema** (CHECK de 9 valores):

    | Familia | Sistema |
    |---|---|
    | indumentaria | letras, numérica (6-8-10, 36/38), cintura, cintura-largo |
    | calzado | calzado europeo |
    | bisutería | anillo o única |
    | accesorios | única, o cintura y letras para cinturones |
    | belleza | contenido (30 ml, 50 ml) o única |
    | papelería | única |
    | indumentaria de niña, niño o bebé | edad |

    El **tono** de un labial no es talla: es la opción (`producto_colores`), como el color de
    una blusa.
  - El código de talla va sin separadores (`^[A-Z0-9]{1,5}$`), porque el código de variante
    ya separa con `-`. "10-12" se imprime `1012` y la etiqueta dice "10-12"; "36/38" se
    imprime `3638`.
  - `tallas_sinonimos` guarda lo que se teclea ("2XL") y la talla canónica a la que apunta
    (XXL). Una talla nueva no puede tener el código de un sinónimo ya declarado, y un
    sinónimo no puede ser el código de otra talla. Se siembra desde
    `apps/web/lib/tallas.ts:8`, que hoy conoce XXL y 2XL como dos tallas distintas.
  - El `orden` de una talla con prendas ya no cambia: la curva de PV26 y la de PV27 se
    comparan en ese orden.
  - **Las tallas clave son por escala**, no por categoría ni por sede. `es_clave` sí se puede
    cambiar y no guarda historia propia; cada recomendación guarda las tallas clave con que se
    calculó (D27).
  - Crear una talla lo hace una RPC con permiso propio, no "la Líder". Según BACKLOG, los 9
    colaboradores son Líder, así que ese rol no controla nada. Propuesta: al inicio, ese
    permiso lo tiene solo Felipe; delegarlo es decisión suya.
- **DESCARTÉ (1):** la normalización de texto de ADR-0069 (`fn_token_talla`). Costo: iguala
  "M" y "m ", pero no da orden, ni escala, ni talla clave, y la curva de tallas se sigue
  ordenando en TypeScript con dos funciones que no coinciden. ADR-0069 dejó fuera la tabla
  porque "agregar tallas tarde es barato". Es barato para capturar, pero deja sin base el
  compromiso 5.
- **DESCARTÉ (2):** `tallas.equivale_a` (una talla alias dentro de la misma escala). Costo:
  el alias sigue siendo una fila de `tallas` que una variante puede usar, y hace falta un
  candado más para impedirlo. El sinónimo, en cambio, no es talla: nunca llega a una variante.
- **SE ROMPE SI:**
  - Una prenda de proveedor llega con una talla que no está en ninguna escala ("36/38" en
    blusas importadas) y la encargada tiene que venderla hoy. Hay que llamar a quien tiene el
    permiso, y la recepción espera esa llamada. Si pasa cada semana, la escala está mal
    definida o el permiso está mal repartido.
  - Las tallas clave cambian por sede: la clienta de AQP compra L donde la de TRU compra M.
    Con clave por escala, la alerta de talla rota de AQP mira la M. Hace falta
    `tallas_clave_sede`, y se decide con datos de una temporada, no antes.
  - Llega un sinónimo que nadie sembró ("XXG" de un proveedor) y alguien lo crea como talla
    nueva: la curva se parte en dos igual. El candado solo frena sinónimos ya declarados.

**D3. El modelo-color es una tabla propia (`producto_colores`).**
- **DECIDÍ:** crear la opción con código de 3 letras único dentro del modelo, nombre
  comercial, colores y estampado, estado y fotos. El código de la variante pasa a usar el
  código de la opción (`VES-0042-FLV-M`). Sobre la opción cuelgan las fotos del color, el
  surtido por sede y el estado de liquidación (H1 Salesforce, H2 Infor, SH-12).
- **DESCARTÉ (1):** un producto por color, como los *combined listings* de Shopify. Costo: se
  duplican categoría, atributos y precio, y el propio Shopify no lo lleva a su POS (SH-12).
- **DESCARTÉ (2):** dejar el color suelto en la variante, que es lo de hoy. Costo: "sacar el
  vino a liquidación" es actualizar N filas de talla, y la foto que ve la vendedora es la del
  modelo, no la del color que pide la clienta.
- **SE ROMPE SI:** el taller cambia la tela de una opción a mitad de temporada y el precio o
  la composición cambian. Eso no es la misma opción con otro dato: es otra opción o incluso
  otro modelo, y hay que decirlo en la pantalla de alta, no descubrirlo en el margen.

**D4. Color base y estampado separados; la opción los combina.**
- **DECIDÍ:** `colores` guarda solo matiz, con hex obligatorio y familia sin "estampado". Nace
  la tabla `estampados`. La opción tiene un color principal, hasta dos secundarios y un
  estampado, igual que el metaobjeto color-patrón de Shopify (SH-02, IA-03) y el atributo
  `color` de Google con un principal y dos secundarios más `pattern` aparte (G3). Un índice
  único impide la misma combinación dos veces en el mismo modelo.
- **DESCARTÉ:** mantener `EST`, `MUL` y `ANI` como colores con `colores.tipo`. Costo: dos
  columnas para el mismo concepto (ADR-0061) y dos estampados del mismo modelo que no pueden
  convivir en la misma talla.
- **SE ROMPE SI:** un estampado tiene cuatro colores protagonistas y la encargada quiere que
  cuente en el análisis de los cuatro. El modelo registra tres; el cuarto se pierde para el
  análisis por color, no para la venta.

**D5. Los atributos descriptivos son pocos, cerrados, por categoría, y nunca crean stock.**
- **DECIDÍ:** `atributos` + `atributo_valores` + `categoria_atributos` (qué aplica y qué es
  requerido) + `producto_atributos`. Esta última lleva una FK compuesta `(valor_id,
  atributo_id)` que hace imposible guardar "Algodón" como manga, y un disparador que impide
  preguntarle "tipo de tacón" a una blusa. Se empieza solo con los que usa el pronóstico:
  tejido principal, silueta o fit, largo, manga (INT-04, INT-10, Square SQ-10, D365
  D365-04).
- **DESCARTÉ:** JSON de propiedades (Odoo ODO-11, Stripe `metadata` STR-08) y los 993
  atributos del estándar de Shopify. Costo: ni FK, ni índice, ni forma barata de responder
  "¿cuántas blusas de lino rotan en AQP?", y 900 prendas por capturar con atributos que nadie
  va a leer.
- **SE ROMPE SI:** el taller necesita dos valores del mismo atributo en una prenda
  (ocasión: "fiesta" y "oficina"). El modelo propuesto es de un solo valor; hace falta
  `multiple` en el atributo y una tabla puente.

**D6. Composición textil estructurada, porque la ley la pide así.**
- **DECIDÍ:**
  - `composiciones` por pieza y parte (principal, forro), con material de vocabulario cerrado
    y porcentaje. "Otras fibras" existe como material. Es lo que exige la Res. CAN 2109,
    art. 7 (ROT-02), y coincide con el `material` de Google (G9).
  - Un disparador diferido exige que cada pieza-parte sume 100. Revisa el grupo nuevo **y el
    viejo**: si el elastano pasa del principal al forro, el principal queda en 95 y se rechaza.
  - La composición de una prenda que ya tuvo movimientos no se edita ni se borra. Otra tela
    es otra opción (D3). La revisión crítica cita además la regla §2.2 del GTIN Management
    Standard (composición declarada), que pediría otro identificador; esa sección no se releyó
    en esta revisión **[NV]**. Agregar una parte que faltaba sí se permite: completa, no
    cambia.
  - No conviven composición de modelo y de color para la misma pieza y parte.
  - `categorias.requiere_etiqueta_textil` se decide **por categoría**, sin valor por defecto.
    No se deduce de la familia: según la verificación de rotulado, cinturones y chalinas
    (accesorios) están en la CAN 2109 y la cosmética va por su propio reglamento.
  - Un modelo de esa categoría no pasa a `vigente` sin composición de la parte principal: a
    nivel modelo o en cada una de sus opciones. Lo mismo al agregarle una opción o al borrarle
    composición.
- **DESCARTÉ (1):** `productos.material` como texto (solo existe en producción V1) o el
  atributo "tejido" como único valor. Costo: la etiqueta cosida del taller se tipea a mano en
  cada corte, y la que dice "95% algodón" puede contradecir la web.
- **DESCARTÉ (2):** exigir etiqueta textil por familia (toda la indumentaria sí, accesorios
  no). Costo: deja fuera cinturones y chalinas, que sí la llevan, y el error aparece en una
  inspección, no en la pantalla.
- **SE ROMPE SI:**
  - Un proveedor entrega la composición con tolerancias raras ("aprox. 60/40") y la encargada
    no puede cerrar el 100. Se registra lo declarado por el proveedor, que es quien firma esa
    etiqueta.
  - Una categoría mezcla prendas con y sin etiqueta (una "Accesorios varios" con chalinas y
    llaveros). El candado es por categoría: hay que partirla o marcarla y exigir composición
    también a los llaveros. Se decide con la partida arancelaria en la mano, no antes.

### 3.3 Jerarquía

**D7. Familia fija > categoría > subcategoría de un nivel, y el producto solo cuelga de la
hoja.**
- **DECIDÍ:** conservar el techo de ADR-0062 (un nivel, familia heredada) y agregar reglas en
  la base (QBO-01, ORA-03, SH-03, INT-03):
  - Una categoría con hijas no admite productos, y darle hijas a una categoría con productos
    exige reubicarlos antes.
  - Prefijo y familia no cambian si la categoría ya tiene productos.
  - La familia de un **padre** no cambia si alguna hija tiene productos. El padre nunca tiene
    productos, así que la regla anterior sola no lo protegía: "Vestidos" podía pasar a calzado
    con "Largos" en indumentaria. Si ninguna hija tiene productos, el cambio se propaga a las
    hijas.
  - **Concurrencia:** los disparadores bloquean la fila de la categoría antes de mirar. Si una
    sesión le crea una hija a "Blusas" mientras otra le cuelga un producto, la segunda espera,
    ve lo que hizo la primera y se rechaza (probado con dos sesiones reales).
  - La unicidad de nombre pasa a ser por padre (`Largos` puede existir bajo Vestidos y bajo
    Faldas).
  - `productos.categoria_id` pasa a NOT NULL, y al nacer el código lleva el prefijo de su
    categoría.
- **DESCARTÉ (1):** la subcategoría opcional tal como la deja ADR-0062. Costo: "Vestidos"
  muestra un cajón fantasma "sin subcategoría", la suma de las hijas no cuadra con el padre y
  la curva agrupada compara conjuntos inconsistentes.
- **DESCARTÉ (2):** los 6 niveles de Oracle, el árbol libre de Odoo y ERPNext, y el árbol de 7
  niveles del estándar de Shopify como árbol operativo. Costo: cajas vacías en cada alta, y un
  desplegable de 7 niveles en "Recibir mercadería" es un error garantizado.
- **SE ROMPE SI:** Felipe parte "Vestidos" en largos y cortos a mitad de temporada. La regla
  obliga a mover los productos en el mismo acto. Es lo correcto, pero la pantalla tiene que
  ofrecer "mover todos a…" o la encargada se queda bloqueada.

**D8. Categoría única para decidir; colecciones muchos-a-muchos solo para vitrina.**
- **DECIDÍ:** `colecciones` y `coleccion_productos` ("Día de la Madre", "Cápsula lino") sin
  ningún efecto en códigos, margen, reposición ni reportes de venta por categoría (SQ-02, h5,
  D365-04, H7 Salesforce).
- **DESCARTÉ:** varias categorías por producto (Square, commercetools) o usar subcategorías
  para campañas. Costo: la venta por categoría suma más que la venta de la sede, y Square ya
  tiene un reporte de su propia `reporting_category` agregando el ítem a otra categoría.
- **SE ROMPE SI:** alguien pide "margen de la Cápsula lino". Se puede calcular desde la
  colección, pero ningún reporte financiero debe tomarla como partición.

**D9. La temporada es una entidad con fechas, y el producto dice si es básico o de
temporada.**
- **DECIDÍ:** la tabla `temporadas` (código `PV27`, tipo, inicio y fin de venta, inicio de
  liquidación), `productos.temporada_lanzamiento_id` y `productos.tipo_surtido`. Un CHECK
  exige temporada cuando el producto es de temporada (SAP-ORA-11, LS-04, INT-06, h11). Qué se
  congela cuando la temporada ya tiene productos:
  - **No cambian:** código, año, tipo e inicio de venta, porque "PV27 contra PV26" se mide
    desde ese inicio.
  - **Sí cambian:** fin de venta e inicio de liquidación, porque son plan y el plan se mueve.
    Por eso la inteligencia no los usa como denominador: mide desde `surtido.lanzamiento_en`
    y el libro.
- **DESCARTÉ:** texto libre (ADR-0060) o tags (Lightspeed). Costo: "Verano 26", "verano 2026"
  y "V26" son tres temporadas, y no hay ventana de fechas para comparar contra el año
  anterior.
- **SE ROMPE SI:** un modelo de temporada se vuelve básico de continuidad. Cambiar
  `tipo_surtido` está permitido, pero la serie de pronóstico cambia de método ese día y la
  inteligencia tiene que tratar ese corte.

### 3.4 Identificadores y códigos

**D10. Identidad uuid; códigos humanos compuestos por la base e inmutables.**
- **DECIDÍ:**
  - `productos.codigo`, `producto_colores.codigo`, `variantes.codigo` y el código de cada
    talla no cambian una vez creados, y lo rechaza la base. Corregir un error de identidad
    significa apagar la variante, crear la correcta y trasladar el stock con un movimiento.
  - **El código de la variante lo compone la base** (`fn_variante_codigo_compuesto`):
    código del modelo + código de la opción + código de la talla. Si el llamador no lo manda,
    se escribe; si manda otro, se rechaza. Como el código queda congelado desde que nace, un
    código mal armado ("VEL-0001-VIN-L" en una S) quedaría mal para siempre: la etiqueta dice
    L y el sistema descuenta S. V2 ya tiene ese candado: `fn_asignar_codigo_variante`
    (`20260912235500_vocabulario_cerrado.sql:194-213`), llamada por el disparador
    `fn_variantes_asignar_codigo` (`docs/datos/generado/funciones-produccion.txt:50`). La
    versión anterior de este borrador lo perdía sin decirlo.
  - El código de barras `cayla_corto` es el de la variante letra por letra, y hay uno por
    prenda.
  - Al nacer, el código del modelo lleva el prefijo de su categoría. El prefijo es la marca de
    nacimiento: ningún reporte lo lee como categoría actual (EN-03, H8, G5, LS-05, h4).
- **DESCARTÉ:** código como llave primaria con renombrado en cascada (ERPNext, Frappe). Costo:
  renombrar reescribe el color de cada venta pasada y deja las etiquetas pegadas diciendo otra
  cosa que el sistema.
- **SE ROMPE SI:** el primer lote real se etiqueta con un error masivo (el prefijo equivocado
  en 200 prendas). Con este modelo son 200 variantes nuevas y 200 etiquetas nuevas, no un
  UPDATE. Por eso las tallas y los códigos se deciden **antes** del censo.

**D10-bis. El código de sede no se acuña en retail: se lee de Dynamic.**
- **DECIDÍ:**
  - `ubicaciones` no tiene columna `codigo`. Cada tienda y el Taller apuntan a su sede de
    Dynamic con `sede_dynamic_id`, que es obligatorio salvo en un almacén central que Dynamic
    no conozca. Hay una ubicación por sede como máximo.
  - El código se lee por la vista `v_ubicaciones`. En producción los códigos son `TRU`, `AQP`,
    `003` (tienda de Lima), **`LIM` (el Taller, tipo `fabrica`)** y `CCO` (corporativo, D-20 y
    D-32). Fuente: `docs/datos/00-MAPA.md` §1.
  - El Taller se busca siempre por `tipo`, nunca por código.
  - **CCO no es ubicación.** No guarda stock: solo absorbe gasto (D-32).
  - **Pendiente de Felipe:** hoy retail tiene 3 ubicaciones: Tienda TRU, Tienda AQP y el
    Taller. Fuentes: el conteo de producción, `datos-reales-produccion.sql:45-54` y el
    comentario verificado de `20260915130000_produccion_del_taller.sql`. Que la fila del
    Taller sea la que nació como "Almacén Principal" con `sede_dynamic_id` vacío es
    inferencia, y M4 lo confirma. La tienda de Lima (`003`) no tiene ubicación en retail. Si
    debe tenerla, se crea con su `sede_dynamic_id`.
  - Se mantiene la decisión vigente: Dynamic manda sobre la sede (`14-DYNAMIC.md`).
- **DESCARTÉ:** un código propio de 3 letras e inmutable (`TRU`, `AQP`, `LIM`, `TLL`), que era
  la versión anterior de este borrador. Costo, contra producción:
  - `LIM` ya es el Taller y la tienda de Lima es `003`, que el CHECK `^[A-Z]{3}$` rechaza
    (la revisión crítica lo corrió: `ERROR ubicaciones_codigo_formato`).
  - Borraba `sede_dynamic_id` y creaba una segunda fuente del código de sede.
  - Un reporte que cruce por código le carga la planilla del Taller a una tienda: la trampa
    que avisa `14-DYNAMIC.md:491-495`.
- **SE ROMPE SI:**
  - Dynamic corrige un código de sede (`003` pasa a `LIM2`). Retail lo ve al instante, pero
    si CAYLA ya publicó ese código como `store_code` en Google, el historial de inventario
    local se corta. Para Google se usa un identificador estable propio (el uuid o uno
    publicado una vez), no el código de Dynamic.
  - Retail necesita un lugar de stock que Dynamic no tiene (un almacén central compartido).
    Queda sin código de sede, con tipo `almacen_central`.

**D11. `codigos_barras` sigue siendo 1:N con UNIQUE, y gana tipo, GTIN normalizado y
principal.**
- **DECIDÍ:** tipo cerrado (`cayla_corto`, `sku_legado`, `ean13`, `ean8`, `upca`, `gtin14`,
  `gtin_cayla`). Una columna generada `gtin14` usa una función inmutable que valida el dígito
  verificador y rechaza los rangos restringidos (02, 04, 20-29), con índice único. Hay a lo
  más un código principal por prenda, un código nunca se edita (se retira) y `variantes.sku`
  pasa a ser una fila `sku_legado` (EN-04, LS-06, GS1-06, G6, ODO-05).
- **DESCARTÉ (1):** SKU y código de barras repetibles (Shopify, QuickBooks). Costo: en el
  mostrador la pistola tiene que resolver **una** prenda, no una lista.
- **DESCARTÉ (2):** un GTIN propio o números RCN "04" ahora. Costo: un RCN solo va en código
  lineal, no admite Application Identifiers y deja de ser único cuando la prenda sale de la
  tienda (GS1-05). El QR con el código corto ya funciona con la Zebra 2D.
- **SE ROMPE SI:** dos proveedores reutilizan el mismo EAN para prendas distintas. La base lo
  rechaza a propósito y la encargada tiene que elegir cuál conserva el EAN. La otra prenda
  queda con su código corto.

**D12. GTIN propio y GS1 Digital Link: preparado, no construido.**
- **DECIDÍ:** reservar el tipo `gtin_cayla`, con un índice único que impide dos por variante
  (GS1: 1 GTIN por estilo×color×talla, GS1-01), para el día en que la marca propia salga a
  canales externos. El QR del futuro es un GS1 Digital Link en dominio propio con
  `/01/{gtin14}/10/{orden de producción}` (GS1-06, GS1-11).
- **DESCARTÉ:** afiliarse ya a GS1 Perú. Costo: la tarifa no está publicada y hoy no hay canal
  que lo exija.
- **SE ROMPE SI:** una tienda por departamento pide GTIN como condición para una orden. Ahí
  hace falta la afiliación antes de etiquetar esa orden.

### 3.5 Versionado e histórico

**D13. El precio no se sobrescribe: filas con vigencia.**
- **DECIDÍ:**
  - `precios(variante_id, ubicacion_id, tipo regular|rebaja|liquidacion, monto, vigencia
    tstzrange)`. Dos exclusiones impiden dos regulares encimados y dos descuentos encimados
    con el mismo alcance.
  - Un regular y una rebaja sí conviven: cobra la rebaja y el regular queda de referencia.
  - Un disparador impide que una rebaja nacional se encime con una de sede.
  - Una rebaja o liquidación tiene que ser **menor que el regular** vigente el día que empieza.
  - Un disparador solo deja **cerrar** una vigencia abierta, y no hay borrado. Tampoco se
    cierra con fecha pasada ni antes de la última venta que cobró con ese precio. La revisión
    crítica cerró al 05-sep un regular usado el 10-sep, y la línea quedó apuntando a un precio
    que no regía ese día.
  - Cambiar un precio es cerrar el vigente y abrir uno nuevo en la misma transacción
    (STR-02, STR-10, EN-12, H11).
  - El precio aplicable se mira en `ventas.ocurrido_en` (cuándo se cobró en la tablet), no en
    cuándo llegó a la base.
- **DESCARTÉ:** `variantes.precio` más el historial en texto de ADR-0059. Costo: no responde
  "¿a qué precio estaba la M en AQP el 20 de agosto?" ni separa venta por demanda de venta por
  rebaja.
- **SE ROMPE SI:**
  - La cola sin red (ADR-0063) sube una venta cobrada con un precio que se cerró mientras la
    tablet estaba desconectada. Como el precio se mira en `ocurrido_en`, la venta encuentra el
    precio que regía al cobrar y entra. Sigue abierto el caso en que el reloj de la tablet
    miente: `ocurrido_en` solo tiene tope hacia el futuro.
  - Se cierra un regular mientras sigue abierta una rebaja que lo usaba de referencia, y no se
    abre un regular nuevo. La venta de esa prenda falla por "sin precio regular vigente" hasta
    que alguien lo abra. Está en la lista de §4 de lo que el borrador no hace imposible.

**D13-bis. El precio regular es nacional; la rebaja y la liquidación pueden ser de una sede.**
- **DECIDÍ:** `precios.ubicacion_id` vacío = todas las sedes. El regular es siempre nacional
  (CHECK): es el que va impreso en la etiqueta, y la clienta ve el mismo en TRU, en AQP y en
  el online. La rebaja y la liquidación pueden ser nacionales o de una sede ("sobran XL en
  TRU: se liquidan en TRU"). Al cobrar se aplica, en este orden: descuento de la sede,
  descuento nacional, regular.
- **DESCARTÉ (1):** todo precio por sede. Costo: la misma blusa con dos etiquetas impresas
  distintas, y el online sin saber cuál mostrar.
- **DESCARTÉ (2):** todo nacional (la versión anterior). Costo: la liquidación local no tenía
  dónde vivir y terminaba en `surtido.estado = 'liquidacion'`, que no dice a qué monto.
  Además, "¿a qué precio estaba la M en AQP?" solo tenía respuesta si era igual en todas las
  sedes.
- **SE ROMPE SI:** CAYLA decide precios regulares distintos por ciudad (Lima más cara que
  Trujillo). Hay que quitar el CHECK del regular nacional y agregar la sede a su exclusión, y
  la etiqueta impresa deja de servir en otra sede.

**D14. La línea de venta congela; el análisis declara qué lectura usa.**
- **DECIDÍ:**
  - `venta_items` tiene referencia viva (`variante_id`) y copia congelada (sección 3.1),
    inmutable por disparador.
  - **La copia de una prenda la escribe la base**, no el llamador
    (`venta_items_copia_desde_catalogo`): toma código, opción, escala y talla de la variante;
    categoría hoja, **su padre y su familia ese día**, temporada y público del modelo; y tipo y
    monto del precio aplicable en `ocurrido_en`. Si el llamador manda un valor distinto, se
    rechaza: un valor distinto es un error, y corregirlo en silencio lo escondería.
  - FK compuestas atan `(variante_id, producto_color_id, talla_id)` a la variante y
    `(precio_id, variante_id)` al precio. Así, aunque el disparador se desactivara, la línea
    no puede decir M de una S ni cobrar con el precio de otra prenda.
  - Nadie inserta directo: se retira INSERT a `authenticated`, `anon` y `service_role`, y se
    elimina la policy `venta_items_insert` de V2 (`DICCIONARIO-RETAIL.md:621`). Solo escribe
    `registrar_venta` (security definer).
  - Congelar padre y familia hace que "ventas de 2026 por familia" no cambie hacia atrás si una
    hoja cambia de padre dentro de la misma familia (§1, ADR-0062).
  - Dos lecturas con nombre: "como eran" (fiscal, auditoría, boleta reimpresa, evaluación de
    la temporada contra lo planeado) y "como son" (reposición de hoy, pronóstico año contra
    año aunque se hayan reorganizado subcategorías). Los atributos descriptivos no se congelan
    (SH-08, STR-04, EN-10, H7, H9, SQ-03, QBO-05, H6 Salesforce).
  - El nombre de la categoría no se congela: renombrar "Blusas" a "Blusas y tops" no la
    reclasifica, y la copia guarda el id.
- **DESCARTÉ (1):** unir en vivo como Odoo (H6). Costo: cada reorganización reescribe
  temporadas pasadas y el taller planifica sobre números que nunca existieron.
- **DESCARTÉ (2):** un catálogo versionado completo como Square (SQ-03, en Beta). Costo: cada
  pantalla operativa tendría que filtrar la "versión actual".
- **SE ROMPE SI:** nadie decide qué lectura usa un reporte. Aparecen dos cifras distintas de
  "ventas de vestidos" y Felipe deja de confiar en las dos. La regla tiene que estar escrita
  en cada panel.

**D15. Movimientos: fecha de negocio, corrección enlazada, un solo origen y motivo cerrado.**
- **DECIDÍ:** conservar la forma del libro (tipo con signo, ADR-0023, ADR-0042, ADR-0068) y
  agregar varias piezas (EN-06, SQ-05, SQ-08, ODO-09, QBO-07):
  - `motivo_codigo` como FK a `motivos_movimiento`, con tipos permitidos, código de la tabla
    12 SUNAT, si lleva costo y **`origen_requerido`**: qué documento tiene que venir pegado
    (línea de venta, ítem de compra, línea de conteo, ítem de transferencia, producción,
    devolución, cambio, corrección o ninguno).
  - El disparador exige que venga ese documento y solo ese. No conoce ningún nombre de motivo:
    el literal `if motivo = 'venta'` desaparece. En la revisión crítica, un motivo `venta_pos`
    creado a mano como salida descontaba stock sin línea de venta.
  - Un motivo que no es de sistema (lo crea una persona) solo sirve para ajustes y traslados
    internos, y no trae documento (CHECK). Las entradas y salidas nacen siempre de una función
    con su documento.
  - `ocurrido_en` separado de `created_at`.
  - `corrige_movimiento_id` único.
  - `num_nonnulls(orígenes) <= 1`.
  - Una entrada de compra o de producción exige su capa en `costo_historial` al cerrar la
    transacción. El costo no se duplica en el movimiento (D29, ADR-0067).
  - `sububicacion_id` NOT NULL.
  - El tipo `traslado` solo entre sububicaciones de la misma sede (FK compuesta): entre sedes
    va en dos piernas.
  - **Candado completo del historial (ADR-0071 extendido):** disparadores `enable always`,
    `before truncate` por sentencia y retiro de INSERT, UPDATE, DELETE y TRUNCATE. Aplica a
    `movimientos` y a toda tabla que guarda historia: `venta_items`, `devolucion_items`,
    `precios`, `costo_historial`, `sunat_mapeo_categoria`, `demanda_no_atendida`,
    `surtido_eventos`, `propuestas_clasificacion` e `insumo_movimientos`. En el catálogo
    (`productos`, `producto_colores`, `variantes`, `codigos_barras`) aplica al no-borrado y al
    no-vaciado.
  - **Dependencia declarada con D-23 (el mes se cierra con llave):** el mes lo cierra
    `ocurrido_en`, la fecha del hecho, que es la que usa el kardex, no `created_at`. El
    candado de período **no existe** (ni `periodos_contables` ni `cerrar_mes`,
    `01-INVARIANTES.md:128`), y `ocurrido_en` solo tiene tope hacia el futuro: la revisión
    crítica insertó un movimiento de marzo de 2025 sin error.
- **Propuesta para cuando exista el cierre (decidir con Felipe y el contador, D-35):** una
  venta sin red que llega con su mes cerrado no se rechaza, porque D-49 dice que la caja no se
  congela y el estándar es no perder una venta. Entra con su `ocurrido_en` real y un período
  imputado igual al primer mes abierto, visible para el contador como "hecho tardío". Lo que
  sí se rechaza es un ajuste o traslado manual con fecha en un mes cerrado.
- **DESCARTÉ:** el modelo origen→destino siempre obligatorio de Odoo (ODO-06). Costo:
  reescribir todas las funciones del libro que ADR-0068 acaba de estabilizar, y la ganancia se
  logra con las columnas nuevas.
- **SE ROMPE SI:**
  - Una venta hecha sin red antes de un conteo sube después del cierre del conteo. La regla de
    Square (SQ-05) es que el conteo absorbe lo anterior. CAYLA la necesita en `cerrar_conteo`,
    y el borrador todavía no la modela.
  - Se construye el cierre de mes con `created_at` en vez de `ocurrido_en`. Una venta de
    marzo subida en abril descuadra abril y deja marzo "cerrado" sin ella.

**D16. La taxonomía estándar, si vuelve, vuelve versionada y periférica.**
- **DECIDÍ:** llaves `(version, id)` en todas las tablas `taxonomia_*`, anclajes que guardan
  la versión, anclaje solo a hojas (FK a `(version, id, es_hoja)`), color anclado solo a
  valores del atributo `color` (FK a `(version, id, atributo_handle)`), y la tabla
  `taxonomia_reemplazos` cargada desde `to_shopify.yml`. Subir de versión genera propuestas
  que la Líder confirma. Todo en la sección 8 del SQL, fuera del núcleo (SH-05, H10, IA-11,
  G1).
- **DESCARTÉ:** recrear las 5 tablas de V1 con `on conflict (id) do update`. Costo: anclajes
  apuntando a ids retirados sin aviso, justo en ropa.
- **SE ROMPE SI:** CAYLA sale a Google y Shopify publica un release que parte "Ropa de mujer"
  en 10 nodos sin mapeo 1:1. Es el caso que `to_shopify.yml` no cubre hoy (las 108 reglas de
  2026-02 eran todas 1:1) y habría que re-anclar a mano.

### 3.6 Frontera: stock por ubicación

**D17. El stock vive solo en hojas; la sede es una suma.**
- **DECIDÍ:** clave de stock `(variante_id, sububicacion_id)` con sububicación NOT NULL. El
  taller recibe una sububicación `general` y desaparecen las ramas "si la sububicación es
  NULL" de V2. "Vendible en sede" es la suma de las sububicaciones vendibles (EN-07, H4 Retail
  Pro, H1 de stock, H2 Shopify).
- **DESCARTÉ:** mezclar stock "en la ubicación" con stock "en su piso" (lo de hoy con
  `unique nulls not distinct`). Costo: cada función del libro termina con ramas especiales y la
  suma por sede depende de quién escribió la función.
- **SE ROMPE SI:** una sede nueva necesita tres almacenes (un almacén central compartido por
  TRU y AQP). La unicidad `(ubicacion_id, tipo)` lo impide: habría que convertir el central en
  su propia ubicación de tipo `almacen_central`.

**D18. La prenda que no se puede vender va a una sububicación `no_vendible`, con motivo.**
- **DECIDÍ:** la sububicación de tipo `no_vendible` por sede (físicamente, la caja de prendas
  con falla en la trastienda). Se entra con un traslado interno con motivo cerrado (dañada en
  piso, falla del taller, devolución por revisar). Cuenta en conteos y en valor físico, no en
  la venta ni en la cobertura. Es el patrón de Dynamics 365 Commerce, que crea "Damaged" y
  "Returns" en cada tienda (H3, H4).
- **DESCARTÉ:** un eje de estado en la clave de stock, como los estados de Shopify (SH-07).
  Costo: cambiar la clave de stock y todas las funciones del libro para tres o diez tiendas
  donde la prenda dañada de verdad se aparta físicamente.
- **SE ROMPE SI:** una prenda con falla tiene que quedarse en exhibición (el único maniquí de
  ese modelo). Ahí el estado no coincide con el lugar y hace falta el eje de estado.

**D19. El tránsito se deriva de `transferencias`; la posición proyectada lo suma.**
- **DECIDÍ:** respetar ADR-0068. En tránsito queda lo enviado menos lo recibido de las
  transferencias abiertas, no una ubicación fantasma. La posición proyectada por
  (variante, sede) es: vendible + tránsito entrante + producción del taller en curso con
  destino a la sede − reservado (H6, EN-09, SQ-06, INT-07).
  - **Pieza que faltaba:** en V2, `producciones` guarda solo el Taller (`ubicacion_id`,
    `20260915130000_produccion_del_taller.sql:79-81`), así que "en curso con destino a AQP" no
    se podía calcular. El borrador agrega `produccion_lineas.ubicacion_destino_id`. Una FK
    exige que el destino sea una tienda, y la misma talla puede ir a dos tiendas en la misma
    orden (3 M a AQP y 2 M a TRU). Vacío = sin destino decidido, y no suma a ninguna sede.
- **DESCARTÉ:** la ubicación "En tránsito" de Odoo y ERPNext. Costo: contamina cada selector
  de ubicación, como ya argumentó ADR-0068.
- **SE ROMPE SI:** un traslado queda "en tránsito" semanas porque nadie confirma. La
  mercadería desaparece de la vista de las dos sedes y la reposición la ve como ya enviada.
  Hace falta una alerta de "llegada estimada vencida" sobre `fecha_estimada_llegada`.

**D20. Vender desde el almacén de la misma sede no frena la caja; separar para una clienta
es una reserva.**

> **Esto es una propuesta de cambio de D-40, no algo que D-40 ya diga.** D-40 dice textual:
> *"se puede, y el sistema registra solo el paso por el piso"*
> (`DECISIONES-2026-09-12.md:214-215`). El mapa (`00-MAPA.md:238-242`) y el módulo 05
> (`05-inventario-y-movimientos.md:487-495`) lo leen así: la base registra sola la bajada
> almacén → piso y después la venta sale del piso. La versión anterior de este borrador
> reinterpretaba D-40 sin decirlo. Según el acta, una decisión se corrige primero en
> DECISIONES y después se propaga. **Decide Felipe.** Hasta entonces, rige D-40 tal como está
> escrita.

- **Lo que no está en discusión:** las dos formas cumplen la parte de D-40 que le importa a
  la clienta, *"la caja no se frena nunca por un trámite"*. Lo que cambia es qué cuenta el
  libro.
- **PROPONGO (DECIDÍ, pendiente de Felipe):** `registrar_venta` descuenta del piso y, si no
  alcanza, del almacén de la misma sede, y guarda en el movimiento la sububicación real. Un
  solo movimiento por prenda vendida.
- **DESCARTÉ:** la bajada automática registrada, como dice D-40: un traslado almacén → piso y
  la venta desde el piso, en la misma transacción.
  - **Ganas:** `registrar_venta` tiene un solo camino (siempre sale del piso), y queda rastro
    de que el almacén se está usando como piso, que es una señal de exhibición insuficiente.
  - **Costo real:** el libro cuenta un paso por el piso que no ocurrió. La serie 'piso' de
    `v_saldo_en_el_tiempo` (el denominador de la velocidad en D27) muestra la talla "a la
    vista" durante cero segundos. "Lo bajado al piso en AQP", que mide trabajo real de
    reposición, se infla con bajadas que nadie hizo. Y un conteo de piso abierto en ese
    momento ve entrar y salir una prenda que nunca estuvo en la percha. Son dos movimientos
    por cada venta desde atrás, y en TRU hoy 35 de 36 variantes están solo en almacén
    (BACKLOG): sería casi toda la venta de TRU.
- La tabla `reservas` (con vencimiento) resta de lo que se puede prometer, no del stock
  físico (H10, SF H10). **Candado:** al crear, reactivar o agrandar una reserva, lo reservado
  activo en esa sede no supera lo vendible, con las filas de stock bloqueadas antes de sumar.
  **No garantizado:** una venta posterior puede llevarse una prenda reservada (la caja no se
  frena) y dejar la reserva sin respaldo. Está declarado en §4.
- **DESCARTÉ (2):** stock negativo como Lightspeed o Dynamics 365 (LS-11, H3). Costo: rompe
  ADR-0023 y el aviso de "última unidad".
- **SE ROMPE SI:**
  - Piso y almacén dicen 0 y la prenda está en la mano de la clienta. Es la tensión D-40
    contra ADR-0023 y solo la resuelve Felipe.
  - Con la propuesta, alguien construye "cuánto se bajó al piso" contando traslados. Las
    ventas desde el almacén no aparecen ahí, y hay que leerlas del movimiento de venta con
    sububicación `almacen_tienda`.

### 3.7 Frontera: producto como línea de cobro

**D21. Todo lo que se cobra es una línea con tipo; ninguna prenda es falsa.**
- **DECIDÍ:** `venta_items.tipo_linea` con valores `prenda`, `servicio` o `cargo`. Una prenda
  exige variante, opción, talla, categoría y `precio_id`; un servicio o cargo exige no tener
  variante, y el cargo exige motivo. La unidad SUNAT sale del tipo (NIU o ZZ) y la afectación
  del IGV es de un vocabulario cerrado del catálogo 07. Base más IGV cuadran contra lo cobrado
  con tolerancia de un céntimo (STR-09, ODO-08, SUNAT-05, STR-07).
- **DESCARTÉ:** la variante centinela "Cargo especial (sin código)". Costo: una prenda falsa en
  `variantes` aparece en stock, en rankings y en conteos, y hay que filtrarla en cada reporte.
- **SE ROMPE SI:** CAYLA vende un conjunto (blusa + falda) a un solo precio. Tienen que ser dos
  líneas de prenda con descuento, o un set con componentes (GS1-09). Si se modela como una
  prenda con stock propio, la falda S vendida dentro del conjunto nunca cuenta como venta de
  falda S.

**D22. El comprobante se deriva de las líneas congeladas.**
- **DECIDÍ:** `comprobantes.items` (jsonb) se reemplaza por líneas derivadas de `venta_items`
  con identidad por línea, para que una nota de crédito parcial apunte a la línea exacta y la
  boleta reimpresa diga lo mismo que la aceptada (STR-04, LS-09 en lo que no depende de
  Lightspeed). Detalle en el módulo 08, fuera de este borrador SQL.
  - **La devolución por línea tiene candados en la base.** Son reglas de CAYLA, no heredadas
    de Stripe ni de SUNAT, porque aquí hay plata en juego: la nota de crédito y el efectivo
    del cajón.
    - `devolucion_items` lleva el `venta_id` de su cabecera, con dos FK compuestas: la línea
      devuelta y la devolución son de la misma venta.
    - Lo devuelto de una línea, sumando todas las devoluciones no rechazadas, no supera lo
      vendido. Un constraint trigger bloquea la línea vendida (`for update`) antes de sumar.
      Probado con dos sesiones reales que devuelven la misma unidad a la vez: la segunda se
      rechaza. En la revisión crítica, de una línea de 1 unidad salían 6 devueltas.
    - Una devolución rechazada no se reabre.
    - La talla sugerida ("se llevó la S") es de la escala de la prenda devuelta, por FK
      compuesta. Lo mismo vale para `demanda_no_atendida`.
  - V2 revisaba el tope solo dentro de `crear_devolucion` (`0003_funciones.sql:451-457`); el
    principio 5 pide que viva en la base.
- **DESCARTÉ:** la revisión de facturas de Stripe (anular y reemitir). Costo: el correlativo
  SUNAT es irreversible; lo peruano es nota de crédito o comunicación de baja.
- **SE ROMPE SI:** un comprobante se emite sin venta, como hoy con `venta_id` siempre vacío. Esa
  unión (D-34) es previa a esta decisión.

### 3.8 Frontera: código de producto SUNAT

**D23. Código SUNAT por categoría y público, validado contra el catálogo cargado, congelado en
la línea, que no bloquea la venta.**

> **Qué dicen las fuentes, releídas el 2026-09-16 [V]:**
> - **Página "Código de producto" de SUNAT** (modificada el 13-07-2026): no es requisito
>   mínimo de factura ni boleta.
> - **Reglas de validación actualizadas al 26-08-2026** (xlsx, hojas Factura2_0, Boleta2_0,
>   LiquidacionCompra2_0, Listados y Control de Cambios):
>   1. **Versión.** La hoja Catálogos dice UNSPSC v14_0801.
>   2. **ERR-3496 (rechazo si el código no está en el listado)** pasó de observación a error
>      el 24-04-2026. La celda de vigencia dice **"01/08/2026 01/01/2027"**, dos fechas sin
>      decir cuál rige para qué. Nubefact (fuente secundaria) habla de 01-01-2027. Si rige la
>      primera, ya está vigente para quien manda el tag. **Sin confirmar: preguntar a Lucode.**
>   3. **Anexos 25.1, 25.2 y 25.3: el propio xlsx se contradice.**
>      - Control de cambios 24-04-2026: los incorpora.
>      - Control de cambios 24-07-2026: *"retorna a v14 … se retiran los catálogos 25.1, 25.2
>        y 25.3"*. Ese cambio y su reversión en 2026 son la fuente de "SUNAT ya cambió el
>        listado y lo revirtió".
>      - Pero las filas de validación de Factura, Boleta y Liquidación de compra siguen
>        diciendo "Catálogo (025, 25.1, 25.2 y 25.3)", y la hoja Catálogos todavía trae esas
>        tres tablas.
>
>      **Sin confirmar: preguntar a Lucode qué listado valida hoy.**
>   4. **OBS-4331.** Si el RUC emisor está en el padrón `ind_padron = '12'` ("Obligado a
>      enviar código de producto") y la línea no trae ni código SUNAT ni GTIN, SUNAT **acepta
>      con observación**, no rechaza. Si CAYLA (RUC 20605964550) está en ese padrón, "no
>      obligatorio" es falso: sería obligatorio, aunque no bloquee. **No verificado:** esta
>      revisión no pudo consultar el padrón. Pista sin consultarlo: si los CDR de las boletas
>      ya aceptadas traen la observación 4331, el RUC está en el padrón.
>   5. **GTIN.** Va en otro tag, `cac:StandardItemIdentification/cbc:ID`, con `@schemeID`
>      GTIN-8, GTIN-12, GTIN-13 o GTIN-14. Si el largo no coincide: OBS-4334. Puede ir junto
>      al código SUNAT.
>   6. **Liquidación de compra.** No traer el tag es ERROR-3506, y ERR-3496 aplica desde las
>      mismas dos fechas (control de cambios 24-04-2026). Esa es la fuente del aviso "la
>      liquidación de compra sí exige código".

- **DECIDÍ:**
  - Cargar `sunat_catalogo_productos` (UNSPSC v14_0801, 49.022 códigos de 8 dígitos), con la
    columna `anexos`. Si SUNAT confirma que el listado validado incluye 25.1 a 25.3, se carga
    la unión sin cambiar la llave.
  - Crear `sunat_mapeo_categoria(categoria, público, código, vigente_desde)`, solo de agregar
    filas. Un código vacío con nota es una decisión válida: el catálogo no tiene polo de
    mujer ni códigos unisex.
  - Excepción opcional en el producto.
  - Copia congelada en la línea, con FK, más `gtin_esquema` y `gtin_codigo`. Un CHECK exige
    esquema válido, largo igual al del esquema y dígito verificador. Van en columnas propias
    porque es otro tag y puede viajar junto al código SUNAT (SUNAT-01, SUNAT-02, SUNAT-04,
    SUNAT-06, EN-11, QBO-09).
  - Si no hay código, la línea sale sin el tag. La venta no se bloquea: en el peor caso
    (padrón 12) SUNAT observa y no rechaza.
- **DESCARTÉ (1):** tipearlo por variante, o hacerlo obligatorio como exige Odoo para Perú
  (ODO-09). Costo: más de 1.000 filas mantenidas a mano, y una vendedora sin poder cobrar por
  un dato cuya falta, en el peor caso, genera una observación.
- **DESCARTÉ (2):** una sola columna `identificador_esquema` ('UNSPSC' o 'GTIN-n') con su
  valor. Costo: SUNAT acepta los dos tags en la misma línea, y una columna obliga a elegir uno
  y perder el otro.
- **SE ROMPE SI:**
  - Rige ERR-3496 y se manda un código que no existe en el listado: SUNAT rechaza la boleta.
    La FK lo hace imposible **solo** si el catálogo cargado es el mismo que valida SUNAT. Si
    SUNAT cambia el listado otra vez, como en 2026, y CAYLA no recarga, la FK deja pasar un
    código que SUNAT ya no acepta.
  - CAYLA está en el padrón 12 y nadie lo sabe: cada boleta sin código sale con OBS-4331 y el
    problema se ve en una fiscalización, no en la caja. Se confirma antes de la fase 2.

**D24. El público es vocabulario cerrado del producto.**
- **DECIDÍ:** `productos.publico` con valores mujer, hombre, niña, niño, bebé o unisex. Sirve
  tres veces: el código UNSPSC más fino depende de él, Google pide género y grupo de edad para
  toda prenda, y la inteligencia puede cortar por público (SUNAT-02, G2).
- **DESCARTÉ:** `productos.genero` como texto libre (V1). Costo: nadie lo lee y no sirve para
  ninguna salida legal.
- **SE ROMPE SI:** una prenda se vende como "mujer" y "niña" a la vez (tallas 10-12 que usan
  adolescentes). Se decide un público; el otro se pierde para SUNAT y Google.

### 3.9 Frontera: clasificación con IA

**D25. La IA es periférica, clasifica contra el vocabulario de CAYLA y deja propuestas
medibles.**
- **DECIDÍ:**
  - La tabla `propuestas_clasificacion` solo agrega filas y cada propuesta se decide una vez.
    Guarda modelo exacto, versión del prompt, acuerdo k de n y la puerta de entrada.
  - Candados en la base:
    - `campo` es una **lista cerrada** de 16 valores. En la revisión crítica, `campo='color'`
      con puerta automática entraba porque el CHECK solo nombraba `color_principal`: bastaba
      cambiarle el nombre al campo para saltarse la puerta humana.
    - **Lista blanca para entrar sin persona:** solo tejido, silueta, largo y manga, y con
      unanimidad. Todo lo demás pasa por una persona: categoría, colores, estampado, código
      de opción, nombre comercial, escala, talla, público, temporada y composición. Todos
      acuñan un código impreso, salen en la etiqueta o deciden un dato legal.
  - **Regla de la aplicación, no candado de la base:** un porcentaje sorteado de lo que
    entraría solo va igual a revisión (puerta `auditoria`). La base no puede sortear sin un
    cliente que decida. Lo que sí da es medirlo: `v_tasa_auditoria_ia` muestra la tasa
    auditada y la de corrección por modelo, versión de prompt y campo. Si la tasa auditada cae
    a 0, se ve ahí.
  - Dos etapas: primero la categoría hoja, después solo los atributos de esa categoría.
  - Enum de ids reales.
  - "No sé" como valor centinela, no como null.

  Fuentes: IA-01, IA-04, IA-05, IA-06, IA-07, SH-10.
- **DESCARTÉ (1):** clasificar contra los nodos del estándar de Shopify. Costo: no caben como
  enum (OpenAI tiene un tope de 1.000 valores y Anthropic un límite interno de gramática), y
  no aportan a la operación.
- **DESCARTÉ (2):** la confianza que el modelo declara de sí mismo (alta, media o baja, como
  en V1). Costo: está documentado que es sobreconfiada (IA-06), así que el error que marca
  "alta" es justo el que nadie revisa.
- **DESCARTÉ (3):** el llenado nocturno sin revisión de Odoo (ODO-11).
- **SE ROMPE SI:** el alta de producto depende de la API. Regla: si la API no responde, el
  formulario funciona igual sin sugerencias. Otro caso: el modelo se retira (Haiku 4.5, no
  antes del 15-oct-2026, IA-10) y el nuevo mueve las propuestas sin que nada falle. Sin un
  examen fijo de unas 100 prendas etiquetadas por la encargada, esa deriva no se ve.
- **Objeción:** para lo que fabrica el taller, tela, composición y estampado se conocen en la
  orden de producción. Ahí no hace falta IA; la IA es para mercadería comprada y datos
  viejos.

### 3.10 Frontera: inteligencia y predictibilidad

**D26. Surtido explícito por modelo-color y sede.**
- **DECIDÍ:**
  - La tabla `surtido` con: si es intencional, fecha de lanzamiento en esa sede, estado local
    (vigente o retirado) y mínimo de presentación ("con menos de 3 en percha ya no luce").
  - Una devolución que llega a una sede que no tenía el modelo crea surtido no intencional,
    que no dispara alertas (ORA-09, h9, INT-02).
  - La **fecha de lanzamiento, una vez puesta, no cambia**: moverla hace que una talla lenta
    "parezca nueva".
  - Cada cambio de surtido queda en `surtido_eventos`, que solo acepta filas nuevas y lo
    escribe la base. La alerta de hace tres meses se relee con los parámetros de ese día.
  - "En liquidación" **no** es un estado del surtido: se deriva del precio (D13-bis).
- **DESCARTÉ:** deducir el surtido del stock. Costo: "XL en cero en Arequipa" no distingue
  agotada de nunca traída, la alerta grita en falso y la encargada aprende a ignorarla en una
  semana.
- **SE ROMPE SI:** nadie mantiene el surtido cuando se reparte mercadería nueva. Tiene que
  nacer solo del primer traslado planificado o de la recepción, no de una pantalla aparte.

**D27. La talla rota es una regla estructural; la talla que sobra es una comparación contra
la curva agrupada.**
- **Primero, separar dos preguntas que la versión anterior mezclaba:**
  - **¿Cuándo comprarle al proveedor?** Es una decisión de empresa: el proveedor despacha para
    CAYLA, no para AQP. La responde el **punto de reorden global por producto** de
    `20260916100000_punto_reorden.sql`, elegido por Felipe con `stock_minimo` como piso
    (decisión del 15-sep). **Se conserva.** Aviso, sin descartarlo: suma todas las tallas, y
    si un proveedor vende por talla, la compra va a necesitar la curva. Es pregunta abierta.
  - **¿Qué hago hoy en esta sede con esta talla?** Bajar, trasladar, pedir al Taller o
    liquidar. La responden las alertas de abajo. `comprar` **no** es una acción por sede
    (CHECK en `recomendaciones_reposicion`).
- **DECIDÍ (alertas por sede):**
  - **Alerta A (talla rota):** en un modelo-color surtido, una talla clave está en 0 en el piso
    mientras otra talla está en su mínimo o más. La acción va en orden fijo: bajar del almacén
    de la misma sede, trasladar, y señalar al Taller (`producir`). La vista `v_tallas_rotas`
    del borrador lo calcula. `producir` es la señal de una sede: la orden del Taller la agrega
    y le pone destino por línea (D19).
  - **Alerta B (talla que sobra):** después de N semanas desde el lanzamiento en esa sede, el
    sell-through de una talla se aleja de la curva agrupada por escala × categoría × sede. Si
    esa sede no alcanza volumen, se usa la curva de la red.
  - **Velocidad:** se divide entre los días con la talla **en el piso**. Es la serie `piso` de
    `v_saldo_en_el_tiempo`, derivada del libro con piernas firmadas por sububicación: el
    origen resta y el destino suma. El almacén no cuenta como "a la vista". La serie
    `vendible` (piso + almacén) queda aparte. En la versión anterior, un traslado a
    `no_vendible` sumaba 0 y el almacén contaba como a la vista (probado: 4 al piso, 2 al
    almacén y 2 a fallas deja piso 0 y vendible 2).
  - **Solo ventas a precio regular** = `venta_items.tipo_precio = 'regular'`, congelado al
    cobrar. Es **una sola fuente** del estado de liquidación: el precio.
    `producto_colores.estado` quedó en vigente o salida, `surtido.estado` en vigente o
    retirado, y "está en liquidación hoy en AQP" se lee de `v_precio_descuento_vigente`.
  - **Recomendaciones:** se guardan con sus insumos para poder auditar "por qué dijo reponer"
    (INT-01, INT-05, INT-08, ORA-10, EN-09, H5 Retail Pro, LS-08). Un CHECK exige que el jsonb
    traiga las tallas clave, el lanzamiento y el estado del surtido de ese día. El lead time
    lleva su origen (`medido_producciones`, `medido_traslados` o `supuesto`): hoy no hay
    medición del Taller, y un supuesto no puede presentarse como medido.
- **DESCARTÉ:** mínimos y máximos tipeados por variante y sede (Odoo ODO-10, ERPNext EN-09,
  Retail Pro H5). Costo: con 5 a 10 sedes y 1.000 variantes, son entre 5.000 y 10.000 números
  que nadie mantiene, y un promedio que hace parecer lenta justo a la talla que se agotó
  primero.
- **SE ROMPE SI:** los volúmenes no alcanzan ni a nivel red. El número, con sus supuestos
  declarados:
  - **Ventas:** 20 tickets por día por sede, dentro del rango de 10 a 50 que fijó Felipe el
    2026-09-05 (parámetros de escala).
  - **Prendas por ticket:** ~1,4, supuesto sin medir.
  - **Resultado:** una sede vende unas 10.200 prendas al año.
  - **Reparto:** si una sede tiene surtidas ~1.000 variantes (el "1000+ SKUs" del mismo
    parámetro), da **~0,2 prendas por variante-sede por semana**. Con los 300 a 900 SKUs que
    dice `docs/BACKLOG.md:1510`, da 0,2 a 0,65.
  - La versión anterior hablaba de "~175 modelos" sin fuente; ese número se retira.

  Cualquiera de los dos es demasiado poco para una curva por modelo en una sede. La alerta B
  sirve por categoría, no por modelo, y hay que decirlo en la pantalla.
  - **Aviso de verificación:** los umbrales de Oracle (4 unidades, 2 semanas, correlación
    0,75) son valores de 2019 que la guía vigente ya no publica.
  - **Aviso de verificación:** el "200 unidades" de Nextail viene de su documentación legacy
    y funciona como peso de mezcla, no como descarte.
  - Ninguno de los dos se cita como regla vigente.

**D28. Dos señales que ningún conteo de stock da: devolución por talla y demanda no atendida.**
- **DECIDÍ:**
  - `motivos_devolucion` cerrado y por prenda (talla grande, talla pequeña, color, estilo,
    falla, cambio de opinión), anclado a los handles de Shopify, con la talla que la clienta
    se llevó a cambio (SH-11).
  - `demanda_no_atendida`: un botón en el POS, "la clienta pidió esta talla y no había"
    (GS1-11, idea adaptada sin QR).
- **DESCARTÉ:** esperar a tener GS1 Digital Link para capturar la demanda desde el probador.
  Costo: la señal empieza a existir años tarde.
- **SE ROMPE SI:** la vendedora no aprieta el botón en hora punta. La señal subestima la
  demanda de sábado; sirve para comparar tallas entre sí, no para contar unidades perdidas.

**D29. Costo: un solo libro, el de ADR-0067.**
- **DECIDÍ:** alinearse con ADR-0067, que está aplicado en producción:
  - `variantes.costo` se **conserva** como promedio ponderado derivado. Solo lo escribe
    `fn_recalcular_costo_variante`, llamada por `recibir_lote`, `recibir_compras` y
    `cerrar_produccion` antes de `fn_aplicar_movimiento`.
  - `costo_historial` es el **único** libro de capas: una fila por entrada que crea costo, con
    `movimiento_id`, cantidad y costo unitario nuevos, y el costo resultante.
  - El borrador **retira** `movimientos.costo_unitario`.
  - Candado: una entrada cuyo motivo lleva costo no cierra la transacción sin su fila en
    `costo_historial`.
  - La línea de venta congela `variantes.costo` al cobrar, y lo escribe la base (D14)
    (QBO-06, SQ-12, STR-04).
- **DESCARTÉ:** `movimientos.costo_unitario` como libro de capas, que era la versión anterior.
  Costo: dejaba el costo en dos libros (movimiento y `costo_historial`), que es la misma
  pregunta resuelta dos veces. ADR-0067 lo descartó por integridad conceptual. Además
  obligaba a tocar las cuatro funciones de arriba, y la tabla de §7 decía "compatible" sin
  listarlas.
- **Lo que la versión anterior temía y no pasa:** "cambiar de promedio a PEPS se vuelve
  imposible". `costo_historial` guarda cantidad y costo de cada entrada, así que las capas se
  reconstruyen. Lo que no guarda es qué capa consumió cada venta: con PEPS, eso se recalcula
  en orden desde el libro.
- **SE ROMPE SI:**
  - Una entrada del Taller no tiene costo final el día que se cierra la producción: D-31 pide
    costo absorbido, y la mano de obra se conoce a fin de mes. Hoy el candado obliga a poner
    un costo en ese momento, y un costo provisional se queda como definitivo. Hace falta una
    fila provisional en `costo_historial` con corrección enlazada; ni V2 ni el borrador la
    modelan.
  - El contador pide PEPS con capas consumidas por venta. Habría que agregar
    `consumos_de_capa`, que no existe.

### 3.11 Frontera: insumos del Taller

**D30. Tela y avíos van en tablas periféricas propias, no en el catálogo de prendas.**
- **Por qué hace falta decidirlo aquí:** D-46 pone la materia prima del Taller como prioridad
  2 de Felipe, y D-47 pide que la tela entre, se descuente al cortar y avise cuando falta. La
  versión anterior de este borrador la hacía imposible sin decirlo: la familia es un CHECK de
  6 valores sin insumos, la variante exige talla y opción, `stock.cantidad` es entero y la
  unidad es NIU. Una tela en metros no tenía dónde vivir.
- **DECIDÍ (opción A):** tablas periféricas en la sección 9 del SQL, con la forma mínima que
  el núcleo necesita.
  - `unidades_medida`, con el código del catálogo 03 de SUNAT, que remite a UN/ECE Rec. 20
    (MTR, KGM y NIU se validan contra esa lista antes de sembrar).
  - `insumos` (tela, avío, empaque; unidad; material si es de una fibra).
  - `insumo_stock` con cantidad `numeric(12,3)` no negativa.
  - `insumo_movimientos`, que solo acepta filas nuevas: el consumo exige su orden de
    producción, y la entrada exige costo.

  El diseño completo, con consumo estándar por modelo y talla y merma, va en el ADR del
  Taller.
- **DESCARTÉ (1):** meter los insumos como productos o variantes con una familia 'insumos'.
  Costo: talla y opción son obligatorias y el stock es entero. Además, la tela aparecería en el
  POS, en los conteos de tienda y en los rankings, y habría que filtrarla en cada reporte: el
  mismo error que la variante centinela "Cargo especial" (D21).
- **DESCARTÉ (2):** dejar los insumos fuera del alcance. Costo: la ventaja de §6 (una talla
  rota se convierte en una orden de producción) no puede verificar si hay tela. D-47 es
  prioridad 2, y diseñar la identidad de prenda sin ver dónde vive la tela obliga a rediseñar
  después.
- **Qué pasa en §6 mientras no exista el consumo estándar:** la recomendación `producir`
  sale con `tela_verificada` vacío ("sin verificar tela"), no como si hubiera tela. Un CHECK
  impide que ese campo tenga valor en otra acción.
- **SE ROMPE SI:**
  - Un insumo también se vende suelto (botones o cintas en tienda). No comparte identidad: se
    crea como producto aparte, y la conversión entre los dos es un movimiento en cada libro.
  - La tela se compra por rollo y se consume por metro con merma variable. Hace falta
    conversión de unidades y merma por corte, que la forma mínima no tiene.

---

## 4 · Estados imposibles

Cada fila es algo que **nunca** debe existir y la pieza de base que lo impide (nombres del
borrador SQL). Las marcadas con (P) se comprobaron el 2026-09-16 en un Postgres 17.10
desechable con `prueba-estados-imposibles.sql`: 102 casos, 102 ok. Las que dicen
"(P, concurrencia)" se probaron con dos sesiones reales a la vez.

**Identidad y catálogo**

| Estado que nunca debe existir | Candado en la base |
|---|---|
| "Vestido Aurora, Flores vino, M" dos veces con stocks separados (P) | `variantes_identidad_unica unique (producto_color_id, talla_id)` con ambas NOT NULL |
| La misma combinación de colores y estampado cargada como dos opciones del mismo modelo (P) | `producto_colores_combinacion_unica ... nulls not distinct` |
| Una variante con el color de otro modelo | FK `(producto_color_id, producto_id)` → `producto_colores(id, producto_id)` |
| Una talla de calzado en una blusa | FK `(producto_id, escala_talla_id)` → `productos` y `(talla_id, escala_talla_id)` → `tallas` |
| Cambiar la talla, el color o el código de una variante ya creada (P) | disparador `variantes_identidad_inmutable` |
| Una etiqueta `VEL-0001-VIN-L` en una variante S, o el código de otro modelo en esta prenda (P) | disparador `variantes_codigo_compuesto` (lo compone la base) |
| Un QR `cayla_corto` que no es el código de su prenda; dos códigos cortos por prenda (P) | disparador `codigos_barras_corto_coherente` + `codigos_barras_un_cayla_corto` |
| Un modelo que nace con el prefijo de otra categoría (P) | disparador `productos_reglas` |
| "M" y "m " como tallas de la misma escala; dos tallas en el mismo puesto de la curva | `tallas_codigo_unico_en_escala`, `tallas_orden_unico_en_escala` |
| XXL y 2XL como dos tallas que parten la curva (P, si el sinónimo está declarado) | `tallas_sinonimos` + disparadores `tallas_reglas` y `tallas_sinonimos_reglas` |
| Mover de puesto en la curva una talla que ya tiene prendas (P) | disparador `tallas_reglas` |
| Un código de talla con separador que rompe el código de variante ("10-12") (P) | `tallas_codigo_formato` |
| Un producto colgado de una categoría que tiene subcategorías (P; P, concurrencia) | disparador `productos_reglas`, con la categoría bloqueada antes de mirar |
| Darle hijas a una categoría que tiene productos (P, concurrencia) | disparador `categorias_reglas`, con el padre bloqueado antes de mirar |
| Cambiar el prefijo o la familia de una categoría con productos (P) | disparador `categorias_reglas` |
| Cambiar la familia de un padre cuando una hija tiene productos (P); una hija que no sigue la familia nueva de su padre (P) | disparadores `categorias_reglas` y `categorias_propaga_familia` |
| Una hija en otra familia que su padre (P); un segundo nivel de subcategoría | disparador `categorias_reglas` (el tope de un nivel no se probó) |
| "Estampado" como matiz de color | `colores_familia_valida` sin 'estampado' + tabla `estampados` |
| Un producto de temporada sin temporada | `productos_temporada_si_es_de_temporada` |
| Mover el inicio de venta (o el código, año o tipo) de una temporada con productos (P) | disparador `temporadas_reglas` |
| Un EAN con dígito verificador malo o un RCN "04" guardado como GTIN (P) | `codigos_barras_gtin_valido` con `fn_gtin14` |
| El mismo GTIN registrado como 13 y como 14 dígitos (P) | `codigos_barras_gtin14_unico` |
| Un escaneo que lleva a dos prendas | `codigos_barras_codigo_unico` |
| Dos códigos "principales" por prenda | `codigos_barras_un_principal` |
| Editar un código de barras ya pegado | disparador `codigos_barras_inmutable` |
| Una etiqueta de composición que no suma 100%, también en el grupo del que se sacó una fibra (P) | constraint trigger diferido `composiciones_suma_100` (revisa OLD y NEW) |
| Reescribir la composición de prendas que ya se movieron (P) | disparador `composiciones_reglas` |
| Composición de modelo y de color para la misma pieza y parte (P) | disparador `composiciones_reglas` |
| Un modelo vigente de categoría con etiqueta textil sin composición principal, también al agregarle una opción (P) | constraint triggers diferidos `productos_etiqueta_textil`, `producto_colores_etiqueta_textil`, `composiciones_etiqueta_textil` |
| "Algodón" guardado como valor de Manga | FK `(valor_id, atributo_id)` → `atributo_valores(id, atributo_id)` |
| Preguntarle "tipo de tacón" a una blusa | disparador `producto_atributos_aplica` |

**Precio**

| Estado que nunca debe existir | Candado en la base |
|---|---|
| Dos precios regulares vigentes a la vez para la misma prenda (P) | `precios_regular_sin_superposicion exclude using gist` |
| Un precio regular distinto en una sede (P) | `precios_regular_es_nacional` |
| Dos descuentos encimados con el mismo alcance (P) | `precios_descuento_sin_superposicion exclude using gist` |
| Una rebaja nacional encimada con una de sede (P) | disparador `precios_reglas_al_abrir` |
| Una "rebaja" igual o mayor que el regular vigente al empezar (P) | disparador `precios_reglas_al_abrir` |
| Cambiar el monto de un precio usado (P) | disparador `precios_solo_se_cierra` |
| Cerrar un precio con fecha pasada o antes de la última venta que cobró (P) | disparador `precios_solo_se_cierra` |
| Una rebaja sin motivo | `precios_rebaja_con_motivo` |

**Línea de cobro, devolución y SUNAT**

| Estado que nunca debe existir | Candado en la base |
|---|---|
| Una línea que dice talla M de una variante S, o la opción de otra prenda (P) | FK `venta_items_copia_es_de_la_variante` + disparador `venta_items_copia_desde_catalogo` |
| Una línea cobrada con el precio de otra prenda, o con un monto que no es el de la etiqueta (P) | FK `venta_items_precio_de_la_variante` + disparador `venta_items_copia_desde_catalogo` |
| Una línea con la categoría padre en vez de la hoja, o con una familia que no era la suya ese día (P) | disparador `venta_items_copia_desde_catalogo` |
| Insertar una línea de venta sin pasar por `registrar_venta` | retiro de INSERT a `authenticated`, `anon`, `service_role` (probado con los roles creados) |
| Una prenda vendida sin talla, color, categoría o precio de lista congelados | `venta_items_prenda_completa` |
| Una prenda falsa para cobrar un monto manual | `venta_items_no_prenda_sin_variante` + `tipo_linea` |
| NIU en un servicio o ZZ en una prenda | `venta_items_unidad_coherente` |
| Base más IGV que no cuadran con lo cobrado | `venta_items_base_mas_igv_cuadra` |
| Un GTIN declarado cuyo largo no es el de su esquema (OBS-4334) o con dígito malo (P) | `venta_items_gtin_coherente` |
| Reescribir una línea de venta | disparador `venta_items_inmutable` |
| Devolver más de lo vendido, sumando varias devoluciones (P; P, concurrencia) | constraint trigger `devolucion_items_no_supera_lo_vendido` con la línea bloqueada |
| Devolver en la boleta de una venta la línea de otra venta (P) | FK `devolucion_items_linea_de_la_venta` y `devolucion_items_cabecera_de_la_venta` |
| Sugerir una talla de otra escala al devolver, o pedir una talla de otra escala como demanda no atendida (P) | FK compuestas `devolucion_items_escala_de_la_linea`, `devolucion_items_talla_sugerida_de_la_escala`, `demanda_escala_del_modelo`, `demanda_talla_de_la_escala` |
| Reabrir una devolución rechazada | disparador `devoluciones_rechazada_es_final` |
| Un código SUNAT que no existe en el Catálogo 25 cargado | FK a `sunat_catalogo_productos` en producto, mapeo y línea de venta |

**Stock, libro y sedes**

| Estado que nunca debe existir | Candado en la base |
|---|---|
| Stock negativo | `stock_cantidad_no_negativa` |
| Stock de una sede guardado en el piso de otra | FK `(sububicacion_id, ubicacion_id)` |
| Un traslado instantáneo entre sedes (P) | `movimientos_traslado_interno_misma_sede` |
| Un motivo creado a mano que descuenta o suma stock ("venta_pos" como salida) (P) | `motivos_no_sistema_solo_ajuste_o_traslado` |
| Una salida "por venta" sin línea de venta; una compra sin ítem de compra; una línea de venta pegada a una merma (P) | disparador `movimientos_motivo_coherente` con `motivos_movimiento.origen_requerido` |
| Una entrada de compra o producción sin su capa de costo (P) | constraint trigger diferido `movimientos_con_capa_de_costo` → `costo_historial` |
| Un motivo de movimiento escrito a mano | FK `motivo_codigo` → `motivos_movimiento` |
| Compensar dos veces el mismo error | `movimientos_una_correccion_por_movimiento` |
| Borrar o editar un movimiento, también en modo réplica (P) | disparador `movimientos_inmutables` en `enable always` |
| Vaciar con TRUNCATE (directo o en cascada desde variantes, ventas o ubicaciones) el libro, las líneas de venta, las devoluciones, los precios, el mapeo SUNAT, la demanda no atendida u otra tabla con historia (P) | `before truncate for each statement` en `enable always` en las 14 tablas de §10.1 del SQL + retiro de TRUNCATE (ADR-0071 extendido) |
| Un saldo "a la vista" que cuenta el almacén, o que no baja cuando una prenda va a no vendible (P) | vista `v_saldo_en_el_tiempo` con piernas firmadas y series `piso` y `vendible` |
| Prometer en reservas más de lo vendible de la sede al reservar (P) | constraint trigger `reservas_no_supera_lo_vendible` con el stock bloqueado |
| Mover la fecha de lanzamiento de una sede ya fijada (P); un cambio de surtido sin rastro (P) | disparador `surtido_reglas` + `surtido_eventos` |
| Producir con destino al Taller o a un almacén (P) | FK `produccion_lineas_destino_es_tienda` |
| Recomendar "comprar" por sede (P) | `recomendaciones_accion_valida` |
| Una recomendación sin las tallas clave, el lanzamiento y el estado del surtido con que se calculó | `recomendaciones_insumos_minimos` |
| Una tienda o el Taller sin su sede de Dynamic (P); dos ubicaciones para la misma sede (P) | `ubicaciones_sede_obligatoria`, `ubicaciones_una_por_sede` |
| Un código de sede escrito en retail que contradice a Dynamic (el Taller como "tienda de Lima") | no existe la columna: el código se lee por `v_ubicaciones` (P: el Taller se encuentra por tipo) |

**Clasificación con IA**

| Estado que nunca debe existir | Candado en la base |
|---|---|
| Auto-aceptar la categoría, un color, el nombre comercial o cualquier campo que acuña un código o sale en la etiqueta (P) | lista blanca `propuestas_auto_solo_descriptivo` |
| Saltarse la puerta humana cambiándole el nombre al campo (P) | lista cerrada `propuestas_campo_valido` |
| Anclar un color a "Algodón" o una categoría a un nodo intermedio | FK `(version, valor_id, atributo_handle)` y `(version, id, es_hoja)` |

**Lo que el borrador NO hace imposible (queda como costumbre o como pieza pendiente, hay que
saberlo):**
- Que el surtido esté al día.
- Que la vendedora apriete "no había talla".
- Que el catálogo SUNAT cargado sea el que valida SUNAT (D23: el propio xlsx se contradice
  sobre 25.1 a 25.3).
- Que un conteo absorba ventas sin red anteriores a su cierre.
- Que una reserva vencida se marque vencida (hace falta un job).
- **Escribir un movimiento o una venta con fecha de un mes ya cerrado.** D-23 pide cerrar el
  mes con llave, pero no existe el candado de período y `ocurrido_en` solo tiene tope hacia el
  futuro (D15).
- **Que una venta se lleve una prenda reservada** y deje la reserva sin respaldo. Es a
  propósito: la caja no se frena (D20).
- **Que el sorteo de auditoría de la IA ocurra.** Es regla de la aplicación. La base solo lo
  mide (`v_tasa_auditoria_ia`).
- **Que una rebaja sobreviva a su regular cerrado sin un regular nuevo.** La venta de esa
  prenda falla hasta que se abra uno (D13).
- **Que un sinónimo que nadie sembró ("XXG") se cree como talla nueva** y parta la curva (D2).
- **Que la tela alcance para producir.** Mientras no exista el consumo estándar del modelo,
  `producir` sale "sin verificar tela" (D30).
- **Que el costo del Taller sea el final al cerrar la producción** (D29, D-31).
- Que alguien con la llave de dueño (`postgres`) desactive un disparador: es DDL y queda en el
  log (ADR-0071).

---

## 5 · Tabla comparativa de referentes

| Referente | Variantes y atributos | Jerarquía | Identificadores | Histórico | Stock por ubicación | Línea de cobro |
|---|---|---|---|---|---|---|
| Shopify | 3 opciones, 2048 variantes, candado de combinación; atributos de categoría no crean stock; color-patrón con lista de colores | 1 categoría estándar (hoja) + tipo libre | SKU y barcode repetibles | taxonomía con releases que retiran ids + mapeo | estados excluyentes por tienda; bins solo reparten lo físico | congela título, variante y precio |
| Stripe + SUNAT | Product plano por talla×color | no tiene | Price inmutable, lookup_key | Price se archiva, no se edita | no tiene | congela monto e impuestos; nota de crédito por línea (el tope "lo devuelto no supera lo vendido" es regla de CAYLA, no de Stripe: D22) |
| QuickBooks Online | variantes retiradas el 1-jun-2026 (antiejemplo) | 4 niveles, vendible en la última rama | nombre único, SKU repetible | SyncToken; audit log de 2 años | un solo QtyOnHand; ubicación es etiqueta | congela precio y cuenta |
| Odoo 19 | 3 modos de atributo; valores globales ordenados; unicidad parcial `WHERE active` | árbol libre con costeo en la categoría (antiejemplo) | referencia no única; barcode validado en Python | archiva; reporte une en vivo (antiejemplo) | origen→destino siempre; quants duplicados que se fusionan (antiejemplo) | todo es producto; congela descripción |
| ERPNext v16 | plantilla/variante; unicidad en Python | árbol nested set | código como PK con renombrado en cascada (antiejemplo) | anula con UPDATE y reescribe saldos (antiejemplo) | stock solo en hojas; tránsito en dos pasos | congela grupo, nombre, precio de lista |
| Square | item options con `ordinal`, 6 ejes | varias categorías + 1 de reporte | SKU/UPC en variación, sin unicidad | versión de catálogo en la línea (Beta) | ajuste de estado a estado; conteo absoluto por hora de ocurrencia; transfer orders | congela nombre y versión |
| Lightspeed | familia/variante, 3 atributos, 200 variantes | 1 categoría, borrar deja huérfanos | varios códigos con tipo, sin validar formato | version, deleted_at | conteo con cantidad del primer escaneo; stock negativo permitido | congela precio y tasas (no verificable que "congele" costo) |
| GS1 | GTIN por estilo×color×talla, 1:1 inmutable | GPC grueso (un brick para camisa/blusa/polo, no verificado) | GTIN sin inteligencia, nunca reutilizado; RCN solo lineal | reservado vs publicado | no aplica | set/multi/pre-pack |
| Google + Schema.org | variesBy, mismos ejes en todo el grupo; color + pattern | taxonomía congelada 2021, 5.595 nodos | id inmutable, GTIN validado o brand+MPN | cambiar id borra historial | inventario local por store_code | no aplica |
| Akeneo + commercetools | CombinationUnique solo se afloja; ejes no vacíos | 1 tipo fijo + categorías N:M | UUID + generador que no renumera | versiones purgadas a 90 días / 1-3 años | contador por SKU y canal | congela en el pedido |
| Oracle / D365 / SAP | diffs con grupos ordenados; solo color y talla crean variante | 6 niveles, ítem en subclase; jerarquías suplementarias | barcode subordinado con tipo | ciclo de vida por proceso; temporada con fechas | surtido ítem×tienda; estado bloqueado como dimensión | línea auditada con jerarquía al vender |
| SUNAT y rotulado andino | composición por pieza y parte, 100% | no aplica | UNSPSC 8 dígitos por línea; GTIN por largo | mapeo versionado, kardex con el mismo código | tabla 12 de operaciones | NIU/ZZ, afectación 07, gratuitas con 9996 |
| Stock multi-sistema | no aplica | no aplica | no aplica | idempotencia obligatoria (Shopify 2026-04) | venta no se bloquea por ubicación interna; estado ≠ lugar; tránsito en dos pasos | no aplica |
| Inteligencia (Zara, Nextail, Oracle, Toolio, Blue Yonder) | tallas clave; escala compartida; opción estilo-color | categoría hoja comparable | no aplica | fecha de llegada por producto-tienda | display cover vs store cover | precio regular vs precio de venta en cada venta |
| IA (Shopify, Claude, OpenAI, AWS A2I) | dos etapas: categoría, luego atributos de esa categoría | equivalencia categoría = categoría + atributos | enum de ids reales | modelos con fecha de retiro | no aplica | no aplica |
| Versionado (Shopify, Square, Stripe, Odoo, ERPNext, Kimball, PG) | identidad de variante inmutable | reorganizar sin reescribir el pasado | nunca renombrar llaves humanas | Type 7 liviano; `EXCLUDE` para vigencias | no aplica | referencia viva + copia congelada |
| Salesforce / Retail Pro / Infor | master > variation group > variante; grillas de talla ordenadas | clasificación única + vitrinas N:M | variante con nombre copiado en la línea | historia desde documentos, desactivar en vez de borrar | tienda = suma de sububicaciones; min/max por ítem y tienda | línea copia nombre y categoría |

### Qué tomamos y qué descartamos

| Tomamos | De quién | Por qué, en tienda |
|---|---|---|
| Candado de combinación de ejes en la base | Shopify, commercetools | Cuatro personas en el censo no crean dos veces la misma prenda |
| Talla ordenada con escala y tallas clave | Oracle diffs, Square ordinal, Zara S+ | Sin orden no hay "se está quedando la M" |
| Nivel modelo-color | Salesforce, Infor, Oracle | Se liquida el vino sin tocar el negro; la foto es la del color pedido |
| Color base + estampado aparte | Shopify color-patrón, Google | Dos estampados del mismo modelo conviven y se analizan por separado |
| Código acuñado una vez sobre uuid, compuesto por la base | Akeneo, lección de ERPNext, V2 de CAYLA | La etiqueta pegada en junio sigue escaneando en diciembre y dice la talla que se descuenta |
| GTIN validado y normalizado a 14 | GS1, Google, Odoo GS1 | Un EAN mal tipeado en la recepción no entra "bien" |
| Precio con vigencia, sin sobrescritura | Stripe, ERPNext (con EXCLUDE que ERPNext no tiene) | Se sabe si una talla solo se vende rebajada |
| Línea de venta congelada + dos lecturas | Shopify, ERPNext, Kimball | La boleta reimpresa a los 8 días dice lo mismo; el taller planifica con números reales |
| Stock solo en hojas, sede como suma | ERPNext, Retail Pro | Se acaban las ramas "si es almacén" y la venta desde el almacén tiene dónde registrarse (el mecanismo lo decide Felipe, D20) |
| Sububicación de no vendible | Dynamics 365 Commerce | La blusa manchada no cuenta como vendible ni apaga la reposición |
| Surtido explícito | Oracle ranging, commercetools selections | Las alertas no gritan por modelos que esa sede nunca tuvo |
| Días con la talla en el piso como denominador | Zara, Toolio, Nextail | La talla que vuela no parece lenta por haberse agotado, y la que está guardada atrás no cuenta como a la vista |
| Motivo de devolución por prenda | Shopify return_reasons | "Le quedó chica" se vuelve señal de horma para el taller |
| Propuesta IA medible y con puerta humana | Shopify, AWS A2I | Se sabe si la IA ahorra trabajo; ningún código impreso cambia solo |

| Descartamos | De quién | Por qué, en tienda |
|---|---|---|
| Ejes genéricos N | Shopify, Square, Odoo | CAYLA tiene dos; la unicidad genérica termina en código de aplicación |
| Aplanar variantes | QuickBooks | La talla deja de ser dato y queda dentro de un nombre |
| Código como llave con renombrado | ERPNext / Frappe | Reescribe ventas pasadas y deja etiquetas mintiendo |
| SKU / barcode repetibles | Shopify, QuickBooks | La pistola tiene que encontrar una prenda |
| Categorías N:M para reportes | Square, commercetools | La venta por categoría no cuadra con la sede |
| Costeo y cuentas en la categoría | Odoo | Obliga a partir "Blusas taller" de "Blusas compradas" |
| Unir en vivo la categoría en reportes | Odoo | Reorganizar reescribe temporadas pasadas |
| Saldos que se fusionan después; stock negativo | Odoo, Lightspeed, D365 | Choca con "última unidad" y con ADR-0023 |
| Mínimos y máximos tipeados por variante y sede | Odoo, ERPNext, Retail Pro, Square | 5.000-10.000 números que nadie mantiene (el punto de reorden de compra global, en cambio, se conserva: D27) |
| Editar ajustes de inventario | Square (Beta) | Se pierde quién descontó qué |
| Atributos en JSON | Odoo, Stripe metadata | No se agrupa, no se indexa |
| IA que escribe sola de noche | Odoo | Un anclaje malo no falla: agrupa mal meses después |
| Versionado de catálogo completo | Square | Cada pantalla filtraría "versión actual" |
| RCN "04" como código propio | GS1 (lo permite, no conviene) | Solo lineal, no único fuera de la tienda |
| Ubicación de tránsito | Odoo, ERPNext | Ya descartada por ADR-0068: contamina selectores |

---

## 6 · Ventaja competitiva: lo que ni Shopify, ni Alegra, ni INVY dan a una marca como CAYLA

No encontré documentación verificable del modelo de datos de Alegra ni de INVY. Lo de abajo se
contrasta contra lo documentado de Shopify, Square, Lightspeed, Odoo y ERPNext; sobre Alegra e
INVY solo digo que ninguna fuente pública que revisé muestra estas piezas.

**El compromiso 5 exige cinco datos mínimos, y hoy CAYLA tiene uno:**

| Dato mínimo | Hoy | En el modelo ideal |
|---|---|---|
| 1. Talla ordenada por escala con tallas clave | No (texto libre) | `tallas.orden`, `tallas.es_clave` |
| 2. Stock por sede y sububicación reconstruible a cualquier fecha | **Sí** (libro append-only, ADR-0042/0055) | + `ocurrido_en` y tramos derivados |
| 3. Fecha de primera llegada por modelo-color y sede | No | `surtido.lanzamiento_en` |
| 4. Precio regular frente a precio cobrado en cada venta | No (el regular se pisa) | `precios` + `venta_items.precio_regular_unitario`, `tipo_precio` |
| 5. Temporada con fechas | No (texto) | `temporadas` |

Con esos cinco salen dos alertas que la encargada de sede recibe sin preguntar:

- **Talla rota (A):** "Vestido Aurora, Flores vino, en AQP: la M está en 0 en el piso y quedan
  4 S y 3 L; hay 2 M en el almacén de la tienda: bájalas". Si el almacén no tiene, el orden es
  trasladar desde la sede donde esa M lleva 40 días sin venderse y, recién después, pedir al
  taller.
- **Talla que sobra (B):** "A 5 semanas del lanzamiento en TRU, la XL de Vestidos vendió 10%
  de lo recibido contra 35% de la curva de la categoría: muévela a AQP, donde la XL está
  rota, o prográmala para liquidación en TRU".
  - En la versión anterior este ejemplo decía "muévela a LIM". En producción `LIM` es el
    Taller, no una tienda (D10-bis): el sistema habría mandado la XL a la fábrica.

Y dos señales que un POS que solo compra no puede cerrar:

- **Devolución por talla** ("le quedó chica" en 3 de cada 10 ventas de la M en TRU): el taller
  corrige el molde, o la vendedora sugiere una talla más antes de cobrar.
- **Demanda no atendida:** la clienta que quería L y se fue sin comprar, que ningún reporte de
  ventas ve.

Lo que hace a CAYLA distinta no es el cálculo: es que **el Taller vive en el mismo sistema que
las tiendas**. CAYLA puede convertir una talla rota en una orden de producción de una sola
talla de una sola opción, con destino por tienda (D19) y cortada con la curva que de verdad
vende cada sede. Eso solo es posible si taller, recepción y venta comparten la identidad
`producto_color × talla`.

Tres avisos sobre esa frase:
- **No se compara con Nextail ni con Toolio.** La versión anterior decía que "redistribuyen
  un stock ya comprado", sin fuente, y la propia lista de fuentes la contradecía: Toolio
  documenta planificación de compra (OTB, open-to-buy). Esta revisión no pudo buscar
  documentación nueva de los dos, así que la ventaja se afirma sin compararla.
- **"A días de las tiendas" no está medido.** `producciones` existe desde el 15-sep y no hay
  medición de cuánto tarda una orden entre apertura, cierre y traslado. Se mide con la
  consulta M5 del plan (sección 11 del SQL). Mientras tanto, toda recomendación guarda
  `lead_time_origen = 'supuesto'`.
- **Si no hay tela, no hay orden.** Mientras no exista el consumo estándar por modelo (D30),
  `producir` sale "sin verificar tela", y la encargada ve primero trasladar.

---

## 7 · Costo de migración desde el modelo actual

**De dónde salen los números:**
- **Filas hoy:** `select count(*)` en producción, schema `retail`, 2026-09-16, solo lectura
  (sesión anterior).
- **Funciones:** `pg_proc` del schema `retail` en la **base local** de este worktree, el
  2026-09-16. Se buscó en el cuerpo de cada función:
  - 15 definiciones insertan en `movimientos` (14 nombres, porque `registrar_movimiento` tiene
    dos firmas vivas).
  - 15 funciones leen `talla` o `color_codigo`.
  - 9 funciones leen `precio`.
- **Archivos:** `apps/web` (`app`, `components`, `lib`; `.ts` y `.tsx`), contando la palabra
  exacta: `talla` en 63 archivos, `precio` en 35 y `motivo` en 44. Contando también las
  apariciones dentro de otra palabra, son 126, 43 y 49.
- **Medido en producción el 2026-09-16 (solo lectura), consultas M1 a M5 de la sección 11 del SQL:**
  - M1: **0** variantes con `EST`, `MUL` o `ANI`. La fase 0.3 no necesita decisiones a mano.
  - M2: **0** productos que mezclen talla vacía con S, M o L.
  - M3: **39** filas de `stock` y **228** movimientos sin sububicación. Es la tarea más pesada
    de la fase 1 y la fuente del "stock en el limbo" que marcó el diagnóstico de Halcón.
  - M4: TRU y AQP enlazadas a su sede de Dynamic; **el Taller no tiene `sede_dynamic_id`**.
    No existe todavía una ubicación para la tienda de Lima.
  - M5: **0** órdenes de producción terminadas: no hay dato de cuánto tarda el Taller.
  - `btree_gist` ya está instalada en producción.
  - M6 (etiquetas ya impresas) no está en la base: se pregunta a las sedes.

| Tabla | Filas hoy | Qué se migra | Funciones y archivos que toca | Fase |
|---|---|---|---|---|
| `variantes` | 37 (36 activas; 1 sin talla, 1 sin color; tallas S, M, L, vacío) | `producto_color_id`, `escala_talla_id`, `talla_id`; `sku` pasa a `codigos_barras`; `costo` **se conserva** (ADR-0067) | Las 15 funciones que leen `talla` o `color_codigo`: `abrir_produccion`, `catalogo_actualizar_producto`, `catalogo_crear_producto`, `cerrar_produccion`, `crear_producto_con_variantes`, `fn_asignar_codigo_variante` (con su disparador `fn_variantes_asignar_codigo`; los dos los reemplaza `fn_variante_codigo_compuesto`), `fn_historial_producto_cambios`, `fn_movimientos`, `fn_prioridad_conteo`, `fn_productos`, `fn_productos_resumen`, `fn_token_talla`, `fn_traslado_lineas`, `fn_ventas_del_dia`, `previsualizar_cierre_conteo`. En la web, 63 archivos con `talla`. ADR-0069 queda reemplazado | Fase 0 |
| `productos` | 7 | `categoria_id` NOT NULL, `escala_talla_id`, `publico`, `marca_id`, `origen`, `tipo_surtido`, `temporada_lanzamiento_id`, `version` | Formularios de producto; `productos.temporada` (texto) pasa a solo lectura; `permitir_venta_sin_stock` sale del modelo; **`stock_minimo` se conserva** (punto de reorden de compra) | Fase 0 |
| `producto_colores` | nueva (≈ pares producto×color distintos; cuántos con EST/MUL/ANI: M1) | una por color usado | Fotos: `producto_fotos` gana `producto_color_id` (0 filas hoy) | Fase 0 |
| `colores` | 30 | EST, MUL y ANI se apagan y pasan a `estampados`; hex obligatorio | `colores.tipo` (ADR-0061) queda sin uso | Fase 0 |
| `categorias` | 38 | `escala_talla_id` desde `tallas_sugeridas`; `requiere_etiqueta_textil` decidido a mano en las 38; unicidad por padre | `categorias_nombre_key` global; la subcategoría opcional de ADR-0062 cambia a hoja obligatoria | Fase 0 |
| `codigos_barras` | 2 | `tipo` (`cayla_corto` solo si coincide con el código de la variante), `es_principal`, `gtin14`; más una fila por `sku` legado | Búsqueda en `/buscar` y POS leen `gtin14` normalizado; etiquetas impresas: M6 | Fase 0 |
| `precios` | nueva | 1 fila regular nacional por variante con `vigencia = [created_at, ∞)` (aproximación declarada: `historial_producto_cambios` tiene 0 filas) | Las 9 funciones que leen `precio`: `catalogo_actualizar_producto`, `catalogo_crear_producto`, `crear_producto_con_variantes`, `fn_historial_producto_cambios`, `fn_productos`, `fn_productos_resumen`, `fn_registrar_cambio_producto`, `registrar_cambio`, `registrar_venta`. En la web, 35 archivos con `precio`. `variantes.precio` se deja de escribir; cola offline (ADR-0063) manda `ocurrido_en` | Fase 0 |
| `temporadas`, `escalas_talla`, `tallas`, `tallas_sinonimos`, `estampados`, `marcas` | nuevas | siembra manual; sinónimos desde `lib/tallas.ts:8` | `lib/tallas.ts` y `lib/catalogo-grupos.ts` dejan de ordenar tallas | Fase 0 |
| `movimientos` | 200 (7 motivos de texto) | `motivo_codigo` 1:1 con `origen_requerido`, `ocurrido_en = created_at`, `sububicacion_id` NOT NULL (vacíos: M3) | Las 15 definiciones que insertan en el libro: `anular_venta`, `aprobar_devolucion`, `cerrar_conteo`, `cerrar_produccion`, `cerrar_traslado_con_diferencia`, `confirmar_traslado`, `iniciar_traslado`, `mover_interno`, `recibir_compras`, `recibir_lote`, `registrar_cambio`, `registrar_movimiento` ×2, `registrar_venta`, `revertir_produccion`. Además `fn_aplicar_movimiento`, `recalcular_stock` y `fn_movimientos` (ADR-0050). En la web, 44 archivos con `motivo`. Verificar con `recalcular_stock` antes y después | Fase 1 |
| `costo_historial` | 0 | nada: se conserva tal cual (ADR-0067) | `fn_recalcular_costo_variante`, `recibir_lote`, `recibir_compras`, `cerrar_produccion`: **sin cambio de costo** (antes el borrador les movía el costo al movimiento) | — |
| `stock` | 112 | sububicación `general` para lo que hoy tiene sububicación vacía | ramas "si sububicación es null" en RPC | Fase 1 |
| `ubicaciones` / `sububicaciones` | 3 / 4 | **ningún código de sede**; verificar `sede_dynamic_id` (M4) y enlazar el Taller a la sede de tipo `fabrica`; sububicación `no_vendible` | selectores de sububicación filtran por tipo; ningún código de sede escrito a mano (`lib/etiqueta-sede.ts`) | Fase 1 |
| `devolucion_items` | 1 | `motivo_codigo` (a mano), `venta_id` | `crear_devolucion` pierde su chequeo de tope (lo hace la base); pantalla pide motivo por prenda | Fase 1 |
| `surtido`, `surtido_eventos`, `reservas`, `demanda_no_atendida` | nuevas | surtido derivado del stock actual, revisado antes de fijar fechas | nada existente | Fase 1 |
| `produccion_lineas` | 0 en el volcado del 12-sep (la tabla nació el 15) | `ubicacion_destino_id` vacío en lo existente | `abrir_produccion` recibe destino por línea | Fase 1 |
| `insumos`, `insumo_stock`, `insumo_movimientos`, `unidades_medida` | nuevas | vacías | diseño completo en el ADR del Taller (D-47) | Fase 1 |
| `venta_items` | 13 | columnas congeladas reconstruidas desde el catálogo actual (marcadas como reconstrucción), antes de crear el disparador de copia | `registrar_venta` deja de mandar la copia; `drop policy venta_items_insert`; `lucode.ts` deja de fijar NIU/10; la variante centinela "Cargo especial" se apaga | Fase 2 |
| `comprobantes` | 7 | líneas derivadas (módulo 08) | `comprobantes.items` jsonb | Fase 2 |
| `sunat_catalogo_*`, `sunat_mapeo_categoria` | nuevas | 49.022 códigos + ~38 × público decisiones, después de confirmar con Lucode fecha de ERR-3496, anexos y padrón 12 | nada del núcleo | Fase 2 |
| `recomendaciones_reposicion` y vistas | nuevas | cálculo nocturno | **convive** con el punto de reorden global de `20260916100000` (compra de empresa) | Fase 3 |
| `taxonomia_*`, anclajes, `propuestas_clasificacion` | **no existen en producción** | crear desde cero, versionadas | nada | Fase 4, solo con canal |

**Esfuerzo por fase.** Es una estimación de arquitecto, **no una medición**. La unidad es
una sesión de trabajo de este repo: una migración con su ADR, pruebas psql con rollback
(patrón ADR-0066) y la pantalla que la usa. Como referencia de tamaño: ADR-0071 cerró un
hueco con cuatro pasos de SQL y 9 pruebas en una rama.

| Fase | Qué pesa | Sesiones |
|---|---|---|
| 0 · Identidad | 10 tablas nuevas o cambiadas, 15 funciones de talla y color, 9 de precio, 63 archivos web con `talla` y 35 con `precio` (se solapan) | 6 a 8 |
| 1 · Libro, sedes, insumos | 15 definiciones del libro, 44 archivos con motivo, decisión D-40, forma mínima de insumos | 5 a 7 |
| 2 · Línea de cobro y SUNAT | copia congelada, `registrar_venta`, `lucode.ts`, carga del catálogo, líneas del comprobante (módulo 08) | 4 a 6 |
| 3 · Inteligencia | vistas, job nocturno, pantallas de alerta | 3 a 4 |
| 4 · Periférico | solo con canal | — |

**Contra el plazo:** las fases 0 a 2 suman 15 a 21 sesiones. Del 16-sep-2026 al 01-01-2027
hay unas 15 semanas: 1 a 1,4 sesiones por semana solo para esto. Compiten con las
prioridades de D-46 (cuentas por pagar e IGV primero, materia prima del Taller segundo).
Además, si ERR-3496 rige desde el 01-08-2026 (D23), la fecha que manda no es 2027: es la
primera boleta que lleve el tag.

**Orden y por qué:** fase 0 antes del censo y de la primera etiqueta real (es identidad); fase
1 antes de que haya traslados y devoluciones con volumen; fase 2 antes de mandar el código
SUNAT en una boleta (ERR-3496, fecha por confirmar); fase 3 cuando haya al menos una temporada
completa de ventas con los cinco datos; fase 4 solo si hay un canal que la consuma.

**Tensión con ADR y decisiones existentes:**
- **ADR-0069** (talla normalizada, "tabla de tallas descartada"): este borrador lo contradice
  de frente. Su índice ya está en producción (pegado el 2026-09-16); la fase 0 lo reemplaza por la
  FK a `tallas`, y mientras tanto protege la carga del censo.
- **ADR-0062** (subcategoría opcional): se conserva el techo de un nivel y la herencia de
  familia, pero se cambia "opcional" por "el producto cuelga solo de la hoja".
- **ADR-0060** (temporada como texto, fotos solo del modelo, `permitir_venta_sin_stock`):
  temporada pasa a tabla, fotos por opción, y la venta sin stock se modela como reserva o
  pedido al taller, no como flag.
- **ADR-0061** (`colores.tipo`, muestra de color): la muestra se conserva; `tipo` queda
  reemplazado por `estampados`.
- **ADR-0059** (historial de precio y categoría en texto): se conserva como auditoría de quién
  cambió qué; el precio pasa a `precios`.
- **ADR-0025** (código con segmento de color): el segmento pasa a ser el código de la opción.
  Para colores lisos es el mismo (`VIN`), así que esas etiquetas impresas no cambian.
- **ADR-0030** (IA contra la taxonomía universal): la IA pasa a clasificar contra el
  vocabulario propio; la universal queda periférica y versionada. Sus tablas no existen en V2.
- **ADR-0063** (cola sin red): el precio se resuelve en `ventas.ocurrido_en`, así que una venta
  cobrada sin red con un precio que después se cerró entra igual (D13). Queda abierto el reloj
  de la tablet que miente.
- **ADR-0067** (promedio ponderado, aplicado en producción): **alineado**. El borrador ya no
  saca `variantes.costo` ni duplica el libro de capas (D29). Las cuatro funciones que lo
  escriben no cambian por costo.
- **ADR-0068** (traslado en dos fases): compatible y reforzado. El tipo `traslado` queda
  restringido a la misma sede por FK.
- **ADR-0071** (candado completo del historial): **extendido**. Su patrón (`enable always`,
  `before truncate` y retiro de permisos) pasa a toda tabla con historia del borrador. Su SQL
  sigue pendiente de pegar en producción, y este borrador no lo reemplaza: va antes.
- **D-40** (vender desde el almacén): el borrador **propone cambiar el mecanismo** (D20); rige
  el escrito hasta que Felipe decida.
- **D-23** (cierre de mes con llave): dependencia declarada; el candado no existe (D15).
- **ADR-0023 / D-40:** tensión abierta (venta con sistema en 0 y prenda en la mano).
- **`20260916100000_punto_reorden.sql`:** **se conserva**. Responde la compra al proveedor,
  que es de empresa; las alertas por sede responden otra pregunta (D27).
- **Decisión vigente "Dynamic manda" sobre sedes (`14-DYNAMIC.md`):** alineada. Retail no
  acuña código de sede (D10-bis).

---

## 8 · Relación con los huecos de Loro, Tucán, Golondrina y Halcón

| Pájaro · hueco | ¿Lo elimina de raíz? | Cómo, o por qué no |
|---|---|---|
| Loro 3 · `codigo` inmutable sin candado | **Sí** | disparadores de inmutabilidad en producto, opción, variante y código de barras, y código de variante compuesto por la base (un código mal armado no llega a congelarse) |
| Loro 4 · identidad vigila texto (cerrado por ADR-0069 en local) | **Sí, más fuerte** | FK a opción y talla, sin columnas vacías |
| Loro 5 · correlativo llamable por cualquiera | No | es permiso de función, fuera del modelo |
| Loro 6 · prefijo de categoría choca con código de color | Parcial | el segmento de color es local al modelo; la legibilidad cruzada deja de ser regla |
| Loro 7 · no se registra un código de fábrica fuera del conteo | No | falta pantalla; el modelo lo valida mejor cuando exista |
| Loro 10 · columnas muertas (`genero`, `temporada`) | **Sí** | `publico` y `temporadas` con uso legal y analítico |
| Loro 13 · una categoría no se retira | Ya cerrado en V2 (`activo`) | + no se cambia prefijo ni familia con productos |
| Loro 15 · sin pruebas | Parcial | `prueba-estados-imposibles.sql` tiene 102 casos que se verifican solos, 3 de concurrencia. Es una batería del borrador, no de las RPC reales |
| Tucán 1-2 · el repo se contradice / el seed no deja rastro | No | documentación; además las tablas no existen en V2 |
| Tucán 3 · color anclado a no-color | **Sí** | FK `(version, valor_id, atributo_handle='color')` |
| Tucán 4 · versión fijada es una etiqueta | **Sí** | llaves `(version, id)` + `taxonomia_reemplazos` |
| Tucán 5 · vocabulario sin anclar | No | es trabajo de una persona |
| Tucán 6 · IA nunca medida | **Sí** | `propuestas_clasificacion` con tasa de aceptación por campo |
| Tucán 10 · aviso de versión nueva no corre solo | No | job |
| Golondrina 1 · `producto_atributos` nadie la escribe | **Sí** | atributos por categoría con requeridos + composición |
| Golondrina 5-6 · deshacer en la pestaña; reintentar duplica | Parcial | códigos inmutables + archivar evitan la duplicación silenciosa; deshacer sigue siendo pantalla (el importador no existe en V2) |
| Golondrina 7 · qué creó cada importación | Parcial | `origen` en atributos y propuestas; tallas nuevas solo por RPC con permiso propio (con 9 Líderes, 'solo con Líder' no era control) |
| Halcón 1-2 · historial borrable, insert directo | UPDATE y DELETE ya cerrados (ADR-0042, ADR-0055). TRUNCATE (directo o en cascada), modo réplica y permisos de `service_role`: **cerrados en local por ADR-0071**; en producción, pendiente de pegar `SQL-PENDIENTE-PRODUCCION-2026-09-16-halcon.sql` | el borrador **extiende** el patrón de ADR-0071 a toda tabla con historia (§4, §10 del SQL) |
| Halcón 3 · candado de sede con NULL | No | permiso |
| Halcón 4 · motivo libre, `ultima_venta` por literal | **Sí** | `motivos_movimiento.origen_requerido`: el disparador no conoce ningún nombre de motivo, y un motivo no-sistema no puede ser entrada ni salida (la versión anterior repetía el literal `'venta'`) |
| Halcón 5 · no se vende desde el almacén (D-40) | **Pendiente de Felipe** | las dos formas lo cierran; el borrador propone cambiar el mecanismo que D-40 escribió (D20). Rige D-40 tal como está hasta que Felipe decida |
| Halcón 6 · alertas no miran almacén (D-39) | **Sí** | posición proyectada (con producción con destino, D19) + series `piso` y `vendible` separadas |
| Halcón 7 · `devolver_a_almacen` sin pantalla | No | pantalla; el modelo agrega destino `no_vendible` con motivo |
| Halcón 9 · ajuste negativo solo por SQL | No | pantalla |
| Halcón 14 · `contenedor_id` parece reparto | **Sí** (ya casi en V2) | stock solo en hojas |
| Halcón 15 · costo único (D-45) | Ya cerrado por ADR-0067 | el borrador se alinea: un solo libro de capas (`costo_historial`) y candado de capa en cada entrada con costo; el costo provisional del Taller (D-31) sigue sin modelo |

---

## 9 · Lo que no se pidió y pesa más

**Lo más caro de este modelo no es construirlo: es hacerlo después del censo.** Hoy hay 37
variantes de prueba y 2 códigos de barras en producción. Cuando haya más de 1.000 prendas con
etiquetas pegadas en tres sedes, cada decisión de identidad (tabla de tallas, opción
modelo-color, estampado fuera de colores, códigos inmutables) se paga con reetiquetado físico
y con fusiones de variantes que ya tienen movimientos. La fase 0 tiene fecha límite, y esa
fecha es la primera etiqueta real.

---

## 10 · Fuentes

Marcas: **[V]** verificado por el escéptico; **[D]** desactualizado, se usó lo que rige hoy;
**[NV]** no verificable, no sostiene decisiones de este ADR.

- Shopify Admin GraphQL 2026-07: productOptionsCreate, ProductVariantsBulkCreateUserErrorCode,
  InventoryItem, LineItem, TaxonomyCategory, manage-quantities-states, metafield-linked,
  combined-listings — https://shopify.dev/docs/api/admin-graphql/latest ,
  https://shopify.dev/docs/apps/build/orders-fulfillment/inventory-management-apps/manage-quantities-states **[V]**
- Shopify product-taxonomy (attributes.yml, aa_apparel_accessories.yml, return_reasons.yml,
  integrations/shopify/2025-12/mappings/to_shopify.yml, google/2021-09-21/from_shopify.yml,
  releases v2026-02 y v2026-08) — https://github.com/Shopify/product-taxonomy **[V]**
- Shopify Engineering, clasificación (2025-05-08) y taxonomía a escala (2025-10-09) —
  https://shopify.engineering/evolution-product-classification ,
  https://shopify.engineering/product-taxonomy-at-scale **[V]**
- Shopify changelog idempotencia de inventario (2025-12-12) —
  https://shopify.dev/changelog/making-idempotency-mandatory-for-inventory-adjustments-and-refund-mutations **[V]**
- Shopify physical inventory preview — https://shopify.dev/docs/apps/build/orders-fulfillment/inventory-management-apps/physical-inventory-feature-preview **[V]**
- Stripe Products/Prices, tax codes, invoice line items, metadata —
  https://docs.stripe.com/products-prices/manage-prices ,
  https://docs.stripe.com/tax/products-prices-tax-codes-tax-behavior ,
  https://docs.stripe.com/api/invoice-line-item/object , https://docs.stripe.com/metadata **[V]**
- SUNAT, página "Código de producto" (modificada 13-07-2026; releída el 2026-09-16: "no
  tiene la calidad de requisito mínimo") —
  https://cpe.sunat.gob.pe/informacion_general/codigoproducto **[V]**
- SUNAT, Reglas de validación actualizadas al 26-08-2026 (xlsx releído el 2026-09-16) —
  https://cpe.sunat.gob.pe/sites/default/files/2026-08/Reglas%20de%20validaci%C3%B3n%20-%20actualizado%20al%2026.08.2026.xlsx
  - **[V]** Hojas Factura2_0 y Boleta2_0: ERR-3496, OBS-4331 (padrón 12), StandardItemIdentification
    con @schemeID GTIN-8/12/13/14 y OBS-4334.
  - **[V]** LiquidacionCompra2_0: ERR-3506.
  - **[V]** Listados: ind_padron 12.
  - **[V]** Catálogos: UNSPSC v14_0801 y catálogo 03 = UN/ECE Rec. 20 rev. 13.
  - **[V]** Control de Cambios del 24-04-2026 (ERR-3496 con vigencia "01/08/2026 01/01/2027";
    incorpora 25.1 a 25.3) y del 24-07-2026 (retorna a v14 y retira 25.1 a 25.3).
  - **[contradicción interna, sin resolver]** Las filas de validación siguen nombrando 25.1 a
    25.3 y la hoja Catálogos todavía las trae. Confirmar con Lucode.
- Padrón `ind_padron = '12'` para el RUC 20605964550 **[NV]**: no consultado en esta revisión.
  Pista verificable: observación 4331 en los CDR de boletas ya aceptadas.
- SUNAT catálogo 25 (CCNU_MOD_2.xlsm) — https://cpe.sunat.gob.pe/sites/default/files/inline-files/CCNU_MOD_2.xlsm **[V]**
- RS 133-2019/SUNAT — https://www.sunat.gob.pe/legislacion/superin/2019/133-2019.pdf **[V]**
- RS 278-2019/SUNAT y anexos — https://www.sunat.gob.pe/legislacion/superin/2019/anexos-278-2019.pdf **[V]**
- Códigos de la tabla 12 del Anexo 3 de la RS 169-2015 — **[NV]**: validar antes de sembrar
  `motivos_movimiento.sunat_tabla12`.
- Res. CAN 2109 (etiquetado de confecciones) y 2173 —
  https://cdn.www.gob.pe/uploads/document/file/1736622/Ver%20Resoluci%C3%B3n.pdf?v=1615854854 **[V]**
- Nubefact sobre aplazamiento a 2027 — https://www.nubefact.com/blog/actualizaciones-sunat/codigo-de-producto-sunat-nueva-fecha-de-vigencia-desde-el-1-de-enero-de-2027 (fuente secundaria; la fuente primaria lista dos fechas sin separar: confirmar con Lucode)
- QuickBooks Online API Item, InventoryAdjustment, TaxClassification; artículos de ayuda —
  https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/item ,
  https://quickbooks.intuit.com/learn-support/en-us/help-article/list-management/import-products-services-quickbooks-online/L4o3mXx2u_US_en_US **[V]**
- Odoo 19.0 código (product, stock, point_of_sale, barcodes) y documentación —
  https://github.com/odoo/odoo/tree/19.0 ,
  https://www.odoo.com/documentation/19.0/applications/finance/fiscal_localizations/peru.html **[V]**
- ERPNext version-16 (item.py, item_variant.py, stock_ledger.py, warehouse.py,
  stock_entry.py, sales_invoice_item.json, item_price.py) —
  https://github.com/frappe/erpnext/tree/version-16 ; Frappe rename_doc —
  https://github.com/frappe/frappe/blob/version-15/frappe/model/rename_doc.py **[V]**
- Square Catalog, Inventory y Transfer Orders API (2026-09-16) —
  https://developer.squareup.com/reference/square **[V]**; concurrencia optimista de catálogo
  (SQ-07) **[NV]**
- Lightspeed R-Series y X-Series — https://developers.lightspeedhq.com/retail/ ,
  https://x-series-api.lightspeedhq.com **[V]**; profundidad de categorías (LS-03) y
  "congela costo" en SaleLine (LS-09) **[NV]**
- GS1 General Specifications R24 (vigente R26, no leída completa) —
  https://gs1za.org/wp-content/uploads/2024/10/Gen-Specs-2024.pdf **[V contra R24]**;
  GTIN Management Standard 1.1 — https://ref.gs1.org/standards/gtin-management/ **[V]**;
  Digital Link URI Syntax 1.7.0 — https://ref.gs1.org/standards/digital-link/uri-syntax/ **[V]**;
  GPC bricks de ropa (GS1-08) **[NV]**
- Google Merchant Center (id, color, pattern, size, size_system, gtin, inventario local) y
  taxonomía 2021-09-21 — https://support.google.com/merchants/answer/7052112 ,
  https://www.google.com/basepages/producttype/taxonomy-with-ids.es-ES.txt **[V]**; G4 **[D]**
  (la identidad de variante ya cambió en la rama con ADR-0069)
- Schema.org ProductGroup V30.1 — https://schema.org/ProductGroup **[V]**
- Merchant API migration (Content API retirada 2026-08-18) —
  https://developers.google.com/merchant/api/guides/compatibility/overview **[V]**
- Akeneo Serenity y pim-community-dev; commercetools API reference —
  https://help.akeneo.com , https://github.com/commercetools/commercetools-api-reference **[V]**;
  inventario commercetools (h8) **[D]**: cuatro modos de inventario, incluido ReserveOnCart
- Oracle Retail Merchandising (latest), Retail Science 19.1.005 —
  https://docs.oracle.com/en/industries/retail/retail-merchandising-foundation-cloud/latest/ **[V]**;
  curvas de talla (ORA-10) **[D]**: rige AI Foundation 26.2.301.0, sin umbrales publicados —
  https://docs.oracle.com/en/industries/retail/ai-foundation-cloud-service/26.2.301.0/aifim/size-profiles.htm
- Microsoft Dynamics 365 (product dimensions, lifecycle, inventory statuses, warehouse setup,
  replenishment, Inventory Visibility) — https://learn.microsoft.com/en-us/dynamics365/ **[V]**
- SAP Fashion Management 1.0 temporadas; SAP Learning S/4HANA Fashion —
  https://help.sap.com/doc/saphelp_fms10/1.0/en-US/40/b32f52a3a7c410e10000000a441470/content.htm **[V]**
- Caro y Gallien 2007/2010 (Zara, asignación) —
  https://web.mit.edu/jgallien/www/InvMgtRetailNetworkCaroGallien2007.pdf **[V]**; Caro y
  Gallien 2012 (liquidación) — https://escholarship.org/uc/item/0fm8d8sv **[V]**
- Ferreira, Lee y Simchi-Levi 2016 (Rue La La) —
  https://www.hbs.edu/ris/Publication%20Files/kris%20Analytics%20for%20an%20Online%20Retailer_6ef5f3e6-48e7-4923-a2d4-607d3a3d943c.pdf **[V]**
- Visuelle 2.0 — https://arxiv.org/html/2204.06972v2 **[V]**
- Nextail size curves — https://help.nextail.co/en/size-curve-calculations **[D]**: el umbral
  de 200 unidades es legacy y funciona como peso
- Toolio (size curves, WOS, OTB) — https://www.toolio.com/post/free-template-how-to-calculate-size-curves **[V]**.
  El OTB es planificación de compra: contradice la frase retirada de §6 ("Nextail y Toolio
  redistribuyen un stock ya comprado"). No se buscó documentación de compra de Nextail en esta
  revisión **[NV]**, y §6 ya no compara.
- Blue Yonder Size Scaling (material comercial) —
  https://info.blueyonder.com/retail-planning-category-management/what-is-blue-yonder-size-scaling **[V, pista]**
- Claude structured outputs y deprecaciones —
  https://platform.claude.com/docs/en/build-with-claude/structured-outputs ,
  https://platform.claude.com/docs/en/about-claude/model-deprecations **[V]**; OpenAI límites —
  https://developers.openai.com/api/docs/guides/structured-outputs **[V]**; Xiong et al. 2024 —
  https://arxiv.org/abs/2306.13063 **[V]**; AWS A2I —
  https://docs.aws.amazon.com/sagemaker/latest/dg/a2i-json-humantaskactivationconditions-rekognition-example.html **[V]**
- Kimball Type 2 y Type 7 —
  https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/type-7/ **[V]**
- PostgreSQL 17 range constraints y 18 WITHOUT OVERLAPS —
  https://www.postgresql.org/docs/17/rangetypes.html ,
  https://www.postgresql.org/docs/18/sql-createtable.html **[V]**
- Salesforce B2C Commerce Script API 26.8; Retail Pro Prism 2.5.x; Infor PLM for Fashion
  2026.04 — https://salesforcecommercecloud.github.io/b2c-dev-doc/docs/current/scriptapi/html/api/ ,
  https://my.retailpro.com/documentation/ , https://docs.infor.com/iplmfsh/2026.04/ **[V]**
- Alegra e INVY: sin documentación pública de modelo de datos consultada. No se afirma nada
  sobre ellos más allá de eso.
- **Repo de CAYLA (rama `claude/halcon-d22`, leído el 2026-09-16):**
  - Arquitectura y decisiones:
    - `docs/adr/0070-candado-completo-del-historial-sin-force-rls.md` y
      `supabase/migrations/20260916200000_historial_candado_completo.sql`.
    - `docs/adr/0067-costo-de-variante-pasa-a-promedio-ponderado.md` y
      `supabase/migrations/20260916090000_costo_promedio_ponderado.sql`.
    - `docs/datos/DECISIONES-2026-09-12.md` (D-20, D-22, D-23, D-31, D-32, D-40, D-46, D-47,
      D-49).
  - Sedes y Dynamic: `docs/datos/00-MAPA.md` §1 (códigos de sede), `docs/datos/14-DYNAMIC.md:491-495`,
    `supabase/migrations/datos-reales-produccion.sql:45-54` (ubicaciones de producción).
  - Migraciones y funciones:
    - `supabase/migrations/20260916100000_punto_reorden.sql:1-30`.
    - `supabase/migrations/20260915130000_produccion_del_taller.sql`.
    - `supabase/migrations/20260912235500_vocabulario_cerrado.sql:194-213`.
    - `supabase/migrations/0003_funciones.sql:451-457`.
    - `docs/datos/generado/funciones-produccion.txt` y `docs/datos/generado/DICCIONARIO-RETAIL.md`.
  - `apps/web/lib/tallas.ts:8`.
  - `docs/BACKLOG.md` (Halcón, 9 colaboradores Líder, 300-900 SKUs).
  - `docs/datos/01-INVARIANTES.md:128`.
  - `docs/datos/modulos/05-inventario-y-movimientos.md:487-495`.
- Parámetros de escala fijados por Felipe el 2026-09-05 (5 a 10 sedes, 10 a 50 ventas por día
  pico, 1000+ SKUs): memoria del proyecto, no un documento del repo.
