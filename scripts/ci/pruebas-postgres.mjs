#!/usr/bin/env node
/**
 * Las pruebas de RPC contra Postgres, repartidas en tandas que corren a la vez (ADR-0381).
 *
 * EL PROBLEMA. El job «Pruebas de RPC contra Postgres» corría ~180 `pnpm pruebas:*` EN SERIE sobre una sola base:
 * 8–11 min por corrida (81 s levantando Postgres y ~460 s de pruebas, medido el 2026-10-12), y crecía ~3 s por prueba.
 * El ruleset `main-protegida` exige la rama al día con `main`; con `main` moviéndose cada pocos minutos, un PR que
 * tardaba 10 min en ponerse verde ya estaba atrasado otra vez, y cada «Update branch» cancelaba la corrida en curso.
 *
 * QUÉ PROMETE. `PRUEBAS` es la lista de lo que corre el job, en el orden de siempre, y cada una cae en EXACTAMENTE una
 * tanda (`repartir`). Cada tanda es un job aparte con su PROPIA base (`supabase start` + todas las migraciones), así que
 * una tanda no ve lo que otra escribió. El reparto es determinista: misma lista y mismas duraciones → mismas tandas.
 * Equilibra por la duración medida (`pruebas-postgres-duraciones.json`); una prueba sin medición vale la mediana. Dentro
 * de una tanda, todas corren aunque una falle (el diagnóstico completo en una vuelta) y la tanda sale con 1 si alguna falló.
 *
 * QUÉ NO PROMETE. Que una prueba pueda depender de lo que dejó otra: no puede, porque ahora pueden caer en tandas
 * distintas. Hoy ninguna depende (todas hacen ROLLBACK o deshacen lo suyo; las que hacen COMMIT de verdad están fuera
 * del job, en EXCLUIDAS de `apps/web/lib/ci-paridad.test.ts`). Una prueba nueva tampoco puede.
 *
 * AGREGAR UNA PRUEBA. Su `pnpm pruebas:*` va aquí, con su comentario de una o dos líneas (qué candado vigila), donde
 * corresponda por tema. `ci-paridad.test.ts` falla si está en package.json y no aquí. No hace falta medirla.
 *
 * USO
 *   node scripts/ci/pruebas-postgres.mjs --tanda 2/4   → corre la tanda 2 de 4
 *   node scripts/ci/pruebas-postgres.mjs --listar      → muestra el reparto y cuánto dura cada tanda
 *   node scripts/ci/pruebas-postgres.mjs --medir <id>  → reescribe las duraciones desde una corrida del CI (`gh run list`)
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DURACIONES = join(RAIZ, "scripts", "ci", "pruebas-postgres-duraciones.json");
export const TANDAS = 4;

export const PRUEBAS = [
  // Todos corren siempre que Postgres haya levantado, aunque uno falle — mismo
  // criterio que tipos/lint/pruebas arriba: un push malo trae el diagnóstico completo
  // en una vuelta, no uno por uno.
  "caja:verificar",

  // Meta del día y fondo de caja unidos a las campañas (ADR-0195 F1): si dos campañas se cruzan gana la mayor, la
  // meta del mes es la suma de los días, solo el líder guarda y el cierre anota el fondo que regía. ROLLBACK.
  "pruebas:configuracion-caja",

  "pruebas:gastos",

  "pruebas:activos-y-fijos",

  // Activos «ya lo teníamos» (ADR-0335): lo anterior al sistema entra sin pago, sin mover plata, con su fecha real y su
  // depreciación; solo el líder; los estados imposibles los impide la base. ROLLBACK.
  "pruebas:activos-carga-inicial",

  // Cuentas y dinero (ADR-0195 F3): cada movimiento, que se anula y no se borra, los saldos sumados, un egreso respalda
  // una sola cosa, con el módulo solo su tienda y la conciliación. ROLLBACK.
  "pruebas:cuentas-dinero",

  // Editar y eliminar cuentas (ADR-0195 F3, 2026-09-25): sin uso se corrige todo y se borra de verdad; usada, el tipo
  // queda y se archiva; el saldo inicial no se toca conciliado ni con su mes cerrado; solo el líder. ROLLBACK.
  "pruebas:editar-cuentas",

  // La cuenta sellada (ADR-0195 F3b): cada cobro y pago guarda de qué cuenta salió o a cuál entró; del cajón, con su
  // salida de caja y restando del cierre; un egreso respalda una sola cosa; los saldos usan lo sellado. ROLLBACK.
  "pruebas:cuenta-sellada",

  // Registrar ingreso con su origen (ADR-0375): caja fuerte, líder y préstamo de otra sede bajan su cuenta en la misma
  // operación; el flujo y el balance los leen entre cuentas o como aporte; los motivos de sistema no se tipean. ROLLBACK.
  "pruebas:caja-ingresos",

  "pruebas:por-pagar-consolidado",

  // Flujo de caja (ADR-0195 F6): saldo inicial + entró − salió ± ajustes = saldo final, cada cosa en su categoría, lo
  // «sin cuenta» aparte; la proyección con metas y campañas, vencimientos, fijos y planilla, el mínimo de caja, los días
  // de caja; solo el líder y nada se guarda. ROLLBACK.
  "pruebas:flujo-caja",

  // Impuestos (ADR-0195 F8): débito y crédito del mes, las boletas no dan crédito, anulados fuera, el saldo a favor que
  // se arrastra, el límite del régimen, parámetros con vigencia, solo el líder y los registros para el contador. ROLLBACK.
  "pruebas:impuestos",

  // Estado de resultados (ADR-0195 F5): el diario cuadra, cada regla de posteo, unidades y consolidado, planilla de
  // Dynamic, permisos, campañas y un año de volumen. ROLLBACK.
  "pruebas:estado-resultados",

  // Presupuesto (ADR-0195, capa para decidir): guardar y leer con historial, una sola meta (la de las metas del día),
  // contra lo real del Estado de resultados, la proyección al cierre, proponer sin guardar y permisos. ROLLBACK.
  "pruebas:presupuesto",

  // Cierre de mes (ADR-0195 F9): el diario congelado con su huella, el candado por fecha en cada tabla (registrar,
  // cambiar y anular), hoy libre, consolidado, reabrir con motivo, chequeos y solo el líder. ROLLBACK.
  "pruebas:cierre-mes",

  // Balance (ADR-0195 F7): saldos de arranque que se corrigen y no se editan, el Balance cuadra con operaciones de cada
  // tipo, cada cuenta por dos caminos (si no, no se dibuja y dice por qué), lo que es de la tienda y permisos. ROLLBACK.
  "pruebas:balance",

  // Pérdidas (ADR-0328 act. 14): UNA definición —cada tipo y motivo clasificado, todo motivo que escribe la base decidido—,
  // la pestaña (razón, categoría, talla, «más faltan», lo que apareció aparte, traslados y anulaciones), el 659 del diario
  // igual al total de la pestaña sede por sede, permisos y la guarda de meses cerrados. ROLLBACK.
  "pruebas:perdidas",

  // Resumen de Finanzas (ADR-0195 F10): cada número es el de su fase (F2–F9 y Presupuesto) mirando CAYLA entera, una
  // tienda, el Taller y la empresa; cada aviso aparece cuando corresponde; el gasto fuera de lo normal; permisos. ROLLBACK.
  "pruebas:resumen-finanzas",

  // Finanzas cuenta desde una fecha (ADR-0332): sin corte nada cambia; con corte el diario y el Estado de resultados no
  // miran lo anterior, el Flujo deja de listar esa planilla y la PROYECCIÓN de caja la sigue contando; las reglas de
  // guardar_inicio_finanzas (día 1, no futuro, sin meses cerrados, permiso) y pegar la migración dos veces. ROLLBACK.
  "pruebas:finanzas-arranque",

  "pruebas:registrar-cambio",

  // No se cambia por una prenda sin precio (ADR-0385): un cambio por una prenda en S/ 0 (ni la bolsa de obsequio) se rechaza sin
  // escribir nada; con precio, o con precio de tienda sobre un base 0, sigue funcionando; la migración se puede pegar dos veces. ROLLBACK.
  "pruebas:cambio-sin-precio",

  // Actividad de cada módulo (ADR-0207): cada venta, anulación, caja y cambio deja su línea; la tabla es de solo
  // agregar; si anotar falla la venta se guarda igual; el alcance por sede (líder, líder de tienda, terminal). ROLLBACK.
  "pruebas:actividad",

  // «Tus ventas» del Inicio (fn_mis_ventas_del_dia): cada persona ve solo lo que atendió, ni el total de la tienda (tampoco
  // una líder), ni ventas de prueba, anuladas o de ayer; una terminal, 0 filas; `fn_ventas_del_dia` no cambia. ROLLBACK.
  "pruebas:mis-ventas",

  // Metas por persona (ADR-0325): el reparto de la meta de la sede suma exacto; un descanso, un turno y el «sin horarios» se comportan como
  // dicen; la líder de la sede y el Admin cambian la meta del mes con motivo y con historial que no se borra; cada estado imposible se rechaza;
  // `fn_mi_meta` da solo lo mío. Crea las tablas de horarios de Dynamic DENTRO de cada transacción. ROLLBACK.
  "pruebas:metas-persona",

  // Ventas por hora y prendas por venta de Rendimiento (fn_rendimiento_detalle): agrupa por día y hora de LIMA, no cuenta prueba, anuladas,
  // otra tienda ni otro día, cuadra con fn_rendimiento_serie, y quien no ve esa tienda recibe 42501. ROLLBACK.
  "pruebas:rendimiento-detalle",

  // Actividad de Existencias, Conteos y Traslados (ADR-0207, act. 2026-10-02): una línea por operación (no por
  // prenda), lo de un producto nuevo no sale en Existencias, y si anotar falla la operación se guarda igual. ROLLBACK.
  "pruebas:actividad-inventario",

  // Actividad de Productos (ADR-0207, act. 2026-10-02): alta con su stock, ediciones con antes → después en una línea
  // por guardado, cambios en bloque, el costo sin montos; si anotar falla, el guardado sigue. ROLLBACK.
  "pruebas:actividad-productos",

  // Revisar los productos pendientes (ADR-0371): la cola con quién, desde dónde, variantes, precio, stock y órdenes; aprobar y
  // rechazar (rechazar se niega con una orden en proceso o con stock); idempotencia; permisos; y la carrera de una orden en vuelo. ROLLBACK.
  "pruebas:revisar-productos",

  // El precio 0 solo vale en Empaque, también en la base (ADR-0384): Nuevo producto y Editar producto no dejan una variante activa
  // en S/ 0 fuera de una familia apagada; la regla, sus permisos y que la migración se pueda pegar dos veces. ROLLBACK.
  "pruebas:precio-cero",

  // Historial de la prenda (ADR-0354): etiquetas, variantes nuevas, fotos, tejido y patrón dejan su fila con quién y dónde;
  // guardar las mismas etiquetas no deja ninguna; lo que nace con la prenda no es un cambio; la lectura nunca da un uuid. ROLLBACK.
  "pruebas:historial-prenda",

  // Precio propio por sede (Felipe 2026-10-09): cambia solo en esa tienda, deja historial firmado, solo tu propia sede,
  // sin el módulo Productos nada, se archiva y nunca se borra ni se edita. ROLLBACK.
  "pruebas:precio-sede",

  // Actividad de Colaboradores, Roles, Configuración y Regularizar (ADR-0207, act. 2026-10-03): cada operación en la
  // sede correcta, las formas de producción dan frases legibles, sin el dinero de la empresa. ROLLBACK.
  "pruebas:actividad-gestion",

  "pruebas:aprobar-devolucion-caja",

  "pruebas:registrar-venta",

  // Descuento de campaña EXACTO, al céntimo (ADR-0302; reemplaza el .90 de ADR-0182): la base da lo mismo que la caja,
  // registrar_venta y separar_prendas aceptan el descuento exacto y rechazan el del .90, y la migración se puede pegar
  // dos veces. ROLLBACK.
  "pruebas:campana-redondeo",

  // Redondeo del EFECTIVO (ADR-0311): S/ 0.10 es la moneda más chica y la ley solo permite bajar (100.19 → cobra 100.10).
  // La base (fn_redondeo_efectivo) y la caja dan lo mismo en los 99 999 montos de 0.01 a 999.99. ROLLBACK.
  "pruebas:redondeo-efectivo",

  // «Quién vendió» (ADR-0163): la venta guarda a quien atendió (asesora_id) Y a la sesión, «Ventas de hoy»
  // la firma con quien atendió y queda una sola registrar_venta. Cada caso termina en ROLLBACK.
  "pruebas:vendedora-en-venta",

  // La lista de lo vendido hoy (Caja, Vender, Facturación): una fila por venta aunque tenga dos
  // comprobantes y sin las anuladas (20260921103000). Cada caso termina en ROLLBACK.
  "pruebas:ventas-del-dia",

  // Anular una venta libera su comprobante pendiente (20260921121500): no queda uno en la cola de
  // SUNAT con su botón «Transmitir» de una venta que ya se devolvió. Cada caso termina en ROLLBACK.
  "pruebas:anular-venta-comprobante",

  // Un comprobante no nace sobre una venta anulada (20260921161500): ni por `emitir_comprobante`, ni por
  // un insert directo, ni convirtiendo una proforma. Cada caso termina en ROLLBACK.
  "pruebas:comprobante-venta-anulada",

  // Una tienda con DOS series de nota de crédito, BC.. (boletas) y FC.. (facturas), y cada nota con la letra de su
  // original; nombres que SUNAT rechaza (NC01) no se registran; la nota sin su serie no gasta números (20260929170000).
  "pruebas:notas-credito-serie-por-letra",

  // Apartar stock (ADR-0141): una venta, un traslado o un ajuste no se llevan lo apartado; quién puede apartar y
  // liberar; RLS y privilegios; y el contador de cada fila siempre cuadra con la suma de sus apartados abiertos.
  // Cada caso termina en ROLLBACK.
  "pruebas:apartar-stock",

  // Bajada al piso (ADR-0208, paso 1): bajar_al_piso es todo o nada, pide el módulo «Bajada al piso» (Existencias no lo
  // da), firma el responsable, un reintento con la misma marca no baja dos veces y con otra lista no repite nada, y sus
  // filas del libro son las mismas que las de «Reponer». Cada caso termina en ROLLBACK (la de concurrencia commitea y
  // no corre aquí: solo contra un Postgres desechable).
  "pruebas:bajada-al-piso",

  // «Subir a almacén» (ADR-0300): `retirar_del_piso` sube varias tallas del piso al almacén en UNA transacción (el movimiento
  // contrario a `bajar_al_piso`). Todo o nada (una talla que no alcanza no deja subir ni la que sí), una marca por lista que
  // hace seguro reenviar tras un corte, mismo módulo y mismo Responsable que «Retirar del piso», y la misma fila del libro
  // que escribe `mover_entre_piso_y_almacen`. Cada caso termina en ROLLBACK.
  "pruebas:retirar-del-piso",

  // Capacidad del piso por sede (ADR-0329, actividad 6 de ADR-0328): la siembra (TRU 600 contada, AQP 1800 y LIM 180
  // provisionales, con los nombres de producción y los locales); `fn_capacidad_piso` para líder, colaboradora y terminal, 42501
  // para la cuenta de afuera; `fijar_capacidad_piso` solo del líder, con firma, historial y Actividad, «sin cambios» al
  // reintentar y PT409 si otra persona la cambió; los candados de la tabla (capacidad calculada, rangos, solo tiendas); «por
  // cuadrar» (cuadrado_en) y la carrera de tres sesiones: el segundo guardado de una sede espera al primero, otra sede no. ROLLBACK.
  "pruebas:capacidad-piso",

  // La vara de CAYLA como respaldo de Frescura (ADR-0208, act. 2026-10-07; 20261008120000): solo la llave de servicio guarda
  // (`guardar_frescura_vara_cayla`), reemplaza la foto entera y una corrida vacía no toca nada; el esquema niega ventana, cifras
  // y nivel inválidos; el líder lee (`fn_frescura_vara_cayla`), afuera recibe `frescura_sin_permiso`, la tabla directo no; y el
  // parche anclado de `fn_frescura_sede` deja pasar a `service_role` (el cron) y sigue cerrada sin claims, con md5 verificado. ROLLBACK.
  "pruebas:frescura-vara-cayla",

  // Plan del piso, grupos del mix (ADR-0329, actividad 12 de ADR-0328): los 8 grupos con su rol y de qué lado del riel están; las 42
  // categorías entran con la propuesta por prefijo, todas «por revisar»; `fn_grupos_mix` y `fn_categorias_grupo_mix` para quien ve el
  // módulo «Plan del piso» (el líder siempre; una colaboradora o una terminal solo si su rol lo recibe; sin él, 42501 `plan_piso_sin_modulo`; la cuenta de afuera, 42501); `fijar_grupos_de_categorias` solo del líder y TODO O NADA (con firma,
  // historial, «sin cambios» al reintentar y PT409 si otra persona cambió una, sin guardar ninguna del lote); los candados de la tabla
  // (un vestido no va a «accesorios», un cinturón no va entre los jeans, una categoría en dos grupos, un rol inventado) y el módulo
  // sin rol. Cada caso termina en ROLLBACK.
  "pruebas:plan-piso-grupos",

  // Plan del piso, foto del espacio (ADR-0329, actividad 12 de ADR-0328): `fn_registrar_espacio_piso` toma, de hoy, UNA fila por (tienda con
  // piso × categoría activa) —sin el Taller, una tienda apagada ni una sin piso—, con lo colgado EXACTAMENTE como lo muestra la pantalla
  // (`fn_piso_plan_lectura`) y lo cuenta `fn_existencias_base`; una categoría sin nada queda en 0; correrla dos veces el mismo día deja la
  // primera foto aunque el stock se mueva; «piso cuadrado» solo para la sede que cuadró; ni `authenticated` ni `anon` la ejecutan;
  // `fn_espacio_piso` es de quien ve el módulo «Plan del piso» Y opera esa sede (42501 sin el módulo, para otra sede, una cuenta de afuera o una sede nula); y los candados de la tabla. ROLLBACK.
  "pruebas:plan-piso-foto",

  // «Cuadrar el piso» (ADR-0328, decisión técnica 4): `cuadrar_piso` pasa al piso, de una vez y todo o nada, lo que el almacén
  // tiene libre y nadie escaneó como guardado (y sube lo escaneado que el sistema creía colgado). Solo un líder confirma; lo
  // apartado, la cuarentena, lo archivado y lo de prueba no se mueven; las «no cargadas» se guardan y no se aplican; la
  // previsualización y el cuadre usan la MISMA cuenta; un almacén movido después del escaneo lo rechaza; la misma marca no
  // cuadra dos veces; Frescura no lo lee como bajadas (núcleo) y lo bajado llega con edad desconocida. Cada caso en ROLLBACK.
  "pruebas:cuadrar-piso",

  // La caja registra la bajada que se olvidó (ADR-0321): `bajar_al_piso_desde_vender` pide VENDER (no Existencias: la
  // Terminal de ventas baja), baja solo lo que falta para el ticket (0 si otra persona ya la registró), lo apartado no
  // cuenta, sin almacén libre no mueve nada, firma el responsable, la misma marca no baja dos veces, y su fila del libro es
  // la de «Reponer» con la nota «Bajada registrada desde Vender». Cada caso termina en ROLLBACK.
  "pruebas:bajada-desde-vender",

  // «La tengo en la mano» (ADR-0328, actividad 9): `bajar_en_mano` corrige el almacén (+1 «Encontré prendas», con la nota
  // automática) y cuelga la prenda con la MISMA bajada de `bajar_al_piso`, todo o nada; corrige solo si el almacén no tiene
  // ninguna libre, no toca lo apartado ni lo que nunca entró a la tienda, topa 5 correcciones por prenda y día, firma el
  // responsable, la misma marca no escribe dos veces (tampoco desde otra tienda), el tope cuenta el día de Lima, Frescura la
  // ve como bajada real y «Eliminar con historia» no se frena. Cada caso termina en ROLLBACK (las carreras con COMMIT
  // —`pruebas:bajar-en-mano-concurrencia`, el candado de la prenda y el de la marca— solo corren con BASE_DESECHABLE=1, no aquí).
  "pruebas:bajar-en-mano",

  // Nuevo producto con su stock de hoy (ADR-0212): el producto y la carga inicial son todo o nada (sin tienda, otra tienda,
  // un Taller «al piso» o un rol sin «Bajada al piso» no dejan ni el producto), las cantidades entran como «carga_inicial»
  // al almacén (o al piso con UNA bajada), firma el responsable, el mismo token no carga dos veces, la carga es solo para
  // prendas sin movimientos en esa tienda, y la firma de la RPC sigue a la de crear_producto_con_variantes. Cada caso
  // termina en ROLLBACK.
  "pruebas:alta-con-stock-inicial",

  // Temporadas como atributo (ADR-0246): la lista cerrada de 9, el calendario de SENAMHI (lo que ya empezó no se mueve;
  // solo el líder corre una fecha futura), una temporada por prenda (color → producto → categoría), asignar todo o
  // nada con firma y rastro, el alta con p_temporada, el año por fecha de llegada y la guarda de la migración.
  // Cada caso termina en ROLLBACK.
  "pruebas:temporadas",

  // Bajadas tardías (ADR-0208, paso 1): fn_bajadas_del_piso reconstruye el piso antes de cada bajada y cuenta las
  // ventas de los minutos siguientes; anuladas, entregas de apartado y la «Prenda sin registrar» no cuentan, y si el
  // stock no cuadra con el libro la fila sale «dudosa». Desde el paso 2 de Frescura 3c: el cálculo vive en un núcleo
  // interno, los retiros del piso se descuentan («corregida»), la carga inicial se marca y las dos guardas md5
  // abortan ante un parche en vivo. Cada caso termina en ROLLBACK.
  "pruebas:frescura-bajadas",

  // La lectura de Frescura del piso (paso 3 de Frescura 3c, ADR-0208, ADR-0246, ADR-0248): fn_frescura_sede (qué
  // prendas entran, las marcas de venta, interno y edad desconocida de cada evento del piso, la temporada con el fin de
  // la estación de su última llegada, tardías y dudosas), fn_confianza_registro (por tienda y mes de Lima, sin la carga
  // inicial ni lo corregido, solo bajadas de hace 20 minutos o más) y fn_es_llegada, comparada con el predicado vivo de
  // fn_resumen_comparacion. Candado de líder, una llamada al libro y al núcleo, y la guarda md5. Cada caso en ROLLBACK.
  "pruebas:frescura-lectura",

  // La libreta de «Ya decidí» de Frescura del piso (paso 4b, ADR-0208): frescura_decisiones rechaza en la BASE cada estado
  // imposible (dos decisiones actuales, anular lo que no es una decisión, editar o borrar) y cada candado tiene su
  // mutante; anotar y anular firman, se protegen del reintento y de la carrera; la lectura por sede; y eliminar un
  // producto con historia conoce la libreta. Cada caso termina en ROLLBACK salvo las carreras, que limpian lo suyo.
  "pruebas:frescura-decisiones",

  // «Reposición» no toca el piso (ADR-0208, paso 1): un ajuste «Reposición» en el piso se rechaza, suba o baje, con
  // cualquier escritura del motivo; el almacén, «Conteo físico», el Taller y «Reponer» siguen igual; quien no puede
  // ajustar sigue viendo el mensaje de permiso; y la migración se pega dos veces sin borrar los parches en vivo de
  // registrar_movimiento. Cada caso termina en ROLLBACK.
  "pruebas:reposicion-piso-cerrada",

  // Marca de mover_interno (ADR-0208): «Reponer» y «Retirar del piso» mandan una marca por intento; el reintento con
  // los mismos datos devuelve el mismo movimiento sin mover nada, con otros datos se rechaza, la marca se mira antes
  // de pedir responsable, la tabla de marcas no se edita ni se borra, la migración aborta si el cuerpo vivo cambió y
  // bajar_al_piso (sin marca) sigue igual. Cada caso termina en ROLLBACK.
  "pruebas:mover-interno-marca",

  // Separaciones (ADR-0166): separar con adelanto en custodia, entregar cobrando el saldo con el precio
  // congelado, vencer con 2 días de gracia, devolver el 100% y que el arqueo de caja cuadre al céntimo.
  "pruebas:separaciones",

  // Conteo vacío (ADR-0174): cerrar_conteo rechaza un conteo sin prendas (hint conteo_vacio) y lo deja abierto para
  // contar o cancelar; con prendas cierra como siempre; la migración se puede pegar dos veces. Cada caso: ROLLBACK.
  "pruebas:conteo-vacio",

  // Rediseño de Conteo (20260930010000/010100): la foto al abrir (solo stock > 0, la sububicación y la categoría del
  // conteo), vacío ≠ 0, verificar / recontar / confirmar, cierre con pendientes solo si es parcial y nunca con
  // diferencias sin confirmar, y el «debe haber» leído al verificar (venta antes o después de contar: sin falso
  // faltante, el ajuste va sobre el stock actual). Incluye un control que demuestra que la prueba muerde. Cada caso: ROLLBACK.
  "pruebas:conteo-rediseno",

  // Conteo I (ADR-0328, 20261004230000/230100): desde una terminal, el cierre de un conteo y la recepción de un traslado
  // heredan la firma de la operación si es del mismo día (otro día, o sin nadie, piden el nombre una vez); el primer conteo
  // completo de cada lugar es «de arranque» (motivo conteo_arranque: no es merma) y uno parcial, de categoría o de prueba no
  // lo consume; «Aplicar todos completos» marca «aplicada sin contar» y el historial lo suma aparte. Con controles que muerden
  // por mutación. Cada caso: ROLLBACK.
  "pruebas:conteo-firma-arranque",

  // Candado solo-RPC (ADR-0119): authenticated y anon no escriben directo en ventas, venta_items,
  // venta_anulacion_items, clientas, conteos ni lotes; las RPC siguen escribiendo. Cada caso: ROLLBACK.
  "pruebas:candado-ventas",

  // Anular solo el mismo día (PL-29): anular_venta rechaza una venta de un día anterior en hora de Lima
  // (incluida la de ayer 23:59, que ya es «hoy» en UTC) y acepta la de hoy. Cada caso: ROLLBACK.
  "pruebas:anular-venta-mismo-dia",

  // Anular desde la misma tienda: anular_venta deja anular a alguien de la tienda de la venta o a un líder, igual
  // que corregir_pagos_venta. Con control (sin el candado, sí anulaba). Cada caso: ROLLBACK.
  "pruebas:anular-venta-misma-sede",

  // El token sigue al contenido (/chaos 2026-10-13): en las diez funciones de Ventas y Caja con p_token, el mismo token
  // con otro contenido se rechaza (token_reusado), el resolver dice «hecho» o «no llegó» (definitivo) y espera al envío
  // que todavía guarda. Con controles. Cada caso: ROLLBACK (la concurrencia, dos sesiones que terminan en ROLLBACK).
  "pruebas:token-sigue-al-contenido",
  // ADR-0401 (/chaos de Inventario 2026-10-14): el token sigue al contenido en ocho funciones de Inventario, el resolver revisa
  // un traslado, y los topes de notas, llegada y motivo de ajuste.
  "pruebas:inventario-token-y-textos",
  // ADR-0404: lo contado de más al recibir un traslado queda como sobrante a revisar, fuera del stock.
  "pruebas:traslado-sobrantes",
  // ADR-0405 (/chaos de Catálogo 2026-10-14): precio y costo NaN y nombres sin tope rebotan en la tabla. Con control.
  "pruebas:catalogo-montos-y-textos",
  // ADR-0409 (/chaos de Producción 2026-10-14): el token sigue al contenido en seis funciones del Taller, el IGV de una factura
  // de insumos va de 0 a 18 %, y un NaN en sus montos rebota en la tabla. Con controles.
  "pruebas:produccion-token-y-montos",

  // El efectivo de una caja abierta nunca queda bajo cero (/chaos 2026-10-13): egreso, reembolso, vuelto de un cambio, anular
  // y corregir el pago; el borde exacto en S/ 0; la cifra solo para quien cierra la caja; el segundo retiro espera al primero.
  // Con control. Disparadores diferidos: cada caso corre `set constraints all immediate` y termina en ROLLBACK.
  "pruebas:caja-efectivo-no-negativo",
  // ADR-0412 (/chaos de Finanzas 2026-10-14): NaN, tope de S/ 1 000 000 y textos con tope en Finanzas; la caja fuerte no queda bajo
  // cero (disparadores diferidos: cada caso corre `set constraints all immediate`); un gasto anterior al inicio de Finanzas. Con controles.
  "pruebas:finanzas-montos-y-caja-fuerte",

  // Montos válidos en Ventas y Caja (/chaos 2026-10-13): ni NaN ni infinito en apertura, cierre (tampoco en blanco), egresos y
  // reembolsos; el vuelto con tope de S/ 500; el reembolso de una devolución ≥ 0 y con uno de los cinco medios. Con controles.
  // Cada caso: ROLLBACK.
  "pruebas:ventas-montos-validos",

  // El documento del comprobante (/chaos 2026-10-13, decisión de Felipe): boleta con DNI de 8 dígitos y factura con RUC de 11,
  // en emitir_comprobante y en un disparador de respaldo; una boleta vieja sigue cambiando de estado y emitiendo su nota de
  // crédito. Con control. Cada caso: ROLLBACK.
  "pruebas:comprobante-documento-valido",

  // Candados de Apartados y Proformas (/chaos 2026-10-13): el celular «abcdefghi» ya no se descarta en silencio, una proforma
  // no nace vencida y no se marca con una venta de otras prendas. Con controles. Cada caso: ROLLBACK.
  "pruebas:apartados-proformas-candados",

  // El panel de Actividad no muestra las ventas archivadas como prueba (ADR-0159): fn_actividad y
  // fn_actividad_personas dejan fuera la fila de una venta con es_prueba; la fila queda en la tabla.
  // Con controles (sin la migración la fila sí sale). Cada caso: ROLLBACK.
  "pruebas:actividad-oculta-ventas-de-prueba",

  // Dónde se registró cada producto (ADR-0292): un disparador en productos anota la sede (terminal, x-ubicacion o sede de
  // partida), nunca frena un alta, y la web solo lee por fn_producto_origen (la tabla no tiene políticas). Cada caso: ROLLBACK.
  "pruebas:producto-origen",

  // Cuarentena no sale hacia la clienta (PL-78): un disparador en movimientos rechaza venta, cambio y apartado
  // desde una sububicación Cuarentena; liquidar sigue. Control con el disparador deshecho. Cada caso: ROLLBACK.
  "pruebas:cuarentena-no-se-vende",
  "pruebas:datos-sensibles-proveedores",

  // La cuarentena no se ajusta a mano (ADR-0328 act. 10): un disparador en movimientos rechaza todo `ajuste` sobre una
  // sububicación Cuarentena (descuadraría el stock contra prendas_danadas); sus puertas propias siguen y abrir_conteo
  // rechaza la cuarentena. En producción desde ~2026-10-05; sin archivo en main hasta el 14-oct. Control sin el
  // disparador. Cada caso: ROLLBACK.
  "pruebas:cuarentena-no-se-ajusta",

  "pruebas:stock-huella",
  "pruebas:candados-pago-y-firma",

  // Dañadas (ADR-0328 act. 10): reportar desde Existencias mueve lo LIBRE del piso o del almacén a la cuarentena y abre
  // su fila (todo o nada, lo apartado no se mueve, firma, marca de reintento, candado de Existencias y de la sede);
  // «Se arregló» la devuelve al ALMACÉN, solo el líder y con nota; ninguna de las dos es pérdida (traslado interno);
  // los candados del esquema (tres orígenes, arreglo con nota, un movimiento por dañada). Cada caso: ROLLBACK.
  "pruebas:danadas-reportar-arreglar",

  // Cron de SUNAT (PL-113): la llave de servicio toma la cola solo de las últimas 4 horas, sin claims el candado
  // sigue cerrado y las tres funciones de la cola la dejan pasar. Control sin la migración. Cada caso: ROLLBACK.
  "pruebas:sunat-reintento-por-cron",

  // Lo que SUNAT aceptó no retrocede (ADR-0386): una respuesta vieja de Lucode no pisa un aceptado ni un anulado (se
  // ignora sin error), el disparador de la tabla frena cualquier paso de estado que no existe, venga de donde venga, y lo
  // que ya intentó salir a SUNAT no se libera. La carrera de dos conexiones (commitea) va aparte, en EXCLUIDAS. ROLLBACK.
  "pruebas:sunat-estado-no-retrocede",

  // Devolver insumos (ADR-0133, F3b): lo devuelto vuelve al último lote del que salió la orden, el costo de
  // tela/avíos de la orden queda neto, anular devuelve todo al estante y quien no opera el Taller no puede.
  // Cada caso termina en ROLLBACK.
  "pruebas:insumos-devolucion",

  // Directorio de proveedores de Producción (ADR-0133, F4a; D-H): solo el líder lo ve y lo escribe (por RPC),
  // RUC/CCI/celular se normalizan y se rechazan con mensaje claro, nombre y RUC no se repiten, se archiva sin
  // borrar, la lista suma lotes y total comprado, y un lote no acepta un proveedor del directorio de Compras.
  "pruebas:proveedores-produccion",

  // Comprobantes de Producción (ADR-0133, F4b; D-H): las reglas de la factura de Compras (ADR-0035) sobre su propio libro —
  // contado exige pago por el total exacto, crédito exige vencimiento, idempotente por token, el total impreso se cuadra
  // con tolerancia, anular exige motivo y no se puede con pagos; solo el líder lee y escribe; líneas y pagos son inmutables.
  "pruebas:comprobantes-produccion",

  // Por pagar de Producción y consolidado D-I (ADR-0133, F4c): un pago parcial o con varios medios baja el saldo, nunca lo supera ni
  // se repite con el mismo token; solo el líder paga; la deuda consolidada suma Compras y Producción por proveedor y el IGV del mes
  // suma los dos libros menos las notas de crédito. Cada caso termina en ROLLBACK.
  "pruebas:por-pagar-produccion",

  // Recibir insumos contra un comprobante de Producción (ADR-0133, F4d): un lote por línea con el costo de la línea, nunca más de lo
  // facturado, lo que no llegará se cierra con motivo, idempotente por token, lo recibe quien opera el Taller SIN ver montos, y con
  // mercadería recibida el comprobante no se puede anular. Cada caso termina en ROLLBACK.
  "pruebas:recibir-comprobante-produccion",

  // Candado del dinero de Producción (ADR-0133, F4e; D-G): un colaborador del Taller no lee los costos de lotes, movimientos ni órdenes por la
  // API directa (privilegio por columna) pero sigue recibiendo, descontando y cerrando órdenes; el líder los lee solo por fn_costos_*; la vista
  // v_insumo_saldos está cerrada; y una guardia avisa si una columna nueva queda sin SELECT. Cada caso termina en ROLLBACK.
  "pruebas:candado-dinero-produccion",

  // Modelo nuevo desde la orden de producción (ADR-0361, segunda parte): `abrir_produccion_con_modelo_nuevo` crea el modelo y abre su orden en UNA
  // transacción y con UN token; la usa quien opera el Taller sin editar el catálogo (el modelo nace pendiente) y el líder (nace aprobado); tallas y colores
  // salen del vocabulario; una producción pide precio y una muestra no; un nombre repetido trae el id del existente. Aplica la migración dentro de cada
  // caso y hace ROLLBACK: no deja rastro en el Postgres compartido.
  "pruebas:abrir-produccion-modelo-nuevo",

  // Vista puente de la planilla de Dynamic (ADR-0133, F7; D-33): agrega la planilla YA PAGADA por sede y período (personas, pagado, provisiones, costo total),
  // solo períodos pagados y sin el grupo «prueba», oculta grupos de menos de 3 personas, no expone a nadie identificable, es security_invoker (sin permiso en
  // Dynamic sale vacía) y sin Dynamic en la base la migración no falla. Arma el stub de Dynamic dentro de cada transacción y hace ROLLBACK.
  "pruebas:planilla-por-sede",

  // Recorrido de PUNTA A PUNTA de Producción por el ERP (ADR-0133): proveedor → comprobante (Por pagar, Deuda consolidada, IGV) → recepción por un colaborador del Taller sin ver montos →
  // pago → orden con insumos → cierre (stock, movimientos, costo de la variante) → traslado a la tienda → lo que ven Inventario y el líder. Una transacción con ROLLBACK; corta en el primer paso que falle.
  "pruebas:produccion-punta-a-punta",

  // Cotización de maquila externa (D-82/D-31, ADR-0156): cargarla es solo del líder (RLS), la vigente es la más
  // reciente que no venció (nunca la primera), una vencida o sin ninguna da null (nunca un precio inventado),
  // cualquier sesión la lee (D-80: la tienda ve el mismo costo de referencia que el Taller) y los dos estados
  // imposibles del esquema (vence antes de empezar, precio negativo) no llegan a existir. Cada caso: ROLLBACK.
  // Estaba en EXCLUIDAS de `ci-paridad.test.ts` a la espera de confirmarse en un Postgres real (medida en rojo,
  // 10/11, en el stack donde se escribió): 11/11 en un Postgres 17 desechable con las migraciones y el seed —
  // cableada el 2026-09-27.
  "pruebas:cotizaciones-maquila",

  // Movimientos con «Referencia» (ADR-0127): el número del traslado/conteo viaja en cada fila,
  // «Traslado 24» / «Boleta B001-000184» / «F001-210» encuentran su proceso, y la lista y las
  // tarjetas de arriba cuentan lo mismo. Cada caso termina en ROLLBACK.
  "pruebas:fn-movimientos-referencias",

  // Filtro de búsqueda especial de Movimientos (ADR-0127, migración 20260921153700): nombre + color + talla en
  // cualquier orden y con plurales, sinónimos de color y singulares, comparado contra los MISMOS casos que la
  // versión TypeScript (filtro-busqueda-especial.casos.json); texto raro/vacío no revienta y no busca nada;
  // RLS + permisos de `fn_movimientos_variantes`/sus ayudas; y `fn_movimientos`/`fn_movimientos_resumen` usan
  // esta misma búsqueda. Complementa a `fn-movimientos-referencias` (esa prueba el número de proceso; esta, la
  // prenda) — no son la misma prueba. Cada caso: ROLLBACK. Estaba en EXCLUIDAS a la espera de confirmarse en un
  // Postgres real (medida en rojo, 134/146, en el stack donde se escribió): 146/146 en un Postgres 17 desechable
  // con las migraciones y el seed — cableada el 2026-09-27.
  "pruebas:fn-movimientos-busqueda-especial",

  // Movimientos leído desde la tienda (ADR-0234): el traslado que llega cuenta en «Entradas» y en «Traslados», una
  // operación es lo guardado de una sola vez sobre un mismo documento (el cambio cuenta una vez; dos ventas en una
  // transacción son dos), los ajustes van aparte y quien no opera la sede no ve sus cifras. Cada caso en ROLLBACK.
  "pruebas:movimientos-desde-la-tienda",

  // «Colgada en piso» y «Guardada en almacén» como tipos de Movimientos (ADR-0345): el filtro de la lista y los grupos de
  // las cifras las separan por el par de lugares (almacén → piso / piso → almacén), «interno» las sigue sumando, el
  // parche es re-pegable. Cada caso en ROLLBACK.
  "pruebas:movimientos-colgada-y-guardada",

  // Un ajuste no es la primera carga (ADR-0235): la base rechaza un ajuste que sería el primer movimiento de una prenda
  // en la tienda (`ajuste_sin_historia`) y `cargar_stock_inicial` la carga como entrada, todas o ninguna, al almacén o
  // al piso con su bajada; después, un ajuste de verdad pasa como siempre. Cada caso en ROLLBACK.
  "pruebas:ajuste-no-es-primera-carga",

  // La carga inicial se cierra por sede (ADR-0328, actividad 4): las tres puertas de carga inicial cargan hasta la fecha de
  // la sede (inclusive) y se cierran al día siguiente; registrar_movimiento no escribe «carga_inicial»; «Encontré prendas»
  // pide nota, solo suma y es la entrada de lo que aparece con la carga cerrada; quién mueve la fecha (el líder aprieta,
  // el Admin afloja) y el guardián de la columna. Fechas relativas a fn_hoy_lima(): sin bomba de calendario. Y la siembra de
  // Felipe en las TRES tiendas (TRU, AQP y LIM al 15-oct; el Taller sin fecha) sobre producción en miniatura, con un reloj
  // puesto a mano: abiertas el 15-oct hasta las 23:59:59 de Lima, cerradas desde el 16-oct 00:00. ROLLBACK.
  "pruebas:cierre-carga-inicial",

  // Descontinuar/reactivar en bloque desde la Tabla de Productos (ADR-0254): todo o nada, al reactivar revisa marca y
  // proveedor como «Editar» y nombra la prenda que falla; sin permiso lo dice en palabras. Cada caso en ROLLBACK.
  "pruebas:productos-estado-en-bloque",

  // Saldo por prenda de Movimientos (ADR-0234, saldo): cada movimiento dice cuántas quedaron en la tienda al terminar
  // su operación, leído de `fn_ledger_puntos` (la bajada no lo cambia, la cuarentena lo baja, el último es el stock
  // de hoy); otra sede no vuelve y sin sesión no responde. En ROLLBACK.
  "pruebas:movimientos-saldo",

  // Existencias: una puerta, un candado; y «Ajustar» de una vez (ADR-0240). «Reponer», «Retirar del piso» y «Apartar»
  // piden su módulo en la base, mover_interno y apartar_stock ya no se llaman desde afuera (y bajar_al_piso sigue
  // bajando), y ajustar_inventario es todo o nada con marca de reintento. Cada caso en ROLLBACK.
  "pruebas:existencias-candados-y-ajuste",

  // Resumen de Inventario v2 (ADR-0121): días con stock reconstruidos del ledger,
  // demanda por FK, costo verificado. Cada caso termina en ROLLBACK.
  "pruebas:fn-resumen-variantes",

  // Resumen: comparar dos períodos (ADR-0129): stock al inicio y al cierre reconstruido del ledger,
  // importe y costo de lo vendido, solo líder. Cada caso termina en ROLLBACK.
  "pruebas:fn-resumen-comparacion",

  // Ledger de piso/almacén con UNA sola fuente (ADR-0202): `fn_resumen_comparacion` y `fn_ledger_timeline` delegan de verdad en
  // `fn_ledger_puntos` (se lee su código, no se confía en que «den el mismo número»), reconstruyen el mismo stock y los mismos días
  // con stock para la misma ventana, la suma de `fn_movimientos` (Inventario ▸ Movimientos) cuadra con el ledger, y el stock de
  // piso/almacén de hoy es NULL —nunca un 0 inventado— en una sede que no los separa. Elige sus actores por rol (una tienda, un
  // admin, una colaboradora de otra sede), no por UUID, así que sobrevive a un reseed. Medido el 2026-09-25 en un Postgres 17
  // desechable con todas las migraciones y el seed: 48/48 dos veces seguidas, con la misma salida, en cuatro zonas horarias de
  // sesión, con un rol sin superusuario y en su lugar de este job (los 74 pasos en este orden, 74/74), sin dejar una sola
  // fila. Cada caso termina en ROLLBACK.
  "pruebas:fn-ledger-fuente-unica",

  // Ritmo reciente de Existencias (rediseño 2026-09-25): `fn_ritmo_reciente_json` reutiliza `fn_ledger_puntos`
  // (ADR-0202) en vez de sumar una cuarta reconstrucción del ledger, sus eventos coinciden exactos con los de
  // `fn_ledger_puntos` filtrado a 'piso', su permiso es el de todo el personal de tienda (nunca solo líder,
  // a diferencia de `fn_resumen_comparacion`), y una variante sin movimiento en la ventana igual aparece con
  // `[]` — nunca ausente. Cada caso termina en ROLLBACK.
  "pruebas:fn-ritmo-reciente",

  // Productos (ADR-0151): una prenda descontinuada no cuenta como «sin stock», «stock bajo» ni «para pedir»
  // (y por tanto no sale en «A quién pedirle»), el contador de arriba dice lo mismo que la lista de abajo, y
  // «N variantes» cuenta variantes, no filas de stock. Cada caso termina en ROLLBACK.
  "pruebas:productos-alertas-de-stock",

  // El dinero de Compras es solo del líder (ADR-0126): que un integrante no lea ni un monto —por
  // función, por tabla ni por el bucket de escaneos—, que recibir siga funcionando y que ninguna
  // migración le quite el candado a las cinco funciones de dinero (el riesgo residual del ADR).
  // Corre sobre una base NUEVA con todas las migraciones aplicadas en orden, así que además prueba
  // que las dos migraciones del cierre aplican limpias. Cada caso termina en ROLLBACK.
  "pruebas:dinero-compras",

  // CCI, Yape/Plin y titular del proveedor (ADR-0134): normaliza («+51 987 654 321», CCI con guiones),
  // rechaza lo inválido con mensaje claro, solo el líder escribe, los CHECK rechazan por su cuenta,
  // fn_proveedores() trae las 4 columnas con UNA sola firma, y la migración se puede pegar dos veces
  // sin perder nada. Cada caso termina en ROLLBACK.
  "pruebas:proveedores-cuentas",

  // Varios rubros por proveedor (ADR-0213): registrar/editar limpian la lista (espacios, vacíos, repetidos sin
  // tildes ni mayúsculas), «sin rubro» es {} y nunca NULL, el CHECK y NOT NULL rechazan por su cuenta, fn_proveedores()
  // devuelve la lista, UNA sola firma de cada función, Gastos sigue naciendo con {Gastos} y la migración se puede
  // pegar dos veces. Cada caso termina en ROLLBACK.
  "pruebas:proveedores-rubros",

  // Pagos de Compras endurecidos (ADR-0135): el total del papel con IGV incluido cuadra sin abrir el candado
  // (5 u × 10.00 … 100 u × 1.00; un +S/ 5 sigue rechazado), el pago desde el detalle es idempotente por token, el
  // reintento de un lote con saldo a favor devuelve el éxito original, las tres rutas rechazan fechas futuras o
  // anteriores a la emisión y montos de más de 2 decimales, el integrante sigue sin poder pagar, UNA sola firma
  // de cada función y la migración se puede pegar dos veces. Cada caso termina en ROLLBACK.
  "pruebas:pagos-compras-endurecimiento",

  // El reparto de un comprobante entre tiendas (ADR-0139) y su filtro «Destino»: 24 unidades repartidas 12/12, una suma distinta
  // de lo facturado se rechaza (por la RPC y por la base misma), una tienda no recibe más de lo suyo ni se «come» la de otra,
  // reasignar solo lo pendiente y solo un líder, el faltante es de una tienda concreta, un integrante no ve la parte de otra
  // tienda (RPC y RLS), el candado de dinero sigue en pie, `listar_compras` y `por_pagar_tramos` filtran por tienda de destino
  // con los subtotales cuadrando contra la lista y UNA sola firma de cada función. Usa el mismo seed que `dinero-compras`
  // (Felipe, Micaela, Textiles Andina, Tienda Lima/Trujillo, el Taller). Cada caso termina en ROLLBACK.
  "pruebas:compras-reparto",

  // Compras POR TIENDA (ADR-0184 sobre los roles por módulo de ADR-0161): sin módulo no se llega a ninguna tienda (ni con fila en
  // compradores_de_tienda); con módulo, a la suya y a las extra; una factura que gestiona otra tienda no se ve (ni cabecera, ni
  // líneas, ni pagos) y su parte sale por fn_mis_partes_de_compras / fn_mi_parte_de_compra sin el total de la factura; cada tienda
  // paga desde su tienda y hasta su parte (RPC y candado de esquema); anular/registrar solo sobre la gestora propia; una sola
  // firma y nada abierto a anon. Cada caso termina en ROLLBACK. Mismo seed que `dinero-compras`.
  "pruebas:compras-por-tienda",

  // El dinero de una factura partido por tienda (ADR-0184, F2): 24 unidades 12/12 = 708.00 y 708.00; costos de 3 decimales, 3 tiendas,
  // IGV del papel, boletas y regalos de costo 0 suman la CABECERA al centavo (aunque las líneas sumen distinto); dos lecturas dan lo
  // mismo; la vista respeta los permisos de quien la lee. Carga las tres migraciones DENTRO de cada caso, que termina en ROLLBACK.
  "pruebas:compras-parte-por-tienda",

  // Módulo Notas de crédito: el tablero trae notas y pendientes con sus montos (incluido el
  // monto_esperado del faltante cerrado y el a_favor de la nota que superó la deuda), registrar con
  // destino «a_favor» deja el mismo estado que la RPC de antes, con «reembolso» nacen nota y
  // devolución en UNA transacción (y si no sobra nada no nace ninguna de las dos), el buscador
  // encuentra por documento, proveedor y monto, el integrante no ve ni escribe nada, una sola firma
  // de cada función y la migración se puede pegar dos veces. Cada caso termina en ROLLBACK.
  "pruebas:notas-credito",

  // Arreglos que vivían SOLO en producción, traídos a main (ADR-0255, 20260928200000 y 20260928200100): mira el
  // ESTADO VIVO de la base, así que se pone roja el día que una migración vuelva a abrir una puerta (un `drop function` +
  // `create function` no conserva los `revoke`). emitir_comprobante / emitir_nota / fn_aplicar_movimiento /
  // recalcular_stock solo para su dueña (42501 para authenticated, anon y service_role); stock y movimientos sin
  // escritura directa para nadie de la app, con la lectura intacta (y los permisos, contra la lista EXPLÍCITA de
  // producción, también por columna); notas de crédito: un cierre deja de esperar su nota si tiene una atada o si el
  // comprobante ya tiene la de faltante; fn_rentabilidad solo para el líder; las dos migraciones pegadas sobre la foto
  // de producción (armada desde su propio texto, así que un cambio posterior legítimo no la pone roja) cambian solo lo
  // que dicen; y cerrar las puertas no rompe la tienda
  // (como authenticated, la venta con boleta y la devolución aprobada siguen emitiendo, con su control: sin el EXECUTE
  // de la dueña se caen). Cada caso termina en ROLLBACK.
  "pruebas:arreglos-en-vivo",

  // ── Pruebas que ya existían y pasaban pero no corrían en ningún sitio (cableadas el 2026-09-25) ────────────────────
  // Un script en `scripts/pruebas/` que nadie corre es una intención, no un candado (mismo problema que `deriva-produccion`,
  // abajo). Este bloque va en el MEDIO del job, junto a los de Compras, a propósito: cada fase de Finanzas anexa su paso al
  // FINAL, y un bloque nuevo también al final chocaría con ellas en cada merge.
  //
  // QUÉ SIGUE FUERA, y por qué: las pruebas que hoy están rojas (o que necesitan una base que este job no crea) no se
  // cablean —cablear una roja enseña a ignorar el rojo: el día que el job se ponga rojo por una de estas, nadie sabrá si es
  // un bug nuevo o el de siempre—. La lista, con el motivo de cada una, vive en `apps/web/lib/ci-paridad.test.ts`
  // (EXCLUIDAS), que corre en el job `verificar` y falla si un `pnpm pruebas:*` de package.json no corre acá NI está en esa
  // lista, o si un paso de este archivo llama a un nombre que package.json no declara. Cada una entra el día que se arregle.

  // Compras — faltantes con nota de crédito y pago por lote (ADR-0111): «estas N no van a llegar» con o sin nota, el pago de
  // varios comprobantes de un proveedor es todo o nada e idempotente por token, la nota suelta baja el saldo exactamente su
  // monto, el tope de recibir descuenta lo cerrado y las tablas append-only sostienen su RLS. Cada caso termina en ROLLBACK.
  "pruebas:compras-faltantes",

  // Pago por lote con VARIOS medios (ADR-0132): los medios se gastan en orden entre los comprobantes, Σ medios = total − saldo
  // a favor al centavo, todo o nada, un solo proveedor, tope por saldo, idempotente por token, y con UN solo medio escribe
  // exactamente lo mismo que `registrar_pago_compras`. Cada caso termina en ROLLBACK.
  "pruebas:pago-por-lote-medios",

  // Recibir un ENVÍO (ADR-0113): una guía con varios proveedores se registra entera o no se registra (un lote por proveedor,
  // atomicidad, un intento que falla no consume el token), lo fuera de comprobante lleva su origen, el envío interno confirma
  // un traslado sin crear stock de la nada, y la lectura es por sede sin escritura directa. Cada caso termina en ROLLBACK.
  "pruebas:recibir-envio",

  // Traslados: recibir sin perder nada (ADR-0239): entra ya lo que coincide y solo la línea con diferencia espera al
  // líder (que la hace entrar en el mismo lugar), piso o almacén al confirmar (el Taller usa el de siempre), una línea
  // que ya entró no se recuenta, anular devuelve cada prenda a su sububicación de origen (y se rechaza con conteo
  // empezado, sin motivo o desde otra sede; el mismo token no duplica), y el pedido para apartar se aparta cuando su
  // línea entra y vuelve a «pedido» al anular. Cada caso termina en ROLLBACK.
  "pruebas:traslados-recibir-sin-perder-nada",

  // Pedir a otra sede (ADR-0242 D-7): la reposición entre tiendas va en la tabla de pedidos de Apartados con la clienta
  // opcional. Pedir arma un grupo (las prendas repetidas se suman, el token no duplica) y no deja pedir más de lo
  // disponible, a la misma sede ni sin módulo; enviar arma UN traslado con todo el grupo (el reintento devuelve el
  // mismo); al llegar queda «recibido» sin apartar nada (parcial: lo que no llegó se cancela); cancelar; y Apartados no
  // ve la reposición mientras un pedido CON clienta se sigue apartando al llegar. Cada caso termina en ROLLBACK.
  "pruebas:pedir-a-otra-sede",

  // Pedidos que no se pierden (ADR-0328 act. 17): pedir para un cliente (también desde Vender) lo APARTA en la otra sede
  // (almacén primero) y el token no duplica; lo que allá no alcanza no deja nada a medias; lo colgado no sale en un paso
  // (subir_pedido_al_almacen, idempotente) y al salir la reserva se suelta; cancelar la suelta; anular el traslado la
  // vuelve a apartar; avisar al cliente solo tras llegar; fn_pedidos_por_atender (menú y 48 h) de los dos lados; la lista
  // «Para enviar» sale con el traslado a ESE destino y vuelve si se anula; Eliminar un producto la conoce. ROLLBACK.
  "pruebas:pedidos-que-no-se-pierden",

  // Indicadores de Compras (ADR-0111): las cifras de Por pagar, Recibir mercadería, Ingreso sin comprobante y Proveedores (deuda
  // por antigüedad, IGV del mes, concentración, quién cumple) son las de la lista, con permisos (integrante vs. líder, anon) y
  // el borde del día en Lima. Compara contra una línea base, no contra valores absolutos. Cada caso termina en ROLLBACK.
  "pruebas:compras-indicadores",

  // «Por pagar» muestra la parte de MI tienda (ADR-0187): una factura repartida 12/12 la ve cada tienda por su mitad gestione
  // quien gestione, el líder la ve entera, pagar la propia parte la saca de la deuda de esa tienda y no de la del líder, y las
  // cifras suben exactamente lo de mi parte. Una sola firma por función y nada abierto a anon. Cada caso termina en ROLLBACK.
  "pruebas:por-pagar-parte-de-mi-tienda",

  // El motor del stock (`fn_aplicar_movimiento`, principio 4): entrada/salida/ajuste/traslado aplicados a `stock` por su cuenta,
  // sin pasar por las RPC de negocio — no-negativo en salida, atomicidad del traslado, orden fijo de bloqueo contra deadlocks y
  // el signo del ajuste (ADR-0020/0023). Es la función que sostiene TODO el inventario. Cada caso termina en ROLLBACK.
  "pruebas:fn-aplicar-movimiento",

  // Totales de Caja y del Historial de ventas en la base (ADR-0191): `fn_totales_historial_ventas` y `fn_resumen_caja` dan
  // exactamente lo de sumar fila por fila lo que la RLS deja ver (líder y colaboradora), sin cortarse a las 1.000 ventas; el
  // sello de la caja cambia al anular una venta; anon no ejecuta ninguna. Siembra 3.000 ventas y hace ROLLBACK.
  "pruebas:totales-caja-historial",

  // Dos terminales a la vez sobre la misma prenda vendida (ADR-0189): cambio o devolución de la misma línea de venta ya no pasan
  // las dos; la segunda ESPERA a la primera (55P03 en `venta_items`) y la migración se pega dos veces sin duplicar parches. Si el
  // local no tiene una línea vendida con unidades libres, la parte de dos sesiones avisa que no corrió (no falla). ROLLBACK.
  "pruebas:concurrencia-linea-venta",

  // Candados en orden y doble clic (ADR-0190): dos operaciones que piden las mismas prendas en orden contrario ya no se cancelan
  // por deadlock (la segunda espera), el mismo token dos veces devuelve el MISMO id y mueve stock o dinero una sola vez, y las 5
  // funciones con parámetro nuevo quedan sin sobrecarga y sin abrirse a anon. Cada caso termina en ROLLBACK.
  "pruebas:concurrencia-orden-doble-clic",

  // Edición simultánea con versión (ADR-0193): dos personas abren la misma prenda o el mismo rol; la primera guarda y la segunda
  // recibe PT409 en vez de pisarla en silencio, la versión sube con cualquier escritura y no se fija a mano, guardar sin cambios
  // no la sube. Cada caso termina en ROLLBACK.
  "pruebas:edicion-simultanea",

  // Ficha de clienta v1 (D-76/D-77): registrar y editar no dan ni quitan ningún permiso de WhatsApp (desde ADR-0288 tanda 1b)
  // y guardar de nuevo NUNCA revoca uno ya dado; buscar y registrar clienta por DNI. Cada caso termina en ROLLBACK.
  "pruebas:clientas",

  // La ficha de clienta es del módulo «Clientas» y anonimizar borra todo (ADR-0249, actualización 2026-09-28): sus 11
  // funciones rechazan con 42501 `clientas_sin_modulo` a la cuenta cuyo rol no lo tiene (antes de pedir «Responsable») y la
  // política de la tabla le devuelve 0 filas; líder, persona y terminal con el módulo pasan. Registrar con el DNI de una
  // ficha archivada la reactiva (mismo id, historial, version+1). Anonimizar no deja el DNI, el nombre ni el celular en
  // clientas, clientas_fusiones ni en la actividad (Clientas y Apartados). Control sin el candado del módulo (el ataque
  // pasa), la PARTE 2 pegada una y dos veces, la PARTE 1 que hoy aborta sin pisar nada (la tanda 1a del club la superó) y
  // vigilantes que muerden; las cinco ramas de la actividad de un apartado; y dos cajas a la vez con el mismo DNI (dos
  // conexiones: la segunda espera en la lectura de la ficha). Cada caso termina en ROLLBACK (la carrera con COMMIT solo
  // corre con BASE_DESECHABLE=1, no aquí).
  "pruebas:clientas-modulo",

  // Celular para la boleta (ADR-0288, «Actualización 2026-10-03 (o)», actividad 2): `agregar_celular_clienta` SOLO AGREGA. A
  // una ficha sin celular se lo deja normalizado (versión +1, una línea de actividad sin datos personales); a una que ya
  // tiene uno —el mismo u otro, también una socia con publicidad— no la toca y responde false (sin `revoca`); lo inválido,
  // una ficha archivada o inexistente y una cuenta sin el módulo «Clientas» se rechazan con su hint; `anon` no la ejecuta;
  // dos cajas a la vez se turnan (la segunda espera en `for update`); y un control sin la guarda, donde el celular SÍ se
  // pisa. Cada caso termina en ROLLBACK.
  "pruebas:agregar-celular",

  // Club de clientas, tanda 1a (ADR-0288 D-1, D-2 y CL-27): la venta se liga a la ficha que manda Cobrar (a la que quedó si
  // se unió; rechazo `clienta_anonimizada` o `clienta_no_existe` sin guardar nada), y sin clienta sigue igual; el documento
  // con tipo (DNI, carné, pasaporte), su formato y su único por (tipo, número); al registrar o corregir el documento se
  // ligan sus compras anteriores con boleta a ese documento, sin mover las de otra ficha; una sola firma de las RPC,
  // ayudantes sin EXECUTE, nada lee `clientas.dni`, md5 «después» = vivas; pegarla dos veces deja lo mismo y con una
  // función cambiada en vivo aborta sin pisar; y dos cajas a la vez, en dos conexiones: el mismo DNI (la segunda espera en
  // el alta) y una venta mientras otra caja une esa ficha (espera en la lectura de la ficha, antes de elegir a cuál se
  // liga). Cada caso termina en ROLLBACK (las carreras con COMMIT solo corren con BASE_DESECHABLE=1, no aquí).
  "pruebas:club-venta-ligada",

  // Club de clientas, tanda 1b (ADR-0288 D-4 reescrita, Ley 32323): dos permisos. Socia = su «sí» de palabra
  // (`unirse_al_club`: celular válido, documento y nombre, texto `club` vigente y la versión que se leyó; código C-0001
  // correlativo; idempotente); publicidad SOLO si ella escribió (`registrar_mensaje_publicidad`, `registrar_desde_whatsapp`;
  // un insert directo con otro medio lo frena el candado de la ley); la BAJA revoca en toda ficha con ese número y deja el
  // club. `club_permisos` y `club_textos` sin update, delete ni truncate (tampoco postgres) y sin API; candados de la
  // ficha; anonimizar escribe los `revoca`; unir pasa lo más antiguo y el código; registrar/editar sin el permiso de
  // WhatsApp; los textos v2 exactos; el WhatsApp de la tienda; el legado; md5 «después» = vivas, pegarla dos veces (entera
  // y por partes) deja lo mismo, con una función cambiada en vivo aborta sin pisar, ningún `into` en un texto que el SQL
  // Editor pueda confundir; y dos cajas invitan a la vez (la segunda espera en la lectura de la ficha). Cada caso termina
  // en ROLLBACK (la carrera con COMMIT solo corre con BASE_DESECHABLE=1, no aquí).
  "pruebas:club-permisos",

  // Club de clientas, tanda 1c (ADR-0288 D-5): el cumpleaños con un canje por año. `registrar_venta` con
  // `p_canjear_cumpleanos` recalcula la parte del club de cada línea (`round((precio − descuento_sin_club) × pct / 100, 2)`,
  // en cascada: 20 % → 28 %; la misma tabla de paridad que la regla de la web) y rechaza un monto distinto, un canje fuera
  // de su mes, de una no socia o sin clienta, y el segundo del año (único parcial de `club_canjes`); la parte del club no
  // cuenta para el costo, el tope D-67, el código, el 35 % ni el argumento; anular libera el canje y una devolución no;
  // `resumen_clienta_caja` dice disponible, % y canjeado; una sola firma, md5 «después» = vivas, pegar las tres partes
  // dos veces deja lo mismo, con una función cambiada en vivo aborta sin pisar, ningún `into` en un texto que el SQL
  // Editor pueda confundir; y dos cajas canjean a la vez (la segunda espera en la lectura de la ficha). Cada caso termina
  // en ROLLBACK (las carreras con COMMIT solo corren con BASE_DESECHABLE=1, no aquí).
  "pruebas:club-cumpleanos",

  // Club de clientas, tanda 1d (ADR-0288 D-6): «buscó y no había» y «se la probó y no la llevó» son la misma tabla
  // (`pedidos_no_atendidos.motivo`, con `razon` solo para «se la probó»; la llamada vieja de 5 parámetros sigue anotando
  // `no_habia_talla`; los rechazos no dejan fila; el esquema lo exige igual sin la función; lo de antes queda
  // `no_habia_talla`). Sin «es para regalo» (Felipe, 2026-09-30): la 1d no toca la venta ni la ficha. Una sola firma,
  // md5 «después» = viva, pegar las dos partes dos veces deja lo mismo, con la función cambiada en vivo aborta, la PARTE 2
  // aborta sin la 1, cada parte toma a lo más una tabla con `alter`, sin políticas ni `drop trigger` ni `select … into`
  // en un texto. Cada caso termina en ROLLBACK.
  "pruebas:club-se-probo",

  // Club de clientas, tanda 1f (ADR-0288 «Actualización 2026-09-30 (f)»): la lista y la ficha de /clientas. Su sede (la de
  // más compras NETAS en 12 meses; empate: la de su compra más reciente), última compra y frecuente (3 en 6 meses) con compra
  // neta (CL-25: una venta devuelta entera no cuenta, un cambio sí); cada filtro, el paginado y el término como
  // buscar_clienta; las cifras = el total de la lista; sin el módulo, clientas_sin_modulo; preferencias solo de una socia,
  // del catálogo y con candado de versión (anonimizar y unir las vacían); la historia del permiso en orden; md5 «después» =
  // vivas, pegarla dos veces deja lo mismo, con una función cambiada en vivo aborta sin pisar y ningún `into` en un texto
  // que el SQL Editor pueda confundir. Cada caso termina en ROLLBACK.
  "pruebas:club-lista-y-ficha",

  // Club de clientas, tanda 1g (ADR-0288 «Actualización 2026-10-01 (g)»): ella se une sola desde el cartel. El registro sin
  // sesión (`registrarse_en_el_club`, solo service_role): ficha nueva o reemplazo de sus datos sin moverle `club_desde` ni
  // el código, la prueba del consentimiento (pagina_cartel citando los términos y la casilla, sin persona), menor de 18,
  // versiones de los textos, celular nuevo que revoca y vuelve a dar la publicidad, archivada (no se reactiva) y anonimizada
  // (nunca se reusa); los límites del cartel (`club_intento`); quién puede llamar (anon y authenticated NO); la página y los
  // textos legales EXACTOS del documento aprobado; guardar_beneficios_club con su versión nueva de los términos; la
  // conservación de 3 años; md5 «después» = vivas, pegar las ocho partes dos veces deja lo mismo, con registrar_venta
  // cambiada en vivo aborta sin pisar, y cada `alter` de una tabla en uso en su parte. Cada caso termina en ROLLBACK.
  "pruebas:club-registro-cartel",

  // Club de clientas, tanda 1g (G-9, G-13): el vale de aniversario. El reparto en `registrar_venta` con
  // `p_canjear_aniversario`, igual al de la web (tabla de ejemplos) y exacto al céntimo; el umbral (6 compras o S/ 600 en
  // compras NETAS), la pausa y la escala (el quinto se repite), los 60 días; el canje (monto aplicado, año de club), uno por
  // compra con el cumpleaños, uno por año de club, el vale que cubre toda la compra (aniversario_cubre_todo); anular libera,
  // una devolución no; y dos cajas a la vez (la segunda espera en la lectura de la ficha). Cada caso termina en ROLLBACK
  // (la carrera con COMMIT solo corre con BASE_DESECHABLE=1, no aquí).
  "pruebas:club-aniversario",

  // Club de clientas, tanda 1g (G-8, CL-20, CL-21): Clientas ▸ Avisos. Quién aparece (publicidad de esa tienda; no sin la
  // casilla, con BAJA, de otra tienda), cumpleaños, aniversario, novedades (llegadas de 14 días con stock libre) y rebaja en
  // su talla deducida; el grupo testigo y el tope de 2 promocionales al mes; registrar y deshacer (10 minutos); el módulo
  // avisos_club (nace sin rol) y la BAJA desde Avisos; anonimizar borra teléfono y texto. Cada caso termina en ROLLBACK.
  "pruebas:club-avisos",

  // Club de clientas, tanda 1e (ADR-0288 D-3): el comprobante acepta carné de extranjería y pasaporte. Boleta y nota de
  // venta guardan el tipo y el número limpio; fuera de formato (o sin número) → `documento_invalido` sin venta, sin stock
  // movido ni correlativo gastado; la factura sigue exigiendo RUC; el candado de la tabla frena un insert directo; la
  // venta con boleta a un carné se liga al registrar a la clienta con ese carné (no la de un DNI con los mismos dígitos);
  // la nota de crédito copia el tipo y el número; md5 «después» = vivas, pegarla dos veces deja lo mismo y con
  // `emitir_comprobante` cambiada en vivo aborta sin pisar. Nada llama a Lucode ni a SUNAT. Cada caso termina en ROLLBACK.
  "pruebas:comprobante-carne-pasaporte",

  // Alta de colaborador con aprobación (D-70, ADR-0157): `agregar_colaborador` deja a la persona en `pendiente_aprobacion` y no
  // puede operar ninguna ubicación hasta que un líder (o quien tiene el módulo Colaboradores) la apruebe; no se suspende a quien
  // nunca se aprobó. Cada caso termina en ROLLBACK.
  "pruebas:colaboradores-alta-aprobacion",

  // Endurecimiento de colaboradores (ADR-0145): `authenticated`/`anon` ya no escriben `retail.colaboradores`
  // directo (solo las RPC, security definer); el CHECK rechaza un colaborador sin ubicación y deja pasar a un
  // líder sin ella; `agregar_colaborador`/`quitar_colaborador` avisan la segunda vez en vez de callar, y
  // quitarse a uno mismo nombra a «otro líder». Cada caso termina en ROLLBACK. Estaba en EXCLUIDAS de
  // `ci-paridad.test.ts` («nunca pudo pasar»): la prueba dependía de una persona «sobrante» del seed sin
  // colaboradores, que no existe (Felipe/Micaela/Sandra ya son las tres colaboradoras) — se corrigió para crear
  // su propia candidata, como el resto de las pruebas de este directorio. 7/7 en un Postgres 17 desechable,
  // también en `--en-seco` — cableada el 2026-09-27.
  "pruebas:colaboradores-endurecimiento",

  // Devoluciones con motivo estructurado (D-79, ADR-0158): `crear_devolucion` rechaza motivo nulo o fuera de la lista cerrada de
  // seis códigos, guarda el código tal cual, y lo devuelto se descuenta de lo ya cambiado y de otras devoluciones (ADR-0189).
  // Cada caso termina en ROLLBACK.
  "pruebas:crear-devolucion-motivo",

  // La devolución lleva marca (20261015162000): el mismo token (un reenvío del navegador o un doble clic) devuelve la misma
  // devolución, con otro contenido se rechaza (token_reusado), sin token sigue igual, y un reenvío simultáneo espera al primero
  // (dos sesiones de psql). Cada caso termina en ROLLBACK.
  "pruebas:crear-devolucion-token",

  // Pedido no atendido en 1 toque (D-79, ADR-0152): se anota con un producto del catálogo o con descripción libre, uno sin
  // ninguno de los dos se rechaza (en la RPC y en el CHECK), el candado de ubicación es real y un pedido no se resuelve dos
  // veces. Cada caso termina en ROLLBACK.
  "pruebas:pedidos-no-atendidos",

  // Prenda sin registrar (ADR-0179): la venta de una prenda que llegó al piso sin pasar por almacén deja una fila pendiente en
  // `prendas_por_regularizar` y `regularizar_prenda` la une con su prenda real; en cada camino el stock cuadra. Cada caso
  // termina en ROLLBACK.
  "pruebas:prendas-por-regularizar",

  // Piezas de liquidación (ADR-0379): una prenda suelta se etiqueta con categoría y precio, se rebaja con una etiqueta nueva (la
  // vieja deja de valer) y la caja la vende escaneando el código, sin mover stock ni dejar tarea a almacén. Cubre el mínimo de
  // precio, la etiqueta vieja, la otra sede, la misma pieza dos veces, la venta final y que anular la devuelva. Cada caso
  // termina en ROLLBACK.
  "pruebas:piezas-liquidacion",

  // Cierre de la cola de arranque (ADR-0334): un líder da por hechas, en bloque y dentro de su plazo, las ventas sin registrar que
  // ya no se pueden identificar. Cubre que sea todo-o-nada y solo del líder, que cerrar no mueva stock, que una prenda cerrada no
  // pueda cambiarse ni regularizarse por el camino de siempre, y los estados imposibles del esquema. Cada caso termina en ROLLBACK;
  // la carrera con COMMIT real (`pruebas:cola-arranque-concurrencia`) corre solo en una base desechable, no aquí.
  "pruebas:cola-arranque",

  // Corregir lo anotado de una venta sin registrar (ADR-0369): cambia solo descripción, categoría, talla y color de una venta
  // pendiente o cerrada sin prenda; ni precio, ni stock, ni la línea de venta. Deja su foto y su línea en Actividad. Cada caso
  // termina en ROLLBACK.
  "pruebas:corregir-prenda-sin-registrar",

  // Limpieza de las ventas sin registrar (ADR-0328, actividad 5; rescatada de #788 el 2026-10-12): las candidatas de cada venta
  // con el saldo del libro a la hora de la venta y lo que cambió después (de ahí la respuesta que sugiere la mesa), que contestar
  // mal descuenta dos veces, que nadie regulariza su propia venta salvo el líder firmando él mismo (ni desde la terminal), que
  // «ya estaba registrada» sale de lo disponible y que una prenda sin cargar en la sede no se regulariza. ROLLBACK.
  "pruebas:ventas-sin-registrar",

  // Familias fuera de los motores (bolsas de despacho): `familias.entra_a_motores` nace true para todas las familias que ya
  // existen, `fn_categoria_entra_a_motores` responde por la familia de la categoría (y true ante lo que no sabe), solo un líder
  // cambia la marca y la migración se puede cargar dos veces. Cada caso termina en ROLLBACK.
  "pruebas:familias-motores",

  // Los motores ignoran una familia apagada (bolsas de despacho): la misma venta, el mismo stock y la misma anotada en una categoría
  // de una familia apagada y en una normal; el motor del piso, la demanda y el plan de campaña traen la normal y NO la apagada, y el
  // interruptor es en vivo. La venta de la bolsa sigue entera en `ventas`. Cada caso termina en ROLLBACK.
  "pruebas:motores-familias-apagadas",

  // El script de una sola vez que pasa a «Bolsas» las ventas de bolsa anotadas como otra cosa (Bolsas de despacho): usa la función de
  // «Corregir lo anotado», cambia solo categoría, talla y la descripción automática, deja su foto y su línea en Actividad, es todo o nada
  // ante una lista mala o un destino que aún cuenta en los motores, volver a pegarlo no hace nada, y después el motor ya no las cuenta.
  "pruebas:reclasificar-bolsas",

  // Una sola firma por función, contra la base REAL (ADR-0009): ningún nombre de `retail` con más de una firma en `pg_proc`
  // tras aplicar todas las migraciones y el seed. Un `create or replace function` con OTROS parámetros no reemplaza, crea una
  // sobrecarga y la vieja sigue viva (PostgREST ya no sabe a cuál llamar). Solo `retail`: `public` es de Dynamic. Lleva un
  // caso de control que crea una sobrecarga a propósito (ROLLBACK) para probar que la consulta muerde.
  "pruebas:una-sola-firma",

  // Solo el líder de equipo cierra la caja y ajusta stock fuera de una venta (D-13, decidido el 2026-09-21): que el
  // candado esté en la base y no solo en el menú — una colaboradora no cierra ni la caja de su propia tienda ni
  // registra una entrada, salida o ajuste suelto (42501, y el stock y la caja quedan intactos), sin sesión tampoco;
  // el líder hace exactamente lo mismo que antes (mismo arqueo, mismo stock, mismos rechazos), UNA sola firma por
  // función, permiso de ejecución de authenticated intacto y la migración se puede pegar dos veces.
  // Cada caso termina en ROLLBACK.
  "pruebas:candado-lider",

  // Cierre con traslado y apertura verificada (ADR-0186): el esperado que ve quien cierra es el mismo que
  // congela `cerrar_caja` (y una colaboradora no lo lee); el traslado rechaza más de lo contado, un destino
  // inválido o "entregado al líder" sin decir a quién (el depósito bancario SIN n.º de operación NO se
  // rechaza desde el 2026-09-23: es opcional); el cierre con traslado deja su fila en `caja_traslados` y
  // `monto_fondo` = contado − trasladado; `abrir_caja` compara con el último fondo y exige motivo si difiere;
  // `revisar_apertura_caja` es solo del líder y una sola vez; y el check `caja_apertura_explica_diferencia`
  // frena una escritura directa. Cada caso termina en ROLLBACK.
  "pruebas:caja-cierre-traslado",

  // Tres candados de dinero que vivían solo en el modal, no en la base (20260922235000): `registrar_movimiento_caja`
  // decide `es_ajuste` del MOTIVO (no de lo que manda el navegador) con vocabulario cerrado y referencia exigida
  // para "Depósito bancario"/"Otro"; `registrar_cambio` con diferencia negativa no exige líder (revertido a
  // propósito el 2026-09-23, "agilidad para la clienta"); `aprobar_devolucion` no la aprueba quien la registró y
  // el reembolso no supera lo que la clienta pagó de verdad (con descuento); y un `update`/`insert`/`delete`
  // directo sobre `devoluciones`/`devolucion_items`/`prendas_danadas`/`cambios` con el rol real de la API ya no
  // tiene privilegio de tabla (con su prueba de mutación: sin el `revoke`, el mismo `update` sí pasaba). Cada
  // caso termina en ROLLBACK.
  "pruebas:candado-dinero-caja-cambios-devoluciones",

  // Archivar datos de prueba de producción sin borrar nada (D-54, ADR-0159): las cuatro funciones
  // (`archivar_venta_prueba`, `archivar_caja_prueba`, `archivar_conteo_prueba`, `archivar_producto_prueba`)
  // exigen líder primero; archivar una caja ABIERTA la cierra con el mismo cálculo que `cerrar_caja` y libera el
  // índice único de la sede; archivar un conteo `abierto` se rechaza (22023); el trigger de `conteos` bloquea
  // `es_prueba` por UPDATE directo aunque la colaboradora pueda editar su propio conteo; y el mismo candado
  // ahora también en `productos` (20260928110000: `productos_write_lider` dejó de exigir líder para TODA
  // escritura cuando ADR-0161 sumó el módulo Productos/Atributos, reabriendo la puerta que esta migración creía
  // cerrada). Cada caso termina en ROLLBACK. Estaba en EXCLUIDAS («no pasa: 1 de 16»): el script llamaba a
  // `ventas`/`cajas`/`archivar_venta_prueba()` sin el prefijo `retail.` — `search_path` por defecto de una
  // conexión nueva es `"$user", public` (ni `supabase start` lo cambia para `-U postgres`: `extra_search_path`
  // de `config.toml` solo lo aplica PostgREST a los roles de la API). 16/16 en un Postgres 17 desechable, en
  // modo normal y en `--en-seco` — cableada el 2026-09-27.
  "pruebas:archivar-datos-prueba",

  // Cuentas TERMINAL por tienda (poderes del ADR-0160, identidad del ADR-0162): la de ventas cierra caja y mueve caja; la
  // administrativa ajusta stock, cierra conteos y traslados con diferencia, escribe en el Catálogo y edita las cuentas de
  // proveedores; y NADA más se abrió (etiquetas con descuento, anulaciones, devoluciones y series siguen siendo solo del
  // líder). La terminal es un aparato SIN persona: cada operación la firma el responsable presente (`x-responsable`) y
  // queda su `terminal_id`; sin responsable, 42501. `agregar_terminal` y `colaboradores.terminal` quedaron retiradas. Un
  // escenario por actor. Cada caso termina en ROLLBACK.
  "pruebas:terminales",

  // Terminales SIN persona (ADR-0162): el aparato nunca firma solo — `fn_actor_persona_id()` exige un responsable
  // PRESENTE en la tienda de la terminal (en pausa, con salida, sin marcas u otra tienda → rechazado); los permisos
  // son de la cuenta (con una líder como responsable, la terminal sigue sin ser líder); `terminal_id` se sella al
  // insertar; la pantalla es solo del líder. Asistencia de Dynamic simulada dentro de cada caso. ROLLBACK siempre.
  "pruebas:terminales-sin-persona",

  // La puerta de lectura de retail y las terminales (ADR-0289): `fn_tiene_acceso_retail()` solo reconocía personas, así que
  // una terminal con el módulo Proveedores recibía `[]` de fn_proveedores/fn_proveedores_resumen/fn_existencias y la pantalla
  // lanzaba («Esta pantalla no está mostrando datos», 2026-09-30). Pasan las terminales activas, no las desactivadas ni
  // las de una sede apagada ni una persona de Dynamic sin colaborador; el dinero sigue por rol y por tienda; el BARRIDO exige
  // que toda lectura sin argumentos que use la puerta le dé filas a la terminal cuando se las da al líder. La migración se
  // puede pegar dos veces y su guardia se detiene si alguien cambió la puerta en vivo. ROLLBACK siempre.
  "pruebas:terminales-lecturas",

  // «Dónde más hay» y las terminales (ADR-0289, segunda tanda): `fn_stock_por_sede()` tenía su PROPIA puerta «persona con
  // colaborador» en vez de `fn_tiene_acceso_retail()`, así que una terminal recibía cero filas sin error (y `[]` por
  // `fn_stock_por_sede_json`): Vender, Cambios, Apartados y «Pedir a otra sede» la veían como «ninguna otra sede tiene
  // stock». Pasan persona y terminal activas y reciben las MISMAS filas; no pasan una terminal apagada, la cuenta de afuera,
  // una persona de Dynamic sin colaborador ni un alta pendiente; la puerta se evalúa una vez por consulta; y el INVENTARIO
  // de funciones con puerta propia es una lista cerrada: la próxima que copie la puerta pone este paso en rojo. ROLLBACK siempre.
  "pruebas:terminales-red",

  // El motor del piso (ADR-0328 act. 7): `fn_piso_plan_lectura` junta lo libre en piso y almacén (la cifra de ADR-0270), lo
  // vendido en 14 días por prenda y por categoría × talla × familia de color con las ventas «sin registrar» pendientes, lo
  // anotado hoy y ayer, y la fecha del último cuadre del piso. Vigila que una venta cuente UNA vez y en el día en que se cobró
  // (al regularizarla con la función real pasa de anotada a escaneada sin moverse de fecha), que cuente lo que el cliente se
  // llevó (cambio = la prenda nueva; sin devoluciones aprobadas ni liquidaciones de dañadas), las dos puertas (la de retail y
  // la de la sede: otra sede, terminal apagada, de afuera o sin sesión → NULL, nunca «al día»), el día de Lima, el cuadre de
  // SU sede, que las tallas de la base sean las que recorre `piso-plan.test.ts`, y el costo (~800 unidades y ~150 ventas,
  // `fn_existencias_base` una sola vez). ROLLBACK siempre.
  "pruebas:piso-plan",

  // El motor de demanda, etapa 0 (ADR-0346): `fn_motor_demanda_preparacion` cuenta por tienda y por día de Lima las unidades
  // vendidas y cuántas apuntan a una prenda real (no a la centinela «sin registrar»), más el último cuadre del piso y si el
  // almacén tuvo su conteo de arranque. Vigila las puertas (sin sede solo CAYLA Global; con sede, quien la opera), el día de
  // Lima, que anuladas, de prueba, de otra sede, viejas y liquidaciones de dañadas no cuenten, y que una venta regularizada
  // después cuente identificada en el día en que se cobró. ROLLBACK siempre.
  "pruebas:motor-demanda",

  // El motor de demanda, etapa 1 (ADR-0347): `fn_demanda_sede` entrega por prenda lo que el cliente se llevó y las jornadas en que
  // estuvo colgada (≥ 10 minutos, desde el día siguiente al cuadre, sin hoy), y por grupo las «sin registrar» sin prenda. Vigila
  // las puertas, que un día sin la prenda a la vista no cuente, que una prenda colgada sin tocar y una agotada ayer conserven sus
  // días, y que lo vendido sea EXACTAMENTE lo que cuenta el motor del piso. ROLLBACK siempre.
  "pruebas:motor-demanda-lectura",

  // Análisis v4 (ADR-0357): las dos lecturas de la pantalla, `fn_analisis_sede` (las prendas de una tienda: libre, vendido en 30
  // días y por semana, días sin venderse, lo que llegó, origen y rebaja) y `fn_analisis_por_llegar` (compras y traslados en
  // camino). Vigila las puertas (quien analiza lee las tres tiendas; sin Análisis, nada), que lo vendido cuente igual que el
  // motor del piso (cambios y devoluciones aprobadas) y que una sede de 200 prendas responda rápido. ROLLBACK siempre.
  "pruebas:analisis-lecturas",

  // Plan de campaña (ADR-0349): el módulo nace en Compras sin rol; solo quien lo tiene lee y guarda (42501 si no; nadie lee las
  // tablas directo); `guardar_plan_compra_linea` rechaza escenarios desordenados, costo ≥ precio, recupero fuera de 0-100 y una
  // curva ajena o que no suma 100, y guardar dos veces deja una línea firmada; la hoja trae el stock libre de la red, la curva
  // vendida en 90 días y lo vendido dentro de la campaña. ROLLBACK siempre.
  "pruebas:plan-compra",

  // La historia del plan (ADR-0372, C2–C6): Sinatra manda antes de la primera venta en el ERP y el ERP desde ella; «lo que sobra» solo
  // lo fija un líder y se hereda; la propuesta trae lo vendido en 90 días, la misma campaña del año anterior, el multiplicador real de la
  // tienda y si la categoría se agotó (sin Cuarentena); los resultados, lo vendido por prenda y a qué % se vendió lo de después. ROLLBACK.
  "pruebas:plan-compra-historia",

  // «Fijar un mínimo» con el módulo (ADR-0362, decisión 64): lo fija quien tiene «Plan de campaña», sea o no líder; sin el módulo,
  // 42501; la suma de una campaña no pasa de 100 % ni con dos personas a la vez (el plan se bloquea: la segunda espera y se rechaza).
  // ROLLBACK en todo, menos el caso de las dos sesiones, que confirma sobre un plan de prueba y lo borra al terminar.
  "pruebas:plan-compra-minimo",

  // Órdenes de compra (ADR-0362, fase 1): el módulo nace en Compras sin rol; solo quien lo tiene lee la lista (42501 si no) y, con
  // él, ve las órdenes de TODAS las sedes; nadie lee las tablas directo; la lista suma bien (descuento incluido), filtra por destino,
  // estado, proveedor y texto, y pagina; y el esquema no deja guardar lo imposible (descuento mayor que la línea, % que no cuadra,
  // anulada sin motivo, entrega antes de la emisión, número repetido). ROLLBACK siempre.
  "pruebas:ordenes-compra",

  // Compras: el módulo es la llave (ADR-0387, fase 2 de ADR-0362): en Compras nada es «solo del líder» si se tiene el módulo (Plan,
  // tienda gestora, costo atípico al recibir); quien tiene un módulo de plata ve y paga las facturas de TODAS las tiendas a nombre de
  // la empresa, y Proveedores ve los montos de la empresa; sin módulo, nada; Recibir sigue viendo solo su sede. Carga sus migraciones
  // dentro de cada caso (dos veces: se pueden pegar de nuevo). ROLLBACK siempre.
  "pruebas:compras-llave",

  // El comprobante de una orden de compra (ADR-0362, fase 2, actividades 4 a 8): solo con el módulo Órdenes de compra; boleta,
  // nota de venta y factura con IGV, al crédito o al contado a nombre de la empresa; lo de más y lo que no estaba en la orden se acepta
  // y se avisa; varias entregas; el mismo token no duplica; anular y registrar de nuevo el mismo papel; una orden con comprobante no se
  // edita ni se anula. ROLLBACK siempre.
  "pruebas:ordenes-compra-comprobante",

  // Líneas de comprobante sin prenda (ADR-0362, fase 2, actividad 3): Recibir no las ofrece ni las recibe (llegan por guía) y las
  // lecturas que nombran la prenda de una línea no se rompen. ROLLBACK siempre.
  "pruebas:compras-lineas-sin-prenda",

  // Envíos a una sede (ADR-0362, fase 3): una guía a una sola sede, desde una orden «directo» (solo a su tienda) o «Por repartir» (a
  // varias); no se envía más de lo pedido o facturado; se anula solo en camino; una orden con envío no se edita; la deuda del comprobante
  // es de la sede de quien hizo la orden (decisión 46). ROLLBACK siempre.
  "pruebas:ordenes-compra-envios",

  // La compra «Sin comprobante» de una orden (ADR-0362, decisión 50): el cuarto tipo, sin serie ni número (la base le pone SC-000001),
  // sin IGV, al crédito o al contado, y fuera del Registro de Compras de Impuestos. ROLLBACK siempre.
  "pruebas:ordenes-compra-sin-comprobante",

  // Recibir en la sede un envío de orden de compra (ADR-0362, fase 4): con solo Recibir se abre, se crea la prenda que llegó y se
  // cuenta talla por talla (buenas al almacén, dañadas a la cuarentena), con el costo corregido promediado, un lote por proveedor y el
  // papel hasta su cupo; faltante y sobrante con causa; quien hizo la orden no la recibe; token y costo atípico. ROLLBACK siempre.
  "pruebas:recepcion-de-envio",

  // El conteo guardado de un envío (ADR-0393): lo contado queda en la base línea por línea; gana el último con aviso de lo que pisó;
  // lo separado no pasa de lo contado ni trae prendas ajenas; lo de fuera de la guía; el formulario de la fase 4 deja su conteo; un
  // envío cerrado no se cuenta. ROLLBACK siempre.
  "pruebas:conteo-de-envio",

  // Cerrar lo contado con pendientes y «Hacer ahora» (ADR-0393, actividad 3): entra solo lo que tiene talla y color; lo demás queda
  // pendiente («detalle», «crear») o sin separar; lo que faltó se mide con lo contado; quien cierra firma lo que vio; «Hacer ahora» entra
  // como el cierre (costo del cierre, papel hasta su cupo), nunca más de lo que queda ni dos veces; la base no deja descuadrar una línea
  // aunque se escriba a mano; el número del aviso por sede. ROLLBACK siempre.
  "pruebas:pendientes-de-envio",

  // Reabrir un envío recibido (ADR-0393, actividad 4; decisión 5): lo que faltó deja de valer sin borrarse y sale de «Nos debe», lo
  // pendiente vuelve al borrador, lo que entró no se toca ni entra dos veces, y queda el rastro; no se reabre si Compras ya resolvió.
  // ROLLBACK, salvo los dos casos de dos sesiones (reabrir y resolver la deuda a la vez): commitean un envío de prueba y lo borran.
  "pruebas:reabrir-envio",

  // El envío sin aviso (ADR-0393, actividad 4; decisiones 2 y 10): la sede lo abre al llegar, lo cuenta por categoría y lo cierra
  // con los mismos pendientes; nada sobra ni deja deuda; el costo solo lo escribe quien ve el dinero de Compras (ADR-0330) y lo que
  // entra sin costo no toca el de la prenda. ROLLBACK siempre.
  "pruebas:envio-sin-aviso",

  // «Nos debe» (ADR-0362, fase 5a): solo un faltante «no vino» es deuda del proveedor; se salda con la prenda, a mano con nota o en la
  // próxima recepción (la más antigua primero), nunca más de lo debido (tampoco con dos sesiones a la vez); lo resuelto solo se agrega;
  // saldo a favor y depósito, «todavía no». ROLLBACK, salvo el caso de dos sesiones: commitea un envío de prueba y lo borra al terminar.
  "pruebas:nos-debe",

  // Órdenes de insumos del Taller (ADR-0362, fase 7): el módulo nace en Producción sin rol (solo el líder); OI- con su propio contador;
  // proveedor del Taller, destino un taller activo, la línea «insumo + cantidad con hasta 3 decimales» con la unidad copiada; doble clic,
  // reintento con otro pedido, versión vieja (PT409 con la frase que dice qué pasó), sin cambios, lo que no se tocó no se vuelve a juzgar;
  // anular con motivo; la firma de la decisión 39 (persona sola, terminal con combo). ROLLBACK, salvo los dos casos de dos sesiones
  // (editar a la vez y crear con el mismo id): commitean una orden de prueba y la borran al terminar.
  "pruebas:ordenes-insumo",
  // El comprobante de la orden de insumos (ADR-0362, fase 7 parte 2 · actividad 1): solo con el módulo; los cuatro tipos (el SC- de la
  // secuencia de la empresa), el IGV de la factura de 0 % a 18 %, 3 decimales de cantidad y 4 de costo; de más y fuera de la orden se
  // aceptan y se avisan; el doble envío; el papel único entre los vigentes; la orden con papel no se edita (ni se anula con papel
  // vigente); la recepción de siempre no recibe el papel de una orden. ROLLBACK.
  "pruebas:comprobante-orden-insumo",
  // ADR-0362 fase 7 parte 2, actividad 3: recibir en el Taller contra la orden de insumos (con un caso de dos sesiones que hace COMMIT).
  "pruebas:recepcion-orden-insumo",

  // Fondos por rendir (ADR-0362, fase 6 · actividad 1): el módulo es la llave; la primera entrega crea el fondo de la persona (1413) y
  // las demás suman en el mismo; nadie se entrega plata a sí mismo, registra su propia devolución ni anula su propio fondo; lo del líder
  // solo lo entrega el líder; no se devuelve más de lo que hay ni se anula una entrega ya usada; el validador, el registro genérico,
  // «¿De dónde sale la plata?» y el candado de la cuenta no dejan mover un fondo por otro lado. ROLLBACK siempre.
  "pruebas:fondos",

  // Gastos del viaje (ADR-0362, fase 6 · actividad 3): con Órdenes de compra; «Traer la mercadería» (609, fletes) o «Viaje de compra» (631);
  // desde «Mi fondo» el Diario lo saca de la 1413, desde la caja fuerte de la 101; a una o varias órdenes, repartido según su total; sin
  // comprobante solo taxi o cargador; un anulado no cuenta y devuelve la plata al fondo; la firma de la decisión 39. ROLLBACK siempre.
  "pruebas:gastos-viaje",
  "pruebas:rendicion-fondo",
  // Lo no deducible (ADR-0362, fase 6 · actividad 6): en un comprobante de S/ 2 000 o más, lo pagado en efectivo o desde un fondo; y lo
  // que pasa el tope diario de la planilla de movilidad, por persona y por día. ROLLBACK siempre.
  "pruebas:no-deducible",
  // Saldar la deuda de un faltante (ADR-0362, fase 6 · actividad 7): lo registra quien recibe la plata, no más de lo que debe, la más
  // vieja primero, anular devuelve la deuda, y la 1419 y la 1413 por dos caminos. ROLLBACK siempre.
  "pruebas:deuda-fondo",
  // El IGV de la fase 6 (ADR-0362, actividad 8): la factura con RUC de un gasto del viaje va al crédito fiscal; el IGV de lo pagado sin
  // banco se pierde en el mes del PAGO (Impuestos en negativo, el aviso del panel y, en el Diario, 64 contra 4011). ROLLBACK siempre.
  "pruebas:igv-fase6",
  // Finanzas ▸ Gastos con los gastos del viaje (ADR-0362, fase 6): la lista y sus cifras leen el papel de su ficha (factura, boleta,
  // ticket o planilla de movilidad, con su número y quien la dio), sin cambiar columnas ni lo de un gasto de Finanzas; y la pantalla
  // sabe decir todo papel que la base acepta. ROLLBACK siempre.
  "pruebas:gastos-lista-viaje",
  // Finanzas ▸ Gastos con el IGV perdido (ADR-0362, fase 6, decisión 76): la fila dice qué gasto perdió IGV por pagar sin banco, cuánto,
  // cuándo y cómo; la tarjeta lo resta en el mes del PAGO y se mueve igual que el crédito de gastos de Impuestos; misma visibilidad que
  // la lista; todo origen de fn_igv_perdido llega a un gasto o está fuera a propósito. ROLLBACK siempre.
  "pruebas:gastos-igv-perdido",
  // Lo que la base del fondo no acepta (ADR-0362, fase 6; /chaos 2026-10-14): un monto que no es un número (en las funciones y en las
  // tablas de plata), más de 2 decimales, diez mil millones, fechas de antes del 13/10/2026, textos invisibles, y el token que sigue al
  // contenido en las cinco funciones del fondo con su revisión en fn_resolver_intento. ROLLBACK siempre.
  "pruebas:fondos-entradas",

  // Roles por módulo (ADR-0150 retomado por el ADR-0161 B): siembra de los 4 roles con lo que cada cuenta ve hoy; Líder
  // fijo; Integrante editable y no archivable; solo el líder escribe; historial inmutable; `fn_ve_modulo` para persona y
  // terminal; y el PUNTO DE ENCHUFE: todas las `fn_puede_*()` dan lo mismo que con las definiciones fijas del ADR-0160
  // para líder, integrante y las dos terminales (ninguna capacidad nueva). ROLLBACK siempre.
  "pruebas:roles",

  // Coherencia módulo ↔ base (ADR-0150: «una prueba debe fallar si…»):
  // Roles y accesos apaga módulos en la pantalla, pero lo que de verdad detiene a una cuenta es lo que la BASE exige. Todo
  // módulo delegable tiene un guardián en `retail` —`fn_ve_modulo('x')` o `fn_capacidad_por_modulos(array['x'])` en una
  // política RLS, una vista o una función que está en el camino de una operación (la pantalla la llama con `.rpc`, un
  // disparador, otra función, política o vista)— o está en la lista SOLO_PANTALLA del guion, con su razón. Esa lista
  // solo puede encogerse (un módulo que ya tiene guardián y sigue en ella falla) y un módulo delegable NUEVO sin guardián ni
  // entrada falla diciendo qué hacer. La otra cara: toda función que exige SOLO LÍDER por un ayudante `fn_exigir_*` está
  // declarada en SOLO_LIDER con lo que hace la pantalla con quien no es líder. Los controles crean módulos, funciones,
  // políticas, vistas y disparadores falsos y terminan en ROLLBACK, para probar que la regla muerde. Qué cuenta como
  // «guardián» y qué no: encabezado de `scripts/pruebas/roles_cobertura_modulos.mjs`.
  "pruebas:roles-cobertura",

  // ADR-0253: ningún módulo es «solo del líder» (Configuración, Impuestos y Cierre de mes se dan como cualquiera, con
  // todo lo del líder dentro) y el Líder de equipo se edita (lo que se le quita, sin Roles y accesos, lo mueve un
  // Admin). Vigila además que ninguna de las 36 funciones reescritas vuelva a preguntar fn_es_lider(): una migración
  // que las recree desde un archivo viejo del repo les devolvería el candado sin que nada más avise. ROLLBACK siempre.
  "pruebas:roles-lider-editable",

  // ADR-0275: CAYLA Global (la vista de toda la empresa) nace SOLO para el Admin. Vigila el «módulo del Admin» (el Admin
  // lo conserva aunque se le quite al Líder de equipo; con Caja, en cambio, lo pierde como decidió el ADR-0253), que un
  // líder que no es Admin no la dé ni la asigne («solo das lo que ves»), que no vaya a una terminal y el candado de
  // `fn_global_cobertura`. ROLLBACK siempre.
  "pruebas:cayla-global",

  // El Observatorio, el Inicio del Admin (ADR-0322): lo de hoy por tienda cuadra con cada venta, sin las de prueba ni las
  // anuladas; categorías, prendas y equipo suman lo vendido; horas pico = promedio de 4 semanas; solo Admin.
  "pruebas:observatorio",

  // Aprobar una etiqueta propuesta (trigger `fn_etiquetas_estado_trigger`): la base exige un comentario en toda transición
  // a «aprobado» —también al reactivar una rechazada— y la pantalla de Etiquetas tiene que mandarlo (cuerpo con `notas`;
  // antes mandaba solo el estado y ninguna propuesta se podía aprobar). También fija que una propuesta pendiente no entra
  // al alta de producto ni a «Prendas» hasta aprobarse, y quién puede aprobar (líder o rol con Etiquetas). ROLLBACK siempre.
  "pruebas:etiquetas-aprobar",

  // Quién FIRMA (ADR-0162, F3): ninguna función de retail conserva `select id into … from personas where auth_user_id =
  // auth.uid()` salvo las de permiso/identidad listadas (una nueva obliga a clasificarla); 36 firman con el actor de tienda
  // y 29 con el de no-tienda; la migración se pega dos veces y aborta ante una función sin clasificar. Venta, caja, ajuste,
  // traslado, Catálogo: terminal + responsable presente → firma el responsable y queda `terminal_id`; sin responsable →
  // 42501; persona sin encabezado → firma ella. Desde 20260923230000 Compras también firma con el responsable.
  // El tope de descuento y liberar apartados siguen siendo permisos de la CUENTA. ROLLBACK siempre.
  "pruebas:actor-firma",

  // Las 30 acciones que Felipe soltó del combo «Responsable» (2026-09-29, 20260929230000): persona + clave → firma ella sin
  // asistencia; terminal + clave → la acción queda sin persona (NULL); sin clave, o con una que no está en la lista (la
  // caja, la venta) → el candado de siempre; con tabla vacía («volver») todo vuelve a exigir responsable. ROLLBACK siempre.
  "pruebas:responsable-omitido",

  // ADR-0161 act. d: las acciones que guardaban sin firmar anotan al responsable del combo (anular compra y
  // comprobante de producción, etapas, proveedores de producción, alta de insumo, terminales). ROLLBACK siempre.
  "pruebas:quien-pendientes",

  // Deriva de producción (las migraciones que producción tenía y el repo no): una sola firma de
  // registrar_movimiento, catalogo_actualizar_producto y registrar_compra (con p_token, idempotente por
  // token), el historial de «estado» no se pisa, el TRUNCATE del libro de movimientos se frena, y las
  // columnas/índices de tejidos y patrones existen. Se agrega el 2026-09-21: llevaba semanas sin correr en
  // ningún sitio y un caso quedó roto sin que nadie lo notara cuando el reparto (ADR-0139) retiró
  // `compras.ubicacion_destino_id`. Cada caso termina en ROLLBACK.
  "pruebas:deriva-produccion",

  // Contrato de venta ampliado — asesora, emisor y descuento con tope de líder (D-56/57/62/67/85/86/87,
  // ADR-0152): la llamada de hoy sin los 5 parámetros nuevos se comporta exactamente igual (mismo stock,
  // mismo comprobante reservado); fn_asesoras_de_turno nunca falla, ni sin sede_dynamic_id ni sin las
  // tablas de Dynamic; un descuento de venta sobre el tope del rol sin autorización de líder falla con
  // SQLSTATE 42501 exacto, y el mismo descuento con un líder real autorizando pasa y queda auditado;
  // p_emisor = 'alegra' no reserva comprobante; anular_venta NO libera un comprobante que ya estaba en la
  // cola de reintento de SUNAT (pendiente_reintento): pudo haber llegado (ADR-0386, opción A). Cada caso termina en ROLLBACK.
  "pruebas:venta-contrato-ampliado",

  // Catálogo ▸ Marcas ▸ Editar (20260926150000): nombre y proveedores todo o nada; un proveedor con productos (también
  // descontinuados) no se quita y el nombre del mismo guardado no cambia; una marca activa nunca queda sin proveedor;
  // el proveedor nuevo se registra en el mismo paso y no queda huérfano si el guardado falla; dos ediciones de la
  // misma marca no se pisan (sumar/quitar, no la lista final). Cada caso termina en ROLLBACK.
  "pruebas:editar-marca",

  // Catálogo ▸ Marcas ▸ Eliminar (20260926213000): una marca sin ningún producto se elimina con todos sus vínculos y los
  // proveedores quedan; con productos (activos o descontinuados) se rechaza sin llevarse nada; corregida la marca del
  // producto («Cayla 2») se elimina; la llave de `productos` frena un DELETE directo; el nombre queda libre.
  // Cada caso termina en ROLLBACK.
  "pruebas:eliminar-marca",

  // Un producto puede crearse sin marca y/o sin proveedor (20260930020000, ADR-0283, Felipe 2026-09-29): el alta acepta
  // cualquier combinación de vacíos; sigue prohibida una pareja que nadie registró (función y llave compuesta, aun con un
  // INSERT directo) y lo desactivado; editar completa lo que falta pero no borra lo guardado y deja rastro con «antes»
  // vacío; el filtro de Productos entiende el uuid nulo como «sin marca»/«sin proveedor»; la migración se pega dos veces.
  // Cada caso termina en ROLLBACK.
  "pruebas:producto-sin-marca",

  // El costo se corrige a mano solo hasta la primera compra (20260927190000, Felipe 2026-09-26): sin compras
  // (costo declarado) un líder lo corrige y el historial lo anota como 'costo_declarado', no 'costo' (Resumen no
  // la lee como «alterada»); con compras (costo oficial) ni la API ni un update directo lo pisan; el camino
  // oficial (recibir_compras, recibir_lote, cerrar_produccion) sigue anotando 'costo'; `fn_variantes_con_costo_oficial`
  // distingue las dos y `anon` no la ejecuta; sin el disparador el update directo sí pisa (el hueco existía); el
  // parche se puede pegar dos veces. Cada caso termina en ROLLBACK.
  "pruebas:costo-hasta-primera-compra",

  // La regla del «costo atípico» (20260930120000, Felipe 2026-09-30): función pura que dice si un costo por prenda merece
  // una segunda mirada (sin costo, mayor que el precio, sube a más de 2× o baja a menos de 2/3 del vigente). Fronteras
  // exactas, sin referencia no hay opinión relativa, el orden de los motivos, interna (sin execute para la API) y
  // llamable desde una SECURITY DEFINER; se puede pegar dos veces. Ninguna escritura.
  "pruebas:costo-fuera-de-banda",

  // Cerrar una orden del Taller pide confirmación si el costo por prenda es atípico (20260930121000, Felipe 2026-09-30): un
  // líder recibe `costo_atipico` con el dato en `detail` y la orden queda intacta (todo o nada: sin buenas, sin
  // movimientos, sin historial de costo); confirma con `p_confirma_costo_atipico` y el costo entra al promedio ponderado
  // exacto con constancia SIN montos en la nota; un integrante (no ve montos) recibe `costo_atipico_sin_lider` sin cifras
  // y mandar la confirmación por la API directa no cambia nada; una talla con cero buenas no cuenta; una muestra no
  // pregunta; una sola función (sin sobrecargas); `anon` no la ejecuta; se puede pegar dos veces. Cada caso termina en ROLLBACK.
  "pruebas:produccion-costo-atipico",

  // Recibir un lote sin factura pide confirmación si el costo de una línea es atípico (20260930122000, Felipe 2026-09-30): el
  // líder recibe `costo_atipico` con las líneas raras que faltan por confirmar en `detail.items` (numeradas; las normales no) y no
  // se escribe nada (sin lote, sin movimientos, sin historial); la confirmación viaja EN CADA LÍNEA (`confirma_costo`): una marca
  // parcial vuelve a preguntar solo por lo no marcado y una marca en una línea normal no hace nada; el rechazo no consume el
  // token (el reintento con las marcas es un solo lote); con las marcas entra al promedio ponderado exacto y el lote deja
  // constancia SIN montos; un integrante recibe `costo_atipico_sin_lider` sin cifras y no puede forzarlo por la API; sin costo y
  // costo 0 (obsequio) no se juzgan; la firma de seis parámetros no cambió; se puede pegar dos veces. Cada caso termina en ROLLBACK.
  "pruebas:lote-costo-atipico",

  // Registrar una factura pide confirmación si el costo de una línea es atípico (20260930123000, Felipe 2026-09-30): el costo se
  // compara con el de la variante que la línea nombra (o la mediana de las del producto, y el precio más bajo); el aviso numera
  // las líneas que faltan por confirmar y no se escribe nada (sin compra, sin líneas, sin token); la confirmación viaja EN CADA
  // LÍNEA (`confirma_costo`), sin cambiar la firma de 15 parámetros; la constancia sale SIN montos en la nota; registrar NO mueve
  // `variantes.costo`; quien registra con el módulo Facturas de compra confirma aunque no sea líder (sin el módulo, el permiso
  // de siempre); sin referencia solo vale el precio; costo 0 (obsequio) no se juzga; se puede pegar dos veces.
  "pruebas:factura-costo-atipico",

  // Recibir lo FUERA de comprobante de un envío pide confirmación si su costo es atípico (20260930124000, Felipe 2026-09-30): el
  // líder recibe `costo_atipico` con los extras raros que faltan por confirmar (numerados por su posición en `p_extras`) y no se
  // escribe nada (ni el envío, ni la línea de comprobante, ni el token); la confirmación viaja EN CADA EXTRA (`confirma_costo`),
  // sin cambiar la firma de 9 parámetros; un integrante recibe `costo_atipico_sin_lider` sin cifras y no puede forzarlo; regalo,
  // sin costo y costo 0 (obsequio) no se juzgan; las líneas DE comprobante no se vuelven a preguntar; se puede pegar dos veces.
  "pruebas:envio-costo-atipico",

  // Corregir el color y la talla de una variante que ya existe, siempre (20260929045000, ADR-0263 D-136/137/138; corre
  // después de 20260928235500, ADR-0258, y reemplaza su regla «solo sin historia»): una prenda «Sin color» con carga
  // inicial se corrige a Negro desde la ficha sin mover stock ni movimientos, con códigos nuevos y los viejos sonando en
  // la misma variante, historial firmado y versión nueva; el choque con una variante existente (activa o no) se rechaza
  // todo o nada; vendida, separada o entregada en un cambio, solo líder; el candado de la tabla (UNO solo: el del 0258 renombrado) frena el
  // update directo; «Sin color» cuenta como un color (índice nulls not distinct); fotos y temporada siguen al color;
  // sin mezcla «Sin color» + colores; fn_variantes_estado y la foto general en fn_productos; la ficha de main (la del
  // 0258) sigue guardando precio sin tocar identidad ni pedir líder. Cada caso termina en ROLLBACK.
  "pruebas:corregir-variantes",

  // Purga de un producto de prueba con sus documentos (ADR-0224 y su actualización del 2026-09-28, `scripts/purga/`): ventas
  // (nota interna, boleta de sandbox o nunca enviada), separaciones y compras con su recepción. Ensayo por defecto que no deja
  // nada (la base entera, tabla por tabla); corrida definitiva que devuelve a stock lo ajeno, deja el libro cuadrando y los
  // candados en su modo, y nunca toca un comprobante que llegó a SUNAT en producción; purgar + restaurar devuelve la base
  // idéntica; rechaza lo que no se nombró o no entiende (otra venta, separación o compra, venta anulada, cambio, proforma,
  // efectivo en caja, pago de compra, libro descuadrado). Cada caso termina en ROLLBACK.
  "pruebas:purgar-producto",

  // Productos ▸ Eliminar (20260926220000, solo Líder/Admin): un producto que nunca se movió se elimina completo (variantes,
  // códigos de barras, fotos), deja UNA fila de rastro y libera su nombre; con historia (movimientos, ventas, un pedido no
  // atendido…) se rechaza diciendo cuál y sin llevarse nada; la pieza «Monto manual» del punto de venta nunca se elimina, ni
  // sin historia; una integrante que edita el catálogo tampoco elimina; y una prueba de deriva falla si nace una tabla nueva
  // que cita productos/variantes sin clasificar. Cada caso termina en ROLLBACK.
  "pruebas:eliminar-producto",

  // Productos ▸ Eliminar con su historia (20260928230000, ADR-0252, solo Admin): un producto cuya historia es solo de stock
  // (carga, ajuste, bajada al piso, conteo, apartado cerrado, pedido no atendido) se elimina completo sin tocar a otro, el
  // libro de movimientos sigue cuadrando, deja rastro y línea en Actividad, los candados vuelven a su modo y siguen frenando;
  // el respaldo se restaura idéntico con scripts/purga/restaurar-purga.sql; un Líder que no es Admin no puede; ventas,
  // apartados abiertos, ingresos de proveedor y costos frenan hasta al Admin; y dos pruebas de deriva fallan si nace una
  // tabla que cita movimientos, o un candado de DELETE, sin clasificar. Cada caso termina en ROLLBACK.
  "pruebas:eliminar-producto-con-historia",

  // Una sola cifra de stock (20260929010000, ADR-0270): fn_existencias devuelve por talla y sede físico, dañado, apartado y
  // disponible = físico − dañado − apartado = piso + almacén + sin lugar, en TODA fila del seed; el físico cuadra con `stock`;
  // la Cuarentena y lo apartado no se ofrecen; pruebas y «Monto manual» no cuentan; una talla retirada con unidades se ve;
  // «en camino» es solo lo en_transito (no lo recibido con diferencia); sin cuenta activa, nada. Cada caso termina en ROLLBACK.
  "pruebas:fn-existencias",

  // El Catálogo y «Dónde más hay» leen la cifra única (20260929020000, ADR-0270): «Stock total» es lo disponible de la
  // red (no la suma cruda con dañadas y apartadas), la cabecera cuenta con la misma cifra que la lista, un producto de
  // prueba no enciende alertas, fn_stock_por_sede ofrece lo disponible, y la tarjeta por sede (fn_existencias_productos)
  // separa aquí / otras tiendas / Taller / en camino / tallas retiradas. Con control: las versiones viejas fallan.
  "pruebas:catalogo-cifra-unica",

  // Productos se ordena por «más recientes», «más antiguos», «más vendidos» y «menos vendidos» (20260929180000, Felipe
  // 2026-09-29): el orden se decide en la base antes de cortar la página; «vendidos» cuenta las ventas de 30 días (las de
  // hace 40 no); precio y nombre salen igual que antes; un orden desconocido se rechaza; aplicarla dos veces es inocuo.
  // Con control: sin la migración, «recientes» se rechaza.
  "pruebas:productos-orden",

  // El listado nuevo de Productos (20261002200000, ADR-0308): color, talla, precio, temporada y stock de la sede se exigen
  // a LA MISMA variante; las variantes desactivadas no cuentan; talla, familia, temporada, faltas y disponibilidad en la
  // sede y en la red; buscador sin tildes, por categoría y color, «%» literal. Con controles contra `fn_productos`.
  "pruebas:productos-listado",

  // Cuántas prendas hay en cada opción del filtro de Productos (20261002200100, ADR-0308): CADA conteo es el total que
  // trae el listado al elegir esa opción, en ocho escenas; conteo disyuntivo; ninguna opción vacía; rango de precio y tramos.
  "pruebas:productos-facetas",

  // Una talla con prendas no se retira (20260929030000, ADR-0270 decisión 13): con prendas en cualquier sede (Cuarentena
  // incluida) o en camino, pasar `variantes.activo` a false se rechaza diciendo dónde están; en 0 se retira; reactivar
  // siempre se puede; una talla ya retirada con prendas (datos viejos) no bloquea otros cambios. Con control.
  "pruebas:talla-con-prendas",

  // La función con llave que GitHub llama cada mañana en producción (20260928210000): con la llave, anon recibe
  // EXACTAMENTE la celda de deriva.sql; sin ella, 42501; nadie más crea llaves ni lee la tabla de la llave.
  "pruebas:huellas-catalogo",

  // Lo que el paso `supabase` hace con las migraciones de un PR (ADR-0251, act. 2026-10-12): aparta, aplica una por una
  // en su transacción, toma huellas y devuelve. En una base APARTE del mismo Postgres: la de las pruebas no se toca.
  "pruebas:huellas-del-pr",
];

/** `"2/4"` → `{ n: 2, de: 4 }`. Lanza si no calza: un error de tipeo en ci.yml no debe correr cero pruebas en verde. */
export function leerTanda(texto) {
  const m = /^(\d+)\/(\d+)$/.exec(texto ?? "");
  const n = Number(m?.[1]);
  const de = Number(m?.[2]);
  if (!m || de < 1 || n < 1 || n > de) throw new Error(`--tanda espera «N/T» con 1 ≤ N ≤ T, y llegó «${texto}»`);
  return { n, de };
}

