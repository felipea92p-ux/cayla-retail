# Ficha de consumo del modelo: tres direcciones para decidir (2026-10-26)

> **Estado: para que Felipe elija mirando (ADR-0358). Nada de esto está construido:** sin cambios en `apps/web`, migraciones ni RPC.
> **Verlo:** `python3 -m http.server -d docs/maquetas 3031` y abrir `/consumo-modelo-2026-10/index.html` (o `preview_start maqueta-referentes`).
> Cada dirección es tocable, en claro y oscuro, con ancho 1024 y 1440 (barra de arriba; también por la URL: `#medido,oscuro,1024`). Solo usa los tokens de `globals.css` / `tema.css`.
> **Datos:** el modelo, sus 4 colores (Blanco, Gris perla, Gris melange, Beige), las tallas S y M y el precio S/ 59 son los **reales** del Chaleco de Prueba (CHA-0001, base local). Las cantidades (100 prendas: 40 S y 60 M), telas, avíos y las 3 órdenes cerradas son **inventados**.

**Pedido (sesión madre, ADR-0510 «descartó»):** hoy el plan de una orden usa **un número de tela por color para todas las tallas** (`producto_consumos.por_talla` existe desde ADR-0400 y nada la escribe ni la lee), y los **avíos hay que reescribirlos en cada orden**. Decidir dónde y cómo se escribe una *ficha de consumo* del modelo.

## Las cuatro preguntas, contestadas por cada dirección

| | **A · En el modelo** | **B · En la orden** | **C · Una hoja, tres puertas** |
|---|---|---|---|
| ¿Dónde se escribe? | Editar producto ▸ «Ficha de consumo». Nueva orden solo la lee. | Nueva orden y «Editar tela y avíos». Sin pantalla nueva. | Una hoja que se abre desde Editar producto, Nueva orden y la orden abierta. |
| ¿Quién la edita? | Quien edita el catálogo. El Taller ajusta *solo su orden*. | Quien abre la orden, si el modelo no tiene ficha; corregir una existente sigue siendo de Catálogo. | Quien tiene Producción en el Taller; Catálogo la ve. **Relaja ADR-0400 act. 7b: pide tu OK.** |
| ¿Solo se sabe un número? | «Una cifra \| Por talla» + insignia **Aproximado** + lo que pediría. | Escribes una talla y la otra la **copia** (punteada, «≈»). | Escalones **Estimado → Audaces → Medido** a la vista. |
| ¿Lo medido corrige lo declarado? | **Bandeja en Catálogo**: alguien acepta o descarta. | **Se pregunta al pasar al stock.** | **Manda solo desde la 3.ª orden** (P-21, 16 oct), con «Volver a Audaces». |

## Lo que cada una gana y lo que cuesta

- **A · Gana:** un solo dueño (Catálogo) y la ficha existe *antes* de la primera orden. **Paga:** el Taller, que es quien sabe, tiene que pedirle el cambio a otro módulo (el mismo error de ADR-0306: «Existencias sin poder reponer»), y metes una sección en un formulario de otro módulo.
- **B · Gana:** lo más barato; extiende lo que ya existe (el interruptor «dejar como el del modelo»). **Paga:** la ficha nace tarde y *según quién abrió la primera orden*; sin orden no hay dónde declararla (lo que Felipe preguntó el 25-oct es justo eso); cada pregunta al cerrar es un clic más para quien cierra.
- **C · Gana:** una sola forma de hacerlo (Brooks), desde donde la persona ya está, y lo medido se explica solo. **Paga:** una pieza nueva y tres integraciones; y decidir el permiso.

## Recomendación

DECIDÍ: **C**, construida en dos tandas: primero la hoja y la puerta de Nueva orden (tela por talla + avíos), después las otras dos puertas y lo medido.
DESCARTÉ: **A** porque obliga al Taller a salir a otro módulo para algo que usa cada día; y **B** porque la ficha quedaría atada a una orden y sin lugar donde corregirla.
SE ROMPE SI: dos personas editan la ficha del mismo modelo a la vez desde pantallas abiertas antes (gana la última; hoy «raro» con 3 tiendas y 1 Taller, pide `version` si se vuelve común); o el Taller corta **punto** y compra por kilo (la maqueta supone metros: P-19 sigue sin construirse).

Dos reglas que no son de maqueta sino de diseño de datos:
1. **Por talla es opcional, y un número solo es «aproximado» por definición** (`por_talla` nulo): así desaparece el caso especial «¿esto es estimado?». Quien solo tiene un número lo escribe y lo afina cuando tenga más.
2. **Lo medido se escala, no se reemplaza:** la tela se mide por *orden* (libro de insumos), no por talla. La forma M/S (+4,3 %) sigue siendo la de Audaces y lo medido solo sube el nivel (S 1.150 → 1.220; M 1.200 → 1.273).

