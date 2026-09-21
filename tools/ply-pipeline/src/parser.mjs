/**
 * PLY Pipeline
 * Process PLY files (traditional mesh and Gaussian splats) for Three.js games
 */

/**
 * Parse PLY file buffer
 * @param {ArrayBuffer} buffer 
 * @returns {Promise<object>}
 */
export async function parsePly(buffer) {
  const header = parsePlyHeader(buffer);
  const vertices = parsePlyVertices(buffer, header);
  const metadata = analyzePlyData(header, vertices);

  return { header, metadata, vertices };
}

/**
 * Parse PLY header
 * @param {ArrayBuffer} buffer 
 * @returns {object}
 */
function parsePlyHeader(buffer) {
  const decoder = new TextDecoder('utf-8');
  const headerBytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 10000));
  const headerText = decoder.decode(headerBytes);
  
  const lines = headerText.split('\n');
  
  if (lines[0].trim() !== 'ply') {
    throw new Error('Invalid PLY file: missing magic number');
  }

  const header = {
    format: 'ascii',
    version: '1.0',
    comments: [],
    elements: [],
    headerEndOffset: 0,
  };

  let currentElement = null;
  let headerEndLine = -1;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line === 'end_header') {
      headerEndLine = i;
      break;
    }

    const parts = line.split(/\s+/);
    const keyword = parts[0];

    switch (keyword) {
      case 'format':
        header.format = parts[1];
        header.version = parts[2];
        break;

      case 'comment':
        header.comments.push(line.substring(8).trim());
        break;

      case 'element':
        currentElement = {
          name: parts[1],
          count: parseInt(parts[2], 10),
          properties: [],
        };
        header.elements.push(currentElement);
        break;

      case 'property':
        if (!currentElement) {
          throw new Error('Property defined before element');
        }
        
        if (parts[1] === 'list') {
          currentElement.properties.push({
            name: parts[4],
            type: parts[3],
            listCountType: parts[2],
            listItemType: parts[3],
          });
        } else {
          currentElement.properties.push({
            name: parts[2],
            type: parts[1],
          });
        }
        break;
    }
  }

  if (headerEndLine === -1) {
    throw new Error('Invalid PLY file: missing end_header');
  }

  const headerStr = lines.slice(0, headerEndLine + 1).join('\n') + '\n';
  header.headerEndOffset = new TextEncoder().encode(headerStr).length;

  return header;
}

/**
 * Parse PLY vertex data
 * @param {ArrayBuffer} buffer 
 * @param {object} header 
 * @returns {object}
 */
function parsePlyVertices(buffer, header) {
  const vertexElement = header.elements.find(e => e.name === 'vertex');
  if (!vertexElement) {
    throw new Error('No vertex element found in PLY file');
  }

  const count = vertexElement.count;
  const props = vertexElement.properties;

  const positions = new Float32Array(count * 3);
  const colors = hasProperty(props, ['red', 'green', 'blue']) ? new Uint8Array(count * 3) : undefined;
  const normals = hasProperty(props, ['nx', 'ny', 'nz']) ? new Float32Array(count * 3) : undefined;
  
  const scales = hasProperty(props, ['scale_0', 'scale_1', 'scale_2']) ? new Float32Array(count * 3) : undefined;
  const rotations = hasProperty(props, ['rot_0', 'rot_1', 'rot_2', 'rot_3']) ? new Float32Array(count * 4) : undefined;
  const opacities = hasProperty(props, ['opacity']) ? new Float32Array(count) : undefined;

  if (header.format === 'ascii') {
    parseAsciiVertices(buffer, header, vertexElement, { positions, colors, normals, scales, rotations, opacities });
  } else {
    parseBinaryVertices(buffer, header, vertexElement, { positions, colors, normals, scales, rotations, opacities });
  }

  return { positions, colors, normals, scales, rotations, opacities };
}

/**
 * Check if properties exist
 * @param {Array} props 
 * @param {string[]} names 
 * @returns {boolean}
 */
