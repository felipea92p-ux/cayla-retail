# Felipe — Gobierno del equipo, proceso, documentación viva, onboarding e integraciones generales

> Extraído del plano maestro (143 decisiones, `docs/plano/00-ACTA-24-DECISIONES.md` y
> `02` a `05-ACTA-SESION-*.md`). Cada línea es una decisión ya tomada por Felipe — no es
> una propuesta, es lo que hay que construir o ya está construido.

## Decisiones

**PL-09** — Reparto de pájaros corregido con el equipo real de 6: Benja lleva Halcón, Felipe se queda con Loro y diseña (no construye) Águila, Dany lleva Colibrí, Diego lleva Pelícano, Fernanda queda dueña transversal de las reglas de pantalla (Modal, Espera, diseño); Gallito y Garza quedan libres, Tucán/Golondrina/Urraca en pausa.
  *Pendiente:* Actualizar docs/datos/07-GOBIERNO.md §1 con esta versión corregida, no con el anuncio intermedio de la sesión.

**PL-10** — Main queda protegido: PR + CI obligatorios de ahora en adelante, con revisión humana solo para lo transversal (esquema, RLS, menu.ts, AppShell).
  *Pendiente:* Activar la regla en GitHub — solo Felipe, como admin del repo, puede hacerlo.

**PL-120** — Si Dynamic/Supabase cae por completo, se acepta el riesgo: venta en papel/manual hasta que vuelva, y cada líder de equipo tiene que saber que ese plan B existe.
  *Pendiente:* Escribir el plan B de papel en el manual de cada sede — hoy no está escrito en ningún lado.

**PL-125** — Supabase Storage (fotos de producto, adjuntos de compra) se enciende ahora, contra la recomendación de esperar — Felipe asume el costo mensual desde ya.
  *Pendiente:* Confirmar el encendido y el costo mensual asumido.

**PL-126** — Si Alegra cae en pleno cobro, esa venta la emite retail directamente sobre la marcha, sin esperar a que Alegra vuelva.

**PL-127** — Pago con tarjeta/POS y canal online quedan investigándose bajo Dany (Colibrí) por ahora, sin construir nada — la tarjeta es extensión natural de Ventas, el canal online es más grande y sumará a Tucán si avanza en serio.
  *Pendiente:* Seguir la investigación con Dany, sin fecha fija todavía.

**PL-128** — El documento de onboarding (hoy desactualizado, versión V1) se reescribe a la versión actual ahora, antes de que llegue alguien nuevo.
  *Pendiente:* Reescribir el documento — es el trabajo de documentación más grande de todo el plano.

**PL-129** — Postgres desechable pasa a ser el camino principal de onboarding (Docker lo apaga seguido hasta el propio Felipe por RAM); Docker queda como alternativa para quien lo prefiera.
  *Pendiente:* Actualizar CONTRIBUTING.md para invertir el orden Docker/Postgres desechable.

**PL-130** — El mentor del séptimo integrante es Felipe o Dany — son quienes tienen más contexto acumulado, aunque el equipo real ya sea de 6 personas.

**PL-131** — El primer pájaro de la próxima persona que se sume lo asigna Felipe antes de que llegue, sobre Gallito o Garza (los dos libres); mientras tanto Felipe se hace cargo si nadie más los está trabajando.
  *Pendiente:* Asignar el pájaro cuando de verdad se sume la próxima persona.

**PL-132** — El nivel de acceso git del día 1 es escritura directa a main, igual que el resto del equipo hoy.

**PL-133** — Un PR no transversal con CI verde lo fusiona la propia sesión de IA, sin esperar a Felipe — no contradice PL-10, que reserva la revisión humana solo para lo transversal.

**PL-134** — Cualquier sesión de IA puede corregir CLAUDE.md/AGENTS.md y abrir el PR por su cuenta, sin pedir OK antes.
  *Pendiente:* Ejecutar la corrección — es el pendiente #6 del acta original, sigue abierto.

