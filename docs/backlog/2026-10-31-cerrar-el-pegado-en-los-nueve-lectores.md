# Backlog — cerrar el pegado de celdas en todos los lectores (2026-10-31)

## NO TRAE SQL

Reglas puras de `apps/web/lib/`, un filtro de campo y una prueba. Sin migración, nada que pegar en producción.

## DECISIONES QUE TE TOCAN A TI

1. ~~«S/. 25»~~ **HECHO en este PR** (Felipe, 31-oct: «sí, unifícalo»): los ocho lectores con símbolo de moneda
   leen «S/. 25» como veinticinco soles, con su candado en `lib/pegado-de-celdas.test.ts`. Antes cuatro leían
   veinticinco céntimos y dos lo rechazaban.
2. **`parsearPorcentaje` sugiere algo que después rechaza.** Su mensaje dice «por ejemplo 25 o −15» con el menos
   tipográfico (U+2212), y la función solo acepta el guion: quien copie el ejemplo del aviso recibe otro aviso. Es
   anterior a este PR y es de una línea. Principio 12 (el error es del diseño, no de la persona).

## LO QUE QUEDÓ FUERA, A PROPÓSITO

~~Los filtros de tecleo de Caja~~ **HECHOS en este PR** (Felipe, 31-oct: «sí, ciérralos»): `limpiarMonto` del gasto
rápido y `limpiarMontoIngreso` del ingreso rápido conservan los blancos de adentro, así que el campo muestra «12 8 5»
y la hoja sigue pidiendo «Cuánto», en vez de dejar escrito «1285» y darlo por bueno. No hizo falta validación nueva:
`parsearMonto` ya usa `leerMontoPlata`.

~~Los campos de días~~ **HECHOS** (Felipe: «sí, los días»): `PlazoModal` y `RelojDelPedido` usan `soloCifrasEscritas`,
el helper nuevo con su prueba, y sus validadores —que ya eran estrictos— rechazan el pegado solos.

~~Los tres últimos~~ **HECHOS** (Felipe: «sí, los tres»): `precioEscribible` (Vender), `limpiarPrecio` (el alta) y
`soloDigitos` (cantidades del plan). Los dos de precio juntan los miles con la regla única y dejan a la vista solo
lo que no entienden, porque ahí «1 200» es un separador legítimo y el modal hace `Number(precio)`.
**Verificado en Vender a 375 px (PL-105)** con captura: pegar tres celdas deja «12 8 5» escrito, «Falta: Precio» y
«Agregar al ticket» apagado; «1 200» se junta y entra.

**Ya no queda ningún filtro ni lector de cifras con este agujero**, hasta donde alcanzan el candado y el repaso a
mano de los 24 sitios con clase negada.

**Lo que el candado NO cubre:** el borrado implícito de una clase negada (`replace(/[^\d]/g, "")`). Cubrirlo daría
21 falsos positivos (ids de SVG, extensiones de archivo, nombres compactados) y una lista que nadie leería. Si
mañana nace un filtro así en un campo de cifra, el candado no lo verá: se encuentra mirando, como estos tres.

## SIGUE PENDIENTE DE `/chaos` SOBRE «NUEVO AVÍO» (informe en `.chaos/`)

Seis hallazgos sin arreglar, por gravedad:

1. **Medio botón entra y la pantalla dice que es uno** (g2): «0,5» se acepta, la base guarda `0.500`, la pantalla
   muestra «1 unid.». Nadie exige entero para unidades, conos, pares ni docenas.
2. **Un invisible crea dos fichas del mismo botón** (g2): U+200B pegado de la web. **Es el mismo agujero del 30-oct
   en Atributos**: una causa, dos pantallas, y el arreglo toca la base (`fn_clave_texto`).
3. **Enter guarda el avío** (g2), sin tocar «Crear el avío», en una hoja que fija una decisión irreversible.
4. **Una clase nueva se recorta a 60 letras en silencio** (g2) y el aviso de éxito muestra el nombre mutilado.
5. **«Si cierras ahora, se pierde lo que escribiste» … y se guarda** (g3).
6. **Un botón sin medida no se puede registrar** (g3), aunque el diseño y la base la hacen opcional.

Y aparte: **en «Nuevo avío» el costo por unidad usa el lector de plata**, así que 0,045 —lo que cuesta un botón— se
rechaza (`lib/avio-nuevo-reglas.ts:97`). Es el G13 ya arreglado para telas que no llegó a avíos.

## SIGUE PENDIENTE DE ADR-0580

- `pnpm --filter web tema:auditar` con escenarios para «Nuevo avío» y Catálogo ▸ Atributos ▸ Avíos.
- `guias:recorrer`: las dos huellas se aceptaron revisando los pasos a mano.
- `/formidable` con una persona sin contexto.
