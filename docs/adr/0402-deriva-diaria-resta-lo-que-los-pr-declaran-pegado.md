# ADR-0402 — La revisión diaria resta lo que los PR abiertos declaran pegado

**Fecha:** 2026-10-14
**Estado:** Aceptado y construido (sin migración: `.github/workflows/deriva-diaria.yml` y `scripts/migraciones/`). Corre desde la
primera mañana después de fusionar (el `schedule` usa el workflow de `main`).
**Decide:** Felipe, 2026-10-14, en chat, entre dos opciones («Construye B»). Arquitectura: este documento.
**Complementa:** [ADR-0251](0251-sql-pegado-casilla-candado-y-deriva.md) (la casilla, el check «SQL pegado», la revisión diaria y el
aviso de SQL huérfano). No cambia ningún check obligatorio.

## El problema primero

El SQL de producción se pega **antes** de fusionar: el check «SQL pegado» no deja fusionar un PR cuyo SQL no está en producción, para
que Vercel nunca publique una pantalla sin su base. La consecuencia es que producción va casi siempre **por delante** de `main` con el
SQL de los PR abiertos.

La revisión diaria (ADR-0251) comparaba producción con `main` a secas, así que desde el 2026-10-03 salía roja casi todos los días por
algo que estaba bien. Un aviso que siempre está rojo no se lee, y debajo se escondía lo que sí importa: SQL que vive solo en producción
y que **nadie** declara (un arreglo hecho directo allá, SQL pegado desde una rama que nunca se empujó, un PR que se cerró).

**Medido el 2026-10-14 por la mañana, solo lectura** (conector de Supabase con `deriva.sql`, contra las huellas que el CI guardó de
`main`):

| | Diferencias |
|---|---|
| Producción contra `main` a secas | **302** (0 de `main` sin pegar, 260 solo en producción, 42 con otra versión) |
| Las explica exacto la huella final de un PR abierto con «SQL pegado en producción» marcada | **239** (79 %) |
| Trabajo de un PR marcado pegado después de su último CI | 17 |
| Dos tablas de respaldo de un arreglo de datos hecho en producción | 42 |
| Sin origen en ningún PR ni en ninguna rama de `origin` | 4 |

De esas 4, una venía de una migración que solo existía en una rama local nunca empujada (otro PR la trae a `main`); las otras tres no
tienen commit en ninguna parte. Ningún aviso las nombraba: estaban debajo del rojo de todos los días.

## Decidí

**La revisión diaria compara producción con `main` MÁS el SQL que los PR abiertos declaran pegado.** Pieza nueva:
`scripts/migraciones/deriva-pegados.mjs`, en dos pasos nuevos del workflow, después de las huellas de producción y de las de `main`:

1. **`reunir`**: lista los PR abiertos de este repo (nunca de un fork) que marcaron «SQL pegado en producción» y agregan migraciones
   (`revisarSqlPegado`, la misma regla del check «SQL pegado» y del aviso de SQL huérfano), y baja cada migración tal como está en la
   cabeza del PR que se listó.
2. **`aplicar`**: las aplica sobre la base de `main` que la revisión ya arma cada mañana, **todos los PR juntos y en orden de versión**,
   cada archivo en su sesión y su transacción (como el SQL Editor). Si un archivo no se aplica, salta lo que le sigue de ese PR y sigue
   con los demás.
3. Se vuelven a tomar las huellas (`main-mas-pegados.tsv`) y se comparan con las de producción (`deriva.mjs --resumen --con-pegados`).

El rojo pasa a decir: **producción tiene algo que nadie declara, o le falta algo de `main` o de lo que un PR declara pegado, o un PR
marcado no arma sobre el `main` de hoy.** Si se pudo sumar todo y calza, verde, y el aviso se cierra diciendo qué PR se sumaron.

Dos piezas más, en el mismo cambio:
- **El artefacto `huellas-main-mas-pegados`** (30 días): las huellas de `main` con lo pegado y qué se aplicó. Sale solo del código de
  `main` y de los PR, que son públicos; **nunca de producción**. Es la mitad que hace falta para mirar los nombres en privado.
- **Una diferencia conocida para las tablas `respaldo_…`** (`CONOCIDAS` en `deriva.mjs`): las deja un arreglo de datos hecho en
  producción, no una migración, y ningún PR las va a explicar nunca. Se aparta solo la forma de la tabla y el permiso de
  `service_role`; un permiso a `anon`, `authenticated` o `PUBLIC`, una política, un disparador o una vista sobre un respaldo **sí** se
  ven. Su lugar es el schema `respaldo_purgas`: si se mueven allá, esta regla se borra.

**Lo público no cambia de regla.** El aviso dice sí o no, más los **números de PR** que se sumaron y el **nombre del archivo** que no
armó (los dos ya están en los PR). Nunca un objeto de la base, nunca una cuenta, nunca el texto del error.

## Descarté

