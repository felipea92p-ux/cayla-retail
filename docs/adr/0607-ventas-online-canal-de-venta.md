# ADR-0607 · Ventas online (TikTok): el canal es un dato del apartado y de la venta, y cada rol opera sus canales

- **Fecha:** 2026-11-03 · **Estado:** en construcción, actividad por actividad (rama `claude/modest-spence-e16da9`).
- **Pedido:** Felipe, 2026-11-03: «Se quiere empezar a hacer ventas por TikTok; siempre será un apartado, pero hay que especificar que es
  una venta online y no por tienda física. Pensamos manejarlo con un rol llamado "ventas online" para no mezclarlo con las ventas
  físicas». Decidió: **la prenda sale de la sede en la que está quien vende**; **cómo se entrega es un dato del pedido (recojo en
  tienda o envío)**; y lo imaginó como **un campo adicional al momento de apartar**, no como una pantalla aparte. Pidió el diseño más
  escalable «sin importar si es rápido de implementar» y que se investigara cómo lo hacen las grandes empresas.
- **Complementa:** ADR-0196 (Apartados), ADR-0161/0178/0306 (módulos y roles, «solo das lo que tienes»), ADR-0193 (versión del rol),
  ADR-0408 (Pedidos web), ADR-0377 (qué entra a los motores), ADR-0195 (políticas y deadlocks al pegar en producción).

## El problema primero

Una venta de TikTok es un apartado (la prenda se separa con adelanto y se entrega), pero no es una venta de tienda: si cae en la lista de
Apartados de Trujillo, la encargada la ve como suya; si cuenta en las metas de la tienda, la tienda parece vender lo que no vendió; y
si el piso la cuenta, el plan del piso se arma con una demanda que no pasó por el piso.

**Analogía CAYLA:** es la diferencia entre el cuaderno de pedidos del mostrador y el cuaderno de pedidos por teléfono. El pedido por
teléfono se despacha desde la misma bodega, pero no se anota en el mismo cuaderno ni se cuenta como lo que vendió el mostrador. Y quien
atiende el teléfono no tiene por qué ver el cuaderno del mostrador.

## Lo que hacen las grandes (investigado 2026-11-03)

Ninguna crea un módulo ni una pantalla por canal: el documento lleva su canal y el **rol** restringe por esa marca.
- **SAP:** el canal de distribución es parte del área de ventas del documento, y el objeto de autorización `V_VBAK_VKO` (organización de
  ventas, canal, división) restringe qué canales opera cada rol.
- **NetSuite:** la restricción vive en el rol y se aplica por una dimensión del dato (departamento, clase, ubicación; el «canal» es un
  segmento propio). Su advertencia: restringir sobre un dato mal marcado es riesgoso. Aquí el canal es obligatorio y nace `tienda`.
- **Odoo:** cada documento pertenece a un equipo de ventas (un canal) y cada usuario a sus equipos; las reglas de registro filtran por eso.
- **Dynamics 365 Commerce:** el canal (tienda, online, call center) es una entidad de primera clase, con permisos por grupo.
- **Shopify:** guarda el canal como dato del pedido, pero para limitar al personal ofrece ubicaciones, no canales; no es el modelo a seguir
  para el aislamiento.

## Decisiones

**DECIDÍ 1 — El canal es una marca del dato.** `retail.canales_venta (clave, nombre, es_fisico, activo)` con `tienda` y `tiktok`;
`separaciones.canal` y `ventas.canal` (default `tienda`: todo lo existente queda igual); la venta hereda el canal del apartado que la
originó. **DESCARTÉ** un `CHECK (canal in ('tienda','tiktok'))`: un canal nuevo (Instagram, WhatsApp, Shopify) sería una migración cada
vez; con la tabla es una fila.

**DECIDÍ 2 — Cada rol opera sus canales.** `retail.rol_canales (rol_id, canal)`: el Líder opera todos sin filas; todo rol que existe hoy
sigue operando `tienda` (nada cambia para nadie al aplicar la migración); un rol nuevo nace con `tienda`. `fn_canales_de_la_cuenta()` dice
qué canales opera la cuenta, y `buscar_separaciones` / `resumen_separaciones` solo muestran esos. «Ventas online» es un rol normal que
arma el líder en Roles y accesos, sección «Canales de venta»: se le quita `tienda` y se le da `tiktok`. Se guarda con
`guardar_canales_rol` (versión esperada de ADR-0193, historial en `roles_historial` y «solo das lo que tienes» de ADR-0178).
**DESCARTÉ** un módulo «Ventas online» con su entrada de menú: cada canal nuevo sería otra pantalla, otra guía y otra lista, y el menú
de Ventas ya está en su tope de 6 hijas. **DESCARTÉ** solo el campo sin permiso por canal: no daba aislamiento (quien ve Apartados vería
las dos clases).

