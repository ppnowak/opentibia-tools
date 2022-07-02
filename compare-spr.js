const { calculateDirectoryFilesChecksum } = require("./src/commons/crypto-utils");
const fs = require('fs');
const { log } = require("./src/commons/utils");
const TibiaSprUnpacker = require('./src/spr-unpacker');

const saveJson = (target, data) => fs.writeFileSync(target, JSON.stringify(data, null, 2));

const summarizeSingleFile = ({ name, dir, checksums }) => {
    const data = require(checksums);
    const summary = data.map(it => it.checksum).reduce((tab, checksum) => {
        if (!tab[checksum]) {
            tab[checksum] = 0;
        }
        tab[checksum]++;
        return tab;
    }, {});
    const duplicates = Object.entries(summary).filter(([key, value]) => value > 1);
    console.log(`### ${name} Summary (${dir}) ###`);
    console.log(`# Sprites (total): ${data.length}`);
    console.log(`# Sprites (unique): ${Object.keys(summary).length}`);
    console.log(`# Duplicated (total): ${duplicates.reduce((prev, value) => prev + value[1], 0)}`);
    console.log(`# Duplicated (unique): ${duplicates.length}`);
    console.log();
}

(async() => {

    const deepMatch = true;
    const comparisonFile = './binary/comparison.json';
    const config = [
        { 
            name: 'Tibia 7.6', 
            sprDir: './binary/tibia76/Tibia.spr', 
            unpackedDir: './sprites/tibia76/', 
            checksums: './binary/checksums_76.json' 
        },
        { 
            name: 'RonOTS',    
            sprDir: './binary/Tibia.spr', 
            unpackedDir: './sprites/tibia/',   
            checksums: './binary/checksums_ron.json' 
        },
    ];

    const [ first, second ] = config;

    for (const { name, sprDir, unpackedDir } of config) {
        log(`Unpacking ${name} spr file...`);
        await TibiaSprUnpacker.extract(sprDir, unpackedDir);
        log(`Done`);
    }

    for (const { name, unpackedDir, checksums } of config) {
        log(`Calculating sprite checksums for ${name}...`);
        const md5 = await calculateDirectoryFilesChecksum(unpackedDir);
        saveJson(checksums, md5);
        log(`Done`);
    }

    log(`Comparing files...`)
    const filesDir1 = require(first.checksums);
    const filesDir2 = require(second.checksums);
    const matchingRecords = [];
    for (const { file, checksum } of filesDir1) {
        const matches = filesDir2.filter(tf => tf.checksum === checksum && (!deepMatch || tf.file === file)).map(tf => tf.file);
        matchingRecords.push({ from: file, to: matches });
    }
    saveJson(comparisonFile, matchingRecords);
    log(`Done`);

    summarizeSingleFile(first);
    summarizeSingleFile(second);
    const records = require(comparisonFile);
    const matchedFiles = records.filter(x => x.to.length > 0).length;
    const unmatchedFiles = records.filter(x => x.to.length === 0).length;
    console.log(`${first.name} files found in ${second.name}: ${matchedFiles} (${unmatchedFiles} missing)`);

})();