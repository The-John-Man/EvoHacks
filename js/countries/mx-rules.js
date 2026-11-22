/* Mexican federal Bienestar eligibility evaluators. */
(function (root) {
  "use strict";

  const D = root.ClaimableMXData || (typeof require !== "undefined" ? require("./mx-data.js") : null);

  function moneyMXN(n) {
    return "$" + Math.round(n).toLocaleString("es-MX") + " MXN";
  }

  function buildContext(h) {
    const children = (h.children || []).filter((a) => Number.isFinite(a) && a >= 0);
    const adults = Math.max(1, h.adults || 1);
    return {
      entity: h.entity || "",
      adults,
      children,
      size: adults + children.length,
      applicantAge: Number.isFinite(h.applicantAge) ? Number(h.applicantAge) : null,
      gender: h.gender || "unspecified",
      mexicanNational: h.mexicanNational === true,
      nationalityUnknown: h.nationalityUnknown === true || h.mexicanNational === undefined || h.mexicanNational === null,
      residesInMexico: h.residesInMexico !== false,
      disabilityCertified: !!h.disabilityCertified,
      inPublicSchool: !!h.inPublicSchool,
      schoolLevel: h.schoolLevel || "none",
      otherScholarship: !!h.otherScholarship,
      working: !!h.working,
      studying: !!h.studying,
      enrolled: h.enrolled || {},
      currency: "MXN",
    };
  }

  const PROGRAMS = [
    {
      id: "mx-pension-65",
      name: "Pensión Adultos Mayores",
      category: "Seniors",
      kind: "cash",
      blurb: "Apoyo económico bimestral para personas de 65 años o más que residan en México.",
      apply: {
        label: "Registro / módulos",
        url: D.pension65.moduleLocator,
      },
      source: D.pension65.source,
      docs: ["Acta de nacimiento", "Identificación oficial vigente", "CURP actualizada (en el registro, no aquí)", "Comprobante de domicilio", "Teléfono de contacto"],
      evaluate(ctx) {
        if (ctx.enrolled.pension65) return { status: "enrolled", reasons: ["Ya recibes la Pensión para el Bienestar de Adultos Mayores."] };
        const age = ctx.applicantAge;
        if (age === null) {
          return { status: "maybe", reasons: ["Indica la edad de la persona solicitante."], missingQuestions: ["applicantAge"] };
        }
        if (age < D.pension65.minAge) {
          return { status: "unlikely", reasons: [`Este programa es para personas de ${D.pension65.minAge} años o más. Edad indicada: ${age}.`] };
        }
        if (ctx.nationalityUnknown) {
          return {
            status: "maybe",
            reasons: ["Se requiere nacionalidad mexicana por nacimiento o naturalización. Confirma la nacionalidad para continuar."],
            missingQuestions: ["mexicanNational"],
          };
        }
        if (!ctx.mexicanNational) {
          return { status: "unlikely", reasons: ["El programa requiere nacionalidad mexicana."] };
        }
        if (!ctx.residesInMexico) {
          return { status: "unlikely", reasons: ["Debes residir en México para recibir esta pensión."] };
        }
        const annual = D.pension65.bimonthly * 6;
        return {
          status: "likely",
          reasons: [
            `Edad ${age}, nacionalidad mexicana y residencia en México cumplen los requisitos principales publicados.`,
            `Monto de referencia 2026: ${moneyMXN(D.pension65.bimonthly)} cada dos meses.`,
            "El registro es presencial en módulos del Bienestar durante las ventanas anunciadas.",
          ],
          annual,
          valueLabel: `${moneyMXN(D.pension65.bimonthly)} / 2 months`,
          currency: "MXN",
          cadence: "bimonthly",
          applicationAvailability: D.pension65.applicationAvailability,
        };
      },
    },
    {
      id: "mx-mujeres",
      name: "Pensión Mujeres Bienestar",
      category: "Seniors",
      kind: "cash",
      blurb: "Apoyo para mujeres de 60 a 64 años; al cumplir 65 pueden pasar a la pensión de adultos mayores.",
      apply: { label: "Programas para el Bienestar", url: "https://www.programasparaelbienestar.gob.mx/" },
      source: D.mujeresBienestar.source,
      docs: ["Identificación oficial", "CURP", "Comprobante de domicilio", "Acta de nacimiento"],
      evaluate(ctx) {
        if (ctx.enrolled.mujeres) return { status: "enrolled", reasons: ["Ya recibes la Pensión Mujeres Bienestar."] };
        const age = ctx.applicantAge;
        if (age === null) {
          return { status: "maybe", reasons: ["Indica la edad para evaluar Mujeres Bienestar."], missingQuestions: ["applicantAge"] };
        }
        if (ctx.gender === "male") {
          return { status: "unlikely", reasons: ["Este programa está dirigido a mujeres de 60 a 64 años."] };
        }
        if (age < D.mujeresBienestar.minAge || age > D.mujeresBienestar.maxAge) {
          if (age >= 65) {
            return { status: "unlikely", reasons: ["A los 65 años corresponde la Pensión de Adultos Mayores, no Mujeres Bienestar."] };
          }
          return { status: "unlikely", reasons: [`Mujeres Bienestar cubre edades ${D.mujeresBienestar.minAge}–${D.mujeresBienestar.maxAge}. Edad: ${age}.`] };
        }
        if (ctx.nationalityUnknown) {
          return { status: "maybe", reasons: ["Confirma nacionalidad mexicana."], missingQuestions: ["mexicanNational"] };
        }
        if (!ctx.mexicanNational || !ctx.residesInMexico) {
          return { status: "unlikely", reasons: ["Se requieren nacionalidad mexicana y residencia en México."] };
        }
        const annual = D.mujeresBienestar.bimonthly * 6;
        return {
          status: "likely",
          reasons: [
            `Mujer de ${age} años con nacionalidad y residencia en México — puedes calificar.`,
            `Monto de referencia 2026: ${moneyMXN(D.mujeresBienestar.bimonthly)} bimestrales.`,
          ],
          annual,
          valueLabel: `${moneyMXN(D.mujeresBienestar.bimonthly)} / 2 months`,
          currency: "MXN",
          cadence: "bimonthly",
          applicationAvailability: D.mujeresBienestar.applicationAvailability,
        };
      },
    },
    {
      id: "mx-disability",
      name: "Pensión Personas con Discapacidad",
      category: "Disability",
      kind: "cash",
      blurb: "Apoyo bimestral para personas con discapacidad permanente (cobertura según reglas estatales).",
      apply: { label: "Programas para el Bienestar", url: "https://www.programasparaelbienestar.gob.mx/" },
      source: D.disability.source,
      docs: ["Certificado de discapacidad permanente", "Identificación oficial", "CURP", "Comprobante de domicilio"],
      evaluate(ctx) {
        if (ctx.enrolled.disability) return { status: "enrolled", reasons: ["Ya recibes la pensión por discapacidad."] };
        if (!ctx.disabilityCertified) {
          return {
            status: "maybe",
            reasons: ["Este programa requiere certificación de discapacidad permanente. Si la tienes, márcala; la cobertura también puede depender del estado."],
            missingQuestions: ["disabilityCertified"],
          };
        }
        if (ctx.nationalityUnknown || !ctx.mexicanNational) {
          return { status: "maybe", reasons: ["Confirma nacionalidad y revisa si tu entidad tiene convenio vigente."], missingQuestions: ["mexicanNational"] };
        }
        const annual = D.disability.bimonthly * 6;
        return {
          status: "likely",
          reasons: [
            "Con certificación de discapacidad permanente puedes ser elegible; verifica la cobertura en tu entidad federativa.",
            `Monto de referencia 2026: ${moneyMXN(D.disability.bimonthly)} bimestrales.`,
          ],
          annual,
          valueLabel: `${moneyMXN(D.disability.bimonthly)} / 2 months`,
          currency: "MXN",
          cadence: "bimonthly",
          applicationAvailability: D.disability.applicationAvailability,
        };
      },
    },
    {
      id: "mx-beca-rita",
      name: "Beca Rita Cetina",
      category: "Education",
      kind: "cash",
      blurb: "Beca para estudiantes de educación básica en escuelas públicas (requisitos según convocatoria).",
      apply: { label: "Directorio Bienestar", url: "https://www.programasparaelbienestar.gob.mx/" },
      source: D.becaRita.source,
      docs: ["Comprobante de inscripción en escuela pública", "CURP del estudiante", "Datos de la madre, padre o tutor"],
      evaluate(ctx) {
        if (ctx.enrolled.becaRita) return { status: "enrolled", reasons: ["Ya recibes la Beca Rita Cetina."] };
        const schoolKids = ctx.children.filter((a) => a >= 3 && a <= 15);
        if (!ctx.inPublicSchool && !schoolKids.length) {
          return { status: "unlikely", reasons: ["Esta beca está orientada a educación básica en escuelas públicas."] };
        }
        if (ctx.otherScholarship) {
          return { status: "maybe", reasons: ["Otras becas pueden ser incompatibles. Revisa la convocatoria vigente."] };
        }
        if (!ctx.inPublicSchool) {
          return {
            status: "maybe",
            reasons: ["Tienes niñas/niños en edad escolar. Confirma inscripción en escuela pública y la convocatoria actual."],
            missingQuestions: ["inPublicSchool"],
            applicationAvailability: "unknown",
          };
        }
        return {
          status: "maybe",
          reasons: [
            "Puedes ser elegible si el estudiante está en el grado cubierto por la convocatoria vigente.",
            "El monto y el calendario los publica el programa; no estimamos un pago sin la convocatoria actual.",
          ],
          valueLabel: "agency calculates",
          applicationAvailability: D.becaRita.applicationAvailability,
        };
      },
    },
    {
      id: "mx-beca-benito",
      name: "Beca Benito Juárez",
      category: "Education",
      kind: "cash",
      blurb: "Apoyo para educación media superior en escuelas públicas.",
      apply: { label: "Directorio Bienestar", url: "https://www.programasparaelbienestar.gob.mx/" },
      source: D.becaBenito.source,
      docs: ["Comprobante de inscripción en media superior pública", "CURP", "Identificación del estudiante o tutor"],
      evaluate(ctx) {
        if (ctx.enrolled.becaBenito) return { status: "enrolled", reasons: ["Ya recibes la Beca Benito Juárez."] };
        const age = ctx.applicantAge;
        const teens = ctx.children.filter((a) => a >= 14 && a <= 20);
        const inUpper = ctx.schoolLevel === "upper-secondary" || ctx.studying;
        if (!inUpper && !teens.length && (age === null || age < 14 || age > 22)) {
          return { status: "unlikely", reasons: ["Benito Juárez se orienta a media superior pública."] };
        }
        if (ctx.otherScholarship) {
          return { status: "maybe", reasons: ["Revisa incompatibilidades con otras becas en la convocatoria."] };
        }
        return {
          status: "maybe",
          reasons: [
            "Si hay inscripción vigente en media superior pública, conviene revisar Benito Juárez.",
            "Monto y fechas dependen de la convocatoria oficial.",
          ],
          valueLabel: "agency calculates",
          applicationAvailability: D.becaBenito.applicationAvailability,
        };
      },
    },
    {
      id: "mx-jcf",
      name: "Jóvenes Construyendo el Futuro",
      category: "Work",
      kind: "cash",
      blurb: "Capacitación con apoyo económico para jóvenes de 18 a 29 años que no estudian ni trabajan.",
      apply: { label: "Jóvenes Construyendo el Futuro", url: "https://www.programasparaelbienestar.gob.mx/" },
      source: D.jcf.source,
      docs: ["Identificación oficial", "CURP", "Comprobante de domicilio"],
      evaluate(ctx) {
        if (ctx.enrolled.jcf) return { status: "enrolled", reasons: ["Ya participas en Jóvenes Construyendo el Futuro."] };
        const age = ctx.applicantAge;
        if (age === null) {
          return { status: "maybe", reasons: ["Indica la edad para evaluar este programa."], missingQuestions: ["applicantAge"] };
        }
        if (age < D.jcf.minAge || age > D.jcf.maxAge) {
          return { status: "unlikely", reasons: [`El directorio describe edades ${D.jcf.minAge}–${D.jcf.maxAge}. Edad: ${age}.`] };
        }
        if (ctx.working || ctx.studying) {
          return { status: "unlikely", reasons: ["El programa está dirigido a jóvenes que no trabajan ni estudian."] };
        }
        return {
          status: "maybe",
          reasons: [
            `Edad ${age} y sin trabajo/estudio actuales — puedes ser elegible si hay lugares disponibles.`,
            "La disponibilidad de aperturas cambia; confirma en el portal oficial (no podemos verificar cupos desde esta app).",
          ],
          valueLabel: "depends on openings",
          applicationAvailability: D.jcf.applicationAvailability,
        };
      },
    },
  ];

  function screen(household) {
    const ctx = buildContext(household);
    const ORDER = { likely: 0, maybe: 1, enrolled: 2, unlikely: 3 };
    const results = PROGRAMS.map((p) => {
      const r = p.evaluate(ctx) || { status: "unlikely" };
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        kind: p.kind,
        blurb: p.blurb,
        apply: p.apply,
        source: p.source,
        docs: p.docs,
        status: r.status,
        reasons: r.reasons || [],
        annual: r.annual || 0,
        valueLabel: r.valueLabel || "",
        currency: r.currency || "MXN",
        cadence: r.cadence || "",
        applicationAvailability: r.applicationAvailability || "",
        missingQuestions: r.missingQuestions || [],
      };
    }).sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.annual - a.annual);

    const likelyCash = results.filter((r) => r.status === "likely" && r.kind === "cash" && r.annual > 0);
    const maybeCash = results.filter((r) => r.status === "maybe" && r.kind === "cash" && r.annual > 0);
    return {
      country: "MX",
      currency: "MXN",
      ctx: {
        size: ctx.size,
        entity: ctx.entity,
        pct: null,
      },
      results,
      totals: {
        likelyAnnual: likelyCash.reduce((s, r) => s + r.annual, 0),
        maybeAnnual: maybeCash.reduce((s, r) => s + r.annual, 0),
        likelyCount: results.filter((r) => r.status === "likely").length,
        maybeCount: results.filter((r) => r.status === "maybe").length,
      },
      asOf: D.asOf,
    };
  }

  const API = { screen, buildContext, PROGRAMS };
  root.ClaimableMX = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
