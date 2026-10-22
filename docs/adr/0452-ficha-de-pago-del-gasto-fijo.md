# ADR-0452 · La ficha de pago del gasto fijo: a quién y cómo se paga, para que otra persona pueda hacerlo

- **Fecha:** 2026-10-18 · **Estado:** construido y probado en local (Postgres 16, `pnpm pruebas:gasto-fijo-ficha` y las pruebas vecinas);
  **las dos migraciones NO están en producción**. Rama `claude/wizardly-ride-1dp1p2`.
- **Números provisionales:** ADR `0452` y migraciones `20261018003000` y `20261018004000`. La nube de esta sesión no pudo crear las etiquetas
  de `pnpm reservar` (el remoto devolvió 403 a la creación de etiquetas), así que se eligieron por encima de todo lo reservado (ADR 0450,
  migración `20261018001000`) dejando un hueco. **Antes del PR, `/abrir-pr` los revisa:** si chocan, se renombran.
- **Pedido:** Felipe, 2026-10-18, sobre el modal «Nuevo gasto fijo»: el «Proveedor» listaba la mercadería («eso no tiene nada que ver»); debería
  decir el propietario, dónde se transfiere, el código de suministro, etc. Fondo: «si mañana estoy muerto, ¿cómo otro admin gestiona?».
- **Corrige a:** ADR-0440, que partió de reutilizar al proveedor de mercadería y mostrar su teléfono y cuenta. Esa parte queda reemplazada.
  La del «Cuándo llega» (primera semana, quincena, fin de mes) sigue en pie.

## El problema primero

A quién se le paga un alquiler es un propietario; la luz, una empresa con un código de suministro. Ninguno es un proveedor de mercadería: en
producción hay 95 proveedores activos y solo 3 con el rubro «Gastos» (2026-10-18). Y lo que otra persona necesita para pagar mañana —el
nombre, el documento, la cuenta a la que se transfiere, el código del recibo, cuándo vence el contrato— no estaba en ningún lado: vivía en la
cabeza de quien cargó el fijo.

## Decisión

1. **Una ficha de pago por gasto fijo**, tabla aparte 1:1 (`gastos_fijos_ficha`), todo opcional para completarla de a poco: a quién se le paga
   (propietario o empresa, documento DNI/RUC/CE, teléfono, correo), cómo (transferencia, Yape o Plin, depósito, efectivo, se paga el recibo,
   débito automático) con banco, cuenta, CCI, Yape o Plin y a nombre de quién; cómo reconocerlo (código de suministro, contrato o cliente; cómo
   llega el recibo; cuándo vence el contrato) y notas para quien herede. La pantalla pide solo los campos de la cuenta que la forma de pago
   necesita, y nunca esconde uno ya cargado.
2. **Datos bancarios solo para líder y admin** (Felipe, 2026-10-18; más cerrado que en proveedores). Las seis columnas bancarias las lee y las
   escribe `fn_es_lider()`; el resto de la ficha, quien ve el fijo (`fn_gastos_puede`). Quien no es líder ve el resto, la cuenta sale vacía y
   «tiene cuenta» queda desconocido: no se acusa que «falta» lo que no se puede ver.
3. **Cada cambio de a quién y cómo se paga deja rastro** (`gastos_fijos_ficha_cambios`: antes, después, quién, cuándo), escrito por un
   disparador en la misma transacción. Cambiar la cuenta del alquiler es el cambio que más conviene a un fraude. La pantalla lo muestra al
   líder («Últimos cambios») con los números enmascarados.
4. **Se guarda en una sola llamada**: `guardar_gasto_fijo` gana el 11.º argumento `p_ficha jsonb` (nulo = no toca la ficha; llamadas de 9 o 10
   argumentos siguen igual). La web manda **solo las llaves que cambió la persona**; `null` borra. Un dato mal escrito o un dato bancario de
   quien no es líder aborta TODO (el fijo tampoco se guarda). La base normaliza (CCI y celular solo números, sin +51; documento sin espacios).
