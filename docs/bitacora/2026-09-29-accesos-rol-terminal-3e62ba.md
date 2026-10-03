## 2026-09-29 (Inicio: los accesos salen de lo que hace el rol, y «Nuevo producto» entra para quien carga mercadería)
Qué hice: la fila «Accesos» del Inicio ya no se elige por el tipo de sede sino por lo que hace la cuenta, leído de sus módulos:
el mostrador (ve Vender) recibe Apartados, Stock, Cambios y «Nuevo producto»; quien no vende y está en una tienda (la terminal de
almacén, un rol administrativo) recibe Recibir, Traslados, Stock y «Nuevo producto»; la líder, el almacén y el taller no cambian.
Por qué así: un rol nuevo entra solo a la lista que le toca sin que nadie la escriba (ADR-0161: el rol lo decide por módulos), y
«Nuevo producto» exige ver Productos **y** poder escribir en el catálogo: un rol limitado lo vería y la base rechazaría el guardado.
Con 4 lugares, meter uno saca a otro: a quien puede cargar catálogo se le va Caja de esa fila (sigue en el menú y en «Tu día»).
Felipe se lleva: la terminal del mostrador nunca ve el Inicio (aterriza en `/vender`, donde «Más» ya ofrece Caja, Cambios,
Devoluciones e Historial según su rol), así que su «lista» ya existe allí. En producción `Integrante` ya puede escribir en Productos
(consulta de solo lectura, 2026-09-29): sus 17 personas lo verán al publicar. Pendiente: elegir los accesos por rol (backlog).

## 2026-09-29 (Maqueta de los bloques nuevos del Inicio por rol)
Qué hice: `docs/maquetas/inicio-bloques-por-rol-2026-09/` con el Inicio de cuatro roles (líder, colaborador, terminal de almacén,
taller), en computadora y celular, con lo nuevo marcado, de dónde saldría cada dato y los estados «sin ventas» y «falla».
Por qué así: Felipe dijo que el Inicio se siente pobre; antes de construir, ver y decidir. Los gráficos solo donde hay una
comparación (hoy contra el mismo día de la semana pasada) y cada bloque falla por separado.
Felipe se lleva: 5 preguntas abiertas en el README y una recomendación de orden: primero «Hoy en la trastienda» (esa terminal no
ve hoy ni una cifra); «Las 3 tiendas hoy» y «Tu semana» esperan a coordinarse con Rendimiento.

## 2026-09-29 (Decisiones de Felipe sobre la maqueta: accesos de la líder, botón fijo y meta individual)
Qué hice: la líder tiene «Nuevo producto» en lugar de «Apartados» entre sus accesos; la terminal de almacén (y todo rol que no vende en
una tienda) lleva el botón fijo «Recibir mercadería» en el celular; la maqueta muestra una meta individual simple en «Tu día».
Por qué así: lo pidió Felipe tras ver la maqueta. La meta individual todavía no se construye: no existe en la base y reabre D-64, D-125
y D-68 (las colaboradoras no ven ni sus cifras), y «Tus ventas» hoy muestra el total de la tienda porque `fn_ventas_del_dia` filtra por
tienda y no por quien atendió (verificado en producción).
Felipe se lleva: no hay ningún chat que haya trabajado una meta individual; lo escrito es «todavía no» (D-125). Lo más urgente que salió
de esto es corregir «Tus ventas» antes de mostrar cualquier cifra por persona.

## 2026-09-29 (Spike de Rendimiento con meta por persona: las 8 decisiones de Felipe, dibujadas)
Qué hice: `docs/maquetas/rendimiento-meta-2026-09/`, un spike interactivo de Rendimiento con meta por persona (líder de sede, Admin e
Inicio de la integrante), con datos de prueba y sin datos (como producción hoy: sin meta y con una sola venta).
Por qué así: la meta sale de la de la sede por horas programadas, se fija mensual, la cambian la líder de sede y el Admin con motivo, y
la integrante ve solo lo suyo. Verlo antes de construir cuesta una tarde; corregirlo después cuesta migraciones.
Felipe se lleva: antes de construir hay que corregir «Tus ventas» (hoy muestra toda la tienda), cargar la meta de la sede y reabrir
por escrito D-64, D-125 y D-68. En el README del spike está la lista y lo que queda por confirmar.

