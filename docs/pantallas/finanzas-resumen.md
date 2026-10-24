# Pantalla — Finanzas ▸ Resumen (`/finanzas/resumen`)

> Modo: **rápido** · Fecha: 2026-10-24 · Rol/sede: Admin (líder), vista «Todas las sedes» · Datos: **sin SQL, sin captura real** (cifras de ejemplo de la maqueta v3)
> SHA analizado: `origin/main` `2097ad099` (el Pulso viejo) **y** el PR #1311 en `d224b50c8` (el Resumen en El telar, abierto). Si `ResumenFinanzas.tsx`, `RecorridoPlata.tsx`, `resumen-telar-reglas.ts` o `recorrido-plata-reglas.ts` cambian después, este análisis está vencido.
> Archivos: `app/(app)/finanzas/resumen/page.tsx` · `components/finanzas/ResumenFinanzas.tsx` · `RecorridoPlata.tsx` · `ResumenDecidir.tsx` · `Confianza.tsx` · `lib/resumen-finanzas-reglas.ts` · `lib/resumen-telar-reglas.ts` · `lib/recorrido-plata-reglas.ts` · `lib/flujo-caja-reglas.ts` · RPC `fn_resumen_finanzas`, `fn_estado_resultados`, `fn_finanzas_confianza`, `fn_rendimiento_serie`
> Otra sesión tocándola: **sí** — PR #1311 (`claude/finanzas-resumen-maquetas-1a3d09`, el rediseño que se analiza aquí) y PR #1320 (`claude/finanzas-telar-dock`, toca la huella de la guía `finanzas.resumen`). Congelamiento de código: mié 28-oct 18:00 al lun 2-nov 12:00.
> **Límites de esta pasada:** no corrí #1311 en un navegador (este worktree no tiene `node_modules` ni base local); leí su código y la auditoría v3 de la otra sesión. Sin consulta a producción, así que no sé **cuánto se usa** cada pieza. Lo que sigue dice cuál es mi evidencia en cada línea.

## 0 · Veredicto
#1311 arregla bien lo grave (el «cubre 100 %» falso, la pérdida en verde, el error crudo) y acierta con el recorrido de la plata. Pero el Resumen pasó de contestar dos preguntas a contestar una: dice **cuánto te deja el mes** y ya no dice **si te alcanza la plata para pagarlo**, que es la que quiebra negocios.
**Cumple su finalidad:** 6,7/10 · **Relevancia:** 7,4/10 — Soporte

## 1 · Finalidad declarada
"Esta pantalla existe para que quien dirige CAYLA sepa, en una mirada, cómo va el mes y qué tiene que decidir hoy."
Fuente: ADR-0195 F10, ADR-0417 (camino A, «El Pulso»), ADR-0493 (El telar), `docs/maquetas/finanzas-v3-2026-10/resumen/README.md`. **No la captura.**
¿Docs y pantalla coinciden? **En parte.** ADR-0417 prometía «¿estoy ganando plata?» **y** el ritmo contra lo que hace falta; #1311 conserva la primera y quita la segunda y toda la mitad de caja (las cinco cifras, las 6 semanas, el camino al equilibrio). Los documentos no dicen que la caja debía irse del Resumen: es una decisión de esa rama, no una regla.

