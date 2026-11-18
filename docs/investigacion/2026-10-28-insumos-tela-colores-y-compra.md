# Insumos: una tela con varios colores, comprada por metro, kilo o rollo (2026-10-28)

> **Estado (2026-10-28, tarde):** investigación terminada. **Felipe aprobó las cuatro decisiones recomendadas** (ADR-0554): tabla de telas (`materiales`), libro de la tela en metros, quien ve Producción crea telas y colores (los ingresos con costo siguen siendo del líder) y primer paso = candados + maquetas. **Construido en la rama:** la actividad 0 (candados de unidad; la migración **no está pegada en producción**) y las maquetas (`docs/maquetas/insumos-nueva-tela-2026-10/`). Las actividades 1 a 6 no están construidas.
> **Pidió:** Felipe, 2026-10-28: «la parte de Insumos es demasiado tediosa de completar». Seis ideas: (1) una misma tela puede tener varios colores; (2) unas telas se compran por metros y otras por kilos; (3) algunas por rollo entero, y hay que preguntar cuántos metros trae; (4) la carta de colores como en Catálogo ▸ Nuevo producto; (5) «que también me deje agregar material»; (6) el código debe sugerirse solo y no permitir repetir.
> **Cómo se hizo:** lectura directa del módulo + 5 agentes de solo lectura (Datos, Catálogo, Dominio textil, Dependencias, Patrones de UX). Lo marcado **(verificado)** lo comprobé yo contra el código o contra producción con `SELECT`; lo marcado **(agente)** es lo que dijo un agente y no re-comprobé.
> **Vocabulario de este documento:** «tela» = el material (Milano Melange); «color» = cada línea de stock de esa tela (Milano Melange · Arena). Hoy el sistema solo conoce la segunda; la primera no existe.

## 1. En una página

El tedio **no está en la pantalla, está en el modelo**. Hoy un insumo es **un color y una unidad** (`insumos.color_codigo`, `insumos.unidad_medida`), así que una tela en 5 colores son 5 altas, y cada una pide otra hoja para ingresar su lote: unos **18 controles por color** (10 al crearlo + 8 al ingresarlo; lo conté yo en el código). Dos agentes contaron por separado el escenario «una tela en 5 colores, comprada por kilo, 2 rollos por color, una sola factura» y coinciden: **≈ 65–85 acciones y 10 hojas** (≈ 115 si se abre un lote por rollo), de las cuales **hasta 40 son datos que se vuelven a teclear** (unidad, tejido, prefijo del código, nombre, precio por kilo, número de factura, ×5). Con la tela y sus colores en una sola hoja bajaría a ≈ 15–17 en total (estimación del agente Patrones, no medida).

Además, el esquema de insumos se adoptó tal cual de un esquema «huérfano» de Dynamic (ADR-0090) y **no modela** cómo se compra la tela: no existe ancho, gramaje, composición, rollo ni unidad de compra (verificado en las migraciones y en producción).

**Propuesta (recomendada):** una tabla nueva y periférica `materiales` (la tela: qué es y cómo se compra) con `insumos` como su hoja por color; una hoja **«Nueva tela»** (tejido + cómo se compra + colores desde la carta de Catálogo + saldo inicial opcional por color); una hoja **«Llegó tela»** de varias líneas con conversión kilo/rollo → metros; códigos **generados**, nunca escritos a mano; y **un contrato de unidad** (el libro de la tela va en metros).

## 2. Lo que hay hoy (medido)

