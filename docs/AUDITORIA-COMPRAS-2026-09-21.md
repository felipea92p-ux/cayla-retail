# Auditoría del módulo de Compras — 2026-09-21

> Método: **le pregunté a la base de producción**, no a los ADR ni al BACKLOG (proyecto
> `vovjyyiafkxteijimpuy`, schema `retail`, solo lectura). Más `pnpm typecheck`, `pnpm datos:comparar`,
> las 10 suites de reglas del módulo, 4 suites SQL contra el Postgres local, y lectura línea por línea
> de 8 cuerpos de función de producción y de los caminos de dinero de 4 pantallas.
> Rama local `main` en `b6b85206`; `origin/main` va 13 commits adelante y **ninguno toca Compras**.

## Veredicto

La base defiende bien sus invariantes y, en los caminos de dinero que leí, **las cuentas están bien**.
El contrato con producción está limpio: 47 funciones, **una sola firma cada una**, cero sobrecargas, y
ninguna de las 15 pantallas que `datos:comparar` marca rotas es de Compras.

Pero **el módulo nunca operó**: en producción hay **0 comprobantes, 0 ítems, 0 pagos, 0 notas de crédito,
0 cierres y 0 adjuntos** (76 proveedores cargados y nada más). Todo lo verificado es código y pruebas,
no papel real. Y la red de seguridad que debería avisar de una regresión **hoy grita en falso y nadie
la escucha**: la suite que cubre el flujo más intrincado del módulo no tiene comando ni corre en CI.

---

## Lo que está bien (verificado, no supuesto)

| Qué | Cómo lo verifiqué |
|---|---|
| Las **47 RPC** del módulo están vivas en producción, **una sola firma cada una** | `pg_proc` + `pg_get_function_identity_arguments` |
| **10 tablas** con RLS y **solo política de SELECT**: nadie escribe directo, todo pasa por RPC `security definer` | `pg_policy` |
| **Candado del dinero (ADR-0126)**: 8 lecturas exigen `fn_puede_ver_dinero_de_compras()`; H4 quedó resuelto | grep sobre `pg_get_functiondef` + la prueba que lo afirma |
| **Estados imposibles cerrados abajo**: `compras_no_sobrepagada` (`pagado + notas_credito <= total`), `compras_no_sobrerecibida` (`recibido + cerrado <= facturado`), `total = subtotal + igv`, `aplicado <= monto`, reparto que suma lo facturado | `pg_constraint` |
| **Idempotencia real** en `registrar_compra`, `recibir_envio` y los tres pagos: el reintento con el mismo token devuelve el éxito original sin volver a escribir | cuerpos leídos; en `registrar_pago_compras` la comprobación del token va **antes** de mirar el saldo a favor, para que un reintento no falle por un crédito ya consumido |
| **`anular_compra` se niega en los cuatro casos** que dejarían stock o dinero sin respaldo: pagos, mercadería recibida, notas de crédito, líneas cerradas | cuerpo leído |
| **Las tres vistas tienen `security_invoker=true`**: leer por `compras_resumen` no puentea el RLS de `compras` | `pg_class.reloptions` |
| El bucket `retail-compras-adjuntos` existe con el mismo tope (10 MB) y los mismos MIME que el `check` de la tabla | `storage.buckets` |
| **1.415+ pruebas**: 286 de reglas del módulo, 145 de indicadores, 29 de recibir-envío; `typecheck` limpio | corridas en esta sesión |

En las pantallas leí el cálculo de totales, los requisitos y el envío de `CompraFormV2`, el camino completo
de `PagoJuntosModal`, el pago individual de `CompraDetallePanel` y el envío de `RecepcionEnvio`. **No
encontré ningún error de cuenta.** El reparto entre tiendas se exige en la pantalla (`requisitosDeCompra`)
y otra vez en la base; los medios de pago no dejan registrar si no suman; la recepción es todo-o-nada y lo
dice («No se registró nada: tu conteo sigue aquí para corregirlo»).

---

