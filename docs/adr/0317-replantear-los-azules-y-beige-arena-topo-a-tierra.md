# ADR-0317 — Replantear los azules, y Beige, Arena y Topo a Tierra (2026-10-02)

**Decidió:** Felipe, por preguntas de opción, en tres tandas. **Ajusta** el ADR-0314 (Nude ya no se mueve y la regla de croma deja de
mandar) y **continúa** el ADR-0316 (las fichas de cuatro colores se reescriben). **Revierte parcialmente** dos decisiones anteriores:
el **ADR-0215** (que ancló Azul eléctrico y Violeta a un Pantone porque sus hex «estaban tan saturados que ningún tinte textil los
alcanza») y un descarte del **ADR-0312** (que dejó los cuatro colores creados a mano «donde están»: aquí uno se funde).

## El problema

Felipe miró los azules de la carta y vio tres cosas: *«entre Azul medio y Eléctrico hay un error»*, *«Azul medio e Intermedio me genera
confusión»* y *«de todos los azules hay que eliminar uno»*. Medido con la base de producción y el repo el 2026-10-02:

1. **Azul eléctrico se leía apagado.** La paleta original (`20260926100000`) lo creó en `#2E5BF2`, un azul vivo (croma OKLab 0,231).
   La migración `20260926180000` lo ancló a Pantone 18-3945 «Amparo Blue», `#4A5FA5` (croma 0,114), un azul apagado. **No fue un
   descuido: el ADR-0215 lo decidió así**, porque esos hex se habían puesto a ojo y «ningún tinte textil los alcanza». Pero **Pantone TCX
   no tiene un azul eléctrico**: el azul vivo más intenso que trae en ese matiz llega a croma 0,137. El efecto fue que «Azul medio»
   (`#3936CD`, croma 0,222, el color más intenso de toda la carta) parecía el eléctrico y el eléctrico parecía un medio. Las prendas de
   Eléctrico son 9 variantes en 5 prendas (BOD-0007, BOD-0010, BOD-0012, POL-0020, POL-0021, 6 unidades); Felipe, que las conoce,
   confirmó que son un azul vivo.
2. **Azul medio e Intermedio son el mismo lavado con dos nombres.** Los dos se crearon a mano para jeans: Medio lo llevan la Casaca Jean
   (CAS-0008), el Jean Mom (JEA-0012), la Camisa Oxford (CMS-0025) y el Pantalón Oxford (PAN-0016); Intermedio, solo el Jean Palazzo
   (JEA-0013). Los colores reales de cada jean: el Mom trae Celeste, Azul claro, Denim y Medio; el Palazzo, Celeste, Denim e
   Intermedio. En los dos, el lavado que va después de Denim lo escribieron dos personas con dos nombres. Y los dos círculos estaban
   mal: Medio era un ultramarino vivo y Intermedio un gris pizarra (croma 0,024).
3. **Violeta tenía la misma deriva** que Eléctrico: `#7A3FB6` (vivo, 0,181) pasó a Pantone 18-3633, `#775496` (apagado). No tiene
   prendas. Se auditó el resto: de los **55 colores** anclados el 26-sep de los que se conoce el hex anterior (Coñac no tiene), solo
   tres se movieron más de ΔE2000 8: Eléctrico (9,8), Violeta (8,8) y **Negro (8,7**, de `#111111` a `#2D2C2F`, el negro de Pantone
   19-0303: un negro textil, no un negro de pantalla); Arena (7,9), Cobalto (5,6) y Lavanda (5,0) quedaron entre 5 y 8, y los otros 49
   en menos de 5. Negro, Arena y Cobalto **no se tocan** (Pantone sí tiene un negro, un arena y un cobalto cercanos); Negro queda anotado.
4. **Familias:** Neutro tenía 13 colores en una fila. Felipe pidió Beige, Arena y **Topo** a Tierra.

## Decidí

**A. Azules: 13 → 12** (Intermedio se funde en Medio):

| Color | Antes | Después |
|---|---|---|
| Azul eléctrico | `#4A5FA5`, Pantone 18-3945 (apagado) | `#2E5BF2`, **sin Pantone** (vivo, como la paleta original) |
| Azul medio | `#3936CD`, sin Pantone (ultramarino vivo) | `#4A638D`, Pantone 18-3928 TCX «Dutch Blue» (azul de lavado medio) |
| Azul Intermedio | `#56626E` (gris pizarra) | se funde en Azul medio y se archiva |
| Índigo | `#49516D` | **se queda** |

