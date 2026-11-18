# ADR-0679 — Libro de Reclamaciones virtual: la hoja en la tienda, su plazo y su respuesta en el ERP

- **Fecha:** 2026-11-18 · **Estado:** construido en la rama `claude/video-analysis-implementation-check-a4f3c2` (6 actividades, `/construir`).
  **Nada en producción:** las cuatro migraciones esperan el OK de Felipe, y la copia por correo espera una llave de Resend propia de la tienda.
- **Relacionados:** ADR-0408 (tienda online: la puerta angosta `tienda_web`, Resend con `tienda@cayla.pe`), ADR-0161 y ADR-0178 (módulos y
  roles), ADR-0162 (el combo «Responsable»), ADR-0284 (guía de foco), ADR-0389 (guías interactivas), ADR-0358 (una función, una pieza:
  `<Cajon>`), principio 9 (todo puede fallar).

## El problema

Felipe comparó con el repo un video con 35 puntos legales para lanzar una app (2026-11-18). El hueco más serio era peruano: **la tienda online
no tenía Libro de Reclamaciones**. El Código de Protección y Defensa del Consumidor (Ley 29571, art. 150) obliga a todo proveedor a tenerlo, y a
quien vende por internet, uno virtual (DS 011-2011-PCM y modificatorias). Sin él, un cliente con un problema no tiene dónde dejarlo por escrito,
CAYLA no se entera a tiempo y la multa de Indecopi la paga CAYLA. La ley da además **15 días hábiles** para responder cada hoja.

## Lo que se decidió

| Decisión | Por qué |
|---|---|
| **No pide cuenta.** Con sesión, la hoja se liga a la cuenta y empieza con su nombre y su correo; sin sesión, igual se guarda. | La ley no deja condicionar el libro a registrarse ni a haber comprado. |
| **La hoja copia los datos de CAYLA del día** (razón social, RUC, domicilio fiscal y, si eligió una, la tienda). | Es una constancia: la hoja 000001-2026 dice siempre lo que decía al guardarse. |
| **Número correlativo por año, sin saltos** (`fn_siguiente_correlativo('LR-<año>')`, en la misma transacción). | Un rechazo o un fallo no gasta número; nunca dos hojas con el mismo. |
| **Nada de lo escrito cambia y ninguna hoja se borra** (disparador `hojas_reclamacion_reglas`). La respuesta se escribe una vez. | Es la constancia ante Indecopi. |
| **Tope de 5 hojas por hora por huella de ip**; sin huella, se guarda igual. | Frena a un programa, no a una persona; un hueco de configuración no le quita el derecho al cliente. |
| **La copia y la respuesta salen por correo desde la tienda** (Resend, `tienda@cayla.pe`, llave propia `TIENDA_RESEND_KEY`): enseguida y, si falla, cada 5 minutos (`/api/libro-copias`), hasta 5 intentos. | Una sola llave de correo; si el correo falla, la hoja y la respuesta ya quedaron guardadas con su fecha. |
| **El plazo se calcula al leer**: 15 días hábiles desde el día siguiente, lunes a viernes, sin feriados (`feriados_nacionales`). | Corregir un feriado no pide migrar datos. |
| **Feriados: solo los de siempre** (los sumados desde 2022 entran cuando la revisión legal los confirme con su norma). | Si sobra uno, el ERP mostraría un plazo un día MÁS largo que la ley (peligroso); si falta, uno más corto (inofensivo). |
| **Un módulo nuevo, «Libro de Reclamaciones»** (Tienda web, junto a Pedidos), nace sin rol. Responder pide el módulo y firma con el responsable. | ADR-0161: el líder decide a quién se lo da. |
| **Responder se confirma** («Le llega a… y después no se corrige»). | Formidable ley 7: se confirma solo lo irreversible, y esto lo es. |

## Cómo está hecho

- **Base** (cuatro partes, en orden): `20261118145000` la hoja y sus tres `tienda_*`; `20261118150000` la copia al correo (cola en la misma fila,
  `skip locked`, 2 minutos, 5 intentos); `20261118151000` los feriados, el plazo, el módulo y `fn_libro_reclamaciones`; `20261118152000` la
  respuesta (`responder_hoja_reclamacion`, la Actividad y la cola de la respuesta). RLS encendido sin políticas: solo sus funciones.
  Prueba: `pnpm pruebas:libro-reclamaciones` (46 casos, con mutantes).
- **Tienda:** `/libro-de-reclamaciones` (pública, enlazada en la Ayuda del pie de toda página), la constancia `/libro-de-reclamaciones/hoja/[id]?m=`
  (pide el id y la marca: el id solo no muestra los datos de nadie), `lib/libro-reclamaciones.ts` (las mismas reglas que la base, con su prueba
  cruzada contra la migración), `lib/correo-servidor.ts` y la ruta `/api/libro-copias`.
- **ERP:** Tienda web ▸ Libro de Reclamaciones (`components/libro-reclamaciones/`), con cifras que filtran, la hoja en el cajón y la respuesta
  guiada; su guía interactiva y su guía de foco.

## Lo que queda (de Felipe o de afuera)

1. **El OK para producción** de las cuatro migraciones, en orden.
2. **Una llave de Resend propia de la tienda** en Vercel (`TIENDA_RESEND_KEY`). Sin ella, la hoja se guarda y la copia queda en cola.
3. **La revisión legal**: una sesión aparte revisa los textos de la tienda contra las leyes peruanas
   (`docs/legal/2026-11-18-revision-legal-tienda.md`), incluida la lista exacta de lo que exige la hoja. Lo que diga puede cambiar campos o
   textos de esta obra, y un abogado colegiado tiene que firmar antes de publicar.
4. Si CAYLA debe reportar al SIREC de Indecopi (depende de su tamaño): no está construido.
5. Las tiendas físicas siguen con su libro de papel: esta obra es el libro de la tienda online.
