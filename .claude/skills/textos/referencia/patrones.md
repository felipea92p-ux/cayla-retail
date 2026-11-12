# Patrones de texto de /textos — plantillas literales en español del Perú

Cada patrón: **la plantilla** (lo que se rellena va entre `<>`), **bien / mal** con casos de CAYLA, **la pieza del repo** que lo dibuja y
**el nivel** de la regla. Lo que va entre «» es literal. Si la pieza ya trae su texto (`AvisoNoSeDeshace`, `BotonDescargar`), no lo reescribas.

Reglas que valen para todos (SKILL.md, A1–A9): claro antes que ingenioso · lo importante primero · verbo en lo que se toca · mayúscula solo
inicial · sin culpa · qué pasó + cómo se arregla · lo escrito se conserva · «tú» · «cliente», «miembro», «sede», «integrante».

---

## 1. Botón

**Plantilla:** «<Verbo en infinitivo> <qué>», 1 a 3 palabras. Si el verbo solo alcanza (la hoja ya dice qué es), basta el verbo: «Guardar».
Con monto, el monto va después de «·»: «Cobrar · S/ 120.00».

| Bien | Mal | Por qué |
|---|---|---|
| «Registrar gasto» | «Nuevo Registro» | verbo + qué; mayúscula solo inicial |
| «Descargar Excel» | «Exportar» | pieza `accion.exportar` (ADR-0358) |
| «Imprimir ticket» | «Imprimir o guardar PDF» | pieza `accion.imprimir`: «o guardar en PDF» va en la frase de al lado |
| «Anular boleta» | «Sí» / «Aceptar» / «OK» | el botón dice lo que pasa (NN/g, «Delete file / Keep file») |
| «Cancelar» | «Cerrar» al pie de una hoja que guarda | pieza `accion.cancelar`; la × es de la hoja que solo se lee |

- **Mientras guarda:** el mismo verbo en gerundio con «…» (un carácter): «Guardando…», «Anulando…», «Desactivando…»
  (`<Boton cargando textoCargando>`; «Guardando…» viene de fábrica). Nunca `{guardando ? "Guardando…" : …}` a mano.
- **Volver, Ver, Editar, Copiar, Deshacer, Buscar, Filtros, Limpiar:** tienen su pieza y su texto en la tabla «Una función, una pieza»
  (`<Volver a="…">` es solo la flecha, con «Volver a <pantalla>» para el lector).
- **Nivel:** verbo en botones [Norma] (Apple HIG, «Be action oriented»); infinitivo en español [Práctica] (uso del repo).

## 2. Título de pantalla

**Plantilla:** «<Nombre del menú>» — el mismo sustantivo que la entrada del menú izquierdo. Nunca la sede (va arriba, en la línea de sede).
Lo que dice de dónde llegaste va en `detalle`: «Productos · Blusa Emma».

- Bien: «Existencias», «Cierre de mes», «Ventas sin registrar». Mal: «Módulo de Existencias», «Existencias TRU», «Bienvenido a Existencias».
- Pieza: `<EncabezadoPagina titulo>` (ADR-0220, `titulo-pagina`). La frase de explicación va en `subtitulo`/`ayuda` y se abre con el «?».
- **Nivel:** [Práctica] (decisión del repo).

## 3. Título de hoja (modal o cajón)

**Plantilla:** «<Verbo> <qué>» si la hoja hace algo; «<Nuevo|Nueva> <qué>» si crea; «<Nombre de la cosa>» si solo se lee.
Lo concreto va en la bajada (`subtitulo`), no en el título: título «Ajustar stock», bajada «Blusa Emma · Blanco · M».

- Bien: «Abrir caja», «Registrar gasto», «Nuevo cliente», «Cliente» (la ficha). Mal: «Formulario de gasto», «Nueva clienta», «¡Abre tu caja!».
- El botón principal repite el verbo del título: «Abrir caja» → «Abrir caja».
- Pieza: `<Modal titulo subtitulo>` (`modal`, ADR-0596); todo `Dialog` necesita su título, aunque sea oculto (Radix).
- **Nivel:** [Práctica]; el título accesible de un diálogo es [Norma] (patrón WAI-ARIA Dialog que sigue Radix).

