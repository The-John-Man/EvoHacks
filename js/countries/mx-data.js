/* Mexico federal Bienestar constants — sourced program pages / official notices. */
(function (root) {
  "use strict";

  const DATA = {
    asOf: "November 2026",
    currency: "MXN",
    entities: [
      ["AGU", "Aguascalientes"], ["BCN", "Baja California"], ["BCS", "Baja California Sur"],
      ["CAM", "Campeche"], ["CHP", "Chiapas"], ["CHH", "Chihuahua"], ["CMX", "Ciudad de México"],
      ["COA", "Coahuila"], ["COL", "Colima"], ["DUR", "Durango"], ["GUA", "Guanajuato"],
      ["GRO", "Guerrero"], ["HID", "Hidalgo"], ["JAL", "Jalisco"], ["MEX", "México"],
      ["MIC", "Michoacán"], ["MOR", "Morelos"], ["NAY", "Nayarit"], ["NLE", "Nuevo León"],
      ["OAX", "Oaxaca"], ["PUE", "Puebla"], ["QUE", "Querétaro"], ["ROO", "Quintana Roo"],
      ["SLP", "San Luis Potosí"], ["SIN", "Sinaloa"], ["SON", "Sonora"], ["TAB", "Tabasco"],
      ["TAM", "Tamaulipas"], ["TLA", "Tlaxcala"], ["VER", "Veracruz"], ["YUC", "Yucatán"],
      ["ZAC", "Zacatecas"],
    ],
    // Source: https://www.programasparaelbienestar.gob.mx/programas/adultos-mayores/pension-para-personas-adultas-mayores/
    // 2026 amount confirmed via official payment calendar notice ($6,400 bimestral)
    pension65: {
      bimonthly: 6400,
      minAge: 65,
      applicationAvailability: "continuous",
      moduleLocator: "https://www.programasparaelbienestar.gob.mx/programas/adultos-mayores/pension-para-personas-adultas-mayores/",
      source: {
        label: "Pensión Adultos Mayores (Bienestar)",
        url: "https://www.programasparaelbienestar.gob.mx/programas/adultos-mayores/pension-para-personas-adultas-mayores/",
        effectivePeriod: "2026-01-01/2026-12-31",
      },
    },
    mujeresBienestar: {
      bimonthly: 3100,
      minAge: 60,
      maxAge: 64,
      applicationAvailability: "continuous",
      source: {
        label: "Pensión Mujeres Bienestar",
        url: "https://www.programasparaelbienestar.gob.mx/",
        effectivePeriod: "2026-01-01/2026-12-31",
      },
    },
    disability: {
      bimonthly: 3300,
      applicationAvailability: "continuous",
      source: {
        label: "Pensión Personas con Discapacidad",
        url: "https://www.programasparaelbienestar.gob.mx/",
        effectivePeriod: "2026-01-01/2026-12-31",
      },
    },
    becaRita: {
      applicationAvailability: "unknown",
      source: {
        label: "Beca Rita Cetina (directory)",
        url: "https://www.programasparaelbienestar.gob.mx/",
        effectivePeriod: "2026-01-01/2026-12-31",
      },
    },
    becaBenito: {
      applicationAvailability: "unknown",
      source: {
        label: "Beca Benito Juárez (directory)",
        url: "https://www.programasparaelbienestar.gob.mx/",
        effectivePeriod: "2026-01-01/2026-12-31",
      },
    },
    jcf: {
      minAge: 18,
      maxAge: 29,
      applicationAvailability: "unknown",
      source: {
        label: "Jóvenes Construyendo el Futuro",
        url: "https://www.programasparaelbienestar.gob.mx/",
        effectivePeriod: "2026-01-01/2026-12-31",
      },
    },
  };

  root.ClaimableMXData = DATA;
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
})(typeof window !== "undefined" ? window : globalThis);
