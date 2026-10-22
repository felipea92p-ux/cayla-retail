# Nueva orden de compra · Precio sugerido y avisos de compra (diseño para aprobar)

> **Estado (2026-10-22): propuesta, sin construir.** Nace de lo que Felipe pidió el 2026-10-21 sobre la pantalla
> `/compras/ordenes/nueva`, de 5 rondas de preguntas (26 respuestas) y de 4 estudios en paralelo (22 lectores y
> verificadores, solo lectura). Lo único ya hecho es el cambio de rótulo «Precio u.» → «Costo u.». Todo lo demás espera
> el OK de Felipe, porque toca **precio de venta** (dinero), **permisos** y **migraciones**.
> Maqueta tocable: `docs/maquetas/ordenes-compra-precio-2026-10/index.html`. Informe anterior de esta pantalla:
> `docs/pantallas/compras-ordenes-nueva.md`.

## 1. Lo pedido

1. «Precio unitario es un error, debería decir **costo** unitario» → hecho (compras e insumos; el papel que se le manda al
   proveedor se queda «Precio u.»: es el precio que cobra él).
2. Que la encargada de compras **sugiera el precio de venta** de cada prenda, entendiendo el **precio promedio de la
   categoría**, viendo el **margen** y con **mensajes que ayuden a decidir y a no equivocarse**: un precio alto exige una prenda
   bien diferenciada; un precio o un margen bajo, saber qué estrategia se aplica. Cada palabra pensada en teoría económica
   (elasticidad, pricing), explicada en simple.
3. (Pedido a mitad de camino) **Avisar cuando probablemente está comprando de más** sobre stock que ya hay o ya pidió, y
   **notificar cuando hace una buena compra** porque es justo lo que más falta.

## 2. Decisiones de Felipe (2026-10-21 y 2026-10-22)

| # | Tema | Decisión |
|---|---|---|
| 1 | Qué es el precio sugerido | **Propuesta que viaja con la línea** de la orden; no es el precio definitivo |
| 2 | Obligatorio | **Opcional, con recordatorio** (la guía lo marca «sugerido»; nunca bloquea) |
| 3 | Con un precio raro | **Pregunta el motivo** con lista corta, queda anotado en la línea y se ve en el detalle de la orden. Todo apoyado en teoría económica y explicado en simple |
| 4 | Dónde se ve | **Una columna más + una franja de ayuda bajo la línea** |
| 5 | Quién confirma al llegar | **Solo un líder, con un toque** |
| 6 | Número de partida | La caja arranca vacía; botón **«Usar el precio habitual»** |
| 7 | Avisos de precio | Los cuatro: precio ≤ costo · margen que no aguanta la rebaja · precio lejos del promedio · costo distinto al de la última compra |
| 8 | Con qué se compara | **Misma categoría y marca; con pocas prendas, la categoría.** Empresas **juntas** hoy (CAYLA y CLAURE), se separan cuando haya prendas de sobra |
| 9 | IGV | **Todas las órdenes incluyen IGV** (el costo escrito es lo que se paga) |
| 10 | Factura | No se agrega casilla: **ya existe el tipo de comprobante** (factura, boleta, nota de venta, sin comprobante) |
| 11 | Descuento que debe aguantar | «Probablemente 35 %, pero investiguemos cómo lo hacen los mejores» → estudio hecho (§4.3) |
| 12 | Ganancia de la categoría | La ganancia estimada **también sale de su categoría** (una sola cifra, no costos sueltos) |
| 13 | Campaña cerca | **Avisa solo si sobra aun vendiendo 3 veces más**; si no, explica por qué calla |
| 14 | Qué ve quien tiene Órdenes de compra | **Desglose por tienda y plan de campaña, como un líder** (decisión de permisos de Felipe) |
| 15 | «Ya hay mucho» | **Menos de 45 días**; «busca el menor tiempo posible, analiza y escoge» → derivado de sus tiempos (§4.4) |
| 16 | Tiempos reales | Lima **el mismo día**; Trujillo **1 a 2 días** (por lo general 1); Arequipa **2 a 4 días**. Se compra **3 veces por semana** |
| 17 | Cómo se dice la ganancia | **Soles por prenda y % del precio**; «mejora la alternativa» → §4.2 (separa recargo, ganancia y rebaja) |
| 18 | Quién ve el motivo | **También el detalle de la orden** (no se suma por persona) |