## Huecos, por gravedad

### 1 · Cualquiera puede subir archivos al bucket de facturas
`storage.objects` → política `retail_compras_adjuntos_insert` con check **solo**
`bucket_id = 'retail-compras-adjuntos'`. La lectura sí está cerrada con `fn_puede_ver_dinero_de_compras()`;
el INSERT no tiene candado. Como producción de retail vive dentro del proyecto de Dynamic, cualquiera de
sus ~30 sesiones con login puede depositar archivos ahí. La fila en `compra_adjuntos` sí la controla
`registrar_adjunto_compra`, pero el objeto no — y el propio código ya sabe que un objeto sin fila queda
«invisible para el sistema» (`apps/web/lib/adjuntos-compra.ts:79`). Se cierra con una línea de SQL.

### 2 · `retail.proveedores` la lee cualquier sesión iniciada
Política `proveedores_select` = `auth.role() = 'authenticated'`. Ahí viven `cci`, `celular_billetera`,
`titular_cuenta`, `banco` y `cuenta_bancaria` (ADR-0134). Ya estaba anotado como pendiente; sigue vivo.

### 3 · Las pruebas del módulo fallan por suciedad, y nadie lo está mirando
`compras_faltantes_y_pago_por_lote` da **96/112** y `pnpm pruebas:pago-por-lote-medios` **24/27**.
**Las 19 fallas difieren por exactamente +S/ 200.** Verificado contra la base local:

```
Textiles Andina SAC | nota_credito | 200.00 | 2026-09-19 |
```

Es un fixture de otra sesión **que nunca se neutralizó** — los otros dos créditos de esa tabla sí tienen
su reembolso compensatorio («Neutraliza fixture de prueba de Por pagar»). **No hay ningún bug de código
detrás de esas 19 fallas.** Se arregla registrando un reembolso de S/ 200 a ese proveedor; nunca
borrando, que es libro inmutable.

### 4 · La suite que cubre el flujo más intrincado no la corre nadie
`scripts/pruebas/compras_faltantes_y_pago_por_lote.mjs` —112 casos: faltante → cierre → nota de crédito
→ saldo a favor → reembolso → pago por lote— **no tiene comando en `package.json` y no está en el CI**.
Solo corre si alguien adivina el `node scripts/...`. El BACKLOG la cita como «112 en verde»; hoy da 96 y
nadie se enteró. (`etiquetar_variantes.mjs` está igual de huérfano, ajeno a este módulo.)

Y súmale que `compras-indicadores` (145 casos) y `recibir-envio` (29) tampoco están en CI, y que el job
`pruebas-postgres` lleva `continue-on-error: true`. **La red de seguridad de Compras avisa a un cuarto vacío.**

### 5 · No hay forma de corregir un comprobante
No existe `editar_compra` ni equivalente (verificado en producción y en el repo). Y `anular_compra` se
niega, con razón, en cuanto hay un pago o una recepción. Consecuencia: un error en la serie, el número,
la fecha o un costo, descubierto después del primer pago, **queda así para siempre**. Con 0 comprobantes
esto cuesta una decisión; con 200 facturas cuesta una migración de datos.

### 6 · No hay forma de revertir un pago
`compra_pagos` es append-only y ninguna RPC anula una fila. Compensarlo con otro pago lo impide
`compras_no_sobrepagada`. Hoy la única salida es SQL a mano en producción.

### 7 · `recibir_y_cerrar_compras` quedó atrás en ADR-0139
Ninguna pantalla la llama (`datos:comparar` ya la listaba entre las funciones sin pantalla). Además llama
a `cerrar_linea_compra` con **4 argumentos**, sin `p_ubicacion_id`; para una línea repartida entre tiendas
eso levanta «Esta línea está repartida entre N tiendas: indica en cuál se cierra el faltante». Es una
función muerta que, si alguien la cableara hoy, no sabría cerrar el faltante de un comprobante repartido
— justo el caso que ADR-0139 introdujo.

