# Formidable · Compras ▸ Fondos por rendir, sus hojas, «Rendir tu fondo» y «Gasto del viaje»   (`/compras/fondos`)

- **Fecha / SHA:** 2026-10-14 · `1acc9b669` (punta de la fase 6 de ADR-0362, PR #1055)   · **Dispositivo que manda:** escritorio (Mac mini) para
  quien entrega y revisa; «Rendir tu fondo» también a 375 px (quien rinde puede hacerlo desde su celular)
- **Pregunta que debería resolver (1 frase):** ¿quién tiene plata de CAYLA en la mano, cuánto, y qué me toca hacer con ella (entregar, revisar lo que
  rindió, recibir lo que devuelve)?   · **Protagonista:** el dinero, y la persona que lo tiene
- **Veredicto en una línea:** «Se entiende a los 5 s y las dos pruebas ciegas terminaron su tarea, pero la cuenta de una misma persona no cuadra a la
  vista (faltante, deuda, “en la mano” y “dice que tiene” no se explican entre sí), y quien recibe plata sin el módulo de Órdenes de compra no tiene
  dónde rendirla.» **Ley 9 en 4: en deuda.** Y una cosa de plata que no es de presentación: con una rendición por aprobar, una devolución por la
  cifra que muestra la hoja deja el fondo debiendo y debido por los mismos S/ 5 (E2).

**Alcance.** La página `/compras/fondos` y sus hojas «Entregar plata», «Lo que devuelve…» (Registrar devolución), «Lo que paga… de su deuda»
(Registrar su pago) y «Rendición de…» (Revisar, como quien entregó plata y como quien aprueba); la hoja «Rendir tu fondo» (Órdenes de compra ▸ «Tu
fondo»); y la hoja «Gasto del viaje» (la orden). «Anular» no se midió. **Entorno:** el banco local `cayla-oc` con datos inventados (Micaela,
integrante de Tienda Trujillo, con un fondo; Felipe y Sandra, líderes; Felipe le entregó S/ 100 en la rendición que espera aprobación). A media
medición el disco del Mac se llenó y Docker se apagó (15:15): eso dejó ver de verdad qué hace la pantalla cuando la base no responde. **Agentes:** 3
(de 4): dos ciegos sobre capturas (la encargada que revisa; la vendedora que rinde, desde su Inicio) y un escéptico.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 6 | [Observado] ciega 1: lectura de 5 s correcta; terminó (S/ 380 en la mano, faltan S/ 5, «no puedo aprobar») con 8 pasos, 12 dudas, 5 palabras no entendidas y 5 retrocesos · ciega 2: rindió bien al primer intento, 5 pasos, 0 retrocesos, 12 dudas · real: sin probar (tope 8) |
| 2 Una pregunta, una respuesta | 7 | [Medido] 2 acciones primarias a la vista («Entregar plata» y «Revisar») · [Observado] la ciega 1 leyó la pantalla bien a los 5 s; «Revisar» negro le prometió un «Aprobar» que no tenía |
| 3 Simplicidad profunda | 5 | [Observado] 5 de 12 dudas de la ciega 1 y 3 de la ciega 2 son la misma: «Faltan S/ 5.00» contra «Debe S/ 25.00», «en la mano S/ 380» contra «dice que tiene S/ 375», «gastó S/ 100» contra «Gastos del viaje −S/ 20» · [Medido] la deuda de S/ 25 no incluye los S/ 5 por aprobar y nada lo dice |
| 4 Lenguaje de tienda | 6 | [Observado] no se entendieron «2 filas», «con Fondos por rendir» (el módulo como sustantivo), «Le entregaron» dentro de «Lo que rindió»; «viaje» para un taxi en la ciudad («yo no viajé») |
| 5 Contenido primero | 8 | [Observado] las dos ciegas encontraron las cifras de inmediato (S/ 380, S/ 375, S/ 5) · [Medido] montos a la derecha, en negrita, y la persona primero en cada fila |
| 6 Lo difícil, a un toque | 6 | [Observado] la cuenta de la rendición está a un toque («Revisar», «Rendir») · pero «Debes S/ 25.00» y «Gastaste S/ 20.00» no se pueden tocar y la ciega 2 quiso saber de dónde salen |
| 7 Perdonar antes que preguntar | 7 | [Medido] cada hoja de plata confirma con el resumen en su botón («Entregar S/ 200.00 a Micaela», «Rendir: tengo S/ 375.00», «Aprobar: debe S/ 5.00»); anular pide motivo; Cancelar no pregunta · [Medido] «Aprobar» se puede pulsar antes de ver la lista · [Observado] «Rendir» no dice que se puede retirar mientras espera |
| 8 Quitar antes de agregar | 7 | [Opinión] «Les entregaste S/ 1,400.00 desde el primer fondo» y «Devolvieron S/ 120.00» son historia, no ayudan a decidir hoy |
| 9 De punta a punta | 4 | [Medido] si la lista de una rendición no se lee, la hoja la dibuja vacía («Lo que rindió» con 0 o «No hay pagos ni gastos») · [Observado] con la base caída, el esqueleto siguió sin ningún mensaje · [Observado] sin el módulo Órdenes de compra, «Tu fondo» no lleva a ninguna parte y no hay dónde rendir · [Medido] a 375 px los botones de la hoja miden 35 px |
| **Leyes (promedio)** | **6,2** | ley 9 en 4 (en deuda); ley 3 en 5 |
| **Oficio visual** | **8** | [Medido] página a 1440: 2 de 8 fallan (el monto anulado tachado a 2,79:1; versalitas de 11 px del sistema); a 1024 igual y sin desborde; a 375 (táctil): 3 de 8 (botones de 40 y 35 px, el tachado, 1 borde a 1 px). Las hojas: el «S/» de `CampoMonto` a 3,6:1 (pieza del sistema), «Pagó todo: S/ 25.00» de 19,5 px de alto, el calendario de `CampoFecha` de 20 × 20 (sistema). 0 rojos, 1 primaria por hoja |

## Veredictos del escéptico
Un agente con el repo a la vista intentó refutar cada hallazgo (solo leyó; 85 lecturas):
| Hallazgo | Veredicto | Lo que cambió |
|---|---|---|
| H1 «Lo que rindió» vacío si falla, y «Aprobar» activo mientras carga | MATIZADO | Confirmado, y peor: con la lista caída también desaparece «1 papel sin foto», y `RendirCiclo` dibuja «No hay pagos ni gastos…» bajo su propio aviso. Pero **la base no depende de la lista**: `aprobar_rendicion_fondo` relee la fila `for update` y rechaza si lo rendido cambió (`rendicion_cambio`). El riesgo es de proceso, no de datos. El esqueleto eterno viene de que el cliente de Supabase no tiene tope de espera (`lib/supabase/client.ts`) |
| H2 La cuenta de una persona no cuadra a la vista | CONFIRMADO | Además «Gastó» incluye el faltante ya aprobado: decisión provisional del ADR-0362 («revisar con Felipe») |
| H3 «Revisar» negro para quien no puede aprobar | MATIZADO | No es un callejón: quien no aprueba igual puede devolverla. Los defectos: el negro (dos primarias), que no diga cuándo devolver, y que la base no sabe nombrar a quién aprueba |
| H4 Palabras que no son de tienda | CONFIRMADO | El aviso de H3 lo escribe la base (`fn_rendicion_quien_no_aprueba`). Además «Le entregaste» es falso en la fila del propio Felipe y en entregas que hizo otra persona |
| H5 «TIENDA LIMA» arriba | MATIZADO | La línea es de la pieza, pero elegirla para una página de todas las sedes fue de esta página; la cabecera de Compras está sin decidir (decisión 36) |
| H6 «Rendir» solo dentro de Órdenes de compra | CONFIRMADO | El ADR lo agrava: la decisión 34 dice que **toda persona puede tener un fondo**, y Órdenes de insumos (Taller) no muestra «Tu fondo». Corrección: a 375 × 812, «Rendir →» queda al borde de la primera pantalla (770 px), no bajo el pliegue |
| H7 Oficio (menores) | 1 CONFIRMADO, 4 MATIZADOS, 1 REFUTADO | «Pagó todo» de 19,5 px es de esta hoja (`min-h-6` lo arregla); el «S/», los 35 px a 375 y el calendario son piezas del sistema, pero los 35 px sí importan en «Rendir», que vive en Órdenes de compra, una pantalla que se usa en Gamarra (ADR-0362: regla de 375 px). El «EFECTIVO a 1,07:1» era un falso positivo del medidor |
| H8 Entregar no muestra lo que la persona ya tiene | MATIZADO | Válido y barato; falta además avisar que, si entregas ahora, no podrás aprobar su próxima rendición (decisión 35) |
| H9 El ejemplo del taxi | MATIZADO | Cumple la letra de ADR-0290 pero no su espíritu; su gemelo «Ej. Me faltó anotar un taxi» tiene lo mismo |
| H10 «viaje», lo que no se toca, el pie cortado | MATIZADO | «Viaje» es palabra de Felipe (decisiones 55, 63, 67, 74 y 75). Mal de verdad: el texto entero solo con el mouse, y «para «Para la comp…»» repite «para» |

**Lo que se nos escapó (encontrado por el escéptico):**
- **E1 · «Ver tu rendición» le dice algo falso a quien rindió sin explicar el faltante:** «Quien la revisa decide si lo asume CAYLA o queda como deuda
  tuya», pero sin explicación la base la hace deuda sin elegir (decisión 54). La hoja no lo puede saber: `fn_mi_fondo_rendicion` no trae la
  explicación. Es el caso de Micaela.
- **E2 · Se puede registrar una devolución mayor a lo que ella declaró, con la rendición por aprobar.** [Medido, en el banco, dentro de una
  transacción que se deshizo] Micaela rinde S/ 375 (el fondo dice S/ 380); se registra su devolución por S/ 380, la cifra que muestra la hoja
  («Tiene S/ 380.00 en su fondo»), y la base la acepta; al aprobar, el faltante de S/ 5 sale del fondo: **saldo −S/ 5,00 («CAYLA le debe S/ 5») y,
  a la vez, una deuda nueva de S/ 5 (total S/ 30)**, por los mismos cinco soles. El `/chaos` probó devolver y rendir a la vez, no uno después del
  otro.
- **E3 · «1 papel sin foto» queda congelado en la fila** (`page.tsx:165`, de `r.sinFoto`, que se escribe al rendir) aunque ella suba la foto
  después.

## Los 3 cambios de mayor impacto
Ninguno cambia una regla de plata ni lo que la base acepta: cambian dónde está un botón, cuándo se puede pulsar y qué dicen los textos. Igual son
pantallas de dinero, así que esperan el OK de Felipe.

1. **«Rendir» desde la tarjeta «Tu fondo» del Inicio** (leyes 9 y 1).
   - **Antes:** «Rendir» solo existe dentro de la cuarta cifra de Órdenes de compra (`TuFondoEnOrdenes`). En el Inicio, la tarjeta lleva a Órdenes
     de compra o a Por pagar según el módulo (`hrefTuFondo`) y, sin ninguno de los dos, a ninguna parte: quien recibe plata sin el módulo ve
     «Tu fondo: S/ 380.00» y no tiene dónde rendirla, aunque la base sí se lo permite (`rendir_fondo` no pide módulo) [Observado: captura `23`].
     Con el módulo, la vendedora llegó, pero dudó: «Tu fondo me llevó a Órdenes de compra: ¿estoy en el lugar correcto?» [Observado: ciega 2].
   - **Después:** la tarjeta del Inicio lleva la misma acción que en Órdenes de compra («Rendir», o «Ver tu rendición» mientras espera) y abre la
     misma hoja ahí mismo. Órdenes de compra no cambia. Es una función de la tarjeta donde vive su botón (ADR-0306), no un módulo nuevo.
   - **Cómo se verifica:** como Micaela sin el módulo, Inicio → «Rendir» → la hoja → rendir en el banco; con el módulo, Órdenes de compra igual que
     hoy; la guía del Inicio al día (`/guia`); repetir la ciega 2.
   - **Esfuerzo:** S. **Decide:** Felipe (dónde se rinde; quién puede rendir no cambia).
2. **«Revisar»: primero la lista, después «Aprobar»** (leyes 9 y 7).
   - **Antes:** si la lista de lo que rindió no se lee, la hoja la dibuja vacía («Lo que rindió» con 0; en «Ver tu rendición», «No hay pagos ni
     gastos en esta rendición», que es falso) [Medido: `RevisarRendicion.tsx:91`, `RendirFondo.tsx:337`]; con la base caída, el esqueleto se queda
     sin decir nada [Observado: captura `10`]; y «Aprobar: debe S/ 5.00» se puede pulsar mientras la lista todavía carga [Observado: captura `12`].
   - **Después:** mientras carga, «Aprobar» espera; si no se pudo leer, un aviso «No pude traer lo que rindió. Las cifras de arriba sí están al día.»
     con «Volver a intentar», «Aprobar» sigue esperando y el aviso de papeles sin foto no desaparece; la lectura se corta a los pocos segundos en vez
     de colgarse (un tope en esta lectura, no en el cliente de todo el ERP). Lo mismo en «Ver tu rendición» y en «Rendir tu fondo», que hoy pone «No
     hay pagos ni gastos» debajo de su propio aviso. La base ya protege los datos (relee y rechaza si algo cambió): esto protege el proceso, que
     quien aprueba vea lo que aprueba.
   - **Cómo se verifica:** una prueba pura del estado de la lista; en el navegador, `fetch` de la lista forzado a fallar y a tardar: aparece el aviso
     y «Aprobar» no se puede pulsar.
   - **Esfuerzo:** S. **Decide:** Felipe (presentación de una aprobación de dinero).
3. **La cuenta de cada persona, en una sola frase** (leyes 3, 4 y 1).
   - **Antes:** «Faltan S/ 5.00» y «Debe S/ 25.00» sin relación; «Tiene en la mano S/ 380.00» mientras ella declaró S/ 375; «Aprobar: debe S/ 5.00»;
     «Revisar» negro para quien no puede aprobar, y «la aprueba otra persona con Fondos por rendir» sin decir quién; «2 filas»; «Le entregaron»
     dentro de «Lo que rindió». Son 5 de las 12 dudas de la ciega 1 y 3 de la ciega 2.
   - **Después** (solo textos y el peso de un botón):
     - Quien aprueba: «Faltan S/ 5.00. No escribió qué pasó: si la apruebas así, su deuda pasa de S/ 25.00 a S/ 30.00.» y el botón «Aprobar: su
       deuda sube a S/ 30.00» (o «Aprobar: CAYLA asume S/ 5.00»).
     - Quien rinde: «Te faltan S/ 5.00. Si no escribes qué pasó, tu deuda pasa de S/ 25.00 a S/ 30.00 cuando la aprueben.» y «Mientras nadie la
       apruebe, puedes retirarla y corregirla.» Y en «Ver tu rendición», sin explicación: «Como no escribiste qué pasó, quedan como deuda tuya» en vez
       de «Quien la revisa decide…», que hoy es falso (E1; pide que `fn_mi_fondo_rendicion` diga si hubo explicación: una migración de lectura).
     - La fila de quien tiene una rendición por aprobar: «S/ 380.00» y debajo «dice S/ 375.00 · por aprobar».
     - Quien no puede aprobar: «Revisar» en secundario (deja de competir con «Entregar plata») y en la hoja «Tú le entregaste plata en esta rendición:
       la aprueba otra persona que revise fondos. Si algo no cuadra, devuélvela para que la corrija.» (el texto viene de
       `fn_rendicion_quien_no_aprueba`: cambiarlo es una migración de una línea).
     - «2 filas» → «1 gasto y 1 entrega»; «Lo que rindió» → «Lo que entró y salió de su fondo»; «Le entregaste» → «Entregado» donde no fuiste tú.
   - **Cómo se verifica:** pruebas puras de las frases (`rendicion-reglas.test.ts`, con deuda previa y sin ella); capturas antes/después a 1440;
     repetir las dos ciegas: las dudas de cifras tienen que bajar de 5 a 1 o menos.
   - **Esfuerzo:** M. **Decide:** Felipe (son textos de dinero; ninguna regla cambia).

## Lo que sobra (ley 8)
- «Les entregaste S/ 1,400.00 · desde el primer fondo» y «Devolvieron S/ 120.00» [Opinión]: son historia acumulada; para decidir hoy importan
  «Tienen en la mano» y «CAYLA les debe». Se pueden pasar al pie de «Entregas, devoluciones y pagos de deuda», donde vive la historia.

## Lo que no pediste y importa más
**Una devolución con la rendición por aprobar puede dejar el fondo debiendo y debido por los mismos cinco soles (E2).** [Medido, en el banco,
deshecho] Micaela rinde S/ 375; la hoja de devolución dice «Tiene S/ 380.00 en su fondo» y deja anotar S/ 380 (la base también: el tope es el saldo
de los libros, `devolver_fondo`); al aprobar, el faltante sale igual del fondo (`aprobar_rendicion_fondo`) y queda **saldo −S/ 5,00 («CAYLA le
debe S/ 5») y una deuda nueva de S/ 5**. Basta con que quien recibe la plata escriba la cifra que le muestra la pantalla en vez de contar los
billetes. Es el principio 2 (un estado que no debería poder existir) y es plata: la regla la decide Felipe. Las salidas posibles: mientras haya una
rendición por aprobar, el tope de la devolución es lo que ella declaró en la mano (base y hoja); o no se registra una devolución hasta aprobar o
devolver la rendición; o el faltante al aprobar se descuenta solo de lo que quede en el fondo.

## Lista aparte (no se ejecuta)
1. **A quién se le puede entregar plata:** «Entregar plata» ofrece a toda persona activa (`fn_fondos_opciones`, decisión 34), aunque no pueda anotar
   un gasto del viaje (Órdenes de compra) ni pagarle a un proveedor (Por pagar): su taxi solo entraría como un faltante explicado. Regla de dinero y
   permisos (Felipe): avisarlo en la hoja, o no.
2. «Entregar plata» no muestra lo que la persona ya tiene (S/ 380 en la mano, una rendición por aprobar, S/ 25 de deuda) ni avisa que, si le
   entregas ahora, no podrás aprobar su próxima rendición (decisión 35) [Opinión, confirmada por el escéptico].
3. «Gastó» incluye el faltante ya aprobado (decisión provisional del ADR-0362, «revisar con Felipe»): por eso «gastó S/ 100» contra «Gastos del viaje
   −S/ 20» [Observado: ciega 1].
4. La cabecera: «TIENDA LIMA» arriba en una página de todas las sedes; la de Compras está sin decidir (decisión 36): pregunta para Felipe
   [Observado: ciega 1, a los 5 s].
5. «Debes S/ 25.00» y «Gastaste S/ 20.00» no se pueden tocar: un «¿De dónde sale?» que abra el detalle (ley 6) [Observado: ciega 2].
6. El ejemplo «Ej. Pagué un taxi y no lo anoté» (y su gemelo «Ej. Me faltó anotar un taxi») contradice la lista cuando ya hay un taxi: usar un gasto
   que no esté en ella (ADR-0290) [Observado: ciega 2 pensó que el taxi había costado S/ 25].
7. «Gasto del viaje» para un taxi en la ciudad («yo no viajé») [Observado: ciega 2]: «viaje» es palabra de Felipe.
8. El pie de la tarjeta «Tu fondo» se corta y el texto entero solo está en el `title` (no existe sin mouse); además repite «para «Para la comp…»».
9. «1 papel sin foto» queda congelado en la fila aunque ella suba la foto después (E3).
10. «Pagó todo: S/ 25.00» mide 19,5 px de alto (< 24 px): `min-h-6`, como `FotoDelGasto` [Medido].
11. A 375 px, los botones de una hoja miden 35 px (< 44 con dedo): pieza del sistema (`btn-cayla`), pero importa en «Rendir», que vive en Órdenes de
    compra, una pantalla que se usa en Gamarra [Medido].
12. El «S/» de `CampoMonto` a 3,6:1 y el calendario de `CampoFecha` de 20 × 20 px: piezas del sistema [Medido].
13. «Rendir tu fondo» muestra «Deberías tener S/ 380.00» antes de que la persona cuente: invita a copiar la cifra. En Caja, Felipe decidió sin conteo
    ciego (ADR-0186); aquí también es su decisión.

## Prueba ciega
### Ciega 1 · la encargada revisa a Micaela (10 capturas: la página a 1024 y las hojas a 1440; como Felipe, que le entregó plata en esa rendición)
Tarea: «Micaela se llevó plata de la tienda para comprar tela. Ya te mandó sus cuentas. Averigua cuánta plata de la tienda tiene todavía en la mano,
si sus cuentas cuadran, y qué te toca hacer a ti con esas cuentas.»
| Medida | Resultado | Pasa |
|---|---|---|
| Lectura de 5 s | «sirve para ver la plata que la tienda le entrega a quien sale a comprar y cuánto tiene cada persona todavía en la mano»; desconcierto: «arriba dice TIENDA LIMA, porque Micaela es de Trujillo» | sí |
| Primer intento | correcta: S/ 380 en la mano, faltan S/ 5 (dice S/ 375), «yo no puedo aprobar sus cuentas» → «Devolver para corregir» para que explique los S/ 5 | sí |
| Pasos | 8 (mínimo 3: mirar, Revisar, concluir) | no |
| Dudas | 12: «Faltan S/ 5.00» contra «Debe S/ 25.00»; «¿los S/ 5 ya están dentro de esos S/ 25?»; «Tiene en la mano S/ 380» contra «dice que tiene S/ 375»; «la aprueba otra persona: no dice quién ni cómo le aviso»; «Devolver para corregir: ¿me toca o espero?»; «Le entregaron +S/ 100 dentro de Lo que rindió»; «gastó S/ 100» contra «Gastos del viaje −S/ 20»; «TIENDA LIMA» | no |
| Palabras no entendidas | «2 filas», «1 papel sin foto» (a medias), «Tu fondo: lo mueve otra persona», «con Fondos por rendir» (y «(chaos)», que es de los datos de prueba) | no |
| Errores evitables | ninguno; esperó un «Aprobar» que no tenía | casi |

### Ciega 2 · la vendedora rinde (4 capturas a 1440, desde su Inicio; con el módulo Órdenes de compra dado a mano en el banco)
Tarea: «Hace unos días la tienda te dio plata para comprar tela, y con esa plata pagaste un taxi. Tu encargada te pide que le pases tus cuentas…
tienes S/ 375 de la tienda en la cartera.»
| Medida | Resultado | Pasa |
|---|---|---|
| Lectura de 5 s | «iría a la tarjeta TU FONDO, porque habla de la plata que me dieron»; no entendió «Debes S/ 25.00 de un faltante de tu rendición» | sí |
| Primer intento | correcta: 375, una explicación de los S/ 5 y «Rendir: tengo S/ 375.00» | sí |
| Pasos | 5 (mínimo 4) | sí |
| Dudas | 12: «Tu fondo me llevó a Órdenes de compra: ¿estoy en el lugar correcto?, todo son pedidos a proveedores»; «¿los S/ 5 se suman a los S/ 25?»; «Ej. Pagué un taxi y no lo anoté: mi taxi ya está anotado, ¿costó S/ 25?»; «yo no viajé, tomé un taxi»; «otra persona revisa: ¿quién?»; «¿después puedo corregir?»; «SIGUE AQUÍ se quedó en la primera pregunta»; el pie cortado «para «Para la comp…»» | no |
| Palabras no entendidas | «papel» (lo tomó por boleta: bien), «Por repartir» (no es de esta tarea) y «(chaos)» (datos de prueba) | casi |
| Errores evitables | ninguno; casi anota el taxi otra vez con «Gasto del viaje» | casi |

## Antes de decir «listo»
- **Concurrencia:** cubierta por el `/chaos` de la fase 6 (2026-10-14, semilla 1014): dos líderes a la vez sobre la misma rendición, el doble clic y
  el reintento con otro contenido; 0 estados imposibles tras los arreglos (`docs/chaos/README.md`). **No cubría** la secuencia rendir → devolver →
  aprobar (E2), que sí deja un estado imposible.
- **Caída externa:** [Observado] hoy, con la base caída de verdad (15:15): la página ya cargada siguió a la vista; al abrir «Revisar», «Lo que
  rindió» quedó en esqueleto sin ningún mensaje; si la lectura falla, la hoja la muestra vacía (cambio 2).
- **Persona sin contexto:** dos pruebas ciegas sobre capturas (arriba). Real: sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-14 | `1acc9b669` | 6,2 (ley 9: 4) | 8 | — (3 propuestos, esperan OK) |