## 2 · Objeción
1. **Se borró la mitad «caja» del Resumen y no se puso nada en su lugar.** Un mes puede dejar S/ 3,850 de utilidad y aun así no alcanzar para los sueldos del 31, porque la utilidad cuenta lo que *causaste* y la caja lo que *tienes*. #1311 quitó «Plata disponible», «Debes pronto» y «Saldo de las próximas 6 semanas», con una razón correcta (seis barras rojas casi iguales no cuentan nada) y una consecuencia mala: ya no hay **ni una cifra de plata en mano** en la pantalla de entrada de Finanzas. Lo único que queda es un aviso de «Hoy te toca» que **solo aparece si ya se cruzó el mínimo** `[código ResumenFinanzas.tsx:102, resumen-finanzas-reglas.ts:639]`. Corrección del 2026-10-24 (al construirla): `fn_resumen_finanzas` **no** trae el flujo con sus cobros —los recorta a propósito— y solo lo trae mirando CAYLA entera; el dato por día sale de `fn_flujo_caja_proyeccion`, la misma lectura de Dinero ▸ Flujo, que la pieza hace por su cuenta `[código 20260925200000_finanzas_resumen.sql:305, lib/resumen-telar.ts]`.
2. **La línea «ventas contra la meta» es de otra área.** La meta es comercial (la dueña de Rendimiento); lo que Finanzas debe decir es **desde qué día ya pagaste el mes**. #1311 dibujó la meta y se llevó el equilibrio al borrar `caminoEquilibrio` `[código ResumenFinanzas.tsx:184]`. Mismo dato (`ventasPorDia`), otra pregunta.
3. **«¿Puedo fiarme del número?» vive en tres sitios:** el chip «Provisional», la lista `fin-no-revisado` dentro de «Hoy te toca» y la tarjeta `Confianza` del fondo `[código ResumenFinanzas.tsx:98, 148, 165]`. Dos de los tres dicen lo mismo con otras palabras (Brooks: una está de más).
4. Sin objeción a lo demás: el recorrido cuadra (lo que entra es igual a lo que sale, con prueba), el mes de la barra por fin filtra, y quitar las cinco cifras duplicadas de Gastos, Impuestos y Dinero es correcto.

## 3 · Lo que está bien y no se toca
- La respuesta grande con «Provisional» cuando la confianza es baja, y la pregunta cambia si miras el Taller o la Empresa (¿cuánto cuesta…?). `[código resumen-telar-reglas.ts]`
- El recorrido de la plata: lo que entra al nudo es igual a lo que sale; si no cuadra, aparece «Otros ajustes» en vez de un dibujo falso; las diferencias de caja van en su propio hilo (decisión de Felipe). `[código recorrido-plata-reglas.ts:1-12]`
- «Hoy te toca» ordenado por lo que más cuesta dejar pasar, cada aviso con su origen y su botón. `[código resumen-finanzas-reglas.ts:521-560]`
- Degradación honesta: cada parte de la lectura es `ok | sin_permiso | falla | no_aplica`, nunca un 0 en lugar de un dato que falta; sin respuesta, la pantalla dice «El Resumen no respondió». `[código resumen-finanzas-reglas.ts:56, ResumenFinanzas.tsx:73-82]`
- Los sueldos estimados de Dynamic se suman fuera del libro y marcados; si Dynamic no responde, el Resumen queda como la base lo dijo. `[código resumen-finanzas.ts:28-46]`
- 375 px sin scroll lateral y sin selector de sede propio (la sede y el mes los pone la barra del telar). `[auditoría v3 de la otra sesión; no lo medí]`

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7,5 | Coherente con El telar y con tokens; el recorrido es nuevo y distinto, pero «lo vendido por sede» sale dos veces seguidas (orillo y entrada del recorrido) | `[código ResumenFinanzas.tsx:114, 127]` · no medí en navegador |
| Lógica de negocio | 6,0 | Responde «cuánto gané» y no «si me alcanza»; reemplaza el equilibrio (finanzas) por la meta (comercial) | `[código]` |
| Arquitectura | 7,5 | Lógica pura con pruebas, lecturas en paralelo, partes que degradan sin perder dato. Solo lee: sin concurrencia ni transacción que cuidar | `[código page.tsx:30-36]` |
| Funciones | 6,0 | Faltan 3 preguntas de la dueña (si me alcanza, por qué cambió, desde qué día gano); sobra una tarjeta y una lista duplicada | ver abajo |
| Utilidad | 6,5 | Escenario «¿llego al 31?»: la dueña tiene que ir a Dinero y deducirlo. Escenario «gané más, ¿por qué?»: solo un chip | `[inferido]` |
| Conexión con el ERP | 6,5 | Dos «Te toca» con fuentes distintas (el del Resumen y el cajón de la barra) | `[código ResumenFinanzas.tsx:146, api/finanzas/te-toca/route.ts]` |

