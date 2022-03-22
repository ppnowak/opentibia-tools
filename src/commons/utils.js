const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

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

const getArguments = () => yargs(hideBin(process.argv)).argv;

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

const readEnvArray = (name) => {
    const items = [];
    let position = 0;
    const getValue = position => process.env[`${name}_${position}`];
    while (getValue(position)) {
        const directory = getValue(position);
        const id = ++position;
        items.push({directory, id});
    }
    return items;
}

module.exports = { bufferToNumber, numberToBuffer, getArguments, log, readEnvArray };