## 3. Cuatro hechos del repo que cambian el diseño

1. **El precio sugerido hoy no nace en la orden sino en el comprobante** (`compra_items.precio_venta_sugerido`, decisión 21 de
   ADR-0362). `orden_compra_items` no tiene dónde guardarlo. Como el comprobante no bloquea nada, una prenda puede llegar sin
   sugerido y quien recibe ve «Escribe el precio». Poner el sugerido en la línea de la orden **exige una columna nueva** y
   actualizar la decisión 21.
2. **La base del margen ya está decidida (ADR-0417, aprobada, sin construir):** precio sin IGV ÷ costo real. Con factura el IGV
   se recupera y el costo real es lo pagado ÷ 1,18; sin factura (boleta, nota de venta, sin comprobante) el IGV queda dentro del
   costo. Como costo y precio traen IGV, **con factura el 18 % se cancela** y el margen es (precio − costo) ÷ precio; **sin
   factura baja 7 a 10 puntos**. Más de 30 % de las compras llega sin factura (estimación de Felipe, `docs/datos/15-COMO-OPERA-CAYLA.md`
   R-07), y el costo ya guardado está mezclado (con IGV si fue boleta, sin IGV si fue factura): mientras no se corrija, la pantalla dice
   en qué base muestra el margen.
3. **El catálogo es chico para un promedio:** 410 productos, 2.252 variantes, 52 categorías (unas 9 prendas por categoría),
   0 órdenes de compra y unas 3 semanas de ventas; el 64 % del dinero de octubre fue «prenda sin registrar», sin categoría ni
   costo. Cruzar marca × categoría da 0,2 a 0,4 prendas por celda. Por eso **muchos avisos callarán al principio** y lo dirán.
4. **PostgREST corta en 1.000 filas** sin avisar: toda lectura nueva es una función con **una fila por categoría**, no por
   categoría y marca (5.460) ni por prenda.

## 4. Diseño

### 4.1 La línea

`Categoría · Marca · Descripción · Cantidad · Costo u. · Descuento · **Precio sugerido** · Subtotal`, y bajo la línea una
**franja de ayuda** (ya hay dos avisos colgando de la línea, `duda` y `noCalza`: cabe un tercero, no una columna más a 1280 px
con el menú abierto; la columna del precio sugerido es angosta y la ayuda vive en la franja). Reglas del sistema que se
respetan: guía de foco (el precio sugerido es «sugerido», nunca «falta»), piezas únicas (`Aviso`, `Chip`, `BotonVerMas`),
tokens de color y modo oscuro, loader global, escritorio primero.

### 4.2 La cuenta, y por qué se dicen tres cosas distintas

Felipe preguntó si «soles y %» distingue el *mark up* del *mark down*. **No los confunde, porque no usa ninguno como cifra principal;
y los separa así:**

| Palabra | Qué es | Ejemplo (costo 25, precio 59.90, con factura) | Dónde se ve |
|---|---|---|---|
| **Ganancia** (margen) | lo que queda por prenda, y qué parte del precio es | S/ 29.58 sin IGV · 58 % | **la cifra principal** |
| **Recargo** (*markup*) | cuántas veces el costo | cobras 2,4 veces lo que pagaste (+140 %) | solo en «¿Por qué?» (error típico: creer que ×1,40 da 40 %; da 29 %) |
| **Rebaja** (*markdown*) | lo que te queda si el precio baja | con 15 %: S/ 21.95 · 51 %; con 35 %: S/ 11.78 · 36 % | una fila aparte, «Si rebajas» |

Fórmulas (una sola base, ADR-0417): `costo_neto = costo × (1 − descuento del proveedor)` · `costo_real = costo_neto ÷ 1,18` con
factura, `costo_neto` sin factura · `ganancia = precio ÷ 1,18 − costo_real` · `margen = ganancia ÷ (precio ÷ 1,18)` · con
rebaja `d`: el precio queda **redondeado hacia abajo al S/ 0.10** (ADR-0403). Todos los soles van **sin IGV**; los porcentajes con
un decimal; comparaciones en céntimos enteros.
Al armar la orden no hay comprobante, así que se supone **factura si el proveedor tiene RUC** y sin factura si «No tiene RUC»;
al registrar el comprobante real, el tipo verdadero manda y se recalcula.