**Funciones: qué hay y qué sobra** (la pregunta directa de Felipe)
| | Pieza | Veredicto |
|---|---|---|
| Existe y funciona | respuesta + chips, orillo, recorrido, Hoy te toca, dock | se queda |
| Sobra | tarjeta «Qué tan seguro es este número» como bloque aparte; la lista `fin-no-revisado` dentro de Hoy te toca | **fusionar** en un solo lugar (tarea #3) |
| Sobra (aquí) | línea «ventas contra la meta» | la meta vive en Rendimiento: **reemplazar** por el equilibrio (tarea #4) |
| Dudoso | orillo «vendido» pegado al recorrido, que ya abre con lo vendido por sede | mirar con Felipe, bajo valor (tarea #10) |
| Falta | caja de las próximas dos semanas; qué cambió contra el mes pasado; «de cada S/ 100 te quedan…» | spikes 1, 2 y 3 |
| Fantasma | ninguna: todo botón lleva a una pantalla real; el dock y Hoy te toca solo navegan | — |

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 10 | Es la primera pantalla de Finanzas: de ella sale qué decide la dueña hoy |
| Dinero y stock que toca | ×1 | 5 | Solo lee; no mueve plata, pero una cifra falsa decide una compra o un pago |
| Frecuencia y personas que la usan | ×1 | 8 | La mira la dueña a diario o semanal, más los líderes con módulo `reportes_financieros` `[inferido, sin consulta de uso]` |
| Qué se detiene si falla | ×1 | 4 | Nada: Pagar, Gastos y Cierre viven en sus pantallas |

Relevancia = (2·10 + 5 + 8 + 4) / 5 = **7,4**.

## 6 · Conexión con el ERP
- **Aguas arriba:** `fn_resumen_finanzas` (junta F2b–F9), `fn_estado_resultados` (mes y mes pasado), `fn_finanzas_confianza`, `fn_rendimiento_serie` (si la cuenta ve Rendimiento) y las boletas de planilla de Dynamic (sueldos estimados).
- **Aguas abajo:** nada se escribe; la pantalla lleva a Dinero ▸ Por pagar, Impuestos, Cierre y Reportes por el dock y los botones de aviso.
- **Vecinos:** «Te toca» de la barra (`/api/finanzas/te-toca`) hace lo mismo que «Hoy te toca» con otra fuente. Rendimiento ya muestra ventas contra meta.
- **Externos:** Dynamic (sueldos) → sin respuesta, el Resumen sigue sin la estimación. SUNAT, Lucode y Culqi no intervienen. La base: si cae, `/sin-base` (ADR-0450).

## 7 · Las 12 tareas, por importancia
> Las piezas nuevas están dibujadas en `docs/maquetas/finanzas-v3-2026-10/resumen-siguiente/index.html` (6 vistas tocables, claro y oscuro, 375 px). Todas son solo web y **ninguna toca dinero, stock ni permisos**, salvo la #8, que es de Felipe.

### #1 · Replantear — ¿La caja vive en el Resumen o solo en Dinero?
- **Dónde:** `ResumenFinanzas.tsx` (qué se dibuja) · `finanzas/dinero/flujo` (donde hoy vive el flujo completo).
- **Por qué en este puesto:** de esta decisión depende la #2. Es la única de las doce que no es mía: es de qué pregunta contesta la pantalla de entrada.
- **Cómo lo verificas tú:** abre el spike 1 y la vista «Todo junto»; dime si una dueña que entra a Finanzas a las 8 a. m. debería ver su caja sin hacer un clic más.
- **Esfuerzo / dependencias:** S (decidir) · bloquea la #2.
- **DECIDÍ:** una sola pantalla con las dos preguntas: «¿cuánto me deja?» arriba y «¿me alcanza?» en la segunda fila, y un enlace «Ver el flujo completo» a Dinero.
- **DESCARTÉ:** dos pestañas (Resumen / Caja), porque obliga a hacer un clic para saber si llegas al 31, y la caja ya tiene su casa en Dinero: sería la tercera vez que se dibuja.
- **SE ROMPE SI:** una cuenta ve `reportes_financieros` y no Dinero: su `flujo` llega `sin_permiso` y la pieza tiene que desaparecer, no mostrar S/ 0. (La base ya devuelve esa parte como `sin_permiso`.)

### #2 · Mejorar — «Tu caja hasta fin de mes» (spike 1)
- **Dónde:** pieza nueva `components/finanzas/CajaProxima.tsx` + `lib/caja-proxima-reglas.ts` (pura, con prueba), montada bajo la fila del recorrido en `ResumenFinanzas.tsx`. Lee `fn_flujo_caja_proyeccion` (`saldoHoy`, `minimoCaja`, `salidas[]` con fecha y sede, `cobros[]` por tienda y día) con una lectura propia en `lib/resumen-telar.ts`: la del Resumen viene sin cobros.
- **Por qué en este puesto:** es la pregunta que más quita el sueño y hoy no tiene ninguna cifra a la vista. El dato ya llega a la página y se descarta.
- **Cómo lo verificas tú:** con la base local, «Todas las sedes» muestra «Hoy tienes / Hasta el 31 sale / El 31 te queda» y la línea baja del mínimo cuando corresponde; con una sede, se separan cobros y salidas pero no los bancos; una cuenta sin Dinero no ve la pieza.
- **Esfuerzo / dependencias:** M · después de la #1. **Hecha el 2026-10-24** (rama `claude/finance-summary-improvements-b60347`). El flujo real trae un cobro esperado por tienda y día (meta o promedio), así que la línea sale más inclinada que la del dibujo; las entradas de la maqueta eran ilustrativas. Si no gusta, la variante B (tres cifras y una barra) no depende de ese detalle.

### #3 · Eliminar/fusionar — Un solo lugar para «¿puedo fiarme?» (spike 5)
- **Dónde:** `ResumenFinanzas.tsx:98, 148, 165` · `Confianza.tsx`.
- **Por qué en este puesto:** quita una tarjeta entera y una lista duplicada sin perder ninguna información; es la más barata y la que más simplifica (ley 8).
- **Cómo lo verificas tú:** una sola lista de «qué falta para fiarte», que se abre desde «Seguro al 86 %» bajo la cifra grande; con confianza baja sale «Provisional» como hoy.
- **Esfuerzo / dependencias:** S · después de fusionar #1311.

### #4 · Mejorar — «¿Ya pagaste el mes?» en lugar de «ventas contra la meta» (spike 4)
- **Dónde:** `VentasContraMeta` (`ResumenFinanzas.tsx:184`) · `puntoDeEquilibrio` (`resultados-reglas.ts:494`) · `ventasPorDia` que #1311 ya trae.
- **Por qué en este puesto:** pasado el equilibrio, cada S/ 100 vendidos dejan S/ 52: cambia cómo se decide una promoción. Sin esto, Finanzas no tiene una línea propia.
- **Cómo lo verificas tú:** en el spike, marca «faltan registrar 2 gastos» y mira cómo el día baja de 13 a 15: **el número miente si faltan gastos**. En la app real, una tienda sin gastos registrados no debe dibujar la línea: dice «falta registrar los gastos», sin dibujar un equilibrio de S/ 0.
- **Esfuerzo / dependencias:** M · no antes de que #1311 arregle el «sin gastos no es cubre 100 %». Debe esconderse o marcarse con confianza baja.

### #5 · Mejorar — «Lo que más se movió desde septiembre» (spike 2)
- **Dónde:** `lib/resumen-cambios-reglas.ts` (pura) sobre `estadoMes` y `estadoAntes`, que `page.tsx` de #1311 ya lee (`getEstadoResultados` del tramo de comparación).
- **Por qué en este puesto:** «gané más, ¿por qué?» es lo primero que se pregunta después de ver el número, y hoy solo hay un chip.
- **Cómo lo verificas tú:** la suma de los efectos es exactamente la diferencia entre lo que te dejó este mes y el mismo tramo del mes pasado (la prueba lo exige); compara 1–15 con 1–15, nunca un mes entero contra uno a medias.
- **Esfuerzo / dependencias:** S–M · independiente.

### #6 · Mejorar — «De cada S/ 100 te quedan S/ 8» (spike 3)
- **Dónde:** chip en `RespuestaTelar` (`respuestaResumen`) + cuadro de cien a un toque, con `pctDelNudo` de `recorrido-plata-reglas.ts`.
- **Por qué en este puesto:** convierte plata en proporción, comparable entre meses y sedes. Riesgo: repite al recorrido; por eso va como frase en la respuesta y el cuadro queda a un toque (ley 6).
- **Cómo lo verificas tú:** los cuadros suman 100; en septiembre al 15 eran 3 y hoy son 8.
- **Esfuerzo / dependencias:** S · independiente.

### #7 · Eliminar/fusionar/conectar — Un solo «Te toca»
- **Dónde:** `ResumenFinanzas.tsx:146` · `api/finanzas/te-toca/route.ts` · `lib/finanzas-te-toca-reglas.ts`.
- **Por qué en este puesto:** dos listas de pendientes con orígenes distintos en la misma pantalla; la dueña no sabe cuál manda. Además, «Hoy te toca» es de hoy aunque mires un mes pasado `[código ResumenFinanzas.tsx:144]`.
- **Cómo lo verificas tú:** abrir «Te toca» en la barra y «Hoy te toca» y ver los mismos pendientes.
- **Esfuerzo / dependencias:** M · cuando los seis submódulos sumen su `pendientesDe…` (backlog de #1311).

### #8 · Corregir (base, de Felipe) — El saldo de caja por sede
- **Dónde:** `fn_flujo_caja_proyeccion(p_semanas)` y `fn_flujo_caja_real` no reciben `p_ubicacion_id` (de la sesión de ADR-0433).
- **Por qué en este puesto:** sin esto, con una sede elegida se ven sus cobros y salidas pero no su saldo; la pieza lo dice, no lo inventa.
- **Cómo lo verificas tú:** con Lima elegida, «Hoy tienes» suma solo sus cuentas y dice qué dejó fuera.
- **Esfuerzo / dependencias:** L · migración y RPC: **siempre de Felipe**, no antes de la #2.
- **DECIDÍ:** pedir el parámetro de sede en la base y no calcular el saldo por sede en el navegador.
- **DESCARTÉ:** repartir los bancos entre las sedes por un porcentaje: inventa un dato (D-32: lo de la empresa no se reparte).
- **SE ROMPE SI:** una cuenta de banco la usan dos sedes, o el efectivo de una tienda se deposita en la cuenta de otra: el saldo por sede deja de ser un hecho y pasa a ser una opinión.

### #9 · Mejorar — *bajo valor / opcional:* «Descargar el mes» para el contador
- **Dónde:** `<BotonDescargar>` en el dock; confirmar antes si Reportes ya exporta.
- **Por qué:** el análisis de Gastos ya notó que el contador no puede sacar nada. Útil, pero no cambia una decisión de la dueña.
- **Cómo lo verificas tú:** el archivo trae lo mismo que la pantalla (respuesta, recorrido por sede, avisos).
- **Esfuerzo / dependencias:** S–M.

### #10 · Mejorar — *bajo valor / opcional:* que el orillo no repita al recorrido
- **Dónde:** `<Orillo que="vendido">` (`ResumenFinanzas.tsx:114`) y la entrada del recorrido.
- **Por qué:** «lo vendido por sede» sale dos veces seguidas. Pero el orillo es de la barra común de los seis submódulos: tocarlo es decisión de Felipe.
- **Cómo lo verificas tú:** a 1440 px, mirar si la segunda vez aporta algo.
- **Esfuerzo / dependencias:** S · mirar al final.

### #11 · Eliminar — *bajo valor / mantenimiento:* lo que #1311 dejó huérfano
- **Dónde:** clases `fin-pulso-*` de `app/estilos/finanzas.css`; `pulso-reglas.ts` residual; `/finanzas` en `CON_TOPE_DE_ANCHO` (`AppShell.tsx`).
- **Por qué:** está en el backlog de #1311; lo dejo aquí para que no se pierda. Quitar `/finanzas` de `CON_TOPE_DE_ANCHO` afecta a los seis submódulos y se acuerda entre las sesiones.
- **Cómo lo verificas tú:** `pnpm knip` y `pnpm knip:produccion` sin nada nuevo; la pantalla a 1440 y 1920 px ocupa el ancho.
- **Esfuerzo / dependencias:** S.

### #12 · Mejorar — *obligatoria al construir:* cerrar los impuestos de proceso de cada pieza
- **Dónde:** guía interactiva `finanzas.resumen` (`lib/guias/pantallas/finanzas.ts` + su huella), `tema:auditar` en claro y oscuro, 375 px, `/formidable`.
- **Por qué:** CLAUDE.md los exige a toda pieza nueva y la huella de la guía hace fallar el CI si falta; el PR #1320 también toca esa huella.
- **Cómo lo verificas tú:** `pnpm --filter web guias:recorrer` sin pasos huérfanos; `tema:auditar` sin fallas nuevas «solo en oscuro».
- **Esfuerzo / dependencias:** M · último de cada pieza.

## 8 · Estrategia alternativa
**El Resumen como respuesta + puerta, en vez de tablero.** Una sola cifra grande («Te deja») y una sola frase de caja («Tu caja aguanta hasta el 30»), y todo lo demás a un toque en Reportes. **Ganas** una pantalla que se entiende en 5 segundos (ley 1) y cero duplicados. **Pagas** que la dueña pierde la vista de conjunto, y que la información que hoy está a la vista pasa a requerir un clic. Mi lectura: no. Es lo que hizo #1311 con la caja y es lo que costó. Decide Felipe (#1).

## 10 · Fuera de esta pantalla
**No hay forma de saber qué piezas se usan.** Todo lo que sobra y lo que falta aquí sale de leer código y de lo que yo creo que la dueña necesita; ninguna pantalla de Finanzas mide cuántas veces se abre, qué botón se toca ni dónde se abandona. Sin ese número, «qué sobra» es una opinión. Una consulta de uso (o un contador de aperturas de pantalla, sin datos personales) cuesta menos que el rediseño siguiente.

## 11 · Líneas propuestas para el backlog
- [ ] `[pantalla:finanzas-resumen]` #1 Decidir si la caja vive en el Resumen o solo en Dinero — S
- [ ] `[pantalla:finanzas-resumen]` #2 «Tu caja hasta fin de mes» (spike 1) — M
- [ ] `[pantalla:finanzas-resumen]` #3 Un solo lugar para «¿puedo fiarme?» (spike 5) — S
- [ ] `[pantalla:finanzas-resumen]` #4 «¿Ya pagaste el mes?» en lugar de «ventas contra la meta» (spike 4) — M
- [ ] `[pantalla:finanzas-resumen]` #5 «Lo que más se movió desde el mes pasado» (spike 2) — S–M
- [ ] `[pantalla:finanzas-resumen]` #6 «De cada S/ 100 te quedan S/ 8» (spike 3) — S
- [ ] `[pantalla:finanzas-resumen]` #7 Un solo «Te toca» — M
- [ ] `[pantalla:finanzas-resumen]` #8 Saldo de caja por sede en `fn_flujo_caja_*` (de Felipe) — L
- [ ] `[pantalla:finanzas-resumen]` #9 «Descargar el mes» para el contador (opcional) — S–M
- [ ] `[pantalla:finanzas-resumen]` #10 Que el orillo no repita al recorrido (opcional) — S
- [ ] `[pantalla:finanzas-resumen]` #11 Limpiar lo que dejó huérfano #1311 — S
- [ ] `[pantalla:finanzas-resumen]` #12 Guía, tema oscuro, 375 px y `/formidable` de cada pieza nueva — M

## Historial
| Fecha | Modo | SHA | Quién | Nota |
|---|---|---|---|---|
| 2026-10-24 | rápido | `2097ad099` + PR #1311 `d224b50c8` | Claude (worktree `finance-summary-improvements-b60347`) | Primer análisis. No comparable con uno completo: sin SQL, sin captura real, sin medir en navegador. Spikes en `docs/maquetas/finanzas-v3-2026-10/resumen-siguiente/`. |