5. **El «Proveedor» de mercadería se va del fijo.** Queda «Quién emite el comprobante», solo si llega con factura, boleta o recibo, opcional, y
   solo con los proveedores de gastos (rubro «Gastos»). Se mantiene porque `registrar_gasto` exige un proveedor real para un comprobante (Por
   pagar, IGV, serie-número no repetido). **Se siembran los 9 principales** (luz y agua de Lima, Trujillo y Arequipa; Movistar y Claro) en
   `20261018004000`, con RUC tomado de fuentes públicas (ver su encabezado: hay que mirarlos en la Consulta RUC antes de pegar). El resto lo agrega
   Felipe de a poco: «¿No está? Súmalo» de Registrar gasto los crea con ese rubro.
6. **Se ve donde se paga:** al registrar el gasto de un fijo, la hoja muestra a quién y cómo se le paga (con «Copiar» en teléfono, código y cuenta,
   la misma pieza de Por pagar); la lista de Configuración dice «Se le paga a», avisa «N sin completar» y un contrato que vence en 60 días.

## Lo que se descartó

- **Columnas en `gastos_fijos`:** lo leen Flujo, Resumen, Cierre y Presupuesto y ninguno necesita una cuenta.
- **Un directorio compartido de «beneficiarios»:** hoy cada fijo tiene el suyo. Se revisa si un mismo propietario repite en muchos fijos y la
  cuenta se desactualiza en uno.
- **Meter al propietario en `proveedores`:** ensuciaría Recibir mercadería, Órdenes de compra y Análisis (todos leen esa tabla) y obligaría a
  filtrar por tipo en decenas de lecturas. Se reutilizó solo su regla de formato (CCI, Yape).
- **La regla bancaria de proveedores** (quien ve Proveedores, Por pagar o Cuentas y dinero): Felipe pidió solo líder y admin para esto.
- **Sumar proveedores desde el modal del fijo:** duplicaría la comprobación de «¿no será uno que ya tienes?»; se suma al registrar el gasto.

## Cómo se pega en producción

En este orden, cada una sola y tal cual (traen `retail.` y su `set search_path`): `20261017190000` (ADR-0440; **ya pasa sus pruebas en local**),
`20261018003000` (una sola parte: tabla nueva, historial, disparador con `create or replace trigger`, funciones; sin políticas ni `drop trigger`)
y `20261018004000` (solo datos de `proveedores`). Cada una termina con un `select` que dice «QUEDÓ BIEN». La web se publica antes sin problema: antes
de pegar la migración, el modal es el de siempre (la hoja pregunta a la base si ya tiene la ficha). Después: `pnpm datos:generar:produccion`.

## Lo que NO se hizo

- **Aviso en el Inicio** cuando alguien cambia la cuenta de un fijo (el de proveedores existe, `fn_cuentas_bancarias_cambiadas`): queda el historial.
- **Probar en el navegador con login real**: el entorno no tiene Supabase Auth. Se fotografió el modal con respuestas simuladas (escritorio, 375 px, claro
  y oscuro); `tema:auditar`, `guias:recorrer` y `/chaos` quedan para correr en local con la base y la sesión reales.
- **Claves y contraseñas**: la ficha no las pide y lo dice; un texto libre es de quien lo escribe.

## Actualización 2026-10-21: la otra mitad de la regla — «Nueva orden de compra» no ofrece a quien es solo de gastos

**El caso real (Felipe, 2026-10-21):** el combo «Proveedor» de Nueva orden de compra le sugería Luz del Sur, Hidrandina, Pluz Energía e Integratel: los de servicios que sembró
`20261018004000`. Esta decisión separó la mercadería de los gastos **solo en el combo de Gastos**; el de pedir mercadería seguía leyendo todos los proveedores activos, así que cada
proveedor de servicios que se sumaba aparecía también ahí.

**La regla (una sola, en `lib/proveedores-reglas.ts`):** un proveedor es **solo de gastos** si tiene rubros y **todos** son «Gastos» (`esSoloDeGastos`). Sin rubros —casi todo el directorio
viejo— es mercadería. El que vende algo y además cobra gastos («Telas» y «Gastos») sigue siendo de mercadería: se le pide y se le paga. `proveedoresParaPedir` devuelve la lista sin los
solo-de-gastos y **conserva al que ya está elegido** en una orden que se edita. Es la mitad que faltaba de `esProveedorDeGasto` (que mira «algún rubro es Gastos» y alimenta el combo de Gastos).