Dutch Blue = `#4A638D` lo confirman tres fuentes independientes (dos conjuntos de datos de Pantone y colorxs/icolorpalette); ningún otro
color usa ese código. **Lo que cuesta:** el par de azules más cercano queda a ΔE2000 8,31 (hoy 8,28), pero ese par es **Medio–Denim**, y
en los dos jeans la pareja Denim + Medio pasa de 12,8 (Palazzo, con Intermedio) y 20,2 (Mom, con el Medio ultramarino) a 8,31: a 0,31
del umbral 8 del aviso «se confunde con». Medio también queda a 8,3 de Cobalto y a 8,5 de Índigo.

**B. Tierra:** Beige, Arena y Topo pasan de neutro a tierra. Neutro queda en 10 y Tierra en 11. **Nude se queda en Neutro** (lo decidió
Felipe; el ADR-0314 lo movía). **La familia es un dato (`colores.familia_color`), no un cálculo:** la regla «croma < 0,03 es neutro»
del ADR-0314 no podía poner a Topo (0,023) en Tierra, porque Gris piedra (0,026), que es neutro, tiene más croma. La croma queda como
guía y las dos excepciones —Topo y Nude— se escriben en `lib/colores-familias.ts`. La migración también renumera `orden` de Tierra
(200–250 en el orden de la carta) y cambia Vainilla y Mantequilla (600/605), porque Conteo, Editar producto y Vender aún listan por
`orden`; los 16 colores del ADR-0316 siguen en 2000 (al final de esas listas) hasta que alguien deje de leer `orden`.

**C. Violeta** vuelve a `#7A3FB6`, sin Pantone (Felipe: *«vivo, como el original»*). No tiene prendas.

**D. Las fichas** (descripción y «combina con») de **cuatro** colores se reescriben: Eléctrico, Medio y Violeta (las de antes se
escribieron para los hex equivocados: «Medio: intenso y saturado, vibrante»; «Eléctrico: … sin ser estridente») y **Perla** (el hex
nuevo del ADR-0314 la dejó a ΔE 6,1 de Crudo y su ficha decía «casi igual a Crudo»). La de Medio dice «más oscuro y sobrio que el
denim», porque Azul denim ya dice «el color del jean». La de Perla vive en esta migración y no en la de su hex porque la columna
`descripcion` nace después de ese archivo y el CI las aplica en orden de fecha.

**E. Índigo se queda.** Felipe delegó la decisión: *«si se va a usar a futuro, déjalo»*. «Índigo» es nombre de uso común en denim para el
lavado oscuro, CAYLA vende jeans, y su propia ficha ya dice «de aire denim». Cero prendas hoy no es argumento: Turquesa, Petróleo, Zafiro y
Azur tampoco tienen. Pedir «eliminar uno» lo cumple la fusión de Intermedio.

**F. Cómo se funde Intermedio** (3 variantes del JEA-0013: JEA-0013-AZI-28, -30 y -32; 1 unidad y 1 movimiento, en la -28): **desde
Editar producto, con una cuenta con permiso de catálogo** (Productos y Atributos; Felipe sirve), con `fn_corregir_identidad_variante`
(ADR-0263). Pasan a JEA-0013-AME-28/30/32; conserva los códigos de barras viejos —las etiquetas pegadas siguen valiendo—, deja el
cambio en el historial y sube la versión de la prenda. No hace falta ser Líder: las 3 variantes no tienen ventas, separaciones ni
cambios (D-136 solo lo exige si ya salió con un cliente). Después se desactiva Intermedio desde Atributos (Editar ▸ Desactivar):
la pantalla **se bloquea y dice cuántas variantes activas lo usan** (no las lista), y con 0 pasa.

## Descarté

- **Fundir Intermedio por SQL.** El sistema **no** lo impide: el disparador `variantes_identidad_solo_por_funcion` solo frena a la web
  (`authenticated` y `anon`), y el SQL Editor corre como `postgres`. Se descarta por lo que se perdería: un `update` directo no
  recalcula el `codigo` (la variante seguiría llamándose JEA-0013-AZI-28 con color Azul medio), no guarda el código viejo en
  `codigos_barras`, no deja historial de quién lo hizo y no sube la versión de la prenda (ADR-0193: una ficha abierta antes podría
  guardar el color viejo encima).
- **Renombrar Intermedio a «Azul pizarra»** (mi primera propuesta): Felipe la rechazó con razón: *«no debería existir dos nombres que
  aparenten lo mismo»*. Un color con otro nombre seguía siendo un segundo color para el mismo lavado.