## 2026-09-29 (Spike de Rendimiento: el gráfico deja de crecer con la pantalla y suma Semana | Mes)
Qué hice: el gráfico del spike mide su caja y tiene altura fija (antes escalaba con el ancho y en pantalla grande quedaba enorme);
ahora tiene pestañas Semana | Mes, y el mes se ve acumulado contra la meta o por día.
Por qué así: un gráfico decide cuántas barras ver, no cuántos píxeles ocupar; el acumulado responde «¿llego a la meta?» mejor que 30 barras.
Felipe se lleva: en el Inicio de la integrante el gráfico sigue siendo solo de 7 días; el mes por día de una persona necesita una lectura
por persona que hoy no existe.

Actualización: el spike ya no vuelve arriba al cambiar de semana o de mes; conserva la posición y el foco (cada clic redibujaba la pantalla entera y la reiniciaba).

Actualización: la integrante también ve su semana y su mes (Semana | Mes, acumulado o por día), con la misma estructura del gráfico de la líder pero solo con lo suyo; el mes por día de una persona necesita la lectura por persona que hoy no existe.

## 2026-09-29 (Paso 1 de la meta por persona: «Tus ventas» del Inicio es lo que ella atendió)
Qué hice: función nueva `fn_mis_ventas_del_dia` (solo lo que atendió quien mira, sin ventas de prueba ni anuladas) y el Inicio de una integrante la usa; la líder
sigue viendo el día de toda la sede. Prueba `pnpm pruebas:mis-ventas` de 7 casos, ya en el CI. Migración `20260930040100`, sin pegar en producción.
Por qué así: `fn_ventas_del_dia` le devolvía a cada integrante todas las ventas de su tienda y el Inicio las llamaba «Tus ventas»; una meta individual sobre ese número
habría sido falsa. Se agregó una función en vez de cambiar la de siempre porque Caja, Vender y Comprobantes necesitan el día de la tienda.
Felipe se lleva: la meta que ve la integrante queda **encendida por defecto** (decisión suya; se descartó el módulo «Mi meta»). Antes de pegar en producción hay que
decirle a las integrantes que su cifra bajará al total de lo suyo, y la migración va antes que la web.

## 2026-09-29 (Paso 0 de la meta por persona: ADR-0318 y el acta D-142 a D-160)
Qué hice: escribí el ADR-0318 y el acta con las decisiones de Felipe sobre la meta por persona, y anoté la actualización en D-64, D-68, D-113, D-125, ADR-0219 y ADR-0225.
Por qué así: la decisión estructural no puede vivir solo en el chat (principio 8); quedaron separadas las que Felipe decidió, las que Claude propuso y las que siguen abiertas.
Felipe se lleva: hay 7 puntos abiertos en el acta; los que más pesan son el permiso para cambiar metas, qué hacer sin horario vigente y el rol de las encargadas (hoy son «Líder de equipo»).

## 2026-09-29 (Paso 2 de la meta por persona: las metas en la base)
Qué hice: escribí y probé en local la migración `20260930050200`: una tabla de ajustes que solo se agrega, el reparto de la meta de la sede por horas programadas (las partes suman exacto), las
lecturas para la líder de sede y para la integrante, y `fijar_meta_persona`. Registré las cuatro decisiones de Felipe (D-157 a D-160): se reutiliza el módulo Rendimiento, partes iguales sin horario,
«ritmo esperado» se queda y no se toca ningún rol.
Por qué así: el reparto vive en una sola función de la base para que la líder y la integrante no vean metas distintas de la misma persona, y la integrante solo recibe su parte sin ver las horas de las demás.
Felipe se lleva: sin pegar en producción; antes hay que corregir en el paso 3 que `fn_rendimiento_equipo` no marca «Encargada» a las Líder de TRU; y la carrera real de dos conexiones no se probó (exige una base desechable).

