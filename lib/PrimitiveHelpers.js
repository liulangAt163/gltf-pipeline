'use strict';
var Cesium = require('cesium');
var deepEqual = require('deep-equal');
var AccessorReader = require('./AccessorReader');
var getPrimitiveAttributeSemantics = require('./getPrimitiveAttributeSemantics');
var readAccessor = require('./readAccessor');

var Cartesian3 = Cesium.Cartesian3;
var Matrix4 = Cesium.Matrix4;
var defined = Cesium.defined;

module.exports = {
    getAllPrimitives : getAllPrimitives,
    getPrimitivesByMaterialMode : getPrimitivesByMaterialMode,
    getPrimitiveConflicts : getPrimitiveConflicts,
    primitiveEquals : primitiveEquals,
    primitivesShareAttributeAccessor : primitivesShareAttributeAccessor,
    primitivesHaveOverlappingIndexAccessors : primitivesHaveOverlappingIndexAccessors,
    transformPrimitives : transformPrimitives
};

function primitivesShareAttributeAccessor(primitive, comparePrimitive) {
    var attributes = primitive.attributes;
    var compareAttributes = comparePrimitive.attributes;
    for (var attribute in attributes) {
        if (attributes.hasOwnProperty(attribute)) {
            if (compareAttributes.hasOwnProperty(attribute)) {
                if (attributes[attribute] === compareAttributes[attribute]) {
                    return true;
                }
            }
        }
    }
    return false;
}

function primitivesHaveOverlappingIndexAccessors(gltf, primitive, comparePrimitive) {
    var accessors = gltf.accessors;
    var indexAccessorId = primitive.indices;
    var compareIndexAccessorId = comparePrimitive.indices;
    if (!defined(indexAccessorId) || !defined(compareIndexAccessorId)) {
        return false;
    }
    if (indexAccessorId === compareIndexAccessorId) {
        return true;
    }
    var indexAccessor = accessors[indexAccessorId];
    var compareIndexAccessor = accessors[compareIndexAccessorId];
    var indices = [];
    readAccessor(gltf, indexAccessor, indices);
    var accessorReader = new AccessorReader(gltf, compareIndexAccessor);
    var value = [];

    while (!accessorReader.pastEnd()) {
        var index = accessorReader.read(value)[0];
        if (indices.indexOf(index) >= 0) {
            return true;
        }
        accessorReader.next();
    }
    return false;
}

