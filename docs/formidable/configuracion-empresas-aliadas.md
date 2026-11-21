# Formidable · Configuración ▸ Empresa y tiendas ▸ Empresas aliadas   (`/configuracion?tab=empresa`)

- **Fecha / SHA:** 2026-11-21 · eb9687562   · **Dispositivo que manda:** escritorio (solo el Admin la usa)
- **Pregunta que debería resolver:** «¿Quién más vende en mis tiendas, y está todo listo para que venda y cobre?» · **Protagonista:** la empresa aliada
- **Veredicto en una línea:** «Se registra una aliada a la primera, pero la tarjeta no dice si está lista para vender y la hoja explica de más.»

Alcance: la sección (`components/vitrinas-sedes/EmpresasAliadas.tsx`), su hoja «Nueva empresa aliada / Editar» y la de «Dar de baja»
(`HojaEmpresaAliada.tsx`). Base local con datos inventados y restaurada después; la banda de CAYLA vacía y «El padrón no respondió» son del
entorno local (sin `configuracion_empresa` ni llave del padrón), no se cuentan.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciega: completó al primer intento, 13 pasos, 9 dudas · real: sin probar (tope 8) |
| 2 Una pregunta, una respuesta | 8 | [Observado] un solo botón principal por vista; la ciega fue directo a «Agregar empresa aliada» |
| 3 Simplicidad profunda | 5 | [Medido] la tarjeta incompleta solo dice «Sin RUC» (`EmpresasAliadas.tsx:117`), sin veredicto; las tarjetas de sede al lado sí dicen «Falta…» |
| 4 Lenguaje de tienda | 7 | [Medido] el error del padrón dice «confírmalo con el cliente antes de emitir» (`ConsultaDocumento.tsx:326`), copia de Vender; regímenes con nombre oficial y su línea (escéptico: refutado como jerga) |
| 5 Contenido primero | 7 | [Observado] la empresa manda en la tarjeta; la razón social repite el nombre («Rosa Quispe · Rosa Quispe · RUC…») |
| 6 Lo difícil, a un toque | 5 | [Medido] «Entra a las campañas de CAYLA» no tiene «?» (`:168`); [Observado] la ciega no supo qué hacía |
| 7 Perdonar antes que preguntar | 6 | [Medido] una fila de cuenta vacía impide guardar (`problemaCuenta`) aunque `argsGuardarAliada` la descartaría; la baja sí se deshace |
| 8 Quitar antes de agregar | 5 | [Medido] la ayuda del RUC sale tres veces («?», línea fija y línea de RUC válido); «Nunca te pediremos la clave SOL» siempre a la vista |
| 9 De punta a punta | 6 | [Medido] la tarjeta no distingue una aliada a medias; /chaos de la hoja cerrado (Escape pregunta, foco vuelve) |
| **Leyes (promedio)** | **6,2** | ley 3, 6 y 8 en 5 |
| **Oficio visual** | **7** | [Medido] sección 2/8 y hoja 2/8, todo heredado de piezas del sistema (interruptor 38×22, globito 10,5 px, `casilla-input` 20 px con su etiqueta tocable, versalitas de 11 px); sin desborde a 1440, 1024 y 375. [Observado] «Buscar» queda ~18 px bajo la caja del RUC y su ayuda pega con «Razón social» |

## Los 3 cambios de mayor impacto (esperan el OK de Felipe)
1. **La tarjeta dice si la aliada está lista para vender.** Antes: «Sin RUC» y nada más. Después: la línea «Falta RUC, régimen…» como las
   tarjetas de sede, y la razón social solo si es distinta del nombre. Ley 3 y 9. Se verifica con CLAURE (hoy sin RUC ni régimen). S. Presentación.
2. **Una cuenta que se abrió y quedó vacía no impide guardar.** Antes: «Agregar una cuenta» + nada escrito = «Falta: Cuentas para cobrar» y
   botón rojo. Después: la fila nueva vacía no cuenta (la base ya la ignora). Ley 7. Prueba en `empresas-aliadas-reglas.test.ts`. S. Presentación (no cambia qué guarda la base).
3. **Explicar a un toque, no a la vista.** RUC: una sola ayuda (el «?») y «Buscar» alineado con la caja; error del padrón con texto de
   empresa, no de cliente; «?» junto a «Entra a las campañas de CAYLA»; la clave SOL al «?». Ley 6 y 8. `ConsultaDocumento` se cambia por
   props: en modo «botón» solo lo usa también Proveedores. M. Presentación.

## Lo que sobra (ley 8)
- La línea fija de ayuda del RUC: el «?» dice lo mismo.
- «Nunca te pediremos la clave SOL.» siempre a la vista: va al «?».
- La razón social igual al nombre en la tarjeta.

## Lo que no pediste y importa más
**Editar CLAURE hoy obliga a escribir el número del Yape de Claudia.** [Medido en producción, solo lectura] su cuenta «Yape de Claudia · LIM»
no tiene número ni medio. Al abrir CLAURE para cargarle el RUC, la hoja la carga como Yape vacío y no deja guardar sin el celular; quitarla
la archivaría (es la cuenta de sus cobros, ADR-0638), y guardar la renombra a «Yape de CLAURE». Dinero: lo decide Felipe.

## Lista aparte (no se ejecuta)
- «Cuentas para cobrar» bajo el pliegue a 1440×900 (escéptico: matizado; la guía lleva ahí).
- La tarjeta enmascara la cuenta («Yape ··· 321»): a propósito (escéptico: matizado).
- `/configuracion` sigue «pendiente» en `guia-de-foco-pantallas.ts` aunque `pnpm focus` ya ve su guía (deuda de main).
- La hoja de la aliada no tiene escenario en `tema/escenarios/registro.mjs` (actividad 4 de la rama).

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | «Ajustes de la empresa y tiendas; mi tarea va en Empresas aliadas ▸ Agregar» — coincide |
| Primer intento | sí, sin retroceder |
| Pasos | 13 (mínimo ≈ 11) |
| Dudas | 9: «Nombre en la tienda» vs «Razón social»; si «Buscar» era obligatorio; Yape en «Teléfono» o en «Celular»; qué hace «Entra a las campañas de CAYLA» |
| Palabras no entendidas | «Empresas aliadas», «Razón social», «Padrón», «Régimen», «Entra a las campañas de CAYLA» |
| Errores evitables | 0 en lo que guardó |

Escéptico: H1, H2 y H4 confirmados; H3, H5, H6 y H7 matizados; H8 (regímenes como jerga) refutado. Sumó la fila vacía que bloquea, el texto
del padrón copiado de Vender y la tarjeta que no distingue una aliada a medias.

## Antes de decir «listo»
- Concurrencia: cubierta en la base (`pruebas:empresas-aliadas`, dos altas a la vez) y en el navegador (/chaos NAV-05, dos pestañas).
- Caída externa: el padrón sin respuesta deja escribir la razón social a mano; red caída al guardar avisa y no duplica (/chaos RS-01, RS-03).
- Persona sin contexto: ciega ✓ · real sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-11-21 | eb9687562 | 6,2 | 7 | — (esperan el OK) |