function hasProperty(props, names) {
  return names.every(name => props.some(p => p.name === name));
}

/**
 * Parse ASCII format vertices
 * @param {ArrayBuffer} buffer 
 * @param {object} header 
 * @param {object} element 
 * @param {object} data 
 */
function parseAsciiVertices(buffer, header, element, data) {
  const decoder = new TextDecoder('utf-8');
  const text = decoder.decode(new Uint8Array(buffer, header.headerEndOffset));
  const lines = text.split('\n').filter(l => l.trim());

  const props = element.properties;
  const xIdx = props.findIndex(p => p.name === 'x');
  const yIdx = props.findIndex(p => p.name === 'y');
  const zIdx = props.findIndex(p => p.name === 'z');
  const rIdx = props.findIndex(p => p.name === 'red');
  const gIdx = props.findIndex(p => p.name === 'green');
  const bIdx = props.findIndex(p => p.name === 'blue');

  for (let i = 0; i < Math.min(lines.length, element.count); i++) {
    const values = lines[i].trim().split(/\s+/).map(v => parseFloat(v));
    
    data.positions[i * 3 + 0] = values[xIdx];
    data.positions[i * 3 + 1] = values[yIdx];
    data.positions[i * 3 + 2] = values[zIdx];

    if (data.colors && rIdx >= 0) {
      data.colors[i * 3 + 0] = Math.floor(values[rIdx]);
      data.colors[i * 3 + 1] = Math.floor(values[gIdx]);
      data.colors[i * 3 + 2] = Math.floor(values[bIdx]);
    }
  }
}

/**
 * Parse binary format vertices
 * @param {ArrayBuffer} buffer 
 * @param {object} header 
 * @param {object} element 
 * @param {object} data 
 */
function parseBinaryVertices(buffer, header, element, data) {
  const view = new DataView(buffer, header.headerEndOffset);
  const littleEndian = header.format === 'binary_little_endian';
  
  const props = element.properties;
  let stride = 0;
  
  const propertyOffsets = props.map(p => {
    const offset = stride;
    stride += getPropertySize(p.type);
    return offset;
  });

  const xIdx = props.findIndex(p => p.name === 'x');
  const yIdx = props.findIndex(p => p.name === 'y');
  const zIdx = props.findIndex(p => p.name === 'z');
  const rIdx = props.findIndex(p => p.name === 'red');
  const gIdx = props.findIndex(p => p.name === 'green');
  const bIdx = props.findIndex(p => p.name === 'blue');

  for (let i = 0; i < element.count; i++) {
    const baseOffset = i * stride;

    data.positions[i * 3 + 0] = readProperty(view, baseOffset + propertyOffsets[xIdx], props[xIdx].type, littleEndian);
    data.positions[i * 3 + 1] = readProperty(view, baseOffset + propertyOffsets[yIdx], props[yIdx].type, littleEndian);
    data.positions[i * 3 + 2] = readProperty(view, baseOffset + propertyOffsets[zIdx], props[zIdx].type, littleEndian);

    if (data.colors && rIdx >= 0) {
      data.colors[i * 3 + 0] = readProperty(view, baseOffset + propertyOffsets[rIdx], props[rIdx].type, littleEndian);
      data.colors[i * 3 + 1] = readProperty(view, baseOffset + propertyOffsets[gIdx], props[gIdx].type, littleEndian);
      data.colors[i * 3 + 2] = readProperty(view, baseOffset + propertyOffsets[bIdx], props[bIdx].type, littleEndian);
    }
  }
}

/**
 * Get property size in bytes
 * @param {string} type 
 * @returns {number}
 */
function getPropertySize(type) {
  switch (type) {
    case 'char':
    case 'uchar':
      return 1;
    case 'short':
    case 'ushort':
      return 2;
    case 'int':
    case 'uint':
    case 'float':
      return 4;
    case 'double':
      return 8;
    default:
      return 0;
  }
}

