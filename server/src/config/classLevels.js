// Fuente unica de la relacion grado de la clase -> nivel (A1.x).
// El docente declara el grado (3, 4 o 5) y los estudiantes solo ven las
// actividades de ese nivel. En JSON: `classGrade` = grado, `classLevel` = A1.x.
const GRADE_LEVELS = Object.freeze({ 3: 'A1.1', 4: 'A1.2', 5: 'A1.3' });
const VALID_GRADES = Object.freeze(Object.keys(GRADE_LEVELS).map(Number));
const LEVELS = Object.freeze(Object.values(GRADE_LEVELS));

// Solo enteros de tipo number incluidos en VALID_GRADES (rechaza '4', 4.5, true, NaN...).
function isValidGrade(value) {
    return typeof value === 'number' && VALID_GRADES.includes(value);
}

// Nivel A1.x del grado, o null si el grado es null, undefined o invalido.
function levelForGrade(grade) {
    return isValidGrade(grade) ? GRADE_LEVELS[grade] : null;
}

module.exports = { GRADE_LEVELS, VALID_GRADES, LEVELS, isValidGrade, levelForGrade };
