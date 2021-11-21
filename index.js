const fs = require('fs');
const TibiaDatLoader = require('./src/dat-loader');
const { getArguments, log } = require('./src/utils');

const argv = getArguments();

log(`Starting program ${argv.mode}`);
switch (argv.mode) {
    
    case 'unpack-dat': {
        const [ datFile, jsonFile ] = argv._;
        const data = TibiaDatLoader.read(datFile);
        fs.writeFileSync(jsonFile, JSON.stringify(data, null, 2));
        log(`File ${datFile} was unpacked into ${jsonFile}`);
        break;
    }

    case 'pack-dat': {
        const [ jsonFile, datFile ] = argv._;
        const data = fs.readFileSync(jsonFile);
        TibiaDatLoader.write(datFile, JSON.parse(data));
        log(`File ${jsonFile} was packed into ${datFile}`);
        break;
    }

    default:
        log(`Mode ${argv.mode} is not supported!`);

}