/**
 * Read property value from DataView
 * @param {DataView} view 
 * @param {number} offset 
 * @param {string} type 
 * @param {boolean} littleEndian 
 * @returns {number}
 */
function readProperty(view, offset, type, littleEndian) {
  switch (type) {
    case 'char':
      return view.getInt8(offset);
    case 'uchar':
      return view.getUint8(offset);
    case 'short':
      return view.getInt16(offset, littleEndian);
    case 'ushort':
      return view.getUint16(offset, littleEndian);
    case 'int':
      return view.getInt32(offset, littleEndian);
    case 'uint':
      return view.getUint32(offset, littleEndian);
    case 'float':
      return view.getFloat32(offset, littleEndian);
    case 'double':
      return view.getFloat64(offset, littleEndian);
    default:
      return 0;
  }
}

/**
 * Analyze PLY data and compute metadata
 * @param {object} header 
 * @param {object} vertices 
 * @returns {object}
 */
function analyzePlyData(header, vertices) {
  const vertexElement = header.elements.find(e => e.name === 'vertex');
  const props = vertexElement.properties;

  const metadata = {
    vertexCount: vertexElement.count,
    hasColors: !!vertices.colors,
    hasNormals: !!vertices.normals,
    isGaussianSplat: !!vertices.scales && !!vertices.rotations,
  };

  const sourceComment = header.comments.find(c => c.includes('http') || c.includes('Created'));
  if (sourceComment) {
    metadata.source = sourceComment;
  }

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < vertices.positions.length / 3; i++) {
    const x = vertices.positions[i * 3 + 0];
    const y = vertices.positions[i * 3 + 1];
    const z = vertices.positions[i * 3 + 2];

    min[0] = Math.min(min[0], x);
    min[1] = Math.min(min[1], y);
    min[2] = Math.min(min[2], z);
    max[0] = Math.max(max[0], x);
    max[1] = Math.max(max[1], y);
    max[2] = Math.max(max[2], z);
  }

  metadata.bounds = {
    min,
    max,
    center: [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ],
    size: [
      max[0] - min[0],
      max[1] - min[1],
      max[2] - min[2],
    ],
  };

  return metadata;
}

/**
 * Optimize PLY data for Three.js
 * @param {object} plyData 
 * @returns {object}
 */
export function optimizeForThreeJs(plyData) {
  const optimized = {
    positions: plyData.vertices.positions,
    metadata: plyData.metadata,
  };

  if (plyData.vertices.colors) {
    const colors = new Float32Array(plyData.vertices.colors.length);
    for (let i = 0; i < plyData.vertices.colors.length; i++) {
      colors[i] = plyData.vertices.colors[i] / 255;
    }
    optimized.colors = colors;
  }

  if (plyData.vertices.normals) {
    optimized.normals = plyData.vertices.normals;
  }

  return optimized;
}

/**
 * Decimate point cloud by factor
 * @param {object} plyData 
 * @param {number} factor 
 * @returns {object}
 */
export function decimatePly(plyData, factor) {
  if (factor <= 0 || factor > 1) {
    throw new Error('Decimation factor must be between 0 and 1');
  }

  const originalCount = plyData.metadata.vertexCount;
  const newCount = Math.floor(originalCount * factor);
  const step = 1 / factor;

  const newPositions = new Float32Array(newCount * 3);
  const newColors = plyData.vertices.colors ? new Uint8Array(newCount * 3) : undefined;
  const newNormals = plyData.vertices.normals ? new Float32Array(newCount * 3) : undefined;

  for (let i = 0; i < newCount; i++) {
    const srcIdx = Math.floor(i * step);
    
    newPositions[i * 3 + 0] = plyData.vertices.positions[srcIdx * 3 + 0];
    newPositions[i * 3 + 1] = plyData.vertices.positions[srcIdx * 3 + 1];
    newPositions[i * 3 + 2] = plyData.vertices.positions[srcIdx * 3 + 2];

    if (newColors && plyData.vertices.colors) {
      newColors[i * 3 + 0] = plyData.vertices.colors[srcIdx * 3 + 0];
      newColors[i * 3 + 1] = plyData.vertices.colors[srcIdx * 3 + 1];
      newColors[i * 3 + 2] = plyData.vertices.colors[srcIdx * 3 + 2];
    }

    if (newNormals && plyData.vertices.normals) {
      newNormals[i * 3 + 0] = plyData.vertices.normals[srcIdx * 3 + 0];
      newNormals[i * 3 + 1] = plyData.vertices.normals[srcIdx * 3 + 1];
      newNormals[i * 3 + 2] = plyData.vertices.normals[srcIdx * 3 + 2];
    }
  }

  return {
    ...plyData,
    vertices: {
      ...plyData.vertices,
      positions: newPositions,
      colors: newColors,
      normals: newNormals,
    },
    metadata: {
      ...plyData.metadata,
      vertexCount: newCount,
    },
  };
}

