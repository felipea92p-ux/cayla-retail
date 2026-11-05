# ADR-0507 · Observaciones al contar un envío

- **Fecha:** 2026-10-24 · **Estado:** CONSTRUIDO en local, pedido por Felipe en la sesión de Recibir mercadería. La migración está en el repo y en la base local; **no está en producción** (se pega con el OK de Felipe).
- **Rama:** `claude/fervent-hypatia-00c47b` · **Migración:** `20261024235000_observaciones_de_envio.sql` (reservada con `pnpm reservar migracion`).
- **Relacionado:** ADR-0393 (recibir contando primero), ADR-0362 (órdenes de compra y envíos), ADR-0356 (caos).

## El problema

Al contar un envío, el sistema solo sabe «llegaron 15 de 15». Si una prenda llegó rota, manchada o distinta, quien cuenta no tiene dónde decirlo: lo dice de palabra, lo anota en un papel o lo olvida. Cuando Compras reclama al proveedor semanas después, nadie recuerda qué pasó con ese fardo.

## La decisión

```
DECIDÍ:     Una tabla propia `retail.despacho_observaciones` (tipo de una lista corta + mensaje de hasta 300 letras, de una línea del
            envío o del envío entero, quién y cuándo), que solo se escribe con el envío ABIERTO y nunca se borra ni se edita. Dos
            funciones: `registrar_observacion_envio` (mismos permisos que contar: módulo Recibir, sede del envío, quien firma no hizo la
            orden; token contra el doble clic) y `fn_envio_observaciones` (se lee en cualquier estado, también cerrado). En la pantalla:
            «Anotar observación» en cada categoría de Contar, con una hoja de siete tipos: prenda rota o dañada, faltante, manchada,
            distinta a lo pedido, llegó de más, bulto o empaque dañado y otra cosa.
DESCARTÉ:   (1) Una columna `nota` en `despacho_conteos`: el conteo se pisa («gana el último, con aviso», decisión 9 de ADR-0393) y una
            línea puede tener varias observaciones de personas distintas. (2) `despacho_diferencias.nota`: esa fila nace al cerrar, solo
            para faltantes y sobrantes con la causa de Compras, y trae el costo de «Nos debe»; una prenda rota que llegó no es una deuda
            del proveedor hasta que Compras lo decida. (3) Una tabla de tipos que el líder edita: la lista es corta, la pantalla entiende
            cada tipo y uno nuevo es una decisión de producto; «otra cosa» + mensaje cubre lo imprevisto.
SE ROMPE SI: las observaciones se vuelven un cajón que nadie lee. Hoy solo se ven en Contar, junto a la categoría; falta mostrarlas en
            Cerrar y en Compras («Nos debe») para que sirvan al reclamo. Y si alguien espera que una observación cambie el stock o cree un
            faltante: no lo hace a propósito (es un texto para las personas), los faltantes siguen naciendo al cerrar con su causa.
```

## Lo que nunca debe existir (y quién lo impide)

| Estado imposible | Quién lo impide |
|---|---|
| Observación en un envío en camino, cerrado o anulado | disparador `despacho_observaciones_fija` |
| Observación de una línea de otro envío | el mismo disparador |
| Observación borrada o cambiada | el mismo disparador |
| Tipo fuera de la lista, mensaje vacío o de más de 300 letras | CHECKs de la tabla |
| La misma observación dos veces por un reintento | único parcial por `(despacho_id, token_cliente)` |

## Cómo se verifica

- `pnpm pruebas:observaciones-de-envio` (10 casos, ROLLBACK siempre): permisos, estados, registrar con y sin token, rechazos, inmutabilidad, lectura y forma de las funciones. Está en la lista de `scripts/ci/pruebas-postgres.mjs`.
- `lib/observaciones-envio-reglas.test.ts`: la lista de tipos de la pantalla es la misma que el CHECK y la función de la migración.
- En el navegador: elegir «Prenda rota o dañada», escribir un mensaje y guardar; aparece bajo la categoría con quién y cuándo.

## Cómo se pega en producción (con el OK de Felipe)

UNA parte, después de `20261013171000`: tabla NUEVA sin políticas (RLS encendido), sin `drop trigger`, sin `select … into` dentro de textos entre comillas. Se puede pegar dos veces. Al final, refrescar el volcado del diccionario (`generado/COMO-REFRESCAR.md`).