- **Archivar Intermedio en la migración:** tiene 3 variantes; archivar un color con prendas lo deja en su ficha como «inactivo».
- **Mantener Eléctrico apagado y llamarlo «Azul real»:** quedaría a ΔE 4,1 del Medio nuevo; habría que fundirlos igual.
- **Dejar Violeta apagado hasta que llegue una prenda:** Felipe prefirió el vivo, que además se distingue más de Glicina y Morado
  (ΔE2000 12,3 o más).
- **Otra regla de croma con parámetros** (por ejemplo, ponderar por claridad): no la evalué a fondo, porque cualquiera que pusiera a Topo
  (0,023) en Tierra y a Gris piedra (0,026) en Neutro necesitaría un parámetro pensado para un solo color. Más simple y más honesto:
  la familia es dato y las dos excepciones quedan escritas.
- **Archivar un azul «porque no tiene prendas»:** ese criterio no decide entre Índigo, Turquesa, Petróleo, Zafiro y Azur (ninguno tiene),
  y dos los agregué hoy. Lo que sí decide es si se va a usar, y en Índigo la respuesta es que sí.

## Se rompe si

- **Las prendas de Azul medio o de Azul eléctrico no son del azul elegido:** Medio se pintaría vivo, o Eléctrico apagado, en los
  filtros. Felipe confirmó las dos el 2026-10-02; si cambia de idea, es un `update` de un hex. (Eléctrico tiene 9 variantes en 5
  prendas: su círculo cambia ΔE 9,8 al pegar.)
- **Se vuelve a necesitar la premisa del ADR-0215:** un proveedor de tela pide la referencia de Eléctrico o de Violeta y ya no hay
  código Pantone en la ficha (ningún tinte los alcanza, como decía el 0215). El círculo mostrará un color que la tela quizá no
  alcance. Si una prenda llega con su código real, se escribe a mano en Atributos.
- **Alguien crea una variante de Azul medio en el JEA-0013 antes de la fusión:** la corrección de las 3 variantes chocaría
  (producto + color + talla ya existe) y la función lo avisa con palabras. Hoy no existe ninguna.
- **Alguien crea un color con croma entre 0,023 y 0,035** (un gris-beige suave): no hay regla que lo clasifique y dos personas lo pueden
  poner en lados distintos. Se decide a mano, color por color.
- **Se pegan dos veces las migraciones:** los hex y el `orden` están anclados al valor viejo (no pisan nada), pero las fichas y la
  familia no: volver a pegar pisa una ficha o una familia que un Líder haya cambiado después.

## Verificación

- **Ensayo sobre una copia exacta de producción.** En un Postgres 17 desechable (borrado al terminar), con el esquema mínimo de
  `colores` —candados, índices únicos de nombre y de Pantone, disparador de estado y de «combina con»— y las 95 filas reales, antes de
  aplicar nada las tres huellas eran **idénticas a las de la base real**:
  `select md5(string_agg(codigo||'|'||familia_color||'|'||upper(coalesce(hex,''))||'|'||coalesce(pantone_tcx,'')||'|'||activo||'|'||estado, ';' order by codigo)) from retail.colores` → `bf7250d8829276283e33e87f332d8b02`;
  `select md5(string_agg(codigo||'|'||descripcion||'|'||array_to_string(combina_con,','), ';' order by codigo)) from retail.colores where activo` → `200cbec1406cad25de2f9c1bd72c9d9a`;
  `select md5(string_agg(codigo||'='||orden, ' ' order by codigo)) from retail.colores` → `2aeb3a0aee53cfc56730c98eba734640`.
  Primera pasada: `UPDATE 3 + 11` (familia y orden de Tierra), `1 + 1 + 2` (hex de Perla y Mantequilla, y su orden) y `1 + 1 + 1 + 4`
  (Eléctrico, Medio, Violeta y sus cuatro fichas). Segunda pasada: `UPDATE 0` en todo y la misma huella (idempotente). La base resultante
  coincide con la carta de la prueba **90 de 90** por código, hex y familia; solo sobra Intermedio, que se archiva después de fundirlo.
  (Una trampa del ensayo: el disparador de estado deja los colores del seed en «pendiente»; hay que normalizarlos a «aprobado» antes
  de comparar.)