/**
 * Center and scale PLY data
 * @param {object} plyData 
 * @param {number} targetSize 
 * @returns {object}
 */
export function centerAndScale(plyData, targetSize = 10) {
  if (!plyData.metadata.bounds) {
    return plyData;
  }

  const { center, size } = plyData.metadata.bounds;
  const maxSize = Math.max(...size);
  const scale = targetSize / maxSize;

  const positions = new Float32Array(plyData.vertices.positions.length);
  
  for (let i = 0; i < positions.length / 3; i++) {
    positions[i * 3 + 0] = (plyData.vertices.positions[i * 3 + 0] - center[0]) * scale;
    positions[i * 3 + 1] = (plyData.vertices.positions[i * 3 + 1] - center[1]) * scale;
    positions[i * 3 + 2] = (plyData.vertices.positions[i * 3 + 2] - center[2]) * scale;
  }

  return {
    ...plyData,
    vertices: {
      ...plyData.vertices,
      positions,
    },
  };
}

/**
 * Export to JSON (for small models only!)
 * @param {object} plyData 
 * @returns {string}
 */
export function toJSON(plyData) {
  return JSON.stringify({
    metadata: plyData.metadata,
    positions: Array.from(plyData.vertices.positions),
    colors: plyData.vertices.colors ? Array.from(plyData.vertices.colors) : undefined,
    normals: plyData.vertices.normals ? Array.from(plyData.vertices.normals) : undefined,
  });
}

/**
 * Generate summary statistics
 * @param {object} plyData 
 * @returns {string}
 */
export function generateStats(plyData) {
  const { metadata } = plyData;
  const bounds = metadata.bounds;
  
  const lines = [
    '=== PLY File Statistics ===',
    '',
    `Vertices: ${metadata.vertexCount.toLocaleString()}`,
    `Format: ${plyData.header.format}`,
    `Has Colors: ${metadata.hasColors ? 'Yes' : 'No'}`,
    `Has Normals: ${metadata.hasNormals ? 'Yes' : 'No'}`,
    `Gaussian Splat: ${metadata.isGaussianSplat ? 'Yes' : 'No'}`,
    '',
    'Bounding Box:',
    `  Min: [${bounds.min.map(v => v.toFixed(3)).join(', ')}]`,
    `  Max: [${bounds.max.map(v => v.toFixed(3)).join(', ')}]`,
    `  Center: [${bounds.center.map(v => v.toFixed(3)).join(', ')}]`,
    `  Size: [${bounds.size.map(v => v.toFixed(3)).join(', ')}]`,
    '',
    `File Size: ${(plyData.header.headerEndOffset + (metadata.vertexCount * (metadata.hasColors ? 24 : 12))).toLocaleString()} bytes (estimated)`,
  ];

  if (metadata.source) {
    lines.push('', `Source: ${metadata.source}`);
  }

  if (plyData.header.comments.length > 0) {
    lines.push('', 'Comments:');
    plyData.header.comments.forEach(c => lines.push(`  ${c}`));
  }

  return lines.join('\n');
}
