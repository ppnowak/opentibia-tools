const bufferToNumber = buffer => {
    let val = 0, factor = 1;
    for (let i=0; i<buffer.length; i++) {
        val += parseInt(buffer[i]) * factor;
        factor *= 256;
    }
    return val;
}

const numberToBuffer = (number, length) => {
    const buff = [];
    for (let i=0; i<length; i++) {
        const moveBy = 8 * i;
        const val = (number >> moveBy) & 255;
        buff.push(val)
    }
    return Buffer.from(buff);
}

module.exports = { bufferToNumber, numberToBuffer };