function transformPrimitives(gltf, primitives, transform) {
    var inverseTranspose = new Matrix4();
    if (Matrix4.equals(transform, Matrix4.IDENTITY)) {
        return;
    }
    var accessors = gltf.accessors;
    Matrix4.inverseTransformation(transform, inverseTranspose);
    Matrix4.transpose(inverseTranspose, inverseTranspose);

    var scratchIndexArray = [];
    var scratchCartesianArray = [];
    var scratchCartesian = new Cartesian3();
    var doneIndicesByAccessor = {};

    var primitivesLength = primitives.length;
    for (var i = 0; i < primitivesLength; i++) {
        var primitive = primitives[i];
        var attributes = primitive.attributes;
        var indexAccessorReader;
        var index = 0;
        if (defined(primitive.indices)) {
            indexAccessorReader = new AccessorReader(gltf, accessors[primitive.indices]);
            indexAccessorReader.read(scratchIndexArray);
            index = scratchIndexArray[0];
        }
        var positionAccessorReader;
        var positionSemantics = getPrimitiveAttributeSemantics(primitive, 'POSITION');
        var positionAccessorId = attributes[positionSemantics[0]];
        if (positionSemantics.length > 0) {
            doneIndicesByAccessor[positionAccessorId] = {};
            positionAccessorReader = new AccessorReader(gltf, accessors[positionAccessorId]);
        }
        var normalAccessorReader;
        var normalSemantics = getPrimitiveAttributeSemantics(primitive, 'NORMAL');
        var normalAccessorId = attributes[normalSemantics[0]];
        if (normalSemantics.length > 0) {
            doneIndicesByAccessor[normalAccessorId] = {};
            normalAccessorReader = new AccessorReader(gltf, accessors[normalAccessorId]);
        }
        var keepReading = true;
        while (keepReading) {
            if (defined(positionAccessorReader) && !doneIndicesByAccessor[positionAccessorId][index]) {
                positionAccessorReader.index = index;
                positionAccessorReader.read(scratchCartesianArray);
                Cartesian3.unpack(scratchCartesianArray, 0, scratchCartesian);
                Matrix4.multiplyByPoint(transform, scratchCartesian, scratchCartesian);
                Cartesian3.pack(scratchCartesian, scratchCartesianArray);
                positionAccessorReader.write(scratchCartesianArray);
                doneIndicesByAccessor[positionAccessorId][index] = true;
            }
            if (defined(normalAccessorReader) && !doneIndicesByAccessor[normalAccessorId][index]) {
                normalAccessorReader.index = index;
                normalAccessorReader.read(scratchCartesianArray);
                Cartesian3.unpack(scratchCartesianArray, 0, scratchCartesian);
                Matrix4.multiplyByPointAsVector(inverseTranspose, scratchCartesian, scratchCartesian);
                Cartesian3.normalize(scratchCartesian, scratchCartesian);
                Cartesian3.pack(scratchCartesian, scratchCartesianArray);
                normalAccessorReader.write(scratchCartesianArray);
                doneIndicesByAccessor[normalAccessorId][index] = true;
            }
            if (defined(indexAccessorReader)) {
                if (!indexAccessorReader.pastEnd()) {
                    indexAccessorReader.next();
                    indexAccessorReader.read(scratchIndexArray);
                    index = scratchIndexArray[0];
                } else {
                    keepReading = false;
                }
            } else {
                if (!positionAccessorReader.pastEnd() && !normalAccessorReader.pastEnd()) {
                    index++;
                } else {
                    keepReading = false;
                }
            }
        }
    }
}

function getPrimitivesByMaterialMode(primitives) {
    var primitivesLength = primitives.length;
    var primitivesByMaterialMode = {};
    for (var i = 0; i < primitivesLength; i++) {
        var primitive = primitives[i];
        var materialId = primitive.material;
        var primitivesByMode = primitivesByMaterialMode[materialId];
        if (!defined(primitivesByMode)) {
            primitivesByMode = {};
            primitivesByMaterialMode[materialId] = primitivesByMode;
        }
        var mode = primitive.mode;
        var primitivesArray = primitivesByMode[mode];
        if (!defined(primitivesArray)) {
            primitivesArray = [];
            primitivesByMode[mode] = primitivesArray;
        }
        primitivesArray.push(primitive);
    }
    return primitivesByMaterialMode;
}

function getPrimitiveConflicts(primitives, primitive) {
    var primitivesLength = primitives.length;
    var conflicts = [];
    for (var i = 0; i < primitivesLength; i++) {
        var otherPrimitive = primitives[i];
        if (primitive !== otherPrimitive && primitivesShareAttributeAccessor(primitive, otherPrimitive)) {
            conflicts.push(i);
        }
    }
    return conflicts;
}

function getAllPrimitives(gltf) {
    var primitives = [];
    var meshes = gltf.meshes;
    for (var meshId in meshes) {
        if (meshes.hasOwnProperty(meshId)) {
            var mesh = meshes[meshId];
            primitives = primitives.concat(mesh.primitives);
        }
    }
    return primitives;
}

function primitiveEquals(primitiveOne, primitiveTwo) {
    return primitiveOne.mode === primitiveTwo.mode &&
            primitiveOne.material === primitiveTwo.material &&
            primitiveOne.indices === primitiveTwo.indices &&
            deepEqual(primitiveOne.attributes, primitiveTwo.attributes);
}