| Qué | Dato | Fuente |
|---|---|---|
| Pantalla | `/produccion/insumos`: `InsumosPanel` (327 líneas), `NuevoInsumoModal` (173), `FichaDeLaTelaModal` (105), `CamposDeLaFicha` (69), `InsumoModales` (138); libs ≈ 600 líneas | verificado |
| Alta | 10 controles, 3 obligatorios; ingreso: 8 controles, 4 obligatorios | agente Patrones; verificado el total de 18 |
| Color y tejido | dos `CampoSelect` de **nombres**; sin carta, sin buscar por familia, sin «agregar nuevo». La lectura trae solo `codigo, nombre, hex` (`lib/telas-vocabulario.ts:12`): la carta caería entera en «Sin familia» | verificado |
| Código | texto libre ≤ 20 con `UNIQUE(codigo)` global y sensible a mayúsculas/tildes/espacios; el «código sugerido» es solo un placeholder de una tabla curada (`lib/sugerencias-insumos.ts`); el repetido se descubre **después** de guardar (error 23505); el nombre no es único («Lino negro» dos veces pasa) | verificado / agente Datos |
| Unidad | seis valores (`metro, unidad, kilo, cono, par, docena`) sin CHECK entre tipo y unidad: una tela puede medirse en pares; un líder puede cambiar la unidad con stock | agente Datos |
| Lo que NO existe | ancho, gramaje, composición, rollo, unidad de compra, factor kilo↔metro | verificado |
| Dependencias | 7 FK entrantes a `insumos.id`; ~40 funciones lo nombran; 12 leen `unidad_medida` | agente Datos |
| Producción, 28-oct | **1 insumo** (`MM-01 · Milano Melange`, tela en metros, color Arena, tejido «Mix Algodón & Poliéster»), 1 lote de 9 m sin documento, 1 movimiento. `tejidos`: 49 (mezcla de fibras, ligamentos, materiales de empaque y pruebas: «Papel kraft», «TNT», «Tela mojada», «pruebaTEJIDO»). `colores`: 107 (103 activos, todos aprobados) | verificado (`SELECT`) |
| Vocabularios | desde ADR-0534 (27-oct) todo color o tejido nace **aprobado**, lo cree quien lo cree; el único candado es `colores_clave_unica` / `fn_clave_texto` | verificado (`app/api/productos/colores/route.ts`) |

**Lectura del dato de producción:** la única tela cargada tiene el nombre de un *tejido* («Milano») pero el tejido elegido es una *composición* («Mix Algodón & Poliéster»). «Milano» no existe en la lista y el combo no deja agregarlo. Es la evidencia más concreta de la idea (5).

## 3. La historia de la decisión (para no reabrir lo que ya se cerró)

- **2026-09-12, R-25** (`docs/datos/15-COMO-OPERA-CAYLA.md:372`): «La tela se compra por metro, por kilo y por rollo entero. Las tres. *Dato duro.* … el insumo necesita **unidad de compra y unidad de consumo**, y el rendimiento entre ambas … es la primera cosa que hay que resolver del módulo.» (verificado)
- **2026-10-14, ADR-0400 d.6:** «La tela se compra por metros, no por rollos … **No se construye la conversión kilo → metro (R-25)** porque CAYLA no compra por kilo.» Cita R-25 para justificar lo contrario de lo que R-25 dice. (verificado)
- **2026-10-16, respuestas de Felipe** (`docs/investigacion/2026-10-16-ordenes-de-produccion-proceso-real/13-respuestas-de-felipe.md`): P-19 «**También punto, por kilo**» (reabre d.6); N-2 «**Audaces en metros, convierto**» → «el punto se pasa a kilos con el gramaje y el ancho de cada tela (**hay que guardar ambos**)»; P-23 «la tela se revisa y **mide** al llegar»; P-24 «reposo y lote de tinte **no se anotan**». R4 quedó esperando un «OK aparte» (ADR-0400:464). (verificado)
- **Conclusión:** las ideas (2) y (3) de hoy no son nuevas ni contradicen nada: son lo que R-25 pidió, lo que el ADR-0400 dejó fuera por alcance y lo que Felipe reabrió el 16-oct. Nunca se construyó.

## 4. Cómo se compra de verdad (dominio)

Fuentes: documentos del repo (verificado) y fuentes externas de nivel C (agente Dominio; nada de CAYLA ni de proveedores concretos).

| Insumo | Se compra | Se consume | Qué pedir al recibir |
|---|---|---|---|
| Tela plana (popelina, lino, satín…) | metro, corte o rollo de ≈ 30–100 m; **el vendedor decide la unidad** | metros por prenda de Audaces, a un ancho de marcada | color, metros medidos, costo; rollo: metros por rollo |
| Tela de punto (jersey, rib, milano…) | **kilo**, rollo de ≈ 16–50 kg | metros por prenda → kilos con m/kg | color, kilos pesados, gramaje de muestra, costo por kilo |
| Hilo | cono (≈ 5 000 m) | 60–250 m por prenda | color, conos |
| Botón, etiqueta | unidad, docena, gruesa (144), ciento, millar | 1–3 por prenda + repuesto | color, tamaño (una línea = 0,635 mm) |
| Cierre, elástico | cierre: unidad con largo; elástico: metro o rollo de 25–50 m | 1 por prenda; cm por prenda | largo o ancho, color |

