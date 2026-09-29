## 2026-09-29 (Auditoría de Ventas, Inventario y Catálogo, con la mira puesta en abrir TRU en el ERP)

Qué hice: dos auditorías en paralelo, con verificación adversarial (un agente intenta refutar cada hallazgo antes de
que entre al plan). La primera (8 frentes) mide qué bloquea abrir mañana; la segunda (7 frentes + un crítico de
completitud) mide qué está mal construido entre los tres módulos, aunque no bloquee mañana. Ninguna corrigió nada:
solo diagnostican. El detalle completo (35 + 15 hallazgos, cada uno con su solución, su implementación y su
DECIDÍ/DESCARTÉ/SE ROMPE SI) quedó fuera del repo, en los archivos que le mandé a Felipe — el segundo informe trae
una sección de seguridad que no se publica mientras el repo sea público (F-01, ver `docs/investigacion` y la
bitácora del 2026-09-26). Este archivo y el de `docs/backlog/` resumen lo accionable.

Hallazgo de mayor consecuencia: **Alegra (el sistema real de CAYLA hoy) tiene 2.510 productos activos, 826 vivos en
la bodega de TRU**, y producción de `retail` quedó con 2 productos tras la purga de anoche. Cargar eso a mano no
entra en una noche. Felipe decidió esta noche que la carga sea por **censo físico en piso + carga en lotes desde
ese conteo** (no desde el stock de Alegra, que tiene 25 % de sus filas en negativo o en cero, ni tipeando cada
prenda por el formulario de 4 pasos).

Hallazgo que la primera auditoría no vio y la segunda sí: las 13 variantes reales de producción tienen `sku` NULL,
y como `registrar_venta`/`separar_prendas` arman sus mensajes de rechazo concatenando ese campo, **cualquier rechazo
de venta hoy muestra el error crudo de Postgres en vez de una frase en español** — es una regresión (el BACKLOG ya
lo daba por resuelto), no un hueco nuevo.

También se confirmó, con evidencia y no refutado, que **193 de 661 funciones SQL de producción (29 %) tienen un
cuerpo que ya no coincide con ningún archivo del repo** (por migraciones que parchan el texto vivo de la función en
vez de recrearla, decisión de ADR-0160 D4). «La última migración es la fuente de verdad» es falso para esas 193.
Ya causó dos incidentes reales antes de esta noche (el nombre de la prenda volvió a `sku`; el PR #397 dejó Análisis
vacío). Toda corrección SQL que sigue a esta auditoría parte de leer el cuerpo vivo en producción
(`pg_get_functiondef`), nunca del archivo del repo.

Por qué así: con 12 sesiones abiertas tocando estos mismos módulos y 12 horas de reloj para salir a piso, ordenar
por consecuencia con evidencia (código, base descartable con carreras reales, y consultas de solo lectura contra
producción) evita que la primera corrección de esta noche se apoye en un supuesto falso — que es exactamente lo
que ya pasó dos veces con las funciones parchadas en vivo.

Felipe se lleva: 4 decisiones tomadas esta noche (D1 ERP por Lucode, D2 censo físico + carga en lotes, D11 apartados
sin adelanto, D12 la nota de crédito acredita lo pagado); 13 más (D3–D10, D13–D17) con recomendación explícita,
pendientes de su «dale» o de caer solas a la opción recomendada si no hay tiempo de decidir cada una. Los dos
informes completos, con los 9 archivos por tanda y el detalle de cada hallazgo, se los mandé como archivos (no
viven en el repo: son ~900 y ~580 líneas, y el segundo trae la sección de seguridad que no se publica todavía).
