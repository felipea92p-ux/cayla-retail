## 2026-10-14 (Auditoría del ERP para el equipo de ingeniería, y el plazo de la cola de arranque sigue a la carga inicial)
Qué hice: una auditoría de los 41 módulos con 25 agentes (12 auditores por grupo de módulos y por eje transversal —precios entre módulos,
comunicación entre módulos, arquitectura de información, plataforma—, un escéptico por eje y una síntesis), leyendo `origin/main` en `d4533724e` y
producción en solo lectura: 233 hallazgos verificados, nota media 5,5/10, 9 patrones transversales, un menú propuesto por puesto de trabajo, 8 flujos
rediseñados, una hoja de ruta en 5 fases y 8 decisiones de Felipe. Publicada como artefacto privado para sus colegas; los 64 hallazgos de seguridad
se entregaron aparte y NO se versionan (repo público). Felipe eligió empezar por «la prenda sin registrar deja de entrar sin dato» (bloque 1, 7
actividades) con un candado en la anulación de comprobantes. A0, hecha y en producción: migración `20261014161000` (en producción con la versión
`20261014161821` que anotó el MCP): `fijar_cierre_carga_inicial` deja la misma fecha en `cola_arranque_plazo`, y las tres tiendas quedaron con el
plazo de su carga inicial (TRU 18-oct, AQP 21-oct, LIM 31-oct; antes, 15-oct en las tres). ADR-0334, actualización del día.
Por qué así: la auditoría dio por hecho que la cola «se cerraba sola» el 15; leyendo la función, lo que vencía era el BOTÓN de cerrar en bloque (la
salida de emergencia para una prenda aún no cargada), mientras AQP y LIM siguen cargando hasta el 21 y el 31. La migración original ya preveía
unir las dos fechas. Reemplazo anclado, no `create or replace` desde el archivo: la función vive en producción (md5 idéntico al repo ese día), y así
no se pisa un parche vivo. Quitar la fecha (solo Admin) no toca el plazo: una cola sin tope sería una salida que nunca vence.
Felipe se lleva: el núcleo (stock = movimientos, venta = pagos = comprobante) está sano; lo que falla vive entre módulos y en el dato de origen
(69 % de las líneas vendidas sin prenda). Verificado: `pnpm pruebas:cierre-carga-inicial` 128/128 (casos 4d y 6c nuevos), `pnpm pruebas:cola-arranque`
53/53, la migración pegada dos veces en local sin cambiar nada la segunda, y en producción un `select` por sede devuelve la misma fecha en
`carga_inicial_hasta` y en `cola_arranque_plazo.hasta`. Siguen A1 (la baja de un comprobante anula la venta en el mismo acto) y A2–A6.
