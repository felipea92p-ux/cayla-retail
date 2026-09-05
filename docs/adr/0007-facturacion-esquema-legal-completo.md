# ADR-0007 — Esquema legal completo de Facturación: proforma, NC/ND

**Fecha:** 2026-09-05
**Estado:** Escrito y verificado en local (`0034_facturacion_completa.sql`),
pendiente de pegar en producción.

## Contexto

Felipe pidió reemplazar Alegra por completo con un módulo propio de Finanzas.
Se investigó (7 agentes en paralelo) la normativa peruana exacta antes de tocar
el esquema, en vez de adivinar. Tres hallazgos con fuente primaria (Art. 2 del
Reglamento de Comprobantes de Pago, RS 007-99/SUNAT; normativa de Notas de
Crédito/Débito, cpe.sunat.gob.pe) que `0032_comprobantes.sql` (Parte 1 del ADR-0005)
dejó fuera a propósito, por estar limitada a boleta/factura:

1. La "proforma" o "nota de venta" que Felipe pidió (para cotizar, reservar una
   prenda, dar constancia de un apartado) **no está en la lista taxativa** de
   comprobantes de pago del Art. 2. No acredita venta ante SUNAT, no sustenta
   costo/gasto ni crédito fiscal.
2. Una Nota de Crédito o Débito electrónica **solo puede emitirse referenciando
   un comprobante original que ya tenga CDR aceptado** — nunca uno pendiente,
   rechazado, o inexistente.
3. `comprobantes.tipo` (y su copia en `series_comprobantes.tipo`) no admitía
   `nota_debito`, solo `nota_credito`.

## Decisión

**Proforma en tabla separada (`proformas`), nunca en `comprobantes`.** Sin FK
hacia `series_comprobantes`: no consume número de serie SUNAT porque no es un
documento fiscal. Convertirla en un comprobante real es una función nueva
(`convertir_proforma_a_comprobante`) que llama a `emitir_comprobante` y crea una
FILA NUEVA — nunca un `UPDATE` de estado sobre la proforma que la "ascienda" a
comprobante. Así "proforma con número de serie SUNAT" queda excluido por
diseño, no por convención de código.

**NC/ND con referencia obligatoria, exigida en dos capas.** `comprobantes` gana
`comprobante_original_id` (FK) y `motivo` (texto libre por ahora — el catálogo
exacto 09/10 de SUNAT queda para cuando se conecte Nubefact en la Fase 1, ver
ADR-0005). Capa 1: CHECK de la misma fila
(`comprobantes_nota_requiere_original`) — una nota sin las dos columnas es un
estado imposible. Capa 2: un `BEFORE INSERT` trigger
(`fn_valida_nota_referencia_aceptada`) que sí puede mirar OTRA fila (algo que
un CHECK constraint de Postgres no puede hacer — no admite subconsultas) y
rechaza la nota si el comprobante original no está `aceptado`. Las dos capas se
probaron por separado contra Postgres local: la Capa 2 ya cubre el caso de
`comprobante_original_id` nulo (no encuentra fila, lo trata como "no existe"),
y la Capa 1 se confirmó aparte insertando una nota con original válido pero
`motivo` nulo.

**`nota_debito` agregado al check de `comprobantes.tipo` — y al de
`series_comprobantes.tipo`, que tiene su PROPIA copia del mismo check.** Este
segundo constraint se me pasó por alto en el primer intento de esta migración:
lo encontró la prueba empírica local (`insert` a `series_comprobantes` con
`nota_debito` fallando por constraint), no una revisión de código. Es la misma
familia de bug que ADR-0004 y ADR-0006 — dos copias de la misma regla que se
desincronizan — solo que esta vez se cazó ANTES de llegar a producción, dentro
de esta misma sesión, corriendo la migración contra Postgres local antes de
entregarla.

**Refactor previo: `fn_reservar_numero_serie`.** Antes de escribir `emitir_nota`
se extrajo a una función propia el candado `for update` que ya usaba
`emitir_comprobante` para reservar un número de serie sin condición de carrera.
`emitir_comprobante` se reescribió (`create or replace`, mismo comportamiento)
para usar el helper. Sin esto, `emitir_nota` habría llevado una segunda copia
casi idéntica del mismo candado — exactamente el patrón que ya costó dos ADRs
en este mismo repo.

## Alternativas descartadas

- **Guardar la proforma como un `comprobante` en estado `'borrador'`.** Más
  simple de escribir, pero mezcla en la misma tabla un documento sin peso legal
  con uno que sí lo tiene — el día que alguien lea `comprobantes` para un
  reporte fiscal tendría que acordarse de excluir los borradores, y un bug de
  filtro expondría una proforma como si fuera una venta real ante SUNAT.
  Descartado por el principio de "estados imposibles primero": mejor que la
  tabla no pueda mentir, a que el código tenga que acordarse de no mentir.
- **Enforcar "original aceptado" solo en la RPC, sin trigger.** Es lo que hace
  `emitir_nota` de todas formas (falla más rápido, sin tocar la base). Pero
  como no hay política de INSERT para clientes en `comprobantes` (el único
  camino de escritura es la RPC `security definer`), el trigger es un segundo
  cinturón sin costo real: si algún día se abre otro camino de escritura, la
  regla sigue sin poder saltarse.

## Consecuencias

El esquema ya puede modelar el ciclo completo que Felipe pidió (proforma →
venta → boleta/factura → corrección con NC/ND) sin dejar un solo estado
imposible a la validación de formulario. Nada de esto está conectado a Nubefact
todavía — sigue pendiente la Fase 1 del plan (`~/.claude/plans/
cozy-gathering-nova.md`), que es lo que hace que `estado` deje de depender de un
`UPDATE` manual de prueba y empiece a reflejar la respuesta real de SUNAT.