**Fórmulas** (con unidades):
- `m/kg = 1000 ÷ (gramaje g/m² × ancho TOTAL en m)`. Tubular: el ancho abierto es el doble. Hay que restar el tubo de cartón al pesar. El *ancho útil* (≈ facturado − 2,5 cm) sirve a la marcada, no a la conversión kg↔m.
- `kg a pedir = Σ(consumo m/prenda × prendas) × (1 + merma) ÷ (m/kg)`.
- Rendimiento real = `m medidos ÷ kg pesados`. Costo por metro = `precio por kg ÷ (m/kg real)`. Una muestra de 10 × 10 cm: `gramos × 100 = g/m²`.
- Tolerancias de la industria: gramaje ±5 %, ancho ±3 cm (punto) / ±2 cm (plano). Cada partida cae dentro de tolerancia, no en el nominal.

**Ejemplo ficticio:** jersey de 180 g/m² y 1,60 m de ancho → 3,472 m/kg. Una prenda de 1,10 m × 120 prendas × 1,05 de merma = 138,6 m = 39,9 kg. Si el gramaje real viene +5 %, esos 40 kg rinden 132,3 m: **la tolerancia se come la merma**. Por eso el rendimiento se mide en cada recepción en vez de copiar el de la ficha.

**Otros sistemas (Odoo, ERPNext, SAP B1, Dynamics 365, NetSuite):** todos separan unidad de stock, unidad de compra y factor. Dynamics 365 trae «catch weight»: factor nominal + tolerancia + peso real. **Copiar:** unidad de stock + unidades de compra con factor; factor nominal en la ficha, factor medido en cada lote, **aviso (no bloqueo) si difieren más de 5 %**; unidad no editable una vez en uso. **No copiar:** grupos de unidades (Odoo no convierte kg↔m), conteo por rollo (D365, Optitex): para 3 tiendas y 1 taller, el rollo es un dato del lote, no una tabla.

**Una tela con N colores:** compras negocia por tela; el taller consume por color y no sustituye; contabilidad valoriza por existencia. El color es la línea de stock, con lote, costo y mínimo propios; ancho, gramaje, composición y merma son de la tela. Teclear ≈ 100 combinaciones (25 modelos × 3,9 colores) contra ≤ 25 telas.

## 5. Lo que Catálogo ya tiene y se reusa

`ElegirColores` ya salió de Catálogo: lo usan Nuevo producto, Agregar colores, Nueva orden y Recibir. Insumos sería el quinto. (verificado: API y uso en `AgregarColor.tsx`; el resto, agente Catálogo.)

| Pieza | Qué hace | Esfuerzo (opinión del agente) | En Insumos |
|---|---|---|---|
| `ElegirColores` (+ `NuevoColorAlta`) | buscador con sinónimos, «+ Crear el color «X»» fijo arriba, carta por familia y gama, Pantone al señalar, aviso de parecidos | S (ya parametrizada: `cartaAbierta`, `sinElegidos`, `enfocarBuscador`) | los colores de la tela; carta cerrada de entrada, como en Nueva orden |
| `ComboBuscable` con `crear` | «+ Crear el tejido «Milano»» sin salir de la hoja | S | la idea (5), lectura A |
| `ProponerValor` / `proponerValorVocabulario` | crea un tejido y lo ofrece en la categoría | M (hay que hacer `categoriaId` opcional) | alternativa a lo anterior |
| `nombres-parecidos` / `PreguntaParecido` | «¿No será uno que ya existe?» | S | evitar «Lino negro» dos veces (el `UNIQUE` del código no lo ve) |
| `lib/color-codigo`, `color-alta-reglas`, `color-parecido` | código de color y familia por ΔE2000 | S (puras, 77 pruebas) | tal cual |
| Tabla de colores con «Llenar todas con…», celda vacía hereda, Enter baja (`MatrizCantidades`, `tabla-alta-reglas`) | una fila por color | M | metros y costo de N colores en una sola hoja |
| `AgregarColoresModal` | «llegó un color nuevo»: eliges, la tabla muestra lo que nacerá, un guardado | M | «Agregar color» a una tela |
| `RecibirOrdenInsumoModal` | «en blanco = todo lo que queda», costo sugerido | S | «Llegó tela» |
| `useResponsable` | el combo «Responsable» ya viene con la persona de la sesión (modo «operación»); la opción `recordarEn` lo guarda entre pantallas | S | ya está en Insumos; no cambia |

**Códigos en Catálogo:** producto = prefijo de categoría + correlativo atómico (`codigos_correlativos`), variante = producto-COLOR-talla por disparador, color = derivado del nombre hasta que se toca, único contra todos los códigos, con la clave primaria como último candado. `fn_siguiente_correlativo` está **revocada a `authenticated`** (verificado): un correlativo para telas va dentro de una función `security definer`.

