# ADR-0416 · Clientes, Colaboradores y Configuración después de /chaos: sin `NaN`, fichas con algún dato y anonimizar es de un líder

- **Fecha:** 2026-10-15 · **Estado:** construido y verificado en local (suite de base con controles, suites vecinas, vitest). **Las dos
  migraciones NO están en producción:** esperan el OK de Felipe. Rama `claude/chaos-personas-5c56e1`.
- **Pedido:** Felipe, 2026-10-15: «pega las migraciones y aplica tus recomendaciones para el resto». Este es el último módulo de la corrida
  del 2026-10-13 que quedaba abierto fuera de Compras (que se está reconstruyendo).
- **Extiende:** ADR-0398, 0405, 0409, 0412 (montos finitos), ADR-0288 (club y fichas de clientes), ADR-0306 (quien ve el módulo hace lo de
  adentro, salvo lo que se protege con `fn_es_lider()` a la vista).

## Lo que estaba abierto (corrida del 2026-10-13, semilla `20261013`)

1. **Gravedad 1, solo por la API:** una meta diaria y un fondo de caja en `NaN` (`guardar_metas_tienda`); el fondo de caja es con lo que
   abre la caja. Y quedaban tablas fuera de Compras que aceptaban `NaN` (club, descuentos, la planilla del piso, lo histórico).
2. **Gravedad 2:** una ficha de cliente vacía; un cumpleaños el 31 de febrero (la tabla miraba día y mes por separado); un año de
   nacimiento 2030; un nombre de 5000 letras. La pantalla ya frenaba el cumpleaños y el año; la base no.
3. **Pregunta:** anonimizar una ficha (borra sus datos personales sin vuelta atrás) lo hacía cualquiera con el módulo de Clientes.
4. **Observación:** un rol sin «Inicio». No es un problema: la cuenta cae en la pantalla principal de su rol o en la primera de sus módulos
   (`aterrizajeDe`, `lib/menu.ts`), y sin ninguna, en «Sin acceso». No se cambia nada.

## La decisión (recomendaciones aplicadas)

- **Base, parte 1** (`20261015154000`, solo `alter table`): `<tabla>_montos_finitos` en 19 tablas (Configuración, Colaboradores, Clientes
  y el club, y lo que quedaba en Ventas, Inventario, Catálogo y Gestión fuera de Compras); en `clientas`, `clientas_con_algun_dato`
  (documento, nombre o celular: lo mismo que pide Nuevo cliente), `clientas_cumple_fecha_real` (el día cabe en su mes; el 29 de febrero,
  en año bisiesto si se escribió el año) y `clientas_textos_con_tope` (nombre 120, motivo de archivo 300; en producción, 39 y 23).
- **Base, parte 2** (`20261015155000`): `archivar_clienta` con `p_anonimizar` exige un líder (`anonimizar_solo_lider`; en producción la
  única ficha anonimizada la anonimizó un líder, así que no corta ningún trabajo diario). Archivar sin anonimizar sigue siendo de quien ve
  Clientes. Un disparador rechaza un año de nacimiento posterior al de hoy (`cumple_anio_futuro`): depende de la fecha de hoy, y un CHECK
  no debe.
- **Web:** la hoja de la ficha muestra «Anonimizar» desactivado para quien no es líder, con el porqué; las frases de los candados nuevos
  viven en `error-escritura.ts`. Además, un endurecimiento de «Elige sede» de CAYLA Global (`lib/elige-sede-reglas.ts`): solo vuelve a una
  ruta del propio ERP, con la misma idea que `desdeSeguro` de Productos.

## Cómo se pega en producción

Dos partes, cada una en su llamada y en este orden: `20261015154000` (solo `alter table`; `ubicaciones` y `colaboradores` las lee todo el
ERP: fuera de horario, y si el `lock_timeout` de 3 s salta, se vuelve a pegar) y `20261015155000` (un reemplazo anclado, una función y su
disparador con `create or replace trigger`). Ninguna lleva políticas. Antes: ninguna fila que viole los candados (verificado el
2026-10-15) y `archivar_clienta` idéntica a la de local.
