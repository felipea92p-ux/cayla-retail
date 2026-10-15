import json,collections,sys
d=json.load(open(sys.argv[1]))
ic=[dict(x,ruta=v['ruta'],esc=v['esc']) for v in d for x in v['iconos']]
gl=[dict(x,ruta=v['ruta'],esc=v['esc']) for v in d for x in v['globos']]
# un mismo ícono visto en dos escenarios de la misma ruta cuenta una vez
def uniq(xs,k):
    vis=set();o=[]
    for x in xs:
        t=k(x)
        if t in vis: continue
        vis.add(t);o.append(x)
    return o
ic=uniq(ic,lambda x:(x['ruta'],x['nombre'],x['tam'],x['trazo'],x['en'],x['clases'],x['padre'],x['zona']))
print(len(d),"visitas;",len(ic),"íconos únicos;",len(gl),"globitos")
print("\nTAMAÑO (px):",collections.Counter(x['tam'] for x in ic).most_common(25))
print("\nTRAZO (atributo):",collections.Counter(x['trazo'] for x in ic).most_common(20))
print("\nTRAZO VISIBLE (px):",collections.Counter(round(x['trazoPx']*4)/4 for x in ic).most_common(12))
print("\nDÓNDE × TAMAÑO:")
for en in ("btn-cayla","button","a","texto"):
    print(" ",en,collections.Counter(x['tam'] for x in ic if x['en']==en).most_common(10))
print("\nLETRA DE AL LADO × TAMAÑO (texto):")
for l in sorted({x['letra'] for x in ic if x['en']=='texto'}):
    c=collections.Counter(x['tam'] for x in ic if x['en']=='texto' and x['letra']==l)
    if sum(c.values())>=5: print(" ",l,c.most_common(6))
print("\nPROPIOS:",collections.Counter((x['tam']) for x in ic if x['nombre']=='propio').most_common(8))