**Colores sin aprobación:** desde ADR-0534 cualquiera crea colores y tejidos y nacen aprobados. Dar la llave a Insumos significa que un color creado en el Taller es permanente y alimenta la tienda y Vender (quedan 17 576 códigos de 3 letras posibles). Aceptable; hay que saberlo.

**Hoy no hay importación de hojas de cálculo** (0 `onPaste`, sin xlsx ni csv). Hubo un importador completo, borrado en `0af2f1b` (ADR-0073). Un TSV pegado no necesita librería. Queda como idea de una segunda ola.

## 6. Propuesta

### 6.1 El modelo

```
materiales (la tela)                    insumos (la línea de stock por color: ya existe)
  codigo  MIL-01  (generado)              id, material_id → materiales
  nombre  Milano Melange                  color_codigo → colores        (FK ya existe)
  tipo    tela | avio                     codigo  MIL-01-ARN  (generado: material + color)
  tejido_id, composicion                  tipo, unidad_medida, merma_pct, tejido_id   ← copias que mantiene un disparador
  unidad_uso  metro                       stock_minimo (por color)
  unidad_compra  metro | kilo | rollo     lotes ─ insumo_lotes (+ cantidad_comprada, unidad_compra,
  uso_por_compra  (m por kg / m por rollo)           rollos, uso_por_compra del lote)
  ancho_cm, gramaje_gm2                   ledger ─ movimientos_insumo (no cambia)
  merma_pct
```

**DECIDÍ:** `materiales` como tabla nueva y periférica; `insumos` queda como la hoja por color con su `id`, sus lotes, su ledger y las ~40 funciones que lo nombran **sin tocar**. Las columnas que otras funciones ya leen (`tipo`, `unidad_medida`, `tejido_id`, `merma_pct`) siguen en `insumos` como **copias que mantiene un disparador**, no que escribe una persona.
**DESCARTÉ:** (a) *insumos planos + una etiqueta de grupo*: ancho, gramaje y compra se copian N veces y quedan dos verdades; con una tabla de grupo, ya es esta opción. (b) *solo UX sobre el modelo actual*: no puede representar kg↔m ni impedir un duplicado semántico. (c) usar `tejidos` como padre: es núcleo de Catálogo y se contaminaría con atributos del Taller.
**SE ROMPE SI:** dos recepciones de la *misma* tela traen gramajes distintos y se usa el factor de la tela (por eso se congela el factor **en el lote**); si dos proveedores venden la misma tela con anchos distintos (el ancho de la tela es un valor nominal; el rendimiento real es el del lote); o si Felipe quiere el punto **en kilos** en el stock (habría que rehacer el cierre de producción y 12 funciones).

**Discrepancia entre agentes (la decisión más disputada).** Datos y Dominio recomiendan la tabla `materiales` (ancho, gramaje y compra se guardan una sola vez; Felipe pidió guardar ambos, N-2). Patrones y Dependencias recomiendan **no** agregar tablas: «1 insumo = 1 color = 1 stock es correcto; el tedio es de captura», con una función que cree N insumos de golpe y un índice único. Elijo la tabla por tres razones: (1) ancho y gramaje son de la tela, y sin padre se copian por color (dos verdades; corregir uno obliga a corregir N); (2) Catálogo ya modela producto → variantes, y dos formas de resolver lo mismo en el mismo sistema es el defecto que hay que evitar; (3) con 1 fila en producción es el momento más barato. El argumento del otro lado es real (menos piezas, nada nuevo que migrar) y **gana si Felipe decide que ancho, gramaje y composición no se guardan en el sistema** (solo se miden al recibir). Esa es la pregunta que decide.

### 6.2 Estados imposibles (que el esquema debe impedir, no la pantalla)

| Estado que nunca debe existir | Cómo lo impide la base |
|---|---|
| un color fuera del vocabulario o inactivo | FK `insumos.color_codigo → colores` (ya existe) + disparador por «activo» |
| una conversión ≤ 0, NaN, o un kilo sin ancho y gramaje | CHECK |
| un hijo con tipo o unidad distinta a su padre | FK compuesta `(material_id, tipo, unidad)` |
| una tela medida en pares, o una tela que no esté en metros | CHECK (tela → metro) |
| la unidad cambiada con historial | disparador |
| el mismo color dos veces en la misma tela | `UNIQUE (material_id, coalesce(color_codigo, ''))` |
| «sin color» junto a colores | el patrón `mezcla_sin_color` que ya usa el repo |
| un código repetido ignorando mayúsculas, tildes y espacios | índice único sobre `fn_clave_texto(codigo)` + CHECK de formato |
| un lote con `cantidad ≠ comprada × factor` | CHECK |

