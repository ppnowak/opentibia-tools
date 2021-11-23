# Installation
* installed nodejs
* command `npm install` executed after extracting this repo

# Tibia.dat editor

## Extracting
To extract, use this command:
```
npm run unpack-dat ./binary/Tibia.dat ./binary/Tibia.json
```
File `Tibia.dat` will be loaded from directory `binary`, then saved as `Tibia.json`

## Compiling
To compile, use this command:
```
npm run pack-dat ./binary/Tibia.json ./binary/NewTibia.dat
```
File `Tibia.json` will be loaded from directory `binary`, then saved as `Tibia.dat`

# Tibia.spr

## Extracting
To extract, use this command:
```
npm run unpack-spr ./binary/Tibia.spr ./sprites/tibia
```
File `Tibia.spr` will be loaded from directory `binary` and all sprites will be exported to the directory `sprites/tibia` with default `bmp` format and `32x32px` size.

# Tibia.cwm

## Extracting
To extract, use this command:
```
npm run unpack-cwm ./binary/Tibia.cwm ./sprites/tibia-cwm
```
File `Tibia.cwm` will be loaded from directory `binary` and all sprites will be exported to the directory `sprites/tibia-cwm` with default `png` format and same size as stored in `cwm` file.

## Compiling
To compile, use this command:
```
npm run pack-cwm ./sprites/png64 ./binary/Tibia.cwm
```
All files from directory `sprites/png64` will be packed into `Tibia.cwm` file

# Image Converter
To convert sprites (`bmp`, `png` supported), type this command:
```
npm run convert-to-png <FROM> <TO> <SIZE>
npm run convert-to-png ./sprites/tibia ./sprites/png64 64
```
All files from `sprites/tibia` directory will be converted to `png` format and resized to `64x64px`, then stored in `sprites/png64`

# E2E Outfit Adding

File `.env` must be created in the root directory:
```
PROCESSED_IMAGES_DIR=./sprites/processed
ORIGINAL_TIBIA_DAT_DIR=./binary/tibia.dat
ORIGINAL_TIBIA_SPR_DIR=./binary/tibia.spr
BINARIES_PUBLISH_DIR=./path/to/otclient

UNPACK_SPR=false
UNPACKED_SPR_DIR=./sprites/tibia

NEW_IMAGE_START_ID=64455
NEW_LOOKTYPE_START_ID=1000
SPRITE_SIZE=64

OUTFITS_0=./sprites/first-outfit
OUTFITS_1=./sprites/second-outfit
```
1) All paths supports both unix & windows styles, so you can use both: `/home/user/directory` and `C:\Users\user\directory`

2) Use `UNPACK_SPR=true` only for the first execution as this process may take a long time.

3) Each outfit must be added to the separate directory, with the same name convention:
```
directory
-> 11.png
-> 12.png
-> 13.png
-> 21.png
-> 22.png
-> 23.png
-> 31.png
-> 32.png
-> 33.png
-> 41.png
-> 42.png
-> 43.png
```

To run e2e, use this command:
```
npm run e2e
```

Expected output:
```
> npm run e2e
[2021-11-23T14:02:09.832Z] Starting end to end
[2021-11-23T14:02:09.835Z] Loading tibia.dat
[2021-11-23T14:02:14.149Z] Original tibia.dat loaded
[2021-11-23T14:02:14.149Z] Adding new outfits
[2021-11-23T14:02:15.129Z] Added new outfits to tibia.dat
[2021-11-23T14:02:22.106Z] Compiled Tibia.dat file
[2021-11-23T14:02:32.911Z] Compiled Tibia.cwm file
[2021-11-23T14:02:32.914Z] Done
```