## 2026-09-29 (Paso 3 de la meta por persona: el panel de Rendimiento)
Qué hice: Rendimiento ahora abre con el panel de la tienda: cuatro cifras contra la meta, una fila por persona con lo que lleva contra su parte (y el ritmo del turno), las ventas contra la meta en barras o
acumuladas, el historial de cambios y, al final, los rankings de siempre. La líder de la sede o el Admin cambian la meta del mes de una persona con motivo. Hoy · Semana · Mes salen de una sola lectura, así que
cambiar de una a otra no recarga ni mueve la pantalla; el Admin ve «Todas» como una tarjeta por tienda.
Por qué así: la meta solo sirve si se ve al lado de lo vendido y si quien la ajusta deja dicho por qué (queda en un historial que no se borra). La insignia «Encargada» se corrigió en la web y no en la función de producción,
para no tocar en producción una función que ya funciona.
Felipe se lleva: probado de punta a punta en el navegador local (guardar, volver a la automática, el error de pasarse del tope); sin datos reales de TRU todavía, porque la meta de la tienda no está cargada.

## 2026-09-29 (Paso 4 de la meta por persona: el Inicio de la integrante)
Qué hice: una integrante con meta ve «Tu meta de hoy», «Tu mes» y «Tus ventas contra tu meta» (semana y mes) con solo lo suyo; sin meta el Inicio queda como estaba.
Por qué así: se lee con funciones de «solo lo mío» y la pantalla no tiene forma de pedir lo de otra persona; una meta sin horas o sin la meta de la tienda no se dibuja, en vez de mostrar un «0 %» que la desanime.
Felipe se lleva: antes de que las integrantes lo vean hay que cargar la meta de TRU y revisarla con las encargadas, y avisarles que «Tus ventas» baja al total de lo suyo.

## 2026-09-29 (Paso 5 de la meta por persona: producción; lo que se encontró)
Qué hice: consulté producción (solo lectura) y encontré que solo está la tabla del historial; las 11 funciones no existen. El paquete de pegado tenía un archivo «deshacer» al lado de los demás y se pegó junto con ellos.
Dejé un paquete nuevo (aplicar + verificar, sin archivo de deshacer), refresqué el diccionario de datos (foto del 2026-09-29) y traje `main` a la rama.
Por qué así: aplicar SQL a producción desde esta sesión fue bloqueado por el clasificador y se respeta: lo pega Felipe, y `main` no debe fusionarse antes porque Vercel publica al fusionar.
Felipe se lleva: falta pegar `20260930040100` y la parte 2 en adelante de `20260930050200` (instrucciones en el backlog), y pegar la verificación (debe decir 0).


## 2026-10-03 (propuesta final de Rendimiento e Inicio, etapa 1)
Qué hice: con Felipe elegimos en un spike (`docs/maquetas/rendimiento-vistas-2026-10/`) las pestañas por tienda para Rendimiento y el anillo del día con «Lo que va bien» para el Inicio de la
integrante; construí la etapa 1 sin SQL nuevo: tarjetas comparativas que son pestañas (abre en la tienda de la sesión), proyección del mes, anillo, logros que callan si no tienen base, «Tu mes» en días de su
promedio, y «Nuevo producto» en lugar de «Apartados» en los accesos. También resolví los choques con `main` (versiones de migración, Aviario, ci.yml) y renumeré el ADR a 0318.
Por qué así: el spike costó menos que construir una pantalla que la integrante no entiende de pie; la etapa 2 espera porque pide una lectura nueva y el SQL pendiente ya es largo.
Qué se rompería sin esto: seguir con «Todas» apilado (la tienda de la sesión quedaba abajo) y un Inicio que mostraba un gráfico que nadie pidió.

## 2026-10-03 (auditoría de Rendimiento y opción C del ranking)
Qué hice: audité `/rendimiento` en local (volumen, permisos, reglas con entradas límite). Corregí el historial de metas que salía vacío (mío), hice instantáneo el cambio de tienda y, con la decisión de Felipe (opción C), cambié el
ranking «Vende más por hora»: el centro de la contracción es ahora el promedio de la tienda y el orden sale de una cota prudente (el número menos dos errores estándar), no del número mostrado.
Por qué así: con el centro en «el resto», dos personas con las mismas horas y menos de 40 ventas salían en orden contrario al crudo y la veterana salía «corregida» muy por encima de lo que vende; cambiar solo el centro dejaba a la nueva con una venta grande primera.
Qué se rompería sin esto: un reconocimiento injusto justo en «muestra chica» (AQP, TRU), que es donde hoy están todos los datos reales.