### 6.3 Contrato de unidad (lo que se decide primero)

**El libro de la tela va en metros. El kilo y el rollo son unidades de COMPRA que se convierten al recibir.**
- Porque el consumo se mide en metros (Audaces da metros por marcada, el corte extiende por largo de marcada) y porque «lo medido» del cierre de producción solo suma telas en `metro` (`20261014160000…:230`, verificado). Una tela en kilos hoy **queda fuera de «lo medido» sin avisar**.
- Cada lote guarda **lo que se compró** (p. ej. 48,2 kg · 2 rollos), **el factor que se usó** (3,47 m/kg) y **los metros que entraron** (167). El factor se **congela en el lote**: el siguiente lote usa el suyo.
- Se sugiere el factor de la ficha (`1000 ÷ (gramaje × ancho)`), pero **el dato fiable es el medido al llegar** (P-23): kilos pesados y metros medidos, o la muestra de 10 × 10 cm.
- Si el factor medido difiere más de 5 % del de la ficha: **aviso, no bloqueo**.
- **Discrepancia entre agentes:** el agente de Dominio sugirió llevar el punto en kilos en el libro («lo que se pesa y se factura»). Los de Datos y Catálogo, el ADR-0400, la respuesta N-2 de Felipe («el punto se compra en kilos y **se consume en metros**») y el código del cierre apuntan a metros. Elijo metros porque el stock baja al *cortar* (muchas veces, en metros) y sube al *recibir* (pocas, en kilos); el factor por lote hace que el error de conversión quede donde se mide. Cambiaría de opinión si el corte del punto se anota en kilos (no pude verificarlo).

### 6.4 Cómo se ve

**Hoja «Nueva tela»** (`<Modal variante="hoja" tamano="ancha">`):
```
① Qué tela es      Nombre [Milano Melange]  ← «¿Es la misma que «Milano Melange (MIL-01)»? Ya tiene 2 colores»
                   Tejido [Milano ▾  + Crear el tejido «Milano»]   Composición [60 % algodón · 40 % poliéster] (opcional)
                   Código  MIL-01  (se arma solo)
② Cómo la compras  (•) por metro  ( ) por kilo  ( ) por rollo
                   [kilo]  Ancho [160] cm · Gramaje [180] g/m²  →  rinde ≈ 3,47 m por kilo (se corrige al recibir)
                   [rollo] Un rollo trae ≈ [80] m          Merma al cortar [5] % (opcional)
③ Colores          [🔍 arena, petróleo…]  (carta ▸)
                   ● Arena  MIL-01-ARN   ¿Ya tienes?  [9] m    Costo [   ]   Mínimo [   ]
                   ● Negro  MIL-01-NEG   ¿Ya tienes?  [   ]    Costo [   ]   Mínimo [   ]      «Llenar todas con…»
Responsable [Felipe ▾]                                   [Cancelar]  [Crear 2 colores de Milano Melange]
```
Si pones metros en un color, se abre un lote de **saldo inicial**; si no, queda en cero. Una sola hoja y una sola transacción: todo o nada.

**Hoja «Llegó tela»** (varias líneas, una factura):
```
Tela [Milano Melange ▾ · se compra por kilo]   Documento [F001-…]   Fecha [hoy]
 Color    Rollos   Kilos pesados   Metros que rindió        Costo por kilo
 ● Arena    2         48,2         167 (≈ 3,47/kg) ✎            S/ …
 ● Negro    1         24,0          82             ✎            S/ …
 + Agregar otro color
 Total: 72,2 kg · 249 m · S/ … (S/ … por metro)        Aviso (solo si > 5 %): «Negro rinde 1,7 % menos que la ficha»
```
Las columnas cambian con cómo se compra la tela: por metro (metros + costo), por kilo (kilos + metros calculados o medidos), por rollo (rollos × metros por rollo).

**La lista de Insumos** pasa a una tarjeta por **tela** con sus colores adentro (muestra real del color, saldo y semáforo por color, lote PEPS visible), «+ Nueva tela», «Llegó tela» y «Editar tela» (los atributos compartidos se editan una vez y valen para todos los colores). Un solo verbo de alta en vez de dos («Nuevo insumo» e «Ingresar insumo»).

### 6.5 Códigos

