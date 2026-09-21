export type PlyFormat = 'ascii' | 'binary_little_endian' | 'binary_big_endian';
export type PlyPropertyType = 'char' | 'uchar' | 'short' | 'ushort' | 'int' | 'uint' | 'float' | 'double';

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

export interface OptimizedPlyData {
  positions: Float32Array;
  colors?: Float32Array;
  normals?: Float32Array;
  metadata: PlyMetadata;
}

export function parsePly(buffer: ArrayBuffer): Promise<PlyData>;
export function optimizeForThreeJs(plyData: PlyData): OptimizedPlyData;
export function decimatePly(plyData: PlyData, factor: number): PlyData;
export function centerAndScale(plyData: PlyData, targetSize?: number): PlyData;
export function toJSON(plyData: PlyData): string;
export function generateStats(plyData: PlyData): string;