function mediana(valores) {
  if (valores.length === 0) return 3;
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.floor(orden.length / 2)];
}

/**
 * Reparte `pruebas` en `tandas` grupos de duración parecida: la más larga primero, a la tanda que va más corta (empate:
 * la de número menor). Devuelve un arreglo de tandas; cada una conserva el orden de `pruebas`.
 */
export function repartir(pruebas, duraciones, tandas) {
  const porDefecto = mediana(Object.values(duraciones));
  const dur = (p) => duraciones[p] ?? porDefecto;
  const indice = new Map(pruebas.map((p, i) => [p, i]));
  const grupos = Array.from({ length: tandas }, () => ({ total: 0, pruebas: [] }));
  const porDuracion = [...pruebas].sort((a, b) => dur(b) - dur(a) || indice.get(a) - indice.get(b));
  for (const prueba of porDuracion) {
    const destino = grupos.reduce((min, g) => (g.total < min.total ? g : min));
    destino.total += dur(prueba);
    destino.pruebas.push(prueba);
  }
  return grupos.map((g) => g.pruebas.sort((a, b) => indice.get(a) - indice.get(b)));
}

function leerDuraciones() {
  return JSON.parse(readFileSync(DURACIONES, "utf8"));
}

function correr({ n, de }) {
  const duraciones = leerDuraciones();
  const mias = repartir(PRUEBAS, duraciones, de)[n - 1];
  console.log(`Tanda ${n}/${de}: ${mias.length} de ${PRUEBAS.length} pruebas.`);
  const resultados = [];
  for (const prueba of mias) {
    console.log(`::group::pnpm ${prueba}`);
    const inicio = Date.now();
    let ok = true;
    try {
      execFileSync("pnpm", [prueba], { cwd: RAIZ, stdio: "inherit" });
    } catch {
      ok = false;
    }
    const segundos = (Date.now() - inicio) / 1000;
    console.log("::endgroup::");
    // `--medir` lee esta línea del log de la corrida para recalcular el reparto.
    console.log(`⏱ ${prueba} ${segundos.toFixed(1)} ${ok ? "ok" : "falló"}`);
    if (!ok) console.log(`::error title=${prueba} falló::Busca «pnpm ${prueba}» en el log de la tanda ${n}/${de}.`);
    resultados.push({ prueba, segundos, ok });
  }
  const fallaron = resultados.filter((r) => !r.ok);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const filas = resultados.map((r) => `| ${r.ok ? "✓" : "✗"} | \`${r.prueba}\` | ${r.segundos.toFixed(1)} s |`);
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Tanda ${n}/${de}: ${resultados.length - fallaron.length}/${resultados.length} pasaron\n\n| | Prueba | Tiempo |\n|---|---|---|\n${filas.join("\n")}\n`,
    );
  }
  if (fallaron.length > 0) {
    console.error(`\n✗ Tanda ${n}/${de}: fallaron ${fallaron.length}: ${fallaron.map((r) => r.prueba).join(", ")}`);
    process.exit(1);
  }
  console.log(`\n✓ Tanda ${n}/${de}: las ${resultados.length} pruebas pasaron.`);
}

function listar(de) {
  const duraciones = leerDuraciones();
  const porDefecto = mediana(Object.values(duraciones));
  repartir(PRUEBAS, duraciones, de).forEach((tanda, i) => {
    const total = tanda.reduce((s, p) => s + (duraciones[p] ?? porDefecto), 0);
    console.log(`Tanda ${i + 1}/${de}: ${tanda.length} pruebas, ~${total} s`);
    for (const p of tanda) console.log(`  ${p}${p in duraciones ? "" : "  (sin medir)"}`);
  });
}

/** Lee del log de una corrida las líneas `⏱ <prueba> <segundos>` que deja `correr` y reescribe las duraciones. */
function medir(idCorrida) {
  const log = execFileSync("gh", ["run", "view", idCorrida, "--log"], { cwd: RAIZ, encoding: "utf8", maxBuffer: 1 << 28 });
  const medidas = {};
  for (const [, prueba, segundos] of log.matchAll(/⏱ (\S+) ([\d.]+) /g)) medidas[prueba] = Math.max(1, Math.round(Number(segundos)));
  const enLista = Object.keys(medidas).filter((p) => PRUEBAS.includes(p));
  if (enLista.length < PRUEBAS.length / 2) throw new Error(`La corrida ${idCorrida} trae ${enLista.length} medidas: ¿corrió con las tandas?`);
  const nuevas = Object.fromEntries(enLista.sort().map((p) => [p, medidas[p]]));
  writeFileSync(DURACIONES, `${JSON.stringify(nuevas, null, 2)}\n`);
  console.log(`✓ ${enLista.length} duraciones reescritas desde la corrida ${idCorrida}.`);
}

function main() {
  const args = process.argv.slice(2);
  const valor = (bandera) => args[args.indexOf(bandera) + 1];
  if (args.includes("--medir")) return medir(valor("--medir"));
  if (args.includes("--listar")) return listar(TANDAS);
  return correr(leerTanda(valor("--tanda")));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
