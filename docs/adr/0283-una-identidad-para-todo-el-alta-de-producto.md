# ADR-0283 · Una identidad para todo el alta de producto

- **Fecha:** 2026-09-29 · **Estado:** construido, web solamente (sin migración). Probado con pruebas y en el navegador con una
  sesión de Admin; el camino de una terminal sin persona **no se pudo ejercer en local** (la base local no tiene asistencia).
- **Pedido:** Felipe, 2026-09-29: una colaboradora daba de alta prendas en el almacén y, al crear tejidos, patrones, etc.
  nuevos, se le pedía validación en cada uno. «Si ella inició el flujo de añadir producto, sigue añadiendo esas cosas
  nuevas: las casillas deberían salir marcadas con su nombre. Que solo se coloque la identidad de quien realiza la operación
  y se resetee cuando sale del flujo.»
- **Complementa:** ADR-0161 (el combo «Responsable»), ADR-0280 (veintiocho acciones sin combo). **Corrige** una consecuencia del
  ADR-0280 en las ocho acciones del alta.

## Qué había

Antes del 2026-09-29, cada guardado de mitad de formulario (categoría, tejido, talla, etiqueta, color, marca, muestra, valor)
pedía su propio combo: hasta 9 veces el mismo nombre. El ADR-0280 los soltó todos del combo —la colaboradora ya no se
equivoca de pantalla—, pero lo hizo **sin persona**: con una cuenta personal el guardado queda a su nombre, pero en una
**terminal compartida** (la del almacén, que es donde se da de alta) el tejido, el color o la marca nuevos quedan solo a nombre
de «Terminal Almacén». El propio ADR-0280 lo dejó dicho: «con una diferencia… la historia diría "terminal", no "Rosa"».

## Decidí

**Quien abre «Nueva prenda» se identifica UNA vez, arriba, y esa identidad firma la prenda y todo lo que crea a mitad de camino.**

- **Dónde:** un recuadro «Quién registra» (`QuienRegistra`, `components/alta-producto/IdentidadAlta.tsx`) encima del paso 1.
  Es el único `<ComboResponsable>` del alta. Con la cuenta de una persona de turno viene ya elegida ella; con una terminal,
  vacío hasta que se elige; un Admin ve su aviso de siempre. El paso 4 («Quién lo registra») ya no tiene combo: muestra el
  nombre y un «Cambiar» que sube al recuadro.
- **Cómo firman los guardados de mitad:** los ocho componentes piden su firma con `useFirmaDeMitad(clave)`. Dentro del alta
  devuelve los mismos encabezados (`x-responsable`, `x-ubicacion`) que el guardado final de la prenda; la base los valida
  igual que antes del ADR-0280. **No cambia ninguna función ni tabla.** Mientras no haya identidad vigente, esos botones quedan
  apagados y una línea dice por qué («Elige arriba quién registra el alta.» + «Ir a elegir»; dentro de una hoja, sin el enlace,
  porque el recuadro queda detrás del velo).
- **Cuándo se acaba (Felipe, 2026-09-29):** la identidad vive en el estado de `NuevoProductoForm` (`useResponsable`), así que
  **salir de la pantalla la acaba**. **«Crear otro parecido» la conserva**: quien carga 20 prendas seguidas se identifica una
  vez. Guardar la prenda con éxito ya no la suelta (`if (error) responsable.despues(error)`); solo la suelta un rechazo de la
  base por el responsable (ya no está presente, etc.), que además relee la lista de quién está de turno.
- **Fuera del alta no cambia nada:** `useFirmaDeMitad` sin proveedor devuelve la firma soltada del ADR-0280 con su clave. Así
  la marca nueva desde Catálogo ▸ Marcas o desde la ficha/el conteo, y el color desde «Agregar colores» de la ficha, siguen
  sin combo. Solo `alta_producto_marca` y `alta_producto_color` se usan hoy como respaldo; las otras seis claves de
  `retail.acciones_sin_responsable` quedan sin uso en la web (se dejan en la base: quitarlas exige una migración a producción y
  no molestan).

