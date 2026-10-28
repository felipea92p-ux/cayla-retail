# ADR-0554 — Insumos: una tela con sus colores, llevada en metros, comprada por metro, kilo o rollo

- **Fecha:** 2026-10-28 · **Estado:** **decidido por Felipe el 2026-10-28** (cuatro decisiones, abajo). **Construido en la rama `claude/insumos-module-improvements-2097ef`:** la actividad 0 (candados de unidad; la migración `20261028172000_insumos_candados_de_unidad.sql` **no está en producción**: la pega Felipe, una sola parte) y las maquetas (`docs/maquetas/insumos-nueva-tela-2026-10/`). **Las actividades 1 a 6 no están construidas.**
- **Nace de:** Felipe, 2026-10-28: «la parte de Insumos es demasiado tediosa de completar». Seis ideas: una tela con varios colores; metro o kilo; el rollo y cuántos metros trae; la carta de colores de Catálogo; «agregar material»; código sugerido y sin repetir. Investigación de cinco agentes + lectura directa: `docs/investigacion/2026-10-28-insumos-tela-colores-y-compra.md`.
- **Reabre y completa:** R-25 (`docs/datos/15-COMO-OPERA-CAYLA.md`: «metro, kilo y rollo entero. Las tres»), ADR-0400 d.6 (que dejó la conversión kilo → metro fuera por alcance) y las respuestas P-19 y N-2 de Felipe del 2026-10-16 («también punto, por kilo»; «Audaces en metros, convierto»: hay que guardar gramaje y ancho de cada tela). **Complementa:** ADR-0090 (el esquema de insumos se adoptó tal cual de un esquema huérfano de Dynamic y nunca se adaptó a la tela), ADR-0358 (una función, una pieza) y ADR-0284 (guía de foco).

## El problema

Hoy un insumo es **un color y una unidad** (`insumos.color_codigo`, `insumos.unidad_medida`): una tela en cinco colores son cinco altas de diez campos y otras cinco hojas para ingresar el lote (≈ 65–85 acciones, hasta 40 de ellas datos que se vuelven a teclear). El esquema no sabe qué es un kilo ni un rollo (no existe ancho, gramaje, composición, rollo ni unidad de compra), el color y el tejido se eligen en combos de nombres sin carta ni «agregar», y el código es un texto libre con un placeholder. Además hay tres huecos de datos que ya existen hoy: una tela se puede crear «en Kilos» y el cierre de la orden la ignora al calcular «lo medido» (solo suma `metro`); un líder puede cambiar la unidad de un insumo con historia; y un costo escrito con coma («2,5») se leía como 0 y abría el lote gratis.

## Decisiones (Felipe, 2026-10-28)

1. **DECIDÍ: una tabla nueva `materiales` (la tela: qué es y cómo se compra) y los insumos de hoy quedan como la línea de stock por color.** `insumos` conserva su `id`, sus lotes, su ledger y las ~40 funciones que lo nombran; `tipo`, `unidad_medida`, `tejido_id` y `merma_pct` siguen en `insumos` como copias que mantiene un disparador (nadie las escribe a mano). Catálogo ya modela producto → variantes: dos formas de resolver lo mismo en el mismo sistema es el defecto que se evita.
   **DESCARTÉ:** (a) N insumos sueltos con un grupo de texto: ancho y gramaje se copian por color (dos verdades); (b) solo maquillar la pantalla: no puede representar kilos ni evitar duplicados; (c) `tejidos` como padre: es núcleo de Catálogo.
   **SE ROMPE SI:** Felipe decide que ancho, gramaje y composición no se guardan (solo se miden al recibir): ahí la tabla sobra y gana «insumos sueltos en lote»; o si dos proveedores venden la misma tela con anchos distintos (por eso el factor se congela en el lote y el de la tela es solo el nominal).
2. **DECIDÍ: el libro de la tela va en metros; el kilo y el rollo son unidades de COMPRA que se convierten al recibir.** Cada lote guarda lo que se compró, el factor que se usó (medido al llegar si se puede; el de la ficha, `1000 ÷ (gramaje × ancho)`, si no) y los metros que entraron. Si el factor medido se aparta más de 5 % del de la ficha: aviso, no bloqueo.
   **DESCARTÉ:** llevar el punto en kilos en el libro (lo propuso el agente de dominio): obliga a rehacer el cierre de producción y ~12 funciones, y Audaces y el corte hablan en metros.
   **SE ROMPE SI:** el corte del punto se anota en kilos (no se pudo verificar).