- Tela: `PPP-NN` (prefijo de 3 letras sugerido del nombre + correlativo atómico), por ejemplo `MIL-01`. Color: `MIL-01-ARN` (tela + las 3 letras del color).
- **Nadie escribe un código.** La base lo asigna dentro del RPC (`security definer`) con el mismo contador atómico que Catálogo; se muestra de solo lectura.
- **Carrera de dos personas:** el `UPSERT` bloquea la fila hasta el commit; la segunda toma el siguiente número sin huecos; el mismo nombre o color simultáneo lo rechaza el índice único y el RPC devuelve el existente (*get-or-create*, idempotente con `p_token`).
- **El código único no basta:** «Milano Melange» y «Milano melanje» tienen códigos distintos y son la misma tela. Lo que de verdad evita el duplicado es la pregunta de *parecidos* sobre el **nombre** de la tela y la restricción `UNIQUE (material, color)` sobre el hijo.
- El código del insumo ya cargado (`MM-01`) se renombra a `MIL-01-ARN` en la migración (1 fila, conserva su `id`, su lote y su movimiento) si Felipe lo aprueba.

### 6.6 Volumen (números antes que opiniones)

25 modelos propios × 3,9 colores ≈ 100 combinaciones. Estimación a 3 años: 40–60 telas, 150–250 insumos (≤ 600 con holgura), ≈ 2 000 lotes y ≈ 11 000 movimientos (suponiendo 20 órdenes al mes; hoy hay 4 en 90 días). **Ninguna decisión de rendimiento**: la carta de 107 colores se carga con una consulta.

## 7. Objeciones

1. **El código sugerido no es el problema; que alguien lo escriba, sí.** Pedir «sugerir y no repetir» es arreglar el síntoma. Mejor que el código sea un resultado (tela + color), no un campo.
2. **Kilos y rollos no «acortan la carga»: son un cambio de modelo** (unidad de compra, factor y lote). Se construyen como un corte aparte, con su OK, porque tocan stock y costo.
3. **La carta de 107 colores no debe abrirse de entrada.** En Nueva orden ya se cerró por la misma razón (89 círculos tapaban lo obligatorio). Una tela suele tener 3–6 colores: buscador primero, carta a pedido.
4. **«Agregar material» está interpretado, no confirmado.** Lo leí como «crear un tejido nuevo al vuelo». Si querías decir otra cosa (varios materiales o avíos en un mismo ingreso), cambia el diseño de «Llegó tela».

## 8. Lo que no pidió y pesa más

**Hoy ya se puede crear una tela en «Kilos», y eso corrompe en silencio lo que el sistema aprende del consumo.** Tres agentes lo encontraron por separado; lo verifiqué en el código. El combo «Se mide en» ofrece Kilos para cualquier tela (`NuevoInsumoModal.tsx:116-121`); «Nueva orden» rotula entonces «kg por prenda» pero sugiere como valor el consumo del modelo, que está en **metros** (`TelaDeLaOrden.tsx:286-289`); `abrir_orden_produccion` escribe ese número en `producto_consumos` desde cualquier tela; y el cierre de la orden, al calcular «lo medido», solo suma telas en `metro` (`20261014160000…:230`): lo que está en kilos no cuenta y **no avisa**. Es exactamente lo que haría alguien que compra punto por kilo, o sea, lo que la idea (2) pide. Implementar los kilos «a lo fácil» abre ese camino; el contrato de unidad (6.3) lo cierra, y con un solo insumo en producción cuesta una migración de 1 fila (después, migrar datos). **Toca stock: OK de Felipe.**

**Hallazgo al construir la actividad 0 (dinero; ya corregido en la rama).** En «Ingresar insumo» el costo se leía con `Number(costo) || 0`: un costo escrito con coma («2,5») daba `NaN`, luego 0, y la hoja lo aceptaba, así que el lote se abría **a costo cero**; una cantidad con coma («48,2») dejaba el botón apagado sin decir por qué. Ahora se leen con las reglas únicas (`numeroDeMonto` para la plata, `leerCantidad` para cantidades) y lo que no se entiende se dice y no deja guardar. **El lote de 9 m cargado el 28-oct pudo caer en esto; no se pudo leer su costo (la consulta a producción se rechazó por permiso) y lo debe mirar Felipe.**

**También, otra decisión (dinero), no parte de este trabajo.** El costo de cada prenda depende de que la tela esté cargada, y hoy el sistema deja pasar un lote al stock sin tela (solo avisa; ADR-0510). Con Insumos vacío o incompleto, el costo promedio se envenena: en la prueba local, OP-343 entró a **S/ 4,50 en vez de S/ 22,38**; y `revertir_produccion` no recalcula `variantes.costo` (agente Patrones; reproducido en la base local según `docs/formidable/produccion-modulo.md:206`). Acortar la carga baja la probabilidad; qué hace el sistema cuando falta la tela (bloquear, marcar «costo sin medir», o restaurar al revertir) **es dinero y lo decide Felipe**. Es otra decisión, no parte de este trabajo.

