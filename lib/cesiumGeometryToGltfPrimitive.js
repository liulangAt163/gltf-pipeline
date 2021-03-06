'use strict';
var Cesium = require('cesium');

var createAccessor = require('./createAccessor');
var findAccessorMinMax = require('./findAccessorMinMax');
var getPrimitiveAttributeSemantics = require('./getPrimitiveAttributeSemantics');
var mergeBuffers = require('./mergeBuffers');
var uninterleaveAndPackBuffers = require('./uninterleaveAndPackBuffers');
var writeAccessor = require('./writeAccessor');

var DeveloperError = Cesium.DeveloperError;
var WebGLConstants = Cesium.WebGLConstants;

module.exports = cesiumGeometryToGltfPrimitive;

function getFirstAttributeSemantic(gltf, primitive, semantic, packedLength) {
    var semantics = getPrimitiveAttributeSemantics(primitive, semantic);
    var type;
    if (semantic === 'TEXCOORD') {
        type = 'VEC2';
    } else if (semantic === 'POSITION' || semantic === 'NORMAL') {
        type = 'VEC3';
    } else {
        throw new DeveloperError('Unsupported attribute semantic: ' + semantic);
    }
    if (semantics.length <= 0) {
        primitive.attributes[semantic] = createAccessor(gltf, packedLength, type, WebGLConstants.FLOAT, WebGLConstants.ARRAY_BUFFER);
        return semantic;
    }
    return semantics[0];
}

// Helper function to write attributes to gltf primitive from cesium geometry
function mapGeometryAttributeToPrimitive(gltf, primitive, geometry, semantic) {
    var attributeSemantic;
    var values;
    var packedAttributeLength = geometry.attributes.position.values.length;

    switch(semantic) {
        case 'position':
            attributeSemantic = getFirstAttributeSemantic(gltf, primitive, 'POSITION', packedAttributeLength);
            values = geometry.attributes.position.values;
            break;
        case 'normal':
            attributeSemantic = getFirstAttributeSemantic(gltf, primitive, 'NORMAL', packedAttributeLength);
            values = geometry.attributes.normal.values;
            break;
        case 'st':
            attributeSemantic = getFirstAttributeSemantic(gltf, primitive, 'TEXCOORD', packedAttributeLength);
            values = geometry.attributes.st.values;
            break;
        default:
            attributeSemantic = semantic;
            values = geometry.attributes[semantic].values;
    }
    var accessorId = primitive.attributes[attributeSemantic];
    var accessor = gltf.accessors[accessorId];
    writeAccessor(gltf, accessor, values);

    var minMax = findAccessorMinMax(gltf, accessor);
    accessor.min = minMax.min;
    accessor.max = minMax.max;
}

/**
 * @private
 */
function cesiumGeometryToGltfPrimitive(gltf, primitive, geometry) {
    var attributes = geometry.attributes;
    for (var semantic in attributes) {
        if (attributes.hasOwnProperty(semantic)) {
            mapGeometryAttributeToPrimitive(gltf, primitive, geometry, semantic);
        }
    }
    var indicesId = primitive.indices;
    var indicesAccessor = gltf.accessors[indicesId];
    writeAccessor(gltf, indicesAccessor, geometry.indices);
    mergeBuffers(gltf, 'buffer_0');
    uninterleaveAndPackBuffers(gltf);
}
