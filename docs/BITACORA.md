# BITÁCORA — CAYLA Retail

> 3 líneas por cierre de sesión/paso: fecha, qué se cerró, qué aprendió Felipe.
> Se acumula, no se reescribe — es historia, no un resumen que se actualiza.

## 2026-07-16
Fase 1 (inventario multi-sede) verificada en vivo. Felipe pausó el plan de retomar la
Fase 2 financiera y pidió en su lugar "Inventario Inteligente" (rotación, alertas,
reorder point) inspirado en cómo lo resuelven Zara/Walmart/marcas premium, escalado a
3 tiendas + 1 taller — no a esa escala real.

## 2026-07-17 (mañana)
Inventario Inteligente construido y verificado (build/lint limpios). En revisión
autónoma se encontraron y corrigieron 2 bugs reales (sugerencia de traslado limitada
a una sola sede, clasificación ABC mal calculada en el límite) y se documentó un gap
de RLS sin corregir a la espera de confirmación.

## 2026-07-17 (tarde)
Se adoptó el "Protocolo Pedagógico": Claude decide lo técnico, pregunta lo que tiene
consecuencia de negocio, y enseña siempre. Se commiteó todo lo de la mañana (3
commits). Se aplicó el fix de RLS confirmado por Felipe. Al dar de alta la cuenta de
Felipe se descubrieron 4 filas duplicadas en `personas` para el mismo `auth_user_id`
— el login fallaba con el mismo error que "cuenta no vinculada" porque
`requirePersonaActual()` usa `.single()`, que exige exactamente una fila. Felipe
aprendió a diagnosticar esto con una consulta antes de borrar nada, y por qué el motor
bloqueó el primer intento de borrado (una de las filas ya tenía movimientos reales
asociados). Se agregó `unique(auth_user_id)` para que esta clase de error sea
imposible de repetir.

## 2026-07-17 (noche)
Se subió cayla-retail a GitHub por primera vez — no tenía remoto configurado, ni
siquiera la Fase 1 tenía respaldo fuera de la Mac de Felipe. El primer intento con
token embebido en la URL falló dos veces por errores de transcripción manual en
Terminal (token duplicado); funcionó al tercer intento con el token correcto. Se
conectó Vercel al repo de GitHub para que cada push despliegue solo, reemplazando el
flujo anterior de deploy manual por CLI. Primer intento de conexión no disparó build
del código ya existente (solo dispara con push nuevos); un segundo push (el commit de
docs) lo activó. Felipe confirmó en pantalla, logueado en `cayla-retail.vercel.app`,
que Inventario Inteligente está completo en producción: 4 KPIs, panel de alertas,
filtros y badges. Fase 2 (Inventario Inteligente) queda cerrada de punta a punta:
construida, verificada local y en producción, con respaldo en GitHub.

## 2026-07-17 (madrugada)
Retomada la Fase 2 financiera. Investigué manejo de caja retail y contabilidad antes
de diseñar (conteo ciego, mermas como COGS, categorías de gasto estructuradas — no
solo inventado). Construidos Diario de Caja, Gastos y Estado de Resultados sobre
tablas nuevas (`cajas`, `ventas`, `gastos`). Felipe probó en vivo y dio feedback real
que corregí en el momento: el formulario de gasto pedía subtotal cuando lo natural es
partir del total del comprobante (se invirtió el cálculo), y la diferencia de caja se
mostraba en rojo sin importar el signo (se corrigió a verde/rojo según sobra o falta).
También encontré una inconsistencia real revisando el módulo: el modal de
movimiento genérico todavía ofrecía "Venta" como motivo, lo que crearía una venta
"fantasma" sin fila en `ventas` ni caja asociada — se retiró de ahí, el botón "Vender"
es ahora la única forma correcta de registrar una venta.

## 2026-07-17 (noche 2 — Fase 3: almacén)
Felipe pidió expresamente 21-33 preguntas antes de diseñar el ingreso de mercadería
("para diseñar algo formidable") — se hicieron 24, en dos tandas (4 fundacionales con
opciones, 20 más en texto libre). Hallazgo clave que cambió el plan sobre la marcha:
Integrante necesita poder crear un SKU nuevo al recibir un fardo (con costo/precio),
lo que choca con la regla de Fase 1 de que solo Líder crea catálogo — Felipe decidió
"hay que confiar en el equipo"; se resolvió sin relajar la regla general, dejando que
`recibir_lote` cree catálogo con permisos elevados solo para sus propias inserciones
internas (security definer), no abriendo la tabla `productos`/`variantes` a Integrante
en general. Construido: almacén hermano por tienda, contenedores, lotes, bajada y
devolución reutilizando `traslado`. Verificado en producción.

Fricción real de la sesión, no de la app: subir a GitHub y mantener el push
funcionando tomó muchísimo más tiempo que el código — tokens que caducan cada vez que
se revocan, ventanas nuevas de Terminal que no heredan la carpeta de trabajo, y un
archivo `Index.html` suelto que apareció en GitHub y causó un historial divergente
que hubo que reconciliar con merge. Nada de esto es un problema del código de CAYLA;
es la curva de aprendizaje normal de git/GitHub para alguien que no lo usa a diario.

Felipe probó "Recibir mercadería" en vivo y dio feedback real: los campos de talla/
color/categoría quedan escondidos hasta buscar y crear un producto nuevo, no es obvio
a primera vista. Pidió retomar el rediseño de ese formulario en una sesión aparte —
queda anotado en el backlog, no se improvisó un cambio de UX apurado al cierre.
