/**
 * PLY Pipeline
 * Process PLY files (traditional mesh and Gaussian splats) for Three.js games
 */

export type PlyFormat = 'ascii' | 'binary_little_endian' | 'binary_big_endian';

export type PlyPropertyType =
  | 'char' | 'uchar'
  | 'short' | 'ushort'
  | 'int' | 'uint'
  | 'float' | 'double';

export interface PlyProperty {
  name: string;
  type: PlyPropertyType;
  listCountType?: PlyPropertyType;
  listItemType?: PlyPropertyType;
}

export interface PlyElement {
  name: string;
  count: number;
  properties: PlyProperty[];
}

export interface PlyHeader {
  format: PlyFormat;
  version: string;
  comments: string[];
  elements: PlyElement[];
  headerEndOffset: number;
}

export interface PlyVertexData {
  positions: Float32Array;
  colors?: Uint8Array;
  normals?: Float32Array;
  
  scales?: Float32Array;
  rotations?: Float32Array;
  opacities?: Float32Array;
  sphericalHarmonics?: Float32Array;
}

export interface PlyMetadata {
  vertexCount: number;
  hasColors: boolean;
  hasNormals: boolean;
  isGaussianSplat: boolean;
  
  bounds?: {
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
    size: [number, number, number];
  };
  
  source?: string;
  captureDate?: string;
}

export interface PlyData {
  header: PlyHeader;
  metadata: PlyMetadata;
  vertices: PlyVertexData;
}

/**
 * Parse PLY file buffer
 */
export async function parsePly(buffer: ArrayBuffer): Promise<PlyData> {
  const header = parsePlyHeader(buffer);
  const vertices = parsePlyVertices(buffer, header);
  const metadata = analyzePlyData(header, vertices);

  return { header, metadata, vertices };
}

/**
 * Parse PLY header
 */
function parsePlyHeader(buffer: ArrayBuffer): PlyHeader {
  const decoder = new TextDecoder('utf-8');
  const headerBytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 10000));
  const headerText = decoder.decode(headerBytes);
  
  const lines = headerText.split('\n');
  
  if (lines[0].trim() !== 'ply') {
    throw new Error('Invalid PLY file: missing magic number');
  }

  const header: PlyHeader = {
    format: 'ascii',
    version: '1.0',
    comments: [],
    elements: [],
    headerEndOffset: 0,
  };

  let currentElement: PlyElement | null = null;
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
        header.format = parts[1] as PlyFormat;
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
            type: parts[3] as PlyPropertyType,
            listCountType: parts[2] as PlyPropertyType,
            listItemType: parts[3] as PlyPropertyType,
          });
        } else {
          currentElement.properties.push({
            name: parts[2],
            type: parts[1] as PlyPropertyType,
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
 */
function parsePlyVertices(buffer: ArrayBuffer, header: PlyHeader): PlyVertexData {
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
 */
function hasProperty(props: PlyProperty[], names: string[]): boolean {
  return names.every(name => props.some(p => p.name === name));
}

/**
 * Parse ASCII format vertices
 */
function parseAsciiVertices(
  buffer: ArrayBuffer,
  header: PlyHeader,
  element: PlyElement,
  data: PlyVertexData
): void {
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
 */
function parseBinaryVertices(
  buffer: ArrayBuffer,
  header: PlyHeader,
  element: PlyElement,
  data: PlyVertexData
): void {
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
 */
function getPropertySize(type: PlyPropertyType): number {
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
 */
function readProperty(view: DataView, offset: number, type: PlyPropertyType, littleEndian: boolean): number {
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
 */
function analyzePlyData(header: PlyHeader, vertices: PlyVertexData): PlyMetadata {
  const vertexElement = header.elements.find(e => e.name === 'vertex')!;
  const props = vertexElement.properties;

  const metadata: PlyMetadata = {
    vertexCount: vertexElement.count,
    hasColors: !!vertices.colors,
    hasNormals: !!vertices.normals,
    isGaussianSplat: !!vertices.scales && !!vertices.rotations,
  };

  const sourceComment = header.comments.find(c => c.includes('http') || c.includes('Created'));
  if (sourceComment) {
    metadata.source = sourceComment;
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

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
 */
export interface OptimizedPlyData {
  positions: Float32Array;
  colors?: Float32Array;
  normals?: Float32Array;
  metadata: PlyMetadata;
}

export function optimizeForThreeJs(plyData: PlyData): OptimizedPlyData {
  const optimized: OptimizedPlyData = {
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
 */
export function decimatePly(plyData: PlyData, factor: number): PlyData {
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
 */
export function centerAndScale(plyData: PlyData, targetSize: number = 10): PlyData {
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
 */
export function toJSON(plyData: PlyData): string {
  return JSON.stringify({
    metadata: plyData.metadata,
    positions: Array.from(plyData.vertices.positions),
    colors: plyData.vertices.colors ? Array.from(plyData.vertices.colors) : undefined,
    normals: plyData.vertices.normals ? Array.from(plyData.vertices.normals) : undefined,
  });
}

/**
 * Generate summary statistics
 */
export function generateStats(plyData: PlyData): string {
  const { metadata } = plyData;
  const bounds = metadata.bounds!;
  
  const lines: string[] = [
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
