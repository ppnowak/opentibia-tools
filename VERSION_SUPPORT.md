# Tibia Protocol Version Support

This document describes the multi-version support implementation for Tibia DAT and SPR file formats.

## Overview

The opentibia-tools package now includes comprehensive support for multiple Tibia client versions, automatically detecting and handling format differences between versions.

## Supported Versions

The tool supports **80+ Tibia client versions** from **7.10 through 10.97**, including:

- **7.x series**: 7.10, 7.30, 7.40, 7.50, 7.55, 7.60, 7.70, 7.80, 7.90
- **8.x series**: 8.00, 8.10, 8.20, 8.40, 8.50, 8.54, 8.60, 8.62, 8.70, 8.71
- **9.x series**: 9.00, 9.10, 9.20, 9.31, 9.40, 9.44, 9.50, 9.60, 9.70, 9.80, 9.81, 9.82, 9.83, 9.86
- **10.x series**: 10.00 through 10.97 (60+ versions)

## Version Detection

### Automatic Detection

Version detection is performed automatically when reading DAT or SPR files:

```javascript
const datLoader = require('./src/dat-loader');
const data = datLoader.read('./path/to/Tibia.dat');
// Output: Detected Tibia version: 10.97 (signature: 0xAC278056)
```

### How It Works

1. **DAT Files**: The first 4 bytes contain a version signature
2. **SPR Files**: The first 4 bytes (hdra + hdrb) contain a version signature
3. The signature is looked up in a comprehensive version database
4. Version-specific parsers and property sets are automatically selected

## Version-Specific Features

### Item Properties

Different Tibia versions have different item properties and flags:

#### Version 7.40 - 7.79
- Basic properties: Ground, Container, Stackable, etc.
- Limited attribute set (0x00 - 0x17)

#### Version 7.80 - 8.59
- Extended properties including:
  - Player color template
  - Height and draw offset
  - Minimap colors
  - Action IDs
- Property range: 0x00 - 0x1E

#### Version 8.60 - 10.09
- Reorganized property IDs
- New properties:
  - Offset and Elevation
  - Lying object and Animate always
  - Lens help
  - Cloth slot
  - Market information (complex structure)
- Property range: 0x00 - 0x21

#### Version 10.10+
- All 8.60+ properties plus:
  - Default action
  - Wrappable/Unwrappable
  - Top effect
- Property range: 0x00 - 0x25

### Sprite Format

All supported versions (7.10 - 10.98) use the same sprite format:
- RLE (Run-Length Encoded) compression
- 32x32 pixel sprites
- RGB color with transparency
- Variable-size sprite data

**Note**: Version 11+ uses a completely different format (Protobuf with LZMA compression) and is not currently supported.

## API

### Version Detection Functions

```javascript
const {
    getVersionByDatSignature,
    getVersionBySprSignature,
    getVersionByString,
    isValidDatSignature,
    isValidSprSignature
} = require('./src/commons/tibia-versions');

// Get version info by signature
const versionInfo = getVersionByDatSignature(0xAC278056);
// Returns: { version: '10.97', datSignature: 0xAC278056, sprSignature: 0xC9278056, otb: 94 }

// Check if signature is valid
const isValid = isValidDatSignature(0xAC278056); // Returns: true
```

### Version-Specific Properties

```javascript
const { getPropertiesForVersion } = require('./src/dat-loader/item-properties-versioned');

// Get properties for a specific version
const properties860 = getPropertiesForVersion('8.60');
const properties1097 = getPropertiesForVersion('10.97');
```

## Backwards Compatibility

The implementation maintains full backwards compatibility:

- Files without recognized signatures are handled with default properties
- Unknown property IDs are logged as warnings but don't break parsing
- The original property set (similar to 8.60) is used as fallback

## Implementation Details

### File Structure

```
src/
├── commons/
│   └── tibia-versions.js          # Version signatures and detection
├── dat-loader/
│   ├── index.js                   # Updated DAT reader/writer
│   ├── item-properties.js         # Original property definitions
│   └── item-properties-versioned.js  # Version-specific properties
└── spr-unpacker/
    └── index.js                   # Updated SPR reader with version detection
```

### Version Signatures

Signatures are stored as 32-bit little-endian integers. For example:
- Version 10.97 DAT: `0xAC278056`
- Version 10.97 SPR: `0xC9278056`

### Property Parsing

The parser uses a dynamic property lookup:
1. Version is detected from file signature
2. Appropriate property set is selected
3. Each property byte is looked up in the version-specific property table
4. Unknown properties are gracefully handled

## Testing

To test version support with your files:

```bash
# Extract DAT file (version auto-detected)
npm run unpack-dat ./binary/Tibia.dat ./binary/Tibia.json

# Extract SPR file (version auto-detected)
npm run unpack-spr ./binary/Tibia.spr ./sprites/tibia
```

The console output will display the detected version and signature.

## Future Enhancements

Potential future improvements:
- Support for Tibia 11+ (Protobuf format)
- Sprite size variations (64x64, etc.)
- Version conversion tools
- Enhanced property validation

## References

- [OTLand Forums](https://otland.net/) - Community documentation
- [TibiaJS Signatures](https://github.com/TibiaJS/tibia-signatures) - Version signature database
- [Open Tibia](https://github.com/ottools/open-tibia) - Reference implementations

## Contributing

When adding support for new versions:
1. Add version signature to `src/commons/tibia-versions.js`
2. If property set differs, update `src/dat-loader/item-properties-versioned.js`
3. Test with actual client files
4. Update documentation
