import random, math
random.seed(7)
def semana(n_unidades, p, agrupado):
    """Devuelve (unidades, tardias). agrupado: las tardías llegan en filas enteras (un fardo que se vende de golpe)."""
    if not agrupado:
        t = sum(1 for _ in range(n_unidades) if random.random() < p)
        return n_unidades, t
    # filas de 1 a 10 unidades (media 5.5); cada fila es tardía completa con prob q tal que la tasa por unidad sea p
    total = t = 0
    while total < n_unidades:
        k = random.randint(1, 10)
        total += k
        if random.random() < p: t += k
    return total, t
def frecuencia_de_sustos(n, p, agrupado, umbral, semanas, ventana_semanas=1, N=4000):
    """Con la MISMA disciplina siempre (tasa p), ¿qué fracción de ventanas muestra una tasa a tiempo por debajo de `umbral`?"""
    malas = 0
    for _ in range(N):
        u = t = 0
        for _ in range(ventana_semanas):
            a, b = semana(n, p, agrupado); u += a; t += b
        if 1 - t / u < umbral: malas += 1
    return malas / N
print("Disciplina CONSTANTE del 90 % a tiempo (10 % tardías). ¿Cuántas ventanas muestran menos de 85 % / 80 % solo por azar?\n")
print(f"{'unidades/semana':>16} {'ventana':>10} {'tardías juntas':>15} {'<85 %':>8} {'<80 %':>8} {'susto en 52 sem.':>18}")
for n in (10, 30, 100, 300):
    for vent, nombre in ((1, "1 semana"), (4, "4 semanas")):
        for agr in (False, True):
            a = frecuencia_de_sustos(n, 0.10, agr, 0.85, 52, vent)
            b = frecuencia_de_sustos(n, 0.10, agr, 0.80, 52, vent)
            print(f"{n:>16} {nombre:>10} {'sí (fardos)' if agr else 'no':>15} {a*100:7.1f}% {b*100:7.1f}% {b*52 if vent==1 else b*13:>14.1f} veces")
# el umbral de cambio real: con n1, n2 unidades por ventana, diferencia de proporciones mínima para z = 2 (sin agrupar / agrupado ~ x sqrt(5.5))
def dif_minima(n, p=0.1, z=2.0, deff=1.0):
    se = math.sqrt(deff * p * (1 - p) * (1 / n + 1 / n))
    return z * se
print("\nDiferencia mínima entre dos ventanas seguidas para llamarla «cambio real» (z = 2), a tasa de 10 % de tardías:")
for n in (30, 100, 400, 1200):
    print(f"  {n:>5} unidades por ventana → {dif_minima(n)*100:4.1f} pts sin agrupar · {dif_minima(n, deff=5.5)*100:4.1f} pts con fardos (efecto de diseño 5.5)")
# contracción hacia el propio pasado (Beta-Binomial): tasa mostrada = (t + k p0)/(n + k)
print("\nContracción hacia el propio pasado (p0 = 10 %, k = 100 unidades de peso): lo crudo vs lo que se mostraría")
for n, t in ((5, 1), (10, 3), (30, 6), (100, 20)):
    crudo = 1 - t / n
    k = 100; p0 = 0.10
    contra = 1 - (t + k * p0) / (n + k)
    print(f"  {n:>3} unidades, {t} tardías → crudo {crudo*100:5.1f} % · contraído {contra*100:5.1f} %")