### 4.3 Qué descuento debe aguantar una prenda (estudio de las grandes marcas)

* **Ninguna de las marcas publica su margen inicial, su tope de descuento ni su calendario de rebajas.** Lo que se conoce son
  márgenes **realizados** (ya netos de rebajas y sin IGV): Inditex FY2025 58,3 % (dato de la empresa), H&M FY2025 53,4 %,
  PVH FY2025 57,5 %, Ralph Lauren AF2026 69,9 %, Gap FY2025 40,8 % (con alquiler dentro del costo). No se pueden comparar punto a
  punto con un margen de etiqueta, y **no existe una regla de «descuento máximo» que copiar**.
* **Su defensa no es un colchón de margen:** es bajar la probabilidad y la profundidad de la rebaja (Inditex: lotes pequeños,
  reposición rápida, retirar lo lento en ~1 mes, según un caso de Harvard de ~2001 —dato viejo y de tercero—; Gap y H&M: corregir
  compras cuando hay exceso, y ambas lo pagaron en rebajas y margen). **Por eso el aviso de «compraste de más» tiene más respaldo
  que subir el margen mínimo.**
* La fórmula estándar de merchandising (fuentes didácticas): `margen inicial = (M + r) ÷ (1 + r)`, con `M` lo que necesitas que te
  quede después de rebajar y `r` lo que se rebaja por cada S/ 100 cobrados. Con M = 45 % y rebajas de S/ 20 por S/ 100: 54,2 %.
* **Propuesta:** un solo piso, **48 %**: «aguanta una rebaja de 35 % y todavía deja 20 % del precio ya rebajado, antes de pagar
  alquiler y sueldos». Es un **peor caso**, no una meta; coincide con la fórmula (todo vendido a 35 % de rebaja ⇒ 48 %) y queda 13
  puntos sobre el candado de la base (nunca vender bajo costo, que con 35 % de rebaja se cumple desde 35 % de ganancia). **No se
  muestra una zona «sana» de 50 %** hasta tener datos propios de `M` y `r` (hoy serían inventados; Finanzas no sirve para
  calibrarlos todavía).
* Dónde se aparta de lo supuesto: **35 % es el tope de un líder a mano en caja** (ADR-0054; sobre 15 % se pide argumento escrito),
  **no** un tope de campañas (la tabla de etiquetas acepta hasta 100 %) ni de los regalos del club. Es el peor descuento *manual*.

### 4.4 Avisos de stock: el umbral sale de tus tiempos

Un aviso de «ya hay mucho» debe decir cuánto stock sobra respecto de **lo que necesitas para llegar a la siguiente reposición**.
Esa cobertura de referencia es `M = plazo de reposición + cada cuánto se compra + colchón`; avisa de «mucho» sobre **2 × M**
(regla de cobertura: entre 1,5 y 2 veces la meta se vigila; más de 2 es sobrestock) y celebra una compra que deja la cobertura por
debajo de **1,5 × M** cuando antes había hueco.

| | Lima | Trujillo | Arequipa | Red («Por repartir») |
|---|---|---|---|---|
| Plazo de reposición (tus tiempos, tomando el techo) | 1 día | 2 días | 3 días | 3 días |
| Cada cuánto se compra (3 veces por semana) | 2,3 d | 2,3 d | 2,3 d | 2,3 d |
| Colchón (supuesto de diseño; ajustable) | 4 d | 4 d | 4 d | 4 d |
| **M** | 7,3 d | 8,3 d | 9,3 d | 9,3 d |
| 1,5 × M | 11 d | 12,5 d | 14 d | 14 d |
| 2 × M | 14,7 d | 16,7 d | 18,7 d | 18,7 d |

