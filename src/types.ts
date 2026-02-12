export type Status = {
  type: "info" | "success" | "error";
  message: string;
};

export type TransformMatrix = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type GeometryData = {
  position: Float32Array;
  normal?: Float32Array;
};

export const MAX_FILE_SIZE_MB = 200;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const formatSize = (bytes: number) =>
  `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export const isGlbFile = (file: File) => file.name.toLowerCase().endsWith(".glb");

export const createTransformMatrix = (
  x: number,
  y: number,
  z: number,
  scale: number = 1,
): TransformMatrix =>
  [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, x, y, z, 1] as TransformMatrix;