- **La fusión de Intermedio, predicha con producción** (solo SELECT): las 3 variantes pasan. Ninguna choca con una variante AME del
  JEA-0013, AME está activo, los códigos nuevos están libres (en variantes y en códigos de barras), ninguna tiene ventas ni
  separaciones, el producto no tiene fotos ni temporadas por color, y después Intermedio queda con 0 referencias en todo el sistema, así
  que Atributos deja desactivarlo (90 colores activos y 12 azules).
- **Pruebas:** `color-escala.test.ts` con los 90 colores y el orden esperado de un prototipo independiente (otro camino de cálculo:
  sRGB → XYZ → OKLab). Mutación: con el hex viejo del eléctrico la prueba de distancia mínima falla con «Azul eléctrico ~ Azul medio:
  4.11» —el error original—; con Topo de vuelta en Neutro fallan las filas de Neutro y Tierra. Suite completa de la web: 312 archivos,
  154.965 pruebas, `tsc` y ESLint limpios. Mínimo entre no metálicos: 6,03 (Beige–Arena); Eléctrico queda a 11,7 o más de cualquier
  vecino y Violeta a 12,3 o más.
- **En el navegador** (Chrome real, `ColoresLista` con los 90 colores y sus fichas): a 1280 y a 375 px el orden de cada familia es
  idéntico al de la prueba, 90 tarjetas con «Combina con», sin desborde ni errores. A 375 px el sexto círculo de «Combina con» se salía
  de la tarjeta (defecto de #749): ahora salta de línea.
- **Revisión independiente:** cuatro revisores de solo lectura (SQL y datos, veracidad de los documentos, código y pruebas, y uno que
  intentó romper la fusión) dieron 23 hallazgos; se comprobaron uno por uno. Eran ciertos y se corrigieron: el disparador que «frena el
  SQL Editor» (falso), «el resto se movió menos de 5» (falso: faltaban Negro, Arena y Cobalto), el `orden` sin renumerar, la ficha de
  Perla, la de Medio frente a Denim, las prendas de Eléctrico sin mencionar, el ADR-0215 no citado, el permiso de Líder, lo que muestra
  Desactivar, el ADR-0314 que aún decía lo viejo, la huella sin fórmula y comentarios desactualizados.

## SQL para producción

Tres archivos, sin políticas ni `alter`, idempotentes; se pegan **una sola vez, en este orden** (cada uno entero) y **antes o después**
de desplegar la web (nada se rompe: solo cambian el círculo, la fila y la ficha de unos colores):

1. `20261002190000_colores_neutro_mas_corto.sql` → `neutro 10, tierra 11`, y Tierra con `orden` 200 a 250.
2. `20261002191000_colores_hex_mas_distinguibles.sql` → `PER = #DBDDD9`, `AMM = #FEDF87`, `VAI 600 · AMM 605`.
3. `20261003200000_colores_azules_y_violeta.sql` → `AZE #2E5BF2`, `AME #4A638D (18-3928 TCX)`, `VIO #7A3FB6`, y cuatro fichas nuevas.

Después del SQL, dos acciones tuyas: en **Editar producto** del JEA-0013 pasar las 3 variantes de «Azul Intermedio» a «Azul medio», y en
**Atributos** desactivar «Azul Intermedio». Resultado esperado: 90 colores activos y 12 azules.

## Lo que Felipe pidió después y no se construyó aquí

Que la descripción y el «combina con» se vean también **en el mostrador** (primero Existencias, después Vender), **al dar de alta** (Nuevo
producto y Agregar colores) y como **sugerencias con lo que hay en stock** («con este Polo Beige: Pantalón Azul marino, 2 en TRU»). Es
trabajo de pantallas y reglas de negocio (qué categoría combina con cuál): va por `/construir`, con su lista de actividades aprobada antes
de tocar código, cuando este PR y #749 estén fusionados.

## Pendiente

- `colores.orden`: los 16 colores del ADR-0316 siguen en 2000. Lo cierra la tarea «dejar de leer `colores.orden` en Vender, Conteo y alta».
- La sección `colores` de `docs/datos/modulos/02-catalogo-y-vocabulario.md` quedó con datos viejos de antes de este cambio («30 filas»,
  columnas que ya no existen) y `docs/datos/generado/` está atrasado: pasada aparte.
- Negro (`#2D2C2F`, ΔE 8,7 del hex original) se ve como un gris muy oscuro en pantalla; si molesta, es un `update` de un hex.

## Cómo deshacerlo

Web: `git revert` del PR (no toca datos). Base: el `update` inverso de cada archivo (están en su encabezado). Intermedio se reactiva desde
Atributos; las 3 variantes se devuelven con la misma corrección de Editar producto.