**Valor único propuesto** (el de Arequipa y la red, que es el más holgado, y redondeado a semanas para que se lea fácil): **hueco ≤ 10 días**
(≈ M) · **buena compra ≤ 2 semanas** (≈ 1,5 × M) · **ya hay mucho > 3 semanas** (≈ 2 × M). Un solo número para todas las tiendas evita que el
mismo exceso diga cosas distintas según la sede; si Lima quiere ser más estricta, se separa después con datos. Es menos que los 45 días que
Felipe descartó y que los 60 de Producción, y sale de su operación (se repone en 1 a 3 días, tres veces por semana). Se calcula con el
**ritmo de venta de los últimos 30 días** (por tienda, con `d = min(30, días desde la primera venta)`), con margen de error
`1/√n` (cada aviso usa el ritmo que lo haría **callar**), y **solo habla** si hay `n ≥ 10` ventas y `d ≥ 14` días de historia,
la familia está encendida y las ventas «sin registrar» no pasan de 30 % (para decir «te falta»). Si no, dice «todavía no hay
ventas suficientes para opinar» y muestra solo lo que sí se sabe: cuánto hay y cuánto viene.

* **Cuenta lo que viene:** `S` (disponible, fórmula única `fn_existencias_base`) + `C` (traslados en tránsito) + `P` (órdenes
  generadas de los últimos **90 días** con algo por llegar, de esa categoría y destino, sin la orden que se edita). No cuenta doble
  (verificado en el repo: el traslado ya salió del origen y el despacho cerrado sale de `P` y entra al stock en la misma transacción).
  Una orden nunca se «cierra» (solo `generada` o `anulada`), por eso el tope de 90 días.
* **No avisa por prendas de exhibición:** no se llama «mucho» a un exceso menor de ~una semana de venta ni de pocas unidades
  (hay un mínimo de unidades para mostrar una prenda en el piso; la cobertura sola lo castigaría).
* **Campaña cerca** (ej. diciembre, ya cargada): habla solo si sobra **aun vendiendo 3 veces más**; si no, dice por qué calla.
* **Desglose por tienda y plan de campaña** para quien tiene Órdenes de compra (decisión 14). Se registra en el ADR como decisión de
  permisos de Felipe.
* **Fase 2, no ahora:** sobrecompra contra el fin de temporada, entrega tardía y «pide poco y repite» (necesitan fin de temporada por
  categoría y plazos por proveedor; hoy no están en el sistema), y cualquier aviso para las órdenes de insumo del Taller (se
  calcula contra el plan de producción, no contra ventas).

### 4.5 Avisos de precio (biblioteca verificada)

Máximo **tres a la vista**, el más grave primero; el resto, tras «Ver N avisos más». Cada uno lleva su **«¿Por qué?»** (la teoría
en simple, ley 6 de Formidable). Nunca bloquean y nunca prometen ventas: hablan de lo que dice la cuenta.

| Nivel | Aviso | Cuándo | Idea de teoría detrás |
|---|---|---|---|
| error | **Precio ≤ costo** | ganancia ≤ 0 | un precio que no cubre el costo pierde en cada venta; casi siempre es un cero mal puesto |
| error | **Sobra o falta un cero** | precio ≥ 8× o ≤ 1/8 del precio del medio de la categoría | error de digitación, el más caro |
| atención | **Costo distinto al de la última compra** | el costo neto (tras el descuento) es **más del doble** o **menos de 2/3** del último que se pagó por esa categoría y marca: es la **misma banda que ya usa la base** al recibir (`fn_costo_fuera_de_banda`, ADR-0298), así que la orden avisa ANTES de que lo haga la recepción | costo fuera de lo normal: un cero de más contamina el costo de la prenda en todas las tiendas y no se puede deshacer desde la pantalla |
| atención | **No aguanta la rebaja** | ganancia < 48 %: «si llega a 35 % de rebaja te quedan S/ X; para dejar 20 % necesitas desde S/ P o pagar hasta S/ C» | margen inicial frente a rebajas |
| atención | **Precio alto**: 2 niveles (10–25 % y 25–50 % sobre el precio del medio) y **muy alto** (> 50 %) | «conviene poder nombrar dos razones que el cliente vea o toque; lo demás se compara con las de al lado» | precio de referencia · diferenciación · escala de precios |
| info | **Precio bajo** (50–90 % del medio) y **muy bajo** | «si es a propósito, ¿qué estrategia es?» | estrategias de margen bajo: gancho, rotar, remate, básico comparado, costo propio más bajo |
| info | **La cuenta de las unidades** | «para ganar lo mismo que al precio del medio tendrías que vender X % más prendas» / «puedes vender hasta X % menos» | equilibrio de unidades (no pronostica ventas; solo dice cuánto hace falta) |
| info | **Sin factura** | proveedor «No tiene RUC» o comprobante sin factura | crédito fiscal del IGV |
| info | **Referencia débil / sin referencia** | categoría con 3–9 prendas / con menos de 3 | un promedio con pocas prendas es pista, no regla |
| info | **Margen muy alto** | ≥ 85 %: «¿falta un cero en el costo o sobra uno en el precio?» | el error espejo del cero |
| info | **Antes de escribir el precio** | costo escrito y precio vacío: «a S/ 49.90, el precio del medio, te quedarían S/ 21.10 (50 %); para aguantar 35 % de rebaja necesitas desde S/ 48.20» | punto de partida, no recomendación |
| éxito | **Las cuentas cierran** | precio cerca del medio, ≥ 48 % y sin avisos | no promete ventas: «si se vende a este precio, la cuenta cuadra» |

