# ADR-0015 — El comprobante guarda contra qué ambiente se transmitió

**Fecha:** 2026-09-09
**Estado:** Aplicado y probado en local (`supabase db reset`, 2026-09-09: las 41
migraciones corren en orden y `0040` aplica limpia; restricción `VALIDADO` y una
sola firma de `actualizar_transmision_comprobante`, sin sobrecarga). Código
verificado (tsc, eslint, 51 tests). **Aplicado en producción el 2026-09-09** (`unificacion/23`): una sola firma de
5 argumentos, sin sobrecarga. La restricción quedó **`NOT VALID`** porque
producción tenía una boleta transmitida antes de la columna — ver "Deuda que
esto deja a la vista".

## Contexto

`apps/web/lib/lucode.ts` habla con dos plataformas distintas según
`LUCODE_ENTORNO`: `sandbox.apisunat.pe` (pruebas) y `app.apisunat.pe`
(producción, válido ante SUNAT). Hasta hoy el resultado de las dos se guardaba
igual: `actualizar_transmision_comprobante` escribía `estado='aceptado'`,
`respuesta_sunat` con su CDR y su PDF, y `enviado_at`. **Nada en la base decía
de cuál de las dos vino.**

Eso no es configuración incompleta, es un estado inconsistente (principio 2):
la tabla afirma un hecho —"SUNAT aceptó este comprobante"— que no puede
respaldar. Y se propaga en dos direcciones concretas:

1. **La pantalla.** Facturación muestra "Aceptado" con el mismo chip verde para
   los dos. Quien mira la tabla no tiene forma de saber si esa venta está
   facturada o si fue un ensayo.
2. **Las notas.** `emitir_nota` (`0034_facturacion_completa.sql`) exige que el
   comprobante original esté `aceptado` — y una boleta de sandbox también lo
   está. Se puede emitir una nota de crédito **real** contra un documento que
   SUNAT nunca vio.

El riesgo es hoy teórico solo por accidente: `retail.comprobantes` está vacía en
producción (verificado 2026-09-08) y la máquina de Felipe apunta a `sandbox`.
En el momento en que las dos cosas cambien, deja de serlo.

## Decisión

`comprobantes.entorno_transmision text check (in ('sandbox','produccion'))`, más
una restricción que hace imposible el estado ambiguo:

```sql
check (estado = 'pendiente' or entorno_transmision is not null)
```

Un comprobante o está pendiente (nunca se transmitió, ambiente irrelevante) o
sabe de dónde vino. No hay tercera opción.

Tres decisiones de detalle que valen más que la columna:

- **`p_entorno` sin default en la RPC.** Un default convertiría el olvido de
  quien llama en un dato falso, que es exactamente lo que este ADR viene a
  cerrar. Por eso la firma vieja de 4 parámetros se **dropea**, no se
  reemplaza: `create or replace` con un parámetro nuevo deja una sobrecarga y
  PostgREST resuelve por firma exacta — el error que costó
  `Could not find the function ... in the schema cache` el 2026-09-08.
- **El ambiente viaja pegado al resultado de Lucode** (`ResultadoLucode.entorno`),
  no se vuelve a leer de `process.env` al momento de guardar. Entre transmitir
  y guardar nadie puede cambiar de ambiente sin que el dato mienta.
- **Las notas no cruzan de ambiente.** La ruta rechaza (409) transmitir una nota
  cuyo original salió del otro ambiente. Va en la ruta y no en la RPC porque es
  una regla sobre el proveedor externo, no sobre la base.

En pantalla: el chip de estado de un comprobante de sandbox dice
`Aceptado · prueba` con borde punteado, y el resumen del mes cuenta cuántos son
de prueba, con su ayuda. Sin colores nuevos (ADR-0011): el color no alcanza para
esta distinción, y confiar solo en él la haría invisible para quien no la busca.

## Alternativas descartadas

- **Meter el ambiente dentro de `respuesta_sunat` (jsonb).** No cuesta
  migración, pero un blob opaco no se puede restringir, ni filtrar, ni obliga a
  nadie a llenarlo. La regla "un comprobante transmitido sabe de dónde vino"
  dejaría de ser una garantía del esquema para pasar a ser una costumbre.
- **Bloquear el sandbox por completo cuando hay datos reales.** Se descartó: el
  sandbox es la única forma de probar el circuito sin consumir correlativos
  oficiales ante SUNAT. El problema nunca fue que exista, sino que no se note.
- **Rellenar los comprobantes viejos con `'produccion'`.** Sería la misma
  mentira, al revés. Su ambiente es genuinamente desconocido: por eso la
  restricción nace `not valid` y se valida sola solo si la tabla está limpia
  (que es el caso en producción y en local).

## Consecuencias

Un "Aceptado" en Facturación vuelve a significar una sola cosa. La pantalla
distingue una venta facturada de un ensayo sin que nadie tenga que acordarse de
qué decía `.env.local` esa semana, y una nota de crédito ya no puede colgarse de
un documento que no existe ante SUNAT.

Queda pendiente, y es lo que esta columna habilita: poner `LUCODE_TOKEN` y
`LUCODE_ENTORNO` en Vercel para que las sedes puedan facturar sin depender de la
máquina de Felipe (paso "b"), y recién después construir la **anulación** dentro
del sistema (paso "c") — hoy `anularDocumentoLucode` existe en el adaptador
(`lib/lucode.ts`) pero no tiene ruta, ni botón, ni forma de escribir `anulado`
en la base: la RPC lo rechaza a propósito. Sin anulación, cada "Transmitir" de
producción es irreversible desde el sistema y hay que ir al panel de Lucode
(resumen diario de bajas, 7 días).

## Deuda que esto deja a la vista (2026-09-09)

Al aplicar en producción apareció **B004-000002** (boleta, S/10.00, `aceptado`,
transmitida el 08-09 17:35 Lima) — el backlog daba `retail.comprobantes` por
vacía. Como esa fila está aceptada sin ambiente, la restricción quedó
`NOT VALID`: aplica a todo lo nuevo, y esa fila queda marcada como lo que es,
ambiente **desconocido**.

No se rellenó con `'produccion'` ni con `'sandbox'`: sería inventar el dato que
esta decisión existe para no inventar. Se resuelve mirando el panel de Lucode y
recién ahí escribiéndolo:

```sql
update retail.comprobantes set entorno_transmision = 'produccion'  -- o 'sandbox'
where serie = 'B004' and numero = 2;
alter table retail.comprobantes validate constraint comprobantes_transmitido_tiene_entorno;
```

Mientras tanto la restricción protege lo nuevo, que es el 100% de lo que viene.
