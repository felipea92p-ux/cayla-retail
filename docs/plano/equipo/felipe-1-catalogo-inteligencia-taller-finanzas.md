# Felipe — Loro (Catálogo) · Águila (Inteligencia, diseño) · Gallito (Producción del Taller, a tu cargo mientras nadie más) · Garza (Finanzas operativas, a tu cargo mientras nadie más) · Lechuza / Tucán / Golondrina (en pausa)

> Extraído del plano maestro (143 decisiones, `docs/plano/00-ACTA-24-DECISIONES.md` y
> `02` a `05-ACTA-SESION-*.md`). Cada línea es una decisión ya tomada por Felipe — no es
> una propuesta, es lo que hay que construir o ya está construido.

## Decisiones

**PL-09 (corregida en Sesión 3)** — El reparto de pájaros queda: Loro sigue siendo tuyo sin cambio, Halcón pasa a Benja, y Gallito y Garza quedan formalmente libres — nadie trabaja ahí hoy, así que te haces cargo tú mientras tanto. Águila queda contigo pero solo para diseñar, no para construir.
  *Pendiente:* Actualizar docs/datos/07-GOBIERNO.md §1 con este reparto corregido, no con el anuncio intermedio que se dio a mitad de la sesión.

**PL-06** — El censo sigue pausado a propósito: la mercadería entra poco a poco sin censo formal mientras TRU sale en vivo; el censo físico con fecha de corte va después, y ahí recién se convierte en el saldo inicial formal del núcleo — las diferencias entran como ajuste, nunca reescribiendo lo ya vendido.
  *Pendiente:* Fijar la fecha del censo una vez que TRU esté operando — bloquea que Producción se pueda declarar «terminada» (PL-03).

**PL-08** — Contabilidad completa (partida doble, PLE, estados financieros) y canal online quedan escritos como pendiente con dueño, no se construyen todavía — Urraca sigue en pausa, Garza cubre solo lo operativo.

**PL-38** — Las categorías de gasto quedan cerradas ya, con una lista real: los rubros de compra de R-51 más los gastos de operación del día a día, sin reabrir Contabilidad completa.

**PL-72** — El estado de resultados por sede (ventas, costo, gastos) se construye como un resumen de lectura mientras Contabilidad sigue pausada — no audita como libro contable real, pero da el número esta semana.
  *Pendiente:* Construir el resumen — hoy no tiene dueño asignado.

**PL-73** — El cierre de mes se construye ahora, ligero: una tabla `periodos_cerrados` que bloquea registrar gastos o ventas en un período ya cerrado.
  *Pendiente:* Construir `periodos_cerrados` antes de que el primer mes de TRU en vivo necesite cerrarse.

**PL-74** — El método de costeo queda confirmado en costo promedio ponderado (ADR-0067) — ya corre en producción, el acta solo estaba desactualizada.

**PL-35** — Interbank y BCP quedan confirmadas como las 2 cuentas reales, destino de todo cobro electrónico (POS/Yape/Plin/transferencias).
  *Pendiente:* Definir cuál es Operativa y cuál Reserva, y cómo entran las «otras cuentas» que usas para mover dinero — sin fecha, no bloquea nada mientras tanto.

**PL-37** — Cada tienda tiene un tope de efectivo que tú defines, con aviso cuando el efectivo esperado del día lo supera.

**PL-36** — Las herramientas del Taller (tijeras, abre ojal) se registran como gasto al comprarlas; la clasificación se revisa con el contador recién cuando exista Contabilidad completa.

**PL-39** — «Eficiencia» del Taller significa tela aprovechada: metros consumidos vs. lo que Audaces dice que debía consumir esa corrida.

**PL-50** — Ventas mantiene en exclusiva «Comprobante»/«Nota de crédito»; Compras pasa a «Factura de proveedor»/«Nota de crédito de proveedor»; el Taller pasa a «Factura de insumos» — son 3 tablas reales distintas, solo la de Ventas toca SUNAT.
  *Pendiente:* Corregir `apps/web/lib/menu.ts` (líneas 163, 187) y las menciones en ADR-0111/0142/BACKLOG.

**PL-76** — Ninguno de los 4 módulos sin tabla (Tucán, Golondrina, Águila, Gorrión) se construye todavía, pero el esquema de Águila se diseña ya, porque es el único ligado directamente a tu propia definición de éxito a 3 años (decidir qué comprar, qué liquidar, qué tendencia hay).
  *Pendiente:* Diseñar (no construir) el esquema de Águila. Tucán y Golondrina siguen en pausa sin fecha.

**PL-75** — El costo de prenda se cierra a visible solo para líder de equipo, igual que ya se cerró el dinero de Compras (ADR-0126) — se verificó que `fn_productos` hoy lo expone a cualquier sesión autenticada.
  *Pendiente:* Tocar `fn_productos` y las pantallas de catálogo que hoy muestran costo.