Los cortes de 10/25/50 % sobre el precio del medio, el 8× y el 85 % son **supuestos de diseño** (confianza baja; ningún estudio de ropa
los respalda), igual que los cortes de datos mínimos (3 prendas, 10 para una referencia estable). Quedan en un solo lugar para
ajustarse con datos propios. En pantalla se dice **«precio del medio de {categoría}»**, no «mediana»; **«cliente»**, no «clienta»;
dinero primero, porcentaje después.

### 4.6 Los motivos (lista corta, sin bloquear)

* **Precio alto** («¿qué ve el cliente que justifique pagar más?», puede marcar varias): diseño propio que no se ve en otras tiendas ·
  tela o confección mejor, se nota al tocarla · calce que se nota al probársela · edición corta (pocas unidades y no se repite) ·
  línea que los clientes ya piden por su nombre · otro · aún no lo sé.
* **Precio o ganancia bajos** («¿qué estrategia aplicas?»): gancho para traer gente · entrar barato para ganar clientes · rotar
  rápido · salir de un lote de remate · básico que el cliente compara · mi costo es más bajo (Taller o volumen) · **rebaja
  planificada** (sé que parte se rebaja y el precio ya lo cuenta) · aún no lo sé.
* **Sin referencia en la categoría:** una prenda parecida que ya vendemos · el precio de otra tienda o de Gamarra · el costo por un
  múltiplo · aún no lo sé.
* Se guardan **en la línea**, se ven **en el detalle de la orden** y por quien confirma el precio al llegar; se agrupan **por
  categoría y motivo, nunca por compradora** (promesa escrita: no se mide a personas). «Aún no lo sé» es una respuesta válida.

### 4.7 Qué se guarda y a dónde viaja

```
Línea de la orden  ──►  orden_compra_items.precio_venta_sugerido  (numeric(12,2), nulo)   [columna nueva]
                         orden_compra_items.sugerido_motivos      (text[], nulo)           [columna nueva]
        │
        ├─► registrar_comprobante_orden precarga compra_items.precio_venta_sugerido (la compradora lo puede corregir)
        └─► recepción: HojaPrenda lo precarga «sugerido por Compras»; si quien recibe no es líder, la prenda nace pendiente
            (ya existe) y el líder confirma o cambia el precio al revisarla (revisar_producto_censo): un toque.
```

Una sola verdad: el sugerido de la **orden** es el origen; el del **comprobante** lo hereda y puede corregirse; la recepción lee
el vigente. La compuerta de ADR-0298 (`mayor_que_precio`) ya obliga a confirmar a quien recibe si el sugerido queda bajo el costo.
Las categorías fuera de los motores (bolsas, cajas, empaque) admiten precio 0: ahí **no hay promedio ni avisos de margen**.

### 4.8 Qué pasa si algo no responde (Vogels)

* Las dos lecturas nuevas (`fn_categoria_precios`, `fn_orden_compra_stock`) se cargan con tolerancia, como `fn_proveedor_categorias`:
  si fallan o tardan más de 3 s, **la pantalla queda como hoy**, sin franja de stock y sin comparación, y guardar la orden no se afecta.
  Una web publicada antes que el SQL (`PGRST202`) también queda como hoy.
