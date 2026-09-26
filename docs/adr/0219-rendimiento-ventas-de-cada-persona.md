# ADR-0219 — Rendimiento: las ventas de cada persona, para la encargada y el Admin

**Fecha:** 2026-09-26
**Estado:** **Propuesta.** Las decisiones de negocio están tomadas (Felipe, 20 preguntas, 2026-09-26, después de hablarlo con
el gerente). El diseño técnico de abajo espera su aprobación. **Nada construido, nada en producción.**
**Decide:** Felipe, 2026-09-26.
**Afecta (cuando se construya):** una migración nueva (módulo `rendimiento`, `fn_rendimiento_ubicaciones`,
`fn_rendimiento_equipo`, `fn_rendimiento_persona`, tabla `venta_reasignaciones` y función `reasignar_asesora`),
`apps/web/lib/modulos.ts`, `apps/web/lib/menu.ts`, `apps/web/app/(app)/rendimiento/`, `apps/web/lib/rendimiento-reglas.ts`
(con su prueba). No toca `movimientos` ni `stock`.
**Acta de la ronda:** [`docs/datos/DECISIONES-2026-09-26-rendimiento.md`](../datos/DECISIONES-2026-09-26-rendimiento.md) (D-112 a D-128,
con las opciones que se ofrecieron y los datos consultados). **Referencia visual:**
[`docs/maquetas/rendimiento-spike-2026-09/`](../maquetas/rendimiento-spike-2026-09/).
**Relacionado:** D-62 a D-79 (`docs/datos/DECISIONES-2026-09-21-menu-comercial.md`), R-17 y R-41
(`docs/datos/15-COMO-OPERA-CAYLA.md`), ADR-0153 y ADR-0163 (quién atendió cada venta), ADR-0161 y ADR-0178 (roles por
módulo, escalón Admin), ADR-0207 (Actividad: el mismo alcance por tienda), ADR-0214 (una cifra con poca muestra no es una
cifra), ADR-0177 (quien registra una devolución no la aprueba).

## Contexto

Desde el 2026-09-22 cada venta guarda quién atendió a la clienta: `ventas.asesora_id`
(`supabase/migrations/20260922150000_venta_asesora_emisor_descuento_lider.sql:111`). El Punto de venta no deja cobrar sin
elegirla, y solo deja elegir a quien está presente según la asistencia de Dynamic (ADR-0161 A4,
`apps/web/lib/responsable-reglas.ts`). En producción, consultado en solo lectura el 2026-09-26: **7 ventas reales, todas de
TRU (desde el 24-sep), las 7 con asesora; AQP y Lima todavía no registran ventas en el ERP.**

Lo que falta es lo que va encima del dato, el punto 4 de R-41: «quién vende más y qué vende cada una». Ninguna función agrupa
hoy por `asesora_id`. La única que muestra cifras por persona, `fn_comercial_colaboradoras` (`/comercial`, sin entrada en el
menú y ausente de producción), agrupa por `usuario_id`. Ese campo guarda quién firmó la venta, no quién atendió a la clienta,
y en un apartado son personas distintas.

El sistema tampoco tiene «encargada de tienda». Las 7 personas que Dynamic marca como `supervisor_sede` (4 en TRU, 1 en AQP,
2 en el Taller) entran a retail como Integrantes comunes. Los 8 Líderes no tienen tienda asignada y ven todo, porque D-69
sigue sin construirse.

## Las 20 respuestas de Felipe (2026-09-26)