- **Restar con las huellas que guarda el CI de cada PR (`huellas-del-pr`), subiendo su vida de 7 a 90 días.** Era menos código, pero
  cada huella se calculó sobre el `main` del día de su corrida: un reemplazo anclado o un permiso de una tabla que `main` cambió
  después ya no calza, y el rojo sin causa vuelve en semanas. Además, dos PR pegados uno encima del otro sobre la misma función no
  calzan con ninguno de los dos (el caso de #978 y #1054). Aplicar cada mañana sobre el `main` de ese día no depende de cuánto duran
  las huellas ni de cuándo se calcularon.
- **Leer los nombres de los objetos del SQL de cada PR y restar todo lo que lleve esos nombres.** Taparía un arreglo en vivo sobre
  una función que un PR también toca, que es justo el caso que más duele. El ADR-0251 ya descartó leer nombres por lo mismo.
- **Restar todo lo que está «solo en producción».** Es la dirección donde viven los huérfanos.
- **Dejar de pegar antes de fusionar.** Es lo que impide que Vercel publique una pantalla sin su base.

## Se rompe si

- **Una sesión pega SQL y empuja después de las 7:00.** Esa mañana sale rojo. Es correcto: ese SQL todavía no está en ningún archivo, y
  si nunca se empuja es un huérfano. Regla: **pegaste, empuja**. (En la verificación de este ADR apareció uno así, pegado media hora
  antes y sin rama todavía.)
- **Dos PR marcados tocan la misma función y producción los pegó en orden contrario a sus números de versión.** Sale rojo hasta que uno
  se fusione: la revisión aplica por versión porque es lo único que sabe del orden.
- **Un PR marcado ya no aplica sobre el `main` de hoy** (otro PR fusionado cambió lo que él ancla). Sus diferencias no se restan, la
  corrida sale roja y el aviso dice «#N no se pudo armar (falló `archivo`)». Ese PR también va a fallar su CI al traer `main`.
- **Un PR marcado se queda abierto para siempre.** Su SQL queda fuera de `main` en verde. La revisión no mide antigüedad; el día que
  pese, se suma un aviso por PR marcado con más de N días.
- **Alguien marca la casilla sin haber pegado.** La revisión suma lo que el PR dice y producción no lo tiene: sale rojo. Marcar de más
  no tapa nada; marcar de menos (pegar sin marcar) deja su SQL como «nadie lo declara», que es lo que tiene que pasar.
- **GitHub no responde al listar los PR.** «Hoy no se pudo comparar», en rojo. Nunca cae a comparar con `main` a secas, que volvería al
  rojo de todos los días y escondería lo demás.
- **Un PR con SQL malicioso.** Solo se aplican PR del mismo repo (quien puede empujar una rama), en la base desechable del runner, y
  después de que la llave de producción se usó en su propio paso: ningún paso que corre SQL de un PR la tiene en su entorno (lo vigila
  la simulación).

## Cómo se verificó (2026-10-14)

- **Con datos reales, en un Postgres propio** (Homebrew, puerto aparte, sin tocar la base local compartida). Primero se comprobó que el
  arnés es fiel: armado en el mismo commit que una corrida del CI, dio sus huellas idénticas (0 diferencias en 5 935 objetos). Después,
  `main` de ese momento + `reunir` contra GitHub real (#806 y #1055, 14 migraciones, todas aplicadas) contra producción leída por el
  conector: **de 203 diferencias a 5**. Las 5: los cuatro sin origen de la mañana (uno ya va a `main` en otro PR) y uno pegado media
  hora antes que todavía no estaba en ninguna rama. Una hora después se abrió #1069, que trae a `main` el que venía de la rama
  local, con la casilla marcada: la misma corrida lo sumó sola y quedaron 3.
- **`scripts/migraciones/deriva-pegados.test.mjs`** (9 casos): qué PR cuentan, el orden y los repetidos, que un PR que no arma no
  arrastra a los demás, lo público, y las tres órdenes con un `gh` y un `docker` falsos (también GitHub caído y ningún PR).
- **`deriva-diaria.test.mjs`** simula el workflow entero: los pasos nuevos, que compare con `main-mas-pegados.tsv`, que la llave solo
  esté en el paso de producción, GitHub caído, un PR que no armó, y el verde que dice qué PR se sumaron.
- **`deriva.test.mjs`**: la regla de respaldos (lo quieto se aparta, lo expuesto se ve) y la frase pública nueva, sin nombres ni
  cuentas.

## Cómo se miran los nombres (en privado)

1. Bajar el artefacto `huellas-main-mas-pegados` de la corrida (Actions ▸ «Deriva diaria»).
2. Correr `scripts/migraciones/deriva.sql` en producción, solo lectura (el SQL Editor o el conector de Supabase), y guardar la respuesta.
3. `node scripts/migraciones/deriva.mjs main-mas-pegados.tsv produccion.json` — dice qué no declara nadie.

O pedírselo a Claude: «¿qué no declara nadie en la deriva de hoy?».