**DECIDÍ 3 — Sin sede «Online».** La prenda sale de la sede donde está quien vende. Una ubicación falsa exigiría mover stock entre sedes
antes de vender y rompería el Observatorio, los traslados y el plan del piso.

**DECIDÍ 4 — La entrega es dato del pedido:** `modo_entrega` (`recojo` | `envio`), `direccion_envio` y `enviado_en/por`. Un apartado de
la tienda física siempre es recojo; un envío exige a dónde; «enviado» solo existe en un envío (candado `separaciones_entrega_coherente`).

**DECIDÍ 5 — Una puerta que envuelve, no un parche.** `separar_prendas_online` pide operar el canal, valida entrega y llama a
`separar_prendas` tal cual (stock, adelanto mínimo, descuentos, caja, comprobante del anticipo), en una sola transacción. **DESCARTÉ**
parchar `separar_prendas` y `entregar_separacion` (ya reemplazadas diez veces por anclas): la herencia del canal a la venta va en un
disparador sobre `separaciones.venta_id`.

**DECIDÍ 6 — Qué cuenta lo vendido online (2026-11-03; la recomendación quedó como pendiente de Felipe y se aplicó, ver abajo).**
Una venta de TikTok es una venta real, pero no pasó por el piso. Entonces:
- **Los motores que deciden qué colgar solo cuentan la tienda:** `fn_piso_plan_lectura`, `fn_demanda_sede` y `fn_motor_demanda_preparacion` filtran
  `ventas.canal = 'tienda'` (`20261104032000`). Así «colgar otra igual» y los pedidos al Taller no responden a una demanda que el piso no tuvo.
- **Análisis y el plan de compra SÍ cuentan lo online** (`fn_analisis_sede`, `fn_unidades_vendidas`, `fn_plan_compra`): es demanda real de CAYLA y debe
  verse y comprarse. No se parte por canal todavía: la marca `ventas.canal` ya está para cuando Felipe quiera esa columna.
- **Frescura (`fn_frescura_sede`) tampoco se toca:** mide por el libro de movimientos cuánto del stock bajado al piso salió; una prenda del piso
  vendida online salió igual, y dejarla fuera la marcaría «no se mueve» habiéndose vendido.
- **Caja, comprobantes, Ventas, Finanzas y Resumen** cuentan todo (ya era así).
**DESCARTÉ** que Análisis y el plan de compra ignoren lo online como hacen con CLAURE (ADR-0560): lo de CLAURE es de otro dueño; lo de TikTok es de CAYLA.
**DESCARTÉ** una función `fn_canal_entra_a_motores(canal)`: con `security definer` es lenta por llamada (medido en Tráfico) y hoy el único canal físico es
`tienda`; si algún día hay otro, es una migración con las tres líneas de arriba.

## Se rompe si / límites conocidos

- Se agrega un canal físico (`es_fisico`): el candado «tienda ⇒ recojo» y `separar_prendas_online` asumen que el único físico es `tienda`.
- Duplicar un rol (`crear_rol`) no copia sus canales: el rol nuevo nace con `tienda`.
- Quien no opera un canal tampoco lo ve en la lista de Caja (`buscar_separaciones` es la misma lectura). Un adelanto de TikTok pagado en
  efectivo y guardado en el cajón de una tienda no lo vería una cajera que no opera TikTok.
- **El candado al actuar por id vive en la tabla, no en cada función.** `fn_separacion_exige_su_canal` (antes de insertar o cambiar una
  `separaciones`) rechaza a quien no opera el canal del apartado: entregar, abonar, aplazar, liberar, devolver y editar pasan todas por
  ahí sin parcharlas. Pasan sin sesión (cron) y el vencimiento solo (`liberada_por` vacío), que lo dispara cualquiera que abra Apartados.
  `separar_prendas_online` le dice el canal al candado con una variable de la transacción (`retail.canal_nuevo`), así quien solo opera
  TikTok no choca con «no operas la tienda» a mitad de camino.
- Las lecturas por id (el detalle de un apartado, su ticket) no filtran por canal: quien tuviera un id ajeno podría leer ese apartado.
  El id es un uuid que no sale de las listas filtradas; si hiciera falta, se cierra en la actividad de reportes.

## Fuera de esta fase

El dinero de TikTok (cuándo liquida, comisión) se registra con los medios de pago que ya existen; un medio y una conciliación propios
son una fase 2. Tracking de agencias de envío: no se integra; solo «Marcar enviado» con guía o agencia en texto.