Resumen. El registro completo —pregunta, opciones ofrecidas, recomendación y respuesta— es el acta (D-112 a D-128).

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Para qué se usan las cifras? | Reconocer y acompañar. Nada más |
| 2 | ¿Hay comisión o bono por venta? | No, ni está en planes (confirma D-65) |
| 3 | ¿Qué ve una colaboradora de sus compañeras? | **Nada: por ahora las colaboradoras no ven el módulo.** «Hablando con el gerente, esto generaría más caos actualmente». Lo ven solo las encargadas y el Admin |
| 4–5 | Período | Mes calendario, con la muestra a la vista: el número de ventas al lado de cada persona y «muestra chica» con menos de 40 ventas (el umbral de D-66) |
| 6 | ¿Cómo sabe el sistema quién es la encargada? | Por un rol en Roles y accesos con el módulo encendido. Ve la tienda a la que está asignada |
| 7 | ¿Quién ve todas las tiendas? | **Solo los 5 Admin**, no los 3 Líderes que no son Admin |
| 8 | ¿La encargada entra al ranking de su tienda? | Sí, si vende, y aparece marcada |
| 9 | ¿Quién corrige una venta puesta a nombre de otra persona? | La encargada, con motivo; queda registrado y el dato original no se borra |
| 10 | ¿De quién es un apartado? | De quien lo apartó (como hoy) |
| 11 | ¿Venta atendida por dos? | Se la lleva una sola (como hoy) |
| 12 | ¿Ventas por WhatsApp y redes? | Cuentan igual, para quien atendió |
| 13 | ¿Con qué se ordena? | **Dos rankings:** soles por hora trabajada y número de ventas |
| 14 | ¿Qué más, fuera de la venta? | Cuadre de caja al cerrar, y bajada al piso a tiempo |
| 15 | Ficha de cada persona | Qué categorías y prendas vende, evolución mes a mes, sus ventas una por una, comparada con su tienda |
| 16 | «Todas las tiendas» (Admin) | Agrupado por tienda, nunca un ranking mezclado |
| 17 | ¿Metas por persona? | Todavía no: se muestra el avance de la tienda contra su meta y cuánto aportó cada persona |
| 18 | ¿Relación con el «rendimiento del mes» y los objetivos de Dynamic? | Ninguna por ahora |
| 19 | ¿Entra el Taller? | No por ahora: no se registra quién corta o cose cada prenda |
| 20 | Nombre en el menú | **«Rendimiento»**, al final del menú lateral |

**Lo que se aplica sin volver a preguntar:** D-63 (qué se mide), D-65 (sin dinero), D-76 (nunca se ordena por registrar
clientas) y D-78/D-79 (nunca se ordena por devoluciones ni por el motivo de un cambio).
**Lo que estas respuestas cambian:** D-68 y D-66 (lo que veía la colaboradora) y D-64 (metas por persona). Cada cambio queda
anotado como actualización en `DECISIONES-2026-09-21-menu-comercial.md`.

## Decisión (propuesta técnica)

### 1. Quién ve qué: una sola regla

`retail.fn_rendimiento_ubicaciones() returns uuid[]`: la única función que dice qué tiendas ve cada cuenta. La usan todas
las lecturas del módulo y también decide si la entrada aparece en el menú.
- **Admin** (`fn_es_admin()`): todas las tiendas.
- **Persona con el módulo `rendimiento`** (`fn_ve_modulo`): su tienda (`fn_ubicacion_actual_persona()`), si es una tienda.
- **Terminal, cuenta sin el módulo o sin tienda:** nada. Un Líder que no es Admin y no tiene tienda asignada (hoy los 3 de la
  Oficina TRU) no ve la entrada del menú, en vez de ver una pantalla vacía.

- **DECIDÍ:** el mismo patrón de Gastos y Actividad («con el módulo, su tienda»), cambiando «el líder ve todo» por «el Admin
  ve todo», que fue la respuesta 7.
- **DESCARTÉ:** leer `supervisor_sede` de Dynamic. Si DO cambia el rol de alguien allá, el acceso cambiaría aquí sin que
  nadie lo decida en retail; Felipe eligió el rol en Roles y accesos.
- **SE ROMPE SI:** una encargada lleva dos tiendas a la vez (por ejemplo, TRU y Lima). Con `ubicacion_asignada_id` solo ve
  una; hace falta el «más las que se le asignen» de D-69.

### 2. Qué es una venta y de quién es

- **Cuenta:** `ventas.estado = 'completada'`, `es_prueba = false`, fecha de Lima de `created_at` dentro del mes, de una
  tienda que la cuenta puede ver. Las anuladas no cuentan.
- **Es de:** `ventas.asesora_id`, con las correcciones ya aplicadas (punto 5). Un apartado es de quien lo apartó, porque
  `entregar_separacion` ya copia esa asesora a la venta. Una venta por WhatsApp es de quien atendió el chat.
- **Soles:** `sum(venta_items.subtotal)`, la misma suma que usa `fn_ventas_del_dia`, así Caja, Inicio y Rendimiento dan el
  mismo total de tienda. Incluye IGV, igual que las metas.
- **Límite conocido:** una venta hecha sin conexión se sube después y su `created_at` es la hora de subida. Si se sube al día
  siguiente del último día del mes, cuenta en el mes nuevo (D-49, raro).

### 3. Las cifras (definición exacta)

