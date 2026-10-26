# ADR-0525 — Plan de campaña ▸ Calendario: con cuáles campañas me quedo el año

- **Fecha:** 2026-10-26 · **Estado:** construido y probado en local. La web sigue funcionando sin la base nueva (esconde la pestaña); las decisiones, las campañas propias y los planes de una campaña propia
  se guardan con la migración `20261026190000_plan_compra_calendario.sql`, que está **solo en local** (no en producción): espera el OK puntual de Felipe (ver «Pegarla en producción»).
  El número de este ADR y el de la migración están reservados para la rama `claude/campaign-plan-audit-652032` (`pnpm reservar`).
- **Continúa a:** [ADR-0523](0523-plan-de-campana-presupuesto-y-plan-con-tope.md) (la pestaña Presupuesto, que comparte el marco), [ADR-0522](0522-plan-de-campana-centro-de-avisos.md)
  (el centro de avisos, que ahora respeta el calendario) y [ADR-0349](0349-plan-de-campana.md) (el plan por campaña).
- **Relacionados:** ADR-0358 (una función, una pieza: ver «Lo que se aparta de ella»), ADR-0389 (guías interactivas), ADR-0284 (guía de foco), ADR-0336 (modo oscuro), ADR-0136 (movimiento).
- **Origen:** auditoría `/pantalla` de Compras ▸ Plan de campaña (`docs/pantallas/compras-plan.md`, tareas #7 y #8), spike ① (`docs/maquetas/plan-campana-vision-2026-10/1-calendario.html`), que
  Felipe eligió mirando y pidió que se vea «tal cual en la maqueta» y con «las nuevas funciones y pestañas».

## El problema

El selector del Plan ofrecía «armar plan» para **toda** campaña de Catálogo ▸ Insignias (14 hoy): lo que sirve para publicar en la tienda no siempre sirve para comprar (el Día del Gato no se compra),
nadie podía decir «esta la dejo descansar hasta marzo», «esta vuelve cada año» o «solo este año», y una campaña que existe solo en la compra (el Día del Padre) obligaba a crear una insignia en la tienda web
para poder planearla. Y la pregunta que decide con cuáles campañas me quedo —**¿de verdad vendo más en esa fecha?**— se contestaba de memoria: «solo Navidad duplica» era una frase sin respaldo.

## Lo que se decidió

1. **Una pestaña «Calendario»** (`/compras/plan/calendario`, mismo módulo `plan_compra`; nada nuevo en Roles y accesos) junto a Plan, Presupuesto, Resultados e Historial. Dos vistas del mismo año: **Lista**
   (cuatro grupos: *En mi plan*, *Pausadas*, *Otras fechas — no las compro* y las *quitadas* que se pueden restaurar) y **La línea del año** (una barra por campaña sobre los doce meses, con la marca de hoy).
   Cada fila lleva su interruptor (entra a mi plan o no, en un toque; una pausada o una sin fechas abre su hoja), el nombre con sus fechas, **lo que dijo su historia** (un veredicto), **la barra de
   cuánto sube la venta** (ver 5), sus etiquetas (cada año o solo ese año, con plan…) y «Armar plan» cuando ya toca (faltan 90 días o menos).
2. **La base recuerda lo que se DECIDIÓ, no lo que se calcula.** La tabla `plan_compra_calendario` guarda una fila por campaña sobre la que alguien decidió algo (o por campaña **propia** del plan): si entra a
   mi plan (`activa`), descansa (`pausada`, hasta una fecha o hasta que la reactive) o no la compro (`no`); si se repite cada año o es de un solo año; las fechas del plan si no son las de la insignia (una ventana de
   compra empieza antes que la venta); y si se quitó (se archiva, nunca se borra). **Una campaña de Insignias sin fila no tiene decisión:** la web la trata como «en mi plan» si ya tuvo algún plan y como «no la compro»
   si nunca lo tuvo, así que **nada cambia para quien ya armaba planes** y las 14 no aparecen de golpe en el selector.
3. **Lo que vale HOY se calcula al leer, no se escribe.** Una pausada con fecha de regreso que ya llegó vuelve sola a «en mi plan»: la base no necesita un trabajo programado que la despierte ni puede quedarse
   dormida por una falla. Lo mismo con «solo un año»: cuenta únicamente en ese año y después sale del calendario sin que nadie la quite.
4. **El año de una campaña es el año en que TERMINA** (como en Historial y como el nombre de su plan): una campaña que cruza el año (Navidad, del 1 de dic al 6 de ene) es «Navidad 2027» aunque empiece en 2026.
   Es la misma regla de todo el Plan; el calendario no inventa otra.
5. **«Qué dice tu historia»: cuánto sube la venta de la tienda en esa fecha, con la MISMA vara del Historial y de Resultados** (`medir`: soles por día de la campaña ÷ soles por día de los 60 días de antes, con al menos
   20 días con ventas). Se mide **en la tienda con más historia** (Trujillo) y **solo los años en que se pudo medir de verdad** (la campaña ya terminó, había historia, la base de 60 días tenía ventas): nunca un cero
   inventado ni un año «en curso». El número es la **mediana** de esos años, con el menor y el mayor a la vista (la banda); el veredicto sale solo de la mediana: ≥ ×1,5 «Pico claro», ≥ ×1,1 «Sube un poco»,
   ≥ ×0,95 «No se nota», menos «No sube», y sin años medibles «Sin historia propia». Con menos de tres años dice «poca historia». Un año que se aparta mucho (menos de dos tercios de la mediana) lo señala sin explicarlo:
   **el sistema no sabe de cierres ni de pandemias; quien conoce el negocio sí.**
6. **Campañas propias** (el Día del Padre): viven solo en el calendario, con nombre y fechas, y arman su plan sin crear una insignia (`planes_compra.calendario_id`, igual que el plan de una de Insignias apunta a su
   `etiqueta_id`; nunca los dos, y un plan por campaña propia y año). Crear la insignia (publicar en la tienda web) sigue siendo de Catálogo ▸ Insignias y de un líder.
7. **El calendario manda sobre lo que el Plan ofrece:** el selector, las ranuras «por armar», el aviso «Armar el plan de X» (a 90 días) y Resultados leen la decisión. Una campaña en «no la compro» o pausada no se
   ofrece ni avisa; una quitada no se ofrece en ningún lado del Plan (en el Calendario queda en su grupo, para restaurarla).
8. **Lo que cambias aquí es de TU plan de compra:** no toca la insignia, la tienda web ni la meta de caja (la hoja lo dice en una línea: «De Catálogo ▸ Insignias. Lo que cambies aquí es de tu plan de compra»).

```
DECIDÍ:     que la base guarde solo la decisión de la persona (activa · pausada · no · cada año · solo un año · fechas propias) y que todo lo demás —si vale hoy, en qué año cuenta, cuánto sube la venta—
            se calcule al leer con las reglas de la web que ya usan Historial y Resultados.
DESCARTÉ:   (a) guardar un «estado vigente» que un trabajo nocturno actualice (despertar pausadas, retirar «solo un año»): una falla del trabajo deja campañas dormidas en silencio y es una segunda
            fuente de verdad para algo que se deduce de dos fechas; (b) una casilla «¿la compro?» sobre cada insignia (columna en `etiquetas`): mezcla lo que se publica con lo que se compra y obliga a un
            líder a tocar Insignias para decidir una compra; (c) guardar el multiplicador de cada año en la base: duplicaría `medir` (dos definiciones de «cuánto sube») y se quedaría viejo con cada venta;
            (d) medir con la suma de todas las tiendas: una con años de historia y otra con meses mezclan periodos que no se pueden comparar; (e) un interruptor de dos estados: «descansa hasta
            marzo» y «no la compro» son decisiones distintas y juntarlas obliga a elegir mal.
SE ROMPE SI: la tienda de referencia cambia (la de más historia hoy es Trujillo, con 9 años; si se cierra o si otra tienda trae su historia anterior, la vara cambia de tienda y los multiplicadores se
            mueven sin que nadie haya vendido distinto: por eso la hoja dice con qué tienda midió); o si una campaña vive casi toda en pocos días (un multiplicador de un día de ventas no es una
            mediana de nada: por eso se piden 20 días con ventas); o si alguien escribe `plan_compra_calendario` por fuera de las funciones (el dueño de la base puede: la web no se enteraría de
            qué fila es «de verdad»).
```

## Lo que se aparta de ella (a propósito)

- **El interruptor de cada fila** es un `role="switch"` con la cara del interruptor del sistema (`interruptor` + `interruptor-perilla`), no `<Interruptor>` (`// unificar-fijo`): vive en una fila de
  tabla donde su título es la columna «Entra a mi plan» (sin etiqueta visible al lado), que es lo que la pieza de la familia no resuelve. Una pausada o una sin fechas no cambia en un toque: abre su hoja.
- **La barra de rango** (`RangoDeVentas`) es propia: no es una barra de avance ni una apilada. Es el menor y el mayor de los años medidos, la mediana y la marca de ×1 sobre una escala de ×0,5 a ×3, con el color
  del veredicto —que nunca es lo único: lo dice también la etiqueta de la derecha y el chip de la fila—. CSS en `app/estilos/calendario-plan.css`, solo tokens.
- **«La línea del año»** es una rejilla de doce meses con barras (`LineaDelAnio`), no un gráfico de las piezas de `grafico.*`: es una línea de tiempo de fechas, no una serie de datos.
- **«Nuevo» en la pestaña** vence el 2026-12-31, igual que la de Presupuesto (ADR-0523). En esta revisión se corrigió su letra en oscuro: pasaba **1,8:1** con la letra fija sobre una pizarra que en oscuro es clara;
  ahora la letra se invierte con el relleno (`--color-crema`). Lo mismo con el «1» ámbar de la campana de avisos (1,6:1 en oscuro, de ADR-0522): lo encontró el auditor de modo oscuro (`pnpm --filter web tema:auditar`)
  que, por un servidor de desarrollo desfasado, había estado midiendo en claro.

## Lo que cambió en la pantalla

- Nueva pestaña **Calendario** (`CalendarioPlan.tsx`, `ListaDelCalendario.tsx`, `LineaDelAnio.tsx`, `RangoDeVentas.tsx`, `HojaDeCampanaCalendario.tsx`), con su guía interactiva (`compras.plan.calendario`, 15 pasos) y
  su guía de foco en la hoja (el campo que sigue se enciende; «falta» sale de lo que la base rechaza).
- **La hoja «Configurar» / «Campaña nueva»:** las fechas del plan (las de la insignia si no las cambias), «Cada año» o «Solo 2026», el estado (Activa · Pausada · No compro, con la fecha de regreso), y a la derecha
  **la historia de esa campaña** con el mismo veredicto de la fila. «Quitar del calendario» archiva. `?hoja=nueva` o `?hoja=<clave>` abre una hoja al llegar (lo pide el selector del Plan, también cuando ya se está en el Calendario).
- La cabecera del Plan, las pestañas y el centro de avisos viven en `MarcoPlan` (commit aparte, ADR-0523); el **Resumen** quedó a la derecha de las notificaciones (pedido de Felipe).
- **Lógica nueva, con su prueba:** `lib/plan-compra-calendario.ts` (la decisión y lo que vale hoy), `-vista.ts` (los cuatro grupos y la línea del año), `-hoja.ts` (lo que impide guardar, igual que la base),
  `-evidencia.ts` (cuánto sube la venta y el veredicto; varias lecturas de 1200 días unidas en una) y `-servidor.ts` (la lectura). 60 pruebas nuevas y las de `plan-compra-reglas`, `-historial` y `-avisos`
  actualizadas.

## La base (la migración `20261026190000`, solo en local)

1. **`plan_compra_calendario`** (RLS encendido y **sin políticas**: la web no la lee ni la escribe directo) con los candados en el esquema, no en la pantalla: una fila por campaña de Insignias a lo sumo
   (`unique`), una propia lleva nombre y sus dos fechas (`check`), un nombre propio no se repite (índice por `fn_clave_texto`), «cada año» no trae año y «solo un año» sí, solo una pausada trae regreso, y una
   quitada dice quién la quitó. Una fecha «mes-día» que no existe (el 31 de abril) la rechaza la función con `make_date`.
2. **`planes_compra.calendario_id`** (la columna que une el plan de una campaña propia con su fila) con un `check` (insignia o propia, nunca las dos) y un `unique` (un plan por campaña propia y año).
3. **Seis funciones públicas** (todas piden el módulo «Plan de campaña» y firman con el responsable del combo): `fn_plan_compra_calendario` (la lectura), `guardar_plan_compra_calendario` (la decisión completa),
   `cambiar_uso_plan_compra_calendario` (el interruptor), `quitar_plan_compra_calendario` y `restaurar_plan_compra_calendario`, y `crear_plan_compra_propio` (el plan de una propia en un año). Dos internas
   (`fn_plan_compra_md_valido`, `fn_plan_compra_md_en`): ni la tienda ni nadie de afuera las ejecuta.
4. **Nada se borra:** quitar archiva (`quitada_en`, `quitada_por`) y se restaura.

```
DECIDÍ:     que el calendario sea una tabla de decisiones con los estados imposibles cerrados por el esquema (dos filas de la misma campaña, una propia sin fechas, un regreso sin pausa) y que el interruptor
            y la hoja pasen por funciones que firman al responsable.
DESCARTÉ:   (a) validar solo en la hoja: la base aceptaría lo que otra pantalla o un guion mande, y «Día del Padre» podría existir dos veces con el mismo nombre; (b) dejar la tabla al alcance de la web con
            políticas: cada `create policy` en Supabase toma en exclusiva las tablas de `auth` y `storage` y obliga a partir la migración en partes (ADR-0195); sin políticas es una sola parte y la web solo entra por
            funciones que además firman quién; (c) un `delete` al quitar: se perdería quién decidió y cuándo, y «Restaurar» no existiría.
SE ROMPE SI: cuatro personas prenden y apagan la misma insignia a la vez (probado: queda UNA fila y nadie recibe un error de choque), o dos crean una propia con el mismo nombre a la vez (probado: una
            entra y la otra recibe el mensaje claro); lo que sí puede pasar es que dos personas decidan cosas distintas de la misma campaña en el mismo segundo: gana la última escritura, y la fila
            dice quién fue.
```

**Pegarla en producción (con el OK de Felipe).** Una sola parte: una tabla NUEVA con su `alter … enable row level security`, una columna nueva en `planes_compra` (con su llave foránea y sus candados) y
funciones; **sin políticas**; `lock_timeout` de 3 s; idempotente (pegarla dos veces deja lo mismo; lo prueba `M1`). Va **después** de `20261026184000`. Se comprueba con:

```sql
select count(*) from information_schema.tables where table_schema = 'retail' and table_name = 'plan_compra_calendario';            -- 1
select column_name from information_schema.columns where table_schema = 'retail' and table_name = 'planes_compra' and column_name = 'calendario_id';  -- una fila
select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_plan_compra_calendario', 'guardar_plan_compra_calendario',
  'cambiar_uso_plan_compra_calendario', 'quitar_plan_compra_calendario', 'restaurar_plan_compra_calendario', 'crear_plan_compra_propio');            -- 6
```

Después, refrescar el diccionario de datos (`pnpm datos:generar:produccion`, `docs/datos/generado/COMO-REFRESCAR.md`).
**Orden con la web: da igual.** La web nueva con la base vieja recibe «no existe esa función», esconde la pestaña Calendario y el selector ofrece todas las campañas **como hoy**. La web vieja con la base nueva
ignora el calendario. **Un cambio de comportamiento al pegarla:** en cuanto exista la tabla, las campañas de Insignias que nunca tuvieron un plan **dejan de ofrecerse solas** en el selector (se tratan como
«no la compro» hasta que alguien las prenda en el calendario); las que ya tienen plan siguen igual. Es lo que se quiere, pero hay que decírselo a quien arma los planes.

**Caída externa.** La base lenta o caída: el selector ofrece todas las campañas como siempre y el Calendario dice que no pudo leerse (nunca una pestaña vacía que parezca «no hay campañas»). La lectura de la
**historia** pide varias ventanas de hasta 1200 días (el límite de `fn_historial_ventas`) y las une: si **una** falla, no hay evidencia de **ninguna** campaña, porque un año sin sus días daría un
multiplicador hecho de datos a medias que parece verdadero. Se degrada así —el calendario y las decisiones siguen, la barra dice «sin historia propia»— y no pierde ningún dato.

**Probado (`pnpm pruebas:plan-compra-calendario`, 32 casos; cada uno en su transacción con ROLLBACK, salvo la concurrencia, que usa filas reales y las borra al terminar):** los candados del esquema (cada «estado imposible» de la cabecera de la migración se intenta y se rechaza), el año en que termina una
campaña que cruza el año, una pausada que regresa, «solo un año», quitar y restaurar con su autor, las puertas (el rol de la tienda ejecuta las seis, `anon` ninguna, quien no tiene el módulo recibe 42501 y
no escribe), pegarla dos veces, y **cuatro interruptores a la vez** sobre la misma insignia con sesiones reales.

## Lo que viene (no está en este cambio)

La historia por campaña **al cierre** (el veredicto de «¿valió la pena?» en Resultados, tarea #8), el Paso 2 por colores y tallas, el ranking de modelos, «Enviar a Compras» y Finanzas ▸ Inversión en mercadería
son las siguientes pestañas de la misma visión. **«Programa del año»** (decidir un año entero de una vez) queda como decisión de Felipe (#12): el calendario ya da la lista.

## Cómo se verifica

En `/compras/plan/calendario`: la lista dice «Tu calendario 2026: N campañas» y reparte lo que hay; apagar una campaña con plan la deja en «no la compro» sin borrar el plan; pausar con una fecha futura la manda a
«Pausadas» y el selector deja de ofrecerla; «Campaña nueva» crea una propia que se puede planear sin insignia; la barra de cada fila coincide con el multiplicador del Historial de esa campaña (misma vara) y la
hoja dice con qué tienda y cuántos años. Probado en escritorio (claro y oscuro, **con el auditor midiendo en oscuro de verdad: 0 hallazgos**) y a 375 px; `guias:recorrer compras.plan.calendario`
(15 pasos) sin errores.
