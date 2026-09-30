---
name: rigor
description: Aplica rigor matemático explícito (conjuntos/álgebra relacional, complejidad algorítmica, álgebra lineal/vectorización, estadística, resiliencia tipo-Result) a una decisión de esquema, RLS, algoritmo en lib/*.ts, o cifra financiera/estadística. Úsala al diseñar una tabla/política/RPC, elegir una estructura de datos o índice, rankear/promediar con poca muestra, o tocar una integración externa — o automáticamente cuando la tarea sea de ese tipo.
---

Aplica sobre: $ARGUMENTS

Antes de proponer el diseño, revisa cuál de estas 5 lentes cambia la decisión — puede
ser más de una, o ninguna. No es un ritual: si nombrarla no cambia nada, no la
menciones.

1. **CONJUNTOS Y ÁLGEBRA RELACIONAL** — antes de escribir un `WHERE` con varios
   `OR`/`NOT IN` anidados, o una política RLS nueva, pregunta: ¿esto es una
   intersección/diferencia de conjuntos que Postgres ya resuelve mejor con
   `INTERSECT`/`EXCEPT`/un `JOIN` más selectivo? ¿La RLS de la tabla ya filtra la
   mitad de esto (`retail.fn_ve_modulo`, `fn_es_lider`, etc. son el conjunto de
   verdad) — evita repetir ese filtro en el código de arriba.

2. **COMPLEJIDAD ALGORÍTMICA** — antes de un `.find()`/`.filter()` de TypeScript
   dentro de otro `.map()`/`for`, cuenta las filas reales (principio 5 de
   `CLAUDE.md`: el volumen que viene a CAYLA — cientos de variantes/movimientos por
   sede, no escala Zara). Con ese volumen, un `Map`/`Set` construido una vez (O(n))
   casi siempre reemplaza el O(n²) sin cambiar el resultado. Nómbralo en una frase:
   "cambié el `.find()` anidado por un `Map` porque son N movimientos × N variantes,
   no por gusto".

3. **ÁLGEBRA LINEAL / VECTORIZACIÓN** — aplica solo si el módulo procesa series o
   lotes numéricos (Frescura, Rendimiento, Análisis): prefiere una sola pasada
   agregada (SQL o un solo `reduce`) sobre bucles anidados que recalculan el mismo
   promedio o varianza fila por fila. Este repo no usa embeddings ni IA local — no
   inventes tensores ni GPU donde no los hay.

4. **ESTADÍSTICA** — CAYLA ya tiene un precedente real, no hipotético:
   `apps/web/lib/rendimiento-reglas.ts` (ADR-0219) contrae el "soles por hora" de
   una persona hacia el promedio del resto de su tienda cuando tiene pocas horas —
   un estimador de contracción (Efron-Morris/James-Stein), no el número crudo,
   porque con 2-12 integrantes por tienda una cifra sola con poca muestra es ruido,
   no señal (ADR-0214: "una cifra con poca muestra no es una cifra"). Antes de
   rankear, promediar o proyectar algo con pocas filas (una tienda con 2 personas,
   un mes con 3 ventas), pregunta si necesita esa misma contracción — no un
   promedio simple que un dato atípico distorsiona.
   Para dinero: las migraciones ya usan `numeric(12,2)`/`numeric(14,2)` (decimal
   exacto de Postgres, no float) — mantenlo así. El riesgo real está del lado de
   TypeScript: si un cálculo con `number` de JS acumula redondeos dentro de un
   bucle antes de guardar, redondea una sola vez al final, no en cada paso.

5. **RESILIENCIA (teoría de categorías aplicada)** — esto ya es el principio 9 de
   `CLAUDE.md` ("Todo puede fallar"): cuando el código depende de SUNAT/Lucode
   (ADR-0005/0009) o de apis.net.pe (ADR-0008), modela la ausencia de respuesta
   como un valor que el llamador está obligado a mirar (`{ ok: false, motivo }` o
   similar) — no como una excepción que puede tumbar la pantalla. Sin esa frase
   escrita ("se degrada así, no pierde este dato"), la integración no está
   terminada.

**Regla de salida:** si una lente cambió el diseño de forma no obvia, dilo en una
frase — no como comentario nuevo en el código (la regla del repo sigue siendo
comentar solo lo no obvio, en español, nunca el qué). Si la decisión ya es
"estructural" y dispara el formato `DECIDÍ/DESCARTÉ/SE ROMPE SI` de
`~/.claude/CLAUDE.md`, el fundamento matemático va ahí, como una razón más de
`DESCARTÉ`, no como una sección aparte.

La señal de que una lente sí aplicó: cambiaste el diseño después de pensarla, no
solo la nombraste para parecer riguroso.
