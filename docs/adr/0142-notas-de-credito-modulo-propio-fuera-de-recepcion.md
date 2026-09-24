# ADR-0142 — Las notas de crédito salen de Recepción y tienen módulo propio

> **Nota (2026-09-23, PL-50):** en Compras esto hoy se llama «Notas de crédito de proveedor» (y los comprobantes de compra,
> «Facturas de proveedor»). «Nota de crédito» a secas quedó solo para Ventas. La ruta sigue siendo `/compras/notas-credito`
> y el módulo de roles, `notas_credito` (nombre en Roles y accesos: «Notas de crédito», vive en la base). El resto del
> documento conserva los nombres de su fecha.

> **Número:** nació como 0140; ese número lo tomó «Carga inicial de proveedores» al llegar a `main` primero, y 0141 es «Apartar stock». Es el mismo documento.

**Fecha:** 2026-09-19 (spike aprobado, implementación y verificación en local)
**Estado:** Aceptado e **implementado** en la rama `claude/comprobantes-ui-ux-animations-ab153b`. Verificado con pruebas SQL
(42/42), pruebas de la web (1677) y recorrido en el navegador con sesión de líder. **La migración `20260919211000` está aplicada en
producción** (pegada por Felipe; verificada contra la base el 2026-09-21: las 6 funciones con el md5 idéntico al local y la
columna nueva presente).
**Decide:** Felipe, en lo de negocio: «aplicar un módulo más para las notas de crédito, para no mezclar en recepción de
mercadería» y «cuando se genera una nota de crédito indicar si el dinero se devuelve a CAYLA en ese momento o queda como saldo a
favor para otra compra». Arquitectura: este documento.
**Diseño de referencia:** `docs/maquetas/notas-credito-spike-2026-09/notas-credito-vivo.html` (aprobado por Felipe el 2026-09-19).
**Afecta:** ruta nueva `/compras/notas-credito`; `compra_adjuntos` (columna nueva); 5 funciones de base (1 nueva de lectura, 1
nueva de búsqueda, `registrar_nota_credito_compra` extendida, `registrar_adjunto_compra` y `registrar_reembolso_proveedor`
recreadas); las pantallas de Recibir mercadería y el detalle del comprobante, que dejan de registrar notas.

## Contexto — el problema

Una **nota de crédito** es lo que un proveedor le acredita a CAYLA cuando algo no llegó, se devolvió o se acordó un descuento.
Es dinero. Hasta hoy vivía **dentro de Recepción de mercadería**: `RecepcionEnvio.tsx` dibujaba el formulario de la nota junto al
conteo de prendas, `recibir_envio` recibía `p_notas_credito`, y el detalle del comprobante tenía una **segunda puerta** al mismo
formulario (`AccionesFaltantes.tsx`). Tres consecuencias:

1. **Dinero mezclado con operación.** Recibir es contar prendas y lo hace cualquier colaborador de sede; registrar una nota es un
   acto de dinero que solo puede hacer el líder (ADR-0126). La pantalla arrastraba plomería de dinero (IGV del mes, saldo a favor
   del proveedor) para todos.
2. **Dos puertas al mismo formulario**, con el riesgo clásico: la regla del monto duplicada y dos sitios que arreglar.
3. **Nada muestra el ciclo completo.** Un faltante cerrado deja al proveedor debiendo un documento, y no había ninguna pantalla
   que respondiera «¿qué notas me faltan reclamar y desde cuándo?». Las notas solo se veían comprobante por comprobante.

Y faltaba una decisión del negocio que el sistema no preguntaba: cuando la nota supera lo que aún se le debe, **ese sobrante
¿lo devuelve el proveedor ahora, o queda a favor para otra compra?** Hasta hoy siempre quedaba a favor, en silencio, y el
reembolso era otra pantalla y otra RPC — dos escrituras que podían quedar a medias.

## Decisión

**Las notas de crédito son un módulo propio de Compras, `/compras/notas-credito`, solo para el líder. Recepción deja de
registrarlas y solo avisa de lo que habrá que reclamar. Al registrar una nota se elige qué pasa con el dinero que sobra, y la
nota y su devolución se escriben en una sola transacción.**

### Lo que hace el módulo