**PL-125** — Supabase Storage (fotos de producto, adjuntos de compra) se enciende ahora, contra la recomendación de esperar — asumes el costo mensual desde ya.

**PL-41** — «Sede» gana sobre «Ubicación» en toda pantalla cara al integrante.

**PL-42** — «Integrante» gana sobre «Colaborador» en toda pantalla.

**PL-43** — `colaboradores.rol` se migra de 'colaborador' a 'integrante' en producción (25 personas reales), y se corrigen los 83 archivos que aún tipan el valor viejo a mano.
  *Pendiente:* Migración real en producción + los 83 archivos de código, siguiendo el proceso PR+CI (PL-10/PL-11), nunca en el chat.

**PL-44** — «Sede» incluye al Taller; «tienda» se reserva exclusivamente para las 3 que venden.

**PL-45** — Los códigos LIM/003 de Dynamic nunca se muestran a un integrante — siempre se enmascaran como «Tienda Lima»/«Taller» completos; la integración con Dynamic no se toca.

**PL-46** — OTRU (Oficina Trujillo) queda fuera del glosario de retail; se documenta solo en el contrato con Dynamic.

**PL-47** — «Encargada» se corrige a «Líder de equipo» sin excepción, incluidas las guías de mostrador que hoy todavía la usan.
  *Pendiente:* Corregir GUIA-CARGA-CATALOGO.md, PLAN-DE-TRABAJO.md, ESTUDIO-CONTABILIDAD.md y MANUAL-CONTABLE-CAYLA.md.

**PL-48** — El cuarto nivel de permiso se llama «Admin», igual que en Dynamic, no «Dueño» — verificado que `fn_es_lider()` ya no depende del admin de Dynamic desde la migración 0016; el Admin de retail sigue siendo una columna/allowlist propia, nunca derivada automáticamente del admin de Dynamic.

**PL-51** — «Cambiar de sede» gana como verbo en los dos casos: cuando el integrante cambia y en el aviso de sesión.

**PL-52** — La palabra «unidad» de V1 nunca reaparece; Finanzas, cuando se construya, usa `ubicacion_id` igual que todo V2.

**PL-53** — «Fábrica» como sinónimo del Taller se purga por completo, incluso al hablar con proveedores o maquila.

**PL-94/95** — Pegas el SQL de tu propio módulo (Catálogo) con el checklist de PL-87, y ves el negocio completo como Admin por decisión explícita tuya — no es separación técnica/de negocio.

**PL-127** — El canal online queda solo investigándose bajo Dany por ahora, sin construir nada; si avanza en serio, suma a Tucán — uno de tus pájaros en pausa.

**PL-131** — El primer pájaro de la próxima persona que se sume será Gallito o Garza — los dos siguen libres — y te haces cargo tú mismo de ambos mientras nadie más los trabaje, confirmando el territorio de este documento.
  *Pendiente:* Asignar persona y pájaro concreto cuando llegue el séptimo integrante del equipo.


## Tus pendientes, en orden

1. Cerrar el costo de prenda a solo líder de equipo en `fn_productos` y en las pantallas de catálogo que hoy lo muestran a cualquiera (PL-75) — dinero expuesto, ya verificado el hueco.
2. Construir `periodos_cerrados` antes de que termine el primer mes de TRU en vivo (PL-73) — sin esto, un período cerrado se sigue pudiendo editar.
3. Fijar la fecha del censo físico con corte, una vez que TRU esté operando (PL-06) — bloquea tener un punto cero verificado del stock.
4. Construir el resumen de estado de resultados por sede — ventas, costo, gastos (PL-72) — hoy no existe ese número aunque Contabilidad siga pausada.
5. Definir cuál cuenta (Interbank/BCP) es Operativa y cuál Reserva, y cómo entran las «otras cuentas» (PL-35) — sin fecha pero sigue siendo tuyo.
6. Diseñar (todavía no construir) el esquema de Águila (PL-76) — es el único de los 4 pájaros sin tabla ligado a tu propia definición de éxito a 3 años.
7. Migrar `colaboradores.rol` de 'colaborador' a 'integrante' en producción y corregir los 83 archivos que aún lo tipan a mano (PL-43), siguiendo el proceso PR+CI.
8. Actualizar docs/datos/07-GOBIERNO.md §1 con el reparto de pájaros ya corregido — Gallito y Garza libres, a tu cargo mientras tanto (PL-09).
9. Corregir `apps/web/lib/menu.ts` (líneas 163, 187) y las menciones en ADR-0111/0142/BACKLOG con los nuevos nombres de comprobantes (PL-50).
10. Corregir los 4 documentos operativos que todavía dicen «Encargada» en vez de «Líder de equipo» (PL-47).
11. Cuando llegue el séptimo integrante del equipo, asignarlo a Gallito o Garza — mientras tanto siguen siendo tuyos (PL-131).
