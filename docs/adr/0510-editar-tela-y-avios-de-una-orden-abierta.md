# ADR-0510 — La tela y los avíos de una orden se pueden declarar y corregir después de abrirla

**Estado:** aceptada, **web y base en su PR; la migración `20261026035000` espera el OK de Felipe para pegarse en producción** · **Fecha:** 2026-10-25 ·
**Decidió:** Felipe (la lista de 5 actividades, aprobada el 2026-10-25) · **Sigue a:** ADR-0400 (decisión 6: la tela de la orden) y ADR-0509 (Nueva orden sobre la lista)

## Contexto

Felipe (2026-10-25, con la captura de una orden): «¿dónde agrego el material y la cantidad de tela que requiere cada prenda, aproximada, y los avíos?».
La tela y los avíos de una orden (`produccion_insumos`: cuánto lleva cada prenda y cuánto hay que pedir) solo se escribían **una vez, al abrirla**
(`abrir_orden_produccion`). La revisión del código encontró cinco fallas encadenadas:

1. **Sin salida.** Una orden abierta sin tela decía «Esta orden no declaró qué tela lleva» y no había cómo arreglarlo: «Anotar lo que usaste» solo ofrece lo
   declarado, y la base de insumos sí deja descontar tela no declarada (`registrar_consumo_insumo` no la exige), pero la pantalla no.
2. **Corte se cerraba callado.** La pregunta «¿cuánta tela usaste?» solo sale si hay una tela declarada.
3. **«Pasar al stock» no avisaba.** El aviso «todavía no anotaste la tela» exigía una tela declarada, y la regla decía que una orden sin tela era «legítima»:
   el lote entraba al stock con costo por prenda sin tela (la OP-343 entró a S/ 4.50 en vez de S/ 22.38), y ese costo alimenta el promedio de la prenda en
   todas las sedes.
4. **El avío era de toda la orden o nada** (el hilo del beige y el del gris perla eran el mismo renglón), y la sección de la orden los mostraba bajo «Tela».
5. **Dos errores de cuenta que salieron al probar:** «+ Agregar avío» no mostraba la fila nueva cuando el modelo tenía colores (la lista de la hoja descartaba
   las filas de avío sin elegir, y un modelo sin color descartaba todos sus avíos); y un plan de hilo de 0.24 conos se mostraba como «Pedir 0 conos · Faltan 0 conos».

## Decisión

**1. Una función de la base que reemplaza la lista: `guardar_insumos_orden(orden, tela y avíos)`** (migración `20261026035000`, solo `create or replace`).
Recibe la lista COMPLETA con la misma forma que `abrir_orden_produccion` y la valida con la MISMA función (`fn_produccion_insumos_normalizar`) sobre las líneas
reales de la orden. Exige el módulo `produccion` parado en el Taller y firma con `fn_actor_persona_id(true)`. Toma `select … for update` de la fila de
`producciones` —la misma que toma `registrar_consumo_insumo`—, así que una persona que anota consumo y otra que edita la tela se forman en fila.
Reglas: solo en proceso; **una tela o avío con consumo anotado no se quita** (`insumo_con_consumo`) pero sí se corrige cuánto lleva cada prenda, o se quita uno
de sus colores si le queda otro; una fila que no cambió de consumo no se toca (su plan, congelado al abrir, no se mueve aunque la merma del catálogo cambie);
un parámetro faltante o que no es lista no vacía el plan (`insumos_invalidos`: vaciar se pide con `[]`); repetir la misma lista da el mismo resultado y no anota
otra actividad. Si el modelo todavía no tiene consumo, la primera tela nueva lo deja declarado, como al abrir; sin el interruptor «dejar como el del modelo»
(ese sigue solo en Nueva orden).

**2. La hoja «Editar tela y avíos»** en la sección de la orden (`EditarTelaModal`): el mismo bloque de Nueva orden sobre lo declarado, y «Declarar tela y avíos»
cuando la orden no tenía nada. Antes de guardar avisa lo que la base rechazaría (`problemasDeEdicion`); con consumo anotado muestra «Plan 15.1 m · ya se usaron
5 m» en lugar de un «Alcanza» que ya no es cierto (el estante bajó).

