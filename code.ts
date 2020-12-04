// This shows the HTML page in "ui.html".
figma.showUI(__html__);

let stateGroupMap = new Map<MapKeyType, Transformation[][]>()
stateGroupMap.set({ properties: [], values: [] }, [[]])

let nodeForBase = null

interface MapKeyType {
  properties: string[],
  values: string[]
}

enum TransformationType {
  Insert,
  Delete,
  Modify,
  Replace,
}

interface Transformation {
  transformationType: TransformationType,
  path: number[],
  insertPayload?: any,
  modifyPayload?: object,
  replacePayload?: object
}

function cartesianOrder(children: readonly SceneNode[]): SceneNode[] {
  let arrayCopy = [...children]
  arrayCopy.sort((a, b) => {
    return a.y - b.y === 0 ?
      a.x - b.x :
      a.y - b.y
  })
  return arrayCopy
}



function setNodeValue(node: SceneNode, propKey: string, value: any) {
  switch (propKey) {
    case 'height':
      node.resize(node.width, value)
      break
    case 'width':
      node.resize(value, node.height)
      break
    case 'mainComponent':
      node['mainComponent'] = figma.getNodeById(value['id']) as ComponentNode
      break
    default:
      node[propKey] = value
      break
  }
}

// need to actually use the path when comparing
function applyTransformation(node: SceneNode, transformation: Transformation, path = [0]): SceneNode {
  if (arraysEqual(transformation.path, path)) {
    if (transformation.transformationType == TransformationType.Modify) {
      for (const propKey of Object.keys(transformation.modifyPayload)) {
        const value = transformation.modifyPayload[propKey]
        setNodeValue(node, propKey, value)
      }
    } else if (transformation.transformationType == TransformationType.Replace) {
      let newNode = node
      console.log("have new type " + transformation.replacePayload['newType'])
      switch (transformation.replacePayload['newType']) {
        case 'RECTANGLE':
          newNode = figma.createRectangle()
          break
        case 'STAR':
          newNode = figma.createStar()
          break
        case 'ELLIPSE':
          newNode = figma.createEllipse()
          break
        case 'POLYGON':
          newNode = figma.createPolygon()
          break
        case 'INSTANCE':
          const mainComponent = transformation.replacePayload['differentValues']['mainComponent']
          newNode = (figma.getNodeById(mainComponent['id']) as ComponentNode).createInstance()
          delete transformation.replacePayload['differentValues']['mainComponent']
          break
      }
      for (const item of transformation.replacePayload['differentValues']) {
        console.log("diff " + item['prop'])
        setNodeValue(newNode, item['prop'], item['value'])
      }
      for (const item of transformation.replacePayload['sameValues']) {
        console.log("same " + item['prop'])
        const value = node[item['prop']]
        setNodeValue(newNode, item['prop'], value)
      }
      let index = 0
      for (let i = 0; i < node.parent.children.length; i++) {
        if (node.parent.children[i] === node) {
          index = i
          break
        }
      }
      console.log("got index " + index)
      let oldX = node.x
      let oldY = node.y
      let oldParent = node.parent
      console.log("pre remove")
      console.log(node)
      node.remove()
      console.log("post remove")
      oldParent.insertChild(index, newNode)
      console.log("post insert")
      newNode.x = oldX
      newNode.y = oldY
      return newNode
    }
  } else if (node.type == "FRAME" || node.type == "GROUP" || node.type == "INSTANCE" || node.type == "COMPONENT") {
    const orderedNodeChildren = cartesianOrder(node.children)
    for (let i = 0; i < node.children.length; i++) {
        applyTransformation(orderedNodeChildren[i], transformation, [...path, i])
      }
  }
  return node
}

interface QueueType {
  base: SceneNode,
  compare: SceneNode,
  path: number[],
  insideInstance: boolean
}

