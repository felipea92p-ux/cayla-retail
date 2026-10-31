# Backlog — medio botón no existe (2026-10-31)

## SQL PARA PRODUCCIÓN · `20261031211000_medio_boton_no_existe.sql`

**Se pega de una sola vez.** No lleva partes, no trae políticas ni `alter` de tablas en uso (ADR-0195), y **no toca
ni una fila guardada**: es un disparador, así que solo mira lo que se escribe de ahora en adelante. Por eso no hace
falta sonda ni revisar datos antes.

**Cómo comprobar que quedó**, en el mismo SQL Editor:

```sql
select retail.fn_unidad_se_cuenta_entera('unidad') as unidad_entera,
       retail.fn_unidad_se_cuenta_entera('metro')  as metro_entera,
       (select count(*) from pg_trigger where tgname in ('insumo_lotes_cantidad_entera','movimientos_insumo_cantidad_entera')) as candados;
```

Tiene que decir `t`, `f` y `2`.

**Se pega ANTES o DESPUÉS de fusionar**, da igual: la web vieja nunca mandaba fracciones a propósito, y si alguien
lo intenta, recibe el mensaje de la base en vez de guardarlo.

**Camino de vuelta:** `drop trigger insumo_lotes_cantidad_entera on retail.insumo_lotes;` y lo mismo con
`movimientos_insumo_cantidad_entera`. Las dos funciones pueden quedarse (no molestan a nadie). Ningún dato cambia.

> Ojo con el `drop trigger` en el SQL Editor (ADR-0195): toma en exclusiva las 21 tablas de `auth` y `storage` hasta
> el final de la transacción. Si hay que deshacerlo, va **solo**, sin nada más pegado al lado.

## SI ALGÚN DÍA HAY QUE PERMITIR FRACCIONES EN ALGO QUE HOY SE CUENTA ENTERO

La lista vive en **dos sitios que tienen que decir lo mismo**, y hay una prueba que lo comprueba
(`pruebas:medio-boton-no-existe`, caso E): `retail.fn_unidad_se_cuenta_entera` en la base y `seCuentaEntera` en
`lib/insumos-reglas.ts`. En la web se deriva de la tabla `UNIDADES_INSUMO` (una unidad que no admite decimales al
pedirla tampoco los admite al contarla), así que ahí basta con cambiar sus `decimales`.

## LO QUE NO CUBRE

- **No corrige lo que ya existe.** Si hubiera un lote viejo con media unidad, se queda; la pantalla ahora lo muestra
  como «0.5 unid.» en vez de redondearlo a «1 unid.». Corregirlo es decisión tuya (mueve stock).
- **Solo insumos.** Las prendas (`movimientos`, `stock`) ya van en enteros por su propio diseño; esto es de
  `insumo_lotes` y `movimientos_insumo`.

## SIGUE PENDIENTE DE `/chaos` SOBRE «NUEVO AVÍO» (informe en `.chaos/`)

Cuatro hallazgos, por gravedad:

1. **Enter guarda el avío** (g2), sin tocar «Crear el avío», en una hoja que fija una decisión irreversible.
2. **Una clase nueva se recorta a 60 letras en silencio** (g2) y el aviso de éxito muestra el nombre mutilado.
3. **«Si cierras ahora, se pierde lo que escribiste» … y se guarda** (g3).
4. **Un botón sin medida no se puede registrar** (g3), aunque el diseño y la base la hacen opcional.

Y aparte: **en «Nuevo avío» el costo por unidad usa el lector de plata**, así que 0,045 —lo que cuesta un botón— se
rechaza (`lib/avio-nuevo-reglas.ts:97`). Es el G13 ya arreglado para telas que no llegó a avíos.

## SIGUE PENDIENTE DE ADR-0580

- `pnpm --filter web tema:auditar` con escenarios para «Nuevo avío» y Catálogo ▸ Atributos ▸ Avíos.
- `guias:recorrer`: las dos huellas se aceptaron revisando los pasos a mano.
- `/formidable` con una persona sin contexto.
