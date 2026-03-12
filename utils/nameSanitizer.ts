/**
 * Sanitizes a string to be used as a valid technical name (e.g., database column, table name, GeoPackage layer name).
 * 
 * Rules:
 * 1. Convert to lowercase.
 * 2. Replace Nordic and common accented characters with basic latin equivalents.
 * 3. Replace any character that is not a letter or number with an underscore.
 * 4. Prepend an underscore if the name starts with a number.
 * 5. Squeeze multiple underscores into a single underscore.
 * 6. Remove leading and trailing underscores (except the leading underscore added for number prefixes).
 * 
 * @param name The input string to sanitize.
 * @returns The sanitized technical name.
 */
export const sanitizeTechnicalName = (name: string): string => {
    if (!name) return '';

    let sanitized = name.toLowerCase();

    // Replace Nordic characters
    sanitized = sanitized.replace(/æ/g, 'ae')
        .replace(/ø/g, 'oe')
        .replace(/å/g, 'aa');

    // Normalize other accented characters (e.g., é -> e, ü -> u)
    sanitized = sanitized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Replace any non-alphanumeric character with an underscore
    sanitized = sanitized.replace(/[^a-z0-9]/g, '_');

    // Squeeze multiple underscores
    sanitized = sanitized.replace(/_+/g, '_');

    // Remove trailing underscores
    sanitized = sanitized.replace(/_+$/, '');

    // Handle leading underscores and leading numbers
    if (sanitized.match(/^[0-9]/)) {
        // If it starts with a number, prepend an underscore
        // and make sure we don't have multiple leading underscores
        sanitized = '_' + sanitized.replace(/^_+/, '');
    } else {
        // Remove any leading underscores if it doesn't start with a number
        sanitized = sanitized.replace(/^_+/, '');
    }

    // Fallback if the string becomes completely empty or invalid
    if (!sanitized) return 'untitled_field';

    return sanitized;
};