**3. El avío puede ser de UN color** (selector «Para», solo si la orden fabrica más de uno): plan = consumo × prendas de ese color. Un avío se reconoce por su
tipo en Insumos, no por no tener color (`telasDeLaHoja`). La sección de la orden se llama **«Tela y avíos»** y cada avío lleva su etiqueta «Avío».

**4. Avisos, nunca candados.** Al terminar Corte, y en «Pasar al stock», una orden sin ninguna tela declarada lo dice; en «Pasar al stock» trae «Declarar la tela»,
que abre la hoja. Una muestra no avisa al pasar al stock (no entra ni deja costo). **Esto revierte la regla del 2026-10-16** («una orden sin tela declarada no avisa
nada: es legítimo») porque esa regla existía porque no había cómo declararla después; ahora sí lo hay.

**5. Lo que se pide se redondea hacia arriba** a lo que admite la unidad (`cantidadAPedir`: metros a un decimal, kilos a dos, conos y unidades enteros):
0.24 conos se piden como 1; 15.12 m, como 15.2. El plan guardado en la base no cambia.

## DESCARTÉ

- **Tres funciones (agregar, corregir, quitar).** Son tres puntos donde el plan puede quedar a medias y un doble clic repite la mitad; una lista completa que
  reemplaza es declarativa (repetirla no cambia nada).
- **Dejar editar el plan sin mirar el consumo.** Se quitaría una tela con metros ya descontados y el costo real de la orden quedaría sin renglón en pantalla.
- **Que un aviso bloquee «Pasar al stock».** Hay órdenes que de verdad no llevan tela propia (el Taller recibe prenda ya cortada); el aviso informa y ofrece, la persona decide.
- **Cambiar `registrar_consumo_insumo` para que declare lo que se usa.** Toca stock y dinero en una función ya parchada en vivo; la salida correcta es que la orden
  declare lo que lleva, y que el consumo lo descuente.
- **Una ficha de consumo por talla y por modelo ahora** (la `por_talla` de `producto_consumos`, que nada escribe ni lee, y los avíos guardados en el modelo).
  Es la pieza grande, con diseño propio: se ve en maqueta antes de decidir (queda en el backlog).

## SE ROMPE SI

- Una tela de la orden se **archiva en Insumos** después de abrirla: el validador la rechaza al guardar (`insumo_archivado`) y hay que desarchivarla, o quitarla si
  no tiene consumo. Es a propósito (una tela archivada no se vuelve a elegir) y la hoja lo dice.
- Dos personas **editan la tela de la misma orden a la vez** desde pantallas abiertas antes: gana la última que guarda (reemplaza la lista entera). El consumo
  anotado entre medio no se pierde (la base rechaza quitar lo usado), pero un cambio de consumo hecho en la primera se pisa sin aviso. Con 3 tiendas y 1 Taller, el
  caso es raro; si se vuelve común, `version` en la orden.
- **PostgREST con la caché del esquema vieja** tras pegar la migración (visto en el entorno local sin Docker): la función «no existe» hasta que se recarga
  (`notify pgrst, 'reload schema'`). En Supabase se recarga sola.

## Cómo se pega en producción

`supabase/migrations/20261026035000_produccion_editar_tela_y_avios_de_la_orden.sql`, **una sola parte**, después de 154000 y 155000 (que ya están): solo
`create or replace function` y permisos; ninguna política ni `alter` (no choca con el Asesor de seguridad, ADR-0195). Idempotente. **Espera el OK de Felipe.** Sin
ella, la web nueva funciona hasta el botón «Guardar», que dice que no se pudo guardar.

## Verificación

`pnpm pruebas:produccion-editar-tela` (18 casos contra Postgres, todos con ROLLBACK; comprobada con tres mutaciones que la hacen fallar: no mirar el consumo,
quitar el `for update`, no validar). Pruebas puras: `orden-tela-editar-reglas`, `orden-tela-reglas` (`telasDeLaHoja`, `prendasDeLaFila`, `cantidadAPedir`),
`orden-tela-sin-anotar-reglas`, `orden-pagina-reglas`, `orden-pagina-guia`. Navegador (entorno local sin Docker): declarar, editar, quitar lo usado (bloqueado),
doble clic (una sola edición), avío de un color, los dos avisos y «Declarar la tela»; modo oscuro sin hallazgos; guía recorrida sin escribir nada.