**PL-135** — Queda un solo documento oficial de instrucciones: CLAUDE.md manda; AGENTS.md se reduce a 3 líneas que apuntan a él, retirando el comando que dañaba el diccionario y la cifra de tablas desactualizada.
  *Pendiente:* Reescribir AGENTS.md a esas 3 líneas.

**PL-136** — SESIONES-ACTIVAS.md (que ya falló varias veces) se refuerza con el mismo mecanismo, obligando a leerlo al abrir sesión — hoy ni siquiera se menciona en CLAUDE.md.
  *Pendiente:* Agregar la mención de SESIONES-ACTIVAS.md a CLAUDE.md.

**PL-137** — Cuando una sesión detecta un choque con otra, coordina con un comentario en el PR de la otra sesión (o una fila en el tablero) y solo sigue si de verdad no se solapan archivos.

**PL-138** — No hay límite duro sobre los archivos transversales más chocados (types.ts, AppShell.tsx, package.json, globals.css, ci.yml); en su lugar, cualquier sesión avisa sola si detecta otra sesión tocando el mismo archivo, sin bloquear nada.
  *Pendiente:* Agregar esa instrucción de aviso automático a CLAUDE.md.

**PL-139** — La limpieza del tablero de SESIONES-ACTIVAS.md es automática: una revisión marca 'posiblemente cerrada' una fila cuando su rama ya no existe en origin.
  *Pendiente:* Construir esa revisión automática.

**PL-140** — BACKLOG.md y BITACORA.md (473 KB / 745 KB) se recortan: se archiva todo lo anterior al corte actual y arrancan versiones cortas — nada se pierde, queda en docs/historico/.
  *Pendiente:* Archivar lo viejo y escribir las versiones cortas.

**PL-141** — El examen de comprensión (/examen) se extiende a todo el equipo cuando cierra su propio módulo, no solo a Felipe.

**PL-142** — La sección 'Conceptos pendientes de enseñar' (que estaba prometida pero no existía) se crea ahora en el BACKLOG recortado.
  *Pendiente:* Crear la sección al reescribir el BACKLOG (PL-140).

**PL-143** — El examen se corre al cerrar el módulo, como parte de la propia definición de 'terminado' (PL-03) — rápido e informal, nunca una ceremonia que frena el cierre; si encuentra un hueco se corrige en la marcha, sin bloquear indefinidamente.


## Tus pendientes, en orden

1. Activar la protección de main (PR + CI obligatorios) — solo Felipe puede hacerlo como admin del repo (PL-10).
2. Escribir el plan B de papel para caída total de Dynamic/Supabase en el manual de cada sede — TRU sale en vivo esta semana y hoy no está escrito en ningún lado (PL-120).
3. Confirmar el encendido de Supabase Storage y el costo mensual asumido (PL-125).
4. Corregir CLAUDE.md y reducir AGENTS.md a 3 líneas — el 96% de los commits los arranca una IA leyendo esos archivos desactualizados (PL-134, PL-135).
5. Agregar a CLAUDE.md la mención de SESIONES-ACTIVAS.md y la instrucción de aviso automático en archivos transversales (PL-136, PL-138).
6. Reescribir el documento de onboarding y actualizar CONTRIBUTING.md para que Postgres desechable sea el camino principal (PL-128, PL-129).
7. Archivar BACKLOG.md/BITACORA.md a docs/historico/ y arrancar las versiones cortas, con la sección 'Conceptos pendientes de enseñar' (PL-140, PL-142).
8. Construir la limpieza automática del tablero de SESIONES-ACTIVAS.md (PL-139).
9. Actualizar docs/datos/07-GOBIERNO.md §1 con el reparto de pájaros corregido en Sesión 3 (PL-09).
10. Seguir investigando pago con tarjeta/POS y canal online junto con Dany, sin fecha todavía (PL-127).
11. Asignar el primer pájaro (Gallito o Garza) apenas se sume la próxima persona al equipo (PL-131).