## Objeción y lo que no pidió

**Objeción.** La talla es la palanca más chica de las tres. En el ejemplo la M gasta 4,3 % más que la S: eso mueve el pedido en ~2 m de 122 (1,7 %), menos que la merma (3 %). Lo medido, en cambio, sube el consumo ~6 % sobre Audaces (capa 1 contra capa 3, `03-tela-y-materiales.md` H-3.6), y los **avíos** son lo que más se reescribe. Y el consumo «por talla» depende de cuántas tallas se cortan juntas en la marcada (H-3.1): a nivel de modelo es una aproximación de una aproximación. Por eso «Por talla» es un interruptor y no la regla; si hubiera que recortar, se recorta ahí, no en los avíos ni en lo medido.

**Lo que no pidió (la de mayor consecuencia).** `cerrar_produccion` (migración `20261014160000`, ~línea 233) **pisa** `producto_consumos.tela_por_prenda` con lo medido ya desde la **primera** orden cerrada: la cifra de Audaces se pierde y «Volver a Audaces» sería imposible; además contradice P-21 (3 órdenes) y, con tallas, aplanaría S y M en un promedio. Hay 0 órdenes cerradas hoy, así que todavía no se perdió nada. Conviene arreglarlo **antes de la primera orden real**, aunque no se elija ninguna dirección.

## Actividades para construirlo (cada una, un corte vertical con su commit; las 1–3 esperan tu OK)

1. **Separar lo declarado de lo medido** *(base, toca `cerrar_produccion`, función ya parchada en vivo: reemplazo anclado)*: lo declarado queda intacto; lo medido va aparte con su orden; la regla de 3 se calcula al leer. Es el arreglo de arriba.
2. **Reglas puras** `consumo-modelo-reglas.ts` + prueba: plan por color = Σ talla (consumo × prendas) × (1 + merma); escalón (estimado/Audaces/medido); escalar lo medido; destino del avío (toda la orden, cada color con el insumo de su color, cada talla). Paridad con la base como en `orden-tela-reglas`.
3. **Base de la ficha:** `producto_avios`, RPC `guardar_ficha_consumo(producto, tela, avíos, alcance)` firmada con `fn_actor_persona_id(true)`, y `produccion_insumos.consumo_por_talla` aceptado por `abrir_orden_produccion` y `guardar_insumos_orden`. Prueba en Postgres con ROLLBACK (doble clic, dos sesiones).
4. **La hoja «Ficha de consumo»** (`<Modal tamano="ancha">`, pieza única) + **puerta Nueva orden**: propone tela por talla y avíos. Guía de foco, sugerencias coherentes, escenarios de oscuro. *No es módulo nuevo (ADR-0306).*
5. **Puertas 2 y 3:** orden abierta (la hoja reemplaza a `EditarTelaModal`, con «solo esta orden / también el modelo») y Editar producto (resumen + botón).
6. **Lo medido a la vista:** escalones, historial de las 3 órdenes y «Volver a Audaces».
7. **Cierre:** guía interactiva, `/formidable`, `/chaos` (guarda: doble clic, dos pestañas, edición simultánea), diccionario de datos y ADR.

## Para decidir (si no respondes, ejecuto esto)

1. **¿Quién edita la ficha?** Recomendada: Producción edita, Catálogo ve. *Si no respondes: se mantiene la regla de hoy (corregir lo que ya existe es de Catálogo).*
2. **¿Lo lleva solo la 3.ª orden o se pregunta?** Recomendada: solo, con «Volver a Audaces». *Si no respondes: la hoja lo muestra y lo aplica solo desde la 3.ª.*
3. **¿«Por talla» opcional?** Recomendada: sí. *Si no respondes: opcional.*
4. **¿El punto (kilos)?** Fuera de esta entrega; la ficha guarda la unidad de la tela para no cerrarle la puerta.

QUÉ HICE: preparé tres maneras tocables de declarar cuánta tela lleva cada talla y qué avíos lleva el modelo, con el Chaleco de Prueba.
POR QUÉ ASÍ: eliges mirando, no por descripción, y las cuatro preguntas (dónde, quién, aproximado, medido) quedan contestadas lado a lado.
QUÉ SE ROMPERÍA SIN ESTO: construir la ficha a ciegas habría repetido un patrón que ya falló (una función en un módulo donde nadie la usa) y dejado a `cerrar_produccion` pisando la cifra de Audaces.
