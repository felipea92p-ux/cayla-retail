# ADR-0487 · El gasto fijo dice cuándo VENCE y cuántos días antes se paga (no cuándo «llega»)

- **Fecha:** 2026-10-23 · **Estado:** paso 1 (los textos) construido, sin base de por medio; paso 2 (`dias_antes`) construido y probado en una base privada
  (`activos_y_gastos_fijos` 76 ✓, `flujo_caja` 82 ✓ y las pruebas vecinas en verde); **la migración `20261023173000` está sin pegar en producción**.
  ADR-0487 y la migración reservados con `pnpm reservar`. Rama `claude/missing-expiration-date-0cee47`.
- **Decide:** Felipe, 2026-10-23, mirando «Nuevo gasto fijo»: «No hay una fecha de vencimiento»; y al ofrecerle opciones: «los recibos son mensuales por lo
  general, entender cuándo llega no sé si tiene sentido, más que todo la fecha de vencimiento y pagar unos días antes».
- **Toca:** ADR-0440 (nació como «Cuándo llega»: sigue en pie la mecánica, cambia lo que significa) y ADR-0452 (la ficha; su «Vence el contrato» es otra cosa y no cambia).

## El problema primero

La hoja de un gasto fijo preguntaba «Cuándo llega» y de ahí salía todo: el día en que «falta» (el siguiente), la fecha en que el Flujo de caja proyecta la salida
de plata y el «se esperaba el 5 oct» del Resumen. Pero **nadie sabe cuándo le llega un recibo**: lo que trae impreso es cuándo VENCE. Medido en producción el
2026-10-23 (solo lectura):

- 25 fijos activos; **de los 16 de servicios (luz, agua, internet, celulares), 14 dicen «la quincena»** y ninguno trae un día concreto. Parece un «no sé» más que un dato:
  quien carga el fijo mira el recibo y ahí lee un «vence», no un «llegó». El alquiler es «fin de mes» y Claude Max, el día que se cobra la tarjeta: ninguno es «llegada».
- Ninguno de los 6 gastos de servicios ya registrados guardó una fecha de vencimiento, y 0 de 25 fichas tienen «Vence el contrato».
- Lo que vale para el negocio es **hasta cuándo pagar y cuántos días antes conviene hacerlo**. Pagar antes no se trata de un corte inmediato: lo que se encontró es que
  la luz se corta con dos recibos impagos (El Peruano), el agua con dos facturaciones (Trámites Perú; las fuentes se contradicen) y de telefonía **no se pudo confirmar**
  el plazo vigente (norma de Osiptel 172-2022-CD). Se paga antes por la mora, porque un canal de pago puede fallar (el BCP pidió pagar con anticipación cuando suspendió
  los pagos de servicios en 2024) y porque olvidarlo sale caro. «3 a 5 días antes» es una regla práctica de guías de finanzas, no una norma.

## Decisión

Un gasto fijo tiene UNA fecha —cuándo vence (o se cobra)— y un «pagar N días antes».

1. **Paso 1, sin migración.** La fecha que ya existe (`gastos_fijos.momento` + `dia_del_mes`, y `fn_fecha_esperada_fijo`) pasa a **leerse como el vencimiento**: mismas columnas,
   mismas funciones, mismo `estado` («registrado», «por_llegar», «falta»). Cambian los textos: «Cuándo vence» y «Día del mes en que vence» en el modal; «Vence» en la lista de
   Configuración; «Faltan: ya vencieron y no están registrados»; «venció el 5 oct» en la bandeja y en el Resumen. La ayuda de «La quincena» pide elegirla **solo si el recibo lo dice**,
   no por no saber el día. `textoCuandoLlega` pasa a `textoCuandoVence`. «Llega con» (el tipo de comprobante) no cambia: habla del papel, no de la fecha.