| Cifra | Cómo se calcula |
|---|---|
| Ventas | Número de ventas que cuentan |
| Soles | Suma de subtotales |
| Prendas | `sum(venta_items.cantidad)` |
| Ticket promedio / prendas por venta | Soles ÷ ventas, y prendas ÷ ventas |
| % a precio completo | Prendas sin descuento manual ÷ prendas. La campaña no cuenta como descuento suyo: ella no la elige |
| Descuento dado | Lo que se fue en descuentos manuales (`motivo_descuento` distinto de `campana`) ÷ lo que se habría cobrado a precio de lista |
| Horas trabajadas | `public.jornadas.horas_trabajadas` de esa persona en la sede Dynamic de esa tienda (`ubicaciones.sede_dynamic_id`), del mes |
| Soles por hora | Soles ÷ horas, solo si hay horas |
| Cuadre de caja | De las cajas que cerró (`cajas.cerrada_por`): cierres, cierres con diferencia, faltante y sobrante del mes |
| Bajada al piso | De `bajadas_piso.persona_id`: unidades bajadas y cuántas tarde, con la definición de «tarde» de ADR-0208 (una sola) |
| Muestra chica | Menos de 40 ventas en el período (D-66). La persona aparece con la marca, que explica que su puesto depende mucho de la suerte |

**Los dos rankings.** «Vende más por hora» ordena por soles por hora; quien no tiene horas registradas va al final, con la
marca «sin horas». «Cierra más ventas» ordena por número de ventas. Solo entran personas con al menos una venta. La encargada
entra si vendió y aparece marcada; «encargada» significa que su rol tiene el módulo encendido, así que no hace falta otro
dato. Las devoluciones no restan y no ordenan nada (D-78, D-79).

**Horas, medido el 2026-09-26:** 64 de las 70 jornadas de TRU de la última semana tienen horas (91 %). AQP tiene 15 jornadas
y Lima ninguna, porque su personal no está cargado en Dynamic (D-62). Donde no hay horas, solo funciona el ranking por número
de ventas.

- **DECIDÍ:** calcular todo al momento de abrir la pantalla, sin guardar resultados en una tabla aparte. Estimación: las tres
  tiendas llevan unos S/ 645 mil vendidos en 2026 (`00-MAPA.md`), del orden de 5–10 mil ventas al año. Un mes de una tienda son
  cientos de filas, y el índice `ventas_ubicacion_fecha_idx` ya las encuentra.
- **DESCARTÉ:** un cierre mensual que congele el ranking. Sin dinero de por medio no hace falta, y obligaría a decidir qué
  pasa con una corrección que llega después del cierre.
- **SE ROMPE SI:** algún día se paga un bono con estas cifras. Entonces el mes tiene que cerrarse, y el mes de pago de
  Dynamic va del 29 al 28, no del 1 al 30. También **si «número de ventas» empieza a importar**: partir una venta en dos
  tickets sube la cifra. La señal para detectarlo es que baje «prendas por venta»; la encargada la ve en la misma tabla.

### 4. La corrección de quién atendió

- `retail.venta_reasignaciones`: una fila por corrección, que no se edita ni se borra. Columnas: venta, asesora anterior,
  asesora nueva, motivo de una lista cerrada («Se eligió a otra por error», «La atendió otra y cobró ella», «Otro» con
  texto), quién la hizo y cuándo. RLS encendido sin políticas: se lee solo por funciones `security definer`.
- `retail.reasignar_asesora(p_venta_id, p_asesora_id, p_motivo, p_detalle)`, en una sola transacción:
  1. Firma con `fn_actor_persona_id(true)`: la pantalla usa el combo «Responsable».
  2. Toma la venta `for update` y exige que la tienda esté en `fn_rendimiento_ubicaciones()`.
  3. Anota la corrección y actualiza `ventas.asesora_id`.
  4. Deja constancia en `retail.actividad`.

- **DECIDÍ:** actualizar la venta y guardar el historial de correcciones, como `stock` y `movimientos`: la venta dice quién
  figura hoy y el historial dice quién figuraba antes y quién lo cambió. Así el Historial, la Caja y el ticket reimpreso
  muestran a la misma persona sin tocarlos.
- **DESCARTÉ:** no tocar la venta y calcular «la asesora vigente» en cada lector. Cada pantalla que no supiera la regla
  mostraría a otra persona para la misma venta.
- **SE ROMPE SI:** alguien cambia `ventas.asesora_id` sin pasar por la función, porque el historial no se entera. Lo impide
  el REVOKE de escritura directa sobre `ventas` (`20260923234700`). El ticket que ya se imprimió sigue diciendo el nombre
  anterior.

### 5. Menú y catálogo

- **Módulo:** `insert into retail.modulos (...) values ('rendimiento', 'Gestión', 'Rendimiento', '<qué incluye>', 310, false,
  true)` en su propia migración, sin `rol_modulos`. Nace solo para el líder (ADR-0161), y Felipe se lo da al rol de las
  encargadas.