## 9. Plan por actividades (cortes verticales; cada una verificable y con su commit)

| # | Corte | Toca | Migración |
|---|---|---|---|
| 0 | **Candados de unidad e índices** (hoy cuestan 1 fila; después, historia) y arreglo del decimal con coma en «Ingresar insumo» (`Number("12,5")` bloquea en silencio) | base + 1 línea de web | sí, chica, en partes |
| 1 | **Base «tela con colores»**: `materiales`, `insumos.material_id`, `crear_material` / `agregar_colores` / `editar_material`, códigos generados, migración del insumo existente | base | sí, en dos partes (ADR-0195) |
| 2 | **Hoja «Nueva tela»** + lista por tela con colores; carta de Catálogo; tejido al vuelo; parecidos | web | no |
| 3 | **«Agregar color»** y **«Editar tela»** | web + 1 RPC | mínima |
| 4 | **«Llegó tela»**: varias líneas, compra por kilo/rollo → metros, columnas del lote, aviso > 5 % (envoltorio de `recibir_insumo`, sin reescribirla) | base + web | sí |
| 5 | **Conexiones**: «Nueva orden» lee la tela por colores, el enlace «Regístralas ahí», avisos | web | no |
| 6 | **Cierre**: `/formidable` con una persona sin contexto, `/chaos` de la ruta de escritura nueva, `tema:auditar`, guías | pruebas | no |

**Registros del CI que cada cambio de pantalla obliga a tocar** (CLAUDE.md + agente Dependencias; el detalle por archivo está en el apéndice B): guía de foco (`lib/guia-de-foco-pantallas.ts`), guías interactivas y su huella (`lib/guias/huellas/produccion.insumos.json`, 33 controles hoy), `/unificar`, `/sugerir`, escenarios de `tema:auditar`, diccionario de datos, `knip`.

**Cómo se prueba (las tres preguntas de siempre):** (1) *concurrencia:* dos personas creando la misma tela/color a la vez → índice único + *get-or-create*; (2) *caída externa:* no hay API externa; con la red cortada, el RPC con `p_token` es reintentable; (3) *persona sin contexto:* prueba ciega con `/formidable`.

## 10. Pendiente de esta investigación

- Radio de explosión y registros del CI por archivo: ya incorporados (apéndices A y B).
- **No verificado:** si la cuenta del Taller tiene el módulo Producción; en qué unidad anota el corte del punto; las tablas de unidades de SUNAT; ASTM D3887; encogimiento del punto; rollos de molinos peruanos; modo oscuro y orden de gamas de la carta en un navegador.
- **Decisiones de Felipe** (ver la conversación de la fecha): modelo (tela con colores / solo insumos / solo UX), unidad del libro del punto, quién crea telas y colores, y la lectura de «agregar material».

## Apéndice A · Radio de explosión (agente Dependencias, condensado)

R = rompe · A = se adapta · M = mejora. Columnas: (i) colores bajo una tela · (ii) unidad de compra ≠ uso · (iii) rollo.

| Consumidor | Archivo | Supuesto de hoy | (i) · (ii) · (iii) | Esfuerzo |
|---|---|---|---|---|
| Insumos | `InsumosPanel.tsx:213`, `insumos-guia.ts` | 1 fila = 1 color = 1 unidad | R (el alta cambia) · A · M | Alto |
| Órdenes de insumos, papel, Recibir | `NuevaOrdenInsumo.tsx:631`, `RecibirOrdenInsumoModal.tsx:268` | línea = insumo + unidad copiada | A · A · A | Medio |
| Nueva orden, Editar tela | `orden-tela-reglas.ts:95`, `TelaDeLaOrden.tsx:249,286` | tela = insumo con tejido y color; plan en su unidad | M · R · — | Medio |
| Plan, «en camino», consumo del modelo | `20261014154000:260,428,588`, `20261015165000:58` | suma por `insumo_id` sin unidad; `tela_por_prenda` = metros, escrito desde cualquier tela | — · R · — | Alto |
| Cierre y lotes | `20261014160000:230`, `20260917141500:157`, `orden-tela-usada-reglas.ts:92-95` | solo `'metro'` cuenta para «lo medido»; el consumo no parte lotes | — · R · R si rollo = lote | Alto |
| Resumen y decisión | `produccion-decision-reglas.ts:209`, `pedir-insumo-reglas.ts:22` | rendimiento y «Pedir N» por `insumoId`, en su unidad | M · A · — | Medio |
| Finanzas, Eficiencia, Observatorio, ficha de producto | `eficiencia-reglas.ts:90`, `observatorio.ts:20`, `PanelDelTaller.tsx:286` | dinero y órdenes, no `insumos` | nada | Bajo |