* Sin datos suficientes, **callar es mejor que opinar**: el aviso lo dice.

### 4.9 Estados imposibles (Lamport)

* `precio_venta_sugerido >= 0` y ≤ S/ 5.000 (mismo tope que `variantes.precio`); `sugerido_motivos` solo si hay sugerido; el sugerido
  de una categoría fuera de los motores puede ser 0.
* El sugerido nunca fija un precio por sí solo: `variantes.precio` solo cambia por las vías de siempre (alta o revisión).

## 5. DECIDÍ / DESCARTÉ / SE ROMPE SI

**DECIDÍ:** el precio sugerido nace en la línea de la orden (columna nueva, opcional) y viaja como propuesta hasta quien lo confirma; la ayuda
se calcula en la pantalla con funciones puras y dos lecturas de solo lectura que devuelven **hechos** (no reglas), una fila por categoría.
**DESCARTÉ:** (a) dejarlo solo en el comprobante: si el comprobante tarda, la prenda llega sin sugerido y quien recibe escribe el precio a
ciegas, justo el problema de hoy; (b) guardarlo en la orden **y** en el comprobante con «gana el segundo»: dos verdades que pueden diferir
sin que nadie lo vea; (c) una función por categoría y marca: 5.460 filas, el tope silencioso de 1.000 la truncaría; (d) un umbral de
«ya hay mucho» copiado de una gran marca (ninguna lo publica) o de Producción (60 días, que no refleja que aquí se repone en 1 a 3 días).
**SE ROMPE SI:** (1) el stock registrado es menor al real (64 % de las ventas de octubre «sin registrar»): «te falta» aplaudiría una compra que
ya estaba tapada → calla sobre 30 % sin registrar y dice «solo cuenta lo registrado»; (2) una orden abandonada sigue inflando «ya pediste»
→ tope de 90 días y el aviso nombra la orden para poder verificarla; (3) la compradora marca «Aún no lo sé» en cada línea para pasar → la
respuesta pierde valor, y se acepta (no se bloquea); (4) se publica el SQL a medias → web tolerante a `PGRST202`.

## 6. Lista de actividades para aprobar (`/construir`)

Cada una es un corte vertical con su commit y su verificación. **Dinero (precio), permisos y migraciones esperan tu OK por separado.**

1. **Reglas puras de la ayuda de precio** (`lib/orden-compra-precio-ayuda.ts`, hecha 2026-10-22): la cuenta de §4.2, las bandas y la biblioteca de §4.5, con una
   prueba que recorre todas las bandas del precio del medio, de 0 a infinito, y exige que cada condición sea excluyente. Sin pantalla.
2. **Base: guardar el sugerido** (hecha 2026-10-22 en local: migración `20261022080000`, prueba `pnpm pruebas:orden-compra-sugerido`; **falta pegarla en producción, con el OK de Felipe**) (migración propia, una parte; `crear_orden_compra` / `editar_orden_compra` / detalle y el comprobante y la
   recepción lo llevan; decisión 21 de ADR-0362 actualizada). Prueba de Postgres con mutantes.
3. **Base: `fn_categoria_precios`** (una fila por categoría: prendas que la sustentan, precio del medio, rango, ganancia típica con cuántos costos
   la sustentan, **y el último costo pagado por marca dentro de la categoría** para el aviso «costo distinto al de la última compra»; puerta `ordenes_compra`; familias
   apagadas fuera). Prueba de Postgres: límite de 1.000 filas, permiso, familia apagada, ceros.
4. **Pantalla: precio sugerido y franja de ayuda de precio** (caja, «Usar el precio habitual», franja con ≤ 3 avisos y «¿Por qué?», motivos, detalle
   de la orden). Guía de foco, guía interactiva, `/sugerir`, 1440 y 1920 px, modo oscuro. **Al importar `lib/orden-compra-precio-ayuda.ts`, sacarlo de `ignoreFiles`
   en `knip.ts`** (el candado «probado = en pantalla» existe para que «lo uso después» no se quede).
5. **Base: `fn_orden_compra_stock`** (hechos por categoría y tienda: disponible, en camino, por llegar con tope de 90 días, ventas de 30 días, días de
   historia, % sin registrar, campañas), extrayendo «por llegar» de `fn_plan_compra_pedido` a una función compartida (con cuidado con los parches por
   ancla). Prueba de Postgres.