- **En la web:** se agrega en `CLAVES_MODULO`, `MODULOS` y `MODULOS_SOLO_PERSONAS`, porque una terminal compartida no ve cifras
  de personas (igual que Actividad); en la base, también en `c_solo_personas`.
- **Menú:** un nodo después de Finanzas, el último del menú lateral, con el pájaro Águila (Inteligencia y reportes, hoy sin
  tablas). `venta_reasignaciones` es del Colibrí (Ventas y caja).

### 6. La pantalla

- **Cabecera** con `<CabeceraPantalla>`: sobretítulo «Equipo», título «Rendimiento» y la bajada «Las ventas de cada persona
  de {tienda} en {mes}». Tiene un selector de mes y, solo para el Admin, uno de tienda: Todas, TRU, AQP o Lima. Con «Todas»
  se ve un bloque por tienda.
- **Cifras** con `TarjetaCifra`: ventas del mes, avance contra la meta del mes (`fn_meta_mes`), cuántas personas vendieron y
  ticket promedio de la tienda.
- **Los dos rankings, lado a lado**, con el número de ventas y las marcas: muestra chica, encargada, sin horas.
- **Una tabla con todas las cifras** en una sola tarjeta. Se puede ordenar por cualquiera: es el «filtrar por campo de
  desempeño» que pidió Felipe.
- **Ficha de cada persona** en `/rendimiento/[persona]`:
  - qué categorías y prendas vende;
  - su evolución en los últimos 6 meses;
  - sus ventas una por una, con «Corregir quién atendió»;
  - cada cifra al lado de la de su tienda, calculada como total de la tienda (por ejemplo, soles de la tienda ÷ horas de la
    tienda), no como promedio de promedios.
- **Nota en hueso:** cómo se lee la pantalla (muestra chica, de dónde salen las horas, por qué las devoluciones no restan).

## Objeción abierta, para Felipe

Las respuestas 8 y 9, juntas, permiten que **la encargada se pase ventas a sí misma**: entra al ranking y es quien corrige
de quién es cada venta. El sistema ya resolvió el mismo choque en devoluciones: quien la registra no puede aprobarla
(ADR-0177). **Propuesta:** la encargada corrige cualquier venta de su tienda, salvo darse una venta o quitarse una que es
suya; esas las corrige el Admin. **Si Felipe no responde, se construye con ese candado.** Quitarlo después es una línea;
ponerlo después de un mes de correcciones no borra lo que ya pasó.

**Sobre el nombre.** Dynamic ya tiene un «rendimiento del mes» por persona (`rendimiento_mensual`: un porcentaje que alguien
pone a mano, que hoy solo ven el Admin y DO). Para que los dos no se confundan, este módulo nunca resume a una persona en una
sola nota. Muestra cifras medidas, cada una con su nombre.

## Fuera de alcance, y por qué

- **Que la colaboradora vea sus cifras (D-68):** respuesta 3, por ahora.
- **Metas por persona (D-64):** respuesta 17.
- **Recompra y clientas nuevas (D-63, D-66):** la venta no guarda a la clienta, porque el Punto de venta nunca manda
  `p_cliente_id` (solo lo llena la entrega de un apartado).
- **Devoluciones como columna informativa:** posible en una versión 2. Nunca ordenan nada (D-78).
- **Margen por persona:** versión 2.
- **Taller:** respuesta 19.
- **Separar tienda y redes (R-42):** respuesta 12.

## Cómo se verifica (cuando se construya)

1. **Base:** prueba SQL en `scripts/pruebas/` para el alcance. El Admin ve todas las tiendas, la encargada solo la suya, una
   integrante nada, una terminal recibe un error y el Líder sin tienda nada. También se prueban las correcciones: el
   candado de la objeción, dos correcciones a la vez sobre la misma venta y el motivo obligatorio. Se corre `pnpm
   pruebas:roles`, que exige que un módulo nuevo lo vea solo el líder.
2. **Navegador:**
   - como Admin: «Todas», agrupado por tienda;
   - como encargada de TRU: solo TRU;
   - como integrante: sin la entrada en el menú;
   - al corregir una venta de prueba, los dos rankings cambian y la corrección aparece en el historial.
3. **Producción:** la migración se pega solo con el ok puntual de Felipe, en partes si toca políticas (regla de deadlocks de
   `CLAUDE.md`). Después, Felipe crea el rol «Encargada de tienda» en Roles y accesos y se lo da a quien corresponda.
