# Backlog — un invisible ya no crea dos veces lo mismo (2026-10-31)

## SQL PARA PRODUCCIÓN · `20261031200000_invisibles_no_crean_dos_veces_lo_mismo.sql`

> **YA ESTÁ PEGADO.** Felipe la pegó en producción el 2026-10-31 y la comprobación devolvió lo esperado:
> `los_junta: true · indices: 16`. **Y eso prueba una cosa más:** la migración se niega si encuentra dos filas que
> solo se diferencian por un carácter invisible, así que, como entró sin quejarse, **en producción no había ningún
> duplicado de ese tipo guardado**. No hubo que decidir nada sobre datos existentes.

Lo de abajo queda como estaba, para cuando haya que repetirlo o deshacerlo.

**ANTES de pegar, corre la sonda de solo lectura** (`sonda-invisibles.sql`, en el PR; no escribe nada). Lo que decide
todo es su respuesta 3:

- **Sin ninguna fila «CHOQUE»** → la migración entra tal cual, de **una sola vez**, sin tocar un solo dato.
- **Con alguna** → hay dos filas que solo se diferencian por un carácter invisible. La migración se niega sola y dice
  en cuál, pero conviene saberlo antes: **cuál de las dos se queda es una decisión tuya**, no técnica (mueve el stock
  de una a otra).

**Se pega de una sola vez.** No lleva partes: usa `drop index` + `create index`, que funciona igual dentro de la
transacción del SQL Editor. (Con `reindex` NO funcionaría: ver la bitácora, es el hallazgo del día.)

**Cómo comprobar que quedó**, en el mismo SQL Editor:

```sql
select retail.fn_clave_texto('a' || U&'\200B' || 'b') = 'ab' as los_junta,
       (select count(*) from pg_index i where pg_get_indexdef(i.indexrelid) like '%fn_clave_texto%') as indices;
```
Tiene que decir `t` y `16`.

**Camino de vuelta** (si hiciera falta): volver `fn_clave_texto` a su cuerpo anterior —el de
`20260912235500_vocabulario_cerrado.sql`— y rehacer los índices con el mismo bloque `do` de la migración. Nada de
datos cambia en ninguna de las dos direcciones: solo la clave con la que se comparan.

**Se puede pegar ANTES de fusionar** (la web vieja no se entera: la clave nueva solo es más estricta) y también
después. Si se pega antes, lo único que cambia para quien esté usando el ERP es que un nombre con un invisible deja
de poder crearse dos veces, que es el objetivo.

## LO QUE NO CUBRE

- **No corrige lo que ya existe:** aviso hacia adelante. Si hay un duplicado por invisible, la migración se niega y
  hay que decidir cuál se queda (no hay «fusionar color» hoy; mueve `variantes.color_codigo`).
- **El «casi igual» sigue sin candado en la base**, a propósito (ADR-0576): «Verde olivo» y «Verde oliva» siguen con
  la pregunta que no bloquea.
- **No se pudo leer producción** (el conector lo niega desde el 28-oct): la sonda la corre Felipe.

## SIGUE PENDIENTE DE `/chaos` SOBRE «NUEVO AVÍO» (informe en `.chaos/`)

Cinco hallazgos, por gravedad:

1. **Medio botón entra y la pantalla dice que es uno** (g2): «0,5» se acepta, la base guarda `0.500`, la pantalla
   muestra «1 unid.». Nadie exige entero para unidades, conos, pares ni docenas.
2. **Enter guarda el avío** (g2), sin tocar «Crear el avío», en una hoja que fija una decisión irreversible.
3. **Una clase nueva se recorta a 60 letras en silencio** (g2) y el aviso de éxito muestra el nombre mutilado.
4. **«Si cierras ahora, se pierde lo que escribiste» … y se guarda** (g3).
5. **Un botón sin medida no se puede registrar** (g3), aunque el diseño y la base la hacen opcional.

Y aparte: **en «Nuevo avío» el costo por unidad usa el lector de plata**, así que 0,045 —lo que cuesta un botón— se
rechaza (`lib/avio-nuevo-reglas.ts:97`). Es el G13 ya arreglado para telas que no llegó a avíos.

## SIGUE PENDIENTE DE ADR-0580

- `pnpm --filter web tema:auditar` con escenarios para «Nuevo avío» y Catálogo ▸ Atributos ▸ Avíos.
- `guias:recorrer`: las dos huellas se aceptaron revisando los pasos a mano.
- `/formidable` con una persona sin contexto.
