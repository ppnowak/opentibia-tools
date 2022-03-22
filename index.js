const fs = require('fs');
const TibiaDatLoader = require('./src/dat-loader');
const TibiaSprUnpacker = require('./src/spr-unpacker');
const TibiaCwmPacker = require('./src/cwm-packer');
const ImageConverter = require('./src/image-converter');
const { getArguments, log } = require('./src/commons/utils');

const argv = getArguments();
log(`Starting program ${argv.mode}`);

(async() => {
    switch (argv.mode) {
        
        // npm run unpack-dat ./binary/Tibia.dat ./binary/json
        case 'unpack-dat': {
            const [ datFile, jsonDir ] = argv._;
            TibiaDatLoader.unpackToDirectory(datFile, jsonDir);
            log(`File ${datFile} was unpacked into ${jsonDir}`);
            break;
        }
        
        // npm run unpack-dat-compressed ./binary/Tibia.dat ./binary/Tibia.json
        case 'unpack-dat-compressed': {
            const [ datFile, jsonFile ] = argv._;
            TibiaDatLoader.unpackToJSON(datFile, jsonFile);
            log(`File ${datFile} was unpacked into ${jsonFile}`);
            break;
        }
        
        // npm run pack-dat ./binary/Tibia.json ./binary/NewTibia.dat
        case 'pack-dat': {
            const [ jsonFile, datFile ] = argv._;
            const data = fs.readFileSync(jsonFile);
            TibiaDatLoader.write(datFile, JSON.parse(data));
            log(`File ${jsonFile} was packed into ${datFile}`);
            break;
        }
        
        // npm run unpack-spr ./binary/Tibia.spr ./sprites/tibia
        case 'unpack-spr': {
            const [ sprFile, sprDirectory ] = argv._;
            await TibiaSprUnpacker.extract(sprFile, sprDirectory);
            log(`File ${sprFile} was extracted to ${sprDirectory}`);
            break;
        }

        // npm run convert-to-png ./sprites/tibia ./sprites/png64 64
        case 'convert-to-png': {
            const [ bmpDir, pngDir, tmpSize ] = argv._;
            const size = parseInt(tmpSize || '32');
            await ImageConverter.convertToPng(bmpDir, pngDir, {size});
            log(`Directory ${bmpDir} files were converted and saved to ${pngDir}`);
            break;
        }

        // npm run unpack-cwm ./binary/Tibia.cwm ./sprites/tibia-cwm
        case 'unpack-cwm': {
            const [ cwmFile, pngDirectory ] = argv._;
            TibiaCwmPacker.extract(cwmFile, pngDirectory);
            log(`File ${cwmFile} was extracted to ${pngDirectory}`);
            break;
        }

        // npm run pack-cwm ./sprites/png64 ./binary/Tibia.cwm
        case 'pack-cwm': {
            const [ pngDirectory, cwmFile ] = argv._;
            TibiaCwmPacker.compress(pngDirectory, cwmFile);
            log(`Directory ${pngDirectory} was packed to ${cwmFile}`);
            break;
        }
        
        default:
            log(`Mode ${argv.mode} is not supported!`);
            
        }
})();