## 4. Etiqueta de campo

**Plantilla:** «<Sustantivo>» de 1 a 3 palabras, sin «:», sin «Ingrese», sin pregunta. Obligatorio con `*`; opcional con «· opcional»
(lo pone la pieza: no lo escribas en el texto).

- Bien: «Celular», «Monto», «Motivo», «Fecha de pago». Mal: «Ingrese su número de celular:», «Monto (S/) *requerido*», etiqueta solo en el placeholder.
- Pieza: `<Campo etiqueta>` (`etiqueta-campo`: versalitas de 11 px que pone el CSS; tú escribes en minúscula con inicial mayúscula).
- **Nivel:** etiqueta visible fuera del campo [Práctica] (NN/g, placeholders); marcar obligatorio **y** opcional [Práctica] (Baymard 2021).

## 5. Ayuda del campo

**Plantilla:** una frase que dice **para qué sirve** o **dónde se encuentra** el dato: «<Para qué / dónde está>.» Persistente, bajo el campo
(`<Campo ayuda>` o `pie`), nunca solo en el placeholder.

- Bien: «Lo ves en la boleta impresa, arriba a la derecha.» · «Solo lo ve el líder de equipo.» Mal: «Ingrese el dato correctamente.»
- **El ejemplo («Ej. …», el placeholder, los chips sugeridos) no es de /textos: es de `/sugerir`** (ADR-0290), que lo hace seguir a lo
  que la persona eligió. Aquí solo se revisa que esté bien escrito (A1–A9, F1–F7).
- **Nivel:** [Práctica] (NN/g; Apple HIG «Show hints in text fields»).

## 6. Error de un campo

**Plantilla (dos tiempos, una o dos frases):** «<Qué falta o qué pasa con el dato>. <Cómo se arregla>.»

| Bien | Mal |
|---|---|
| «Falta el celular. Escríbelo con sus 9 números.» | «Campo obligatorio» |
| «El RUC tiene 11 números y aquí hay 10.» | «RUC inválido» |
| «No se entiende el monto: escríbelo así, 1299.50 o 1299,50.» (literal, `MONTO_ILEGIBLE`, ADR-0419) | «¡Formato incorrecto!» |
| «La fecha del pago no puede ser futura: es cuándo se pagó, no cuándo se pagará.» (`PagoJuntosModal`) | «Error: fecha» |

- **Cuándo:** al salir del campo (`useValidarAlSalir`), nunca a la primera letra; tras el primer error se revalida mientras se escribe para
  que se vaya apenas se corrige. Validar al salir fue lo más rápido [Evidencia] (Wroblewski 2009, n = 22, indicativo); revalidar
  tras el primer error es una inferencia de las notas, no un hallazgo del estudio.
- **Dónde:** bajo su campo, `<Campo tono="error" pie>` (con su «!», `role="alert"`); si lo devuelve el guardado, `guia.marcarError(campo, mensaje)`.
  Nunca en un aviso de esquina. Al tocar el botón que confirma, cada campo pendiente dice su error y el cursor va al primero (ADR-0611, mejora 4).
- **Excepción de seguridad:** el inicio de sesión dice «Correo o contraseña incorrectos.» sin decir cuál: WCAG 3.3.3 exime la sugerencia
  cuando arriesga la seguridad [Norma].
- **Nivel:** identificar el campo y describir el error en texto [Norma] (WCAG 3.3.1, A); sugerir la corrección [Norma] (3.3.3, AA);
  sin «inválido» ni culpa [Práctica] (NN/g 2023; Apple HIG: «Avoid robotic error messages… like "Invalid name"»).

## 7. Error de toda la hoja (no se guardó)

**Plantilla — las tres líneas de Formidable (qué pasó · qué se conservó · qué sigue):**
- Título: «No se guardó <qué>» o «No se pudo <verbo> <qué>».
- Línea 2: «Lo que escribiste sigue aquí.» (y que sea cierto: la hoja no se vacía).
- Línea 3: «<Qué hacer>: <acción concreta>.» Si el código no reconoce el error, al final: «Código: <crudo>» (ADR-0022).

