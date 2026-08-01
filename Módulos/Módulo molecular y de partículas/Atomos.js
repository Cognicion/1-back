const elementos = [

{
    ID: "H",
    Nombre: "Hidrógeno",
    Simbolo: "H",
    NumeroAtomico: 1,
    MasaAtomica: 1.008,
    Isotopos: ["Protio", "Deuterio", "Tritio"],
    Categoria: "No metal",
    Grupo: 1,
    Periodo: 1,
    Bloque: "s"
},

{
    ID: "He",
    Nombre: "Helio",
    Simbolo: "He",
    NumeroAtomico: 2,
    MasaAtomica: 4.002602,
    Isotopos: ["Helio-3", "Helio-4"],
    Categoria: "Gas noble",
    Grupo: 18,
    Periodo: 1,
    Bloque: "s"
},

{
    ID: "Li",
    Nombre: "Litio",
    Simbolo: "Li",
    NumeroAtomico: 3,
    MasaAtomica: 6.94,
    Isotopos: ["Litio-6", "Litio-7"],
    Categoria: "Metal alcalino",
    Grupo: 1,
    Periodo: 2,
    Bloque: "s"
},

{
    ID: "Be",
    Nombre: "Berilio",
    Simbolo: "Be",
    NumeroAtomico: 4,
    MasaAtomica: 9.0121831,
    Isotopos: ["Berilio-9"],
    Categoria: "Metal alcalinotérreo",
    Grupo: 2,
    Periodo: 2,
    Bloque: "s"
},

{
    ID: "B",
    Nombre: "Boro",
    Simbolo: "B",
    NumeroAtomico: 5,
    MasaAtomica: 10.81,
    Isotopos: ["Boro-10", "Boro-11"],
    Categoria: "Metaloide",
    Grupo: 13,
    Periodo: 2,
    Bloque: "p"
},

{
    ID: "C",
    Nombre: "Carbono",
    Simbolo: "C",
    NumeroAtomico: 6,
    MasaAtomica: 12.011,
    Isotopos: ["Carbono-12", "Carbono-13", "Carbono-14"],
    Categoria: "No metal",
    Grupo: 14,
    Periodo: 2,
    Bloque: "p"
},

{
    ID: "N",
    Nombre: "Nitrógeno",
    Simbolo: "N",
    NumeroAtomico: 7,
    MasaAtomica: 14.007,
    Isotopos: ["Nitrógeno-14", "Nitrógeno-15"],
    Categoria: "No metal",
    Grupo: 15,
    Periodo: 2,
    Bloque: "p"
},

{
    ID: "O",
    Nombre: "Oxígeno",
    Simbolo: "O",
    NumeroAtomico: 8,
    MasaAtomica: 15.999,
    Isotopos: ["Oxígeno-16", "Oxígeno-17", "Oxígeno-18"],
    Categoria: "No metal",
    Grupo: 16,
    Periodo: 2,
    Bloque: "p"
},

{
    ID: "F",
    Nombre: "Flúor",
    Simbolo: "F",
    NumeroAtomico: 9,
    MasaAtomica: 18.998403163,
    Isotopos: ["Flúor-19"],
    Categoria: "Halógeno",
    Grupo: 17,
    Periodo: 2,
    Bloque: "p"
},

{
    ID: "Ne",
    Nombre: "Neón",
    Simbolo: "Ne",
    NumeroAtomico: 10,
    MasaAtomica: 20.1797,
    Isotopos: ["Neón-20", "Neón-21", "Neón-22"],
    Categoria: "Gas noble",
    Grupo: 18,
    Periodo: 2,
    Bloque: "p"
},

{
    ID: "Na",
    Nombre: "Sodio",
    Simbolo: "Na",
    NumeroAtomico: 11,
    MasaAtomica: 22.98976928,
    Isotopos: ["Sodio-23"],
    Categoria: "Metal alcalino",
    Grupo: 1,
    Periodo: 3,
    Bloque: "s"
},

{
    ID: "Mg",
    Nombre: "Magnesio",
    Simbolo: "Mg",
    NumeroAtomico: 12,
    MasaAtomica: 24.305,
    Isotopos: ["Magnesio-24", "Magnesio-25", "Magnesio-26"],
    Categoria: "Metal alcalinotérreo",
    Grupo: 2,
    Periodo: 3,
    Bloque: "s"
},

{
    ID: "Al",
    Nombre: "Aluminio",
    Simbolo: "Al",
    NumeroAtomico: 13,
    MasaAtomica: 26.9815385,
    Isotopos: ["Aluminio-27"],
    Categoria: "Metal postransición",
    Grupo: 13,
    Periodo: 3,
    Bloque: "p"
},

{
    ID: "Si",
    Nombre: "Silicio",
    Simbolo: "Si",
    NumeroAtomico: 14,
    MasaAtomica: 28.085,
    Isotopos: ["Silicio-28", "Silicio-29", "Silicio-30"],
    Categoria: "Metaloide",
    Grupo: 14,
    Periodo: 3,
    Bloque: "p"
},

{
    ID: "P",
    Nombre: "Fósforo",
    Simbolo: "P",
    NumeroAtomico: 15,
    MasaAtomica: 30.973761998,
    Isotopos: ["Fósforo-31"],
    Categoria: "No metal",
    Grupo: 15,
    Periodo: 3,
    Bloque: "p"
},

{
    ID: "S",
    Nombre: "Azufre",
    Simbolo: "S",
    NumeroAtomico: 16,
    MasaAtomica: 32.06,
    Isotopos: ["Azufre-32", "Azufre-33", "Azufre-34", "Azufre-36"],
    Categoria: "No metal",
    Grupo: 16,
    Periodo: 3,
    Bloque: "p"
},

{
    ID: "Cl",
    Nombre: "Cloro",
    Simbolo: "Cl",
    NumeroAtomico: 17,
    MasaAtomica: 35.45,
    Isotopos: ["Cloro-35", "Cloro-37"],
    Categoria: "Halógeno",
    Grupo: 17,
    Periodo: 3,
    Bloque: "p"
},

{
    ID: "Ar",
    Nombre: "Argón",
    Simbolo: "Ar",
    NumeroAtomico: 18,
    MasaAtomica: 39.948,
    Isotopos: ["Argón-36", "Argón-38", "Argón-40"],
    Categoria: "Gas noble",
    Grupo: 18,
    Periodo: 3,
    Bloque: "p"
},

{
    ID: "K",
    Nombre: "Potasio",
    Simbolo: "K",
    NumeroAtomico: 19,
    MasaAtomica: 39.0983,
    Isotopos: ["Potasio-39", "Potasio-40", "Potasio-41"],
    Categoria: "Metal alcalino",
    Grupo: 1,
    Periodo: 4,
    Bloque: "s"
},

{
    ID: "Ca",
    Nombre: "Calcio",
    Simbolo: "Ca",
    NumeroAtomico: 20,
    MasaAtomica: 40.078,
    Isotopos: [
        "Calcio-40",
        "Calcio-42",
        "Calcio-43",
        "Calcio-44",
        "Calcio-46",
        "Calcio-48"
    ],
    Categoria: "Metal alcalinotérreo",
    Grupo: 2,
    Periodo: 4,
    Bloque: "s"
}

];