3. **DECIDÍ: quien ve Producción en el Taller puede crear telas y colores; los ingresos con costo siguen siendo del líder.** Crear una tela no mueve dinero; ingresar un lote sí.
   **DESCARTÉ:** solo el líder como hoy: la carga seguiría dependiendo de una persona. **SE ROMPE SI:** alguien crea telas basura (hoy cualquiera ya crea colores y tejidos desde ADR-0534 y el único candado es el nombre único por `fn_clave_texto`).
4. **DECIDÍ: el primer paso es cerrar los candados de unidad (actividad 0) y elegir la cara de «Nueva tela» mirando maquetas.** **DESCARTÉ:** construir directo sin maqueta (en el ERP las pantallas se eligen mirando, ADR-0358).

## Lo construido (actividad 0)

- **Base** (`20261028172000_insumos_candados_de_unidad.sql`, sin tablas, sin políticas, sin tocar filas): CHECK `insumos_tela_en_metros`; disparador `insumos_unidad_firme` (ni `unidad_medida` ni `tipo` cambian si CUALQUIER tabla apunta al insumo con una llave foránea: la lista sale del catálogo de Postgres, así que `producto_avios` y las tablas que vengan quedan cubiertas solas); índice único `insumos_codigo_clave_unico` sobre `fn_clave_texto(codigo)` y CHECK `insumos_codigo_no_vacio`. La migración se **detiene y dice qué corregir** si ya hay una tela en otra unidad o códigos que se leen igual. Prueba: `pnpm pruebas:insumos-candados` (24 casos; con los tres candados rotos, 13 se ponen en rojo).
- **Web:** una tela solo ofrece «Metros» (`unidadesPermitidas`); la coma decimal se entiende en cantidad, mínimo y merma (`leerCantidad`) y el costo se lee con la regla única de plata (`numeroDeMonto`): lo que no se entiende ya no es 0, se dice y no deja guardar. Guía interactiva actualizada.
- **Maquetas** (`docs/maquetas/insumos-nueva-tela-2026-10/`): «Nueva tela» en dos caras (A una hoja; B paso a paso con ficha viva), «Llegó tela» (kilo, metro y rollo) y la lista por tela, en claro y oscuro.

## Plan (cada actividad, con su OK de Felipe)

| # | Corte | Estado |
|---|---|---|
| 0 | Candados de unidad e índices; coma decimal | **construida, sin pegar** |
| 1 | Base «tela con colores»: `materiales`, `insumos.material_id`, `crear_material` / `agregar_colores` / `editar_material`, códigos generados (`MIL-01`, `MIL-01-ARN`), migrar el insumo existente | pendiente |
| 2 | Hoja «Nueva tela» (carta de Catálogo, tejido al vuelo, parecidos) y lista por tela | pendiente (se elige A o B) |
| 3 | «Agregar color» y «Editar tela» | pendiente |
| 4 | «Llegó tela» con kilo y rollo → metros (envoltorio de `recibir_insumo`; las otras dos puertas de lotes, facturas y órdenes de insumos, no cambian) | pendiente |
| 5 | Conexión con Nueva orden y enlaces «Regístralas ahí» | pendiente |
| 6 | Cierre: `/formidable` con una persona sin contexto, `/chaos`, `tema:auditar`, guías | pendiente |

## Lo que queda abierto

- **Elegir la cara de «Nueva tela»** (A o B) mirando las maquetas.
- **«Agregar material»** se leyó como «crear un tejido al vuelo»; falta que Felipe lo confirme.
- **Otra decisión, de dinero y fuera de este trabajo:** hoy una orden pasa al stock sin tela anotada (solo avisa, ADR-0510) y el costo promedio se envenena (en la prueba local, S/ 4,50 en vez de S/ 22,38). Bloquear, marcar «costo sin medir» o restaurar al revertir lo decide Felipe.
- **El costo del lote de 9 m cargado el 28-oct** pudo caer en el error de la coma (no se pudo leer: la consulta a producción se rechazó por permiso). Lo mira Felipe.
- **Tres puertas escriben lotes** (`recibir_insumo`, `recibir_comprobante_produccion`, `recibir_orden_insumo`): convertir órdenes y facturas a kilos (R4) pide unificarlas antes; esta decisión no lo hace.
- **Una sola regla para leer números:** hay ~10 `replace(",", ".")` sueltos en `lib/`; la regla única de plata es `monto-plata-reglas.ts`. No se tocó.

## Cómo se verificó

Migración aplicada en una base privada con las 913 migraciones del repo y una fila previa como la de producción, en una sola transacción (`psql -1`) y repegada; `pnpm pruebas:insumos-candados` 24/24 y, con los candados quitados, 13 casos en rojo; vitest (insumos, guías, unificar, sugerir, paridad del CI y guía de foco) 321 pruebas en verde; `tsc` limpio; maquetas probadas en el navegador (claro y oscuro, sin errores de consola).