function isEquivalent(a, b, stack_depth=0) {
  if (stack_depth > 5) {
    return true
  }

  if (typeof a === typeof b && typeof a === 'string') {
    return a === b
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
      return arraysEqual(a, b)
    }
    return a === b
  }

  for (var i = 0; i < aProps.length; i++) {
      var propName = aProps[i];

      // If values of same property are not equal,
      // objects are not equivalent
      if (Array.isArray(a[propName]) && !arraysEqual(a[propName], b[propName])) {
        return false
      }
      else if (!Array.isArray(a[propName]) && !isEquivalent(a[propName], b[propName], stack_depth + 1)) {
        return false;
      }
  }
  return true;
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;

  for (var i = 0; i < a.length; ++i) {
    if (!isEquivalent(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

function addChanges(base, compare, changes, properties) {
  for (const prop of properties) {
    const baseValue = prop === 'mainComponent' ? { id: base[prop].id } : base[prop]
    const compareValue = prop === 'mainComponent' ? { id: compare[prop].id } : compare[prop]
    if (prop === 'mainComponent') {
      console.log(compareValue)
      console.log(baseValue)
      console.log(isEquivalent(baseValue, compareValue))
    }
    if ((Array.isArray(base[prop]) && !arraysEqual(baseValue, compareValue)) ||
      (!Array.isArray(base[prop]) && !isEquivalent(baseValue, compareValue))) {
      changes[prop] = compare[prop]
    }
  }
}

const sceneNodeProperties = ['width', 'height', 'visible', 'rotation', 'x', 'y']
const blendProperties = ['opacity', 'blendMode', 'isMask', 'effects', 'effectsStyleId']
const cornerProperties = ['cornerRadius', 'cornerSmoothing']
const geometryProperties = ['fills', 'strokes', 'strokeWeight', 'strokeMiterLimit', 'strokeAlign', 'strokeCap', 'strokeJoin',
  'dashPattern', 'fillStyleId', 'strokeStyleId']

const frameProperties = ['clipsContent', 'guides', 'layoutGrids', 'gridStyleId', 'layoutMode', 'primaryAxisSizingMode',
 'counterAxisSizingMode', 'primaryAxisAlignItems', 'counterAxisAlignItems', 'paddingLeft', 'paddingRight',
  'paddingTop', 'paddingBottom', 'itemSpacing']

const rectangleFrameProperties = ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']
const instanceProperties = ['mainComponent', 'scaleFactor']
const starProperties = ['pointCount', 'innerRadius']
const polygonProperties = ['pointCount']
const nonOverridable = ['width', 'height', 'rotation', 'x', 'y']

// TODO: handle all cases
const typeToProperties = {
  "FRAME": [...sceneNodeProperties, ...frameProperties, ...geometryProperties, ...cornerProperties,
    ...rectangleFrameProperties],
  "RECTANGLE": [...sceneNodeProperties, ...geometryProperties, ...cornerProperties,
    ...rectangleFrameProperties],
  "POLYGON": [...sceneNodeProperties, ...geometryProperties, ...cornerProperties, ...polygonProperties],
  "STAR": [...sceneNodeProperties, ...geometryProperties, ...cornerProperties, ...starProperties],
  "ELLIPSE": [...sceneNodeProperties, ...geometryProperties, ...cornerProperties],
  "INSTANCE": [...sceneNodeProperties, ...geometryProperties, ...cornerProperties,
    ...instanceProperties]
}

const interchangeableTypes = ['RECTANGLE', 'STAR', 'ELLIPSE', 'POLYGON']

function findTransformations(inputNode: SceneNode, outputNode: SceneNode): Transformation[] {
  if (!nodeForBase) {
    nodeForBase = inputNode
  }
  let transformations: Transformation[] = []
  let q: QueueType[] = [ { base: inputNode, compare: outputNode, path: [0], insideInstance: false }]
  while (q.length > 0) {
    let { base, compare, path, insideInstance } = q.pop()
    if (base.type == compare.type || insideInstance) {
      let changes = {}
      const baseTypes = typeToProperties[base.type] ? typeToProperties[base.type] : sceneNodeProperties
      const compareTypes = typeToProperties[compare.type] ? typeToProperties[compare.type] : sceneNodeProperties

      let nodeProperties = compareTypes.filter(prop => baseTypes.includes(prop))
      if (insideInstance) {
        nodeProperties = nodeProperties.filter(prop => nonOverridable.indexOf(prop) == -1)
      }
      addChanges(base, compare, changes, nodeProperties)
      if (Object.keys(changes).length > 0) {
        transformations.push({ transformationType: TransformationType.Modify, path: path, modifyPayload: changes })
      }

      // TODO - could add hierarchy checking here if different instances
      // const differentInstance = (base.type == 'INSTANCE' && compare.type === 'INSTANCE' &&
      //   compare.mainComponent !== base.mainComponent)
      // dumb typescript why do i have to do this
      if ((compare.type == "FRAME" || compare.type == "GROUP" || compare.type == "INSTANCE" || compare.type == "COMPONENT") &&
        (base.type == "FRAME" || base.type == "GROUP" || base.type == "INSTANCE" || base.type == "COMPONENT") &&
        true/*!differentInstance*/) {
        const orderedBaseChildren = cartesianOrder(base.children)
        const orderedCompareChildren = cartesianOrder(compare.children)
        for (let i = 0; i < base.children.length; i++) {
          q = [{
            base: orderedBaseChildren[i],
            compare: orderedCompareChildren[i],
            path: [...path, i],
            insideInstance: insideInstance || base.type === 'INSTANCE'
          }, ...q]
        }
      }
    } else {
      if (interchangeableTypes.indexOf(base.type) != -1 && interchangeableTypes.indexOf(compare.type) != -1) {
        const baseTypes = typeToProperties[base.type] ? typeToProperties[base.type] : sceneNodeProperties
        const compareTypes = typeToProperties[compare.type] ? typeToProperties[compare.type] : sceneNodeProperties

        const commonTypes = compareTypes.filter(prop => baseTypes.includes(prop))
        const uniqueTypes = compareTypes.filter(prop => !baseTypes.includes(prop))

        let sameValues = []
        let differentValues = []

        for (const prop of commonTypes) {
          if ((Array.isArray(base[prop]) && !arraysEqual(base[prop], compare[prop])) ||
            (!Array.isArray(base[prop]) && !isEquivalent(base[prop], compare[prop]))) {
              differentValues.push({ prop: prop, value: compare[prop] })
          } else {
            sameValues.push({ prop: prop, value: compare[prop] })
          }
        }
        for (const prop of uniqueTypes) {
          differentValues.push({ prop: prop, value: compare[prop] })
        }
        let newObject = {
          newType: compare.type,
          sameValues: sameValues,
          differentValues: differentValues
        }
        transformations.push({ transformationType: TransformationType.Replace, path: path, replacePayload: newObject })
      }
    }
  }
  return transformations
}

figma.ui.onmessage = msg => {
  if (msg.type === 'add-property') {
    let newStateGroupMap = new Map()
    const propertyName = msg.name
    const selection = cartesianOrder(figma.currentPage.selection)
    const baseNode = selection[0]
    for (const node of selection) {
      const transformations = findTransformations(baseNode, node)
      stateGroupMap.forEach((value: Transformation[][], key: MapKeyType, map) => {
        const newKey = {
          properties: [...key.properties, propertyName],
          values: [...key.values, node.name]
        }
        const newTransformations = [...value, transformations]
        newStateGroupMap.set(newKey, newTransformations)
      })
    }
    stateGroupMap = newStateGroupMap
    stateGroupMap.forEach((value, key) => {
      console.log(value)
      console.log(key)
    })

  } else if (msg.type === 'generate-group') {
    let allComponents = []
    let currX = 0
    let currY = 0
    let count = 0
    let maxY = 0
    stateGroupMap.forEach((transformations, nameParts) => {
      count += 1
      let component = figma.createComponent()
      let name = nameParts.properties[0] + "=" + nameParts.values[0]
      for (let i = 1; i < nameParts.properties.length; i++) {
        name += ", "
        name += nameParts.properties[i] + "=" + nameParts.values[i]
      }
      component.name = name
      let baseNode = nodeForBase.clone()
      for (const transformList of transformations) {
        for (const transform of transformList) {
          baseNode = applyTransformation(baseNode, transform)
        }
      }
      component.resize(baseNode.width, baseNode.height)
      component.appendChild(baseNode)
      component.x = currX
      component.y = currY
      baseNode.x = 0
      baseNode.y = 0
      allComponents.push(component)

      currX += component.width + 100
      maxY = Math.max(maxY, component.height)
      if (count % 8 == 0) {
        currX = 0
        currY += maxY + 100
      }
    })
    figma.combineAsVariants(allComponents, figma.currentPage)
    figma.closePlugin();
  }
};
