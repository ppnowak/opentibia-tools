const fs = require('fs');

const TibiaDatLoader = require('./src/tibia-dat-reader');

// const fileDir = "tibia.dat";
// const { headers, items } = TibiaDatLoader.read(fileDir);
// console.log(headers);
// const jsonToText = (obj) => JSON.stringify(obj, null, 2);
// fs.writeFileSync("tibiaDat.json", jsonToText({ headers, items }));

const data = require('./tibiaDat.json');
const fileDir = "newFile.dat";
TibiaDatLoader.write(fileDir, data);