Ejemplos:
- «No se pudo guardar el gasto: se cortó la conexión. Revisa el internet y vuelve a intentar.» (forma de `traducirError`, `lib/error-escritura.ts`).
- «No se pudo emitir el comprobante: ese número ya estaba usado, y lo que intentabas guardar NO se guardó. Avisa a tu líder de equipo…»
- Mal: «Ocurrió un error.» · «Error 23505» · «Algo salió mal :(»

- Pieza: `<Aviso tono="error" titulo>` sobre los botones (`role="alert"`, destella una vez). El texto de Postgres **siempre** pasa por
  `traducirError(error, contexto)`; un mensaje de una RPC (`P0001`) ya viene en castellano de CAYLA y **no se re-traduce**: si está mal, se
  corrige en la función de la base (ADR-0022).
- **Nivel:** [Práctica] (NN/g 2023: lenguaje humano, conservar lo escrito, código solo para diagnóstico); visible en texto [Norma] (3.3.1).

## 8. Aviso de éxito

**Plantilla:** «<Cosa> <participio>» + `detalle` opcional con el dato que lo prueba.

- Bien: «Caja abierta» · «Gasto registrado» (detalle «S/ 45.00 en Movilidad») · «Terminal creada» (detalle «Ana ya puede iniciar sesión.»).
- Mal: «¡Guardado exitosamente!» · «La operación se realizó con éxito» · «Éxito».
- Pieza: `avisar.exito(texto, { detalle })` (`components/ui/Avisos.tsx`): 4 s, `role="status"`, sale después del loader (ADR-0149).
  Máximo dos renglones [Práctica] (Carbon). El mensaje es anunciable por el lector de pantalla [Norma] (WCAG 4.1.3, AA; ya lo cumple la pieza).

## 9. Aviso con «Deshacer»

**Plantilla:** «<Cosa> <participio>» + `detalle` con lo que cambió y lo que se conserva + acción «Deshacer».

- Bien: «Proveedor desactivado» con detalle «Deja de aparecer al registrar comprobantes; su historial se conserva.» (`ProveedoresPanel`)
  · «Cambios descartados» con detalle «La ficha volvió a como estaba guardada.» (`ProductoForm`). El participio concuerda con la cosa:
  «Campaña restaurada», «Color desactivado».
- Mal: «¡Listo! Puedes deshacer si quieres» · «Acción realizada» (no dice qué).
- Solo para lo **reversible y de interfaz** (ocultar, desactivar, descartar, mover). **Nunca** para dinero, stock ni comprobantes
  (Formidable, candado 5): eso se confirma (patrón 10).
- Pieza: `avisar.exito(texto, { detalle, accion: { texto: "Deshacer", onClick } })`: dura 7 s como mínimo (`DURACION_CON_ACCION`); no se
  ofrece Deshacer de un Deshacer. Suelto en una pantalla, `<BotonDeshacer>`.
- **Nivel:** preferir deshacer a confirmar [Práctica] (NN/g, Nielsen 2018); que el toast con acción no se vaya demasiado rápido [Práctica] (Carbon).

## 10. Confirmar lo que no se deshace

**Plantilla:**
- Título: «¿<Verbo> <la cosa concreta>?» → «¿Anular la boleta B004-00123?»
- Bajada: la consecuencia en hechos, con cifras: «Se emite una nota de crédito por S/ 120.00 y la venta deja de contar en la caja de hoy.»
- `<AvisoNoSeDeshace />` justo sobre los botones (dice «No se puede deshacer»; no lo reescribas). Donde sí se puede volver a hacer, no se pone.
- Botones: «Cancelar» (fantasma, primero) · «<Verbo> <cosa>» (primario negro): «Anular boleta».

- Mal: «¿Está seguro?» · «¿Desea continuar?» · botones «Sí / No» · un botón rojo con letra crema (ADR-0358, `accion.eliminar`).
- Se confirma **solo** lo irreversible: dinero, stock, comprobantes, borrado (Formidable, ley 7). Confirmar lo trivial enseña a apretar sin leer.
- **Nivel:** [Práctica] (NN/g, Nielsen 2018: confirmar solo lo grave, botones que resumen lo que pasa, sin respuesta por defecto).

## 11. Estado vacío

**Plantilla:** título «Todavía no hay <cosas> <dónde/cuándo>» o «<Cosa> sin <lo que falta>» · frase «<Qué hacer> y <qué verás después>.» · acción «<Verbo> <cosa>».

- Bien: título «Todavía no hay gastos este mes», frase «Registra el primero y aquí verás en qué se va la plata.», acción «Registrar gasto».
- Sin datos para decidir: «Todavía no hay ventas de esta prenda; en unos días verás su ritmo.» (Formidable, ley 9). Mal: «Sin datos», «No hay registros».
- Pieza: `<Vacio icono titulo acciones>`; `tamano="chico"` (una línea con su enlace) dentro de una tabla o una hoja.
- **Nivel:** dar el siguiente paso en una pantalla vacía [Norma] (Apple HIG, «Provide clear next steps on any blank screens»).

## 12. Vacío de búsqueda o de filtros

**Plantilla:** título «Nada coincide con «<lo buscado>»» · frase «Revisa cómo se escribe o busca por <otro dato>.» · acción «Borrar la búsqueda».
Con filtros: los filtros puestos como píldoras que se quitan y «Limpiar filtros».

- Bien: «Nada coincide con «Zara»» (el ejemplo de la propia pieza) · «Revisa cómo se escribe o busca por código.» Mal: «0 resultados», «No se encontraron coincidencias para su búsqueda».
- Pieza: `<Vacio icono={<SearchX/>} titulo filtros>`; `<FiltroPuesto>` y `<BotonLimpiar>`.
- **Nivel:** [Práctica] (decisión del repo, `vacio`).

## 13. Cargando

**No hay texto que escribir.** Cambiar de pantalla muestra el esqueleto (`<EsperaPantalla />`); guardar, el loader único y el botón dice su
gerundio («Guardando…»); buscar mientras se escribe, «Buscando…» dentro del campo (`<Buscador buscando>`), solo si la espera pasa de 350 ms.

- Mal: un «Cargando…» suelto en un párrafo (R16 del auditor), un «Por favor espere…», un porcentaje inventado.
- Una espera que pregunta y vuelve sola dice lo que hace: «Preguntando si ya responde…» (`SinBase`).
- **Nivel:** [Práctica] (ADR-0149).

## 14. Sin conexión

**Plantilla:** título «Sin conexión» · «<Qué pasa con lo tuyo>.» · «<Qué pasará solo / qué hacer>.»

- Literal del repo (`components/SinConexion.tsx`): «Sin conexión» · «Lo que guardes en Vender, Recibir o Nuevo producto queda en este equipo y sube solo al volver el internet.»
- Sin base (`components/SinBase.tsx`): «Sin conexión con la base» · «Si pasan más de unos minutos, avisa a un líder de equipo.»
- Un guardado que quedó sin respuesta: «Todavía no hay respuesta. Revisa el internet y vuelve a tocar «Revisar si se guardó».» (`CambiosFlujo`).
- Nunca «Error de red», «Network error», «fetch failed». **Nivel:** [Práctica] (NN/g: lenguaje humano; ADR-0411).

---

## Textos que ya tienen dueño (no los escribas aquí)

| Texto | Dueño |
|---|---|
| Pie de la guía: «Sigue: Nombre · quedan 2 más» / «Sin elegir: … · puedes seguir así» / «Falta: nombre y motivo» | `/focus` (`components/guia-de-foco/CampoGuiado.tsx`, ADR-0284) |
| Placeholder, «Ej. …», chips y listas sugeridas | `/sugerir` (ADR-0290) |
| «Existe también» y sus preguntas («Usar X» / «No, es otro») | `useExisteTambien` + `<ExisteTambien>` (ADR-0576) |
| Pasos de la demo (título ≤ 40 letras, texto ≤ 320) | `/guia` (ADR-0389) |
| «No se puede deshacer» | `<AvisoNoSeDeshace />` |
| «Hay una versión nueva» · «Actualizar» · «Más tarde» | `components/VersionNueva.tsx` (ADR-0422) |