**Qué se hizo:** Nueva y Editar orden de compra usan `proveedoresParaPedir`. La orden NO deja de aceptar a cualquier proveedor activo (la base no cambió: `crear_orden_compra` valida «activo»);
solo se dejó de OFRECER lo que casi seguro es un error. El «+ Registrar proveedor» de esa pantalla es el de la entrega 1 de Nueva orden (`RegistrarProveedorOrden`, función `registrar_proveedor_de_orden`, por el módulo
Órdenes de compra: quien puede crear la orden puede registrar a su proveedor); este cambio solo le pasa el directorio COMPLETO (también los de gastos) para que avise de un RUC o un nombre repetido.
Primero se hizo una alta propia con `ProveedorModal` (exigía el módulo Proveedores); al traer main la de la entrega 1 se **descartó**: la otra tiene el permiso correcto para esa pantalla.

**Segunda tanda (Felipe, el mismo 2026-10-21, al ver la auditoría):** el mismo filtro (`proveedoresParaPedir`) se aplicó a las otras cinco pantallas donde se elige a quién se le compra o se le recibe
mercadería, y el «+ Agregar proveedor» donde faltaba (Registrar factura y Llegó sin aviso, con el módulo Proveedores):

| Pantalla | Qué cambió |
|---|---|
| Registrar factura de proveedor | filtra (salvo el que llega por `?prov=`) y suma «+ Agregar proveedor» al combo; sin el módulo Proveedores, el pie dice a quién pedírselo (el enlace a Proveedores no llevaba a ningún lado) |
| Recibir ▸ Llegó mercadería | filtra; su alta de siempre sigue igual (con el directorio completo para avisar de repetidos y sin el botón «Gastos») |
| Recibir ▸ Llegó sin aviso | filtra y suma «¿No está? + Agregar proveedor» (con lo buscado de punto de partida) |
| Alta/edición de producto y conteo (`getCatalogoMarcas`) | filtra, salvo quien ya trae una marca |
| Marcas ▸ «¿Quién la trae?» | filtra con la misma excepción; los nombres de los ya vinculados salen de todos los activos |

Una sola pieza para el alta de las dos pantallas que no tenían (`components/useAltaDeProveedor.tsx`: el mismo `ProveedorModal` de Proveedores, fuera del `<form>`, con el módulo Proveedores) y una sola regla de conservar: `proveedoresParaPedir(lista, conservar)` acepta un id o varios.
La excepción de catálogo es de fondo: **quien ya trae una marca es de mercadería por definición**, aunque tenga además el rubro «Gastos»; ocultarlo dejaría una pareja marca-proveedor a medias. Basta mirar los vínculos (`marca_proveedores`): la llave compuesta de `productos` obliga a que todo producto con marca y proveedor tenga el suyo, y así la regla no depende de una ventana de productos ni cambia con el tiempo; al editar un producto, su proveedor actual se conserva aparte.
`getProveedoresActivos` ganó el campo `rubros` (aditivo: sus otros llamadores no lo usan). `lib/proveedores-solo-gastos-pantallas.test.ts` vigila que ninguna de las seis pantallas pierda el filtro y que el alta nunca se dibuje dentro de un `<form>`.

**Se dejan como están a propósito** (ahí la luz sí es legítima o el cambio no es de este ADR): Por pagar (la deuda de la luz a crédito es una factura de gasto), Finanzas ▸ Gastos y el gasto rápido de Caja, Gastos fijos, Notas de crédito, los filtros de documentos, el directorio de Proveedores,
y dos pantallas de mercadería que Felipe NO incluyó: **Recibir contra factura** («Proveedor que la mandó») y el **cierre de un envío** (`CerrarEnvio`: paso obligatorio sin «Agregar proveedor»; filtrar ahí exige sumar la alta primero).
`getProveedoresActivos` no cambia de contrato.