### 8 · Dos cifras vecinas que no reconcilian
En `resumen_compras_extra`, **«Compras del mes» no descuenta las notas de crédito** (`sum(c.total)`) pero
**«IGV del mes» sí** (`v_igv_facturas - v_igv_notas`). Van una al lado de la otra en la misma franja de
`/compras`. Con una nota de crédito de por medio, el IGV deja de ser el 18 % de lo que la tarjeta vecina
dice que se compró, y quien mire va a pensar que una de las dos está mal.

### 9 · «Completar costo» sigue sin existir
`/inventario/recibir` mide «Sin costo registrado · afecta el margen» y **no ofrece ninguna acción para
arreglarlo**: no hay RPC que edite el costo de un lote ya ingresado. Un indicador que señala un problema
que el sistema no deja resolver. Es el hueco (b) del ADR-0111, abierto desde el 2026-09-18.

### 10 · No hay pantalla para registrar un gasto
`registrar_gasto` existe en producción con 11 parámetros y `retail.gastos` tiene 0 filas, pero **ninguna
pantalla la llama**: `RegistrarGastoModal.tsx` ya no existe en el repo. De paso:
`docs/datos/DIAGNOSTICO-PANTALLAS-ROTAS.md` afirma que «Registrar un gasto falla cada vez en las tres
tiendas» — ese documento hoy desinforma y conviene marcarlo.

### 11 · Lo que el modelo no contempla (decisiones, no bugs)
Sin **moneda ni tipo de cambio** (toda compra es en soles), sin **detracción / retención / percepción**,
sin **RUC del emisor guardado** en `compras`, y sin **orden de compra** previa a la factura.

### 12 · Menores
- `apps/web/components/NotaCreditoCierre.tsx` quedó huérfano tras ADR-0142 (nadie lo importa).
- `scripts/pruebas/compras_indicadores.mjs:2119` tiene un nombre que describe el bug viejo (H5) y no lo
  que la prueba afirma: hace creer que hay un defecto de reloj abierto cuando verifica que está corregido.
- Sobran `INSERT/UPDATE/DELETE` a `authenticated` sobre `compras`, `compra_items`, `compra_pagos`,
  `compra_adjuntos`, `proveedores` y dos vistas. Hoy son inertes (RLS sin política de escritura y las
  vistas con `security_invoker=true`), pero es cinturón sin tirantes.

---

## Lo que NO verifiqué

- **Unas 4.000 líneas sin leer**: `RecepcionEnvio.tsx` completo (1.811), `NotasCreditoPanel` (686),
  `RegistrarNotaCreditoModal` (682), `ProveedorModal` (553). `notas-credito-reglas.ts` (711) no lo leí,
  pero tiene 25 KB de pruebas propias en verde.
- **Nada con clics reales**: no inicio sesión ni escribo contraseñas en el navegador.
- **Nada con un colaborador de sede** (el candado de rol se verificó en la base, no en pantalla).
- `datos:comparar` deja **30 llamadas «no analizadas»** y 11 son de Compras — entre ellas
  `registrar_compra`, los tres pagos, `recibir_lote`, `recibir_envio` y `registrar_nota_credito_compra`.
  Las escrituras más peligrosas del módulo están fuera de la red que vigila el contrato.

---

## Propuesta

En este orden:

1. **Cerrar 1 y 2** (SQL corto, es fuga real).
2. **Limpiar el S/ 200** con un reembolso, **cablear la suite huérfana** a `pnpm pruebas:compras-faltantes`
   y meter las tres suites que faltan al CI.
3. **Escribir `pruebas:compras-punta-a-punta`**, como la que Producción ya tiene: proveedor → comprobante
   repartido → recepción parcial en dos tiendas → faltante → nota de crédito → saldo a favor → pago en
   lote con dos medios → exportar. Es lo que convierte «creo que no hay errores» en «la base lo demuestra
   en cada push».
4. **Decidir 5 y 6 antes de la primera factura real** (después cuestan datos).
5. El resto puede esperar a que el módulo tenga uso.
