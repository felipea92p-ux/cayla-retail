# ADR-0440 · Gasto fijo que llega «la primera semana», «en la quincena» o «a fin de mes», y el proveedor a la vista

- **Fecha:** 2026-10-17 · **Estado:** escrito, **la migración `20261017190000` NO está probada ni en producción**. La nube de esta sesión no tenía
  Docker ni Postgres, así que ni la migración ni `pnpm pruebas:activos-y-fijos` corrieron; las pruebas SQL nuevas están escritas y sin ejecutar.
  Las pruebas de la web (vitest) sí corren. Rama `claude/cayla-config-data-errors-35e9da-duw4wu`.
- **Pedido:** Felipe, 2026-10-17, sobre el modal «Nuevo gasto fijo»: elegir primera semana, quincena o fin de mes en vez de «Día del mes»;
  y al elegir proveedor, ver su teléfono y su cuenta bancaria. Fondo: que si Felipe falta, otra persona pueda gestionar CAYLA.

## El problema primero

Un fijo solo decía «llega el día N» (1 a 28). Pero el alquiler o el internet se pagan «a fin de mes», y fin de mes es el 28, 29, 30 o 31.
Escribir 28 hace que el sistema marque «falta» el día 29 de un mes que no vence, y que el Flujo de caja proyecte el pago antes de tiempo.
Y quien registra el gasto no veía cómo contactar ni cómo pagarle al proveedor sin entrar a Compras.

## Decisión

- `gastos_fijos.momento` = `'dia' | 'primera_semana' | 'quincena' | 'fin_de_mes'` (por defecto `'dia'`: lo ya cargado no cambia; en producción hay 0 filas).
  La fecha esperada vive SOLO en `retail.fn_fecha_esperada_fijo` (día N, el 7, el 15 o el último día real del mes), y la usa `fn_gastos_fijos_mes`,
  de donde leen Flujo, Resumen y Cierre. «Falta» recién al día siguiente de la fecha esperada.
- `dia_del_mes` sigue 1–28 como orden y respaldo (7, 15 y 28 para los tres momentos) con un candado de coherencia: la base no puede quedar con «fin de mes, día 3».
- `guardar_gasto_fijo` gana un 10.º argumento opcional `p_momento`; la firma de 9 se retira, pero una llamada de 9 argumentos sigue funcionando (resuelve a la de 10).
- Web: `MomentoFijo` y sus textos en `lib/gastos-reglas.ts`. `validarFijo` manda `p_momento` **solo si no es `'dia'`**, así la web sirve antes de pegar la migración.
  El Resumen de Finanzas dice «Se esperaba el día X» tomando el día de `fecha_esperada` (su RPC no trae `momento` y no se tocó).
- Proveedor: `components/ProveedorElegido.tsx` (en el modal de gasto fijo y en el de registrar gasto) muestra contacto + teléfono (WhatsApp si es celular peruano)
  y reutiliza `CuentasProveedor` (la de Por pagar). Lo bancario no sale de la tabla: se pide al elegir con `fn_proveedor_datos_bancarios` (cero filas si la cuenta no lo ve →
  no se acusa que «falta»). Si faltan: «Falta teléfono / cuenta: complétalo en Compras ▸ Proveedores.» (sin enlace). `getProveedoresParaGasto` trae contacto, teléfono, forma de pago y plazo.

## Lo que se descartó

- Permitir `dia_del_mes` 29–31: rompe febrero. Un `dia_del_mes` nullable con `momento`: obligaba a tocar todo lector del Resumen, Cierre y Presupuesto.
- Leer la cuenta bancaria desde la tabla de proveedores: ADR de datos bancarios (20261013161000) lo cerró a propósito.

## Cómo se pega en producción

Una sola parte, sin políticas (ADR-0195): un `alter table` con `lock_timeout` de 3 s y tres funciones; idempotente. La pega Felipe. Antes, correr en local
`pnpm pruebas:activos-y-fijos`, flujo de caja, resumen, cierre y `pnpm pruebas:roles-cobertura`. Guía interactiva del modal (`data-guia`): no se tocó; revisar si `guias:huella` pide cambio.