## Descarté

- **Un combo por cada guardado de mitad, como antes del ADR-0280.** Es la fricción que se quiso quitar.
- **Dejarlo como el ADR-0280 (sin persona).** Sin fricción, pero pierde el rastro de quién creó el tejido, el color o la marca en
  una terminal. Felipe eligió conservar el nombre.
- **Recordar «el último responsable del turno» en todas las acciones.** Es la pregunta abierta del ADR-0280 para las otras
  veinte acciones; aquí se resuelve solo dentro del alta, donde hay un flujo con dueño claro y un momento en que se acaba.
- **Bloquear todo el formulario hasta elegir identidad.** Habría cambiado el acordeón entero por un caso (la terminal); con el
  recuadro arriba y los botones de mitad apagados alcanza, y nadie se queda sin poder llenar la prenda.

## SE ROMPE SI

1. Un componente nuevo del alta que guarde a mitad de camino firma a mano (`encabezadosOmitidos`, `firmaOmitida`) o pinta su
   propio `<ComboResponsable>` en vez de pedir `useFirmaDeMitad`: vuelven la fricción o los guardados sin nombre. Lo vigila
   `lib/identidad-alta-reglas.test.ts` (ningún archivo de `components/alta-producto/` puede llamarlas; solo `IdentidadAlta.tsx`
   pinta el combo, y `NuevoProductoForm.tsx` monta exactamente un `<QuienRegistra>`).
2. `NuevoProductoForm` vuelve a llamar `responsable.despues(error)` sin el `if (error)`: tras cada prenda guardada la identidad
   de una terminal se borra y «Crear otro parecido» vuelve a pedirla. También lo vigila esa prueba.
3. La identidad queda en pantalla cuando otra colaboradora toma la terminal sin salir de «Nueva prenda»: se firma a nombre de la
   anterior. **Riesgo aceptado por Felipe** (respuesta a «¿se conserva o se pide de nuevo?»). Se mitiga con lo que ya hay: el
   recuadro de arriba y el paso 4 muestran el nombre antes de crear. Si la práctica muestra que pasa, la salida es pedirla de
   nuevo tras un tiempo sin uso.
4. La persona elegida deja de estar «presente» a mitad del alta: los guardados de mitad se apagan (y el final también). Es la
   regla A3 del ADR-0161, no un error nuevo.

## Lo que cambió respecto del ADR-0280 (dicho de frente)

- **Una persona con cuenta propia SÍ tiene que estar presente** (haber marcado entrada) para crear un tejido, color, marca,
  talla, etiqueta o valor dentro del alta. El ADR-0280 la había exentado; no cambia en la práctica porque el guardado final de
  la prenda ya lo exigía, pero ahora se nota antes: el recuadro de arriba bloquea desde el inicio, no al final.
- **En una terminal esas ocho acciones ya no quedan sin persona:** quedan a nombre de quien inició el alta.

## Cómo se verifica

- Pruebas: `pnpm --filter web test lib/identidad-alta-reglas` (firma con la persona, sin clave omitida, bloqueo sin identidad,
  respaldo fuera del alta, y las tres protecciones de la sección anterior); `tsc` y `eslint` limpios; 153 027 pruebas de la web en verde.
- A mano, **con una terminal** (no se pudo en local: falta la asistencia de Dynamic) o en producción con la cuenta de una
  persona: abrir «Nueva prenda» → el recuadro trae el nombre (o queda vacío en terminal) → crear un color nuevo y una marca
  nueva → el color queda con `propuesto_por` = esa persona (consulta de solo lectura a `retail.colores`) → «Crear otro parecido» → el recuadro sigue
  con el mismo nombre → salir y volver: vacío otra vez (terminal).
