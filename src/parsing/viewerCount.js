function parseViewerCount(rawText) {
    if (!rawText) {
        return null;
    }

    const normalized = rawText
        .replace(/\u00A0/g, ' ')
        .replace(/\u202F/g, ' ')
        .trim();

    const match = normalized.match(/([\d.,]+)\s*(K|M|B)?\s*(watching|waiting)/i);
    if (!match) {
        return null;
    }

    let numericPart = match[1].trim();
    const suffix = match[2]?.toUpperCase() || null;

    if (!suffix && numericPart.includes('.') && !numericPart.includes(',')) {
        const [, decimals] = numericPart.split('.');
        if (decimals && decimals.length === 3) {
            numericPart = numericPart.replace(/\./g, '');
        }
    }

    const cleaned = numericPart.replace(/,/g, '');
    const baseValue = Number.parseFloat(cleaned);
    if (!Number.isFinite(baseValue)) {
        return null;
    }

    let multiplier = 1;
    if (suffix === 'K') {
        multiplier = 1e3;
    } else if (suffix === 'M') {
        multiplier = 1e6;
    } else if (suffix === 'B') {
        multiplier = 1e9;
    }

    return Math.round(baseValue * multiplier);
}

module.exports = {
    parseViewerCount,
};