**Con el diseño propuesto** (`insumos` como hoja sin cambios, libro en metros, rollo como dato del lote) las filas 4 y 5 quedan intactas **por construcción**; el riesgo se concentra en la pantalla (fila 1) y en la lectura por tejido y color (fila 3), que sigue válida porque los hijos conservan las copias. Código y nombre **no son llave**: todo va por `insumo_id`.

**Hallazgos extra:**
- **Tres puertas escriben lotes:** `recibir_insumo` (directo, solo líder), `recibir_comprobante_produccion` (facturas) y `recibir_orden_insumo` (órdenes de insumos). Las columnas nuevas del lote serán **opcionales** (nulo = comprado en la unidad de stock) para no obligar a las otras dos a cambiar. Pasar órdenes y facturas a kilos es R4 y pide unificar las puertas antes.
- **Trampa de hoy:** «Ingresar insumo» desde la cabecera abre con el primer insumo de la lista A–Z ya elegido (`InsumoModales.tsx:24`) y la guía lo da por hecho (`insumos-guia.ts:78`): se puede abrir el lote del insumo equivocado.
- **El camino formal** (orden de insumos → papel → recibir) cuesta ≈ 68 clics en 4 pantallas y dos personas (quien hizo la orden no la recibe, `recepcion-orden-insumo-reglas.ts:143`): es un control, no un descuido. **El directo** es del líder y no deja factura, deuda ni proveedor en el lote.
- **Nueve pantallas eligen un insumo sin poder crearlo** (Ingresar, Nueva orden de insumos, papel de la orden, Nueva factura, Nueva orden de producción, Editar tela, Ficha de consumo, Anotar lo que usaste, cajón viejo). El patrón de la casa para arreglarlo es `ComboBuscable crear`.
- **Tests que fijan comportamiento:** `insumos-reglas.test.ts` (PEPS sin partir), `orden-tela-reglas.test.ts`, `orden-tela-usada-reglas.test.ts`, `ordenes-insumo-reglas.test.ts`; 46 tests y 38 suites de base mencionan insumo.

## Apéndice B · Registros que fallan en el CI al tocar Insumos (agente Dependencias)

- **Guía de foco:** `lib/guia-de-foco-pantallas.ts` (Insumos en `:185,330,385,511`): toda hoja nueva con campos se declara `aplicada` o `no-aplica`; `pnpm focus`.
- **Guía interactiva:** un botón, campo o pestaña que nace o se va bajo una `page.tsx` rompe su huella (`produccion.insumos` = 33 controles; también `produccion.ordenes` 129, `.ordenes.numero` 137, `productos.id.editar` 145, `.recibir` 19, `ordenes-insumos.*`, `produccion.comprobantes`). Cada `data-guia` ↔ un paso (`lib/guias/pantallas/produccion.ts:687`). Cumplir: `pnpm --filter web guias:recorrer`, luego `guias:huella <id>`.
- **Piezas y textos:** `unificar.test.ts` (nada de Cancelar, chips, casillas o tablas a mano; `// unificar-fijo:`); `sugerir.test.ts` (ejemplos derivados en `lib/sugerencias-*.ts`; `InsumoModales.tsx` está en la deuda, `sugerir-archivos.ts:44`: al tocarlo se paga).
- **Oscuro, hojas, menú:** `tema-colores` / `tema-tokens.test.ts` (solo tokens; la muestra de la tela es `data-color-dato`); `hojas-*` y los combos pasan solos con `<Modal>`, `Desplegable` y `ComboBuscable`; `modulos`, `menu` y `ancho-completo.test.ts` solo con menú o ruta nueva; `tema/escenarios/registro.mjs:1386` + `tema:auditar` es casilla del PR; `knip.ts`: lo huérfano se borra o lleva `@public` / `@internal`.
- **Esquema:** `pnpm reservar migracion`; tabla nueva → «pájaro» en `scripts/datos/aviario.mjs:312`; `diccionario-datos.test.ts` lee el volcado de producción (no la migración); suite en `scripts/ci/pruebas-postgres.mjs`; check «SQL pegado»; sin test: `docs/ARQUITECTURA.md`, bitácora y ADR.