2. **Paso 2, `20261023173000`.** `gastos_fijos.dias_antes smallint not null default 0 check (0..30)`. La fecha de pago es `fecha_esperada - dias_antes`.
   - `fn_gastos_fijos_mes` devuelve, al final, `dias_antes`, `fecha_pago` y `toca_pagar` (sin registrar, sin vencer y ya llegó su fecha de pago). El `estado` no cambia: `toca_pagar`
     es una pista aparte para no tocar a quien lee el estado (Resumen, Cierre, Confianza).
   - `guardar_gasto_fijo` gana un 12.º argumento opcional `p_dias_antes` (nulo = no toca); se guarda en la misma llamada que el fijo.
   - El Flujo de caja proyecta la salida en `fecha_pago` (reemplazo anclado sobre `fn_flujo_caja_proyeccion`, un solo texto que aparece una vez en producción) y pide también el
     mes siguiente cuando su fecha de pago cae dentro del horizonte (`date_trunc('month', v_fin + 30)`): un fijo que vence el 1 de noviembre y se paga 5 días antes sale en octubre.
   - Web: «¿Cuántos días antes lo pagas?» en el modal, con «Se paga desde el día 23»; un fijo nuevo parte de lo que sugiere su categoría (3 en luz, agua, internet y telefonía; 0 en lo
     demás, desde la misma tabla `SUGERENCIAS_POR_CATEGORIA` de ADR-0452) hasta que la persona escribe su número; «Toca pagar» y «pagar desde el 23 oct» en Fijos del mes; «se paga 3 días
     antes» bajo «Vence» en Configuración. Siempre manda `p_dias_antes` explícito (también el 0, que borra un 3 anterior) y solo si la base ya devuelve `dias_antes`.

Con `dias_antes = 0` todo queda como estaba: lo ya cargado no cambia.

## Lo que se descartó

- **Dos fechas (llega + vence).** Cada fijo cargaría una que nadie sabe y podrían contradecirse (vence antes de llegar). La de «llega» no sirve para nada que el vencimiento no haga mejor.
- **«Vence = llega + N días»** (el esquema de factura + plazo de un ERP de proveedores): sirve cuando uno fija la fecha de la factura; en un recibo la fecha impresa ES la del vencimiento
  y el plazo cambia con cada empresa.
- **Un estado nuevo `toca_pagar` en `estado`.** Obligaba a tocar a todo lector de ese estado (Resumen, Cierre, Confianza, el contador de la pestaña). Una columna aparte no rompe a nadie.
- **Reescribir `fn_flujo_caja_proyeccion` entera.** La han parchado varias migraciones y la viva puede no ser la del archivo; se ancla.

## Se rompe si

El vencimiento real se corre de mes a mes (los ciclos de facturación de una operadora o de la luz se mueven unos días) y nadie actualiza la plantilla: «Toca pagar» sonaría un día tarde.
Por eso la fecha real de cada recibo se anota al registrarlo (en Por pagar, a crédito, ya se pide el «vence»). Que el fijo aprenda del último recibo queda para una segunda vuelta.
Y si los 14 «la quincena» de hoy no se corrigen con los días reales de los recibos, la pantalla queda precisa sobre datos inventados.

## Cómo se pega en producción

`20261023173000_gasto_fijo_pagar_dias_antes.sql`, una sola parte, tal cual: sin políticas ni `drop trigger` (ADR-0195), `set lock_timeout = '3s'`, idempotente. Aborta con un mensaje si
`fn_gastos_fijos_mes`, `guardar_gasto_fijo` o el texto ancla del Flujo no son los que conoce (producción el 2026-10-23 coincide con el repo: huellas `md5` de `fn_gastos_fijos_mes`,
`guardar_gasto_fijo` y `fn_fecha_esperada_fijo` iguales, y el ancla del Flujo aparece una vez). Termina con un `select` que dice «QUEDÓ BIEN». La web se publica antes sin problema.
Después: `pnpm datos:generar:produccion` (el diccionario) y mirar la huella de las tres funciones.

## Lo que NO se hizo

- **Cargar los días reales de los 14 recibos** (lo hace quien tenga los recibos a la mano: unos 20 minutos, desde Configuración ▸ Gastos fijos) y confirmar si «Celular Tienda TRU» (S/ 19.90, TRU)
  es el mismo fijo que «Telefonía Bitel 901728230», cuyo número ya trae su ficha: guardarlo dos veces suma dos veces en el Flujo.
- `/chaos`, `/formidable`, `tema:auditar` y la guía de foco del modal (`GastoFijoModal` sigue `PENDIENTE` en `lib/guia-de-foco-pantallas.ts`): no hay una pila de Supabase con sesión en esta máquina. El modal se vio
  en el navegador con la base simulada (campo, valor automático, payload de 3 y de 0, lista y vista sin la columna).
- Un aviso de «Toca pagar» en el Inicio o en la bandeja de «Falta revisar».
- Renombrar «Llega con» a «Comprobante» (hoy convive con «Vence» en la lista y puede leerse como la fecha).
