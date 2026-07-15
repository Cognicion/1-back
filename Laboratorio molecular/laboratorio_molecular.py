import math


class Atomo:
    def __init__(self, elemento, masa, carga, x, y, z):
        self.elemento = elemento
        self.masa = masa
        self.carga = carga
        self.posicion = [x, y, z]


def calcular_distancia(atomo_1, atomo_2):
    x1, y1, z1 = atomo_1.posicion
    x2, y2, z2 = atomo_2.posicion

    diferencia_x = x2 - x1
    diferencia_y = y2 - y1
    diferencia_z = z2 - z1

    distancia = math.sqrt(
        diferencia_x**2
        + diferencia_y**2
        + diferencia_z**2
    )

    return distancia


hidrogeno = Atomo(
    elemento="H",
    masa=1.008,
    carga=0.33,
    x=0,
    y=0,
    z=0
)

helio = Atomo(
    elemento="He",
    masa=4.0026,
    carga=0,
    x=0,    
y=0,
z=0

)

oxigeno = Atomo(
    elemento="O",
    masa=15.999,
    carga=-0.66,
    x=0.96,
    y=0,
    z=0
)


print("Elemento:", hidrogeno.elemento)
print("Masa:", hidrogeno.masa)
print("Carga:", hidrogeno.carga)
print("Posición:", hidrogeno.posicion)

print()

print("Elemento:", oxigeno.elemento)
print("Masa:", oxigeno.masa)
print("Carga:", oxigeno.carga)
print("Posición:", oxigeno.posicion)

print()

distancia = calcular_distancia(hidrogeno, oxigeno)

print("Distancia entre H y O:", distancia, "Å")