| Pieza | Qué responde |
|---|---|
| Tablero | Por reclamar · Emitidas este mes · Saldo a favor total · Aplicado este mes; pestañas por estado, agrupar por urgencia o por proveedor, buscador |
| Nota pendiente | Un faltante cerrado sin nota: cuánto se espera, desde cuándo, y si todavía falta cerrar unidades |
| Registrar nota | Buscador de facturas (documento, proveedor o **monto**), efecto en vivo «Baja la deuda · Se devuelve ahora · Queda a favor», y el destino del sobrante |
| Detalle | Línea de tiempo de la nota, a dónde fue el dinero, historial |
| Saldos a favor | Cuánto debe cada proveedor, de qué notas viene, y las dos salidas: usarlo en un pago o registrar el reembolso |

### El destino del dinero (lo que pidió Felipe)

Lo primero que hace una nota es **bajar lo que CAYLA aún le debe por esa factura**. Lo que sobra —o todo el monto, si la factura
ya estaba pagada— es lo que se decide:

- **«Queda a favor para otra compra»** (valor por defecto): saldo a favor del proveedor. Coherente con la decisión del mismo día
  sobre el saldo a favor: **se sugiere al pagar, nunca se descuenta solo**.
- **«Nos lo devuelve ahora»**: el proveedor paga el sobrante en el momento. Pide medio, fecha y N.º de operación (opcional).

Si no sobra nada, las dos fichas se ven **deshabilitadas con su explicación** («esta nota solo baja la deuda»), no ocultas: se
entiende por qué no hay nada que elegir.

## Alternativas descartadas

- **Dejar la nota también en Recepción, como atajo opcional.** Ahorra un clic cuando el proveedor trae la nota en mano —caso
  minoritario— y a cambio conserva las dos puertas y el dinero dentro de la pantalla operativa. Se descartó: el chip de Recepción
  lleva al módulo, que es un clic, no un rodeo.
- **Dos RPC para «devolver ahora»** (registrar la nota y luego el reembolso). Es lo que había. Se descartó porque un corte entre
  las dos deja la nota sin su devolución y el saldo a favor mintiendo. Registrar la nota es **un** acto del negocio; a dónde va
  el sobrante es un dato de ese acto, no otro acto (principios 2 y 4).
- **Guardar de qué nota salió cada uso del saldo a favor** (para que «Aplicada» sea exacta). Obligaba a tocar
  `registrar_pago_compras` y `registrar_pagos_compra`, dos funciones que mueven dinero, por una **etiqueta**. Se deduce en
  TypeScript por orden de llegada (FIFO); el total por proveedor siempre es exacto y la pantalla dice que es una estimación.
- **Guardar «reclamada al proveedor»** (tabla nueva). Cierra el ciclo real —saber a quién falta llamar— pero es un botón más que
  hay que acordarse de apretar. Queda para una segunda fase, cuando el tablero lleve una semana en uso.
- **Guardar las cuentas de CAYLA** para decir dónde entra el dinero devuelto. El spike lo dibujaba con un dato inventado; la base
  no lo tiene. Se quitó de la pantalla en vez de inventar una tabla que habría que mantener al día.
- **Un contador de «por reclamar» en el menú lateral.** Costaba llamar a `notas_credito_tablero()` en cada pantalla de la app por
  un número que ya es la primera cifra del módulo.

## Alcance — qué cambió

### Base (migración `20260919211000_notas_credito_modulo.sql`, una sola pegada)

- **`notas_credito_tablero()`** (nueva, solo líder): una fila por nota registrada y una por nota pendiente, distinguidas por
  `clase`. `monto_esperado` reusa el cálculo de `compras_nota_pendiente()`; no hay una tercera copia de esa regla.
- **`registrar_nota_credito_compra`** gana `p_destino` (`'a_favor'` por defecto | `'reembolso'`), `p_reembolso_metodo`,
  `p_reembolso_fecha`, `p_reembolso_referencia`. Con `'a_favor'` se comporta exactamente como antes. Con `'reembolso'` escribe
  nota y devolución en la misma transacción, y el monto devuelto lo decide la base (el sobrante), no el formulario. Firma única
  (`drop function` explícito) y un bloque de guarda que aborta si alguna función quedara con dos firmas.
- **`fn_facturas_para_nota_credito()`** (nueva): busca facturas por documento, proveedor y **monto** —`listar_compras` no busca
  por monto y no se tocó—.
