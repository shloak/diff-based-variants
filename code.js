// This shows the HTML page in "ui.html".
figma.showUI(__html__);
let stateGroupMap = new Map();
stateGroupMap.set({ properties: [], values: [] }, [[]]);
let nodeForBase = null;
var TransformationType;
(function (TransformationType) {
    TransformationType[TransformationType["Insert"] = 0] = "Insert";
    TransformationType[TransformationType["Delete"] = 1] = "Delete";
    TransformationType[TransformationType["Modify"] = 2] = "Modify";
})(TransformationType || (TransformationType = {}));
// need to actually use the path when comparing
function applyTransformation(node, transformation) {
    if (transformation.transformationType == TransformationType.Modify) {
        for (const propKey of Object.keys(transformation.modifyPayload)) {
            const value = transformation.modifyPayload[propKey];
            switch (propKey) {
                case 'height':
                    node.resize(node.width, value);
                    break;
                case 'width':
                    node.resize(value, node.height);
                    break;
                default:
                    node[propKey] = value;
                    break;
            }
        }
    }
}
function isEquivalent(a, b, stack_depth = 0) {
    if (stack_depth > 5) {
        return true;
    }
    // Create arrays of property names
    var aProps = Object.getOwnPropertyNames(a);
    var bProps = Object.getOwnPropertyNames(b);
    // If number of properties is different,
    // objects are not equivalent
    if (aProps.length != bProps.length) {
        return false;
    }
    if (aProps.length === 0) {
        if (Array.isArray(a)) {
            return arraysEqual(a, b);
        }
        return a === b;
    }
    for (var i = 0; i < aProps.length; i++) {
        var propName = aProps[i];
        // If values of same property are not equal,
        // objects are not equivalent
        if (Array.isArray(a[propName]) && !arraysEqual(a[propName], b[propName])) {
            return false;
        }
        else if (!Array.isArray(a[propName]) && !isEquivalent(a[propName], b[propName], stack_depth + 1)) {
            return false;
        }
    }
    return true;
}
function arraysEqual(a, b) {
    if (a === b)
        return true;
    if (a == null || b == null)
        return false;
    if (a.length !== b.length)
        return false;
    for (var i = 0; i < a.length; ++i) {
        if (!isEquivalent(a[i], b[i])) {
            return false;
        }
    }
    return true;
}
function addChanges(base, compare, changes, properties) {
    for (const prop of properties) {
        if ((Array.isArray(base[prop]) && !arraysEqual(base[prop], compare[prop])) ||
            (!Array.isArray(base[prop]) && !isEquivalent(base[prop], compare[prop]))) {
            changes[prop] = compare[prop];
        }
    }
}
const sceneNodeProperties = ['width', 'height', 'visible', 'rotation'];
const blendProperties = ['opacity', 'blendMode', 'isMask', 'effects', 'effectsStyleId'];
const cornerProperties = ['cornerRadius', 'cornerSmoothing'];
const geometryProperties = ['fills', 'strokes', 'strokeWeight', 'strokeMiterLimit', 'strokeAlign', 'strokeCap', 'strokeJoin',
    'dashPattern', 'fillStyleId', 'strokeStyleId', 'outlineStroke'];
const frameProperties = ['clipsContent', 'guides', 'layoutGrids', 'gridStyleId', 'layoutMode', 'primaryAxisSizingMode',
    'counterAxisSizingMode', 'primaryAxisAlignItems', 'counterAxisAlignItems', 'paddingLeft', 'paddingRight',
    'paddingTop', 'paddingBottom', 'itemSpacing'];
const rectangleFrameProperties = ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'];
function findTransformations(inputNode, outputNode) {
    if (!nodeForBase) {
        nodeForBase = inputNode;
    }
    let transformations = [];
    let q = [{ base: inputNode, compare: outputNode, path: [0] }];
    while (q.length > 0) {
        let { base, compare, path } = q.pop();
        if (base.type == compare.type) {
            let changes = {};
            let nodeProperties = [];
            switch (base.type) {
                case 'FRAME':
                    nodeProperties = [...sceneNodeProperties, ...frameProperties, ...geometryProperties, ...cornerProperties,
                        ...rectangleFrameProperties];
                    break;
                case 'RECTANGLE':
                    nodeProperties = [...sceneNodeProperties, ...geometryProperties, ...cornerProperties,
                        ...rectangleFrameProperties];
                    break;
                case 'POLYGON':
                case 'STAR':
                case "ELLIPSE":
                    nodeProperties = [...sceneNodeProperties, ...geometryProperties, ...cornerProperties,
                        ...rectangleFrameProperties];
                    break;
                default:
                    nodeProperties = [...sceneNodeProperties];
                    break;
            }
            addChanges(base, compare, changes, nodeProperties);
            if (Object.keys(changes).length > 0) {
                transformations.push({ transformationType: TransformationType.Modify, path: path, modifyPayload: changes });
            }
            // look at children
            // if (base.type == 'FRAME') {
            //   for (let i = 0; i < )
            // }
        }
    }
    return transformations;
}
figma.ui.onmessage = msg => {
    if (msg.type === 'add-property') {
        let newStateGroupMap = new Map();
        const propertyName = msg.name;
        const selection = figma.currentPage.selection;
        const baseNode = selection[0];
        for (const node of selection) {
            const transformations = findTransformations(baseNode, node);
            stateGroupMap.forEach((value, key, map) => {
                const newKey = {
                    properties: [...key.properties, propertyName],
                    values: [...key.values, node.name]
                };
                const newTransformations = [...value, transformations];
                newStateGroupMap.set(newKey, newTransformations);
            });
        }
        stateGroupMap = newStateGroupMap;
        stateGroupMap.forEach((value, key) => {
            console.log(value);
            console.log(key);
        });
    }
    else if (msg.type === 'generate-group') {
        let allComponents = [];
        let currX = 0;
        let currY = 0;
        let count = 0;
        let maxY = 0;
        stateGroupMap.forEach((transformations, nameParts) => {
            count += 1;
            let component = figma.createComponent();
            let name = nameParts.properties[0] + "=" + nameParts.values[0];
            for (let i = 1; i < nameParts.properties.length; i++) {
                name += ", ";
                name += nameParts.properties[i] + "=" + nameParts.values[i];
            }
            component.name = name;
            let baseNode = nodeForBase.clone();
            for (const transformList of transformations) {
                for (const transform of transformList) {
                    applyTransformation(baseNode, transform);
                }
            }
            component.resize(baseNode.width, baseNode.height);
            component.appendChild(baseNode);
            component.x = currX;
            component.y = currY;
            baseNode.x = 0;
            baseNode.y = 0;
            allComponents.push(component);
            currX += component.width + 100;
            maxY = Math.max(maxY, component.height);
            if (count % 8 == 0) {
                currX = 0;
                currY += maxY + 100;
            }
        });
        figma.combineAsVariants(allComponents, figma.currentPage);
        figma.closePlugin();
    }
};