6. **Pantalla: avisos de stock** (§4.4): ya pediste, ya hay mucho, campaña cerca, buena compra, compra moderada, sin datos, y el desglose por tienda.
7. **Cierre:** ADR-0362 (actualización), `docs/ARQUITECTURA.md`, bitácora y backlog, `/focus`, `tema:auditar`, `/formidable`, `/chaos`, SQL en orden para
   pegar con huellas, y la memoria.

**Choque a resolver:** la rama sin fusionar `claude/skills-todos-agents-94f745` toca `NuevaOrdenCompra.tsx` y `orden-compra-prefiltro.ts` (la línea
`prellenada` no debe emitir el aviso de «no calza»). Conviene fusionar una de las dos primero.

## 7. Lo que no se puede afirmar (límites honestos)

* **No hay elasticidad de ropa en Perú** (ni historial por prenda en CAYLA): la pantalla no dice cuánto venderás con un precio. Las cifras de la
  literatura (−0,39 a −0,92 para ropa y calzado como categoría; −1,76 de media en bienes variados) son de EE. UU. y otros rubros y **no entran a la pantalla**.
  La sensibilidad al precio de CAYLA se podrá medir con sus propias campañas, **no antes de ~12 meses** (hoy ~1.600 líneas de venta en ~3 semanas).
* Los cortes de 10/25/50 %, 8× y 85 % son supuestos de diseño; los umbrales de stock (colchón de 4 días) son una derivación, no una medición.
* «Solo la factura da crédito fiscal» viene de un resumen de un estudio contable (2017), no de SUNAT, que dice que la boleta no lo da.
* El margen mostrado es **bruto, a precio de lista**: no descuenta rebajas ni bolsa, comisión de tarjeta, alquiler, sueldos, flete ni la mano de obra del Taller
  (la decisión 20 de ADR-0362 deja los gastos del viaje fuera del costo de la prenda).
* Ninguna marca grande publica su umbral de rebaja ni de sobrecompra.

## 8. Qué sigue abierto para Felipe

1. ¿Queda bien el **colchón de 4 días** (y entonces 10 / 14 / 21 días)? Se cambia en un solo lugar.
2. ¿Se confirma el **piso de 48 %** (aguantar 35 % de rebaja y dejar 20 % antes de gastos) y que **no** haya zona «sana» hasta tener datos propios?
3. ¿Quién fija el plazo real por proveedor (hoy se toma el techo por tienda)? Entra cuando haya órdenes recibidas para medirlo (hoy hay 0).
4. Los cortes de precio alto y bajo (10 / 25 / 50 %): elegirlos mirando la maqueta.
5. ¿Cuándo se construye la **corrección masiva de costos a una sola base** (ADR-0417, aprobada, sin construir)? Hasta entonces la ganancia dice su base.

## 9. Fuentes principales (públicas; los datos de CAYLA vienen del repo, no de la web)

* Inditex, resultados FY2025 (margen bruto 58,3 %): `inditex.com/…/fy2025-results`. Caso de Harvard Business School 9-703-497 (Zara, datos ~2001; estimaciones de
  la dirección, no cifras vigentes). Columbia Business School, visita a Inditex (2015).
* Cobertura de inventario y metas (blog de proveedor de software, mayo 2026): `prediko.io/blog/weeks-of-supply-formula`.
* Margen inicial frente a rebajas: Cotton Inc. (2014) `cottonworks.com/…/2-5_Initial_Markup_1.pdf`; WeBC (copia de Walker, ASU).
* Elasticidad: Tellis (1988) `msi.org`; Kim (1998) `vtechworks.lib.vt.edu`; equilibrio de unidades: Impact Pricing.
* H&M Group, Gap Inc., Ralph Lauren y PVH: informes anuales y resultados trimestrales (cifras con su año fiscal en el estudio de origen).
* Precio de referencia y señal de calidad: Kalyanaram y Winer (1995); Rao y Monroe (1989); Völckner y Hofmann (2007); Ariely y otros (2003).
  Casi todos leídos en resúmenes; son de laboratorio u otros rubros.