- **`compra_adjuntos.nota_credito_id`** con FK compuesta `(nota_credito_id, compra_id)`: un PDF no se puede colgar de una nota de
  otra factura. `registrar_adjunto_compra` gana el parámetro y, de paso, se le cerró un `EXECUTE` que estaba abierto a PUBLIC.
- `registrar_reembolso_proveedor` conserva su firma y ahora delega en un helper interno que la nota reutiliza.

### Pantalla

- Módulo nuevo: `app/(app)/compras/notas-credito/`, `lib/notas-credito.ts` (lecturas) y `lib/notas-credito-reglas.ts` (puro, con
  la urgencia a 14 días y el FIFO), `NotasCreditoPanel`, `NotaCreditoVistaRapida`, `NotaCreditoDetalle`,
  `RegistrarNotaCreditoModal`, `app/estilos/notas-credito.css`, y la entrada en el menú.
- Recepción (`RecepcionEnvio.tsx`, `EnvioRecibido.tsx`, `app/(app)/recibir/page.tsx`, `lib/envio-reglas.ts`): fuera el formulario
  de la nota y la plomería de dinero que solo existía para él; en su lugar, un aviso de líder «Nota de crédito por reclamar ·
  S/ X» con el chip **«Se reclama en Notas de crédito ↗»**. La **nota de texto del envío** (observación libre) se queda: son dos
  cosas distintas con el mismo nombre.
- Detalle del comprobante: `AccionesFaltantes.tsx` pierde el formulario (de 183 a 26 líneas) y deja el enlace al módulo. **Cerrar
  un faltante se queda ahí**: es operación, no dinero. La lista de notas ya emitidas del comprobante también se queda.
- `recibir_envio` **sigue aceptando `p_notas_credito`**; la pantalla lo manda vacío. La base no se tocó para no romper a nadie.

## Consecuencias

- Recibir mercadería vuelve a ser una pantalla de contar prendas. Un integrante ya no ve nada de dinero ahí.
- Un faltante cerrado ya no se pierde: aparece en el tablero con su antigüedad, y a los 14 días se marca urgente.
- **Queda huérfano `components/NotaCreditoCierre.tsx`** (nadie lo importa) y varias funciones de `lib/recepciones-reglas.ts`
  (`notaDelBloque`, `disponibilidadNota`, `efectoCierre`, `igvDeMonto`, `montoNotaSugerido`). No se borran en este paso; se
  decide aparte, cuando el módulo lleve unos días corriendo.
- **Pendiente, por decisión:** «reclamada al proveedor» (D2) y subir el adjunto de la nota desde el módulo (la columna ya existe,
  falta el flujo de archivos).
- El detalle de una nota es un modal cliente y no una ruta interceptada, así que **no hay enlace directo a una nota**. El slot
  `@modal` de `/compras` tiene un comodín que la limpiaría; razonado en la cabecera de `NotaCreditoDetalle.tsx`.

## Cómo se pega en producción

Un solo archivo, de una sola pegada, en el SQL Editor (ya trae `set search_path = retail, public, extensions;`):

```
supabase/migrations/20260919211000_notas_credito_modulo.sql
```

Es re-ejecutable (pegarla dos veces deja los mismos md5, una sola firma de cada función, un solo índice y una sola FK) y no borra
datos. **Primero la migración, después fusionar el código**: la pantalla manda `p_destino`, que la función vieja no acepta.
Al terminar: `pnpm datos:generar:produccion` y `pnpm datos:comparar`.

## Cómo se verifica

1. En `/compras/notas-credito` con sesión de líder: las cuatro cifras cuadran con las filas; un integrante no puede entrar.
2. Registrar una nota sobre una factura **con deuda mayor**: las tres partes dicen «baja la deuda · 0 · 0» y las fichas de
   destino quedan deshabilitadas con su explicación.
3. Sobre una factura **ya pagada**, con «Nos lo devuelve ahora»: el saldo a favor NO sube y la nota queda «Devuelta».
4. Sobre una factura **con deuda menor que la nota**, con «Queda a favor»: el saldo a favor sube exactamente el sobrante.
5. Buscar una factura escribiendo su **monto** (`2124`) la encuentra, con el número resaltado.
6. En `/recibir` no existe ningún formulario de nota de crédito; al cerrar un faltante aparece el aviso con el monto y el chip
   al módulo, y el número coincide con el que muestra el tablero.
